/**
 * Die drei Abschlusswege des Erstgesprächs, einmal für den Reiter
 * Erstgespräch und die Moderationsansicht:
 *
 *   - abschliessen: KI-Zusammenfassung über Teil 1 (und Teil 2, wenn der
 *     Direktweg lief), Skript als geführt markieren, Closing-Termin samt
 *     Berater speichern, Status auf Closing, sobald ein Termin steht.
 *   - followUpSetzen: Empfehlung B, Wiedervorlage, Status Follow-Up.
 *   - ablehnen: Kein Interesse oder Absage mit Grund, optional die
 *     wertschätzende Absage-Mail.
 *
 * EINE Logik: Wer hier etwas ändert, ändert es für beide Oberflächen. Die
 * Dialoge und Knöpfe bleiben in den Oberflächen, die Wirkung liegt hier.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  updateBewerber, changeBewerberStatus,
  type Bewerber, type BewerberStatus, type ErstgespraechSkript,
} from "@/lib/bewerbungStore";
import { sendeBewerberAbsageMail } from "@/lib/bewerberAbsageMail";
import { getPfadDef } from "@/lib/assessmentSkript";
import { baueClosingDirektKiDaten } from "@/lib/closingDirektSkript";
import type { useErstgespraechSkript } from "./useErstgespraechSkript";

export type ErstgespraechStand = ReturnType<typeof useErstgespraechSkript>;
export type AbsageModus = "kein_interesse" | "abgelehnt";

/**
 * Die Mailadresse der HR-Managerin aus ihrem Profil. Sie wird beim
 * Closing-Termin als Absenderangabe der Erinnerungsmails mitgespeichert.
 */
export function useBeraterEmail(authUserId: string | undefined): string {
  const [beraterEmail, setBeraterEmail] = useState("");
  useEffect(() => {
    if (!authUserId) return;
    supabase.from("profiles").select("email").eq("id", authUserId).maybeSingle()
      .then(({ data }) => {
        const profil = data as { email?: string } | null;
        if (profil?.email) setBeraterEmail(profil.email);
      });
  }, [authUserId]);
  return beraterEmail;
}

