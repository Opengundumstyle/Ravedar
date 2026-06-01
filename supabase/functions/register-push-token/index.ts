import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cors(origin: string | null): HeadersInit {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors(req.headers.get("origin")) });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("unauthorized", { status: 401, headers: cors(req.headers.get("origin")) });
  }
  const jwt = authHeader.slice("Bearer ".length);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userResp, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userResp?.user) {
    return new Response("unauthorized", { status: 401, headers: cors(req.headers.get("origin")) });
  }
  const userId = userResp.user.id;

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400, headers: cors(req.headers.get("origin")) });
  }

  const token = (body.token ?? "").trim();
  const platform = (body.platform ?? "").trim();
  if (!token || (platform !== "ios" && platform !== "android")) {
    return new Response("bad token or platform", { status: 400, headers: cors(req.headers.get("origin")) });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error: upsertErr } = await admin
    .from("device_tokens")
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: "token" }
    );
  if (upsertErr) {
    return new Response(`upsert failed: ${upsertErr.message}`, { status: 500, headers: cors(req.headers.get("origin")) });
  }
  return new Response("ok", { status: 200, headers: cors(req.headers.get("origin")) });
});
