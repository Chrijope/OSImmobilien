/**
 * Bausteine aus der früheren Moderationsansicht des alten Bewerbergesprächs.
 *
 * Die Seite selbst ist seit dem 23.09.2026 entfernt: Unter der Adresse
 * `/closing-moderation` liegt jetzt immer die Moderation des Videocalls mit
 * den fünf Wegen (`BewerberVideocallModeration.tsx`). Geblieben sind die
 * beiden Skriptbausteine, die die Übung unter `/praesentation-uebung`
 * (`PraesentationsUebung.tsx`) für das alte Deck mit 22 Folien zeigt:
 *
 *   SkriptTeil1: Station, Sprechtext, Regie und Felder zu einer Teil-1-Folie.
 *   ErgaenzungAusTeil1: Sprechtexte aus Teil 1, die im Deck erst auf einer
 *     Teil-2-Folie gesprochen werden.
 *
 * Beide lesen dieselben Stationen wie der Reiter Erstgespräch
 * (assessmentSkript.ts) und die Zuordnung Folie zu Skript aus
 * praesentationsDeck.ts.
 */
import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import {
  ASSESSMENT_STATIONEN, fuellePlatzhalter, berechneAssessmentScore,
  type AssessmentFeld, type AssessmentStation,
} from "@/lib/assessmentSkript";
import { getErstgespraechFolie } from "@/lib/erstgespraechFolien";
import type { DeckErgaenzung, DeckFolie } from "@/lib/praesentationsDeck";
import {
  AssessmentFelder, EinwandListe, PfadAuswahl, PunktTitel, RegieHinweis, Script,
  type FelderKontext,
} from "@/components/bewerbung/erstgespraechBausteine";
import type { useVorwissen } from "@/components/bewerbung/useErstgespraechSkript";
import { VorabZurStation } from "@/components/bewerbung/VorwissenKarte";

/** Feld-Definitionen einer Station zu den Keys, die das Deck der Folie zuordnet. */
function feldDefinitionen(station: AssessmentStation | undefined, keys: string[]): AssessmentFeld[] {
  if (!station) return [];
  const alle = [
    ...(station.felder ?? []),
    ...(station.bloecke ?? []).flatMap((b) => b.felder ?? []),
  ];
  return keys
    .map((key) => alle.find((f) => f.key === key))
    .filter((f): f is AssessmentFeld => !!f);
}

function station(key: string): AssessmentStation | undefined {
  return ASSESSMENT_STATIONEN.find((s) => s.key === key);
}

/**
 * Sprechtexte aus Teil 1, die im Deck-Modus erst auf einer Teil-2-Folie
 * gesprochen werden (Station 6, Verdienst-Block von Station 7), samt ihren
 * Feldern. Am Telefon bleiben sie in ihrer Station.
 *
 * Exportiert, weil die Übungsansicht (`PraesentationsUebung.tsx`) denselben
 * Baustein blank zeigt, mit leeren Antworten und ohne Bewerber.
 */
export function ErgaenzungAusTeil1({
  ergaenzung, keys, ctx,
}: {
  ergaenzung: DeckErgaenzung;
  keys: string[];
  ctx: FelderKontext;
}) {
  const s = station(ergaenzung.stationKey);
  if (!s) return null;
  const block = ergaenzung.block ? (s.bloecke ?? []).find((b) => b.key === ergaenzung.block) : null;
  const texte = block
    ? block.sprechtexte
    : (ergaenzung.sprechtexte ?? []).map((i) => (s.sprechtexte ?? [])[i]).filter(Boolean);
  const felder = feldDefinitionen(s, keys);
  return (
    <Card className="p-4 space-y-2 bg-muted/30">
      <PunktTitel nummer={s.nummer} titel={block ? `${s.titel} · ${block.titel}` : s.titel} />
      <p className="text-[11px] text-muted-foreground">
        Aus dem Erstgesprächsskript, im Deck erst hier gesprochen.
      </p>
      {texte.map((t, i) => <Script key={i}>„{t}"</Script>)}
      {felder.length > 0 && <AssessmentFelder felder={felder} ctx={ctx} />}
    </Card>
  );
}

/**
 * Der Skriptbereich zu einer Teil-1-Folie: Station, Sprechtext, Regie, Felder.
 * Exportiert für die Übungsansicht, die ihn ohne Bewerber zeigt.
 */
export function SkriptTeil1({
  folie, ctx, vorname, beraterName, vorwissen,
}: {
  folie: DeckFolie;
  ctx: FelderKontext;
  vorname: string;
  beraterName: string;
  vorwissen: ReturnType<typeof useVorwissen>;
}) {
  const key = folie.skript.art === "station" ? folie.skript.key : "";
  const s = station(key);
  const eintrag = getErstgespraechFolie(folie.id);
  if (!s) return null;
  const score = berechneAssessmentScore(ctx.assessment);
  // Auf der Machbarkeits-Folie wird nur der Block Formales gesprochen; die
  // Provision aus dem Block Verdienst gehört im Deck zur Folie Zwei Wege.
  const bloecke = key === "konditionen" ? (s.bloecke ?? []).filter((b) => b.key === "formales") : (s.bloecke ?? []);
  const sprechtexte = s.sprechtext ? [s.sprechtext] : (s.sprechtexte ?? []);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <PunktTitel nummer={s.nummer} titel={s.titel} />
        <VorabZurStation station={s.nummer} vorwissen={vorwissen} />
        {sprechtexte.map((t, i) => (
          <Script key={i}>„{fuellePlatzhalter(t, { vorname, beraterName })}"</Script>
        ))}
        {bloecke.map((block) => (
          <div key={block.key} className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-semibold">{block.titel}</div>
            {block.sprechtexte.map((t, i) => <Script key={i}>„{t}"</Script>)}
          </div>
        ))}
        {key === "konditionen" && (
          <RegieHinweis hinweis="Die Provision (Block „Was du verdienst“) kommt im Deck erst in Teil 2 auf der Folie „Zwei Wege, ein Satz“. Hier nur das Formale." />
        )}
      </div>

      {key === "einwaende" && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-4">
          <EinwandListe />
        </div>
      )}

      {folie.pfadVertiefung ? (
        <div className="space-y-3"><PfadAuswahl ctx={ctx} /></div>
      ) : (
        <AssessmentFelder felder={feldDefinitionen(s, folie.felder)} ctx={ctx} />
      )}

      {key === "konditionen" && score.koRot.length >= 2 && (
        <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-950/30 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">
            <strong>{score.koRot.length} gerissene harte Kriterien</strong> ({score.koRot.join(", ")}).
            Die Empfehlung steht damit automatisch auf <strong>C · Absage</strong>.
          </p>
        </div>
      )}

      {eintrag?.folie.ueberleitung && (
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">
            Überleitung zu Teil 2 (steht auf der Folie)
          </div>
          <Script>„{eintrag.folie.ueberleitung.satz}"</Script>
          <p className="text-[11px] text-muted-foreground">
            {eintrag.folie.ueberleitung.unterzeile} Danach folgt der Zwischenstopp: Einschätzung und
            Entscheidung, ob Teil 2 jetzt direkt folgt oder als Termin.
          </p>
        </div>
      )}
    </div>
  );
}
