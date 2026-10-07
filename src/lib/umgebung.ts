/**
 * Mikro- und Makrolage eines Objekts aus OpenStreetMap.
 *
 * Bisher steckte das alles in `UmgebungsKarteButton`. Weil die Karte jetzt
 * zusätzlich fest auf der Objekt- und Wohnungsseite sitzt und nicht mehr nur
 * hinter einem Knopf, liegt die Logik hier und wird von beiden genutzt.
 *
 * Zwei Ebenen statt einer:
 *
 *   Mikrolage  ist, was man zu Fuß erreicht. Supermarkt, Bäcker, Apotheke,
 *              Arzt, Kita, Haltestelle, Bank. Das entscheidet, ob sich eine
 *              Wohnung im Alltag gut anfühlt, und es vermietet sich damit.
 *   Makrolage  ist die Einordnung im Umland. Schulen, Klinik, Bahnhof,
 *              Autobahnauffahrt. Das entscheidet, ob der Standort trägt.
 *
 * Die Trennung war vorher nicht da, alles lag in einem Topf mit 1.000 bis
 * 1.500 Metern. Eine Autobahnauffahrt in 1.500 Metern zu suchen findet
 * meistens nichts, und eine Schule in 5.000 Metern sagt nichts über den
 * Alltag aus.
 */

export type Lageebene = "mikro" | "makro";

export interface Kategorie {
  key: string;
  label: string;
  color: string;
  /** Overpass-Filter, siehe wiki.openstreetmap.org/wiki/Map_features */
  overpass: string;
  radius: number;
  ebene: Lageebene;
}

export const KATEGORIEN: Kategorie[] = [
  // ── Mikrolage: fußläufig ──
  { key: "supermarket",  label: "Supermarkt",   color: "#16a34a", overpass: '["shop"="supermarket"]',        radius: 1000, ebene: "mikro" },
  { key: "bakery",       label: "Bäcker",       color: "#d97706", overpass: '["shop"="bakery"]',             radius: 1000, ebene: "mikro" },
  { key: "pharmacy",     label: "Apotheke",     color: "#dc2626", overpass: '["amenity"="pharmacy"]',        radius: 1000, ebene: "mikro" },
  { key: "doctor",       label: "Arzt",         color: "#0ea5e9", overpass: '["amenity"="doctors"]',         radius: 1000, ebene: "mikro" },
  // Ausdrücklich gewünscht und vorher nicht dabei.
  { key: "bank",         label: "Bank",         color: "#0f766e", overpass: '["amenity"="bank"]',            radius: 1000, ebene: "mikro" },
  { key: "kindergarten", label: "Kindergarten", color: "#f97316", overpass: '["amenity"="kindergarten"]',    radius: 1000, ebene: "mikro" },
  // `highway=bus_stop`, nicht `public_transport=station`. Letzteres stand
  // vorher hier und liefert in Deutschland fast nie etwas: In München sind es
  // null Treffer gegen 33 Bushaltestellen im selben Umkreis.
  { key: "transit",      label: "Haltestelle",  color: "#7c3aed", overpass: '["highway"="bus_stop"]',          radius: 800, ebene: "mikro" },
  // Freizeit: Das Exposé zeigt eine eigene Liste „Freizeit und Erholung"
  // (Abschnitt 3, wie in der Vorlage). Park und Sportanlage sind die beiden
  // Kategorien, die OpenStreetMap flächendeckend führt.
  { key: "park",         label: "Park",         color: "#65a30d", overpass: '["leisure"="park"]',             radius: 1500, ebene: "mikro" },
  { key: "sports",       label: "Sportanlage",  color: "#0891b2", overpass: '["leisure"="sports_centre"]',    radius: 1500, ebene: "mikro" },

  // ── Makrolage: Einordnung im Umland ──
  { key: "school",       label: "Schule",       color: "#2563eb", overpass: '["amenity"="school"]',          radius: 4000, ebene: "makro" },
  { key: "hospital",     label: "Klinik",       color: "#be123c", overpass: '["amenity"="hospital"]',        radius: 8000, ebene: "makro" },
  { key: "station",      label: "Bahnhof",      color: "#4338ca", overpass: '["railway"="station"]',         radius: 8000, ebene: "makro" },
  { key: "motorway",     label: "Autobahnauffahrt", color: "#525252", overpass: '["highway"="motorway_junction"]', radius: 12000, ebene: "makro" },
];

export interface Ort {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Luftlinie zum Objekt in Metern. */
  entfernung: number;
}

