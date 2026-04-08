import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Upload, Loader2 } from "lucide-react";
import { parseMultiLine, parseCsv, type ParsedQueueRow } from "@/lib/queue-parsers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AddToQueueModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_URLS = 1000;

export function AddToQueueModal({ open, onClose, onSuccess }: AddToQueueModalProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState("paste");
  const [pasteText, setPasteText] = useState("");
  const [batchName, setBatchName] = useState("");
  const [pipelineProfile, setPipelineProfile] = useState<"full" | "blog">("full");
  const [rows, setRows] = useState<ParsedQueueRow[]>([]);
  const [step, setStep] = useState<"input" | "preview">("input");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPasteText("");
    setBatchName("");
    setPipelineProfile("full");
    setRows([]);
    setStep("input");
    setTab("paste");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const checkDuplicates = async (parsed: ParsedQueueRow[]) => {
    setChecking(true);
    const urls = parsed.map((r) => r.newUrl);

    // Check against pages
    const { data: existingPages } = await supabase
      .from("pages")
      .select("new_url")
      .in("new_url", urls)
      .neq("status", "archived");

    const pageUrls = new Set(existingPages?.map((p) => p.new_url) ?? []);

    // Check against queue
    const { data: existingQueue } = await supabase
      .from("page_queue")
      .select("new_url")
      .in("new_url", urls)
      .in("status", ["queued", "claimed"]);

    const queueUrls = new Set(existingQueue?.map((q) => q.new_url) ?? []);

    const checked = parsed.map((r) => ({
      ...r,
      duplicate: pageUrls.has(r.newUrl) || queueUrls.has(r.newUrl),
      duplicateSource: pageUrls.has(r.newUrl) ? "pages" as const : queueUrls.has(r.newUrl) ? "queue" as const : undefined,
    }));

    setChecking(false);
    return checked;
  };

  const handleParse = async () => {
    const parsed = parseMultiLine(pasteText);
    if (parsed.length === 0) {
      toast.error("No URLs found");
      return;
    }
    if (parsed.length > MAX_URLS) {
      toast.error(`Maximum ${MAX_URLS} URLs per upload. You entered ${parsed.length}.`);
      return;
    }
    const checked = await checkDuplicates(parsed);
    setRows(checked);
    setStep("preview");
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      toast.error("No URLs found in CSV");
      return;
    }
    if (parsed.length > MAX_URLS) {
      toast.error(`Maximum ${MAX_URLS} URLs per upload. CSV has ${parsed.length} rows.`);
      return;
    }
    const checked = await checkDuplicates(parsed);
    setRows(checked);
    setStep("preview");
  };

  const toggleRow = (index: number) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, included: !r.included } : r));
  };

  const includedRows = rows.filter((r) => r.included && r.valid);
  const invalidCount = rows.filter((r) => !r.valid).length;
  const dupCount = rows.filter((r) => r.duplicate && r.included).length;

  const handleConfirm = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const inserts = includedRows.map((r, i) => ({
        created_by: user.id,
        new_url: r.newUrl,
        old_url: r.oldUrl,
        slug: r.slug,
        target_keyword: r.targetKeyword,
        batch_name: batchName.trim() || null,
        sort_order: i,
        status: "queued" as const,
        pipeline_profile: pipelineProfile,
      } as any));

      const { error } = await supabase.from("page_queue").insert(inserts);
      if (error) throw error;

      toast.success(`${inserts.length} items added to queue`);
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to queue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to QA Queue</DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Batch Name (optional)</Label>
                <Input
                  placeholder="e.g. Sprint 12 pages"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Pipeline Profile</Label>
                <RadioGroup value={pipelineProfile} onValueChange={(v) => setPipelineProfile(v as "full" | "blog")} className="flex gap-4">
                  <label htmlFor="q-profile-full" className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="full" id="q-profile-full" />
                    <span className="text-sm">Full Preflight</span>
                  </label>
                  <label htmlFor="q-profile-blog" className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="blog" id="q-profile-blog" />
                    <span className="text-sm">Blog QA</span>
                  </label>
                </RadioGroup>
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="paste" className="flex-1">Paste URLs</TabsTrigger>
                  <TabsTrigger value="csv" className="flex-1">Upload CSV</TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="space-y-2 mt-3">
                  <Label>One URL per line, or comma/tab-separated: new_url, old_url</Label>
                  <Textarea
                    placeholder={"https://staging.zuper.co/page-1\nhttps://staging.zuper.co/page-2, https://zuper.co/old-page-2"}
                    className="min-h-[160px] font-mono text-sm"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Max {MAX_URLS} URLs per upload</p>
                </TabsContent>

                <TabsContent value="csv" className="space-y-2 mt-3">
                  <Label>CSV with columns: new_url, old_url, slug, target_keyword</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvUpload}
                  />
                  <div
                    className="flex items-center justify-center rounded-md border border-dashed border-border py-10 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Click to upload CSV (max {MAX_URLS} rows)
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              {tab === "paste" && (
                <Button onClick={handleParse} disabled={!pasteText.trim() || checking}>
                  {checking && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Preview
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-foreground font-medium">{includedRows.length} URLs</span>
                {invalidCount > 0 && (
                  <Badge variant="destructive" className="text-xs">{invalidCount} invalid</Badge>
                )}
                {dupCount > 0 && (
                  <Badge variant="secondary" className="text-xs">{dupCount} duplicates</Badge>
                )}
              </div>

              <div className="rounded-lg border border-border overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b">
                      <th className="w-8 px-3 py-2" />
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">New URL</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Old URL</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={`border-b last:border-b-0 ${!row.valid ? "opacity-50" : ""}`}>
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={row.included && row.valid}
                            disabled={!row.valid}
                            onCheckedChange={() => toggleRow(i)}
                          />
                        </td>
                        <td className="px-3 py-2 text-foreground truncate max-w-[250px] font-mono text-xs">
                          {row.newUrl}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px] font-mono text-xs">
                          {row.oldUrl || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {!row.valid && (
                            <Badge variant="destructive" className="text-xs">Invalid</Badge>
                          )}
                          {row.valid && row.duplicate && (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                              <span className="text-xs text-muted-foreground">
                                In {row.duplicateSource}
                              </span>
                            </div>
                          )}
                          {row.valid && !row.duplicate && (
                            <Badge variant="secondary" className="text-xs">OK</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("input")}>Back</Button>
              <Button onClick={handleConfirm} disabled={includedRows.length === 0 || submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Add {includedRows.length} to Queue
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
