import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, ChevronDown, ChevronRight, History, ShieldAlert, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { FlagButton } from "@/components/pipeline/FlagButton";
import { useFindingFlagsForRun, type FindingFlag } from "@/hooks/useFindingFlags";

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

export interface ReportCheck {
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

export interface AgentReport {
  agent_name: string;
  agent_number: number;
  page_url: string;
  overall_status: string;
  checks: ReportCheck[];
  summary: string;
}

export interface AgentRunRow {
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
}

function CheckRow({ check, isLowerConfidence, agentRunId, pageId, agentName, agentNumber, pageUrl, pageSlug, existingFlag }: {
  check: ReportCheck;
  isLowerConfidence: boolean;
  agentRunId?: string;
  pageId?: string;
  agentName?: string;
  agentNumber?: number;
  pageUrl?: string;
  pageSlug?: string;
  existingFlag?: FindingFlag;
}) {
  const defaultExpanded = check.status === "failed" || check.status === "warning";
  const [expanded, setExpanded] = useState(defaultExpanded);
  const severityClass = SEVERITY_COLORS[check.severity || "info"] || SEVERITY_COLORS.info;

  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center gap-3 py-2.5 px-3 text-left hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="shrink-0">{statusIcon[check.status] || statusIcon.skipped}</div>
        <span className="flex-1 text-sm font-medium text-foreground">{check.check_name}</span>
        {check.severity && (
          <Badge className={`text-[10px] h-4 ${severityClass}`}>{check.severity}</Badge>
        )}
        {isLowerConfidence && (
          <Badge variant="outline" className="text-[10px] h-4 border-zuper-amber/40 text-zuper-amber">
            <Eye className="h-2.5 w-2.5 mr-0.5" />Review
          </Badge>
        )}
        {(check.status === "failed" || check.status === "warning") && agentRunId && pageId && agentName && agentNumber != null && pageUrl && (
          <FlagButton
            agentRunId={agentRunId}
            pageId={pageId}
            checkName={check.check_name}
            checkSeverity={check.severity || "info"}
            checkFinding={check.finding}
            agentName={agentName}
            agentNumber={agentNumber}
            pageUrl={pageUrl}
            pageSlug={pageSlug}
            existingFlag={existingFlag}
          />
        )}
        <Badge variant={check.status === "passed" ? "secondary" : "destructive"} className="text-[10px] h-4">
          {check.status}
        </Badge>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pl-12 space-y-2">
          {check.details && <p className="text-sm text-muted-foreground">{check.details}</p>}
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

interface AgentReportContentProps {
  run: AgentRunRow;
  agentNumber: number;
  confidenceTier?: string;
  allRuns?: AgentRunRow[];
  /** Render in compact inline mode (inside page detail) vs full standalone */
  compact?: boolean;
}

export function AgentReportContent({ run, agentNumber, confidenceTier, allRuns, compact = false, agentName, pageUrl, pageSlug }: AgentReportContentProps & { agentName?: string; pageUrl?: string; pageSlug?: string }) {
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeRun = selectedHistoryRunId
    ? allRuns?.find((r) => r.id === selectedHistoryRunId) ?? run
    : run;

  const report = activeRun.report as unknown as AgentReport | null;
  const stats = activeRun.summary_stats as Record<string, number> | null;
  const isLowerConfidence = LOWER_CONFIDENCE_AGENTS.includes(agentNumber);

  const { data: flagsData } = useFindingFlagsForRun(activeRun.id);
  const flagsByCheck = new Map((flagsData ?? []).map((f) => [f.check_name, f]));
  const disclaimer = SCOPE_DISCLAIMERS[agentNumber];
  const confidenceInfo = confidenceTier ? CONFIDENCE_LABELS[confidenceTier] : undefined;

  if (activeRun.error_message && !report) {
    return (
      <div className="py-4 text-center">
        <XCircle className="h-6 w-6 text-zuper-red mx-auto mb-2" />
        <p className="text-sm text-destructive">{activeRun.error_message}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="py-6 text-center">
        <AlertTriangle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No report data yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Confidence + disclaimer */}
      <div className="flex items-center gap-2 flex-wrap">
        {confidenceInfo && (
          <Badge variant="outline" className={`text-xs ${confidenceInfo.className}`}>
            {confidenceInfo.label}
          </Badge>
        )}
        {selectedHistoryRunId && activeRun.id !== run.id && (
          <Badge variant="secondary" className="text-[10px]">
            Viewing Run #{activeRun.run_number}
          </Badge>
        )}
      </div>

      {disclaimer && (
        <Alert variant="default" className="border-zuper-amber/30 bg-zuper-amber/5 py-2">
          <ShieldAlert className="h-3.5 w-3.5 text-zuper-amber" />
          <AlertDescription className="text-xs text-muted-foreground">{disclaimer}</AlertDescription>
        </Alert>
      )}

      {/* Compact stat bar */}
      {stats && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-foreground font-medium">{stats.total_checks ?? 0} checks:</span>
          <span className="text-zuper-green font-medium">{stats.passed ?? 0} passed</span>
          <span className="text-zuper-red font-medium">{stats.failed ?? 0} failed</span>
          <span className="text-zuper-amber font-medium">{stats.warnings ?? 0} warnings</span>
          <span className="text-zuper-gray font-medium">{stats.skipped ?? 0} skipped</span>
        </div>
      )}

      {/* Summary */}
      {report.summary && (
        <p className="text-sm text-muted-foreground">{report.summary}</p>
      )}

      {/* Checks */}
      {report.checks && report.checks.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          {report.checks.map((check, i) => (
            <CheckRow
              key={i}
              check={check}
              isLowerConfidence={isLowerConfidence}
              agentRunId={activeRun.id}
              pageId={activeRun.page_id}
              agentName={agentName || report.agent_name}
              agentNumber={agentNumber}
              pageUrl={pageUrl || report.page_url}
              pageSlug={pageSlug}
              existingFlag={flagsByCheck.get(check.check_name)}
            />
          ))}
        </div>
      )}

      {/* Run history toggle */}
      {allRuns && allRuns.length > 1 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
            <History className="h-3.5 w-3.5" />
            <span>Run History ({allRuns.length} runs)</span>
            {historyOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 space-y-0.5">
              {allRuns.map((r) => (
                <button
                  key={r.id}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    (selectedHistoryRunId === r.id || (!selectedHistoryRunId && r.id === run.id))
                      ? "bg-accent"
                      : "hover:bg-accent/50"
                  }`}
                  onClick={() => setSelectedHistoryRunId(r.id === run.id ? null : r.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Run #{r.run_number}</span>
                    <StatusBadge status={r.status as any} className="text-[9px] h-4 px-1.5" />
                    {r.duration_ms && (
                      <span className="text-muted-foreground">{(r.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    {r.completed_at && (
                      <span className="text-muted-foreground ml-auto">
                        {format(new Date(r.completed_at), "MMM d, h:mm a")}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
