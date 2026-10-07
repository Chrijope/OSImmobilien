/**
 * Der Faktenauszug aus roten Unterlagen (`_shared/lotse-faktenauszug.ts`).
 *
 * Das ist die Datenschutzzusage des OS Lotsen: Aus Mietvertrag und
 * Grundbuch kommt nur heraus, was die Prüfung übersteht. Der Test beweist,
 * dass Namen, Freitext, unbekannte Schlüssel und unplausible Zahlen
 * wegfallen, auch wenn das Modell sie liefert.
 */
import { describe, expect, it } from "vitest";
import {
  artAusText,
  artBestimmen,
  AUSZUG_SCHEMA_FASSUNG,
  auszugFuerPrompt,
  faktenauszugErzeugen,
  faktenauszugWerkzeug,
  GRUNDBUCH_FELDER,
  MIETVERTRAG_FELDER,
  pruefeFaktenauszug,
  rechnerFelderAusMietvertrag,
  rechnerFelderZusammenfuehren,
  roteArtAusFach,
  roteArtVon,
  wohnungAusMietvertrag,
} from "../../supabase/functions/_shared/lotse-faktenauszug";
import { auszugPasst, dokumentVersionen, freigegebeneUnterlagen } from "../../supabase/functions/_shared/lotse-unterlagen";
import { dokumentAblage } from "../../supabase/functions/_shared/objekt-texte-unterlagen";
import { analysePfadErlaubt, sichererSpeicherpfad } from "../../supabase/functions/_shared/speicherpfad";
import {
  gespeicherteEinordnung,
  GESPERRT_ART,
  NUR_EINORDNUNG,
  ohneVerguetungsangaben,
  unterlageEinordnen,
  vorabGesperrt,
} from "../../supabase/functions/_shared/lotse-faktenauszug";
import {
  auszugAnsicht,
  auszugSchluessel,
  auszugVorsilbe,
  FEHLVERSUCH_SPERRE_MS,
  fehlversuchVon,
  neueAuswaehlen,
  sha256Hex,
  zeilenMitVorsilbe,
} from "../../supabase/functions/_shared/lotse-unterlagen";

describe("pruefeFaktenauszug, Mietvertrag", () => {
  it("behält nur geprüfte Felder, Namen und Freitext fallen weg", () => {
    const geprueft = pruefeFaktenauszug("mietvertrag", {
      nettokaltmiete: 640,
      nebenkosten_vorauszahlung: 180,
      mietbeginn: "2023-04-01",
      befristet: false,
      mietart: "index",
      kaution: "drei Monatsmieten",
      mieter: "Max Muster",
      vermieter_name: "Erika Beispiel",
      bemerkung: "Mieter zahlt pünktlich",
      schoenheitsreparaturen_mieter: "ja",
      we_nr: "9",
      etage: "2. OG",
      wohnflaeche_qm: 55.5,
      zimmer: 2,
      konto: { iban: "DE00 0000" },
    });
    expect(geprueft).toEqual({
      nettokaltmiete: 640,
      nebenkosten_vorauszahlung: 180,
      mietbeginn: "2023-04-01",
      befristet: false,
      mietart: "index",
      schoenheitsreparaturen_mieter: "ja",
      we_nr: "9",
      etage: "2. OG",
      wohnflaeche_qm: 55.5,
      zimmer: 2,
    });
  });

  it("verwirft ungültige Daten, fremde Auswahlwerte, Namen im Format-Feld und unplausible Zahlen", () => {
    const geprueft = pruefeFaktenauszug("mietvertrag", {
      mietbeginn: "2024-02-30",
      befristet_bis: "31.12.2027",
      kuendigungsverzicht_bis: "1850-01-01",
      mietart: "gewerbe",
      we_nr: "Meier",
      etage: "Erdgeschoss bei Familie Meier",
      nettokaltmiete: 250000,
      kaution: -5,
      stellplatz_mitvermietet: "ja",
      zimmer: Number.POSITIVE_INFINITY,
    });
    expect(geprueft).toEqual({});
  });

  it("keine Antwort oder keine Tabelle ergibt einen leeren Auszug", () => {
    expect(pruefeFaktenauszug("mietvertrag", null)).toEqual({});
    expect(pruefeFaktenauszug("mietvertrag", "Max Muster")).toEqual({});
    expect(pruefeFaktenauszug("mietvertrag", [{ nettokaltmiete: 1 }])).toEqual({});
  });
});

describe("pruefeFaktenauszug, Grundbuch", () => {
  it("nur Arten ohne Berechtigte, Beträge ohne Gläubiger, der Anteil als Bruch", () => {
    const geprueft = pruefeFaktenauszug("grundbuch", {
      eigentuemer: "Erika Beispiel",
      miteigentumsanteil: "85,3 / 1000",
      abteilung2: ["wegerecht", "Wohnrecht für Frau Beispiel", "vorkaufsrecht", 7],
      abteilung3: [
        { art: "grundschuld", betrag: 250000, glaeubiger: "Beispielbank" },
        { art: "Grundschuld der Beispielbank", betrag: 1 },
        { art: "hypothek", betrag: "viel" },
        "Sparkasse",
      ],
    });
    expect(geprueft).toEqual({
      miteigentumsanteil: "85,3/1000",
      abteilung2: ["wegerecht", "vorkaufsrecht"],
      abteilung3: [{ art: "grundschuld", betrag: 250000 }, { art: "hypothek" }],
    });
  });

  it("ein Name im Anteil fällt weg", () => {
    expect(pruefeFaktenauszug("grundbuch", { miteigentumsanteil: "Anteil Beispiel" })).toEqual({});
  });
});

