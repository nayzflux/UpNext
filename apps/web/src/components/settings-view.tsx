"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarDays, Laptop, Moon, Plus, Sun, TagIcon, Trash2 } from "lucide-react";
import { preferencesSchema, type CalendarSource, type Preferences, type Tag } from "@upnext/contracts";
import { api } from "@/lib/api";
import { useAction, useWorkspace } from "./workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ConfirmAction, PageHeading } from "./common";
import { FormError, TimePicker } from "./editors/fields";
import { SelectControl } from "./select-control";

const weekdays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const timeZones = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/London",
  "America/Montreal",
  "America/New_York",
  "Asia/Tokyo",
  "UTC",
];

function TagSettingsRow({ tag }: { tag: Tag }) {
  const [name, setName] = useState(tag.name);
  const action = useAction();
  return (
    <form
      className="tag-settings-row"
      onSubmit={async (event) => {
        event.preventDefault();
        await action.run(() => api.tags.rename({ id: tag.id, name }), "Tag renommé");
      }}
    >
      <TagIcon className="size-4 text-muted-foreground" />
      <Input
        aria-label={`Nom du tag ${tag.name}`}
        required
        maxLength={50}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        size="sm"
        type="submit"
        variant="outline"
        disabled={action.pending || name.trim() === tag.name}
      >
        Renommer
      </Button>
      <ConfirmAction
        label={`Supprimer le tag « ${tag.name} » ?`}
        description="Le tag sera retiré des tâches. Les tâches seront conservées."
        onConfirm={() => action.run(() => api.tags.delete({ id: tag.id }), "Tag supprimé")}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Supprimer ${tag.name}`}
        >
          <Trash2 />
        </Button>
      </ConfirmAction>
    </form>
  );
}

function CalendarSourceRow({ source }: { source: CalendarSource }) {
  const [name, setName] = useState(source.name);
  const action = useAction();
  const queryClient = useQueryClient();
  return (
    <div className="rounded-lg border p-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const renamed = await action.run(() => api.calendarSources.rename({ id: source.id, name }), "Calendrier renommé");
          if (renamed) await queryClient.invalidateQueries({ queryKey: ["imported-events"] });
        }}
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <Input
          aria-label={`Nom du calendrier ${source.name}`}
          className="min-w-40 flex-1"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button size="sm" type="submit" variant="outline" disabled={action.pending || name.trim() === source.name}>Renommer</Button>
        <ConfirmAction
          label={`Supprimer le calendrier « ${source.name} » ?`}
          description="Ses événements importés seront retirés du planning."
          onConfirm={async () => {
            const deleted = await action.run(() => api.calendarSources.delete({ id: source.id }), "Calendrier supprimé");
            if (deleted) await queryClient.invalidateQueries({ queryKey: ["imported-events"] });
            return deleted;
          }}
        >
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Supprimer le calendrier ${source.name}`}><Trash2 /></Button>
        </ConfirmAction>
      </form>
      <p className="mt-2 break-all text-xs text-muted-foreground">{new URL(source.url).hostname}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {source.succeededAt
          ? `Dernière synchronisation : ${new Date(source.succeededAt).toLocaleString("fr-FR")}`
          : "Aucune synchronisation réussie"}
      </p>
      {source.error && <p className="mt-1 text-sm text-destructive" role="status">Erreur : {source.error}</p>}
    </div>
  );
}

