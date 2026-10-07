import { describe, it, expect, vi, beforeAll } from "vitest";
import jsPDF from "jspdf";
import {
  ANLAGE_TITEL,
  ANLAGE_TITEL_ALT,
  VERTRAGS_FASSUNG_ALT,
  akzeptanzHinweisText,
  anlagenBereichText,
  erstelleVertragsKontext,
  hatLeadpaketAnlage,
  hatMetaPixelAnlage,
  konditionenblattZeilen,
  provisionsSaetze,
  renderAnlageNachNummer,
  renderHauptvertrag,
  vertragsAnlagen,
  vertragsFassungVon,
  type KlauselKontext,
  type KlauselTools,
} from "@/lib/vertragKlauseln";
import { getVertragsAnhaenge } from "@/lib/vertragAnhaenge";
import { vertragsKonditionenStempel, vertragsZusammenfassung } from "@/lib/vertragsZusammenfassung";
import { VERTRAGS_FASSUNG, vertragsFassungKennung } from "@/lib/vertragKonditionen";
import { berechneLeadAnzahl, getLizenzPaket, type LizenzPaketId } from "@/lib/lizenzPakete";
import type { Bewerber } from "@/lib/bewerbungStore";
import type { EinzelDokumentKey } from "@/lib/einzelDokumentePdf";

/**
 * Matrix-Test über alle Closing-Konstellationen.
 *
 * Er ist die dauerhafte Fassung des Prüfprogramms, mit dem der Vertrag im
 * September 2026 über 15 Konstellationen geprüft wurde. Teil 1 sammelt den
 * Vertragstext direkt aus den Klausel-Renderern ein (schnell, ohne PDF) und
 * prüft die Suchmuster: nirgends "150 EUR" als Monatsbetrag, nirgends "12 Monate"
 * Mindestlaufzeit (beides gibt es seit dem 07.09.2026 nicht mehr), kein volles
 * Wettbewerbsverbot in der
 * Individualfassung, kein geltendes "4 %" bei individuellen Sätzen, das
 * Anlagenverzeichnis gleich den gedruckten Anlagen, fortlaufende
 * Nummerierung, kein nachvertragliches Wettbewerbsverbot, kein Verfall von
 * Provisionen, kein einseitiges Anpassungsrecht, dafür die Eigentumsregel
 * für Kontakte. Seit der kompakten Fassung 2026-09-02 zusätzlich: Das
 * Konditionenblatt (Anlage 1) enthält alle Konditionen, Beträge und Sätze
 * stehen außerhalb des Konditionenblatts nur als Verweis, der Hauptvertrag
 * hat 14 Paragraphen. Teil 2 erzeugt für drei Konstellationen die echten
 * PDFs, vergleicht Gesamt-PDF und Einzeldokumente Absatz für Absatz und
 * zählt die Seiten. Teil 3 sichert die Altfassung für Bestandspartner.
 */

/* ── Konstellationen ──────────────────────────────────────────────────── */

const basis = (): Partial<Bewerber> => ({
  id: "muster-1",
  vorname: "Max",
  nachname: "Mustermann",
  email: "max.mustermann@example.com",
  telefon: "+49 170 0000000",
  adresse: "Musterstraße 1",
  ort: "80331 München",
  vertragsAdresse: "Musterstraße 1\n80331 München",
  rechnungsAdresse: "Mustermann Consulting GmbH\nFirmenweg 5\n80333 München",
  zahlungsweise: "einmal",
  vertragStatus: "nicht_gesendet",
});

interface Konstellation {
  id: string;
  titel: string;
  paketId: LizenzPaketId;
  felder: Partial<Bewerber>;
}

const ANDERE = "Beispiel Vertrieb GmbH\nMuster Immobilien AG";

export const KONSTELLATIONEN: Konstellation[] = [
  { id: "K01", titel: "Vertriebspartner Standard", paketId: "junior", felder: {} },
  { id: "K02", titel: "Vertriebspartner ohne Servicevereinbarung", paketId: "junior", felder: { ohneCrmGebuehr: true } },
  { id: "K03", titel: "Vertriebspartner ohne Mindestlaufzeit", paketId: "junior", felder: { laufzeitOffen: true } },
  { id: "K04", titel: "Vertriebspartner ohne Servicevereinbarung und ohne Mindestlaufzeit", paketId: "junior", felder: { ohneCrmGebuehr: true, laufzeitOffen: true } },
  { id: "K05", titel: "Vertriebspartner Individualfassung § 8 mit anderen Vertrieben", paketId: "junior", felder: { individuelleVertragsFassung: true, andereVertriebe: ANDERE } },
  { id: "K06", titel: "Vertriebspartner Lead-Satz 3 % / Eigen-Satz 5 %", paketId: "junior", felder: { satzLead: "3", satzEigen: "5" } },
  { id: "K07", titel: "Vertriebspartner Bestand 5 % / Neubau 4,5 %", paketId: "junior", felder: { satzBestand: "5", satzNeubau: "4,5" } },
  { id: "K08", titel: "Vertriebspartner einheitlich 3,5 % individuell", paketId: "junior", felder: { satzIndividuell: "3,5" } },
  { id: "K09", titel: "Vertriebspartner mit Leadpaket 2.500 € / 20 Leads", paketId: "junior", felder: { leadPaket: { betrag: 2500, anzahl: 20 } } },
  { id: "K10", titel: "Lead-Berater Standard", paketId: "lead_berater", felder: {} },
  { id: "K11", titel: "Lead-Berater mit allen Schaltern", paketId: "lead_berater", felder: { ohneCrmGebuehr: true, laufzeitOffen: true, individuelleVertragsFassung: true, andereVertriebe: ANDERE, satzIndividuell: "3,5" } },
  { id: "K12", titel: "Tippgeber 1.500 € Festbetrag", paketId: "tippgeber", felder: { tippgeberProvisionsModell: "euro", tippgeberProvisionsBetrag: "1500" } },
  // Altdaten dürfen Eigen-Satz und Bestand/Neubau zugleich tragen (das
  // Closing sperrt die Kombination nur für neue Eingaben); der Vertrag
  // druckt weiterhin alles, was gespeichert ist.
  { id: "K13", titel: "Vertriebspartner alles auf einmal", paketId: "junior", felder: { ohneCrmGebuehr: true, laufzeitOffen: true, individuelleVertragsFassung: true, andereVertriebe: ANDERE, satzLead: "3", satzEigen: "5", satzBestand: "5", satzNeubau: "4,5", leadPaket: { betrag: 5000, anzahl: 40 } } },
  { id: "K14", titel: "Bestand: Lead Partner (Altpaket, 2 Raten)", paketId: "lead", felder: { zahlungsweise: "raten_2" } },
  { id: "K15", titel: "Bestand: Partner-Vertrag 2 % Honorar (Altpaket)", paketId: "partner_2", felder: {} },
];

const bewerberVon = (k: Konstellation, extra: Partial<Bewerber> = {}): Bewerber =>
  ({ ...basis(), ...k.felder, paketwahl: k.paketId, ...extra }) as Bewerber;

/* ── Textmitschnitt aus den Renderern ─────────────────────────────────── */

