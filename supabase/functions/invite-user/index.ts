import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Admin only");

    const { email, role } = await req.json();
    if (!email) throw new Error("Email required");

    // Invite user via Supabase Auth
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { display_name: email.split("@")[0] },
    });
    if (inviteError) throw inviteError;

    const newUserId = inviteData.user.id;

    // Ensure user row exists
    await adminClient.from("users").upsert({
      id: newUserId,
      email,
      display_name: email.split("@")[0],
      is_active: true,
    }, { onConflict: "id" });

    // Assign role
    const assignRole = role === "admin" ? "admin" : "operator";
    await adminClient.from("user_roles").upsert({
      user_id: newUserId,
      role: assignRole,
    }, { onConflict: "user_id,role" });

    // Audit log
    await adminClient.from("audit_log").insert({
      user_id: user.id,
      action_type: "invite_user",
      entity_type: "user",
      entity_id: newUserId,
      details: { email, role: assignRole },
    });

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invite-user error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
