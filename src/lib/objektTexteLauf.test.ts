import { describe, it, expect } from "vitest";

/**
 * Der Lauf je Objekt in `objekt-texte-ki`, mit nachgebildeter Datenbank,
 * nachgebildetem Gateway und nachgebildeter Messung.
 *
 * Am 23.09.2026 trug kein einziges Objekt einen Text. Geprüft wird deshalb,
 * was einen Lauf früher scheitern ließ oder scheitern lassen könnte:
 *
 *   1. Lehnt der Gateway die Anfrage mit Unterlagen ab, entsteht der Text
 *      trotzdem, im zweiten Versuch ohne Unterlagen.
 *   2. Eine gescheiterte Messung der Umgebung beendet den Lauf nicht.
 *   3. Eine unlesbare Unterlage wird übersprungen, ein Mietvertrag gar nicht
 *      erst geladen.
 *   4. Marktdaten kommen als Tatsachenzeilen an, ihr Fehlen stört nicht.
 *   5. Ein Fehler steht danach am Objekt, ohne einen Text zu überschreiben.
 *
 * Seit Fassung 4 (23.09.2026 spät) außerdem:
 *
 *   6. Eine gescheiterte Messung ist keine Beanstandung mehr, sie steht im
 *      Vermerk `umgebung`. Die Karte zeigt ihn nur Admin und Inhaber.
 *   7. Gemessen wird nur, wenn die Analyse fehlt, die Adresse sich geändert
 *      hat oder die Leitung es ausdrücklich will. Die gefundene Koordinate
 *      landet in `meta.koordinaten`, eine aus Investagon hat Vorrang.
 *   8. Der Versionssprung schreibt jedes Objekt neu, Handtexte bleiben.
 */

import {
  erzeugeFuerObjekt,
  vermerkeFehler,
  type LaufUmgebung,
} from "../../supabase/functions/objekt-texte-ki/lauf";
import {
  letzterFehlerAusMeta,
  OBJEKT_TEXTE_META_SCHLUESSEL,
  OBJEKT_TEXTE_SCHEMA,
  objektTexteAusMeta,
} from "../../supabase/functions/_shared/objekt-texte";
import { STANDORT_SCHEMA } from "../../supabase/functions/_shared/standort-messung";

// ── Nachbildungen ────────────────────────────────────────────────────────────

const PDF = new TextEncoder().encode("%PDF-1.4 Exposé mit Beschreibung");

interface Bestand {
  meta?: Record<string, unknown>;
  wohnungen?: Array<Record<string, unknown>>;
  objektDoks?: Array<Record<string, unknown>>;
  einheitDoks?: Array<Record<string, unknown>>;
  standorte?: Array<Record<string, unknown>> | Error;
  kennzahlen?: Array<Record<string, unknown>>;
  arbeitgeber?: Array<Record<string, unknown>>;
  /** Dateien je „eimer/pfad“. Fehlt eine, scheitert der Download. */
  dateien?: Record<string, Uint8Array>;
  /** Zeilen aus `lotse_unterlagen_auszug`. Mit ihnen liefert die Ordnerliste eine Version (eTag „v1“). */
  auszugZeilen?: Array<Record<string, unknown>>;
}

/**
 * Eine Datenbank, die genau das beantwortet, was der Lauf fragt. Jede Kette
 * (`from().select().eq()...`) lässt sich abwarten, wie bei supabase-js.
 */
