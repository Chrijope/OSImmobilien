// Trainings-Cockpit für die Beratungspräsentation OS Immobilien.
//
// Links läuft die echte Präsentation als Vorschau, rechts steht das
// Sprechskript. Beim Scrollen in der Präsentation erkennt das Cockpit die
// aktive Station und hebt rechts die passende Skriptkarte hervor, inklusive
// automatischem Nachscrollen. So hat man immer beides gleichzeitig vor sich:
// was der Kunde sieht und was man dazu sagt.
//
// Die Erkennung funktioniert, weil die Präsentation im selben Ursprung läuft:
// Das Cockpit liest die Scrollposition des iframes und vergleicht sie mit den
// Positionen der bekannten Section-IDs. Alles defensiv in try/catch, damit
// ein Fehler in der Vorschau nie die Akademie-Seite mitreißt.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Monitor, MessageSquareQuote, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  BERATUNG_SPRECHSKRIPTE,
  sprechskriptFuerAnrede,
  type BeratungSprechskript,
} from "@/lib/beratungSprechskripte";

// Das Cockpit zeigt die Du-Fassung, seit die Beratungspraesentation duzt.
// Stationen ohne eigene Du-Fassung fallen auf ihren Text zurueck.
const SPRECHSKRIPTE_DU: BeratungSprechskript[] = BERATUNG_SPRECHSKRIPTE.map((s) => sprechskriptFuerAnrede(s, "du"));
import { buildBeratungSkriptPdf } from "@/lib/beratungSkriptPdf";

const PRAESENTATION_URL = "/beratungspraesentation-moreimmo";

function SkriptKarte({
  skript,
  aktiv,
  onKlick,
}: {
  skript: BeratungSprechskript;
  aktiv: boolean;
  onKlick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onKlick}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${
        aktiv
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${
          aktiv ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {skript.station}
      </p>
      {skript.ueberleitung && (
        <p className="text-xs italic text-muted-foreground mb-1.5 leading-relaxed">
          Überleitung: „{skript.ueberleitung}"
        </p>
      )}
      <p className="text-sm leading-relaxed text-foreground/90">„{skript.skript}"</p>
      {aktiv && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed border-t pt-2">
          <span className="font-semibold text-primary">Warum:</span> {skript.warum}
        </p>
      )}
    </button>
  );
}

export function BeratungTrainingsCockpit() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const [aktiveId, setAktiveId] = useState<string>(SPRECHSKRIPTE_DU[0].id);
  const aktiveIdRef = useRef(aktiveId);
  aktiveIdRef.current = aktiveId;
  const [pdfLaeuft, setPdfLaeuft] = useState(false);

  // Scroll-Synchronisation: alle 400 ms die Position im iframe prüfen und die
  // Station bestimmen, die gerade im oberen Drittel des Sichtfensters liegt.
  useEffect(() => {
    const intervall = window.setInterval(() => {
      try {
        const win = iframeRef.current?.contentWindow;
        const doc = win?.document;
        if (!win || !doc) return;
        const anker = win.scrollY + win.innerHeight * 0.35;
        let beste: string | null = null;
        for (const s of SPRECHSKRIPTE_DU) {
          const el = doc.getElementById(s.id);
          if (!el) continue;
          const top = el.getBoundingClientRect().top + win.scrollY;
          if (top <= anker) beste = s.id;
        }
        if (beste && beste !== aktiveIdRef.current) {
          setAktiveId(beste);
          // Die aktive Karte in der rechten Spalte sichtbar halten.
          const karte = listeRef.current?.querySelector<HTMLElement>(`[data-skript="${beste}"]`);
          karte?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      } catch {
        // Vorschau nicht erreichbar (z. B. noch am Laden): einfach weiter.
      }
    }, 400);
    return () => window.clearInterval(intervall);
  }, []);

  // Klick auf eine Karte scrollt die Präsentation zur passenden Station.
  const springeZu = (id: string) => {
    setAktiveId(id);
    try {
      iframeRef.current?.contentWindow?.document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // Ohne Zugriff bleibt der Klick folgenlos, die Karte ist trotzdem markiert.
    }
  };

  /**
   * Erzeugt die Sprechskripte als PDF und laedt sie sofort herunter.
   *
   * Das Dokument entsteht rein aus Text, deshalb ist es in Sekundenbruchteilen
   * fertig. Es braucht weder die Vorschau noch einen Zwischenspeicher.
   */
  const ladeSkripte = async () => {
    setPdfLaeuft(true);
    try {
      const { blob, dateiname } = await buildBeratungSkriptPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      console.error("Sprechskript-PDF:", e);
      toast.error("Das PDF konnte nicht erstellt werden.");
    } finally {
      setPdfLaeuft(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5" /> Trainings-Cockpit: Präsentation und Sprechskript, synchron
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={ladeSkripte}
            disabled={pdfLaeuft}
            title="Alle Sprechskripte mit Abschnittsnummern als PDF"
          >
            {pdfLaeuft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Sprechskripte als PDF
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1">
            <a href={`${PRAESENTATION_URL}?trainer=1`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Im Trainer-Modus öffnen
            </a>
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[3fr_2fr] gap-3 items-stretch">
        <div className="relative overflow-hidden rounded-lg border bg-background">
          <iframe
            ref={iframeRef}
            src={PRAESENTATION_URL}
            title="Beratungspräsentation OS Immobilien"
            loading="lazy"
            className="w-full block"
            style={{ height: "720px" }}
          />
        </div>
        <div
          ref={listeRef}
          className="rounded-lg border bg-muted/20 p-3 space-y-2.5 overflow-y-auto"
          style={{ height: "720px" }}
        >
          <p className="text-xs text-muted-foreground flex items-start gap-2 leading-relaxed px-1">
            <MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            Scrolle links durch die Präsentation, rechts springt das passende Sprechskript mit.
            Klick auf eine Karte springt in der Präsentation zur Station.
          </p>
          {SPRECHSKRIPTE_DU.map((s) => (
            <div key={s.id} data-skript={s.id}>
              <SkriptKarte skript={s} aktiv={s.id === aktiveId} onKlick={() => springeZu(s.id)} />
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Zum Üben in voller Größe: den Trainer-Modus öffnen, dort stehen dieselben Skripte direkt
        unter jeder Station. Aus dem Kundenprofil geöffnet erscheinen sie nie. Das PDF enthält alle
        Sprechskripte mit Abschnittsnummern, es ist nur für den internen Gebrauch und gehört
        nicht in Kundenhand.
      </p>
    </div>
  );
}
