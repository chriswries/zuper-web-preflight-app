import { useState } from "react";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ReRunFailedButtonProps {
  pageId: string;
  pageSlug: string | null;
  pageStatus: string;
}

export function ReRunFailedButton({ pageId, pageSlug, pageStatus }: ReRunFailedButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const queryClient = useQueryClient();

  const showButton = pageStatus === "failed" || pageStatus === "passed_with_warnings";
  if (!showButton) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Fetch latest run per agent, count failed/error
    const { data: runs } = await supabase
      .from("agent_runs")
      .select("agent_id, status, run_number")
      .eq("page_id", pageId)
      .order("run_number", { ascending: false });

    if (!runs) {
      toast.error("Could not fetch agent runs");
      return;
    }

    const latestByAgent = new Map<string, string>();
    for (const r of runs) {
      if (!latestByAgent.has(r.agent_id)) {
        latestByAgent.set(r.agent_id, r.status);
      }
    }

    const count = Array.from(latestByAgent.values()).filter(
      (s) => s === "failed" || s === "error"
    ).length;

    if (count === 0) {
      toast.info("No failed agents to re-run");
      return;
    }

    setFailedCount(count);
    setConfirmOpen(true);
  };

  const confirmReRun = async () => {
    setConfirmOpen(false);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-pipeline`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ page_id: pageId, scope: "failed" }),
        }
      );

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.error || "Failed to start pipeline");
      }

      toast.success(
        `Pipeline started — ${result.total_agents ?? failedCount} agent(s) re-running`
      );
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={handleClick}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Re-run failed agents</TooltipContent>
      </Tooltip>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-run failed agents?</AlertDialogTitle>
            <AlertDialogDescription>
              Re-run {failedCount} failed agent{failedCount !== 1 ? "s" : ""} on{" "}
              {pageSlug ? `/${pageSlug}` : "this page"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReRun}>
              Re-run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
