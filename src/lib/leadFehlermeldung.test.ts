import { describe, it, expect } from "vitest";
import {
  leadFehlermeldung,
  leadNetzfehlerMeldung,
  retryAfterSekunden,
  wartezeitText,
} from "@/lib/leadFehlermeldung";

describe("wartezeitText", () => {
  it("nennt eine Minute bei kurzer Wartezeit", () => {
    expect(wartezeitText(30)).toBe("einer Minute");
  });

  it("rechnet Sekunden in Minuten und Stunden um", () => {
    expect(wartezeitText(600)).toBe("10 Minuten");
    expect(wartezeitText(3600)).toBe("einer Stunde");
    expect(wartezeitText(7200)).toBe("2 Stunden");
  });

  it("bleibt vage, wenn nichts bekannt ist", () => {
    expect(wartezeitText(null)).toBe("etwas später");
  });
});

describe("retryAfterSekunden", () => {
  it("liest die Sekundenangabe aus dem Header", () => {
    expect(retryAfterSekunden(new Headers({ "Retry-After": "3600" }))).toBe(3600);
  });

  it("gibt null ohne Header oder bei einem Datum zurück", () => {
    expect(retryAfterSekunden(new Headers())).toBeNull();
    expect(retryAfterSekunden(new Headers({ "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" }))).toBeNull();
    expect(retryAfterSekunden(null)).toBeNull();
  });
});

describe("leadFehlermeldung", () => {
  it("unterscheidet das Rate-Limit vom Serverfehler", () => {
    const zuViele = leadFehlermeldung(429, 3600);
    expect(zuViele).toContain("viele Anfragen");
    expect(zuViele).toContain("einer Stunde");
    expect(leadFehlermeldung(500)).not.toContain("viele Anfragen");
  });

  it("weist bei 400 auf die eigenen Angaben hin", () => {
    expect(leadFehlermeldung(400)).toContain("Telefonnummer");
  });

  it("nennt bei einem Serverfehler den nächsten Schritt", () => {
    const meldung = leadFehlermeldung(500);
    expect(meldung).toMatch(/nicht geklappt/);
    expect(meldung).toContain("noch einmal");
  });

  it("hat auch ohne bekannten Status eine Meldung", () => {
    expect(leadFehlermeldung(undefined)).toMatch(/nicht geklappt/);
  });

  it("verspricht überall, dass die Eingaben erhalten bleiben", () => {
    for (const status of [429, 500, undefined]) {
      expect(leadFehlermeldung(status)).toContain("bleiben so lange gespeichert");
    }
    expect(leadNetzfehlerMeldung()).toContain("bleiben so lange gespeichert");
  });

  it("verwendet keine Gedankenstriche", () => {
    const alle = [400, 401, 429, 500, undefined].map((s) => leadFehlermeldung(s));
    alle.push(leadNetzfehlerMeldung());
    for (const meldung of alle) {
      expect(meldung).not.toMatch(/[–—]/);
    }
  });
});

/**
 * Die englische Fassung, seit dem 17.09.2026. Sie wird bisher nur vom EXPATS
 * Calculator benutzt, einer durchgehend englischen Seite.
 *
 * Der Waechter, auf den es hier ankommt, ist der letzte Test: Die deutschen
 * Texte duerfen sich durch die zweite Sprache in keinem Zeichen aendern, denn
 * dieselbe Datei bedient den deutschen Steuerrechner, das Analysetool und die
 * Landingpage.
 */
describe("Englische Fassung", () => {
  it("nennt die Wartezeit auf Englisch", () => {
    expect(wartezeitText(30, "en")).toBe("a minute");
    expect(wartezeitText(600, "en")).toBe("10 minutes");
    expect(wartezeitText(3600, "en")).toBe("an hour");
    expect(wartezeitText(7200, "en")).toBe("2 hours");
    expect(wartezeitText(null, "en")).toBe("a little while");
  });

  it("unterscheidet dieselben Faelle wie die deutsche Fassung", () => {
    const zuViele = leadFehlermeldung(429, 3600, "en");
    expect(zuViele).toContain("A lot of requests");
    expect(zuViele).toContain("an hour");
    expect(leadFehlermeldung(400, null, "en")).toContain("phone number");
    expect(leadFehlermeldung(401, null, "en")).toContain("refused");
    expect(leadFehlermeldung(500, null, "en")).toContain("Saving did not work");
    expect(leadNetzfehlerMeldung("en")).toContain("could not reach the server");
  });

  it("enthaelt kein deutsches Wort mehr", () => {
    const alle = [400, 401, 429, 500, undefined].map((s) => leadFehlermeldung(s, 3600, "en"));
    alle.push(leadNetzfehlerMeldung("en"));
    for (const meldung of alle) {
      expect(meldung).not.toMatch(/[äöüß]/i);
      expect(meldung).not.toMatch(/\b(Bitte|gespeichert|Anfragen|Angaben)\b/);
      expect(meldung).not.toMatch(/[–—]/);
    }
  });

  it("laesst die deutschen Texte unveraendert, auch ohne Sprachangabe", () => {
    expect(leadFehlermeldung(429, 3600)).toBe(leadFehlermeldung(429, 3600, "de"));
    expect(leadFehlermeldung(500)).toContain("Das Speichern hat nicht geklappt.");
    expect(wartezeitText(3600)).toBe("einer Stunde");
    expect(leadNetzfehlerMeldung()).toContain("Wir konnten den Server nicht erreichen.");
  });
});
