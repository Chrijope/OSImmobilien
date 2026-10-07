/**
 * Das Meta Pixel der Partnerseite lädt erst nach der Einwilligung für GENAU
 * diesen Partner, nur mit Name und Anschrift und nur auf den Pixel-Routen.
 *
 * Geprüft am Seitenkopf: Ohne Einwilligung darf dort kein Skript von
 * connect.facebook.net stehen, und `fbq` darf es nicht geben.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMetaPixelMitEinwilligung, type PixelPartner } from "@/hooks/useMetaPixelMitEinwilligung";
import {
  _einwilligungVergessen,
  aktuellerPartnerPixelKontext,
  speichereCookieEinwilligung,
} from "@/lib/cookieEinwilligung";
import { _testResetMetaPixel, istMetaPixelAktiv } from "@/lib/metaPixel";

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const PARTNER: PixelPartner = {
  userId: PARTNER_ID,
  metaPixelId: "123456789012345",
  pixelVerantwortlicher: { name: "Muster Immobilien", anschrift: "Hauptstraße 1, 80331 München" },
};

function metaSkripte() {
  return document.head.querySelectorAll('script[src*="connect.facebook.net"]').length;
}

function aufraeumen() {
  _einwilligungVergessen();
  _testResetMetaPixel();
  document.head.querySelectorAll('script[src*="connect.facebook.net"]').forEach((s) => s.remove());
  const w = window as unknown as { fbq?: unknown; _fbq?: unknown };
  delete w.fbq;
  delete w._fbq;
}

beforeEach(() => {
  setzeSpeicherAttrappe();
  aufraeumen();
  window.history.replaceState({}, "", "/vp/max");
});
afterEach(() => {
  cleanup();
  aufraeumen();
  window.history.replaceState({}, "", "/");
});

describe("Das Meta Pixel", () => {
  it("lädt ohne Einwilligung nicht", () => {
    renderHook(() => useMetaPixelMitEinwilligung(PARTNER));
    expect(metaSkripte()).toBe(0);
    expect(istMetaPixelAktiv()).toBe(false);
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it("lädt nicht mit allgemeiner Marketing-Einwilligung allein", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: true });
    renderHook(() => useMetaPixelMitEinwilligung(PARTNER));
    expect(metaSkripte()).toBe(0);
  });

  it("lädt, sobald der Besucher diesem Partner das Pixel erlaubt", () => {
    renderHook(() => useMetaPixelMitEinwilligung(PARTNER));
    expect(metaSkripte()).toBe(0);
    act(() => {
      speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER_ID, marketing: true });
    });
    expect(metaSkripte()).toBe(1);
    expect(istMetaPixelAktiv()).toBe(true);
  });

  it("lädt mit Einwilligung, aber ohne gültige Pixel-ID nicht", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: true }, { partnerId: PARTNER_ID, marketing: true });
    renderHook(() => useMetaPixelMitEinwilligung({ ...PARTNER, metaPixelId: "<script>" }));
    expect(metaSkripte()).toBe(0);
  });

  it("lädt ohne Anschrift des Partners nicht und meldet ihn nicht an", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: true }, { partnerId: PARTNER_ID, marketing: true });
    renderHook(() => useMetaPixelMitEinwilligung({ ...PARTNER, pixelVerantwortlicher: null }));
    expect(metaSkripte()).toBe(0);
    expect(aktuellerPartnerPixelKontext()).toBeNull();
  });

  it("lädt ausserhalb der Pixel-Routen nicht", () => {
    window.history.replaceState({}, "", "/analyse/max");
    speichereCookieEinwilligung({ statistik: true, marketing: true }, { partnerId: PARTNER_ID, marketing: true });
    renderHook(() => useMetaPixelMitEinwilligung(PARTNER));
    expect(metaSkripte()).toBe(0);
  });

  it("meldet den Partner an und beim Verlassen der Seite wieder ab", () => {
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER_ID, marketing: true });
    const { unmount } = renderHook(() => useMetaPixelMitEinwilligung(PARTNER));
    expect(aktuellerPartnerPixelKontext()).toMatchObject({ partnerId: PARTNER_ID, name: "Muster Immobilien" });
    expect(istMetaPixelAktiv()).toBe(true);
    unmount();
    expect(aktuellerPartnerPixelKontext()).toBeNull();
    // Das Skript bleibt bis zum Neuladen, gemeldet wird aber nichts mehr.
    expect(istMetaPixelAktiv()).toBe(false);
  });
});
