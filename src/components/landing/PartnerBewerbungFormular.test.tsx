import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Das Bewerbungsformular, herausgelöst aus der Landingpage.
 *
 * Wichtigste Zusage beim Herauslösen: Die Landingpage verhält sich wie
 * vorher. Geprüft wird deshalb, was an `submit-bewerbung` hinausgeht, Feld für
 * Feld mit den Werten, die die Landingpage übergibt. Abgefangen wird nur der
 * Aufruf der Function selbst, es geht nichts hinaus.
 */

const aufrufe: Array<{ name: string; body: Record<string, unknown> }> = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, opts: { body: Record<string, unknown> }) => {
        aufrufe.push({ name, body: opts.body });
        return { data: { ok: true, id: "neu", seiteToken: "" }, error: null };
      },
    },
  },
}));
vi.mock("@/lib/recaptcha", () => ({ ladeRecaptcha: () => {}, executeRecaptcha: async () => "r".repeat(20) }));

const { PartnerBewerbungFormular } = await import("@/components/landing/PartnerBewerbungFormular");
const { Toaster } = await import("@/components/ui/toaster");

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => { aufrufe.length = 0; });
afterEach(cleanup);

/** Genau die Werte, die `VertriebspartnerLanding.tsx` für den Tippgeber übergibt. */
function zeigeWieLandingpage(onAbgesendet = vi.fn()) {
  render(
    <MemoryRouter>
      <PartnerBewerbungFormular
        weg="tippgeber"
        stelleId="s1"
        stelleTitel="Tippgeber Immobilien-Kapitalanlage"
        beschaeftigungsart="Nebenberuflich"
        quelle="Website Karriereseite"
        erfahrungPlaceholder="Beruf"
        onAbgesendet={onAbgesendet}
      />
      <Toaster />
    </MemoryRouter>,
  );
  return onAbgesendet;
}

function feld(label: string): HTMLElement {
  return screen.getByText(label).parentElement!.querySelector("input, textarea") as HTMLElement;
}

async function fuelleAus({ mitLebenslauf = true } = {}) {
  fireEvent.change(feld("Vorname *"), { target: { value: " Erika " } });
  fireEvent.change(feld("Nachname *"), { target: { value: "Muster" } });
  fireEvent.change(feld("E-Mail *"), { target: { value: "erika@example.org" } });
  fireEvent.change(feld("Handynummer *"), { target: { value: "1701234567" } });
  fireEvent.change(feld("Ort"), { target: { value: "Hamburg" } });
  fireEvent.change(feld("Erfahrung *"), { target: { value: "Kauffrau" } });
  fireEvent.change(document.querySelector("textarea")!, { target: { value: "Großes Netzwerk" } });
  // Das versteckte native `select` von Radix, siehe StellenanzeigePage.test.tsx.
  const nativ = screen.getByText("Wie bist Du auf uns aufmerksam geworden? *").parentElement!.querySelector("select")!;
  fireEvent.change(nativ, { target: { value: "Empfehlung" } });
  if (mitLebenslauf) {
    const datei = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [datei] } });
    await screen.findByText("cv.pdf");
  }
  fireEvent.click(document.querySelector<HTMLElement>('[role="checkbox"]')!);
}

function absenden() {
  fireEvent.click(Array.from(document.querySelectorAll<HTMLElement>('button[type="submit"]')).find((b) => b.textContent?.includes("Bewerbung absenden"))!);
}

describe("Das Formular mit den Werten der Landingpage", () => {
  it("schickt dieselben Felder an submit-bewerbung wie vorher", async () => {
    const fertig = zeigeWieLandingpage();
    await fuelleAus();
    absenden();
    await waitFor(() => expect(fertig).toHaveBeenCalledTimes(1));

    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].name).toBe("submit-bewerbung");
    const { lebenslaufUrl, ...rest } = aufrufe[0].body;
    expect(String(lebenslaufUrl)).toMatch(/^data:application\/pdf;base64,/);
    expect(rest).toEqual({
      action: "submit",
      vorname: "Erika",
      nachname: "Muster",
      email: "erika@example.org",
      telefon: expect.stringContaining("1701234567"),
      ort: "Hamburg",
      erfahrung: "Kauffrau",
      motivation: "Großes Netzwerk",
      quelle: "Website Karriereseite",
      aufmerksamDurch: "Empfehlung",
      stelleId: "s1",
      stelleTitel: "Tippgeber Immobilien-Kapitalanlage",
      beschaeftigungsart: "Nebenberuflich",
      lebenslaufName: "cv.pdf",
      hp: "",
      // Neu und für die Landingpage immer aus: Sie bekommt keinen Schlüssel.
      kennenlernLink: false,
      recaptchaToken: "r".repeat(20),
    });
    // The landing page does not send the Tippgeber field, even for its Tippgeber path.
    expect("stelle" in aufrufe[0].body).toBe(false);
  });

  it("verlangt weiterhin den Lebenslauf, bevor etwas hinausgeht", async () => {
    const fertig = zeigeWieLandingpage();
    await fuelleAus({ mitLebenslauf: false });
    absenden();
    expect(await screen.findByText("Bitte lade Deinen Lebenslauf als PDF hoch.")).toBeInTheDocument();
    expect(aufrufe).toHaveLength(0);
    expect(fertig).not.toHaveBeenCalled();
  });

  it("lässt den Absendeknopf ohne Einwilligung gesperrt", () => {
    zeigeWieLandingpage();
    const knopf = Array.from(document.querySelectorAll<HTMLButtonElement>('button[type="submit"]'))[0];
    expect(knopf).toBeDisabled();
    expect(within(knopf).getByText("Bewerbung absenden")).toBeInTheDocument();
  });
});

describe("Die Landingpage benutzt das gemeinsame Formular", () => {
  const LANDING = readFileSync(resolve(__dirname, "../../pages/VertriebspartnerLanding.tsx"), "utf8");

  it("übergibt Quelle, Signalfarbe und Abbrechen wie bisher", () => {
    expect(LANDING).toContain("<PartnerBewerbungFormular");
    expect(LANDING).toContain('quelle="Website Karriereseite"');
    expect(LANDING).toContain('absendenKlasse="vp-btn-signal"');
    expect(LANDING).toContain('stelleTitel={isTG ? "Tippgeber Immobilien-Kapitalanlage" : (stelle?.titel || "Vertriebspartner Immobilien-Kapitalanlage")}');
    expect(LANDING).toContain('beschaeftigungsart={isTG ? "Nebenberuflich" : (stelle?.art || "Vollzeit / Teilzeit")}');
  });

  it("ruft die Function nicht mehr selbst auf und fordert keinen Schlüssel an", () => {
    expect(LANDING).not.toContain('functions.invoke("submit-bewerbung"');
    expect(LANDING).not.toContain("kennenlernLink");
  });
});