function nachgebildeteDb(bestand: Bestand) {
  let meta: Record<string, unknown> = { ...(bestand.meta || {}) };
  const geschrieben: Array<Record<string, unknown>> = [];
  const geladen: string[] = [];

  const db = {
    from(tabelle: string) {
      let aktualisierung: Record<string, unknown> | undefined;
      const ergebnis = () => {
        if (aktualisierung) {
          meta = aktualisierung.meta as Record<string, unknown>;
          geschrieben.push(meta);
          return { data: null, error: null };
        }
        switch (tabelle) {
          case "objekte":
            return { data: { meta }, error: null };
          case "wohnungen":
            return { data: bestand.wohnungen ?? [], error: null };
          case "objekt_dokumente":
            return { data: bestand.objektDoks ?? [], error: null };
          case "wohnungs_dokumente":
            return { data: bestand.einheitDoks ?? [], error: null };
          case "standorte":
            return bestand.standorte instanceof Error
              ? { data: null, error: { message: bestand.standorte.message } }
              : { data: bestand.standorte ?? [], error: null };
          case "standort_kennzahlen":
            return { data: bestand.kennzahlen ?? [], error: null };
          case "standort_arbeitgeber":
            return { data: bestand.arbeitgeber ?? [], error: null };
          case "lotse_unterlagen_auszug":
            return { data: bestand.auszugZeilen ?? [], error: null };
          default:
            return { data: null, error: { message: `unbekannte Tabelle ${tabelle}` } };
        }
      };
      const kette: Record<string, unknown> = {
        select: () => kette,
        eq: () => kette,
        in: () => kette,
        update: (wert: Record<string, unknown>) => {
          aktualisierung = wert;
          return kette;
        },
        maybeSingle: () => Promise.resolve(ergebnis()),
        then: (erfuellt: (w: unknown) => unknown, abgelehnt?: (e: unknown) => unknown) =>
          Promise.resolve(ergebnis()).then(erfuellt, abgelehnt),
      };
      return kette;
    },
    storage: {
      from: (eimer: string) => ({
        // Ohne gespeicherte Auszüge keine Version, wie bisher: Dann wird neu eingeordnet.
        list: async (ordner: string) => ({
          data: bestand.auszugZeilen
            ? Object.keys(bestand.dateien ?? {})
              .filter((k) => k.startsWith(`${eimer}/${ordner}/`))
              .map((k) => ({ name: k.slice(eimer.length + ordner.length + 2), metadata: { eTag: "v1" } }))
            : [],
          error: null,
        }),
        download: async (pfad: string) => {
          geladen.push(`${eimer}/${pfad}`);
          const bytes = bestand.dateien?.[`${eimer}/${pfad}`];
          if (!bytes) return { data: null, error: { message: "Object not found" } };
          return {
            data: { size: bytes.length, type: "application/pdf", arrayBuffer: async () => bytes.slice().buffer },
            error: null,
          };
        },
      }),
    },
  };
  return { db, geschrieben, geladen, meta: () => meta };
}

/** Eine Antwort des Gateways, so weit der Lauf sie liest. */
function gatewayAntwort(status: number, rumpf: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => rumpf,
    text: async () => (typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf)),
  } as unknown as Response;
}

const FUENF = [
  "Kurze Wege im Alltag. Supermarkt Nord in 280 m Luftlinie.",
  "Gut angebunden. Straßenbahn Musterweg in 150 m Luftlinie.",
  "Familienfreundlich. Kita Sonnenschein in 400 m Luftlinie.",
  "Versorgt. Apotheke am Markt in 350 m Luftlinie erreichbar.",
  "Grün vor der Tür. Stadtpark in 500 m Luftlinie vom Haus.",
];

function werkzeugAntwort(teil: Record<string, unknown> = {}) {
  return gatewayAntwort(200, {
    choices: [{
      message: {
        tool_calls: [{
          function: {
            arguments: JSON.stringify({
              kurzbeschreibung: "Baujahr 1962, 2021 neues Dach und neue Fenster: Das Haus am Park ist bereit für die nächsten Jahrzehnte.",
              standortargumente: FUENF.map((argument) => ({ argument, beleg: "Einkaufen in der Nähe: Supermarkt Nord" })),
              marktargumente: [],
              sanierungen: [],
              ...teil,
            }),
          },
        }],
      },
    }],
  });
}

/** Ein Gateway, das der Reihe nach die vorgegebenen Antworten gibt und jede Anfrage mitschreibt. */
function nachgebildeterGateway(...antworten: Response[]) {
  const anfragen: Array<{ rumpf: string; auftrag: string }> = [];
  const abruf = (async (_adresse: string, init: { body: string }) => {
    const rumpf = JSON.parse(init.body);
    const inhalt = rumpf.messages[1].content as Array<{ type: string; text?: string }>;
    anfragen.push({ rumpf: init.body, auftrag: inhalt.find((t) => t.type === "text")?.text || "" });
    return antworten[Math.min(anfragen.length - 1, antworten.length - 1)];
  }) as unknown as typeof fetch;
  return { abruf, anfragen };
}

