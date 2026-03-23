import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const anthropic = !!Deno.env.get("ANTHROPIC_API_KEY");
  const browserless = !!Deno.env.get("BROWSERLESS_API_KEY");

  return new Response(JSON.stringify({ anthropic, browserless }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
