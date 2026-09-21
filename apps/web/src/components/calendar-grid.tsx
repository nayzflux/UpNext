"use client";

import { useState, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Clock3, GripVertical, Plus } from "lucide-react";
import { getTaskMetrics, minutesBetween, zonedInstant, type Task } from "@upnext/contracts";
import {
  pixelsPerMinute,
  snapMinute,
  timeFromMinutes,
  type CalendarBlock,
  type CalendarDrag,
} from "@/lib/calendar-layout";
import { duration, errorMessage, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { TaskTags } from "./common";
import { useWorkspace } from "./workspace-context";

export function BacklogTask({ task }: { task: Task }) {
  const { snapshot, now, openEditor } = useWorkspace();
  const metrics = getTaskMetrics(task, snapshot.sessions, snapshot.logs, now);
  const [chosenMinutes, setChosenMinutes] = useState<number | null>(null);
  const durationMinutes = snapMinute(chosenMinutes ?? metrics.unplannedMinutes, 15, 1440);
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { kind: "task", task, durationMinutes } satisfies CalendarDrag,
  });
  return (
    <div ref={setNodeRef} className={cn("backlog-task", isDragging && "opacity-40")}>
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="drag-handle"
          {...listeners}
          {...attributes}
          aria-label={`Glisser ${task.title} dans le calendrier`}
        >
          <GripVertical />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-auto flex-1 justify-start whitespace-normal p-0 text-left"
          onClick={() => openEditor({ type: "detail", taskId: task.id })}
        >
          <span className="font-semibold">{task.title}</span>
        </Button>
      </div>
      <div className="mt-3">
        <TaskTags task={task} />
      </div>
      <span className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="size-3" />
        {duration(metrics.unplannedMinutes)} à placer
      </span>
      <div className="mt-3 flex items-center gap-2">
        <Input
          aria-label={`Durée à placer pour ${task.title}, en minutes`}
          type="number"
          min={15}
          max={1440}
          step={15}
          className="h-8 w-20"
          value={chosenMinutes ?? durationMinutes}
          onChange={(event) => setChosenMinutes(Number(event.target.value))}
          onBlur={() => setChosenMinutes(durationMinutes)}
        />
        <span className="text-xs text-muted-foreground">min</span>
        <Button
          className="ml-auto"
          variant="ghost"
          size="icon-sm"
          aria-label={`Planifier ${task.title}`}
          onClick={() => openEditor({ type: "session", taskId: task.id, durationMinutes })}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function blockStyle(block: CalendarBlock, firstMinute: number): CSSProperties {
  return {
    top: (block.start - firstMinute) * pixelsPerMinute,
    height: Math.max(1, (block.end - block.start) * pixelsPerMinute),
    left: `calc(${(block.lane / block.lanes) * 100}% + 3px)`,
    width: `calc(${100 / block.lanes}% - 6px)`,
  };
}

function BlockText({ block }: { block: CalendarBlock }) {
  const { timeZone } = useWorkspace();
  return (
    <>
      <strong>{block.title}</strong>
      {block.end - block.start >= 30 && (
        <span>
          {formatDate(block.startAt, timeZone, "HH:mm")}–
          {formatDate(block.endAt, timeZone, "HH:mm")} ·{" "}
          {duration(minutesBetween(block.startAt, block.endAt))}
        </span>
      )}
    </>
  );
}

function SessionBlock({
  block,
  firstMinute,
  movingSessionId,
}: {
  block: CalendarBlock;
  firstMinute: number;
  movingSessionId?: string;
}) {
  const { openEditor, timeZone } = useWorkspace();
  const session = block.session!;
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: `session:${block.id}`,
    data: { kind: "session", session } satisfies CalendarDrag,
    disabled: session.status !== "planned",
  });
  const {
    setNodeRef: setResizeRef,
    listeners: resizeListeners,
    attributes: resizeAttributes,
  } = useDraggable({
    id: `resize:${block.id}`,
    data: { kind: "resize", session } satisfies CalendarDrag,
    disabled: session.status !== "planned",
  });
  return (
    <div
      ref={setNodeRef}
      data-testid="session-card"
      data-session-id={session.id}
      data-resizing={block.resizing || undefined}
      className={cn(
        "calendar-block work-block",
        movingSessionId === session.id && "drag-origin",
        block.resizing && "resizing-block",
        session.status !== "planned" && "past-block",
      )}
      style={blockStyle(block, firstMinute)}
    >
      <Button
        type="button"
        variant="ghost"
        className="calendar-block-main"
        {...listeners}
        {...attributes}
        aria-label={`${block.title}, ${formatDate(session.startAt, timeZone, "HH:mm")}. Déplacer ou ouvrir la séance.`}
        onClick={() =>
          openEditor(
            session.status === "planned"
              ? { type: "session", sessionId: session.id }
              : { type: "detail", taskId: session.taskId },
          )
        }
      >
        <BlockText block={block} />
      </Button>
      {session.status === "planned" && (
        <Button
          type="button"
          variant="ghost"
          ref={setResizeRef}
          {...resizeListeners}
          {...resizeAttributes}
          className="resize-handle"
          aria-label={`Redimensionner ${block.title}`}
        >
          <span />
        </Button>
      )}
    </div>
  );
}

export function DayColumn({
  date,
  blocks,
  firstMinute,
  lastMinute,
  movingSessionId,
  originBlocks,
}: {
  date: string;
  blocks: CalendarBlock[];
  firstMinute: number;
  lastMinute: number;
  movingSessionId?: string;
  originBlocks: CalendarBlock[];
}) {
  const { timeZone, openEditor } = useWorkspace();
  const { setNodeRef } = useDroppable({ id: date, data: { date } });
  // Keep the active draggable mounted while its preview moves between days.
  const originals = movingSessionId
    ? originBlocks.filter((block) => block.session?.id === movingSessionId)
    : [];
  return (
    <div
      ref={setNodeRef}
      data-calendar-date={date}
      className="calendar-day-column"
      style={{ height: (lastMinute - firstMinute) * pixelsPerMinute }}
      role="gridcell"
      tabIndex={0}
      aria-label={`Planifier le ${date}`}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter") {
          openEditor({ type: "session", startAt: zonedInstant(date, "09:00", timeZone) });
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const minute = snapMinute(
          firstMinute +
            (event.clientY - event.currentTarget.getBoundingClientRect().top) /
              pixelsPerMinute,
        );
        try {
          openEditor({
            type: "session",
            startAt: zonedInstant(date, timeFromMinutes(minute), timeZone),
          });
        } catch (error) {
          toast.add({ title: errorMessage(error), type: "error" });
        }
      }}
    >
      {[...blocks, ...originals].map((block) => {
        if (block.preview)
          return (
            <div
              key={block.id}
              data-testid="calendar-drag-preview"
              className="calendar-block work-block snapping-preview"
              style={blockStyle(block, firstMinute)}
            >
              <BlockText block={block} />
            </div>
          );
        if (block.session)
          return (
            <SessionBlock
              key={block.id}
              block={block}
              firstMinute={firstMinute}
              movingSessionId={movingSessionId}
            />
          );
        return (
          <Button
            type="button"
            variant="ghost"
            key={block.id}
            className="calendar-block event-block"
            style={blockStyle(block, firstMinute)}
            onClick={() => openEditor({ type: "event", eventId: block.event!.id })}
          >
            <BlockText block={block} />
          </Button>
        );
      })}
    </div>
  );
}
