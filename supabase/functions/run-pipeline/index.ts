import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STAGES = [
  { number: 1, agents: [1, 2, 3, 4] },
  { number: 2, agents: [5, 6, 7] },
  { number: 3, agents: [8, 9] },
  { number: 4, agents: [10, 11] },
  { number: 5, agents: [12, 13, 14] },
  { number: 6, agents: [15] },
];

interface GateWarning {
  stage_number: number;
  failed_agents: Array<{ agent_number: number; name: string; status: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { page_id, scope = "all", stage_number, override_gates = [] } = await req.json();

    if (!page_id) {
      return new Response(
        JSON.stringify({ error: "Missing page_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load page
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

    // Check for concurrent pipeline
    const { data: runningRuns } = await supabase
      .from("agent_runs")
      .select("id")
      .eq("page_id", page_id)
      .in("status", ["running", "queued"])
      .limit(1);

    if (runningRuns && runningRuns.length > 0) {
      return new Response(
        JSON.stringify({ error: "QA is already running for this page." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load all agents
    const { data: agents } = await supabase
      .from("agents")
      .select("id, agent_number, name, stage_number, sort_order, is_active, is_blocking, migration_only")
      .eq("is_active", true)
      .order("stage_number")
      .order("sort_order");

    if (!agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active agents found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load existing runs
    const { data: existingRuns } = await supabase
      .from("agent_runs")
      .select("id, agent_id, status")
      .eq("page_id", page_id);

    const runsByAgentId = new Map<string, { id: string; status: string }>();
    existingRuns?.forEach((r) => runsByAgentId.set(r.agent_id, r));

    // Filter agents based on scope
    let agentsToRun = agents.filter((a) => {
      // Skip migration-only agents for ongoing pages
      if (a.migration_only && page.mode === "ongoing") return false;
      return true;
    });

    if (scope === "stage" && stage_number) {
      agentsToRun = agentsToRun.filter((a) => a.stage_number === stage_number);
    } else if (scope === "failed") {
      agentsToRun = agentsToRun.filter((a) => {
        const run = runsByAgentId.get(a.id);
        return run && (run.status === "failed" || run.status === "error");
      });
    } else {
      // "all" — skip agents already marked as skipped
      agentsToRun = agentsToRun.filter((a) => {
        const run = runsByAgentId.get(a.id);
        return !run || run.status !== "skipped";
      });
    }

    if (agentsToRun.length === 0) {
      return new Response(
        JSON.stringify({ error: "No agents to run for this scope" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark page as in_progress
    await supabase
      .from("pages")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", page_id);

    // Mark all agents-to-run as queued
    for (const agent of agentsToRun) {
      const existing = runsByAgentId.get(agent.id);
      if (existing) {
        await supabase
          .from("agent_runs")
          .update({ status: "queued", error_message: null })
          .eq("id", existing.id);
      }
    }

    // Execute sequentially
    const results: Array<{ agent_number: number; status: string; duration_ms?: number }> = [];
    const gateWarnings: GateWarning[] = [];
    const overrideSet = new Set(override_gates as number[]);

    for (const agent of agentsToRun) {
      // Soft gate check: if this agent's stage > 1, check prior stages
      if (agent.stage_number > 1 && scope !== "stage") {
        const priorStages = STAGES.filter((s) => s.number < agent.stage_number);
        const failedInPrior: GateWarning["failed_agents"] = [];

        for (const ps of priorStages) {
          for (const agentNum of ps.agents) {
            const priorAgent = agents.find((a) => a.agent_number === agentNum);
            if (!priorAgent || !priorAgent.is_blocking) continue;

            const priorRun = runsByAgentId.get(priorAgent.id);
            // Also check results we just completed
            const justRan = results.find((r) => r.agent_number === agentNum);
            const status = justRan?.status || priorRun?.status;

            if (status === "failed" || status === "error") {
              failedInPrior.push({
                agent_number: agentNum,
                name: priorAgent.name,
                status: status || "failed",
              });
            }
          }
        }

        if (failedInPrior.length > 0 && !overrideSet.has(agent.stage_number)) {
          // Return gate warning — client must re-call with override
          gateWarnings.push({
            stage_number: agent.stage_number,
            failed_agents: failedInPrior,
          });

          // Skip remaining agents in this and later stages
          // Mark them back to not_started
          const remainingAgents = agentsToRun.filter(
            (a) => a.stage_number >= agent.stage_number
          );
          for (const ra of remainingAgents) {
            const existing = runsByAgentId.get(ra.id);
            if (existing) {
              await supabase
                .from("agent_runs")
                .update({ status: "not_started" })
                .eq("id", existing.id);
            }
          }
          break;
        }

        // If overridden, log to audit_log
        if (failedInPrior.length > 0 && overrideSet.has(agent.stage_number)) {
          await supabase.from("audit_log").insert({
            user_id: user.id,
            action_type: "gate_override",
            entity_type: "page",
            entity_id: page_id,
            details: {
              stage_number: agent.stage_number,
              failed_agents: failedInPrior,
            },
          });
        }
      }

      // Call run-agent
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/run-agent`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ page_id, agent_id: agent.id }),
        });

        const result = await res.json();
        const status = result.status || (res.ok ? "passed" : "error");

        results.push({
          agent_number: agent.agent_number,
          status,
          duration_ms: result.duration_ms,
        });

        // Update our local tracking
        const existing = runsByAgentId.get(agent.id);
        if (existing) {
          existing.status = status;
        }
      } catch (err) {
        results.push({
          agent_number: agent.agent_number,
          status: "error",
        });

        const existing = runsByAgentId.get(agent.id);
        if (existing) {
          existing.status = "error";
          await supabase
            .from("agent_runs")
            .update({
              status: "error",
              error_message: err instanceof Error ? err.message : "Unknown error",
              completed_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        }
      }
    }

    // Recalculate page status (only if no gate warnings stopped us)
    if (gateWarnings.length === 0) {
      // Reload all runs to get final state
      const { data: finalRuns } = await supabase
        .from("agent_runs")
        .select("status, agents!agent_runs_agent_id_fkey(is_blocking)")
        .eq("page_id", page_id);

      let pageStatus: string = "passed";

      if (finalRuns) {
        const blockingRuns = finalRuns.filter(
          (r) => (r.agents as unknown as { is_blocking: boolean })?.is_blocking
        );
        const anyRunning = finalRuns.some(
          (r) => r.status === "running" || r.status === "queued"
        );
        const anyBlockingFailed = blockingRuns.some(
          (r) => r.status === "failed" || r.status === "error"
        );
        const anyWarning = finalRuns.some((r) => r.status === "warning");

        if (anyRunning) {
          pageStatus = "in_progress";
        } else if (anyBlockingFailed) {
          pageStatus = "failed";
        } else if (anyWarning) {
          pageStatus = "passed_with_warnings";
        }
      }

      await supabase
        .from("pages")
        .update({ status: pageStatus, updated_at: new Date().toISOString() })
        .eq("id", page_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        gate_warnings: gateWarnings,
        total_agents: agentsToRun.length,
        completed: results.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
