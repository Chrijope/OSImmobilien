import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import type { TFunction } from "i18next";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Die Schlüssel `key` sind Spalten in `vp_bewertungen` und bleiben unverändert.
// Die Fragen stehen als feste t()-Aufrufe da, damit der Schlüsseltest sie prüft.
const QUESTION_KEYS = [
  "r_informationen",
  "r_arbeitsweise",
  "r_ziele",
  "r_produkt",
  "r_beratungsart",
  "r_berater_erfahrung",
] as const;

function questionLabels(t: TFunction): Record<(typeof QUESTION_KEYS)[number], string> {
  return {
    r_informationen: t("portal.vp_bewertung.frage_informationen"),
    r_arbeitsweise: t("portal.vp_bewertung.frage_arbeitsweise"),
    r_ziele: t("portal.vp_bewertung.frage_ziele"),
    r_produkt: t("portal.vp_bewertung.frage_produkt"),
    r_beratungsart: t("portal.vp_bewertung.frage_beratungsart"),
    r_berater_erfahrung: t("portal.vp_bewertung.frage_berater_erfahrung"),
  };
}

// index 0..3 → value 1..4
function ratingLabels(t: TFunction): string[] {
  return [
    t("portal.vp_bewertung.note_schlecht"),
    t("portal.vp_bewertung.note_mittel"),
    t("portal.vp_bewertung.note_gut"),
    t("portal.vp_bewertung.note_sehr_gut"),
  ];
}

type RatingsState = Record<string, number>;

export type VpBewertungContext = {
  kontaktId: string;
  vpUserId: string | null;
  vpName: string;
  kundeName: string;
  bewertetVon: string;
};

export function VpBewertungFormular({
  ctx,
  onDone,
  compact,
}: {
  ctx: VpBewertungContext;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [ratings, setRatings] = useState<RatingsState>({});
  const [gelohnt, setGelohnt] = useState<boolean | null>(null);
  const [weiterempfehlung, setWeiterempfehlung] = useState<boolean | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const labels = questionLabels(t);
  const RATING_LABELS = ratingLabels(t);

  const allRated = QUESTION_KEYS.every((key) => ratings[key] >= 1 && ratings[key] <= 4);
  const canSubmit = allRated && gelohnt !== null && weiterempfehlung !== null && !saving;

  const submit = async () => {
    if (!canSubmit) {
      toast.error(t("portal.vp_bewertung.toast_pflicht"));
      return;
    }
    setSaving(true);
    try {
      // Vorschau-Modus: nicht speichern
      if (ctx.kontaktId === "preview") {
        toast.success(t("portal.vp_bewertung.toast_vorschau"));
        onDone?.();
        return;
      }
      const payload: any = {
        kontakt_id: ctx.kontaktId,
        vp_user_id: ctx.vpUserId,
        vp_name: ctx.vpName,
        kunde_name: ctx.kundeName,
        bewertet_von: ctx.bewertetVon,
        gelohnt,
        weiterempfehlung,
        kommentar: kommentar.trim() || null,
        datenschutz_akzeptiert: true,
        ...ratings,
      };
      const { error } = await supabase.from("vp_bewertungen" as any).insert(payload);
      if (error) {
        if (error.code === "23505") {
          toast.success(t("portal.vp_bewertung.toast_bereits"));
          onDone?.();
          return;
        }
        throw error;
      }
      try {
        localStorage.setItem(`vp_bewertung_done_${ctx.kontaktId}`, "1");
      } catch {}
      toast.success(t("portal.vp_bewertung.toast_erfolg"));
      onDone?.();
    } catch (e: any) {
      toast.error(t("portal.vp_bewertung.toast_fehler", { fehler: e?.message || t("portal.vp_bewertung.unbekannter_fehler") }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-5", compact ? "" : "max-w-3xl mx-auto")}>
      {!compact && (
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("portal.vp_bewertung.titel")}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("portal.vp_bewertung.einleitung")}
          </p>
          <div className="text-xs text-muted-foreground pt-1">
            {t("portal.vp_bewertung.label_berater")} <span className="font-medium text-foreground">{ctx.vpName || "—"}</span>
            <span className="mx-2 text-foreground/30">•</span>
            {t("portal.vp_bewertung.label_kunde")} <span className="font-medium text-foreground">{ctx.kundeName || "—"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            <Trans i18nKey="portal.vp_bewertung.pflicht_hinweis" components={[<span key="0" className="text-destructive" />]} />
          </p>
        </div>
      )}

      <Card className="p-4 sm:p-6 space-y-4">
        {QUESTION_KEYS.map((key, idx) => (
          <div key={key} className={cn("py-2", idx > 0 && "border-t border-border")}>
            <div className="text-sm font-medium mb-2">
              {labels[key]} <span className="text-destructive">*</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {RATING_LABELS.map((lbl, i) => {
                const val = i + 1;
                const active = ratings[key] === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRatings((r) => ({ ...r, [key]: val }))}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-foreground/40",
                    )}
                    aria-pressed={active}
                  >
                    <span className="inline-flex">
                      {Array.from({ length: val }).map((_, k) => (
                        <Star key={k} className={cn("h-3 w-3", active ? "fill-current" : "text-yellow-500 fill-yellow-500")} />
                      ))}
                    </span>
                    <span className="font-medium">{lbl}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <div className="text-sm font-medium mb-2">
            {t("portal.vp_bewertung.frage_gelohnt")} <span className="text-destructive">*</span>
          </div>
          <YesNo value={gelohnt} onChange={setGelohnt} />
        </div>
        <div className="border-t border-border pt-4">
          <div className="text-sm font-medium mb-2">
            {t("portal.vp_bewertung.frage_weiterempfehlung")} <span className="text-destructive">*</span>
          </div>
          <YesNo value={weiterempfehlung} onChange={setWeiterempfehlung} />
        </div>
      </Card>

      <Card className="p-4 sm:p-6 space-y-3">
        <label className="text-sm font-medium" htmlFor="vp-kommentar">
          {t("portal.vp_bewertung.kommentar_label")} <span className="text-xs font-normal text-muted-foreground">{t("portal.vp_bewertung.optional")}</span>
        </label>
        <Textarea
          id="vp-kommentar"
          value={kommentar}
          onChange={(e) => setKommentar(e.target.value)}
          placeholder={t("portal.vp_bewertung.kommentar_placeholder")}
          rows={4}
          maxLength={2000}
        />
      </Card>

      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
        {t("portal.vp_bewertung.einwilligung")}
      </p>

      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={!canSubmit} size="lg">
          {saving ? t("portal.vp_bewertung.senden_laeuft") : t("portal.vp_bewertung.absenden")}
        </Button>
      </div>
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      {[
        { v: true, label: t("portal.vp_bewertung.ja") },
        { v: false, label: t("portal.vp_bewertung.nein") },
      ].map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "px-4 py-1.5 rounded-full border text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-foreground/40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}