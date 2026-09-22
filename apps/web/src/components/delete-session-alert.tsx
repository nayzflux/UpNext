"use client";

import { useState, type ReactElement } from "react";
import type { Session } from "@upnext/contracts";
import { api } from "@/lib/api";
import { useAction, useWorkspace } from "./workspace-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

export function DeleteSessionAlert({
  session,
  children,
  open,
  onOpenChange,
}: {
  session: Session;
  children?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { snapshot } = useWorkspace();
  const action = useAction();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const dialogOpen = controlled ? open : internalOpen;
  const setDialogOpen = onOpenChange ?? setInternalOpen;
  const hasLog = snapshot.logs.some((log) => log.sessionId === session.id);

  async function remove() {
    const result = await action.run(
      () => api.sessions.delete({ id: session.id, revision: session.revision }),
      "Séance supprimée",
    );
    if (result) {
      setDialogOpen(false);
    }
  }

  return (
    <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {children && <AlertDialogTrigger render={children} />}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette séance ?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasLog
              ? "La séance disparaîtra du calendrier. Son bilan et l’avancement de la tâche seront conservés."
              : "La séance sera supprimée définitivement et sa part redeviendra disponible à planifier."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={action.pending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={action.pending}
            onClick={() => void remove()}
          >
            {action.pending && <Spinner data-icon="inline-start" />}
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
