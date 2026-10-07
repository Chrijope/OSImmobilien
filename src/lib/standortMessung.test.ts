/**
 * Wachhund über der gemessenen Standortanalyse.
 *
 * Die Logik liegt in `supabase/functions/_shared/standort-messung.ts`, weil
 * die Edge Function in Deno läuft und nichts aus `src/` importieren kann.
 * Getestet wird von hier, so wie bei `kontakt-dublette` und
 * `pipeline-schwellen`.
 *
 * Worum es geht: Vorher hat ein Sprachmodell die Entfernungen zu Kindergärten
 * und Haltestellen aufgeschrieben, und die Zahlen standen anschließend in
 * einer Verkaufsunterlage. Jetzt werden sie gerechnet. Diese Tests halten die
 * Rechnung und das Einsortieren fest, vor allem den Fall, dass OpenStreetMap
 * nichts kennt: Dann muss die Kategorie fehlen und darf nicht mit irgendetwas
 * gefüllt werden.
 */
import { describe, it, expect } from "vitest";
import {
  entfernungMeter,
  schultyp,
  baueOverpassAbfrage,
  werteOverpassAus,
  istGemessen,
  STANDORT_SCHEMA,
  MESSFASSUNG,
  MESS_KATEGORIEN,
  KENNUNG,
  OVERPASS_FRIST_MS,
  OVERPASS_SPIEGEL,
  findeAdresse,
  findeLage,
  gespeicherteKoordinaten,
  holeOverpassElemente,
  koordinatenAusInvestagon,
  koordinatenInMeta,
  messeStandort,
  bekannteLageAusAnalyse,
  gemesseneAdresseAus,
  OVERPASS_HOECHSTZAHL,
  normalisiereAdresse,
  standortAdresseGeaendert,
  standortInMeta,
  HERKUNFT_HINWEIS_LEER,
  HERKUNFT_HINWEIS_MIKROLAGE,
  type Abruf,
  type GemesseneStandortAnalyse,
} from "../../supabase/functions/_shared/standort-messung.ts";

const MUENCHEN = { lat: 48.1372, lng: 11.5756 };

describe("entfernungMeter", () => {
  it("gibt für denselben Punkt null zurück", () => {
    expect(entfernungMeter(MUENCHEN, MUENCHEN)).toBe(0);
  });

  it("rechnet einen Breitengrad mit rund 111 Kilometern", () => {
    const meter = entfernungMeter({ lat: 48, lng: 11 }, { lat: 49, lng: 11 });
    expect(meter).toBeGreaterThan(111_000);
    expect(meter).toBeLessThan(111_600);
  });

  it("rechnet München nach Berlin auf rund 504 Kilometer", () => {
    // Bekannte Luftlinie, rund 504 km. Toleranz, weil Haversine die Erde als
    // Kugel nimmt und nicht als Ellipsoid.
    const meter = entfernungMeter(MUENCHEN, { lat: 52.52, lng: 13.405 });
    expect(meter / 1000).toBeGreaterThan(500);
    expect(meter / 1000).toBeLessThan(510);
  });

  it("ist symmetrisch", () => {
    const a = { lat: 48.1, lng: 11.5 };
    const b = { lat: 48.2, lng: 11.7 };
    expect(entfernungMeter(a, b)).toBe(entfernungMeter(b, a));
  });

  it("liefert ganze Meter", () => {
    const meter = entfernungMeter(MUENCHEN, { lat: 48.1381, lng: 11.5762 });
    expect(Number.isInteger(meter)).toBe(true);
  });
});

describe("schultyp", () => {
  it("liest den Typ aus dem gepflegten Tag", () => {
    expect(schultyp({ "school:DE": "gymnasium", name: "Städtische Schule" })).toBe("Gymnasium");
  });

  it("liest den Typ ersatzweise aus dem Namen", () => {
    expect(schultyp({ name: "Grundschule Am Anger" })).toBe("Grundschule");
    expect(schultyp({ name: "Berufskolleg Nord" })).toBe("Berufskolleg");
  });

  it("kommt mit der Schreibweise ohne Umlaut zurecht", () => {
    expect(schultyp({ name: "Foerderschule Sonnenhang" })).toBe("Förderschule");
  });

  it("bleibt bei Schule, wenn nichts abzulesen ist", () => {
    expect(schultyp({ name: "Anne Frank Schulzentrum" })).toBe("Schule");
    expect(schultyp(undefined)).toBe("Schule");
  });
});

