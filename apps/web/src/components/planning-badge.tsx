"use client";

import { Check } from "lucide-react";
import type { PlanningStatus } from "@upnext/contracts";
import { Badge } from "@/components/ui/badge";
import { planningLabels } from "@/lib/format";
import { cn } from "cn";

const statusConfig: Record<
  PlanningStatus,
  {
    badgeClass: string;
    dotClass?: string;
    hasCheckIcon?: boolean;
  }
> = {
  none: {
    badgeClass:
      "border-slate-300/80 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    dotClass: "bg-slate-500 dark:bg-slate-400",
  },
  partial: {
    badgeClass:
      "border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-200",
    dotClass: "bg-amber-500 dark:bg-amber-400",
  },
  full: {
    badgeClass:
      "border-sky-300/80 bg-sky-50 text-sky-900 dark:border-sky-800/80 dark:bg-sky-950/50 dark:text-sky-200",
    dotClass: "bg-sky-500 dark:bg-sky-400",
  },
  done: {
    badgeClass:
      "border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-200",
    hasCheckIcon: true,
  },
};

export function PlanningBadge({
  status,
  className,
  showIndicator = true,
}: {
  status: PlanningStatus;
  className?: string;
  showIndicator?: boolean;
}) {
  const config = statusConfig[status] ?? statusConfig.none;
  const label = planningLabels[status] ?? planningLabels.none;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium whitespace-nowrap", config.badgeClass, className)}
    >
      {showIndicator &&
        (config.hasCheckIcon ? (
          <Check
            className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <span
            className={cn("size-1.5 shrink-0 rounded-full", config.dotClass)}
            aria-hidden="true"
          />
        ))}
      <span>{label}</span>
    </Badge>
  );
}
