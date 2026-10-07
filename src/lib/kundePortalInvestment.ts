/**
 * Gemeinsamer Adapter: OS Immobilien-Investment (Tabelle investments plus
 * Finanzierung) → ExternesInvestment-Shape fuer die Kundenportal-Karten
 * (Steuer-Cockpit, Marktwert, Tilgungsplan, Cashflow-Forecast).
 *
 * Vorher bildeten KundeInvestments.tsx und KundeSteuerCockpit.tsx dasselbe
 * Investment mit zwei abweichenden Inline-Adaptern ab. Nur die Steuer-Seite
 * kannte den Raten-Fallback ueber monatsrateAusAngebot. Im Investments-Reiter
 * war die Rate deshalb oft 0, hatFinanzierung falsch und Tilgungsplan wie
 * Forecast blieben unsichtbar.
 *
 * Nebenkosten: nur ERFASSTE Werte. Der fruehere Pauschalansatz von 10,5 %
 * des Kaufpreises ist gestrichen, in der Steuerrechnung duerfen keine
 * stillen Schaetzwerte stecken.
 */

import { type ExternesInvestment } from "@/lib/eigeneInvestmentBerechnungen";
import { monatsrateAusAngebot } from "@/lib/finanzierungStore";

export type KundePortalInvestment = ExternesInvestment & {
  adresse: string;
  plz: string;
  ort: string;
  objekttyp: string;
  /** true, wenn Darlehenssumme und Monatsrate bekannt sind */
  hatFinanzierung: boolean;
};

export function adaptMoreImmoInvestment(
  activeInv: any,
  invMeta: any,
  finanzierung: any,
): KundePortalInvestment {
  const meta = invMeta || {};
  const akz = (finanzierung?.angebote || []).find(
    (a: any) => a.id === finanzierung?.akzeptiertes_angebot_id,
  ) || {};
  const wohnungSnap = meta?.wohnungSnapshot || {};
  /*
   * `meta.objektMeta` wird nirgends im Projekt geschrieben, der Zweig lief
   * immer leer. Gepflegt werden zwei andere Ablagen: `objektSnapshot`, den der
   * Investagon-Weg schreibt und den das Steuer-Cockpit bereits liest, und
   * `rvVirtualWohnung`, in der die von Hand eingetragenen Objektdaten liegen.
   * Der alte Name bleibt als letzter Rückfall stehen, falls doch irgendwo
   * Altdaten damit gespeichert sind.
   */
  const objMeta = meta?.objektSnapshot || meta?.objektMeta || {};
  /*
   * Die von Hand eingetragene Wohnung.
   *
   * Sie fehlte in allen Rückfallketten hier. Folge: Wer Fläche und Adresse
   * über die Objektauswahl im Investment eintrug, sah sie zwar in der
   * Objektkachel des Portals, aber im Steuer-Cockpit stand kein Preis je
   * Quadratmeter und in der Anlage V „Angabe fehlt“.
   */
  const virt = meta?.rvVirtualWohnung || {};
  const darlehenSumme = Number(akz.darlehensbetrag || akz.summe || meta?.darlehenssumme || 0);
  const zinssatzP = Number(
    akz.zinssatz ||
    parseFloat(String(akz.zins || meta?.zinssatz || "0").replace(",", ".")) || 0,
  );
  // Die Felder `monatlicheRate`/`rate` gibt es am Angebot nicht. Fehlt ein
  // manuell gepflegter Wert, wird die Rate aus Summe, Zins und Tilgung gerechnet.
  const monatsRate =
    Number(akz.monatlicheRate || akz.rate || meta?.monatlicheRate || 0) || monatsrateAusAngebot(akz);
  const jahresMiete = Number(
    meta?.jahresnettomiete ||
    (wohnungSnap?.miete ? wohnungSnap.miete * 12 : 0) ||
    (wohnungSnap?.nettomiete ? wohnungSnap.nettomiete * 12 : 0) ||
    (virt?.miete ? virt.miete * 12 : 0) || 0,
  );
  const mieteKaltMonat = jahresMiete > 0 ? jahresMiete / 12 : Number(wohnungSnap?.miete || 0);
  const hausgeldMonat = Number(
    meta?.hausgeldMonat || wohnungSnap?.hausgeldMonat || wohnungSnap?.hausgeld ||
    objMeta?.hausgeldMonat || virt?.hausgeld || 0,
  );
  const ruecklagenMonat = Number(meta?.ruecklagenMonat || wohnungSnap?.ruecklagen || 0);
  const baujahr = Number(meta?.baujahr || objMeta?.baujahr || wohnungSnap?.baujahr || virt?.baujahr || 0) || null;
  const wohnflaeche = Number(
    meta?.wohnflaeche || wohnungSnap?.flaeche || wohnungSnap?.wohnflaeche || virt?.groesse || 0,
  ) || null;
  const adresse = meta?.adresse || objMeta?.adresse || objMeta?.strasse || virt?.objAdresse || activeInv.objekt || "";
  const plz = meta?.plz || objMeta?.plz || virt?.objPlz || "";
  const ort = meta?.ort || objMeta?.ort || virt?.objOrt || "";
  const objekttyp = meta?.objekttyp || objMeta?.objekttyp || "wohnung";
  // Nur erfasste Nebenkosten, kein Pauschalansatz
  const nebenkosten = Number(meta?.nebenkosten || 0);
  /*
   * Der Kaufpreis steht in der Spalte `investments.kaufpreis`, die beim
   * Speichern der Objektdaten mitgefüllt wird. Sie kann aber nachhinken, etwa
   * wenn nur der Datensatz zusammengeführt und die Zeile selbst nicht
   * angefasst wurde. Dann steht der Preis trotzdem in der Ablage, und ohne
   * Preis bleibt im Portal die halbe Steuerseite gesperrt.
   */
  const kaufpreis = Number(
    activeInv.kaufpreis || meta?.kaufpreis || virt?.kaufpreis ||
    wohnungSnap?.vkGesamt || wohnungSnap?.vk_gesamt || wohnungSnap?.kaufpreis || 0,
  );

  return {
    id: activeInv.id,
    bezeichnung: activeInv.objekt || activeInv.wohnung || "OS Immobilien Investment",
    kaufpreis,
    kaufdatum: activeInv.kaufdatum || meta?.kaufdatum || meta?.notarTermin || null,
    baujahr,
    wohnflaeche,
    nebenkosten,
    darlehenssumme: darlehenSumme,
    // Nur eine tatsaechlich gepflegte Restschuld. Fehlt sie, schreibt
    // `aktuelleRestschuld` das Darlehen fort, statt die volle Summe zu zeigen.
    offene_tilgung: Number(meta?.restschuld) > 0 ? Number(meta.restschuld) : null,
    zinssatz: zinssatzP,
    monatliche_rate: monatsRate,
    mieteinnahmen_kalt: mieteKaltMonat,
    hausgeld: hausgeldMonat,
    ruecklagen: ruecklagenMonat,
    dokumente: meta?.dokumente || [],
    meta: meta || {},
    adresse, plz, ort, objekttyp,
    hatFinanzierung: darlehenSumme > 0 && monatsRate > 0,
  };
}
