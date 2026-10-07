import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ExternalLink, ClipboardCheck, AlertTriangle, StickyNote, UserCheck, PhoneOff, PhoneForwarded, AlertCircle, XCircle, Calendar, Info, Mail } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { updateKontakt, mergeKontaktMeta, type KundeData } from "@/lib/kundenStore";
import { addAktivitaet, addGeteilteAufgabe } from "@/lib/aktivitaetenStore";
import { addFollowUp } from "@/lib/followUpStore";
import { useToast } from "@/hooks/use-toast";
import { loadBeraterUsers } from "@/lib/loadAllUsers";
import { useUser } from "@/contexts/UserContext";
import { ansprechpartnerAdresse } from "@/lib/ansprechpartnerAdresse";
import { nichtErreichtMailVerarbeiten } from "@/lib/nichtErreichtMails";
import { MAX_KONTAKTVERSUCHE, getVerstecktBisForVersuch, getWartezeitLabel } from "@/lib/kontaktversuchSchedule";
import { findeBeraterNachName, normalisiereBeraterName, type BeraterTreffer } from "@/lib/beraterNamensabgleich";
import { istTerminInZukunft, heuteIso, TERMIN_ZUKUNFT_MELDUNG, getEffectivePipelineStufe } from "@/lib/kontaktPipeline";
import { fortschrittsRang } from "@/lib/pipelineStufen";
import { lokalesDatum } from "@/lib/terminErgebnis";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";
import { FOLLOW_UP_GEPLANT } from "../../../supabase/functions/_shared/follow-up-eskalation.ts";

interface SetterSkriptProps {
  kunde: KundeData;
  onUpdate: () => void;
}

/**
 * Klartext dazu, was schiefging, wenn die Uebergabe nicht sauber durchlief.
 *
 * Bisher stand in beiden Faellen dieselbe Meldung. Sie sind aber verschieden
 * schwer: Eine fehlgeschlagene Benachrichtigung kostet einen Anruf, ein
 * fehlender Profiltreffer bedeutet, dass der Lead niemandem gehoert.
 */
function zuweisungsProblem(treffer: BeraterTreffer, name: string): string {
  if (treffer.art === "unbekannt") {
    return `Zu „${name}" gibt es kein Profil. Die Zuständigkeit konnte deshalb nicht gesetzt werden, bitte den Lead von Hand zuweisen.`;
  }
  if (treffer.art === "mehrdeutig") {
    return `Es gibt ${treffer.anzahl} Profile mit dem Namen „${name}". Die Zuordnung wäre geraten und wurde deshalb nicht gesetzt, bitte den Lead von Hand zuweisen.`;
  }
  return `${name} wurde nicht benachrichtigt, bitte selbst Bescheid geben.`;
}


// ── Skript steps ──
const SKRIPT_SCHRITTE = [
  {
    id: "begruessung",
    titel: "1. Begrüßung & Rapport",
    text: `„Hallo [Vorname], hier ist [dein Name] von MOREImmo. Du hast dich für unser Investment-Programm interessiert – das freut mich! Hast du gerade 5 Minuten Zeit?"`,
    tipp: "Tonlage: Freundlich, professionell, nicht zu formell. Spiegele die Energie des Gegenübers.",
  },
  {
    id: "situation",
    titel: "2. Aktuelle Situation erfassen",
    text: `„Bevor wir schauen, ob und wie wir dir helfen können – erzähl mir kurz: Was hat dich dazu bewogen, dich mit dem Thema Kapitalanlage zu beschäftigen?"`,
    tipp: "Lass den Interessenten reden. Notiere Schlüsselwörter. Die Motivation ist der Hebel für das Closing.",
    fragen: [
      { key: "qualZiel", label: "Was ist dein Ziel?", placeholder: "z.B. Altersvorsorge, Vermögensaufbau, Steuern sparen..." },
    ],
  },
  {
    id: "qualifikation",
    titel: "3. Qualifikation – Passt der Interessent?",
    text: `„Super, das klingt nach einem sehr sinnvollen Ansatz. Damit unser Experte im Beratungsgespräch direkt konkret werden kann, brauche ich noch ein paar kurze Infos von dir:"`,
    tipp: "Stelle die Fragen natürlich, nicht wie ein Verhör. Paraphrasiere die Antworten zur Bestätigung.",
    fragen: [
      { key: "qualEinkommen", label: "Wie viel Geld verdienst du monatlich?", placeholder: "z.B. 3.000-3.500€" },
      { key: "qualEigenkapital", label: "Wie viel Eigenkapital steht dir zur Verfügung?", placeholder: "z.B. über 20.000€" },
      { key: "qualBeruflicheSituation", label: "Was ist deine derzeitige berufliche Situation?", placeholder: "z.B. Angestellt, Selbstständig, Beamter..." },
    ],
  },
  {
    id: "pain",
    titel: "4. Schmerz vertiefen & Vision aufbauen",
    text: `„Wenn du in 10 Jahren zurückschaust und nichts an deiner finanziellen Situation verändert hast – wie würdest du dich fühlen? ... Und jetzt stell dir vor, du hättest heute den ersten Schritt gemacht, dein Geld arbeitet für dich, und du baust echtes Vermögen auf. Genau dabei helfen wir."`,
    tipp: "Erst den Schmerz spüren lassen, dann die Lösung anbieten. Nicht argumentieren – emotional abholen.",
  },
  {
    id: "ueberleitung",
    titel: "5. Überleitung zum Experten-Gespräch",
    text: `„[Vorname], ich bin ehrlich beeindruckt – du bringst genau die richtigen Voraussetzungen mit. Im nächsten Schritt setzt du dich mit unserem Investment-Experten zusammen. Er zeigt dir ganz konkret, welche Immobilie zu deiner Situation passt, wie die Finanzierung aussieht und wie du steuerlich profitierst. Das Gespräch ist unverbindlich und dauert ca. 30-45 Minuten. Wann passt es dir am besten?"`,
    tipp: "Gib dem Termin Wert – 'Normalerweise ist der Kalender voll, aber ich schaue, ob ich dir einen Platz sichern kann.'",
  },
  {
    id: "termin",
    titel: "6. Termin buchen & Abschluss",
    text: `„Perfekt, ich buche dir jetzt den Termin ein. Du bekommst eine Bestätigung per E-Mail. Bitte halte den Termin unbedingt ein – unser Experte bereitet sich individuell auf dein Gespräch vor."`,
    tipp: "Verknappung erzeugen. Den Termin als wertvolles Gut positionieren, nicht als Pflicht.",
  },
];

