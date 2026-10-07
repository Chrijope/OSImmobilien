import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NaechsteSchritteKarte } from "@/components/kunde/NaechsteSchritteKarte";
import { MitschriftenKasten } from "@/components/mitschrift/MitschriftenKasten";
import type { Investment } from "@/lib/investmentsStore";

vi.mock("@/lib/mitschriftStore", () => ({
  ladeMitschriften: vi.fn(async () => [
    {
      id: "m1",
      raumId: null,
      kontaktId: "k1",
      investmentId: "i1",
      aktivitaetId: null,
      gastgeberId: "g1",
      begonnenAt: "2026-09-20T10:00:00Z",
      beendetAt: "2026-09-20T10:30:00Z",
      dauerSekunden: 1800,
      zeilen: [{ zeitpunkt: 0, sprecher: "Beraterin", text: "Hallo zusammen" }],
      volltext: "Hallo zusammen",
      zusammenfassung: "",
      modell: null,
      createdAt: "2026-09-20T10:30:00Z",
    },
  ]),
  ladeMitschriftenZuRaeumen: vi.fn(async () => []),
}));

/**
 * Christian am 29.09.2026: Im Kundenprofil unter „Investments“ steht jeder
 * Kasten immer offen, fuer alle Rollen, und laesst sich nicht mehr
 * zuklappen. Einen gemerkten Klappzustand gibt es nicht mehr.
 *
 * Das Kundenprofil laesst sich im Test nicht als Ganzes rendern (Anmeldung,
 * Zwischenspeicher, ein Dutzend Stores). Die Verdrahtung wird deshalb am
 * Quelltext geprueft, die beiden Karten mit Schalter werden gerendert.
 */
const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");
const profil = lies("src/pages/KundenDetail.tsx");
const objektauswahl = lies("src/components/kunden/FreieWohnungenCard.tsx");

describe("Investment im Kundenprofil ohne Klappen", () => {
  it("merkt sich keinen Klappzustand mehr", () => {
    expect(profil).not.toContain("useKundenprofilAbschnitte");
    expect(profil).not.toContain("useAufklappZustand");
    expect(profil).not.toContain("abschnitte.istOffen");
    expect(profil).not.toContain("skriptKlappeOffen");
    expect(profil).not.toContain("beratungsterminOffen");
    expect(objektauswahl).not.toContain("abschnittOffen");
  });

  it("hat im Investment keinen Klappkopf und keinen Einklappknopf mehr, außer an den zwei Gesprächskästen", () => {
    expect(profil).not.toContain('<details className="group" open>');
    // Genau zwei Klappköpfe: Beratungsgespräch vereinbaren und Erstgesprächs-Skript.
    expect(profil.match(/Einklappen \/ Ausklappen/g)?.length).toBe(2);
  });

  it("schaltet Nächste Schritte und Mitschriften im Investment fest offen", () => {
    expect(profil).toMatch(/showOpenButton=\{false\}\s*einklappbar=\{false\}/);
    expect(profil).toContain("<MitschriftenKasten kontaktId={id} investmentId={inv.id} einklappbar={false} />");
  });
});

/**
 * Christian am 29.09.2026, am selben Tag nachgeschärft: Zwei Kästen im
 * Investment klappen doch, „Beratungsgespräch vereinbaren“ und
 * „Erstgesprächs-Skript“. Beim Öffnen des Profils stehen beide zu, ohne
 * gemerkten Zustand.
 */
