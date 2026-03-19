import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AGENT_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 4096;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-20250514",
};

// Agents that need old_url content
const MIGRATION_AGENTS = [1, 4];

// Agent → browserless actions mapping (PRD Section 22)
const BROWSERLESS_ACTIONS: Record<number, string[]> = {
  9: ["screenshot", "rendered_html"],
  10: ["rendered_html", "interact"],
  11: ["rendered_html", "network_log"],
  12: ["rendered_html", "performance_data"],
  13: ["screenshot", "rendered_html"],
};

interface AgentReport {
  agent_name: string;
  agent_number: number;
  page_url: string;
  overall_status: string;
  checks: Array<{
    check_name: string;
    status: string;
    details: string;
    recommendation?: string;
  }>;
  summary: string;
}

function computeSummaryStats(checks: AgentReport["checks"]) {
  return {
    total_checks: checks.length,
    passed: checks.filter((c) => c.status === "passed").length,
    failed: checks.filter((c) => c.status === "failed").length,
    warnings: checks.filter((c) => c.status === "warning").length,
    skipped: checks.filter((c) => c.status === "skipped").length,
  };
}

function injectConfigs(
  prompt: string,
  configs: Array<{ config_key: string; config_value: string }>
): string {
  let result = prompt;
  // Find all {PLACEHOLDER} patterns
  const placeholders = result.match(/\{[A-Z_]+\}/g) || [];
  for (const ph of placeholders) {
    const key = ph.slice(1, -1); // remove braces
    const config = configs.find((c) => c.config_key === key);
    result = result.replace(
      ph,
      config?.config_value || "[Not configured — using agent defaults]"
    );
  }
  return result;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  retryStrict = false
): Promise<AgentReport> {
  const system = retryStrict
    ? systemPrompt +
      "\n\nCRITICAL: You MUST respond with valid JSON only. No other text, no markdown fences, no explanation. Pure JSON."
    : systemPrompt;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });

    // Handle rate limiting
    if (res.status === 429) {
      if (!retryStrict) {
        // Wait 5 seconds and retry once
        await new Promise((r) => setTimeout(r, 5000));
        return callAnthropic(apiKey, model, systemPrompt, userMessage, true);
      }
      throw new Error("Anthropic API rate limited after retry");
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error [${res.status}]: ${errText}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || "";

    // Parse JSON from response (handle markdown fences)
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    try {
      const report = JSON.parse(jsonStr) as AgentReport;
      if (!report.checks || !Array.isArray(report.checks)) {
        throw new Error("Missing checks array");
      }
      return report;
    } catch (parseErr) {
      if (!retryStrict) {
        // Retry with stricter prompt
        return callAnthropic(apiKey, model, systemPrompt, userMessage, true);
      }
      throw new Error("Agent produced unparseable results.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchContent(
  supabaseUrl: string,
  token: string,
  url: string
): Promise<{ html: string; error?: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-page-content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  const data = await res.json();
  if (data.error) {
    return { html: "", error: data.error };
  }
  return { html: data.html };
}

async function fetchBrowserless(
  supabaseUrl: string,
  token: string,
  url: string,
  actions: string[]
): Promise<Record<string, unknown>> {
  const res = await fetch(`${supabaseUrl}/functions/v1/browserless-render`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, actions }),
  });

  return await res.json();
}

