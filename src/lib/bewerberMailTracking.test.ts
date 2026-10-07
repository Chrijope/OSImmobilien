import { afterEach, describe, it, expect, vi } from "vitest";
import {
  KENNENLERN_MAILS,
  MAIL_ERINNERUNG_2,
  MAIL_KENNENLERNEN,
  OEFFNUNG_UNSICHER,
  mailName,
  meldeLinkAufruf,
  mitBogenBeleg,
  oeffnungAus,
  type MailTrackingZeile,
} from "./bewerberMailTracking";
import {
  istEigenesWeiterleitungsziel,
  mitZaehlmarke,
} from "../../supabase/functions/_shared/mail-zaehlung";

/**
 * Die Linkzählung der Bewerbermails, Rechenteil.
 *
 * Geprüft wird hier die Frage, die am Briefsymbol hängt: Wurde der Link aus
 * der Mail aufgerufen, welcher Aufruf zählt, wenn mehrere Mails draußen sind,
 * und was gilt bei Altdaten. Seit dem 26.09.2026 gibt es kein Zählpixel mehr;
 * ein `opened_at` allein zählt deshalb nicht.
 */

const zeile = (over: Partial<MailTrackingZeile>): MailTrackingZeile => ({
  token: "t",
  bewerber_id: "b1",
  kind: MAIL_KENNENLERNEN,
  sent_at: "2026-09-01T08:00:00Z",
  opened_at: null,
  tracked: true,
  ...over,
});

describe("Ob eine Öffnung gemessen wurde", () => {
  it("gibt null, wenn gar keine Mail gemessen wird", () => {
    expect(oeffnungAus([])).toBeNull();
    expect(oeffnungAus(undefined)).toBeNull();
  });

  /*
   * Altdaten aus der Zeit vor dem Zählpixel tragen `tracked = false`. Sie als
   * „verschickt, nicht geöffnet" mitzuzählen, verschlechterte die Quote um
   * Fälle, bei denen nie jemand hingesehen hat.
   */
  it("übergeht Zeilen ohne Messung", () => {
    expect(oeffnungAus([zeile({ tracked: false })])).toBeNull();
  });

  it("zählt eine verschickte, ungeöffnete Mail", () => {
    const stand = oeffnungAus([zeile({})]);
    expect(stand).toEqual({ gesendet: 1, geoeffnet: 0 });
  });

  it("meldet den Linkaufruf mit Zeitpunkt und Mailnamen", () => {
    const stand = oeffnungAus([zeile({ opened_at: "2026-09-02T09:00:00Z", clicked_at: "2026-09-02T09:00:00Z" })]);
    expect(stand?.geoeffnet).toBe(1);
    expect(stand?.geoeffnetAm).toBe("2026-09-02T09:00:00Z");
    expect(stand?.geoeffneteMail).toBe("Einladung zum Kennenlernen");
  });

  /*
   * Der Randfall „mehrere Mails an denselben Bewerber": Grün wird es, sobald
   * irgendeine geöffnet wurde, und genannt wird die jüngste Öffnung. Die Frage
   * lautet „hat er es gesehen", nicht „hat er genau diese eine gesehen".
   */
  it("nimmt bei mehreren Mails die jüngste Öffnung", () => {
    const stand = oeffnungAus([
      zeile({ token: "a", clicked_at: "2026-09-02T09:00:00Z" }),
      zeile({ token: "b", kind: MAIL_ERINNERUNG_2, clicked_at: "2026-09-09T11:00:00Z" }),
      zeile({ token: "c", kind: "kennenlernen_erinnerung_3" }),
    ]);
    expect(stand).toEqual({
      gesendet: 3,
      geoeffnet: 2,
      geoeffnetAm: "2026-09-09T11:00:00Z",
      geoeffneteMail: "Erinnerung an das Kennenlernen (Tag 8)",
      quelle: "link",
    });
  });

  it("wird grün, auch wenn nur eine Erinnerung geöffnet wurde", () => {
    const stand = oeffnungAus([
      zeile({ token: "a" }),
      zeile({ token: "b", kind: MAIL_ERINNERUNG_2, clicked_at: "2026-09-09T11:00:00Z" }),
    ]);
    expect(stand?.geoeffnet).toBe(1);
  });

  /*
   * Seit dem 26.09.2026 ohne Zählpixel. Ein `opened_at` aus der Pixelzeit
   * darf die Anzeige nicht mehr grün machen, gleich ob mit Herkunft `pixel`
   * oder ohne: Das wäre eine Öffnung, die wir heute nicht mehr messen.
   */
  it("zählt ein Pixel-opened_at ohne Linkaufruf nicht mehr", () => {
    expect(oeffnungAus([zeile({ opened_at: "2026-09-02T09:00:00Z" })])).toEqual({ gesendet: 1, geoeffnet: 0 });
    expect(
      oeffnungAus([zeile({ opened_at: "2026-09-02T09:00:00Z", opened_source: "pixel" })])?.geoeffnet,
    ).toBe(0);
  });
});

