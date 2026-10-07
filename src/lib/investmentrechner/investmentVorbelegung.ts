import type { ObjektUnterlagenQuelle } from "./objektUnterlagen";
/**
 * Vorbelegung des Investmentrechners aus einem Investment.
 *
 * Wer im Kundenprofil unter „Objektauswahl" auf „Neue Berechnung" klickt, soll
 * den Rechner nicht leer vorfinden. Was über das Objekt bekannt ist, steht am
 * Investment, und zwar an genau einer Stelle: `vorhandeneObjektDaten` in
 * objektDatenPflicht.ts. Gibt es dagegen eine Wohnung aus dem eigenen Bestand,
 * ist die Objektanlage die bessere Quelle, dann übernimmt
 * `vorbelegungAusEinheit` (objektVorbelegung.ts).
 *
 * Es entsteht also keine dritte Zuordnung. Diese Datei entscheidet nur,
 * welche der beiden vorhandenen greift, und trägt für jedes belegte Feld ein,
 * woher der Wert kommt.
 *
 * Im Zweifel bleibt ein Feld leer. Ein falsch belegtes Feld erzeugt eine
 * Berechnung, die richtig aussieht und falsch ist.
 */

import { getInvestmentById } from "@/lib/investmentsStore";
import { getObjekte } from "@/lib/objekteStore";
import { vorhandeneObjektDaten, weNrAnzeige } from "@/lib/objektDatenPflicht";
import { bundeslandFromPlz } from "@/lib/kaufnebenkosten";
import { setzeHerkunft, type Herkunft } from "./herkunft";
import { vorbelegungAusEinheit } from "./objektVorbelegung";
import { standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { leereUnterlagenDaten, type UnterlagenDaten } from "./unterlagenAuslesen";
import {
  saetzeFuerBundesland,
  standardKaufnebenkostenauswahl,
  type Kaufnebenkostenauswahl,
} from "./kaufnebenkostenAuswahl";

export interface InvestmentVorbelegung {
  quellen?: ObjektUnterlagenQuelle;
  eingabe: InvestmentEingabe;
  knk: Kaufnebenkostenauswahl;
  unterlagen: UnterlagenDaten;
  herkunft: Herkunft;
  /** Vorschlag für den Namen der Berechnung, etwa „Musterstraße 12, WE 7". */
  namensvorschlag: string;
  /** Die Einheit, falls eine aus dem eigenen Bestand verknüpft ist. */
  wohnungId: string | null;
}

function positiv(wert: unknown): number {
  const zahl = Number(wert);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
}

/** Objekt und Wohnung aus dem eigenen Bestand, falls das Investment sie kennt. */
function bestandsEinheit(objektId?: string, wohnungId?: string) {
  if (!wohnungId) return null;
  try {
    /*
     * Ohne Objekt-Kennung am Investment das Objekt der Wohnung nehmen, wie
     * `getWohnungKurz` es tut. Vorher reichte eine fehlende Objekt-Kennung,
     * und der Rechner startete trotz verknüpfter Wohnung ohne ihre Zahlen.
     */
    const objekt = getObjekte().find((o) =>
      objektId ? o.id === objektId : o.wohnungen.some((w) => w.id === wohnungId),
    );
    const wohnung = objekt?.wohnungen.find((w) => w.id === wohnungId);
    return objekt && wohnung ? { objekt, wohnung } : null;
  } catch {
    // Ein noch nicht gefüllter Zwischenspeicher darf hier nichts umwerfen.
    return null;
  }
}

/**
 * Modellannahmen des Rechners. Sie weichen vom Standard ab, ohne aus dem
 * Objekt zu stammen, und bekommen deshalb keinen Herkunftshinweis. Das
 * Startjahr etwa ist einfach das laufende Jahr.
 */
const KEINE_OBJEKTFELDER: readonly (keyof InvestmentEingabe)[] = ["startYear", "forecastYears"];

/**
 * Die Herkunft aller Felder, die eine Vorbelegung aus der Objektanlage gesetzt
 * hat.
 *
 * Erkannt wird das am Unterschied zur Standardeingabe. Das ist grob, aber
 * ehrlich: Belegt ein Objekt ein Feld zufällig mit dem Standardwert, fehlt der
 * Hinweis. Eine falsche Quelle unter einem Feld wäre schlimmer als ein
 * fehlender Satz.
 */
export function herkunftDerEinheit(eingabe: InvestmentEingabe, woher: string): Herkunft {
  const belegt = (Object.keys(eingabe) as (keyof InvestmentEingabe)[]).filter(
    (feld) => !KEINE_OBJEKTFELDER.includes(feld) && eingabe[feld] !== standardEingabe[feld],
  );
  return setzeHerkunft({}, belegt, {
    quelle: "objekt",
    text: woher ? `Aus der Objektanlage, ${woher}` : "Aus der Objektanlage",
  });
}

/**
 * Alles, was der Rechner aus einem Investment übernehmen kann.
 *
 * `heute` ist nur für Tests und für den Stichtag im Objektweg da.
 */
export function vorbelegungAusInvestment(
  investmentId: string | null | undefined,
  heute: Date = new Date(),
): InvestmentVorbelegung | null {
  if (!investmentId) return null;
  const investment = getInvestmentById(investmentId);
  if (!investment) return null;

  const bestand = bestandsEinheit(investment.objektId, investment.wohnungId);
  if (bestand) {
    const aus = vorbelegungAusEinheit(bestand.objekt, bestand.wohnung, heute);
    const woher = [bestand.objekt.titel, weNrAnzeige(bestand.wohnung.weNr)].filter(Boolean).join(", ");
    return {
      quellen: aus.quellen,
      eingabe: aus.eingabe,
      knk: aus.knk,
      unterlagen: aus.unterlagen,
      herkunft: aus.herkunft,
      namensvorschlag: woher || investment.objektTitel || investment.label,
      wohnungId: bestand.wohnung.id,
    };
  }

  // Von Hand eingetragenes Objekt: die Angaben liegen am Investment selbst.
  const daten = vorhandeneObjektDaten(investmentId);
  const eingabe: InvestmentEingabe = { ...standardEingabe, startYear: heute.getFullYear() };
  const belegt: (keyof InvestmentEingabe)[] = [];
  const setze = <K extends keyof InvestmentEingabe>(feld: K, wert: InvestmentEingabe[K] | 0 | "") => {
    if (wert === 0 || wert === "") return;
    eingabe[feld] = wert as InvestmentEingabe[K];
    belegt.push(feld);
  };

  const ort = [daten.plz, daten.ort].filter(Boolean).join(" ");
  setze("propertyTitle", [daten.strasse, weNrAnzeige(daten.weNr || "")].filter(Boolean).join(", "));
  setze("address", [daten.strasse, ort].filter(Boolean).join(", "));
  setze("area", positiv(daten.wohnflaeche));
  setze("rooms", positiv(daten.zimmer));
  setze("constructionYear", positiv(daten.baujahr));
  setze("purchasePrice", positiv(daten.kaufpreis));
  setze("monthlyColdRent", positiv(daten.miete));
  // Bewusst nur der nicht umlagefähige Teil des Hausgelds: Nur er belastet den
  // Eigentümer dauerhaft, das umlagefähige Hausgeld zahlt der Mieter.
  setze("monthlyOperatingCosts", positiv(daten.hausgeldNichtUmlage));

  // Die Kaufnebenkosten kommen wie im Objektweg über das Bundesland aus der
  // Postleitzahl. Ohne erkennbares Land bleibt die Auswahl leer, dann muss
  // sich jemand aktiv entscheiden statt mit einem geratenen Satz zu rechnen.
  let knk = standardKaufnebenkostenauswahl;
  const land = bundeslandFromPlz(daten.plz || "");
  const saetze = land ? saetzeFuerBundesland(land) : null;
  if (land && saetze) {
    eingabe.transferTaxRate = saetze.transferTaxRate;
    eingabe.notaryRate = saetze.notaryRate;
    eingabe.landRegisterRate = saetze.landRegisterRate;
    belegt.push("transferTaxRate", "notaryRate", "landRegisterRate");
    knk = { weg: "bundesland", bundesland: land };
  }

  const bezeichnung = [daten.strasse, weNrAnzeige(daten.weNr || "")].filter(Boolean).join(", ");
  return {
    eingabe,
    knk,
    unterlagen: leereUnterlagenDaten,
    herkunft: setzeHerkunft({}, belegt, { quelle: "objekt", text: "Aus den Objektdaten dieses Investments" }),
    namensvorschlag: bezeichnung || investment.objektTitel || investment.label,
    wohnungId: investment.wohnungId || null,
  };
}
