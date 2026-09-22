"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  flexRender,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ArrowDownUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { getTaskMetrics, type Task } from "@upnext/contracts";
import { useWorkspace } from "./workspace-context";
import { duration, formatDate, formatTimeUntil } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyTasks, PageHeading, PlanningBadge, TaskTags } from "./common";
import { PriorityBadge } from "./priority-badge";
import { SelectControl } from "./select-control";

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
});

export function TasksView() {
  const { snapshot, now, timeZone, openEditor } = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tag = searchParams.get("tag") ?? "all";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("all");
  const [deadline, setDeadline] = useState("all");
  const data = useMemo(
    () =>
      snapshot.tasks.filter((task) => {
        if (
          !`${task.title} ${task.notes}`
            .toLocaleLowerCase("fr")
            .includes(search.toLocaleLowerCase("fr"))
        )
          return false;
        if (tag === "none" && task.tagIds.length > 0) return false;
        if (tag !== "all" && tag !== "none" && !task.tagIds.includes(tag)) return false;
        if (status === "active" && task.progress === 100) return false;
        if (status === "not-started" && task.progress !== 0) return false;
        if (status === "in-progress" && (task.progress === 0 || task.progress === 100))
          return false;
        if (status === "done" && task.progress !== 100) return false;
        if (priority !== "all" && task.priority !== priority) return false;
        const currentNow = new Date(snapshot.serverNow);
        if (
          deadline === "late" &&
          (new Date(task.dueAt) >= currentNow || task.progress === 100)
        )
          return false;
        if (
          deadline === "week" &&
          new Date(task.dueAt).getTime() > currentNow.getTime() + 7 * 86400000
        )
          return false;
        if (status === "unplanned") {
          const planning = getTaskMetrics(
            task,
            snapshot.sessions,
            snapshot.logs,
            currentNow,
          ).planning;
          return planning === "none" || planning === "partial";
        }
        return true;
      }),
    [snapshot, search, tag, status, priority, deadline],
  );

  const columns = useMemo<ColumnDef<typeof features, Task>[]>(
    () => [
      {
        id: "title",
        accessorKey: "title",
        header: "Tâche",
        cell: ({ row }) => (
          <div className="flex min-w-48 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Faire le bilan de ${row.original.title}`}
              disabled={row.original.progress === 100}
              onClick={() => openEditor({ type: "log", taskId: row.original.id })}
            >
              {row.original.progress === 100 ? <Check /> : <span className="task-check" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-auto justify-start whitespace-normal p-0 text-left"
              onClick={() => openEditor({ type: "detail", taskId: row.original.id })}
            >
              <span className="font-semibold">{row.original.title}</span>
            </Button>
          </div>
        ),
      },
      { id: "tags", header: "Tags", cell: ({ row }) => <TaskTags task={row.original} /> },
      {
        accessorKey: "dueAt",
        header: "Échéance",
        cell: ({ row }) => (
          <span
            className={
              row.original.progress < 100 &&
              new Date(row.original.dueAt) < new Date(snapshot.serverNow)
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            {formatDate(row.original.dueAt, timeZone)} ·{" "}
            {formatTimeUntil(row.original.dueAt, snapshot.serverNow)}
          </span>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priorité",
        sortFn: (a, b) =>
          ({ low: 0, normal: 1, high: 2 })[a.original.priority] -
          { low: 0, normal: 1, high: 2 }[b.original.priority],
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: "progress",
        header: "Avancement",
        cell: ({ row }) => (
          <div className="min-w-24">
            <span className="mb-2 block text-xs text-muted-foreground">
              {row.original.progress} %
            </span>
            <Progress
              value={row.original.progress}
              aria-label={`Avancement de ${row.original.title}`}
            />
          </div>
        ),
      },
      {
        id: "remaining",
        header: "Reste à faire",
        accessorFn: (task) =>
          getTaskMetrics(task, snapshot.sessions, snapshot.logs, new Date(snapshot.serverNow))
            .remainingMinutes,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{duration(getValue<number>())}</span>
        ),
      },
      {
        id: "planning",
        header: "Planning",
        cell: ({ row }) => (
          <PlanningBadge
            status={
              getTaskMetrics(
                row.original,
                snapshot.sessions,
                snapshot.logs,
                new Date(snapshot.serverNow),
              ).planning
            }
          />
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Planifier ${row.original.title}`}
            disabled={row.original.progress === 100}
            onClick={() => openEditor({ type: "session", taskId: row.original.id })}
          >
            <CalendarClock />
          </Button>
        ),
      },
    ],
    [snapshot, timeZone, openEditor],
  );
  const table = useTable({
    features,
    data,
    columns,
    initialState: {
      sorting: [{ id: "dueAt", desc: false }],
      pagination: { pageSize: 15, pageIndex: 0 },
    },
  });
  const activeTasks = snapshot.tasks.filter((task) => task.progress < 100);
  const unplannedMinutes = activeTasks.reduce(
    (total, task) =>
      total + getTaskMetrics(task, snapshot.sessions, snapshot.logs, now).unplannedMinutes,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="TOUT CE QUI COMPTE"
        title="Mes tâches"
        description={`${activeTasks.length} tâche${activeTasks.length > 1 ? "s" : ""} en cours · ${duration(unplannedMinutes)} à planifier.`}
      >
        <Button onClick={() => openEditor({ type: "task" })}>
          <Plus data-icon="inline-start" />
          Nouvelle tâche
        </Button>
      </PageHeading>
      <div className="tasks-controls">
        <ToggleGroup
          value={[status]}
          onValueChange={(values) => {
            if (values[0]) setStatus(values[0]);
          }}
          aria-label="Filtrer les tâches"
        >
          <ToggleGroupItem value="active">À faire</ToggleGroupItem>
          <ToggleGroupItem value="not-started">Non commencées</ToggleGroupItem>
          <ToggleGroupItem value="in-progress">En cours</ToggleGroupItem>
          <ToggleGroupItem value="unplanned">Non planifiées</ToggleGroupItem>
          <ToggleGroupItem value="done">Terminées</ToggleGroupItem>
          <ToggleGroupItem value="all">Toutes</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs text-muted-foreground">
          {data.length} résultat{data.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="filter-bar">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Rechercher une tâche"
            placeholder="Rechercher une tâche…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <SelectControl
          label="Filtrer par tag"
          options={[
            { value: "all", label: "Tous les tags" },
            { value: "none", label: "Sans tag" },
            ...snapshot.tags.map((tag) => ({ value: tag.id, label: tag.name })),
          ]}
          value={tag}
          onValueChange={(nextTag) =>
            router.replace(nextTag === "all" ? "/taches" : `/taches?tag=${nextTag}`)
          }
        />
        <SelectControl
          label="Filtrer par priorité"
          options={[
            { value: "all", label: "Toute priorité" },
            { value: "high", label: "Haute" },
            { value: "normal", label: "Normale" },
            { value: "low", label: "Basse" },
          ]}
          value={priority}
          onValueChange={setPriority}
        />
        <SelectControl
          label="Filtrer par échéance"
          options={[
            { value: "all", label: "Toute échéance" },
            { value: "late", label: "En retard" },
            { value: "week", label: "Dans les 7 jours" },
          ]}
          value={deadline}
          onValueChange={setDeadline}
        />
      </div>
      <div className="surface overflow-hidden">
        {data.length ? (
          <>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.column.getCanSort() ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <ArrowDownUp data-icon="inline-end" />
                          </Button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell className="py-5" key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t p-4 text-xs text-muted-foreground">
              <span>
                Page {table.state.pagination.pageIndex + 1} sur {table.getPageCount()}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Page précédente"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Page suivante"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyTasks
            title={
              snapshot.tasks.length
                ? "Aucune tâche dans cette sélection"
                : "Tout commence par une tâche"
            }
            description={
              snapshot.tasks.length
                ? "Essaie d’autres filtres ou ajoute une nouvelle tâche."
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
