import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BROWSERLESS_TIMEOUT_MS = 30_000;

interface BrowserlessInput {
  url: string;
  actions: string[];
  viewport_width?: number;
  interact_script?: string;
}

interface BrowserlessResult {
  screenshots: { viewport: number; image_base64: string }[];
  rendered_html: string | null;
  network_log: unknown[] | null;
  performance_data: Record<string, unknown> | null;
  interaction_results: unknown[] | null;
  error?: string;
}

async function callBrowserless(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROWSERLESS_TIMEOUT_MS);

  try {
    const res = await fetch(`https://chrome.browserless.io${endpoint}?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function takeScreenshot(
  apiKey: string,
  url: string,
  viewportWidth: number
): Promise<string> {
  const res = await callBrowserless(apiKey, "/screenshot", {
    url,
    options: {
      type: "png",
      fullPage: true,
    },
    viewport: {
      width: viewportWidth,
      height: 900,
      deviceScaleFactor: 1,
    },
    gotoOptions: {
      waitUntil: "networkidle2",
      timeout: 20_000,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Screenshot failed [${res.status}]: ${text}`);
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function getRenderedHtml(
  apiKey: string,
  url: string
): Promise<string> {
  const res = await callBrowserless(apiKey, "/content", {
    url,
    gotoOptions: {
      waitUntil: "networkidle2",
      timeout: 20_000,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Content fetch failed [${res.status}]: ${text}`);
  }

  return await res.text();
}

async function getNetworkLog(
  apiKey: string,
  url: string
): Promise<unknown[]> {
  const functionBody = `
    module.exports = async ({ page }) => {
      const requests = [];
      page.on('request', req => {
        requests.push({
          url: req.url(),
          method: req.method(),
          resourceType: req.resourceType(),
        });
      });
      page.on('response', res => {
        const idx = requests.findIndex(r => r.url === res.url());
        if (idx >= 0) {
          requests[idx].status = res.status();
          requests[idx].contentType = res.headers()['content-type'] || null;
        }
      });
      await page.goto('${url}', { waitUntil: 'networkidle2', timeout: 20000 });
      return requests;
    };
  `;

  const res = await callBrowserless(apiKey, "/function", {
    code: functionBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Network log failed [${res.status}]: ${text}`);
  }

  return await res.json();
}

async function getPerformanceData(
  apiKey: string,
  url: string
): Promise<Record<string, unknown>> {
  const functionBody = `
    module.exports = async ({ page }) => {
      await page.goto('${url}', { waitUntil: 'networkidle2', timeout: 20000 });
      const performanceData = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        return {
          navigation: nav ? nav.toJSON() : null,
          paint: paint.map(p => p.toJSON()),
          timing: performance.timing ? JSON.parse(JSON.stringify(performance.timing)) : null,
        };
      });
      return performanceData;
    };
  `;

  const res = await callBrowserless(apiKey, "/function", {
    code: functionBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Performance data failed [${res.status}]: ${text}`);
  }

  return await res.json();
}

async function runInteraction(
  apiKey: string,
  url: string,
  script: string
): Promise<unknown[]> {
  const res = await callBrowserless(apiKey, "/function", {
    code: script,
    context: { url },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Interaction failed [${res.status}]: ${text}`);
  }

  const result = await res.json();
  return Array.isArray(result) ? result : [result];
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

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("BROWSERLESS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Browserless not configured." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const input: BrowserlessInput = await req.json();

    if (!input.url || typeof input.url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'url' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(input.actions) || input.actions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty 'actions' array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result: BrowserlessResult = {
      screenshots: [],
      rendered_html: null,
      network_log: null,
      performance_data: null,
      interaction_results: null,
    };

    const viewportWidth = input.viewport_width || 1440;

    for (const action of input.actions) {
      try {
        switch (action) {
          case "screenshot":
            result.screenshots.push({
              viewport: viewportWidth,
              image_base64: await takeScreenshot(apiKey, input.url, viewportWidth),
            });
            break;
          case "rendered_html":
            result.rendered_html = await getRenderedHtml(apiKey, input.url);
            break;
          case "network_log":
            result.network_log = await getNetworkLog(apiKey, input.url);
            break;
          case "performance_data":
            result.performance_data = await getPerformanceData(apiKey, input.url);
            break;
          case "interact":
            if (!input.interact_script) {
              throw new Error("Missing 'interact_script' for interact action");
            }
            result.interaction_results = await runInteraction(
              apiKey,
              input.url,
              input.interact_script
            );
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes("abort") || msg.includes("AbortError")) {
          return new Response(
            JSON.stringify({ ...result, error: "Browser rendering timed out" }),
            { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
          return new Response(
            JSON.stringify({ ...result, error: "Browser service quota exceeded. Contact admin." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
          return new Response(
            JSON.stringify({ ...result, error: "Browser service unavailable" }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ ...result, error: msg }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
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