describe("Beratungsgespräch vereinbaren und Erstgesprächs-Skript", () => {
  it("stehen beim Öffnen des Profils zu, ohne gemerkten Zustand", () => {
    expect(profil).toContain("const [beratungKastenOffen, setBeratungKastenOffen] = useState(false);");
    expect(profil).toContain("const [skriptKastenOffen, setSkriptKastenOffen] = useState(false);");
  });

  it("lassen sich über ihren Kopf auf- und zuklappen", () => {
    expect(profil).toMatch(/open=\{beratungKastenOffen\}\s*onToggle=\{\(e\) => setBeratungKastenOffen\(/);
    expect(profil).toMatch(/open=\{skriptKastenOffen\}\s*onToggle=\{\(e\) => setSkriptKastenOffen\(/);
    expect(profil).toMatch(/<summary[^>]*>\s*<Calendar[^>]*\/>\s*<h3[^>]*>Beratungsgespräch vereinbaren<\/h3>/);
    expect(profil).toMatch(/<summary[^>]*>\s*<StickyNote[^>]*\/>\s*<div[^>]*>\s*<h3[^>]*>Erstgesprächs-Skript<\/h3>/);
  });

  it("zeigt eingeklappt beim Skript den Zählstand", () => {
    expect(profil).toMatch(/!skriptKastenOffen && \([\s\S]{0,200}skriptKurzfassung\.fortschritt/);
  });

  it("klappt Beratungsgespräch vereinbaren auf, bevor der Pflichtfeld-Sprung dorthin scrollt", () => {
    expect(profil).toMatch(/setBeratungKastenOffen\(true\);\s*window\.requestAnimationFrame\([\s\S]{0,120}beratungs-termin-vereinbaren/);
  });
});

/**
 * Christian am 16.09.2026, am 29.09.2026 bestätigt: Finanziert der Kunde
 * selbst, stehen die Unterlagen im Bonitätscheck eingeklappt, mit einem
 * Knopf zum Nachsehen. Kein gemerkter Zustand.
 */
describe("Bonitätscheck beim Selbstfinanzierer", () => {
  it("klappt die Unterlagen ein und bietet den Knopf zum Anzeigen", () => {
    expect(profil).toContain("const [saUnterlagenOffen, setSaUnterlagenOffen] = useState<Record<string, boolean>>({});");
    expect(profil).toContain("<div hidden={saEntfaellt && !saUnterlagenOffen[inv.id]}>");
    expect(profil).toMatch(/\{saEntfaellt && \(\s*<button[\s\S]{0,1200}Unterlagen anzeigen, werden nicht gebraucht/);
    expect(profil).toContain("Unterlagen wieder einklappen");
  });

  /*
   * Christian, 05.10.2026: Die Bankprüfung daneben klappt genauso ein, mit
   * eigenem Klappzustand. Ohne Vermerk bleibt sie offen wie bisher.
   */
  it("klappt auch die Bankprüfung ein, mit eigenem Knopf und Zustand", () => {
    const bank = profil.slice(profil.indexOf('<h3 className="font-bold mb-4">Bankprüfung</h3>'));
    expect(bank).toMatch(/^[\s\S]{0,800}\{saEntfaellt && \(\s*<button[\s\S]{0,900}Unterlagen anzeigen, werden nicht gebraucht/);
    expect(bank).toMatch(/^[\s\S]{0,1800}<div hidden=\{saEntfaellt && !saUnterlagenOffen\[`\$\{inv\.id\}:bank`\]\}>/);
    // Liste, Sternchen und Fortschritt 0/8 liegen im eingeklappten Teil.
    const ende = bank.indexOf("</Card>");
    const klappteil = bank.slice(bank.indexOf("<div hidden={saEntfaellt"), ende);
    expect(klappteil).toContain("dynamicBankDocs.map");
    expect(klappteil).toContain("{bankDone}/{dynamicBankDocs.length}");
  });

  it("schiebt einen Selbstfinanzierer, der schon auf Bonitätsunterlagen steht, auf Finanzierung", () => {
    expect(profil).toMatch(/if \(rvSignedForAutoAdvance && saEntfaellt && inv\.pipelineStufe === "bonitaetsunterlagen"\) \{\s*stufenwechsel\(inv\.id, "finanzierung"/);
  });

  it("zeigt Person 2 unabhängig vom Klappzustand, wie früher bei offener Bonität", () => {
    expect(profil).toContain("{kunde.person2 && (\n              <>\n                <h3 className=\"font-bold text-lg mt-6 text-primary\">Bonitätsunterlagen – Person 2");
  });
});

const INV = { id: "i1", nummer: 1, pipelineStufe: "reservierung" } as unknown as Investment;

describe("Nächste Schritte", () => {
  it("zeigt im Investment den Inhalt ohne Klick und ohne Klappknopf", () => {
    render(
      <NaechsteSchritteKarte investments={[INV]} isAdmin onOpenInvestment={() => {}} showOpenButton={false} einklappbar={false} />,
    );
    expect(screen.getByText("Aktuelle Stufe:")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Zuklappen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nächste Schritte" })).not.toBeInTheDocument();
  });

  it("bleibt außerhalb des Investments klappbar", () => {
    render(<NaechsteSchritteKarte investments={[INV]} isAdmin onOpenInvestment={() => {}} />);
    expect(screen.getByRole("button", { name: "Zuklappen" })).toBeInTheDocument();
  });
});

describe("Mitschriften", () => {
  it("zeigt im Investment den Text ohne Klick und ohne Klappkopf", async () => {
    const { container } = render(<MitschriftenKasten kontaktId="k1" investmentId="i1" einklappbar={false} />);
    expect(await screen.findByText("Hallo zusammen")).toBeVisible();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("summary")).toBeNull();
    expect(screen.queryByText("Einklappen / Ausklappen")).not.toBeInTheDocument();
  });

  it("bleibt im Bewerberprofil klappbar", async () => {
    const { container } = render(<MitschriftenKasten kontaktId="k1" investmentId="i1" />);
    await screen.findByText("Hallo zusammen");
    expect(container.querySelector("details")).not.toBeNull();
  });
});
