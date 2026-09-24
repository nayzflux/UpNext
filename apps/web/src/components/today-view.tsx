"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock3,
  Plus,
  Sun,
} from "lucide-react";
import {
  addCalendarDays,
  expandEvents,
  localDate,
  minutesBetween,
  weekdayOfDate,
  zonedInstant,
} from "@upnext/contracts";
import { api } from "@/lib/api";
import { dayBlocks, type CalendarBlock } from "@/lib/calendar-layout";
import { duration, formatDate } from "@/lib/format";
import { tasksForEvent } from "@/lib/event-links";
import {
  groupDueTasks,
  remainingTodayBlocks,
  sessionsForDay,
  summarizeUnplannedTasks,
} from "@/lib/today";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeading, TaskRow } from "./common";
import { useWorkspace } from "./workspace-context";

const miniPixelsPerMinute = 0.6;

function sessionStatus(status: "planned" | "completed" | "missed" | "expired" | "cancelled") {
  if (status === "completed") return "Effectuée";
  if (status === "missed") return "Manquée";
  if (status === "expired") return "Bilan en retard";
  if (status === "cancelled") return "Annulée";
  return "Prévue";
}

export function TodayView() {
  const { snapshot, now, timeZone, viewer, openEditor } = useWorkspace();
  const today = localDate(now, timeZone);
  const start = zonedInstant(today, "00:00", timeZone);
  const end = zonedInstant(addCalendarDays(today, 1), "00:00", timeZone);
  const imported = useQuery({
    queryKey: ["imported-events", start, end],
    queryFn: () => api.importedEvents.list({ startAt: start, endAt: end }),
    enabled: snapshot.calendarSources.length > 0,
  });
  const active = snapshot.tasks.filter((task) => task.progress < 100);
  const tasksToDo = [...active].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const due = groupDueTasks(snapshot.tasks, now, timeZone);
  const sessions = sessionsForDay(snapshot.sessions, today, timeZone);
  const sessionMinutes = sessions.reduce(
    (total, session) => total + minutesBetween(session.startAt, session.endAt),
    0,
  );
  const events = [
    ...expandEvents(snapshot.events, start, end),
    ...(snapshot.calendarSources.length ? (imported.data ?? []) : []),
  ];
  const unplanned = summarizeUnplannedTasks(
    snapshot.tasks,
    snapshot.sessions,
    snapshot.logs,
    now,
  );
  const blocks = dayBlocks(today, timeZone, snapshot.tasks, sessions, events);
  const remaining = remainingTodayBlocks(blocks, now, timeZone);
  const weekStart = addCalendarDays(today, 1 - weekdayOfDate(today));
  const miniStart = Math.floor(remaining.currentMinute / 60) * 60;
  const lastBlockEnd = Math.max(
    remaining.currentMinute,
    ...remaining.timed.map((block) => block.end),
  );
  const minimumEnd = Math.min(
    1440,
    remaining.currentMinute < 20 * 60 ? Math.max(20 * 60, miniStart + 180) : miniStart + 120,
  );
  const miniEnd = Math.min(1440, Math.ceil(Math.max(lastBlockEnd, minimumEnd) / 60) * 60);
  const miniHeight = Math.max(60, (miniEnd - miniStart) * miniPixelsPerMinute);
  const hourLabels = Array.from(
    { length: Math.max(1, Math.ceil((miniEnd - miniStart) / 60)) },
    (_, index) => miniStart + index * 60,
  );

  function openSession(session: (typeof sessions)[number]) {
    if (session.status === "planned" && new Date(session.endAt) > now) {
      openEditor({ type: "session", sessionId: session.id });
      return;
    }
    if (session.status === "planned" || session.status === "expired") {
      openEditor({ type: "log", taskId: session.taskId, sessionId: session.id });
      return;
    }
    openEditor({ type: "detail", taskId: session.taskId });
  }

  function openBlock(block: CalendarBlock) {
    if (block.session) {
      openSession(block.session);
      return;
    }
    if (block.event && "sourceId" in block.event) {
      openEditor({ type: "importedEvent", event: block.event });
      return;
    }
    if (block.event) {
      openEditor({
        type: "event",
        eventId: block.event.id,
        occurrenceIndex: block.event.occurrenceIndex,
      });
    }
  }

  return (
    <div className="today-page">
      <PageHeading
        eyebrow={formatDate(now, timeZone, "EEEE d MMMM yyyy").toUpperCase()}
        title={`Bonjour ${viewer.name.split(" ")[0]}.`}
        description="On fait un peu de place dans ta journée ?"
      >
        <Button onClick={() => openEditor({ type: "task" })}>
          <Plus data-icon="inline-start" />
          Nouvelle tâche
        </Button>
      </PageHeading>

      {imported.isError && (
        <p className="text-sm text-destructive" role="alert">
          Impossible de charger les calendriers externes.
        </p>
      )}

      <section className="day-intro" aria-labelledby="day-intro-title">
        <div className="day-intro-copy">
          <p className="eyebrow">AUJOURD’HUI</p>
          <h2 id="day-intro-title">Une journée qui te ressemble.</h2>
          <p>
            {sessions.length
              ? `${sessions.length} ${sessions.length === 1 ? "séance" : "séances"} pour ${duration(sessionMinutes)} au total.`
              : "Aucune séance prévue pour le moment."}
          </p>
          <Link href={`/calendrier?date=${today}`}>
            Voir ma journée
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="day-intro-symbol" aria-hidden="true">
          <Sun />
        </div>
        <dl className="day-intro-stats">
          <div>
            <dt>Séances</dt>
            <dd>
              <strong>{sessions.length}</strong>
              <small>
                {sessionMinutes ? duration(sessionMinutes) : "Aucun temps réservé"}
              </small>
            </dd>
          </div>
          <div>
            <dt>À rendre</dt>
            <dd>
              <strong>{due.attention.length}</strong>
              <small>
                {due.attention.length ? "Aujourd’hui ou en retard" : "Rien d’urgent"}
              </small>
            </dd>
          </div>
        </dl>
      </section>

      <div className="today-primary-grid">
        <section className="min-w-0">
          <div className="section-heading">
            <h2>
              Tâches à faire <span>{tasksToDo.length}</span>
            </h2>
            <Link href="/taches">
              Toutes les tâches
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <div className="surface">
            {tasksToDo.length ? (
              tasksToDo.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)
            ) : (
              <Empty className="today-empty">
                <EmptyHeader>
                  <EmptyTitle>Tout est terminé</EmptyTitle>
                  <EmptyDescription>Tu n’as plus de tâche active à faire.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </section>

        <section className="min-w-0">
          <div className="section-heading">
            <h2>
              Séances du jour <span>{sessions.length}</span>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={!active.length}
              onClick={() => openEditor({ type: "session" })}
            >
              <Plus data-icon="inline-start" />
              Ajouter
            </Button>
          </div>
          <div className="surface today-sessions">
            {sessions.length ? (
              sessions.map((session) => {
                const task = snapshot.tasks.find((item) => item.id === session.taskId);
                const ended = new Date(session.endAt) <= now;
                return (
                  <div
                    className={cn("today-session-row", ended && "is-past")}
                    key={session.id}
                  >
                    <div className="today-session-time">
                      <strong>{formatDate(session.startAt, timeZone, "HH:mm")}</strong>
                      <span>{formatDate(session.endAt, timeZone, "HH:mm")}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-left"
                      onClick={() => openSession(session)}
                    >
                      <span>
                        <span className="block truncate font-semibold">
                          {task?.title ?? "Séance"}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {duration(minutesBetween(session.startAt, session.endAt))}
                        </span>
                      </span>
                    </Button>
                    <div className="today-session-status">
                      <Badge variant={session.status === "planned" ? "secondary" : "outline"}>
                        {ended && session.status === "planned"
                          ? "Bilan à faire"
                          : sessionStatus(session.status)}
                      </Badge>
                      {session.status === "planned" && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Faire le bilan de ${task?.title ?? "la séance"}`}
                          onClick={() =>
                            openEditor({
                              type: "log",
                              taskId: session.taskId,
                              sessionId: session.id,
                            })
                          }
                        >
                          <Check />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty className="today-empty">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarPlus />
                  </EmptyMedia>
                  <EmptyTitle>Aucune séance aujourd’hui</EmptyTitle>
                  <EmptyDescription>
                    La journée est encore entièrement disponible.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </section>
      </div>

      <section>
        <div className="section-heading">
          <div>
            <h2>
              À planifier <span>{unplanned.items.length}</span>
            </h2>
            <p className="today-section-description">
              {unplanned.totalMinutes
                ? `${duration(unplanned.totalMinutes)} n’ont pas encore de créneau.`
                : "Tout le travail restant a trouvé sa place."}
            </p>
          </div>
          <Link href="/calendrier">
            Organiser la suite
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="surface today-planning-list">
          {unplanned.items.length ? (
            unplanned.items.slice(0, 5).map(({ task, minutes }) => (
              <div className="today-planning-row" key={task.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-left"
                  onClick={() => openEditor({ type: "detail", taskId: task.id })}
                >
                  <span>
                    <span className="block truncate font-semibold">{task.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Échéance {formatDate(task.dueAt, timeZone)}
                    </span>
                  </span>
                </Button>
                <div className="today-planning-duration">
                  <strong>{duration(minutes)}</strong>
                  <span>à placer</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Planifier ${task.title}`}
                  onClick={() => openEditor({ type: "session", taskId: task.id })}
                >
                  <CalendarClock />
                </Button>
              </div>
            ))
          ) : (
            <Empty className="today-empty">
              <EmptyHeader>
                <EmptyTitle>Le planning est à jour</EmptyTitle>
                <EmptyDescription>Chaque tâche active a déjà un créneau.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <h2>La suite aujourd’hui</h2>
            <p className="today-section-description">Les créneaux terminés sont masqués.</p>
          </div>
          <Link href={`/calendrier?date=${today}`}>
            Calendrier complet
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="surface today-mini-calendar">
          {remaining.allDay.length > 0 && (
            <div className="today-all-day">
              <span>Journée</span>
              <div>
                {remaining.allDay.map((block) => (
                  <Button
                    type="button"
                    variant="ghost"
                    className="today-all-day-event"
                    key={block.id}
                    onClick={() => openBlock(block)}
                  >
                    <span className="truncate font-semibold">{block.title}</span>
                    {block.event && tasksForEvent(snapshot.tasks, block.event).length > 0 && (
                      <span className="text-xs font-semibold">
                        {tasksForEvent(snapshot.tasks, block.event).length} tâche(s)
                        associée(s)
                      </span>
                    )}
                    {block.event && "sourceId" in block.event && (
                      <span className="truncate text-xs text-muted-foreground">
                        {block.event.sourceName}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {remaining.timed.length ? (
            <div className="today-mini-scroll">
              <div className="today-mini-time-grid" style={{ height: miniHeight }}>
                <div className="today-mini-hours" aria-hidden="true">
                  {hourLabels.map((minute) => (
                    <span
                      key={minute}
                      style={{ top: (minute - miniStart) * miniPixelsPerMinute }}
                    >
                      {`${Math.floor(minute / 60)
                        .toString()
                        .padStart(2, "0")}:00`}
                    </span>
                  ))}
                </div>
                <div className="today-mini-track">
                  {hourLabels.map((minute) => (
                    <span
                      className="today-mini-hour-line"
                      key={minute}
                      style={{ top: (minute - miniStart) * miniPixelsPerMinute }}
                    />
                  ))}
                  <span
                    className="today-now-line"
                    style={{
                      top: (remaining.currentMinute - miniStart) * miniPixelsPerMinute,
                    }}
                  >
                    <span>Maintenant</span>
                  </span>
                  {remaining.timed.map((block) => {
                    const startTime = formatDate(block.startAt, timeZone, "HH:mm");
                    const endTime = formatDate(block.endAt, timeZone, "HH:mm");
                    const linkedCount = block.event
                      ? tasksForEvent(snapshot.tasks, block.event).length
                      : 0;
                    return (
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "today-calendar-block",
                          block.session ? "is-work" : "is-event",
                          block.end - block.visibleStart < 45 && "is-short",
                          block.start < remaining.currentMinute && "is-in-progress",
                        )}
                        key={block.id}
                        style={{
                          top: (block.visibleStart - miniStart) * miniPixelsPerMinute,
                          height: Math.max(
                            22,
                            (block.end - block.visibleStart) * miniPixelsPerMinute,
                          ),
                          left: `calc(${(block.lane / block.lanes) * 100}% + 5px)`,
                          width: `calc(${100 / block.lanes}% - 10px)`,
                        }}
                        title={`${block.title} · ${startTime}–${endTime}`}
                        onClick={() => openBlock(block)}
                      >
                        <strong>
                          {block.title}
                          {linkedCount > 0 && block.end - block.visibleStart < 45
                            ? ` · ${linkedCount} tâche${linkedCount > 1 ? "s" : ""}`
                            : ""}
                        </strong>
                        {linkedCount > 0 && block.end - block.visibleStart >= 45 && (
                          <span className="text-xs font-semibold">
                            {linkedCount} tâche{linkedCount > 1 ? "s" : ""} associée
                            {linkedCount > 1 ? "s" : ""}
                          </span>
                        )}
                        <span>
                          {startTime}–{endTime}
                          {block.event && "sourceId" in block.event
                            ? ` · ${block.event.sourceName}`
                            : ""}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : remaining.allDay.length === 0 ? (
            <Empty className="today-empty">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock3 />
                </EmptyMedia>
                <EmptyTitle>Plus aucun créneau aujourd’hui</EmptyTitle>
                <EmptyDescription>La suite de la journée est libre.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
      </section>

      <section className="today-week-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow mb-2">CHARGE PLANIFIÉE</p>
            <h2>La semaine en un regard</h2>
          </div>
          <Link href="/calendrier">
            Ouvrir le calendrier
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="week-overview">
          {Array.from({ length: 7 }, (_, index) => {
            const date = addCalendarDays(weekStart, index);
            const daySessions = snapshot.sessions.filter(
              (session) =>
                session.status !== "cancelled" &&
                localDate(session.startAt, timeZone) === date,
            );
            const minutes = daySessions.reduce(
              (total, session) => total + minutesBetween(session.startAt, session.endAt),
              0,
            );
            return (
              <Link
                key={date}
                href={`/calendrier?date=${date}`}
                className={date === today ? "week-day is-today" : "week-day"}
              >
                <span>{formatDate(`${date}T12:00:00Z`, timeZone, "EEEEE")}</span>
                <strong>{date.slice(-2)}</strong>
                <div className="week-bar" aria-hidden="true">
                  <span style={{ height: `${Math.min(100, (minutes / 240) * 100)}%` }} />
                </div>
                <small>{minutes ? duration(minutes) : "Libre"}</small>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
