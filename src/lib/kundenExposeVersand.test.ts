import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  datumLang,
  EXPOSE_VERSAND_MIGRATION_FEHLT,
  exposeBezeichnung,
  gueltigBisAb,
  gueltigkeitsSatz,
  KUNDEN_EXPOSE_GUELTIG_TAGE,
  KUNDENLINK_ART_STANDARD,
  KUNDENLINK_MIGRATION_FEHLT,
  kundenansichtLink,
  kundenExposeBetreff,
  kundenExposeLink,
  kundenlinkBetreff,
  kundenlinkFuer,
  kundenlinkGlockenText,
  kundenlinkGlockenTitel,
  versandSpalteFehlt,
  wohnungTitel,
} from "../../supabase/functions/_shared/kunden-expose";
import { pruefeVersandAuftrag } from "../../supabase/functions/send-kunden-expose/auftrag";

/**
 * „Kundenlink senden“ (seit 23.09.2026): die Regeln von `send-kunden-expose`
 * und der Mailvorlage `kunden-expose`, für beide Arten (Objektübersicht und
 * Exposé). Welche Zeile ein Versand nimmt, prüft `kundenlinkZeile.test.ts`.
 *
 * Die Prüflinge liegen in `supabase/functions/`; Vitest schaut nur unter
 * `src`, deshalb liegt der Test hier. Die Vorlage selbst rendert
 * `supabase/functions/send-kunden-expose/vorlage_test.ts` mit Deno.
 */

const WURZEL = resolve(__dirname, "../..");
const lies = (pfad: string) => readFileSync(resolve(WURZEL, pfad), "utf8");

const O = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";
const K = "33333333-3333-4333-8333-333333333333";
const I = "44444444-4444-4444-8444-444444444444";

describe("der Kundenlink", () => {
  it("zeigt auf die veröffentlichte Adresse, mit Einheit oder für das ganze Objekt", () => {
    expect(kundenExposeLink("o1", "w7", "ab")).toBe("https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=ab");
    expect(kundenExposeLink("o1", null, "ab")).toBe("https://osimmobilien.netlify.app/expose/o1?token=ab");
  });

  it("führt bei der Objektübersicht auf /immobilie/<token>, ohne Wohnung in der Adresse", () => {
    expect(kundenansichtLink("ab")).toBe("https://osimmobilien.netlify.app/immobilie/ab");
    expect(kundenlinkFuer("objektuebersicht", "o1", "w7", "ab")).toBe("https://osimmobilien.netlify.app/immobilie/ab");
    expect(kundenlinkFuer("expose", "o1", "w7", "ab")).toBe(kundenExposeLink("o1", "w7", "ab"));
    expect(KUNDENLINK_ART_STANDARD).toBe("objektuebersicht");
  });

  it("gilt 60 Tage", () => {
    expect(KUNDEN_EXPOSE_GUELTIG_TAGE).toBe(60);
    const jetzt = new Date("2026-09-23T10:00:00Z");
    expect(gueltigBisAb(jetzt).toISOString()).toBe("2026-11-22T10:00:00.000Z");
    expect(datumLang(gueltigBisAb(jetzt))).toBe("22. November 2026");
  });
});