describe("Schema", () => {
  // Ein Feld wie „schoenheitsreparaturen_mieter“ ist erlaubt: Es ist eine Auswahl, keine Person.
  const verboten = /^mieter$|(^|_)(name|vermieter|eigentuemer|glaeubiger|berechtigte?|anschrift|adresse|geburt\w*|konto|iban|bemerkung|freitext|notiz|text)$/i;

  it("hat kein Feld für eine Person und keinen Freitext", () => {
    for (const art of ["mietvertrag", "grundbuch"] as const) {
      const schema = faktenauszugWerkzeug(art) as { function: { parameters: { properties: Record<string, unknown>; additionalProperties: boolean } } };
      expect(schema.function.parameters.additionalProperties).toBe(false);
      for (const feld of Object.keys(schema.function.parameters.properties)) expect(feld).not.toMatch(verboten);
    }
    // Jede Zeichenkette ist Auswahl, Datum oder festes Format.
    for (const feld of [...Object.values(MIETVERTRAG_FELDER), ...Object.values(GRUNDBUCH_FELDER)]) {
      expect(["zahl", "ja_nein", "datum", "auswahl", "muster"]).toContain(feld.typ);
    }
  });
});

describe("faktenauszugErzeugen", () => {
  it("gibt nur das Geprüfte zurück, auch wenn das Modell Namen liefert", async () => {
    const abruf = (async () =>
      new Response(JSON.stringify({
        choices: [{
          message: {
            tool_calls: [{ function: { arguments: JSON.stringify({ nettokaltmiete: 700, mieter: "Max Muster", we_nr: "Max" }) } }],
          },
        }],
      }), { status: 200 })) as typeof fetch;
    const ergebnis = await faktenauszugErzeugen("schluessel", "mietvertrag", { pdf: "data:application/pdf;base64,JVBERi0=" }, abruf);
    expect(ergebnis).toEqual({ ok: true, auszug: { nettokaltmiete: 700 } });
  });

  it("meldet einen Fehler des Gateways, ohne etwas durchzureichen", async () => {
    const abruf = (async () => new Response("Mieter Max Muster", { status: 500 })) as typeof fetch;
    const ergebnis = await faktenauszugErzeugen("schluessel", "grundbuch", { text: "Grundbuch von Beispielstadt" }, abruf);
    expect(ergebnis.ok).toBe(false);
    expect(JSON.stringify(ergebnis)).not.toContain("Max");
  });
});

describe("Einordnen und Weitergeben", () => {
  it("unterscheidet Grundbuch und Mietvertrag", () => {
    expect(roteArtVon("Grundbuchauszug Blatt 123.pdf")).toBe("grundbuch");
    expect(roteArtVon("Mietvertrag WE 3.pdf")).toBe("mietvertrag");
    expect(roteArtVon("Datei.pdf", "land_register")).toBe("grundbuch");
  });

  it("eine Wohnung für die Objektanlage nur mit Nummer, Geschoss und Fläche", () => {
    expect(wohnungAusMietvertrag({ we_nr: "3", etage: "EG", wohnflaeche_qm: 61, nettokaltmiete: 590 })).toEqual({
      weNr: "3", etage: "EG", groesse: 61, kaltmiete: 590, vermietet: true,
    });
    expect(wohnungAusMietvertrag({ we_nr: "3", nettokaltmiete: 590 })).toBeNull();
  });
});

describe("Ablage nur zum angefragten Bezug (LOTSE-001)", () => {
  const o = "11111111-1111-4111-8111-111111111111";
  const w = "22222222-2222-4222-8222-222222222222";
  const objekt = { objektId: o, ebene: "objekt" as const };
  const einheit = { objektId: o, wohnungId: w, ebene: "einheit" as const };

  it("nimmt die Pfade der Schreiber an", () => {
    expect(dokumentAblage(`/objekt-dokument/objekte/${o}/dokumente/d1_Expose.pdf`, objekt))
      .toEqual({ eimer: "objekt-dokumente", pfad: `objekte/${o}/dokumente/d1_Expose.pdf` });
    expect(dokumentAblage(`/objekt-dokument/objekte/${o}/wohnungen/${w}/wd1_Mietvertrag.pdf`, einheit))
      .toEqual({ eimer: "objekt-dokumente", pfad: `objekte/${o}/wohnungen/${w}/wd1_Mietvertrag.pdf` });
    expect(dokumentAblage(`/investagon-dokument/${o}/Mietvertrag.pdf`, einheit))
      .toEqual({ eimer: "investagon-dokumente", pfad: `${o}/Mietvertrag.pdf` });
    expect(dokumentAblage(`https://x.supabase.co/storage/v1/object/public/objekt-medien/objekte/${o}/dokumente/a%20b.pdf`, objekt))
      .toEqual({ eimer: "objekt-medien", pfad: `objekte/${o}/dokumente/a b.pdf` });
  });

  it("lehnt fremde Eimer, fremde Objekte, fremde Einheiten und Pfadtricks ab", () => {
    const fremd = "33333333-3333-4333-8333-333333333333";
    for (const url of [
      "https://x.supabase.co/storage/v1/object/public/unterlagen/kunde/Selbstauskunft.pdf",
      "https://x.supabase.co/storage/v1/object/public/avatars/a.png",
      `/objekt-dokument/objekte/${fremd}/dokumente/a.pdf`,
      `/objekt-dokument/objekte/${o}/dokumente/../../${fremd}/dokumente/a.pdf`,
      `/investagon-dokument/${fremd}/a.pdf`,
      `/objekt-dokument/objekte/${o}/wohnungen/${fremd}/a.pdf`,
      "https://beliebig.example/datei.pdf",
      "",
    ]) {
      expect(dokumentAblage(url, einheit)).toBeNull();
    }
    // Eine Einheitsunterlage ohne Einheit, eine Objektunterlage im Einheitspfad.
    expect(dokumentAblage(`/objekt-dokument/objekte/${o}/wohnungen/${w}/a.pdf`, { objektId: o, ebene: "einheit" })).toBeNull();
    expect(dokumentAblage(`/objekt-dokument/objekte/${o}/wohnungen/${w}/a.pdf`, objekt)).toBeNull();
  });
});

