import { markiereProfilAbschnitt } from "@/components/kunden/profil/markiereProfilAbschnitt";
import { investmentFuerNaechstenSchritt } from "@/components/kunden/profil/hoechstesInvestment";
import { KundenprofilNavigation } from "@/components/kunden/profil/KundenprofilNavigation";
import { KundenprofilKennzahlen } from "@/components/kunden/profil/KundenprofilKennzahlen";
import { KundenprofilAktivitaeten } from "@/components/kunden/profil/KundenprofilAktivitaeten";
import { KundenprofilNotiz } from "@/components/kunden/profil/KundenprofilNotiz";
import { EintragEntfernenDialog, NotizFavoritStern } from "@/components/kunden/profil/KundenprofilVerlaufAktionen";
import { angepinnteZuerst, istAngepinnt } from "@/lib/notizFavoriten";
import { geplanteZuerst, istGeplant } from "@/lib/verlaufGeplant";
import { useAktivitaetenLeiste } from "@/components/kunden/profil/useAktivitaetenLeiste";
import { KundenprofilAbschnitt } from "@/components/kunden/profil/KundenprofilAbschnitt";
import { KundenprofilLayout } from "@/components/kunden/profil/KundenprofilLayout";
import { KundenprofilInvestmentLayout } from "@/components/kunden/profil/KundenprofilInvestmentLayout";
import { KundenprofilStammdaten, KundenprofilUeberschrift } from "@/components/kunden/profil/KundenprofilStammdaten";
import { KundenprofilAktionsleiste, QUICK_ACTIONS } from "@/components/kunden/profil/KundenprofilAktionsleiste";
import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { useLiveData } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";

// Konstante Tabellenliste, damit der Hook nicht bei jedem Rendern neu prüft.
const INVESTMENT_TABELLEN = ["investments"];
// Die dauerhaft sichtbaren Bereiche verwenden dieselben Tabellen wie die Profilroute.
const PROFIL_KENNZAHL_TABELLEN = ["kontakte", "investments", "aufgaben", "follow_ups", "aktivitaeten", "activity_log"];
const PROFIL_AKTIVITAETEN_TABELLEN = ["aktivitaeten", "activity_log", "aufgaben"];
// Quellen der aufklappbaren Kachel "Offene Aufgaben". Ohne eigene Anmeldung am
// Zwischenspeicher bliebe die Liste nach dem Abhaken unverändert stehen.
const OFFENE_AUFGABEN_TABELLEN = ["aufgaben", "follow_ups"];
import { formatDatum } from "@/lib/utils";
// Zuweisungsdatum wird ab jetzt einheitlich als ISO geschrieben, damit die
// Sortierung „zuletzt zugewiesen" nicht an zwei Formaten scheitert.
import { jetztAlsIsoDatum } from "@/lib/datumsformate";
import JSZip from "jszip";
import { resolveUnterlagenUrl, openUnterlage, extractStoragePath, unterlageHerunterladen } from "@/lib/storage";
import { aktuellerSaPdfPfad } from "@/lib/selbstauskunftPdfAblage";
import { saGeltendeUnterschriftenAusMeta } from "../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts";
import { confirmDialog, abfrageDialog, auswahlDialog, hinweisDialog } from "@/lib/confirm";
import { signaturErneutSenden } from "@/lib/signaturErneutSenden";
import { SIGNATUR_FRIST_TAGE, SIGNATUR_FRIST_TEXT } from "@/lib/signaturFrist";
// Rollen der Seite laeuft ueber den gemeinsamen Helfer, siehe lib/rollen.ts.
import { seitenRoller, rolleNachDemZeichnenNachOben } from "@/lib/rollen";
import { buildBonitaetDocs, buildBonitaetDocsPerson2 } from "@/lib/bonitaetDocs";
import { applyLegacyDocKeys, LEGACY_DOC_KEYS, mergeVorhandeneDocs, zaehltFuerAbschluss } from "@/lib/bankpruefungDocs";

/** Sanitize a string for use in Supabase Storage keys (no umlauts/special chars) */
function sanitizeStorageKey(s: string): string {
  return s
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/[^a-zA-Z0-9_\-./]/g, "_");
}
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SetterErstgespraechsSkript, ERSTGESPRAECH_SCHRITTE, ERSTGESPRAECH_SCHRITTE_DETAIL, type SetterErstgespraechsSkriptHandle } from "@/components/setter/SetterErstgespraechsSkript";
import { baueErstgespraechDetails, baueErstgespraechZusammenfassung } from "@/lib/erstgespraechZusammenfassung";
import { erledigteTermine, festeTermine, geplanteAktionenFuer, kontaktQuellen, offenerSetterTerminSchluessel, setterTerminName } from "@/lib/kontaktTermine";
import {
  festeGespraechsArt, festerTerminAusSchluessel, festerTerminNichtStattgefunden, festerTerminStattgefunden, festerTerminVerschieben,
  neuerTerminSchritt, rueckfrageOptionen, stufeNachVerschieben,
  type FesterTerminAngabe, type FesterTerminKontext,
} from "@/lib/festerTerminErgebnis";
import { naechsterKontakt as naechsterGeplanterKontakt, hatGeplantenTermin } from "@/lib/naechsterKontakt";
import {
  saVollansicht,
  stufeAbSelbstauskunft,
  objektauswahlFreigeschaltet,
  reservierungFreigeschaltet as reservierungOffen,
  FREIGESCHALTET_AB_RESERVIERUNG,
  finanzierungIntern,
} from "@/lib/investmentFreischaltung";
import {
  bonitaetsunterlagenErforderlich,
  darfSelbstauskunftEntfallen,
  getSelbstauskunftEntfaellt,
  nimmSelbstauskunftEntfaelltZurueck,
  type SaEntfaelltVermerk,
  saEntfaelltText,
  setzeSelbstauskunftEntfaellt,
} from "@/lib/selbstauskunftEntfaellt";
import { MitschriftenKasten } from "@/components/mitschrift/MitschriftenKasten";

import { Card } from "@/components/ui/card";
import { MeetingErstellenDialog } from "@/components/kunden/MeetingErstellenDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { berechneImmobilienvermoegen, type Immobilienvermoegen } from "@/lib/immobilienvermoegen";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Video, ArrowLeft, Upload, Building2, StickyNote, Mail, CalendarDays, CheckCircle2, Pencil, UserCog, Archive, Trash2, Send, Eye, FileText, Plus, RefreshCw, ExternalLink, Download, Clock, ClipboardCheck, AlertTriangle, UserCheck, CalendarCheck, Settings, FolderOpen, PhoneOff, PhoneForwarded, AlertCircle, XCircle, Calendar, Lock, TrendingUp, Shield, ShieldCheck, ChevronDown, ChevronUp, ChevronRight, Info, RotateCcw, Star, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_STUFEN, getEffectivePipelineStufe, getProzessBereichForStufe, istTerminInZukunft, heuteIso, TERMIN_ZUKUNFT_MELDUNG, type ProzessBereich } from "@/lib/kontaktPipeline";
// Was eine Stufe bedeutet, steht an einer Stelle, siehe stufenErklaerung.ts.
import { STUFEN_ERKLAERUNG } from "@/lib/stufenErklaerung";
import { FORTSCHRITT_STUFEN, fortschrittsRang, fortschrittsStufe, istNoShowStufe, stufeErreicht, stufenFilterLabel } from "@/lib/pipelineStufen";
import { InactivityAmpel } from "@/components/kunden/InactivityAmpel";
import { BuchungErgebnisKarten } from "@/components/kunden/BuchungErgebnisKarten";
import RechnerAngaben from "@/components/kunden/RechnerAngaben";
import { getObjekte, getObjektById } from "@/lib/objekteStore";
import { FreieWohnungenCard } from "@/components/kunden/FreieWohnungenCard";
import { InvestmentBerechnungen } from "@/components/kunden/InvestmentBerechnungen";
import { GesendeteExposes } from "@/components/kunden/GesendeteExposes";
import { getKontaktById, updateKontakt, deleteKontakt, mergeKontaktMeta, type KundeData, dbRowToKunde } from "@/lib/kundenStore";
import { versendeSaFormularPdf, saDatenAusPdfFormular, uebernehmePerson2InKontakt } from "@/lib/saPdfFormular";
import { saStartstandFuerInvestment } from "@/lib/saStartstand";
import { isNewBadgeActive } from "@/lib/seenBadges";
import { istZustaendig, kontaktBelongsToUser, darfKontaktBearbeiten } from "@/lib/kontaktOwnership";
import { useVertretungen } from "@/hooks/useVertretungen";
import { reservierungAufheben, reservierungAufhebenRecht, reservierungBesteht } from "@/lib/reservierungAufheben";
import { kennungMitNamensprobe, kennungZuName } from "@/lib/beraterNamensabgleich";
import { unterlagenZeileGesperrt } from "@/lib/unterlagenSperre";
import { loeschFehlerText, unterlagenSpeicherPfad } from "@/lib/unterlagenLoeschen";
import { reassignBerater, istUebergabe } from "@/lib/beraterHistorie";
import { BeraterVerlauf } from "@/components/kunden/BeraterVerlauf";
import { KampagnenZeile } from "@/components/kunden/KampagnenZeile";
import { kontaktQuelleAnzeige } from "@/lib/kontaktQuelle";
import { UebergabeGrundFeld } from "@/components/kunden/UebergabeGrundFeld";
import { grundSatz, grundVollstaendig, type UebergabeGrund } from "@/lib/uebergabeGrund";
import { getAktivitaeten, addAktivitaet, addAktivitaetSicher, addGeteilteAufgabe, updateAktivitaet, ART_LABELS, type AktivitaetEntry, setzeAktivitaetErledigt, setzeNotizAngepinnt } from "@/lib/aktivitaetenStore";
import { darfEintragEntfernen, darfNotizBearbeiten, darfVorgangBearbeiten, istSystemEintrag, LEITUNG_ROLLEN, type Rechtekontext } from "@/lib/aktivitaetRechte";
import {
  alleFormulierungen,
  istSchonNotiert,
  neueUnterschriften,
  stufenwechselNotiz,
  unterschriftMeldung,
  unterschriftNotiz,
  BONITAET_FREIGEGEBEN,
  ERSTER_KONTAKTVERSUCH,
  NOTARTERMIN_STATTGEFUNDEN,
  RV_ERSTELLT,
  RV_UNTERSCHRIEBEN,
  SA_UNTERSCHRIEBEN,
  notarterminGesetzt,
  type ProzessNotiz,
  type Unterschriftsstand,
} from "@/lib/prozessNotizen";
import { ansichtFuerArt } from "@/lib/aktivitaetenAnsicht";
import { ExpandableText } from "@/components/common/ExpandableText";
import { describeActivityAction, categorizeActivityAction } from "@/lib/activityLog";
import { StickyPagination, usePagination } from "@/components/kunden/StickyPagination";
import { addFollowUp, completeFollowUp, getFollowUpsByKunde, uncompleteFollowUp } from "@/lib/followUpStore";
import { aufgabenSchluessel, erledigeAufgabe, findeAufgabeZuAktivitaet, getAufgabenFuerKunde, oeffneAufgabe, offeneAufgabenOhneAktivitaet } from "@/lib/aufgabenStore";
import { baueKundenAufgabenListe, zaehleKundenAufgaben, type KundenAufgabe } from "@/lib/kundenAufgabenListe";
import { aktionZeitpunktText, neuerGespraechsterminNachNoShow, noShowListe, type GeplanteAktion } from "@/lib/kundenNaechsteAktion";
import { abschlussWeg, sammelbareAufgaben, sammelwegBeschreibung } from "@/lib/aktionAbschluss";
import { findeErgebnisTermin, ladeErgebnisTermine, lokalesDatum, type ErgebnisKontext, type ErgebnisTermin } from "@/lib/terminErgebnis";
import { TerminErgebnisDialog } from "@/components/kunden/TerminErgebnisDialog";
import { berechneInaktivitaetsAmpel } from "@/lib/inaktivitaetsAmpel";
import { useNaechsteAktionKachel, useOffeneAufgabenKachel } from "@/components/kunden/profil/useOffeneAufgabenKachel";
import { ToastAction } from "@/components/ui/toast";
import { getNextSteps } from "@/lib/nextStepsGuide";
import { loadBeraterUsers, loadAllUsers } from "@/lib/loadAllUsers";
import { useToast } from "@/hooks/use-toast";
import { selbstauskunftFortschrittProzent } from "@/components/selbstauskunft/SelbstauskunftForm";
import { hatAngefangenenStand } from "@/lib/selbstauskunftEinladung";
// Startpunkt der Ladezeitmessung der Selbstauskunft, siehe src/lib/saLadezeit.ts.
// Gibt die Adresse unveraendert zurueck, deshalb steht der Aufruf im navigate.
import { saKlickGemerkt } from "@/lib/saLadezeit";
const generateSelbstauskunftPDF = async (...args: Parameters<typeof import("@/lib/selbstauskunftPdf").generateSelbstauskunftPDF>) => {
  const m = await import("@/lib/selbstauskunftPdf");
  return m.generateSelbstauskunftPDF(...args);
};
import { LeadScoreBadge, LeadScoreHint } from "@/components/kunde/LeadScoreCard";
const generateReservierungPDF = async (...args: Parameters<typeof import("@/lib/reservierungPdf").generateReservierungPDF>) => {
  const m = await import("@/lib/reservierungPdf");
  return m.generateReservierungPDF(...args);
};
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { cacheGet, cacheUpdate, cacheSet, cacheDelete, isTableLoaded, cacheRefreshTable, cacheLadeZeilenFuer, ladeTabellen, onCacheChange, cacheMetaZusammenfuehren, metaUnterschied } from "@/lib/dataCache";
import { ladeUnterlagenDateiHoch } from "@/lib/unterlagenUpload";
import { useLiveVersion } from "@/hooks/useLiveData";
import { BeraterSearchSelect } from "@/components/kunden/BeraterSearchSelect";
import { NotarVorschlaegeBlock } from "@/components/kunde/NotarVorschlaegeBlock";
import { PipelineStufeHinweis } from "@/components/kunde/PipelineStufeHinweis";
import { ProzessstrasseAusschnitt } from "@/components/kunde/prozessstrasse/ProzessstrasseAusschnitt";
import { KontaktversucheCard } from "@/components/kunde/KontaktversucheCard";
import { NaechsteSchritteKarte } from "@/components/kunde/NaechsteSchritteKarte";
import { AftersalesBeratungCard } from "@/components/kunde/investments/AftersalesBeratungCard";
import { LockedPhaseCard } from "@/components/kunde/investments/LockedPhaseGrid";
import { Switch } from "@/components/ui/switch";
import { AlsTippgeberAnlegenButton } from "@/components/kunde/AlsTippgeberAnlegenButton";
import { einverstaendnisBestaetigtAm } from "@/lib/tippgeberEmpfehlung";
import { EmpfehlungsprogrammKnoepfe } from "@/components/kunde/EmpfehlungsprogrammKnoepfe";
import { KundenportalZugang, type KundenportalZugangAngaben } from "@/components/kunde/KundenportalZugang";
import { KundenspracheFeld } from "@/components/kunden/profil/KundenspracheFeld";
import { KundenspracheHinweis, KundenspracheKuerzel } from "@/components/kunden/KundenspracheHinweis";
import { useKundenSprache, setzeKundenSprache, stelleKundenspracheSicher, kundenSpracheMetaPatch, kundenSprache, type Sprache } from "@/lib/kundenSprache";
import { KUNDEN_GLOCKE } from "@/lib/kundenGlocke";
import { schaltePortalSperre, portalSperreAmServer } from "@/components/kunde/kundenportalSperre";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";

import { supabase } from "@/integrations/supabase/client";
import { getUnreadChatCountForKunde } from "@/lib/chatStore";
import { KommunikationReiter, type VerlaufSchluessel } from "@/components/kunde/KommunikationReiter";
import KundeDokumenteCard from "@/components/kunde/KundeDokumenteCard";
import { useUser } from "@/contexts/UserContext";
import { ansprechpartnerAdresse } from "@/lib/ansprechpartnerAdresse";
import { nichtErreichtMailVerarbeiten } from "@/lib/nichtErreichtMails";
import { QuickActionDialog } from "@/components/kunden/QuickActionDialog";
import { AufgabeBearbeitenDialog } from "@/components/kunden/AufgabeBearbeitenDialog";
import { starteAnrufFuerKontakt, type AnrufQuelle } from "@/lib/anrufStarten";
import { CallSessionBar } from "@/components/kunde/CallSessionBar";
import { advanceCallSession, getCallSession } from "@/lib/callSessionStore";
import { SaPartialSignaturePill } from "@/components/kunden/SaPartialSignaturePill";
import { addDocNotification } from "@/lib/notificationStore";
import {
  notifyPipelineChange, notifyReservierungEingegangen,
  notifyLeadZugewiesen, notifyLeadQualifiziert,
  notifyTerminGebucht, notifyNotarTerminGesetzt,
  scheduleEmpfehlungsprogrammReminders,
  scheduleNotarfotoReminders, scheduleKundenordnerReminder,
  notifyPruefungErgebnis,
  notifyFollowUpErstellt,
  notifyNotarfotoHochgeladen,
  notifyVermoegenLeadGeeignet,
  notifyUser,
  scheduleSaFollowUpReminders,
  notifySaEinladungVerschickt,
  notifyKundeReservierung,
  notifyReservierungAufgehoben,
  notifyKundeFinanzierungFreigegeben,
  notifyKundeNotartermin,
  notifyKundeKundenordnerDokument,
  notifyKundeSelbstauskunft,
  notifyKundePipelineStufe,
  notifyDokumenteVollstaendig,
} from "@/lib/bellNotifications";
import { FinanzierungCard } from "@/components/finanzierung/FinanzierungCard";
import { TerminseiteKnopf } from "@/components/kunden/TerminseiteKnopf";
import { EigenfinanzierungSection } from "@/components/finanzierung/EigenfinanzierungSection";
import { getFinanzierung } from "@/lib/finanzierungStore";
import { meldeBonitaetFreigabe } from "@/lib/bonitaetFreigabeMeldung";
import { finanzierungIstFrei } from "@/lib/finanzierungFreigabe";
import { meldeBonitaetNachFreigabe } from "@/lib/bonitaetNachFreigabe";
import { SaVersandZeitpunkt } from "@/components/kunden/SaVersandZeitpunkt";
import { SaMailTracking } from "@/components/kunden/SaMailTracking";
import { SaPdfNachholen } from "@/components/kunden/SaPdfNachholen";
import {
  getInvestmentsByKontakt,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  getInvestmentDocStatuses,
  setInvestmentDocStatus,
  getInvestmentSaPdf,
  setSaData,
  getSaPdfWegGestartet,
  setSaPdfWegGestartet,
  getSaPapierUpload,
  vermerkeSaPdf,
  getInvestmentRvPdf,
  setInvestmentRvPdf,
  getInvestmentNotarData,
  setInvestmentNotarData,
  setInvestmentNotarFields,
  setInvestmentMetaFields,
  getInvestmentMetaField,
  getDocsByInvestment,
  addInvestmentDoc,
  removeInvestmentDoc,
  requestDeleteDoc,
  getInvestmentNotarFoto,
  setInvestmentNotarFoto,
  getNotarGesendet,
  setNotarGesendet,
  getNotarGesendetAt,
  getNotarTerminPortalFreigabe,
  setNotarTerminPortalFreigabe,
  getNotarTerminPortalFreigabeAt,
  freigebenNotarTerminPortal,
  zurueckziehenNotarTerminPortal,
  getNotarTerminModus,
  setNotarTerminModus,
  getUnterlagenFreigeschalten,
  setUnterlagenFreigeschalten,
  getUnterlagenFreigeschaltetAt,
  getInvestmentUnterlagenFreigeschalten,
  setInvestmentUnterlagenFreigeschalten,
  getInvestmentUnterlagenFreigeschaltetAt,
  getCustomBankDocs,
  addCustomBankDoc,
  removeCustomBankDoc,
  getSaEditStatus,
  setSaEditStatus,
  getSaSignaturePending,
  setSaSignaturePending,
  getSaSigned,
  getSaNeueUnterschriftAusstehend,
  getRvSignaturePending,
  setRvSignaturePending,
  getRvSigned,
  getRvSignatureSentAt,
  setRvSignatureSentAt,
  getRvEditApproved,
  setRvEditApproved,
  clearEinheitGewechselt,
  getKundenordnerByInvestment,
  addKundenordnerDokument,
  removeKundenordnerDokument,
  updateKundenordnerDokument,
  getVisibleKundenordnerKategorien,
  getCustomKundenordnerKategorien,
  setCustomKundenordnerKategorien,
  getKundenordnerRenames,
  setKundenordnerRenames,
  getRemovedKundenordnerKat,
  setRemovedKundenordnerKat,
  KUNDENORDNER_DEFAULT_KATEGORIEN,
  type SaEditStatus,
  type Investment,
  getDocRejectReasons,
  setDocRejectReason,
  rejectInvestmentDoc,
  clearDocRejectReason,
  getSaInvitationSentAt,
  setSaInvitationSentAt,
  getSaData,
  getKaufvertragData,
  setKaufvertragData,
  getKaufvertragPdf,
  setKaufvertragPdf,
  deleteKaufvertragPdf,
  getKaufvertragUpdatedAt,
  getNotarEmail,
  setNotarEmail,
  type KaufvertragData,
  getNotarterminEingetragenAt,
  setNotarterminEingetragenAt,
  isGrundschuldUploaded,
  getNotarTerminVorschlaege,
  setNotarTerminVorschlaege,
  getNotarTerminVorschlaegeFreigegeben,
  setNotarTerminVorschlaegeFreigegeben,
  getNotarTerminBestaetigt,
  clearNotarTerminBestaetigt,
  switchNotarTerminModus,
  getWartendeRvUnterschriften,
  type NotarTerminVorschlag,
} from "@/lib/investmentsStore";
import { KaufvertragForm } from "@/components/notar/KaufvertragForm";
import { PageHeader } from "@/components/PageHeader";
const generateKaufvertragPDF = async (...args: Parameters<typeof import("@/lib/kaufvertragPdf").generateKaufvertragPDF>) => {
  const m = await import("@/lib/kaufvertragPdf");
  return m.generateKaufvertragPDF(...args);
};
import {
  getProgrammByInvestment,
  EMPFEHLUNG_STATUS_LABEL,
} from "@/lib/empfehlungenStore";
import { Gift, Heart, BarChart3, FileSignature, Sparkles } from "lucide-react";
import { getAnalyseResultForKontakt } from "@/components/analysis/ResultsPage";
import { eigentuemerAusInvestment } from "@/lib/eigentuemerStore";
import { BewertungenAnzeige } from "@/components/kunden/BewertungenAnzeige";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeTelefon, whatsAppLink } from "@/lib/phoneUtils";
import { DsgvoHardDeleteDialog } from "@/components/dsgvo/DsgvoHardDeleteDialog";
import { MAX_KONTAKTVERSUCHE, getVerstecktBisForVersuch, getWartezeitLabel } from "@/lib/kontaktversuchSchedule";
import { VerlustGrundAuswahl } from "@/components/verlust/VerlustGrundAuswahl";
import { verlustGrundLabel } from "@/lib/verlustgruende";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
// Abwicklungsdaten liegen am Investment, nicht mehr in den persoenlichen
// Einstellungen des Eintragenden. Siehe Kommentar in abwicklungStore.ts.
import { getAbwicklungDaten, saveAbwicklungDaten, abwicklungGespeichert, ABWICKLUNG_ROLLEN, ABWICKLUNG_GELD_ROLLEN, ABSCHLUSS_HINWEIS, ABSCHLUSS_NUR_ROLLEN, ABSCHLUSS_STUFEN, darfAbschlussStufeWechseln, type AbwicklungDaten } from "@/lib/abwicklungStore";
import { AktionVerweigert } from "@/lib/investmentGepruefteWege";
// Mailversand mit gepruefter Feldliste. Wird Aufrufstelle fuer Aufrufstelle
// eingefuehrt, siehe Kommentar in mailVersand.ts.
import { sendeVorlagenMail } from "@/lib/mailVersand";
import {
  NOTAR_MAIL_STAND_FELD,
  freigabeRueckmeldung,
  notarterminFreigabeMails,
  type NotarterminFreigabeVersand,
} from "@/lib/notarterminMail";
import { BUERO_EMAIL } from "@/lib/impressumKontakt";
import { objektDialogNoetig, vorhandeneObjektDaten, objektDatenFehlen, BESTANDSWOHNUNG_AKTIV, investmentKaufpreis } from "@/lib/objektDatenPflicht";
import { darfReservierungStarten } from "@/lib/reservierungStart";
import { verkaeuferArt, verkaeuferNotarFelder, verkaeuferVollerName } from "@/lib/verkaeuferName";
import { FOLLOW_UP_GEPLANT, ERSTGESPRAECH_VEREINBART } from "../../supabase/functions/_shared/follow-up-eskalation.ts";

// Format number string with thousand separators (dots)
function formatQualNumber(val: string): string {
  const stripped = val.replace(/\./g, "");
  const pureDigits = stripped.replace(/[^\d]/g, "");
  if (pureDigits.length > 0 && stripped === pureDigits) {
    return parseInt(pureDigits, 10).toLocaleString("de-DE");
  }
  return val;
}

function parseQualNumber(val: string): string {
  return val.replace(/\./g, "");
}

/**
 * Lokales State-Wrapper für Qualifizierungs-Inputs.
 * Fix für Bug: Bei jedem Tastendruck wurde updateKontakt() aufgerufen, was die
 * komplette Kontakt-Row in den DataCache schreibt und einen Re-Render mit
 * möglicherweise stale Wert auslöst. Folge: Cursor springt, einzelne
 * Buchstaben gehen verloren (z. B. "Steuer" → "Steepir"). Lösung: lokal
 * tippen, erst onBlur persistieren.
 */
function QualTextInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (val: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const focusedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const latestRef = useRef(value);
  useEffect(() => {
    if (!focusedRef.current) setLocal(value);
  }, [value]);
  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);
  return (
    <Input
      value={local}
      placeholder={placeholder}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        latestRef.current = v;
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          if (latestRef.current !== value) onCommit(latestRef.current);
        }, 400);
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (debounceRef.current) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
        if (local !== value) onCommit(local);
      }}
    />
  );
}

function QualNumberInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (val: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(formatQualNumber(value));
  const focusedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const latestRawRef = useRef(value);
  useEffect(() => {
    if (!focusedRef.current) setLocal(formatQualNumber(value));
  }, [value]);
  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);
  return (
    <Input
      value={local}
      placeholder={placeholder}
      inputMode="numeric"
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => {
        const formatted = formatQualNumber(e.target.value);
        setLocal(formatted);
        const next = parseQualNumber(formatted);
        latestRawRef.current = next;
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          if (latestRawRef.current !== value) onCommit(latestRawRef.current);
        }, 400);
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (debounceRef.current) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
        const next = parseQualNumber(local);
        if (next !== value) onCommit(next);
      }}
    />
  );
}


const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

const formatKundenId = (moreId?: number | null) => {
  if (!moreId || moreId <= 0) return "–";
  return `MI-${String(moreId).padStart(5, "0")}`;
};

import { kreditArt, kreditAuswahlLabel, RAHMEN_PUFFER, RAHMEN_ANNUITAET, extractEinkuenfte as extractFinanzEinkuenfte, extractAusgaben as extractFinanzAusgaben, calculateFinanzierbarkeitFromSaData } from "@/lib/finanzierbarkeitUtils";
import { eigeneSaDataFuerInvestmentRow } from "@/lib/saQuelle";
import { bankpruefungListenFuerInvestment, OHNE_EIGENE_SA_HINWEIS } from "@/lib/bankpruefungListe";
import { tarnEmail, tarnName, tarnTelefon, tarnVerweis } from "@/lib/vorfuehrmodus";
import { oeffentlicheAdresse } from "@/lib/oeffentlicheBasis";

function parseFinanzNum(value: any): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

/**
 * Die einzelnen Kredite hinter einer Sammelzeile.
 *
 * Anlass: Ein Vertriebspartner sah "Sonstige Kredite 2.424,25" und konnte
 * nirgends nachsehen, woraus sich das zusammensetzt. Die Zeile ist eine Summe
 * ueber alle Kredite einer Art, und wer sie nicht aufschluesseln kann, haelt
 * jede ungewohnte Zahl fuer einen Fehler.
 */
function KreditPosten({ kredite, art }: { kredite: any[]; art: string }) {
  const passende = (kredite || []).filter((k) => kreditArt(k?.art, k?.kategorie) === art);
  if (passende.length === 0) return null;
  return (
    <div className="mt-0.5 mb-1 ml-3 space-y-0.5 border-l pl-2">
      {passende.map((k, i) => (
        <div key={i} className="flex justify-between text-[10px] text-muted-foreground">
          <span className="truncate">
            {kreditAuswahlLabel(k?.kategorie) || k?.art || "Kredit"}
            {kreditAuswahlLabel(k?.kategorie) && k?.art ? ` · ${k.art}` : ""}
          </span>
          <span className="tabular-nums">{fmt(parseFinanzNum(k?.rate))}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Die Wertzeilen einer Einkuenfte- oder Ausgabenliste.
 *
 * Die Ausgabenliste hat dreizehn Positionen, und bei den meisten Kunden steht
 * bei der Haelfte davon eine Null. Diese Zeilen machen die Liste doppelt so
 * hoch, ohne etwas zu sagen. Sie fallen deshalb nicht weg, sondern rutschen in
 * eine eigene Aufklappzeile und stehen dort wieder einzeln.
 *
 * `kredite` schluesselt die vier Sammelzeilen der Ausgaben auf (KreditPosten).
 * Bei den Einkuenften bleibt der Wert leer, dort gibt es keine Sammelzeilen.
 */
function FinanzZeilen({ zeilen, kredite }: { zeilen: [string, number][]; kredite?: any[] }) {
  const mitBetrag = zeilen.filter(([, wert]) => wert !== 0);
  const ohneBetrag = zeilen.filter(([, wert]) => wert === 0);
  const zeile = ([label, wert]: [string, number], key: string) => (
    <div key={key}>
      <div className="flex justify-between"><span>{label}</span><span>{fmt(wert)}</span></div>
      {/* Sammelzeilen aufschluesseln, siehe KreditPosten. */}
      {kredite && label === "Zins/Tilgung aus Hypotheken" && <KreditPosten kredite={kredite} art="hypothek" />}
      {kredite && label === "Autokredite" && <KreditPosten kredite={kredite} art="auto" />}
      {kredite && label === "Privatkredite" && <KreditPosten kredite={kredite} art="privat" />}
      {kredite && label === "Sonstige Kredite" && <KreditPosten kredite={kredite} art="sonstige" />}
    </div>
  );
  return (
    <div className="mt-1 space-y-1">
      {mitBetrag.map((z, i) => zeile(z, `wert-${i}`))}
      {ohneBetrag.length > 0 && (
        <details className="group/nullzeilen">
          <summary className="flex items-center justify-between cursor-pointer list-none text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
            <span>{ohneBetrag.length} {ohneBetrag.length === 1 ? "Position" : "Positionen"} ohne Betrag</span>
            <ChevronDown className="h-3 w-3 transition-transform group-open/nullzeilen:rotate-180" />
          </summary>
          <div className="mt-1 space-y-1">
            {ohneBetrag.map((z, i) => zeile(z, `ohne-${i}`))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Stift und Papierkorb in den Dokumentenzeilen, als reines Symbol.
 *
 * Christian am 17.09.2026: „Datei anzeigen, bearbeiten und den Papierkorb in
 * eine Zeile." Genau die Wörter neben den beiden Symbolen kosteten die Breite,
 * die für die dritte Schaltfläche fehlte, also stand jedes Dokument über drei
 * bis vier Zeilen. Das gilt ausdrücklich in jeder Größe, nicht nur auf dem
 * Telefon.
 *
 * Ein Symbol ohne Wort ist für einen Bildschirmleser stumm, deshalb trägt der
 * Knopf seinen vollen Namen im `aria-label`, und dieselbe Beschriftung
 * erscheint als Tooltip für die Maus. Das Symbol selbst ist mit
 * `aria-hidden` ausgenommen, sonst würde der Name doppelt vorgelesen.
 *
 * Der Papierkorb bleibt rot und rückt über `data-aktion="loeschen"` ans rechte
 * Zeilenende, siehe `kundenprofil.css`. So liegt zwischen ihm und dem Stift
 * die ganze restliche Breite und ein Fehlgriff kostet kein Dokument.
 */
function DokumentSymbolKnopf({ art, titel, onClick }: {
  art: "bearbeiten" | "loeschen";
  titel: string;
  onClick: () => void;
}) {
  // Nicht "Symbol" nennen, das ist der Name eines eingebauten Bezeichners.
  const Zeichen = art === "loeschen" ? Trash2 : Pencil;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={titel}
          data-aktion={art}
          onClick={onClick}
          className={`kundenprofil-doksymbol ${art === "loeschen" ? "text-destructive hover:bg-destructive/10" : "text-primary hover:bg-primary/10"}`}
        >
          <Zeichen aria-hidden="true" className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{titel}</TooltipContent>
    </Tooltip>
  );
}

/*
 * Einnahmen-/Ausgaben-Extraktion, Finanzierbarkeitsrechnung und die Auswahl
 * der neuesten Selbstauskunft lagen hier lange als lokale Kopien. Sie sind in
 * die gemeinsamen Module gezogen (finanzierbarkeitUtils.ts, saQuelle.ts),
 * damit Kundenprofil und Kundenportal garantiert dieselben Zahlen zeigen.
 * Die Importe oben behalten die alten lokalen Namen bei
 * (extractFinanzEinkuenfte, extractFinanzAusgaben).
 */

/*
 * `QUICK_ACTIONS` und `SCHNELLZUGRIFF` standen bis zum 16.09.2026 hier.
 * Sie sind zur Aktionsleiste gezogen, weil die Leiste dieselbe Liste braucht
 * und der Test sie sonst nur ueber diese 13.500 Zeilen lange Seite erreichen
 * koennte. Import steht oben.
 */

/**
 * Nach einem Reiterwechsel die Reiterleiste in Sicht holen.
 *
 * Gerollt wird erst nach zwei Bildschirmbildern, aus demselben Grund wie in
 * `rolleNachDemZeichnenNachOben`: Wer sofort rollt, misst noch die alte
 * Ansicht. Das erste Bild bringt den neuen Inhalt, das zweite seinen Aufbau.
 *
 * `block: "nearest"` heisst: nur so weit rollen, bis die Leiste zu sehen ist.
 * Steht sie schon im Bild, passiert nichts. Findet sich die Leiste nicht, wird
 * gar nicht gerollt, denn dann steht ihre Stelle nicht fest.
 */
/** Wie lange der Ankersprung hoechstens auf seinen Abschnitt wartet. */
const ANKER_WARTEN_MS = 3000;

function rolleZurReiterleiste() {
  const rollen = () => {
    const leiste = document.getElementById("kundenprofil-reiterleiste");
    if (!leiste || typeof leiste.scrollIntoView !== "function") return;
    const weicheBewegungAus =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    leiste.scrollIntoView({ behavior: weicheBewegungAus ? "auto" : "smooth", block: "nearest" });
  };
  if (typeof requestAnimationFrame !== "function") {
    rollen();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(rollen));
}

/**
 * Die Reiter des Kundenprofils an genau einer Stelle.
 *
 * Sie stehen hier als Funktion und nicht mehr direkt in der Komponente, weil
 * zwei Stellen dieselbe Antwort brauchen: die Reiterleiste und die Pruefung
 * von `?tab=` aus der Adresse. Ohne eine gemeinsame Quelle koennte eine
 * Setterin ueber die Adresse einen Reiter oeffnen, den ihre Rolle gar nicht
 * hat, etwa die Dokumente.
 *
 * Reihenfolge: Uebersicht, Stammdaten, Investments, Dokumente, Kommunikation,
 * Aktivitaeten. Die Rollenabweichungen bleiben, wie sie waren: Die Setterin
 * sieht nur Stammdaten und die Investments, der Versicherungsexperte weder
 * den Kundenchat noch die Investment-Reiter. Der Kundenchat ist seit Welle 3
 * kein eigener Reiter mehr, deshalb faellt er fuer ihn innerhalb des Reiters
 * "Kommunikation" weg und nicht mehr an der Reiterleiste.
 *
 * Seit Welle 3 steht hier ein einziger Reiter "Kommunikation" statt der beiden
 * Chat-Eintraege. Die waren keine Reiter, sondern Weiterleitungen: Ein Klick
 * sprang auf `/chat` und das Profil war weg.
 *
 * Seit Welle 2 steht hier ein einziger Reiter "Investments" mit der Anzahl als
 * Zaehler. Vorher bekam jedes Investment einen eigenen Reiter, bei drei
 * Investments standen also drei Reiter nebeneinander und die Leiste wuchs mit
 * jedem neuen Vorgang weiter. Welches Investment offen ist, entscheidet jetzt
 * die Auswahl im Reiter selbst.
 */
function baueReiter(
  rolle: string,
  investments: { id: string; nummer: number }[],
  ungeleseneNachrichten = 0,
): { key: string; label: string; draft?: boolean; anzahl?: number; neu?: number }[] {
  const investmentReiter = [
    { key: "investments", label: "Investments", anzahl: investments.length },
  ];
  if (rolle === "setterin") {
    return [{ key: "stammdaten", label: "Stammdaten" }, ...investmentReiter, { key: "empfehlungen", label: "Empfehlungen" }];
  }
  const istVersicherungsexperte = rolle === "versicherungsexperte";
  return [
    { key: "uebersicht", label: "Übersicht" },
    { key: "stammdaten", label: "Stammdaten" },
    // `neu` ist die Zahl ungelesener Nachrichten beider Verlaeufe zusammen,
    // dieselbe Art Zaehler, die die Seitenleiste an ihren Eintraegen zeigt.
    { key: "kommunikation", label: "💬 Kommunikation", neu: ungeleseneNachrichten },
    { key: "dokumente", label: "📁 Dokumente" },
    ...(istVersicherungsexperte ? [] : investmentReiter),
    { key: "empfehlungen", label: "Empfehlungen" },
    { key: "aktivitaeten", label: "Aktivitäten" },
  ];
}

/**
 * Darf diese Rolle den Reiter ueberhaupt oeffnen?
 *
 * Gebraucht fuer `?tab=` aus der Adresse. Ob es das Investment wirklich gibt,
 * klaert spaeter der Sprung ins Investment beziehungsweise `renderContent`.
 */
function istErlaubterReiter(schluessel: string, rolle: string): boolean {
  return baueReiter(rolle, []).some((t) => t.key === schluessel);
}

/**
 * Alte Adressen weiter verstehen.
 *
 * Bis Welle 2 hiess der Reiter eines Investments `inv-<id>`, und genau das
 * stand in `?tab=`. Bis Welle 3 gab es ausserdem `chat-intern` und
 * `chat-kunde`, dazu das ins Leere zeigende `chat` aus dem Kundenportal. Wer
 * sich so eine Adresse gemerkt oder verschickt hat, soll nicht auf einer
 * leeren Uebersicht landen. Rueckgabe: der heutige Reiter, das gemeinte
 * Investment und der gemeinte Verlauf.
 */
function leseReiterAusAdresse(gewuenscht: string | null): {
  tab: string | null;
  investment: string | null;
  verlauf: VerlaufSchluessel | null;
} {
  if (!gewuenscht) return { tab: null, investment: null, verlauf: null };
  if (gewuenscht.startsWith("inv-")) {
    return { tab: "investments", investment: gewuenscht.slice(4), verlauf: null };
  }
  if (gewuenscht === "chat-intern") return { tab: "kommunikation", investment: null, verlauf: "intern" };
  if (gewuenscht === "chat-kunde") return { tab: "kommunikation", investment: null, verlauf: "kunde" };
  if (gewuenscht === "chat") return { tab: "kommunikation", investment: null, verlauf: null };
  return { tab: gewuenscht, investment: null, verlauf: null };
}

/** Der Reiter, mit dem das Profil aufgeht, wenn die Adresse nichts vorgibt. */
function standardReiter(rolle: string): string {
  return "stammdaten";
}

/**
 * Seitengroessen der Aktivitaetenliste auf der Stammdatenseite.
 * Standard sind 5 Eintraege, damit die Stammdaten kurz bleiben. Wer mehr sehen
 * will, stellt die Seitengroesse um oder nutzt "Alle ansehen" in der Blaetterleiste.
 */
const AKTIVITAETEN_SEITENGROESSEN = [5, 10, 25, 50, 100];
const AKTIVITAETEN_SEITENGROESSE_STANDARD = 5;

/**
 * Die Phasenleiste im Investment.
 *
 * Sie stand hier lange als eigene Liste und lief mit `PIPELINE_STUFEN`
 * auseinander: Sie kannte die abgeschafften Stufen "zugewiesen" und
 * "kontaktversuche", und ihr fehlten "nicht_erreicht", "erreicht" und
 * "erstgespraech_geplant". Wer in einer dieser Stufen stand, fiel in der
 * Leiste auf Position null und wurde als frischer Lead mit sieben Prozent
 * Fortschritt angezeigt.
 *
 * Jetzt kommt die Liste aus `FORTSCHRITT_STUFEN` und damit aus derselben
 * Quelle wie das Pipeline-Brett. Auseinanderlaufen ist damit ausgeschlossen.
 */
const PIPELINE_STEPS = FORTSCHRITT_STUFEN;

/**
 * Die Zuordnung Stufe zu Bereich für das Info-Fenster an der Investment-Karte.
 *
 * Sie war handgeschrieben und widersprach dem Code an drei Stellen: Die
 * Selbstauskunft fehlte bei den Neukunden, Fälligkeit und Abrechnung standen
 * bei den Bestandskunden statt in der Abwicklung, und Follow-Up war der
 * Lead-Verwaltung zugeschlagen, obwohl es ein eigener Bereich ist. Maßgeblich
 * ist `getProzessBereichForStufe`, deshalb wird hier gerechnet statt getippt.
 */
const BEREICH_LABELS: { bereich: ProzessBereich; label: string }[] = [
  { bereich: "leadverwaltung", label: "📋 Lead-Verwaltung" },
  { bereich: "followup", label: "🔁 Follow-Up" },
  { bereich: "kontakte", label: "🤝 Kontakte" },
  { bereich: "neukunden", label: "🆕 Neukunden" },
  { bereich: "abwicklung", label: "📦 Abwicklung" },
  { bereich: "bestandskunden", label: "✅ Bestandskunden" },
];

const STUFEN_JE_BEREICH = BEREICH_LABELS.map(({ bereich, label }) => ({
  label,
  stufen: PIPELINE_STEPS.filter((s) => getProzessBereichForStufe(s.key) === bereich).map((s) => s.label),
})).filter((eintrag) => eintrag.stufen.length > 0);

/**
 * Vor-Investment-Stufen: Werden im Kundenprofil als kompakte Lead-Pipeline-Bar
 * angezeigt, solange noch kein Investment existiert. Ab Beratungsgespräch wird
 * automatisch ein Investment eröffnet, danach übernimmt die Investment-Bar
 * die volle Pipeline-Darstellung.
 *
 * Die Stufen stehen ausdrücklich hier statt als `slice` über die Leiste. Ein
 * `slice` hing an Positionen: Sobald jemand die Leiste änderte, verschob sich
 * diese Bar unbemerkt mit und zeigte plötzlich Stufen nach dem
 * Beratungsgespräch.
 */
const LEAD_STUFEN_KEYS = new Set<string>([
  "neuer_lead",
  "nicht_erreicht",
  "erreicht",
  "follow_up",
  "erstgespraech_geplant",
  "erstgespraech_geplant", "erstgespraech",
]);
const LEAD_PIPELINE_STEPS = PIPELINE_STEPS.filter((s) => LEAD_STUFEN_KEYS.has(s.key));

// Map pipeline step keys to their corresponding highlight card IDs for scroll-to
const STEP_TO_CARD_ID: Record<string, string> = {
  beratungsgespraech: "card-erstgespraech",
  // Die Selbstauskunft steht in derselben Karte wie der Bonitaetscheck, sie
  // ist das erste seiner Pflichtdokumente. Ohne diesen Eintrag waere die neue
  // Kachel die einzige, die auf nichts zeigt.
  selbstauskunft: "card-bonitaet",
  bonitaetsunterlagen: "card-bonitaet",
  objektauswahl: "card-objektauswahl",
  // Follow-Up nach der Objektvorstellung: dieselbe Karte wie die Objektauswahl.
  follow_up_objekt: "card-objektauswahl",
  reservierung: "card-reservierung",
  finanzierung: "card-finanzierung",
  notar: "card-notar",
  faelligkeit: "card-abwicklung",
  abrechnung: "card-abwicklung",
  abgeschlossen: "card-abwicklung",
};

/**
 * Die Unternavigation innerhalb eines Investments.
 *
 * Ein Investment ist eine sehr lange Seite. Die Leiste links springt zu der
 * Karte, die zum jeweiligen Abschnitt gehoert. Die Kartenkennungen kommen
 * bewusst aus `STEP_TO_CARD_ID` und werden hier nicht ein zweites Mal
 * getippt, sonst laufen Pipelineleiste und Unternavigation auseinander.
 *
 * Zwei Punkte fallen aus dem Schema:
 * - "Ueberblick" ist keine Pipelinestufe, sondern der Kopf des Investments.
 * - "Kundenordner" hat keine Stufe, die auf ihn zeigt.
 * Bei der Selbstauskunft stehen zwei Kennungen: Vor dem Versand gibt es die
 * eigene Karte "Online-Selbstauskunft", danach steckt die Selbstauskunft als
 * erstes Pflichtdokument in der Bonitaetskarte. Genommen wird, was im
 * Dokument steht.
 */
const INVESTMENT_ABSCHNITTE: { key: string; label: string; karten: string[] }[] = [
  { key: "ueberblick", label: "Überblick", karten: ["card-ueberblick"] },
  { key: "erstgespraech", label: "Erstgespräch", karten: [STEP_TO_CARD_ID.beratungsgespraech] },
  { key: "selbstauskunft", label: "Selbstauskunft", karten: ["card-selbstauskunft", STEP_TO_CARD_ID.selbstauskunft] },
  /*
   * Reihenfolge seit 16.09.2026: erst Objektauswahl und Reservierung, dann
   * Bonität und Bankprüfung. So läuft der Vorgang tatsächlich ab.
   *
   * Ein Punkt fällt dabei auf: Die Bonitätskarte liegt im Aufbau der Seite
   * weiter OBEN als die Objektauswahl. Ein Klick auf „Bonität und
   * Bankprüfung" springt deshalb nach oben und nicht nach unten. Die Leiste
   * zeigt hier bewusst den Ablauf und nicht die Reihenfolge auf dem
   * Bildschirm; die Karte zu verschieben wäre ein sehr großer Eingriff in
   * diese Seite.
   */
  { key: "objektauswahl", label: "Objektauswahl", karten: [STEP_TO_CARD_ID.objektauswahl] },
  { key: "reservierung", label: "Reservierung", karten: [STEP_TO_CARD_ID.reservierung] },
  { key: "bonitaet", label: "Bonität und Bankprüfung", karten: [STEP_TO_CARD_ID.bonitaetsunterlagen] },
  { key: "finanzierung", label: "Finanzierung", karten: [STEP_TO_CARD_ID.finanzierung] },
  { key: "notar", label: "Notar", karten: [STEP_TO_CARD_ID.notar] },
  { key: "abwicklung", label: "Abwicklung", karten: [STEP_TO_CARD_ID.abrechnung] },
  { key: "kundenordner", label: "Kundenordner", karten: ["card-kundenordner"] },
];

// Grundliste kommt aus src/lib/bankpruefungDocs.ts und haengt an der
// Beschaeftigungsart aus der Selbstauskunft.

/**
 * Wartezeit nach dem Notartermin, bevor die Pipeline auf Fälligkeit springt.
 *
 * Die Beurkundung dauert. Ohne Puffer wechselte die Stufe in der Sekunde, in
 * der der Termin beginnt, und der Kunde galt als beurkundet, während er noch
 * beim Notar sitzt.
 */
const NOTAR_PUFFER_MS = 60 * 60 * 1000;

/**
 * Alle Stufen vor der Selbstauskunft.
 *
 * Steuert zwei Dinge: das Anheben auf "Selbstauskunft", sobald die SA beim
 * Kunden ist, und die Sichtbarkeit der NoShow-Hinweise, die ab der
 * Selbstauskunft veraltet sind.
 *
 * Die Menge stand als handgepflegte Liste da und war unvollständig. Sie kannte
 * noch die abgeschaffte Stufe "kontaktversuche", und ihr fehlten
 * "nicht_erreicht", "erreicht" und "erstgespraech_geplant". Ein Lead in diesen
 * Stufen wurde beim Versand der Selbstauskunft nicht angehoben.
 *
 * Jetzt aus der Reihenfolge abgeleitet. Die Stufen ohne eigenes Kästchen
 * kommen ausdrücklich dazu, weil hier teils die rohe, nicht normalisierte
 * Stufe aus dem Datensatz ankommt.
 */
const PRE_SA_PIPELINE_STEPS = new Set<string>([
  ...PIPELINE_STEPS
    .slice(0, PIPELINE_STEPS.findIndex((s) => s.key === "selbstauskunft"))
    .map((s) => s.key),
  "eg_noshow",
  "bg_noshow",
  "zugewiesen",
  "kontaktversuche",
  "vermoegensaufbau",
]);

/**
 * Ab welcher Stufe der Bonitaetscheck aufgedeckt wird.
 *
 * Vorher entschied das eine Positivliste der Stufen "vor der Selbstauskunft".
 * Die war unvollstaendig: "zugewiesen" fehlte, ebenso "selbstauskunft", und
 * genau diese Stufe bedeutet, dass die Selbstauskunft erst noch ansteht. Ein
 * Investment dort galt als fortgeschritten, und der Bonitaetscheck lag offen,
 * obwohl niemand die Selbstauskunft auch nur geoeffnet hatte.
 *
 * Jetzt entscheidet die Reihenfolge der Pipeline statt einer Liste, die
 * jemand pflegen muss. Eine Stufe, die hier gar nicht vorkommt, gilt als ganz
 * vorne und damit als zugedeckt. Das ist die sichere Richtung: Lieber einmal
 * zu viel zugedeckt als Unterlagen aufgedeckt, die noch niemand angefasst hat.
 */
const BONITAET_AB_INDEX = PIPELINE_STEPS.findIndex((s) => s.key === "bonitaetsunterlagen");

// Alle drei Funktionen gehen über `fortschrittsRang`. Der kennt auch die
// Stufen ohne eigenes Kästchen (NoShow, Legacy-Aliase) und hält an der
// sicheren Richtung fest: Unbekanntes gilt als ganz vorne.
function pipelineRang(stufe?: string | null): number {
  return fortschrittsRang(stufe);
}

function getInvPipelineStep(inv: Investment): number {
  return fortschrittsRang(inv.pipelineStufe || "erstgespraech_geplant");
}

function getPipelineStep(kunde: KundeData): number {
  // Effektive Stufe = MAX(kontakt.pipelineStufe, höchste Investment-Stufe).
  // Sonst driften Kontakt- und Investment-Stufe auseinander (Pipeline zeigt
  // Investment-Stufe, Profil-Header zeigt Kontakt-Stufe).
  return fortschrittsRang(getEffectivePipelineStufe(kunde) || "erstgespraech_geplant");
}

/**
 * Kennzeichnung fuer eine Stufe, zu der der Kunde nicht erschienen ist.
 *
 * Ein NoShow ist ein Rückschlag, kein Fortschritt. Die Leiste bleibt deshalb
 * beim zugehörigen Gespräch stehen. Ohne diese Kennzeichnung sähe das aus, als
 * hätte das Gespräch stattgefunden. Farbe und Form sind dieselben wie beim
 * internen Grundschuld-Hinweis weiter unten in der Leiste.
 */
function NichtErschienenBadge() {
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0.5 italic border-dashed bg-destructive/10 text-destructive border-destructive/40"
      title="Termin war angesetzt, der Kunde ist nicht erschienen"
    >
      <XCircle className="mr-1 h-2.5 w-2.5" />
      nicht erschienen
    </Badge>
  );
}

/** Klassen fuer das aktuelle Kaestchen, wenn der Termin geplatzt ist. */
const NOSHOW_BADGE_CLASS =
  "bg-destructive text-destructive-foreground border-destructive text-xs px-2.5 py-1 font-semibold ring-2 ring-destructive/30";

type DocStatus = "none" | "uploaded" | "approved" | "rejected";

// Modulweiter Guard gegen Mehrfach-Feuern der Auto-Advance-Blöcke in
// renderInvestment. Diese laufen während des Renderns, und da
// updateInvestment/updateKontakt asynchron in den Cache schreiben, kann
// derselbe Übergang mehrfach ausgelöst werden (siehe Marvin Greifenstein:
// fünf identische "SA unterschrieben → Objektauswahl"-Einträge innerhalb
// von 300ms). Der Guard merkt sich `${invId}:${targetStufe}` und blockt
// den zweiten Trigger.
const autoAdvancedInvestments = new Set<string>();
function tryAutoAdvance(invId: string, target: string): boolean {
  const key = `${invId}:${target}`;
  if (autoAdvancedInvestments.has(key)) return false;
  autoAdvancedInvestments.add(key);
  return true;
}

/**
 * Legt eine Glocken-Benachrichtigung an und meldet ehrlich zurueck, ob sie
 * angekommen ist. Die Funktion wirft nie: der ausloesende Vorgang (etwa eine
 * Lead-Zuweisung) soll nicht scheitern, nur weil die Nachricht nicht durchging.
 * Der Aufrufer muss den Rueckgabewert pruefen und dem Nutzer sagen, dass er den
 * Vertriebspartner selbst anschreiben muss.
 *
 * Bewusst kein `notifyUser` aus `bellNotifications`: das schluckt Fehler
 * absichtlich und kann deshalb gar nicht melden, ob die Nachricht ankam.
 */
async function benachrichtigungAnlegen(eintrag: {
  benutzer_id: string;
  titel: string;
  nachricht: string;
  link: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from("benachrichtigungen").insert(eintrag);
    if (error) {
      console.error("[Benachrichtigung] konnte nicht angelegt werden:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Benachrichtigung] konnte nicht angelegt werden:", e);
    return false;
  }
}

/**
 * Glocke an Admin und Inhaber, mit Fehlerprüfung (M10, 04.10.2026).
 *
 * Für Anfragen, die nur die Leitung beantworten kann (Löschung oder
 * Bearbeitung einer Reservierung), und die Meldung „Notartermin
 * eingetragen“. Jede Person bekommt sie einmal, auch mit beiden Rollen.
 * Rückgabe `true`, wenn sie bei mindestens einer Person angekommen ist.
 * Vorher meldete die Seite „gesendet“, auch wenn die Rollenliste nicht lesbar
 * war oder kein Eintrag angelegt werden konnte.
 */
async function glockeAnAdmins(titel: string, nachricht: string, link: string): Promise<boolean> {
  const { data, error } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "inhaber"]);
  if (error) {
    console.error("[Benachrichtigung] Admins nicht lesbar:", error);
    return false;
  }
  const empfaenger = [...new Set((data || []).map((r: { user_id: string }) => r.user_id).filter(Boolean))];
  if (empfaenger.length === 0) return false;
  const angekommen = await Promise.all(
    empfaenger.map((benutzer_id) => benachrichtigungAnlegen({ benutzer_id, titel, nachricht, link })),
  );
  return angekommen.some(Boolean);
}

/*
 * Ab welcher Stufe Finanzierung und Notar bedienbar sind, steht seit dem
 * 25.09.2026 als FREIGESCHALTET_AB_RESERVIERUNG in
 * `src/lib/investmentFreischaltung.ts`, zusammen mit der einen Regel fuer die
 * Finanzierung (`finanzierungIntern`).
 */

export default function KundenDetail() {
  /*
   * Fuer welchen Kunden der Hintergrund-Abgleich schon gelaufen ist.
   *
   * Der Ladeeffekt weiter unten haengt an `_liveV`, der Versionsnummer des
   * Zwischenspeichers. Genau diese Nummer erhoehen `refreshKontaktFromDb` und
   * `refreshInvestmentsFromDb` aber selbst, wenn sie ihre Ergebnisse ablegen.
   * Der Effekt loeste sich also selbst wieder aus, und zwar ohne Ende: gemessen
   * rund 25 Abfragen je Sekunde, solange ein Kundenprofil offen stand.
   *
   * Der Merker bricht den Kreis an der einzigen Stelle, an der er entsteht.
   * Die Abhaengigkeit `_liveV` bleibt bestehen, denn sie hat ihren Sinn:
   * Aenderungen an anderer Stelle sollen die Seite weiterhin auffrischen.
   */
  const abgeglichenFuer = useRef<string | null>(null);
  /*
   * Objektdaten, die vor dem Sprung auf Reservierung, Bonitaetsunterlagen oder
   * Finanzierung feststehen muessen. Der Dialog erscheint nur, wenn sie fehlen.
   */
  const navigate = useNavigate();
  const ort = useLocation();

  /*
   * Der Rueckweg aus dem Kundenprofil.
   *
   * Im Regelfall ein Schritt zurueck in der Verlaufsgeschichte. Wer aus der
   * Pipeline oder aus einer Kontaktliste hierhergeklickt hat, landet damit
   * wieder genau dort, wo er war, samt Bildlauf und gesetzten Filtern. Das
   * ist der Grund, warum hier nicht pauschal eine feste Seite steht.
   *
   * Die Ausnahme ist der Sprung aus der globalen Suche, gemeldet von
   * Christian am 16.09.2026. Dabei ist die vorherige Seite reiner Zufall und
   * hat mit dem Kunden nichts zu tun. Die Suche vermerkt ihren Sprung
   * deshalb, und dann fuehrt der Knopf in die vollstaendige Kontaktliste.
   */
  /*
   * Kam der Nutzer ueber die globale Suche hierher?
   *
   * Christians Entscheidung vom 16.09.2026: Dann gibt es keinen
   * Zurueck-Knopf. Die Suche ist ein Sprung von irgendwoher, die vorherige
   * Seite ist reiner Zufall und hat mit dem Kunden nichts zu tun. Ein Knopf,
   * der auf eine zufaellige Seite fuehrt, ist schlechter als keiner.
   *
   * Wer regulaer aus der Pipeline oder einer Kontaktliste kommt, bekommt ihn
   * wie bisher, und er fuehrt einen Schritt zurueck. Damit landet man genau
   * dort, wo man war, samt Bildlauf und gesetzten Filtern. Genau deshalb
   * steht hier kein festes Ziel.
   */
  const ausSuche = Boolean((ort.state as { ausSuche?: boolean } | null)?.ausSuche);
  const { id } = useParams();
  const { toast } = useToast();
  const { user, authUser } = useUser();

  // Beim Öffnen eines Kunden-/Lead-Profils das Sidebar-Badge reduzieren:
  // Item als "gesehen" markieren für sowohl Lead-Verwaltung als auch VP-Kontakte.
  useEffect(() => {
    if (!id) return;
    import("@/lib/seenBadges").then(({ markItemSeen, SEEN_KEYS }) => {
      markItemSeen(SEEN_KEYS.leadVerwaltung, id);
      markItemSeen(SEEN_KEYS.vpKontakte, id);
    });
  }, [id]);

  // Zugriff auf Kontaktdaten fürs Bulk-Access-Monitoring protokollieren.
  // Löst serverseitig eine Warnung aus, wenn ein Nutzer in kurzer Zeit
  // ungewöhnlich viele Kontakte öffnet (potentieller Daten-Abzug).
  useEffect(() => {
    if (!id) return;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      void supabase.rpc("log_kontakt_view", { _kontakt_id: id, _feld: "profil" }).then(() => {}, () => {});
    });
  }, [id]);

  const setterSkriptRef = useRef<SetterErstgespraechsSkriptHandle | null>(null);
  const [erstgespraechSummaryOpen, setErstgespraechSummaryOpen] = useState(false);
  /**
   * Detailansicht der einzelnen Immobilien. Die Daten werden beim Klick
   * mitgegeben, weil sie je Investment aus einer eigenen Selbstauskunft
   * stammen und der Dialog nicht wissen kann, welche gemeint ist.
   */
  const [immoDetail, setImmoDetail] = useState<Immobilienvermoegen | null>(null);

  const [kunde, setKunde] = useState<KundeData | undefined>(() => getKontaktById(id || ""));
  const [loadingKunde, setLoadingKunde] = useState(() => !!id && !getKontaktById(id || ""));
  /*
   * Der Reiter steht in der Adresse.
   *
   * Elf Stellen im CRM verlinken bereits auf `?tab=...`, gelesen wurde der
   * Wert nie: Ein Neuladen landete immer wieder in den Stammdaten. Jetzt
   * entscheidet die Adresse, sofern sie einen Reiter nennt, den die Rolle auch
   * haben darf. Die Sprungziele `?investment=`, `?anruf=1`, `?autoSendSA=`
   * und der Anker `#objektauswahl` haben weiterhin Vorrang, sie setzen den
   * Reiter in ihren eigenen Effekten und ueberschreiben diesen Startwert.
   */
  const aktivitaetenLeiste = useAktivitaetenLeiste();
  const offeneAufgabenKachel = useOffeneAufgabenKachel();
  const naechsteAktionKachel = useNaechsteAktionKachel();
  const offeneAufgabenVersion = useLiveVersion(OFFENE_AUFGABEN_TABELLEN);
  const profilKennzahlenBereit = useCacheReady(PROFIL_KENNZAHL_TABELLEN);
  const profilAktivitaetenBereit = useCacheReady(PROFIL_AKTIVITAETEN_TABELLEN);
  const [activeTab, setActiveTab] = useState(() => {
    const { tab } = leseReiterAusAdresse(new URLSearchParams(window.location.search).get("tab"));
    if (tab && istErlaubterReiter(tab, user.role as string)) return tab;
    return standardReiter(user.role as string);
  });

  /**
   * Welches Investment im Reiter "Investments" geoeffnet ist.
   *
   * `null` heisst: die Liste aller Investments. Der Startwert kommt aus der
   * Adresse, damit ein Link mit `?investment=` sofort im richtigen Vorgang
   * landet und nicht erst nach dem Nachladen der Investments umspringt.
   */
  const [gewaehltesInvestment, setGewaehltesInvestment] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("investment") || leseReiterAusAdresse(params.get("tab")).investment;
  });

  /**
   * Welcher der beiden Verlaeufe im Reiter "Kommunikation" vorausgewaehlt ist.
   *
   * Nur der Startwert aus der Adresse. Danach entscheidet die Liste im Reiter
   * selbst, deshalb steht das hier bewusst nicht als laufender Zustand.
   */
  const [verlaufVorauswahl] = useState<VerlaufSchluessel | null>(
    () => leseReiterAusAdresse(new URLSearchParams(window.location.search).get("tab")).verlauf,
  );

  /**
   * Ein Investment oeffnen.
   *
   * Seit Welle 2 gibt es nur noch einen Reiter fuer alle Investments, deshalb
   * gehoeren Reiter und Auswahl immer zusammen gesetzt. Wer nur eines von
   * beiden setzt, landet auf der Liste statt im Vorgang.
   *
   * Der Vorgang beginnt am Anfang, deshalb rollt die Seite nach oben. Ein
   * echter Seitenwechsel ist das hier naemlich nicht: Es werden nur zwei
   * Zustaende gesetzt und die Adresse mit `replaceState` nachgezogen. Der
   * Browser hat also keinen Anlass, von sich aus nach oben zu springen, und
   * behaelt die Rollposition der Liste. Gemeldet von Christian: man landet
   * mitten im Investment statt an seinem Anfang.
   *
   * `nachObenRollen: false` setzt, wer danach selbst ein Ziel im Investment
   * ansteuert, etwa die Objektauswahl oder einen Abschnitt der Unternavigation.
   * Sonst rollt die Seite erst nach oben und kurz darauf wieder nach unten.
   */
  const oeffneInvestment = (invId: string, optionen?: { nachObenRollen?: boolean }) => {
    setGewaehltesInvestment(invId);
    setActiveTab("investments");
    if (optionen?.nachObenRollen === false) return;
    /*
     * Zur Reiterleiste, nicht an den Seitenanfang.
     *
     * Bis zum 17.09.2026 sprang das Oeffnen eines Investments ganz nach oben.
     * Am Schreibtisch faellt das kaum auf, dort steht die Leiste weit oben.
     * Auf dem Handy liegen Person und Kacheln davor, also landete man rund
     * 380 Pixel oberhalb dessen, was man gerade angeklickt hatte, und musste
     * jedes Mal wieder hinunterscrollen. Christian hat es gemeldet.
     *
     * `rolleZurReiterleiste` rollt mit `block: "nearest"`, also nur so weit
     * wie noetig: Steht die Leiste schon im Bild, passiert gar nichts. Damit
     * bleibt der Grund der alten Loesung erhalten (wer tief im Investment
     * stand, saehe sonst die Mitte des neuen Inhalts), ohne den Sprung.
     */
    rolleZurReiterleiste();
  };

  /**
   * Zurueck auf die Liste aller Investments.
   *
   * Aus demselben Grund wie beim Oeffnen: ohne echten Seitenwechsel bliebe man
   * an der Stelle stehen, an der man im Investment gerade war, und saehe von
   * der Liste nur ihr unteres Ende.
   */
  const zurueckZurInvestmentListe = () => {
    setGewaehltesInvestment(null);
    /*
     * Dasselbe beim Zurueckgehen: Die Liste aller Investments soll im Bild
     * stehen, nicht der Seitenanfang. Christians Worte: „es muss aber auch
     * dann wieder die Uebersicht aller Investments direkt am Sichtbereich
     * anzeigen".
     */
    rolleZurReiterleiste();
  };

  /**
   * Reiter wechseln.
   *
   * Auch der Reiterwechsel tauscht nur den Inhalt aus. Wer weit unten in den
   * Stammdaten stand und auf "Investments" klickt, saehe sonst die Mitte des
   * neuen Reiters, und die Reiterleiste selbst waere ausser Sicht.
   *
   * Bis zum 17.09.2026 rollte der Wechsel deshalb an den Anfang der Seite.
   * Am Schreibtisch stimmt das, dort steht die Reiterleiste ganz oben. Auf dem
   * Telefon steht sie weit unten, denn Person und Kacheln liegen davor.
   * Christian musste nach jedem Wechsel erneut hinunterrollen.
   *
   * Jetzt wird nicht mehr an den Anfang gerollt, sondern zur Reiterleiste
   * selbst, und zwar nur so weit wie noetig (`block: "nearest"`). Ist die
   * Leiste ohnehin zu sehen, geschieht gar nichts. Genau das ist am
   * Schreibtisch der Regelfall, dort bleibt das Verhalten also unveraendert.
   *
   * Warum nicht einfach eine klebende Reiterleiste? Sie haette dieselbe Stelle
   * dauerhaft belegt: rund 56 Pixel von 812, und auf dem Investment liegt
   * darunter schon das ebenfalls klebende Sprungmenue. Zwei Leisten
   * uebereinander sind auf einem Telefon zu viel. Ausserdem sitzt die Leiste
   * in `.kundenprofil-arbeitskarte`, deren Inhalt waagerecht rollen darf, und
   * `position: sticky` bricht in rollenden Vorfahren gern still. Das Rollen an
   * die richtige Stelle kostet nichts und kann nicht danebengehen.
   */
  const wechsleReiter = (reiter: string) => {
    setActiveTab(reiter);
    rolleZurReiterleiste();
  };

  /*
   * Reiterwechsel zurueck in die Adresse schreiben.
   *
   * Mit `replace`, damit der Zurueck-Knopf des Browsers nicht Reiter fuer
   * Reiter rueckwaerts laeuft, sondern zur vorherigen Seite fuehrt.
   * Eine Ausnahme bleibt: Nach dem Wegnavigieren gehoert der Reiter nicht mehr
   * in die fremde Adresse. Die zweite Ausnahme fuer `chat-intern` und
   * `chat-kunde` ist mit Welle 3 entfallen, die beiden sind keine
   * Weiterleitungen mehr, sondern der Reiter "Kommunikation".
   */
  useEffect(() => {
    if (!id || !window.location.pathname.includes(id)) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === activeTab) return;
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", url.toString());
  }, [activeTab, id]);

  /*
   * Das gewaehlte Investment steht ebenfalls in der Adresse, im schon
   * vorhandenen Parameter `?investment=`. So laesst sich ein einzelner Vorgang
   * verlinken, und ein Neuladen bleibt darin stehen. Zurueck auf die Liste
   * loescht den Parameter wieder, sonst zeigte der Link weiter ins Investment.
   */
  useEffect(() => {
    if (!id || !window.location.pathname.includes(id)) return;
    const url = new URL(window.location.href);
    const inAdresse = url.searchParams.get("investment");
    if ((gewaehltesInvestment || null) === (inAdresse || null)) return;
    if (gewaehltesInvestment) url.searchParams.set("investment", gewaehltesInvestment);
    else url.searchParams.delete("investment");
    window.history.replaceState({}, "", url.toString());
  }, [gewaehltesInvestment, id]);

  /*
   * Die Rolle steht beim ersten Rendern noch nicht fest, sie wird nachgeladen.
   * Zeigt der Reiter danach auf etwas, das diese Rolle gar nicht haben darf,
   * geht es zurueck auf ihren Startreiter. Ohne das saehe eine Setterin nach
   * dem Laden eine Leiste ohne markierten Reiter.
   */
  useEffect(() => {
    if (istErlaubterReiter(activeTab, user.role as string)) return;
    setActiveTab(standardReiter(user.role as string));
  }, [activeTab, user.role]);

  /**
   * Springt zur Objektauswahl dieses Investments und hebt sie hervor.
   *
   * Wird gebraucht, wo ein Stufenwechsel blockiert wird, weil das Objekt noch
   * fehlt. Der Reiter wird mitgesetzt, sonst zeigt die Seite den Abschnitt gar
   * nicht an.
   */
  const springeZuObjektauswahl = (invId: string) => {
    // Kein Sprung nach oben: gleich unten wird die Objektauswahl angesteuert.
    oeffneInvestment(invId, { nachObenRollen: false });
    setTimeout(() => {
      const el = document.getElementById(`card-objektauswahl-${invId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      markiereProfilAbschnitt(el);
    }, 300);
  };
  // Trigger zum Hervorheben der "Nächste Schritte"-Karte im Investment-Tab,
  // wenn der Nutzer aus den Stammdaten via "Investment XY öffnen" springt.
  const [highlightInvSteps, setHighlightInvSteps] = useState<{ id: string; ts: number } | null>(null);
  /**
   * Die Aktivitaeten zerfallen in drei Gruppen, nicht in eine Liste.
   *
   * Julian Meyer hat es angestossen: wer im Kundenprofil nach einer Notiz
   * sucht, scrollt sonst an Anrufen, Protokollen und automatischen
   * Systemeintraegen vorbei. Und die drei Gruppen beantworten verschiedene
   * Fragen. Die Notizen sagen, was jemand festgehalten hat. Die manuellen
   * Vorgaenge sagen, was jemand getan hat. Das System-Protokoll sagt, was die
   * Anwendung selbst getan hat, und ist Nachweis, kein Arbeitsmaterial.
   *
   * Standard sind die Notizen.
   */
  const [aktivitaetenAnsicht, setAktivitaetenAnsicht] =
    useState<"notizen" | "manuell" | "system">("notizen");
  const [aktivitaetenFilter, setAktivitaetenFilter] = useState("alle");
  const [actionDialog, setActionDialog] = useState<AktivitaetEntry["art"] | null>(null);
  // Wurde das offene Anruf-Protokoll durch einen gestarteten Anruf geöffnet?
  // Dann fragt der Dialog beim Schließen ohne Speichern nach.
  const [anrufGestartet, setAnrufGestartet] = useState(false);
  // Steuerung des Dialogs „Meeting erstellen" (Schnellaktion ohne Videocall-Freigabe)
  const [meetingQuickOpen, setMeetingQuickOpen] = useState(false);
  // Aktivitäten via Realtime: useLiveData abonniert die `aktivitaeten`-Tabelle und re-rendert
  // automatisch bei INSERT/UPDATE/DELETE. Mapping von DB-Row -> AktivitaetEntry inline.
  const aktivitaetenRows = useLiveData<any>("aktivitaeten", (r) => r.kunde_id === id);
  // Der firmenweite Cache laedt nur die neuesten 20000 Aktivitaeten. Aeltere
  // Eintraege dieses Kunden (z. B. Notizen von Anfang Juli) fielen sonst
  // kommentarlos aus dem Verlauf. Deshalb beim Oeffnen gezielt nachladen.
  useEffect(() => {
    if (!id) return;
    void cacheLadeZeilenFuer("aktivitaeten", "kunde_id", id);
    void cacheLadeZeilenFuer("activity_log", "kontakt_id", id);
  }, [id]);
  // Zentrales Audit-Log (activity_log) – DB-Trigger schreiben hier alles Wichtige:
  // Pipeline-Wechsel, Follow-Up-Änderungen, Aufgaben-Status, E-Mails etc.
  const activityLogRows = useLiveData<any>("activity_log", (r) => r.kontakt_id === id);
  // Echte Aufgaben des Kunden (Tabelle `aufgaben`). Gebraucht, um offene
  // Aufgaben ohne Aktivitätseintrag wieder in der Zeitleiste zu zeigen.
  const aufgabenZeilen = useLiveData<{ kontakt_id?: string | null }>(
    "aufgaben",
    (r) => r.kontakt_id === id,
  );
  const aktivitaeten = useMemo<AktivitaetEntry[]>(() => {
    const manual = aktivitaetenRows
      .map((r): AktivitaetEntry => ({
        id: r.id, kundeId: r.kunde_id, art: r.art, beschreibung: r.beschreibung || "",
        details: r.details || undefined, von: r.von || "", datum: r.datum || "",
        prioritaet: r.prioritaet || undefined, faelligAm: r.faellig_am || undefined,
        uhrzeit: r.uhrzeit || undefined, zugewiesenAn: r.zugewiesen_an || undefined,
        dauer: r.dauer || undefined, ergebnis: r.ergebnis || undefined,
        teilnehmer: r.teilnehmer || undefined, zoomLink: r.zoom_link || undefined,
        erledigtAm: r.erledigt_am || undefined,
        // Der Ersteller entscheidet mit, ob der Bearbeitungsstift erscheint.
        benutzerId: r.benutzer_id || undefined,
        // Favorit, fehlt ohne Migration 20260928210000 und ist dann leer.
        angepinntAm: r.angepinnt_am || undefined,
        angepinntVon: r.angepinnt_von || undefined,
      }));
    const audit = activityLogRows.map((r): AktivitaetEntry => {
      const cat = categorizeActivityAction(r.action);
      // Kategorie → art-Mapping für Filter-Konsistenz
      const art: AktivitaetEntry["art"] =
        cat === "kommunikation" ? "email" :
        cat === "prozess"       ? "aufgabe" :
        cat === "dokument"      ? "notiz" :
        cat === "daten"         ? "notiz" :
                                  "notiz";
      return {
        id: `log-${r.id}`,
        kundeId: r.kontakt_id,
        art,
        beschreibung: describeActivityAction(r.action, r.meta || {}, r.changes || {}),
        details: r.actor_role ? `System-Log · ${r.actor_role}` : "System-Log",
        von: r.actor_name || "System",
        datum: r.created_at,
      };
    });
    /*
     * Offene Aufgaben, deren Aktivitätseintrag fehlt oder gelöscht wurde.
     *
     * Der Papierkorb der Zeitleiste hat früher nur den Aktivitätseintrag
     * entfernt. Die echte Aufgabe blieb offen, bestimmte weiter die Anzeige
     * hinter dem Namen, war aber nirgends mehr zu sehen (Ayce Özgün Özler:
     * unten nur noch der 17.09., oben weiter der 14.09.). Solche Waisen
     * erscheinen jetzt wieder als Eintrag und lassen sich bearbeiten und
     * löschen. Der Schlüssel Titel+Tag ist die Umkehrung der Entdopplung in
     * kontaktTermine, so entsteht beim normalen Anlegen keine Dublette.
     */
    let verwaiste: AktivitaetEntry[] = [];
    try {
      const vorhandeneEintraege = manual.filter((m) => m.art === "aufgabe" || m.art === "meeting");
      const vorhandene = new Set(vorhandeneEintraege.map((m) => aufgabenSchluessel(m.beschreibung, m.faelligAm)));
      // Aufgaben, die über meeting_aktivitaet_id an einem Meeting hängen, stehen
      // schon mit diesem Meeting im Verlauf, auch wenn ihr Titel abweicht.
      const vorhandeneIds = new Set(vorhandeneEintraege.map((m) => m.id));
      const nameZu = (uid?: string) => {
        if (!uid) return "";
        try { return loadAllUsers().find((u) => u.id === uid)?.name || ""; } catch { return ""; }
      };
      verwaiste = offeneAufgabenOhneAktivitaet(id || "", vorhandene, vorhandeneIds).map((a): AktivitaetEntry => ({
        // Das Präfix kennzeichnet den Eintrag als direkte Sicht auf die
        // Tabelle `aufgaben`; Stift und Papierkorb erkennen ihn daran.
        id: `aufgabe-${a.id}`,
        kundeId: a.kontaktId || "",
        art: a.typ === "meeting" ? "meeting" : "aufgabe",
        beschreibung: a.titel,
        details: a.beschreibung,
        von: a.erstelltVonName || nameZu(a.benutzerId) || "Unbekannt",
        datum: a.erstelltAm || a.faelligAm || "",
        prioritaet: a.prioritaet,
        faelligAm: a.faelligAm,
        uhrzeit: a.uhrzeit,
        zugewiesenAn: nameZu(a.zugewiesenAn) || undefined,
        benutzerId: a.benutzerId,
      }));
    } catch { /* Aufgaben-Cache noch nicht bereit: dann ohne Waisen rendern. */ }
    return [...manual, ...verwaiste, ...audit].sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
    // aufgabenZeilen steht bewusst in den Abhängigkeiten: Die Waisen kommen
    // über offeneAufgabenOhneAktivitaet aus dem Cache, und ohne die Zeilen als
    // Auslöser bliebe die Liste nach einer Aufgaben-Änderung stehen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivitaetenRows, activityLogRows, aufgabenZeilen, id]);
  // Legacy-Setter als No-Op (alte Aufrufstellen kompatibel halten – Realtime übernimmt)
  const setAktivitaeten = (_: any) => {};
  // Was die Anwendung selbst geschrieben hat, steht seit dem 16.09.2026 in
  // `lib/aktivitaetRechte.ts`: Dieselbe Unterscheidung entscheidet jetzt auch
  // darueber, wer einen Eintrag bearbeiten und entfernen darf.

  /** Von Hand geschriebene Notiz. */
  const istNotiz = (a: AktivitaetEntry) => a.art === "notiz" && !istSystemEintrag(a);

  /** Von Hand angelegt, aber keine Notiz: Aufgabe, Meeting, Anruf, Protokoll, Mail. */
  const istManuell = (a: AktivitaetEntry) => !istSystemEintrag(a) && a.art !== "notiz";

  /**
   * Automatische Stufenwechsel gehoeren nicht in den Rendervorgang.
   *
   * Die Auto-Advance-Bloecke unten stehen in renderInvestment(), also mitten im
   * Rendern. Jeder Durchlauf, bei dem die Bedingung noch zutraf, hat erneut
   * geschrieben: Datenbank-Update, Aktivitaet, reloadKunde(). reloadKunde()
   * loeste den naechsten Render aus, und weil die neue Stufe noch nicht
   * angekommen war, lief dasselbe nochmal. Bei Marvin Greifenstein standen
   * dadurch dutzende identische Eintraege zur selben Minute.
   *
   * Zwei Riegel dagegen: tryAutoAdvance sorgt dafuer, dass ein Uebergang je
   * Sitzung genau einmal laeuft, und setTimeout schiebt die Arbeit aus dem
   * Render heraus. Der Riegel allein reicht nicht, denn Schreiben waehrend
   * des Renderns bleibt auch dann falsch.
   */
  const stufenwechsel = (invId: string, ziel: string, ausfuehren: () => void) => {
    if (!tryAutoAdvance(invId, ziel)) return;
    setTimeout(ausfuehren, 0);
  };

  /**
   * Welches Ereignis diese Seite in dieser Sitzung schon festgehalten hat.
   *
   * Zwei Stellen schreiben denselben Eintrag: die Wachschleife, sobald eine
   * Unterschrift eingeht, und der automatische Stufenwechsel, sobald die
   * Unterschrift im Zwischenspeicher steht. Beide fragen vorher, ob der
   * Eintrag schon da ist, aber beide fragen den gespeicherten Stand, und der
   * kennt einen Eintrag noch nicht, der gerade erst geschrieben wird. Wer
   * zuerst kommt, beansprucht das Ereignis hier, und der zweite laesst es.
   *
   * Der Merker gilt nur fuer diese Sitzung. Ueber einen Seitenaufruf hinweg
   * traegt die Pruefung gegen die bereits gespeicherten Eintraege.
   */
  const notierteEreignisse = useRef<Set<string>>(new Set());
  const beansprucheEreignis = (text: string) => {
    const schluessel = `${id || ""}:${text}`;
    if (notierteEreignisse.current.has(schluessel)) return false;
    notierteEreignisse.current.add(schluessel);
    return true;
  };

  /**
   * Schreibt eine System-Notiz nur, wenn dasselbe Ereignis noch nicht in der
   * Akte steht.
   *
   * Faengt den Fall ab, dass die Seite spaeter erneut geoeffnet wird und ein
   * Uebergang dort ein zweites Mal ausgeloest wuerde.
   *
   * Verglichen wird gegen ALLE Formulierungen des Ereignisses, also auch gegen
   * die frueheren. Die Texte haben sich am 22.09.2026 geaendert, weil Ereignis
   * und Stufenwechsel jetzt getrennt festgehalten werden. Ohne die alten
   * Formulierungen haette jeder laufende Vorgang einmalig einen zweiten,
   * gleichbedeutenden Eintrag bekommen.
   */
  const notiereEinmal = (notiz: ProzessNotiz) => {
    if (istSchonNotiert(aktivitaeten.map(a => a.beschreibung), notiz)) return;
    if (!beansprucheEreignis(notiz.text)) return;
    addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: notiz.text, von: "System" });
  };

  /**
   * Das Ereignis und der Stufenwechsel, als zwei Eintraege.
   *
   * Frueher stand beides in einem Satz: „Reservierungsvereinbarung vom Kunden
   * unterschrieben → Bonitaetsunterlagen". Die Zielstufe wird aber berechnet
   * und ist bei einem Selbstfinanzierer „Finanzierung". Der Satz behauptete
   * trotzdem immer „Bonitaetsunterlagen", weil er fest getippt war. Zwei
   * Eintraege koennen nicht auseinanderlaufen: Der zweite nennt den Namen der
   * Stufe, die wirklich gesetzt wurde.
   */
  const notiereStufenwechsel = (ereignis: ProzessNotiz, zielStufe: string) => {
    notiereEinmal(ereignis);
    notiereEinmal(stufenwechselNotiz(zielStufe));
  };

  // Favoriten stehen oben, jede Notiz genau einmal. Nur Notizen koennen
  // Favoriten sein, und Notizen stehen nur im Reiter „Notizen“.
  const notizen = useMemo(() => angepinnteZuerst(aktivitaeten.filter(istNotiz)), [aktivitaeten]);
  const manuelleAktivitaeten = useMemo(() => aktivitaeten.filter(istManuell), [aktivitaeten]);
  const systemAktivitaeten = useMemo(() => aktivitaeten.filter(istSystemEintrag), [aktivitaeten]);
  const sichtbareAktivitaeten = useMemo(() => {
    if (aktivitaetenAnsicht === "notizen") return notizen;
    if (aktivitaetenAnsicht === "system") return systemAktivitaeten;
    // Vereinbarte nächste Schritte stehen oben, bis ihr Zeitpunkt erreicht ist.
    return geplanteZuerst(aktivitaetenFilter === "alle"
      ? manuelleAktivitaeten
      : manuelleAktivitaeten.filter(a => a.art === aktivitaetenFilter));
  }, [aktivitaetenAnsicht, aktivitaetenFilter, notizen, manuelleAktivitaeten, systemAktivitaeten]);
  const aktivitaetenFilteredCount = sichtbareAktivitaeten.length;
  const aktPag = usePagination(`aktivitaeten:${id || "none"}`, aktivitaetenFilteredCount, {
    pageSizeOptions: AKTIVITAETEN_SEITENGROESSEN,
    defaultPageSize: AKTIVITAETEN_SEITENGROESSE_STANDARD,
  });
  /** Schnittstelle zum Selbstauskunfts-Formular, um vor dem Schließen zu fragen. */
  const [resendSuccess, setResendSuccess] = useState(false);
  // Verhindert Doppelklicks waehrend der Versand noch laeuft. Frueher uebernahm
  // das `resendSuccess`, das aber jetzt erst nach dem Erfolg gesetzt wird.
  const resendLaeuftRef = useRef(false);
  const [editDialog, setEditDialog] = useState(false);
  const [beraterDialog, setBeraterDialog] = useState(false);
  // Warnung vor dem Wechsel, wenn der aktuelle Vertriebspartner mit dem
  // Kunden noch etwas in der Zukunft geplant hat (Termin, Aufgabe, Follow-Up).
  const [beraterWechselWarnung, setBeraterWechselWarnung] = useState<string | null>(null);
  const [setterDialog, setSetterDialog] = useState(false);
  const [editData, setEditData] = useState<Partial<KundeData>>({});
  // Die Sprache im Bearbeiten-Modus. `null` heißt: nicht angefasst, beim
  // Speichern bleibt die gespeicherte Wahl unverändert (Plan Kundensprache).
  const [editSprache, setEditSprache] = useState<Sprache | null>(null);
  const kundenSpracheStand = useKundenSprache(id);
  // Was das Feld zeigt: die Wahl, oder `null` für „noch nicht gewählt“. Ein
  // Englisch ohne Zeitpunkt (von Hand gesetzt) wird trotzdem als Englisch gezeigt.
  const kundenSpracheAnzeige: Sprache | null =
    kundenSpracheStand.bewusstGewaehlt || kundenSpracheStand.sprache === "en" ? kundenSpracheStand.sprache : null;
  const [newBerater, setNewBerater] = useState("");
  // Kennung zum gewaehlten Namen. Zwei Partner koennen gleich heissen.
  const [newBeraterId, setNewBeraterId] = useState<string | undefined>();
  // Warum der Lead den Partner wechselt. Pflicht, sobald der Kontakt schon
  // jemandem gehoert. Siehe uebergabeGrund.ts.
  const [uebergabeGrund, setUebergabeGrund] = useState<UebergabeGrund>({});
  const [newSetter, setNewSetter] = useState("");
  const [newSetterId, setNewSetterId] = useState<string | undefined>();
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [exitDialog, setExitDialog] = useState(false);
  const [deleteGrund, setDeleteGrund] = useState("");
  const [dsgvoHardDeleteOpen, setDsgvoHardDeleteOpen] = useState(false);
  const [, forceUpdate] = useState(0);
  /** Eigentümer-Übernahme nach dem Notartermin je Investment, siehe Notarkarte. */
  const eigentuemerUebernahmeRef = useRef<Map<string, "laeuft" | "fehler" | "fertig">>(new Map());
  /*
   * Der Vermerk "Kunde finanziert selbst", zusaetzlich im lokalen Zustand.
   *
   * `setInvestmentMeta` schreibt in den Zwischenspeicher und stellt den
   * Datenbankschreibvorgang nur in eine Warteschlange. Zwischen Klick und
   * fertig nachgezogener Anzeige lag dadurch ein sichtbarer Moment, in dem
   * die Seite noch den alten Stand zeigte: Der Abschnitt "Bonitaet und
   * Bankpruefung" fehlte im ersten Bild und war im naechsten da, wodurch
   * alles darunter sprang. Christian am 16.09.2026, im Browser nachgestellt.
   *
   * Der lokale Stand gilt sofort und wird beim naechsten Laden vom
   * gespeicherten Stand abgeloest. Je Investment, damit mehrere Vorgaenge
   * nebeneinander nicht durcheinandergeraten.
   */
  const [saVermerkLokal, setSaVermerkLokal] = useState<Record<string, SaEntfaelltVermerk>>({});
  // Beim Selbstfinanzierer: Unterlagen im Bonitaetscheck aufgeklappt, je Investment.
  const [saUnterlagenOffen, setSaUnterlagenOffen] = useState<Record<string, boolean>>({});

  const [eigenDocInvId, setEigenDocInvId] = useState<string | null>(null);
  const [eigenDocTitel, setEigenDocTitel] = useState("");
  // Live-version tracker: re-renders on cache changes (Realtime)
  // Watches all tables that drive the customer profile UI
  const _liveV = useLiveVersion([
    "kontakte", "investments", "objekte",
    "empfehlungen", "empfehlungsprogramme",
    "finanzierungen", "benachrichtigungen",
    // "aufgaben" gehört dazu, weil die Anzeige hinter dem Namen die zeitlich
    // nächste offene Aufgabe zeigt. Ohne den Eintrag blieb der Kopf nach dem
    // Bearbeiten oder Abhaken einer Aufgabe auf dem alten Stand stehen.
    "aktivitaeten", "follow_ups", "aufgaben",
  ]);
  const [confirmNewInvestment, setConfirmNewInvestment] = useState(false);
  const [deleteInvestmentId, setDeleteInvestmentId] = useState<string | null>(null);
  const [switchObjektDialog, setSwitchObjektDialog] = useState<{ invId: string; objektId: string; wohnungId: string } | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ invId: string; docName: string } | null>(null);
  /**
   * Laufende Unterlagen-Uploads (Investment|Dokument), gegen Doppelklicks.
   *
   * Der Wert ist der Startzeitpunkt. Eine Sperre laeuft nach
   * UPLOAD_SPERRE_MS von selbst ab, damit ein abgebrochener oder
   * fehlgeschlagener Vorgang die Zeile nicht dauerhaft blockiert
   * ("Upload laeuft bereits", obwohl gar nichts mehr laeuft).
   */
  const laufendeUploadsRef = useRef<Map<string, number>>(new Map());
  const UPLOAD_SPERRE_MS = 90_000;
  const uploadSperreAktiv = (schluessel: string) => {
    const start = laufendeUploadsRef.current.get(schluessel);
    if (start === undefined) return false;
    if (Date.now() - start > UPLOAD_SPERRE_MS) {
      laufendeUploadsRef.current.delete(schluessel);
      return false;
    }
    return true;
  };
  /** Sperren fuer ein Dokument aufheben (z. B. nach dem Loeschen). */
  const uploadSperrenLoesen = (invId: string, namen: string[]) => {
    for (const name of namen) laufendeUploadsRef.current.delete(`${invId}|${name}`);
  };
  /** Verhindert, dass ein noch alter Datenbankstand die sofortige Anzeige kurz überschreibt. */
  const offeneUnterlagenOpsRef = useRef(0);
  /**
   * Sichtbarer Sollstand laufender Unterlagen-Aenderungen. Realtime kann nach
   * einer lokalen Aenderung noch kurz eine davor gelesene Investment-Zeile
   * liefern. Dieser Sollstand liegt deshalb ueber dem Cache, bis eine gezielte
   * Nachkontrolle den endgueltigen Datenbankstand geholt hat.
   *
   * Jeder Eintrag traegt eine laufende Nummer. Die Nachkontrolle eines aelteren
   * Vorgangs raeumt damit nur ihren eigenen Stand weg und nicht den eines
   * inzwischen gestarteten neuen Vorgangs (sonst blinkt ein direkt nach dem
   * Loeschen hochgeladenes Dokument wieder weg).
   */
  /*
   * Bedeutung der Felder: fehlt ein Feld, wird es nicht ueberlagert und der
   * Cache-Wert bleibt sichtbar. Steht `null` darin, gilt der Eintrag als
   * entfernt (Loeschvorgang).
   */
  const unterlagenSollstandRef = useRef<Map<string, { status?: DocStatus | null; url?: string | null; gen: number }>>(new Map());
  const unterlagenGenRef = useRef(0);
  const setzeUnterlagenSollstand = (invId: string, namen: string[], wert: { status?: DocStatus | null; url?: string | null } | null): number => {
    const gen = ++unterlagenGenRef.current;
    for (const name of namen) {
      const key = `${invId}|${name}`;
      if (wert) unterlagenSollstandRef.current.set(key, { ...wert, gen });
      else unterlagenSollstandRef.current.delete(key);
    }
    forceUpdate(n => n + 1);
    return gen;
  };
  /**
   * Nachkontrolle nach einem Upload oder einem Loeschvorgang.
   *
   * Holt den echten Datenbankstand, repariert ihn bei Bedarf ueber die
   * Registrierungs-RPC (sonst waere ein scheinbar hochgeladenes Dokument nach
   * dem naechsten Laden wieder weg) und loest erst danach die Ueberlagerung.
   */
  const unterlagenVorgangAbschliessen = (
    invId: string,
    namen: string[],
    gen: number,
    erwartet?: { art: "upload"; name: string; url: string } | { art: "loeschen" } | { art: "status"; name: string; status: DocStatus },
  ) => {
    window.setTimeout(async () => {
      try {
        let { data } = await supabase.from("investments").select("*").eq("id", invId).maybeSingle();
        const urls = (meta: any) => (meta?.docFileUrls || {}) as Record<string, string>;
        const statuses = (meta: any) => (meta?.docStatuses || {}) as Record<string, string>;
        if (data && erwartet && erwartet.art === "status") {
          // Freigabe oder Ablehnung: nur pruefen, ob der Status wirklich steht,
          // und ihn sonst genau einmal nachschreiben.
          if (statuses((data as any).meta)[erwartet.name] !== erwartet.status) {
            setInvestmentDocStatus(invId, erwartet.name, erwartet.status);
            const nachlese = await supabase.from("investments").select("*").eq("id", invId).maybeSingle();
            if (nachlese.data) data = nachlese.data;
          }
        } else if (data && erwartet) {
          const fehlt = erwartet.art === "upload"
            ? urls((data as any).meta)[erwartet.name] !== erwartet.url
            : namen.some((n) => urls((data as any).meta)[n] || statuses((data as any).meta)[n]);
          if (fehlt) {
            // Der Stand ist nicht dauerhaft angekommen: genau einmal nachholen.
            if (erwartet.art === "upload") {
              await supabase.rpc("register_unterlage_upload", { _investment_id: invId, _doc_name: erwartet.name, _file_url: erwartet.url });
            } else {
              for (const n of namen) {
                await supabase.rpc("unregister_unterlage_upload", { _investment_id: invId, _doc_name: n });
              }
            }
            const nachlese = await supabase.from("investments").select("*").eq("id", invId).maybeSingle();
            if (nachlese.data) data = nachlese.data;
            const immerNochOffen = erwartet.art === "upload"
              ? urls((data as any)?.meta)[erwartet.name] !== erwartet.url
              : namen.some((n) => urls((data as any)?.meta)[n] || statuses((data as any)?.meta)[n]);
            if (immerNochOffen) {
              toast({
                title: erwartet.art === "upload" ? "Dokument nicht dauerhaft gespeichert" : "Dokument nicht dauerhaft gelöscht",
                description: `${erwartet.art === "upload" ? erwartet.name : namen[0]}: Bitte den Vorgang noch einmal ausführen.`,
                variant: "destructive",
              });
            }
          }
        }
        if (data) {
          const rows = cacheGet("investments").map((row: any) => row.id === invId ? data : row);
          cacheSet("investments", rows);
        }
      } finally {
        // Nur den eigenen Stand aufloesen, neuere Vorgaenge bleiben stehen.
        for (const name of namen) {
          const key = `${invId}|${name}`;
          if (unterlagenSollstandRef.current.get(key)?.gen === gen) unterlagenSollstandRef.current.delete(key);
        }
        forceUpdate(n => n + 1);
      }
    }, 4000);
  };
  const [rejectReason, setRejectReason] = useState("");
  const [deleteDocDialog, setDeleteDocDialog] = useState<{ invId: string; docName: string; wasApproved: boolean } | null>(null);
  const handleDeleteDoc = async () => {
    if (!deleteDocDialog) return;
    const { invId, docName } = deleteDocDialog;
    const invRow = cacheGet("investments").find((r: any) => r.id === invId);
    if (!invRow) return;
    const vorherigesMeta = { ...((invRow.meta || {}) as Record<string, any>) };
    const docFileUrls: Record<string, string> = (invRow?.meta as any)?.docFileUrls || {};
    // Auch die alten Portal-Schlüssel (z. B. 'Eigener Mietvertrag / ...')
    // mitlöschen, sonst lebt die Zeile über den Lese-Rückfall sofort wieder auf.
    const docStatuses: Record<string, string> = (invRow?.meta as any)?.docStatuses || {};
    const alleNamen = [docName, ...(LEGACY_DOC_KEYS[docName] || [])];
    const setzeMeta = (meta: Record<string, any>) => {
      const nextInvestments = cacheGet("investments").map((row: any) =>
        row.id === invId ? { ...row, meta } : row
      );
      cacheSet("investments", nextInvestments);
      forceUpdate(n => n + 1);
    };
    const fehlerMelden = (fehler: unknown) => {
      console.error("[handleDeleteDoc] Loeschen fehlgeschlagen:", docName, fehler);
      setzeUnterlagenSollstand(invId, alleNamen, null);
      setzeMeta(vorherigesMeta);
      toast({ title: "Dokument wurde nicht gelöscht", description: loeschFehlerText(docName, fehler), variant: "destructive" });
    };
    // Sofort ausblenden. Speicher und Datenbank ziehen danach im Hintergrund nach.
    const optimistischeUrls = { ...docFileUrls };
    const optimistischeStatuses = { ...docStatuses };
    for (const n of alleNamen) {
      delete optimistischeUrls[n];
      delete optimistischeStatuses[n];
    }
    const loeschGen = setzeUnterlagenSollstand(invId, alleNamen, { status: null, url: null });
    // Eine haengengebliebene Upload-Sperre darf das erneute Hochladen nach dem
    // Loeschen nicht blockieren.
    uploadSperrenLoesen(invId, alleNamen);
    setzeMeta({ ...vorherigesMeta, docFileUrls: optimistischeUrls, docStatuses: optimistischeStatuses });
    setDeleteDocDialog(null);
    toast({ title: "Dokument gelöscht ✓", description: docName });
    offeneUnterlagenOpsRef.current += 1;
    // Die Datei muss zuerst wirklich aus dem Speicher verschwinden. Sonst
    // waere der Eintrag in der Oberflaeche weg, die Kundenunterlage laege
    // aber weiter im Speicher. Das ist ein Datenschutzthema. Der Upload
    // speichert den reinen Pfad, Altbestand eine Adresse; der Helfer kennt
    // beide Formen (vorher warf `new URL(pfad)` hier einen TypeError).
    const speicherPfad = unterlagenSpeicherPfad(alleNamen.map((n) => docFileUrls[n]).find(Boolean));
    if (speicherPfad) {
      try {
        const { error } = await supabase.storage.from("unterlagen").remove([speicherPfad]);
        if (error) throw error;
      } catch (e) {
        fehlerMelden(e);
        offeneUnterlagenOpsRef.current -= 1;
        return;
      }
    }
    // Eintrag am Investment ueber die RPC mit Berechtigungspruefung abmelden
    // (dieselbe wie im Kundenportal). Sie liefert das neue Meta zurueck, das
    // sofort in den Cache geht; andere Tabs bekommen es per Realtime.
    let neuesMeta: Record<string, any> | null = null;
    for (const n of alleNamen) {
      if (!(n in docFileUrls) && !(n in docStatuses)) continue;
      const { data, error } = await supabase.rpc("unregister_unterlage_upload", { _investment_id: invId, _doc_name: n });
      if (error) {
        fehlerMelden(error);
        offeneUnterlagenOpsRef.current -= 1;
        return;
      }
      if (data && typeof data === "object") neuesMeta = data as Record<string, any>;
    }
    if (invRow) {
      const currentMeta = vorherigesMeta;
      let metaFuerCache = neuesMeta;
      if (!metaFuerCache) {
        // Nichts war registriert (z. B. nur ein verwaister Status): Anzeige
        // trotzdem sauber auf "keine Unterlage" stellen.
        const updatedUrls = { ...(currentMeta.docFileUrls || {}) };
        const updatedStatuses = { ...(currentMeta.docStatuses || {}) };
        for (const n of alleNamen) { delete updatedUrls[n]; delete updatedStatuses[n]; }
        metaFuerCache = { ...currentMeta, docFileUrls: updatedUrls, docStatuses: updatedStatuses };
      }
      setzeMeta(metaFuerCache);
    }
    offeneUnterlagenOpsRef.current -= 1;
    unterlagenVorgangAbschliessen(invId, alleNamen, loeschGen, { art: "loeschen" });
    // War die Finanzierung schon frei, erfaehrt der Finanzierungspartner von
    // der geloeschten Pflichtunterlage. Die Finanzierung bleibt frei.
    void meldeBonitaetNachFreigabe({
      investmentId: invId,
      kundeId: id || "",
      kundeName: [kunde?.vorname, kunde?.nachname].filter(Boolean).join(" "),
      docName,
      aktion: "geloescht",
      metaVorher: vorherigesMeta,
    });
  };
  const [reviewDialog, setReviewDialog] = useState<{ invId: string; section: "bonitaet" | "bank" } | null>(null);
  const [rvResent, setRvResent] = useState(false);
  const [verlorenDialog, setVerlorenDialog] = useState(false);
  const [verlorenGrund, setVerlorenGrund] = useState("");
  /** Rueckfrage vor dem Wiederaufnehmen eines verlorenen oder archivierten Kontakts. */
  const [wiederaufnahmeDialog, setWiederaufnahmeDialog] = useState(false);

  const [archivDialog, setArchivDialog] = useState(false);
  const [archivGrund, setArchivGrund] = useState("");
  const [showKaufvertragForm, setShowKaufvertragForm] = useState<string | null>(null);
  const [einreichungData, setEinreichungData] = useState<any>(null);
  const [deleteKaufvertragDialog, setDeleteKaufvertragDialog] = useState<string | null>(null);

  // ── Investment state ──
  const [investments, setInvestments] = useState<Investment[]>(() => getInvestmentsByKontakt(id || ""));

  // Refresh investments from DB to catch server-side meta updates (e.g. saSigned from finalize)
  const refreshInvestmentsFromDb = async (kontaktId: string) => {
    // Während Upload oder Löschen zeigt der Cache bewusst den neuen Stand.
    // Ein paralleles Nachladen könnte noch die alte Datenbankzeile liefern.
    if (offeneUnterlagenOpsRef.current > 0) return getInvestmentsByKontakt(kontaktId);
    try {
      const { data } = await supabase.from("investments").select("*").eq("kunde_id", kontaktId);
      if (data && offeneUnterlagenOpsRef.current === 0) {
        const cachedRows = cacheGet("investments") as any[];
        const otherRows = cachedRows.filter((row: any) => row.kunde_id !== kontaktId);
        cacheSet("investments", [...otherRows, ...data]);
      }
      return getInvestmentsByKontakt(kontaktId);
    } catch { return getInvestmentsByKontakt(kontaktId); }
  };

  const refreshKontaktFromDb = async (kontaktId: string) => {
    try {
      const { data } = await supabase.from("kontakte").select("*").eq("id", kontaktId).maybeSingle();
      if (!data) return getKontaktById(kontaktId);

      const cachedRows = cacheGet("kontakte") as any[];
      const otherRows = cachedRows.filter((row: any) => row.id !== kontaktId);
      cacheSet("kontakte", [...otherRows, data]);
      return dbRowToKunde(data);
    } catch {
      return getKontaktById(kontaktId);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadKunde = async () => {
      if (!id) {
        if (!cancelled) {
          setKunde(undefined);
          setLoadingKunde(false);
        }
        return;
      }

      const cached = getKontaktById(id);
      if (cached) {
        if (!cancelled) {
          setKunde(cached);
          setAktivitaeten(getAktivitaeten(id));
          setInvestments(getInvestmentsByKontakt(id));
          setLoadingKunde(false);
          // Ueber `ladeTabellen`, damit sich das nicht mit dem Routenlader
          // (`useRoutenTabellen`) doppelt, der dieselbe Tabelle gerade holt.
          if (!isTableLoaded("aktivitaeten")) {
            ladeTabellen(["aktivitaeten"]).catch((error) => {
              console.error("Aktivitäten konnten nicht nachgeladen werden:", error);
            });
          }
          // Serverseitige Aenderungen (saSigned und aehnliches) nachladen, aber
          // nur EINMAL je Kunde. Siehe `abgeglichenFuer`: Der Abgleich erhoeht
          // selbst die Cache-Version, an der dieser Effekt haengt.
          if (abgeglichenFuer.current !== id) {
            abgeglichenFuer.current = id;
            Promise.all([refreshKontaktFromDb(id), refreshInvestmentsFromDb(id)]).then(([freshKunde, invs]) => {
              if (!cancelled) {
                if (freshKunde) setKunde(freshKunde);
                setInvestments(invs);
                forceUpdate(n => n + 1);
              }
            });
          }
        }
        return;
      }

      if (!cancelled) setLoadingKunde(true);

      // Direktlink ins Profil, bevor die Kontakte im Cache sind: den einen
      // Kontakt gezielt holen statt auf die gesamte erste Ladewelle zu warten
      // (frueher `await initDataCache()`). Der Einzelabruf legt die Zeile
      // auch in den Cache.
      const einzeln = await refreshKontaktFromDb(id);
      if (einzeln) {
        if (!cancelled) {
          setKunde(einzeln);
          setAktivitaeten(getAktivitaeten(id));
          const invs = await refreshInvestmentsFromDb(id);
          setInvestments(invs);
          setLoadingKunde(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("kontakte")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;

        if (!cancelled) {
          setKunde(data ? dbRowToKunde(data) : undefined);
          setAktivitaeten(getAktivitaeten(id));
          // Nur Investments nachladen, wenn der Kontakt wirklich existiert –
          // sonst löst der cacheSet einen Live-Version-Bump aus und der
          // useEffect läuft in einer Endlos-Ladeschleife (Kunde nicht gefunden).
          if (data) {
            const invs = await refreshInvestmentsFromDb(id);
            setInvestments(invs);
          } else {
            setInvestments([]);
          }
        }
      } catch (error) {
        console.error("Kunde konnte nach Reload nicht geladen werden:", error);
        if (!cancelled) setKunde(undefined);
      } finally {
        if (!cancelled) setLoadingKunde(false);
      }
    };

    void loadKunde();

    return () => {
      cancelled = true;
    };
  }, [id, _liveV]);

  /*
   * Klick aus der Pipeline: direkt in das gemeinte Investment.
   *
   * Die Pipeline haengt an jeden Link die Kennung des Investments, um das es
   * geht, denn sie zeigt pro Investment eine eigene Karte. Ausgewertet wurde
   * der Parameter beim Laden nie: Wer in der Pipeline auf die Karte von
   * Investment 2 klickte, landete in den Stammdaten und musste den richtigen
   * Reiter selbst suchen.
   */
  /*
   * Nur einmal springen, danach entscheidet der Nutzer.
   *
   * Ohne diesen Merker sprang der Reiter dauerhaft zurück. Die Adresse behält
   * den Parameter `investment`, und `investments` ist nach jedem
   * `setInvestments` ein neues Feld, also lief dieser Effekt bei jeder
   * Aktualisierung aus dem Zwischenspeicher erneut. Wer auf Stammdaten klickte,
   * wurde sofort wieder ins Investment geworfen. Gemeldet an Kunde Mark
   * Eichholz, betroffen war jeder Kunde, der über die Pipeline geöffnet wurde.
   */
  const investmentSprungGetan = useRef(false);
  useEffect(() => {
    if (investmentSprungGetan.current) return;
    if (!kunde || investments.length === 0) return;
    const gewuenscht = new URLSearchParams(window.location.search).get("investment");
    if (!gewuenscht) return;
    if (!investments.some((i) => i.id === gewuenscht)) return;
    investmentSprungGetan.current = true;
    setGewaehltesInvestment(gewuenscht);
    setActiveTab("investments");
    /*
     * Auch dieser Weg beginnt am Anfang des Vorgangs.
     *
     * Bewusst die beiden Setzer und nicht `oeffneInvestment`: Die Reihenfolge
     * an dieser Stelle ist abgesichert, `objektauswahlEineStelle.test.ts` und
     * `kundenDetailReiterSprung.test.ts` lesen sie im Quelltext nach.
     * Ein Anker in der Adresse (etwa `#objektauswahl`) hat Vorrang und
     * rollt selbst. Dann hier nicht nach oben, sonst sah man beim Zurueck aus
     * der Objektauswahl erst den Anfang des Investments und dann den Sprung.
     */
    if (!window.location.hash) rolleNachDemZeichnenNachOben();
  }, [kunde, investments]);

  // ── Sprung zu einem Abschnitt über den Anker (z. B. #empfehlungsprogramm, #objektauswahl) ──
  // Auch der Ankersprung nur einmal, aus demselben Grund wie oben.
  const ankerSprungGetan = useRef(false);
  useEffect(() => {
    if (ankerSprungGetan.current) return;
    const hash = window.location.hash.replace("#", "");
    if (!hash || !kunde || investments.length === 0) return;
    /*
     * Das gemeinte Investment, nicht einfach das erste.
     *
     * Hier stand `investments[0]`, und die Suche nach dem Abschnitt nahm mit
     * `querySelector` ebenfalls den ersten Treffer im Dokument. Bei einem
     * Kunden mit zwei Investments sprang der Hinweis deshalb immer in
     * Investment 1, egal aus welcher Pipelinekarte er kam.
     */
    const gewuenscht = new URLSearchParams(window.location.search).get("investment");
    const inv = investments.find((i) => i.id === gewuenscht) || investments[0];
    if (!inv) return;

    // Erst der Abschnitt dieses Investments, dann der allgemeine Abschnitt.
    const finde = () =>
      document.getElementById(`card-${hash}-${inv.id}`) ||
      (document.querySelector(`[data-section="${hash}"][data-investment="${inv.id}"]`) as HTMLElement | null) ||
      (document.querySelector(`[data-section="${hash}"]`) as HTMLElement | null);

    const springe = (el: HTMLElement) => {
      ankerSprungGetan.current = true;
      // Kein Sprung nach oben: der Anker nennt bereits ein Ziel im Vorgang.
      oeffneInvestment(inv.id, { nachObenRollen: false });
      // Ohne Gleiten: Man soll gleich dort stehen, nicht hinfahren.
      el.scrollIntoView({ behavior: "auto", block: "center" });
      markiereProfilAbschnitt(el);
    };

    /*
     * Springen, sobald der Abschnitt gezeichnet ist.
     *
     * Bis zum 27.09.2026 wartete der Sprung fest 800 und dann nochmals 300
     * Millisekunden und glitt erst danach hin. Beim Zurueck aus der
     * Objektauswahl sah man deshalb gut eine Sekunde lang den Anfang des
     * Investments. Jetzt wird je Bildschirmbild nachgesehen, hoechstens
     * `ANKER_WARTEN_MS` lang.
     */
    const sofort = finde();
    if (sofort) {
      springe(sofort);
      return;
    }
    if (typeof requestAnimationFrame !== "function") return;
    const bis = Date.now() + ANKER_WARTEN_MS;
    let bild = 0;
    const versuche = () => {
      const el = finde();
      if (el) springe(el);
      else if (Date.now() < bis) bild = requestAnimationFrame(versuche);
    };
    bild = requestAnimationFrame(versuche);
    return () => cancelAnimationFrame(bild);
  }, [kunde, investments]);

  const investmentsGeladen = useCacheReady(INVESTMENT_TABELLEN);

  // Investments aus dem Zwischenspeicher übernehmen. Es wird hier NIE ein
  // Investment angelegt.
  //
  // Früher lief an dieser Stelle eine Altbestands-Migration, die bei jeder
  // Stufe außerhalb einer Ausschlussliste (z. B. „nicht erreicht") ein neues
  // Investment erzeugte und danach in dessen Reiter sprang. Beim Öffnen eines
  // Leads entstand so bei jedem Aufruf ein weiteres leeres Investment.
  // Die Erstanlage „Investment 1" übernimmt ausschließlich der Datenbank-
  // Trigger beim Anlegen des Kontakts, jedes weitere Investment wird manuell
  // über „Neues Investment" angelegt.
  useEffect(() => {
    if (!kunde || !id) return;
    if (!investmentsGeladen) return;
    setInvestments(getInvestmentsByKontakt(id));
  }, [id, kunde?.pipelineStufe, investmentsGeladen]);

  // Beim Öffnen eines Kundenprofils wird IMMER zuerst „Stammdaten" angezeigt.
  // Der frühere Auto-Switch auf ein Investment via ?investment=<id> wurde entfernt,
  // weil Nutzer beim Aufruf eines Kunden zuerst die Stammdaten sehen wollen.

  // ── Echtzeit-Sync: wenn investments oder kontakte aus dem Cache (z. B. via
  // Supabase Realtime) aktualisiert werden – etwa weil der Kunde im Portal
  // einen Notartermin bestätigt oder der Modus geändert wurde – sofort UI
  // neu rendern, ohne Reload. Verbindet VP-Profil und Kundenportal live.
  useEffect(() => {
    if (!id) return;
    const unsubInv = onCacheChange((table, _event, row) => {
      if (table !== "investments") return;
      if (row && row.kunde_id && row.kunde_id !== id) return;
      setInvestments(getInvestmentsByKontakt(id));
      forceUpdate(n => n + 1);
    });
    const unsubKontakt = onCacheChange((table, _event, row) => {
      if (table !== "kontakte") return;
      if (row && row.id !== id) return;
      const fresh = getKontaktById(id);
      if (fresh) setKunde(fresh);
      forceUpdate(n => n + 1);
    });
    return () => { unsubInv?.(); unsubKontakt?.(); };
  }, [id]);

  // ── Anruf-Protokoll direkt öffnen (?anruf=1), etwa nach Klick auf eine
  // Telefonnummer in der Kontaktliste. So geht kein Anruf unprotokolliert unter.
  useEffect(() => {
    if (!kunde) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("anruf") !== "1") return;
    url.searchParams.delete("anruf");
    window.history.replaceState({}, "", url.toString());
    // Die Kontaktliste hat den Anruf schon gestartet.
    setAnrufGestartet(true);
    setActionDialog("anruf_protokoll");
  }, [kunde]);

  // ── Auto-Trigger SA-Versand aus Beratungspräsentation (?autoSendSA=<investmentId>) ──
  useEffect(() => {
    if (!kunde || !id || investments.length === 0) return;
    const url = new URL(window.location.href);
    const autoSendInvId = url.searchParams.get("autoSendSA");
    if (!autoSendInvId) return;
    const inv = investments.find((i) => i.id === autoSendInvId);
    if (!inv) return;
    url.searchParams.delete("autoSendSA");
    window.history.replaceState({}, "", url.toString());
    oeffneInvestment(inv.id);
    (async () => {
      const kundeEmail = kunde.email;
      const kundeName = `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim();
      if (!kundeEmail) {
        toast({ title: "Keine E-Mail", description: "Bitte zuerst eine E-Mail-Adresse beim Kunden hinterlegen.", variant: "destructive" });
        return;
      }
      // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
      await stelleKundenspracheSicher(id);
      try {
        const existingSaDraft = getSaData(inv.id);
        const { error } = await supabase.functions.invoke("send-sa-invitation", {
          body: { kontaktId: id, investmentId: inv.id, kundeName, kundeEmail, prefillData: existingSaDraft || undefined },
        });
        if (error) throw error;
        setSaInvitationSentAt(inv.id);
        const kontaktRow = cacheGet("kontakte").find((k: any) => k.id === id);
        const vpId = kontaktRow?.zustaendig_id || authUser?.id;
        if (vpId) {
          scheduleSaFollowUpReminders(kundeName, id!, inv.id, vpId);
          notifySaEinladungVerschickt(kundeName, id!, vpId);
        }
        toast({ title: "Einladung versendet ✓", description: `${kundeName} erhält eine E-Mail mit dem Link zur Selbstauskunft.` });
        addAktivitaet({ kundeId: id, art: "email", beschreibung: `Selbstauskunft-Einladung versendet an ${kundeName} (aus Beratungspräsentation)`, von: user.name });
        forceUpdate((n: number) => n + 1);
      } catch (err: any) {
        toast({ title: "Fehler", description: err.message || "Einladung konnte nicht gesendet werden.", variant: "destructive" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunde?.id, investments.length]);

  // ── Poll for signature completion (SA + RV): refresh investment meta from DB ──
  useEffect(() => {
    if (!id || isTestAccount()) return;
    const invs = investments;
    const pendingSA = invs.find(inv => getSaSignaturePending(inv.id) && !getSaSigned(inv.id));
    const pendingRV = invs.find(inv => getRvSignaturePending(inv.id) && !getRvSigned(inv.id));
    if (!pendingSA && !pendingRV) return;

    let cancelled = false;
    const notifiedIds = new Set<string>();
    /*
     * Der Ausgangszustand beim Start der Schleife.
     *
     * Hier steckte der gemeldete Fehler. Die Schleife fragte unten
     * `if (meta.saSigned || meta.rvSigned)`, also „ist irgendetwas
     * unterschrieben?". Geht eine Reservierungsvereinbarung zur Unterschrift
     * hinaus, ist die Selbstauskunft immer laengst unterschrieben, sonst waere
     * der Kunde gar nicht so weit. Die Antwort war also ja, obwohl gerade
     * niemand etwas unterschrieben hatte, und der Sonst-Zweig schrieb
     * „Selbstauskunft unterschrieben" mit dem Datum des Versands.
     *
     * Verglichen wird deshalb der UEBERGANG gegen diesen Ausgangszustand, nicht
     * mehr der Zustand. Was vor dem Start schon unterschrieben war, loest hier
     * nichts mehr aus.
     */
    const ausgangszustand = new Map<string, Unterschriftsstand>();
    for (const inv of [pendingSA, pendingRV]) {
      if (inv) ausgangszustand.set(inv.id, { sa: getSaSigned(inv.id), rv: getRvSigned(inv.id) });
    }
    const poll = async () => {
      try {
        const pendingIds = [pendingSA?.id, pendingRV?.id].filter(Boolean) as string[];
        for (const invId of pendingIds) {
          if (notifiedIds.has(invId)) continue;
          const { data } = await supabase
            .from("investments")
            .select("id, meta")
            .eq("id", invId)
            .maybeSingle();
          if (cancelled || !data) continue;
          const meta = (data as any).meta || {};
          const vorher = ausgangszustand.get(invId) ?? { sa: false, rv: false };
          const neu = neueUnterschriften(vorher, { sa: !!meta.saSigned, rv: !!meta.rvSigned });
          if (neu.length > 0) {
            // Mark as notified so we never fire again for this investment
            notifiedIds.add(invId);
            const nextInvestments = cacheGet("investments").map((row: any) =>
              row.id === invId ? { ...row, meta } : row
            );
            cacheSet("investments", nextInvestments);
            setInvestments(getInvestmentsByKontakt(id));
            // `kunde` kann hier noch fehlen, wenn die Abfrage vor dem Laden
            // zurueckkommt. Vorher stand hier `kunde.vorname` ungeschuetzt, und
            // die Schleife brach mit "Cannot read properties of undefined" ab.
            const kundeName = kunde ? `${kunde.vorname} ${kunde.nachname}`.trim() : "";

            // Auto-advance pipeline when RV is signed
            if (neu.includes("rv") && meta.pipelineStufe === "reservierung" && kundeName) {
              // Mit Zustaendigem: Er bekommt die Glocke. Ohne ihn ging sie bis
              // 28.09.2026 an alle Partner, jetzt nur an die Zentrale.
              notifyReservierungEingegangen(kundeName, id, kunde?.zustaendig_id || undefined);
            }
            // SA notification is handled server-side by finalize-selbstauskunft – no client-side duplicate
            forceUpdate(n => n + 1);
            // Die Meldung nennt jetzt das Dokument, das gerade dazugekommen ist.
            toast({ title: unterschriftMeldung(neu[neu.length - 1]) });

            /*
             * Die Notiz genau EINMAL, dann nie wieder.
             *
             * `notifiedIds` oben ist ein Merker im Arbeitsspeicher. Er hilft
             * innerhalb einer geoeffneten Seite, aber bei jedem neuen Aufruf
             * beginnt er wieder leer. Steht die Unterschrift in der Datenbank
             * und im Zwischenspeicher noch nicht, laeuft die Abfrage erneut an,
             * und es entstand eine weitere Notiz. Bei einem Kunden hatten sich
             * so mehrere hundert angesammelt.
             *
             * Der Riegel liegt deshalb dort, wo er einen Seitenaufruf ueberlebt:
             * in der Datenbank selbst. Gibt es die Notiz schon, wird keine
             * zweite angelegt.
             *
             * Gefragt wird nach ALLEN Formulierungen desselben Ereignisses,
             * nicht nur nach der heutigen. Sonst haette ein laufender Vorgang,
             * in dessen Akte noch die alte Fassung steht, einmalig einen
             * zweiten, gleichbedeutenden Eintrag bekommen.
             */
            for (const dokument of neu) {
              const notiz = unterschriftNotiz(dokument);
              // Derselbe Eintrag entsteht auch am automatischen Stufenwechsel
              // weiter unten. Wer zuerst kommt, beansprucht ihn.
              if (!beansprucheEreignis(notiz.text)) continue;
              const { data: schonDa } = await supabase
                .from("aktivitaeten")
                .select("id")
                .eq("kunde_id", id)
                .eq("art", "notiz")
                .in("beschreibung", alleFormulierungen(notiz))
                .limit(1);
              if (!schonDa?.length) {
                // Verfasser ist das System, nicht der Kunde. An dieser
                // Zuordnung haengt auch, in welchem Reiter der Eintrag steht
                // (siehe `istSystemEintrag` in lib/aktivitaetRechte.ts).
                addAktivitaet({ kundeId: id!, art: "notiz", beschreibung: notiz.text, von: "System" });
              }
            }
          }
        }
      } catch (e) {
        console.error("Signature poll error:", e);
      }
    };

    const interval = setInterval(poll, 10000);
    poll();

    return () => { cancelled = true; clearInterval(interval); };
  }, [id, investments.map(i => `${i.id}-${getSaSignaturePending(i.id)}-${getSaSigned(i.id)}-${getRvSignaturePending(i.id)}-${getRvSigned(i.id)}`).join(",")]);

  // Kundenportal status – stored in kontakte meta via dataCache
  type PortalStatus = "none" | "eingeladen" | "aktiv" | "ausstehend" | "gesperrt";
  const getPortalMeta = () => {
    if (isTestAccount()) {
      const raw = localStorage.getItem(`mi_portal_meta_${id || ""}`);
      return raw ? JSON.parse(raw) : { status: localStorage.getItem(`mi_portal_${id || ""}`) === "true" ? "eingeladen" : "none" };
    }
    const rows = cacheGet("kontakte");
    const row = rows.find((r: any) => r.id === id);
    const meta = (row?.meta as any) || {};
    if (meta.portalGesperrt) return { status: "gesperrt" as PortalStatus, ...meta };
    if (meta.portalAktiv) return { status: "aktiv" as PortalStatus, ...meta };
    if (meta.portalFreigeschalten) return { status: "eingeladen" as PortalStatus, ...meta };
    return { status: "none" as PortalStatus, ...meta };
  };
  const portalMeta = getPortalMeta();
  const portalFreigeschalten = portalMeta.status !== "none";
  const portalStatus: PortalStatus = portalMeta.status;

  const updatePortalMeta = (updates: Record<string, any>) => {
    if (isTestAccount()) {
      const rows = cacheGet("kontakte");
      const row = rows.find((r: any) => r.id === id);
      const meta = { ...(row?.meta || {}), ...updates };
      localStorage.setItem(`mi_portal_meta_${id || ""}`, JSON.stringify(meta));
      localStorage.setItem(`mi_portal_${id || ""}`, "true");
      forceUpdate(n => n + 1);
      return;
    }
    // Optimistic local update
    const rows = cacheGet("kontakte");
    const row = rows.find((r: any) => r.id === id);
    if (row) {
      const idx = rows.findIndex((r: any) => r.id === id);
      if (idx >= 0) {
        const next = [...rows];
        next[idx] = { ...rows[idx], meta: { ...(row.meta || {}), ...updates } };
        cacheSet("kontakte", next);
      }
    }
    forceUpdate(n => n + 1);
    // Atomic server-side merge to prevent race conditions
    supabase.rpc("merge_kontakt_meta", {
      _kontakt_id: id,
      _updates: updates,
    }).then(({ data, error }) => {
      if (error) console.error("merge_kontakt_meta error:", error);
      else if (data) {
        const arr = cacheGet("kontakte");
        const i = arr.findIndex((r: any) => r.id === id);
        if (i >= 0) {
          const next = [...arr];
          next[i] = { ...arr[i], meta: data };
          cacheSet("kontakte", next);
        }
        forceUpdate(n => n + 1);
      }
    });
  };

  const [portalLoading, setPortalLoading] = useState(false);

  const handlePortalFreischalten = async () => {
    if (!kunde?.email) {
      toast({ title: "Keine E-Mail hinterlegt", description: "Bitte zuerst eine E-Mail-Adresse für den Kunden eintragen.", variant: "destructive" });
      return;
    }
    // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
    await stelleKundenspracheSicher(id);

    const now = new Date().toISOString();
    if (isTestAccount()) {
      updatePortalMeta({ portalFreigeschalten: true, portalActivatedAt: now });
      // Unterlagen automatisch mit-freischalten (Kontakt- + Investment-Ebene)
      try {
        setUnterlagenFreigeschalten(id!, true);
        investments.forEach((iv: any) => {
          try { setInvestmentUnterlagenFreigeschalten(iv.id, true); } catch {}
        });
      } catch {}
      toast({ title: "Kundenportal freigeschaltet ✓", description: `Login-Daten werden an ${kunde.email} gesendet.` });
      return;
    }

    setPortalLoading(true);
    try {
      // Retry up to 2 times on transient errors (network blips, cold starts)
      let data: any = null;
      let error: any = null;
      let lastMsg = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await supabase.functions.invoke("invite-user", {
          body: {
            email: kunde.email,
            name: `${kunde.vorname} ${kunde.nachname}`,
            role: "kunde",
            kontaktId: id,
          },
        });
        data = res.data;
        error = res.error;
        if (!error && !data?.error) break;
        // Bei einer Ablehnung steht der Grund im Rumpf der Antwort, nicht in
        // `error.message` („Keine Berechtigung …“ bei fremden Kontakten).
        const mitGrund = error ? ((await edgeFehlerMitGrund(error, { functionName: "invite-user" })) as Error) : null;
        lastMsg = data?.error || mitGrund?.message || error?.message || "Unbekannter Fehler";
        console.warn(`Portal freischalten attempt ${attempt + 1} failed:`, lastMsg);
        // Don't retry on permission / validation errors
        if (/berechtig|autoris|fehlend|email/i.test(lastMsg)) break;
        await new Promise((r) => setTimeout(r, 800));
      }

      if (error || data?.error) {
        console.error("Portal freischalten error (final):", lastMsg, error, data);
        toast({ title: "Fehler beim Einladen", description: lastMsg, variant: "destructive" });
        return;
      }

      // Edge Function already updated meta server-side, only update local cache
      const rows = cacheGet("kontakte");
      const row = rows.find((r: any) => r.id === id);
      if (row) {
        const idx = rows.findIndex((r: any) => r.id === id);
        if (idx >= 0) { rows[idx] = { ...rows[idx], meta: { ...(row.meta || {}), portalFreigeschalten: true, portalActivatedAt: now, authUserId: data?.userId } }; }
      }
      forceUpdate(n => n + 1);
      // Unterlagen automatisch mit-freischalten, damit der Kunde sofort
      // alle Bonitätsunterlagen im Portal hochladen kann.
      // Ueber mergeKontaktMeta statt setUnterlagenFreigeschalten: nur so wird
      // der Schreibvorgang abgewartet und der Zwischenspeicher erst bei Erfolg
      // auf "freigegeben" gestellt. Sonst zeigt das CRM eine Freigabe an, die
      // der Kunde in seinem Portal gar nicht hat.
      let unterlagenFreigabeOk = false;
      try {
        unterlagenFreigabeOk = await mergeKontaktMeta(id!, {
          unterlagenFreigeschaltet: true,
          unterlagenFreigeschaltetAt: now,
        });
      } catch (e) {
        console.error("[Portal freischalten] Unterlagen-Freigabe fehlgeschlagen:", e);
      }
      if (unterlagenFreigabeOk) {
        investments.forEach((iv: any) => {
          try {
            setInvestmentUnterlagenFreigeschalten(iv.id, true);
          } catch (e) {
            console.error("[Portal freischalten] Freigabe am Investment fehlgeschlagen:", iv?.id, e);
          }
        });
      }
      addAktivitaet({ kundeId: id!, art: "notiz", beschreibung: `Kundenportal freigeschaltet – Einladung an ${kunde.email} gesendet`, von: user.name });
      toast({ title: "Kundenportal freigeschaltet ✓", description: `Einladung wurde an ${kunde.email} gesendet.` });
      if (!unterlagenFreigabeOk) {
        toast({
          title: "Unterlagen sind noch gesperrt",
          description: "Das Kundenportal ist offen, aber die Unterlagen konnten nicht freigegeben werden. Der Kunde sieht sie noch nicht. Bitte die Freigabe gleich noch einmal auslösen.",
          variant: "destructive",
        });
      }

      // Invite Person 2 if exists
      if (kunde.person2) {
        if (kunde.person2.email) {
          handleInvitePerson2();
        } else {
          // Person 2 hat keine E-Mail → Vertriebspartner benachrichtigen
          const kontaktRow = cacheGet("kontakte").find((k: any) => k.id === id);
          const beraterId = kontaktRow?.zustaendig_id;
          if (beraterId) {
            notifyUser(beraterId, {
              titel: "Person 2 ohne E-Mail-Adresse",
              nachricht: `Beim Freischalten des Kundenportals für ${kunde.vorname} ${kunde.nachname} wurde festgestellt, dass Person 2 (${kunde.person2.vorname} ${kunde.person2.nachname}) keine E-Mail-Adresse hinterlegt hat. Bitte E-Mail nachtragen, damit Person 2 ebenfalls Zugang zum Portal erhält.`,
              link: `/kunden/${id}`,
            });
          }
          toast({ title: "Hinweis: Person 2 ohne E-Mail", description: `${kunde.person2.vorname} ${kunde.person2.nachname} hat keine E-Mail – Portal kann nur für Person 1 aktiviert werden. Vertriebspartner wurde benachrichtigt.` });
        }
      }
    } catch (err) {
      console.error("Portal freischalten error:", err);
      toast({ title: "Fehler", description: "Kundenportal konnte nicht freigeschaltet werden.", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleInvitePerson2 = async () => {
    if (!kunde?.person2?.email) {
      toast({ title: "Keine E-Mail für Person 2", description: "Bitte zuerst eine E-Mail-Adresse für Person 2 eintragen.", variant: "destructive" });
      return;
    }
    // Eine Sprache je Kontakt, Person 2 bekommt dieselbe (Plan Entscheidung 11).
    await stelleKundenspracheSicher(id);
    if (isTestAccount()) {
      updatePortalMeta({ person2Invited: true, person2InvitedAt: new Date().toISOString() });
      toast({ title: "Person 2 eingeladen ✓", description: `Einladung an ${kunde.person2.email} gesendet.` });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: kunde.person2.email,
          name: `${kunde.person2.vorname} ${kunde.person2.nachname}`,
          role: "kunde",
          kontaktId: id,
          person2: true,
          vorname: kunde.person2.vorname,
          nachname: kunde.person2.nachname,
          telefon: kunde.person2.telefon,
        },
      });
      if (error || data?.error) {
        const mitGrund = error ? ((await edgeFehlerMitGrund(error, { functionName: "invite-user" })) as Error) : null;
        toast({ title: "Fehler", description: data?.error || mitGrund?.message || error?.message, variant: "destructive" });
        return;
      }
      updatePortalMeta({ person2Invited: true, person2InvitedAt: new Date().toISOString(), person2AuthUserId: data?.userId });
      toast({ title: "Person 2 eingeladen ✓", description: `Einladung an ${kunde.person2.email} gesendet.` });
    } catch (err) {
      toast({ title: "Fehler", description: "Person 2 konnte nicht eingeladen werden.", variant: "destructive" });
    }
  };

  const handlePortalSperren = async () => {
    const ok = await confirmDialog({
      title: "Kundenportal sperren?",
      description: "Der Kunde kann sich danach nicht mehr einloggen.",
      confirmText: "Portal sperren",
      cancelText: "Offen lassen",
      variant: "destructive",
    });
    if (!ok) return;
    await portalSperreAendern(true);
  };

  const handlePortalEntsperren = async () => {
    const ok = await confirmDialog({
      title: "Kundenportal wieder entsperren?",
      description: "Der Kunde kann sich danach wieder einloggen.",
      confirmText: "Portal entsperren",
      cancelText: "Gesperrt lassen",
    });
    if (!ok) return;
    await portalSperreAendern(false);
  };

  /*
   * Sperren und Entsperren warten auf den Server, bevor etwas gemeldet
   * wird, siehe `schaltePortalSperre`. Vorher lief das über
   * `updatePortalMeta`, das sofort den neuen Stand zeigte und einen Fehler
   * nur in die Konsole schrieb. Das Testkonto bleibt bei seinem lokalen Weg.
   *
   * Seit dem 23.09.2026 über die Edge Function `kundenportal-sperre` statt
   * über `merge_kontakt_meta`: Sie prüft, ob Admin, Inhaber oder der
   * zuständige Partner klickt, und sperrt auch die Anmeldung des Kunden.
   */
  const [portalSperreLaeuft, setPortalSperreLaeuft] = useState(false);
  const portalSperreAendern = async (gesperrt: boolean) => {
    if (portalSperreLaeuft) return;
    setPortalSperreLaeuft(true);
    try {
      const erfolgreich = await schaltePortalSperre(gesperrt, {
        sperreSetzen: async (sperren) => {
          if (isTestAccount()) {
            const zeitpunkt = new Date().toISOString();
            updatePortalMeta(sperren
              ? { portalGesperrt: true, portalGesperrtAt: zeitpunkt }
              : { portalGesperrt: false, portalEntsperrtAt: zeitpunkt });
            return { ok: true, meta: null };
          }
          const ergebnis = await portalSperreAmServer(id!, sperren);
          if (ergebnis.ok) {
            // Den neuen Stand aus der Antwort in den Zwischenspeicher, damit
            // Knopf und Datum sofort stimmen, ohne alle Kontakte neu zu laden.
            const zeilen = cacheGet("kontakte");
            const stelle = zeilen.findIndex((r: any) => r.id === id);
            if (ergebnis.meta && stelle >= 0) {
              const naechste = [...zeilen];
              naechste[stelle] = { ...zeilen[stelle], meta: ergebnis.meta };
              cacheSet("kontakte", naechste);
            } else {
              void cacheRefreshTable("kontakte").finally(() => forceUpdate(n => n + 1));
            }
          }
          return ergebnis;
        },
        melden: toast,
        neuLaden: () => {
          void cacheRefreshTable("kontakte").finally(() => forceUpdate(n => n + 1));
        },
      });
      if (erfolgreich) {
        addAktivitaet({ kundeId: id!, art: "notiz", beschreibung: gesperrt ? "Kundenportal gesperrt" : "Kundenportal entsperrt", von: user.name });
      }
    } finally {
      setPortalSperreLaeuft(false);
      forceUpdate(n => n + 1);
    }
  };

  /**
   * Zwei-Faktor-Anmeldung eines Kunden zuruecksetzen.
   *
   * Gedacht fuer den Fall, den es bis zum 11.09.2026 im Haus gar nicht gab:
   * Der Kunde hat sein Telefon gewechselt oder verloren, hat keinen
   * Recovery-Code mehr und kommt in sein Portal nicht mehr hinein. Bis dahin
   * konnte ihm niemand helfen.
   *
   * Die Rollenpruefung steht doppelt: hier fuer den Knopf und in der Edge
   * Function `manage-mfa` (Aktion `admin_reset`) fuer den Vorgang selbst.
   */
  const [mfaResetLaeuft, setMfaResetLaeuft] = useState(false);
  const handleMfaZuruecksetzen = async () => {
    const ok = await confirmDialog({
      title: "Zwei-Faktor-Anmeldung zurücksetzen?",
      description: `Der bestehende Authenticator von ${kunde.vorname} ${kunde.nachname} wird entfernt, ebenso alle noch nicht verbrauchten Wiederherstellungscodes. Beim nächsten Anmelden richtet der Kunde die Zwei-Faktor-Anmeldung neu ein. Nur zurücksetzen, wenn du sicher bist, mit wem du gesprochen hast.`,
      confirmText: "Zurücksetzen",
      cancelText: "Abbrechen",
      variant: "destructive",
    });
    if (!ok) return;
    setMfaResetLaeuft(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-mfa", {
        body: {
          action: "admin_reset",
          zielUserId: (portalMeta as any).authUserId || undefined,
          email: kunde.email || undefined,
        },
      });
      const fehler = (error as any)?.message || data?.error;
      if (fehler) {
        toast({ title: "Zurücksetzen fehlgeschlagen", description: String(fehler), variant: "destructive" });
        return;
      }
      toast({
        title: "Zwei-Faktor zurückgesetzt \u2713",
        description: "Der Kunde richtet sie beim nächsten Anmelden neu ein.",
      });
      addAktivitaet({ kundeId: id!, art: "notiz", beschreibung: "Zwei-Faktor-Anmeldung zurückgesetzt", von: user.name });
    } catch (e) {
      console.error("MFA-Reset fehlgeschlagen:", e);
      toast({ title: "Zurücksetzen fehlgeschlagen", description: "Bitte erneut versuchen.", variant: "destructive" });
    } finally {
      setMfaResetLaeuft(false);
    }
  };

  // Gemeinsamer Handler zum erneuten Versenden der Portal-Einladung.
  // Wird sowohl im Block "Kundenportal & Zugang" (Stammdaten) als auch
  // im Bonitätscheck pro Investment verwendet.
  const handleResendPortalInvite = async () => {
    if (resendSuccess || resendLaeuftRef.current) return;
    if (!kunde?.email) { toast({ title: "Keine E-Mail", variant: "destructive" }); return; }
    // Bis zum 23.09.2026 hob eine erneute Einladung die Portalsperre
    // stillschweigend auf. Jetzt sperrt die Sperre auch die Anmeldung, und
    // aufgehoben wird sie nur noch ausdrücklich über „Portal entsperren“.
    if (portalStatus === "gesperrt") {
      await hinweisDialog({
        title: "Das Portal ist gesperrt",
        description: "Solange das Portal gesperrt ist, kann sich dein Kunde nicht anmelden, auch nicht mit einer neuen Einladung. Entsperre das Portal zuerst, danach kannst du die Einladung erneut versenden.",
        buttonText: "Verstanden",
      });
      return;
    }
    const ok = await confirmDialog({
      title: "Einladung erneut versenden?",
      description: `Es wird sofort eine neue Zugangs-E-Mail an ${kunde.email} versendet. Der bestehende Login bleibt unverändert.`,
      confirmText: "Jetzt versenden",
      cancelText: "Abbrechen",
    });
    if (!ok) return;
    // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
    await stelleKundenspracheSicher(id);
    const nowIso = new Date().toISOString();
    // Die gruene Bestaetigung und der Zeitstempel werden erst nach dem
    // erfolgreichen Versand gesetzt. Vorher stand beides schon fest, ein
    // Fehlschlag sah dadurch kurz wie ein Erfolg aus und im Kundenprofil blieb
    // ein Versanddatum stehen, obwohl keine Mail rausging.
    const versandErfolgreich = () => {
      updatePortalMeta({ portalInviteResentAt: nowIso });
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    };
    if (isTestAccount()) {
      versandErfolgreich();
      addAktivitaet({ kundeId: id!, art: "email", beschreibung: `Portal-Einladung erneut versendet an ${kunde.email}`, von: user.name });
      toast({ title: "Einladung erneut gesendet ✓", description: `An ${kunde.email}` });
      return;
    }
    resendLaeuftRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: kunde.email, name: `${kunde.vorname} ${kunde.nachname}`, role: "kunde", kontaktId: id },
      });
      const isFetchErr = error && (error.name === "FunctionsFetchError" || /Failed to send a request/i.test(error.message || ""));
      if (data?.error) { toast({ title: "Fehler", description: data.error, variant: "destructive" }); return; }
      if (error && !isFetchErr) {
        // Den Grund aus der Antwort zeigen, etwa „Keine Berechtigung …“, wenn
        // jemand einlädt, der für den Kontakt nicht zuständig ist.
        const mitGrund = await edgeFehlerMitGrund(error, { functionName: "invite-user" });
        toast({ title: "Fehler", description: (mitGrund as Error)?.message || error.message, variant: "destructive" });
        return;
      }
      versandErfolgreich();
      addAktivitaet({ kundeId: id!, art: "email", beschreibung: `Portal-Einladung erneut versendet an ${kunde.email}`, von: user.name });
      toast({ title: "Einladung erneut gesendet ✓", description: `Zugangsmail wurde erneut an ${kunde.email} gesendet.` });
    } catch (e) {
      console.error("[Portal-Einladung] erneuter Versand fehlgeschlagen:", e);
      toast({ title: "Fehler", description: "Einladung konnte nicht erneut gesendet werden.", variant: "destructive" });
    } finally {
      resendLaeuftRef.current = false;
    }
  };

  /*
   * Hier entschied frueher die Summe von `kunde.einkuenfte`, ob ein Kunde als
   * Neukunde galt. Die Werte wurden nirgends mehr gelesen und stammten aus der
   * Kopie der Selbstauskunft an den Kontakt, die es nicht mehr gibt.
   */

  // Load SA data for dynamic document requirements
  const saData = (() => {
    // 1. Bevorzugt die finalisierte SA aus dem Investment (Single Source of Truth,
    //    identisch mit dem Kundenportal). Dadurch sehen VP & Kunde dieselben
    //    dynamischen Pflichtdokumente (z. B. „Nachweis: Girokonto – <Institut>").
    const invRows = cacheGet("investments")?.filter((r: any) => r.kunde_id === (id || "")) || [];
    for (const inv of invRows) {
      if (inv.meta?.saData) return inv.meta.saData;
      if (inv.meta?.saSnapshot) return inv.meta.saSnapshot;
    }

    // 2. Fallback: noch nicht abgeschlossene SA als Draft (user_settings / localStorage)
    let draft: any = null;
    if (!isTestAccount()) {
      const all = getUserSetting<Record<string, any>>("sa_drafts", {});
      draft = all[id || ""] || null;
    } else {
      try {
        const raw = localStorage.getItem(`mi_selbstauskunft_${id || ""}`);
        draft = raw ? JSON.parse(raw) : null;
      } catch { /* ignore */ }
    }
    return draft;
  })();

  const unterlagenFreigeschaltet = getUnterlagenFreigeschalten(id || "");
  const unterlagenFreigeschaltetAt = getUnterlagenFreigeschaltetAt(id || "");
  const customBankDocsList = getCustomBankDocs(id || "");

  /*
   * Bankprüfungslisten kommen aus der gemeinsamen Funktion, die auch das
   * Kundenportal aufruft (bankpruefungListe.ts). Maßgeblich ist
   * AUSSCHLIESSLICH die Selbstauskunft des betrachteten Investments.
   *
   * Vorher wurde die Liste einmal kontaktweit aus der ERSTEN SA gebaut, dann
   * mit Rückfall auf die neueste. Beides hieß: Ein Investment ohne eigene
   * Selbstauskunft zeigte die Unterlagenliste eines anderen Kaufs. Ohne
   * eigene Selbstauskunft steht die Liste noch nicht fest, dann bleiben nur
   * die von Hand ergänzten Zusatzunterlagen und daneben ein Hinweis
   * (Entscheidung Christian, 10.09.2026).
   */
  const bankDocsBaseFuerInvestment = (invId: string) => {
    const invRow = cacheGet("investments")?.find((r: any) => r.id === invId) || null;
    return bankpruefungListenFuerInvestment({
      eigeneSaData: eigeneSaDataFuerInvestmentRow(invRow),
      customBankDocs: customBankDocsList.map((cd) => ({ name: cd.name, required: cd.required })),
    });
  };

  /**
   * Warum gerade kein Selbstauskunfts-PDF entsteht.
   *
   * Das Dokument geht zur Bank. Ein Formular mit den Zahlen eines anderen
   * Investments waere schlimmer als gar kein Dokument, deshalb entsteht in
   * diesem Fall keines und der Nutzer liest, was zu tun ist.
   */
  const keineEigeneSaMelden = () => hinweisDialog({
    title: "Für dieses Investment liegt noch keine Selbstauskunft vor",
    description:
      "Das PDF entsteht ausschließlich aus der Selbstauskunft dieses Investments. Eine Selbstauskunft aus einem anderen Kauf wird bewusst nicht verwendet, sie enthält andere Zahlen und geht so zur Bank. Bitte zuerst die Selbstauskunft für dieses Investment ausfüllen.",
    buttonText: "Verstanden",
  });

  const hasP2 = !!kunde?.person2;

  /*
   * Auch der Bonitätscheck hängt an der Beschäftigungsart der Selbstauskunft
   * dieses Investments: Selbstständige haben keine Gehaltsnachweise, deshalb
   * fallen diese Zeilen bei ihnen weg (Entscheidung Christian, 15.09.2026).
   */
  const bonitaetDocsFuerInvestment = (invId: string) => {
    const invRow = cacheGet("investments")?.find((r: any) => r.id === invId) || null;
    const sa = eigeneSaDataFuerInvestmentRow(invRow) as any;
    return {
      p1: buildBonitaetDocs(sa?.beschaeftigungsart),
      p2: buildBonitaetDocsPerson2(sa?.person2Data?.beschaeftigungsart),
    };
  };

  const reloadKunde = () => {
    const k = getKontaktById(id || "");
    setKunde(k);
    setAktivitaeten(getAktivitaeten(id || ""));
    setInvestments(getInvestmentsByKontakt(id || ""));
    forceUpdate(n => n + 1);
  };

  const handleEigenDocUpload = (inv: any) => {
    if (!eigenDocTitel.trim()) return;
    const catName = eigenDocTitel.trim();
    const custom = getCustomKundenordnerKategorien(inv.id);
    if (![...getVisibleKundenordnerKategorien(inv.id), ...custom].includes(catName)) {
      setCustomKundenordnerKategorien(inv.id, [...custom, catName]);
    }
    // Open file picker
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
    fileInput.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      document.body.removeChild(fileInput);
      if (!file) return;
      try {
        const ext = file.name.split(".").pop() || "pdf";
        const filename = `${catName.replace(/\s+/g, "_")}_${kunde.nachname}.${ext}`;
        const storagePath = `kundenordner/${id}/${inv.id}/${sanitizeStorageKey(catName.replace(/\s+/g, "_"))}_${Date.now()}.${ext}`;
        await ladeUnterlagenDateiHoch(storagePath, file);
        addKundenordnerDokument({
          investmentId: inv.id,
          kategorie: catName,
          filename,
          uploadedBy: user.name,
          uploadedAt: new Date().toISOString(),
          fileUrl: storagePath,
          freigegeben: false,
        });
        setEigenDocInvId(null);
        setEigenDocTitel("");
        forceUpdate(n => n + 1);
        toast({ title: `"${catName}" hochgeladen ✓`, description: "Bitte noch freigeben, damit der Kunde es sehen kann." });
      } catch (err: any) {
        toast({ title: "Upload fehlgeschlagen", description: err.message || "Unbekannter Fehler", variant: "destructive" });
      }
    };
    fileInput.click();
  };

  const canChangeBerater = ["admin", "inhaber"].includes(user.role);
  // Zuständigkeit über die ID, der Name bleibt Rückfall (kontaktOwnership).
  // Der reine Namensvergleich sperrte den zuständigen Vertriebspartner aus,
  // sobald „berater" leer oder anders geschrieben war: kein „Portal
  // freischalten", keine Selbstauskunft, keine Reservierung, obwohl die
  // Datenbank ihn über zustaendig_id längst als Zuständigen kennt.
  const isAssignedBerater = !!kunde && kontaktBelongsToUser(kunde, { userName: user.name, userId: authUser?.id });
  // Zuständig oder heute als Vertretung eingetragen, für „Reservierung aufheben“.
  const vertretungFuer = useVertretungen(authUser?.id);
  const darfKundeBearbeiten = !!kunde && darfKontaktBearbeiten(kunde, { userName: user.name, userId: authUser?.id, vertretungFuer });
  // Effektiver Name des zugewiesenen Vertriebspartners.
  // Fällt auf den Profilnamen via `zustaendig_id` zurück, wenn das berater-Feld
  // (z. B. nach Zuweisung an einen Admin/Inhaber/Setterin via Auto-Assign) leer
  // ist. So wird in den Kundendaten IMMER angezeigt, an wen der Lead zugeteilt
  // wurde – unabhängig von der Nutzerrolle der zuständigen Person.
  const vertriebspartnerName = (() => {
    if (kunde?.berater && kunde.berater.trim()) return kunde.berater.trim();
    const zid = (kunde as any)?.zustaendig_id;
    if (!zid) return "";
    const u = loadAllUsers().find(x => x.id === zid);
    return u?.name || "";
  })();
  const isAdminOrInhaber = ["admin", "inhaber"].includes(user.role);
  // PDF-Selbstauskunft (Versand, Upload, Papierweg): freigegeben fuer die
  // Vertriebsrollen, die damit arbeiten (Entscheidung Christian, 30.08.2026).
  const darfPdfSelbstauskunft = ["admin", "inhaber", "vertriebsleiter", "vertriebspartner"].includes(user.role);
  // Videocall: admin/inhaber plus einzeln freigeschaltete Nutzer.
  const { darf: videocallFreigabe } = useVideocallFreigabe();
  const canDirectDelete = ["admin", "inhaber"].includes(user.role);
  /**
   * Der angemeldete Nutzer, wie ihn die Regeln in `lib/aktivitaetRechte.ts`
   * brauchen. Die Kennung entscheidet, der Name ist nur der Rückfall für
   * Altbestand ohne `benutzer_id` am Eintrag.
   */
  const aktivitaetRechte: Rechtekontext = {
    rolle: user.role as string,
    benutzerId: authUser?.id,
    name: user.name,
  };
  /** Wer im Verlauf auch fremde Einträge entfernen darf. */
  const istVerlaufLeitung = (LEITUNG_ROLLEN as readonly string[]).includes(user.role);
  /** Eintrag, dessen Loeschung gerade bestaetigt werden soll. */
  const [aktivitaetZumLoeschen, setAktivitaetZumLoeschen] = useState<AktivitaetEntry | null>(null);
  // Nachträgliches Bearbeiten von Notizen und Einträgen. Notizen entstehen oft
  // in Eile im Gespräch, bisher liessen sie sich gar nicht mehr korrigieren.
  const [aktivitaetZumBearbeiten, setAktivitaetZumBearbeiten] = useState<AktivitaetEntry | null>(null);
  const [bearbeitenText, setBearbeitenText] = useState("");
  const [bearbeitenDetails, setBearbeitenDetails] = useState("");
  const [bearbeitenSpeichert, setBearbeitenSpeichert] = useState(false);
  const [loeschtGerade, setLoeschtGerade] = useState(false);
  /** Notiz, deren Stern gerade gespeichert wird. */
  const [pinntGerade, setPinntGerade] = useState<string | null>(null);
  /** Selbst angelegte Aufgabe, die gerade nachträglich bearbeitet wird. */
  const [aufgabeZumBearbeiten, setAufgabeZumBearbeiten] = useState<AktivitaetEntry | null>(null);
  /**
   * Wer eine selbst angelegte Aufgabe oder einen selbst angelegten Termin
   * nachträglich ändern darf: der Ersteller sowie Admin und Inhaber. Die
   * Regel steht in `lib/aktivitaetRechte.ts` und ist dort geprüft.
   * Massgeblich bleibt die Datenbank: Die RLS der Tabelle `aufgaben` erlaubt
   * das Update dem Ersteller, dem Empfänger und der Leitung
   * (Migration 20260831120000), `aktivitaeten` jeder internen Rolle an ihren
   * sichtbaren Kunden.
   */
  const darfAufgabeBearbeiten = (a: AktivitaetEntry) => darfVorgangBearbeiten(a, aktivitaetRechte);
  const canFillSA = isAdminOrInhaber || isAssignedBerater;
  const canReserve = isAdminOrInhaber || isAssignedBerater;
  const canSwitchObjektDirect = ["admin", "inhaber", "objektpartner"].includes(user.role);
  const canSwitchObjekt = canSwitchObjektDirect || user.role === "vertriebspartner";
  const isSetterinRole = user.role === "setterin";
  const isVersicherungsexperte = user.role === "versicherungsexperte";
  const isFinanzierer = user.role === "finanzierungspartner";
  // VP/VL/Admin/Inhaber qualifizieren Leads selbst (egal ob manuell angelegt
  // oder automatisch via Zapier/Webhook reingekommen) → gleiches
  // Erstgesprächs-Skript wie die Setterin, mit angepasstem Wording und nur eigenem
  // Buchungskalender. Admin/Inhaber sehen das Skript für jeden Lead in
  // frühen Stufen (ohne Ownership-Filter), VP/VL nur für eigene.
  const isVpManuellQualifizierung = (() => {
    const allowedRoles = new Set(["vertriebspartner", "vertriebsleiter", "admin", "inhaber"]);
    if (!allowedRoles.has(user.role as string)) return false;
    if (!kunde) return false;
    const isPrivileged = user.role === "admin" || user.role === "inhaber";
    if (!isPrivileged) {
      const isMine = istZustaendig(kunde, { userName: user.name, userId: authUser?.id });
      if (!isMine) return false;
    }
    const earlyStufen = new Set(["neuer_lead", "zugewiesen", "kontaktversuche", "follow_up", "erstgespraech_geplant", "erstgespraech"]);
    const stufe = kunde.pipelineStufe || "neuer_lead";
    return earlyStufen.has(stufe);
  })();
  // Frühe Stufen (inkl. Legacy-Aliase wie „zugewiesen"/„kontaktversuche"),
  // in denen die Qualifizierungsfragen in den Stammdaten sichtbar sein sollen.
  // Achtung: Über `PIPELINE_STUFEN.findIndex` vergleichen ist nicht möglich,
  // da Legacy-Stufen am Ende des Arrays stehen und sonst fälschlich als
  // „nach Bonität" gelten würden.
  const QUAL_FRAGEN_STUFEN = new Set<string>([
    "neuer_lead", "zugewiesen", "kontaktversuche", "nicht_erreicht", "erreicht",
    "follow_up", "erstgespraech_geplant", "erstgespraech", "eg_noshow",
    "beratungsgespraech", "bg_noshow", "selbstauskunft",
  ]);
  const showQualifizierungsfragen = kunde
    ? QUAL_FRAGEN_STUFEN.has((kunde.pipelineStufe as string) || "neuer_lead")
    : false;
  const showSetterFlow = isSetterinRole || isVpManuellQualifizierung;
  // Erstgesprächs-Skript soll auch nach Pipeline-Advance sichtbar bleiben,
  // sobald es einmal befüllt/gespeichert wurde (Daniel Neumayer-Issue).
  const hasSavedSetterSkript = !!(kunde as any)?.setterSkript
    || !!(kunde as any)?.meta?.setterSkript
    || !!(kunde as any)?.setterSkriptNotizen;
  const canManageCustomerPortal = isAdminOrInhaber || isAssignedBerater;
  /*
   * Wer die Knöpfe am Kundenportal sieht: Admin, Inhaber und der zuständige
   * Vertriebspartner, aber nicht Finanzierer und Setterin (dort nur lesend).
   * Das ist dieselbe Bedingung, die vorher im Investment als
   * `canManageCustomerPortal && !isReadOnlyDocView` stand, jetzt einmal für
   * Investment und Kundenprofil.
   */
  const darfKundenportalVerwalten = canManageCustomerPortal && !isFinanzierer && !isSetterinRole;
  /*
   * Ein Bündel für den Portalblock an beiden Stellen, im Investment unter
   * „Bonität und Bankprüfung“ und im Kundenprofil unter den Kontaktdaten.
   * Das Portal hängt am Kontakt (`kontakte.meta`), nicht am Investment, bei
   * mehreren Investments steht also überall derselbe Stand.
   */
  const kundenportalAngaben: KundenportalZugangAngaben = {
    status: portalStatus,
    freigeschaltetAm: portalMeta.portalActivatedAt,
    gesperrtAm: portalMeta.portalGesperrtAt,
    einladungErneutAm: portalMeta.portalInviteResentAt,
    person2Email: kunde?.person2?.email,
    person2Eingeladen: !!portalMeta.person2Invited,
    darfVerwalten: darfKundenportalVerwalten,
    // Serverseitig prüft `manage-mfa` (Aktion `admin_reset`) dieselben Rollen.
    darfZweiFaktorZuruecksetzen: isAdminOrInhaber,
    einladungGesendet: resendSuccess,
    zweiFaktorLaeuft: mfaResetLaeuft,
    onPerson2Einladen: handleInvitePerson2,
    onEinladungErneut: handleResendPortalInvite,
    onZweiFaktorZuruecksetzen: handleMfaZuruecksetzen,
    onSperren: handlePortalSperren,
    onEntsperren: handlePortalEntsperren,
    sperreLaeuft: portalSperreLaeuft,
  };
  const canSeeVermoegenTab = isVersicherungsexperte || isAdminOrInhaber || (user.role as string) === "vertriebsleiter";

  /*
   * Interner Chat und Kundenchat waren bis Welle 3 Weiterleitungen.
   *
   * Hier standen `handleOpenInternalChat` und `handleOpenKundenChat`, dazu ein
   * Effekt, der die beiden Reiterschluessel abfing, per `navigate` auf
   * `/chat?id=...` sprang und den Reiter sofort auf die Stammdaten
   * zuruecksetzte. Das Profil war damit bei jedem Blick in den Verlauf weg.
   *
   * Beide Verlaeufe stehen jetzt im Reiter "Kommunikation" im Profil selbst.
   * Das Anlegen der Chatgruppe bei Bedarf ist nicht verschwunden, es steht in
   * `components/kunde/KommunikationReiter.tsx` und laeuft dort erst, wenn der
   * jeweilige Verlauf wirklich geoeffnet wird.
   */

  /*
   * Reservierung aufheben und Einheit wechseln, ein Ablauf (05.10.2026).
   *
   * Christian: Beide Knöpfe müssen dasselbe bewirken. Einheit oder Haus
   * freigeben, die Vereinbarung archivieren statt löschen (Beleg, sechs Jahre
   * aufzubewahren), offene Unterschriftslinks ungültig machen, das Objekt in
   * den Verlauf legen und den Vorgang zurück auf die Objektauswahl setzen.
   * Dort stehen danach wieder die Empfehlungen. Der Ablauf selbst steht in
   * `lib/reservierungAufheben.ts`, hier nur Rückfragen und Meldungen.
   *
   * Die Erfolgsmeldung kommt erst, wenn die Datenbank die Archivierung
   * bestätigt hat. Lehnt sie das Freigeben der Einheit ab, bleibt alles, wie
   * es war.
   */
  const reservierungAufhebenAusfuehren = async (
    invId: string,
    ziel: { objektId?: string; wohnungId?: string; hausFreigeben?: boolean },
    anlass: "aufgehoben" | "einheit_gewechselt",
  ) => {
    if (!kunde || !id) return;
    // Erst das Wechselfenster schließen, sonst liegen zwei Fenster übereinander.
    setSwitchObjektDialog(null);
    const grund = await abfrageDialog({
      title: "Grund für die Aufhebung",
      description: "Freiwillig. Der Grund steht danach im Verlauf und bei der archivierten Vereinbarung.",
      placeholder: "z. B. Kunde möchte eine andere Einheit",
      confirmText: "Grund übernehmen",
      cancelText: "Ohne Grund weiter",
    });
    const invVorher = investments.find(i => i.id === invId);
    const objektVorher = [invVorher?.objektTitel, invVorher?.weNr ? `WE ${invVorher.weNr}` : ""].filter(Boolean).join(" ");
    const ergebnis = await reservierungAufheben({
      investmentId: invId,
      kontaktId: id,
      objektId: ziel.objektId,
      wohnungId: ziel.wohnungId,
      hausFreigeben: ziel.hausFreigeben,
      anlass,
      vonName: user.name,
      vonId: authUser?.id,
      grund: grund || undefined,
      darfOffeneLinksLoeschen: isAdminOrInhaber,
    });
    if ("schritt" in ergebnis) {
      await hinweisDialog({
        title: ergebnis.schritt === "einheit" ? "Reservierung nicht aufgehoben" : "Vereinbarung nicht archiviert",
        description: ergebnis.schritt === "einheit"
          ? `${ergebnis.text} Am Investment wurde nichts geändert.`
          : ergebnis.text,
        buttonText: "Verstanden",
      });
      setInvestments(getInvestmentsByKontakt(id));
      reloadKunde();
      forceUpdate(n => n + 1);
      return;
    }
    if (!ergebnis.ok) return;
    setInvestments(getInvestmentsByKontakt(id));
    reloadKunde();
    forceUpdate(n => n + 1);
    const kundeName = `${kunde.vorname} ${kunde.nachname}`.trim();
    notifyReservierungAufgehoben(kundeName, id, authUser?.id, user.name, objektVorher || undefined);
    const hinweise = [
      ergebnis.pdfArchiviert === null ? "Die Archivkopie des PDFs ließ sich nicht anlegen, die Datei liegt weiter am ursprünglichen Ort." : "",
      ergebnis.linksUngueltig === null && !isAdminOrInhaber ? "Ein noch offener Unterschriftslink läuft erst mit seiner Frist ab, bitte den Kunden informieren." : "",
      ergebnis.zuruecksetzenUnsicher ? "Die Objektauswahl wurde nicht bestätigt gespeichert, bitte die Seite neu laden und prüfen." : "",
    ].filter(Boolean);
    toast({
      title: anlass === "einheit_gewechselt" ? "Einheit freigegeben" : "Reservierung aufgehoben",
      description: ["Die Vereinbarung liegt archiviert im Kundenordner. Der Vorgang steht wieder auf der Objektauswahl.", ...hinweise].join(" "),
    });
    addAktivitaet({
      kundeId: id,
      art: "notiz",
      beschreibung: `${anlass === "einheit_gewechselt" ? "Einheit gewechselt" : "Reservierung aufgehoben"}${objektVorher ? ` (${objektVorher})` : ""}, Vereinbarung archiviert, zurück auf die Objektauswahl${grund ? `. Grund: ${grund}` : ""}`,
      von: user.name,
    });
  };

  const handleSwitchObjekt = (invId: string, objektId: string, wohnungId: string) =>
    reservierungAufhebenAusfuehren(invId, { objektId, wohnungId }, "einheit_gewechselt");

  const handleCancelReservation = async (invId: string, ziel: { objektId?: string; wohnungId?: string; hausFreigeben?: boolean }) => {
    if (!kunde) return;
    const ok = await confirmDialog({
      title: "Reservierung wirklich aufheben?",
      description:
        "Die Einheit wird wieder freigegeben und die Reservierungsvereinbarung aufgehoben. Eine unterschriebene Fassung wird nicht gelöscht, sie bleibt als aufgehoben im Kundenordner. Der Vorgang geht zurück auf die Objektauswahl, danach kann neu gewählt und reserviert werden.",
      confirmText: "Reservierung aufheben",
      cancelText: "Bestehen lassen",
      variant: "destructive",
    });
    if (!ok) return;
    await reservierungAufhebenAusfuehren(invId, ziel, "aufgehoben");
  };

  // ── Tab definitions ──
  // Die Liste selbst steht oben in `baueReiter`, damit die Reiterleiste und die
  // Pruefung von `?tab=` nicht auseinanderlaufen koennen.
  // Der Vermögensaufbau-Reiter ist im Kundenprofil weiterhin für alle Rollen
  // ausgeblendet, `renderVermoegenaufbau` bleibt aber erreichbar.
  /*
   * Der Zaehler am Reiter "Kommunikation".
   *
   * Gezaehlt werden einzelne ungelesene Nachrichten beider Verlaeufe dieses
   * Kunden zusammen, nicht die Zahl der Chats mit Ungelesenem. Die Zeilen
   * tragen dafuer `gelesen_von`, das reicht fuer die genaue Zahl.
   * `chatLiveVersion` sorgt dafuer, dass der Zaehler faellt, sobald der Reiter
   * die Nachrichten als gelesen markiert hat.
   */
  const chatLiveVersion = useLiveVersion(["chat_nachrichten", "chat_gruppen"]);
  const ungeleseneKommunikation = useMemo(
    () => (id ? getUnreadChatCountForKunde(id, authUser?.id || "") : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, authUser?.id, chatLiveVersion],
  );
  const tabs = baueReiter(user.role as string, investments, ungeleseneKommunikation);

  // ── Setter inline state ──
  interface CloserEntry { id: string; name: string; buchungslink: string; }
  const SETTER_CHECKLIST_ITEMS = [
    { id: "kontaktdaten_geprueft", label: "Kontaktdaten auf Richtigkeit geprüft (Name, Telefon, E-Mail)", autoCheck: isSetterinRole },
    { id: "daten", label: "Vorname, Nachname (Schreibweise) & E-Mail-Adresse auf Korrektheit geprüft (weitere Kundendaten optional)" },
    { id: "qualifikation", label: "Qualifizierungsfragen ausgefüllt", autoCheck: true },
    { id: "termin", label: "Beratungsgespräch vereinbaren" },
  ];
  const [setterNotizen, setSetterNotizen] = useState(kunde?.setterSkriptNotizen || "");
  const [setterTerminGebucht, setSetterTerminGebucht] = useState(kunde?.setterTerminGebucht || false);
  // Highlight für fehlende Pflichtfelder in „Beratungsgespräch vereinbaren"
  // (wird kurz gesetzt, wenn der Abschluss-Button bei fehlenden Feldern geklickt wird).
  const [setterTerminHighlight, setSetterTerminHighlight] = useState(false);
  /*
   * „Beratungsgespräch vereinbaren“ und „Erstgesprächs-Skript“ sind die
   * einzigen Kästen im Investment, die sich klappen lassen (Christian,
   * 29.09.2026). Beim Öffnen des Profils stehen beide zu. Bewusst ohne
   * gemerkten Zustand: Wer das Profil neu öffnet, sieht wieder die kurze
   * Fassung.
   */
  const [beratungKastenOffen, setBeratungKastenOffen] = useState(false);
  const [skriptKastenOffen, setSkriptKastenOffen] = useState(false);
  const [setterTerminBeiBeraterGebucht, setSetterTerminBeiBeraterGebucht] = useState(false);
  const [setterTerminDatum, setSetterTerminDatum] = useState(kunde?.setterTerminDatum || "");
  const [setterTerminUhrzeit, setSetterTerminUhrzeit] = useState(kunde?.setterTerminUhrzeit || "");
  const [setterChecklist, setSetterChecklist] = useState<Record<string, boolean>>(() => {
    if (isTestAccount()) {
      try { const raw = localStorage.getItem(`mi_setter_checklist_${kunde?.id}`); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
    }
    return getUserSetting<Record<string, Record<string, boolean>>>("setter_checklists", {})[kunde?.id || ""] || {};
  });
  const [setterSelectedCloser, setSetterSelectedCloser] = useState(kunde?.setterCloser || "");
  const [setterSelectedBerater, setSetterSelectedBerater] = useState(kunde?.berater || "");
  // Kennung des gewaehlten Partners. Zwei Partner koennen gleich heissen.
  const [setterSelectedBeraterId, setSetterSelectedBeraterId] = useState<string | undefined>(kunde?.zustaendig_id || undefined);
  const [setterEditMode, setSetterEditMode] = useState(false);
  const [setterNewDatum, setSetterNewDatum] = useState(kunde?.setterTerminDatum || "");
  const [setterNewUhrzeit, setSetterNewUhrzeit] = useState(kunde?.setterTerminUhrzeit || "");
  const [setterNewBerater, setSetterNewBerater] = useState(kunde?.berater || "");
  const [setterNewBeraterId, setSetterNewBeraterId] = useState<string | undefined>(kunde?.zustaendig_id || undefined);
  const [setterClosers] = useState<CloserEntry[]>(() => {
    if (isTestAccount()) {
      try { const raw = localStorage.getItem("mi_setter_closer_list"); return raw ? JSON.parse(raw) : []; } catch { return []; }
    }
    // closer_list is a separate column on user_settings, not inside einstellungen
    const rows = cacheGet("user_settings");
    const row = rows[0] || null;
    return (row?.closer_list as CloserEntry[]) || [];
  });
  const [setterVertriebspartner] = useState(() => {
    if (isTestAccount()) {
      try {
        const raw = localStorage.getItem("mi_nutzer");
        if (!raw) return [];
        const nutzer = JSON.parse(raw);
        return nutzer
          // Bewusst ueber die Rollen-Kennung (kleingeschrieben) statt ueber den
          // Anzeigenamen: der kann "Lead-Berater" lauten und ist keine eigene Rolle.
          .filter((n: any) => n.status === "aktiv" && (
            n.rollen?.includes("vertriebspartner") || n.rollen?.includes("admin") ||
            (n.rolle || "").toLowerCase() === "vertriebspartner" || (n.rolle || "").toLowerCase() === "admin"
          ))
          .map((n: any) => ({ id: n.id, name: `${n.vorname} ${n.nachname}` }));
      } catch { return []; }
    }
    return cacheGet("profiles").map((p: any) => ({ id: p.id, name: p.name }));
  });
  const [setterDirty, setSetterDirty] = useState(false);
  const [setterKontaktGeprueft, setSetterKontaktGeprueft] = useState(() => {
    if (isTestAccount()) {
      try { return !!JSON.parse(localStorage.getItem(`mi_setter_kontakt_geprueft_${kunde?.id}`) || "false"); } catch { return false; }
    }
    return getUserSetting<Record<string, boolean>>("setter_kontakt_geprueft", {})[kunde?.id || ""] || false;
  });

  // ──────────────────────────────────────────────────────
  // Per-Investment-Scoping der Erstgespräch-/Termin-Daten.
  // Jedes Investment hat eigenes Skript + Termin + „gebucht"-Status.
  // Beim Wechsel des Investment-Tabs (z. B. Investment 1 → 2) wird der
  // State aus investment.meta neu geladen, damit nicht die Daten von
  // Investment 1 fälschlich in Investment 2 angezeigt werden.
  // ──────────────────────────────────────────────────────
  // Das offene Investment. Seit Welle 2 steckt es nicht mehr im Reiterschluessel,
  // sondern in der Auswahl innerhalb des Reiters "Investments".
  const activeInvId = activeTab === "investments" ? gewaehltesInvestment : null;
  const activeInv = activeInvId ? investments.find(i => i.id === activeInvId) : null;
  const minInvNummer = investments.length > 0 ? Math.min(...investments.map(i => i.nummer ?? 1)) : 1;
  const activeInvIsFirst = !!activeInv && (activeInv.nummer ?? 1) === minInvNummer;

  const _privilegedRolesSkript = new Set(["setterin", "vertriebspartner", "vertriebsleiter", "admin", "inhaber"]);
  // Für privilegierte Rollen wird das Erstgesprächs-Skript pro Investment IMMER
  // angezeigt (auch wenn die Stufe schon weiter ist) – so bleiben die im Skript
  // gemachten Notizen und Antworten dauerhaft einsehbar.
  const showSetterSkriptForInvestment = _privilegedRolesSkript.has(user.role as string) && !!activeInvId;
  const hasSavedSetterSkriptKontakt = !!(kunde as any)?.setterSkript
    || !!(kunde as any)?.meta?.setterSkript
    || !!(kunde as any)?.setterSkriptNotizen;
  const showSetterSkriptSection = showSetterFlow || showSetterSkriptForInvestment || hasSavedSetterSkriptKontakt;

  useEffect(() => {
    if (!activeInvId || !activeInv) return;
    const im: any = (activeInv as any).meta || {};
    // Legacy-Fallback nur fürs erste Investment, damit bestehende Daten
    // (am Kontakt gespeichert) weiterhin sichtbar bleiben.
    const fb: any = activeInvIsFirst ? (kunde || {}) : {};
    setSetterTerminGebucht(im.setterTerminGebucht ?? fb?.setterTerminGebucht ?? false);
    setSetterTerminDatum(im.setterTerminDatum ?? fb?.setterTerminDatum ?? "");
    setSetterTerminUhrzeit(im.setterTerminUhrzeit ?? fb?.setterTerminUhrzeit ?? "");
    setSetterNotizen(im.setterSkriptNotizen ?? fb?.setterSkriptNotizen ?? "");
    setSetterEditMode(false);
    setSetterNewDatum(im.setterTerminDatum ?? fb?.setterTerminDatum ?? "");
    setSetterNewUhrzeit(im.setterTerminUhrzeit ?? fb?.setterTerminUhrzeit ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInvId]);

  // ──────────────────────────────────────────────────────
  // Sync: Aus dem aktuellsten Investment (höchste Nummer) werden die
  // Skript-Antworten "Berufliche Situation" und "Ziele" in die
  // Qualifizierungsfragen-Felder auf Stammdaten übertragen.
  // Andere Qual-Felder (Einkommen / Eigenkapital) werden bereits direkt
  // beim Tippen im Skript synchronisiert.
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !kunde || investments.length === 0) return;
    const latest = investments.reduce((acc, inv) =>
      (inv.nummer ?? 0) > (acc.nummer ?? 0) ? inv : acc,
      investments[0]
    );
    const skript: any = (latest as any)?.meta?.setterSkript || {};
    const antworten: Record<string, string> = skript.antworten || {};
    const ziele: string[] = Array.isArray(skript.ziele) ? skript.ziele : [];
    /*
     * Nur leere Felder füllen, nie überschreiben.
     *
     * Dieser Abgleich lief bis zum 29.09.2026 nie, weil `inv.meta` leer
     * ankam. Seit er läuft, hätte er bei jedem Öffnen des Profils eine spätere
     * Änderung in den Stammdaten mit dem alten Skriptstand zurückgesetzt. Das
     * Skript schreibt beim Tippen ohnehin direkt in den Kontakt.
     */
    const patch: Record<string, any> = {};
    const beruf = (antworten.beruf || "").trim();
    if (beruf && !(kunde.qualBeruflicheSituation || "").trim()) {
      patch.qualBeruflicheSituation = beruf;
    }
    const zielJoined = ziele.join(", ");
    if (zielJoined && !(kunde.qualZiel || "").trim()) {
      patch.qualZiel = zielJoined;
    }
    if (Object.keys(patch).length > 0) {
      updateKontakt(id, patch as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, investments.map(i => `${i.id}-${i.nummer}-${JSON.stringify((i as any)?.meta?.setterSkript?.antworten?.beruf || "")}-${JSON.stringify((i as any)?.meta?.setterSkript?.ziele || [])}`).join("|")]);

  const toggleSetterChecklist = (itemId: string) => {
    setSetterChecklist(prev => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      if (isTestAccount()) {
        localStorage.setItem(`mi_setter_checklist_${kunde?.id}`, JSON.stringify(next));
      } else {
        const all = getUserSetting<Record<string, Record<string, boolean>>>("setter_checklists", {});
        all[kunde?.id || ""] = next;
        setUserSetting("setter_checklists", all);
      }
      return next;
    });
    setSetterDirty(true);
  };
  const hasQualFilled = !!(kunde?.qualZiel && kunde?.qualEinkommen && kunde?.qualEigenkapital && kunde?.qualBeruflicheSituation);
  const hasNotizenFilled = setterNotizen.trim().length > 0;
  const isSetterItemChecked = (itemId: string) => {
    if (itemId === "qualifikation") return hasQualFilled;
    if (itemId === "kontaktdaten_geprueft") {
      // Setterin: automatisch aus dem Stammdaten-Häkchen, VP: manuell hier abhakbar
      if (isSetterinRole) return setterKontaktGeprueft;
      return setterKontaktGeprueft || !!setterChecklist[itemId];
    }
    return !!setterChecklist[itemId];
  };
  const allSetterChecklistDone = SETTER_CHECKLIST_ITEMS.every(item => isSetterItemChecked(item.id));
  const missingSetterItems = SETTER_CHECKLIST_ITEMS.filter(item => !isSetterItemChecked(item.id));

  const handleSetterSave = async () => {
    if (!id) return;
    const saveData: Record<string, any> = {
      setterSkriptNotizen: setterNotizen,
      setterTerminGebucht: setterTerminGebucht,
      setterTerminDatum: setterTerminDatum,
      setterTerminUhrzeit: setterTerminUhrzeit,
      setterChecklisteDone: allSetterChecklistDone,
      setter: kunde?.setter || user.name,
    };
    // Wenn Termin gebucht → pipelineStufe auf "erstgespraech_geplant"
    if (setterTerminGebucht && setterTerminDatum) {
      saveData.pipelineStufe = "erstgespraech_geplant";
      saveData.status = "kontaktiert";
      notifyTerminGebucht(`${kunde.vorname} ${kunde.nachname}`, setterTerminDatum, id);
    }
    // Bei vollständiger Checkliste: Lead an Vertriebspartner übergeben
    const uebergabe = !!(allSetterChecklistDone && setterSelectedBerater);
    // Kennung zuerst, der Name nur bei genau einem Treffer.
    const beraterUser = uebergabe ? findeSetterBerater(setterSelectedBeraterId, setterSelectedBerater) : undefined;
    if (uebergabe) {
      saveData.berater = setterSelectedBerater;
      saveData.setterCloser = setterSelectedBerater;
      saveData.setterCloserId = beraterUser?.id || setterSelectedBeraterId;
      // Die Zustaendigkeit ueber die Kennung, wie im Setter-Skript. Bis zum
      // 29.09.2026 stand hier nur der Name: Der Lead lag danach ohne
      // Zustaendigen, und der Partner konnte ihn nicht oeffnen.
      if (beraterUser) saveData.zustaendig_id = beraterUser.id;
      saveData.pipelineStufe = "erstgespraech_geplant";
      saveData.status = "qualifiziert";
    }
    let gespeichert = false;
    try {
      gespeichert = await updateKontakt(id, saveData);
    } catch {
      gespeichert = false;
    }
    if (!gespeichert) {
      reloadKunde();
      await hinweisDialog({
        title: "Nicht gespeichert",
        description: uebergabe
          ? "Die Übergabe an den Vertriebspartner wurde nicht gespeichert. Der Lead bleibt, wo er ist, und niemand wurde benachrichtigt. Bitte später noch einmal versuchen."
          : "Die Angaben wurden nicht gespeichert. Bitte später noch einmal versuchen.",
      });
      return;
    }
    if (uebergabe) {
      addAktivitaet({ kundeId: id, art: "notiz", beschreibung: `Lead qualifiziert und an Vertriebspartner ${setterSelectedBerater} übergeben`, von: user.name });
      notifyLeadQualifiziert(`${kunde.vorname} ${kunde.nachname}`, setterSelectedBerater, id);
      // Erst nach dem Speichern: Die Glocke prueft, ob der Lead ihm jetzt gehoert.
      if (beraterUser) {
        notifyLeadZugewiesen(`${kunde.vorname} ${kunde.nachname}`, setterSelectedBerater, beraterUser.id, id);
      }
    }
    reloadKunde();
    setSetterDirty(false);
    toast({ title: allSetterChecklistDone && setterSelectedBerater ? "Lead übergeben & gespeichert ✓" : "Daten gespeichert ✓" });
    if (allSetterChecklistDone && setterSelectedBerater) {
      navigate("/lead-verwaltung");
    }
  };

  // ── Setter outcome button handlers ──
  // Liste aller VPs mit Buchungslinks wird in mehreren Bereichen gebraucht
  // (Setter-Flow, VP-Selbst-Qualifizierung UND das „Beratungsgespräch
  // vereinbaren"-Kästchen, das auch Admins/Inhabern im Erstgesprächs-Skript
  // angezeigt wird). Deshalb immer laden, wenn das Skript-/Buchungs-Kästchen
  // sichtbar ist – nicht nur im reinen Setter-Flow.
  const beraterUsersForSetterRaw = (showSetterFlow || showSetterSkriptSection) ? loadBeraterUsers() : [];
  // Für reine Setterinnen (ohne Admin-Rolle): Test-/Admin-Accounts ausblenden
  const userHasAdmin = (() => {
    const userRolesAll = cacheGet("user_roles");
    const myRoles = userRolesAll.filter((r: any) => r.user_id === authUser?.id).map((r: any) => r.role);
    return myRoles.includes("admin") || myRoles.includes("inhaber");
  })();
  const beraterUsersForSetter = (() => {
    if (!showSetterFlow && !showSetterSkriptSection) return [];
    // VP qualifiziert sich selbst → nur eigenen Eintrag anzeigen.
    if (isVpManuellQualifizierung) {
      // Ueber die eigene Kennung. Der Name nur, wenn keine Kennung da ist:
      // Sonst griffe er bei einem Namensvetter.
      const me = authUser?.id
        ? beraterUsersForSetterRaw.find(u => u.id === authUser.id)
        : beraterUsersForSetterRaw.find(u => (u.name || "").trim().toLowerCase() === (user.name || "").trim().toLowerCase());
      return me ? [me] : [];
    }
    // Alle Vertriebspartner anzeigen – inkl. Doppelrollen wie Admin/Inhaber/Setterin.
    // Wichtig, damit Personen wie Christian Peetz mit hinterlegtem Buchungslink
    // im Setter-Buchungsfenster auswählbar sind.
    return beraterUsersForSetterRaw;
  })();
  // Kennung zuerst, aber nur, wenn ihr Name zum gewaehlten Namen passt;
  // sonst der Name, und nur, wenn genau ein Partner so heisst.
  const findeSetterBerater = (uid: string | undefined, name: string) => {
    const kennung = kennungMitNamensprobe(uid, name, beraterUsersForSetter);
    return kennung ? beraterUsersForSetter.find(u => u.id === kennung) : undefined;
  };

  /**
   * @param opts.ohneNachfassAufgabe Der Nutzer hat im Anruf-Protokoll selbst
   *   eine Aufgabe angelegt. Dann entfällt die automatische „Nachfassen"-
   *   Aufgabe der fortgeschrittenen Stufe: Seine Aufgabe trägt den Termin, den
   *   er gewählt hat, und zwei Aufgaben für denselben Rückruf ließen eine
   *   davon ewig offen in der Inbox stehen. Alles andere läuft unverändert.
   */
  const handleSetterNichtErreicht = (opts: { ohneNachfassAufgabe?: boolean } = {}) => {
    if (!id || !kunde) return;
    const count = (kunde.nichtErreichtCount || 0) + 1;
    const totalMax = MAX_KONTAKTVERSUCHE;

    // Guard: Ab Stufe "beratungsgespraech" aufwärts keine Wartezeit/Auto-Stufenwechsel/Auto-Verloren
    // mehr — nur Aktivität + Inbox-Aufgabe, damit VP manuell nachfassen kann.
    const effStufe = getEffectivePipelineStufe(kunde);
    /*
     * Die eine Rangfolge aus `pipelineStufen`, nicht mehr eine eigene Liste.
     *
     * Hier stand eine handgepflegte Reihenfolge, die seit dem Tausch vom
     * 06.08.2026 falsch war: Sie führte "bonitaetsunterlagen" noch vor
     * "objektauswahl". Für diesen Vergleich fiel das nicht auf, weil beide
     * hinter "beratungsgespraech" liegen, aber eine falsche Liste im Code ist
     * eine Falle für die nächste Änderung.
     */
    const isAdvancedStage = fortschrittsRang(effStufe) >= fortschrittsRang("beratungsgespraech");
    if (isAdvancedStage) {
      updateKontakt(id, {
        setterSkriptNotizen: setterNotizen,
        nichtErreichtCount: count,
        setter: kunde?.setter || (isSetterinRole ? user.name : undefined),
      });
      addAktivitaet({ kundeId: id, art: "anruf", beschreibung: `Kontaktversuch ${count} – Nicht erreicht (Stufe „${effStufe}"). Keine Wartezeit, bitte manuell nachfassen.`, von: user.name });
      if (!opts.ohneNachfassAufgabe) {
        try {
          addGeteilteAufgabe({
            titel: `Nachfassen: ${kunde.vorname} ${kunde.nachname}`.trim(),
            beschreibung: `Kunde nicht erreicht in fortgeschrittener Stufe „${effStufe}". Bitte Termin klären.`,
            prioritaet: "hoch",
            typ: "aufgabe",
            faellig_am: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            uhrzeit: "10:00",
            kundeId: id,
            kundeName: `${kunde.vorname} ${kunde.nachname}`.trim(),
            // Kennzeichnet die Aufgabe als selbst erzeugte Wiedervorlage aus
            // einem Kontaktversuch. Die Pipeline-Ampel darf sie deshalb nicht
            // als versäumten Termin werten: Es gab nie einen Termin, nur einen
            // Anruf, bei dem niemand rangegangen ist.
            ausloeserSchluessel: `nicht_erreicht:${id}`,
          });
        } catch (e) { console.warn("addInboxTask (advanced-stage nicht erreicht) failed:", e); }
      }
      reloadKunde();
      toast({
        title: "Nicht erreicht protokolliert",
        description: opts.ohneNachfassAufgabe
          ? "Deine Aufgabe steht in der Inbox."
          : `Aufgabe „Nachfassen" wurde in der Inbox erstellt.`,
      });
      return;
    }

    /*
     * Mail an den Lead: nur beim 1., 4. und 10. verpassten Anruf, immer vom
     * zuständigen Partner, auch wenn eine Setterin klickt. Entscheidung,
     * Zählung je Partner und Versand stehen zentral in nichtErreichtMails.ts.
     */
    const nichtErreichtMails = nichtErreichtMailVerarbeiten(kunde, { fortgeschritten: isAdvancedStage }) ?? undefined;

    // Kein Auto-Verloren mehr: Ein Lead wird nur noch manuell auf „verloren"
    // gesetzt. Bei mehreren Investments war eine zentrale Zaehlgrenze nicht
    // sinnvoll zuzuordnen.

    // Gestaffelte Wartezeiten gemäß kontaktversuchSchedule.ts
    const verstecktBis = getVerstecktBisForVersuch(count) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const hideLabel = getWartezeitLabel(count);

    updateKontakt(id, {
      setterSkriptNotizen: setterNotizen,
      nichtErreichtCount: count,
      nichtErreichtMails,
      verstecktBis,
      pipelineStufe: "nicht_erreicht",
      status: "kontaktiert" as any,
      setter: kunde?.setter || (isSetterinRole ? user.name : undefined),
    });
    // Nur das AKTUELLSTE Investment (höchste nummer) mitziehen – ältere
    // Investments bleiben unverändert, damit deren Stand nicht überschrieben wird.
    try {
      const invs = getInvestmentsByKontakt(id) || [];
      if (invs.length > 0) {
        const latest = [...invs].sort((a, b) => (b.nummer || 0) - (a.nummer || 0))[0];
        const earlyStages = new Set(["neuer_lead","zugewiesen","kontaktversuche","nicht_erreicht","erreicht","follow_up","erstgespraech_geplant", "erstgespraech"]);
        if (latest && earlyStages.has(String(latest.pipelineStufe))) {
          updateInvestment(latest.id, { pipelineStufe: "nicht_erreicht" } as any);
        }
      }
    } catch (e) { console.warn("Investment nicht_erreicht sync failed", e); }
    addAktivitaet({ kundeId: id, art: "anruf", beschreibung: `Kontaktversuch ${count}/${totalMax} – Nicht erreicht. Nächster Versuch in ${hideLabel}.`, von: user.name });

    reloadKunde();
    toast({ title: "Nicht erreicht", description: `Versuch ${count}/${totalMax}. Nächster Versuch in ${hideLabel}.` });
  };

  // Follow-Up Dialog state
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [followUpTitel, setFollowUpTitel] = useState("");
  const [followUpDatum, setFollowUpDatum] = useState("");
  const [followUpUhrzeit, setFollowUpUhrzeit] = useState("09:00");

  const handleSetterFollowUpOpen = () => {
    if (!kunde) return;
    setFollowUpTitel(`Follow-Up: ${kunde.vorname} ${kunde.nachname}`);
    // Lokaler Kalendertag: das UTC-Datum ist zwischen 0 und 2 Uhr noch gestern.
    const inZweiTagen = new Date();
    inZweiTagen.setDate(inZweiTagen.getDate() + 2);
    setFollowUpDatum(lokalesDatum(inZweiTagen));
    setFollowUpUhrzeit("09:00");
    setFollowUpDialogOpen(true);
  };

  const handleSetterFollowUpConfirm = async () => {
    if (!id || !kunde || !followUpDatum || !followUpTitel.trim()) return;
    const uhr = followUpUhrzeit || "09:00";
    if (!istTerminInZukunft(followUpDatum, uhr)) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
      return;
    }
    const verstecktBisDate = new Date(`${followUpDatum}T${uhr}`);
    const verstecktBis = verstecktBisDate.toISOString();
    // 3-stufige Eskalation: 0h (Fälligkeit), +3h, +24h
    const eskalation3h = new Date(verstecktBisDate.getTime() + 3 * 60 * 60 * 1000);
    const eskalation24h = new Date(verstecktBisDate.getTime() + 24 * 60 * 60 * 1000);
    const fmtDate = lokalesDatum;
    const fmtTime = (d: Date) => d.toTimeString().slice(0, 5);
    addFollowUp({
      kundeId: id,
      kundeName: `${kunde.vorname} ${kunde.nachname}`,
      berater: kunde.berater || "",
      pipelineStufe: "follow_up",
      typ: "anruf",
      titel: followUpTitel,
      beschreibung: `Follow-Up am ${followUpDatum} um ${uhr} Uhr`,
      faelligAm: followUpDatum,
      prioritaet: "hoch",
      automatisch: false,
    });
    addGeteilteAufgabe({
      titel: followUpTitel,
      beschreibung: `Follow-Up am ${followUpDatum} um ${uhr} Uhr — Stufe 1/3`,
      prioritaet: "hoch",
      typ: "follow_up",
      faellig_am: followUpDatum,
      uhrzeit: uhr,
      kundeId: id,
      kundeName: `${kunde.vorname} ${kunde.nachname}`,
    });
    // Stufe 2/3 und 3/3 werden erst erzeugt, wenn sie wirklich fällig sind
    // (siehe useFollowUpInboxEscalation). So liegt nur die initiale Aufgabe
    // in der Inbox – Eskalationen erscheinen nur, wenn der Lead noch in der
    // Follow-Up-Stufe steht und kein neuer Termin in der Zukunft gesetzt wurde.
    // Follow-Up Termin in Meta persistieren (für Liste, Cron-Eskalation & Anzeige).
    // Eskalations-Flags zurücksetzen, damit der Cron alle 3 Stufen neu auslöst.
    // Muss VOR updateKontakt laufen und abgewartet werden, sonst baut
    // updateKontakt das meta aus dem alten Zwischenspeicher neu auf und die
    // Follow-Up-Felder sind sofort wieder weg.
    await mergeKontaktMeta(id, {
      followUpAm: followUpDatum,
      followUpUhrzeit: uhr,
      followUpGesetztAm: new Date().toISOString(),
      followUpEsk1Sent: null,
      followUpEsk2Sent: null,
      followUpEsk3Sent: null,
    });
    updateKontakt(id, { setterSkriptNotizen: setterNotizen, pipelineStufe: "follow_up", status: "kontaktiert" as any, verstecktBis, setter: kunde?.setter || (isSetterinRole ? user.name : undefined) });
    // Investments, die noch in einer frühen Stufe stehen, ebenfalls auf "follow_up"
    // setzen — sonst überschreibt die Investment-zentrische Bucket-Logik den
    // Kontakt-Status und der Lead taucht nicht auf der Follow-Up-Seite auf.
    try {
      const earlyInvStufen = new Set(["neuer_lead", "zugewiesen", "kontaktversuche", "erstgespraech_geplant", "erstgespraech"]);
      for (const _inv of investments) {
        if (earlyInvStufen.has(String(_inv?.pipelineStufe || ""))) {
          updateInvestment(_inv.id, { pipelineStufe: "follow_up" });
        }
      }
    } catch (e) { console.error("updateInvestment (followUp) error:", e); }
    addAktivitaet({ kundeId: id, art: "notiz", beschreibung: `${FOLLOW_UP_GEPLANT} "${followUpTitel}" am ${followUpDatum} um ${followUpUhrzeit} Uhr`, von: user.name });
    notifyFollowUpErstellt(`${kunde.vorname} ${kunde.nachname}`, followUpTitel, id);
    reloadKunde();
    setFollowUpDialogOpen(false);
    toast({ title: "Follow-Up erstellt", description: `"${followUpTitel}" am ${followUpDatum} um ${uhr} Uhr. Lead wandert in „Follow-Up". Eskaliert in 3 Stufen (sofort / +3h / +24h) ohne Aktivität.` });
    navigate("/follow-up");
  };

  const handleSetterDatenFalsch = () => {
    if (!id || !kunde) return;
    // E-Mail an Lead mit Bitte um Korrektur (sofern E-Mail hinterlegt)
    const leadName = `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim();
    if (kunde.email && kunde.email.trim()) {
      const isSetter = user.role === "setterin";
      const templateName = isSetter ? "setter-daten-falsch" : "vp-daten-falsch";
      supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName,
          recipientEmail: kunde.email.trim(),
          idempotencyKey: `${templateName}-${id}`,
          kontaktId: id,
          templateData: {
            kundeName: leadName,
            telefon: kunde.telefon || "",
            ansprechpartnerName: isSetter ? undefined : user.name,
            ansprechpartnerEmail: ansprechpartnerAdresse({ einstellungen: user.email, anmeldung: authUser?.email }) || undefined,
            beraterUserId: authUser?.id || undefined,
          },
        },
      }).catch(e => console.error(`${templateName} E-Mail Fehler:`, e));
    }
    updateKontakt(id, { setterSkriptNotizen: setterNotizen, status: "verloren" as any, pipelineStufe: "verloren", verlorenGrund: "ne_daten_falsch", verlorenAm: new Date().toISOString(), setter: kunde?.setter || (isSetterinRole ? user.name : undefined) });
    addAktivitaet({ kundeId: id, art: "notiz", beschreibung: "Kontaktdaten falsch, Lead als verloren markiert", von: user.name });
    reloadKunde();
    toast({ title: "Kontaktdaten falsch", description: "Lead wurde als verloren markiert.", variant: "destructive" });
  };

  const handleSetterKeinInteresse = () => {
    if (!id || !kunde) return;
    // E-Mail an Lead (nur für Nicht-Setter-Rollen – Setter sendet bereits aus SetterSkript heraus)
    const leadName = `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim();
    if (user.role !== "setterin" && kunde.email && kunde.email.trim()) {
      supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "vp-kein-interesse",
          recipientEmail: kunde.email.trim(),
          idempotencyKey: `vp-kein-interesse-${id}`,
          kontaktId: id,
          templateData: {
            kundeName: leadName,
            ansprechpartnerName: user.name,
            ansprechpartnerEmail: ansprechpartnerAdresse({ einstellungen: user.email, anmeldung: authUser?.email }) || undefined,
            beraterUserId: authUser?.id || undefined,
          },
        },
      }).catch(e => console.error("vp-kein-interesse E-Mail Fehler:", e));
    }
    updateKontakt(id, { setterSkriptNotizen: setterNotizen, status: "verloren" as any, pipelineStufe: "verloren", verlorenGrund: "kb_kein_interesse", verlorenAm: new Date().toISOString(), setter: kunde?.setter || (isSetterinRole ? user.name : undefined) });
    addAktivitaet({ kundeId: id, art: "notiz", beschreibung: "Kein Interesse, Lead als verloren markiert", von: user.name });
    reloadKunde();
    toast({ title: "Kein Interesse", description: "Lead wurde als verloren markiert.", variant: "destructive" });
  };

  const handleSetterVermoegenGeeignet = () => {
    if (!id || !kunde) return;
    updateKontakt(id, {
      setterSkriptNotizen: setterNotizen,
      status: "verloren" as any,
      pipelineStufe: "vermoegensaufbau",
      verlorenGrund: "pn_vermoegensaufbau",
      verlorenAm: new Date().toISOString(),
      versicherungGeeignet: true,
      setter: kunde?.setter || user.name,
    });
    addAktivitaet({ kundeId: id, art: "notiz", beschreibung: "Lead als verloren markiert, für Vermögensaufbau geeignet (geht an den Versicherungsexperten)", von: user.name });

    // Glocken-Benachrichtigung an Versicherungsexperte
    const leadFullName = `${kunde.vorname} ${kunde.nachname}`.trim();
    notifyVermoegenLeadGeeignet(leadFullName, user.name, id);

    // E-Mail-Benachrichtigung an alle Versicherungsexperten
    (async () => {
      try {
        const { data: vExpRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "versicherungsexperte");
        if (vExpRoles && vExpRoles.length > 0) {
          const userIds = vExpRoles.map((r: any) => r.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("email, name")
            .in("id", userIds);
          (profiles || []).forEach((p: any) => {
            if (p.email) {
              supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "vermoegensaufbau-lead",
                  recipientEmail: p.email,
                  idempotencyKey: `vermoegen-lead-${id}-${p.email}`,
                  templateData: {
                    leadName: leadFullName,
                    leadEmail: kunde.email || "",
                    leadTelefon: kunde.telefon || "",
                    setterName: user.name,
                    linkUrl: oeffentlicheAdresse(`/kunden/${id}`),
                    empfaengerName: p.name?.split(" ")[0] || "",
                  },
                },
              });
            }
          });
        }
      } catch (e) {
        console.error("Vermögen email notify error:", e);
      }
    })();

    reloadKunde();
    toast({ title: "Vermögensaufbau geeignet", description: "Lead wurde für den Versicherungsexperten markiert." });
    navigate("/lead-verwaltung");
  };

  /**
   * Eine Schnellaktion aus dem Menue "Aktion erstellen".
   *
   * Die einzige Stelle, die auf einen Klick darauf reagiert. Vorher stand
   * dieselbe Logik zweimal in der Seite, einmal fuer die Knopfleiste am
   * Rechner und einmal fuer das Menue am Handy. Zwei Kopien heisst: eine
   * Aenderung an einer Stelle, und die andere Groesse verhaelt sich anders.
   *
   * Meeting: Ohne Videocall-Freigabe geht MeetingErstellenDialog auf, mit Freigabe
   * die normale Meeting-Maske. E-Mail: oeffnet das E-Mail-Programm und haelt
   * den Vorgang zugleich in den Aktivitaeten fest.
   */
  /**
   * Anruf starten und sofort das Anruf-Protokoll öffnen.
   *
   * Christian, 26.09.2026: Jeder Klick auf „Anrufen" im Kundenprofil öffnet
   * direkt „Anruf notieren", sonst geht die Dokumentation unter. Die einzige
   * Stelle dafür, damit Aktionsleiste, Kontaktdaten, Stammdaten und die
   * Nummer von Person 2 sich gleich verhalten.
   *
   * Der Anruf geht zuerst hinaus und wird im Verlauf vermerkt, das Protokoll
   * blockiert ihn nicht: Auf dem Handy übernimmt die Telefon-App, die Seite
   * bleibt stehen und mit ihr das offene Fenster samt Eingaben. Ist das
   * Protokoll schon offen, bleibt es unverändert offen.
   */
  const rufeAnUndProtokolliere = (telefon: string | undefined | null, quelle: AnrufQuelle = "Kundenprofil") => {
    if (!kunde) return;
    if (!telefon?.trim()) {
      toast({ title: "Keine Nummer hinterlegt", description: "Bitte zuerst eine Telefonnummer eintragen.", variant: "destructive" });
      return;
    }
    starteAnrufFuerKontakt(kunde.id, telefon, quelle, user.name);
    setAnrufGestartet(true);
    setActionDialog("anruf_protokoll");
  };

  const fuehreSchnellaktionAus = (art: AktivitaetEntry["art"]) => {
    /*
     * „Anruf" öffnete bis zum 26.09.2026 einen eigenen Zwischendialog mit dem
     * Knopf „Jetzt anrufen". Danach war das Fenster zu, und ob der Anruf je
     * protokolliert wurde, hing am Gedächtnis. Jetzt wählt der Klick sofort
     * und das Protokoll steht offen da.
     */
    if (art === "anruf") {
      rufeAnUndProtokolliere(kunde?.telefon, "Schnellaktion");
      return;
    }
    if (art === "meeting") {
      if (videocallFreigabe) setActionDialog("meeting");
      else setMeetingQuickOpen(true);
      return;
    }
    if (art === "email") {
      if (!kunde?.email) {
        toast({ title: "Keine E-Mail", description: "Bitte zuerst eine E-Mail-Adresse hinterlegen.", variant: "destructive" });
        return;
      }
      window.open(`mailto:${kunde.email}`, "_self");
      addAktivitaet({
        kundeId: id!,
        art: "email",
        beschreibung: `E-Mail geschrieben an ${kunde.vorname || ""} ${kunde.nachname || ""}`.trim(),
        details: `Gesendet an ${kunde.email}`,
      });
      toast({ title: "E-Mail-Programm geöffnet", description: `An ${kunde.email}` });
      return;
    }
    setActionDialog(art);
  };

  const handleActionSaved = () => {
    setAktivitaeten(getAktivitaeten(id || ""));
    /*
     * Auf die Gruppe umschalten, in der der neue Eintrag steht.
     *
     * Der Verlauf zeigt immer nur eine der drei Gruppen. Wer die Aufgaben
     * offen hatte und dann eine Notiz schrieb, sah seine Notiz anschliessend
     * nicht: Sie stand eine Gruppe weiter, gespeichert war sie laengst. Das
     * Nachladen selbst ist in Ordnung, die Liste haengt ueber useLiveData am
     * Zwischenspeicher und zeichnet von allein neu, sobald die Datenbank den
     * Eintrag bestaetigt hat.
     */
    const ziel = ansichtFuerArt(actionDialog);
    if (ziel) {
      setAktivitaetenAnsicht(ziel);
      if (ziel === "manuell") setAktivitaetenFilter("alle");
      aktPag.setPage(1);
    }
    // Auto-Advance: Sobald VP/Closer den ersten Anruf protokolliert,
    // rückt der Lead von "Zugewiesen" automatisch auf "Kontaktversuche".
    if (
      id &&
      kunde &&
      !isSetterinRole &&
      kunde.pipelineStufe === "zugewiesen" &&
      (actionDialog === "anruf" || actionDialog === "anruf_protokoll")
    ) {
      /*
       * Die Stufe, die hier wirklich gesetzt wird, ist `kontaktversuche`.
       * Der Text nennt sie deshalb nicht mehr selbst, sondern laesst sie aus
       * genau diesem Schluessel ableiten. Ein fest getippter Stufenname kann
       * so nicht mehr an der gesetzten Stufe vorbeilaufen.
       */
      const ersteStufe = "kontaktversuche";
      updateKontakt(id, { pipelineStufe: ersteStufe } as any);
      notiereStufenwechsel(ERSTER_KONTAKTVERSUCH, ersteStufe);
      reloadKunde();
    }
  };

  // ── Erstgespräch-Ergebnis (No-Show / Erschienen / Verschoben) ──
  const [verschiebenDialog, setVerschiebenDialog] = useState(false);
  const [verschiebenDatum, setVerschiebenDatum] = useState("");
  const [verschiebenUhrzeit, setVerschiebenUhrzeit] = useState("");
  /** Gesetzt, wenn der Dialog ein festes Gespraech ohne Setter-Feld verschiebt. */
  const [verschiebenFest, setVerschiebenFest] = useState<FesterTerminAngabe | null>(null);

  /**
   * Hebt die Pipeline auf "Selbstauskunft", sobald die SA beim Kunden ist.
   *
   * Egal auf welchem Weg: ob der Kunde den Link zum Selbstausfüllen bekommt
   * oder ob der Berater sie ausgefüllt hat und sie zur Unterschrift rausgeht.
   * Aus beiden Sichten ist die Selbstauskunft ab jetzt beim Kunden.
   *
   * Angehoben wird nur aus den Stufen davor. Spätere Stufen dürfen niemals
   * zurückspringen, sonst verliert ein Kunde in der Finanzierung seinen Stand,
   * weil jemand die Selbstauskunft erneut verschickt.
   */
  const hebeAufSelbstauskunft = () => {
    if (!id || !kunde) return;
    if (!PRE_SA_PIPELINE_STEPS.has(String(kunde.pipelineStufe || ""))) return;
    updateKontakt(id, { pipelineStufe: "selbstauskunft" as any });
  };

  /**
   * Welcher Termin im Setter-Feld steht, Erst- oder Beratungsgespraech,
   * entscheidet die Stufe (`setterTerminName`). Bis 29.09.2026 behandelte der
   * Kasten ihn immer als Beratungsgespraech: Ein No-Show beim Erstgespraech
   * landete auf "BG NoShow", und der naechste Schritt hiess "Neuen
   * Beratungstermin vereinbaren".
   */
  const setterFesterTermin = () => kunde ? {
    titel: setterTerminName(kunde),
    datum: kunde.setterTerminDatum || "",
    uhrzeit: kunde.setterTerminUhrzeit || "",
    setterTermin: true,
  } : null;
  const festerTerminKontext = (): FesterTerminKontext | null => kunde ? {
    kunde,
    userName: user.name,
    melde: (meldung) => { toast(meldung); },
  } : null;

  const handleTerminErschienen = async () => {
    const termin = setterFesterTermin();
    const ctx = festerTerminKontext();
    if (!id || !termin || !ctx) return;
    if (await festerTerminStattgefunden(termin, ctx)) reloadKunde();
  };

  // „Termin erneut buchen": setzt Datum/Uhrzeit sowie den Buchungs-Flag zurück,
  // damit das Formular „Beratungsgespräch vereinbaren" wieder editierbar wird
  // und ein neuer Termin (Folgetermin, Reschedule) manuell eingetragen werden kann.
  const handleTerminErneutBuchen = () => {
    if (!id || !kunde) return;
    const alterTermin = kunde.setterTerminDatum
      ? `${kunde.setterTerminDatum}${kunde.setterTerminUhrzeit ? ` um ${kunde.setterTerminUhrzeit}` : ""}`
      : "";
    updateKontakt(id, {
      setterTerminGebucht: false,
      setterTerminDatum: "",
      setterTerminUhrzeit: "",
      terminErgebnis: null as any,
      terminErgebnisAm: null as any,
      terminErgebnisVon: null as any,
    });
    setSetterTerminGebucht(false);
    setSetterTerminDatum("");
    setSetterTerminUhrzeit("");
    setSetterDirty(true);
    autoBookingTriggeredRef.current = false;
    addAktivitaet({
      kundeId: id,
      art: "notiz",
      beschreibung: `🔄 Termin freigegeben für Neubuchung${alterTermin ? ` (vorher: ${alterTermin})` : ""} – Datum/Uhrzeit zurückgesetzt`,
      von: user.name,
    });
    toast({ title: "Bereit für neue Buchung", description: "Trage jetzt Datum und Uhrzeit für den neuen Termin ein." });
  };

  // Die Kette steht in `festerTerminErgebnis.ts`: Der Lead bleibt beim
  // zustaendigen Partner, Glocke und Aufgaben gehen nur an ihn.
  const handleTerminNoShow = async () => {
    const termin = setterFesterTermin();
    const ctx = festerTerminKontext();
    if (!id || !termin || !ctx) return;
    if (await festerTerminNichtStattgefunden(termin, ctx)) reloadKunde();
  };

  /**
   * Die Antworten im Kasten zu einem vergangenen Erst- oder
   * Beratungsgespraech ohne Setter-Feld (etwa `meta.beratungsgespraechAm` am
   * Kontakt oder am Investment). Dieselben Funktionen wie am Setter-Kasten.
   */
  const [festBeschaeftigt, setFestBeschaeftigt] = useState<string | null>(null);
  const beantworteFestenTermin = async (aktion: GeplanteAktion, wahl: "stattgefunden" | "nicht_stattgefunden") => {
    const ctx = festerTerminKontext();
    if (!ctx || !aktion.terminSchluessel || festBeschaeftigt) return;
    const termin = festerTerminAusSchluessel(aktion.titel, aktion.terminSchluessel);
    setFestBeschaeftigt(aktion.schluessel);
    try {
      const ok = wahl === "stattgefunden"
        ? await festerTerminStattgefunden(termin, ctx)
        : await festerTerminNichtStattgefunden(termin, ctx);
      if (ok) reloadKunde();
    } finally {
      setFestBeschaeftigt(null);
    }
  };
  const verschiebeFestenTermin = (aktion: GeplanteAktion) => {
    if (!aktion.terminSchluessel) return;
    const termin = festerTerminAusSchluessel(aktion.titel, aktion.terminSchluessel);
    setVerschiebenFest(termin);
    setVerschiebenDatum(termin.datum);
    setVerschiebenUhrzeit(termin.uhrzeit || "");
    setVerschiebenDialog(true);
  };

  const schliesseVerschieben = () => {
    setVerschiebenDialog(false);
    setVerschiebenFest(null);
    setVerschiebenDatum("");
    setVerschiebenUhrzeit("");
  };

  const handleTerminVerschoben = async () => {
    if (!id || !kunde || !verschiebenDatum || !verschiebenUhrzeit) {
      toast({ title: "Datum & Uhrzeit erforderlich", variant: "destructive" });
      return;
    }
    if (!istTerminInZukunft(verschiebenDatum, verschiebenUhrzeit)) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
      return;
    }
    // Ein festes Erst- oder Beratungsgespraech ohne Setter-Feld.
    if (verschiebenFest) {
      const ctx = festerTerminKontext();
      if (!ctx || !(await festerTerminVerschieben(verschiebenFest, verschiebenDatum, verschiebenUhrzeit, ctx))) return;
      schliesseVerschieben();
      reloadKunde();
      return;
    }
    // Stand der Kontakt auf der NoShow-Stufe dieses Termins, holt ihn der neue
    // Zukunftstermin zurueck ("BG NoShow" auf "Beratungsgespräch", "EG NoShow"
    // auf "Erstgespräch"). Die effektive Stufe rechnet es beim BG ohnehin so,
    // hier wird es zusaetzlich gespeichert, damit die rohe Stufe stimmt.
    const art = setterTerminName(kunde);
    const geheilt = stufeNachVerschieben(festeGespraechsArt(art), String(kunde.pipelineStufe || ""));
    updateKontakt(id, {
      terminErgebnis: "verschoben",
      terminErgebnisAm: new Date().toISOString(),
      terminErgebnisVon: user.name,
      setterTerminDatum: verschiebenDatum,
      setterTerminUhrzeit: verschiebenUhrzeit,
      ...(geheilt ? { pipelineStufe: geheilt as any } : {}),
    });
    addAktivitaet({
      kundeId: id,
      art: "meeting",
      beschreibung: `🔁 ${art} verschoben auf ${verschiebenDatum} um ${verschiebenUhrzeit}`,
      von: user.name,
    });
    const neu = `${verschiebenDatum} um ${verschiebenUhrzeit}`;
    schliesseVerschieben();
    reloadKunde();
    toast({ title: "Termin verschoben ✓", description: `Neuer Termin: ${neu}` });
  };


  const handleSaveEdit = async () => {
    if (!id) return;
    // Person-2 E-Mail-Format prüfen (wenn Person 2 existiert)
    const p2 = (editData as any).person2;
    if (p2) {
      const p2Email = (p2.email || "").trim();
      if (!p2Email) {
        toast({ title: "E-Mail für Person 2 fehlt", description: "Bitte E-Mail-Adresse von Person 2 eintragen – sie wird für die Selbstauskunft-Unterschrift benötigt.", variant: "destructive" });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p2Email)) {
        toast({ title: "Ungültige E-Mail (Person 2)", description: "Bitte eine gültige E-Mail-Adresse für Person 2 eintragen.", variant: "destructive" });
        return;
      }
    }
    const {
      empfehlungsgeberName: empfName,
      empfehlungsgeberBeziehung: empfBez,
      erstelltVonId: newErstellerId,
      erstelltVonName: newErstellerName,
      ...rest
    } = editData as any;
    // Empfehlungsgeber, Ersteller und Sprache als Patch nur dieser Schlüssel
    // (H11, 04.10.2026). Vorher ging hier ein zweites Mal das ganze meta aus
    // dem Zwischenspeicher zurück. Leeren heißt null.
    const zusatz: Record<string, unknown> = {};
    const cleanName = (empfName || "").trim();
    const cleanBez = (empfBez || "").trim();
    if (cleanName) {
      zusatz.empfehlungsgeber = true;
      zusatz.empfehlungsgeberName = cleanName;
      zusatz.empfehlungsgeberBeziehung = cleanBez || null;
    } else {
      zusatz.empfehlungsgeber = null;
      zusatz.empfehlungsgeberName = null;
      zusatz.empfehlungsgeberBeziehung = null;
      zusatz.empfehlungsgeberKontaktId = null;
    }
    // Ersteller (nur Admins/Inhaber dürfen ändern – UI versteckt das Feld sonst)
    if (isAdminOrInhaber) {
      const cleanErstId = (newErstellerId || "").trim();
      const cleanErstName = (newErstellerName || "").trim();
      zusatz.erstelltVonId = cleanErstId || null;
      zusatz.erstelltVonName = cleanErstId ? cleanErstName : null;
    }
    // Kundensprache: nur wenn im Formular eine Pille angeklickt wurde. Sie
    // geht im selben Patch mit, damit sich zwei Schreibwege nicht überholen.
    if (editSprache) Object.assign(zusatz, kundenSpracheMetaPatch(editSprache, authUser?.id));
    // Nur, was sich wirklich ändert; sonst meldet ein Wächter Unverändertes als abgelehnt.
    const altMeta = (cacheGet("kontakte").find((r: any) => r.id === id)?.meta || {}) as Record<string, unknown>;
    const zusatzPatch = metaUnterschied(
      Object.fromEntries(Object.keys(zusatz).map((k) => [k, altMeta[k] ?? null])),
      zusatz,
    );
    try {
      await Promise.all([
        updateKontakt(id, rest),
        cacheMetaZusammenfuehren("kontakte", id, zusatzPatch),
      ]);
    } catch {
      // Was nicht ankam, meldet der Zwischenspeicher selbst und zeigt wieder
      // den gespeicherten Stand. Der Dialog bleibt offen.
      reloadKunde();
      return;
    }
    reloadKunde();
    setEditDialog(false);
    toast({ title: "Daten aktualisiert ✓" });
  };

  /**
   * Braucht dieser Wechsel einen Grund?
   *
   * Nur wenn der Kontakt schon jemandem gehört. Bei einem Lead ohne
   * Vorgänger gäbe es kein „von Partner A“ und damit nichts zu begründen.
   */
  const wechselBrauchtGrund = istUebergabe(kunde);
  const grundBereit = !wechselBrauchtGrund || grundVollstaendig(uebergabeGrund);

  const fuehreBeraterWechselAus = () => {
    if (!id || !newBerater.trim()) return;
    if (!grundBereit) return;
    try {
      reassignBerater(id, newBerater.trim(), {
        changedById: authUser?.id,
        changedByName: user.name,
        changedByRole: user.role,
        grund: uebergabeGrund,
        zielId: newBeraterId,
      });
    } catch (e: any) {
      toast({ title: "Wechsel nicht gespeichert", description: e?.message || "", variant: "destructive" });
      return;
    }
    reloadKunde();
    setBeraterDialog(false);
    setBeraterWechselWarnung(null);
    toast({ title: "Vertriebspartner geändert ✓", description: newBerater.trim() });
    const grundText = grundSatz(uebergabeGrund);
    addAktivitaet({
      kundeId: id,
      art: "notiz",
      beschreibung: grundText
        ? `Vertriebspartner geändert zu ${newBerater.trim()}. Grund: ${grundText}`
        : `Vertriebspartner geändert zu ${newBerater.trim()}`,
      von: user.name,
    });
    setUebergabeGrund({});
  };

  const handleSaveBerater = () => {
    if (!id || !newBerater.trim() || !kunde) return;
    // Hat der aktuelle Vertriebspartner noch etwas mit dem Kunden geplant,
    // wird nicht stillschweigend umgezogen, sondern erst gefragt. Ein
    // geplanter Termin waere sonst verwaist, der Kunde wartet und niemand
    // fuehlt sich zustaendig.
    if (newBerater.trim() !== (kunde.berater || "").trim()) {
      try {
        const quellen = kontaktQuellen(kunde);
        if (hatGeplantenTermin(quellen)) {
          const naechster = naechsterGeplanterKontakt(quellen);
          const wann = naechster
            ? new Date(naechster.zeitpunkt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
            : "";
          const was = naechster?.titel?.trim() || naechster?.bezeichnung || "Termin";
          setBeraterWechselWarnung(
            `${kunde.berater || "Der aktuelle Vertriebspartner"} hat mit diesem Kunden noch etwas geplant: ${was}${wann ? ` am ${wann}` : ""}. Soll der Lead wirklich neu zugewiesen werden?`,
          );
          return;
        }
      } catch { /* Ohne Quellen keine Warnung, der Wechsel bleibt moeglich. */ }
    }
    fuehreBeraterWechselAus();
  };

  const handleSaveSetter = () => {
    if (!id) return;
    updateKontakt(id, { setter: newSetter.trim(), setterId: newSetter.trim() ? newSetterId || "" : "" });
    reloadKunde();
    setSetterDialog(false);
    toast({ title: "Setterin geändert ✓", description: newSetter.trim() || "Entfernt" });
    addAktivitaet({ kundeId: id, art: "notiz", beschreibung: newSetter.trim() ? `Setterin geändert zu ${newSetter.trim()}` : "Setterin entfernt", von: user.name });
  };

  const handleArchive = () => {
    if (!id || !archivGrund.trim()) return;
    updateKontakt(id, { archiviert: true, archivGrund: archivGrund.trim() });
    addAktivitaet({
      kundeId: id,
      art: "notiz",
      beschreibung: `Kunde archiviert. Grund: ${archivGrund.trim()}`,
      von: user.name,
    });
    toast({ title: "Kunde archiviert", description: `${kunde?.vorname} ${kunde?.nachname} wurde archiviert.` });
    setArchivDialog(false);
    navigate("/verloren");
  };

  const handleDelete = async () => {
    if (!id || !deleteGrund.trim()) return;
    // Always create a delete request – Admin/Vertriebsleiter/Backoffice bestätigen via Banner
    try {
      const recipientRoles = ["admin", "inhaber", "vertriebsleiter", "backoffice"];
      const adminRoles = cacheGet("user_roles").filter((r: any) => recipientRoles.includes(r.role));
      const adminUserIds = [...new Set(adminRoles.map((r: any) => r.user_id))];

      if (adminUserIds.length === 0) {
        toast({ title: "Fehler", description: "Keine Empfänger (Admin/Vertriebsleiter/Backoffice) gefunden.", variant: "destructive" });
        return;
      }

      const notifications = adminUserIds.map((adminId: string) => ({
        benutzer_id: adminId,
        titel: `Löschanfrage: ${kunde?.vorname} ${kunde?.nachname}`,
        nachricht: `${user.name} beantragt die Löschung von ${kunde?.vorname} ${kunde?.nachname}. Grund: ${deleteGrund.trim()}`,
        link: `/kunden/${id}`,
      }));

      const { error: notifError } = await supabase.from("benachrichtigungen").insert(notifications);
      if (notifError) throw notifError;

      // Mark the contact with a pending delete request in meta — ATOMIC via RPC
      const patch = {
        deleteRequested: true,
        deleteRequestedBy: user.name,
        deleteRequestedAt: new Date().toISOString(),
        deleteGrund: deleteGrund.trim(),
        deleteDsgvo: false,
      };
      const { data: mergedMeta, error: mergeError } = await supabase.rpc("merge_kontakt_meta", {
        _kontakt_id: id,
        _updates: patch,
      });
      if (mergeError) throw mergeError;
      // Cache mit autoritativem Meta aus DB synchronisieren
      if (mergedMeta) {
        const arr = cacheGet("kontakte");
        const idx = arr.findIndex((r: any) => r.id === id);
        if (idx >= 0) { arr[idx] = { ...arr[idx], meta: mergedMeta }; }
      }

      toast({ title: "Löschung beantragt", description: "Die Administration wurde benachrichtigt und wird die Anfrage prüfen." });
      addAktivitaet({ kundeId: id, art: "notiz", beschreibung: `Löschung beantragt – Grund: ${deleteGrund.trim()}`, von: user.name });
      setDeleteDialog(false);
      setDeleteGrund("");
      setDeleteConfirmText("");
    } catch (err: any) {
      console.error("Delete request error:", err);
      toast({ title: "Fehler", description: err.message || "Benachrichtigung konnte nicht gesendet werden.", variant: "destructive" });
    }
  };

  const handleCreateInvestment = () => {
    setConfirmNewInvestment(true);
  };

  const handleConfirmCreateInvestment = async () => {
    if (!id) return;
    const inv = await createInvestment(id);
    setInvestments(getInvestmentsByKontakt(id));
    oeffneInvestment(inv.id);
    setConfirmNewInvestment(false);
    toast({ title: `Investment ${inv.nummer} angelegt ✓` });
    addAktivitaet({ kundeId: id, art: "notiz", beschreibung: `Investment ${inv.nummer} angelegt`, von: user.name });
  };

  // Admins duerfen immer loeschen, Vertriebspartner nur bei eigenen Kunden.
  // Maßgeblich bleibt die RLS-Policy auf `investments`.
  const canDeleteInvestment =
    ["admin", "inhaber"].includes(user.role) ||
    (!!kunde &&
      ["vertriebspartner", "vertriebsleiter"].includes(user.role) &&
      kontaktBelongsToUser(kunde as any, { userName: user.name, userId: authUser?.id }));
  const [versicherungNotizen, setVersicherungNotizen] = useState(kunde?.versicherungNotizen || "");
  const [versicherungTerminDatum, setVersicherungTerminDatum] = useState(kunde?.versicherungTerminDatum || "");
  const [versicherungTerminUhrzeit, setVersicherungTerminUhrzeit] = useState(kunde?.versicherungTerminUhrzeit || "");
  const [versicherungSelectedBerater, setVersicherungSelectedBerater] = useState(kunde?.versicherungCloser || "");

  const handleDeleteInvestment = async (invId: string) => {
    if (!id) return;
    // Gemerkt wird die Rollposition des Inhaltsbereichs, nicht die des
    // Fensters. Das Fenster rollt in dieser Huelle gar nicht, `window.scrollY`
    // war hier immer 0 und die Wiederherstellung damit wirkungslos.
    const scrollY = seitenRoller()?.scrollTop ?? 0;
    const wasActive = activeTab === "investments" && gewaehltesInvestment === invId;
    try {
      await deleteInvestment(invId);
      const remaining = getInvestmentsByKontakt(id);
      setInvestments(remaining);
      setDeleteInvestmentId(null);
      // URL-Param ?investment=<id> entfernen, falls es das gelöschte Investment referenziert,
      // damit der Auto-Select-Effekt nicht erneut auf das gelöschte Tab springt.
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("investment") === invId) {
          url.searchParams.delete("investment");
          window.history.replaceState({}, "", url.toString());
        }
      } catch {}
      // Nur wechseln, wenn der gelöschte Eintrag aktiv war — sonst Tab + Scrollposition halten.
      // Der Reiter bleibt stehen, die Auswahl faellt auf die Liste zurueck.
      // Bewusst ohne `zurueckZurInvestmentListe`: nach dem Loeschen soll die
      // Ansicht stehen bleiben, wo sie war, statt an den Anfang zu springen.
      if (wasActive) {
        setGewaehltesInvestment(null);
      }
      // Scrollposition nach State-Updates wiederherstellen.
      requestAnimationFrame(() => {
        const roller = seitenRoller();
        if (roller && typeof roller.scrollTo === "function") {
          roller.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
        }
      });
      toast({ title: "Investment gelöscht" });
      addAktivitaet({ kundeId: id, art: "notiz", beschreibung: `Investment gelöscht`, von: user.name });
    } catch (e) {
      console.error("Investment löschen fehlgeschlagen:", e);
      toast({ title: "Fehler beim Löschen", description: e instanceof AktionVerweigert ? e.message : "Bitte versuche es erneut.", variant: "destructive" });
    }
  };

  // Entprellter Termin. Ein `type="time"`-Feld meldet schon einen gueltigen Wert,
  // waehrend noch getippt wird: Wer 12:30 eingeben will, erzeugt unterwegs kurz
  // 12:03. Weil die automatische Buchung sofort ausgeloest hat, wurde dieser
  // Zwischenstand fest gebucht und liess sich danach nicht mehr korrigieren,
  // weil `autoBookingTriggeredRef` bereits gesetzt war. Deshalb wird erst
  // gebucht, wenn zwei Sekunden lang nichts mehr geaendert wurde. Das gilt auch,
  // wenn Datum und Uhrzeit programmatisch gesetzt werden.
  const [terminEingabeBeruhigt, setTerminEingabeBeruhigt] = useState<{ datum: string; uhrzeit: string } | null>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => setTerminEingabeBeruhigt({ datum: setterTerminDatum, uhrzeit: setterTerminUhrzeit }),
      2000,
    );
    return () => clearTimeout(timer);
  }, [setterTerminDatum, setterTerminUhrzeit]);

  const autoBookingTriggeredRef = useRef(false);
  useEffect(() => {
    if (!showSetterSkriptSection) return;
    if (!id || !kunde) return;
    if (setterTerminGebucht) { autoBookingTriggeredRef.current = false; return; }
    // Auto-Freischaltung sobald Datum + Uhrzeit + Berater vorliegen — die separate
    // Checkbox „Termin im Buchungskalender eingetragen" ist NICHT mehr Voraussetzung.
    // Sonst blieben Beratungspräsentation / Finanzierbarkeit / SA gesperrt, obwohl der
    // Termin eindeutig eingetragen wurde.
    if (!setterTerminDatum || !setterTerminUhrzeit || !setterSelectedBerater) return;
    // Nur buchen, wenn die aktuelle Eingabe stabil ist. Solange noch getippt
    // wird, weicht der entprellte Wert vom aktuellen ab und es passiert nichts.
    if (
      !terminEingabeBeruhigt ||
      terminEingabeBeruhigt.datum !== setterTerminDatum ||
      terminEingabeBeruhigt.uhrzeit !== setterTerminUhrzeit
    ) return;
    // Kein Termin in der Vergangenheit: erst buchen, wenn Datum plus Uhrzeit
    // nach jetzt liegen. Der Hinweis kommt nur einmal pro beruhigter Eingabe.
    if (!istTerminInZukunft(setterTerminDatum, setterTerminUhrzeit)) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, description: "Bitte Datum und Uhrzeit korrigieren, dann wird der Termin gebucht.", variant: "destructive" });
      return;
    }
    if (autoBookingTriggeredRef.current) return;
    autoBookingTriggeredRef.current = true;

    const setterName = kunde.setter && kunde.setter.trim() !== "" ? kunde.setter : (user.name || "");
    updateKontakt(id, {
      pipelineStufe: "beratungsgespraech",
      status: "kontaktiert" as any,
      berater: setterSelectedBerater,
      setter: setterName,
      setterCloser: setterSelectedBerater,
      setterCloserId: setterSelectedBeraterId,
      setterSkriptNotizen: setterNotizen,
      setterTerminGebucht: true,
      setterTerminDatum,
      setterTerminUhrzeit,
      setterChecklisteDone: true,
      remindersSent: [],
    } as any);
    addAktivitaet({
      kundeId: id,
      art: "anruf",
      beschreibung: `Beratungsgespräch automatisch gebucht am ${setterTerminDatum} um ${setterTerminUhrzeit} (über „Beratungsgespräch vereinbaren"-Karte) → Pipeline-Stufe „Beratungsgespräch"`,
      von: user.name,
    });
    if (activeInvId) {
      try {
        setInvestmentMetaFields(activeInvId, {
          setterTerminGebucht: true,
          setterTerminDatum,
          setterTerminUhrzeit,
          setterSkriptNotizen: setterNotizen,
          setterSelectedBerater,
        });
        updateInvestment(activeInvId, { pipelineStufe: "beratungsgespraech" });
      } catch (e) { console.warn("auto-booking investment update failed", e); }
    }
    try {
      const invs = getInvestmentsByKontakt(id);
      for (const _inv of invs) {
        if (["neuer_lead", "kontaktversuche", "follow_up", "erstgespraech_geplant", "erstgespraech"].includes(_inv.pipelineStufe || "")) {
          updateInvestment(_inv.id, { pipelineStufe: "beratungsgespraech" });
        }
      }
    } catch {}
    if (isVpManuellQualifizierung) {
      // Ueber mergeKontaktMeta, damit der Zwischenspeicher den Termin kennt.
      // Sonst schreibt das naechste updateKontakt das alte meta zurueck.
      void mergeKontaktMeta(id, {
        beratungsgespraechAm: setterTerminDatum,
        beratungsgespraechUhrzeit: setterTerminUhrzeit,
      });
    }
    const beraterUser = findeSetterBerater(setterSelectedBeraterId, setterSelectedBerater);
    if (beraterUser && !isVpManuellQualifizierung) {
      supabase.from("benachrichtigungen").insert({
        benutzer_id: beraterUser.id,
        titel: `Neues Beratungsgespräch: ${kunde.vorname} ${kunde.nachname}`,
        nachricht: `${user.name || ""} hat für ${kunde.vorname} ${kunde.nachname} ein Beratungsgespräch am ${setterTerminDatum} um ${setterTerminUhrzeit} Uhr eingebucht.`,
        link: `/kunden/${id}`,
      } as any).then(() => {}, () => {});
    }
    setSetterTerminGebucht(true);
    reloadKunde();
    toast({
      title: "Beratungsgespräch gebucht ✓ – Pipeline auf Beratungsgespräch",
      description: `${kunde.vorname} ${kunde.nachname} · ${setterTerminDatum} um ${setterTerminUhrzeit}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSetterSkriptSection, setterTerminBeiBeraterGebucht, setterTerminDatum, setterTerminUhrzeit, terminEingabeBeruhigt, setterSelectedBerater, setterTerminGebucht, activeInvId, id]);

  /*
   * Welcher Termin der Aktionsliste gerade nach seinem Ergebnis gefragt wird.
   *
   * Steht hier oben und nicht weiter unten bei der Aktionsliste, weil darunter
   * zwei fruehe Ausstiege folgen ("Lade Kundendaten" und "Kunde nicht
   * gefunden"). Ein Hook dahinter wird im Ladezustand uebersprungen und danach
   * nicht mehr, und React bricht mit "Rendered more hooks than during the
   * previous render" ab. Gemeldet von Christian am 16.09.2026.
   */
  const [aktionTermin, setAktionTermin] = useState<ErgebnisTermin | null>(null);

  /*
   * Die beiden Listen der Kachel "Naechste Aktion".
   *
   * Sie standen bis zum 16.09.2026 gut 1100 Zeilen weiter unten, also
   * hinter den beiden fruehen Ausstiegen. Solange der Kunde da war, fiel
   * das nicht auf. Verschwand er aber waehrend die Seite offen war, etwa
   * weil er gerade geloescht wurde, griff "Kunde nicht gefunden" und React
   * brach ab mit "Rendered fewer hooks than expected".
   */
  /**
   * Die offenen Vorgänge dieses Kunden für die Kachel "Offene Aufgaben".
   *
   * Zwei Quellen, beide hängen am Kunden: die Tabelle `aufgaben` und die
   * Follow-ups. Die persönliche Inbox-Liste aus den Nutzereinstellungen bleibt
   * bewusst draußen, sie gehört einem einzelnen Nutzer und wäre für alle
   * anderen am selben Kunden unsichtbar.
   */
  const offeneKundenAufgaben = useMemo<KundenAufgabe[]>(() => {
    if (!id || !profilKennzahlenBereit) return [];
    try {
      return baueKundenAufgabenListe(getAufgabenFuerKunde(id), getFollowUpsByKunde(id));
    } catch (fehler) {
      console.error("Offene Aufgaben des Kunden konnten nicht gelesen werden:", fehler);
      return [];
    }
    // `offeneAufgabenVersion` zählt hoch, sobald sich eine der beiden Tabellen
    // im Zwischenspeicher ändert. Genau das hält die Liste aktuell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profilKennzahlenBereit, offeneAufgabenVersion]);

  /**
   * Die geplanten Aktionen für die Kachel "Nächste Aktion".
   *
   * Dieselben Quellen, aus denen die Ampel hinter dem Namen ihre Antwort
   * zieht: Aufgaben, Follow-ups, Meetings im Verlauf und die fest gebuchten
   * Termine. `_liveV` deckt dabei die Investments ab, an denen ein Termin
   * hängen kann.
   */
  const geplanteAktionen = useMemo<GeplanteAktion[]>(() => {
    if (!id || !kunde || !profilKennzahlenBereit) return [];
    try {
      // Dieselbe Sammlung wie Ampel und Pipelinekachel (M20, geplanteAktionenFuer).
      return geplanteAktionenFuer(kunde, undefined, {
        aktivitaeten,
        unterschriften: getWartendeRvUnterschriften(id),
      });
    } catch (fehler) {
      console.error("Geplante Aktionen des Kunden konnten nicht gelesen werden:", fehler);
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kunde, profilKennzahlenBereit, offeneAufgabenVersion, aktivitaeten, _liveV]);
  if (loadingKunde) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Lade Kundendaten…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!kunde) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Kunde nicht gefunden.</p>
          <Button variant="outline" onClick={() => navigate("/kontakte")}>Zurück zu Kontakte</Button>
        </div>
      </DashboardLayout>
    );
  }

  /*
   * Hier stand ein kontaktweiter Finanzierungsrahmen aus `kunde.einkuenfte`
   * und `kunde.ausgaben`. Er wurde nirgends mehr angezeigt und widerspricht
   * der Regel, dass Zahlen immer investmentbezogen sind (Entscheidung
   * Christian, 10.09.2026). Der gueltige Rahmen steht am jeweiligen
   * Investment und kommt aus dessen eigener Selbstauskunft.
   */
  /*
   * Die frueher hier stehende "aktuelle Finanzierbarkeit" aus der neuesten
   * Selbstauskunft ueber alle Investments ist entfallen. Sie wurde nirgends
   * mehr angezeigt und widersprach der Regel, dass jedes Investment fuer sich
   * steht (saQuelle.ts). Die Zahl steht jetzt nur noch am jeweiligen
   * Investment.
   */
  const pipelineStep = getPipelineStep(kunde);

  const getDocColor = (status: DocStatus) => {
    switch (status) {
      case "approved": return "bg-alert-green";
      case "uploaded": return "bg-alert-orange";
      case "rejected": return "bg-destructive";
      default: return "bg-alert-red";
    }
  };

  const getDocLabel = (status: DocStatus) => {
    switch (status) {
      case "approved": return "Freigegeben";
      case "uploaded": return "Prüfung ausstehend";
      case "rejected": return "Abgelehnt";
      default: return "Fehlt";
    }
  };

  /**
   * Bei der Selbstauskunft heisst "hochgeladen" zweierlei.
   *
   * Solange der Kunde nicht unterschrieben hat, wartet niemand auf eine
   * Pruefung, sondern auf ihn. "Pruefung ausstehend" liest sich dann so, als
   * laege der Vorgang beim Backoffice, und der Berater fasst nicht nach.
   * Erst nach der Unterschrift ist wirklich das Backoffice am Zug.
   */
  const getSaLabel = (status: DocStatus, unterschrieben: boolean) => {
    if (status === "uploaded" && !unterschrieben) return "Warte auf Kundenunterschrift";
    return getDocLabel(status);
  };

  /**
   * Versandzeitpunkt aus dem Investment, als Rueckfall.
   *
   * Massgeblich ist `signature_requests.created_at`, das laedt die Komponente
   * selbst. Dieses Merkmal wird erst seit Kurzem gesetzt und fehlt bei allen
   * frueher versendeten Selbstauskuenften.
   */
  const saVersandRoh = (invId: string): string | undefined => {
    const meta = (cacheGet("investments") || []).find((r: any) => r.id === invId)?.meta || {};
    return meta.saSignatureSentAt || meta.saVersendetAm || undefined;
  };

  // ──────────────────────────────────────────────────────
  // STAMMDATEN TAB
  // ──────────────────────────────────────────────────────
  // ── Auto-Trigger „Beratungsgespräch": sobald in der Karte oben Berater + Datum +
  // Uhrzeit ausgefüllt sind und der Termin als gebucht markiert wurde (Checkbox
  // „Termin im Buchungskalender eingetragen"), wird das aktive Investment automatisch
  // auf die Pipeline-Stufe „Beratungsgespräch" verschoben — auch wenn der Submit-
  // Button im Erstgesprächs-Skript nicht geklickt wurde. Die Schnellaktion
  // „Meeting erstellen" loest das bewusst nicht aus, siehe MeetingErstellenDialog.

  // Gespeicherter Stand des Erstgesprächs-Skripts: aus dem aktiven Investment,
  // mit Rückfall auf den Kontakt. Wird an zwei Stellen gebraucht — in der
  // eingeklappten Kopfzeile und im Zusammenfassungs-Popup.
  const leseSetterSkriptStand = () => {
    const stand = activeInvId
      ? getInvestmentMetaField<any>(activeInvId, "setterSkript", null)
      : ((kunde as any)?.meta?.setterSkript ?? null);
    // Netto und Eigenkapital liegen in den Qualifizierungsfeldern des
    // Kontakts, nicht im Skript. Ohne sie fehlen die beiden Zahlen in
    // Kurzfassung und Detail-Popup.
    const qualEinkommen = (kunde as any)?.qualEinkommen ?? "";
    const qualEigenkapital = (kunde as any)?.qualEigenkapital ?? "";
    if (!stand && !qualEinkommen && !qualEigenkapital) return null;
    return { ...(stand ?? {}), qualEinkommen, qualEigenkapital };
  };

  /** KI-Zusammenfassung aus der Edge Function, falls sie schon erzeugt wurde. */
  const leseErstgespraechKiText = (): string => (
    (activeInvId ? getInvestmentMetaField<string>(activeInvId, "gespraechsnotizenAI", "") : "")
    || (kunde as any)?.gespraechsnotizenAI
    || (kunde as any)?.meta?.gespraechsnotizenAI
    || ""
  );

  // Extracted Setter-Skript Section — rendered in Stammdaten AND in jedem Investment-Tab,
  // damit VP/Setter das Skript und die Beratungsgespräch-Buchung auch unter Investments sehen.
  /*
   * Die Karte steht im Investment-Reiter, je Investment einmal. Sie bekommt
   * deshalb mit, in welchem sie gerade gerendert wird: Die Buchung darin
   * muss dann nicht mehr fragen, wohin der Termin gehoert.
   */
  const renderSetterSkriptSection = (investmentId?: string) => {
    if (!showSetterSkriptSection) return null;
    const hasAiSummary = !!leseErstgespraechKiText();
    // Kurzfassung des Gesprächs für die eingeklappte Ansicht: rein aus den
    // gespeicherten Antworten gebaut, ohne Netz und ohne fremden Dienst.
    const skriptStand = leseSetterSkriptStand();
    const skriptKurzfassung = baueErstgespraechZusammenfassung(skriptStand, { schritte: ERSTGESPRAECH_SCHRITTE });
    // Ohne eine einzige Antwort gäbe das Popup nichts her.
    const zusammenfassungMoeglich = hasAiSummary || !skriptKurzfassung.istLeer;
    // „Beratungsgespräch vereinbaren"-Karte – wird ZWEIMAL gerendert:
    //  1) oben in blauem Kästchen direkt über dem Erstgesprächs-Skript (immer sichtbar)
    //  2) zusätzlich innerhalb des Skripts bei Schritt „Terminvereinbarung"
    const beratungsTerminCard = (
      <Card id="beratungs-termin-vereinbaren" className="p-6">
            <div className="w-8 h-1 bg-primary mb-3" />
            <h3 className="font-bold mb-4">Beratungsgespräch vereinbaren</h3>

            {/* Vertriebspartner-Liste mit Buchungslinks */}
            <div className="space-y-3 mb-6">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isVpManuellQualifizierung ? "Mein Buchungskalender" : "Vertriebspartner mit Buchungskalender"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isVpManuellQualifizierung
                  ? "Öffne deinen eigenen Buchungskalender und buch den Termin direkt mit dir ein."
                  : "Öffne den Buchungskalender des gewünschten Beraters und buch den Termin dort ein."}
              </p>
              {/*
                Zu welchem Investment der Termin gehoert. Die Karte wird je
                Investment einmal gerendert und kennt deshalb dessen Kennung.
                Der Satz steht hier, weil ein fremder Kalender die Zuordnung
                nicht mitnehmen kann: Wer drei Objekte hat, soll wenigstens
                sehen, in welchem Vorgang er gerade bucht.
              */}
              {(() => {
                if (!investmentId) return null;
                const inv: any = investments.find((i: any) => i.id === investmentId);
                const name = inv?.objektTitel || inv?.objektName || inv?.label;
                if (!name) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    Der Termin gehört zu diesem Investment: <strong>{name}</strong>
                  </p>
                );
              })()}

              {(() => {
                // Diese Karte heißt „Beratungsgespräch vereinbaren" → wir bevorzugen
                // IMMER den Beratungsgesprächs-Link (60 Minuten). Hat der Nutzer
                // keinen hinterlegt, greifen wir auf den Erstgesprächs-Buchungslink
                // (15 Min) als Fallback zurück, damit die Karte nutzbar bleibt.
                const pickLink = (u: any) => (u?.beratungslink || u?.buchungslink || "") as string;

                /*
                 * Die Gespraeche, fuer die dieser Partner einen Kalender
                 * hinterlegt hat.
                 *
                 * Beim Beratungsgespraech greift weiter der Rueckfall auf den
                 * Erstgespraechs-Kalender: Die Karte heisst so, und ein Partner
                 * ohne eigenen 60-Minuten-Kalender soll sie trotzdem benutzen
                 * koennen. Bei Objekt und Finanzierung gibt es keinen Rueckfall,
                 * dort waere ein 15-Minuten-Termin schlicht falsch.
                 */
                const gespraecheMitLink = (u: any) => ([
                  { schluessel: "beratung", beschriftung: "Beratungsgespräch", url: pickLink(u) },
                  { schluessel: "objekt", beschriftung: "Objektgespräch", url: (u?.objektlink || "") as string },
                  { schluessel: "finanzierung", beschriftung: "Finanzierungsgespräch", url: (u?.finanzierungslink || "") as string },
                ].filter((g) => !!g.url));
                const noLinkHint = isVpManuellQualifizierung
                  ? "Du hast noch keinen Beratungsgesprächs-Link (60 Minuten) in deinen Einstellungen hinterlegt. Datum und Uhrzeit kannst du unten trotzdem von Hand eintragen."
                  : "Keine Vertriebspartner mit hinterlegtem Beratungsgesprächs-Link gefunden.";
                // Wenn der Lead bereits einem VP zugewiesen ist (zustaendig_id gesetzt),
                // zeigen wir NUR den Buchungslink dieses zuständigen VPs an –
                // die komplette VP-Auswahlliste ist nur dann sinnvoll, wenn der
                // Lead noch keinem Berater zugewiesen wurde (Setter-Zuweisung).
                const assignedVpId: string | undefined = (kunde as any)?.zustaendig_id;
                const baseList = beraterUsersForSetter;
                const assignedOnly = assignedVpId
                  ? baseList.filter(u => u.id === assignedVpId)
                  : [];
                const list = (!isVpManuellQualifizierung && assignedOnly.length > 0)
                  ? assignedOnly
                  : baseList;
                const withLink = list.filter(u => pickLink(u));
                const withoutLink = list.filter(u => !pickLink(u));
                return (
                  <>
                    {withLink.length === 0 && (
                      <p className="text-xs text-destructive italic">{noLinkHint}</p>
                    )}
                    <div className="space-y-2">
                      {withLink.map(u => (
                        <div
                          key={u.id}
                          className={`p-3 border rounded-lg transition-colors cursor-pointer ${
                            setterSelectedBeraterId === u.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-muted/30"
                          }`}
                          onClick={async () => {
                            setSetterSelectedBerater(u.name);
                            setSetterSelectedBeraterId(u.id);
                            setSetterSelectedCloser(u.name);
                            setSetterDirty(true);
                            if (id && kunde) {
                              updateKontakt(id, {
                                berater: u.name,
                                setterCloser: u.name,
                                setterCloserId: u.id,
                                zustaendig_id: u.id,
                                zugewiesenAm: jetztAlsIsoDatum(),
                              } as any);
                              // Auf die Nachricht wird gewartet. Ohne das Warten blieb ein
                              // Fehlschlag unbemerkt und der Vertriebspartner erfuhr nie
                              // von seinem Lead.
                              const nachrichtOk = await benachrichtigungAnlegen({
                                benutzer_id: u.id,
                                titel: `Neuer Lead zugewiesen: ${kunde.vorname} ${kunde.nachname}`,
                                nachricht: `Setter ${user.name || ""} hat dir den Lead ${kunde.vorname} ${kunde.nachname} zugewiesen.`,
                                link: `/kunden/${id}`,
                              });
                              if (nachrichtOk) {
                                toast({ title: "Lead zugewiesen ✓", description: `${kunde.vorname} ${kunde.nachname} → ${u.name}` });
                              } else {
                                toast({
                                  title: "Lead zugewiesen, Nachricht kam nicht an",
                                  description: `${u.name} hat den Lead, wurde aber nicht benachrichtigt. Bitte kurz selbst Bescheid geben.`,
                                  variant: "destructive",
                                });
                              }
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <UserCheck className={`h-4 w-4 shrink-0 ${setterSelectedBeraterId === u.id ? "text-primary" : "text-muted-foreground"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{u.name}</p>
                            </div>
                            {setterSelectedBeraterId === u.id && (
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                          {/*
                            Drei Einstiege statt einem, seit dem 21.09.2026.
                            Vorher gab es nur den Beratungstermin, und wer ein
                            Objekt- oder Finanzierungsgespraech brauchte, suchte
                            den Kalender anderswo.

                            Die Knoepfe stehen jetzt in einer eigenen Zeile mit
                            Umbruch. Nebeneinander mit dem Namen lief die Zeile
                            am Handy seitlich ueber. Angeboten wird nur, wofuer
                            der Partner wirklich einen Kalender hinterlegt hat.
                          */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {gespraecheMitLink(u).map((g) => (
                              <Button
                                key={g.schluessel}
                                size="sm"
                                variant={g.schluessel === "beratung" ? "default" : "outline"}
                                className="h-7 text-xs gap-1"
                                onClick={(e) => { e.stopPropagation(); window.open(g.url, "_blank"); }}
                              >
                                <ExternalLink className="h-3 w-3" /> {g.beschriftung}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                      {!isVpManuellQualifizierung && withoutLink.length > 0 && (
                        <div className="pt-3 border-t">
                          <p className="text-[10px] text-muted-foreground mb-2">Weitere Vertriebspartner (ohne Buchungskalender):</p>
                          <Select
                            value={withoutLink.some(u => u.id === setterSelectedBeraterId) ? setterSelectedBeraterId : ""}
                            onValueChange={async (uid) => {
                              // Der Wert ist die Kennung, nicht der Name.
                              const vpUser = beraterUsersForSetter.find(u => u.id === uid);
                              const v = vpUser?.name || "";
                              setSetterSelectedBerater(v);
                              setSetterSelectedBeraterId(vpUser?.id);
                              setSetterSelectedCloser(v);
                              setSetterDirty(true);
                              if (id && kunde && vpUser) {
                                updateKontakt(id, {
                                  berater: v,
                                  setterCloser: v,
                                  setterCloserId: vpUser.id,
                                  zustaendig_id: vpUser.id,
                                  zugewiesenAm: jetztAlsIsoDatum(),
                                } as any);
                                // Auf die Nachricht wird gewartet, damit ein Fehlschlag
                                // nicht unbemerkt bleibt.
                                const nachrichtOk = await benachrichtigungAnlegen({
                                  benutzer_id: vpUser.id,
                                  titel: `Neuer Lead zugewiesen: ${kunde.vorname} ${kunde.nachname}`,
                                  nachricht: `Setter ${user.name || ""} hat dir den Lead ${kunde.vorname} ${kunde.nachname} zugewiesen.`,
                                  link: `/kunden/${id}`,
                                });
                                if (nachrichtOk) {
                                  toast({ title: "Lead zugewiesen ✓", description: `${kunde.vorname} ${kunde.nachname} → ${v}` });
                                } else {
                                  toast({
                                    title: "Lead zugewiesen, Nachricht kam nicht an",
                                    description: `${v} hat den Lead, wurde aber nicht benachrichtigt. Bitte kurz selbst Bescheid geben.`,
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Vertriebspartner auswählen..." />
                            </SelectTrigger>
                            <SelectContent className="z-[100] bg-popover">
                              {withoutLink.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name}{u.rolle ? ` — ${u.rolle}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Datum & Uhrzeit */}
            <div className="border-t pt-4 space-y-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Termin manuell eintragen</Label>
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
                <Checkbox
                  checked={!!setterTerminBeiBeraterGebucht}
                  onCheckedChange={(v) => setSetterTerminBeiBeraterGebucht(v === true)}
                  className="mt-0.5"
                />
                <span className="text-xs">
                  {isVpManuellQualifizierung ? (
                    <><strong>Termin in meinem Buchungskalender eingetragen</strong> – ich habe den Termin tatsächlich in meinem eigenen Buchungskalender festgelegt (Pflicht, bevor Datum/Uhrzeit manuell eingetragen werden können).</>
                  ) : (
                    <><strong>Termin wurde beim Berater eingebucht</strong> – ich habe den Termin tatsächlich im Buchungskalender des Vertriebspartners festgelegt (Pflicht, bevor Datum/Uhrzeit manuell eingetragen werden können).</>
                  )}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium mb-1 block">Datum *</Label>
                  <DateInput
                    value={setterTerminDatum}
                    onChange={v => { setSetterTerminDatum(v); setSetterDirty(true); }}
                    disabled={!setterTerminBeiBeraterGebucht}
                    className="h-9"
                    minDate={heuteIso()}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Uhrzeit *</Label>
                  <Input
                    type="time"
                    value={setterTerminUhrzeit}
                    onChange={e => { setSetterTerminUhrzeit(e.target.value); setSetterDirty(true); }}
                    disabled={!setterTerminBeiBeraterGebucht}
                    className="h-9"
                  />
                </div>
              </div>
              {setterTerminGebucht && (
                <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
                  <CheckCircle2 className="h-4 w-4" /> Beratungsgespräch mit {setterSelectedBerater || "Vertriebspartner"} am {(() => { const d = new Date(`${setterTerminDatum}T12:00:00`); return isNaN(d.getTime()) ? setterTerminDatum : d.toLocaleDateString("de-DE"); })()} um {setterTerminUhrzeit} vereinbart
                </div>
              )}
              {setterTerminGebucht && (
                <p className="text-xs text-muted-foreground text-center">
                  Termin gebucht. Du kannst Datum/Uhrzeit/Vertriebspartner ändern und unten in der Checkliste erneut zuweisen.
                </p>
              )}
              {setterTerminGebucht && (
                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={handleTerminErneutBuchen}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Termin erneut buchen
                  </Button>
                </div>
              )}
              {!setterTerminGebucht && (!setterSelectedBerater || !setterTerminDatum || !setterTerminUhrzeit) && (
                <p className="text-xs text-center text-muted-foreground">
                  {!setterSelectedBerater && "Bitte wähle einen Vertriebspartner aus. "}
                  {!setterTerminDatum && "Bitte trage das Datum ein. "}
                  {!setterTerminUhrzeit && "Bitte trage die Uhrzeit ein."}
                </p>
              )}
            </div>

            {/*
              Hier stand bis zum 21.09.2026 ein Block, der Meetings bei einem
              externen Videodienst anlegte. Christian hat ihn entfernen lassen,
              weil die Anbindung nie aktiv war und der Kunde einen Link bekam,
              den niemand oeffnen konnte.

              Der zweite Einbauort des Dialogs, der Knopf "Meeting erstellen"
              oben im Kopf, bleibt bewusst stehen. Er ist der einzige Weg zu
              einem Meeting fuer alle ohne Videocall-Freigabe. Faellt er weg,
              koennen sie gar keinen Termin mehr anlegen.
            */}
      </Card>
    );
    return (
        <>
          {/* Gesprächsausgang-Karte wurde vor den Investments-Block verschoben. */}



          {/* Beratungsgespräch vereinbaren – immer oberhalb des Erstgesprächs-Skripts sichtbar.
              Klappbar und beim Öffnen des Profils zu (Christian, 29.09.2026). Das
              natürliche details-Element hält den Inhalt eingehängt, die Karte
              verliert also beim Zuklappen keine Eingaben. */}
            <details
              className="group rounded-lg border border-primary/30 bg-primary/5 mb-3 overflow-hidden"
              open={beratungKastenOffen}
              onToggle={(e) => setBeratungKastenOffen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="flex items-center gap-2 p-3 cursor-pointer hover:bg-primary/10 list-none">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <h3 className="font-bold flex-1 text-sm">Beratungsgespräch vereinbaren</h3>
                <span className="hidden sm:inline text-xs text-muted-foreground mr-2">Einklappen / Ausklappen</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="p-3 pt-0">
                {beratungsTerminCard}
              </div>
            </details>

          <Card className="p-0 overflow-hidden">
          {/* Klappbar und beim Öffnen des Profils zu (Christian, 29.09.2026). */}
          <details
            className="group"
            open={skriptKastenOffen}
            onToggle={(e) => setSkriptKastenOffen((e.currentTarget as HTMLDetailsElement).open)}
          >
            {/*
              flex-wrap plus Mindestbreite am Titel: Auf schmalen Bildschirmen
              rutschen Zusammenfassung-Knopf und Pfeil in die zweite Zeile,
              statt den Titel auf Streichholzbreite zu quetschen, wo ihn die
              Mobil-Regel buchstabenweise umbrach.
            */}
            <summary className="flex flex-wrap items-center gap-2 p-4 cursor-pointer hover:bg-muted/30 list-none border-b border-border">
              <StickyNote className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0 basis-48">
                <h3 className="font-bold">Erstgesprächs-Skript</h3>
                {/*
                  Eingeklappt steht hier der Zählstand, also „6 von 17
                  Schritten beantwortet“. Aufgeklappt entfällt die Zeile, dann
                  steht alles ausführlich darunter.
                */}
                {!skriptKastenOffen && (
                  <p className="text-xs font-normal text-muted-foreground mt-0.5">
                    {skriptKurzfassung.istLeer ? "Noch nicht ausgefüllt" : skriptKurzfassung.fortschritt}
                  </p>
                )}
              </div>
              {/* Öffnet die Zusammenfassung, ohne den Kasten umzuschalten:
                  Ein Klick in der summary würde das details-Element sonst mit
                  auf- oder zuklappen. */}
              <button
                type="button"
                disabled={!zusammenfassungMoeglich}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setErstgespraechSummaryOpen(true);
                }}
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 mr-3 px-2 py-1 rounded border border-primary/30 bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
                title={zusammenfassungMoeglich
                  ? "Zusammenfassung des Erstgesprächs anzeigen"
                  : "Noch keine Antwort im Erstgesprächs-Skript gespeichert, deshalb gibt es nichts zusammenzufassen."}
              >
                <FileText className="h-3.5 w-3.5" /> Zusammenfassung
              </button>
              <span className="hidden sm:inline text-xs text-muted-foreground mr-2">Einklappen / Ausklappen</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-0">
          <SetterErstgespraechsSkript
            ref={setterSkriptRef}
            key={activeInvId || "kontakt"}
            investmentId={activeInvId || undefined}
            isFirstInvestment={activeInvIsFirst}
            kunde={kunde}
            onUpdate={reloadKunde}
            onFollowUp={handleSetterFollowUpOpen}
            onErstgespraechFollowUp={(datum, uhrzeit) => {
              if (!id || !kunde) return;
              const titel = `Erstgespräch (${kunde.vorname} ${kunde.nachname})`;
              const verstecktBisDate = new Date(`${datum}T${uhrzeit || "09:00"}`);
              const verstecktBis = verstecktBisDate.toISOString();
              const eskalation3h = new Date(verstecktBisDate.getTime() + 3 * 60 * 60 * 1000);
              const eskalation24h = new Date(verstecktBisDate.getTime() + 24 * 60 * 60 * 1000);
              const fmtDate = lokalesDatum;
              const fmtTime = (d: Date) => d.toTimeString().slice(0, 5);
              addFollowUp({
                kundeId: id,
                kundeName: `${kunde.vorname} ${kunde.nachname}`,
                berater: kunde.berater || "",
                pipelineStufe: "follow_up",
                typ: "anruf",
                titel,
                beschreibung: `Erstgespräch am ${datum} um ${uhrzeit} Uhr (vom Lead gewünscht)`,
                faelligAm: datum,
                prioritaet: "hoch",
                automatisch: false,
              });
              addGeteilteAufgabe({
                titel,
                beschreibung: `Erstgespräch am ${datum} um ${uhrzeit} Uhr — Stufe 1/3`,
                prioritaet: "hoch",
                typ: "follow_up",
                faellig_am: datum,
                uhrzeit,
                kundeId: id,
                kundeName: `${kunde.vorname} ${kunde.nachname}`,
              });
              // Stufe 2/3 und 3/3 werden erst on-demand erzeugt
              // (siehe useFollowUpInboxEscalation) – nur wenn Lead noch in
              // Follow-Up steht und kein neuer Termin in der Zukunft liegt.
              updateKontakt(id, {
                setterSkriptNotizen: setterNotizen,
                pipelineStufe: "follow_up",
                status: "kontaktiert" as any,
                verstecktBis,
                setter: kunde?.setter || (isSetterinRole ? user.name : undefined),
              });
              // Ueber mergeKontaktMeta, damit der Zwischenspeicher die
              // Follow-Up-Felder kennt und ein spaeteres updateKontakt sie
              // nicht mit einem alten meta ueberschreibt.
              void mergeKontaktMeta(id, {
                followUpAm: datum,
                followUpUhrzeit: uhrzeit,
                followUpGesetztAm: new Date().toISOString(),
                followUpEsk1Sent: null,
                followUpEsk2Sent: null,
                followUpEsk3Sent: null,
              });
              addAktivitaet({ kundeId: id, art: "notiz", beschreibung: `${ERSTGESPRAECH_VEREINBART} "${titel}" am ${datum} um ${uhrzeit} Uhr`, von: user.name });
              notifyFollowUpErstellt(`${kunde.vorname} ${kunde.nachname}`, titel, id);
              reloadKunde();
              toast({ title: "Erstgesprächs-Termin gespeichert", description: `"${titel}" am ${datum} um ${uhrzeit} Uhr. Lead wandert in „Follow-Up".` });
              navigate("/follow-up");
            }}
            mode={isVpManuellQualifizierung ? "vertriebspartner" : "setter"}
            terminSlot={beratungsTerminCard}
            abschlussSlot={(
              <Card className={cn("p-6", setterTerminGebucht ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5" : "border-[hsl(var(--warning))]/30")}>
            <div className={cn("w-8 h-1 mb-3", setterTerminGebucht ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--warning))]")} />

            {/* Combined submit button */}
            {!setterTerminGebucht ? (
              <>
                <Button
                  variant={setterTerminHighlight ? "destructive" : "default"}
                  className="w-full gap-2"
                  onClick={async () => {
                    if (!id || !kunde) return;
                    // Pflichtfelder prüfen — bei fehlenden Feldern in den Termin-Block scrollen
                    // und Felder kurz rot hervorheben (statt den Button zu deaktivieren).
                    if (!setterSelectedBerater || !setterTerminDatum || !setterTerminUhrzeit) {
                      // Das Ziel liegt im Kasten „Beratungsgespräch vereinbaren“
                      // oben. Steht er zu, ginge der Sprung ins Leere, deshalb
                      // erst aufklappen und im nächsten Bild springen.
                      setBeratungKastenOffen(true);
                      window.requestAnimationFrame(() => {
                        const el = document.getElementById("beratungs-termin-vereinbaren");
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                      });
                      setSetterTerminHighlight(true);
                      window.setTimeout(() => setSetterTerminHighlight(false), 2500);
                      const missing: string[] = [];
                      if (!setterSelectedBerater) missing.push("Vertriebspartner");
                      if (!setterTerminDatum) missing.push("Datum");
                      if (!setterTerminUhrzeit) missing.push("Uhrzeit");
                      toast({
                        title: "Pflichtfelder fehlen",
                        description: `Bitte trage oben ein: ${missing.join(", ")}.`,
                        variant: "destructive",
                      });
                      return;
                    }

                    // Falls eine Sales-Coach-Aufnahme zu diesem Erstgespräch noch läuft,
                    // jetzt automatisch beenden → Upload + KI-Analyse im Hintergrund.
                    try {
                      window.dispatchEvent(
                        new CustomEvent("salescoach:stop", { detail: { silent: true } })
                      );
                    } catch {}

                    // Setter automatisch hinterlegen, falls noch keiner gesetzt ist
                    const setterName = kunde.setter && kunde.setter.trim() !== "" ? kunde.setter : (user.name || "");

                    updateKontakt(id, {
                      pipelineStufe: "beratungsgespraech",
                      status: "kontaktiert" as any,
                      berater: setterSelectedBerater,
                      setter: setterName,
                      setterCloser: setterSelectedBerater,
                      setterCloserId: setterSelectedBeraterId,
                      setterSkriptNotizen: setterNotizen,
                      setterTerminGebucht: true,
                      setterTerminDatum: setterTerminDatum,
                      setterTerminUhrzeit: setterTerminUhrzeit,
                      setterChecklisteDone: true,
                      remindersSent: [],
                    });

                    addAktivitaet({
                      kundeId: id,
                      art: "anruf",
                      beschreibung: isVpManuellQualifizierung
                        ? `Erstgespräch (Selbst-Qualifizierung) gebucht am ${setterTerminDatum} um ${setterTerminUhrzeit} → Pipeline-Stufe „Beratungsgespräch" · KI-Zusammenfassung des Skripts erstellt`
                        : `Erstgespräch gebucht am ${setterTerminDatum} um ${setterTerminUhrzeit} – Lead an ${setterSelectedBerater} übergeben → Pipeline-Stufe „Beratungsgespräch" · KI-Zusammenfassung des Setter-Skripts erstellt`,
                      von: user.name,
                    });
                    // Per-Investment-Persistierung: Termin + „gebucht ✓"-Status
                    // ans aktive Investment hängen, damit andere Investments
                    // unabhängig bleiben (Investment 2 startet wieder leer).
                    if (activeInvId) {
                      try {
                        setInvestmentMetaFields(activeInvId, {
                          setterTerminGebucht: true,
                          setterTerminDatum,
                          setterTerminUhrzeit,
                          setterSkriptNotizen: setterNotizen,
                          setterSelectedBerater,
                        });
                      } catch (e) { console.warn("setInvestmentMetaFields (booking) failed", e); }
                    }
                    // Auch alle bestehenden Investments, die noch auf erstgespraech/neuer_lead stehen, mit ziehen
                    try {
                      const invs = getInvestmentsByKontakt(id);
                      for (const _inv of invs) {
                        if (["neuer_lead", "kontaktversuche", "follow_up", "erstgespraech_geplant", "erstgespraech"].includes(_inv.pipelineStufe || "")) {
                          updateInvestment(_inv.id, { pipelineStufe: "beratungsgespraech" });
                        }
                      }
                    } catch {}

                    // Beratungsgespräch-Termin separat im Meta hinterlegen,
                    // damit die Kontakte-Liste die Spalte „Beratungsgespräch am"
                    // korrekt anzeigt (statt es als Erstgespräch zu führen).
                    // Hinweis: Im klassischen Setter-Flow ist `setterTerminDatum`
                    // das Erstgespräch-Datum. Nur in der VP-Selbst-Qualifizierung
                    // (`isVpManuellQualifizierung`) entspricht es dem Beratungsgespräch.
                    if (isVpManuellQualifizierung) {
                      try {
                        await mergeKontaktMeta(id, {
                          beratungsgespraechAm: setterTerminDatum,
                          beratungsgespraechUhrzeit: setterTerminUhrzeit,
                        });
                      } catch (e) { console.warn("merge_kontakt_meta (beratungsgespraech) failed", e); }
                    }

                    // VP-Benachrichtigung senden (nur im Setter-Flow – im VP-Modus
                    // qualifiziert der VP für sich selbst, keine Übergabe nötig).
                    const beraterUser = findeSetterBerater(setterSelectedBeraterId, setterSelectedBerater);
                    let vpNachrichtOk = true;
                    if (beraterUser && !isVpManuellQualifizierung) {
                      vpNachrichtOk = await benachrichtigungAnlegen({
                        benutzer_id: beraterUser.id,
                        titel: `Neues Beratungsgespräch: ${kunde.vorname} ${kunde.nachname}`,
                        nachricht: `Setter ${user.name || ""} hat für ${kunde.vorname} ${kunde.nachname} ein Beratungsgespräch am ${setterTerminDatum} um ${setterTerminUhrzeit} Uhr eingebucht.`,
                        link: `/kunden/${id}`,
                      });
                    }

                    setSetterTerminGebucht(true);
                    reloadKunde();

                    // KI-Zusammenfassung automatisch erzeugen (für Setter + Berater in den Gesprächsnotizen)
                    let aiSummaryOk = false;
                    try {
                      if (setterSkriptRef.current?.hasInput()) {
                        await setterSkriptRef.current.generateAiSummary();
                        aiSummaryOk = true;
                      }
                    } catch (e) {
                      console.error("[KundenDetail] auto KI-Summary failed", e);
                    }

                    toast({
                      title: isVpManuellQualifizierung ? "Beratungsgespräch gebucht ✓" : "Beratungsgespräch gebucht & Lead zugewiesen ✓",
                      description: isVpManuellQualifizierung
                        ? `${kunde.vorname} ${kunde.nachname} am ${setterTerminDatum} um ${setterTerminUhrzeit}${aiSummaryOk ? " · KI-Zusammenfassung erstellt" : ""}`
                        : `${kunde.vorname} ${kunde.nachname} → ${setterSelectedBerater} am ${setterTerminDatum} um ${setterTerminUhrzeit}${aiSummaryOk ? " · KI-Zusammenfassung erstellt" : ""}`,
                    });
                    if (!vpNachrichtOk) {
                      toast({
                        title: "Vertriebspartner wurde nicht benachrichtigt",
                        description: `Der Termin steht, aber ${setterSelectedBerater} hat keine Nachricht bekommen. Bitte kurz selbst Bescheid geben.`,
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Calendar className="h-4 w-4" />
                  {/*
                    Gebucht wird das Beratungsgespraech, nicht das Erstgespraech.
                    Das Erstgespraech ist genau jetzt gelaufen, es ist das Skript
                    darueber. Der Knopf setzt die Pipeline entsprechend auf
                    "beratungsgespraech". Die Setterin weist zusaetzlich den Lead
                    zu, deshalb bleibt es bei zwei Beschriftungen.
                  */}
                  {isVpManuellQualifizierung
                    ? "Beratungsgespräch gebucht & KI-Zusammenfassung erstellen"
                    : "Beratungsgespräch gebucht, Lead zuweisen & KI-Zusammenfassung erstellen"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 mt-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={handleSetterKeinInteresse}
                >
                  <XCircle className="h-3.5 w-3.5" /> Kein Interesse — Lead als verloren markieren
                </Button>
                {kunde.email && <KundenspracheHinweis kontaktId={id} className="mt-2" />}
                {(!setterSelectedBerater || !setterTerminDatum || !setterTerminUhrzeit) && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Bitte trage oben bei „Beratungsgespräch vereinbaren" Vertriebspartner, Datum und Uhrzeit ein.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="p-3 rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                    <p className="text-sm font-semibold text-[hsl(var(--success))]">
                      {!isSetterinRole ? "Beratungsgespräch gebucht ✓" : "Erstgespräch gebucht & Lead zugewiesen ✓"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {!isSetterinRole
                      ? `${setterTerminDatum} um ${setterTerminUhrzeit} Uhr`
                      : `${setterSelectedBerater} – ${setterTerminDatum} um ${setterTerminUhrzeit} Uhr`}
                  </p>
                </div>

                {/* VP-Rolle: nur ein einziger "Speichern"-Button für Skript-Notizen.
                    Setter-Rolle: drei Buttons (Notizen, Termin ändern, zurück zur Lead-Verwaltung). */}
                {!isSetterinRole ? (
                  <Button
                    className="w-full gap-2"
                    onClick={async () => {
                      try {
                        await setterSkriptRef.current?.persistNow?.();
                        toast({ title: "Gespeichert ✓" });
                      } catch (e) {
                        console.error("[KundenDetail] persist skript notes failed", e);
                        toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
                      }
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Speichern
                  </Button>
                ) : (
                <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={async () => {
                    try {
                      await setterSkriptRef.current?.persistNow?.();
                      toast({ title: "Skript-Notizen gespeichert ✓" });
                    } catch (e) {
                      console.error("[KundenDetail] persist skript notes failed", e);
                      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
                    }
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Skript-Notizen übernehmen
                </Button>
                {!setterEditMode ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => { setSetterEditMode(true); setSetterNewDatum(setterTerminDatum); setSetterNewUhrzeit(setterTerminUhrzeit); setSetterNewBerater(setterSelectedBerater); setSetterNewBeraterId(setterSelectedBeraterId); }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Erstgesprächstermin ändern & Lead neu zuweisen
                  </Button>
                ) : (
                  <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
                    <p className="text-sm font-semibold">Termin & Zuweisung ändern</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Neues Datum *</Label>
                        <DateInput value={setterNewDatum} onChange={v => setSetterNewDatum(v)} className="mt-1" minDate={heuteIso()} />
                      </div>
                      <div>
                        <Label className="text-xs">Neue Uhrzeit *</Label>
                        <Input type="time" value={setterNewUhrzeit} onChange={e => setSetterNewUhrzeit(e.target.value)} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Vertriebspartner zuweisen *</Label>
                      <Select
                        value={setterNewBeraterId || ""}
                        onValueChange={(uid) => {
                          // Der Wert ist die Kennung, nicht der Name.
                          setSetterNewBeraterId(uid);
                          setSetterNewBerater(beraterUsersForSetter.find(u => u.id === uid)?.name || "");
                        }}
                      >
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Vertriebspartner wählen" /></SelectTrigger>
                        <SelectContent>
                          {beraterUsersForSetter.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 gap-2"
                        disabled={!(setterNewDatum !== setterTerminDatum || setterNewUhrzeit !== setterTerminUhrzeit || setterNewBeraterId !== setterSelectedBeraterId) || !setterNewDatum || !setterNewUhrzeit || !setterNewBerater}
                        onClick={async () => {
                          if (!id || !kunde) return;
                          if (!istTerminInZukunft(setterNewDatum, setterNewUhrzeit)) {
                            toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
                            return;
                          }
                          // Auf das Speichern warten: Lehnt die Datenbank ab, gibt es
                          // weder Glocke noch Erfolgsmeldung, sondern einen Hinweis.
                          let gespeichert = false;
                          try {
                            gespeichert = await updateKontakt(id, {
                              berater: setterNewBerater,
                              setterCloser: setterNewBerater,
                              // Neu zuweisen heisst auch die Kennung: Sonst bliebe
                              // der Lead beim bisherigen Partner, der Name allein
                              // entscheidet nicht mehr.
                              ...(setterNewBeraterId ? { setterCloserId: setterNewBeraterId, zustaendig_id: setterNewBeraterId } : {}),
                              setterTerminDatum: setterNewDatum,
                              setterTerminUhrzeit: setterNewUhrzeit,
                            });
                          } catch {
                            gespeichert = false;
                          }
                          if (!gespeichert) {
                            reloadKunde();
                            await hinweisDialog({
                              title: "Zuweisung nicht gespeichert",
                              description: `Termin und Vertriebspartner wurden nicht geändert. ${setterNewBerater || "Der Vertriebspartner"} bekommt deshalb keine Nachricht. Bitte lade die Seite neu und versuche es noch einmal.`,
                              buttonText: "Verstanden",
                            });
                            return;
                          }
                          addAktivitaet({
                            kundeId: id,
                            art: "anruf",
                            beschreibung: `Erstgespräch geändert auf ${setterNewDatum} um ${setterNewUhrzeit} – Neuer Vertriebspartner: ${setterNewBerater}`,
                            von: user.name,
                          });
                          const beraterUser = findeSetterBerater(setterNewBeraterId, setterNewBerater);
                          let nachrichtOk = true;
                          if (beraterUser) {
                            nachrichtOk = await benachrichtigungAnlegen({
                              benutzer_id: beraterUser.id,
                              titel: `Erstgespräch geändert: ${kunde.vorname} ${kunde.nachname}`,
                              nachricht: `Setter ${user.name || ""} hat den Termin für ${kunde.vorname} ${kunde.nachname} auf ${setterNewDatum} um ${setterNewUhrzeit} Uhr geändert.`,
                              link: `/kunden/${id}`,
                            });
                          }
                          setSetterTerminDatum(setterNewDatum);
                          setSetterTerminUhrzeit(setterNewUhrzeit);
                          setSetterSelectedBerater(setterNewBerater);
                          setSetterSelectedBeraterId(setterNewBeraterId);
                          reloadKunde();
                          if (nachrichtOk) {
                            toast({ title: "Termin & Zuweisung aktualisiert ✓" });
                          } else {
                            toast({
                              title: "Termin geändert, Nachricht kam nicht an",
                              description: `${setterNewBerater} weiß noch nichts von der Änderung. Bitte kurz selbst Bescheid geben.`,
                              variant: "destructive",
                            });
                          }
                          setSetterEditMode(false);
                        }}
                      >
                        <Calendar className="h-4 w-4" />
                        Änderung bestätigen
                      </Button>
                      <Button variant="ghost" onClick={() => setSetterEditMode(false)}>Abbrechen</Button>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => navigate("/lead-verwaltung")}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zurück zur Lead-Verwaltung
                </Button>
                </>
                )}
              </div>
            )}
              </Card>
            )}
          />
            </div>
          </details>
          </Card>
        </>
    );
  };

  // Beide Einstiege öffnen dasselbe vorhandene Formular mit demselben Startstand.
  const oeffneStammdatenBearbeitung = () => {
                  const rowMeta = (cacheGet("kontakte").find((r: any) => r.id === kunde.id)?.meta) || {};
                  setEditData({
                    vorname: kunde.vorname, nachname: kunde.nachname, email: kunde.email,
                    telefon: kunde.telefon, geburtstag: kunde.geburtstag, strasse: kunde.strasse,
                    hausnummer: kunde.hausnummer, plz: kunde.plz, ort: kunde.ort, quelle: kunde.quelle,
                    empfehlungsgeberName: rowMeta.empfehlungsgeberName || "",
                    empfehlungsgeberBeziehung: rowMeta.empfehlungsgeberBeziehung || "",
                    erstelltVonId: rowMeta.erstelltVonId || "",
                    erstelltVonName: rowMeta.erstelltVonName || "",
                    person2: kunde.person2 ? { ...kunde.person2 } : undefined,
                  } as any);
                  setEditSprache(null);
                  setEditDialog(true);
    wechsleReiter("stammdaten");
  };

  const renderProfilVerwaltung = () => (
    <div className={`kundenprofil-verwaltung ${isFinanzierer ? "finanzierer-readonly" : ""}`}>
              {/* Bestehendes Empfehlungsprogramm unter dem Kundenportal. */}
              {!isFinanzierer && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <EmpfehlungsprogrammKnoepfe
                    ueberschrift={<KundenprofilUeberschrift>Empfehlungsprogramm</KundenprofilUeberschrift>}
                    kunde={kunde}
                    investments={investments}
                    currentUser={{ id: (user as any)?.id, name: user?.name, role: user?.role }}
                    onChanged={() => {
                      try { cacheRefreshTable("kontakte"); } catch {}
                      forceUpdate(n => n + 1);
                    }}
                  />
                </div>
              )}

      {/* Bottom actions */}
      <div className="flex justify-center gap-4 pt-4 flex-wrap">
        {(["admin", "inhaber", "vertriebspartner", "setterin"].includes(user.role)) && !kunde?.archiviert && (
          <Button variant="outline" onClick={() => { setArchivGrund(""); setArchivDialog(true); }}>
            <Archive className="h-4 w-4 mr-1" /> Kunde archivieren
          </Button>
        )}
        {(["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "setterin"].includes(user.role)) && kunde?.pipelineStufe !== "verloren" && (
          <Button variant="destructive" onClick={() => { setVerlorenGrund(""); setVerlorenDialog(true); }}>
            <XCircle className="h-4 w-4 mr-1" /> Kunde verloren
          </Button>
        )}
        {/*
         * Wiederaufnahme: Bisher gab es nur den Weg nach "verloren", aber
         * keinen zurueck. Ein Partner konnte einen Kontakt, der sich spaeter
         * doch wieder meldet, nur ueber den manuellen Stufenwechsel retten,
         * und der half nicht, weil der Status "verloren" die effektive Stufe
         * schlaegt (siehe kontaktPipeline). Deshalb dieser Knopf: Er raeumt
         * Status, Grund und Archivkennzeichen gemeinsam auf.
         */}
        {(["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "setterin"].includes(user.role))
          && kunde && (getEffectivePipelineStufe(kunde) === "verloren" || kunde.archiviert) && (
          <Button
            variant="outline"
            className="border-[hsl(var(--success))] text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10"
            onClick={() => setWiederaufnahmeDialog(true)}
          >
            <RotateCcw className="h-4 w-4 mr-1" /> Kunde wieder aufnehmen
          </Button>
        )}
        <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => setDeleteDialog(true)}><Trash2 className="h-4 w-4 mr-1" /> Löschung beantragen</Button>
        {(["admin", "inhaber"].includes(user.role)) && (
          <Button
            variant="destructive"
            onClick={() => setDsgvoHardDeleteOpen(true)}
            title="DSGVO Art. 17 — Sofortlöschung (unwiderruflich, kein 7-Tage-Countdown)"
          >
            <AlertTriangle className="h-4 w-4 mr-1" /> DSGVO-Sofortlöschung
          </Button>
        )}
      </div>
    </div>
  );

  const renderEmpfehlungen = () => {
    // Empfehlungen, die dieser Kunde abgegeben hat (er ist Empfehlungsgeber)
    const abgegebeneEmpfehlungen = kunde
      ? cacheGet("empfehlungen").filter((r: any) => {
          const m = r.meta || {};
          return m.empfehlenderKundeId === kunde.id || m.kontaktId === kunde.id;
        })
      : [];
    return <div className={isFinanzierer ? "finanzierer-readonly" : ""}>
      {abgegebeneEmpfehlungen.length > 0 && (
        <Card className="p-6">
          <div className="w-8 h-1 bg-primary mb-3" />
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            Abgegebene Empfehlungen ({abgegebeneEmpfehlungen.length})
          </h3>
          <div className="space-y-2">
            {abgegebeneEmpfehlungen.map((emp: any) => {
              const status = emp.status || "neu";
              // Zentrale Labels aus dem Store (inkl. in_beratung, in_abwicklung,
              // dublette); "offen" heisst hier weiterhin "Eingereicht", weil es
              // um selbst abgegebene Empfehlungen geht.
              const statusLabel: Record<string, string> = {
                ...EMPFEHLUNG_STATUS_LABEL,
                offen: "Eingereicht",
              };
              const neuerKontaktId = emp.meta?.neuerKontaktId;
              return (
                <div key={emp.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {neuerKontaktId ? (
                      <button
                        className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                        onClick={() => navigate(`/kunden/${neuerKontaktId}`)}
                      >
                        {emp.empfohlen_name}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="text-sm font-semibold">{emp.empfohlen_name}</span>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {emp.empfohlen_email && <span>{emp.empfohlen_email}</span>}
                      {emp.empfohlen_email && emp.empfohlen_telefon && <span> · </span>}
                      {emp.empfohlen_telefon && <span>{emp.empfohlen_telefon}</span>}
                      {emp.meta?.beziehung && <span> · {emp.meta.beziehung}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {statusLabel[status] || status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {abgegebeneEmpfehlungen.length === 0 && <Card className="p-6"><h2 className="font-semibold mb-2">Abgegebene Empfehlungen</h2><p className="text-sm text-muted-foreground">Dieser Kunde hat noch keine Empfehlungen abgegeben.</p></Card>}
    </div>;
  };

  // Dieselbe Regel wie beim Knopf „Bearbeiten“ der Stammdaten: Finanzierer
  // lesen nur, der Kunde kommt hier gar nicht hin.
  const darfKundenspracheAendern = !isFinanzierer && user.role !== "kunde";
  const waehleKundenSprache = async (sprache: Sprache) => {
    if (!id) return;
    const ergebnis = await setzeKundenSprache(id, sprache);
    if (ergebnis.ok) {
      toast({
        title: sprache === "en" ? "Kundensprache auf Englisch gestellt" : "Kundensprache auf Deutsch gestellt",
        description: "Mails, Dokumente und Portal folgen ab jetzt dieser Sprache.",
      });
    } else {
      toast({ title: "Sprache nicht gespeichert", description: ergebnis.grund, variant: "destructive" });
    }
  };

  const renderProfilStammdaten = () => {
    const name = tarnName(`${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim());
    const felder = [
      { label: "E-Mail", wert: kunde.email ? <a href={tarnVerweis(`mailto:${kunde.email}`)} className="text-primary hover:underline">{tarnEmail(kunde.email)}</a> : null },
      { label: "Telefon", wert: kunde.telefon ? <a href={tarnVerweis(`tel:${kunde.telefon}`)} className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); rufeAnUndProtokolliere(kunde.telefon); }}>{tarnTelefon(normalizeTelefon(kunde.telefon))}</a> : null },
      { label: "Adresse", wert: <>{[kunde.strasse, kunde.hausnummer].filter(Boolean).join(" ")}<br />{[kunde.plz, kunde.ort].filter(Boolean).join(" ")}</> },
      /*
       * Kundensprache (Plan Kundensprache vom 25.09.2026, Etappe 0). Ein Klick
       * speichert sofort. Wer die übrigen Stammdaten nicht bearbeiten darf,
       * sieht nur den Text; serverseitig entscheidet `merge_kontakt_meta`.
       */
      {
        label: "Sprache",
        wert: <KundenspracheFeld
          wert={kundenSpracheAnzeige}
          onWahl={darfKundenspracheAendern ? waehleKundenSprache : undefined}
        />,
      },
    ];
    return <KundenprofilStammdaten
      name={name}
      namenZusatz={kundenSpracheStand.sprache === "en" ? <KundenspracheKuerzel sprache="en" /> : undefined}
      anrede={kunde.anrede}
      /*
       * Seit dem 16.09.2026 steht die Ampel hier unter dem Namen statt als
       * kleiner Punkt oben in der Titelzeile. Dieselbe Rechnung wie in der
       * Kachel "Nächste Aktion", das Bauteil holt sie sich selbst aus
       * `berechneInaktivitaetsAmpel`.
       */
      ampel={<InactivityAmpel kunde={kunde} size="md" showLabel />}
      /*
       * Die Schnellaktionen sind vom Seitenkopf hierher gezogen. Sie rufen
       * weiterhin `fuehreSchnellaktionAus`, also dieselben Dialoge und
       * Nebenwirkungen wie vorher. Wer sie sehen darf, bleibt ebenfalls
       * unverändert: Die alte Leiste im Seitenkopf hatte keine Rollenabfrage,
       * also hat die neue auch keine.
       */
      aktionen={<KundenprofilAktionsleiste onAktion={fuehreSchnellaktionAus} />}
      felder={felder}
      verwaltung={renderProfilVerwaltung()}
      onWeitereFelder={() => wechsleReiter("stammdaten")}
      onBearbeiten={!isFinanzierer ? oeffneStammdatenBearbeitung : undefined}
      /*
       * Seit dem 23.09.2026 derselbe Portalblock wie im Investment, mit
       * denselben Handlern und Rechten (`kundenportalAngaben`). Status und
       * Datum sieht jeder, der das Profil sieht, wie vorher das Kästchen.
       * Die Knöpfe nur, wer sie auch im Investment sieht. Freigeschaltet wird
       * weiterhin im Investment, daher hier kein `onFreischalten`.
       */
      portal={<KundenportalZugang {...kundenportalAngaben} darstellung="profil" />}
    />;
  };

  /**
   * "Zur Aktion springen": öffnet den Reiter, auf dem die Aktion liegt, rollt
   * dorthin und rahmt sie orange, wie jeder andere Sprung im Profil. Fehlt
   * der Anker, etwa weil die Karte gerade nicht gezeigt wird, bleibt es beim
   * Reiterwechsel.
   */
  const springeZuAktion = (aktion: GeplanteAktion) => {
    const ziel = aktion.sprungziel;
    if (!ziel || ziel.reiter === "aktivitaeten") {
      setAktivitaetenAnsicht("manuell");
      setAktivitaetenFilter("alle");
      // Die Zeile liegt womöglich auf einer späteren Seite der Liste.
      if (ziel) {
        const index = manuelleAktivitaeten.findIndex((a) => `aktivitaet-${a.id}` === ziel.ankerId);
        if (index >= 0) aktPag.setPage(aktPag.showAll ? 1 : Math.floor(index / aktPag.pageSize) + 1);
      }
      wechsleReiter("aktivitaeten");
    } else {
      wechsleReiter(ziel.reiter);
    }
    if (!ziel) return;
    // Der Reiter muss erst gezeichnet sein, sonst gibt es den Anker noch nicht.
    setTimeout(() => {
      const el = document.getElementById(ziel.ankerId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      markiereProfilAbschnitt(el);
    }, 300);
  };

  /** Der echte Grund eines Fehlschlags, nicht "etwas ist schiefgelaufen". */
  const fehlerGrund = (fehler: unknown): string =>
    String((fehler as { message?: string })?.message || fehler || "").trim() ||
    "Kein Grund gemeldet. Bitte in ein paar Sekunden erneut versuchen.";

  /** Nimmt ein Abhaken wieder zurück, aus dem Toast heraus. */
  const oeffneKundenAufgabeWieder = async (eintrag: KundenAufgabe) => {
    try {
      if (eintrag.quelle === "aufgabe") await oeffneAufgabe(eintrag.id);
      else await uncompleteFollowUp(eintrag.id);
      toast({ title: "Wieder offen", description: eintrag.titel });
    } catch (fehler) {
      toast({
        title: "Rückgängig hat nicht geklappt",
        description: fehlerGrund(fehler),
        variant: "destructive",
      });
    }
  };

  /**
   * Abhaken direkt im Kundenprofil.
   *
   * Geschrieben wird in dieselben Tabellen, aus denen auch die Inbox liest.
   * Deshalb verschwindet der Vorgang überall zugleich, ohne eigenes Aufräumen.
   */
  const erledigeKundenAufgabe = async (eintrag: KundenAufgabe) => {
    try {
      if (eintrag.quelle === "aufgabe") await erledigeAufgabe(eintrag.id);
      else await completeFollowUp(eintrag.id);
    } catch (fehler) {
      toast({
        title: "Konnte nicht abgehakt werden",
        description: fehlerGrund(fehler),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Erledigt ✓",
      description: eintrag.titel,
      duration: 8000,
      action: (
        <ToastAction altText="Erledigen rückgängig machen" onClick={() => { void oeffneKundenAufgabeWieder(eintrag); }}>
          Rückgängig
        </ToastAction>
      ),
    });
  };

  /**
   * Die Ergebnis-Kaesten zu gebuchten Terminen.
   *
   * Sie standen bis 09/2026 im Reiter Stammdaten. Christian hat sie am
   * 16.09.2026 in den Kopfbereich geholt: Dort sind sie in jedem Reiter zu
   * sehen, also auch dann, wenn er gerade im Investment arbeitet. Genau dort
   * hat er sie vorher gesucht und nicht gefunden.
   *
   * Sie stehen unter den vier Kacheln und ueber der Aktionsliste, in voller
   * Breite. In die Kachel "Naechste Aktion" gehoeren sie nicht: Nachgemessen
   * ist eine Kachel bei 1280 Pixeln Fensterbreite 238 Pixel breit und bei
   * 1440 Pixeln 318, dort stehen schon Ueberschrift, Titel und Zeitpunkt.
   * Die Zeile darunter misst 486 beziehungsweise 646 Pixel.
   *
   * Mehrere offene Termine bekommen je einen eigenen Kasten, untereinander
   * und nach Zeitpunkt sortiert. Es verschwindet also keiner.
   */

  /**
   * Der Haken an einem Eintrag der Aktionsliste.
   *
   * Aufgabe und Follow-up sind mit einem Klick erledigt, und zwar ueber
   * genau denselben Weg wie das Haekchen im Kasten "Offene Aufgaben".
   * Ein Termin dagegen nie: Hinter ihm haengt die Folgekette (NoShow-Stufe,
   * Aufgabe zur Neuterminierung), deshalb fuehrt er in die Rueckfrage mit den
   * drei Antworten. Feste Termine am Kontakt haben keine Termin-Zeile im
   * Verlauf; sie werden im Ergebnis-Kasten oben gepflegt, dorthin wird
   * gesprungen.
   */
  const aktionAbschliessen = async (aktion: GeplanteAktion) => {
    const weg = abschlussWeg(aktion);
    // Eine ausstehende Unterschrift hat keinen Haken, siehe `abschlussWeg`.
    if (weg === "hinweis") return;
    if (weg === "direkt") {
      /*
       * Nicht jede "Aufgabe" in dieser Liste ist eine Zeile in `aufgaben`.
       *
       * `kundenNaechsteAktion` fuehrt am Ende auch Verlaufseintraege, hinter
       * denen keine echte Aufgabe steht: aeltere Meetings und Aufgaben aus der
       * Zeit vor der Tabelle. Sie tragen den Schluessel `aktivitaet:<id>` und
       * trotzdem die Art "aufgabe".
       *
       * Der Haken schnitt bisher stumpf alles hinter dem Doppelpunkt heraus
       * und suchte damit eine Aufgabe, die es nicht gibt. Ergebnis: Klick ohne
       * Wirkung, der Eintrag blieb stehen. Gemeldet von Christian am
       * 16.09.2026 an zwei Eintraegen namens "test".
       */
      if (aktion.schluessel.startsWith("aktivitaet:")) {
        try {
          await setzeAktivitaetErledigt(aktion.schluessel.slice("aktivitaet:".length));
          reloadKunde();
          toast({ title: "Erledigt ✓", description: aktion.titel });
        } catch {
          toast({ title: "Konnte nicht gespeichert werden", variant: "destructive" });
        }
        return;
      }
      const quelle = aktion.schluessel.startsWith("follow_up:") ? "follow_up" : "aufgabe";
      await erledigeKundenAufgabe({
        schluessel: aktion.schluessel,
        id: aktion.schluessel.slice(aktion.schluessel.indexOf(":") + 1),
        quelle,
        titel: aktion.titel,
        faelligTag: "",
        prioritaet: "mittel",
        ueberfaellig: aktion.ueberfaellig,
        heute: false,
      });
      return;
    }
    if (weg === "fester_termin") {
      /*
       * Einen Ergebnis-Kasten gibt es nur für den offenen Setter-Termin am
       * Kontakt. Für jeden anderen festen Termin (Beratungsgespräch am
       * Kontakt, Termin an einem Investment, Notar) sprang der Haken bisher zu
       * einem Kasten, den es nicht gab, und es geschah nichts. Gemeldet von
       * Christian am 29.09.2026 an einem Beratungsgespräch vom 24.06.
       *
       * Dort fragt der Haken jetzt selbst nach, die Antworten laufen ueber
       * `festerTerminErgebnis.ts`. Vergangene Erst- und Beratungsgespraeche
       * haben zusaetzlich einen eigenen Ergebnis-Kasten, siehe
       * `renderTerminErgebnisse`.
       */
      const kastenZeigtIhn = !!kunde && aktion.terminSchluessel === offenerSetterTerminSchluessel(kunde);
      if (kastenZeigtIhn || !kunde || !id || !aktion.terminSchluessel) {
        springeZuAktion(aktion);
        toast({
          title: "Dieser Termin wird oben abgeschlossen",
          description: "Der Ergebnis-Kasten steht unter den vier Kacheln, dort liegen die drei Antworten.",
        });
        return;
      }
      /*
       * Seit 29.09.2026 mit drittem Knopf. "Stattgefunden" oder "Behalten"
       * passte nicht auf einen vergangenen Termin, der geplatzt ist: Er ist
       * nicht erledigt, und behalten will ihn auch keiner. "Nicht
       * stattgefunden" nimmt ihn aus der Liste, ohne ihn als erledigt zu
       * zaehlen, und fuehrt beim Erst- und Beratungsgespraech in dieselbe
       * No-Show-Kette wie der Ergebnis-Kasten.
       */
      const wann = aktionZeitpunktText(aktion);
      const art = festeGespraechsArt(aktion.titel);
      const wahl = await auswahlDialog({
        title: `${aktion.titel}: Ergebnis`,
        description: [
          `Termin: ${wann}.`,
          "Stattgefunden: Der Termin gilt als erledigt.",
          art
            ? `Nicht stattgefunden: Der Termin fällt aus der Liste, die Pipeline rückt nicht vor. Nächster Schritt: ${neuerTerminSchritt(art)}.`
            : "Nicht stattgefunden: Der Termin fällt aus der Liste, ohne als erledigt zu gelten.",
          "Das eingetragene Datum am Kontakt bleibt erhalten.",
        ].join("\n"),
        optionen: rueckfrageOptionen(),
      });
      if (!wahl || wahl === "behalten") return;
      const ctx = festerTerminKontext();
      if (!ctx) return;
      const termin = festerTerminAusSchluessel(aktion.titel, aktion.terminSchluessel);
      const ok = wahl === "stattgefunden"
        ? await festerTerminStattgefunden(termin, ctx)
        : await festerTerminNichtStattgefunden(termin, ctx);
      if (ok) reloadKunde();
      return;
    }
    // Termin mit Zeile im Verlauf: den passenden Ergebnis-Termin holen und
    // die drei Antworten anbieten. Ohne Zeitgrenze, denn die Aktionsliste
    // zeigt auch alte Termine.
    if (!id) return;
    let gefunden: ErgebnisTermin | null = null;
    try {
      const termine = await ladeErgebnisTermine(id, { rueckblickTage: null });
      gefunden = findeErgebnisTermin(termine, aktion.aktivitaetId);
    } catch (fehler) {
      console.error("Ergebnis-Termin konnte nicht geladen werden:", fehler);
    }
    if (!gefunden) {
      await hinweisDialog({
        title: "Zu diesem Termin gibt es kein Ergebnis-Feld",
        description: "Der Termin steht im Verlauf, aber er ist dort nicht mehr als offener Termin hinterlegt. Bitte den Eintrag im Verlauf selbst bearbeiten.",
      });
      return;
    }
    setAktionTermin(gefunden);
  };

  /** Darf dieser Nutzer den Eintrag abschliessen? Termine gehoeren dem Berater. */
  const darfAktionAbschliessen = (aktion: GeplanteAktion): boolean => {
    if (isFinanzierer) return false;
    if (abschlussWeg(aktion) === "direkt") return true;
    // Dieselbe Regel wie an den Ergebnis-Kaesten selbst. Massgeblich bleibt
    // die Zugriffskontrolle der Datenbank, das Ausblenden kommt zusaetzlich.
    return isAdminOrInhaber || isAssignedBerater;
  };

  /**
   * Der Sammelweg: alle ueberfaelligen Aufgaben und Follow-ups auf einmal.
   *
   * Termine sind nie dabei, siehe `sammelbareAufgaben`. Die Rueckfrage zaehlt
   * auf, was betroffen ist, damit nichts stillschweigend verschwindet.
   */
  const alleUeberfaelligenAufgabenErledigen = async () => {
    const betroffen = sammelbareAufgaben(geplanteAktionen);
    if (betroffen.length === 0) return;
    const bestaetigt = await confirmDialog({
      title: "Alle überfälligen Aufgaben erledigen?",
      description: sammelwegBeschreibung(geplanteAktionen),
      confirmText: "Erledigen",
      cancelText: "Behalten",
    });
    if (!bestaetigt) return;
    let gescheitert = 0;
    for (const aktion of betroffen) {
      try {
        if (aktion.schluessel.startsWith("follow_up:")) {
          await completeFollowUp(aktion.schluessel.slice("follow_up:".length));
        } else {
          await erledigeAufgabe(aktion.schluessel.slice("aufgabe:".length));
        }
      } catch (fehler) {
        gescheitert += 1;
        console.error("Sammelweg: Eintrag nicht abgehakt:", fehler);
      }
    }
    const erledigt = betroffen.length - gescheitert;
    toast({
      title: gescheitert === 0 ? `${erledigt} Aufgaben erledigt ✓` : `${erledigt} von ${betroffen.length} erledigt`,
      description: gescheitert === 0
        ? "Termine und Videomeetings sind unberührt geblieben."
        : `${gescheitert} konnten nicht gespeichert werden und stehen weiterhin in der Liste.`,
      variant: gescheitert === 0 ? undefined : "destructive",
    });
  };

  const renderTerminErgebnisse = () => {
    if (!kunde) return null;
    return (
      <>
        {/* Erstgespräch-Ergebnis (VP-Bereich) */}
        {(() => {
          if (isSetterinRole) return null;
          /*
           * `setterTerminGebucht` ist seit dem 16.09.2026 keine Bedingung mehr.
           *
           * Es sagt nur, ob der Termin ueber den Buchungskalender entstand. Wer
           * ihn von Hand eintraegt, hatte danach keinen Weg mehr, sein Ergebnis
           * festzuhalten: Der Kasten kam nicht, der Eintrag stand aber weiter
           * als ueberfaellig in der Aktionsliste, und der Haken an ihm verwies
           * auf genau diesen fehlenden Kasten. Ein Termin ist ein Termin,
           * gleich wie er entstanden ist.
           */
          if (!kunde.setterTerminDatum) return null;
          const ergebnis = kunde.terminErgebnis;
          const canSet = isAdminOrInhaber || isAssignedBerater;
          if (!canSet && !ergebnis) return null;

          /*
           * Der Kasten gilt dem Termin, nicht dem Kontakt. Nach
           * "Stattgefunden" oder einem erfassten No-Show zu genau diesem
           * Termin verschwindet er; ein neu eingetragener Termin bekommt ihn
           * wieder, auch wenn am Kontakt noch "noshow" steht.
           *
           * Bis 30.09.2026 stand nach einem No-Show hier dauerhaft ein roter
           * Hinweis "No-Show beim ...". Christian fand ihn unnoetig: Stufe
           * (EG/BG NoShow), Verlaufseintrag und die drei Folgeaufgaben sagen
           * dasselbe. `terminErgebnis` wird weiter geschrieben, die
           * No-Show-Quote im Dashboard liest es.
           */
          if (!offenerSetterTerminSchluessel(kunde)) return null;

          return (
            // Die id ist das Sprungziel der Kachel "Nächste Aktion" für feste Termine.
            <Card id="kundenprofil-setter-termin" className="p-6 border-primary/30">
              <div className="w-8 h-1 bg-primary mb-3" />
              <h3 className="font-bold mb-1">{setterTerminName(kunde)}: Ergebnis</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Termin: <strong>{kunde.setterTerminDatum}</strong> um <strong>{kunde.setterTerminUhrzeit}</strong>
                {kunde.berater && <> mit <strong>{kunde.berater}</strong></>}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[hsl(var(--success))]/40 hover:bg-[hsl(var(--success))]/10 text-xs h-9"
                  onClick={handleTerminErschienen}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Stattgefunden
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/40 hover:bg-destructive/10 text-xs h-9"
                  onClick={handleTerminNoShow}
                >
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> No-Show
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[hsl(var(--warning))]/40 hover:bg-[hsl(var(--warning))]/10 text-xs h-9"
                  onClick={() => {
                    setVerschiebenFest(null);
                    setVerschiebenDatum(kunde.setterTerminDatum || "");
                    setVerschiebenUhrzeit(kunde.setterTerminUhrzeit || "");
                    setVerschiebenDialog(true);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Verschoben
                </Button>
              </div>

              {(kunde.noShowHistorie?.length || 0) > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Bisherige No-Shows ({kunde.noShowHistorie!.length})</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {kunde.noShowHistorie!.map((h, i) => (
                      <li key={i}>· {h.datum} um {h.uhrzeit} mit {h.berater}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })()}

        {/*
          Vergangene Erst- und Beratungsgespraeche, die nur als Datum am
          Kontakt oder Investment stehen, nicht im Setter-Feld. Bis 29.09.2026
          gab es fuer sie keinen Kasten, nur den Haken in "Naechste Aktion".
          Die Liste kommt aus derselben Rechnung wie die Kachel, also ohne
          Doppelte und ohne bereits beantwortete Termine.
        */}
        {(() => {
          if (isSetterinRole || !(isAdminOrInhaber || isAssignedBerater)) return null;
          const setterSchluessel = offenerSetterTerminSchluessel(kunde);
          const offene = geplanteAktionen.filter((a) =>
            a.ueberfaellig &&
            !!a.terminSchluessel &&
            a.terminSchluessel !== setterSchluessel &&
            !!festeGespraechsArt(a.titel));
          return offene.map((a) => (
            <Card key={a.schluessel} className="p-6 border-primary/30">
              <div className="w-8 h-1 bg-primary mb-3" />
              <h3 className="font-bold mb-1">{a.titel}: Ergebnis</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Termin: <strong>{aktionZeitpunktText(a)}</strong>
                {kunde.berater && <> mit <strong>{kunde.berater}</strong></>}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[hsl(var(--success))]/40 hover:bg-[hsl(var(--success))]/10 text-xs h-9"
                  disabled={festBeschaeftigt === a.schluessel}
                  onClick={() => void beantworteFestenTermin(a, "stattgefunden")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Stattgefunden
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/40 hover:bg-destructive/10 text-xs h-9"
                  disabled={festBeschaeftigt === a.schluessel}
                  onClick={() => void beantworteFestenTermin(a, "nicht_stattgefunden")}
                >
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> No-Show
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[hsl(var(--warning))]/40 hover:bg-[hsl(var(--warning))]/10 text-xs h-9"
                  disabled={festBeschaeftigt === a.schluessel}
                  onClick={() => verschiebeFestenTermin(a)}
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Verschoben
                </Button>
              </div>
            </Card>
          ));
        })()}

        {/* Ergebnis-Karten fuer gebuchte Videocalls, dasselbe Muster wie oben */}
        {id && (
          <BuchungErgebnisKarten
            kundeId={id}
            kundeName={`${kunde.vorname || ""} ${kunde.nachname || ""}`.trim() || "Kunde"}
            kundeEmail={kunde.email || undefined}
            kundeTelefon={kunde.telefon || undefined}
            beraterName={kunde.berater || undefined}
            canSet={isAdminOrInhaber || isAssignedBerater}
            userName={user.name}
            /*
             * Ohne Zeitgrenze. Die Karte liess von Hand angelegte Meetings
             * nach 14 Tagen los, waehrend die Aktionsliste sie unbegrenzt
             * weiter als ueberfaellig zeigte. Ein Beratungsgespraech vom
             * 31.07. war damit nirgends mehr abzuschliessen. Ein unerledigter
             * Termin verschwindet nicht dadurch, dass er alt wird; beide
             * Anzeigen sagen jetzt dasselbe.
             */
            rueckblickTage={null}
          />
        )}
      </>
    );
  };

  const renderProfilKennzahlen = () => {
    /*
     * Die Setterin ist die einzige Rolle ohne Uebersicht-Reiter, und genau sie
     * terminiert die Erstgespraeche. Seit die Ergebnis-Kaesten am Kopfbereich
     * haengen statt in den Stammdaten, haette sie mit der Uebersicht auch die
     * Kaesten verloren. Sie bekommt sie deshalb allein, ohne die Kennzahlen.
     * Druecken darf sie die Knoepfe ohnehin nicht, das entscheidet `canSet`.
     */
    if (!istErlaubterReiter("uebersicht", user.role as string)) {
      const nurTermine = renderTerminErgebnisse();
      return nurTermine ? <div className="mb-4 space-y-4">{nurTermine}</div> : null;
    }
    if (!profilKennzahlenBereit) return <Card className="p-4 mb-4 text-sm text-muted-foreground" role="status">Übersicht wird geladen …</Card>;
    // Die bestehenden Quellen liefern weiterhin Aufgaben, Termine und Schritte.
    const letzter = aktivitaeten.find((a) => !istSystemEintrag(a) && ["anruf_protokoll", "meeting_protokoll", "email"].includes(a.art));
    // Gezählt wird jetzt dieselbe Liste, die aufgeklappt zu sehen ist. Vorher
    // zählte die Kachel nur Aufgaben, die Liste zeigt zusätzlich Follow-ups.
    const { gesamt, ueberfaellig } = zaehleKundenAufgaben(offeneKundenAufgaben);
    const aktuellstesInvestment = investmentFuerNaechstenSchritt(investments, activeTab === "investments" ? gewaehltesInvestment : null);
    const schritt = aktuellstesInvestment ? getNextSteps(aktuellstesInvestment.pipelineStufe, isAdminOrInhaber || (user.role as string) === "vertriebsleiter") : null;
    return <KundenprofilKennzahlen
      schritt={schritt}
      investmentNummer={aktuellstesInvestment?.nummer}
      letzter={letzter ? { artLabel: ART_LABELS[letzter.art], datum: letzter.datum } : undefined}
      aufgabenAnzahl={gesamt}
      ueberfaellig={ueberfaellig}
      onUebersicht={() => wechsleReiter("uebersicht")}
      /*
       * "Alle nächsten Schritte" führte bisher in den Reiter Übersicht. Von
       * dort musste man das Investment erst suchen. Jetzt geht es direkt in
       * den Vorgang, den die Kachel nennt, und der Abschnitt dort wird orange
       * umrandet, genau wie bei jedem anderen Sprung im Profil.
       */
      onNaechsteSchritte={aktuellstesInvestment ? () => {
        const invId = aktuellstesInvestment.id;
        oeffneInvestment(invId, { nachObenRollen: false });
        setHighlightInvSteps({ id: invId, ts: Date.now() });
        // Das Investment muss erst gezeichnet sein, sonst gibt es den Anker noch nicht.
        setTimeout(() => {
          const el = document.getElementById(`naechste-schritte-${invId}`);
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          markiereProfilAbschnitt(el);
        }, 300);
      } : undefined}
      onVerlauf={() => { setAktivitaetenAnsicht("manuell"); wechsleReiter("aktivitaeten"); }}
      onAufgaben={() => { setAktivitaetenAnsicht("manuell"); setAktivitaetenFilter("aufgabe"); wechsleReiter("aktivitaeten"); }}
      aufgaben={offeneKundenAufgaben}
      listeOffen={offeneAufgabenKachel.offen}
      onListeUmschalten={offeneAufgabenKachel.umschalten}
      // Der Finanzierungspartner liest das Kundenprofil nur. Maßgeblich bleibt
      // die Zugriffskontrolle der Datenbank, das Häkchen fehlt zusätzlich.
      onErledigen={isFinanzierer ? undefined : erledigeKundenAufgabe}
      onAufgabeAnlegen={isFinanzierer ? undefined : () => setActionDialog("aufgabe")}
      // Die Kachel "Nächste Aktion": dieselbe Ampel wie hinter dem Namen, eine
      // Rechnung an einer Stelle, damit Kopf und Kachel nie auseinanderlaufen.
      aktionen={geplanteAktionen}
      ampel={berechneInaktivitaetsAmpel(kunde)}
      aktionenOffen={naechsteAktionKachel.offen}
      onAktionenUmschalten={naechsteAktionKachel.umschalten}
      onAktionSpringen={springeZuAktion}
      // "Aktion erstellen" öffnet dieselben Dialoge wie die Schnellaktionsleiste.
      onAktionErstellen={isFinanzierer ? undefined : fuehreSchnellaktionAus}
      aktionArten={QUICK_ACTIONS.filter((a) => a.art === "aufgabe" || a.art === "meeting") as Array<{ art: "aufgabe" | "meeting"; label: string; icon: React.ReactNode }>}
      onAktionenVerlauf={() => { setAktivitaetenAnsicht("manuell"); setAktivitaetenFilter("alle"); wechsleReiter("aktivitaeten"); }}
      // Der Haken je Eintrag und der Sammelweg. Der Finanzierungspartner liest
      // das Profil nur, er bekommt beides nicht.
      onAktionAbschliessen={isFinanzierer ? undefined : aktionAbschliessen}
      darfAktionAbschliessen={darfAktionAbschliessen}
      onAlleAufgabenErledigen={isFinanzierer ? undefined : alleUeberfaelligenAufgabenErledigen}
      // Die Ergebnis-Kaesten zu gebuchten Terminen, seit 09/2026 im Kopf statt
      // im Reiter Stammdaten.
      termine={renderTerminErgebnisse()}
    />;
  };

  const renderStammdaten = () => {
    const analyseResult = kunde ? getAnalyseResultForKontakt(kunde.id) : null;
    const rawRow = kunde ? cacheGet("kontakte").find((r: any) => r.id === kunde.id) : null;
    const rawMeta = rawRow?.meta || {};
    const analyseNachricht = (
      analyseResult?.leadMessage ||
      rawMeta?.analyseNachricht ||
      (typeof kunde?.position === "string" && kunde.position.startsWith("Notiz: ") ? kunde.position.replace(/^Notiz:\s*/, "") : "") ||
      rawRow?.notizen ||
      ""
    ).trim();
    const empfehlungsgeberName = rawMeta.empfehlungsgeberName as string | undefined;
    const empfehlungsgeberKontaktId = rawMeta.empfehlungsgeberKontaktId as string | undefined;
    const empfehlungsgeberBeziehung = rawMeta.empfehlungsgeberBeziehung as string | undefined;
    const empfehlungsgeberRow = (
      <>
        <span className="font-semibold">Empfehlungsgeber:</span>
        <span>
          {empfehlungsgeberName ? (
            <>
              {empfehlungsgeberKontaktId ? (
                <button className="text-primary hover:underline text-sm" onClick={() => navigate(`/kunden/${empfehlungsgeberKontaktId}`)}>
                  {empfehlungsgeberName}
                </button>
              ) : empfehlungsgeberName}
              {empfehlungsgeberBeziehung && <span className="text-muted-foreground text-xs ml-1">({empfehlungsgeberBeziehung})</span>}
            </>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </span>
      </>
    );
    const empfehlungsgeberEditRow = (
      <>
        <span className="font-semibold">Empfehlungsgeber:</span>
        <div className="grid grid-cols-2 gap-2">
          <Input
            className="h-8"
            placeholder="Name (optional)"
            value={(editData as any).empfehlungsgeberName ?? ""}
            onChange={e => setEditData(p => ({ ...(p as any), empfehlungsgeberName: e.target.value }))}
          />
          <Input
            className="h-8"
            placeholder="Beziehung (optional)"
            value={(editData as any).empfehlungsgeberBeziehung ?? ""}
            onChange={e => setEditData(p => ({ ...(p as any), empfehlungsgeberBeziehung: e.target.value }))}
          />
        </div>
      </>
    );
    return (
    <div className={`space-y-6 ${isFinanzierer ? "finanzierer-readonly" : ""}`}>

      {isFinanzierer && (
        <Card className="p-3 border-2 border-primary/40 bg-primary/5 flex items-start gap-3">
          <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-foreground/80">
            <strong>Nur-Lese-Modus:</strong> Du kannst dieses Kundenprofil einsehen. Änderungen sind ausschließlich im Bereich <strong>Finanzierung</strong> möglich (Angebote anlegen, Dokumente hochladen &amp; freigeben).
          </div>
        </Card>
      )}

      {/* Guidance: Nächste Schritte pro Investment — nimmt VP/Vertriebsleiter/Admin durch den Funnel */}
      {/* (verschoben: jetzt direkt über dem Investments-Block) */}

      {/*
        No-Show-Banner: zeigt die erfassten No-Shows an. Seit 30.09.2026
        (Entscheidung Christian) verschwindet es, sobald ein neues Erst- oder
        Beratungsgespraech eingetragen ist, gleich ueber welchen Weg, und
        kommt erst nach einem erneuten No-Show mit dem aktuellen Zaehler
        wieder. Vorher zaehlte nur das Setter-Feld mit Buchungshaken.
      */}
      {(() => {
        const hist = noShowListe(kunde);
        if (hist.length === 0) return null;
        // Ab Selbstauskunft aufwärts ist der No-Show-Hinweis veraltet und wird ausgeblendet.
        const effStufe = getEffectivePipelineStufe(kunde) || "neuer_lead";
        if (!PRE_SA_PIPELINE_STEPS.has(effStufe)) return null;
        if (neuerGespraechsterminNachNoShow(hist[hist.length - 1], geplanteAktionen)) return null;
        const formatNs = (iso: string) => {
          try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
          } catch { return iso; }
        };
        return (
          <Card className="p-4 border-2 border-destructive/60 bg-destructive/5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-destructive/15 p-2 flex-shrink-0">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-destructive text-sm uppercase tracking-wide">
                    {hist.length === 1 ? "No-Show" : `${hist.length}× No-Show`}
                  </h3>
                  <Badge variant="destructive" className="text-[10px]">{hist.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Dieser Lead ist bereits {hist.length === 1 ? "einmal" : `${hist.length}-mal`} nicht zum Erst- oder Beratungsgespräch erschienen. Bitte beim nächsten Kontakt explizit auf Verbindlichkeit eingehen.
                </p>
                <div className="mt-2 space-y-1">
                  {hist.map((h, i) => (
                    <div key={i} className="text-xs flex items-center gap-2">
                      <span className="font-mono text-destructive font-semibold">#{i + 1}</span>
                      <span className="font-medium">{formatNs(h.datum)}{h.uhrzeit ? ` um ${h.uhrzeit}` : ""}</span>
                      {h.berater && <span className="text-muted-foreground">· mit {h.berater}</span>}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground italic mt-2">
                  Dieser Hinweis verschwindet automatisch, sobald ein neuer Erst- oder Beratungstermin eingetragen ist.
                </p>
              </div>
            </div>
          </Card>
        );
      })()}



      {/* Kundendaten */}
      <div className="space-y-6">
        <Card className="p-6">
          <div className="w-8 h-1 bg-primary mb-3" />
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="font-bold">Kundendaten</h3>
            <div className="shrink-0">
              <LeadScoreBadge saData={saData} />
              <LeadScoreHint saData={saData} />
            </div>
          </div>
          <hr className="mb-4" />

          {editDialog ? (
            <div className="space-y-3">
              {/*
                Dieselbe Anordnung wie in der Ansicht: zwei Spalten, links die
                persoenlichen Daten, rechts Person 2 oder, wenn es keine gibt,
                die Lead- und Verwaltungsdaten. Vorher stapelte der
                Bearbeitungsmodus alles untereinander, dadurch rutschten die
                Lead-Daten unter die persoenlichen Daten in die linke Spalte und
                die Seite sah beim Umschalten voellig anders aus.
              */}
              <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
                <div>
                  {(editData as any).person2 && (
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">Person 1</p>
                  )}
                  <h4 className="font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">Persönliche Daten</h4>
                  <hr className="mb-3" />
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm items-center">
                <span className="font-semibold">ID:</span><span>{formatKundenId(kunde.moreId)}</span>
                <span className="font-semibold">Vorname:</span>
                <Input className="h-8" value={editData.vorname || ""} onChange={e => setEditData(p => ({ ...p, vorname: e.target.value }))} />
                <span className="font-semibold">Nachname:</span>
                <Input className="h-8" value={editData.nachname || ""} onChange={e => setEditData(p => ({ ...p, nachname: e.target.value }))} />
                <span className="font-semibold">Geburtstag:</span>
                <DateInput
                  className="h-8"
                  value={(() => {
                    const g = editData.geburtstag || "";
                    if (/^\d{4}-\d{2}-\d{2}$/.test(g)) return g;
                    if (/^\d{2}\.\d{2}\.\d{4}$/.test(g)) {
                      const [d, m, y] = g.split(".");
                      return `${y}-${m}-${d}`;
                    }
                    return "";
                  })()}
                  onChange={val => {
                    // val is ISO YYYY-MM-DD; convert back to DD.MM.YYYY for storage
                    let stored = val;
                    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                      const [y, m, d] = val.split("-");
                      stored = `${d}.${m}.${y}`;
                    }
                    setEditData(p => ({ ...p, geburtstag: stored }));
                  }}
                  placeholder="TT.MM.JJJJ"
                />
                <span className="font-semibold">Straße, Hausnr.:</span>
                <div className="flex gap-2">
                  <AddressAutocomplete
                    className="h-8"
                    value={editData.strasse || ""}
                    onChange={(val) => setEditData(p => ({ ...p, strasse: val }))}
                    onSelect={(addr) => setEditData(p => ({ ...p, strasse: addr.strasse, hausnummer: addr.hausnummer, plz: addr.plz, ort: addr.ort }))}
                    placeholder="Straße"
                  />
                  <Input className="h-8 w-20" value={editData.hausnummer || ""} onChange={e => setEditData(p => ({ ...p, hausnummer: e.target.value }))} placeholder="Nr." />
                </div>
                <span className="font-semibold">Postleitzahl:</span>
                <Input className="h-8" value={editData.plz || ""} onChange={e => setEditData(p => ({ ...p, plz: e.target.value }))} />
                <span className="font-semibold">Ort:</span>
                <Input className="h-8" value={editData.ort || ""} onChange={e => setEditData(p => ({ ...p, ort: e.target.value }))} />
                <span className="font-semibold">E-Mailadresse:</span>
                <Input className="h-8" value={editData.email || ""} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} />
                <span className="font-semibold">Telefonnummer:</span>
                <PhoneInput className="h-8" value={editData.telefon || ""} onChange={v => setEditData(p => ({ ...p, telefon: v }))} />
                <span className="font-semibold">Sprache:</span>
                <KundenspracheFeld
                  wert={editSprache ?? kundenSpracheAnzeige}
                  onWahl={setEditSprache}
                />
              </div>
                </div>

                {(editData as any).person2 ? (
                  <div className="border-l-2 border-primary/20 pl-6">
                    <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-2">Person 2</p>
                    <h4 className="font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">Persönliche Daten</h4>
                    <hr className="mb-3" />

                  <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm items-center">
                    <span className="font-semibold">Vorname:</span>
                    <Input className="h-8" value={(editData as any).person2?.vorname || ""} onChange={e => setEditData(p => ({ ...(p as any), person2: { ...((p as any).person2 || {}), vorname: e.target.value } }))} />
                    <span className="font-semibold">Nachname:</span>
                    <Input className="h-8" value={(editData as any).person2?.nachname || ""} onChange={e => setEditData(p => ({ ...(p as any), person2: { ...((p as any).person2 || {}), nachname: e.target.value } }))} />
                    <span className="font-semibold">Geburtsdatum:</span>
                    <DateInput
                      className="h-8"
                      value={(() => {
                        const g = (editData as any).person2?.geburtsdatum || "";
                        if (/^\d{4}-\d{2}-\d{2}$/.test(g)) return g;
                        if (/^\d{2}\.\d{2}\.\d{4}$/.test(g)) { const [d, m, y] = g.split("."); return `${y}-${m}-${d}`; }
                        return "";
                      })()}
                      onChange={val => {
                        let stored = val;
                        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) { const [y, m, d] = val.split("-"); stored = `${d}.${m}.${y}`; }
                        setEditData(p => ({ ...(p as any), person2: { ...((p as any).person2 || {}), geburtsdatum: stored } }));
                      }}
                      placeholder="TT.MM.JJJJ"
                    />
                    <span className="font-semibold">E-Mailadresse: <span className="text-destructive">*</span></span>
                    <Input
                      className="h-8"
                      type="email"
                      placeholder="email@beispiel.de"
                      value={(editData as any).person2?.email || ""}
                      onChange={e => setEditData(p => ({ ...(p as any), person2: { ...((p as any).person2 || {}), email: e.target.value } }))}
                    />
                    <span className="font-semibold">Telefonnummer:</span>
                    <PhoneInput className="h-8" value={(editData as any).person2?.telefon || ""} onChange={v => setEditData(p => ({ ...(p as any), person2: { ...((p as any).person2 || {}), telefon: v } }))} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    💡 Die E-Mail von Person 2 wird benötigt, damit die Selbstauskunft auch von Person 2 digital unterschrieben werden kann.
                  </p>
                  </div>
                ) : (
                  <div>
              <h4 className="font-semibold text-sm mt-4 mb-2 text-muted-foreground uppercase tracking-wide text-xs">Lead- & Verwaltungsdaten</h4>
              <hr className="mb-2" />
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm items-center">
                <span className="font-semibold">Angelegt am:</span><span>{formatDatum(kunde.erstellt_am)}</span>
                {isAdminOrInhaber ? (
                  <>
                    <span className="font-semibold">Erstellt von:</span>
                    <Select
                      value={(editData as any).erstelltVonId || "__none__"}
                      onValueChange={(val) => {
                        if (val === "__none__") {
                          setEditData(p => ({ ...p, erstelltVonId: "", erstelltVonName: "" } as any));
                        } else {
                          const u = loadAllUsers().find(u => u.id === val);
                          setEditData(p => ({ ...p, erstelltVonId: val, erstelltVonName: u?.name || "" } as any));
                        }
                      }}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="– kein Ersteller –" /></SelectTrigger>
                      <SelectContent className="max-h-72 overflow-y-auto bg-popover z-50">
                        <SelectItem value="__none__">– kein Ersteller –</SelectItem>
                        {loadAllUsers()
                          .slice()
                          .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                          .map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : null}
                <span className="font-semibold">Quelle/Lead:</span>
                <span className="text-sm">{kontaktQuelleAnzeige({ quelle: editData.quelle, leadTyp: kunde.leadTyp }) || "–"}</span>
                <KampagnenZeile kontaktId={kunde.id} rolle={user.role} />
                {empfehlungsgeberEditRow}
                <span className="font-semibold">Setter:</span>
                <BeraterSearchSelect
                  value={editData.setter || ""}
                  onChange={(val, uid) => setEditData(p => ({ ...p, setter: val, setterId: uid || "" }))}
                  filterByRole="setterin"
                />
                <span className="font-semibold">Vertriebspartner:</span><span>{vertriebspartnerName || "–"}</span>
              </div>
                  </div>
                )}
              </div>

              {/* Bei zwei Personen brauchen die Lead-Daten die volle Breite, genau wie in der Ansicht. */}
              {(editData as any).person2 && (
                <div>
              <h4 className="font-semibold text-sm mt-4 mb-2 text-muted-foreground uppercase tracking-wide text-xs">Lead- & Verwaltungsdaten</h4>
              <hr className="mb-2" />
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm items-center">
                <span className="font-semibold">Angelegt am:</span><span>{formatDatum(kunde.erstellt_am)}</span>
                {isAdminOrInhaber ? (
                  <>
                    <span className="font-semibold">Erstellt von:</span>
                    <Select
                      value={(editData as any).erstelltVonId || "__none__"}
                      onValueChange={(val) => {
                        if (val === "__none__") {
                          setEditData(p => ({ ...p, erstelltVonId: "", erstelltVonName: "" } as any));
                        } else {
                          const u = loadAllUsers().find(u => u.id === val);
                          setEditData(p => ({ ...p, erstelltVonId: val, erstelltVonName: u?.name || "" } as any));
                        }
                      }}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="– kein Ersteller –" /></SelectTrigger>
                      <SelectContent className="max-h-72 overflow-y-auto bg-popover z-50">
                        <SelectItem value="__none__">– kein Ersteller –</SelectItem>
                        {loadAllUsers()
                          .slice()
                          .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                          .map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : null}
                <span className="font-semibold">Quelle/Lead:</span>
                <span className="text-sm">{kontaktQuelleAnzeige({ quelle: editData.quelle, leadTyp: kunde.leadTyp }) || "–"}</span>
                <KampagnenZeile kontaktId={kunde.id} rolle={user.role} />
                {empfehlungsgeberEditRow}
                <span className="font-semibold">Setter:</span>
                <BeraterSearchSelect
                  value={editData.setter || ""}
                  onChange={(val, uid) => setEditData(p => ({ ...p, setter: val, setterId: uid || "" }))}
                  filterByRole="setterin"
                />
                <span className="font-semibold">Vertriebspartner:</span><span>{vertriebspartnerName || "–"}</span>
              </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={handleSaveEdit}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Speichern
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditDialog(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : beraterDialog || setterDialog ? (
            <div className="space-y-3">
              {/*
                Dieselbe zweispaltige Aufteilung wie die Leseansicht und der
                Bearbeitungsmodus: links die persoenlichen Daten, rechts die
                Lead- und Verwaltungsdaten. Bearbeitbar ist nur das eine Feld,
                um das es geht, alles andere bleibt reine Anzeige.
              */}
              <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
                <div>
                  <h4 className="font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">Persönliche Daten</h4>
                  <hr className="mb-3" />
                  <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                    <span className="font-semibold">ID:</span><span>{formatKundenId(kunde.moreId)}</span>
                    <span className="font-semibold">Vorname:</span><span>{kunde.vorname}</span>
                    <span className="font-semibold">Nachname:</span><span>{kunde.nachname}</span>
                    <span className="font-semibold">Geburtstag:</span><span>{kunde.geburtstag || "–"}</span>
                    <span className="font-semibold">Straße, Hausnummer:</span><span>{kunde.strasse || "–"} {kunde.hausnummer}</span>
                    <span className="font-semibold">Postleitzahl:</span><span>{kunde.plz || "–"}</span>
                    <span className="font-semibold">Ort:</span><span>{kunde.ort || "–"}</span>
                    <span className="font-semibold">E-Mailadresse:</span>
                    <span>{kunde.email ? <a href={tarnVerweis(`mailto:${kunde.email}`)} className="text-primary hover:underline">{tarnEmail(kunde.email)}</a> : "–"}</span>
                    <span className="font-semibold">Telefonnummer:</span>
                    <span>{kunde.telefon ? <a href={tarnVerweis(`tel:${kunde.telefon}`)} className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); rufeAnUndProtokolliere(kunde.telefon); }}>{tarnTelefon(normalizeTelefon(kunde.telefon))}</a> : "–"}</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">Lead- & Verwaltungsdaten</h4>
                  <hr className="mb-3" />
                  <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm items-center">
                    <span className="font-semibold">Angelegt am:</span><span>{formatDatum(kunde.erstellt_am)}</span>
                    <span className="font-semibold">Quelle/Lead:</span><span>{kontaktQuelleAnzeige(kunde) || "–"}</span>
                    <KampagnenZeile kontaktId={kunde.id} rolle={user.role} />
                    {empfehlungsgeberRow}
                    <span className="font-semibold">Setter:</span>
                    {setterDialog
                      ? <BeraterSearchSelect value={newSetter} onChange={(v, uid) => { setNewSetter(v); setNewSetterId(uid); }} filterByRole="setterin" />
                      : <span>{kunde.setter || "–"}</span>}
                    <span className="font-semibold">Vertriebspartner:</span>
                    {beraterDialog
                      ? <BeraterSearchSelect value={newBerater} onChange={(v, uid) => { setNewBerater(v); setNewBeraterId(uid); setBeraterWechselWarnung(null); }} filterByRole="vertriebspartner" />
                      : <span>{vertriebspartnerName || "–"}</span>}
                  </div>
                </div>
              </div>

              {/*
                Der Grund der Übergabe. Er landet beim neuen Partner und
                bleibt am Kontakt stehen, deshalb steht er hier direkt unter
                der Auswahl und nicht in einem zweiten Schritt.
              */}
              {beraterDialog && wechselBrauchtGrund && (
                <div className="mt-4 space-y-2">
                  <span className="text-sm font-semibold">Grund der Übergabe</span>
                  <p className="text-xs text-muted-foreground">
                    Kurz und sachlich. {vertriebspartnerName || "Der bisherige Vertriebspartner"} gibt ab, der neue soll wissen, wo er ansetzt.
                  </p>
                  <UebergabeGrundFeld grund={uebergabeGrund} onChange={setUebergabeGrund} />
                </div>
              )}

              {beraterDialog && beraterWechselWarnung && (
                <div className="mt-3 rounded-lg border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/10 p-3">
                  <p className="text-sm font-medium flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--warning))]" />
                    {beraterWechselWarnung}
                  </p>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {beraterDialog ? (
                  beraterWechselWarnung ? (
                    <Button size="sm" variant="destructive" onClick={fuehreBeraterWechselAus} disabled={!grundBereit}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Ja, wirklich neu zuweisen
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleSaveBerater} disabled={!grundBereit}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Vertriebspartner speichern
                    </Button>
                  )
                ) : (
                  <Button size="sm" onClick={handleSaveSetter}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Setterin speichern
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setBeraterDialog(false); setSetterDialog(false); setBeraterWechselWarnung(null); }}>
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Kundendaten links, Lead- & Verwaltungsdaten rechts (wenn kein Person 2) */}
              <div className={`grid gap-8 ${kunde.person2 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 lg:grid-cols-2"}`}>
                {/* Person 1 */}
                <div>
                  {kunde.person2 && <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">Person 1</p>}
                  <h4 className="font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">Persönliche Daten</h4>
                  <hr className="mb-3" />
                  <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                    <span className="font-semibold">ID:</span><span>{formatKundenId(kunde.moreId)}</span>
                    <span className="font-semibold">Vorname:</span><span>{kunde.vorname}</span>
                    <span className="font-semibold">Nachname:</span><span>{kunde.nachname}</span>
                    <span className="font-semibold">Geburtstag:</span><span>{kunde.geburtstag || "–"}</span>
                    <span className="font-semibold">Straße, Hausnummer:</span><span>{kunde.strasse || "–"} {kunde.hausnummer}</span>
                    <span className="font-semibold">Postleitzahl:</span><span>{kunde.plz || "–"}</span>
                    <span className="font-semibold">Ort:</span><span>{kunde.ort || "–"}</span>
                    <span className="font-semibold">E-Mailadresse:</span>
                    <span>{kunde.email ? <a href={tarnVerweis(`mailto:${kunde.email}`)} className="text-primary hover:underline">{tarnEmail(kunde.email)}</a> : "–"}</span>
                    <span className="font-semibold">Telefonnummer:</span>
                    <span className="flex items-center gap-2">
                      {kunde.telefon ? <a href={tarnVerweis(`tel:${kunde.telefon}`)} className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); rufeAnUndProtokolliere(kunde.telefon); }}>{tarnTelefon(normalizeTelefon(kunde.telefon))}</a> : "–"}
                      {kunde.telefon && (
                        <a
                          href={whatsAppLink(kunde.telefon)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
                          title="WhatsApp öffnen"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.028-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}
                    </span>
                    <span className="font-semibold">Sprache:</span>
                    <KundenspracheFeld wert={kundenSpracheAnzeige} />
                  </div>
                  {/* Setter: Kontaktdaten-Bestätigung */}
                  {isSetterinRole && (
                    <div className={cn(
                      "mt-3 p-3 rounded-lg border flex items-center gap-3 cursor-pointer transition-colors",
                      setterKontaktGeprueft
                        ? "bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30"
                        : "bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30"
                    )} onClick={() => {
                      const next = !setterKontaktGeprueft;
                      setSetterKontaktGeprueft(next);
                      setSetterDirty(true);
                      if (isTestAccount()) {
                        localStorage.setItem(`mi_setter_kontakt_geprueft_${kunde?.id}`, JSON.stringify(next));
                      } else {
                        const all = getUserSetting<Record<string, boolean>>("setter_kontakt_geprueft", {});
                        all[kunde?.id || ""] = next;
                        setUserSetting("setter_kontakt_geprueft", all);
                      }
                    }}>
                      <Checkbox checked={setterKontaktGeprueft} onCheckedChange={() => {}} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Kontaktdaten geprüft & bestätigt</p>
                        <p className="text-xs text-muted-foreground">Ich bestätige, dass Name, Telefonnummer und E-Mail auf Aktualität und Richtigkeit überprüft wurden.</p>
                      </div>
                      {setterKontaktGeprueft && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />}
                      {!setterKontaktGeprueft && <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />}
                    </div>
                  )}
                </div>

                {/* Person 2 */}
                {kunde.person2 && (
                  <div className="border-l-2 border-primary/20 pl-6">
                    <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-2">Person 2</p>
                    <h4 className="font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">Persönliche Daten</h4>
                    <hr className="mb-3" />
                    <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                      <span className="font-semibold">Anrede:</span><span>{kunde.person2.anrede || "–"}</span>
                      <span className="font-semibold">Vorname:</span><span>{kunde.person2.vorname}</span>
                      <span className="font-semibold">Nachname:</span><span>{kunde.person2.nachname}</span>
                      <span className="font-semibold">Geburtstag:</span><span>{kunde.person2.geburtsdatum || "–"}</span>
                      <span className="font-semibold">Straße, Hausnummer:</span><span>{kunde.person2.strasse || "–"} {kunde.person2.hausnummer}</span>
                      <span className="font-semibold">Postleitzahl:</span><span>{kunde.person2.plz || "–"}</span>
                      <span className="font-semibold">Ort:</span><span>{kunde.person2.ort || "–"}</span>
                      <span className="font-semibold">E-Mailadresse:</span>
                      <span>{kunde.person2.email ? <a href={`mailto:${kunde.person2.email}`} className="text-primary hover:underline">{kunde.person2.email}</a> : "–"}</span>
                      <span className="font-semibold">Telefonnummer:</span>
                      <span className="flex items-center gap-2">
                        {kunde.person2.telefon ? <a href={`tel:${kunde.person2.telefon}`} className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); rufeAnUndProtokolliere(kunde.person2?.telefon); }}>{normalizeTelefon(kunde.person2.telefon)}</a> : "–"}
                        {kunde.person2.telefon && (
                          <a
                            href={whatsAppLink(kunde.person2.telefon)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
                            title="WhatsApp öffnen"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.028-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </a>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Lead- & Verwaltungsdaten – rechte Spalte (nur wenn keine Person 2) */}
                {!kunde.person2 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide text-xs">Lead- & Verwaltungsdaten</h4>
                    <hr className="mb-3" />
                    {(() => {
                      const _row = cacheGet("kontakte").find((r: any) => r.id === kunde.id);
                      const _meta = (_row?.meta && typeof _row.meta === "object") ? _row.meta : {};
                      const _erstellerName = _meta.erstelltVonName || "–";
                      return (
                        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                          <span className="font-semibold">Angelegt am:</span><span>{formatDatum(kunde.erstellt_am)}</span>
                          <span className="font-semibold">Erstellt von:</span><span>{_erstellerName}</span>
                          <span className="font-semibold">Quelle/Lead:</span><span>{kontaktQuelleAnzeige(kunde) || "–"}</span>
                          <KampagnenZeile kontaktId={kunde.id} rolle={user.role} />
                          {empfehlungsgeberRow}
                          <span className="font-semibold">Setter:</span><span>{kunde.setter || "–"}</span>
                          <span className="font-semibold">Vertriebspartner:</span><span>{vertriebspartnerName || "–"}</span>
                          <BeraterVerlauf kunde={kunde} />
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Lead- & Verwaltungsdaten – volle Breite (Fallback bei Person 2) */}
              {kunde.person2 && (
                <>
                  <h4 className="font-semibold text-sm mt-6 mb-3 text-muted-foreground uppercase tracking-wide text-xs">Lead- & Verwaltungsdaten</h4>
                  <hr className="mb-3" />
                  {(() => {
                const _row = cacheGet("kontakte").find((r: any) => r.id === kunde.id);
                const _meta = (_row?.meta && typeof _row.meta === "object") ? _row.meta : {};
                const _erstellerName = _meta.erstelltVonName || "–";
                return (
                  <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                    <span className="font-semibold">Angelegt am:</span><span>{formatDatum(kunde.erstellt_am)}</span>
                    <span className="font-semibold">Erstellt von:</span><span>{_erstellerName}</span>
                    <span className="font-semibold">Quelle/Lead:</span><span>{kontaktQuelleAnzeige(kunde) || "–"}</span>
                    <KampagnenZeile kontaktId={kunde.id} rolle={user.role} />
                    {empfehlungsgeberRow}
                    <span className="font-semibold">Setter:</span><span>{kunde.setter || "–"}</span>
                    <span className="font-semibold">Vertriebspartner:</span><span>{vertriebspartnerName || "–"}</span>
                    <BeraterVerlauf kunde={kunde} />
                  </div>
                );
                  })()}
                </>
              )}

              {/* Qualifikationsdaten moved to separate editable card below */}

              <div className="flex flex-wrap gap-2 mt-4">
                {!isFinanzierer && (
                <Button size="sm" variant="secondary" onClick={() => {
                  oeffneStammdatenBearbeitung();
                }}>
                  <Pencil className="h-3 w-3 mr-1" /> Daten ändern
                </Button>
                )}
                {canChangeBerater && (
                  <Button size="sm" variant="secondary" onClick={() => {
                    setNewBerater(kunde.berater);
                    setNewBeraterId(kunde.zustaendig_id || undefined);
                    setBeraterWechselWarnung(null);
                    setBeraterDialog(true);
                  }}>
                    <UserCog className="h-3 w-3 mr-1" /> Vertriebspartner ändern
                  </Button>
                )}
                {canChangeBerater && (
                  <Button size="sm" variant="secondary" onClick={() => {
                    setNewSetter(kunde.setter || "");
                    setNewSetterId(kunde.setterId || undefined);
                    setSetterDialog(true);
                  }}>
                    <UserCog className="h-3 w-3 mr-1" /> Setter ändern
                  </Button>
                )}
                {!isFinanzierer && (
                  <AlsTippgeberAnlegenButton
                    kunde={kunde}
                    investments={investments}
                    currentUser={{ id: authUser?.id, name: user?.name, role: user?.role }}
                    onChanged={() => {
                      try { cacheRefreshTable("kontakte"); } catch {}
                    }}
                  />
                )}
              </div>


              {/*
                Der Block "Kundenportal & Zugang" stand hier ein zweites Mal.
                Freigeschaltet wird das Portal im Investment, unterhalb der
                Bonitätscheck-Unterlagen, sobald die Selbstauskunft ausgefüllt
                und unterschrieben ist. Beim ersten Investment muss dort
                freigegeben werden, bei allen weiteren ist es bereits
                freigegeben. In den Stammdaten hatte der Block deshalb keinen
                eigenen Zweck.
              */}
            </>
          )}
        </Card>

        {/*
          Was der Interessent selbst in Steuerrechner und Analysetool
          ausgefuellt hat.

          Steht bewusst DIREKT unter den Kundendaten und noch vor den
          Qualifizierungsfragen: Der Partner liest von oben nach unten, greift
          nach der Telefonnummer und ruft an. Was der Interessent kurz vorher
          eingegeben und auf dem Bildschirm gesehen hat, muss er bis dahin
          gelesen haben, sonst nennt er im Gespraech andere Zahlen als die
          Seite. Weiter unten waere es hinter Finanzkarten und Aktivitaeten
          begraben, und die Karte gaebe es dann zwar, gefunden wuerde sie aber
          nicht.

          Sie steht ausserdem VOR den Qualifizierungsfragen, weil sie deren
          Antworten teilweise schon enthaelt: Einkommen und berufliche
          Situation hat der Interessent selbst angegeben. Wer sie danach
          faende, haette sie schon einmal erfragt.

          Ohne Angaben zeigt die Karte gar nichts, sie erzeugt also keinen
          leeren Kasten bei Kontakten aus anderen Quellen.
        */}
        <RechnerAngaben
          meta={rawMeta}
          erstelltAm={kunde.erstellt_am}
          kontaktId={kunde.id}
          quelle={kunde.quelle}
          vorname={rawRow?.vorname ?? kunde.vorname}
          nachname={rawRow?.nachname ?? kunde.nachname}
          zustaendigId={rawRow?.zustaendig_id ?? null}
        />

        {/* Qualifizierungsfragen – volle Breite, alle in einer Reihe */}
        {showQualifizierungsfragen && (
          <>
            <Card className="p-6">
              <div className="w-8 h-1 bg-primary mb-3" />
          <h3 className="font-bold mb-4">Qualifizierungsfragen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Was ist {kunde.vorname || "der Kunde"} sein Ziel?</Label>
              <QualTextInput
                value={kunde.qualZiel || ""}
                onCommit={(v) => updateKontakt(id || "", { qualZiel: v })}
                placeholder="z.B. Eigenheim für die Familie"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Wie viel Geld verdient {kunde.vorname || "der Kunde"} monatlich?</Label>
              <QualNumberInput
                value={kunde.qualEinkommen || ""}
                onCommit={(v) => updateKontakt(id || "", { qualEinkommen: v })}
                placeholder="z.B. 3.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Wie viel Eigenkapital steht {kunde.vorname || "dem Kunden"} zur Verfügung?</Label>
              <QualNumberInput
                value={kunde.qualEigenkapital || ""}
                onCommit={(v) => updateKontakt(id || "", { qualEigenkapital: v })}
                placeholder="z.B. 20.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Was ist die derzeitige berufliche Situation von {kunde.vorname || "dem Kunden"}?</Label>
              <Select
                value={(() => {
                  // Funnel-Werte kommen lowercase ("angestellt", "selbststaendig", "unternehmer",
                  // "freiberufler", "beamter", "arbeitslos") → auf die Select-Items mappen,
                  // damit der bereits gesetzte Wert auch angezeigt wird.
                  const raw = (kunde.qualBeruflicheSituation || "").trim();
                  const map: Record<string, string> = {
                    "angestellt": "Angestellt",
                    "selbststaendig": "Selbstständig",
                    "selbstständig": "Selbstständig",
                    "unternehmer": "Selbstständig",
                    "freiberufler": "Selbstständig",
                    "beamter": "Beamter",
                    "beamtin": "Beamter",
                    "rentner": "Rentner",
                    "student": "Student",
                    "arbeitslos": "Arbeitssuchend",
                    "arbeitssuchend": "Arbeitssuchend",
                  };
                  return map[raw.toLowerCase()] || raw;
                })()}
                onValueChange={v => {
                  // Defer update so Radix Select can finish closing before the heavy parent re-render
                  setTimeout(() => updateKontakt(id || "", { qualBeruflicheSituation: v }), 0);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Angestellt">Angestellt</SelectItem>
                  <SelectItem value="Selbstständig">Selbstständig</SelectItem>
                  <SelectItem value="Beamter">Beamter</SelectItem>
                  <SelectItem value="Rentner">Rentner</SelectItem>
                  <SelectItem value="Student">Student</SelectItem>
                  <SelectItem value="Arbeitssuchend">Arbeitssuchend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Zusatz-Qualifizierung vom Tippgeber erfasst */}
          {(() => {
            const _row = cacheGet("kontakte").find((r: any) => r.id === kunde.id);
            const _meta = (_row?.meta && typeof _row.meta === "object") ? _row.meta : {};
            if (!_meta.tippgeberId && !_meta.tippgeberSchufaSauber && !_meta.tippgeberInvestitionsZeitpunkt) return null;
            const schufa = (_meta.tippgeberSchufaSauber || "") as string;
            const zeitpunkt = (_meta.tippgeberInvestitionsZeitpunkt || "") as string;
            const writeMeta = async (patch: Record<string, any>) => {
              try {
                await mergeKontaktMeta(kunde.id, patch);
              } catch (e) { console.warn("merge_kontakt_meta failed", e); }
            };
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Saubere SCHUFA?</Label>
                  <Select value={schufa} onValueChange={(v) => writeMeta({ tippgeberSchufaSauber: v })}>
                    <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ja">Ja</SelectItem>
                      <SelectItem value="Nein">Nein</SelectItem>
                      <SelectItem value="Unbekannt">Weiß nicht</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Investitions-Zeitpunkt</Label>
                  <Select value={zeitpunkt} onValueChange={(v) => writeMeta({ tippgeberInvestitionsZeitpunkt: v })}>
                    <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sofort">Sofort</SelectItem>
                      <SelectItem value="1-3 Monate">In 1–3 Monaten</SelectItem>
                      <SelectItem value="3-6 Monate">In 3–6 Monaten</SelectItem>
                      <SelectItem value="6+ Monate">In 6+ Monaten</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {einverstaendnisBestaetigtAm(_meta) && (
                  <p
                    className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4"
                    title={typeof _meta.tippgeberEinverstaendnis?.wortlaut === "string" ? _meta.tippgeberEinverstaendnis.wortlaut : undefined}
                  >
                    Einverständnis bestätigt am {einverstaendnisBestaetigtAm(_meta)} Uhr
                  </p>
                )}
                {_meta.tippgeberAnliegen && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold">Anliegen (vom Tippgeber)</Label>
                    <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                      {_meta.tippgeberAnliegen}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {/* Zusätzliche Angaben aus dem Microseiten-Funnel.
              Werden nur eingeblendet, sobald mindestens ein Funnel-Feld befüllt ist. */}
          {(kunde.funnelImmobilienbesitz || kunde.funnelInvestitionsvolumen || kunde.funnelZeitrahmen || kunde.funnelKontaktzeit) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Immobilienbesitz</Label>
                <QualTextInput
                  value={kunde.funnelImmobilienbesitz || ""}
                  onCommit={(v) => updateKontakt(id || "", { funnelImmobilienbesitz: v })}
                  placeholder="z.B. Keine / 1 / 2–3 / 4+"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Investitionsvolumen</Label>
                <QualTextInput
                  value={kunde.funnelInvestitionsvolumen || ""}
                  onCommit={(v) => updateKontakt(id || "", { funnelInvestitionsvolumen: v })}
                  placeholder="z.B. 100.000 – 200.000 €"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Zeitrahmen</Label>
                <QualTextInput
                  value={kunde.funnelZeitrahmen || ""}
                  onCommit={(v) => updateKontakt(id || "", { funnelZeitrahmen: v })}
                  placeholder="z.B. So schnell wie möglich"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Bevorzugte Kontaktzeit</Label>
                <QualTextInput
                  value={kunde.funnelKontaktzeit || ""}
                  onCommit={(v) => updateKontakt(id || "", { funnelKontaktzeit: v })}
                  placeholder="z.B. Vormittags (9–12 Uhr)"
                />
              </div>
            </div>
          )}
        </Card>
      </>
        )}

        {/* Kontaktversuche – für Setterin (vor VP-Zuweisung) UND für den zugewiesenen
            Vertriebspartner / Admin in den frühen Pipeline-Stufen sichtbar. Der
            „Gesprächsausgang"-Block wurde entfernt: Diese Aktionen sind jetzt
            vollständig im Dialog „Anruf protokollieren" verfügbar. */}
        {/* Der „Kontaktversuche & Gesprächsausgang"-Block wurde aus den Stammdaten
            entfernt. Der Zähler (x/15 nicht erreicht) wird jetzt kompakt im Dialog
            „Anruf protokollieren" oben angezeigt. */}

        {/* Setter-Notizen readonly für VP/Berater – direkt unter Qualifizierungsfragen */}
        {/* (Setter-Skript steht weiter unten im Setter-Block, mit eingebettetem Termin + Abschluss-Checkliste.) */}



      </div>

      {/* KI-Zusammenfassung aus dem Erstgesprächs-Skript – pro Investment getrennt (Reiter Invest. 1 / 2 …).
          Wird BEVOR die Finanzielle Situation angezeigt (die erst nach SA verfügbar ist). */}
      {(() => {
        const invMitKI = investments
          .map((inv: any) => {
            const sk = getInvestmentMetaField<any>(inv.id, "setterSkript", null);
            const gn = getInvestmentMetaField<string>(inv.id, "gespraechsnotizenAI", "");
            const summary: string = (sk?.kiZusammenfassung || gn || "").trim();
            return { inv, summary, updatedAt: sk?.aktualisiertAm as string | undefined };
          })
          .filter(x => x.summary.length > 0)
          .sort((a, b) => (a.inv.nummer ?? 0) - (b.inv.nummer ?? 0));
        if (invMitKI.length === 0) return null;

        const renderKICard = (entry: { summary: string; updatedAt?: string }) => {
          const updated = entry.updatedAt ? new Date(entry.updatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
          return (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> KI-Zusammenfassung Erstgespräch
                <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                {updated && <span className="ml-auto text-[10px] font-normal text-muted-foreground">Stand: {updated}</span>}
              </div>
              <p className="text-sm whitespace-pre-line">{entry.summary}</p>
            </div>
          );
        };

        return (
          <Card className="p-6 space-y-4">
            <details className="group">
              <summary className="flex items-center gap-3 cursor-pointer list-none select-none">
                <div>
                  <div className="w-8 h-1 bg-primary mb-3" />
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    KI-Zusammenfassung Erstgespräch
                    <span className="text-[10px] font-normal text-muted-foreground">(klicken zum Aufklappen)</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Automatisch aus dem Erstgesprächs-Skript erzeugt – pro Investment getrennt</p>
                </div>
                <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 space-y-4">
                {invMitKI.length === 1 ? (
                  renderKICard(invMitKI[0])
                ) : (
                  <Tabs defaultValue={invMitKI[0].inv.id} className="space-y-4">
                    <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
                      {invMitKI.map((entry, idx: number) => {
                        const nr = entry.inv.nummer ?? (idx + 1);
                        return (
                          <TabsTrigger key={entry.inv.id} value={entry.inv.id} className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 px-3">
                            <Building2 className="h-3 w-3" />
                            <span>Invest. {nr}</span>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                    {invMitKI.map((entry) => (
                      <TabsContent key={entry.inv.id} value={entry.inv.id}>
                        {renderKICard(entry)}
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </div>
            </details>
          </Card>
        );
      })()}
      {/*
        Die Finanzzahlen sind seit Welle 2 im Investment zuhause. Der Verweis,
        der hier stand, ist weggefallen: Wer die Zahlen sucht, findet sie
        ohnehin beim Investment, und eine Karte, die nur darauf zeigt, kostet
        Platz ohne etwas zu beantworten.

        Ebenfalls weggefallen ist die Investmentliste (NaechsteSchritteKarte
        mit titel="Investments"). Dieselbe Liste steht im Reiter Investments,
        dort auch der Knopf "Neues Investment".
      */}
      {/* Gesprächsausgang wurde in die Karte „Kontaktversuche & Gesprächsausgang" (oben) integriert. */}
       {/* Erstgesprächs-Skript + „Beratungsgespräch vereinbart" leben jetzt
           ausschließlich im jeweiligen Investment-Tab (siehe renderSetterSkriptSection
           dort). In den Stammdaten erscheinen nur noch die per Investment zugeordneten
           Gesprächsnotizen-Karten weiter oben. */}
      {/* Lead-Pipeline-Bar: nur sichtbar, solange noch kein Investment existiert.
          Zeigt die Vor-Investment-Stufen (Neuer Lead → … → Erstgespräch).
          Ab Beratungsgespräch wird automatisch ein Investment eröffnet — dann
          übernimmt die Investment-Pipeline-Bar die vollständige Darstellung. */}
      {investments.length === 0 && !["verloren", "archiviert", "vermoegensaufbau"].includes(kunde.pipelineStufe || "") && (() => {
        const currentKey = kunde.pipelineStufe || "neuer_lead";
        // NoShow und Legacy-Aliase zählen wie die zugehörige echte Stufe.
        const leadKey = fortschrittsStufe(currentKey);
        const leadNichtErschienen = istNoShowStufe(currentKey);
        const leadIdx = (() => {
          // Beratungsgespräch ohne Investment → visuell wie „Erstgespräch"
          // (Edge-Case). Das ist die letzte Stufe dieser Bar.
          if (leadKey === "beratungsgespraech") return LEAD_PIPELINE_STEPS.length - 1;
          const i = LEAD_PIPELINE_STEPS.findIndex(s => s.key === leadKey);
          return i >= 0 ? i : 0;
        })();
        const prev = leadIdx > 0 ? LEAD_PIPELINE_STEPS[leadIdx - 1] : null;
        const curr = LEAD_PIPELINE_STEPS[leadIdx];
        const next = leadIdx < LEAD_PIPELINE_STEPS.length - 1 ? LEAD_PIPELINE_STEPS[leadIdx + 1] : null;
        return (
          <Card className="p-4">
            <div className="w-8 h-1 bg-primary mb-3" />
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">Lead-Pipeline</h3>
              <span className="text-[11px] text-muted-foreground">Vor-Investment-Phase</span>
            </div>
            {/* Mobile: 3er-Kompaktansicht */}
            <div className="sm:hidden flex items-center gap-1.5 flex-wrap">
              {prev && (
                <>
                  <Badge variant="outline" className="bg-[hsl(var(--success))] text-white border-[hsl(var(--success))] text-[10px] px-1.5 py-0.5">{prev.label}</Badge>
                  <span className="text-muted-foreground text-xs">→</span>
                </>
              )}
              {curr && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs px-2.5 py-1 font-semibold",
                    leadNichtErschienen
                      ? NOSHOW_BADGE_CLASS
                      : "bg-[hsl(var(--warning))] text-white border-[hsl(var(--warning))] ring-2 ring-[hsl(var(--warning))]/30",
                  )}
                >{curr.label}</Badge>
              )}
              {curr && leadNichtErschienen && <NichtErschienenBadge />}
              {next && (
                <>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Badge variant="outline" className="bg-background text-muted-foreground border-border text-[11px] px-2 py-0.5">{next.label}</Badge>
                </>
              )}
            </div>
            {/* Desktop / Tablet: volle Lead-Pipeline */}
            <div className="hidden sm:flex items-center gap-1 flex-wrap">
              {LEAD_PIPELINE_STEPS.map((s, i) => {
                const isDone = i < leadIdx;
                const isCurrent = i === leadIdx;
                const isNichtErschienen = isCurrent && leadNichtErschienen;
                return (
                  <div key={s.key} className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "transition-all sm:text-xs sm:px-2 sm:py-1",
                        isNichtErschienen
                          ? NOSHOW_BADGE_CLASS
                          : isDone
                          ? "bg-[hsl(var(--success))] text-white border-[hsl(var(--success))] text-[10px] px-1.5 py-0.5"
                          : isCurrent
                          ? "bg-[hsl(var(--warning))] text-white border-[hsl(var(--warning))] text-xs px-2.5 py-1 font-semibold ring-2 ring-[hsl(var(--warning))]/30"
                          : "bg-background text-muted-foreground border-border text-[11px] px-2 py-0.5",
                      )}
                    >{s.label}</Badge>
                    {isNichtErschienen && <NichtErschienenBadge />}
                    {i < LEAD_PIPELINE_STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
                  </div>
                );
              })}
            </div>
            {currentKey === "beratungsgespraech" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Beratungsgespräch terminiert – ein Investment wird automatisch eröffnet, sobald der Vertriebsprozess weiterläuft.
              </p>
            )}
          </Card>
        );
      })()}

      {/*
        Die Zeitleiste hat einen eigenen Reiter bekommen und ist deshalb aus
        den Stammdaten verschwunden. Die Setterin sieht diesen Reiter nicht,
        ihre Rolle kennt nur Stammdaten und Investments. Damit ihr die Notizen
        nicht ersatzlos wegfallen, bleibt die Zeitleiste fuer sie hier stehen.
        Es ist dieselbe Funktion, keine zweite Fassung.
      */}
      {isSetterinRole && renderAktivitaeten()}

      {/* Delete request banner for admin */}
      {(() => {
        const kontaktRow = cacheGet("kontakte").find((r: any) => r.id === id);
        const deleteReq = kontaktRow?.meta?.deleteRequested;
        if (deleteReq && ["admin", "inhaber", "vertriebsleiter", "backoffice", "vertriebspartner", "setterin"].includes(user.role)) {
          return (
            <Card className="p-4 border-destructive/50 bg-destructive/5">
              {/*
                Umbruch und Mindestbreite sind auf dem Handy Pflicht.
                
                Bis zum 21.09.2026 stand hier "flex items-center justify-between"
                ohne flex-wrap, ohne gap und ohne min-w-0 am Textblock. Die drei
                Knoepfe rechts tragen alle "whitespace-nowrap" und koennen nicht
                schmaler werden; sie brauchen zusammen rund 390 Pixel. Auf einem
                375 Pixel breiten Bildschirm blieb fuer den Text ein Streifen von
                wenigen Pixeln, und weil die mobile Regel in index.css Absaetze
                auf "overflow-wrap: anywhere" setzt, fiel jeder Absatz auf
                Buchstabenbreite. Christian sah eine Saeule aus Einzelbuchstaben.
                
                Der Countdown-Banner direkt darunter hat denselben Aufbau, aber
                flex-wrap, und war nie kaputt. Genau daran war es zu erkennen.
              */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="font-semibold text-destructive">Löschanfrage ausstehend</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {kontaktRow.meta.deleteRequestedBy} hat am{" "}
                    {new Date(kontaktRow.meta.deleteRequestedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} die Löschung beantragt.
                  </p>
                  <p className="text-sm mt-1"><strong>Grund:</strong> {kontaktRow.meta.deleteGrund}</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {["admin", "inhaber", "vertriebsleiter", "backoffice"].includes(user.role) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      try {
                        const grund = kontaktRow.meta.deleteGrund;
                        // Hartlöschung: Kunde wird vollständig aus DB & Pipeline entfernt
                        const { data, error } = await supabase.functions.invoke("dsgvo-hard-delete", {
                          body: {
                            kontaktId: id!,
                            reason: `Löschanfrage bestätigt – ${grund}`,
                            triggeredBy: `${user.name} (${user.role})`,
                          },
                        });
                        if (error) throw error;
                        if (data && data.ok === false && Array.isArray(data.errors) && data.errors.length > 0) {
                          console.warn("dsgvo-hard-delete partial errors:", data.errors);
                        }
                        toast({ title: "Kunde gelöscht", description: "Der Kontakt wurde vollständig aus dem System entfernt." });
                        navigate(-1);
                      } catch (err: any) {
                        toast({ title: "Fehler", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Löschung bestätigen
                  </Button>
                  )}
                  {["admin", "inhaber"].includes(user.role) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="bg-destructive/80"
                      onClick={() => setDsgvoHardDeleteOpen(true)}
                      title="DSGVO Art. 17 — Sofortlöschung (unwiderruflich, kein 7-Tage-Countdown)"
                    >
                      <AlertTriangle className="h-4 w-4 mr-1" /> Sofortlöschung
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      // Bis zum 04.10.2026 löschte das die Schlüssel direkt im
                      // Zwischenspeicher, noch vor dem Speichern; ein Fehlschlag
                      // ließ sich so nicht zurücknehmen. Jetzt nur diese Schlüssel
                      // als Patch, „abgelehnt“ erst nach der Antwort.
                      try {
                        await cacheMetaZusammenfuehren("kontakte", id!, {
                          deleteRequested: null,
                          deleteRequestedBy: null,
                          deleteRequestedAt: null,
                          deleteGrund: null,
                          deleteDsgvo: null,
                        });
                      } catch {
                        forceUpdate(n => n + 1);
                        return;
                      }
                      toast({ title: "Löschanfrage abgelehnt" });
                      forceUpdate(n => n + 1);
                    }}
                  >
                    Ablehnen
                  </Button>
                </div>
              </div>
            </Card>
          );
        }
        return null;
      })()}

      {/* DSGVO 7-Tage-Countdown Banner */}
      {(() => {
        const kontaktRow = cacheGet("kontakte").find((r: any) => r.id === id);
        const dr = kontaktRow?.meta?.deletionRequest;
        if (!dr || dr.status !== "confirmed" || !dr.scheduledDeletionAt) return null;
        const remainingMs = new Date(dr.scheduledDeletionAt).getTime() - Date.now();
        const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 3600 * 1000)));
        const isAdmin = ["admin", "inhaber"].includes(user.role);
        const isVisible = isAdmin || user.role === "vertriebspartner" || user.role === "setterin";
        if (!isVisible) return null;
        return (
          <Card className="p-4 border-destructive bg-destructive/10">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-semibold text-destructive">
                    DSGVO-Löschung in {remainingDays} {remainingDays === 1 ? "Tag" : "Tagen"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Bestätigt von <strong>{dr.confirmedBy}</strong>. Endgültige Löschung am{" "}
                  {new Date(dr.scheduledDeletionAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} Uhr.
                </p>
                {dr.reason && <p className="text-sm mt-1"><strong>Grund:</strong> {dr.reason}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await mergeKontaktMeta(id!, { deletionRequest: null });
                    toast({ title: "DSGVO-Löschung widerrufen" });
                    addAktivitaet({ kundeId: id!, art: "notiz", beschreibung: `DSGVO-Löschung widerrufen`, von: user.name });
                    forceUpdate(n => n + 1);
                  }}
                >
                  Widerrufen
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Kunde sofort endgültig löschen?",
                        description: "Alle Daten dieses Kunden werden unwiderruflich entfernt. Das lässt sich nicht rückgängig machen.",
                        confirmText: "Endgültig löschen",
                        cancelText: "Abbrechen",
                        variant: "destructive",
                      });
                      if (!ok) return;
                      const { error } = await supabase.functions.invoke("dsgvo-hard-delete", {
                        body: { kontaktId: id, reason: dr.reason || "Admin Sofortlöschung", triggeredBy: user.name },
                      });
                      if (error) {
                        toast({ title: "Fehler", description: error.message, variant: "destructive" });
                        return;
                      }
                      toast({ title: "Kunde endgültig gelöscht (DSGVO)" });
                      navigate(-1);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Sofort löschen
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })()}


    </div>
  );
  };

  /**
   * Die Zeitleiste, seit dem Umbau ein eigener Reiter.
   *
   * Vollstaendig mitgenommen aus den Stammdaten: die drei Gruppenknoepfe samt
   * Zahlen, die sieben Filter, der CSV-Export, die Blaetterung und die drei
   * Dialoge zum Bearbeiten und Entfernen. Das Echtzeit-Abo auf die Tabelle
   * `aktivitaeten` haengt weiter oben an der Seite und laeuft unabhaengig vom
   * Reiter, die Liste ist also auch nach einem Wechsel sofort aktuell.
   */
  /** Stern an einer Notiz: anpinnen oder loesen, gemeinsam fuer alle am Kunden. */
  const notizAnpinnenUmschalten = async (a: AktivitaetEntry) => {
    if (pinntGerade) return;
    setPinntGerade(a.id);
    try {
      await setzeNotizAngepinnt(a.id, !istAngepinnt(a));
    } catch (fehler: any) {
      console.error("setzeNotizAngepinnt:", fehler);
      // Ohne Migration 20260928210000 kennt die Datenbank die Spalte nicht.
      const spalteFehlt = /angepinnt/i.test(String(fehler?.message || ""));
      toast({
        title: "Favorit nicht gespeichert",
        description: spalteFehlt
          ? "Favoriten sind in der Datenbank noch nicht eingerichtet. Bitte gib der Verwaltung Bescheid."
          : "Bitte versuche es erneut.",
        variant: "destructive",
      });
    } finally {
      setPinntGerade(null);
    }
  };

  const renderAktivitaeten = () => (
    <div className="space-y-6 kundenprofil-zeitlinie">
      {/* Aktivitäten */}
      <Card className="p-6">
        <div className="kundenprofil-verlauf-werkzeuge">
          <h3 className="text-xs text-muted-foreground">Verlauf</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Exportiert, was gerade zu sehen ist. Wer die Notizen offen hat,
              // erwartet keine 300 Protokollzeilen in der Datei.
              const rows = sichtbareAktivitaeten;
              // „Favorit“ nur, wo Notizen drinstehen. Andere Einträge können keine sein.
              const mitFavorit = aktivitaetenAnsicht === "notizen";
              const header = ["Datum", "Von", "Art", "Beschreibung", "Details", ...(mitFavorit ? ["Favorit"] : [])];
              const escape = (v: any) => {
                const s = String(v ?? "");
                return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              };
              const csv = [
                header.join(";"),
                ...rows.map(r => [
                  new Date(r.datum).toLocaleString("de-DE"),
                  r.von,
                  ART_LABELS[r.art] || r.art,
                  r.beschreibung,
                  r.details || "",
                  ...(mitFavorit ? [istAngepinnt(r) ? "ja" : "nein"] : []),
                ].map(escape).join(";")),
              ].join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${aktivitaetenAnsicht}_${kunde?.vorname || ""}_${kunde?.nachname || ""}_${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            📥 CSV Export
          </Button>
        </div>
        {/* Zwei Gruppen, zwei Knoepfe. Die Zahl daneben sagt vorher, was einen
            dort erwartet.

            „Notizen" ist hier seit dem 17.09.2026 entfallen: Die Auswahl
            zwischen Aktivitaeten und Notizen steht jetzt oben als Reiter, wie
            im Bewerberprofil. Was bleibt, ist die Unterteilung innerhalb der
            Aktivitaeten. Im Reiter „Notizen" hat diese Leiste nichts zu sagen
            und erscheint deshalb gar nicht. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className={`inline-flex flex-wrap rounded-lg border border-border p-0.5 ${aktivitaetenAnsicht === "notizen" ? "hidden" : ""}`}>
            {([
              ["manuell", "Aufgaben & Termine", manuelleAktivitaeten.length],
              ["system", "System", systemAktivitaeten.length],
            ] as const).map(([schluessel, beschriftung, anzahl]) => (
              <Button
                key={schluessel}
                size="sm"
                variant={aktivitaetenAnsicht === schluessel ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => { setAktivitaetenAnsicht(schluessel); aktPag.setPage(1); }}
              >
                {beschriftung}
                <span className="ml-1.5 opacity-60">{anzahl}</span>
              </Button>
            ))}
          </div>
          {aktivitaetenAnsicht === "manuell" && (
            <>
              <span className="text-sm text-muted-foreground">Filter:</span>
              <Select value={aktivitaetenFilter} onValueChange={v => { setAktivitaetenFilter(v); aktPag.setPage(1); }}>
                <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="aufgabe">Aufgaben</SelectItem>
                  <SelectItem value="meeting">Meetings</SelectItem>
                  <SelectItem value="anruf">Anrufe</SelectItem>
                  <SelectItem value="anruf_protokoll">Anruf-Protokolle</SelectItem>
                  <SelectItem value="anruf_gestartet">Gestartete Anrufe</SelectItem>
                  <SelectItem value="meeting_protokoll">Meeting-Protokolle</SelectItem>
                  <SelectItem value="email">E-Mails</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-2">Von</th>
              <th className="text-left py-2">Datum</th>
              <th className="text-left py-2">Art</th>
              <th className="text-left py-2">Beschreibung</th>
              <th className="w-20 py-2 sr-only">Aktionen</th>
            </tr>
          </thead>
          <tbody>
             {(() => {
               const paged = aktPag.slice(sichtbareAktivitaeten);
               return paged.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">
                {aktivitaetenAnsicht === "notizen"
                  ? "Noch keine Notizen vorhanden."
                  : aktivitaetenAnsicht === "manuell"
                  ? "Noch keine Aufgaben, Termine oder Protokolle vorhanden."
                  : "Noch keine Systemeinträge vorhanden."}
              </td></tr>
            ) : (
              // Die id jeder Zeile ist das Sprungziel der Kachel "Nächste Aktion".
              // Favoriten stehen vorn (siehe `notizen`), davor und danach je ein
              // Abschnittskopf. Auf Folgeseiten ohne Favoriten entfällt er.
              paged.map((a, i) => (
                <Fragment key={a.id}>
                {istAngepinnt(a) && i === 0 && (
                  <tr data-abschnitt="angepinnt"><td colSpan={5}><Star className="h-3.5 w-3.5 text-amber-500 fill-current" /> Angepinnt</td></tr>
                )}
                {!istAngepinnt(a) && i > 0 && istAngepinnt(paged[i - 1]) && (
                  <tr data-abschnitt="weitere"><td colSpan={5}>Weitere Notizen</td></tr>
                )}
                {aktivitaetenAnsicht === "manuell" && istGeplant(a) && i === 0 && (
                  <tr data-abschnitt="angepinnt"><td colSpan={5}><CalendarClock className="h-3.5 w-3.5 text-primary" /> Geplant</td></tr>
                )}
                {aktivitaetenAnsicht === "manuell" && !istGeplant(a) && i > 0 && istGeplant(paged[i - 1]) && (
                  <tr data-abschnitt="weitere"><td colSpan={5}>Verlauf</td></tr>
                )}
                <tr id={`aktivitaet-${a.id}`} className="border-b" data-art={istNotiz(a) ? "notiz" : "system"} data-angepinnt={istAngepinnt(a) ? "true" : undefined}>
                  <td className="py-2 flex items-center gap-1"><Building2 className="h-3 w-3" /> {a.von}</td>
                  <td className="py-2">{new Date(a.datum).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2"><Badge variant="outline" className="text-xs">{ART_LABELS[a.art]}</Badge></td>
                  <td className="py-2">
                    {istNotiz(a) ? <KundenprofilNotiz key={`${a.id}:${a.beschreibung}`} text={a.beschreibung} /> : <ExpandableText text={a.beschreibung} strong maxChars={220} maxLines={3} />}
                    {a.details && (
                      <ExpandableText
                        text={a.details}
                        className="text-xs text-muted-foreground mt-0.5"
                        maxChars={220}
                        maxLines={3}
                      />
                    )}
                    {(a.art === "aufgabe" || a.art === "meeting") && a.faelligAm && (
                      <div className="text-xs mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          📅 Fällig: {new Date(a.faelligAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          {a.uhrzeit ? ` · ${a.uhrzeit}` : ""}
                        </Badge>
                        {a.zugewiesenAn && (
                          <span className="text-muted-foreground">· zugewiesen an {a.zugewiesenAn}</span>
                        )}
                        {a.prioritaet && a.prioritaet !== "mittel" && (
                          <Badge variant="outline" className="text-[10px]">Prio: {a.prioritaet}</Badge>
                        )}
                        {/* Direkte Sicht auf die Tabelle `aufgaben`: Der
                            zugehörige Aktivitätseintrag fehlt oder wurde
                            gelöscht, die Aufgabe selbst ist noch offen. */}
                        {a.id.startsWith("aufgabe-") && (
                          <span className="text-muted-foreground">· aus der Aufgabenliste</span>
                        )}
                      </div>
                    )}
                    {/*
                      Der Zugang zum Meeting wurde bisher zwar gespeichert,
                      aber nirgends angezeigt. Wer den Termin in der Akte sah,
                      musste den Link woanders suchen. Ein Pfad wie
                      "/raum/<token>" ist der eigene Videoraum, eine
                      vollstaendige Adresse ein fremder Dienst.
                    */}
                    {a.art === "meeting" && a.zoomLink && (
                      <a
                        href={a.zoomLink}
                        target={a.zoomLink.startsWith("/") ? undefined : "_blank"}
                        rel={a.zoomLink.startsWith("/") ? undefined : "noopener noreferrer"}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Video className="h-3 w-3" />
                        {a.zoomLink.startsWith("/raum/") ? "Videoraum öffnen" : "Zum Meeting"}
                      </a>
                    )}
                  </td>
                  <td className="py-2 align-top text-right whitespace-nowrap">
                      {/* Bearbeiten gilt fuer von Hand geschriebene Notizen
                          sowie fuer selbst angelegte Aufgaben und Termine.
                          Termine kamen am 16.09.2026 auf Christians Zuruf
                          dazu: Vorher liessen sie sich nur ueber das
                          Ergebnis-Kaestchen oben im Profil verschieben, im
                          Verlauf fehlte der Stift ganz. Anrufe und Protokolle
                          bleiben unveraenderlich, an ihnen haengen
                          Ergebnisse. Automatische Protokolleintraege belegen
                          ausserdem, wer wann was geaendert hat. */}
                      {istManuell(a) && (a.art === "aufgabe" || a.art === "meeting") && darfAufgabeBearbeiten(a) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setAufgabeZumBearbeiten(a)}
                              aria-label={a.art === "meeting" ? "Termin bearbeiten" : "Aufgabe bearbeiten"}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            {a.art === "meeting" ? "Termin bearbeiten" : "Aufgabe bearbeiten"}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {istNotiz(a) && (
                        <NotizFavoritStern
                          angepinnt={istAngepinnt(a)}
                          darf={darfNotizBearbeiten(a, aktivitaetRechte)}
                          speichert={pinntGerade === a.id}
                          onUmschalten={() => void notizAnpinnenUmschalten(a)}
                        />
                      )}
                      {istNotiz(a) && darfNotizBearbeiten(a, aktivitaetRechte) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setAktivitaetZumBearbeiten(a);
                                setBearbeitenText(a.beschreibung || "");
                                setBearbeitenDetails(a.details || "");
                              }}
                              aria-label="Notiz bearbeiten"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            Notiz bearbeiten
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {/* Eintraege aus dem System-Protokoll tragen den Praefix
                          "log-". Sie sind der Nachweis darueber, wer was
                          geaendert hat, und duerfen deshalb von niemandem
                          entfernt werden, auch nicht von der Leitung. Das
                          Schloss steht nur dort, wo sonst der Papierkorb
                          waere, also bei der Leitung. */}
                      {a.id.startsWith("log-") ? (istVerlaufLeitung && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground/30">
                              <Lock className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs text-xs">
                            Automatischer Protokolleintrag. Er belegt, wer wann was geändert hat,
                            und lässt sich deshalb nicht entfernen.
                          </TooltipContent>
                        </Tooltip>
                      )) : darfEintragEntfernen(a, aktivitaetRechte) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setAktivitaetZumLoeschen(a)}
                              aria-label="Eintrag entfernen"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            Eintrag entfernen
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                </tr>
                </Fragment>
              ))
              );
             })()}
          </tbody>
        </table>
        <div className="kundenprofil-blaettern">
        <StickyPagination
          page={aktPag.page}
          totalPages={aktPag.totalPages}
          pageSize={aktPag.pageSize}
          showAll={aktPag.showAll}
          total={aktivitaetenFilteredCount}
          onPageChange={aktPag.setPage}
          onPageSizeChange={aktPag.setPageSize}
          onToggleShowAll={aktPag.setShowAll}
          pageSizeOptions={AKTIVITAETEN_SEITENGROESSEN}
          sticky={false}
        />
        </div>
      </Card>

      {/* Notiz der Zeitleiste nachtraeglich bearbeiten.
          Nur von Hand geschriebene Notizen, und davon nur Text und Zusatz.
          Autor, Zeitpunkt und Art bleiben unveraendert, damit die Historie
          nachvollziehbar bleibt. */}
      <AlertDialog
        open={!!aktivitaetZumBearbeiten}
        onOpenChange={(offen) => { if (!offen) setAktivitaetZumBearbeiten(null); }}
      >
        <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Notiz bearbeiten
            </AlertDialogTitle>
            <AlertDialogDescription>
              {aktivitaetZumBearbeiten && (
                <>
                  {ART_LABELS[aktivitaetZumBearbeiten.art]} von {aktivitaetZumBearbeiten.von}
                  {aktivitaetZumBearbeiten.datum
                    ? ` · ${new Date(aktivitaetZumBearbeiten.datum).toLocaleString("de-DE", {
                        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}`
                    : ""}
                  . Autor, Zeitpunkt und Art bleiben unverändert.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium mb-1 block">Notiz *</Label>
              <Textarea
                value={bearbeitenText}
                onChange={(e) => setBearbeitenText(e.target.value)}
                rows={4}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Zusatz (optional)</Label>
              <Textarea
                value={bearbeitenDetails}
                onChange={(e) => setBearbeitenDetails(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={!bearbeitenText.trim() || bearbeitenSpeichert}
              onClick={async (e) => {
                e.preventDefault();
                if (!aktivitaetZumBearbeiten) return;
                setBearbeitenSpeichert(true);
                try {
                  await updateAktivitaet(aktivitaetZumBearbeiten.id, {
                    beschreibung: bearbeitenText.trim(),
                    details: bearbeitenDetails.trim(),
                  });
                  toast({ title: "Eintrag gespeichert ✓" });
                  setAktivitaetZumBearbeiten(null);
                } catch (err: any) {
                  console.error("updateAktivitaet:", err);
                  toast({
                    title: "Speichern fehlgeschlagen",
                    description: "Der Eintrag konnte nicht geändert werden. Bitte erneut versuchen.",
                    variant: "destructive",
                  });
                } finally {
                  setBearbeitenSpeichert(false);
                }
              }}
            >
              {bearbeitenSpeichert ? "Speichere…" : "Speichern"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Selbst angelegte Aufgabe nachtraeglich bearbeiten: Datum, Uhrzeit,
          Text und die uebrigen Felder der Anlege-Maske. Der Dialog aendert
          den Eintrag der Aktivitaetsliste und die echte Aufgabe gemeinsam,
          damit die Anzeige hinter dem Namen sofort mitzieht. */}
      <AufgabeBearbeitenDialog
        aktivitaet={aufgabeZumBearbeiten}
        kundeId={id || ""}
        eigenerName={user.name || ""}
        onClose={() => setAufgabeZumBearbeiten(null)}
      />

      {/* Papierkorb der Zeitleiste.
          Die Leitung entfernt jeden Eintrag, jede andere interne Rolle nur
          die selbst geschriebenen, und immer erst nach Rueckfrage: Ein
          Aktivitaetseintrag ist oft der einzige Nachweis darueber, was mit
          einem Kunden besprochen wurde. Siehe `lib/aktivitaetRechte.ts`. */}
      <EintragEntfernenDialog
        eintrag={aktivitaetZumLoeschen}
        loescht={loeschtGerade}
        onSchliessen={() => setAktivitaetZumLoeschen(null)}
        onLoeschen={async () => {
          // Der Dialog darf sich erst schliessen, wenn die Datenbank
          // bestaetigt hat. Sonst verschwindet der Eintrag optisch und
          // ist beim naechsten Laden wieder da.
          const eintrag = aktivitaetZumLoeschen;
          if (!eintrag) return;
          setLoeschtGerade(true);
          try {
            // Einträge mit dem Präfix "aufgabe-" sind die direkte Sicht
            // auf die Tabelle `aufgaben` (Aktivitätseintrag fehlt).
            // Dort gibt es nichts aus `aktivitaeten` zu löschen.
            const istWaise = eintrag.id.startsWith("aufgabe-");
            const ok = istWaise ? true : await cacheDelete("aktivitaeten", eintrag.id);
            if (ok) {
              /*
               * Die echte Aufgabe in der Tabelle `aufgaben` gehört mit
               * geschlossen. Vorher blieb sie offen stehen und
               * bestimmte weiter die Anzeige hinter dem Kundennamen,
               * obwohl der Eintrag aus der Zeitleiste verschwunden war
               * (Ayce Özgün Özler: oben 14.09., unten nur noch 17.09.).
               * Geschlossen statt gelöscht, weil der Store und die
               * RLS der Tabelle nur Updates vorsehen.
               */
              if (eintrag.art === "aufgabe" || eintrag.art === "meeting") {
                try {
                  const aufgabeId = istWaise
                    ? eintrag.id.slice("aufgabe-".length)
                    : findeAufgabeZuAktivitaet(id || "", eintrag.beschreibung, eintrag.faelligAm)?.id;
                  if (aufgabeId) await erledigeAufgabe(aufgabeId);
                } catch (fehler) {
                  // Der Aktivitätseintrag ist weg, nur die Aufgabe hängt
                  // noch. Sie bleibt als "aus der Aufgabenliste" sichtbar
                  // und lässt sich dort erneut löschen.
                  console.error("Aufgabe zum Eintrag konnte nicht geschlossen werden:", fehler);
                }
              }
              toast({ title: "Eintrag entfernt ✓" });
              setAktivitaetZumLoeschen(null);
            } else {
              toast({
                title: "Eintrag konnte nicht entfernt werden",
                description: "Bitte erneut versuchen. Der Eintrag ist unverändert vorhanden.",
                variant: "destructive",
              });
            }
          } catch (fehler) {
            // `cacheDelete` wirft, wenn die Datenbank ablehnt. Ohne
            // diesen Zweig blieb der Klick unbeantwortet stehen, seit
            // auch Vertriebspartner den Papierkorb sehen.
            console.error("Eintrag nicht entfernt:", fehler);
            toast({
              title: "Eintrag konnte nicht entfernt werden",
              description: "Du darfst nur Deine eigenen Einträge entfernen. Der Eintrag ist unverändert vorhanden.",
              variant: "destructive",
            });
          } finally {
            setLoeschtGerade(false);
          }
        }}
      />
    </div>
  );

  // ──────────────────────────────────────────────────────
  // INVESTMENT TAB (Bonität + Abwicklung combined)
  // ──────────────────────────────────────────────────────
  const renderInvestment = (inv: Investment) => {
    const invStep = getInvPipelineStep(inv);
    // NoShow hat kein eigenes Kästchen. Die Leiste bleibt beim zugehörigen
    // Gespräch stehen und markiert es als geplatzt.
    const invNichtErschienen = istNoShowStufe(inv.pipelineStufe);
    // Gemeinsame Liste mit dem Kundenportal, je Investment aus dessen SA.
    const { p1: dynamicBankDocsBase, p2: dynamicBankP2DocsBase, ohneEigeneSa: bankListeOffen } = bankDocsBaseFuerInvestment(inv.id);
    // Bonitätsliste je Investment: ohne Gehaltsnachweise bei Selbstständigkeit.
    const { p1: bonitaetDocsInv, p2: bonitaetP2DocsInv } = bonitaetDocsFuerInvestment(inv.id);
    // Alt-Uploads aus dem Kundenportal unter den früheren Schlüsseln
    // ('Eigener Mietvertrag / „Mietfrei-Bestätigung"') zählen beim Lesen für
    // die kanonischen Zeilen, sonst erscheinen sie hier nirgends.
    const legacyNamen = [...dynamicBankDocsBase, ...dynamicBankP2DocsBase].map(d => d.name);
    const docStatuses = applyLegacyDocKeys(getInvestmentDocStatuses(inv.id), legacyNamen);
    for (const [key, wert] of unterlagenSollstandRef.current) {
      const prefix = `${inv.id}|`;
      if (!key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      if (wert.status === undefined) continue;
      if (wert.status === null) delete docStatuses[name];
      else docStatuses[name] = wert.status;
    }
    // Bereits hochgeladene Positionen bleiben sichtbar, auch wenn sie fuer die
    // aktuelle Beschaeftigungsart nicht mehr vorgesehen sind.
    const bonitaetDocNames = new Set([
      ...bonitaetDocsInv.map(d => d.name),
      ...bonitaetP2DocsInv.map(d => d.name),
      "Selbstauskunft",
    ]);
    const dynamicBankDocs = mergeVorhandeneDocs(
      dynamicBankDocsBase,
      docStatuses,
      (name) => !bonitaetDocNames.has(name) && !name.endsWith(" Person 2"),
    );
    const dynamicBankP2Docs = mergeVorhandeneDocs(
      dynamicBankP2DocsBase,
      docStatuses,
      (name) => !bonitaetDocNames.has(name) && name.endsWith(" Person 2"),
    );
    /*
     * Nach einer Korrektur wartet die neue Fassung auf ihre Unterschrift. Ein
     * `saPdf` vom alten Abschluss zählt dann nicht mehr als „liegt vor“,
     * sonst stünde die Selbstauskunft weiter als erledigt da (26.09.2026).
     * Die Objektauswahl bleibt trotzdem offen, wenn der Vorgang schon dort
     * oder weiter steht, siehe `objektauswahlFreigeschaltet` weiter unten.
     */
    const saNeuAusstehend = getSaNeueUnterschriftAusstehend(inv.id);
    const saPdfFilename = saNeuAusstehend ? "" : getInvestmentSaPdf(inv.id);
    const saSignaturePending = getSaSignaturePending(inv.id);
    const saSigned = getSaSigned(inv.id);

    /**
     * Die unterschriebene Selbstauskunft öffnen.
     *
     * Liegt zur geltenden Unterschrift eine abgelegte Datei, ist sie das
     * Dokument: genau das, was der Kunde unterschrieben hat. Sonst, und wenn
     * die Datei nicht erreichbar ist, wie bisher aus den Angaben dieses
     * Investments erzeugt.
     */
    const saPdfAnzeigen = async () => {
      const invRow = cacheGet("investments").find((r: any) => r.id === inv.id);
      const dateiname = `Selbstauskunft_${kunde.vorname}_${kunde.nachname}.pdf`;
      const abgelegt = aktuellerSaPdfPfad(invRow?.meta);
      if (abgelegt && await unterlageHerunterladen(abgelegt, dateiname)) return;
      // Nur die Selbstauskunft dieses Investments, ohne Rueckfall.
      const storedSaData = eigeneSaDataFuerInvestmentRow(invRow) as any;
      if (!storedSaData) { await keineEigeneSaMelden(); return; }
      try {
        const sigs = invRow?.meta?.saSignatures;
        const pdf = await generateSelbstauskunftPDF(storedSaData, {
          vorname: kunde.vorname,
          nachname: kunde.nachname,
          moreId: String(kunde.moreId || ""),
        }, sigs || undefined, { sprache: kundenSprache(kunde.id) });
        pdf.save(dateiname);
      } catch (err) {
        console.error("PDF generation error:", err);
        toast({ title: "PDF-Fehler", description: "Das PDF konnte nicht generiert werden.", variant: "destructive" });
      }
    };

    /**
     * Vom Kunden ausgefuellte Selbstauskunft (PDF oder Foto) hochladen.
     *
     * Am Computer ausgefuellte PDFs tragen maschinenlesbare Formularfelder
     * und werden vollstaendig automatisch ausgelesen (saPdfFormular). Ein
     * Scan oder Foto liefert keine Felder, dann bleibt der manuelle
     * Uebertrag in die Online-Selbstauskunft. Wird auch fuer das Hochladen
     * einer NEUEN Fassung genutzt (Aenderungen laufen ueber die PDF).
     */
    const papierSaHochladen = async (datei: File) => {
      const pfad = `selbstauskunft-papier/${id}/${inv.id}/${Date.now()}_${datei.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      try {
        await ladeUnterlagenDateiHoch(pfad, datei);
        let felder = 0;
        if (datei.type === "application/pdf" || datei.name.toLowerCase().endsWith(".pdf")) {
          try {
            const ergebnis = await saDatenAusPdfFormular(await datei.arrayBuffer());
            if (ergebnis.felderGefunden >= 5) {
              setSaData(inv.id, ergebnis.data);
              // Zahlen bleiben am Investment (setSaData oben). In die
              // Stammdaten geht nur noch, wer mitkauft.
              uebernehmePerson2InKontakt(id || "", ergebnis.data);
              felder = ergebnis.felderGefunden;
            }
          } catch {
            // Fremde oder kaputte PDF: es bleibt der manuelle Weg.
            felder = 0;
          }
        }
        // saPdf setzt die Datenbank, nachdem sie die Datei im Eimer gefunden hat.
        await vermerkeSaPdf(inv.id, datei.name, pfad);
        hebeAufSelbstauskunft();
        addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: felder > 0 ? `Selbstauskunft (PDF) hochgeladen und automatisch ausgelesen (${felder} Angaben)` : "Selbstauskunft (Papier/Scan) hochgeladen", von: user.name });
        toast(felder > 0
          ? { title: "Selbstauskunft ausgelesen ✓", description: `${felder} Angaben wurden automatisch übernommen. Einnahmen, Ausgaben und Finanzierungsrahmen liegen bei diesem Investment.` }
          : { title: "Selbstauskunft hochgeladen ✓", description: "Handschrift kann nicht automatisch gelesen werden. Bitte die Werte in die Online-Selbstauskunft übertragen, damit die Berechnungen laufen." });
        reloadKunde();
        forceUpdate(n => n + 1);
      } catch (err) {
        toast({ title: "Hochladen fehlgeschlagen", description: err instanceof Error ? err.message : "Bitte noch einmal versuchen.", variant: "destructive" });
      }
    };
    // ── Per-Investment Unterlagen-Freischaltung (shadowt den Kontakt-Level-Flag,
    // damit jedes neue Investment vom VP separat freigeschaltet werden muss). ──
    const unterlagenFreigeschaltet = getInvestmentUnterlagenFreigeschalten(inv.id);
    const unterlagenFreigeschaltetAt = getInvestmentUnterlagenFreigeschaltetAt(inv.id);
    const isBackofficeOrAdmin = ["admin", "inhaber", "vertriebspartner"].includes(user.role);
    const isFinanziererView = user.role === "finanzierungspartner";
    const isReadOnlyDocView = isFinanziererView || isSetterinRole;
    const canDownloadAllUnterlagen = ["admin", "inhaber", "finanzierungspartner", "vertriebsleiter", "vertriebspartner", "versicherungspartner", "setter"].includes(user.role);

    // Get file URLs for "Datei anzeigen" buttons (inkl. Alt-Schlüssel-Rückfall)
    const invRowForUrls = cacheGet("investments").find((r: any) => r.id === inv.id);
    const docFileUrls: Record<string, string> = applyLegacyDocKeys((invRowForUrls?.meta as any)?.docFileUrls, legacyNamen);
    for (const [key, wert] of unterlagenSollstandRef.current) {
      const prefix = `${inv.id}|`;
      if (!key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      if (wert.url === undefined) continue;
      if (wert.url === null) delete docFileUrls[name];
      else docFileUrls[name] = wert.url;
    }
    const openDocFile = (docName: string) => {
      const url = docFileUrls[docName];
      if (url) {
        // Tolerant resolver: handles storage paths, expired signed URLs,
        // and public URLs — always opens a fresh signed link in a new tab.
        openUnterlage(url).catch((err) => {
          console.error("[openDocFile] resolve failed", docName, err);
          toast({ title: "Datei konnte nicht geöffnet werden", description: "Bitte erneut versuchen oder neu hochladen.", variant: "destructive" });
        });
      } else {
        toast({ title: "Keine Datei vorhanden", description: "Für dieses Dokument wurde noch keine Datei hochgeladen.", variant: "destructive" });
      }
    };

    const downloadAllUnterlagenZip = async () => {
      toast({ title: "ZIP wird erstellt…", description: "Dokumente werden gesammelt." });
      try {
        // Fresh fetch aus DB — Cache kann stale sein und Dokumente fehlen lassen
        let meta: any = {};
        try {
          const { data: freshRow, error: freshErr } = await supabase
            .from("investments")
            .select("meta")
            .eq("id", inv.id)
            .maybeSingle();
          if (freshErr) console.warn("Fresh investment fetch failed, falling back to cache", freshErr);
          meta = (freshRow?.meta as any) || (cacheGet("investments").find((r: any) => r.id === inv.id)?.meta) || {};
        } catch (e) {
          console.warn("Fresh fetch error, using cache", e);
          meta = (cacheGet("investments").find((r: any) => r.id === inv.id)?.meta as any) || {};
        }
        const urls: Record<string, string> = meta.docFileUrls || {};
        const skipped: string[] = [];
        const zip = new JSZip();

        const sections: { folder: string; docs: { name: string }[] }[] = [
          { folder: "Bonitätscheck", docs: bonitaetDocsInv },
          { folder: "Bankprüfung", docs: dynamicBankDocs },
        ];
        if (hasP2) {
          sections.push({ folder: "Bonitätscheck Person 2", docs: bonitaetP2DocsInv });
          sections.push({ folder: "Bankprüfung Person 2", docs: dynamicBankP2Docs });
        }

        const sanitize = (s: string) => s.replace(/[\/\\:*?"<>|„""]/g, "_").trim();
        let added = 0;

        for (const section of sections) {
          for (const doc of section.docs) {
            /*
             * Die Selbstauskunft wird beim Packen aus den Daten erzeugt.
             * Ausschliesslich aus denen DIESES Investments: Das Dokument geht
             * zur Bank, und ein Formular mit den Zahlen eines anderen Kaufs
             * waere schlimmer als gar kein Dokument. Fehlt sie, wandert der
             * Punkt in die Liste der uebersprungenen Unterlagen und der Nutzer
             * liest im Abschluss-Hinweis, warum (Entscheidung Christian,
             * 10.09.2026).
             */
            if (doc.name === "Selbstauskunft") {
              const storedSaData = meta.saData || meta.saSnapshot;
              if (!storedSaData) {
                skipped.push(`${section.folder}/Selbstauskunft (für dieses Investment noch nicht ausgefüllt)`);
                continue;
              }
              try {
                const sigs = meta.saSignatures;
                const pdf = await generateSelbstauskunftPDF(
                  storedSaData,
                  { vorname: kunde.vorname, nachname: kunde.nachname, moreId: String(kunde.moreId || "") },
                  sigs || undefined,
                  { sprache: kundenSprache(kunde.id) },
                );
                const blob = pdf.output("blob");
                zip.file(`${section.folder}/Selbstauskunft.pdf`, blob);
                added++;
              } catch (err) { console.error("SA PDF gen failed", err); skipped.push(`${section.folder}/Selbstauskunft`); }
              continue;
            }
            const stored = urls[doc.name];
            if (!stored) continue;
            try {
              const storagePath = (extractStoragePath(stored, "unterlagen") || stored).split("?")[0];
              let fileBlob: Blob | null = null;
              const { data, error } = await supabase.storage.from("unterlagen").download(storagePath);

              if (data) {
                fileBlob = data;
              } else {
                console.warn("ZIP direct storage download failed, trying signed URL", doc.name, storagePath, error);
                const signedUrl = await resolveUnterlagenUrl(stored, 300);
                if (signedUrl) {
                  const response = await fetch(signedUrl);
                  if (response.ok) fileBlob = await response.blob();
                  else console.warn("ZIP signed URL fetch failed", doc.name, response.status, response.statusText);
                }
              }

              if (!fileBlob) {
                skipped.push(`${section.folder}/${doc.name}`);
                continue;
              }

              const ext = (storagePath.split(".").pop() || "pdf").split("?")[0];
              zip.file(`${section.folder}/${sanitize(doc.name)}.${ext}`, fileBlob);
              added++;
            } catch (err) {
              console.error("download error", doc.name, err);
              skipped.push(`${section.folder}/${doc.name}`);
            }
          }
        }

        if (added === 0) {
          toast({
            title: "Keine Dokumente vorhanden",
            description: skipped.length > 0
              ? `Nichts zu packen. Übersprungen: ${skipped.join(", ")}`
              : "Es wurden noch keine Unterlagen hochgeladen.",
            variant: "destructive",
          });
          return;
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(zipBlob);
        const safeKundeName = `${kunde.vorname}_${kunde.nachname}`.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_]/g, "_");
        a.download = `Unterlagen_${safeKundeName}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        if (skipped.length > 0) {
          toast({
            title: `Download abgeschlossen mit Warnungen ⚠️`,
            description: `${added} Dokument(e) gepackt. Übersprungen (${skipped.length}): ${skipped.join(", ")}`,
            variant: "destructive",
          });
        } else {
          toast({ title: "Download abgeschlossen ✓", description: `${added} Dokument(e) gepackt` });
        }
      } catch (err: any) {
        console.error(err);
        toast({ title: "Fehler beim ZIP-Erstellen", description: err?.message || "Unbekannter Fehler", variant: "destructive" });
      }
    };

    const updateDocStatusForInv = async (docName: string, status: DocStatus, fileUrl?: string) => {
      if (status === "uploaded" && fileUrl) {
        const { data, error } = await supabase.rpc("register_unterlage_upload", {
          _investment_id: inv.id,
          _doc_name: docName,
          _file_url: fileUrl,
        });

        if (error) {
          console.error("register_unterlage_upload error:", error);
          // Datei ist bereits im Storage, nur die Server-Registrierung schlug
          // fehl. Der Stand wird ersatzweise direkt am Investment gespeichert,
          // sonst waere das Dokument nach einem Neuladen unsichtbar.
          const invZeile = cacheGet("investments").find((r: { id: string }) => r.id === inv.id) as
            | { meta?: { docFileUrls?: Record<string, string> } }
            | undefined;
          setInvestmentMetaFields(inv.id, {
            docStatuses: { ...getInvestmentDocStatuses(inv.id), [docName]: "uploaded" },
            docFileUrls: { ...(invZeile?.meta?.docFileUrls || {}), [docName]: fileUrl },
          });
          forceUpdate(n => n + 1);
          return;
        }

        const nextInvestments = cacheGet("investments").map((row: any) =>
          row.id === inv.id ? { ...row, meta: data } : row
        );
        cacheSet("investments", nextInvestments);
      } else {
        /*
         * Freigabe und Ablehnung schreiben denselben Weg wie ein Upload:
         * lokal sofort, danach in die Datenbank. Ohne Ueberlagerung liefern
         * Realtime und Cache-Nachladen kurzzeitig wieder den alten Status,
         * der Haken sprang deshalb hin und her. Der Sollstand haelt die
         * Anzeige fest, bis die Datenbank denselben Stand bestaetigt.
         */
        const statusGen = setzeUnterlagenSollstand(inv.id, [docName], { status });
        setInvestmentDocStatus(inv.id, docName, status);
        unterlagenVorgangAbschliessen(inv.id, [docName], statusGen, { art: "status", name: docName, status });
      }
      forceUpdate(n => n + 1);

      // Auto-prompt: after approving/rejecting, check if ALL docs are now reviewed
      if (status === "approved" || status === "rejected") {
        setTimeout(() => {
          const ds = getInvestmentDocStatuses(inv.id);
          const updatedDs = { ...ds, [docName]: status };
          // Gleiche Regel wie beim Knopf „Ergebnis senden": nur Pflichtzeilen
          // und von Hand ergänzte Unterlagen müssen geprüft sein.
          const vonHandErgaenzt = new Set(customBankDocsList.map(cd => cd.name));
          const allBonitaetReviewed = bonitaetDocsInv.filter(d => zaehltFuerAbschluss(d, vonHandErgaenzt)).every(d => {
            // Unterschriebene SA gilt automatisch als freigegeben.
            const s = d.name === "Selbstauskunft" ? ((saPdfFilename || saSigned) ? "approved" : "none") : (updatedDs[d.name] || "none");
            return s === "approved" || s === "rejected";
          });
          const allBankReviewed = dynamicBankDocs.filter(d => zaehltFuerAbschluss(d, vonHandErgaenzt)).every(d => {
            const s = updatedDs[d.name] || "none";
            return s === "approved" || s === "rejected";
          });
          if (allBonitaetReviewed && allBankReviewed) {
            setReviewDialog({ invId: inv.id, section: "bonitaet" });
          }
        }, 300);
      }
    };

    const handleFileUpload = async (docName: string, isReplace = false) => {
      const input = document.createElement("input");
      input.type = "file";
      // Ausweis und Nachweise kommen haeufig als Foto vom Handy. PDF bleibt
      // der Normalfall, JPG und PNG sind aber ebenso zugelassen, sonst endet
      // der Upload eines abfotografierten Personalausweises in einer
      // Fehlermeldung (gemeldet am 01.09.).
      input.accept = ".pdf,.jpg,.jpeg,.png";
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        const endung = (file.name.split(".").pop() || "").toLowerCase();
        if (!["pdf", "jpg", "jpeg", "png"].includes(endung)) {
          toast({ title: "Dateityp nicht unterstützt", description: "Bitte als PDF oder Foto (JPG, PNG) hochladen.", variant: "destructive" });
          return;
        }
        const safeName = docName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
        const path = `${id}/${inv.id}/${safeName}_${Date.now()}.${endung}`;
        const uploadSchluessel = `${inv.id}|${docName}`;
        if (uploadSperreAktiv(uploadSchluessel)) {
          toast({ title: "Upload läuft bereits", description: docName });
          return;
        }
        laufendeUploadsRef.current.set(uploadSchluessel, Date.now());
        offeneUnterlagenOpsRef.current += 1;
        // Aufraeumen genau einmal, egal auf welchem Weg der Vorgang endet.
        let aufgeraeumt = false;
        const vorgangBeenden = () => {
          if (aufgeraeumt) return;
          aufgeraeumt = true;
          laufendeUploadsRef.current.delete(uploadSchluessel);
          offeneUnterlagenOpsRef.current -= 1;
        };
        const uploadGen = setzeUnterlagenSollstand(inv.id, [docName], { status: "uploaded", url: path });
        // Echtzeit-Anzeige: Die Zeile springt SOFORT bei der Dateiauswahl auf
        // "Hochgeladen", noch vor dem Speicher-Upload (der bei Handyfotos 1-2
        // Sekunden dauert). Der Upload laeuft im Hintergrund; schlaegt er
        // fehl, wird der vorherige Zustand wiederhergestellt und ein roter
        // Hinweis gezeigt.
        type InvZeile = { id: string; meta?: { docStatuses?: Record<string, string>; docFileUrls?: Record<string, string> } };
        const vorher = (cacheGet("investments") as InvZeile[]).find((r) => r.id === inv.id);
        const vorherStatus = vorher?.meta?.docStatuses?.[docName];
        const vorherUrl = vorher?.meta?.docFileUrls?.[docName];
        const setzeAnzeige = (status?: string, url?: string) => {
          const zeilen = (cacheGet("investments") as InvZeile[]).map((row) => {
            if (row.id !== inv.id) return row;
            const docStatuses = { ...(row.meta?.docStatuses || {}) };
            const docFileUrls = { ...(row.meta?.docFileUrls || {}) };
            if (status === undefined) delete docStatuses[docName]; else docStatuses[docName] = status;
            if (url === undefined) delete docFileUrls[docName]; else docFileUrls[docName] = url;
            return { ...row, meta: { ...(row.meta || {}), docStatuses, docFileUrls } };
          });
          cacheSet("investments", zeilen);
          forceUpdate(n => n + 1);
        };
        try {
          setzeAnzeige("uploaded", path);
          toast({ title: isReplace ? "Datei ersetzt ✓" : "Dokument hochgeladen ✓", description: docName });
          try {
            await ladeUnterlagenDateiHoch(path, file);
          } catch (uploadError) {
            vorgangBeenden();
            setzeUnterlagenSollstand(inv.id, [docName], null);
            setzeAnzeige(vorherStatus, vorherUrl);
            console.error("Upload error:", uploadError);
            toast({ title: "Upload fehlgeschlagen", description: `${docName}: ${(uploadError as Error)?.message || "Bitte erneut versuchen."}`, variant: "destructive" });
            return;
          }
          try {
            await updateDocStatusForInv(docName, "uploaded", path);
          } catch (speicherFehler) {
            // Die Datei liegt im Speicher, nur der Eintrag am Investment fehlt.
            // Die Nachkontrolle unten holt ihn nach.
            console.error("[handleFileUpload] Eintrag konnte nicht gespeichert werden:", docName, speicherFehler);
          }
          unterlagenVorgangAbschliessen(inv.id, [docName], uploadGen, { art: "upload", name: docName, url: path });
          addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: `${isReplace ? "Dokument ersetzt" : "Dokument hochgeladen"}: ${docName}`, von: user.name });
        } finally {
          vorgangBeenden();
        }
      };
      input.click();
    };

    const allRequiredBonitaetUploaded = bonitaetDocsInv.filter(d => d.required).every(d => {
      if (d.name === "Selbstauskunft") return !!(saPdfFilename || saSigned);
      return docStatuses[d.name] === "uploaded" || docStatuses[d.name] === "approved";
    });
    const unterlagenGesendet = !!getInvestmentMetaField<boolean>(inv.id, "unterlagenGesendet", false);

    const handleUnterlagenEinreichen = async () => {
      // Nur die zwei Merker schicken, nicht das ganze meta aus dem
      // Zwischenspeicher: Das hat serverseitig geschriebene Schluessel wie den
      // festgeschriebenen Provisionssatz wieder geloescht.
      setInvestmentMetaFields(inv.id, { unterlagenGesendet: true, unterlagenGesendetAt: new Date().toISOString() });
      // 1) Backoffice in-app notification
      addDocNotification({
        type: "alle_hochgeladen",
        kundeId: id || "",
        kundeName: `${kunde.vorname} ${kunde.nachname}`,
        investmentId: inv.id,
        beraterName: kunde.berater || user.name,
      });

      // 2) VP (zuständiger Vertriebspartner) in-app notification + Email
      try {
        const kontaktRow = cacheGet("kontakte").find((r: any) => r.id === id);
        const beraterId = kontaktRow?.zustaendig_id as string | undefined;
        const kundeName = `${kunde.vorname} ${kunde.nachname}`;

        // Bell-Notification an VP
        notifyDokumenteVollstaendig(kundeName, id || "", beraterId);

        // Email an VP – nur wenn zuständiger Vertriebspartner bekannt + nicht selbst der Einreichende
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (beraterId && beraterId !== authUser?.id) {
          const profiles = cacheGet("profiles") as any[];
          const beraterProfile = profiles.find((p: any) => p.id === beraterId);
          const vpEmail = beraterProfile?.email;
          if (vpEmail) {
            await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "unterlagen-eingereicht",
                // recipientEmail/templateData wie bei allen uebrigen Aufrufen:
                // mit to/data lehnte die Versandfunktion den Auftrag ab.
                recipientEmail: vpEmail,
                idempotencyKey: `unterlagen-eingereicht-${inv.id}-${Date.now()}`,
                templateData: {
                  vpName: beraterProfile?.name || beraterProfile?.vorname || "",
                  kundeName,
                  kundeLink: oeffentlicheAdresse(`/kunden/${id}`),
                },
              },
            });
          }
        }
      } catch (err) {
        console.error("[unterlagen-eingereicht] VP notify/email error:", err);
      }

      toast({ title: "Unterlagen eingereicht ✓", description: "Alle Pflichtunterlagen wurden eingereicht. VP & Backoffice wurden informiert." });
      addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: "Alle Pflichtunterlagen eingereicht – VP & Backoffice informiert", von: user.name });
      forceUpdate(n => n + 1);
    };

    // Check completion.
    // Christians Vorgabe: Eine unterschriebene Selbstauskunft gilt automatisch
    // als freigegeben, eine gesonderte Freigabe durch den VP entfällt.
    const saAutoApproved = !!(saPdfFilename || saSigned);
    const allBonitaetApproved = bonitaetDocsInv.filter(d => d.required).every(d => {
      if (d.name === "Selbstauskunft") return saAutoApproved || (!saNeuAusstehend && docStatuses["Selbstauskunft"] === "approved");
      return docStatuses[d.name] === "approved";
    });
    const allBankApproved = dynamicBankDocs.filter(d => d.required).every(d => docStatuses[d.name] === "approved");
    const allDocsApproved = allBonitaetApproved && allBankApproved;

    /*
     * Was die Objektauswahl freischaltet.
     *
     * Entweder liegt die Selbstauskunft unterschrieben vor, oder es steht der
     * Vermerk „Kunde finanziert selbst, keine Selbstauskunft nötig" am
     * Investment. Die Reservierung hängt seit dem 16.09.2026 NICHT mehr hier
     * dran, sondern am eingetragenen Objekt (siehe weiter unten bei der
     * Reservierungskarte). Vorher konnte die Reservierung erscheinen, während
     * die Objektauswahl noch gar nicht gebaut wurde.
     */
    const saLiegtVor = !!(saSigned || saPdfFilename);
    // Investagon-Vorgänge führen ihre Objektdaten in Investagon und nicht bei
    // uns. Gebraucht nur noch für die Finanzierung von Altvorgängen; eine
    // Reservierung ohne Objekt gibt es seit dem 29.09.2026 nicht mehr.
    const istInvestagon = inv.meta?.quelle === "investagon";
    const saEntfaelltVermerk = saVermerkLokal[inv.id] ?? getSelbstauskunftEntfaellt(inv.id);
    const saEntfaellt = !!saEntfaelltVermerk.aktiv;
    const objektauswahlFrei = objektauswahlFreigeschaltet({
      saLiegtVor,
      saEntfaellt,
      // Wer die Stufe erreicht hat, behaelt die Karte. Sonst spraenge sie nach
      // einer Ruecknahme des Vermerks wieder zu, obwohl der Vorgang laengst
      // dort steht.
      stufeErreicht: stufeErreicht(inv.pipelineStufe, "objektauswahl"),
    });
    const darfSaEntfallenSchalten = !isSetterinRole && darfSelbstauskunftEntfallen(user.role);

    /**
     * Den Vermerk „Kunde finanziert selbst" setzen oder zurücknehmen.
     *
     * Die Rückfrage sagt ausdrücklich, was danach anders ist. Sie läuft über
     * `confirmDialog`, nicht über das graue Browserfenster.
     */
    const schalteSaEntfaellt = async (an: boolean) => {
      if (!darfSaEntfallenSchalten) return;
      if (an) {
        const ok = await confirmDialog({
          title: "Selbstauskunft überspringen?",
          description:
            "Du hältst fest, dass dieser Kunde selbst finanziert und deshalb keine Selbstauskunft einreicht.\n\n" +
            "Folge: Objektauswahl, Reservierung und alle weiteren Schritte werden ohne Selbstauskunft freigeschaltet, und die Bonitätsunterlagen entfallen. Das Finanzierungsangebot lädst du später unter „Finanzierung“ in die dafür vorgesehenen Felder hoch.\n\n" +
            "Der Vermerk wird mit Datum und deinem Namen gespeichert und ins Protokoll geschrieben. Zurücknehmen kannst du ihn jederzeit.",
          confirmText: "Selbstauskunft überspringen",
          cancelText: "Behalten",
        });
        if (!ok) return;
        const vermerk = setzeSelbstauskunftEntfaellt(inv.id, {
          name: user.name,
          id: authUser?.id,
          rolle: user.role,
        });
        if (!vermerk) {
          toast({ title: "Nicht erlaubt", description: "Deine Rolle darf diesen Vermerk nicht setzen.", variant: "destructive" });
          return;
        }
        setSaVermerkLokal((v) => ({ ...v, [inv.id]: vermerk }));
        addAktivitaet({
          kundeId: id || "",
          art: "notiz",
          beschreibung: `Selbstauskunft übersprungen: Kunde finanziert selbst (gesetzt von ${user.name}, ${user.role})`,
          von: user.name,
        });
        /*
         * Die Stufe gleich hier mitziehen, nicht erst im naechsten Render.
         *
         * Weiter unten faengt eine Automatik denselben Fall ab, sie laeuft
         * aber ueber `stufenwechsel` und damit bewusst per setTimeout aus dem
         * Render heraus. Ergebnis war ein sichtbares Aufblitzen: Ein
         * Durchgang lang stand schon die freigeschaltete Karte da, waehrend
         * die Pipelinestufe noch die alte war, und alles, was an ihr haengt,
         * zeigte kurz den falschen Stand. Gemeldet von Christian am
         * 16.09.2026 ("ganz kurz wird was anderes eingeblendet").
         *
         * Hier sind wir in einem Klickbehandler, nicht im Render. Schreiben
         * ist also erlaubt, und der naechste Durchgang ist in sich stimmig.
         * Dieselbe Stufenliste wie in der Automatik unten.
         */
        // "bonitaetsunterlagen" steht BEWUSST nicht in dieser Liste. Seit dem
        // 06.08.2026 liegt die Bonitaet HINTER der Reservierung, ein Wechsel
        // dorthin waere also ein Rueckschritt. Siehe Kommentar bei der
        // Automatik weiter unten.
        if (["erstgespraech_geplant", "erstgespraech", "beratungsgespraech", "neuer_lead",
             "kontaktversuche", "follow_up"].includes(inv.pipelineStufe)) {
          updateInvestment(inv.id, { pipelineStufe: "objektauswahl" });
          updateKontakt(id || "", { pipelineStufe: "objektauswahl", status: "qualifiziert" as any });
        }
        toast({ title: "Vermerk gesetzt ✓", description: "Die Objektauswahl ist jetzt freigeschaltet." });
      } else {
        const ok = await confirmDialog({
          title: "Vermerk zurücknehmen?",
          description:
            "Die Selbstauskunft gilt danach wieder als nötig, und die Bonitätsunterlagen werden wieder erwartet.\n\n" +
            "Bereits erreichte Stufen bleiben, wo sie sind. Niemand fällt dadurch zurück.",
          confirmText: "Vermerk zurücknehmen",
          cancelText: "Behalten",
        });
        if (!ok) return;
        const vermerk = nimmSelbstauskunftEntfaelltZurueck(inv.id, { name: user.name, rolle: user.role });
        if (!vermerk) {
          toast({ title: "Nicht erlaubt", description: "Deine Rolle darf diesen Vermerk nicht ändern.", variant: "destructive" });
          return;
        }
        setSaVermerkLokal((v) => ({ ...v, [inv.id]: vermerk }));
        addAktivitaet({
          kundeId: id || "",
          art: "notiz",
          beschreibung: `Vermerk „Kunde finanziert selbst“ zurückgenommen (durch ${user.name}, ${user.role}). Bereits erreichte Stufen bleiben bestehen.`,
          von: user.name,
        });
        toast({ title: "Vermerk zurückgenommen" });
      }
      reloadKunde();
      forceUpdate((n) => n + 1);
    };

    /*
     * Der Schalter selbst.
     *
     * Er erscheint für jeden, der ihn setzen darf.
     *
     * Bis zum 21.09.2026 verschwand er, sobald eine Selbstauskunft vorlag. Das
     * war zu eng gedacht: Ein Kunde kann die Selbstauskunft ausgefüllt haben
     * und trotzdem über seine eigene Bank finanzieren. Genau dieser Fall trat
     * ein, und der Vorgang blieb stecken, weil auf Bonitätsunterlagen gewartet
     * wurde, die nie kommen. Der Schalter war dann nicht erreichbar.
     */
    const saEntfaelltSchalter =
      darfSaEntfallenSchalten ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <Switch
            id={`sa-entfaellt-${inv.id}`}
            checked={saEntfaellt}
            onCheckedChange={(an) => { void schalteSaEntfaellt(an); }}
          />
          <label htmlFor={`sa-entfaellt-${inv.id}`} className="text-xs cursor-pointer">
            <span className="font-medium block">Kunde finanziert selbst, keine Selbstauskunft nötig</span>
            <span className="text-muted-foreground">
              {saEntfaellt
                ? `Die Bonitätsunterlagen entfallen, der Vorgang wartet nicht auf ihre Freigabe. ${saEntfaelltText(saEntfaelltVermerk)}`.trim()
                : "Schaltet die Objektauswahl ohne Selbstauskunft frei. Die Bonitätsunterlagen entfallen dann, und der Vorgang wartet nicht auf ihre Freigabe."}
            </span>
          </label>
        </div>
      ) : null;

    // ── Auto-advance: SA unterschrieben → direkt „objektauswahl" ──
    // Der frühere Zwischenschritt „bonitaetsunterlagen" als Gate für die
    // Reservierung entfällt komplett. Docs werden im Portal parallel gesammelt.
    // Der Vermerk „Kunde finanziert selbst" wirkt hier genauso: Von da an
    // läuft der Vorgang normal weiter.
    const saComplete = objektauswahlFrei;
    /*
     * "bonitaetsunterlagen" ist am 16.09.2026 aus dieser Liste geflogen.
     *
     * Sie stammte aus der Zeit, als die Bonitaet VOR der Objektauswahl lag;
     * damals war der Wechsel ein Schritt nach vorn. Seit der Drehung am
     * 06.08.2026 liegt sie dahinter, und der Wechsel warf den Vorgang zurueck.
     *
     * Sichtbar wurde das am Schalter "Kunde finanziert selbst": Ein Durchgang
     * lang stand der Abschnitt "Bonitaet und Bankpruefung" noch da und
     * verschwand dann, weil `advancedInvestmentPhase` an genau dieser Schwelle
     * haengt. Christian sah es als kurzes Aufblitzen.
     */
    /*
     * "selbstauskunft" gehoert in diese Liste, seit dem 21.09.2026.
     *
     * Sie fehlte, und das war die eigentliche Luecke: Genau dort steht ein
     * Vorgang, waehrend der Kunde unterschreibt. Weder diese Automatik noch
     * die Edge Function bewegten ihn danach, der normale Weg hatte nach der
     * Unterschrift also gar keinen Stufensprung. Christian ist es an einem
     * Vorgang aufgefallen, der seit dem 27.08.2026 unterschrieben dort stand.
     *
     * Die uebrigen frueheren Stufen bleiben drin: Sie faengt, wer aus einem
     * anderen Grund noch weiter vorne steht.
     */
    if (saComplete && ["selbstauskunft", "erstgespraech_geplant", "erstgespraech", "beratungsgespraech", "bg_noshow", "eg_noshow", "neuer_lead", "zugewiesen", "nicht_erreicht", "kontaktversuche", "erreicht", "follow_up", "vermoegensaufbau", "closing"].includes(inv.pipelineStufe)) {
      stufenwechsel(inv.id, "objektauswahl", () => {
        updateInvestment(inv.id, { pipelineStufe: "objektauswahl" });
        updateKontakt(id || "", { pipelineStufe: "objektauswahl", status: "qualifiziert" as any });
        notiereStufenwechsel(SA_UNTERSCHRIEBEN, "objektauswahl");
        reloadKunde();
      });
    }

    // ── Auto-advance: RV eröffnet (PDF da, noch nicht unterschrieben) → reservierung ──
    const rvPdfForAutoAdvance = getInvestmentRvPdf(inv.id);
    const rvSignedForAutoAdvance = getRvSigned(inv.id);
    // "follow_up_objekt" steht mit drin: Die manuelle Follow-Up-Stufe darf
    // nach VORNE ueberholt werden, sobald eine RV eroeffnet ist. Zurueck auf
    // "objektauswahl" zieht sie keine Automatik (siehe pipelineStufen.ts).
    if (rvPdfForAutoAdvance && !rvSignedForAutoAdvance &&
        ["bonitaetsunterlagen", "objektauswahl", "follow_up_objekt"].includes(inv.pipelineStufe)) {
      stufenwechsel(inv.id, "reservierung", () => {
        updateInvestment(inv.id, { pipelineStufe: "reservierung" });
        updateKontakt(id || "", { pipelineStufe: "reservierung" });
        // Reservierungsvorgang läuft → Hinweis "Einheit gewechselt" entfernen
        clearEinheitGewechselt(inv.id);
        notiereStufenwechsel(RV_ERSTELLT, "reservierung");
        reloadKunde();
      });
    }

    /*
      Auto-advance: RV unterschrieben → Bonitaetsunterlagen.

      Bis zum 11.09.2026 sprang der Vorgang von hier direkt auf "finanzierung"
      und uebersprang die Stufe dazwischen. Damit galt die Finanzierung als
      begonnen, bevor auch nur eine Bonitaetsunterlage vorlag, und der
      Finanzierungspartner wurde gerufen, obwohl er nichts zu pruefen hatte.

      Der Ablauf lautet: Objektauswahl, Reservierung, Bonitaetsunterlagen,
      Finanzierung, Notar. Die unterschriebene Reservierung schliesst also die
      Reservierung ab und oeffnet die Bonitaetsunterlagen, nicht mehr.
      Entscheidung Christians vom 11.09.2026.
    */
    /*
      Wer selbst finanziert, ueberspringt die Bonitaetsunterlagen.

      Der Vermerk "Kunde finanziert selbst" versprach das seit jeher in seinem
      Beschreibungstext, bewirkt hat er es nie: Die Funktion
      `bonitaetsunterlagenErforderlich` gab es, sie wurde nur von keiner Stelle
      aufgerufen. Ein Selbstfinanzierer landete deshalb auf einer Stufe, aus der
      ihn nur die Freigabe von Unterlagen herausbringt, die es bei ihm gar nicht
      gibt. Er blieb dort stehen, bis jemand ihn von Hand weiterschob.

      Christian am 21.09.2026: "wer selbst finanziert, da braucht man die
      Bonitaetsunterlagen und so weiter dann nicht".
    */
    const naechsteStufeNachRv = bonitaetsunterlagenErforderlich(inv.id)
      ? "bonitaetsunterlagen"
      : "finanzierung";

    if (rvSignedForAutoAdvance && ["objektauswahl", "follow_up_objekt", "reservierung"].includes(inv.pipelineStufe)) {
      stufenwechsel(inv.id, naechsteStufeNachRv, () => {
        updateInvestment(inv.id, { pipelineStufe: naechsteStufeNachRv });
        updateKontakt(id || "", { pipelineStufe: naechsteStufeNachRv, status: "qualifiziert" });
        notifyPipelineChange(`${kunde.vorname} ${kunde.nachname}`, naechsteStufeNachRv, id || "");
        notifyKundeReservierung(id || "");
        notifyKundePipelineStufe(id || "", naechsteStufeNachRv);
        notiereStufenwechsel(RV_UNTERSCHRIEBEN, naechsteStufeNachRv);
        reloadKunde();
      });
    }

    /*
      Der Vermerk kam erst, als der Vorgang schon auf den
      Bonitaetsunterlagen stand. Dann bliebe er dort haengen, denn die
      Freigabe, die ihn sonst weiterschiebt, kommt beim Selbstfinanzierer nie.
      Er rueckt deshalb wie oben direkt auf Finanzierung (05.10.2026).
    */
    if (rvSignedForAutoAdvance && saEntfaellt && inv.pipelineStufe === "bonitaetsunterlagen") {
      stufenwechsel(inv.id, "finanzierung", () => {
        updateInvestment(inv.id, { pipelineStufe: "finanzierung" });
        updateKontakt(id || "", { pipelineStufe: "finanzierung", status: "qualifiziert" });
        notifyPipelineChange(`${kunde.vorname} ${kunde.nachname}`, "finanzierung", id || "");
        notifyKundePipelineStufe(id || "", "finanzierung");
        notiereEinmal(stufenwechselNotiz("finanzierung"));
        reloadKunde();
      });
    }

    /*
      Auto-advance: Bonitaet vollstaendig freigegeben → Finanzierung.

      Der Riegel ist `bonitaetFreigabeGemeldetAm` am Investment. Er wird genau
      dann gesetzt, wenn die Unterlagenpruefung alles freigegeben und den
      Finanzierungspartner gerufen hat (`meldeBonitaetFreigabe`). Anzeige,
      Stufenwechsel und Meldung haengen damit an einem einzigen Ereignis und
      koennen nicht auseinanderlaufen.
    */
    // Achtung: `inv` traegt nur die Felder aus `fromDb` in investmentsStore.ts,
    // und das Merkmal gehoert nicht dazu. Es muss aus dem Meta gelesen werden,
    // sonst ist die Bedingung immer falsch und der Stufenwechsel findet nie
    // statt. Genau diese Falle hat im Projekt schon mehrfach zugeschlagen.
    // Die Selbstauskunft gehoert mit hinein: Aus ihr liest `finanzierungIstFrei`
    // die Beschaeftigungsart. Ohne sie verlangte die Pruefung bei
    // Selbststaendigen ohne Merker Gehaltsnachweise, die es bei ihnen nicht
    // gibt, und der Vorgang rueckte nie auf Finanzierung.
    const bonitaetFrei = finanzierungIstFrei({
      bonitaetFreigabeGemeldetAm: getInvestmentMetaField<string | null>(inv.id, "bonitaetFreigabeGemeldetAm", null),
      docStatuses: getInvestmentMetaField<Record<string, string>>(inv.id, "docStatuses", {}),
      saData: getInvestmentMetaField<Record<string, unknown> | null>(inv.id, "saData", null),
      saSnapshot: getInvestmentMetaField<Record<string, unknown> | null>(inv.id, "saSnapshot", null),
    });
    if (bonitaetFrei &&
        ["reservierung", "bonitaetsunterlagen"].includes(inv.pipelineStufe)) {
      stufenwechsel(inv.id, "finanzierung", () => {
        updateInvestment(inv.id, { pipelineStufe: "finanzierung" });
        updateKontakt(id || "", { pipelineStufe: "finanzierung", status: "qualifiziert" });
        notifyPipelineChange(`${kunde.vorname} ${kunde.nachname}`, "finanzierung", id || "");
        notifyKundePipelineStufe(id || "", "finanzierung");
        notiereStufenwechsel(BONITAET_FREIGEGEBEN, "finanzierung");
        reloadKunde();
      });
    }

    // ── Auto-advance: Notartermin gesetzt (Datum+Uhrzeit) → notar ──
    if (inv.notarTermin && inv.notarUhrzeit && ["finanzierung", "reservierung"].includes(inv.pipelineStufe)) {
      stufenwechsel(inv.id, "notar", () => {
        updateInvestment(inv.id, { pipelineStufe: "notar" });
        updateKontakt(id || "", { pipelineStufe: "notar" });
        notiereStufenwechsel(notarterminGesetzt(inv.notarTermin, inv.notarUhrzeit), "notar");
        reloadKunde();
      });
    }

    // ── Auto-advance: Notartermin vorbei → faelligkeit ──
    // Eine Stunde Puffer, weil der Termin selbst Zeit braucht. Ohne Puffer
    // sprang die Stufe in dem Moment um, in dem die Beurkundung erst beginnt.
    if (inv.pipelineStufe === "notar" && inv.notarTermin && inv.notarUhrzeit) {
      const notarDateTime = new Date(`${inv.notarTermin}T${inv.notarUhrzeit}`);
      if (!isNaN(notarDateTime.getTime()) && notarDateTime.getTime() + NOTAR_PUFFER_MS < Date.now()) {
        stufenwechsel(inv.id, "faelligkeit", () => {
          updateInvestment(inv.id, { pipelineStufe: "faelligkeit" });
          updateKontakt(id || "", { pipelineStufe: "faelligkeit", status: "kunde" });
          notifyPipelineChange(`${kunde.vorname} ${kunde.nachname}`, "faelligkeit", id || "");
          notifyKundePipelineStufe(id || "", "faelligkeit");
          notiereStufenwechsel(NOTARTERMIN_STATTGEFUNDEN, "faelligkeit");
          reloadKunde();
        });
      }
    }

    // ── Korrektur: Stufe "faelligkeit" obwohl Notartermin noch in der Zukunft
    //    liegt → zurück auf "notar". Schützt vor Alt-Bug, der bereits beim
    //    Setzen des Fälligkeitsdatums vorzeitig auf "faelligkeit" wechselte.
    if (inv.pipelineStufe === "faelligkeit" && inv.notarTermin && inv.notarUhrzeit) {
      const abwData = getAbwicklungDaten(inv.id);
      const noAbwicklungProgress = !abwData?.provisionsRechnungGestellt && !abwData?.auszahlungBestaetigt;
      const notarDateTime = new Date(`${inv.notarTermin}T${inv.notarUhrzeit}`);
      // Derselbe Puffer wie oben, sonst wuerden sich beide Regeln in der
      // Stunde nach dem Termin gegenseitig hin und her schieben.
      if (noAbwicklungProgress && !isNaN(notarDateTime.getTime()) && notarDateTime.getTime() + NOTAR_PUFFER_MS > Date.now()) {
        stufenwechsel(inv.id, "notar-korrektur", () => {
          updateInvestment(inv.id, { pipelineStufe: "notar" });
          updateKontakt(id || "", { pipelineStufe: "notar" });
          notifyKundePipelineStufe(id || "", "notar");
          reloadKunde();
        });
      }
    }

    const bonitaetDone = bonitaetDocsInv.filter(d => {
      if (d.name === "Selbstauskunft") return !!(saPdfFilename || saSigned);
      return docStatuses[d.name] === "approved" || docStatuses[d.name] === "uploaded";
    }).length;
    const bankDone = dynamicBankDocs.filter(d => docStatuses[d.name] === "approved" || docStatuses[d.name] === "uploaded").length;

    // ── 2-day reminder: check if portal was activated 2+ days ago and required docs still missing ──
    // GATE: Sentinel im Investment-Meta verhindert mehrfaches Feuern (max. 1x / 24h)
    // Beim Vermerk „Kunde finanziert selbst" werden die Bonitätsunterlagen gar
    // nicht gebraucht. Dann darf hier auch niemand mehr daran erinnert werden.
    if (inv.pipelineStufe === "bonitaetsunterlagen" && !saEntfaellt) {
      const rows = cacheGet("kontakte");
      const kRow = rows.find((r: any) => r.id === id);
      const portalActivatedAt = isTestAccount()
        ? localStorage.getItem(`mi_portal_activated_${id || ""}_${inv.id}`)
        : (kRow?.meta as any)?.portalActivatedAt;
      if (portalActivatedAt) {
        const activatedDate = new Date(portalActivatedAt);
        const twoDaysLater = new Date(activatedDate.getTime() + 2 * 24 * 60 * 60 * 1000);
        if (new Date() >= twoDaysLater) {
          const fehlend = bonitaetDocsInv.filter(d => d.required).filter(d => {
            if (d.name === "Selbstauskunft") return !saPdfFilename;
            return !docStatuses[d.name] || docStatuses[d.name] === "none";
          }).map(d => d.name);
          if (fehlend.length > 0) {
            const lastNotifiedAt = getInvestmentMetaField<string | null>(inv.id, "docMissingNotifiedAt", null);
            const shouldNotify = !lastNotifiedAt
              || (Date.now() - new Date(lastNotifiedAt).getTime()) > 24 * 60 * 60 * 1000;
            if (shouldNotify) {
              // Sofort Sentinel setzen (vor await) gegen Race Conditions im Re-Render
              // Nur den Merker schicken, nicht das ganze meta (siehe oben).
              setInvestmentMetaFields(inv.id, { docMissingNotifiedAt: new Date().toISOString() });
              addDocNotification({
                type: "pflichtdocs_fehlen",
                kundeId: id || "",
                kundeName: `${kunde.vorname} ${kunde.nachname}`,
                investmentId: inv.id,
                beraterName: kunde.berater || user.name,
                fehlendeDocs: fehlend,
              });
            }
          }
        }
      }
    }

    // Check if THIS specific investment has SA data (not global)
    const invRow = cacheGet("investments").find((r: any) => r.id === inv.id);
    const thisInvSaData = invRow?.meta?.saData;
    const saStatus = docStatuses["Selbstauskunft"];
    const advancedInvestmentPhase = pipelineRang(inv.pipelineStufe) >= BONITAET_AB_INDEX;
    // Die volle Abwicklungsansicht (Bonitaetscheck, Bankpruefung) oeffnet erst
    // die Selbstauskunft selbst; eine nur verschickte Selbstauskunft haelt die
    // Fortschritts-Kachel offen, auch wenn der Kunde schon tippt oder teilweise
    // unterschrieben hat. Regeln zentral in src/lib/investmentFreischaltung.ts.
    /*
     * Der Vermerk "Kunde finanziert selbst" oeffnet die volle Ansicht mit.
     *
     * Sonst blieb der Abschnitt "Bonitaet und Bankpruefung" ganz weg, statt
     * als "nicht erforderlich" gekennzeichnet dazustehen. Ein verschwundener
     * Abschnitt sieht aus wie ein Fehler, und beim Umschalten sprang der
     * ganze Inhalt darunter, weil der Abschnitt kam und wieder ging.
     */
    const hasInvSA = saEntfaelltVermerk.aktiv || saVollansicht({
      saPdfFilename,
      saSigned,
      saStatus,
      saInvitationSentAt: getSaInvitationSentAt(inv.id),
      saDataVorhanden: !!thisInvSaData,
      fortgeschritteneStufe: advancedInvestmentPhase,
    });
    const isPreSA = !hasInvSA;

    return (
      /*
       * Der Schluessel ist hier keine Formsache.
       *
       * Alle Bereiche eines Investments haengen unter diesem einen Element.
       * Ohne `key` sieht React beim Wechsel des Investment-Reiters denselben
       * Baum an derselben Stelle und behaelt deshalb saemtliche Komponenten
       * samt ihrem Zustand. Karten, die ihre Daten nur beim ersten Aufbau
       * lesen, zeigten dann weiter die Angaben des zuerst geoeffneten
       * Investments. Mit dem Schluessel wird der Bereich beim Wechsel
       * vollstaendig neu aufgebaut.
       */
      <div key={inv.id} className={`space-y-6 ${isSetterinRole ? "pointer-events-none" : ""}`}>
        {isSetterinRole && (
          <div className="pointer-events-auto mb-2 p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground flex items-center gap-2">
            <Eye className="h-4 w-4" /> Du siehst dieses Investment nur zur Ansicht. Bearbeitung erfolgt durch den zugewiesenen Vertriebspartner.
          </div>
        )}
        {/* Nächste Schritte — nur für dieses Investment, hierhin springt die Karte aus den Stammdaten. */}
        {/* Investment Header with label — Sprungziel "Ueberblick" der Unternavigation */}
        <Card id={`card-ueberblick-${inv.id}`} className="p-6 transition-all duration-500">
          {/* Auf dem Telefon bricht die Kopfzeile um, statt Titel und Datum
              ineinanderzuschieben. `sm:flex-nowrap` stellt den Standard wieder
              her, der Schreibtisch sieht also genau dasselbe wie vorher. */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap sm:flex-nowrap">
            <div className="flex min-w-0 items-center gap-3 flex-wrap sm:flex-nowrap">
              <div className="w-8 h-1 bg-primary" />
              <h3 className="font-bold text-lg">{inv.label}</h3>
              {inv.objektTitel && <Badge variant="outline" className="text-xs">{inv.objektTitel}{inv.weNr ? ` WE ${inv.weNr}` : ""}</Badge>}
              {/* Pipeline Info Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors p-1 cursor-help"
                    title="Pipeline-Phasen und ihre Bereiche"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="center" sideOffset={10} className="z-[200] w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-4 text-xs shadow-xl">
                  <p className="mb-2 font-semibold text-foreground">Pipeline-Phasen → Bereich</p>
                  <div className="space-y-2">
                    {STUFEN_JE_BEREICH.map((eintrag) => (
                      <div key={eintrag.label}>
                        <span className="font-medium text-foreground">{eintrag.label}</span>
                        <p className="text-muted-foreground">{eintrag.stufen.join(", ")}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Der Bereich steht in „Alle Kontakte" in der Spalte Kategorie.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <span className="text-xs text-muted-foreground">Erstellt: {new Date(inv.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
          </div>
          {/*
            Pipeline dieses Investments als Prozessstraße (Ausschnitt).

            Ersetzt die umbrechende Chip-Leiste und deren Handy-Fassung. Die
            Erklärungen kommen weiter aus `stufenErklaerung.ts`, die Stufen aus
            `FORTSCHRITT_STUFEN`. Der Klick ist derselbe wie bei den Chips:
            manuell setzen mit Rückfrage, Alt+Klick oder Rollen ohne Override
            springen zur Karte. Welche Stationen zu sehen sind, entscheidet die
            aktive Rolle (`zielStufeFuerRolle`).
          */}
          {(() => {
            // Manueller Stufen-Override: Admins/Inhaber dürfen jeden Kontakt
            // umsetzen. Vertriebsleiter/Vertriebspartner dürfen es ebenfalls,
            // damit sie Alt-Kunden, die sie noch außerhalb des Systems
            // abwickeln, in der korrekten Stufe dokumentieren können.
            // Die Aktion umgeht alle Auto-Freischalt-Trigger (SA, Bonität, …)
            // und wird im Audit-Log protokolliert.
            const isAdminOverride = ["admin", "inhaber", "vertriebsleiter", "vertriebspartner"].includes(user.role);
            // Backoffice und Buchhaltung setzen nur „Abrechnung“ und
            // „Abgeschlossen“ (seit 04.10.2026). Die Datenbank prüft dasselbe
            // (pipeline_abschluss_schuetzen).
            const istAbschlussRolle = ABSCHLUSS_NUR_ROLLEN.includes(user.role);
            const darfSetzen = (key: string) => isAdminOverride || (istAbschlussRolle && ABSCHLUSS_STUFEN.includes(key));
            const istAktuell = (key: string) => PIPELINE_STEPS[invStep]?.key === key;
            // "Abrechnung" und "Abgeschlossen" setzen und verlassen nur Admin, Inhaber, Backoffice.
            const abschlussGesperrtFuer = (key: string) =>
              isAdminOverride && !istAktuell(key) && !darfAbschlussStufeWechseln(user.role, inv.pipelineStufe, key);
            return (
              <ProzessstrasseAusschnitt
                stufe={inv.pipelineStufe || "erstgespraech_geplant"}
                rolle={user.role}
                grundschuldHochgeladen={isGrundschuldUploaded(kunde.id)}
                stationTitel={(s) =>
                  abschlussGesperrtFuer(s.key)
                    ? ABSCHLUSS_HINWEIS
                    : darfSetzen(s.key)
                      ? (istAktuell(s.key) ? "Aktuelle Stufe" : isAdminOverride ? "Klick: Stufe manuell setzen (überspringt Auto-Trigger) · Alt+Klick: Karte anzeigen" : "Klick: Stufe setzen · Alt+Klick: Karte anzeigen")
                      : (STEP_TO_CARD_ID[s.key] ? "Klick: zur passenden Karte springen" : undefined)
                }
                onStation={async (s, e) => {
                  const isCurrent = istAktuell(s.key);
                  const abschlussGesperrt = isAdminOverride && !isCurrent
                    && !darfAbschlussStufeWechseln(user.role, inv.pipelineStufe, s.key);
                  if (abschlussGesperrt && !e.altKey) {
                    toast({ title: "Stufe nicht setzbar", description: ABSCHLUSS_HINWEIS, variant: "destructive" });
                    return;
                  }
                  // Admin/Inhaber: normaler Klick = manuell setzen (mit Warnung), Alt+Klick = zur Karte springen
                  if (isAdminOverride && !e.altKey && !isCurrent) {
                    const ok = await confirmDialog({
                      title: `⚠️ Manuelles Setzen der Pipeline-Stufe`,
                      description:
                        `Du setzt diesen Kontakt jetzt manuell auf „${s.label}".\n` +
                        `Damit überspringst du die automatische System-Logik (SA, Bonität, RV, Notar, …).\n\n` +
                        `Nutze das nur, um Alt-Kunden, die du außerhalb des Systems abwickelst, in der korrekten Stufe zu dokumentieren.\n\n` +
                        `Die Aktion wird im Audit-Log protokolliert. Wirklich fortfahren?`,
                      confirmText: "Stufe manuell setzen",
                      cancelText: "Abbrechen",
                      variant: "destructive",
                    });
                    if (!ok) return;
                    /*
                     * Ab der Reservierung muss feststehen, um welche Wohnung
                     * es geht. Frueher fragte hier ein Fenster danach. Es
                     * war die zweite Eingabestelle fuer dieselbe Angabe und
                     * erschien nur, solange etwas fehlte, sodass eine falsch
                     * eingetragene Adresse nie wieder aenderbar war.
                     *
                     * Jetzt wird der Wechsel blockiert und auf die eine
                     * Eingabestelle verwiesen, die auf derselben Seite
                     * direkt darunter liegt.
                     */
                    if (objektDialogNoetig(s.key, inv.id)) {
                      const hin = await confirmDialog({
                        title: "Zuerst das Objekt eintragen",
                        description:
                          `Für die Stufe „${s.label}" muss feststehen, welche Wohnung gekauft wird und zu welchem Preis.\n\n` +
                          `Eingetragen wird das in diesem Investment unter „Objektauswahl". Danach lässt sich die Stufe setzen.`,
                        confirmText: "Zur Objektauswahl",
                        cancelText: "Abbrechen",
                      });
                      if (hin) springeZuObjektauswahl(inv.id);
                      return;
                    }
                    updateInvestment(inv.id, { pipelineStufe: s.key });
                    updateKontakt(id || "", { pipelineStufe: s.key });
                    addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: `⚠️ Pipeline-Stufe manuell auf "${s.label}" gesetzt (Manueller Override durch ${user.name}, ${user.role})`, von: user.name });
                    toast({ title: "Stufe manuell gesetzt ⚠️", description: `Logik-Override: ${s.label}` });
                    reloadKunde();
                    return;
                  }
                  if (!isAdminOverride && istAbschlussRolle && darfSetzen(s.key) && !e.altKey && !isCurrent) {
                    const ok = await confirmDialog({
                      title: `Stufe auf „${s.label}" setzen?`,
                      description: s.key === "abgeschlossen"
                        ? "Der Vorgang gilt danach als abgeschlossen. Setze das erst nach Provisionsrechnung und Auszahlung."
                        : "Der Vorgang steht danach in der Abrechnung.",
                      confirmText: "Stufe setzen",
                      cancelText: "Abbrechen",
                    });
                    if (!ok) return;
                    if (!(await updateInvestment(inv.id, { pipelineStufe: s.key }))) return;
                    try {
                      await updateKontakt(id || "", { pipelineStufe: s.key });
                    } catch {
                      return;
                    }
                    addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: `Pipeline-Stufe auf "${s.label}" gesetzt (${user.name}, ${user.role})`, von: user.name });
                    toast({ title: "Stufe gesetzt ✓", description: s.label });
                    reloadKunde();
                    return;
                  }
                  // Sonst (oder Alt+Klick / Nicht-Admin): zur Karte springen
                  const cardId = STEP_TO_CARD_ID[s.key];
                  if (!cardId) return;
                  const el = document.getElementById(`${cardId}-${inv.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    markiereProfilAbschnitt(el);
                  }
                }}
              />
            );
          })()}
        </Card>

        {/*
          Nächste Schritte, direkt unter der Pipeline-Stufenübersicht.

          Die Karte stand bis jetzt unter der finanziellen Situation, obwohl
          der Kommentar hier schon "direkt unter den Pipeline-Stufen" sagte.
          Sie gehört nach oben: Wer ein Investment öffnet, will zuerst wissen,
          was als Nächstes zu tun ist, und erst danach die Zahlen dazu. Die
          finanzielle Situation folgt deshalb darunter, alle weiteren Schritte
          dahinter.
        */}
        {!isSetterinRole && !isFinanziererView && (
          <NaechsteSchritteKarte
            investments={[inv]}
            isAdmin={isAdminOrInhaber || (user.role as string) === "vertriebsleiter"}
            onOpenInvestment={() => {}}
            showOpenButton={false}
            einklappbar={false}
            /*
             * "Investment löschen" hing bis jetzt an der Investmentliste in den
             * Stammdaten. Die ist weg, und ohne diesen Knopf gäbe es keinen Weg
             * mehr zum Löschdialog. Er steht deshalb hier, beim geöffneten
             * Investment, und trifft genau das, was gerade auf dem Bildschirm
             * ist. Die Rechteprüfung bleibt dieselbe.
             */
            anchorId={`naechste-schritte-${inv.id}`}
            highlightKey={highlightInvSteps?.id === inv.id ? highlightInvSteps.ts : null}
          />
        )}

        {/* Finanzielle Situation & Ziele — gehört zum Überblick dieses Investments. */}
        {renderFinanzblock(inv.id)}

        {/* ── Erstgesprächs-Skript & Beratungsgespräch buchen — immer im Investment-Tab sichtbar
             (zuvor nur in Stammdaten). Wird via gemeinsame Helper-Funktion gerendert, damit Skript-
             Notizen, KI-Zusammenfassung und Terminbuchung in BEIDEN Tabs identisch funktionieren.
             Die Kennung ist das Sprungziel der Pipelinestufe "Beratungsgespräch"
             (STEP_TO_CARD_ID) und der Unternavigation. Sie zeigte bis jetzt auf
             nichts, weil es die Karte `card-erstgespraech-<id>` im Dokument gar
             nicht gab, ein Klick auf das Kästchen blieb deshalb wirkungslos. */}
        {(() => {
          const skript = renderSetterSkriptSection(inv.id);
          if (!skript) return null;
          return (
            <div id={`card-erstgespraech-${inv.id}`} className="transition-all duration-500 rounded-lg">
              {skript}
            </div>
          );
        })()}

        {/* ── Mitschriften der Videogespräche — direkt neben dem Erstgesprächs-Skript,
             in derselben Machart. Erscheint nur, wenn es zu diesem Kontakt überhaupt eine
             Mitschrift gibt. Der volle Text wird erst hier geholt, nicht über den Cache. */}
        {id && <MitschriftenKasten kontaktId={id} investmentId={inv.id} einklappbar={false} />}

        {/* ── Beratungspräsentation — immer freigeschaltet.
             Nach SA-Abschluss wird die Karte ausgeblendet. */}
        {!hasInvSA && (
            <Card className="p-6 border-primary/30 bg-primary/5">
              <div className="w-8 h-1 bg-primary mb-3" />
              <h3 className="font-bold mb-2">Beratungspräsentation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Öffne die interaktive Beratungsseite für den Kunden. Über den CTA am Ende der Präsentation kann auch direkt ein neuer Kontakt angelegt werden.
              </p>
              {/* Es gibt nur noch die eine MOREImmo-Praesentation, sichtbar
                  fuer alle Rollen. Die frueheren Varianten wurden entfernt. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const params = new URLSearchParams({
                      kunde: `${kunde.vorname} ${kunde.nachname}`,
                      kundeId: id || "",
                      investmentId: inv.id,
                    });
                    window.open(`/beratungspraesentation-moreimmo?${params.toString()}`, "_blank");
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-1" /> Beratungspräsentation MOREImmo
                </Button>
                <span className="relative inline-flex">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open("/dokumente/beratungspraesentation.pdf", "_blank")}
                  >
                    <Download className="h-4 w-4 mr-1" /> Beratungspräsentation als PDF
                  </Button>
                  {isNewBadgeActive("beratungspraesentation_pdf") && (
                    <Badge className="absolute -top-2 -right-2 text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">Neu</Badge>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Im besten Fall die Beratungspräsentation MOREImmo (Webfassung) nutzen. Die PDF ist
                zum Herunterladen und Präsentieren gedacht.
              </p>
            </Card>
        )}

        {/* ── Kunde nicht finanzierungsfähig — immer freigeschaltet.
             Die Karte verschwindet, sobald das Investment die Stufe Selbstauskunft
             erreicht hat (stufeAbSelbstauskunft) oder eine Unterschrift läuft bzw.
             vorliegt (saSignaturePending/saSigned deckt den Fall ab, in dem die
             SA schon unterwegs ist, die Stufe aber noch nicht nachgezogen wurde). */}
        {(["admin", "inhaber", "vertriebspartner"].includes(user.role)) && kunde?.pipelineStufe !== "verloren" && !saSignaturePending && !saSigned && !stufeAbSelbstauskunft(inv.pipelineStufe) && (
            <Card className="p-6 border-destructive/30 bg-destructive/5">
              <div className="w-8 h-1 bg-destructive mb-3" />
              <h3 className="font-bold mb-2">Kunde nicht finanzierungsfähig?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Wenn der Kunde nicht finanzierungsfähig ist oder die Beratung keinen Sinn ergibt, kannst du ihn als verloren markieren.
              </p>
              <Button variant="destructive" size="sm" onClick={() => { setVerlorenGrund(""); setVerlorenDialog(true); }}>
                <XCircle className="h-4 w-4 mr-1" /> Kunde verloren
              </Button>
            </Card>
        )}

        {/* ── Phase 1: Selbstauskunft — immer freigeschaltet, solange die
             Vollansicht noch nicht offen ist. ── */}
        {isPreSA && (
          <Card id={`card-selbstauskunft-${inv.id}`} className="p-6 transition-all duration-500">
            <div className="w-8 h-1 bg-[hsl(var(--warning))] mb-3" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-bold">Online-Selbstauskunft</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="h-5 w-5 rounded-full bg-amber-100 ring-1 ring-amber-300 flex items-center justify-center text-amber-700 hover:bg-amber-200 cursor-help">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" sideOffset={2} avoidCollisions={false} className="max-w-sm shadow-lg">
                    <p className="text-xs">Wenn die Selbstauskunft an den Kunden gesendet wurde, werden die Inhalte auch in <strong>Online-Selbstauskunft ausfüllen</strong> synchronisiert, damit du die SA jederzeit mit dem Kunden finalisieren kannst. Sobald die SA ausgefüllt und unterschrieben ist, wird sie automatisch als PDF im Investment unter <strong>Bonitätscheck</strong> abgelegt.</p>

                    {/*
                      Was die Automatik tut, gehoert hierher. Seit 15.09.2026 gehen
                      keine automatischen Erinnerungen mehr an den Kunden, nur noch
                      an den Partner; wer das nicht weiss, wartet im Gespraech auf
                      eine Mail, die nie kommt.
                    */}
                    <p className="text-xs mt-2 pt-2 border-t border-border/40">
                      <strong>Erinnerungen:</strong> Der Kunde bekommt nach dem Versand keine
                      automatische Erinnerung. Nachfassen ist deine Sache, die Inbox erinnert
                      dich daran. An <strong>Tag 14</strong> bekommst du eine Aufgabe in deine
                      Inbox, falls bis dahin nichts vorliegt.
                    </p>
                    <p className="text-xs mt-2">
                      <strong>Alles stoppt sofort</strong>, sobald die Selbstauskunft ausgefüllt
                      und unterschrieben ist. Ebenso, wenn der Kunde als verloren gilt oder das
                      Investment weiter ist. Auch offene Nachfass-Aufgaben werden dann
                      geschlossen.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            {/* Bewusst übersprungen: sonst denkt später jemand, sie sei vergessen worden. */}
            {saEntfaellt && (
              <div className="mb-4 rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2.5 text-xs">
                <p className="font-semibold mb-0.5">Selbstauskunft entfällt</p>
                <p className="text-muted-foreground">
                  Der Kunde finanziert selbst, eine Selbstauskunft ist für diesen Vorgang nicht nötig.
                  {saEntfaelltText(saEntfaelltVermerk) ? ` ${saEntfaelltText(saEntfaelltVermerk)}` : ""}
                </p>
              </div>
            )}
            {saPdfFilename && (
              <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: "hsl(var(--alert-green))" }}>
                <CheckCircle2 className="h-4 w-4" /> Selbstauskunft ausgefüllt
              </div>
            )}
            {saNeuAusstehend && (
              <div className="mb-4 rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2.5 text-xs">
                <p className="font-semibold mb-0.5 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Neue Unterschrift ausstehend</p>
                <p className="text-muted-foreground">
                  Die Selbstauskunft wurde geändert. Die bisherige Unterschrift gilt für die neue Fassung nicht mehr.
                  Bis alle neu unterschrieben haben, gilt die Selbstauskunft nicht als erledigt.
                  Objektauswahl und Reservierung bleiben offen, wenn der Vorgang schon so weit ist.
                </p>
              </div>
            )}
            {/* Ausfuell-Fortschritt des Kunden, sobald die SA gesendet wurde und
                noch nicht final ausgefuellt ist. So sieht der Berater auf einen
                Blick, wie weit der Kunde ist. */}
            {(() => {
              const sentAt = getSaInvitationSentAt(inv.id);
              if (!sentAt || saPdfFilename) return null;
              const prozent = selbstauskunftFortschrittProzent(getSaData(inv.id));
              return (
                <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Kunde hat ausgefüllt
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{prozent} %</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${prozent}%` }}
                    />
                  </div>
                </div>
              );
            })()}
            {/* Was aus der versendeten Einladung geworden ist. Die Komponente
                blendet sich selbst aus, solange keine Einladung hinausging.
                Nach dem Ausfüllen ist die Frage erledigt. */}
            {!saPdfFilename && id && (
              <SaMailTracking kontaktId={id} investmentId={inv.id} />
            )}
            {canFillSA ? (
              <div className="flex flex-wrap gap-2 items-center">
                <Button size="sm" variant="default" onClick={() => navigate(saKlickGemerkt(`/selbstauskunft?kundeId=${id}&investmentId=${inv.id}`))}>
                  <ExternalLink className="h-3 w-3 mr-1" /> Online-Selbstauskunft ausfüllen
                </Button>
                {(() => {
                  const sentAt = getSaInvitationSentAt(inv.id);
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant={sentAt ? "default" : "outline"}
                        className={sentAt ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white" : ""}
                        onClick={async () => {
                          const kundeEmail = kunde?.email;
                          const kundeName = `${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim();
                          if (!kundeEmail) {
                            toast({ title: "Keine E-Mail", description: "Bitte zuerst eine E-Mail-Adresse beim Kunden hinterlegen.", variant: "destructive" });
                            return;
                          }
                          const ok = await confirmDialog(
                            sentAt
                              ? {
                                  title: "Selbstauskunft erneut senden?",
                                  description: `Soll die Selbstauskunft erneut an ${kundeName} (${kundeEmail}) versendet werden?\n\nDer alte Link bleibt funktionsfähig – der Kunde erhält jedoch eine neue E-Mail mit der Einladung.`,
                                  confirmText: "Erneut senden",
                                }
                              : {
                                  title: "Selbstauskunft senden?",
                                  description: hatAngefangenenStand(inv.id)
                                    ? `Die Einladung wird an ${kundeName} (${kundeEmail}) versendet.\n\nDeine bisherigen Eingaben werden mitgeschickt: Der Kunde sieht alles, was du schon ausgefüllt hast, und macht dort weiter, wo du aufgehört hast.\n\nSobald der Kunde selbst etwas einträgt, gelten seine Angaben.`
                                    : `Die Einladung wird an ${kundeName} (${kundeEmail}) versendet.\n\nDer Kunde erhält eine E-Mail mit einem Link zum eigenständigen Ausfüllen und Unterschreiben der Selbstauskunft.`,
                                  confirmText: "Jetzt senden",
                                }
                          );
                          if (ok) {
                              // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
                              await stelleKundenspracheSicher(id);
                              try {
                                /*
                                 * Was der Kunde im Portal vorfindet.
                                 *
                                 * Zuerst der angefangene Stand dieses
                                 * Investments. Gibt es keinen, die Angaben aus
                                 * dem vorherigen Investment, samt Vermerk, aus
                                 * welchem sie stammen. Das Portal kann sich die
                                 * nicht selbst holen, es kennt nur dieses eine
                                 * Investment. Ohne diese Zeile käme der Kunde
                                 * auf ein leeres Formular, obwohl der Berater
                                 * im CRM die Vorbelegung sieht.
                                 */
                                const existingSaDraft = getSaData(inv.id) || saStartstandFuerInvestment(id || "", inv.id);
                                // Direkt via fetch + lokalem Access-Token, um den auth.getUser()-Roundtrip
                                // in supabase.functions.invoke() zu vermeiden (verursacht sonst sporadisch
                                // "Failed to send a request to the Edge Function" bei Netz-Aussetzern).
                                const { data: sessionRes } = await supabase.auth.getSession();
                                const accessToken = sessionRes?.session?.access_token;
                                if (!accessToken) throw new Error("Sitzung abgelaufen – bitte neu einloggen.");
                                const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sa-invitation`;
                                const resp = await fetch(fnUrl, {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${accessToken}`,
                                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                                  },
                                  body: JSON.stringify({ kontaktId: id, investmentId: inv.id, kundeName, kundeEmail, prefillData: existingSaDraft || undefined }),
                                });
                                if (!resp.ok) {
                                  let msg = `HTTP ${resp.status}`;
                                  try { const j = await resp.json(); msg = j?.error || j?.message || msg; } catch {}
                                  throw new Error(msg);
                                }
                                setSaInvitationSentAt(inv.id);
                                // Die Selbstauskunft ist beim Kunden, also Stufe anheben.
                                hebeAufSelbstauskunft();
                                // Schedule 48h/96h follow-up reminders
                                const kontaktRow = cacheGet("kontakte").find((k: any) => k.id === id);
                                const vpId = kontaktRow?.zustaendig_id || authUser?.id;
                                if (vpId) {
                                  scheduleSaFollowUpReminders(kundeName, id!, inv.id, vpId);
                                  notifySaEinladungVerschickt(kundeName, id!, vpId);
                                }
                                toast({ title: sentAt ? "Einladung erneut versendet ✓" : "Einladung versendet ✓", description: `${kundeName} erhält eine E-Mail mit dem Link zur Selbstauskunft.` });
                                addAktivitaet({ kundeId: id || "", art: "email", beschreibung: sentAt ? `Selbstauskunft-Einladung erneut versendet an ${kundeName}` : `Selbstauskunft-Einladung versendet an ${kundeName}`, von: user.name });
                                forceUpdate(n => n + 1);
                              } catch (err: any) {
                                toast({ title: "Fehler", description: err.message || "Einladung konnte nicht gesendet werden.", variant: "destructive" });
                              }
                          }
                        }}>
                        <Send className="h-3 w-3 mr-1" /> {
                          sentAt
                            ? "Erneut senden"
                            : hatAngefangenenStand(inv.id)
                              ? "Zum Fertigmachen an Kunde senden"
                              : "An Kunde senden"
                        }
                      </Button>
                      <KundenspracheHinweis kontaktId={id} />
                      {sentAt && (
                        <span className="text-xs text-muted-foreground">
                          Versendet: {new Date(sentAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} {new Date(sentAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {/* PDF-Weg fuer Kunden, denen der Online-Weg nicht liegt.
                    Bewusst nur eine dezente Rueckfall-Zeile unter den beiden
                    Hauptknoepfen: Online ausfuellen und An-Kunde-senden sind
                    die vorgesehenen Wege, die PDF ist der Notnagel. */}
                {darfPdfSelbstauskunft && (() => {
                  const pdfGesendetAm = getSaPdfWegGestartet(inv.id);
                  return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="basis-full flex items-center gap-2 mt-1">
                    <button type="button"
                      className={`text-xs underline underline-offset-2 inline-flex items-center gap-1 ${pdfGesendetAm ? "text-[hsl(var(--success))]" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={async () => {
                      const kundeEmail = kunde?.email;
                      const kundeName = `${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim();
                      if (!kundeEmail) {
                        toast({ title: "Keine E-Mail", description: "Bitte zuerst eine E-Mail-Adresse beim Kunden hinterlegen.", variant: "destructive" });
                        return;
                      }
                      /*
                       * Auch die PDF geht vorbelegt hinaus.
                       *
                       * Geschrieben wird der aktuelle Stand dieses Investments,
                       * sonst die Angaben des vorherigen. Gelb hinterlegt wird
                       * nur, was wirklich von dort stammt, und ein Deckblatt
                       * sagt es in Worten. In einer PDF kann keine Markierung
                       * verschwinden, sobald jemand ein Feld bestaetigt, also
                       * muss der Text die Arbeit machen.
                       */
                      const pdfUebernommen = saStartstandFuerInvestment(id || "", inv.id);
                      const pdfStand = getSaData(inv.id) || pdfUebernommen;
                      const pdfVorbelegung = pdfUebernommen?.vorbelegung && pdfStand
                        ? { data: pdfStand, ausInvestment: pdfUebernommen.vorbelegung.ausInvestment, uebernommen: pdfUebernommen }
                        : null;
                      const vorbelegungsHinweis = pdfVorbelegung
                        ? `\n\nDas PDF geht vorausgefüllt hinaus: Die Angaben aus Investment ${pdfVorbelegung.ausInvestment} sind bereits eingetragen und hellgelb hinterlegt. Ein Deckblatt bittet den Kunden ausdrücklich, jeden Wert zu prüfen und zu ändern, was nicht mehr stimmt.`
                        : "";
                      const ok = await confirmDialog(pdfGesendetAm
                        ? {
                            title: "Selbstauskunft-PDF erneut senden?",
                            description: `Soll die Selbstauskunft-PDF erneut an ${kundeName} (${kundeEmail}) versendet werden?${vorbelegungsHinweis}`,
                            confirmText: "Erneut senden",
                          }
                        : {
                            title: "Selbstauskunft als PDF senden?",
                            description: `${kundeName} (${kundeEmail}) erhält die Selbstauskunft als ausfüllbares PDF im Anhang, zum Drucken und handschriftlichen Ausfüllen oder zum direkten Ausfüllen am Computer.${vorbelegungsHinweis}\n\nNach dem Versand erscheint hier der Bereich zum Hochladen der ausgefüllten Selbstauskunft.`,
                            confirmText: "PDF senden",
                          });
                      if (!ok) return;
                      // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
                      await stelleKundenspracheSicher(id);
                      /*
                       * Bestaetigung SOFORT, Versand im Hintergrund. Die zwei,
                       * drei Sekunden bis zur Antwort der Mail-Function sahen
                       * aus, als haette der Klick nicht funktioniert. Schlaegt
                       * der Versand doch fehl, kommt eine rote Meldung nach,
                       * und der Knopf steht weiter auf Erneut senden.
                       */
                      setSaPdfWegGestartet(inv.id);
                      addAktivitaet({ kundeId: id || "", art: "email", beschreibung: `Selbstauskunft als ausfüllbares PDF ${pdfGesendetAm ? "erneut " : ""}versendet an ${kundeName}`, von: user.name });
                      toast({ title: pdfGesendetAm ? "PDF erneut versendet ✓" : "PDF versendet ✓", description: `${kundeName} erhält die Selbstauskunft als PDF.` });
                      forceUpdate(n => n + 1);
                      versendeSaFormularPdf({ kundeEmail, kundeName, investmentId: inv.id, kontaktId: id, erneut: !!pdfGesendetAm, vorbelegung: pdfVorbelegung, sprache: kundenSprache(kunde.id) }).catch((err) => {
                        toast({ title: "Versand fehlgeschlagen", description: `${err instanceof Error ? err.message : "Unbekannter Fehler"}. Bitte über "PDF erneut senden" noch einmal versuchen.`, variant: "destructive" });
                      });
                    }}>
                      <FileText className="h-3 w-3" /> {pdfGesendetAm
                        ? "PDF erneut senden"
                        : "Klappt der Online-Weg nicht? Selbstauskunft als PDF automatisch per Mail an Kunde senden"}
                    </button>
                    {isNewBadgeActive("sa_pdf_versand") && (
                      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">Neu</Badge>
                    )}
                    {pdfGesendetAm && (
                      <span className="text-xs text-muted-foreground">
                        PDF versendet: {new Date(pdfGesendetAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} {new Date(pdfGesendetAm).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm">
                    <p className="text-xs">
                      Der Kunde erhält die Selbstauskunft als ausfüllbares PDF. Füllt er sie
                      {" "}<strong>direkt am Computer aus</strong> und schickt die Datei zurück, liest das
                      System beim Hochladen alle Angaben automatisch aus und hinterlegt sie im
                      Kundenprofil. <strong>Druckt</strong> er sie und füllt sie handschriftlich aus,
                      müssen die Werte nach dem Hochladen manuell in die Online-Selbstauskunft
                      eingetragen werden.
                    </p>
                    <p className="text-xs mt-2 pt-2 border-t border-border/40">
                      Nach dem ersten Versand erscheint hier der Bereich zum Hochladen der
                      ausgefüllten Selbstauskunft.
                    </p>
                  </TooltipContent>
                </Tooltip>
                  );
                })()}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nur der zugewiesene Vertriebspartner ({kunde?.berater || "–"}) kann die Selbstauskunft ausfüllen.</p>
            )}
            {/* Upload der ausgefuellten Papier-/PDF-Selbstauskunft. Erscheint
                bewusst erst, nachdem "PDF an Kunden senden" genutzt wurde,
                sonst kostet der Bereich bei rein digitalem Weg nur Platz.
                Sichtbar fuer die freigegebenen Vertriebsrollen. */}
            {darfPdfSelbstauskunft && canFillSA && !!getSaPdfWegGestartet(inv.id) && !saPdfFilename && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">Ausgefüllte Selbstauskunft hochladen</p>
                <label className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm">
                    <span className="font-medium block">PDF oder Foto auswählen</span>
                    <span className="text-xs text-muted-foreground">Vom Kunden ausgefüllte und unterschriebene Selbstauskunft (PDF, JPG oder PNG). Am Computer ausgefüllte PDFs werden automatisch ausgelesen.</span>
                  </span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={async (e) => {
                    const datei = e.target.files?.[0];
                    e.target.value = "";
                    if (datei) await papierSaHochladen(datei);
                  }} />
                </label>
              </div>
            )}
            {/* „Kunde finanziert selbst“ vor der Selbstauskunft hier, danach unter Bonität und Bankprüfung (05.10.2026). */}
            {saEntfaelltSchalter}
          </Card>
        )}

        {/*
          Hier stand bis zum 16.09.2026 eine zweite, schlanke Karte "Bonitaet
          und Bankpruefung" fuer den Selbstfinanzierer vor der Selbstauskunft.
          Sie ist unerreichbar geworden: Seit der Vermerk "Kunde finanziert
          selbst" die volle Ansicht mitoeffnet (siehe `hasInvSA`), ist
          `isPreSA` bei gesetztem Vermerk immer falsch, die Bedingung
          `isPreSA && saEntfaellt` also nie wahr.

          Ersatzlos entfallen, nicht ersetzt: Den Hinweis "Nicht erforderlich,
          der Kunde finanziert selbst" traegt jetzt der Warnkasten in der
          gemeinsamen Karte darunter, und dort steht er ohnehin besser, weil
          der eingeklappte Bonitaetscheck gleich daneben liegt.
        */}

        {/* ── Phase 2: Bonität (only after SA) ── */}
        {!isPreSA && (
          <>
            {canDownloadAllUnterlagen && (
              <div className="flex justify-end -mb-2">
                <Button variant="outline" size="sm" onClick={downloadAllUnterlagenZip} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Alle Unterlagen als ZIP herunterladen
                </Button>
              </div>
            )}
            <div id={`card-bonitaet-${inv.id}`} className="space-y-6 rounded-lg">
            {/* Fehlt zur unterschriebenen Selbstauskunft die Datei, wird sie
                hier einmal nachgeholt und am Investment abgelegt. */}
            {id && (
              <SaPdfNachholen
                investmentId={inv.id}
                kontaktId={id}
                kunde={{ vorname: kunde.vorname, nachname: kunde.nachname, moreId: String(kunde.moreId || "") }}
              />
            )}
            {/* Bonitätscheck, Bankprüfung und die Pflichtdokumente gehören
                fachlich zusammen und stehen deshalb in einer gemeinsamen Karte.
                Damit nicht drei gleich laute Kästen untereinander stehen, trägt
                nur diese äußere Karte Rahmen und Schatten, die Kästen darin sind
                flach gehalten. */}
            <Card className="p-6">
              <div className="w-8 h-1 bg-primary mb-3" />
              <KundenprofilAbschnitt
                kopf={<h3 className="font-bold mb-4">Bonität und Bankprüfung</h3>}
              >
              <div className="space-y-6">
            {/* Kunde finanziert selbst: Der Block bleibt stehen, ist aber als
                nicht erforderlich gekennzeichnet. */}
            {saEntfaellt && (
              <div className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-4 py-3 text-xs">
                <p className="font-semibold mb-0.5">Bonitätsunterlagen nicht erforderlich, der Kunde finanziert selbst</p>
                <p className="text-muted-foreground">
                  Nichts davon muss freigegeben werden, damit der Vorgang weiterläuft. Das
                  Finanzierungsangebot lädst du unter „Finanzierung" hoch.
                  {saEntfaelltText(saEntfaelltVermerk) ? ` ${saEntfaelltText(saEntfaelltVermerk)}` : ""}
                </p>
              </div>
            )}
            {/* Bleibt als einziger Bereich des Investments zweispaltig (05.10.2026), siehe kundenprofil.css. */}
            <div className="kp-zwei-spalten grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bonitätscheck. Flach gehalten: Der Rahmen der äußeren Karte
                  trägt den Abschnitt, hier genügt eine leichte Abgrenzung. */}
              <Card className="p-5 bg-muted/20 shadow-none transition-all duration-500">
                <div className="w-8 h-1 bg-primary/40 mb-3" />
                <h3 className="font-bold mb-4">Bonitätscheck</h3>
                {/*
                  Beim Selbstfinanzierer eingeklappt (Christian, 16.09.2026,
                  am 29.09.2026 bestaetigt): Die Unterlagen werden nicht
                  gebraucht und naehmen aufgeklappt den halben Bildschirm
                  weg. Eingeklappt, nicht ausgeblendet, damit niemand suchen
                  muss, wenn doch etwas hochgeladen wurde. Der Knopf bleibt,
                  damit man nachsehen kann, ohne den Vermerk zurueckzunehmen.
                  Kein gemerkter Zustand, beim Oeffnen des Profils wieder zu.
                */}
                {saEntfaellt && (
                  <button
                    type="button"
                    onClick={() => setSaUnterlagenOffen((vorher) => ({ ...vorher, [inv.id]: !vorher[inv.id] }))}
                    className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60"
                    aria-expanded={!!saUnterlagenOffen[inv.id]}
                  >
                    {saUnterlagenOffen[inv.id]
                      ? <><ChevronUp className="h-3.5 w-3.5" /> Unterlagen wieder einklappen</>
                      : <><ChevronDown className="h-3.5 w-3.5" /> Unterlagen anzeigen, werden nicht gebraucht</>}
                  </button>
                )}
                <div hidden={saEntfaellt && !saUnterlagenOffen[inv.id]}>
                <p className="text-xs text-muted-foreground mb-4">
                  <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Fehlt</span>
                  <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-[hsl(var(--warning))] inline-block" /> Prüfung</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[hsl(var(--success))] inline-block" /> Freigegeben</span>
                </p>
                <div className="space-y-3">
                  {bonitaetDocsInv.map((doc, i) => {
                    const isSA = doc.name === "Selbstauskunft";
                    const hasPdf = isSA && (saPdfFilename || saSigned);
                    const saIsPending = isSA && saSignaturePending && !saSigned && !saPdfFilename;
                    // Die hochgeladene Papier-Selbstauskunft traegt die
                    // Unterschrift auf dem Dokument selbst und zaehlt deshalb
                    // als unterschrieben.
                    // Papierweg gehoert zur PDF-Selbstauskunft (Erprobungsphase,
                    // nur admin). Fuer alle anderen Rollen bleibt der Pfad leer,
                    // damit sich die Zeile wie vor dem Feature verhaelt.
                    const saPapierPfad = isSA && darfPdfSelbstauskunft ? getSaPapierUpload(inv.id) : "";
                    const saIsFullySigned = isSA && (saSigned || !!saPapierPfad);
                    // Unterschrieben heißt freigegeben; nur eine noch
                    // ausstehende Unterschrift zählt als "hochgeladen".
                    const status: DocStatus = isSA ? ((hasPdf || saIsFullySigned) ? "approved" : saIsPending ? "uploaded" : "none") : (docStatuses[doc.name] || "none");
                    // Basic docs: SA, Personalausweis, Letzter Gehaltsnachweis – always visible. Others need full unlock.
                    const isBasicDoc = isSA || doc.name === "Personalausweis" || doc.name === "Letzter Gehaltsnachweis";
                    const isDocLocked = unterlagenZeileGesperrt({ role: user.role, unterlagenFreigeschaltet, istBasisdokument: isBasicDoc, nurLesend: isReadOnlyDocView });
                    return (
                      <div key={i} className={`border-b pb-3 ${isDocLocked ? "opacity-50" : ""}`}>
                        <div className="flex items-start gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isDocLocked ? "bg-muted" : getDocColor(status)}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{doc.name}{doc.required && <span className="text-destructive ml-0.5">*</span>}</span>
                              <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                status === "approved" ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                                : status === "uploaded" ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
                                : "bg-destructive/10 text-destructive"
                              }`}>{isSA ? getSaLabel(status, !!saIsFullySigned) : getDocLabel(status)}</span>
                            </div>
                            {/* Seit wann auf die Unterschrift gewartet wird.
                                Nach der Unterschrift verschwindet die Zeile. */}
                            {isSA && !saIsFullySigned && (
                              <SaVersandZeitpunkt
                                kontaktId={id!}
                                investmentId={inv.id}
                                ausMeta={saVersandRoh(inv.id)}
                              />
                            )}
                            <div className="kundenprofil-dokaktionen flex gap-2 mt-1.5 flex-wrap">
                              {isReadOnlyDocView ? (
                                /* Finanzierer: nur Ansehen/Download, keine Bearbeitung */
                                (status === "uploaded" || status === "approved") ? (
                                  isSA ? (
                                    <button className="text-xs text-primary hover:underline uppercase tracking-wide" onClick={saPdfAnzeigen}>PDF anzeigen</button>
                                  ) : (
                                    <>
                                      <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                      <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => openDocFile(doc.name)}><Download className="h-3 w-3" /> Download</button>
                                    </>
                                  )
                                ) : status === "none" ? (
                                  <span className="text-xs text-muted-foreground">Noch nicht hochgeladen</span>
                                ) : null
                              ) : isSA ? (
                                hasPdf || saIsFullySigned ? (
                                  <>
                                    {/* Papierweg: das hochgeladene Original ist
                                        das massgebliche Dokument, nicht ein aus
                                        saData erzeugtes PDF. */}
                                    {saPapierPfad && (
                                      <button className="text-xs text-primary hover:underline uppercase tracking-wide" onClick={async () => {
                                        try {
                                          const { data: dl, error: dlErr } = await supabase.storage.from("unterlagen").download(saPapierPfad);
                                          if (dlErr || !dl) throw dlErr || new Error("Datei nicht gefunden");
                                          window.open(URL.createObjectURL(dl), "_blank");
                                        } catch {
                                          toast({ title: "Datei nicht gefunden", description: "Die hochgeladene Selbstauskunft konnte nicht geöffnet werden.", variant: "destructive" });
                                        }
                                      }}>Hochgeladene Selbstauskunft anzeigen</button>
                                    )}
                                    {saPapierPfad && canFillSA && (
                                      <label className="text-xs text-primary hover:underline uppercase tracking-wide cursor-pointer">
                                        Neue Fassung hochladen
                                        <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={async (e) => {
                                          const datei = e.target.files?.[0];
                                          e.target.value = "";
                                          if (datei) await papierSaHochladen(datei);
                                        }} />
                                      </label>
                                    )}
                                    {!saPapierPfad && <button className="text-xs text-primary hover:underline uppercase tracking-wide" onClick={saPdfAnzeigen}>PDF anzeigen</button>}
                                    {isBackofficeOrAdmin && status !== "approved" && (
                                      <button className="text-xs uppercase tracking-wide hover:underline" style={{ color: "hsl(var(--alert-green))" }} onClick={async () => {
                                        // Die Datenbank prüft, ob die Selbstauskunft unterschrieben ist.
                                        try {
                                          await vermerkeSaPdf(inv.id, `SA_${kunde.vorname}_${kunde.nachname}.pdf`);
                                        } catch (fehler) {
                                          toast({ title: "Nicht freigegeben", description: fehler instanceof AktionVerweigert ? fehler.message : "Bitte erneut versuchen.", variant: "destructive" });
                                          return;
                                        }
                                        updateDocStatusForInv("Selbstauskunft", "approved"); notifyKundeSelbstauskunft(id || ""); toast({ title: "Selbstauskunft freigegeben ✓" });
                                      }}>Freigeben</button>
                                    )}
                                    {/* SA Edit Workflow – VP can edit directly */}
                                    {(() => {
                                      // Papierweg: Die unterschriebene PDF ist massgeblich,
                                      // eine Online-Bearbeitung wiche vom unterschriebenen
                                      // Dokument ab. Aenderungen laufen ueber eine neue,
                                      // neu unterschriebene PDF samt neuem Upload.
                                      if (saPapierPfad) {
                                        const saDatenVorhanden = !!(cacheGet("investments").find((r: { id?: string }) => r.id === inv.id) as { meta?: { saData?: unknown } } | undefined)?.meta?.saData;
                                        return (
                                          <span className="block w-full space-y-1">
                                            <span className="block text-[10px] text-muted-foreground">
                                              Vom Kunden ausgefüllte PDF. Änderungen bitte mit dem Kunden auf der PDF vornehmen und die neue Fassung hochladen.
                                            </span>
                                            {/* Handschriftliche Fassung: Die Zahlen stehen nur auf
                                                dem Papier. Ohne Uebertrag bleiben Ueberschussrechnung
                                                und Finanzierungsrahmen leer. */}
                                            {!saDatenVorhanden && canFillSA && (
                                              <span className="flex items-center gap-2 rounded border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-2 py-1">
                                                <span className="text-[10px] text-[hsl(var(--warning))]">
                                                  Zahlen noch nicht im System: Bitte die Angaben aus der PDF in die Online-Selbstauskunft übertragen, damit Einnahmen, Ausgaben und Finanzierungsrahmen berechnet werden.
                                                </span>
                                                <button className="text-[10px] font-semibold text-[hsl(var(--warning))] underline shrink-0" onClick={() => navigate(saKlickGemerkt(`/selbstauskunft?kundeId=${id}&investmentId=${inv.id}`))}>
                                                  Jetzt übertragen
                                                </button>
                                              </span>
                                            )}
                                          </span>
                                        );
                                      }
                                      const saEditSt = getSaEditStatus(inv.id);
                                      if (saEditSt === "none" || saEditSt === "abgeschlossen") {
                                        if (canFillSA) {
                                          return (
                                            <button className="text-xs text-[hsl(var(--warning))] hover:underline uppercase tracking-wide flex items-center gap-1" onClick={async () => {
                                              const ok = await confirmDialog({
                                                title: "Selbstauskunft bearbeiten?",
                                                description: "Achtung: Wenn du die bereits freigegebene Selbstauskunft änderst, muss der Kunde die geänderte Version anschließend erneut digital unterschreiben. Die bisherige Unterschrift wird ungültig und der Bonitätsstatus 'Selbstauskunft' wechselt zurück auf 'in Bearbeitung', bis die neue SA unterschrieben vorliegt.\n\nMöchtest du wirklich fortfahren?",
                                                confirmText: "Ja, bearbeiten",
                                                cancelText: "Abbrechen",
                                              });
                                              if (!ok) return;
                                              setSaEditStatus(inv.id, "in_bearbeitung");
                                              navigate(saKlickGemerkt(`/selbstauskunft?kundeId=${id}&investmentId=${inv.id}&edit=true`));
                                            }}>
                                              <Pencil className="h-3 w-3" /> Bearbeiten
                                            </button>
                                          );
                                        }
                                      } else if (saEditSt === "in_bearbeitung") {
                                        if (canFillSA) {
                                          /*
                                            Derselbe Knopf wie oben, gleiche Beschriftung, gleiche Farbe.
                                            Vorher hiess er hier "Weiter bearbeiten" und war blau, waehrend
                                            er im Zustand darueber "Bearbeiten" hiess und orange war. Beide
                                            tun dasselbe, naemlich das Formular oeffnen, und der Unterschied
                                            lag in einem Zustand, den niemand sieht.

                                            Die Warnung steckt weiterhin im Dialog, und der erscheint nur
                                            dort, wo tatsaechlich eine gueltige Unterschrift entwertet wird.
                                            Hier gibt es nichts zu warnen: Die Bearbeitung laeuft schon.
                                          */
                                          return (
                                            <button className="text-xs text-[hsl(var(--warning))] hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => {
                                              navigate(saKlickGemerkt(`/selbstauskunft?kundeId=${id}&investmentId=${inv.id}&edit=true`));
                                            }}>
                                              <Pencil className="h-3 w-3" /> Bearbeiten
                                            </button>
                                          );
                                        }
                                        return <span className="text-xs text-[hsl(var(--warning))] flex items-center gap-1"><Pencil className="h-3 w-3" /> Wird bearbeitet</span>;
                                      } else if (saEditSt === "unterschrift_versendet") {
                                        return (
                                          <span className="text-xs text-[hsl(var(--warning))] flex items-center gap-1">
                                            <Mail className="h-3 w-3" /> Neue Version zur Unterschrift versendet (Person 1{kunde.person2 ? " + Person 2" : ""})
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </>
                                ) : canFillSA ? (
                                  <div className="w-full">
                                    {/* Wurde die Selbstauskunft bereits zur Unterschrift versendet, ist
                                        das Formular ohne Bearbeitungsmodus gesperrt ("Bereits versendet").
                                        Deshalb hier direkt in den Bearbeitungsmodus springen, damit der
                                        Berater korrigieren und erneut versenden kann. */}
                                    <button className="text-xs text-primary hover:underline uppercase tracking-wide" onClick={() => {
                                      if (saIsPending) {
                                        setSaEditStatus(inv.id, "in_bearbeitung");
                                        navigate(saKlickGemerkt(`/selbstauskunft?kundeId=${id}&investmentId=${inv.id}&edit=true`));
                                      } else {
                                        navigate(saKlickGemerkt(`/selbstauskunft?kundeId=${id}&investmentId=${inv.id}`));
                                      }
                                    }}>{saIsPending ? "Selbstauskunft bearbeiten & erneut senden" : "Selbstauskunft ausfüllen"}</button>
                                    {(() => {
                                      const invRowMeta = (cacheGet("investments").find((r: any) => r.id === inv.id)?.meta as any) || {};
                                      // Entwurf-PDF nur aus der eigenen Selbstauskunft dieses
                                      // Investments. Ohne sie erscheint der Knopf gar nicht.
                                      const storedSaData = invRowMeta.saData || invRowMeta.saSnapshot;
                                      if (!storedSaData) return null;
                                      // Nur Unterschriften zur geltenden Fassung, siehe saGeltendeUnterschriftenAusMeta.
                                      const sigs = saGeltendeUnterschriftenAusMeta(invRowMeta);
                                      const p1Signed = !!sigs?.person1?.signatureData;
                                      const p2Signed = !!sigs?.person2?.signatureData;
                                      const hasP2 = !!storedSaData.person2;
                                      const fullySigned = p1Signed && (!hasP2 || p2Signed);
                                      const partial = p1Signed && hasP2 && !p2Signed;
                                      const stage = fullySigned ? "FINAL" : partial ? "ZWISCHENSTAND" : "ENTWURF";
                                      const label = fullySigned ? "📄 Finale SA anzeigen" : partial ? "📄 Zwischenstand-PDF (Person 1 unterschrieben)" : "📄 Entwurf-PDF anzeigen";
                                      const title = fullySigned ? "Final unterschriebene Selbstauskunft" : partial ? "Person 1 hat unterschrieben – Zwischenstand, wartet auf Person 2" : "Vorschau der ausgefüllten Selbstauskunft – noch ohne Unterschrift";
                                      return (
                                        <button
                                          className="text-xs text-[hsl(var(--warning))] hover:underline uppercase tracking-wide ml-3 inline-flex items-center gap-1"
                                          title={title}
                                          onClick={async () => {
                                            try {
                                              const pdf = await generateSelbstauskunftPDF(storedSaData, {
                                                vorname: kunde.vorname, nachname: kunde.nachname, moreId: String(kunde.moreId || ""),
                                              }, sigs || undefined, { sprache: kundenSprache(kunde.id) });
                                              pdf.save(`Selbstauskunft_${stage}_${kunde.vorname}_${kunde.nachname}.pdf`);
                                            } catch (err) {
                                              console.error("Draft PDF error", err);
                                              toast({ title: "PDF-Fehler", description: "PDF konnte nicht erzeugt werden.", variant: "destructive" });
                                            }
                                          }}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })()}
                                    {id && (
                                      <SaPartialSignaturePill
                                        kontaktId={id}
                                        investmentId={inv.id}
                                        fallbackSaData={(cacheGet("investments").find((r: any) => r.id === inv.id)?.meta as any)?.saData}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-full">
                                    <span className="text-xs text-muted-foreground">Nur zugewiesener Vertriebspartner</span>
                                    {(() => {
                                      const invRowMeta = (cacheGet("investments").find((r: any) => r.id === inv.id)?.meta as any) || {};
                                      // Entwurf-PDF nur aus der eigenen Selbstauskunft dieses
                                      // Investments. Ohne sie erscheint der Knopf gar nicht.
                                      const storedSaData = invRowMeta.saData || invRowMeta.saSnapshot;
                                      if (!storedSaData) return null;
                                      // Nur Unterschriften zur geltenden Fassung, siehe saGeltendeUnterschriftenAusMeta.
                                      const sigs = saGeltendeUnterschriftenAusMeta(invRowMeta);
                                      const p1Signed = !!sigs?.person1?.signatureData;
                                      const p2Signed = !!sigs?.person2?.signatureData;
                                      const hasP2 = !!storedSaData.person2;
                                      const fullySigned = p1Signed && (!hasP2 || p2Signed);
                                      const partial = p1Signed && hasP2 && !p2Signed;
                                      const stage = fullySigned ? "FINAL" : partial ? "ZWISCHENSTAND" : "ENTWURF";
                                      const label = fullySigned ? "📄 Finale SA anzeigen" : partial ? "📄 Zwischenstand-PDF (Person 1 unterschrieben)" : "📄 Entwurf-PDF anzeigen";
                                      const title = fullySigned ? "Final unterschriebene Selbstauskunft" : partial ? "Person 1 hat unterschrieben – Zwischenstand, wartet auf Person 2" : "Vorschau der ausgefüllten Selbstauskunft – noch ohne Unterschrift";
                                      return (
                                        <button
                                          className="text-xs text-[hsl(var(--warning))] hover:underline uppercase tracking-wide ml-3 inline-flex items-center gap-1"
                                          title={title}
                                          onClick={async () => {
                                            try {
                                              const pdf = await generateSelbstauskunftPDF(storedSaData, {
                                                vorname: kunde.vorname, nachname: kunde.nachname, moreId: String(kunde.moreId || ""),
                                              }, sigs || undefined, { sprache: kundenSprache(kunde.id) });
                                              pdf.save(`Selbstauskunft_${stage}_${kunde.vorname}_${kunde.nachname}.pdf`);
                                            } catch (err) {
                                              console.error("Draft PDF error", err);
                                              toast({ title: "PDF-Fehler", description: "PDF konnte nicht erzeugt werden.", variant: "destructive" });
                                            }
                                          }}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })()}
                                    {id && (
                                      <SaPartialSignaturePill
                                        kontaktId={id}
                                        investmentId={inv.id}
                                        fallbackSaData={(cacheGet("investments").find((r: any) => r.id === inv.id)?.meta as any)?.saData}
                                      />
                                    )}
                                  </div>
                                )
                              ) : isDocLocked ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Wird nach Vollfreigabe freigeschaltet</span>
                              ) : (
                                <>
                                  {status === "none" && (
                                    <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}>
                                      <Upload className="h-3 w-3" /> Hochladen
                                    </button>
                                  )}
                                   {status === "uploaded" && (
                                     <>
                                       <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                       <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                       {isBackofficeOrAdmin && <button className="text-xs uppercase tracking-wide hover:underline" style={{ color: "hsl(var(--alert-green))" }} onClick={() => { updateDocStatusForInv(doc.name, "approved"); toast({ title: "Freigegeben ✓", description: doc.name }); }}>Freigeben</button>}
                                       {isBackofficeOrAdmin && <button className="text-xs text-destructive hover:underline uppercase tracking-wide" onClick={() => { setRejectDialog({ invId: inv.id, docName: doc.name }); setRejectReason(""); }}>Ablehnen</button>}
                                       {isAdminOrInhaber && <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: false })} />}
                                     </>
                                   )}
                                    {status === "approved" && (
                                      <>
                                        <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                        <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                        {isAdminOrInhaber && <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: true })} />}
                                      </>
                                    )}
                                  {status === "rejected" && (
                                    <>
                                      <span className="text-xs text-destructive">Grund: {getDocRejectReasons(inv.id)[doc.name] || "–"}</span>
                                      <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}>
                                        <Upload className="h-3 w-3" /> Erneut hochladen
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex gap-0.5 flex-1">
                    {bonitaetDocsInv.map((doc, i) => {
                      const isSA = doc.name === "Selbstauskunft";
                      const st: DocStatus = isSA ? (saAutoApproved ? "approved" : "none") : (docStatuses[doc.name] || "none");
                      const barColor = st === "approved" ? "bg-alert-green" : st === "uploaded" ? "bg-alert-orange" : "bg-alert-red";
                      return <div key={i} className={`h-2 flex-1 rounded-sm ${barColor}`} />;
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground">{bonitaetDone}/{bonitaetDocsInv.length}</span>
                </div>
                {/* Unterlagen einreichen Button - nicht für Finanzierer */}
                {!isReadOnlyDocView && allRequiredBonitaetUploaded && !unterlagenGesendet && !isBackofficeOrAdmin && (
                  <div className="mt-3">
                    <Button size="sm" onClick={handleUnterlagenEinreichen} className="gap-1.5">
                      <Send className="h-3.5 w-3.5" /> Unterlagen einreichen
                    </Button>
                    <p className="text-[10px] text-muted-foreground mt-1">Alle Pflichtdokumente hochgeladen – zur Prüfung an das Backoffice senden.</p>
                  </div>
                )}
                {!isReadOnlyDocView && unterlagenGesendet && !isBackofficeOrAdmin && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-[hsl(var(--success))]">
                    <CheckCircle2 className="h-4 w-4" /> Unterlagen eingereicht – wartet auf Freigabe
                  </div>
                )}
                </div>
                {/* Prüfung abschließen button moved below both cards */}
                {/*
                  Portal freischalten, Einladung, Zwei-Faktor, Sperren. Nicht für
                  Finanzierer und Setterin. Derselbe Baustein mit denselben Handlern
                  steht im Kundenprofil unter den Kontaktdaten, siehe
                  `kundenportalAngaben`. Nur das Freischalten gibt es allein hier.
                */}
                {darfKundenportalVerwalten && (
                <div className="mt-4 pt-3 border-t">
                  <KundenportalZugang
                    {...kundenportalAngaben}
                    onFreischalten={handlePortalFreischalten}
                    freischaltenLaeuft={portalLoading}
                  />
                  <KundenspracheHinweis kontaktId={id} className="mt-2" />
                </div>
                )}
              </Card>

              {/* Bankprüfung, ebenfalls flach in der gemeinsamen Karte. */}
              <Card className="p-5 bg-muted/20 shadow-none">
                <div className="w-8 h-1 bg-primary/40 mb-3" />
                <h3 className="font-bold mb-4">Bankprüfung</h3>
                {/*
                  Beim Selbstfinanzierer eingeklappt wie der Bonitätscheck
                  daneben (Christian, 05.10.2026): Die Bank prüft hier nichts,
                  also keine roten Zeilen, keine Pflicht-Sternchen und kein
                  0/8. Eigener Klappzustand, damit ein Klick nicht beide
                  Listen aufreißt.
                */}
                {saEntfaellt && (
                  <button
                    type="button"
                    onClick={() => setSaUnterlagenOffen((vorher) => ({ ...vorher, [`${inv.id}:bank`]: !vorher[`${inv.id}:bank`] }))}
                    className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60"
                    aria-expanded={!!saUnterlagenOffen[`${inv.id}:bank`]}
                  >
                    {saUnterlagenOffen[`${inv.id}:bank`]
                      ? <><ChevronUp className="h-3.5 w-3.5" /> Unterlagen wieder einklappen</>
                      : <><ChevronDown className="h-3.5 w-3.5" /> Unterlagen anzeigen, werden nicht gebraucht</>}
                  </button>
                )}
                <div hidden={saEntfaellt && !saUnterlagenOffen[`${inv.id}:bank`]}>
                {/* Ohne eigene Selbstauskunft steht die Liste noch nicht fest.
                    Statt der Liste eines anderen Investments steht hier, warum. */}
                {bankListeOffen && (
                  <Alert className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{OHNE_EIGENE_SA_HINWEIS}</AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground mb-4">
                  <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Fehlt</span>
                  <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-[hsl(var(--warning))] inline-block" /> Prüfung</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[hsl(var(--success))] inline-block" /> Freigegeben</span>
                </p>
                <div className="space-y-3">
                  {dynamicBankDocs.map((doc, i) => {
                    const status: DocStatus = docStatuses[doc.name] || "none";
                    const isCustom = customBankDocsList.some(cd => cd.name === doc.name);
                    const isBankLocked = unterlagenZeileGesperrt({ role: user.role, unterlagenFreigeschaltet, istBasisdokument: false, nurLesend: isReadOnlyDocView });
                    return (
                      <div key={i} className={`border-b pb-3 ${isBankLocked ? "opacity-50" : ""}`}>
                        <div className="flex items-start gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isBankLocked ? "bg-muted" : getDocColor(status)}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{doc.name}{doc.required && <span className="text-destructive ml-0.5">*</span>}</span>
                              {isCustom && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary">Manuell</span>}
                              <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                status === "approved" ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                                : status === "uploaded" ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
                                : "bg-destructive/10 text-destructive"
                              }`}>{getDocLabel(status)}</span>
                            </div>
                            <div className="kundenprofil-dokaktionen flex gap-2 mt-1.5 flex-wrap">
                              {isReadOnlyDocView ? (
                                /* Finanzierer: nur Ansehen/Download */
                                (status === "uploaded" || status === "approved") ? (
                                  <>
                                    <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                    <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => openDocFile(doc.name)}><Download className="h-3 w-3" /> Download</button>
                                  </>
                                ) : status === "none" ? (
                                  <span className="text-xs text-muted-foreground">Noch nicht hochgeladen</span>
                                ) : null
                              ) : (!unterlagenFreigeschaltet) ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Wird nach Vollfreigabe freigeschaltet</span>
                              ) : (
                                <>
                                   {status === "none" && <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}><Upload className="h-3 w-3" /> Hochladen</button>}
                                   {status === "uploaded" && (
                                     <>
                                       <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                       <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                       {isBackofficeOrAdmin && <button className="text-xs uppercase tracking-wide hover:underline" style={{ color: "hsl(var(--alert-green))" }} onClick={() => { updateDocStatusForInv(doc.name, "approved"); toast({ title: "Freigegeben ✓", description: doc.name }); }}>Freigeben</button>}
                                       {isBackofficeOrAdmin && <button className="text-xs text-destructive hover:underline uppercase tracking-wide" onClick={() => { setRejectDialog({ invId: inv.id, docName: doc.name }); setRejectReason(""); }}>Ablehnen</button>}
                                       {isAdminOrInhaber && <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: false })} />}
                                     </>
                                   )}
                                    {status === "approved" && (
                                      <>
                                        <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                        <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                        {isAdminOrInhaber && <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: true })} />}
                                      </>
                                    )}
                                  {status === "rejected" && (
                                    <>
                                      <span className="text-xs text-destructive">Grund: {getDocRejectReasons(inv.id)[doc.name] || "–"}</span>
                                      <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}>
                                        <Upload className="h-3 w-3" /> Erneut hochladen
                                      </button>
                                    </>
                                  )}
                                  {isCustom && isBackofficeOrAdmin && status === "none" && (
                                    <button className="text-xs text-destructive hover:underline uppercase tracking-wide" onClick={() => { removeCustomBankDoc(id || "", customBankDocsList.find(cd => cd.name === doc.name)!.id); forceUpdate(n => n + 1); }}>Entfernen</button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Custom bank doc input for VP/Admin */}
                {unterlagenFreigeschaltet && (isBackofficeOrAdmin || canFillSA) && (() => {
                  const handleAddCustomDoc = () => {
                    const input = document.getElementById("custom-bank-doc-input") as HTMLInputElement;
                    if (!input?.value?.trim()) {
                      toast({ title: "Bitte Titel eingeben", description: "Gib einen Namen für die Unterlage ein.", variant: "destructive" });
                      return;
                    }
                    addCustomBankDoc(id || "", input.value.trim(), user.name || "VP");
                    input.value = "";
                    toast({ title: "Unterlage hinzugefügt ✓" });
                    forceUpdate(n => n + 1);
                  };
                  return (
                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        id="custom-bank-doc-input"
                        placeholder="Zusätzliche Unterlage hinzufügen…"
                        className="flex-1 text-sm h-8"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddCustomDoc();
                        }}
                      />
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleAddCustomDoc}>
                        <Plus className="h-3 w-3 mr-1" /> Hinzufügen
                      </Button>
                    </div>
                  );
                })()}
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex gap-0.5 flex-1">
                    {dynamicBankDocs.map((doc, i) => {
                      const st: DocStatus = docStatuses[doc.name] || "none";
                      const barColor = st === "approved" ? "bg-alert-green" : st === "uploaded" ? "bg-alert-orange" : "bg-alert-red";
                      return <div key={i} className={`h-2 flex-1 rounded-sm ${barColor}`} />;
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground">{bankDone}/{dynamicBankDocs.length}</span>
                </div>
                </div>
              </Card>
            </div>

            {/* Pflichtfelder Hinweis + Prüfungsstatus – EINE Card.

                Beim Selbstfinanzierer wird der Kasten gar nicht erst gebaut.
                Er sagt nur, welche Dokumente Pflicht sind und wer sie freigeben
                muss, und beides ist gegenstandslos, wenn Bonitätscheck und
                Bankprüfung ohnehin nicht gebraucht werden. */}
            {!saEntfaellt && (() => {
              const reviewResultSentAt = (inv as any).reviewResultSentAt;
              if (reviewResultSentAt) {
                const sentDate = new Date(reviewResultSentAt);
                return (
                  <Card className="p-5 border-2 border-[hsl(var(--alert-green))]/30 bg-[hsl(var(--alert-green))]/5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "hsl(var(--alert-green))" }} />
                      <div>
                        <p className="text-sm"><span className="text-destructive font-bold">*</span> = Pflichtdokument.</p>
                        <p className="font-bold text-base mt-1">Alle Unterlagen wurden freigegeben und an den Kunden bestätigt</p>
                        <p className="text-sm text-muted-foreground">
                          am {sentDate.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} um {sentDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              }
              /*
               * Zum Abschluss zählen nur Pflichtzeilen und die von Hand
               * ergänzten Unterlagen (zaehltFuerAbschluss). Freiwillige Zeilen
               * wie die Schufa oder eine Altzeile, die nach der aktuellen
               * Selbstauskunft nicht mehr verlangt wird, halten weder „Ergebnis
               * senden" noch „alle freigegeben" auf. Vorher musste jede Zeile
               * geprüft sein, auch eine nie hochgeladene freiwillige.
               */
              const vonHandErgaenzt = new Set(customBankDocsList.map(cd => cd.name));
              const bonitaetZumAbschluss = bonitaetDocsInv.filter(d => zaehltFuerAbschluss(d, vonHandErgaenzt));
              const bankZumAbschluss = dynamicBankDocs.filter(d => zaehltFuerAbschluss(d, vonHandErgaenzt));
              const allBonitaetReviewed = bonitaetZumAbschluss.every(d => {
                const s = d.name === "Selbstauskunft" ? (saAutoApproved ? "approved" : "none") : (docStatuses[d.name] || "none");
                return s === "approved" || s === "rejected";
              });
              const allBankReviewed = bankZumAbschluss.every(d => {
                const s = docStatuses[d.name] || "none";
                return s === "approved" || s === "rejected";
              });
              const allFullyApproved = bonitaetZumAbschluss.every(d => {
                if (d.name === "Selbstauskunft") return saAutoApproved || (!saNeuAusstehend && docStatuses["Selbstauskunft"] === "approved");
                return docStatuses[d.name] === "approved";
              }) && bankZumAbschluss.every(d => docStatuses[d.name] === "approved");
              const allReviewed = allBonitaetReviewed && allBankReviewed;
              const totalDocs = bonitaetZumAbschluss.length + bankZumAbschluss.length;
              const reviewedCount = [...bonitaetZumAbschluss, ...bankZumAbschluss].filter(d => {
                const s = d.name === "Selbstauskunft" ? (saAutoApproved ? "approved" : "none") : (docStatuses[d.name] || "none");
                return s === "approved" || s === "rejected";
              }).length;
              return (
                <Card className={cn("p-5 border-2 transition-all", allDocsApproved ? "border-[hsl(var(--alert-green))]/50 bg-[hsl(var(--alert-green))]/5" : "border-primary/50 bg-primary/5")}>
                  <p className="text-sm">
                    <span className="text-destructive font-bold">*</span> = Pflichtdokument.
                    {!allDocsApproved && <span className="ml-2 text-muted-foreground">Sind alle Pflichtdokumente freigegeben, rückt der Vorgang auf Finanzierung und der Kunde sieht die Finanzierung im Kundenportal.</span>}
                  </p>
                  {isBackofficeOrAdmin && (
                    <div className="mt-3">
                      {!allReviewed && reviewedCount > 0 && (
                        <p className="text-sm text-muted-foreground mb-2">
                          Bitte alle {totalDocs} Dokumente einzeln freigeben oder ablehnen. ({reviewedCount}/{totalDocs} geprüft)
                        </p>
                      )}
                      {allReviewed && allFullyApproved && (
                        <p className="text-sm mb-2" style={{ color: "hsl(var(--alert-green))" }}>
                          ✓ Alle Dokumente freigegeben – Ergebnis kann jetzt an den Kunden gesendet werden.
                        </p>
                      )}
                      {allReviewed && !allFullyApproved && (
                        <>
                          <p className="text-sm text-destructive mb-2">
                            ⚠ Einige Dokumente wurden abgelehnt – Ergebnis kann jetzt an den Kunden gesendet werden, mit der Bitte die abgelehnten erneut hochzuladen.
                          </p>
                          <Button className="gap-2 animate-pulse shadow-lg shadow-destructive/50 ring-2 ring-destructive/40 ring-offset-2 hover:animate-none" variant="destructive" onClick={() => setReviewDialog({ invId: inv.id, section: "bonitaet" })}>
                            <Send className="h-4 w-4" /> Ergebnis an Kunden senden
                          </Button>
                        </>
                      )}
                      {allReviewed && allFullyApproved && !allDocsApproved && (
                        <Button className="gap-2 animate-pulse shadow-lg shadow-[hsl(var(--alert-green))]/50 ring-2 ring-[hsl(var(--alert-green))]/50 ring-offset-2 hover:animate-none" onClick={() => setReviewDialog({ invId: inv.id, section: "bonitaet" })}>
                          <Send className="h-4 w-4" /> Ergebnis an Kunden senden
                        </Button>
                      )}
                      {allDocsApproved && (
                        <Button className="gap-2" onClick={() => setReviewDialog({ invId: inv.id, section: "bonitaet" })}>
                          <Send className="h-4 w-4" /> Ergebnis nochmal senden
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })()}
            {/* Christian, 05.10.2026: gehört zu den Bonitätsunterlagen, nicht zur Objektauswahl. */}
            {saEntfaelltSchalter}
              </div>
              </KundenprofilAbschnitt>
            </Card>

            {/* ── Person 2 Bonitätscheck/Bankprüfung ──
                Bleibt ein eigener Abschnitt neben der gemeinsamen Karte: Er hat
                eine eigene Überschrift und ein eigenes Raster, und bei einem
                Kunden ohne zweite Person entstünde sonst ein leerer Kasten. */}
            {kunde.person2 && (
              <>
                <h3 className="font-bold text-lg mt-6 text-primary">Bonitätsunterlagen – Person 2: {kunde.person2.vorname} {kunde.person2.nachname}</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Person 2 Bonitätscheck */}
                  <Card className="p-6">
                    <div className="w-8 h-1 bg-primary mb-3" />
                    <h3 className="font-bold mb-4">Bonitätscheck – Person 2</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Fehlt</span>
                      <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-[hsl(var(--warning))] inline-block" /> Prüfung</span>
                      <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[hsl(var(--success))] inline-block" /> Freigegeben</span>
                    </p>
                    <div className="space-y-3">
                      {bonitaetP2DocsInv.map((doc, i) => {
                        const status: DocStatus = docStatuses[doc.name] || "none";
                        // Stage 1: nur Personalausweis + Letzter Gehaltsnachweis sind initial offen, Rest gesperrt bis Vollfreigabe
                        const isBasicDoc = doc.name === "Personalausweis Person 2" || doc.name === "Letzter Gehaltsnachweis Person 2";
                        const isDocLocked = unterlagenZeileGesperrt({ role: user.role, unterlagenFreigeschaltet, istBasisdokument: isBasicDoc, nurLesend: isReadOnlyDocView });
                        return (
                          <div key={i} className={`border-b pb-3 ${isDocLocked ? "opacity-50" : ""}`}>
                            <div className="flex items-start gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isDocLocked ? "bg-muted" : getDocColor(status)}`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{doc.name}{doc.required && <span className="text-destructive ml-0.5">*</span>}</span>
                                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                    status === "approved" ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                                    : status === "uploaded" ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
                                    : "bg-destructive/10 text-destructive"
                                  }`}>{getDocLabel(status)}</span>
                                </div>
                                <div className="kundenprofil-dokaktionen flex gap-2 mt-1.5 flex-wrap">
                                  {isDocLocked ? (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Wird nach Vollfreigabe freigeschaltet</span>
                                  ) : (<>
                                  {status === "none" && <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}><Upload className="h-3 w-3" /> Hochladen</button>}
                                   {status === "uploaded" && (
                                     <>
                                       <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                       <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                       {isBackofficeOrAdmin && <button className="text-xs uppercase tracking-wide hover:underline" style={{ color: "hsl(var(--alert-green))" }} onClick={() => { updateDocStatusForInv(doc.name, "approved"); toast({ title: "Freigegeben ✓", description: doc.name }); }}>Freigeben</button>}
                                       {isBackofficeOrAdmin && <button className="text-xs text-destructive hover:underline uppercase tracking-wide" onClick={() => { setRejectDialog({ invId: inv.id, docName: doc.name }); setRejectReason(""); }}>Ablehnen</button>}
                                       {isAdminOrInhaber && <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: false })} />}
                                     </>
                                   )}
                                    {status === "approved" && (
                                      <>
                                        <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                        <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                        {isAdminOrInhaber && <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: true })} />}
                                      </>
                                    )}
                                  {status === "rejected" && (
                                    <>
                                      <span className="text-xs text-destructive">Grund: {getDocRejectReasons(inv.id)[doc.name] || "–"}</span>
                                      <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}>
                                        <Upload className="h-3 w-3" /> Erneut hochladen
                                      </button>
                                    </>
                                  )}
                                  </>)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex gap-0.5 flex-1">
                        {bonitaetP2DocsInv.map((doc, i) => {
                          const st: DocStatus = docStatuses[doc.name] || "none";
                          const barColor = st === "approved" ? "bg-alert-green" : st === "uploaded" ? "bg-alert-orange" : "bg-alert-red";
                          return <div key={i} className={`h-2 flex-1 rounded-sm ${barColor}`} />;
                        })}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {bonitaetP2DocsInv.filter(d => (docStatuses[d.name] || "none") !== "none").length}/{bonitaetP2DocsInv.length}
                      </span>
                    </div>
                  </Card>

                  {/* Person 2 Bankprüfung */}
                  <Card className="p-6">
                    <div className="w-8 h-1 bg-primary mb-3" />
                    <h3 className="font-bold mb-4">Bankprüfung – Person 2</h3>
                    {bankListeOffen && (
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">{OHNE_EIGENE_SA_HINWEIS}</AlertDescription>
                      </Alert>
                    )}
                    <p className="text-xs text-muted-foreground mb-4">
                      <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Fehlt</span>
                      <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-[hsl(var(--warning))] inline-block" /> Prüfung</span>
                      <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[hsl(var(--success))] inline-block" /> Freigegeben</span>
                    </p>
                    <div className="space-y-3">
                      {dynamicBankP2Docs.map((doc, i) => {
                        const status: DocStatus = docStatuses[doc.name] || "none";
                        const isBankLocked = unterlagenZeileGesperrt({ role: user.role, unterlagenFreigeschaltet, istBasisdokument: false, nurLesend: isReadOnlyDocView });
                        return (
                          <div key={i} className={`border-b pb-3 ${isBankLocked ? "opacity-50" : ""}`}>
                            <div className="flex items-start gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isBankLocked ? "bg-muted" : getDocColor(status)}`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{doc.name}{doc.required && <span className="text-destructive ml-0.5">*</span>}</span>
                                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                    status === "approved" ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                                    : status === "uploaded" ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
                                    : "bg-destructive/10 text-destructive"
                                  }`}>{getDocLabel(status)}</span>
                                </div>
                                <div className="kundenprofil-dokaktionen flex gap-2 mt-1.5 flex-wrap">
                                  {isBankLocked ? (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Wird nach Vollfreigabe freigeschaltet</span>
                                  ) : (<>
                                  {status === "none" && <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}><Upload className="h-3 w-3" /> Hochladen</button>}
                                  {status === "uploaded" && (
                                    <>
                                      <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                      <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                      {isBackofficeOrAdmin && <button className="text-xs uppercase tracking-wide hover:underline" style={{ color: "hsl(var(--alert-green))" }} onClick={() => { updateDocStatusForInv(doc.name, "approved"); toast({ title: "Freigegeben ✓", description: doc.name }); }}>Freigeben</button>}
                                      {isBackofficeOrAdmin && <button className="text-xs text-destructive hover:underline uppercase tracking-wide" onClick={() => { setRejectDialog({ invId: inv.id, docName: doc.name }); setRejectReason(""); }}>Ablehnen</button>}
                                    </>
                                  )}
                                   {status === "approved" && (
                                     <>
                                       <button className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide" onClick={() => openDocFile(doc.name)}>Datei anzeigen</button>
                                       <DokumentSymbolKnopf art="bearbeiten" titel="Bearbeiten" onClick={() => handleFileUpload(doc.name, true)} />
                                       {isAdminOrInhaber && <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: true })} />}
                                     </>
                                   )}
                                   {(status === "uploaded") && isAdminOrInhaber && (
                                     <DokumentSymbolKnopf art="loeschen" titel="Löschen" onClick={() => setDeleteDocDialog({ invId: inv.id, docName: doc.name, wasApproved: false })} />
                                   )}
                                  {status === "rejected" && (
                                    <>
                                      <span className="text-xs text-destructive">Grund: {getDocRejectReasons(inv.id)[doc.name] || "–"}</span>
                                      <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={() => handleFileUpload(doc.name)}>
                                        <Upload className="h-3 w-3" /> Erneut hochladen
                                      </button>
                                    </>
                                  )}
                                  </>)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex gap-0.5 flex-1">
                        {dynamicBankP2Docs.map((doc, i) => {
                          const st: DocStatus = docStatuses[doc.name] || "none";
                          const barColor = st === "approved" ? "bg-alert-green" : st === "uploaded" ? "bg-alert-orange" : "bg-alert-red";
                          return <div key={i} className={`h-2 flex-1 rounded-sm ${barColor}`} />;
                        })}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {dynamicBankP2Docs.filter(d => (docStatuses[d.name] || "none") !== "none").length}/{dynamicBankP2Docs.length}
                      </span>
                    </div>
                  </Card>
                </div>
              </>
            )}

            </div>

          </>
        )}

        {/*
          Ab hier ein einziges durchgehendes Raster: Objektauswahl,
          Reservierung, Finanzierung, Notar, Abwicklung, Kundenordner stehen
          zu zweit nebeneinander, in genau dieser Reihenfolge.

          Vorher waren es drei getrennte Raster, und die Objektauswahl stand
          allein davor. Dadurch blieb neben dem Kundenordner eine leere Zelle
          stehen, und die Paare waren um eine Stelle verschoben.

          Der Vorteil des einen Rasters: Faellt eine Karte weg, weil der
          Vorgang noch nicht so weit ist, rueckt die naechste von selbst nach.
          Deshalb ist der Platzhalter neben dem Notar jetzt `null` und nicht
          mehr ein leeres `div`, das seine Zelle belegt haette.
        */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/*
            Die Objektauswahl steht seit dem 16.09.2026 IMMER an dieser Stelle.

            Vorher hing sie an `!isPreSA` und wurde ohne abgeschlossene
            Selbstauskunft gar nicht erst gebaut. Die Reservierung prüfte
            etwas anderes und erschien trotzdem. Zwischen Selbstauskunft und
            Reservierung klaffte damit eine Lücke, und der Schritt sah aus wie
            verschwunden.

            Jetzt steht sie gesperrt da und sagt, woran es liegt. Die gesperrte
            Fassung belegt genau eine Rasterzelle, damit die Paare darunter
            (Reservierung, Finanzierung, Notar …) nicht verrutschen.
          */}
          {!objektauswahlFrei ? (
            <div id={`card-objektauswahl-${inv.id}`} data-section="objektauswahl" data-investment={inv.id}>
              <LockedPhaseCard
                title="Objektauswahl"
                reason="Wird nach der unterschriebenen Selbstauskunft des Kunden freigeschaltet."
              >
                {/*
                  Eine bereits gespeicherte Berechnung wird auch hier gezeigt.

                  Gemeldet von Christian am 21.09.2026: Ohne ausgefuellte
                  Selbstauskunft stand unter "Berechnungen" trotzdem "noch
                  keine Berechnung gespeichert", obwohl eine am Investment
                  hing. Grund war, dass der ganze Abschnitt in der Karte
                  darunter steckt und mit ihr verschwand. Sichtbar wurde die
                  Berechnung erst, nachdem der Schalter "Kunde finanziert
                  selbst" einmal an und wieder aus war: Das hob den Vorgang auf
                  die Stufe "Objektauswahl", und die haelt die Karte offen.

                  Gesperrt bleibt gesperrt: `darfPflegen` ist hier aus, es gibt
                  also weder "Neue Berechnung" noch Loeschen. Und ohne
                  gespeicherte Berechnung zeichnet der Abschnitt gar nichts,
                  damit die gesperrte Karte nicht um eine leere Ueberschrift
                  waechst.
                */}
                <InvestmentBerechnungen
                  investmentId={inv.id}
                  darfPflegen={false}
                  nurWennVorhanden
                  onNavigate={navigate}
                />
                {/* Gesendete Exposés auch vor der Freischaltung: gesendet wird oft schon vorher. */}
                <GesendeteExposes kontaktId={kunde.id} investmentId={inv.id} kundeName={[kunde.vorname, kunde.nachname].filter(Boolean).join(" ")} />
              </LockedPhaseCard>
            </div>
          ) : (
            <>
            {/* Freie Wohnungen */}
            {(() => {
              /*
               * Die Finanzierbarkeits-Karte stand bis jetzt hier neben den
               * freien Wohnungen. Sie ist in den Block "Finanzielle Situation
               * & Ziele" gezogen (renderFinanzblock), wo die uebrigen Zahlen
               * derselben Rechnung stehen.
               *
               * Hier bleiben die Rahmenwerte, weil die Wohnungsliste sie zum
               * Filtern braucht. Die Objektauswahl steht seitdem allein und
               * bekommt deshalb die volle Breite.
               *
               * Auch hier gilt die strenge Regel: nur die eigene
               * Selbstauskunft dieses Investments. Ohne sie stehen die Werte
               * auf null, und die Karte nennt dann gar keinen Bonitaetsrahmen,
               * statt den eines anderen Vorgangs zu zeigen.
               */
              const invRow = cacheGet("investments")?.find((r: any) => r.id === inv.id);
              const sd = eigeneSaDataFuerInvestmentRow(invRow) as any;
              const saFin = sd ? calculateFinanzierbarkeitFromSaData(sd) : null;
              const effMinRahmen = saFin?.minRahmen || 0;
              const effMaxRahmen = saFin?.maxRahmen || 0;
              return (
                <div id={`card-objektauswahl-${inv.id}`} data-section="objektauswahl" data-investment={inv.id} className="grid grid-cols-1 gap-6 transition-all duration-500 rounded-lg">
                  <FreieWohnungenCard
                    kunde={kunde}
                    inv={inv}
                    minRahmen={effMinRahmen}
                    maxRahmen={effMaxRahmen}
                    allDocsApproved={docStatuses["Personalausweis"] === "approved" && docStatuses["Letzter Gehaltsnachweis"] === "approved"}
                    canSwitchObjekt={canSwitchObjekt}
                    canSwitchObjektDirect={canSwitchObjektDirect}
                    userRole={user.role}
                    userName={user.name}
                    /*
                     * Die Rückfrage gilt jetzt für alle Rollen.
                     *
                     * Vorher wechselte ein Admin, Inhaber oder Objektpartner
                     * ohne jede Frage, und dieser Klick hebt die Reservierung
                     * auf und löscht die unterschriebene Vereinbarung. Genau
                     * die Rollen, die am meisten dürfen, bekamen die Warnung
                     * nicht zu sehen.
                     */
                    onSwitchObjekt={(objektId, wohnungId) => {
                      setSwitchObjektDialog({ invId: inv.id, objektId, wohnungId });
                    }}
                    onCancelReservation={(objektId, wohnungId) => handleCancelReservation(inv.id, { objektId, wohnungId })}
                    onNavigate={navigate}
                    /* Jedes gesendete Exposé dieses Investments (Mail oder kopierter Link),
                       seit dem 05.10.2026 einklappbar unter dem Terminknopf statt als eigener Kasten. */
                    gesendeteLinks={<GesendeteExposes kontaktId={kunde.id} investmentId={inv.id} kundeName={[kunde.vorname, kunde.nachname].filter(Boolean).join(" ")} />}
                    onObjektGespeichert={() => {
                      // Stufe und Objektdaten haben sich geaendert, beides
                      // haengt am Investment. Ohne Nachladen zeigt die Karte
                      // weiter den alten Stand.
                      setInvestments(getInvestmentsByKontakt(id || ""));
                      reloadKunde();
                      forceUpdate((n) => n + 1);
                      toast({ title: "Objektdaten gespeichert ✓" });
                    }}
                  />
                </div>
              );
            })()}
            </>
          )}

        {/* ── Abwicklung: Reservierung + Finanzierung ── */}
        {/*
          Die Reservierung hängt seit dem 16.09.2026 am Objekt, nicht mehr an
          der Selbstauskunft. Ohne eingetragenes Objekt gibt es nichts zu
          reservieren, und vorher konnte die Karte erscheinen, während die
          Objektauswahl darüber noch gar nicht gebaut wurde.

          Was ein gesetztes Objekt ist, entscheidet `objektDatenFehlen` aus
          `objektDatenPflicht.ts`: Straße, Ort, Wohneinheit und Kaufpreis. Das
          ist dieselbe Quelle, die weiter unten schon `objektFuerRvSteht`
          benutzt, und die einzige verlässliche: `inv.objektId` zeigt auf eine
          Wohnung aus dem eigenen Bestand, und den gibt es zurzeit nicht
          (BESTANDSWOHNUNG_AKTIV ist aus). Er bleibt trotzdem als Rückfall für
          Altvorgänge stehen, an denen eine Bestandswohnung hängt, deren
          Angaben am Investment nie abgeschrieben wurden.

          Die Blanko-Reservierung für Investagon-Vorgänge ohne Objekt ist seit
          dem 29.09.2026 abgeschaltet (Entscheidung Christian): Ohne
          eingetragenes Objekt gibt es auch für sie keine Reservierung.
        */}
        {reservierungOffen({
          objektGesetzt: !!inv.objektId || !objektDatenFehlen(inv.id),
          stufeAbReservierung: stufeErreicht(inv.pipelineStufe, "reservierung"),
        }) ? (
          <>
            <Card id={`card-reservierung-${inv.id}`} className="p-6 transition-all duration-500">
              <div className="w-8 h-1 bg-primary mb-3" />
              <KundenprofilAbschnitt
                kopf={<h3 className="font-bold mb-4">Reservierung</h3>}
              >
              {(() => {
                const rvPdfFilename = getInvestmentRvPdf(inv.id);
                const rvSignPending = getRvSignaturePending(inv.id);
                const rvSigned = getRvSigned(inv.id);
                const rvSentAt = getRvSignatureSentAt(inv.id);
                const rvEditApproved = getRvEditApproved(inv.id);
                /*
                 * Darf hier reserviert werden?
                 *
                 * Dieselbe Frage wie bei der Sichtbarkeit der Karte, nur ohne
                 * den Zweig „Stufe steht schon auf Reservierung". Der bleibt
                 * absichtlich draußen: Ein Altvorgang, den jemand von Hand
                 * dorthin gesetzt hat, ohne dass ein Objekt am Investment
                 * steht, soll die Karte zwar sehen, aber den Hinweis lesen,
                 * was noch fehlt, statt eine Vereinbarung ohne Objekt zu
                 * öffnen.
                 */
                const canReserve = !!inv.objektId || !objektDatenFehlen(inv.id);
                /*
                 * Dazu die Selbstauskunft, mit derselben Regel, die
                 * `send-reservation-signature` erzwingt (29.09.2026). Nach einer
                 * Korrektur bleibt der Knopf verborgen, bis neu unterschrieben
                 * ist, auch wenn die Stufe längst erreicht ist.
                 */
                const saFuerRv = darfReservierungStarten(inv.id);
                // Find the gesetzt wohnung for this investment
                const allObjForRv = getObjekte().filter(o => o.sichtbar);
                let rvWohnung: any = null;
                let rvObjekt: any = null;
                if (inv.wohnungId) {
                  for (const obj of allObjForRv) {
                    const w = obj.wohnungen.find(w => w.id === inv.wohnungId);
                    if (w) { rvWohnung = w; rvObjekt = obj; break; }
                  }
                }
                if (!rvWohnung) {
                  for (const obj of allObjForRv) {
                    const w = obj.wohnungen.find(w => w.kundeId === kunde.id && w.status === "reserviert");
                    if (w) { rvWohnung = w; rvObjekt = obj; break; }
                  }
                }
                const isReserviert = rvWohnung && rvWohnung.status === "reserviert";
                /*
                 * „Reservierung aufheben“ (05.10.2026). Freigegeben wird nur,
                 * was an diesem Investment hängt: die Einheit aus
                 * `inv.wohnungId`, nicht der Namensrückfall darüber (der
                 * könnte die Einheit eines zweiten Investments treffen), oder
                 * das Haus, wenn es genau für diesen Kunden reserviert ist.
                 */
                const hausObjekt = !inv.wohnungId && inv.objektId ? getObjektById(inv.objektId) : null;
                const hausFuerKunde = !!hausObjekt?.globalObjekt && hausObjekt.belegung === "reserviert" && hausObjekt.belegungKundeId === kunde.id;
                const einheitFuerKunde = !!inv.wohnungId && !!rvWohnung && rvWohnung.id === inv.wohnungId && rvWohnung.kundeId === kunde.id;
                const aufhebenRecht = reservierungAufhebenRecht({
                  rolle: user.role,
                  eigenerKunde: darfKundeBearbeiten,
                  mitEinheit: !!inv.wohnungId,
                  mitHaus: hausFuerKunde,
                });
                const zeigtAufheben = reservierungBesteht({
                  rvSigned, rvSignaturePending: rvSignPending, rvPdf: rvPdfFilename, einheitReserviert: einheitFuerKunde || hausFuerKunde,
                });
                const aufhebenZeile = !zeigtAufheben ? null : aufhebenRecht.sichtbar ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="text-xs text-muted-foreground min-w-0 flex-1 basis-56">
                      Einheit freigeben und Vereinbarung aufheben. Eine unterschriebene Fassung bleibt archiviert im Kundenordner, danach ist eine neue Reservierung möglich.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 border-destructive text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => handleCancelReservation(inv.id, {
                        objektId: inv.objektId || rvObjekt?.id,
                        wohnungId: inv.wohnungId || undefined,
                        hausFreigeben: hausFuerKunde,
                      })}
                    >
                      <XCircle className="h-3 w-3 mr-1" /> Reservierung aufheben
                    </Button>
                  </div>
                ) : aufhebenRecht.hinweis ? (
                  <p className="text-xs text-muted-foreground">{aufhebenRecht.hinweis}</p>
                ) : null;
                /*
                 * Steht fest, worum es in der Reservierung geht?
                 *
                 * Zwei Quellen, dieselbe Frage: eine reservierte Wohnung aus
                 * dem eigenen Bestand oder die Objektdaten am Investment. Die
                 * zweite ist heute die einzige, die überhaupt vorkommt, und
                 * sie entscheidet nur über den Hinweistext, nicht über den
                 * Knopf. Eine Reservierungsvereinbarung darf auch ohne
                 * eingetragenes Objekt angelegt werden, dann eben mit leeren
                 * Objektfeldern.
                 */
                const objektFuerRvSteht = !!isReserviert || !objektDatenFehlen(inv.id);

                /*
                 * Die Adresse der Reservierungsvereinbarung, nur mit Kennungen.
                 *
                 * Bis zum 16.09.2026 reisten hier Name, Mailadresse,
                 * Telefonnummer, Anschrift und Geburtsdatum des Kunden im
                 * Klartext mit, dazu Objekt, Wohneinheit, Kaufpreis, Miete und
                 * die Anschrift des Verkäufers. Aufgefallen ist das an einem
                 * echten Fehlerticket an diesem Tag: Die volle Adresse stand
                 * darin und war damit für jeden lesbar, der das Ticket öffnet.
                 * Solche Adressen landen außerdem im Browserverlauf, in
                 * Lesezeichen, in Serverprotokollen und in den
                 * Weiterleitungs-Kopfzeilen fremder Seiten.
                 *
                 * Nötig war davon nichts: Die Reservierungsseite schlägt alles
                 * selbst nach, den Kunden über `kunde` und die Objektangaben
                 * über `investmentId`. Sie wartet dafür, bis der
                 * Zwischenspeicher steht.
                 */
                const buildRvParams = () => {
                  const params = new URLSearchParams({ kunde: id || "" });
                  /*
                   * Der Weg zurück, für die Reservierungsseite.
                   *
                   * Sie geht seit 09/2026 im selben Reiter auf, es gibt also
                   * keinen zweiten Reiter mehr zum Zuklappen. Damit der
                   * Zurückknopf dort nicht auf einer festen Seite landet,
                   * reist die Adresse dieses Kundenprofils mit.
                   *
                   * Mitsamt Fragezeichenteil, denn Reiter und gewähltes
                   * Investment stehen in `?tab=` und `?investment=`. Ohne sie
                   * käme man auf dem Standardreiter heraus und müsste den
                   * Vorgang erneut suchen. Gelesen wird aus `window.location`,
                   * weil die beiden Parameter über `history.replaceState`
                   * gesetzt werden.
                   */
                  const zurueckAdresse = id && window.location.pathname.includes(id)
                    ? window.location.pathname + window.location.search
                    : (id ? `/kunden/${id}` : "");
                  if (zurueckAdresse) params.set("zurueck", zurueckAdresse);
                  if (inv.id) params.set("investmentId", inv.id);
                  if (rvWohnung?.id) params.set("wohnungId", rvWohnung.id);
                  if (rvObjekt?.id) params.set("objektId", rvObjekt.id);
                  return params;
                };

                /*
                 * Reservierungsvereinbarung erneut zusenden.
                 *
                 * Seit dem 16.09.2026 gilt der Link vierzehn Tage. Läuft er ab,
                 * ist genau dieser Weg der Ersatz: ein Klick, ein neuer Link,
                 * wieder volle Frist. Die alten offenen Anfragen räumt die
                 * Function selbst ab, deshalb steht hier kein Löschbefehl mehr;
                 * so gilt dasselbe auch für den Versand aus dem Formular.
                 *
                 * Die Rückfrage steht am Knopf, nicht hier.
                 */
                const resendRvSignature = async () => {
                  const invRow = cacheGet("investments").find((r: any) => r.id === inv.id);
                  const rvData = invRow?.meta?.rvData;
                  if (!rvData) {
                    toast({ title: "Fehler", description: "Keine Reservierungsdaten vorhanden.", variant: "destructive" });
                    return;
                  }

                  /*
                   * Beide Käufer, nicht nur der erste.
                   *
                   * Vorher ging der erneute Versand allein an Käufer 1. Bei
                   * einem Paar blieb Käufer 2 damit auf dem alten Link sitzen,
                   * und der ist seit der neuen Frist irgendwann tot.
                   */
                  const personen = [
                    { name: `${kunde.vorname} ${kunde.nachname}`, personType: "kaeufer1" },
                    ...(rvData.hatPerson2 && rvData.p2Email
                      ? [{ name: `${rvData.p2Vorname || ""} ${rvData.p2Nachname || ""}`.trim(), personType: "kaeufer2" }]
                      : []),
                  ];

                  const ergebnis = await signaturErneutSenden({
                    art: "reservierung",
                    kontaktId: id || "",
                    investmentId: inv.id,
                    daten: rvData,
                    personen,
                  });

                  if (ergebnis.art !== "ok") {
                    /*
                     * Kein Erfolgston ohne Versand, und der Grund steht dabei.
                     * Vorher hieß es hier pauschal "Internetverbindung prüfen",
                     * auch wenn die Anmeldung fehlte oder die Berechtigung.
                     */
                    toast({
                      title: "Reservierung wurde nicht gesendet",
                      description: `${ergebnis.text} Bitte den Grund weitergeben, wenn er sich nicht von selbst erklärt.`,
                      variant: "destructive",
                    });
                    return;
                  }

                  setRvSignatureSentAt(inv.id, new Date().toISOString());
                  reloadKunde();
                  setRvResent(true);
                  setTimeout(() => setRvResent(false), 5000);
                  toast({
                    title: "Neuer Link versendet ✓",
                    description: `Die Reservierungsvereinbarung ging erneut zur Unterschrift raus. Der neue Link gilt ${SIGNATUR_FRIST_TEXT}.`,
                  });
                };

                return (
                  <div className="space-y-4">
                    {/* Portal hint */}
                    <div className="border rounded-lg p-3 border-primary/30 bg-primary/5">
                      <p className="text-xs text-muted-foreground">
                        ℹ️ Sobald die Reservierungsvereinbarung als PDF abgelegt ist, wird sie dem Kunden automatisch im <strong>Kundenportal</strong> angezeigt.
                      </p>
                    </div>
                    {aufhebenZeile}
                    {/* ── Signed PDF available ── */}
                    {(rvPdfFilename && rvSigned) ? (
                      <div>
                        <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                          <div className="bg-destructive/10 text-destructive font-bold text-xs px-2 py-1 rounded">PDF</div>
                          <div className="min-w-0 flex-1 basis-48 break-words">
                            <span className="text-sm font-semibold">{`Reservierung (${kunde?.vorname || ""} ${kunde?.nachname || ""})`}</span>
                            <p className="text-xs text-muted-foreground">Unterzeichnete Reservierungsvereinbarung</p>
                            {/* Wahl "Widerrufsfrist abwarten": bis zu diesem Tag ist die Wohnung nicht reserviert. */}
                            {(() => {
                              const rvMeta = (cacheGet("investments").find((r: any) => r.id === inv.id)?.meta || {}) as Record<string, any>;
                              if (rvMeta.rvReservierungEntfallenAm) {
                                return <p className="text-xs text-destructive mt-1">Reservierung entfallen: Wohnung anderweitig reserviert, Gebühr zurückzahlen</p>;
                              }
                              if (rvMeta.rvReservierungAb && !rvMeta.rvReservierungWirksamAm) {
                                return <p className="text-xs text-[hsl(var(--warning))] mt-1">Reservierung wirksam ab {formatDatum(rvMeta.rvReservierungAb)} (Widerrufsfrist), Wohnung bis dahin frei</p>;
                              }
                              return null;
                            })()}
                          </div>
                          <div className="kundenprofil-kartenaktionen ml-auto">
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={async () => {
                              const invRow = cacheGet("investments").find((r: any) => r.id === inv.id);
                              const rvData = invRow?.meta?.rvData;
              if (rvData) {
                                try {
                                  const sigs = invRow?.meta?.rvSignatures;
                                  const pdf = await generateReservierungPDF(rvData, sigs || undefined);
                                  pdf.save(`Reservierung_${kunde.vorname}_${kunde.nachname}.pdf`);
                                } catch (err) {
                                  console.error("RV PDF generation error:", err);
                                  toast({ title: "PDF-Fehler", description: "Das PDF konnte nicht generiert werden.", variant: "destructive" });
                                }
                              } else {
                                toast({ title: "Keine RV-Daten", description: "Die Reservierungsdaten sind nicht verfügbar.", variant: "destructive" });
                              }
                            }}>
                              <Download className="h-3 w-3 mr-1" /> PDF herunterladen
                            </Button>
                            {isBackofficeOrAdmin ? (
                              <Button size="sm" variant="outline" className="text-xs h-7 border-destructive text-destructive hover:bg-destructive/10" onClick={() => {
                                setInvestmentRvPdf(inv.id, "");
                                reloadKunde();
                                toast({ title: "Reservierungs-PDF gelöscht" });
                              }}>
                                <Trash2 className="h-3 w-3 mr-1" /> Löschen
                              </Button>
                            ) : (canReserve && !isFinanzierer) ? (
                              <Button size="sm" variant="outline" className="text-xs h-7 text-muted-foreground" onClick={async () => {
                                const angekommen = await glockeAnAdmins(
                                  `Löschanfrage: Reservierungs-PDF`,
                                  `${user.name} fragt Löschung der Reservierungsvereinbarung für ${kunde.vorname} ${kunde.nachname} an.`,
                                  `/kunden/${id}`,
                                );
                                if (!angekommen) {
                                  toast({ title: "Anfrage nicht angekommen", description: "Bitte melde dich direkt bei Admin oder Inhaber.", variant: "destructive" });
                                  return;
                                }
                                toast({ title: "Löschanfrage gesendet", description: "Der Admin wurde über die Löschanfrage informiert." });
                              }}>
                                <Trash2 className="h-3 w-3 mr-1" /> Löschung anfragen
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {/* Edit / Resend for VP (needs admin approval) */}
                        {canReserve && !isBackofficeOrAdmin && !isFinanzierer && (
                          <div className="kundenprofil-kartenaktionen mt-3">
                            {!rvEditApproved ? (
                              <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                                const angekommen = await glockeAnAdmins(
                                  `Bearbeitungsanfrage: Reservierung`,
                                  `${user.name} möchte die Reservierungsvereinbarung für ${kunde.vorname} ${kunde.nachname} bearbeiten und erneut senden.`,
                                  `/kunden/${id}`,
                                );
                                if (!angekommen) {
                                  toast({ title: "Anfrage nicht angekommen", description: "Bitte melde dich direkt bei Admin oder Inhaber.", variant: "destructive" });
                                  return;
                                }
                                toast({ title: "Anfrage gesendet", description: "Der Admin wurde über die Bearbeitungsanfrage informiert." });
                              }}>
                                <Pencil className="h-3 w-3 mr-1" /> Bearbeitung beim Admin anfragen
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                                setRvEditApproved(inv.id, false);
                                setInvestmentRvPdf(inv.id, "");
                                setRvSignaturePending(inv.id, false);
                                reloadKunde();
                                navigate(`/reservierung?${buildRvParams().toString()}`);
                              }}>
                                <Pencil className="h-3 w-3 mr-1" /> Reservierung bearbeiten & erneut senden
                              </Button>
                            )}
                          </div>
                        )}
                        {/* Admin can approve edit request or directly edit */}
                        {isBackofficeOrAdmin && (
                          <div className="kundenprofil-kartenaktionen mt-3">
                            {!rvEditApproved && (
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                                setRvEditApproved(inv.id, true);
                                reloadKunde();
                                toast({ title: "Bearbeitung freigegeben", description: "Der VP kann die Reservierung jetzt bearbeiten." });
                              }}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Bearbeitung freigeben
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                              /*
                               * Der Hinweis sagt, was wirklich geschieht.
                               *
                               * Vorher stand hier, die bisherige Fassung werde
                               * erst beim erneuten Versenden überschrieben. Das
                               * stimmt nicht: Schon dieser Klick nimmt sie aus
                               * dem Kundenprofil, noch bevor das Formular
                               * aufgeht. Erhalten bleiben allein die
                               * eingetragenen Daten, damit das Formular
                               * vorausgefüllt startet.
                               */
                              const ok = await confirmDialog({
                                title: "Reservierungsvereinbarung jetzt bearbeiten?",
                                description:
                                  `Die unterschriebene Fassung für ${kunde.vorname} ${kunde.nachname} wird sofort aus dem Kundenprofil genommen, nicht erst beim erneuten Versenden. Die eingetragenen Daten bleiben erhalten, das Formular geht damit vorausgefüllt auf. Gültig wird die neue Fassung erst, wenn der Kunde sie erneut unterschreibt.`,
                                confirmText: "Bearbeiten",
                                cancelText: "Fassung behalten",
                                variant: "destructive",
                              });
                              if (!ok) return;
                              setInvestmentRvPdf(inv.id, "");
                              setRvSignaturePending(inv.id, false);
                              reloadKunde();
                              navigate(`/reservierung?${buildRvParams().toString()}`);
                            }}>
                              <Pencil className="h-3 w-3 mr-1" /> Direkt bearbeiten
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (rvSignPending && !rvSigned) ? (
                      /* ── Signature pending ── */
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
                          <span className="font-medium">Unterschrift angefordert – warte auf Kunde</span>
                        </div>
                        {rvSentAt && (
                          <p className="text-xs text-muted-foreground">
                            Gesendet am: {new Date(rvSentAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} um {new Date(rvSentAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                        {/*
                          Wie lange der versendete Link noch gilt.

                          Gerechnet aus dem Versandzeitpunkt am Investment, nicht
                          aus `signature_requests`: Die Zeile dort steht dem
                          Kundenprofil nicht ohne zusätzliche Abfrage zur
                          Verfügung, und für die Anzeige reicht der Zeitpunkt,
                          an dem der Partner selbst gesendet hat. Fehlt er, wird
                          nichts behauptet.
                        */}
                        {rvSentAt && (() => {
                          const ablauf = new Date(new Date(rvSentAt).getTime() + SIGNATUR_FRIST_TAGE * 86400_000);
                          if (isNaN(ablauf.getTime())) return null;
                          const text = ablauf.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
                          const abgelaufen = ablauf.getTime() < Date.now();
                          return (
                            <p className={`text-xs ${abgelaufen ? "text-destructive" : "text-muted-foreground"}`}>
                              {abgelaufen
                                ? `Der Link ist am ${text} abgelaufen. Mit „Neuen Link senden“ geht ein neuer raus.`
                                : `Der Link gilt bis ${text}.`}
                            </p>
                          );
                        })()}
                        {/* VP: Bearbeitungsanfrage / nach Freigabe bearbeiten & neu senden */}
                        {canReserve && !isBackofficeOrAdmin && !isFinanzierer && (
                          <div className="kundenprofil-kartenaktionen">
                            {!rvEditApproved ? (
                              <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                                const angekommen = await glockeAnAdmins(
                                  `Bearbeitungsanfrage: Reservierung`,
                                  `${user.name} möchte die noch ausstehende Reservierungsvereinbarung für ${kunde.vorname} ${kunde.nachname} bearbeiten und erneut senden.`,
                                  `/kunden/${id}`,
                                );
                                if (!angekommen) {
                                  toast({ title: "Anfrage nicht angekommen", description: "Bitte melde dich direkt bei Admin oder Inhaber.", variant: "destructive" });
                                  return;
                                }
                                toast({ title: "Anfrage gesendet", description: "Der Admin wurde über die Bearbeitungsanfrage informiert." });
                              }}>
                                <Pencil className="h-3 w-3 mr-1" /> Bearbeitung beim Admin anfragen
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                                setRvEditApproved(inv.id, false);
                                setInvestmentRvPdf(inv.id, "");
                                setRvSignaturePending(inv.id, false);
                                reloadKunde();
                                navigate(`/reservierung?${buildRvParams().toString()}`);
                              }}>
                                <Pencil className="h-3 w-3 mr-1" /> Reservierung bearbeiten & erneut senden
                              </Button>
                            )}
                          </div>
                        )}
                        {/* Admin: Freigabe + Direktbearbeitung + erneut senden */}
                        {isBackofficeOrAdmin && (
                          <div className="kundenprofil-kartenaktionen">
                            {!rvEditApproved && (
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                                setRvEditApproved(inv.id, true);
                                reloadKunde();
                                toast({ title: "Bearbeitung freigegeben", description: "Der VP kann die Reservierung jetzt bearbeiten." });
                              }}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Bearbeitung freigeben
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                              /*
                               * Auch hier sagt der Hinweis jetzt, was wirklich
                               * geschieht: Die angeforderte Unterschrift wird
                               * mit diesem Klick zurückgezogen, nicht erst beim
                               * erneuten Versenden.
                               */
                              const ok = await confirmDialog({
                                title: "Ausstehende Reservierungsvereinbarung jetzt bearbeiten?",
                                description:
                                  `Die für ${kunde.vorname} ${kunde.nachname} angeforderte Unterschrift wird sofort zurückgezogen, nicht erst beim erneuten Versenden. Ein noch offener Unterschriftslink führt danach ins Leere. Die eingetragenen Daten bleiben erhalten, das Formular geht damit vorausgefüllt auf und muss anschließend erneut versendet werden.`,
                                confirmText: "Bearbeiten",
                                cancelText: "Unterschrift abwarten",
                                variant: "destructive",
                              });
                              if (!ok) return;
                              setInvestmentRvPdf(inv.id, "");
                              setRvSignaturePending(inv.id, false);
                              reloadKunde();
                              navigate(`/reservierung?${buildRvParams().toString()}`);
                            }}>
                              <Pencil className="h-3 w-3 mr-1" /> Direkt bearbeiten
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn("text-xs transition-all duration-300", rvResent && "bg-[hsl(var(--success))] text-white border-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90")}
                              onClick={async () => {
                                if (rvResent) return;
                                const ok = await confirmDialog({
                                  title: "Neuen Link zur Reservierung senden?",
                                  description:
                                    `${kunde.vorname} ${kunde.nachname} bekommt die Vereinbarung noch einmal zur Unterschrift an ${kunde.email || "die hinterlegte Adresse"}. `
                                    + `Der neue Link gilt ${SIGNATUR_FRIST_TEXT}. Der bisherige Link wird damit ungültig. `
                                    + "Sollte die alte E-Mail noch im Postfach liegen, muss der Kunde die neue nehmen.",
                                  confirmText: "Neuen Link senden",
                                  cancelText: "Abbrechen",
                                });
                                if (ok) resendRvSignature();
                              }}
                              disabled={rvResent}
                            >
                              {rvResent ? (
                                <><CheckCircle2 className="h-3 w-3 mr-1" /> Wurde erneut versendet</>
                              ) : (
                                <><RefreshCw className="h-3 w-3 mr-1" /> Neuen Link senden, gültig {SIGNATUR_FRIST_TAGE} Tage</>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : !canReserve ? (
                      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          <span>Wird nach dem gesetzten Objekt freigeschaltet.</span>
                        </div>
                      </div>
                    ) : !saFuerRv ? (
                      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          <span>
                            {saNeuAusstehend
                              ? "Die korrigierte Selbstauskunft ist noch nicht neu unterschrieben. Danach wird die Reservierung freigeschaltet."
                              : "Wird nach der unterschriebenen Selbstauskunft freigeschaltet."}
                          </span>
                        </div>
                      </div>
                    ) : isFinanziererView ? null : (
                      /*
                        Ein Knopf statt zwei.

                        Hier standen bis zuletzt zwei Wege in dasselbe
                        Formular: "Jetzt reservieren" und daneben ein zweiter
                        Knopf für Objekte, die nur in Investagon liegen. Sie
                        führten auf dieselbe Reservierungsvereinbarung, der
                        zweite setzte lediglich eine Kennzeichnung und
                        blendete drei Hinweise ein.

                        Schlimmer war die Bedingung darunter: "Jetzt
                        reservieren" erschien nur bei einer reservierten
                        Wohnung aus dem eigenen Bestand. Den gibt es zurzeit
                        nicht, also erschien der blaue Knopf nie und der
                        zweite war der einzige Weg. Jetzt zählt, ob das Objekt
                        am Investment steht, und das ist die Objektauswahl
                        eine Karte weiter oben.
                      */
                      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-3 space-y-3">
                        <div className="flex items-start gap-3">
                          <FileSignature className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            {objektFuerRvSteht ? (
                              <>Die Reservierungsvereinbarung übernimmt, was unter <span className="font-semibold text-foreground">Objektauswahl</span> bei „Objekt eintragen“ erfasst wurde. Was dort nicht steht, wird im Formular nachgetragen.</>
                            ) : (
                              <>Unter <span className="font-semibold text-foreground">Objektauswahl</span> ist noch kein Objekt eingetragen. Solange das so ist, bleiben die Objektfelder im Formular leer und müssen von Hand ausgefüllt werden.</>
                            )}
                          </p>
                        </div>
                        <Button size="sm" onClick={() => {
                          navigate(`/reservierung?${buildRvParams().toString()}`);
                        }}>
                          Jetzt reservieren
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
              </KundenprofilAbschnitt>
            </Card>

            <Card id={`card-finanzierung-${inv.id}`} className="p-6 transition-all duration-500">
              <div className="w-8 h-1 bg-primary mb-3" />
              {/*
                Terminknopf direkt unter der Ueberschrift, genau wie in der
                Objektauswahl. Christian am 21.09.2026: Der Knopf stand vorher
                weiter unten neben der Statusanzeige und war dort schwer zu
                finden. An beiden Stellen soll er gleich sitzen. Seit dem
                23.09.2026 immer unter statt neben der Ueberschrift, siehe
                `KundenprofilAbschnitt`.
              */}
              <KundenprofilAbschnitt
                kopf={<h3 className="font-bold mb-4">Finanzierung</h3>}
                kopfZusatz={id ? (
                  <TerminseiteKnopf
                    kontaktId={id}
                    kontaktName={`${kunde.vorname} ${kunde.nachname}`.trim()}
                    kontaktEmail={kunde.email || undefined}
                    investmentId={inv.id}
                    anlass="finanzierungsgespraech"
                    beschriftung="Finanzierungsgespräch vereinbaren"
                    className="text-xs h-7 shrink-0"
                  />
                ) : null}
              >
              {(() => {
                const m = inv.meta || {};
                // Nur zu einem eingetragenen Objekt. Ohne Objekt zeigte der
                // Link auf etwas, das bei uns nirgends steht (Blanko-Weg, seit
                // dem 29.09.2026 abgeschaltet).
                if (m.quelle !== "investagon" || !(inv.objektId || !objektDatenFehlen(inv.id))) return null;
                // Nur echte https-Adressen: der Wert ist frei beschreibbar, ein `javascript:` liefe sonst beim Klick.
                const investagonRef = typeof m.investagonRef === "string" && /^https:\/\//i.test(m.investagonRef.trim()) ? m.investagonRef.trim() : "";
                return (
                  <div className="mb-4 rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-4 py-3 text-xs">
                    <p className="font-semibold mb-1">Investagon-Reservierung</p>
                    <p className="text-muted-foreground">
                      Die vollständigen Objektunterlagen zu dieser Reservierung sind in Investagon zu entnehmen.
                      {investagonRef ? (
                        <> <a href={investagonRef} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">Investagon-Objekt öffnen ↗</a></>
                      ) : null}
                    </p>
                  </div>
                );
              })()}
              {(() => {
                /*
                  Die eine Regel fuer die Finanzierung im Kundenprofil, siehe
                  `finanzierungIntern`: offen ab der Reservierung, sobald sie
                  unterschrieben ist und ein Objekt am Investment steht, auch
                  waehrend der Bonitaetsunterlagen. Die Karte bekommt dieselbe
                  Antwort und sperrt nicht mehr selbst nach der Stufe.

                  "Objekt gesetzt" ist dieselbe Frage wie bei der Reservierung
                  oben: `objektDatenFehlen`, mit `inv.objektId` als Rueckfall
                  fuer Altvorgaenge und Investagon als Sonderfall.
                */
                const finanzFreigabe = finanzierungIntern({
                  pipelineStufe: inv.pipelineStufe,
                  rvSigned: getRvSigned(inv.id),
                  objektGesetzt: !!inv.objektId || !objektDatenFehlen(inv.id),
                  istInvestagon,
                  hatFinanzierungsdaten:
                    getFinanzierung(inv.id).angebote.length > 0
                    || !!getInvestmentMetaField<string>(inv.id, "finanzierungsStatus", "")
                    || !!getInvestmentMetaField<string>(inv.id, "finanzierungsBank", ""),
                });
                if (!finanzFreigabe.offen) {
                  return (
                    <div className="bg-muted/50 rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock className="h-4 w-4" />
                      <span>{finanzFreigabe.sperrgrund}</span>
                    </div>
                  );
                }
                return (
                <div data-finanz-editable>
                <EigenfinanzierungSection
                  investmentId={inv.id}
                  kundeId={id || ""}
                  kundeName={`${kunde.vorname} ${kunde.nachname}`}
                  beraterId={cacheGet("kontakte").find((k: any) => k.id === id)?.zustaendig_id}
                  beraterName={kunde.berater}
                  onConfirmed={() => {
                    updateInvestment(inv.id, { pipelineStufe: "notar", finanzierungsStatus: "bestaetigt" });
                    updateKontakt(id || "", { pipelineStufe: "notar", finanzierungsStatus: "bestaetigt", status: "kunde" });
                    notifyKundePipelineStufe(id || "", "notar");
                    reloadKunde();
                  }}
                />
                <FinanzierungCard
                  freigabe={finanzFreigabe}
                  investmentId={inv.id}
                  kundeName={`${kunde.vorname} ${kunde.nachname}`}
                  pipelineStufe={inv.pipelineStufe}
                  berater={kunde.berater}
                  beraterId={cacheGet("kontakte").find((k: any) => k.id === id)?.zustaendig_id}
                  onPipelineUpdate={() => {
                    updateInvestment(inv.id, { pipelineStufe: "notar", finanzierungsStatus: "bestaetigt" });
                    updateKontakt(id || "", { pipelineStufe: "notar", finanzierungsStatus: "bestaetigt", status: "kunde" });
                    notifyKundePipelineStufe(id || "", "notar");
                    addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: "Finanzierung bestätigt, weiter zum Notar", von: user.name });
                    reloadKunde();
                  }}
                />
                </div>
                );
              })()}
              </KundenprofilAbschnitt>
            </Card>
          </>
        ) : (
          /*
            Zwei einzelne Karten statt eines Blocks über die volle Breite.

            Der frühere Platzhalter brachte sein eigenes Raster mit und trug
            deshalb `lg:col-span-2`. Seit die Objektauswahl immer davor steht,
            hätte er die Zelle daneben leer gelassen und alle Paare darunter
            verschoben.
          */
          <>
            {/* Die Kennungen sind die Sprungziele der Abschnittsleiste: Auch gesperrt wird der Kasten angesprungen und orange gerahmt. */}
            <LockedPhaseCard id={`card-reservierung-${inv.id}`} title="Reservierung" reason="Wird nach dem gesetzten Objekt freigeschaltet." />
            <LockedPhaseCard id={`card-finanzierung-${inv.id}`} title="Finanzierung" reason="Wird nach dem gesetzten Objekt freigeschaltet." />
          </>
        )}

        {/* ── Notar & Fälligkeit ── */}
        {inv.objektId || stufeErreicht(inv.pipelineStufe, "objektauswahl") ? (
          <>
            <Card id={`card-notar-${inv.id}`} className="p-6 transition-all duration-500">
              <div className="w-8 h-1 bg-primary mb-3" />
              <KundenprofilAbschnitt
                kopf={<h3 className="font-bold mb-4">Notar</h3>}
              >
              {/* Vom Kunden bestätigter Termin – IMMER prominent oben anzeigen, sobald Bestätigung vorliegt */}
              {(() => {
                const bestaetigt = getNotarTerminBestaetigt(inv.id);
                if (!bestaetigt) return null;
                const nd = getInvestmentNotarData(inv.id);
                const datumPasst = (nd.datum || inv.notarTermin) === bestaetigt.datum
                  && (nd.uhrzeit || inv.notarUhrzeit) === bestaetigt.uhrzeit;
                const isAdminOrInhaberNotarTop = ["admin", "inhaber"].includes(user.role);
                const canEditNotarTop = isAdminOrInhaberNotarTop || user.role === "vertriebspartner";
                return (
                  <div className="rounded-lg border-2 border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/5 p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold">✓ Vom Kunden bestätigter Notartermin</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <strong className="text-foreground">{bestaetigt.datum}</strong>
                          {bestaetigt.uhrzeit && <> um <strong className="text-foreground">{bestaetigt.uhrzeit} Uhr</strong></>}
                          {" · "}bestätigt am {new Date(bestaetigt.bestaetigtAm).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {!datumPasst && canEditNotarTop && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-foreground">
                              Bitte als finalen Termin übernehmen und beim Notar verbindlich bestätigen.
                            </span>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={async () => {
                                setInvestmentNotarFields(inv.id, { datum: bestaetigt.datum, uhrzeit: bestaetigt.uhrzeit });
                                toast({ title: "Termin übernommen ✓", description: `${bestaetigt.datum}${bestaetigt.uhrzeit ? ` um ${bestaetigt.uhrzeit} Uhr` : ""}` });
                                forceUpdate(n => n + 1);
                              }}
                            >
                              Termin übernehmen
                            </Button>
                          </div>
                        )}
                        {datumPasst && (
                          <p className="text-[11px] text-[hsl(var(--success))] mt-1">
                            ✓ Termin entspricht den eingetragenen Notardaten
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {FREIGESCHALTET_AB_RESERVIERUNG.includes(inv.pipelineStufe) && getRvSigned(inv.id) ? (
              (() => {
                const isAdminOrInhaberNotar = ["admin", "inhaber"].includes(user.role);
                const isVPNotar = user.role === "vertriebspartner";
                const canEditNotar = isAdminOrInhaberNotar || isVPNotar;
                const notarData = getInvestmentNotarData(inv.id);
                const notarIstGesendet = getNotarGesendet(inv.id);
                const notarGesendetAt = getNotarGesendetAt(inv.id);
                const kaufvertragPdf = getKaufvertragPdf(inv.id);
                const kaufvertragUpdatedAt = getKaufvertragUpdatedAt(inv.id);
                const kvData = getKaufvertragData(inv.id);
                const notarEmailVal = getNotarEmail(inv.id);

                const notarterminEingetragenAt = getNotarterminEingetragenAt(inv.id);

                const saveNotarField = async (field: string, value: string) => {
                  const updated = { ...notarData, [field]: value };
                  // Atomare Speicherung: notarData + top-level Spiegel-Felder in EINEM DB-Update,
                  // damit Race-Conditions keine Felder (z. B. Uhrzeit) verschlucken können.
                  if (["datum", "uhrzeit", "name", "adresse", "telefon", "verkaeufer", "vertretung"].includes(field)) {
                    setInvestmentNotarFields(inv.id, { [field]: value } as any);
                  } else {
                    setInvestmentNotarData(inv.id, updated);
                  }

                  // Wenn Datum erstmalig eingetragen wird: Pipeline auf "notar" + Zeitstempel + Benachrichtigung.
                  // Mails gehen hier bewusst nicht hinaus, erst bei „Freigeben“ (siehe
                  // src/lib/notarterminMail.ts). Beim ersten Datum fehlen meist noch
                  // Uhrzeit, Notar und Adresse.
                  if (field === "datum" && value && !notarterminEingetragenAt) {
                    // Auto-advance pipeline to "notar"
                    if (inv.pipelineStufe !== "notar" && inv.pipelineStufe !== "faelligkeit" && inv.pipelineStufe !== "abgeschlossen") {
                      updateInvestment(inv.id, { pipelineStufe: "notar" });
                      updateKontakt(id || "", { pipelineStufe: "notar", status: "kunde" });
                      notifyKundePipelineStufe(id || "", "notar");
                    }
                    setNotarterminEingetragenAt(inv.id);
                    addAktivitaet({ kundeId: id || "", art: "notiz", beschreibung: `Notartermin eingetragen: ${value}${(updated.uhrzeit || inv.notarUhrzeit) ? ` um ${updated.uhrzeit || inv.notarUhrzeit} Uhr` : ""}${(updated.name || inv.notarName) ? ` bei ${updated.name || inv.notarName}` : ""}`, von: user.name });
                    const terminDatumVal = value;
                    const terminUhrzeitVal = updated.uhrzeit || inv.notarUhrzeit || "";
                    const notarNameVal = updated.name || inv.notarName || "";
                    const kundeName = `${kunde.vorname} ${kunde.nachname}`;

                    // Meldung an Admin und Inhaber. Kommt sie nicht an, sagt die Seite es.
                    const gemeldet = await glockeAnAdmins(
                      "Notartermin eingetragen",
                      `${user.name} hat für ${kundeName} einen Notartermin am ${terminDatumVal}${terminUhrzeitVal ? ` um ${terminUhrzeitVal} Uhr` : ""} bei ${notarNameVal || "Notar"} eingetragen.`,
                      `/kunden/${id}`,
                    );
                    if (!gemeldet) {
                      toast({ title: "Admin nicht benachrichtigt", description: "Der Notartermin ist gespeichert, die Meldung an Admin und Inhaber kam aber nicht an. Bitte gib kurz selbst Bescheid.", variant: "destructive" });
                    }

                    forceUpdate(n => n + 1);
                  }
                };

                const handleNotarSenden = () => {
                  setNotarGesendet(inv.id, true);
                  const datum = notarData.datum || inv.notarTermin || "";
                  const uhrzeit = notarData.uhrzeit || inv.notarUhrzeit || "";
                  const kontaktRow = cacheGet("kontakte").find((k: any) => k.id === id);
                  notifyNotarTerminGesetzt(`${kunde.vorname} ${kunde.nachname}`, `${datum} um ${uhrzeit} Uhr`, id || "", kontaktRow?.zustaendig_id);
                   scheduleNotarfotoReminders(`${kunde.vorname} ${kunde.nachname}`, id || "", datum, uhrzeit, kontaktRow?.zustaendig_id);
                   scheduleKundenordnerReminder(`${kunde.vorname} ${kunde.nachname}`, id || "", datum, uhrzeit, kontaktRow?.zustaendig_id);
                   scheduleEmpfehlungsprogrammReminders(`${kunde.vorname} ${kunde.nachname}`, id || "", datum, uhrzeit, kontaktRow?.zustaendig_id);
                   toast({ title: "Notardaten gesendet \u2713", description: "Der VP wurde benachrichtigt." });
                  reloadKunde();
                };

                const handleKaufvertragSave = async (formData: any) => {
                  setKaufvertragData(inv.id, formData);
                  const pdf = await generateKaufvertragPDF(formData, { kundenSprache: kundenSprache(kunde.id) });
                  const filename = `Kaufvertrag_${kunde.vorname}_${kunde.nachname}_${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\./g, "-")}.pdf`;
                  setKaufvertragPdf(inv.id, filename);
                  // Upload to storage
                  const pdfBlob = pdf.output("blob");
                  const storagePath = `kaufvertrag/${id}/${inv.id}/${filename}`;
                  await supabase.storage.from("unterlagen").upload(storagePath, pdfBlob, { upsert: true, contentType: "application/pdf" });
                  setShowKaufvertragForm(null);
                  toast({ title: "Aufnahmebogen gespeichert ✓", description: "PDF wurde erstellt." });
                  forceUpdate(n => n + 1);
                };

                const handleDeleteKaufvertrag = () => {
                  deleteKaufvertragPdf(inv.id);
                  // Delete from storage
                  supabase.storage.from("unterlagen").remove([`kaufvertrag/${id}/${inv.id}`]).catch(() => {});
                  setDeleteKaufvertragDialog(null);
                  toast({ title: "Aufnahmebogen gelöscht ✓" });
                  forceUpdate(n => n + 1);
                };

                // Verkäufer aus Objekt vorausfüllen
                const notarObjekt = inv.objektId ? getObjektById(inv.objektId) : undefined;
                const notarVkName = (() => {
                  const existing = notarData.verkaeufer || inv.notarVerkaeufer || "";
                  if (existing) return existing;
                  // 1) Aus dem Notar-Aufnahmebogen. Bei einer Firma steht der
                  //    ganze Name in einem Feld, bei einer Person in zweien.
                  const kv = getKaufvertragData(inv.id);
                  const kvName = verkaeuferVollerName({
                    art: kv?.vk_art, name: kv?.vk_name, vorname: kv?.vk_vorname,
                  });
                  if (kvName) return kvName;
                  // 2) Aus Objekt-Verkäuferdaten
                  const vkDaten = notarObjekt?.verkaeuferDaten;
                  const vkName = verkaeuferVollerName(vkDaten);
                  if (vkName) return vkName;
                  // 3) Aus Objekt-Einreichung (Eigentümer)
                  const invMeta: any = (inv as any).meta || {};
                  const ed = invMeta.einreichungData;
                  if (ed?.eigentuemer_name) return ed.eigentuemer_name;
                  return "";
                })();

                const notarFieldsRow1 = [
                  { key: "datum", label: "Datum", placeholder: "TT.MM.JJJJ", type: "date", val: notarData.datum || inv.notarTermin || "", required: true },
                  { key: "uhrzeit", label: "Uhrzeit", placeholder: "HH:MM", type: "time", val: notarData.uhrzeit || inv.notarUhrzeit || "", required: true },
                ];
                const notarFieldsRow2 = [
                  { key: "name", label: "Notarname", placeholder: "z.B. Dr. Hans Müller", type: "text", val: notarData.name || inv.notarName || "", required: true },
                  { key: "adresse", label: "Notaradresse", placeholder: "Straße, PLZ Ort", type: "text", val: notarData.adresse || inv.notarAdresse || "", required: true },
                ];
                const notarFieldsRow3 = [
                  { key: "telefon", label: "Telefonnummer", placeholder: "z.B. 089 12345678", type: "tel", val: notarData.telefon || inv.notarTelefon || "", required: true },
                ];
                const notarFieldsRow4 = [
                  { key: "verkaeufer", label: "Verkäufer", placeholder: "Name des Verkäufers", type: "text", val: notarVkName, required: true },
                  { key: "vertretung", label: "Verkäufervertretung", placeholder: "Name der Verkäufervertretung", type: "text", val: notarData.vertretung || inv.notarVerkaeufervertretung || "", required: false },
                ];

                const notarPortalHinweis = (notarData.name || inv.notarName || notarData.datum || inv.notarTermin)
                  ? "💡 Notarname, Notaradresse, Datum und Uhrzeit werden auch im Kundenportal angezeigt."
                  : null;

                const terminDatum = notarData.datum || inv.notarTermin || "";
                const terminUhrzeit = notarData.uhrzeit || inv.notarUhrzeit || "00:00";
                const hasTermin = !!terminDatum;

                if (hasTermin && inv.pipelineStufe === "notar") {
                  try {
                    let terminDate: Date;
                    if (terminDatum.includes("-")) {
                      terminDate = new Date(`${terminDatum}T${terminUhrzeit}`);
                    } else {
                      const [d, m, yy] = terminDatum.split(".");
                      terminDate = new Date(`${yy}-${m}-${d}T${terminUhrzeit}`);
                    }
                    // Nach dem Notartermin: erst den Eigentümer in die Hausverwaltung
                    // übernehmen, dann die Stufe wechseln. Bis zum 04.10.2026 lief es
                    // umgekehrt; scheiterte das Anlegen (Partner, Backoffice), stand
                    // die Stufe schon auf Fälligkeit und kein zweiter Versuch kam.
                    const uebernahmeStand = eigentuemerUebernahmeRef.current.get(inv.id);
                    if (!isNaN(terminDate.getTime()) && terminDate <= new Date() && !uebernahmeStand) {
                      eigentuemerUebernahmeRef.current.set(inv.id, "laeuft");
                      void (async () => {
                      const uebernahme = await eigentuemerAusInvestment({
                        kontaktId: id || "",
                        kontaktName: `${kunde.vorname} ${kunde.nachname}`,
                        anrede: kunde.anrede || "",
                        email: kunde.email || "",
                        telefon: kunde.telefon || "",
                        strasse: `${kunde.strasse || ""} ${kunde.hausnummer || ""}`.trim(),
                        plz: kunde.plz || "",
                        ort: kunde.ort || "",
                        investmentId: inv.id,
                        objektId: inv.objektId,
                        objektName: inv.objektTitel || inv.label,
                        notarDatum: terminDatum,
                      });
                      if (uebernahme.ok === false) {
                        eigentuemerUebernahmeRef.current.set(inv.id, "fehler");
                        toast({
                          title: "Eigentümer nicht übernommen",
                          description: `${uebernahme.grund}. Die Stufe bleibt auf Notar, bis die Übernahme in die Hausverwaltung geklappt hat.`,
                          variant: "destructive",
                        });
                        forceUpdate(n => n + 1);
                        return;
                      }
                      eigentuemerUebernahmeRef.current.set(inv.id, "fertig");
                      updateInvestment(inv.id, { pipelineStufe: "faelligkeit" });
                      updateKontakt(id || "", { pipelineStufe: "faelligkeit" });

                      const empProgKey = `mi_emp_prog_task_${inv.id}`;
                      const existingProg = getProgrammByInvestment(inv.id);
                      if (!existingProg && !localStorage.getItem(empProgKey)) {
                        localStorage.setItem(empProgKey, "true");
                        // Empfehlungsprogramm einrichten: am Tag des Notartermins,
                        // zur gleichen Uhrzeit – nie rückdatiert.
                        const empMs = Math.max(Date.now(), terminDate.getTime());
                        const empUhr = (terminUhrzeit && /^\d{1,2}:\d{2}$/.test(terminUhrzeit)) ? terminUhrzeit : "10:00";
                        addGeteilteAufgabe({
                          titel: `Empfehlungsprogramm einrichten: ${kunde.vorname} ${kunde.nachname}`,
                          beschreibung: `Der Notartermin für ${kunde.vorname} ${kunde.nachname} (${inv.label}) ist abgeschlossen. Bitte richte das Empfehlungsprogramm ein.`,
                          prioritaet: "mittel",
                          typ: "aufgabe",
                          faellig_am: new Date(empMs).toISOString().split("T")[0],
                          uhrzeit: empUhr,
                          kundeId: id || "",
                          kundeName: `${kunde.vorname} ${kunde.nachname}`,
                        });
                      }

                      const notarNameVal = notarData.name || inv.notarName || "";
                      const notarTelefonVal = notarData.telefon || inv.notarTelefon || "";
                      const notarKey = `mi_notar_7d_tasks_${inv.id}`;
                      if (!localStorage.getItem(notarKey)) {
                        localStorage.setItem(notarKey, "true");
                        // Fälligkeit nie in der Vergangenheit: max(heute, Notar + 7 Tage)
                        const anruf7Ms = Math.max(Date.now(), terminDate.getTime() + 7 * 86400000);
                        const fälligDatum = new Date(anruf7Ms).toISOString().split("T")[0];

                        addGeteilteAufgabe({
                          titel: `Notar kontaktieren: Bewilligung abzulösende Bank – ${kunde.vorname} ${kunde.nachname}`,
                          beschreibung: `Bitte bei ${notarNameVal || "dem Notar"}${notarTelefonVal ? ` (Tel.: ${notarTelefonVal})` : ""} anrufen.`,
                          prioritaet: "hoch",
                          typ: "anruf",
                          faellig_am: fälligDatum,
                          uhrzeit: "09:00",
                          kundeId: id || "",
                          kundeName: `${kunde.vorname} ${kunde.nachname}`,
                        });

                        addGeteilteAufgabe({
                          titel: `Grundbuchamt kontaktieren: Auflassungsvormerkung – ${kunde.vorname} ${kunde.nachname}`,
                          beschreibung: `Bitte beim zuständigen Grundbuchamt anrufen und nachfragen.`,
                          prioritaet: "hoch",
                          typ: "anruf",
                          faellig_am: fälligDatum,
                          uhrzeit: "10:00",
                          kundeId: id || "",
                          kundeName: `${kunde.vorname} ${kunde.nachname}`,
                        });
                      }

                      const asReminderKey = `mi_as_upload_reminders_${inv.id}`;
                      if (!localStorage.getItem(asReminderKey)) {
                        localStorage.setItem(asReminderKey, "true");
                        const reminderDays = [7, 14, 28, 44];
                        // Eskalations-Kette: gestaffelt anhand max(heute, Notar+N).
                        // Wenn Notar in der Vergangenheit liegt, werden die 4 Reminder
                        // ab heute weiter-versetzt, statt alle gleichzeitig zu erscheinen.
                        const baseShiftMs = Math.max(0, Date.now() - (terminDate.getTime() + 7 * 86400000));
                        reminderDays.forEach((days, idx) => {
                          const reminderMs = terminDate.getTime() + days * 86400000 + baseShiftMs;
                          const reminderDate = new Date(Math.max(Date.now(), reminderMs)).toISOString().split("T")[0];
                          addGeteilteAufgabe({
                            titel: `Fälligkeit Unterlagen hochladen (${idx + 1}/4): ${kunde.vorname} ${kunde.nachname}`,
                            beschreibung: `Bitte die Fälligkeit Unterlagen für ${kunde.vorname} ${kunde.nachname} hochladen. ${days}-Tage-Erinnerung.`,
                            prioritaet: days <= 14 ? "mittel" : "hoch",
                            typ: "aufgabe",
                            faellig_am: reminderDate,
                            uhrzeit: "09:00",
                            kundeId: id || "",
                            kundeName: `${kunde.vorname} ${kunde.nachname}`,
                          });
                        });
                      }

                      reloadKunde();
                      })();
                    }
                  } catch { /* ignore */ }
                }

                return (
                  <div className="space-y-4">
                    {eigentuemerUebernahmeRef.current.get(inv.id) === "fehler" && (
                      <Alert variant="destructive">
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                          <span>Der Käufer ist noch nicht als Eigentümer in der Hausverwaltung angelegt. Die Stufe bleibt auf Notar, bis das geklappt hat.</span>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                            eigentuemerUebernahmeRef.current.delete(inv.id);
                            forceUpdate(n => n + 1);
                          }}>
                            Erneut versuchen
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}
                    {/* Aufnahmebogen Notar (Kaufvertrag-Formular) */}
                    <div id={`notar-section-${inv.id}`} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">📋 Aufnahmebogen Notar</h4>
                        {kaufvertragPdf && kaufvertragUpdatedAt && (
                          <span className="text-[10px] text-muted-foreground">Zuletzt bearbeitet: {new Date(kaufvertragUpdatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        )}
                      </div>
                      {kaufvertragPdf ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                            <div className="bg-destructive/10 text-destructive font-bold text-xs px-2 py-1 rounded">PDF</div>
                            <div className="min-w-0 flex-1 basis-48 break-words">
                              <span className="text-sm font-semibold">{kaufvertragPdf}</span>
                              <p className="text-[10px] text-muted-foreground">Aufnahmebogen gespeichert</p>
                            </div>
                            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={async () => {
                                const kvData = getKaufvertragData(inv.id);
                                const pdf = await generateKaufvertragPDF(kvData, { kundenSprache: kundenSprache(kunde.id) });
                                pdf.save(kaufvertragPdf);
                              }}>
                                <Download className="h-3 w-3 mr-1" /> PDF
                              </Button>
                              {(isVPNotar || isAdminOrInhaberNotar) && (
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowKaufvertragForm(inv.id)}>
                                  <Pencil className="h-3 w-3 mr-1" /> Bearbeiten
                                </Button>
                              )}
                              {isAdminOrInhaberNotar && (
                                <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => setDeleteKaufvertragDialog(inv.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                        </div>
                        {/* Vollmacht Verkäufer */}
                        {kvData?.vk_vollmacht === "vorhanden" && kvData?.vk_vollmacht_datei && (
                          <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                            <div className="bg-destructive/10 text-destructive font-bold text-xs px-2 py-1 rounded">PDF</div>
                            <div className="min-w-0 flex-1 basis-48 break-words">
                              <span className="text-sm font-semibold">Vollmacht Verkäufer</span>
                              <p className="text-[10px] text-muted-foreground">Hochgeladen im Aufnahmebogen</p>
                            </div>
                            <Button size="sm" variant="outline" className="text-xs h-7 ml-auto shrink-0" onClick={async () => {
                              const url = await resolveUnterlagenUrl(kvData.vk_vollmacht_datei!);
                              if (url) window.open(url, "_blank");
                            }}>
                              <Download className="h-3 w-3 mr-1" /> PDF
                            </Button>
                          </div>
                        )}
                        {/* Vollmacht Käufer */}
                        {kvData?.k_vollmacht === "vorhanden" && kvData?.k_vollmacht_datei && (
                          <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                            <div className="bg-destructive/10 text-destructive font-bold text-xs px-2 py-1 rounded">PDF</div>
                            <div className="min-w-0 flex-1 basis-48 break-words">
                              <span className="text-sm font-semibold">Vollmacht Käufer</span>
                              <p className="text-[10px] text-muted-foreground">Hochgeladen im Aufnahmebogen</p>
                            </div>
                            <Button size="sm" variant="outline" className="text-xs h-7 ml-auto shrink-0" onClick={async () => {
                              const url = await resolveUnterlagenUrl(kvData.k_vollmacht_datei!);
                              if (url) window.open(url, "_blank");
                            }}>
                              <Download className="h-3 w-3 mr-1" /> PDF
                            </Button>
                          </div>
                        )}
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">
                            Bitte fülle den Aufnahmebogen zur Vorbereitung der Beurkundung aus.
                          </p>
                          {(isVPNotar || isAdminOrInhaberNotar) && (
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowKaufvertragForm(inv.id)}>
                              <FileText className="h-3 w-3" /> Aufnahmebogen ausfüllen
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Notardaten – nur sichtbar wenn Aufnahmebogen vorhanden */}
                    {kaufvertragPdf ? (
                      <>
                      {/* Modus-Auswahl: Gesetzter Termin oder Vorschläge zur Auswahl */}
                      {(() => {
                        const modus = getNotarTerminModus(inv.id);
                        const setModus = async (next: "gesetzt" | "vorschlaege") => {
                          if (next === modus) return;
                          // Check whether existing data would be overwritten.
                          // Liest `inv.meta`, das `fromDb` erst seit dem
                          // 29.09.2026 mitliefert; vorher kam die Rückfrage nie.
                          const m = inv.meta || {};
                          let warnMsg = "";
                          let nurVorschlaege = false;
                          if (next === "vorschlaege") {
                            // Wechsel von gesetzt → vorschlaege
                            const hasGesetzt = !!(m.notarTermin || m.notarUhrzeit);
                            const freigegeben = !!m.notarTerminPortalFreigabe;
                            if (hasGesetzt) {
                              warnMsg = freigegeben
                                ? "Der bereits an den Kunden freigegebene gesetzte Notartermin mit Datum und Uhrzeit wird beim Wechsel auf Terminvorschläge gelöscht. Der Kunde sieht den Termin im Portal dann nicht mehr."
                                : "Der bereits eingetragene gesetzte Notartermin mit Datum und Uhrzeit wird beim Wechsel auf Terminvorschläge gelöscht.";
                            }
                          } else {
                            // Wechsel von vorschlaege → gesetzt
                            const hatVorschlaege = Array.isArray(m.notarTerminVorschlaege) && m.notarTerminVorschlaege.length > 0;
                            const hatBestaetigt = !!m.notarTerminBestaetigt;
                            if (hatBestaetigt) {
                              warnMsg = "Der vom Kunden bereits bestätigte Notartermin und alle vorgeschlagenen Termine werden beim Wechsel auf einen gesetzten Termin gelöscht. Die Freigabe wird zurückgezogen, der Kunde sieht im Portal dann keinen Termin mehr.";
                            } else if (hatVorschlaege) {
                              warnMsg = "Die bereits eingetragenen Terminvorschläge werden beim Wechsel auf einen gesetzten Termin gelöscht.";
                              nurVorschlaege = true;
                            }
                          }
                          if (warnMsg) {
                            const ok = await confirmDialog({
                              title: next === "vorschlaege" ? "Auf Terminvorschläge wechseln?" : "Auf gesetzten Termin wechseln?",
                              description: warnMsg,
                              confirmText: nurVorschlaege ? "Vorschläge löschen" : "Termin löschen",
                              cancelText: "Behalten",
                              variant: "destructive",
                            });
                            if (!ok) return;
                          }
                          // ATOMAR: alle Felder in EINEM merge_investment_meta-Call.
                          // Verhindert Race-Conditions zwischen 4 parallelen RPCs,
                          // die sonst "Speichern fehlgeschlagen" auslösten und Felder
                          // (z. B. notarTerminModus) überschreiben konnten.
                          try {
                            switchNotarTerminModus(inv.id, next);
                            forceUpdate(n => n + 1);
                          } catch (err: any) {
                            console.error("switchNotarTerminModus failed:", err);
                            toast({
                              title: "Modus-Wechsel fehlgeschlagen",
                              description: err?.message || "Bitte erneut versuchen.",
                              variant: "destructive",
                            });
                          }
                        };
                        return (
                          <div className="border rounded-lg p-3 bg-muted/20 mb-3">
                            <p className="text-xs font-semibold mb-2">Wie möchtest du den Notartermin abstimmen?</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <label className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${modus === "gesetzt" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                                <input
                                  type="radio"
                                  name={`notar-modus-${inv.id}`}
                                  value="gesetzt"
                                  checked={modus === "gesetzt"}
                                  onChange={() => setModus("gesetzt")}
                                  disabled={!canEditNotar}
                                  className="mt-1"
                                />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold">📌 Gesetzter Notartermin</p>
                                  <p className="text-[10px] text-muted-foreground">Du trägst Datum & Uhrzeit verbindlich ein.</p>
                                </div>
                              </label>
                              <label className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${modus === "vorschlaege" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                                <input
                                  type="radio"
                                  name={`notar-modus-${inv.id}`}
                                  value="vorschlaege"
                                  checked={modus === "vorschlaege"}
                                  onChange={() => setModus("vorschlaege")}
                                  disabled={!canEditNotar}
                                  className="mt-1"
                                />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold">🗓️ Terminvorschläge zur Auswahl</p>
                                  <p className="text-[10px] text-muted-foreground">Kunde wählt aus mehreren Terminen.</p>
                                </div>
                              </label>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Datum + Uhrzeit nur bei "gesetzt" */}
                      {getNotarTerminModus(inv.id) === "gesetzt" && (
                        <>
                          <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
                            <div>
                              <h4 className="font-semibold text-sm">📌 Gesetzter Notartermin</h4>
                              <p className="text-[10px] text-muted-foreground">
                                Verbindlich vereinbarter Termin. Wird im Kundenportal erst nach Klick auf <strong>Freigeben</strong> (unten) sichtbar.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            {notarFieldsRow1.map(f => (
                              <div key={f.key}>
                                <Label className="text-xs font-semibold">{f.label} {f.required && <span className="text-destructive">*</span>}</Label>
                                {canEditNotar ? (
                                  <Input type={f.type} defaultValue={f.val} placeholder={f.placeholder} className="h-8 text-sm mt-1" onBlur={e => saveNotarField(f.key, e.target.value)} />
                                ) : (
                                  <p className="text-sm mt-1 h-8 flex items-center">{f.val || "–"}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Notar & Verkäuferdaten */}
                      <h4 className="font-semibold text-sm mb-2">🏛️ Notar & Verkäuferdaten</h4>
                      <div className="space-y-3">
                        {/* Notaradresse und E-Mail brauchen Breite. Nebeneinander
                            bleiben auf dem Telefon je 140 Pixel übrig, darin ist
                            eine Straße mit Postleitzahl nicht mehr zu lesen. Ab
                            `sm` steht wieder alles wie vorher. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Notarname + Notaradresse */}
                          {notarFieldsRow2.map(f => (
                            <div key={f.key}>
                              <Label className="text-xs font-semibold">{f.label} {f.required && <span className="text-destructive">*</span>}</Label>
                              {canEditNotar ? (
                                <Input type={f.type} defaultValue={f.val} placeholder={f.placeholder} className="h-8 text-sm mt-1" onBlur={e => saveNotarField(f.key, e.target.value)} />
                              ) : (
                                <p className="text-sm mt-1 h-8 flex items-center">{f.val || "–"}</p>
                              )}
                            </div>
                          ))}
                          {/* Telefonnummer + Notar E-Mail */}
                          {notarFieldsRow3.map(f => (
                            <div key={f.key}>
                              <Label className="text-xs font-semibold">{f.label} {f.required && <span className="text-destructive">*</span>}</Label>
                              {canEditNotar ? (
                                <Input type={f.type} defaultValue={f.val} placeholder={f.placeholder} className="h-8 text-sm mt-1" onBlur={e => saveNotarField(f.key, e.target.value)} />
                              ) : (
                                <p className="text-sm mt-1 h-8 flex items-center">{f.val || "–"}</p>
                              )}
                            </div>
                          ))}
                          <div>
                            <Label className="text-xs font-semibold">Notar E-Mail <span className="text-destructive">*</span></Label>
                            {canEditNotar ? (
                              <Input type="email" defaultValue={notarEmailVal} placeholder="notar@kanzlei.de" className="h-8 text-sm mt-1" onBlur={e => { setNotarEmail(inv.id, e.target.value); forceUpdate(n => n + 1); }} />
                            ) : (
                              <p className="text-sm mt-1 h-8 flex items-center">{notarEmailVal || "–"}</p>
                            )}
                          </div>
                          {/* Verkäufer + Verkäufervertretung */}
                          {notarFieldsRow4.map(f => (
                            <div key={f.key}>
                              <Label className="text-xs font-semibold">{f.label} {f.required && <span className="text-destructive">*</span>}</Label>
                              {canEditNotar ? (
                                <Input type={f.type} defaultValue={f.val} placeholder={f.placeholder} className="h-8 text-sm mt-1" onBlur={e => saveNotarField(f.key, e.target.value)} />
                              ) : (
                                <p className="text-sm mt-1 h-8 flex items-center">{f.val || "–"}</p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Terminvorschläge nur bei Modus "vorschlaege" */}
                        {canEditNotar && getNotarTerminModus(inv.id) === "vorschlaege" && (
                          <NotarVorschlaegeBlock
                            investmentId={inv.id}
                            onChange={() => forceUpdate(n => n + 1)}
                            toast={toast}
                          />
                        )}

                        {/* Portal-Freigabe für Notartermin */}
                        {(() => {
                          const portalFreigegeben = getNotarTerminPortalFreigabe(inv.id);
                          const portalFreigegebenAt = getNotarTerminPortalFreigabeAt(inv.id);
                          if (portalFreigegeben) {
                            return (
                              <div className="border rounded-lg p-3 bg-muted/30 flex items-start gap-2 flex-wrap">
                                <p className="text-xs text-[hsl(var(--success))] flex items-center gap-1.5 flex-1 min-w-0">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    Notartermin im Kundenportal sichtbar
                                    {portalFreigegebenAt && (
                                      <span className="text-muted-foreground ml-1">
                                        (freigegeben am {new Date(portalFreigegebenAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })})
                                      </span>
                                    )}
                                  </span>
                                </p>
                                {canEditNotar && (
                                  <button
                                    className="text-xs uppercase tracking-wide hover:underline font-semibold text-primary shrink-0"
                                    onClick={async () => {
                                      const ok = await confirmDialog({
                                        title: "Notartermin ändern?",
                                        description: "Die aktuelle Freigabe im Kundenportal wird zurückgezogen. Danach kannst du einen neuen Termin eintragen, etwa nach einer Verschiebung, und ihn erneut freigeben.",
                                        confirmText: "Freigabe zurückziehen",
                                        cancelText: "Termin behalten",
                                      });
                                      if (!ok) return;
                                      try {
                                        // Atomar: Freigabe zurückziehen + Vorschläge leeren + Bestätigung verwerfen
                                        zurueckziehenNotarTerminPortal(inv.id);
                                        toast({ title: "Freigabe zurückgezogen", description: "Du kannst jetzt einen neuen Notartermin eintragen und erneut freigeben." });
                                        forceUpdate(n => n + 1);
                                      } catch (err: any) {
                                        console.error("zurueckziehenNotarTerminPortal failed:", err);
                                        toast({ title: "Aktion fehlgeschlagen", description: err?.message || "Bitte erneut versuchen.", variant: "destructive" });
                                      }
                                    }}
                                  >
                                    Termin ändern
                                  </button>
                                )}
                              </div>
                            );
                          }
                          if (canEditNotar) {
                            return (
                              <div className="flex items-center gap-2 border-b pb-2">
                                <span className="text-sm flex-1">Notartermin im Kundenportal</span>
                                <KundenspracheHinweis kontaktId={id} />
                                <button
                                  className="text-xs uppercase tracking-wide hover:underline font-semibold"
                                  style={{ color: "hsl(var(--alert-green))" }}
                                  onClick={async () => {
                                    try {
                                      // Bei Vorschlagsmodus: aktuell gepflegte (valide) Vorschläge JETZT
                                      // ins "Freigegeben"-Array übernehmen, damit der Kunde sie im Portal sieht.
                                      const aktuelleVorschlaege = (getNotarTerminVorschlaege(inv.id) || []).filter(v => !!v.datum && !!v.uhrzeit);
                                      const sollBestaetigtVerwerfen =
                                        !!getNotarTerminBestaetigt(inv.id) && aktuelleVorschlaege.length > 0;

                                      // ATOMAR: Portal-Freigabe + Pipeline-Stufe in EINEM Meta-Update,
                                      // damit kein nachgelagerter updateInvestment()-Call die Freigabe-Felder
                                      // überschreibt (war Ursache der "Speichern fehlgeschlagen"-Meldung).
                                      const stufeMuss = inv.pipelineStufe !== "notar" && inv.pipelineStufe !== "faelligkeit" && inv.pipelineStufe !== "abrechnung" && inv.pipelineStufe !== "abgeschlossen";
                                      freigebenNotarTerminPortal(inv.id, {
                                        vorschlaegeFreigegeben: aktuelleVorschlaege,
                                        clearBestaetigt: sollBestaetigtVerwerfen,
                                        pipelineStufe: stufeMuss ? "notar" : undefined,
                                      });
                                      if (stufeMuss) {
                                        updateKontakt(id || "", { pipelineStufe: "notar" });
                                        notifyKundePipelineStufe(id || "", "notar");
                                      }
                                      const nd = getInvestmentNotarData(inv.id);
                                      notifyKundeNotartermin(id || "", nd.datum || inv.notarTermin || "", nd.uhrzeit || inv.notarUhrzeit || "");

                                      // Gesetzter Termin: Die Terminmails gehen erst hier hinaus, mit
                                      // vollständigem Stand. Unveränderter Stand: nichts neu, geänderter
                                      // Stand: eine Änderungsmail. Siehe src/lib/notarterminMail.ts.
                                      let terminMail: NotarterminFreigabeVersand | null = null;
                                      if (getNotarTerminModus(inv.id) === "gesetzt") {
                                        const kontaktRowNotar = cacheGet("kontakte").find((k: any) => k.id === id);
                                        const vpIdNotar: string | undefined = kontaktRowNotar?.zustaendig_id || undefined;
                                        const vpProfile = vpIdNotar ? cacheGet("profiles").find((p: any) => p.id === vpIdNotar) : undefined;
                                        terminMail = await notarterminFreigabeMails({
                                          investmentId: inv.id,
                                          kundeName: `${kunde.vorname} ${kunde.nachname}`,
                                          kundeEmail: kunde.email,
                                          kontaktId: id,
                                          datum: nd.datum || inv.notarTermin || "",
                                          uhrzeit: nd.uhrzeit || inv.notarUhrzeit || "",
                                          notarName: nd.name || inv.notarName || "",
                                          notarAdresse: nd.adresse || inv.notarAdresse || "",
                                          notarEmail: getNotarEmail(inv.id),
                                          objektName: inv.objektTitel || "",
                                          wohnungName: inv.weNr || "",
                                          portalUrl: oeffentlicheAdresse("/kunde/investments"),
                                          vp: { userId: vpIdNotar, name: vpProfile?.name || user.name, email: vpProfile?.email },
                                          bestaetigterTermin: getNotarTerminBestaetigt(inv.id),
                                        }, getInvestmentMetaField<string>(inv.id, NOTAR_MAIL_STAND_FELD, ""));
                                        if (terminMail.merken) setInvestmentMetaFields(inv.id, { [NOTAR_MAIL_STAND_FELD]: terminMail.merken });
                                      }

                                      // Der Kunde erfaehrt von der Freigabe bisher nur, wenn er
                                      // zufaellig ins Portal schaut. Die Vorlage dafuer lag seit
                                      // Langem im System, wurde aber von keiner Stelle verschickt.
                                      if (aktuelleVorschlaege.length > 0 && kunde?.email) {
                                        // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
                                        await stelleKundenspracheSicher(id);
                                        const bitteBis = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                          .toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
                                        void supabase.functions.invoke("send-transactional-email", {
                                          body: {
                                            templateName: "notartermin-auswahl",
                                            recipientEmail: kunde.email,
                                            // Alle Vorschläge im Schlüssel: Ändert sich nach „Termin ändern“
                                            // nur der zweite Vorschlag, geht trotzdem eine neue Mail hinaus.
                                            idempotencyKey: `notartermin-auswahl:${inv.id}:${aktuelleVorschlaege.map((v) => `${v.datum}_${v.uhrzeit}`).join(",")}`,
                                            kontaktId: id,
                                            templateData: {
                                              kundeName: [kunde.vorname, kunde.nachname].filter(Boolean).join(" "),
                                              objektName: inv.objektTitel || kunde.objekt || "",
                                              wohnungName: inv.weNr || "",
                                              notarName: nd.notarName || inv.notarName || "",
                                              notarAdresse: nd.notarAdresse || inv.notarAdresse || "",
                                              terminVorschlaege: aktuelleVorschlaege.map((v) => ({
                                                datum: v.datum
                                                  ? new Date(v.datum).toLocaleDateString("de-DE", {
                                                      weekday: "long", day: "numeric", month: "long", year: "numeric",
                                                    })
                                                  : "",
                                                uhrzeit: v.uhrzeit || "",
                                              })),
                                              portalUrl: oeffentlicheAdresse("/kunde/investments"),
                                              bitteBis,
                                              berater: {
                                                name: user.name,
                                                // Notar ist Gruppe F und siezt, auch in der Unterschriftszeile.
                                                rolle: "Ihr Ansprechpartner bei MOREImmo",
                                              },
                                            },
                                          },
                                        }).catch((e) => console.warn("notartermin-auswahl mail failed:", e));
                                      }

                                      const mailHinweis = terminMail ? freigabeRueckmeldung(terminMail) : null;
                                      toast({
                                        title: "Notartermin freigegeben \u2713",
                                        description: mailHinweis
                                          ? `Der Kunde sieht den Termin im Portal. ${mailHinweis.text}`
                                          : aktuelleVorschlaege.length > 0 && kunde?.email
                                            ? "Der Kunde sieht die Termine im Portal und hat eine E-Mail bekommen."
                                            : "Der Kunde kann den Notartermin jetzt im Portal sehen.",
                                        ...(mailHinweis?.problem ? { variant: "destructive" as const } : {}),
                                      });
                                      forceUpdate(n => n + 1);
                                    } catch (err: any) {
                                      console.error("Notartermin-Freigabe failed:", err);
                                      toast({ title: "Freigabe fehlgeschlagen", description: err?.message || "Bitte erneut versuchen.", variant: "destructive" });
                                    }
                                  }}
                                >
                                  FREIGEBEN
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Zeitstempel "Notartermin eingetragen" entfernt – redundant zur Freigabe-Anzeige */}

                        {hasTermin && inv.pipelineStufe === "notar" && (
                          <div className="border rounded-lg p-3 border-primary/30 bg-primary/5">
                            <p className="text-sm">📅 Notartermin: <strong>{terminDatum}</strong> um <strong>{terminUhrzeit} Uhr</strong> – <span className="text-muted-foreground">Nach dem Termin springt der Status automatisch auf „Fälligkeit".</span></p>
                          </div>
                        )}

                        {/* Aftersales-Beratungsdokument (am Notartermin freigeschaltet) */}
                        {hasTermin && (
                          <AftersalesBeratungCard
                            investmentId={inv.id}
                            kontaktId={id || ""}
                            kundeName={`${kunde.vorname} ${kunde.nachname}`.trim()}
                            kundeEmail={kunde.email}
                            vpName={user.name}
                            notarDatum={terminDatum}
                            notarUhrzeit={terminUhrzeit}
                            kundeAnschrift={[kunde.strasse, [kunde.plz, kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                            objektAdresse={[inv.objektTitel, inv.weNr ? `WE ${inv.weNr}` : null].filter(Boolean).join(" – ")}
                            meta={(inv as any).meta || inv}
                            onChanged={() => forceUpdate(n => n + 1)}
                          />
                        )}
                      </div>

                      {/* Notarfoto – direkt unter Notardaten */}
                      {user.role === "vertriebspartner" || isBackofficeOrAdmin ? (() => {
                        const notarFoto = getInvestmentNotarFoto(inv.id);
                        return (
                          <div>
                            <Label className="text-xs font-semibold mb-2 block">Notarfoto</Label>
                            {notarFoto ? (
                              <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                                <div className="bg-primary/10 text-primary font-bold text-xs px-2 py-1 rounded">📸</div>
                                <div className="min-w-0 flex-1 basis-48 break-words">
                                  <span className="text-sm font-semibold">{notarFoto}</span>
                                  <p className="text-[10px] text-muted-foreground">Notarfoto hochgeladen</p>
                                </div>
                                {isBackofficeOrAdmin && (
                                  <Button size="sm" variant="outline" className="ml-auto shrink-0 text-xs h-7" onClick={async () => {
                                    // Derselbe Pfad wie beim Hochladen unten. Bis zum 04.10.2026
                                    // zeigte der Knopf nur den Dateinamen als Hinweis an.
                                    const adresse = await resolveUnterlagenUrl(`notarfotos/${id}/${inv.id}/${notarFoto}`);
                                    if (!adresse) {
                                      toast({ title: "Notarfoto nicht gefunden", description: "Die Datei ließ sich nicht öffnen. Bitte lade sie erneut hoch.", variant: "destructive" });
                                      return;
                                    }
                                    window.open(adresse, "_blank", "noopener,noreferrer");
                                  }}>
                                    <Eye className="h-3 w-3 mr-1" /> Anzeigen
                                  </Button>
                                )}
                              </div>
                            ) : user.role === "vertriebspartner" ? (
                              <div>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  id={`notarfoto-input-${inv.id}`}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                      const ext = file.name.split(".").pop() || "jpg";
                                      const filename = `Notarfoto_${kunde.vorname}_${kunde.nachname}_${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\./g, "-")}.${ext}`;
                                      const storagePath = `notarfotos/${id}/${inv.id}/${filename}`;
                                      const { error } = await supabase.storage.from("unterlagen").upload(storagePath, file, { upsert: true });
                                      if (error) throw error;
                                      setInvestmentNotarFoto(inv.id, filename);
                                      notifyNotarfotoHochgeladen(`${kunde.vorname} ${kunde.nachname}`, user.name, id || "");
                                      toast({ title: "Notarfoto hochgeladen ✓", description: "Admins wurden benachrichtigt." });
                                      forceUpdate(n => n + 1);
                                    } catch (err: any) {
                                      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
                                    }
                                    e.target.value = "";
                                  }}
                                />
                                <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => document.getElementById(`notarfoto-input-${inv.id}`)?.click()}>
                                  <Upload className="h-3 w-3" /> Notarfoto hochladen
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Noch kein Notarfoto vorhanden.</p>
                            )}
                          </div>
                        );
                      })() : null}

                      {/* Empfehlungsprogramm-Hinweis für VP */}
                      {isVPNotar && hasTermin && (
                        <>
                          <div className="border-t my-4" />
                          <div className="border rounded-lg p-3 border-accent/50 bg-accent/10">
                            <p className="text-sm">🎁 <strong>Empfehlungsprogramm nicht vergessen!</strong></p>
                            <p className="text-xs text-muted-foreground mt-1">Sprich mit {kunde.vorname} {kunde.nachname} über das Empfehlungsprogramm.</p>
                            <Button size="sm" variant="outline" className="mt-2 text-xs gap-1.5" asChild>
                              <a href={`/empfehlungen?kunde=${id}`}>
                                <ExternalLink className="h-3 w-3" /> Zum Empfehlungsprogramm
                              </a>
                            </Button>
                          </div>
                        </>
                      )}
                      </>
                    ) : (
                      <div className="border rounded-lg p-3 bg-muted/30 text-center">
                        <p className="text-sm text-muted-foreground">Der Notartermin kann erst eingetragen werden, nachdem der Aufnahmebogen ausgefüllt wurde.</p>
                      </div>
                    )}
                    {/* Musterkunden-Vorschau: Aftersales-Beratungsdokument für Frank Otto sichtbar machen,
                        damit Admin/VP einsehen kann, wie das Beratungsprotokoll aussieht. */}
                    {id === "086acaeb-0ff9-4577-b114-3b973797d635" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">Musterkunden-Vorschau</span>
                          <span className="text-[11px] text-muted-foreground">So sieht das Aftersales-Beratungsdokument am Notartermin aus</span>
                        </div>
                        <AftersalesBeratungCard
                          investmentId={inv.id}
                          kontaktId={id || ""}
                          kundeName={`${kunde.vorname} ${kunde.nachname}`.trim()}
                          kundeEmail={kunde.email}
                          vpName={user.name}
                          notarDatum={terminDatum || "10.06.2026"}
                          notarUhrzeit={terminUhrzeit || "10:00"}
                          kundeAnschrift={[kunde.strasse, [kunde.plz, kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                          objektAdresse={[inv.objektTitel, inv.weNr ? `WE ${inv.weNr}` : null].filter(Boolean).join(" – ")}
                          meta={(inv as any).meta || inv}
                          onChanged={() => forceUpdate(n => n + 1)}
                        />
                      </div>
                    )}
                  </div>
                );
              })()
              ) : (
                <div className="bg-muted/50 rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  <span>
                    {!getRvSigned(inv.id)
                      ? "Notar wird nach unterschriebener Reservierungsvereinbarung freigeschaltet."
                      : `Notar ist ab der Stufe Reservierung bedienbar. Dieser Vorgang steht auf „${stufenFilterLabel(inv.pipelineStufe)}“.`}
                  </span>
                </div>
              )}
              </KundenprofilAbschnitt>
            </Card>

            {/* ── Abwicklung / Fälligkeit (right column) ── */}
            {["notar", "notar_ohne_gs", "notar_mit_gs", "faelligkeit", "abrechnung", "abgeschlossen"].includes(inv.pipelineStufe) && ABWICKLUNG_ROLLEN.includes(user.role) ? (() => {
            const abw = getAbwicklungDaten(inv.id);
            // Ein Partner pflegt nur beim eigenen Kunden; der Teamleiter sieht die
            // Karte beim Kunden eines Teammitglieds lesend (die Datenbank lehnt
            // ihn ohnehin ab).
            const isAdminAbw = ABWICKLUNG_ROLLEN.includes(user.role)
              && (user.role !== "vertriebspartner" || isAssignedBerater);
            // Geldfelder nur Admin, Inhaber, Backoffice; der Partner sieht sie lesend.
            const darfGeldfelder = ABWICKLUNG_GELD_ROLLEN.includes(user.role);

            const saveAbw = (updated: AbwicklungDaten) => {
              // Speichert den Datensatz UND den flachen Portal-Spiegel in einem
              // Vorgang, siehe abwicklungStore.ts.
              saveAbwicklungDaten(inv.id, updated);
              // Hinweis: Die Pipeline darf NICHT durch das Setzen des Fälligkeits-
              // datums auf "faelligkeit" springen. Der Wechsel notar → faelligkeit
              // erfolgt ausschließlich automatisch, sobald Notar-Datum + Uhrzeit
              // in der Vergangenheit liegen (siehe Auto-Advance oben & bulk_recompute_pipeline).
              // Auch "Kaufpreis eingegangen" verändert die Stufe NICHT – sie bleibt
              // "faelligkeit", bis die Provisionsrechnung gestellt wurde.
              // Abrechnung setzt nur, wer die Provisionsrechnung stellen darf,
              // siehe darfAbschlussStufeWechseln.
              const zielStufe =
                updated.auszahlungBestaetigt && darfGeldfelder && inv.pipelineStufe !== "abgeschlossen"
                  ? "abgeschlossen"
                  : updated.provisionsRechnungGestellt && darfGeldfelder && ["notar", "faelligkeit"].includes(inv.pipelineStufe)
                    ? "abrechnung"
                    : null;
              forceUpdate(n => n + 1);
              reloadKunde();
              if (!zielStufe) return;
              // Die Stufe erst, wenn die Abwicklung wirklich gespeichert ist,
              // und die Kundenmeldung erst nach der Stufe (M19, 04.10.2026).
              // Vorher lief beides sofort, auch wenn die Datenbank den Haken
              // ablehnte, und der Kunde bekam „abgeschlossen“ trotzdem.
              void (async () => {
                if (!(await abwicklungGespeichert(inv.id))) { reloadKunde(); return; }
                if (!(await updateInvestment(inv.id, { pipelineStufe: zielStufe }))) { reloadKunde(); return; }
                try {
                  await updateKontakt(id || "", zielStufe === "abgeschlossen" ? { pipelineStufe: zielStufe, status: "kunde" } : { pipelineStufe: zielStufe });
                } catch {
                  reloadKunde();
                  return;
                }
                if (zielStufe === "abgeschlossen") notifyKundePipelineStufe(id || "", "abgeschlossen");
                reloadKunde();
              })();
            };

            return (
              <Card id={`card-abwicklung-${inv.id}`} className="p-6 border-primary/20 bg-primary/5 transition-all duration-500">
                <div className="w-8 h-1 bg-primary mb-3" />
                <KundenprofilAbschnitt
                  kopf={(
                    <div className="flex items-center gap-2 mb-4">
                      <ClipboardCheck className="h-5 w-5 text-primary" />
                      <h3 className="font-bold">Abwicklung</h3>
                    </div>
                  )}
                >

                <div className="space-y-4">
                  {/* Die beiden Beschriftungen tragen je einen Hinweis auf das
                      Kundenportal. Nebeneinander stünde auf dem Telefon mehr
                      Hinweis als Feld, deshalb erst ab `sm` zweispaltig. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                        Kaufpreisfälligkeit
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wide">
                          <Eye className="h-2.5 w-2.5" /> Im Kundenportal sichtbar
                        </span>
                      </Label>
                      <DateInput
                        value={abw.kaufpreisfaelligkeitDatum || ""}
                        onChange={v => saveAbw({ ...abw, kaufpreisfaelligkeitDatum: v })}
                        disabled={!isAdminAbw}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                        Grundbuch-Eintrag Datum
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wide">
                          <Eye className="h-2.5 w-2.5" /> Im Kundenportal sichtbar
                        </span>
                      </Label>
                      <DateInput
                        value={abw.grundbuchDatum || ""}
                        onChange={v => saveAbw({ ...abw, grundbuchDatum: v })}
                        disabled={!isAdminAbw}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {!darfGeldfelder && (
                      <p className="text-xs text-muted-foreground">Kaufpreiseingang, Provisionsrechnung und Auszahlung werden vom Backoffice gepflegt.</p>
                    )}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={abw.kaufpreisEingegangen || false}
                        onCheckedChange={(c) => saveAbw({
                          ...abw,
                          kaufpreisEingegangen: !!c,
                          kaufpreisEingegangenDatum: c ? (abw.kaufpreisEingegangenDatum || new Date().toISOString().split("T")[0]) : undefined,
                        })}
                        disabled={!darfGeldfelder}
                      />
                      <Label className="text-sm">Kaufpreis eingegangen</Label>
                      {abw.kaufpreisEingegangen && abw.kaufpreisEingegangenDatum && (
                        <span className="text-[10px] text-muted-foreground ml-2">({abw.kaufpreisEingegangenDatum})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={abw.grundbuchEingetragen || false}
                        onCheckedChange={(c) => saveAbw({
                          ...abw,
                          grundbuchEingetragen: !!c,
                          grundbuchDatum: c ? (abw.grundbuchDatum || new Date().toISOString().split("T")[0]) : abw.grundbuchDatum,
                        })}
                        disabled={!isAdminAbw}
                      />
                      <Label className="text-sm">Grundbucheintrag erfolgt</Label>
                      {abw.grundbuchEingetragen && abw.grundbuchDatum && (
                        <span className="text-[10px] text-muted-foreground ml-2">({abw.grundbuchDatum})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={abw.provisionsRechnungGestellt || false}
                        onCheckedChange={(c) => saveAbw({
                          ...abw,
                          provisionsRechnungGestellt: !!c,
                          provisionsRechnungDatum: c ? (abw.provisionsRechnungDatum || new Date().toISOString().split("T")[0]) : undefined,
                        })}
                        disabled={!darfGeldfelder}
                      />
                      <Label className="text-sm">Provisionsrechnung gestellt</Label>
                      {abw.provisionsRechnungGestellt && abw.provisionsRechnungDatum && (
                        <span className="text-[10px] text-muted-foreground ml-2">({abw.provisionsRechnungDatum})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={abw.auszahlungBestaetigt || false}
                        onCheckedChange={(c) => saveAbw({
                          ...abw,
                          auszahlungBestaetigt: !!c,
                          auszahlungDatum: c ? (abw.auszahlungDatum || new Date().toISOString().split("T")[0]) : undefined,
                        })}
                        disabled={!darfGeldfelder}
                      />
                      <Label className="text-sm">Auszahlung bestätigt</Label>
                      {abw.auszahlungBestaetigt && abw.auszahlungDatum && (
                        <span className="text-[10px] text-muted-foreground ml-2">({abw.auszahlungDatum})</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Übergabetermin</Label>
                    <DateInput
                      value={abw.uebergabeDatum || ""}
                      onChange={v => saveAbw({ ...abw, uebergabeDatum: v })}
                      disabled={!isAdminAbw}
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Anmerkungen</Label>
                    <Input
                      value={abw.anmerkungen || ""}
                      onChange={e => {
                        const updated = { ...abw, anmerkungen: e.target.value };
                        saveAbwicklungDaten(inv.id, updated);
                        forceUpdate(n => n + 1);
                      }}
                      placeholder="Interne Notizen..."
                      disabled={!isAdminAbw}
                    />
                  </div>

                  <div className="border rounded-lg p-3 bg-muted/30 text-xs text-muted-foreground space-y-1">
                    <p>📋 <strong>Statusübergänge:</strong></p>
                    <p>• Kaufpreisfälligkeit eingetragen → Status „Fälligkeit"</p>
                    <p>• Provisionsrechnung gestellt → Status „Abrechnung"</p>
                    <p>• Auszahlung bestätigt → Status „Abgeschlossen"</p>
                  </div>

                  <div className="border rounded-lg p-3 bg-primary/5 border-primary/20 text-xs text-muted-foreground flex items-start gap-2 mt-2">
                    <Eye className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <p><strong>Kundenportal:</strong> Kaufpreisfälligkeit und Grundbuch-Eintragsdatum werden dem Kunden im Kundenportal unter „Fälligkeit" angezeigt.</p>
                  </div>
                </div>
                </KundenprofilAbschnitt>
              </Card>
            );
          })() : null}

            {/* ── Kundenordner (Backoffice uploads) ── */}
            <Card id={`card-kundenordner-${inv.id}`} className="p-6 border-primary/20 bg-primary/5 transition-all duration-500">
              <div className="w-8 h-1 bg-primary mb-3" />
              <KundenprofilAbschnitt
                kopf={(
                  <div className="flex items-center gap-2 mb-1">
                    <FolderOpen className="h-5 w-5 text-primary" />
                    <h3 className="font-bold">Kundenordner</h3>
                  </div>
                )}
              >
              <p className="text-[10px] text-muted-foreground mb-4">ℹ️ Der Kundenordner wird dem Kunden erst nach dem Notartermin im Kundenportal angezeigt.</p>
              {(() => {
                  const koDocs = getKundenordnerByInvestment(inv.id);
                  const isBackofficeRole = ["admin", "inhaber", "vertriebspartner", "backoffice", "buchhaltung", "setterin"].includes(user.role);
                  const visibleKats = getVisibleKundenordnerKategorien(inv.id);
                  const renames = getKundenordnerRenames(inv.id);
                  const rvPdfFile = getInvestmentRvPdf(inv.id);
                  const rvSigned = getRvSigned(inv.id);

                  // Check Darlehensvertrag & Grundschuld synced from Finanzierung + resolve URLs
                  const finDataKo = getFinanzierung(inv.id);
                  const finSyncMap: Record<string, { synced: boolean; fileUrl?: string }> = {};
                  for (const a of finDataKo.angebote) {
                    for (const d of (a.dokumente || [])) {
                      if ((d.name === "Darlehensvertrag" || d.name === "Grundschuld") && d.status !== "none") {
                        finSyncMap[d.name] = { synced: true, fileUrl: d.fileUrl };
                      }
                    }
                  }
                  const finSyncDV = !!finSyncMap["Darlehensvertrag"]?.synced;
                  const finSyncGS = !!finSyncMap["Grundschuld"]?.synced;

                  return (
                    <div className="space-y-2">
                      {(finSyncDV || finSyncGS) && (
                        <p className="text-[10px] text-primary bg-primary/5 border border-primary/20 rounded p-2">
                          ℹ️ „Darlehensvertrag" und „Grundschuld" werden automatisch aus der Finanzierung übernommen und müssen hier nicht separat hochgeladen werden.
                        </p>
                      )}
                      {visibleKats.map(kat => {
                        const displayName = renames[kat] || kat;
                        const doc = koDocs.find(d => d.kategorie === kat);

                        // Auto-link Reservierungsvertrag to RV PDF
                        const isRV = kat === "Reservierungsvertrag";
                        const hasLinkedRV = isRV && rvSigned && rvPdfFile;

                        // Auto-link Darlehensvertrag from Finanzierung
                        const isDV = kat === "Darlehensvertrag";
                        const hasLinkedDV = isDV && finSyncDV && !doc;

                        // Auto-link Grundschuld from Finanzierung
                        const isGS = kat === "Grundschuld";
                        const hasLinkedGS = isGS && finSyncGS && !doc;

                        const isSynced = hasLinkedDV || hasLinkedGS;

                        return (
                          <div key={kat} className="flex items-center gap-3 bg-card rounded-lg border p-3">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${doc || hasLinkedRV || isSynced ? "bg-[hsl(var(--success))]" : "bg-muted-foreground/30"}`} />
                            <div className="flex-1 min-w-0">
                              {isBackofficeRole ? (
                                <span className="text-sm font-medium cursor-pointer hover:text-primary" onClick={async () => {
                                  const newName = await abfrageDialog({
                                    title: "Dokumenttitel ändern",
                                    description: `Der Titel gilt nur in diesem Kundenordner. Ursprünglich heißt das Dokument „${kat}“.`,
                                    defaultValue: displayName,
                                    confirmText: "Titel übernehmen",
                                  });
                                  if (newName && newName !== kat) {
                                    const updated = { ...renames, [kat]: newName };
                                    setKundenordnerRenames(inv.id, updated);
                                    forceUpdate(n => n + 1);
                                  }
                                }}>{displayName}</span>
                              ) : (
                                <span className="text-sm font-medium">{displayName}</span>
                              )}
                              {doc && <span className="text-[10px] text-muted-foreground ml-2">({doc.filename})</span>}
                              {doc && !doc.freigegeben && <span className="text-[10px] text-[hsl(var(--warning))] ml-1">• Nicht freigegeben</span>}
                              {doc && doc.freigegeben && <span className="text-[10px] text-[hsl(var(--success))] ml-1">• Freigegeben</span>}
                              {hasLinkedRV && !doc && <span className="text-[10px] text-muted-foreground ml-2">(RV verknüpft)</span>}
                              {isSynced && !doc && <span className="text-[10px] text-primary ml-2">(aus Finanzierung synchronisiert)</span>}
                            </div>
                            {doc ? (
                              <div className="flex gap-1 shrink-0 items-center">
                                {doc.fileUrl && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openUnterlage(doc.fileUrl)}>
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                )}
                                {isBackofficeRole && (
                                  <>
                                    {doc.freigegeben ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-normal">
                                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" /> Freigegeben
                                      </span>
                                    ) : (
                                      <button
                                        className="text-xs uppercase tracking-wide flex items-center gap-1 hover:underline"
                                        style={{ color: "hsl(var(--alert-green))" }}
                                        onClick={() => {
                                          const all = getKundenordnerByInvestment(inv.id);
                                          const idx = all.findIndex(d => d.id === doc.id);
                                          if (idx >= 0) {
                                            all[idx] = { ...all[idx], freigegeben: true };
                                            updateKundenordnerDokument(doc.id, { freigegeben: true });
                                            notifyKundeKundenordnerDokument(id || "", doc.kategorie || "Dokument");
                                            toast({ title: "Für Kunde freigegeben ✓" });
                                            forceUpdate(n => n + 1);
                                          }
                                        }}
                                      >
                                        Freigeben
                                      </button>
                                    )}
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => {
                                      removeKundenordnerDokument(doc.id);
                                      toast({ title: "Dokument entfernt ✓" });
                                      forceUpdate(n => n + 1);
                                    }}><Trash2 className="h-3 w-3" /></Button>
                                  </>
                                )}
                              </div>
                            ) : hasLinkedRV ? (
                              <Button size="sm" variant="outline" className="h-7 px-3 text-xs gap-1" onClick={() => toast({ title: "PDF öffnen", description: rvPdfFile })}>
                                <Eye className="h-3 w-3" /> Anzeigen
                              </Button>
                            ) : isSynced ? (
                              <div className="flex gap-1 shrink-0 items-center">
                                {finSyncMap[kat]?.fileUrl ? (
                                  <Button size="sm" variant="outline" className="h-7 px-3 text-xs gap-1" onClick={() => openUnterlage(finSyncMap[kat].fileUrl)}>
                                    <Eye className="h-3 w-3" /> Anzeigen
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">Aus Finanzierung</span>
                                )}
                              </div>
                            ) : isBackofficeRole ? (
                              <div className="flex gap-1 shrink-0">
                                <Button size="sm" variant="outline" className="h-7 px-3 text-xs gap-1" onClick={() => {
                                  const fileInput = document.createElement("input");
                                  fileInput.type = "file";
                                  fileInput.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
                                  fileInput.style.display = "none";
                                  document.body.appendChild(fileInput);
                                  fileInput.onchange = async (ev) => {
                                    const file = (ev.target as HTMLInputElement).files?.[0];
                                    document.body.removeChild(fileInput);
                                    if (!file) return;
                                    try {
                                      const ext = file.name.split(".").pop() || "pdf";
                                      const filename = `${displayName.replace(/\s+/g, "_")}_${kunde.nachname}.${ext}`;
                                      const storagePath = `kundenordner/${id}/${inv.id}/${sanitizeStorageKey(kat.replace(/\s+/g, "_"))}_${Date.now()}.${ext}`;
                                      const { error: uploadErr } = await supabase.storage.from("unterlagen").upload(storagePath, file, { upsert: true });
                                      if (uploadErr) throw uploadErr;
                                      addKundenordnerDokument({
                                        investmentId: inv.id,
                                        kategorie: kat,
                                        filename,
                                        uploadedBy: user.name,
                                        uploadedAt: new Date().toISOString(),
                                        fileUrl: storagePath,
                                        freigegeben: false,
                                      });
                                      toast({ title: `${displayName} hochgeladen ✓` });
                                      forceUpdate(n => n + 1);

                                      // ── E-Mail-Versand bei Kaufvertrag oder Kaufpreisfälligkeit ──
                                      // Für externe E-Mail-Empfänger eine Signed URL mit 7-Tage-TTL erzeugen
                                      const emailDokumentUrl = (await resolveUnterlagenUrl(storagePath, 60 * 60 * 24 * 7)) || "";
                                      const kundeName = `${kunde.vorname} ${kunde.nachname}`;
                                      const objektName = (inv as any).objektTitel || "";
                                      const wohnungName = (inv as any).wohnungNr || "";

                                      if (kat === "Kaufvertrag") {
                                        const empfaenger = [BUERO_EMAIL];
                                        for (const email of empfaenger) {
                                          try {
                                            await supabase.functions.invoke("send-transactional-email", {
                                              body: {
                                                templateName: "kaufvertrag-hochgeladen",
                                                recipientEmail: email,
                                                idempotencyKey: `kaufvertrag-${inv.id}-${email}-${Date.now()}`,
                                                templateData: { kundeName, objektName, wohnungName, dokumentUrl: emailDokumentUrl, hochgeladenVon: user.name },
                                              },
                                            });
                                          } catch { /* silent */ }
                                        }
                                      }

                                      if (kat === "Kaufpreisfälligkeit") {
                                        // Das Datum steht am Investment, nicht am Dokument. Ohne
                                        // Eintrag bleibt es leer, dann sagt die Mail genau das.
                                        const faelligRoh = getAbwicklungDaten(inv.id).kaufpreisfaelligkeitDatum || "";
                                        const faelligLesbar = faelligRoh
                                          ? new Date(faelligRoh).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })
                                          : "";
                                        const empfaenger = [BUERO_EMAIL];
                                        for (const email of empfaenger) {
                                          try {
                                            // Ueber sendeVorlagenMail: Die Felder sind gegen die
                                            // Vorlage geprueft, siehe src/lib/mailVersand.ts.
                                            await sendeVorlagenMail({
                                              vorlage: "faelligkeit-hochgeladen",
                                              empfaenger: email,
                                              idempotenzSchluessel: `faelligkeit-${inv.id}-${email}-${Date.now()}`,
                                              felder: {
                                                kundeName,
                                                faelligkeitsdatum: faelligLesbar,
                                                objektName,
                                                wohnungName,
                                                dokumentUrl: emailDokumentUrl,
                                                hochgeladenVon: user.name,
                                                crmUrl: oeffentlicheAdresse(`/kunden/${id}`),
                                              },
                                            });
                                          } catch { /* silent */ }
                                        }
                                      }
                                    } catch (err: any) {
                                      toast({ title: "Upload fehlgeschlagen", description: err.message || "Unbekannter Fehler", variant: "destructive" });
                                    }
                                  };
                                  fileInput.click();
                                }}><Upload className="h-3 w-3" /> Hochladen</Button>
                                {/* Delete category button for custom or default */}
                                <Button size="sm" variant="ghost" className="h-7 px-1 text-xs text-destructive hover:text-destructive" onClick={async () => {
                                  const ok = await confirmDialog({
                                    title: `„${displayName}“ aus dem Kundenordner entfernen?`,
                                    description: "Die Zeile verschwindet aus diesem Kundenordner. Bereits hochgeladene Dateien bleiben erhalten.",
                                    confirmText: "Entfernen",
                                    cancelText: "Behalten",
                                    variant: "destructive",
                                  });
                                  if (!ok) return;
                                  const custom = getCustomKundenordnerKategorien(inv.id);
                                  if (custom.includes(kat)) {
                                    setCustomKundenordnerKategorien(inv.id, custom.filter(k => k !== kat));
                                  } else {
                                    const removed = getRemovedKundenordnerKat(inv.id);
                                    setRemovedKundenordnerKat(inv.id, [...removed, kat]);
                                  }
                                  forceUpdate(n => n + 1);
                                }}><XCircle className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Ausstehend</span>
                            )}
                          </div>
                        );
                      })}

                      {/* VP/Admin: Upload eigenes Dokument with custom title */}
                      {isBackofficeRole && (
                        <>
                          <Button size="sm" variant="outline" className="w-full text-xs gap-1 mt-2 border-dashed" onClick={() => setEigenDocInvId(inv.id)}>
                            <Upload className="h-3 w-3" /> Eigenes Dokument hochladen
                          </Button>
                          <Dialog open={eigenDocInvId === inv.id} onOpenChange={open => { if (!open) { setEigenDocInvId(null); setEigenDocTitel(""); } }}>
                            <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-sm">
                              <DialogHeader><DialogTitle>Titel des Dokuments</DialogTitle></DialogHeader>
                              <div className="space-y-4 pt-2">
                                <Input
                                  placeholder="z. B. Vollmacht, Sonderwünsche …"
                                  value={eigenDocTitel}
                                  onChange={e => setEigenDocTitel(e.target.value)}
                                  autoFocus
                                  onKeyDown={e => { if (e.key === "Enter") { handleEigenDocUpload(inv); } }}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => { setEigenDocInvId(null); setEigenDocTitel(""); }}>Abbrechen</Button>
                                  <Button size="sm" onClick={() => handleEigenDocUpload(inv)} disabled={!eigenDocTitel.trim()}>OK</Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </>
                      )}

                      <div className="mt-3 text-xs text-muted-foreground">
                        {/* Dieselbe Zahl wie in der Unternavigation, aus einer Quelle. */}
                        {kundenordnerStand(inv.id).hinterlegt} von {kundenordnerStand(inv.id).gesamt} Dokumenten hinterlegt
                      </div>
                    </div>
                  );
                })()}
              </KundenprofilAbschnitt>
            </Card>
          </>
        ) : (
          /* Ebenfalls je eine Zelle, sonst rutschen die Paare darüber. */
          <>
            {/* Fälligkeit ist die gesperrte Fassung der Abwicklung, deshalb deren Sprungziel. */}
            <LockedPhaseCard id={`card-notar-${inv.id}`} title="Notar" reason="Wird nach unterschriebener Reservierungsvereinbarung freigeschaltet." />
            <LockedPhaseCard id={`card-abwicklung-${inv.id}`} title="Fälligkeit" reason="Wird nach unterschriebener Reservierungsvereinbarung freigeschaltet." />
          </>
        )}

        </div>
      </div>
    );
    };


  // ── Vermögensaufbau Tab (Versicherungsexperte) ──
  const beraterUsersForVersicherung = canSeeVermoegenTab ? loadBeraterUsers() : [];

  const handleVersicherungErstgespraech = () => {
    if (!id || !kunde || !versicherungSelectedBerater || !versicherungTerminDatum || !versicherungTerminUhrzeit) return;
    if (!istTerminInZukunft(versicherungTerminDatum, versicherungTerminUhrzeit)) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
      return;
    }
    updateKontakt(id, {
      pipelineStufe: "erstgespraech_geplant",
      status: "kontaktiert" as any,
      versicherungGeeignet: false,
      versicherungNotizen,
      versicherungTerminDatum,
      versicherungTerminUhrzeit,
      versicherungCloser: versicherungSelectedBerater,
      berater: versicherungSelectedBerater,
    });
    addAktivitaet({
      kundeId: id,
      art: "meeting",
      beschreibung: `Erstgespräch gebucht via Versicherungsexperte – Vertriebspartner: ${versicherungSelectedBerater}, ${versicherungTerminDatum} ${versicherungTerminUhrzeit}`,
      von: user.name,
    });
    reloadKunde();
    toast({ title: "Erstgespräch gebucht", description: `Termin am ${versicherungTerminDatum} um ${versicherungTerminUhrzeit} mit ${versicherungSelectedBerater} eingetragen.` });
    navigate("/verloren");
  };

  const handleSaveVersicherungNotizen = () => {
    if (!id) return;
    updateKontakt(id, { versicherungNotizen });
    reloadKunde();
    toast({ title: "Notizen gespeichert" });
  };

  const renderVermoegenaufbau = () => {
    if (!kunde) return null;
    return (
      <div className="space-y-6">
        {/* Beratungsnotizen */}
        <Card className="p-6">
          <div className="w-8 h-1 bg-primary mb-3" />
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Vermögensaufbau – Beratung
          </h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Beratungsnotizen</Label>
              <Textarea
                value={versicherungNotizen}
                onChange={e => setVersicherungNotizen(e.target.value)}
                placeholder="Sparplan-Infos, Beratungsergebnisse, nächste Schritte..."
                rows={5}
              />
            </div>
            <Button size="sm" onClick={handleSaveVersicherungNotizen} className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Notizen speichern
            </Button>
          </div>
        </Card>

        {/* Status-Übersicht */}
        {!isVersicherungsexperte && (
        <Card className="p-6">
          <div className="w-8 h-1 bg-primary mb-3" />
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" /> Status-Übersicht
          </h3>
          {(() => {
            const hasNotizen = !!(kunde.versicherungNotizen || "").trim();
            const hasTermin = !!(kunde.versicherungTerminDatum);
            const erstgespraechGebucht = !!(kunde.versicherungCloser);
            const daysSinceUpdate = kunde.aktualisiert_am ? Math.floor((Date.now() - new Date(kunde.aktualisiert_am).getTime()) / (1000 * 60 * 60 * 24)) : null;

            type VaStatus = "erstberatung" | "in_beratung" | "nachfass" | "erstgespraech_gebucht";
            let status: VaStatus = "erstberatung";
            if (erstgespraechGebucht) status = "erstgespraech_gebucht";
            else if (hasNotizen && hasTermin) status = "in_beratung";
            else if (hasNotizen) status = "in_beratung";
            if (!erstgespraechGebucht && daysSinceUpdate !== null && daysSinceUpdate >= 7) status = "nachfass";

            const statusConfig: Record<VaStatus, { label: string; color: string; icon: React.ReactNode }> = {
              erstberatung: { label: "Erstberatung ausstehend", color: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: <Clock className="h-4 w-4" /> },
              in_beratung: { label: "In Beratung", color: "bg-blue-100 text-blue-800 border-blue-300", icon: <TrendingUp className="h-4 w-4" /> },
              nachfass: { label: "Nachfass nötig", color: "bg-orange-100 text-orange-800 border-orange-300", icon: <AlertTriangle className="h-4 w-4" /> },
              erstgespraech_gebucht: { label: "Erstgespräch gebucht", color: "bg-green-100 text-green-800 border-green-300", icon: <CheckCircle2 className="h-4 w-4" /> },
            };

            const cfg = statusConfig[status];
            return (
              <div className="space-y-4">
                <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${cfg.color}`}>
                  {cfg.icon}
                  {cfg.label}
                </div>
                {/* „Vertriebspartner: Hermann Vogl" passt auf dem Telefon nicht
                    in eine halbe Zeile. Ab `sm` wieder zweispaltig. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Notizen:</span>
                    {hasNotizen ? <Badge variant="default" className="text-[10px]">Vorhanden</Badge> : <Badge variant="outline" className="text-[10px]">Fehlen</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Termin:</span>
                    {hasTermin ? <Badge variant="default" className="text-[10px]">{kunde.versicherungTerminDatum}</Badge> : <Badge variant="outline" className="text-[10px]">Offen</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Vertriebspartner:</span>
                    <span className="font-medium">{kunde.versicherungCloser || "–"}</span>
                  </div>
                  {daysSinceUpdate !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Letzte Änderung:</span>
                      <span className={`font-medium ${daysSinceUpdate >= 14 ? "text-destructive" : daysSinceUpdate >= 7 ? "text-orange-600" : ""}`}>
                        vor {daysSinceUpdate} Tag{daysSinceUpdate !== 1 ? "en" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Card>
        )}

        {/* Erstgespräch beim VP buchen */}
        <Card className="p-6">
          <div className="w-8 h-1 bg-primary mb-3" />
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Erstgespräch beim Vertriebspartner buchen
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Wenn der Kunde für ein Immobilieninvestment mit Sparplan in Frage kommt, buche hier ein Erstgespräch beim zuständigen Vertriebspartner.
          </p>

          {/* Vertriebspartner auswählen */}
          <div className="space-y-3 mb-6">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vertriebspartner mit Buchungskalender</Label>
            {beraterUsersForVersicherung.filter(u => u.buchungslink).length === 0 && (
              <p className="text-xs text-destructive italic">Keine Vertriebspartner mit hinterlegtem Buchungskalender gefunden.</p>
            )}
            <div className="space-y-2">
              {beraterUsersForVersicherung.filter(u => u.buchungslink).map(u => (
                <div
                  key={u.id}
                  className={`flex items-center gap-2 p-3 border rounded-lg transition-colors cursor-pointer ${
                    versicherungSelectedBerater === u.name ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-muted/30"
                  }`}
                  onClick={() => setVersicherungSelectedBerater(u.name)}
                >
                  <UserCheck className={`h-4 w-4 shrink-0 ${versicherungSelectedBerater === u.name ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-sm font-medium flex-1">{u.name}</p>
                  {versicherungSelectedBerater === u.name && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  <Button size="sm" variant="default" className="h-7 text-xs gap-1 shrink-0" onClick={(e) => { e.stopPropagation(); window.open(u.buchungslink, "_blank"); }}>
                    <ExternalLink className="h-3 w-3" /> Buchungskalender
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Termin */}
          <div className="border-t pt-4 space-y-4">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Termin eintragen</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium mb-1 block">Datum *</Label>
                <DateInput value={versicherungTerminDatum} onChange={setVersicherungTerminDatum} className="h-9" minDate={heuteIso()} />
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Uhrzeit *</Label>
                <Input type="time" value={versicherungTerminUhrzeit} onChange={e => setVersicherungTerminUhrzeit(e.target.value)} className="h-9" />
              </div>
            </div>
            <Button
              onClick={handleVersicherungErstgespraech}
              disabled={!versicherungSelectedBerater || !versicherungTerminDatum || !versicherungTerminUhrzeit}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" /> Erstgespräch buchen & Lead übergeben
            </Button>
          </div>
        </Card>
      </div>
    );
  };

  /** Ausschließlich die bestehenden nächsten Schritte je Investment. */
  const renderUebersicht = () => (
    <div className="space-y-4">
      {investments.length === 0 && <Card className="p-5 text-sm text-muted-foreground">Noch kein Investment angelegt.</Card>}
      {[...investments].sort((a, b) => (b.nummer || 0) - (a.nummer || 0)).map(inv => (
        isFinanzierer || isSetterinRole ? (
          <Card key={inv.id} className="p-5 space-y-3">
            <h3 className="font-semibold">Investment {inv.nummer}: Nächste Schritte</h3>
            <p className="text-sm">{getNextSteps(inv.pipelineStufe, false)?.titel || "Keine nächsten Schritte hinterlegt"}</p>
            <Button variant="outline" size="sm" onClick={() => { oeffneInvestment(inv.id, { nachObenRollen: false }); setHighlightInvSteps({ id: inv.id, ts: Date.now() }); }}>Investment öffnen</Button>
          </Card>
        ) : (
        <NaechsteSchritteKarte
          key={inv.id}
          titel={`Investment ${inv.nummer}: Nächste Schritte`}
          investments={[inv]}
          zeigeAbgeschlossene
          isAdmin={isAdminOrInhaber || (user.role as string) === "vertriebsleiter"}
          onOpenInvestment={(invId) => {
            oeffneInvestment(invId, { nachObenRollen: false });
            setHighlightInvSteps({ id: invId, ts: Date.now() });
          }}
        />
        )
      ))}
    </div>
  );

  /**
   * Wie viele Positionen im Kundenordner hinterlegt sind.
   *
   * Steht hier und nicht nur in der Karte, damit die Unternavigation und die
   * Karte dieselbe Zahl nennen. Zwei getrennte Rechnungen an derselben Zahl
   * laufen frueher oder spaeter auseinander.
   */
  const kundenordnerStand = (invId: string) => {
    const hinterlegt = getKundenordnerByInvestment(invId).length
      + (getRvSigned(invId) && getInvestmentRvPdf(invId) ? 1 : 0);
    let ausFinanzierung = 0;
    try {
      const fin = getFinanzierung(invId);
      const namen = new Set<string>();
      for (const a of fin.angebote) {
        for (const d of a.dokumente || []) {
          if (d.status !== "none" && (d.name === "Darlehensvertrag" || d.name === "Grundschuld")) namen.add(d.name);
        }
      }
      ausFinanzierung = namen.size;
    } catch { ausFinanzierung = 0; }
    return { hinterlegt: hinterlegt + ausFinanzierung, gesamt: getVisibleKundenordnerKategorien(invId).length };
  };

  /**
   * Wie viele Unterlagen eines Investments freigegeben sind.
   *
   * Gezaehlt wird alles, was im Investment als Unterlage steht: Bonitaetscheck
   * und Bankpruefung von Person 1, dazu beides von Person 2, sofern es eine
   * Person 2 gibt. Die von Hand ergaenzten Zusatzunterlagen stecken bereits in
   * der Bankpruefungsliste, weil `bankDocsBaseFuerInvestment` sie dort
   * einhaengt.
   *
   * Vorher zaehlte hier nur der Bonitaetscheck von Person 1, deshalb stand in
   * der Liste "1 von 7", waehrend im Investment sichtbar mehr Zeilen hingen.
   *
   * Die Quellen sind dieselben, die auch die Karten benutzen: die Listen aus
   * `bankDocsBaseFuerInvestment`, `docStatuses` des Investments (inklusive der
   * Alt-Schluessel) und der Zustand der Selbstauskunft. Es gibt bewusst keine
   * zweite Zaehlweise daneben, damit Liste und Unternavigation dieselbe Zahl
   * zeigen.
   *
   * `ohneEigeneSa` sagt, dass die Zahl noch gar nicht feststeht. Wie viele
   * Unterlagen gebraucht werden, haengt an Beschaeftigungsart, Wohnsituation,
   * Krediten, Konten und daran, ob es eine zweite Person gibt. All das steht
   * in der Selbstauskunft dieses Investments. Ohne sie waere jede Zahl
   * geraten, deshalb zeigen beide Anzeigen dann einen Hinweis statt "0 von
   * 15" (Entscheidung Christian, 10.09.2026).
   */
  const unterlagenStand = (invId: string) => {
    // Eine Quelle fuer Liste und Zaehler, sonst laufen sie auseinander.
    const { p1: bankBaseP1, p2: bankBaseP2, ohneEigeneSa } = bankDocsBaseFuerInvestment(invId);
    const legacyNamen = [...bankBaseP1, ...bankBaseP2].map(d => d.name);
    const statuses = applyLegacyDocKeys(getInvestmentDocStatuses(invId), legacyNamen);
    // Wie in `renderInvestment`: bereits hochgeladene Positionen bleiben in der
    // Liste, auch wenn sie zur aktuellen Beschaeftigungsart nicht mehr passen.
    const bonitaetDocNames = new Set([
      ...bonitaetDocsFuerInvestment(invId).p1.map(d => d.name),
      ...bonitaetDocsFuerInvestment(invId).p2.map(d => d.name),
      "Selbstauskunft",
    ]);
    const bankP1 = mergeVorhandeneDocs(
      bankBaseP1,
      statuses,
      (name) => !bonitaetDocNames.has(name) && !name.endsWith(" Person 2"),
    );
    const bankP2 = mergeVorhandeneDocs(
      bankBaseP2,
      statuses,
      (name) => !bonitaetDocNames.has(name) && name.endsWith(" Person 2"),
    );
    const alleDocs = [
      ...bonitaetDocsFuerInvestment(invId).p1,
      ...bankP1,
      ...(hasP2 ? [...bonitaetDocsFuerInvestment(invId).p2, ...bankP2] : []),
    ];
    const saOk = (!!getInvestmentSaPdf(invId) && !getSaNeueUnterschriftAusstehend(invId)) || getSaSigned(invId);
    let frei = 0;
    for (const doc of alleDocs) {
      // Die Selbstauskunft gilt als freigegeben, sobald sie als PDF vorliegt
      // oder unterschrieben ist. Genauso rechnet die Bonitaetskarte.
      if (doc.name === "Selbstauskunft") { if (saOk) frei++; continue; }
      if (statuses[doc.name] === "approved") frei++;
    }
    return { frei, gesamt: alleDocs.length, ohneEigeneSa };
  };

  /**
   * Der Unterlagenstand als Text, fuer Liste und Unternavigation gleich.
   *
   * Eine Funktion, damit die beiden Anzeigen nicht auseinanderlaufen.
   */
  const unterlagenStandText = (stand: { frei: number; gesamt: number; ohneEigeneSa: boolean }) =>
    stand.ohneEigeneSa ? "nach der Selbstauskunft" : `${stand.frei} von ${stand.gesamt}`;

  /** Die Pipelinestufe eines Investments als farbige Pille. */
  const investmentStufenPille = (inv: Investment) => {
    const rang = getInvPipelineStep(inv);
    const label = PIPELINE_STEPS[rang]?.label || inv.pipelineStufe || "–";
    const noShow = istNoShowStufe(inv.pipelineStufe);
    const fertig = rang >= PIPELINE_STEPS.length - 1;
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[11px] whitespace-nowrap",
          noShow
            ? "bg-destructive/10 text-destructive border-destructive/40"
            : fertig
            ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/40"
            : "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40",
        )}
      >
        {label}
      </Badge>
    );
  };

  /** Die Liste aller Investments des Kunden. */
  const renderInvestmentListe = () => {
    const sortiert = [...investments].sort((a, b) => (a.nummer || 0) - (b.nummer || 0));
    return (
      <Card className="p-6">
        <div className="w-8 h-1 bg-primary mb-3" />
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-lg">Investments</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {sortiert.length === 1 ? "Ein Vorgang" : `${sortiert.length} Vorgänge`} zu diesem Kunden. Eine Zeile anklicken, um den Vorgang zu öffnen.
            </p>
          </div>
          {!isSetterinRole && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCreateInvestment}>
              <Plus className="h-3.5 w-3.5" /> Neues Investment
            </Button>
          )}
        </div>
        {sortiert.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein Investment angelegt.</p>
        ) : (
          /* Die Klasse ist der Griff für die Handyansicht: Auf schmalen
             Bildschirmen wird aus jeder Tabellenzeile ein gestapelter Block,
             siehe kundenprofil.css. Ohne das müsste man hier waagerecht
             scrollen, um die Stufe eines Vorgangs zu sehen. */
          <div className="overflow-x-auto kundenprofil-investmentliste">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">Investment</th>
                  <th className="text-left py-2 pr-3">Objekt</th>
                  <th className="text-left py-2 pr-3">Stufe</th>
                  <th className="text-left py-2 pr-3">Unterlagen</th>
                  <th className="text-left py-2">Nächster Schritt</th>
                  {/* Spalte fuer den Papierkorb, die Ueberschrift bliebe leer. */}
                  {canDeleteInvestment && <th className="w-10 py-2"><span className="sr-only">Löschen</span></th>}
                </tr>
              </thead>
              <tbody>
                {sortiert.map((inv) => {
                  const schritt = getNextSteps(inv.pipelineStufe, isAdminOrInhaber || (user.role as string) === "vertriebsleiter")?.titel || "–";
                  const preis = investmentKaufpreis(inv.id);
                  const stand = unterlagenStand(inv.id);
                  return (
                    <tr
                      key={inv.id}
                      className="border-b cursor-pointer hover:bg-muted/50 transition-colors align-top"
                      /*
                       * Die Stelle aus Christians Meldung: eine Zeile anklicken
                       * und der Vorgang beginnt an seinem Anfang.
                       *
                       * Das frühere Hervorheben der Karte "Nächste Schritte"
                       * steht hier bewusst nicht mehr. Es rollte 50 Millisekunden
                       * später selbst zu dieser Karte und schob damit die
                       * Kopfzeile des Vorgangs aus dem Bild. Genau das war das
                       * "nie ganz von oben". Aus der Übersicht heraus bleibt das
                       * Hervorheben erhalten, dort ist die Karte das Ziel.
                       */
                      onClick={() => oeffneInvestment(inv.id)}
                    >
                      <td className="py-2.5 pr-3 font-medium whitespace-nowrap">Investment {inv.nummer}</td>
                      <td className="py-2.5 pr-3">
                        {inv.objektTitel ? (
                          <>
                            <span className="block">{inv.objektTitel}{inv.weNr ? ` WE ${inv.weNr}` : ""}</span>
                            <span className="block text-xs text-muted-foreground">
                              {preis > 0 ? fmt(preis) : "Kaufpreis offen"}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Noch kein Objekt</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">{investmentStufenPille(inv)}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap">
                        {unterlagenStandText(stand)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{schritt}</td>
                      {/*
                        Loeschen direkt aus der Liste. Der Klick darf nicht in
                        die Zeile durchschlagen, sonst oeffnet sich zugleich
                        das Investment, das gerade geloescht werden soll.
                        Gefragt wird ueber denselben Dialog, den auch die Karte
                        "Naechste Schritte" im geoeffneten Investment benutzt.
                      */}
                      {canDeleteInvestment && (
                        <td className="py-2.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Investment ${inv.nummer} löschen`}
                            title="Investment löschen"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteInvestmentId(inv.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    );
  };

  /** Ein einzelnes Investment, mit Kopfzeile und Unternavigation. */
  const renderInvestmentEinzeln = (inv: Investment) => {
    const koStand = kundenordnerStand(inv.id);
    const uStand = unterlagenStand(inv.id);
    const zaehler: Record<string, string> = {
      bonitaet: unterlagenStandText(uStand),
      kundenordner: `${koStand.hinterlegt} von ${koStand.gesamt}`,
    };
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" variant="ghost" className="gap-1.5 px-2" onClick={zurueckZurInvestmentListe}>
              <ArrowLeft className="h-4 w-4" /> Alle Investments
            </Button>
            <span className="text-muted-foreground">/</span>
            <h3 className="font-bold">
              Investment {inv.nummer}
              {inv.objektTitel ? ` · ${inv.objektTitel}${inv.weNr ? ` WE ${inv.weNr}` : ""}` : ""}
            </h3>
            {investmentStufenPille(inv)}

          </div>
        </Card>

        <KundenprofilInvestmentLayout
          abschnitte={INVESTMENT_ABSCHNITTE}
          zaehler={zaehler}
          investmentId={inv.id}
        >
          {renderInvestment(inv)}
        </KundenprofilInvestmentLayout>
      </div>
    );
  };

  /**
   * Der Reiter "Investments" in seinen zwei Zustaenden.
   *
   * Ohne Auswahl die Liste, mit Auswahl der einzelne Vorgang. Zeigt die
   * Adresse auf ein Investment, das es nicht mehr gibt, faellt die Ansicht auf
   * die Liste zurueck, statt leer zu bleiben.
   */
  const renderInvestments = () => {
    const inv = gewaehltesInvestment ? investments.find((i) => i.id === gewaehltesInvestment) : null;
    if (!inv) return renderInvestmentListe();
    try {
      return renderInvestmentEinzeln(inv);
    } catch (err) {
      console.error("renderInvestment crash:", err, "inv:", JSON.stringify({ id: inv.id, pipelineStufe: inv.pipelineStufe }));
      const msg = (err as any)?.message || String(err);
      const stack = (err as any)?.stack || "";
      return (
        <Card className="p-8 text-center space-y-3">
          <p className="text-destructive font-medium">Fehler beim Laden des Investments</p>
          <p className="text-sm text-muted-foreground">Bitte lade die Seite neu.</p>
          <details className="text-left max-w-2xl mx-auto">
            <summary className="text-xs text-muted-foreground cursor-pointer">Technische Details (für Support)</summary>
            <pre className="mt-2 p-3 bg-muted rounded text-[10px] text-left whitespace-pre-wrap break-all overflow-auto max-h-64">
              {msg}
              {stack ? "\n\n" + stack : ""}
            </pre>
          </details>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={zurueckZurInvestmentListe}>Zurück zur Liste</Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Seite neu laden</Button>
          </div>
        </Card>
      );
    }
  };

  /**
   * Einkuenfte, Ausgaben und Ueberschussrechnung eines Investments.
   *
   * Der Block stand bis Welle 2 in den Stammdaten, mit einem eigenen
   * Registerband, sobald mehrere Investments eine Selbstauskunft hatten. Jetzt
   * gehoert er in das Investment, das ohnehin schon gewaehlt ist, und das
   * Registerband entfaellt damit.
   *
   * Maßgeblich ist ausschliesslich die EIGENE Selbstauskunft des Investments
   * (Entscheidung Christian, 10.09.2026). Jedes Investment ist unabhaengig,
   * und die Zahlen entstehen erst aus seiner Selbstauskunft. Vorher fiel der
   * Block ohne eigene Selbstauskunft auf die kundenweiten Angaben zurueck,
   * dadurch stand bei einem frisch angelegten Investment die finanzielle Lage
   * eines anderen Vorgangs. Jetzt steht dort stattdessen ein Hinweis.
   */
  const renderFinanzblock = (invId: string) => {
    const invRow = cacheGet("investments")?.find((r: any) => r.id === invId) || null;
    const sd = eigeneSaDataFuerInvestmentRow(invRow) as any;

    /*
     * Ohne eigene Selbstauskunft keine Zahlen und kein Finanzierungsrahmen.
     * Der Hinweis bleibt an der Stelle stehen, an der sonst der Block steht,
     * damit niemand die Karte fuer verschwunden haelt.
     */
    if (!sd) {
      return (
        <Card className="p-6">
          <div className="w-8 h-1 bg-primary mb-3" />
          <h3 className="font-bold text-lg">Finanzielle Situation &amp; Ziele</h3>
          <div className="mt-4 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed">
                <strong>Selbstauskunft dieses Investments steht noch aus.</strong>{" "}
                <span className="text-muted-foreground">
                  Einkünfte, Ausgaben, Eigenkapital und der Finanzierungsrahmen entstehen aus
                  der Selbstauskunft zu genau diesem Investment. Solange sie fehlt, steht hier
                  bewusst keine Zahl. Angaben aus einem anderen Investment desselben Kunden
                  gelten hier nicht.
                </span>
              </p>
            </div>
          </div>
        </Card>
      );
    }

    // Ohne Unterschrift sind die Angaben das, was jemand eingetippt hat,
    // und nicht das, wofuer der Kunde geradesteht. Die Zahlen bleiben
    // sichtbar, aber sie werden als ungeprueft gekennzeichnet.
    const saUnterschrieben = !!invRow?.meta?.saSigned;
    const invEink = extractFinanzEinkuenfte(sd);
    const invAusg = extractFinanzAusgaben(sd);
    const invSumEink = Object.values(invEink).reduce((a, b) => a + b, 0);
    const invSumAusg = Object.values(invAusg).reduce((a, b) => a + b, 0);

    // Person 2 nur, wenn sie in dieser Selbstauskunft steht.
    const p2d = sd?.person2 ? sd.person2Data || null : null;
    const invP2Eink = p2d ? extractFinanzEinkuenfte(p2d) : null;
    const invP2Ausg = p2d ? extractFinanzAusgaben(p2d) : null;
    const invSumEinkP2 = invP2Eink ? Object.values(invP2Eink).reduce((a, b) => a + (b as number), 0) : 0;
    const invSumAusgP2 = invP2Ausg ? Object.values(invP2Ausg).reduce((a, b) => a + (b as number), 0) : 0;
    const invSumEinkGes = invSumEink + invSumEinkP2;
    const invSumAusgGes = invSumAusg + invSumAusgP2;
    const invUeberschuss = invSumEinkGes - invSumAusgGes;
    const invDavon80 = invUeberschuss * RAHMEN_PUFFER;

    const vw = sd?.vermoegenswerte || [];
    const p2Vw = p2d?.vermoegenswerte || [];
    const invEK =
      vw.reduce((acc: number, v: any) => acc + parseFinanzNum(v.betrag), 0) +
      p2Vw.reduce((acc: number, v: any) => acc + parseFinanzNum(v.betrag), 0);

    /*
     * Der Finanzierungsrahmen, wie ihn die Karte "Aktuelle Finanzierbarkeit"
     * zeigt. Sie stand bis jetzt neben der Objektauswahl und ist hierher
     * gezogen, weil sie zur selben Rechnung gehoert wie Einkuenfte, Ausgaben
     * und Ueberschuss.
     *
     * Gerechnet wird nur aus der Selbstauskunft dieses Investments. Der
     * fruehere Rueckfall auf die kundenweiten Rahmenwerte ist entfallen, weil
     * er fremde Zahlen in einen Vorgang trug, der noch gar keine eigenen hat.
     */
    const saFin = calculateFinanzierbarkeitFromSaData(sd);
    const effMinRahmen = saFin?.minRahmen || 0;
    const effEmpfRahmen = saFin?.empfRahmen || 0;
    const effMaxRahmen = saFin?.maxRahmen || 0;
    const effEK = saFin?.eigenkapital || 0;

    const SA_ZIEL_LABELS_INV: Record<string, string> = {
      vermoegen: "Vermögensaufbau / Werte schaffen",
      fremdkapital: "Fremdkapitalhebel (wenig EK-Einsatz)",
      rente: "Sorgenfrei im Alter (Immo-Rente)",
      inflation: "Geldanlage (Inflationsschutz)",
      eigenheim: "Kapitalaufbau fürs Eigenheim",
      freiheit: "Finanzielle Freiheit (passives Einkommen)",
      kinder: "Sichere finanzielle Zukunft für deine Kinder",
      portfolio: "Eigenes Immobilien-Portfolio aus- & aufbauen",
      steuer: "Steuervorteile sichern",
    };
    // Auch die Ziele stammen aus der Selbstauskunft dieses Investments, ohne
    // Rueckfall auf den kundenweiten Stand.
    const wuensche: string[] = Array.isArray(sd?.wuenscheZiele) ? sd.wuenscheZiele : [];

    return (
      <Card className="p-6">
        {/* Immer offen, wie jeder Abschnitt im Investment (Christian, 29.09.2026). */}
        <div>
            <div>
              <div className="w-8 h-1 bg-primary mb-3" />
              <h3 className="font-bold text-lg">Finanzielle Situation & Ziele</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Aus der Selbstauskunft dieses Investments zusammengefasst
              </p>
            </div>
          <div className="mt-4 space-y-4">

        {!saUnterschrieben && (
          <div className="rounded-lg border border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 p-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
              <p className="text-xs leading-relaxed">
                <strong>Selbstauskunft noch nicht unterschrieben.</strong>{" "}
                <span className="text-muted-foreground">
                  Die Angaben sind ungeprüft und können sich noch ändern. Verbindlich sind sie
                  erst, wenn der Kunde unterschrieben hat.
                </span>
              </p>
            </div>
          </div>
        )}

        {wuensche.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="font-semibold text-sm mb-3">Wünsche & Ziele</h4>
            <div className="flex flex-wrap gap-2">
              {wuensche.map((z: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs px-3 py-1.5 bg-primary/5 border-primary/20">
                  {SA_ZIEL_LABELS_INV[z] || z}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="w-8 h-1 bg-primary mb-2" />
            <h3 className="font-bold text-sm mb-2">Einkünfte</h3>
            <div className="space-y-1.5 text-xs">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Person 1</p>
              <details className="group/zeile">
                <summary className="flex items-center justify-between cursor-pointer list-none text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
                  <span>Details {fmt(invSumEink)}</span>
                  <ChevronDown className="h-3 w-3 transition-transform group-open/zeile:rotate-180" />
                </summary>
                <FinanzZeilen
                  zeilen={[["Gehalt/Lohn", invEink.gehalt], ["selbst. Tätigkeit", invEink.selbstaendig], ["Renten etc.", invEink.renten], ["Mieteinnahmen", invEink.mieteinnahmen], ["Zinsen etc.", invEink.zinsen], ["Sonstige Einkünfte", invEink.sonstige], ["Kindergeld", invEink.kindergeld]]}
                />
              </details>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Summe P1</span><span>{fmt(invSumEink)}</span></div>
              {invP2Eink && invSumEinkP2 > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mt-2">Person 2</p>
                  <details className="group/zeile">
                    <summary className="flex items-center justify-between cursor-pointer list-none text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
                      <span>Details {fmt(invSumEinkP2)}</span>
                      <ChevronDown className="h-3 w-3 transition-transform group-open/zeile:rotate-180" />
                    </summary>
                    <div className="mt-1 space-y-1">
                      {[["Gehalt/Lohn", invP2Eink.gehalt], ["selbst. Tätigkeit", invP2Eink.selbstaendig], ["Renten etc.", invP2Eink.renten], ["Mieteinnahmen", invP2Eink.mieteinnahmen], ["Zinsen etc.", invP2Eink.zinsen], ["Sonstige Einkünfte", invP2Eink.sonstige], ["Kindergeld", invP2Eink.kindergeld]].filter(([, v]) => (v as number) > 0).map(([label, val], i) => (
                        <div key={`p2-${i}`}>
                          <div className="flex justify-between"><span>{label as string}</span><span>{fmt(val as number)}</span></div>
                          {/* Sammelzeilen aufschluesseln, siehe KreditPosten. */}
                          {label === "Zins/Tilgung aus Hypotheken" && <KreditPosten kredite={p2d?.kredite || []} art="hypothek" />}
                          {label === "Autokredite" && <KreditPosten kredite={p2d?.kredite || []} art="auto" />}
                          {label === "Privatkredite" && <KreditPosten kredite={p2d?.kredite || []} art="privat" />}
                          {label === "Sonstige Kredite" && <KreditPosten kredite={p2d?.kredite || []} art="sonstige" />}
                        </div>
                      ))}
                    </div>
                  </details>
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Summe P2</span><span>{fmt(invSumEinkP2)}</span></div>
                </>
              )}
              <div className="flex justify-between font-bold border-t-2 pt-1.5 text-primary"><span>Gesamt</span><span>{fmt(invSumEinkGes)}</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="w-8 h-1 bg-primary mb-2" />
            <h3 className="font-bold text-sm mb-2">Ausgaben</h3>
            <div className="space-y-1.5 text-xs">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Person 1</p>
              <details className="group/zeile">
                <summary className="flex items-center justify-between cursor-pointer list-none text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
                  <span>Details {fmt(invSumAusg)}</span>
                  <ChevronDown className="h-3 w-3 transition-transform group-open/zeile:rotate-180" />
                </summary>
                <FinanzZeilen
                  kredite={sd?.kredite || []}
                  zeilen={[["Miete", invAusg.miete], ["Nebenkosten", invAusg.nebenkosten], ["Lebenshaltungskosten (Bankansatz)", invAusg.lebenshaltung], ["Private Krankenversicherung", invAusg.privateKV], ["KFZ-Kosten", invAusg.kfzKosten], ["Zins/Tilgung aus Hypotheken", invAusg.zinsTilgung], ["Autokredite", invAusg.autokredite], ["Privatkredite", invAusg.privatkredite], ["Sonstige Kredite", invAusg.sonstigeKredite], ["Bürgschaften / Verbindlichkeiten", invAusg.buergschaften], ["Versicherungsbeiträge", invAusg.versicherungen], ["Unterhaltszahlungen", invAusg.unterhalt], ["Sonstige Ausgaben", invAusg.sonstige]]}
                />
              </details>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Summe P1</span><span>{fmt(invSumAusg)}</span></div>
              {invP2Ausg && invSumAusgP2 > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mt-2">Person 2</p>
                  <details className="group/zeile">
                    <summary className="flex items-center justify-between cursor-pointer list-none text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
                      <span>Details {fmt(invSumAusgP2)}</span>
                      <ChevronDown className="h-3 w-3 transition-transform group-open/zeile:rotate-180" />
                    </summary>
                    <div className="mt-1 space-y-1">
                      {[["Miete", invP2Ausg.miete], ["Nebenkosten", invP2Ausg.nebenkosten], ["Lebenshaltungskosten (Bankansatz)", invP2Ausg.lebenshaltung], ["Private Krankenversicherung", invP2Ausg.privateKV], ["KFZ-Kosten", invP2Ausg.kfzKosten], ["Zins/Tilgung aus Hypotheken", invP2Ausg.zinsTilgung], ["Autokredite", invP2Ausg.autokredite], ["Privatkredite", invP2Ausg.privatkredite], ["Sonstige Kredite", invP2Ausg.sonstigeKredite], ["Bürgschaften / Verbindlichkeiten", invP2Ausg.buergschaften], ["Versicherungsbeiträge", invP2Ausg.versicherungen], ["Unterhaltszahlungen", invP2Ausg.unterhalt], ["Sonstige Ausgaben", invP2Ausg.sonstige]].filter(([, v]) => (v as number) > 0).map(([label, val], i) => (
                        <div key={`p2-${i}`} className="flex justify-between"><span>{label as string}</span><span>{fmt(val as number)}</span></div>
                      ))}
                    </div>
                  </details>
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Summe P2</span><span>{fmt(invSumAusgP2)}</span></div>
                </>
              )}
              <div className="flex justify-between font-bold border-t-2 pt-1.5 text-primary"><span>Gesamt</span><span>{fmt(invSumAusgGes)}</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="w-8 h-1 bg-primary mb-2" />
            <h3 className="font-bold text-sm mb-2">Überschussrechnung</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span>Einkünfte</span><span className="font-medium">{fmt(invSumEinkGes)}</span></div>
              <div className="flex justify-between"><span>Ausgaben</span><span className="font-medium text-destructive">– {fmt(invSumAusgGes)}</span></div>
              <div className="flex justify-between font-bold border-t-2 pt-1.5 text-primary"><span>Monatl. Überschuss</span><span>{fmt(invUeberschuss)}</span></div>
              <div className="flex justify-between text-muted-foreground pt-0.5"><span>Jahres-Ø</span><span>{fmt(invUeberschuss * 12)}</span></div>
              <div className="mt-3 p-2.5 rounded-lg bg-muted/50 border text-[11px] text-muted-foreground space-y-0.5">
                <p className="font-semibold uppercase tracking-wide text-[10px] mb-1">Tragfähigkeit</p>
                <div className="flex justify-between"><span>80% Puffer</span><span>{fmt(invDavon80)}</span></div>
                <div className="flex justify-between"><span>Max. Annuität p.a.</span><span>{fmt(invDavon80 * 12)}</span></div>
              </div>
              {(() => {
                const allVw = [...vw, ...p2Vw]
                  .map((v: any) => ({ art: String(v?.art || "Sonstige"), institut: String(v?.institut || ""), betrag: parseFinanzNum(v?.betrag) }))
                  .filter((v: any) => v.betrag > 0);
                const isImmo = (art: string) => /immobil/i.test(art);
                const liquide = allVw.filter((v) => !isImmo(v.art));
                const sumLiq = liquide.reduce((s, v) => s + v.betrag, 0);
                // Das Immobilienvermögen kommt aus dem eigenen Block der
                // Selbstauskunft (Marktwert je Objekt) abzüglich der
                // Restschuld der Immobilienkredite. Vorher stand hier die
                // nackte Restschuld, also eine Schuld unter der Überschrift
                // "Immobilienvermögen". Die Formel liegt an einer Stelle,
                // damit Leadscore und Beraterhinweis dieselbe Zahl nennen.
                const immoVermoegen = berechneImmobilienvermoegen(sd ? { ...sd, person2Data: p2d } : null);
                if (allVw.length === 0 && !immoVermoegen.vorhanden) return null;
                return (
                  <div className="pt-1.5 border-t space-y-2">
                    <details className="group/zeile">
                      <summary className="flex items-center justify-between cursor-pointer list-none text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
                        <span>Eigenkapital-Details</span>
                        <ChevronDown className="h-3 w-3 transition-transform group-open/zeile:rotate-180" />
                      </summary>
                      <div className="mt-2 space-y-3">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Eigenkapital liquide</p>
                          {liquide.length > 0 ? liquide.map((v, i) => (
                            <div key={`liq-${i}`} className="flex justify-between gap-2">
                              <span className="truncate">{v.art}{v.institut ? ` · ${v.institut}` : ""}</span>
                              <span>{fmt(v.betrag)}</span>
                            </div>
                          )) : (
                            <p className="text-[11px] text-muted-foreground italic">Keine liquiden Werte hinterlegt</p>
                          )}
                          {liquide.length > 0 && (
                            <div className="flex justify-between font-semibold border-t pt-1"><span>Summe liquide</span><span>{fmt(sumLiq)}</span></div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Immobilienvermögen</p>
                          {immoVermoegen.vorhanden ? (
                            <button
                              type="button"
                              onClick={() => setImmoDetail(immoVermoegen)}
                              className="w-full text-left space-y-1 rounded px-1 -mx-1 py-0.5 hover:bg-muted/60 transition-colors"
                              title="Für die einzelnen Objekte klicken"
                            >
                              <div className="flex justify-between gap-2">
                                <span className="truncate">Verkehrswert{immoVermoegen.anzahl > 0 ? ` · ${immoVermoegen.anzahl} Objekt${immoVermoegen.anzahl === 1 ? "" : "e"}` : ""}</span>
                                <span>{fmt(immoVermoegen.verkehrswert)}</span>
                              </div>
                              <div className="flex justify-between gap-2 text-muted-foreground">
                                <span className="truncate">abzüglich Restschuld</span>
                                <span>− {fmt(immoVermoegen.restschuld)}</span>
                              </div>
                              <div className="flex justify-between gap-2 font-semibold border-t pt-1">
                                <span className="underline decoration-dotted underline-offset-2">Netto</span>
                                <span>{fmt(immoVermoegen.netto)}</span>
                              </div>
                            </button>
                          ) : (
                            <p className="text-[11px] text-muted-foreground italic">Keine Immobilien in der Selbstauskunft hinterlegt</p>
                          )}
                        </div>
                      </div>
                    </details>
                    <div className="flex justify-between font-bold border-t-2 pt-1.5 text-primary"><span>Eigenkapital gesamt</span><span>{fmt(invEK)}</span></div>
                    {immoVermoegen.netto > 0 && (
                      // Chance benennen, ohne sie zu unterstellen: Eine
                      // schuldenfreie Immobilie lässt sich beleihen, das ist
                      // aber ein eigener Vorgang mit Bewertung und Grundbuch.
                      // Der Finanzierungsrahmen rechnet weiterhin nur mit
                      // liquiden Mitteln, damit niemand als finanzierbar gilt,
                      // der beim Notar nicht zahlen kann.
                      <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
                        <span className="font-semibold text-foreground">Hinweis für die Beratung: </span>
                        Der Kunde besitzt Immobilien im Nettowert von {fmt(immoVermoegen.netto)}. Das ist oben
                        bewusst nicht im Eigenkapital enthalten, weil es nicht liquide ist. Eine Beleihung als
                        Eigenkapitalersatz ist möglich, muss aber separat mit der Bank geklärt werden.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </Card>
          {/*
            Aktuelle Finanzierbarkeit — vierter Teil des Blocks. Vollstaendig
            aus der Objektauswahl uebernommen: Min, Empfehlung und Max, die
            Fusszeile mit dem Eigenkapital, die Kurve und das Info-Fenster mit
            den Formeln.
          */}
          <Card className="p-4 flex flex-col">
            <div className="w-8 h-1 bg-primary mb-2" />
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-bold text-sm">Aktuelle Finanzierbarkeit</h3>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Berechnungsgrundlage anzeigen">
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-96 text-xs space-y-3" align="start">
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-[10px] mb-1.5 text-muted-foreground">So wird die Finanzierbarkeit berechnet</p>
                    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                      <li>Überschuss = Gesamteinnahmen − Gesamtausgaben</li>
                      <li>Max. tragbare Belastung = Überschuss × 80% (Sicherheitspuffer)</li>
                      <li>Max. Darlehen = (Belastung × 12) ÷ 6% Annuität (Zins + Tilgung)</li>
                      <li>Investitionsrahmen = Max. Darlehen + Eigenkapital</li>
                      <li>Positiv = Investitionsrahmen deckt Kaufpreis</li>
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Min.:</span><span className="font-medium">{fmt(effMinRahmen)}</span></div>
              <div className="flex justify-between items-baseline"><span className="font-bold">Empfehlung:</span><span className="text-base font-bold">{fmt(effEmpfRahmen)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max.:</span><span className="font-medium">{fmt(effMaxRahmen)}</span></div>
            </div>
            {(() => {
              // Modernes Linien-/Kurven-Diagramm statt massiver Balken.
              const vals = [effMinRahmen, effEmpfRahmen, effMaxRahmen];
              const maxVal = Math.max(...vals, 1);
              const minVal = Math.min(...vals);
              // Flacher als frueher (220), damit der Block weniger hoch baut.
              const W = 480, H = 150, PADX = 40, PADY = 30;
              const range = Math.max(maxVal - minVal, 1);
              const xs = [PADX, W / 2, W - PADX];
              const ys = vals.map(v => PADY + (1 - (v - minVal) / range) * (H - PADY * 2));
              // Smoothe Catmull-Rom→Bezier-Kurve
              const cx1 = (xs[0] + xs[1]) / 2;
              const cx2 = (xs[1] + xs[2]) / 2;
              const path = `M ${xs[0]},${ys[0]} C ${cx1},${ys[0]} ${cx1},${ys[1]} ${xs[1]},${ys[1]} C ${cx2},${ys[1]} ${cx2},${ys[2]} ${xs[2]},${ys[2]}`;
              const area = `${path} L ${xs[2]},${H - PADY / 2} L ${xs[0]},${H - PADY / 2} Z`;
              const labels = ["Min.", "Empf.", "Max."];
              return (
                <div className="mt-3 flex-1 w-full">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="finFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* dezente Grundlinie */}
                    <line x1={PADX} y1={H - PADY / 2} x2={W - PADX} y2={H - PADY / 2} stroke="hsl(var(--border))" strokeWidth="1" />
                    {/* Flächenfüllung */}
                    <path d={area} fill="url(#finFill)" />
                    {/* Kurve */}
                    <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Punkte + Wert-Labels */}
                    {xs.map((x, i) => {
                      const isMid = i === 1;
                      return (
                        <g key={i}>
                          <circle cx={x} cy={ys[i]} r={isMid ? 6 : 4} fill={isMid ? "hsl(var(--primary))" : "hsl(var(--background))"} stroke="hsl(var(--primary))" strokeWidth={isMid ? 0 : 2} />
                          <text x={x} y={ys[i] - 12} textAnchor="middle" fontSize="11" fontWeight={isMid ? 700 : 500} fill={isMid ? "hsl(var(--primary))" : "hsl(var(--foreground))"}>{fmt(vals[i])}</text>
                          <text x={x} y={H - 5} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">{labels[i]}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })()}
            {effEK > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2">inkl. {fmt(effEK)} Eigenkapital aus Selbstauskunft</p>
            )}
          </Card>
        </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderContent = () => {
    if (activeTab === "uebersicht") return renderUebersicht();
    if (activeTab === "aktivitaeten") return renderAktivitaeten();
    if (activeTab === "stammdaten") return renderStammdaten();
    if (activeTab === "empfehlungen") return renderEmpfehlungen();
    if (activeTab === "vermoegensaufbau") return renderVermoegenaufbau();
    if (activeTab === "kommunikation") {
      return (
        <KommunikationReiter
          kontaktId={kunde.id}
          kundeName={`${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim()}
          kundeStatus={kunde.status}
          portalFreigeschalten={portalFreigeschalten}
          darfKundenchatSehen={!isVersicherungsexperte}
          investments={investments.map((inv) => ({
            id: inv.id,
            nummer: inv.nummer,
            pipelineStufe: inv.pipelineStufe,
          }))}
          /*
           * Bewusst umschlossen statt direkt durchgereicht: sonst landet ein
           * zweites Argument der Kindkomponente eines Tages im Optionsobjekt.
           */
          onInvestmentOeffnen={(invId) => oeffneInvestment(invId)}
          vorauswahl={verlaufVorauswahl}
        />
      );
    }
    if (activeTab === "dokumente") {
      const urlInv = new URLSearchParams(window.location.search).get("investment");
      return (
        <KundeDokumenteCard
          kontaktId={kunde.id}
          investments={investments.map((inv) => ({ id: inv.id, label: `Investment ${inv.nummer}` }))}
          initialInvestmentId={urlInv}
          canManage={isAdminOrInhaber || isAssignedBerater}
        />
      );
    }
    if (activeTab === "investments") return renderInvestments();
    return renderStammdaten();
  };

  return (
    <DashboardLayout>
      {/*
        Solange der Notarbogen offen ist, tritt das Profil zur Seite.

        `hidden` statt Ausbauen: Der Reiter, die Scrollstelle und alle offenen
        Eingaben im Profil bleiben erhalten und stehen beim Zurückgehen wieder
        so da, wie sie waren. Der Bogen selbst steht weiter unten als
        Geschwister und nimmt den Inhaltsbereich allein ein. Die
        Navigationsleiste liegt ausserhalb dieser Seite und bleibt dadurch
        stehen.
      */}
      <div className={showKaufvertragForm ? "kundenprofil space-y-6 hidden" : "kundenprofil space-y-6"}>
        {id && <CallSessionBar currentKundeId={id} />}
        {/*
          Kopfzeile.

          Christian hat am 16.09.2026 entschieden, den grossen Namen hier zu
          streichen: Er stand zwanzig Pixel weiter unten im Personenblock noch
          einmal. Der untere bleibt, weil er am Datenblock klebt, wo man ihn
          sucht.

          Das Statusband, also die Ampel mit dem farbigen Punkt und dem
          ueberfaelligen Vorgang, ist nicht weggefallen. Es ist mit nach unten
          gezogen und steht jetzt direkt unter dem Namen im Personenblock,
          siehe `renderProfilStammdaten`. Grund: Ohne den Namen haette es hier
          allein neben dem Zurueck-Knopf gestanden und sich auf nichts mehr
          bezogen. Unten steht es an der Person, auf die es sich bezieht, und
          direkt ueber den Aktionen, die es ausloest.
        */}
        {/*
          Der Rueckweg steht links, wie ueberall sonst im System.

          Christian am 22.09.2026: Rechts wird er zu wenig wahrgenommen. Seither
          sitzt er auf jeder Seite an derselben Stelle, oben links ueber dem
          Inhalt.
        */}
        <div className="-ml-2 flex items-start gap-3 flex-wrap">
          {!ausSuche && (
            <Button variant="ghost" onClick={() => {
              // Show exit confirmation if setterin role and data not saved
              if (isSetterinRole && setterDirty) {
                setExitDialog(true);
              } else {
                navigate(-1);
              }
            }} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Button>
          )}
        </div>

        <KundenprofilLayout
          stammdaten={renderProfilStammdaten()}
          kennzahlen={renderProfilKennzahlen()}
          navigation={<KundenprofilNavigation tabs={tabs} activeTab={activeTab} rolle={user.role} portalFreigeschalten={portalFreigeschalten} onWechsel={wechsleReiter} />}
          aktivitaetenOffen={activeTab === "aktivitaeten" || aktivitaetenLeiste.offen}
          aktivitaeten={istErlaubterReiter("aktivitaeten", user.role as string) ? (
            <KundenprofilAktivitaeten
              offen={activeTab === "aktivitaeten" || aktivitaetenLeiste.offen}
              /*
                Die Zahl am Reiter „Aktivitäten" zählt genau das, was der
                Reiter zeigt: Aufgaben, Termine und Systemeinträge. Die
                Notizen stehen im anderen Reiter und dürfen hier nicht
                mitgezählt werden, sonst sagte die Zahl etwas anderes, als
                danebensteht.
              */
              anzahl={manuelleAktivitaeten.length + systemAktivitaeten.length}
              notizenAnzahl={notizen.length}
              reiter={aktivitaetenAnsicht === "notizen" ? "notizen" : "aktivitaeten"}
              /*
                Der Reiter setzt die vorhandene Ansicht, er baut keine zweite
                daneben. „Aktivitäten" landet auf „manuell", also auf Aufgaben
                und Terminen; von dort führt die vorhandene Unterteilung weiter
                zu „System".
              */
              onReiter={(neu) => {
                setAktivitaetenAnsicht(neu === "notizen" ? "notizen" : "manuell");
                aktPag.setPage(1);
              }}
              speichert={aktivitaetenLeiste.speichert}
              onUmschalten={() => {
                const offen = activeTab === "aktivitaeten" || aktivitaetenLeiste.offen;
                if (activeTab === "aktivitaeten") setActiveTab(standardReiter(user.role as string));
                void aktivitaetenLeiste.setzen(!offen);
              }}
              onNotiz={() => fuehreSchnellaktionAus("notiz")}
            >{profilAktivitaetenBereit ? renderAktivitaeten() : <p className="text-sm text-muted-foreground py-4" role="status">Aktivitäten werden geladen …</p>}</KundenprofilAktivitaeten>
          ) : undefined}
        >
          {activeTab === "aktivitaeten" ? (
            <div className="rounded-lg bg-muted/40 p-5 text-sm">
              <h2 className="font-semibold mb-2">Aktivitäten und Notizen</h2>
              <p className="text-muted-foreground">Dein Verlauf steht in der einklappbaren Aktivitätenleiste am rechten Rand.</p>
              <Button className="mt-3" variant="outline" onClick={() => wechsleReiter(standardReiter(user.role as string))}>Zurück zum Arbeitsbereich</Button>
            </div>
          ) : (
            <>
              {activeTab === "uebersicht" && (
                /*
                  Auch dieser Rueckweg steht links, wie jeder andere im System
                  seit dem 22.09.2026. Vorher sass er rechts neben der
                  Ueberschrift und ging dort unter.
                */
                <div className="mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => wechsleReiter(standardReiter(user.role as string))}
                  >
                    <ArrowLeft className="h-4 w-4" /> Zurück zum Arbeitsbereich
                  </Button>
                  <h2 className="mt-1 text-base font-semibold">Alle nächsten Schritte</h2>
                </div>
              )}
              {renderContent()}
            </>
          )}
        </KundenprofilLayout>

        {/* ── Dialogs ── */}
        <QuickActionDialog
          art={actionDialog}
          kundeId={id || ""}
          kundeName={`${kunde.vorname} ${kunde.nachname}`}
          kundeEmail={kunde.email}
          kundeTelefon={kunde.telefon}
          berater={kunde.berater}
          nichtErreichtCount={kunde.nichtErreichtCount || 0}
          anrufGestartet={anrufGestartet}
          onClose={() => { setActionDialog(null); setAnrufGestartet(false); }}
          onSaved={handleActionSaved}
          onProtokollResult={async (r) => {
            try {
              if (r.ergebnis === "nicht_erreicht") {
                handleSetterNichtErreicht({ ohneNachfassAufgabe: r.eigeneAufgabe });
              } else if (r.ergebnis === "kein_interesse") {
                handleSetterKeinInteresse();
              } else if (r.ergebnis === "daten_falsch") {
                handleSetterDatenFalsch();
              } else if (r.ergebnis === "erstgespraech_vereinbart" && r.datum && r.uhrzeit) {
                /*
                 * Erstgespraech mit Termin.
                 *
                 * Vorher entstand hier nur eine Folge-Aufgabe, im System stand
                 * nichts von einem vereinbarten Erstgespraech. Der Kunde stand
                 * weiter auf seiner alten Stufe und die Ampel im Profil blieb
                 * grau, obwohl ein Termin fest vereinbart war.
                 *
                 * Erst meta schreiben, dann updateKontakt: Sonst baut
                 * updateKontakt das meta aus dem alten Zwischenspeicher neu auf
                 * und loescht den Termin im selben Klick.
                 */
                await mergeKontaktMeta(id!, {
                  erstgespraechAm: r.datum,
                  erstgespraechUhrzeit: r.uhrzeit,
                });
                updateKontakt(id!, {
                  pipelineStufe: "erstgespraech_geplant" as any,
                  setterTerminDatum: r.datum,
                  setterTerminUhrzeit: r.uhrzeit,
                  status: "kontaktiert" as any,
                } as any);
                toast({ title: "Erstgespräch eingetragen ✓", description: `${r.datum} um ${r.uhrzeit}` });
                reloadKunde();
              } else if (r.ergebnis === "beratungsgespraech_vereinbart" && r.investmentId && r.datum && r.uhrzeit) {
                try {
                  updateInvestment(r.investmentId, { pipelineStufe: "beratungsgespraech" } as any);
                  setInvestmentMetaFields(r.investmentId, {
                    beratungsgespraechAm: r.datum,
                    beratungsgespraechUhrzeit: r.uhrzeit,
                  } as any);
                } catch (e) { console.warn("BG-Termin Investment-Update fehlgeschlagen", e); }
                // Erst den Termin in meta schreiben und den Zwischenspeicher
                // nachziehen, danach erst updateKontakt. Sonst baut
                // updateKontakt das meta aus dem alten Zwischenspeicher neu auf
                // und loescht den Termin im selben Klick.
                await mergeKontaktMeta(id!, { beratungsgespraechAm: r.datum, beratungsgespraechUhrzeit: r.uhrzeit });
                updateKontakt(id!, { pipelineStufe: "beratungsgespraech" } as any);
                toast({ title: "Beratungsgespräch eingetragen ✓", description: `${r.datum} um ${r.uhrzeit}` });
                reloadKunde();
              }
            } catch (e) { console.warn("onProtokollResult handler failed", e); }
          }}
        />

        {/* Quick-Action „Meeting erstellen" ohne Videocall-Freigabe. Traegt nur
            den Termin ein. */}
        <MeetingErstellenDialog
          open={meetingQuickOpen}
          onOpenChange={setMeetingQuickOpen}
          defaultTopic={`Meeting mit ${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim()}
          defaultDuration={60}
          defaultAgenda=""
          recipientEmail={kunde?.email}
          recipientName={`${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim()}
          kontaktId={id || undefined}
          onCreated={async (m, gewaehltesInvestment) => {
            if (!id) return false;
            // WICHTIG: Header-Quick-Action „Meeting erstellen" ist bewusst
            // entkoppelt vom Sales-Prozess. Es wird KEIN setterTermin*, KEIN
            // pipelineStufe-Wechsel und keine „Beratungsgespräch"-Logik
            // getriggert. Das Meeting steht als Meeting in der Timeline und
            // als Aufgabe am gewaehlten Investment.
            //
            // Auf die Datenbank wird gewartet, sonst überholt das Neuladen
            // weiter unten den Schreibvorgang und der Eintrag verschwindet
            // gleich wieder. Die Beschreibung ist nur das Thema: Sie steht
            // auch in der Terminerinnerung an den Kunden.
            const eintrag = await addAktivitaetSicher({
              kundeId: id,
              art: "meeting",
              beschreibung: m.thema,
              details: m.agenda || undefined,
              faelligAm: m.datum,
              uhrzeit: m.uhrzeit,
              dauer: String(m.dauer),
              von: user.name,
            });
            if (!eintrag) {
              toast({
                title: "Meeting nicht gespeichert",
                description: "Der Termin ist nicht in der Kundenakte angekommen. Bitte versuch es noch einmal.",
                variant: "destructive",
              });
              return false;
            }
            // `addGeteilteAufgabe` wirft nicht, sondern liefert `false`. Ohne
            // die Pruefung fiel der Termin still aus der Aufgabenliste.
            const kName = `${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim();
            const aufgabeOk = await addGeteilteAufgabe({
              titel: `Meeting: ${m.thema}`,
              beschreibung: [kName, `${m.datum} ${m.uhrzeit} Uhr`, m.agenda].filter(Boolean).join(" · "),
              prioritaet: "hoch",
              typ: "meeting",
              faellig_am: m.datum,
              uhrzeit: m.uhrzeit,
              kundeId: id,
              kundeName: kName,
              // Damit der Termin auf der richtigen Pipeline-Kachel steht.
              investmentId: gewaehltesInvestment,
            });
            if (aufgabeOk) {
              toast({ title: "Meeting erstellt ✓", description: `${m.datum} um ${m.uhrzeit} Uhr` });
            } else {
              toast({
                title: "Meeting steht nicht in den Aufgaben",
                description: "Das Meeting ist in der Kundenakte, aber es wurde keine Aufgabe dafür erstellt. Bitte den Termin von Hand eintragen.",
                variant: "destructive",
              });
            }
            reloadKunde();
          }}
        />

        {/* Exit confirmation for Setter */}
        <Dialog open={exitDialog} onOpenChange={setExitDialog}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
                Seite verlassen?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Hast du deine Daten über den Button „Daten speichern" gesichert? Falls nicht, gehen alle nicht gespeicherten Eingaben verloren.
              </p>
              <div className="p-4 bg-muted/50 border rounded-lg space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Checkliste – Status</p>
                {SETTER_CHECKLIST_ITEMS.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    {setterChecklist[c.id] ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))] shrink-0" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-sm border-2 border-[hsl(var(--warning))] shrink-0" />
                    )}
                    <span className={setterChecklist[c.id] ? "text-muted-foreground line-through" : "font-medium"}>{c.label}</span>
                  </div>
                ))}
                {!allSetterChecklistDone && (
                  <p className="text-xs text-[hsl(var(--warning))] mt-3 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {missingSetterItems.length} Punkt{missingSetterItems.length > 1 ? "e" : ""} noch offen!
                  </p>
                )}
                {allSetterChecklistDone && (
                  <p className="text-xs text-[hsl(var(--success))] mt-3 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Alle Punkte erledigt ✓
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setExitDialog(false)}>
                  Zurück zum Formular
                </Button>
                <Button variant="default" className="flex-1 gap-1" onClick={() => { handleSetterSave(); setExitDialog(false); navigate(-1); }}>
                  <Download className="h-3 w-3" /> Speichern & zurück
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => { setExitDialog(false); navigate(-1); }}>
                  Ohne Speichern verlassen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit & Vertriebspartner dialogs removed – now inline */}

        <Dialog open={deleteDialog} onOpenChange={(open) => { setDeleteDialog(open); if (!open) { setDeleteGrund(""); setDeleteConfirmText(""); } }}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <DialogHeader><DialogTitle>Löschung beantragen</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-muted/50 border rounded-lg p-3 text-sm text-muted-foreground">
                Der Kunde <strong>{kunde?.vorname} {kunde?.nachname}</strong> wird nach Bestätigung durch Admin / Vertriebsleiter / Backoffice anonymisiert. Personenbezogene Daten werden entfernt, der Datensatz bleibt für Audit-Zwecke in der Datenbank, ist aber nicht mehr in der Anwendung sichtbar.
              </div>

              <div><Label className="text-sm font-medium">Grund der Löschung *</Label><Textarea value={deleteGrund} onChange={e => setDeleteGrund(e.target.value)} placeholder="z.B. Doppelter Eintrag, Fehlerhafter Lead, ..." className="mt-1" rows={3} /></div>
              <Button
                onClick={handleDelete}
                disabled={!deleteGrund.trim()}
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Löschung beantragen
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Neues Investment Bestätigung ── */}
        <Dialog open={confirmNewInvestment} onOpenChange={setConfirmNewInvestment}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <DialogHeader><DialogTitle>Neues Investment anlegen?</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Möchtest du für <strong>{kunde.vorname} {kunde.nachname}</strong> ein neues Investment (Nr. {investments.length + 1}) anlegen?
                Der Kunde durchläuft dann erneut den kompletten Vertriebsprozess (Selbstauskunft, Bonität, Objektauswahl, etc.).
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmNewInvestment(false)}>Abbrechen</Button>
                <Button className="flex-1 gap-1.5" onClick={handleConfirmCreateInvestment}>
                  <Plus className="h-3 w-3" /> Ja, Investment anlegen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/*
          ── Investment löschen Bestätigung ──

          Der eine Löschweg für alle Stellen: die Zeile in der Investmentliste
          und die Karte "Nächste Schritte" im geöffneten Investment setzen
          beide `deleteInvestmentId` und landen hier. Der Text nennt
          ausdrücklich, was verloren geht, und die Knöpfe sagen, was sie tun.
        */}
        <Dialog open={!!deleteInvestmentId} onOpenChange={() => setDeleteInvestmentId(null)}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <DialogHeader>
              <DialogTitle>
                {(() => {
                  const zuLoeschen = investments.find((i) => i.id === deleteInvestmentId);
                  return zuLoeschen ? `Investment ${zuLoeschen.nummer} löschen?` : "Investment löschen?";
                })()}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Das Löschen lässt sich nicht rückgängig machen. Mit dem Investment verschwinden
                seine Selbstauskunft, alle dazu hochgeladenen Unterlagen und sein Stand in der
                Pipeline. Die anderen Investments dieses Kunden und seine Stammdaten bleiben
                unberührt.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteInvestmentId(null)}>Behalten</Button>
                <Button variant="destructive" className="flex-1 gap-1.5" onClick={() => deleteInvestmentId && handleDeleteInvestment(deleteInvestmentId)}>
                  <Trash2 className="h-3 w-3" /> Investment löschen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Objekt wechseln Bestätigung (Vertriebspartner) ── */}
        <Dialog open={!!switchObjektDialog} onOpenChange={() => setSwitchObjektDialog(null)}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <DialogHeader><DialogTitle>Einheit wechseln?</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              {/*
                Der Text nennt jetzt beides: was verloren geht und was bleibt.
                Vorher stand hier „zurück in die Einheitenauswahl“. Die Liste
                freier Wohnungen ist seit 09/2026 abgeschaltet, der Vorgang
                landet auf der Objektauswahl und das Objekt wird dort neu
                eingetragen. Und der Verlauf war gar nicht erwähnt, obwohl er
                die eigentliche Beruhigung ist.
              */}
              <p className="text-sm text-muted-foreground">
                Bist du sicher, dass du die zugewiesene Einheit wechseln möchtest? Die aktuelle Reservierung wird aufgehoben und die Einheit freigegeben. Eine <strong>unterschriebene Reservierungsvereinbarung wird nicht gelöscht</strong>, sie bleibt als aufgehoben im Kundenordner. Der Kunde wird zurück auf die <strong>Objektauswahl</strong> gesetzt, dort kann direkt ein neues Objekt gewählt und neu reserviert werden.
              </p>
              <p className="text-sm text-muted-foreground">
                Das bisherige Objekt geht nicht verloren: Es steht danach in der <strong>Zeitachse der Objektauswahl</strong>, ausgegraut und mit dem Zeitraum, in dem es ausgewählt war.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSwitchObjektDialog(null)}>Abbrechen</Button>
                <Button className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => switchObjektDialog && handleSwitchObjekt(switchObjektDialog.invId, switchObjektDialog.objektId, switchObjektDialog.wohnungId)}>
                  <RefreshCw className="h-3 w-3" /> Einheit wechseln
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Follow-Up Dialog (Setterin) ── */}
        <Dialog open={followUpDialogOpen} onOpenChange={setFollowUpDialogOpen}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-md">
            <DialogHeader><DialogTitle>Follow-Up planen</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Titel</Label>
                <Input value={followUpTitel} onChange={e => setFollowUpTitel(e.target.value)} placeholder="z. B. Rückruf vereinbart" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Datum</Label>
                  <DateInput value={followUpDatum} onChange={v => setFollowUpDatum(v)} minDate={heuteIso()} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Uhrzeit</Label>
                  <Input type="time" value={followUpUhrzeit} onChange={e => setFollowUpUhrzeit(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setFollowUpDialogOpen(false)}>Abbrechen</Button>
                <Button className="flex-1" onClick={handleSetterFollowUpConfirm} disabled={!followUpTitel.trim() || !followUpDatum}>Follow-Up erstellen</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Dokument ablehnen Dialog ── */}
        {/* Delete Doc Confirmation Dialog */}
        <AlertDialog open={!!deleteDocDialog} onOpenChange={() => setDeleteDocDialog(null)}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Dokument löschen?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <p>Dokument: <strong>{deleteDocDialog?.docName}</strong></p>
                {deleteDocDialog?.wasApproved && (
                  <p className="mt-2 text-destructive font-medium">⚠️ Dieses Dokument wurde bereits freigegeben. Soll es trotzdem gelöscht werden?</p>
                )}
                <p className="mt-2">Das Dokument wird unwiderruflich entfernt und muss erneut hochgeladen werden.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteDoc}>
                Ja, löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Kaufvertrag Confirmation */}
        <AlertDialog open={!!deleteKaufvertragDialog} onOpenChange={() => setDeleteKaufvertragDialog(null)}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Aufnahmebogen löschen?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">Beim Löschen werden <strong>unwiderruflich entfernt</strong>:</span>
                <ul className="list-disc pl-5 text-xs space-y-1">
                  <li>Der ausgefüllte Aufnahmebogen inkl. PDF</li>
                  <li>Alle Notar-Daten (Termin, Uhrzeit, Adresse, Notarname, Verkäufer)</li>
                  <li>Vorgeschlagene Termine und die Kunden-Bestätigung</li>
                  <li>Die Anzeige im Kundenportal unter „Notar" wird komplett geleert</li>
                </ul>
                <span className="block text-xs text-muted-foreground pt-1">Der VP muss den Aufnahmebogen danach erneut ausfüllen.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
                if (deleteKaufvertragDialog) {
                  deleteKaufvertragPdf(deleteKaufvertragDialog);
                  supabase.storage.from("unterlagen").remove([`kaufvertrag/${id}/${deleteKaufvertragDialog}`]).catch(() => {});
                  setDeleteKaufvertragDialog(null);
                  toast({ title: "Aufnahmebogen gelöscht ✓" });
                  forceUpdate(n => n + 1);
                }
              }}>
                Ja, löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                Dokument ablehnen
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>Dokument: <strong className="text-foreground">{rejectDialog?.docName}</strong></div>
                  <div>Bitte gib einen Ablehnungsgrund ein. Dieser wird dem Kunden angezeigt.</div>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="z. B. Dokument unleserlich, falsches Dokument hochgeladen…"
                    className="mt-2"
                    rows={3}
                    autoFocus
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!rejectReason.trim()}
                onClick={() => {
                  if (rejectDialog) {
                    // Gleicher Schutz wie bei der Freigabe: der Stand bleibt
                    // sichtbar, bis die Datenbank ihn bestaetigt hat.
                    const ablehnGen = setzeUnterlagenSollstand(rejectDialog.invId, [rejectDialog.docName], { status: "rejected" });
                    // Stand VOR der Ablehnung, fuer den Hinweis an den Finanzierungspartner.
                    const metaVorAblehnung = { ...(((cacheGet("investments").find((r: any) => r.id === rejectDialog.invId) as any)?.meta) || {}) };
                    rejectInvestmentDoc(rejectDialog.invId, rejectDialog.docName, rejectReason.trim());
                    // War die Finanzierung schon frei, erfaehrt der
                    // Finanzierungspartner davon. Sie bleibt trotzdem frei.
                    void meldeBonitaetNachFreigabe({
                      investmentId: rejectDialog.invId,
                      kundeId: id || "",
                      kundeName: [kunde?.vorname, kunde?.nachname].filter(Boolean).join(" "),
                      docName: rejectDialog.docName,
                      aktion: "abgelehnt",
                      metaVorher: metaVorAblehnung,
                    });
                    unterlagenVorgangAbschliessen(rejectDialog.invId, [rejectDialog.docName], ablehnGen, { art: "status", name: rejectDialog.docName, status: "rejected" });
                    toast({ title: "Dokument abgelehnt", description: rejectDialog.docName, variant: "destructive" });
                    forceUpdate(n => n + 1);
                    // Auto-prompt: nach Ablehnung prüfen, ob alle Dokumente nun geprüft sind
                    const invId = rejectDialog.invId;
                    const docName = rejectDialog.docName;
                    setTimeout(() => {
                      const bankListe = bankDocsBaseFuerInvestment(invId).p1;
                      const ds = { ...applyLegacyDocKeys(getInvestmentDocStatuses(invId), bankListe.map(d => d.name)), [docName]: "rejected" as DocStatus };
                      const saPdf = getSaNeueUnterschriftAusstehend(invId) ? "" : getInvestmentSaPdf(invId);
                      const saSig = getSaSigned(invId);
                      const allBonitaet = bonitaetDocsFuerInvestment(invId).p1.every(d => {
                        // Eine unterschriebene Selbstauskunft gilt automatisch als freigegeben.
                        const s = d.name === "Selbstauskunft" ? ((saPdf || saSig) ? "approved" : "none") : (ds[d.name] || "none");
                        return s === "approved" || s === "rejected";
                      });
                      const allBank = bankListe.every(d => {
                        const s = ds[d.name] || "none";
                        return s === "approved" || s === "rejected";
                      });
                      if (allBonitaet && allBank) {
                        setReviewDialog({ invId, section: "bonitaet" });
                      }
                    }, 350);
                  }
                  setRejectDialog(null);
                  setRejectReason("");
                }}
              >
                Ablehnen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Prüfung abschließen & E-Mail senden Dialog ── */}
        <AlertDialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Prüfungsergebnis an Kunden senden
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>Folgendes Ergebnis wird per E-Mail an <strong>{kunde?.email}</strong> gesendet:</p>
                  {(() => {
                    if (!reviewDialog || !kunde) return null;
                    const inv = investments.find(i => i.id === reviewDialog.invId);
                    if (!inv) return null;
                    const bankListe = bankDocsBaseFuerInvestment(inv.id).p1;
                    const ds = applyLegacyDocKeys(getInvestmentDocStatuses(inv.id), bankListe.map(d => d.name));
                    const reasons = getDocRejectReasons(inv.id);
                    const bonitaetApproved = bonitaetDocsFuerInvestment(inv.id).p1.filter(d => ds[d.name] === "approved");
                    const bonitaetRejected = bonitaetDocsFuerInvestment(inv.id).p1.filter(d => ds[d.name] === "rejected");
                    const bankApproved = bankListe.filter(d => ds[d.name] === "approved");
                    const bankRejected = bankListe.filter(d => ds[d.name] === "rejected");
                    const totalApproved = bonitaetApproved.length + bankApproved.length;
                    const totalRejected = bonitaetRejected.length + bankRejected.length;
                    return (
                      <div className="bg-muted rounded-lg p-3 space-y-3 text-sm">
                        {(bonitaetApproved.length > 0 || bonitaetRejected.length > 0) && (
                          <div>
                            <span className="font-semibold text-foreground text-xs uppercase tracking-wide">Bonitätscheck</span>
                            {bonitaetApproved.length > 0 && (
                              <div className="mt-1">
                                <span className="font-medium text-[hsl(var(--success))]">✓ Freigegeben ({bonitaetApproved.length})</span>
                                <ul className="ml-4 mt-0.5 space-y-0.5">
                                  {bonitaetApproved.map(d => <li key={d.name} className="text-muted-foreground">• {d.name}</li>)}
                                </ul>
                              </div>
                            )}
                            {bonitaetRejected.length > 0 && (
                              <div className="mt-1">
                                <span className="font-medium text-destructive">✗ Abgelehnt ({bonitaetRejected.length})</span>
                                <ul className="ml-4 mt-0.5 space-y-0.5">
                                  {bonitaetRejected.map(d => <li key={d.name} className="text-destructive/80">• {d.name}: {reasons[d.name] || "–"}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                        {(bankApproved.length > 0 || bankRejected.length > 0) && (
                          <div className="border-t pt-2">
                            <span className="font-semibold text-foreground text-xs uppercase tracking-wide">Bankprüfung</span>
                            {bankApproved.length > 0 && (
                              <div className="mt-1">
                                <span className="font-medium text-[hsl(var(--success))]">✓ Freigegeben ({bankApproved.length})</span>
                                <ul className="ml-4 mt-0.5 space-y-0.5">
                                  {bankApproved.map(d => <li key={d.name} className="text-muted-foreground">• {d.name}</li>)}
                                </ul>
                              </div>
                            )}
                            {bankRejected.length > 0 && (
                              <div className="mt-1">
                                <span className="font-medium text-destructive">✗ Abgelehnt ({bankRejected.length})</span>
                                <ul className="ml-4 mt-0.5 space-y-0.5">
                                  {bankRejected.map(d => <li key={d.name} className="text-destructive/80">• {d.name}: {reasons[d.name] || "–"}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="border-t pt-2 text-xs text-muted-foreground">
                          Gesamt: <strong className="text-[hsl(var(--success))]">{totalApproved} freigegeben</strong>
                          {totalRejected > 0 && <>, <strong className="text-destructive">{totalRejected} abgelehnt</strong></>}
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground">Abgelehnte Dokumente werden im Kundenportal markiert und der Kunde kann neue Versionen hochladen.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {/* Die Ergebnismail folgt der Kundensprache. */}
              <KundenspracheHinweis kontaktId={id} className="self-center sm:mr-auto" />
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                if (!reviewDialog || !kunde) return;
                const inv = investments.find(i => i.id === reviewDialog.invId);
                if (!inv) return;
                const bankListe = bankDocsBaseFuerInvestment(inv.id).p1;
                const ds = applyLegacyDocKeys(getInvestmentDocStatuses(inv.id), bankListe.map(d => d.name));
                const reasons = getDocRejectReasons(inv.id);

                // Collect ALL docs from both sections
                const bonitaetResults = bonitaetDocsFuerInvestment(inv.id).p1
                  .filter(d => ds[d.name] === "approved" || ds[d.name] === "rejected")
                  .map(d => ({ name: d.name, status: ds[d.name] as "approved" | "rejected", reason: reasons[d.name] }));
                const bankResults = bankListe
                  .filter(d => ds[d.name] === "approved" || ds[d.name] === "rejected")
                  .map(d => ({ name: d.name, status: ds[d.name] as "approved" | "rejected", reason: reasons[d.name] }));
                const allRejected = [...bonitaetResults, ...bankResults].filter(d => d.status === "rejected");

                // Send email with both sections
                if (kunde.email) {
                  try {
                    await supabase.functions.invoke("send-review-result", {
                      body: {
                        to: kunde.email,
                        kundenName: `${kunde.vorname} ${kunde.nachname}`,
                        bonitaetDocs: bonitaetResults,
                        bankDocs: bankResults,
                        // Für die Kundensprache der Ergebnismail.
                        kontaktId: id,
                      },
                    });
                  } catch (e) {
                    console.error("Review result email failed:", e);
                  }
                }

                // Create notification for customer (in-app), in der Sprache aus dem Kundenprofil
                const authUserId = (kunde as any)?.meta?.authUserId || (kunde as any)?.authUserId;
                if (authUserId) {
                  const pruefText = KUNDEN_GLOCKE.unterlagenPruefung[kundenSprache(id)](allRejected.length);
                  await supabase.from("benachrichtigungen").insert({
                    benutzer_id: authUserId,
                    titel: pruefText.titel,
                    nachricht: pruefText.nachricht,
                    // Ziel im Kundenportal; die frühere Route /profil existiert nicht.
                    link: "/kunde/investments",
                  });
                }

                // Save timestamp to investment meta
                updateInvestment(reviewDialog.invId, { reviewResultSentAt: new Date().toISOString() });

                // Set freigabe marker on kontakt-meta if no rejections (= alles freigegeben)
                if (allRejected.length === 0 && id) {
                  try {
                    await mergeKontaktMeta(id, { unterlagenFreigegebenAm: new Date().toISOString(), unterlagenFreigegebenVon: user.name });
                  } catch (err) { console.error("[unterlagenFreigegebenAm]", err); }

                  /*
                   * Der Finanzierungspartner ist jetzt am Zug.
                   *
                   * Seit die Bonitaetsunterlagen hinter der Reservierung
                   * liegen, ist diese Freigabe der Startschuss fuer die
                   * Finanzierung. Vorher lag die Bonitaet weit vorne im
                   * Prozess, und Stefan Kurz erfuhr erst viel spaeter, dass
                   * etwas fuer ihn anliegt.
                   *
                   * Der Kunde bekommt seine Mail wie bisher, hier kommt nur
                   * die Meldung an den Finanzierungspartner dazu. Sie meldet
                   * sich selbst genau einmal je Investment.
                   */
                  try {
                    const meldung = await meldeBonitaetFreigabe(
                      reviewDialog.invId, id, `${kunde.vorname} ${kunde.nachname}`,
                    );
                    if (meldung.gemeldet && meldung.grund) {
                      // Teilweise durchgekommen, etwa Glocke ja und Mail nein.
                      toast({ title: "Finanzierungspartner informiert", description: meldung.grund });
                    }
                  } catch (err) {
                    console.error("[Bonitaetsfreigabe an Finanzierungspartner]", err);
                  }
                }

                const kontaktRow = cacheGet("kontakte").find((k: any) => k.id === id);
                notifyPruefungErgebnis(`${kunde.vorname} ${kunde.nachname}`, id || "", kontaktRow?.zustaendig_id);

                toast({
                  title: "Prüfungsergebnis gesendet ✓",
                  description: allRejected.length > 0
                    ? `${allRejected.length} Dokument(e) abgelehnt – Kunde wurde per E-Mail benachrichtigt.`
                    : "Alle Dokumente freigegeben – Kunde wurde per E-Mail benachrichtigt.",
                });
                setReviewDialog(null);
                forceUpdate(n => n + 1);
              }} className="gap-1.5">
                <Send className="h-3 w-3" /> Ergebnis senden
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Die drei Antworten zu einem Termin aus der Aktionsliste. Geschrieben
            wird ueber dieselben Funktionen wie in den Ergebnis-Kaesten. */}
        {aktionTermin && id && kunde && (
          <TerminErgebnisDialog
            termin={aktionTermin}
            kontext={{
              kundeId: id,
              kundeName: `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim() || "Kunde",
              beraterName: kunde.berater || undefined,
              userName: user.name,
              melde: (meldung) => { toast(meldung); },
            } as ErgebnisKontext}
            onClose={() => setAktionTermin(null)}
          />
        )}

        {/* ── Termin verschieben Dialog ── */}
        <AlertDialog open={verschiebenDialog} onOpenChange={setVerschiebenDialog}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <AlertDialogHeader>
              {/*
                Der Dialog wird aus den Ergebnis-Kaesten geoeffnet. Der Titel
                nennt den Termin, der verschoben wird: den im Setter-Feld
                (`setterTerminName`) oder ein festes Gespraech
                (`verschiebenFest`).
              */}
              <AlertDialogTitle>{verschiebenFest?.titel || (kunde ? setterTerminName(kunde) : "Termin")} verschieben</AlertDialogTitle>
              <AlertDialogDescription>
                Trage den neuen Termin ein. Der Lead bleibt dir zugewiesen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div>
                <Label className="text-xs">Neues Datum *</Label>
                <DateInput value={verschiebenDatum} onChange={setVerschiebenDatum} className="h-9 mt-1" minDate={heuteIso()} />
              </div>
              <div>
                <Label className="text-xs">Neue Uhrzeit *</Label>
                <Input type="time" value={verschiebenUhrzeit} onChange={e => setVerschiebenUhrzeit(e.target.value)} className="h-9 mt-1" />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction disabled={!verschiebenDatum || !verschiebenUhrzeit} onClick={handleTerminVerschoben}>
                <RefreshCw className="h-4 w-4 mr-1" /> Termin verschieben
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Archivieren Dialog ── */}
        <AlertDialog open={archivDialog} onOpenChange={setArchivDialog}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunde archivieren</AlertDialogTitle>
              <AlertDialogDescription>
                Der Kunde wird archiviert und in der Liste „Verloren" angezeigt. Die Daten bleiben im System erhalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2">
              <Label>Archivierungsgrund *</Label>
              <Textarea
                value={archivGrund}
                onChange={e => setArchivGrund(e.target.value)}
                placeholder="z.B. Keine Rückmeldung, Projekt pausiert, ..."
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                disabled={!archivGrund.trim()}
                onClick={handleArchive}
              >
                <Archive className="h-4 w-4 mr-1" /> Archivieren
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Verloren Dialog ── */}
        <AlertDialog open={verlorenDialog} onOpenChange={setVerlorenDialog}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunde als verloren markieren</AlertDialogTitle>
              <AlertDialogDescription>
                Der Kunde wird in der Pipeline auf „Verloren" gesetzt. Bitte gib einen Grund an.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2 max-h-[55vh] overflow-y-auto pr-1">
              <VerlustGrundAuswahl wert={verlorenGrund} onChange={setVerlorenGrund} />
              <p className="text-xs text-muted-foreground">
                Pflichtangabe. Wird in der Statistik unter „Verlustgründe" ausgewertet.
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                disabled={!verlorenGrund.trim()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!id || !kunde) return;
                  // Die bisherige Stufe merken, damit eine spaetere
                  // Wiederaufnahme dort weitermacht statt ganz vorne.
                  const stufeVorher = getEffectivePipelineStufe(kunde);
                  updateKontakt(id, {
                    pipelineStufe: "verloren",
                    status: "verloren" as any,
                    verlorenGrund,
                    verlorenAm: new Date().toISOString(),
                    stufeVorVerlust:
                      stufeVorher && stufeVorher !== "verloren" && stufeVorher !== "archiviert"
                        ? stufeVorher
                        : kunde.stufeVorVerlust,
                  });
                  addAktivitaet({
                    kundeId: id,
                    art: "notiz",
                    beschreibung: `Kunde als verloren markiert. Grund: ${verlustGrundLabel(verlorenGrund)}`,
                    von: user.name,
                  });
                  reloadKunde();
                  toast({
                    title: "Als verloren markiert",
                    description: `${kunde.vorname} ${kunde.nachname} wurde als verloren markiert.`,
                    variant: "destructive",
                  });
                  setVerlorenDialog(false);
                }}
              >
                <XCircle className="h-4 w-4 mr-1" /> Als verloren markieren
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Wiederaufnahme aus „Verloren" oder „Archiviert" ── */}
        <AlertDialog open={wiederaufnahmeDialog} onOpenChange={setWiederaufnahmeDialog}>
          <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
            <AlertDialogHeader>
              <AlertDialogTitle>Kunde wieder aufnehmen</AlertDialogTitle>
              <AlertDialogDescription>
                Der Kontakt kommt zurück in die laufende Arbeit und steht danach wieder in
                „Alle Kontakte" und in der Pipeline. Der bisherige Verlustgrund wird entfernt,
                die Stufe „{PIPELINE_STUFEN.find(s => s.key === (kunde?.stufeVorVerlust || "erreicht"))?.label || "Erreicht"}"
                wird wiederhergestellt. Alle Daten bleiben erhalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!id || !kunde) return;
                  const zielStufe = (kunde.stufeVorVerlust && kunde.stufeVorVerlust !== "verloren"
                    && kunde.stufeVorVerlust !== "archiviert")
                    ? kunde.stufeVorVerlust
                    : "erreicht";
                  updateKontakt(id, {
                    pipelineStufe: zielStufe as any,
                    status: "kontaktiert" as any,
                    archiviert: false,
                    archivGrund: undefined,
                    verlorenGrund: undefined,
                    verlorenAm: undefined,
                    stufeVorVerlust: undefined,
                    reaktiviertAm: new Date().toISOString(),
                  });
                  addAktivitaet({
                    kundeId: id,
                    art: "notiz",
                    beschreibung: `Kunde wieder aufgenommen (Stufe „${PIPELINE_STUFEN.find(s => s.key === zielStufe)?.label || zielStufe}")`,
                    von: user.name,
                  });
                  reloadKunde();
                  toast({
                    title: "Wieder aufgenommen",
                    description: `${kunde.vorname} ${kunde.nachname} ist zurück in der laufenden Arbeit.`,
                  });
                  setWiederaufnahmeDialog(false);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Wieder aufnehmen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {kunde && id && (
          <DsgvoHardDeleteDialog
            open={dsgvoHardDeleteOpen}
            onOpenChange={setDsgvoHardDeleteOpen}
            kontaktId={id}
            vorname={kunde.vorname}
            nachname={kunde.nachname}
            email={kunde.email}
            onSuccess={() => navigate("/alle-kontakte")}
          />
        )}

        {/* Einzelne Immobilien aus der Selbstauskunft */}
        <Dialog open={!!immoDetail} onOpenChange={(o) => !o && setImmoDetail(null)}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Immobilienvermögen im Detail
              </DialogTitle>
            </DialogHeader>
            {immoDetail && (
              <div className="space-y-5 text-sm">
                {/* Die Gesamtrechnung zuerst, damit die Zahl aus der Übersicht sofort wiederzufinden ist. */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <span>Verkehrswert</span>
                    <span className="tabular-nums">{fmt(immoDetail.verkehrswert)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <span>abzüglich Restschuld</span>
                    <span className="tabular-nums">− {fmt(immoDetail.restschuld)}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t pt-1.5 font-bold text-primary">
                    <span>Netto</span>
                    <span className="tabular-nums">{fmt(immoDetail.netto)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                    Objekte ({immoDetail.objekte.length})
                  </p>
                  {immoDetail.objekte.length > 0 ? (
                    <div className="space-y-1.5">
                      {immoDetail.objekte.map((o, i) => (
                        <div key={`obj-${i}`} className="flex justify-between gap-4 border-b pb-1.5 last:border-0">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{o.bezeichnung}</div>
                            <div className="text-xs text-muted-foreground">
                              {[o.nutzung, o.eigentuemer, o.person === 2 ? "Person 2" : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                          <span className="tabular-nums whitespace-nowrap">{fmt(o.verkehrswert)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Keine Objekte mit Marktwert hinterlegt. Der Verkehrswert stammt aus dem Feld
                      „Marktwert" im Block „Immobilienvermögen (Details)" der Selbstauskunft.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                    Immobilienkredite ({immoDetail.kredite.length})
                  </p>
                  {immoDetail.kredite.length > 0 ? (
                    <div className="space-y-1.5">
                      {immoDetail.kredite.map((k, i) => (
                        <div key={`kr-${i}`} className="flex justify-between gap-4 border-b pb-1.5 last:border-0">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{k.bezeichnung}</div>
                            <div className="text-xs text-muted-foreground">
                              {[k.bank, k.person === 2 ? "Person 2" : null].filter(Boolean).join(" · ")}
                            </div>
                            {/* Kreditdetails seit 28.09.2026, bei älteren Angaben leer. */}
                            {(k.restschuldPer || k.kreditnehmer || k.zinsart || k.sondertilgung) && (
                              <div className="text-xs text-muted-foreground">
                                {[
                                  k.restschuldPer ? `Restschuld per ${k.restschuldPer}` : null,
                                  k.kreditnehmer ? `Kreditnehmer: ${k.kreditnehmer}` : null,
                                  k.zinsart ? `Zins ${k.zinsart.toLowerCase()}` : null,
                                  k.sondertilgung ? `Sondertilgung: ${k.sondertilgung.toLowerCase()}` : null,
                                ].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                          <span className="tabular-nums whitespace-nowrap text-muted-foreground">− {fmt(k.restschuld)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Keine Immobilienkredite hinterlegt</p>
                  )}
                </div>

                {/* Ehrlich benennen, was die Daten hergeben. Die Selbstauskunft kennt
                    keine Verknüpfung zwischen Kredit und Objekt, ein Nettowert je
                    Objekt waere deshalb geraten. Bei genau einem Objekt ist die
                    Zuordnung dagegen eindeutig. */}
                {!immoDetail.eindeutigZuordenbar && immoDetail.kredite.length > 0 && (
                  <p className="text-xs text-muted-foreground leading-snug border-t pt-3">
                    Die Selbstauskunft erfasst nicht, welcher Kredit zu welchem Objekt gehört.
                    Deshalb steht der Nettowert nur in der Summe und nicht je Objekt.
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Zusammenfassung Erstgespräch – auch wenn das Skript eingeklappt ist erreichbar */}
        <Dialog open={erstgespraechSummaryOpen} onOpenChange={setErstgespraechSummaryOpen}>
          <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <StickyNote className="h-5 w-5 text-primary" />
                Zusammenfassung Erstgespräch
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground -mt-2">
              Überblick aus den Skript-Antworten – zur Vorbereitung auf das Beratungsgespräch.
            </p>
            {(() => {
              const skriptStand = leseSetterSkriptStand();
              const kurzfassung = baueErstgespraechZusammenfassung(skriptStand, { schritte: ERSTGESPRAECH_SCHRITTE });
              const kiText = leseErstgespraechKiText();
              const abschnitte = baueErstgespraechDetails(skriptStand, ERSTGESPRAECH_SCHRITTE_DETAIL);
              return (
                <div className="space-y-4">
                  {kurzfassung.fortschritt && (
                    <p className="text-xs font-medium text-muted-foreground">{kurzfassung.fortschritt}</p>
                  )}

                  {/* Die KI-Fassung kommt aus der Edge Function und wird nur
                      angezeigt, wenn sie im Skript erzeugt wurde. Sonst steht
                      hier die Kurzfassung aus den gespeicherten Antworten. */}
                  {(kiText || kurzfassung.text) && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
                        {kiText ? "KI-Zusammenfassung" : "Kurzfassung"}
                      </p>
                      <p className="text-sm whitespace-pre-line">{kiText || kurzfassung.text}</p>
                    </div>
                  )}

                  {abschnitte.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Antworten im Einzelnen
                      </p>
                      {abschnitte.map(abschnitt => (
                        <div key={abschnitt.id} className="rounded-lg border border-border p-3">
                          <p className="text-sm font-bold mb-2">{abschnitt.nrText ?? abschnitt.nr}. {abschnitt.titel}</p>
                          <dl className="space-y-2">
                            {abschnitt.eintraege.map((eintrag, i) => (
                              <div key={`${abschnitt.id}-${i}`}>
                                <dt className="text-xs text-muted-foreground">{eintrag.frage}</dt>
                                <dd className="text-sm whitespace-pre-line">{eintrag.antwort}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </div>
                  )}

                  {!kiText && !kurzfassung.text && abschnitte.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Im Erstgesprächs-Skript ist noch keine Antwort gespeichert.
                    </p>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>

      {/*
        Der Aufnahmebogen Notar, im Inhaltsbereich statt über dem ganzen Fenster.

        Vorher stand hier `fixed inset-0`, also eine Schicht über allem. Damit
        verschwanden Navigationsleiste und Logo, sobald der Bogen aufging.
        Jetzt sitzt der Bogen im normalen Inhaltsbereich, so wie Reservierung
        und Selbstauskunft, und die Leiste bleibt daneben stehen.

        Die Höhenkette vom 22.09.2026 bleibt unverändert: `h-full` nimmt die
        Höhe des Inhaltsbereichs, die in `DashboardLayout` feststeht
        (`main` ist dort `flex-1 min-h-0` in einer Spalte über `h-screen`).
        `min-h-0` erlaubt dem mittleren Streifen zu schrumpfen, und
        `overflow-hidden` hält alles im Fenster. Gescrollt wird nur im
        Formular, sonst könnte dessen Knopfleiste nicht unten stehen bleiben.

        Der Weg zurück steht im Formular selbst, wie bei der Reservierung, und
        fragt dort nach, wenn etwas geändert wurde.
      */}
      {showKaufvertragForm && (
        /*
          Kein eigener Hintergrund.

          Hier stand bis zum 22.09.2026 `bg-background`. Das sieht harmlos aus,
          denn es ist derselbe Farbwert, den auch der Inhaltsbereich trägt. Die
          Glasschicht (`styles/design-glas.css`, am Dokument als
          `data-glas="an"`) nimmt dem Inhaltsbereich seinen Hintergrund aber
          ausdrücklich wieder weg (`main.flex-1 { background-color:
          transparent }`), damit die blau getönte Fläche des Fensters
          durchscheint. Ein Kasten, der den Farbwert selbst setzt, ist deshalb
          der einzige deckende Fleck auf der Seite: ein hellerer Streifen mit
          einer harten Kante, genau oberhalb der Überschrift.

          Die Reservierungsvereinbarung setzt an dieser Stelle keinen
          Hintergrund, und so sieht es richtig aus. Der Rahmen hier tut es
          jetzt auch. `NotarbogenRahmen.test.ts` hält das fest.
        */
        <div className="flex h-full min-h-0 w-full flex-col gap-6 overflow-hidden">
          {/*
            Die Kopfzeile wie bei der Reservierungsvereinbarung.

            Vorher stand hier eine eigene Leiste mit einer kleinen Zwischen-
            überschrift, und der ganze Bogen steckte in `max-w-4xl` (896
            Pixel). Auf einem breiten Bildschirm stand er damit als schmale
            Spalte in der Mitte, während Reservierung und Selbstauskunft die
            volle Breite des Inhaltsbereichs nutzen. Christian am 22.09.2026:
            der Bogen soll über die gesamte Seitenbreite gehen und aussehen
            wie die Reservierung.

            `PageHeader` bringt genau das mit, was die Reservierung oben zeigt:
            grosse Überschrift, blauer Strich, darunter die Zeile in kleiner
            Schrift, für wen und für welches Objekt. Der Abstand `gap-6`
            entspricht dem `space-y-6` der Reservierungsseite.
          */}
          <div className="shrink-0">
            <PageHeader
              title="Aufnahmebogen Notar"
              subtitle={(() => {
                const kvInv = investments.find(i => i.id === showKaufvertragForm);
                const objekt = kvInv?.objektTitel
                  ? `${kvInv.objektTitel}${kvInv.weNr ? ` WE ${kvInv.weNr}` : ""}`
                  : "";
                const name = `${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim();
                return `Kaufvertrag${name ? ` für ${name}` : ""}${objekt ? `, ${objekt}` : ""}`;
              })()}
            />
          </div>
          {/*
            Der mittlere Streifen bekommt die Resthöhe. `min-h-0` erlaubt ihm
            zu schrumpfen, sonst wächst er mit dem Inhalt über den Bildschirm
            hinaus und das Formular hätte keine feste Höhe mehr.
          */}
          <div className="flex min-h-0 w-full flex-1 flex-col">
          {(() => {
            const kvInv = investments.find(i => i.id === showKaufvertragForm);
            if (!kvInv) return null;
            const existingData = getKaufvertragData(kvInv.id);
            // Pre-fill buyer + seller + object data
            const invMeta = (kvInv as any).meta || {};
            // Geburtsdatum, Steuer-ID und Geburtsname nur aus der Selbstauskunft
            // dieses Investments; sonst greifen die Angaben am Kontakt.
            const sd = invMeta.saData || invMeta.saSnapshot;
            const rvData = invMeta.rvData;
            // Get object data for seller & property pre-fill
            const objektId = (kvInv as any).objektId || invMeta.objektId || (kvInv as any).objekt || "";
            /*
             * Die Suche im eigenen Bestand hängt am Schalter
             * `BESTANDSWOHNUNG_AKTIV`. Solange er aus ist, kommen Adresse,
             * Preis, Verkäufer und Grundbuch allein aus der Objektauswahl
             * des Investments, also aus `invObjekt` weiter unten. Ein
             * gespeicherter Verweis bleibt am Investment stehen und greift
             * unverändert wieder, sobald der Schalter auf an steht.
             */
            const objekt = BESTANDSWOHNUNG_AKTIV && objektId ? getObjektById(objektId) : undefined;
            const vk = objekt?.verkaeuferDaten;
            const wohnungId = (kvInv as any).wohnungId || invMeta.wohnungId || (kvInv as any).wohnung || "";
            const wohnung = objekt?.wohnungen?.find((w: any) => w.id === wohnungId);
            // Fetch einreichung data for additional seller fields
            const ed = einreichungData;
            // Trigger async fetch if not yet loaded
            if (!ed && objektId) {
              supabase.from("objekt_einreichungen").select("*").eq("uebernommenes_objekt_id", objektId).limit(1).then(({ data: rows }) => {
                if (rows && rows.length > 0) setEinreichungData(rows[0]);
                else setEinreichungData({});
              });
            }
            /*
             * Die Objektauswahl des Investments als weitere Quelle.
             *
             * Bisher kannte dieser Bogen nur den eigenen Bestand: `objekt`
             * und `wohnung` oben. Bei einem von Hand eingetragenen Objekt
             * blieb er vollständig leer, und Adresse, Preis, Verkäufer und
             * Grundbuch wurden ein drittes Mal getippt. Der Bestand bleibt
             * vorn, ergänzt wird nur, was dort nicht steht.
             */
            const invObjekt = vorhandeneObjektDaten(kvInv.id);
            const invVk = invObjekt.verkaeufer || {};
            const invGb = invObjekt.grundbuch || {};
            const invAnschrift = [
              invVk.strasse,
              [invVk.plz, invVk.ort].filter(Boolean).join(" "),
            ].filter(Boolean).join(", ");
            const invObjAdresse = [
              invObjekt.strasse,
              [invObjekt.plz, invObjekt.ort].filter(Boolean).join(" "),
            ].filter(Boolean).join(", ");
            const prefilled = {
              ...existingData,
              // Käufer
              k_name: existingData.k_name || kunde?.nachname || "",
              k_vorname: existingData.k_vorname || kunde?.vorname || "",
              k_email: existingData.k_email || kunde?.email || "",
              k_telefon: existingData.k_telefon || kunde?.telefon || "",
              k_anschrift: existingData.k_anschrift || `${kunde?.strasse || ""} ${kunde?.hausnummer || ""}, ${kunde?.plz || ""} ${kunde?.ort || ""}`.trim().replace(/^,\s*/, "").replace(/,\s*$/, ""),
              k_geburtsdatum: existingData.k_geburtsdatum || sd?.geburtsdatum || kunde?.geburtstag || "",
              /*
               * `rvData` bleibt hier als Quelle stehen, obwohl die
               * Reservierung die Steuer-ID seit dem 22.09.2026 nicht mehr
               * erhebt. Bestehende Reservierungen tragen sie weiterhin, und
               * genau diese Kunden sollen ihre Vorbefüllung behalten. Bei
               * einer neuen Reservierung läuft das Glied einfach ins Leere
               * und das nächste greift. Kein toter Code, bitte stehen lassen.
               */
              k_steuerid: existingData.k_steuerid || rvData?.steuerId || sd?.steuerId || (kunde as any)?.steuerId || "",
              k_geburtsname: existingData.k_geburtsname || sd?.geburtsname || "",
              /*
               * Verkäufer aus Objekt, Objektauswahl und Einreichung.
               *
               * Bis 09/2026 wurde der Name hier am letzten Leerzeichen
               * geteilt, um Nachname und Vorname des Bogens zu füllen. Aus
               * „Musterbau Projektentwicklung GmbH“ wurde damit Nachname
               * „GmbH“, und so ging es zum Notar. Geteilt wird deshalb
               * nichts mehr: Eine Firma bekommt ein Namensfeld, eine
               * Privatperson zwei getrennte, und solange niemand gewählt
               * hat, steht der Name unverändert im ersten Feld.
               */
              ...(() => {
                const quelle = {
                  art: invVk.art,
                  name: vk?.name || ed?.eigentuemer_name || invVk.name || "",
                  vorname: invVk.vorname || "",
                  handelsregister: ed?.eigentuemer_hrb || invVk.handelsregister || "",
                };
                const felder = verkaeuferNotarFelder(quelle);
                return {
                  vk_art: existingData.vk_art || verkaeuferArt(quelle),
                  vk_name: existingData.vk_name || felder.name,
                  vk_vorname: existingData.vk_vorname || felder.vorname,
                };
              })(),
              vk_email: existingData.vk_email || vk?.email || ed?.eigentuemer_email || invVk.email || "",
              vk_telefon: existingData.vk_telefon || vk?.telefon || ed?.eigentuemer_telefon || invVk.telefon || "",
              vk_anschrift: existingData.vk_anschrift || (vk ? `${vk.strasse || ""}, ${vk.plz || ""} ${vk.ort || ""}`.trim().replace(/^,\s*/, "").replace(/,\s*$/, "") : "") || invAnschrift,
              vk_geburtsdatum: existingData.vk_geburtsdatum || ed?.eigentuemer_geburtsdatum || "",
              // `vk?.firma` stand hier früher an erster Stelle. Das ist der
              // Firmenname aus „Objekt anlegen“ und keine Registernummer;
              // im Bogen stand damit unter HRB ein Firmenname.
              vk_hrb: existingData.vk_hrb || ed?.eigentuemer_hrb || invVk.handelsregister || "",
              // Bankverbindung VK – from einreichung
              bank_iban: existingData.bank_iban || ed?.eigentuemer_iban || "",
              // Kontoinhaber ist der Verkäufer, also sein vollständiger Name
              // in einer Zeile und nicht die Hälfte davon.
              bank_name: existingData.bank_name || verkaeuferVollerName({
                art: invVk.art,
                name: vk?.name || ed?.eigentuemer_name || invVk.name || "",
                vorname: invVk.vorname || "",
                handelsregister: ed?.eigentuemer_hrb || invVk.handelsregister || "",
              }),
              // Vertragsobjekt
              obj_adresse: existingData.obj_adresse || objekt?.adresse || invObjAdresse,
              /*
               * Welche Wohnung im Haus. Ohne diese beiden Zeilen benannte
               * der Bogen nur die Adresse, also das Haus.
               *
               * Die Wohneinheit kommt aus Schritt 1 der Objektauswahl, die
               * Wohnungsnummer laut Teilungserklärung aus deren Schritt 4.
               * Beim eigenen Bestand steht die Einheit an der Wohnung.
               */
              obj_wohneinheit: existingData.obj_wohneinheit || wohnung?.weNr || invObjekt.weNr || "",
              obj_wohnungsnummer: existingData.obj_wohnungsnummer || invGb.wohnungsnummer || "",
              // Das ganze Haus (Globalobjekt): Kennzeichen, das die Reservierung des Hauses setzt.
              // Nur gesetzt, wenn es zutrifft; der Bogen einer Wohnung bleibt unverändert.
              ...(existingData.obj_gesamtobjekt === true || invMeta.globalObjekt === true ? { obj_gesamtobjekt: true } : {}),
              kaufpreis: existingData.kaufpreis || (wohnung?.vkGesamt ? String(wohnung.vkGesamt) : "")
                || (invObjekt.kaufpreis ? String(invObjekt.kaufpreis) : ""),
              // Grundbuch: bisher immer von Hand, jetzt aus der Objektauswahl
              amtsgericht: existingData.amtsgericht || invGb.amtsgericht || "",
              gemarkung: existingData.gemarkung || invGb.gemarkung || "",
              blatt: existingData.blatt || invGb.blatt || "",
              flnr: existingData.flnr || invGb.flurstueck || "",
              // Vermittler (MOREImmo)
              makler_name: existingData.makler_name || "MOREImmo (Einzelunternehmen, Inhaber Christian Kurz)",
              makler_anschrift: existingData.makler_anschrift || "Wendelsteinstraße 19, 83075 Bad Feilnbach",
              // Hausverwaltung
              hv_name: existingData.hv_name || ed?.hausverwaltung || (objekt?.meta as any)?.hausverwaltung || "",
            };
            return (
              <>
              {(() => {
                const m = kvInv.meta || {};
                // Wie im Kundenprofil: nur zu einem eingetragenen Objekt.
                if (m.quelle !== "investagon" || !(kvInv.objektId || !objektDatenFehlen(kvInv.id))) return null;
                // Nur echte https-Adressen: der Wert ist frei beschreibbar, ein `javascript:` liefe sonst beim Klick.
                const investagonRef = typeof m.investagonRef === "string" && /^https:\/\//i.test(m.investagonRef.trim()) ? m.investagonRef.trim() : "";
                const missing: string[] = [];
                if (!prefilled.obj_adresse) missing.push("Adresse");
                if (!prefilled.kaufpreis) missing.push("Kaufpreis");
                if (!prefilled.vk_name) missing.push("Verkäufer-Name");
                if (!prefilled.vk_anschrift) missing.push("Verkäufer-Anschrift");
                if (!prefilled.bank_iban) missing.push("Verkäufer-IBAN");
                return (
                  /* `shrink-0`, weil dieser Kasten jetzt in einer Spalte mit
                     fester Höhe steht und sonst zusammengedrückt würde. */
                  <div className="mb-4 shrink-0 rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-4 py-3 text-xs">
                    <p className="font-semibold mb-1">⚠ Investagon-Reservierung: Objektdaten manuell ergänzen</p>
                    <p className="text-muted-foreground mb-1">
                      Dieses Investment wurde via Investagon reserviert. Bitte fehlende Felder aus dem entsprechenden Investagon-Objekt übernehmen.
                      {investagonRef ? (
                        <> <a href={investagonRef} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">Investagon-Objekt öffnen ↗</a></>
                      ) : null}
                    </p>
                    {missing.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">Fehlt aktuell: {missing.join(", ")}.</p>
                    )}
                    <p className="text-[11px] text-muted-foreground italic mt-1">Dieser Hinweis erscheint nicht im PDF.</p>
                  </div>
                );
              })()}
              {/* Der Rest der Höhe gehört dem Formular, damit seine
                  Knopfleiste am unteren Bildschirmrand sitzt und nur der
                  Karteninhalt scrollt. Genauso in `SelbstauskunftPage.tsx`. */}
              <div className="flex min-h-0 flex-1 flex-col">
              <KaufvertragForm
                initialData={prefilled}
                kundeName={`${kunde?.vorname || ""} ${kunde?.nachname || ""}`}
                investmentId={kvInv.id}
                kundeId={id}
                /*
                 * Der Weg zurück ins Kundenprofil.
                 *
                 * Das Formular ruft ihn erst auf, wenn nichts mehr zu
                 * verlieren ist: Ohne eigene Eingabe sofort, sonst nach der
                 * Rückfrage. Die Sprungmarke bringt den Blick wieder auf den
                 * Notarabschnitt, aus dem der Bogen aufgegangen ist.
                 */
                onZurueck={() => {
                  const targetId = `notar-section-${kvInv.id}`;
                  setShowKaufvertragForm(null);
                  setEinreichungData(null);
                  setTimeout(() => {
                    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 50);
                }}
                onSave={async (formData) => {
                  setKaufvertragData(kvInv.id, formData);
                  const pdf = await generateKaufvertragPDF(formData, { kundenSprache: kundenSprache(kunde.id) });
                  const filename = `Kaufvertrag_${kunde?.vorname}_${kunde?.nachname}_${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\./g, "-")}.pdf`;
                  setKaufvertragPdf(kvInv.id, filename);
                  const pdfBlob = pdf.output("blob");
                  const storagePath = `kaufvertrag/${id}/${kvInv.id}/${filename}`;
                  await supabase.storage.from("unterlagen").upload(storagePath, pdfBlob, { upsert: true, contentType: "application/pdf" });
                  const targetId = `notar-section-${kvInv.id}`;
                  setShowKaufvertragForm(null);
                  setEinreichungData(null);
                  toast({ title: "Aufnahmebogen gespeichert ✓", description: "PDF wurde erstellt." });
                  forceUpdate(n => n + 1);
                  setTimeout(() => {
                    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 50);

                  // ── Christian Peetz benachrichtigen: Inbox + App-E-Mail mit Download-Link ──
                  try {
                    const CHRISTIAN_PEETZ_USER_ID = "e81f0a13-0578-4456-9960-07be014d869c";
                    const CHRISTIAN_PEETZ_EMAIL = "info@peetz-ventures.de";
                    const kundeFullName = `${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim() || "Kunde";
                    const kundeLinkPath = `/kunden/${id}`;

                    // Signed Download-URL (7 Tage gültig)
                    let signedUrl = "";
                    try {
                      const { data: signed } = await supabase.storage
                        .from("unterlagen")
                        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
                      signedUrl = signed?.signedUrl || "";
                    } catch (e) { console.warn("createSignedUrl failed", e); }

                    // Objekt-/Wohnungsdaten
                    let objektName = "";
                    let wohnungName = "";
                    try {
                      const objektId = (kvInv as any).objektId || ((kvInv as any).meta || {}).objektId || "";
                      const wohnungId = (kvInv as any).wohnungId || ((kvInv as any).meta || {}).wohnungId || "";
                      if (objektId) {
                        const obj = getObjektById(objektId);
                        objektName = obj?.titel || obj?.adresse || "";
                        const w: any = obj?.wohnungen?.find((x: any) => x.id === wohnungId);
                        wohnungName = w?.bezeichnung || (w?.nummer ? `WHG ${w.nummer}` : "");
                      }
                    } catch {}

                    // 1) Inbox-Benachrichtigung
                    await supabase.from("benachrichtigungen").insert({
                      benutzer_id: CHRISTIAN_PEETZ_USER_ID,
                      titel: `KV-Entwurf & Notartermin koordinieren: ${kundeFullName}`,
                      nachricht: `Für ${kundeFullName} (VP: ${user?.name || "–"}) wurde der Notar-Aufnahmebogen ausgefüllt. Bitte mittels Aufnahmebogen den KV-Entwurf beim Notariat anfordern, Notartermin mit Verkäufer und Kunde abstimmen und anschließend im System unter Notar eintragen.`,
                      link: kundeLinkPath,
                    });

                    // 2) Inbox-Aufgabe für Christian Peetz
                    try {
                      await supabase.from("aufgaben").insert({
                        benutzer_id: CHRISTIAN_PEETZ_USER_ID,
                        zugewiesen_an: CHRISTIAN_PEETZ_USER_ID,
                        kontakt_id: id,
                        titel: `KV-Entwurf & Notartermin koordinieren: ${kundeFullName}`,
                        beschreibung: `Für ${kundeFullName} (VP: ${user?.name || "–"}) wurde der Notar-Aufnahmebogen ausgefüllt.\n\nBitte:\n• Mittels Aufnahmebogen KV-Entwurf beim Notariat anfordern\n• Notartermin mit Verkäufer und Kunde abstimmen\n• Termin im System unter „Notar" eintragen\n• Rücksprache mit VP / Kunde halten${objektName ? `\n\nObjekt: ${objektName}${wohnungName ? ` · ${wohnungName}` : ""}` : ""}`,
                        typ: "aufgabe" as const,
                        prioritaet: "hoch" as const,
                        status: "offen" as const,
                        faellig_am: new Date().toISOString(),
                      });
                    } catch (taskErr) {
                      console.error("[notar-aufnahmebogen] aufgabe insert error:", taskErr);
                    }

                    // 3) App-E-Mail mit Download-Button
                    await supabase.functions.invoke("send-transactional-email", {
                      body: {
                        templateName: "notar-aufnahmebogen-erstellt",
                        recipientEmail: CHRISTIAN_PEETZ_EMAIL,
                        idempotencyKey: `notar-aufnahmebogen-${kvInv.id}-${filename}`,
                        templateData: {
                          empfaengerName: "Christian",
                          kundeName: kundeFullName,
                          objektName,
                          wohnungName,
                          dokumentUrl: signedUrl,
                          erstelltVon: user?.name || "",
                          kundeLink: oeffentlicheAdresse(kundeLinkPath),
                        },
                      },
                    });
                  } catch (notifyErr) {
                    console.error("[notar-aufnahmebogen] notify error:", notifyErr);
                  }
                }}
              />
              </div>
              </>
            );
          })()}
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
