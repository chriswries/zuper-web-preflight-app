import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

interface GateWarning {
  stage_number: number;
  failed_agents: Array<{ agent_number: number; name: string; status: string }>;
}

interface GateWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOverride: () => void;
  warnings: GateWarning[];
}

export function GateWarningDialog({
  open,
  onOpenChange,
  onOverride,
  warnings,
}: GateWarningDialogProps) {
  if (warnings.length === 0) return null;

  const firstWarning = warnings[0];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-zuper-amber" />
            Stage Gate Warning
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Stage {firstWarning.stage_number} cannot proceed because the following agents in prior stages have failures:
              </p>
              <ul className="space-y-1">
                {firstWarning.failed_agents.map((a) => (
                  <li key={a.agent_number} className="text-sm flex items-center gap-2">
                    <span className="text-destructive font-medium">✕</span>
                    <span>Agent {a.agent_number}: {a.name}</span>
                    <span className="text-xs text-muted-foreground">({a.status})</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Overriding this gate will be logged in the audit trail.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stop Here</AlertDialogCancel>
          <AlertDialogAction onClick={onOverride} className="bg-zuper-amber hover:bg-zuper-amber/90">
            Run Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
