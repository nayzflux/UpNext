import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import {
  calendarSourceSchema,
  type CalendarSource,
  type ImportedEvent,
} from "@upnext/contracts";
import { db, type Connection } from "./db";
import { calendarSources, preferences } from "./db/schema";
import { expandImported, parseCalendar } from "./ical";

const hour = 3600000;
const maxBytes = 2 * 1024 * 1024;
const blocked = new BlockList();
for (const [base, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(base, prefix, "ipv4");
for (const [base, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10],
  ["ff00::", 8], ["2001:db8::", 32], ["2001::", 32], ["2002::", 16],
] as const) blocked.addSubnet(base, prefix, "ipv6");

export function normalizeSourceUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ORPCError("BAD_REQUEST", { message: "URL ICS invalide." }); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
    throw new ORPCError("BAD_REQUEST", { message: "Utilise une URL HTTPS publique sans identifiants." });
  }
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && !publicAddress(literal)) {
    throw new ORPCError("BAD_REQUEST", { message: "L’adresse du calendrier n’est pas publique." });
  }
  url.hash = "";
  return url.toString();
}

export function publicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    if (address.toLowerCase().startsWith("::ffff:")) return false;
    return !blocked.check(address, "ipv6") && /^[23]/.test(address);
  }
  return false;
}

type DownloadResult = { status: 200 | 304; content?: string; etag?: string | null; lastModified?: string | null };

async function resolvePublicAddress(hostname: string) {
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address))) {
    throw new Error("L’adresse du calendrier n’est pas publique.");
  }
  return addresses[0];
}

export async function downloadCalendar(urlText: string, etag?: string | null, modified?: string | null, redirects = 0): Promise<DownloadResult> {
  const url = new URL(normalizeSourceUrl(urlText));
  if (redirects > 3) throw new Error("Trop de redirections ICS.");
  const address = await resolvePublicAddress(url.hostname);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      timeout: 10000,
      headers: {
        Accept: "text/calendar, text/plain;q=0.8",
        ...(etag ? { "If-None-Match": etag } : {}),
        ...(modified ? { "If-Modified-Since": modified } : {}),
      },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, async (response) => {
      try {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const target = response.headers.location;
          response.resume();
          if (!target) throw new Error("Redirection ICS invalide.");
          clearTimeout(deadline);
          resolve(await downloadCalendar(new URL(target, url).toString(), etag, modified, redirects + 1));
          return;
        }
        if (status === 304) { response.resume(); resolve({ status: 304 }); return; }
        if (status !== 200) throw new Error(`Le calendrier a répondu avec le code ${status}.`);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > maxBytes) throw new Error("Le calendrier ICS dépasse 2 Mo.");
          chunks.push(bytes);
        }
        resolve({
          status: 200,
          content: Buffer.concat(chunks).toString("utf8"),
          etag: response.headers.etag ?? null,
          lastModified: response.headers["last-modified"] ?? null,
        });
      } catch (error) { reject(error); }
      finally { clearTimeout(deadline); }
    });
    req.on("timeout", () => req.destroy(new Error("Le calendrier ne répond pas assez vite.")));
    req.on("error", (error) => { clearTimeout(deadline); reject(error); });
    const deadline = setTimeout(() => req.destroy(new Error("Le calendrier ne répond pas assez vite.")), 10000);
    req.end();
  });
}

export function sourceToWire(row: Pick<typeof calendarSources.$inferSelect, "id" | "name" | "url" | "attemptedAt" | "succeededAt" | "error">): CalendarSource {
  return calendarSourceSchema.parse({
    id: row.id, name: row.name, url: row.url,
    attemptedAt: row.attemptedAt ? new Date(row.attemptedAt).toISOString() : null,
    succeededAt: row.succeededAt ? new Date(row.succeededAt).toISOString() : null,
    error: row.error,
  });
}

export async function createCalendarSource(userId: string, input: { name: string; url: string }) {
  const url = normalizeSourceUrl(input.url);
  try { await resolvePublicAddress(new URL(url).hostname); }
  catch { throw new ORPCError("BAD_REQUEST", { message: "L’adresse du calendrier n’est pas publique ou n’est pas joignable." }); }
  let saved: typeof calendarSources.$inferSelect;
  try {
    [saved] = await db.insert(calendarSources).values({ userId, name: input.name, url }).returning();
  } catch (error) {
    if (String(error).includes("calendar_sources_user_url_unique")) throw new ORPCError("CONFLICT", { message: "Ce calendrier est déjà ajouté." });
    throw error;
  }
  await syncCalendarSource(userId, saved.id, true);
  const [updated] = await db.select().from(calendarSources).where(and(eq(calendarSources.id, saved.id), eq(calendarSources.userId, userId)));
  return sourceToWire(updated);
}