describe("baueOverpassAbfrage", () => {
  const abfrage = baueOverpassAbfrage(MUENCHEN.lat, MUENCHEN.lng);

  it("setzt das Präfix nwr vor jeden Filter", () => {
    // Ohne `nwr` antwortet Overpass mit "parse error: Unknown type [".
    const filterAnzahl = MESS_KATEGORIEN.reduce((n, k) => n + k.filter.length, 0);
    expect(abfrage.match(/nwr\[/g)?.length).toBe(filterAnzahl);
  });

  it("holt für Flächen den Mittelpunkt mit", () => {
    // Ohne `out center` fehlen Schulen und Kliniken, die als Umriss erfasst sind.
    expect(abfrage).toContain("out center");
  });

  it("enthält die Koordinaten und einen Radius je Filter", () => {
    expect(abfrage).toContain(`around:1000,${MUENCHEN.lat},${MUENCHEN.lng}`);
    expect(abfrage).toContain('["amenity"="pharmacy"]');
    expect(abfrage).toContain('["highway"="bus_stop"]');
  });

  it("fragt nur Einträge mit Namen, und zwar hinter dem Umkreis, sonst läuft Overpass in die Zeitgrenze", () => {
    expect(abfrage.match(/\)\(if:is_tag\("name"\)\);/g)?.length).toBe(abfrage.match(/nwr\[/g)?.length);
    expect(abfrage).not.toContain('["name"]');
  });

  it("sucht Arbeitsorte der Region: Kliniken, Hochschulen und Gewerbegebiete", () => {
    expect(abfrage).toContain('["amenity"="hospital"]');
    expect(abfrage).toContain('["amenity"="university"]');
    expect(abfrage).toContain('["landuse"="industrial"]');
  });
});

describe("werteOverpassAus", () => {
  const nah = { lat: 48.1381, lng: 11.5762 }; // rund 110 m entfernt

  it("misst die Entfernung und übernimmt den Typ", () => {
    const ergebnis = werteOverpassAus(
      [{ id: 1, lat: nah.lat, lon: nah.lng, tags: { shop: "supermarket", name: "Edeka Mitte" } }],
      MUENCHEN,
    );
    expect(ergebnis.einkaufen).toHaveLength(1);
    expect(ergebnis.einkaufen![0].name).toBe("Edeka Mitte");
    expect(ergebnis.einkaufen![0].typ).toBe("Supermarkt");
    expect(ergebnis.einkaufen![0].entfernung_m).toBe(entfernungMeter(MUENCHEN, nah));
  });

  it("lässt eine Kategorie ganz weg, statt sie leer zu führen", () => {
    const ergebnis = werteOverpassAus([], MUENCHEN);
    expect(ergebnis).toEqual({});
    expect(ergebnis.kindergaerten).toBeUndefined();
  });

  it("wirft Einträge ohne Namen weg", () => {
    // "Kindergarten, 300 m" ohne Namen sieht im Exposé aus wie ein vergessener
    // Platzhalter.
    const ergebnis = werteOverpassAus(
      [{ id: 1, lat: nah.lat, lon: nah.lng, tags: { amenity: "kindergarten" } }],
      MUENCHEN,
    );
    expect(ergebnis.kindergaerten).toBeUndefined();
  });

  it("wirft Treffer jenseits des Radius weg", () => {
    // Overpass liefert alle Filter in einem Topf, ein Bahnhof in 5 km kann so
    // in der Antwort auf die Bäckerabfrage mitkommen.
    const weit = { lat: 48.25, lng: 11.5756 };
    const ergebnis = werteOverpassAus(
      [{ id: 1, lat: weit.lat, lon: weit.lng, tags: { shop: "bakery", name: "Weit weg" } }],
      MUENCHEN,
    );
    expect(ergebnis.einkaufen).toBeUndefined();
  });

  it("nimmt den Mittelpunkt, wenn der Ort als Fläche erfasst ist", () => {
    const ergebnis = werteOverpassAus(
      [{ id: 1, center: { lat: nah.lat, lon: nah.lng }, tags: { amenity: "school", name: "Grundschule Nord" } }],
      MUENCHEN,
    );
    expect(ergebnis.schulen).toHaveLength(1);
    expect(ergebnis.schulen![0].typ).toBe("Grundschule");
  });

  it("führt denselben Namen nur einmal, den näheren", () => {
    // Bushaltestellen liegen paarweise links und rechts der Straße.
    const ergebnis = werteOverpassAus(
      [
        { id: 1, lat: 48.1400, lon: 11.5762, tags: { highway: "bus_stop", name: "Rathaus" } },
        { id: 2, lat: nah.lat, lon: nah.lng, tags: { highway: "bus_stop", name: "Rathaus" } },
      ],
      MUENCHEN,
    );
    expect(ergebnis.oepnv).toHaveLength(1);
    // Der nähere bleibt, auch wenn Overpass ihn als zweiten liefert.
    expect(ergebnis.oepnv![0].entfernung_m).toBe(entfernungMeter(MUENCHEN, nah));
  });

  it("sortiert nach Entfernung und deckelt die Zahl der Einträge", () => {
    const elemente = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      lat: 48.1372 + 0.001 * (8 - i),
      lon: 11.5756,
      tags: { amenity: "kindergarten", name: `Kita ${i}` },
    }));
    const ergebnis = werteOverpassAus(elemente, MUENCHEN);
    // Seit der Messfassung 3 fünf Kitas, die nächstgelegenen.
    expect(ergebnis.kindergaerten).toHaveLength(5);
    const abstaende = ergebnis.kindergaerten!.map((o) => o.entfernung_m);
    expect([...abstaende].sort((a, b) => a - b)).toEqual(abstaende);
  });
});

describe("istGemessen", () => {
  it("erkennt die gemessene Fassung", () => {
    expect(istGemessen({ schema: STANDORT_SCHEMA })).toBe(true);
  });

  it("hält eine alte Analyse ohne Schema für nicht gemessen", () => {
    // Genau diese Datensätze hat das Sprachmodell erfunden.
    expect(istGemessen({ mikrolage: { kindergaerten: [{ name: "Kita", entfernung_m: 300 }] } })).toBe(false);
    expect(istGemessen(null)).toBe(false);
    expect(istGemessen(undefined)).toBe(false);
  });
});

/*
 * Der ganze Messaufbau, ohne Netz.
 *
 * Seit dem 23.09.2026 misst `generate-standortanalyse` und `objekt-texte-ki`
 * über `messeStandort`, statt ein Sprachmodell raten zu lassen. Geprüft wird,
 * dass aus Adresssuche und Overpass genau die Form wird, die das Exposé liest,
 * dass nichts dazukommt, wofür es keine Quelle gibt, und dass ein Fehlschlag
 * sagt, ob sich ein neuer Versuch lohnt.
 */
const antwort = (daten: unknown, status = 200) => ({ ok: status < 400, status, json: async () => daten });

const photonTreffer = (props: Record<string, unknown>, lng = MUENCHEN.lng, lat = MUENCHEN.lat) => ({
  features: [{ geometry: { coordinates: [lng, lat] }, properties: props }],
});