describe("Gespeicherte Auszüge (LOTSE-003, LOTSE-004)", () => {
  it("die Version kommt aus der Ordnerliste, ohne Download", async () => {
    const aufrufe: string[] = [];
    const db = {
      storage: {
        from: (eimer: string) => ({
          list: async (ordner: string) => {
            aufrufe.push(`${eimer}:${ordner}`);
            return { data: [{ name: "a.pdf", updated_at: "2026-09-28T08:00:00Z", metadata: { eTag: "e1", size: 10 } }, { name: "fremd.pdf" }], error: null };
          },
          download: () => { throw new Error("kein Download erlaubt"); },
        }),
      },
    };
    const versionen = await dokumentVersionen(db, [
      { eimer: "investagon-dokumente", pfad: "o/a.pdf" },
      { eimer: "investagon-dokumente", pfad: "o/fehlt.pdf" },
    ]);
    expect(aufrufe).toEqual(["investagon-dokumente:o"]);
    expect(versionen.get("investagon-dokumente/o/a.pdf")).toBe("e1|2026-09-28T08:00:00Z|10");
    expect(versionen.has("investagon-dokumente/o/fehlt.pdf")).toBe(false);
  });

  it("ein Auszug gilt nur mit passender Ampel, Art und Schema-Fassung", () => {
    const f = AUSZUG_SCHEMA_FASSUNG;
    expect(auszugPasst({ ampel: "rot", art: "mietvertrag", schema_fassung: f }, { ampel: "rot", art: "mietvertrag" })).toBe(true);
    expect(auszugPasst({ ampel: "gruen", art: "mietvertrag", schema_fassung: f }, { ampel: "rot", art: "mietvertrag" })).toBe(false);
    expect(auszugPasst({ ampel: "rot", art: "grundbuch", schema_fassung: f }, { ampel: "rot", art: "mietvertrag" })).toBe(false);
    // Ein Auszug aus einer älteren Fassung gilt nicht mehr.
    expect(auszugPasst({ ampel: "rot", art: "mietvertrag", schema_fassung: f - 1 }, { ampel: "rot", art: "mietvertrag" })).toBe(false);
    expect(auszugPasst({ ampel: "rot", art: "mietvertrag", schema_fassung: null }, { ampel: "rot", art: "mietvertrag" })).toBe(false);
    expect(auszugPasst(null, { ampel: "rot", art: "mietvertrag" })).toBe(false);
  });

  it("vor dem Prompt: ein roter Eintrag mit Freitext kommt nie durch", () => {
    expect(auszugFuerPrompt("rot", "mietvertrag", { text: "Mieter Max Muster zahlt 640 Euro", nettokaltmiete: 640 }))
      .toEqual({ nettokaltmiete: 640 });
    expect(auszugFuerPrompt("rot", "mietvertrag", { text: "Max Muster" })).toEqual({});
    expect(auszugFuerPrompt("rot", null, { nettokaltmiete: 640 })).toBeNull();
    expect(auszugFuerPrompt("gruen", null, { text: "Klasse C", mieter: "Max" })).toEqual({ text: "Klasse C" });
    expect(auszugFuerPrompt("rot", "grundbuch", { nicht_auswertbar: "kein PDF" })).toEqual({ nicht_auswertbar: "kein PDF" });
    expect(auszugFuerPrompt("rot", "grundbuch", { nicht_auswertbar: "Eigentümer Erika Beispiel" })).toBeNull();
  });
});

describe("Objektanlage: das Fach entscheidet (LOTSE-002)", () => {
  it("Mietvertrags- und Grundbuchfach sind rot, gleich wie die Datei heißt", () => {
    expect(roteArtAusFach("mietvertrag")).toBe("mietvertrag");
    expect(roteArtAusFach("grundbuchauszug")).toBe("grundbuch");
    expect(roteArtAusFach("expose")).toBeNull();
    expect(roteArtAusFach(undefined)).toBeNull();
  });
});

describe("Investmentrechner aus dem Mietvertrag", () => {
  const auszug = { nettokaltmiete: 640, wohnflaeche_qm: 55.5, zimmer: 2, we_nr: "9" };

  it("übernimmt Kaltmiete, Fläche und Zimmer mit festem Quellentext", () => {
    const { felder, hinweise } = rechnerFelderAusMietvertrag(auszug, { weNr: "WE 9", ebene: "objekt" });
    expect(felder).toEqual({
      monthlyColdRent: { wert: 640, quelle: "Mietvertrag zum Objekt, Faktenauszug", sicherheit: "hoch" },
      area: { wert: 55.5, quelle: "Mietvertrag zum Objekt, Faktenauszug", sicherheit: "hoch" },
      rooms: { wert: 2, quelle: "Mietvertrag zum Objekt, Faktenauszug", sicherheit: "hoch" },
    });
    expect(hinweise).toEqual([]);
    // Am Vertrag der Einheit ohne Nummer: ebenfalls übernommen.
    expect(Object.keys(rechnerFelderAusMietvertrag({ nettokaltmiete: 640 }, { weNr: "9", ebene: "einheit" }).felder)).toEqual(["monthlyColdRent"]);
  });

  it("eine andere Wohnung oder ein Objektvertrag ohne Nummer wird nicht übernommen", () => {
    expect(rechnerFelderAusMietvertrag(auszug, { weNr: "10", ebene: "einheit" }).felder).toEqual({});
    const ohneNummer = rechnerFelderAusMietvertrag({ nettokaltmiete: 640 }, { weNr: "9", ebene: "objekt" });
    expect(ohneNummer.felder).toEqual({});
    expect(ohneNummer.hinweise[0]).toContain("nicht sicher zuordnen");
  });

  it("verschiedene Werte aus Mietvertrag und übrigen Unterlagen: kein Feld, fester Hinweis ohne Wert", () => {
    const haupt = { monthlyColdRent: { wert: 600, quelle: "Expose.pdf, Seite 2", sicherheit: "hoch" }, area: { wert: 55.5, quelle: "Expose.pdf", sicherheit: "hoch" } };
    const fakten = [rechnerFelderAusMietvertrag(auszug, { weNr: "9", ebene: "einheit" })];
    const { felder, hinweise } = rechnerFelderZusammenfuehren(haupt, fakten);
    expect(felder.monthlyColdRent).toBeUndefined();
    expect(felder.area).toEqual(haupt.area);
    expect(felder.rooms).toEqual(fakten[0].felder.rooms);
    expect(hinweise).toEqual(["Kaltmiete: Mietvertrag und übrige Unterlagen nennen verschiedene Werte, bitte prüfen."]);
    expect(hinweise.join(" ")).not.toMatch(/640|600/);
  });
});