interface Absatz {
  abschnitt: string;
  art: "h1" | "p" | "bullet" | "box" | "zeile";
  text: string;
}

function sammle(bewerber: Bewerber, paketId: LizenzPaketId): { ctx: KlauselKontext; absaetze: Absatz[]; anlagen: number[] } {
  const paket = getLizenzPaket(paketId)!;
  const ctx = erstelleVertragsKontext({ bewerber, paket, zahlungsweise: bewerber.zahlungsweise as "einmal" | "raten_2" });
  const absaetze: Absatz[] = [];
  let abschnitt = "Hauptvertrag";
  const tools: KlauselTools = {
    h1: (t) => absaetze.push({ abschnitt, art: "h1", text: t }),
    p: (t) => absaetze.push({ abschnitt, art: "p", text: t }),
    bullet: (items) => items.forEach((t) => absaetze.push({ abschnitt, art: "bullet", text: t })),
    spacer: () => undefined,
    ensure: () => undefined,
    infoBox: (a, b) => absaetze.push({ abschnitt, art: "box", text: `${a} | ${b}` }),
    zeile: (label, wert) => absaetze.push({ abschnitt, art: "zeile", text: `${label}: ${wert}` }),
  };
  renderHauptvertrag(tools, ctx);
  const anlagen = vertragsAnlagen(paketId, !!bewerber.individuelleVertragsFassung, hatLeadpaketAnlage(bewerber, paketId), ctx.fassung, hatMetaPixelAnlage(bewerber, paketId)).map((a) => a.nummer);
  for (const n of anlagen) {
    abschnitt = `Anlage ${n}`;
    renderAnlageNachNummer(n, tools, ctx);
  }
  return { ctx, absaetze, anlagen };
}

const text = (abs: Absatz[]) => abs.map((a) => a.text).join("\n");

/** Absätze, die eine Gebühr verneinen, zählen bei den Gebühr-Mustern nicht. */
const VERNEINT = /entfällt|nicht erhoben|nicht vereinbart|nicht gebucht|keine (?:monatliche|laufende|Mindestlaufzeit|Ratenwahl)|Keine monatliche|weder|unentgeltlich|ausdrücklich nicht|besteht nicht|keine laufenden Kosten|nicht mehr|keine Mindestlaufzeit|ohne Mindestlaufzeit|Mindestlaufzeit gilt nur|Mindestlaufzeit oder ihr Entfallen|bei vereinbarter Mindestlaufzeit|Laufzeit, Mindestlaufzeit und Kündigung gelten einheitlich/i;

/* ── Teil 1: Suchmuster über alle Konstellationen (kompakte Fassung) ──── */

const NEUE = KONSTELLATIONEN.filter((k) => ["junior", "lead_berater"].includes(k.paketId));
const ALTPAKETE = KONSTELLATIONEN.filter((k) => ["lead", "partner_2"].includes(k.paketId));

