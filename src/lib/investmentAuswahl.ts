/**
 * Welches Investment eine Berechnung meint.
 *
 * Regel (Entscheidung Christian, 10.09.2026): Es wird nie kontaktbezogen
 * gerechnet, sondern immer mit den Zahlen eines Investments. Zahlen hängen am
 * Investment, das Investment hängt am Kontakt. Wer also einen Kunden wählt,
 * muss zusätzlich sein Investment wählen, bevor überhaupt gerechnet wird.
 *
 * Diese Datei hält bewusst nur die reine Auswahllogik, ohne jeden
 * Datenzugriff. So sind die drei Fälle prüfbar: der Kunde hat kein
 * Investment, er hat genau eines, er hat mehrere. Die Daten holt die
 * aufrufende Komponente über `getInvestmentsByKontakt`, also über den
 * Zwischenspeicher. Der enthält ohnehin nur, was der angemeldete Nutzer sehen
 * darf, deshalb entsteht hier keine eigene Abfrage und keine zweite
 * Sichtbarkeitsregel.
 */

/** Der Ausschnitt eines Investments, den die Auswahl braucht. */
export interface InvestmentFuerAuswahl {
  id: string;
  nummer: number;
  label?: string;
  objektTitel?: string;
  weNr?: string;
}

/** Ein Eintrag in der Auswahlliste. */
export interface InvestmentOption {
  id: string;
  bezeichnung: string;
}

/**
 * Der Stand der Auswahl.
 *
 *   ohneKunde        es ist gar kein Kunde gewählt, gerechnet wird allgemein
 *   keineInvestments der Kunde hat noch kein Investment, es fehlt die Grundlage
 *   wahlNoetig       mehrere Investments, der Nutzer muss sich entscheiden
 *   gewaehlt         das Investment steht fest, jetzt darf gerechnet werden
 */
export type InvestmentAuswahlStand =
  | { art: "ohneKunde" }
  | { art: "keineInvestments" }
  | { art: "wahlNoetig"; optionen: InvestmentOption[] }
  | {
      art: "gewaehlt";
      investmentId: string;
      bezeichnung: string;
      optionen: InvestmentOption[];
      /** Der Kunde hat nur dieses eine, es wurde also nicht ausgewählt sondern gesetzt. */
      einziges: boolean;
    };

/** Beschriftung eines Investments in der Auswahl: „Investment 1, Musterstraße 12". */
export function investmentBeschriftung(inv: InvestmentFuerAuswahl): string {
  const kopf = inv.label && !/^Investment \d+$/.test(inv.label) ? inv.label : `Investment ${inv.nummer}`;
  const objekt = [inv.objektTitel, inv.weNr ? `WE ${inv.weNr}` : ""].filter(Boolean).join(", ");
  return objekt ? `${kopf}, ${objekt}` : kopf;
}

/**
 * Der Stand der Auswahl aus Kunde, vorhandenen Investments und der bisherigen
 * Wahl.
 *
 * Genau ein Investment wird übernommen, ohne dass jemand klicken muss. Es wird
 * aber trotzdem benannt, damit sichtbar bleibt, womit gerechnet wird. Bei
 * mehreren gilt eine ungültige oder fehlende Wahl als „noch nicht gewählt",
 * damit eine alte Investment-Nummer aus der Adresszeile nicht stillschweigend
 * mit den falschen Zahlen rechnet.
 */
export function investmentAuswahlStand(
  kundeId: string | null | undefined,
  investments: InvestmentFuerAuswahl[] | null | undefined,
  gewaehlteId: string | null | undefined,
): InvestmentAuswahlStand {
  if (!kundeId) return { art: "ohneKunde" };

  const liste = investments || [];
  if (liste.length === 0) return { art: "keineInvestments" };

  const optionen: InvestmentOption[] = liste.map((inv) => ({
    id: inv.id,
    bezeichnung: investmentBeschriftung(inv),
  }));

  if (liste.length === 1) {
    return {
      art: "gewaehlt",
      investmentId: optionen[0].id,
      bezeichnung: optionen[0].bezeichnung,
      optionen,
      einziges: true,
    };
  }

  const treffer = gewaehlteId ? optionen.find((o) => o.id === gewaehlteId) : undefined;
  if (!treffer) return { art: "wahlNoetig", optionen };

  return {
    art: "gewaehlt",
    investmentId: treffer.id,
    bezeichnung: treffer.bezeichnung,
    optionen,
    einziges: false,
  };
}

/* ── Investmentwahl im Rechner einer bestimmten Einheit ── */

/** Die Einheit, für die der Rechner auf der Einheitenseite rechnet. */
export interface RechnerEinheit {
  objektId: string;
  wohnungId: string;
}

