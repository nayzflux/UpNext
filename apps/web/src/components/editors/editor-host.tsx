"use client";

import { useWorkspace, type Editor } from "../workspace-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskEditor } from "./task-editor";
import { SessionEditor } from "./session-editor";
import { EstimateEditor, LogEditor } from "./log-editor";
import { EventEditor } from "./event-editor";
import { TaskDetail } from "./task-detail";

export function EditorHost({ editor }: { editor: Editor }) {
  const { snapshot, closeEditor } = useWorkspace();
  const task =
    "taskId" in editor ? snapshot.tasks.find((task) => task.id === editor.taskId) : undefined;
  const session =
    "sessionId" in editor
      ? snapshot.sessions.find((session) => session.id === editor.sessionId)
      : undefined;
  const log =
    "logId" in editor ? snapshot.logs.find((log) => log.id === editor.logId) : undefined;
  const event =
    "eventId" in editor
      ? snapshot.events.find((event) => event.id === editor.eventId)
      : undefined;
  const titles = {
    task: task ? "Modifier la tâche" : "Une nouvelle tâche",
    detail: task?.title ?? "Détail de la tâche",
    session: session ? "Modifier la séance" : "Trouver une place",
    log: log ? "Corriger le dernier bilan" : "Comment ça s’est passé ?",
    event: event ? "Modifier l’événement" : "Bloquer un moment",
    estimate: "Ajuster le temps prévu ?",
  };
  const descriptions = {
    task: "Pose ce que tu as en tête, on s’occupe de la suite.",
    detail: "Le prévu et le réel, au même endroit.",
    session: "Réserve un moment pour avancer à ton rythme.",
    log: "Un bilan honnête pour mieux organiser la suite.",
    event: "Un cours, un rendez-vous, un moment déjà pris.",
    estimate: "Une estimation peut évoluer avec ton travail.",
  };
  let content: React.ReactNode;
  if (editor.type === "task") content = <TaskEditor task={task} />;
  if (editor.type === "detail" && task) content = <TaskDetail task={task} />;
  if (editor.type === "session")
    content = (
      <SessionEditor
        taskId={editor.taskId}
        session={session}
        initialStart={editor.startAt}
        initialMinutes={editor.durationMinutes}
      />
    );
  if (editor.type === "log" && task)
    content = <LogEditor task={task} session={session} log={log} />;
  if (editor.type === "event")
    content = <EventEditor event={event} initialStart={editor.startAt} />;
  if (editor.type === "estimate" && task)
    content = <EstimateEditor task={task} suggestedMinutes={editor.minutes} />;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeEditor();
      }}
    >
      <DialogContent data-testid="editor-modal" className="editor-modal">
        <DialogHeader className="px-6 pt-6 pr-12">
          <DialogTitle>{titles[editor.type]}</DialogTitle>
          <DialogDescription>{descriptions[editor.type]}</DialogDescription>
        </DialogHeader>
        {content ?? <p className="p-6">Cet élément n’est plus disponible.</p>}
      </DialogContent>
    </Dialog>
  );
}