export async function renameCalendarSource(userId: string, id: string, name: string) {
  const [row] = await db.update(calendarSources).set({ name }).where(and(eq(calendarSources.id, id), eq(calendarSources.userId, userId))).returning();
  if (!row) throw new ORPCError("NOT_FOUND");
  return sourceToWire(row);
}

export async function deleteCalendarSource(userId: string, id: string) {
  const rows = await db.delete(calendarSources).where(and(eq(calendarSources.id, id), eq(calendarSources.userId, userId))).returning();
  if (!rows.length) throw new ORPCError("NOT_FOUND");
  return { success: true as const };
}

export async function syncCalendarSource(userId: string, id: string, force = false, download = downloadCalendar) {
  const now = new Date();
  const due = new Date(now.getTime() - hour);
  const [source] = await db.update(calendarSources)
    .set({ attemptedAt: now.toISOString(), syncingUntil: new Date(now.getTime() + 30000).toISOString() })
    .where(and(
      eq(calendarSources.id, id), eq(calendarSources.userId, userId),
      or(isNull(calendarSources.syncingUntil), lt(calendarSources.syncingUntil, now.toISOString())),
      ...(force ? [] : [or(isNull(calendarSources.attemptedAt), lt(calendarSources.attemptedAt, due.toISOString()))]),
    )).returning();
  if (!source) return;
  try {
    const result = await download(source.url, source.etag, source.lastModified);
    if (result.status === 304 && !source.content) throw new Error("Le flux ICS n’a pas encore été importé.");
    if (result.status === 200) parseCalendar(result.content ?? "");
    await db.update(calendarSources).set({
      ...(result.status === 200 ? { content: result.content, etag: result.etag, lastModified: result.lastModified } : {}),
      succeededAt: new Date().toISOString(), syncingUntil: null, error: null,
    }).where(and(eq(calendarSources.id, id), eq(calendarSources.userId, userId), eq(calendarSources.attemptedAt, now.toISOString())));
  } catch (error) {
    await db.update(calendarSources).set({
      syncingUntil: null,
      error: error instanceof Error ? error.message.slice(0, 300) : "Échec de synchronisation.",
    }).where(and(eq(calendarSources.id, id), eq(calendarSources.userId, userId), eq(calendarSources.attemptedAt, now.toISOString())));
  }
}

export async function syncCalendarSources(userId: string, force = false, id?: string) {
  const sources = await db.select({ id: calendarSources.id }).from(calendarSources).where(eq(calendarSources.userId, userId));
  if (id && !sources.some((source) => source.id === id)) throw new ORPCError("NOT_FOUND");
  const selected = sources.filter((source) => !id || source.id === id);
  for (let index = 0; index < selected.length; index += 3) {
    await Promise.all(selected.slice(index, index + 3).map((source) => syncCalendarSource(userId, source.id, force)));
  }
  const updated = await db.select({
    id: calendarSources.id, name: calendarSources.name, url: calendarSources.url,
    attemptedAt: calendarSources.attemptedAt, succeededAt: calendarSources.succeededAt,
    error: calendarSources.error,
  }).from(calendarSources).where(eq(calendarSources.userId, userId));
  return updated.map(sourceToWire);
}

export async function getImportedEvents(userId: string, startAt: string, endAt: string, connection: Connection = db): Promise<ImportedEvent[]> {
  if (new Date(endAt) <= new Date(startAt)) throw new ORPCError("BAD_REQUEST", { message: "Période invalide." });
  const sourceRows = await connection.select({ id: calendarSources.id, name: calendarSources.name, content: calendarSources.content })
    .from(calendarSources).where(eq(calendarSources.userId, userId));
  if (!sourceRows.some((source) => source.content)) return [];
  const [settings] = await connection.select().from(preferences).where(eq(preferences.userId, userId));
  const zone = settings?.timeZone ?? "Europe/Paris";
  return sourceRows.flatMap((source) => expandImported(source, startAt, endAt, zone));
}
