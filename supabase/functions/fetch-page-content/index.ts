import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

interface FetchResult {
  html: string;
  status_code: number;
  headers: Record<string, string>;
  response_time_ms: number;
  final_url: string;
  redirect_count: number;
  truncated: boolean;
  error?: string;
}

async function fetchWithRedirects(
  url: string
): Promise<FetchResult> {
  const start = Date.now();
  let currentUrl = url;
  let redirectCount = 0;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response: Response;

    // Manual redirect following to count hops
    while (true) {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "ZuperPreflight/1.0 (Content Acquisition)",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
      });

      if (
        [301, 302, 303, 307, 308].includes(response.status) &&
        redirectCount < MAX_REDIRECTS
      ) {
        const location = response.headers.get("location");
        if (!location) break;
        currentUrl = new URL(location, currentUrl).href;
        redirectCount++;
        // Consume the body to avoid leaks
        await response.text();
        continue;
      }
      break;
    }

    const responseTimeMs = Date.now() - start;

    // Check content type
    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain") &&
      response.status >= 200 &&
      response.status < 300
    ) {
      return {
        html: "",
        status_code: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        response_time_ms: responseTimeMs,
        final_url: currentUrl,
        redirect_count: redirectCount,
        truncated: false,
        error: `Unexpected content type: ${contentType}`,
      };
    }

    // Read body with size limit
    const reader = response.body?.getReader();
    let body = "";
    let truncated = false;
    let bytesRead = 0;

    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > MAX_BODY_BYTES) {
          body += decoder.decode(value, { stream: true });
          body = body.slice(0, MAX_BODY_BYTES);
          truncated = true;
          reader.cancel();
          break;
        }
        body += decoder.decode(value, { stream: true });
      }
    }

    return {
      html: body,
      status_code: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      response_time_ms: responseTimeMs,
      final_url: currentUrl,
      redirect_count: redirectCount,
      truncated,
    };
  } catch (err: unknown) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("abort") || message.includes("AbortError")) {
      return {
        html: "",
        status_code: 0,
        headers: {},
        response_time_ms: elapsed,
        final_url: currentUrl,
        redirect_count: redirectCount,
        truncated: false,
        error: "URL fetch timed out",
      };
    }

    if (
      message.includes("dns") ||
      message.includes("ENOTFOUND") ||
      message.includes("getaddrinfo") ||
      message.includes("resolve")
    ) {
      return {
        html: "",
        status_code: 0,
        headers: {},
        response_time_ms: elapsed,
        final_url: currentUrl,
        redirect_count: redirectCount,
        truncated: false,
        error: "Unable to resolve domain",
      };
    }

    return {
      html: "",
      status_code: 0,
      headers: {},
      response_time_ms: elapsed,
      final_url: currentUrl,
      redirect_count: redirectCount,
      truncated: false,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'url' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await fetchWithRedirects(url);

    return new Response(JSON.stringify(result), {
      status: result.error ? 422 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
