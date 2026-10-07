import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { KennenlernenAntworten } from "@/lib/bewerberKennenlernen";

/**
 * Die Adresse /closing-praesentation-entwurf und das alte Deck dahinter.
 *
 * Bis zum 23.09.2026 stand unter dieser Adresse eine Weiche: ohne Parameter
 * die alte Closing-Präsentation mit 22 Folien, mit `ablauf=neu` die
 * Präsentation des Videocalls. Seitdem zeigt sie immer den Videocall mit den
 * fünf Wegen (`BewerberVideocallPraesentation.tsx`), für Bewerber im alten
 * wie im neuen Ablauf. Geprüft wird der Wortlaut von `App.tsx` und die Seite
 * unter jeder Form von Link, die noch in offenen Tabs stecken kann.
 *
 * Das alte Deck selbst gibt es weiter, aber nur noch in der Übung unter
 * /praesentation-uebung. Die holt sich aus `ClosingPraesentationEntwurf.tsx`
 * die Bühne und die Folien, ohne Bewerber. Genau so zeichnet der zweite Teil
 * dieser Datei das Deck: Jede Folie soll einmal mounten (ein Laufzeitfehler
 * soll hier auffliegen und nicht im Termin), und die Inhalte, die die
 * HR-Managerin übt, sollen stimmen.
 */

// jsdom bringt hier keinen localStorage mit, der Gesprächsstand liest daraus.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

/** Ein Bewerber aus dem alten Ablauf: kein Kennzeichen `prozess`. */
const BEWERBER = {
  id: "b-1",
  vorname: "Max",
  nachname: "Mustermann",
  erstgespraechSkript: {},
};

vi.mock("@/lib/bewerbungStore", () => ({
  getBewerberById: (id: string) => (id === "b-1" ? BEWERBER : undefined),
  updateBewerber: vi.fn(() => Promise.resolve()),
  changeBewerberStatus: vi.fn(),
}));

vi.mock("@/lib/dataCache", () => ({
  isTableLoaded: () => true,
  onCacheChange: () => () => { /* nichts */ },
}));

/** Ein ausgefüllter Kennenlernbogen auf Weg 1. */
const ANTWORTEN: KennenlernenAntworten = {
  weg: "weg1",
  hintergrund: ["beratung"],
  wegAntwort1: "4_bis_10",
  wegAntwort2: ["objektsuche", "unterlagen"],
  passung: ["selbststaendig", "variabel"],
  verstaendnisFixum: "nein",
  verstaendnisProvision: "nein",
  zeitProWoche: "10_bis_20",
  perspektive: "spaeter_haupt",
  leadPraeferenz: "eigen",
  startzeitpunkt: "vier_wochen",
  gewerbe: "ja",
  erlaubnis34c: "nein",
  themen: ["verdienst", "leads"],
  eigeneFrage: "Wie schnell bekomme ich ein Objekt?",
};

vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const glied of ["select", "eq", "order"]) kette[glied] = () => kette;
  kette.limit = () => Promise.resolve({
    data: [{ status: "eingereicht", antworten: ANTWORTEN, created_at: "2026-09-01" }],
    error: null,
  });
  return { supabase: { from: () => ({ ...kette }) } };
});

// Erst nach den Attrappen laden, sonst greifen sie nicht.
const { default: BewerberVideocallPraesentation } = await import("./BewerberVideocallPraesentation");
const { Buehne, baueFolien, useFolienKontext } = await import("./ClosingPraesentationEntwurf");
const { videocallFolien } = await import("@/lib/bewerberVideocall");
const { CLOSING_KENNZAHLEN_GEPFLEGT } = await import("@/lib/closingPraesentationZahlen");
const { PARTNERSTIMMEN } = await import("@/lib/partnerstimmen");
const { ASSESSMENT_EINWAENDE, ASSESSMENT_PFADE } = await import("@/lib/assessmentSkript");
const { ERSTGESPRAECH_FOLIEN } = await import("@/lib/erstgespraechFolien");

beforeAll(() => {
  class ResizeObserverAttrappe {
    observe() { /* nichts */ }
    unobserve() { /* nichts */ }
    disconnect() { /* nichts */ }
  }
  if (!("ResizeObserver" in window)) {
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: ResizeObserverAttrappe,
    });
  }
});

const APP_TSX = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const APP_EINZEILIG = APP_TSX.replace(/\s+/g, " ");

/* ══════════════════════════════════════════════════════════════
   Die Adresse
   ══════════════════════════════════════════════════════════════ */