describe("Bezeichnung und Betreff", () => {
  it("nennt Wohnung, Straße und Ort, ohne das Fachwort WE", () => {
    expect(wohnungTitel("WE 7")).toBe("Wohnung 7");
    expect(wohnungTitel("12")).toBe("Wohnung 12");
    expect(wohnungTitel("")).toBe("Wohnung");
    expect(exposeBezeichnung({ mitEinheit: true, weNr: "WE7", adresse: "Parkstraße 8", ort: "Augsburg" }))
      .toBe("Wohnung 7, Parkstraße 8, Augsburg");
  });

  it("nimmt beim ganzen Objekt den Titel und lässt Doppeltes weg", () => {
    expect(exposeBezeichnung({ mitEinheit: false, objektTitel: "Haus am Park", adresse: "Parkstraße 8", ort: "Augsburg" }))
      .toBe("Haus am Park, Parkstraße 8, Augsburg");
    expect(exposeBezeichnung({ mitEinheit: false, objektTitel: "Parkstraße 8", adresse: "Parkstraße 8", ort: "Augsburg" }))
      .toBe("Parkstraße 8, Augsburg");
  });

  it("baut den Betreff wie vereinbart", () => {
    expect(kundenExposeBetreff("Wohnung 7, Parkstraße 8, Augsburg")).toBe("Dein persönliches Exposé: Wohnung 7, Parkstraße 8, Augsburg");
    expect(kundenExposeBetreff("")).toBe("Dein persönliches Exposé");
    expect(gueltigkeitsSatz("22. November 2026")).toBe("Der Link ist persönlich und bis 22. November 2026 gültig.");
  });

  it("baut den Betreff je Art, die Objektübersicht wie mit Christian vereinbart", () => {
    expect(kundenlinkBetreff("objektuebersicht", "Wohnung 7, Parkstraße 8, Augsburg")).toBe("Deine Objektübersicht: Wohnung 7, Parkstraße 8, Augsburg");
    expect(kundenlinkBetreff("objektuebersicht", "")).toBe("Deine Objektübersicht");
    expect(kundenlinkBetreff("expose", "Wohnung 7, Parkstraße 8, Augsburg")).toBe("Dein persönliches Exposé: Wohnung 7, Parkstraße 8, Augsburg");
    // Ohne Angabe bleibt es beim Exposé, so kommen ältere Aufrufe an.
    expect(kundenlinkBetreff(undefined, "Wohnung 7")).toBe("Dein persönliches Exposé: Wohnung 7");
  });
});

describe("Glocke beim ersten Öffnen, je Art", () => {
  it("nennt den Vornamen und die Art", () => {
    expect(kundenlinkGlockenTitel("objektuebersicht", "Martina", "Brandl")).toBe("Martina hat deine Objektübersicht geöffnet");
    expect(kundenlinkGlockenTitel("expose", "Martina")).toBe("Martina hat dein Exposé geöffnet");
    expect(kundenlinkGlockenTitel("objektuebersicht", "", "Brandl")).toBe("Brandl hat deine Objektübersicht geöffnet");
    expect(kundenlinkGlockenTitel("objektuebersicht", null)).toBe("Dein Kunde hat deine Objektübersicht geöffnet");
  });

  it("beschreibt, was geöffnet wurde", () => {
    expect(kundenlinkGlockenText("objektuebersicht", "Wohnung 7, Parkstraße 8, Augsburg"))
      .toBe("Die Objektübersicht Wohnung 7, Parkstraße 8, Augsburg wurde zum ersten Mal aufgerufen.");
    expect(kundenlinkGlockenText("expose", "")).toBe("Das Exposé wurde zum ersten Mal aufgerufen.");
  });
});

describe("fehlende Migration erkennen", () => {
  it("erkennt die Meldungen von Postgres und PostgREST", () => {
    expect(versandSpalteFehlt({ code: "42703", message: 'column objekt_exposes.gesendet_am does not exist' })).toBe(true);
    expect(versandSpalteFehlt({ code: "PGRST204", message: "Could not find the 'investment_id' column" })).toBe(true);
    expect(versandSpalteFehlt({ code: "42501", message: "permission denied" })).toBe(false);
    expect(versandSpalteFehlt(null)).toBe(false);
    expect(EXPOSE_VERSAND_MIGRATION_FEHLT).toBe("Migration Exposé-Versand noch nicht ausgeführt");
    expect(KUNDENLINK_MIGRATION_FEHLT).toBe("Migration Kundenlink noch nicht ausgeführt");
    expect(versandSpalteFehlt({ code: "42703", message: "column objekt_exposes.art does not exist" })).toBe(true);
  });
});