/** Eine Attrappe für `fetch` je Dienst, die mitschreibt, was gefragt wurde. */
function dienste(teil: {
  photon?: (url: string) => unknown;
  nominatim?: (url: string) => unknown;
  overpass?: (body: string, url: string) => { daten: unknown; status?: number } | Promise<never>;
}) {
  const aufrufe: Array<{ url: string; body?: string; headers?: Record<string, string> }> = [];
  const abruf: Abruf = async (url, init) => {
    aufrufe.push({ url, body: init?.body, headers: init?.headers });
    if (url.includes("photon")) {
      if (!teil.photon) throw new Error("kein Photon");
      return antwort(teil.photon(decodeURIComponent(url)));
    }
    if (url.includes("nominatim")) {
      if (!teil.nominatim) throw new Error("kein Nominatim");
      return antwort(teil.nominatim(decodeURIComponent(url)));
    }
    if (!teil.overpass) throw new Error("kein Overpass");
    const o = await teil.overpass(init?.body || "", url);
    return antwort(o.daten, o.status ?? 200);
  };
  return { abruf, aufrufe };
}

const JETZT = new Date("2026-09-23T08:00:00.000Z");
const MUSTER = { adresse: "Marienplatz 8", plz: "80331", ort: "München" };
const HAUS = { type: "house", street: "Marienplatz", housenumber: "8", postcode: "80331", city: "München", district: "Altstadt" };
const OPTIONEN = { jetzt: JETZT, pauseMs: 0 };

describe("normalisiereAdresse", () => {
  it("trennt Konzept, Klammern und eine doppelte Hausnummer ab", () => {
    expect(normalisiereAdresse({ adresse: "4er WG, Bruno-Walter-Ring 36 36 (All-inclusive)", plz: "81927", ort: "München" })).toEqual({
      strasse: "Bruno-Walter-Ring",
      hausnummer: "36",
      plz: "81927",
      ort: "München",
    });
    expect(normalisiereAdresse({ adresse: "Ossecker Straße 42 (All-inclusive-Modell)", plz: "95028", ort: "Hof" })).toMatchObject({
      strasse: "Ossecker Straße",
      hausnummer: "42",
    });
  });

  it("holt Postleitzahl und Ort aus dem Adressfeld und schreibt „Str.“ aus", () => {
    expect(normalisiereAdresse({ adresse: "Musterstr.5, 86150 Augsburg" })).toEqual({
      strasse: "Musterstraße",
      hausnummer: "5",
      plz: "86150",
      ort: "Augsburg",
    });
  });

  it("hält eine Ordnungszahl im Straßennamen nicht für die Hausnummer", () => {
    expect(normalisiereAdresse({ adresse: "Straße des 17. Juni 135", plz: "10623", ort: "Berlin" })).toMatchObject({
      strasse: "Straße des 17. Juni",
      hausnummer: "135",
    });
  });

  it("nimmt „12 a“ als 12a, von „12-14“ die erste Nummer und lässt „WE 3“ weg", () => {
    expect(normalisiereAdresse({ adresse: "Am Anger 12 a", ort: "Erfurt" }).hausnummer).toBe("12a");
    expect(normalisiereAdresse({ adresse: "Am Anger 12-14", ort: "Erfurt" }).hausnummer).toBe("12");
    expect(normalisiereAdresse({ adresse: "Musterweg 5 WE 3", ort: "Erfurt" })).toMatchObject({ strasse: "Musterweg", hausnummer: "5" });
  });

  it("kürzt Hausnummernbereiche wie „5-9“, „5 bis 9“ und „5/7“ auf die erste Nummer (Zossen, 01.10.2026)", () => {
    for (const adresse of ["Brandenburgische Straße 5-9", "Brandenburgische Straße 5 bis 9", "Brandenburgische Straße 5 - 9", "Brandenburgische Straße 5/7"]) {
      expect(normalisiereAdresse({ adresse, plz: "15806", ort: "Zossen" })).toMatchObject({ strasse: "Brandenburgische Straße", hausnummer: "5" });
    }
  });

  it("gibt einer Postleitzahl als Zahl die führende Null zurück", () => {
    expect(normalisiereAdresse({ adresse: "Prager Straße 1", plz: 1069, ort: "Dresden" }).plz).toBe("01069");
  });

  it("liest die Straße aus dem Titel, wenn das Adressfeld leer ist", () => {
    expect(normalisiereAdresse({ adresse: "", plz: "95028", ort: "Hof", titel: "01. Hof, Ossecker Straße 42 (All-inclusive-Modell)" })).toMatchObject({
      strasse: "Ossecker Straße",
      hausnummer: "42",
    });
  });
});

