import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, MailQuestion, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { hatAntworten, kurzmarken, type FormularAntworten } from "@/lib/bewerberFormular";
import { istKennenlernen, kennenlernenKurzmarken } from "@/lib/bewerberKennenlernen";

/**
 * Steht der Vorab-Fragebogen schon zur Verfügung?
 *
 * Die Antworten selbst stehen im Erstgesprächs-Reiter, dort gehören sie hin.
 * In der Übersicht fehlte bisher aber die schlichte Auskunft, ob überhaupt
 * etwas vorliegt. Wer den Bewerber anruft, will das wissen, bevor er den
 * Reiter wechselt: Mit ausgefülltem Formular beginnt das Gespräch nicht bei
 * null, ohne schon.
 *
 * Drei Zustände, dieselben, die die Tabelle kennt: eingereicht, noch offen und
 * abgelaufen. Der Kasten lädt selbst, damit die Übersicht nichts davon wissen
 * muss.
 */

type Stand =
  | { art: "laedt" }
  | { art: "keins" }
  | { art: "offen"; laeuftAb: string | null; erinnert: boolean }
  | { art: "abgelaufen" }
  | { art: "eingereicht"; am: string | null; marken: string[]; kennenlernen: boolean };

function datum(wert: string | null): string {
  if (!wert) return "";
  return new Date(wert).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/**
 * Erklärt, wann eine Erinnerung hinausgeht und wann nicht.
 *
 * Die Regel ist unsichtbar und deshalb erklärungsbedürftig: Ein Bewerber, der
 * den Eingang verlassen hat, bekommt keine Erinnerung mehr, auch wenn sein
 * Formular offen bleibt. Ohne diesen Hinweis wirkt das wie ein Aussetzer der
 * Automatik.
 */
function ErinnerungHinweis() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          title="Wie die Erinnerung funktioniert"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-xs leading-relaxed">
        <p className="mb-2 text-sm font-semibold">Wie die Erinnerung funktioniert</p>
        <p className="mb-2 text-muted-foreground">
          Mit der Bewerbung geht das Formular automatisch hinaus. Der persönliche Link gilt
          14 Tage.
        </p>
        <p className="mb-2 text-muted-foreground">
          Liegt nach drei Tagen keine Antwort vor, geht <strong className="text-foreground">genau
          eine</strong> Erinnerung hinaus. Danach nie wieder, egal wie lange das Formular offen
          bleibt.
        </p>
        <p className="mb-2 text-muted-foreground">
          <strong className="text-foreground">Die Erinnerung geht nur hinaus, solange der
          Bewerber im Eingang liegt.</strong> Sobald er auf einer anderen Stufe steht, also
          Erstgespräch, Follow-Up, Bedenkzeit oder weiter, wird nichts mehr verschickt. Wer
          bereits im Prozess ist, soll nicht aufgefordert werden, einen Fragebogen auszufüllen,
          über den ihr längst gesprochen habt.
        </p>
        <p className="text-muted-foreground">
          Du kannst das Formular jederzeit von Hand erneut schicken, im Reiter Erstgespräch.
          Das ist bewusst nicht eingeschränkt: Ein Klick von dir ist eine Entscheidung, keine
          Automatik.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function VorabFormularStand({ bewerbungId }: { bewerbungId: string }) {
  const [stand, setStand] = useState<Stand>({ art: "laedt" });

  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("bewerber_formular")
          .select("status, antworten, eingereicht_am, expires_at, erinnerung_am")
          .eq("bewerbung_id", bewerbungId)
          .order("eingereicht_am", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (abgebrochen) return;

        // Fehlt die Tabelle, weil die Migration noch nicht gelaufen ist, bleibt
        // der Kasten weg, statt eine Fehlermeldung in die Übersicht zu setzen.
        if (error || !data) { setStand({ art: "keins" }); return; }

        const antworten = (data.antworten ?? {}) as FormularAntworten;
        if (data.status === "eingereicht" && hatAntworten(antworten)) {
          // Beide Bögen schreiben in dieselbe Spalte. Welcher es war, sagt der
          // gewählte Weg, den es nur im neuen Kennenlernen gibt.
          const neu = istKennenlernen(antworten);
          setStand({
            art: "eingereicht",
            am: data.eingereicht_am,
            marken: neu ? kennenlernenKurzmarken(antworten) : kurzmarken(antworten),
            kennenlernen: neu,
          });
        } else if (data.status === "abgelaufen") {
          setStand({ art: "abgelaufen" });
        } else {
          setStand({
            art: "offen",
            laeuftAb: data.expires_at ?? null,
            erinnert: !!data.erinnerung_am,
          });
        }
      } catch {
        if (!abgebrochen) setStand({ art: "keins" });
      }
    })();
    return () => { abgebrochen = true; };
  }, [bewerbungId]);

  if (stand.art === "laedt" || stand.art === "keins") return null;

  if (stand.art === "eingereicht") {
    return (
      <Card className="p-4 border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">
                {stand.kennenlernen ? "Kennenlernen ausgefüllt" : "Vorab-Formular ausgefüllt"}
              </p>
              {stand.am && (
                <Badge variant="outline" className="text-[10px]">am {datum(stand.am)}</Badge>
              )}
              <ErinnerungHinweis />
            </div>
            {stand.marken.length > 0 && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {stand.marken.join(" · ")}
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {stand.kennenlernen
                ? "Der Bewerber ist den neuen Ablauf gegangen. Alle Antworten stehen im Bereich Bewerberprozess; die gemeinsamen Angaben erscheinen zusätzlich im Reiter Erstgespräch."
                : "Alle Antworten stehen im Reiter Erstgespräch, jeweils an der Stelle des Skripts, zu der sie gehören."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (stand.art === "abgelaufen") {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <MailQuestion className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Vorab-Formular nicht ausgefüllt</p>
              <ErinnerungHinweis />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Der Link ist abgelaufen. Das Erstgespräch funktioniert auch ohne die Antworten,
              das Skript ist darauf ausgelegt.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Vorab-Formular verschickt, noch keine Antwort</p>
            <ErinnerungHinweis />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {stand.laeuftAb ? `Der Link gilt noch bis zum ${datum(stand.laeuftAb)}. ` : ""}
            {stand.erinnert
              ? "Die eine Erinnerung ist bereits hinausgegangen."
              : "Nach drei Tagen geht automatisch eine Erinnerung hinaus."}
          </p>
        </div>
      </div>
    </Card>
  );
}