const gemessen = async () => ({
  ok: true as const,
  analyse: {
    schema: 2,
    gemessen_am: "2026-09-23T10:00:00.000Z",
    objekt_koordinaten: { lat: 48.37, lng: 10.9 },
    mikrolage: { einkaufen: [{ name: "Supermarkt Nord", typ: "Supermarkt", entfernung_m: 280, lat: 48.371, lng: 10.9 }] },
    mikrolage_hinweis: "",
  },
});

const OBJEKT = {
  id: "o1",
  titel: "Haus am Park",
  adresse: "Musterweg 1",
  plz: "86150",
  ort: "Augsburg",
  global_baujahr: 1962,
  meta: {},
};

function umgebung(teil: Partial<LaufUmgebung>): LaufUmgebung {
  // Die Einordnung vor dem Anhängen (seit dem 28.09.2026) steht hier fest auf „frei“,
  // damit sie keine Antwort des nachgebildeten Gateways verbraucht.
  return { schluessel: "test-schluessel", frist: Date.now() + 140_000, messe: gemessen, einordnen: async () => ({ ergebnis: "frei" }), ...teil };
}

// ── 1. Zweiter Versuch ohne Unterlagen ───────────────────────────────────────

describe("Lehnt der Gateway die Unterlagen ab", () => {
  const mitExpose = {
    objektDoks: [{ name: "Exposé Haus am Park.pdf", url: "/investagon-dokument/o1/expose.pdf" }],
    dateien: { "investagon-dokumente/o1/expose.pdf": PDF },
  };

  it("fragt ein zweites Mal ohne Unterlagen, und der Text entsteht trotzdem", async () => {
    const { db, meta } = nachgebildeteDb(mitExpose);
    const gateway = nachgebildeterGateway(
      gatewayAntwort(400, { error: { message: "Unsupported MIME type: application/pdf" } }),
      werkzeugAntwort(),
    );
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));

    expect(gateway.anfragen).toHaveLength(2);
    expect(gateway.anfragen[0].rumpf).toContain("data:application/pdf;base64,");
    expect(gateway.anfragen[1].rumpf).not.toContain("image_url");
    expect(gateway.anfragen[1].auftrag).not.toContain("Mitgelesene Unterlage");

    expect(ergebnis.art).toBe("erzeugt");
    if (ergebnis.art !== "erzeugt") return;
    expect(ergebnis.gespeichert).toBe(true);
    const beanstandungen = ergebnis.texte.beanstandungen.join(" ");
    expect(beanstandungen).toContain("Die Unterlagen ließen sich nicht mitlesen");
    // Der Grund des Gateways steht dabei, damit man ihn sieht.
    expect(beanstandungen).toContain("Unsupported MIME type");
    expect(objektTexteAusMeta(meta())?.schema).toBe(OBJEKT_TEXTE_SCHEMA);
  });

  it("schickt die Unterlagen beim ersten Versuch mit, wenn sie angenommen werden", async () => {
    const { db } = nachgebildeteDb(mitExpose);
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
    expect(gateway.anfragen).toHaveLength(1);
    expect(gateway.anfragen[0].auftrag).toContain("Mitgelesene Unterlage: Exposé Haus am Park.pdf");
    expect(ergebnis.art).toBe("erzeugt");
  });

  it("wiederholt nicht, wenn der Gateway bremst oder das Guthaben leer ist", async () => {
    for (const status of [429, 402]) {
      const { db } = nachgebildeteDb(mitExpose);
      const gateway = nachgebildeterGateway(gatewayAntwort(status, { error: "Grenze" }), werkzeugAntwort());
      const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
      expect(gateway.anfragen).toHaveLength(1);
      expect(ergebnis).toMatchObject({ art: "fehler", status });
    }
  });

  it("meldet den Grund des Gateways, wenn auch der zweite Versuch scheitert", async () => {
    const { db } = nachgebildeteDb(mitExpose);
    const gateway = nachgebildeterGateway(
      gatewayAntwort(400, { error: { message: "Request too large" } }),
      gatewayAntwort(500, "<html>Fehler</html>"),
    );
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
    expect(ergebnis.art).toBe("fehler");
    if (ergebnis.art !== "fehler") return;
    expect(ergebnis.status).toBe(502);
    expect(ergebnis.meldung).toContain("Status 500");
  });
});

