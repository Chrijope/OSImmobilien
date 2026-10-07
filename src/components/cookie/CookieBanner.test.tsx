/**
 * Der Cookie-Banner: erscheint auf öffentlichen Seiten, nie im CRM, speichert
 * die Wahl und lässt sich über den Link im Fuß wieder öffnen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CookieBanner } from "@/components/cookie/CookieBanner";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { PartnerPixelHinweis } from "@/components/cookie/PartnerPixelHinweis";
import {
  EINWILLIGUNG_SPEICHER,
  EINWILLIGUNG_VERSION,
  _einwilligungVergessen,
  hatPartnerMarketingEinwilligung,
  leseCookieEinwilligung,
  setzePartnerPixelKontext,
  speichereCookieEinwilligung,
} from "@/lib/cookieEinwilligung";
import { _kampagneVergessen } from "@/lib/kampagnenKennung";
import { _testResetMetaPixel, _testSetzeNeuLaden, ladeMetaPixel } from "@/lib/metaPixel";

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const KONTEXT = {
  partnerId: PARTNER_ID,
  pixelId: "123456789012345",
  name: "Muster Immobilien",
  anschrift: "Hauptstraße 1, 80331 München",
};

function zeige(pfad: string, mitFussLink = false) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <CookieBanner />
      {mitFussLink && <CookieEinstellungenLink />}
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setzeSpeicherAttrappe();
  setzeSpeicherAttrappe("sessionStorage");
  _einwilligungVergessen();
  _kampagneVergessen();
  document.documentElement.lang = "de";
});

afterEach(() => {
  cleanup();
  _einwilligungVergessen();
  _kampagneVergessen();
  _testResetMetaPixel();
  delete (window as unknown as { fbq?: unknown }).fbq;
  document.head.querySelectorAll("script[src*='connect.facebook.net']").forEach((s) => s.remove());
  document.documentElement.lang = "de";
  window.history.replaceState({}, "", "/");
});

describe("Wo der Banner erscheint", () => {
  it.each(["/vp/max", "/steuer", "/analyse/max", "/expose/1", "/termin/abc", "/karriere"])(
    "auf der öffentlichen Seite %s",
    (pfad) => {
      zeige(pfad);
      expect(screen.getByTestId("cookie-banner")).toBeTruthy();
      expect(screen.getByText("Cookies und Datenschutz")).toBeTruthy();
    },
  );

  it.each(["/", "/kontakte", "/kunden/1", "/statistiken", "/steuerrechner", "/login"])(
    "nicht im CRM unter %s",
    (pfad) => {
      zeige(pfad);
      expect(screen.queryByTestId("cookie-banner")).toBeNull();
    },
  );

  it("nicht mehr, wenn schon entschieden wurde", () => {
    speichereCookieEinwilligung({ statistik: false, marketing: false });
    zeige("/vp/max");
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });
});

describe("Die drei Knöpfe", () => {
  it("sind gleich gestaltet, keiner drängt sich vor", () => {
    zeige("/steuer");
    const klassen = ["Alle akzeptieren", "Nur notwendige", "Einstellungen"].map(
      (name) => screen.getByRole("button", { name }).className,
    );
    expect(new Set(klassen).size).toBe(1);
  });

  it("'Nur notwendige' speichert beide Kategorien als abgelehnt", () => {
    zeige("/steuer");
    fireEvent.click(screen.getByRole("button", { name: "Nur notwendige" }));
    expect(leseCookieEinwilligung()).toMatchObject({ statistik: false, marketing: false, version: EINWILLIGUNG_VERSION });
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });

  it("'Alle akzeptieren' speichert beide Kategorien als erlaubt", () => {
    zeige("/steuer");
    fireEvent.click(screen.getByRole("button", { name: "Alle akzeptieren" }));
    expect(leseCookieEinwilligung()).toMatchObject({ statistik: true, marketing: true });
  });

  it("'Einstellungen' erlaubt eine einzelne Kategorie", () => {
    zeige("/steuer");
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("switch", { name: "Statistik" }));
    fireEvent.click(screen.getByRole("button", { name: "Auswahl speichern" }));
    expect(leseCookieEinwilligung()).toMatchObject({ statistik: true, marketing: false });
    expect(window.localStorage.getItem(EINWILLIGUNG_SPEICHER)).toContain('"statistik":true');
  });

  it("lässt 'Notwendig' nicht abschalten", () => {
    zeige("/steuer");
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    const notwendig = screen.getByRole("switch", { name: "Notwendig" }) as HTMLButtonElement;
    expect(notwendig.disabled).toBe(true);
    expect(notwendig.getAttribute("aria-checked")).toBe("true");
  });
});

describe("Die Wahl bleibt änderbar", () => {
  it("über den Link im Fuß", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: true });
    zeige("/steuer", true);
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cookie-Einstellungen" }));
    expect(screen.getByTestId("cookie-banner")).toBeTruthy();
    // Die bisherige Wahl steht in den Schaltern.
    expect(screen.getByRole("switch", { name: "Marketing" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("switch", { name: "Marketing" }));
    fireEvent.click(screen.getByRole("button", { name: "Auswahl speichern" }));
    expect(leseCookieEinwilligung()).toMatchObject({ statistik: true, marketing: false });
  });

  it("über den kleinen Knopf, wenn die Seite keinen Fuß mit Link hat", () => {
    speichereCookieEinwilligung({ statistik: false, marketing: false });
    zeige("/expose/1");
    fireEvent.click(screen.getByRole("button", { name: "Cookie-Einstellungen" }));
    expect(screen.getByTestId("cookie-banner")).toBeTruthy();
  });

  it("zeigt den kleinen Knopf nicht, wenn der Fuß den Link schon trägt", () => {
    speichereCookieEinwilligung({ statistik: false, marketing: false });
    zeige("/steuer", true);
    expect(screen.getAllByRole("button", { name: "Cookie-Einstellungen" })).toHaveLength(1);
  });
});

describe("Die Sprache", () => {
  it("folgt der Seite, wenn sie englisch ist", async () => {
    document.documentElement.lang = "en";
    zeige("/expats-calculator");
    expect(screen.getByText("Cookies and privacy")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Necessary only" })).toBeTruthy();
  });

  it("wechselt mit, wenn die Seite umschaltet", async () => {
    zeige("/steuer");
    expect(screen.getByText("Cookies und Datenschutz")).toBeTruthy();
    await act(async () => {
      document.documentElement.lang = "en";
      await Promise.resolve();
    });
    expect(screen.getByText("Cookies and privacy")).toBeTruthy();
  });
});

describe("Auf der Seite eines Partners mit Pixel (A4-09)", () => {
  it("fragt gezielt für den Partner und nennt ihn mit Name und Anschrift", () => {
    setzePartnerPixelKontext(KONTEXT);
    zeige("/vp/max");
    const text = screen.getByTestId("cookie-banner-partner").textContent ?? "";
    expect(text).toContain("Muster Immobilien, Hauptstraße 1, 80331 München");
    expect(text).toContain("gemeinsam verantwortlich");
    expect(screen.getByRole("link", { name: "Datenschutzerklärung" })).toBeTruthy();
  });

  it("erscheint erneut, auch wenn allgemein schon alles akzeptiert ist", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: true });
    setzePartnerPixelKontext(KONTEXT);
    zeige("/vp/max");
    expect(screen.getByTestId("cookie-banner")).toBeTruthy();
  });

  it("erscheint auf einer allgemeinen Seite nicht für den Partner", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: true });
    setzePartnerPixelKontext(KONTEXT);
    zeige("/steuer");
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });

  it("'Alle akzeptieren' speichert die Einwilligung für diesen Partner", () => {
    setzePartnerPixelKontext(KONTEXT);
    zeige("/vp/max");
    fireEvent.click(screen.getByRole("button", { name: "Alle akzeptieren" }));
    expect(hatPartnerMarketingEinwilligung(PARTNER_ID)).toBe(true);
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });

  it("'Nur notwendige' lehnt für den Partner ab und fragt dann nicht wieder", () => {
    setzePartnerPixelKontext(KONTEXT);
    zeige("/vp/max");
    fireEvent.click(screen.getByRole("button", { name: "Nur notwendige" }));
    expect(hatPartnerMarketingEinwilligung(PARTNER_ID)).toBe(false);
    expect(leseCookieEinwilligung()?.partner).toEqual([expect.objectContaining({ partnerId: PARTNER_ID, marketing: false })]);
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });

  it("hat in den Einstellungen einen eigenen Schalter für den Partner", () => {
    setzePartnerPixelKontext(KONTEXT);
    zeige("/vp/max");
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("switch", { name: "Meta Pixel von Muster Immobilien" }));
    fireEvent.click(screen.getByRole("button", { name: "Auswahl speichern" }));
    expect(hatPartnerMarketingEinwilligung(PARTNER_ID)).toBe(true);
    expect(leseCookieEinwilligung()).toMatchObject({ statistik: false, marketing: false });
  });

  it("der Fuß nennt die gemeinsam Verantwortlichen, ohne Pixel-Partner nichts", () => {
    const { unmount } = render(<PartnerPixelHinweis />);
    expect(screen.queryByTestId("partner-pixel-hinweis")).toBeNull();
    unmount();
    setzePartnerPixelKontext(KONTEXT);
    render(<PartnerPixelHinweis sprache="en" />);
    const text = screen.getByTestId("partner-pixel-hinweis").textContent ?? "";
    expect(text).toContain("Joint controllers for the Meta Pixel on this page: Muster Immobilien, Hauptstraße 1, 80331 München, and OS Immobilien.");
    expect(screen.getByRole("link", { name: "privacy policy" }).getAttribute("href")).toContain("/datenschutz");
    fireEvent.click(screen.getByRole("button", { name: "Cookie settings" }));
  });
});

describe("Das geladene Pixel wird an Seite und Einwilligung gebunden (A4-07, A4-08)", () => {
  function pixelLaden(neuLaden: () => void) {
    window.history.replaceState({}, "", "/vp/max");
    speichereCookieEinwilligung({ statistik: false, marketing: false }, { partnerId: PARTNER_ID, marketing: true });
    setzePartnerPixelKontext(KONTEXT);
    expect(ladeMetaPixel({ pixelId: KONTEXT.pixelId, partnerId: PARTNER_ID })).toBe(true);
    _testSetzeNeuLaden(neuLaden);
  }

  it("lädt neu, wenn in einem anderen Tab widerrufen wird", () => {
    const neuLaden = vi.fn();
    pixelLaden(neuLaden);
    zeige("/vp/max");
    expect(neuLaden).not.toHaveBeenCalled();
    act(() => {
      const roh = JSON.parse(window.localStorage.getItem(EINWILLIGUNG_SPEICHER)!);
      roh.partner = [{ partnerId: PARTNER_ID, marketing: false, zeitpunkt: new Date().toISOString() }];
      window.localStorage.setItem(EINWILLIGUNG_SPEICHER, JSON.stringify(roh));
      window.dispatchEvent(new StorageEvent("storage", { key: EINWILLIGUNG_SPEICHER }));
    });
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it("lädt neu, wenn der Besucher den Partnerbereich verlässt", () => {
    const neuLaden = vi.fn();
    pixelLaden(neuLaden);
    zeige("/datenschutz");
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it("lässt das Pixel auf der Partnerseite in Ruhe", () => {
    const neuLaden = vi.fn();
    pixelLaden(neuLaden);
    zeige("/vp/max");
    expect(neuLaden).not.toHaveBeenCalled();
  });
});
