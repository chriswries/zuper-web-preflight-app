import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, MinusCircle, ChevronDown, ChevronRight, History, RotateCcw, Loader2, ShieldAlert, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LOWER_CONFIDENCE_AGENTS = [8, 9, 10, 13];

const SCOPE_DISCLAIMERS: Record<number, string> = {
  14: "Automated heuristic WCAG 2.1 AA preflight. Not a full compliance certification.",
  15: "Preflight header and client-side checks. Not a comprehensive security audit.",
};

const CONFIDENCE_LABELS: Record<string, { label: string; className: string }> = {
  high: { label: "High Confidence", className: "bg-zuper-green/15 text-zuper-green border-zuper-green/30" },
  medium: { label: "Medium Confidence", className: "bg-zuper-amber/15 text-zuper-amber border-zuper-amber/30" },
  lower: { label: "Review Recommended", className: "bg-zuper-red/15 text-zuper-red border-zuper-red/30" },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-zuper-red text-white border-transparent",
  major: "bg-zuper-red/80 text-white border-transparent",
  minor: "bg-zuper-amber text-white border-transparent",
  info: "bg-muted text-muted-foreground border-transparent",
};

const statusIcon: Record<string, React.ReactNode> = {
  passed: <CheckCircle2 className="h-4 w-4 text-zuper-green" />,
  failed: <XCircle className="h-4 w-4 text-zuper-red" />,
  warning: <AlertTriangle className="h-4 w-4 text-zuper-amber" />,
  skipped: <MinusCircle className="h-4 w-4 text-zuper-gray" />,
};

interface ReportCheck {
  check_name: string;
  status: string;
  severity?: string;
  details: string;
  finding?: string;
  expected?: string;
  actual?: string;
  element_location?: string;
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
};

