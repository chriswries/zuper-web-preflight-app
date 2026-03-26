import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

export interface FindingFlag {
  id: string;
  agent_run_id: string;
  check_name: string;
  check_severity: string;
  check_finding: string | null;
  agent_name: string;
  agent_number: number;
  page_url: string;
  page_slug: string | null;
  flagged_by: string;
  reason: string;
  admin_status: string;
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function useFindingFlagsForRun(agentRunId: string | undefined) {
  return useQuery({
    queryKey: ["finding-flags", agentRunId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finding_flags")
        .select("*")
        .eq("agent_run_id", agentRunId!);
      if (error) throw error;
      return data as unknown as FindingFlag[];
    },
    enabled: !!agentRunId,
  });
}

export function usePendingFlagCount() {
  const { data } = useQuery({
    queryKey: ["finding-flags-pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("finding_flags")
        .select("*", { count: "exact", head: true })
        .eq("admin_status", "pending");
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
  return data ?? 0;
}

export function useCreateFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (flag: {
      agent_run_id: string;
      check_name: string;
      check_severity: string;
      check_finding?: string;
      agent_name: string;
      agent_number: number;
      page_url: string;
      page_slug?: string;
      flagged_by: string;
      reason: string;
    }) => {
      const { data, error } = await supabase
        .from("finding_flags")
        .insert([flag as any])
        .select()
        .single();
      if (error) throw error;

      await logAudit({
        action_type: "finding_flagged",
        entity_type: "finding_flag",
        entity_id: (data as any).id,
        after_state: { check_name: flag.check_name, agent_name: flag.agent_name, reason: flag.reason },
      });

      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["finding-flags", vars.agent_run_id] });
      queryClient.invalidateQueries({ queryKey: ["finding-flags-pending-count"] });
      toast.success("Flagged as potential false positive.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to flag finding.");
    },
  });
}

export function useDeleteFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (flag: FindingFlag) => {
      const { error } = await supabase
        .from("finding_flags")
        .delete()
        .eq("id", flag.id);
      if (error) throw error;

      await logAudit({
        action_type: "finding_unflagged",
        entity_type: "finding_flag",
        entity_id: flag.id,
        before_state: { check_name: flag.check_name, agent_name: flag.agent_name, reason: flag.reason },
      });
    },
    onSuccess: (_, flag) => {
      queryClient.invalidateQueries({ queryKey: ["finding-flags", flag.agent_run_id] });
      queryClient.invalidateQueries({ queryKey: ["finding-flags-pending-count"] });
      toast.success("Flag removed.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove flag.");
    },
  });
}

export function useUpdateFlagStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      flagId,
      admin_status,
      admin_notes,
      resolved_by,
      previousStatus,
    }: {
      flagId: string;
      admin_status: string;
      admin_notes?: string;
      resolved_by: string;
      previousStatus: string;
    }) => {
      const { error } = await supabase
        .from("finding_flags")
        .update({
          admin_status,
          admin_notes: admin_notes || null,
          resolved_by,
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", flagId);
      if (error) throw error;

      await logAudit({
        action_type: "finding_flag_resolved",
        entity_type: "finding_flag",
        entity_id: flagId,
        before_state: { admin_status: previousStatus },
        after_state: { admin_status, admin_notes },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finding-flags"] });
      queryClient.invalidateQueries({ queryKey: ["finding-flags-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["all-finding-flags"] });
      toast.success("Flag status updated.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update flag.");
    },
  });
}
