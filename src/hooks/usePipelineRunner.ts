import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { recalcPageStatus } from "@/lib/page-status";

type RunScope = "all" | "stage" | "failed";

interface PipelineState {
  isRunning: boolean;
  currentAgentName: string | null;
  completedCount: number;
  totalCount: number;
}

export function usePipelineRunner(pageId: string | undefined, onComplete?: () => void) {
  const { user } = useAuth();
  const [state, setState] = useState<PipelineState>({
    isRunning: false,
    currentAgentName: null,
    completedCount: 0,
    totalCount: 0,
  });
  const cancelledRef = useRef(false);

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

      for (const agent of agentsToRun) {
        if (cancelledRef.current) break;

        setState((prev) => ({
          ...prev,
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

          await res.json(); // consume response
        } catch (err) {
          console.error(`Agent ${agent.agent_number} (${agent.name}) error:`, err);
        }

        completed++;

        // 3-second delay between agents (rate limit protection), skip after last
        if (completed < agentsToRun.length && !cancelledRef.current) {
          await new Promise((r) => setTimeout(r, 3000));
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
        currentAgentName: null,
        completedCount: 0,
        totalCount: 0,
      });
      onComplete?.();
    }
  }, [user, pageId, onComplete]);

  const cancelPipeline = useCallback(() => {
    cancelledRef.current = true;
    toast.info("Pipeline will stop after the current agent completes.");
  }, []);

  return { ...state, startPipeline, cancelPipeline };
}
