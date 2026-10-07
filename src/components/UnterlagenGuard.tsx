import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText, Hourglass, Lock, X, Check } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useUnterlagenStand, heuteWeggeklickt, heuteWegklicken } from "@/hooks/useUnterlagenStand";
import type { OnboardingStand } from "@/lib/partnerUnterlagenStore";

/**
 * Banner und Sperre für die Pflichtunterlagen.
 *
 * Zwei Bauteile, ein Zustand:
 *
 *   Banner  erscheint bei Bestandspartnern, solange ihre Frist läuft und etwas
 *           fehlt. Einmal täglich, wegklickbar. Die Seite bleibt bedienbar.
 *
 *   Sperre  greift, sobald die Frist abgelaufen ist, und bei neuen Partnern
 *           sofort. Dann ist nur noch die Einstellungsseite erreichbar.
 *
 * Neue Partner sehen keinen Banner. Sie haben keine Frist, auf die er sich
 * beziehen könnte, und sind ohnehin gesperrt, bis sie hochgeladen haben.
 */

/** Wohin der Partner geschickt wird. Der Reiter mit den Unterlagen. */
const ZIEL = "/einstellungen?tab=profil";

/** Seiten, die auch bei Sperre erreichbar bleiben. */
const IMMER_OFFEN = ["/einstellungen", "/abmelden", "/logout"];

function fehlendeListe(stand: OnboardingStand): Array<{ text: string; da: boolean }> {
  return [
    { text: "Personalausweis", da: stand.ausweisDa },
    {
      text: "Angabe zur Erlaubnis nach § 34c GewO",
      da: stand.hat34c === false || (stand.hat34c === true && stand.erlaubnisDa),
    },
  ];
}

/** Der Hinweis oben auf der Seite, während die Frist läuft. */
export function UnterlagenBanner() {
  const { user } = useUser();
  const navigate = useNavigate();
  const lage = useUnterlagenStand();
  const [weg, setWeg] = useState(() => heuteWeggeklickt(user?.moreId || "anonym"));

  if (lage.laedt || !lage.bannerZeigen || !lage.stand || weg) return null;

  const stand = lage.stand;
  const tage = stand.tageRest ?? 0;
  const posten = fehlendeListe(stand);
  const offen = posten.filter((p) => !p.da);
  const erledigt = posten.filter((p) => p.da);

  // In der letzten Woche wird es dringlicher: anderer Ton, anderes Zeichen,
  // und ein Datum statt einer Tageszahl. Ein Datum wirkt verbindlicher.
  const knapp = tage <= 7;
  const stichtag = stand.fristBis
    ? new Date(stand.fristBis).toLocaleDateString("de-DE", { day: "numeric", month: "long" })
    : "";

  return (
    <div
      className={`mb-4 flex items-start gap-3 rounded-lg border bg-card p-4 ${
        knapp ? "border-l-[3px] border-l-[hsl(var(--warning))]" : "border-l-[3px] border-l-primary"
      }`}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          knapp ? "bg-[hsl(var(--warning))]/10" : "bg-primary/10"
        }`}
      >
        {knapp
          ? <Hourglass className="h-4 w-4 text-[hsl(var(--warning))]" />
          : <FileText className="h-4 w-4 text-primary" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {knapp
            ? `Nur noch ${tage} ${tage === 1 ? "Tag" : "Tage"} für deine Unterlagen`
            : offen.length > 1
              ? "Zwei Unterlagen fehlen noch"
              : "Noch eine Unterlage fehlt"}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
          {knapp ? (
            <>
              Ab dem <b className="text-foreground">{stichtag}</b> brauchst du{" "}
              {offen.length > 1 ? "beides" : offen[0]?.text.toLowerCase()}, um ins CRM zu kommen.
              Es dauert keine zwei Minuten.
            </>
          ) : (
            <>
              Bitte {offen.map((p) => p.text).join(" und ")} ergänzen. Du hast dafür noch{" "}
              <b className="text-foreground">{tage} {tage === 1 ? "Tag" : "Tage"}</b> Zeit.
            </>
          )}
        </p>

        {/* Was schon da ist, wird genannt. Wer den Ausweis hochgeladen hat und
            trotzdem dieselbe Meldung sieht, fühlt sich nicht ernst genommen. */}
        {erledigt.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3 w-3 text-[hsl(var(--success))]" />
            {erledigt.map((p) => p.text).join(", ")} liegt vor
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate(ZIEL)}>
            {stand.ausweisDa ? "Jetzt ergänzen" : "Jetzt hochladen"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => { heuteWegklicken(user?.moreId || "anonym"); setWeg(true); }}
          >
            Später erinnern
          </Button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Hinweis für heute ausblenden"
        className="shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        onClick={() => { heuteWegklicken(user?.moreId || "anonym"); setWeg(true); }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Die Sperre. Umschließt den Seiteninhalt.
 *
 * Die Einstellungsseite bleibt immer erreichbar, sonst käme der Partner nicht
 * an die Stelle, an der er die Sperre auflösen kann.
 */
export function UnterlagenGuard({ children }: { children: React.ReactNode }) {
  const lage = useUnterlagenStand();
  const navigate = useNavigate();
  const ort = useLocation();

  // Solange nicht geladen ist, nichts sperren. Ein kurzer Moment ohne Wissen
  // darf niemanden aussperren.
  if (lage.laedt || lage.offen || !lage.stand) return <>{children}</>;
  if (IMMER_OFFEN.some((p) => ort.pathname.startsWith(p))) return <>{children}</>;

  const posten = fehlendeListe(lage.stand);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <Lock className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="mb-2 text-xl font-bold">Deine Unterlagen fehlen</h2>
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          Sobald beides vorliegt, steht dir das CRM sofort wieder offen. Es muss niemand
          etwas freigeben.
        </p>

        <div className="mb-6 inline-block text-left text-[13px]">
          {posten.map((p) => (
            <div key={p.text} className="flex items-center gap-2 py-1">
              {p.da
                ? <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" />
                : <X className="h-3.5 w-3.5 shrink-0 text-destructive" />}
              <span className={p.da ? "text-muted-foreground line-through" : ""}>{p.text}</span>
            </div>
          ))}
        </div>

        <div>
          <Button onClick={() => navigate(ZIEL)}>Zu den Einstellungen</Button>
        </div>
      </div>
    </div>
  );
}
