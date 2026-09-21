"use client";

import { useState } from "react";
import type { CalendarEvent } from "@upnext/contracts";
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

export function EventEditor({
  event,
  initialStart,
}: {
  event?: CalendarEvent;
  initialStart?: string;
}) {
  const { timeZone: accountZone, now, closeEditor } = useWorkspace();
  const timeZone = event?.timeZone ?? accountZone;
  const defaultStart =
    initialStart ?? new Date(Math.ceil(now.getTime() / 900000) * 900000).toISOString();
  const [title, setTitle] = useState(event?.title ?? "");
  const [start, setStart] = useState(dateTimeInput(event?.startAt ?? defaultStart, timeZone));
  const [end, setEnd] = useState(
    dateTimeInput(
      event?.endAt ?? new Date(new Date(defaultStart).getTime() + 3600000).toISOString(),
      timeZone,
    ),
  );
  const [weekly, setWeekly] = useState(event?.weekly ?? false);
  const [repeatUntil, setRepeatUntil] = useState(event?.repeatUntil ?? "");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [validationError, setValidationError] = useState("");
  const action = useAction();

  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setValidationError("");
    try {
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