// ── 2. Gescheiterte Messung ──────────────────────────────────────────────────

describe("Scheitert die Messung der Umgebung", () => {
  it("geht es ohne Umgebungsdaten weiter, mit internem Vermerk statt Beanstandung", async () => {
    const { db } = nachgebildeteDb({});
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({
      abruf: gateway.abruf,
      messe: async () => ({ ok: false, art: "dienst", grund: "Die Adresssuche war nicht erreichbar." }),
    }));
    expect(ergebnis.art).toBe("erzeugt");
    if (ergebnis.art !== "erzeugt") return;
    // Kein Warnkasten mehr: Die Messung ist kein Mangel am Text.
    expect(ergebnis.texte.beanstandungen.join(" ")).not.toContain("Umgebung");
    expect(ergebnis.texte.umgebung).toEqual({ gemessen: false, grund: "Die Adresssuche war nicht erreichbar.", art: "dienst" });
    // Der Auftrag sagt dem Modell, woher die Lage dann kommt.
    expect(gateway.anfragen[0].auftrag).toContain("Die Umgebung der Adresse ist nicht gemessen");
  });

  it("geht auch weiter, wenn die Messung eine Ausnahme wirft", async () => {
    const { db } = nachgebildeteDb({});
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({
      abruf: gateway.abruf,
      messe: async () => { throw new Error("Overpass weg"); },
    }));
    expect(ergebnis.art).toBe("erzeugt");
  });

  it("legt eine gelungene Messung sofort am Objekt ab", async () => {
    const { db, geschrieben } = nachgebildeteDb({});
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
    expect((geschrieben[0].standortanalyse as { schema: number }).schema).toBe(2);
    expect(gateway.anfragen[0].auftrag).toContain("Einkaufen in der Nähe: Supermarkt Nord");
    if (ergebnis.art !== "erzeugt") throw new Error("erwartet: erzeugt");
    expect(ergebnis.texte.umgebung).toMatchObject({ gemessen: true });
  });
});

// ── 6. Wann gemessen wird, und wohin die Koordinate geht ─────────────────────