describe("Rechte des Aufrufers vor dem Dienstschlüssel (LOTSE-R3-001)", () => {
  const bezug = { objektId: "o1", wohnungId: "w1" };
  /** Ein Nutzer-Client, der nur die angegebenen Zeilen sieht, wie die Zeilenregeln es täten. */
  function nutzer(sieht: { objekt: boolean; einheitImObjekt: boolean; objektDoks: string[]; einheitDoks: string[] }) {
    return {
      from: (tabelle: string) => {
        const filter: Record<string, unknown> = {};
        const abfrage = {
          select: () => abfrage,
          eq: (spalte: string, wert: unknown) => { filter[spalte] = wert; return abfrage; },
          maybeSingle: async () => {
            if (tabelle === "objekte") return { data: sieht.objekt && filter.id === "o1" ? { id: "o1" } : null, error: null };
            return { data: sieht.einheitImObjekt && filter.id === "w1" && filter.objekt_id === "o1" ? { id: "w1" } : null, error: null };
          },
          then: (fertig: (e: unknown) => unknown) => fertig({
            data: (tabelle === "objekt_dokumente" ? sieht.objektDoks : sieht.einheitDoks).map((url) => ({ url })),
            error: null,
          }),
        };
        return abfrage;
      },
    };
  }

  it("nur Unterlagen aus den eigenen Dokumentzeilen, mit Ebene aus der Datenbank", async () => {
    const frei = await freigegebeneUnterlagen(nutzer({ objekt: true, einheitImObjekt: true, objektDoks: ["/o.pdf"], einheitDoks: ["/m.pdf"] }), bezug);
    expect([...frei]).toEqual([["/o.pdf", "objekt"], ["/m.pdf", "einheit"]]);
  });

  it("Objekt nicht sichtbar, Einheit fremd oder keine Dokumentzeilen (Kundenkonto): nichts frei", async () => {
    expect((await freigegebeneUnterlagen(nutzer({ objekt: false, einheitImObjekt: true, objektDoks: ["/o.pdf"], einheitDoks: [] }), bezug)).size).toBe(0);
    expect((await freigegebeneUnterlagen(nutzer({ objekt: true, einheitImObjekt: false, objektDoks: ["/o.pdf"], einheitDoks: [] }), bezug)).size).toBe(0);
    expect((await freigegebeneUnterlagen(nutzer({ objekt: true, einheitImObjekt: true, objektDoks: [], einheitDoks: [] }), bezug)).size).toBe(0);
  });
});

describe("Von Hand hochgeladener Mietvertrag (LOTSE-R3-005)", () => {
  it("ein einzelner Vertrag liefert Kaltmiete, Fläche und Zimmer, auch ohne Einheitskontext", () => {
    const { felder } = rechnerFelderAusMietvertrag({ nettokaltmiete: 640, wohnflaeche_qm: 55.5, zimmer: 2 }, { weNr: null, ebene: "upload" });
    expect(Object.keys(felder).sort()).toEqual(["area", "monthlyColdRent", "rooms"]);
    expect(felder.monthlyColdRent.quelle).toBe("Hochgeladener Mietvertrag, Faktenauszug");
  });

  it("nennt er eine andere Wohnung als die Einheit, wird nichts übernommen", () => {
    expect(rechnerFelderAusMietvertrag({ nettokaltmiete: 640, we_nr: "4" }, { weNr: "9", ebene: "upload" }).felder).toEqual({});
  });

  it("gemeinsame Objektunterlagen bleiben bei der strengen Zuordnung über die Nummer", () => {
    expect(rechnerFelderAusMietvertrag({ nettokaltmiete: 640 }, { weNr: null, ebene: "objekt" }).felder).toEqual({});
  });
});

describe("Einordnung nach dem Inhalt, gleich wie die Datei heißt (LOTSE-R4-002)", () => {
  const expose = `Exposé Beispielstraße 12, scan.pdf. Vermietete 3-Zimmer-Wohnung im 2. OG, 72 m² Wohnfläche.
    Der Mieter wohnt seit 2019 in der Wohnung, ein unbefristeter Mietvertrag besteht. Kaltmiete 650 Euro,
    Nebenkostenvorauszahlung 180 Euro, Kaution hinterlegt. Das Grundbuch ist in Abteilung II lastenfrei.
    Energieausweis Klasse C, Baujahr 1994, Hausgeld 280 Euro.`;
  const teilungserklaerung = `Teilungserklärung nach § 8 WEG. Eingetragen im Grundbuch von Beispielstadt Blatt 1234 beim
    Amtsgericht Beispielstadt. Miteigentumsanteil 85,3/1000 verbunden mit dem Sondereigentum an Wohnung Nr. 9.`;
  const mietvertrag = `Wohnraummietvertrag. Zwischen Vermieter und Mieter wird folgender Vertrag geschlossen.
    § 1 Mietsache: Wohnung im 2. OG. § 3 Mietzins: 650 Euro. § 5 Mietsicherheit: drei Monatsmieten.
    § 8 Schönheitsreparaturen trägt der Mieter.`;
  const grundbuch = `Amtsgericht Beispielstadt, Grundbuchamt. Grundbuch von Beispielstadt Blatt 1234.
    Bestandsverzeichnis. Erste Abteilung: Eigentümer. Zweite Abteilung: Lasten und Beschränkungen.
    Dritte Abteilung: Hypotheken, Grundschulden.`;
  const mieterliste = "Mieterliste zum Stichtag 01.09.2026. WE 1 Kaltmiete 600 Euro, Kaution 1.800 Euro, Mietbeginn 01.03.2020.";

  it("ein Exposé und eine Teilungserklärung bleiben frei", () => {
    expect(artAusText(expose)).toBeNull();
    expect(artAusText(teilungserklaerung)).toBeNull();
    expect(artAusText("")).toBeNull();
  });

  it("Mietvertrag, Grundbuchauszug und Mieterliste werden erkannt", () => {
    expect(artAusText(mietvertrag)).toBe("mietvertrag");
    expect(artAusText(grundbuch)).toBe("grundbuch");
    expect(artAusText(mieterliste)).toBe("mietvertrag");
  });

  it("ein Scan wird nur als Auswahlwert eingeordnet, alles andere ist unklar", async () => {
    const mit = (argumente: unknown, status = 200) => (async () =>
      new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify(argumente) } }] } }] }), { status })) as typeof fetch;
    const pdf = { pdf: "data:application/pdf;base64,JVBERi0=" };
    expect(await artBestimmen("s", pdf, mit({ art: "mietvertrag" }))).toBe("mietvertrag");
    expect(await artBestimmen("s", pdf, mit({ art: "sonstiges" }))).toBe("sonstiges");
    expect(await artBestimmen("s", pdf, mit({ art: "Mietvertrag von Max Muster" }))).toBeNull();
    expect(await artBestimmen("s", pdf, mit({ art: "grundbuch" }, 500))).toBeNull();
    expect(await artBestimmen("s", pdf, (async () => { throw new Error("weg"); }) as typeof fetch)).toBeNull();
  });
});

