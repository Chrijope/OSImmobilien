import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));

const {
  reservierungAufheben, rvAufhebenPatch, rvHistorieEintrag, reservierungAufhebenRecht, reservierungBesteht, rvArchivPfad,
} = await import("./reservierungAufheben");
type Mittel = import("./reservierungAufheben").AufhebenMittel;

/**
 * „Reservierung aufheben“ und „Einheit wechseln“ (Christian, 05.10.2026).
 *
 * Eine unterschriebene Vereinbarung ist ein Beleg und wird nicht gelöscht,
 * sondern archiviert. Beide Knöpfe laufen durch denselben Ablauf.
 */

const PFAD = "reservierung/k-1/inv-1/Reservierungsvereinbarung_Max_Muster_05-10-2026.pdf";
const UNTERSCHRIEBEN = {
  rvSigned: true,
  rvSignedAt: "2026-10-01T10:00:00.000Z",
  rvPdf: "Reservierungsvereinbarung_Max_Muster_05-10-2026.pdf",
  rvPdfPath: PFAD,
  rvData: { vorname: "Max" },
  rvSignatures: { kaeufer1: "data:image/png;base64,AAA" },
  objektTitel: "Haus A",
  weNr: "1",
  objektId: "A",
  wohnungId: "a1",
  docFileUrls: { Reservierungsvertrag: PFAD, Personalausweis: "k-1/ausweis.pdf" },
  kundenordner: [{ id: "ko-1", kategorie: "Reservierungsvertrag", filename: "RV.pdf", fileUrl: PFAD, freigegeben: true }],
};
const JETZT = "2026-10-05T18:30:00.000Z";
const EINTRAG = { aufgehobenAm: JETZT, aufgehobenVon: "Vera Partner", aufgehobenVonId: "vp-1", anlass: "aufgehoben" as const };

describe("Der Verlaufseintrag", () => {
  it("merkt Datei, Unterschrift, Objekt, Person und Grund", () => {
    const archiv = rvArchivPfad("k-1", "inv-1", PFAD, JETZT);
    expect(archiv).toBe("reservierung/k-1/inv-1/aufgehoben/2026-10-05T18-30-00-000Z_Reservierungsvereinbarung_Max_Muster_05-10-2026.pdf");
    const e = rvHistorieEintrag(UNTERSCHRIEBEN, { ...EINTRAG, grund: " Kunde will andere Einheit ", archivPfad: archiv });
    expect(e).toMatchObject({
      stand: "unterschrieben", pdfPfad: archiv, pdfPfadUrspruenglich: PFAD, unterschriebenAm: "2026-10-01T10:00:00.000Z",
      objektTitel: "Haus A", weNr: "1", wohnungId: "a1", aufgehobenVon: "Vera Partner", aufgehobenVonId: "vp-1", grund: "Kunde will andere Einheit",
    });
    // Mit Datei braucht es die Unterschriftsbilder nicht doppelt.
    expect(e.rvSignatures).toBeUndefined();
  });

  it("ohne abgelegte Datei sind Formular und Unterschriften der einzige Beleg und bleiben", () => {
    const ohneDatei = { ...UNTERSCHRIEBEN, rvPdfPath: "", docFileUrls: {}, kundenordner: [] };
    const e = rvHistorieEintrag(ohneDatei, EINTRAG);
    expect(e.pdfPfad).toBeUndefined();
    expect(e.rvData).toEqual({ vorname: "Max" });
    expect(e.rvSignatures).toEqual({ kaeufer1: "data:image/png;base64,AAA" });
  });

  it("eine nur versendete Vereinbarung heißt versendet", () => {
    expect(rvHistorieEintrag({ rvSignaturePending: true, rvSignatureSentAt: JETZT }, EINTRAG).stand).toBe("versendet");
  });
});

