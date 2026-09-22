"use client";

import { useState } from "react";
import { CalendarClock, Check, Clock3, Plus } from "lucide-react";
import { getTaskMetrics, type Task } from "@upnext/contracts";
import { useWorkspace } from "./workspace-context";
import { duration, formatDate, formatTimeUntil } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function TaskTags({ task }: { task: Task }) {
  const { snapshot } = useWorkspace();
  return (
    <div className="flex flex-wrap gap-1.5">
      {task.tagIds.map((id) => {
        const tag = snapshot.tags.find((tag) => tag.id === id);
        return tag ? (
          <Badge key={id} variant="secondary">
            {tag.name}
          </Badge>
        ) : null;
      })}
    </div>
  );
}

export function TaskRow({
  task,
  planningAction = true,
}: {
  task: Task;
  planningAction?: boolean;
}) {
  const { snapshot, timeZone, now, openEditor } = useWorkspace();
  const metrics = getTaskMetrics(task, snapshot.sessions, snapshot.logs, now);
  const overdue = task.progress < 100 && new Date(task.dueAt) < now;
  return (
    <div className="task-row">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Faire le bilan de ${task.title}`}
        disabled={task.progress === 100}
        onClick={() => openEditor({ type: "log", taskId: task.id })}
      >
        {task.progress === 100 ? <Check /> : <span className="task-check" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-left"
        onClick={() => openEditor({ type: "detail", taskId: task.id })}
      >
        <span className="block truncate font-semibold">{task.title}</span>
        <span
          className={overdue ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {overdue ? "En retard · " : "Pour le "}
          {formatDate(task.dueAt, timeZone)} · {formatTimeUntil(task.dueAt, now)}
        </span>
      </Button>
      <div className="hidden sm:block">
        <TaskTags task={task} />
      </div>
      <div className="w-16 shrink-0">
        <span className="mb-1.5 block text-right text-xs text-muted-foreground">
          {task.progress} %
        </span>
        <Progress value={task.progress} aria-label={`Avancement de ${task.title}`} />
      </div>
      {planningAction && task.progress < 100 && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Planifier ${task.title}`}
          onClick={() => openEditor({ type: "session", taskId: task.id })}
        >
          <CalendarClock />
        </Button>
      )}
      <span className="hidden w-14 text-right text-xs text-muted-foreground xl:block">
        {duration(metrics.remainingMinutes)}
      </span>
    </div>
  );
}

export function EmptyTasks({
  title = "Un peu de place pour la suite",
  description = "Ajoute une tâche, estime le temps qu’elle demande, puis trouve-lui un créneau.",
}: {
  title?: string;
  description?: string;
}) {
  const { openEditor } = useWorkspace();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Clock3 />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => openEditor({ type: "task" })}>
          <Plus data-icon="inline-start" />
          Créer une tâche
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function ConfirmAction({
  label,
  description,
  onConfirm,
  children,
}: {
  label: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                const result = await onConfirm();
                if (result !== null) setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Un instant…" : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { PlanningBadge } from "./planning-badge";