describe("Die einheitliche Regel vor jeder freien Auswertung (LOTSE-R5)", () => {
  /** Ein Einordnungsaufruf mit fester Antwort, der mitzählt, wie oft er lief. */
  function aufruf(art: string | null, status = 200) {
    const aufrufe: unknown[] = [];
    const abruf = (async (_url: string, init?: { body?: string }) => {
      aufrufe.push(JSON.parse(init?.body ?? "{}"));
      if (art === null) throw new Error("abgebrochen");
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ art }) } }] } }] }), { status });
    }) as unknown as typeof fetch;
    return { abruf, aufrufe };
  }
  const pdf = "data:application/pdf;base64,JVBERi0=";

  it("ein Mietvertrag mit Titel und Fach „Exposé“ wird durch den Einordnungsaufruf rot", async () => {
    const { abruf, aufrufe } = aufruf("mietvertrag");
    expect(await unterlageEinordnen("s", { name: "Exposé.pdf", fach: "expose", pdf }, abruf)).toEqual({ ergebnis: "rot", art: "mietvertrag" });
    expect(aufrufe).toHaveLength(1);
  });

  it("ein Text-Mietvertrag unter der Stichwortschwelle läuft über den Aufruf und wird rot", async () => {
    const knapp = "Vereinbarung über die Wohnung Nr. 9. Monatlich 650 Euro. Beginn 01.04.2023.";
    expect(artAusText(knapp)).toBeNull();
    const { abruf, aufrufe } = aufruf("mietvertrag");
    expect(await unterlageEinordnen("s", { name: "scan.pdf", text: knapp }, abruf)).toEqual({ ergebnis: "rot", art: "mietvertrag" });
    expect(aufrufe).toHaveLength(1);
  });

  it("ein Exposé wird nur mit „sonstiges“ frei, ohne Inhalt bleibt es unklar", async () => {
    expect(await unterlageEinordnen("s", { name: "Exposé.pdf", pdf }, aufruf("sonstiges").abruf)).toEqual({ ergebnis: "frei" });
    expect(await unterlageEinordnen("s", { name: "Exposé.pdf" }, aufruf("sonstiges").abruf)).toEqual({ ergebnis: "unklar" });
  });

  it("Fehler, Abbruch oder ein fremder Wert zählen nie als frei", async () => {
    expect((await unterlageEinordnen("s", { name: "a.pdf", pdf }, aufruf("grundbuch", 500).abruf)).ergebnis).toBe("unklar");
    expect((await unterlageEinordnen("s", { name: "a.pdf", pdf }, aufruf(null).abruf)).ergebnis).toBe("unklar");
    expect((await unterlageEinordnen("s", { name: "a.pdf", pdf }, aufruf("expose").abruf)).ergebnis).toBe("unklar");
  });

  it("Name, Fach und Stichworte entscheiden nur Richtung rot, ohne Aufruf", async () => {
    const { abruf, aufrufe } = aufruf("sonstiges");
    expect(await unterlageEinordnen("s", { name: "Mietvertrag WE 3.pdf", pdf }, abruf)).toEqual({ ergebnis: "rot", art: "mietvertrag" });
    expect(await unterlageEinordnen("s", { name: "a.pdf", fach: "grundbuchauszug", pdf }, abruf)).toEqual({ ergebnis: "rot", art: "grundbuch" });
    expect(await unterlageEinordnen("s", { name: "a.pdf", investagonKategorie: "rental_agreement", pdf }, abruf)).toEqual({ ergebnis: "rot", art: "mietvertrag" });
    expect(aufrufe).toHaveLength(0);
  });

  it("gespeicherte Einordnung: frei nur aus Sachauszug oder Vermerk, nie aus einem Größenvermerk", () => {
    const f = AUSZUG_SCHEMA_FASSUNG;
    expect(gespeicherteEinordnung({ ampel: "gruen", art: "expose", schema_fassung: f, auszug: { text: "Klasse C" } })).toEqual({ ergebnis: "frei" });
    expect(gespeicherteEinordnung({ ampel: "gruen", art: "sonstiges", schema_fassung: f, auszug: NUR_EINORDNUNG })).toEqual({ ergebnis: "frei" });
    expect(gespeicherteEinordnung({ ampel: "rot", art: "grundbuch", schema_fassung: f, auszug: NUR_EINORDNUNG })).toEqual({ ergebnis: "rot", art: "grundbuch" });
    expect(gespeicherteEinordnung({ ampel: "gruen", art: "expose", schema_fassung: f, auszug: { nicht_auswertbar: "größer als 8 MB" } })).toBeNull();
    expect(gespeicherteEinordnung({ ampel: "gruen", art: "expose", schema_fassung: f - 1, auszug: { text: "alt" } })).toBeNull();
    // Ein reiner Vermerk ist kein Auszug für den Prompt.
    expect(auszugFuerPrompt("rot", "mietvertrag", NUR_EINORDNUNG)).toBeNull();
  });
});

