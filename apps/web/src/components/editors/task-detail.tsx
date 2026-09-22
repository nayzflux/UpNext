"use client";

import { CalendarPlus, Check, Clock3, Pencil, Trash2 } from "lucide-react";
import { getTaskMetrics, minutesBetween, type Task } from "@upnext/contracts";
import { api } from "@/lib/api";
import { duration, formatDate, priorityLabels } from "@/lib/format";
import { useAction, useWorkspace } from "../workspace-context";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfirmAction, PlanningBadge, TaskTags } from "../common";

export function TaskDetail({ task }: { task: Task }) {
  const { snapshot, timeZone, now, openEditor, closeEditor } = useWorkspace();
  const action = useAction();
  const metrics = getTaskMetrics(task, snapshot.sessions, snapshot.logs, now);
  const sessions = snapshot.sessions
    .filter((session) => session.taskId === task.id)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const logs = snapshot.logs.filter((log) => log.taskId === task.id);

  return (
    <div className="editor-form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TaskTags task={task} />
        <div className="flex items-center gap-2">
          <PlanningBadge status={metrics.planning} />
          <Badge variant="outline">
            Priorité {priorityLabels[task.priority].toLowerCase()}
          </Badge>
        </div>
      </div>
      {task.notes && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {task.notes}
        </p>
      )}
      <p className="text-sm">
        À terminer le{" "}
        <strong>
          {formatDate(
            task.dueAt,
            timeZone,
            task.dateOnly ? "d MMMM yyyy" : "d MMMM yyyy à HH:mm",
          )}
        </strong>
      </p>
      <div>
        <div className="mb-2 flex justify-between text-sm">
          <span>Avancement réel</span>
          <strong>{task.progress} %</strong>
        </div>
        <Progress value={task.progress} aria-label="Avancement réel" />
      </div>
      <dl className="detail-metrics">
        <div>
          <dt>Estimation totale</dt>
          <dd>{duration(task.estimatedMinutes)}</dd>
        </div>
        <div>
          <dt>Temps passé</dt>
          <dd>{duration(metrics.actualMinutes)}</dd>
        </div>
        <div>
          <dt>Reste à faire</dt>
          <dd>{duration(metrics.remainingMinutes)}</dd>
        </div>
        <div>
          <dt>À planifier</dt>
          <dd>{duration(metrics.unplannedMinutes)}</dd>
        </div>
        <div>
          <dt>Part déjà planifiée</dt>
          <dd>{metrics.plannedPercent.toLocaleString("fr-FR")} %</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => openEditor({ type: "task", taskId: task.id })}
        >
          <Pencil data-icon="inline-start" />
          Modifier
        </Button>
        {task.progress < 100 && (
          <>
            <Button onClick={() => openEditor({ type: "session", taskId: task.id })}>
              <CalendarPlus data-icon="inline-start" />
              Planifier
            </Button>
            <Button
              variant="secondary"
              onClick={() => openEditor({ type: "log", taskId: task.id })}
            >
              <Check data-icon="inline-start" />
              Faire un bilan
            </Button>
          </>
        )}
      </div>
      <Separator />
      <section>
        <h3 className="mb-3 font-semibold">Les séances</h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cette tâche attend son premier créneau.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map((session) => (
              <div className="detail-session" key={session.id}>
                <div>
                  <p className="text-sm font-medium">
                    {formatDate(session.startAt, timeZone, "EEE d MMM · HH:mm")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {duration(minutesBetween(session.startAt, session.endAt))} ·{" "}
                    {session.plannedPercent.toLocaleString("fr-FR")} % prévus ·{" "}
                    {session.status === "planned"
                      ? "Prévue"
                      : session.status === "completed"
                        ? "Effectuée"
                        : session.status === "expired"
                          ? "Expirée · non faite"
                          : session.status === "missed"
                            ? "Manquée"
                            : "Annulée"}
                  </p>
                </div>
                {session.status === "planned" && new Date(session.endAt) > now && (
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Modifier la séance"
                      onClick={() => openEditor({ type: "session", sessionId: session.id })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Faire le bilan de la séance"
                      onClick={() =>
                        openEditor({ type: "log", taskId: task.id, sessionId: session.id })
                      }
                    >
                      <Check />
                    </Button>
                    <ConfirmAction
                      label="Annuler cette séance ?"
                      description="La part prévue redeviendra disponible à planifier."
                      onConfirm={() =>
                        action.run(
                          () =>
                            api.sessions.cancel({
                              id: session.id,
                              revision: session.revision,
                            }),
                          "Séance annulée",
                        )
                      }
                    >
                      <Button size="icon-sm" variant="ghost" aria-label="Annuler la séance">
                        <Trash2 />
                      </Button>
                    </ConfirmAction>
                  </div>
                )}
                {session.status === "planned" && new Date(session.endAt) <= now && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      openEditor({ type: "log", taskId: task.id, sessionId: session.id })
                    }
                  >
                    Faire le bilan
                  </Button>
                )}
                {session.status === "expired" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      openEditor({ type: "log", taskId: task.id, sessionId: session.id })
                    }
                  >
                    Renseigner si effectuée
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <Separator />
      <section>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Clock3 className="size-4" />
          L’historique réel
        </h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tes bilans apparaîtront ici.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {logs.map((log, index) => (
              <div key={log.id}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {formatDate(log.actualStartAt, timeZone, "d MMM · HH:mm")}
                  </p>
                  {index === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        openEditor({
                          type: "log",
                          taskId: task.id,
                          logId: log.id,
                          sessionId: log.sessionId ?? undefined,
                        })
                      }
                    >
                      Corriger
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {log.missed
                    ? "Séance manquée"
                    : `${duration(log.actualMinutes)} travaillées · ${log.progressBefore} % → ${log.progressAfter} %`}
                </p>
                {log.note && <p className="mt-1 whitespace-pre-wrap text-sm">{log.note}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="editor-footer">
        <ConfirmAction
          label="Supprimer cette tâche ?"
          description="Ses séances et son historique seront également supprimés."
          onConfirm={async () => {
            const result = await action.run(
              () => api.tasks.delete({ id: task.id }),
              "Tâche supprimée",
            );
            if (result) closeEditor();
            return result;
          }}
        >
          <Button variant="ghost">
            <Trash2 data-icon="inline-start" />
            Supprimer la tâche
          </Button>
        </ConfirmAction>
      </div>
    </div>
  );
}