describe.each(NEUE)("Vertragsmatrix $id: $titel", (k) => {
  const bewerber = bewerberVon(k);
  const { ctx, absaetze, anlagen } = sammle(bewerber, k.paketId);
  const alles = text(absaetze);
  const ohneKonditionenblatt = text(absaetze.filter((a) => a.abschnitt !== "Anlage 1"));
  const konditionenblatt = absaetze.filter((a) => a.abschnitt === "Anlage 1");
  const ohneCrm = !!k.felder.ohneCrmGebuehr;
  const laufzeitOffen = !!k.felder.laufzeitOffen || ohneCrm;
  const indiv = !!k.felder.individuelleVertragsFassung;

  it("ist die kompakte Fassung mit 14 Paragraphen und drei bis vier Anlagen", () => {
    expect(ctx.fassung).toBe("neu");
    const pars = absaetze.filter((a) => a.abschnitt === "Hauptvertrag" && a.art === "h1" && /^§ \d/.test(a.text));
    expect(pars.map((p) => Number(p.text.match(/^§ (\d+)/)![1]))).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    // Seit dem 07.09.2026: Anlage 3 ist das Leadpaket, eine Servicevereinbarung
    // gibt es nicht mehr. Seit Fassung 2026-09-26: Anlage 4 ist das Meta Pixel.
    expect(anlagen).toEqual([1, 2, ...(hatLeadpaketAnlage(bewerber, k.paketId) ? [3] : []), 4]);
  });

  it("das Konditionenblatt enthält alle Konditionen dieser Konstellation", () => {
    const zeilen = Object.fromEntries(konditionenblattZeilen(ctx.konditionen!).map((z) => [z.label, z.wert]));
    for (const label of ["Vertriebspartner", "Rechnungsanschrift", "Paket", "Leistungen der Gesellschaft", "Laufendes Entgelt", "Laufzeit des Vertrages", "Provision", "Wettbewerb (§ 8)", "Erklärte andere Vertriebe", "Zahlungsweise", "Vertragsfassung"]) {
      expect(zeilen[label], label).toBeTruthy();
      expect(konditionenblatt.some((a) => a.art === "zeile" && a.text.startsWith(`${label}: `)), `${label} gedruckt`).toBe(true);
    }
    expect(zeilen["Vertriebspartner"]).toContain("Musterstraße 1");
    expect(zeilen["Rechnungsanschrift"]).toContain("Firmenweg 5");
    expect(zeilen["Paket"]).toBe(ctx.paket.titel);
    // Alles wird gestellt, ein laufendes Entgelt gibt es nicht; die Altwerte
    // ohneCrmGebuehr und laufzeitOffen ändern daran nichts.
    expect(zeilen["Leistungen der Gesellschaft"]).toMatch(/^Unentgeltlich: das CRM-System einschließlich aller Funktionen/);
    expect(zeilen["Laufendes Entgelt"]).toMatch(/^Keines\. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit/);
    expect(Object.keys(zeilen).some((l) => /Servicevereinbarung/.test(l))).toBe(false);
    // Der Handelsvertretervertrag hat keine Mindestlaufzeit, sondern die
    // gesetzliche Kündigungsstaffel.
    expect(zeilen["Laufzeit des Vertrages"]).toMatch(/^Unbestimmte Zeit, keine Mindestlaufzeit/);
    expect(zeilen["Laufzeit des Vertrages"]).toContain("§ 89 Absatz 1 HGB");
    // Ein einzelnes Wort, das breiter ist als die Beschriftungsspalte, bricht im
    // PDF mitten im Wort um ("Handelsvertr / etervertrages"). 20 Zeichen sind bei
    // 8,5 pt in 37 mm sicher; darüber wird es eng.
    for (const label of Object.keys(zeilen)) {
      for (const wort of label.split(/\s+/)) {
        expect(wort.length, `Beschriftung "${label}" hat ein zu langes Wort`).toBeLessThanOrEqual(20);
      }
    }
    const s = provisionsSaetze(ctx.paket, bewerber);
    if (s.hasOverride) {
      for (const eintrag of s.saetzeListe) expect(zeilen["Provision"]).toContain(eintrag);
      expect(zeilen["Rangfolge der Sätze"]).toBe(s.anwendungsregel);
    } else {
      expect(zeilen["Provision"]).toMatch(/^4 % des notariellen Kaufpreises/);
      expect(zeilen["Rangfolge der Sätze"]).toBeUndefined();
    }
    if (k.paketId === "lead_berater") expect(zeilen["Leads"]).toContain("zur Unterstützung gestellt");
    else if (bewerber.leadPaket) expect(zeilen["Leadpaket"]).toContain(`Paketpreis für ${bewerber.leadPaket.anzahl} qualifizierte Leads; die Gesellschaft setzt den Paketpreis innerhalb eines Monats`);
    else expect(zeilen["Leadpaket"]).toContain("Kein Leadpaket vereinbart");
    expect(zeilen["Wettbewerb (§ 8)"]).toMatch(indiv ? /^Individualfassung/ : /^Standardfassung/);
    if (indiv) for (const v of ANDERE.split("\n")) expect(zeilen["Erklärte andere Vertriebe"]).toContain(v);
    else expect(zeilen["Erklärte andere Vertriebe"]).toMatch(/^entfällt/);
  });

  it("nennt Beträge, Laufzeit und Sätze außerhalb des Konditionenblatts nur als Verweis", () => {
    // Serviceentgelt als Betrag, Mindestlaufzeit als Zahl, Provisionssätze als
    // geltende Prozentwerte: nur in Anlage 1. Der Leadpaket-Betrag darf in
    // der Leadpaket-Vereinbarung stehen, weil sie das Paket selbst regelt.
    for (const a of absaetze) {
      // Anlage 1 fuehrt alle Konditionen; Anlage 3 (Leadpaket) regelt ihr
      // eigenes Entgelt und darf es deshalb beziffern.
      if (a.abschnitt === "Anlage 1" || a.abschnitt === "Anlage 3") continue;
      expect(a.text, `${a.abschnitt}: ${a.text}`).not.toMatch(/\d+\s?€ (?:brutto|netto)?(?:\/| im )Monat/);
      expect(a.text, `${a.abschnitt}: ${a.text}`).not.toMatch(/Mindestlaufzeit (?:beträgt|von) \d+|\d+ Monate Mindestlaufzeit|mindestens für \d+ Monate/);
      expect(a.text, `${a.abschnitt}: ${a.text}`).not.toMatch(/\d+(?:[.,]\d+)?\s?% (?:des notariellen|auf den notariellen|Provision|Standardprovision)/);
      expect(a.text, `${a.abschnitt}: ${a.text}`).not.toMatch(/(?:Lead|Eigen)-Satz \d|Bestandsobjekte \d|Neubauobjekte \d|Einheitlicher Satz \d/);
    }
    expect(ohneKonditionenblatt).toContain("laut Anlage 1");
    expect(ohneKonditionenblatt).toContain("ausgewiesen");
  });

  it("nennt nirgends 150 EUR als laufendes Entgelt, in keiner Konstellation", () => {
    // Bis zum 06.09.2026 galt das nur ohne Servicevereinbarung. Seit dem
    // 07.09.2026 gibt es kein laufendes Entgelt mehr, also gilt es immer.
    for (const a of absaetze) {
      if (/150\s?€ (?:brutto|netto)?\/?Monat|150\s?€ brutto im Monat|CRM-Systemgebühr in Höhe|monatliche CRM-Systemgebühr (?:wird|deckt|ist)/.test(a.text) && !VERNEINT.test(a.text)) {
        expect.fail(`${a.abschnitt}: ${a.text}`);
      }
    }
    for (const z of vertragsZusammenfassung(bewerber) ?? []) expect(z.wert).not.toContain("150");
  });

  it("nennt nirgends 12 Monate Laufzeit, auch nicht 'nach Ablauf der Mindestlaufzeit'", () => {
    // Bis zum 06.09.2026 galt das nur mit dem Schalter "Ohne Mindestlaufzeit".
    // Seit dem 07.09.2026 hat die kompakte Fassung nirgends eine Mindestlaufzeit.
    for (const a of absaetze) {
      if (/nach Ablauf der Mindestlaufzeit|Mindestlaufzeit (?:beträgt|von) 12|12 Monate Mindestlaufzeit|mindestens für 12 Monate|12 Monate ab Vertragsbeginn|12 Monate/.test(a.text)) {
        expect.fail(`${a.abschnitt}: ${a.text}`);
      }
    }
    expect(vertragsZusammenfassung(bewerber)?.some((z) => /Mindestlaufzeit/.test(z.label))).toBe(false);
    // Die Altwerte der Schalter bleiben im Stempel, damit bereits erzeugte
    // Verträge nicht als veraltet gelten.
    expect(JSON.parse(vertragsKonditionenStempel(bewerber)).laufzeitOffen).toBe(laufzeitOffen);
    expect(JSON.parse(vertragsKonditionenStempel(bewerber)).ohneCrmGebuehr).toBe(ohneCrm);
  });

  it("die CRM-Nutzung hängt am Vertrag und ist unentgeltlich", () => {
    expect(alles).toContain("Die Nutzung des CRM-Systems und der übrigen Leistungen nach § 3 Absatz 1 besteht für die Dauer dieses Vertrages");
    expect(alles).toContain("sie ist unentgeltlich und kann nicht gesondert gekündigt werden");
    // Der Hauptvertrag kennt keine Mindestlaufzeit.
    expect(alles).toContain("Eine Mindestlaufzeit für diesen Vertrag besteht nicht");
    expect(alles).not.toContain("Mindestlaufzeit der CRM-Nutzung");
  });

  it("verwendet das Wort Mindestlaufzeit nur verneinend", () => {
    for (const a of absaetze) {
      if (/Mindestlaufzeit/.test(a.text) && !VERNEINT.test(a.text)) expect.fail(`${a.abschnitt}: ${a.text}`);
    }
  });

  it("nennt weder Servicevereinbarung noch Serviceentgelt noch 150 EUR brutto", () => {
    // Der Einzel-Lead zu 150 EUR netto ist etwas anderes als eine Gebühr und
    // darf bleiben; alles, was nach Monatsentgelt klingt, ist verboten.
    expect(alles).not.toMatch(/Servicevereinbarung|Serviceentgelt|CRM-Systemgebühr|CRM-Gebühr/);
    expect(alles).not.toMatch(/150\s?€ (?:brutto|netto)?(?:\/| im )Monat|150\s?€ brutto/);
    for (const z of vertragsZusammenfassung(bewerber) ?? []) expect(`${z.label}: ${z.wert}`).not.toMatch(/Servicevereinbarung|150/);
  });

  it("behauptet in der Individualfassung kein volles Wettbewerbsverbot und braucht keine Anlage 8", () => {
    if (!indiv) return;
    expect(absaetze.some((a) => a.art === "h1" && a.text.startsWith("§ 8") && a.text.includes("Individualfassung"))).toBe(true);
    for (const a of absaetze) {
      if (a.text.startsWith("§ 8") || /kein allgemeines/.test(a.text)) continue;
      if (/darf kein konkurrierendes|keine konkurrierenden Immobilienvertriebe/.test(a.text)) expect.fail(`${a.abschnitt}: ${a.text}`);
    }
    expect(anlagen).not.toContain(8);
    expect(alles).not.toContain("36 Monate");
    expect(alles).not.toContain("15.000");
    expect(alles).not.toContain("Karenzentschädigung");
  });

  it("druckt bei individuellen Sätzen jeden Satz und nirgends 4 % als geltenden Satz", () => {
    const s = provisionsSaetze(ctx.paket, bewerber);
    if (!s.hasOverride) {
      expect(alles).not.toContain("Individuell vereinbart");
      return;
    }
    for (const eintrag of s.saetzeListe) expect(alles).toContain(eintrag);
    expect(alles).toContain(s.anwendungsregel);
    for (const a of absaetze) {
      if (/Standardprovision(?: dieses Pakets)?: 4%|Einheitlich 4 %|4 % des notariellen Kaufpreises|Standardprovision: 4%/.test(a.text)) {
        expect.fail(`${a.abschnitt}: ${a.text}`);
      }
    }
    expect(vertragsZusammenfassung(bewerber)?.find((z) => z.label === "Provision")?.wert).toBe(s.effektiverSatzText);
  });

  it("Anlagenverzeichnis, § 14, Hinweiskasten und gedruckte Anlagen stimmen überein", () => {
    const liste = getVertragsAnhaenge(k.paketId, indiv, hatLeadpaketAnlage(bewerber, k.paketId), "neu", hatMetaPixelAnlage(bewerber, k.paketId)).map((x) => Number(x.match(/^Anlage (\d)/)![1]));
    // Seit Fassung 2026-09-26 gehört Anlage 4 (Meta Pixel) zu jedem neuen Vertrag.
    expect(anlagen).toContain(4);
    expect(liste).toEqual(anlagen);
    const p14 = absaetze.filter((a) => a.abschnitt === "Hauptvertrag" && a.art === "bullet" && /^Anlage \d - /.test(a.text));
    expect(p14.map((a) => Number(a.text.match(/^Anlage (\d)/)![1]))).toEqual(anlagen);
    for (const a of p14) {
      const n = Number(a.text.match(/^Anlage (\d)/)![1]);
      expect(a.text).toContain(ANLAGE_TITEL[n]);
    }
    expect(akzeptanzHinweisText(ctx)).toContain(`Anlagen ${anlagenBereichText(anlagen)} erhalten`);
    expect(alles).not.toContain("Anlage 7");
    expect(alles).not.toContain("Anlagen 1-7");
    expect(alles).not.toContain("Overhead");
    expect(alles).not.toContain("AGB");
  });

  it("nummeriert Paragraphen und Absätze fortlaufend", () => {
    const abschnitte = [...new Set(absaetze.map((a) => a.abschnitt))];
    for (const ab of abschnitte) {
      const eigene = absaetze.filter((a) => a.abschnitt === ab);
      const pars = eigene.filter((a) => a.art === "h1" && /^§ \d/.test(a.text)).map((a) => a.text);
      const nums = pars.map((p) => p.match(/^§ (\d+)([a-z]?)/)!).map((m) => `${m[1]}${m[2]}`);
      expect(new Set(nums).size, `${ab}: doppelte Paragraphen in ${nums.join(", ")}`).toBe(nums.length);
      const haupt = [...new Set(nums.map((n) => parseInt(n, 10)))];
      for (let i = 1; i < haupt.length; i++) expect(haupt[i], `${ab}: Lücke nach § ${haupt[i - 1]}`).toBe(haupt[i - 1] + 1);
      let aktuell = "";
      let letzte = 0;
      for (const a of eigene) {
        if (a.art === "h1") { aktuell = a.text; letzte = 0; continue; }
        const m = a.art === "p" ? a.text.match(/^\((\d+)(?:[a-z]|\.\d)?\)/) : null;
        if (!m) continue;
        const n = Number(m[1]);
        expect(n === letzte || n === letzte + 1, `${ab} ${aktuell}: Absatz (${n}) nach (${letzte})`).toBe(true);
        letzte = n;
      }
    }
  });

  it("verwendet dieselbe Kontakt-Definition und dieselbe Ersatzlead-Regel überall", () => {
    expect(alles).not.toContain("unabhängig von ihrer Herkunft");
    expect(alles).toContain("manuell oder per Datei-Import (CSV)");
    expect(alles).not.toContain("bloße Nichterreichbarkeit");
    expect(alles).toContain("mindestens 10 dokumentierter Kontaktversuche über mindestens 2 Kanäle innerhalb von 14 Tagen");
    expect(alles).not.toContain("Meta-Werbekampagnen");
  });

  it("kennt nach Vertragsende kein Wettbewerbsverbot, nur Eigentum an Kontakten und Datenschutz", () => {
    expect(alles).not.toContain("§ 90a");
    // Das Wort darf vorkommen, aber nur verneinend: § 7 Absatz 9 sagt
    // ausdrücklich, dass keine Kundenschutz- oder Wettbewerbsabrede vereinbart
    // wird. Genau diese Klarstellung nimmt einem Gericht das Argument des § 90a.
    for (const a of absaetze) {
      if (!a.text.includes("Wettbewerbsabrede")) continue;
      expect(a.text, `${a.abschnitt}: ${a.text}`).toMatch(/wird nicht vereinbart/);
    }
    expect(alles).not.toContain("Entschädigung");
    const treffer = alles.match(/nachvertragliche[sn]? Wettbewerbsverbot/g) ?? [];
    const verneint = alles.match(/kein nachvertragliches Wettbewerbsverbot/g) ?? [];
    expect(treffer.length).toBeGreaterThan(0);
    expect(treffer.length).toBe(verneint.length);
    for (const a of absaetze) {
      if (/Monaten? nach Vertragsende/.test(a.text) && /abwerben|abzuwerben|kontaktieren/.test(a.text)) expect.fail(`${a.abschnitt}: ${a.text}`);
    }
    expect(alles).toContain("Eigenkontakte sind und bleiben Eigentum des Vertriebspartners, auch nach Vertragsende.");
    expect(alles).toContain("Eigentum und Geschäftsgeheimnis der Gesellschaft im Sinne des § 90 HGB und des GeschGehG");
    expect(alles).toContain("Für seine Eigenkontakte (§ 7 Absatz 3 des Hauptvertrages) ist der Vertriebspartner selbst Verantwortlicher");
    const z = vertragsZusammenfassung(bewerber) ?? [];
    expect(z.find((x) => x.label === "Kontakte")?.wert).toContain("Eigenkontakte bleiben Eigentum des Partners");
    expect(z.find((x) => x.label === "Wettbewerbsverbot")?.wert).not.toContain("nach Vertragsende gilt");
  });

  it("kennt keinen Verfall von Provisionen und kein Anpassungsrecht, auch kein redaktionelles", () => {
    expect(alles).not.toMatch(/Verfall|verfallen/);
    expect(alles).not.toContain("Anpassungsrecht");
    expect(alles).not.toMatch(/Provisionsordnung/);
    expect(alles).not.toContain("redaktionelle, klarstellende oder zwingend gesetzlich");
    expect(alles).toContain("verjähren nach den gesetzlichen Vorschriften");
    expect(alles).toContain("Eine einseitige Änderung durch die Gesellschaft ist ausgeschlossen, auch für redaktionelle oder klarstellende Anpassungen.");
  });

  it("Hamburger Brauch und Haftung bleiben inhaltlich unverändert", () => {
    expect(alles).toContain("nach billigem Ermessen (§ 315 BGB)");
    expect(alles).toMatch(/höchstens 25\.000\s?€ je Verstoß/);
    expect(alles).toMatch(/höchstens 50\.000\s?€ je Verstoß/);
    expect(alles).toContain("Im Übrigen ist die Haftung der Gesellschaft bei einfacher Fahrlässigkeit ausgeschlossen. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.");
    expect(alles).not.toContain("Im Übrigen ist die Haftung der Gesellschaft ausgeschlossen.");
  });

  it("nennt keine falschen Anlagentitel und keine Nullraten", () => {
    expect(alles).not.toContain("Onboardinggebühr-Paket");
    expect(alles).not.toContain("Rate 1 von 1: 0");
    expect(alles).not.toContain("Honorarvereinbarung");
    expect(alles).not.toContain("§ 9e");
    expect(alles).not.toContain("§ 18");
  });
});

