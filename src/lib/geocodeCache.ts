// Persistent geocode cache for Nominatim lookups.
// Reduces map-pin load time across page visits by avoiding repeat geocoding
// of the same addresses (Nominatim rate-limited to ~1 req/sec).

type Coords = { lat: number; lng: number };
type Entry = Coords | null;

const LS_KEY = "geocode_cache_v1";
const MAX_ENTRIES = 2000;

const memCache = new Map<string, Entry>();
let loaded = false;

function loadFromStorage() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, Entry>;
    for (const [k, v] of Object.entries(obj)) memCache.set(k, v);
  } catch { /* ignore */ }
}

let saveTimer: number | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    try {
      // Trim if too large
      let entries = Array.from(memCache.entries());
      if (entries.length > MAX_ENTRIES) {
        entries = entries.slice(entries.length - MAX_ENTRIES);
      }
      const obj: Record<string, Entry> = {};
      for (const [k, v] of entries) obj[k] = v;
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch { /* quota or private mode – ignore */ }
  }, 800);
}

export function getCachedCoords(address: string): Entry | undefined {
  loadFromStorage();
  const key = address.trim().toLowerCase();
  if (!key) return null;
  return memCache.has(key) ? memCache.get(key)! : undefined;
}

export function setCachedCoords(address: string, coords: Entry) {
  loadFromStorage();
  const key = address.trim().toLowerCase();
  if (!key) return;
  memCache.set(key, coords);
  scheduleSave();
}

// Serialise Nominatim calls globally with a per-call min interval.
let queue: Promise<unknown> = Promise.resolve();
const MIN_INTERVAL_MS = 600; // gentler than 1.1s, still polite

export async function geocodeAddress(address: string): Promise<Entry> {
  const cached = getCachedCoords(address);
  if (cached !== undefined) return cached;

  const run = async (): Promise<Entry> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&limit=1&q=${encodeURIComponent(address)}`,
        { headers: { "Accept-Language": "de" } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.[0]) {
          const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          setCachedCoords(address, coords);
          await new Promise(r => setTimeout(r, MIN_INTERVAL_MS));
          return coords;
        }
      }
    } catch { /* ignore */ }
    setCachedCoords(address, null);
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS));
    return null;
  };

  // Chain so only one request is in flight at a time.
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}