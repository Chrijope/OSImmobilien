import { describe, it, expect } from "vitest";
import {
  ANLAGE_TITEL,
  LEADPAKET_ANLAGE_NUMMER,
  LEADPAKET_ANLAGE_TITEL,
  LEAD_KLAUSELN,
  LEAD_QUALITAETSZUSAGE,
  GESTELLTE_ZUSATZLEISTUNGEN,
  leadKlauselnFuerVertrag,
  VERTRAGS_FASSUNG_ALT,
  anlageVollTitel,
  erstelleVertragsKontext,
  vertragsAnlagenAusKontext,
  featuresMitProvisionsSaetzen,
  hatLeadpaketAnlage,
  hatMetaPixelAnlage,
  akzeptanzHinweisText,
  konditionenAus,
  paketMitAltfassungsGebuehr,
  konditionenblattZeilen,
  paketMitVertragsSchaltern,
  provisionsSaetze,
  renderAnlageNachNummer,
  renderHauptvertrag,
  renderLeadpaketAnlage,
  leadpaketPreisJeLead,
  vertragLaufzeitOffen,
  vertragsAnlagen,
  vertragsFassungKennung,
  vertragsFassungVon,
  VERTRAGS_FASSUNG,
  type KlauselTools,
} from "@/lib/vertragKlauseln";
import { getVertragsAnhaenge } from "@/lib/vertragAnhaenge";
import { ANLAGE_4_BETROFFENEN_TEXT, ANLAGE_4_PARAGRAPHEN, ANLAGE_4_TITEL } from "@/lib/vertragAnlage4";
import { formatPreis, getLizenzPaket, LEAD_EINZELPREIS, LEADPAKET_ZEILE_BIS_2026_09_28, OVERHEAD_AKTIV, PAKETE_MIT_VERTRAGSSCHALTERN } from "@/lib/lizenzPakete";
import { fassungHatPaketpreisRegel } from "@/lib/vertragKonditionen";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Die Klausel-Renderer sind reine Funktionen über Zeichenwerkzeuge. Hier
 * fangen Attrappen-Werkzeuge jeden Text ab, so lassen sich die Inhalte der
 * kompakten Fassung (14 Paragraphen, Konditionenblatt, AVV, Leadpaket) und
 * die Weiche zur Altfassung ohne PDF-Erzeugung prüfen.
 */

function makeCapture() {
  const texte: string[] = [];
  const tools: KlauselTools = {
    h1: (t) => { texte.push(t); },
    p: (t) => { texte.push(t); },
    bullet: (items) => { texte.push(...items); },
    spacer: () => { /* nichts */ },
    ensure: () => { /* nichts */ },
    infoBox: (titel, untertitel) => { texte.push(titel, untertitel); },
    zeile: (label, wert) => { texte.push(`${label}: ${wert}`); },
  };
  return { texte, tools };
}

const bewerberStub = (extra: Partial<Bewerber> = {}): Bewerber =>
  ({ vorname: "Max", nachname: "Mustermann", ...extra }) as unknown as Bewerber;

const junior = getLizenzPaket("junior")!;
const leadBerater = getLizenzPaket("lead_berater")!;

/** Hauptvertrag als Text, mit dem echten Kontext wie in den PDF-Erzeugern. */
function hauptvertrag(bewerber: Bewerber, paket = junior): string {
  const { texte, tools } = makeCapture();
  renderHauptvertrag(tools, erstelleVertragsKontext({ bewerber, paket }));
  return texte.join("\n");
}

function anlage(nummer: number, bewerber: Bewerber, paket = junior): string {
  const { texte, tools } = makeCapture();
  renderAnlageNachNummer(nummer, tools, erstelleVertragsKontext({ bewerber, paket }));
  return texte.join("\n");
}

describe("Hauptvertrag der kompakten Fassung: Struktur", () => {
  it("hat genau 14 fortlaufende Paragraphen und keine Unterparagraphen mehr", () => {
    const { texte, tools } = makeCapture();
    renderHauptvertrag(tools, erstelleVertragsKontext({ bewerber: bewerberStub(), paket: junior }));
    const pars = texte.filter((t) => /^§ \d+ /.test(t)).map((t) => t.match(/^§ (\d+)([a-z]?)/)!);
    expect(pars.map((m) => m[1])).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 1)));
    expect(pars.every((m) => m[2] === "")).toBe(true);
  });

  it("verweist bei Betrag, Laufzeit und Sätzen auf Anlage 1 und nennt die Zahlen nicht selbst", () => {
    const alles = hauptvertrag(bewerberStub());
    expect(alles).toContain("§ 2 Konditionen (Anlage 1)");
    expect(alles).toContain("ein laufendes Entgelt entsteht aus diesem Vertrag nicht");
    expect(alles).toContain("Eine Mindestlaufzeit für diesen Vertrag besteht nicht");
    expect(alles).toContain("Es gilt der in Anlage 1 ausgewiesene Standardsatz des Pakets");
    expect(alles).not.toMatch(/150\s?€/);
    expect(alles).not.toContain("12 Monate");
    expect(alles).not.toMatch(/4\s?%/);
  });

  // Bis zum 06.09.2026 schalteten ohneCrmGebuehr und laufzeitOffen die
  // Servicevereinbarung und ihre Mindestlaufzeit ab. Seit dem 07.09.2026 gibt
  // es beides nicht mehr; die gespeicherten Altwerte dürfen am Text nichts
  // mehr ändern.
  it("die Altwerte ohneCrmGebuehr und laufzeitOffen ändern den Text nicht mehr", () => {
    const standard = hauptvertrag(bewerberStub());
    expect(hauptvertrag(bewerberStub({ ohneCrmGebuehr: true }))).toBe(standard);
    expect(hauptvertrag(bewerberStub({ laufzeitOffen: true }))).toBe(standard);
    expect(hauptvertrag(bewerberStub({ ohneCrmGebuehr: true, laufzeitOffen: true }))).toBe(standard);
    expect(standard).toContain("Für diese Leistungen schuldet der Vertriebspartner kein Entgelt");
    expect(standard).toContain("Eine Mindestlaufzeit für diesen Vertrag besteht nicht");
    expect(standard).not.toContain("Frist von drei Monaten zum Monatsende anpassen");
    expect(standard).not.toContain("Es gilt die in Anlage 1 ausgewiesene Mindestlaufzeit");
    expect(standard).not.toContain("mindestens für deren Dauer");
  });

  it("Provisionsänderung nur einvernehmlich, ohne redaktionelle Ausnahme, ohne Verfall", () => {
    const alles = hauptvertrag(bewerberStub());
    expect(alles).toContain("Eine einseitige Änderung durch die Gesellschaft ist ausgeschlossen, auch für redaktionelle oder klarstellende Anpassungen.");
    expect(alles).not.toContain("bleiben hiervon unberührt, soweit sie die wirtschaftliche Position");
    expect(alles).not.toMatch(/Verfall|verfallen|Ausschlussfrist wird vereinbart/);
    expect(alles).toContain("verjähren nach den gesetzlichen Vorschriften");
  });

  it("§ 7 trägt die Eigentumsregel für Kontakte unverändert, ohne nachvertragliches Wettbewerbsverbot", () => {
    const alles = hauptvertrag(bewerberStub());
    expect(alles).toContain("§ 7 Kunden-, Bauträger- und Geschäftschancenschutz, Eigentum an Kontakten");
    expect(alles).toContain("Eigenkontakte sind und bleiben Eigentum des Vertriebspartners, auch nach Vertragsende.");
    expect(alles).toContain("Eigentum und Geschäftsgeheimnis der Gesellschaft im Sinne des § 90 HGB und des GeschGehG");
    expect(alles).toContain("manuell oder per Datei-Import (CSV)");
    expect(alles).toContain("für sonstige vertrauliche Informationen gilt es für 24 Monate nach Vertragsende");
    expect(alles).toContain("kein nachvertragliches Wettbewerbsverbot");
    expect(alles).not.toContain("§ 90a");
  });

  it("§ 10 ist das einzige Strafregime mit Ermessen und Obergrenzen (Hamburger Brauch)", () => {
    const alles = hauptvertrag(bewerberStub());
    expect(alles).toContain("§ 10 Vertragsstrafe, Auskunft und Schadensersatz");
    expect(alles).toContain("nach billigem Ermessen (§ 315 BGB)");
    expect(alles).toMatch(/höchstens 25\.000\s?€ je Verstoß/);
    expect(alles).toMatch(/höchstens 50\.000\s?€ je Verstoß/);
    expect(alles).toContain("einzige Vertragsstrafenversprechen dieses Vertragswerks");
    expect(alles).not.toContain("15.000");
    expect(alles).not.toContain("36 Monate");
  });

  it("§ 11 hat die gerichtsfeste Haftungsfassung", () => {
    const alles = hauptvertrag(bewerberStub());
    expect(alles).toContain("Im Übrigen ist die Haftung der Gesellschaft bei einfacher Fahrlässigkeit ausgeschlossen. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.");
  });

  it("§ 8 kennt Standard- und Individualfassung, beide laut Anlage 1", () => {
    const standard = hauptvertrag(bewerberStub());
    expect(standard).toContain("§ 8 Wettbewerbsverbot während der Vertragslaufzeit (Standardfassung laut Anlage 1)");
    expect(standard).toContain("Nach Vertragsende besteht kein Wettbewerbsverbot");
    const indiv = hauptvertrag(bewerberStub({ individuelleVertragsFassung: true, andereVertriebe: "Vertrieb A" }));
    expect(indiv).toContain("§ 8 Nebentätigkeit, Kunden- und Partnerschutz (Individualfassung laut Anlage 1)");
    expect(indiv).toContain("sind in Anlage 1 erklärt");
    expect(indiv).not.toContain("keine konkurrierenden Immobilienvertriebe");
    expect(indiv).not.toContain("Anlage 8");
  });

  it("§ 14 listet genau die gedruckten Anlagen", () => {
    const ohne = hauptvertrag(bewerberStub());
    expect(ohne).toContain(`Anlage 1 - ${ANLAGE_TITEL[1]}`);
    expect(ohne).toContain(`Anlage 2 - ${ANLAGE_TITEL[2]}`);
    expect(ohne).not.toContain(`${LEADPAKET_ANLAGE_NUMMER} - ${LEADPAKET_ANLAGE_TITEL}`);
    const mit = hauptvertrag(bewerberStub({ leadPaket: { betrag: 2500, anzahl: 20 } }));
    expect(mit).toContain(`${LEADPAKET_ANLAGE_NUMMER} - ${LEADPAKET_ANLAGE_TITEL} (optionales Leadpaket)`);
  });

  it("Lead-Berater: gestellte Leads, kein Leadpaket, alle Schalter wie beim Vertriebspartner", () => {
    const alles = hauptvertrag(bewerberStub({ ohneCrmGebuehr: true, individuelleVertragsFassung: true }), leadBerater);
    expect(alles).toContain("stellt die Gesellschaft dem Vertriebspartner Leads zur Unterstützung seiner eigenen Akquisition bereit");
    // Ohne Nummer: Beim Lead-Berater entsteht diese Anlage nie.
    expect(alles).toContain("eine Leadpaket-Vereinbarung wird nicht geschlossen");
    expect(alles).toContain("ein laufendes Entgelt entsteht aus diesem Vertrag nicht");
    expect(alles).toContain("(Individualfassung laut Anlage 1)");
  });
});

describe("Anlage 1: Konditionenblatt", () => {
  it("zeigt alle Konditionen des Standardvertrags auf einer Liste", () => {
    const k = erstelleVertragsKontext({ bewerber: bewerberStub({ email: "max@example.com", vertragsAdresse: "Musterstraße 1\n80331 München", rechnungsAdresse: "Firma GmbH\nFirmenweg 5" }), paket: junior }).konditionen!;
    const zeilen = Object.fromEntries(konditionenblattZeilen(k).map((z) => [z.label, z.wert]));
    expect(zeilen["Vertriebspartner"]).toContain("Max Mustermann, Musterstraße 1, 80331 München");
    expect(zeilen["Rechnungsanschrift"]).toBe("Firma GmbH, Firmenweg 5");
    expect(zeilen["Paket"]).toBe("Vertriebspartner");
    // Seit dem 07.09.2026: keine Zeile zur Servicevereinbarung mehr, dafür
    // alle gestellten Leistungen in einer Zeile und das laufende Entgelt "Keines".
    expect(zeilen["Leistungen der Gesellschaft"]).toMatch(/^Unentgeltlich: das CRM-System/);
    for (const z of GESTELLTE_ZUSATZLEISTUNGEN) expect(zeilen["Leistungen der Gesellschaft"]).toContain(z.titel);
    expect(zeilen["Laufendes Entgelt"]).toMatch(/^Keines\./);
    expect(zeilen["Servicevereinbarung"]).toBeUndefined();
    expect(zeilen["Servicevereinbarung (Anlage 3)"]).toBeUndefined();
    expect(zeilen["Laufzeit des Vertrages"]).toMatch(/^Unbestimmte Zeit, keine Mindestlaufzeit/);
    expect(zeilen["Provision"]).toMatch(/^4 % des notariellen Kaufpreises/);
    expect(zeilen["Leadpaket"]).toContain("Kein Leadpaket vereinbart");
    expect(zeilen["Wettbewerb (§ 8)"]).toMatch(/^Standardfassung/);
    expect(zeilen["Erklärte andere Vertriebe"]).toMatch(/^entfällt \(Standardfassung\)/);
    expect(zeilen["Zahlungsweise"]).toContain("Keine laufenden Entgelte");
    expect(zeilen["Vertragsfassung"]).toContain("Hauptvertrag, Anlage 1, Anlage 2");
    expect(zeilen["Rangfolge der Sätze"]).toBeUndefined();
  });

  it("zeigt bei allen Schaltern die individuellen Werte samt Rangfolge und erklärten Vertrieben", () => {
    const k = erstelleVertragsKontext({
      bewerber: bewerberStub({
        ohneCrmGebuehr: true, laufzeitOffen: true, individuelleVertragsFassung: true, andereVertriebe: "Beispiel Vertrieb GmbH\nMuster Immobilien AG",
        satzLead: "3", satzEigen: "5", satzBestand: "5", satzNeubau: "4,5", leadPaket: { betrag: 5000, anzahl: 40 },
      }),
      paket: junior,
    }).konditionen!;
    const zeilen = Object.fromEntries(konditionenblattZeilen(k).map((z) => [z.label, z.wert]));
    expect(zeilen["Laufendes Entgelt"]).toMatch(/^Keines\./);
    expect(zeilen["Provision"]).toContain("Lead-Satz 3%");
    expect(zeilen["Provision"]).toContain("Eigen-Satz 5%");
    expect(zeilen["Provision"]).toContain("Bestandsobjekte 5%");
    expect(zeilen["Provision"]).toContain("Neubauobjekte 4.5%");
    expect(zeilen["Rangfolge der Sätze"]).toBe(k.anwendungsregel);
    expect(zeilen["Rangfolge der Sätze"]).toContain("§ 7 Absatz 2");
    expect(zeilen["Leadpaket"]).toBe(`${formatPreis(5000)} netto Paketpreis für 40 qualifizierte Leads; die Gesellschaft setzt den Paketpreis innerhalb eines Monats ab Zahlungseingang, frühestens ab Freischaltung des CRM-Zugangs, für ihre Werbemaßnahmen ein, weist die Leads nach Eingang zu und liefert fehlende nach; nicht gelieferte Leads werden bei Vertragsende anteilig erstattet; Einzelheiten in Anlage 3.`);
    expect(zeilen["Wettbewerb (§ 8)"]).toMatch(/^Individualfassung/);
    expect(zeilen["Erklärte andere Vertriebe"]).toContain("Beispiel Vertrieb GmbH; Muster Immobilien AG");
    // Das Leadpaket ist Anlage 3. Anlage 4 war bis zum 06.09.2026 die
    // Servicevereinbarung; seit Fassung 2026-09-26 ist sie die Vereinbarung
    // zum Meta Pixel und behält ihre Nummer.
    expect(zeilen["Vertragsfassung"]).toContain("Anlage 3, Anlage 4");
  });

  it("wird über das Zeilen-Werkzeug gedruckt und schließt mit dem Rangfolge-Hinweis", () => {
    const alles = anlage(1, bewerberStub());
    expect(alles).toContain("Vereinbarte Konditionen");
    expect(alles).toContain("Paket: Vertriebspartner");
    expect(alles).toContain("geht ihm bei Widersprüchen vor; Änderungen nur einvernehmlich in Textform (§ 4 Absatz 7)");
  });
});

