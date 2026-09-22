"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Sparkles } from "lucide-react";
import {
  defaultSessionPercent,
  getTaskMetrics,
  minutesBetween,
  plannedSessionPercent,
  type Session,
} from "@upnext/contracts";
import { api, orpc } from "@/lib/api";
import {
  dateTimeInput,
  duration,
  errorMessage,
  formatDate,
  inputToInstant,
} from "@/lib/format";
import { useAction, useWorkspace } from "../workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { DateTimeField, FormError } from "./fields";
import { SelectControl } from "../select-control";

export function SessionEditor({
  taskId,
  session,
  initialStart,
  initialMinutes,
}: {
  taskId?: string;
  session?: Session;
  initialStart?: string;
  initialMinutes?: number;
}) {
  const { snapshot, timeZone, now, closeEditor } = useWorkspace();
  const [selectedTaskId, setSelectedTaskId] = useState(
    session?.taskId ?? taskId ?? snapshot.tasks.find((task) => task.progress < 100)?.id ?? "",
  );
  const task = snapshot.tasks.find((task) => task.id === selectedTaskId);
  const [start, setStart] = useState(
    dateTimeInput(
      initialStart ??
        session?.startAt ??
        new Date(Math.ceil(now.getTime() / 900000) * 900000).toISOString(),
      timeZone,
    ),
  );
  const [minutes, setMinutes] = useState(
    initialMinutes ??
      (session
        ? minutesBetween(session.startAt, session.endAt)
        : Math.min(
            60,
            task
              ? getTaskMetrics(task, snapshot.sessions, snapshot.logs, now).unplannedMinutes || 60
              : 60,
          )),
  );
  const [customPercent, setCustomPercent] = useState<number | null>(
    session?.plannedPercent ?? null,
  );
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validationError, setValidationError] = useState("");
  const action = useAction();
  const suggestions = useQuery({
    ...orpc.suggestions.get.queryOptions({
      input: { taskId: selectedTaskId, durationMinutes: Math.min(480, Math.max(5, minutes)) },
    }),
    enabled: showSuggestions && !!task && minutes >= 5 && minutes <= 480,
  });
  const metrics = task ? getTaskMetrics(task, snapshot.sessions, snapshot.logs, now) : null;
  const availablePercent = task
    ? Math.max(
        0,
        100 -
          task.progress -
          plannedSessionPercent(task.id, snapshot.sessions, now, session?.id),
      )
    : 0;
  const percentage = task
    ? (customPercent ??
      Math.min(availablePercent, defaultSessionPercent(minutes, task.estimatedMinutes)))
    : 0;
  const exceeds = percentage > availablePercent + 0.000001;
  let late = false;
  try {
    late =
      !!task &&
      new Date(inputToInstant(start, timeZone)).getTime() + minutes * 60000 >
        new Date(task.dueAt).getTime();
  } catch {
    /* Validated on submission. */
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setValidationError("");
    if (exceeds || !Number.isFinite(percentage) || percentage < 0) {
      setValidationError("La part planifiée dépasse les 100 % de cette tâche.");
      return;
    }
    try {
      const startAt = inputToInstant(start, timeZone);
      const endAt = new Date(new Date(startAt).getTime() + minutes * 60000).toISOString();
      const saved = await action.run(
        () =>
          api.sessions.save({
            id: session?.id,
            revision: session?.revision,
            taskId: selectedTaskId,
            startAt,
            endAt,
            plannedPercent: percentage,
            allowOverlap,
          }),
        "Séance enregistrée dans ton planning",
      );
      if (saved) closeEditor();
    } catch (error) {
      setValidationError(errorMessage(error));
    }
  }

  return (
    <form className="editor-form" onSubmit={(event) => void save(event)}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="session-task">La tâche à avancer</FieldLabel>
          <SelectControl
            id="session-task"
            className="w-full"
            options={[
              { value: "none", label: "Choisir une tâche", disabled: true },
              ...snapshot.tasks
                .filter((task) => task.progress < 100)
                .map((task) => ({ value: task.id, label: task.title })),
            ]}
            value={selectedTaskId || "none"}
            onValueChange={(nextValue) => {
              if (nextValue === "none") {
                return;
              }
              setSelectedTaskId(nextValue);
              setCustomPercent(null);
              const selectedTask = snapshot.tasks.find((item) => item.id === nextValue);
              if (selectedTask) {
                const unplannedMinutes = getTaskMetrics(
                  selectedTask,
                  snapshot.sessions,
                  snapshot.logs,
                  now,
                ).unplannedMinutes;
                setMinutes(Math.min(60, unplannedMinutes || 60));
              }
              setShowSuggestions(false);
            }}
          />
        </Field>
        <DateTimeField
          id="session-start"
          label="Début de la séance"
          value={start}
          onChange={setStart}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="session-duration">Durée, en minutes</FieldLabel>
            <Input
              id="session-duration"
              type="number"
              min={1}
              max={1440}
              required
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </Field>
          <Field data-invalid={exceeds || undefined}>
            <FieldLabel htmlFor="session-percentage">Part de la tâche, en %</FieldLabel>
            <Input
              id="session-percentage"
              type="number"
              min={0}
              max={availablePercent}
              step="any"
              value={percentage}
              aria-invalid={exceeds}
              onChange={(event) => setCustomPercent(Number(event.target.value))}
            />
          </Field>
        </div>
        <FieldDescription>
          La durée propose une part par défaut. Tu peux modifier cette part sans changer le
          temps réservé. L’avancement réel sera renseigné après la séance.
        </FieldDescription>
        {metrics && (
          <FieldDescription>
            {duration(metrics.unplannedMinutes)} à planifier · {availablePercent.toFixed(1)} %
            encore attribuables.
          </FieldDescription>
        )}
        {late && (
          <Alert>
            <AlertDescription>
              Cette séance se termine après la date limite de la tâche.
            </AlertDescription>
          </Alert>
        )}
        {exceeds && (
          <Alert>
            <AlertDescription>
              La part totale planifiée dépasserait les 100 % de cette tâche.
            </AlertDescription>
          </Alert>
        )}
        <Field orientation="horizontal">
          <Checkbox
            id="session-overlap"
            checked={allowOverlap}
            onCheckedChange={(checked) => setAllowOverlap(checked === true)}
          />
          <FieldLabel htmlFor="session-overlap">
            Autoriser un chevauchement avec mon planning
          </FieldLabel>
        </Field>
        <div className="suggestions-panel">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-semibold">Trouver un bon moment</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Des créneaux libres, inspirés de tes séances réellement effectuées.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            disabled={!task || minutes < 5 || minutes > 480}
            onClick={() => {
              setShowSuggestions(true);
              if (showSuggestions) void suggestions.refetch();
            }}
          >
            {suggestions.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CalendarClock data-icon="inline-start" />
            )}
            Proposer des créneaux
          </Button>
          {showSuggestions &&
            suggestions.data?.map((slot) => (
              <Button
                key={slot.startAt}
                type="button"
                variant="ghost"
                className="mt-2 h-auto w-full justify-start py-3"
                onClick={() => setStart(dateTimeInput(slot.startAt, timeZone))}
              >
                <span className="flex flex-col items-start gap-1 text-left">
                  <span>
                    {formatDate(slot.startAt, timeZone, "EEE d MMM · HH:mm")} ·{" "}
                    {duration(minutes)}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {slot.reason}
                  </span>
                </span>
              </Button>
            ))}
          {showSuggestions && suggestions.data?.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {snapshot.preferences.availability.length
                ? "Aucun créneau libre avant l’échéance. Essaie une séance plus courte."
                : "Renseigne d’abord tes disponibilités dans les paramètres."}
            </p>
          )}
          {suggestions.isError && (
            <p className="mt-3 text-xs text-destructive">
              Impossible de charger les suggestions. Réessaie.
            </p>
          )}
        </div>
        <FormError message={validationError || action.error} />
      </FieldGroup>
      <div className="editor-footer">
        <Button type="button" variant="outline" onClick={closeEditor}>
          Annuler
        </Button>
        <Button type="submit" disabled={action.pending || !task || exceeds}>
          {action.pending && <Spinner data-icon="inline-start" />}
          {session ? "Enregistrer" : "Planifier la séance"}
        </Button>
      </div>
    </form>
  );
}
