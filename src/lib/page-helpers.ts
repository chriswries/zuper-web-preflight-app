import { supabase } from "@/integrations/supabase/client";

/** Derive a slug from a URL path */
export function deriveSlug(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/|\/$/g, "");
    return path || parsed.hostname.replace(/\./g, "-");
  } catch {
    return "";
  }
}

/** Validate URL format */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Migration-only agent numbers (skipped when no old_url) */
const MIGRATION_ONLY_AGENTS = [1, 4];

interface CreatePageParams {
  newUrl: string;
  oldUrl?: string | null;
  slug?: string | null;
  targetKeyword?: string | null;
  figmaCompPath?: string | null;
  createdBy: string;
  pipelineProfile?: "full" | "blog";
}

/**
 * Creates a page + 15 agent_runs.
 * Returns the new page id or throws.
 */
export async function createPageWithRuns(params: CreatePageParams): Promise<string> {
  const isMigration = !!params.oldUrl;
  const profile = params.pipelineProfile ?? "full";

  // 1. Insert the page
  const { data: page, error: pageError } = await supabase
    .from("pages")
    .insert({
      new_url: params.newUrl,
      old_url: params.oldUrl || null,
      slug: params.slug || null,
      target_keyword: params.targetKeyword || null,
      figma_comp_path: params.figmaCompPath || null,
      mode: isMigration ? "migration" : "ongoing",
      pipeline_profile: profile,
      status: "pending",
      created_by: params.createdBy,
    } as any)
    .select("id")
    .single();

  if (pageError || !page) throw new Error(pageError?.message ?? "Failed to create page");

  // 2. Fetch all agents
  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id, agent_number, migration_only, skip_in_blog_mode")
    .order("agent_number");

  if (agentsError || !agents) throw new Error(agentsError?.message ?? "Failed to fetch agents");

  // 3. Create agent_runs
  const runs = agents.map((agent) => {
    const isMigrationOnlySkipped = !isMigration && MIGRATION_ONLY_AGENTS.includes(agent.agent_number);
    const isBlogSkipped = profile === "blog" && (agent as any).skip_in_blog_mode;
    return {
      page_id: page.id,
      agent_id: agent.id,
      run_number: 1,
      status: (isMigrationOnlySkipped || isBlogSkipped ? "skipped" : "not_started") as "skipped" | "not_started",
    };
  });

  const { error: runsError } = await supabase.from("agent_runs").insert(runs);
  if (runsError) throw new Error(runsError.message);

  return page.id;
}

/**
 * Check if a URL already exists in non-archived pages.
 * Returns the existing page if found.
 */
export async function checkDuplicateUrl(newUrl: string) {
  const { data } = await supabase
    .from("pages")
    .select("id, new_url, slug, status")
    .eq("new_url", newUrl)
    .neq("status", "archived")
    .limit(1);

  return data?.[0] ?? null;
}
