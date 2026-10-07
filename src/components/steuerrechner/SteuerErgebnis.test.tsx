/**
 * Die Ergebnisseite.
 *
 * Zwei Vorgaben stehen hier auf dem Pruefstand, beide kaufmaennisch:
 *
 *   1  Es steht eine SPANNE da und keine Punktzahl, und wo das obere Ende
 *      steht, steht auch die Voraussetzung dafuer. Sonst verkauft der Rechner
 *      eine Zahl, die im Gespraech nicht haelt.
 *   2  Es faellt KEIN Immobilientyp. Der Rechner legt sich nicht fest, und die
 *      typisierte Annahme steht offen im Kleingedruckten.
 *
 * Dazu die eindeutige Anfrageaktion und aufklappbare Modellannahmen.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SteuerErgebnis from "./SteuerErgebnis";
import { berechne } from "@/lib/steuerRechner";
import { standardAntworten, zuEingaben, type SteuerAntworten } from "@/lib/steuerrechnerStrecke";

/* Recharts misst den Platz im Browser und zeichnet in jsdom sonst nichts.
   Fuer diese Tests genuegt ein Platzhalter, geprueft wird die Umgebung. */
vi.mock("recharts", async () => {
  const echt = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...echt,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const ANTWORTEN: SteuerAntworten = {
  ...standardAntworten(),
  jahresbrutto: 85000,
  beschaeftigung: "angestellt",
  startzeitpunkt: "sofort",
};

const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
    .format(Math.round(n))
    .replace(/\s/g, " ");

function zeige(antworten: SteuerAntworten = ANTWORTEN) {
  return render(
    <SteuerErgebnis
      antworten={antworten}
      aendern={() => {}}
      erstmalig={false}
      onHandlung={() => {}}
    />,
  );
}

describe("Die Spanne statt einer Punktzahl", () => {
  it("zeigt beide Enden der Jahresspanne, so wie der Kern sie rechnet", () => {
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    zeige();
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toContain(eur(s.jahr1.von));
    expect(text).toContain(eur(s.jahr1.bis));
    expect(text).toContain(eur(s.zehnJahre.von));
    expect(text).toContain(eur(s.zehnJahre.bis));
  });

  /*
   * Die Ergebniskarte fuehrt seit dem 17.09.2026 mit ZWEI Groessen statt mit
   * einer Spanne: der Steuerersparnis und dem Vermoegensaufbau. Das ist der
   * Sinn der Seite, und diese Tests halten es fest.
   */
  it("stellt Steuerersparnis und Vermoegensaufbau gleichrangig nach oben", () => {
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    zeige();
    expect(screen.getAllByText("Deine Steuerersparnis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dein Vermögensaufbau").length).toBeGreaterThan(0);
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toContain(eur(s.vermoegen.aufbau));
    expect(text).toContain(eur(s.vermoegen.tilgung));
    expect(text).toContain(eur(s.vermoegen.wertsteigerung));
  });

  it("haelt Vermoegensaufbau und Liquiditaet auseinander, statt sie zu verrechnen", () => {
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    zeige();
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    // Der Aufbau ist Eigentum, die Liquiditaet ist Geldfluss, das Netto ist
    // beides zusammen mit dem Einsatz. Alle drei stehen einzeln da.
    expect(text).toContain(eur(s.vermoegen.aufbau));
    expect(text).toContain(eur(Math.abs(s.vermoegen.liquiditaet)));
    expect(text).toContain(eur(s.vermoegen.netto));
    expect(s.vermoegen.netto).toBeLessThan(s.vermoegen.aufbau);
  });

  it("nennt die monatliche Zuzahlung oben und nicht erst im Kleingedruckten", () => {
    // Das war der schwerste Befund: Die Seite wies an einer Stelle eine
    // monatliche Zuzahlung aus und zwei Karten weiter eine frei verfuegbare
    // Liquiditaet mit umgekehrtem Vorzeichen. Beides kommt jetzt aus einer
    // Rechnung, und das unangenehme Vorzeichen steht sichtbar oben.
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    zeige();
    expect(screen.getByText("Du zahlst monatlich zu")).toBeTruthy();
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toContain(eur(Math.abs(s.plan[0].cashflowNachSteuer / 12)));
    expect(s.plan[0].cashflowNachSteuer).toBeLessThan(0);
    expect(s.vermoegen.liquiditaet).toBeLessThan(0);
  });

  it("nennt den einmaligen Erhaltungsaufwand als Hoechstwert, nicht als Zusage", () => {
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    zeige();
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toContain(`bis zu ${eur(s.erhaltung.ersparnisEinmalig)}`);
    expect(text).toMatch(/einmalig im ersten Jahr/);
  });

  it("sagt bei der Spanne dazu, wodurch das obere Ende erreichbar wird", () => {
    zeige();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Gutachten/);
    expect(text).toMatch(/Nutzungsdauer/);
    // Das Finanzamt entscheidet im Einzelfall, der Nachweis ist keine
    // Formsache. Ohne diesen Hinweis liest sich der hoehere Satz wie eine
    // Zusage.
    expect(text).toMatch(/Einzelfall/);
  });

  it("nennt die gesetzlich unterstellte Nutzungsdauer als Bezugspunkt", () => {
    /*
     * Der Massstab ist das Gesetz: Zwei Prozent nach § 7 Abs. 4 Satz 1
     * Nr. 2 b EStG entsprechen 50 Jahren, und § 7 Abs. 4 Satz 2 EStG nennt
     * diese Zahl selbst. Bis zum 17.09.2026 stand hier stattdessen die
     * Restnutzungsdauer nach dem Modell der ImmoWertV, also 44 Jahre. Die
     * stammt aus der Verkehrswertermittlung und ist steuerlich kein Massstab.
     */
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    zeige();
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(s.nutzungsdauerGesetzlich).toBe(50);
    expect(text).toContain("50 Jahren");
    expect(text).toMatch(/§ 7 Abs. 4 Satz 2 EStG/);
    // Die alte, verkehrt herum aufgezogene Aussage darf nicht zurueckkommen.
    expect(text).not.toContain("44 Jahre");
    expect(text).not.toContain("22.02.2023");
  });

  it("fuehrt die drei Posten auf, aus denen die Spanne entsteht", () => {
    zeige();
    // Beide Wege stehen zweimal da: als Posten und als Balken im Vergleich.
    /* Seit dem 17.09.2026 fuehrt die Seite mit dem ANGESETZTEN Satz, und der
       gesetzliche steht als abgesicherte Untergrenze daneben. Beide muessen da
       sein, und zwar so beschriftet, dass klar ist, welcher woran haengt. */
    expect(
      screen.getAllByText("Angesetzte Abschreibung, mit Gutachten").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Gesetzliche Abschreibung, ohne Nachweis").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Damit rechnet diese Seite")).toBeTruthy();
    expect(screen.getByText("Abgesicherte Untergrenze")).toBeTruthy();
    expect(screen.getByText("Erhaltungsaufwand")).toBeTruthy();
  });
});

