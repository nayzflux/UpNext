import {
  addCalendarDays,
  localDate,
  localTime,
  minutesBetween,
  zonedInstant,
  type EventOccurrence,
  type ImportedEvent,
  type Session,
  type Task,
} from "@upnext/contracts";

export const hourHeight = 48;
export const pixelsPerMinute = hourHeight / 60;
export const quarterHeight = 15 * pixelsPerMinute;

export type CalendarDrag =
  | { kind: "task"; task: Task; durationMinutes: number }
  | { kind: "session" | "resize"; session: Session };

export type CalendarPreview = {
  kind: CalendarDrag["kind"];
  taskId: string;
  sessionId?: string;
  startAt: string;
  endAt: string;
};

export type CalendarBlock = {
  id: string;
  title: string;
  start: number;
  end: number;
  startAt: string;
  endAt: string;
  lane: number;
  lanes: number;
  session?: Session;
  event?: EventOccurrence | ImportedEvent;
  preview?: boolean;
  resizing?: boolean;
};

export function minuteOfDay(instant: string, timeZone: string) {
  const [hours, minutes] = localTime(instant, timeZone).split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeFromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${(minutes % 60).toString().padStart(2, "0")}`;
}

export function snapMinute(minutes: number, minimum = 0, maximum = 1425) {
  return Math.max(minimum, Math.min(maximum, Math.round(minutes / 15) * 15));
}

export function resizeDuration(originalMinutes: number, deltaPixels: number) {
  return snapMinute(originalMinutes + deltaPixels / pixelsPerMinute, 15, 1440);
}

export function createPreview(
  drag: CalendarDrag,
  date: string,
  minute: number,
  timeZone: string,
  durationOverride?: number,
): CalendarPreview {
  const durationMinutes =
    durationOverride ??
    (drag.kind === "task"
      ? drag.durationMinutes
      : minutesBetween(drag.session.startAt, drag.session.endAt));
  const startAt =
    drag.kind === "resize"
      ? drag.session.startAt
      : zonedInstant(date, timeFromMinutes(snapMinute(minute)), timeZone);
  return {
    kind: drag.kind,
    taskId: drag.kind === "task" ? drag.task.id : drag.session.taskId,
    sessionId: drag.kind === "task" ? undefined : drag.session.id,
    startAt,
    endAt: new Date(new Date(startAt).getTime() + durationMinutes * 60000).toISOString(),
  };
}

function placeInLanes(blocks: CalendarBlock[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: CalendarBlock[] = [];
  let groupEnd = -1;
  function finishGroup() {
    const laneEnds: number[] = [];
    for (const block of group) {
      let lane = laneEnds.findIndex((end) => end <= block.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = block.end;
      block.lane = lane;
    }
    for (const block of group) block.lanes = laneEnds.length;
  }
  for (const block of sorted) {
    if (block.start >= groupEnd && group.length) {
      finishGroup();
      group = [];
    }
    group.push(block);
    groupEnd = Math.max(groupEnd, block.end);
  }
  finishGroup();
  return sorted;
}

export function dayBlocks(
  date: string,
  timeZone: string,
  tasks: Task[],
  sessions: Session[],
  events: (EventOccurrence | ImportedEvent)[],
  preview: CalendarPreview | null = null,
) {
  const startAt = zonedInstant(date, "00:00", timeZone);
  const endAt = zonedInstant(addCalendarDays(date, 1), "00:00", timeZone);
  const items: Omit<CalendarBlock, "start" | "end" | "lane" | "lanes">[] = [];
  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    // Moving uses a separate preview. Resizing keeps the original card and DOM node.
    if (preview?.sessionId === session.id && preview.kind === "session") continue;
    const resizing = preview?.sessionId === session.id && preview.kind === "resize";
    items.push({
      id: `${session.id}:${date}`,
      title: tasks.find((task) => task.id === session.taskId)?.title ?? "Séance",
      startAt: session.startAt,
      endAt: resizing ? preview.endAt : session.endAt,
      session,
      resizing,
    });
  }
  for (const event of events) {
    items.push({
      id: event.occurrenceId,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      event,
    });
  }
  if (preview && preview.kind !== "resize") {
    items.push({
      id: `preview:${date}`,
      title: tasks.find((task) => task.id === preview.taskId)?.title ?? "Séance",
      startAt: preview.startAt,
      endAt: preview.endAt,
      preview: true,
    });
  }
  return placeInLanes(
    items
      .filter(
        (item) =>
          new Date(item.startAt) < new Date(endAt) && new Date(item.endAt) > new Date(startAt),
      )
      .map((item) => ({
        ...item,
        start:
          localDate(item.startAt, timeZone) < date ? 0 : minuteOfDay(item.startAt, timeZone),
        end: localDate(item.endAt, timeZone) > date ? 1440 : minuteOfDay(item.endAt, timeZone),
        lane: 0,
        lanes: 1,
      })),
  );
}

export function visibleHours(blocks: CalendarBlock[], fullDay: boolean) {
  if (fullDay) return { start: 0, end: 1440 };
  // Never hide an existing event. Empty hours at the edges can be unfolded on demand.
  const earliest = Math.min(8 * 60, ...blocks.map((block) => block.start));
  const latest = Math.max(20 * 60, ...blocks.map((block) => block.end));
  return {
    start: Math.max(0, Math.floor(earliest / 60) * 60),
    end: Math.min(1440, Math.ceil(latest / 60) * 60),
  };
}
