import { describe, it, expect } from 'vitest';
import { berlinJetzt, meetingVorschlag, meetingZeitISO, meetingZeitInZukunft } from './meetingZeit';

/**
 * Ein Meeting darf nie in der Vergangenheit liegen.
 *
 * Gerechnet wird in Europe/Berlin, also in derselben Zeitzone wie
 * `meeting_anlegen` in der Datenbank. Alle Tests arbeiten deshalb mit festen
 * Zeitpunkten in UTC und prüfen das Ergebnis in Berliner Zeit. So fallen sie
 * nicht je nach Tageszeit oder Gerätezeitzone um.
 */

// 18.09.2026 ist Sommerzeit, Berlin liegt also zwei Stunden vor UTC.
const SOMMER_1305 = new Date('2026-09-18T11:05:00Z'); // 13:05 Berlin
const SOMMER_1055 = new Date('2026-09-18T08:55:00Z'); // 10:55 Berlin
const SOMMER_1740 = new Date('2026-09-18T15:40:00Z'); // 17:40 Berlin
const SOMMER_2330 = new Date('2026-09-18T21:30:00Z'); // 23:30 Berlin
// 09.12.2026 ist Winterzeit, Berlin liegt eine Stunde vor UTC.
const WINTER_2330 = new Date('2026-12-09T22:30:00Z'); // 23:30 Berlin

describe('berlinJetzt', () => {
  it('liest die Berliner Wanduhr, nicht die des Geräts', () => {
    expect(berlinJetzt(SOMMER_1305)).toEqual({ datum: '2026-09-18', uhrzeit: '13:05' });
    expect(berlinJetzt(WINTER_2330)).toEqual({ datum: '2026-12-09', uhrzeit: '23:30' });
  });

  it('nennt nach Mitternacht in Berlin bereits den neuen Tag', () => {
    // 22:30 UTC ist in Berlin im Sommer schon 00:30 des Folgetags.
    expect(berlinJetzt(new Date('2026-09-18T22:30:00Z'))).toEqual({ datum: '2026-09-19', uhrzeit: '00:30' });
  });
});

describe('meetingVorschlag beim Öffnen', () => {
  /*
   * Seit dem 19.09.2026: heute, jetzt plus fünf Minuten, ohne Rundung.
   *
   * Vorher wurde auf die nächste halbe Stunde aufgerundet und ab 18 Uhr auf den
   * nächsten Morgen ausgewichen. Wer um 17:40 ein Meeting für gleich anlegen
   * wollte, bekam den nächsten Tag angeboten und musste beide Felder von Hand
   * ändern.
   */
  it('schlägt die aktuelle Uhrzeit mit fünf Minuten Luft vor', () => {
    expect(meetingVorschlag(SOMMER_1305)).toEqual({ datum: '2026-09-18', uhrzeit: '13:10' });
    expect(meetingVorschlag(SOMMER_1055)).toEqual({ datum: '2026-09-18', uhrzeit: '11:00' });
  });

  it('bleibt auch am späten Nachmittag und am Abend beim heutigen Tag', () => {
    expect(meetingVorschlag(SOMMER_1740)).toEqual({ datum: '2026-09-18', uhrzeit: '17:45' });
    expect(meetingVorschlag(SOMMER_2330)).toEqual({ datum: '2026-09-18', uhrzeit: '23:35' });
  });

  it('wechselt über Mitternacht zwangsläufig den Tag', () => {
    // 23:58 plus fünf Minuten: ein „heute" in der Zukunft gibt es nicht mehr.
    const kurzVorMitternacht = new Date('2026-09-18T21:58:00Z'); // 23:58 Berlin
    expect(meetingVorschlag(kurzVorMitternacht)).toEqual({ datum: '2026-09-19', uhrzeit: '00:03' });
  });

  it('schlägt nie mehr als eine Viertelstunde voraus', () => {
    // Der Vorschlag soll dicht an der echten Uhrzeit liegen, das war der Anlass
    // der Änderung. Die Zeitumstellung darf ihn ein Stück weiterschieben, aber
    // nicht in den nächsten Vormittag.
    for (const start of ['2026-09-18T00:00:00Z', '2026-12-09T00:00:00Z']) {
      for (let minute = 0; minute < 24 * 60; minute += 7) {
        const jetzt = new Date(Date.parse(start) + minute * 60_000);
        const v = meetingVorschlag(jetzt);
        const abstand = Date.parse(meetingZeitISO(v.datum, v.uhrzeit)) - jetzt.getTime();
        expect(abstand, `${jetzt.toISOString()} -> ${v.datum} ${v.uhrzeit}`).toBeLessThanOrEqual(15 * 60_000);
      }
    }
  });

  it('liegt zu jeder Minute des Tages in der Zukunft', () => {
    // Ein ganzer Tag im Minutentakt, Sommerzeit und Winterzeit.
    for (const start of ['2026-09-18T00:00:00Z', '2026-12-09T00:00:00Z']) {
      for (let minute = 0; minute < 24 * 60; minute++) {
        const jetzt = new Date(Date.parse(start) + minute * 60_000);
        const v = meetingVorschlag(jetzt);
        expect(meetingZeitInZukunft(v.datum, v.uhrzeit, jetzt)).toBe(true);
      }
    }
  });

  it('liegt auch am Tag der Zeitumstellung in der Zukunft', () => {
    // 25.10.2026 ist das Ende der Sommerzeit, 29.03.2026 ihr Beginn.
    for (const start of ['2026-10-25T00:00:00Z', '2026-03-29T00:00:00Z']) {
      for (let minute = 0; minute < 24 * 60; minute += 5) {
        const jetzt = new Date(Date.parse(start) + minute * 60_000);
        const v = meetingVorschlag(jetzt);
        expect(meetingZeitInZukunft(v.datum, v.uhrzeit, jetzt)).toBe(true);
      }
    }
  });
});

