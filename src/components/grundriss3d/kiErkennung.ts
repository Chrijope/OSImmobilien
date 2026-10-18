import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { grundrisseFuerExpose, istAblageZeiger } from "@/lib/exposeInhalt";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { resolveUnterlagenUrl } from "@/lib/storage";
import { geschossSchluessel } from "../../../supabase/functions/_shared/grundriss-erkennung.ts";
import { geschossAusSchluessel, planAusKi, type KiErgebnis } from "./kiPlan";

/*
 * Grundriss der Einheit automatisch in einen 3D-Plan (18.10.2026).
 *
 * Welcher Plan es ist, entscheidet dieselbe Erkennung wie im Exposé
 * (`grundrisseFuerExpose`). Nur ein Plan der Einheit selbst zählt, kein
 * Ersatz (Geschoss- oder Hausplan): Darin stünden auch fremde Wohnungen.
 */

/** Längste Kante des Bildes für die KI. Mehr bringt keine genaueren Linien, nur Kosten. */
const KANTE = 1600;

export interface GrundrissQuelle { name: string; url: string; istBild: boolean }

export function grundrissDerEinheit(objekt: ObjektData, wohnung: ObjektWohnung): GrundrissQuelle | null {
  const plan = grundrisseFuerExpose(objekt, wohnung).find((p) => !p.ersatz);
  return plan ? { name: plan.name, url: plan.url, istBild: plan.istBild } : null;
}

function bildLaden(url: string): Promise<HTMLImageElement> {
  return new Promise((fertig, fehler) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => fertig(img);
    img.onerror = () => fehler(new Error("Grundriss-Bild ließ sich nicht laden."));
    img.src = url;
  });
}

/** Bild oder erste PDF-Seite als JPEG mit höchstens `KANTE` Bildpunkten. */
async function alsJpeg(quelle: GrundrissQuelle): Promise<{ dataUrl: string; breite: number; hoehe: number }> {
  const url = istAblageZeiger(quelle.url) ? await resolveUnterlagenUrl(quelle.url) : quelle.url;
  if (!url) throw new Error("Die Grundriss-Datei ist nicht erreichbar.");
  let flaeche: HTMLCanvasElement;
  if (quelle.istBild) {
    const img = await bildLaden(url);
    const f = Math.min(1, KANTE / Math.max(img.naturalWidth, img.naturalHeight));
    flaeche = document.createElement("canvas");
    flaeche.width = Math.max(1, Math.round(img.naturalWidth * f));
    flaeche.height = Math.max(1, Math.round(img.naturalHeight * f));
    const stift = flaeche.getContext("2d");
    if (!stift) throw new Error("Zeichenfläche nicht verfügbar");
    stift.fillStyle = "#ffffff"; // durchsichtige PNGs würden im JPEG schwarz
    stift.fillRect(0, 0, flaeche.width, flaeche.height);
    stift.drawImage(img, 0, 0, flaeche.width, flaeche.height);
  } else {
    const { pdfOeffnen } = await import("@/lib/grundrissAusPdf");
    const pdf = await pdfOeffnen(url);
    try {
      flaeche = await pdf.zeichnen(1, KANTE);
    } finally {
      pdf.schliessen();
    }
  }
  return { dataUrl: flaeche.toDataURL("image/jpeg", 0.88), breite: flaeche.width, hoehe: flaeche.height };
}

/**
 * Erkennen, ohne zu speichern. Das Bild kommt als Hintergrund mit, damit der
 * Plan im Editor genau darauf liegt (`zumSpeichern` lässt es beim Speichern weg).
 */
export async function erkenneGrundriss(quelle: GrundrissQuelle, wohnung: Pick<ObjektWohnung, "groesse" | "etage">): Promise<KiErgebnis> {
  const bild = await alsJpeg(quelle);
  const { data, error } = await supabase.functions.invoke("grundriss-erkennen", { body: { bild: bild.dataUrl } });
  if (error) {
    const mitGrund = await edgeFehlerMitGrund(error, { functionName: "grundriss-erkennen" });
    throw mitGrund instanceof Error ? mitGrund : new Error("Die Erkennung ist fehlgeschlagen.");
  }
  const ergebnis = planAusKi((data as { roh?: unknown } | null)?.roh, bild, wohnung.groesse || undefined);
  if (!ergebnis) throw new Error("Im Grundriss ließen sich keine Wände mit Maßstab erkennen. Bitte im Editor nachzeichnen.");
  const geschoss = geschossAusSchluessel(geschossSchluessel(wohnung.etage, true));
  return {
    ...ergebnis,
    plan: {
      ...ergebnis.plan,
      ...(geschoss !== undefined ? { geschoss } : {}),
      hintergrund: { url: bild.dataUrl, pxProMeter: 1 / ergebnis.meterProPx },
    },
  };
}