function zeichneAdresse(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="/closing-praesentation-entwurf" element={<BewerberVideocallPraesentation />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/closing-praesentation-entwurf in App.tsx", () => {
  it("zeigt direkt auf die Präsentation des Videocalls, hinter dem PraesentationGuard", () => {
    expect(APP_EINZEILIG).toContain(
      '<Route path="/closing-praesentation-entwurf" element={<PraesentationGuard nurBewerberprozess><BewerberVideocallPraesentation /></PraesentationGuard>} />',
    );
    expect(APP_TSX).toContain('import("./pages/BewerberVideocallPraesentation")');
  });

  it("lädt das alte Deck nicht mehr als Route", () => {
    expect(APP_TSX).not.toContain('import("./pages/ClosingPraesentationEntwurf")');
    expect(APP_TSX).not.toContain("<ClosingPraesentationEntwurf");
  });
});

describe("/closing-praesentation-entwurf zeigt immer den Videocall", () => {
  const erste = videocallFolien(ANTWORTEN)[0];

  for (const [fall, adresse] of [
    ["ohne ablauf", "/closing-praesentation-entwurf?bewerberId=b-1&name=Max%20Mustermann&teil=1"],
    ["mit dem alten ablauf=neu", "/closing-praesentation-entwurf?bewerberId=b-1&teil=1&ablauf=neu"],
    ["mit teil=2 aus der Zeit der zwei Teile", "/closing-praesentation-entwurf?bewerberId=b-1&teil=2"],
  ] as const) {
    it(fall, async () => {
      zeichneAdresse(adresse);
      expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(erste.titel);
      // Nichts vom alten Deck: weder sein Deckblatt noch der Auftakt von Teil 2.
      expect(screen.queryByText(/Schön, dass es klappt/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Heute wird es konkret/)).not.toBeInTheDocument();
    });
  }

  it("ganz ohne Parameter gibt es einen ruhigen Hinweis statt eines Absturzes", async () => {
    zeichneAdresse("/closing-praesentation-entwurf");
    expect(await screen.findByText(/noch keine Einladung zum Kennenlernen verschickt/)).toBeInTheDocument();
  });
});

/* ══════════════════════════════════════════════════════════════
   Das alte Deck als Baustein der Übung
   ══════════════════════════════════════════════════════════════ */

/** Das Deck so, wie die Übung es zeichnet: ohne Bewerber, mit Bühne und Fußleiste. */
function DeckDerUebung({ teil }: { teil: 1 | 2 }) {
  const ctx = useFolienKontext(null, "");
  const folien = baueFolien(teil, ctx);
  const [aktiv, setAktiv] = useState(0);
  return (
    <Buehne
      folien={folien}
      aktiv={aktiv}
      onGeheZu={(i) => setAktiv(Math.min(Math.max(i, 0), folien.length - 1))}
    />
  );
}

const zeichneDeck = (teil: 1 | 2) => render(<DeckDerUebung teil={teil} />);

const TEIL_1 = 7;
/** Teil 2: 14 feste Folien plus die zwei, die sich selbst ausblenden. */
const TEIL_2 =
  14 + (PARTNERSTIMMEN.length > 0 ? 1 : 0) + (CLOSING_KENNZAHLEN_GEPFLEGT.length > 0 ? 1 : 0);
const GESAMT = TEIL_1 + TEIL_2;

const weiter = () => fireEvent.click(screen.getByRole("button", { name: "Nächste Folie" }));

