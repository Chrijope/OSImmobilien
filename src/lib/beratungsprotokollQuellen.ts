/**
 * Liest für das Beratungs- und Qualitätsprotokoll zusammen, was das CRM zu
 * einem Investment weiß. Die Zuordnung zu den Feldern macht `vorbelegen` in
 * `beratungsprotokoll.ts`.
 */
import { getInvestmentById, getInvestmentMetaField } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { garageFuerEinheit } from "@/lib/mietgarantie";
import { getMieter } from "@/lib/mieterStore";
import { vorhandeneObjektDaten } from "@/lib/objektDatenPflicht";
import { aktuellerMieter } from "@/lib/objektdaten";
import { heuteIso, type CrmQuellen } from "@/lib/beratungsprotokoll";

export function crmQuellen(kontaktId: string, investmentId: string, nutzerName: string): CrmQuellen {
  const k = getKontaktById(kontaktId);
  const inv = getInvestmentById(investmentId);
  const sa = getInvestmentMetaField<Record<string, any>>(investmentId, "saData", {}) || {};
  const o = vorhandeneObjektDaten(investmentId);
  const wohnungId = inv?.wohnungId;
  const garage = wohnungId ? garageFuerEinheit(wohnungId) : null;
  const mieter = wohnungId ? aktuellerMieter(getMieter(), wohnungId) : undefined;
  return {
    kunde: {
      // Kontakt zuerst, die Selbstauskunft nur als Rückfall für die Anschrift.
      vorname: k?.vorname || sa.vorname, nachname: k?.nachname || sa.nachname,
      strasse: k?.strasse || sa.strasse, hausnummer: k?.strasse ? k?.hausnummer : sa.hausnummer,
      plz: k?.plz || sa.plz, ort: k?.ort || sa.ort,
      quelle: k?.quelle, berater: k?.berater,
      erstgespraechDatum: k?.setterTerminDatum,
    },
    person2: sa.person2 && sa.person2Data ? { vorname: sa.person2Data.vorname, nachname: sa.person2Data.nachname } : null,
    objekt: {
      strasse: o.strasse, plz: o.plz, ort: o.ort, weNr: o.weNr,
      kaufpreis: o.kaufpreis, wohnflaeche: o.wohnflaeche, etage: o.etage, lage: o.lage,
    },
    stellplatz: garage?.nr ? { art: garage.art, nr: garage.nr } : null,
    mieter: mieter ? { kaltmiete: mieter.kaltmiete } : null,
    nutzerName,
    heute: heuteIso(),
  };
}