describe("Vertragsmatrix K12: Tippgeber", () => {
  it("Zusammenfassung ohne Gebühr, Verzeichnis mit zwei Anlagen", () => {
    const k = KONSTELLATIONEN.find((x) => x.id === "K12")!;
    const z = vertragsZusammenfassung(bewerberVon(k));
    expect(z?.find((x) => x.label === "Laufendes Entgelt")?.wert).toBe("Keines. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit");
    expect(z?.find((x) => x.label === "Servicevereinbarung")).toBeUndefined();
    expect(getVertragsAnhaenge("tippgeber")).toHaveLength(2);
  });
});

/* ── Stichtag: ab dem 10.09.2026 immer die aktuelle Fassung ───────────── */

describe("Ab dem Stichtag gilt immer die aktuelle Vertragsfassung", () => {
  /*
   * Der Statusweg war fuer die Umstellungszeit gedacht: Wer schon einen alten
   * Vertrag verschickt bekommen hatte, sollte bei einer Neuerstellung nicht
   * ploetzlich einen anderen Text bekommen. Er hat aber einmal zugeschlagen,
   * wo er nicht sollte, naemlich bei einem Bewerber mit gesetztem Status ohne
   * gespeicherte Kennung. Seit dem 10.09.2026 entscheidet zuerst das
   * Anlagedatum.
   */
  const mitStatus = { vertragStatus: "gesendet" as const, paketwahl: "junior" as const, vertragFassung: "" };

  it("gibt einem ab dem Stichtag angelegten Bewerber die neue Fassung, trotz Status", () => {
    expect(vertragsFassungVon({ ...mitStatus, erstelltAm: "2026-09-10T08:00:00Z" })).toBe("neu");
    expect(vertragsFassungVon({ ...mitStatus, erstelltAm: "2026-11-01T12:00:00Z" })).toBe("neu");
    expect(vertragsFassungKennung({ ...mitStatus, erstelltAm: "2026-09-10T08:00:00Z" })).toBe(VERTRAGS_FASSUNG);
  });

  it("laesst Bestandsfaelle von vor dem Stichtag unveraendert", () => {
    expect(vertragsFassungVon({ ...mitStatus, erstelltAm: "2026-09-09T23:59:00Z" })).toBe("alt");
    // Ohne Anlagedatum bleibt es beim bisherigen Verhalten.
    expect(vertragsFassungVon(mitStatus)).toBe("alt");
  });

  it("aendert nichts an den Altpaketen, die immer die Altfassung bekommen", () => {
    expect(
      vertragsFassungVon({ ...mitStatus, paketwahl: "team_builder", erstelltAm: "2026-12-01T00:00:00Z" }),
    ).toBe("alt");
  });

  it("laesst ein gespeichertes Kennzeichen weiterhin vorgehen", () => {
    expect(
      vertragsFassungVon({ ...mitStatus, vertragFassung: VERTRAGS_FASSUNG_ALT, erstelltAm: "2026-12-01T00:00:00Z" }),
    ).toBe("alt");
  });
});

