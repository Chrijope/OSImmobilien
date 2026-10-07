import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DATEI_GUELTIG_SEKUNDEN, findeGrundriss, grundrisseZumLink, grundrissOhneAblage, kundenGrundrisse, oeffentlicheAdresse,
  oeffentlicheUnterlagen, pruefeDateiAnfrage,
} from "../../supabase/functions/get-expose/unterlagen";
import { oeffentlichesMeta, oeffentlicheWohnung } from "../../supabase/functions/_shared/expose-oeffentlich";
import { exposeArtErlaubt, linkBereich } from "../../supabase/functions/_shared/expose-kundenlink";

/**
 * Befund 1 aus dem Bauplan Kundenansicht (23.09.2026): `get-expose` gab die
 * Unterlagen jeder Einheit ungefiltert heraus, aus der Tabelle und aus
 * `meta.dokumente`, auch interne, mit Namen und Ablageadresse.
 *
 * Seitdem geht je Unterlage nur hinaus, was die Dokumenten-Ampel erlaubt und
 * eine öffentliche Adresse hat, und davon genau fünf Angaben. Die Prüflinge
 * liegen in `supabase/functions/get-expose/`, diese Datei liest sie über die
 * Verzeichnisgrenze hinweg ein.
 */

const OEFFENTLICH = "https://abc.supabase.co/storage/v1/object/public/objekt-medien/objekte/o1/wohnungen/w7";

describe("oeffentlicheAdresse", () => {
  it("lässt nur Adressen der öffentlichen Ablage hinaus", () => {
    expect(oeffentlicheAdresse(`${OEFFENTLICH}/wd2_grundriss.pdf`)).toBe(`${OEFFENTLICH}/wd2_grundriss.pdf`);
  });

  it.each([
    ["Zeiger auf den geschützten Eimer", "/objekt-dokument/objekte/o1/dokumente/mv.pdf"],
    ["Zeiger des Investagon-Imports", "/investagon-dokument/o1/mv.pdf"],
    ["Originaladresse bei Investagon", "https://tool.investagon.com/files/mv.pdf"],
    ["befristete Adresse mit Schlüssel", "https://abc.supabase.co/storage/v1/object/sign/objekt-dokumente/a.pdf?token=geheim"],
    ["öffentliche Form eines privaten Eimers", "https://abc.supabase.co/storage/v1/object/public/objekt-dokumente/a.pdf"],
    ["öffentliche Form des Kundeneimers", "https://abc.supabase.co/storage/v1/object/public/unterlagen/kunde/ausweis.pdf"],
    ["reiner Pfad im privaten Speicher", "objekte/o1/dokumente/mv.pdf"],
    ["unverschlüsselt", "http://abc.supabase.co/storage/v1/object/public/objekt-medien/a.pdf"],
    ["fremder Server", "https://ordner.example/haus/mietvertrag.pdf"],
    ["leer", ""],
    ["keine Zeichenkette", 42],
  ])("hält %s zurück", (_, adresse) => {
    expect(oeffentlicheAdresse(adresse)).toBeUndefined();
  });
});

