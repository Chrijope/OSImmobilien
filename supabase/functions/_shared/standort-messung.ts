/**
 * Gemessene Standortangaben aus OpenStreetMap.
 *
 * Vorher hat ein Sprachmodell die Kindergärten, Schulen, Apotheken und
 * Haltestellen samt Entfernung und GPS-Koordinaten aus dem Gedächtnis
 * aufgeschrieben. Das kann kein Modell. Herausgekommen sind plausible Namen
 * an plausiblen Entfernungen, und das Ganze stand anschließend im Exposé,
 * also in einer Verkaufsunterlage für Kunden.
 *
 * Hier wird stattdessen gemessen: Adresse geokodieren, Overpass fragen,
 * Luftlinie rechnen. Was OpenStreetMap nicht kennt, taucht nicht auf. Eine
 * leere Kategorie ist die ehrlichere Antwort als eine erfundene.
 *
 * SEIT DEM 23.09.2026 ABENDS: DIE MESSUNG GELINGT BEI JEDER ADRESSE
 *
 * Christian: Jedes Objekt hat eine Adresse, also muss sich jedes Objekt über
 * OpenStreetMap messen lassen. Vorher scheiterte die Messung reihenweise, aus
 * vier Gründen, die hier jetzt behoben sind:
 *
 *   1. Overpass. Der Hauptserver lehnt Anfragen mit allgemeiner Kennung ab
 *      oder bremst sie (406, 429, 504 bei „curl“ und „Deno“, geprüft am
 *      23.09.2026). Die beiden Ersatzserver waren gar nicht erreichbar. Jede
 *      Anfrage trägt deshalb eine eigene Kennung (`KENNUNG`), die Server
 *      werden gestaffelt gefragt, und ein Fehlschlag wird einmal wiederholt.
 *      Eine Antwort „runtime error“ mit leerer Liste gilt als Fehlschlag,
 *      nicht als „OpenStreetMap kennt hier nichts“.
 *   2. Die Adresse. Zusätze wie „(All-inclusive-Modell)“ oder „4er WG,“ und
 *      doppelte Hausnummern („Ossecker Straße 42 42“, weil der Import Straße
 *      und Hausnummer zusammensetzt) ließen Photon ins Leere laufen.
 *      `normalisiereAdresse` trennt das ab.
 *   3. Kein Rückfall. Fand Photon die Hausnummer nicht, war Schluss. Jetzt
 *      geht es über Nominatim zur Straße, dann zum Postleitzahlgebiet und
 *      zuletzt zur Ortsmitte (`findeLage`). Wie genau gemessen wurde, steht
 *      in der Analyse unter `genauigkeit`, damit niemand eine Entfernung ab
 *      der Ortsmitte für eine ab der Haustür hält.
 *   4. Leere Kategorien. Auf dem Land lag im Radius oft kein Supermarkt. Eine
 *      leere Kategorie wird jetzt einmal mit dreifachem Radius nachgefragt.
 *
 * Dazu kommen drei Kategorien für die Standortargumente: Hochschulen,
 * Kliniken sowie Gewerbe- und Industriegebiete. Seit der Messfassung 3
 * (24.09.2026) auch Parks und Behörden, bis zu zehn Orte je Kategorie, für
 * Karte und Lagekasten (`src/lib/umgebungspunkte.ts`). Gewerbeflächen zeigt
 * keine Seite, sie dienen nur den Standortargumenten.
 *
 * Die Datei liegt unter `supabase/functions/_shared/`, weil die Edge Function
 * in Deno läuft und nichts aus `src/` importieren kann. Der Test dazu liegt
 * in `src/lib/standortMessung.test.ts` und importiert von hier, so wie es
 * `kontakt-dublette.ts` und `pipeline-schwellen.ts` schon vormachen. Deshalb
 * darf hier nichts stehen, was nur Deno kennt: kein `Deno.env`, keine
 * Dateizugriffe, nur `fetch` und reine Rechnung.
 */

export interface Koordinate {
  lat: number;
  lng: number;
}

/** Ein Ort, den OpenStreetMap kennt, mit gemessener Luftlinie zum Objekt. */
export interface GemessenerOrt {
  name: string;
  /** Beschriftung wie "Supermarkt" oder "Grundschule", aus den OSM-Tags. */
  typ?: string;
  /** Luftlinie zum Objekt in Metern, gerechnet, nicht geschätzt. */
  entfernung_m: number;
  lat: number;
  lng: number;
}

export type MikrolageSchluessel =
  | "kindergaerten"
  | "schulen"
  | "einkaufen"
  | "apotheken"
  | "aerzte"
  | "oepnv"
  | "freizeit"
  | "parks"
  | "behoerden"
  | "hochschulen"
  | "kliniken"
  | "gewerbe";

export type GemesseneMikrolage = Partial<Record<MikrolageSchluessel, GemessenerOrt[]>>;

/**
 * Ab wo gemessen wurde.
 *
 * „adresse“: ab dem Haus. „strasse“: ab der Straße, die Hausnummer kennt
 * OpenStreetMap nicht; die Entfernungen stimmen dann nur ungefähr.
 * „plz“: ab dem Mittelpunkt des Postleitzahlgebiets. „ort“: ab der Ortsmitte.
 * Bei den beiden letzten sagen die Entfernungen nichts über den Weg ab der
 * Haustür, nur darüber, was es in der Gegend gibt.
 */
export type Genauigkeit = "adresse" | "strasse" | "plz" | "ort";

/** Was die Adresssuche über die Lage selbst sagt, etwa den Stadtteil. */
export interface Lage {
  stadtteil?: string;
  ort?: string;
  plz?: string;
}

interface MessFilter {
  /** OSM-Tag, etwa "amenity". */
  schluessel: string;
  /** Tag-Wert, etwa "pharmacy". */
  wert: string;
  /** Beschriftung im Exposé. Leer, wenn die Kategorie ohne Typ auskommt. */
  typ?: string;
  /** Suchradius in Metern. */
  radius: number;
}

interface MessKategorie {
  key: MikrolageSchluessel;
  filter: MessFilter[];
  /** Höchstzahl der Einträge im Exposé, die nächstgelegenen zuerst. */
  max: number;
}

/*
 * Radien nach Alltagstauglichkeit, nicht nach Gefühl.
 *
 * Fußläufig heißt in der Praxis bis etwa 1.000 Meter. Ein Bahnhof darf weiter
 * weg liegen, eine Schule auch, ein Bäcker nicht. Wer alles mit demselben
 * Radius sucht, findet entweder nichts oder Unbrauchbares. Hochschulen,
 * Kliniken und Gewerbegebiete sind Arbeitsorte der Region und dürfen weiter
 * weg liegen als der Supermarkt.
 *
 * SEIT DER MESSFASSUNG 3 (24.09.2026)
 *
 * Christian will neben der Karte je Kategorie die nächsten fünf bis zehn
 * Punkte sehen, dazu Parks und öffentliche Einrichtungen. Deshalb:
 *
 *   - bis zu zehn Orte bei Einkaufen, Freizeit, Parks sowie Bus und Bahn,
 *     fünf bei Kitas, Schulen, Ärzten, Apotheken, Behörden und in der
 *     Makrolage (Hochschulen, Krankenhäuser). Die Seite fasst Kitas bis
 *     Behörden unter „Öffentliche Einrichtungen“ zusammen, dort wären
 *     fünfzig Zeilen zu viel.
 *   - Parks stehen in einer eigenen Liste `parks`, nicht mehr unter
 *     `freizeit`. Ältere Messungen tragen sie noch dort mit `typ: "Park"`,
 *     die Seite liest beides (`src/lib/umgebungspunkte.ts`).
 *   - Neu `behoerden`: Rathaus, Ämter, Polizei, Post und Bibliothek. Alles
 *     öffentliche Einrichtungen mit Namen am Gebäude, keine Personen.
 *   - Einkaufen kennt auch Drogerien und Einkaufszentren, Freizeit auch Kino
 *     und Theater.
 *
 * Alles bleibt in der einen Overpass-Abfrage je Objekt (`baueOverpassAbfrage`).
 */