describe("Auftrag an send-kunden-expose", () => {
  it("nimmt Modus, Kunde, Investment, Objekt und Einheit an, ohne Art als Exposé", () => {
    expect(pruefeVersandAuftrag({ modus: "mail", kontaktId: K, investmentId: I, objektId: O, wohnungId: W }))
      .toEqual({ ok: true, auftrag: { modus: "mail", art: "expose", kontaktId: K, investmentId: I, objektId: O, wohnungId: W } });
  });

  it("nimmt die Objektübersicht an, mit Einstiegswohnung oder für das ganze Haus", () => {
    const mit = pruefeVersandAuftrag({ modus: "link", art: "objektuebersicht", kontaktId: K, investmentId: I, objektId: O, wohnungId: W });
    expect(mit.ok && mit.auftrag).toMatchObject({ art: "objektuebersicht", wohnungId: W });
    const ohne = pruefeVersandAuftrag({ modus: "link", art: "objektuebersicht", kontaktId: K, investmentId: I, objektId: O });
    expect(ohne.ok && ohne.auftrag).toMatchObject({ art: "objektuebersicht", wohnungId: null });
  });

  it("weist eine unbekannte Art ab, statt still ein Exposé zu machen", () => {
    expect(pruefeVersandAuftrag({ modus: "mail", art: "kundenansicht", kontaktId: K, investmentId: I, objektId: O }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ modus: "mail", art: 1, kontaktId: K, investmentId: I, objektId: O }).ok).toBe(false);
  });

  it("macht ohne Einheit das Exposé des ganzen Objekts", () => {
    const erg = pruefeVersandAuftrag({ modus: "link", kontaktId: K, investmentId: I, objektId: O, wohnungId: null });
    expect(erg.ok && erg.auftrag.wohnungId).toBe(null);
  });

  it("übergeht jede Empfängeradresse aus dem Aufruf", () => {
    const erg = pruefeVersandAuftrag({
      modus: "mail", kontaktId: K, investmentId: I, objektId: O, wohnungId: W,
      email: "angreifer@example.com", recipientEmail: "angreifer@example.com", empfaenger: "angreifer@example.com",
    });
    expect(erg.ok).toBe(true);
    expect(JSON.stringify(erg)).not.toContain("angreifer");
  });

  it("weist fehlende oder ungültige Angaben ab", () => {
    expect(pruefeVersandAuftrag({ kontaktId: K, investmentId: I, objektId: O }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ modus: "fax", kontaktId: K, investmentId: I, objektId: O }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ modus: "mail", investmentId: I, objektId: O }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ modus: "mail", kontaktId: K, objektId: O }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ modus: "mail", kontaktId: "1 OR 1=1", investmentId: I, objektId: O }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ modus: "mail", kontaktId: K, investmentId: I, objektId: O, wohnungId: "w7" }).ok).toBe(false);
    expect(pruefeVersandAuftrag(null).ok).toBe(false);
  });
});

