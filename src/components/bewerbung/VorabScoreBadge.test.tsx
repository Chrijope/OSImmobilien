import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VorabScoreAbzeichen, VorabScoreAufschluesselung, VorabScoreZeile, VorabScoreZelle, vorabSchwerpunkte } from "./VorabScoreBadge";
import { VorwissenKarte } from "./VorwissenKarte";
import { berechneVorabScore } from "@/lib/bewerberVorabScore";

// Die Anzeige des Vorab-Scores: Zelle in der Bewerberliste, Zeile in der
// Übersicht und Badge in der Vorwissen-Karte. Der Tooltip braucht den
// Provider, den in der App App.tsx stellt.

// Ein alter Vorabbogen mit durchweg starken Antworten. `erfahrungsdauer`
// steht bewusst noch darin: Die Frage wird seit dem 08.09.2026 nicht mehr
// bewertet und darf trotzdem nichts kaputt machen.
const STARK = {
  zeitProWoche: "vollzeit",
  hintergrund: ["vertrieb"],
  erfahrungsdauer: "3_bis_10",
  perspektive: "sofort_haupt",
  leadPraeferenz: "beides",
  einkommensziel: "5000_10000",
  gewerbe34c: "beides",
  startzeitpunkt: "sofort",
};

// Ein Kennenlernbogen. Der gewählte Weg und die Verständnisfragen gibt es nur
// dort, sie sind das Merkmal der Herkunft.
const KENNENLERNBOGEN = {
  weg: "weg3",
  wegAntwort2: "monate",
  wegAntwort3: "selbst",
  zeitProWoche: "vollzeit",
  hintergrund: ["vertrieb"],
  perspektive: "sofort_haupt",
  leadPraeferenz: "beides",
  einkommensziel: "5000_10000",
  gewerbe34c: "beides",
  startzeitpunkt: "sofort",
  verstaendnisFixum: "nein",
  verstaendnisProvision: "nein",
};

const MITTEL = {
  zeitProWoche: "10_bis_20",
  hintergrund: ["quereinsteiger"],
  perspektive: "spaeter_haupt",
  leadPraeferenz: "beides",
  einkommensziel: "5000_10000",
  gewerbe34c: "keines",
  startzeitpunkt: "vier_wochen",
};

const SCHWACH = {
  zeitProWoche: "unter_10",
  hintergrund: ["quereinsteiger"],
  perspektive: "unklar",
  leadPraeferenz: "leads",
  einkommensziel: "unklar",
  gewerbe34c: "im_gespraech",
  startzeitpunkt: "umschauen",
};

function renderMitProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("VorabScoreZelle (Bewerberliste)", () => {
  it("zeigt Punkte und Einstufung als Badge", () => {
    const score = berechneVorabScore(STARK)!;
    renderMitProvider(<VorabScoreZelle score={score} />);
    const badge = screen.getByTestId("vorab-score-badge");
    expect(badge).toHaveTextContent(`${score.punkte} · ${score.einstufung}`);
    expect(badge.getAttribute("data-einstufung")).toBe(score.einstufung);
    expect(badge.getAttribute("title")).toContain("Vollzeit");
  });

  it("Ampel: A grün, B orange, C rot", () => {
    const faelle: [Record<string, string | string[]>, string, string][] = [
      [STARK, "A", "bg-emerald-500"],
      [MITTEL, "B", "bg-orange-500"],
      [SCHWACH, "C", "bg-red-500"],
    ];
    for (const [antworten, einstufung, punktKlasse] of faelle) {
      const score = berechneVorabScore(antworten)!;
      expect(score.einstufung).toBe(einstufung);
      const { unmount } = renderMitProvider(<VorabScoreZelle score={score} />);
      expect(screen.getByTestId("vorab-score-ampel").className).toContain(punktKlasse);
      unmount();
    }
  });

  it("zeigt ohne Fragebogen einen Strich", () => {
    renderMitProvider(<VorabScoreZelle score={null} />);
    expect(screen.getByTestId("vorab-score-leer")).toHaveTextContent("–");
    expect(screen.queryByTestId("vorab-score-badge")).not.toBeInTheDocument();
  });

  /*
   * Die Herkunft des Scores, seit dem 16.09.2026.
   *
   * Sie muss in der Spalte zu sehen sein, ohne dass jemand die Akte öffnet:
   * Der Kennenlernbogen ist der ausführlichere, seine Einschätzung trägt
   * weiter als die des früheren Vorabbogens.
   */
  it("zeigt K für den Kennenlernbogen, V für den Vorabbogen, ? für den Altfall", () => {
    const faelle: [Record<string, string | string[]>, string, string][] = [
      [KENNENLERNBOGEN, "kennenlernen", "K"],
      [STARK, "vorabbogen", "V"],
      [MITTEL, "unbekannt", "?"],
    ];
    for (const [antworten, herkunft, kuerzel] of faelle) {
      const score = berechneVorabScore(antworten)!;
      const { unmount } = renderMitProvider(<VorabScoreZelle score={score} />);
      const zeichen = screen.getByTestId("vorab-score-herkunft");
      expect(zeichen).toHaveTextContent(kuerzel);
      expect(zeichen.getAttribute("data-herkunft")).toBe(herkunft);
      expect(screen.getByTestId("vorab-score-badge").getAttribute("data-herkunft")).toBe(herkunft);
      unmount();
    }
  });

  it("nennt die Herkunft als Satz, nicht nur als Buchstabe", () => {
    const score = berechneVorabScore(KENNENLERNBOGEN)!;
    renderMitProvider(<VorabScoreZelle score={score} />);
    // Farbe und Buchstabe allein tragen nichts: Wer vorgelesen bekommt, hört
    // den Satz, und wer die Maus hinhält, liest ihn im Tooltip.
    expect(screen.getByTestId("vorab-score-herkunft").getAttribute("aria-label"))
      .toContain("Kennenlernbogen");
    expect(screen.getByTestId("vorab-score-badge").getAttribute("title"))
      .toContain("Kennenlernbogen");
  });

  it("sagt beim Altfall ausdrücklich, dass der Bogen nicht erkennbar ist", () => {
    const score = berechneVorabScore(MITTEL)!;
    renderMitProvider(<VorabScoreZelle score={score} />);
    expect(screen.getByTestId("vorab-score-herkunft").getAttribute("aria-label"))
      .toContain("nicht mehr ablesen");
  });

  /*
   * In der Spalte stehen drei Zeichen, die Verschiedenes meinen: die Tilde für
   * die Vorabeinschätzung, das Sternchen für den unvollständigen Bogen und der
   * Buchstabe für die Herkunft. Sie dürfen sich nicht vermischen.
   */
  it("hält das Herkunftskürzel vom Sternchen getrennt", () => {
    const score = berechneVorabScore({ zeitProWoche: "10_bis_20", beschaeftigung: "angestellt" })!;
    expect(score.unvollstaendig).toBe(true);
    renderMitProvider(<VorabScoreZelle score={score} />);
    const zeichen = screen.getByTestId("vorab-score-herkunft");
    // Das Sternchen steht im Badge, aber nicht im Kürzel, und das Kürzel steht
    // hinter einem eigenen Trennstrich.
    expect(zeichen).toHaveTextContent("V");
    expect(zeichen.textContent).not.toContain("*");
    expect(zeichen.textContent).not.toContain("~");
    expect(zeichen.className).toContain("border-l");
    expect(screen.getByTestId("vorab-score-badge")).toHaveTextContent("*");
  });

  it("kennzeichnet einen unvollständigen Fragebogen", () => {
    const score = berechneVorabScore({ zeitProWoche: "10_bis_20" })!;
    renderMitProvider(<VorabScoreZelle score={score} />);
    expect(screen.getByTestId("vorab-score-badge")).toHaveTextContent("*");
    expect(screen.getByTestId("vorab-score-badge").getAttribute("title")).toContain("unvollständig");
  });
});

describe("VorabScoreZeile (Übersicht)", () => {
  it("zeigt Badge, Einstufung und Begründung", () => {
    const score = berechneVorabScore(STARK)!;
    renderMitProvider(<VorabScoreZeile score={score} />);
    const zeile = screen.getByTestId("vorab-score-zeile");
    expect(zeile).toHaveTextContent("Vorab-Score");
    expect(zeile).toHaveTextContent(`${score.punkte} · ${score.einstufung}`);
    expect(zeile).toHaveTextContent("sehr passend");
    expect(zeile).toHaveTextContent("Vollzeit, sofort hauptberuflich");
  });
});

