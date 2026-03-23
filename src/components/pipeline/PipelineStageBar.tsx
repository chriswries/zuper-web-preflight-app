import { CheckCircle2, XCircle, Lock, Loader2 } from "lucide-react";

interface StageInfo {
  number: number;
  name: string;
  allPassed: boolean;
  anyFailed: boolean;
  anyRunning: boolean;
  anyQueued: boolean;
  hasRuns: boolean;
}

interface PipelineStageBarProps {
  stages: StageInfo[];
}

export function PipelineStageBar({ stages }: PipelineStageBarProps) {
  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, i) => {
        let barClass = "bg-muted";
        let icon = <Lock className="h-3 w-3 text-muted-foreground" />;

        if (stage.allPassed) {
          barClass = "bg-zuper-green";
          icon = <CheckCircle2 className="h-3 w-3 text-zuper-green" />;
        } else if (stage.anyFailed) {
          barClass = "bg-destructive";
          icon = <XCircle className="h-3 w-3 text-destructive" />;
        } else if (stage.anyRunning || stage.anyQueued) {
          barClass = "bg-primary animate-pulse";
          icon = <Loader2 className="h-3 w-3 text-primary animate-spin" />;
        }

        return (
          <div key={stage.number} className="flex items-center flex-1 gap-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-center gap-1">
                {icon}
                <span className="text-[10px] text-muted-foreground">{stage.number}</span>
              </div>
              <div className={`w-full h-2 rounded-full ${barClass}`} />
            </div>
            {i < stages.length - 1 && (
              <div className="h-px w-2 bg-border shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