function CheckRow({ check, isLowerConfidence }: { check: ReportCheck; isLowerConfidence: boolean }) {
  const defaultExpanded = check.status === "failed" || check.status === "warning";
  const [expanded, setExpanded] = useState(defaultExpanded);

  const severityClass = SEVERITY_COLORS[check.severity || "info"] || SEVERITY_COLORS.info;

  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center gap-3 py-3 px-4 text-left hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="shrink-0">{statusIcon[check.status] || statusIcon.skipped}</div>
        <span className="flex-1 text-sm font-medium text-foreground">{check.check_name}</span>
        {check.severity && (
          <Badge className={`text-[10px] h-4 ${severityClass}`}>
            {check.severity}
          </Badge>
        )}
        {isLowerConfidence && (
          <Badge variant="outline" className="text-[10px] h-4 border-zuper-amber/40 text-zuper-amber">
            <Eye className="h-2.5 w-2.5 mr-0.5" />
            Review
          </Badge>
        )}
        <Badge
          variant={check.status === "passed" ? "secondary" : "destructive"}
          className="text-[10px] h-4"
        >
          {check.status}
        </Badge>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-14 space-y-2">
          {check.details && (
            <p className="text-sm text-muted-foreground">{check.details}</p>
          )}
          {check.finding && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Finding: </span>
              <span className="text-xs text-foreground">{check.finding}</span>
            </div>
          )}
          {(check.expected || check.actual) && (
            <div className="grid grid-cols-2 gap-3">
              {check.expected && (
                <div className="rounded bg-zuper-green/10 px-3 py-2">
                  <span className="text-[10px] font-medium text-zuper-green uppercase">Expected</span>
                  <p className="text-xs text-foreground mt-0.5">{check.expected}</p>
                </div>
              )}
              {check.actual && (
                <div className="rounded bg-zuper-red/10 px-3 py-2">
                  <span className="text-[10px] font-medium text-zuper-red uppercase">Actual</span>
                  <p className="text-xs text-foreground mt-0.5">{check.actual}</p>
                </div>
              )}
            </div>
          )}
          {check.element_location && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Element: </span>
              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{check.element_location}</code>
            </div>
          )}
          {check.recommendation && (
            <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2">
              <span className="text-[10px] font-medium text-primary uppercase">Recommendation</span>
              <p className="text-xs text-foreground mt-0.5">{check.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentReportPage() {
  const navigate = useNavigate();
  const { id: pageId, agentId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  // Load agent
  const { data: agent } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_number, name, confidence_tier, stage_number, is_blocking")
        .eq("id", agentId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!agentId,
  });

  // Load page
  const { data: page } = useQuery({
    queryKey: ["page", pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("id, new_url, slug")
        .eq("id", pageId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!pageId,
  });

  // Load all runs for this agent on this page
  const { data: runs, isLoading } = useQuery({
    queryKey: ["agent-runs-detail", pageId, agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("page_id", pageId!)
        .eq("agent_id", agentId!)
        .order("run_number", { ascending: false });
      if (error) throw error;
      return data as unknown as AgentRunRow[];
    },
    enabled: !!pageId && !!agentId,
  });

  const selectedRun = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    if (selectedRunId) return runs.find((r) => r.id === selectedRunId) ?? runs[0];
    return runs[0]; // Latest
  }, [runs, selectedRunId]);

  const report = selectedRun?.report as unknown as AgentReport | null;
  const stats = selectedRun?.summary_stats as Record<string, number> | null;
  const isLowerConfidence = agent ? LOWER_CONFIDENCE_AGENTS.includes(agent.agent_number) : false;
  const disclaimer = agent ? SCOPE_DISCLAIMERS[agent.agent_number] : undefined;
  const confidenceInfo = agent ? CONFIDENCE_LABELS[agent.confidence_tier] : undefined;

  const rerunAgent = useCallback(async () => {
    if (!user || !pageId || !agentId) return;
    setRerunning(true);
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
            page_id: pageId,
            agent_id: agentId,
            recalculate_page_status: true,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Re-run failed");
      } else {
        toast.success(`Agent completed: ${result.status}`);
        setSelectedRunId(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRerunning(false);
      queryClient.invalidateQueries({ queryKey: ["agent-runs-detail", pageId, agentId] });
      queryClient.invalidateQueries({ queryKey: ["page", pageId] });
    }
  }, [user, pageId, agentId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/pages" className="hover:text-foreground transition-colors">Pages</Link>
        <span>/</span>
        <Link to={`/pages/${pageId}`} className="hover:text-foreground transition-colors">
          {page?.slug || "Page"}
        </Link>
        <span>/</span>
        <span className="text-foreground">{agent?.name || "Agent"}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/pages/${pageId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">#{agent?.agent_number}</span>
            <h1 className="text-2xl font-semibold text-foreground">{agent?.name || "Agent Report"}</h1>
            {confidenceInfo && (
              <Badge variant="outline" className={`text-xs ${confidenceInfo.className}`}>
                {confidenceInfo.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            {selectedRun?.completed_at && (
              <span>{format(new Date(selectedRun.completed_at), "MMM d, yyyy 'at' h:mm a")}</span>
            )}
            {selectedRun?.duration_ms && (
              <span>{(selectedRun.duration_ms / 1000).toFixed(1)}s</span>
            )}
            {selectedRun?.model_used && (
              <Badge variant="secondary" className="text-[10px] h-4">{selectedRun.model_used}</Badge>
            )}
            {selectedRun && (
              <Badge variant="secondary" className="text-[10px] h-4">Run #{selectedRun.run_number}</Badge>
            )}
          </div>
        </div>
        {selectedRun && <StatusBadge status={selectedRun.status as any} />}
        <Button
          size="sm"
          variant="outline"
          onClick={rerunAgent}
          disabled={rerunning}
        >
          {rerunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
          Re-Run
        </Button>
      </div>

      {/* Scope disclaimer */}
      {disclaimer && (
        <Alert variant="default" className="border-zuper-amber/30 bg-zuper-amber/5">
          <ShieldAlert className="h-4 w-4 text-zuper-amber" />
          <AlertDescription className="text-sm text-muted-foreground">
            {disclaimer}
          </AlertDescription>
        </Alert>
      )}

      {/* Main content + sidebar */}
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="space-y-4">
          {/* Summary stats */}
          {stats && (
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Total", value: stats.total_checks, color: "text-foreground" },
                { label: "Passed", value: stats.passed, color: "text-zuper-green" },
                { label: "Failed", value: stats.failed, color: "text-zuper-red" },
                { label: "Warnings", value: stats.warnings, color: "text-zuper-amber" },
                { label: "Skipped", value: stats.skipped, color: "text-zuper-gray" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="py-3 px-3 text-center">
                    <p className={`text-xl font-semibold ${s.color}`}>{s.value ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Summary text */}
          {report?.summary && (
            <Card>
              <CardContent className="py-3 px-4">
                <p className="text-sm text-muted-foreground">{report.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Check list */}
          {report?.checks && report.checks.length > 0 && (
            <Card>
              <CardContent className="p-0">
                {report.checks.map((check, i) => (
                  <CheckRow key={i} check={check} isLowerConfidence={isLowerConfidence} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {selectedRun?.error_message && !report && (
            <Card>
              <CardContent className="py-6 text-center">
                <XCircle className="h-8 w-8 text-zuper-red mx-auto mb-2" />
                <p className="text-sm text-destructive">{selectedRun.error_message}</p>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!report && !selectedRun?.error_message && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No report data yet. Run this agent to see results.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Run history sidebar */}
        {runs && runs.length > 0 && (
          <Card className="h-fit">
            <CardContent className="py-3 px-3">
              <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                <History className="h-4 w-4" />
                Run History
              </h3>
              <div className="space-y-1">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      (selectedRunId === run.id || (!selectedRunId && run.id === runs[0]?.id))
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    }`}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Run #{run.run_number}</span>
                      <StatusBadge status={run.status as any} className="text-[9px] h-4 px-1.5" />
                    </div>
                    {run.completed_at && (
                      <p className="text-muted-foreground mt-0.5">
                        {format(new Date(run.completed_at), "MMM d, h:mm a")}
                      </p>
                    )}
                    {run.duration_ms && (
                      <p className="text-muted-foreground">
                        {(run.duration_ms / 1000).toFixed(1)}s
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
