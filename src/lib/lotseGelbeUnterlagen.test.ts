/**
 * OS Lotse, Stufe 2: gelbe Unterlagen (05.10.2026, rechtliche Vorgaben B bis F).
 *
 * Bewiesen wird:
 *   - die Kundenampel bleibt für jede gelbe Unterlage, wie sie war,
 *   - was schon der Titel ausschließt, geht nie an ein Modell,
 *   - gelesen wird nur, was die Inhaltseinordnung bestätigt,
 *   - die Schemas kennen keinen Freitext und keine Namen, die Prüfung wirft
 *     alles Übrige weg, ohne Datum wird nichts gespeichert,
 *   - Provisions- und Vertriebsunterlagen bleiben gesperrt,
 *   - die Pflichthinweise stehen im Prompt.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { darfZumKunden, dokumentAmpel } from "../../supabase/functions/_shared/dokument-freigabe";
import {
  AUSZUG_SCHEMA_FASSUNG,
  auszugFuerPrompt,
  faktenauszugErzeugen,
  faktenauszugWerkzeug,
  GELBE_ARTEN,
  gespeicherteEinordnung,
  LOTSE_OFFEN_ART,
  lotseAnsichtAusZeile,
  lotseLeseweg,
  lotseNieLesen,
  lotseUnterlageEinordnen,
  NICHT_EINGEORDNET,
  NICHT_FREIGEGEBEN,
  OHNE_DATUM,
  pruefeFaktenauszug,
  vorabGesperrt,
} from "../../supabase/functions/_shared/lotse-faktenauszug";
import { auszugAnsicht, auszuegeZuordnen, einschraenkungGesichert, fehlendeAuszuege, type LotseKandidat } from "../../supabase/functions/_shared/lotse-unterlagen";
import { baueLotsePrompt, gelbePflicht } from "../../supabase/functions/_shared/lotse-regeln";
import { dokumentOberbegriff } from "../../supabase/functions/_shared/dokument-freigabe";

/** Ein Gateway, das genau diese Werkzeugargumente meldet. */
const gateway = (argumente: unknown, ok = true) =>
  (async () => new Response(
    JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify(argumente) } }] } }] }),
    { status: ok ? 200 : 500 },
  )) as unknown as typeof fetch;
const PDF = "data:application/pdf;base64,JVBERi0=";

describe("Kundenampel bleibt unverändert", () => {
  // Kein Titel wird durch Stufe 2 grün. Die Liste sind die Beispiele aus dem Bestand.
  const gelb = [
    "Reinschrift TE UVZ-Nr. 1234/2019", "TE", "UVZ 88/2020", "AB Haus 7", "One-Pager Erhaltungsaufwand", "Bauplan", "Stellplatzplan",
    "Genehmigter Plan", "Wirtschaftsplan 2025", "Hausgeldplan 2025", "Einzelwirtschaftsplan WE 4", "Protokoll ETV 2024",
    "Beschlusssammlung", "Jahresabrechnung 2023", "Musterkaufvertrag", "Notardatenblatt", "Verwaltervertrag", "Baulastenauskunft",
  ];
  it.each(gelb)("%s bleibt gelb und geht nicht von selbst zum Kunden", (name) => {
    expect(dokumentAmpel({ name })).toBe("gelb");
    expect(darfZumKunden({ name })).toBe(false);
  });
  it("was schon grün war, bleibt grün", () => {
    for (const name of ["Teilungserklärung", "Aufteilungsplan", "Abgeschlossenheitsbescheinigung", "Grundriss WE 3", "Baubeschreibung"]) {
      expect(dokumentAmpel({ name })).toBe("gruen");
    }
  });
});