function buildUserMessage(
  agentNumber: number,
  content: { html: string; error?: string },
  oldContent?: { html: string; error?: string },
  browserlessData?: Record<string, unknown>
): string {
  const parts: string[] = [];

  if (content.error) {
    parts.push(`[Content acquisition error: ${content.error}]`);
  }

  if (content.html) {
    // Truncate for the AI context window
    const html = content.html.length > 100_000
      ? content.html.slice(0, 100_000) + "\n[...truncated...]"
      : content.html;
    parts.push(`## Page HTML\n\`\`\`html\n${html}\n\`\`\``);
  }

  if (oldContent?.html) {
    const old = oldContent.html.length > 100_000
      ? oldContent.html.slice(0, 100_000) + "\n[...truncated...]"
      : oldContent.html;
    parts.push(`## Old Page HTML (for comparison)\n\`\`\`html\n${old}\n\`\`\``);
  }

  if (browserlessData) {
    if (browserlessData.rendered_html) {
      const rendered = String(browserlessData.rendered_html);
      const trimmed = rendered.length > 100_000
        ? rendered.slice(0, 100_000) + "\n[...truncated...]"
        : rendered;
      parts.push(`## Rendered HTML (after JS execution)\n\`\`\`html\n${trimmed}\n\`\`\``);
    }
    if (browserlessData.network_log) {
      parts.push(
        `## Network Log\n\`\`\`json\n${JSON.stringify(browserlessData.network_log, null, 2)}\n\`\`\``
      );
    }
    if (browserlessData.performance_data) {
      parts.push(
        `## Performance Data\n\`\`\`json\n${JSON.stringify(browserlessData.performance_data, null, 2)}\n\`\`\``
      );
    }
    if (
      Array.isArray(browserlessData.screenshots) &&
      browserlessData.screenshots.length > 0
    ) {
      parts.push(`## Screenshots\n[${(browserlessData.screenshots as Array<{viewport: number}>).length} screenshot(s) captured at specified viewports]`);
    }
  }

  return parts.join("\n\n") || "[No content available]";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { page_id, agent_id } = await req.json();

    if (!page_id || !agent_id) {
      return new Response(
        JSON.stringify({ error: "Missing page_id or agent_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Load page
    const { data: page, error: pageErr } = await supabase
      .from("pages")
      .select("*")
      .eq("id", page_id)
      .single();
    if (pageErr || !page) {
      return new Response(
        JSON.stringify({ error: "Page not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Load agent
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();
    if (agentErr || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Find or create agent_run
    const { data: existingRun } = await supabase
      .from("agent_runs")
      .select("id")
      .eq("page_id", page_id)
      .eq("agent_id", agent_id)
      .order("run_number", { ascending: false })
      .limit(1)
      .single();

    const runId = existingRun?.id;

    // Mark as running
    if (runId) {
      await supabase
        .from("agent_runs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          error_message: null,
          report: null,
        })
        .eq("id", runId);
    }

    try {
      // 3. Load configs
      const { data: configs } = await supabase
        .from("agent_configs")
        .select("config_key, config_value")
        .eq("agent_id", agent_id);

      // 4. Inject configs into prompt
      const systemPrompt = injectConfigs(
        agent.system_prompt || "",
        configs || []
      );

      if (!systemPrompt.trim()) {
        throw new Error("Agent has no system prompt configured");
      }

      // 5. Acquire content
      let content: { html: string; error?: string };
      let oldContent: { html: string; error?: string } | undefined;
      let browserlessData: Record<string, unknown> | undefined;

      if (agent.requires_browserless) {
        const actions =
          BROWSERLESS_ACTIONS[agent.agent_number] || ["rendered_html"];
        browserlessData = await fetchBrowserless(
          supabaseUrl,
          token,
          page.new_url,
          actions
        );
        // Also get raw HTML
        content = await fetchContent(supabaseUrl, token, page.new_url);
      } else {
        content = await fetchContent(supabaseUrl, token, page.new_url);
      }

      // Migration agents: also fetch old URL
      if (
        MIGRATION_AGENTS.includes(agent.agent_number) &&
        page.old_url
      ) {
        oldContent = await fetchContent(supabaseUrl, token, page.old_url);
      }

      // Build user message
      const userMessage = buildUserMessage(
        agent.agent_number,
        content,
        oldContent,
        browserlessData
      );

      // 6. Call Anthropic
      const model = MODEL_MAP[agent.model_tier] || MODEL_MAP.haiku;
      const report = await callAnthropic(
        anthropicKey,
        model,
        systemPrompt,
        userMessage
      );

      // 7. Compute stats
      const summaryStats = computeSummaryStats(report.checks);
      const durationMs = Date.now() - startTime;

      // Map overall_status to run_status
      const statusMap: Record<string, string> = {
        passed: "passed",
        failed: "failed",
        warning: "warning",
        error: "error",
      };
      const runStatus = statusMap[report.overall_status] || "warning";

      // 8. Store report
      if (runId) {
        await supabase
          .from("agent_runs")
          .update({
            report: report as unknown as Record<string, unknown>,
            summary_stats: summaryStats as unknown as Record<string, unknown>,
            status: runStatus,
            model_used: model,
            duration_ms: durationMs,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          run_id: runId,
          status: runStatus,
          duration_ms: durationMs,
          summary_stats: summaryStats,
          report,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const durationMs = Date.now() - startTime;
      const isTimeout =
        message.includes("abort") || message.includes("AbortError");

      const errorMsg = isTimeout ? "Agent timed out." : message;

      // Update run with error
      if (runId) {
        await supabase
          .from("agent_runs")
          .update({
            status: "error",
            error_message: errorMsg,
            duration_ms: durationMs,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }

      return new Response(
        JSON.stringify({ error: errorMsg, run_id: runId }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
