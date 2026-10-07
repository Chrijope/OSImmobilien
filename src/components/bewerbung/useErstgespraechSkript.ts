/**
 * Der Gesprächsstand des Erstgesprächs samt Autosave, einmal für den Reiter
 * Erstgespräch und die Moderationsansicht.
 *
 * Gehalten wird das Skript-Meta (erstgespraechSkript mit assessment und
 * closingDirekt) sowie Datum und Uhrzeit des Closing-Termins. Gespeichert
 * wird zweistufig: sofort in den LocalStorage als Reload-Schutz, und
 * verzögert (1,5 Sekunden) über updateBewerber in die Datenbank, zusammen
 * mit den Feldern, die sich in der Übersicht spiegeln (Bewertung, Motivation,
 * Ziele, Beschäftigungsart). Beide Oberflächen schreiben damit an dieselben
 * Stellen, es gibt keine zweite Wahrheit.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateBewerber, type Bewerber, type ErstgespraechSkript } from "@/lib/bewerbungStore";
import type { AssessmentAntworten } from "@/lib/assessmentSkript";
import { hatAntworten, type FormularAntworten } from "@/lib/bewerberFormular";
import { istClosingDirektAktiv, type ClosingDirektDaten } from "@/lib/closingDirektSkript";
import type { Vorwissen } from "@/components/bewerbung/VorwissenKarte";

type Draft = { skript?: ErstgespraechSkript; closingDatum?: string; closingUhrzeit?: string; savedAt?: string };

/** Schlüssel des LocalStorage-Entwurfs je Bewerber. */
export function erstgespraechDraftKey(bewerberId: string): string {
  return `bewerbung_erstgespraech_draft_${bewerberId}`;
}

function leseDraft(draftKey: string): Draft | null {
  try { const raw = localStorage.getItem(draftKey); return raw ? (JSON.parse(raw) as Draft) : null; }
  catch { return null; }
}

/**
 * Vorbelegung für Bestandsbewerber: Antworten aus dem alten Skript werden in
 * die passenden neuen Felder übernommen, aber nur solange das neue Feld noch
 * leer ist. Das Gespräch kann so mit dem neuen Skript fortgesetzt werden.
 */
export function mitVorbelegung(b: Bewerber, s: ErstgespraechSkript): ErstgespraechSkript {
  const a: AssessmentAntworten = { ...(s.assessment ?? {}) };
  const leer = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
  if (leer(a.ersteindruck) && s.ausgangslageNotiz) a.ersteindruck = s.ausgangslageNotiz;
  if (leer(a.antrieb) && b.motivation) a.antrieb = b.motivation;
  if (leer(a.ziele) && b.ziele) a.ziele = b.ziele;
  if (leer(a.beschaeftigungsart) && b.beschaeftigungsart) a.beschaeftigungsart = b.beschaeftigungsart;
  if (leer(a.branche) && s.ausgangslage) a.branche = s.ausgangslage;
  if (leer(a.werdegang) && s.vorErfahrung) a.werdegang = s.vorErfahrung;
  if (leer(a.vorstellungNotiz) && s.vorteileNotiz) a.vorstellungNotiz = s.vorteileNotiz;
  if (leer(a.konditionenReaktion) && s.budget) a.konditionenReaktion = s.budget;
  if (leer(a.einwandNotiz) && s.einwand) a.einwandNotiz = s.einwand;
  if ((a.gesamteindruck ?? 0) === 0 && b.bewertung > 0) a.gesamteindruck = b.bewertung;
  return { ...s, assessment: a };
}

/** Die Felder, die sich aus dem Skript in der Übersicht des Bewerbers spiegeln. */
export function uebersichtFelder(bewerber: Bewerber, assessment: AssessmentAntworten) {
  const zieleTeile = [
    (assessment.ziele ?? "").trim(),
    (assessment.einkommensziel ?? "").trim()
      ? `Einkommensziel: ${assessment.einkommensziel} Euro pro Monat`
      : "",
  ].filter(Boolean);
  return {
    bewertung: assessment.gesamteindruck ?? bewerber.bewertung ?? 0,
    motivation: (assessment.antrieb ?? "").trim() || bewerber.motivation,
    ziele: zieleTeile.length > 0 ? zieleTeile.join(" · ") : bewerber.ziele,
    beschaeftigungsart: (assessment.beschaeftigungsart ?? "").trim() || bewerber.beschaeftigungsart,
  };
}

