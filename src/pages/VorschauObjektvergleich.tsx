import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { KundenObjektvergleichDokument } from "@/components/investmentrechner/kundenvergleich/KundenObjektvergleichDokument";
import { rechneEinheit, vergleichDateiname } from "@/lib/investmentrechner/kundenObjektvergleich";
import { BEISPIEL_HAEUSERUEBERGREIFEND, BEISPIEL_VERGLEICH } from "@/lib/investmentrechner/kundenObjektvergleichBeispiel";

/*
 * /vorschau/objektvergleich: der persönliche Objektvergleich mit erfundener
 * Kundin und den Zahlen der Vorlage (Hauffstraße WE 12/13, 28.10.2026), nur
 * im Entwicklungsmodus (vorschauRouten.ts).
 */
export default function VorschauObjektvergleich() {
  const ref = useRef<HTMLDivElement>(null);
  const [params] = useSearchParams();
  const v = params.has("haeuser") ? BEISPIEL_HAEUSERUEBERGREIFEND : BEISPIEL_VERGLEICH;
  const [A, B] = v.einheiten.map((e) => rechneEinheit(e, v.annahmen));
  const pdf = async () => {
    const { erzeugeBerechnungsansichtPdf } = await import("@/lib/investmentrechner/berechnungAnsichtPdf");
    ref.current!.classList.add("kov-export");
    try { (await erzeugeBerechnungsansichtPdf(ref.current!)).save(vergleichDateiname(v, "28.10.2026")); }
    finally { ref.current!.classList.remove("kov-export"); }
  };
  return (
    <div className="kov-vorschau" style={{ background: "#e9ece9", padding: 24 }}>
      <button type="button" id="vorschau-pdf" onClick={pdf} style={{ marginBottom: 12 }}>PDF</button>
      <div ref={ref}><KundenObjektvergleichDokument v={v} A={A} B={B} /></div>
    </div>
  );
}