describe("standortAdresseGeaendert, der gemeinsame Helfer für Text-Lauf und Import", () => {
  const analyse = {
    schema: STANDORT_SCHEMA,
    gemessene_adresse: { adresse: "Ossecker Straße 42", plz: "95028", ort: "Hof" },
  };

  it("sagt ja, wenn es keine Analyse gibt, sie nicht gemessen ist oder keine Adresse trägt", () => {
    expect(standortAdresseGeaendert(undefined, { adresse: "Ossecker Straße 42", plz: "95028", ort: "Hof" })).toBe(true);
    expect(standortAdresseGeaendert({ ...analyse, schema: undefined }, analyse.gemessene_adresse)).toBe(true);
    // Vor dem 23.09.2026 abends gemessen: Eine Adressänderung ließe sich nicht erkennen.
    expect(standortAdresseGeaendert({ schema: STANDORT_SCHEMA }, analyse.gemessene_adresse)).toBe(true);
  });

  it("sagt nein bei derselben Adresse in anderer Schreibweise", () => {
    expect(standortAdresseGeaendert(analyse, { adresse: "  ossecker  str. 42 ", plz: "95028", ort: "HOF" })).toBe(false);
    expect(standortAdresseGeaendert(analyse, { adresse: "Ossecker Straße 42 (All-inclusive-Modell)", plz: 95028, ort: "Hof (Saale)" })).toBe(false);
  });

  it("sagt ja bei anderer Hausnummer, Straße, Postleitzahl oder anderem Ort", () => {
    expect(standortAdresseGeaendert(analyse, { adresse: "Ossecker Straße 46", plz: "95028", ort: "Hof" })).toBe(true);
    expect(standortAdresseGeaendert(analyse, { adresse: "Scharnhorststraße 1", plz: "95028", ort: "Hof" })).toBe(true);
    expect(standortAdresseGeaendert(analyse, { adresse: "Ossecker Straße 42", plz: "95030", ort: "Hof" })).toBe(true);
    expect(standortAdresseGeaendert(analyse, { adresse: "Ossecker Straße 42", plz: "95028", ort: "Selb" })).toBe(true);
  });

  it("stimmt mit dem überein, was messeStandort als gemessene Adresse schreibt", async () => {
    const { abruf } = dienste({
      photon: () => photonTreffer(HAUS),
      overpass: () => ({ daten: { elements: [{ id: 1, lat: 48.1381, lon: 11.5762, tags: { shop: "supermarket", name: "Edeka" } }] } }),
    });
    const ergebnis = await messeStandort(MUSTER, { ...OPTIONEN, abruf });
    const gemessen = (ergebnis as { analyse: GemesseneStandortAnalyse }).analyse;
    expect(gemessen.gemessene_adresse).toEqual({ adresse: "Marienplatz 8", plz: "80331", ort: "München" });
    expect(standortAdresseGeaendert(gemessen, MUSTER)).toBe(false);
    expect(standortAdresseGeaendert(gemessen, { ...MUSTER, adresse: "Marienplatz 9" })).toBe(true);
  });
});

describe("findeAdresse, die Suche für die Nadel des Hauses", () => {
  it("findet ohne Straße nichts und fragt gar nicht erst, sonst stünde die Nadel am Ortsmittelpunkt", async () => {
    const { abruf, aufrufe } = dienste({ photon: () => photonTreffer({ type: "city", city: "München" }) });
    expect(await findeAdresse({ adresse: "", plz: "80331", ort: "München" }, abruf)).toMatchObject({ ok: false, art: "adresse" });
    expect(aufrufe).toEqual([]);
  });

  it("verwirft einen Treffer, der nur den Ort trifft", async () => {
    const { abruf } = dienste({ photon: () => photonTreffer({ type: "city", postcode: "80331", city: "München" }) });
    expect(await findeAdresse(MUSTER, abruf)).toMatchObject({ ok: false, art: "adresse" });
  });

  it("verwirft eine gleichnamige Straße in einer anderen Stadt", async () => {
    const { abruf } = dienste({ photon: () => photonTreffer({ ...HAUS, postcode: "20095", city: "Hamburg" }) });
    const ergebnis = await findeAdresse(MUSTER, abruf);
    expect(ergebnis).toMatchObject({ ok: false, art: "adresse" });
    expect((ergebnis as { grund: string }).grund).toContain("nicht eindeutig");
  });

  it("verwirft ein Haus in einer anderen Straße derselben Postleitzahl", async () => {
    const { abruf } = dienste({ photon: () => photonTreffer({ ...HAUS, street: "Sendlinger Straße" }) });
    expect(await findeAdresse(MUSTER, abruf)).toMatchObject({ ok: false, art: "adresse" });
  });

  it("findet die bereinigte Adresse, wo die rohe ins Leere lief", async () => {
    const { abruf, aufrufe } = dienste({ photon: () => photonTreffer({ ...HAUS, street: "Bruno-Walter-Ring", housenumber: "36", postcode: "81927" }) });
    const ergebnis = await findeAdresse({ adresse: "4er WG, Bruno-Walter-Ring 36 36 (All-inclusive)", plz: "81927", ort: "München" }, abruf);
    expect(ergebnis).toMatchObject({ ok: true, genauigkeit: "adresse", quelle: "photon" });
    expect(decodeURIComponent(aufrufe[0].url)).toContain("q=Bruno-Walter-Ring 36, 81927 München");
    // Im Browser ohne eigenen Kopf, sonst verlangte Photon eine CORS-Vorabfrage.
    expect(aufrufe[0].headers).toBeUndefined();
  });

  it("bricht nach der Frist ab, statt die Function hängen zu lassen", async () => {
    const haengt: Abruf = (_url, init) =>
      new Promise((_fertig, fehler) => init?.signal?.addEventListener("abort", () => fehler(new Error("abgebrochen"))));
    expect(await findeAdresse(MUSTER, haengt, 5)).toMatchObject({ ok: false, art: "dienst" });
  });
});

