import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email_domain } = await req.json();
    if (!email_domain || typeof email_domain !== "string") {
      throw new Error("email_domain required");
    }

    // Sanitize: only keep the domain part, no full email
    const domain = email_domain.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await adminClient.from("audit_log").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action_type: "signup_rejected",
      entity_type: "user",
      entity_id: null,
      details: { email_domain: domain, reason: "Non-zuper.co self-registration attempt" },
    });

    return new Response(JSON.stringify({ logged: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("log-signup-rejection error:", e);
    return new Response(JSON.stringify({ error: "Failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
