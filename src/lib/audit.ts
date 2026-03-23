import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export async function logAudit(params: {
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("audit_log").insert([{
    user_id: user.id,
    action_type: params.action_type,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    before_state: (params.before_state ?? null) as Json,
    after_state: (params.after_state ?? null) as Json,
    details: (params.details ?? null) as Json,
  }]);
}
