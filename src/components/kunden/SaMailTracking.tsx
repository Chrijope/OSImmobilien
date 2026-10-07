import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MousePointerClick, RefreshCw, Send } from "lucide-react";

/**
 * Was aus der Einladung zur Selbstauskunft geworden ist.
 *
 * Anlass: In der Karte stand nur "Versendet: 24.08.2026 18:34". Damit wusste
 * der Vertriebspartner nicht, ob die Mail im Spam-Ordner gelandet ist oder ob
 * der Kunde sie schlicht noch nicht wahrgenommen hat. Nachfassen war Raten.
 *
 * Die Anmutung ist absichtlich dieselbe wie im Vertragsreiter des
 * Bewerbermanagements (`components/bewerbung/VertragsTab.tsx`): derselbe
 * Kasten, dieselben Kacheln, dasselbe grüne Badge. Wer das eine kennt, versteht
 * das andere sofort.
 *
 * "Versendet" heißt, die Mail wurde dem Mailanbieter übergeben, nicht dass sie
 * im Postfach liegt. Eine echte Zustellbestätigung liefert der Anbieter nicht,
 * deshalb steht hier auch keine. "Link geöffnet" ist sicher, denn dafür muss
 * die Seite tatsächlich aufgerufen worden sein.
 *
 * Ein "E-Mail geöffnet" gibt es seit dem 26.09.2026 nicht mehr. Es hing an
 * einem Zählpixel, und ein Öffnungspixel braucht nach Einschätzung der
 * Rechtsprüfung eine Einwilligung (§ 25 TDDDG). `email_opened_at` wird
 * deshalb weder gesetzt noch angezeigt.
 */

interface Tracking {
  created_at: string | null;
  link_opened_at: string | null;
  status: string | null;
}

interface Erinnerung {
  category: string | null;
  trigger_at: string | null;
  status: string | null;
}

/**
 * Reihenfolge und Beschriftung der geplanten Erinnerungen.
 *
 * Die drei Kundenkategorien werden seit 15.09.2026 nicht mehr geplant, die
 * Beschriftungen bleiben für bereits verschickte Zeilen aus der Zeit davor.
 */
const ERINNERUNG_LABEL: Record<string, string> = {
  sa_reminder_1: "1. Erinnerung an den Kunden",
  sa_reminder_2: "2. Erinnerung an den Kunden",
  sa_reminder_3: "3. Erinnerung an den Kunden",
  sa_vp_nudge: "Aufgabe an dich",
};

const ERINNERUNG_STATUS: Record<string, string> = {
  pending: "geplant",
  sent: "erledigt",
  skipped: "gestoppt",
  cancelled: "ersetzt",
  failed: "fehlgeschlagen",
};

function zeit(wert: string | null | undefined): string | null {
  if (!wert) return null;
  const d = new Date(wert);
  return isNaN(d.getTime()) ? null : d.toLocaleString("de-DE");
}

