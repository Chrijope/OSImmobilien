import { describe, it, expect } from "vitest";
import {
  getCurrentSaInvestmentRow,
  saDataFuerInvestmentRow,
  eigeneSaDataFuerInvestmentRow,
  hatEigeneSa,
  saVomVorherigenInvestment,
} from "./saQuelle";
import { calculateFinanzierbarkeitFromSaData } from "./finanzierbarkeitUtils";

/**
 * Kundenprofil und Kundenportal muessen dieselbe Selbstauskunft heranziehen:
 * die des betrachteten Investments, sonst die neueste vorhandene. Vorher nahm
 * das Profil fuer die Dokumentliste die ERSTE SA und rechnete bei Kunden mit
 * zweitem Investment mit veralteten Angaben.
 */

const alt = { id: "a", erstellt_am: "2026-01-01T10:00:00Z", meta: { nummer: 1, saData: { wer: "alt" } } };
const neu = { id: "b", erstellt_am: "2026-06-01T10:00:00Z", meta: { nummer: 2, saData: { wer: "neu" } } };
const ohneSa = { id: "c", erstellt_am: "2026-08-01T10:00:00Z", meta: { nummer: 3 } };

describe("getCurrentSaInvestmentRow", () => {
  it("liefert die neueste SA, nicht die erste", () => {
    expect(getCurrentSaInvestmentRow([alt, neu, ohneSa])?.id).toBe("b");
    expect(getCurrentSaInvestmentRow([neu, alt])?.id).toBe("b");
  });

  it("bevorzugt das Abschlussdatum der SA vor dem Anlagedatum", () => {
    const spaetAbgeschlossen = {
      id: "d",
      erstellt_am: "2025-01-01T10:00:00Z",
      meta: { nummer: 1, saData: { abgeschlossenAm: "2026-07-01T10:00:00Z" } },
    };
    expect(getCurrentSaInvestmentRow([spaetAbgeschlossen, neu])?.id).toBe("d");
  });

  it("liefert null ohne SA", () => {
    expect(getCurrentSaInvestmentRow([ohneSa])).toBeNull();
    expect(getCurrentSaInvestmentRow([])).toBeNull();
  });
});

describe("saDataFuerInvestmentRow", () => {
  it("nimmt die eigene SA des betrachteten Investments", () => {
    expect(saDataFuerInvestmentRow(alt, [alt, neu])).toEqual({ wer: "alt" });
  });

  it("faellt ohne eigene SA auf die neueste vorhandene zurueck", () => {
    expect(saDataFuerInvestmentRow(ohneSa, [alt, neu, ohneSa])).toEqual({ wer: "neu" });
  });

  it("nimmt zuletzt den am Kontakt gespeicherten Altbestand", () => {
    expect(saDataFuerInvestmentRow(ohneSa, [ohneSa], { wer: "kontakt" })).toEqual({ wer: "kontakt" });
    expect(saDataFuerInvestmentRow(ohneSa, [ohneSa])).toBeNull();
  });
});

/**
 * Die strenge Fassung fuer die Anzeige von Geld: Jedes Investment ist
 * unabhaengig. Ohne eigene Selbstauskunft gibt es keine Zahlen, auch dann
 * nicht, wenn ein anderes Investment desselben Kunden eine SA hat.
 */
describe("eigeneSaDataFuerInvestmentRow", () => {
  it("liefert die eigene SA des Investments", () => {
    expect(eigeneSaDataFuerInvestmentRow(alt)).toEqual({ wer: "alt" });
  });

  it("faellt NICHT auf die SA eines anderen Investments zurueck", () => {
    expect(eigeneSaDataFuerInvestmentRow(ohneSa)).toBeNull();
    // Zum Vergleich: die Fassung mit Rueckfall liefert hier die fremde SA.
    expect(saDataFuerInvestmentRow(ohneSa, [alt, neu, ohneSa])).toEqual({ wer: "neu" });
  });

  it("erkennt die SA auch im Snapshot-Feld", () => {
    const mitSnapshot = { id: "e", erstellt_am: "2026-02-01T10:00:00Z", meta: { nummer: 4, saSnapshot: { wer: "snapshot" } } };
    expect(eigeneSaDataFuerInvestmentRow(mitSnapshot)).toEqual({ wer: "snapshot" });
  });

  it("liefert null ohne Investmentzeile", () => {
    expect(eigeneSaDataFuerInvestmentRow(null)).toBeNull();
    expect(eigeneSaDataFuerInvestmentRow(undefined)).toBeNull();
  });
});