describe("Gemessen wird nur bei Bedarf", () => {
  const ADRESSE = { adresse: OBJEKT.adresse, plz: OBJEKT.plz, ort: OBJEKT.ort };
  const passend = {
    schema: STANDORT_SCHEMA,
    messfassung: 2,
    gemessen_am: "2026-09-20T10:00:00.000Z",
    objekt_koordinaten: { lat: 48.37, lng: 10.9 },
    genauigkeit: "adresse",
    gemessene_adresse: ADRESSE,
    mikrolage: { oepnv: [{ name: "Haltestelle Alt", typ: "Bus", entfernung_m: 120, lat: 48.371, lng: 10.9 }] },
    mikrolage_hinweis: "",
  };
  const zaehlendeMessung = () => {
    const aufrufe: Array<{ teile: unknown; optionen: unknown }> = [];
    const messe = (async (teile: unknown, optionen: unknown) => {
      aufrufe.push({ teile, optionen });
      return gemessen();
    }) as unknown as LaufUmgebung["messe"];
    return { messe, aufrufe };
  };

  it("nimmt eine gespeicherte Analyse zur selben Adresse, ohne zu messen", async () => {
    const { db } = nachgebildeteDb({ meta: { standortanalyse: passend } });
    const { messe, aufrufe } = zaehlendeMessung();
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(db, { ...OBJEKT, meta: { standortanalyse: passend } }, umgebung({ abruf: gateway.abruf, messe }));
    expect(aufrufe).toHaveLength(0);
    expect(gateway.anfragen[0].auftrag).toContain("Haltestelle Alt");
    expect(gateway.anfragen[0].auftrag).toContain("Umgebung gemessen ab der Hausadresse");
  });

  it("misst neu, wenn sich die Adresse geändert hat, und nimmt die alte Analyse dann nicht als Rückfall", async () => {
    const umgezogen = { ...passend, gemessene_adresse: { ...ADRESSE, adresse: "Musterweg 99" } };
    const { db } = nachgebildeteDb({ meta: { standortanalyse: umgezogen } });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, { ...OBJEKT, meta: { standortanalyse: umgezogen } }, umgebung({
      abruf: gateway.abruf,
      messe: async () => ({ ok: false, art: "dienst", grund: "Overpass weg." }),
    }));
    if (ergebnis.art !== "erzeugt") throw new Error("erwartet: erzeugt");
    // Die alte Analyse beschreibt ein anderes Haus.
    expect(gateway.anfragen[0].auftrag).not.toContain("Haltestelle Alt");
    expect(ergebnis.texte.umgebung).toMatchObject({ gemessen: false });
  });

  it("misst eine ältere Analyse ohne gemessene Adresse einmal neu, behält sie aber, wenn das scheitert", async () => {
    const ohneAdresse = { ...passend, gemessene_adresse: undefined };
    const { db } = nachgebildeteDb({ meta: { standortanalyse: ohneAdresse } });
    const { messe, aufrufe } = zaehlendeMessung();
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(db, { ...OBJEKT, meta: { standortanalyse: ohneAdresse } }, umgebung({ abruf: gateway.abruf, messe }));
    expect(aufrufe).toHaveLength(1);

    const zweite = nachgebildeteDb({ meta: { standortanalyse: ohneAdresse } });
    const gateway2 = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(zweite.db, { ...OBJEKT, meta: { standortanalyse: ohneAdresse } }, umgebung({
      abruf: gateway2.abruf,
      messe: async () => ({ ok: false, art: "dienst", grund: "Overpass weg." }),
    }));
    expect(gateway2.anfragen[0].auftrag).toContain("Haltestelle Alt");
  });

  it("misst auf ausdrücklichen Wunsch neu, ersetzt die genaue Analyse aber nicht durch eine gröbere", async () => {
    const { db, meta } = nachgebildeteDb({ meta: { standortanalyse: passend } });
    const grob = async () => ({
      ok: true as const,
      analyse: { ...passend, genauigkeit: "plz" as const, mikrolage: { oepnv: [{ name: "Irgendwo", entfernung_m: 900, lat: 1, lng: 1 }] } },
    });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(db, { ...OBJEKT, meta: { standortanalyse: passend } }, umgebung({ abruf: gateway.abruf, messe: grob, neuMessen: true }));
    expect((meta().standortanalyse as { genauigkeit: string }).genauigkeit).toBe("adresse");
    expect(gateway.anfragen[0].auftrag).toContain("Haltestelle Alt");
  });

  it("legt die gefundene Koordinate auch dann ab, wenn Overpass danach scheitert", async () => {
    const { db, meta } = nachgebildeteDb({});
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(db, OBJEKT, umgebung({
      abruf: gateway.abruf,
      messe: async () => ({
        ok: false,
        art: "dienst",
        grund: "OpenStreetMap (Overpass) war nicht erreichbar.",
        lage: { koordinate: { lat: 48.37, lng: 10.9 }, genauigkeit: "adresse", lage: {}, quelle: "photon" },
      }),
    }));
    expect(meta().koordinaten).toMatchObject({ lat: 48.37, lng: 10.9, quelle: "photon", genauigkeit: "adresse" });
  });

  it("misst ab einer Koordinate aus Investagon und lässt sie stehen", async () => {
    const investagon = { lat: 48.5, lng: 10.5, quelle: "investagon", am: "2026-09-20T10:00:00.000Z" };
    const { db, meta } = nachgebildeteDb({ meta: { koordinaten: investagon } });
    const { messe, aufrufe } = zaehlendeMessung();
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(db, { ...OBJEKT, meta: { koordinaten: investagon } }, umgebung({ abruf: gateway.abruf, messe }));
    expect((aufrufe[0].optionen as { koordinate: unknown }).koordinate).toEqual({ lat: 48.5, lng: 10.5, quelle: "investagon" });
    expect(meta().koordinaten).toEqual(investagon);
  });
});

// ── 7. Der Versionssprung ────────────────────────────────────────────────────

