import { FileText, Plus, Filter, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import type { Tables } from "@/integrations/supabase/types";

type PageRow = Tables<"pages"> & { users: { display_name: string | null } | null };

const PAGE_STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "passed_with_warnings", label: "Warnings" },
  { value: "archived", label: "Archived" },
] as const;

export default function PagesPage() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<PageRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hasRunningPipeline, setHasRunningPipeline] = useState(false);

  const { data: pages, isLoading } = useQuery({
    queryKey: ["pages", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("pages")
        .select("*, users!pages_created_by_fkey(display_name)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "in_progress" | "passed" | "failed" | "passed_with_warnings" | "archived");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PageRow[];
    },
  });

  const handleDeleteClick = async (e: React.MouseEvent, page: PageRow) => {
    e.stopPropagation();

    // Check for running pipeline
    const { data: activeRuns } = await supabase
      .from("agent_runs")
      .select("id")
      .eq("page_id", page.id)
      .in("status", ["queued", "running"])
      .limit(1);

    setHasRunningPipeline((activeRuns?.length ?? 0) > 0);
    setDeleteTarget(page);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !user) return;
    setDeleting(true);

    try {
      // 1. Delete all agent_runs for this page
      const { error: runsErr } = await supabase
        .from("agent_runs")
        .delete()
        .eq("page_id", deleteTarget.id);
      if (runsErr) throw runsErr;

      // 2. Nullify promoted_page_id on queue items
      const { error: queueErr } = await supabase
        .from("page_queue")
        .update({ promoted_page_id: null })
        .eq("promoted_page_id", deleteTarget.id);
      if (queueErr) throw queueErr;

      // 3. Delete the page
      const { error: pageErr } = await supabase
        .from("pages")
        .delete()
        .eq("id", deleteTarget.id);
      if (pageErr) throw pageErr;

      // 4. Audit log
      await logAudit({
        userId: user.id,
        actionType: "page_deleted",
        entityType: "page",
        entityId: deleteTarget.id,
        beforeState: {
          slug: deleteTarget.slug,
          new_url: deleteTarget.new_url,
          status: deleteTarget.status,
        },
      });

      toast.success("Page deleted");
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete page");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const hasPages = pages && pages.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Pages</h1>
        <Button onClick={() => navigate("/pages/new")}>
          <Plus className="h-4 w-4 mr-1" />
          Add Page
        </Button>
      </div>

      {/* Filters */}
      {(hasPages || statusFilter !== "all") && (
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasPages && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">No pages yet</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            Add your first page to start running QA checks against it.
          </p>
          <Button variant="outline" onClick={() => navigate("/pages/new")}>
            <Plus className="h-4 w-4 mr-1" />
            Add your first page
          </Button>
        </div>
      )}

      {/* Page list */}
      {!isLoading && hasPages && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Slug</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">URL</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Mode</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Created</th>
                {isAdmin && (
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Operator</th>
                )}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {pages!.map((page) => (
                <tr
                  key={page.id}
                  className="border-b last:border-b-0 hover:bg-accent/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/pages/${page.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {page.slug || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[300px]">
                    {page.new_url}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={page.mode === "migration" ? "default" : "secondary"} className="text-xs">
                      {page.mode === "migration" ? "Migration" : "Ongoing"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={page.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(page.created_at), "MMM d, yyyy")}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {page.users?.display_name || "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteClick(e, page)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.slug || "page"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will permanently delete this page and all its agent run data. This cannot be undone.
                </p>
                {hasRunningPipeline && (
                  <p className="text-destructive font-medium">
                    A pipeline is currently running on this page. Deleting it will abort the run.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
