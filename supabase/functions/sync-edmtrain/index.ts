import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

const TARGET_CITIES = [
  "san-francisco", "los-angeles", "new-york-city", "miami",
  "chicago", "denver", "seattle", "austin", "orlando", "phoenix",
];

type EdmtrainArtist = { id: number; name: string; link?: string | null };
type EdmtrainVenue = { name?: string | null; location?: string | null; address?: string | null };
type EdmtrainEvent = {
  id: number;
  name?: string | null;
  date: string;
  link?: string | null;
  ticketLink?: string | null;
  venue?: EdmtrainVenue | null;
  artistList?: EdmtrainArtist[] | null;
};

type CitySummary = { events: number; artists: number; links: number; skipped: number; error?: string };

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function syncCity(supabase: SupabaseClient, city: string, edmtrainKey: string): Promise<CitySummary> {
  const url = `https://edmtrain.com/api/events?location=${encodeURIComponent(city)}&client=${edmtrainKey}`;
  const res = await fetch(url);
  if (!res.ok) return { events: 0, artists: 0, links: 0, skipped: 0, error: `edmtrain HTTP ${res.status}` };

  const payload = await res.json();
  const events: EdmtrainEvent[] = payload?.data ?? [];
  if (events.length === 0) return { events: 0, artists: 0, links: 0, skipped: 0 };

  // 1. Collect unique artists across this city, upsert in one batch.
  const artistByEdmId = new Map<number, EdmtrainArtist>();
  for (const ev of events) {
    for (const a of ev.artistList ?? []) {
      if (a?.id != null && a?.name) artistByEdmId.set(a.id, a);
    }
  }

  const artistRows = [...artistByEdmId.values()].map((a) => ({
    name: a.name,
    link: a.link ?? null,
    edmtrain_id: a.id,
    slug: slugify(a.name),
  }));

  // Chunk size keeps each upsert under the worker's CPU/memory budget — a
  // single large upsert with .select() returning every row can blow the
  // 256MB / wall-clock limits even for one city.
  const BATCH = 200;

  const artistIdMap = new Map<number, string>();
  for (let i = 0; i < artistRows.length; i += BATCH) {
    const slice = artistRows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("artists")
      .upsert(slice, { onConflict: "edmtrain_id" })
      .select("id, edmtrain_id");
    if (error) return { events: 0, artists: 0, links: 0, skipped: 0, error: `artists upsert: ${error.message}` };
    for (const row of data ?? []) {
      if (row.edmtrain_id != null) artistIdMap.set(row.edmtrain_id, row.id);
    }
  }

  // 2. Upsert events in chunks.
  const eventRows = events.map((ev) => ({
    name: ev.name?.trim() || `Event on ${ev.date}`,
    city: ev.venue?.location || "Unknown",
    venue: ev.venue?.name ?? null,
    date: ev.date,
    edmtrain_id: ev.id,
    link: ev.link ?? "",
    ticket_link: ev.ticketLink ?? null,
    address: ev.venue?.address ?? null,
  }));

  const eventIdMap = new Map<number, string>();
  for (let i = 0; i < eventRows.length; i += BATCH) {
    const slice = eventRows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("events")
      .upsert(slice, { onConflict: "edmtrain_id" })
      .select("id, edmtrain_id");
    if (error) return { events: 0, artists: artistRows.length, links: 0, skipped: 0, error: `events upsert: ${error.message}` };
    for (const row of data ?? []) {
      if (row.edmtrain_id != null) eventIdMap.set(row.edmtrain_id, row.id);
    }
  }

  // 3. Build event_artists links and upsert in chunks.
  const links: { event_id: string; artist_id: string }[] = [];
  let skipped = 0;
  for (const ev of events) {
    const eventId = eventIdMap.get(ev.id);
    if (!eventId) { skipped++; continue; }
    for (const a of ev.artistList ?? []) {
      const artistId = artistIdMap.get(a.id);
      if (!artistId) { skipped++; continue; }
      links.push({ event_id: eventId, artist_id: artistId });
    }
  }

  let linksWritten = 0;
  for (let i = 0; i < links.length; i += BATCH) {
    const slice = links.slice(i, i + BATCH);
    const { error: linkErr, count } = await supabase
      .from("event_artists")
      .upsert(slice, { onConflict: "event_id,artist_id", ignoreDuplicates: true, count: "exact" });
    if (linkErr) return { events: events.length, artists: artistRows.length, links: linksWritten, skipped, error: `event_artists upsert: ${linkErr.message}` };
    linksWritten += count ?? slice.length;
  }

  return { events: events.length, artists: artistRows.length, links: linksWritten, skipped };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const edmtrainKey = Deno.env.get("EDMTRAIN_API_KEY");
  if (!supabaseUrl || !serviceKey) return new Response(JSON.stringify({ ok: false, error: "missing supabase env" }), { status: 500 });
  if (!edmtrainKey) return new Response(JSON.stringify({ ok: false, error: "missing EDMTRAIN_API_KEY" }), { status: 500 });

  // Single-city mode (used by the weekly cron loop). Falls back to all
  // cities if no ?city is given, but processing all 10 in one invocation
  // exceeds the worker's memory/CPU budget.
  const url = new URL(req.url);
  const cityParam = url.searchParams.get("city");
  const cities = cityParam ? [cityParam] : TARGET_CITIES;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();
  const summary: Record<string, CitySummary> = {};
  let totalEvents = 0, totalArtists = 0, totalLinks = 0;

  for (const city of cities) {
    try {
      const s = await syncCity(supabase, city, edmtrainKey);
      summary[city] = s;
      totalEvents += s.events;
      totalArtists += s.artists;
      totalLinks += s.links;
      console.log(`[${city}] events=${s.events} artists=${s.artists} links=${s.links}${s.error ? ` error=${s.error}` : ""}`);
    } catch (e) {
      summary[city] = { events: 0, artists: 0, links: 0, skipped: 0, error: String((e as Error)?.message ?? e) };
      console.error(`[${city}] threw`, e);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, startedAt, finishedAt: new Date().toISOString(), totalEvents, totalArtists, totalLinks, summary }, null, 2),
    { headers: { "content-type": "application/json" } },
  );
});
