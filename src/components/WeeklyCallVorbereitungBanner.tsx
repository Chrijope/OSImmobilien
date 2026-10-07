import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { aktuellerCallTermin, ladePunkte } from "@/lib/weeklyCallStore";
import { callRundenFuer, rundeUhrzeitText } from "@/lib/weeklyCallZeit";
import {
  vorbereitungsStand,
  vorbereitungsText,
  vorbereitungsTitel,
} from "@/lib/weeklyCallVorbereitung";

/**
 * Erinnert daran, Punkte für den Weekly Sales Call einzutragen.
 *
 * Der zweite Banner zum selben Call, und das ist Absicht. Der ältere
 * (`WeeklyCallReminderBanner`) erinnert eine Stunde vorher ans Einwählen;
 * dieser hier sorgt dafür, dass es bis dahin überhaupt etwas zu besprechen
 * gibt. Sie treffen sich nie: Dieser endet montags um 17:00 Uhr, jener
 * beginnt um 18:00 Uhr.
 *
 * **Wer schon eingetragen hat, sieht nichts.** Das ist der Teil, an dem solche
 * Hinweise sonst scheitern. Ein Banner, der nicht weiß, ob die Sache längst
 * erledigt ist, ist Lärm, und Lärm wird nach zwei Wochen reflexhaft
 * weggeklickt. Danach erreicht den Nutzer auch die Erinnerung nicht mehr, die
 * zählt.
 *
 * Wann er erscheint, steht in `weeklyCallVorbereitung.ts` und wird dort
 * geprüft. Diese Datei entscheidet nichts über Zeiten, sie zeigt nur an.
 */

const DISMISS_KEY = "mi_dismissed_weekly_call_vorbereitung";


function ladeWeggeklickt(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function WeeklyCallVorbereitungBanner() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [weggeklickt, setWeggeklickt] = useState<string | null>(() => ladeWeggeklickt());
  const [punkte, setPunkte] = useState<{ gesamt: number; eigene: number } | null>(null);

  const stand = useMemo(() => vorbereitungsStand(new Date()), []);
  /*
   * Dieselbe Auswahl wie beim Einwahl-Banner: Lead-Berater werden für den
   * 19:00-Call erinnert, Vertriebspartner für den 19:30-Call, die Leitung für
   * beide. Gezählt werden nur die Punkte der eigenen Calls, das liefert die
   * Datenbankfunktion ohne Angabe eines Calls von selbst.
   */
  const runden = callRundenFuer(user.role, user.rollenVariante);
  const darfSehen = runden.length > 0;
  const einzigerCall = runden.length === 1 ? runden[0] : undefined;
  const fensterOffen = !!stand.fenster && weggeklickt !== stand.schluessel;

  useEffect(() => {
    if (!darfSehen || !fensterOffen) return;
    /*
     * Nur laden, wenn der Banner ohnehin erscheinen könnte. An fünf von
     * sieben Tagen ist das Fenster zu, und dann soll auch keine Abfrage
     * hinausgehen.
     *
     * `lebt` verhindert ein setState nach dem Abbau. Ohne den Merker warf das
     * beim schnellen Seitenwechsel eine Warnung, und im StrictMode bei jedem
     * Laden.
     */
    let lebt = true;
    // Bei einem Call nur dessen Punkte. Sonst zählte etwa ein Admin, der
    // gerade als Vertriebspartner arbeitet, auch den 19:00-Call mit.
    ladePunkte(aktuellerCallTermin(), einzigerCall)
      .then((liste) => {
        if (!lebt || !liste) return;
        setPunkte({
          gesamt: liste.length,
          eigene: liste.filter((p) => p.vonMir).length,
        });
      })
      .catch(() => {
        /* Fehlt die Datenbankfunktion noch, bleibt der Banner einfach weg. */
      });
    return () => {
      lebt = false;
    };
  }, [darfSehen, fensterOffen, einzigerCall]);

  if (!darfSehen || !stand.fenster || !fensterOffen) return null;

  // Solange die Punkte nicht geladen sind, zeigt der Banner nichts. Er würde
  // sonst aufblitzen und gleich wieder verschwinden, sobald sich herausstellt,
  // dass der Nutzer längst etwas eingetragen hat.
  if (!punkte) return null;
  if (punkte.eigene > 0) return null;

  const uhrzeitText = runden.map(rundeUhrzeitText).join(" und ");
  const letzte = stand.fenster === "letzte";

  const wegklicken = () => {
    try {
      localStorage.setItem(DISMISS_KEY, stand.schluessel);
    } catch {
      /* Privates Fenster: Der Banner kommt beim nächsten Laden wieder. */
    }
    setWeggeklickt(stand.schluessel);
  };

  return (
    <div
      className={`px-4 py-2.5 flex items-center gap-3 border-b ${
        letzte ? "bg-warning/10 border-warning/30" : "bg-primary/5 border-primary/15"
      }`}
    >
      <MessageSquarePlus
        className={`h-4 w-4 shrink-0 ${letzte ? "text-warning" : "text-primary"}`}
      />
      <div className="flex-1 text-xs sm:text-sm min-w-0">
        <span className="font-medium text-foreground">
          {vorbereitungsTitel(stand.fenster, uhrzeitText, punkte.gesamt)}
        </span>
        <span className="text-muted-foreground ml-2">{vorbereitungsText(stand.fenster)}</span>
      </div>
      <Button
        size="sm"
        variant={letzte ? "secondary" : "default"}
        className="h-7 text-xs gap-1 shrink-0"
        onClick={() => navigate("/weekly-call")}
      >
        {letzte && punkte.gesamt > 0 ? "Liste ansehen" : "Punkt eintragen"}
      </Button>
      <button
        onClick={wegklicken}
        className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors shrink-0"
        aria-label="Hinweis ausblenden"
        title="Hinweis ausblenden"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