/*
 * Die aus dem ausgefüllten Kennenlernbogen abgeleitete Öffnung, seit dem
 * 15.09.2026.
 *
 * Sie steht auf einer Zeile ohne Zählpixel (`tracked = false`), denn gemessen
 * wurde nichts. Trotzdem ist sie der sicherste Beleg, den es gibt: Der Link
 * zum Bogen steht ausschließlich in dieser Mail. Deshalb zählt sie mit, und
 * deshalb wird sie getrennt ausgewiesen.
 */
describe("Öffnung aus dem ausgefüllten Bogen", () => {
  it("zählt auch ohne Zählpixel, wenn ein Vermerk vorliegt", () => {
    const stand = oeffnungAus([
      zeile({ tracked: false, opened_at: "2026-09-10T07:00:00Z", opened_source: "bogen" }),
    ]);
    expect(stand?.geoeffnet).toBe(1);
    expect(stand?.quelle).toBe("bogen");
  });

  it("lässt eine ungemessene Zeile ohne Vermerk weiter draußen", () => {
    expect(oeffnungAus([zeile({ tracked: false, opened_source: "bogen" })])).toBeNull();
  });

  /*
   * Kommt zu einer abgeleiteten Öffnung später doch eine gemessene hinzu,
   * gewinnt die jüngste. Das ist dieselbe Regel wie bei mehreren Mails und
   * macht den Tooltip in diesem Fall wieder zur Messung.
   */
  it("nennt die jüngste Öffnung, auch wenn die Herkunft wechselt", () => {
    const stand = oeffnungAus([
      zeile({ token: "a", tracked: false, opened_at: "2026-09-10T07:00:00Z", opened_source: "bogen" }),
      zeile({ token: "b", kind: MAIL_ERINNERUNG_2, opened_at: "2026-09-12T07:00:00Z", clicked_at: "2026-09-12T07:00:00Z", opened_source: "pixel" }),
    ]);
    expect(stand?.quelle).toBe("link");
    expect(stand?.geoeffnet).toBe(2);
  });
});

/*
 * Der eingereichte Bogen als Beleg, seit dem 16.09.2026.
 *
 * Der Vermerk in `bewerber_mail_tracking` kann auf mehreren Wegen ausbleiben,
 * ohne dass es jemand merkt. Der Bogen selbst liegt dagegen in der Liste vor,
 * und sein Link steht ausschliesslich in dieser Mail. Deshalb zaehlt er auch
 * ohne Trackingzeile.
 */
