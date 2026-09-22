"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarPlus, Check, ChevronRight, Leaf, Plus, Sun } from "lucide-react";
import {
  addCalendarDays,
  expandEvents,
  getTaskMetrics,
  localDate,
  minutesBetween,
  weekdayOfDate,
  zonedInstant,
} from "@upnext/contracts";
import { useWorkspace } from "./workspace-context";
import { api } from "@/lib/api";
import { duration, formatDate } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { EmptyTasks, PageHeading, TaskRow } from "./common";

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
  const urgent = [...active].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const sessions = snapshot.sessions.filter(
    (session) =>
      session.status !== "cancelled" &&
      new Date(session.startAt) < new Date(end) &&
      new Date(session.endAt) > new Date(start),
  );
  const events = [...expandEvents(snapshot.events, start, end), ...(snapshot.calendarSources.length ? imported.data ?? [] : [])];
  const timeline = [
    ...sessions.map((session) => ({
      id: session.id,
      title: snapshot.tasks.find((task) => task.id === session.taskId)?.title ?? "Séance",
      startAt: session.startAt,
      endAt: session.endAt,
      session,
    })),
    ...events.map((event) => ({
      id: event.occurrenceId,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      event,
    })),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const workToday = sessions
    .filter((session) => session.status === "planned")
    .reduce((total, session) => total + minutesBetween(session.startAt, session.endAt), 0);
  const unplanned = active.reduce(
    (total, task) =>
      total + getTaskMetrics(task, snapshot.sessions, snapshot.logs, now).unplannedMinutes,
    0,
  );
  const remainingTasks = active.filter(
    (task) => getTaskMetrics(task, snapshot.sessions, snapshot.logs, now).unplannedMinutes > 0,
  );
  const completedToday = snapshot.logs.filter(
    (log) => log.progressAfter === 100 && localDate(log.actualStartAt, timeZone) === today,
  ).length;
  const weekStart = addCalendarDays(today, 1 - weekdayOfDate(today));

  return (
    <div className="flex flex-col gap-8">
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
      <section className="day-intro">
        <div className="day-intro-copy">
          <span className="eyebrow">À TON RYTHME</span>
          <h2>Une journée qui te ressemble.</h2>
          <p>
            {sessions.length
              ? `${sessions.filter((session) => session.status === "planned").length} séance${sessions.length > 1 ? "s" : ""} au programme. Garde aussi un peu de place pour respirer.`
              : "Commence par une petite tâche. Le reste trouvera sa place."}
          </p>
          <Link href="/calendrier">
            Voir ma journée
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="day-intro-symbol" aria-hidden="true">
          <Sun />
        </div>
        <div className="day-stat">
          <span>PRÉVU AUJOURD’HUI</span>
          <strong>{duration(workToday)}</strong>
          <small>
            {completedToday > 0
              ? `${completedToday} tâche${completedToday > 1 ? "s" : ""} terminée${completedToday > 1 ? "s" : ""} aujourd’hui`
              : "Un créneau à la fois"}
          </small>
        </div>
      </section>
      <div className="today-columns">
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <div className="section-heading">
              <h2>
                À garder en tête <span>{active.length}</span>
              </h2>
              <Link href="/taches">
                Toutes les tâches
                <ChevronRight className="size-4" />
              </Link>
            </div>
            <div className="surface">
              {urgent.length ? (
                urgent.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)
              ) : (
                <EmptyTasks />
              )}
            </div>
          </section>
          <section>
            <div className="section-heading">
              <h2>La semaine en un regard</h2>
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
                    <div className="week-bar">
                      <span style={{ height: `${Math.min(100, (minutes / 240) * 100)}%` }} />
                    </div>
                    <small>{minutes ? duration(minutes) : "Libre"}</small>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <section className="surface day-agenda">
            <div className="section-heading">
              <h2>Le fil de ta journée</h2>
              <span className="today-dot" />
            </div>
            {timeline.length ? (
              <div className="timeline-list">
                {timeline.map((item) => (
                  <div className="timeline-item" key={item.id}>
                    <div className="timeline-time">
                      {"event" in item && "sourceId" in item.event && item.event.allDay
                        ? "Toute la journée"
                        : formatDate(item.startAt, timeZone, "HH:mm")}
                      {!("event" in item && "sourceId" in item.event && item.event.allDay) && (
                        <span>{formatDate(item.endAt, timeZone, "HH:mm")}</span>
                      )}
                    </div>
                    <div
                      className={
                        "session" in item ? "timeline-content work" : "timeline-content"
                      }
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto justify-start whitespace-normal p-0 text-left"
                        onClick={() =>
                          "session" in item
                            ? openEditor({ type: "detail", taskId: item.session.taskId })
                            : "sourceId" in item.event
                              ? openEditor({ type: "importedEvent", event: item.event })
                              : openEditor({ type: "event", eventId: item.event.id })
                        }
                      >
                        <span className="font-semibold">{item.title}</span>
                        {"event" in item && "sourceId" in item.event && (
                          <span className="ml-2 text-xs text-muted-foreground">· {item.event.sourceName}</span>
                        )}
                      </Button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {"event" in item && "sourceId" in item.event && item.event.allDay
                            ? "Journée entière"
                            : duration(minutesBetween(item.startAt, item.endAt))}
                        </span>
                        {"session" in item &&
                          (item.session.status === "planned" ? (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Bilan : ${item.title}`}
                              onClick={() =>
                                openEditor({
                                  type: "log",
                                  taskId: item.session.taskId,
                                  sessionId: item.session.id,
                                })
                              }
                            >
                              <Check />
                            </Button>
                          ) : (
                            <Badge variant="outline">
                              {item.session.status === "completed"
                                ? "Effectuée"
                                : item.session.status === "expired"
                                  ? "Expirée · non faite"
                                  : "Manquée"}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty className="px-0 py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarPlus />
                  </EmptyMedia>
                  <EmptyTitle>La journée est à toi</EmptyTitle>
                  <EmptyDescription>Réserve un premier moment pour avancer.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <Button
              className="mt-5 w-full"
              variant="outline"
              disabled={!active.length}
              onClick={() => openEditor({ type: "session" })}
            >
              <Plus data-icon="inline-start" />
              Ajouter une séance
            </Button>
          </section>
          <section className="planning-note">
            <div className="flex items-center gap-2">
              <Leaf className="size-4" />
              <h2>À trouver dans ton planning</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed">
              {unplanned > 0 ? (
                <>
                  <strong>{duration(unplanned)}</strong> sur {remainingTasks.length} tâche
                  {remainingTasks.length > 1 ? "s" : ""} attendent encore leur créneau.
                </>
              ) : (
                "Tout le travail estimé a trouvé sa place. Tu peux souffler."
              )}
            </p>
            <Link
              href="/calendrier"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Organiser la suite
              <ArrowRight data-icon="inline-end" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
