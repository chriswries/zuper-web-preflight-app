import { ArrowLeft, Play, RotateCcw, Download, Loader2, ExternalLink, FileText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { PipelineStageBar } from "@/components/pipeline/PipelineStageBar";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportMarkdown, exportPDF } from "@/lib/export-report";
import { ExpandableAgentRow } from "@/components/pipeline/ExpandableAgentRow";

const stages = [
  { number: 1, name: "Content & Migration", agents: [1, 2, 3, 4] },
  { number: 2, name: "SEO & Discoverability", agents: [5, 6, 7] },
  { number: 3, name: "Brand & Voice", agents: [8, 9] },
  { number: 4, name: "Functionality", agents: [10, 11] },
  { number: 5, name: "Performance & Compat.", agents: [12, 13, 14] },
  { number: 6, name: "Security", agents: [15] },
];

interface AgentReport {
  agent_name: string;
  agent_number: number;
  page_url: string;
  overall_status: string;
  checks: Array<{ check_name: string; status: string; details: string; recommendation?: string }>;
  summary: string;
}

type RunScope = "all" | "stage" | "failed";

type AgentRunRow = {
  id: string;
  page_id: string;
  agent_id: string;
  run_number: number;
  status: string;
  report: unknown;
  summary_stats: unknown;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  model_used: string | null;
  agents: { id: string; agent_number: number; name: string; is_blocking: boolean } | null;
};