describe("Altes Deck in der Übung: nur Teil 2", () => {
  it("startet mit dem Cover von Teil 2 und zählt 1 / 15", () => {
    zeichneDeck(2);
    expect(screen.getByRole("heading", { name: /Heute wird es konkret/ })).toBeInTheDocument();
    expect(screen.getByText(`Folie 1 / ${TEIL_2}`)).toBeInTheDocument();
    expect(screen.getByText(/Wir haben uns kennengelernt\. Jetzt siehst du im Detail/)).toBeInTheDocument();
    // Ohne Teil-Präfix in der Kopfzeile.
    expect(screen.getByText("Identifikation")).toBeInTheDocument();
    expect(screen.queryByText(/Teil 2 · Identifikation/)).not.toBeInTheDocument();
  });

  it("hat die Teil-1-Folien nicht im Deck, auch nicht per Zurück", () => {
    zeichneDeck(2);
    for (const f of ERSTGESPRAECH_FOLIEN) {
      expect(screen.queryByLabelText(new RegExp(`Folie \\d+: ${f.folie.kopfzeile}`))).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Vorherige Folie" })).toBeDisabled();
    expect(screen.getByText(`Folie 1 / ${TEIL_2}`)).toBeInTheDocument();
  });

  it("schaltet jede Folie von Teil 2 einmal durch, ohne abzustürzen", () => {
    zeichneDeck(2);
    for (let i = 1; i < TEIL_2; i++) {
      weiter();
      expect(screen.getByText(`Folie ${i + 1} / ${TEIL_2}`)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /Partnerschaft starten/ })).toBeInTheDocument();
  });

  it("hat die zusammengelegten und gestrichenen Folien nicht mehr", () => {
    zeichneDeck(2);
    for (const weg of [/Das Betriebssystem/, /Unsere Mission/, /Warum OS Immobilien/, /Produktwelten/,
      /Vom Profil zum Investment/, /Der Preis des Wartens/, /Dein eigener Leadkanal/,
      /Die große Vision/, /Der OS Immobilien Partner/, /Ehrlich gefragt/]) {
      expect(screen.queryByLabelText(weg)).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText(/Du machst Vertrieb, wir den Rest/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Vom Kunden zur Provision/)).toBeInTheDocument();
  });

  it("zeigt auf der System-Folie die Ersparnis je Baustein, ohne Klick", () => {
    zeichneDeck(2);
    fireEvent.click(screen.getByLabelText(/Das OS Immobilien System/));
    expect(screen.getAllByText(/^Spart dir:/)).toHaveLength(8);
    expect(screen.getByText(/Spart dir: teure Software-Lizenzen und Entwicklungskosten/)).toBeInTheDocument();
    expect(screen.getByText(/Spart dir: den Start bei null/)).toBeInTheDocument();
  });

  it("zeigt auf der Produkte-Folie die Zielgruppe vor den drei Objekttypen", () => {
    zeichneDeck(2);
    fireEvent.click(screen.getByLabelText(/Produkte und Standorte/));
    expect(screen.getByText("Für wen wir arbeiten")).toBeInTheDocument();
    expect(screen.getByText(/Unternehmer, Ärzte und High Experts/)).toBeInTheDocument();
    expect(screen.getByText("Sanierter Bestand")).toBeInTheDocument();
    expect(screen.getByText("WG/Co-Living-Konzept")).toBeInTheDocument();
  });

  it("rechnet auf der Preisfolie mit dem Kaufpreis aus dem Rechner", () => {
    zeichneDeck(2);
    fireEvent.click(screen.getByLabelText(/Was es kostet/));
    // Standardwert des Reglers: 300.000 € bei 4 % ergibt 12.000 €.
    expect(screen.getByText(/Ein einziger Abschluss bei 300\.000 € bringt dir/)).toBeInTheDocument();
    expect(screen.getByText("12.000 €")).toBeInTheDocument();
    // Seit dem 07.09.2026 gibt es kein laufendes Entgelt mehr.
    expect(screen.queryByText(/1\.800 € im Jahr/)).not.toBeInTheDocument();
    expect(screen.getByText(/Kein laufendes Entgelt, keine Mindestlaufzeit/)).toBeInTheDocument();
    expect(screen.getByText(/zwei bis drei Monate/)).toBeInTheDocument();
  });

  it("hat die Einwandfolie in Teil 2 nicht", () => {
    zeichneDeck(2);
    expect(screen.queryByLabelText(/Ehrlich gefragt/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Deine Fragen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Was ist mit den Kunden, die ich selbst mitbringe\?/)).not.toBeInTheDocument();
  });

  it("zeigt die gegenseitige Erwartung statt der Häkchen zum Abhaken", () => {
    zeichneDeck(2);
    fireEvent.click(screen.getByLabelText(/Passt das zu dir/));
    expect(screen.getByText(/Was wir von dir erwarten/)).toBeInTheDocument();
    expect(screen.getByText(/Was du von uns bekommst/)).toBeInTheDocument();
    expect(screen.queryByText(/Du bist ambitioniert/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sechsmal Ja/)).not.toBeInTheDocument();
    expect(screen.getByText(/Was du daraus machst, liegt bei dir/)).toBeInTheDocument();
  });

  it("nennt Gewerbe und Paragraf 34c auf der Startfolie", () => {
    zeichneDeck(2);
    fireEvent.click(screen.getByLabelText(/Dein Start/));
    expect(screen.getByText(/Gewerbeerlaubnis nach Paragraf 34c/)).toBeInTheDocument();
    expect(screen.getByText(/Vertrag kommt digital zur Unterschrift/)).toBeInTheDocument();
    expect(screen.getByText(/Deine eigene OS Immobilien E-Mail-Adresse/)).toBeInTheDocument();
  });
});