/* ── Teil 3: Altfassung für Bestandspartner und Altpakete ─────────────── */

describe.each([...ALTPAKETE, ...NEUE.filter((k) => ["K01", "K05", "K09", "K13"].includes(k.id))])("Altfassung $id: $titel", (k) => {
  // Bestandspartner: gesendeter Vertrag ohne Kennzeichen. Altpakete sind
  // ohnehin immer Altfassung.
  const bewerber = bewerberVon(k, { vertragStatus: "gesendet" });
  const { ctx, absaetze, anlagen } = sammle(bewerber, k.paketId);
  const alles = text(absaetze);

  it("bleibt beim langen Text mit § 18 und den alten Anlagen", () => {
    expect(ctx.fassung).toBe("alt");
    expect(vertragsFassungVon(bewerber)).toBe("alt");
    expect(alles).toContain("§ 18 Vertragsbestandteile & Akzeptanz der Anlagen");
    expect(alles).toContain("§ 9a Kunden-, Lead- und Herkunftsschutz");
    expect(anlagen.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    if (bewerber.individuelleVertragsFassung && ["junior", "lead_berater"].includes(k.paketId)) expect(anlagen).toContain(8);
    if (bewerber.leadPaket && k.paketId === "junior") expect(anlagen).toContain(9);
    const liste = getVertragsAnhaenge(k.paketId, !!bewerber.individuelleVertragsFassung, !!bewerber.leadPaket, "alt").map((x) => Number(x.match(/^Anlage (\d)/)![1]));
    expect(liste).toEqual(anlagen);
    const p18 = absaetze.filter((a) => a.abschnitt === "Hauptvertrag" && a.art === "bullet" && /^Anlage \d - /.test(a.text));
    expect(p18.map((a) => Number(a.text.match(/^Anlage (\d)/)![1]))).toEqual(anlagen);
    for (const a of p18) {
      const n = Number(a.text.match(/^Anlage (\d)/)![1]);
      const titel = n === 2 && ctx.paket.partnerHonorar ? "Honorarvereinbarung" : ANLAGE_TITEL_ALT[n];
      expect(a.text).toContain(titel);
    }
    expect(akzeptanzHinweisText(ctx)).toContain(`Anlagen ${anlagenBereichText(anlagen)} erhalten`);
  });

  it("die Zusammenfassung nennt die alten Paragraphen und Anlage 9", () => {
    const z = vertragsZusammenfassung(bewerber) ?? [];
    if (!ctx.paket.istTippgeber) expect(z.find((x) => x.label === "Kontakte")?.wert).toContain("(§ 9a)");
    if (bewerber.leadPaket && k.paketId === "junior") expect(z.find((x) => x.label === "Leadpaket")?.wert).toContain("Anlage 9");
  });

  it("das Kennzeichen der Altfassung wirkt auch ohne Versandstatus", () => {
    const mitKennzeichen = bewerberVon(k, { vertragStatus: "nicht_gesendet", vertragFassung: VERTRAGS_FASSUNG_ALT });
    expect(vertragsFassungVon(mitKennzeichen)).toBe("alt");
  });
});

/* ── Teil 2: Gesamt-PDF und Einzeldokumente wortgleich, Seitenzahl ─────── */

interface Mitschnitt { name: string; paras: string[]; pages: number }
let aktuell: Mitschnitt | null = null;
let letzterSplit: { input: string; lines: string[]; idx: number } | null = null;

/**
 * jsPDF.text und jsPDF.output werden pro Instanz angelegt; über das
 * "initialized"-Ereignis wird jede Instanz umhüllt. splitTextToSize hängt am
 * Prototyp. So bleibt jeder Absatz als Einheit erhalten, ohne das PDF
 * zurückzulesen, und die Seitenzahl ist bekannt.
 */
function jsPdfMitschnittAktivieren() {
  const API = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const origSplit = API.splitTextToSize as (this: unknown, t: unknown, m: number, o?: unknown) => string[];
  API.splitTextToSize = function (this: unknown, t: unknown, m: number, o?: unknown) {
    const lines = origSplit.call(this, t, m, o);
    if (typeof t === "string") letzterSplit = { input: t, lines: Array.isArray(lines) ? [...lines] : [String(lines)], idx: 0 };
    return lines;
  };
  (API.events as unknown[]).push([
    "initialized",
    function (this: { text: (...a: unknown[]) => unknown; output: (...a: unknown[]) => unknown; internal: { getNumberOfPages: () => number } }) {
      const origText = this.text;
      const origOutput = this.output;
      this.text = function (this: unknown, t: unknown, ...rest: unknown[]) {
        if (aktuell) {
          if (Array.isArray(t)) {
            if (letzterSplit && letzterSplit.lines.join("\n") === t.join("\n")) { aktuell.paras.push(letzterSplit.input); letzterSplit = null; }
          } else if (typeof t === "string" && letzterSplit && letzterSplit.idx < letzterSplit.lines.length && letzterSplit.lines[letzterSplit.idx] === t) {
            if (letzterSplit.idx === 0) aktuell.paras.push(letzterSplit.input);
            letzterSplit.idx += 1;
            if (letzterSplit.idx >= letzterSplit.lines.length) letzterSplit = null;
          }
        }
        return origText.call(this, t, ...rest);
      };
      this.output = function (this: { internal: { getNumberOfPages: () => number } }, ...args: unknown[]) {
        if (aktuell) aktuell.pages = this.internal.getNumberOfPages();
        return origOutput.call(this, ...args);
      };
    },
  ]);
}

async function mitschnitt(name: string, fn: () => Promise<unknown>): Promise<Mitschnitt> {
  aktuell = { name, paras: [], pages: 0 };
  letzterSplit = null;
  await fn();
  const m = aktuell;
  aktuell = null;
  return m;
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim();
/** Parteienblock, Stand-Zeile und Hinweise gehören zum Rahmen, nicht zum Vertragstext. */
const RAHMEN = /^(Handelsvertretervertrag$|Vertriebspartner Kapitalanlageimmobilien|Stand: |Einzelunternehmen|Am Ostbahnhof|Inhaber:|Musterstraße|80331|max\.mustermann|Tel\.:|- nachfolgend|Mit Unterzeichnung dieses Hauptvertrages|Ort, Datum)/;

/**
 * Seiten je Konstellation, Deckblatt mitgezählt; K13 ist der Maximalfall.
 *
 * Mit der Fassung 2026-09-04 kommt die Servicevereinbarung als eigene Anlage
 * dazu, § 3 trennt unentgeltliche Grundleistungen von Zusatzleistungen und
 * § 12 bildet die Kündigungsstaffel des § 89 HGB ab. Zusammen zwei Seiten mehr.
 *
 * Mit der Fassung 2026-09-04 ist der Vertrag um drei Seiten gewachsen: § 1
 * bekam die Abgrenzung der erlaubnisfreien Tippgebertätigkeit und die
 * Nachweispflicht (Absätze 3 bis 3d), § 4 die abschlussbezogene Abrechnung
 * und das Eigengeschäft (3, 3a, 3b, 4a), § 5 das Nutzungsentgelt und die
 * Reichweite (4, 5) und § 7 die Trennung eigener Kunden von Leads der
 * Gesellschaft (8a, 8b). Die Schranke bleibt: Sie soll Aufblähung fangen,
 * nicht gewollte Klauseln verhindern.
 */
const SEITEN_MAX = 18;

describe(`Vertrag und Anlagen sind eigenständige Dokumente, höchstens ${SEITEN_MAX} Seiten`, () => {
  beforeAll(() => {
    jsPdfMitschnittAktivieren();
    // Keine Schrift- und Logodateien im Test: jsPDF fällt still auf Helvetica zurück.
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }));
  });

  it.each(["K01", "K05", "K13"])("%s", async (id) => {
    const k = KONSTELLATIONEN.find((x) => x.id === id)!;
    const bewerber = bewerberVon(k);
    const { buildVertragPdf } = await import("@/lib/vertragGenerator");
    const { buildEinzelDokumentPdf } = await import("@/lib/einzelDokumentePdf");

    // Seit dem 04.09.2026 enthält das Vertrags-PDF nur noch den Hauptvertrag.
    // Vorher hingen alle Anlagen hinten dran, und in der Akte zeigte jeder
    // Anlagenname auf dieselbe Datei.
    const gesamt = await mitschnitt("gesamt", () =>
      buildVertragPdf({ bewerber, paketId: k.paketId, zahlungsweise: "einmal", hrName: "Christian Peetz", version: 1 }),
    );
    expect(gesamt.pages, `${id}: Seiten`).toBeLessThanOrEqual(SEITEN_MAX);
    const gesamtText = gesamt.paras.join("\n");
    // Der Akzeptanzhinweis steht am Anfang jeder Anlage; im Hauptvertrag darf
    // er deshalb nicht mehr vorkommen.
    expect(gesamtText, `${id}: Anlagen im Hauptvertrag`).not.toContain("Diese Anlage ist verbindlicher Bestandteil");
    // Und keine Anlagenüberschrift.
    expect(gesamtText).not.toContain("Vereinbarte Konditionen");
    expect(gesamtText).not.toContain("Teil II: Verschwiegenheitserklärung");
    // Das Anlagenverzeichnis bleibt: Die Anlagen sind Vertragsbestandteil.
    const verzeichnis = vertragsAnlagen(k.paketId, !!bewerber.individuelleVertragsFassung, hatLeadpaketAnlage(bewerber, k.paketId), "neu");
    const anlagen = verzeichnis.map((a) => a.nummer);
    for (const n of anlagen) expect(gesamtText, `${id}: Verzeichnis Anlage ${n}`).toContain(`Anlage ${n} - `);

    // Jede Anlage ist ein eigenes Dokument mit eigenem Inhalt.
    const gesehen = new Set<string>();
    for (const n of anlagen) {
      const einzel = await mitschnitt(`anlage_${n}`, () =>
        buildEinzelDokumentPdf(`anlage_${n}` as EinzelDokumentKey, { bewerber, paketId: k.paketId, zahlungsweise: "einmal" }));
      const text = einzel.paras.map(norm).filter((t) => !RAHMEN.test(t)).join("\n");
      expect(text.length, `${id}: Anlage ${n} leer`).toBeGreaterThan(200);
      // Kein Dokument gleicht einem anderen: Genau das war der Fehler.
      expect(gesehen.has(text), `${id}: Anlage ${n} gleicht einer anderen`).toBe(false);
      gesehen.add(text);
      // Und keine Anlage enthält den Hauptvertrag.
      expect(text, `${id}: Anlage ${n} enthält den Hauptvertrag`).not.toContain("Vertragsgegenstand und Stellung des Vertriebspartners");
      // Jede Anlage beginnt mit einem Deckblatt. Sein Titel ist der volle Titel
      // aus dem Anlagenverzeichnis des Vertrages, nicht aus einer zweiten
      // Liste: Ein Deckblatt mit anderer Nummer oder anderem Titel als das
      // Verzeichnis in § 14 wäre schlimmer als gar kein Deckblatt.
      // (Die Kennung "ANLAGE n" wird ohne Zeilenumbruch gesetzt und taucht im
      // Mitschnitt deshalb nicht auf; sie stammt im Code aus derselben Nummer.)
      const vollerTitel = verzeichnis.find((a) => a.nummer === n)!.titel;
      expect(norm(einzel.paras[0] || ""), `${id}: Deckblatt der Anlage ${n}`).toBe(norm(vollerTitel));
      expect(norm(einzel.paras[1] || ""), `${id}: Zuordnung auf dem Deckblatt der Anlage ${n}`)
        .toContain("Anlage zum Handelsvertretervertrag zwischen");
    }

    // Der Hauptvertrag als Einzeldokument ist inhaltsgleich mit dem Gesamt-PDF.
    const hv = await mitschnitt("vertrag", () => buildEinzelDokumentPdf("vertrag", { bewerber, paketId: k.paketId, zahlungsweise: "einmal" }));
    const g = new Set(gesamt.paras.map(norm).filter((t) => !RAHMEN.test(t)));
    const e = new Set(hv.paras.map(norm).filter((t) => !RAHMEN.test(t)));
    expect([...g].filter((t) => !e.has(t)), `${id}: nur im Gesamt-PDF`).toEqual([]);
    expect([...e].filter((t) => !g.has(t)), `${id}: nur im Einzeldokument`).toEqual([]);

    // Das Konditionenblatt bleibt kurz; K05 und K13 brauchen zwei Seiten.
    // Seit dem 04.09.2026 beginnt jedes Dokument mit einem Deckblatt, das zählt
    // hier nicht als Inhaltsseite.
    const blattMax = id === "K13" || id === "K05" ? 2 : 1;
    const blatt = await mitschnitt("anlage_1", () => buildEinzelDokumentPdf("anlage_1", { bewerber, paketId: k.paketId, zahlungsweise: "einmal" }));
    expect(blatt.pages - 1, `${id}: Konditionenblatt`).toBeLessThanOrEqual(blattMax);
    // Nie die Rechnungsadresse als Vertragspartei.
    const parteien = gesamt.paras.slice(0, gesamt.paras.findIndex((t) => t.startsWith("(1) Die Gesellschaft vertreibt")));
    expect(parteien.join("\n")).toContain("Musterstraße 1");
    expect(parteien.join("\n")).not.toContain("Firmenweg 5");
    expect(gesamtText).not.toContain("Firmenweg 5");
  }, 120_000);

  it("Altfassung K01 (gesendet): Hauptvertrag ohne Anlagen, Anlagen einzeln", async () => {
    // Die Trennung gilt auch für Bestandspartner der Altfassung: Sie bekommen
    // weiter den langen Text, aber ebenfalls als getrennte Dokumente.
    const k = KONSTELLATIONEN.find((x) => x.id === "K01")!;
    const bewerber = bewerberVon(k, { vertragStatus: "gesendet" });
    const { buildVertragPdf } = await import("@/lib/vertragGenerator");
    const { buildEinzelDokumentPdf } = await import("@/lib/einzelDokumentePdf");
    const gesamt = await mitschnitt("gesamt", () =>
      buildVertragPdf({ bewerber, paketId: k.paketId, zahlungsweise: "einmal", hrName: "Christian Peetz", version: 1 }),
    );
    const gesamtText = gesamt.paras.join("\n");
    expect(gesamtText).not.toContain("Diese Anlage ist verbindlicher Bestandteil");
    // Der lange Hauptvertrag der Altfassung ist erkennbar.
    expect(gesamtText).toContain("§ 84 ff. HGB");
    // Und die Anlagen kommen einzeln, mit dem Text der Altfassung.
    const einzel = await mitschnitt("anlage_1", () => buildEinzelDokumentPdf("anlage_1", { bewerber, paketId: k.paketId, zahlungsweise: "einmal" }));
    expect(einzel.paras.join("\n")).toContain("(1) Diese AGB gelten für sämtliche Geschäftsbeziehungen");
    expect(einzel.paras.join("\n")).not.toContain("§ 84 ff. HGB");

    // Auch Bestandspartner bekommen Deckblätter: Jede Anlage der langen
    // Fassung beginnt mit einem, und sein Titel stammt aus dem Verzeichnis
    // dieser Fassung. Ohne diese Prüfung säße die Altfassung weiter ohne
    // Deckblatt da, während die kompakte Fassung eines hat.
    const verzeichnisAlt = vertragsAnlagen(k.paketId, !!bewerber.individuelleVertragsFassung, hatLeadpaketAnlage(bewerber, k.paketId), "alt");
    expect(verzeichnisAlt.length).toBeGreaterThanOrEqual(6);
    for (const a of verzeichnisAlt) {
      const dok = await mitschnitt(`anlage_${a.nummer}`, () =>
        buildEinzelDokumentPdf(`anlage_${a.nummer}` as EinzelDokumentKey, { bewerber, paketId: k.paketId, zahlungsweise: "einmal" }));
      expect(norm(dok.paras[0] || ""), `Altfassung: Deckblatt der Anlage ${a.nummer}`).toBe(norm(a.titel));
      expect(norm(dok.paras[1] || ""), `Altfassung: Zuordnung der Anlage ${a.nummer}`)
        .toContain("Anlage zum Handelsvertretervertrag zwischen");
    }

    // Und der Hauptvertrag als Einzeldokument ebenfalls: Er wird beim
    // Unterschreiben gebaut, nicht die Gesamtdatei.
    const hvAlt = await mitschnitt("vertrag", () => buildEinzelDokumentPdf("vertrag", { bewerber, paketId: k.paketId, zahlungsweise: "einmal" }));
    expect(norm(hvAlt.paras[0] || ""), "Altfassung: Deckblatt des Hauptvertrags").toBe("Handelsvertretervertrag");
  }, 180_000);
});

