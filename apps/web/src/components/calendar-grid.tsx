"use client";

import type { CSSProperties, ReactElement } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Clock3, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import {
  getTaskMetrics,
  minutesBetween,
  zonedInstant,
  type Session,
  type Task,
} from "@upnext/contracts";
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
import { toast } from "@/components/ui/toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TaskTags } from "./common";
import { useWorkspace } from "./workspace-context";

export function BacklogTask({
  task,
  displayedDate,
  mobile,
}: {
  task: Task;
  displayedDate: string;
  mobile: boolean;
}) {
  const { snapshot, now, openEditor } = useWorkspace();
  const metrics = getTaskMetrics(task, snapshot.sessions, snapshot.logs, now);
  const durationMinutes = snapMinute(metrics.unplannedMinutes, 15, 1440);
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { kind: "task", task, durationMinutes } satisfies CalendarDrag,
    disabled: mobile,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "backlog-task work-block",
        !mobile && "is-draggable",
        isDragging && "opacity-40",
      )}
      onPointerDown={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-no-drag]")) {
          return;
        }
        listeners?.onPointerDown?.(event);
      }}
    >
      <p
        ref={mobile ? undefined : setActivatorNodeRef}
        className="work-title"
        {...(mobile ? {} : attributes)}
        onKeyDown={mobile ? undefined : (event) => listeners?.onKeyDown?.(event)}
        aria-label={mobile ? undefined : `Glisser ${task.title} dans le calendrier`}
      >
        {task.title}
      </p>
      <div className="mt-3">
        <TaskTags task={task} />
      </div>
      <span className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="size-3" />
        {duration(metrics.unplannedMinutes)} à placer
      </span>
      <div className="mt-2 flex justify-end">
        <Button
          data-no-drag
          variant="ghost"
          size={mobile ? "sm" : "icon-sm"}
          aria-label={`Planifier ${task.title}`}
          onClick={() =>
            openEditor({
              type: "session",
              taskId: task.id,
              durationMinutes,
              initialDate: mobile ? displayedDate : undefined,
            })
          }
        >
          <Plus data-icon={mobile ? "inline-start" : undefined} />
          {mobile && "Planifier"}
        </Button>
      </div>
    </div>
  );
}

