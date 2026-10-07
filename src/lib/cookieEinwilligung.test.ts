/**
 * Die Cookie-Einwilligung der öffentlichen Seiten.
 *
 * Drei Dinge müssen sitzen:
 *   1. Der Banner gehört auf die öffentlichen Seiten und nie ins CRM.
 *   2. Die Wahl wird mit Versionsnummer gespeichert; eine alte Fassung gilt
 *      als nicht getroffen, dann fragt der Banner neu.
 *   3. Alles Unklare im Speicher heißt "nicht eingewilligt".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import {
  ALLE,
  EINWILLIGUNG_SPEICHER,
  EINWILLIGUNG_VERSION,
  NUR_NOTWENDIGE,
  _einwilligungVergessen,
  aufEinwilligungHoeren,
  einwilligungFuerServer,
  hatMarketingEinwilligung,
  hatPartnerMarketingEinwilligung,
  hatStatistikEinwilligung,
  istAllgemeinerWiderruf,
  istOeffentlicheSeite,
  leseCookieEinwilligung,
  partnerMarketingEntscheidung,
  setzePartnerPixelKontext,
  speichereCookieEinwilligung,
} from "@/lib/cookieEinwilligung";

const PARTNER_A = "11111111-1111-4111-8111-111111111111";
const PARTNER_B = "22222222-2222-4222-8222-222222222222";
const KONTEXT_A = { partnerId: PARTNER_A, pixelId: "123456789012345", name: "Muster Immobilien", anschrift: "Hauptstraße 1, 80331 München" };

beforeEach(() => {
  setzeSpeicherAttrappe();
  _einwilligungVergessen();
});
afterEach(() => _einwilligungVergessen());

describe("Wo der Banner hingehört", () => {
  it.each([
    "/vp/max-mustermann",
    "/analyse",
    "/analyse/max",
    "/steuer",
    "/steuer/max",
    "/expats-calculator",
    "/links",
    "/karriere",
    "/karriere/stellenanzeige",
    "/partner-werden",
    "/bewerben/123",
    "/expose/abc/wohnung/1",
    "/immobilie/token",
    "/termin/token",
    "/terminwahl/token",
    "/kennenlerngespraech/token",
    "/sa/token",
    "/datenschutz",
  ])("%s ist öffentlich", (pfad) => {
    expect(istOeffentlicheSeite(pfad)).toBe(true);
  });

  it.each([
    "/",
    "/kontakte",
    "/kunden/123",
    "/statistiken",
    "/steuerrechner",
    "/analysetool",
    "/berater-microseite",
    "/login",
    "/reset-password",
    "/raum/token",
    "/mobile-scan/token",
    "/objekte/1/expose",
    "/kunde/investments",
  ])("%s gehört zum CRM oder zum Zugang und bekommt keinen Banner", (pfad) => {
    expect(istOeffentlicheSeite(pfad)).toBe(false);
  });

  /**
   * Wächter: Jede Route ohne Anmeldeschutz in `App.tsx` bekommt den Hinweis,
   * oder sie steht hier mit Grund als Ausnahme. Wer eine neue öffentliche
   * Seite anlegt und sie in `OEFFENTLICHE_PFADE` vergisst, fällt hier auf.
   * Sonst liefe dort etwa ein Partner-Pixel nie, weil niemand fragt.
   */
  it("kennt für jede Route ohne Anmeldeschutz eine Entscheidung", () => {
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    const ohneAppShell = app.split("<Route element={<AppShell />}>")[0];
    const routen = Array.from(ohneAppShell.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g));
    expect(routen.length).toBeGreaterThan(50);

    const AUSNAHMEN = new Set([
      // CRM-Zugang: nur Anmeldung, nichts Einwilligungspflichtiges.
      "/login",
      "/reset-password",
      "/portal-aktivieren",
      "/aktivieren",
      // Nur der gewünschte Dienst, ein Banner läge über den Bedienknöpfen.
      "/mobile-scan/:token",
      "/raum/:token",
    ]);
    const ohneEntscheidung = routen
      // Hinter `PraesentationGuard` liegt eine Anmeldung, `Navigate` leitet
      // nur weiter und zeigt selbst nichts.
      .filter(([, pfad, element]) => !["PraesentationGuard", "Navigate"].includes(element) && !AUSNAHMEN.has(pfad))
      .map(([, pfad]) => pfad)
      .filter((pfad) => !istOeffentlicheSeite(pfad));
    expect(ohneEntscheidung).toEqual([]);
  });

  it("zeigt den Hinweis auf der Partnerseite auch mit Tippgeber-Kennung", () => {
    expect(istOeffentlicheSeite("/vp/max?tg=anna")).toBe(true);
    expect(istOeffentlicheSeite("/handbuch/max/konfigurator")).toBe(true);
    expect(istOeffentlicheSeite("/tippgeber-portal")).toBe(false);
  });

  it("verwechselt /steuerrechner nicht mit /steuer", () => {
    expect(istOeffentlicheSeite("/steuerrechner-kompakt")).toBe(false);
    expect(istOeffentlicheSeite("/steuer?lang=en")).toBe(true);
  });
});

