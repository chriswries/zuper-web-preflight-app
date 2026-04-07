import TrackingConfigTab from "@/components/settings/TrackingConfigTab";
import { Bot, Loader2, Save, AlertCircle, ChevronRight, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

const CONFIDENCE_LABELS: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-zuper-green/15 text-zuper-green border-zuper-green/30" },
  medium: { label: "Medium", className: "bg-zuper-amber/15 text-zuper-amber border-zuper-amber/30" },
  lower: { label: "Lower", className: "bg-zuper-red/15 text-zuper-red border-zuper-red/30" },
};

// Agents that have runtime config in agent_configs
// Agent 11 uses a custom multi-field config tab (TrackingConfigTab), not the generic one
const CONFIGURABLE_AGENTS: Record<number, { config_key: string; label: string; description: string }> = {
  2: { config_key: "copy_style_guide", label: "Copy Style Guide", description: "Capitalization, punctuation, number formatting, and spelling rules for copy editing checks." },
  8: { config_key: "brand_voice_guidelines", label: "Brand Voice Guidelines", description: "Brand voice, tone, positioning, and approved terminology for voice compliance checks." },
  9: { config_key: "design_tokens", label: "Design Tokens", description: "Brand colors, typography, CTA styling, and spacing rules for visual design checks." },
  15: { config_key: "allowed_third_party_domains", label: "Allowed Third-Party Domains", description: "Whitelist of allowed external domains for security checks." },
};

// Agent 11 has its own structured config tab
const TRACKING_CONFIG_AGENT = 11;

