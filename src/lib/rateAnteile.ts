/**
 * Wer trägt die monatliche Rate? Die drei Anteile aus Station 05.
 *
 * Die Folie mit dem Ring ist der Aha-Moment des Beratungstermins, der Satz,
 * den der Kunde zu Hause weitererzählt. Genau deshalb muss er nachrechenbar
 * sein. Früher standen dort feste Werte von 62, 24 und 14 Prozent, die zu
 * keiner Musterrechnung des Hauses passten: Die 24 Prozent für das Finanzamt
 * stammten aus dem ersten Jahr, in dem der einmalige Erhaltungsaufwand wirkt.
 * Als Dauerzustand gezeigt war das eine Zahl, die nach zwölf Monaten kippt.
 *
 * Deshalb liegen die Anteile jetzt hier und werden aus derselben
 * Musterrechnung abgeleitet, die die Präsentation zwei Stationen später Zeile
 * für Zeile zeigt. Bezugsgröße ist die Rate selbst, denn genau danach fragt
 * die Folie.
 *
 * Der Rechenweg, immer für den Dauerzustand ab dem zweiten Jahr:
 *
 *   Anteil Mieter    = (Kaltmiete − nicht umlagefähige Kosten) / Rate
 *   Anteil Finanzamt = Steuerentlastung ab dem zweiten Jahr / Rate
 *   Anteil Kunde     = der Rest, also 100 Prozent minus die ersten beiden
 *
 * Die drei Beträge ergeben zusammen genau die Rate, die drei Prozentwerte
 * genau 100. Das prüft `rateAnteile.test.ts` für jeden Datensatz.
 *
 * Warum nicht das erste Jahr: Beim sanierten Bestand trägt das Finanzamt im
 * ersten Jahr 826 Euro und damit über die Hälfte der Rate, der Eigenanteil
 * ist rechnerisch sogar negativ. Eine Aufteilung, die nur zwölf Monate hält,
 * ist keine Botschaft, sondern eine Enttäuschung mit Verzögerung.
 */

/** Die Ausgangswerte einer Musterrechnung, alle in Euro je Monat. */
export interface RateEingang {
  /** Kaltmiete, wie sie in der Musterrechnung als erste Zeile steht. */
  kaltmiete: number;
  /** Nicht umlagefähige Kosten, die aus der Miete bezahlt werden müssen. */
  nichtUmlagefaehig: number;
  /** Zins und Tilgung, die Bezugsgröße der Folie. */
  rate: number;
  /** Steuerentlastung im Dauerzustand ab dem zweiten Jahr. */
  entlastungAbJahrZwei: number;
  /** Eigener Beitrag ab dem zweiten Jahr, aus derselben Musterrechnung. */
  eigenbeitragAbJahrZwei: number;
}

/** Die drei Anteile in ganzen Prozent, zusammen immer 100. */
export interface RateAnteile {
  mieter: number;
  finanzamt: number;
  kunde: number;
}

/**
 * Die Ausgangswerte der Musterrechnungen, aus denen die Folien rechnen.
 *
 * Ändert sich eine Musterrechnung in der Präsentation, muss der zugehörige
 * Satz hier mitgeführt werden. Der Test vergleicht beide Seiten und schlägt
 * Alarm, wenn sie auseinanderlaufen.
 */
export const RATE_EINGANG = {
  /**
   * Sanierter Bestand der Beratungspräsentation OS Immobilien
   * (`src/pages/BeratungspraesentationHV.tsx`, Musterrechnung `bestand`):
   * 1.400 € Kaltmiete, 1.604 € Zins und Tilgung, 150 € nicht umlagefähig,
   * 126 € Entlastung und 228 € Eigenbeitrag ab dem zweiten Jahr.
   * Ergibt 78, 8 und 14 Prozent. Das ist der Fall, den die Vertriebsakademie
   * im Kapitel `beratungsgespraech` als Beispiel nennt.
   */
  bestand: {
    kaltmiete: 1400,
    nichtUmlagefaehig: 150,
    rate: 1604,
    entlastungAbJahrZwei: 126,
    eigenbeitragAbJahrZwei: 228,
  },
  /**
   * WG und Co-Living derselben Präsentation (Musterrechnung `wg`):
   * 1.600 € Kaltmiete, 1.895 € Rate, 73 € nicht umlagefähig, 168 € Entlastung
   * und 200 € Eigenbeitrag ab dem zweiten Jahr. Ergibt 81, 9 und 10 Prozent.
   */
  wg: {
    kaltmiete: 1600,
    nichtUmlagefaehig: 73,
    rate: 1895,
    entlastungAbJahrZwei: 168,
    eigenbeitragAbJahrZwei: 200,
  },
  /**
   * Beispielwohnung Memmingen aus der ersten Beratungspräsentation
   * (`src/pages/Beratungspraesentation.tsx`): 429 € Kaltmiete, 660 € Bankrate,
   * 62 € Hausgeld, 152 € Steuervorteil und 141 € monatlicher Eigenaufwand.
   * Das Hausgeld steht dort als volle Eigentümerlast, deshalb zählt es hier
   * ganz zu den nicht umlagefähigen Kosten. Ergibt 56, 23 und 21 Prozent.
   * In der Vergleichstabelle standen dafür früher 75 und rund 12,5 Prozent.
   */
  memmingen: {
    kaltmiete: 429,
    nichtUmlagefaehig: 62,
    rate: 660,
    entlastungAbJahrZwei: 152,
    eigenbeitragAbJahrZwei: 141,
  },
} satisfies Record<string, RateEingang>;

export type RateEingangId = keyof typeof RATE_EINGANG;

/** Was der Mieter zur Rate beiträgt: Kaltmiete minus nicht umlagefähige Kosten. */
export function mieterbeitrag(e: RateEingang): number {
  return e.kaltmiete - e.nichtUmlagefaehig;
}

/**
 * Die drei Anteile in ganzen Prozent.
 *
 * Mieter und Finanzamt werden kaufmännisch gerundet, der Kunde bekommt den
 * Rest. So ergeben die drei Werte immer genau 100, ohne dass eine Folie eine
 * Summe von 99 oder 101 zeigt. Die Rundung verschiebt den Kundenanteil um
 * höchstens einen Prozentpunkt, das prüft der Test.
 */
export function rateAnteile(e: RateEingang): RateAnteile {
  const mieter = Math.round((mieterbeitrag(e) / e.rate) * 100);
  const finanzamt = Math.round((e.entlastungAbJahrZwei / e.rate) * 100);
  return { mieter, finanzamt, kunde: 100 - mieter - finanzamt };
}

const euro = (wert: number) => `${new Intl.NumberFormat("de-DE").format(wert)} €`;

/**
 * Der Rechenweg als ein Satz für die Folie, bewusst ohne Anrede, damit er in
 * der Sie- und in der Du-Fassung gleich stehen kann.
 */
export function rateRechenweg(e: RateEingang): string {
  return (
    `${euro(e.kaltmiete)} Kaltmiete minus ${euro(e.nichtUmlagefaehig)} nicht umlagefähige Kosten ` +
    `ergeben ${euro(mieterbeitrag(e))} vom Mieter, dazu ${euro(e.entlastungAbJahrZwei)} Steuerentlastung ` +
    `ab dem zweiten Jahr und ${euro(e.eigenbeitragAbJahrZwei)} eigener Beitrag. ` +
    `Zusammen genau die Rate von ${euro(e.rate)}.`
  );
}
