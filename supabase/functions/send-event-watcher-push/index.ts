import { createClient } from "@supabase/supabase-js";
import { sendFcm } from "../_shared/fcm.ts";
import { sendApns } from "../_shared/apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("EVENT_WATCHER_PUSH_SECRET")!;

type Body = {
  watcher_id: string;
  joiner_count_at_call: number;
  trigger_type: "immediate" | "digest";
};

function copy(trigger: "immediate" | "digest", delta: number, eventName: string): { title: string; body: string } {
  if (trigger === "immediate" && delta === 1) {
    return { title: "ravedar", body: `someone just tagged into ${eventName}` };
  }
  if (trigger === "immediate") {
    return { title: "ravedar", body: `${delta} more ravers joined ${eventName}` };
  }
  return { title: "ravedar", body: `${delta} new ravers joined ${eventName} since yesterday` };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!body.watcher_id || typeof body.joiner_count_at_call !== "number" || !body.trigger_type) {
    return new Response("bad body", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: watcher, error: wErr } = await admin
    .from("event_watchers")
    .select("id, user_id, event_name, event_date, last_notified_count, unsubscribed_at")
    .eq("id", body.watcher_id)
    .single();
  if (wErr || !watcher) return new Response("watcher not found", { status: 404 });

  if (watcher.unsubscribed_at) {
    return new Response("unsubscribed", { status: 200 });
  }
  if (watcher.event_date && new Date(watcher.event_date) < new Date(new Date().toISOString().slice(0, 10))) {
    return new Response("event passed", { status: 200 });
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("event_push_opt_out")
    .eq("id", watcher.user_id)
    .single();
  if (!profile || profile.event_push_opt_out) {
    return new Response("opted out", { status: 200 });
  }

  const delta = body.joiner_count_at_call - (watcher.last_notified_count ?? 0);
  if (delta <= 0) {
    await admin.from("push_log").insert({
      watcher_id: watcher.id,
      user_id: watcher.user_id,
      trigger_type: body.trigger_type,
      delta,
      status: "skipped_stale",
    });
    return new Response("stale", { status: 200 });
  }

  const { data: tokens } = await admin
    .from("device_tokens")
    .select("token, platform")
    .eq("user_id", watcher.user_id);

  if (!tokens || tokens.length === 0) {
    await admin.from("push_log").insert({
      watcher_id: watcher.id,
      user_id: watcher.user_id,
      trigger_type: body.trigger_type,
      delta,
      status: "skipped_no_token",
    });
    await admin
      .from("event_watchers")
      .update({
        last_notified_count: body.joiner_count_at_call,
        last_notified_at: new Date().toISOString(),
      })
      .eq("id", watcher.id);
    return new Response("no tokens", { status: 200 });
  }

  const { title, body: pushBody } = copy(body.trigger_type, delta, watcher.event_name);

  let anySent = false;
  for (const t of tokens) {
    let result: { ok: boolean; badToken?: boolean; error?: string };
    if (t.platform === "android") {
      result = await sendFcm(t.token, title, pushBody);
    } else {
      result = await sendApns(t.token, title, pushBody);
    }
    if (result.ok) {
      anySent = true;
      await admin.from("push_log").insert({
        watcher_id: watcher.id,
        user_id: watcher.user_id,
        trigger_type: body.trigger_type,
        delta,
        status: "sent",
      });
    } else {
      await admin.from("push_log").insert({
        watcher_id: watcher.id,
        user_id: watcher.user_id,
        trigger_type: body.trigger_type,
        delta,
        status: "failed",
        error: result.error,
      });
      if (result.badToken) {
        await admin.from("device_tokens").delete().eq("token", t.token);
      }
    }
  }

  if (anySent) {
    await admin
      .from("event_watchers")
      .update({
        last_notified_count: body.joiner_count_at_call,
        last_notified_at: new Date().toISOString(),
      })
      .eq("id", watcher.id);
  }

  return new Response("ok", { status: 200 });
});
