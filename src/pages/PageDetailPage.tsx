import { ArrowLeft, Play, RotateCcw, Download, Loader2, CheckCircle2, XCircle, AlertTriangle, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

const stages = [
  { number: 1, name: "Content & Migration", agents: [1, 2, 3, 4] },
  { number: 2, name: "SEO & Discoverability", agents: [5, 6, 7] },
  { number: 3, name: "Brand & Voice", agents: [8, 9] },
  { number: 4, name: "Functionality", agents: [10, 11] },
  { number: 5, name: "Performance & Compat.", agents: [12, 13, 14] },
  { number: 6, name: "Security", agents: [15] },
];

const checkStatusIcon: Record<string, React.ReactNode> = {
  passed: <CheckCircle2 className="h-4 w-4 text-zuper-green" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  warning: <AlertTriangle className="h-4 w-4 text-zuper-amber" />,
  skipped: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

interface ReportCheck {
  check_name: string;
  status: string;
  details: string;
  recommendation?: string;
}

interface AgentReport {
  agent_name: string;
  agent_number: number;
  page_url: string;
  overall_status: string;
  checks: ReportCheck[];
  summary: string;
}

export default function PageDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

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

  // Load agent runs for this page
  const { data: runs } = useQuery({
    queryKey: ["agent-runs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("*, agents!agent_runs_agent_id_fkey(id, agent_number, name)")
        .eq("page_id", id!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    refetchInterval: runningAgent ? 2000 : false,
  });

  // Map agent_number → run
  const runsByAgentNumber = new Map<number, (typeof runs extends (infer T)[] | undefined ? T : never)>();
  runs?.forEach((r) => {
    const agentNum = (r.agents as unknown as { agent_number: number })?.agent_number;
    if (agentNum) runsByAgentNumber.set(agentNum, r);
  });

  const handleRunAgent = async (agentNumber: number) => {
    const run = runsByAgentNumber.get(agentNumber);
    if (!run || !user) return;

    const agentId = (run.agents as unknown as { id: string })?.id;
    if (!agentId) return;

    setRunningAgent(agentId);
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
          body: JSON.stringify({ page_id: id, agent_id: agentId }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "Agent execution failed");
      } else {
        toast.success(`Agent completed: ${result.status}`);
      }

      queryClient.invalidateQueries({ queryKey: ["agent-runs", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run agent");
    } finally {
      setRunningAgent(null);
    }
  };

  // Find selected report to display
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const selectedRun = selectedAgent ? runsByAgentNumber.get(selectedAgent) : null;
  const selectedReport = selectedRun?.report as unknown as AgentReport | null;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pages")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground truncate">
            {page.slug || page.new_url}
          </h1>
          <p className="text-sm text-muted-foreground">
            Added {format(new Date(page.created_at), "MMM d, yyyy")} •{" "}
            {page.mode === "migration" ? "Migration" : "Ongoing"} mode
          </p>
        </div>
        <StatusBadge status={page.status} />
      </div>

      {/* Action bar */}
      <div className="flex gap-2">
        <Button disabled>
          <Play className="h-4 w-4 mr-1" />
          Run All
        </Button>
        <Button variant="outline" disabled>
          <RotateCcw className="h-4 w-4 mr-1" />
          Re-Run Failed
        </Button>
        <Button variant="outline" disabled>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      {/* Pipeline stages */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Pipeline</h2>

        {/* Stage indicator bar */}
        <div className="flex gap-1">
          {stages.map((stage) => {
            const stageRuns = stage.agents
              .map((n) => runsByAgentNumber.get(n))
              .filter(Boolean);
            const allPassed = stageRuns.length > 0 && stageRuns.every((r) => r?.status === "passed");
            const anyFailed = stageRuns.some((r) => r?.status === "failed" || r?.status === "error");
            const anyRunning = stageRuns.some((r) => r?.status === "running");

            let barClass = "bg-muted";
            if (allPassed) barClass = "bg-zuper-green";
            else if (anyFailed) barClass = "bg-destructive";
            else if (anyRunning) barClass = "bg-primary animate-pulse";

            return (
              <div key={stage.number} className={`flex-1 h-2 rounded-full ${barClass}`} />
            );
          })}
        </div>

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
                </div>

                {/* Agent rows within stage */}
                <div className="space-y-1 ml-10">
                  {stage.agents.map((agentNum) => {
                    const run = runsByAgentNumber.get(agentNum);
                    const agentName = (run?.agents as unknown as { name: string })?.name || `Agent ${agentNum}`;
                    const isRunning = runningAgent === (run?.agents as unknown as { id: string })?.id;
                    const hasReport = !!run?.report;

                    return (
                      <div
                        key={agentNum}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
                          hasReport ? "hover:bg-accent/50 cursor-pointer" : ""
                        } ${selectedAgent === agentNum ? "bg-accent" : ""}`}
                        onClick={() => hasReport && setSelectedAgent(selectedAgent === agentNum ? null : agentNum)}
                      >
                        <span className="text-muted-foreground text-xs w-5 text-right">{agentNum}</span>
                        <span className="flex-1 text-foreground">{agentName}</span>
                        {run && <StatusBadge status={run.status} className="text-[10px] h-5" />}
                        {run?.duration_ms && (
                          <span className="text-xs text-muted-foreground">
                            {(run.duration_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                        {/* Run button for Agent 5 (POC) */}
                        {agentNum === 5 && run?.status !== "running" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunAgent(5);
                            }}
                            disabled={isRunning}
                          >
                            {isRunning ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" />
                                Run
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Report display */}
      {selectedReport && (
        <Card>
          <CardContent className="py-5 px-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground">
                {selectedReport.agent_name} — Report
              </h3>
              <StatusBadge status={selectedReport.overall_status as "passed" | "failed" | "warning"} />
            </div>

            <p className="text-sm text-muted-foreground">{selectedReport.summary}</p>

            {selectedRun?.summary_stats && (
              <div className="flex gap-4 text-xs">
                {Object.entries(selectedRun.summary_stats as Record<string, number>).map(([key, val]) => (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {key.replace("_", " ")}: {val}
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {selectedReport.checks.map((check, i) => (
                <div key={i} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                  <div className="mt-0.5 shrink-0">
                    {checkStatusIcon[check.status] || checkStatusIcon.skipped}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{check.check_name}</span>
                      <Badge
                        variant={check.status === "passed" ? "secondary" : "destructive"}
                        className="text-[10px] h-4"
                      >
                        {check.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{check.details}</p>
                    {check.recommendation && (
                      <p className="text-xs text-primary mt-0.5">💡 {check.recommendation}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
