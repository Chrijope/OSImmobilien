import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, X, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { loadVpBewertungContext } from "@/lib/vpBewertungContext";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

const DISMISS_KEY = (kontaktId: string) => `vp_bewertung_dismissed_${kontaktId}`;
const DONE_KEY = (kontaktId: string) => `vp_bewertung_done_${kontaktId}`;
const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Globaler Trigger für die VP-Bewertung im Kundenportal:
 * - Popup öffnet sich beim Login, sobald >1h nach dem (spätesten) Notartermin
 *   vergangen sind und der Kunde noch nicht bewertet hat.
 * - Wird das Popup weggeklickt, erscheint ein Banner. Der Banner bleibt 7 Tage
 *   sichtbar (Dismiss-Zeitpunkt in localStorage). Danach verschwindet er still.
 *
 * Die Einladungsmail verschickt diese Komponente ausdrücklich nicht mehr. Sie
 * hing damit am Login des Kunden: Wer sich nie einloggte, wurde nie gefragt,
 * und die Sperre gegen Doppelversand lag im localStorage, also auf genau dem
 * Gerät, das ihn zufällig zuerst öffnete. Den Versand übernimmt stündlich die
 * Edge Function `send-vp-bewertung-einladungen`. Hier bleiben Popup und
 * Banner, also der Kanal für die, die ohnehin schon im Portal sind.
 */
export function VpBewertungPrompt() {
  const { authUser, user } = useUser();
  const { t } = useTranslation();
  const [kontaktId, setKontaktId] = useState<string | null>(null);
  const [vpName, setVpName] = useState<string>("");
  const [eligible, setEligible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!authUser || user.role !== "kunde") return;
    let cancelled = false;
    (async () => {
      const res = await loadVpBewertungContext(authUser.id);
      if (cancelled || !res.ctx) return;
      setKontaktId(res.ctx.kontaktId);
      setVpName(res.ctx.vpName);

      if (res.hasBewertung) return;
      try {
        if (localStorage.getItem(DONE_KEY(res.ctx.kontaktId)) === "1") return;
      } catch {}

      if (!res.latestNotarAt) return;
      const notarTs = new Date(res.latestNotarAt).getTime();
      if (Number.isNaN(notarTs)) return;
      if (Date.now() - notarTs < ONE_HOUR_MS) return;

      setEligible(true);

      let dismissed: number | null = null;
      try {
        const raw = localStorage.getItem(DISMISS_KEY(res.ctx.kontaktId));
        dismissed = raw ? parseInt(raw, 10) : null;
      } catch {}
      setDismissedAt(dismissed);

      if (!dismissed) {
        setDialogOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser, user.role]);

  if (!eligible || !kontaktId) return null;

  const showBanner =
    !dialogOpen &&
    (!dismissedAt || Date.now() - dismissedAt < SEVEN_DAYS_MS);

  const dismiss = () => {
    const ts = Date.now();
    try { localStorage.setItem(DISMISS_KEY(kontaktId), String(ts)); } catch {}
    setDismissedAt(ts);
    setDialogOpen(false);
  };

  const hideBannerFully = () => {
    const ts = Date.now() - SEVEN_DAYS_MS - 1000;
    try { localStorage.setItem(DISMISS_KEY(kontaktId), String(ts)); } catch {}
    setDismissedAt(ts);
  };

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) dismiss(); }}>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Star className="h-6 w-6 text-primary fill-primary/20" />
            </div>
            <DialogTitle className="text-center">
              {vpName
                ? t("portal.vp_bewertung.prompt_titel_name", { name: vpName })
                : t("portal.vp_bewertung.prompt_titel")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t("portal.vp_bewertung.prompt_text")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={dismiss}>{t("portal.vp_bewertung.spaeter")}</Button>
            <Button asChild onClick={() => setDialogOpen(false)}>
              <Link to="/kunde/vp-bewertung">{t("portal.vp_bewertung.jetzt_bewerten")}</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showBanner && (
        <div className="mb-4">
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 shadow-sm">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div className="text-sm text-foreground/85 flex-1 min-w-0">
              <span className="font-medium">{t("portal.vp_bewertung.banner_titel")}</span>
              <span className="hidden sm:inline text-foreground/60">{t("portal.vp_bewertung.banner_zusatz")}</span>
            </div>
            <Link
              to="/kunde/vp-bewertung"
              className="shrink-0 inline-flex items-center justify-center rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("portal.vp_bewertung.jetzt_bewerten")}
            </Link>
            <button
              type="button"
              onClick={hideBannerFully}
              className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-foreground/10 text-foreground/60"
              aria-label={t("portal.vp_bewertung.banner_ausblenden")}
              title={t("portal.vp_bewertung.banner_ausblenden")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}