describe("Die neue Fassung schreibt jedes Objekt neu", () => {
  const alterStand = {
    schema: OBJEKT_TEXTE_SCHEMA - 1,
    kurzbeschreibung: "Alte automatische Beschreibung.",
    standortargumente: ["Alt 1.", "Alt 2.", "Alt 3.", "Alt 4.", "Alt 5."].map((argument) => ({ argument, beleg: "x" })),
    marktargumente: [],
    sanierungen: [],
    erzeugtAm: "2026-09-23T10:00:00.000Z",
    modell: "m",
    quellenStand: "q",
    quellen: [],
    beanstandungen: [],
  };

  it("hält einen Stand der vorigen Fassung für nicht vorhanden", () => {
    expect(objektTexteAusMeta({ [OBJEKT_TEXTE_META_SCHLUESSEL]: alterStand })).toBeUndefined();
  });

  it("ersetzt die automatischen Felder und lässt die von Hand gepflegten stehen", async () => {
    const vorher = {
      // Automatisch: wortgleich der alte Stand.
      kurzbeschreibung: "Alte automatische Beschreibung.",
      // Von Hand: weicht vom alten Stand ab.
      standortargumente: ["Von Hand 1.", "Von Hand 2.", "Von Hand 3.", "Von Hand 4.", "Von Hand 5."],
      [OBJEKT_TEXTE_META_SCHLUESSEL]: alterStand,
    };
    const { db, meta } = nachgebildeteDb({ meta: vorher });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, { ...OBJEKT, meta: vorher }, umgebung({ abruf: gateway.abruf }));

    expect(ergebnis.art).toBe("erzeugt");
    expect(objektTexteAusMeta(meta())?.schema).toBe(OBJEKT_TEXTE_SCHEMA);
    expect(meta().kurzbeschreibung).toContain("Baujahr 1962");
    expect(meta().standortargumente).toEqual(vorher.standortargumente);
  });
});

describe("Geschrieben wird mit schreibDb, gelesen mit dem Nutzertoken (30.09.2026)", () => {
  it("legt die Texte über schreibDb ab und schreibt nie mit dem Nutzerclient", async () => {
    const nutzer = nachgebildeteDb({});
    const dienst = nachgebildeteDb({});
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(nutzer.db, OBJEKT, umgebung({ abruf: gateway.abruf, schreibDb: dienst.db }));

    expect(ergebnis.art).toBe("erzeugt");
    expect(nutzer.geschrieben).toEqual([]);
    expect(dienst.geschrieben.length).toBeGreaterThan(0);
    expect(objektTexteAusMeta(dienst.meta())?.schema).toBe(OBJEKT_TEXTE_SCHEMA);
  });
});

// ── 3. Unterlagen ────────────────────────────────────────────────────────────

describe("Die Unterlagen", () => {
  it("überspringt eine unlesbare, nimmt die nächste und lädt einen Mietvertrag gar nicht erst", async () => {
    const { db, geladen } = nachgebildeteDb({
      wohnungen: [{ id: "w1", groesse: 60 }],
      objektDoks: [
        { name: "Exposé.pdf", url: "/investagon-dokument/o1/expose.pdf" },
        { name: "Grundbuchauszug.pdf", url: "/investagon-dokument/o1/grundbuch.pdf" },
      ],
      einheitDoks: [
        { name: "Mietvertrag WE 3.pdf", url: "/investagon-dokument/o1/mietvertrag.pdf", wohnung_id: "w1" },
        { name: "Baubeschreibung.pdf", url: "/investagon-dokument/o1/bau.pdf", wohnung_id: "w1" },
      ],
      dateien: {
        "investagon-dokumente/o1/mietvertrag.pdf": PDF,
        "investagon-dokumente/o1/grundbuch.pdf": PDF,
        "investagon-dokumente/o1/bau.pdf": PDF,
      },
    });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));

    expect(geladen).toEqual(["investagon-dokumente/o1/expose.pdf", "investagon-dokumente/o1/bau.pdf"]);
    expect(gateway.anfragen[0].auftrag).toContain("Mitgelesene Unterlage: Baubeschreibung.pdf");
    expect(gateway.anfragen[0].auftrag).not.toContain("Mietvertrag");
    expect(gateway.anfragen[0].auftrag).not.toContain("Grundbuch");
    if (ergebnis.art !== "erzeugt") throw new Error("erwartet: erzeugt");
    expect(ergebnis.texte.beanstandungen.join(" ")).toContain("Exposé.pdf (nicht lesbar)");
  });

  it("nimmt eine Datei, die sich als PDF ausgibt, aber keines ist, nicht mit", async () => {
    const { db } = nachgebildeteDb({
      objektDoks: [{ name: "Exposé", url: "/investagon-dokument/o1/expose" }],
      dateien: { "investagon-dokumente/o1/expose": new TextEncoder().encode("PK Word-Datei") },
    });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
    expect(gateway.anfragen[0].rumpf).not.toContain("image_url");
    if (ergebnis.art !== "erzeugt") throw new Error("erwartet: erzeugt");
    expect(ergebnis.texte.beanstandungen.join(" ")).toContain("(kein PDF)");
  });
});

