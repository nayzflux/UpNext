"use client";

import { createContext, useContext, useRef, useState } from "react";
import type { EventOccurrence, ImportedEvent } from "@upnext/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { Snapshot } from "@upnext/contracts";
import { orpc } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { toast } from "@/components/ui/toast";

export type Editor =
  | { type: "task"; taskId?: string; initialEvent?: EventOccurrence | ImportedEvent }
  | { type: "detail"; taskId: string }
  | {
      type: "session";
      taskId?: string;
      sessionId?: string;
      startAt?: string;
      initialDate?: string;
      durationMinutes?: number;
    }
  | { type: "log"; taskId: string; sessionId?: string; logId?: string }
  | { type: "event"; eventId?: string; startAt?: string; occurrenceIndex?: number }
  | { type: "importedEvent"; event: ImportedEvent }
  | { type: "estimate"; taskId: string; minutes: number };

export const WorkspaceContext = createContext<{
  snapshot: Snapshot;
  viewer: { name: string; email: string };
  openEditor: (editor: Editor) => void;
  closeEditor: () => void;
  requestCloseEditor: () => void;
} | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace manquant.");
  return {
    ...context,
    now: new Date(context.snapshot.serverNow),
    timeZone: context.snapshot.preferences.timeZone,
  };
}

export function useAction() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function run<T>(
    operation: () => Promise<T>,
    successMessage?: string,
  ): Promise<T | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const result = await operation();
      await queryClient.invalidateQueries({
        queryKey: orpc.dashboard.get.queryOptions().queryKey,
      });
      if (successMessage) toast.add({ title: successMessage, type: "success" });
      return result;
    } catch (error) {
      const message = errorMessage(error);
      setError(message);
      toast.add({
        title: "La modification n’a pas été enregistrée",
        description: message,
        type: "error",
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.dashboard.get.queryOptions().queryKey,
      });
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { run, pending, error };
}
