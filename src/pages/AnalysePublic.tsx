import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import AnalysisWizard from "@/components/analysis/AnalysisWizard";
import moreimmoLogo from "@/assets/moreimmo-offices-logo.png";
import { nurEchteBezeichnung } from "@/lib/berufsbezeichnung";
import { SeitenSpracheProvider, SeitenSprachUmschalter, useSeitenTexte } from "@/components/SeitenSprache";
import { ANALYSE_TEXTE } from "@/components/analysis/analyseTexte";

export interface BeraterInfo {
  name: string;
  telefon: string;
  email: string;
  bild?: string;
  position?: string;
  /** Auth-User-ID des Beraters – wird für Lead-Zuweisung und Benachrichtigung genutzt. */
  userId?: string;
  /**
   * Das Kürzel aus dem persönlichen Link (/analyse/<kürzel>, /steuer/<kürzel>).
   * Geht mit dem Lead an `submit-lead`, der Server ermittelt den Partner
   * daraus selbst. Fehlt es, ist es ein alter Link mit `?b=`, dann zählt
   * `userId`.
   */
  slug?: string;
}

/**
 * Die öffentliche Analyseseite, auf Deutsch oder Englisch (Plan
 * Kundensprache, Etappe 6). Die Sprache ermittelt der Provider aus `?lang=`,
 * der gemerkten Wahl oder dem Browser, siehe `src/lib/seitenSprache.ts`. Die
 * Bausteine darunter laufen auch intern auf `/analysetool`, dort ohne
 * Provider und damit unverändert deutsch.
 */
export default function AnalysePublic() {
  return (
    <SeitenSpracheProvider>
      <AnalysePublicInhalt />
    </SeitenSpracheProvider>
  );
}

function AnalysePublicInhalt() {
  const t = useSeitenTexte(ANALYSE_TEXTE).seite;
  const [searchParams] = useSearchParams();
  const { slug } = useParams<{ slug?: string }>();

  // Hide-Flag: aus Erstgespräch-Erinnerungs-Mail aufgerufen → vereinfachte Ergebnisseite.
  const hideAdvancedSections = searchParams.get("source") === "reminder";

  // 1) Legacy: Vertriebspartner aus Base64-Param (?b=…) parsen.
  const beraterFromQuery = useMemo<BeraterInfo | undefined>(() => {
    const encoded = searchParams.get("b");
    if (!encoded) return undefined;
    try {
      return JSON.parse(atob(encoded));
    } catch {
      return undefined;
    }
  }, [searchParams]);

  // 2) Neu: Vertriebspartner per Slug (/analyse/timo-blum) aus profiles + user_settings laden.
  const [beraterFromSlug, setBeraterFromSlug] = useState<BeraterInfo | undefined>(undefined);
  const [loadingSlug, setLoadingSlug] = useState<boolean>(!!slug);

  useEffect(() => {
    if (!slug) {
      setLoadingSlug(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlug(true);
      try {
        // Auflösung über dieselbe Edge Function wie die persönliche
        // Landingpage. Vorher las diese Seite anonym die Ansicht
        // `profiles_public` und verglich clientseitig die Namen. Das konnte
        // gar nicht funktionieren: Die Ansicht läuft mit den Rechten des
        // Aufrufers, und für einen nicht angemeldeten Besucher ist sie leer.
        // Der Berater blieb damit unbekannt, der Lead landete ohne
        // Zuständigkeit im offenen Pool, und der Partner sah seinen eigenen
        // Interessenten nirgends. Die Function arbeitet mit Service-Rolle und
        // löst über den dauerhaft vergebenen `vp_slug` auf.
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "irwdgutegmivbtgmftyc";
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/get-vp-microsite?slug=${encodeURIComponent(slug.toLowerCase())}`,
        );
        if (!res.ok) {
          if (!cancelled) setBeraterFromSlug(undefined);
          return;
        }
        const json = await res.json();
        if (cancelled || !json?.userId) {
          if (!cancelled) setBeraterFromSlug(undefined);
          return;
        }
        setBeraterFromSlug({
          name: json.name || "",
          telefon: json.telefon || "",
          email: json.email || "",
          position: nurEchteBezeichnung(json.position),
          userId: json.userId,
          slug: String(json.slug || slug).toLowerCase(),
          ...(json.bild ? { bild: json.bild } : {}),
        });
      } catch (e) {
        console.warn("[analyse] Berater konnte nicht aufgelöst werden", e);
        if (!cancelled) setBeraterFromSlug(undefined);
      } finally {
        if (!cancelled) setLoadingSlug(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const berater = beraterFromSlug || beraterFromQuery;

  return (
    <div data-lg="seite" className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4">
        {/* Der Umschalter sitzt rechts oben in einer eigenen Zeile, damit er
            das mittige Logo auf schmalen Bildschirmen nicht verdrängt. */}
        <div className="flex justify-end -mt-4 mb-2">
          <SeitenSprachUmschalter />
        </div>
        <div className="text-center mb-6">
          <img
            src={moreimmoLogo}
            alt="OS Immobilien"
            className="mx-auto h-10 md:h-12 w-auto object-contain"
          />
          {loadingSlug && (
            <p className="text-sm text-muted-foreground mt-3">{t.ladeBerater}</p>
          )}
          {!loadingSlug && berater && (
            <p className="text-sm text-muted-foreground mt-3">
              {t.bereitgestelltVon(berater.name)}
            </p>
          )}
          {hideAdvancedSections && (
            <p className="text-xs text-muted-foreground mt-2 max-w-xl mx-auto">
              {t.erinnerungHinweis}
            </p>
          )}
        </div>
        <AnalysisWizard
        berater={berater}
        hideAdvancedSections={hideAdvancedSections}
        // Auf dem öffentlichen Link steht die Eintragung vor dem Ergebnis.
        // Im Erinnerungsmodus nicht: Wer aus der Mail kommt, ist längst Kontakt.
        leadEintragung={!hideAdvancedSections}
      />
      </div>
    </div>
  );
}
