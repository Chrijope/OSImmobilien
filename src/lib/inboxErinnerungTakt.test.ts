import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Der Mindestabstand der Glocken-Erinnerung an überfällige Inbox-Aufgaben.
 *
 * Der Kern der Sache steht im letzten Block: Der Abstand muss ein Neuladen
 * der Seite überleben. Vorher lag er als Tagesmerker im Browserspeicher, und
 * jede neue Umgebung (Lovable-Vorschau, zweites Gerät, privates Fenster)
 * fing wieder bei null an. Genau deshalb kam die Meldung zweimal innerhalb
 * einer Viertelstunde.
 */

/**
 * Steht für `user_settings.einstellungen`, also für den Ablageort auf dem
 * Server. Der Inhalt überlebt hier absichtlich jedes Zurücksetzen der
 * Browser-Speicher, denn genau so verhält sich die echte Tabelle.
 */
const nutzerEinstellungen: Record<string, unknown> = {};

vi.mock("./userSettingsCache", () => ({
  getUserSetting: (schluessel: string, rueckfall: unknown) =>
    nutzerEinstellungen[schluessel] !== undefined ? nutzerEinstellungen[schluessel] : rueckfall,
  setUserSetting: (schluessel: string, wert: unknown) => {
    nutzerEinstellungen[schluessel] = wert;
  },
}));

import {
  darfErinnern,
  darfJetztErinnern,
  getErinnerungsTakt,
  getLetzteErinnerung,
  istTakt,
  merkeErinnerung,
  mindestabstandMinuten,
  setErinnerungsTakt,
  STANDARD_TAKT,
  TAKT_AUSWAHL,
} from "./inboxErinnerungTakt";

const T0 = new Date("2026-09-18T09:00:00");
const nach = (minuten: number) => new Date(T0.getTime() + minuten * 60_000);

/**
 * Ein Neuladen der Seite nachstellen: Alles, was nur im Browser liegt, ist
 * weg. Die Nutzereinstellungen oben bleiben, denn die stehen auf dem Server.
 */
function seiteNeuLaden() {
  globalThis.localStorage?.clear();
  globalThis.sessionStorage?.clear();
}

beforeEach(() => {
  for (const k of Object.keys(nutzerEinstellungen)) delete nutzerEinstellungen[k];
  seiteNeuLaden();
});

describe("Auswahl und Vorgabe", () => {
  it("hat vier Möglichkeiten und stellt zweimal täglich vorein", () => {
    expect(TAKT_AUSWAHL.map((a) => a.wert)).toEqual([
      "stuendlich",
      "zweimal_taeglich",
      "einmal_taeglich",
      "aus",
    ]);
    expect(STANDARD_TAKT).toBe("zweimal_taeglich");
    expect(getErinnerungsTakt()).toBe("zweimal_taeglich");
  });

  it("erkennt gültige Werte und weist Unsinn ab", () => {
    expect(istTakt("stuendlich")).toBe(true);
    expect(istTakt("alle_sieben_minuten")).toBe(false);
    nutzerEinstellungen["inbox_erinnerung_takt"] = "alle_sieben_minuten";
    expect(getErinnerungsTakt()).toBe(STANDARD_TAKT);
  });

  it("rechnet die Abstände in Minuten um", () => {
    expect(mindestabstandMinuten("stuendlich")).toBe(60);
    expect(mindestabstandMinuten("zweimal_taeglich")).toBe(720);
    expect(mindestabstandMinuten("einmal_taeglich")).toBe(1440);
    expect(mindestabstandMinuten("aus")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("darfErinnern: die Regel selbst", () => {
  it("erinnert beim ersten Mal, solange nichts gemerkt ist", () => {
    expect(darfErinnern({ takt: "zweimal_taeglich", zuletzt: null, jetzt: T0 })).toBe(true);
  });

  it("schweigt innerhalb des Abstands und meldet sich danach wieder", () => {
    const zuletzt = T0.toISOString();
    expect(darfErinnern({ takt: "stuendlich", zuletzt, jetzt: nach(7) })).toBe(false);
    expect(darfErinnern({ takt: "stuendlich", zuletzt, jetzt: nach(59) })).toBe(false);
    expect(darfErinnern({ takt: "stuendlich", zuletzt, jetzt: nach(60) })).toBe(true);
  });

  it("hält bei zweimal täglich zwölf Stunden Abstand", () => {
    const zuletzt = T0.toISOString();
    expect(darfErinnern({ takt: "zweimal_taeglich", zuletzt, jetzt: nach(11 * 60) })).toBe(false);
    expect(darfErinnern({ takt: "zweimal_taeglich", zuletzt, jetzt: nach(12 * 60) })).toBe(true);
  });

  it("hält bei einmal täglich vierundzwanzig Stunden Abstand", () => {
    const zuletzt = T0.toISOString();
    expect(darfErinnern({ takt: "einmal_taeglich", zuletzt, jetzt: nach(23 * 60) })).toBe(false);
    expect(darfErinnern({ takt: "einmal_taeglich", zuletzt, jetzt: nach(24 * 60) })).toBe(true);
  });

  it("schweigt bei abgeschalteter Erinnerung für immer", () => {
    expect(darfErinnern({ takt: "aus", zuletzt: null, jetzt: T0 })).toBe(false);
    expect(darfErinnern({ takt: "aus", zuletzt: T0.toISOString(), jetzt: nach(99999) })).toBe(false);
  });

  it("erinnert einmal, wenn der gemerkte Zeitpunkt unlesbar ist", () => {
    expect(darfErinnern({ takt: "stuendlich", zuletzt: "kaputt", jetzt: T0 })).toBe(true);
  });

  it("lässt sich von einem Zeitpunkt aus der Zukunft nicht aushebeln", () => {
    const zukunft = nach(120).toISOString();
    expect(darfErinnern({ takt: "stuendlich", zuletzt: zukunft, jetzt: T0 })).toBe(false);
  });
});

describe("Mindestabstand über einen Neustart der Seite hinweg", () => {
  it("erinnert nach dem Neuladen nicht erneut, solange der Abstand läuft", () => {
    setErinnerungsTakt("zweimal_taeglich");

    // Erste Erinnerung um 9 Uhr.
    expect(darfJetztErinnern(T0)).toBe(true);
    merkeErinnerung(T0);

    // Der Nutzer lädt die Seite neu: Browser-Speicher weg, Ereignisse laufen
    // von vorn. Die Nutzereinstellungen liegen auf dem Server und bleiben.
    seiteNeuLaden();

    expect(getLetzteErinnerung()).toBe(T0.toISOString());
    expect(darfJetztErinnern(nach(18))).toBe(false); // Christians Fall: 18 Minuten später
    expect(darfJetztErinnern(nach(60))).toBe(false);
    expect(darfJetztErinnern(nach(12 * 60))).toBe(true);
  });

  it("gilt auch an einem zweiten Gerät, weil der Stand am Nutzer hängt", () => {
    setErinnerungsTakt("stuendlich");
    merkeErinnerung(T0);

    // Zweites Gerät: eigener Browser, eigener Speicher, aber dieselbe Zeile
    // in `user_settings`.
    seiteNeuLaden();
    expect(darfJetztErinnern(nach(10))).toBe(false);
  });

  it("schaltet die Erinnerung mit der Einstellung ganz ab", () => {
    setErinnerungsTakt("aus");
    expect(darfJetztErinnern(T0)).toBe(false);
    expect(darfJetztErinnern(nach(10_000))).toBe(false);
  });
});