describe("Der eingereichte Bogen als Beleg", () => {
  it("macht aus einem eingereichten Bogen eine Öffnung, auch ohne Trackingzeile", () => {
    const stand = mitBogenBeleg(null, "2026-09-14T09:00:00Z");
    expect(stand?.geoeffnet).toBe(1);
    expect(stand?.quelle).toBe("bogen");
    expect(stand?.geoeffnetAm).toBe("2026-09-14T09:00:00Z");
  });

  it("ergänzt eine Trackingzeile ohne gemessene Öffnung", () => {
    const gemessen = oeffnungAus([zeile({}), zeile({ token: "b", kind: MAIL_ERINNERUNG_2 })]);
    expect(gemessen?.geoeffnet).toBe(0);
    const stand = mitBogenBeleg(gemessen, "2026-09-14T09:00:00Z");
    expect(stand?.geoeffnet).toBe(1);
    expect(stand?.gesendet).toBe(2);
    expect(stand?.quelle).toBe("bogen");
  });

  /*
   * Eine gemessene Öffnung bleibt, was sie ist. Sonst sähe jede Messung wie
   * eine Ableitung aus, und die Öffnungsquote wäre nicht mehr ehrlich.
   */
  it("lässt eine gemessene Öffnung unangetastet", () => {
    const gemessen = oeffnungAus([zeile({ clicked_at: "2026-09-12T07:00:00Z" })]);
    const stand = mitBogenBeleg(gemessen, "2026-09-14T09:00:00Z");
    expect(stand?.quelle).toBe("link");
    expect(stand?.geoeffnetAm).toBe("2026-09-12T07:00:00Z");
  });

  /*
   * Der Altfall vom 16.09.2026.
   *
   * Diese Funktion fragt bewusst nicht, WELCHER Bogen vorliegt, sie bekommt
   * nur den Zeitpunkt. Genau deshalb trägt sie auch den früheren Vorabbogen
   * aus dem August, der weder das Kennzeichen `bogen` noch einen gewählten
   * `weg` hat. Welcher Bogen es war, entscheidet die Anzeige, siehe
   * `KennenlernMailVermerk`; welche Zeilen überhaupt zählen, entscheidet
   * `istAusgefuellterBogen` in `kennenlernenLink.ts`.
   */
  it("zählt auch einen Bogen aus der Zeit vor `bogen` und `weg`", () => {
    const stand = mitBogenBeleg(null, "2026-08-22T09:00:00Z");
    expect(stand?.geoeffnet).toBe(1);
    expect(stand?.gesendet).toBe(1);
    expect(stand?.quelle).toBe("bogen");
    expect(stand?.geoeffnetAm).toBe("2026-08-22T09:00:00Z");
  });

  it("ändert nichts, wenn kein Bogen eingereicht wurde", () => {
    expect(mitBogenBeleg(null, "")).toBeNull();
    expect(mitBogenBeleg(null, undefined)).toBeNull();
    // Ein unbrauchbares Datum ist kein Beleg, sondern ein Fehler in den Daten.
    expect(mitBogenBeleg(null, "irgendwas")).toBeNull();
  });
});

describe("Die Namen der Mails", () => {
  it("nennt jede Kennenlernmail beim Namen", () => {
    for (const art of KENNENLERN_MAILS) {
      expect(mailName(art)).not.toBe("Mail an den Bewerber");
    }
  });

  it("hat einen Rückfall für unbekannte Arten", () => {
    expect(mailName("gibt_es_nicht")).toBe("Mail an den Bewerber");
  });
});

/*
 * Der Hinweissatz ist der eigentliche Kern dieser Anzeige. Ohne ihn liest
 * jemand aus einem grauen Symbol „kein Interesse", obwohl nur der Link nicht
 * aufgerufen wurde.
 */
describe("Der Hinweis zur Unsicherheit", () => {
  it("sagt, dass nur der Link gezählt wird, und nennt die Weiterleitung", () => {
    expect(OEFFNUNG_UNSICHER).toMatch(/Link/);
    expect(OEFFNUNG_UNSICHER).toMatch(/messen wir nicht/);
    expect(OEFFNUNG_UNSICHER).toMatch(/weitergeleitet/);
    // Kein Wort mehr vom unsichtbaren Bild.
    expect(OEFFNUNG_UNSICHER).not.toMatch(/Bild|Pixel/);
  });

  it("sagt nirgends ungelesen oder nicht gelesen", () => {
    expect(OEFFNUNG_UNSICHER).not.toMatch(/ungelesen|nicht gelesen/);
  });
});

