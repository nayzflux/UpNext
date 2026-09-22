import {
  addCalendarDays,
  getTaskMetrics,
  localDate,
  zonedInstant,
  type Session,
  type Task,
  type WorkLog,
} from "@upnext/contracts";
import { minuteOfDay, type CalendarBlock } from "./calendar-layout";

export function groupDueTasks(tasks: Task[], now: Date, timeZone: string) {
  const today = localDate(now, timeZone);
  const active = tasks.filter((task) => task.progress < 100);
  const dueToday = active.filter((task) => localDate(task.dueAt, timeZone) === today);
  const overdue = active.filter((task) => localDate(task.dueAt, timeZone) < today);

  return {
    dueToday: dueToday.sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    overdue: overdue.sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    attention: [...overdue, ...dueToday],
  };
}

export function sessionsForDay(sessions: Session[], date: string, timeZone: string) {
  const start = new Date(zonedInstant(date, "00:00", timeZone));
  const end = new Date(zonedInstant(addCalendarDays(date, 1), "00:00", timeZone));

  return sessions
    .filter(
      (session) =>
        session.status !== "cancelled" &&
        new Date(session.startAt) < end &&
        new Date(session.endAt) > start,
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function summarizeUnplannedTasks(
  tasks: Task[],
  sessions: Session[],
  logs: WorkLog[],
  now: Date,
) {
  const items = tasks
    .filter((task) => task.progress < 100)
    .map((task) => ({
      task,
      minutes: getTaskMetrics(task, sessions, logs, now).unplannedMinutes,
    }))
    .filter((item) => item.minutes > 0)
    .sort((a, b) => a.task.dueAt.localeCompare(b.task.dueAt));

  return {
    items,
    totalMinutes: items.reduce((total, item) => total + item.minutes, 0),
  };
}

export function remainingTodayBlocks(blocks: CalendarBlock[], now: Date, timeZone: string) {
  const currentMinute = minuteOfDay(now.toISOString(), timeZone);
  const allDay: CalendarBlock[] = [];
  const timed: Array<CalendarBlock & { visibleStart: number }> = [];

  for (const block of blocks) {
    if (block.event && "sourceId" in block.event && block.event.allDay) {
      allDay.push(block);
      continue;
    }
    if (block.end <= currentMinute) {
      continue;
    }
    timed.push({
      ...block,
      visibleStart: Math.max(block.start, currentMinute),
    });
  }

  return { allDay, timed, currentMinute };
}
