"use client";

import type { Task } from "@upnext/contracts";
import { Badge } from "@/components/ui/badge";
import { priorityLabels } from "@/lib/format";

const priorityVariants: Record<Task["priority"], "success" | "warning" | "destructive"> = {
  low: "success",
  normal: "warning",
  high: "destructive",
};

export function PriorityBadge({
  priority,
  withPrefix = false,
}: {
  priority: Task["priority"];
  withPrefix?: boolean;
}) {
  const label = priorityLabels[priority];

  return (
    <Badge variant={priorityVariants[priority]} data-priority={priority}>
      {withPrefix ? `Priorité ${label.toLowerCase()}` : label}
    </Badge>
  );
}
