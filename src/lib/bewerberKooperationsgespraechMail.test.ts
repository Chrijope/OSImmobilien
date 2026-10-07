import { describe, it, expect } from "vitest";
import {
  ABSAGE_BETREFF,
  ABSAGE_DANK,
  ABSAGE_ENTSCHEIDUNG,
  ABSAGE_SCHLUSS,
  ABSAGE_TITEL,
  ABSAGE_VORSCHAU,
  EINLADUNG_BETREFF,
  EINLADUNG_FUSS_HINWEIS,
  EINLADUNG_GEFALLEN,
  EINLADUNG_GESPRAECH,
  EINLADUNG_KNOPF,
  EINLADUNG_KNOPF_HINWEIS,
  EINLADUNG_SCHLUSS,
  EINLADUNG_TERMINWAHL,
  EINLADUNG_TITEL,
  EINLADUNG_VORSCHAU,
  KOOPERATION_BASIS_URL,
  KOOPERATION_GESPRAECH_NAME,
  kooperationsBuchungsLink,
} from "../../supabase/functions/_shared/bewerber-kooperationsgespraech-mail";
import { GESPRAECH_NAME } from "@/lib/bewerberKennenlernen";

/**
 * Die beiden Mails, die aus dem Bewerberprofil heraus verschickt werden.
 *
 * Bewacht wird dreierlei: dass die Einladung wertschätzend ist, ohne eine
 * Zusage zu sein; dass ihr einziger Knopf auf die vorhandene Buchungsstrecke
 * zeigt und nicht auf einen fremden Kalender; und dass die Absage nicht von
 * einem Gespräch spricht, das zu diesem Zeitpunkt noch gar nicht stattgefunden
 * hat. Genau daran ist die vorhandene Vorlage `bewerber-absage` für diesen
 * Anlass gescheitert.
 */

/** Die Einladung als ein durchgehender Text, so wie der Bewerber sie liest. */
const EINLADUNG_GANZ = [
  EINLADUNG_BETREFF,
  EINLADUNG_TITEL,
  EINLADUNG_VORSCHAU,
  EINLADUNG_GEFALLEN,
  EINLADUNG_GESPRAECH,
  EINLADUNG_TERMINWAHL,
  EINLADUNG_KNOPF,
  EINLADUNG_KNOPF_HINWEIS,
  EINLADUNG_SCHLUSS,
  EINLADUNG_FUSS_HINWEIS,
].join(" ");

/** Die Absage, ebenso. */
const ABSAGE_GANZ = [
  ABSAGE_BETREFF,
  ABSAGE_TITEL,
  ABSAGE_VORSCHAU,
  ABSAGE_DANK,
  ABSAGE_ENTSCHEIDUNG,
  ABSAGE_SCHLUSS,
].join(" ");

describe("Die Einladung zum persönlichen Gespräch", () => {
  it("nennt das Gespräch so, wie das ganze Projekt es nennt", () => {
    // Läuft das auseinander, muss der Bewerber zwei Namen für dieselbe Sache
    // lernen: einen in der Mail, einen in der Bestätigung und im Kalender.
    expect(KOOPERATION_GESPRAECH_NAME).toBe(GESPRAECH_NAME);
    expect(EINLADUNG_KNOPF).toContain(GESPRAECH_NAME);
  });

  it("sagt dem Bewerber, dass uns seine Antworten gefallen haben", () => {
    expect(EINLADUNG_GEFALLEN).toMatch(/gelesen/);
    expect(EINLADUNG_GEFALLEN).toMatch(/gefallen/);
    expect(EINLADUNG_GEFALLEN).toMatch(/passt/);
  });

  it("lädt zu einem Videocall ein und verspricht, alles Weitere zu besprechen", () => {
    expect(EINLADUNG_GESPRAECH).toMatch(/Videocall/);
    expect(EINLADUNG_GESPRAECH).toMatch(/kennenlernen/i);
    expect(EINLADUNG_GESPRAECH).toMatch(/Start/);
  });

  it("ist keine Zusage und verspricht keine Anstellung", () => {
    // Der Schlussabsatz hält die Einladung ausdrücklich offen. Ohne ihn liest
    // sich „wir können uns gut vorstellen, dass es passt" wie ein Angebot.
    expect(EINLADUNG_SCHLUSS).toMatch(/Entschieden ist damit noch nichts/);
    // `\b` mit Absicht: „vorstellen" enthält „stelle" und ist hier gerade der
    // Satz, auf den es ankommt.
    for (const wort of [/Anstellung/i, /Arbeitsvertrag/i, /eingestellt/i, /Zusage/i, /\bStelle\b/i]) {
      expect(EINLADUNG_GANZ).not.toMatch(wort);
    }
  });

  it("duzt durchgehend und siezt an keiner Stelle", () => {
    expect(EINLADUNG_GANZ).toMatch(/\bdu\b|\bdir\b|\bdeine\b/i);
    expect(EINLADUNG_GANZ).not.toMatch(/\bSie\b|\bIhnen\b|\bIhre[rnms]?\b/);
  });

  it("kommt ohne Gedankenstriche und ohne Werbesprache aus", () => {
    expect(EINLADUNG_GANZ).not.toMatch(/[–—]/);
    for (const wort of [/einmalig/i, /Chance deines Lebens/i, /jetzt zuschlagen/i, /!{1}/]) {
      expect(EINLADUNG_GANZ).not.toMatch(wort);
    }
  });

  it("verspricht keine Dauer, die nur die Buchungsseite kennt", () => {
    // Wie lange gesprochen wird, ergibt sich aus seinen eigenen Antworten
    // (30 oder 45 Minuten). Eine Zahl in der Mail widerspräche später der Seite.
    expect(EINLADUNG_GANZ).not.toMatch(/\d+\s*Minuten/);
  });

  it("bietet einen Weg an, wenn das Interesse nicht mehr besteht", () => {
    expect(EINLADUNG_FUSS_HINWEIS).toMatch(/nicht mehr aktuell/);
  });
});

