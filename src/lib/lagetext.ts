import { nachEbene, entfernungText, type KategorieErgebnis } from "@/lib/umgebung";

/**
 * Objektbeschreibungen aus Daten erzeugen, nicht aus Behauptungen.
 *
 * Der Text soll den Interessenten überzeugen. Das geht auf zwei Arten: mit
 * Adjektiven oder mit Zahlen. Adjektive fliegen im Beratungsgespräch auf,
 * sobald jemand nachschaut. Zahlen nicht.
 *
 * Deshalb entsteht der Mikrolagen-Absatz ausschließlich aus dem, was
 * OpenStreetMap tatsächlich verzeichnet: "Supermarkt in 300 Metern" statt
 * "hervorragende Nahversorgung". Beides klingt gut, aber nur das erste hält
 * einer Rückfrage stand.
 *
 * Für Region und Arbeitgeber gibt es keine solche Datenquelle. Diese Angaben
 * werden je Standort einmal recherchiert und hier gepflegt, mit Jahreszahl,
 * damit erkennbar ist, wie alt sie sind. Was nicht gepflegt ist, wird nicht
 * behauptet: Der Absatz entfällt dann einfach.
 */

export interface Regionswissen {
  /** Kreis oder Region, in der der Ort liegt. */
  region: string;
  /** Wirtschaftsraum, an den der Ort angebunden ist. */
  wirtschaftsraum?: string;
  /** Tragende Arbeitgeber oder Branchen. Nur Belegbares. */
  arbeitgeber?: string[];
  /** Was den Standort sonst ausmacht, ein bis zwei Punkte. */
  besonderheiten?: string[];
  /** Jahr der Recherche. Steht im Text, damit das Alter sichtbar ist. */
  stand: number;
}

/**
 * Recherchiertes Regionswissen je Postleitzahl.
 *
 * Bewusst klein gehalten und je Standort belegt. Eine erfundene
 * Arbeitgeberzahl in einem Exposé ist keine Ungenauigkeit, sondern eine
 * Falschangabe in einer Verkaufsunterlage.
 */
export const REGIONEN: Record<string, Regionswissen> = {
  "91722": {
    region: "Landkreis Ansbach, Mittelfranken",
    wirtschaftsraum: "Metropolregion Nürnberg",
    arbeitgeber: [
      "über 5.000 Betriebe im Landkreis Ansbach",
      "drei Hochschulen in Ansbach",
    ],
    besonderheiten: [
      "Fränkisches Seenland als Naherholungsgebiet",
      "ländlich geprägt, überwiegend Handwerk und Mittelstand",
    ],
    stand: 2026,
  },
  "74564": {
    region: "Landkreis Schwäbisch Hall, Baden-Württemberg",
    wirtschaftsraum: "Wirtschaftsraum Heilbronn-Franken",
    besonderheiten: ["Mittelzentrum mit eigenem Bahnanschluss"],
    stand: 2026,
  },
  "75038": {
    region: "Landkreis Karlsruhe, Baden-Württemberg",
    wirtschaftsraum: "Technologieregion Karlsruhe",
    besonderheiten: ["Kraichgau, zwischen Karlsruhe und Heilbronn gelegen"],
    stand: 2026,
  },
  "81735": {
    region: "München, Stadtbezirk Ramersdorf-Perlach",
    wirtschaftsraum: "Metropolregion München",
    besonderheiten: ["angespannter Wohnungsmarkt mit hoher Nachfrage"],
    stand: 2026,
  },
  "81737": {
    region: "München, Stadtbezirk Ramersdorf-Perlach",
    wirtschaftsraum: "Metropolregion München",
    besonderheiten: ["angespannter Wohnungsmarkt mit hoher Nachfrage"],
    stand: 2026,
  },
  "90429": {
    region: "Nürnberg, Stadtteil Gostenhof-West",
    wirtschaftsraum: "Metropolregion Nürnberg",
    besonderheiten: ["innenstadtnah, gewachsene Mischnutzung"],
    stand: 2026,
  },
};

export interface LagetextEingabe {
  plz: string;
  ort: string;
  /** Ergebnis der Umgebungsanalyse. Fehlt es, entfällt der Mikrolagen-Absatz. */
  umgebung?: KategorieErgebnis[] | null;
  /** Baujahr, Bauzustand und Anlageklasse für den Objektabsatz. */
  baujahr?: number;
  bauzustand?: string;
  anlageklasse?: string;
  /** Für den Investmentabsatz. */
  kaufpreis?: number;
  kaltmiete?: number;
  flaeche?: number;
}

