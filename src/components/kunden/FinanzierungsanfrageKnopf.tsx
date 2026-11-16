import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cacheGet } from "@/lib/dataCache";
import { getWohnungKurz } from "@/lib/objekteStore";
import { kaufpreisAusMeta } from "@/lib/investmentsStore";
import { erzeugeFinanzierungsanfrage, type AnfrageObjekt } from "@/lib/finanzierungsanfrage";

/**
 * Lädt die Finanzierungsanfrage (Baufi24-Datenerfassung), gefüllt aus der
 * Selbstauskunft dieses Investments und den Daten der Wohnung. Bei jedem
 * Klick neu erzeugt, also immer auf dem Stand der Selbstauskunft.
 */
export function FinanzierungsanfrageKnopf({ investmentId, kundeName }: { investmentId: string; kundeName: string }) {
  const { toast } = useToast();
  const [laeuft, setLaeuft] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- investments.meta ist roh
  const meta = (cacheGet("investments").find((r: any) => r.id === investmentId)?.meta as any) || {};
  const sa = meta.saData || meta.saSnapshot;
  if (!sa) return null;

  const laden = async () => {
    setLaeuft(true);
    try {
      const w = getWohnungKurz(meta.objektId, meta.wohnungId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zeile aus dem Zwischenspeicher
      const objektZeile = w ? (cacheGet("objekte").find((o: any) => o.id === w.objektId) as any) : undefined;
      const objekt: AnfrageObjekt | null = w ? {
        strasse: w.adresse, plz: w.plz, ort: w.ort,
        baujahr: Number(objektZeile?.global_baujahr) || undefined,
        wohnflaeche: w.groesse || undefined,
        kaufpreis: kaufpreisAusMeta(meta) || w.vkGesamt || undefined,
      } : null;
      const pdf = await erzeugeFinanzierungsanfrage(sa, objekt);
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Finanzierungsanfrage_${kundeName.replace(/\s+/g, "_")}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error("Finanzierungsanfrage", err);
      toast({ title: "PDF-Fehler", description: "Die Finanzierungsanfrage konnte nicht erzeugt werden.", variant: "destructive" });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <button
      className="text-xs text-primary hover:underline uppercase tracking-wide ml-3 inline-flex items-center gap-1 disabled:opacity-50"
      title="Finanzierungsanfrage mit den Angaben aus der Selbstauskunft, ohne Unterschrift"
      disabled={laeuft}
      onClick={laden}
    >
      📄 {laeuft ? "Wird erstellt …" : "Finanzierungsanfrage"}
    </button>
  );
}
