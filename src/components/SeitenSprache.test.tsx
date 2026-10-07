import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  SeitenSpracheProvider,
  SeitenSprachUmschalter,
  useSeitenSprache,
  useSeitenTexte,
} from "@/components/SeitenSprache";
import { SEITEN_SPRACHE_SPEICHER } from "@/lib/seitenSprache";

const TEXTE = { de: { gruss: "Hallo" }, en: { gruss: "Hello" } };

function Anzeige() {
  const sprache = useSeitenSprache();
  const t = useSeitenTexte(TEXTE);
  return <p data-testid="anzeige">{`${sprache}:${t.gruss}`}</p>;
}

function seite(adresse: string, mitProvider = true) {
  const inhalt = (
    <>
      <SeitenSprachUmschalter />
      <Anzeige />
    </>
  );
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      {mitProvider ? <SeitenSpracheProvider>{inhalt}</SeitenSpracheProvider> : inhalt}
    </MemoryRouter>,
  );
}

function browserSprache(sprachen: string[]) {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(sprachen);
}

/** In dieser Testumgebung gibt es keinen `localStorage`, deshalb ein schlichter Ersatz. */
function speicherErsatz() {
  const werte = new Map<string, string>();
  const speicher = {
    getItem: (k: string) => werte.get(k) ?? null,
    setItem: (k: string, v: string) => void werte.set(k, String(v)),
    removeItem: (k: string) => void werte.delete(k),
  };
  vi.stubGlobal("localStorage", speicher);
  return speicher;
}

let speicher: ReturnType<typeof speicherErsatz>;
beforeEach(() => { speicher = speicherErsatz(); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = "de";
});

describe("SeitenSpracheProvider", () => {
  it("?lang=en schaltet auf Englisch, auch bei deutschem Browser", () => {
    browserSprache(["de-DE"]);
    seite("/steuer?lang=en");
    expect(screen.getByTestId("anzeige")).toHaveTextContent("en:Hello");
    expect(document.documentElement.lang).toBe("en");
  });

  it("?lang=de schlägt einen englischen Browser", () => {
    browserSprache(["en-US"]);
    seite("/steuer?lang=de");
    expect(screen.getByTestId("anzeige")).toHaveTextContent("de:Hallo");
  });

  it("ohne Parameter entscheidet ein klar englischer Browser", () => {
    browserSprache(["en-GB", "de"]);
    seite("/analyse");
    expect(screen.getByTestId("anzeige")).toHaveTextContent("en:Hello");
  });

  it("ohne Parameter und mit deutschem Browser bleibt es Deutsch", () => {
    browserSprache(["de-DE", "en-US"]);
    seite("/analyse");
    expect(screen.getByTestId("anzeige")).toHaveTextContent("de:Hallo");
  });

  it("die gemerkte Wahl gilt vor der Browsersprache", () => {
    browserSprache(["en-US"]);
    speicher.setItem(SEITEN_SPRACHE_SPEICHER, "de");
    seite("/links");
    expect(screen.getByTestId("anzeige")).toHaveTextContent("de:Hallo");
  });

  it("zeigt den Umschalter DE/EN", () => {
    browserSprache(["de-DE"]);
    seite("/links?lang=en");
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("EN");
  });
});

describe("ohne Provider (CRM)", () => {
  it("bleibt alles Deutsch und der Umschalter fehlt", () => {
    browserSprache(["en-US"]);
    seite("/steuerrechner?lang=en", false);
    expect(screen.getByTestId("anzeige")).toHaveTextContent("de:Hallo");
    expect(screen.queryByTestId("sprachwechsel")).toBeNull();
  });
});
