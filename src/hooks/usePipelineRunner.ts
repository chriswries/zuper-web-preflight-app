import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { runPipelineForPage } from "@/lib/pipeline-runner";

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      setState({
        isRunning: true,
        isPaused: false,
        pauseReason: null,
        currentAgentName: "Initializing...",
        completedCount: 0,
        totalCount: 0,
      });

      const result = await runPipelineForPage(pageId, {
        scope,
        stageNumber,
        accessToken: session.access_token,
        isCancelled: () => cancelledRef.current,
        onProgress: (progress) => {
          setState((prev) => ({
            ...prev,
            currentAgentName: progress.currentAgentName,
            completedCount: progress.completedCount,
            totalCount: progress.totalCount,
          }));
        },
        onPause: (reason) => {
          setState((prev) => ({
            ...prev,
            isPaused: true,
            pauseReason: reason,
          }));
          return new Promise<void>((resolve) => {
            pauseResolverRef.current = () => {
              setState((prev) => ({
                ...prev,
                isPaused: false,
                pauseReason: null,
              }));
              resolve();
            };
          });
        },
      });

      const label = result.cancelled ? "Pipeline cancelled" : "Pipeline complete";
      toast.success(`${label}: ${result.completed}/${result.total} agents processed`);
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