describe("findeLage, die Rückfälle der Messung", () => {
  const schnell = { pauseMs: 0, fristMs: 200 };

  it("nimmt das Haus aus Photon und fragt sonst niemanden", async () => {
    const { abruf, aufrufe } = dienste({ photon: () => photonTreffer(HAUS) });
    const ergebnis = await findeLage(MUSTER, { ...schnell, abruf });
    expect(ergebnis).toMatchObject({ ok: true, genauigkeit: "adresse", quelle: "photon", lage: { stadtteil: "Altstadt" } });
    expect(aufrufe).toHaveLength(1);
  });

  it("fragt Nominatim, wenn Photon nur die Straße kennt, und nimmt dessen Haus", async () => {
    const { abruf, aufrufe } = dienste({
      photon: () => photonTreffer({ type: "street", name: "Marienplatz", postcode: "80331", city: "München" }),
      nominatim: () => [{ lat: "48.1373", lon: "11.5755", addresstype: "building", address: { house_number: "8", road: "Marienplatz", postcode: "80331", city: "München" } }],
    });
    const ergebnis = await findeLage(MUSTER, { ...schnell, abruf });
    expect(ergebnis).toMatchObject({ ok: true, genauigkeit: "adresse", quelle: "nominatim", koordinate: { lat: 48.1373, lng: 11.5755 } });
    const nominatim = aufrufe.find((a) => a.url.includes("nominatim"))!;
    expect(decodeURIComponent(nominatim.url)).toContain("street=8+Marienplatz");
    expect(nominatim.headers?.["User-Agent"]).toContain("MORE-Immo-CRM");
  });

  it("fällt auf die Straße zurück, wenn niemand die Hausnummer kennt", async () => {
    const { abruf } = dienste({
      photon: (url) => (url.includes("Marienplatz 8") ? { features: [] } : photonTreffer({ type: "street", name: "Marienplatz", postcode: "80331" })),
      nominatim: () => [],
    });
    expect(await findeLage(MUSTER, { ...schnell, abruf })).toMatchObject({ ok: true, genauigkeit: "strasse" });
  });

  it("fällt auf das Postleitzahlgebiet zurück, wenn die Straße unbekannt ist", async () => {
    const { abruf } = dienste({
      photon: () => ({ features: [] }),
      nominatim: (url) =>
        url.includes("street=")
          ? []
          : [{ lat: "48.159", lon: "11.637", addresstype: "postcode", address: { postcode: "81927", city: "München", city_district: "Bogenhausen" } }],
    });
    const ergebnis = await findeLage({ adresse: "Gibtsnichtweg 99", plz: "81927", ort: "München" }, { ...schnell, abruf });
    expect(ergebnis).toMatchObject({ ok: true, genauigkeit: "plz", lage: { plz: "81927" } });
  });

  it("fällt zuletzt auf die Ortsmitte zurück", async () => {
    const { abruf } = dienste({
      photon: (url) => (url.includes("Gibtsnichtweg") ? { features: [] } : photonTreffer({ type: "city", name: "Hof", postcode: "95028" }, 11.9, 50.3)),
      nominatim: () => [],
    });
    const ergebnis = await findeLage({ adresse: "Gibtsnichtweg 99", plz: "95028", ort: "Hof (Saale)" }, { ...schnell, abruf });
    expect(ergebnis).toMatchObject({ ok: true, genauigkeit: "ort", koordinate: { lat: 50.3, lng: 11.9 } });
  });

  it("wiederholt eine Suche, die nicht rechtzeitig antwortet", async () => {
    let versuche = 0;
    const abruf: Abruf = (url, init) => {
      if (url.includes("photon")) {
        versuche += 1;
        if (versuche === 1) {
          return new Promise((_fertig, fehler) => init?.signal?.addEventListener("abort", () => fehler(new Error("abgebrochen"))));
        }
        return Promise.resolve(antwort(photonTreffer(HAUS)));
      }
      return Promise.reject(new Error("unerwartet"));
    };
    const ergebnis = await findeLage(MUSTER, { pauseMs: 0, fristMs: 30, abruf });
    expect(ergebnis).toMatchObject({ ok: true, genauigkeit: "adresse" });
    expect(versuche).toBe(2);
  });

  it("meldet einen Ausfall aller Dienste als vorübergehend", async () => {
    const weg: Abruf = async () => {
      throw new Error("Netz weg");
    };
    expect(await findeLage(MUSTER, { ...schnell, abruf: weg })).toMatchObject({ ok: false, art: "dienst" });
  });
});

