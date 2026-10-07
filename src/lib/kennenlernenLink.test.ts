import { describe, it, expect } from "vitest";
import {
  KENNENLERNEN_BASIS,
  brauchtNeuenLink,
  istAusgefuellterBogen,
  istKennenlernZeile,
  kennenlernLinkStand,
  kennenlernZeilen,
  ohneMailErzeugt,
} from "@/lib/kennenlernenLink";

/**
 * Welcher Link zum Kennenlernbogen gilt.
 *
 * Der Fall, der den Fehler ausgelöst hat: Ein Bewerber aus dem Altbestand hat
 * nur den früheren Vorabbogen bekommen. Dessen Zeile ist die jüngste in
 * `bewerber_formular`, und die Karte baute daraus einen Kennenlern-Link, der
 * auf „abgelaufen" lief.
 */

const JETZT = new Date("2026-09-15T12:00:00.000Z");

/** Der Vorabbogen legt seine Zeile ohne Antworten an. */
const VORAB_ABGELAUFEN = {
  token: "vorab-1", status: "offen", antworten: {},
  created_at: "2026-08-20T10:00:00Z", expires_at: "2026-09-03T10:00:00Z",
};

const KL_OFFEN = {
  token: "kl-offen", status: "offen", antworten: { bogen: "kennenlernen" },
  created_at: "2026-09-10T10:00:00Z", expires_at: "2027-03-09T10:00:00Z",
};

const KL_EINGEREICHT = {
  token: "kl-fertig", status: "eingereicht", antworten: { weg: "weg1" },
  created_at: "2026-09-05T10:00:00Z", expires_at: "2027-03-04T10:00:00Z",
};

describe("istKennenlernZeile", () => {
  it("erkennt den Kennenlernbogen am Kennzeichen oder am gewählten Weg", () => {
    expect(istKennenlernZeile({ bogen: "kennenlernen" })).toBe(true);
    expect(istKennenlernZeile({ weg: "weg2" })).toBe(true);
    expect(istKennenlernZeile({})).toBe(false);
    expect(istKennenlernZeile(null)).toBe(false);
    expect(istKennenlernZeile({ weg: "  " })).toBe(false);
  });

  it("lässt den Vorabbogen bei der Zeilenwahl weg", () => {
    expect(kennenlernZeilen([VORAB_ABGELAUFEN, KL_OFFEN]).map((z) => z.token)).toEqual(["kl-offen"]);
  });
});

/*
 * Das weitere Merkmal, seit dem 16.09.2026.
 *
 * Es beantwortet eine andere Frage als `istKennenlernZeile`: nicht „welcher
 * Bogen ist das", sondern „hat der Bewerber überhaupt einen abgeschickt".
 * Daran hängt der Haken am Briefsymbol, und dort zählt jeder der beiden Bögen.
 */
describe("istAusgefuellterBogen", () => {
  /*
   * Der Fall, um den es geht. Ein Vorabbogen aus dem August: eingereicht, mit
   * Antworten des alten Katalogs, aber ohne `bogen` und ohne `weg`. Beide
   * Merkmale sind jünger als er, `weg` seit dem 06.09.2026 und `bogen` erst
   * beim Anlegen der Kennenlernzeile.
   */
  const VORAB_EINGEREICHT = {
    token: "vorab-alt",
    status: "eingereicht",
    antworten: { region: "Rosenheim", beschaeftigung: "angestellt", zeitProWoche: "10_20" },
    created_at: "2026-08-20T10:00:00Z",
    expires_at: "2026-09-03T10:00:00Z",
  };

  it("zählt einen eingereichten Bogen ohne `bogen` und ohne `weg`", () => {
    expect(istAusgefuellterBogen(VORAB_EINGEREICHT)).toBe(true);
    // Und genau dieselbe Zeile ist für den Link weiterhin kein Kennenlernbogen.
    expect(istKennenlernZeile(VORAB_EINGEREICHT.antworten)).toBe(false);
  });

  it("zählt einen eingereichten Bogen auch ganz ohne Antworten", () => {
    // Der Beleg ist das Abschicken, nicht was dabei angekreuzt wurde.
    expect(istAusgefuellterBogen({ status: "eingereicht", antworten: {} })).toBe(true);
  });

  it("zählt den eingereichten Kennenlernbogen genauso", () => {
    expect(istAusgefuellterBogen(KL_EINGEREICHT)).toBe(true);
  });

  /*
   * Ein bloß angelegter Link ist kein Beleg. Gerade die Kennenlernzeile
   * entsteht schon beim Versand und trägt dann das Kennzeichen `bogen`, ohne
   * dass der Bewerber irgendetwas getan hätte.
   */
  it("zählt nichts, was nicht abgeschickt wurde", () => {
    expect(istAusgefuellterBogen(KL_OFFEN)).toBe(false);
    expect(istAusgefuellterBogen(VORAB_ABGELAUFEN)).toBe(false);
    expect(istAusgefuellterBogen({ status: "abgelaufen" })).toBe(false);
    expect(istAusgefuellterBogen({ status: "ersetzt" })).toBe(false);
    expect(istAusgefuellterBogen({})).toBe(false);
    expect(istAusgefuellterBogen(null)).toBe(false);
    expect(istAusgefuellterBogen(undefined)).toBe(false);
  });
});

