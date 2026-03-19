import { ClipboardList } from "lucide-react";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>

      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
          <ClipboardList className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-1">No activity yet</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Actions like running agents, changing settings, and managing users will be logged here.
        </p>
      </div>
    </div>
  );
}
