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

interface RunPipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  agentCount: number;
  browserlessCount: number;
  scope: string;
  stageName?: string;
}

// Rough cost estimates per PRD
const COST_PER_HAIKU = 0.003;
const COST_PER_SONNET = 0.015;
const AVG_COST_PER_AGENT = (COST_PER_HAIKU + COST_PER_SONNET) / 2;

export function RunPipelineDialog({
  open,
  onOpenChange,
  onConfirm,
  agentCount,
  browserlessCount,
  scope,
  stageName,
}: RunPipelineDialogProps) {
  const estimatedCost = (agentCount * AVG_COST_PER_AGENT).toFixed(2);
  const title = scope === "stage" ? `Run Stage: ${stageName}` : scope === "failed" ? "Re-Run Failed Agents" : "Run All Agents";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This will execute <strong>{agentCount}</strong> agent{agentCount !== 1 ? "s" : ""} sequentially.
              </p>
              <p>
                Estimated cost: <strong>~${estimatedCost}</strong>
                {browserlessCount > 0 && (
                  <> + <strong>{browserlessCount}</strong> Browserless unit{browserlessCount !== 1 ? "s" : ""}</>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Each agent has a 60-second timeout. Total time depends on content size.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Run {agentCount} Agent{agentCount !== 1 ? "s" : ""}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