describe("Die gespeicherte Wahl", () => {
  it("fehlt am Anfang", () => {
    expect(leseCookieEinwilligung()).toBeNull();
    expect(hatStatistikEinwilligung()).toBe(false);
    expect(hatMarketingEinwilligung()).toBe(false);
  });

  it("liegt mit Versionsnummer und Zeitpunkt im localStorage", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: false });
    const roh = JSON.parse(window.localStorage.getItem(EINWILLIGUNG_SPEICHER) || "{}");
    expect(roh.version).toBe(EINWILLIGUNG_VERSION);
    expect(roh.statistik).toBe(true);
    expect(roh.marketing).toBe(false);
    expect(Number.isNaN(Date.parse(roh.zeitpunkt))).toBe(false);
    expect(hatStatistikEinwilligung()).toBe(true);
    expect(hatMarketingEinwilligung()).toBe(false);
  });

  it("gilt als nicht getroffen, wenn sie aus einer älteren Fassung stammt", () => {
    window.localStorage.setItem(
      EINWILLIGUNG_SPEICHER,
      JSON.stringify({ version: EINWILLIGUNG_VERSION - 1, statistik: true, marketing: true, zeitpunkt: "x" }),
    );
    expect(leseCookieEinwilligung()).toBeNull();
  });

  it("nimmt aus einem verbogenen Speicher nur ein echtes true als Zustimmung", () => {
    window.localStorage.setItem(
      EINWILLIGUNG_SPEICHER,
      JSON.stringify({ version: EINWILLIGUNG_VERSION, statistik: "ja", marketing: 1 }),
    );
    expect(leseCookieEinwilligung()).toMatchObject({ statistik: false, marketing: false });
    window.localStorage.setItem(EINWILLIGUNG_SPEICHER, "kein json");
    expect(leseCookieEinwilligung()).toBeNull();
  });

  it("meldet jede neue Wahl an die Zuhörer", () => {
    const hoerer = vi.fn();
    const abmelden = aufEinwilligungHoeren(hoerer);
    speichereCookieEinwilligung(ALLE);
    speichereCookieEinwilligung(NUR_NOTWENDIGE);
    abmelden();
    speichereCookieEinwilligung(ALLE);
    expect(hoerer).toHaveBeenCalledTimes(2);
    expect(hoerer.mock.calls[0][0]).toMatchObject({ statistik: true, marketing: true });
    expect(hoerer.mock.calls[1][0]).toMatchObject({ statistik: false, marketing: false });
  });
});

describe("Was an den Server geht", () => {
  it("sagt ohne Wahl ausdrücklich nein zu Marketing", () => {
    expect(einwilligungFuerServer()).toEqual({
      version: EINWILLIGUNG_VERSION,
      statistik: false,
      marketing: false,
      zeitpunkt: null,
      partnerMarketing: null,
    });
  });

  it("trägt die allgemeine Wahl mit Zeitpunkt, aber ohne Partner keine Partner-Einwilligung", () => {
    speichereCookieEinwilligung(ALLE);
    const e = einwilligungFuerServer();
    expect(e.marketing).toBe(true);
    expect(Number.isNaN(Date.parse(e.zeitpunkt ?? ""))).toBe(false);
    expect(e.partnerMarketing).toBeNull();
  });

  it("trägt die Partner-Einwilligung nur für den Partner der offenen Seite", () => {
    speichereCookieEinwilligung(ALLE, { partnerId: PARTNER_A, marketing: true });
    expect(einwilligungFuerServer().partnerMarketing).toBeNull();
    const abmelden = setzePartnerPixelKontext(KONTEXT_A);
    expect(einwilligungFuerServer().partnerMarketing).toMatchObject({ partnerId: PARTNER_A });
    abmelden();
    setzePartnerPixelKontext({ ...KONTEXT_A, partnerId: PARTNER_B });
    expect(einwilligungFuerServer().partnerMarketing).toBeNull();
  });
});

