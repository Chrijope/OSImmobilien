import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  WartetAufEntscheidungBadge,
  WartetAufEntscheidungGrund,
} from "./WartetAufEntscheidung";
import { standAusBewerber, type StandBewerber } from "@/lib/kennenlernenStand";

/**
 * Die Sichtbarkeit im Bewerberprozess.
 *
 * Geprueft wird der ganze Weg, den die Liste geht: von den Feldern der
 * Bewerberzeile ueber `standAusBewerber` bis zum Kennzeichen. Genau dort lag
 * der blinde Fleck, denn der Zwischenspeicher las die Pause und den
 * Widerspruch gegen den Anruf bis zum 14.09.2026 gar nicht erst aus.
 */

const HEUTE = new Date();
function vorTagen(tage: number): string {
  return new Date(HEUTE.getTime() - tage * 86_400_000).toISOString();
}

function bewerber(rest: Partial<StandBewerber> = {}): StandBewerber {
  return {
    status: "Eingang",
    erstgespraechDatum: "",
    erstgespraechUhrzeit: "",
    nachfassMailAm: "",
    kennenlernenGesendetAm: vorTagen(20),
    kennenlernenErinnerungStufe: 0,
    kennenlernenAnrufWidersprochen: false,
    kennenlernenPauseGesetztAm: "",
    kennenlernenPauseErinnerungAm: "",
    ...rest,
  };
}

function titelVon(text: string): string {
  return screen.getByText(text).closest("[title]")?.getAttribute("title") || "";
}