describe("Strenge Pfadprüfung (LOTSE-R5-001)", () => {
  const nutzer = "11111111-1111-4111-8111-111111111111";
  const lauf = "22222222-2222-4222-8222-222222222222";

  it("die Objektanlage nimmt nur ihr eigenes Upload-Format an", () => {
    expect(analysePfadErlaubt(nutzer, `${nutzer}/analyse-temp/${lauf}/3_Expose_Haus.pdf`)).toBe(true);
    for (const pfad of [
      `${nutzer}/analyse-temp/${lauf}/%2e%2e/%2e%2e/kunde/x.pdf`,
      `${nutzer}/analyse-temp/${lauf}/3_%2e%2e%2fx.pdf`,
      `${nutzer}/analyse-temp/${lauf}/3_a%252e.pdf`,
      `${nutzer}/analyse-temp/../../33333333-3333-4333-8333-333333333333/analyse-temp/${lauf}/1_x.pdf`,
      `${nutzer}/analyse-temp/${lauf}//3_x.pdf`,
      `${nutzer}/analyse-temp/${lauf}/3_x\\y.pdf`,
      `${nutzer}/analyse-temp/${lauf}/3_x\u0000.pdf`,
      `33333333-3333-4333-8333-333333333333/analyse-temp/${lauf}/3_x.pdf`,
      `${nutzer}/andere/${lauf}/3_x.pdf`,
    ]) {
      expect(analysePfadErlaubt(nutzer, pfad)).toBe(false);
    }
  });

  it("jede geteilte Pfadauswertung lehnt kodierte Trenner, Doppel-Schrägstrich, Backslash und Steuerzeichen ab", () => {
    expect(sichererSpeicherpfad("objekte/o1/dokumente/a.pdf")).toBe("objekte/o1/dokumente/a.pdf");
    for (const pfad of ["a/%2e%2e/b", "a//b", "a\\b", "a/\u0007b", "/a", "a/../b", "a/./b", "a/"]) {
      expect(sichererSpeicherpfad(pfad)).toBeNull();
    }
    const o = "11111111-1111-4111-8111-111111111111";
    const bezug = { objektId: o, ebene: "objekt" as const };
    expect(dokumentAblage(`/objekt-dokument/objekte/${o}/dokumente/%2e%2e/x.pdf`, bezug)).toBeNull();
    // Doppelt kodiert: nach dem Dekodieren steht wieder ein %, das reicht zur Ablehnung.
    expect(dokumentAblage(`https://x.supabase.co/storage/v1/object/public/objekt-medien/objekte/${o}/dokumente/%252e%252e/x.pdf`, bezug)).toBeNull();
    expect(dokumentAblage(`https://x.supabase.co/storage/v1/object/public/objekt-medien/objekte/${o}/dokumente/%2e%2e/%2e%2e/y/x.pdf`, bezug)).toBeNull();
  });
});

describe("Einordnung über alles, was weitergegeben wird (LOTSE-R6-001, R6-002)", () => {
  /** Ein Einordnungsaufruf, der je Anfrage die nächste Antwort gibt. */
  function folge(...arten: string[]) {
    let n = 0;
    const abruf = (async () => new Response(JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ art: arten[Math.min(n++, arten.length - 1)] }) } }] } }],
    }), { status: 200 })) as unknown as typeof fetch;
    return { abruf, anzahl: () => n };
  }
  const expose = "Exposé Beispielstraße 12. Helle Wohnung mit Balkon, Energieausweis Klasse C. ";
  const mietvertrag = " Wohnraummietvertrag zwischen Vermieter und Mieter. § 1 Mietsache. § 3 Mietzins 650 Euro.";

  it("Stichworte sehen den ganzen Text: ein Mietvertrag nach Zeichen 30.000 wird rot", () => {
    const lang = expose.repeat(Math.ceil(30_500 / expose.length)) + mietvertrag;
    expect(lang.indexOf("Vermieter")).toBeGreaterThan(30_000);
    expect(artAusText(lang)).toBe("mietvertrag");
  });

  it("der Einordnungsaufruf läuft über jeden Abschnitt, ein roter Abschnitt macht das ganze Dokument rot", async () => {
    const lang = "Ruhige Lage, gepflegtes Haus. ".repeat(1500);
    expect(lang.length).toBeGreaterThan(40_000);
    const { abruf, anzahl } = folge("sonstiges", "sonstiges", "mietvertrag");
    expect(await unterlageEinordnen("s", { name: "a.pdf", text: lang }, abruf)).toEqual({ ergebnis: "rot", art: "mietvertrag" });
    expect(anzahl()).toBe(3);
  });

  it("Text und PDF werden beide eingeordnet, rot in einer Darstellung verhindert die freie Auswertung", async () => {
    const { abruf, anzahl } = folge("sonstiges", "grundbuch");
    expect(await unterlageEinordnen("s", { name: "a.pdf", pdf: "data:application/pdf;base64,JVBERi0=", text: "kurzer Text" }, abruf))
      .toEqual({ ergebnis: "rot", art: "grundbuch" });
    expect(anzahl()).toBe(2);
    // Alle Abschnitte „sonstiges“: frei.
    expect(await unterlageEinordnen("s", { name: "a.pdf", text: "kurz" }, folge("sonstiges").abruf)).toEqual({ ergebnis: "frei" });
  });
});

