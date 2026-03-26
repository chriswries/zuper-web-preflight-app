import { useState } from "react";
import { Flag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateFlag, useDeleteFlag, type FindingFlag } from "@/hooks/useFindingFlags";

interface FlagButtonProps {
  agentRunId: string;
  pageId: string;
  checkName: string;
  checkSeverity: string;
  checkFinding?: string;
  agentName: string;
  agentNumber: number;
  pageUrl: string;
  pageSlug?: string;
  existingFlag?: FindingFlag;
}

export function FlagButton({
  agentRunId,
  pageId,
  checkName,
  checkSeverity,
  checkFinding,
  agentName,
  agentNumber,
  pageUrl,
  pageSlug,
  existingFlag,
}: FlagButtonProps) {
  const { user } = useAuth();
  const createFlag = useCreateFlag();
  const deleteFlag = useDeleteFlag();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const isFlagged = !!existingFlag;
  const isOwnFlag = existingFlag?.flagged_by === user?.id;

  const handleSubmit = () => {
    if (!user || !reason.trim()) return;
    createFlag.mutate(
      {
        agent_run_id: agentRunId,
        page_id: pageId,
        check_name: checkName,
        check_severity: checkSeverity,
        check_finding: checkFinding,
        agent_name: agentName,
        agent_number: agentNumber,
        page_url: pageUrl,
        page_slug: pageSlug,
        flagged_by: user.id,
        reason: reason.trim(),
      },
      { onSuccess: () => { setOpen(false); setReason(""); } }
    );
  };

  const handleUnflag = () => {
    if (existingFlag && isOwnFlag) {
      deleteFlag.mutate(existingFlag);
    }
  };

  if (isFlagged) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={isOwnFlag ? handleUnflag : undefined}
            className={`shrink-0 p-0.5 rounded transition-colors ${
              isOwnFlag
                ? "text-zuper-amber hover:text-zuper-red cursor-pointer"
                : "text-zuper-amber cursor-default"
            }`}
            title={isOwnFlag ? "Click to unflag" : `Flagged by another user`}
          >
            <Flag className="h-3.5 w-3.5 fill-current" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs font-medium">Flagged as false positive</p>
          <p className="text-xs text-muted-foreground mt-0.5">{existingFlag.reason}</p>
          {isOwnFlag && <p className="text-xs text-muted-foreground mt-1">Click to unflag</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-zuper-amber transition-colors"
          title="Flag as false positive"
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="left" align="start">
        <p className="text-xs font-medium mb-2">Flag as false positive</p>
        <Textarea
          placeholder="Why do you think this is a false positive?"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 280))}
          className="min-h-[60px] text-xs mb-1"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{reason.length}/280</span>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!reason.trim() || createFlag.isPending}
            className="h-7 text-xs"
          >
            Submit
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