describe("Auftrag: Wohnungsauswahl der Objektübersicht (05.10.2026)", () => {
  const W2 = "33333333-3333-4333-8333-333333333334";
  const basis = { modus: "link", art: "objektuebersicht", kontaktId: K, investmentId: I, objektId: O, wohnungId: W };

  it("nimmt eine Liste an, ohne Doppelte, und `null` für alle freien", () => {
    const mit = pruefeVersandAuftrag({ ...basis, wohnungAuswahl: [W, W2, W] });
    expect(mit.ok && mit.auftrag.wohnungAuswahl).toEqual([W, W2]);
    const alle = pruefeVersandAuftrag({ ...basis, wohnungAuswahl: null });
    expect(alle.ok && alle.auftrag.wohnungAuswahl).toBeNull();
  });

  it("lässt die Auswahl ohne Angabe offen, damit „Erneut senden“ sie nicht zurücksetzt", () => {
    const erg = pruefeVersandAuftrag(basis);
    expect(erg.ok && "wohnungAuswahl" in erg.auftrag).toBe(false);
  });

  it("weist eine leere, kaputte oder einstiegslose Auswahl ab", () => {
    expect(pruefeVersandAuftrag({ ...basis, wohnungAuswahl: [] }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ ...basis, wohnungAuswahl: W }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ ...basis, wohnungAuswahl: [W, "1 OR 1=1"] }).ok).toBe(false);
    expect(pruefeVersandAuftrag({ ...basis, wohnungAuswahl: [W2] })).toEqual({
      ok: false, fehler: "Die Wohnung, bei der der Link öffnet, muss ausgewählt sein.",
    });
  });

  it("übergeht eine Auswahl beim Exposé", () => {
    const erg = pruefeVersandAuftrag({ ...basis, art: "expose", wohnungAuswahl: [W2] });
    expect(erg.ok && "wohnungAuswahl" in erg.auftrag).toBe(false);
  });
});

