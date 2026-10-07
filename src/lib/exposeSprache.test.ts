import { describe, it, expect, vi } from "vitest";

/**
 * Plan Kundensprache, Etappe 5 (D10, Entscheidung 12): das Exposé je Einheit
 * auf Englisch und die englische Fassung der Objekttexte.
 *
 * Geprüft wird, dass beide Textsammlungen deckungsgleich sind, dass das PDF
 * auf Englisch englische Überschriften trägt und auf Deutsch unverändert
 * bleibt, und dass `meta.objekttexteKiEn` genau dann genutzt wird, wenn die
 * Übersetzung zum angezeigten deutschen Wortlaut passt. Sonst steht der
 * deutsche Text mit „Description available in German only“ da.
 *
 * Seit 01.10.2026 prüft das die Druck-Aufbereitung des Exposé-PDFs
 * (`exposeDruck/daten.ts`): Was dort steht, druckt das Design H3.
 */
vi.stubGlobal("fetch", () => Promise.reject(new Error("kein Netz im Test")));

import { annahmenVorbelegen, baueExposeInhalt } from "@/lib/exposeInhalt";
import { NUR_DEUTSCH_HINWEIS } from "@/lib/seitenSprache";
import { EXPOSE_PDF_TEXTE_DE, EXPOSE_PDF_TEXTE_EN, rechnerHinweisEnglisch } from "@/lib/exposePdfTexte";
import { berechneExpose } from "@/lib/exposeRechner";
import { baueDruckDaten, type DruckDaten } from "@/lib/exposeDruck/daten";
import { MUSTER_OBJEKT, MUSTER_STANDORT, MUSTER_WE7 } from "@/test/musterobjektWe7";
import {
  baueObjektTexte,
  objektTexteInMeta,
  pruefeObjektTexte,
  texteInGepflegteFelder,
} from "../../supabase/functions/_shared/objekt-texte";
import {
  baueObjektTexteEn,
  objektTexteEnAusMeta,
  objektTexteEnOhneGepflegte,
  objektTexteEnInMeta,
  pruefeUebersetzung,
  quelleAusStand,
  uebersetzungFehlt,
  uebersetzungsQuelle,
} from "../../supabase/functions/_shared/objekt-texte-en.ts";
import { uebersetzeObjektTexte } from "../../supabase/functions/objekt-texte-ki/lauf";

const heute = new Date(2026, 8, 2);
const GEDANKENSTRICH = /[–—]/;
const ohneSchmalLeer = (t: string) => t.replace(/[    ⁠]/g, " ");
let gedruckt: DruckDaten | null = null;
const alleTexte = () => ohneSchmalLeer(JSON.stringify(gedruckt));

/** Alle Blätter eines Textobjekts mit Pfad; Funktionen mit Beispielwerten. */
function blaetter(wert: unknown, pfad = ""): Array<[string, string]> {
  if (typeof wert === "string") return [[pfad, wert]];
  if (typeof wert === "function") {
    const probe = { grest: "5 %", notar: "2 %", makler: null, quelle: "land", rate: "1 €", zins: "3 %", tilgung: "2 %" };
    return [[pfad, String((wert as (...a: unknown[]) => string)(wert.length === 1 && pfad.endsWith("nebenkostenNotiz") ? probe : 7, 8, true))]];
  }
  if (Array.isArray(wert)) return wert.flatMap((w, i) => blaetter(w, `${pfad}[${i}]`));
  if (wert && typeof wert === "object") return Object.entries(wert).flatMap(([k, v]) => blaetter(v, pfad ? `${pfad}.${k}` : k));
  return [];
}

const VORSCHLAG = baueObjektTexte({
  geprueft: pruefeObjektTexte({
    kurzbeschreibung: "Ein saniertes Haus von 1962 mit neuem Dach.",
    standortargumente: [
      { argument: "Kurze Wege. Supermarkt in 280 m.", beleg: "Einkaufen in der Nähe: Supermarkt Nord" },
      { argument: "Anbindung. Straßenbahn in 150 m.", beleg: "ÖPNV in der Nähe: Haltestelle Musterweg" },
      { argument: "Grün. Park in 300 m.", beleg: "x" },
      { argument: "Bildung. Grundschule in 400 m.", beleg: "x" },
      { argument: "Arbeit. Klinikum in 1,8 km.", beleg: "x" },
    ],
  }),
  quellen: { objekt: ["Titel: X"], standort: [], unterlagen: [] },
  modell: "google/gemini-2.5-flash",
});
const UEBERSETZUNG = {
  kurzbeschreibung: "A refurbished building from 1962 with a new roof.",
  standortargumente: [
    "Short distances. Supermarket 280 m away.",
    "Connections. Tram stop 150 m away.",
    "Green. Park 300 m away.",
    "Education. Primary school 400 m away.",
    "Work. Hospital 1.8 km away.",
  ],
  marktargumente: [],
};