/* ── Teil 4: Closing-Formularwerte zu Vertragskontext ─────────────────── */

/**
 * Der Reiter Closing (handlePaketBestaetigen in ClosingTab.tsx) speichert
 * seine Formularwerte in die Bewerber-Felder und reicht dasselbe Objekt an
 * buildVertragPdf und an den Konditionen-Stempel. Hier steht eine volle
 * Konstellation, wie sie das Formular baut, und geprüft wird, dass jede
 * Wahl eins zu eins im Vertragskontext, im Konditionenblatt, in der
 * Zusammenfassung und im Stempel ankommt.
 */
describe("Closing-Formularwerte zu Vertragskontext (volle Konstellation)", () => {
  const leadBetrag = 3000;
  const leadAnzahl = berechneLeadAnzahl(leadBetrag);
  // Genau die Felder, die das Closing-Formular in die Speicherung und ins PDF gibt.
  const ausClosing = (): Bewerber =>
    ({
      ...basis(),
      paketwahl: "junior",
      zahlungsweise: "einmal",
      closingEntscheidung: "ja",
      vertragsAdresse: "Max Mustermann\nMusterstraße 1\n80331 München",
      rechnungsAdresse: "Mustermann Consulting GmbH\nFirmenweg 5\n80333 München\nUSt-IdNr.: DE123456789",
      satzIndividuell: "",
      satzLead: "3",
      satzEigen: "5",
      satzBestand: "",
      satzNeubau: "",
      ohneCrmGebuehr: false,
      laufzeitOffen: true,
      individuelleVertragsFassung: true,
      andereVertriebe: ANDERE,
      leadPaket: { betrag: leadBetrag, anzahl: leadAnzahl },
    }) as Bewerber;

  it("Vertragskontext trägt Paket, Schalter, Sätze, Leadpaket, Fassung und beide Adressen", () => {
    const bewerber = ausClosing();
    const ctx = erstelleVertragsKontext({
      bewerber, paket: getLizenzPaket("junior")!, zahlungsweise: "einmal", saetze: { lead: 3, eigen: 5 },
    });
    const k = ctx.konditionen!;
    expect(ctx.fassung).toBe("neu");
    expect(k.paketId).toBe("junior");
    expect(k.zahlungsweise).toBe("einmal");
    // Kein laufendes Entgelt in der kompakten Fassung; der Altwert
    // laufzeitOffen wird nur für den Stempel weitergeführt.
    expect(k.hasCrmGebuehr).toBe(false);
    expect(k.crmGebuehrMonatlich).toBe(0);
    expect(k.crmGebuehrErlassen).toBe(false);
    expect(k.laufzeitOffen).toBe(true);
    expect(k.mindestlaufzeitMonate).toBe(0);
    expect(k.hasOverride).toBe(true);
    expect(k.saetze).toEqual({ individuell: null, lead: 3, eigen: 5, bestand: null, neubau: null });
    expect(k.leadModell).toBe("leadpaket");
    expect(k.leadPaket).toEqual({ betrag: leadBetrag, anzahl: leadAnzahl });
    expect(k.wettbewerbsfassung).toBe("individuell");
    expect(k.andereVertriebe).toEqual(ANDERE.split("\n"));
    expect(k.vertragsAnschrift).toEqual(["Max Mustermann", "Musterstraße 1", "80331 München"]);
    expect(k.rechnungsAnschrift).toContain("USt-IdNr.: DE123456789");
    expect(vertragsFassungKennung(bewerber, "junior")).toContain(VERTRAGS_FASSUNG);
  });

  it("Konditionenblatt und Zusammenfassung zeigen jede Wahl aus dem Closing", () => {
    const bewerber = ausClosing();
    const ctx = erstelleVertragsKontext({ bewerber, paket: getLizenzPaket("junior")!, zahlungsweise: "einmal" });
    const zeilen = Object.fromEntries(konditionenblattZeilen(ctx.konditionen!).map((z) => [z.label, z.wert]));
    expect(zeilen["Paket"]).toBe("Vertriebspartner");
    expect(zeilen["Laufendes Entgelt"]).toMatch(/^Keines\./);
    expect(zeilen["Laufzeit des Vertrages"]).toContain("keine Mindestlaufzeit");
    expect(zeilen["Provision"]).toContain("Lead-Satz 3%");
    expect(zeilen["Provision"]).toContain("Eigen-Satz 5%");
    expect(zeilen["Rangfolge der Sätze"]).toContain("Der Lead-Satz gilt");
    expect(zeilen["Leadpaket"]).toContain(`Paketpreis für ${leadAnzahl} qualifizierte Leads`);
    expect(zeilen["Wettbewerb (§ 8)"]).toMatch(/^Individualfassung/);
    for (const v of ANDERE.split("\n")) expect(zeilen["Erklärte andere Vertriebe"]).toContain(v);
    expect(zeilen["Rechnungsanschrift"]).toContain("DE123456789");
    // Das Leadpaket ist Anlage 3.
    expect(zeilen["Vertragsfassung"]).toContain("Anlage 3");

    const z = Object.fromEntries((vertragsZusammenfassung(bewerber) ?? []).map((x) => [x.label, x]));
    expect(z["Laufendes Entgelt"].wert).toMatch(/^Keines/);
    expect(z["Mindestlaufzeit Servicevereinbarung"]).toBeUndefined();
    expect(z["Provision"].wert).toContain("Lead-Satz 3%");
    expect(z["Leadpaket"].individuell).toBe(true);
    expect(z["Wettbewerbsverbot"].wert).toContain("Gelockert");
    for (const v of ANDERE.split("\n")) expect(z["Wettbewerbsverbot"].wert).toContain(v);
  });

  it("der Konditionen-Stempel hält jede Wahl fest und ändert sich mit jedem Schalter", () => {
    const bewerber = ausClosing();
    const stempel = JSON.parse(vertragsKonditionenStempel(bewerber));
    expect(stempel).toEqual({
      paket: "junior",
      zahlungsweise: "einmal",
      saetze: ["", "3", "5", "", ""],
      ohneCrmGebuehr: false,
      laufzeitOffen: true,
      individuelleFassung: true,
      andereVertriebe: ANDERE,
      leadPaket: [leadBetrag, leadAnzahl],
      // Seit dem 04.09.2026 im Stempel: die Closing-Auswahl "Leads einzeln".
      // Hier false, weil ein Leadpaket gebucht ist; beides schließt sich aus.
      leadEinzelkauf: false,
    });
    const basisStempel = vertragsKonditionenStempel(bewerber);
    const varianten: Partial<Bewerber>[] = [
      { laufzeitOffen: false },
      { ohneCrmGebuehr: true },
      { individuelleVertragsFassung: false },
      { andereVertriebe: "Nur eine GmbH" },
      { satzLead: "3,5" },
      { leadPaket: undefined },
      { leadPaket: undefined, leadEinzelkauf: true },
      { paketwahl: "lead_berater" },
    ];
    for (const v of varianten) {
      expect(vertragsKonditionenStempel({ ...bewerber, ...v } as Bewerber), JSON.stringify(v)).not.toBe(basisStempel);
    }
  });

  it("Tippgeber aus dem Closing: Vergütung landet in Zusammenfassung und Stempel", () => {
    const bewerber = {
      ...basis(), paketwahl: "tippgeber", closingEntscheidung: "ja",
      tippgeberProvisionsModell: "prozent", tippgeberProvisionsBetrag: "1,5",
    } as Bewerber;
    const z = Object.fromEntries((vertragsZusammenfassung(bewerber) ?? []).map((x) => [x.label, x.wert]));
    expect(z["Vergütung"]).toBe("1,5 % vom Kaufpreis pro vermitteltem Abschluss");
    expect(JSON.parse(vertragsKonditionenStempel(bewerber)).tippgeber).toEqual(["prozent", "1,5"]);
    expect(vertragsKonditionenStempel({ ...bewerber, tippgeberProvisionsBetrag: "2" } as Bewerber))
      .not.toBe(vertragsKonditionenStempel(bewerber));
  });
});
