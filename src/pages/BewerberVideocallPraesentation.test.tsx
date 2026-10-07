import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BewerberVideocallFolie } from "./BewerberVideocallPraesentation";
import { STRECKEN, videocallFolien } from "@/lib/bewerberVideocall";
import type { KennenlernenAntworten } from "@/lib/bewerberKennenlernen";

/**
 * Die reine Folienansicht, ohne Datenquelle.
 *
 * Sie soll jede Blockform aller fünf Strecken zeichnen können. Bisher hat ein
 * unbekannter Blocktyp die Folie still leer gelassen; dieser Durchlauf deckt
 * das auf, indem er jede Folie jeder Strecke einmal rendert.
 */
function bogen(patch: Partial<KennenlernenAntworten> = {}): KennenlernenAntworten {
  return {
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
    ...patch,
  };
}

describe("BewerberVideocallFolie", () => {
  it("zeichnet jede Folie jeder Strecke, auch mit allen angebotenen Modulen", () => {
    for (const strecke of STRECKEN) {
      const folien = videocallFolien(bogen({ weg: strecke.weg }), strecke.beiBedarf);
      expect(folien.length).toBeGreaterThan(0);
      for (const folie of folien) {
        const { unmount } = render(<BewerberVideocallFolie folie={folie} />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(folie.titel);
        expect(screen.getByText(new RegExp(folie.nummerText))).toBeInTheDocument();
        unmount();
      }
    }
  });

  it("die Begrüßung zeigt die markierten Themen und die eigene Frage", () => {
    const folie = videocallFolien(bogen())[0];
    render(<BewerberVideocallFolie folie={folie} />);
    expect(screen.getByText("Verdienst und Rechenwege")).toBeInTheDocument();
    expect(screen.getByText(/Wie schnell bekomme ich ein Objekt/)).toBeInTheDocument();
  });

  it("die Schlussfolie zeigt drei gleich große Türen", () => {
    const folien = videocallFolien(bogen());
    render(<BewerberVideocallFolie folie={folien[folien.length - 1]} />);
    expect(screen.getByText("Tür 1")).toBeInTheDocument();
    expect(screen.getByText("Tür 2")).toBeInTheDocument();
    expect(screen.getByText("Tür 3")).toBeInTheDocument();
  });
});
