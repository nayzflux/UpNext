"use client";

import { createContext, useContext, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FormStatus = { dirty: boolean; pending: boolean };
type Guard = {
  run: (action: () => void) => void;
  setStatus: (id: string, status: FormStatus | null) => void;
};
const FormGuardContext = createContext<Guard | null>(null);

export function FormGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [forms, setForms] = useState<Record<string, FormStatus>>({});
  const [nextAction, setNextAction] = useState<(() => void) | null>(null);
  const dirty = Object.values(forms).some((form) => form.dirty);
  const pending = Object.values(forms).some((form) => form.pending);
  const [setStatus] = useState(() => (id: string, status: FormStatus | null) => {
    setForms((current) => {
      if (status) return { ...current, [id]: status };
      const remaining = { ...current };
      delete remaining[id];
      return remaining;
    });
  });

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  function run(action: () => void) {
    if (pending) return;
    if (dirty) setNextAction(() => action);
    else action();
  }

  return (
    <FormGuardContext value={{ run, setStatus }}>
      <div
        className="contents"
        onClickCapture={(event) => {
          if (
            (!dirty && !pending) ||
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey ||
            !(event.target instanceof Element)
          )
            return;
          const link = event.target.closest<HTMLAnchorElement>("a[href]");
          if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
          const url = new URL(link.href);
          if (
            url.origin !== location.origin ||
            url.href === location.href ||
            (url.pathname === location.pathname && url.search === location.search)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          run(() => router.push(`${url.pathname}${url.search}${url.hash}`));
        }}
      >
        {children}
      </div>
      <AlertDialog
        open={nextAction !== null}
        onOpenChange={(open) => {
          if (!open) setNextAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tes modifications ne sont pas encore enregistrées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setNextAction(null)}>
              Continuer à modifier
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const action = nextAction;
                setNextAction(null);
                action?.();
              }}
            >
              Abandonner
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormGuardContext>
  );
}

export function useFormGuard() {
  const guard = useContext(FormGuardContext);
  if (!guard) throw new Error("FormGuard manquant.");
  return guard;
}

export function useUnsavedForm(values: unknown, pending: boolean, savedValues?: unknown) {
  const { setStatus } = useFormGuard();
  const id = useId();
  const [initialValues] = useState(() => JSON.stringify(values));
  const baseline = savedValues === undefined ? initialValues : JSON.stringify(savedValues);
  const dirty = JSON.stringify(values) !== baseline;
  useEffect(() => {
    setStatus(id, { dirty, pending });
  }, [id, dirty, pending, setStatus]);
  useEffect(() => () => setStatus(id, null), [id, setStatus]);
}
