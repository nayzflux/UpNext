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
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DatePicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (date: string) => void;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button id={id} variant="outline" className="w-full justify-start" />}
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
      </PopoverContent>
    </Popover>
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
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="datetime-local"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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
