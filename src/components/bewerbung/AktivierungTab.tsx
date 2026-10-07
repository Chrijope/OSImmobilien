import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  UserPlus, CheckCircle2, Mail, AlertTriangle, Loader2, CheckCircle,
  ExternalLink, FileText, CalendarDays, Send,
  QrCode,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  updateBewerber, changeBewerberStatus, addNotification,
  type Bewerber,
} from "@/lib/bewerbungStore";
import { getLizenzPaket, OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import {
  DEFAULT_ONBOARDING, ACADEMY_PFLICHT, PAKET_KARRIERE_MAP,
} from "@/lib/aktivierungsCheckliste";
import { KARRIERE_STUFEN } from "@/lib/karriereStufeHelper";
import { ROLES } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import {
  AKTIVIERUNG_ONBOARDING_SCHRITTE, alleAktivPflichtenErfuellt,
  type OnboardingSchrittId,
} from "@/lib/aktivierungOnboardingSchritte";
import { OnboardingSchrittCard } from "./OnboardingSchrittCard";
import { AdminVorschauHinweis } from "./AdminVorschauHinweis";
import { hatLeadPaket, wartetAufLeadPaketZahlung } from "../../../supabase/functions/_shared/lead-paket";
import { MAIL_ANLEITUNG_NAME, MAIL_ANLEITUNG_PFAD } from "../../../supabase/functions/_shared/bewerber-zugangsdaten";
import { leadPaketNachBewerbung } from "@/components/leadpakete/leadPaketNachBewerbung";
import { Link } from "react-router-dom";
import { COMMUNITY_GRUPPEN } from "@/lib/communityGruppen";
import { Progress } from "@/components/ui/progress";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

interface Props {
  bewerber: Bewerber;
  canEdit: boolean;
  currentUserName: string;
  /** Kennung des angemeldeten Nutzers, neben dem Namen am Tippgeber gespeichert. */
  currentUserId?: string;
  onRefresh: () => void;
  /** Admin und Inhaber sehen den Inhalt auch vor bestätigter Zahlung. */
  adminVorschau?: boolean;
  /**
   * Nutzer anlegen und Zugangsdaten senden: nur Admin und Inhaber, nach
   * aktiver Rolle (Christian, 04.10.2026). HR führt den Bewerberweg, legt
   * aber keine Konten an. Der Server prüft dasselbe (invite-user,
   * send-bewerber-zugangsdaten).
   */
  darfNutzerAnlegen?: boolean;
}

/**
 * Buchungskalender für den Onboarding-Termin mit Christian Peetz. Bewusst
 * eine Konstante und kein Einstellungsfeld: Der Link ändert sich praktisch
 * nie, und ein Feld daneben liefe Gefahr, versehentlich geleert zu werden.
 * Zieht der Kalender um, wird diese Zeile geändert.
 */
const ONBOARDING_BUCHUNGSLINK = "https://fantastical.app/Christian-Peetz/Onboarding";

/**
 * Aktivierungsablauf nach bezahlter Rechnung, in drei Blöcken:
 * 1. Onboarding-Termin buchen (Buchungslink + Datum/Uhrzeit am Bewerber)
 * 2. Persönliche E-Mail mitteilen (Postfach-Haken, Zugangsdaten-Mail samt
 *    Einrichtungsanleitung an die private Adresse)
 * 3. Freischalten (Nutzer, Investagon, Community). Zusammen mit dem
 *    Postfach-Haken aus Block 2 sind es drei Pflicht-Haken, danach
 *    automatisch Status "Aktiv".
 * Alles Weitere erledigt Christian Peetz im Onboarding-Termin (Zusatzliste).
 */
export function AktivierungTab({ bewerber: b, canEdit, currentUserName, currentUserId, onRefresh, adminVorschau = false, darfNutzerAnlegen = false }: Props) {
  const paket = getLizenzPaket(b.paketwahl);
  const istBezahlt = !!b.rechnungBezahltAm;
  // Dieselbe Regel wie beim Vertrag und bei der Rechnung, siehe
  // supabase/functions/_shared/lead-paket.ts.
  const mitLeadPaket = hatLeadPaket(b.leadPaket);
  /*
   * Wann die Aktivierung aufgeht.
   *
   * Bis zum 19.09.2026 war das allein die bezahlte Rechnung. Seitdem bleiben
   * Bewerber ohne Lead-Paket nach der Gegenzeichnung in der Stufe "Vertrag"
   * liegen, und genau dort soll HR den Onboarding-Termin buchen. Waere der
   * Reiter weiter an die Rechnung gekoppelt, kaeme niemand mehr an den Termin
   * heran, und die ganze Kette stuende still.
   *
   * Der vollstaendig unterschriebene Vertrag ist der richtige Schluessel: Er
   * heisst, dass beide Seiten unterschrieben haben. Die bezahlte Rechnung
   * bleibt zusaetzlich stehen, damit der Altbestand unveraendert weiterlaeuft.
   */
  const vertragVollstaendig = b.vertragStatus === "unterschrieben" || !!b.vertragSignedAt;
  const aktivierungOffen = istBezahlt || vertragVollstaendig;
  const istTippgeberPaket = !!paket?.istTippgeber;
  const istEingeladen = !!b.userInviteSentAt;
  const defaultKarriere = b.karriereStufe || (paket ? PAKET_KARRIERE_MAP[paket.id] : "");

  // Confirm + Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Prefilled form fields
  const [fVorname, setFVorname] = useState(b.vorname || "");
  const [fNachname, setFNachname] = useState(b.nachname || "");
  const [fEmail, setFEmail] = useState(b.email || "");
  const [fTelefon, setFTelefon] = useState(b.telefon || "");
  const [fKarriere, setFKarriere] = useState(defaultKarriere);
  const [fRollen, setFRollen] = useState<string[]>(istTippgeberPaket ? ["tippgeber"] : ["vertriebspartner"]);
  const [fTeamleader, setFTeamleader] = useState<string>("__none__");

  // Teamleader-Liste (aktive Backoffice-User)
  const [teamleader, setTeamleader] = useState<Array<{ id: string; name: string; rolle: string }>>([]);

  // ── Block 2: persönliche E-Mail + Passwort (Passwort wird NICHT gespeichert) ──
  const [persMail, setPersMail] = useState(b.persoenlicheEmail || "");
  const [passwort, setPasswort] = useState("");
  const [sendingZugangsdaten, setSendingZugangsdaten] = useState(false);
  useEffect(() => {
    setPersMail(b.persoenlicheEmail || "");
    setPasswort("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id]);

  useEffect(() => {
    if (!formOpen) return;
    (async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map<string, string[]>();
      (rolesRes.data || []).forEach((r: any) => {
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
        roleMap.get(r.user_id)!.push(r.role);
      });
      const leaderRoles = new Set(["inhaber", "admin", "vertriebsleiter", "manager"]);
      const list = (profilesRes.data || [])
        .filter((p: any) => (roleMap.get(p.id) || []).some((r) => leaderRoles.has(r)))
        .map((p: any) => ({
          id: p.id,
          name: p.name || "(ohne Name)",
          rolle: (roleMap.get(p.id) || [])[0] || "",
        }));
      setTeamleader(list);
    })();
  }, [formOpen]);

  const openForm = () => {
    if (!darfNutzerAnlegen) return;
    // Reset to prefilled values when opening
    setFVorname(b.vorname || "");
    setFNachname(b.nachname || "");
    setFEmail(b.email || "");
    setFTelefon(b.telefon || "");
    setFKarriere(defaultKarriere);
    setFRollen(istTippgeberPaket ? ["tippgeber"] : ["vertriebspartner"]);
    setFTeamleader("__none__");
    setFormOpen(true);
  };

  const toggleRolle = (id: string) =>
    setFRollen((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  const selectedKarriere = KARRIERE_STUFEN.find((k) => k.id === fKarriere);
  const needsKarriere = fRollen.includes("vertriebspartner");
  const canSubmit =
    !!fVorname && !!fNachname && !!fEmail && fRollen.length > 0 && (!needsKarriere || !!fKarriere);

  const handleInviteUser = async () => {
    if (!canSubmit) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const role = fRollen[0];
      // Für Tippgeber zuerst DB-Eintrag anlegen (analog Teampartner-Formular),
      // damit die invite-user Function die tippgeberId setzen kann.
      let tippgeberRowId: string | null = null;
      if (istTippgeberPaket) {
        const { data: insertedRow, error: tipErr } = await (supabase as any).from("tippgeber").insert({
          vorname: fVorname,
          nachname: fNachname,
          email: fEmail,
          telefon: fTelefon || null,
          // Die Kennung neben dem Namen. Ohne sie suchte die Datenbank den
          // Partner spaeter ueber den Namen, und der kann doppelt vorkommen.
          zugeordnet_id: currentUserId || null,
          zugeordnet_name: currentUserName || null,
          provisionstyp: b.tippgeberProvisionsModell || "euro",
          provisionswert: b.tippgeberProvisionsBetrag || "",
          notizen: `Aktiviert aus Bewerbermanagement (Bewerber ${b.id})`,
          benutzer_id: null,
        }).select("id").single();
        if (tipErr) throw tipErr;
        tippgeberRowId = insertedRow?.id || null;
      }
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: fEmail,
          name: `${fVorname} ${fNachname}`,
          vorname: fVorname,
          nachname: fNachname,
          telefon: fTelefon || undefined,
          role,
          roles: fRollen,
          // Immer die Stufen-Kennung uebergeben, nie den Titel: der Titel
          // "Vertriebspartner" kollidiert mit der Kennung der Lead-Partner-Stufe
          // und loeste frueher auf den falschen Satz auf.
          karriereStufe: needsKarriere && !istTippgeberPaket ? fKarriere : undefined,
          teamleaderId: fTeamleader !== "__none__" ? fTeamleader : undefined,
          moreId: undefined,
          tippgeberId: tippgeberRowId || undefined,
          // Vertragspaket Lead-Berater: automatisch die Anzeige-Variante
          // mitgeben. Rolle und Rechte bleiben vertriebspartner, nur der
          // Anzeigename (und die Weekly-Call-Zeit) unterscheiden sich.
          rollenVariante: paket?.id === "lead_berater" ? "lead_berater" : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newUserId = data?.userId || "";
      // Paket + Recruiter in user_settings hinterlegen
      // (für Junior-Override-Logik & spätere Provisionsabrechnung)
      if (newUserId && paket) {
        try {
          const parseSatz = (v?: string): number | null => {
            if (!v) return null;
            const n = parseFloat((v || "").replace(",", "."));
            return isFinite(n) && n > 0 ? n : null;
          };
          const iv = parseSatz(b.satzIndividuell);
          const lv = parseSatz(b.satzLead);
          const ev = parseSatz(b.satzEigen);
          // Vertragssatz des gewählten Lizenzpakets als Grundlage. Vorher
          // wurden die Custom-Sätze nur geschrieben, wenn im Closing
          // individuelle Sätze vereinbart waren; der Paketsatz landete sonst
          // nirgends. Das Paket kennt nur einen Satz, er gilt deshalb für
          // Lead- und Eigen-Kontakte gleichermassen. Das Tippgeber-Paket hat
          // keinen Provisionssatz (0), dann bleiben die Schlüssel leer.
          const paketSatz = paket.provisionssatz > 0 ? paket.provisionssatz : null;
          await supabase.rpc("merge_user_settings" as any, {
            _user_id: newUserId,
            _patch: {
              lizenz_paket: paket.id,
              karriere_override: fKarriere,
              geworben_von_user_id: b.geworbenVonUserId || null,
              geworben_von_name: b.geworbenVonName || null,
              bewerber_id: b.id,
              teamleader_id: fTeamleader !== "__none__" ? fTeamleader : null,
              // Individuell im Closing vereinbarte Sätze gehen vor dem Paketsatz
              custom_provision_rate: iv ?? paketSatz ?? undefined,
              custom_provision_rate_setter: iv ?? lv ?? paketSatz ?? undefined,
              custom_provision_rate_eigen: iv ?? ev ?? paketSatz ?? undefined,
            },
          });
        } catch (settingsErr) {
          console.warn("merge_user_settings failed", settingsErr);
        }
      }
      const gespeichert = updateBewerber(b.id, {
        userInviteSentAt: new Date().toISOString(),
        userAccountId: newUserId,
        karriereStufe: fKarriere,
        onboardingChecklist: DEFAULT_ONBOARDING,
        academyPflichtModule: paket ? ACADEMY_PFLICHT[paket.id] : [],
      });
      // Leadpaket: War die Zahlung schon bestaetigt, entsteht es jetzt mit
      // Freischaltungsdatum; die Datenbank prueft alles selbst.
      void leadPaketNachBewerbung(b.id, gespeichert).catch((e) => console.warn("Leadpaket aus Bewerbung", e));
      addNotification(b.id, {
        typ: "status",
        titel: "Willkommen bei OS Immobilien",
        nachricht: `Dein Account wurde angelegt. Bitte prüfe Dein E-Mail-Postfach (${fEmail}) und setze Dein Passwort.`,
      });
      toast({
        title: "Nutzer angelegt",
        description: `Einladung an ${fEmail} versendet. Der Partner ist nun unter Nutzerverwaltung sichtbar.`,
      });
      setFormOpen(false);
      onRefresh();
    } catch (e: any) {
      toast({ title: "Fehler beim Anlegen", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ───── Onboarding-Schritt Helpers ─────
  const onboardingState = b.aktivierungOnboarding || {};
  const isSchrittDone = (id: OnboardingSchrittId): boolean => {
    if (id === "nutzer_anlegen") return istEingeladen;
    return !!onboardingState[id]?.done;
  };
  const toggleSchritt = (id: OnboardingSchrittId, next: boolean) => {
    const prev = onboardingState[id] || { done: false };
    const nextEntry = next
      ? { done: true, doneAt: new Date().toISOString(), doneBy: currentUserName }
      : { ...prev, done: false };
    updateBewerber(b.id, {
      aktivierungOnboarding: { ...onboardingState, [id]: nextEntry },
    });
  };
  // Der Fortschritt zaehlt nur die drei Freischalt-Schritte. Alles Weitere
  // besprechen Christian Peetz und der Partner im Onboarding-Termin selbst,
  // dafuer gibt es hier bewusst keine Checkliste mehr.
  const PFLICHT_SCHRITTE: OnboardingSchrittId[] = ["email_postfach", "nutzer_anlegen", "investagon"];
  const totalSchritte = PFLICHT_SCHRITTE.length;
  const doneSchritte = PFLICHT_SCHRITTE.filter((id) =>
    id === "nutzer_anlegen" ? istEingeladen : isSchrittDone(id)).length;
  const progressPct = Math.round((doneSchritte / totalSchritte) * 100);

  const schritt = (id: OnboardingSchrittId) =>
    AKTIVIERUNG_ONBOARDING_SCHRITTE.find((s) => s.id === id)!;
  const onboardingProps = (id: OnboardingSchrittId) => ({
    schritt: schritt(id),
    done: isSchrittDone(id),
    doneAt: onboardingState[id]?.doneAt,
    doneBy: onboardingState[id]?.doneBy,
    canEdit,
    onToggle: (next: boolean) => toggleSchritt(id, next),
  });

  // ───── Aktiv-Automatik: drei Pflicht-Haken → Status "Aktiv" ─────
  const pflichtErfuellt = alleAktivPflichtenErfuellt({
    email_postfach: isSchrittDone("email_postfach"),
    nutzer_anlegen: istEingeladen,
    investagon: isSchrittDone("investagon"),
  });
  useEffect(() => {
    if (!canEdit || !aktivierungOffen) return;
    // Wer ein Lead-Paket gewaehlt und noch nicht bezahlt hat, wird nicht aktiv.
    // Die Freigabe des Reiters haengt jetzt am Vertrag, die Freischaltung
    // eines Partners darf aber keine offene Rechnung ueberholen.
    if (mitLeadPaket && !istBezahlt) return;
    if (!pflichtErfuellt) return;
    if (b.status === "Aktiv" || b.status === "Abgelehnt" || b.status === "KeinInteresse") return;
    updateBewerber(b.id, { aktivAm: b.aktivAm || new Date().toISOString() });
    changeBewerberStatus(b.id, "Aktiv");
    toast({
      title: "Partner freigeschaltet",
      description: "Alle drei Pflicht-Haken sind gesetzt, der Status steht jetzt auf Aktiv.",
    });
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pflichtErfuellt, b.status, b.id, canEdit, aktivierungOffen, mitLeadPaket, istBezahlt]);

  // ───── Block 1: Onboarding-Termin speichern ─────
  /*
   * Steht der Termin, ruecken wir den Bewerber auf "Nutzer anlegen".
   *
   * Vorher haing dieser Sprung an der bezahlten Rechnung, und das war die
   * falsche Bedingung: Eine bezahlte Rechnung sagt nichts darueber, ob jemand
   * schon eingearbeitet wird. Der gebuchte Onboarding-Termin sagt genau das.
   *
   * Es reicht nicht, dass eines der beiden Felder gefuellt ist. Ein Datum ohne
   * Uhrzeit ist kein Termin, sondern eine Absicht, und wer nur das Datum
   * eintraegt und dann die Seite verlaesst, soll den Bewerber nicht
   * weitergeschoben haben.
   *
   * Nur nach vorn: Wer schon weiter ist oder ausgeschieden, bleibt unberuehrt.
   * Und das Loeschen eines Termins holt niemanden zurueck, dafuer gibt es die
   * Stufenauswahl von Hand.
   *
   * Seit dem 23.09.2026 auch nicht aus "Rechnung", solange das Lead-Paket
   * offen ist: Aus "Rechnung" fuehrt nur die bestaetigte Zahlung heraus, und
   * nur dann geht die Folgemail an Christian. Schoebe der Termin vorher
   * weiter, liesse sich "Rechnung" per Termin ueberspringen, und die Mail
   * ueber die Zahlung kaeme nie.
   */
  const STUFE_NICHT_ZURUECK = ["Nutzer_anlegen", "Aktiv", "Abgelehnt", "KeinInteresse"];

  const handleOnboardingTermin = (patch: Partial<Pick<Bewerber, "onboardingTerminDatum" | "onboardingTerminUhrzeit">>) => {
    updateBewerber(b.id, patch);

    const datum = (patch.onboardingTerminDatum ?? b.onboardingTerminDatum ?? "").trim();
    const uhrzeit = (patch.onboardingTerminUhrzeit ?? b.onboardingTerminUhrzeit ?? "").trim();

    if (datum && uhrzeit && !STUFE_NICHT_ZURUECK.includes(b.status)) {
      if (wartetAufLeadPaketZahlung(b.leadPaket, b.status, istBezahlt)) {
        toast({
          title: "Onboarding-Termin gespeichert",
          description: "Der Bewerber bleibt in Rechnung, bis die Zahlung für das Lead-Paket bestätigt ist.",
        });
      } else {
        changeBewerberStatus(b.id, "Nutzer_anlegen");
        toast({
          title: "Onboarding-Termin steht",
          description: "Der Bewerber steht jetzt in der Stufe Nutzer anlegen.",
        });
      }
    }

    onRefresh();
  };

  // ───── Block 2: Zugangsdaten senden ─────
  const persMailGueltig = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(persMail.trim()) &&
    persMail.trim().toLowerCase().endsWith("@os-immobilien.com");
  const kannZugangsdatenSenden = !!b.email && persMailGueltig && !!passwort.trim() && !sendingZugangsdaten;

  const handleZugangsdatenSenden = async () => {
    if (!darfNutzerAnlegen || !kannZugangsdatenSenden) return;
    setSendingZugangsdaten(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-bewerber-zugangsdaten", {
        body: {
          empfaengerEmail: b.email,
          vorname: b.vorname || "",
          persoenlicheEmail: persMail.trim(),
          passwort,
          onboardingDatum: b.onboardingTerminDatum || undefined,
          onboardingUhrzeit: b.onboardingTerminUhrzeit || undefined,
        },
      });
      if (error) {
        // Bei Edge-Function-Fehlern steckt die eigentliche Meldung im Response-Body.
        const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
        let detail = "";
        try { detail = ctx && typeof ctx.text === "function" ? await ctx.text() : ""; } catch { /* egal */ }
        try { detail = JSON.parse(detail)?.error || detail; } catch { /* kein JSON */ }
        throw new Error(detail || error.message || "Versand fehlgeschlagen");
      }
      if (data?.error) throw new Error(data.error);
      // Zieladresse + Zeitstempel protokollieren, das Passwort bewusst nicht.
      updateBewerber(b.id, {
        persoenlicheEmail: persMail.trim().toLowerCase(),
        zugangsdatenGesendetAm: new Date().toISOString(),
        zugangsdatenGesendetAn: b.email,
      });
      setPasswort("");
      onRefresh();
      toast({
        title: "Zugangsdaten versendet",
        description: `Die Zugangsdaten für ${persMail.trim()} wurden an ${b.email} geschickt.`,
      });
    } catch (e) {
      const grund = e instanceof Error ? e.message : String(e);
      toast({ title: "Versand fehlgeschlagen", description: grund, variant: "destructive" });
    } finally {
      setSendingZugangsdaten(false);
    }
  };

  // ───── Voraussetzungen nicht erfüllt ─────
  if (!aktivierungOffen && !adminVorschau) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
        <h3 className="font-semibold mb-1">Vertrag noch nicht vollständig unterschrieben</h3>
        <p className="text-sm text-muted-foreground">
          Die Aktivierung startet, sobald beide Seiten unterschrieben haben. Danach kannst du hier
          den Onboarding-Termin buchen.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!aktivierungOffen && (
        <AdminVorschauHinweis grund="der Vertrag noch nicht vollständig unterschrieben ist" />
      )}

      {/* ── Fortschritt ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Onboarding-Fortschritt</div>
          <div className="text-xs text-muted-foreground">
            {doneSchritte} von {totalSchritte} Schritten erledigt
          </div>
        </div>
        <Progress value={progressPct} />
      </Card>

      {/* ── Block 1: Onboarding-Termin buchen ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-9 w-9 rounded-full flex items-center justify-center bg-blue-100 text-blue-700">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold">1. Onboarding-Termin buchen</h3>
              <span className="text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Aufgabe von HR
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Termin mit Christian Peetz über den Buchungskalender vereinbaren und hier eintragen.
              Danach ist der Teil von HR erledigt, alles Weitere führt Christian Peetz im Termin.
            </p>
          </div>
        </div>

        <div className="space-y-3 mt-3">
          <Button asChild className="w-full sm:w-auto">
            <a href={ONBOARDING_BUCHUNGSLINK} target="_blank" rel="noreferrer">
              <CalendarDays className="h-4 w-4 mr-2" />
              Buchungskalender öffnen
              <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-70" />
            </a>
          </Button>

          <label className="flex items-start gap-2 text-sm cursor-pointer select-none pt-1">
            <Checkbox
              checked={!!b.onboardingTerminGebucht}
              onCheckedChange={(v) => {
                updateBewerber(b.id, { onboardingTerminGebucht: Boolean(v) });
                onRefresh();
              }}
              disabled={!canEdit}
              className="mt-0.5"
            />
            <span>
              Termin über den Buchungskalender eingebucht
              <span className="block text-[11px] text-muted-foreground">
                Nur dann steht er auch im Kalender von Christian Peetz.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Onboarding-Termin Datum</Label>
              <Input
                type="date"
                className="mt-1 h-9 text-sm"
                value={(b.onboardingTerminDatum || "").match(/^\d{4}-\d{2}-\d{2}$/)
                  ? (b.onboardingTerminDatum || "")
                  : (b.onboardingTerminDatum || "").includes(".")
                    ? (b.onboardingTerminDatum || "").split(".").reverse().join("-")
                    : ""}
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split("-");
                  handleOnboardingTermin({ onboardingTerminDatum: d && m && y ? `${d}.${m}.${y}` : "" });
                }}
                disabled={!canEdit}
              />
              {b.onboardingTerminDatum && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{b.onboardingTerminDatum}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Uhrzeit</Label>
              <Input
                type="time"
                className="mt-1 h-9 text-sm"
                value={b.onboardingTerminUhrzeit || ""}
                onChange={(e) => handleOnboardingTermin({ onboardingTerminUhrzeit: e.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Der Termin erscheint in der Zugangsdaten-Mail (Block 2) und in der Terminliste der Übersichtsseite.
          </p>
          {b.onboardingTerminDatum && !b.onboardingTerminGebucht && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              Termin eingetragen, aber noch nicht als eingebucht bestätigt.
            </p>
          )}
        </div>
      </Card>

      {/* Ab hier uebernimmt Christian Peetz im Onboarding-Termin. */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-border" />
        <p className="text-center text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground sm:whitespace-nowrap">
          Ab hier im Onboarding-Termin mit Christian Peetz
        </p>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Die Karte zur monatlichen Partnergebühr stand bis zum 06.09.2026 hier.
          Seither gibt es kein laufendes Entgelt, also auch nichts abzubuchen. */}

      {/* ── Block 2: Persönliche E-Mail mitteilen ── */}
      <Card className="p-5">
          <div className="flex flex-col items-start gap-3 mb-1 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center ${b.zugangsdatenGesendetAm ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
              {b.zugangsdatenGesendetAm ? <CheckCircle2 className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-bold">2. Persönliche E-Mail mitteilen</h3>
              <p className="text-xs text-muted-foreground">
                Neue @os-immobilien.com-Adresse anlegen und die Zugangsdaten samt Einrichtungsanleitung an die private Adresse schicken.
              </p>
            </div>
          </div>
          {b.zugangsdatenGesendetAm && (
            /* Der Text traegt eine Mailadresse. Ohne Umbruch stand er auf dem
               Handy ueber den Kartenrand hinaus. */
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 break-all whitespace-normal text-left sm:whitespace-nowrap">
              Gesendet am {new Date(b.zugangsdatenGesendetAm).toLocaleDateString("de-DE")}
              {b.zugangsdatenGesendetAn ? ` an ${b.zugangsdatenGesendetAn}` : ""}
            </Badge>
          )}
        </div>

        <div className="space-y-3 mt-3">
          {/* Bis Oktober 2026 eine eigene Karte unter "Freischalten". Gespeichert
              wird weiter unter email_postfach, alte Haken bleiben gesetzt. */}
          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={isSchrittDone("email_postfach")}
              onCheckedChange={(v) => toggleSchritt("email_postfach", !!v)}
              disabled={!canEdit}
              className="mt-0.5"
            />
            <span>
              Postfach bei one.com angelegt
              <span className="block text-[11px] text-muted-foreground">
                Pflicht-Haken für die Freischaltung. Auf diese Adresse geht die CRM-Einladung.
                {isSchrittDone("email_postfach") && onboardingState.email_postfach?.doneAt
                  ? ` Erledigt am ${new Date(onboardingState.email_postfach.doneAt).toLocaleDateString("de-DE")}${onboardingState.email_postfach.doneBy ? ` von ${onboardingState.email_postfach.doneBy}` : ""}.`
                  : ""}
              </span>
            </span>
          </label>

          {!b.email && (
            <p className="text-xs text-destructive">
              Im Bewerberprofil ist keine private E-Mail-Adresse hinterlegt. Bitte zuerst in der Übersicht eintragen.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Persönliche E-Mail-Adresse (Pflicht)</Label>
              <Input
                className="mt-1 h-9 text-sm"
                value={persMail}
                onChange={(e) => setPersMail(e.target.value)}
                placeholder="v.nachname@os-immobilien.com"
                disabled={!canEdit}
              />
              {persMail.trim() !== "" && !persMailGueltig && (
                <p className="text-[10px] text-destructive mt-0.5">Die Adresse muss auf @os-immobilien.com enden.</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Passwort (Pflicht)</Label>
              <Input
                className="mt-1 h-9 text-sm"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                placeholder="Start-Passwort aus dem Mailkonto"
                disabled={!canEdit}
                autoComplete="off"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Wird nur für den Versand verwendet und nicht gespeichert.
              </p>
            </div>
          </div>
          {canEdit && !darfNutzerAnlegen && (
            <p className="text-xs text-muted-foreground">Die Zugangsdaten senden Admin und Inhaber.</p>
          )}
          {canEdit && darfNutzerAnlegen && (
            <Button size="sm" onClick={handleZugangsdatenSenden} disabled={!kannZugangsdatenSenden}>
              {sendingZugangsdaten
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Send className="h-4 w-4 mr-2" />}
              {b.zugangsdatenGesendetAm ? "Zugangsdaten erneut senden" : "Zugangsdaten senden"}
            </Button>
          )}
          <div className="flex flex-col items-start gap-2 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Wird mitgeschickt: <span className="font-medium">{MAIL_ANLEITUNG_NAME}</span>
              </span>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={MAIL_ANLEITUNG_PFAD} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Vorschau öffnen
              </a>
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Die Mail geht an die private Adresse{b.email ? ` (${b.email})` : ""} und enthält Adresse, Passwort,
            die Postfach-Einrichtung (IMAP/SMTP), den Link zur Anleitung und den Onboarding-Termin aus Block 1.
            Die Anleitung öffnet sich ohne Anmeldung im CRM.
          </p>
        </div>
      </Card>

      {/* ── Block 3: Freischalten ── */}
      <div className="space-y-4">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold">3. Freischalten</h3>
            <p className="text-xs text-muted-foreground">
              Zwei Pflicht-Haken hier, dazu der Postfach-Haken aus Block 2. Sind alle drei gesetzt, wird
              der Status automatisch auf Aktiv gestellt.
            </p>
          </div>
          {b.aktivAm && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 whitespace-nowrap">
              Aktiv seit {new Date(b.aktivAm).toLocaleDateString("de-DE")}
            </Badge>
          )}
        </div>

        {/* Pflicht 2: CRM-Zugang freigeschaltet (bestehende Invite-Logik) */}
        <Card className="p-5">
          <div className="flex flex-col items-start gap-3 mb-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center ${istEingeladen ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                {istEingeladen ? <CheckCircle2 className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="font-bold">{schritt("nutzer_anlegen").nummer}. {schritt("nutzer_anlegen").titel}</h3>
                <p className="text-xs text-muted-foreground">
                  Nutzer-Maske öffnen, Daten prüfen und Einladung manuell versenden
                </p>
              </div>
            </div>
            {istEingeladen && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Eingeladen am {new Date(b.userInviteSentAt).toLocaleDateString("de-DE")}
              </Badge>
            )}
          </div>

          {!istEingeladen ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Beim Klick öffnet sich die Nutzer-anlegen-Maske (vorausgefüllt
                aus der Bewerbung). Karrierestufe, Rollen und ggf. Teamleiter
                wählst Du dort – die Einladung wird erst nach Deiner Bestätigung
                im Formular versendet.
              </p>
              {darfNutzerAnlegen ? (
                <Button onClick={openForm} disabled={!canEdit || !paket} className="w-full sm:w-auto">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Nutzer-Maske öffnen
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Den Nutzer legen Admin und Inhaber an.</p>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Account-ID: <span className="font-mono text-xs">{b.userAccountId || "—"}</span>
            </div>
          )}
        </Card>

        {/* Pflicht 3: Investagon freigeschaltet, ebenfalls durch Christian Peetz */}
        <OnboardingSchrittCard {...onboardingProps("investagon")}>
          <div className="space-y-3">
            <Button variant="outline" size="sm" asChild>
              <a href="https://investagon.com" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                investagon.com öffnen
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Die Investagon-Zugangsdaten werden persönlich übergeben und nicht im CRM hinterlegt.
              Die Einladung wartet nach der Freischaltung im neuen @os-immobilien.com-Postfach des Partners.
            </p>
          </div>
        </OnboardingSchrittCard>

        {/* Schritt 4: WhatsApp-Community, kein Pflicht-Haken fuer die Aktiv-Automatik */}
        <OnboardingSchrittCard {...onboardingProps("community_channel")}>
          <div className="space-y-3">
            <Button variant="outline" size="sm" asChild>
              <Link
                to={`/unterlagen/whatsapp-community?backTo=${encodeURIComponent(
                  `/bewerberprozess?openBewerber=${b.id}&detailTab=aktivierung`
                )}&backLabel=Zurück+zur+Aktivierung`}
              >
                <QrCode className="h-4 w-4 mr-2" />
                QR-Code anzeigen
              </Link>
            </Button>

            <div className="max-w-xs">
              <Label className="text-xs">Nutzerrolle des Partners</Label>
              <Select
                value={b.communityRolle || ""}
                onValueChange={(v) => updateBewerber(b.id, { communityRolle: v })}
                disabled={!canEdit}
              >
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Rolle wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r.id !== "testaccount").map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {b.communityRolle && (
              COMMUNITY_GRUPPEN[b.communityRolle as keyof typeof COMMUNITY_GRUPPEN] ? (
                <div>
                  <p className="text-xs font-semibold mb-1.5">
                    Spickzettel: diesen Gruppen hinzufügen
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMUNITY_GRUPPEN[b.communityRolle as keyof typeof COMMUNITY_GRUPPEN]!.map((g) => (
                      <Badge key={g} variant="outline" className="font-normal">{g}</Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Für diese Rolle sind noch keine Community-Gruppen hinterlegt.
                </p>
              )
            )}

            <p className="text-[10px] text-muted-foreground">
              Der Partner tritt über den QR-Code der Community bei, die Untergruppen
              ordnest Du ihm in WhatsApp direkt zu.
            </p>
          </div>
        </OnboardingSchrittCard>

        {pflichtErfuellt && (
          <Card className="p-4 border-green-300 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="text-sm text-green-800 dark:text-green-300">
                Alle drei Pflicht-Haken sind gesetzt. Der Bewerberstatus steht auf Aktiv
                {b.aktivAm ? ` (seit ${new Date(b.aktivAm).toLocaleDateString("de-DE")})` : ""}.
              </div>
            </div>
          </Card>
        )}
      </div>


      {/* ── Nutzer-anlegen-Formular ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Neuen Nutzer einladen
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Daten aus der Bewerbung sind vorausgefüllt. Bitte Karrierestufe und
              ggf. Teamleiter ergänzen.
            </p>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label>Vorname *</Label><Input value={fVorname} onChange={(e) => setFVorname(e.target.value)} /></div>
              <div><Label>Nachname *</Label><Input value={fNachname} onChange={(e) => setFNachname(e.target.value)} /></div>
            </div>

            <div>
              <Label>E-Mail-Adresse *</Label>
              <Input value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Diese E-Mail wird als Login für das Backoffice verwendet.</p>
            </div>

            <div>
              <Label>Telefonnummer (optional)</Label>
              <PhoneInput value={fTelefon} onChange={(v) => setFTelefon(v)} />
            </div>

            {needsKarriere && (
              <div>
                <Label>Karrierestufe *</Label>
                <Select value={fKarriere} onValueChange={setFKarriere}>
                  <SelectTrigger><SelectValue placeholder="Stufe wählen..." /></SelectTrigger>
                  <SelectContent>
                    {/* Neuvergabe: nur die einheitliche 4-%-Stufe. Ist aus einem
                        Bestandspaket eine alte Stufe vorbelegt, bleibt sie als
                        Eintrag stehen, damit der Wert anzeigbar bleibt. */}
                    {KARRIERE_STUFEN.filter((k) => !k.nurBestand || k.id === fKarriere).map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.emoji} {k.titel} ({k.rate} %)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedKarriere && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Vorausgewählt aus Paket „{paket?.id}".
                  </p>
                )}
              </div>
            )}

            {(fRollen.includes("vertriebspartner") || fRollen.includes("tippgeber")) && (
              <div>
                <Label>Teamleiter (optional)</Label>
                <Select value={fTeamleader} onValueChange={setFTeamleader}>
                  <SelectTrigger><SelectValue placeholder="Teamleiter wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Kein Teamleiter</SelectItem>
                    {teamleader.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} – {t.rolle}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {OVERHEAD_AKTIV
                    ? "Der Teamleiter erhält Team-Overhead auf Abschlüsse dieses Nutzers."
                    : "Der Teamleiter sieht diesen Nutzer in seinen Team-Auswertungen."}
                </p>
              </div>
            )}

            <div>
              <Label>Rollen zuweisen * (Mehrfachauswahl möglich)</Label>
              <div className="space-y-2 mt-2 bg-card border rounded-lg p-3 max-h-56 overflow-y-auto">
                {ROLES.filter((r) => r.id !== "bewerber").map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Checkbox checked={fRollen.includes(r.id)} onCheckedChange={() => toggleRolle(r.id)} />
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="text-sm">{r.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {fRollen.length} Rolle(n) ausgewählt. Die erste Rolle wird als Hauptrolle verwendet.
              </p>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="font-semibold text-sm mb-2 flex items-center gap-1">📧 Ablauf nach der Einladung:</p>
              <ol className="text-xs space-y-1 list-decimal pl-4 text-muted-foreground">
                <li>Nutzer erhält eine Einladungs-E-Mail an die angegebene Adresse</li>
                <li>Nutzer klickt den Bestätigungslink und verifiziert seine E-Mail</li>
                <li>Nutzer setzt sein eigenes Passwort</li>
                <li>Nutzer wird zu den Einstellungen weitergeleitet</li>
                <li>Profil, Gewerbedaten, Steuer & Bank ausfüllen</li>
                <li>Pflichtunterlagen hochladen (PDF)</li>
                <li>Backoffice prüft und gibt Unterlagen frei (Ampelsystem)</li>
                <li>Nach Freigabe: Voller Backoffice-Zugang</li>
              </ol>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Abbrechen</Button>
              <Button onClick={handleInviteUser} disabled={!canSubmit || busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                {busy ? "Wird eingeladen..." : "Nutzer einladen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