describe("Anlage 2: AVV und Anlage 3: Leadpaket", () => {
  it("die AVV ist vollständig (Art. 28 DSGVO) und verweist nur auf § 10 als Strafe", () => {
    const alles = anlage(2, bewerberStub());
    for (const teil of ["Art. 28 DSGVO", "Gegenstand, Dauer und Rollenverteilung", "Art, Zweck und Umfang", "Technische und organisatorische Maßnahmen", "Unterauftragsverhältnisse", "Löschung, Rückgabe und Kontrolle", "Verschwiegenheitserklärung", "Row-Level-Security", "Point-in-Time-Recovery"]) {
      expect(alles).toContain(teil);
    }
    expect(alles).toContain("Verpflichtete Person: Max Mustermann");
    expect(alles).toContain("§ 7 Absatz 3 des Hauptvertrages");
    expect(alles).toContain("§ 10 des Hauptvertrages");
    expect(alles).not.toMatch(/\d{2}\.000\s?(EUR|€)/);
    expect(alles).not.toContain("§ 9e");
  });

  it("die Leadpaket-Vereinbarung nennt Erwerb, Qualitätszusage, Ersatzregel und Zweckbindung", () => {
    const { texte, tools } = makeCapture();
    renderLeadpaketAnlage(tools, { betrag: 5000, anzahl: 40 });
    const alles = texte.join("\n");
    expect(alles).toContain("Die Gesellschaft verpflichtet sich, ihm 40 qualifizierte Leads nach Maßgabe des § 1a zuzuweisen");
    expect(alles).toMatch(/5\.000\s?€/);
    expect(alles).toContain("in Anlage 1 ausgewiesene Leadpaket");
    expect(alles).toContain("Paketpreis");
    expect(alles).not.toContain("Werbebudget");
    expect(alles).toContain("mindestens 3.000 Euro monatlich");
    expect(alles).toContain("Eigenkapital");
    expect(alles).toContain("§ 5 Absatz 3 des Hauptvertrages");
    expect(alles).toContain("mindestens 10 dokumentierter Kontaktversuche über mindestens 2 Kanäle innerhalb von 14 Tagen");
    expect(alles).toContain("binnen 14 Tagen nach Zuteilung");
    expect(alles).toContain("keinen Vermittlungserfolg");
    expect(alles).toContain("Qualitätscheck-Anrufe");
  });

  it("Anlage 3 lässt sich ohne Leadpaket nicht erzeugen", () => {
    expect(() => anlage(3, bewerberStub())).toThrow(/Leadpaket/);
  });
});

describe("Anlagenverzeichnis je Fassung", () => {
  it("kompakt: Anlage 1 und 2 immer, Anlage 3 nur mit Leadpaket", () => {
    // Vom 04.09. bis 06.09.2026 war die Servicevereinbarung Anlage 3 und das
    // Leadpaket Anlage 4. Seit dem 07.09.2026 ist das Leadpaket Anlage 3.
    expect(vertragsAnlagen("junior").map((a) => a.nummer)).toEqual([1, 2]);
    expect(vertragsAnlagen("junior", true, false).map((a) => a.nummer)).toEqual([1, 2]);
    expect(vertragsAnlagen("junior", false, false, "neu").map((a) => a.nummer)).toEqual([1, 2]);
    expect(vertragsAnlagen("junior", true, true).map((a) => a.nummer)).toEqual([1, 2, 3]);
    expect(vertragsAnlagen("junior", true, true, "neu").map((a) => a.nummer)).toEqual([1, 2, 3]);
    expect(getVertragsAnhaenge("junior", false, true)).toContain(`${LEADPAKET_ANLAGE_NUMMER} – ${LEADPAKET_ANLAGE_TITEL}`);
    expect(getVertragsAnhaenge("junior", false, false, "neu")).not.toContain(`Anlage 3 – ${ANLAGE_TITEL[3]}`);
  });

  it("alt: sechs bis acht Anlagen, für Altpakete unabhängig von der Fassung", () => {
    expect(vertragsAnlagen("junior", true, true, "alt").map((a) => a.nummer)).toEqual([1, 2, 3, 4, 5, 6, 8, 9]);
    expect(vertragsAnlagen("lead", false, false, "neu").map((a) => a.nummer)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getVertragsAnhaenge("junior", false, false, "alt")[0]).toBe("Anlage 1 – AGB");
  });

  it("Tippgeber-Anlagen bleiben unverändert", () => {
    expect(getVertragsAnhaenge("tippgeber", false, true)).toHaveLength(2);
  });
});

describe("Weiche zur Altfassung", () => {
  it("ein Bewerber mit gesendetem Vertrag ohne Kennzeichen bekommt weiterhin den langen Text", () => {
    const alt = hauptvertrag(bewerberStub({ vertragStatus: "gesendet" }));
    expect(alt).toContain("§ 18 Vertragsbestandteile & Akzeptanz der Anlagen");
    expect(alt).toContain("§ 9a Kunden-, Lead- und Herkunftsschutz");
    expect(alt).toContain("Die Mindestlaufzeit beträgt 12 Monate.");
    expect(alt).toContain("Anlage 1 - AGB");
    expect(anlage(1, bewerberStub({ vertragStatus: "gesendet" }))).toContain("§ 1 Geltungsbereich");
  });

  it("das Kennzeichen der Altfassung hält einen Bewerber auch nach Statuswechsel im alten Text", () => {
    const alt = hauptvertrag(bewerberStub({ vertragStatus: "nicht_gesendet", vertragFassung: VERTRAGS_FASSUNG_ALT }));
    expect(alt).toContain("§ 18 Vertragsbestandteile & Akzeptanz der Anlagen");
  });

  it("die Altfassung nennt die Rangfolge der Sätze mit § 9a, die neue mit § 7", () => {
    const felder = { satzLead: "3", satzEigen: "5" };
    expect(provisionsSaetze(junior, bewerberStub({ ...felder, vertragStatus: "unterschrieben" })).anwendungsregel).toContain("§ 9a Abs. 2");
    expect(provisionsSaetze(junior, bewerberStub(felder)).anwendungsregel).toContain("§ 7 Absatz 2");
  });
});

describe("paketMitVertragsSchaltern", () => {
  // Die aktuellen Pakete tragen seit dem 07.09.2026 weder Gebühr noch
  // Mindestlaufzeit. Die beiden früheren Schalter finden dort nichts mehr,
  // was sie abschalten könnten; ihre Altwerte lassen das Paket unverändert.
  it("lässt die aktuellen Pakete bei jedem Altwert unverändert", () => {
    expect(paketMitVertragsSchaltern(junior, bewerberStub({ laufzeitOffen: true }))).toEqual(junior);
    expect(paketMitVertragsSchaltern(junior, bewerberStub({ ohneCrmGebuehr: true }))).toEqual(junior);
    expect(paketMitVertragsSchaltern(junior, bewerberStub({ ohneCrmGebuehr: true, laufzeitOffen: true }))).toEqual(junior);
    expect(junior.features.join("\n")).not.toMatch(/Mindestlaufzeit, danach|Servicevereinbarung/);
  });

  // Für Bestandspartner der Altfassung wird die CRM-Systemgebühr ergänzt
  // (paketMitAltfassungsGebuehr); dort wirken die Schalter wie bisher.
  it("ersetzt in der Altfassung bei laufzeitOffen die Mindestlaufzeit in der Leistungszeile", () => {
    const alt = paketMitAltfassungsGebuehr(junior);
    expect(alt.monatlich).toBe(150);
    expect(alt.laufzeitMonate).toBe(12);
    const paket = paketMitVertragsSchaltern(alt, bewerberStub({ laufzeitOffen: true }));
    expect(paket.laufzeitMonate).toBe(0);
    expect(paket.monatlich).toBe(150);
    const zeile = paket.features.find((f) => f.includes("CRM-Systemgebühr"));
    expect(zeile).toContain("keine Mindestlaufzeit, monatlich kündbar");
    // Die unentgeltliche Grundleistung bleibt unabhängig davon stehen.
    expect(paket.features.some((f) => f.includes("unentgeltlich (§ 86a HGB)"))).toBe(true);
    expect(zeile).not.toContain("12 Monate Mindestlaufzeit");
  });

  it("entfernt in der Altfassung bei beiden Schaltern die Gebührenzeile, behält die unentgeltliche Grundleistung", () => {
    const paket = paketMitVertragsSchaltern(paketMitAltfassungsGebuehr(junior), bewerberStub({ ohneCrmGebuehr: true, laufzeitOffen: true }));
    expect(paket.monatlich).toBe(0);
    expect(paket.laufzeitMonate).toBe(0);
    expect(paket.features.join("\n")).not.toContain("Mindestlaufzeit");
    expect(paket.features).toContain("Keine CRM-Systemgebühr und kein laufendes Entgelt (individuell vereinbart)");
  });

  it("lässt andere Pakete und Bewerber ohne Schalter unverändert", () => {
    expect(paketMitVertragsSchaltern(junior, bewerberStub())).toEqual(junior);
    const teamLead = getLizenzPaket("team_builder")!;
    expect(paketMitVertragsSchaltern(teamLead, bewerberStub({ laufzeitOffen: true }))).toEqual(teamLead);
    expect(paketMitVertragsSchaltern(teamLead, bewerberStub({ ohneCrmGebuehr: true, laufzeitOffen: true }))).toEqual(teamLead);
  });
});

describe("featuresMitProvisionsSaetzen", () => {
  it("lässt die Liste ohne individuelle Sätze unverändert", () => {
    const liste = featuresMitProvisionsSaetzen(junior, bewerberStub());
    expect(liste).toEqual(junior.features);
    expect(liste.join("\n")).toContain("Einheitlich 4 % Provision auf Lead- und Eigenkontakte");
  });

  it("ersetzt die Standardzeile durch den vertragsgleichen Satztext bei individuellem Einheitssatz", () => {
    const bewerber = bewerberStub({ satzIndividuell: "3,5" });
    const liste = featuresMitProvisionsSaetzen(junior, bewerber);
    const alles = liste.join("\n");
    expect(alles).not.toContain("Einheitlich 4 % Provision");
    const { effektiverSatzText } = provisionsSaetze(junior, bewerber);
    expect(alles).toContain(`Individuell vereinbarte Provision: ${effektiverSatzText}`);
    expect(alles).toContain("3.5%");
    expect(liste).toHaveLength(junior.features.length);
    expect(alles).toContain("Vollzugriff CRM & Pipeline");
  });

  it("zeigt getrennte Lead- und Eigen-Sätze aus den Formularwerten", () => {
    const alles = featuresMitProvisionsSaetzen(junior, bewerberStub(), { lead: 3, eigen: 5 }).join("\n");
    expect(alles).not.toContain("Einheitlich 4 % Provision");
    expect(alles).toContain("Lead-Satz 3%");
    expect(alles).toContain("Eigen-Satz 5%");
  });

  it("zeigt objektartbasierte Sätze (Bestand/Neubau)", () => {
    const alles = featuresMitProvisionsSaetzen(junior, bewerberStub({ satzBestand: "5", satzNeubau: "4,5" })).join("\n");
    expect(alles).not.toContain("Einheitlich 4 % Provision");
    expect(alles).toContain("Bestandsobjekte 5%");
    expect(alles).toContain("Neubauobjekte 4.5%");
  });

  it("hängt die Sätze bei Paketen ohne Standardsatz-Zeile als eigene Zeile an", () => {
    const teamLead = getLizenzPaket("team_builder")!;
    const alles = featuresMitProvisionsSaetzen(teamLead, bewerberStub({ satzIndividuell: "6" })).join("\n");
    expect(alles).toContain("Individuell vereinbarte Provision: Einheitlicher Satz 6%");
    if (OVERHEAD_AKTIV) {
      expect(alles).toContain("Overhead-Provision 1,5 % auf jeden Vertriebspartner-Abschluss");
    } else {
      expect(alles).not.toContain("Overhead");
    }
  });

  it("ignoriert Sätze bei Paketen ohne individuelle Sätze (Tippgeber)", () => {
    const tippgeber = getLizenzPaket("tippgeber")!;
    expect(featuresMitProvisionsSaetzen(tippgeber, bewerberStub({ satzIndividuell: "3" }))).toEqual(tippgeber.features);
  });
});

describe("provisionsSaetze: kein eingetragener Satz fällt weg", () => {
  it("druckt Lead-, Eigen-, Bestand- und Neubau-Satz zugleich samt Rangfolge", () => {
    const r = provisionsSaetze(junior, bewerberStub({ satzLead: "3", satzEigen: "5", satzBestand: "5", satzNeubau: "4,5" }));
    expect(r.hasOverride).toBe(true);
    expect(r.effektiverSatzText).toContain("Lead-Satz 3%");
    expect(r.effektiverSatzText).toContain("Eigen-Satz 5%");
    expect(r.effektiverSatzText).toContain("Bestandsobjekte 5%");
    expect(r.effektiverSatzText).toContain("Neubauobjekte 4.5%");
    expect(r.anwendungsregel).toContain("Der Lead-Satz gilt");
    expect(r.anwendungsregel).toContain("Der Eigen-Satz gilt");
    expect(r.anwendungsregel).toContain("je nach vermittelter Objektart für Abschlüsse, für die weder ein Lead- noch ein Eigen-Satz vereinbart ist");
    // Seit dem 04.09.2026 kein Standardsatz-Rückfall mehr, wenn Lead und Eigen
    // beide vereinbart sind: Die beiden decken zusammen jeden Kontakt ab
    // (§ 7 Absatz 2 und 3), es bleibt kein Abschluss übrig. Der Satz stand
    // vorher auch dann da und war irreführend.
    expect(r.anwendungsregel).not.toContain("Standardsatz des Pakets");
    expect(r.saetzeListe.join(" ")).not.toContain("Standardsatz des Pakets");
  });

  it("nennt bei einem einheitlichen Satz keinen Standardsatz-Rückfall", () => {
    const r = provisionsSaetze(junior, bewerberStub({ satzIndividuell: "3,5" }));
    expect(r.effektiverSatzText).toBe("Einheitlicher Satz 3.5% (individuell vereinbart, gilt für Lead- und Eigenkontakte)");
    expect(r.anwendungsregel).not.toContain("Standardsatz");
  });

  it("ohne Sätze: Standardsatz, keine Regel", () => {
    const r = provisionsSaetze(junior, bewerberStub());
    expect(r.hasOverride).toBe(false);
    expect(r.effektiverSatzText).toBe("4%");
    expect(r.anwendungsregel).toBe("");
  });
});

