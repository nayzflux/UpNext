"use client";

import { Plus } from "lucide-react";
import type { EventOccurrence, ImportedEvent } from "@upnext/contracts";
import { tasksForEvent } from "@/lib/event-links";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "../workspace-context";

export function EventTasks({ event }: { event: EventOccurrence | ImportedEvent }) {
  const { snapshot, openEditor } = useWorkspace();
  const tasks = tasksForEvent(snapshot.tasks, event);
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Tâches associées ({tasks.length})</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => openEditor({ type: "task", initialEvent: event })}
        >
          <Plus data-icon="inline-start" />
          Ajouter une tâche
        </Button>
      </div>
      {tasks.length ? (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <Button
              key={task.id}
              type="button"
              variant="ghost"
              className="h-auto justify-start whitespace-normal text-left"
              onClick={() => openEditor({ type: "detail", taskId: task.id })}
            >
              {task.title}
              {task.progress === 100 ? " · Terminée" : ""}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune tâche associée.</p>
      )}
    </section>
  );
}