/** Aufzählung mit "und" vor dem letzten Glied. */
function undListe(teile: string[]): string {
  if (teile.length === 0) return "";
  if (teile.length === 1) return teile[0];
  return `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

/**
 * Mikrolage aus den tatsächlich verzeichneten Einrichtungen.
 *
 * Nur die nächstgelegene je Kategorie, mit Entfernung. Sieben Supermärkte
 * aufzuzählen überzeugt niemanden, einer in dreihundert Metern schon.
 */
function mikroAbsatz(umgebung: KategorieErgebnis[]): string | null {
  const gruppen = nachEbene(umgebung, "mikro");
  if (gruppen.length === 0) return null;

  const nah = gruppen
    .map((g) => ({ label: g.kategorie.label, meter: g.orte[0].entfernung }))
    .sort((a, b) => a.meter - b.meter);

  const teile = nah.map((n) => `${n.label} in ${entfernungText(n.meter)}`);
  const zuFuss = nah.filter((n) => n.meter <= 600).length;

  let satz = `Zu Fuß erreichbar sind ${undListe(teile)}.`;
  if (zuFuss >= 3) {
    satz += ` Damit liegen ${zuFuss} Einrichtungen des täglichen Bedarfs in wenigen Gehminuten.`;
  }
  return satz;
}

/** Makrolage aus Umgebungsdaten plus gepflegtem Regionswissen. */
function makroAbsatz(eingabe: LagetextEingabe): string | null {
  const wissen = REGIONEN[eingabe.plz];
  const gruppen = eingabe.umgebung ? nachEbene(eingabe.umgebung, "makro") : [];
  const saetze: string[] = [];

  if (wissen) {
    let s = `${eingabe.ort} liegt im ${wissen.region}`;
    if (wissen.wirtschaftsraum) s += ` und ist an die ${wissen.wirtschaftsraum} angebunden`;
    saetze.push(`${s}.`);
  }

  if (gruppen.length > 0) {
    const teile = gruppen
      .map((g) => ({ label: g.kategorie.label, meter: g.orte[0].entfernung }))
      .sort((a, b) => a.meter - b.meter)
      .map((n) => `${n.label} in ${entfernungText(n.meter)}`);
    saetze.push(`Im weiteren Umkreis: ${undListe(teile)}.`);
  }

  if (wissen?.besonderheiten?.length) {
    saetze.push(`${undListe(wissen.besonderheiten.map((b) => b.charAt(0).toUpperCase() + b.slice(1)))}.`);
  }

  return saetze.length > 0 ? saetze.join(" ") : null;
}

/** Wirtschaft und Arbeitgeber. Nur wenn belegt, sonst gar nicht. */
function wirtschaftAbsatz(plz: string): string | null {
  const w = REGIONEN[plz];
  if (!w?.arbeitgeber?.length) return null;
  return `${undListe(w.arbeitgeber.map((a) => a.charAt(0).toUpperCase() + a.slice(1)))} tragen die Wirtschaft der Region (Stand ${w.stand}).`;
}

/** Kennzahlen zum Investment, gerechnet statt behauptet. */
function investmentAbsatz(e: LagetextEingabe): string | null {
  const punkte: string[] = [];
  if (e.kaufpreis && e.flaeche) {
    const qm = e.kaufpreis / e.flaeche;
    punkte.push(`Kaufpreis ${Math.round(qm).toLocaleString("de-DE")} € je m²`);
  }
  if (e.kaltmiete && e.kaufpreis) {
    const brutto = ((e.kaltmiete * 12) / e.kaufpreis) * 100;
    punkte.push(`Bruttorendite ${brutto.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`);
  }
  if (e.kaltmiete && e.flaeche) {
    const mqm = e.kaltmiete / e.flaeche;
    punkte.push(`Kaltmiete ${mqm.toLocaleString("de-DE", { maximumFractionDigits: 2 })} € je m²`);
  }
  return punkte.length > 0 ? punkte.map((p) => `- ${p}`).join("\n") : null;
}

/**
 * Die fertige Beschreibung.
 *
 * Aufbau in Abschnitten, die `Objektbeschreibung` als Überschriften erkennt.
 * Fehlt für einen Abschnitt die Grundlage, entfällt er, statt mit
 * Allgemeinplätzen gefüllt zu werden.
 */
export function erzeugeBeschreibung(e: LagetextEingabe): string {
  const teile: string[] = [];

  // ── Das Objekt ──
  const objekt: string[] = [];
  if (e.anlageklasse) objekt.push(e.anlageklasse);
  if (e.bauzustand) objekt.push(e.bauzustand.toLowerCase());
  if (e.baujahr) objekt.push(`Baujahr ${e.baujahr}`);
  if (objekt.length > 0) {
    teile.push("## Das Objekt", `${undListe(objekt.map((o, i) => (i === 0 ? o : o)))} in ${e.plz} ${e.ort}.`);
  }

  const mikro = e.umgebung ? mikroAbsatz(e.umgebung) : null;
  if (mikro) teile.push("## Mikrolage", mikro);

  const makro = makroAbsatz(e);
  if (makro) teile.push("## Makrolage", makro);

  const wirtschaft = wirtschaftAbsatz(e.plz);
  if (wirtschaft) teile.push("## Wirtschaft und Arbeitgeber", wirtschaft);

  const investment = investmentAbsatz(e);
  if (investment) teile.push("## Investment auf einen Blick", investment);

  return teile.join("\n\n");
}