describe("Erkennung am Titel (Vorgabe E)", () => {
  const nie = (name: string) => lotseNieLesen(name, dokumentOberbegriff({ name }));
  it.each([
    "Notardatenblatt WE 5", "Datenblatt für den Notar", "Vollmacht Käufer", "Personalausweis", "Eigentümerliste 2024", "Hausgeldkonto WE 3",
    "Saldenliste 31.12.2023", "Mahnung Hausgeld", "Klageschrift", "Urteil Amtsgericht", "Schriftverkehr Verwaltung", "Selbstauskunft",
    "Finanzierungsbestätigung", "Darlehensvertrag", "Kontoauszug", "Baulastenauskunft", "Altlastenauskunft", "Grundsteuerbescheid",
  ])("%s wird nie gelesen", (name) => expect(nie(name)).toBe(true));
  it.each([
    "Reinschrift TE UVZ-Nr. 1234/2019", "AB Haus 7", "One-Pager Erhaltungsaufwand", "Wirtschaftsplan 2025", "Protokoll ETV 2024",
    "Beschlusssammlung", "Jahresabrechnung 2023", "Musterkaufvertrag", "Verwaltervertrag SEV", "Energieausweis", "Bauplan",
  ])("%s geht in die Inhaltseinordnung", (name) => expect(nie(name)).toBe(false));

  it("gilt vor jeder Ampel, auch für rote und grüne Titel (Codex-Befund 1)", () => {
    expect(dokumentAmpel({ name: "Mahnung Mietrückstand.pdf" })).toBe("rot");
    expect(dokumentAmpel({ name: "Eigentümerliste Energieausweis.pdf" })).toBe("gruen");
    for (const name of ["Mahnung Mietrückstand.pdf", "Finanzierung Mietwohnung.pdf", "Eigentümerliste Energieausweis.pdf"]) expect(nie(name)).toBe(true);
    // Ein Finanzierungsbeispiel im Exposé bleibt lesbar.
    expect(nie("Exposé mit Finanzierungsbeispiel.pdf")).toBe(false);
    const code = readFileSync("supabase/functions/objekt-lotse/index.ts", "utf8");
    const sperre = code.indexOf("if (!eigenprovision && lotseNieLesen(name, gruppe)) { merke(gruppe); continue; }");
    expect(sperre).toBeGreaterThan(0);
    expect(sperre).toBeLessThan(code.indexOf('if (ampel === "rot") {'));
  });
});

