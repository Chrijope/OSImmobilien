import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getNotarTerminVorschlaegeFreigegeben,
  getNotarTerminBestaetigt,
  setNotarTerminBestaetigt,
  type NotarTerminVorschlag,
} from "@/lib/investmentsStore";
import { portalSprache } from "@/i18n/portalSprache";
import { datumText } from "@/lib/sprachFormat";
import { notarterminBestaetigungIntern } from "@/lib/notarterminMail";
import { oeffentlicheAdresse } from "@/lib/oeffentlicheBasis";
import { useTranslation, Trans } from "react-i18next";

/** Datum in der Anzeigesprache; Unlesbares bleibt so stehen, wie es gespeichert ist. */
const fmtDatum = (datum: string) => datumText(datum, portalSprache()) || datum;

interface Props {
  investmentId: string;
  invMeta: Record<string, any>;
  onConfirmed?: () => void;
}

/**
 * B3: Kunde wählt aus mehreren Notarterminen einen aus.
 * Sichtbar nur, wenn:
 *  - der VP-Modus "vorschlaege" gewählt hat (synchronisiert),
 *  - mindestens 1 freigegebener Vorschlag vorliegt,
 *  - oder der Kunde bereits einen Termin bestätigt hat (dann Erfolgskarte).
 *
 * Im Modus "gesetzt" wird die Karte komplett ausgeblendet, damit alte
 * Vorschläge/Bestätigungen nicht weiterleben, wenn der VP umstellt.
 */
