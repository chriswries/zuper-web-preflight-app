import { CheckCircle2, XCircle, AlertTriangle, MinusCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";

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

interface AgentReportCardProps {
  report: AgentReport;
  summaryStats?: Record<string, number>;
}

export function AgentReportCard({ report, summaryStats }: AgentReportCardProps) {
  return (
    <Card>
      <CardContent className="py-5 px-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-foreground">
            {report.agent_name} — Report
          </h3>
          <StatusBadge status={report.overall_status as "passed" | "failed" | "warning"} />
        </div>

        <p className="text-sm text-muted-foreground">{report.summary}</p>

        {summaryStats && (
          <div className="flex gap-4 text-xs">
            {Object.entries(summaryStats).map(([key, val]) => (
              <Badge key={key} variant="secondary" className="text-xs">
                {key.replace("_", " ")}: {val}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {report.checks.map((check, i) => (
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
  );
}