describe("Inhaltseinordnung des Lotsen", () => {
  it("meldet genau einen Auswahlwert", async () => {
    expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art: "teilungserklaerung" }))).toEqual({ ergebnis: "gelb", art: "teilungserklaerung" });
    expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art: "energieausweis" }))).toEqual({ ergebnis: "gruen", art: "energieausweis" });
    expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art: "wirtschaftsplan" }))).toEqual({ ergebnis: "gelb", art: "wirtschaftsplan" });
    expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art: "mietvertrag" }))).toEqual({ ergebnis: "rot", art: "mietvertrag" });
    expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art: "sonstiges" }))).toEqual({ ergebnis: "sonstiges" });
    for (const art of ["ausgeschlossen", "behoerdliche_auskunft"]) {
      expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art }))).toEqual({ ergebnis: "ausgeschlossen" });
    }
    for (const art of ["unklar", "erfunden"]) expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art }))).toEqual({ ergebnis: "unklar" });
  });

  it("für Kunden gelbe Unterlagen bekommen nie einen Sachauszug (Codex-Befund 2)", () => {
    expect(lotseLeseweg({ ergebnis: "gelb", art: "teilungserklaerung" }, true)).toEqual({ weg: "fakten", art: "teilungserklaerung" });
    expect(lotseLeseweg({ ergebnis: "gelb", art: "wirtschaftsplan" }, true)).toEqual({ weg: "fakten", art: "wirtschaftsplan" });
    for (const e of [{ ergebnis: "gruen", art: "expose_beschreibung" }, { ergebnis: "sonstiges" }, { ergebnis: "ausgeschlossen" }] as const) {
      expect(lotseLeseweg(e, true)).toEqual({ weg: "ungelesen", grund: NICHT_FREIGEGEBEN });
    }
    expect(lotseLeseweg({ ergebnis: "unklar" }, true)).toEqual({ weg: "ungelesen", grund: NICHT_EINGEORDNET });
    expect(lotseLeseweg({ ergebnis: "fehler" }, true)).toEqual({ weg: "fehlversuch" });
  });

  it("für Kunden grüne Unterlagen behalten den Sachauszug, Ausgeschlossenes bleibt ungelesen", () => {
    for (const e of [{ ergebnis: "gruen", art: "energieausweis" }, { ergebnis: "sonstiges" }, { ergebnis: "gelb", art: "teilungserklaerung" }] as const) {
      expect(lotseLeseweg(e, false)).toEqual({ weg: "sachauszug" });
    }
    expect(lotseLeseweg({ ergebnis: "gelb", art: "protokoll" }, false)).toEqual({ weg: "fakten", art: "protokoll" });
    expect(lotseLeseweg({ ergebnis: "ausgeschlossen" }, false)).toEqual({ weg: "ungelesen", grund: NICHT_FREIGEGEBEN });
    expect(lotseLeseweg({ ergebnis: "unklar" }, false)).toEqual({ weg: "fehlversuch" });
    expect(lotseLeseweg({ ergebnis: "rot", art: "grundbuch" }, false)).toEqual({ weg: "fakten", art: "grundbuch" });
  });
  it("ohne Antwort ein Fehlversuch, nie frei", async () => {
    expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({}, false))).toEqual({ ergebnis: "fehler" });
  });
  it("Provisions- und Vertriebsunterlagen bleiben gesperrt", async () => {
    expect(await lotseUnterlageEinordnen("k", { pdf: PDF }, gateway({ art: "vertriebsvereinbarung" }))).toEqual({ ergebnis: "gesperrt" });
    let gefragt = false;
    const nieGefragt = (async () => { gefragt = true; return new Response("{}"); }) as unknown as typeof fetch;
    for (const name of ["Provisionsvereinbarung", "Courtagevereinbarung Bauträger", "Vertriebsvertrag", "Tippgeber Liste"]) {
      expect(vorabGesperrt({ name })).toBe(true);
      expect(await lotseUnterlageEinordnen("k", { name, pdf: PDF }, nieGefragt)).toEqual({ ergebnis: "gesperrt" });
    }
    expect(gefragt).toBe(false);
  });
});

