import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export default function SystemPage() {
  const queryClient = useQueryClient();

  // Check API key status via edge function
  const { data: keyStatus } = useQuery({
    queryKey: ["api-key-status"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { anthropic: false, browserless: false };

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-secrets`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );
        if (res.ok) return await res.json();
      } catch {}
      return { anthropic: false, browserless: false };
    },
  });

  // Load baseline setting
  const { data: baselineSetting } = useQuery({
    queryKey: ["system-settings", "baseline_minutes_per_page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("value")
        .eq("key", "baseline_minutes_per_page")
        .single();
      if (error) throw error;
      return (data as any)?.value ?? "60";
    },
  });

  const [baseline, setBaseline] = useState("60");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (baselineSetting) setBaseline(baselineSetting);
  }, [baselineSetting]);

  const saveBaseline = async () => {
    const num = parseInt(baseline, 10);
    if (isNaN(num) || num < 15 || num > 180) {
      toast.error("Value must be between 15 and 180");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("system_settings" as any)
        .update({ value: String(num), updated_at: new Date().toISOString() } as any)
        .eq("key", "baseline_minutes_per_page");
      if (error) throw error;

      await logAudit({
        action_type: "update_system_setting",
        entity_type: "system_setting",
        entity_id: "baseline_minutes_per_page",
        before_state: { value: baselineSetting },
        after_state: { value: String(num) },
      });

      toast.success("Baseline updated");
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">System Settings</h1>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <KeyStatusRow name="Anthropic API" configured={keyStatus?.anthropic ?? false} />
          <KeyStatusRow name="Browserless" configured={keyStatus?.browserless ?? false} />
        </CardContent>
      </Card>

      {/* Baseline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">QA Baseline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Baseline minutes per page</label>
            <p className="text-xs text-muted-foreground">
              Estimated manual QA time per page. Used for time-savings calculations on the dashboard.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="number"
                min={15}
                max={180}
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                className="w-[120px]"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
              <Button
                size="sm"
                onClick={saveBaseline}
                disabled={saving || baseline === baselineSetting}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KeyStatusRow({ name, configured }: { name: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-4 py-3">
      <span className="text-sm font-medium text-foreground">{name}</span>
      {configured ? (
        <Badge variant="outline" className="text-xs border-zuper-green/40 text-zuper-green bg-zuper-green/10">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Configured
        </Badge>
      ) : (
        <Badge variant="outline" className="text-xs border-zuper-amber/40 text-zuper-amber bg-zuper-amber/10">
          <AlertCircle className="h-3 w-3 mr-1" />
          Not configured
        </Badge>
      )}
    </div>
  );
}
