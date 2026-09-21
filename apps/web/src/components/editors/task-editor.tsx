"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  addCalendarDays,
  localDate,
  localTime,
  zonedInstant,
  taskFieldsSchema,
  type Task,
} from "@upnext/contracts";
import { api } from "@/lib/api";
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

export function TaskEditor({ task }: { task?: Task }) {
  const { snapshot, timeZone, now, closeEditor } = useWorkspace();
  const action = useAction();
  const [validationError, setValidationError] = useState("");
  const form = useForm({
    defaultValues: {
      title: task?.title ?? "",
      notes: task?.notes ?? "",
      priority: task?.priority ?? ("normal" as Task["priority"]),
      dueDate: task
        ? localDate(task.dueAt, timeZone)
        : addCalendarDays(localDate(now, timeZone), 1),
      dueTime: task && !task.dateOnly ? localTime(task.dueAt, timeZone) : "",
      estimatedMinutes: task?.estimatedMinutes ?? 60,
      tagIds: task?.tagIds ?? ([] as string[]),
      eventId: task?.eventId ?? "",
    },
    onSubmit: async ({ value }) => {
      setValidationError("");
      try {
        const data = taskFieldsSchema.parse({
          ...value,
          dateOnly: !value.dueTime,
          dueAt: zonedInstant(value.dueDate, value.dueTime || "23:59", timeZone),
          eventId: value.eventId || null,
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
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="dueDate">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="task-date">Date limite</FieldLabel>
                <DatePicker
                  id="task-date"
                  value={field.state.value}
                  onChange={field.handleChange}
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
                onChange={(event) => field.handleChange(Number(event.target.value))}
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
        {snapshot.events.length > 0 && (
          <form.Field name="eventId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="task-event">Préparer un événement</FieldLabel>
                <SelectControl
                  id="task-event"
                  className="w-full"
                  options={[
                    { value: "none", label: "Aucun événement associé" },
                    ...snapshot.events.map((event) => ({
                      value: event.id,
                      label: event.title,
                    })),
                  ]}
                  value={field.state.value || "none"}
                  onValueChange={(nextValue) => {
                    const eventId = nextValue === "none" ? "" : nextValue;
                    field.handleChange(eventId);
                    const linked = snapshot.events.find((item) => item.id === eventId);
                    if (linked) {
                      form.setFieldValue("dueDate", localDate(linked.startAt, timeZone));
                      form.setFieldValue("dueTime", localTime(linked.startAt, timeZone));
                    }
                  }}
                />
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