describe("Vertriebsvereinbarungen werden nie ausgewertet (Provisionen, 28.09.2026)", () => {
  const pdf = "data:application/pdf;base64,JVBERi0=";
  function aufruf(art: string) {
    let anzahl = 0;
    const abruf = (async () => {
      anzahl += 1;
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ art }) } }] } }] }));
    }) as unknown as typeof fetch;
    return { abruf, anzahl: () => anzahl };
  }

  it("Name oder Text mit Provision, Courtage oder Vertriebsvereinbarung sperrt ohne Aufruf, auch vor rot", async () => {
    const { abruf, anzahl } = aufruf("sonstiges");
    for (const name of ["Provisionsliste 2026.pdf", "Vertriebsvereinbarung Bauträger.pdf", "Courtage.pdf", "Maklervertrag.pdf", "Tippgeber.pdf", "Mietvertrag Provision.pdf"]) {
      expect(await unterlageEinordnen("s", { name, pdf }, abruf)).toEqual({ ergebnis: "gesperrt" });
    }
    // Ein einzelner Vergütungssatz sperrt nicht die ganze Unterlage (LOTSE-R10-004), er wird gestrichen.
    expect(ohneVerguetungsangaben("Baujahr 2020.\n\nDie Vergütung des Vertriebs beträgt 4 %.")).toBe("Baujahr 2020.");
    // Im selben Absatz fällt seit Runde 6 der ganze Absatz.
    expect(ohneVerguetungsangaben("Baujahr 2020. Die Vergütung des Vertriebs beträgt 4 %.")).toBe("");
    expect(await unterlageEinordnen("s", { name: "scan.pdf", text: "Provisionsvereinbarung zwischen Bauträger und Vertrieb." }, abruf)).toEqual({ ergebnis: "gesperrt" });
    expect(anzahl()).toBe(0);
    // „provisionsfrei“ im Exposé allein sperrt nicht.
    expect(vorabGesperrt({ name: "Exposé.pdf", text: "Für dich provisionsfrei." })).toBe(false);
  });

  it("sperrt keine ganze Unterlage wegen eines einzelnen Vergütungssatzes, streicht ihn aber", () => {
    expect(vorabGesperrt({ name: "Exposé.pdf", text: "Baujahr 1995. Die Käuferprovision entfällt." })).toBe(false);
    expect(ohneVerguetungsangaben("Baujahr 1995. Die Käuferprovision entfällt.")).toBe("Baujahr 1995.");
    const plan = "Hausmeistervergütung 120 € im Monat. Verwaltervergütung 28,50 €.";
    expect(vorabGesperrt({ name: "Wirtschaftsplan 2026.pdf", text: plan })).toBe(false);
    expect(ohneVerguetungsangaben(plan)).toBe(plan);
    // Eine einzelne Provisionsangabe sperrt nicht die ganze Unterlage, der Satz fällt einzeln heraus (LOTSE-R9-002).
    const expose = "Kaufpreis 289.000 €, 64 m².\n\nMaklerprovision: 3,57 %. Der Bauträger zahlt eine Innenprovision von 6 %.";
    expect(vorabGesperrt({ name: "Exposé.pdf", text: expose })).toBe(false);
    expect(ohneVerguetungsangaben(expose)).toBe("Kaufpreis 289.000 €, 64 m².");
    expect(vorabGesperrt({ name: "scan.pdf", text: "Provisionsvereinbarung zwischen Bauträger und Vertrieb." })).toBe(true);
  });

  it("der Einordnungsaufruf meldet „vertriebsvereinbarung“: gesperrt, auch neben „sonstiges“", async () => {
    expect(await unterlageEinordnen("s", { name: "a.pdf", pdf }, aufruf("vertriebsvereinbarung").abruf)).toEqual({ ergebnis: "gesperrt" });
  });

  it("eine gespeicherte Sperre gilt in der aktuellen Fassung, eine ältere wird neu geprüft, und nie als Auszug", () => {
    expect(gespeicherteEinordnung({ ampel: "rot", art: GESPERRT_ART, schema_fassung: AUSZUG_SCHEMA_FASSUNG, auszug: NUR_EINORDNUNG })).toEqual({ ergebnis: "gesperrt" });
    // Eine Sperre älterer Fassung (4 sperrte zu breit, LOTSE-R10-005): nicht gesperrt, aber auch nicht frei, also neu einordnen.
    for (const alt of [4, 5]) expect(gespeicherteEinordnung({ ampel: "rot", art: GESPERRT_ART, schema_fassung: alt, auszug: NUR_EINORDNUNG })).toBeNull();
    expect(auszugFuerPrompt("rot", null, NUR_EINORDNUNG)).toBeNull();
  });

  it("die Schemafassung ist gestiegen, ältere Einordnungen gelten nicht mehr", () => {
    expect(AUSZUG_SCHEMA_FASSUNG).toBe(6);
    expect(gespeicherteEinordnung({ ampel: "gruen", art: "sonstiges", schema_fassung: 3, auszug: NUR_EINORDNUNG })).toBeNull();
    // Fassung 5 strich die SEV-Vergütung noch aus den Auszügen (LOTSE2-007): gilt nicht mehr.
    expect(gespeicherteEinordnung({ ampel: "gruen", art: "sonstiges", schema_fassung: 5, auszug: { text: "Hausgeld 210 €." } })).toBeNull();
  });
});

describe("Sachauszug ohne Vergütungsangaben (Provisionen, 28.09.2026)", () => {
  it("entfernt jeden Satz und jede Zeile mit Provision, Courtage, Marge oder Vergütung", () => {
    const roh = [
      "Baujahr 1995. Aufzug vorhanden.",
      "",
      "- Maklerprovision: 3,57 % vom Kaufpreis",
      "- Der Vertrieb erhält 4 % vom Kaufpreis.",
      "- Marge des Bauträgers 12 %",
      "",
      "- Grunderwerbsteuer 6,5 % vom Kaufpreis",
      "",
      "Courtage laut Anlage. Balkon nach Süden.",
    ].join("\n");
    // Die Liste mit Provisionen fällt ganz (Runde 6); ohne Betrag fällt nur der Satz.
    expect(ohneVerguetungsangaben(roh)).toBe("Baujahr 1995. Aufzug vorhanden.\n\n- Grunderwerbsteuer 6,5 % vom Kaufpreis\n\nBalkon nach Süden.");
  });

  it("auch ein schon gespeicherter Auszug wird beim Laden bereinigt", () => {
    expect(auszugFuerPrompt("gruen", null, { text: "Klasse C.\n\nProvision 3 %." })).toEqual({ text: "Klasse C." });
    expect(auszugFuerPrompt("gruen", null, { text: "Courtage 3 %." })).toBeNull();
    expect(auszugFuerPrompt("gruen", null, { fehlversuch: "nicht ladbar", am: "2026-09-28T10:00:00Z" })).toBeNull();
  });
});

