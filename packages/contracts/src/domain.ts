import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type {
  CalendarEvent,
  Preferences,
  Session,
  Suggestion,
  Task,
  WorkLog,
} from "./schemas";

export function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase("fr-FR");
}

export function minutesBetween(start: string, end: string) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export function getTaskMetrics(
  task: Task,
  sessions: Session[],
  logs: WorkLog[],
  now = new Date(),
) {
  const remainingMinutes = Math.ceil(task.estimatedMinutes * (1 - task.progress / 100));
  const plannedMinutes = sessions
    .filter(
      (session) =>
        session.taskId === task.id &&
        session.status === "planned" &&
        new Date(session.endAt) > now,
    )
    .reduce((total, session) => total + minutesBetween(session.startAt, session.endAt), 0);
  const actualMinutes = logs
    .filter((log) => log.taskId === task.id)
    .reduce((total, log) => total + log.actualMinutes, 0);
  const unplannedMinutes = Math.max(0, remainingMinutes - plannedMinutes);
  let planning: "none" | "partial" | "full" = "none";

  if (remainingMinutes === 0 || plannedMinutes >= remainingMinutes) {
    planning = "full";
  } else if (plannedMinutes > 0) {
    planning = "partial";
  }

  return { remainingMinutes, plannedMinutes, actualMinutes, unplannedMinutes, planning };
}

export function suggestedEstimate(
  estimatedMinutes: number,
  actualMinutes: number,
  progress: number,
) {
  if (progress < 10 || progress >= 100 || actualMinutes < 30) {
    return null;
  }

  const estimate = Math.ceil(actualMinutes / (progress / 100) / 5) * 5;
  return estimate >= estimatedMinutes * 1.25 ? estimate : null;
}

export function percentageToMinutes(percentage: number, estimatedMinutes: number) {
  return Math.max(1, Math.round((estimatedMinutes * percentage) / 100));
}

export function overlaps(
  a: { startAt: string; endAt: string },
  b: { startAt: string; endAt: string },
) {
  return new Date(a.startAt) < new Date(b.endAt) && new Date(b.startAt) < new Date(a.endAt);
}