export default function PageDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [rerunningAgent, setRerunningAgent] = useState<string | null>(null);



  // Load page
  const { data: page, isLoading: pageLoading } = useQuery({
    queryKey: ["page", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Load agents
  const { data: allAgents } = useQuery({
    queryKey: ["agents-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_number, stage_number, requires_browserless, migration_only, is_active")
        .eq("is_active", true)
        .order("stage_number")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Load ALL agent runs for this page (not just latest)
  const { data: runs } = useQuery({
    queryKey: ["agent-runs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("*, agents!agent_runs_agent_id_fkey(id, agent_number, name, is_blocking)")
        .eq("page_id", id!)
        .order("run_number", { ascending: false });
      if (error) throw error;
      return data as unknown as AgentRunRow[];
    },
    enabled: !!id,
    refetchInterval: pipelineRunning ? 2000 : false,
  });

  // Latest run per agent_number (for main display + status)
  const latestRunByAgent = useMemo(() => {
    const map = new Map<number, AgentRunRow>();
    runs?.forEach((r) => {
      const agentNum = r.agents?.agent_number;
      if (agentNum && !map.has(agentNum)) {
        map.set(agentNum, r); // First entry is latest (ordered desc)
      }
    });
    return map;
  }, [runs]);

  // All runs grouped by agent_number (for history)
  const allRunsByAgent = useMemo(() => {
    const map = new Map<number, AgentRunRow[]>();
    runs?.forEach((r) => {
      const agentNum = r.agents?.agent_number;
      if (agentNum) {
        const arr = map.get(agentNum) || [];
        arr.push(r);
        map.set(agentNum, arr);
      }
    });
    return map;
  }, [runs]);

  // Compute stage info for bar
  const stageInfos = useMemo(() => {
    return stages.map((stage) => {
      const stageRuns = stage.agents.map((n) => latestRunByAgent.get(n)).filter(Boolean);
      const nonSkippedRuns = stageRuns.filter((r) => r?.status !== "skipped");
      return {
        number: stage.number,
        name: stage.name,
        allPassed: nonSkippedRuns.length > 0 && nonSkippedRuns.every((r) => r?.status === "passed" || r?.status === "warning"),
        anyFailed: nonSkippedRuns.some((r) => r?.status === "failed" || r?.status === "error"),
        anyRunning: nonSkippedRuns.some((r) => r?.status === "running"),
        anyQueued: nonSkippedRuns.some((r) => r?.status === "queued"),
        hasRuns: nonSkippedRuns.length > 0,
      };
    });
  }, [latestRunByAgent]);

  const isPipelineActive = useMemo(() => {
    return runs?.some((r) => r.status === "running" || r.status === "queued") ?? false;
  }, [runs]);

  const failedCount = useMemo(() => {
    let count = 0;
    latestRunByAgent.forEach((run) => {
      if (run.status === "failed" || run.status === "error") count++;
    });
    return count;
  }, [latestRunByAgent]);


  const executePipeline = async (
    scope: RunScope,
    stageNumber?: number,
    overrideGates: number[] = []
  ) => {
    if (!user || !id) return;
    setPipelineRunning(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-pipeline`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            page_id: id,
            scope,
            stage_number: stageNumber,
            override_gates: overrideGates,
          }),
        }
      );

      const result = await res.json();

      if (res.status === 409) {
        toast.error(result.error);
        return;
      }

      if (!res.ok) {
        toast.error(result.error || "Pipeline execution failed");
        return;
      }

      if (result.gate_warnings?.length > 0) {
        setGateDialog({
          open: true,
          warnings: result.gate_warnings,
          scope,
          stageNumber,
          overrides: [
            ...overrideGates,
            ...result.gate_warnings.map((w: GateWarning) => w.stage_number),
          ],
        });
        return;
      }

      const passed = result.results?.filter((r: { status: string }) => r.status === "passed").length ?? 0;
      const failed = result.results?.filter((r: { status: string }) => r.status === "failed" || r.status === "error").length ?? 0;

      toast.success(
        `Pipeline complete: ${passed} passed, ${failed} failed out of ${result.completed} agents`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run pipeline");
    } finally {
      setPipelineRunning(false);
      queryClient.invalidateQueries({ queryKey: ["agent-runs", id] });
      queryClient.invalidateQueries({ queryKey: ["page", id] });
    }
  };

  const rerunSingleAgent = useCallback(async (agentId: string, agentNumber: number) => {
    if (!user || !id) return;
    setRerunningAgent(agentId);
    setPipelineRunning(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            page_id: id,
            agent_id: agentId,
            recalculate_page_status: true,
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || `Agent ${agentNumber} failed`);
      } else {
        toast.success(`Agent ${agentNumber} completed: ${result.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRerunningAgent(null);
      setPipelineRunning(false);
      queryClient.invalidateQueries({ queryKey: ["agent-runs", id] });
      queryClient.invalidateQueries({ queryKey: ["page", id] });
    }
  }, [user, id, queryClient]);


  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Page not found</p>
      </div>
    );
  }


  const fromQueue = searchParams.get("from") === "queue";

  return (
    <div className="space-y-6">
      {/* Breadcrumb from queue */}
      {fromQueue && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/queue" className="hover:text-foreground transition-colors">QA Queue</Link>
          <span>/</span>
          <span className="text-foreground">{page.slug || "Page Detail"}</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pages")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground truncate">
              {page.slug || page.new_url}
            </h1>
            <Badge variant={page.mode === "migration" ? "default" : "secondary"} className="shrink-0">
              {page.mode === "migration" ? "Migration" : "Ongoing"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Added {page.created_at && !isNaN(new Date(page.created_at).getTime()) ? format(new Date(page.created_at), "MMM d, yyyy") : "Unknown"}
          </p>
          {page.mode === "migration" && page.old_url && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-muted-foreground">Old URL:</span>
              <a
                href={page.old_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
              >
                {page.old_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
        <StatusBadge status={page.status} />
      </div>

      {/* Action bar */}
      <div className="flex gap-2">
        <Button
          onClick={() => executePipeline("all")}
          disabled={isPipelineActive || pipelineRunning}
        >
          {pipelineRunning ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-1" />
          )}
          {isPipelineActive ? "QA Running…" : "Run All"}
        </Button>
        <Button
          variant="outline"
          onClick={() => executePipeline("failed")}
          disabled={isPipelineActive || pipelineRunning || failedCount === 0}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Re-Run Failed {failedCount > 0 && `(${failedCount})`}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-1" />
              Export
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              if (page && latestRunByAgent.size > 0) {
                exportMarkdown(page, latestRunByAgent as any);
                toast.success("Markdown report downloaded");
              } else {
                toast.error("No agent runs to export");
              }
            }}>
              <FileText className="h-4 w-4 mr-2" />
              Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              if (page && latestRunByAgent.size > 0) {
                exportPDF(page, latestRunByAgent as any);
                toast.success("PDF report downloaded");
              } else {
                toast.error("No agent runs to export");
              }
            }}>
              <Download className="h-4 w-4 mr-2" />
              PDF (.pdf)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pipeline visualization */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Pipeline</h2>
        <PipelineStageBar stages={stageInfos} />

        {/* Stage cards */}
        <div className="grid gap-4">
          {stages.map((stage) => (
            <Card key={stage.number}>
              <CardContent className="py-4 px-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {stage.number}
                    </span>
                    <span className="font-medium text-foreground">{stage.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {stage.agents.length} agent{stage.agents.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => executePipeline("stage", stage.number)}
                    disabled={isPipelineActive || pipelineRunning}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Run Stage
                  </Button>
                </div>

                {/* Agent rows */}
                <div className="space-y-0.5 ml-10">
                  <TooltipProvider>
                    {stage.agents.map((agentNum) => (
                      <ExpandableAgentRow
                        key={agentNum}
                        agentNum={agentNum}
                        latestRun={latestRunByAgent.get(agentNum)}
                        allRuns={allRunsByAgent.get(agentNum) ?? []}
                        pageId={id!}
                        pageMode={page.mode}
                        isPipelineActive={isPipelineActive}
                        pipelineRunning={pipelineRunning}
                        rerunningAgent={rerunningAgent}
                        onRerun={rerunSingleAgent}
                      />
                    ))}
                  </TooltipProvider>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>


    </div>
  );
}