describe("Das Kennzeichen in der Liste", () => {
  it("bleibt weg, solange die Kette laeuft und nichts offen ist", () => {
    const { container } = render(
      <WartetAufEntscheidungBadge stand={standAusBewerber(bewerber())} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt sich bei Widerspruch gegen den Anruf, mit dem Grund im Zeigetext", () => {
    render(
      <WartetAufEntscheidungBadge
        stand={standAusBewerber(
          bewerber({ kennenlernenErinnerungStufe: 3, kennenlernenAnrufWidersprochen: true }),
        )}
      />,
    );
    expect(titelVon("wartet auf Entscheidung")).toMatch(/nicht angerufen werden/);
  });

  it("zeigt sich bei „ich melde mich selbst", () => {
    render(
      <WartetAufEntscheidungBadge
        stand={standAusBewerber(
          bewerber({ kennenlernenPauseGesetztAm: vorTagen(34), kennenlernenPauseErinnerungAm: "" }),
        )}
      />,
    );
    expect(titelVon("wartet auf Entscheidung")).toMatch(/Meldet sich selbst, seit 34 Tagen/);
  });

  it("bleibt weg, sobald jemand entschieden hat", () => {
    const { container } = render(
      <WartetAufEntscheidungBadge
        stand={standAusBewerber(
          bewerber({
            status: "KeinInteresse",
            kennenlernenErinnerungStufe: 3,
            kennenlernenAnrufWidersprochen: true,
          }),
        )}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("nennt die fehlende Mail zum Kennenlernbogen", () => {
    render(
      <WartetAufEntscheidungBadge stand={standAusBewerber(bewerber())} sammelmail="fehlt" />,
    );
    expect(screen.getByText("Eingangsmail zum Kennenlernbogen fehlt")).toBeInTheDocument();
  });

  /*
   * Der Fehler vom 14.09.2026, und der Grund fuer dieses Merkmal.
   *
   * Die Vorschau fuehrt jeden als Empfaenger, der keinen Vermerk vom
   * Sammelversand traegt. Das trifft auch jeden neu Dazugekommenen: Der hat
   * seinen Link laengst automatisch beim Anlegen bekommen, die Sammelmail lief
   * nur einmal. Das Kennzeichen stand deshalb bei zehn Bewerbern, die alle
   * versorgt waren, und sagte genau das Gegenteil der Wahrheit.
   */
  it("schweigt, wenn die Mail auf dem anderen Weg schon hinaus ist", () => {
    render(
      <WartetAufEntscheidungBadge
        stand={standAusBewerber(bewerber())}
        sammelmail="fehlt"
        hatMailZumBogen
      />,
    );
    expect(screen.queryByText("Eingangsmail zum Kennenlernbogen fehlt")).toBeNull();
  });

  // Die gesperrte Adresse bleibt sichtbar, auch wenn die Mail hinaus ist: Sie
  // sagt nicht, dass etwas fehlt, sondern dass nichts mehr ankommt.
  it("zeigt die gesperrte Adresse auch bei bereits verschickter Mail", () => {
    render(
      <WartetAufEntscheidungBadge
        stand={standAusBewerber(bewerber())}
        sammelmail="adresse_gesperrt"
        hatMailZumBogen
      />,
    );
    expect(screen.getByText("Adresse gesperrt, erreicht uns nicht per Mail")).toBeInTheDocument();
  });

  it("stellt die gesperrte Adresse ueber alles andere", () => {
    /*
     * An diese Adresse geht keine Mail mehr hinaus. Das macht jeden anderen
     * Hinweis gegenstandslos, auch den Versand, der sonst faellig waere.
     */
    render(
      <WartetAufEntscheidungBadge
        stand={standAusBewerber(
          bewerber({ kennenlernenErinnerungStufe: 3, kennenlernenAnrufWidersprochen: true }),
        )}
        sammelmail="adresse_gesperrt"
      />,
    );
    expect(screen.getByText("Adresse gesperrt, erreicht uns nicht per Mail")).toBeInTheDocument();
    expect(screen.queryByText("wartet auf Entscheidung")).not.toBeInTheDocument();
  });

  it("stellt die stehende Kette ueber die fehlende Sammelmail", () => {
    // Wer gesagt hat „ich melde mich selbst", bekommt keine Aufforderung.
    render(
      <WartetAufEntscheidungBadge
        stand={standAusBewerber(
          bewerber({ kennenlernenPauseGesetztAm: vorTagen(9), kennenlernenPauseErinnerungAm: "" }),
        )}
        sammelmail="fehlt"
      />,
    );
    expect(screen.getByText("wartet auf Entscheidung")).toBeInTheDocument();
    expect(screen.queryByText("Sammelmail zum Kennenlernen fehlt")).not.toBeInTheDocument();
  });
});

describe("Der Grund in der Akte", () => {
  it("nennt den Grund und dass von selbst nichts mehr geschieht", () => {
    render(
      <WartetAufEntscheidungGrund
        stand={standAusBewerber(
          bewerber({ kennenlernenPauseGesetztAm: vorTagen(5), kennenlernenPauseErinnerungAm: "" }),
        )}
      />,
    );
    expect(screen.getByText("wartet auf Entscheidung.")).toBeInTheDocument();
    expect(screen.getByText(/Meldet sich selbst, seit 5 Tagen/)).toBeInTheDocument();
    expect(screen.getByText(/geschieht von selbst nichts mehr/)).toBeInTheDocument();
  });

  it("erklaert die gesperrte Adresse", () => {
    render(
      <WartetAufEntscheidungGrund
        stand={standAusBewerber(bewerber())}
        sammelmail="adresse_gesperrt"
      />,
    );
    expect(screen.getByText(/Sperrliste/)).toBeInTheDocument();
  });
});

describe("standAusBewerber", () => {
  it("liest Pause und Widerspruch, die der Kennenlernen-Karte vorher fehlten", () => {
    const stand = standAusBewerber(
      bewerber({
        kennenlernenAnrufWidersprochen: true,
        kennenlernenPauseGesetztAm: vorTagen(9),
        kennenlernenPauseErinnerungAm: "",
      }),
    );
    expect(stand.anrufWidersprochen).toBe(true);
    expect(stand.pauseGesetzt).toBe(true);
    expect(stand.pausiertBis).toBeNull();
  });

  it("verschiebt den Starttag der Kette auf das Ende einer abgelaufenen Pause", () => {
    const ende = vorTagen(2);
    const stand = standAusBewerber(
      bewerber({ kennenlernenPauseGesetztAm: vorTagen(15), kennenlernenPauseErinnerungAm: ende }),
    );
    expect(stand.gesendetAm).toBe(ende);
  });

  it("faellt ohne Versandvermerk auf das Anlagedatum des Bogens zurueck", () => {
    const angelegt = vorTagen(4);
    const stand = standAusBewerber(bewerber({ kennenlernenGesendetAm: "" }), {
      status: "offen",
      erstelltAm: angelegt,
    });
    expect(stand.gesendetAm).toBe(angelegt);
    expect(stand.formularStatus).toBe("offen");
  });
});
