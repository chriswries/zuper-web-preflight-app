import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createPageWithRuns } from "@/lib/page-helpers";
import { runPipelineForPage } from "@/lib/pipeline-runner";
import type { Tables } from "@/integrations/supabase/types";

type QueueItem = Tables<"page_queue">;

export interface BatchProgress {
  isRunning: boolean;
  currentPageIndex: number;
  totalPages: number;
  currentPageUrl: string | null;
  currentAgentName: string | null;
  agentCompleted: number;
  agentTotal: number;
  pagesCompleted: number;
  startedAt: number | null;
}

const INITIAL_STATE: BatchProgress = {
  isRunning: false,
  currentPageIndex: 0,
  totalPages: 0,
  currentPageUrl: null,
  currentAgentName: null,
  agentCompleted: 0,
  agentTotal: 0,
  pagesCompleted: 0,
  startedAt: null,
};

export function useBatchProcessor(onItemProcessed?: () => void) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<BatchProgress>(INITIAL_STATE);
  const cancelledRef = useRef(false);

  const stopBatch = useCallback(() => {
    cancelledRef.current = true;
    toast.info("Batch will stop after the current page completes.");
  }, []);

  const startBatch = useCallback(
    async (queuedItems: QueueItem[], batchSize: number) => {
      if (!user) return;
      cancelledRef.current = false;

      const itemsToProcess = queuedItems.slice(0, batchSize);
      if (itemsToProcess.length === 0) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      setProgress({
        isRunning: true,
        currentPageIndex: 0,
        totalPages: itemsToProcess.length,
        currentPageUrl: null,
        currentAgentName: null,
        agentCompleted: 0,
        agentTotal: 0,
        pagesCompleted: 0,
        startedAt: Date.now(),
      });

      let pagesCompleted = 0;

      for (let i = 0; i < itemsToProcess.length; i++) {
        if (cancelledRef.current) break;

        const item = itemsToProcess[i];
        setProgress((prev) => ({
          ...prev,
          currentPageIndex: i,
          currentPageUrl: item.new_url,
          currentAgentName: "Promoting page...",
          agentCompleted: 0,
          agentTotal: 0,
        }));

        try {
          // 1. Create page from queue item
          const pageId = await createPageWithRuns({
            newUrl: item.new_url,
            oldUrl: item.old_url,
            slug: item.slug,
            targetKeyword: item.target_keyword,
            createdBy: user.id,
            pipelineProfile: (item as any).pipeline_profile ?? "full",
          });

          // 2. Update queue item to promoted
          await supabase
            .from("page_queue")
            .update({
              claimed_by: user.id,
              status: "promoted" as const,
              promoted_page_id: pageId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          onItemProcessed?.();

          // 3. Run pipeline
          // Refresh session in case it expired during long batch
          const { data: { session: freshSession } } = await supabase.auth.getSession();
          const token = freshSession?.access_token ?? session.access_token;

          await runPipelineForPage(pageId, {
            scope: "all",
            accessToken: token,
            isCancelled: () => cancelledRef.current,
            onProgress: (agentProgress) => {
              setProgress((prev) => ({
                ...prev,
                currentAgentName: agentProgress.currentAgentName,
                agentCompleted: agentProgress.completedCount,
                agentTotal: agentProgress.totalCount,
              }));
            },
            // No onPause in batch mode — skip billing pauses, continue to next page
          });

          pagesCompleted++;
        } catch (err) {
          console.error(`Batch: failed to process ${item.new_url}:`, err);
          toast.error(`Failed: ${item.new_url} — ${err instanceof Error ? err.message : "Unknown error"}`);
          pagesCompleted++; // Count as processed even on error
        }

        setProgress((prev) => ({
          ...prev,
          pagesCompleted: pagesCompleted,
        }));
      }

      const wasCancelled = cancelledRef.current;
      toast.success(
        wasCancelled
          ? `Batch stopped. Processed ${pagesCompleted} of ${itemsToProcess.length} pages.`
          : `Batch complete! Processed ${pagesCompleted} of ${itemsToProcess.length} pages.`
      );

      setProgress(INITIAL_STATE);
    },
    [user, onItemProcessed]
  );

  return { progress, startBatch, stopBatch };
}