describe("Schemas ohne Freitext (Vorgaben B, C, D)", () => {
  const ERLAUBTE_TEXTE = /JJJJ-MM-TT|Nummer der Wohnung/;
  /** Jede Zeichenkette ohne feste Auswahl muss Datum oder Wohnungsnummer sein. */
  function freieTexte(schema: Record<string, unknown>, pfad = ""): string[] {
    const funde: string[] = [];
    for (const [schluessel, wert] of Object.entries(schema)) {
      const f = wert as Record<string, unknown>;
      if (f.type === "string" && !f.enum && !ERLAUBTE_TEXTE.test(String(f.description))) funde.push(`${pfad}${schluessel}`);
      if (f.type === "array") {
        const items = f.items as Record<string, unknown>;
        if (items.type === "object") funde.push(...freieTexte(items.properties as Record<string, unknown>, `${pfad}${schluessel}.`));
        else if (items.type === "string" && !items.enum) funde.push(`${pfad}${schluessel}[]`);
      }
    }
    return funde;
  }
  it.each(GELBE_ARTEN)("%s: kein freies Textfeld, kein Feld für Personen", (art) => {
    const werkzeug = faktenauszugWerkzeug(art) as { function: { parameters: { properties: Record<string, unknown>; additionalProperties: boolean } } };
    expect(werkzeug.function.parameters.additionalProperties).toBe(false);
    expect(freieTexte(werkzeug.function.parameters.properties)).toEqual([]);
    expect(JSON.stringify(werkzeug.function.parameters)).not.toMatch(/"(name|eigentuemer|mieter|beirat|notar_?name|iban|konto|anschrift|kaufpreis|provision|stimmen|unterschrift)\w*":/i);
  });

  it("Wirtschaftsplan: Namen, Freitext und unbekannte Schlüssel fliegen raus", () => {
    const geprueft = pruefeFaktenauszug("wirtschaftsplan", {
      zeitraum_von: "2025-01-01", zeitraum_bis: "2025-12-31", gesamtkosten: 84000,
      verwalter: "Hausverwaltung Beispiel GmbH", bemerkung: "Herr Beispiel zahlt nicht",
      kostenposten: [{ posten: "hausmeister", betrag: 6000 }, { posten: "Hausmeister Beispiel", betrag: 1 }, { posten: "muell" }],
      ruecklage_zufuehrung_jahr: 12000,
      hausgeld_soll_monat: [{ we_nr: "3", betrag: 310.5 }, { we_nr: "Herr Beispiel", betrag: 300 }, { we_nr: "4", betrag: 1e9 }],
    });
    expect(geprueft).toEqual({
      zeitraum_von: "2025-01-01", zeitraum_bis: "2025-12-31", gesamtkosten: 84000,
      kostenposten: [{ posten: "hausmeister", betrag: 6000 }], ruecklage_zufuehrung_jahr: 12000,
      hausgeld_soll_monat: [{ we_nr: "3", betrag: 310.5 }],
    });
  });

  it("Beschlüsse: kein Abstimmungsverhalten, kein Freitextthema", () => {
    const geprueft = pruefeFaktenauszug("protokoll", {
      erfasst_von: "2022-05-01", erfasst_bis: "2024-05-01",
      beschluesse: [
        { datum: "2024-05-01", thema: "dach", ergebnis: "angenommen", betrag: 120000, finanzierung: "sonderumlage", angefochten: "nein", ja_stimmen: 12, eigentuemer: "Frau Beispiel" },
        { datum: "2024-05-01", thema: "Streit mit Herrn Beispiel", ergebnis: "abgelehnt" },
        { thema: "fassade", ergebnis: "durchgefallen", finanzierung: "privat" },
      ],
    });
    expect(geprueft.beschluesse).toEqual([
      { datum: "2024-05-01", thema: "dach", ergebnis: "angenommen", betrag: 120000, finanzierung: "sonderumlage", angefochten: "nein" },
      { thema: "fassade" },
    ]);
  });

  it("Abrechnung, Verwaltervertrag und Musterkaufvertrag nur mit erlaubten Feldern", () => {
    expect(pruefeFaktenauszug("abrechnung", {
      zeitraum_von: "2023-01-01", ergebnis_gesamt_weg: -2500, hausgeldrueckstaende_gesamt: 4100,
      rueckstand_we_3: 900, einzelabrechnung: { we_nr: "3", nachzahlung: 120 },
    })).toEqual({ zeitraum_von: "2023-01-01", ergebnis_gesamt_weg: -2500, hausgeldrueckstaende_gesamt: 4100 });
    expect(pruefeFaktenauszug("verwaltervertrag", {
      art: "sev", beginn: "2024-01-01", verwalter_verguetung_je_einheit_monat: 29.75, verwalter_name: "Beispiel Verwaltung",
      verwalter_sonderleistungen: [{ leistung: "mahnwesen", betrag: 25 }, { leistung: "Sonderwunsch", betrag: 1 }],
    })).toEqual({ art: "sev", beginn: "2024-01-01", verwalter_verguetung_je_einheit_monat: 29.75, verwalter_sonderleistungen: [{ leistung: "mahnwesen", betrag: 25 }] });
    expect(pruefeFaktenauszug("teilungserklaerung", {
      stand: "2019-04-02", anzahl_einheiten: 24, urkundennummer: "UVZ 1234/2019", eigentuemer: "Beispiel Bau GmbH",
      miteigentumsanteile: [{ we_nr: "3", anteil: 41.2, nenner: 1000 }, { we_nr: "Herr Beispiel", anteil: 40 }],
      sondernutzungsrechte: [{ art: "stellplatz", we_nr: "3" }, { art: "Garten von Frau Beispiel" }],
      kostenverteilung_schluessel: "miteigentumsanteile", zweckbestimmung: "wohnen", gewerbe_erlaubt: false, vermietung_beschraenkt: true,
      bemerkung: "Ferienwohnungen verboten",
    })).toEqual({
      stand: "2019-04-02", anzahl_einheiten: 24, miteigentumsanteile: [{ we_nr: "3", anteil: 41.2, nenner: 1000 }],
      sondernutzungsrechte: [{ art: "stellplatz", we_nr: "3" }],
      kostenverteilung_schluessel: "miteigentumsanteile", zweckbestimmung: "wohnen", gewerbe_erlaubt: false, vermietung_beschraenkt: true,
    });
    expect(pruefeFaktenauszug("musterkaufvertrag", {
      stand: "2025-03-01", faelligkeit: "mabv_raten", kaufpreis: 289000, maklerklausel: true, notarkosten_traegt: "kaeufer", gewaehrleistung: "vielleicht",
    })).toEqual({ stand: "2025-03-01", faelligkeit: "mabv_raten", notarkosten_traegt: "kaeufer" });
  });

  it("ohne Datum oder Zeitraum: nicht gespeichert, nur vermerkt, und nie im Prompt", async () => {
    const ergebnis = await faktenauszugErzeugen("k", "wirtschaftsplan", { pdf: PDF }, gateway({ gesamtkosten: 84000 }));
    expect(ergebnis).toEqual({ ok: true, auszug: { nicht_auswertbar: OHNE_DATUM } });
    expect(auszugFuerPrompt("rot", "wirtschaftsplan", { gesamtkosten: 84000 })).toBeNull();
    expect(auszugFuerPrompt("rot", "wirtschaftsplan", { zeitraum_von: "2025-01-01", gesamtkosten: 84000, notiz: "frei" }))
      .toEqual({ zeitraum_von: "2025-01-01", gesamtkosten: 84000 });
    // Ein gelber Auszug mit Text (etwa aus einer manipulierten Zeile) geht nie als Text in den Prompt.
    expect(auszugFuerPrompt("rot", "protokoll", { text: "Herr Beispiel stimmte dagegen", erfasst_von: "2024-01-01" })).toEqual({ erfasst_von: "2024-01-01" });
  });
});

