import { useRef } from "react";
import { KundenObjektvergleichDokument } from "@/components/investmentrechner/kundenvergleich/KundenObjektvergleichDokument";
import {
  LEERE_TEXTE, STANDARD_ANNAHMEN, rechneEinheit, vergleichDateiname, type KundenObjektvergleich,
} from "@/lib/investmentrechner/kundenObjektvergleich";

/*
 * /vorschau/objektvergleich: der persönliche Objektvergleich mit erfundener
 * Kundin und den Zahlen der Vorlage (Hauffstraße WE 12/13, 28.10.2026), nur
 * im Entwicklungsmodus (vorschauRouten.ts).
 */
const BEISPIEL: KundenObjektvergleich = {
  version: 1, stand: "2026-10-28", kontaktId: null, investmentId: null, variante: "",
  kunde: {
    anrede: "Frau", vorname: "Anna", nachname: "Muster", netto: 3500, bruttoJahr: 68000, steuerklasse: "I", familienstand: "ledig",
    kinder: "keine", beschaeftigung: "angestellt, unbefristet, seit 2023", antrag: "allein, ohne Mitantragsteller",
    wohnsituation: "zur Miete, 790 € warm", mieteWarm: 790, lebenshaltung: 1000, kredite: "keine", kreditRaten: 0, kapital: 25000,
    jahreBisRente: 40, saDatum: "2026-08-31",
  },
  objekt: {
    strasse: "Hauffstraße 38 c", ortZeile: "14548 Schwielowsee OT Geltow", fotoTitel: "", fotoHaus: "",
    hausPunkte: ["Baujahr 2000, Aufzug, Gasheizung von 2017", "Junge Wohnanlage, rund 350.000 € Instandhaltung 2020 bis 2026"],
    verwaltung: "Beispiel Verwaltung GmbH", vergleichsmieteQm: 14.79, vergleichsmieteQuelle: "Portal", wirtschaftsplan: "Wirtschaftsplan 2027",
  },
  annahmen: STANDARD_ANNAHMEN,
  einheiten: [
    { nr: "12", zimmer: 2, qm: 56, lage: "3. OG links", kpWohnung: 220000, kpListe: 0, garagen: 1, garageKp: 15000, garageMiete1: 80, garageMieteZiel: 150,
      garageIstVon: 40, garageIstBis: 50, mieteIst: 544, mieteSubQm: 13, u: 242.53, n: 81.83, r: 48.65, afaJahre: 32 },
    { nr: "13", zimmer: 3, qm: 72.36, lage: "3. OG rechts", kpWohnung: 270000, kpListe: 0, garagen: 1, garageKp: 15000, garageMiete1: 80, garageMieteZiel: 150,
      garageIstVon: 40, garageIstBis: 50, mieteIst: 900, mieteSubQm: 13, u: 202.8, n: 96.3, r: 62.81, afaJahre: 32 },
  ],
  texte: LEERE_TEXTE,
};

export default function VorschauObjektvergleich() {
  const ref = useRef<HTMLDivElement>(null);
  const [A, B] = BEISPIEL.einheiten.map((e) => rechneEinheit(e, BEISPIEL.annahmen));
  const pdf = async () => {
    const { erzeugeBerechnungsansichtPdf } = await import("@/lib/investmentrechner/berechnungAnsichtPdf");
    ref.current!.classList.add("kov-export");
    try { (await erzeugeBerechnungsansichtPdf(ref.current!)).save(vergleichDateiname(BEISPIEL, "28.10.2026")); }
    finally { ref.current!.classList.remove("kov-export"); }
  };
  return (
    <div className="kov-vorschau" style={{ background: "#e9ece9", padding: 24 }}>
      <button type="button" id="vorschau-pdf" onClick={pdf} style={{ marginBottom: 12 }}>PDF</button>
      <div ref={ref}><KundenObjektvergleichDokument v={BEISPIEL} A={A} B={B} /></div>
    </div>
  );
}
