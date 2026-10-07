/**
 * Zielgruppen-Filter für die Vertriebsakademie.
 * "alle" (Default) = zeigt alles.
 * "quereinsteiger" = versteckt Gold-Nuggets und Advanced-Übungen, Quereinsteiger-Hinweise expanded/hervorgehoben.
 * "profi" = versteckt / dämpft Quereinsteiger-Hinweise, hebt Gold-Nuggets und Advanced-Übungen hervor.
 */
import { useEffect, useState } from "react";
import type { AkademieSection } from "@/lib/vertriebsakademieContent";
import { supabase } from "@/integrations/supabase/client";

export type AkademieZielgruppe = "alle" | "quereinsteiger" | "profi";

const STORAGE_KEY = "va_zielgruppe";
const EVENT_NAME = "va-zielgruppe-changed";

export function getZielgruppe(): AkademieZielgruppe {
  if (typeof window === "undefined") return "alle";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "quereinsteiger" || v === "profi" || v === "alle") return v;
  return "alle";
}

export function setZielgruppe(z: AkademieZielgruppe): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, z);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
  speichereImProfil(z);
}

/**
 * Die Pfadwahl gehört ins Nutzerprofil, nicht nur in den Browserspeicher.
 *
 * Vorher landete ein Partner bei jedem Gerätewechsel wieder im
 * Quereinsteiger-Modus und verlor damit unbemerkt alle 52 Profi-exklusiven
 * Blöcke. Der lokale Speicher bleibt als schnelle Quelle bestehen, das Profil
 * ist die Wahrheit über Geräte hinweg.
 */
async function speichereImProfil(z: AkademieZielgruppe): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.rpc("merge_user_settings" as never, {
      _user_id: user.id,
      _patch: { va_zielgruppe: z },
    } as never);
  } catch { /* Offline oder nicht angemeldet, dann bleibt es beim lokalen Wert */ }
}

/** Holt die Pfadwahl aus dem Profil und übernimmt sie, falls sie abweicht. */
export async function ladeZielgruppeAusProfil(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select("einstellungen")
      .eq("user_id", user.id)
      .maybeSingle();
    const gespeichert = (data?.einstellungen as { va_zielgruppe?: string } | null)?.va_zielgruppe;
    if (gespeichert !== "quereinsteiger" && gespeichert !== "profi" && gespeichert !== "alle") return;
    if (gespeichert === getZielgruppe()) return;
    window.localStorage.setItem(STORAGE_KEY, gespeichert);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch { /* still, der lokale Wert trägt weiter */ }
}

export function useZielgruppe(): [AkademieZielgruppe, (z: AkademieZielgruppe) => void] {
  const [z, setZ] = useState<AkademieZielgruppe>(() => getZielgruppe());
  useEffect(() => {
    // Einmal je Mount mit dem Profil abgleichen, damit ein Gerätewechsel den
    // Pfad nicht still zurücksetzt.
    void ladeZielgruppeAusProfil();
  }, []);
  useEffect(() => {
    const onChange = () => setZ(getZielgruppe());
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return [z, setZielgruppe];
}

/** Soll die Gold-Nugget-Box gerendert werden? Immer sichtbar, außer im Quereinsteiger-Modus. */
export function showGoldNugget(z: AkademieZielgruppe): boolean {
  return z !== "quereinsteiger";
}

/** Sollen Advanced-Challenge-Übungen gerendert werden? Nicht im Quereinsteiger-Modus. */
export function showAdvancedUebung(z: AkademieZielgruppe): boolean {
  return z !== "quereinsteiger";
}

/** Sollen Standard-Übungen (nicht advanced) gerendert werden? Immer, außer im reinen Profi-Modus (dort optional dämpfen). */
export function showStandardUebung(_z: AkademieZielgruppe): boolean {
  return true;
}

/** Soll der Quereinsteiger-Hinweis prominent gezeigt werden? Nur im Quereinsteiger/Alle-Modus. */
export function showQuereinsteigerHinweis(z: AkademieZielgruppe): boolean {
  return z !== "profi";
}

/**
 * Bleibt von einem Abschnitt im gewählten Lernpfad überhaupt etwas übrig?
 *
 * Hintergrund: In Kapitel 15 und 16 bestehen die Abschnitte "Übungen"
 * ausschließlich aus Advanced-Übungen. Im Quereinsteiger-Pfad werden die
 * gefiltert, die Überschrift blieb bisher trotzdem stehen und der Zähler
 * zeigte "0 von 3". Solche Abschnitte werden gar nicht mehr gerendert.
 */
export function abschnittHatInhalt(sec: AkademieSection, z: AkademieZielgruppe): boolean {
  const hatText =
    !!sec.intro ||
    !!sec.absaetze?.length ||
    !!sec.bullets?.length ||
    !!sec.skripte?.length ||
    !!sec.einwaende?.length ||
    !!sec.checkliste?.length ||
    !!sec.links?.length ||
    !!sec.visuals?.length ||
    !!sec.praesentationEmbed;
  if (hatText) return true;
  if (sec.profiTipp && showGoldNugget(z)) return true;
  if (sec.goldNugget && showGoldNugget(z)) return true;
  if (sec.quereinsteigerHinweis && showQuereinsteigerHinweis(z)) return true;
  const zeigeAdvanced = showAdvancedUebung(z);
  return (sec.uebungen ?? []).some((u) => zeigeAdvanced || !u.advanced);
}