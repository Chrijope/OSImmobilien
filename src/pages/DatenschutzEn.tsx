import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { DatenschutzInhalt } from "@/components/datenschutz/DatenschutzInhalt";
import { DATENSCHUTZ_FASSUNG, DATENSCHUTZ_TEXTE } from "@/lib/datenschutzTexte";
import { VORRANGKLAUSEL } from "@/lib/zweisprachig";

/**
 * Die englische Fassung der Datenschutzerklärung (Plan Kundensprache, D8).
 *
 * Der Wortlaut steht zusammen mit dem deutschen in `src/lib/datenschutzTexte.ts`,
 * Abschnitt für Abschnitt mit denselben Sprungmarken. Maßgeblich bleibt die
 * deutsche Fassung; das steht oben auf der Seite in beiden Sprachen.
 *
 * Aufgerufen über `/datenschutz?lang=en`.
 */
export const DATENSCHUTZ_FASSUNG_EN = `${DATENSCHUTZ_FASSUNG}-en`;

export default function DatenschutzEn() {
  const fassung = DATENSCHUTZ_TEXTE.en;
  return (
    <div data-lg="seite" lang="en" className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mb-2 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{fassung.titel}</h1>
          <Link to="/datenschutz" className="text-sm text-primary hover:underline shrink-0">Deutsche Fassung</Link>
        </div>

        <div className="my-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-1">
          <p>This is an English translation of our privacy policy (Datenschutzerklärung). {VORRANGKLAUSEL.en}</p>
          <p lang="de" className="text-muted-foreground">Dies ist eine englische Übersetzung unserer Datenschutzerklärung. {VORRANGKLAUSEL.de}</p>
        </div>

        <DatenschutzInhalt fassung={fassung} sprache="en" />

        <div className="border-t mt-12 pt-6 text-xs text-muted-foreground text-center flex flex-wrap justify-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} MOREImmo · Sole proprietorship Christian Kurz</span>
          <Link to="/impressum?lang=en" className="hover:underline">Legal notice</Link>
          <CookieEinstellungenLink sprache="en" className="hover:underline" />
          <span>Version {DATENSCHUTZ_FASSUNG_EN}</span>
        </div>
      </div>
    </div>
  );
}