describe("Kein Immobilientyp mehr", () => {
  it("nennt weder Neubau noch Bestand noch WG", () => {
    zeige();
    const text = document.body.textContent ?? "";
    for (const typ of ["Neubau", "Sanierter Bestand", "WG- & Co-Living"]) {
      expect(text).not.toContain(typ);
    }
  });

  it("legt die typisierte Annahme stattdessen offen", () => {
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    zeige();
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toMatch(/Das Objekt ist typisiert/);
    expect(text).toContain(eur(s.objekt.preis));
    expect(text).toContain(eur(s.objekt.gebaeudewert));
  });

  it("zeigt dieselbe Spanne, egal welches Beschaeftigungsverhaeltnis angegeben ist", () => {
    // Vorher fiel die Zahl bei 85.000 Euro von 8.218 auf 719 Euro, sobald
    // jemand selbststaendig ankreuzte. Die Zielgruppe des Hauses sind aber
    // ausdruecklich Unternehmer, Aerzte und Selbststaendige.
    const s = berechne(zuEingaben(ANTWORTEN)).spanne;
    const { unmount } = zeige({ ...ANTWORTEN, beschaeftigung: "selbststaendig" });
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toContain(eur(s.jahr1.von));
    expect(text).toContain(eur(s.jahr1.bis));
    unmount();
  });

  it("erklaert das Beschaeftigungsverhaeltnis als Frage der Finanzierung", () => {
    zeige();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Für die Steuer nichts/);
    expect(text).toMatch(/Eigenkapital/);
  });
});

describe("Der Aufbau von oben nach unten", () => {
  it("bietet eine eindeutige Anfrageaktion und zugaengliche Modellannahmen", () => {
    const anfordern = vi.fn();
    render(<SteuerErgebnis antworten={ANTWORTEN} aendern={() => {}} erstmalig={false} onHandlung={anfordern} />);
    const knopf = screen.getByRole("button", { name: "Persönliche Auswertung anfordern" });
    fireEvent.click(knopf);
    expect(anfordern).toHaveBeenCalledOnce();
    const annahmen = screen.getByText("Annahmen und Grenzen dieser Rechnung").closest("details");
    expect(annahmen).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Annahmen und Grenzen dieser Rechnung"));
    expect(annahmen).toHaveAttribute("open");
  });

  it("laesst die Eingaben als anklickbare Zusammenfassung stehen", () => {
    zeige();
    expect(screen.getByRole("button", { name: /85.000/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Klasse I/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Keine Kinder/ })).toBeTruthy();
  });

  it("haelt den Haftungshinweis sichtbar an der Seite", () => {
    zeige();
    expect(screen.getByText(/Modellrechnung und keine Steuerberatung/)).toBeTruthy();
  });
});