describe("hatEigeneSa", () => {
  it("sagt ja nur bei eigener SA", () => {
    expect(hatEigeneSa(alt)).toBe(true);
    expect(hatEigeneSa(ohneSa)).toBe(false);
    expect(hatEigeneSa(null)).toBe(false);
  });
});

/**
 * Die Regel, wie das Kundenprofil sie anwendet: Erst die eigene SA des
 * Investments waehlen, dann daraus rechnen. Ein Investment ohne eigene SA
 * bekommt keine Zahlen, auch wenn ein anderes Investment desselben Kunden
 * eine SA hat. Vorher zeigte genau dieser Fall fremde Zahlen (Beispiel Otto
 * Hans, Investment 6).
 */
describe("Finanzielle Situation je Investment", () => {
  const saMitZahlen = {
    einkommen: { netto: "4000" },
    vermoegenswerte: [{ art: "Girokonto", betrag: "50000" }],
  };
  const investmentMitSa = { id: "i1", erstellt_am: "2026-01-01T10:00:00Z", meta: { nummer: 1, saData: saMitZahlen } };
  const investmentOhneSa = { id: "i6", erstellt_am: "2026-09-01T10:00:00Z", meta: { nummer: 6 } };

  it("zeigt Zahlen fuer das Investment mit eigener Selbstauskunft", () => {
    const sd = eigeneSaDataFuerInvestmentRow(investmentMitSa);
    expect(sd).not.toBeNull();
    const rahmen = calculateFinanzierbarkeitFromSaData(sd);
    expect(rahmen!.empfRahmen).toBeGreaterThan(0);
    expect(rahmen!.eigenkapital).toBe(50000);
  });

  it("zeigt keine Zahlen fuer das Investment ohne eigene Selbstauskunft", () => {
    const sd = eigeneSaDataFuerInvestmentRow(investmentOhneSa);
    expect(sd).toBeNull();
    // Ohne SA gibt es keinen Finanzierungsrahmen, den man anzeigen koennte.
    expect(calculateFinanzierbarkeitFromSaData(sd)).toBeNull();
  });

  it("nimmt auch dann nichts, wenn ein anderes Investment desselben Kunden eine SA hat", () => {
    const alleZeilen = [investmentMitSa, investmentOhneSa];
    // Die Fassung mit Rueckfall wuerde hier die fremde SA liefern ...
    expect(saDataFuerInvestmentRow(investmentOhneSa, alleZeilen)).toEqual(saMitZahlen);
    // ... die strenge Fassung, die ueberall in der Anzeige gilt, nicht.
    expect(eigeneSaDataFuerInvestmentRow(investmentOhneSa)).toBeNull();
  });

  it("laesst die Fassung mit Rueckfall nur fuer die Formular-Vorbelegung uebrig", () => {
    /*
     * `saDataFuerInvestmentRow` hat seit dem 10.09.2026 genau einen Zweck:
     * `getSaDataZurVorbelegung` im investmentsStore fuellt damit das
     * Selbstauskunfts-Formular vor, damit der Kunde beim zweiten Kauf nur
     * korrigieren muss. Angezeigt wird davon nichts; abgesendet wird vom
     * Kunden selbst. Ohne Investment liefert sie die neueste vorhandene.
     */
    expect(saDataFuerInvestmentRow(null, [investmentMitSa, investmentOhneSa])).toEqual(saMitZahlen);
    expect(saDataFuerInvestmentRow(null, [investmentOhneSa])).toBeNull();
  });
});

/**
 * Die Vorbelegung eines neuen Investments.
 *
 * Vorgabe des Geschaeftsfuehrers vom 10.09.2026: Investment 5 wird mit den
 * Angaben von Investment 4 vorbelegt, nicht mit der zuletzt ausgefuellten
 * Selbstauskunft irgendeines Investments. Das ist genau die Stelle, die still
 * falsch wird, wenn jemand spaeter nach dem Zeitstempel sortiert.
 */
