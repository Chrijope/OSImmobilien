/**
 * Beschreibung und Standortargumente im Wizard „Neues Objekt“ per KI
 * (Inhaber, 18.10.2026). Auftrag, Rechte und Bereinigung stehen in
 * `supabase/functions/_shared/objekt-wizard-texte.ts`, hier nur der Aufruf
 * der Function `objekt-wizard-texte` und das Verkleinern der Bilder.
 */
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import {
  argumenteBereinigen,
  beschreibungBereinigen,
  MAX_WIZARD_BILDER,
  type WizardTexteEingabe,
} from "../../supabase/functions/_shared/objekt-wizard-texte.ts";

export {
  darfObjektTexteErstellen,
  MAX_ARGUMENT,
  MAX_KURZBESCHREIBUNG,
  MAX_WIZARD_STANDORTARGUMENTE,
  type WizardTexteEingabe,
} from "../../supabase/functions/_shared/objekt-wizard-texte.ts";

const FUNKTION = "objekt-wizard-texte";
/** Längste Bildkante für die Bildanalyse; reicht, um Böden, Bäder und Fassade zu erkennen. */
const KANTE = 1024;

async function aufrufen(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke(FUNKTION, { body });
  if (error) {
    const mitGrund = await edgeFehlerMitGrund(error, { functionName: FUNKTION });
    throw new Error(mitGrund instanceof Error ? mitGrund.message : "Die KI ist gerade nicht erreichbar.");
  }
  return data;
}

export async function standortargumenteErstellen(angaben: WizardTexteEingabe): Promise<{ standortargumente: string[]; hinweise: string[] }> {
  // Die Function bereinigt schon; hier noch einmal, damit die Grenzen auch für jede andere Antwort gelten.
  return argumenteBereinigen(await aufrufen({ art: "standortargumente", angaben }));
}

export async function beschreibungErstellen(
  angaben: WizardTexteEingabe,
  bildUrls: string[],
): Promise<{ beschreibung: string; hinweise: string[]; bilder: number }> {
  const bilder: string[] = [];
  for (const url of bildUrls) {
    if (bilder.length >= MAX_WIZARD_BILDER) break;
    const jpeg = await alsJpeg(url).catch(() => undefined);
    if (jpeg) bilder.push(jpeg);
  }
  const ergebnis = beschreibungBereinigen(await aufrufen({ art: "beschreibung", angaben, bilder }));
  return { ...ergebnis, bilder: bilder.length };
}

/** Ein Bild (blob:, data: oder https) als verkleinertes JPEG. Fremde Server ohne CORS fallen weg. */
function alsJpeg(url: string): Promise<string> {
  return new Promise((fertig, fehler) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => fehler(new Error("Bild ließ sich nicht laden."));
    img.onload = () => {
      const f = Math.min(1, KANTE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * f));
      c.height = Math.max(1, Math.round(img.naturalHeight * f));
      const stift = c.getContext("2d");
      if (!stift) return fehler(new Error("Zeichenfläche nicht verfügbar"));
      stift.fillStyle = "#ffffff";
      stift.fillRect(0, 0, c.width, c.height);
      stift.drawImage(img, 0, 0, c.width, c.height);
      try {
        fertig(c.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        fehler(e);
      }
    };
    img.src = url;
  });
}
