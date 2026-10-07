/**
 * Die Karte, die die Angaben aus Steuerrechner und Analysetool zeigt.
 *
 * Der Anlass ist ein Befund: Das Analysetool legt seinen `analyseSnapshot`
 * seit jeher am Kontakt ab, und angezeigt wurde er nirgends. Diese Tests
 * halten fest, dass das jetzt anders ist, und zwar fuer BEIDE Werkzeuge.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RechnerAngaben, { hatRechnerAngaben } from "./RechnerAngaben";
import { berechne } from "@/lib/steuerRechner";
import { standardAntworten, zuEingaben } from "@/lib/steuerrechnerStrecke";

const ERGEBNIS = berechne(zuEingaben({ ...standardAntworten(), jahresbrutto: 85000 }));

/** So, wie `steuerrechnerLead.ts` den Schnappschuss ablegt. */
const STEUER = {
  erfasstAm: "2026-09-08T10:00:00.000Z",
  jahresbrutto: 85000,
  partnerBrutto: 0,
  steuerklasse: "I",
  beschaeftigung: "selbststaendig",
  beschaeftigungTitel: "Selbstständig",
  kinder: 0,
  bundesland: "by",
  kirchensteuer: false,
  bestehendeImmobilien: 0,
  startzeitpunkt: "sofort",
  zvE: Math.round(ERGEBNIS.zvE),
  grenzsteuersatz: 41.6,
  steuerlastHeute: Math.round(ERGEBNIS.vorher.summe),
  ersparnisJahrVon: Math.round(ERGEBNIS.spanne.jahr1.von),
  ersparnisJahrBis: Math.round(ERGEBNIS.spanne.jahr1.bis),
  ersparnis10JVon: Math.round(ERGEBNIS.spanne.zehnJahre.von),
  ersparnis10JBis: Math.round(ERGEBNIS.spanne.zehnJahre.bis),
  erhaltungEinmalig: Math.round(ERGEBNIS.spanne.erhaltung.ersparnisEinmalig),
  objektpreis: ERGEBNIS.spanne.objekt.preis,
};

/**
 * Betrag so, wie ihn die Suche der Testing Library sieht: Sie fasst jede Art
 * von Leerzeichen zu einem gewoehnlichen zusammen, Intl setzt vor das
 * Eurozeichen aber ein schmales geschuetztes.
 */
const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
    .format(Math.round(n))
    .replace(/\s/g, " ");

/**
 * Rendert und klappt beide Bloecke auf.
 *
 * Die Karte steht in den Stammdaten, und dort sucht jemand die Telefonnummer.
 * Deshalb sind die Bloecke zugeklappt. Wer die Zahlen pruefen will, muss also
 * erst aufklappen, und genau das tut dieser Helfer.
 */
function zeigeAlles(ui: React.ReactElement) {
  const ergebnis = render(ui);
  for (const knopf of screen.queryAllByRole("button")) fireEvent.click(knopf);
  return ergebnis;
}

