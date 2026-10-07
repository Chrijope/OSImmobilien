/**
 * Tests fuer das Meta-Pixel-Modul der Vertriebspartner-Landingpage.
 *
 * Worum es geht: Die Pixel-ID tragen Partner selbst ein, und das Feld darf
 * nur reine Zahlenfolgen durchlassen, damit weder Skripte noch URLs in den
 * Einstellungen landen. Ausserdem darf ohne Einwilligung und ohne geladenes
 * Pixel niemals ein Event gemeldet werden.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import {
  _einwilligungVergessen,
  setzePartnerPixelKontext,
  speichereCookieEinwilligung,
} from "@/lib/cookieEinwilligung";
import {
  istGueltigeMetaPixelId,
  gespeicherterMetaConsent,
  merkeMetaConsent,
  erzeugeMetaEventId,
  istMetaPixelAktiv,
  meldeMetaLead,
  ladeMetaPixel,
  istMetaPixelRoute,
  pruefeMetaPixelBindung,
  meldeFormularOffen,
  _testResetMetaPixel,
  _testSetzeNeuLaden,
} from "./metaPixel";

describe("istGueltigeMetaPixelId", () => {
  it("akzeptiert typische Pixel-IDs (15 bis 16 Ziffern)", () => {
    expect(istGueltigeMetaPixelId("123456789012345")).toBe(true);
    expect(istGueltigeMetaPixelId("1234567890123456")).toBe(true);
  });

  it("akzeptiert auch kuerzere und laengere Zahlenfolgen im erlaubten Rahmen", () => {
    expect(istGueltigeMetaPixelId("12345")).toBe(true);
    expect(istGueltigeMetaPixelId("1".repeat(20))).toBe(true);
  });

  it("verwirft zu kurze und zu lange Werte", () => {
    expect(istGueltigeMetaPixelId("1234")).toBe(false);
    expect(istGueltigeMetaPixelId("1".repeat(21))).toBe(false);
    expect(istGueltigeMetaPixelId("")).toBe(false);
  });

  it("verwirft alles, was keine reine Zahlenfolge ist", () => {
    expect(istGueltigeMetaPixelId("abc123456789012")).toBe(false);
    expect(istGueltigeMetaPixelId("<script>alert(1)</script>")).toBe(false);
    expect(istGueltigeMetaPixelId("https://evil.example/x.js")).toBe(false);
    expect(istGueltigeMetaPixelId("123 456 789 012")).toBe(false);
    expect(istGueltigeMetaPixelId("12345678901234a")).toBe(false);
  });

  it("verwirft Nicht-Strings, akzeptiert aber Werte mit Randleerzeichen", () => {
    expect(istGueltigeMetaPixelId(123456789012345 as unknown as string)).toBe(false);
    expect(istGueltigeMetaPixelId(null)).toBe(false);
    expect(istGueltigeMetaPixelId(undefined)).toBe(false);
    expect(istGueltigeMetaPixelId(" 123456789012345 ")).toBe(true);
  });
});

describe("Einwilligung im localStorage", () => {
  // Die Testumgebung stellt keinen localStorage bereit, deshalb bekommt das
  // Fenster hier einen kleinen In-Memory-Ersatz mit derselben Schnittstelle.
  beforeEach(() => {
    const speicher = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (speicher.has(k) ? (speicher.get(k) as string) : null),
        setItem: (k: string, v: string) => {
          speicher.set(k, String(v));
        },
        removeItem: (k: string) => {
          speicher.delete(k);
        },
        clear: () => speicher.clear(),
      },
    });
  });

  it("liefert null, solange keine Entscheidung vorliegt", () => {
    expect(gespeicherterMetaConsent()).toBeNull();
  });

  it("merkt sich Zustimmung und Ablehnung", () => {
    merkeMetaConsent("zugestimmt");
    expect(gespeicherterMetaConsent()).toBe("zugestimmt");
    merkeMetaConsent("abgelehnt");
    expect(gespeicherterMetaConsent()).toBe("abgelehnt");
  });

  it("ignoriert manipulierte Werte im Speicher", () => {
    window.localStorage.setItem("mi_meta_pixel_einwilligung", "quatsch");
    expect(gespeicherterMetaConsent()).toBeNull();
  });
});

describe("erzeugeMetaEventId", () => {
  it("erzeugt nicht-leere, unterschiedliche IDs", () => {
    const a = erzeugeMetaEventId();
    const b = erzeugeMetaEventId();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(b.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });
});

const PIXEL = "123456789012345";
const PARTNER = "11111111-1111-4111-8111-111111111111";
const ANDERER = "22222222-2222-4222-8222-222222222222";
const KONTEXT = { partnerId: PARTNER, pixelId: PIXEL, name: "Muster Immobilien", anschrift: "Hauptstraße 1, 80331 München" };

type FbqAttrappe = { queue: unknown[][]; disablePushState?: boolean };
const fbq = () => (window as unknown as { fbq?: FbqAttrappe }).fbq;

function aufraeumen() {
  _einwilligungVergessen();
  _testResetMetaPixel();
  delete (window as unknown as { fbq?: unknown }).fbq;
  delete (window as unknown as { _fbq?: unknown })._fbq;
  document.head.querySelectorAll("script[src*='connect.facebook.net']").forEach((s) => s.remove());
  window.history.replaceState({}, "", "/");
}

beforeEach(() => {
  setzeSpeicherAttrappe();
  aufraeumen();
});
afterEach(aufraeumen);

describe("Welche Seiten ein Partner-Pixel tragen dürfen (A4-08)", () => {
  it.each([
    "/vp/max",
    "/vp/max/",
    "/vp/max?tg=anna",
    "/handbuch/max",
    "/handbuch/max/konfigurator",
  ])("%s ja", (pfad) => {
    expect(istMetaPixelRoute(pfad)).toBe(true);
  });

  it.each([
    "/",
    "/vp",
    "/datenschutz",
    "/handbuch",
    "/handbuch/konfigurator",
    "/handbuch/selbstauskunft",
    "/handbuch/ergebnis/abc",
    "/handbuch/selbstauskunft/token123",
    // Offene Selbstauskunft des Partners: seit 27.09.2026 kein Pixel (Anlage 4 § 1 Abs. 1).
    "/handbuch/max/selbstauskunft",
    "/handbuch/max/irgendwas",
    "/analyse/max",
    "/steuer/max",
    "/kontakte",
  ])("%s nein", (pfad) => {
    expect(istMetaPixelRoute(pfad)).toBe(false);
  });
});

describe("meldeMetaLead ohne geladenes Pixel", () => {
  it("ist ein No-op, solange kein Pixel geladen wurde", () => {
    expect(istMetaPixelAktiv()).toBe(false);
    expect(() => meldeMetaLead("event-123")).not.toThrow();
    expect(fbq()).toBeUndefined();
  });

  it("laedt bei ungueltiger Pixel-ID nichts", () => {
    window.history.replaceState({}, "", "/vp/max");
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: true });
    expect(ladeMetaPixel({ pixelId: "<script>", partnerId: PARTNER })).toBe(false);
    expect(fbq()).toBeUndefined();
  });
});

describe("ladeMetaPixel prüft selbst", () => {
  it("lädt ohne Einwilligung für diesen Partner nicht, auch nicht mit allgemeinem Marketing", () => {
    window.history.replaceState({}, "", "/vp/max");
    speichereCookieEinwilligung({ statistik: true, marketing: true });
    expect(ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER })).toBe(false);
    speichereCookieEinwilligung({ statistik: true, marketing: true }, { partnerId: ANDERER, marketing: true });
    expect(ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER })).toBe(false);
    expect(fbq()).toBeUndefined();
  });

  it("lädt ausserhalb der Pixel-Routen nicht", () => {
    window.history.replaceState({}, "", "/datenschutz");
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: true });
    expect(ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER })).toBe(false);
    expect(fbq()).toBeUndefined();
  });
});

describe("Mit Einwilligung für den Partner", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/vp/max");
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: true });
    setzePartnerPixelKontext(KONTEXT);
  });

  it("meldet PageView und Lead gezielt an die Pixel-ID des Partners (trackSingle)", () => {
    expect(ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER })).toBe(true);
    expect(istMetaPixelAktiv()).toBe(true);
    expect(fbq()!.disablePushState).toBe(true);
    expect(fbq()!.queue).toEqual(
      expect.arrayContaining([
        ["set", "autoConfig", false, PIXEL],
        ["init", PIXEL],
        ["trackSingle", PIXEL, "PageView"],
      ]),
    );
    meldeMetaLead("event-abc");
    expect(fbq()!.queue).toEqual(expect.arrayContaining([["trackSingle", PIXEL, "Lead", {}, { eventID: "event-abc" }]]));
    expect(fbq()!.queue.some((e) => e[0] === "track")).toBe(false);
    expect(document.head.querySelectorAll("script[src*='connect.facebook.net']").length).toBe(1);
  });

  it("laedt dasselbe Pixel nicht doppelt", () => {
    ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER });
    ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER });
    expect(fbq()!.queue.filter((e) => e[0] === "init").length).toBe(1);
  });

  it("meldet keinen Lead mehr, wenn der Widerruf aus einem anderen Tab im Speicher steht (A4-07)", () => {
    ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER });
    // Der andere Tab schreibt nur den Speicher, dieses Modul bekommt kein Ereignis.
    const roh = JSON.parse(window.localStorage.getItem("moreimmo.cookie-einwilligung")!);
    roh.partner = [{ partnerId: PARTNER, marketing: false, zeitpunkt: new Date().toISOString() }];
    window.localStorage.setItem("moreimmo.cookie-einwilligung", JSON.stringify(roh));
    expect(istMetaPixelAktiv()).toBe(false);
    meldeMetaLead("event-nach-widerruf");
    expect(fbq()!.queue.some((e) => e[1] === PIXEL && e[2] === "Lead")).toBe(false);
  });

  it("meldet nichts mehr, sobald die Seite den Partner abgemeldet hat", () => {
    _einwilligungVergessen();
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: true });
    const abmelden = setzePartnerPixelKontext(KONTEXT);
    ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER });
    abmelden();
    expect(istMetaPixelAktiv()).toBe(false);
    meldeMetaLead("event-x");
    expect(fbq()!.queue.some((e) => e[2] === "Lead")).toBe(false);
  });

  it("meldet ausserhalb der Pixel-Routen nichts, auch wenn der Partner noch angemeldet ist", () => {
    ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER });
    window.history.replaceState({}, "", "/datenschutz");
    expect(istMetaPixelAktiv()).toBe(false);
  });

  it("lädt die Seite neu beim Wechsel zu einem anderen Partner-Pixel", () => {
    const neuLaden = vi.fn();
    _testSetzeNeuLaden(neuLaden);
    ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER });
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: ANDERER, marketing: true });
    expect(ladeMetaPixel({ pixelId: "999999999999999", partnerId: ANDERER })).toBe(false);
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });
});

describe("pruefeMetaPixelBindung", () => {
  const neuLaden = vi.fn();
  beforeEach(() => {
    neuLaden.mockReset();
    _testSetzeNeuLaden(neuLaden);
    window.history.replaceState({}, "", "/handbuch/max");
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: true });
    setzePartnerPixelKontext(KONTEXT);
    ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER });
    _testSetzeNeuLaden(neuLaden);
  });

  it("lässt das Pixel innerhalb des Partnerbereichs in Ruhe", () => {
    expect(pruefeMetaPixelBindung("/handbuch/max/konfigurator")).toBe(false);
    expect(neuLaden).not.toHaveBeenCalled();
  });

  it("lädt neu beim Wechsel in die offene Selbstauskunft des Partners", () => {
    expect(pruefeMetaPixelBindung("/handbuch/max/selbstauskunft")).toBe(true);
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it("lädt neu beim Verlassen des Partnerbereichs", () => {
    expect(pruefeMetaPixelBindung("/datenschutz")).toBe(true);
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it("lädt neu auf der Ergebnisseite mit Token", () => {
    expect(pruefeMetaPixelBindung("/handbuch/ergebnis/neu")).toBe(true);
  });

  it("lädt neu auf der Seite eines anderen Partners", () => {
    expect(pruefeMetaPixelBindung("/vp/anna")).toBe(true);
  });

  it("lädt neu und löscht die Meta-Cookies nach einem Widerruf", () => {
    document.cookie = "_fbp=fb.1.123; path=/";
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: false });
    expect(pruefeMetaPixelBindung("/handbuch/max")).toBe(true);
    expect(document.cookie).not.toContain("_fbp=");
  });

  it("mit offenem Formular: sofort angehalten, aber nicht neu geladen (PIXEL-002)", () => {
    const abmelden = meldeFormularOffen();
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: false });
    expect(pruefeMetaPixelBindung("/handbuch/max")).toBe(false);
    expect(neuLaden).not.toHaveBeenCalled();
    // Das Pixel ist angehalten: consent revoke an Meta, keine Meldung mehr.
    expect(fbq()!.queue.some((e) => e[0] === "consent" && e[1] === "revoke")).toBe(true);
    expect(istMetaPixelAktiv()).toBe(false);
    meldeMetaLead("event-nach-widerruf");
    expect(fbq()!.queue.some((e) => e[2] === "Lead")).toBe(false);
    // Auch eine neue Zustimmung im selben Seitenaufruf weckt es nicht auf.
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER, marketing: true });
    expect(ladeMetaPixel({ pixelId: PIXEL, partnerId: PARTNER })).toBe(false);
    expect(istMetaPixelAktiv()).toBe(false);
    // Ist das Formular zu, laedt die naechste Pruefung neu.
    abmelden();
    expect(pruefeMetaPixelBindung("/handbuch/max")).toBe(true);
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it("mit offenem Formular laedt ein Seitenwechsel trotzdem neu", () => {
    const abmelden = meldeFormularOffen();
    expect(pruefeMetaPixelBindung("/datenschutz")).toBe(true);
    expect(neuLaden).toHaveBeenCalledTimes(1);
    abmelden();
  });

  it("tut nichts, wenn kein Pixel geladen ist", () => {
    _testResetMetaPixel();
    _testSetzeNeuLaden(neuLaden);
    expect(pruefeMetaPixelBindung("/datenschutz")).toBe(false);
    expect(neuLaden).not.toHaveBeenCalled();
  });
});