describe("Marketing je Partner (A4-09)", () => {
  it("'Alle akzeptieren' auf einer allgemeinen Seite erlaubt kein Partner-Pixel", () => {
    speichereCookieEinwilligung(ALLE);
    expect(hatMarketingEinwilligung()).toBe(true);
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
    expect(partnerMarketingEntscheidung(PARTNER_A)).toBeNull();
  });

  it("merkt sich die Wahl je Partner mit Kennung und Zeitpunkt", () => {
    speichereCookieEinwilligung(NUR_NOTWENDIGE, { partnerId: PARTNER_A, marketing: true });
    speichereCookieEinwilligung(NUR_NOTWENDIGE, { partnerId: PARTNER_B, marketing: false });
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(true);
    expect(hatPartnerMarketingEinwilligung(PARTNER_B)).toBe(false);
    expect(partnerMarketingEntscheidung(PARTNER_B)).not.toBeNull();
    const roh = JSON.parse(window.localStorage.getItem(EINWILLIGUNG_SPEICHER) || "{}");
    expect(roh.partner).toHaveLength(2);
    expect(roh.partner[0]).toMatchObject({ partnerId: PARTNER_A, marketing: true });
  });

  it("Marketing aus auf einer allgemeinen Seite nimmt alle Partner-Einwilligungen zurück", () => {
    speichereCookieEinwilligung(ALLE, { partnerId: PARTNER_A, marketing: true });
    speichereCookieEinwilligung({ statistik: true, marketing: false });
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
  });

  it("eine Wahl älter als 13 Monate gilt als nicht getroffen", () => {
    const alt = new Date(Date.now() - 420 * 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem(
      EINWILLIGUNG_SPEICHER,
      JSON.stringify({
        version: EINWILLIGUNG_VERSION,
        statistik: false,
        marketing: false,
        zeitpunkt: alt,
        partner: [{ partnerId: PARTNER_A, marketing: true, zeitpunkt: alt }],
      }),
    );
    expect(partnerMarketingEntscheidung(PARTNER_A)).toBeNull();
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
  });

  it("eine Einwilligung aus Fassung 1 zählt nicht mehr", () => {
    window.localStorage.setItem(
      EINWILLIGUNG_SPEICHER,
      JSON.stringify({ version: 1, statistik: true, marketing: true, zeitpunkt: new Date().toISOString() }),
    );
    expect(leseCookieEinwilligung()).toBeNull();
    expect(EINWILLIGUNG_VERSION).toBeGreaterThan(1);
  });
});

describe("Widerruf in einem anderen Tab (A4-07)", () => {
  function anderesFensterSchreibt(wert: string | null) {
    if (wert === null) window.localStorage.removeItem(EINWILLIGUNG_SPEICHER);
    else window.localStorage.setItem(EINWILLIGUNG_SPEICHER, wert);
    window.dispatchEvent(new StorageEvent("storage", { key: EINWILLIGUNG_SPEICHER }));
  }

  it("meldet die neue Wahl aus dem anderen Tab an die Zuhörer", () => {
    speichereCookieEinwilligung(ALLE, { partnerId: PARTNER_A, marketing: true });
    const hoerer = vi.fn();
    const abmelden = aufEinwilligungHoeren(hoerer);
    const widerrufen = { ...leseCookieEinwilligung(), partner: [{ partnerId: PARTNER_A, marketing: false, zeitpunkt: new Date().toISOString() }] };
    anderesFensterSchreibt(JSON.stringify(widerrufen));
    expect(hoerer).toHaveBeenCalledTimes(1);
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
    anderesFensterSchreibt(null);
    expect(hoerer).toHaveBeenLastCalledWith(null);
    abmelden();
  });

  it("überhört fremde Schlüssel", () => {
    const hoerer = vi.fn();
    const abmelden = aufEinwilligungHoeren(hoerer);
    window.dispatchEvent(new StorageEvent("storage", { key: "etwas-anderes" }));
    expect(hoerer).not.toHaveBeenCalled();
    abmelden();
  });

  it("eine alte Kopie im Arbeitsspeicher überdeckt den Widerruf nicht", () => {
    speichereCookieEinwilligung(ALLE, { partnerId: PARTNER_A, marketing: true });
    // Der andere Tab löscht die Wahl ganz (Website-Daten gelöscht).
    anderesFensterSchreibt(null);
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
    expect(leseCookieEinwilligung()).toBeNull();
  });
});

describe("Allgemeiner Widerruf auf einer Partnerseite (PIXEL-001)", () => {
  function anderesFensterSchreibt(wert: string) {
    window.localStorage.setItem(EINWILLIGUNG_SPEICHER, wert);
    window.dispatchEvent(new StorageEvent("storage", { key: EINWILLIGUNG_SPEICHER }));
  }

  function zweiPartnerFreigegeben() {
    speichereCookieEinwilligung(ALLE, { partnerId: PARTNER_A, marketing: true });
    speichereCookieEinwilligung(ALLE, { partnerId: PARTNER_B, marketing: true });
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(true);
    expect(hatPartnerMarketingEinwilligung(PARTNER_B)).toBe(true);
  }

  it("Marketing aus auf der Seite von A nimmt A und B zurück, auch wenn der Schalter für A noch an war", () => {
    zweiPartnerFreigegeben();
    speichereCookieEinwilligung({ statistik: true, marketing: false }, { partnerId: PARTNER_A, marketing: true });
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
    expect(hatPartnerMarketingEinwilligung(PARTNER_B)).toBe(false);
    // Festgehalten als "nein", nicht als "nicht gefragt".
    expect(partnerMarketingEntscheidung(PARTNER_A)).toMatchObject({ marketing: false });
  });

  it("'Nur notwendige' auf der Seite von A nimmt auch die Freigabe von B zurück", () => {
    zweiPartnerFreigegeben();
    speichereCookieEinwilligung(NUR_NOTWENDIGE, { partnerId: PARTNER_A, marketing: false }, { nurNotwendige: true });
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
    expect(hatPartnerMarketingEinwilligung(PARTNER_B)).toBe(false);
  });

  it("die Freigabe nur für einen Partner bleibt getrennt möglich", () => {
    speichereCookieEinwilligung(NUR_NOTWENDIGE, { partnerId: PARTNER_B, marketing: true });
    // Marketing bleibt aus, nur A wird zusätzlich erlaubt: kein Widerruf.
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER_A, marketing: true });
    expect(hatMarketingEinwilligung()).toBe(false);
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(true);
    expect(hatPartnerMarketingEinwilligung(PARTNER_B)).toBe(true);
    // Nur A wieder aus, B bleibt.
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER_A, marketing: false });
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
    expect(hatPartnerMarketingEinwilligung(PARTNER_B)).toBe(true);
  });

  it("ein zweiter Tab erfährt den Widerruf für beide Partner über das storage-Ereignis", () => {
    zweiPartnerFreigegeben();
    const hoerer = vi.fn();
    const abmelden = aufEinwilligungHoeren(hoerer);
    // Der zweite Tab speichert "Marketing aus" auf der Seite von B. Was er
    // schreibt, entsteht mit derselben Funktion; hier wird es übernommen,
    // wie es der Browser im ersten Tab sähe.
    const gespeichert = speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER_B, marketing: true });
    hoerer.mockClear();
    anderesFensterSchreibt(JSON.stringify(gespeichert));
    expect(hoerer).toHaveBeenCalledTimes(1);
    const gemeldet = hoerer.mock.calls[0][0];
    expect(gemeldet.partner.every((p: { marketing: boolean }) => p.marketing === false)).toBe(true);
    expect(hatPartnerMarketingEinwilligung(PARTNER_A)).toBe(false);
    expect(hatPartnerMarketingEinwilligung(PARTNER_B)).toBe(false);
    abmelden();
  });

  it("die Regel für den allgemeinen Widerruf", () => {
    const an = { marketing: true };
    const aus = { marketing: false };
    expect(istAllgemeinerWiderruf(NUR_NOTWENDIGE, aus, true, true)).toBe(true);
    expect(istAllgemeinerWiderruf({ statistik: false, marketing: false }, an, true)).toBe(true);
    expect(istAllgemeinerWiderruf({ statistik: false, marketing: false }, aus, true)).toBe(false);
    expect(istAllgemeinerWiderruf({ statistik: false, marketing: false }, null, true)).toBe(false);
    expect(istAllgemeinerWiderruf({ statistik: false, marketing: false }, aus, false)).toBe(true);
    expect(istAllgemeinerWiderruf(ALLE, an, true)).toBe(false);
  });
});
