import { useState } from "react";
import { Flag, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateFlagStatus, type FindingFlag } from "@/hooks/useFindingFlags";
import { format } from "date-fns";
import { Link } from "react-router-dom";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "ignored", label: "Ignored" },
  { value: "fixed", label: "Fixed" },
  { value: "prompt_updated", label: "Prompt Updated" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-zuper-red text-white",
  major: "bg-zuper-red/80 text-white",
  minor: "bg-zuper-amber text-white",
  info: "bg-muted text-muted-foreground",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-zuper-amber/15 text-zuper-amber border-zuper-amber/30",
  ignored: "bg-muted text-muted-foreground",
  fixed: "bg-zuper-green/15 text-zuper-green border-zuper-green/30",
  prompt_updated: "bg-primary/10 text-primary border-primary/30",
};

export default function FalsePositivesPage() {
  const { user } = useAuth();
  const updateStatus = useUpdateFlagStatus();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [agentFilter, setAgentFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editStatus, setEditStatus] = useState<Record<string, string>>({});

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ["all-finding-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finding_flags")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as FindingFlag[];
    },
  });

  // Get user display names
  const userIds = [...new Set(flags.map((f) => f.flagged_by))];
  const { data: users = [] } = useQuery({
    queryKey: ["flag-users", userIds.join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("users")
        .select("id, display_name")
        .in("id", userIds);
      if (error) return [];
      return data;
    },
    enabled: userIds.length > 0,
  });

  const userMap = new Map(users.map((u) => [u.id, u.display_name || "Unknown"]));

  const counts = {
    pending: flags.filter((f) => f.admin_status === "pending").length,
    ignored: flags.filter((f) => f.admin_status === "ignored").length,
    fixed: flags.filter((f) => f.admin_status === "fixed").length,
    prompt_updated: flags.filter((f) => f.admin_status === "prompt_updated").length,
  };

  const agentNumbers = [...new Set(flags.map((f) => f.agent_number))].sort((a, b) => a - b);

  const filtered = flags.filter((f) => {
    if (statusFilter !== "all" && f.admin_status !== statusFilter) return false;
    if (agentFilter !== "all" && String(f.agent_number) !== agentFilter) return false;
    if (severityFilter !== "all" && f.check_severity !== severityFilter) return false;
    return true;
  });

  const handleSave = (flag: FindingFlag) => {
    if (!user) return;
    const newStatus = editStatus[flag.id] || flag.admin_status;
    updateStatus.mutate({
      flagId: flag.id,
      admin_status: newStatus,
      admin_notes: editNotes[flag.id] ?? flag.admin_notes ?? "",
      resolved_by: user.id,
      previousStatus: flag.admin_status,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Flag className="h-5 w-5 text-zuper-amber" />
        <h1 className="text-2xl font-semibold text-foreground">False Positives</h1>
      </div>

      {/* Status counts */}
      <div className="flex items-center gap-3">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusFilter === s.value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {s.label} ({counts[s.value as keyof typeof counts]})
          </button>
        ))}
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            statusFilter === "all" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          All ({flags.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agentNumbers.map((n) => {
              const name = flags.find((f) => f.agent_number === n)?.agent_name;
              return (
                <SelectItem key={n} value={String(n)}>
                  #{n} {name}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="major">Major</SelectItem>
            <SelectItem value="minor">Minor</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Flag className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No flags match the current filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_140px_100px_120px_100px_100px] gap-2 px-3 py-2 bg-muted/50 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Check</span>
            <span>Agent</span>
            <span>Page</span>
            <span>Severity</span>
            <span>Flagged By</span>
            <span>Date</span>
            <span>Status</span>
          </div>

          {filtered.map((flag) => {
            const isExpanded = expandedId === flag.id;
            return (
              <div key={flag.id} className="border-t border-border">
                <button
                  className="w-full grid grid-cols-[1fr_120px_140px_100px_120px_100px_100px] gap-2 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors items-center"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : flag.id);
                    if (!isExpanded && !editStatus[flag.id]) {
                      setEditStatus((prev) => ({ ...prev, [flag.id]: flag.admin_status }));
                      setEditNotes((prev) => ({ ...prev, [flag.id]: flag.admin_notes || "" }));
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    <span className="text-sm truncate">{flag.check_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">#{flag.agent_number} {flag.agent_name}</span>
                  <span className="text-xs text-primary truncate">{flag.page_slug || "—"}</span>
                  <Badge className={`text-[10px] h-4 w-fit ${SEVERITY_COLORS[flag.check_severity] || SEVERITY_COLORS.info}`}>
                    {flag.check_severity}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">{userMap.get(flag.flagged_by) || "Unknown"}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(flag.created_at), "MMM d")}</span>
                  <Badge variant="outline" className={`text-[10px] h-4 w-fit ${STATUS_COLORS[flag.admin_status] || ""}`}>
                    {flag.admin_status}
                  </Badge>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-4 space-y-3 border-t border-border/50 bg-accent/10">
                    <div className="pt-3 space-y-2">
                      {flag.check_finding && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Finding: </span>
                          <span className="text-xs text-foreground">{flag.check_finding}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Reason for flagging: </span>
                        <span className="text-xs text-foreground">{flag.reason}</span>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Page: </span>
                        <Link
                          to={`/pages/${flag.agent_run_id}`}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {flag.page_url} <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>
                    </div>

                    {/* Admin actions */}
                    <div className="pt-2 border-t space-y-2">
                      <div className="flex items-center gap-3">
                        <Select
                          value={editStatus[flag.id] || flag.admin_status}
                          onValueChange={(v) => setEditStatus((prev) => ({ ...prev, [flag.id]: v }))}
                        >
                          <SelectTrigger className="w-44 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => { e.stopPropagation(); handleSave(flag); }}
                          disabled={updateStatus.isPending}
                        >
                          Save
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Admin notes (optional)"
                        value={editNotes[flag.id] ?? flag.admin_notes ?? ""}
                        onChange={(e) => setEditNotes((prev) => ({ ...prev, [flag.id]: e.target.value }))}
                        className="min-h-[50px] text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