describe("vertragLaufzeitOffen: Altwerte für Stempel und Altfassung", () => {
  it("gilt bei jedem der beiden Schalter, nur für Pakete mit Vertragsschaltern", () => {
    expect(vertragLaufzeitOffen("junior", { ohneCrmGebuehr: true })).toBe(true);
    expect(vertragLaufzeitOffen("lead_berater", { laufzeitOffen: true })).toBe(true);
    expect(vertragLaufzeitOffen("junior", {})).toBe(false);
    expect(vertragLaufzeitOffen("team_builder", { ohneCrmGebuehr: true, laufzeitOffen: true })).toBe(false);
    expect(vertragLaufzeitOffen("", { ohneCrmGebuehr: true })).toBe(false);
  });
});

describe("LEAD_KLAUSELN der kompakten Fassung", () => {
  it("Lead-Berater: Bereitstellung ohne Anspruch, keine Leadpaket-Vereinbarung (Anlage 3)", () => {
    const alles = LEAD_KLAUSELN.lead_berater.join("\n");
    expect(alles).toContain("nach Verfügbarkeit und billigem Ermessen der Gesellschaft, ohne definierte Stückzahl");
    expect(alles).toContain("eine Leadpaket-Vereinbarung wird nicht geschlossen");
  });

  it("Vertriebspartner: Beträge nur als Verweis auf Anlage 1", () => {
    const alles = LEAD_KLAUSELN.junior.join("\n");
    expect(alles).toContain("in Anlage 1 ausgewiesenen Modellkonditionen");
    expect(alles).not.toMatch(/\d\s?€/);
  });
});

/* ── Fassung 2026-09-04: die Konstellation Matthias Unger ─────────────────
 *
 * Vertriebspartner, individuelle Fassung des § 8 (kein Wettbewerbsverbot),
 * individuelle Sätze 3 % auf Leads der Gesellschaft und 5 % auf eigene
 * Kontakte. Diese Tests halten fest, was ein neu erzeugter Vertrag für ihn
 * enthalten muss, damit "Vertrag mit aktuellem Paket neu erstellen" nicht
 * unbemerkt wieder alten Text liefert.
 */

const unger = bewerberStub({
  vorname: "Matthias",
  nachname: "Unger",
  individuelleVertragsFassung: true,
  andereVertriebe: "Beispiel Vertrieb GmbH",
  satzLead: "3",
  satzEigen: "5",
} as Partial<Bewerber>);

describe("Fassung 2026-09-04, Konstellation Matthias Unger", () => {
  it("§ 1 Absatz 3: die Erlaubnis ist erforderlich, ohne Weichzeichnung", () => {
    const t = hauptvertrag(unger);
    expect(t).toContain("Soweit die Tätigkeit des Vertriebspartners eine Erlaubnis nach § 34c Absatz 1 GewO erfordert, muss er diese Erlaubnis besitzen");
    expect(t).toContain("weist sie der Gesellschaft vor Aufnahme der erlaubnispflichtigen Tätigkeit nach");
    expect(t).toContain("Dieser Vertrag befreit nicht von der Erlaubnispflicht");
    // Kein Haftungsdach und keine Aufsichtskonstruktion: am 04.09.2026 verworfen.
    expect(t).not.toContain("Haftungsdach");
    expect(t).not.toContain("in ihre Organisation eingebunden");
    expect(t).not.toContain("stellt den Vertriebspartner von Ansprüchen Dritter frei");
  });

  it("§ 1 Absatz 3a: die erlaubnisfreie Tippgebertätigkeit ist klar abgegrenzt", () => {
    const t = hauptvertrag(unger);
    expect(t).toContain("Ohne eigene Erlaubnis ist dem Vertriebspartner allein die erlaubnisfreie Tippgebertätigkeit gestattet");
    // Was erlaubt ist.
    expect(t).toContain("das Benennen von Interessenten, die Weitergabe ihrer Kontaktdaten");
    // Was nicht erlaubt ist.
    for (const verboten of [
      "die Beratung des Interessenten",
      "Objekt- und Verkaufsgespräche",
      "Angaben zu Kaufpreisen, Renditen, Mieten oder steuerlichen Wirkungen",
      "Verhandlungen über Kaufpreis oder Vertragsinhalte",
      "die Entgegennahme von Reservierungen",
    ]) expect(t).toContain(verboten);
    expect(t).toContain("wird er erlaubnispflichtig tätig und Absatz 3 gilt uneingeschränkt");
  });

  it("§ 1 Absatz 3b: Finanzierung nur über die Gesellschaft, ohne Haftungswirkung", () => {
    const t = hauptvertrag(unger);
    expect(t).toContain("Eine Finanzierungsvermittlung nimmt der Vertriebspartner in keinem Fall selbst vor");
    expect(t).toContain("ausschließlich Aufgabe der Finanzierungsabteilung der Gesellschaft");
    expect(t).toContain("Diese Zuständigkeitsregel ersetzt keine Erlaubnis");
  });

  it("keine Nachweispflicht und keine Kundenfrist im Vertragstext", () => {
    // Am 04.09.2026 gestrichen: Der Vertrag sagt in Absatz 3, dass die
    // Erlaubnis vorhanden sein muss. Dass jemand zunächst ohne sie starten
    // kann, ist eine persönliche Absprache und steht nicht im Vertrag.
    const t = hauptvertrag(unger);
    expect(t).not.toContain("Erlaubnisbescheid");
    expect(t).not.toContain("unaufgefordert");
    expect(t).not.toMatch(/Kunden vermittelt hat/);
    expect(t).not.toMatch(/vermittelten Kunden zu stellen/);
    expect(t).not.toContain("Die Gesellschaft empfiehlt, den Antrag");
    // Auch das Konditionenblatt nennt keine Frist mehr.
    const zeile = konditionenblattZeilen(konditionenAus(unger, { paket: junior })!)
      .find((z) => z.label === "Erlaubnis nach § 34c GewO")!.wert;
    expect(zeile).toContain("Erforderlich, soweit die Tätigkeit sie erfordert");
    expect(zeile).not.toMatch(/\d+ Kunden/);
    // Die Absätze laufen lückenlos 3, 3a, 3b, 3c.
    expect(t).toContain("(3c) Für die Einhaltung der für ihn geltenden gewerbe- und aufsichtsrechtlichen Vorgaben");
    expect(t).not.toContain("(3d)");
  });

  it("§ 4: keine monatliche Abrechnung, Kette Kaufpreisfälligkeit bis Auszahlung", () => {
    const t = hauptvertrag(unger);
    expect(t).not.toContain("Abrechnung monatlich nach Provisionseingang");
    expect(t).toContain("Eine zeitabhängige, insbesondere monatliche Abrechnung findet nicht statt");
    expect(t).toContain("regelmäßig mit Fälligkeit des Kaufpreises zur Zahlung fällig");
    expect(t).toContain("spätestens innerhalb von zehn Tagen nach Zahlungseingang, in Textform mit (Abrechnungsmitteilung)");
    expect(t).toContain("innerhalb von 14 Tagen nach Zugang einer ordnungsgemäßen Rechnung");
    // Teilzahlung des Bauträgers und Fortgeltung nach Vertragsende.
    expect(t).toContain("wird der Anteil des Vertriebspartners anteilig im Verhältnis der eingegangenen");
    expect(t).toContain("bleiben von der Beendigung unberührt");
  });

  it("zum Eigengeschäft sagt der Vertrag nichts mehr", () => {
    // Am 04.09.2026 ersatzlos gestrichen. Erst stand hier eine Ermessensregel,
    // dann eine Kaufpreisminderung; beides ist raus. Eigengeschäfte werden im
    // Einzelfall besprochen und nicht im Vertrag geregelt.
    for (const paket of [junior, leadBerater]) {
      const t = hauptvertrag(unger, paket);
      for (const spur of [
        "Eigengeschäft", "Eigengeschäfte", "Kaufpreisminderung",
        "nahe Angehörige", "Ehegattin", "Lebenspartner",
        "mehrheitlich beteiligt", "selbst Kunde",
        "über ihre Provisionsfähigkeit entscheidet die Gesellschaft",
      ]) expect(t, spur).not.toContain(spur);
      // § 4 läuft ohne Lücke weiter: nach Absatz 4 kommt Absatz 5.
      expect(t).toContain("(4) Bei Rückabwicklung, Nichtzahlung oder falschen Angaben");
      expect(t).toContain("(5) Provisionsansprüche verjähren nach den gesetzlichen Vorschriften");
      expect(t).not.toContain("(4a)");
      expect(t).not.toContain("(4b)");
    }
    // Auch das Konditionenblatt erwähnt es nicht mehr.
    for (const b of [unger, bewerberStub()]) {
      const zeilen = konditionenblattZeilen(konditionenAus(b, { paket: junior })!);
      expect(zeilen.map((z) => z.label)).not.toContain("Eigengeschäft");
      expect(zeilen.map((z) => z.wert).join(" ")).not.toContain("Eigengeschäft");
    }
  });

  it("die Sätze stehen nicht im Vertragstext, sondern kommen aus dem Bewerberprofil", () => {
    // Wichtig: 3 und 5 dürfen nirgends fest im Klauseltext stehen, sonst
    // bekäme jeder Partner Ungers Sätze. Ein Bewerber ohne eigene Sätze muss
    // weiter den Paketsatz führen.
    const ohne = hauptvertrag(bewerberStub({ individuelleVertragsFassung: true } as Partial<Bewerber>));
    expect(ohne).toContain("Es gilt der in Anlage 1 ausgewiesene Standardsatz des Pakets");
    expect(ohne).not.toContain("Lead-Satz 3%");
    expect(ohne).not.toContain("Eigen-Satz 5%");
    const blattOhne = konditionenblattZeilen(konditionenAus(bewerberStub(), { paket: junior })!);
    expect(blattOhne.find((z) => z.label === "Provision")!.wert).toContain("4 % des notariellen Kaufpreises");
  });

  it("Paket Vertriebspartner lässt individuelle Sätze überhaupt durch", () => {
    // provisionsSaetze wertet die Profilfelder nur für unterstützte Pakete
    // aus. Steht "junior" nicht in der Liste, greifen 3 und 5 nirgends.
    expect(PAKETE_MIT_VERTRAGSSCHALTERN).toContain("junior");
    expect(provisionsSaetze(junior, unger).hasOverride).toBe(true);
    expect(provisionsSaetze(leadBerater, unger).hasOverride).toBe(true);
  });

  it("Provision: 3 % auf Leads, 5 % auf eigene Kontakte, kein pauschaler 4-Prozent-Satz", () => {
    const s = provisionsSaetze(junior, unger);
    expect(s.hasOverride).toBe(true);
    expect(s.lv).toBe(3);
    expect(s.ev).toBe(5);
    const zeilen = konditionenblattZeilen(konditionenAus(unger, { paket: junior })!);
    const provision = zeilen.find((z) => z.label === "Provision")!.wert;
    expect(provision).toContain("Lead-Satz 3%");
    expect(provision).toContain("Eigen-Satz 5%");
    expect(provision).not.toContain("4 % des notariellen Kaufpreises");
    // Nirgends im ganzen Vertrag steht noch der Paketsatz als geltender Satz.
    expect(hauptvertrag(unger)).not.toMatch(/\b4\s?% des notariellen Kaufpreises/);
    const rang = zeilen.find((z) => z.label === "Rangfolge der Sätze")!.wert;
    expect(rang).toContain("Der Lead-Satz gilt für Abschlüsse mit Leads");
    expect(rang).toContain("Der Eigen-Satz gilt für Abschlüsse mit Eigenkontakten");
    // Der Hauptvertrag verweist bei individuellen Sätzen auf Anlage 1.
    expect(hauptvertrag(unger)).toContain("Die geltenden Provisionssätze sind in Anlage 1 individuell vereinbart");
  });

  it("§ 5: Paketpreis ist Entgelt für Gewinnung und Vorqualifizierung, gekaufte Leads bleiben bei der Gesellschaft", () => {
    const t = hauptvertrag(unger);
    expect(t).toContain("Der Paketpreis eines Leadpakets und der Stückpreis von Einzel-Leads sind Entgelt für die Gewinnung und Vorqualifizierung der vereinbarten Zahl qualifizierter Leads");
    expect(t).not.toContain("Nutzungsentgelt");
    expect(t).toContain("Auch bezahlte Leads verbleiben bei der Gesellschaft");
    expect(t).toContain("Einmal-, Einstiegs-, Onboarding- oder Eintrittsgebühren werden in diesem Vertrag nicht erhoben");
  });

  it("§ 5 und § 7: eigene Kunden frei, Leads der Gesellschaft nur über die Gesellschaft", () => {
    const t = hauptvertrag(unger);
    expect(t).toContain("(5) Reichweite dieses Paragraphen");
    expect(t).toContain("(8a) Da für diesen Vertrag die Individualfassung des § 8 gilt");
    expect(t).toContain("darf der Vertriebspartner dagegen auch außerhalb der Gesellschaft und für andere Unternehmen beraten, vermitteln und einreichen");
    expect(t).toContain("Diese Freiheit besteht, weil und solange für diesen Vertrag die Individualfassung des § 8 gilt");
    // Die fünf Abgrenzungsregeln für die Grenzfälle.
    expect(t).toContain("(8b) Für die Abgrenzung nach Absatz 8a gilt ergänzend");
    expect(t).toContain("verliert seine Eigenschaft als Eigenkontakt nicht dadurch");
  });

  it("keine Klausel mehr, die stillschweigend Ausschließlichkeit voraussetzt", () => {
    const t = hauptvertrag(unger);
    expect(t).not.toContain("Vertrieb außerhalb genehmigter Strukturen");
    expect(t).not.toContain("begeht keine Wettbewerbsverstöße");
    expect(t).not.toContain("Nutzung für Konkurrenzangebote");
    expect(t).not.toContain("Auskunft über alle von ihm bearbeiteten Kunden");
    // Die Auskunftspflicht endet an der Grenze zum fremden Geschäft.
    expect(t).toContain("Eine Auskunftspflicht über seine außerhalb der Gesellschaft bearbeiteten Eigenkontakte");
    // Die zulässige Nebentätigkeit steht nicht unter Strafdrohung.
    expect(t).toContain("lösen keine Vertragsstrafe aus");
  });

  it("Konditionenblatt führt Eigengeschäft, Abrechnung, 34c und die Reichweite", () => {
    const zeilen = konditionenblattZeilen(konditionenAus(unger, { paket: junior })!);
    // Eigengeschäft und Abrechnung stehen in der Provisionszeile: Anlage 1
    // muss eine Seite bleiben, dafür bündelt die Zeile beides.
    const provision = zeilen.find((z) => z.label === "Provision")!.wert;
    expect(provision).toContain("nicht monatlich, sondern nach Provisionseingang");
    expect(provision).toContain("Auszahlung 14 Tage nach Rechnungsstellung");
    expect(zeilen.map((z) => z.label)).toContain("Erlaubnis nach § 34c GewO");
    expect(zeilen.find((z) => z.label === "Erlaubnis nach § 34c GewO")!.wert)
      .toContain("ohne sie ist allein die Tippgebertätigkeit zulässig");
    expect(zeilen.find((z) => z.label === "Wettbewerb (§ 8)")!.wert)
      .toContain("eigene Kunden frei");
  });
});

