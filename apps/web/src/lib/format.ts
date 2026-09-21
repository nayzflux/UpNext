import { formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";
import { localDate, localTime, zonedInstant } from "@upnext/contracts";

export function duration(minutes: number) {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const rest = rounded % 60;
  return `${Math.floor(rounded / 60)} h${rest ? ` ${rest.toString().padStart(2, "0")}` : ""}`;
}

export function formatDate(date: string | Date, timeZone: string, pattern = "d MMM") {
  return formatInTimeZone(date, timeZone, pattern, { locale: fr });
}

export function dateTimeInput(instant: string, timeZone: string) {
  return `${localDate(instant, timeZone)}T${localTime(instant, timeZone)}`;
}

export function inputToInstant(input: string, timeZone: string) {
  const [date, time] = input.split("T");
  return zonedInstant(date, time, timeZone);
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Une erreur est survenue. Réessaie dans un instant.";
}

export const priorityLabels = { low: "Basse", normal: "Normale", high: "Haute" };
export const planningLabels = {
  none: "Non planifiée",
  partial: "Partiellement planifiée",
  full: "Planifiée",
};
