"use client";

import { useState } from "react";
import { minutesBetween, type Session, type Task, type WorkLog } from "@upnext/contracts";
import { api } from "@/lib/api";
import { dateTimeInput, duration, errorMessage, inputToInstant } from "@/lib/format";
import { useAction, useWorkspace } from "../workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { DateTimeField, FormError } from "./fields";

export function LogEditor({
  task,
  session,
  log,
}: {
  task: Task;
  session?: Session;
  log?: WorkLog;
}) {
  const { timeZone, now, closeEditor, openEditor } = useWorkspace();
  const action = useAction();
  const [requestId] = useState(() => crypto.randomUUID());
  const defaultMinutes = session
    ? Math.min(
        minutesBetween(session.startAt, session.endAt),
        Math.max(0, Math.floor((now.getTime() - new Date(session.startAt).getTime()) / 60000)),
      )
    : 30;
  const defaultStart =
    session && new Date(session.startAt) < now
      ? session.startAt
      : new Date(now.getTime() - defaultMinutes * 60000).toISOString();
  const [start, setStart] = useState(
    dateTimeInput(log?.actualStartAt ?? defaultStart, timeZone),
  );
  const [minutes, setMinutes] = useState(log?.actualMinutes ?? defaultMinutes);
  const [progress, setProgress] = useState(log?.progressAfter ?? task.progress);
  const [note, setNote] = useState(log?.note ?? "");
  const [missed, setMissed] = useState(log?.missed ?? false);
  const [validationError, setValidationError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setValidationError("");
    try {
      const saved = await action.run(
        () =>
          api.logs.save({
            id: log?.id,
            requestId,
            taskId: task.id,
            taskRevision: task.revision,
            sessionId: session?.id ?? log?.sessionId ?? null,
            actualStartAt: inputToInstant(start, timeZone),
            actualMinutes: missed ? 0 : minutes,
            progressAfter: progress,
            note,
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
            : "Travail réalisé sans réservation"}
        </p>
      </div>
      <FieldGroup>
        {session && (
          <Field orientation="horizontal">
            <Checkbox
              id="log-missed"
              checked={missed}
              onCheckedChange={(checked) => setMissed(checked === true)}
            />
            <FieldLabel htmlFor="log-missed">Je n’ai pas pu faire cette séance</FieldLabel>
          </Field>
        )}
        <DateTimeField id="log-start" label="Début réel" value={start} onChange={setStart} />
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
                onChange={(event) => setMinutes(Number(event.target.value))}
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
                step={1}
                required
                value={progress}
                onChange={(event) => setProgress(Number(event.target.value))}
              />
              <FieldDescription>
                Où en es-tu au total ? Avant ce bilan : {log?.progressBefore ?? task.progress}{" "}
                %. Le temps passé et le travail terminé sont indépendants.
              </FieldDescription>
            </Field>
            <Button type="button" variant="outline" onClick={() => setProgress(100)}>
              La tâche est terminée · 100 %
            </Button>
          </>
        )}
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
        <FormError message={validationError || action.error} />
      </FieldGroup>
      <div className="editor-footer">
        <Button type="button" variant="outline" onClick={closeEditor}>
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
  const { closeEditor } = useWorkspace();
  const [minutes, setMinutes] = useState(Math.min(100000, suggestedMinutes));
  const action = useAction();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await action.run(
      () => api.tasks.update({ ...task, estimatedMinutes: minutes }),
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
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
          <FieldDescription>
            Les séances déjà placées conservent leurs horaires.
          </FieldDescription>
        </Field>
        <FormError message={action.error} />
      </FieldGroup>
      <div className="editor-footer">
        <Button type="button" variant="outline" onClick={closeEditor}>
          Garder mon estimation
        </Button>
        <Button type="submit" disabled={action.pending}>
          Ajuster l’estimation
        </Button>
      </div>
    </form>
  );
}