// ── 4. Marktdaten ────────────────────────────────────────────────────────────

describe("Die Marktdaten", () => {
  const augsburg = [{ id: "s1", name: "Augsburg", bundesland: "Bayern", lat: 48.37, lng: 10.898 }];

  it("gehen als Zeilen „Markt …“ an das Modell, die Marktargumente landen im Feld", async () => {
    const { db, meta } = nachgebildeteDb({
      standorte: augsburg,
      kennzahlen: [{ standort_id: "s1", kennzahl: "einwohner", wert: 301033, stand: "2026-07-10", quelle_id: "destatis", meta: {} }],
    });
    const markt = [{
      argument: "Große Stadt mit Nachfrage. Augsburg zählt 301.033 Einwohner, Destatis, Stand 07/2026.",
      beleg: "Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)",
    }];
    const gateway = nachgebildeterGateway(werkzeugAntwort({ marktargumente: markt }));
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));

    expect(gateway.anfragen[0].auftrag).toContain("Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)");
    if (ergebnis.art !== "erzeugt") throw new Error("erwartet: erzeugt");
    expect(ergebnis.texte.marktargumente).toHaveLength(1);
    expect(meta().marktargumente).toEqual([markt[0].argument]);
  });

  it("stören nicht, wenn sie sich nicht lesen lassen", async () => {
    const { db } = nachgebildeteDb({ standorte: new Error("permission denied") });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
    expect(ergebnis.art).toBe("erzeugt");
    if (ergebnis.art !== "erzeugt") return;
    expect(ergebnis.texte.beanstandungen.join(" ")).toContain("Marktdaten ließen sich nicht lesen");
    expect(gateway.anfragen[0].auftrag).toContain("Es gibt keine Zeilen „Markt …“");
  });
});

// ── 5. Fehler am Objekt ──────────────────────────────────────────────────────

describe("Ein Fehler steht danach am Objekt", () => {
  it("meldet einen fehlenden Schlüssel, ohne den Gateway zu fragen", async () => {
    const { db } = nachgebildeteDb({});
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf, schluessel: "" }));
    expect(gateway.anfragen).toHaveLength(0);
    expect(ergebnis).toMatchObject({ art: "fehler", status: 500 });
    if (ergebnis.art === "fehler") expect(ergebnis.meldung).toContain("LOVABLE_API_KEY");
  });

  it("legt Grund und Zeitpunkt ab und lässt einen vorhandenen Text stehen", async () => {
    const vorhanden = {
      schema: OBJEKT_TEXTE_SCHEMA,
      kurzbeschreibung: "Ein vorhandener Text.",
      standortargumente: [],
      marktargumente: [],
      sanierungen: [],
      erzeugtAm: "2026-09-22T10:00:00.000Z",
      modell: "m",
      quellenStand: "q",
      quellen: [],
      beanstandungen: [],
    };
    const { db, meta } = nachgebildeteDb({ meta: { kurzbeschreibung: "Ein vorhandener Text.", [OBJEKT_TEXTE_META_SCHLUESSEL]: vorhanden } });
    await vermerkeFehler(db, "o1", {}, { meldung: "Die KI-Schnittstelle hat die Anfrage abgelehnt (Status 400).", status: 502 });

    const fehler = letzterFehlerAusMeta(meta());
    expect(fehler?.grund).toContain("Status 400");
    expect(fehler?.status).toBe(502);
    expect(fehler?.zeitpunkt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(objektTexteAusMeta(meta())?.kurzbeschreibung).toBe("Ein vorhandener Text.");
    expect(meta().kurzbeschreibung).toBe("Ein vorhandener Text.");
  });
});

