import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { contract } from "@upnext/contracts";

export function createApiClient(url: string, headers?: HeadersInit) {
  const link = new RPCLink({
    url,
    headers: headers ? new Headers(headers) : undefined,
    fetch: (request, init) =>
      fetch(request, { ...init, credentials: "include", cache: "no-store" }),
  });
  return createORPCClient<ContractRouterClient<typeof contract>>(link);
}

export const api = createApiClient(
  typeof window === "undefined"
    ? "http://localhost:3001/api/rpc"
    : `${window.location.origin}/api/rpc`,
);
export const orpc = createTanstackQueryUtils(api);
