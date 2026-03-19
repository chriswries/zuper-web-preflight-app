import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Status = "passed" | "failed" | "warning" | "error" | "running" | "queued" | "not_started" | "skipped" | "pending" | "in_progress" | "passed_with_warnings" | "archived" | "claimed" | "promoted";

const statusConfig: Record<Status, { label: string; className: string }> = {
  passed: { label: "Passed", className: "bg-zuper-green text-white border-transparent" },
  failed: { label: "Failed", className: "bg-zuper-red text-white border-transparent" },
  warning: { label: "Warning", className: "bg-zuper-amber text-white border-transparent" },
  error: { label: "Error", className: "bg-zuper-red text-white border-transparent" },
  running: { label: "Running", className: "bg-primary text-primary-foreground border-transparent animate-pulse" },
  queued: { label: "Queued", className: "bg-muted text-muted-foreground border-transparent" },
  not_started: { label: "Not Started", className: "bg-muted text-muted-foreground border-transparent" },
  skipped: { label: "Skipped", className: "bg-zuper-gray text-white border-transparent" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground border-transparent" },
  in_progress: { label: "In Progress", className: "bg-primary text-primary-foreground border-transparent animate-pulse" },
  passed_with_warnings: { label: "Passed w/ Warnings", className: "bg-zuper-amber text-white border-transparent" },
  archived: { label: "Archived", className: "bg-zuper-gray text-white border-transparent" },
  claimed: { label: "Claimed", className: "bg-primary/80 text-primary-foreground border-transparent" },
  promoted: { label: "Promoted", className: "bg-zuper-green text-white border-transparent" },
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.not_started;
  return (
    <Badge className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
