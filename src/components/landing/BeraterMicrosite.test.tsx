import { fireEvent, render, screen, within } from "@testing-library/react";
import FloatingBeraterBadge from "./FloatingBeraterBadge";
import InvestorBenefitsSection from "./InvestorBenefitsSection";
import BeraterMicrositeContent from "./BeraterMicrositeContent";

const berater = {
  name: "Maria Muster", position: "Kapitalanlageberaterin", telefon: "+49 911 123456",
  email: "maria@example.com", bild: "/maria.jpg", buchungslink: "https://example.com/maria",
};

describe("Persönliche Microseite", () => {
  it("behält die Kontaktwege des schwebenden Ansprechpartners", () => {
    const onContactClick = vi.fn();
    render(<FloatingBeraterBadge berater={berater} onContactClick={onContactClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Dein Ansprechpartner" }));
    expect(screen.getByRole("link", { name: berater.email })).toHaveAttribute("href", `mailto:${berater.email}`);
    expect(screen.getByRole("link", { name: berater.telefon })).toHaveAttribute("href", `tel:${berater.telefon}`);
    fireEvent.click(screen.getByRole("button", { name: /Anfrage senden/ }));
    expect(onContactClick).toHaveBeenCalledOnce();
    expect(screen.queryByText("Dein persönlicher Ansprechpartner")).not.toBeInTheDocument();
  });
});

/**
 * Am 16.09.2026 umgebaut: Die Schreibmaschinen-Überschriften stehen links
 * statt zentriert, und die vier Investorenprofile liegen auf dem Telefon in
 * einer seitlich blätterbaren Bahn statt untereinander.
 */
describe("Microseite, Überschriften und Investorenprofile", () => {
  const echteMedien = window.matchMedia;

  /** Setzt die Medienabfragen so, dass nur die genannten Abfragen zutreffen. */
  const setzeMedien = (trifftZu: (abfrage: string) => boolean) => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (abfrage: string) => ({
        matches: trifftZu(abfrage),
        media: abfrage,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  };

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", { writable: true, value: echteMedien });
  });

  it("schreibt die Überschrift von links und hält die längste Variante in einer Zeile", () => {
    const profile = render(<InvestorBenefitsSection />);
    // Zentriert wirkte es, als springe der Text hin und her.
    expect(profile.container.querySelector(".text-center.absolute")).toBeNull();
    expect(profile.container.querySelector(".absolute.inset-0.block")).toHaveClass("text-left");
    // „eine klare Strategie" darf in der Browserfassung nicht umbrechen.
    expect(profile.container.querySelector(".md\\:whitespace-nowrap")).not.toBeNull();
  });

  it("behält am breiten Fenster das bekannte Raster der vier Profile", () => {
    setzeMedien(() => false);
    const { container } = render(<InvestorBenefitsSection />);
    expect(container.querySelector(".profil-bahn")).toBeNull();
    expect(container.querySelectorAll(".investor-profile-card")).toHaveLength(4);
  });

  it("legt die Profile auf dem Telefon in eine Bahn, die sich mit der Tastatur blättern lässt", () => {
    setzeMedien((abfrage) => abfrage.includes("max-width: 767px"));
    const { container } = render(<InvestorBenefitsSection />);

    const bahn = container.querySelector(".profil-bahn");
    expect(bahn).not.toBeNull();
    // Vier Karten nebeneinander, jede Karte kommt nur einmal im Dokument vor.
    expect(bahn!.children).toHaveLength(4);
    expect(container.querySelectorAll(".investor-profile-card")).toHaveLength(4);

    const punkte = screen.getAllByRole("button", { name: /Unternehmer|Gutverdiener|Selbstständige|Angestellte/ });
    expect(punkte).toHaveLength(4);
    expect(punkte[0]).toHaveAttribute("aria-current", "true");

    // Ohne Maus bedienbar: Pfeiltaste rechts blättert eine Karte weiter.
    fireEvent.keyDown(bahn!, { key: "ArrowRight" });
    expect(punkte[1]).toHaveAttribute("aria-current", "true");
    fireEvent.click(punkte[3]);
    expect(punkte[3]).toHaveAttribute("aria-current", "true");
  });

  it("hält niemanden fest, der Bewegungen reduziert hat", () => {
    setzeMedien((abfrage) => abfrage.includes("max-width: 767px") || abfrage.includes("prefers-reduced-motion"));
    const { container } = render(<InvestorBenefitsSection />);
    // Keine klebende Bühne, die Karten stehen wie bisher untereinander.
    expect(container.querySelector(".profil-bahn-huelle")).toBeNull();
    expect(container.querySelector(".profil-bahn")).toBeNull();
    expect(container.querySelectorAll(".investor-profile-card")).toHaveLength(4);
  });
});

/**
 * Umbau auf OS Real Estate (16.10.2026): Aufbau, Partnerdaten und Diashow der
 * neuen Seite. Der Steuer- und Eignungscheck ist entfallen.
 */
describe("Microseite OS Real Estate", () => {
  it("zeigt die Abschnitte in der neuen Reihenfolge und keinen Steuer-Check mehr", () => {
    const { container } = render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    const ueberschriften = [...container.querySelectorAll("h2")].map((h) => h.textContent ?? "");
    const reihenfolge = [
      /Rente allein/, /Steuern senken oder/, /Drei Standorte/, /So rechnet sich/, /Investoren-Profile/,
      /Alles, was du/, /Regional verwurzelt/, /Standorte im Bild/, /Sieben Schritte/, /kennen/,
    ].map((muster) => ueberschriften.findIndex((t) => muster.test(t)));
    expect(reihenfolge.every((stelle) => stelle >= 0)).toBe(true);
    expect([...reihenfolge].sort((a, b) => a - b)).toEqual(reihenfolge);
    expect(container.querySelector("#steuer-check")).toBeNull();
    expect(screen.getAllByRole("img", { name: "OS Real Estate GmbH" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Altersvorsorgeobjekt")).toHaveLength(2);
    expect(screen.getByText("Steuersparobjekt")).toBeInTheDocument();
    expect(screen.getByText("− 151 €")).toBeInTheDocument();
  });

  it("behält Name, Foto, Telefon, E-Mail und Buchungslink des Partners", () => {
    const onOpenFunnel = vi.fn();
    render(<BeraterMicrositeContent berater={berater} onOpenFunnel={onOpenFunnel} />);
    expect(screen.getAllByRole("img", { name: berater.name }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Termin direkt buchen/ })).toHaveAttribute("href", berater.buchungslink);
    expect(screen.getByRole("link", { name: berater.telefon })).toHaveAttribute("href", "tel:+49911123456");
    expect(screen.getByRole("link", { name: berater.email })).toHaveAttribute("href", `mailto:${berater.email}`);
    fireEvent.click(screen.getByRole("button", { name: /Anfrage senden/ }));
    fireEvent.click(screen.getByRole("button", { name: /Kostenloses Erstgespräch/ }));
    expect(onOpenFunnel).toHaveBeenCalledTimes(2);
  });

  it("zeigt den Ansprechpartner im Hero als Karte mit Position und direktem Terminknopf", () => {
    const onOpenFunnel = vi.fn();
    const { rerender } = render(<BeraterMicrositeContent berater={berater} onOpenFunnel={onOpenFunnel} />);
    const karte = screen.getByRole("complementary", { name: "Dein persönlicher Ansprechpartner" });
    expect(within(karte).getByText(berater.name)).toBeInTheDocument();
    expect(within(karte).getByText(berater.position)).toBeInTheDocument();
    expect(within(karte).getByRole("link", { name: "Termin buchen" })).toHaveAttribute("href", berater.buchungslink);
    // Ohne Foto Initialen, ohne Buchungslink öffnet der Knopf das Anfrageformular.
    rerender(<BeraterMicrositeContent berater={{ ...berater, bild: null, buchungslink: undefined }} onOpenFunnel={onOpenFunnel} />);
    const ohne = screen.getByRole("complementary", { name: "Dein persönlicher Ansprechpartner" });
    expect(within(ohne).getByLabelText(berater.name)).toHaveTextContent("MM");
    fireEvent.click(within(ohne).getByRole("button", { name: "Termin buchen" }));
    expect(onOpenFunnel).toHaveBeenCalledOnce();
  });

  it("zeigt den Prozess in sieben Schritten, Reservierung kostenfrei", () => {
    const { container } = render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    const schritte = [...container.querySelectorAll(".osm-schritte li b")].map((b) => b.textContent);
    expect(schritte).toEqual(["Erstgespräch", "Beratungsgespräch", "Objektvorstellung", "Reservierung", "Besichtigung", "Finanzierung", "Notar"]);
    expect(screen.getByText("Kostenfrei.")).toBeInTheDocument();
  });

  it("blättert die Bilder eines Objekts mit Pfeil und Punkt", () => {
    render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    const diashow = screen.getByRole("group", { name: "Bilder Barfusstraße 9" });
    const punkte = within(diashow).getAllByRole("button", { name: /Bild \d von 7/ });
    expect(punkte[0]).toHaveAttribute("aria-current", "true");
    fireEvent.click(within(diashow).getByRole("button", { name: "Nächstes Bild" }));
    expect(punkte[1]).toHaveAttribute("aria-current", "true");
    fireEvent.click(within(diashow).getByRole("button", { name: "Vorheriges Bild" }));
    fireEvent.click(within(diashow).getByRole("button", { name: "Vorheriges Bild" }));
    expect(punkte[6]).toHaveAttribute("aria-current", "true");
  });
});
