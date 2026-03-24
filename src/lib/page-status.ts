import { supabase } from "@/integrations/supabase/client";

/**
 * Recalculate page status from the LATEST run per agent.
 * Uses highest run_number per agent_id to avoid stale history affecting status.
 * Returns the computed status string.
 */
export async function recalcPageStatus(pageId: string): Promise<string> {
  const { data: allRuns } = await supabase
    .from("agent_runs")
    .select("agent_id, run_number, status, agents!agent_runs_agent_id_fkey(is_blocking)")
    .eq("page_id", pageId)
    .order("run_number", { ascending: false });

  if (!allRuns || allRuns.length === 0) return "pending";

  const latestByAgent = new Map<string, { status: string; is_blocking: boolean }>();
  for (const r of allRuns) {
    if (!latestByAgent.has(r.agent_id)) {
      latestByAgent.set(r.agent_id, {
        status: r.status,
        is_blocking: (r.agents as unknown as { is_blocking: boolean })?.is_blocking ?? false,
      });
    }
  }

  const runs = Array.from(latestByAgent.values());
  const active = runs.filter((r) => r.status !== "skipped");

  if (active.length === 0) return "pending";
  if (active.some((r) => r.status === "running" || r.status === "queued")) return "in_progress";
  if (active.some((r) => r.is_blocking && (r.status === "failed" || r.status === "error"))) return "failed";
  if (active.some((r) => r.status === "warning")) return "passed_with_warnings";
  return "passed";
}
