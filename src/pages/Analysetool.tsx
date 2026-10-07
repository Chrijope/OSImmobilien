import { useState, useEffect } from 'react';
import AnalysisWizard from '@/components/analysis/AnalysisWizard';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Share2, Check, Copy } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { getProfilePic } from '@/lib/chatStore';
import { toast } from 'sonner';
import { getUserSetting } from '@/lib/userSettingsCache';
import { eigeneBerufsbezeichnung } from '@/lib/beraterProfil';
import { supabase } from '@/integrations/supabase/client';

const Analysetool = () => {
  const { user, authUser } = useUser();
  const [copied, setCopied] = useState(false);
  /**
   * Der dauerhaft vergebene Slug des eigenen Kontos.
   *
   * Vorher wurde der Teilen-Link aus dem Anzeigenamen gebaut
   * (`/analyse/vorname-nachname`) und die öffentliche Seite versuchte, daraus
   * den Partner zu erraten. Das ging aus zwei Gründen schief: Die Seite las
   * dafür anonym eine Ansicht, die für nicht angemeldete Besucher leer ist,
   * und der Link stammte aus einer anderen Namensquelle als der Vergleich.
   * Ergebnis war ein Lead ohne Zuständigkeit, den der Partner nirgends sah.
   *
   * Jetzt derselbe Weg wie bei der persönlichen Landingpage: ein echter,
   * kollisionsgeschützter Slug aus `ensure-vp-slug`.
   */
  const [slug, setSlug] = useState<string>("");

  useEffect(() => {
    if (!authUser?.id) return;
    let abgebrochen = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ensure-vp-slug", { body: {} });
        if (!error && data?.slug && !abgebrochen) setSlug(String(data.slug));
      } catch (e) {
        console.warn("ensure-vp-slug fehlgeschlagen", e);
      }
    })();
    return () => { abgebrochen = true; };
  }, [authUser?.id]);

  const getBeraterInfo = () => {
    const profil = getUserSetting<any>("profil", null);
    const emailSettings = getUserSetting<any>("email", null);
    const profilBild = getProfilePic();
    // Single source of truth: authUser.id aus dem React-Context.
    // Früher per localStorage("mi_current_user_id") – das konnte leer sein
    // (z. B. nach Hard-Reload, Inkognito-Tab oder Test-Account-Wechsel),
    // wodurch eingehende Analysetool-Leads ohne zustaendig_id beim
    // Default-Vertriebspartner "Christian Peetz" gelandet sind.
    const userId = authUser?.id || (() => {
      try { return localStorage.getItem("mi_current_user_id") || ""; } catch { return ""; }
    })();

    return {
      name: profil ? `${profil.vorname} ${profil.nachname}` : user.name,
      telefon: profil?.telefon || "",
      email: emailSettings?.signatur?.email || "",
      position: eigeneBerufsbezeichnung(profil?.position),
      userId,
      ...(profilBild ? { bild: profilBild } : {}),
    };
  };

  const handleShare = () => {
    const beraterInfo = getBeraterInfo();
    // Der Slug ist der verlässliche Weg. Solange er noch nicht geladen ist
    // oder nicht vergeben werden konnte, trägt der Base64-Link die Kennung
    // direkt mit. Beides ordnet den Lead zu, nur der Slug ist der schönere
    // Link. Ein Link ohne beides darf es nicht mehr geben.
    const url = slug
      ? `${window.location.origin}/analyse/${slug}`
      : `${window.location.origin}/analyse?b=${btoa(JSON.stringify(beraterInfo))}`;

    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Link kopiert! Teile ihn mit Deinen Interessenten.");
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    // Kein eigener Innenabstand mehr: Die Seite liegt jetzt in der App-Hülle,
    // und deren Hauptbereich polstert bereits. Doppelt gepolstert sähe sie
    // eingerückt aus, wie es die Marktanalyse-Seiten waren.
    <div>
      <PageHeader title="Analysetool" subtitle="Investment-Analyse für Deine Kunden">
        <Button variant="brand" size="sm" className="gap-2 whitespace-nowrap" onClick={handleShare}>
          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          <span className="hidden sm:inline">{copied ? "Link kopiert!" : "Analyse teilen"}</span>
          <span className="sm:hidden">{copied ? "Kopiert" : "Teilen"}</span>
        </Button>
      </PageHeader>
      <AnalysisWizard berater={getBeraterInfo()} />
    </div>
  );
};

export default Analysetool;
