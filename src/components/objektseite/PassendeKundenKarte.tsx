import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KartenTitel } from "@/components/objektseite/Bausteine";
import { ScoreRing } from "@/components/objektscore/ScoreAnzeige";
import { useUser } from "@/contexts/UserContext";
import { useVertretungen } from "@/hooks/useVertretungen";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { istEigenerKunde, nurEigeneKunden, type KundenTreffer } from "@/lib/objektScoreDaten";
import { usePassendeKunden } from "@/components/objektscore/usePassendeKunden";
import { kundenRueckweg } from "@/lib/empfehlungAuswahl";
import { spanneText, entfernungKmText } from "@/lib/einheitEmpfehlung";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { vormerkungAktiv } from "../../../supabase/functions/_shared/einheit-vormerkung";
import { cn } from "@/lib/utils";

/**
 * Die Karte „Passende Kunden“ auf der Einheitenseite (Ansicht C des
 * Objektscores, 04.10.2026).
 *
 * Steht im Reiter Übersicht rechts unter „Interne Highlights“, bei den
 * anderen internen Angaben, damit sie beim Zeigen der Einheit im Gespräch
 * nicht in die Mitte rutscht. In Kundenansicht und Präsentationsmodus fehlt
 * sie ganz: Diese Datei hängt nur `EinheitSeite` ein, ein Test wacht darüber.
 *
 * Sichtbar nach der aktiven Rolle (`siehtPassendeKunden`): Admin, Inhaber und
 * Vertriebsleitung mit allen Kunden, der Vertriebspartner nur mit seinen
 * eigenen. Gezeigt werden Kunden in den Stufen Selbstauskunft bis Follow-Up
 * Objekt, mit Score für genau diese Einheit. Hängt an der Einheitenseite und
 * an der alten Wohnungsansicht, die der Vertriebspartner sieht.
 */

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

function stufenName(stufe: string): string {
  if (stufe === "follow_up_objekt") return "Follow-Up Objekt";
  return PIPELINE_STUFEN.find((s) => s.key === stufe)?.label ?? stufe;
}

function zweiteZeile(t: KundenTreffer): string {
  const partner = t.partnerName || "ohne Partner";
  if (t.score.teilwert) {
    const fehlt = t.score.bausteine.filter((b) => b.wert === null && b.gewicht > 0).map((b) => b.fehlt).filter(Boolean);
    return [partner, `Teilwert, ${fehlt.join(", ")}`].join(" · ");
  }
  return [partner, `Rahmen ${spanneText(t.rahmen.von, t.rahmen.bis)}`, t.entfernungKm !== null ? entfernungKmText(t.entfernungKm) : ""]
    .filter(Boolean).join(" · ");
}

export function PassendeKundenKarte({ objekt, wohnung }: { objekt: ObjektData; wohnung: ObjektWohnung }) {
  const { user, authUser } = useUser();
  const navigate = useNavigate();
  const [nurMeine, setNurMeine] = useState(false);
  // Der Vertriebspartner bekommt ohnehin nur eigene und vertretene Kunden, der Umschalter änderte nichts.
  const mitUmschalter = !nurEigeneKunden(user?.role);
  const eigeneId = authUser?.id;
  const passende = usePassendeKunden(objekt, wohnung.status === "frei");
  const vertretungFuer = useVertretungen(nurMeine ? eigeneId : null);
  if (!passende) return null;

  const alle = passende.jeEinheit.get(wohnung.id) ?? [];
  const liste = nurMeine ? alle.filter((t) => istEigenerKunde(t.partnerId, eigeneId, vertretungFuer)) : alle;

  return (
    <section className={KARTE} data-testid="karte-passende-kunden" aria-label="Passende Kunden">
      <KartenTitel rechts={<span className="text-[11px] text-muted-foreground">{alle.length} von {passende.suchende} suchenden</span>}>
        Passende Kunden
      </KartenTitel>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {mitUmschalter && <div className="inline-flex overflow-hidden rounded-lg border border-border bg-background/70" role="group" aria-label="Kundenfilter">
          {[{ wert: false, label: "Alle" }, { wert: true, label: "Meine Kunden" }].map((f) => (
            <button
              key={f.label}
              type="button"
              data-no-min
              aria-pressed={nurMeine === f.wert}
              onClick={() => setNurMeine(f.wert)}
              className={cn(
                "border-l border-border px-2.5 py-1 text-[11px] first:border-l-0",
                nurMeine === f.wert ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>}
        <span className="text-[11px] text-muted-foreground">nur Stufen Selbstauskunft bis Follow-Up Objekt</span>
      </div>

      {liste.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground" data-testid="passende-kunden-leer">
          {nurMeine ? "Von deinen Kunden passt gerade keiner zu dieser Einheit." : "Für diese Einheit passt gerade kein suchender Kunde."}
        </p>
      ) : (
        <ul className="grid gap-1.5" data-testid="passende-kunden">
          {liste.map((t, i) => (
            <li
              key={t.kontaktId}
              data-testid={`passender-kunde-${t.kontaktId}`}
              className={cn(
                "grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-xl border px-2.5 py-2 sm:grid-cols-[auto_1fr_auto]",
                i === 0 ? "border-primary/30 bg-primary/5" : "border-border bg-background/50",
              )}
            >
              <ScoreRing klein score={t.score} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {t.name}{" "}
                  <span className="ml-1 inline-flex items-center rounded-full bg-muted px-2 py-px text-[10px] font-semibold text-muted-foreground">{stufenName(t.pipelineStufe)}</span>
                </p>
                {t.score.hauptgrund && (
                  <p className={cn("text-[11px] font-medium", t.score.warnung ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--success))]")}>
                    {t.score.hauptgrund}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">{zweiteZeile(t)}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="col-span-2 h-7 justify-self-start text-xs sm:col-span-1 sm:justify-self-end"
                onClick={() => navigate(kundenRueckweg(t.kontaktId, t.investmentId))}
              >
                Kundenprofil öffnen
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Nicht in der Liste: Kunden, für die diese Einheit außerhalb des Rahmens liegt, und Kunden ohne Selbstauskunft.
          {vormerkungAktiv(wohnung) ? " Die Einheit ist vorgemerkt, andere Kunden fehlen deshalb." : " Vorgemerkt ist die Einheit für niemanden."}
        </span>
      </p>
      <p className="mt-2.5 text-[10px] text-muted-foreground">
        Interne Sortierhilfe aus Selbstauskunft, Zielen und Objektdaten. Keine Anlageberatung. „Kundenprofil öffnen“ führt in das Investment, Abschnitt Objektauswahl.
      </p>
    </section>
  );
}
