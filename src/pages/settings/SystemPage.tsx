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

  const { data: keyStatus } = useQuery({
    queryKey: ["api-key-status"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { anthropic: false, browserless: false };
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-secrets`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (res.ok) return await res.json();
      } catch {}
      return { anthropic: false, browserless: false };
    },
  });

  const { data: baselineSettings } = useQuery({
    queryKey: ["system-settings", "baselines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["baseline_minutes_per_page", "baseline_minutes_per_page_blog"]);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        map[row.key] = row.value;
      }
      return {
        full: map["baseline_minutes_per_page"] ?? "60",
        blog: map["baseline_minutes_per_page_blog"] ?? "25",
      };
    },
  });

  const [fullBaseline, setFullBaseline] = useState("60");
  const [blogBaseline, setBlogBaseline] = useState("25");
  const [savingFull, setSavingFull] = useState(false);
  const [savingBlog, setSavingBlog] = useState(false);

  useEffect(() => {
    if (baselineSettings) {
      setFullBaseline(baselineSettings.full);
      setBlogBaseline(baselineSettings.blog);
    }
  }, [baselineSettings]);

  const saveBaseline = async (
    key: string,
    value: string,
    previousValue: string | undefined,
    setSaving: (v: boolean) => void
  ) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 15 || num > 180) {
      toast.error("Value must be between 15 and 180");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("system_settings")
        .update({ value: String(num), updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw error;

      await logAudit({
        action_type: "update_system_setting",
        entity_type: "system_setting",
        entity_id: key,
        before_state: { value: previousValue },
        after_state: { value: String(num) },
      });

      toast.success("Baseline updated");
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-baseline"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">System Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <KeyStatusRow name="Anthropic API" configured={keyStatus?.anthropic ?? false} />
          <KeyStatusRow name="Browserless" configured={keyStatus?.browserless ?? false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">QA Baseline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Estimated manual QA time per page, by pipeline profile. Used for time-savings calculations on the dashboard.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BaselineInput
              label="Full Preflight"
              value={fullBaseline}
              savedValue={baselineSettings?.full}
              onChange={setFullBaseline}
              saving={savingFull}
              onSave={() => saveBaseline("baseline_minutes_per_page", fullBaseline, baselineSettings?.full, setSavingFull)}
            />
            <BaselineInput
              label="Blog QA"
              value={blogBaseline}
              savedValue={baselineSettings?.blog}
              onChange={setBlogBaseline}
              saving={savingBlog}
              onSave={() => saveBaseline("baseline_minutes_per_page_blog", blogBaseline, baselineSettings?.blog, setSavingBlog)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BaselineInput({
  label, value, savedValue, onChange, saving, onSave,
}: {
  label: string;
  value: string;
  savedValue: string | undefined;
  onChange: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-1 rounded-md border p-3">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <Input
          type="number"
          min={15}
          max={180}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-[100px]"
        />
        <span className="text-sm text-muted-foreground">min</span>
        <Button size="sm" onClick={onSave} disabled={saving || value === savedValue}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save
        </Button>
      </div>
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
