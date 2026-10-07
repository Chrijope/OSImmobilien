/**
 * Die Sammelmail zum Kennenlernen startet die Erinnerungskette nicht neu.
 *
 * Bis zum 26.09.2026 setzte `send-bewerber-nachfass` den Anker der Kette
 * (`meta.kennenlernen.gesendetAm`) auf den Tag der Sammelmail. Die
 * Erinnerungen liefen danach ein zweites Mal, und wer noch nie eingeladen
 * war, bekam eine ganz neue Kette samt automatischem Abschluss nach elf Tagen.
 * Jetzt ist die Sammelmail eine einzelne Mail: Verschicktes bleibt verschickt,
 * und es gibt keine neue Runde.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { metaNachNachfass } from "../../supabase/functions/_shared/bewerber-nachfass";
import {
  faelligeErinnerung,
  kettenStand,
  stoppGrund,
  type BewerberDaten,
} from "@/lib/kennenlernenErinnerungen";
import { standAusBewerber } from "@/lib/kennenlernenStand";

const TAG = 86_400_000;
const NACHFASS = new Date("2026-09-26T09:00:00.000Z");
const eintrag = { id: "n1", text: "Sammelmail zum Kennenlernen gesendet", datum: NACHFASS.toISOString(), autor: "HR", autorId: "u1" };

/** Ein Bewerber, der vor `tageHer` Tagen eingeladen wurde und bei `stufe` steht. */
function eingeladen(tageHer: number, stufe: number): Record<string, unknown> {
  return {
    notizenLog: [{ id: "alt", text: "älterer Eintrag" }],
    kennenlernen: {
      formularId: "f1",
      gesendetAm: new Date(NACHFASS.getTime() - tageHer * TAG).toISOString(),
      versandOk: true,
      erinnerungStufe: stufe,
      erinnerung1Am: stufe >= 1 ? new Date(NACHFASS.getTime() - (tageHer - 3) * TAG).toISOString() : undefined,
    },
  };
}

const bogen = { status: "offen", expires_at: new Date(NACHFASS.getTime() + 180 * TAG).toISOString() };

/** Welche Erinnerungen in den nächsten `tage` Tagen hinausgingen, wie im Zeitplan. */
function kommendeMails(meta: Record<string, unknown>, tage = 40): string[] {
  const mails: string[] = [];
  let aktuell = meta;
  for (let t = 0; t <= tage; t++) {
    const heute = new Date(NACHFASS.getTime() + t * TAG);
    const zeile: BewerberDaten = { status: "Eingang", meta: aktuell };
    const art = faelligeErinnerung(kettenStand(zeile, bogen), heute);
    if (art === "keine") continue;
    mails.push(`${art}@+${t}`);
    const block = aktuell.kennenlernen as Record<string, unknown>;
    aktuell = { ...aktuell, kennenlernen: { ...block, erinnerungStufe: art === "tag3" ? 1 : 3 } };
  }
  return mails;
}

describe("Der Vermerk der Sammelmail", () => {
  it("setzt nur den Merker und den Verlaufseintrag", () => {
    const vorher = eingeladen(5, 1);
    const nachher = metaNachNachfass(vorher, NACHFASS.toISOString(), eintrag);
    expect(nachher.klNachfassMailAm).toBe(NACHFASS.toISOString());
    expect(nachher.notizenLog).toEqual([eintrag, { id: "alt", text: "älterer Eintrag" }]);
    // Die Kette selbst bleibt Wort für Wort, wie sie war.
    expect(nachher.kennenlernen).toEqual(vorher.kennenlernen);
  });

  it("legt bei einem nie eingeladenen Bewerber keinen Kettenblock an", () => {
    const nachher = metaNachNachfass({ status: "x" }, NACHFASS.toISOString(), eintrag);
    expect(nachher).not.toHaveProperty("kennenlernen");
  });

  it("verträgt ein fehlendes Meta-Feld", () => {
    const nachher = metaNachNachfass(null, NACHFASS.toISOString(), eintrag);
    expect(nachher).toEqual({ klNachfassMailAm: NACHFASS.toISOString(), notizenLog: [eintrag] });
  });
});

describe("Nach der Sammelmail läuft die Kette weiter, wie sie stand", () => {
  it("zwischen Tag 3 und Tag 11: nur noch Tag 11, gezählt ab der Einladung", () => {
    // Eingeladen vor 5 Tagen, Tag 3 ist hinaus. Tag 11 ist in 6 Tagen fällig.
    const nachher = metaNachNachfass(eingeladen(5, 1), NACHFASS.toISOString(), eintrag);
    expect(kommendeMails(nachher)).toEqual(["tag11@+6"]);
  });

  it("vor Tag 3: Tag 3 und Tag 11, nicht verschoben", () => {
    const nachher = metaNachNachfass(eingeladen(1, 0), NACHFASS.toISOString(), eintrag);
    expect(kommendeMails(nachher)).toEqual(["tag3@+2", "tag11@+10"]);
  });

  it("ruht am Tag der Sammelmail selbst", () => {
    // Tag 11 wäre heute fällig. Die Sammelmail geht heute hinaus, also morgen.
    const nachher = metaNachNachfass(eingeladen(11, 1), NACHFASS.toISOString(), eintrag);
    expect(kommendeMails(nachher)).toEqual(["tag11@+1"]);
  });

  it("nach durchgelaufener Kette: keine neue Runde", () => {
    const nachher = metaNachNachfass(eingeladen(20, 3), NACHFASS.toISOString(), eintrag);
    expect(kommendeMails(nachher)).toEqual([]);
    expect(stoppGrund(kettenStand({ status: "Eingang", meta: nachher }, bogen), NACHFASS)).toBe("fertig");
  });

  it("nie eingeladen: die Sammelmail stößt keine Kette an", () => {
    const nachher = metaNachNachfass({}, NACHFASS.toISOString(), eintrag);
    expect(kommendeMails(nachher)).toEqual([]);
    expect(stoppGrund(kettenStand({ status: "Eingang", meta: nachher }, bogen), NACHFASS)).toBe("keine_mail");
  });

  it("die Karte im CRM rechnet bei nie Eingeladenen genauso, trotz des angelegten Bogens", () => {
    const stand = standAusBewerber(
      {
        status: "Eingang",
        kennenlernenGesendetAm: "",
        klNachfassMailAm: NACHFASS.toISOString(),
      } as Parameters<typeof standAusBewerber>[0],
      { status: "offen", erstelltAm: NACHFASS.toISOString() },
    );
    const spaeter = new Date(NACHFASS.getTime() + 12 * TAG);
    expect(faelligeErinnerung(stand, spaeter)).toBe("keine");
    expect(stoppGrund(stand, spaeter)).toBe("keine_mail");
  });
});

describe("Die Function schreibt den Vermerk über die geprüfte Funktion", () => {
  const funktion = readFileSync(
    join(process.cwd(), "supabase", "functions", "send-bewerber-nachfass", "index.ts"),
    "utf8",
  );

  it("benutzt metaNachNachfass und setzt den Anker nicht mehr", () => {
    expect(funktion).toContain("meta: metaNachNachfass(meta, jetzt,");
    expect(funktion).not.toMatch(/gesendetAm:\s*jetzt/);
    expect(funktion).not.toMatch(/stufe:\s*0/);
  });
});
