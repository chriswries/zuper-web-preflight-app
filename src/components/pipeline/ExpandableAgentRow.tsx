import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, History, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AgentReportContent, type AgentRunRow } from "./AgentReportContent";

interface ExpandableAgentRowProps {
  agentNum: number;
  latestRun: AgentRunRow & { agents: { id: string; agent_number: number; name: string; is_blocking: boolean } | null } | undefined;
  allRuns: Array<AgentRunRow & { agents: { id: string; agent_number: number; name: string; is_blocking: boolean } | null }>;
  pageId: string;
  pageMode: string;
  pageUrl?: string;
  pageSlug?: string;
  isPipelineActive: boolean;
  pipelineRunning: boolean;
  rerunningAgent: string | null;
  onRerun: (agentId: string, agentNum: number) => void;
}

export function ExpandableAgentRow({
  agentNum,
  latestRun: run,
  allRuns: parentRuns,
  pageId,
  pageMode,
  pageUrl,
  pageSlug,
  isPipelineActive,
  pipelineRunning,
  rerunningAgent,
  onRerun,
}: ExpandableAgentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const agentName = run?.agents?.name || `Agent ${agentNum}`;
  const hasReport = !!run?.report;
  const isSkipped = run?.status === "skipped";
  const agentId = run?.agents?.id;
  const canRerun = run && !isSkipped && !isPipelineActive && !pipelineRunning &&
    (run.status === "passed" || run.status === "failed" || run.status === "error" || run.status === "warning");
  const historyCount = parentRuns.length;

  // Lazy-load detailed agent data (including confidence_tier) on first expansion
  const { data: agentMeta } = useQuery({
    queryKey: ["agent-meta", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("confidence_tier")
        .eq("id", agentId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!agentId && hasFetched,
  });

  // Lazy-load full run details on first expansion
  const { data: detailedRuns } = useQuery({
    queryKey: ["agent-runs-detail-inline", pageId, agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("page_id", pageId)
        .eq("agent_id", agentId!)
        .order("run_number", { ascending: false });
      if (error) throw error;
      return data as unknown as AgentRunRow[];
    },
    enabled: !!agentId && hasFetched,
  });

  const handleToggle = useCallback(() => {
    if (!expanded && !hasFetched) {
      setHasFetched(true);
    }
    setExpanded(!expanded);
  }, [expanded, hasFetched]);

  const latestDetailedRun = detailedRuns?.[0];
  const displayRun = latestDetailedRun ?? (run as unknown as AgentRunRow | undefined);

  if (isSkipped && pageMode === "ongoing") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 py-1.5 px-2 rounded text-sm opacity-50">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            <span className="text-muted-foreground text-xs w-5 text-right">{agentNum}</span>
            <span className="flex-1 text-muted-foreground">{agentName}</span>
            {run && <StatusBadge status={run.status as any} className="text-[10px] h-5" />}
          </div>
        </TooltipTrigger>
        <TooltipContent>Skipped — ongoing mode</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      {/* Collapsed row */}
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm transition-colors ${
          isSkipped ? "opacity-50" : ""
        } ${hasReport || run ? "hover:bg-accent/50 cursor-pointer" : ""} ${
          expanded ? "bg-accent/60" : ""
        }`}
        onClick={handleToggle}
      >
        <div className="shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <span className="text-muted-foreground text-xs w-5 text-right">{agentNum}</span>
        <span className={`flex-1 ${isSkipped ? "text-muted-foreground" : "text-foreground"}`}>
          {agentName}
        </span>
        {historyCount > 1 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <History className="h-3 w-3" />
            {historyCount}
          </span>
        )}
        {run && <StatusBadge status={run.status as any} className="text-[10px] h-5" />}
        {run?.duration_ms && (
          <span className="text-xs text-muted-foreground">
            {(run.duration_ms / 1000).toFixed(1)}s
          </span>
        )}
        {canRerun && agentId && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0"
            disabled={rerunningAgent === agentId}
            onClick={(e) => {
              e.stopPropagation();
              onRerun(agentId, agentNum);
            }}
          >
            {rerunningAgent === agentId ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      {/* Expanded inline report with animation */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {(expanded || hasFetched) && displayRun && (
          <div className="ml-6 mr-2 mt-1 mb-3 p-3 rounded-md bg-accent/20 border border-border/50 animate-fade-in">
            <AgentReportContent
              run={displayRun}
              agentNumber={agentNum}
              confidenceTier={agentMeta?.confidence_tier}
              allRuns={detailedRuns}
              agentName={agentMeta?.name}
              pageUrl={pageUrl}
              pageSlug={pageSlug}
              compact
            />
          </div>
        )}

        {expanded && !displayRun && !isSkipped && (
          <div className="ml-6 mr-2 mt-1 mb-3 p-3 rounded-md bg-accent/20 border border-border/50 animate-fade-in">
            <p className="text-sm text-muted-foreground text-center py-3">
              No runs yet. Run this agent to see results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
