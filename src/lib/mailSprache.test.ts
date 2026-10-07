/**
 * Kundensprache in Mails (Plan Kundensprache, Etappe 2).
 *
 * Geprüft wird alles, was sich ohne React laden lässt: welche Vorlage der
 * Sprache folgt, wie der Server die Sprache ermittelt, die Anrede je Gruppe
 * und die Übersetzung der Datumsangaben, die die Aufrufer deutsch schicken.
 * Das Rendern der Vorlagen selbst prüft der Deno-Test
 * `supabase/functions/_shared/transactional-email-templates/sprache_test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  datumFuer,
  mailSprache,
  mitSprache,
  rolleFuer,
  texteFuer,
  uhrzeitFuer,
  zeitraumFuer,
  NOTAR_DOLMETSCHER_HINWEIS_EN,
} from "../../supabase/functions/_shared/transactional-email-templates/_sprache";
import { foermlich, hallo } from "../../supabase/functions/_shared/transactional-email-templates/_anrede";
import { folgtKundensprache, zielgruppeVon } from "../../supabase/functions/_shared/transactional-email-templates/_zielgruppe";
import { ermittleMailSprache } from "../../supabase/functions/_shared/mail-sprache-ermitteln";
import { gueltigkeitsSatz, kundenlinkBetreff } from "../../supabase/functions/_shared/kunden-expose";
import { meetingDatum, meetingZeitpunkt } from "../../supabase/functions/_shared/meeting-datum";
import { abmeldeSprache } from "@/lib/abmeldeSprache";

describe("Welche Vorlage der Kundensprache folgt", () => {
  it("eine Kundenvorlage mit Englisch folgt ihr", () => {
    expect(folgtKundensprache("sa-invitation", ["de", "en"])).toBe(true);
    expect(folgtKundensprache("notartermin-geplant", ["de", "en"])).toBe(true);
  });

  it("eine Kundenvorlage ohne Englisch bleibt deutsch", () => {
    expect(folgtKundensprache("anlage-v-aufstellung", undefined)).toBe(false);
    expect(folgtKundensprache("activation-invite", ["de"])).toBe(false);
  });

  it("interne Vorlagen bleiben deutsch, auch wenn sie Englisch meldeten", () => {
    expect(zielgruppeVon("notartermin-benachrichtigung")).toBe("intern");
    expect(folgtKundensprache("notartermin-benachrichtigung", ["de", "en"])).toBe(false);
    expect(folgtKundensprache("bewerber-absage", ["de", "en"])).toBe(false);
  });

  it("unbekannte Vorlagen gelten als intern", () => {
    expect(zielgruppeVon("gibt-es-nicht")).toBe("intern");
  });
});

describe("Die Vorlage wählt ihre Texte nach der Sprache", () => {
  const TEXTE = { de: { knopf: "Ansehen" }, en: { knopf: "View" } };

  it("nimmt Englisch nur bei en", () => {
    expect(texteFuer(TEXTE, "en").knopf).toBe("View");
    expect(texteFuer(TEXTE, "en-GB").knopf).toBe("View");
    expect(texteFuer(TEXTE, "de").knopf).toBe("Ansehen");
    expect(texteFuer(TEXTE, undefined).knopf).toBe("Ansehen");
    expect(texteFuer(TEXTE, "fr").knopf).toBe("Ansehen");
  });

  it("liest die Sprache nachsichtig", () => {
    expect(mailSprache("EN")).toBe("en");
    expect(mailSprache("English")).toBe("en");
    expect(mailSprache(null)).toBe("de");
    expect(mailSprache(42)).toBe("de");
  });
});

describe("Die Anrede je Gruppe", () => {
  it("Du-Texte: Hallo und Hello mit Vornamen", () => {
    expect(hallo("Max Mustermann")).toBe("Hallo Max,");
    expect(hallo("Max Mustermann", "en")).toBe("Hello Max,");
    expect(hallo("Herr Mustermann", "en")).toBe("Hello,");
    expect(hallo(undefined, "en")).toBe("Hello,");
  });

  it("Gruppe F Deutsch: Guten Tag mit dem Namen, wie er kommt", () => {
    expect(foermlich("Herr Mustermann")).toBe("Guten Tag Herr Mustermann,");
    expect(foermlich("Max Mustermann", "de", "Herr")).toBe("Guten Tag Max Mustermann,");
    expect(foermlich("")).toBe("Guten Tag,");
  });

  it("Gruppe F Englisch: Dear Mr oder Ms mit Nachnamen", () => {
    expect(foermlich("Herr Mustermann", "en")).toBe("Dear Mr Mustermann,");
    expect(foermlich("Frau Erika Muster", "en")).toBe("Dear Ms Muster,");
    expect(foermlich("Max Mustermann", "en", "Herr")).toBe("Dear Mr Mustermann,");
    expect(foermlich("Erika Muster", "en", "Frau")).toBe("Dear Ms Muster,");
    expect(foermlich("Frau Dr. Martina Brandl", "en")).toBe("Dear Dr Brandl,");
  });

  it("Gruppe F Englisch ohne Anrede: voller Name, ohne Namen Sir or Madam", () => {
    expect(foermlich("Max Mustermann", "en")).toBe("Dear Max Mustermann,");
    expect(foermlich(undefined, "en")).toBe("Dear Sir or Madam,");
    expect(foermlich("Herr", "en")).toBe("Dear Sir or Madam,");
  });
});

describe("Datum und Uhrzeit, die deutsch ankommen", () => {
  it("bleiben auf Deutsch unverändert", () => {
    expect(datumFuer("Donnerstag, 6. August 2026", "de")).toBe("Donnerstag, 6. August 2026");
    expect(uhrzeitFuer("10:15", "de")).toBe("10:15 Uhr");
    expect(uhrzeitFuer("10:15 Uhr", "de")).toBe("10:15 Uhr");
  });

  it("werden auf Englisch britisch geschrieben", () => {
    expect(datumFuer("Donnerstag, 6. August 2026", "en")).toBe("Thursday, 6 August 2026");
    expect(datumFuer("06.08.2026", "en")).toBe("6 Aug 2026");
    expect(datumFuer("2026-10-15", "en")).toBe("15 Oct 2026");
    expect(datumFuer("31.05.2026, 18:42", "en")).toBe("31 May 2026, 18:42");
    expect(datumFuer("Montag, 11. März 2026", "en")).toBe("Monday, 11 March 2026");
    expect(datumFuer("Dienstag, 8. Dezember 2026 um 14:30 Uhr", "en")).toBe("Tuesday, 8 December 2026 at 14:30");
    expect(uhrzeitFuer("10:15 Uhr", "en")).toBe("10:15");
  });

  it("übersetzen die Zeitangabe der Erinnerungen", () => {
    expect(zeitraumFuer("in etwa 24 Stunden", "en")).toBe("in about 24 hours");
    expect(zeitraumFuer("in 6 Stunden", "en")).toBe("in 6 hours");
    expect(zeitraumFuer("in 1 Stunde", "en")).toBe("in one hour");
    expect(zeitraumFuer("in weniger als einer Stunde", "en")).toBe("in less than an hour");
    expect(zeitraumFuer("in etwa 24 Stunden", "de")).toBe("in etwa 24 Stunden");
  });

  it("die Meeting-Änderung schreibt Wochentag und Uhrzeit englisch", () => {
    expect(meetingDatum("2026-12-10", "en")).toBe("Thursday, 10 December 2026");
    expect(meetingZeitpunkt("2026-12-08 14:30", undefined, "en")).toBe("Tuesday, 8 December 2026 at 14:30");
    expect(meetingZeitpunkt("2026-12-08 14:30")).toBe("Dienstag, 8. Dezember 2026 um 14:30 Uhr");
  });
});

describe("Layout und Links", () => {
  it("die Rolle heißt englisch nie advisor", () => {
    expect(rolleFuer("Immobilienberater", "en")).toBe("Your contact at MOREImmo");
    expect(rolleFuer("Immobilienberater", "de")).toBe("Immobilienberater");
    expect(rolleFuer("", "de")).toBe("Ansprechpartner bei MOREImmo");
  });

  it("hängt lang=en an, auch an den Abmeldeplatzhalter", () => {
    expect(mitSprache("https://portal.more.immo/datenschutz", "en")).toBe("https://portal.more.immo/datenschutz?lang=en");
    expect(mitSprache("https://x.de/a?b=1", "en")).toBe("https://x.de/a?b=1&lang=en");
    expect(mitSprache("{{unsubscribe_url}}", "en")).toBe("{{unsubscribe_url}}&lang=en");
    expect(mitSprache("{{unsubscribe_url}}", "de")).toBe("{{unsubscribe_url}}");
  });

  it("der Dolmetscher-Hinweis nennt Urkunde, Dolmetscher und frühe Meldung, ohne Gedankenstrich", () => {
    expect(NOTAR_DOLMETSCHER_HINWEIS_EN).toMatch(/drawn up in German/);
    expect(NOTAR_DOLMETSCHER_HINWEIS_EN).toMatch(/interpreter/);
    expect(NOTAR_DOLMETSCHER_HINWEIS_EN).toMatch(/as early as possible/);
    expect(NOTAR_DOLMETSCHER_HINWEIS_EN).not.toMatch(/[–—]/);
  });

  it("der Kundenlink hat Betreff und Gültigkeit auf Englisch", () => {
    expect(kundenlinkBetreff("objektuebersicht", "Wohnung 7, Parkstraße 8, Augsburg", "en")).toBe(
      "Your property overview: Apartment 7, Parkstraße 8, Augsburg",
    );
    expect(kundenlinkBetreff("expose", "", "en")).toBe("Your personal exposé");
    expect(gueltigkeitsSatz("22 November 2026", "en")).toBe("This link is personal and valid until 22 November 2026.");
  });
});

/** Eine kleine Attrappe des Supabase-Clients für `kontakte`. */
function client(zeilen: Array<Record<string, unknown>>, kaputt = false) {
  return {
    from: () => ({
      select: () => ({
        eq: (_spalte: string, wert: string) => ({
          maybeSingle: async () =>
            kaputt ? { data: null, error: { message: "kaputt" } } : { data: zeilen.find((z) => z.id === wert) ?? null, error: null },
        }),
        ilike: (_spalte: string, muster: string) => ({
          limit: async () => ({ data: zeilen.filter((z) => String(z.email).toLowerCase() === muster.toLowerCase()), error: null }),
        }),
        or: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    }),
  };
}

const ID = "11111111-2222-3333-4444-555555555555";

describe("Die Sprache auf dem Server ermitteln", () => {
  const kontakt = {
    id: ID,
    email: "erika@example.com",
    anrede: "Frau",
    meta: { kundenSprache: "en", person2: { email: "paul@example.com", anrede: "Herr" } },
  };

  it("nimmt die Sprache des Kontakts und die Anrede, wenn die Mail an ihn geht", async () => {
    await expect(ermittleMailSprache(client([kontakt]), { kontaktId: ID, empfaenger: "Erika@Example.com" }))
      .resolves.toEqual({ sprache: "en", anrede: "Frau" });
  });

  it("Person 2 bekommt dieselbe Sprache und ihre eigene Anrede", async () => {
    await expect(ermittleMailSprache(client([kontakt]), { kontaktId: ID, empfaenger: "paul@example.com" }))
      .resolves.toEqual({ sprache: "en", anrede: "Herr" });
  });

  it("eine fremde Adresse bekommt die Sprache, aber keine Anrede", async () => {
    await expect(ermittleMailSprache(client([kontakt]), { kontaktId: ID, empfaenger: "gast@example.com" }))
      .resolves.toEqual({ sprache: "en" });
  });

  it("die mitgegebene Sprache hat Vorrang", async () => {
    const r = await ermittleMailSprache(client([kontakt]), { sprache: "de", kontaktId: ID, empfaenger: "erika@example.com" });
    expect(r.sprache).toBe("de");
  });

  it("ohne Kontakt-ID hilft die Adresse", async () => {
    await expect(ermittleMailSprache(client([kontakt]), { empfaenger: "erika@example.com" })).resolves.toEqual({ sprache: "en" });
  });

  it("fällt ohne Treffer oder bei Fehler auf Deutsch zurück", async () => {
    await expect(ermittleMailSprache(client([]), { kontaktId: ID, empfaenger: "x@example.com" })).resolves.toEqual({ sprache: "de" });
    await expect(ermittleMailSprache(client([kontakt], true), { kontaktId: ID })).resolves.toEqual({ sprache: "de" });
  });
});

describe("Die Abmeldeseite", () => {
  it("folgt zuerst dem Link, dann dem Server, sonst Deutsch", () => {
    expect(abmeldeSprache("en", "de")).toBe("en");
    expect(abmeldeSprache(null, "en")).toBe("en");
    expect(abmeldeSprache("de", "en")).toBe("de");
    expect(abmeldeSprache(null, undefined)).toBe("de");
  });
});
