/**
 * Die Seite „Partner werden“: drei Wege, Fragen je Weg, Prüfung der Anfrage, die Edge
 * Function am Quelltext und die Regel „neuer Lead, keine Automatik“.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PARTNER_EINWILLIGUNG_TEXT,
  PARTNER_EINWILLIGUNG_VERSION,
  PARTNER_FRAGEN,
  PARTNER_ROLLEN,
  PARTNER_WEGE,
  TIPPGEBER_ERLAUBNIS_HINWEIS,
  antwortenVollstaendig,
  istStilleAblehnung,
  lesbareAntworten,
  partnerStelleTitel,
  pruefeKontakt,
  pruefePartnerAnfrage,
  rollenFuerWeg,
  type PartnerWeg,
} from "../../../supabase/functions/_shared/partner-werden.ts";
import { waehleKennenlernNachfassEmpfaenger } from "../../../supabase/functions/_shared/bewerber-nachfass.ts";
import * as INHALT from "./inhalt";
import { DE_VIEWBOX } from "@/assets/deutschlandLaender";
import { partnerAnfrageRumpf } from "./absenden";

const WURZEL = process.cwd();
const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

function ersteAntworten(weg: PartnerWeg): Record<string, string> {
  return Object.fromEntries(PARTNER_FRAGEN[weg].map((f) => [f.schluessel, f.antworten[0].id]));
}

function anfrage(ueber: Record<string, unknown> = {}) {
  return {
    weg: "vertriebspartner",
    rolle: "finanzberater",
    antworten: ersteAntworten("vertriebspartner"),
    kontakt: { vorname: "Max", nachname: "Muster", email: "max@example.org", telefon: "+49 171 1234567", firma: "" },
    einwilligung: { erteilt: true, version: PARTNER_EINWILLIGUNG_VERSION, text: PARTNER_EINWILLIGUNG_TEXT, am: "2026-09-30T10:00:00.000Z" },
    hp: "",
    dauerMs: 40000,
    ...ueber,
  };
}

describe("Wege, Bereiche und Fragen", () => {
  it("drei Wege; Finanzberatung, Versicherung und Vertrieb können Tippgeber oder Vertriebspartner werden, Portfolio nur der Immobilienvertrieb", () => {
    expect(PARTNER_WEGE.map((w) => w.id)).toEqual(["tippgeber", "vertriebspartner", "portfolio"]);
    expect(rollenFuerWeg("tippgeber")).toEqual(["finanzberater", "versicherungsmakler", "vertriebler"]);
    expect(rollenFuerWeg("vertriebspartner")).toEqual(["finanzberater", "versicherungsmakler", "vertriebler"]);
    expect(rollenFuerWeg("portfolio")).toEqual(["immobilienvertrieb"]);
    // Geschlechtsneutral (G7).
    expect(PARTNER_ROLLEN.map((r) => r.text)).toEqual(["Finanzberatung", "Versicherung", "Vertrieb", "Immobilienvertrieb"]);
  });

  it("je Weg eindeutige Schlüssel und Antworten, am Ende immer das Gespräch", () => {
    for (const w of PARTNER_WEGE) {
      const fragen = PARTNER_FRAGEN[w.id];
      expect(new Set(fragen.map((f) => f.schluessel)).size, w.id).toBe(fragen.length);
      expect(fragen[fragen.length - 1].schluessel).toBe("start");
      for (const f of fragen) {
        expect(f.antworten.length).toBeGreaterThanOrEqual(2);
        expect(new Set(f.antworten.map((a) => a.id)).size).toBe(f.antworten.length);
      }
    }
  });

  it("der Tippgeber wird nicht nach der Erlaubnis gefragt, Vertriebspartner und Vertrieb nach § 34c", () => {
    const schluessel = (w: PartnerWeg) => PARTNER_FRAGEN[w].map((f) => f.schluessel);
    expect(schluessel("tippgeber")).toEqual(["kunden", "nachfrage", "start"]);
    expect(schluessel("vertriebspartner")).toEqual(["erlaubnis34c", "vermittlung", "kunden", "umfang", "region", "start"]);
    expect(schluessel("portfolio")).toEqual(["team", "einheiten", "erlaubnis34c", "region", "start"]);
    expect(PARTNER_FRAGEN.vertriebspartner[0].antworten.map((a) => a.text)).toEqual(["Ja", "Nein", "In Vorbereitung"]);
    expect(TIPPGEBER_ERLAUBNIS_HINWEIS).toMatch(/^Für die reine Weitergabe eines Kontakts ist in der Regel keine Erlaubnis nötig\./);
  });

  it("vollständig nur mit bekannten Antworten, lesbar als Frage und Text", () => {
    expect(antwortenVollstaendig("tippgeber", ersteAntworten("tippgeber"))).toBe(true);
    expect(antwortenVollstaendig("tippgeber", { ...ersteAntworten("tippgeber"), start: "morgen" })).toBe(false);
    const lesbar = lesbareAntworten("portfolio", ersteAntworten("portfolio"));
    expect(lesbar[0]).toEqual({ frage: "Wie viele Vertriebler sind bei euch aktiv?", antwort: "Nur ich" });
    expect(partnerStelleTitel("vertriebspartner", "versicherungsmakler")).toBe("Partner werden: Vertriebspartner, Versicherung");
    expect(partnerStelleTitel("portfolio", "immobilienvertrieb")).toBe("Partner werden: Portfolio-Partner");
  });
});

describe("Pflichtfelder und Prüfung der Anfrage", () => {
  it("Vorname, Nachname, E-Mail und Handy sind Pflicht, die Firma nicht", () => {
    const f = pruefeKontakt({ vorname: "", nachname: " ", email: "keine-mail", telefon: "", firma: "" });
    expect(Object.keys(f).sort()).toEqual(["email", "nachname", "telefon", "vorname"]);
    expect(pruefeKontakt({ vorname: "A", nachname: "B", email: "a@b.de", telefon: "12", firma: "" }).telefon).toMatch(/prüfe/);
    expect(pruefeKontakt({ vorname: "A", nachname: "B", email: "a@b.de", telefon: "0171 1234567" })).toEqual({});
  });

  it("nimmt eine vollständige Anfrage an", () => {
    const e = pruefePartnerAnfrage(anfrage());
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.anfrage.rolle).toBe("finanzberater");
      expect(e.anfrage.weg).toBe("vertriebspartner");
      expect(e.anfrage.einwilligung.version).toBe(PARTNER_EINWILLIGUNG_VERSION);
      expect(e.anfrage.einwilligung.erteiltAm).toBe("2026-09-30T10:00:00.000Z");
    }
  });

  it("lehnt unbekannten Weg, unpassenden Bereich, fehlende, fremde oder erfundene Antworten ab", () => {
    expect(pruefePartnerAnfrage(anfrage({ weg: undefined })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ weg: "setter" })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ rolle: "setter" })).ok).toBe(false);
    // Der Immobilienvertrieb gehört zum Portfolio-Weg, nicht zum Vertriebspartner.
    expect(pruefePartnerAnfrage(anfrage({ rolle: "immobilienvertrieb" })).ok).toBe(false);
    const { start: _weg, ...ohneStart } = ersteAntworten("vertriebspartner");
    expect(pruefePartnerAnfrage(anfrage({ antworten: ohneStart })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ antworten: { ...ersteAntworten("vertriebspartner"), start: "gestern" } })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ antworten: { ...ersteAntworten("vertriebspartner"), gehalt: "hoch" } })).ok).toBe(false);
    // Die Fragen eines anderen Wegs passen nicht.
    expect(pruefePartnerAnfrage(anfrage({ antworten: ersteAntworten("tippgeber") })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ weg: "tippgeber", antworten: ersteAntworten("tippgeber") })).ok).toBe(true);
    expect(
      pruefePartnerAnfrage(anfrage({ weg: "portfolio", rolle: "immobilienvertrieb", antworten: ersteAntworten("portfolio") })).ok,
    ).toBe(true);
  });

  it("ohne Einwilligung in einer bekannten Fassung mit genau ihrem Wortlaut nichts", () => {
    expect(PARTNER_EINWILLIGUNG_VERSION).toBe("2026-09-partner-v2");
    expect(PARTNER_EINWILLIGUNG_TEXT).toContain("höchstens [ZAHL PRÜFEN: 12 Monate]");
    expect(pruefePartnerAnfrage(anfrage({ einwilligung: null })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ einwilligung: { erteilt: true, version: "2026-09-v1", text: PARTNER_EINWILLIGUNG_TEXT } })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ einwilligung: { erteilt: true, version: PARTNER_EINWILLIGUNG_VERSION, text: "Ja" } })).ok).toBe(false);
    expect(pruefePartnerAnfrage(anfrage({ einwilligung: { erteilt: true, version: "toString", text: "Ja" } })).ok).toBe(false);
    // Fassung v1 gilt weiter, aber nur mit ihrem eigenen, kürzeren Wortlaut.
    const v1 = PARTNER_EINWILLIGUNG_TEXT.slice(0, PARTNER_EINWILLIGUNG_TEXT.indexOf(" Wir speichern"));
    const alt = pruefePartnerAnfrage(anfrage({ einwilligung: { erteilt: true, version: "2026-09-partner-v1", text: v1 } }));
    expect(alt.ok).toBe(true);
    if (alt.ok) expect(alt.anfrage.einwilligung).toMatchObject({ version: "2026-09-partner-v1", wortlaut: v1 });
    expect(pruefePartnerAnfrage(anfrage({ einwilligung: { erteilt: true, version: "2026-09-partner-v1", text: PARTNER_EINWILLIGUNG_TEXT } })).ok).toBe(false);
  });

  it("Honigtopf und Zeitfalle führen zur stillen Ablehnung", () => {
    expect(istStilleAblehnung(anfrage())).toBe(false);
    expect(istStilleAblehnung(anfrage({ hp: "https://spam.example" }))).toBe(true);
    expect(istStilleAblehnung(anfrage({ dauerMs: 1200 }))).toBe(true);
  });

  it("der Browser schickt den Wortlaut der Einwilligung und keine Einwilligung ohne Haken", () => {
    const basis = { weg: "tippgeber" as const, rolle: "vertriebler" as const, antworten: ersteAntworten("tippgeber"), kontakt: { vorname: " Max ", nachname: "M", email: "m@x.de", telefon: "0171 1234567", firma: "" }, hp: "", dauerMs: 9000.4 };
    const mit = partnerAnfrageRumpf({ ...basis, einwilligung: true }, "2026-09-30T10:00:00.000Z");
    expect(mit.einwilligung).toEqual({ erteilt: true, version: PARTNER_EINWILLIGUNG_VERSION, text: PARTNER_EINWILLIGUNG_TEXT, am: "2026-09-30T10:00:00.000Z" });
    expect((mit.kontakt as Record<string, string>).vorname).toBe("Max");
    expect(mit.weg).toBe("tippgeber");
    expect(mit.dauerMs).toBe(9000);
    expect(partnerAnfrageRumpf({ ...basis, einwilligung: false }).einwilligung).toBeNull();
    expect(pruefePartnerAnfrage(mit).ok).toBe(true);
  });
});

describe("Die Edge Function submit-partner-werden", () => {
  const quelle = lies("supabase/functions/submit-partner-werden/index.ts");
  const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("bremst je IP, prüft Honigtopf und Zeitfalle vor dem Schreiben und schreibt mit der Service-Rolle", () => {
    expect(code).toContain("checkEdgeRateLimit(");
    expect(code).toContain("SUPABASE_SERVICE_ROLE_KEY");
    const ablehnung = code.indexOf("istStilleAblehnung(body)");
    const pruefung = code.indexOf("pruefePartnerAnfrage(body)");
    const einfuegen = code.indexOf('.from("bewerbungen").insert(');
    expect(ablehnung).toBeGreaterThan(0);
    expect(pruefung).toBeGreaterThan(ablehnung);
    expect(einfuegen).toBeGreaterThan(pruefung);
  });

  it("startet keine Automatik: keine Mail, kein Bogen, keine Bewerberseite, nur die Glocke an HR", () => {
    for (const verboten of ["send-transactional-email", "versendeKennenlernen", "sorgeFuerBewerberSeite", "meldeNeuenBewerber", "functions.invoke"]) {
      expect(code, verboten).not.toContain(verboten);
    }
    expect(code).toContain("schreibeGlocke(");
    expect(code).toContain("ladeHrEmpfaenger(");
    expect(code).toContain("partnerWerden: pw");
    expect(code).toContain('status: "Eingang"');
    expect(code).toContain('prozess: "neu"');
    expect(code).toContain("saeubereKampagne(");
  });

  it("steht ohne Anmeldetor in config.toml", () => {
    expect(lies("supabase/config.toml")).toMatch(/\[functions\.submit-partner-werden\]\s*\nverify_jwt = false/);
  });

  it("die Nachfass-Sammelmail lässt diese Leads aus", () => {
    const auswahl = waehleKennenlernNachfassEmpfaenger(
      [{ id: "1", vorname: "Max", nachname: "M", email: "m@x.de", status: "Eingang", meta: { _type: "bewerber", partnerWerden: { rolle: "vertriebler" } } }],
      new Set(),
    );
    expect(auswahl.empfaenger).toHaveLength(0);
    expect(auswahl.ausgeschlossen[0]?.grund).toBe("Partner werden, wird angerufen");
  });
});

describe("Texte und Zahlen der Seite", () => {
  const alles = JSON.stringify(INHALT);

  it("offene Zahlen sind als Platzhalter markiert; Partner, Gesamtzahl und Standorte stehen fest", () => {
    const offen = INHALT.offenePlatzhalter();
    expect(offen.length).toBeGreaterThan(0);
    expect(offen.every((p) => p.startsWith("[ZAHL PRÜFEN: ") || p.startsWith("[BILD FEHLT: "))).toBe(true);
    expect(offen).toContain("[BILD FEHLT: Teamfoto]");
    expect(INHALT.ZAHLEN.partner).toBe("20+");
    // Christians Vorgabe vom 30.09.2026.
    expect(INHALT.ZAHLEN.objekteGesamt).toBe("91");
    expect(JSON.stringify(INHALT.UEBER_UNS.kennzahlen)).toContain('"wert":"91","text":"Objekte im Angebot"');
    // Die Objektzahl je Standort kommt live, ein Platzhalter steht dort nicht mehr.
    expect(JSON.stringify(INHALT.STANDORTE)).not.toMatch(INHALT.PLATZHALTER_MUSTER);
  });

  it("fünf Standorte ohne Magdeburg und Fürth, im Einstieg keine Städteliste", () => {
    expect(INHALT.STANDORTE.map((s) => s.name)).toEqual(["München", "Nürnberg", "Augsburg", "Hof", "Leipzig"]);
    expect(alles).not.toContain("Magdeburg");
    expect(alles).not.toContain("Fürth");
    const einstieg = JSON.stringify(INHALT.HERO);
    for (const s of INHALT.STANDORTE) expect(einstieg, s.name).not.toContain(s.name);
  });

  it("keine Provisionsangabe, Auszahlungsfrist nur beim Tippgeber", () => {
    expect(alles).not.toMatch(/\d\s*(%|Prozent)/);
    expect(JSON.stringify(INHALT.ABLAUF.tippgeber)).toContain(INHALT.ZAHLEN.tageBisAuszahlung);
    for (const weg of ["vertriebspartner", "portfolio"] as const) {
      expect(JSON.stringify(INHALT.ABLAUF[weg])).not.toContain(INHALT.ZAHLEN.tageBisAuszahlung);
      expect(JSON.stringify(INHALT.ABLAUF[weg])).toContain(INHALT.VERGUETUNG_FAELLIG);
    }
    const kachel = INHALT.ZAHLEN_TEXTE.kacheln.find((k) => k.wert === INHALT.ZAHLEN.tageBisAuszahlung);
    expect(kachel?.text).toMatch(/für Tippgeber/);
  });

  it("Rechtsbefunde: Angebot statt Bestand, keine Finanzierungszusage, Beratung nur beim Tippgeber", () => {
    expect(alles).not.toMatch(/Bestand|Geprüfte Objekte|wir finanzieren|aus einer Hand|Bedarf|bleibt dein Kunde|keine Verkäufer/);
    expect(INHALT.KONZEPT.h2).toBe("Wie sich eine Kapitalanlage-Immobilie rechnen kann");
    expect(JSON.stringify(INHALT.KONZEPT.karten)).toContain("Eine Finanzierung ohne Eigenkapital erhöht Rate und Risiko.");
    expect(INHALT.STIMMEN_TEXTE.augenbraue).toBe("Unsere Kunden");
    for (const weg of ["vertriebspartner", "portfolio"] as const) {
      expect(JSON.stringify(INHALT.ABLAUF[weg])).not.toMatch(/Beratung und Abwicklung übernehmen wir/);
    }
    expect(INHALT.HERO.karten.map((k) => k.weg)).toEqual(["tippgeber", "vertriebspartner", "portfolio"]);
  });

  it("keine Wörter mit Statusrisiko, keine Versprechen, keine Gedankenstriche", () => {
    for (const wort of ["Weisung", "Anstellung", "Arbeitgeber", "Arbeitszeit", "Einarbeitungspflicht", "garantiert", "Garantie", "sicheres Einkommen"]) {
      expect(alles, wort).not.toContain(wort);
    }
    expect(alles).not.toMatch(/[–—]/);
    expect(/\bStelle\b/.test(alles)).toBe(false);
  });

  it("die Stimmen sind als Kundenstimmen beschriftet, nicht als Partnerstimmen", () => {
    expect(INHALT.STIMMEN_TEXTE.h2).toMatch(/Kunden/);
    expect(INHALT.STIMMEN_TEXTE.fuss).toMatch(/keine Stimmen von Partnern/);
    expect(INHALT.STIMMEN.length).toBeGreaterThanOrEqual(4);
  });

  it("die Nadeln liegen in der Karte, Hof im Nordosten Bayerns", () => {
    const [, , breite, hoehe] = DE_VIEWBOX.split(" ").map(Number);
    for (const s of INHALT.STANDORTE) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(breite);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(hoehe);
    }
    const punkt = (n: string) => INHALT.STANDORTE.find((s) => s.name === n)!;
    // Nördlicher und östlicher als Nürnberg, südlicher als Leipzig.
    expect(punkt("Hof").y).toBeLessThan(punkt("Nürnberg").y);
    expect(punkt("Hof").x).toBeGreaterThan(punkt("Nürnberg").x);
    expect(punkt("Hof").y).toBeGreaterThan(punkt("Leipzig").y);
  });
});