type AgentRow = {
  id: string;
  agent_number: number;
  name: string;
  stage_number: number;
  model_tier: string;
  confidence_tier: string;
  is_active: boolean;
  is_blocking: boolean;
  system_prompt: string | null;
  blog_system_prompt: string | null;
  skip_in_blog_mode: boolean;
  description: string | null;
};

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_number, name, stage_number, model_tier, confidence_tier, is_active, is_blocking, system_prompt, blog_system_prompt, skip_in_blog_mode, description")
        .order("agent_number");
      if (error) throw error;
      return data as AgentRow[];
    },
  });

  const selectedAgent = agents?.find((a) => a.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Agent Settings</h1>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Agent list */}
        <div className="space-y-1">
          {agents?.map((agent) => {
            const conf = CONFIDENCE_LABELS[agent.confidence_tier];
            const isSelected = agent.id === selectedId;
            return (
              <button
                key={agent.id}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-accent border border-border" : "hover:bg-accent/50"
                }`}
                onClick={() => setSelectedId(isSelected ? null : agent.id)}
              >
                <span className="text-xs text-muted-foreground w-5 text-right font-mono">{agent.agent_number}</span>
                <span className={`flex-1 text-sm font-medium ${agent.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                  {agent.name}
                </span>
                {conf && (
                  <Badge variant="outline" className={`text-[10px] h-4 ${conf.className}`}>
                    {conf.label}
                  </Badge>
                )}
                {(() => {
                  if (agent.skip_in_blog_mode) {
                    return <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground border-muted-foreground/30">Skipped</Badge>;
                  }
                  const hasBlogPrompt = !!(agent as any).blog_system_prompt?.trim();
                  return hasBlogPrompt
                    ? <Badge variant="outline" className="text-[10px] h-4 text-zuper-green border-zuper-green/30 bg-zuper-green/10">Blog</Badge>
                    : <Badge variant="outline" className="text-[10px] h-4 text-zuper-amber border-zuper-amber/30 bg-zuper-amber/10">Needs prompt</Badge>;
                })()}
                <Badge variant="outline" className="text-[10px] h-4">
                  {agent.model_tier}
                </Badge>
                <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
              </button>
            );
          })}
        </div>

        {/* Config panel */}
        {selectedAgent ? (
          <AgentConfigPanel
            agent={selectedAgent}
            onClose={() => setSelectedId(null)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["agents-settings"] })}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <Bot className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Select an agent to view and edit its configuration.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AgentConfigPanel({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState(agent.system_prompt ?? "");
  const [blogPrompt, setBlogPrompt] = useState((agent as any).blog_system_prompt ?? "");
  const [modelTier, setModelTier] = useState(agent.model_tier);
  const [isActive, setIsActive] = useState(agent.is_active);
  const [saving, setSaving] = useState(false);
  const configDef = CONFIGURABLE_AGENTS[agent.agent_number];
  const isTrackingAgent = agent.agent_number === TRACKING_CONFIG_AGENT;
  const hasConfigTab = !!configDef || isTrackingAgent;
  const skipInBlog = (agent as any).skip_in_blog_mode ?? false;

  useEffect(() => {
    setPrompt(agent.system_prompt ?? "");
    setBlogPrompt((agent as any).blog_system_prompt ?? "");
    setModelTier(agent.model_tier);
    setIsActive(agent.is_active);
  }, [agent]);

  const saveAgent = async () => {
    setSaving(true);
    try {
      const before = { system_prompt: agent.system_prompt, blog_system_prompt: (agent as any).blog_system_prompt, model_tier: agent.model_tier, is_active: agent.is_active };
      const after = { system_prompt: prompt, blog_system_prompt: blogPrompt, model_tier: modelTier, is_active: isActive };

      const { error } = await supabase
        .from("agents")
        .update({
          system_prompt: prompt,
          blog_system_prompt: blogPrompt,
          model_tier: modelTier as any,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", agent.id);
      if (error) throw error;

      await logAudit({
        action_type: "update_agent",
        entity_type: "agent",
        entity_id: agent.id,
        before_state: before,
        after_state: after,
      });

      toast.success(`${agent.name} updated`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = prompt !== (agent.system_prompt ?? "") || blogPrompt !== ((agent as any).blog_system_prompt ?? "") || modelTier !== agent.model_tier || isActive !== agent.is_active;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">#{agent.agent_number}</span>
          <CardTitle className="text-lg">{agent.name}</CardTitle>
          {CONFIDENCE_LABELS[agent.confidence_tier] && (
            <Badge variant="outline" className={`text-xs ${CONFIDENCE_LABELS[agent.confidence_tier].className}`}>
              {CONFIDENCE_LABELS[agent.confidence_tier].label} Confidence
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="prompt">
          <TabsList>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="blog-prompt">Blog Prompt</TabsTrigger>
            {hasConfigTab && <TabsTrigger value="config">Configuration</TabsTrigger>}
          </TabsList>

          <TabsContent value="prompt" className="space-y-4 mt-4">
            {agent.description && (
              <p className="text-sm text-muted-foreground">{agent.description}</p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">System Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-xs leading-relaxed"
                placeholder="Enter the agent's system prompt..."
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Model Tier</label>
                <Select value={modelTier} onValueChange={setModelTier}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="haiku">Haiku</SelectItem>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Active</label>
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span className="text-xs text-muted-foreground">{isActive ? "Runs in pipeline" : "Skipped"}</span>
                </div>
              </div>
            </div>

            <Button onClick={saveAgent} disabled={saving || !hasChanges}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save Changes
            </Button>
          </TabsContent>

          <TabsContent value="blog-prompt" className="space-y-4 mt-4">
            {skipInBlog && (
              <div className="rounded-md bg-muted px-3 py-2 flex items-center gap-2">
                <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">Skipped in Blog Mode</Badge>
                <span className="text-xs text-muted-foreground">This agent is skipped when running Blog QA. Blog prompt is not needed.</span>
              </div>
            )}

            <div className={`space-y-2 ${skipInBlog ? "opacity-50" : ""}`}>
              <label className="text-sm font-medium text-foreground">Blog Mode System Prompt</label>
              <p className="text-xs text-muted-foreground">Used when this agent runs on pages with the Blog QA pipeline profile. Leave empty to use the standard system prompt as a fallback.</p>
              <Textarea
                value={blogPrompt}
                onChange={(e) => setBlogPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-xs leading-relaxed"
                placeholder="Enter the blog-specific system prompt..."
              />
            </div>

            <Button onClick={saveAgent} disabled={saving || !hasChanges}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save Changes
            </Button>
          </TabsContent>

          {hasConfigTab && (
            <TabsContent value="config" className="mt-4">
              {isTrackingAgent ? (
                <TrackingConfigTab agentId={agent.id} />
              ) : (
                <AgentConfigTab agentId={agent.id} agentNumber={agent.agent_number} config={configDef!} />
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AgentConfigTab({
  agentId,
  agentNumber,
  config,
}: {
  agentId: string;
  agentNumber: number;
  config: { config_key: string; label: string; description: string };
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [originalValue, setOriginalValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data: configRow } = useQuery({
    queryKey: ["agent-config", agentId, config.config_key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configs")
        .select("id, config_value")
        .eq("agent_id", agentId)
        .eq("config_key", config.config_key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (configRow !== undefined && !loaded) {
      const v = configRow?.config_value ?? "";
      setValue(v);
      setOriginalValue(v);
      setLoaded(true);
    }
  }, [configRow, loaded]);

  // Reset loaded state when agent changes
  useEffect(() => {
    setLoaded(false);
  }, [agentId]);

  const isEmpty = !value || value.trim() === "";
  const isRequired = agentNumber === 11; // tracking_ids is required

  const saveConfig = async () => {
    setSaving(true);
    try {
      const before = { config_key: config.config_key, config_value: originalValue };
      const after = { config_key: config.config_key, config_value: value };

      if (configRow?.id) {
        const { error } = await supabase
          .from("agent_configs")
          .update({ config_value: value, updated_at: new Date().toISOString() })
          .eq("id", configRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("agent_configs")
          .insert({ agent_id: agentId, config_key: config.config_key, config_value: value });
        if (error) throw error;
      }

      await logAudit({
        action_type: "update_agent_config",
        entity_type: "agent_config",
        entity_id: agentId,
        before_state: before,
        after_state: after,
      });

      setOriginalValue(value);
      toast.success(`${config.label} saved`);
      queryClient.invalidateQueries({ queryKey: ["agent-config", agentId, config.config_key] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-medium text-foreground">{config.label}</label>
          {isEmpty && (
            <Badge variant="outline" className={`text-[10px] h-4 ${isRequired ? "border-zuper-red/40 text-zuper-red" : "border-zuper-amber/40 text-zuper-amber"}`}>
              <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
              Not configured
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-2">{config.description}</p>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-[200px] font-mono text-xs"
          placeholder={`Enter ${config.label.toLowerCase()}...`}
        />
      </div>

      <Button onClick={saveConfig} disabled={saving || value === originalValue}>
        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
        Save Configuration
      </Button>
    </div>
  );
}
