import BeratungspraesentationHV, { type BeratungVorschau } from "./BeratungspraesentationHV";

/*
 * Druckansicht der Beratungspräsentation (21.10.2026), Quelle der Folien-PDF.
 * Nur im Entwicklungsmodus (vorschauRouten.ts). Dieselben Folien wie im CRM
 * und im Artefakt, ohne Kunde und ohne Partner, beide Konzepte nacheinander.
 * Seitenformat, Einpassen und Fußzeile setzt scripts/beratung-pdf/erzeuge.mjs.
 */

/** Kein Kunde, kein Partner, kein Erstgespräch, wie im Artefakt (src/artefakt/main.tsx). */
const OHNE_KUNDE: BeratungVorschau = { schluessel: "", kundenName: "", kontakt: {}, skript: null };

export default function VorschauBeratungDruck() {
  // weiterZurSelbstauskunft wie im Artefakt: Dann gilt der Text ohne CRM-Buchungslink.
  return <BeratungspraesentationHV variante="b" vorschau={OHNE_KUNDE} ohneProfil druck weiterZurSelbstauskunft={() => {}} />;
}
