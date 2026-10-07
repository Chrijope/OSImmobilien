import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KapitelAbschluss } from "./KapitelAbschluss";
import type { AkademieKapitel } from "@/lib/vertriebsakademieContent";
import type { GlobalStats, KapitelStats } from "@/lib/vertriebsakademieProgress";

const kap = {
  slug: "erstgespraech", nummer: "4", titel: "Erstgespräch", kicker: "Der erste Termin",
  teaser: "Wie der erste Termin läuft.", ziel: "Du führst ein Erstgespräch sicher zum Folgetermin.",
  icon: "phone", sections: [],
} as unknown as AkademieKapitel;

const naechstes = {
  slug: "beratungsgespraech", nummer: "5", titel: "Beratungsgespräch", kicker: "Der zweite Termin",
  teaser: "Die Präsentation von vorne bis hinten.",
  ziel: "Du führst die Beratungspräsentation frei und kommst zur Selbstauskunft.",
  icon: "presentation", sections: [],
} as unknown as AkademieKapitel;

const stats: KapitelStats = {
  slug: "erstgespraech", totalChecks: 4, doneChecks: 4, totalUebungen: 2, doneUebungen: 2,
  totalAufgaben: 10, doneAufgaben: 7, totalLektionen: 6, doneLektionen: 4,
  isDone: false, pct: 62, xp: 140, punkte: 70,
};

const gesamt: GlobalStats = {
  totalXp: 900, totalKapitel: 19, doneKapitel: 4, totalUebungen: 40, doneUebungen: 20,
  totalChecks: 90, doneChecks: 50, totalAufgaben: 250, doneAufgaben: 120,
  totalLektionen: 120, doneLektionen: 60, punkte: 1200, overallPct: 43,
};

function zeige(p: Partial<Parameters<typeof KapitelAbschluss>[0]> = {}) {
  return render(
    <MemoryRouter>
      <KapitelAbschluss
        kap={kap}
        stats={stats}
        gesamt={gesamt}
        next={naechstes}
        kapitelDone={false}
        testBestanden={false}
        zielgruppe="alle"
        {...p}
      />
    </MemoryRouter>,
  );
}

describe("Kapitelübergang, solange das Kapitel offen ist", () => {
  it("lobt nicht, sondern benennt, was noch fehlt", () => {
    zeige();
    expect(screen.getByText("In diesem Kapitel ist noch offen")).toBeInTheDocument();
    expect(screen.getByText("2 von 6 Lektionen")).toBeInTheDocument();
    expect(screen.getByText("3 von 10 Aufgaben")).toBeInTheDocument();
    expect(screen.getByText("der Abschlusstest")).toBeInTheDocument();
    expect(screen.queryByText(/steht$/)).toBeNull();
  });

  it("verschweigt den Abschlusstest, wenn das Kapitel keinen hat", () => {
    zeige({ testBestanden: undefined });
    expect(screen.queryByText("der Abschlusstest")).toBeNull();
  });
});

describe("Kapitelübergang nach dem Abschluss", () => {
  it("nennt das Erreichte und den Stand im Gesamtweg", () => {
    zeige({ kapitelDone: true, testBestanden: true });
    expect(screen.getByText("Kapitel 4 steht")).toBeInTheDocument();
    expect(screen.getByText(/Du führst ein Erstgespräch sicher zum Folgetermin/)).toBeInTheDocument();
    expect(screen.getByText("Abschlusstest bestanden")).toBeInTheDocument();
    expect(screen.getByText(/4 von 19 Kapiteln durch, noch 15 vor dir/)).toBeInTheDocument();
  });

  it("zeigt das nächste Kapitel mit seinem Lernziel und einem Weg dorthin", () => {
    zeige({ kapitelDone: true });
    expect(screen.getByText("Kapitel 5: Beratungsgespräch")).toBeInTheDocument();
    expect(
      screen.getByText(/Du führst die Beratungspräsentation frei und kommst zur Selbstauskunft/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kapitel 5 öffnen/ })).toHaveAttribute(
      "href",
      "/vertriebsakademie/beratungsgespraech",
    );
  });

  it("führt am Ende der Reihe zum Übungsplatz statt ins Leere", () => {
    zeige({ kapitelDone: true, next: undefined });
    expect(screen.getByText("Das war das letzte Kapitel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Zum Übungsplatz/ })).toHaveAttribute(
      "href",
      "/vertriebsakademie/training",
    );
  });
});

describe("Der Profi bekommt dasselbe Ziel, aber keine Rückschau", () => {
  it("lässt die Aufzählung des Erledigten weg", () => {
    zeige({ kapitelDone: true, testBestanden: true, zielgruppe: "profi" });
    expect(screen.getByText("Kapitel 4 steht")).toBeInTheDocument();
    expect(screen.queryByText("Abschlusstest bestanden")).toBeNull();
    expect(screen.queryByText(/Das kannst du jetzt/)).toBeNull();
  });

  it("behält den nächsten Schritt samt Lernziel", () => {
    zeige({ kapitelDone: true, zielgruppe: "profi" });
    expect(screen.getByText("Kapitel 5: Beratungsgespräch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kapitel 5 öffnen/ })).toBeInTheDocument();
  });
});