/** Die Übersetzung so, wie das Modell sie zu dieser Quelle liefert: leere Blöcke bleiben leer. */
function gefilterteUebersetzung(quelle: ReturnType<typeof uebersetzungsQuelle>) {
  return {
    kurzbeschreibung: quelle.kurzbeschreibung ? UEBERSETZUNG.kurzbeschreibung : "",
    standortargumente: quelle.standortargumente.length ? UEBERSETZUNG.standortargumente : [],
    marktargumente: [],
  };
}

/** Das Musterobjekt nach einem Lauf, wie ihn `objekt-texte-ki` ablegt. */
function objektNachLauf(extra: Record<string, unknown> = {}, mitEnglisch = true) {
  const basis = { ...(MUSTER_OBJEKT.meta || {}) } as Record<string, unknown>;
  delete basis.kurzbeschreibung;
  delete basis.standortargumente;
  delete basis.marktargumente;
  let meta = objektTexteInMeta(texteInGepflegteFelder({ ...basis, ...extra }, VORSCHLAG), VORSCHLAG);
  if (mitEnglisch) meta = objektTexteEnInMeta(meta, baueObjektTexteEn(uebersetzungsQuelle(meta, VORSCHLAG), gefilterteUebersetzung(uebersetzungsQuelle(meta, VORSCHLAG)), "test"));
  return { ...MUSTER_OBJEKT, meta };
}

function pdfBauen(objekt: typeof MUSTER_OBJEKT, sprache: "de" | "en") {
  const inhalt = baueExposeInhalt({ objekt, wohnung: MUSTER_WE7, standort: MUSTER_STANDORT, heute, kundeName: "Anna Muster", sprache });
  const vb = annahmenVorbelegen(objekt, MUSTER_WE7, null, heute);
  const ergebnis = berechneExpose(inhalt.wirtschaftlichkeit.objektdaten, vb.annahmen);
  gedruckt = baueDruckDaten(inhalt, vb.annahmen, ergebnis, { fotos: [], plaene: [] }, { erstelltAm: heute, sprache });
  return { inhalt, pdf: Promise.resolve(gedruckt) };
}

describe("Textsammlungen des Exposés", () => {
  it("haben auf Deutsch und Englisch dieselben Schlüssel", () => {
    expect(blaetter(EXPOSE_PDF_TEXTE_EN).map(([p]) => p)).toEqual(blaetter(EXPOSE_PDF_TEXTE_DE).map(([p]) => p));
  });

  it("sind auf Englisch vollständig und ohne Gedankenstriche", () => {
    for (const [pfad, text] of blaetter(EXPOSE_PDF_TEXTE_EN)) {
      if (pfad.endsWith(".frist") && text === "") continue; // die letzte Station hat bewusst keine Angabe
      expect(text.trim(), pfad).not.toBe("");
      expect(GEDANKENSTRICH.test(text), pfad).toBe(false);
    }
  });

  it("übersetzt die bekannten Hinweise des Rechners", () => {
    expect(rechnerHinweisEnglisch("Gebäudeanteil nicht am Objekt gepflegt, 80 % angenommen.")).toBe("Building share not stated for the property, 80% assumed.");
    // Ein unbekannter Satz bleibt stehen, statt zu verschwinden.
    expect(rechnerHinweisEnglisch("Etwas Neues.")).toBe("Etwas Neues.");
  });
});

describe("Exposé-PDF auf Englisch", () => {
  it("trägt englische Überschriften und ein englisches Deckblatt", async () => {
    const { pdf } = pdfBauen(objektNachLauf(), "en");
    await pdf;
    const text = alleTexte();
    for (const ueberschrift of ["Next steps", "Opportunities and risks", "Important notes", "Your contact", "Assumptions", "Purchase price and financing"]) {
      expect(text, ueberschrift).toContain(ueberschrift);
    }
    for (const deutsch of ["Wirtschaftlichkeit", "Nächste Schritte", "Wichtige Hinweise", "Kaufpreis und Finanzierung", "Preisstand"]) {
      expect(text, deutsch).not.toContain(deutsch);
    }
    expect(gedruckt?.sprache).toBe("en");
    expect(gedruckt?.meta.deckblattFuss).toContain("Prices as of");
    // Beträge britisch mit dem Eurozeichen vorn.
    expect(text).toMatch(/€\d{1,3}(,\d{3})+/);
  });

  it("bleibt auf Deutsch wie bisher", async () => {
    const { pdf } = pdfBauen(objektNachLauf(), "de");
    await pdf;
    const text = alleTexte();
    expect(text).toContain("Wirtschaftlichkeit");
    expect(text).toContain("Ein saniertes Haus von 1962 mit neuem Dach.");
    expect(text).not.toContain("Financials");
    expect(text).not.toContain(NUR_DEUTSCH_HINWEIS);
    expect(gedruckt?.sprache).toBe("de");
  });

  it("nimmt die englischen Objekttexte aus objekttexteKiEn", async () => {
    const { inhalt, pdf } = pdfBauen(objektNachLauf(), "en");
    await pdf;
    expect(inhalt.beschreibung).toBe(UEBERSETZUNG.kurzbeschreibung);
    expect(inhalt.standort.argumente[0]).toEqual({ titel: "Short distances", text: "Supermarket 280 m away." });
    expect(inhalt.nurDeutsch).toEqual({ beschreibung: false, standortargumente: false, marktargumente: false });
    const text = alleTexte();
    expect(text).toContain(UEBERSETZUNG.kurzbeschreibung);
    expect(text).not.toContain(NUR_DEUTSCH_HINWEIS);
  });

  it("lässt von Hand Geschriebenes deutsch und sagt es dazu", async () => {
    const { inhalt, pdf } = pdfBauen(objektNachLauf({ kurzbeschreibung: "Von Hand geschrieben." }), "en");
    await pdf;
    expect(inhalt.beschreibung).toBe("Von Hand geschrieben.");
    expect(inhalt.nurDeutsch.beschreibung).toBe(true);
    // Die Argumente sind weiter automatisch und damit englisch.
    expect(inhalt.nurDeutsch.standortargumente).toBe(false);
    expect(alleTexte()).toContain(NUR_DEUTSCH_HINWEIS);
  });

  it("zeigt ohne passende Übersetzung den deutschen Text mit Hinweis", async () => {
    const { inhalt, pdf } = pdfBauen(objektNachLauf({}, false), "en");
    await pdf;
    expect(inhalt.beschreibung).toBe("Ein saniertes Haus von 1962 mit neuem Dach.");
    expect(inhalt.nurDeutsch).toEqual({ beschreibung: true, standortargumente: true, marktargumente: false });
  });
});