describe("oeffentlicheUnterlagen, Positivliste", () => {
  /** Eine Zeile, in die alles hineingeschrieben ist, was nie hinausdarf. */
  const vergiftet = {
    id: "wd-grundriss",
    wohnung_id: "w7",
    name: "Grundriss WE 7",
    url: `${OEFFENTLICH}/wd2_grundriss.pdf`,
    kategorie: "wohnungsunterlagen",
    kunden_freigabe: null,
    kunden_freigabe_von: "admin-uuid-1",
    kunden_freigabe_am: "2026-09-23T10:00:00Z",
    geschwaerzt: false,
    erstellt_am: "2026-01-01",
    kunde_name: "Martina Brandl",
    provision: 8.4,
    notiz: "Mieter Scholtz zahlt unpünktlich",
    unterlagenLink: "https://ordner.example/alles",
  };

  it("gibt je Unterlage genau Kennung, Name, Adresse, Kategorie und sichtbar heraus", () => {
    const raus = oeffentlicheUnterlagen({ zeilen: [vergiftet], kategorie: "wohnungsunterlagen" });
    expect(raus).toEqual([
      { id: "wd-grundriss", name: "Grundriss WE 7", url: `${OEFFENTLICH}/wd2_grundriss.pdf`, kategorie: "wohnungsunterlagen", sichtbar: true },
    ]);
    const text = JSON.stringify(raus);
    for (const verboten of ["Martina", "Scholtz", "provision", "admin-uuid", "ordner.example", "wohnung_id", "kunden_freigabe"]) {
      expect(text).not.toContain(verboten);
    }
  });

  it("hält Rotes, Gelbes, Internes und Geschütztes zurück, auch mit öffentlicher Adresse", () => {
    const zeilen = [
      { id: "mv", name: "7.2.8 Mietvertrag WE 09_23.02.2010", url: `${OEFFENTLICH}/mv.pdf`, kategorie: "wohnungsunterlagen" },
      { id: "gba", name: "GBA Wohnung", url: `${OEFFENTLICH}/gba.pdf`, kategorie: "wohnungsunterlagen" },
      { id: "wp", name: "Wirtschaftsplan 2025", url: `${OEFFENTLICH}/wp.pdf`, kategorie: "wohnungsunterlagen" },
      { id: "intern", name: "Exposé", url: `${OEFFENTLICH}/intern.pdf`, kategorie: "intern" },
      { id: "geschuetzt", name: "Energieausweis", url: "/objekt-dokument/objekte/o1/wohnungen/w7/e.pdf", kategorie: "wohnungsunterlagen" },
      { id: "investagon", name: "Grundriss WE 9", url: "/investagon-dokument/o1/g.pdf", kategorie: "intern" },
      { id: "galerie", name: "Grundriss", url: "__gallery__", kategorie: "wohnungsunterlagen" },
      { id: "leer", name: "Grundriss", url: "", kategorie: "wohnungsunterlagen" },
    ];
    expect(oeffentlicheUnterlagen({ zeilen, kategorie: "wohnungsunterlagen" })).toEqual([]);
  });

  it("gibt Gelbes nach Freigabe aus der Tabelle frei, nie nach einer Freigabe in meta.dokumente", () => {
    const wp = { id: "wp", name: "Wirtschaftsplan 2025", url: `${OEFFENTLICH}/wp.pdf`, kategorie: "wohnungsunterlagen", kunden_freigabe: "frei" };
    expect(oeffentlicheUnterlagen({ zeilen: [wp], kategorie: "wohnungsunterlagen" }).map((d) => d.id)).toEqual(["wp"]);
    expect(oeffentlicheUnterlagen({ zeilen: [], metaEintraege: [wp], kategorie: "wohnungsunterlagen" })).toEqual([]);
  });

  it("lässt einen Mietvertrag nur als geschwärzt geprüfte und freigegebene Kopie hinaus", () => {
    const mv = { id: "mv", name: "Mietvertrag geschwärzt", url: `${OEFFENTLICH}/mv.pdf`, kategorie: "wohnungsunterlagen" };
    expect(oeffentlicheUnterlagen({ zeilen: [{ ...mv, kunden_freigabe: "frei" }], kategorie: "wohnungsunterlagen" })).toEqual([]);
    expect(oeffentlicheUnterlagen({ zeilen: [{ ...mv, kunden_freigabe: "frei", geschwaerzt: true }], kategorie: "wohnungsunterlagen" }).map((d) => d.id)).toEqual(["mv"]);
    // Eine vergiftete Kopie in meta mit denselben Angaben zählt nicht.
    expect(oeffentlicheUnterlagen({ zeilen: [], metaEintraege: [{ ...mv, kunden_freigabe: "frei", geschwaerzt: true }], kategorie: "wohnungsunterlagen" })).toEqual([]);
  });

  it("lässt die Sperre in der Tabelle gewinnen, auch wenn meta eine Kopie derselben Datei trägt", () => {
    const url = `${OEFFENTLICH}/wd2_grundriss.pdf`;
    const zeile = { id: "g", name: "Grundriss WE 7", url, kategorie: "wohnungsunterlagen", kunden_freigabe: "gesperrt" };
    const kopie = { id: "g-alt", name: "Grundriss WE 7", url, kategorie: "wohnungsunterlagen" };
    const gleicheId = { id: "g", name: "Grundriss", url: `${OEFFENTLICH}/andere.pdf`, kategorie: "wohnungsunterlagen" };
    expect(oeffentlicheUnterlagen({ zeilen: [zeile], metaEintraege: [kopie, gleicheId], kategorie: "wohnungsunterlagen" })).toEqual([]);
  });

  it("nimmt Unterlagen, die nur in meta.dokumente stehen, nach der Grundregel mit", () => {
    const grundriss = { id: "wd2", name: "Grundriss", url: `${OEFFENTLICH}/wd2.pdf`, kategorie: "wohnungsunterlagen" };
    expect(oeffentlicheUnterlagen({ zeilen: [], metaEintraege: [grundriss], kategorie: "wohnungsunterlagen" }).map((d) => d.id)).toEqual(["wd2"]);
  });

  it("setzt immer die kundentaugliche Kategorie, nie „intern“", () => {
    const exposeFrei = { id: "e", name: "Exposé", url: `${OEFFENTLICH}/e.pdf`, kategorie: "intern", kunden_freigabe: "frei" };
    const [raus] = oeffentlicheUnterlagen({ zeilen: [exposeFrei], kategorie: "objektunterlagen" });
    expect(raus.kategorie).toBe("objektunterlagen");
  });

  it("findet die Investagon-Kategorie über die Rohdaten", () => {
    // Ohne Kategorie wäre „Scan_0042" Sonstiges, also gelb.
    const zeile = { id: "s", name: "Scan_0042", url: `${OEFFENTLICH}/s.pdf`, kategorie: "wohnungsunterlagen" };
    const roh = { files: [{ filename: "https://tool.investagon.com/f/s.pdf", title: "Scan_0042", category: "layout" }] };
    expect(oeffentlicheUnterlagen({ zeilen: [zeile], kategorie: "wohnungsunterlagen" })).toEqual([]);
    expect(oeffentlicheUnterlagen({ zeilen: [zeile], kategorie: "wohnungsunterlagen", investagonRoh: roh }).map((d) => d.id)).toEqual(["s"]);
  });

  it("gibt die veraltete Kopie eines aus einer PDF übernommenen Plans aus meta.dokumente nicht heraus", () => {
    const kopie = { id: "alt", name: "Grundriss WE 7", url: `${OEFFENTLICH}/wd2_grundriss-aus-pdf-1.png`, kategorie: "wohnungsunterlagen" };
    expect(oeffentlicheUnterlagen({ zeilen: [], metaEintraege: [kopie], kategorie: "wohnungsunterlagen" })).toEqual([]);
    // Als Tabellenzeile ist derselbe Plan der echte und geht hinaus.
    expect(oeffentlicheUnterlagen({ zeilen: [kopie], kategorie: "wohnungsunterlagen" }).map((d) => d.id)).toEqual(["alt"]);
  });

  it("verträgt kaputte Eingaben", () => {
    expect(oeffentlicheUnterlagen({ zeilen: null, metaEintraege: "kaputt", kategorie: "objektunterlagen" })).toEqual([]);
    expect(oeffentlicheUnterlagen({ zeilen: [null, 3, "x", { name: "ohne Adresse" }], kategorie: "objektunterlagen" })).toEqual([]);
  });
});