export interface KategorieErgebnis {
  kategorie: Kategorie;
  orte: Ort[];
}

export interface Koordinate { lat: number; lng: number }

// Zwischenspeicher auf Modulebene: Beim erneuten Öffnen sofort da, und zwei
// Ansichten derselben Adresse fragen nicht zweimal.
const geoSpeicher = new Map<string, Promise<Koordinate>>();
const poiSpeicher = new Map<string, Promise<KategorieErgebnis[]>>();

/*
 * Dauerhafter Speicher im Browser.
 *
 * Der Speicher auf Modulebene ist beim nächsten Seitenaufruf leer, und dann
 * wartet man wieder auf OpenStreetMap. Der Dienst ist gedrosselt und
 * antwortet unter Last mit "429 zu viele Anfragen" oder gar nicht.
 *
 * Deshalb landen die Ergebnisse zusätzlich im localStorage. Beim zweiten
 * Öffnen ist die Lage sofort da, ohne eine einzige Anfrage.
 *
 * Dreißig Tage Haltbarkeit: Ein Supermarkt zieht selten um, und ein Monat
 * alter Stand ist allemal besser als eine leere Karte.
 */
const SPEICHER_PRAEFIX = "umgebung:";
const HALTBAR_MS = 30 * 24 * 3600_000;

interface Abgelegt<T> { stand: number; wert: T }

function ausSpeicher<T>(schluessel: string): T | null {
  try {
    const roh = localStorage.getItem(SPEICHER_PRAEFIX + schluessel);
    if (!roh) return null;
    const a = JSON.parse(roh) as Abgelegt<T>;
    if (!a?.stand || Date.now() - a.stand > HALTBAR_MS) {
      localStorage.removeItem(SPEICHER_PRAEFIX + schluessel);
      return null;
    }
    return a.wert;
  } catch {
    return null;
  }
}

function inSpeicher<T>(schluessel: string, wert: T): void {
  try {
    localStorage.setItem(SPEICHER_PRAEFIX + schluessel, JSON.stringify({ stand: Date.now(), wert }));
  } catch {
    /*
     * Voller Speicher oder abgeschaltet.
     *
     * Dann werden die ältesten Einträge geräumt und einmal erneut versucht.
     * Klappt auch das nicht, läuft alles weiter wie bisher, nur ohne
     * dauerhaften Speicher.
     */
    try {
      const schluessels = Object.keys(localStorage).filter((k) => k.startsWith(SPEICHER_PRAEFIX));
      for (const k of schluessels.slice(0, Math.ceil(schluessels.length / 2))) localStorage.removeItem(k);
      localStorage.setItem(SPEICHER_PRAEFIX + schluessel, JSON.stringify({ stand: Date.now(), wert }));
    } catch { /* dann eben nicht */ }
  }
}

/** Ist die Umgebung dieser Adresse schon abgelegt? Ohne jede Anfrage. */
export function istVorgeladen(adresse: string): boolean {
  const k = adresse.trim().toLowerCase();
  const koord = ausSpeicher<Koordinate>(`geo:${k}`);
  if (!koord) return false;
  return ausSpeicher<KategorieErgebnis[]>(`poi:${koord.lat.toFixed(4)},${koord.lng.toFixed(4)}`) !== null;
}