describe("VorwissenKarte mit Vorab-Score", () => {
  it("zeigt das Badge oben rechts und die Begründung in der offenen Karte", () => {
    render(<VorwissenKarte vorname="Max" vorwissen={{ antworten: STARK, eingereichtAm: "2026-08-24T10:00:00.000Z" }} />);
    const karte = screen.getByTestId("vorwissen-karte");
    expect(screen.getByTestId("vorab-score-badge")).toBeInTheDocument();
    expect(screen.getByTestId("vorab-score-begruendung")).toHaveTextContent("Vorab-Score");
    expect(screen.getByTestId("vorab-score-begruendung")).toHaveTextContent("Vollzeit");
    expect(karte).toHaveTextContent("Das hat Max vorab angegeben");
  });

  it("eingeklappt bleibt nur das Badge, die Begründung verschwindet", () => {
    render(
      <VorwissenKarte
        vorname="Max"
        vorwissen={{ antworten: STARK }}
        offen={false}
        onOffenChange={() => undefined}
      />,
    );
    expect(screen.getByTestId("vorab-score-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("vorab-score-begruendung")).not.toBeInTheDocument();
  });

  it("ohne bewertbare Antworten erscheint kein Badge", () => {
    render(<VorwissenKarte vorname="Max" vorwissen={{ antworten: { region: "Rosenheim" } }} />);
    expect(screen.queryByTestId("vorab-score-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vorab-score-begruendung")).not.toBeInTheDocument();
  });
});

describe("VorabScoreAufschluesselung", () => {
  it("zeigt jedes bewertete Merkmal mit Antwort und Punkten", () => {
    const score = berechneVorabScore(STARK)!;
    render(<VorabScoreAufschluesselung score={score} />);
    const block = screen.getByTestId("vorab-score-aufschluesselung");
    expect(block).toHaveTextContent(`${score.rohPunkte} von ${score.maxPunkte} erreichbaren Punkten`);
    expect(block).toHaveTextContent("Zeit pro Woche");
    expect(block).toHaveTextContent("Vollzeit");
    expect(block).toHaveTextContent("Herkunft der ersten Kunden");
    // Die drei entfernten Fragen stehen nicht mehr darin.
    expect(block).not.toHaveTextContent("Erfahrungsdauer");
  });

  it("nennt die Pflichtfragen, die er offen gelassen hat", () => {
    const score = berechneVorabScore({ zeitProWoche: "vollzeit" })!;
    render(<VorabScoreAufschluesselung score={score} />);
    expect(screen.getByTestId("vorab-score-luecken")).toHaveTextContent("Perspektive");
  });
});

/*
 * ─── Das Abzeichen in der linken Spalte ───
 *
 * Christian wollte den Score „gleich wie im Kundenprofil so als kleiner Badge"
 * und die Erklärung, wie er sich berechnet. Beides zusammen geht nur, wenn die
 * Herleitung hinter einem Klick steckt.
 *
 * Geprüft wird vor allem, dass die Erklärung aus der Rechnung kommt und nicht
 * danebengeschrieben ist: Was als „am meisten gebracht" dasteht, muss auch in
 * der Aufschlüsselung mit denselben Punkten stehen.
 */
describe("VorabScoreAbzeichen", () => {
  function zeichneAbzeichen(antworten: Record<string, unknown>) {
    const score = berechneVorabScore(antworten as never)!;
    render(
      <TooltipProvider>
        <VorabScoreAbzeichen score={score} />
      </TooltipProvider>,
    );
    return score;
  }

  it("zeigt zunächst nur das kleine Abzeichen", () => {
    const score = zeichneAbzeichen(STARK);
    expect(screen.getByTestId("vorab-score-badge")).toHaveTextContent(String(score.punkte));
    expect(screen.queryByTestId("vorab-score-aufschluesselung")).not.toBeInTheDocument();
  });

  /*
   * Ein Klick und kein Darüberfahren: Auf dem Telefon gibt es kein
   * Darüberfahren, ein Tooltip wäre dort nicht erreichbar.
   */
  it("öffnet die Rechnung auf einen Klick", () => {
    const score = zeichneAbzeichen(KENNENLERNBOGEN);
    fireEvent.click(screen.getByTestId("vorab-score-abzeichen"));
    const liste = screen.getByTestId("vorab-score-aufschluesselung");
    expect(liste).toHaveTextContent(`${score.rohPunkte} von ${score.maxPunkte} erreichbaren Punkten`);
    for (const posten of score.posten) {
      expect(liste).toHaveTextContent(posten.label);
    }
  });

  it("nennt den stärksten Posten mit denselben Punkten wie die Aufschlüsselung", () => {
    const score = zeichneAbzeichen(KENNENLERNBOGEN);
    fireEvent.click(screen.getByTestId("vorab-score-abzeichen"));
    const { stark } = vorabSchwerpunkte(score);
    expect(stark).not.toBeNull();
    expect(
      screen.getByText(new RegExp(`${stark!.label}.*${stark!.punkte} von ${stark!.maxPunkte}`)),
    ).toBeInTheDocument();
  });
});