/*
 * Grundrisse aus Investagon (Entscheidung Christian vom 23.09.2026): keine
 * Originaladresse bei Investagon und keine Adresse eines fremden Servers mehr
 * im Kundenlink. Die Liste trägt nur Kennung, Bereich, Name und „Bild ja oder
 * nein“, die Datei gibt es einzeln über die Aktion „datei“ als befristete
 * Adresse auf die Kopie im eigenen Speicher.
 */
describe("kundenGrundrisse", () => {
  /** Rohdaten, wie der Import sie ablegt, mit allem, was nie hinausdarf. */
  const objektRoh = {
    commission: 8.403,
    files: [
      { id: 1, category: "layout", title: "WE18 Grundriss", original_filename: "WE18_Grundriss.jpg", filename: "https://tool.investagon.com/a/WE18_Grundriss.jpg", position: 2 },
      { id: 2, category: "layout", title: "Pläne Haus 9", original_filename: "Plaene Haus 9.pdf", filename: "https://tool.investagon.com/a/Plaene%20Haus%209.pdf", position: 1 },
      { id: 3, category: "energy_certificate", title: "Energieausweis", original_filename: "EA.pdf", filename: "https://tool.investagon.com/a/EA.pdf" },
      { id: 4, category: "layout", title: "Mietvertrag Scholtz Anlage Grundriss", original_filename: "MV.pdf", filename: "https://tool.investagon.com/a/MV.pdf" },
      { id: 5, category: "rental_agreement", title: "Mietvertrag WE 7", original_filename: "MV7.pdf", filename: "https://tool.investagon.com/a/MV7.pdf" },
      { id: 6, category: "layout", title: "Grundriss ohne Kopie", original_filename: "fehlt.jpg", filename: "https://tool.investagon.com/a/fehlt.jpg" },
    ],
  };
  /** Die Zeilen, die der Import dazu in `objekt_dokumente` schreibt. */
  const objektZeilen = [
    { id: "od-we18", name: "WE18 Grundriss", url: "/investagon-dokument/o1/1a2b3c4d-WE18_Grundriss.jpg", kategorie: "intern", sichtbar: false },
    { id: "od-haus", name: "Pläne Haus 9", url: "/investagon-dokument/o1/5e6f7a8b-Plaene-Haus-9.pdf", kategorie: "intern", sichtbar: false },
    { id: "od-ea", name: "Energieausweis", url: "/investagon-dokument/o1/9c0d1e2f-EA.pdf", kategorie: "intern", sichtbar: false },
    { id: "od-mv", name: "Mietvertrag Scholtz Anlage Grundriss", url: "/investagon-dokument/o1/aaaa0000-MV.pdf", kategorie: "intern", sichtbar: false },
    { id: "od-mv7", name: "Mietvertrag WE 7", url: "/investagon-dokument/o1/bbbb0000-MV7.pdf", kategorie: "intern", sichtbar: false },
  ];
  const wohnungRoh = {
    files: [{ id: 11, category: "layout", title: "Grundriss", original_filename: "WE07.png", filename: "https://tool.investagon.com/w/WE07.png" }],
  };
  const wohnungZeilen = [{ id: "wd-g7", name: "Grundriss", url: "/investagon-dokument/o1/cccc1111-WE07.png", kategorie: "intern" }];

  it("gibt nur Kennung, Bereich, Name und Bildangabe heraus, nie eine Adresse", () => {
    // Im Exposé des Objekts gewinnt der Plan des Hauses, der Plan von WE 18 bleibt dort weg.
    const liste = kundenGrundrisse({ objektRoh, objektZeilen }).map(grundrissOhneAblage);
    expect(liste).toEqual([
      { id: "od-haus", bereich: "objekt", wohnungId: null, name: "Pläne Haus 9", istBild: false },
    ]);
    // Ohne Plan des Hauses kommen die Pläne der Einheiten, ebenso ohne Adresse.
    const ohneHaus = kundenGrundrisse({ objektRoh, objektZeilen: objektZeilen.filter((z) => z.id !== "od-haus") }).map(grundrissOhneAblage);
    expect(ohneHaus).toEqual([{ id: "od-we18", bereich: "objekt", wohnungId: null, name: "WE18 Grundriss", istBild: true }]);
    expect(JSON.stringify(ohneHaus)).not.toContain("investagon");
    const text = JSON.stringify(liste);
    for (const verboten of ["investagon.com", "/investagon-dokument/", "https://", "8.403", "Energieausweis", "Mietvertrag", "Scholtz", "fehlt"]) {
      expect(text).not.toContain(verboten);
    }
  });

  it("legt die Datei im eigenen Eimer ab, nicht bei Investagon", () => {
    const [erster] = kundenGrundrisse({ objektRoh, objektZeilen });
    expect(erster.ablage).toEqual({ eimer: "investagon-dokumente", pfad: "o1/5e6f7a8b-Plaene-Haus-9.pdf" });
  });

  it("hält eine Zeile mit Investagon- oder Fremdadresse zurück, statt auf sie auszuweichen", () => {
    const vergiftet = [
      { id: "od-we18", name: "WE18 Grundriss", url: "https://tool.investagon.com/a/WE18_Grundriss.jpg", kategorie: "intern" },
      { id: "od-haus", name: "Pläne Haus 9", url: "https://ordner.example/Plaene.pdf", kategorie: "objektunterlagen", kunden_freigabe: "frei" },
    ];
    expect(kundenGrundrisse({ objektRoh, objektZeilen: vergiftet })).toEqual([]);
  });

  it("gibt ohne Kopie im CRM gar nichts heraus", () => {
    expect(kundenGrundrisse({ objektRoh, objektZeilen: [] })).toEqual([]);
  });

  it("überträgt die Sperre von Admin oder Inhaber und hält einen Mietvertrag unter „Grundriss“ zurück", () => {
    const gesperrt = objektZeilen.map((z) => (z.id === "od-we18" ? { ...z, kunden_freigabe: "gesperrt" } : z));
    expect(kundenGrundrisse({ objektRoh, objektZeilen: gesperrt }).map((g) => g.id)).toEqual(["od-haus"]);
    // Auch eine Freigabe hilft dem Mietvertrag nicht, er ist rot.
    const mvFrei = objektZeilen.map((z) => (z.id === "od-mv" ? { ...z, kunden_freigabe: "frei" } : z));
    expect(kundenGrundrisse({ objektRoh, objektZeilen: mvFrei }).map((g) => g.id)).not.toContain("od-mv");
  });

  it("nimmt für eine Einheit ihren eigenen Plan vor dem des Hauses und nie einen mit fremder Nummer", () => {
    const liste = kundenGrundrisse({
      objektRoh, objektZeilen,
      wohnung: { id: "w7", weNr: "WE 07", roh: wohnungRoh, zeilen: wohnungZeilen },
    });
    expect(liste.map((g) => [g.bereich, g.id])).toEqual([["wohnung", "wd-g7"]]);
    expect(liste[0].wohnungId).toBe("w7");
    // Ohne eigenen Plan der Plan des Hauses als gekennzeichneter Ersatz, der von WE 18 nie.
    const ohneEigenen = kundenGrundrisse({ objektRoh, objektZeilen, wohnung: { id: "w7", weNr: "WE 07", roh: {}, zeilen: [] } });
    expect(ohneEigenen.map((g) => [g.id, g.ersatz])).toEqual([["od-haus", "hausplan"]]);
  });

  it("findet von Hand hochgeladene Pläne im geschützten Eimer und in meta.dokumente", () => {
    const objektPlan = { id: "od-hand7", name: "Grundriss Whg. 7", url: "/objekt-dokument/objekte/o1/dokumente/gr-whg7.pdf", kategorie: "objektunterlagen", sichtbar: true };
    const fuer = (weNr: string) => kundenGrundrisse({ objektRoh: {}, objektZeilen: [objektPlan], wohnung: { id: "w", weNr, roh: {}, zeilen: [] } });
    expect(fuer("WE 7").map((g) => [g.id, g.ablage.eimer])).toEqual([["od-hand7", "objekt-dokumente"]]);
    // Gegenprobe: WE 8 bekommt den Plan von Whg. 7 nicht.
    expect(fuer("WE 8")).toEqual([]);

    const metaPlan = { id: "wd2", name: "Grundriss", url: `${OEFFENTLICH}/wd2_grundriss.png`, kategorie: "wohnungsunterlagen" };
    const liste = kundenGrundrisse({ objektRoh: {}, objektZeilen: [], wohnung: { id: "w7", weNr: "7", roh: {}, zeilen: [], metaEintraege: [metaPlan] } });
    expect(liste.map(grundrissOhneAblage)).toEqual([{ id: "wd2", bereich: "wohnung", wohnungId: "w7", name: "Grundriss", istBild: true }]);
    expect(liste[0].ablage).toEqual({ eimer: "objekt-medien", pfad: "objekte/o1/wohnungen/w7/wd2_grundriss.png" });
  });

  it("zählt eine Freigabe nur aus der Tabelle, nie aus meta.dokumente", () => {
    // „Plan WE 7“ ist nach der Stichwortliste Sonstiges, also gelb und von Haus aus gesperrt.
    const gelb = { id: "p7", name: "Plan WE 7", url: `${OEFFENTLICH}/p7.pdf`, kategorie: "wohnungsunterlagen", kunden_freigabe: "frei" };
    const wohnung = (zeilen: unknown[], metaEintraege: unknown[]) => ({ id: "w7", weNr: "7", roh: {}, zeilen, metaEintraege });
    expect(kundenGrundrisse({ objektRoh: {}, objektZeilen: [], wohnung: wohnung([], [gelb]) })).toEqual([]);
    expect(kundenGrundrisse({ objektRoh: {}, objektZeilen: [], wohnung: wohnung([gelb], []) }).map((g) => g.id)).toEqual(["p7"]);
  });

  it("gibt einer Einzelwohnung auch den Plan am Objekt ohne Nummer", () => {
    const plan = { id: "od-g", name: "Grundriss.jpg", url: "/objekt-dokument/objekte/o1/dokumente/g.jpg", kategorie: "objektunterlagen", sichtbar: true };
    const wohnung = { id: "w1", weNr: "", roh: {}, zeilen: [] };
    expect(kundenGrundrisse({ objektRoh: {}, objektZeilen: [plan], wohnung })).toEqual([]);
    expect(kundenGrundrisse({ objektRoh: {}, objektZeilen: [plan], wohnung, einzelwohnung: true }).map((g) => g.id)).toEqual(["od-g"]);
  });

  it("ordnet gleichnamige Kopien über den abgelegten Dateinamen zu, nie über Zufall", () => {
    const roh = {
      files: [
        { id: 1, category: "layout", title: "Grundriss", original_filename: "WE18.jpg", filename: "https://tool.investagon.com/a/WE18.jpg" },
        { id: 2, category: "layout", title: "Grundriss", original_filename: "WE7.jpg", filename: "https://tool.investagon.com/a/WE7.jpg" },
      ],
    };
    const zeilen = [
      { id: "g18", name: "Grundriss", url: "/investagon-dokument/o1/11111111-WE18.jpg", kategorie: "intern" },
      { id: "g7", name: "Grundriss", url: "/investagon-dokument/o1/22222222-WE7.jpg", kategorie: "intern" },
    ];
    // Für WE 7 fällt WE18.jpg wegen der fremden Nummer weg, WE7.jpg findet genau seine Kopie.
    const liste = kundenGrundrisse({ objektRoh: roh, objektZeilen: zeilen, wohnung: { id: "w7", weNr: "7", roh: {}, zeilen: [] } });
    expect(liste.map((g) => g.id)).toEqual(["g7"]);
    // Zwei gleichnamige Zeilen ohne Nummer im Dateinamen: Für WE 7 lieber kein Plan als ein falscher.
    const unklar = zeilen.map((z, i) => ({ ...z, url: `/investagon-dokument/o1/3333333${i}-anders.jpg` }));
    expect(kundenGrundrisse({ objektRoh: roh, objektZeilen: unklar, wohnung: { id: "w7", weNr: "7", roh: {}, zeilen: [] } })).toEqual([]);
  });

  it("verträgt kaputte Eingaben", () => {
    expect(kundenGrundrisse({ objektRoh: null, objektZeilen: null })).toEqual([]);
    expect(kundenGrundrisse({ objektRoh: { files: "keine Liste" }, objektZeilen: [null, 3] })).toEqual([]);
    // Ohne verwertbare Rohdaten entscheiden Name und Ampel: „Pläne Haus 9“ ist dann Sonstiges, also gelb
    // und gesperrt, „WE18 Grundriss“ grün. Energieausweis und Mietvertrag kommen nie.
    expect(kundenGrundrisse({ objektRoh: { files: [null, { category: "layout" }] }, objektZeilen }).map((g) => g.id)).toEqual(["od-we18"]);
  });
});