export function geocode(adresse: string): Promise<Koordinate> {
  const key = adresse.trim().toLowerCase();
  const treffer = geoSpeicher.get(key);
  if (treffer) return treffer;
  const abgelegt = ausSpeicher<Koordinate>(`geo:${key}`);
  if (abgelegt) {
    const fertig = Promise.resolve(abgelegt);
    geoSpeicher.set(key, fertig);
    return fertig;
  }
  const p = (async () => {
    const url = `https://photon.komoot.io/api/?limit=1&lang=de&q=${encodeURIComponent(adresse)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Adresse konnte nicht gefunden werden");
    const daten = await res.json();
    const f = daten?.features?.[0];
    if (!f) throw new Error("Adresse konnte nicht gefunden werden");
    const [lng, lat] = f.geometry.coordinates;
    const k: Koordinate = { lat, lng };
    inSpeicher(`geo:${key}`, k);
    return k;
  })().catch((e) => { geoSpeicher.delete(key); throw e; });
  geoSpeicher.set(key, p);
  return p;
}

/** Luftlinie in Metern, Haversine. Reicht für "wie weit ist der Supermarkt". */
export function entfernungMeter(a: Koordinate, b: Koordinate): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** "450 m" oder "2,3 km". Unter einem Kilometer auf 50 Meter gerundet. */
export function entfernungText(meter: number): string {
  if (meter < 1000) return `${Math.round(meter / 50) * 50} m`;
  return `${(meter / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;
}

export function umgebung(lat: number, lng: number): Promise<KategorieErgebnis[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const treffer = poiSpeicher.get(key);
  if (treffer) return treffer;
  const abgelegt = ausSpeicher<KategorieErgebnis[]>(`poi:${key}`);
  if (abgelegt) {
    const fertig = Promise.resolve(abgelegt);
    poiSpeicher.set(key, fertig);
    return fertig;
  }
  const p = ladeUmgebung(lat, lng)
    .then((e) => { inSpeicher(`poi:${key}`, e); return e; })
    .catch((e) => { poiSpeicher.delete(key); throw e; });
  poiSpeicher.set(key, p);
  return p;
}

async function ladeUmgebung(lat: number, lng: number): Promise<KategorieErgebnis[]> {
  /*
   * Das Präfix `nwr` ist Pflicht, nicht Geschmack.
   *
   * Overpass verlangt vor dem Filter die Art des gesuchten Elements. Ohne sie
   * antwortet der Dienst mit "parse error: Unknown type [". Genau das stand
   * bisher im Code, weshalb die Umgebungskarte nie einen einzigen Punkt
   * gezeigt hat: Die Karte erschien, die Abfrage dahinter schlug still fehl.
   *
   * `nwr` steht für node, way und relation. `node` allein würde reichen für
   * Bank und Bäcker, aber Schulen und Kliniken sind meist als Fläche erfasst
   * und fielen dann heraus.
   */
  const teile = KATEGORIEN.map((c) => `nwr${c.overpass}(around:${c.radius},${lat},${lng});`).join("");
  // `out center` liefert auch für Flächen einen Punkt. Ohne das fehlen
  // Schulen und Kliniken, die als Gebäudeumriss und nicht als Punkt erfasst
  // sind, und genau das sind die meisten.
  const query = `[out:json][timeout:60];(${teile});out center 250;`;

  const spiegel = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  // Alle drei gleichzeitig fragen, der erste brauchbare gewinnt. Overpass ist
  // oft überlastet, und ein Spiegel nach dem anderen wäre quälend langsam.
  const res: Response = await new Promise((resolve, reject) => {
    let offen = spiegel.length;
    let letzterFehler: unknown;
    spiegel.forEach((url) => {
      fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: query })
        .then((r) => {
          if (r.ok) resolve(r);
          else { letzterFehler = new Error(`HTTP ${r.status}`); if (--offen === 0) reject(letzterFehler); }
        })
        .catch((e) => { letzterFehler = e; if (--offen === 0) reject(letzterFehler); });
    });
  });

  const json = await res.json();
  const elemente: Array<Record<string, any>> = json?.elements || [];
  const mitte: Koordinate = { lat, lng };

  return KATEGORIEN.map((kategorie) => {
    // Aus '["shop"="bakery"]' die beiden Werte herausziehen, um die Antwort
    // wieder den Kategorien zuzuordnen. Overpass gibt alles in einem Topf.
    const paar = kategorie.overpass.match(/\["([\w:]+)"="([\w:]+)"\]/);
    const [, schluessel, wert] = paar || [];
    const orte: Ort[] = elemente
      .filter((e) => schluessel && e.tags?.[schluessel] === wert)
      .map((e) => {
        const p: Koordinate = { lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon };
        return {
          id: String(e.id),
          name: e.tags?.name || kategorie.label,
          address: [e.tags?.["addr:street"], e.tags?.["addr:housenumber"]].filter(Boolean).join(" "),
          lat: p.lat,
          lng: p.lng,
          entfernung: Number.isFinite(p.lat) && Number.isFinite(p.lng) ? entfernungMeter(mitte, p) : Number.MAX_SAFE_INTEGER,
        };
      })
      .filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng) && o.entfernung <= kategorie.radius)
      .sort((a, b) => a.entfernung - b.entfernung);

    return { kategorie, orte };
  });
}

/** Nur die Kategorien einer Ebene, leere weggelassen. */
export function nachEbene(ergebnisse: KategorieErgebnis[], ebene: Lageebene): KategorieErgebnis[] {
  return ergebnisse.filter((e) => e.kategorie.ebene === ebene && e.orte.length > 0);
}