function CalendarSourceSettings() {
  const { snapshot } = useWorkspace();
  const action = useAction();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return (
    <section className="settings-section">
      <div>
        <h2>Calendriers externes</h2>
        <p>Ajoute plusieurs liens ICS. Leurs événements occupent le planning et sont synchronisés pendant ton utilisation.</p>
      </div>
      <div className="flex flex-col gap-4">
        {snapshot.calendarSources.length ? snapshot.calendarSources.map((source) => (
          <CalendarSourceRow key={source.id} source={source} />
        )) : <p className="text-sm text-muted-foreground">Aucun calendrier externe ajouté.</p>}
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const created = await action.run(() => api.calendarSources.create({ name, url }), "Calendrier ajouté");
            if (created) {
              setName("");
              setUrl("");
              await queryClient.invalidateQueries({ queryKey: ["imported-events"] });
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor="calendar-source-name">Nom du calendrier</FieldLabel>
            <Input id="calendar-source-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Cours, agenda personnel…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="calendar-source-url">Lien ICS HTTPS</FieldLabel>
            <Input id="calendar-source-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://exemple.fr/calendrier.ics" />
          </Field>
          <FormError message={action.error} />
          <Button className="w-fit" type="submit" disabled={action.pending}>
            <Plus data-icon="inline-start" />
            {action.pending ? "Ajout…" : "Ajouter un calendrier"}
          </Button>
        </form>
      </div>
    </section>
  );
}

function PreferencesForm() {
  const { snapshot } = useWorkspace();
  const [values, setValues] = useState<Preferences>(snapshot.preferences);
  const [validationError, setValidationError] = useState("");
  const action = useAction();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setValidationError("");
    const parsed = preferencesSchema.safeParse(values);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Vérifie les horaires saisis.");
      return;
    }
    await action.run(() => api.preferences.save(parsed.data), "Préférences enregistrées");
  }

  function updateWindow(index: number, changes: Partial<Preferences["availability"][number]>) {
    setValues((current) => ({
      ...current,
      availability: current.availability.map((window, i) =>
        i === index ? { ...window, ...changes } : window,
      ),
    }));
  }

  return (
    <form className="flex flex-col gap-8" onSubmit={(event) => void save(event)}>
      <section className="settings-section">
        <div>
          <h2>Ton rythme</h2>
          <p>
            Ces plages servent de cadre aux suggestions. Tu gardes la main sur ton planning.
          </p>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="timezone">Fuseau horaire</FieldLabel>
            <SelectControl
              id="timezone"
              options={timeZones.map((zone) => ({ value: zone, label: zone }))}
              value={values.timeZone}
              onValueChange={(timeZone) => setValues({ ...values, timeZone })}
              className="w-full"
            />
            <FieldDescription>
              Les événements hebdomadaires existants conservent leur fuseau d’origine.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Disponibilités habituelles</FieldLabel>
            {values.availability.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucune plage renseignée. Ajoute les moments où tu peux généralement travailler.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {values.availability.map((window, index) => (
                <div className="availability-row" key={index}>
                  <SelectControl
                    label={`Jour de la plage ${index + 1}`}
                    options={weekdays.map((day, i) => ({
                      value: String(i + 1),
                      label: day,
                    }))}
                    value={String(window.weekday)}
                    onValueChange={(weekday) =>
                      updateWindow(index, { weekday: Number(weekday) })
                    }
                    className="w-full"
                  />
                  <TimePicker
                    id={`availability-${index}-start`}
                    label={`Début de la plage ${index + 1}`}
                    value={window.startTime}
                    onChange={(startTime) => updateWindow(index, { startTime })}
                  />
                  <span>à</span>
                  <TimePicker
                    id={`availability-${index}-end`}
                    label={`Fin de la plage ${index + 1}`}
                    value={window.endTime}
                    onChange={(endTime) => updateWindow(index, { endTime })}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Supprimer la plage ${index + 1}`}
                    onClick={() =>
                      setValues({
                        ...values,
                        availability: values.availability.filter((_, i) => index !== i),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              className="w-fit"
              variant="outline"
              disabled={values.availability.length >= 35}
              onClick={() =>
                setValues({
                  ...values,
                  availability: [
                    ...values.availability,
                    { weekday: 1, startTime: "17:00", endTime: "20:00" },
                  ],
                })
              }
            >
              <Plus data-icon="inline-start" />
              Ajouter une plage
            </Button>
          </Field>
        </FieldGroup>
      </section>
      <section className="settings-section">
        <div>
          <h2>Une ambiance à toi</h2>
          <p>La même clarté, de jour comme de nuit.</p>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel id="theme-label">Apparence</FieldLabel>
            <ToggleGroup
              variant="outline"
              aria-labelledby="theme-label"
              value={[values.theme]}
              onValueChange={(themes) => {
                if (themes[0])
                  setValues({ ...values, theme: themes[0] as Preferences["theme"] });
              }}
            >
              <ToggleGroupItem value="light">
                <Sun data-icon="inline-start" />
                Clair
              </ToggleGroupItem>
              <ToggleGroupItem value="dark">
                <Moon data-icon="inline-start" />
                Sombre
              </ToggleGroupItem>
              <ToggleGroupItem value="system">
                <Laptop data-icon="inline-start" />
                Système
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </FieldGroup>
      </section>
      <FormError message={validationError || action.error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={action.pending}>
          {action.pending ? "Enregistrement…" : "Enregistrer mes préférences"}
        </Button>
      </div>
    </form>
  );
}

export function SettingsView() {
  const { viewer, snapshot } = useWorkspace();
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="UN ESPACE QUI TE RESSEMBLE"
        title="Paramètres"
        description="Tes repères, tes disponibilités, ton rythme."
      />
      <section className="settings-section">
        <div>
          <h2>Mon compte</h2>
          <p>Ton espace est personnel. Tes tâches, tags et bilans restent privés.</p>
        </div>
        <div className="flex flex-col gap-3">
          <p className="font-semibold">{viewer.name}</p>
          <p className="text-sm text-muted-foreground">{viewer.email}</p>
          <Link
            href="/mot-de-passe-oublie"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Modifier mon mot de passe
          </Link>
        </div>
      </section>
      <PreferencesForm />
      <CalendarSourceSettings />
      <section className="settings-section">
        <div>
          <h2>Mes tags</h2>
          <p>
            Crée tes tags directement dans une tâche. Tu peux les renommer ou les retirer ici.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {snapshot.tags.length ? (
            snapshot.tags.map((tag) => (
              <TagSettingsRow key={`${tag.id}:${tag.name}`} tag={tag} />
            ))
          ) : (
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TagIcon />
                </EmptyMedia>
                <EmptyTitle>Tout reste à nommer</EmptyTitle>
                <EmptyDescription>
                  Tu n’as pas encore créé de tag. Aucun classement ne t’est imposé.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </section>
    </div>
  );
}
