"use client";

import { useState } from "react";
import {
  defaultSessionPercent,
  minutesBetween,
  type Session,
  type Task,
  type WorkLog,
} from "@upnext/contracts";
import { api } from "@/lib/api";
import { duration, errorMessage, formatDate } from "@/lib/format";
import { useAction, useWorkspace } from "../workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "./fields";
import { useFormGuard, useUnsavedForm } from "../form-guard";

export function LogEditor({
  task,
  session,
  log,
}: {
  task: Task;
  session?: Session;
  log?: WorkLog;
}) {
  const { snapshot, now, timeZone, requestCloseEditor } = useWorkspace();
  const [choice, setChoice] = useState<string | null | undefined>();
  const eligibleSessions = snapshot.sessions
    .filter(
      (item) =>
        item.taskId === task.id &&
        (item.status === "planned" || item.status === "expired") &&
        new Date(item.startAt) <= now &&
        !snapshot.logs.some((entry) => entry.sessionId === item.id),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const canChoose = !session && !log && eligibleSessions.length > 0;

  if (canChoose && choice === undefined) {
    return (
      <div className="editor-form">
        <div className="editor-summary">
          <p className="font-semibold">{task.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce bilan concerne-t-il une séance prévue ?
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {eligibleSessions.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              className="h-auto justify-start whitespace-normal py-3 text-left"
              onClick={() => setChoice(item.id)}
            >
              {formatDate(item.startAt, timeZone, "EEE d MMM à HH:mm")} ·{" "}
              {duration(minutesBetween(item.startAt, item.endAt))}
            </Button>
          ))}
          <Button type="button" variant="outline" onClick={() => setChoice(null)}>
            Continuer sans réservation
          </Button>
        </div>
        <div className="editor-footer">
          <Button type="button" variant="outline" onClick={requestCloseEditor}>
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  const selectedSession = choice
    ? eligibleSessions.find((item) => item.id === choice)
    : session;
  return (
    <LogForm
      key={selectedSession?.id ?? "without-reservation"}
      task={task}
      session={selectedSession}
      log={log}
      onBack={canChoose ? () => setChoice(undefined) : undefined}
    />
  );
}

function LogForm({
  task,
  session,
  log,
  onBack,
}: {
  task: Task;
  session?: Session;
  log?: WorkLog;
  onBack?: () => void;
}) {
  const { now, closeEditor, requestCloseEditor, openEditor } = useWorkspace();
  const guard = useFormGuard();
  const action = useAction();
  const [requestId] = useState(() => crypto.randomUUID());
  const defaultMinutes = session
    ? Math.min(
        minutesBetween(session.startAt, session.endAt),
        Math.max(0, Math.floor((now.getTime() - new Date(session.startAt).getTime()) / 60000)),
      )
    : 30;
  const defaultProgress = Math.min(
    100,
    Math.round(
      (task.progress +
        (session
          ? session.plannedPercent *
            (defaultMinutes / minutesBetween(session.startAt, session.endAt))
          : defaultSessionPercent(defaultMinutes, task.estimatedMinutes))) *
        10,
    ) / 10,
  );
  const [minutes, setMinutes] = useState(
    log ? String(log.actualMinutes) : session ? String(defaultMinutes) : "",
  );
  const [progress, setProgress] = useState(
    log ? String(log.progressAfter) : session ? String(defaultProgress) : "",
  );
  const [note, setNote] = useState(log?.note ?? "");
  const [missed, setMissed] = useState(log?.missed ?? false);
  useUnsavedForm([minutes, progress, note, missed], action.pending);
  const [validationError, setValidationError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setValidationError("");
    if (!missed && (minutes === "" || progress === "")) {
      setValidationError("Indique le temps passé et l’avancement de la tâche.");
      return;
    }
    try {
      const saved = await action.run(
        () =>
          api.logs.save({
            id: log?.id,
            requestId,
            taskId: task.id,
            taskRevision: task.revision,
            sessionId: session?.id ?? log?.sessionId ?? null,
            actualMinutes: missed ? undefined : Number(minutes),
            progressAfter: missed ? undefined : Number(progress),
            note: missed ? "" : note,
            missed,
          }),
        missed ? "Séance marquée comme manquée" : "Ton avancement est enregistré",
      );
      if (saved?.suggestedEstimate) {
        openEditor({ type: "estimate", taskId: task.id, minutes: saved.suggestedEstimate });
      } else if (saved) {
        closeEditor();
      }
    } catch (error) {
      setValidationError(errorMessage(error));
    }
  }

  return (
    <form className="editor-form" onSubmit={(event) => void save(event)}>
      <div className="editor-summary">
        <p className="font-semibold">{task.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {session
            ? `${duration(minutesBetween(session.startAt, session.endAt))} prévues pour cette séance`
            : log?.sessionId
              ? "Séance archivée"
              : "Travail réalisé sans réservation"}
        </p>
      </div>
      <FieldGroup>
        {session && session.status !== "expired" && (
          <Field orientation="horizontal">
            <Checkbox
              id="log-missed"
              checked={missed}
              onCheckedChange={(checked) => setMissed(checked === true)}
            />
            <FieldLabel htmlFor="log-missed">Je n’ai pas pu faire cette séance</FieldLabel>
          </Field>
        )}
        {!missed && (
          <>
            <Field>
              <FieldLabel htmlFor="log-minutes">Temps réellement passé, en minutes</FieldLabel>
              <Input
                id="log-minutes"
                type="number"
                min={0}
                max={1440}
                required
                value={minutes}
                placeholder={String(defaultMinutes)}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="log-progress">
                Avancement total de la tâche, en %
              </FieldLabel>
              <Input
                id="log-progress"
                type="number"
                min={0}
                max={100}
                step="any"
                required
                value={progress}
                placeholder={String(defaultProgress)}
                onChange={(event) => setProgress(event.target.value)}
              />
              <FieldDescription>
                Où en es-tu au total ? Avant ce bilan : {log?.progressBefore ?? task.progress}{" "}
                %. Les valeurs proposées suivent la séance prévue ; tu peux ajuster le temps et
                le pourcentage séparément.
              </FieldDescription>
            </Field>
            <Button type="button" variant="outline" onClick={() => setProgress("100")}>
              La tâche est terminée · 100 %
            </Button>
            <Field>
              <FieldLabel htmlFor="log-note">Une note pour la prochaine fois</FieldLabel>
              <Textarea
                id="log-note"
                rows={3}
                placeholder="Ce qu’il reste à faire, ce qui a bloqué…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </>
        )}
        <FormError message={validationError || action.error} />
      </FieldGroup>
      <div className="editor-footer">
        {onBack && (
          <Button type="button" variant="ghost" onClick={() => guard.run(onBack)}>
            Changer de choix
          </Button>
        )}
        <Button type="button" variant="outline" onClick={requestCloseEditor}>
          Annuler
        </Button>
        <Button type="submit" disabled={action.pending}>
          {action.pending && <Spinner data-icon="inline-start" />}Enregistrer le bilan
        </Button>
      </div>
    </form>
  );
}

export function EstimateEditor({
  task,
  suggestedMinutes,
}: {
  task: Task;
  suggestedMinutes: number;
}) {
  const { closeEditor, requestCloseEditor } = useWorkspace();
  const [minutes, setMinutes] = useState(String(Math.min(100000, suggestedMinutes)));
  const action = useAction();

  useUnsavedForm(minutes, action.pending);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!minutes) return;
    const result = await action.run(
      () => api.tasks.update({ ...task, estimatedMinutes: Number(minutes) }),
      "Estimation ajustée",
    );
    if (result) closeEditor();
  }

  return (
    <form className="editor-form" onSubmit={(event) => void save(event)}>
      <div className="editor-summary">
        <p className="font-semibold">{task.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Cette tâche demande un peu plus de temps que prévu. Ton rythme actuel suggère{" "}
          {duration(suggestedMinutes)} au total, contre {duration(task.estimatedMinutes)}{" "}
          initialement.
        </p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-estimate">
            Nouvelle estimation totale, en minutes
          </FieldLabel>
          <Input
            id="new-estimate"
            type="number"
            min={5}
            max={100000}
            required
            value={minutes}
            placeholder={String(suggestedMinutes)}
            onChange={(event) => setMinutes(event.target.value)}
          />
          <FieldDescription>
            Les séances déjà placées conservent leurs horaires.
          </FieldDescription>
        </Field>
        <FormError message={action.error} />
      </FieldGroup>
      <div className="editor-footer">
        <Button type="button" variant="outline" onClick={requestCloseEditor}>
          Garder mon estimation
        </Button>
        <Button type="submit" disabled={action.pending}>
          Ajuster l’estimation
        </Button>
      </div>
    </form>
  );
}
