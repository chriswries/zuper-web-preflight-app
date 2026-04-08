import { supabase } from "@/integrations/supabase/client";
import { recalcPageStatus } from "@/lib/page-status";

export interface PipelineProgress {
  currentAgentName: string | null;
  completedCount: number;
  totalCount: number;
}

export interface PipelineRunOptions {
  scope: "all" | "stage" | "failed";
  stageNumber?: number;
  accessToken: string;
  /** Called each time progress changes */
  onProgress?: (progress: PipelineProgress) => void;
  /** Return true to abort before the next agent */
  isCancelled?: () => boolean;
  /**
   * Called when a billing/quota error occurs.
   * Return a promise that resolves when the user clicks Resume.
   * If the user cancels during pause, resolve and set cancelled flag.
   */
  onPause?: (reason: string) => Promise<void>;
}

interface AgentRow {
  id: string;
  agent_number: number;
  name: string;
  stage_number: number;
  sort_order: number;
  is_active: boolean;
  migration_only: boolean;
  skip_in_blog_mode: boolean;
}

/**
 * Run the QA pipeline for a single page.
 * This is the shared core used by both usePipelineRunner (single page)
 * and useBatchProcessor (batch queue processing).
 *
 * Returns the number of agents that completed.
 */
export async function runPipelineForPage(
  pageId: string,
  options: PipelineRunOptions
): Promise<{ completed: number; total: number; cancelled: boolean }> {
  const { scope, stageNumber, accessToken, onProgress, isCancelled, onPause } = options;

  // Concurrent prevention
  const { data: activeRuns } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("page_id", pageId)
    .in("status", ["running", "queued"])
    .limit(1);

  if (activeRuns && activeRuns.length > 0) {
    throw new Error("QA is already running for this page.");
  }

  // Load page info
  const { data: page } = await supabase
    .from("pages")
    .select("mode, old_url, pipeline_profile")
    .eq("id", pageId)
    .single();

  if (!page) throw new Error("Page not found");
  const pipelineProfile = (page as any).pipeline_profile ?? "full";

  // Load active agents
  const { data: agents } = await supabase
    .from("agents")
    .select("id, agent_number, name, stage_number, sort_order, is_active, migration_only, skip_in_blog_mode")
    .eq("is_active", true)
    .order("stage_number")
    .order("sort_order");

  if (!agents || agents.length === 0) {
    throw new Error("No active agents found");
  }

  // Load existing runs (latest per agent)
  const { data: existingRuns } = await supabase
    .from("agent_runs")
    .select("id, agent_id, status, run_number")
    .eq("page_id", pageId)
    .order("run_number", { ascending: false });

  const runsByAgentId = new Map<string, { id: string; status: string; run_number: number }>();
  existingRuns?.forEach((r) => {
    if (!runsByAgentId.has(r.agent_id)) {
      runsByAgentId.set(r.agent_id, r);
    }
  });

  // Filter agents based on scope
  let agentsToRun = (agents as AgentRow[]).filter((a) => {
    if (a.migration_only && page.mode === "ongoing") return false;
    if (pipelineProfile === "blog" && a.skip_in_blog_mode) return false;
    return true;
  });

  if (scope === "stage" && stageNumber) {
    agentsToRun = agentsToRun.filter((a) => a.stage_number === stageNumber);
  } else if (scope === "failed") {
    agentsToRun = agentsToRun.filter((a) => {
      const run = runsByAgentId.get(a.id);
      return run && (run.status === "failed" || run.status === "error");
    });
  } else {
    // "all" — skip agents already marked as skipped
    agentsToRun = agentsToRun.filter((a) => {
      const run = runsByAgentId.get(a.id);
      return !run || run.status !== "skipped";
    });
  }

  if (agentsToRun.length === 0) {
    throw new Error("No agents to run for this scope");
  }

  // Set page to in_progress
  await supabase
    .from("pages")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", pageId);

  onProgress?.({
    currentAgentName: agentsToRun[0].name,
    completedCount: 0,
    totalCount: agentsToRun.length,
  });

  let completed = 0;

  for (let i = 0; i < agentsToRun.length; i++) {
    if (isCancelled?.()) break;

    const agent = agentsToRun[i];
    let shouldPause = false;
    let detectedPauseReason = "";
    let lastResult: Record<string, unknown> = {};

    onProgress?.({
      currentAgentName: agent.name,
      completedCount: completed,
      totalCount: agentsToRun.length,
    });

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ page_id: pageId, agent_id: agent.id }),
        }
      );

      const result = await res.json().catch(() => ({} as Record<string, unknown>));
      lastResult = result;

      if (!res.ok) {
        const errorMessage =
          typeof result.error === "string"
            ? result.error
            : `Agent ${agent.agent_number} failed`;

        const isLowCredits =
          res.status === 402 ||
          result.error_code === "anthropic_low_credits" ||
          /credit balance is too low|credits are too low/i.test(errorMessage);

        const isBrowserlessQuota =
          res.status === 429 ||
          result.error_code === "browserless_quota_exceeded" ||
          /quota exceeded/i.test(errorMessage);

        console.error(`Agent ${agent.agent_number} (${agent.name}) failed:`, errorMessage);

        if (isLowCredits) {
          shouldPause = true;
          detectedPauseReason =
            "Anthropic API credits are depleted. Please top up your billing at console.anthropic.com, then click Resume to continue.";
        } else if (isBrowserlessQuota) {
          shouldPause = true;
          detectedPauseReason =
            "Browserless quota exceeded. Please check your Browserless.io billing, then click Resume to continue.";
        }
      }
    } catch (err) {
      console.error(`Agent ${agent.agent_number} (${agent.name}) error:`, err);
    }

    if (shouldPause && onPause) {
      await onPause(detectedPauseReason);

      // If cancelled while paused, break
      if (isCancelled?.()) break;

      // Retry the same agent
      i--;
      continue;
    }

    completed++;

    // Adaptive delay based on Anthropic rate limit remaining
    if (completed < agentsToRun.length && !isCancelled?.()) {
      const rateLimitRemaining =
        typeof lastResult?.rate_limit_remaining === "number"
          ? (lastResult.rate_limit_remaining as number)
          : undefined;
      let delayMs: number;
      if (rateLimitRemaining !== undefined && rateLimitRemaining !== null) {
        if (rateLimitRemaining > 20) delayMs = 5000;
        else if (rateLimitRemaining >= 10) delayMs = 10000;
        else if (rateLimitRemaining >= 1) delayMs = 15000;
        else delayMs = 20000;
      } else {
        delayMs = 20000;
      }
      console.log("Next agent delay:", delayMs, "remaining:", rateLimitRemaining);

      if (delayMs > 10000) {
        onProgress?.({
          currentAgentName: `Waiting for rate limit cooldown... (${completed}/${agentsToRun.length} completed)`,
          completedCount: completed,
          totalCount: agentsToRun.length,
        });
      }

      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Recalculate page status
  const newStatus = (await recalcPageStatus(pageId)) as
    | "pending"
    | "in_progress"
    | "passed"
    | "failed"
    | "passed_with_warnings"
    | "archived";
  await supabase
    .from("pages")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", pageId);

  return { completed, total: agentsToRun.length, cancelled: !!isCancelled?.() };
}
