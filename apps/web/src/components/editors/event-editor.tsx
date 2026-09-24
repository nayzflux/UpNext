"use client";

import { useState } from "react";
import { localEventOccurrence, type CalendarEvent } from "@upnext/contracts";
import { api } from "@/lib/api";
import { dateTimeInput, errorMessage, inputToInstant } from "@/lib/format";
import { useAction, useWorkspace } from "../workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker, DateTimeField, FormError } from "./fields";
import { ConfirmAction } from "../common";
import { EventTasks } from "./event-tasks";

export function EventEditor({
  event,
  initialStart,
  occurrenceIndex = 0,
}: {
  event?: CalendarEvent;
  initialStart?: string;
  occurrenceIndex?: number;
}) {
  const { timeZone: accountZone, closeEditor } = useWorkspace();
  const timeZone = event?.timeZone ?? accountZone;
  const defaultStart = initialStart ?? "";
  const [title, setTitle] = useState(event?.title ?? "");
  const [start, setStart] = useState(
    event?.startAt || defaultStart
      ? dateTimeInput(event?.startAt ?? defaultStart, timeZone)
      : "",
  );
  const [end, setEnd] = useState(
    event?.endAt || defaultStart
      ? dateTimeInput(
          event?.endAt ?? new Date(new Date(defaultStart).getTime() + 3600000).toISOString(),
          timeZone,
        )
      : "",
  );
  const [weekly, setWeekly] = useState(event?.weekly ?? false);
  const [repeatUntil, setRepeatUntil] = useState(event?.repeatUntil ?? "");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [validationError, setValidationError] = useState("");
  const action = useAction();
  const occurrence = event ? localEventOccurrence(event, occurrenceIndex) : null;

  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setValidationError("");
    try {
      if (!start.includes("T") || !end.includes("T")) {
        throw new Error("Indique le début et la fin de l’événement.");
      }
      const saved = await action.run(
        () =>
          api.events.save({
            id: event?.id,
            revision: event?.revision,
            title,
            startAt: inputToInstant(start, timeZone),
            endAt: inputToInstant(end, timeZone),
            weekly,
            repeatUntil: repeatUntil || null,
            timeZone,
            allowOverlap,
          }),
        "Événement enregistré",
      );
      if (saved) closeEditor();
    } catch (error) {
      setValidationError(errorMessage(error));
    }
  }

  return (
    <form className="editor-form" onSubmit={(formEvent) => void save(formEvent)}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="event-title">Nom de l’événement</FieldLabel>
          <Input
            id="event-title"
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Cours, DS, rendez-vous…"
          />
        </Field>
        <DateTimeField id="event-start" label="Début" value={start} onChange={setStart} />
        <DateTimeField id="event-end" label="Fin" value={end} onChange={setEnd} />
        <Field orientation="horizontal">
          <Checkbox
            id="event-weekly"
            checked={weekly}
            onCheckedChange={(checked) => setWeekly(checked === true)}
          />
          <FieldLabel htmlFor="event-weekly">Répéter chaque semaine</FieldLabel>
        </Field>
        {weekly && (
          <Field>
            <FieldLabel htmlFor="event-until">Jusqu’au · facultatif</FieldLabel>
            <DatePicker id="event-until" value={repeatUntil} onChange={setRepeatUntil} />
            <FieldDescription>
              Les modifications s’appliquent à toute la série. Les horaires suivent le fuseau{" "}
              {timeZone}.
            </FieldDescription>
          </Field>
        )}
        <Field orientation="horizontal">
          <Checkbox
            id="event-overlap"
            checked={allowOverlap}
            onCheckedChange={(checked) => setAllowOverlap(checked === true)}
          />
          <FieldLabel htmlFor="event-overlap">
            Autoriser un chevauchement avec mon planning
          </FieldLabel>
        </Field>
        <FormError message={validationError || action.error} />
      </FieldGroup>
      {occurrence && <EventTasks event={occurrence} />}
      <div className="editor-footer">
        {event ? (
          <ConfirmAction
            label={event.weekly ? "Supprimer toute la série ?" : "Supprimer cet événement ?"}
            description="Les tâches de préparation associées seront conservées."
            onConfirm={async () => {
              const result = await action.run(
                () => api.events.delete({ id: event.id }),
                "Événement supprimé",
              );
              if (result) closeEditor();
              return result;
            }}
          >
            <Button type="button" variant="destructive">
              Supprimer
            </Button>
          </ConfirmAction>
        ) : (
          <Button type="button" variant="outline" onClick={closeEditor}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={action.pending}>
          {action.pending && <Spinner data-icon="inline-start" />}
          {event ? "Enregistrer" : "Créer l’événement"}
        </Button>
      </div>
    </form>
  );
}
