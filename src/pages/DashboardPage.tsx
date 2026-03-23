import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  CalendarIcon,
  Clock,
  FileCheck,
  FileX,
  Files,
  Hourglass,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Bar, BarChart } from "recharts";
import { useDashboardData, type DateRange } from "@/hooks/useDashboardData";

const confidenceTierColor: Record<string, string> = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  lower: "bg-red-100 text-red-800 border-red-200",
};

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const data = useDashboardData(dateRange);

  if (data.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-5">
                <Skeleton className="h-8 w-16 mx-auto" />
                <Skeleton className="h-4 w-24 mx-auto mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const chartConfig = {
    count: { label: "Pages QA'd", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6">
      {/* Header + Date Range Filter */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(dateRange.from, "MMM d")} – {format(dateRange.to, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from) {
                    setDateRange({ from: range.from, to: range.to ?? range.from });
                  }
                }}
                numberOfMonths={2}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
        <SummaryCard icon={Files} label="Total Pages" value={data.totalPages} />
        <SummaryCard icon={FileCheck} label="Passed" value={data.passedPages} color="text-green-600" />
        <SummaryCard icon={FileX} label="Failed" value={data.failedPages} color="text-destructive" />
        <SummaryCard icon={Hourglass} label="Pending" value={data.pendingPages} color="text-amber-600" />
        <SummaryCard icon={Clock} label="Hours Saved" value={data.estimatedHoursSaved.toFixed(1)} color="text-primary" />
        <SummaryCard icon={ListChecks} label="Queue Remaining" value={data.queueRemaining} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Pipeline Completion" value={`${data.pipelineCompletionRate.toFixed(0)}%`} icon={TrendingUp} />
        <KpiCard label="Queue Throughput" value={`${data.queueThroughput.toFixed(0)}%`} icon={RefreshCw} />
        <KpiCard label="Avg. Turnaround" value={formatDuration(data.avgTurnaroundMs)} icon={Clock} />
        <KpiCard label="Gate Override Rate" value={`${data.gateOverrideRate.toFixed(0)}%`} sub={`${data.overrideCount} overrides`} icon={ShieldAlert} />
      </div>

      {/* Charts + Tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pages QA'd per Week</CardTitle>
          </CardHeader>
          <CardContent>
            {data.weeklyTrend.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No data yet for selected period.</p>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[260px] w-full">
                <LineChart data={data.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Agent Failure Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agent Failure Rate</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Failure Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agentFailureRates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No agent runs in selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.agentFailureRates.map((row) => (
                    <TableRow
                      key={row.agent_id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/settings/agents`)}
                    >
                      <TableCell className="font-mono text-muted-foreground">{row.agent_number}</TableCell>
                      <TableCell className="font-medium">{row.agent_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs capitalize", confidenceTierColor[row.confidence_tier])}>
                          {row.confidence_tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.total_runs}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {row.total_runs > 0 ? `${(row.failure_rate * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Operator Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Operator Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                  <TableHead className="text-right">First-Pass Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operatorBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No operator data.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.operatorBreakdown.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell className="font-medium">{row.display_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.total_pages}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.passed_pages}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {(row.first_pass_rate * 100).toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Re-run Rate by Agent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Re-run Rate by Agent</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Total Runs</TableHead>
                  <TableHead className="text-right">Re-runs</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rerunRates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No data.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rerunRates.map((row) => (
                    <TableRow key={row.agent_id}>
                      <TableCell className="font-mono text-muted-foreground">{row.agent_number}</TableCell>
                      <TableCell className="font-medium">{row.agent_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.total_runs}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.rerun_count}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {row.total_runs > 0 ? `${(row.rerun_rate * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="py-5 text-center">
        <Icon className={cn("h-5 w-5 mx-auto mb-2 text-muted-foreground", color)} />
        <p className={cn("text-3xl font-bold text-foreground", color)}>{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