const CHECKLIST_ITEMS = [
  { id: "daten", label: "Kundendaten vervollständigt (Name, Telefon, E-Mail)", autoCheck: false },
  { id: "qualifikation", label: "Qualifizierungsfragen ausgefüllt", autoCheck: true },
  { id: "notizen", label: "Gesprächsnotizen hinterlegt", autoCheck: true },
  { id: "termin", label: "Erstgespräch mit Vertriebspartner vereinbart", autoCheck: false },
  { id: "verloren", label: "Lead verloren / abgeschlossen (Daten falsch, Kein Interesse)", autoCheck: false },
];

export function SetterSkript({ kunde, onUpdate }: SetterSkriptProps) {
  const { toast } = useToast();
  const { user, authUser } = useUser();
  const terminRef = useRef<HTMLDivElement>(null);
  const [antworten, setAntworten] = useState<Record<string, string>>({
    qualZiel: kunde.qualZiel || "",
    qualEinkommen: kunde.qualEinkommen || "",
    qualEigenkapital: kunde.qualEigenkapital || "",
    qualBeruflicheSituation: kunde.qualBeruflicheSituation || "",
  });
  const [notizen, setNotizen] = useState(kunde.setterSkriptNotizen || "");
  const [terminGebucht, setTerminGebucht] = useState(kunde.setterTerminGebucht || false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    let stored: Record<string, boolean> = {};
    if (isTestAccount()) {
      try { const raw = localStorage.getItem(`mi_setter_checklist_${kunde.id}`); stored = raw ? JSON.parse(raw) : {}; } catch { stored = {}; }
    } else {
      stored = getUserSetting<Record<string, Record<string, boolean>>>("setter_checklists", {})[kunde.id] || {};
    }
    // Retroaktiv: Wenn Kunde bereits verloren (Daten falsch / Kein Interesse), alle Punkte abhaken
    const isVerloren = kunde.status === "verloren" || kunde.pipelineStufe === "verloren";
    const verlorenGrund = kunde.verlorenGrund || "";
    // Katalog-IDs seit der Umstellung, die Textvarianten decken den Altbestand ab.
    const isRelevantVerloren = isVerloren && (
      verlorenGrund === "ne_daten_falsch" || verlorenGrund === "kb_kein_interesse" ||
      verlorenGrund.includes("falsch") || verlorenGrund.includes("Interesse")
    );
    if (isRelevantVerloren && !CHECKLIST_ITEMS.every(item => stored[item.id])) {
      const allChecked: Record<string, boolean> = {};
      CHECKLIST_ITEMS.forEach(item => { allChecked[item.id] = true; });
      // Persist
      if (isTestAccount()) {
        localStorage.setItem(`mi_setter_checklist_${kunde.id}`, JSON.stringify(allChecked));
      } else {
        const allChecklists = getUserSetting<Record<string, Record<string, boolean>>>("setter_checklists", {});
        allChecklists[kunde.id] = allChecked;
        setUserSetting("setter_checklists", allChecklists);
      }
      return allChecked;
    }
    return stored;
  });
  const [selectedCloser, setSelectedCloser] = useState(kunde.setterCloser || "");
  // Kennung zur Auswahl. Zwei Partner koennen gleich heissen, dann hilft nur sie.
  const [selectedCloserId, setSelectedCloserId] = useState<string | undefined>(kunde.setterCloserId || undefined);
  const istGewaehlt = (u: { id: string; name: string }) =>
    selectedCloserId ? selectedCloserId === u.id : selectedCloser === u.name;
  const [terminDatum, setTerminDatum] = useState(kunde.setterTerminDatum || "");
  const [terminUhrzeit, setTerminUhrzeit] = useState(kunde.setterTerminUhrzeit || "");

  const beraterUsers = useState(() => loadBeraterUsers())[0];

  const updateAntwort = (key: string, value: string) => {
    setAntworten(prev => ({ ...prev, [key]: value }));
  };

  const toggleChecklist = (id: string) => {
    setChecklist(prev => {
      const next = { ...prev, [id]: !prev[id] };
      persistChecklist(next);
      return next;
    });
  };

  const checkAllItems = () => {
    const next: Record<string, boolean> = {};
    CHECKLIST_ITEMS.forEach(item => { next[item.id] = true; });
    persistChecklist(next);
    setChecklist(next);
  };

  const persistChecklist = (data: Record<string, boolean>) => {
    if (isTestAccount()) {
      localStorage.setItem(`mi_setter_checklist_${kunde.id}`, JSON.stringify(data));
    } else {
      const allChecklists = getUserSetting<Record<string, Record<string, boolean>>>("setter_checklists", {});
      allChecklists[kunde.id] = data;
      setUserSetting("setter_checklists", allChecklists);
    }
  };

  const hasQualFilled = !!(antworten.qualZiel && antworten.qualEinkommen && antworten.qualEigenkapital && antworten.qualBeruflicheSituation);
  const hasNotizenFilled = notizen.trim().length > 0;
  const isItemChecked = (itemId: string) => {
    if (itemId === "qualifikation") return hasQualFilled;
    if (itemId === "notizen") return hasNotizenFilled;
    return !!checklist[itemId];
  };
  const allChecklistDone = CHECKLIST_ITEMS.every(item => isItemChecked(item.id));
  const missingItems = CHECKLIST_ITEMS.filter(item => !isItemChecked(item.id));

  const handleSave = () => {
    updateKontakt(kunde.id, {
      qualZiel: antworten.qualZiel,
      qualEinkommen: antworten.qualEinkommen,
      qualEigenkapital: antworten.qualEigenkapital,
      qualBeruflicheSituation: antworten.qualBeruflicheSituation,
      setterSkriptNotizen: notizen,
      setterTerminGebucht: terminGebucht,
      setterChecklisteDone: allChecklistDone,
      setterTerminDatum: terminDatum,
      setterTerminUhrzeit: terminUhrzeit,
    });
    onUpdate();
    toast({ title: "Daten gespeichert ✓" });
  };

  // ── Wartezeit-Staffelung siehe src/lib/kontaktversuchSchedule.ts ──
  // 1. → 4h, 2./3./4. → morgen 09:00, 5.–10. → 48h, 11.–14. → 72h, 15. → verloren
  const MAX_VERSUCHE = MAX_KONTAKTVERSUCHE;

  // ── Helper: Transaktionale E-Mail an den Kunden senden ──
  const sendKundenEmail = (templateName: string, extraData: Record<string, any> = {}) => {
    const email = (kunde.email || "").trim();
    if (!email) return;
    supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        recipientEmail: email,
        idempotencyKey: `${templateName}-${kunde.id}-${Date.now()}`,
        // Die Kundensprache ermittelt der Server über den Kontakt.
        kontaktId: kunde.id,
        templateData: {
          kundeName: `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim(),
          telefon: (kunde.telefon || "").trim(),
          ansprechpartnerName: user?.name,
          ansprechpartnerEmail: ansprechpartnerAdresse({ einstellungen: user?.email, anmeldung: authUser?.email }) || undefined,
          beraterUserId: authUser?.id || undefined,
          ...extraData,
        },
      },
    }).catch((err) => console.error(`E-Mail "${templateName}" fehlgeschlagen:`, err));
  };

  // ── Outcome button handlers ──
  const handleNichtErreicht = () => {
    const currentCount = kunde.nichtErreichtCount || 0;
    const newCount = currentCount + 1;

    addAktivitaet({ kundeId: kunde.id, art: "anruf", beschreibung: `Nicht erreicht (Versuch ${newCount})`, von: user.name });

    // Mail an den Lead nur beim 1., 4. und 10. Versuch, immer vom zuständigen
    // Partner, ab dem Beratungsgespräch gar nicht. Dieselbe zentrale Logik
    // wie im Kundenprofil.
    const fortgeschritten = fortschrittsRang(getEffectivePipelineStufe(kunde)) >= fortschrittsRang("beratungsgespraech");
    const nichtErreichtMails = nichtErreichtMailVerarbeiten(kunde, { fortgeschritten }) ?? undefined;

    {
      // Wartezeit setzen – Lead wird gemäß Staffelung versteckt
      const verstecktBis = getVerstecktBisForVersuch(newCount) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const wartezeitLabel = getWartezeitLabel(newCount);
      updateKontakt(kunde.id, {
        pipelineStufe: "kontaktversuche",
        nichtErreichtCount: newCount,
        nichtErreichtMails,
        verstecktBis,
      });
      onUpdate();
      toast({
        title: `Nicht erreicht (Versuch ${newCount})`,
        description: `Kontaktversuch protokolliert. Lead wird ${wartezeitLabel} ausgeblendet und erscheint danach automatisch wieder.`,
      });
    }
  };

  // Follow-Up Dialog state
  const [fuDialogOpen, setFuDialogOpen] = useState(false);
  const [fuTitel, setFuTitel] = useState("");
  const [fuDatum, setFuDatum] = useState("");
  const [fuUhrzeit, setFuUhrzeit] = useState("09:00");

  const handleFollowUpOpen = () => {
    setFuTitel(`Follow-Up: ${kunde.vorname} ${kunde.nachname}`);
    // Lokaler Kalendertag: das UTC-Datum ist zwischen 0 und 2 Uhr noch gestern.
    const inZweiTagen = new Date();
    inZweiTagen.setDate(inZweiTagen.getDate() + 2);
    setFuDatum(lokalesDatum(inZweiTagen));
    setFuUhrzeit("09:00");
    setFuDialogOpen(true);
  };

  const handleFollowUpConfirm = async () => {
    if (!fuDatum || !fuTitel.trim()) return;
    if (!istTerminInZukunft(fuDatum, fuUhrzeit || "09:00")) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
      return;
    }
    const verstecktBisDate = new Date(`${fuDatum}T${fuUhrzeit || "09:00"}`);
    const verstecktBis = verstecktBisDate.toISOString();
    addFollowUp({
      kundeId: kunde.id,
      kundeName: `${kunde.vorname} ${kunde.nachname}`,
      berater: kunde.berater || kunde.setter || "",
      pipelineStufe: "follow_up",
      typ: "anruf",
      titel: fuTitel,
      beschreibung: `Follow-Up am ${fuDatum} um ${fuUhrzeit || "09:00"} Uhr`,
      faelligAm: fuDatum,
      prioritaet: "hoch",
      automatisch: false,
    });
    addGeteilteAufgabe({
      titel: fuTitel,
      beschreibung: `Follow-Up am ${fuDatum} um ${fuUhrzeit || "09:00"} Uhr`,
      prioritaet: "hoch",
      typ: "follow_up",
      faellig_am: fuDatum,
      uhrzeit: fuUhrzeit || "09:00",
      kundeId: kunde.id,
      kundeName: `${kunde.vorname} ${kunde.nachname}`,
    });
    // Follow-Up Termin in Meta persistieren (für Liste & Cron-Eskalation).
    // Muss VOR updateKontakt laufen und abgewartet werden, sonst baut
    // updateKontakt das meta aus dem alten Zwischenspeicher neu auf und die
    // Follow-Up-Felder sind sofort wieder weg.
    await mergeKontaktMeta(kunde.id, {
      followUpAm: fuDatum,
      followUpUhrzeit: fuUhrzeit || "09:00",
      followUpGesetztAm: new Date().toISOString(),
      followUpEsk1Sent: null,
      followUpEsk2Sent: null,
      followUpEsk3Sent: null,
    });
    updateKontakt(kunde.id, { pipelineStufe: "follow_up", verstecktBis });
    addAktivitaet({ kundeId: kunde.id, art: "notiz", beschreibung: `${FOLLOW_UP_GEPLANT} "${fuTitel}" am ${fuDatum} um ${fuUhrzeit} Uhr`, von: user.name });
    onUpdate();
    setFuDialogOpen(false);
    toast({ title: "Follow-Up erstellt", description: `"${fuTitel}" am ${fuDatum} um ${fuUhrzeit} Uhr. Erscheint in deiner Inbox.` });
  };

  const handleKontaktdatenFalsch = () => {
    updateKontakt(kunde.id, { status: "verloren" as any, pipelineStufe: "verloren", verlorenGrund: "ne_daten_falsch", verlorenAm: new Date().toISOString() });
    addAktivitaet({ kundeId: kunde.id, art: "notiz", beschreibung: "Kontaktdaten falsch, Lead als verloren markiert", von: user.name });
    sendKundenEmail("setter-daten-falsch");
    checkAllItems();
    onUpdate();
    toast({ title: "Kontaktdaten falsch", description: "Lead wurde als verloren markiert.", variant: "destructive" });
  };

  const handleKeinInteresse = () => {
    updateKontakt(kunde.id, { status: "verloren" as any, pipelineStufe: "verloren", verlorenGrund: "kb_kein_interesse", verlorenAm: new Date().toISOString() });
    addAktivitaet({ kundeId: kunde.id, art: "notiz", beschreibung: "Kein Interesse, Lead als verloren markiert", von: user.name });
    sendKundenEmail("setter-kein-interesse");
    checkAllItems();
    onUpdate();
    toast({ title: "Kein Interesse", description: "Lead wurde als verloren markiert.", variant: "destructive" });
  };

  const handleErstgespraechUndZuweisen = async () => {
    if (!istTerminInZukunft(terminDatum, terminUhrzeit)) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
      return;
    }
    const isReschedule = terminGebucht && kunde.setterTerminDatum && kunde.setterTerminUhrzeit;
    const altDatum = kunde.setterTerminDatum;
    const altUhrzeit = kunde.setterTerminUhrzeit;

    // Setterin-Name aus Profil holen und im Lead speichern
    let currentSetterName = kunde.setter || "";
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (uid) {
        const { data: profileData } = await supabase.from("profiles").select("name").eq("id", uid).single();
        currentSetterName = profileData?.name || "Setterin";
      }
    } catch {}

    /*
     * Zustaendigkeit haengt an der Nutzer-ID, nicht am Namen.
     *
     * Bisher wurde hier nur `berater` gesetzt, ein Freitextfeld. Per RLS
     * entscheidet aber allein `zustaendig_id`, wer den Lead sieht. Jede
     * Terminbuchung erzeugte damit einen Kontakt, den der genannte
     * Vertriebspartner nie zu Gesicht bekam.
     *
     * Zugeordnet wird nur bei einem eindeutigen Treffer. Gibt es keinen oder
     * mehrere Namensgleiche, bleibt die Zustaendigkeit leer: Der Lead ist dann
     * weiter in der Lead-Verwaltung sichtbar und kann von Hand zugewiesen
     * werden. Ein falscher Treffer waere schlimmer, der Lead laege beim
     * Falschen und waere fuer alle anderen weg.
     */
    // Die gewaehlte Kennung zuerst, aber nur, wenn ihr Name zum gewaehlten
    // Namen passt (eine alte setterCloserId neben einem geaenderten Namen
    // zaehlt nicht). Sonst der Name als Rueckfall, nur eindeutig.
    const perKennung = selectedCloserId ? loadBeraterUsers().find(u => u.id === selectedCloserId) : undefined;
    const kennungPasst = !!perKennung
      && normalisiereBeraterName(perKennung.name) === normalisiereBeraterName(selectedCloser);
    const closerTreffer: BeraterTreffer = perKennung && kennungPasst
      ? { art: "eindeutig", id: perKennung.id, name: perKennung.name }
      : findeBeraterNachName(selectedCloser, loadBeraterUsers());
    const beraterUser = closerTreffer.art === "eindeutig"
      ? { id: closerTreffer.id, name: closerTreffer.name }
      : null;

    updateKontakt(kunde.id, {
      pipelineStufe: "erstgespraech_geplant",
      status: "kontaktiert" as any,
      berater: selectedCloser,
      ...(beraterUser ? { zustaendig_id: beraterUser.id } : {}),
      setter: currentSetterName,
      setterCloser: selectedCloser,
      ...(beraterUser ? { setterCloserId: beraterUser.id } : {}),
      setterSkriptNotizen: notizen,
      setterTerminGebucht: true,
      setterTerminDatum: terminDatum,
      setterTerminUhrzeit: terminUhrzeit,
      setterChecklisteDone: true,
      remindersSent: [], // Reset reminders for new/rescheduled termin
    });
    setTerminGebucht(true);

    if (isReschedule) {
      addAktivitaet({ kundeId: kunde.id, art: "notiz", beschreibung: `Termin verschoben von ${altDatum} ${altUhrzeit} auf ${terminDatum} ${terminUhrzeit} – Vertriebspartner: ${selectedCloser}`, von: user.name });
      // Benachrichtigung an Vertriebspartner senden
      // Der Termin selbst ist schon gespeichert. Ob die Benachrichtigung
      // ankommt, entscheidet sich hier und darf nicht stillschweigend
      // uebergangen werden, sonst behauptet die Meldung unten etwas Falsches.
      let benachrichtigt = !!beraterUser;
      if (beraterUser) {
        try {
          const { error } = await supabase.from("benachrichtigungen").insert({
            benutzer_id: beraterUser.id,
            titel: `Termin verschoben: ${kunde.vorname} ${kunde.nachname}`,
            nachricht: `Das Erstgespräch mit ${kunde.vorname} ${kunde.nachname} wurde von ${altDatum} um ${altUhrzeit} auf ${terminDatum} um ${terminUhrzeit} verschoben.`,
            link: `/kunden/${kunde.id}`,
          });
          if (error) throw error;
        } catch (e) {
          benachrichtigt = false;
          console.error("Benachrichtigung über verschobenen Termin fehlgeschlagen:", e);
        }
      }
      toast(benachrichtigt
        ? { title: "Termin verschoben ✓", description: `Neuer Termin: ${terminDatum} um ${terminUhrzeit}. Vertriebspartner ${selectedCloser} wurde benachrichtigt.` }
        : { title: beraterUser ? "Termin verschoben, Benachrichtigung fehlgeschlagen" : "Termin verschoben, Zuständigkeit offen", description: `Neuer Termin: ${terminDatum} um ${terminUhrzeit}. ${zuweisungsProblem(closerTreffer, selectedCloser)}`, variant: "destructive" });
    } else {
      addAktivitaet({ kundeId: kunde.id, art: "anruf", beschreibung: `Erstgespräch gebucht am ${terminDatum} um ${terminUhrzeit} – Vertriebspartner: ${selectedCloser}`, von: user.name });
      // Benachrichtigung an Vertriebspartner bei erstmaliger Übergabe
      // Siehe oben: der Lead ist zugewiesen, aber ob der Vertriebspartner davon
      // erfaehrt, haengt an diesem Insert. Ein stiller Fehlschlag bedeutet, dass
      // niemand den neuen Lead sieht.
      let benachrichtigt = !!beraterUser;
      if (beraterUser) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUserId = sessionData?.session?.user?.id;
          const { data: profileData } = currentUserId
            ? await supabase.from("profiles").select("name").eq("id", currentUserId).single()
            : { data: null };
          const setterName = profileData?.name || "Setterin";
          const { error } = await supabase.from("benachrichtigungen").insert({
            benutzer_id: beraterUser.id,
            titel: `Neuer Lead: ${kunde.vorname} ${kunde.nachname}`,
            nachricht: `${setterName} hat für den Lead ${kunde.vorname} ${kunde.nachname} ein Erstgespräch am ${terminDatum} um ${terminUhrzeit} Uhr vereinbart. Du findest den Lead unter Kontakte.`,
            link: `/kunden/${kunde.id}`,
          });
          if (error) throw error;
        } catch (e) {
          benachrichtigt = false;
          console.error("Benachrichtigung über neuen Lead fehlgeschlagen:", e);
        }
      }
      toast(benachrichtigt
        ? { title: "Erstgespräch gebucht & Lead zugewiesen ✓", description: `${kunde.vorname} ${kunde.nachname} → ${selectedCloser} am ${terminDatum} um ${terminUhrzeit}` }
        : { title: beraterUser ? "Lead zugewiesen, Benachrichtigung fehlgeschlagen" : "Termin gebucht, Lead nicht zugewiesen", description: `${kunde.vorname} ${kunde.nachname} → ${selectedCloser} am ${terminDatum} um ${terminUhrzeit}. ${zuweisungsProblem(closerTreffer, selectedCloser)}`, variant: "destructive" });
    }
    onUpdate();
  };

  const canSubmitTermin = !!selectedCloser && !!terminDatum && !!terminUhrzeit;

  return (
    <div className="space-y-6">
      {/* Gesprächsnotizen */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3 className="font-bold">Gesprächsnotizen</h3>
        </div>
        <Textarea
          value={notizen}
          onChange={e => setNotizen(e.target.value)}
          placeholder="Wichtige Beobachtungen, Einwände, Persönlichkeitstyp, Stimmung..."
          rows={3}
        />

        {/* Outcome Buttons */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gesprächsausgang</Label>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 transition-colors px-2 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/50" aria-label="Info E-Mail-Trigger">
                    <Info className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Welche E-Mail?</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm text-xs leading-relaxed">
                  <div className="font-semibold mb-1.5 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Automatische E-Mails an den Kunden
                  </div>
                  <ul className="space-y-1.5">
                    <li><strong>Nicht erreicht:</strong> Mail „Wir haben versucht dich zu erreichen", mit Telefonnummer und der Bitte um einen Terminvorschlag per E-Mail an den Ansprechpartner.</li>
                    <li><strong>Follow-Up:</strong> Keine automatische Mail – nur interner Termin in deiner Inbox.</li>
                    <li><strong>Daten falsch:</strong> Mail „Deine Kontaktdaten scheinen nicht zu stimmen", mit der Bitte um Korrektur per E-Mail an den Ansprechpartner.</li>
                    <li><strong>Kein Interesse:</strong> Mail „Vielleicht zu einem späteren Zeitpunkt" – mit Link zur VP-Landingpage von Christian Peetz.</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <TooltipProvider delayDuration={150}>
              {/* Nicht erreicht */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-xs h-9 pr-7"
                  onClick={handleNichtErreicht}
                >
                  <PhoneOff className="h-3.5 w-3.5 text-slate-500" /> Nicht erreicht {(kunde.nichtErreichtCount || 0) > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{kunde.nichtErreichtCount}</Badge>}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="E-Mail-Info Nicht erreicht" className="absolute top-1/2 right-1.5 -translate-y-1/2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <div className="flex items-center gap-1.5 font-semibold mb-1"><Mail className="h-3 w-3" /> Automatische E-Mail an Kunde</div>
                    „Wir haben versucht dich telefonisch zu erreichen", mit Telefonnummer und der Bitte, sich per E-Mail beim Ansprechpartner mit einem Terminvorschlag zu melden.
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Follow-Up (keine Mail) */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 border-amber-300 hover:bg-amber-50 hover:border-amber-400 text-xs h-9 pr-7"
                  onClick={handleFollowUpOpen}
                >
                  <PhoneForwarded className="h-3.5 w-3.5 text-amber-500" /> Follow-Up
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="E-Mail-Info Follow-Up" className="absolute top-1/2 right-1.5 -translate-y-1/2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 ring-1 ring-border">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <div className="font-semibold mb-1">Keine E-Mail</div>
                    Erstellt nur einen internen Follow-Up-Termin in deiner Inbox – der Kunde erhält keine Nachricht.
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Daten falsch */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 border-red-300 hover:bg-red-50 hover:border-red-400 text-xs h-9 pr-7"
                  onClick={handleKontaktdatenFalsch}
                >
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" /> Daten falsch
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="E-Mail-Info Daten falsch" className="absolute top-1/2 right-1.5 -translate-y-1/2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <div className="flex items-center gap-1.5 font-semibold mb-1"><Mail className="h-3 w-3" /> Automatische E-Mail an Kunde</div>
                    „Deine Kontaktdaten scheinen nicht zu stimmen", zeigt die hinterlegte (falsche) Rufnummer und bittet um Korrektur per E-Mail an den Ansprechpartner.
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Kein Interesse */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 border-red-300 hover:bg-red-50 hover:border-red-400 text-xs h-9 pr-7"
                  onClick={handleKeinInteresse}
                >
                  <XCircle className="h-3.5 w-3.5 text-red-500" /> Kein Interesse
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="E-Mail-Info Kein Interesse" className="absolute top-1/2 right-1.5 -translate-y-1/2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <div className="flex items-center gap-1.5 font-semibold mb-1"><Mail className="h-3 w-3" /> Automatische E-Mail an Kunde</div>
                    „Vielleicht zu einem späteren Zeitpunkt" – freundliche Abschiedsmail mit Link zur VP-Landingpage (portal.more.immo/vp/christian-peetz), falls das Thema später wieder relevant wird.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
          {/* Die Ergebnis-Knöpfe schicken eine Mail an den Kunden, in seiner Sprache. */}
          {kunde.email && <KundenspracheHinweis kontaktId={kunde.id} className="mt-2" />}
        </div>
      </Card>

      {/* Skript – alle Schritte untereinander */}
      <Card className="p-6">
        <div className="w-8 h-1 bg-primary mb-3" />
        <h3 className="font-bold mb-1">Setter-Skript</h3>
        <p className="text-xs text-muted-foreground mb-6">Folge dem Gesprächsleitfaden Schritt für Schritt.</p>
        <div className="space-y-6">
          {SKRIPT_SCHRITTE.map((step) => (
            <div key={step.id} className="space-y-3">
              <h4 className="font-semibold text-sm border-b pb-2">{step.titel}</h4>
              <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-primary">
                <p className="text-sm italic whitespace-pre-line">
                  {step.text.replace("[Vorname]", kunde.vorname).replace("[dein Name]", "")}
                </p>
              </div>
              <div className="bg-accent/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground"><strong>💡 Tipp:</strong> {step.tipp}</p>
              </div>
              {step.fragen && (
                <div className="space-y-3">
                  {step.fragen.map(f => (
                    <div key={f.key}>
                      <Label className="text-xs font-semibold">{f.label}</Label>
                      <Input
                        value={antworten[f.key] || ""}
                        onChange={e => updateAntwort(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Termin für Beratungsgespräch & Lead zuweisen */}
      <Card ref={terminRef} className="p-6">
        <div className="w-8 h-1 bg-primary mb-3" />
        <h3 className="font-bold mb-4">Beratungsgespräch vereinbaren</h3>

        {/* Vertriebspartner-Liste mit Buchungslinks */}
        <div className="space-y-3 mb-6">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vertriebspartner mit Buchungskalender</Label>
          <p className="text-xs text-muted-foreground">Öffne den Buchungskalender des gewünschten Beraters, um das Erstgespräch einzubuchen.</p>

          {beraterUsers.filter(u => u.buchungslink || (u as any).beratungslink).length === 0 && (
            <p className="text-xs text-destructive italic">Keine Vertriebspartner mit hinterlegtem Buchungskalender gefunden.</p>
          )}

          <div className="space-y-2">
            {beraterUsers.filter(u => u.buchungslink || (u as any).beratungslink).map(u => (
              <div
                key={u.id}
                className={`flex items-center gap-2 p-3 border rounded-lg transition-colors cursor-pointer ${
                  istGewaehlt(u) ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-muted/30"
                }`}
                onClick={() => {
                  setSelectedCloser(u.name);
                  setSelectedCloserId(u.id);
                }}
              >
                <UserCheck className={`h-4 w-4 shrink-0 ${istGewaehlt(u) ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{u.name}</p>
                  {u.rolle && <p className="text-[10px] text-muted-foreground capitalize">{u.rolle}</p>}
                </div>
                {istGewaehlt(u) && (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                )}
                {(u as any).beratungslink ? (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={(e) => { e.stopPropagation(); window.open((u as any).beratungslink, "_blank"); }}
                  >
                    <ExternalLink className="h-3 w-3" /> Beratungsgespräch
                  </Button>
                ) : u.buchungslink && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={(e) => { e.stopPropagation(); window.open(u.buchungslink, "_blank"); }}
                  >
                    <ExternalLink className="h-3 w-3" /> Erstgespräch
                  </Button>
                )}
              </div>
            ))}

            {/* Vertriebspartner ohne Buchungslink als Dropdown */}
            {beraterUsers.filter(u => !u.buchungslink && !(u as any).beratungslink).length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-[10px] text-muted-foreground mb-2">Weitere Vertriebspartner (ohne Buchungskalender):</p>
                <Select
                  value={beraterUsers.find(u => !u.buchungslink && !(u as any).beratungslink && istGewaehlt(u))?.id || ""}
                  onValueChange={(uid) => {
                    // Der Wert ist die Kennung, nicht der Name.
                    setSelectedCloserId(uid);
                    setSelectedCloser(beraterUsers.find(u => u.id === uid)?.name || "");
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Vertriebspartner auswählen..." />
                  </SelectTrigger>
                  <SelectContent className="z-[100] bg-popover">
                    {beraterUsers.filter(u => !u.buchungslink && !(u as any).beratungslink).map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}{u.rolle ? ` — ${u.rolle}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Datum & Uhrzeit */}
        <div className="border-t pt-4 space-y-4">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Termin manuell eintragen</Label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium mb-1 block">Datum *</Label>
              <DateInput
                value={terminDatum}
                onChange={v => setTerminDatum(v)}
                className="h-9"
                minDate={heuteIso()}
              />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Uhrzeit *</Label>
              <Input
                type="time"
                value={terminUhrzeit}
                onChange={e => setTerminUhrzeit(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {terminGebucht && (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
              <CheckCircle2 className="h-4 w-4" /> Erstgespräch mit {selectedCloser || "Vertriebspartner"} am {terminDatum} um {terminUhrzeit} vereinbart
            </div>
          )}

          {terminGebucht && !canSubmitTermin && (
            <p className="text-xs text-muted-foreground text-center">
              Termin bereits gebucht.
            </p>
          )}

          {!terminGebucht && !canSubmitTermin && (
            <p className="text-xs text-muted-foreground text-center">
              {!selectedCloser && "Bitte wähle einen Vertriebspartner aus. "}
              {!terminDatum && "Bitte trage das Datum ein. "}
              {!terminUhrzeit && "Bitte trage die Uhrzeit ein."}
            </p>
          )}
        </div>
      </Card>

      {/* Abschluss-Checkliste */}
      <Card className="p-6 border-[hsl(var(--warning))]/30">
        <div className="w-8 h-1 bg-[hsl(var(--warning))] mb-3" />
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="h-5 w-5 text-[hsl(var(--warning))]" />
          <h3 className="font-bold">Abschluss-Checkliste</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Bitte prüfe alle Punkte, bevor du die Kundenmaske verlässt.</p>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map(item => {
            const checked = isItemChecked(item.id);
            return (
              <div key={item.id} className="flex items-center gap-3">
                <Checkbox
                  checked={checked}
                  disabled={item.autoCheck}
                  onCheckedChange={() => !item.autoCheck && toggleChecklist(item.id)}
                />
                <Label className={`text-sm ${checked ? "line-through text-muted-foreground" : ""}`}>
                  {item.label}
                  {item.autoCheck && !checked && <span className="text-destructive ml-1 text-xs">(Pflichtfeld)</span>}
                </Label>
                {checked && <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" />}
              </div>
            );
          })}
        </div>
        {!allChecklistDone && (
          <div className="mt-4 p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-[hsl(var(--warning))]">Noch nicht vollständig!</p>
                <p className="text-xs text-muted-foreground">
                  Es fehlen noch: {missingItems.map(i => i.label).join(", ")}
                </p>
              </div>
            </div>
          </div>
        )}
        {allChecklistDone && (
          <div className="mt-4 p-3 rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <p className="text-xs font-semibold text-[hsl(var(--success))]">Lead vollständig bearbeitet ✓</p>
            </div>
          </div>
        )}

        {/* Combined submit button – only enabled when all checklist items done AND termin data complete */}
        <Button
          className="w-full gap-2 mt-4"
          disabled={!allChecklistDone || !canSubmitTermin}
          onClick={handleErstgespraechUndZuweisen}
        >
          <Calendar className="h-4 w-4" />
          {terminGebucht ? "Termin ändern & Lead neu zuweisen" : "Erstgespräch gebucht & Lead an Vertriebspartner zuweisen"}
        </Button>
        {!allChecklistDone && canSubmitTermin && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Bitte hake zuerst alle Checklisten-Punkte ab.
          </p>
        )}
        {allChecklistDone && !canSubmitTermin && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Bitte trage oben bei „Termin für Beratungsgespräch" Vertriebspartner, Datum und Uhrzeit ein.
          </p>
        )}
      </Card>

      {/* Save */}
      <div className="flex justify-center">
        <Button onClick={handleSave} className="px-8">
          Alle Daten speichern
        </Button>
      </div>

      {/* Follow-Up Dialog */}
      <Dialog open={fuDialogOpen} onOpenChange={setFuDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Follow-Up planen</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Titel</Label>
              <Input value={fuTitel} onChange={e => setFuTitel(e.target.value)} placeholder="z. B. Rückruf vereinbart" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Datum</Label>
                <DateInput value={fuDatum} onChange={v => setFuDatum(v)} minDate={heuteIso()} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Uhrzeit</Label>
                <Input type="time" value={fuUhrzeit} onChange={e => setFuUhrzeit(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setFuDialogOpen(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={handleFollowUpConfirm} disabled={!fuTitel.trim() || !fuDatum}>Follow-Up erstellen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
