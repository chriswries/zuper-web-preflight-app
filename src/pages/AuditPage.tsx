import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { ClipboardList, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const PAGE_SIZE = 25;

function formatActionType(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function CopyUuid({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = id.slice(0, 8) + "…";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(id);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {truncated}
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{id}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function JsonDiff({ label, data }: { label: string; data: unknown }) {
  if (!data) return null;
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

interface AuditRow {
  id: string;
  created_at: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  before_state: unknown;
  after_state: unknown;
  details: unknown;
  user_id: string;
  user_display_name: string | null;
}

export default function AuditPage() {
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["audit_log", page, actionFilter, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("id, created_at, action_type, entity_type, entity_id, before_state, after_state, details, user_id, users!audit_log_user_id_fkey(display_name)")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (dateRange?.from) {
        q = q.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        q = q.lte("created_at", endOfDay.toISOString());
      }
      if (actionFilter && actionFilter !== "all") {
        q = q.eq("action_type", actionFilter);
      }

      const { data: rows, error } = await q;
      if (error) throw error;

      return (rows ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        action_type: r.action_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        before_state: r.before_state,
        after_state: r.after_state,
        details: r.details,
        user_id: r.user_id,
        user_display_name: r.users?.display_name ?? null,
      })) as AuditRow[];
    },
  });

  const { data: actionTypes } = useQuery({
    queryKey: ["audit_log_action_types"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("audit_log")
        .select("action_type")
        .order("action_type");
      const unique = [...new Set((rows ?? []).map((r: any) => r.action_type as string))];
      return unique;
    },
  });

  const rows = data ?? [];
  const hasMore = rows.length === PAGE_SIZE;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {(actionTypes ?? []).map((a) => (
              <SelectItem key={a} value={a}>{formatActionType(a)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[260px] justify-start text-left font-normal">
              {dateRange?.from ? (
                dateRange.to ? (
                  <>{format(dateRange.from, "LLL dd, y")} – {format(dateRange.to, "LLL dd, y")}</>
                ) : (
                  format(dateRange.from, "LLL dd, y")
                )
              ) : (
                <span className="text-muted-foreground">Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={(r) => { setDateRange(r); setPage(0); }}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <ClipboardList className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">No audit entries found</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Try adjusting your filters or date range.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Entity ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const hasDetails = row.before_state || row.after_state || row.details;
                  return (
                    <>
                      <TableRow
                        key={row.id}
                        className={cn(hasDetails && "cursor-pointer")}
                        onClick={() => hasDetails && setExpandedId(isExpanded ? null : row.id)}
                      >
                        <TableCell className="w-8 px-2">
                          {hasDetails && (
                            isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="text-sm">
                                {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                              </TooltipTrigger>
                              <TooltipContent>
                                {format(new Date(row.created_at), "PPpp")}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.user_display_name ?? row.user_id.slice(0, 8) + "…"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{formatActionType(row.action_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm capitalize">{row.entity_type}</TableCell>
                        <TableCell>
                          {row.entity_id ? <CopyUuid id={row.entity_id} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={row.id + "-detail"}>
                          <TableCell />
                          <TableCell colSpan={5}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                              <JsonDiff label="Before State" data={row.before_state} />
                              <JsonDiff label="After State" data={row.after_state} />
                              {row.details && (
                                <JsonDiff label="Details" data={row.details} />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page + 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