describe("grundrisseZumLink: Datei gehört zu diesem Objekt und dieser Einheit", () => {
  const objekt = {
    id: "o1",
    meta: { investagonRaw: { files: [{ id: 2, category: "layout", title: "Pläne Haus 9", original_filename: "Plaene Haus 9.pdf", filename: "https://tool.investagon.com/a/p.pdf" }] } },
  };
  const objektZeilen = [{ id: "od-haus", name: "Pläne Haus 9", url: "/investagon-dokument/o1/5e6f7a8b-Plaene-Haus-9.pdf", kategorie: "intern", sichtbar: false }];
  const wohnung = (id: string, objektId = "o1") => ({
    id, objekt_id: objektId, we_nr: "7",
    meta: { investagonRaw: { files: [{ id: 11, category: "layout", title: `Grundriss ${id}`, original_filename: `${id}.png`, filename: `https://tool.investagon.com/w/${id}.png` }] } },
    wohnungs_dokumente: [{ id: `wd-${id}`, name: `Grundriss ${id}`, url: `/investagon-dokument/o1/cccc1111-${id}.png`, kategorie: "intern" }],
  });

  it("liefert zum Objekt-Exposé nur die Pläne des Hauses", () => {
    const liste = grundrisseZumLink({ link: { objekt_id: "o1", wohnung_id: null }, objekt, objektZeilen, wohnungen: [wohnung("w7"), wohnung("w9")] });
    expect(liste.map((g) => g.id)).toEqual(["od-haus"]);
  });

  it("liefert zum Einheiten-Exposé nur den Plan dieser Einheit, nie den einer anderen", () => {
    const liste = grundrisseZumLink({ link: { objekt_id: "o1", wohnung_id: "w7" }, objekt, objektZeilen, wohnungen: [wohnung("w9"), wohnung("w7")] });
    expect(liste.map((g) => g.id)).toEqual(["wd-w7"]);
    expect(findeGrundriss(liste, { bereich: "wohnung", id: "wd-w9" })).toBeUndefined();
  });

  it("Objekt-Link auf einer Einheitsseite: Pläne nur zu dieser Einheit, nie zu allen", () => {
    // Der Bereich kommt aus `linkBereich`, so wie `get-expose` ihn für Liste und Datei nimmt.
    const bereich = linkBereich({ objekt_id: "o1", wohnung_id: null }, "o1", "w7", { id: "w7", objekt_id: "o1" });
    expect(bereich).not.toBeNull();
    const liste = grundrisseZumLink({ link: bereich!, objekt, objektZeilen, wohnungen: [wohnung("w9"), wohnung("w7")] });
    expect(liste.map((g) => g.id)).toEqual(["wd-w7"]);
    expect(findeGrundriss(liste, { bereich: "wohnung", id: "wd-w9" })).toBeUndefined();
  });

  it("liest Einzelwohnung und meta.dokumente aus den Zeilen", () => {
    const einzel = { ...objekt, meta: { ...objekt.meta, einzelwohnung: true } };
    const plan = [{ id: "od-g", name: "Grundriss.jpg", url: "/objekt-dokument/objekte/o1/dokumente/g.jpg", kategorie: "objektunterlagen", sichtbar: true }];
    const ohneNummer = { id: "w1", objekt_id: "o1", we_nr: "", meta: {}, wohnungs_dokumente: [] };
    expect(grundrisseZumLink({ link: { objekt_id: "o1", wohnung_id: "w1" }, objekt: einzel, objektZeilen: plan, wohnungen: [ohneNummer] }).map((g) => g.id)).toEqual(["od-g"]);
    const mitMeta = { ...ohneNummer, meta: { dokumente: [{ id: "wd2", name: "Grundriss", url: `${OEFFENTLICH}/wd2.jpg`, kategorie: "wohnungsunterlagen" }] } };
    expect(grundrisseZumLink({ link: { objekt_id: "o1", wohnung_id: "w1" }, objekt, objektZeilen: [], wohnungen: [mitMeta] }).map((g) => g.id)).toEqual(["wd2"]);
  });

  it("gibt nichts heraus, wenn Objekt oder Einheit nicht zum Link gehören", () => {
    expect(grundrisseZumLink({ link: { objekt_id: "o2", wohnung_id: null }, objekt, objektZeilen, wohnungen: [] })).toEqual([]);
    // Die Einheit hängt an einem anderen Objekt: auch die Pläne des Hauses nicht.
    expect(grundrisseZumLink({ link: { objekt_id: "o1", wohnung_id: "w7" }, objekt, objektZeilen, wohnungen: [wohnung("w7", "o2")] })).toEqual([]);
    expect(grundrisseZumLink({ link: { objekt_id: "o1", wohnung_id: "w7" }, objekt, objektZeilen, wohnungen: [] })).toEqual([]);
  });

  it("findet eine Datei nur mit passendem Bereich und passender Kennung", () => {
    const liste = grundrisseZumLink({ link: { objekt_id: "o1", wohnung_id: null }, objekt, objektZeilen, wohnungen: [wohnung("w7")] });
    expect(findeGrundriss(liste, { bereich: "objekt", id: "od-haus" })?.ablage).toEqual({ eimer: "investagon-dokumente", pfad: "o1/5e6f7a8b-Plaene-Haus-9.pdf" });
    expect(findeGrundriss(liste, { bereich: "wohnung", id: "od-haus" })).toBeUndefined();
    expect(findeGrundriss(liste, { bereich: "objekt", id: "od-ea" })).toBeUndefined();
    // Der Plan der Einheit steht nicht in der Liste des Objekt-Exposés, also gibt es ihn dort auch nicht als Datei.
    expect(findeGrundriss(liste, { bereich: "wohnung", id: "wd-w7" })).toBeUndefined();
  });
});