/**
 * Wie ein Investment zur Einheit steht, für die gerade gerechnet wird.
 *
 *   passend        das Investment gehört schon zu dieser Wohnung
 *   ohneObjekt     dem Investment ist noch gar kein Objekt zugeordnet
 *   andereEinheit  das Investment gehört zu einem anderen Objekt oder einer anderen Wohnung
 *
 * Warum „ohneObjekt" eigens zählt: In der Objektauswahl hat ein Vorgang noch
 * keine Wohnung, genau dann wird aber auf der Einheitenseite gerechnet. Bis
 * zum 24.09.2026 war ein solches Investment dort gesperrt, und damit kamen
 * auch Einkommen und Steuerdaten aus seiner Selbstauskunft nie in den Rechner.
 * Ein Globalobjekt-Vorgang (Objekt gesetzt, Wohnung leer) gilt bewusst als
 * andere Einheit: Er meint das ganze Haus und nicht diese eine Wohnung.
 */
export type EinheitBezug = "passend" | "ohneObjekt" | "andereEinheit";

export function investmentBezugZurEinheit(
  inv: { objektId?: string | null; wohnungId?: string | null },
  einheit: RechnerEinheit | null | undefined,
): EinheitBezug {
  if (!einheit) return "passend";
  if (inv.objektId === einheit.objektId && inv.wohnungId === einheit.wohnungId) return "passend";
  if (!inv.objektId && !inv.wohnungId) return "ohneObjekt";
  return "andereEinheit";
}

/**
 * Welches Investment der Rechner nach der Kundenwahl von sich aus nimmt.
 *
 * Genau ein passendes gewinnt. Gibt es keines, aber genau eines ohne Objekt,
 * wird dieses genommen, damit die Rückfrage zur Selbstauskunft sofort kommt.
 * In allen anderen Fällen wählt der Nutzer selbst.
 */
export function vorwahlFuerEinheit(
  investments: Array<{ id: string; objektId?: string | null; wohnungId?: string | null }>,
  einheit: RechnerEinheit | null | undefined,
): string | null {
  const passend = investments.filter((i) => investmentBezugZurEinheit(i, einheit) === "passend");
  if (passend.length === 1) return passend[0].id;
  if (passend.length > 1) return null;
  const ohneObjekt = investments.filter((i) => investmentBezugZurEinheit(i, einheit) === "ohneObjekt");
  return ohneObjekt.length === 1 ? ohneObjekt[0].id : null;
}

/**
 * Der Satz unter dem Investmentfeld auf der Einheitenseite.
 *
 * Er erklärt, warum ein Investment grau ist, und was mit einem Investment
 * ohne Objekt geschieht: Gerechnet wird mit seiner Selbstauskunft, die
 * Wohnung wird ihm dabei nicht zugeordnet. Leer, solange alles eindeutig ist.
 */
export function einheitHinweisText(
  kundenName: string,
  investments: Array<{ bezug: EinheitBezug; gewaehlt: boolean }>,
): string {
  const vorname = kundenName.trim().split(/\s+/)[0] || "Der Kunde";
  const hatPassendes = investments.some((i) => i.bezug === "passend");
  const hatOhneObjekt = investments.some((i) => i.bezug === "ohneObjekt");
  const hatFremdes = investments.some((i) => i.bezug === "andereEinheit");
  const gewaehltOhneObjekt = investments.some((i) => i.gewaehlt && i.bezug === "ohneObjekt");
  const saetze: string[] = [];
  if (!hatPassendes) {
    if (gewaehltOhneObjekt) {
      saetze.push(
        `${vorname} hat noch kein Investment für diese Wohnung. Gerechnet wird mit dem gewählten Investment ohne Objekt, die Werte aus der Selbstauskunft lassen sich übernehmen. Die Wohnung wird dem Investment dabei nicht zugeordnet.`,
      );
    } else if (hatOhneObjekt) {
      saetze.push(
        `${vorname} hat noch kein Investment für diese Wohnung. Wähle ein Investment ohne Objekt, dann lassen sich die Werte aus der Selbstauskunft übernehmen.`,
      );
    } else {
      saetze.push(
        `${vorname} hat noch kein Investment für diese Wohnung und keines ohne Objekt. Gerechnet wird ohne Selbstauskunft, gespeichert wird nichts. Ein neues Investment legst du im Kundenprofil an.`,
      );
    }
  }
  if (hatFremdes) {
    saetze.push("Investments, die schon zu einer anderen Einheit gehören, sind hier gesperrt. Ihre Zahlen gehören zu jener Wohnung.");
  }
  return saetze.join(" ");
}
