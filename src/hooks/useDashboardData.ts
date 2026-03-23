import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, endOfDay, startOfWeek, format } from "date-fns";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface AgentFailureRow {
  agent_id: string;
  agent_name: string;
  agent_number: number;
  confidence_tier: string;
  total_runs: number;
  failed_runs: number;
  failure_rate: number;
}

export interface RerunRateRow {
  agent_id: string;
  agent_name: string;
  agent_number: number;
  total_runs: number;
  rerun_count: number;
  rerun_rate: number;
}

export interface OperatorRow {
  user_id: string;
  display_name: string;
  total_pages: number;
  passed_pages: number;
  first_pass_rate: number;
}

export interface WeeklyTrend {
  week: string;
  count: number;
}

export function useDashboardData(dateRange: DateRange) {
  const fromISO = startOfDay(dateRange.from).toISOString();
  const toISO = endOfDay(dateRange.to).toISOString();

  // Summary counts
  const pagesQuery = useQuery({
    queryKey: ["dashboard-pages", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("id, status, created_at, created_by")
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const agentRunsQuery = useQuery({
    queryKey: ["dashboard-agent-runs", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, agent_id, page_id, status, run_number, created_at, completed_at, started_at")
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const agentsQuery = useQuery({
    queryKey: ["dashboard-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, agent_number, confidence_tier, is_blocking")
        .order("agent_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const queueQuery = useQuery({
    queryKey: ["dashboard-queue", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_queue")
        .select("id, status, created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const baselineQuery = useQuery({
    queryKey: ["dashboard-baseline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "baseline_minutes_per_page")
        .maybeSingle();
      if (error) throw error;
      return data?.value ? parseInt(data.value, 10) : 60;
    },
  });

  const usersQuery = useQuery({
    queryKey: ["dashboard-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, display_name, email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const auditQuery = useQuery({
    queryKey: ["dashboard-audit-overrides", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action_type, created_at")
        .eq("action_type", "gate_override")
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading =
    pagesQuery.isLoading ||
    agentRunsQuery.isLoading ||
    agentsQuery.isLoading ||
    queueQuery.isLoading ||
    baselineQuery.isLoading ||
    usersQuery.isLoading ||
    auditQuery.isLoading;

  const pages = pagesQuery.data ?? [];
  const agentRuns = agentRunsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const queueItems = queueQuery.data ?? [];
  const baseline = baselineQuery.data ?? 60;
  const users = usersQuery.data ?? [];
  const overrides = auditQuery.data ?? [];

  // Summary cards
  const totalPages = pages.length;
  const passedPages = pages.filter((p) => p.status === "passed" || p.status === "passed_with_warnings").length;
  const failedPages = pages.filter((p) => p.status === "failed").length;
  const pendingPages = pages.filter((p) => p.status === "pending" || p.status === "in_progress").length;

  const completedPagesList = pages.filter((p) => ["passed", "failed", "passed_with_warnings"].includes(p.status));
  const completedPages = completedPagesList.length;

  // Estimated hours saved: ((baseline − avg_operator_attention_minutes) × completed_pages) / 60
  // operator_attention = turnaround − sum_of_agent_durations (clamped to 0)
  let estimatedHoursSaved = 0;
  if (completedPages > 0) {
    const operatorAttentionMinutes: number[] = [];
    for (const page of completedPagesList) {
      const pageRuns = agentRuns.filter((r) => r.page_id === page.id && r.completed_at);
      if (pageRuns.length === 0) continue;
      const lastCompleted = Math.max(...pageRuns.map((r) => new Date(r.completed_at!).getTime()));
      const turnaroundMs = lastCompleted - new Date(page.created_at).getTime();
      const totalAgentDurationMs = pageRuns.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0);
      const attentionMs = Math.max(0, turnaroundMs - totalAgentDurationMs);
      operatorAttentionMinutes.push(attentionMs / 60000);
    }
    const avgOperatorAttention = operatorAttentionMinutes.length > 0
      ? operatorAttentionMinutes.reduce((a, b) => a + b, 0) / operatorAttentionMinutes.length
      : 0;
    estimatedHoursSaved = Math.max(0, ((baseline - avgOperatorAttention) * completedPages) / 60);
  }

  const queueRemaining = queueItems.filter((q) => q.status === "queued").length;

  // Agent failure rates
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const agentFailureRates: AgentFailureRow[] = agents.map((agent) => {
    const runs = agentRuns.filter((r) => r.agent_id === agent.id);
    const failed = runs.filter((r) => r.status === "failed" || r.status === "error").length;
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_number: agent.agent_number,
      confidence_tier: agent.confidence_tier,
      total_runs: runs.length,
      failed_runs: failed,
      failure_rate: runs.length > 0 ? failed / runs.length : 0,
    };
  }).sort((a, b) => b.failure_rate - a.failure_rate);

  // Pipeline completion rate
  const activeAgentCount = agents.filter((a) => a.is_blocking !== false).length || agents.length;
  const pagesWithAllRuns = pages.filter((p) => {
    const pageRuns = agentRuns.filter((r) => r.page_id === p.id);
    const uniqueAgents = new Set(pageRuns.map((r) => r.agent_id));
    return uniqueAgents.size >= activeAgentCount;
  }).length;
  const pipelineCompletionRate = totalPages > 0 ? (pagesWithAllRuns / totalPages) * 100 : 0;

  // Operator breakdown
  const operatorBreakdown: OperatorRow[] = users
    .map((user) => {
      const userPages = pages.filter((p) => p.created_by === user.id);
      const passed = userPages.filter((p) => p.status === "passed" || p.status === "passed_with_warnings").length;
      return {
        user_id: user.id,
        display_name: user.display_name || user.email,
        total_pages: userPages.length,
        passed_pages: passed,
        first_pass_rate: userPages.length > 0 ? passed / userPages.length : 0,
      };
    })
    .filter((o) => o.total_pages > 0)
    .sort((a, b) => b.total_pages - a.total_pages);

  // Queue throughput
  const promotedItems = queueItems.filter((q) => q.status === "promoted").length;
  const totalQueueItems = queueItems.length;
  const queueThroughput = totalQueueItems > 0 ? (promotedItems / totalQueueItems) * 100 : 0;

  // Wall-clock turnaround (avg ms from page created_at to last completed agent_run)
  let avgTurnaroundMs = 0;
  const turnaroundValues: number[] = [];
  for (const page of pages) {
    const pageRuns = agentRuns.filter((r) => r.page_id === page.id && r.completed_at);
    if (pageRuns.length === 0) continue;
    const lastCompleted = Math.max(...pageRuns.map((r) => new Date(r.completed_at!).getTime()));
    const created = new Date(page.created_at).getTime();
    turnaroundValues.push(lastCompleted - created);
  }
  if (turnaroundValues.length > 0) {
    avgTurnaroundMs = turnaroundValues.reduce((a, b) => a + b, 0) / turnaroundValues.length;
  }

  // Gate override rate
  // Count gated transitions with failures (pages that had at least one failed blocking agent)
  const pagesWithFailedBlocking = pages.filter((p) => {
    const pageRuns = agentRuns.filter((r) => r.page_id === p.id);
    return pageRuns.some((r) => {
      const agent = agentMap.get(r.agent_id);
      return agent?.is_blocking && (r.status === "failed" || r.status === "error");
    });
  }).length;
  const gateOverrideRate = pagesWithFailedBlocking > 0 ? (overrides.length / pagesWithFailedBlocking) * 100 : 0;

  // Re-run rate by agent
  const rerunRates: RerunRateRow[] = agents.map((agent) => {
    const runs = agentRuns.filter((r) => r.agent_id === agent.id);
    const reruns = runs.filter((r) => r.run_number > 1).length;
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_number: agent.agent_number,
      total_runs: runs.length,
      rerun_count: reruns,
      rerun_rate: runs.length > 0 ? reruns / runs.length : 0,
    };
  }).sort((a, b) => b.rerun_rate - a.rerun_rate);

  // Weekly trend
  const weeklyTrend: WeeklyTrend[] = [];
  const weekMap = new Map<string, number>();
  for (const page of pages) {
    if (["passed", "failed", "passed_with_warnings"].includes(page.status)) {
      const weekStart = format(startOfWeek(new Date(page.created_at), { weekStartsOn: 1 }), "MMM d");
      weekMap.set(weekStart, (weekMap.get(weekStart) ?? 0) + 1);
    }
  }
  // Sort weeks chronologically
  const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => {
    // Re-parse for sorting
    return 0; // Already in order from iteration
  });
  for (const [week, count] of weekMap) {
    weeklyTrend.push({ week, count });
  }

  return {
    isLoading,
    totalPages,
    passedPages,
    failedPages,
    pendingPages,
    estimatedHoursSaved,
    queueRemaining,
    agentFailureRates,
    pipelineCompletionRate,
    operatorBreakdown,
    queueThroughput,
    avgTurnaroundMs,
    gateOverrideRate,
    rerunRates,
    weeklyTrend,
    overrideCount: overrides.length,
  };
}
