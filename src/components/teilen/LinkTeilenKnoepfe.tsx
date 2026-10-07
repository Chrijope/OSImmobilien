/**
 * Die beiden Knöpfe oben rechts auf einer Verwaltungsseite mit persönlichem
 * Link: „Link kopieren“ und „Vorschau“.
 *
 * Herausgelöst aus der Verwaltung der Berater-Mikroseite (26.09.2026), damit
 * die Handbuch-Seite genau dasselbe Element zeigt. Beide Seiten benutzen jetzt
 * diese Komponente, so bleiben sie gleich.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function LinkTeilenKnoepfe({
  url,
  vorschauUrl,
  kopiertMeldung = "Link kopiert!",
  fehltMeldung = "Der Link wird noch vorbereitet, bitte kurz warten.",
  kopierenText = "Link kopieren",
}: {
  /** Der Link zum Kopieren, oder null, solange er noch nicht feststeht. */
  url: string | null;
  /** Wohin „Vorschau“ führt. Ohne Angabe derselbe Link. */
  vorschauUrl?: string | null;
  kopiertMeldung?: string;
  fehltMeldung?: string;
  kopierenText?: string;
}) {
  const [kopiert, setKopiert] = useState(false);
  const zeitgeber = useRef<number | null>(null);
  useEffect(() => () => {
    if (zeitgeber.current) window.clearTimeout(zeitgeber.current);
  }, []);

  const kopieren = () => {
    if (!url) {
      toast.error(fehltMeldung);
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setKopiert(true);
        toast.success(kopiertMeldung);
        zeitgeber.current = window.setTimeout(() => setKopiert(false), 3000);
      })
      .catch(() => toast.error("Kopieren ging nicht. Markiere den Link und kopiere ihn von Hand."));
  };

  const ziel = vorschauUrl ?? url;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={kopieren} disabled={!url}>
        {kopiert ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {kopiert ? "Kopiert!" : kopierenText}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => ziel && window.open(ziel, "_blank", "noopener")}
        disabled={!ziel}
      >
        <ExternalLink className="h-4 w-4" /> Vorschau
      </Button>
    </>
  );
}
