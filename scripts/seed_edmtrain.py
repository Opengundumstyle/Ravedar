import requests
from supabase import create_client, Client
import time

# === CONFIG ===

SUPABASE_URL = "https://fqrurhyllovbfkhlbymi.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxcnVyaHlsbG92YmZraGxieW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2NjM0MzgsImV4cCI6MjA2NDIzOTQzOH0.bgIYi-RwfIUqSbz9WPHbBqGAmCYRgwQfCx0aTitJjuw"
EDMTRAIN_API_KEY = "aed102b9-cf71-4afb-b768-e0eeff04a143"

TARGET_CITIES = [
    "san-francisco", "los-angeles", "new-york-city", "miami",
    "chicago", "denver", "seattle", "austin", "orlando", "phoenix"
]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# === HELPERS ===

def insert_artist(artist_name, artist_link=None, edmtrain_id=None):
    existing = supabase.table("artists").select("id").eq("name", artist_name).execute()
    if existing.data:
        return existing.data[0]['id']
    result = supabase.table("artists").insert({
        "name": artist_name,
        "link": artist_link,
        "edmtrain_id": edmtrain_id,
        "slug": artist_name.lower().replace(" ", "-")
    }).execute()
    return result.data[0]['id']

def insert_event(event):
    venue = event.get("venue", {})
    return supabase.table("events").insert({
        "name": event.get("name") or "Unnamed Event",
        "city": venue.get("location") or "Unknown",
        "venue": venue.get("name"),
        "date": event.get("date"),
        "edmtrain_id": event.get("id"),
        "link": event.get("link"),
        "ticket_link": event.get("ticketLink"),
        "address": venue.get("address")
    }).execute().data[0]['id']

def insert_event_artist(event_id, artist_id):
    supabase.table("event_artists").insert({
        "event_id": event_id,
        "artist_id": artist_id
    }).execute()

# === MAIN LOOP ===

for city in TARGET_CITIES:
    print(f"📦 Fetching events for {city}...")
    response = requests.get("https://edmtrain.com/api/events", params={
        "location": city,
        "client": EDMTRAIN_API_KEY
    })

    if response.status_code != 200:
        print(f"❌ Error {response.status_code} for {city}")
        continue

    events = response.json().get("data", [])
    for event in events:
        try:
            event_id = insert_event(event)
        except Exception as e:
            print(f"⚠️ Skipping event insert: {e}")
            continue

        for artist in event.get("artistList", []):
            name = artist.get("name")
            if not name:
                continue
            try:
                artist_id = insert_artist(name, artist.get("link"), artist.get("id"))
                insert_event_artist(event_id, artist_id)
            except Exception as e:
                print(f"⚠️ Error adding artist '{name}': {e}")

    time.sleep(1)  # Rate limit

print("✅ Seeding complete.")