export function useErstgespraechSkript(bewerber: Bewerber, canEdit: boolean) {
  const draftKey = erstgespraechDraftKey(bewerber.id);
  const initial = leseDraft(draftKey);
  const [skript, setSkript] = useState<ErstgespraechSkript>(
    mitVorbelegung(bewerber, initial?.skript ?? bewerber.erstgespraechSkript),
  );
  const [closingDatum, setClosingDatum] = useState(initial?.closingDatum ?? (bewerber.closingTerminDatum || ""));
  const [closingUhrzeit, setClosingUhrzeit] = useState(initial?.closingUhrzeit ?? (bewerber.closingTerminUhrzeit || ""));

  useEffect(() => {
    const fresh = leseDraft(draftKey);
    setSkript(mitVorbelegung(bewerber, fresh?.skript ?? bewerber.erstgespraechSkript));
    setClosingDatum(fresh?.closingDatum ?? (bewerber.closingTerminDatum || ""));
    setClosingUhrzeit(fresh?.closingUhrzeit ?? (bewerber.closingTerminUhrzeit || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bewerber.id]);

  const assessment: AssessmentAntworten = skript.assessment ?? {};
  const setAssessment = (patch: Partial<AssessmentAntworten>) =>
    setSkript((p) => ({ ...p, assessment: { ...(p.assessment ?? {}), ...patch } }));

  const closingDirekt: ClosingDirektDaten = skript.closingDirekt ?? {};
  const closingDirektAn = istClosingDirektAktiv(closingDirekt);
  const setClosingDirekt = (patch: Partial<ClosingDirektDaten>) =>
    setSkript((p) => ({ ...p, closingDirekt: { ...(p.closingDirekt ?? {}), ...patch } }));

  const syncFelder = () => uebersichtFelder(bewerber, assessment);

  // Autosave: 1) sofort in LocalStorage (Reload-Schutz), 2) debounced (1,5 s) in die DB.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        skript, closingDatum, closingUhrzeit, savedAt: new Date().toISOString(),
      }));
    } catch { /* Quota / private-mode – egal */ }

    if (!canEdit) return;
    const t = setTimeout(() => {
      try {
        updateBewerber(bewerber.id, {
          erstgespraechSkript: skript,
          ...syncFelder(),
          closingTerminDatum: closingDatum, closingTerminUhrzeit: closingUhrzeit,
        });
      } catch (e) { console.warn("Erstgespräch-Autosave fehlgeschlagen", e); }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, canEdit, bewerber.id, skript, closingDatum, closingUhrzeit]);

  const loescheDraft = () => {
    try { localStorage.removeItem(draftKey); } catch { /* noop */ }
  };

  return {
    draftKey,
    skript, setSkript,
    assessment, setAssessment,
    closingDatum, setClosingDatum,
    closingUhrzeit, setClosingUhrzeit,
    closingDirekt, closingDirektAn, setClosingDirekt,
    syncFelder,
    loescheDraft,
  };
}

/**
 * Der Vorab-Fragebogen des Bewerbers. Liegt in einer eigenen Tabelle und
 * nicht im meta-Feld, deshalb ein gezielter Select beim Öffnen.
 */
export function useVorwissen(bewerberId: string): Vorwissen | null {
  const [vorwissen, setVorwissen] = useState<Vorwissen | null>(null);
  useEffect(() => {
    let abgebrochen = false;
    supabase
      .from("bewerber_formular")
      .select("antworten, eingereicht_am")
      .eq("bewerbung_id", bewerberId)
      .eq("status", "eingereicht")
      .order("eingereicht_am", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (abgebrochen || !data) return;
        const antworten = (data.antworten ?? {}) as FormularAntworten;
        if (hatAntworten(antworten)) {
          setVorwissen({ antworten, eingereichtAm: data.eingereicht_am });
        }
      });
    return () => { abgebrochen = true; };
  }, [bewerberId]);
  return vorwissen;
}