describe("Englische Fassung der Objekttexte", () => {
  it("merkt sich den deutschen Wortlaut und erkennt, wann nachgeholt werden muss", () => {
    const meta = objektNachLauf().meta;
    expect(uebersetzungFehlt(meta, uebersetzungsQuelle(meta, VORSCHLAG))).toBe(false);
    const andere = { ...quelleAusStand(VORSCHLAG), kurzbeschreibung: "Neuer Text." };
    expect(uebersetzungFehlt(meta, andere)).toBe(true);
    expect(uebersetzungFehlt(objektNachLauf({}, false).meta, quelleAusStand(VORSCHLAG))).toBe(true);
  });

  it("übersetzt keinen von Hand gepflegten Block", () => {
    const meta = objektNachLauf({ kurzbeschreibung: "Von Hand geschrieben." }).meta;
    const quelle = uebersetzungsQuelle(meta, VORSCHLAG);
    expect(quelle.kurzbeschreibung).toBe("");
    expect(quelle.standortargumente).toHaveLength(5);
    expect(objektTexteEnAusMeta(meta)?.kurzbeschreibung).toBe("");
  });

  it("entfernt die englische Fassung eines Blocks, der später von Hand überschrieben wird", () => {
    const meta = { ...objektNachLauf().meta, standortargumente: ["Von Hand. Eigener Satz."] };
    const bereinigt = objektTexteEnAusMeta(objektTexteEnOhneGepflegte(meta));
    expect(bereinigt?.standortargumente).toEqual([]);
    expect(bereinigt?.kurzbeschreibung).toBe(UEBERSETZUNG.kurzbeschreibung);
    // Alles von Hand: Die Fassung fällt ganz weg.
    const alles = objektTexteEnOhneGepflegte({ ...meta, kurzbeschreibung: "Getippt." });
    expect(objektTexteEnAusMeta(alles)).toBeUndefined();
  });

  it("verwirft eine Übersetzung mit falscher Anzahl und entfernt Gedankenstriche", () => {
    const quelle = quelleAusStand(VORSCHLAG);
    expect(pruefeUebersetzung({ ...UEBERSETZUNG, standortargumente: UEBERSETZUNG.standortargumente.slice(1) }, quelle).ok).toBe(false);
    const geprueft = pruefeUebersetzung({ ...UEBERSETZUNG, kurzbeschreibung: "A building – refurbished." }, quelle);
    expect(geprueft.ok).toBe(true);
    expect(geprueft.texte?.kurzbeschreibung).toBe("A building, refurbished.");
  });

  it("fragt das Modell über das Werkzeug und liefert die geprüfte Fassung", async () => {
    const anfragen: string[] = [];
    const abruf = (async (_adresse: string, init: { body: string }) => {
      anfragen.push(init.body);
      return new Response(JSON.stringify({
        choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify(UEBERSETZUNG) } }] } }],
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const en = await uebersetzeObjektTexte("schluessel", quelleAusStand(VORSCHLAG), 5000, abruf, heute);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]).toContain("objekt_texte_englisch");
    expect(anfragen[0]).toContain("Ein saniertes Haus von 1962 mit neuem Dach.");
    expect(en?.kurzbeschreibung).toBe(UEBERSETZUNG.kurzbeschreibung);
    expect(en?.quelle.kurzbeschreibung).toBe("Ein saniertes Haus von 1962 mit neuem Dach.");
  });

  it("gibt bei einem Fehler des Gateways keine Fassung zurück", async () => {
    const abruf = (async () => new Response("kaputt", { status: 500 })) as unknown as typeof fetch;
    expect(await uebersetzeObjektTexte("schluessel", quelleAusStand(VORSCHLAG), 5000, abruf)).toBeUndefined();
  });
});