/**
 * Der Link in der Einladung, seit dem 21.09.2026.
 *
 * Er führte einmal auf unsere eigene Buchungsstrecke mit Videoraum, dann kurz
 * direkt auf Calendly, und jetzt auf unsere eigene Terminseite, in der Calendly
 * eingebettet ist. Der Umweg hat einen Grund: Calendly meldet uns nichts
 * zurück, unsere Seite kann die Bestätigung des Bewerbers entgegennehmen.
 */
describe("Der Link der Einladung", () => {
  it("führt auf unsere eigene Terminseite, mit dem Token des Bewerbers", () => {
    expect(KOOPERATION_BASIS_URL).toBe("https://osimmobilien.netlify.app/kennenlerngespraech");
    expect(kooperationsBuchungsLink("abc123")).toBe(
      "https://osimmobilien.netlify.app/kennenlerngespraech/abc123",
    );
  });

  it("hängt am Token des Kennenlernens, es gibt kein zweites", () => {
    // Ohne Zuordnung bestätigte der Bewerber später ins Leere.
    expect(kooperationsBuchungsLink(" abc123 ")).toContain("/abc123");
    expect(kooperationsBuchungsLink("abc123")).not.toBe(kooperationsBuchungsLink("xyz789"));
  });

  it("gibt ohne Token gar keinen Link zurück", () => {
    expect(kooperationsBuchungsLink("")).toBe("");
    expect(kooperationsBuchungsLink("   ")).toBe("");
  });

  it("verträgt eine Basisadresse mit Schrägstrich am Ende", () => {
    expect(kooperationsBuchungsLink("t1", "https://osimmobilien.netlify.app/kennenlerngespraech/")).toBe(
      "https://osimmobilien.netlify.app/kennenlerngespraech/t1",
    );
  });

  it("nennt im Mailtext keinen Kalenderanbieter", () => {
    // Der Bewerber soll den Knopf drücken, nicht über unser Werkzeug
    // nachdenken. Der Wortlaut bleibt deshalb neutral.
    expect(EINLADUNG_GANZ).not.toMatch(/calendly|doodle|outlook\.office/i);
  });
});

describe("Die Absage nach dem gelesenen Kennenlernbogen", () => {
  it("behauptet kein Gespräch, das es nie gab", () => {
    // Genau daran scheitert die vorhandene Vorlage `bewerber-absage` an dieser
    // Stelle: Sie sagt „Nach unserem Gespräch", und gesprochen hat hier
    // niemand miteinander.
    expect(ABSAGE_GANZ).not.toMatch(/Gespräch/);
    expect(ABSAGE_GANZ).not.toMatch(/Termin/);
  });

  it("dankt und sagt, dass wirklich gelesen wurde", () => {
    expect(ABSAGE_DANK).toMatch(/danke/i);
    expect(ABSAGE_DANK).toMatch(/gelesen/);
  });

  it("nennt die Entscheidung ehrlich, ohne den Bewerber zu bewerten", () => {
    expect(ABSAGE_ENTSCHEIDUNG).toMatch(/nicht passt/);
    expect(ABSAGE_ENTSCHEIDUNG).toMatch(/kein Urteil über dich/);
  });

  it("wünscht alles Gute und hört danach auf", () => {
    expect(ABSAGE_SCHLUSS).toMatch(/alles Gute/);
    // Keine Vertröstung auf später. „Wir kommen auf dich zurück" wäre ein
    // Versprechen, das niemand einlöst.
    expect(ABSAGE_GANZ).not.toMatch(/kommen auf dich zurück|melden uns wieder|zu einem späteren/i);
  });

  it("bleibt kurz, duzt und kommt ohne Gedankenstriche aus", () => {
    expect(ABSAGE_GANZ.length).toBeLessThan(500);
    expect(ABSAGE_GANZ).not.toMatch(/\bSie\b|\bIhnen\b/);
    expect(ABSAGE_GANZ).not.toMatch(/[–—]/);
  });
});
