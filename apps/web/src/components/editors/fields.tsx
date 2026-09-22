"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Plus } from "lucide-react";
import type { Tag } from "@upnext/contracts";
import { normalizeTagName } from "@upnext/contracts";
import { api } from "@/lib/api";
import { useAction, useWorkspace } from "../workspace-context";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SelectControl } from "../select-control";

const timeOptions = Array.from({ length: 24 * 12 }, (_, index) => {
  const hour = Math.floor(index / 12)
    .toString()
    .padStart(2, "0");
  const minute = ((index % 12) * 5).toString().padStart(2, "0");
  const value = `${hour}:${minute}`;

  return { value, label: value };
});

function getTimeOptions(value: string, allowClear: boolean) {
  const options = timeOptions.some((option) => option.value === value)
    ? timeOptions
    : [...timeOptions, { value, label: value }]
        .filter((option) => /^([01]\d|2[0-3]):[0-5]\d$/.test(option.value))
        .sort((first, second) => first.value.localeCompare(second.value));

  if (!allowClear) {
    return options;
  }

  return [{ value: "none", label: "Aucune heure" }, ...options];
}

export function DatePicker({
  value,
  onChange,
  id,
  label,
  allowClear = true,
}: {
  value: string;
  onChange: (date: string) => void;
  id: string;
  label?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-start"
            aria-label={label}
          />
        }
      >
        <CalendarDays data-icon="inline-start" />
        {value ? format(parseISO(value), "d MMMM yyyy", { locale: fr }) : "Choisir une date"}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          locale={fr}
          weekStartsOn={1}
          selected={value ? parseISO(value) : undefined}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
        />
        {allowClear && value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Effacer la date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function TimePicker({
  value,
  onChange,
  id,
  label,
  allowClear = true,
}: {
  value: string;
  onChange: (time: string) => void;
  id: string;
  label: string;
  allowClear?: boolean;
}) {
  return (
    <SelectControl
      id={id}
      options={getTimeOptions(value, allowClear)}
      value={value || (allowClear ? "none" : "")}
      onValueChange={(nextValue) => onChange(nextValue === "none" ? "" : nextValue)}
      label={label}
      placeholder="Choisir une heure"
      className="w-full"
    />
  );
}

export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { snapshot } = useWorkspace();
  const action = useAction();
  const [search, setSearch] = useState("");
  const anchor = useComboboxAnchor();
  const name = search.trim().replace(/\s+/g, " ");
  const found = snapshot.tags.some(
    (tag) => normalizeTagName(tag.name) === normalizeTagName(name),
  );
  const createOption = name && !found ? { id: "create", name: `Créer « ${name} »` } : null;
  const items = [
    ...snapshot.tags.filter((tag) =>
      normalizeTagName(tag.name).includes(normalizeTagName(search)),
    ),
    ...(createOption ? [createOption] : []),
  ];
  const selected = snapshot.tags.filter((tag) => value.includes(tag.id));

  async function change(tags: Tag[]) {
    if (tags.some((tag) => tag.id === "create")) {
      const created = await action.run(() => api.tags.create({ name }));
      if (created) {
        onChange([...new Set([...value, created.id])]);
        setSearch("");
      }
    } else {
      onChange(tags.map((tag) => tag.id));
    }
  }

  return (
    <Combobox
      multiple
      items={items}
      value={selected}
      onValueChange={(tags) => void change(tags)}
      inputValue={search}
      onInputValueChange={setSearch}
      itemToStringLabel={(tag: Tag) => tag.name}
      isItemEqualToValue={(a: Tag, b: Tag) => a.id === b.id}
      filter={null}
      disabled={action.pending}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(tags: Tag[]) =>
            tags.map((tag) => (
              <ComboboxChip key={tag.id} aria-label={`Retirer ${tag.name}`}>
                {tag.name}
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxChipsInput
          id="task-tags"
          placeholder="Rechercher ou créer un tag…"
          maxLength={50}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Écris un nom pour créer ton premier tag.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxGroup>
            {items.map((tag) => (
              <ComboboxItem key={tag.id} value={tag}>
                {tag.id === "create" && <Plus />}
                {tag.name}
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function DateTimeField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div
        role="group"
        aria-label={label}
        data-value={value}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <DatePicker
          id={id}
          label={label}
          value={value.split("T")[0] ?? ""}
          onChange={(date) => {
            const time = value.split("T")[1] ?? "";
            onChange(date ? (time ? `${date}T${time}` : date) : "");
          }}
        />
        <TimePicker
          id={`${id}-time`}
          label={`Heure de ${label.toLocaleLowerCase("fr")}`}
          value={value.split("T")[1] ?? ""}
          onChange={(time) => {
            const date = value.split("T")[0] ?? "";
            onChange(time ? `${date}T${time}` : date);
          }}
        />
      </div>
    </Field>
  );
}

export function FormError({ message }: { message: string }) {
  return message ? (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}
