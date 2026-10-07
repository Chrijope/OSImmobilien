import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import DatenschutzEn from "./DatenschutzEn";
import { normalisiereSprache } from "../../supabase/functions/_shared/kunden-sprache.ts";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { DatenschutzInhalt } from "@/components/datenschutz/DatenschutzInhalt";
import { DATENSCHUTZ_FASSUNG, DATENSCHUTZ_TEXTE } from "@/lib/datenschutzTexte";
import { useHtmlLang } from "@/lib/seitenSprache";

/**
 * Die Datenschutzerklärung. Der Wortlaut steht in `src/lib/datenschutzTexte.ts`
 * (interner Vermerk dort: Entwurf Stand 26.09.2026, anwaltliche Prüfung
 * ausstehend).
 */
export default function Datenschutz() {
  /*
   * Englische Fassung über `?lang=en` (Plan Kundensprache, Etappe 4). Mails,
   * Portal und Kundenseiten hängen den Parameter an, wenn der Kunde Englisch
   * hat. Ohne Parameter bleibt alles wie bisher deutsch.
   */
  const [params] = useSearchParams();
  const englisch = normalisiereSprache(params.get("lang")) === "en";
  // `<html lang>` folgt der Fassung. Daran liest der Cookie-Hinweis seine
  // Sprache ab, so öffnen sich die Cookie-Einstellungen auf der englischen
  // Seite auch auf Englisch (27.09.2026, Punkt 14).
  useHtmlLang(englisch ? "en" : "de");
  if (englisch) return <DatenschutzEn />;
  const fassung = DATENSCHUTZ_TEXTE.de;
  return (
    <div data-lg="seite" className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>

        <div className="mb-2 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{fassung.titel}</h1>
          <Link to="/datenschutz?lang=en" lang="en" className="text-sm text-primary hover:underline shrink-0">English version</Link>
        </div>

        <DatenschutzInhalt fassung={fassung} sprache="de" />

        <div className="border-t mt-12 pt-6 text-xs text-muted-foreground text-center flex flex-wrap justify-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} MOREImmo · Einzelunternehmen Christian Kurz</span>
          <Link to="/impressum" className="hover:underline">Impressum</Link>
          <CookieEinstellungenLink className="hover:underline" />
          <span>Fassung {DATENSCHUTZ_FASSUNG}</span>
        </div>
      </div>
    </div>
  );
}
