import { CarFront, HandCoins } from "lucide-react";
import { Detail } from "@/components/objektseite/Bausteine";
import { useLiveVersion } from "@/hooks/useLiveData";
import { GARAGEN_STATUS_TEXT, berechneGarantie, einmalAnteil, garageFuerEinheit, mietgarantieFuerObjekt } from "@/lib/mietgarantie";
import { useMietkennzahlen } from "@/lib/mietkennzahlen";
import type { BlickZeile } from "@/lib/objektKennzahlen";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/*
 * Ist-Miete, Mietgarantie und Garage auf Objekt- und Einheitenseite
 * (Christian, 17.10.2026). Keine eigene Karte: Auf der Einheitenseite stehen
 * die Werte als Zeilen in der „Mietübersicht“ der Objektdetails, auf der
 * Objektseite als zwei Felder der Objektdetails. Sichtbar für alle, die die
 * Seiten sehen, auch für Vertriebspartner. Mieternamen stehen nie dabei; die
 * Ist-Miete kommt aus `mietkennzahlen_je_einheit`. Gepflegt wird in den
 * Objektdaten. Diese Datei binden nur `ObjektSeite` und `EinheitSeite` ein,
 * nie Exposé oder Kundenansicht.
 */

const eur = (n: number, stellen = 2) => n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) + " €";
const datum = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);

/** Zusätzliche Zeilen für die Mietübersicht einer Einheit. Leer, wenn es nichts zu zeigen gibt. */
export function useGarantieZeilen(objekt: ObjektData, w: ObjektWohnung): BlickZeile[] {
  useLiveVersion(["objekte", "wohnungen"]);
  const kennzahlen = useMietkennzahlen(objekt.id);
  const regel = mietgarantieFuerObjekt(objekt.id);
  const garage = garageFuerEinheit(w.id);
  const k = kennzahlen?.get(w.id);
  const zeilen: BlickZeile[] = [];

  if (k) {
    zeilen.push({
      id: "istKaltmiete", label: "Ist-Kaltmiete", wert: eur(k.kaltmiete),
      unter: [w.groesse > 0 ? `${eur(k.kaltmiete / w.groesse)} je m²` : "", k.mietbeginn ? `vermietet seit ${datum(k.mietbeginn)}` : "", k.befristetBis ? `befristet bis ${datum(k.befristetBis)}` : ""].filter(Boolean).join(", "),
      info: "Die Kaltmiete, die der jetzige Mieter laut Mietvertrag zahlt.",
    });
  } else if (kennzahlen && regel) {
    zeilen.push({ id: "istKaltmiete", label: "Ist-Kaltmiete", wert: "kein Mieter erfasst", info: "Für diese Einheit ist kein Mieter erfasst. Die Garantie rechnet dann mit 0 € Ist-Miete." });
  }

  if (regel?.art === "einmal") {
    const summe = objekt.wohnungen.reduce((s, x) => s + (x.vkGesamt || 0), 0);
    const anteil = einmalAnteil(regel, w.vkGesamt || 0, summe);
    if (anteil > 0) zeilen.push({
      id: "mietsubvention", label: "Mietsubvention", wert: `${eur(anteil)} einmalig`,
      unter: `Anteil an ${eur(regel.einmalBetrag, 0)} für das Objekt, nach Kaufpreis`,
      info: "Ein Betrag für das ganze Objekt, verteilt auf die Einheiten nach ihrem Anteil an den Kaufpreisen.",
    });
  } else if (regel && w.groesse > 0) {
    const g = berechneGarantie(regel, w.groesse, k?.kaltmiete ?? 0, garage);
    zeilen.push({
      id: "zielmiete", label: "Zielmiete", wert: eur(g.zielMiete),
      unter: regel.art === "steigerung" ? `Ist-Miete plus ${(regel.steigerung * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %` : `${eur(regel.zielQm)} je m²`,
      info: "Die Miete, die wir dem Käufer garantieren: Zielmiete je m² mal Wohnfläche.",
    });
    zeilen.push({
      id: "mietgarantie", label: "Mietdifferenz-Garantie", wert: `${eur(g.garantieMonat)} im Monat`,
      unter: `${regel.laufzeitMonate} Monate ab Übergabe, höchstens ${eur(g.garantieMonat * regel.laufzeitMonate, 0)}`,
      info: `Die Differenz zwischen Zielmiete und Ist-Miete zahlen wir als Subvention. ${regel.garageAnrechnung > 0 ? `Eine zugeordnete Garage zählt dabei mit ${eur(regel.garageAnrechnung, 0)}. ` : ""}Mieterhöhungen senken den Betrag, deshalb ist die Summe eine Obergrenze.`,
    });
    if (g.garagenSubventionMonat > 0) {
      zeilen.push({
        id: "garagenSubvention", label: "Garagen-Subvention", wert: `${eur(g.garagenSubventionMonat)} im Monat`,
        unter: `${regel.garagenSubventionMonate} Monate`,
        info: `Im ersten Jahr stocken wir die Garagenmiete auf ${eur(regel.garageAnrechnung, 0)} auf.`,
      });
    }
  }

  if (garage) {
    zeilen.push({
      id: "garage", label: garage.art === "stellplatz" ? "Stellplatz" : "Garage", wert: garage.nr,
      unter: [GARAGEN_STATUS_TEXT[garage.status], garage.istMiete ? `${eur(garage.istMiete)} Miete im Monat` : "", w.stellplatzPreis ? `Kaufpreis ${eur(w.stellplatzPreis, 0)}` : ""].filter(Boolean).join(", "),
      info: "Garage oder Stellplatz laut Teilungserklärung, mit Vermietung und Kaufpreis.",
    });
  }
  return zeilen;
}

