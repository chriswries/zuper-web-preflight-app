import { FileText, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { useState } from "react";
import { format } from "date-fns";
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
  const { isAdmin } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: pages, isLoading } = useQuery({
    queryKey: ["pages", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("pages")
        .select("*, users!pages_created_by_fkey(display_name)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PageRow[];
    },
  });

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