export function NotarterminAuswahlCard({ investmentId, invMeta, onConfirmed }: Props) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const modus: "gesetzt" | "vorschlaege" = invMeta.notarTerminModus || "gesetzt";
  // Im Modus "gesetzt" niemals Vorschläge oder alte Bestätigung zeigen
  if (modus !== "vorschlaege") return null;
  // Schutz: Ohne Aufnahmebogen Notar dürfen keine Vorschläge im Kundenportal erscheinen.
  // Verhindert, dass Altdaten (z. B. nach unvollständigem Reset) weiterleben.
  const hatAufnahmebogen = !!(invMeta.kaufvertragPdf && String(invMeta.kaufvertragPdf).trim() !== "");
  if (!hatAufnahmebogen) return null;

  const vorschlaege: NotarTerminVorschlag[] = invMeta.notarTerminVorschlaegeFreigegeben || getNotarTerminVorschlaegeFreigegeben(investmentId) || [];
  const bestaetigt = invMeta.notarTerminBestaetigt || getNotarTerminBestaetigt(investmentId);

  // ── Gating: Vorschläge erscheinen im Kundenportal NUR wenn der VP sie über
  // den FREIGEBEN-Button im VP-Profil aktiv freigegeben hat. Ein bereits
  // bestätigter Termin wird unabhängig davon weiter angezeigt.
  const portalFreigegeben = !!invMeta.notarTerminPortalFreigabe;
  if (!bestaetigt && !portalFreigegeben) return null;

  // Wenn keine Vorschläge UND keine Bestätigung vorliegen → still sein
  if ((!vorschlaege || vorschlaege.length < 1) && !bestaetigt) return null;

  const handleConfirm = async (v: NotarTerminVorschlag, idx: number) => {
    setPending(`${idx}`);
    try {
      // SECURITY-DEFINER RPC: Kunden haben keine UPDATE-Rechte auf investments,
      // daher schreibt eine RPC den bestätigten Termin atomar in die meta.
      const { error: rpcError } = await supabase.rpc("confirm_notar_termin", {
        _investment_id: investmentId,
        _datum: v.datum,
        _uhrzeit: v.uhrzeit || "",
      });
      if (rpcError) throw rpcError;

      // Lokalen Cache nachziehen, damit kein veralteter Wert beim nächsten
      // Re-Render diesen DB-Stand wieder überschreibt.
      setNotarTerminBestaetigt(investmentId, v.datum, v.uhrzeit);

      // 3) Admins/Vertriebspartner benachrichtigen (kunde_id für Link nachladen)
      try {
        const { data: invRow } = await supabase
          .from("investments")
          .select("kunde_id")
          .eq("id", investmentId)
          .maybeSingle();
        const { data: kontakt } = await supabase
          .from("kontakte")
          .select("vorname, nachname, email, zustaendig_id, meta")
          .eq("id", invRow?.kunde_id)
          .maybeSingle();
        const kundeName = kontakt ? `${kontakt.vorname} ${kontakt.nachname}` : "Kunde";
        const kundeLinkPath = `/kunden/${invRow?.kunde_id}`;
        const empfaenger: string[] = [];
        if (kontakt?.zustaendig_id) empfaenger.push(kontakt.zustaendig_id);
        const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "inhaber"]);
        (admins || []).forEach((a: any) => empfaenger.push(a.user_id));
        for (const uid of Array.from(new Set(empfaenger))) {
          await supabase.from("benachrichtigungen").insert({
            benutzer_id: uid,
            titel: "Notartermin bestätigt",
            nachricht: `${kundeName} hat den Notartermin am ${v.datum}${v.uhrzeit ? ` um ${v.uhrzeit} Uhr` : ""} bestätigt.`,
            link: kundeLinkPath,
          });
        }

        // 4) E-Mail an zuständigen VP und ans Büro. Das Büro bekommt sie auch,
        //    wenn kein Partner zuständig ist. Wer was bekommt, steht in
        //    src/lib/notarterminMail.ts.
        const kundeEmail = kontakt?.email
          || (kontakt?.meta as any)?.portalEmail
          || (kontakt?.meta as any)?.email;
        let vpName = "";
        let vpEmail: string | undefined;
        if (kontakt?.zustaendig_id) {
          try {
            const { data: vpProfileRaw } = await supabase
              .from("profiles_public" as any)
              .select("name, email")
              .eq("id", kontakt.zustaendig_id)
              .maybeSingle();
            const vpProfile = vpProfileRaw as any;
            vpName = vpProfile?.name || "";
            vpEmail = vpProfile?.email || undefined;
          } catch { /* ohne Partnerprofil bekommt nur das Büro die Meldung */ }
        }
        try {
          await notarterminBestaetigungIntern({
            investmentId,
            kundeName,
            kundeEmail,
            datum: v.datum,
            uhrzeit: v.uhrzeit || "",
            vpName,
            vpEmail,
            kundeLink: oeffentlicheAdresse(kundeLinkPath),
          });
        } catch { /* silent */ }

        // 5) Bestätigungsmail an den Kunden mit allen Termindaten
        try {
          if (kundeEmail) {
            const nd = invMeta.notarData || {};
            await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "notartermin-bestaetigung-kunde",
                recipientEmail: kundeEmail,
                idempotencyKey: `notartermin-bestaetigung-kunde-${investmentId}-${v.datum}-${v.uhrzeit || "x"}`,
                // Die Kundensprache aus dem Profil, ermittelt auf dem Server.
                ...(invRow?.kunde_id ? { kontaktId: invRow.kunde_id } : {}),
                templateData: {
                  kundeName,
                  datum: v.datum,
                  uhrzeit: v.uhrzeit || "",
                  notarName: nd.name || invMeta.notarName || "",
                  notarAdresse: nd.adresse || invMeta.notarAdresse || "",
                  verkaeufer: nd.verkaeufer || invMeta.notarVerkaeufer || "",
                  vertretung: nd.vertretung || invMeta.notarVerkaeufervertretung || "",
                  objekt: invMeta.objekt || "",
                  wohnung: invMeta.wohnung || "",
                  beraterName: vpName,
                  // Partner aus dem Kontakt, nicht aus dem JWT: hier loest der
                  // KUNDE die Mail aus und stuende sonst als sein eigener
                  // Ansprechpartner darunter.
                  ...(kontakt?.zustaendig_id ? { beraterUserId: kontakt.zustaendig_id } : {}),
                },
              },
            });
          }
        } catch { /* silent */ }
      } catch { /* silent */ }

      toast.success(
        v.uhrzeit
          ? t("portal.cards.notar.toast_confirmed_time", { date: fmtDatum(v.datum), time: v.uhrzeit })
          : t("portal.cards.notar.toast_confirmed", { date: fmtDatum(v.datum) })
      );
      onConfirmed?.();
    } catch (e: any) {
      toast.error(t("portal.cards.notar.toast_error") + (e.message || ""));
    } finally {
      setPending(null);
    }
  };

  if (bestaetigt) {
    const nd = invMeta.notarData || {};
    const notarName = nd.name || invMeta.notarName;
    const notarAdresse = nd.adresse || invMeta.notarAdresse;
    const verkaeufer = nd.verkaeufer || invMeta.notarVerkaeufer;
    const vertretung = nd.vertretung || invMeta.notarVerkaeufervertretung;
    const hatStammdaten = !!(notarName || notarAdresse || verkaeufer || vertretung);
    return (
      <Card className="p-5 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm mb-1">{t("portal.cards.notar.confirmed_title")}</h3>
            <p className="text-xs text-muted-foreground">
              <Trans
                i18nKey={bestaetigt.uhrzeit ? "portal.cards.notar.confirmed_text_time" : "portal.cards.notar.confirmed_text"}
                values={{ date: fmtDatum(bestaetigt.datum), time: bestaetigt.uhrzeit }}
                components={{ strong: <strong className="text-foreground" /> }}
              />{" "}
              {t("portal.cards.notar.confirmed_follow")}
            </p>
            {hatStammdaten && (
              <div className="mt-3 grid grid-cols-2 gap-3 p-3 rounded-md bg-card/60 border border-[hsl(var(--success))]/20">
                {notarName && <div><span className="block text-muted-foreground text-xs">{t("portal.cards.notar.notar")}</span><p className="font-medium text-xs">{notarName}</p></div>}
                {notarAdresse && <div><span className="block text-muted-foreground text-xs">{t("portal.cards.notar.address")}</span><p className="font-medium text-xs">{notarAdresse}</p></div>}
                {verkaeufer && <div><span className="block text-muted-foreground text-xs">{t("portal.cards.notar.seller")}</span><p className="font-medium text-xs">{verkaeufer}</p></div>}
                {vertretung && <div className="col-span-2"><span className="block text-muted-foreground text-xs">{t("portal.cards.notar.seller_rep")}</span><p className="font-medium text-xs">{vertretung}</p></div>}
              </div>
            )}
            <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
              <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-[11px] text-foreground leading-relaxed">
                <strong>{t("portal.cards.notar.punctual_title")}</strong>{t("portal.cards.notar.punctual_text")}
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-sm">{t("portal.cards.notar.select_title")}</h3>
            <Badge className="bg-primary/10 text-primary text-xs border-0">{t("portal.cards.notar.action_required")}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {vorschlaege.length === 1
              ? t("portal.cards.notar.one_proposal")
              : t("portal.cards.notar.many_proposals", { count: vorschlaege.length })}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {vorschlaege.map((v, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">{v.datum ? fmtDatum(v.datum) : t("portal.cards.notar.date_open")}</p>
                {v.uhrzeit && <p className="text-xs text-muted-foreground">{t("portal.cards.notar.time_oclock", { time: v.uhrzeit })}</p>}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleConfirm(v, idx)}
              disabled={pending !== null}
            >
              {pending === `${idx}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("portal.cards.notar.confirm")}
            </Button>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">{t("portal.cards.notar.footer")}</p>
    </Card>
  );
}