describe("Zugeklappt, aber nicht stumm", () => {
  it("zeigt schon zugeklappt, woran sich das Aufklappen entscheidet", () => {
    render(<RechnerAngaben meta={{ steuerSnapshot: STEUER }} erstelltAm="2026-09-01" />);
    expect(screen.getByText("Steuerrechner")).toBeTruthy();
    // Textknoten mit schmalem geschuetztem Leerzeichen, deshalb ein Matcher.
    expect(
      screen.getByText((t) => t.replace(/\s/g, " ").includes(`${eur(85000)} brutto`)),
    ).toBeTruthy();
    // Der Inhalt selbst bleibt weg, bis jemand aufklappt.
    expect(screen.queryByText("Selbstständig")).toBeNull();
  });

  it("gibt den Inhalt frei, sobald aufgeklappt wird", () => {
    render(<RechnerAngaben meta={{ steuerSnapshot: STEUER }} erstelltAm="2026-09-01" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Selbstständig")).toBeTruthy();
  });
});

describe("Wann die Karte ueberhaupt erscheint", () => {
  it("bleibt ohne Angaben vollstaendig weg, statt leer dazustehen", () => {
    const { container } = render(<RechnerAngaben meta={{}} erstelltAm="2026-09-01" />);
    expect(container.firstChild).toBeNull();
    expect(hatRechnerAngaben({})).toBe(false);
    expect(hatRechnerAngaben(null)).toBe(false);
  });

  it("erscheint, sobald einer der beiden Schnappschuesse da ist", () => {
    expect(hatRechnerAngaben({ steuerSnapshot: STEUER })).toBe(true);
    expect(hatRechnerAngaben({ analyseSnapshot: { monthlyZuzahlung: 180 } })).toBe(true);
  });
});

describe("Die Angaben aus dem Steuerrechner", () => {
  it("zeigt, was der Interessent ausgefuellt hat", () => {
    zeigeAlles(<RechnerAngaben meta={{ steuerSnapshot: STEUER }} erstelltAm="2026-09-01" />);
    expect(screen.getByText("Steuerrechner")).toBeTruthy();
    expect(screen.getByText(eur(85000))).toBeTruthy();
    expect(screen.getByText("Selbstständig")).toBeTruthy();
    expect(screen.getByText("Bayern")).toBeTruthy();
    expect(screen.getByText("So bald wie möglich")).toBeTruthy();
    expect(screen.getByText("Keine, Erstinvestor")).toBeTruthy();
  });

  it("zeigt die Ersparnis als Spanne, genau wie der Rechner sie gezeigt hat", () => {
    zeigeAlles(<RechnerAngaben meta={{ steuerSnapshot: STEUER }} />);
    expect(
      screen.getByText(`${eur(STEUER.ersparnisJahrVon)} bis ${eur(STEUER.ersparnisJahrBis)}`),
    ).toBeTruthy();
    expect(
      screen.getByText(`${eur(STEUER.ersparnis10JVon)} bis ${eur(STEUER.ersparnis10JBis)}`),
    ).toBeTruthy();
  });

  it("nennt das Datum, damit niemand alte Zahlen fuer aktuell haelt", () => {
    zeigeAlles(<RechnerAngaben meta={{ steuerSnapshot: STEUER }} erstelltAm="2026-09-01" />);
    expect(screen.getByText(/Ausgefüllt am 08\.09\.2026/)).toBeTruthy();
  });

  it("faellt auf das Anlagedatum zurueck und sagt, dass es das ist", () => {
    const ohneDatum = { ...STEUER, erfasstAm: undefined };
    zeigeAlles(<RechnerAngaben meta={{ steuerSnapshot: ohneDatum }} erstelltAm="2026-09-01" />);
    expect(screen.getByText(/Kontakt angelegt am 01\.09\.2026/)).toBeTruthy();
  });

  it("liest auch die fruehere Fassung ohne Spanne, damit Bestandskontakte nicht leer bleiben", () => {
    zeigeAlles(
      <RechnerAngaben
        meta={{
          steuerSnapshot: {
            jahresbrutto: 85000,
            steuerklasse: "I",
            ersparnisJahr: 8218,
            ersparnis10J: 41090,
            vermoegenszuwachs: 120000,
          },
        }}
      />,
    );
    expect(screen.getByText(eur(8218))).toBeTruthy();
    expect(screen.getByText(eur(41090))).toBeTruthy();
  });
});

describe("Die Angaben aus dem Analysetool", () => {
  it("zeigt den Schnappschuss, der bisher nirgends zu sehen war", () => {
    zeigeAlles(
      <RechnerAngaben
        meta={{
          analyseSnapshot: { monthlyZuzahlung: 180, wealthAfter10Years: 145000 },
          analyseScore: 72,
          analyseNachricht: "Bitte abends anrufen.",
        }}
        erstelltAm="2026-09-01"
      />,
    );
    expect(screen.getByText("Analysetool")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText(eur(180))).toBeTruthy();
    expect(screen.getByText(eur(145000))).toBeTruthy();
    expect(screen.getByText("Bitte abends anrufen.")).toBeTruthy();
  });

  it("steht neben dem Steuerrechner, wenn der Kontakt aus beiden Wegen kommt", () => {
    zeigeAlles(
      <RechnerAngaben
        meta={{ steuerSnapshot: STEUER, analyseSnapshot: { monthlyZuzahlung: 180 } }}
      />,
    );
    expect(screen.getByText("Steuerrechner")).toBeTruthy();
    expect(screen.getByText("Analysetool")).toBeTruthy();
  });
});

describe("Was die Karte nicht behauptet", () => {
  it("sagt dazu, dass es eine Modellrechnung ist und wofuer das obere Ende steht", () => {
    zeigeAlles(<RechnerAngaben meta={{ steuerSnapshot: STEUER }} />);
    expect(screen.getByText(/keine Steuerberatung/)).toBeTruthy();
    expect(screen.getByText(/Gutachten zur Restnutzungsdauer/)).toBeTruthy();
  });
});
