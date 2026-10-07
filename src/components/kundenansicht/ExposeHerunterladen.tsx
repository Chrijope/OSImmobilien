import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Person } from "@/lib/exposeInhalt";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { kundenExposePdf } from "@/lib/kundenansichtExpose";
import { useKundenTexte } from "./kundenansichtTexte";

/**
 * „Exposé herunterladen“ oben rechts in der Kundenansicht: eine echte
 * PDF-Datei (Frage 6 vom 23.09.2026). Auf der Wohnungsebene das Exposé dieser
 * Wohnung, beim Globalobjekt das des ganzen Hauses (`wohnung = null`).
 */
export function ExposeHerunterladen({ objekt, wohnung, partner }: {
  objekt: ObjektData;
  wohnung: ObjektWohnung | null;
  partner?: Person;
}) {
  /*
   * Das PDF folgt der Sprache der Seite, also der des Kunden (Etappe 5).
   * Bis zum 25.09.2026 kam es hier immer deutsch heraus, auch unter einem
   * englischen Kundenlink mit englischem Knopf.
   */
  const { t, sprache } = useKundenTexte();
  const [laeuft, setLaeuft] = useState(false);
  const herunterladen = async () => {
    setLaeuft(true);
    try {
      const { blob, dateiname } = await kundenExposePdf(objekt, wohnung, partner, new Date(), sprache);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("[Kundenansicht] Exposé-PDF:", e);
      toast.error(t.expose.fehler);
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Button type="button" className="gap-1.5" onClick={() => void herunterladen()} disabled={laeuft} data-testid="expose-herunterladen">
      {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {t.expose.herunterladen}
    </Button>
  );
}
