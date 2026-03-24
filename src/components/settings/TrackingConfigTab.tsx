import { AlertCircle, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

const TRACKING_FIELDS = [
  { config_key: "gtm_container_id", label: "GTM Container ID", placeholder: "GTM-XXXXXXX" },
  { config_key: "ga4_measurement_id", label: "GA4 Measurement ID", placeholder: "G-XXXXXXXXXX" },
  { config_key: "meta_pixel_id", label: "Meta Pixel ID", placeholder: "1788420391363788" },
  { config_key: "linkedin_partner_id", label: "LinkedIn Partner ID", placeholder: "1234567" },
  { config_key: "hubspot_portal_id", label: "HubSpot Portal ID", placeholder: "12345678" },
] as const;

type FieldValues = Record<string, string>;

export default function TrackingConfigTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FieldValues>({});
  const [original, setOriginal] = useState<FieldValues>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data: configRows } = useQuery({
    queryKey: ["agent-tracking-configs", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configs")
        .select("id, config_key, config_value")
        .eq("agent_id", agentId)
        .in("config_key", TRACKING_FIELDS.map((f) => f.config_key));
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (configRows !== undefined && !loaded) {
      const vals: FieldValues = {};
      for (const f of TRACKING_FIELDS) {
        const row = configRows?.find((r) => r.config_key === f.config_key);
        vals[f.config_key] = row?.config_value ?? "";
      }
      setValues(vals);
      setOriginal(vals);
      setLoaded(true);
    }
  }, [configRows, loaded]);

  useEffect(() => {
    setLoaded(false);
  }, [agentId]);

  const hasChanges = TRACKING_FIELDS.some((f) => values[f.config_key] !== original[f.config_key]);

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const field of TRACKING_FIELDS) {
        const newVal = values[field.config_key] ?? "";
        const oldVal = original[field.config_key] ?? "";
        if (newVal === oldVal) continue;

        const existingRow = configRows?.find((r) => r.config_key === field.config_key);
        if (existingRow) {
          const { error } = await supabase
            .from("agent_configs")
            .update({ config_value: newVal, updated_at: new Date().toISOString() })
            .eq("id", existingRow.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("agent_configs")
            .insert({ agent_id: agentId, config_key: field.config_key, config_value: newVal });
          if (error) throw error;
        }

        await logAudit({
          action_type: "update_agent_config",
          entity_type: "agent_config",
          entity_id: agentId,
          before_state: { config_key: field.config_key, config_value: oldVal },
          after_state: { config_key: field.config_key, config_value: newVal },
        });
      }

      setOriginal({ ...values });
      toast.success("Tracking IDs saved");
      queryClient.invalidateQueries({ queryKey: ["agent-tracking-configs", agentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enter the tracking/analytics IDs that should be verified on every page. Leave blank if not used.
      </p>

      {TRACKING_FIELDS.map((field) => {
        const val = values[field.config_key] ?? "";
        const isEmpty = !val.trim();
        return (
          <div key={field.config_key} className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-foreground">{field.label}</label>
              {isEmpty && (
                <Badge variant="outline" className="text-[10px] h-4 border-zuper-amber/40 text-zuper-amber">
                  <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                  Not configured
                </Badge>
              )}
            </div>
            <Input
              value={val}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.config_key]: e.target.value }))}
              placeholder={field.placeholder}
              className="font-mono text-sm max-w-md"
            />
          </div>
        );
      })}

      <Button onClick={saveAll} disabled={saving || !hasChanges}>
        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
        Save Configuration
      </Button>
    </div>
  );
}