/** Zwei Felder für die Objektdetails der Objektseite. Null, wenn es weder Garantie noch Garagen gibt. */
export function ObjektGarantieDetails({ objekt }: { objekt: ObjektData }) {
  useLiveVersion(["objekte", "wohnungen"]);
  const kennzahlen = useMietkennzahlen(objekt.id);
  const regel = mietgarantieFuerObjekt(objekt.id);
  const garagen = objekt.wohnungen.map((w) => garageFuerEinheit(w.id));
  const anzahl = garagen.filter(Boolean).length;
  if (!regel && !anzahl) return null;
  const summe = regel ? objekt.wohnungen.reduce((s, w, i) => (w.groesse > 0
    ? s + berechneGarantie(regel, w.groesse, kennzahlen?.get(w.id)?.kaltmiete ?? 0, garagen[i]).garantieMonat
    : s), 0) : 0;
  const frei = garagen.filter((g) => g?.status === "frei").length;
  return (
    <>
      {regel && (
        <Detail icon={<HandCoins className="h-3.5 w-3.5" />} label="Mietsubvention"
          wert={regel.art === "einmal" ? `${eur(regel.einmalBetrag, 0)} einmalig`
            : regel.art === "steigerung" ? `Ist-Miete plus ${(regel.steigerung * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % für ${regel.laufzeitMonate} Monate`
            : `${eur(regel.zielQm)} je m² für ${regel.laufzeitMonate} Monate`}
          unter={[kennzahlen && regel.art !== "einmal" ? `Differenz zur Ist-Miete heute ${eur(summe, 0)} im Monat für alle Einheiten` : "",
            regel.garageAnrechnung > 0 ? `Garage zählt mit ${eur(regel.garageAnrechnung, 0)}, im ersten Jahr darauf subventioniert` : ""].filter(Boolean).join(". ")} />
      )}
      {anzahl > 0 && (
        <Detail icon={<CarFront className="h-3.5 w-3.5" />} label="Garagen und Stellplätze"
          wert={`${anzahl} von ${objekt.wohnungen.length} Einheiten`}
          unter={frei ? `${frei} davon frei` : "alle vermietet"} />
      )}
    </>
  );
}