export const MESS_KATEGORIEN: MessKategorie[] = [
  {
    key: "kindergaerten",
    max: 5,
    filter: [{ schluessel: "amenity", wert: "kindergarten", radius: 1500 }],
  },
  {
    key: "schulen",
    max: 5,
    // Der Schultyp kommt weiter unten aus den Tags, nicht aus einer Annahme.
    filter: [{ schluessel: "amenity", wert: "school", radius: 3000 }],
  },
  {
    key: "einkaufen",
    max: 10,
    filter: [
      { schluessel: "shop", wert: "supermarket", typ: "Supermarkt", radius: 1500 },
      { schluessel: "shop", wert: "convenience", typ: "Nahversorger", radius: 1000 },
      { schluessel: "shop", wert: "bakery", typ: "Bäcker", radius: 1000 },
      { schluessel: "shop", wert: "butcher", typ: "Metzgerei", radius: 1000 },
      { schluessel: "shop", wert: "chemist", typ: "Drogerie", radius: 1500 },
      { schluessel: "shop", wert: "mall", typ: "Einkaufszentrum", radius: 3000 },
    ],
  },
  {
    key: "apotheken",
    max: 5,
    filter: [{ schluessel: "amenity", wert: "pharmacy", radius: 1500 }],
  },
  {
    key: "aerzte",
    max: 5,
    filter: [
      { schluessel: "amenity", wert: "doctors", typ: "Arztpraxis", radius: 1500 },
      { schluessel: "amenity", wert: "dentist", typ: "Zahnarzt", radius: 1500 },
      { schluessel: "amenity", wert: "clinic", typ: "Praxisklinik", radius: 2000 },
    ],
  },
  {
    key: "oepnv",
    max: 10,
    filter: [
      // `highway=bus_stop`, nicht `public_transport=station`. Letzteres liefert
      // in Deutschland fast nie etwas, dieselbe Falle steckte schon einmal in
      // `src/lib/umgebung.ts`.
      { schluessel: "highway", wert: "bus_stop", typ: "Bus", radius: 1000 },
      { schluessel: "railway", wert: "tram_stop", typ: "Straßenbahn", radius: 1500 },
      { schluessel: "railway", wert: "station", typ: "Bahnhof", radius: 5000 },
      { schluessel: "railway", wert: "halt", typ: "Haltepunkt", radius: 5000 },
    ],
  },
  {
    key: "freizeit",
    max: 10,
    filter: [
      { schluessel: "leisure", wert: "sports_centre", typ: "Sportzentrum", radius: 2000 },
      { schluessel: "leisure", wert: "fitness_centre", typ: "Fitnessstudio", radius: 1500 },
      { schluessel: "leisure", wert: "playground", typ: "Spielplatz", radius: 1000 },
      { schluessel: "amenity", wert: "cinema", typ: "Kino", radius: 3000 },
      { schluessel: "amenity", wert: "theatre", typ: "Theater", radius: 3000 },
    ],
  },
  {
    key: "parks",
    max: 10,
    filter: [
      { schluessel: "leisure", wert: "park", typ: "Park", radius: 2000 },
      { schluessel: "landuse", wert: "recreation_ground", typ: "Grünanlage", radius: 2000 },
    ],
  },
  {
    key: "behoerden",
    max: 5,
    filter: [
      { schluessel: "amenity", wert: "townhall", typ: "Rathaus", radius: 5000 },
      { schluessel: "office", wert: "government", typ: "Amt oder Behörde", radius: 3000 },
      { schluessel: "amenity", wert: "police", typ: "Polizei", radius: 3000 },
      { schluessel: "amenity", wert: "post_office", typ: "Post", radius: 2000 },
      { schluessel: "amenity", wert: "library", typ: "Bibliothek", radius: 3000 },
    ],
  },
  {
    key: "hochschulen",
    max: 5,
    filter: [{ schluessel: "amenity", wert: "university", typ: "Hochschule", radius: 10000 }],
  },
  {
    key: "kliniken",
    max: 5,
    filter: [{ schluessel: "amenity", wert: "hospital", typ: "Krankenhaus", radius: 10000 }],
  },
  {
    key: "gewerbe",
    // Benannte Flächen sind oft einzelne Betriebe („Volkswerft Stralsund“),
    // nicht ganze Gewerbegebiete. Daher die neutrale Beschriftung, und fünf
    // statt drei, damit die Texte die aussagekräftigsten wählen können. Nur
    // für die Standortargumente, nie auf Karte oder Liste.
    max: 5,
    filter: [
      { schluessel: "landuse", wert: "industrial", typ: "Industrie- oder Gewerbefläche", radius: 5000 },
      { schluessel: "landuse", wert: "commercial", typ: "Gewerbefläche", radius: 3000 },
    ],
  },
];

/** Um diesen Faktor wächst der Radius, wenn eine Kategorie leer blieb. */
export const ERWEITERUNG = 3;

/** Weiter als so viele Meter wird auch im erweiterten Umkreis nicht gesucht. */
export const HOECHSTRADIUS_M = 25_000;

/** Der Radius eines Filters, gegebenenfalls erweitert und gedeckelt. */
function radiusVon(f: MessFilter, faktor: number): number {
  return Math.min(Math.round(f.radius * faktor), Math.max(f.radius, HOECHSTRADIUS_M));
}

/** Luftlinie in Metern, Haversine. Reicht für "wie weit ist der Supermarkt". */
export function entfernungMeter(a: Koordinate, b: Koordinate): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Schultyp aus den OSM-Tags.
 *
 * `school:DE` ist das gepflegte Feld, steht aber längst nicht überall. Wo es
 * fehlt, steht der Typ fast immer im Namen ("Grundschule Am Anger"). Beides
 * ist abgelesen und nicht geraten. Findet sich nichts, bleibt es bei "Schule",
 * denn eine falsche Schulart im Exposé ist schlimmer als gar keine.
 */
