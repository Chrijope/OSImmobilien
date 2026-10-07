import { describe, expect, it } from "vitest";
import {
  berlinZeitpunkt,
  ERSTGESPRAECH_VEREINBART,
  faelligeStufen,
  FOLLOW_UP_GEPLANT,
  hatReaktion,
  reaktionAb,
  type AktivitaetKurz,
} from "../../supabase/functions/_shared/follow-up-eskalation";

/**
 * Regeln der Edge Function `follow-up-eskalation` (Nachbesserung 28.09.2026).
 *
 * Beim Anlegen eines Follow-ups entsteht selbst ein Verlaufseintrag
 * („Follow-Up geplant …"), Millisekunden nach `followUpGesetztAm`. Zaehlte
 * er als Reaktion, fielen Stufe 2 und 3 praktisch immer aus.
 */

const STUNDE = 3_600_000;

/** Der Ablauf: anlegen samt Planungseintrag, dann zu `jetzt` pruefen. */
function stufenFuer(opts: {
  gesetztAm: string;
  faellig: Date;
  jetzt: Date;
  aktivitaeten: AktivitaetKurz[];
}) {
  const ab = reaktionAb(opts.gesetztAm, opts.faellig);
  // Die Datenbank liefert nur, was nach `ab` liegt; hatReaktion prueft es erneut.
  const geliefert = opts.aktivitaeten.filter((a) => new Date(String(a.datum)).getTime() > ab.getTime());
  const minuten = (opts.jetzt.getTime() - opts.faellig.getTime()) / 60_000;
  return faelligeStufen({}, minuten, hatReaktion(geliefert, ab));
}

describe("Follow-Up-Eskalation: was als Reaktion zaehlt", () => {
  const gesetztAm = "2026-09-28T10:00:00.000Z";
  const faellig = berlinZeitpunkt("2026-09-29", "09:00")!;
  const planung: AktivitaetKurz = {
    datum: "2026-09-28T10:00:00.001Z",
    beschreibung: `${FOLLOW_UP_GEPLANT} "Rueckruf" am 2026-09-29 um 09:00 Uhr`,
  };

  it("nur der Planungseintrag, keine Reaktion: Stufe 1, 2 und 3 kommen", () => {
    const jetzt = new Date(faellig.getTime() + 25 * STUNDE);
    expect(stufenFuer({ gesetztAm, faellig, jetzt, aktivitaeten: [planung] }))
      .toEqual(["followUpEsk1Sent", "followUpEsk2Sent", "followUpEsk3Sent"]);
  });

  it("echte Aktivitaet nach der Faelligkeit: Stufe 2 und 3 entfallen", () => {
    const jetzt = new Date(faellig.getTime() + 25 * STUNDE);
    const anruf = { datum: new Date(faellig.getTime() + STUNDE).toISOString(), beschreibung: "Anruf, nicht erreicht" };
    expect(stufenFuer({ gesetztAm, faellig, jetzt, aktivitaeten: [planung, anruf] }))
      .toEqual(["followUpEsk1Sent"]);
  });

  it("Aktivitaet zwischen Anlegen und Faelligkeit ist keine Reaktion", () => {
    const jetzt = new Date(faellig.getTime() + 4 * STUNDE);
    const notiz = { datum: "2026-09-28T15:00:00.000Z", beschreibung: "Notiz" };
    expect(stufenFuer({ gesetztAm, faellig, jetzt, aktivitaeten: [planung, notiz] }))
      .toEqual(["followUpEsk1Sent", "followUpEsk2Sent"]);
  });

  it("sofort faelliges Follow-up: der Planungseintrag in derselben Millisekunde zaehlt nicht", () => {
    const frueh = berlinZeitpunkt("2026-09-28", "09:00")!; // liegt vor dem Anlegen
    const jetzt = new Date(new Date(gesetztAm).getTime() + 25 * STUNDE);
    const gleich = { datum: gesetztAm, beschreibung: `${FOLLOW_UP_GEPLANT} "x"` };
    const kurzDanach = { datum: "2026-09-28T10:00:00.004Z", beschreibung: `${ERSTGESPRAECH_VEREINBART} "x"` };
    expect(stufenFuer({ gesetztAm, faellig: frueh, jetzt, aktivitaeten: [gleich, kurzDanach] }))
      .toEqual(["followUpEsk1Sent", "followUpEsk2Sent", "followUpEsk3Sent"]);

    const email = { datum: "2026-09-28T12:00:00.000Z", beschreibung: "E-Mail gesendet" };
    expect(stufenFuer({ gesetztAm, faellig: frueh, jetzt, aktivitaeten: [gleich, email] }))
      .toEqual(["followUpEsk1Sent"]);
  });

  it("bereits gesendete Stufen gehen nicht erneut hinaus", () => {
    expect(faelligeStufen({ followUpEsk1Sent: "x", followUpEsk2Sent: "y" }, 1500, false)).toEqual(["followUpEsk3Sent"]);
    expect(faelligeStufen({}, -1, false)).toEqual([]);
  });
});

describe("Follow-Up-Eskalation: Faelligkeit in deutscher Ortszeit", () => {
  it("Sommerzeit: 09:00 ist 07:00 UTC", () => {
    expect(berlinZeitpunkt("2026-09-29", "09:00")?.toISOString()).toBe("2026-09-29T07:00:00.000Z");
  });

  it("Winterzeit: 09:00 ist 08:00 UTC", () => {
    expect(berlinZeitpunkt("2026-01-15", "09:00")?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("an den Umstellungstagen", () => {
    expect(berlinZeitpunkt("2026-03-29", "12:00")?.toISOString()).toBe("2026-03-29T10:00:00.000Z");
    expect(berlinZeitpunkt("2026-03-29", "01:30")?.toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(berlinZeitpunkt("2026-10-25", "12:00")?.toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });

  it("einstellige Stunde und unlesbare Angaben", () => {
    expect(berlinZeitpunkt("2026-09-29", "9:30")?.toISOString()).toBe("2026-09-29T07:30:00.000Z");
    expect(berlinZeitpunkt("", "09:00")).toBeNull();
    expect(berlinZeitpunkt("2026-09-29", "")).toBeNull();
  });
});