describe('meetingZeitInZukunft', () => {
  it('lehnt heute mit vergangener Uhrzeit ab', () => {
    expect(meetingZeitInZukunft('2026-09-18', '13:04', SOMMER_1305)).toBe(false);
    expect(meetingZeitInZukunft('2026-09-18', '09:00', SOMMER_1305)).toBe(false);
    // Genau jetzt ist keine Zukunft, die Datenbank prüft mit `_start <= now()`.
    expect(meetingZeitInZukunft('2026-09-18', '13:05', SOMMER_1305)).toBe(false);
  });

  it('lässt heute mit künftiger Uhrzeit zu', () => {
    expect(meetingZeitInZukunft('2026-09-18', '13:06', SOMMER_1305)).toBe(true);
    expect(meetingZeitInZukunft('2026-09-18', '23:45', SOMMER_1305)).toBe(true);
  });

  it('lässt morgen auch mit früher Uhrzeit zu', () => {
    expect(meetingZeitInZukunft('2026-09-19', '00:15', SOMMER_1305)).toBe(true);
    expect(meetingZeitInZukunft('2026-09-19', '07:00', SOMMER_1740)).toBe(true);
  });

  it('lehnt gestern ab, auch mit später Uhrzeit', () => {
    expect(meetingZeitInZukunft('2026-09-17', '23:59', SOMMER_1305)).toBe(false);
  });

  it('rechnet in Berlin und nicht in der Zone des Geräts', () => {
    // 22:30 UTC ist in Berlin schon 00:30 am 19.09. Ein Termin am 19.09. um
    // 00:15 liegt damit in der Vergangenheit, obwohl das UTC-Datum noch der
    // 18.09. ist.
    const kurzNachMitternachtBerlin = new Date('2026-09-18T22:30:00Z');
    expect(meetingZeitInZukunft('2026-09-19', '00:15', kurzNachMitternachtBerlin)).toBe(false);
    expect(meetingZeitInZukunft('2026-09-19', '00:45', kurzNachMitternachtBerlin)).toBe(true);
  });

  it('lehnt die Stunde ab, die es wegen der Zeitumstellung nicht gibt', () => {
    expect(meetingZeitInZukunft('2026-03-29', '02:30', SOMMER_1305)).toBe(false);
  });

  it('lehnt unbrauchbare Eingaben ab, statt zu werfen', () => {
    expect(meetingZeitInZukunft('', '10:00', SOMMER_1305)).toBe(false);
    expect(meetingZeitInZukunft('2026-09-19', '', SOMMER_1305)).toBe(false);
    expect(meetingZeitInZukunft('2026-02-31', '10:00', SOMMER_1305)).toBe(false);
  });
});