describe("Gespeicherte Auszüge gelber Unterlagen", () => {
  const f = AUSZUG_SCHEMA_FASSUNG;
  const kandidat = (): LotseKandidat => ({
    ablage: { eimer: "investagon-dokumente", pfad: "o1/wp.pdf" }, vorsilbe: "investagon-dokumente/o1/wp.pdf#v1#",
    ampel: "rot", art: LOTSE_OFFEN_ART, lotsePruefen: true,
  });
  const zeile = (z: Record<string, unknown>) => ({ dokument_schluessel: "investagon-dokumente/o1/wp.pdf#v1#sha256:aa", schema_fassung: f, erstellt_am: "2026-10-05T10:00:00Z", ...z });

  it("ohne Auszug gilt sie als fehlend und wird vom Zeitplan nachgeholt", () => {
    const k = kandidat();
    const { zeilenJe, auszuege } = auszuegeZuordnen([k], [], () => undefined);
    expect(fehlendeAuszuege([k], zeilenJe, auszuege, 8, Date.now())).toHaveLength(1);
  });

  it("ein Faktenauszug aus der Einordnung des Lotsen gilt, die Art wird übernommen", () => {
    const k = kandidat();
    const uebernommen: unknown[] = [];
    const { zeilenJe, auszuege } = auszuegeZuordnen([k], [zeile({ ampel: "rot", art: "wirtschaftsplan", auszug: { zeitraum_von: "2025-01-01" } })], (_k, a) => uebernommen.push(a));
    expect(uebernommen).toEqual([{ ampel: "rot", art: "wirtschaftsplan", roteArt: "wirtschaftsplan" }]);
    expect(fehlendeAuszuege([k], zeilenJe, auszuege, 8, Date.now())).toHaveLength(0);
  });

  it("für eine gelbe Unterlage zählt nie ein grüner Sachauszug", () => {
    expect(lotseAnsichtAusZeile(zeile({ ampel: "gruen", art: "sonstiges", auszug: { text: "Sachauszug" } }))).toBeNull();
    expect(lotseAnsichtAusZeile(zeile({ ampel: "gruen", art: "lotse_gruen_teilungserklaerung", auszug: { text: "Sachauszug" } }))).toBeNull();
  });

  it("gemeinsame Leser: gelbe Faktenarten und „ungelesen“ geben nie frei (Codex-Befund 3)", () => {
    expect(gespeicherteEinordnung(zeile({ ampel: "rot", art: "protokoll", auszug: { erfasst_von: "2024-01-01" } }))).toEqual({ ergebnis: "gelb", art: "protokoll" });
    expect(gespeicherteEinordnung(zeile({ ampel: "rot", art: "wirtschaftsplan", auszug: { nicht_auswertbar: OHNE_DATUM } }))).toEqual({ ergebnis: "gelb", art: "wirtschaftsplan" });
    expect(gespeicherteEinordnung(zeile({ ampel: "rot", art: "lotse_ungelesen", auszug: { nicht_auswertbar: NICHT_FREIGEGEBEN } }))).toEqual({ ergebnis: "ausgeschlossen" });
    // Codex Runde 2: der Einordnungsvermerk vor dem Auszug, und Sachauszüge des ersten Stands gelber Unterlagen.
    expect(gespeicherteEinordnung(zeile({ ampel: "rot", art: "wirtschaftsplan", auszug: { nur_einordnung: true } }))).toEqual({ ergebnis: "gelb", art: "wirtschaftsplan" });
    expect(gespeicherteEinordnung(zeile({ ampel: "gruen", art: "lotse_gruen_teilungserklaerung", auszug: { text: "Sachauszug" } }))).toEqual({ ergebnis: "ausgeschlossen" });
    expect(gespeicherteEinordnung(zeile({ ampel: "gruen", art: "lotse_gruen_expose_beschreibung", auszug: { nur_einordnung: true } }))).toEqual({ ergebnis: "ausgeschlossen" });
    // Reguläre grüne Sachauszüge bleiben wiederverwendbar.
    expect(gespeicherteEinordnung(zeile({ ampel: "gruen", art: "expose", auszug: { text: "Sachauszug" } }))).toEqual({ ergebnis: "frei" });
    // Fehlversuche und Sperrvermerke tragen keine Einordnung.
    expect(gespeicherteEinordnung(zeile({ ampel: "rot", art: "protokoll", auszug: { fehlversuch: "x" } }))).toBeNull();
    // Der Rechner gibt solche Unterlagen nicht frei.
    const rechner = readFileSync("supabase/functions/investmentrechner-unterlagen/index.ts", "utf8");
    expect(rechner).toContain('if (bekannt?.ergebnis === "gelb" || bekannt?.ergebnis === "ausgeschlossen") return "ausgeschlossen";');
    expect(rechner).toContain('eingeordnet.filter((e) => e.art === "frei")');
  });

  it("die Einschränkung steht vor dem Auszug fest, ein Fehlversuch überschreibt sie nicht (Codex Runde 2, B)", () => {
    const code = readFileSync("supabase/functions/objekt-lotse/index.ts", "utf8");
    const vermerk = code.indexOf("const vermerk = auszugZeile(k, bezug, voll, { ampel: \"rot\", art: weg.art, auszug: NUR_EINORDNUNG });");
    expect(vermerk).toBeGreaterThan(0);
    expect(vermerk).toBeLessThan(code.indexOf("await faktenauszugErzeugen(schluessel, k.roteArt"));
    expect(code).toContain("eingeordnetGemerkt ? fehlversuchSchluessel(k.vorsilbe) : voll, \"Auswertung fehlgeschlagen\"");
    // Ein gelber Kandidat mit diesem Vermerk gilt als noch nicht ausgewertet und wird ohne neue Einordnung nachgeholt.
    const k = kandidat();
    const { zeilenJe, auszuege } = auszuegeZuordnen([k], [zeile({ ampel: "rot", art: "wirtschaftsplan", auszug: { nur_einordnung: true } })], () => undefined);
    expect(fehlendeAuszuege([k], zeilenJe, auszuege, 8, Date.now())).toHaveLength(1);
  });

  it("„uebersprungen“ sichert die Einschränkung nur, wenn sie schon dasteht (Codex Runde 3)", () => {
    const gruenerVollauszug = zeile({ ampel: "gruen", art: "expose", auszug: { text: "Sachauszug" } });
    expect(einschraenkungGesichert("uebersprungen", gruenerVollauszug, "wirtschaftsplan")).toBe(false);
    expect(einschraenkungGesichert("uebersprungen", undefined, "wirtschaftsplan")).toBe(false);
    expect(einschraenkungGesichert("uebersprungen", zeile({ ampel: "rot", art: "protokoll", auszug: { nur_einordnung: true } }), "wirtschaftsplan")).toBe(false);
    expect(einschraenkungGesichert("uebersprungen", zeile({ ampel: "rot", art: "wirtschaftsplan", auszug: { nur_einordnung: true } }), "wirtschaftsplan")).toBe(true);
    expect(einschraenkungGesichert("geschrieben", gruenerVollauszug, "wirtschaftsplan")).toBe(true);
    expect(einschraenkungGesichert("fehler", undefined, "wirtschaftsplan")).toBe(false);
    // Nicht gesichert: Die Function ersetzt die Zeile durch den Vermerk, sonst Fehlversuch ohne Auszug.
    const code = readFileSync("supabase/functions/objekt-lotse/index.ts", "utf8");
    expect(code).toContain('if (!einschraenkungGesichert(gemerkt, bestehend, weg.art)) {\n          gemerkt = (await auszugSpeichern(dienst, k, bezug, voll, vermerk)).fehler ? "fehler" : "geschrieben";');
  });

  it("eine grüne Unterlage mit gespeichertem gelbem Auszug oder Vermerk gilt als erledigt, nicht als frei", () => {
    const gruen: LotseKandidat = { ...kandidat(), ampel: "gruen", art: "expose", lotsePruefen: false, inhaltPruefen: true };
    expect(auszugAnsicht(zeile({ ampel: "rot", art: "protokoll", auszug: { erfasst_von: "2024-01-01" } }), gruen))
      .toEqual({ ampel: "rot", art: "protokoll", roteArt: "protokoll" });
    expect(auszugAnsicht(zeile({ ampel: "rot", art: "lotse_ungelesen", auszug: { nicht_auswertbar: NICHT_FREIGEGEBEN } }), gruen))
      .toEqual({ ampel: "rot", art: "lotse_ungelesen" });
  });

  it("Vermerke gelten als erledigt, nur mit festem Grund", () => {
    expect(lotseAnsichtAusZeile(zeile({ ampel: "rot", art: "lotse_ungelesen", auszug: { nicht_auswertbar: NICHT_FREIGEGEBEN } }))).not.toBeNull();
    expect(lotseAnsichtAusZeile(zeile({ ampel: "rot", art: "wirtschaftsplan", auszug: { nicht_auswertbar: OHNE_DATUM } }))).not.toBeNull();
    expect(lotseAnsichtAusZeile(zeile({ ampel: "rot", art: "lotse_ungelesen", auszug: { nicht_auswertbar: "Eigentümer Beispiel" } }))).toBeNull();
    expect(lotseAnsichtAusZeile(zeile({ ampel: "rot", art: "wirtschaftsplan", schema_fassung: f - 1, auszug: { zeitraum_von: "2025-01-01" } }))).toBeNull();
  });
});

