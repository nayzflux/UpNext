"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { z } from "zod";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  addCalendarDays,
  expandEvents,
  getTaskMetrics,
  localDate,
  minutesBetween,
  weekdayOfDate,
  zonedInstant,
  type Session,
  type Snapshot,
} from "@upnext/contracts";
import { api, orpc } from "@/lib/api";
import { duration, errorMessage, formatDate } from "@/lib/format";
import {
  hourHeight,
  pixelsPerMinute,
  quarterHeight,
  createPreview,
  dayBlocks,
  minuteOfDay,
  resizeDuration,
  timeFromMinutes,
  visibleHours,
  type CalendarDrag,
  type CalendarPreview,
} from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { PageHeading } from "./common";
import { BacklogTask, DayColumn } from "./calendar-grid";

export function CalendarView() {
  const { snapshot, now, timeZone, openEditor } = useWorkspace();
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date");
  const [date, setDate] = useState(
    requestedDate && z.iso.date().safeParse(requestedDate).success
      ? requestedDate
      : localDate(now, timeZone),
  );
  const [view, setView] = useState("week");
  const [mobile, setMobile] = useState(false);
  const [dragging, setDragging] = useState<CalendarDrag | null>(null);
  const [preview, setPreview] = useState<CalendarPreview | null>(null);
  const [fullDay, setFullDay] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef({ pageY: 0, grabOffset: 0 });
  const queryClient = useQueryClient();
  const key = orpc.dashboard.get.queryOptions().queryKey;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, { currentCoordinates }) => {
        const dayWidth =
          grid.current?.querySelector("[data-calendar-date]")?.getBoundingClientRect().width ??
          100;
        if (event.code === "ArrowDown")
          return { ...currentCoordinates, y: currentCoordinates.y + quarterHeight };
        if (event.code === "ArrowUp")
          return { ...currentCoordinates, y: currentCoordinates.y - quarterHeight };
        if (event.code === "ArrowRight")
          return { ...currentCoordinates, x: currentCoordinates.x + dayWidth };
        if (event.code === "ArrowLeft")
          return { ...currentCoordinates, x: currentCoordinates.x - dayWidth };
        return undefined;
      },
    }),
  );
  const effectiveView = mobile && view === "week" ? "day" : view;
  const firstDate =
    effectiveView === "week"
      ? addCalendarDays(date, 1 - weekdayOfDate(date))
      : effectiveView === "month"
        ? addCalendarDays(
            `${date.slice(0, 7)}-01`,
            1 - weekdayOfDate(`${date.slice(0, 7)}-01`),
          )
        : date;
  const dayCount = effectiveView === "week" ? 7 : effectiveView === "month" ? 42 : 1;
  const dates = Array.from({ length: dayCount }, (_, index) =>
    addCalendarDays(firstDate, index),
  );
  const rangeStart = zonedInstant(firstDate, "00:00", timeZone);
  const rangeEnd = zonedInstant(addCalendarDays(firstDate, dayCount), "00:00", timeZone);
  const occurrences = useMemo(
    () => expandEvents(snapshot.events, rangeStart, rangeEnd),
    [snapshot.events, rangeStart, rangeEnd],
  );
  const activeSessions = snapshot.sessions.filter((session) => session.status !== "cancelled");
  const backlog = snapshot.tasks
    .filter(
      (task) =>
        task.progress < 100 &&
        getTaskMetrics(task, snapshot.sessions, snapshot.logs, now).unplannedMinutes > 0,
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const originalBlocks = dates.map((day) =>
    dayBlocks(day, timeZone, snapshot.tasks, activeSessions, occurrences),
  );
  const hours = visibleHours(originalBlocks.flat(), fullDay);
  const blocks = dates.map((day) =>
    dayBlocks(day, timeZone, snapshot.tasks, activeSessions, occurrences, preview),
  );
  const lastMinute = Math.max(
    hours.end,
    ...blocks.flat().map((block) => Math.ceil(block.end / 60) * 60),
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const move = useMutation({
    mutationFn: (input: { session: Session; startAt: string; endAt: string }) =>
      api.sessions.save({
        ...input.session,
        startAt: input.startAt,
        endAt: input.endAt,
        allowOverlap: false,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Snapshot>(key);
      queryClient.setQueryData<Snapshot>(key, (current) =>
        current
          ? {
              ...current,
              sessions: current.sessions.map((session) =>
                session.id === input.session.id
                  ? { ...session, startAt: input.startAt, endAt: input.endAt }
                  : session,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (error, input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.add({
        title: "La séance a retrouvé sa place",
        description: errorMessage(error),
        type: "error",
        actionProps: {
          children: "Modifier",
          onClick: () =>
            openEditor({
              type: "session",
              sessionId: input.session.id,
              startAt: input.startAt,
            }),
        },
      });
    },
    onSuccess: () => toast.add({ title: "Planning mis à jour", type: "success" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  function dragStart(event: DragStartEvent) {
    const data = event.active.data.current as CalendarDrag;
    const activator = event.activatorEvent;
    const isPointer = "clientY" in activator && "clientX" in activator;
    const originCard =
      activator.target instanceof Element
        ? activator.target.closest<HTMLElement>("[data-session-id]")
        : null;
    pointer.current = isPointer
      ? { x: Number(activator.clientX), y: Number(activator.clientY) }
      : null;
    dragOrigin.current = {
      pageY: isPointer ? Number(activator.clientY) + window.scrollY : 0,
      grabOffset:
        isPointer && data.kind === "session" && originCard
          ? Number(activator.clientY) - originCard.getBoundingClientRect().top
          : 0,
    };
    setDragging(data);
    setPreview(
      data.kind === "task"
        ? null
        : createPreview(
            data,
            localDate(data.session.startAt, timeZone),
            minuteOfDay(data.session.startAt, timeZone),
            timeZone,
          ),
    );
  }

  function previewFor(event: DragMoveEvent | DragEndEvent) {
    const data = event.active.data.current as CalendarDrag;
    if (data.kind === "resize") {
      const delta = pointer.current
        ? pointer.current.y + window.scrollY - dragOrigin.current.pageY
        : event.delta.y;
      return createPreview(
        data,
        localDate(data.session.startAt, timeZone),
        0,
        timeZone,
        resizeDuration(minutesBetween(data.session.startAt, data.session.endAt), delta),
      );
    }
    const columns = Array.from(
      grid.current?.querySelectorAll<HTMLElement>("[data-calendar-date]") ?? [],
    );
    const translated = event.active.rect.current.translated;
    const point =
      pointer.current ??
      (translated ? { x: translated.left + translated.width / 2, y: translated.top } : null);
    if (!point) return null;
    const column = columns.find((element) => {
      const rect = element.getBoundingClientRect();
      return (
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
      );
    });
    if (!column) return null;
    const top = column.getBoundingClientRect().top;
    const minute =
      hours.start + (point.y - top - dragOrigin.current.grabOffset) / pixelsPerMinute;
    return createPreview(data, column.dataset.calendarDate!, minute, timeZone);
  }

  function dragMove(event: DragMoveEvent) {
    if (move.isPending) return;
    try {
      setPreview(previewFor(event));
    } catch {
      setPreview(null);
    }
  }

  function cancelDrag() {
    setDragging(null);
    setPreview(null);
    pointer.current = null;
  }

  function dragEnd(event: DragEndEvent) {
    const data = event.active.data.current as CalendarDrag;
    try {
      const result = previewFor(event);
      cancelDrag();
      if (!result || move.isPending) return;
      if (data.kind === "task") {
        openEditor({
          type: "session",
          taskId: data.task.id,
          startAt: result.startAt,
          durationMinutes: data.durationMinutes,
        });
      } else if (
        result.startAt !== data.session.startAt ||
        result.endAt !== data.session.endAt
      ) {
        move.mutate({ session: data.session, startAt: result.startAt, endAt: result.endAt });
      }
    } catch (error) {
      cancelDrag();
      toast.add({ title: errorMessage(error), type: "error" });
    }
  }

  function rememberPointer(event: ReactPointerEvent) {
    if (dragging) pointer.current = { x: event.clientX, y: event.clientY };
  }

  function navigate(direction: number) {
    if (effectiveView === "month") {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + direction);
      setDate(next.toISOString().slice(0, 10));
    } else {
      setDate(addCalendarDays(date, direction * dayCount));
    }
  }

  function blocksFor(day: string) {
    return blocks[dates.indexOf(day)] ?? [];
  }

  return (
    <div className="flex flex-col gap-6" onPointerMoveCapture={rememberPointer}>
      <PageHeading
        eyebrow="UNE PLACE POUR CHAQUE CHOSE"
        title="Mon calendrier"
        description="Un planning souple, qui avance avec toi."
      >
        <Button variant="outline" onClick={() => openEditor({ type: "event" })}>
          <CalendarPlus data-icon="inline-start" />
          Événement
        </Button>
        <Button
          disabled={!snapshot.tasks.some((task) => task.progress < 100)}
          onClick={() => openEditor({ type: "session" })}
        >
          <Plus data-icon="inline-start" />
          Séance
        </Button>
      </PageHeading>
      <DndContext
        sensors={sensors}
        autoScroll={false}
        collisionDetection={(args) => {
          const hits = pointerWithin(args);
          return hits.length ? hits : rectIntersection(args);
        }}
        onDragStart={dragStart}
        onDragMove={dragMove}
        onDragOver={dragMove}
        onDragCancel={cancelDrag}
        onDragEnd={dragEnd}
      >
        <div className="calendar-layout">
          <aside className="calendar-backlog">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">À planifier</h2>
              <Badge variant="secondary">{backlog.length}</Badge>
            </div>
            <p className="mt-2 mb-5 text-xs leading-relaxed text-muted-foreground">
              Glisse une tâche dans ton agenda ou choisis son créneau.
            </p>
            <div className="flex flex-col gap-3">
              {backlog.map((task) => (
                <BacklogTask key={task.id} task={task} />
              ))}
              {backlog.length === 0 && (
                <Empty className="px-2 py-8">
                  <EmptyHeader>
                    <EmptyTitle>Tout a sa place</EmptyTitle>
                    <EmptyDescription>
                      Les tâches encore à planifier apparaîtront ici.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
            <Button
              className="mt-5 w-full"
              variant="outline"
              onClick={() => openEditor({ type: "task" })}
            >
              <Plus data-icon="inline-start" />
              Nouvelle tâche
            </Button>
          </aside>
          <section className="calendar-surface">
            <div className="calendar-toolbar">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Période précédente"
                  onClick={() => navigate(-1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Période suivante"
                  onClick={() => navigate(1)}
                >
                  <ChevronRight />
                </Button>
                <h2>
                  {formatDate(
                    zonedInstant(date, "12:00", timeZone),
                    timeZone,
                    effectiveView === "day" ? "d MMMM yyyy" : "MMMM yyyy",
                  )}
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-2"
                  onClick={() => setDate(localDate(now, timeZone))}
                >
                  Aujourd’hui
                </Button>
              </div>
              <ToggleGroup
                aria-label="Vue du calendrier"
                value={[effectiveView]}
                onValueChange={(values) => {
                  if (values[0]) setView(values[0]);
                }}
              >
                <ToggleGroupItem value="day">Jour</ToggleGroupItem>
                {!mobile && <ToggleGroupItem value="week">Semaine</ToggleGroupItem>}
                <ToggleGroupItem value="month">Mois</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {effectiveView !== "month" && (
              <div className="calendar-range-bar">
                <span>
                  {timeFromMinutes(hours.start)}–{timeFromMinutes(lastMinute)} · pas de 15 min
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFullDay(!fullDay)}
                  aria-pressed={fullDay}
                >
                  {fullDay ? "Adapter aux séances" : "Afficher les 24 heures"}
                </Button>
              </div>
            )}
            {effectiveView === "month" ? (
              <div className="month-grid">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
                  <div className="month-label" key={day}>
                    {day}
                  </div>
                ))}
                {dates.map((day) => {
                  const blocks = blocksFor(day);
                  const deadlines = snapshot.tasks.filter(
                    (task) => localDate(task.dueAt, timeZone) === day && task.progress < 100,
                  );
                  return (
                    <div
                      key={day}
                      className={cn(
                        "month-day",
                        day.slice(0, 7) !== date.slice(0, 7) && "outside-month",
                        day === localDate(now, timeZone) && "is-today",
                      )}
                    >
                      <button
                        className="month-date"
                        onClick={() => {
                          setDate(day);
                          setView("day");
                        }}
                      >
                        {Number(day.slice(-2))}
                      </button>
                      {blocks.slice(0, 3).map((block) => (
                        <button
                          key={block.id}
                          className={block.session ? "month-session" : "month-event"}
                          onClick={() =>
                            block.session
                              ? openEditor({ type: "detail", taskId: block.session.taskId })
                              : openEditor({ type: "event", eventId: block.event!.id })
                          }
                        >
                          {block.title}
                        </button>
                      ))}
                      {deadlines.slice(0, 1).map((task) => (
                        <button
                          key={task.id}
                          className="month-deadline"
                          onClick={() => openEditor({ type: "detail", taskId: task.id })}
                        >
                          À rendre · {task.title}
                        </button>
                      ))}
                      {blocks.length > 3 && (
                        <button
                          className="text-xs text-muted-foreground"
                          onClick={() => {
                            setDate(day);
                            setView("day");
                          }}
                        >
                          + {blocks.length - 3} autres
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div
                  className="calendar-day-headings"
                  style={{ gridTemplateColumns: `48px repeat(${dayCount}, minmax(0, 1fr))` }}
                >
                  <span className="time-zone-label">24 h</span>
                  {dates.map((day) => (
                    <button
                      key={day}
                      className={day === localDate(now, timeZone) ? "is-today" : ""}
                      onClick={() => {
                        setDate(day);
                        setView("day");
                      }}
                    >
                      <span>
                        {formatDate(zonedInstant(day, "12:00", timeZone), timeZone, "EEE")}
                      </span>
                      <strong>{Number(day.slice(-2))}</strong>
                      <div className="day-deadlines">
                        {snapshot.tasks
                          .filter(
                            (task) =>
                              task.progress < 100 && localDate(task.dueAt, timeZone) === day,
                          )
                          .slice(0, 2)
                          .map((task) => (
                            <span key={task.id} title={task.title}>
                              À rendre · {task.title}
                            </span>
                          ))}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="calendar-grid-container" ref={grid}>
                  <div
                    className="calendar-time-grid"
                    role="grid"
                    aria-label="Agenda horaire"
                    style={{ gridTemplateColumns: `48px repeat(${dayCount}, minmax(0, 1fr))` }}
                  >
                    <div className="calendar-hours">
                      {Array.from({ length: (lastMinute - hours.start) / 60 }, (_, hour) => (
                        <span style={{ top: hour * hourHeight }} key={hour}>
                          {timeFromMinutes(hours.start + hour * 60)}
                        </span>
                      ))}
                    </div>
                    {dates.map((day, index) => (
                      <DayColumn
                        key={day}
                        date={day}
                        blocks={blocksFor(day)}
                        originBlocks={originalBlocks[index]}
                        firstMinute={hours.start}
                        lastMinute={lastMinute}
                        movingSessionId={
                          preview?.kind === "session" ? preview.sessionId : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="calendar-legend">
              <span>
                <i className="work-legend" />
                Séances de travail
              </span>
              <span>
                <i className="event-legend" />
                Événements
              </span>
              <span>Horaires · {timeZone}</span>
            </div>
          </section>
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {preview &&
            `${formatDate(preview.startAt, timeZone, "EEEE HH:mm")} à ${formatDate(preview.endAt, timeZone, "HH:mm")}, ${duration(minutesBetween(preview.startAt, preview.endAt))}`}
        </div>
      </DndContext>
    </div>
  );
}