describe("send-kunden-expose, Quelltext", () => {
  const quelle = lies("supabase/functions/send-kunden-expose/index.ts");

  it("nimmt den Empfänger nur aus dem gespeicherten Kontakt", () => {
    expect(quelle).toContain('empfaengerAusKontakt(kontakt, "person1")');
    expect(quelle).toMatch(/recipientEmail: empfaenger\.email/);
    // Kein Feld aus dem Aufruf landet im Empfänger.
    expect(quelle).not.toMatch(/body\.(email|recipientEmail|empfaenger)/);
    expect(quelle).not.toMatch(/auftrag\.(email|recipientEmail|empfaenger)/);
  });

  it("prüft Anmeldung, interne Rolle, Kontaktzugriff und bremst die Menge", () => {
    expect(quelle).toContain("auth.getUser()");
    expect(quelle).toContain('rpc("is_internal_role"');
    expect(quelle).toContain("pruefeKontaktZugriff(");
    expect(quelle).toContain('checkRateLimit(req, caller.id, { scope: "send-kunden-expose"');
  });

  it("legt die Zeile mit neutralen Annahmen und 60 Tagen Frist an", () => {
    expect(lies("supabase/functions/send-kunden-expose/zeile.ts")).toMatch(/annahmen: \{\}/);
    expect(quelle).toContain("gueltigBisAb(jetzt)");
    expect(quelle).toContain("zeileFuerVersand(db, auftrag,");
    expect(quelle).toContain("versandVermerk(auftrag,");
  });

  it("meldet eine fehlende Migration, bevor etwas geschrieben oder verschickt wird", () => {
    for (const meldung of [
      "EXPOSE_VERSAND_MIGRATION_FEHLT, migrationFehlt: true", "KUNDENLINK_MIGRATION_FEHLT, migrationFehlt: true",
      "KUNDENLINK_AUSWAHL_MIGRATION_FEHLT, migrationFehlt: true",
    ]) {
      const pruefung = quelle.indexOf(meldung);
      expect(pruefung).toBeGreaterThan(0);
      expect(pruefung).toBeLessThan(quelle.indexOf("zeileFuerVersand(db"));
      expect(pruefung).toBeLessThan(quelle.indexOf("sendeVorlage(supabase"));
    }
  });

  // Seit dem 05.10.2026 (Christians Go, Prüfung Codex) für BEIDE Arten, nach den Rollen aus `user_roles`.
  it("lässt Kundenlinks beider Arten nur Rollen mit Kundenaktionen senden, vor jedem Schreiben", () => {
    const pruefung = quelle.indexOf("hatKundenaktionsRolle(");
    expect(pruefung).toBeGreaterThan(0);
    expect(quelle.match(/hatKundenaktionsRolle\(/g)).toHaveLength(1);
    const davor = quelle.slice(pruefung - 300, pruefung);
    expect(davor).toContain('from("user_roles").select("role").eq("user_id", caller.id)');
    // Kein Zweig nach Art um die Rollenprüfung.
    expect(davor).not.toContain("auftrag.art ===");
    expect(pruefung).toBeLessThan(quelle.indexOf("zeileFuerVersand(db"));
    expect(pruefung).toBeLessThan(quelle.indexOf("sendeVorlage(supabase"));
    expect(quelle).not.toContain('rpc("is_admin_role"');
  });

  // Prüfung Codex vom 05.10.2026: Fällt die Mengenbremse aus, geht nichts hinaus.
  it("bricht ab, wenn die Mengenbremse ausfällt, nur in dieser Function", () => {
    expect(quelle).toContain('{ scope: "send-kunden-expose", perHour: 30, perDay: 150, failClosed: true }');
    const helfer = lies("supabase/functions/_shared/rate-limit.ts");
    expect(helfer).toContain("failClosed?: boolean;");
    expect(helfer).toContain("return cfg.failClosed\n    ? { ok: false, status: 503,");
    expect(helfer.match(/return beiAusfall\(cfg\);/g)).toHaveLength(3);
    expect(helfer).toContain('if (res.reason === "unavailable") {');
  });

  it("prüft für beide Arten den Zugriff auf genau diesen Kunden, vor jedem Schreiben", () => {
    const pruefung = quelle.indexOf("await pruefeKontaktZugriff(");
    expect(pruefung).toBeGreaterThan(quelle.indexOf("hatKundenaktionsRolle("));
    expect(pruefung).toBeLessThan(quelle.indexOf("zeileFuerVersand(db"));
    // Kein Zweig, der die Prüfung für eine Art überspringt.
    expect(quelle.slice(quelle.indexOf("hatKundenaktionsRolle("), pruefung)).not.toMatch(/art === "expose"/);
  });

  it("gibt der Mail die Art mit und baut den Link je Art", () => {
    expect(quelle).toContain("art: auftrag.art,");
    expect(quelle).toContain("kundenlinkFuer(auftrag.art,");
  });

  it("schickt Antworten an den Partner und legt eine Aktivität am Kunden an", () => {
    expect(quelle).toMatch(/replyTo: antwortAn/);
    expect(quelle).toContain('from("aktivitaeten").insert(');
  });

  /*
   * 23.09.2026, „404“ nach „Link kopieren“: Ein Lesefehler darf nicht als
   * „Das Objekt gibt es nicht mehr.“ (404) oder als fremdes Investment
   * zurückkommen. Und jede eigene 404 trägt einen Grund in `error`, sonst hielte
   * die Oberfläche sie für eine nicht ausgerollte Function.
   */
  it("wirft Lesefehler bei Investment, Objekt und Einheit, statt „gibt es nicht“ zu melden", () => {
    for (const [fehler, tabelle] of [["investmentFehler", "investments"], ["objektFehler", "objekte"], ["wohnungFehler", "wohnungen"]]) {
      expect(quelle).toContain(`if (${fehler}) throw new Error(\`${tabelle}: \${${fehler}.message}\`);`);
    }
    const objektFehler = quelle.indexOf("if (objektFehler) throw");
    expect(objektFehler).toBeGreaterThan(0);
    expect(objektFehler).toBeLessThan(quelle.indexOf('"Das Objekt gibt es nicht mehr."'));
  });

  it("antwortet mit 404 nur mit Grund in `error`", () => {
    const vierNullVier = quelle.split("\n").filter((z) => /\b404\b/.test(z) && !z.trim().startsWith("*") && !z.trim().startsWith("//"));
    expect(vierNullVier.length).toBeGreaterThan(0);
    for (const zeile of vierNullVier) expect(zeile).toMatch(/antwort\(\{ error: "/);
  });
});

describe("Mailvorlage kunden-expose", () => {
  const vorlage = lies("supabase/functions/_shared/transactional-email-templates/kunden-expose.tsx");

  it("ist in der Registry eingetragen", () => {
    expect(lies("supabase/functions/_shared/transactional-email-templates/registry.ts")).toMatch(/'kunden-expose': kundenExpose/);
  });

  it("hat Knopf, Frist, Anrede und Ansprechpartner", () => {
    // Seit Etappe 2 der Kundensprache stehen die Texte im Objekt TEXTE, je Sprache.
    expect(vorlage).toContain("exposeKnopf: 'Exposé ansehen'");
    expect(vorlage).toContain("uebersichtKnopf: 'Objektübersicht ansehen'");
    expect(vorlage).toContain("kundenlinkBetreff(d?.art, d?.bezeichnung, d?.sprache)");
    expect(vorlage).toContain("gueltigkeitsSatz(datumFuer(gueltigBis, sprache), sprache)");
    expect(vorlage).toContain("hallo(name, sprache)");
    expect(vorlage).toContain("person={berater}");
  });

  it("bekommt keine Preise und zeigt keine", () => {
    const props = vorlage.slice(vorlage.indexOf("interface Props"), vorlage.indexOf("const Mail"));
    expect(props).not.toMatch(/preis|rendite|miete|betrag|euro/i);
    const text = vorlage.slice(vorlage.indexOf("const Mail"), vorlage.indexOf("export const template"));
    expect(text).not.toMatch(/€|preis|rendite|miete/i);
    // Keine Gedankenstriche in Nutzertexten.
    expect(text).not.toMatch(/ – | — /);
  });
});

describe("config.toml", () => {
  it("verlangt für send-kunden-expose eine Anmeldung", () => {
    expect(lies("supabase/config.toml")).toMatch(/\[functions\.send-kunden-expose\]\nverify_jwt = true/);
  });
});

describe("send-kunden-expose, Wohnungsauswahl im Quelltext", () => {
  const quelle = lies("supabase/functions/send-kunden-expose/index.ts");

  it("prüft, dass jede gewählte Wohnung zum Objekt gehört, bevor eine Zeile entsteht", () => {
    const pruefung = quelle.indexOf('.eq("objekt_id", auftrag.objektId).in("id", auftrag.wohnungAuswahl)');
    expect(pruefung).toBeGreaterThan(0);
    expect(pruefung).toBeLessThan(quelle.indexOf("zeileFuerVersand(db"));
  });

  it("speichert die Auswahl vor der Mail, bricht bei gleichzeitiger Änderung ab und setzt sie bei jedem Fehlschlag zurück", () => {
    const speichern = quelle.indexOf("await auswahlSpeichern(db, zeile, auftrag.wohnungAuswahl)");
    expect(speichern).toBeGreaterThan(quelle.indexOf("zeileFuerVersand(db"));
    expect(speichern).toBeLessThan(quelle.indexOf("sendeVorlage(supabase"));
    expect(quelle).toContain('if (auswahlStand === "geaendert") return antwort({ error: LINK_GERADE_GEAENDERT }, 409);');
    expect(quelle).toContain("Der Link wurde gerade geändert, bitte erneut senden.");
    // Mail gescheitert und jeder spätere Fehler: die bisherige Auswahl kommt zurück.
    expect(quelle.match(/await auswahlZuruecksetzen\(\)/g)).toHaveLength(2);
    expect(quelle.indexOf("auswahlZuruecksetzen = async () => {};", quelle.indexOf("versandVermerk(auftrag"))).toBeGreaterThan(0);
  });

  it("nennt die gespeicherte Auswahl in der Antwort und spricht in der Mail dann nicht von allen freien Wohnungen", () => {
    expect(quelle).toContain("wohnungAuswahl: auswahl");
    expect(quelle).toContain("mitWohnungen: uebersicht && !!auftrag.wohnungId && !auswahl");
  });
});