describe("kennenlernLinkStand", () => {
  it("meldet bei einem Altbestand nur mit Vorabbogen, dass ein Link fehlt", () => {
    const stand = kennenlernLinkStand([VORAB_ABGELAUFEN], JETZT);
    expect(stand).toEqual({ art: "fehlt", grund: "nur_vorabbogen" });
    expect(brauchtNeuenLink(stand)).toBe(true);
  });

  it("meldet ohne jede Zeile, dass noch keiner besteht", () => {
    expect(kennenlernLinkStand([], JETZT)).toEqual({ art: "fehlt", grund: "keiner" });
    expect(kennenlernLinkStand(null, JETZT)).toEqual({ art: "fehlt", grund: "keiner" });
  });

  it("nimmt den offenen, gültigen Kennenlern-Link, auch wenn eine jüngere Vorabzeile daneben liegt", () => {
    const juengererVorab = { ...VORAB_ABGELAUFEN, token: "vorab-2", created_at: "2026-09-12T10:00:00Z" };
    const stand = kennenlernLinkStand([juengererVorab, KL_OFFEN], JETZT);
    expect(stand.art).toBe("gueltig");
    if (stand.art === "gueltig") {
      expect(stand.token).toBe("kl-offen");
      expect(stand.link).toBe(`${KENNENLERNEN_BASIS}/kl-offen`);
      expect(stand.laeuftAbAm).toBe("2027-03-09T10:00:00Z");
    }
    expect(brauchtNeuenLink(stand)).toBe(false);
  });

  it("hält einen noch „offenen“ Link mit verstrichenem Datum für abgelaufen", () => {
    const abgelaufen = { ...KL_OFFEN, expires_at: "2026-09-01T10:00:00Z" };
    expect(kennenlernLinkStand([abgelaufen], JETZT)).toEqual({ art: "fehlt", grund: "abgelaufen" });
  });

  it("meldet einen ersetzten Link als ersetzt", () => {
    const ersetzt = { ...KL_OFFEN, status: "ersetzt" };
    expect(kennenlernLinkStand([ersetzt], JETZT)).toEqual({ art: "fehlt", grund: "ersetzt" });
  });

  it("führt bei eingereichtem Bogen ohne offenen Link auf dessen Abschlussseite", () => {
    const stand = kennenlernLinkStand([KL_EINGEREICHT, VORAB_ABGELAUFEN], JETZT);
    expect(stand).toEqual({
      art: "eingereicht",
      token: "kl-fertig",
      link: `${KENNENLERNEN_BASIS}/kl-fertig`,
    });
    // Kein neuer Token: Der Bewerber soll nicht ein zweites Mal ausfüllen.
    expect(brauchtNeuenLink(stand)).toBe(false);
  });

  it("zieht nach einer erneuten Einladung den neuen offenen Link dem eingereichten vor", () => {
    const stand = kennenlernLinkStand([KL_EINGEREICHT, KL_OFFEN], JETZT);
    expect(stand.art).toBe("gueltig");
    if (stand.art === "gueltig") expect(stand.token).toBe("kl-offen");
  });

  it("sortiert selbst, falls die Zeilen nicht absteigend hereinkommen", () => {
    const alt = { ...KL_OFFEN, token: "kl-alt", created_at: "2026-09-01T10:00:00Z" };
    const stand = kennenlernLinkStand([alt, KL_OFFEN], JETZT);
    if (stand.art === "gueltig") expect(stand.token).toBe("kl-offen");
    else throw new Error("gültiger Link erwartet");
  });
});

describe("ohneMailErzeugt", () => {
  it("erkennt eine Zeile, die nur für einen Link angelegt wurde", () => {
    expect(ohneMailErzeugt({ bogen: "kennenlernen", ohneMail: true })).toBe(true);
    expect(ohneMailErzeugt({ bogen: "kennenlernen" })).toBe(false);
    expect(ohneMailErzeugt(undefined)).toBe(false);
  });
});