describe("Standardfassung bleibt unberührt", () => {
  const standard = bewerberStub({ satzLead: "", satzEigen: "" } as Partial<Bewerber>);

  it("ohne Individualfassung gibt es die Freiheiten für eigene Kunden nicht", () => {
    const t = hauptvertrag(standard);
    expect(t).toContain("§ 8 Wettbewerbsverbot während der Vertragslaufzeit");
    expect(t).toContain("(8a) Für diesen Vertrag gilt die Standardfassung des § 8");
    expect(t).toContain("Absatz 8 gilt daher in vollem Umfang");
    expect(t).not.toContain("(5) Reichweite dieses Paragraphen");
    expect(t).not.toContain("darf der Vertriebspartner dagegen auch außerhalb der Gesellschaft");
  });

  it("die Sachkorrekturen gelten in beiden Fassungen", () => {
    const t = hauptvertrag(standard);
    expect(t).not.toContain("Abrechnung monatlich nach Provisionseingang");
    expect(t).toContain("Der Paketpreis eines Leadpakets und der Stückpreis von Einzel-Leads sind Entgelt für die Gewinnung und Vorqualifizierung der vereinbarten Zahl qualifizierter Leads");
    expect(t).toContain("Ohne eigene Erlaubnis ist dem Vertriebspartner allein die erlaubnisfreie Tippgebertätigkeit gestattet");
  });

  it("Lead-Berater bekommt gestellte Leads unentgeltlich, keinen Paketpreis", () => {
    const t = hauptvertrag(standard, leadBerater);
    expect(t).toContain("werden dem Vertriebspartner unentgeltlich zur Bearbeitung überlassen");
    expect(t).not.toContain("Nutzungsentgelt für die Bereitstellung dieser Leads");
    expect(t).not.toContain("Der Paketpreis eines Leadpakets");
  });
});

describe("Fassungsweiche: Bestandspartner merken nichts", () => {
  it("die Altfassung bleibt Wort für Wort wie bisher", () => {
    const alt = bewerberStub({ vertragFassung: VERTRAGS_FASSUNG_ALT, individuelleVertragsFassung: true } as Partial<Bewerber>);
    const t = hauptvertrag(alt);
    // Altfassung: Wettbewerb ist § 10, Geschäftschancen sind § 9d.
    expect(t).toContain("§ 10 Nebentätigkeit, Kunden- und Partnerschutz (Individualfassung)");
    expect(t).toContain("§ 9d Schutz laufender Geschäftschancen");
    // Keine der neuen Klauseln darf in die Altfassung geraten.
    expect(t).not.toContain("(8a)");
    expect(t).not.toContain("erlaubnisfreie Tippgebertätigkeit gestattet");
    expect(t).not.toContain("Für jeden entgeltlich erworbenen Lead");
  });
});

/* ── Der Weg vom Knopf "Vertrag mit aktuellem Paket neu erstellen" ────────
 *
 * ClosingTab.handlePaketBestaetigen ruft buildVertragPdf mit dem Bewerber
 * auf, wie er gespeichert ist. buildVertragPdf baut daraus den Kontext und
 * ruft renderHauptvertrag; dort entscheidet fassungAus/vertragsFassungVon
 * zwischen kompakter Fassung und Altfassung. Anschließend speichert der
 * Knopf vertragsFassungKennung am Bewerber.
 *
 * Diese Tests bilden genau diesen Weg nach, ohne PDF, und halten fest, wann
 * der Knopf die neue Fassung liefert und wann nicht.
 */
describe("Knopf \"Vertrag mit aktuellem Paket neu erstellen\"", () => {
  const ungerBasis = {
    vorname: "Matthias", nachname: "Unger",
    individuelleVertragsFassung: true,
    satzLead: "3", satzEigen: "5",
    paketwahl: "junior",
  } as Partial<Bewerber>;

  /** Enthält der erzeugte Text die neuen Klauseln der Fassung 2026-09-04? */
  const istNeueFassung = (t: string) =>
    t.includes("Für jeden entgeltlich erworbenen Lead, gleich ob einzeln erworben oder aus einem Leadpaket")
    && t.includes("Eine zeitabhängige, insbesondere monatliche Abrechnung findet nicht statt")
    && t.includes("Ohne eigene Erlaubnis ist dem Vertriebspartner allein die erlaubnisfreie Tippgebertätigkeit gestattet");

  it("frischer Bewerber ohne Kennzeichen: neue Fassung", () => {
    const b = bewerberStub({ ...ungerBasis, vertragStatus: "nicht_gesendet" } as Partial<Bewerber>);
    expect(vertragsFassungVon(b, "junior")).toBe("neu");
    expect(istNeueFassung(hauptvertrag(b))).toBe(true);
    expect(vertragsFassungKennung(b, "junior")).toBe(VERTRAGS_FASSUNG);
  });

  it("Bewerber mit der vorigen kompakten Fassung 2026-09-02: bekommt den neuen Text", () => {
    const b = bewerberStub({ ...ungerBasis, vertragFassung: "2026-09-02", vertragStatus: "gesendet" } as Partial<Bewerber>);
    expect(vertragsFassungVon(b, "junior")).toBe("neu");
    expect(istNeueFassung(hauptvertrag(b))).toBe(true);
    // Beim Neuerstellen wird das Kennzeichen auf die aktuelle Fassung gehoben.
    expect(vertragsFassungKennung(b, "junior")).toBe(VERTRAGS_FASSUNG);
  });

  it("FALLSTRICK: gesendeter Vertrag ohne Kennzeichen zieht die Altfassung", () => {
    // vertragsFassungVon stuft einen Bewerber mit gesendetem, wartendem oder
    // unterschriebenem Vertrag ohne gespeichertes Kennzeichen als
    // Bestandspartner ein. Der Knopf liefert dann weiter den alten Text. Der
    // Ausweg ist der Knopf "Auf kompakte Fassung umstellen" im Vertrags-Tab
    // (VertragsTab.aufKompakteFassungUmstellen).
    const b = bewerberStub({ ...ungerBasis, vertragFassung: "", vertragStatus: "gesendet" } as Partial<Bewerber>);
    expect(vertragsFassungVon(b, "junior")).toBe("alt");
    expect(istNeueFassung(hauptvertrag(b))).toBe(false);
    // Nach dem Umstellen greift die neue Fassung.
    const umgestellt = bewerberStub({ ...ungerBasis, vertragFassung: VERTRAGS_FASSUNG, vertragStatus: "gesendet" } as Partial<Bewerber>);
    expect(vertragsFassungVon(umgestellt, "junior")).toBe("neu");
    expect(istNeueFassung(hauptvertrag(umgestellt))).toBe(true);
  });

  it("die Sätze aus dem Closing-Formular schlagen auf den Text durch", () => {
    // Der Knopf gibt die Sätze des Formulars ausdrücklich mit, statt sich auf
    // den gespeicherten Stand zu verlassen.
    const b = bewerberStub({ ...ungerBasis, satzLead: "", satzEigen: "" } as Partial<Bewerber>);
    const k = konditionenAus(b, { paket: junior, saetze: { lead: 3, eigen: 5 } })!;
    const provision = konditionenblattZeilen(k).find((z) => z.label === "Provision")!.wert;
    expect(provision).toContain("Lead-Satz 3%");
    expect(provision).toContain("Eigen-Satz 5%");
  });
});

describe("Keine Stelle setzt eine Tätigkeit ohne Erlaubnis voraus", () => {
  it("die Beratungspflichten des § 6 stehen unter dem Vorbehalt des § 1", () => {
    const t = hauptvertrag(bewerberStub());
    expect(t).toContain("Diese Pflichten gelten, soweit der Vertriebspartner nach § 1 Absatz 3 beraten darf");
    expect(t).toContain("beschränkt er sich auf die Tippgebertätigkeit nach § 1 Absatz 3a und berät nicht");
  });
});

/* ── Lead- und Eigensatz gelten für beide Vertragsarten ──────────────────
 *
 * Christians Vorgabe vom 04.09.2026: Jeder Vertrag, bei dem im Closing ein
 * Lead- und ein Eigensatz eingetragen ist, bekommt dasselbe Wording. Das
 * betrifft Vertriebspartner und Lead-Berater gleichermaßen; individuell an
 * einem Bewerber sind allein seine Zahlen.
 */
describe("Lead- und Eigensatz: gleiches Wording bei beiden Vertragsarten", () => {
  const mitSaetzen = (lead: string, eigen: string) =>
    bewerberStub({ satzLead: lead, satzEigen: eigen } as Partial<Bewerber>);

  it.each([
    ["Vertriebspartner", junior],
    ["Lead-Berater", leadBerater],
  ])("%s: dieselben Sätze erzeugen denselben Text", (_titel, paket) => {
    const b = mitSaetzen("3", "5");
    const s = provisionsSaetze(paket, b);
    expect(s.hasOverride).toBe(true);
    expect(s.lv).toBe(3);
    expect(s.ev).toBe(5);
    // Wortgleich in beiden Paketen: Der Text hängt an den Sätzen, nicht am Paket.
    expect(s.saetzeListe).toEqual([
      "Lead-Satz 3% (bei über OS Immobilien zugewiesenen Leads)",
      "Eigen-Satz 5% (bei eigenem Netzwerk / eigenen Kontakten)",
    ]);
    expect(s.anwendungsregel).toContain("Der Lead-Satz gilt für Abschlüsse mit Leads, die dem Vertriebspartner von der Gesellschaft zugewiesen wurden (Gesellschaftskontakte nach § 7 Absatz 2).");
    expect(s.anwendungsregel).toContain("Der Eigen-Satz gilt für Abschlüsse mit Eigenkontakten des Vertriebspartners (§ 7 Absatz 3).");

    const zeilen = konditionenblattZeilen(konditionenAus(b, { paket })!);
    const provision = zeilen.find((z) => z.label === "Provision")!.wert;
    expect(provision).toContain("Individuell vereinbart: Lead-Satz 3% (bei über OS Immobilien zugewiesenen Leads) · Eigen-Satz 5% (bei eigenem Netzwerk / eigenen Kontakten)");
    expect(zeilen.map((z) => z.label)).toContain("Rangfolge der Sätze");

    const t = hauptvertrag(b, paket);
    expect(t).toContain("Die geltenden Provisionssätze sind in Anlage 1 individuell vereinbart");
    expect(t).not.toContain("Es gilt der in Anlage 1 ausgewiesene Standardsatz des Pakets");
  });

  it.each([
    ["Vertriebspartner", junior],
    ["Lead-Berater", leadBerater],
  ])("%s: andere Zahlen, gleiches Wording", (_titel, paket) => {
    const s = provisionsSaetze(paket, mitSaetzen("2,5", "4"));
    expect(s.saetzeListe).toEqual([
      "Lead-Satz 2.5% (bei über OS Immobilien zugewiesenen Leads)",
      "Eigen-Satz 4% (bei eigenem Netzwerk / eigenen Kontakten)",
    ]);
  });

  it.each([
    ["Vertriebspartner", junior],
    ["Lead-Berater", leadBerater],
  ])("%s: ohne eingetragene Sätze bleibt der Paketsatz", (_titel, paket) => {
    const s = provisionsSaetze(paket, bewerberStub());
    expect(s.hasOverride).toBe(false);
    expect(s.effektiverSatzText).toBe("4%");
    expect(hauptvertrag(bewerberStub(), paket))
      .toContain("Es gilt der in Anlage 1 ausgewiesene Standardsatz des Pakets");
  });
});

/* ── Leads: Einzelkauf ohne Paketbuchung ─────────────────────────────────
 *
 * Christians Richtigstellung vom 04.09.2026: Bei Matthias Unger wird im
 * Closing kein Leadpaket gewählt. Im Vertrag muss stehen, dass er Leads
 * einzeln erwerben kann. Die frühere Bedingung "erst nach der ersten
 * Paketbuchung" ist entfallen; sie war reiner Anzeigetext.
 */