export function useErstgespraechAbschluss({
  bewerber, beraterName, beraterEmail, stand, onRefresh,
}: {
  bewerber: Bewerber;
  beraterName: string;
  beraterEmail: string;
  stand: ErstgespraechStand;
  onRefresh: () => void;
}) {
  const {
    skript, setSkript, assessment,
    closingDatum, closingUhrzeit,
    closingDirekt, closingDirektAn,
    syncFelder, loescheDraft,
  } = stand;

  // ─── KI-Zusammenfassung (gleiche Edge Function wie bisher) ───
  // Lief Teil 2 (Closing direkt), fließen dessen Inhalte mit in die
  // Zusammenfassung. Bei ausgeschaltetem Schalter bleibt der Body exakt
  // wie bisher, damit sich am bestehenden Verhalten nichts ändert.
  const baueKiBody = (extra: Record<string, unknown> = {}) => {
    const pfadLabels = (assessment.pfade ?? []).map((p) => getPfadDef(p).label).join(", ");
    const budgetTeile: string[] = [];
    // Systemgebuehr und Lead-Kauf stehen seit der Straffung nicht mehr im
    // Skript, Konditionen klaert erst das Kooperationsgespraech. Die alten
    // Felder bleiben nur fuer Bestandsdaten im Typ und gehen hier nicht mehr
    // in die Zusammenfassung ein.
    if (assessment.konditionenReaktion) budgetTeile.push(`Reaktion Konditionen: ${assessment.konditionenReaktion}`);
    const sync = syncFelder();
    return {
      vorname: bewerber.vorname,
      nachname: bewerber.nachname,
      ausgangslage: assessment.branche || skript.ausgangslage || pfadLabels,
      ausgangslageNotiz: assessment.ersteindruck || skript.ausgangslageNotiz,
      beschaeftigungsart: sync.beschaeftigungsart,
      ziele: sync.ziele,
      motivation: sync.motivation,
      erfahrung: pfadLabels || bewerber.erfahrung,
      vorErfahrung: assessment.werdegang || skript.vorErfahrung || bewerber.vertriebserfahrung || "",
      vorteileNotiz: assessment.vorstellungNotiz,
      budget: budgetTeile.join(" · ") || skript.budget,
      einwand: assessment.einwandNotiz,
      bewertung: sync.bewertung,
      antwortenJson: JSON.stringify(assessment),
      ...(closingDirektAn
        ? {
            closingDirekt: true,
            closingJson: JSON.stringify(baueClosingDirektKiDaten(closingDirekt, {
              closingEntscheidung: bewerber.closingEntscheidung,
              paketwahl: bewerber.paketwahl,
              zahlungsweise: bewerber.zahlungsweise,
              andereVertriebe: bewerber.andereVertriebe,
            })),
          }
        : {}),
      ...extra,
    };
  };

  const erzeugeZusammenfassung = async (extra: Record<string, unknown> = {}): Promise<Partial<ErstgespraechSkript>> => {
    try {
      const { data, error } = await supabase.functions.invoke("erstgespraech-zusammenfassung", {
        body: baueKiBody(extra),
      });
      const summary = (data as { summary?: string } | null)?.summary;
      if (!error && summary) {
        return { zusammenfassung: summary, zusammenfassungAm: new Date().toISOString() };
      }
    } catch (e) {
      console.warn("KI-Zusammenfassung konnte nicht erzeugt werden", e);
    }
    return {};
  };

  const basisPayload = (): ErstgespraechSkript => ({
    ...skript,
    ausgangslage: skript.ausgangslage || "",
    ziele: syncFelder().ziele,
    motivation: syncFelder().motivation,
    vorErfahrung: skript.vorErfahrung || bewerber.erfahrung,
    durchgefuehrtAm: skript.durchgefuehrtAm || new Date().toISOString(),
    durchgefuehrtVon: skript.durchgefuehrtVon || beraterName,
  });

  const abschliessen = async () => {
    const payload: ErstgespraechSkript = {
      ...basisPayload(),
      ...(await erzeugeZusammenfassung({
        closingTerminDatum: closingDatum,
        closingTerminUhrzeit: closingUhrzeit,
      })),
    };

    // Der Berater wird für die Erinnerungsmails (48h/6h/1h) mitgespeichert, sobald
    // ein Closing-Termin steht. Bewusst über `updateBewerber` und nicht über ein
    // eigenes Supabase-Update: Letzteres würde das meta-Objekt und damit den
    // gesamten übrigen Bewerberdatensatz ersetzen.
    const terminSteht = !!(closingDatum && closingUhrzeit);
    // Nur bei einem tatsächlich neuen Termin werden die Erinnerungen zurückgesetzt,
    // damit sie für den verschobenen Termin erneut greifen.
    const terminNeu = terminSteht
      && (closingDatum !== bewerber.closingTerminDatum || closingUhrzeit !== bewerber.closingTerminUhrzeit);
    updateBewerber(bewerber.id, {
      erstgespraechSkript: payload,
      ...syncFelder(),
      closingTerminDatum: closingDatum, closingTerminUhrzeit: closingUhrzeit,
      ...(terminSteht ? { closingBeraterName: beraterName, closingBeraterEmail: beraterEmail } : {}),
      ...(terminNeu ? { closingRemindersSent: [] } : {}),
    });
    if (terminSteht && (bewerber.status === "Eingang" || bewerber.status === "Erstgespraech")) {
      changeBewerberStatus(bewerber.id, "Closing");
    }

    setSkript(payload);
    onRefresh();
    toast({
      title: closingDatum ? "Erstgespräch abgeschlossen – Closing geplant" : "Erstgespräch gespeichert",
      description: closingDatum ? `Closing am ${closingDatum} um ${closingUhrzeit} Uhr` : undefined,
    });
    loescheDraft();
  };

  // ─── Empfehlung B: Follow-Up-Termin setzen ───
  const followUpSetzen = async (datum: string, uhrzeit: string, notiz: string): Promise<boolean> => {
    if (!datum.trim()) {
      toast({ title: "Bitte Follow-Up-Datum angeben", variant: "destructive" });
      return false;
    }
    const payload: ErstgespraechSkript = {
      ...basisPayload(),
      ...(await erzeugeZusammenfassung({ followUp: true, followUpDatum: datum })),
    };
    updateBewerber(bewerber.id, {
      erstgespraechSkript: payload,
      ...syncFelder(),
      followUpDatum: datum,
      followUpUhrzeit: uhrzeit,
      followUpNotiz: notiz,
    });
    if (bewerber.status === "Eingang" || bewerber.status === "Erstgespraech") {
      changeBewerberStatus(bewerber.id, "FollowUp");
    }
    loescheDraft();
    setSkript(payload);
    onRefresh();
    toast({
      title: "Follow-Up geplant",
      description: `Wiedervorlage am ${datum}${uhrzeit ? ` um ${uhrzeit} Uhr` : ""}. Status: Follow-Up.`,
    });
    return true;
  };

  // ─── Kein Interesse / Abgelehnt ───
  const ablehnen = async (grund: string, modus: AbsageModus, mailSenden: boolean): Promise<boolean> => {
    if (!grund.trim()) {
      toast({ title: "Bitte Grund angeben", description: "Trag kurz ein, warum der Bewerber kein Interesse hat oder abgelehnt wird.", variant: "destructive" });
      return false;
    }

    const payload: ErstgespraechSkript = {
      ...basisPayload(),
      absageGrund: grund,
      abgelehntAm: new Date().toISOString(),
      abgelehntVon: beraterName,
      ...(await erzeugeZusammenfassung({ abgelehnt: true, absageGrund: grund })),
    };

    updateBewerber(bewerber.id, {
      erstgespraechSkript: payload,
      ...syncFelder(),
    });

    const targetStatus: BewerberStatus = modus === "kein_interesse" ? "KeinInteresse" : "Abgelehnt";
    changeBewerberStatus(bewerber.id, targetStatus);

    // Wertschätzende Absage-Mail (optional, best-effort): der Statuswechsel
    // ist bereits erledigt und darf am Mailversand nicht scheitern.
    let mailHinweis = "Es wurde keine Mail an den Bewerber gesendet.";
    if (mailSenden) {
      const mail = await sendeBewerberAbsageMail(bewerber);
      mailHinweis = mail.ok
        ? `Die Absage-Mail wurde an ${bewerber.email} gesendet.`
        : `Die Absage-Mail konnte nicht gesendet werden (${mail.grund}).`;
    }

    loescheDraft();
    setSkript(payload);
    onRefresh();
    toast({
      title: modus === "kein_interesse"
        ? 'Bewerber als „Kein Interesse" markiert'
        : 'Bewerber als „Abgelehnt" markiert',
      description: `Status aktualisiert. ${mailHinweis}`,
    });
    return true;
  };

  return { erzeugeZusammenfassung, abschliessen, followUpSetzen, ablehnen };
}