describe("pruefeDateiAnfrage", () => {
  const TOKEN = "ab".repeat(32);
  const anfrage = (werte: Record<string, string>) => pruefeDateiAnfrage(new URLSearchParams(werte));

  it("liest Schlüssel, Bereich und Kennung", () => {
    expect(anfrage({ aktion: "datei", id: "o1", token: TOKEN, bereich: "wohnung", wohnung: "w7", datei: "wd-g7" }))
      .toEqual({ token: TOKEN, bereich: "wohnung", id: "wd-g7" });
  });

  it("gibt ohne gültigen Schlüssel keine Datei heraus, auch nicht für die öffentliche Vorschau", () => {
    expect(anfrage({ aktion: "datei", id: "o1", bereich: "objekt", datei: "od-haus" })).toBeNull();
    expect(anfrage({ aktion: "datei", id: "o1", token: "", bereich: "objekt", datei: "od-haus" })).toBeNull();
    expect(anfrage({ aktion: "datei", id: "o1", token: "abc' or 1=1", bereich: "objekt", datei: "od-haus" })).toBeNull();
  });

  it("lehnt unbekannte Bereiche und Kennungen in falscher Form ab", () => {
    expect(anfrage({ token: TOKEN, bereich: "kunde", datei: "x" })).toBeNull();
    expect(anfrage({ token: TOKEN, bereich: "objekt", datei: "../../unterlagen/ausweis.pdf" })).toBeNull();
    expect(anfrage({ token: TOKEN, bereich: "objekt" })).toBeNull();
    expect(anfrage({ token: TOKEN, bereich: "objekt", datei: "x", wohnung: "w7/../w9" })).toBeNull();
  });

  it("gibt Adressen für 15 Minuten aus", () => {
    expect(DATEI_GUELTIG_SEKUNDEN).toBe(15 * 60);
  });
});

