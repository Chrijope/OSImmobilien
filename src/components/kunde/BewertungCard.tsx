import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, CheckCircle2, MessageSquareHeart, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  kundeId: string;
  investmentId: string;
  beraterId?: string | null;
  beraterName?: string;
  pipelineStufe: string;
}

/**
 * D1: Bewertungssystem – nur sichtbar nach pipelineStufe="abgeschlossen".
 * Kunde bewertet Gesamt + Vertriebspartner + Prozess + Objekt (1–5 Sterne) und kann Kommentar abgeben.
 */
export function BewertungCard({ kundeId, investmentId, beraterId, beraterName, pipelineStufe }: Props) {
  const { t } = useTranslation();
  const [existing, setExisting] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [gesamt, setGesamt] = useState(0);
  const [berater, setBerater] = useState(0);
  const [prozess, setProzess] = useState(0);
  const [objekt, setObjekt] = useState(0);
  const [kommentar, setKommentar] = useState("");
  const [weiterempfehlung, setWeiterempfehlung] = useState(true);

  useEffect(() => {
    if (pipelineStufe !== "abgeschlossen") {
      setLoading(false);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("kunden_bewertungen")
        .select("*")
        .eq("kunde_id", kundeId)
        .eq("investment_id", investmentId)
        .maybeSingle();
      if (data) setExisting(data);
      setLoading(false);
    };
    load();
  }, [kundeId, investmentId, pipelineStufe]);

  if (pipelineStufe !== "abgeschlossen" || loading) return null;

  if (existing) {
    return (
      <Card className="p-5 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm mb-1">{t("portal.cards.bewertung.thanks_title")}</h3>
            <div className="flex items-center gap-1 mt-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`h-4 w-4 ${n <= existing.bewertung_gesamt ? "fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" : "text-muted-foreground/30"}`} />
              ))}
              <span className="text-xs text-muted-foreground ml-2">{existing.bewertung_gesamt}/5</span>
            </div>
            {existing.kommentar && (
              <p className="text-xs text-muted-foreground mt-2">„{existing.kommentar}“</p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const handleSubmit = async () => {
    if (gesamt < 1) {
      toast.error(t("portal.cards.bewertung.toast_min"));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("kunden_bewertungen").insert({
        kunde_id: kundeId,
        investment_id: investmentId,
        berater_id: beraterId || null,
        berater_name: beraterName || null,
        bewertung_gesamt: gesamt,
        bewertung_berater: berater || null,
        bewertung_prozess: prozess || null,
        bewertung_objekt: objekt || null,
        kommentar: kommentar.trim() || null,
        weiterempfehlung,
      });
      if (error) throw error;

      // Vertriebspartner + Admins benachrichtigen
      const empfaenger: string[] = [];
      if (beraterId) empfaenger.push(beraterId);
      const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "inhaber"]);
      (admins || []).forEach((a: any) => empfaenger.push(a.user_id));
      for (const uid of Array.from(new Set(empfaenger))) {
        await supabase.from("benachrichtigungen").insert({
          benutzer_id: uid,
          titel: "Neue Kundenbewertung",
          nachricht: `Ein Kunde hat ${gesamt} von 5 Sternen vergeben${kommentar.trim() ? ` mit Kommentar.` : "."}`,
          link: `/kunden/${kundeId}`,
        });
      }

      toast.success(t("portal.cards.bewertung.toast_success"));
      setExisting({ bewertung_gesamt: gesamt, kommentar: kommentar.trim() });
    } catch (e: any) {
      toast.error(t("portal.cards.bewertung.toast_error") + (e.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <MessageSquareHeart className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-sm mb-1">{t("portal.cards.bewertung.how_title")}</h3>
          <p className="text-xs text-muted-foreground">{t("portal.cards.bewertung.how_sub")}</p>
        </div>
      </div>

      <div className="space-y-4">
        <RatingRow label={t("portal.cards.bewertung.overall")} value={gesamt} onChange={setGesamt} required />
        <RatingRow label={beraterName ? t("portal.cards.bewertung.vp_named", { name: beraterName }) : t("portal.cards.bewertung.vp")} value={berater} onChange={setBerater} />
        <RatingRow label={t("portal.cards.bewertung.process")} value={prozess} onChange={setProzess} />
        <RatingRow label={t("portal.cards.bewertung.object")} value={objekt} onChange={setObjekt} />

        <div>
          <Label className="text-xs font-semibold">{t("portal.cards.bewertung.comment_label")}</Label>
          <Textarea
            value={kommentar}
            onChange={(e) => setKommentar(e.target.value)}
            placeholder={t("portal.cards.bewertung.comment_placeholder")}
            rows={3}
            className="mt-1.5 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="bewertung-weiterempfehlung"
            checked={weiterempfehlung}
            onCheckedChange={(v) => setWeiterempfehlung(v === true)}
          />
          <Label htmlFor="bewertung-weiterempfehlung" className="text-xs font-normal cursor-pointer">
            {t("portal.cards.bewertung.recommend")}
          </Label>
        </div>

        <Button onClick={handleSubmit} disabled={submitting || gesamt < 1} className="w-full">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t("portal.cards.bewertung.sending")}</> : t("portal.cards.bewertung.submit")}
        </Button>
      </div>
    </Card>
  );
}

function RatingRow({ label, value, onChange, required }: { label: string; value: number; onChange: (v: number) => void; required?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs font-medium flex-1">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n === value ? 0 : n)}
            className="p-0.5 hover:scale-110 transition-transform"
            aria-label={t("portal.cards.bewertung.stars_aria", { n })}
          >
            <Star className={`h-5 w-5 ${n <= value ? "fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
