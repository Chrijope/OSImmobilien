import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { gemerkteDeckblattVariante, merkeDeckblattVariante, type DeckblattVariante } from "@/lib/investmentrechner/deckblattWerte";
import { altersvorsorge } from "@/lib/investmentrechner/altersvorsorge";
import { formatEuro } from "@/lib/investmentrechner/formatierer";
import type { FormatSprache } from "@/lib/sprachFormat";
import { ExposeDokument } from "./ExposeDokument";

/*
 * Das dritte Deckblatt „Vermögensaufbau & Altersvorsorge“, seit dem 09.10.2026.
 * Die Rechnung prüft altersvorsorge.test.ts; hier geht es um die Seite.
 */

const KUNDE: InvestmentEingabe = {
  ...standardEingabe,
  clientName: "Familie Muster",
  propertyTitle: "Musterhaus, WE 3",
  address: "Beispielweg 1, 90000 Musterstadt",
  purchasePrice: 250_000,
  equity: 15_000,
  monthlyColdRent: 850,
  monthlyOperatingCosts: 60,
  monthlyReserveContribution: 25,
  seniorRepaymentRate: 2,
  taxableIncomeCustomer: 60_000,
  clientAge: 35,
  retirementAge: 67,
};

const glatt = (text: string | null | undefined) => (text ?? "").replace(/ | /g, " ");

function seiten(eingabe: InvestmentEingabe, deckblatt: DeckblattVariante, sprache: FormatSprache = "de") {
  const { container } = render(
    <ExposeDokument
      input={eingabe}
      result={berechneInvestment(eingabe)}
      photos={[]}
      documents={[]}
      documentData={leereUnterlagenDaten}
      sprache={sprache}
      deckblatt={deckblatt}
    />,
  );
  return [...container.querySelectorAll<HTMLElement>(".expose-page")];
}

describe("Deckblatt Vermögensaufbau & Altersvorsorge", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("steht als erste Seite da, die Seiten danach sind dieselben wie bei den anderen", () => {
    const rente = seiten(KUNDE, "rente");
    expect(rente[0].classList.contains("deckblatt-rente")).toBe(true);
    const blick = seiten(KUNDE, "blick");
    expect(rente.slice(1).map((s) => s.className)).toEqual(blick.slice(1).map((s) => s.className));
  });

  it("zeigt Leitfrage, Kunde, drei Kennzahlen, Zeitstrahl, Vermögen und Hinweis", () => {
    const av = altersvorsorge(KUNDE);
    if (av.status !== "ok") throw new Error(av.status);
    const seite = seiten(KUNDE, "rente")[0];
    const text = glatt(seite.textContent);
    expect(text).toContain("Was bringt mir die Wohnung im Ruhestand?");
    expect(text).toContain("Familie Muster · heute 35 Jahre · geplanter Rentenbeginn mit 67 (2058)");
    expect(seite.querySelectorAll(".db-kacheln > div")).toHaveLength(3);
    expect(text).toContain(`Wohnung schuldenfrei ab${av.schuldenfrei!.jahr}`);
    expect(text).toContain(glatt(formatEuro(av.ruhestand.zusatz)));
    expect(text).toContain(`in heutiger Kaufkraft ca. ${glatt(formatEuro(av.ruhestand.zusatzHeute))}`);
    expect(seite.querySelectorAll(".db-zeitstrahl > li")).toHaveLength(3);
    expect(text).toContain("Dein Vermögen zum Rentenbeginn 2058");
    expect(text).toContain("Beispielrechnung, keine Anlage-, Steuer- oder Rechtsberatung.");
    // Schuldenfrei vor der Rente: keine Warnung.
    expect(seite.querySelector(".db-hinweis")).toBeNull();
    expect(text).not.toMatch(/[–—]/);
  });

  it("warnt deutlich, wenn die Wohnung zum Rentenbeginn noch nicht bezahlt ist", () => {
    const seite = seiten({ ...KUNDE, seniorRepaymentRate: 1 }, "rente")[0];
    expect(glatt(seite.querySelector(".db-hinweis")?.textContent)).toMatch(/noch nicht schuldenfrei: Restschuld ca\. .*Ab \d{4} entfällt die Rate/);
    // Reihenfolge im Zeitstrahl: Kauf, Rentenbeginn, schuldenfrei.
    const titel = [...seite.querySelectorAll(".db-station small")].map((e) => e.textContent);
    expect(titel).toEqual(["Kauf", "Rentenbeginn", "Schuldenfrei"]);
  });

  it("ohne Alter steht ein Hinweis statt Zahlen", () => {
    const seite = seiten({ ...KUNDE, clientAge: 0 }, "rente")[0];
    expect(seite.querySelector(".db-kacheln")).toBeNull();
    expect(seite.querySelector(".db-hinweis")?.textContent).toContain("fehlt das Alter");
  });

  it("gibt es auch auf Englisch, ohne Gedankenstriche", () => {
    const seite = seiten(KUNDE, "rente", "en")[0];
    const text = glatt(seite.textContent);
    expect(text).toContain("What will the flat do for me in retirement?");
    expect(text).toContain("Example calculation, not investment, tax or legal advice.");
    expect(text).not.toMatch(/[–—]/);
  });

  it("die Wahl wird im Browser gemerkt", () => {
    const werte = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => werte.get(k) ?? null,
      setItem: (k: string, v: string) => void werte.set(k, String(v)),
    });
    merkeDeckblattVariante("rente");
    expect(gemerkteDeckblattVariante()).toBe("rente");
  });
});