describe("Altes Deck in der Übung: das ganze Deck ab Teil 1", () => {
  it("startet mit dem Deckblatt des Gesamtdecks und zählt 1 / 22", () => {
    zeichneDeck(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Schön, dass es klappt.");
    expect(screen.getByText(`Folie 1 / ${GESAMT}`)).toBeInTheDocument();
    expect(screen.getByText("Teil 1 · Kennenlernen")).toBeInTheDocument();
    expect(screen.getByText("Teil 1 · Über dich")).toBeInTheDocument();
    expect(screen.getByText("Teil 2 · Über uns")).toBeInTheDocument();
  });

  it("hat die sieben Teil-1-Folien aus dem Skript in der Punkte-Navigation, Station 9 und 10 nicht", () => {
    zeichneDeck(1);
    const labels = screen.getAllByRole("button", { name: /^Folie \d+:/ }).map((b) => b.getAttribute("aria-label"));
    expect(labels).toHaveLength(GESAMT);
    expect(labels.slice(0, TEIL_1)).toEqual(
      ERSTGESPRAECH_FOLIEN.map((f, i) => `Folie ${i + 1}: ${f.folie.kopfzeile}`),
    );
    expect(labels[TEIL_1]).toBe(`Folie ${TEIL_1 + 1}: Persönliches Gespräch`);
    expect(labels.join(" ")).not.toMatch(/Einschätzung|Nächster Schritt und Verabschiedung/);
  });

  it("schaltet alle 22 Folien einmal durch, nach Folie 7 kommt der Auftakt von Teil 2", () => {
    zeichneDeck(1);
    for (let i = 1; i < GESAMT; i++) {
      weiter();
      expect(screen.getByText(`Folie ${i + 1} / ${GESAMT}`)).toBeInTheDocument();
      if (i === TEIL_1) {
        expect(screen.getByRole("heading", { name: /Heute wird es konkret/ })).toBeInTheDocument();
        expect(screen.getByText("Teil 2 · Identifikation")).toBeInTheDocument();
      }
    }
    expect(screen.getByRole("button", { name: /Partnerschaft starten/ })).toBeInTheDocument();
    // Und zurück aufs Deckblatt, Teil 1 bleibt erreichbar.
    fireEvent.click(screen.getByLabelText(`Folie 1: ${ERSTGESPRAECH_FOLIEN[0].folie.kopfzeile}`));
    expect(screen.getByText(`Folie 1 / ${GESAMT}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Schön, dass es klappt/ })).toBeInTheDocument();
  });

  it("die Profil-Folie zeigt die vier Pfade aus dem Skript", () => {
    zeichneDeck(1);
    fireEvent.click(screen.getByLabelText(/Profil-Einordnung/));
    expect(screen.getByRole("heading", { name: /Wo kommst du her/ })).toBeInTheDocument();
    for (const p of ASSESSMENT_PFADE) {
      expect(screen.getByText(p.label)).toBeInTheDocument();
    }
    expect(screen.getByText("Pfad D")).toBeInTheDocument();
    expect(screen.getByText("Erfolgshunger")).toBeInTheDocument();
  });

  it("die Machbarkeits-Folie nennt Handelsvertreter, Gewerbe und 34c ohne Provision", () => {
    zeichneDeck(1);
    fireEvent.click(screen.getByLabelText(/Machbarkeit/));
    expect(screen.getByText("Freier Handelsvertreter")).toBeInTheDocument();
    expect(screen.getByText("Eigenes Gewerbe")).toBeInTheDocument();
    expect(screen.getByText("Erlaubnis nach Paragraf 34c")).toBeInTheDocument();
    expect(screen.queryByText(/Lehnt ab/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Prozent|%/)).not.toBeInTheDocument();
  });

  it("die letzte Teil-1-Folie zeigt die Einwände aus dem Skript und die Überleitung", () => {
    zeichneDeck(1);
    fireEvent.click(screen.getByLabelText(/Deine Fragen/));
    for (const e of ASSESSMENT_EINWAENDE) {
      expect(screen.getByText(e.einwand)).toBeInTheDocument();
    }
    expect(screen.getByText(/Jetzt zeige ich dir, wie das bei uns/)).toBeInTheDocument();
    // Keine Weiche auf der Folie: der Bewerber wählt nichts.
    expect(screen.queryByRole("button", { name: /Termin|direkt/i })).not.toBeInTheDocument();
  });

  it("zeigt in Teil 1 keine Sprechtexte, keine Regie und keinen Score", () => {
    zeichneDeck(1);
    for (let i = 0; i < TEIL_1; i++) {
      expect(screen.queryByText(/Regie:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Punkten/)).not.toBeInTheDocument();
      expect(screen.queryByText(/hier ist .* von OS Immobilien/)).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      weiter();
    }
  });
});