describe("saVomVorherigenInvestment", () => {
  const inv = (nummer: number | string | undefined, sa: Record<string, unknown> | null, tag = "01") => ({
    id: `i${nummer}`,
    erstellt_am: `2026-01-${tag}T10:00:00Z`,
    meta: { nummer, ...(sa ? { saData: sa } : {}) },
  });

  it("nimmt fuer Investment 5 die Selbstauskunft von Investment 4", () => {
    const alle = [
      inv(1, { wer: "eins" }),
      inv(2, { wer: "zwei" }),
      inv(3, { wer: "drei" }),
      inv(4, { wer: "vier" }),
      inv(5, null),
    ];
    const quelle = saVomVorherigenInvestment("i5", alle);
    expect(quelle?.saData).toEqual({ wer: "vier" });
    expect(quelle?.nummer).toBe(4);
  });

  it("geht weiter zurueck, wenn das Investment davor keine Selbstauskunft hat", () => {
    const alle = [inv(1, { wer: "eins" }), inv(2, null), inv(3, { wer: "drei" }), inv(4, null), inv(5, null)];
    const quelle = saVomVorherigenInvestment("i5", alle);
    expect(quelle?.saData).toEqual({ wer: "drei" });
    expect(quelle?.nummer).toBe(3);
  });

  it("liefert nichts, wenn kein Vorgaenger eine Selbstauskunft hat", () => {
    const alle = [inv(1, null), inv(2, null), inv(3, null)];
    expect(saVomVorherigenInvestment("i3", alle)).toBeNull();
  });

  it("liefert nichts fuer das erste Investment", () => {
    expect(saVomVorherigenInvestment("i1", [inv(1, null), inv(2, { wer: "zwei" })])).toBeNull();
  });

  it("nimmt NICHT die neueste, sondern die vorherige Selbstauskunft", () => {
    /*
     * Investment 2 wurde spaeter ausgefuellt als Investment 4. Nach
     * Zeitstempel gewaenne die von Investment 2, nach der Nummer gewinnt die
     * von Investment 4. Genau dieser Fall war der Grund fuer die Umstellung.
     */
    const alle = [
      inv(1, null),
      { id: "i2", erstellt_am: "2026-02-01T10:00:00Z", meta: { nummer: 2, saData: { wer: "zwei", abgeschlossenAm: "2026-08-01T10:00:00Z" } } },
      inv(3, null),
      { id: "i4", erstellt_am: "2026-04-01T10:00:00Z", meta: { nummer: 4, saData: { wer: "vier", abgeschlossenAm: "2026-05-01T10:00:00Z" } } },
      inv(5, null),
    ];
    expect(getCurrentSaInvestmentRow(alle)?.id).toBe("i2");
    expect(saVomVorherigenInvestment("i5", alle)?.saData).toEqual({
      wer: "vier",
      abgeschlossenAm: "2026-05-01T10:00:00Z",
    });
  });

  it("stellt Investments ohne Nummer ans Ende der Reihe", () => {
    const ohneNummer = { id: "iX", erstellt_am: "2026-01-05T10:00:00Z", meta: { saData: { wer: "ohne" } } };
    const alle = [inv(1, { wer: "eins" }), inv(2, { wer: "zwei" }), ohneNummer, inv(3, null)];
    // Investment 3 traegt eine Nummer und steht damit VOR der Zeile ohne
    // Nummer. Es bekommt deshalb die Angaben von Investment 2.
    expect(saVomVorherigenInvestment("i3", alle)?.nummer).toBe(2);
    // Die Zeile ohne Nummer steht am Ende und sieht alles davor.
    expect(saVomVorherigenInvestment("iX", alle)?.saData).toEqual({ wer: "zwei" });
  });

  it("kommt mit doppelten Nummern zurecht und bleibt bei jedem Aufruf gleich", () => {
    // Zwei Zeilen mit der Nummer 2, wie sie beim gleichzeitigen Anlegen in
    // zwei Fenstern entstehen. Das aeltere Anlagedatum steht vorn.
    const frueher = { id: "a", erstellt_am: "2026-03-01T10:00:00Z", meta: { nummer: 2, saData: { wer: "frueher" } } };
    const spaeter = { id: "b", erstellt_am: "2026-03-02T10:00:00Z", meta: { nummer: 2 } };
    const alle = [spaeter, frueher, inv(1, { wer: "eins" }), inv(3, null)];
    expect(saVomVorherigenInvestment("b", alle)?.saData).toEqual({ wer: "frueher" });
    expect(saVomVorherigenInvestment("b", [...alle].reverse())?.saData).toEqual({ wer: "frueher" });
    expect(saVomVorherigenInvestment("a", alle)?.saData).toEqual({ wer: "eins" });
    expect(saVomVorherigenInvestment("i3", alle)?.saData).toEqual({ wer: "frueher" });
  });

  it("nimmt die Selbstauskunft auch aus dem Snapshot-Feld", () => {
    const mitSnapshot = { id: "i1", erstellt_am: "2026-01-01T10:00:00Z", meta: { nummer: 1, saSnapshot: { wer: "snapshot" } } };
    expect(saVomVorherigenInvestment("i2", [mitSnapshot, inv(2, null)])?.saData).toEqual({ wer: "snapshot" });
  });

  it("uebernimmt nichts, wenn das Ziel-Investment gar nicht in der Liste steht", () => {
    // Dann ist unbekannt, wo es in der Reihe steht. Lieber nichts als falsch.
    expect(saVomVorherigenInvestment("fremd", [inv(1, { wer: "eins" })])).toBeNull();
  });

  it("nimmt ohne Ziel-Investment das letzte der Reihe (Altweg des Formulars)", () => {
    const alle = [inv(1, { wer: "eins" }), inv(2, { wer: "zwei" }), inv(3, null)];
    expect(saVomVorherigenInvestment(null, alle)?.saData).toEqual({ wer: "zwei" });
    expect(saVomVorherigenInvestment(null, [])).toBeNull();
  });
});

