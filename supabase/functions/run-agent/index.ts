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

// Agents that need class attributes preserved during HTML cleaning
const PRESERVE_CLASSES_AGENTS = [9, 14];

// Tracking script patterns to preserve during cleaning
const TRACKING_SCRIPT_PATTERNS = [
  "gtm", "dataLayer", "pys", "PixelYourSite", "pixelyoursite",
  "hsq", "hs-scripts", "ld+json", "application/ld+json",
];

/**
 * Clean raw HTML to reduce token usage while preserving content signals.
 * Strips CSS, most scripts, comments, SVGs, data-* attrs, and whitespace.
 */
function cleanHtmlForAgent(rawHtml: string, preserveClasses = false): string {
  let html = rawHtml;

  // 1. Remove all <style> tags and contents
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 2. Remove <script> tags EXCEPT tracking/structured data scripts
  html = html.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
    const lower = match.toLowerCase();
    for (const pattern of TRACKING_SCRIPT_PATTERNS) {
      if (lower.includes(pattern)) return match;
    }
    return "";
  });

  // 3. Remove HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // 4. Remove <link rel="stylesheet"> tags
  html = html.replace(/<link\s[^>]*rel\s*=\s*["']stylesheet["'][^>]*\/?>/gi, "");

  // 5. Remove all <svg> blocks
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, "");

  // 6. Remove all data-* attributes
  html = html.replace(/\s+data-[a-z0-9_-]+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\s+data-[a-z0-9_-]+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/\s+data-[a-z0-9_-]+(?=[\s>])/gi, "");

  // 7. Remove class attributes (unless preserveClasses)
  if (!preserveClasses) {
    html = html.replace(/\s+class\s*=\s*"[^"]*"/gi, "");
    html = html.replace(/\s+class\s*=\s*'[^']*'/gi, "");
  }

  // 8. Collapse whitespace
  html = html.replace(/\s{2,}/g, " ");

  // 9. Middle-truncate if still over 120K chars
  const MAX_CHARS = 120_000;
  if (html.length > MAX_CHARS) {
    const half = MAX_CHARS / 2;
    html = html.slice(0, half) + "\n[... HTML truncated for length ...]\n" + html.slice(-half);
  }

  return html;
}

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
  retryStrict = false,
  rateLimitRetries = 0
): Promise<{ report: AgentReport; rateLimitRemaining?: number }> {
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

    // Log rate limit headers on every response
    const rlRemaining = res.headers.get("x-ratelimit-remaining-requests");
    const rlLimit = res.headers.get("x-ratelimit-limit-requests");
    const rlReset = res.headers.get("x-ratelimit-reset-requests");
    const retryAfter = res.headers.get("retry-after");
    console.log("Anthropic rate limits:", {
      remaining: rlRemaining,
      limit: rlLimit,
      reset: rlReset,
      retryAfter,
      status: res.status,
    });

    // Handle rate limiting with up to 3 retries using adaptive backoff
    if (res.status === 429) {
      if (rateLimitRetries < 3) {
        // Use retry-after header if present, otherwise exponential backoff with jitter
        let delayMs: number;
        if (retryAfter) {
          delayMs = Math.max(parseInt(retryAfter, 10) * 1000, 5000);
        } else {
          delayMs = Math.min(
            20_000 * Math.pow(2, rateLimitRetries) + Math.random() * 5000,
            90_000
          );
        }
        console.log(`Rate limited (429). Retry ${rateLimitRetries + 1}/3 after ${Math.round(delayMs / 1000)}s`);
        await new Promise((r) => setTimeout(r, delayMs));
        return callAnthropic(apiKey, model, systemPrompt, userMessage, retryStrict, rateLimitRetries + 1);
      }
      throw new Error("Anthropic API rate limited after 3 retries");
    }

    if (!res.ok) {
      const errText = await res.text();

      let providerMessage = errText;
      try {
        const parsed = JSON.parse(errText);
        providerMessage =
          parsed?.error?.message ||
          parsed?.message ||
          errText;
      } catch {
        // Keep raw text when provider response isn't JSON
      }

      throw new Error(
        `Anthropic API error [${res.status}]: ${providerMessage}`
      );
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
      return {
        report,
        rateLimitRemaining: rlRemaining ? parseInt(rlRemaining, 10) : undefined,
      };
    } catch (parseErr) {
      if (!retryStrict) {
        // Retry with stricter prompt (keep same rateLimitRetries count)
        return callAnthropic(apiKey, model, systemPrompt, userMessage, true, rateLimitRetries);
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

/**
 * Recalculate page status from LATEST run per agent only.
 */
async function recalcPageStatus(
  sb: ReturnType<typeof createClient>,
  pageId: string
): Promise<string> {
  const { data: allRuns } = await sb
    .from("agent_runs")
    .select("agent_id, run_number, status, agents!agent_runs_agent_id_fkey(is_blocking)")
    .eq("page_id", pageId)
    .order("run_number", { ascending: false });

  if (!allRuns || allRuns.length === 0) return "pending";

  const latestByAgent = new Map<string, { status: string; is_blocking: boolean }>();
  for (const r of allRuns) {
    if (!latestByAgent.has(r.agent_id)) {
      latestByAgent.set(r.agent_id, {
        status: r.status,
        is_blocking: (r.agents as unknown as { is_blocking: boolean })?.is_blocking ?? false,
      });
    }
  }

  const runs = Array.from(latestByAgent.values());
  const active = runs.filter((r) => r.status !== "skipped");
  if (active.length === 0) return "pending";

  if (active.some((r) => r.status === "running" || r.status === "queued")) return "in_progress";
  if (active.some((r) => r.is_blocking && (r.status === "failed" || r.status === "error"))) return "failed";
  if (active.some((r) => r.status === "warning")) return "passed_with_warnings";
  return "passed";
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

    const { page_id, agent_id, recalculate_page_status = false } = await req.json();

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
    // Look for a pre-created "queued" run (from pipeline), otherwise create a new one
    let runId: string | undefined;

    const { data: queuedRun } = await supabase
      .from("agent_runs")
      .select("id")
      .eq("page_id", page_id)
      .eq("agent_id", agent_id)
      .eq("status", "queued")
      .order("run_number", { ascending: false })
      .limit(1)
      .single();

    if (queuedRun) {
      runId = queuedRun.id;
    } else {
      // Find max run_number for this page+agent
      const { data: latestRun } = await supabase
        .from("agent_runs")
        .select("run_number")
        .eq("page_id", page_id)
        .eq("agent_id", agent_id)
        .order("run_number", { ascending: false })
        .limit(1)
        .single();

      const nextRunNumber = (latestRun?.run_number ?? 0) + 1;

      // Create new run row
      const { data: newRun, error: newRunErr } = await supabase
        .from("agent_runs")
        .insert({
          page_id,
          agent_id,
          run_number: nextRunNumber,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (newRunErr || !newRun) {
        return new Response(
          JSON.stringify({ error: "Failed to create agent run" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      runId = newRun.id;
    }

    // Mark as running
    if (runId && queuedRun) {
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
      const shouldPreserveClasses = PRESERVE_CLASSES_AGENTS.includes(agent.agent_number);

      if (agent.requires_browserless) {
        const actions =
          BROWSERLESS_ACTIONS[agent.agent_number] || ["rendered_html"];
        browserlessData = await fetchBrowserless(
          supabaseUrl,
          token,
          page.new_url,
          actions
        );
        // Also get raw HTML (cleaned)
        content = await fetchContent(supabaseUrl, token, page.new_url);
      } else {
        content = await fetchContent(supabaseUrl, token, page.new_url);
      }

      // Clean raw HTML for non-browserless content
      if (content.html) {
        const beforeLen = content.html.length;
        content.html = cleanHtmlForAgent(content.html, shouldPreserveClasses);
        console.log(`HTML cleaned: ${beforeLen.toLocaleString()} → ${content.html.length.toLocaleString()} chars (agent ${agent.agent_number})`);
      }

      // Migration agents: also fetch old URL
      if (
        MIGRATION_AGENTS.includes(agent.agent_number) &&
        page.old_url
      ) {
        oldContent = await fetchContent(supabaseUrl, token, page.old_url);
        if (oldContent?.html) {
          const beforeLen = oldContent.html.length;
          oldContent.html = cleanHtmlForAgent(oldContent.html, shouldPreserveClasses);
          console.log(`Old HTML cleaned: ${beforeLen.toLocaleString()} → ${oldContent.html.length.toLocaleString()} chars`);
        }
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

      // 9. Recalculate page status if requested (single agent re-run)
      let pageStatus: string | undefined;
      if (recalculate_page_status) {
        pageStatus = await recalcPageStatus(supabase, page_id);
        await supabase
          .from("pages")
          .update({ status: pageStatus, updated_at: new Date().toISOString() })
          .eq("id", page_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          run_id: runId,
          status: runStatus,
          duration_ms: durationMs,
          summary_stats: summaryStats,
          report,
          page_status: pageStatus,
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
      const isLowCredits = /credit balance is too low/i.test(message);
      const isBrowserlessQuota = /quota exceeded|browser service quota/i.test(message);

      const errorMsg = isTimeout
        ? "Agent timed out."
        : isLowCredits
        ? "AI provider credits are too low. Please top up billing and retry."
        : isBrowserlessQuota
        ? "Browser service quota exceeded. Please check your Browserless.io billing."
        : message;
      const errorCode = isLowCredits
        ? "anthropic_low_credits"
        : isBrowserlessQuota
        ? "browserless_quota_exceeded"
        : null;
      const statusCode = isLowCredits ? 402 : isBrowserlessQuota ? 429 : 422;

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

      // Recalculate page status if requested
      let pageStatus: string | undefined;
      if (recalculate_page_status) {
        pageStatus = await recalcPageStatus(supabase, page_id);
        await supabase
          .from("pages")
          .update({ status: pageStatus, updated_at: new Date().toISOString() })
          .eq("id", page_id);
      }

      return new Response(
        JSON.stringify({
          error: errorMsg,
          error_code: errorCode,
          run_id: runId,
          page_status: pageStatus,
        }),
        {
          status: statusCode,
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