describe("Leadauswahl im Closing: kein Kauf, Leadpaket oder Leads einzeln", () => {
  const keinKauf = bewerberStub({});
  const mitPaket = bewerberStub({ leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>);
  const einzeln = bewerberStub({ leadEinzelkauf: true } as Partial<Bewerber>);

  describe("Vertriebspartner", () => {
    it("kein Leadkauf: Text unverändert gegenüber dem Stand vor dem 04.09.2026", () => {
      const t = hauptvertrag(keinKauf, junior);
      expect(t).toContain("Der Vertriebspartner kann jederzeit ein Leadpaket zu den in Anlage 1 ausgewiesenen Modellkonditionen erwerben; Einzel-Leads sind erst nach der ersten Paketbuchung möglich.");
      expect(t).not.toContain("(2a)");
      expect(vertragsAnlagen("junior", false, false, "neu").map((a) => a.nummer)).toEqual([1, 2]);
      const zeile = konditionenblattZeilen(konditionenAus(keinKauf, { paket: junior })!)
        .find((z) => z.label === "Leadpaket")!.wert;
      expect(zeile).toBe(`Kein Leadpaket vereinbart; optional jederzeit buchbar: ${formatPreis(2500)} netto für 20 qualifizierte Leads, Einzel-Leads zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead nach der ersten Paketbuchung`);
    });

    it("Leadpaket: Anlage 3 kommt dazu, Einzelkauf bleibt an das Paket gebunden", () => {
      const t = hauptvertrag(mitPaket, junior);
      expect(t).not.toContain("(2a)");
      expect(vertragsAnlagen("junior", false, true, "neu").map((a) => a.nummer)).toEqual([1, 2, 3]);
      expect(t).toContain("Für das vereinbarte Leadpaket wiederholt Anlage 3 § 2 diese Zusage");
      expect(anlage(3, mitPaket, junior)).toContain("erst nach der ersten Paketbuchung möglich");
    });

    it("Leads einzeln: eigener Absatz 2a, kein Paket, keine Anlage 3", () => {
      const t = hauptvertrag(einzeln, junior);
      expect(t).toContain("(2a) Einzelne Leads sind jederzeit und in beliebiger Zahl zum Stückpreis laut Anlage 1 erwerbbar");
      expect(t).toContain("Eine vorherige oder gleichzeitige Buchung eines Leadpakets ist dafür nicht erforderlich");
      expect(t).toContain("Abweichend vom Regelmodell ist für diesen Vertrag der Einzelkauf einzelner Leads vereinbart");
      expect(t).not.toContain("Einzel-Leads sind erst nach der ersten Paketbuchung möglich");
      expect(vertragsAnlagen("junior", false, false, "neu").map((a) => a.nummer)).toEqual([1, 2]);
      const zeile = konditionenblattZeilen(konditionenAus(einzeln, { paket: junior })!)
        .find((z) => z.label === "Leadpaket")!.wert;
      expect(zeile).toContain(`Einzelne Leads jederzeit erwerbbar zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead zzgl. USt.`);
      expect(zeile).toContain("ohne Abnahmepflicht und ohne Mindestmenge");
      expect(zeile).toContain("individuell vereinbart, § 5 Absatz 2a");
    });

    it("Leads einzeln: Ersatzlead, Entgelt und Eigentum greifen", () => {
      const t = hauptvertrag(einzeln, junior);
      // Eigentum an den Leads.
      expect(t).toContain("sind Gesellschaftskontakte und bleiben Eigentum der Gesellschaft (§ 7)");
      // Entgelt, ausdrücklich auch für Einzel-Leads (Fassung 2026-09-29).
      expect(t).toContain("und der Stückpreis von Einzel-Leads sind Entgelt für die Gewinnung und Vorqualifizierung");
      expect(t).toContain("Auch bezahlte Leads verbleiben bei der Gesellschaft");
      // Ersatzlead samt Qualitätszusage, obwohl es keine Anlage 3 gibt.
      expect(t).toContain("bei Verfehlen der Qualitätszusage nach Absatz 3a");
      for (const zusage of LEAD_QUALITAETSZUSAGE) expect(t).toContain(zusage);
      expect(t).not.toContain("Für das vereinbarte Leadpaket wiederholt");
    });

    it("Auswahl und Paket schließen sich aus: mit Paket gewinnt das Paket", () => {
      // Die Sperre sitzt in konditionenAus, damit kein Aufrufer die
      // widersprüchliche Kombination erzeugen kann.
      const beides = bewerberStub({ leadEinzelkauf: true, leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>);
      expect(konditionenAus(beides, { paket: junior })!.leadEinzelkauf).toBe(false);
      expect(hauptvertrag(beides, junior)).not.toContain("(2a)");
    });
  });

  describe("Lead-Berater", () => {
    it("kein Leadkauf und Leadpaket: gestellte Leads, unverändert", () => {
      for (const b of [keinKauf, mitPaket]) {
        const t = hauptvertrag(b, leadBerater);
        expect(t).toContain("werden dem Vertriebspartner unentgeltlich zur Bearbeitung überlassen");
        expect(t).not.toContain("(2a)");
      }
    });

    it("Leads einzeln greift beim gestellten Leadmodell nicht", () => {
      // leadModell "gestellt" schließt den Einzelkauf aus; der Schalter läuft
      // ins Leere, statt einen widersprüchlichen Text zu erzeugen.
      expect(konditionenAus(einzeln, { paket: leadBerater })!.leadEinzelkauf).toBe(false);
      const t = hauptvertrag(einzeln, leadBerater);
      expect(t).not.toContain("(2a)");
      // Beim gestellten Leadmodell gibt es keinen Leadkauf, deshalb auch keine
      // Qualitätszusage: Der Absatz hätte dort keinen Anwendungsfall und hob
      // sich früher im letzten Satz selbst wieder auf.
      expect(t).not.toContain("(3a) Für jeden entgeltlich erworbenen Lead");
      expect(t).not.toContain("bei Verfehlen der Qualitätszusage nach Absatz 3a");
      // Die übrigen Ersatzgründe gelten weiter.
      expect(t).toContain("Ersetzt wird ein Lead bei nachweislichem Fake-Kontakt, falschen Kontaktdaten, Dublette, versehentlicher oder widerrufener Eintragung oder wenn gilt");
    });
  });

  it("die Qualitätszusage steht überall dort, wo Leads gekauft werden können", () => {
    // Vertriebspartner: immer, weil er jederzeit Leads kaufen kann.
    for (const b of [keinKauf, mitPaket, einzeln]) {
      const t = hauptvertrag(b, junior);
      expect(t).toContain("(3a) Für jeden entgeltlich erworbenen Lead, gleich ob einzeln erworben oder aus einem Leadpaket");
      for (const zusage of LEAD_QUALITAETSZUSAGE) expect(t).toContain(zusage);
    }
    // Lead-Berater: nie, weil dort alle Leads unentgeltlich gestellt werden.
    for (const b of [keinKauf, mitPaket, einzeln]) {
      expect(hauptvertrag(b, leadBerater)).not.toContain("(3a) Für jeden entgeltlich erworbenen Lead");
    }
    // Anlage 3 (Leadpaket) speist sich aus derselben Quelle.
    const a3 = anlage(3, mitPaket, junior);
    for (const zusage of LEAD_QUALITAETSZUSAGE) expect(a3).toContain(zusage);
  });
});

/* ── Teilweise vereinbarte Sätze: der Paketsatz gilt daneben ─────────────
 *
 * Christians Entscheidung vom 04.09.2026: "sollte nur lead satz eingetragen
 * werden dann gilt daneben immer der paketsatz". Der individuelle Satz
 * überschreibt nur seine eigene Art, nicht den ganzen Vertrag.
 *
 * Die Sätze bilden zwei vollständige Dimensionen: Lead und Eigen decken
 * zusammen jeden Kontakt ab (§ 7 Absatz 2 und 3), Bestand und Neubau jedes
 * Objekt. Ist eine Dimension ganz vereinbart, bleibt nichts übrig und der
 * Paketsatz darf nicht auftauchen. Ist sie nur halb vereinbart, muss er
 * ausdrücklich im Text stehen.
 */
describe("Restfall: Standardsatz des Pakets neben den individuellen Sätzen", () => {
  /** [Beschreibung, Felder, Restfall erwartet?] */
  const KOMBINATIONEN: [string, Partial<Bewerber>, boolean][] = [
    // Kontaktart nur halb: der Rest fällt auf den Paketsatz.
    ["nur Lead-Satz", { satzLead: "3" }, true],
    ["nur Eigen-Satz", { satzEigen: "5" }, true],
    // Kontaktart vollständig: Lead und Eigen decken jeden Kontakt ab.
    ["Lead und Eigen", { satzLead: "3", satzEigen: "5" }, false],
    // Objektart nur halb.
    ["nur Bestand", { satzBestand: "5" }, true],
    ["nur Neubau", { satzNeubau: "4,5" }, true],
    // Objektart vollständig: jedes Objekt ist Bestand oder Neubau.
    ["Bestand und Neubau", { satzBestand: "5", satzNeubau: "4,5" }, false],
    // Über Kreuz: beide Dimensionen halb, also bleibt ein Rest.
    ["Lead und Bestand", { satzLead: "3", satzBestand: "5" }, true],
    ["Lead und Neubau", { satzLead: "3", satzNeubau: "4,5" }, true],
    ["Eigen und Bestand", { satzEigen: "5", satzBestand: "5" }, true],
    ["Eigen und Neubau", { satzEigen: "5", satzNeubau: "4,5" }, true],
    // Sobald eine Dimension voll ist, ist nichts mehr offen.
    ["Lead, Eigen und Bestand", { satzLead: "3", satzEigen: "5", satzBestand: "5" }, false],
    ["Lead, Eigen und Neubau", { satzLead: "3", satzEigen: "5", satzNeubau: "4,5" }, false],
    ["Lead, Bestand und Neubau", { satzLead: "3", satzBestand: "5", satzNeubau: "4,5" }, false],
    ["Eigen, Bestand und Neubau", { satzEigen: "5", satzBestand: "5", satzNeubau: "4,5" }, false],
    ["alle vier Sätze", { satzLead: "3", satzEigen: "5", satzBestand: "5", satzNeubau: "4,5" }, false],
    // Der einheitliche Satz fängt den Rest selbst ab, allein und kombiniert.
    ["nur einheitlicher Satz", { satzIndividuell: "3,5" }, false],
    ["einheitlicher Satz und Lead", { satzIndividuell: "3,5", satzLead: "3" }, false],
    ["einheitlicher Satz und Eigen", { satzIndividuell: "3,5", satzEigen: "5" }, false],
    ["einheitlicher Satz und Bestand", { satzIndividuell: "3,5", satzBestand: "5" }, false],
    ["einheitlicher Satz und Neubau", { satzIndividuell: "3,5", satzNeubau: "4,5" }, false],
  ];

  for (const [paketName, paket] of [["Vertriebspartner", junior], ["Lead-Berater", leadBerater]] as const) {
    describe(paketName, () => {
      it.each(KOMBINATIONEN)("%s", (_titel, felder, restfallErwartet) => {
        const b = bewerberStub(felder);
        const s = provisionsSaetze(paket, b);
        expect(s.hasOverride).toBe(true);
        expect(s.hatRestfall).toBe(restfallErwartet);

        const paketZeile = `Standardsatz des Pakets ${paket.provisionssatz}% (für alle Abschlüsse ohne eigenen Satz)`;
        const paketRegel = `Für alle Abschlüsse, für die keiner der vorstehenden Sätze greift, gilt der Standardsatz des Pakets von ${paket.provisionssatz}%`;

        if (restfallErwartet) {
          // Ausdrücklich im Text, nicht nur stillschweigend: Satzliste und Rangfolge.
          expect(s.saetzeListe).toContain(paketZeile);
          expect(s.saetzeListe[s.saetzeListe.length - 1]).toBe(paketZeile);
          expect(s.anwendungsregel).toContain(paketRegel);
          expect(s.effektiverSatzText).toContain(paketZeile);
          // Und im gedruckten Konditionenblatt.
          const zeilen = konditionenblattZeilen(konditionenAus(b, { paket })!);
          expect(zeilen.find((z) => z.label === "Provision")!.wert).toContain(paketZeile);
          expect(zeilen.find((z) => z.label === "Rangfolge der Sätze")!.wert).toContain(paketRegel);
        } else {
          // Keine zwei Auffangregeln nebeneinander.
          expect(s.saetzeListe.join(" ")).not.toContain("Standardsatz des Pakets");
          expect(s.anwendungsregel).not.toContain("Standardsatz des Pakets");
          const zeilen = konditionenblattZeilen(konditionenAus(b, { paket })!);
          expect(zeilen.find((z) => z.label === "Provision")!.wert).not.toContain("Standardsatz des Pakets");
        }

        // Bei gesetztem einheitlichen Satz fängt allein dieser den Rest ab.
        if (felder.satzIndividuell) {
          expect(s.saetzeListe.some((z) => z.startsWith("Einheitlicher Satz"))).toBe(true);
          expect(s.anwendungsregel).toContain("Der einheitliche Satz gilt");
        }
      });
    });
  }

  it("Beispiel aus Christians Entscheidung: Lead 3, Eigen leer", () => {
    const b = bewerberStub({ satzLead: "3" });
    const s = provisionsSaetze(junior, b);
    expect(s.saetzeListe).toEqual([
      "Lead-Satz 3% (bei über OS Immobilien zugewiesenen Leads)",
      "Standardsatz des Pakets 4% (für alle Abschlüsse ohne eigenen Satz)",
    ]);
    expect(s.anwendungsregel).toBe(
      "Der Lead-Satz gilt für Abschlüsse mit Leads, die dem Vertriebspartner von der Gesellschaft zugewiesen wurden (Gesellschaftskontakte nach § 7 Absatz 2)."
      + " Für alle Abschlüsse, für die keiner der vorstehenden Sätze greift, gilt der Standardsatz des Pakets von 4%; er gilt neben den individuell vereinbarten Sätzen fort.",
    );
    // Der Partner liest im Vertrag beide Sätze, ohne schließen zu müssen.
    const zeile = konditionenblattZeilen(konditionenAus(b, { paket: junior })!)
      .find((z) => z.label === "Provision")!.wert;
    expect(zeile).toContain("Lead-Satz 3%");
    expect(zeile).toContain("Standardsatz des Pakets 4%");
  });

  it("ohne jeden individuellen Satz bleibt es beim Paketsatz ohne Zusatzzeile", () => {
    const s = provisionsSaetze(junior, bewerberStub());
    expect(s.hasOverride).toBe(false);
    expect(s.hatRestfall).toBe(false);
    expect(s.effektiverSatzText).toBe("4%");
    expect(s.saetzeListe).toEqual([]);
    expect(s.anwendungsregel).toBe("");
  });
});

/* ── Reguläre Verträge bleiben, wie Christian sie kennt ──────────────────
 *
 * Der Einzelkauf ist die Ausnahme und hängt an der Closing-Auswahl "Leads
 * einzeln". Ohne diese Auswahl muss der Text Wort für Wort dem Stand vor dem
 * 04.09.2026 entsprechen. Dieser Block nagelt die Stellen fest, die zwischen-
 * zeitlich allgemein geändert waren und wieder zurückgebaut wurden.
 */
describe("Rückbau: ohne die Auswahl 'Leads einzeln' ist der Text unverändert", () => {
  const FAELLE: [string, Partial<Bewerber>][] = [
    ["kein Leadpaket", {}],
    ["mit Leadpaket", { leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>],
    ["Individualfassung", { individuelleVertragsFassung: true, andereVertriebe: "Vertrieb A" }],
    ["individuelle Sätze", { satzLead: "3", satzEigen: "5" }],
    ["ohne CRM-Gebühr", { ohneCrmGebuehr: true }],
  ];

  for (const [paketName, paket] of [["Vertriebspartner", junior], ["Lead-Berater", leadBerater]] as const) {
    it.each(FAELLE)(`${paketName}: %s`, (_titel, felder) => {
      const b = bewerberStub(felder);
      const t = hauptvertrag(b, paket);
      const zeilen = konditionenblattZeilen(konditionenAus(b, { paket })!);

      // Kein Einzelkauf-Text, nirgends.
      expect(t).not.toContain("(2a)");
      expect(t).not.toContain("Einzelne Leads sind jederzeit");
      expect(t).not.toContain("Abweichend vom Regelmodell");
      expect(zeilen.map((z) => z.wert).join(" ")).not.toContain("Einzelne Leads jederzeit erwerbbar");

      // Die Leadklauseln des Vertriebspartners lauten wie vor der Änderung.
      if (paket === junior) {
        expect(t).toContain("Einzel-Leads sind erst nach der ersten Paketbuchung möglich");
        expect(t).toContain("mit Qualitätszusage und Ersatzlead-Regelung");
      }

      // Zahlungsweise unverändert: nur das Leadpaket, nicht der Einzelkauf.
      const zahlung = zeilen.find((z) => z.label === "Zahlungsweise")!.wert;
      expect(zahlung).toContain("Leadpaket nach Rechnung");
      expect(zahlung).not.toContain("einzeln erworbene Leads");

      // Und die Anlage 3 bleibt, wo sie ist.
      if (felder.leadPaket && paket === junior) {
        expect(anlage(3, b, paket)).toContain("erst nach der ersten Paketbuchung möglich");
      }
    });
  }

  it("die Paketübersicht im Closing ist unverändert", () => {
    expect(junior.features.join("\n")).toContain("Optionales Leadpaket");
    expect(junior.features.join("\n")).toContain("Einzel-Leads 150 € nach der ersten Paketbuchung");
    expect(junior.features.join("\n")).not.toContain("Leads jederzeit einzeln erwerbbar");
  });

  it("die einzige gewollte Änderung am regulären Text ist die Qualitätszusage", () => {
    // Gegen den Stand auf main verglichen bleibt genau das übrig: Der Verweis
    // in Absatz 3 zeigt auf den neuen Absatz 3a statt auf Anlage 3 § 2, und
    // Absatz 3a nennt die Zusage. Christian hat das am 04.09.2026 freigegeben.
    const t = hauptvertrag(bewerberStub(), junior);
    expect(t).toContain("bei Verfehlen der Qualitätszusage nach Absatz 3a");
    expect(t).not.toContain("bei Verfehlen der Qualitätszusage eines Leadpakets (Anlage 3 § 2)");
    expect(t).toContain("(3a) Für jeden entgeltlich erworbenen Lead");
  });
});

/* ── Paketwechsel und Leadauswahl: Verzeichnis und Renderer im Gleichschritt ──
 *
 * Reproduzierter Fehler: Ein Wechsel auf den Lead-Berater ließ ein gebuchtes
 * Leadpaket am Bewerber stehen. Das Anlagenverzeichnis las das Rohfeld und
 * listete Anlage 3, der Renderer las die normalisierten Konditionen und fand
 * kein Leadpaket. Der Vertrag ließ sich gar nicht mehr erzeugen.
 *
 * Beide Seiten gehen jetzt über hatLeadpaketAnlage. Diese Tests halten fest,
 * dass Verzeichnis und Renderer in jeder Kombination dasselbe sagen.
 */
describe("Leadpaket-Anlage: eine Quelle für Verzeichnis und Renderer", () => {
  const mitPaket = { leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>;

  it("Lead-Berater mit stehengebliebenem Leadpaket: keine Anlage 3, kein Abbruch", () => {
    const b = bewerberStub({ ...mitPaket, paketwahl: "lead_berater" } as Partial<Bewerber>);
    // Die normalisierten Konditionen kennen beim gestellten Leadmodell kein Paket.
    expect(konditionenAus(b, { paket: leadBerater })!.leadPaket).toBeNull();
    // Und das Verzeichnis sagt dasselbe, statt eine Anlage 3 zu versprechen.
    expect(hatLeadpaketAnlage(b, "lead_berater")).toBe(false);
    expect(vertragsAnlagen("lead_berater", false, hatLeadpaketAnlage(b, "lead_berater"), "neu").map((a) => a.nummer))
      .toEqual([1, 2]);
    // Der Vertrag lässt sich erzeugen; früher brach genau das hier ab.
    expect(() => hauptvertrag(b, leadBerater)).not.toThrow();
    expect(() => anlage(1, b, leadBerater)).not.toThrow();
    expect(() => anlage(2, b, leadBerater)).not.toThrow();
  });

  it("Vertriebspartner mit Leadpaket: Anlage 3 im Verzeichnis und erzeugbar", () => {
    const b = bewerberStub({ ...mitPaket, paketwahl: "junior" } as Partial<Bewerber>);
    expect(hatLeadpaketAnlage(b, "junior")).toBe(true);
    expect(vertragsAnlagen("junior", false, hatLeadpaketAnlage(b, "junior"), "neu").map((a) => a.nummer))
      .toEqual([1, 2, 3]);
    expect(() => anlage(3, b, junior)).not.toThrow();
  });

  it("jede Anlage im Verzeichnis lässt sich auch erzeugen", () => {
    // Der Kern: Was das Verzeichnis listet, muss der Renderer liefern können.
    const FAELLE: [string, Partial<Bewerber>, typeof junior][] = [
      ["junior ohne alles", {}, junior],
      ["junior mit Leadpaket", mitPaket, junior],
      ["junior mit Einzelkauf", { leadEinzelkauf: true } as Partial<Bewerber>, junior],
      ["junior Einzelkauf plus Altwert", { leadEinzelkauf: true, ...mitPaket } as Partial<Bewerber>, junior],
      ["berater ohne alles", {}, leadBerater],
      ["berater mit Altwert Leadpaket", mitPaket, leadBerater],
      ["berater mit Altwert Einzelkauf", { leadEinzelkauf: true } as Partial<Bewerber>, leadBerater],
      ["berater mit beidem", { leadEinzelkauf: true, ...mitPaket } as Partial<Bewerber>, leadBerater],
    ];
    for (const [titel, felder, paket] of FAELLE) {
      const b = bewerberStub({ ...felder, paketwahl: paket.id } as Partial<Bewerber>);
      const verzeichnis = vertragsAnlagen(paket.id, false, hatLeadpaketAnlage(b, paket.id), "neu");
      for (const a of verzeichnis) {
        expect(() => anlage(a.nummer, b, paket), `${titel}: Anlage ${a.nummer}`).not.toThrow();
      }
      // Und umgekehrt: keine Anlage 3, wo es kein Leadpaket gibt.
      const hatDrei = verzeichnis.some((a) => a.nummer === 3);
      expect(hatDrei, titel).toBe(!!konditionenAus(b, { paket })!.leadPaket);
    }
  });

  it("Wechsel zwischen den drei Leadwegen: nie ein Rest, der den Vertrag sprengt", () => {
    // kein Kauf -> Paket -> einzeln -> kein Kauf, jeweils mit dem Stand, den
    // das Closing nach dem Wechsel speichert.
    const WECHSEL: [string, Partial<Bewerber>][] = [
      ["kein Kauf", { leadPaket: undefined, leadEinzelkauf: false } as Partial<Bewerber>],
      ["Leadpaket", { leadPaket: { betrag: 2500, anzahl: 20 }, leadEinzelkauf: false } as Partial<Bewerber>],
      ["einzeln", { leadPaket: undefined, leadEinzelkauf: true } as Partial<Bewerber>],
    ];
    for (const [titel, felder] of WECHSEL) {
      const b = bewerberStub({ ...felder, paketwahl: "junior" } as Partial<Bewerber>);
      const k = konditionenAus(b, { paket: junior })!;
      // Paket und Einzelkauf schließen sich immer aus.
      expect(!!k.leadPaket && k.leadEinzelkauf, titel).toBe(false);
      expect(() => hauptvertrag(b, junior), titel).not.toThrow();
      for (const a of vertragsAnlagen("junior", false, hatLeadpaketAnlage(b, "junior"), "neu")) {
        expect(() => anlage(a.nummer, b, junior), `${titel}: Anlage ${a.nummer}`).not.toThrow();
      }
    }
  });
});

describe("Leadpaket-Sätze nur, wo es ein Leadpaket gibt", () => {
  it("ohne Leadpaket kein Verweis auf eine Anlage 3, die es nicht gibt", () => {
    const b = bewerberStub({});
    const t = hauptvertrag(b, junior);
    // Das Verzeichnis kennt nur Anlage 1 und 2.
    expect(vertragsAnlagen("junior", false, hatLeadpaketAnlage(b, "junior"), "neu").map((a) => a.nummer)).toEqual([1, 2]);
    // Also darf § 5 nicht so tun, als würde nach Anlage 3 abgerechnet.
    expect(t).not.toContain("ein Leadpaket wird gesondert nach Anlage 3 abgerechnet");
    expect(t).toContain("für diesen Vertrag ist kein Leadpaket vereinbart");
    expect(t).toContain("Eine Verrechnung von Leadkosten mit Provisionen findet nicht statt.");
    // Der Verweis auf eine spätere Buchung bleibt zulässig und ist als solcher erkennbar.
    expect(t).toContain("Wird später ein Leadpaket vereinbart");
  });

  it("mit Leadpaket bleibt der Regeltext Wort für Wort erhalten", () => {
    const b = bewerberStub({ leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>);
    const t = hauptvertrag(b, junior);
    for (const satz of LEAD_KLAUSELN.junior) expect(t).toContain(satz);
    expect(t).not.toContain("Wird später ein Leadpaket vereinbart");
  });

  it("die Auswahlfunktion liefert das Regelmodell unverändert, wo es passt", () => {
    expect(leadKlauselnFuerVertrag("junior", true)).toEqual(LEAD_KLAUSELN.junior);
    expect(leadKlauselnFuerVertrag("lead_berater", false)).toEqual(LEAD_KLAUSELN.lead_berater);
    expect(leadKlauselnFuerVertrag("junior", false)).not.toEqual(LEAD_KLAUSELN.junior);
  });
});

/* ── Alles wird gestellt: kein laufendes Entgelt, keine Servicevereinbarung ──
 *
 * § 86a Absatz 1 HGB verlangt die unentgeltliche Überlassung der zur Ausübung
 * erforderlichen Unterlagen, Absatz 3 macht Abweichungen unwirksam. Die
 * Rechtsprechung zählt Vertriebssoftware dazu (BGH VIII ZR 10/10, OLG Köln
 * 19 U 21/22 und 19 U 73/23). Deshalb ist das CRM unentgeltlich.
 *
 * Vom 04.09. bis 06.09.2026 gab es daneben die Servicevereinbarung (Anlage 3,
 * 150 Euro brutto im Monat, zwölf Monate Mindestlaufzeit) für sechs
 * Leistungen, die über das Erforderliche hinausgehen. Seit dem 07.09.2026
 * stellt die Gesellschaft auch diese sechs Leistungen unentgeltlich; § 3
 * Absatz 1 zählt sie auf. Dieser Block ersetzt die früheren Tests zur
 * Servicevereinbarung und hält fest, dass sie nirgends mehr vorkommt.
 */
describe("Alles wird gestellt (Fassung 2026-09-07)", () => {
  const SCHALTER_FAELLE: [string, Partial<Bewerber>][] = [
    ["Standard", {}],
    ["Altwert ohneCrmGebuehr", { ohneCrmGebuehr: true }],
    ["Altwert laufzeitOffen", { laufzeitOffen: true }],
    ["Individualfassung", { individuelleVertragsFassung: true, andereVertriebe: "Vertrieb A" }],
    ["mit Leadpaket", { leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>],
    ["Leads einzeln", { leadEinzelkauf: true } as Partial<Bewerber>],
    ["individuelle Sätze", { satzLead: "3", satzEigen: "5" }],
  ];

  /** Hauptvertrag, Konditionenblatt und alle Anlagen dieses Vertrages als ein Text. */
  function gesamterVertragstext(b: Bewerber, paket: typeof junior): string {
    const ctx = erstelleVertragsKontext({ bewerber: b, paket });
    const teile = [hauptvertrag(b, paket)];
    for (const z of konditionenblattZeilen(ctx.konditionen!)) teile.push(`${z.label}: ${z.wert}`);
    for (const a of vertragsAnlagenAusKontext(ctx)) teile.push(anlage(a.nummer, b, paket));
    return teile.join("\n");
  }

  for (const [paketName, paket] of [["Vertriebspartner", junior], ["Lead-Berater", leadBerater]] as const) {
    describe(paketName, () => {
      it.each(SCHALTER_FAELLE)("%s: weder Servicevereinbarung noch 150 Euro noch Mindestlaufzeit im gesamten Vertragswerk", (_titel, felder) => {
        const alles = gesamterVertragstext(bewerberStub(felder), paket);
        expect(alles).not.toMatch(/Servicevereinbarung|Serviceentgelt|Service-Entgelt|Zusatzleistungen an, die der Vertriebspartner buchen/);
        // Der Einzel-Lead kostet ebenfalls 150 Euro netto; verboten ist nur die
        // Gebühr, also 150 Euro als Monatsbetrag oder als Bruttobetrag.
        expect(alles).not.toMatch(/150\s?(€|Euro|EUR)\s?(brutto|\/\s?Monat|im Monat|monatlich)/);
        expect(alles).not.toMatch(/Mindestlaufzeit (?:beträgt|von) \d+|\d+ Monate Mindestlaufzeit|mindestens für \d+ Monate|nach Ablauf der Mindestlaufzeit/);
        expect(alles).not.toContain("CRM-Systemgebühr");
        expect(alles).not.toContain("CRM-Gebühr");
        // Anlage 4 ist seit Fassung 2026-09-26 die Vereinbarung zum Meta
        // Pixel. Dass sie nicht wieder die Servicevereinbarung ist, prüft das
        // erste Suchmuster oben.
      });

      it("das CRM ist unentgeltlich, und die sechs früheren Zusatzleistungen stehen als gestellt in § 3 Absatz 1", () => {
        const t = hauptvertrag(bewerberStub(), paket);
        expect(t).toContain("stellt dem Vertriebspartner für die Dauer dieses Vertrages unentgeltlich alles zur Verfügung");
        expect(t).toContain("(§ 86a Absatz 1 HGB)");
        expect(t).toContain("Für diese Leistungen schuldet der Vertriebspartner kein Entgelt");
        expect(t).toContain("eine abweichende Vereinbarung wäre nach § 86a Absatz 3 HGB unwirksam");
        expect(t).toContain("Darüber hinaus stellt die Gesellschaft dem Vertriebspartner ebenfalls unentgeltlich und ohne gesonderte Vereinbarung zur Verfügung");
        for (const z of GESTELLTE_ZUSATZLEISTUNGEN) {
          expect(t, z.titel).toContain(z.titel);
          expect(t, z.titel).toContain(z.beschreibung);
        }
        expect(t).toContain("Auch für diese Leistungen schuldet der Vertriebspartner kein Entgelt");
        expect(t).toContain("eine Teilnahmepflicht ebenfalls nicht");
        expect(t).toContain("ein laufendes Entgelt entsteht aus diesem Vertrag nicht");
      });

      it("§ 3 hat wieder vier Absätze, und die Verweise auf Absatz 2 und 4 zeigen auf Nutzungsrecht und Mengenvorbehalt", () => {
        // Der Einschub der Servicevereinbarung als § 3 Absatz 2 hatte vom
        // 04.09. bis 06.09.2026 alle Verweise auf § 3 Absatz 2 (Nutzungsrecht)
        // und § 3 Absatz 4 (kein Mengenanspruch) um einen Absatz verschoben.
        const { texte, tools } = makeCapture();
        renderHauptvertrag(tools, erstelleVertragsKontext({ bewerber: bewerberStub(), paket }));
        const von = texte.findIndex((t) => t.startsWith("§ 3 "));
        const bis = texte.findIndex((t) => t.startsWith("§ 4 "));
        const absaetze = texte.slice(von + 1, bis).map((t) => t.match(/^\((\d+[a-z]?)\)/)?.[1]).filter(Boolean);
        expect(absaetze).toEqual(["1", "2", "3", "4"]);
        expect(texte[von + 2]).toMatch(/^\(2\) Der Vertriebspartner erhält ein nicht ausschließliches/);
        expect(texte[von + 4]).toMatch(/^\(4\) Ein Anspruch auf bestimmte Lead-, Objekt- oder Schulungsmengen/);
        const t = texte.join("\n");
        // § 5 Absatz 3a gibt es nur, wo Leads gekauft werden können.
        if (paket === junior) expect(t).toContain("für sie gilt § 3 Absatz 4.");
        expect(t).toContain("wird keine Haftung übernommen (§ 3 Absatz 4)");
        expect(t).toContain("(Absatz 7, § 3 Absatz 2, § 9)");
      });

      it("der Handelsvertretervertrag folgt der Kündigungsstaffel des § 89 HGB und hat keine Mindestlaufzeit", () => {
        const t = hauptvertrag(bewerberStub(), paket);
        expect(t).toContain("Es gelten die gesetzlichen Fristen des § 89 Absatz 1 HGB");
        expect(t).toContain("im ersten Vertragsjahr ein Monat, im zweiten Jahr zwei Monate, im dritten bis fünften Jahr drei Monate und ab dem sechsten Jahr sechs Monate");
        expect(t).toContain("dürfen nicht verkürzt werden (§ 89 Absatz 2 HGB)");
        expect(t).toContain("Eine Mindestlaufzeit für diesen Vertrag besteht nicht");
        expect(t).toContain("Die Nutzung des CRM-Systems und der übrigen Leistungen nach § 3 Absatz 1 besteht für die Dauer dieses Vertrages");
        // § 12 hat vier Absätze; der frühere Absatz 4 zur Servicevereinbarung ist weg.
        expect(t).toContain("(4) Provisionsansprüche aus Abschlüssen, die bis zum Vertragsende");
        expect(t).not.toContain("(5) Provisionsansprüche aus Abschlüssen");
        expect(t).not.toContain("Jede Partei kann jederzeit mit einer Frist von einem Monat zum Monatsende");
      });

      /*
       * Der Tätigkeitsmaßstab, Fassung 2026-09-10. Geprüft wird dreierlei:
       * dass er im Vertrag steht, dass er in § 12 und nicht in § 6 steht (als
       * Pflicht formuliert verlangte er den Erfolg statt des Bemühens, § 86
       * Absatz 1 HGB), und dass er die Aussage des Absatzes 1 zur fehlenden
       * Mindestlaufzeit nicht verdrängt hat.
       */
      it("§ 12 Absatz 1a nennt den Tätigkeitsmaßstab von zwei Quartalen, ohne eine Pflicht zu begründen", () => {
        const t = hauptvertrag(bewerberStub(), paket);
        expect(t).toContain("(1a) Tätigkeitsmaßstab und Kündigung wegen Inaktivität.");
        expect(t).toContain("bemüht sich fortlaufend um die Vermittlung von Immobilienkaufverträgen (§ 86 Absatz 1 HGB)");
        expect(t).toContain("mindestens ein über die Gesellschaft vermittelter und notariell beurkundeter Immobilienkaufvertrag innerhalb von zwei aufeinanderfolgenden Kalenderquartalen");
        expect(t).toContain("kann die Gesellschaft den Vertrag wegen Inaktivität ordentlich nach Absatz 1 kündigen");
        expect(t).toContain("weist die Gesellschaft in Textform auf die ausbleibende Tätigkeit hin");
        expect(t).toContain("Gelegenheit zur Stellungnahme innerhalb von zwei Wochen");
        expect(t).toContain("Das bei Vertragsbeginn laufende Quartal bleibt außer Betracht.");
        expect(t).toContain("Zeiten nachgewiesener Arbeitsunfähigkeit, des Mutterschutzes, der Elternzeit");
        expect(t).toContain("der Ausgleichsanspruch nach § 89b HGB bleiben unberührt");
        // Keine Mindestlaufzeit: Ein Maßstab ist keine, und Absatz 1 sagt das
        // weiterhin.
        expect(t).toContain("Eine Mindestlaufzeit für diesen Vertrag besteht nicht");

        // Der Maßstab steht in § 12, § 6 verweist nur darauf.
        const { texte, tools } = makeCapture();
        renderHauptvertrag(tools, erstelleVertragsKontext({ bewerber: bewerberStub(), paket }));
        const bis = (von: string, nach: string) =>
          texte.slice(texte.findIndex((x) => x.startsWith(von)) + 1, texte.findIndex((x) => x.startsWith(nach)));
        const zwoelf = bis("§ 12 ", "§ 13 ");
        const sechs = bis("§ 6 ", "§ 7 ");
        expect(zwoelf.map((x) => x.match(/^\((\d+[a-z]?)\)/)?.[1]).filter(Boolean)).toEqual(["1", "1a", "2", "3", "4"]);
        expect(zwoelf.join("\n")).toContain("Tätigkeitsmaßstab und Kündigung wegen Inaktivität");
        expect(sechs.join("\n")).not.toContain("zwei aufeinanderfolgenden Kalenderquartalen");
        expect(sechs[0]).toContain("Der Maßstab einer aktiven Tätigkeit und die Folgen ausbleibender Tätigkeit ergeben sich aus § 12 Absatz 1a.");
      });

      it("das Konditionenblatt nennt die gestellten Leistungen und kein laufendes Entgelt", () => {
        const zeilen = Object.fromEntries(konditionenblattZeilen(konditionenAus(bewerberStub(), { paket })!).map((z) => [z.label, z.wert]));
        expect(zeilen["Leistungen der Gesellschaft"]).toMatch(/^Unentgeltlich: das CRM-System/);
        expect(zeilen["Laufendes Entgelt"]).toBe("Keines. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit (§ 2 Absatz 2)");
        expect(zeilen["Zahlungsweise"]).toMatch(/^Keine laufenden Entgelte, Leadpaket nach Rechnung/);
        expect(zeilen["Vertragsfassung"]).toContain(`Vertragstext ${VERTRAGS_FASSUNG}; Bestandteile: Hauptvertrag, Anlage 1, Anlage 2`);
        expect(Object.keys(zeilen).some((l) => /Servicevereinbarung|CRM-System und Objektzugang/.test(l))).toBe(false);
      });
    });
  }

  it("die Anlagen laufen 1, 2, 3 in dieser Reihenfolge, das Leadpaket ist Anlage 3", () => {
    // Fassung 2026-09-10: ohne Anlage 4, so wie diese Verträge unterschrieben sind.
    const beides = bewerberStub({ leadPaket: { betrag: 2500, anzahl: 20 }, vertragFassung: "2026-09-10" } as Partial<Bewerber>);
    const liste = vertragsAnlagen("junior", false, true, "neu");
    expect(liste.map((a) => a.nummer)).toEqual([1, 2, 3]);
    expect(liste.map((a) => a.titel)).toEqual([ANLAGE_TITEL[1], ANLAGE_TITEL[2], ANLAGE_TITEL[3]]);
    expect(ANLAGE_TITEL[3]).toBe("Leadpaket-Vereinbarung");
    expect(ANLAGE_TITEL[4]).toContain("Art. 26 DSGVO");
    expect(LEADPAKET_ANLAGE_NUMMER).toBe("Anlage 3");
    // Und jede davon lässt sich erzeugen.
    for (const a of liste) expect(() => anlage(a.nummer, beides, junior), `Anlage ${a.nummer}`).not.toThrow();
  });

  it("die Fassungskennung ist auf den 29.09.2026 gehoben", () => {
    // 2026-09-10: Tätigkeitsmaßstab in § 12 Absatz 1a. 2026-09-26: Anlage 4
    // (Meta Pixel). 2026-09-29: Paketpreis und Anlage 3 § 1a. Die Kennung
    // muss mit jeder Textänderung steigen, sonst bleibt nicht ablesbar, wer
    // welchen Text unterschrieben hat.
    expect(VERTRAGS_FASSUNG).toBe("2026-09-29");
  });
});

/* ── Keine Verweise auf Bestandteile, die es nicht gibt ──────────────────
 *
 * Nach dem Umbau auf die Servicevereinbarung verwies § 3 Absatz 2 auf eine
 * Aufschlüsselung, die Anlage 3 seit der Streichung der Einzelbeträge nicht
 * mehr enthält, und mehrere Stellen nannten Anlagennummern, die in der
 * jeweiligen Konstellation gar nicht entstehen. Dieser Test läuft über alle
 * 64 Kombinationen aus vier Schaltern, Leadpaket und beiden Paketen.
 */
describe("Vertrag verweist nie auf einen Bestandteil, den er nicht enthält", () => {
  const SCHALTER = ["ohneCrmGebuehr", "laufzeitOffen", "individuelleVertragsFassung", "leadEinzelkauf"] as const;

  it("jede genannte Anlagennummer existiert auch, in allen 64 Kombinationen", () => {
    const funde: string[] = [];
    for (const paket of [junior, leadBerater]) {
      for (let maske = 0; maske < 16; maske++) {
        for (const mitPaket of [false, true]) {
          const felder: Record<string, unknown> = { paketwahl: paket.id };
          const namen: string[] = [];
          SCHALTER.forEach((k, i) => { if (maske & (1 << i)) { felder[k] = true; namen.push(k); } });
          if (mitPaket) { felder.leadPaket = { betrag: 2500, anzahl: 20 }; namen.push("leadPaket"); }
          const b = bewerberStub(felder as Partial<Bewerber>);
          const anlagen = vertragsAnlagen(paket.id, !!b.individuelleVertragsFassung,
            hatLeadpaketAnlage(b, paket.id), "neu", hatMetaPixelAnlage(b, paket.id));
          const nummern = new Set(anlagen.map((a) => a.nummer));
          const teile = [hauptvertrag(b, paket)];
          for (const z of konditionenblattZeilen(konditionenAus(b, { paket })!)) teile.push(`${z.label}: ${z.wert}`);
          for (const a of anlagen) if (a.nummer !== 1) teile.push(anlage(a.nummer, b, paket));
          const alles = teile.join("\n");
          const id = `${paket.id} [${namen.join(",") || "standard"}]`;
          for (const m of alles.matchAll(/Anlage (\d)/g)) {
            if (!nummern.has(Number(m[1]))) {
              funde.push(`${id}: verweist auf Anlage ${m[1]}, hat aber nur ${[...nummern].join(", ")}`);
            }
          }
          // Und keine Aussage über eine Aufschlüsselung, die es nicht gibt.
          for (const muster of [/Entgeltanteil/, /einzeln bepreist/, /aufgeschlüsselt/]) {
            const t = alles.match(muster);
            if (t) funde.push(`${id}: behauptet eine Aufteilung ("${t[0]}"), die Anlage 3 nicht enthält`);
          }
        }
      }
    }
    expect([...new Set(funde)]).toEqual([]);
  });

  it("ohne Leadpaket verweist der Hauptvertrag auf keine Anlage 3", () => {
    // Bis zum 06.09.2026 hing Anlage 3 an der Servicevereinbarung. Seit dem
    // 07.09.2026 ist Anlage 3 das Leadpaket, und ohne Leadpaket gibt es sie nicht.
    const ohne = hauptvertrag(bewerberStub({}), junior);
    expect(ohne).not.toContain("Anlage 3");
    const mit = hauptvertrag(bewerberStub({ leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>), junior);
    expect(mit).toContain("Anlage 3 - Leadpaket-Vereinbarung (optionales Leadpaket)");
  });
  it("Deckblatt und Anlagenverzeichnis nennen dieselbe Nummer und denselben Titel", () => {
    // Der volle Titel eines Anlagen-Deckblatts kommt aus dem Verzeichnis des
    // Vertrages. Eine Anlage, die dieser Vertrag nicht führt, darf gar kein
    // Deckblatt bekommen.
    const ctx = erstelleVertragsKontext({ bewerber: bewerberStub({}), paket: junior });
    const verzeichnis = vertragsAnlagenAusKontext(ctx);
    expect(verzeichnis.length).toBeGreaterThan(0);
    for (const a of verzeichnis) expect(anlageVollTitel(a.nummer, ctx)).toBe(a.titel);
    const fehlt = [1, 2, 3, 4, 9].find((n) => !verzeichnis.some((a) => a.nummer === n));
    if (fehlt !== undefined) expect(() => anlageVollTitel(fehlt, ctx)).toThrow();

    // Ohne Leadpaket gibt es keine Anlage 3, und es entsteht auch kein
    // Deckblatt dafür; mit Leadpaket trägt sie dessen Titel.
    expect(vertragsAnlagenAusKontext(ctx).some((a) => a.nummer === 3)).toBe(false);
    expect(() => anlageVollTitel(3, ctx)).toThrow();
    const mit = erstelleVertragsKontext({ bewerber: bewerberStub({ leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>), paket: junior });
    expect(anlageVollTitel(3, mit)).toBe(ANLAGE_TITEL[3]);
  });
});

/* ── Anlage 4: Meta Pixel (Fassung 2026-09-26) ───────────────────────────
 *
 * Christians Entscheidung vom 26.09.2026: Neue Partner unterschreiben
 * Anlage 4 mit, Bestandspartner bekommen nichts nachträglich. Entscheidend
 * ist die Fassungskennung am Dokument. Ein Vertrag mit 2026-09-10 muss auch
 * beim Neuaufbau zur Gegenzeichnung genau den alten Text behalten.
 */
describe("Anlage 4: Meta Pixel nach Art. 26 DSGVO", () => {
  const neu = (extra: Partial<Bewerber> = {}) => bewerberStub({ paketwahl: "junior", ...extra });
  const alt910 = (extra: Partial<Bewerber> = {}) => neu({ vertragFassung: "2026-09-10", vertragStatus: "gesendet", ...extra });

  it("gehört ab Kennung 2026-09-26 zum Vertrag, vorher nie, und nie zu Tippgeber oder Altfassung", () => {
    expect(hatMetaPixelAnlage(neu(), "junior")).toBe(true);
    expect(hatMetaPixelAnlage(neu({ vertragFassung: "2026-09-26" }), "junior")).toBe(true);
    expect(hatMetaPixelAnlage(neu(), "lead_berater")).toBe(true);
    for (const k of ["2026-09-04", "2026-09-07", "2026-09-10", VERTRAGS_FASSUNG_ALT]) {
      expect(hatMetaPixelAnlage(neu({ vertragFassung: k }), "junior"), k).toBe(false);
    }
    expect(hatMetaPixelAnlage(bewerberStub({ paketwahl: "tippgeber" }), "tippgeber")).toBe(false);
    expect(hatMetaPixelAnlage(bewerberStub({ paketwahl: "lead" }), "lead")).toBe(false);
    // Die gespeicherte Kennung eines Vertrags hebt beim Neuerzeugen auf die neue.
    expect(vertragsFassungKennung(alt910(), "junior")).toBe(VERTRAGS_FASSUNG);
  });

  it("behält Nummer 4 auch ohne Leadpaket: Anlagen 1, 2, 4 und 1, 2, 3, 4", () => {
    const ohne = vertragsAnlagenAusKontext(erstelleVertragsKontext({ bewerber: neu(), paket: junior }));
    expect(ohne.map((a) => a.nummer)).toEqual([1, 2, 4]);
    expect(ohne[2].titel).toBe(ANLAGE_4_TITEL);
    const mit = vertragsAnlagenAusKontext(erstelleVertragsKontext({
      bewerber: neu({ leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>), paket: junior,
    }));
    expect(mit.map((a) => a.nummer)).toEqual([1, 2, 3, 4]);
    expect(getVertragsAnhaenge("junior", false, false, "neu", true)).toEqual([
      `Anlage 1 – ${ANLAGE_TITEL[1]}`, `Anlage 2 – ${ANLAGE_TITEL[2]}`, `Anlage 4 – ${ANLAGE_4_TITEL}`,
    ]);
    expect(akzeptanzHinweisText(erstelleVertragsKontext({ bewerber: neu(), paket: junior }))).toContain("sämtliche Anlagen 1-2 & 4 erhalten");
  });

  it("der Hauptvertrag verweist in § 9, § 14 Absatz 1 und § 14 Absatz 3 auf Anlage 4", () => {
    const t = hauptvertrag(neu());
    expect(t).toContain("regelt die Auftragsverarbeitungsvereinbarung (Anlage 2). Für den Einsatz eines eigenen Meta Pixels auf den Partnerseiten gilt Anlage 4.");
    expect(t).toContain(`Anlage 4 - ${ANLAGE_4_TITEL}`);
    expect(t).toContain("soweit er nicht ausdrücklich Textform genügen lässt (§ 4 Absatz 7, § 12, Anlage 4 § 11 Absatz 3)");
    const zeilen = Object.fromEntries(konditionenblattZeilen(erstelleVertragsKontext({ bewerber: neu(), paket: junior }).konditionen!).map((z) => [z.label, z.wert]));
    expect(zeilen["Vertragsfassung"]).toBe(`Vertragstext ${VERTRAGS_FASSUNG}; Bestandteile: Hauptvertrag, Anlage 1, Anlage 2, Anlage 4`);
  });

  it("ein Vertrag der Fassung 2026-09-10 bleibt Wort für Wort ohne Anlage 4, auch beim Neuaufbau", () => {
    for (const paket of [junior, leadBerater]) {
      const t = hauptvertrag(alt910({ paketwahl: paket.id }), paket);
      expect(t).not.toContain("Anlage 4");
      expect(t).not.toContain("Meta Pixel");
      expect(t).toContain("regelt die Auftragsverarbeitungsvereinbarung (Anlage 2).\n");
      expect(t).toContain("soweit er nicht ausdrücklich Textform genügen lässt (§ 4 Absatz 7, § 12); das gilt auch");
      const ctx = erstelleVertragsKontext({ bewerber: alt910({ paketwahl: paket.id }), paket });
      expect(vertragsAnlagenAusKontext(ctx).map((a) => a.nummer)).toEqual([1, 2]);
      expect(() => anlage(4, alt910({ paketwahl: paket.id }), paket)).toThrow(/2026-09-26/);
      const zeilen = Object.fromEntries(konditionenblattZeilen(ctx.konditionen!).map((z) => [z.label, z.wert]));
      expect(zeilen["Vertragsfassung"]).toBe("Vertragstext 2026-09-10; Bestandteile: Hauptvertrag, Anlage 1, Anlage 2");
    }
  });

  it("der Text: ohne Prüfvermerke, Platzhalter und Gedankenstriche, Retargeting ohne Ausnahme", () => {
    const text = anlage(4, neu());
    expect(text).toContain("§ 1 Gegenstand, Geltung und Rang");
    expect(text).toContain("§ 11 Verhältnis zu Anlage 2, Schlussbestimmungen");
    expect(ANLAGE_4_PARAGRAPHEN.map((p) => p.titel.match(/^§ (\d+)/)![1])).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
    );
    expect(text).not.toMatch(/\[Anwalt|\[E-Mail|\[den Link/);
    expect(text).not.toMatch(/[–—]/);
    expect(text).toContain("os@os-immobilien.com");
    expect(text).toContain("über den Link „Cookie-Einstellungen“ im Fuß jeder Seite");
    // § 2 Absatz 4: Verbot ohne Ausnahme durch spätere Textänderung.
    const p24 = ANLAGE_4_PARAGRAPHEN[1].absaetze.find((a) => a.startsWith("(4)"))!;
    expect(p24).toContain("keine Zielgruppen zum Retargeting");
    expect(p24).not.toContain("solange");
    // § 1 Absatz 2: Bestandteil des Vertrages, keine Bestätigung per Klick.
    expect(ANLAGE_4_PARAGRAPHEN[0].absaetze[1]).toContain("Bestandteil des Vertriebspartnervertrages");
    expect(text).not.toContain("sobald der Vertriebspartner sie im CRM-System bestätigt hat");
    // § 9: § 11 des Hauptvertrages gilt, nur neue Pflichten ohne Vertragsstrafe.
    expect(text).toContain("(4) § 11 des Hauptvertrages gilt auch für diese Anlage.");
    expect(text).toContain("bleibt es nach § 10 des Hauptvertrages sanktioniert");
    // Der Anhang für Betroffene hängt an und siezt (Gruppe F).
    expect(text).toContain("Anhang zu § 3 Absatz 2: Wesentlicher Inhalt für Betroffene");
    expect(ANLAGE_4_BETROFFENEN_TEXT.join(" ")).toMatch(/\bSie\b/);
  });
});

/* ── Fassung 2026-09-29: Paketpreis und Anlage 3 § 1a ────────────────────
 *
 * Freigabe vom 29.09.2026. Der Betrag heißt Paketpreis, Anlage 3 regelt
 * Einsatz, Zuteilung, Nachlieferung und Erstattung. Ältere Kennungen
 * behalten ihren Text, auch beim Neuaufbau zur Gegenzeichnung.
 */
describe("Fassung 2026-09-29: Leadpaket mit Paketpreis", () => {
  const keinKauf = bewerberStub({ paketwahl: "junior" } as Partial<Bewerber>);
  const mitPaket = bewerberStub({ paketwahl: "junior", leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>);
  const einzeln = bewerberStub({ paketwahl: "junior", leadEinzelkauf: true } as Partial<Bewerber>);
  const alt926 = (extra: Partial<Bewerber> = {}) => bewerberStub({ paketwahl: "junior", vertragFassung: "2026-09-26", ...extra } as Partial<Bewerber>);

  it("die Regel gilt ab Kennung 2026-09-29, nie für ältere oder ungültige", () => {
    expect(fassungHatPaketpreisRegel("2026-09-29")).toBe(true);
    expect(fassungHatPaketpreisRegel(VERTRAGS_FASSUNG)).toBe(true);
    for (const k of ["2026-09-26", "2026-09-10", VERTRAGS_FASSUNG_ALT, "", null, undefined]) {
      expect(fassungHatPaketpreisRegel(k), String(k)).toBe(false);
    }
  });

  it("§ 5 Absatz 2, Fall a: mit Leadpaket besteht der Anspruch allein aus dem Paket", () => {
    expect(hauptvertrag(mitPaket)).toContain("Eigenakquise und Empfehlungsgeschäft werden empfohlen. Einen Anspruch auf Zuteilung von Leads hat der Vertriebspartner allein aus dem vereinbarten Leadpaket nach Maßgabe der Leadpaket-Vereinbarung (Anlage 3); darüber hinaus besteht kein Anspruch auf Leadzuteilung.");
  });

  it("§ 5 Absatz 2, Fall b: ohne Paket und ohne Einzelkauf unverändert", () => {
    const t = hauptvertrag(keinKauf);
    expect(t).toContain("Eigenakquise und Empfehlungsgeschäft werden empfohlen; ein Anspruch auf Leadzuteilung besteht nicht.");
    expect(t).not.toContain("Einen Anspruch auf Zuteilung von Leads");
  });

  it("§ 5 Absatz 2, Fall c: beim Einzelkauf nur für erworbene und bezahlte Einzel-Leads", () => {
    const t = hauptvertrag(einzeln);
    expect(t).toContain("Abgerechnet wird jeder Einzelkauf gesondert nach Rechnung, zahlbar per Überweisung. Bezahlte, bei Vertragsende noch nicht zugewiesene Einzel-Leads erstattet die Gesellschaft zum Stückpreis.");
    expect(t).toContain("Eigenakquise und Empfehlungsgeschäft werden empfohlen; ein Anspruch auf Leadzuteilung besteht nur für Einzel-Leads, die der Vertriebspartner nach Absatz 2a erworben und bezahlt hat.");
    expect(t).not.toContain("ein Anspruch auf Leadzuteilung besteht nicht.");
  });

  it("§ 3 Absatz 4: Mengenanspruch nur, soweit der Vertrag ihn begründet", () => {
    const t = hauptvertrag(keinKauf);
    expect(t).toContain("(4) Ein Anspruch auf bestimmte Lead-, Objekt- oder Schulungsmengen besteht nur, soweit dieser Vertrag ihn ausdrücklich begründet (§ 5). Ein Anspruch auf bestimmte Umsätze, Abschlüsse oder ein bestimmtes Provisionsaufkommen besteht nicht; die Gesellschaft garantiert keine Umsätze");
  });

  it("§ 5 Absatz 4: Paketpreis ist Entgelt, Werbemaßnahmen sind solche der Gesellschaft", () => {
    const t = hauptvertrag(mitPaket);
    expect(t).toContain("(4) Der Paketpreis eines Leadpakets und der Stückpreis von Einzel-Leads sind Entgelt für die Gewinnung und Vorqualifizierung der vereinbarten Zahl qualifizierter Leads; sie werden für eine freiwillig gebuchte Zusatzleistung geschuldet, die Leistungen nach § 3 Absatz 1 bleiben unentgeltlich. Die Gesellschaft setzt den Paketpreis für eigene Werbemaßnahmen ein; diese sind Marketingmaßnahmen der Gesellschaft und keine Marketingmaßnahmen des Vertriebspartners. Weder Paketpreis noch Stückpreis begründen Eigentum oder ein sonstiges Recht an den Kontakten oder ihren Daten. Auch bezahlte Leads verbleiben bei der Gesellschaft");
    expect(t).not.toContain("Nutzungsentgelt");
    expect(t).not.toContain("Werbebudget");
  });

  it("§ 12 Absatz 3: mit Paket Verweis auf die Erstattung, ohne Paket kein zweiter Satz", () => {
    expect(hauptvertrag(mitPaket)).toContain("sie ist unentgeltlich und kann nicht gesondert gekündigt werden. Für ein bei Vertragsende nicht vollständig geliefertes Leadpaket gilt die Erstattungsregel der Leadpaket-Vereinbarung (Anlage 3 § 1a Absatz 5).");
    for (const b of [keinKauf, einzeln]) {
      const t = hauptvertrag(b);
      expect(t).toContain("sie ist unentgeltlich und kann nicht gesondert gekündigt werden.\n");
      expect(t).not.toContain("nicht anteilig erstattet");
      expect(t).not.toContain("Erstattungsregel der Leadpaket-Vereinbarung");
    }
  });

  it("Anlage 3: § 1 Absatz 1 und § 1a mit Einsatz, Zuteilung, Nachlieferung, Erstattung und Vorrang", () => {
    const t = anlage(3, mitPaket);
    expect(t).toContain(`(1) Der Vertriebspartner bucht das in Anlage 1 ausgewiesene Leadpaket. Die Gesellschaft verpflichtet sich, ihm 20 qualifizierte Leads nach Maßgabe des § 1a zuzuweisen. Der Paketpreis beträgt ${formatPreis(2500)} netto zuzüglich der jeweils gültigen Umsatzsteuer und ist nach Rechnung per Überweisung zu zahlen; er ist Entgelt im Sinne von § 5 Absatz 4 des Hauptvertrages. Die zugewiesenen Leads sind Gesellschaftskontakte im Sinne von § 7 Absatz 2 des Hauptvertrages.`);
    expect(t).toContain("§ 1a Einsatz des Paketpreises, Zuteilung und Nachlieferung");
    expect(t).toContain("in der Reihenfolge ihres Eingangs zu, sobald sie vorqualifiziert sind");
    expect(t).toContain("Eine bestimmte Menge je Woche oder je Monat ist nicht geschuldet");
    expect(t).toContain("nach billigem Ermessen (§ 315 BGB)");
    expect(t).toContain("innerhalb eines Monats ab Zahlungseingang für ihre Werbemaßnahmen ein, jedoch nicht vor Freischaltung des CRM-Zugangs");
    expect(t).toContain("Ein Lead gilt als geliefert, sobald er dem Vertriebspartner im CRM-System zugewiesen ist. Die Gesellschaft schaltet den CRM-Zugang unverzüglich frei, sobald der Vertriebspartner die dafür erforderlichen Angaben gemacht hat.");
    expect(t).toContain("Reklamierte Leads, die nach § 5 Absatz 3 des Hauptvertrages zu ersetzen sind, zählen nicht auf die vereinbarte Zahl. Ersatzleads zählen auf die vereinbarte Zahl.");
    expect(t).toContain("liefert die Gesellschaft die fehlenden Leads nach, bis die vereinbarte Zahl erreicht ist");
    expect(t).toContain(`(5) Endet der Hauptvertrag vor vollständiger Lieferung, gleich aus welchem Grund, erstattet die Gesellschaft für jeden nicht gelieferten Lead den Paketpreis geteilt durch die vereinbarte Zahl der Leads, bei diesem Paket ${formatPreis(125)} netto, zuzüglich der darauf entfallenden Umsatzsteuer. Die Erstattung ist binnen 14 Tagen nach Vertragsende fällig.`);
    expect(t).toContain("Die Gesellschaft kann mit fälligen Gegenforderungen aufrechnen, auch mit Rückforderungen nach § 4 Absatz 4; ein Abzug von Leadkosten von Provisionen findet weiterhin nicht statt.");
    // Nachlieferung ohne Frist oder Obergrenze (Entscheidung Christian, 29.09.2026).
    expect(t).toContain("(4) Reichen die mit dem Paketpreis gewonnenen Leads nicht aus, um die vereinbarte Zahl zu erreichen, liefert die Gesellschaft die fehlenden Leads nach, bis die vereinbarte Zahl erreicht ist.");
    expect(t).toContain("(6) Soweit § 3 Absatz 4, § 5 Absatz 2 oder § 12 Absatz 3 des Hauptvertrages einen Anspruch auf Leads oder eine Erstattung ausschließen, geht diese Vereinbarung vor.");
    expect(t).not.toContain("Werbebudget");
    expect(t).not.toContain("nicht anteilig erstattet");
    // Keine Gedankenstriche im Vertragstext.
    expect(t).not.toMatch(/[–—]/);
  });

  it("keine Gedankenstriche in Hauptvertrag, Konditionenblatt und Anlage 3 der Fassung 2026-09-29", () => {
    for (const b of [keinKauf, mitPaket, einzeln]) {
      expect(hauptvertrag(b)).not.toMatch(/[–—]/);
      expect(anlage(1, b)).not.toMatch(/[–—]/);
      for (const z of konditionenblattZeilen(konditionenAus(b, { paket: junior })!)) expect(z.wert, z.label).not.toMatch(/[–—]/);
    }
    expect(hauptvertrag(bewerberStub({ paketwahl: "lead_berater" } as Partial<Bewerber>), leadBerater)).not.toMatch(/[–—]/);
    expect(anlage(3, mitPaket)).not.toMatch(/[–—]/);
  });

  it("Erstattung je Lead: Paketpreis durch Anzahl, auf Cent", () => {
    expect(leadpaketPreisJeLead({ betrag: 2500, anzahl: 20 })).toBe(125);
    expect(leadpaketPreisJeLead({ betrag: 2700, anzahl: 21 })).toBe(128.57);
    expect(leadpaketPreisJeLead({ betrag: 2500, anzahl: 0 })).toBe(0);
    const { texte, tools } = makeCapture();
    renderLeadpaketAnlage(tools, { betrag: 2700, anzahl: 21 });
    expect(texte.join("\n")).toMatch(/bei diesem Paket 128,57\s€ netto/);
  });

  it("Konditionenblatt nennt Paketpreis, Einsatz binnen eines Monats und Nachlieferung", () => {
    const zeile = konditionenblattZeilen(konditionenAus(mitPaket, { paket: junior })!).find((z) => z.label === "Leadpaket")!.wert;
    expect(zeile).toBe(`${formatPreis(2500)} netto Paketpreis für 20 qualifizierte Leads; die Gesellschaft setzt den Paketpreis innerhalb eines Monats ab Zahlungseingang, frühestens ab Freischaltung des CRM-Zugangs, für ihre Werbemaßnahmen ein, weist die Leads nach Eingang zu und liefert fehlende nach; nicht gelieferte Leads werden bei Vertragsende anteilig erstattet; Einzelheiten in Anlage 3.`);
  });

  it("ein Vertrag der Fassung 2026-09-26 behält seinen Text, auch beim Neuaufbau", () => {
    const mitPaket926 = alt926({ leadPaket: { betrag: 2500, anzahl: 20 } } as Partial<Bewerber>);
    const t = hauptvertrag(mitPaket926);
    expect(t).toContain("Ein Entgelt für ein Leadpaket oder für Einzel-Leads ist ein Nutzungsentgelt");
    expect(t).toContain("Der Betrag eines Leadpakets wird bei Kündigung nicht anteilig erstattet.");
    expect(t).toContain("(4) Ein Anspruch auf bestimmte Lead-, Objekt- oder Schulungsmengen, Umsätze, Abschlüsse oder Provisionen besteht nicht");
    expect(t).toContain("Eigenakquise und Empfehlungsgeschäft werden empfohlen; ein Anspruch auf Leadzuteilung besteht nicht.");
    expect(t).not.toContain("Paketpreis");
    const a3 = anlage(3, mitPaket926);
    expect(a3).toContain("Das Paket umfasst 20 qualifizierte Leads");
    expect(a3).toContain("Werbebudget");
    expect(a3).not.toContain("§ 1a");
    const zeile = konditionenblattZeilen(konditionenAus(mitPaket926, { paket: junior })!).find((z) => z.label === "Leadpaket")!.wert;
    expect(zeile).toBe(`${formatPreis(2500)} netto für 20 qualifizierte Leads vereinbart, Einzelheiten in Anlage 3`);
    expect(hauptvertrag(alt926({ leadEinzelkauf: true } as Partial<Bewerber>))).toContain("Eigenakquise und Empfehlungsgeschäft werden empfohlen; ein Anspruch auf Leadzuteilung besteht nicht.");
  });

  it("die Altfassung druckt die Leadpaket-Zeile der Leistungsliste wie bisher", () => {
    expect(junior.features.find((f) => f.startsWith("Optionales Leadpaket"))).toContain("Paketpreis");
    const alt = paketMitAltfassungsGebuehr(junior);
    expect(alt.features).toContain(LEADPAKET_ZEILE_BIS_2026_09_28);
    expect(alt.features.join("\n")).not.toContain("Paketpreis");
  });
});
