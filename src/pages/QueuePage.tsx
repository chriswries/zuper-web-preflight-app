import { useState, useMemo } from "react";
import { ListTodo, Plus, GripVertical, Play, SkipForward, RotateCcw, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { createPageWithRuns } from "@/lib/page-helpers";
import { AddToQueueModal } from "@/components/AddToQueueModal";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

type QueueRow = Tables<"page_queue"> & {
  creator: { display_name: string | null } | null;
  claimer: { display_name: string | null } | null;
};

function SortableQueueRow({
  item,
  userId,
  isAdmin,
  onClaim,
  onSkip,
  onUnskip,
  onRelease,
  claiming,
}: {
  item: QueueRow;
  userId: string;
  isAdmin: boolean;
  onClaim: (id: string) => void;
  onSkip: (id: string) => void;
  onUnskip: (id: string) => void;
  onRelease: (id: string) => void;
  claiming: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const isClaimed = !!item.claimed_by;
  const isMyClam = item.claimed_by === userId;
  const isSkipped = item.status === "skipped";
  const isPromoted = item.status === "promoted";
  const canClaim = !isClaimed && !isSkipped && !isPromoted;
  const isClaiming = claiming === item.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 ${isSkipped ? "opacity-50" : ""} ${isPromoted ? "opacity-40" : ""}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground truncate">{item.new_url}</span>
          {item.old_url && (
            <Badge variant="secondary" className="text-[10px] shrink-0">Migration</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.batch_name && <span>Batch: {item.batch_name}</span>}
          {item.slug && <span>/{item.slug}</span>}
          <span>by {item.creator?.display_name || "—"}</span>
          {isClaimed && (
            <span className="text-primary font-medium">
              Claimed by {isMyClam ? "you" : item.claimer?.display_name || "—"}
            </span>
          )}
        </div>
      </div>

      <StatusBadge status={item.status} />

      <div className="flex items-center gap-1 shrink-0">
        {canClaim && (
          <Button size="sm" onClick={() => onClaim(item.id)} disabled={isClaiming}>
            {isClaiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
            Claim & Start
          </Button>
        )}
        {isSkipped && (
          <Button size="sm" variant="outline" onClick={() => onUnskip(item.id)}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Un-skip
          </Button>
        )}
        {!isSkipped && !isPromoted && !isClaimed && (
          <Button size="sm" variant="ghost" onClick={() => onSkip(item.id)}>
            <SkipForward className="h-3 w-3" />
          </Button>
        )}
        {isClaimed && !isPromoted && isAdmin && (
          <Button size="sm" variant="outline" onClick={() => onRelease(item.id)}>
            Release
          </Button>
        )}
      </div>
    </div>
  );
}

export default function QueuePage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [bulkAction, setBulkAction] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: items, isLoading } = useQuery({
    queryKey: ["queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_queue")
        .select("*, creator:users!page_queue_created_by_fkey(display_name), claimer:users!page_queue_claimed_by_fkey(display_name)")
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data as QueueRow[];
    },
  });

  // Batch names for filter
  const batchNames = useMemo(() => {
    if (!items) return [];
    const names = new Set<string>();
    items.forEach((i) => { if (i.batch_name) names.add(i.batch_name); });
    return Array.from(names).sort();
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (batchFilter === "all") return items;
    if (batchFilter === "__none__") return items.filter((i) => !i.batch_name);
    return items.filter((i) => i.batch_name === batchFilter);
  }, [items, batchFilter]);

  // Metrics
  const metrics = useMemo(() => {
    if (!items) return { total: 0, remaining: 0, promotedToday: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      total: items.filter((i) => i.status === "queued" || i.status === "claimed").length,
      remaining: items.filter((i) => i.status === "queued").length,
      promotedToday: items.filter((i) => {
        if (i.status !== "promoted") return false;
        const updated = new Date(i.updated_at);
        return updated >= today;
      }).length,
    };
  }, [items]);

  const updateQueue = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from("page_queue").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queue"] }),
  });

  const handleClaim = async (queueId: string) => {
    if (!user) return;
    const item = items?.find((i) => i.id === queueId);
    if (!item) return;

    setClaiming(queueId);
    try {
      const pageId = await createPageWithRuns({
        newUrl: item.new_url,
        oldUrl: item.old_url,
        slug: item.slug,
        targetKeyword: item.target_keyword,
        createdBy: user.id,
      });

      await supabase
        .from("page_queue")
        .update({
          claimed_by: user.id,
          status: "promoted" as const,
          promoted_page_id: pageId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);

      toast.success("Page created from queue item");
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      navigate(`/pages/${pageId}?from=queue`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to claim");
    } finally {
      setClaiming(null);
    }
  };

  const handleSkip = (id: string) => {
    updateQueue.mutate({ id, updates: { status: "skipped", updated_at: new Date().toISOString() } });
  };

  const handleUnskip = (id: string) => {
    updateQueue.mutate({ id, updates: { status: "queued", updated_at: new Date().toISOString() } });
  };

  const handleRelease = (id: string) => {
    updateQueue.mutate({
      id,
      updates: { claimed_by: null, status: "queued", updated_at: new Date().toISOString() },
    });
  };

  const handleBulkSkip = async () => {
    if (!items) return;
    setBulkAction(true);
    const batch = batchFilter === "all" ? items : filteredItems;
    const toSkip = batch.filter((i) => i.status === "queued");
    try {
      for (const item of toSkip) {
        await supabase.from("page_queue").update({ status: "skipped", updated_at: new Date().toISOString() }).eq("id", item.id);
      }
      toast.success(`Skipped ${toSkip.length} items`);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    } catch {
      toast.error("Failed to skip items");
    } finally {
      setBulkAction(false);
    }
  };

  const handleBulkUnskip = async () => {
    if (!items) return;
    setBulkAction(true);
    const batch = batchFilter === "all" ? items : filteredItems;
    const toUnskip = batch.filter((i) => i.status === "skipped");
    try {
      for (const item of toUnskip) {
        await supabase.from("page_queue").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", item.id);
      }
      toast.success(`Un-skipped ${toUnskip.length} items`);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    } catch {
      toast.error("Failed to un-skip items");
    } finally {
      setBulkAction(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !filteredItems) return;

    const oldIndex = filteredItems.findIndex((i) => i.id === active.id);
    const newIndex = filteredItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(filteredItems, oldIndex, newIndex);

    queryClient.setQueryData(["queue"], (prev: QueueRow[] | undefined) => {
      if (!prev) return prev;
      if (batchFilter === "all") return reordered;
      // Merge reordered filtered items back into full list
      const reorderedMap = new Map(reordered.map((item, i) => [item.id, i]));
      return prev.map((item) => {
        const newOrder = reorderedMap.get(item.id);
        return newOrder !== undefined ? { ...item, sort_order: newOrder } : item;
      });
    });

    const updates = reordered.map((item, i) => ({ id: item.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from("page_queue").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
  };

  const hasItems = filteredItems && filteredItems.length > 0;
  const skippedInView = filteredItems.filter((i) => i.status === "skipped").length;
  const queuedInView = filteredItems.filter((i) => i.status === "queued").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">QA Queue</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add to Queue
        </Button>
      </div>

      {/* Metrics */}
      {items && items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Active Items</p>
              <p className="text-2xl font-semibold text-foreground">{metrics.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-2xl font-semibold text-foreground">{metrics.remaining}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Promoted Today</p>
              <p className="text-2xl font-semibold text-foreground">{metrics.promotedToday}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + Bulk Actions */}
      {items && items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <SelectValue placeholder="Filter by batch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All batches</SelectItem>
                <SelectItem value="__none__">No batch</SelectItem>
                {batchNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {queuedInView > 0 && (
              <Button size="sm" variant="outline" onClick={handleBulkSkip} disabled={bulkAction}>
                {bulkAction ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <SkipForward className="h-3 w-3 mr-1" />}
                Skip All ({queuedInView})
              </Button>
            )}
            {skippedInView > 0 && (
              <Button size="sm" variant="outline" onClick={handleBulkUnskip} disabled={bulkAction}>
                {bulkAction ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                Un-skip All ({skippedInView})
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!isLoading && !hasItems && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <ListTodo className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">
            {batchFilter !== "all" ? "No items in this batch" : "Queue is empty"}
          </h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            {batchFilter !== "all"
              ? "Try selecting a different batch or clear the filter."
              : "Add URLs to get started. You can upload a CSV or paste multiple URLs."}
          </p>
          {batchFilter !== "all" ? (
            <Button variant="outline" onClick={() => setBatchFilter("all")}>
              Clear Filter
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add URLs to queue
            </Button>
          )}
        </div>
      )}

      {!isLoading && hasItems && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <SortableQueueRow
                  key={item.id}
                  item={item}
                  userId={user?.id ?? ""}
                  isAdmin={isAdmin}
                  onClaim={handleClaim}
                  onSkip={handleSkip}
                  onUnskip={handleUnskip}
                  onRelease={handleRelease}
                  claiming={claiming}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddToQueueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["queue"] })}
      />
    </div>
  );
}
