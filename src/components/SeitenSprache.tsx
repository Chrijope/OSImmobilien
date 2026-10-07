/**
 * Sprache und Umschalter für die anonymen öffentlichen Seiten.
 *
 * Die Regeln stehen in `src/lib/seitenSprache.ts`. Hier liegt nur, was React
 * braucht:
 *
 *   <SeitenSpracheProvider>        um die ganze öffentliche Seite
 *   useSeitenSprache()             "de" | "en", ohne Provider immer "de"
 *   useSeitenTexte(TEXTE)          TEXTE[sprache]
 *   <SeitenSprachUmschalter />     DE/EN oben auf der Seite, ohne Provider unsichtbar
 *
 * Ohne Provider ist alles Deutsch. Das ist Absicht: Die Bausteine von
 * Steuerrechner, Analysetool und Mikroseite laufen auch im CRM (`/steuerrechner`,
 * `/analysetool`, Vorschau der Mikroseite, Beratungspräsentation), und dort
 * soll sich nichts ändern.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { LanguageToggle } from "@/components/kunde/portal/LanguageToggle";
import { cn } from "@/lib/utils";
import {
  SEITEN_SPRACHE_PARAMETER,
  browserSprachen,
  ermittleSeitenSprache,
  leseGemerkteSeitenSprache,
  merkeSeitenSprache,
  type Sprache,
} from "@/lib/seitenSprache";
import { normalisiereSprache } from "../../supabase/functions/_shared/kunden-sprache.ts";

interface SeitenSpracheWert {
  sprache: Sprache;
  setzeSprache: (sprache: Sprache) => void;
}

const SeitenSpracheKontext = createContext<SeitenSpracheWert | null>(null);

export function SeitenSpracheProvider({ children }: { children: ReactNode }) {
  const [suche, setSuche] = useSearchParams();
  const zustand = useLocation().state;
  const parameter = suche.get(SEITEN_SPRACHE_PARAMETER);

  const [sprache, setSprache] = useState<Sprache>(() =>
    ermittleSeitenSprache({ parameter, gemerkt: leseGemerkteSeitenSprache(), browser: browserSprachen() }),
  );

  // Ändert sich `?lang=` später (Verweis innerhalb der Seite, Zurück im
  // Browser), folgt die Seite der Adresse.
  useEffect(() => {
    const ausAdresse = normalisiereSprache(parameter);
    if (ausAdresse) setSprache(ausAdresse);
  }, [parameter]);

  // `<html lang>` für Bildschirmleser, Silbentrennung und Übersetzungshilfen
  // des Browsers. Beim Verlassen der Seite wieder wie vorher.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const vorher = document.documentElement.lang;
    document.documentElement.lang = sprache;
    return () => {
      document.documentElement.lang = vorher;
    };
  }, [sprache]);

  const setzeSprache = useCallback(
    (neu: Sprache) => {
      setSprache(neu);
      merkeSeitenSprache(neu);
      // Die Adresse trägt die Wahl mit, damit Neuladen und Teilen sie behalten.
      // Der Navigationszustand bleibt erhalten: Das frische Handbuch-Ergebnis
      // (/handbuch/ergebnis/neu) steckt nur dort.
      setSuche(
        (alt) => {
          const naechste = new URLSearchParams(alt);
          naechste.set(SEITEN_SPRACHE_PARAMETER, neu);
          return naechste;
        },
        { replace: true, state: zustand },
      );
    },
    [setSuche, zustand],
  );

  const wert = useMemo(() => ({ sprache, setzeSprache }), [sprache, setzeSprache]);
  return <SeitenSpracheKontext.Provider value={wert}>{children}</SeitenSpracheKontext.Provider>;
}

/** Die Sprache der Seite. Ohne Provider (CRM, Tests) Deutsch. */
export function useSeitenSprache(): Sprache {
  return useContext(SeitenSpracheKontext)?.sprache ?? "de";
}

/** Die Texte einer Seite in ihrer Sprache. */
export function useSeitenTexte<T>(texte: { de: T; en: T }): T {
  return texte[useSeitenSprache()];
}

/**
 * Der kleine Umschalter DE/EN. Er sitzt oben auf jeder anonymen Seite.
 * Ohne Provider zeigt er nichts, im CRM taucht er also nicht auf.
 */
export function SeitenSprachUmschalter({ className }: { className?: string }) {
  const kontext = useContext(SeitenSpracheKontext);
  if (!kontext) return null;
  return (
    <LanguageToggle
      value={kontext.sprache}
      onChange={kontext.setzeSprache}
      label={kontext.sprache === "en" ? "Language" : "Sprache"}
      className={cn(
        "rounded-full border border-border/70 bg-background/80 text-foreground shadow-sm backdrop-blur hover:text-primary",
        className,
      )}
    />
  );
}
