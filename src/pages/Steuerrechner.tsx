/**
 * Die INTERNE Seite des Steuerrechners.
 *
 * Hier holt sich der Vertriebspartner seinen persoenlichen Link und probiert
 * den Rechner selbst aus. Aufgebaut wie `Analysetool.tsx`, und zwar bewusst
 * Zeile fuer Zeile gleich: Der Slug kommt aus `ensure-vp-slug`, nicht aus dem
 * Anzeigenamen. Ein Link aus dem Namen hat beim Analysetool schon einmal dazu
 * gefuehrt, dass Leads ohne Zustaendigkeit im offenen Pool landeten.
 *
 * Seit dem 24.09.2026 zwei Regeln mehr:
 *
 *   1. Einen Link bekommen nur die Rollen aus `BERATER_ROLLEN`, also
 *      Vertriebspartner, Vertriebsleitung, Admin und Inhaber. Wer die Seite
 *      sonst sieht, etwa das Backoffice, kann den Rechner ausprobieren, sieht
 *      aber keinen Knopf zum Teilen und keinen Link. `ensure-vp-slug` wird
 *      fuer diese Rollen gar nicht erst gerufen, die Function lehnt sie
 *      ohnehin ab.
 *   2. Es gibt nur noch den Link mit Kuerzel. Der alte Link mit `?b=` trug die
 *      Kennung offen mit und wird nicht mehr erzeugt. Solange das Kuerzel
 *      fehlt, laesst sich nichts teilen.
 */
import "@/styles/steuerrechner.css";
import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import SteuerRechnerStrecke from "@/components/steuerrechner/SteuerRechnerStrecke";
import { useUser } from "@/contexts/UserContext";
import { getProfilePic } from "@/lib/chatStore";
import { getUserSetting } from "@/lib/userSettingsCache";
import { eigeneBerufsbezeichnung } from "@/lib/beraterProfil";
import { supabase } from "@/integrations/supabase/client";
import type { BeraterInfo } from "@/pages/AnalysePublic";
import { hatEigenenPartnerLink } from "../../supabase/functions/_shared/lead-zuordnung.ts";

/** Die Felder aus den Nutzereinstellungen, die der Teilen-Link braucht. */
interface ProfilEinstellung {
  vorname?: string;
  nachname?: string;
  telefon?: string;
  position?: string;
}
interface MailEinstellung {
  signatur?: { email?: string };
}

export default function Steuerrechner() {
  const { user, authUser } = useUser();
  const [slug, setSlug] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const mitLink = hatEigenenPartnerLink(user.role);

  useEffect(() => {
    if (!authUser?.id || !mitLink) return;
    let abgebrochen = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ensure-vp-slug", { body: {} });
        if (!error && data?.slug && !abgebrochen) setSlug(String(data.slug));
      } catch (e) {
        console.warn("ensure-vp-slug fehlgeschlagen", e);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [authUser?.id, mitLink]);

  const beraterInfo = (): BeraterInfo => {
    const profil = getUserSetting<ProfilEinstellung | null>("profil", null);
    const email = getUserSetting<MailEinstellung | null>("email", null);
    const bild = getProfilePic();
    return {
      name: profil ? `${profil.vorname} ${profil.nachname}` : user.name,
      telefon: profil?.telefon || "",
      email: email?.signatur?.email || "",
      position: eigeneBerufsbezeichnung(profil?.position),
      userId: authUser?.id || "",
      ...(bild ? { bild } : {}),
    };
  };

  const teilen = () => {
    // Nur der Link mit Kuerzel. Der fruehere Rueckfall auf `?b=` mit der
    // Kennung im Link wird nicht mehr erzeugt, der Knopf ist bis dahin aus.
    if (!slug) {
      toast.info("Dein Link wird noch vergeben, einen Moment bitte.");
      return;
    }
    const url = `${window.location.origin}/steuer/${slug}`;

    navigator.clipboard.writeText(url).then(() => {
      setKopiert(true);
      toast.success("Link kopiert. Teile ihn mit Deinen Interessenten.");
      setTimeout(() => setKopiert(false), 3000);
    });
  };

  return (
    <div className="steuer-flaeche">
      <PageHeader
        title="Steuerrechner"
        subtitle={
          mitLink
            ? "Dein persönlicher Link: zeigt Interessenten, wie viel Steuer sie zahlen und wie viel davon auch anders geht"
            : "Zeigt Interessenten, wie viel Steuer sie zahlen und wie viel davon auch anders geht"
        }
      >
        {mitLink && (
          <Button
            variant="brand"
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={teilen}
            disabled={!slug}
          >
            {kopiert ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {kopiert ? "Link kopiert!" : "Steuerrechner teilen"}
            </span>
            <span className="sm:hidden">{kopiert ? "Kopiert" : "Teilen"}</span>
          </Button>
        )}
      </PageHeader>

      <div className="mx-auto max-w-[1240px]">
        {mitLink && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <Copy className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 text-xs text-muted-foreground">
              Dein Link:{" "}
              <span className="break-all font-medium text-foreground">
                {slug
                  ? `${window.location.origin}/steuer/${slug}`
                  : "wird vergeben, einen Moment"}
              </span>
              . Wer sich darüber einträgt, landet direkt bei Dir.
            </div>
          </div>
        )}

        {/* Intern wird die Kontaktabfrage uebersprungen, an ihrer Stelle steht
            ein Hinweis. Siehe `SteuerRechnerStrecke`. */}
        <SteuerRechnerStrecke berater={beraterInfo()} variante="intern" eigenerLink={mitLink} />
      </div>
    </div>
  );
}