describe("oeffentliches meta ohne Unterlagen und Sammelordner", () => {
  it("gibt meta.dokumente und unterlagenLink nie heraus, weder am Objekt noch an der Einheit", () => {
    const meta = {
      kurzbeschreibung: "Ruhige Lage",
      bilder: [{ id: "b", url: "https://abc.supabase.co/storage/v1/object/public/objekt-medien/b.jpg" }],
      dokumente: [{ id: "mv", name: "Mietvertrag Scholtz", url: "/objekt-dokument/mv.pdf", kategorie: "intern" }],
      unterlagenLink: "https://ordner.example/alles",
    };
    const raus = oeffentlichesMeta(meta);
    expect(raus).not.toHaveProperty("dokumente");
    expect(raus).not.toHaveProperty("unterlagenLink");
    expect(raus).toHaveProperty("kurzbeschreibung");
    const wohnung = oeffentlicheWohnung({ id: "w7", we_nr: "7", meta, unterlagenLink: "https://ordner.example/w7", kunde_name: "Martina Brandl" });
    const text = JSON.stringify(wohnung);
    for (const verboten of ["Scholtz", "ordner.example", "/objekt-dokument/", "Martina"]) expect(text).not.toContain(verboten);
  });
});

describe("get-expose nimmt nur Schlüssel der Art Exposé", () => {
  it("akzeptiert Exposé und Zeilen vor der Migration, sonst nichts", () => {
    expect(exposeArtErlaubt("expose")).toBe(true);
    expect(exposeArtErlaubt(" expose ")).toBe(true);
    expect(exposeArtErlaubt(null)).toBe(true);
    expect(exposeArtErlaubt(undefined)).toBe(true);
    expect(exposeArtErlaubt("")).toBe(true);
    expect(exposeArtErlaubt("objektuebersicht")).toBe(false);
    expect(exposeArtErlaubt("Expose")).toBe(false);
    expect(exposeArtErlaubt(1)).toBe(false);
  });
});