describe("holeOverpassElemente", () => {
  it("fragt zuerst den Hauptserver, mit eigener Kennung, die übrigen gar nicht, wenn er antwortet", async () => {
    const aufrufe: Array<{ url: string; headers?: Record<string, string> }> = [];
    const abruf: Abruf = async (url, init) => {
      aufrufe.push({ url, headers: init?.headers });
      return antwort({ elements: [{ id: 1, tags: { name: "X" } }] });
    };
    const elemente = await holeOverpassElemente(MUENCHEN.lat, MUENCHEN.lng, abruf, 1000, undefined, 500);
    expect(elemente).toHaveLength(1);
    expect(aufrufe.map((a) => a.url)).toEqual([OVERPASS_SPIEGEL[0]]);
    // Ohne eigene Kennung lehnt Overpass ab (406 bei curl, 429 bei Deno).
    expect(aufrufe[0].headers?.["User-Agent"]).toBe(KENNUNG);
  });

  it("nimmt den nächsten Server, wenn der erste ablehnt", async () => {
    const abruf: Abruf = async (url) =>
      url === OVERPASS_SPIEGEL[0] ? antwort("", 406) : antwort({ elements: [{ id: 2, tags: { name: "Y" } }] });
    const elemente = await holeOverpassElemente(MUENCHEN.lat, MUENCHEN.lng, abruf, 1000, undefined, 500);
    expect(elemente[0].tags?.name).toBe("Y");
  });

  it("hält eine leere Antwort mit „runtime error“ für einen Fehlschlag, nicht für eine leere Umgebung", async () => {
    const abruf: Abruf = async (url) =>
      url === OVERPASS_SPIEGEL[0]
        ? antwort({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1 after 25 seconds." })
        : antwort({ elements: [{ id: 3, tags: { name: "Z" } }] });
    const elemente = await holeOverpassElemente(MUENCHEN.lat, MUENCHEN.lng, abruf, 1000, undefined, 500);
    expect(elemente[0].tags?.name).toBe("Z");
  });

  it("hat einen Ausweichserver eines anderen Betreibers gleich hinter dem Hauptserver (01.10.2026)", async () => {
    expect(OVERPASS_SPIEGEL[0]).toContain("overpass-api.de");
    expect(OVERPASS_SPIEGEL[1]).toContain("maps.mail.ru");
    // Der Hauptserver hängt in der Warteschlange, der Ausweichserver liefert.
    const abruf: Abruf = (url, init) =>
      url === OVERPASS_SPIEGEL[1]
        ? Promise.resolve(antwort({ elements: [{ id: 4, tags: { name: "Ausweich" } }] }))
        : new Promise((_fertig, fehler) => init?.signal?.addEventListener("abort", () => fehler(new Error("abgebrochen"))));
    const elemente = await holeOverpassElemente(MUENCHEN.lat, MUENCHEN.lng, abruf, 2000, undefined, 10);
    expect(elemente[0].tags?.name).toBe("Ausweich");
  });

  it("wartet über alle Server lange genug für einen langsamen Ausweichserver", () => {
    expect(OVERPASS_FRIST_MS).toBeGreaterThanOrEqual(40_000);
  });

  it("holt den nächsten Server dazu, wenn der erste zu lange braucht, und bricht die übrigen ab", async () => {
    const abgebrochen: string[] = [];
    const abruf: Abruf = (url, init) => {
      if (url === OVERPASS_SPIEGEL[1]) return Promise.resolve(antwort({ elements: [{ id: 1, tags: { name: "X" } }] }));
      return new Promise((_fertig, fehler) =>
        init?.signal?.addEventListener("abort", () => {
          abgebrochen.push(url);
          fehler(new Error("abgebrochen"));
        }),
      );
    };
    const elemente = await holeOverpassElemente(MUENCHEN.lat, MUENCHEN.lng, abruf, 2000, undefined, 10);
    expect(elemente).toHaveLength(1);
    expect(abgebrochen).toContain(OVERPASS_SPIEGEL[0]);
  });
});

describe("messeStandort", () => {
  it("baut die gemessene Analyse im Format des Exposés, mit Genauigkeit und gemessener Adresse", async () => {
    const { abruf, aufrufe } = dienste({
      photon: () => photonTreffer(HAUS),
      overpass: () => ({
        daten: {
          elements: [
            { id: 1, lat: 48.1381, lon: 11.5762, tags: { shop: "supermarket", name: "Edeka Mitte" } },
            { id: 2, lat: 48.1381, lon: 11.5762, tags: { amenity: "pharmacy", name: "Marien-Apotheke" } },
            { id: 3, lat: 48.14, lon: 11.58, tags: { amenity: "hospital", name: "Klinikum Mitte" } },
          ],
        },
      }),
    });
    const ergebnis = await messeStandort(MUSTER, { ...OPTIONEN, abruf });

    expect(ergebnis.ok).toBe(true);
    const analyse = (ergebnis as { analyse: GemesseneStandortAnalyse }).analyse;
    expect(analyse.schema).toBe(STANDORT_SCHEMA);
    expect(istGemessen(analyse)).toBe(true);
    expect(analyse.messfassung).toBe(MESSFASSUNG);
    expect(analyse.genauigkeit).toBe("adresse");
    expect(analyse.koordinaten_quelle).toBe("photon");
    expect(analyse.lage).toEqual({ stadtteil: "Altstadt", ort: "München", plz: "80331" });
    expect(analyse.gemessen_am).toBe("2026-09-23T08:00:00.000Z");
    expect(analyse.objekt_koordinaten).toEqual({ lat: MUENCHEN.lat, lng: MUENCHEN.lng });
    expect(analyse.mikrolage.einkaufen![0]).toMatchObject({ name: "Edeka Mitte", typ: "Supermarkt" });
    expect(analyse.mikrolage.apotheken![0].name).toBe("Marien-Apotheke");
    expect(analyse.mikrolage.kliniken![0]).toMatchObject({ name: "Klinikum Mitte", typ: "Krankenhaus" });
    expect(analyse.mikrolage_hinweis).toBe(HERKUNFT_HINWEIS_MIKROLAGE);
    // Wofür es keine Quelle gibt, das steht auch nicht drin.
    expect(analyse).not.toHaveProperty("arbeitgeber");
    expect(analyse).not.toHaveProperty("makrolage");

    // Die Adresse geht vollständig in die Suche, Overpass bekommt die Koordinate.
    expect(decodeURIComponent(aufrufe[0].url)).toContain("Marienplatz 8, 80331 München");
    expect(aufrufe.slice(1).every((a) => a.url.includes("overpass"))).toBe(true);
  });

  it("fragt eine leere Kategorie ein zweites Mal im dreifachen Radius", async () => {
    const abfragen: string[] = [];
    const { abruf } = dienste({
      photon: () => photonTreffer(HAUS),
      overpass: (body) => {
        abfragen.push(body);
        if (abfragen.length === 1) {
          return { daten: { elements: [{ id: 1, lat: 48.1381, lon: 11.5762, tags: { shop: "supermarket", name: "Edeka Mitte" } }] } };
        }
        // Rund 3,3 km entfernt: jenseits der 1.500 m, innerhalb der 4.500 m.
        return { daten: { elements: [{ id: 2, lat: 48.167, lon: 11.5756, tags: { amenity: "pharmacy", name: "Weite Apotheke" } }] } };
      },
    });
    const ergebnis = await messeStandort(MUSTER, { ...OPTIONEN, abruf });
    const analyse = (ergebnis as { analyse: GemesseneStandortAnalyse }).analyse;
    expect(abfragen[1]).toContain('nwr["amenity"="pharmacy"](around:4500,');
    // Die schon gefundene Kategorie wird nicht noch einmal gefragt.
    expect(abfragen[1]).not.toContain('"supermarket"');
    expect(analyse.mikrolage.apotheken![0].name).toBe("Weite Apotheke");
    expect(analyse.erweiterter_umkreis).toContain("apotheken");
    expect(analyse.erweiterter_umkreis).not.toContain("einkaufen");
  });

  it("misst ohne Straße ab dem Postleitzahlgebiet und sagt das im Hinweis", async () => {
    const { abruf } = dienste({
      nominatim: () => [{ lat: "48.159", lon: "11.637", addresstype: "postcode", address: { postcode: "81927", city: "München" } }],
      overpass: () => ({ daten: { elements: [{ id: 1, lat: 48.16, lon: 11.638, tags: { highway: "bus_stop", name: "Arabellapark" } }] } }),
    });
    const ergebnis = await messeStandort({ adresse: "", plz: "81927", ort: "München" }, { ...OPTIONEN, abruf });
    const analyse = (ergebnis as { analyse: GemesseneStandortAnalyse }).analyse;
    expect(analyse.genauigkeit).toBe("plz");
    expect(analyse.mikrolage_hinweis).toContain("Postleitzahlgebiets 81927, nicht ab der Hausadresse");
  });

  it("wertet eine völlig leere Umgebung als Störung und gibt die gefundene Lage trotzdem mit", async () => {
    const { abruf } = dienste({ photon: () => photonTreffer(HAUS), overpass: () => ({ daten: { elements: [] } }) });
    const ergebnis = await messeStandort(MUSTER, { ...OPTIONEN, abruf });
    expect(ergebnis).toMatchObject({ ok: false, art: "dienst" });
    expect((ergebnis as { lage?: { genauigkeit: string } }).lage?.genauigkeit).toBe("adresse");
  });

  it("meldet einen Ausfall von Overpass als vorübergehend, samt gefundener Lage für die Karte", async () => {
    const { abruf } = dienste({ photon: () => photonTreffer(HAUS), overpass: () => ({ daten: {}, status: 429 }) });
    const ergebnis = await messeStandort(MUSTER, { ...OPTIONEN, abruf });
    expect(ergebnis).toMatchObject({ ok: false, art: "dienst" });
    expect((ergebnis as { grund: string }).grund).toContain("Overpass");
    expect((ergebnis as { lage?: { koordinate: unknown } }).lage?.koordinate).toEqual({ lat: MUENCHEN.lat, lng: MUENCHEN.lng });
  });

  it("misst ab einer bekannten Koordinate aus Investagon, ohne Adresssuche", async () => {
    const { abruf, aufrufe } = dienste({
      overpass: () => ({ daten: { elements: [{ id: 1, lat: 48.1005, lon: 11.5005, tags: { shop: "supermarket", name: "Edeka" } }] } }),
    });
    const ergebnis = await messeStandort(MUSTER, { ...OPTIONEN, abruf, koordinate: { lat: 48.1, lng: 11.5, quelle: "investagon" } });
    const analyse = (ergebnis as { analyse: GemesseneStandortAnalyse }).analyse;
    expect(aufrufe.every((a) => a.url.includes("overpass"))).toBe(true);
    expect(analyse.koordinaten_quelle).toBe("investagon");
    expect(analyse.objekt_koordinaten).toEqual({ lat: 48.1, lng: 11.5 });
  });
});

describe("Messfassung 3: Umgebungspunkte je Kategorie (24.09.2026)", () => {
  it("kennt alle Kategorien für Karte und Lagekasten, Parks und Behörden eigenständig", () => {
    expect(MESS_KATEGORIEN.map((k) => k.key)).toEqual([
      "kindergaerten", "schulen", "einkaufen", "apotheken", "aerzte", "oepnv", "freizeit", "parks", "behoerden",
      "hochschulen", "kliniken", "gewerbe",
    ]);
    const freizeit = MESS_KATEGORIEN.find((k) => k.key === "freizeit")!;
    expect(freizeit.filter.some((f) => f.wert === "park")).toBe(false);
    const behoerden = MESS_KATEGORIEN.find((k) => k.key === "behoerden")!;
    expect(behoerden.filter.map((f) => f.wert)).toEqual(["townhall", "government", "police", "post_office", "library"]);
  });

  it("hält je Kategorie fünf bis zehn Orte, und alles bleibt in einer Abfrage", () => {
    for (const k of MESS_KATEGORIEN) {
      expect(k.max, k.key).toBeGreaterThanOrEqual(5);
      expect(k.max, k.key).toBeLessThanOrEqual(10);
    }
    const abfrage = baueOverpassAbfrage(MUENCHEN.lat, MUENCHEN.lng);
    // Eine Abfrage, ein Ausgabebefehl, mit der größeren Obergrenze.
    expect(abfrage.match(/out center/g)).toHaveLength(1);
    expect(abfrage).toContain(`out center ${OVERPASS_HOECHSTZAHL};`);
    expect(abfrage).toContain('["leisure"="park"]');
    expect(abfrage).toContain('["office"="government"]');
  });

  it("deckelt bei zehn, sortiert Parks und Behörden in ihre eigene Liste", () => {
    const elemente = [
      ...Array.from({ length: 14 }, (_, i) => ({ id: i, lat: 48.1372 + 0.0005 * (i + 1), lon: 11.5756, tags: { highway: "bus_stop", name: `Halt ${i}` } })),
      { id: 100, lat: 48.138, lon: 11.576, tags: { leisure: "park", name: "Hofgarten" } },
      { id: 101, lat: 48.139, lon: 11.576, tags: { leisure: "playground", name: "Spielplatz Anger" } },
      { id: 102, lat: 48.1375, lon: 11.577, tags: { amenity: "townhall", name: "Neues Rathaus" } },
      { id: 103, lat: 48.1376, lon: 11.577, tags: { amenity: "library", name: "Stadtbibliothek" } },
    ];
    const ergebnis = werteOverpassAus(elemente, MUENCHEN);
    expect(ergebnis.oepnv).toHaveLength(10);
    expect(ergebnis.oepnv![0].name).toBe("Halt 0");
    expect(ergebnis.parks).toEqual([expect.objectContaining({ name: "Hofgarten", typ: "Park" })]);
    expect(ergebnis.freizeit?.map((o) => o.name)).toEqual(["Spielplatz Anger"]);
    expect(ergebnis.behoerden?.map((o) => o.typ)).toEqual(["Rathaus", "Bibliothek"]);
    // Jeder Ort trägt seine Lage, sonst gäbe es keinen Punkt auf der Karte.
    for (const o of [...ergebnis.oepnv!, ...ergebnis.parks!]) {
      expect(Number.isFinite(o.lat) && Number.isFinite(o.lng)).toBe(true);
    }
  });

  it("nimmt beim Neumessen derselben Adresse die alte Lage samt Genauigkeit, bei neuer Adresse nicht", () => {
    const adresse = { adresse: "Marienplatz 8", plz: "80331", ort: "München" };
    const analyse = {
      schema: 2, messfassung: 2, objekt_koordinaten: { lat: 48.1, lng: 11.5 }, genauigkeit: "plz", koordinaten_quelle: "nominatim",
      lage: { plz: "80331", ort: "München", fremd: "x" }, gemessene_adresse: gemesseneAdresseAus(adresse), mikrolage: {},
    };
    expect(bekannteLageAusAnalyse(analyse, adresse)).toEqual({
      lat: 48.1, lng: 11.5, quelle: "nominatim", genauigkeit: "plz", lage: { plz: "80331", ort: "München" },
    });
    expect(bekannteLageAusAnalyse(analyse, { ...adresse, adresse: "Marienplatz 9" })).toBeUndefined();
    // Eine Analyse ohne gemessene Adresse (vor dem 23.09.2026) sucht neu.
    expect(bekannteLageAusAnalyse({ ...analyse, gemessene_adresse: undefined }, adresse)).toBeUndefined();
    expect(bekannteLageAusAnalyse({ ...analyse, objekt_koordinaten: { lat: "48", lng: 11 } }, adresse)).toBeUndefined();
  });

  it("misst ab der übernommenen Lage ohne Adresssuche und behält den Hinweis auf die Ortsmitte", async () => {
    const { abruf, aufrufe } = dienste({
      overpass: () => ({ daten: { elements: [{ id: 1, lat: 48.1005, lon: 11.5005, tags: { shop: "supermarket", name: "Edeka" } }] } }),
    });
    const ergebnis = await messeStandort(MUSTER, {
      ...OPTIONEN, abruf, koordinate: { lat: 48.1, lng: 11.5, quelle: "photon", genauigkeit: "ort", lage: { ort: "München" } },
    });
    const analyse = (ergebnis as { analyse: GemesseneStandortAnalyse }).analyse;
    expect(aufrufe.every((a) => a.url.includes("overpass"))).toBe(true);
    expect(analyse.genauigkeit).toBe("ort");
    expect(analyse.koordinaten_quelle).toBe("photon");
    expect(analyse.messfassung).toBe(3);
    expect(analyse.mikrolage_hinweis).toContain("Ortsmitte von München");
  });
});

describe("koordinatenInMeta", () => {
  const treffer = { koordinate: { lat: 48.1, lng: 11.5 }, genauigkeit: "adresse" as const, lage: {}, quelle: "photon" as const };

  it("legt die gefundene Koordinate ab, fremde Schlüssel bleiben", () => {
    const meta = koordinatenInMeta({ kurzbeschreibung: "bleibt" }, treffer, JETZT);
    expect(meta).toEqual({
      kurzbeschreibung: "bleibt",
      koordinaten: { lat: 48.1, lng: 11.5, quelle: "photon", am: "2026-09-23T08:00:00.000Z", genauigkeit: "adresse" },
    });
    expect(gespeicherteKoordinaten(meta)?.quelle).toBe("photon");
  });

  it("überschreibt eine Koordinate aus Investagon nie", () => {
    const vorher = { koordinaten: { lat: 50, lng: 10, quelle: "investagon", am: "2026-09-20T00:00:00.000Z" } };
    expect(koordinatenInMeta(vorher, treffer, JETZT)).toBe(vorher);
    expect(koordinatenAusInvestagon(vorher)).toMatchObject({ lat: 50, lng: 10 });
  });

  it("legt keine Postleitzahl- oder Ortsmitte als Lage des Hauses ab", () => {
    const vorher = { a: 1 };
    expect(koordinatenInMeta(vorher, { ...treffer, genauigkeit: "plz" }, JETZT)).toBe(vorher);
    expect(koordinatenInMeta(vorher, { ...treffer, genauigkeit: "ort" }, JETZT)).toBe(vorher);
  });
});

describe("standortInMeta", () => {
  it("setzt nur die beiden eigenen Schlüssel und lässt alles andere stehen", () => {
    const analyse = {
      schema: STANDORT_SCHEMA,
      gemessen_am: "2026-09-23T08:00:00.000Z",
      objekt_koordinaten: MUENCHEN,
      mikrolage: {},
      mikrolage_hinweis: HERKUNFT_HINWEIS_LEER,
    };
    const meta = standortInMeta({ kurzbeschreibung: "bleibt", standortanalyse: { alt: true } }, analyse);
    expect(meta).toEqual({
      kurzbeschreibung: "bleibt",
      standortanalyse: analyse,
      standortanalyse_generated_at: "2026-09-23T08:00:00.000Z",
    });
  });
});