/**
 * Die Hintertuer, die beim Bau der Vorbelegung aufgegangen waere.
 *
 * Das Formular sichert seinen Entwurf laufend an `investments.meta.saData`.
 * Bei einem vorbelegten Formular stehen darin am Anfang die Zahlen des
 * VORHERIGEN Investments. Wuerde das als eigene Selbstauskunft zaehlen, waere
 * genau der Fehler zurueck, der am 10.09.2026 abgeschafft wurde.
 */
describe("Entwurf mit noch ungeprueften Uebernahmen", () => {
  const vermerk = { ausInvestment: 4, uebernommenAm: "2026-09-10T00:00:00Z", offeneAbschnitte: [2, 3] };
  const entwurf = {
    id: "i5",
    erstellt_am: "2026-09-01T10:00:00Z",
    meta: { nummer: 5, saData: { einkommen: { netto: "3500" }, vorbelegung: vermerk } },
  };

  it("zaehlt nicht als eigene Selbstauskunft", () => {
    expect(eigeneSaDataFuerInvestmentRow(entwurf)).toBeNull();
    expect(hatEigeneSa(entwurf)).toBe(false);
  });

  it("zaehlt, sobald alle Abschnitte geprueft sind", () => {
    const geprueft = { ...entwurf, meta: { ...entwurf.meta, saData: { ...entwurf.meta.saData, vorbelegung: { ...vermerk, offeneAbschnitte: [] } } } };
    expect(hatEigeneSa(geprueft)).toBe(true);
  });

  it("zaehlt, sobald die Selbstauskunft abgeschlossen oder unterschrieben ist", () => {
    const abgeschlossen = { ...entwurf, meta: { ...entwurf.meta, saData: { ...entwurf.meta.saData, abgeschlossen: true } } };
    expect(hatEigeneSa(abgeschlossen)).toBe(true);
    const unterschrieben = { ...entwurf, meta: { ...entwurf.meta, saSigned: true } };
    expect(hatEigeneSa(unterschrieben)).toBe(true);
  });

  it("dient auch nicht als Quelle fuer die naechste Vorbelegung", () => {
    const alle = [
      { id: "i4", erstellt_am: "2026-05-01T10:00:00Z", meta: { nummer: 4, saData: { wer: "vier" } } },
      entwurf,
      { id: "i6", erstellt_am: "2026-09-05T10:00:00Z", meta: { nummer: 6 } },
    ];
    expect(saVomVorherigenInvestment("i6", alle)?.nummer).toBe(4);
  });
});