export function schultyp(tags: Record<string, string> | undefined): string {
  const text = [tags?.["school:DE"], tags?.["school"], tags?.["name"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const treffer: [string, string][] = [
    ["grundschule", "Grundschule"],
    ["gymnasium", "Gymnasium"],
    ["realschule", "Realschule"],
    ["gesamtschule", "Gesamtschule"],
    ["mittelschule", "Mittelschule"],
    ["hauptschule", "Hauptschule"],
    ["berufsschule", "Berufsschule"],
    ["berufskolleg", "Berufskolleg"],
    ["förderschule", "Förderschule"],
    ["foerderschule", "Förderschule"],
    ["waldorf", "Waldorfschule"],
    ["montessori", "Montessorischule"],
  ];
  for (const [suche, label] of treffer) if (text.includes(suche)) return label;
  return "Schule";
}

/**
 * Eine einzige Overpass-Abfrage für alle Kategorien.
 *
 * `nwr` ist Pflicht, nicht Geschmack: Ohne die Angabe der Elementart antwortet
 * Overpass mit "parse error: Unknown type [". `out center` liefert auch für
 * Flächen einen Punkt, und Schulen sind fast immer als Fläche erfasst.
 *
 * Nur Einträge mit Namen: Ohne Namen wirft `werteOverpassAus` einen Eintrag
 * ohnehin weg, und in einer Großstadt hielten sie die Antwort über der
 * Obergrenze, und welche Kategorie dabei abgeschnitten wurde, war Zufall.
 * Gefiltert wird mit `(if:is_tag("name"))` hinter dem Umkreis, NICHT mit
 * `["name"]`: Das ließ Overpass über den Index aller benannten Objekte gehen,
 * und dieselbe Abfrage lief in die Zeitgrenze statt in einer Sekunde durch
 * (geprüft am 23.09.2026).
 *
 * Die Zeitgrenze in der Abfrage passt zu `OVERPASS_FRIST_MS`: Die Messung
 * läuft auch im Sammellauf der Objekttexte, und dort teilt sie sich eine
 * Edge Function mit einem KI-Aufruf. Länger zu warten hätte keinen Sinn, der
 * Abruf wäre ohnehin schon abgebrochen.
 *
 * Die Obergrenze der Antwort (`OVERPASS_HOECHSTZAHL`) stieg mit der
 * Messfassung 3 von 2.000 auf 5.000: Mit Parks, Behörden, Kino und Theater
 * kamen in einer Innenstadt sonst mehr Treffer zusammen, als die Antwort
 * trug, und welche Kategorie dabei leer ausging, wäre Zufall gewesen.
 */
export function baueOverpassAbfrage(
  lat: number,
  lng: number,
  kategorien: MessKategorie[] = MESS_KATEGORIEN,
  faktor = 1,
): string {
  const teile: string[] = [];
  for (const kategorie of kategorien) {
    for (const f of kategorie.filter) {
      teile.push(`nwr["${f.schluessel}"="${f.wert}"](around:${radiusVon(f, faktor)},${lat},${lng})(if:is_tag("name"));`);
    }
  }
  return `[out:json][timeout:25];(${teile.join("")});out center ${OVERPASS_HOECHSTZAHL};`;
}

/** Höchstzahl der Einträge in einer Overpass-Antwort, siehe `baueOverpassAbfrage`. */
export const OVERPASS_HOECHSTZAHL = 5000;

/** Was ein Abruf zurückgeben muss. Ein echtes `Response` erfüllt das. */
export interface AbrufAntwort {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/**
 * Ein Abruf nach dem Vorbild von `fetch`.
 *
 * Austauschbar, damit sich der ganze Messaufbau ohne Netz prüfen lässt. In
 * Betrieb ist es immer das echte `fetch`.
 */
export type Abruf = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<AbrufAntwort>;

const echterAbruf: Abruf = (url, init) => fetch(url, init);

/**
 * Die Kennung, mit der sich die Messung bei Overpass und Nominatim ausweist.
 *
 * Beide verlangen das ausdrücklich. Overpass beantwortet eine Anfrage mit der
 * Standardkennung von curl mit 406 und eine mit der von Deno mit 429 oder 504
 * (geprüft am 23.09.2026). Nur auf dem Server gesetzt: Im Browser löste der
 * eigene Kopf bei Photon eine CORS-Vorabfrage aus, und die Adresssuche für die
 * Kartennadel (`findeAdresse`) läuft auch dort.
 */
export const KENNUNG = "MORE-Immo-CRM/1.0 (Standortmessung; https://osimmobilien.netlify.app)";

/** Höchstwartezeit für eine Adresssuche. Photon antwortet sonst in unter einer Sekunde. */
export const PHOTON_FRIST_MS = 8_000;

/**
 * Höchstwartezeit für Overpass, über alle Spiegel zusammen.
 *
 * Bis zum 01.10.2026 waren es 25 Sekunden. Seit dem 30.09.2026 scheiterte
 * daran jede zweite Messung aus den Edge Functions mit „The signal has been
 * aborted“ (52 Objekte, darunter 25 ganz ohne Umgebung): Die Absender der
 * Edge Functions teilen sich ihr Kontingent beim Hauptserver mit vielen
 * Projekten, der stellt die Anfrage in die Warteschlange, und die
 * Ersatzserver brauchen 15 bis 45 Sekunden (gemessen am 01.10.2026). Die
 * Messung selbst dauert nur rund acht Sekunden.
 */
export const OVERPASS_FRIST_MS = 45_000;

/** Nach so vielen Millisekunden ohne Antwort kommt der nächste Overpass-Server dazu. */
export const OVERPASS_STAFFEL_MS = 4_000;

/** So viel Zeit darf eine ganze Messung höchstens brauchen, wenn niemand etwas anderes sagt. */
export const MESS_BUDGET_MS = 60_000;

interface OverpassElement {
  id?: number | string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

/**
 * Overpass-Antwort in die Kategorien des Exposés einsortieren.
 *
 * Ohne Namen fliegt ein Eintrag raus. "Kindergarten, 300 m" ohne Namen sieht
 * im Exposé aus wie ein Platzhalter, den jemand vergessen hat.
 *
 * `kategorien` und `faktor` gibt es für die zweite Abfrage mit erweitertem
 * Radius: Dort zählen nur die leer gebliebenen Kategorien, mit ihrem größeren
 * Radius.
 */
export function werteOverpassAus(
  elemente: OverpassElement[],
  mitte: Koordinate,
  kategorien: MessKategorie[] = MESS_KATEGORIEN,
  faktor = 1,
): GemesseneMikrolage {
  const ergebnis: GemesseneMikrolage = {};

  for (const kategorie of kategorien) {
    const gefunden: GemessenerOrt[] = [];

    for (const element of elemente || []) {
      const tags = element?.tags;
      const name = (tags?.name || "").trim();
      if (!name) continue;

      // Der erste passende Filter gewinnt. Ein Bahnhof, der zusätzlich als
      // Haltepunkt getaggt ist, soll nicht zweimal auftauchen.
      const f = kategorie.filter.find((k) => tags?.[k.schluessel] === k.wert);
      if (!f) continue;

      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const entfernung = entfernungMeter(mitte, { lat: lat as number, lng: lng as number });
      if (entfernung > radiusVon(f, faktor)) continue;

      gefunden.push({
        name,
        typ: kategorie.key === "schulen" ? schultyp(tags) : f.typ,
        entfernung_m: entfernung,
        lat: lat as number,
        lng: lng as number,
      });
    }

    // Gleicher Name doppelt kommt oft vor: Bushaltestellen liegen paarweise
    // links und rechts der Straße. Der nähere reicht. Deshalb erst sortieren,
    // dann doppelte Namen streichen; bis zum 23.09.2026 blieb der zuerst
    // gelieferte stehen, gleich wie weit er weg war.
    gefunden.sort((a, b) => a.entfernung_m - b.entfernung_m);
    const eindeutig: GemessenerOrt[] = [];
    const namen = new Set<string>();
    for (const ort of gefunden) {
      const k = `${ort.name}|${ort.typ || ""}`;
      if (namen.has(k)) continue;
      namen.add(k);
      eindeutig.push(ort);
    }
    // Leere Kategorien werden weggelassen, damit im Exposé nichts steht statt
    // einer leeren Überschrift.
    if (eindeutig.length > 0) ergebnis[kategorie.key] = eindeutig.slice(0, kategorie.max);
  }

  return ergebnis;
}

/**
 * Die Overpass-Server, in der Reihenfolge, in der sie gefragt werden.
 *
 * Stand 23.09.2026: Der Hauptserver und der französische antworten, wenn die
 * Anfrage eine eigene Kennung trägt. `private.coffee` und `kumi.systems`
 * waren nicht erreichbar; sie bleiben als letzte Wahl in der Liste, weil sie
 * früher zuverlässig liefen und ein toter Server hier nichts kostet: Er wird
 * nur gefragt, wenn die vorderen nicht rechtzeitig antworten.
 *
 * Seit dem 01.10.2026 steht `maps.mail.ru` an zweiter Stelle: ein eigener
 * Betreiber mit eigenem Kontingent, der dieselbe Abfrage in rund 13 Sekunden
 * beantwortet. Er springt ein, wenn der Hauptserver die geteilten Absender
 * der Edge Functions ausbremst.
 */
export const OVERPASS_SPIEGEL = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/**
 * Hat Overpass die Abfrage wirklich ausgeführt?
 *
 * Bei Überlast antwortet Overpass mitunter mit Status 200, einer leeren Liste
 * und einem Vermerk „runtime error: Query timed out“ oder „out of memory“. Das
 * sah vorher aus wie „OpenStreetMap kennt hier nichts“ und wurde als gelungene
 * Messung mit leerer Umgebung gespeichert.
 */
function overpassFehlerVermerk(json: unknown): string {
  const remark = (json as { remark?: unknown } | null)?.remark;
  if (typeof remark !== "string") return "";
  return /runtime error|timed out|out of memory|rate_limited|too many/i.test(remark) ? remark.slice(0, 160) : "";
}

/**
 * Die Overpass-Server gestaffelt fragen, der erste brauchbare gewinnt.
 *
 * Bis zum 23.09.2026 gingen alle Spiegel gleichzeitig hinaus. Das belastet
 * jeden Server bei jedem Objekt, und der Hauptserver zählt Anfragen je
 * Absender; Edge Functions teilen sich ihre Absender mit vielen anderen
 * Projekten. Jetzt beginnt der erste, und der nächste kommt dazu, wenn der
 * vorige gescheitert ist oder nach `OVERPASS_STAFFEL_MS` noch nichts geliefert
 * hat. Sobald einer eine brauchbare Antwort hat, werden die übrigen
 * abgebrochen. Nach `fristMs` gibt es keine Antwort mehr.
 */
export async function holeOverpassElemente(
  lat: number,
  lng: number,
  abruf: Abruf = echterAbruf,
  fristMs: number = OVERPASS_FRIST_MS,
  abfrage: string = baueOverpassAbfrage(lat, lng),
  staffelMs: number = OVERPASS_STAFFEL_MS,
): Promise<OverpassElement[]> {
  const steuerungen = OVERPASS_SPIEGEL.map(() => new AbortController());
  const zeitgeber: ReturnType<typeof setTimeout>[] = [];
  const allesAbbrechen = () => steuerungen.forEach((s) => s.abort());
  zeitgeber.push(setTimeout(allesAbbrechen, fristMs));

  try {
    return await new Promise<OverpassElement[]>((resolve, reject) => {
      let fertig = false;
      let gestartet = 0;
      let offen = 0;
      let letzterFehler: unknown = new Error("Kein Overpass-Server hat geantwortet.");

      const scheitern = (e: unknown) => {
        letzterFehler = e;
        offen -= 1;
        if (fertig) return;
        if (gestartet < OVERPASS_SPIEGEL.length) starte();
        else if (offen === 0) {
          fertig = true;
          reject(letzterFehler);
        }
      };

      const starte = () => {
        if (fertig || gestartet >= OVERPASS_SPIEGEL.length) return;
        const i = gestartet++;
        offen += 1;
        abruf(OVERPASS_SPIEGEL[i], {
          method: "POST",
          headers: { "Content-Type": "text/plain", "User-Agent": KENNUNG },
          body: abfrage,
          signal: steuerungen[i].signal,
        })
          .then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const json = (await r.json()) as { elements?: unknown } | null;
            const vermerk = overpassFehlerVermerk(json);
            if (vermerk) throw new Error(vermerk);
            if (fertig) return;
            fertig = true;
            steuerungen.forEach((s, j) => {
              if (j !== i) s.abort();
            });
            resolve(Array.isArray(json?.elements) ? (json!.elements as OverpassElement[]) : []);
          })
          .catch(scheitern);
        // Der nächste Server kommt nach der Staffelzeit dazu, auch wenn dieser
        // noch nicht gescheitert ist.
        if (gestartet < OVERPASS_SPIEGEL.length) zeitgeber.push(setTimeout(starte, staffelMs));
      };

      starte();
    });
  } finally {
    zeitgeber.forEach((z) => clearTimeout(z));
  }
}

// ── Die Adresse ─────────────────────────────────────────────────────────────

/** Die Adresse, zerlegt und bereinigt, so wie die Suche sie braucht. */
export interface NormalisierteAdresse {
  /** Straßenname ohne Hausnummer, etwa „Ossecker Straße“. Leer, wenn keiner zu finden war. */
  strasse: string;
  /** Hausnummer, etwa „42“ oder „12a“. Leer, wenn keine dasteht. */
  hausnummer: string;
  /** Fünfstellige Postleitzahl oder leer. */
  plz: string;
  /** Ortsname, ohne Postleitzahl davor. */
  ort: string;
}

const textVon = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";

/** Eine Postleitzahl mit fünf Ziffern. Eine Zahl verliert die führende Null, die kommt zurück. */
function plzVon(v: unknown): string {
  const ziffern = textVon(v).replace(/^d\s*-\s*/i, "").replace(/\s+/g, "");
  if (/^\d{5}$/.test(ziffern)) return ziffern;
  if (/^\d{4}$/.test(ziffern)) return `0${ziffern}`;
  const treffer = /\b(\d{5})\b/.exec(textVon(v));
  return treffer ? treffer[1] : "";
}

/**
 * Wörter, die keine Adresse sind, sondern das Vermietungskonzept oder die
 * Lage im Haus: „4er WG“, „Co-Living“, „All-inclusive“, „WE 3“, „2. OG links“.
 */
const ZUSATZ_WORT =
  /^(\d+\s*er|wg|wgs|wg-zimmer|co-?living|coliving|all-?inclusive(-?modell)?|modell|konzept|möbliert|we|whg\.?|wohnung|app\.?|apt\.?|apartment|top|nr\.?|eg|og|dg|ug|\d+\.\s*og|links|rechts|mitte|hinterhaus|vorderhaus|seitenflügel)$/i;

/** Sieht dieses Stück nach einer Straße aus? Name plus Hausnummer oder eine typische Endung. */
const STRASSEN_ENDUNG =
  /(straße|strasse|str\.?|weg|ring|platz|allee|gasse|damm|ufer|chaussee|steig|pfad|markt|berg|feld|hof|garten|graben|kamp|wall|stieg|zeile|park|anger|au|siedlung|promenade|kai|brücke|tor|winkel|höhe|blick|grund|busch|heide|wiese|acker)\b/i;

/** Eine Hausnummer: „42“, „42a“, „12-14“, „12/1“. Keine Ordnungszahl wie „17.“. */
const HAUSNUMMER = /^(\d{1,4})([a-z])?(?:[-–/]\d{1,4}[a-z]?)?$/i;

/** Straßenname und Hausnummer aus einem Stück Adresse, soweit es eines ist. */
function zerlegeStrasse(stueck: string): { strasse: string; hausnummer: string } | null {
  // „Musterstr.5“ und „Musterstraße5“: Leerzeichen vor die Nummer.
  const vorbereitet = stueck.replace(/([a-zäöüß.])(\d)/gi, "$1 $2").replace(/\s+/g, " ").trim();
  const woerter = vorbereitet.split(" ").filter(Boolean);
  // Zusätze vorn weg: „4er WG Musterstraße 5“.
  while (woerter.length > 0 && ZUSATZ_WORT.test(woerter[0])) woerter.shift();
  const nameTeile: string[] = [];
  let hausnummer = "";
  for (let i = 0; i < woerter.length; i++) {
    const wort = woerter[i];
    const nummer = HAUSNUMMER.exec(wort);
    if (nummer && nameTeile.length > 0) {
      hausnummer = nummer[1] + (nummer[2] || "");
      // „12 a“: der Buchstabe als eigenes Wort.
      if (!nummer[2] && /^[a-z]$/i.test(woerter[i + 1] || "")) hausnummer += woerter[i + 1];
      break;
    }
    nameTeile.push(wort);
  }
  // „Str.“ und „str.“ ausschreiben, Photon und Nominatim kennen die Straßen mit „Straße“.
  const strasse = nameTeile
    .join(" ")
    .replace(/(^|\s)Str\.?$/, "$1Straße")
    .replace(/str\.$/i, "straße")
    .replace(/[,;:\-–\s]+$/, "")
    .trim();
  if (!/[a-zäöüß]{3,}/i.test(strasse)) return null;
  if (!hausnummer && !STRASSEN_ENDUNG.test(strasse)) return null;
  return { strasse, hausnummer: hausnummer.toLowerCase() };
}

/** Straße aus einem ganzen Text wie „4er WG, Musterstraße 5 (All-inclusive), 86150 Augsburg“. */
function strasseAusText(roh: string, plzOrt: { plz: string; ort: string }): { strasse: string; hausnummer: string } | null {
  const ohneKlammern = roh.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const stuecke = ohneKlammern.split(/[,;|\n]+/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  let mitNummer: { strasse: string; hausnummer: string } | null = null;
  let ohneNummer: { strasse: string; hausnummer: string } | null = null;
  // Alle Stücke ansehen, auch nach der Straße: Postleitzahl und Ort stehen meist dahinter.
  for (const roheStueck of stuecke) {
    // Eine Aufzählungsnummer vorn, wie in „01. Hof, Ossecker Straße 42“.
    const stueck = roheStueck.replace(/^\d{1,3}\.\s+/, "");
    const plzOrtTreffer = /^(?:d\s*-\s*)?(\d{5})\s+(.+)$/i.exec(stueck);
    if (plzOrtTreffer) {
      if (!plzOrt.plz) plzOrt.plz = plzOrtTreffer[1];
      if (!plzOrt.ort) plzOrt.ort = plzOrtTreffer[2].trim();
      continue;
    }
    if (/^\d{5}$/.test(stueck)) {
      if (!plzOrt.plz) plzOrt.plz = stueck;
      continue;
    }
    // Der Ort allein, etwa „Nürnberg“, ist keine Straße, auch wenn er auf „-berg“ endet.
    if (plzOrt.ort && !/\d/.test(stueck) && gleicherOrt(stueck, plzOrt.ort)) continue;
    const zerlegt = zerlegeStrasse(stueck);
    if (!zerlegt) continue;
    if (zerlegt.hausnummer) mitNummer = mitNummer ?? zerlegt;
    else ohneNummer = ohneNummer ?? zerlegt;
  }
  return mitNummer ?? ohneNummer;
}

/**
 * Die Adresse eines Objekts bereinigen.
 *
 * Abgetrennt wird, was Photon und Nominatim ins Leere laufen ließ: Klammern
 * wie „(All-inclusive-Modell)“, Konzeptangaben wie „4er WG,“, Lage im Haus
 * wie „WE 3“, eine doppelte Hausnummer, Postleitzahl und Ort im Straßenfeld.
 * „Str.“ wird zu „Straße“, eine Postleitzahl als Zahl bekommt ihre führende
 * Null zurück. Steht im Adressfeld keine Straße, wird der Titel gelesen, der
 * bei Objekten aus Investagon oft „01. Hof, Ossecker Straße 42“ lautet.
 */
export function normalisiereAdresse(teile: { adresse?: unknown; plz?: unknown; ort?: unknown; titel?: unknown }): NormalisierteAdresse {
  const plzOrt = { plz: plzVon(teile.plz), ort: textVon(teile.ort).replace(/^(?:d\s*-\s*)?\d{5}\s+/i, "").replace(/,?\s*deutschland$/i, "").trim() };
  let zerlegt = strasseAusText(textVon(teile.adresse), plzOrt);
  if (!zerlegt || !zerlegt.hausnummer) {
    const ausTitel = strasseAusText(textVon(teile.titel), { plz: plzOrt.plz || "x", ort: plzOrt.ort || "x" });
    if (ausTitel?.hausnummer && (!zerlegt || gleicheStrasse(zerlegt.strasse, ausTitel.strasse))) zerlegt = ausTitel;
  }
  return {
    strasse: zerlegt?.strasse ?? "",
    hausnummer: zerlegt?.hausnummer ?? "",
    plz: plzOrt.plz,
    ort: plzOrt.ort,
  };
}

/** Ein Name in vergleichbarer Form: klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern. */
function vergleichsform(v: unknown): string {
  return textVon(v)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\bst\.\s*/g, "sankt ")
    .replace(/strasse\b|str\.?(?=\s|$)/g, "str")
    .replace(/[^a-z0-9]+/g, "");
}

/** Dieselbe Straße? „Musterstr.“ gleich „Musterstraße“, „Am Anger“ gleich „Am Anger“. */
export function gleicheStrasse(a: unknown, b: unknown): boolean {
  const x = vergleichsform(a);
  const y = vergleichsform(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // Kleine Abweichungen am Rand, etwa „Bruno-Walter-Ring“ gegen „Bruno Walter Ring“, fängt schon
  // die Vergleichsform. Ein enthaltener Name zählt erst ab einer gewissen Länge.
  return (x.length >= 6 && y.includes(x)) || (y.length >= 6 && x.includes(y));
}

/** Der Kern eines Ortsnamens: „Hof (Saale)“ zu „hof“, „Frankfurt am Main“ zu „frankfurt“. */
function ortKernForm(v: unknown): string {
  const vorTrenner = textVon(v).split(/[(,/]|\s-\s/)[0];
  const klein = vorTrenner
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\bst\.\s*/g, "sankt ")
    .replace(/[^a-z0-9 -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return klein.split(/ (?:am|an der|an|im|in der|in|ob der|ob|bei|a|i|v d) /)[0].split("-")[0].trim();
}

/** Derselbe Ort? „Hof“ gleich „Hof (Saale)“, „München“ gleich „München-Bogenhausen“. */
export function gleicherOrt(a: unknown, b: unknown): boolean {
  const x = ortKernForm(a);
  const y = ortKernForm(b);
  return !!x && !!y && x === y;
}

/** Dieselbe Hausnummer? „36“ gleich „36“, „12 a“ gleich „12a“; „36“ und „36a“ zählen als dasselbe Haus. */
function gleicheHausnummer(a: unknown, b: unknown): boolean {
  const x = textVon(a).toLowerCase().replace(/\s+/g, "");
  const y = textVon(b).toLowerCase().replace(/\s+/g, "");
  if (!x || !y) return false;
  if (x === y) return true;
  const zx = /^\d+/.exec(x)?.[0];
  const zy = /^\d+/.exec(y)?.[0];
  return !!zx && zx === zy;
}

/** Woher eine Koordinate stammt. „investagon“ setzt der Import, die beiden anderen die Adresssuche. */
export type KoordinatenQuelle = "photon" | "nominatim" | "investagon";

/** Ein Fund der Adresssuche. */
export interface LageTreffer {
  koordinate: Koordinate;
  genauigkeit: Genauigkeit;
  lage: Lage;
  quelle: KoordinatenQuelle;
}

/** Was die Adresssuche findet oder warum nicht. */
export type AdressErgebnis =
  | { ok: true; koordinate: Koordinate; genauigkeit: Genauigkeit; lage: Lage; quelle: KoordinatenQuelle }
  | { ok: false; art: "adresse" | "dienst"; grund: string };

/** Die Rangfolge der Genauigkeit, kleiner ist besser. Eine Analyse ohne Angabe gilt als hausgenau. */
export function genauigkeitsRang(g: unknown): number {
  return g === "strasse" ? 1 : g === "plz" ? 2 : g === "ort" ? 3 : 0;
}

/**
 * Treffer, die nur einen Ort oder eine Region bezeichnen.
 *
 * Für die Hausadresse zählen sie nicht. Ohne Straße liefert Photon den
 * Ortsmittelpunkt. Von dort gemessen stünde "Supermarkt in 200 m" da, obwohl
 * das Haus zwei Kilometer weiter am Stadtrand liegt. Als letzter Rückfall in
 * `findeLage` sind Ort und Postleitzahlgebiet trotzdem willkommen, dann aber
 * ausdrücklich als `genauigkeit: "plz"` oder `"ort"`.
 */
const REGION = new Set(["country", "state", "county", "region"]);
const ORTSTYPEN = new Set(["city", "town", "village", "district", "locality", "suburb", "hamlet", "borough", "postcode"]);

interface PhotonMerkmal {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

function koordinateAus(roh: unknown): Koordinate | null {
  const k = Array.isArray(roh) ? roh : [];
  const lng = Number(k[0]);
  const lat = Number(k[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Der erste Treffer je Genauigkeit aus einer Photon-Antwort. */
function ordnePhoton(features: PhotonMerkmal[], n: NormalisierteAdresse): Partial<Record<Genauigkeit, LageTreffer>> {
  const funde: Partial<Record<Genauigkeit, LageTreffer>> = {};
  for (const f of features) {
    const p = (f?.properties || {}) as Record<string, unknown>;
    const typ = textVon(p.type).toLowerCase();
    if (REGION.has(typ)) continue;
    const koordinate = koordinateAus(f?.geometry?.coordinates);
    if (!koordinate) continue;

    const postleitzahlen = textVon(p.postcode).split(/[;,\s]+/).filter(Boolean);
    const plzGleich = !!n.plz && postleitzahlen.includes(n.plz);
    const plzPasst = !n.plz || postleitzahlen.length === 0 || plzGleich;
    const ortsnamen = [p.city, p.town, p.village, p.locality, p.district, ORTSTYPEN.has(typ) ? p.name : undefined];
    const ortPasst = !!n.ort && ortsnamen.some((o) => gleicherOrt(o, n.ort));
    // Photon liefert zu einer unbekannten Straße bereitwillig eine
    // gleichnamige in einer anderen Stadt. Postleitzahl oder Ort muss passen.
    if (!plzPasst && !ortPasst) continue;

    const lage: Lage = {
      stadtteil: textVon(p.district) || textVon(p.locality) || undefined,
      ort: textVon(p.city) || textVon(p.town) || textVon(p.village) || (ORTSTYPEN.has(typ) ? textVon(p.name) : "") || undefined,
      plz: postleitzahlen[0] || undefined,
    };
    const treffer = (genauigkeit: Genauigkeit) => {
      if (!funde[genauigkeit]) funde[genauigkeit] = { koordinate, genauigkeit, lage, quelle: "photon" };
    };

    if (typ === "house" || textVon(p.housenumber)) {
      if (!n.strasse) continue;
      // Ein Haus in einer anderen Straße ist nicht diese Adresse.
      if (textVon(p.street) && !gleicheStrasse(p.street, n.strasse)) continue;
      if (n.hausnummer && textVon(p.housenumber)) {
        treffer(gleicheHausnummer(p.housenumber, n.hausnummer) ? "adresse" : "strasse");
      } else if (!textVon(p.housenumber) && !textVon(p.street)) {
        // Ein Haus ohne jede Straßenangabe lässt sich nicht gegenprüfen. Es
        // passt aber zu Postleitzahl oder Ort, und so hielt es die Suche schon
        // immer.
        treffer("adresse");
      } else {
        treffer("strasse");
      }
      continue;
    }
    if (typ === "street") {
      if (n.strasse && (!textVon(p.name) || gleicheStrasse(p.name, n.strasse))) treffer("strasse");
      continue;
    }
    if (ORTSTYPEN.has(typ) || typ === "other" || !typ) {
      if (n.strasse && textVon(p.street) && gleicheStrasse(p.street, n.strasse)) {
        treffer("strasse");
        continue;
      }
      if (typ === "postcode" && plzGleich) treffer("plz");
      else if (plzGleich && (typ === "district" || typ === "suburb" || typ === "locality")) treffer("plz");
      else if (ortPasst && ORTSTYPEN.has(typ)) treffer("ort");
    }
  }
  return funde;
}

/** Nominatim-Antwort in dieselbe Form wie Photon bringen, samt Einordnung. */
function ordneNominatim(eintraege: unknown[], n: NormalisierteAdresse): Partial<Record<Genauigkeit, LageTreffer>> {
  const funde: Partial<Record<Genauigkeit, LageTreffer>> = {};
  for (const roh of eintraege) {
    const e = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
    const lat = Number(e.lat);
    const lng = Number(e.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const a = (e.address && typeof e.address === "object" ? e.address : {}) as Record<string, unknown>;
    const art = textVon(e.addresstype).toLowerCase();
    const ort = textVon(a.city) || textVon(a.town) || textVon(a.village) || textVon(a.municipality);
    const postleitzahl = textVon(a.postcode);
    const plzGleich = !!n.plz && postleitzahl.split(/[;,\s]+/).includes(n.plz);
    const ortPasst = !!n.ort && [ort, a.city_district, a.suburb].some((o) => gleicherOrt(o, n.ort));
    if (n.plz && postleitzahl && !plzGleich && !ortPasst) continue;
    const lage: Lage = {
      stadtteil: textVon(a.suburb) || textVon(a.city_district) || textVon(a.quarter) || undefined,
      ort: ort || undefined,
      plz: postleitzahl || undefined,
    };
    const koordinate = { lat, lng };
    const treffer = (genauigkeit: Genauigkeit) => {
      if (!funde[genauigkeit]) funde[genauigkeit] = { koordinate, genauigkeit, lage, quelle: "nominatim" };
    };
    const strasse = textVon(a.road) || textVon(a.pedestrian) || textVon(a.footway);
    if (textVon(a.house_number) && n.strasse && (!strasse || gleicheStrasse(strasse, n.strasse))) {
      treffer(gleicheHausnummer(a.house_number, n.hausnummer) ? "adresse" : "strasse");
    } else if (strasse && n.strasse && gleicheStrasse(strasse, n.strasse)) {
      treffer("strasse");
    } else if (art === "postcode" && plzGleich) {
      treffer("plz");
    } else if (["city", "town", "village", "municipality", "suburb", "city_district", "quarter", "hamlet"].includes(art) && (ortPasst || plzGleich)) {
      treffer(plzGleich && art !== "city" && art !== "town" ? "plz" : "ort");
    }
  }
  return funde;
}

/** Ergebnis eines einzelnen Abrufs: die Daten oder der Grund, warum nicht. */
type Abrufergebnis = { ok: true; daten: unknown } | { ok: false; grund: string };

/**
 * Einen Dienst fragen, mit fester Frist und einer Wiederholung.
 *
 * Wiederholt wird nur, was sich beim zweiten Mal ändern kann: keine Antwort,
 * Zeitüberschreitung, 429 und Fehler des Servers. Die Wiederholung beginnt nur,
 * wenn vor `bis` noch genug Zeit bleibt.
 */
async function frageDienst(
  url: string,
  optionen: { abruf: Abruf; bis: number; fristMs: number; kopf?: Record<string, string>; pauseMs: number },
): Promise<Abrufergebnis> {
  let grund = "";
  for (let versuch = 0; versuch < 2; versuch++) {
    if (versuch > 0 && optionen.pauseMs > 0) await new Promise((r) => setTimeout(r, optionen.pauseMs));
    const rest = optionen.bis - Date.now();
    if (rest < Math.min(1_500, optionen.fristMs)) return { ok: false, grund: grund || "Für die Adresssuche blieb keine Zeit." };
    const steuerung = new AbortController();
    const uhr = setTimeout(() => steuerung.abort(), Math.max(1, Math.min(optionen.fristMs, rest - 500)));
    try {
      const res = await optionen.abruf(url, { signal: steuerung.signal, ...(optionen.kopf ? { headers: optionen.kopf } : {}) });
      if (res.ok) return { ok: true, daten: await res.json() };
      grund = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) return { ok: false, grund };
    } catch {
      grund = steuerung.signal.aborted ? "keine Antwort in der Frist" : "nicht erreichbar";
    } finally {
      clearTimeout(uhr);
    }
  }
  return { ok: false, grund };
}

const photonAdresse = (suche: string) => `https://photon.komoot.io/api/?limit=6&lang=de&q=${encodeURIComponent(suche)}`;

function nominatimAdresse(felder: Record<string, string>): string {
  const q = new URLSearchParams({ format: "jsonv2", addressdetails: "1", limit: "3", countrycodes: "de" });
  for (const [k, v] of Object.entries(felder)) if (v) q.set(k, v);
  return `https://nominatim.openstreetmap.org/search?${q.toString()}`;
}

/** Die Suchzeile für Photon, etwa „Musterstraße 5, 86150 Augsburg“. */
function suchzeile(n: NormalisierteAdresse, mitNummer: boolean): string {
  const strasse = [n.strasse, mitNummer ? n.hausnummer : ""].filter(Boolean).join(" ");
  return [strasse, [n.plz, n.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Adresse zu Koordinaten, über Photon von Komoot, mit Plausibilitätsprüfung.
 *
 * Dieselbe Quelle wie in `src/lib/umgebung.ts`: frei, ohne Schlüssel, auf
 * OpenStreetMap aufgesetzt. Genommen wird nur ein Treffer, der die Straße
 * trifft und zu Postleitzahl oder Ort passt. Photon liefert sonst zu einer
 * unbekannten Straße bereitwillig eine gleichnamige in einer anderen Stadt.
 *
 * Diese Suche findet nur Haus oder Straße, nie den Ortsmittelpunkt. Sie setzt
 * im Exposé die Nadel des Hauses, solange keine Messung vorliegt, und die soll
 * nie auf dem Marktplatz stehen. Die Messung selbst sucht weiter
 * (`findeLage`).
 *
 * `art: "dienst"` heißt: Photon war nicht erreichbar, später erneut
 * versuchen. `art: "adresse"` heißt: Die Adresse gibt es so nicht, ein
 * erneuter Versuch ändert daran nichts.
 */
export async function findeAdresse(
  teile: { adresse?: unknown; plz?: unknown; ort?: unknown; titel?: unknown },
  abruf: Abruf = echterAbruf,
  fristMs: number = PHOTON_FRIST_MS,
): Promise<AdressErgebnis> {
  const n = normalisiereAdresse(teile);
  if (!n.strasse || (!n.plz && !n.ort)) {
    return { ok: false, art: "adresse", grund: "Ohne Straße und Ort lässt sich das Haus nicht finden." };
  }
  // Zwei Suchen mit je einer Wiederholung, dazu etwas Luft.
  const bis = Date.now() + fristMs * 4 + 1_000;
  let dienstFehler = "";
  for (const mitNummer of n.hausnummer ? [true, false] : [false]) {
    const antwort = await frageDienst(photonAdresse(suchzeile(n, mitNummer)), { abruf, bis, fristMs, pauseMs: 0 });
    if (antwort.ok !== true) {
      dienstFehler = (antwort as { grund: string }).grund;
      // Ohne Antwort hilft die zweite Suche ohne Hausnummer auch nicht.
      break;
    }
    const features = ((antwort as { daten: unknown }).daten as { features?: PhotonMerkmal[] } | null)?.features;
    const funde = ordnePhoton(Array.isArray(features) ? features : [], n);
    const bester = funde.adresse ?? funde.strasse;
    if (bester) return { ok: true, ...bester };
  }
  if (dienstFehler) return { ok: false, art: "dienst", grund: `Die Adresssuche war nicht erreichbar (${dienstFehler}).` };
  return {
    ok: false,
    art: "adresse",
    grund: `Die Adresse „${suchzeile(n, true)}“ ließ sich in OpenStreetMap nicht eindeutig finden.`,
  };
}

/**
 * Die Lage eines Objekts für die Messung, mit allen Rückfällen.
 *
 * Der Reihe nach, bis etwas passt:
 *   1. Photon mit Hausnummer. Findet es das Haus, fertig.
 *   2. Nominatim, strukturiert nach Straße, Postleitzahl und Ort. Es kennt
 *      Hausnummern, die Photon nicht kennt.
 *   3. Die Straße ohne Hausnummer, aus einer der beiden Antworten oder mit
 *      einer eigenen Suche.
 *   4. Das Postleitzahlgebiet, über Nominatim.
 *   5. Die Ortsmitte, über Photon.
 *
 * Jeder Schritt hat eine Frist und wird bei Zeitüberschreitung einmal
 * wiederholt, solange vor `bis` Zeit bleibt. Nominatim erlaubt eine Anfrage je
 * Sekunde, dazwischen liegt deshalb mindestens eine Sekunde.
 */
export async function findeLage(
  teile: { adresse?: unknown; plz?: unknown; ort?: unknown; titel?: unknown },
  optionen: { abruf?: Abruf; bis?: number; pauseMs?: number; fristMs?: number } = {},
): Promise<AdressErgebnis> {
  const abruf = optionen.abruf ?? echterAbruf;
  const bis = optionen.bis ?? Date.now() + MESS_BUDGET_MS;
  const pauseMs = optionen.pauseMs ?? 800;
  const fristMs = optionen.fristMs ?? PHOTON_FRIST_MS;
  const n = normalisiereAdresse(teile);
  if (!n.strasse && !n.plz && !n.ort) {
    return { ok: false, art: "adresse", grund: "Am Objekt stehen weder Straße noch Postleitzahl noch Ort." };
  }

  const kopf = { "User-Agent": KENNUNG };
  const dienstFehler: string[] = [];
  let letzteNominatim = 0;
  const photon = async (suche: string) => {
    const antwort = await frageDienst(photonAdresse(suche), { abruf, bis, fristMs, kopf, pauseMs });
    if (antwort.ok !== true) {
      dienstFehler.push(`Photon: ${(antwort as { grund: string }).grund}`);
      return {};
    }
    const features = ((antwort as { daten: unknown }).daten as { features?: PhotonMerkmal[] } | null)?.features;
    return ordnePhoton(Array.isArray(features) ? features : [], n);
  };
  const nominatim = async (felder: Record<string, string>) => {
    const warten = letzteNominatim + 1_100 - Date.now();
    if (warten > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, warten));
    letzteNominatim = Date.now();
    const antwort = await frageDienst(nominatimAdresse(felder), { abruf, bis, fristMs, kopf, pauseMs });
    if (antwort.ok !== true) {
      dienstFehler.push(`Nominatim: ${(antwort as { grund: string }).grund}`);
      return {};
    }
    const daten = (antwort as { daten: unknown }).daten;
    return ordneNominatim(Array.isArray(daten) ? daten : [], n);
  };

  let strassenTreffer: LageTreffer | undefined;
  if (n.strasse && (n.plz || n.ort)) {
    const ausPhoton = await photon(suchzeile(n, true));
    if (ausPhoton.adresse) return { ok: true, ...ausPhoton.adresse };
    strassenTreffer = ausPhoton.strasse;

    const ausNominatim = await nominatim({
      street: [n.hausnummer, n.strasse].filter(Boolean).join(" "),
      postalcode: n.plz,
      city: n.ort,
    });
    if (ausNominatim.adresse) return { ok: true, ...ausNominatim.adresse };
    strassenTreffer = strassenTreffer ?? ausNominatim.strasse;

    if (!strassenTreffer && n.hausnummer) strassenTreffer = (await photon(suchzeile(n, false))).strasse;
    if (strassenTreffer) return { ok: true, ...strassenTreffer };
  }

  if (n.plz) {
    const ausPlz = await nominatim({ postalcode: n.plz });
    const plz = ausPlz.plz ?? ausPlz.ort;
    if (plz) return { ok: true, ...plz, genauigkeit: "plz" };
  }

  if (n.ort || n.plz) {
    const ausOrt = await photon([n.plz, n.ort].filter(Boolean).join(" "));
    const ort = ausOrt.plz ?? ausOrt.ort;
    if (ort) return { ok: true, ...ort };
  }

  if (dienstFehler.length > 0) {
    return { ok: false, art: "dienst", grund: `Die Adresssuche war nicht erreichbar (${dienstFehler.slice(-2).join("; ")}).` };
  }
  return {
    ok: false,
    art: "adresse",
    grund: `Weder die Adresse „${suchzeile(n, true)}“ noch Postleitzahl oder Ort ließen sich in OpenStreetMap finden. Bitte die Adresse am Objekt prüfen.`,
  };
}

/**
 * Adresse zu Koordinaten, nur die Koordinate.
 *
 * Die ältere, schmale Form. Sie bleibt für Aufrufer, die den Grund eines
 * Fehlschlags nicht brauchen.
 */
export async function geokodiere(adresse: string): Promise<Koordinate | null> {
  const teile = adresse.split(",");
  const ergebnis = await findeAdresse({ adresse: teile[0], ort: teile.slice(1).join(",").trim() });
  return ergebnis.ok ? ergebnis.koordinate : null;
}

/**
 * Fassung der gespeicherten Standortanalyse.
 *
 * 1 gab es nie als Feld, das ist die alte, vom Sprachmodell erfundene Form.
 * 2 ist die gemessene. Alles ohne dieses Feld gilt als alt.
 *
 * NICHT ANHEBEN: Exposé, Kundenansicht und Karte lesen eine Analyse nur mit
 * genau dieser Zahl als gemessen. Neuerungen der Messung zählt `MESSFASSUNG`.
 */
export const STANDORT_SCHEMA = 2;

/**
 * Fassung der Messung innerhalb von `STANDORT_SCHEMA` 2.
 *
 * 2 seit dem 23.09.2026 abends: Rückfälle bis zur Ortsmitte samt
 * `genauigkeit`, erweiterter Umkreis für leere Kategorien, dazu Hochschulen,
 * Kliniken und Gewerbegebiete, und `gemessene_adresse`.
 *
 * 3 seit dem 24.09.2026: bis zu zehn Orte je Kategorie, Parks in eigener
 * Liste, Behörden, Drogerien, Einkaufszentren, Kino und Theater (siehe
 * `MESS_KATEGORIEN`).
 *
 * Import und Text-Lauf messen nur bei fehlender Analyse oder geänderter
 * Adresse (`standortAdresseGeaendert`). Das Nachholen (`standort-nachholen`)
 * misst zusätzlich jede Analyse mit kleinerer Fassung neu, gedrosselt. Wer
 * die Messung erweitert, hebt diese Zahl an, dann holt das Nachholen alle
 * Objekte von selbst nach.
 */
export const MESSFASSUNG = 3;

/** Trägt diese gespeicherte Analyse gemessene Daten, oder ist sie die alte? */
export function istGemessen(analyse: unknown): boolean {
  const a = analyse as { schema?: number } | null | undefined;
  return !!a && typeof a === "object" && a.schema === STANDORT_SCHEMA;
}

/** Die Adresse, ab der gemessen wurde, so wie sie damals am Objekt stand. */
export interface GemesseneAdresse {
  adresse: string;
  plz: string;
  ort: string;
}

/** Die Adressfelder eines Objekts, wie `messeStandort` sie in die Analyse schreibt. */
export function gemesseneAdresseAus(objekt: { adresse?: unknown; plz?: unknown; ort?: unknown }): GemesseneAdresse {
  return { adresse: textVon(objekt.adresse), plz: textVon(objekt.plz), ort: textVon(objekt.ort) };
}

/**
 * Die Adresse in Vergleichsform.
 *
 * Beide Seiten gehen durch dieselbe Bereinigung (`normalisiereAdresse`):
 * Leerzeichen, Groß- und Kleinschreibung, „Str.“ gegen „Straße“, Zusätze wie
 * „(All-inclusive)“ oder „4er WG“ und eine doppelte Hausnummer ändern nichts.
 * Eine andere Straße, Hausnummer, Postleitzahl oder ein anderer Ort schon.
 * Findet die Bereinigung keine Straße, zählt das Adressfeld selbst, klein und
 * mit einfachen Leerzeichen, damit auch dann jede Änderung auffällt.
 */
function adressVergleich(objekt: { adresse?: unknown; plz?: unknown; ort?: unknown }): string {
  const n = normalisiereAdresse({ adresse: objekt.adresse, plz: objekt.plz, ort: objekt.ort });
  const strasse = n.strasse
    ? `${vergleichsform(n.strasse)}#${vergleichsform(n.hausnummer)}`
    : textVon(objekt.adresse).toLowerCase();
  return [strasse, n.plz, ortKernForm(n.ort).replace(/[^a-z0-9]+/g, "")].join("|");
}

/**
 * Hat sich die Adresse seit der Messung geändert, oder fehlt die Messung?
 *
 * Christians Entscheidung vom 23.09.2026: Eine gemessene Analyse gilt
 * dauerhaft. Neu gemessen wird nur, wenn sie fehlt, wenn sich die Adresse
 * geändert hat, oder wenn Admin oder Inhaber es ausdrücklich wollen. Dafür
 * trägt jede Analyse seit diesem Tag `gemessene_adresse`, geschrieben von
 * `messeStandort`.
 *
 * true heißt: messen. Das gilt ohne Analyse, bei einer Analyse ohne
 * `schema: 2` und bei einer ohne `gemessene_adresse`. Bei der letzten lässt
 * sich eine Adressänderung nicht erkennen, und manche dieser älteren
 * Analysen sind leer, weil Overpass damals still scheiterte. Sie wird deshalb
 * einmal neu gemessen und trägt danach die Adresse.
 *
 * DIESER HELFER IST GEMEINSAM: Der Text-Lauf (`objekt-texte-ki`) und der
 * Investagon-Import entscheiden beide hierüber, nie mit eigener Rechnung.
 */
export function standortAdresseGeaendert(
  analyse: unknown,
  objekt: { adresse?: unknown; plz?: unknown; ort?: unknown },
): boolean {
  if (!istGemessen(analyse)) return true;
  const gemessen = (analyse as { gemessene_adresse?: unknown }).gemessene_adresse;
  if (!gemessen || typeof gemessen !== "object" || Array.isArray(gemessen)) return true;
  return adressVergleich(gemessen as GemesseneAdresse) !== adressVergleich(objekt);
}

const GENAUIGKEITEN: readonly Genauigkeit[] = ["adresse", "strasse", "plz", "ort"];
const QUELLEN: readonly KoordinatenQuelle[] = ["photon", "nominatim", "investagon"];

/**
 * Die Lage aus einer früheren Messung derselben Adresse, für eine neue
 * Messung ohne neue Adresssuche.
 *
 * Wenn nur die Messfassung steigt, ist die Adresse dieselbe, und die
 * Adresssuche fände denselben Punkt. Photon und Nominatim zum zweiten Mal zu
 * fragen, belastete nur die Dienste (Nominatim erlaubt eine Anfrage je
 * Sekunde und bittet ausdrücklich, Ergebnisse wiederzuverwenden). Genommen
 * wird die Lage deshalb nur, wenn die Analyse gemessen ist und ihre Adresse
 * noch zur Adresse am Objekt passt (`standortAdresseGeaendert`); sonst
 * `undefined`, und es wird wie bisher gesucht. Genauigkeit und Lage gehen
 * mit, damit der Hinweis „ab der Ortsmitte“ stehen bleibt.
 */
export function bekannteLageAusAnalyse(
  analyse: unknown,
  objekt: { adresse?: unknown; plz?: unknown; ort?: unknown },
): { lat: number; lng: number; quelle?: KoordinatenQuelle; genauigkeit?: Genauigkeit; lage?: Lage } | undefined {
  if (standortAdresseGeaendert(analyse, objekt)) return undefined;
  const a = analyse as { objekt_koordinaten?: unknown; genauigkeit?: unknown; koordinaten_quelle?: unknown; lage?: unknown };
  const k = (a.objekt_koordinaten && typeof a.objekt_koordinaten === "object" ? a.objekt_koordinaten : {}) as Record<string, unknown>;
  const lat = Number(k.lat);
  const lng = Number(k.lng);
  if (typeof k.lat !== "number" || typeof k.lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const genauigkeit = GENAUIGKEITEN.includes(a.genauigkeit as Genauigkeit) ? (a.genauigkeit as Genauigkeit) : undefined;
  const quelle = QUELLEN.includes(a.koordinaten_quelle as KoordinatenQuelle) ? (a.koordinaten_quelle as KoordinatenQuelle) : undefined;
  const roheLage = (a.lage && typeof a.lage === "object" ? a.lage : {}) as Record<string, unknown>;
  const lage: Lage = {};
  for (const feld of ["stadtteil", "ort", "plz"] as const) if (textVon(roheLage[feld])) lage[feld] = textVon(roheLage[feld]);
  return {
    lat,
    lng,
    ...(quelle ? { quelle } : {}),
    ...(genauigkeit ? { genauigkeit } : {}),
    ...(Object.keys(lage).length > 0 ? { lage } : {}),
  };
}

/** Kurzer Satz zur Herkunft, so wie er unter den Listen im Exposé steht. */
export const HERKUNFT_HINWEIS_MIKROLAGE =
  "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage.";

/** Wenn OpenStreetMap in der Umgebung nichts kennt. */
export const HERKUNFT_HINWEIS_LEER =
  "Zu dieser Adresse sind in OpenStreetMap keine Einrichtungen erfasst. Das heißt nicht, dass es keine gibt.";

/** Unter der Arbeitgebertabelle. Die Liste ist geschätzt, nicht erhoben. */
export const HERKUNFT_HINWEIS_ARBEITGEBER =
  "Auswahl bekannter Arbeitgeber der Region, modelliert und ohne Anspruch auf Vollständigkeit. Keine amtliche Erhebung.";

/** Der Herkunftssatz, passend zur Genauigkeit der Messung. */
export function herkunftHinweis(genauigkeit: Genauigkeit, lage: Lage, leer: boolean): string {
  if (leer) return HERKUNFT_HINWEIS_LEER;
  if (genauigkeit === "strasse") {
    return `${HERKUNFT_HINWEIS_MIKROLAGE} Gemessen ab der Straße, die Hausnummer ist in OpenStreetMap nicht erfasst.`;
  }
  if (genauigkeit === "plz") {
    return `${HERKUNFT_HINWEIS_MIKROLAGE} Gemessen ab dem Mittelpunkt des Postleitzahlgebiets${lage.plz ? ` ${lage.plz}` : ""}, nicht ab der Hausadresse.`;
  }
  if (genauigkeit === "ort") {
    return `${HERKUNFT_HINWEIS_MIKROLAGE} Gemessen ab der Ortsmitte${lage.ort ? ` von ${lage.ort}` : ""}, nicht ab der Hausadresse.`;
  }
  return HERKUNFT_HINWEIS_MIKROLAGE;
}

/**
 * Die gemessene Standortanalyse, so wie sie unter `meta.standortanalyse` liegt.
 *
 * Dieselbe Form wie `StandortAnalyse` in `src/lib/standortanalyse.ts`, nur
 * mit den Feldern, für die es eine Messung gibt. Arbeitgeber und Makrolage
 * fehlen mit Absicht: Für beides gibt es hier keine Quelle, und eine
 * erfundene Einwohnerzahl ist genau das, was diese Umstellung beenden soll.
 */
export interface GemesseneStandortAnalyse {
  schema: number;
  /** Fassung der Messung, siehe `MESSFASSUNG`. Fehlt bei Messungen der ersten Fassung. */
  messfassung?: number;
  /** Zeitpunkt der Messung, ISO. */
  gemessen_am: string;
  objekt_koordinaten: Koordinate;
  /** Ab wo gemessen wurde, siehe `Genauigkeit`. Fehlt bei Messungen der ersten Fassung. */
  genauigkeit?: Genauigkeit;
  /** Woher die Koordinate des Objekts stammt. */
  koordinaten_quelle?: KoordinatenQuelle;
  /** Stadtteil, Ort und Postleitzahl laut Adresssuche, soweit bekannt. */
  lage?: Lage;
  mikrolage: GemesseneMikrolage;
  mikrolage_hinweis: string;
  /** Kategorien, die erst im erweiterten Umkreis etwas fanden. */
  erweiterter_umkreis?: MikrolageSchluessel[];
  /** Die Adresse, ab der gemessen wurde, siehe `standortAdresseGeaendert`. Fehlt bei Messungen vor dem 23.09.2026 abends. */
  gemessene_adresse?: GemesseneAdresse;
}

/**
 * Ergebnis einer Messung, bei einem Fehlschlag mit Art und Grund.
 *
 * `lage` steht auch bei einem Fehlschlag dabei, sobald die Adresssuche
 * gelungen ist: Die Koordinate des Hauses ist dann bekannt, auch wenn
 * Overpass danach ausfiel, und die Karte im Exposé braucht sie
 * (`koordinatenInMeta`).
 */
export type Messergebnis =
  | { ok: true; analyse: GemesseneStandortAnalyse; lage?: LageTreffer }
  | { ok: false; art: "adresse" | "dienst"; grund: string; lage?: LageTreffer };

/** Overpass fragen, bei einem Fehlschlag einmal wiederholen, solange vor `bis` Zeit bleibt. */
async function holeMitWiederholung(
  k: Koordinate,
  abfrage: string,
  abruf: Abruf,
  bis: number,
  pauseMs: number,
): Promise<OverpassElement[]> {
  let letzterFehler: unknown = new Error("Für Overpass blieb keine Zeit.");
  for (let versuch = 0; versuch < 2; versuch++) {
    const rest = bis - Date.now();
    if (rest < 5_000) break;
    if (versuch > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs * 2));
    try {
      return await holeOverpassElemente(k.lat, k.lng, abruf, Math.min(OVERPASS_FRIST_MS, bis - Date.now() - 500), abfrage);
    } catch (e) {
      letzterFehler = e;
    }
  }
  throw letzterFehler;
}

/**
 * Den Standort eines Objekts messen: Lage finden, Umgebung abfragen,
 * Luftlinien rechnen.
 *
 * Die eine Stelle, an der das passiert. `generate-standortanalyse` (Exposé)
 * und `objekt-texte-ki` (Standortargumente) rufen beide hierher, damit im
 * Exposé und in den Argumenten dieselben Zahlen stehen.
 *
 * Bei einem Fehlschlag gibt es keine Analyse, auch keine halbe. `art`
 * unterscheidet, ob es sich lohnt, später erneut zu messen ("dienst") oder
 * nicht ("adresse"). Liefert Overpass auch im erweiterten Umkreis keine
 * einzige Einrichtung, gilt das als Störung und nicht als Messung: Irgendwo
 * im Umkreis von drei Kilometern gibt es in Deutschland praktisch immer eine
 * Haltestelle, und eine gespeicherte leere Messung hätte jede weitere
 * verhindert.
 */
export async function messeStandort(
  teile: { adresse?: unknown; plz?: unknown; ort?: unknown; titel?: unknown },
  optionen: {
    abruf?: Abruf;
    jetzt?: Date;
    bis?: number;
    pauseMs?: number;
    /**
     * Eine schon bekannte Koordinate des Hauses, etwa aus Investagon. Dann
     * entfällt die Adresssuche, gemessen wird ab genau diesem Punkt.
     *
     * `genauigkeit` und `lage` stehen dabei, wenn die Koordinate aus einer
     * früheren Messung derselben Adresse stammt (`bekannteLageAusAnalyse`).
     * Ohne Angabe gilt sie als hausgenau, wie bei Investagon.
     */
    koordinate?: { lat: number; lng: number; quelle?: KoordinatenQuelle; genauigkeit?: Genauigkeit; lage?: Lage } | null;
  } = {},
): Promise<Messergebnis> {
  const abruf = optionen.abruf ?? echterAbruf;
  const bis = optionen.bis ?? Date.now() + MESS_BUDGET_MS;
  const pauseMs = optionen.pauseMs ?? 800;

  let treffer: LageTreffer;
  const bekannt = optionen.koordinate;
  if (bekannt && Number.isFinite(bekannt.lat) && Number.isFinite(bekannt.lng)) {
    const n = normalisiereAdresse(teile);
    treffer = {
      koordinate: { lat: bekannt.lat, lng: bekannt.lng },
      genauigkeit: bekannt.genauigkeit ?? "adresse",
      lage: bekannt.lage ?? { ...(n.ort ? { ort: n.ort } : {}), ...(n.plz ? { plz: n.plz } : {}) },
      quelle: bekannt.quelle ?? "investagon",
    };
  } else {
    const gefunden = await findeLage(teile, { abruf, bis, pauseMs });
    // Ausdrücklich ausgepackt: Der Browser-Teil prüft ohne `strict`, und dort
    // engt TypeScript die Vereinigung über `ok` nicht ein.
    if (gefunden.ok !== true) {
      const fehlschlag = gefunden as { art: "adresse" | "dienst"; grund: string };
      return { ok: false, art: fehlschlag.art, grund: fehlschlag.grund };
    }
    treffer = gefunden as LageTreffer;
  }
  const k = treffer.koordinate;

  let elemente: OverpassElement[];
  try {
    elemente = await holeMitWiederholung(k, baueOverpassAbfrage(k.lat, k.lng), abruf, bis, pauseMs);
  } catch (e) {
    const grund = e instanceof Error && e.message ? ` (${e.message})` : "";
    return { ok: false, art: "dienst", grund: `OpenStreetMap (Overpass) war nicht erreichbar${grund}.`, lage: treffer };
  }
  const mikrolage = werteOverpassAus(elemente, k);

  // Leere Kategorien einmal mit größerem Radius nachfragen. Scheitert das,
  // bleibt es bei der ersten Antwort.
  const leer = MESS_KATEGORIEN.filter((kat) => !mikrolage[kat.key]);
  const erweitert: MikrolageSchluessel[] = [];
  if (leer.length > 0 && bis - Date.now() >= 6_000) {
    try {
      const mehr = await holeOverpassElemente(
        k.lat,
        k.lng,
        abruf,
        Math.min(OVERPASS_FRIST_MS, bis - Date.now() - 500),
        baueOverpassAbfrage(k.lat, k.lng, leer, ERWEITERUNG),
      );
      const zusatz = werteOverpassAus(mehr, k, leer, ERWEITERUNG);
      for (const kat of leer) {
        if (zusatz[kat.key]) {
          mikrolage[kat.key] = zusatz[kat.key];
          erweitert.push(kat.key);
        }
      }
    } catch {
      // Der erweiterte Umkreis ist eine Zugabe, die erste Messung gilt.
    }
  }

  if (Object.keys(mikrolage).length === 0) {
    return {
      ok: false,
      art: "dienst",
      grund: "OpenStreetMap lieferte auch im erweiterten Umkreis keine einzige Einrichtung. Meist ist das eine Störung des Dienstes, ein erneuter Versuch lohnt sich.",
      lage: treffer,
    };
  }

  return {
    ok: true,
    lage: treffer,
    analyse: {
      schema: STANDORT_SCHEMA,
      messfassung: MESSFASSUNG,
      gemessen_am: (optionen.jetzt ?? new Date()).toISOString(),
      objekt_koordinaten: k,
      genauigkeit: treffer.genauigkeit,
      koordinaten_quelle: treffer.quelle,
      gemessene_adresse: gemesseneAdresseAus(teile),
      lage: Object.fromEntries(Object.entries(treffer.lage || {}).filter(([, v]) => !!v)) as Lage,
      mikrolage,
      mikrolage_hinweis: herkunftHinweis(treffer.genauigkeit, treffer.lage || {}, false),
      ...(erweitert.length > 0 ? { erweiterter_umkreis: erweitert } : {}),
    },
  };
}

/**
 * Die gemessene Analyse in ein `meta` legen, alles andere bleibt stehen.
 *
 * Zwei Schlüssel, wie seit jeher: die Analyse selbst und ihr Zeitpunkt, an
 * dem `generate-standortanalyse` das Alter abliest.
 */
export function standortInMeta(
  meta: Record<string, unknown> | null | undefined,
  analyse: GemesseneStandortAnalyse,
): Record<string, unknown> {
  return {
    ...(meta || {}),
    standortanalyse: analyse,
    standortanalyse_generated_at: analyse.gemessen_am,
  };
}

/**
 * Die Koordinate des Hauses, so wie sie unter `meta.koordinaten` liegt.
 *
 * Die Karte im Exposé sucht seit dem 23.09.2026 nicht mehr selbst im
 * Browser, sie nimmt nur, was hier gespeichert ist. `genauigkeit` sagt ihr,
 * ob der Punkt das Haus ist oder nur die Straße.
 */
export interface GespeicherteKoordinaten {
  lat: number;
  lng: number;
  quelle: KoordinatenQuelle;
  /** Zeitpunkt, ISO. */
  am: string;
  genauigkeit?: Genauigkeit;
}

/** Die gespeicherte Koordinate eines Objekts, defensiv gelesen. */
export function gespeicherteKoordinaten(meta: unknown): GespeicherteKoordinaten | undefined {
  const roh = (meta && typeof meta === "object" ? (meta as Record<string, unknown>).koordinaten : undefined) as
    | Record<string, unknown>
    | undefined;
  if (!roh || typeof roh !== "object") return undefined;
  const lat = Number(roh.lat);
  const lng = Number(roh.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return undefined;
  const quelle = textVon(roh.quelle) as KoordinatenQuelle;
  const genauigkeit = textVon(roh.genauigkeit) as Genauigkeit;
  return {
    lat,
    lng,
    quelle,
    am: textVon(roh.am),
    ...(["adresse", "strasse", "plz", "ort"].includes(genauigkeit) ? { genauigkeit } : {}),
  };
}

/** Die Koordinate aus Investagon, falls der Import eine gesetzt hat. Sie hat Vorrang vor jeder Suche. */
export function koordinatenAusInvestagon(meta: unknown): GespeicherteKoordinaten | undefined {
  const k = gespeicherteKoordinaten(meta);
  return k?.quelle === "investagon" ? k : undefined;
}

/**
 * Die gefundene Koordinate in ein `meta` legen, alles andere bleibt stehen.
 *
 * Geschrieben wird nur, wenn die Suche das Haus oder wenigstens die Straße
 * gefunden hat. Ein Postleitzahlgebiet oder die Ortsmitte ist nicht die Lage
 * des Hauses, und die Karte setzt an diese Stelle die Nadel des Hauses. Eine
 * Koordinate aus Investagon bleibt immer stehen.
 */
export function koordinatenInMeta(
  meta: Record<string, unknown> | null | undefined,
  treffer: LageTreffer,
  jetzt: Date = new Date(),
): Record<string, unknown> {
  // Ohne Änderung kommt dasselbe Objekt zurück, damit der Aufrufer sieht,
  // dass es nichts zu schreiben gibt.
  const basis = (meta || {}) as Record<string, unknown>;
  if (koordinatenAusInvestagon(basis)) return basis;
  if (treffer.quelle === "investagon") return basis;
  if (treffer.genauigkeit !== "adresse" && treffer.genauigkeit !== "strasse") return basis;
  const neu: Record<string, unknown> = { ...basis };
  const eintrag: GespeicherteKoordinaten = {
    lat: treffer.koordinate.lat,
    lng: treffer.koordinate.lng,
    quelle: treffer.quelle,
    am: jetzt.toISOString(),
    genauigkeit: treffer.genauigkeit,
  };
  neu.koordinaten = eintrag;
  return neu;
}