describe("Pflichthinweise im Prompt (Vorgabe F)", () => {
  const wp = gelbePflicht({ art: "wirtschaftsplan", name: "Wirtschaftsplan", zeitraum: { von: "2025-01-01", bis: "2025-12-31" }, ebene: " zum Objekt" });
  const bs = gelbePflicht({ art: "protokoll", name: "Beschlüsse der Eigentümergemeinschaft", zeitraum: { von: "2022-05-01", bis: "2024-05-01" }, ebene: " zum Objekt" });
  const kv = gelbePflicht({ art: "musterkaufvertrag", name: "Musterkaufvertrag", zeitraum: { von: "2025-03-01" }, ebene: " zum Objekt" });

  it("feste Bezeichnung mit Zeitraum, nie der Dateiname", () => {
    expect(wp.bezeichnung).toBe("Wirtschaftsplan 01.01.2025 bis 31.12.2025 zum Objekt");
    expect(kv.bezeichnung).toBe("Musterkaufvertrag 01.03.2025 zum Objekt");
  });
  it("die Hinweise im Wortlaut", () => {
    expect(wp.pflichthinweis).toBe(
      "Automatisch ausgelesen aus Wirtschaftsplan, Stand 01.01.2025 bis 31.12.2025, nicht geprüft. Maßgeblich ist das Original. Vor Weitergabe an Kunden bitte im Original prüfen. Planwert, keine Abrechnung.",
    );
    expect(bs.pflichthinweis).toContain("Ausgewertet sind nur die vorliegenden Unterlagen von 01.05.2022 bis 01.05.2024.");
    expect(kv.pflichthinweis).toContain("Entwurf, maßgeblich ist die notarielle Urkunde.");
    for (const h of [wp, bs, kv]) expect(h.pflichthinweis + h.bezeichnung).not.toMatch(/[–—]/);
  });
  it("der Prompt trägt Hinweis, Negativregel und Klauselregel, die Verwaltervergütung bleibt als Kostenangabe", () => {
    const prompt = baueLotsePrompt({
      heute: "2026-10-05T10:00:00Z", objekt: { id: "o1" }, kalkulation: null, nichtGelesen: {},
      unterlagen: [
        { ...wp, ampel: "rot", auszug: { zeitraum_von: "2025-01-01", gesamtkosten: 84000 }, stand: "2026-10-05T10:00:00Z" },
        { bezeichnung: "Verwaltervertrag zum Objekt", ampel: "rot", auszug: { art: "sev", beginn: "2024-01-01", verwalter_verguetung_je_einheit_monat: 29.75 }, stand: "2026-10-05T10:00:00Z", pflichthinweis: "x" },
      ],
    });
    expect(prompt).toContain(`PFLICHTHINWEIS: ${wp.pflichthinweis}`);
    expect(prompt).toContain("setzt du ihn zu jeder Angabe aus dieser Unterlage wörtlich dazu");
    expect(prompt).toContain("In den vorliegenden Unterlagen ist keine Sonderumlage genannt.");
    expect(prompt).toContain("Klauseln eines Musterkaufvertrags legst du nicht aus");
    expect(prompt).toContain("verwalter_verguetung_je_einheit_monat");
    expect(prompt).toContain("29.75");
  });
});