describe("Vorabgleich ohne Seiteneffekt (LOTSE-R8-002)", () => {
  const f = AUSZUG_SCHEMA_FASSUNG;
  it("eine Einordnungszeile mit anderer Art ändert den Kandidaten nicht und passt nicht", () => {
    const k = { ampel: "gruen" as const, art: "expose", inhaltPruefen: true };
    const vorher = { ...k };
    // Rot eingeordnet, aber ein Mietvertrag passt nicht zum Exposé-Kandidaten ohne Auszug.
    expect(auszugAnsicht({ ampel: "rot", art: "mietvertrag", schema_fassung: f, auszug: NUR_EINORDNUNG }, k)).toBeNull();
    expect(auszugAnsicht({ ampel: "gruen", art: "sonstiges", schema_fassung: f, auszug: NUR_EINORDNUNG }, k)).toBeNull();
    expect(k).toEqual(vorher);
  });

  it("nur eine Zeile, die ihre Einordnung selbst trägt, passt zu einer noch nicht eingeordneten Unterlage", () => {
    const k = { ampel: "gruen" as const, art: "expose", inhaltPruefen: true };
    expect(auszugAnsicht({ ampel: "gruen", art: "expose", schema_fassung: f, auszug: { text: "Klasse C" } }, k))
      .toEqual({ ampel: "gruen", art: "expose", roteArt: undefined });
    expect(auszugAnsicht({ ampel: "rot", art: "mietvertrag", schema_fassung: f, auszug: { nettokaltmiete: 640 } }, k))
      .toEqual({ ampel: "rot", art: "mietvertrag", roteArt: "mietvertrag" });
    expect(auszugAnsicht({ ampel: "gruen", art: "expose", schema_fassung: f, auszug: { fehlversuch: "x" } }, k)).toBeNull();
    expect(auszugAnsicht({ ampel: "rot", art: GESPERRT_ART, schema_fassung: f, auszug: NUR_EINORDNUNG }, k)).toBeNull();
  });
});

describe("Englische Vergütung und Kosten der Verwaltung (LOTSE-R8-003, R8-005)", () => {
  it("Vorabsperre und Satzfilter kennen dasselbe englische Vokabular", () => {
    expect(vorabGesperrt({ name: "Commission agreement.pdf" })).toBe(true);
    // Ein einzelner Satz sperrt nicht die ganze Unterlage (LOTSE-R10-004), er fällt im Satzfilter heraus.
    expect(vorabGesperrt({ text: "The finder's fee is payable on completion." })).toBe(false);
    expect(ohneVerguetungsangaben("Lift available.\n\nThe finder's fee is payable on completion.")).toBe("Lift available.");
    expect(vorabGesperrt({ name: "Exposé.pdf", text: "Commission-free for the buyer. Property management fee 28 EUR." })).toBe(false);
    expect(ohneVerguetungsangaben("Built in 1995.\n\nThe broker receives 3 % of the price. Brokerage fee applies.\n\nLift available."))
      .toBe("Built in 1995.\n\nLift available.");
  });

  it("die Vergütung der Verwaltung bleibt im Auszug, auch als Wendung", () => {
    const text = "Die Vergütung des WEG-Verwalters beträgt 28,50 Euro. Die Vergütung der Mietverwaltung beträgt 30 Euro.\n\nDie Innenprovision beträgt 6 %.";
    expect(ohneVerguetungsangaben(text)).toBe("Die Vergütung des WEG-Verwalters beträgt 28,50 Euro. Die Vergütung der Mietverwaltung beträgt 30 Euro.");
  });

  it("die Vergütung der SEV bleibt in jeder Schreibweise, der Filter wird sonst nicht lockerer (28.09.2026)", () => {
    const text = "SEV-Vergütung 35 €. Die Vergütung für die SEV beträgt 35 €. Sondereigentumsverwaltung (SEV): Vergütung 35 €.\n\nDie Innenprovision beträgt 6 %.";
    expect(ohneVerguetungsangaben(text)).toBe("SEV-Vergütung 35 €. Die Vergütung für die SEV beträgt 35 €. Sondereigentumsverwaltung (SEV): Vergütung 35 €.");
    // Käuferangaben bleiben im Kontext so gefiltert wie bisher.
    expect(ohneVerguetungsangaben("Baujahr 2020. Die Käuferprovision entfällt.")).toBe("Baujahr 2020.");
    expect(vorabGesperrt({ name: "SEV-Vergütung Wirtschaftsplan.pdf" })).toBe(false);
    expect(vorabGesperrt({ name: "Vertriebsvergütung.pdf" })).toBe(true);
  });
});

describe("Schlüssel aus dem Inhalt, Fehlversuche (LOTSE-R7-001, R7-003)", () => {
  it("der Schlüssel trägt den Hash der Bytes, andere Bytes ergeben einen anderen Schlüssel", async () => {
    const vorsilbe = auszugVorsilbe({ eimer: "objekt-dokumente", pfad: "objekte/o1/a.pdf" }, "etag1");
    const a = auszugSchluessel(vorsilbe, await sha256Hex(new TextEncoder().encode("alt")));
    const b = auszugSchluessel(vorsilbe, await sha256Hex(new TextEncoder().encode("neu")));
    expect(a.startsWith(vorsilbe)).toBe(true);
    expect(a).not.toBe(b);
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const zeilen = [
      { dokument_schluessel: a, erstellt_am: "2026-09-27T00:00:00Z" },
      { dokument_schluessel: b, erstellt_am: "2026-09-28T00:00:00Z" },
      { dokument_schluessel: "anders#x#sha256:1", erstellt_am: "2026-09-29T00:00:00Z" },
    ];
    expect(zeilenMitVorsilbe(zeilen, vorsilbe).map((z) => z.dokument_schluessel)).toEqual([b, a]);
  });

  it("ein Fehlversuch sperrt 24 Stunden, ältere kommen nach allen anderen", () => {
    const jetzt = Date.parse("2026-09-28T12:00:00Z");
    const frisch = jetzt - 60_000;
    const alt = jetzt - FEHLVERSUCH_SPERRE_MS - 1;
    const fehlversuche: Record<string, number | null> = { a: frisch, b: alt, c: null, d: null, e: null, f: null };
    const gewaehlt = neueAuswaehlen(["a", "b", "c", "d", "e", "f"], (k) => fehlversuche[k], jetzt, 4);
    expect(gewaehlt).toEqual(["c", "d", "e", "f"]);
    expect(neueAuswaehlen(["a", "b", "c"], (k) => fehlversuche[k], jetzt, 4)).toEqual(["c", "b"]);
    expect(fehlversuchVon({ auszug: { fehlversuch: "nicht ladbar", am: "2026-09-28T11:59:00Z" } })).toBe(frisch);
    expect(fehlversuchVon({ auszug: { text: "x" } })).toBeNull();
  });
});

