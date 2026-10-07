/**
 * Die Deutung der Versandantwort.
 *
 * Anlass ist ein stiller Fehler: Der Dialog "Bewerber erfassen" prüfte nur, ob
 * der Aufruf technisch durchkam, und meldete sonst Erfolg. Die Function
 * antwortet aber in drei Lagen mit Status 200, und nur eine davon bedeutet,
 * dass der Bewerber wirklich eine Mail bekommen hat. In den beiden anderen sah
 * HR einen grünen Hinweis, während nichts hinausging.
 *
 * Dieser Test hält fest, dass nur der dritte Fall als Erfolg gilt.
 */
import { describe, expect, it } from "vitest";

import {
  abbruchText,
  versandFehlerText,
  versandMeldung,
  zustellFehlerText,
} from "./kennenlernenVersandMeldung";

describe("versandMeldung", () => {
  it("wertet nur eine wirklich verschickte Mail als Erfolg", () => {
    const gut = versandMeldung({ ok: true, versandt: true }, "Héctor");
    expect(gut.gelungen).toBe(true);
    expect(gut.text).toContain("Héctor");
  });

  it("meldet einen bewussten Abbruch der Function als Fehlschlag", () => {
    // ok: false heisst, die Function hat absichtlich nichts verschickt.
    const abbruch = versandMeldung({ ok: false, grund: "keine E-Mail-Adresse" });
    expect(abbruch.gelungen).toBe(false);
    expect(abbruch.titel).toBe("Nicht verschickt");
    expect(abbruch.text).toContain("keine E-Mail-Adresse");
  });

  it("meldet einen angelegten Link ohne Zustellung als Fehlschlag", () => {
    /*
     * Der heikelste Fall: ok ist wahr, die Function hat ihre Arbeit getan,
     * aber die Mail blieb an der Sperrliste haengen. Frueher stand hier ein
     * gruener Hinweis.
     */
    const halb = versandMeldung({ ok: true, versandt: false, versandGrund: "Adresse steht auf der Sperrliste" });
    expect(halb.gelungen).toBe(false);
    expect(halb.text).toContain("Sperrliste");
    expect(halb.text).toContain("suppressed_emails");
  });

  it("haelt eine leere oder fehlende Antwort fuer einen Fehlschlag", () => {
    // Lieber eine Warnung zu viel als ein Bewerber, der nie etwas bekommt.
    expect(versandMeldung(null).gelungen).toBe(false);
    expect(versandMeldung({}).gelungen).toBe(false);
  });

  it("kommt ohne Namen aus", () => {
    const ohne = versandMeldung({ ok: true, versandt: true });
    expect(ohne.gelungen).toBe(true);
    expect(ohne.text).not.toContain("undefined");
  });
});

describe("Die Fehlertexte sagen, was zu tun ist", () => {
  it("nennt die fehlende Bereitstellung statt zum Wiederholen zu raten", () => {
    const text = versandFehlerText(new Error("Failed to send a request to the Edge Function"));
    expect(text).toContain("noch nicht veröffentlicht");
    expect(text).not.toContain("in einem Moment");
  });

  it("zieht den Klartext aus der Antwort jedem Rateversuch vor", () => {
    /*
     * "Edge Function returned a non-2xx status code" sagt niemandem etwas.
     * Steht der echte Grund zur Verfuegung, hat er Vorrang.
     */
    const text = versandFehlerText(
      new Error("Edge Function returned a non-2xx status code"),
      "Keine Berechtigung",
    );
    expect(text).toBe("Keine Berechtigung");
  });

  it("erklaert den alten Kurzgrund aus einer nicht erneuerten Function", () => {
    expect(abbruchText("bereits ausgefuellt")).toContain("neu bereitgestellt");
  });

  it("sagt bei fehlendem Grund, wo der Grund steht", () => {
    expect(zustellFehlerText("")).toContain("Protokoll");
  });
});
