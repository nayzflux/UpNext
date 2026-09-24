"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  addCalendarDays,
  expandEvents,
  localDate,
  localTime,
  zonedInstant,
  taskFieldsSchema,
  type EventLink,
  type EventOccurrence,
  type ImportedEvent,
  type Task,
} from "@upnext/contracts";
import { api } from "@/lib/api";
import { eventLinkFor, sameEventLink } from "@/lib/event-links";
import { errorMessage } from "@/lib/format";
import { useAction, useWorkspace } from "../workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import { SelectControl } from "../select-control";
import { DatePicker, FormError, TagPicker, TimePicker } from "./fields";

export function TaskEditor({
  task,
  initialEvent,
}: {
  task?: Task;
  initialEvent?: EventOccurrence | ImportedEvent;
}) {
  const { snapshot, now, timeZone, closeEditor } = useWorkspace();
  const action = useAction();
  const [validationError, setValidationError] = useState("");
  const initialLink = task?.eventLink ?? (initialEvent ? eventLinkFor(initialEvent) : null);
  const [selectedLink, setSelectedLink] = useState<EventLink | null>(initialLink);
  const [eventDate, setEventDate] = useState(
    localDate(initialEvent?.startAt ?? task?.dueAt ?? now, timeZone),
  );
  const eventRangeStart = zonedInstant(eventDate, "00:00", timeZone);
  const eventRangeEnd = zonedInstant(addCalendarDays(eventDate, 1), "00:00", timeZone);
  const imported = useQuery({
    queryKey: ["imported-events", eventRangeStart, eventRangeEnd],
    queryFn: () => api.importedEvents.list({ startAt: eventRangeStart, endAt: eventRangeEnd }),
    enabled: snapshot.calendarSources.length > 0,
  });
  const selectableEvents: (EventOccurrence | ImportedEvent)[] = [
    ...expandEvents(snapshot.events, eventRangeStart, eventRangeEnd),
    ...(imported.data ?? []),
  ];
  const selectedEvent =
    selectableEvents.find((event) => sameEventLink(selectedLink, eventLinkFor(event))) ??
    (initialEvent && sameEventLink(selectedLink, eventLinkFor(initialEvent))
      ? initialEvent
      : undefined);
  const form = useForm({
    defaultValues: {
      title: task?.title ?? "",
      notes: task?.notes ?? "",
      priority: task?.priority ?? ("normal" as Task["priority"]),
      dueDate: task
        ? localDate(task.dueAt, timeZone)
        : initialEvent
          ? localDate(initialEvent.startAt, timeZone)
          : "",
      dueTime:
        task && !task.dateOnly
          ? localTime(task.dueAt, timeZone)
          : initialEvent && !("allDay" in initialEvent && initialEvent.allDay)
            ? localTime(initialEvent.startAt, timeZone)
            : "",
      estimatedMinutes: task ? String(task.estimatedMinutes) : "",
      tagIds: task?.tagIds ?? ([] as string[]),
      eventLink: initialLink,
    },
    onSubmit: async ({ value }) => {
      setValidationError("");
      try {
        if (!value.dueDate || !value.estimatedMinutes) {
          throw new Error("Indique une date limite et le temps estimé.");
        }
        const data = taskFieldsSchema.parse({
          ...value,
          estimatedMinutes: Number(value.estimatedMinutes),
          dateOnly: !value.dueTime,
          dueAt: zonedInstant(value.dueDate, value.dueTime || "23:59", timeZone),
          eventLink: value.eventLink,
        });
        const saved = await action.run(
          () =>
            task
              ? api.tasks.update({ ...data, id: task.id, revision: task.revision })
              : api.tasks.create(data),
          task ? "Tâche mise à jour" : "Une chose de moins à garder en tête",
        );
        if (saved) closeEditor();
      } catch (error) {
        setValidationError(errorMessage(error));
      }
    },
  });

  return (
    <form
      className="editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="title">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="task-title">Qu’as-tu à faire ?</FieldLabel>
              <Input
                id="task-title"
                autoFocus
                required
                maxLength={200}
                placeholder="Préparer le prochain DS…"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="task-notes">
                Quelques détails <span className="text-muted-foreground">· facultatif</span>
              </FieldLabel>
              <Textarea
                id="task-notes"
                rows={3}
                placeholder="Consignes, idées, liens utiles…"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <form.Field name="dueDate">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="task-date">Date limite</FieldLabel>
                <DatePicker
                  id="task-date"
                  value={field.state.value}
                  onChange={field.handleChange}
                  disabled={selectedLink !== null}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="dueTime">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="task-time">
                  Heure <span className="text-muted-foreground">· facultatif</span>
                </FieldLabel>
                <TimePicker
                  id="task-time"
                  value={field.state.value}
                  onChange={field.handleChange}
                  label="Heure de la date limite"
                  allowClear
                  disabled={selectedLink !== null}
                />
              </Field>
            )}
          </form.Field>
        </div>
        <form.Field name="estimatedMinutes">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="task-estimate">Temps estimé, en minutes</FieldLabel>
              <Input
                id="task-estimate"
                type="number"
                min={5}
                max={100000}
                required
                value={field.state.value}
                placeholder="Par exemple 60"
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldDescription>
                Une première idée suffit. Tu pourras l’ajuster en avançant.
              </FieldDescription>
            </Field>
          )}
        </form.Field>
        <form.Field name="priority">
          {(field) => (
            <Field>
              <FieldLabel id="priority-label">Priorité</FieldLabel>
              <ToggleGroup
                aria-labelledby="priority-label"
                variant="outline"
                value={[field.state.value]}
                onValueChange={(values) => {
                  if (values[0]) field.handleChange(values[0] as Task["priority"]);
                }}
              >
                <ToggleGroupItem value="low">Basse</ToggleGroupItem>
                <ToggleGroupItem value="normal">Normale</ToggleGroupItem>
                <ToggleGroupItem value="high">Haute</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        </form.Field>
        <form.Field name="tagIds">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="task-tags">
                Tags <span className="text-muted-foreground">· facultatif</span>
              </FieldLabel>
              <TagPicker value={field.state.value} onChange={field.handleChange} />
              <FieldDescription>
                Tes propres repères. Crée-les ici, au fil de tes tâches.
              </FieldDescription>
            </Field>
          )}
        </form.Field>
        {(snapshot.events.length > 0 ||
          snapshot.calendarSources.length > 0 ||
          selectedLink) && (
          <form.Field name="eventLink">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="task-event-date">
                  Associer à un événement · facultatif
                </FieldLabel>
                <DatePicker
                  id="task-event-date"
                  label="Jour de l’événement"
                  value={eventDate}
                  onChange={setEventDate}
                  allowClear={false}
                />
                <SelectControl
                  id="task-event"
                  label="Événement associé"
                  className="w-full"
                  options={[
                    { value: "none", label: "Aucun événement associé" },
                    ...(selectedLink &&
                    !selectableEvents.some((event) =>
                      sameEventLink(selectedLink, eventLinkFor(event)),
                    )
                      ? [
                          {
                            value: "linked",
                            label: selectedEvent?.title ?? "Événement associé",
                            disabled: true,
                          },
                        ]
                      : []),
                    ...selectableEvents.map((event) => ({
                      value: `${"sourceId" in event ? "imported" : "local"}:${event.occurrenceId}`,
                      label: `${event.title} · ${"sourceId" in event ? event.sourceName : "UpNext"} · ${localTime(event.startAt, timeZone)}`,
                    })),
                  ]}
                  value={
                    selectedLink
                      ? selectableEvents.some((event) =>
                          sameEventLink(selectedLink, eventLinkFor(event)),
                        )
                        ? `${"sourceId" in selectedEvent! ? "imported" : "local"}:${selectedEvent!.occurrenceId}`
                        : "linked"
                      : "none"
                  }
                  onValueChange={(nextValue) => {
                    const event = selectableEvents.find(
                      (item) =>
                        `${"sourceId" in item ? "imported" : "local"}:${item.occurrenceId}` ===
                        nextValue,
                    );
                    const link = event ? eventLinkFor(event) : null;
                    field.handleChange(link);
                    setSelectedLink(link);
                    if (!event) return;
                    form.setFieldValue("dueDate", localDate(event.startAt, timeZone));
                    form.setFieldValue(
                      "dueTime",
                      "allDay" in event && event.allDay
                        ? ""
                        : localTime(event.startAt, timeZone),
                    );
                  }}
                />
                <FieldDescription>
                  Choisis le jour, puis l’événement. La date limite suivra son début.
                </FieldDescription>
                {!selectableEvents.length && !imported.isFetching && !selectedLink && (
                  <p className="text-sm text-muted-foreground">Aucun événement ce jour-là.</p>
                )}
                {imported.isError && (
                  <p className="text-sm text-destructive">
                    Impossible de charger les événements externes.
                  </p>
                )}
              </Field>
            )}
          </form.Field>
        )}
        <FormError message={validationError || action.error} />
      </FieldGroup>
      <div className="editor-footer">
        <Button type="button" variant="outline" onClick={closeEditor}>
          Annuler
        </Button>
        <Button type="submit" disabled={action.pending}>
          {action.pending && <Spinner data-icon="inline-start" />}
          {task ? "Enregistrer" : "Créer la tâche"}
        </Button>
      </div>
    </form>
  );
}