describe("Der Schreibvorgang am Investment", () => {
  const archiv = rvArchivPfad("k-1", "inv-1", PFAD, JETZT);
  const patch = rvAufhebenPatch(UNTERSCHRIEBEN, rvHistorieEintrag(UNTERSCHRIEBEN, { ...EINTRAG, archivPfad: archiv }));

  it("leert die laufenden rv-Felder, die Historie wächst", () => {
    expect(patch).toMatchObject({ rvSigned: false, rvSignaturePending: false, rvPdf: "", rvData: null, rvSignatures: null, rvSignatureSentAt: "" });
    expect(patch.rvHistorie).toHaveLength(1);
    const weiter = rvAufhebenPatch({ ...UNTERSCHRIEBEN, rvHistorie: patch.rvHistorie }, rvHistorieEintrag(UNTERSCHRIEBEN, EINTRAG));
    expect(weiter.rvHistorie).toHaveLength(2);
  });

  it("legt das PDF im Kundenordner als aufgehoben ab, nicht mehr für den Kunden freigegeben", () => {
    const [doc] = patch.kundenordner as Array<Record<string, unknown>>;
    expect(doc).toMatchObject({ id: "ko-1", fileUrl: archiv, freigegeben: false, kategorie: "Reservierungsvertrag aufgehoben 2026-10-05 18:30" });
    expect(patch.kundenordnerCustomKat).toEqual(["Reservierungsvertrag aufgehoben 2026-10-05 18:30"]);
    // Die neue Vereinbarung soll nicht als schon vorhanden gelten.
    expect(patch.docFileUrls).toEqual({ Personalausweis: "k-1/ausweis.pdf" });
  });

  it("fehlt der Eintrag im Kundenordner, wird einer angelegt", () => {
    const ohneOrdner = rvAufhebenPatch({ ...UNTERSCHRIEBEN, kundenordner: [] }, rvHistorieEintrag(UNTERSCHRIEBEN, EINTRAG));
    expect(ohneOrdner.kundenordner).toEqual([expect.objectContaining({ fileUrl: PFAD, freigegeben: false })]);
  });

  /*
   * Der zuständige Partner darf geschützte Schlüssel nur leeren, und nur die
   * aus der Liste in `merge_investment_meta`. Alles, was hier geleert wird
   * und geschützt ist, muss dort stehen, sonst verwirft die Datenbank es und
   * die Erfolgsmeldung käme nie.
   */
  it("leert nur geschützte Schlüssel, die der Partner leeren darf", () => {
    const sql = readFileSync("supabase/migrations/20260930110000_absicherung_geld_vertraege.sql", "utf8");
    const geschuetzt = sql.slice(sql.indexOf("FUNCTION public.investment_geschuetzte_schluessel()"), sql.indexOf("COMMENT ON FUNCTION public.investment_geschuetzte_schluessel"))
      .match(/'([A-Za-z]+)'/g)!.map((k) => k.replace(/'/g, ""));
    const leerbar = sql.match(/_schluessel = ANY\(ARRAY\[([^\]]*)\]::text\[\]\)/)![1].match(/'([A-Za-z]+)'/g)!.map((k) => k.replace(/'/g, ""));
    for (const k of Object.keys(patch)) {
      if (geschuetzt.includes(k)) expect(leerbar).toContain(k);
    }
  });
});

describe("Wer den Knopf sieht", () => {
  const recht = (rolle: string, teile: Partial<Parameters<typeof reservierungAufhebenRecht>[0]> = {}) =>
    reservierungAufhebenRecht({ rolle, eigenerKunde: false, mitEinheit: true, mitHaus: false, ...teile });

  it.each(["admin", "inhaber", "vertriebsleiter"])("%s immer bei einer Einheit", (rolle) => {
    expect(recht(rolle).sichtbar).toBe(true);
  });

  it("der Partner nur beim eigenen oder vertretenen Kunden", () => {
    expect(recht("vertriebspartner").sichtbar).toBe(false);
    expect(recht("vertriebspartner", { eigenerKunde: true }).sichtbar).toBe(true);
  });

  it("das Backoffice ohne Einheit ja, mit Einheit ein Hinweis, weil die Datenbank ablehnt", () => {
    expect(recht("backoffice", { mitEinheit: false }).sichtbar).toBe(true);
    expect(recht("backoffice")).toEqual({ sichtbar: false, hinweis: expect.stringContaining("Einheit freigeben") });
  });

  it("das ganze Haus nur Admin und Inhaber, die anderen lesen einen Hinweis", () => {
    expect(recht("admin", { mitHaus: true }).sichtbar).toBe(true);
    expect(recht("vertriebspartner", { eigenerKunde: true, mitHaus: true })).toEqual({ sichtbar: false, hinweis: expect.stringContaining("Admin oder Inhaber") });
  });

  it.each(["finanzierungspartner", "setterin", "buchhaltung"])("%s nie", (rolle) => {
    expect(recht(rolle, { eigenerKunde: true })).toEqual({ sichtbar: false });
  });

  it("nur, wenn eine Reservierung besteht", () => {
    expect(reservierungBesteht({})).toBe(false);
    expect(reservierungBesteht({ rvSignaturePending: true })).toBe(true);
    expect(reservierungBesteht({ rvSigned: true })).toBe(true);
    expect(reservierungBesteht({ einheitReserviert: true })).toBe(true);
  });
});

describe("Der Ablauf", () => {
  function mittel(teile: Partial<Mittel> = {}) {
    const schritte: string[] = [];
    const m: Mittel = {
      metaLesen: () => ({ ...UNTERSCHRIEBEN }),
      einheitFreigeben: async () => { schritte.push("einheit"); return { ok: true }; },
      hausFreigeben: async () => { schritte.push("haus"); return { ok: true }; },
      pdfKopieren: async () => { schritte.push("kopie"); return true; },
      metaSchreiben: async () => { schritte.push("meta"); },
      offeneLinksLoeschen: async () => { schritte.push("links"); return 1; },
      objektInVerlauf: () => { schritte.push("verlauf"); return { rvVirtualWohnung: {} }; },
      zuruecksetzen: async () => { schritte.push("stufe"); return true; },
      ...teile,
    };
    return { m, schritte };
  }
  const EINGABE = {
    investmentId: "inv-1", kontaktId: "k-1", objektId: "A", wohnungId: "a1", anlass: "aufgehoben" as const,
    vonName: "Vera Partner", vonId: "vp-1", darfOffeneLinksLoeschen: true,
  };

  it("Einheit, Archiv, ein Schreibvorgang am Investment, Links, Kontakt, in dieser Reihenfolge", async () => {
    const { m, schritte } = mittel();
    expect(await reservierungAufheben(EINGABE, m)).toEqual({ ok: true, linksUngueltig: true, pdfArchiviert: true });
    expect(schritte).toEqual(["einheit", "kopie", "verlauf", "meta", "links", "stufe"]);
  });

  it("Vereinbarung, Objekt und Hinweis gehen im selben Schreibvorgang hinaus (06.10.2026)", async () => {
    // Getrennt geschrieben zeigte die Objektauswahl dazwischen kurz das alte Objekt.
    const patches: Record<string, unknown>[] = [];
    const { m } = mittel({ metaSchreiben: async (_id, p) => { patches.push(p); } });
    await reservierungAufheben(EINGABE, m);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ rvSigned: false, rvVirtualWohnung: {}, einheitGewechseltVon: "Vera Partner" });
    expect(patches[0].rvHistorie).toEqual([expect.objectContaining({ stand: "unterschrieben" })]);
  });

  it("lehnt die Datenbank die Einheit ab, bleibt alles stehen", async () => {
    const { m, schritte } = mittel({ einheitFreigeben: async () => ({ ok: false, fehlerText: "Nicht dein Kunde." }) });
    expect(await reservierungAufheben(EINGABE, m)).toEqual({ ok: false, schritt: "einheit", text: "Nicht dein Kunde." });
    expect(schritte).toEqual([]);
  });

  it("ohne bestätigte Archivierung keine Erfolgsmeldung und kein Zurücksetzen", async () => {
    const { m, schritte } = mittel({ metaSchreiben: async () => { throw new Error("abgelehnt"); } });
    const ergebnis = await reservierungAufheben(EINGABE, m);
    expect(ergebnis).toMatchObject({ ok: false, schritt: "vereinbarung" });
    // Das Abräumen des Objekts steht im selben, gescheiterten Schreibvorgang.
    expect(schritte).not.toContain("stufe");
    expect(schritte).not.toContain("links");
  });

  it("Listen wie der Kundenordner kommen aus dem Stand nach der Kopie, nicht davor", async () => {
    let lesen = 0;
    let patch: Record<string, unknown> = {};
    const spaeter = { ...UNTERSCHRIEBEN, kundenordner: [...UNTERSCHRIEBEN.kundenordner, { id: "ko-2", kategorie: "Personalausweis", fileUrl: "k-1/neu.pdf" }] };
    const { m } = mittel({
      metaLesen: () => (++lesen === 1 ? { ...UNTERSCHRIEBEN } : spaeter),
      metaSchreiben: async (_id, p) => { patch = p; },
    });
    await reservierungAufheben(EINGABE, m);
    expect((patch.kundenordner as Array<{ id: string }>).map((d) => d.id)).toEqual(["ko-1", "ko-2"]);
  });

  it("scheitert die Archivkopie, bleibt der ursprüngliche Ort der Verweis", async () => {
    let patch: Record<string, unknown> = {};
    const { m } = mittel({ pdfKopieren: async () => false, metaSchreiben: async (_id, p) => { patch = p; } });
    expect(await reservierungAufheben(EINGABE, m)).toMatchObject({ ok: true, pdfArchiviert: null });
    expect((patch.rvHistorie as Array<{ pdfPfad: string }>)[0].pdfPfad).toBe(PFAD);
  });

  it("ein Haus wird über das Haus freigegeben, ohne Einheit und ohne Haus gar nichts", async () => {
    const haus = mittel();
    await reservierungAufheben({ ...EINGABE, wohnungId: undefined, hausFreigeben: true }, haus.m);
    expect(haus.schritte[0]).toBe("haus");
    const vonHand = mittel();
    await reservierungAufheben({ ...EINGABE, wohnungId: undefined }, vonHand.m);
    expect(vonHand.schritte).not.toContain("einheit");
    expect(vonHand.schritte).not.toContain("haus");
  });

  it("offene Links löschen nur, wer darf; sonst sagt das Ergebnis es", async () => {
    const { m, schritte } = mittel();
    expect(await reservierungAufheben({ ...EINGABE, darfOffeneLinksLoeschen: false }, m)).toMatchObject({ ok: true, linksUngueltig: null });
    expect(schritte).not.toContain("links");
  });
});

/** Beide Knöpfe im Kundenprofil laufen durch denselben Ablauf. */
describe("Das Kundenprofil", () => {
  const seite = readFileSync("src/pages/KundenDetail.tsx", "utf8");
  it("Einheit wechseln und Reservierung aufheben rufen denselben Ablauf", () => {
    expect(seite).toContain('reservierungAufhebenAusfuehren(invId, { objektId, wohnungId }, "einheit_gewechselt")');
    expect(seite).toContain('await reservierungAufhebenAusfuehren(invId, ziel, "aufgehoben")');
    expect(seite.match(/await reservierungAufheben\(/g)).toHaveLength(1);
    expect(seite).not.toContain("unwiderruflich gelöscht");
  });
  it("fragt im Projektstil, mit sprechenden Knöpfen", () => {
    expect(seite).toContain('confirmText: "Reservierung aufheben",\n      cancelText: "Bestehen lassen",');
  });
});
