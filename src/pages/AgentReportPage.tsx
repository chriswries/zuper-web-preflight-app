import { ArrowLeft, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { AgentReportContent, type AgentRunRow } from "@/components/pipeline/AgentReportContent";

export default function AgentReportPage() {
  const navigate = useNavigate();
  const { id: pageId, agentId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const { data: agent } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_number, name, confidence_tier, stage_number, is_blocking")
        .eq("id", agentId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!agentId,
  });

  const { data: page } = useQuery({
    queryKey: ["page", pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("id, new_url, slug")
        .eq("id", pageId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!pageId,
  });

  const { data: runs, isLoading } = useQuery({
    queryKey: ["agent-runs-detail", pageId, agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("page_id", pageId!)
        .eq("agent_id", agentId!)
        .order("run_number", { ascending: false });
      if (error) throw error;
      return data as unknown as AgentRunRow[];
    },
    enabled: !!pageId && !!agentId,
  });

  const selectedRun = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    if (selectedRunId) return runs.find((r) => r.id === selectedRunId) ?? runs[0];
    return runs[0];
  }, [runs, selectedRunId]);

  const rerunAgent = useCallback(async () => {
    if (!user || !pageId || !agentId) return;
    setRerunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            page_id: pageId,
            agent_id: agentId,
            recalculate_page_status: true,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Re-run failed");
      } else {
        toast.success(`Agent completed: ${result.status}`);
        setSelectedRunId(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRerunning(false);
      queryClient.invalidateQueries({ queryKey: ["agent-runs-detail", pageId, agentId] });
      queryClient.invalidateQueries({ queryKey: ["page", pageId] });
    }
  }, [user, pageId, agentId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/pages" className="hover:text-foreground transition-colors">Pages</Link>
        <span>/</span>
        <Link to={`/pages/${pageId}`} className="hover:text-foreground transition-colors">
          {page?.slug || "Page"}
        </Link>
        <span>/</span>
        <span className="text-foreground">{agent?.name || "Agent"}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/pages/${pageId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">#{agent?.agent_number}</span>
            <h1 className="text-2xl font-semibold text-foreground">{agent?.name || "Agent Report"}</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            {selectedRun?.completed_at && (
              <span>{format(new Date(selectedRun.completed_at), "MMM d, yyyy 'at' h:mm a")}</span>
            )}
            {selectedRun?.duration_ms && (
              <span>{(selectedRun.duration_ms / 1000).toFixed(1)}s</span>
            )}
            {selectedRun?.model_used && (
              <Badge variant="secondary" className="text-[10px] h-4">{selectedRun.model_used}</Badge>
            )}
            {selectedRun && (
              <Badge variant="secondary" className="text-[10px] h-4">Run #{selectedRun.run_number}</Badge>
            )}
          </div>
        </div>
        {selectedRun && <StatusBadge status={selectedRun.status as any} />}
        <Button
          size="sm"
          variant="outline"
          onClick={rerunAgent}
          disabled={rerunning}
        >
          {rerunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
          Re-Run
        </Button>
      </div>

      {/* Report content via shared component */}
      {selectedRun && (
        <AgentReportContent
          run={selectedRun}
          agentNumber={agent?.agent_number ?? 0}
          confidenceTier={agent?.confidence_tier}
          allRuns={runs}
        />
      )}

      {!selectedRun && (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No report data yet. Run this agent to see results.</p>
        </div>
      )}
    </div>
  );
}
