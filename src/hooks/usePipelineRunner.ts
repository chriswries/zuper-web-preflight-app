import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { recalcPageStatus } from "@/lib/page-status";

type RunScope = "all" | "stage" | "failed";

interface PipelineState {
  isRunning: boolean;
  isPaused: boolean;
  pauseReason: string | null;
  currentAgentName: string | null;
  completedCount: number;
  totalCount: number;
}

export function usePipelineRunner(pageId: string | undefined, onComplete?: () => void) {
  const { user } = useAuth();
  const [state, setState] = useState<PipelineState>({
    isRunning: false,
    isPaused: false,
    pauseReason: null,
    currentAgentName: null,
    completedCount: 0,
    totalCount: 0,
  });
  const cancelledRef = useRef(false);
  const pauseResolverRef = useRef<(() => void) | null>(null);

  const resumePipeline = useCallback(() => {
    pauseResolverRef.current?.();
    pauseResolverRef.current = null;
  }, []);

  const cancelPipeline = useCallback(() => {
    cancelledRef.current = true;
    // If paused, unblock the loop so it can break on cancel check
    if (pauseResolverRef.current) {
      pauseResolverRef.current();
      pauseResolverRef.current = null;
    }
    toast.info("Pipeline will stop after the current agent completes.");
  }, []);

  const startPipeline = useCallback(async (scope: RunScope, stageNumber?: number) => {
    if (!user || !pageId) return;
    cancelledRef.current = false;

    try {
      // Concurrent prevention: check for running/queued agents
      const { data: activeRuns } = await supabase
        .from("agent_runs")
        .select("id")
        .eq("page_id", pageId)
        .in("status", ["running", "queued"])
        .limit(1);

      if (activeRuns && activeRuns.length > 0) {
        toast.error("QA is already running for this page.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      // Load page info (need mode for migration filtering)
      const { data: page } = await supabase
        .from("pages")
        .select("mode, old_url")
        .eq("id", pageId)
        .single();
      if (!page) {
        toast.error("Page not found");
        return;
      }

      // Load active agents
      const { data: agents } = await supabase
        .from("agents")
        .select("id, agent_number, name, stage_number, sort_order, is_active, migration_only")
        .eq("is_active", true)
        .order("stage_number")
        .order("sort_order");

      if (!agents || agents.length === 0) {
        toast.error("No active agents found");
        return;
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
      let agentsToRun = agents.filter((a) => {
        if (a.migration_only && page.mode === "ongoing") return false;
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
        toast.error("No agents to run for this scope");
        return;
      }

      // Start
      setState({
        isRunning: true,
        isPaused: false,
        pauseReason: null,
        currentAgentName: agentsToRun[0].name,
        completedCount: 0,
        totalCount: agentsToRun.length,
      });

      // Set page to in_progress
      await supabase
        .from("pages")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", pageId);

      let completed = 0;

      for (let i = 0; i < agentsToRun.length; i++) {
        if (cancelledRef.current) break;

        const agent = agentsToRun[i];
        let shouldPause = false;
        let detectedPauseReason = "";
        let lastResult: Record<string, unknown> = {};

        setState((prev) => ({
          ...prev,
          isPaused: false,
          pauseReason: null,
          currentAgentName: agent.name,
          completedCount: completed,
        }));

        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
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

            console.error(
              `Agent ${agent.agent_number} (${agent.name}) failed:`,
              errorMessage
            );

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

        if (shouldPause) {
          // Pause: show dialog and wait for user to resume or cancel
          setState((prev) => ({
            ...prev,
            isPaused: true,
            pauseReason: detectedPauseReason,
          }));

          // Block the loop until user clicks Resume or Stop
          await new Promise<void>((resolve) => {
            pauseResolverRef.current = resolve;
          });

          // After resume, clear pause state
          setState((prev) => ({
            ...prev,
            isPaused: false,
            pauseReason: null,
          }));

          // If cancelled while paused, break
          if (cancelledRef.current) break;

          // Retry the same agent (decrement i so the loop re-runs this index)
          i--;
          continue;
        }

        completed++;

        // Adaptive delay based on Anthropic rate limit remaining
        if (completed < agentsToRun.length && !cancelledRef.current) {
          const rateLimitRemaining = lastResult?.rate_limit_remaining;
          let delayMs: number;
          if (rateLimitRemaining !== undefined && rateLimitRemaining !== null) {
            if (rateLimitRemaining > 20) delayMs = 5000;
            else if (rateLimitRemaining >= 10) delayMs = 10000;
            else if (rateLimitRemaining >= 1) delayMs = 15000;
            else delayMs = 20000;
          } else {
            delayMs = 20000; // assume near limit if unknown
          }
          console.log("Next agent delay:", delayMs, "remaining:", rateLimitRemaining);

          if (delayMs > 10000) {
            setState((prev) => ({
              ...prev,
              currentAgentName: `Waiting for rate limit cooldown... (${completed}/${agentsToRun.length} completed)`,
            }));
          }

          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      // Recalculate page status
      const newStatus = await recalcPageStatus(pageId) as "pending" | "in_progress" | "passed" | "failed" | "passed_with_warnings" | "archived";
      await supabase
        .from("pages")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", pageId);

      const label = cancelledRef.current ? "Pipeline cancelled" : "Pipeline complete";
      toast.success(`${label}: ${completed}/${agentsToRun.length} agents processed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setState({
        isRunning: false,
        isPaused: false,
        pauseReason: null,
        currentAgentName: null,
        completedCount: 0,
        totalCount: 0,
      });
      onComplete?.();
    }
  }, [user, pageId, onComplete]);

  return { ...state, startPipeline, cancelPipeline, resumePipeline };
}
