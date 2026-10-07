/**
 * Die Personalisierung der oeffentlichen Seite.
 *
 * Der wichtigste Test ist der letzte: Die Seite darf den Partner NIEMALS aus
 * `profiles_public` erraten. Diese Ansicht laeuft mit den Rechten des
 * Aufrufers und ist fuer einen nicht angemeldeten Besucher leer. Genau daran
 * ist das Analysetool schon einmal gescheitert, die Leads landeten ohne
 * Zustaendigkeit im offenen Pool.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

let slugParam: string | undefined = "christian-peetz";
let suche = "";

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...echt,
    useParams: () => ({ slug: slugParam }),
    useSearchParams: () => [new URLSearchParams(suche), vi.fn()],
    // Der Sprach-Provider nimmt beim Umschalten den Navigationszustand mit (HB-006).
    useLocation: () => ({ pathname: "/steuer", search: suche ? `?${suche}` : "", hash: "", state: null, key: "test" }),
  };
});

// Die Strecke selbst ist hier nicht der Gegenstand. Statt ihrer merkt sich
// die Attrappe, welchen Partner sie bekommen hat.
const erhaltenerBerater = vi.hoisted(() => ({ wert: undefined as unknown }));
vi.mock("@/components/steuerrechner/SteuerRechnerStrecke", () => ({
  default: (props: { berater?: { userId?: string; name?: string } }) => {
    erhaltenerBerater.wert = props.berater;
    return <div data-testid="strecke">{props.berater?.userId || "ohne"}</div>;
  },
}));

import SteuerrechnerPublic from "./SteuerrechnerPublic";

/** Rendert die Seite und gibt ihren Kasten zurueck. */
async function oeffne(): Promise<HTMLElement> {
  let kasten: HTMLElement = document.createElement("div");
  await act(async () => {
    kasten = render(<SteuerrechnerPublic />).container;
  });
  await act(async () => {
    await Promise.resolve();
  });
  return kasten;
}

beforeEach(() => {
  slugParam = "christian-peetz";
  suche = "";
  erhaltenerBerater.wert = undefined;
  // jsdom meldet sich als englischer Browser. Diese Tests prüfen die deutsche
  // Seite, also ein deutscher Browser (Plan Kundensprache, Etappe 6).
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["de-DE"]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        userId: "11111111-2222-3333-4444-555555555555",
        name: "Christian Peetz",
        telefon: "0171 1111111",
        email: "os@os-immobilien.com",
      }),
    })),
  );
});

describe("Der persoenliche Link", () => {
  it("loest das Kuerzel ueber get-vp-microsite auf", async () => {
    await oeffne();
    const aufrufe = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(aufrufe[0][0]).toContain("/functions/v1/get-vp-microsite?slug=christian-peetz");
  });

  it("gibt die geprueffte Partnerkennung an die Strecke weiter", async () => {
    await oeffne();
    expect((erhaltenerBerater.wert as { userId: string }).userId).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(await screen.findByText("Bereitgestellt von Christian Peetz")).toBeTruthy();
  });

  it("liest niemals profiles_public, um den Partner zu erraten", async () => {
    await oeffne();
    const aufrufe = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    for (const [url] of aufrufe) {
      expect(String(url)).not.toContain("profiles_public");
      expect(String(url)).not.toContain("/rest/v1/");
    }
  });

  it("laesst den Partner leer, wenn das Kuerzel unbekannt ist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await oeffne();
    const berater = erhaltenerBerater.wert as { userId?: string; name?: string; slug?: string };
    expect(berater.userId).toBeUndefined();
    expect(berater.name).toBe("");
    expect(screen.getByTestId("strecke").textContent).toBe("ohne");
    expect(screen.queryByText(/Bereitgestellt von/)).toBeNull();
  });

  /* Seit dem 24.09.2026 ermittelt der Server den Partner aus dem Kuerzel. Es
     geht deshalb auch dann mit, wenn die Seite es nicht aufloesen konnte:
     Der Server vermerkt das unbekannte Kuerzel im Log, und der Lead geht
     unzugewiesen an die Leitung. */
  it("gibt das Kuerzel auch bei unbekanntem Partner an die Strecke weiter", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await oeffne();
    expect((erhaltenerBerater.wert as { slug?: string }).slug).toBe("christian-peetz");
  });

  it("gibt das Kuerzel aus dem Link an die Strecke weiter", async () => {
    await oeffne();
    expect((erhaltenerBerater.wert as { slug?: string }).slug).toBe("christian-peetz");
  });

  it("nimmt ersatzweise den Partner aus dem Base64-Link", async () => {
    slugParam = undefined;
    suche = `b=${btoa(JSON.stringify({ name: "Hermann Vogl", telefon: "", email: "", userId: "u-9" }))}`;
    await oeffne();
    expect((erhaltenerBerater.wert as { userId: string }).userId).toBe("u-9");
  });
});

/**
 * Die Handy-Huelle.
 *
 * Beide Steuerrechner-Seiten benutzen dieselben Bausteine. Mittig und groesser
 * soll aber nur die oeffentliche Seite werden. Getragen wird das allein von der
 * Klasse `steuer-mobil-gross`, deshalb pruefen diese beiden Tests genau sie:
 * einmal, dass sie draussen steht, und einmal, dass sie drinnen fehlt.
 */
describe("Die Huelle fuer die Handyansicht", () => {
  it("steht auf der oeffentlichen Seite", async () => {
    const kasten = await oeffne();
    expect(kasten.querySelector(".steuer-mobil-gross")).not.toBeNull();
  });

  it("fehlt auf der internen Seite", () => {
    const intern = readFileSync("src/pages/Steuerrechner.tsx", "utf8");
    expect(intern).not.toContain("steuer-mobil-gross");
  });
});

/**
 * Der Kopfbereich.
 *
 * Er hat genau eine Aufgabe, und die ist mechanisch pruefbar: Der Knopf muss
 * zum Rechner fuehren. Ein Kopfbereich mit einem Knopf, der ins Leere zeigt,
 * waere schlimmer als gar keiner, denn er verspricht einen Weg nach unten.
 * Deshalb steht hier die Kennung `rechner` auf dem Pruefstand und nicht die
 * Gestaltung.
 */
describe("Der Kopfbereich der oeffentlichen Seite", () => {
  it("fuehrt mit seinem Knopf zum Rechnerabschnitt", async () => {
    const kasten = await oeffne();

    const abschnitt = kasten.querySelector("#rechner");
    expect(abschnitt).not.toBeNull();
    // Der Rechner selbst liegt in diesem Abschnitt, nicht daneben.
    expect(abschnitt!.querySelector('[data-testid="strecke"]')).not.toBeNull();

    const knopf = screen.getByRole("button", { name: /Steuerersparnis berechnen/ });
    const rollen = vi.fn();
    (abschnitt as HTMLElement).scrollIntoView = rollen;
    await act(async () => {
      knopf.click();
    });
    expect(rollen).toHaveBeenCalled();
  });

  it("nennt den zweiten Weg als schlichten Verweis, nicht als zweiten Knopf", async () => {
    const kasten = await oeffne();
    const verweis = kasten.querySelector('a[href="#so-geht-es"]');
    expect(verweis).not.toBeNull();
    expect(verweis!.textContent).toBe("So funktioniert es");
  });
});
