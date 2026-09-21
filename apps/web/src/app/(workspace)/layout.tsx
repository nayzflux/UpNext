import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerApi, getViewer } from "@/lib/server";
import { orpc } from "@/lib/api";
import { Workspace } from "@/components/workspace";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const client = await getServerApi();
  const snapshot = await client.dashboard.get();
  const queryClient = new QueryClient();
  queryClient.setQueryData(orpc.dashboard.get.queryOptions().queryKey, snapshot);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Workspace viewer={viewer}>{children}</Workspace>
    </HydrationBoundary>
  );
}