export function addCalendarDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function localDate(instant: Date | string, timeZone: string) {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

export function localTime(instant: Date | string, timeZone: string) {
  return formatInTimeZone(instant, timeZone, "HH:mm");
}

export function weekdayOfDate(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
}

export function zonedInstant(date: string, time: string, timeZone: string) {
  const result = fromZonedTime(`${date}T${time}:00`, timeZone);
  if (formatInTimeZone(result, timeZone, "yyyy-MM-dd'T'HH:mm") !== `${date}T${time}`) {
    throw new Error("Cet horaire n’existe pas dans ce fuseau à cause du changement d’heure.");
  }
  return result.toISOString();
}

export type EventOccurrence = CalendarEvent & { occurrenceId: string };

export function expandEvents(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = [];
  const range = { startAt: rangeStart, endAt: rangeEnd };

  for (const event of events) {
    if (!event.weekly) {
      if (overlaps(event, range)) {
        occurrences.push({ ...event, occurrenceId: event.id });
      }
      continue;
    }

    const anchorDate = localDate(event.startAt, event.timeZone);
    const endDate = localDate(event.endAt, event.timeZone);
    const spansMidnight = endDate > anchorDate;
    let date = addCalendarDays(localDate(rangeStart, event.timeZone), -1);
    const lastDate = localDate(rangeEnd, event.timeZone);

    while (date <= lastDate) {
      if (
        date >= anchorDate &&
        weekdayOfDate(date) === weekdayOfDate(anchorDate) &&
        (!event.repeatUntil || date <= event.repeatUntil)
      ) {
        try {
          const startAt = zonedInstant(
            date,
            localTime(event.startAt, event.timeZone),
            event.timeZone,
          );
          const endAt = zonedInstant(
            spansMidnight ? addCalendarDays(date, 1) : date,
            localTime(event.endAt, event.timeZone),
            event.timeZone,
          );
          if (overlaps({ startAt, endAt }, range)) {
            occurrences.push({
              ...event,
              startAt,
              endAt,
              occurrenceId: `${event.id}:${date}`,
            });
          }
        } catch {
          // A weekly occurrence in the skipped DST hour is omitted, never silently shifted.
        }
      }
      date = addCalendarDays(date, 1);
    }
  }

  return occurrences;
}

function timeInMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

export function suggestSlots(input: {
  task: Task;
  durationMinutes: number;
  preferences: Preferences;
  sessions: Session[];
  events: CalendarEvent[];
  logs: WorkLog[];
  now?: Date;
}): Suggestion[] {
  const { task, durationMinutes, preferences, sessions, events, logs } = input;
  const now = input.now ?? new Date();
  const horizon = new Date(
    Math.min(new Date(task.dueAt).getTime(), now.getTime() + 28 * 86400000),
  );
  if (task.progress === 100 || horizon <= now || durationMinutes <= 0) {
    return [];
  }

  const history = logs.filter(
    (log) =>
      !log.missed &&
      log.actualMinutes > 0 &&
      new Date(log.actualStartAt) >= new Date(now.getTime() - 56 * 86400000) &&
      new Date(log.actualStartAt) <= now,
  );
  const learned = history.length >= 3;
  const busy = [
    ...sessions.filter((session) => session.status === "planned"),
    ...expandEvents(events, now.toISOString(), horizon.toISOString()),
  ];
  const candidates: (Suggestion & { score: number })[] = [];
  let date = localDate(now, preferences.timeZone);
  const lastDate = localDate(horizon, preferences.timeZone);
  const dayNames = [
    "",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche",
  ];

  while (date <= lastDate) {
    const weekday = weekdayOfDate(date);
    const windows = preferences.availability.filter((window) => window.weekday === weekday);

    for (const window of windows) {
      for (
        let minute = Math.ceil(timeInMinutes(window.startTime) / 15) * 15;
        minute + durationMinutes <= timeInMinutes(window.endTime);
        minute += 15
      ) {
        let startAt: string;
        let endAt: string;
        try {
          startAt = zonedInstant(date, minutesToTime(minute), preferences.timeZone);
          endAt = new Date(
            new Date(startAt).getTime() + durationMinutes * 60000,
          ).toISOString();
          const windowEnd = zonedInstant(date, window.endTime, preferences.timeZone);
          if (endAt > windowEnd) continue;
        } catch {
          continue;
        }
        if (
          new Date(startAt) < now ||
          new Date(endAt) > horizon ||
          busy.some((slot) => overlaps(slot, { startAt, endAt }))
        )
          continue;

        let score = 0;
        if (learned) {
          for (const log of history) {
            const logDate = localDate(log.actualStartAt, preferences.timeZone);
            if (weekdayOfDate(logDate) !== weekday) continue;
            const bucket = Math.floor(
              timeInMinutes(localTime(log.actualStartAt, preferences.timeZone)) / 30,
            );
            const distance = Math.abs(Math.floor(minute / 30) - bucket);
            if (distance > 2) continue;
            const ageInWeeks =
              (now.getTime() - new Date(log.actualStartAt).getTime()) / (7 * 86400000);
            score += 1 / ((1 + ageInWeeks) * (1 + distance));
          }
        }
        const usesHabit = learned && score > 0;
        candidates.push({
          startAt,
          endAt,
          score,
          learned: usesHabit,
          reason: usesHabit
            ? `Tu travailles souvent le ${dayNames[weekday]} vers ${minutesToTime(minute).replace(":", " h ")}.`
            : "Un créneau libre dans tes disponibilités. Tes habitudes restent à établir.",
        });
      }
    }
    date = addCalendarDays(date, 1);
  }

  candidates.sort((a, b) => b.score - a.score || a.startAt.localeCompare(b.startAt));
  const selected: Suggestion[] = [];
  for (const candidate of candidates) {
    if (selected.some((slot) => overlaps(slot, candidate))) continue;
    selected.push({
      startAt: candidate.startAt,
      endAt: candidate.endAt,
      reason: candidate.reason,
      learned: candidate.learned,
    });
    if (selected.length === 3) break;
  }
  return selected;
}
