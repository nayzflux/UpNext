import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ pool: { query } }));
vi.mock("./auth", () => ({ auth: { handler: vi.fn() } }));
vi.mock("./env", () => ({ env: { APP_URL: "https://upnext.school.fr" } }));
vi.mock("./router", () => ({ router: {} }));
vi.mock("@orpc/server/fetch", () => ({
  RPCHandler: class {
    async handle() {
      return { matched: false };
    }
  },
}));
import { app } from "./app";

beforeEach(() => {
  query.mockReset();
});

describe("santé et origine de l'API", () => {
  it("confirme la disponibilité de PostgreSQL sans mettre la réponse en cache", async () => {
    query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(query).toHaveBeenCalledWith({ text: "select 1", query_timeout: 2000 });
  });
  it("répond 503 sans exposer l'erreur de base de données", async () => {
    query.mockRejectedValue(new Error("private database details"));
    const response = await app.request("/health");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
  it("refuse une origine étrangère sur les procédures authentifiées", async () => {
    const response = await app.request("/api/rpc/tasks/create", {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
    });
    expect(response.status).toBe(403);
  });
});