/*
 * Die Zählmarke am Link, seit dem 26.09.2026 statt des Zählpixels.
 */
describe("Die Zählmarke am persönlichen Link", () => {
  const TOKEN = "3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8";

  it("hängt die Marke an und lässt einen vorhandenen Parameter stehen", () => {
    expect(mitZaehlmarke("https://portal.more.immo/kennenlernen/abc", TOKEN)).toBe(
      `https://portal.more.immo/kennenlernen/abc?m=${TOKEN}`,
    );
    expect(mitZaehlmarke("https://portal.more.immo/kennenlernen/abc?weg=2", TOKEN)).toBe(
      `https://portal.more.immo/kennenlernen/abc?weg=2&m=${TOKEN}`,
    );
  });

  it("lässt den Link ohne gültige Marke unverändert", () => {
    expect(mitZaehlmarke("https://portal.more.immo/x", undefined)).toBe("https://portal.more.immo/x");
    expect(mitZaehlmarke("https://portal.more.immo/x", "kein-token")).toBe("https://portal.more.immo/x");
  });

  describe("meldeLinkAufruf", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("meldet eine gültige Marke als Klick an track-bewerber-mail", () => {
      const abruf = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("fetch", abruf);
      meldeLinkAufruf(`?weg=2&m=${TOKEN}`);
      expect(abruf).toHaveBeenCalledTimes(1);
      expect(String(abruf.mock.calls[0][0])).toMatch(
        new RegExp(`/functions/v1/track-bewerber-mail\\?token=${TOKEN}&mode=click$`),
      );
    });

    it("tut ohne oder mit kaputter Marke nichts", () => {
      const abruf = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("fetch", abruf);
      meldeLinkAufruf("");
      meldeLinkAufruf("?m=<script>");
      expect(abruf).not.toHaveBeenCalled();
    });
  });
});

/*
 * track-bewerber-mail leitet nur auf eigene Adressen weiter. Ohne die Liste
 * wäre die Function ein offener Umleiter mit unserem Namen davor.
 */
describe("Weiterleitung nur auf eigene Adressen", () => {
  const SUPA = "https://irwdgutegmivbtgmftyc.supabase.co";

  it("erlaubt more.immo, das Portal, die eigene Vorschau und den eigenen Speicher", () => {
    expect(istEigenesWeiterleitungsziel("https://more.immo/", SUPA)).toBe(true);
    expect(istEigenesWeiterleitungsziel("https://portal.more.immo/kennenlernen/x", SUPA)).toBe(true);
    expect(
      istEigenesWeiterleitungsziel("https://id-preview-88ce1801--cd62347b-9ef0-43fe-a989-4d4a53a8c4ef.lovable.app/x", SUPA),
    ).toBe(true);
    expect(
      istEigenesWeiterleitungsziel(`${SUPA}/storage/v1/object/sign/bewerbungen/paket.pdf?token=abc`, SUPA),
    ).toBe(true);
  });

  it("weist fremde und getarnte Ziele ab", () => {
    for (const ziel of [
      "https://boese.example/",
      "https://more.immo.boese.example/",
      "https://boesemore.immo/",
      "http://portal.more.immo/",
      "https://portal.more.immo@boese.example/",
      "https://fremd.lovable.app/",
      "https://x-cd62347b-9ef0-43fe-a989-4d4a53a8c4ef.lovable.app.boese.example/",
      `${SUPA}/functions/v1/track-bewerber-mail`,
      "https://anderes-projekt.supabase.co/storage/v1/object/public/x.pdf",
      "javascript:alert(1)",
      "kein link",
    ]) {
      expect(istEigenesWeiterleitungsziel(ziel, SUPA), ziel).toBe(false);
    }
  });
});
