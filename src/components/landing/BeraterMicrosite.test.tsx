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
 * Umbau auf OS Real Estate (16.10.2026), neu aufgebaut am 29.10.2026 als
 * Spannungsbogen in Christians Reihenfolge: Ausgangslage, Vergleich, Wer wir
 * sind, Prinzip, Musterrechnung, Leistungen, Konzepte, Profile, Fragen,
 * Prozess, Erstgespräch.
 */
describe("Microseite OS Real Estate", () => {
  it("zeigt die Abschnitte in der Reihenfolge des Spannungsbogens", () => {
    const { container } = render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    const ueberschriften = [...container.querySelectorAll("h2")].map((h) => h.textContent ?? "");
    const reihenfolge = [
      /unter Druck/, /Warum gerade eine Immobilie/, /bauen, vermitteln/, /Wer bezahlt/, /echte Wohnung/,
      /Alles, was du/, /Mehr Netto heute/, /Investoren-Profile/, /Fragen, die sich jeder/, /Sieben Schritte/, /kennen/,
    ].map((muster) => ueberschriften.findIndex((t) => muster.test(t)));
    expect(reihenfolge.every((stelle) => stelle >= 0)).toBe(true);
    expect([...reihenfolge].sort((a, b) => a - b)).toEqual(reihenfolge);
    expect(container.querySelector("#steuer-check")).toBeNull();
    expect(screen.getAllByRole("img", { name: "OS Real Estate GmbH" }).length).toBeGreaterThan(0);
    // Keine Objektliste und keine Diashow; die eine Wohnung steht nur in der Musterrechnung.
    expect(container.querySelector("#objekte")).toBeNull();
    expect(screen.queryByRole("group", { name: /Bilder/ })).toBeNull();
  });

  it("stellt beide Konzepte vor, Altersvorsorge mit Verkauf oder Zusatzrente", () => {
    render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    expect(screen.getByText("Konzept 1 · Steueroptimierung")).toBeInTheDocument();
    expect(screen.getByText("Konzept 2 · Altersvorsorge")).toBeInTheDocument();
    expect(screen.getByText(/Verkaufen: ein Betrag/)).toBeInTheDocument();
    expect(screen.getByText(/Behalten: Miete als Zusatzrente/)).toBeInTheDocument();
    expect(screen.getAllByText("Für Kenner: die Details")).toHaveLength(2);
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
    fireEvent.click(screen.getByRole("button", { name: /^Erstgespräch vereinbaren/ }));
    expect(onOpenFunnel).toHaveBeenCalledTimes(3);
  });

  it("führt die Hauptaktion im Orange-Verlauf", () => {
    render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    expect(screen.getByRole("button", { name: /Kostenloses Erstgespräch/ })).toHaveClass("btn-brand");
    expect(screen.getByRole("link", { name: /Termin direkt buchen/ })).toHaveClass("btn-brand");
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

  it("zeigt den Prozess in sieben Schritten mit je einer Grafik, Reservierung kostenfrei", () => {
    const { container } = render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    const schritte = [...container.querySelectorAll(".osm-schritte li b")].map((b) => b.textContent);
    expect(schritte).toEqual(["Qualifizierungsgespräch", "Beratungspräsentation", "Objektpräsentation", "Reservierung", "Finanzierung", "Besichtigung", "Notar"]);
    expect(container.querySelectorAll(".osm-schritte li .osm-pg")).toHaveLength(7);
    expect(screen.getByText("Kostenfrei.")).toBeInTheDocument();
  });

  it("versteckt ohne Bewegung nichts: ohne IntersectionObserver bleibt alles im fertigen Bild", () => {
    // jsdom kennt keinen IntersectionObserver, wie ein Browser ohne Skriptunterstützung dafür.
    const { container } = render(<BeraterMicrositeContent berater={berater} onOpenFunnel={() => {}} />);
    expect(container.querySelector("[data-anim]")).toBeNull();
  });
});