function datum(wert: string | null | undefined): string | null {
  if (!wert) return null;
  const d = new Date(wert);
  return isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function SaMailTracking({
  kontaktId,
  investmentId,
}: {
  kontaktId: string;
  investmentId: string;
}) {
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [erinnerungen, setErinnerungen] = useState<Erinnerung[]>([]);
  /*
   * Ohne sichtbare Rueckmeldung wirkt der Knopf kaputt.
   *
   * Er hat von Anfang an neu geladen, aber wenn der Kunde die Mail noch nicht
   * geoeffnet hat, aendert sich nichts auf dem Bildschirm. Wer darauf klickt,
   * schliesst daraus, dass nichts passiert. Deshalb dreht sich das Symbol
   * waehrend des Ladens, und daneben steht, wann zuletzt nachgesehen wurde.
   */
  const [laedt, setLaedt] = useState(false);
  const [standVon, setStandVon] = useState<Date | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      // Bei mehreren Einladungen zählt die jüngste: Nach einem erneuten Versand
      // wartet man auf diesen und nicht auf den ersten.
      // Über `any`, weil die beiden Tracking-Spalten erst mit der noch nicht
      // ausgeführten Migration entstehen und die erzeugten Datenbanktypen sie
      // deshalb noch nicht kennen. Der Vertragsreiter im Bewerbermanagement
      // greift aus demselben Grund genauso zu.
      const { data, error } = await (supabase as any)
        .from("sa_fill_tokens")
        .select("created_at, link_opened_at, status")
        .eq("kontakt_id", kontaktId)
        .eq("investment_id", investmentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Fehlt die Migration noch, kennt die Tabelle die beiden Spalten nicht
      // und die Abfrage schlägt fehl. Dann bleibt der Block einfach leer,
      // statt eine Fehlermeldung in die Karte zu setzen.
      setTracking(error ? null : ((data as Tracking) || null));
    } catch {
      setTracking(null);
    }

    try {
      const { data } = await supabase
        .from("scheduled_notifications")
        .select("category, trigger_at, status")
        .eq("investment_id", investmentId)
        .in("category", ["sa_reminder_1", "sa_reminder_2", "sa_reminder_3", "sa_vp_nudge"])
        .order("trigger_at", { ascending: true });
      // Die Lesebedingung der Tabelle zeigt jedem nur seine eigenen Zeilen.
      // Wer nicht zuständig ist, sieht den Plan schlicht nicht.
      setErinnerungen((data as Erinnerung[]) || []);
    } catch {
      setErinnerungen([]);
    }

    setStandVon(new Date());
    // Kurz stehen lassen: Bei einer schnellen Antwort blitzt das Symbol sonst
    // nur auf, und man ist sich nicht sicher, ob wirklich etwas passiert ist.
    window.setTimeout(() => setLaedt(false), 400);
  }, [kontaktId, investmentId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!tracking) return null;

  const versendet = zeit(tracking.created_at);
  const geklickt = zeit(tracking.link_opened_at);

  // Nur die jeweils jüngste Planung zeigen. Ein erneuter Versand storniert die
  // alte Kaskade, die stornierten Zeilen sollen den Blick nicht verstellen.
  const aktuellePlanung = erinnerungen.filter((e) => e.status !== "cancelled");

  return (
    <div className="mb-4 rounded-md border p-3 bg-muted/20 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          E-Mail-Tracking
        </p>
        <div className="flex items-center gap-2">
          {standVon && (
            <span className="text-[10px] text-muted-foreground">
              Stand {standVon.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={laedt}
            onClick={() => void laden()}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${laedt ? "animate-spin" : ""}`} />
            {laedt ? "Prüfe…" : "Aktualisieren"}
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <div className="flex items-start gap-2 rounded border p-2 bg-background">
          <Send className={`h-4 w-4 mt-0.5 ${versendet ? "text-green-600" : "text-muted-foreground"}`} />
          <div className="text-xs">
            <p className="font-medium">Versendet</p>
            <p className="text-muted-foreground">{versendet || "Noch nicht versendet"}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded border p-2 bg-background">
          <MousePointerClick
            className={`h-4 w-4 mt-0.5 ${geklickt ? "text-green-600" : "text-muted-foreground"}`}
          />
          <div className="text-xs">
            <p className="font-medium">Link geöffnet</p>
            <p className="text-muted-foreground">{geklickt || "Noch nicht geöffnet"}</p>
          </div>
          {geklickt && (
            <Badge className="ml-auto bg-green-500 text-white text-[10px] h-5">geöffnet</Badge>
          )}
        </div>
      </div>

      {aktuellePlanung.length > 0 && (
        <div className="rounded border p-2 bg-background space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Automatische Erinnerungen</p>
          {aktuellePlanung.map((e, i) => (
            <div key={`${e.category}-${i}`} className="flex items-center justify-between gap-2 text-xs">
              <span>{ERINNERUNG_LABEL[e.category || ""] || e.category}</span>
              <span className="text-muted-foreground tabular-nums">
                {datum(e.trigger_at) || "–"} · {ERINNERUNG_STATUS[e.status || ""] || e.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Hinweis: „Versendet" heißt, die Mail wurde dem Mailanbieter übergeben. „Link geöffnet" wird
        erfasst, sobald der Kunde die Selbstauskunft über den Knopf in der Mail aufruft. Ob die Mail
        gelesen wurde, messen wir nicht.
      </p>
    </div>
  );
}