describe("get-expose, was an Unterlagen hinausgeht (Quelltext)", () => {
  const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/get-expose/index.ts"), "utf8");
  const antwort = quelle.slice(quelle.indexOf("return new Response(JSON.stringify({\n      objekt:"));

  it("schickt Objekt- und Wohnungsunterlagen nur durch die Positivliste", () => {
    expect(antwort).toMatch(/dokumente: oeffentlicheUnterlagen\(\{\s*zeilen: objektZeilen,/);
    expect(antwort).toMatch(/dokumente: oeffentlicheUnterlagen\(\{\s*zeilen: w\.wohnungs_dokumente \|\| \[\],\s*metaEintraege: w\.meta\?\.dokumente,/);
    // Der alte Weg: meta.dokumente oder die Tabelle ungefiltert durchreichen.
    expect(quelle).not.toMatch(/allDokumente|metaDokumente|tableDokumente/);
  });

  it("gibt Grundrisse nur zu einem gültigen Kundenlink heraus und nur ohne Ablage", () => {
    expect(quelle).not.toContain("rohdateienNachAmpel");
    expect(quelle).toMatch(/const grundrisse = kundenlink\.art === "gueltig"\s*\? grundrisseZumLink\(\{ link: kundenlink\.bereich,[^\n]*\)\.map\(grundrissOhneAblage\)\s*: \[\];/);
    expect(antwort).toContain("...(grundrisse.length ? { grundrisse } : {})");
  });

  it("prüft bei der Aktion „datei“ erst die Anfrage, dann Objekt, Schlüssel, Liste, und signiert für 15 Minuten", () => {
    const datei = quelle.slice(quelle.indexOf("async function dateiAusliefern"), quelle.indexOf("Deno.serve("));
    const stelle = (text: string) => {
      const i = datei.indexOf(text);
      expect(i, text).toBeGreaterThan(0);
      return i;
    };
    const reihenfolge = [
      stelle("pruefeDateiAnfrage(url.searchParams)"),
      stelle("checkEdgeRateLimit("),
      stelle('.eq("sichtbar", true)'),
      stelle("pruefeKundenlink(supabase, anfrage.token, objektId"),
      stelle('if (link.art !== "gueltig")'),
      stelle("findeGrundriss(grundrisseZumLink({"),
      stelle("createSignedUrl(grundriss.ablage.pfad, DATEI_GUELTIG_SEKUNDEN)"),
    ];
    expect([...reihenfolge].sort((a, b) => a - b)).toEqual(reihenfolge);
    // Jede Antwort der Aktion geht über `jsonPrivat`, und das verbietet jede geteilte Zwischenablage.
    expect(datei).not.toContain("new Response(");
    expect(quelle.slice(quelle.indexOf("function jsonPrivat"), quelle.indexOf("async function dateiAusliefern"))).toContain('"Cache-Control": "private, no-store"');
    // Die Aktion zählt nicht und läutet keine Glocke.
    expect(datei).not.toMatch(/aufrufZaehlen|glockeLaeuten/);
    expect(quelle).toContain('if (url.searchParams.get("aktion") === "datei") return await dateiAusliefern(req, url, supabase, objektId);');
  });

  it("prüft die Art des Schlüssels, bevor Partner oder Kunde gelesen werden", () => {
    const pruefung = quelle.slice(quelle.indexOf("async function pruefeKundenlink"));
    const artStelle = pruefung.indexOf("istExposeLink(supabase, zeile.id)");
    expect(artStelle).toBeGreaterThan(0);
    expect(artStelle).toBeLessThan(pruefung.indexOf('from("kontakte")'));
    expect(artStelle).toBeLessThan(pruefung.indexOf('from("profiles")'));
  });
});
