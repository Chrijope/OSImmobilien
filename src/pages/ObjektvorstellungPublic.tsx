import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { LinkNichtMehrGueltig } from "@/components/expose/LinkNichtMehrGueltig";
import { useNoIndex } from "@/hooks/useNoIndex";
import { ansprechpartnerAusAntwort } from "@/lib/exposePublicDaten";
import type { Person } from "@/lib/exposeInhalt";
import { istVorstellungsToken } from "../../supabase/functions/get-objektvorstellung/antwort.ts";
import { LINK_NICHT_MEHR_GUELTIG_TEXTE } from "@/components/expose/linkNichtMehrGueltigTexte";
import { texteFuer, useSeitenSprache } from "@/lib/seitenSprache";

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/get-objektvorstellung`;

/**
 * Die frühere interaktive Objektvorstellung, `/objektvorstellung/:token`.
 *
 * Seit dem 23.09.2026 abgeschaltet: Exposé, Kundenansicht und „Kundenlink
 * senden“ decken sie ab. Bereits verschickte Links sollen trotzdem nicht ins
 * Leere laufen. Die Seite zeigt deshalb nur noch einen Hinweis mit Name,
 * Telefon, E-Mail und Bild des zuständigen Partners, sonst nichts.
 *
 * `get-objektvorstellung` liefert dafür ausschließlich diese vier Angaben.
 * Auch wenn eine ältere Fassung der Function noch mehr schickt, liest die
 * Seite nur den Partner. Ohne Partner (unbekannter Link, Netzfehler) steht die
 * allgemeine Adresse da, damit der Kunde nie vor einer Seite ohne Ausweg steht.
 *
 * Sprache (Kundensprache, Etappe 3): Die Function schickt `sprache` aus dem
 * Kundenprofil mit, `?lang=en` in der Adresse überschreibt die Anzeige.
 * Ohne beides, etwa mit einer älteren Fassung der Function, bleibt es Deutsch.
 */
export default function ObjektvorstellungPublic() {
  const { token } = useParams();
  useNoIndex();
  const [geladen, setGeladen] = useState(false);
  const [partner, setPartner] = useState<Person | undefined>(undefined);
  const [serverSprache, setServerSprache] = useState<unknown>(undefined);
  const sprache = useSeitenSprache(serverSprache);

  useEffect(() => {
    let aktiv = true;
    if (!istVorstellungsToken(token)) {
      setGeladen(true);
      return;
    }
    (async () => {
      let gefunden: Person | undefined;
      let spracheDaten: unknown;
      try {
        const antwort = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const daten = (await antwort.json().catch(() => null)) as { ansprechpartner?: unknown; sprache?: unknown } | null;
        gefunden = ansprechpartnerAusAntwort(daten?.ansprechpartner);
        spracheDaten = daten?.sprache;
      } catch {
        // Netzfehler: Der Hinweis erscheint ohne Partner, mit der allgemeinen Adresse.
      }
      if (aktiv) {
        setPartner(gefunden);
        setServerSprache(spracheDaten);
        setGeladen(true);
      }
    })();
    return () => { aktiv = false; };
  }, [token]);

  if (!geladen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={texteFuer(LINK_NICHT_MEHR_GUELTIG_TEXTE, sprache).laedt} />
      </div>
    );
  }
  return <LinkNichtMehrGueltig ansprechpartner={partner} art="objektvorstellung" sprache={sprache} />;
}
