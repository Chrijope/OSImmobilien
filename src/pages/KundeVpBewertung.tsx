import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { loadVpBewertungContext } from "@/lib/vpBewertungContext";
import type { VpBewertungContext } from "@/components/kunde/VpBewertungFormular";
import { VpBewertungFormular } from "@/components/kunde/VpBewertungFormular";
import { Card } from "@/components/ui/card";
import { Sparkles, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function KundeVpBewertung() {
  const { authUser } = useUser();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isPreview = params.get("preview") === "1";
  const [ctx, setCtx] = useState<VpBewertungContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (!authUser) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await loadVpBewertungContext(authUser.id);
        if (cancelled) return;
        setCtx(res.ctx);
        setAlreadyDone(res.hasBewertung);
      } catch (e) {
        // Ohne catch blieb die Seite bei einem Reject dauerhaft im Ladezustand.
        if (cancelled) return;
        console.error("[KundeVpBewertung] Kontext konnte nicht geladen werden:", e);
        toast.error(t("portal.vp_bewertung.seite_ladefehler"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // t absichtlich nicht in den Abhängigkeiten: ein Sprachwechsel soll nicht neu laden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // Fallback-Preview wenn kein Kontakt gefunden (z.B. interne Nutzer / Vorschau)
  const effectiveCtx: VpBewertungContext | null = ctx ?? (
    (isPreview || previewMode)
      ? {
          kontaktId: "preview",
          vpUserId: null,
          vpName: t("portal.vp_bewertung.vorschau_berater"),
          kundeName: t("portal.vp_bewertung.vorschau_kunde"),
          bewertetVon: authUser?.id || "preview",
        }
      : null
  );

  if (loading) return <div className="text-sm text-muted-foreground">{t("portal.common.loading")}</div>;
  if (!effectiveCtx) {
    return (
      <Card className="max-w-2xl mx-auto p-6 space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          {t("portal.vp_bewertung.kein_kontakt")}
        </p>
        <button
          onClick={() => setPreviewMode(true)}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Eye className="h-4 w-4" /> {t("portal.vp_bewertung.vorschau_anzeigen")}
        </button>
      </Card>
    );
  }

  if (done || alreadyDone) {
    return (
      <Card className="max-w-2xl mx-auto p-8 text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 mx-auto text-[hsl(var(--success))]" />
        <h2 className="text-xl font-semibold">{t("portal.vp_bewertung.danke_titel")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("portal.vp_bewertung.danke_text")}
        </p>
        <button onClick={() => navigate("/kunde/stammdaten")} className="text-sm text-primary hover:underline pt-2">
          {t("portal.vp_bewertung.zurueck")}
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {effectiveCtx.kontaktId === "preview" && (
        <div className="max-w-3xl mx-auto rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-xs text-primary">
          {t("portal.vp_bewertung.vorschau_hinweis")}
        </div>
      )}
      <div className="max-w-3xl mx-auto rounded-xl border border-border bg-primary/5 px-4 sm:px-5 py-3 flex items-start gap-3">
        <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="text-xs text-foreground/80 leading-relaxed">
          {t("portal.vp_bewertung.vertraulich")}
        </div>
      </div>
      <VpBewertungFormular ctx={effectiveCtx} onDone={() => setDone(true)} />
    </div>
  );
}