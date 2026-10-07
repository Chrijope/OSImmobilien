import { fireEvent, render, screen, within } from "@testing-library/react";
import AppleHeroSection from "./apple/AppleHeroSection";
import FloatingBeraterBadge from "./FloatingBeraterBadge";
import SocialProofSection from "./SocialProofSection";
import InvestorBenefitsSection from "./InvestorBenefitsSection";
import TaxSection from "./TaxSection";

const berater = {
  name: "Maria Muster", position: "Kapitalanlageberaterin", telefon: "+49 911 123456",
  email: "maria@example.com", bild: "/maria.jpg", buchungslink: "https://example.com/maria",
};

describe("Persönliche Microseite", () => {
  it("zeigt im Hero keinen Beraterkasten mehr, behält aber die Aufrufe zur Beratung", () => {
    const onOpenFunnel = vi.fn();
    const { container } = render(<AppleHeroSection berater={berater} onOpenFunnel={onOpenFunnel} />);
    // Am 16.09.2026 aus dem Hero genommen: Abzug, "Dein Berater · Name", Position und die drei Verweise.
    expect(container.querySelector(".hero-contact")).toBeNull();
    expect(screen.queryByText(/Dein Berater/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: berater.telefon })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: berater.email })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Erstgespräch buchen" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meine Steuerersparnis berechnen" })).toHaveAttribute("href", "#steuer-check");
    fireEvent.click(screen.getByRole("button", { name: "Kostenlose Erstberatung vereinbaren" }));
    expect(onOpenFunnel).toHaveBeenCalledOnce();
  });

  it("ersetzt ein nicht ladbares Portrait und zeigt beim nächsten Berater dessen Bild", () => {
    const { rerender } = render(<AppleHeroSection berater={berater} onOpenFunnel={() => {}} />);
    fireEvent.error(screen.getByRole("img", { name: berater.name }));
    expect(screen.queryByRole("img", { name: berater.name })).not.toBeInTheDocument();
    rerender(<AppleHeroSection berater={{ ...berater, name: "Leon Beispiel", bild: "/leon.jpg" }} onOpenFunnel={() => {}} />);
    expect(screen.getByRole("img", { name: "Leon Beispiel" })).toHaveAttribute("src", "/leon.jpg");
  });

  it("behält die Kontaktwege des schwebenden Ansprechpartners", () => {
    const onContactClick = vi.fn();
    render(<FloatingBeraterBadge berater={berater} onContactClick={onContactClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Dein Ansprechpartner" }));
    expect(screen.getByRole("link", { name: berater.email })).toHaveAttribute("href", `mailto:${berater.email}`);
    expect(screen.getByRole("link", { name: berater.telefon })).toHaveAttribute("href", `tel:${berater.telefon}`);
    fireEvent.click(screen.getByRole("button", { name: /Mehr erfahren/ }));
    expect(onContactClick).toHaveBeenCalledOnce();
    expect(screen.queryByText("Dein persönlicher Ansprechpartner")).not.toBeInTheDocument();
  });

  it("liest jede Kundenstimme einmal vor und kann die Endlosschleife pausieren", () => {
    const { container } = render(<SocialProofSection onOpenFunnel={() => {}} />);
    const region = screen.getByRole("region", { name: "Kundenstimmen" });
    expect(within(region).getAllByRole("img")).toHaveLength(9);
    const groups = container.querySelectorAll(".kundenstimmen-group");
    expect(groups).toHaveLength(2);
    expect(groups[0].textContent).toBe(groups[1].textContent);
    expect(groups[1]).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(screen.getByRole("button", { name: "Kundenstimmen pausieren" }));
    expect(container.querySelector(".kundenstimmen-track")).toHaveStyle({ animationPlayState: "paused" });
    fireEvent.click(screen.getByRole("button", { name: "Kundenstimmen weiterlaufen lassen" }));
    expect(screen.getByRole("button", { name: "Kundenstimmen pausieren" })).toHaveAttribute("aria-pressed", "false");
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

  it("schreibt beide Überschriften von links und hält die längste Variante in einer Zeile", () => {
    const profile = render(<InvestorBenefitsSection />);
    // Zentriert wirkte es, als springe der Text hin und her.
    expect(profile.container.querySelector(".text-center.absolute")).toBeNull();
    expect(profile.container.querySelector(".absolute.inset-0.block")).toHaveClass("text-left");
    // „eine klare Strategie" darf in der Browserfassung nicht umbrechen.
    expect(profile.container.querySelector(".md\\:whitespace-nowrap")).not.toBeNull();
    profile.unmount();

    const steuer = render(<TaxSection onOpenFunnel={() => {}} />);
    expect(steuer.container.querySelector(".text-center.absolute")).toBeNull();
    expect(steuer.container.querySelector(".absolute.inset-0.block")).toHaveClass("text-left");
    expect(steuer.container.querySelector(".md\\:whitespace-nowrap")).not.toBeNull();
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
