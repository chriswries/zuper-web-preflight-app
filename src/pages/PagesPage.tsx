import { FileText, Plus, Filter, Trash2, Loader2, Search, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ReRunFailedButton } from "@/components/pages/ReRunFailedButton";
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

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

export default function PagesPage() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 200);
  const [deleteTarget, setDeleteTarget] = useState<PageRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hasRunningPipeline, setHasRunningPipeline] = useState(false);

  const { data: pages, isLoading } = useQuery({
    queryKey: ["pages", statusFilter, ownerFilter],
    queryFn: async () => {
      let query = supabase
        .from("pages")
        .select("*, users!pages_created_by_fkey(display_name)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "in_progress" | "passed" | "failed" | "passed_with_warnings" | "archived");
      }

      if (ownerFilter === "mine" && user) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PageRow[];
    },
  });

  // Fetch pipeline durations in a single batch query
  const { data: durations } = useQuery({
    queryKey: ["page-durations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("page_id, started_at, completed_at")
        .not("started_at", "is", null)
        .not("completed_at", "is", null);
      if (error) throw error;

      const map: Record<string, number> = {};
      const grouped: Record<string, { minStart: number; maxEnd: number }> = {};
      for (const run of data) {
        const start = new Date(run.started_at!).getTime();
        const end = new Date(run.completed_at!).getTime();
        const existing = grouped[run.page_id];
        if (!existing) {
          grouped[run.page_id] = { minStart: start, maxEnd: end };
        } else {
          if (start < existing.minStart) existing.minStart = start;
          if (end > existing.maxEnd) existing.maxEnd = end;
        }
      }
      for (const [pageId, { minStart, maxEnd }] of Object.entries(grouped)) {
        map[pageId] = Math.max(0, maxEnd - minStart);
      }
      return map;
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
        action_type: "page_deleted",
        entity_type: "page",
        entity_id: deleteTarget.id,
        before_state: {
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

  // Client-side search + profile filter
  const filteredPages = (pages ?? []).filter((page) => {
    // Profile filter
    if (profileFilter !== "all" && (page as any).pipeline_profile !== profileFilter) return false;
    // Search filter
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      page.new_url?.toLowerCase().includes(q) ||
      page.old_url?.toLowerCase().includes(q) ||
      page.slug?.toLowerCase().includes(q) ||
      page.target_keyword?.toLowerCase().includes(q)
    );
  });

  const hasPages = filteredPages.length > 0;
  const totalPages = pages?.length ?? 0;
  const isSearchActive = debouncedSearch.length > 0;

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Pages</h1>
        <Button onClick={() => navigate("/pages/new")}>
          <Plus className="h-4 w-4 mr-1" />
          Add Page
        </Button>
      </div>

      {/* Filters */}
      {(totalPages > 0 || statusFilter !== "all" || ownerFilter !== "all" || isSearchActive) && (
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search URL, slug, keyword…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 pr-8 w-[240px] h-9"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
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
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Profiles</SelectItem>
              <SelectItem value="full">Full</SelectItem>
              <SelectItem value="blog">Blog</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-md border border-border overflow-hidden text-sm">
            <button
              className={`px-3 py-1.5 transition-colors ${ownerFilter === "all" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              onClick={() => setOwnerFilter("all")}
            >
              All Pages
            </button>
            <button
              className={`px-3 py-1.5 transition-colors ${ownerFilter === "mine" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              onClick={() => setOwnerFilter("mine")}
            >
              My Pages
            </button>
          </div>
          {isSearchActive && (
            <span className="text-sm text-muted-foreground">
              {filteredPages.length} of {totalPages} pages
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && totalPages === 0 && !isSearchActive && (
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

      {/* No results for search */}
      {!isLoading && !hasPages && isSearchActive && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No pages match your search.</p>
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
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Time</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Created</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Owner</th>
                <th className="text-right font-medium text-muted-foreground px-4 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPages.map((page) => (
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
                    <div className="flex items-center gap-1">
                      <Badge variant={page.mode === "migration" ? "default" : "secondary"} className="text-xs">
                        {page.mode === "migration" ? "Migration" : "Ongoing"}
                      </Badge>
                      {(page as any).pipeline_profile === "blog" && (
                        <Badge className="text-xs bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/20 hover:bg-[hsl(var(--primary))]/15" variant="outline">
                          Blog
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={page.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {page.status === "in_progress" ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="text-xs">Running</span>
                      </span>
                    ) : durations?.[page.id] != null ? (
                      formatDuration(durations[page.id])
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(page.created_at), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {page.users?.display_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <ReRunFailedButton
                        pageId={page.id}
                        pageSlug={page.slug}
                        pageStatus={page.status}
                      />
                      {(isAdmin || page.created_by === user?.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteClick(e, page)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
    </TooltipProvider>
  );
}