// ── Einordnung vor dem Anhängen (LOTSE-R6-003) ──────────────────────────────

describe("Unterlagen gehen nur nach der Einordnung an die Objekttexte", () => {
  const mitUnterlage = {
    objektDoks: [{ name: "Exposé Haus am Park.pdf", url: "/investagon-dokument/o1/expose.pdf" }],
    dateien: { "investagon-dokumente/o1/expose.pdf": PDF },
  };

  for (const einordnung of [{ ergebnis: "rot", art: "mietvertrag" }, { ergebnis: "unklar" }] as const) {
    it(`„${einordnung.ergebnis}“ wird nicht angehängt, auch unter dem Titel „Exposé“`, async () => {
      const { db } = nachgebildeteDb(mitUnterlage);
      const gateway = nachgebildeterGateway(werkzeugAntwort());
      const ergebnis = await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf, einordnen: async () => einordnung }));
      expect(ergebnis.art).toBe("erzeugt");
      expect(gateway.anfragen[0].rumpf).not.toContain("data:application/pdf;base64,");
    });
  }

  it("„frei“ wird angehängt", async () => {
    const { db } = nachgebildeteDb(mitUnterlage);
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
    expect(gateway.anfragen[0].rumpf).toContain("data:application/pdf;base64,");
  });
});

// ── Gespeicherte Einordnung des Lotsen (Stufe 2, Codex-Befund 3) ────────────

describe("Was der Lotse nur als Faktenauszug liest oder ausschließt, geht nie an die Objekttexte", () => {
  it.each([
    ["eine gelbe Faktenart", { ampel: "rot", art: "wirtschaftsplan", auszug: { zeitraum_von: "2025-01-01" } }],
    ["ein Vermerk „ungelesen“", { ampel: "rot", art: "lotse_ungelesen", auszug: { nicht_auswertbar: "für den Lotsen nicht freigegeben" } }],
    ["ein Einordnungsvermerk vor dem Faktenauszug", { ampel: "rot", art: "protokoll", auszug: { nur_einordnung: true } }],
    ["ein Sachauszug des ersten Stands von Stufe 2", { ampel: "gruen", art: "lotse_gruen_teilungserklaerung", auszug: { text: "Sachauszug" } }],
  ])("%s: nicht angehängt und nicht neu eingeordnet", async (_fall, zeile) => {
    const { AUSZUG_SCHEMA_FASSUNG } = await import("../../supabase/functions/_shared/lotse-faktenauszug");
    const { auszugSchluessel, auszugVorsilbe, sha256Hex } = await import("../../supabase/functions/_shared/lotse-unterlagen");
    const schluessel = auszugSchluessel(auszugVorsilbe({ eimer: "investagon-dokumente", pfad: "o1/expose.pdf" }, "v1"), await sha256Hex(PDF));
    const { db } = nachgebildeteDb({
      objektDoks: [{ name: "Exposé Haus am Park.pdf", url: "/investagon-dokument/o1/expose.pdf" }],
      dateien: { "investagon-dokumente/o1/expose.pdf": PDF },
      auszugZeilen: [{ dokument_schluessel: schluessel, schema_fassung: AUSZUG_SCHEMA_FASSUNG, ...zeile }],
    });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    let eingeordnet = false;
    const einordnen = async () => {
      eingeordnet = true;
      return { ergebnis: "frei" } as const;
    };
    await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf, einordnen }));
    expect(eingeordnet).toBe(false);
    expect(gateway.anfragen[0].rumpf).not.toContain("data:application/pdf;base64,");
  });

  it("ohne gespeicherte Zeile wird wie bisher eingeordnet und angehängt", async () => {
    const { db } = nachgebildeteDb({
      objektDoks: [{ name: "Exposé Haus am Park.pdf", url: "/investagon-dokument/o1/expose.pdf" }],
      dateien: { "investagon-dokumente/o1/expose.pdf": PDF },
      auszugZeilen: [],
    });
    const gateway = nachgebildeterGateway(werkzeugAntwort());
    await erzeugeFuerObjekt(db, OBJEKT, umgebung({ abruf: gateway.abruf }));
    expect(gateway.anfragen[0].rumpf).toContain("data:application/pdf;base64,");
  });
});

