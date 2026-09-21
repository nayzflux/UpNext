import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "./api";

const apiUrl = process.env.API_URL ?? "http://localhost:3001";

export const getViewer = cache(async () => {
  const requestHeaders = await headers();
  const response = await fetch(`${apiUrl}/api/auth/get-session`, {
    headers: { cookie: requestHeaders.get("cookie") ?? "" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Le service de connexion est indisponible.");
  const session = (await response.json()) as {
    user: { id: string; name: string; email: string; emailVerified: boolean };
  } | null;
  if (!session?.user.emailVerified) redirect("/connexion");
  return session.user;
});

export async function getServerApi() {
  const requestHeaders = await headers();
  return createApiClient(`${apiUrl}/api/rpc`, { cookie: requestHeaders.get("cookie") ?? "" });
}