export function SessionContextMenu({
  session,
  children,
  onDelete,
}: {
  session: Session;
  children: ReactElement;
  onDelete: (session: Session) => void;
}) {
  const { openEditor, now } = useWorkspace();
  const editable = session.status === "planned" && new Date(session.endAt) > now;

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        <ContextMenuGroup>
          {editable && (
            <ContextMenuItem
              onClick={() => openEditor({ type: "session", sessionId: session.id })}
            >
              <Pencil />
              Modifier la séance
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() => openEditor({ type: "detail", taskId: session.taskId })}
          >
            <ListTodo />
            Ouvrir la tâche
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive" onClick={() => onDelete(session)}>
            <Trash2 />
            Supprimer la séance
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
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
  const durationMinutes = block.end - block.start;
  const startTime = formatDate(block.startAt, timeZone, "HH:mm");
  const endTime = formatDate(block.endAt, timeZone, "HH:mm");
  const durationText = duration(minutesBetween(block.startAt, block.endAt));

  return (
    <>
      <strong>{block.title}</strong>
      {block.event && "sourceId" in block.event && durationMinutes >= 30 && (
        <span>
          {block.event.sourceName}
          {block.event.allDay ? " · Journée entière" : ""}
        </span>
      )}
      {block.event &&
      "sourceId" in block.event &&
      block.event.allDay ? null : durationMinutes >= 45 ? (
        <span>
          {startTime}–{endTime} · {durationText}
        </span>
      ) : durationMinutes >= 30 ? (
        <span>
          {startTime}–{endTime}
        </span>
      ) : null}
    </>
  );
}

function SessionBlock({
  block,
  firstMinute,
  movingSessionId,
  onDeleteSession,
  mobile,
}: {
  block: CalendarBlock;
  firstMinute: number;
  movingSessionId?: string;
  onDeleteSession: (session: Session) => void;
  mobile: boolean;
}) {
  const { openEditor, timeZone, now } = useWorkspace();
  const session = block.session!;
  const editable = session.status === "planned" && new Date(session.endAt) > now;
  const durationMinutes = block.end - block.start;
  const startTime = formatDate(session.startAt, timeZone, "HH:mm");
  const endTime = formatDate(session.endAt, timeZone, "HH:mm");
  const durationText = duration(minutesBetween(session.startAt, session.endAt));

  const { setNodeRef, listeners, attributes } = useDraggable({
    id: `session:${block.id}`,
    data: { kind: "session", session } satisfies CalendarDrag,
    disabled: mobile || !editable,
  });
  const {
    setNodeRef: setResizeRef,
    listeners: resizeListeners,
    attributes: resizeAttributes,
  } = useDraggable({
    id: `resize:${block.id}`,
    data: { kind: "resize", session } satisfies CalendarDrag,
    disabled: mobile || !editable,
  });
  return (
    <SessionContextMenu session={session} onDelete={onDeleteSession}>
      <div
        ref={setNodeRef}
        data-testid="session-card"
        data-session-id={session.id}
        data-resizing={block.resizing || undefined}
        data-duration={durationMinutes}
        className={cn(
          "calendar-block work-block",
          durationMinutes < 30 && "is-short-block",
          durationMinutes >= 30 && durationMinutes < 45 && "is-compact-block",
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
          {...(mobile ? {} : listeners)}
          {...(mobile ? {} : attributes)}
          title={`${block.title} (${startTime}–${endTime} · ${durationText})`}
          aria-label={
            editable
              ? mobile
                ? `${block.title}, ${startTime}. Ouvrir la séance.`
                : `${block.title}, ${startTime}. Déplacer ou ouvrir la séance.`
              : session.status === "planned" || session.status === "expired"
                ? `${block.title}, ${startTime}. Faire le bilan de la séance.`
                : `${block.title}, ${startTime}. Ouvrir la tâche.`
          }
          onClick={() =>
            openEditor(
              editable
                ? { type: "session", sessionId: session.id }
                : session.status === "planned" || session.status === "expired"
                  ? { type: "log", taskId: session.taskId, sessionId: session.id }
                  : { type: "detail", taskId: session.taskId },
            )
          }
        >
          <BlockText block={block} />
        </Button>
        {editable && !mobile && (
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
    </SessionContextMenu>
  );
}

export function DayColumn({
  date,
  blocks,
  firstMinute,
  lastMinute,
  movingSessionId,
  originBlocks,
  onDeleteSession,
  mobile,
}: {
  date: string;
  blocks: CalendarBlock[];
  firstMinute: number;
  lastMinute: number;
  movingSessionId?: string;
  originBlocks: CalendarBlock[];
  onDeleteSession: (session: Session) => void;
  mobile: boolean;
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
        const durationMinutes = block.end - block.start;
        if (block.preview)
          return (
            <div
              key={block.id}
              data-testid="calendar-drag-preview"
              data-duration={durationMinutes}
              className={cn(
                "calendar-block work-block snapping-preview",
                durationMinutes < 30 && "is-short-block",
                durationMinutes >= 30 && durationMinutes < 45 && "is-compact-block",
              )}
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
              onDeleteSession={onDeleteSession}
              mobile={mobile}
            />
          );
        const startTime = formatDate(block.startAt, timeZone, "HH:mm");
        const endTime = formatDate(block.endAt, timeZone, "HH:mm");
        const durationText = duration(minutesBetween(block.startAt, block.endAt));
        return (
          <Button
            type="button"
            variant="ghost"
            key={block.id}
            data-duration={durationMinutes}
            className={cn(
              "calendar-block event-block",
              durationMinutes < 30 && "is-short-block",
              durationMinutes >= 30 && durationMinutes < 45 && "is-compact-block",
            )}
            style={blockStyle(block, firstMinute)}
            title={`${block.title}${block.event && "sourceId" in block.event ? ` · ${block.event.sourceName}` : ""} (${startTime}–${endTime} · ${durationText})`}
            onClick={() =>
              block.event && "sourceId" in block.event
                ? openEditor({ type: "importedEvent", event: block.event })
                : openEditor({ type: "event", eventId: block.event!.id })
            }
          >
            <BlockText block={block} />
          </Button>
        );
      })}
    </div>
  );
}
