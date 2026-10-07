import { useState, useCallback, useContext, createContext, useEffect, useRef, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KREDIT_AUSWAHL, kreditAuswahlLabel } from "@/lib/finanzierbarkeitUtils";
import { stelleKundenspracheSicher, type Sprache } from "@/lib/kundenSprache";
import { saWertAnzeige, SA_ERKLAERUNG, SA_SCHUFA_KLAUSEL, SA_EINWILLIGUNG } from "@/lib/selbstauskunftSprache";
import { legeSaPdfNachFormularAb } from "@/lib/selbstauskunftPdfAblage";
import { ZWEISPRACHIG_EINLEITUNG, DEUTSCHES_ORIGINAL_ZEIGEN } from "@/lib/zweisprachig";
import { datumUhrzeitText, euroText } from "@/lib/sprachFormat";
import {
  saText,
  enZuDeBetrag,
  deZuEnBetrag,
  saVorbelegungTextIn,
  saFeldMarkeErklaerungIn,
  saAbschnittTextIn,
  SA_EN_EINGABEHINWEIS,
  type SaTextWerte,
} from "@/lib/selbstauskunftTexte";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField as DatePickerFieldBasis } from "@/components/ui/date-picker-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { hinweisDialog, auswahlDialog } from "@/lib/confirm";
import {
  kreditPruefungGesamt,
  kreditFeldStufe,
  istKreditFehler,
  immobilieOhneKreditPersonen,
  immobilienVerweisText,
  verweiseNachLoeschen,
  KREDIT_FELD_LABEL,
  KREDITNEHMER_AUSWAHL,
  ZINSART_AUSWAHL,
  SONDERTILGUNG_AUSWAHL,
  type KreditFeld,
} from "@/lib/kreditPflichtfelder";
import { PFLICHT_OFFEN_RAHMEN } from "@/lib/pflichtRahmen";
import {
  TrendingUp, DollarSign, Users, ShieldCheck, Home, Wallet, Building2, Landmark, CheckCircle2, X, Plus, Send, Loader2, Info, Save, AlertTriangle,
} from "lucide-react";
import { parse, isValid } from "date-fns";
import { cn } from "@/lib/utils";
// PDF generation moved to after signature collection
import { supabase } from "@/integrations/supabase/client";
import { getKontaktById, type KundeData } from "@/lib/kundenStore";
import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { versandNotiz } from "@/lib/prozessNotizen";
import { getSaData, setSaData, getSaDataZurVorbelegung, getInvestmentsByKontakt, setInvestmentMetaFields, getSaKundeStandAm } from "@/lib/investmentsStore";
import {
  abschnitteZuFeldern,
  felderInAbschnitten,
  felderOhneAbschnitt,
  verbleibendeFelder,
  vorbelegterSaStand,
  SA_ABSCHNITT_BESTAETIGEN,
  SA_FELD_MARKE,
  SA_LEGENDE_UEBERNOMMEN,
  SA_VORBELEGUNG_TITEL,
  type SaVorbelegung,
} from "@/lib/saVorbelegung";
import { FormProgress } from "@/components/ui/form-progress";
import { saLadeschrittEnde } from "@/lib/saLadezeit";
import { hatGueterstand } from "@/lib/familienstand";

// Steuer-ID Formatter (3/3/5)
function formatSteuerIdInput(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}/${digits.slice(3)}`;
  return `${digits.slice(0, 3)}/${digits.slice(3, 6)}/${digits.slice(6)}`;
}

/*
 * Steuer-ID Fallback aus bereits angelegten Reservierungen lesen (für
 * Bestands-Kontakte).
 *
 * Die Reservierung erhebt die Steuer-ID seit dem 22.09.2026 nicht mehr. Der
 * Blick in `rvData` bleibt hier trotzdem stehen: Alle vor diesem Tag
 * angelegten Reservierungen tragen die Nummer weiterhin, und für diese Kunden
 * ist sie die einzige Quelle. Bei neueren Vorgängen ist das Feld schlicht
 * leer, dann greift `saData` daneben. Kein toter Code, bitte stehen lassen.
 */
export function lookupSteuerIdFromInvestments(kontaktId: string): { p1: string; p2: string } {
  try {
    const invs = getInvestmentsByKontakt(kontaktId) || [];
    for (const inv of invs) {
      const m: any = (inv as any).meta || {};
      const rv = m.rvData;
      const sd = m.saData;
      const p1 = (rv && rv.steuerId) || (sd && sd.steuerId) || "";
      const p2 = (rv && rv.p2SteuerId) || (sd && sd.person2Data && sd.person2Data.steuerId) || "";
      if (p1 || p2) return { p1, p2 };
    }
  } catch {}
  return { p1: "", p2: "" };
}

// ─── Types ───────────────────────────────────────────────────
/**
 * Ein Kredit unter Ausgaben. Welche Angaben je Art Pflicht sind, steht in
 * `kreditPflichtfelder.ts`. Die Felder ab `restschuldPer` gibt es seit dem
 * 28.09.2026, ältere Selbstauskünfte haben sie nicht.
 */
export type SaKredit = {
  art: string; kategorie?: string; rate: string; restschuld: string; laufzeitEnde: string;
  bank?: string; ursprung?: string; vertragsbeginn?: string; zinsbindungBis?: string; zinssatz?: string; zweck?: string;
  /** "0", "1" … Immobilie von Person 1, "p2:0" … Immobilie von Person 2. */
  immobilie?: string;
  /** Stichtag der Restschuld. */
  restschuldPer?: string;
  /** "person1" | "person2" | "gemeinsam", nur gefragt, wenn es eine Person 2 gibt. */
  kreditnehmer?: string;
  /** "fest" | "variabel" */
  zinsart?: string;
  /** "ja" | "nein" | "unbekannt" */
  sondertilgung?: string;
};

export interface PersonData {
  anrede: string; titel: string; vorname: string; nachname: string;
  geburtsname: string; geburtsdatum: string;
  steuerId: string;
  staatsangehoerigkeit: string; staatsangehoerigkeitAndere: string;
  strasse: string; hausnummer: string; plz: string; ort: string;
  telefon: string; mobilfunk: string; email: string;
  familienstand: string; wohnhaftSeit: string;
  beschaeftigungsart: string;
  anstellung: { branche: string; firma: string; berufsbezeichnung: string; angestelltSeit: string; probezeit: string };
  selbstaendigkeit: { branche: string; firma: string; selbstaendigSeit: string; anzahlMitarbeiter: string };
  bankkonten: { konto: string; institut: string; iban: string }[];
  einkommen: { netto: string; gewerbe: string; miet: string; zinsen: string; rente: string; kindergeld: string; sonstige: string };
  gehalt13?: boolean;
  gehalt14?: boolean;
  mietart: string; mieteWarm: string;
  lebenshaltungskosten: string; privateKV: string; versicherungsbeitraege: string; sonstigeAusgaben: string; sonstigeAusgabenWofuer?: string;
  kredite: SaKredit[];
  vermoegenswerte: { art: string; institut: string; betrag: string }[];
  buergschaften: { art: string; betrag: string }[];
  mahnverfahren: string; schufaBekannt: string; schufaScore: string;
  // ─── Bank-Ergänzungen (optional, backwards-compat) ───
  steuerklasse?: string;
  kirchensteuer?: string;              // "ja" | "nein"
  gueterstand?: string;                // "gesetzlich" | "guetertrennung" | "guetergemeinschaft"
  bruttoJahr?: string;                 // Brutto-Jahresgehalt
  /** Zu versteuerndes Jahreseinkommen laut Steuerbescheid, freiwillig. Bei Zusammenveranlagung das gemeinsame, dann nur bei Person 1. */
  zvEJahr?: string;
  monatsgehaelter?: string;            // "12" | "13" | "14"
  arbeitsvertragArt?: string;          // "unbefristet" | "probezeit" | "befristet"
  befristetBis?: string;
  nebenkosten?: string;
  unterhalt?: string;
  kfzAnzahl?: string;
  kfzKosten?: string;
  versBU?: string;
  versRiester?: string;
  versAV?: string;
  versWeitere?: string;
  immobilien?: { eigentuemer: string; art: string; adresse: string; baujahr: string; grundstueckM2: string; wohnflaecheM2: string; nutzung: string; marktwert: string; kaltmieteIst: string; kaltmieteZukunft: string; vermietungsdetails?: string }[];
  /** Antwort „Nein, schuldenfrei“ für die Immobilie von Person 2, siehe SelbstauskunftData. */
  immobilienSchuldenfrei?: boolean;
}

export const EMPTY_PERSON: PersonData = {
  anrede: "Herr", titel: "", vorname: "", nachname: "",
  geburtsname: "", geburtsdatum: "",
  steuerId: "",
  staatsangehoerigkeit: "deutsch", staatsangehoerigkeitAndere: "",
  strasse: "", hausnummer: "", plz: "", ort: "",
  telefon: "", mobilfunk: "", email: "",
  familienstand: "", wohnhaftSeit: "",
  beschaeftigungsart: "",
  anstellung: { branche: "", firma: "", berufsbezeichnung: "", angestelltSeit: "", probezeit: "nein" },
  selbstaendigkeit: { branche: "", firma: "", selbstaendigSeit: "", anzahlMitarbeiter: "" },
  bankkonten: [{ konto: "Girokonto", institut: "", iban: "" }],
  einkommen: { netto: "", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
  mietart: "Zur Miete", mieteWarm: "",
  lebenshaltungskosten: "", privateKV: "0", versicherungsbeitraege: "", sonstigeAusgaben: "",
  kredite: [],
  vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "", betrag: "" }],
  buergschaften: [{ art: "", betrag: "" }],
  /*
   * Bewusst ohne Vorbelegung (Christian, 29.09.2026): Die Bonitätsfragen muss
   * der Ausfüllende selbst beantworten. Ein vorbelegtes „Nein“ wurde sonst
   * ungelesen mit abgeschickt.
   */
  mahnverfahren: "", schufaBekannt: "", schufaScore: "",
};

export interface SelbstauskunftData {
  wuenscheZiele: string[];
  person2: boolean;
  anrede: string; titel: string; vorname: string; nachname: string;
  geburtsname: string; geburtsdatum: string;
  steuerId: string;
  staatsangehoerigkeit: string; staatsangehoerigkeitAndere: string;
  strasse: string; hausnummer: string; plz: string; ort: string;
  telefon: string; mobilfunk: string; email: string;
  familienstand: string; wohnhaftSeit: string;
  /** imHaushalt fehlt bei Altbestand und gilt dann als ja. */
  kinder: { name: string; geburtsdatum: string; imHaushalt?: boolean }[];
  beschaeftigungsart: string;
  anstellung: { branche: string; firma: string; berufsbezeichnung: string; angestelltSeit: string; probezeit: string };
  selbstaendigkeit: { branche: string; firma: string; selbstaendigSeit: string; anzahlMitarbeiter: string };
  bankkonten: { konto: string; institut: string; iban: string }[];
  einkommen: { netto: string; gewerbe: string; miet: string; zinsen: string; rente: string; kindergeld: string; sonstige: string };
  gehalt13?: boolean;
  gehalt14?: boolean;
  mietart: string; mieteWarm: string;
  lebenshaltungskosten: string; privateKV: string; versicherungsbeitraege: string; sonstigeAusgaben: string; sonstigeAusgabenWofuer?: string;
  kredite: SaKredit[];
  vermoegenswerte: { art: string; institut: string; betrag: string }[];
  buergschaften: { art: string; betrag: string }[];
  mahnverfahren: string; schufaBekannt: string; schufaScore: string;
  hinweise: string;
  abgeschlossen: boolean;
  person2Data: PersonData;
  // ─── Bank-Ergänzungen (optional, backwards-compat) ───
  steuerklasse?: string;
  kirchensteuer?: string;
  gueterstand?: string;
  bruttoJahr?: string;
  zvEJahr?: string;
  monatsgehaelter?: string;
  arbeitsvertragArt?: string;
  befristetBis?: string;
  nebenkosten?: string;
  unterhalt?: string;
  kfzAnzahl?: string;
  kfzKosten?: string;
  versBU?: string;
  versRiester?: string;
  versAV?: string;
  versWeitere?: string;
  immobilien?: { eigentuemer: string; art: string; adresse: string; baujahr: string; grundstueckM2: string; wohnflaecheM2: string; nutzung: string; marktwert: string; kaltmieteIst: string; kaltmieteZukunft: string; vermietungsdetails?: string }[];
  /**
   * Herkunft der Vorbelegung, wenn dieses Formular mit den Angaben des
   * vorherigen Investments gefüllt wurde. Steuert die sichtbare Markierung
   * und reist mit dem Entwurf zum Kunden, damit er dieselbe Markierung sieht.
   */
  vorbelegung?: SaVorbelegung;
  /**
   * Antwort „Nein, schuldenfrei“ auf die Frage in Schritt Vermögenswerte, ob
   * eine angegebene Immobilie noch abbezahlt wird. Gesetzt heißt: nicht noch
   * einmal fragen, und die Finanzierung sieht die Angabe im PDF.
   */
  immobilienSchuldenfrei?: boolean;
}

export const EMPTY_DATA: SelbstauskunftData = {
  wuenscheZiele: [],
  person2: false,
  anrede: "Herr", titel: "", vorname: "", nachname: "",
  geburtsname: "", geburtsdatum: "",
  steuerId: "",
  staatsangehoerigkeit: "deutsch", staatsangehoerigkeitAndere: "",
  strasse: "", hausnummer: "", plz: "", ort: "",
  telefon: "", mobilfunk: "", email: "",
  familienstand: "", wohnhaftSeit: "",
  kinder: [],
  beschaeftigungsart: "",
  anstellung: { branche: "", firma: "", berufsbezeichnung: "", angestelltSeit: "", probezeit: "nein" },
  selbstaendigkeit: { branche: "", firma: "", selbstaendigSeit: "", anzahlMitarbeiter: "" },
  bankkonten: [{ konto: "Girokonto", institut: "", iban: "" }],
  einkommen: { netto: "", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
  mietart: "Zur Miete", mieteWarm: "",
  lebenshaltungskosten: "", privateKV: "0", versicherungsbeitraege: "", sonstigeAusgaben: "",
  kredite: [],
  vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "", betrag: "" }],
  buergschaften: [{ art: "", betrag: "" }],
  /*
   * Bewusst ohne Vorbelegung (Christian, 29.09.2026): Die Bonitätsfragen muss
   * der Ausfüllende selbst beantworten. Ein vorbelegtes „Nein“ wurde sonst
   * ungelesen mit abgeschickt.
   */
  mahnverfahren: "", schufaBekannt: "", schufaScore: "",
  hinweise: "",
  abgeschlossen: false,
  person2Data: { ...EMPTY_PERSON },
};

const STEPS = [
  "Wünsche & Ziele",
  "Persönliche Angaben",
  "Einnahmen",
  "Ausgaben",
  "Vermögenswerte",
  "Verbindlichkeiten",
  "Sonstige Angaben",
  "Abschluss",
];

/**
 * Grober Ausfuellfortschritt der Selbstauskunft in Prozent (0 bis 100), damit
 * der Berater im Investment sieht, wie weit der Kunde schon ist.
 *
 * Bewusst an repraesentativen Feldern gemessen, die typischerweise LEER sind
 * und echte Kunden-Eingabe brauchen. Vorbelegte Felder (Kontaktdaten aus den
 * Stammdaten, Default-Antworten wie "nein") bleiben aussen vor, sonst waere der
 * Wert schon vor der ersten Eingabe hoch.
 */
export function selbstauskunftFortschrittProzent(saData: any): number {
  if (!saData || typeof saData !== "object") return 0;
  if (saData.abgeschlossen) return 100;
  const text = (v: any) => typeof v === "string" && v.trim().length > 0;
  const s = saData as any;
  const checks: boolean[] = [
    Array.isArray(s.wuenscheZiele) && s.wuenscheZiele.length > 0,
    text(s.geburtsdatum),
    text(s.steuerId),
    text(s.familienstand),
    text(s.beschaeftigungsart),
    text(s.anstellung?.firma) || text(s.selbstaendigkeit?.firma),
    text(s.einkommen?.netto) || text(s.einkommen?.gewerbe) || text(s.einkommen?.rente),
    text(s.lebenshaltungskosten),
    Array.isArray(s.vermoegenswerte) && s.vermoegenswerte.some((v: any) => text(v?.betrag)),
    Array.isArray(s.bankkonten) && s.bankkonten.some((b: any) => text(b?.iban)),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/**
 * Die Ziele stehen jetzt in einer gemeinsamen Liste, weil die
 * Beratungspräsentation dieselben braucht. Vorher wählte der Kunde im
 * Gespräch ein Ziel, das hier gar nicht zur Auswahl stand.
 */
const ZIEL_ICONS: Record<string, typeof TrendingUp> = {
  vermoegen: TrendingUp,
  fremdkapital: DollarSign,
  rente: ShieldCheck,
  inflation: ShieldCheck,
  eigenheim: Home,
  freiheit: Wallet,
  kinder: Users,
  portfolio: Building2,
  steuer: Landmark,
};

const ZIELE = ANLAGE_ZIELE.map((z) => ({
  id: z.id,
  label: z.label,
  icon: ZIEL_ICONS[z.id] || TrendingUp,
}));

const SA_KEY = "mi_selbstauskunft_";
const SA_DRAFT_KEY = "mi_sa_draft_saved_";

// Import DB helpers for live persistence
import { ANLAGE_ZIELE, MAX_ZIELE } from "@/lib/anlageZiele";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { getCurrentUserId } from "@/lib/currentUser";
import { PhoneInput } from "@/components/ui/phone-input";

/*
 * Der geraetelokale Entwurf der Selbstauskunft (Datenschutz, 29.09.2026).
 *
 * Er enthaelt Geburtsdatum, Anschrift, Einkommen und Vermoegen. Frueher lag er
 * dauerhaft im localStorage und blieb auch nach dem Absenden liegen, auf
 * fremden Geraeten ebenso.
 *
 * Im Kundenmodus (oeffentlicher Link, nicht angemeldet) liegt er jetzt nur im
 * sessionStorage dieses Tabs. Ein dauerhafter Entwurf ist dort nicht noetig:
 * Der Zwischenstand geht bei jeder Eingabe an den Link
 * (`update_sa_fill_token_data`) und kommt beim Neuladen als Vorbelegung
 * zurueck. Der Sitzungsspeicher ist nur der Rueckfall fuer "Zwischenspeichern"
 * ohne Netz; er uebersteht ein Neuladen im selben Tab und verschwindet, sobald
 * der Tab geschlossen wird. Im CRM bleibt es beim localStorage, dort ist es das
 * Geraet des Beraters.
 *
 * Nach dem Einreichen oder Unterschreiben wird jeder lokale Entwurf dieses
 * Kontakts und Investments geloescht, in beiden Speichern und samt der alten
 * Schluessel ohne Investment. Jeder Zugriff steht in try/catch: Ist der
 * Speicher gesperrt (privates Fenster, Richtlinie), darf nichts abstuerzen.
 */
function entwurfSpeicher(kundenModus: boolean): Storage | null {
  try {
    return kundenModus ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

function entwurfSchluessel(kundeId: string, investmentId?: string | null): string {
  return SA_KEY + (investmentId ? `${kundeId}_${investmentId}` : kundeId);
}

function schreibeLokalenEntwurf(kundeId: string, data: SelbstauskunftData, investmentId: string | undefined, kundenModus: boolean): void {
  try {
    entwurfSpeicher(kundenModus)?.setItem(entwurfSchluessel(kundeId, investmentId), JSON.stringify(data));
  } catch { /* Speicher voll oder gesperrt */ }
}

function leseLokalenEntwurf(kundeId: string, investmentId: string | undefined, kundenModus: boolean): SelbstauskunftData | null {
  try {
    const raw = entwurfSpeicher(kundenModus)?.getItem(entwurfSchluessel(kundeId, investmentId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Loescht jeden geraetelokalen Entwurf dieses Kontakts und Investments.
 * `nurDauerhaft`: nur den localStorage, der Sitzungsentwurf des Tabs bleibt.
 */
export function loescheLokalenSaEntwurf(kundeId: string | null | undefined, investmentId?: string | null, nurDauerhaft = false): void {
  if (!kundeId) return;
  const schluessel = [SA_KEY + kundeId, SA_DRAFT_KEY + kundeId];
  if (investmentId) schluessel.push(SA_KEY + `${kundeId}_${investmentId}`, SA_DRAFT_KEY + `${kundeId}_${investmentId}`);
  for (const kundenModus of nurDauerhaft ? [false] : [false, true]) {
    const speicher = entwurfSpeicher(kundenModus);
    for (const k of schluessel) {
      try { speicher?.removeItem(k); } catch { /* gesperrt */ }
    }
  }
}

/*
 * Die Entwuerfe in den Nutzereinstellungen gehoeren angemeldeten CRM-Nutzern.
 * Ein Kunde ueber den Link hat keine Benutzerkennung; `setUserSetting` meldete
 * dann bei jedem Speichern einen Fehler in der Konsole.
 */
function mitNutzereinstellungen(kundenModus = false): boolean {
  return !kundenModus && !isTestAccount() && !!getCurrentUserId();
}

/*
 * Die Stammdaten, mit denen das Formular vorbelegt wird. Bewusst ohne
 * `einkuenfte` und `ausgaben`: Zahlen liegen am Investment, nicht am Kontakt
 * (Entscheidung Christian, 10.09.2026). Die Vorbelegung mit Betraegen kommt
 * aus der letzten Selbstauskunft des Kunden, siehe `getSaDataZurVorbelegung`.
 */
type SelbstauskunftKontaktPrefill = Partial<Pick<KundeData, "anrede" | "vorname" | "nachname" | "email" | "telefon" | "geburtstag" | "strasse" | "hausnummer" | "plz" | "ort" | "person2">>;

function loadSA(kundeId: string, prefillKontakt?: SelbstauskunftKontaktPrefill | null, investmentId?: string, kundenModus = false): SelbstauskunftData {
  const kontakt = prefillKontakt || getKontaktById(kundeId);
  const fallbackSteuer = lookupSteuerIdFromInvestments(kundeId);

  // Helper: merge contact data into existing draft — always overwrite core identity fields from kontakt
  const syncKontakt = (draft: SelbstauskunftData): SelbstauskunftData => {
    if (!kontakt) return draft;
    const merged: SelbstauskunftData = {
      ...draft,
      anrede: kontakt.anrede || draft.anrede || "Herr",
      vorname: kontakt.vorname || draft.vorname || "",
      nachname: kontakt.nachname || draft.nachname || "",
      email: kontakt.email || draft.email || "",
      telefon: kontakt.telefon || draft.telefon || "",
      geburtsdatum: kontakt.geburtstag || draft.geburtsdatum || "",
      strasse: kontakt.strasse || draft.strasse || "",
      hausnummer: kontakt.hausnummer || draft.hausnummer || "",
      plz: kontakt.plz || draft.plz || "",
      ort: kontakt.ort || draft.ort || "",
      steuerId: draft.steuerId || (kontakt as any).steuerId || fallbackSteuer.p1 || "",
    };
    // Person 2 ebenfalls aus Stammdaten synchronisieren, falls vorhanden
    if (kontakt.person2) {
      const p2Draft = draft.person2Data || { ...EMPTY_PERSON };
      merged.person2 = true;
      merged.person2Data = {
        ...p2Draft,
        anrede: kontakt.person2.anrede || p2Draft.anrede || "Herr",
        vorname: kontakt.person2.vorname || p2Draft.vorname || "",
        nachname: kontakt.person2.nachname || p2Draft.nachname || "",
        email: kontakt.person2.email || p2Draft.email || "",
        telefon: kontakt.person2.telefon || p2Draft.telefon || "",
        geburtsdatum: kontakt.person2.geburtsdatum || p2Draft.geburtsdatum || "",
        // Adresse Person 2 fällt im Regelfall auf Hauptadresse zurück
        strasse: (kontakt.person2 as any).strasse || p2Draft.strasse || merged.strasse || "",
        hausnummer: (kontakt.person2 as any).hausnummer || p2Draft.hausnummer || merged.hausnummer || "",
        plz: (kontakt.person2 as any).plz || p2Draft.plz || merged.plz || "",
        ort: (kontakt.person2 as any).ort || p2Draft.ort || merged.ort || "",
        steuerId: p2Draft.steuerId || (kontakt.person2 as any).steuerId || fallbackSteuer.p2 || "",
      };
    }
    return merged;
  };

  const ensureDefaults = (parsed: SelbstauskunftData): SelbstauskunftData => {
    if (!parsed.beschaeftigungsart) parsed.beschaeftigungsart = "";
    if (!parsed.person2Data) parsed.person2Data = { ...EMPTY_PERSON };
    /*
     * Staende aus der Zeit vor der Feldmarkierung kennen nur die offenen
     * Abschnitte. Die Feldliste laesst sich daraus nachbilden: In einem noch
     * offenen Abschnitt hat der Nutzer nichts angefasst, also stammt dort
     * jeder gefuellte Wert aus dem alten Vorgang.
     */
    if (parsed.vorbelegung && !parsed.vorbelegung.felder) {
      parsed.vorbelegung = {
        ...parsed.vorbelegung,
        felder: felderInAbschnitten(
          parsed as unknown as Record<string, unknown>,
          EMPTY_DATA as unknown as Record<string, unknown>,
          EMPTY_PERSON as unknown as Record<string, unknown>,
          parsed.vorbelegung.offeneAbschnitte || [],
        ),
      };
    }
    return parsed;
  };

  /*
   * Der Startstand aus der Selbstauskunft des VORHERIGEN Investments.
   *
   * Hier wird bewusst uebernommen: Beim zweiten Kauf soll niemand alles noch
   * einmal tippen. Uebernommen wird immer aus dem Investment davor, also fuer
   * Investment 5 aus Investment 4, und wenn das keine Selbstauskunft hat, aus
   * dem naechsten davor, das eine hat.
   *
   * An den Stand wird angehaengt, WOHER er stammt. Ohne diese Herkunft duerfte
   * gar nicht vorbelegt werden, denn sonst sehen Kunde und Bank Zahlen, die wie
   * geprueft aussehen, aber aus einem alten Vorgang stammen.
   *
   * Ohne Vorgaenger mit Selbstauskunft kommt null zurueck, dann startet das
   * Formular leer.
   */
  const vorbelegterStand = (): SelbstauskunftData | null => {
    const roh = vorbelegterSaStand(
      getSaDataZurVorbelegung(kundeId, investmentId),
      EMPTY_DATA as unknown as Record<string, unknown>,
      EMPTY_PERSON as unknown as Record<string, unknown>,
    );
    if (!roh) return null;
    return syncKontakt(ensureDefaults(roh as unknown as SelbstauskunftData));
  };

  // If a specific investmentId is given, check if that investment already has saData.
  // If it does NOT (new investment), do NOT load old kontakt-level drafts — start fresh with contact info only.
  if (investmentId) {
    const investmentSaData = getSaData(investmentId);
    if (investmentSaData && typeof investmentSaData === "object" && investmentSaData.vorname) {
      return syncKontakt(ensureDefaults(investmentSaData as SelbstauskunftData));
    }

    // Check if there's a per-investment draft in sa_drafts
    if (!isTestAccount()) {
      const draftKey = `${kundeId}_${investmentId}`;
      const all = getUserSetting<Record<string, SelbstauskunftData>>("sa_drafts", {});
      if (all[draftKey]) {
        return syncKontakt(ensureDefaults(all[draftKey]));
      }
    }
    const lokal = leseLokalenEntwurf(kundeId, investmentId, kundenModus);
    if (lokal) return syncKontakt(ensureDefaults(lokal));

    /*
     * Kein eigener Stand fuer dieses Investment. Jetzt greift die Vorbelegung
     * aus dem vorherigen Investment, sichtbar markiert. Frueher startete das
     * Formular hier immer leer, der Kunde tippte beim zweiten Kauf alles neu.
     */
    const uebernommen = vorbelegterStand();
    if (uebernommen) return uebernommen;

    // Kein Vorgaenger mit Selbstauskunft: nur die Stammdaten, keine Zahlen.
    if (kontakt) {
      return {
        ...EMPTY_DATA,
        anrede: kontakt.anrede || "Herr",
        vorname: kontakt.vorname || "",
        nachname: kontakt.nachname || "",
        email: kontakt.email || "",
        telefon: kontakt.telefon || "",
        geburtsdatum: kontakt.geburtstag || "",
        strasse: kontakt.strasse || "",
        hausnummer: kontakt.hausnummer || "",
        plz: kontakt.plz || "",
        ort: kontakt.ort || "",
        steuerId: (kontakt as any).steuerId || fallbackSteuer.p1 || "",
        person2Data: kontakt.person2 ? {
          ...EMPTY_PERSON,
          anrede: kontakt.person2?.anrede || "Herr",
          vorname: kontakt.person2?.vorname || "",
          nachname: kontakt.person2?.nachname || "",
          email: kontakt.person2?.email || "",
          telefon: kontakt.person2?.telefon || "",
          geburtsdatum: kontakt.person2?.geburtsdatum || "",
          steuerId: (kontakt.person2 as any)?.steuerId || fallbackSteuer.p2 || "",
        } : { ...EMPTY_PERSON },
        person2: !!kontakt.person2,
      };
    }
    return { ...EMPTY_DATA };
  }

  // Legacy path: no investmentId — use kontakt-level drafts
  // 1. Try user-settings draft first (highest priority – user may have edited after signing)
  if (!isTestAccount()) {
    const all = getUserSetting<Record<string, SelbstauskunftData>>("sa_drafts", {});
    if (all[kundeId]) {
      return syncKontakt(ensureDefaults(all[kundeId]));
    }
  }
  // Fallback auf den geraetelokalen Entwurf (Testaccount oder Altbestand)
  const lokalOhneInvestment = leseLokalenEntwurf(kundeId, undefined, kundenModus);
  if (lokalOhneInvestment) return syncKontakt(ensureDefaults(lokalOhneInvestment));

  // 2. Vorbelegung aus dem letzten Investment des Kunden. Ohne Investmentbezug
  //    gibt es kein "davor", deshalb gilt hier das letzte der Reihe.
  const uebernommenOhneInvestment = vorbelegterStand();
  if (uebernommenOhneInvestment) return uebernommenOhneInvestment;

  // 3. Build from kontakt data
  if (kontakt) {
    return {
      ...EMPTY_DATA,
      anrede: kontakt.anrede || "Herr",
      vorname: kontakt.vorname || "",
      nachname: kontakt.nachname || "",
      email: kontakt.email || "",
      telefon: kontakt.telefon || "",
      geburtsdatum: kontakt.geburtstag || "",
      strasse: kontakt.strasse || "",
      hausnummer: kontakt.hausnummer || "",
      plz: kontakt.plz || "",
      ort: kontakt.ort || "",
      steuerId: (kontakt as any).steuerId || fallbackSteuer.p1 || "",
      /*
       * Keine Betraege aus dem Kontakt mehr. Die Felder bleiben leer und der
       * Kunde traegt sie fuer diesen Vorgang ein. Frueher standen hier die
       * Zahlen einer alten Selbstauskunft ohne Datum, die stillschweigend zu
       * den Zahlen des neuen Kaufs geworden waeren.
       */
      person2Data: kontakt.person2 ? {
        ...EMPTY_PERSON,
        anrede: kontakt.person2?.anrede || "Herr",
        vorname: kontakt.person2?.vorname || "",
        nachname: kontakt.person2?.nachname || "",
        email: kontakt.person2?.email || "",
        telefon: kontakt.person2?.telefon || "",
        geburtsdatum: kontakt.person2?.geburtsdatum || "",
        steuerId: (kontakt.person2 as any)?.steuerId || fallbackSteuer.p2 || "",
      } : { ...EMPTY_PERSON },
      person2: !!kontakt.person2,
    };
  }
  return { ...EMPTY_DATA };
}

function saveSA(kundeId: string, data: SelbstauskunftData, investmentId?: string, kundenModus = false) {
  const storageKey = investmentId ? `${kundeId}_${investmentId}` : kundeId;
  // Immer geraetelokal sichern (funktioniert ohne Auth/RLS, damit ein
  // Zwischenspeichern nie komplett scheitert). loadSA liest genau diesen Key.
  schreibeLokalenEntwurf(kundeId, data, investmentId, kundenModus);
  if (isTestAccount()) return;
  if (mitNutzereinstellungen(kundenModus)) {
    const all = getUserSetting<Record<string, SelbstauskunftData>>("sa_drafts", {});
    all[storageKey] = data;
    // Also keep kontakt-level key updated for backward compat
    if (investmentId) all[kundeId] = data;
    setUserSetting("sa_drafts", all);
  }
  /*
   * Auch in investments.meta.saData spiegeln, weil loadSA() beim Reload diese
   * Quelle priorisiert. Ohne diesen Push würden Live-Edits nach erneutem Öffnen
   * vom älteren signierten Snapshot überschrieben (Daten scheinen verloren).
   *
   * Ausnahme ist die Vorfahrtsregel: Hat der Kunde inzwischen selbst etwas
   * eingetragen, gelten seine Angaben. Der Berater schreibt dann nicht mehr in
   * den gemeinsamen Stand. Sein eigener Entwurf oben bleibt erhalten, es geht
   * also nichts verloren, es wird nur nichts überschrieben.
   */
  if (investmentId) {
    if (kundeHatVorfahrt(investmentId)) return;
    try { setSaData(investmentId, data); } catch (e) { console.warn("[SA] meta sync failed", e); }
  }
}

/**
 * Der Zeitpunkt der Kundenbearbeitung, wie er beim Öffnen des Formulars war.
 * Ändert er sich während der Berater arbeitet, war der Kunde dazwischen.
 */
const kundeStandBeimOeffnen = new Map<string, string | null>();

export function merkeKundeStand(investmentId: string) {
  if (!kundeStandBeimOeffnen.has(investmentId)) {
    kundeStandBeimOeffnen.set(investmentId, getSaKundeStandAm(investmentId));
  }
}

export function kundeHatVorfahrtOeffentlich(investmentId: string): boolean {
  return kundeHatVorfahrt(investmentId);
}

function kundeHatVorfahrt(investmentId: string): boolean {
  const jetzt = getSaKundeStandAm(investmentId);
  if (!jetzt) return false;
  const beimOeffnen = kundeStandBeimOeffnen.get(investmentId);
  // Kein gemerkter Wert heißt: Das Formular wurde geöffnet, als der Kunde
  // schon gearbeitet hatte. Dann gilt sein Stand ohnehin, er wurde geladen.
  if (beimOeffnen === undefined) return false;
  return jetzt !== beimOeffnen;
}

function saveDraftExplicit(kundeId: string, data: SelbstauskunftData, investmentId?: string) {
  saveSA(kundeId, data, investmentId);
  const draftKey = investmentId ? `${kundeId}_${investmentId}` : kundeId;
  if (isTestAccount()) {
    try { localStorage.setItem(SA_DRAFT_KEY + draftKey, new Date().toISOString()); } catch { /* gesperrt */ }
  } else if (mitNutzereinstellungen()) {
    const meta = getUserSetting<Record<string, string>>("sa_draft_dates", {});
    meta[draftKey] = new Date().toISOString();
    setUserSetting("sa_draft_dates", meta);
  }
}

function getDraftSavedAt(kundeId: string): string | null {
  if (isTestAccount()) {
    try { return localStorage.getItem(SA_DRAFT_KEY + kundeId); } catch { return null; }
  }
  const meta = getUserSetting<Record<string, string>>("sa_draft_dates", {});
  return meta[kundeId] || null;
}

function clearDraft(kundeId: string) {
  if (isTestAccount()) {
    try { localStorage.removeItem(SA_DRAFT_KEY + kundeId); } catch { /* gesperrt */ }
    return;
  }
  if (!mitNutzereinstellungen()) return;
  const all = getUserSetting<Record<string, SelbstauskunftData>>("sa_drafts", {});
  delete all[kundeId];
  setUserSetting("sa_drafts", all);
  const meta = getUserSetting<Record<string, string>>("sa_draft_dates", {});
  delete meta[kundeId];
  setUserSetting("sa_draft_dates", meta);
}

function formatGeburtsdatum(value: string): string {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
}

function parseDateString(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const parsed = parse(dateStr, "dd.MM.yyyy", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function formatTelefon(value: string): string {
  return (value || "").replace(/[^\d+\s\-()/]/g, "");
}

function formatIBAN(value: string): string {
  const clean = (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 22);
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

function formatPLZ(value: string): string {
  return (value || "").replace(/\D/g, "").slice(0, 5);
}

/** Parse a German-formatted currency string (e.g. "1.200,50") to a number */
function parseCurrencyDE(val: string): number {
  return parseFloat((val || "").replace(/\./g, "").replace(",", ".")) || 0;
}

function formatCurrency(value: string): string {
  // Strip everything except digits, comma, dot
  const clean = (value || "").replace(/[^\d.,]/g, "");
  // Split by comma (decimal separator in DE)
  const parts = clean.split(",");
  // Remove existing thousand dots from integer part, then re-add
  const intRaw = parts[0].replace(/\./g, "");
  const intFormatted = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (parts.length > 1) {
    return intFormatted + "," + parts[1].slice(0, 2);
  }
  return intFormatted;
}

function formatInteger(value: string): string {
  return (value || "").replace(/\D/g, "");
}

// ─── Sprache des Formulars ──────────────────────────────────
/*
 * Die Sprache, in der der Kunde das Formular sieht. Sie steckt in einem
 * Kontext statt in einer Prop, weil auch die Bausteine außerhalb der
 * Hauptkomponente übersetzen (`Field`, `FeldInfo`, `UebernommenMarke`, die
 * Datumsfelder). Ohne Provider gilt Deutsch, also genau der bisherige Stand.
 *
 * Übersetzt wird nur die Anzeige. Gespeichert wird immer der deutsche Wert,
 * siehe `SA_WERTE_EN` in `selbstauskunftSprache.ts`.
 */
const SaSprache = createContext<Sprache>("de");

/**
 * Texte des Formulars in der Kundensprache.
 *
 *   t("Weiter")          → "Next" (Englisch) oder "Weiter"
 *   w("Verheiratet")     → "Married": ein gespeicherter Auswahlwert für die Anzeige
 */
export function useSaText() {
  const sprache = useContext(SaSprache);
  return useMemo(
    () => ({
      sprache,
      t: (de: string, werte?: SaTextWerte) => saText(de, sprache, werte),
      w: (wert: string) => saWertAnzeige(wert, sprache),
    }),
    [sprache],
  );
}

// ─── Date Picker Component ──────────────────────────────────
/*
 * Das Datumsfeld des Projekts mit dem Platzhalter in der Kundensprache.
 * Gespeichert wird weiter TT.MM.JJJJ, deshalb lautet der englische
 * Platzhalter DD.MM.YYYY und nicht das britische Datumsformat.
 */
function DatePickerField(props: React.ComponentProps<typeof DatePickerFieldBasis>) {
  const { t } = useSaText();
  return <DatePickerFieldBasis placeholder={t("TT.MM.JJJJ")} {...props} />;
}

function DatePicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  return <DatePickerField value={value} onChange={onChange} error={error} />;
}

// ─── Feld-Hilfetexte ─────────────────────────────────────────
/**
 * Erklaerung je Feldbeschriftung, angezeigt als Info-Symbol mit Tooltip.
 *
 * Zentral je Beschriftung statt je Aufrufstelle: Person 1 und Person 2
 * verwenden dieselben Beschriftungen und bekommen so automatisch dieselbe
 * Erklaerung. Traegt dieselbe Beschriftung an einer Stelle eine andere
 * Bedeutung (etwa "Art" bei Vermoegenswerten und bei Buergschaften), setzt
 * die Aufrufstelle ein eigenes tooltip-Attribut, das Vorrang hat.
 *
 * Anlass war ein Kunde, der 1000 Euro bei den Lebenshaltungskosten und
 * dieselben 1000 Euro noch einmal bei den Nebenkosten eingetragen hat, weil
 * nirgends stand, was wohin gehoert.
 */
const FELD_HILFEN: Record<string, string> = {
  // Persoenliche Angaben
  "Anrede": "Bitte auswählen, wie wir Sie ansprechen dürfen.",
  "Titel": "Akademischer Titel wie Dr. oder Prof., falls vorhanden. Sonst leer lassen.",
  "Vorname": "Alle Vornamen so, wie sie im Ausweis stehen.",
  "Nachname": "Nachname so, wie er im Ausweis steht.",
  "Geburtsname": "Nur ausfüllen, wenn er vom heutigen Nachnamen abweicht, zum Beispiel nach einer Heirat.",
  "Geburtsdatum": "Tag, Monat und Jahr wie im Ausweis.",
  "Steuer-ID": "Die elfstellige persönliche Steuer-Identifikationsnummer. Sie steht auf der Lohnabrechnung und auf dem Schreiben vom Bundeszentralamt für Steuern. Kann auch nachgereicht werden.",
  "Straße": "Straße der aktuellen Meldeadresse.",
  "Hausnummer": "Hausnummer der aktuellen Meldeadresse.",
  "PLZ": "Postleitzahl der aktuellen Meldeadresse.",
  "Ort": "Wohnort der aktuellen Meldeadresse.",
  "Telefon": "Festnetznummer. Wenn keine vorhanden ist, reicht die Mobilnummer im Feld daneben.",
  "Mobilfunk": "Mobilnummer für Rückfragen.",
  "E-Mailadresse": "An diese Adresse gehen Rückfragen und am Ende der Link zur Unterschrift.",
  "Familienstand": "Der aktuelle Familienstand. Bei Verheirateten fragt die Bank zusätzlich den Güterstand ab.",
  "Seit wann wohnhaft an obiger Anschrift?": "Wie lange Sie schon an der oben angegebenen Adresse wohnen.",
  "Name": "Vor- und Nachname des Kindes.",
  "Steuerklasse": "Lohnsteuerklasse 1 bis 6. Sie steht auf der Gehaltsabrechnung.",
  "Steuerklasse Person 2": "Lohnsteuerklasse 1 bis 6 von Person 2. Sie steht auf der Gehaltsabrechnung.",
  "Kirchensteuerpflicht": "Ja, wenn auf der Gehaltsabrechnung Kirchensteuer abgezogen wird.",
  "Kirchensteuerpflicht Person 2": "Ja, wenn bei Person 2 auf der Gehaltsabrechnung Kirchensteuer abgezogen wird.",
  "Güterstand": "Nur bei Verheirateten und eingetragenen Lebenspartnern. Ohne Ehe- oder Lebenspartnerschaftsvertrag gilt automatisch die Zugewinngemeinschaft, das ist der gesetzliche Normalfall.",
  // Beschaeftigung und Einkommen
  "Branche": "Wirtschaftszweig des Arbeitgebers beziehungsweise der eigenen Firma, zum Beispiel Handwerk, IT oder Gesundheitswesen.",
  "Firma": "Vollständiger Name des Arbeitgebers beziehungsweise des eigenen Unternehmens.",
  "Berufsbezeichnung": "Die ausgeübte Tätigkeit laut Arbeitsvertrag.",
  "Angestellt seit": "Beginn des aktuellen Arbeitsverhältnisses laut Arbeitsvertrag.",
  "Selbständig seit": "Seit wann die selbstständige Tätigkeit besteht, zum Beispiel laut Gewerbeanmeldung.",
  "Anzahl Mitarbeiter": "Wie viele Mitarbeiter beschäftigt sind. Ohne Mitarbeiter 0 eintragen.",
  "Konto": "Art des Kontos auswählen, zum Beispiel Girokonto oder Depot.",
  "Institut": "Name der Bank, zum Beispiel Sparkasse Regensburg.",
  "IBAN": "Die IBAN steht auf der Bankkarte oder im Online-Banking.",
  "Netto-Gehalt": "Monatliches Nettogehalt laut Gehaltsabrechnung, also das, was auf dem Konto ankommt. Ohne Kindergeld und ohne Nebeneinkünfte, dafür gibt es eigene Felder.",
  "Zu versteuerndes Jahreseinkommen": "Das zu versteuernde Einkommen eines Jahres, also nach Abzug von Werbungskosten, Sonderausgaben und Freibeträgen. Es ist die Grundlage, auf die die Einkommensteuer berechnet wird.",
  "Jahresbrutto (gesamt)": "Das gesamte Bruttojahresgehalt vor Steuern und Sozialabgaben, einschließlich Sonderzahlungen wie dem 13. und 14. Gehalt, Urlaubsgeld und Boni. Es steht auf der Dezemberabrechnung oder auf der Lohnsteuerbescheinigung. Bei Selbstständigen der Jahresgewinn vor Steuern laut letztem Steuerbescheid.",
  "Einkünfte aus Gewerbebetrieb (netto)": "Durchschnittlicher monatlicher Gewinn nach Steuern aus der Selbstständigkeit, im Zweifel laut letztem Steuerbescheid.",
  "Miet- & Pachteinnahmen (kalt)": "Monatliche Kaltmiete aus vermieteten Immobilien, ohne die Nebenkostenvorauszahlungen der Mieter.",
  "Zinserträge": "Monatliche Erträge aus Zinsen oder Dividenden. Jahreswerte bitte durch 12 teilen.",
  "Rente / Pension": "Monatliche Renten- oder Pensionszahlung.",
  "Kindergeld": "Monatliches Kindergeld für alle Kinder zusammen.",
  "Sonstige Einkünfte (z.B. Nebenjob)": "Alle weiteren regelmäßigen monatlichen Einkünfte, zum Beispiel Nebenjob, Elterngeld oder erhaltener Unterhalt.",
  "Sonstige Einkünfte": "Alle weiteren regelmäßigen monatlichen Einkünfte, zum Beispiel Nebenjob, Elterngeld oder erhaltener Unterhalt.",
  "Monatsgehälter": "Wie viele Gehälter pro Jahr gezahlt werden: 13 bei Weihnachtsgeld, 14 bei zusätzlichem Urlaubsgeld.",
  "Arbeitsverhältnis": "Ob der Arbeitsvertrag unbefristet, befristet oder noch in der Probezeit ist.",
  "Befristet bis": "Enddatum der Befristung laut Arbeitsvertrag.",
  // Ausgaben
  "Wohnsituation": "Zur Miete, im Eigentum oder mietfrei, zum Beispiel bei den Eltern wohnend.",
  "Kaltmiete": "Monatliche Kaltmiete ohne alle Nebenkosten. Die Nebenkosten gehören ins Feld Wohnnebenkosten weiter unten, so wird nichts doppelt gezählt.",
  "Lebenshaltungskosten": "Monatliche Ausgaben für Lebensmittel, Kleidung, Freizeit und Alltag. Ohne Miete, ohne Wohnnebenkosten wie Strom und Heizung und ohne Versicherungen oder Kreditraten, dafür gibt es eigene Felder. Bitte nichts doppelt eintragen.",
  "Private Krankenversicherung": "Monatsbeitrag nur bei privat Krankenversicherten. Gesetzlich Versicherte lassen 0 stehen, ihr Beitrag steckt schon im Nettogehalt.",
  "Sonstige Ausgaben": "Regelmäßige monatliche Ausgaben, die in kein anderes Feld passen, zum Beispiel Kita oder Vereinsbeiträge. Bitte im Feld daneben kurz benennen.",
  "Wofür?": "Kurz benennen, wofür die sonstigen Ausgaben anfallen, damit die Bank den Betrag einordnen kann.",
  "Art des Kredits": "Die Auswahl bestimmt, wie die Bank den Kredit einordnet, zum Beispiel Autokredit oder Immobiliendarlehen.",
  "Bezeichnung": "Freitext zum Wiedererkennen des Kredits, zum Beispiel VW Bank oder Möbelfinanzierung.",
  "Monatliche Rate": "Die monatlich zu zahlende Rate laut Kreditvertrag.",
  "Restschuld": "Der aktuell noch offene Betrag dieses Kredits.",
  "Laufzeitende": "Wann der Kredit voraussichtlich vollständig zurückgezahlt ist.",
  // Bank-Ergaenzung: detaillierte Ausgaben
  "Wohnnebenkosten (Strom, Heizung usw.)": "Alle monatlichen Wohnnebenkosten zusammen: Betriebskosten- und Heizkostenvorauszahlung, Strom, Wasser, Müll, Internet und Rundfunkbeitrag. Oben zählt nur die Kaltmiete, und bei den Lebenshaltungskosten bitte nichts davon noch einmal mitrechnen.",
  "Unterhaltszahlungen": "Monatlicher Unterhalt, den Sie an andere zahlen, zum Beispiel Kindesunterhalt. Erhaltener Unterhalt gehört zu den sonstigen Einkünften.",
  "Anzahl KFZ": "Wie viele Fahrzeuge im Haushalt vorhanden sind.",
  "KFZ-Kosten (Versicherung + Sprit)": "Monatliche Gesamtkosten aller Fahrzeuge zusammen: Versicherung, Steuer, Kraftstoff und Wartung. Bei mehreren Fahrzeugen die Summe, nicht der Betrag je Fahrzeug.",
  "KFZ-Kosten": "Monatliche Gesamtkosten aller Fahrzeuge zusammen: Versicherung, Steuer, Kraftstoff und Wartung.",
  "Berufsunfähigkeitsversicherung": "Monatsbeitrag zur Berufsunfähigkeitsversicherung, falls vorhanden.",
  "Berufsunfähigkeitsvers.": "Monatsbeitrag zur Berufsunfähigkeitsversicherung, falls vorhanden.",
  "Riester-Vertrag": "Monatsbeitrag zum Riester-Vertrag, falls vorhanden.",
  "Riester": "Monatsbeitrag zum Riester-Vertrag, falls vorhanden.",
  "Sonstige Altersvorsorge": "Monatsbeiträge zu weiterer privater Altersvorsorge, zum Beispiel Rürup oder private Rentenversicherung.",
  "Sonstige AV": "Monatsbeiträge zu weiterer privater Altersvorsorge, zum Beispiel Rürup oder private Rentenversicherung.",
  "Weitere Versicherungen": "Monatsbeiträge aller übrigen Versicherungen zusammen, zum Beispiel Haftpflicht, Hausrat oder Rechtsschutz. Ohne KFZ, die stecken schon in den KFZ-Kosten.",
  // Bank-Ergaenzung: Kredit-Details
  "Bank / Darlehensgeber": "Vollständiger Name der Bank oder des Darlehensgebers, zum Beispiel Deutsche Kreditbank AG. Der Name erscheint genau so im Dokument.",
  "Ursprungskredit": "Die ursprüngliche Kreditsumme bei Vertragsabschluss.",
  "Zinssatz (%)": "Der vereinbarte Sollzins laut Kreditvertrag.",
  "Vertragsbeginn": "Datum des Kreditvertragsabschlusses.",
  "Zinsbindung bis": "Bis wann der Zinssatz laut Vertrag festgeschrieben ist.",
  "Verwendungszweck": "Wofür der Kredit aufgenommen wurde, zum Beispiel Autokauf oder Modernisierung.",
  "Restschuld per": "Der Tag, zu dem die angegebene Restschuld gilt, zum Beispiel das Datum des letzten Kontoauszugs oder der Jahresbescheinigung.",
  "Zins fest oder variabel": "Ob der Zinssatz für die Zinsbindung fest vereinbart ist oder sich laufend ändern kann.",
  "Sondertilgungsrecht": "Ob der Vertrag zusätzliche Tilgungen außerhalb der Rate erlaubt, zum Beispiel fünf Prozent im Jahr.",
  "Kreditnehmer": "Wer den Kredit laut Vertrag schuldet: Person 1, Person 2 oder beide gemeinsam.",
  // Vermoegenswerte
  "Institut / Beschreibung": "Wo der Vermögenswert liegt, zum Beispiel Name der Bank oder der Versicherung.",
  "Betrag": "Aktueller Wert beziehungsweise Guthabenstand in Euro.",
  // Immobilienvermoegen
  "Eigentümer": "Wem die Immobilie gehört. Bei gemeinsamem Eigentum beide Namen eintragen.",
  "Art (EFH/ETW/MFH...)": "Objektart, zum Beispiel Einfamilienhaus (EFH), Eigentumswohnung (ETW) oder Mehrfamilienhaus (MFH).",
  "Adresse": "Straße, Hausnummer, Postleitzahl und Ort der Immobilie.",
  "Baujahr": "Baujahr des Gebäudes.",
  "Grundstück (m²)": "Grundstücksfläche in Quadratmetern laut Grundbuch oder Kaufvertrag.",
  "Wohnfläche (m²)": "Wohnfläche in Quadratmetern laut Kaufvertrag oder Exposé.",
  "Nutzung": "Eigennutzung heißt selbst bewohnt, fremdvermietet heißt an Mieter vermietet.",
  "Marktwert (€)": "Geschätzter aktueller Verkaufswert der Immobilie.",
  "Kaltmiete Ist (€/Monat)": "Aktuelle monatliche Kaltmiete. Bei Eigennutzung 0 eintragen.",
  "Kaltmiete zukünftig (€/Monat, optional)": "Nur ausfüllen, wenn sich die Miete absehbar ändert, zum Beispiel nach einer Neuvermietung.",
  "Vermietungsdetails (optional)": "Besonderheiten der Vermietung, zum Beispiel teilvermietet: welche Einheit, wie groß und für wie viel.",
  // Sonstige Angaben
  "Schufa Score": "Der Basisscore in Prozent aus der eigenen Schufa-Auskunft, zum Beispiel 97,5.",
  "Hinweise / Erklärungen / Angaben": "Platz für alles, was die Bank zusätzlich wissen sollte, zum Beispiel ein geplanter Jobwechsel oder Besonderheiten bei einzelnen Zahlen.",
};

/** Info-Symbol mit Erklaerung: zeigt den Text beim Daraufzeigen sofort, auf Touch-Geraeten per Tippen. */
function FeldInfo({ text }: { text: string }) {
  const [offen, setOffen] = useState(false);
  const { t } = useSaText();
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={offen} onOpenChange={setOffen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("Erklärung anzeigen")}
            className="shrink-0 text-muted-foreground/60 hover:text-primary focus-visible:text-primary outline-none"
            onClick={() => setOffen(o => !o)}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs text-xs font-normal leading-relaxed normal-case tracking-normal">
          {t(text)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/*
 * Woher die übernommenen Angaben stammen, für die Beschriftung am einzelnen
 * Feld. Das Formular reicht die Nummer einmal herein, statt sie durch über
 * hundert Felder durchzuschleifen.
 */
const VorbelegungHerkunft = createContext<number | null>(null);

/**
 * Die Marke an einer Angabe, die aus dem vorherigen Investment stammt.
 *
 * Bewusst ruhig: Warnorange gehört den offenen Pflichtfeldern, Rot den
 * Fehlern. Hier steht die Akzentfarbe des Themas und ein gestrichelter Rahmen,
 * das unterscheidet sich auf den ersten Blick von beidem, ohne zu schreien.
 * Der Text steht mit im Bild, denn eine Farbe allein sagt einem
 * Vorleseprogramm nichts.
 */
function UebernommenMarke() {
  const ausInvestment = useContext(VorbelegungHerkunft);
  const { sprache, t } = useSaText();
  return (
    <span className="text-[10px] uppercase tracking-wide font-semibold text-accent-foreground bg-accent border border-dashed border-accent-foreground/50 rounded px-1 py-px">
      {t(SA_FELD_MARKE)}
      {ausInvestment !== null && (
        <span className="sr-only">. {saFeldMarkeErklaerungIn(ausInvestment, sprache)}</span>
      )}
    </span>
  );
}

/** Der gestrichelte Rahmen um eine übernommene Angabe, die kein Feld ist. */
const UEBERNOMMEN_RAHMEN = "rounded-md border border-dashed border-accent-foreground/50 px-2 py-1.5";

// ─── Form Field helpers ──────────────────────────────────────
function Field({ label, tooltip, children, className, required, error, hint, filled, uebernommen }: { label: string; tooltip?: string; children: React.ReactNode; className?: string; required?: boolean; error?: boolean; hint?: string; filled?: boolean; uebernommen?: boolean }) {
  // Die Erklärung wird über die deutsche Beschriftung gefunden und erst in
  // `FeldInfo` übersetzt, so bleibt FELD_HILFEN die eine Quelle.
  const hilfe = tooltip ?? FELD_HILFEN[label];
  const { t } = useSaText();
  // Ein Fehler und ein offenes Pflichtfeld gehen vor: Beide verlangen eine
  // Handlung, die Herkunft ist nur eine Auskunft.
  const zeigeUebernommen = !!uebernommen && !error && !(required && !filled);
  return (
    <div className={className} data-sa-fehler={error ? "" : undefined}>
      <Label className={`text-sm font-medium mb-1 flex items-center gap-1.5 ${error ? "text-destructive" : ""}`}>
        <span>{t(label)}</span>
        {hilfe && <FeldInfo text={hilfe} />}
        {required && !filled && (
          <>
            <span className="text-destructive font-bold leading-none">*</span>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-orange-500/90 bg-orange-500/10 border border-orange-400/40 rounded px-1 py-px">
              {t("Pflicht")}
            </span>
          </>
        )}
        {zeigeUebernommen && <UebernommenMarke />}
      </Label>
      <div className={cn(
        error ? "[&>*]:border-destructive [&>*]:ring-1 [&>*]:ring-destructive/30" : "",
        required && !filled && !error ? PFLICHT_OFFEN_RAHMEN : "",
        zeigeUebernommen ? "[&>*]:border-dashed [&>*]:border-accent-foreground/50" : "",
      )}>
        {children}
      </div>
      {hint && (
        <p className="text-[10px] text-orange-400 mt-0.5 flex items-center gap-1">
          <Info className="h-3 w-3" /> {t(hint)}
        </p>
      )}
    </div>
  );
}

// ─── Validation per step ─────────────────────────────────────
function validateStep(step: number, data: SelbstauskunftData): Set<string> {
  const errs = new Set<string>();
  const hasP2 = data.person2;
  const p2 = data.person2Data;
  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  switch (step) {
    case 0:
      if (data.wuenscheZiele.length === 0) errs.add("wuenscheZiele");
      if (data.wuenscheZiele.length > MAX_ZIELE) errs.add("wuenscheZiele");
      break;
    case 1:
      if (!data.vorname.trim()) errs.add("vorname");
      if (!data.nachname.trim()) errs.add("nachname");
      if (!data.geburtsdatum.trim()) errs.add("geburtsdatum");
      if (!data.strasse.trim()) errs.add("strasse");
      if (!data.hausnummer.trim()) errs.add("hausnummer");
      if (!data.plz.trim()) errs.add("plz");
      if (!data.ort.trim()) errs.add("ort");
      if (!data.telefon.trim() && !data.mobilfunk.trim()) { errs.add("telefon"); errs.add("mobilfunk"); }
      if (!data.email.trim()) errs.add("email");
      else if (!isValidEmail(data.email)) errs.add("email");
      if (!data.wohnhaftSeit) errs.add("wohnhaftSeit");
      if (!data.familienstand.trim()) errs.add("familienstand");
      if (data.staatsangehoerigkeit === "andere" && !data.staatsangehoerigkeitAndere.trim()) errs.add("staatsangehoerigkeitAndere");
      if (!(data.steuerklasse || "").trim()) errs.add("steuerklasse");
      if (!(data.kirchensteuer || "").trim()) errs.add("kirchensteuer");
      // Steuer-ID Person 1 ist optional (kann nachgereicht werden)
      // Person 2: nur Persönliche Angaben sind Pflicht (Vorname, Nachname, Geburtsdatum)
      // E-Mail Person 2 wird automatisch auf E-Mail Person 1 vorausgefüllt, daher kein Pflichtfeld.
      if (hasP2) {
        if (!p2.vorname.trim()) errs.add("p2_vorname");
        if (!p2.nachname.trim()) errs.add("p2_nachname");
        if (!p2.geburtsdatum.trim()) errs.add("p2_geburtsdatum");
        if (!p2.familienstand.trim()) errs.add("p2_familienstand");
        if (!(p2.steuerklasse || "").trim()) errs.add("p2_steuerklasse");
        if (!(p2.kirchensteuer || "").trim()) errs.add("p2_kirchensteuer");
      }
      break;
    case 2:
      if (!data.beschaeftigungsart) errs.add("beschaeftigungsart");
      if (data.beschaeftigungsart === "angestellt") {
        if (!data.einkommen.netto.trim()) errs.add("netto");
        if (!data.anstellung.branche.trim()) errs.add("anstellung_branche");
        if (!data.anstellung.firma.trim()) errs.add("anstellung_firma");
        if (!data.anstellung.berufsbezeichnung.trim()) errs.add("anstellung_beruf");
        if (!data.anstellung.angestelltSeit.trim()) errs.add("anstellung_seit");
        if (!data.anstellung.probezeit) errs.add("probezeit");
      }
      if (data.beschaeftigungsart === "selbstaendig") {
        if (!data.einkommen.gewerbe.trim()) errs.add("gewerbe");
        if (!data.selbstaendigkeit.firma.trim()) errs.add("selbst_firma");
        if (!data.selbstaendigkeit.branche.trim()) errs.add("selbst_branche");
        if (!data.selbstaendigkeit.selbstaendigSeit.trim()) errs.add("selbst_seit");
      }
      /*
       * Das Jahresbrutto ist seit dem 07.09.2026 Pflicht.
       *
       * Es ist die Grundlage jeder Steuerrechnung im Investmentrechner, und
       * ohne es rechnete der Rechner bisher stillschweigend mit pauschalen 42
       * Prozent. Die Pflicht greift beim Ausfüllen, also nur für neue und
       * gerade laufende Selbstauskünfte; bereits abgeschickte werden nicht
       * erneut geprüft und gelten unverändert weiter.
       *
       * Kein Einkommen ist eine gültige Angabe: Wer nichts verdient, trägt 0
       * ein. Deshalb wird auf eine Eingabe geprüft und nicht auf einen Betrag
       * größer null.
       */
      if (!(data.bruttoJahr || "").trim()) errs.add("bruttoJahr");
      if (data.kinder.length > 0 && !data.einkommen.kindergeld.trim()) errs.add("kindergeld");
      // Person 2 Beschäftigungsart + Pflichtfelder (Branche/Firma/Beruf/Datum)
      if (hasP2) {
        if (!p2.beschaeftigungsart) errs.add("p2_beschaeftigungsart");
        if (!(p2.bruttoJahr || "").trim()) errs.add("p2_bruttoJahr");
        if (p2.beschaeftigungsart === "angestellt") {
          if (!p2.anstellung.branche.trim()) errs.add("p2_anstellung_branche");
          if (!p2.anstellung.firma.trim()) errs.add("p2_anstellung_firma");
          if (!p2.anstellung.berufsbezeichnung.trim()) errs.add("p2_anstellung_beruf");
          if (!p2.anstellung.angestelltSeit.trim()) errs.add("p2_anstellung_seit");
        }
        if (p2.beschaeftigungsart === "selbstaendig") {
          if (!p2.selbstaendigkeit.branche.trim()) errs.add("p2_selbst_branche");
          if (!p2.selbstaendigkeit.firma.trim()) errs.add("p2_selbst_firma");
          if (!p2.selbstaendigkeit.selbstaendigSeit.trim()) errs.add("p2_selbst_seit");
        }
      }
      break;
    case 3:
      if (data.mietart === "Zur Miete" && !data.mieteWarm.trim()) errs.add("mieteWarm");
      if (!data.lebenshaltungskosten.trim()) errs.add("lebenshaltungskosten");
      // Person 2 Wohnsituation + Miete warm Pflicht
      if (hasP2) {
        if (!p2.mietart) errs.add("p2_mietart");
        if (p2.mietart === "Zur Miete" && !p2.mieteWarm.trim()) errs.add("p2_mieteWarm");
      }
      /*
       * Kredite beider Personen: Art, Grundzeile und Bank-Ergänzung nach der
       * Vorgabe der Finanzierung (seit 28.09.2026, Tabelle in
       * kreditPflichtfelder.ts).
       */
      for (const k of kreditPruefungGesamt(data).fehler) errs.add(k);
      break;
    case 4: {
      /*
       * Jeder Immobilienkredit braucht seine Immobilie. Fehlt sie ganz, muss
       * sie hier angelegt werden. Gibt es sie, aber der Kredit ist nicht
       * zugeordnet, meldet sich das Feld im Schritt Ausgaben (die
       * Navigation springt dorthin, weil der Schlüssel mit "kredit_" beginnt).
       */
      const kp = kreditPruefungGesamt(data);
      if (kp.immobilieFehlt) errs.add("immobilien_fehlt");
      for (const k of kp.fehler) if (k.endsWith("_immobilie")) errs.add(k);
      break;
    }
    case 6:
      // Sonstige Angaben: Mahnverfahren und Schufa sind für beide Personen
      // Pflicht, seit dem 29.09.2026 auch für Person 2 und ohne Vorbelegung.
      if (!data.mahnverfahren) errs.add("mahnverfahren");
      if (!data.schufaBekannt) errs.add("schufaBekannt");
      if (hasP2) {
        if (!p2.mahnverfahren) errs.add("p2_mahnverfahren");
        if (!p2.schufaBekannt) errs.add("p2_schufaBekannt");
      }
      break;
  }
  return errs;
}

// ─── Step hints for customer mode ────────────────────────────
const STEP_HINTS: Record<number, { title: string; items: string[] }> = {
  0: {
    title: "💡 Hinweis",
    items: [
      "Wählen Sie bis zu 3 Ziele aus, die Ihnen am wichtigsten sind.",
      "Diese Auswahl hilft uns, die passende Anlagestrategie für Sie zu finden.",
      'Es gibt kein "richtig" oder "falsch" \u2013 w\u00e4hlen Sie, was zu Ihrer Lebenssituation passt.',
    ],
  },
  1: {
    title: "📋 Persönliche Angaben",
    items: [
      "Bitte tragen Sie Ihre Daten genau wie im Personalausweis ein.",
      "Das Geburtsdatum wird für die Bonitätsprüfung benötigt.",
      "Ihre aktuelle Wohnadresse wird für die Finanzierungsprüfung verwendet.",
      "Mindestens Telefon oder Mobilfunk muss angegeben werden.",
      'Falls Sie gemeinsam finanzieren, aktivieren Sie "Person 2 anlegen".',
    ],
  },
  2: {
    title: "💰 Einnahmen",
    items: [
      "Bitte geben Sie Ihr monatliches Netto-Einkommen an (was auf Ihrem Konto ankommt).",
      "Überstunden und Boni nur angeben, wenn diese regelmäßig und vertraglich gesichert sind.",
      "Selbständige: Bitte den durchschnittlichen monatlichen Gewinn der letzten 3 Jahre angeben.",
      "Bankverbindung: IBAN und Institut werden für die spätere Finanzierung benötigt.",
      "Arbeitgeber bitte genau wie auf der Gehaltsabrechnung angeben.",
    ],
  },
  3: {
    title: "📊 Ausgaben",
    items: [
      "Kaltmiete ohne Nebenkosten angeben. Strom, Heizung und übrige Nebenkosten kommen unten in das Feld Wohnnebenkosten.",
      "Lebenshaltungskosten: Lebensmittel, Kleidung, Freizeit, etc.",
      'Falls Sie in einer Eigentumswohnung wohnen, w\u00e4hlen Sie "Eigentum".',
      "Versicherungsbeitr\u00e4ge: Haftpflicht, Berufsunf\u00e4higkeit, etc. \u2013 ohne Krankenversicherung.",
      "Tipp: Schauen Sie auf Ihre Kontoauszüge der letzten 3 Monate für realistische Werte.",
    ],
  },
  4: {
    title: "🏦 Vermögenswerte",
    items: [
      "Eigenkapital umfasst: Sparguthaben, Tagesgeld, Festgeld, Bausparverträge.",
      "Wertpapiere: Aktien, ETFs, Fonds – zum aktuellen Kurswert.",
      "Immobilien: Geben Sie den geschätzten Verkehrswert an.",
      "Lebensversicherungen: Bitte den aktuellen Rückkaufswert angeben.",
      "Je genauer Ihre Angaben, desto besser können wir Ihren Finanzierungsrahmen berechnen.",
    ],
  },
  5: {
    title: "📝 Verbindlichkeiten",
    items: [
      "Alle bestehenden Kredite angeben – auch Leasingraten für Autos.",
      "Kreditkarten mit Ratenzahlung zählen ebenfalls als Verbindlichkeit.",
      "Bürgschaften: Auch wenn Sie noch nicht in Anspruch genommen wurden.",
      "Dispokredite nur angeben, wenn sie regelmäßig genutzt werden.",
    ],
  },
  6: {
    title: "⚖️ Sonstige Angaben",
    items: [
      "Schufa-Einträge: Seien Sie ehrlich – bekannte Negativeinträge verhindern keine Beratung.",
      "Mahnverfahren: Auch abgeschlossene Verfahren der letzten 3 Jahre angeben.",
      "Schufa-Score: Falls bekannt, hilft er bei der Einschätzung. Wenn nicht, lassen Sie das Feld leer.",
      "Hinweise: Hier können Sie alles eintragen, was für die Beratung relevant sein könnte.",
    ],
  },
  7: {
    title: "✅ Abschluss",
    items: [
      "Bitte prüfen Sie alle Angaben nochmals sorgfältig.",
      "Nach dem Absenden erhalten Sie einen Link zur digitalen Unterschrift per E-Mail.",
      "Wenn Person 2 angelegt ist, erhält auch diese Person einen Unterschrifts-Link.",
      "Nach Eingang aller Unterschriften wird das PDF automatisch erstellt.",
    ],
  },
};

/**
 * Das Hinweiskaestchen zum gerade offenen Abschnitt.
 *
 * Es steckt in einer eigenen Komponente, weil es an zwei Stellen gebraucht
 * wird: im Formular selbst (Berater, Korrektur) und als eigene Spalte auf der
 * Kundenseite. Der Inhalt haengt am Abschnitt, deshalb bekommt es die Nummer
 * des Abschnitts von aussen. Gibt es zu einem Abschnitt keinen Hinweis, wird
 * nichts gezeichnet.
 */
export function SelbstauskunftHinweise({ schritt, className, sprache = "de" }: { schritt: number; className?: string; /** Kundensprache, ohne Angabe Deutsch. */ sprache?: Sprache }) {
  const hinweis = STEP_HINTS[schritt];
  if (!hinweis) return null;
  return (
    <div className={`space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4 ${className ?? ""}`}>
      <h3 className="text-sm font-semibold">{saText(hinweis.title, sprache)}</h3>
      <ul className="space-y-2">
        {hinweis.items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs text-muted-foreground">
            <span className="mt-0.5 shrink-0 text-primary">•</span>
            <span>{saText(item, sprache)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Die Texte, die übersetzt werden müssen, für den Wächtertest in
 * `selbstauskunftTexte.test.ts`. Er prüft, dass jeder davon im Wörterbuch steht.
 */
export const SA_FORMULAR_TEXTE = { schritte: STEPS, schrittHinweise: STEP_HINTS, feldHilfen: FELD_HILFEN } as const;

// ─── Main Component ──────────────────────────────────────────
export function SelbstauskunftForm({ kundeId, sprache = "de", investmentId: propInvestmentId, onComplete, prefillKontakt, prefillSaData, isEditMode, customerMode, saToken, registerApi, vorgewaehltesZiel, korrekturMode, onKorrekturSave, onAnKundenSenden, onHinweisSchritt, ohneSteuerIdUndIban }: { kundeId: string; /** Kundensprache. Ohne Angabe Deutsch, also der bisherige Stand im CRM. Gespeichert wird immer deutsch. */ sprache?: Sprache; investmentId?: string; onComplete?: () => void; prefillKontakt?: SelbstauskunftKontaktPrefill | null; prefillSaData?: Partial<SelbstauskunftData> | null; isEditMode?: boolean; customerMode?: boolean; saToken?: string; registerApi?: (api: { saveDraft: () => Promise<void>; hatUngespeichertes: () => boolean }) => void; /** Kunde korrigiert die vom Berater ausgefuellte SA vor der Unterschrift. */ korrekturMode?: boolean; onKorrekturSave?: (data: SelbstauskunftData) => Promise<void> | void; /** Nur der Berater: den angefangenen Stand dem Kunden zum Fertigmachen schicken. */ onAnKundenSenden?: () => Promise<void> | void; /** Ziel aus der Beratungspraesentation, wird als eines der drei vorbelegt. */ vorgewaehltesZiel?: string; /**
 * Wird die Funktion uebergeben, zeichnet das Formular die Hinweisspalte nicht
 * selbst, sondern meldet nur den gerade offenen Abschnitt nach aussen. Die
 * Kundenseite setzt die Hinweise damit als eigene dritte Spalte neben das
 * Formular, ausserhalb des Scrollbereichs.
 */ onHinweisSchritt?: (schritt: number) => void; /**
 * Öffentlicher Weg aus dem Handbuch (seit dem 26.09.2026): Steuer-ID und
 * Bankverbindung werden hier nicht abgefragt. Beide sind für die
 * Rahmenrechnung nicht nötig und werden erst später im geschützten
 * Kundenportal erhoben (Strategie 5.2). Beide Felder sind ohnehin freiwillig,
 * es fällt also keine Pflichtprüfung weg.
 */ ohneSteuerIdUndIban?: boolean }) {
  const [step, setStep] = useState(0);
  /*
   * Texte und Beträge in der Kundensprache. `t` übersetzt einen deutschen
   * Oberflächentext, `w` einen gespeicherten Auswahlwert. Beträge bleiben im
   * Speicher deutscher Text („1.234,56“); auf Englisch zeigt das Feld
   * „1,234.56“ und rechnet die Eingabe zurück, damit „2,500“ als 2.500 und
   * nie als 2,5 ankommt.
   */
  const t = useCallback((de: string, werte?: SaTextWerte) => saText(de, sprache, werte), [sprache]);
  const w = useCallback((wert: string) => saWertAnzeige(wert, sprache), [sprache]);
  const betragEin = (roh: string) => (sprache === "en" ? enZuDeBetrag(roh) : formatCurrency(roh));
  const betragAus = (gespeichert: string) => (sprache === "en" ? deZuEnBetrag(gespeichert) : gespeichert);
  /** Ein gespeicherter Betrag mit Eurozeichen: „1.234 €“ oder „€1,234“. */
  const euroEintrag = (gespeichert: string) => (sprache === "en" ? `€${deZuEnBetrag(gespeichert)}` : `${gespeichert} €`);
  /** Eine Monatsrate: „250 €/mtl.“ oder „€250 per month“. */
  const rateText = (gespeichert: string) => (sprache === "en" ? `€${deZuEnBetrag(gespeichert)} per month` : `${gespeichert} €/mtl.`);
  /*
   * Den offenen Abschnitt nach aussen melden, solange die Hinweise ausgelagert
   * sind. Damit bleibt die Hinweisspalte der Kundenseite am Formularzustand
   * haengen, obwohl sie ausserhalb des Formulars steht.
   */
  useEffect(() => {
    onHinweisSchritt?.(step);
  }, [step, onHinweisSchritt]);
  /*
   * Zeichnet das Formular die Hinweise selbst? Nur im Kundenmodus, nur wenn es
   * zum Abschnitt ueberhaupt einen Hinweis gibt, und nur solange sie nicht
   * nach aussen ausgelagert sind.
   */
  const hinweiseImFormular = !!customerMode && !onHinweisSchritt && !!STEP_HINTS[step];
  /*
   * Ladezeitmessung, siehe src/lib/saLadezeit.ts. `aufbauStart` haelt den
   * Beginn des ersten Aufbaus fest, der Effekt weiter unten meldet, wann das
   * Formular tatsaechlich auf dem Bildschirm steht.
   */
  const aufbauStart = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());
  const [data, setData] = useState(() => {
    // If prefillSaData (advisor's draft) is available in customer mode, use it as base
    if (
      (customerMode || korrekturMode) &&
      prefillSaData &&
      typeof prefillSaData === "object" &&
      Object.keys(prefillSaData as object).length > 0
    ) {
      const merged = { ...EMPTY_DATA, ...prefillSaData } as SelbstauskunftData;
      // Stammdaten (Adresse / Geburtsdatum / Person 2) immer aus Kontakt überschreiben,
      // damit die SA – egal welche Variante oder welches Investment – konsistent ist.
      const kontakt = prefillKontakt || getKontaktById(kundeId);
      if (kontakt) {
        merged.anrede = kontakt.anrede || merged.anrede || "Herr";
        merged.vorname = kontakt.vorname || merged.vorname || "";
        merged.nachname = kontakt.nachname || merged.nachname || "";
        merged.email = kontakt.email || merged.email || "";
        merged.telefon = kontakt.telefon || merged.telefon || "";
        merged.geburtsdatum = kontakt.geburtstag || merged.geburtsdatum || "";
        merged.strasse = kontakt.strasse || merged.strasse || "";
        merged.hausnummer = kontakt.hausnummer || merged.hausnummer || "";
        merged.plz = kontakt.plz || merged.plz || "";
        merged.ort = kontakt.ort || merged.ort || "";
        merged.steuerId = merged.steuerId || (kontakt as any).steuerId || "";
        if (kontakt.person2) {
          const p2 = merged.person2Data || { ...EMPTY_PERSON };
          merged.person2 = true;
          merged.person2Data = {
            ...p2,
            anrede: kontakt.person2.anrede || p2.anrede || "Herr",
            vorname: kontakt.person2.vorname || p2.vorname || "",
            nachname: kontakt.person2.nachname || p2.nachname || "",
            email: kontakt.person2.email || p2.email || "",
            telefon: kontakt.person2.telefon || p2.telefon || "",
            geburtsdatum: kontakt.person2.geburtsdatum || p2.geburtsdatum || "",
            steuerId: p2.steuerId || (kontakt.person2 as any).steuerId || "",
          };
        }
      }
      return merged;
    }
    const loaded = loadSA(kundeId, prefillKontakt, propInvestmentId, !!customerMode);
    // Das in der Beratungspräsentation gewählte Ziel wird hier als eines der
    // drei vorbelegt. Der Kunde hat es gerade genannt, er soll es nicht zwei
    // Minuten später noch einmal suchen. Schon gespeicherte Ziele haben
    // Vorrang, damit eine bestehende Selbstauskunft nicht überschrieben wird.
    if (
      vorgewaehltesZiel &&
      ANLAGE_ZIELE.some((z) => z.id === vorgewaehltesZiel) &&
      (loaded.wuenscheZiele || []).length === 0
    ) {
      loaded.wuenscheZiele = [vorgewaehltesZiel];
    }
    // In edit mode, reset abgeschlossen so the user can re-submit
    if (isEditMode && loaded.abgeschlossen) {
      return { ...loaded, abgeschlossen: false };
    }
    return loaded;
  });
  /*
   * Zeitpunkt direkt nach dem Einlesen des gespeicherten Standes. Der
   * Unterschied zu `aufbauStart` ist genau die Zeit, die `loadSA` gebraucht
   * hat, also das Zusammensuchen aus Investment, Entwurf und Kontakt.
   */
  const nachStand = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [draftSaved, setDraftSaved] = useState<string | null>(() => getDraftSavedAt(kundeId));
  const [sendeAnKunden, setSendeAnKunden] = useState(false);
  /*
   * Vorfahrt fuer den Kunden: Beim Oeffnen merken wir uns, wann er zuletzt
   * selbst gearbeitet hat. Aendert sich das waehrend der Berater tippt, gelten
   * seine Angaben und der Berater wird darauf hingewiesen.
   */
  const [kundeWarSchneller, setKundeWarSchneller] = useState(false);
  const { toast } = useToast();

  /*
   * Ende der Ladezeitmessung: erst nach dem naechsten Bildaufbau, denn vorher
   * steht das Formular noch nicht auf dem Bildschirm. Die Zeile nennt die
   * Gesamtzeit seit dem Klick und davon den Anteil, den das Formular selbst
   * gebraucht hat (Stand einlesen und zeichnen).
   */
  useEffect(() => {
    const gestartet = aufbauStart.current;
    const standFertig = nachStand.current;
    const melden = () => {
      const jetzt = typeof performance !== "undefined" ? performance.now() : Date.now();
      saLadeschrittEnde(
        `Formular sichtbar (Stand einlesen ${Math.round(standFertig - gestartet)} ms, ` +
          `Aufbau gesamt ${Math.round(jetzt - gestartet)} ms)`,
      );
    };
    if (typeof requestAnimationFrame !== "function") {
      melden();
      return;
    }
    const kennung = requestAnimationFrame(melden);
    return () => cancelAnimationFrame(kennung);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Person-2 nachträglich entfernen (nur Editor-Modus) ─────
  const [showRemoveP2Dialog, setShowRemoveP2Dialog] = useState(false);
  const [removingP2, setRemovingP2] = useState(false);

  const removePerson2Everywhere = useCallback(async () => {
    setRemovingP2(true);
    const invId = propInvestmentId || new URLSearchParams(window.location.search).get("investmentId") || "";
    try {
      // 1) Alle SA-Signaturanfragen für dieses Investment löschen (P1 + P2 + partner) —
      //    finalize-selbstauskunft prüft "alle unterschrieben"; Restrows würden blockieren.
      let delQ = supabase
        .from("signature_requests")
        .delete()
        .eq("kontakt_id", kundeId)
        .not("person_type", "like", "rv_%");
      if (invId) delQ = delQ.eq("investment_id", invId);
      // Bleiben Restzeilen stehen, blockieren sie spaeter den Abschluss der
      // Selbstauskunft. Deshalb wird hier abgebrochen statt weiterzumachen.
      const { error: delErr } = await delQ;
      if (delErr) {
        console.error("[SA] delete signature_requests failed", delErr);
        throw delErr;
      }

      // 2) Person 2 aus Kontakt-Stammdaten entfernen.
      //    Betroffen sind die Kontaktfelder person2 (Name, Geburtsdatum,
      //    E-Mail, Telefon der zweiten Person), person2Invited,
      //    person2InvitedAt und person2AuthUserId, also auch der Zugang der
      //    zweiten Person zum Kundenportal. Scheitert das, bleibt Person 2 in
      //    den Stammdaten stehen, obwohl die Meldung frueher "entfernt"
      //    behauptet hat.
      const { error: mergeErr } = await (supabase as any).rpc("merge_kontakt_meta", {
        _kontakt_id: kundeId,
        _updates: { person2: null, person2Invited: false, person2InvitedAt: null, person2AuthUserId: null },
      });
      if (mergeErr) {
        console.error("[SA] merge_kontakt_meta failed", mergeErr);
        throw mergeErr;
      }

      // 3) Investment-Meta zurücksetzen, damit SA neu unterschrieben werden muss.
      //    Feldweise schreiben: vorher wurde die gesamte meta-Spalte aus einem
      //    zuvor gelesenen Stand zurückgeschrieben, was parallele Änderungen
      //    (z. B. freigegebene Unterlagen) verlieren konnte.
      if (invId) {
        setInvestmentMetaFields(invId, {
          saSigned: false,
          saSignedAt: null,
          saSignatures: {},
          saSignaturePending: false,
          saSignaturePartial: false,
          saEditStatus: "bearbeitung",
        });
      }

      // 4) Formularstate anpassen + Draft persistieren (ohne Person 2)
      setData(prev => {
        const next = { ...prev, person2: false, person2Data: { ...EMPTY_PERSON } };
        try {
          saveSA(kundeId, next, invId || undefined);
        } catch (e) { console.warn("[SA] saveSA nach P2-Entfernen fehlgeschlagen", e); }
        return next;
      });

      toast({
        title: t("Person 2 entfernt ✓"),
        description: t("Person 2 wurde aus SA und Stammdaten gelöscht. Die SA muss neu unterschrieben werden."),
      });
      setShowRemoveP2Dialog(false);
    } catch (e) {
      console.error("[SA] Person 2 entfernen fehlgeschlagen", e);
      toast({
        title: t("Fehler"),
        description: t("Person 2 konnte nicht entfernt werden und steht weiter in den Stammdaten. Bitte versuche es noch einmal."),
        variant: "destructive",
      });
    } finally {
      setRemovingP2(false);
    }
  }, [kundeId, propInvestmentId, toast, t]);

  const handleP2CheckboxChange = (checked: boolean) => {
    // Unchecking im Editor-Modus mit vorhandener P2 → Bestätigung + Server-Cleanup
    if (!checked && data.person2 && !customerMode) {
      setShowRemoveP2Dialog(true);
      return;
    }
    update("person2", checked);
  };

  // ─── customerMode → push live draft to backend (sa_fill_tokens.prefill_data +
  // investments.meta.saData) so the VP sieht beim erneuten Öffnen von
  // „Online-Selbstauskunft ausfüllen" jeden Fortschritt 1:1, Investment für
  // Investment. Der Unterschriftprozess bleibt davon unberührt.
  const customerSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerSyncInFlight = useRef(false);
  const customerSyncPendingPayload = useRef<SelbstauskunftData | null>(null);
  /*
   * Erst speichern, wenn der Kunde wirklich etwas geaendert hat (28.09.2026).
   * Vorher ging 600 ms nach dem Laden der geladene Stand hinaus, und
   * `update_sa_fill_token_data` ersetzt `investments.meta.saData` komplett:
   * Schon das Oeffnen eines frischen Links machte einen angefangenen Stand
   * am Investment fast leer. Gesetzt nur in `update`, `updateP2` und
   * `abschnittBestaetigen`, den Wegen der Eingaben.
   */
  const nutzerHatGeaendert = useRef(false);

  const pushCustomerDraft = useCallback((payload: SelbstauskunftData) => {
    if (!customerMode || !saToken) return;
    customerSyncPendingPayload.current = payload;
    if (customerSyncTimer.current) clearTimeout(customerSyncTimer.current);
    customerSyncTimer.current = setTimeout(async () => {
      if (customerSyncInFlight.current) {
        // Re-arm: there's still data to send after current flush
        customerSyncTimer.current = setTimeout(() => pushCustomerDraft(customerSyncPendingPayload.current || payload), 400);
        return;
      }
      const toSend = customerSyncPendingPayload.current;
      if (!toSend) return;
      customerSyncPendingPayload.current = null;
      customerSyncInFlight.current = true;
      try {
        const { data: rpcRes, error } = await (supabase as any).rpc("update_sa_fill_token_data", { _token: saToken, _data: toSend });
        if (error || (rpcRes && rpcRes.success === false)) {
          console.warn("[SA Autosync] RPC failed:", error, rpcRes);
        }
      } catch (e) {
        console.warn("[SA Autosync] Exception:", e);
      } finally {
        customerSyncInFlight.current = false;
        if (customerSyncPendingPayload.current) {
          customerSyncTimer.current = setTimeout(() => pushCustomerDraft(customerSyncPendingPayload.current!), 50);
        }
      }
    }, 600);
  }, [customerMode, saToken]);

  useEffect(() => {
    if (!customerMode || !saToken || !nutzerHatGeaendert.current) return;
    pushCustomerDraft(data);
    return () => {
      if (customerSyncTimer.current) clearTimeout(customerSyncTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, customerMode, saToken]);

  // ─── Inline Signature (customerMode) ───
  const canvasP1Ref = useRef<HTMLCanvasElement>(null);
  const canvasP2Ref = useRef<HTMLCanvasElement>(null);
  const [p1Drawing, setP1Drawing] = useState(false);
  const [p2Drawing, setP2Drawing] = useState(false);
  const [p1HasDrawn, setP1HasDrawn] = useState(false);
  const [p2HasDrawn, setP2HasDrawn] = useState(false);
  const [p2SignMode, setP2SignMode] = useState<"inline" | "email">("inline");
  

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement | null) => {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const makeDrawHandlers = (canvasRef: React.RefObject<HTMLCanvasElement>, setDrawing: (v: boolean) => void, setDrawn: (v: boolean) => void, drawing: boolean) => ({
    startDraw: (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      setDrawing(true);
      const pos = getCanvasPos(e, canvasRef.current);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    draw: (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!drawing) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getCanvasPos(e, canvasRef.current);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "hsl(222, 47%, 11%)";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setDrawn(true);
    },
    stopDraw: () => setDrawing(false),
    clearCanvas: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setDrawn(false);
    },
  });

  const p1Draw = makeDrawHandlers(canvasP1Ref as React.RefObject<HTMLCanvasElement>, setP1Drawing, setP1HasDrawn, p1Drawing);
  const p2Draw = makeDrawHandlers(canvasP2Ref as React.RefObject<HTMLCanvasElement>, setP2Drawing, setP2HasDrawn, p2Drawing);

  // ─── Mobile-Signatur via QR-Code (customerMode) ───
  const mobileSigBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/sa-mobile-sign`;
  }, []);
  const sigChannelP1 = useMemo(() => (saToken ? `sa-sig-${saToken}-p1` : ""), [saToken]);
  const sigChannelP2 = useMemo(() => (saToken ? `sa-sig-${saToken}-p2` : ""), [saToken]);
  /*
   * Die Handyseite kennt den Kunden nicht, deshalb reisen Sprache und die schon
   * übersetzte Beschriftung im Link mit. Deutsch bleibt ohne `lang`, damit
   * der Link für deutsche Kunden genau wie bisher aussieht.
   */
  const mobileSigSprache = sprache === "en" ? "&lang=en" : "";
  const mobileSigUrlP1 = useMemo(() => (sigChannelP1 ? `${mobileSigBase}?ch=${encodeURIComponent(sigChannelP1)}&label=${encodeURIComponent(t("Unterschrift Person 1"))}${mobileSigSprache}` : ""), [mobileSigBase, sigChannelP1, t, mobileSigSprache]);
  const mobileSigUrlP2 = useMemo(() => (sigChannelP2 ? `${mobileSigBase}?ch=${encodeURIComponent(sigChannelP2)}&label=${encodeURIComponent(t("Unterschrift Person 2"))}${mobileSigSprache}` : ""), [mobileSigBase, sigChannelP2, t, mobileSigSprache]);

  const drawImageOnCanvas = useCallback((canvas: HTMLCanvasElement | null, dataUrl: string, setDrawn: (v: boolean) => void) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const padding = 12;
      const maxW = canvas.width - padding * 2;
      const maxH = canvas.height - padding * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      setDrawn(true);
    };
    img.src = dataUrl;
  }, []);

  // Subscribe to mobile signature broadcasts (customerMode only)
  useEffect(() => {
    if (!customerMode || !sigChannelP1) return;
    const ch = supabase
      .channel(sigChannelP1)
      .on("broadcast", { event: "signature" }, (payload: any) => {
        const dataUrl = payload?.payload?.dataUrl;
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
          drawImageOnCanvas(canvasP1Ref.current, dataUrl, setP1HasDrawn);
          toast({ title: t("Unterschrift Person 1 empfangen ✓"), description: t("Die Unterschrift vom Handy wurde übernommen.") });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [customerMode, sigChannelP1, drawImageOnCanvas, toast, t]);

  useEffect(() => {
    if (!customerMode || !sigChannelP2) return;
    const ch = supabase
      .channel(sigChannelP2)
      .on("broadcast", { event: "signature" }, (payload: any) => {
        const dataUrl = payload?.payload?.dataUrl;
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
          drawImageOnCanvas(canvasP2Ref.current, dataUrl, setP2HasDrawn);
          toast({ title: t("Unterschrift Person 2 empfangen ✓"), description: t("Die Unterschrift vom Handy wurde übernommen.") });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [customerMode, sigChannelP2, drawImageOnCanvas, toast, t]);

  const syncedRef = useRef(false);
  const investmentIdForSave = propInvestmentId || new URLSearchParams(window.location.search).get("investmentId") || undefined;

  // Re-sync kontakt data if it wasn't available at initial load (timing issue)
  useEffect(() => {
    if (syncedRef.current) return;

    const kontakt = prefillKontakt || getKontaktById(kundeId);
    if (!kontakt) return;

    const syncedPreview = {
      anrede: kontakt.anrede || data.anrede || "Herr",
      vorname: kontakt.vorname || data.vorname || "",
      nachname: kontakt.nachname || data.nachname || "",
      email: kontakt.email || data.email || "",
      telefon: kontakt.telefon || data.telefon || "",
      geburtsdatum: kontakt.geburtstag || data.geburtsdatum || "",
      strasse: kontakt.strasse || data.strasse || "",
      hausnummer: kontakt.hausnummer || data.hausnummer || "",
      plz: kontakt.plz || data.plz || "",
      ort: kontakt.ort || data.ort || "",
    };

    // Person-2-Stammdaten ebenfalls aus Kontakt nachziehen
    let p2Synced: typeof data.person2Data | null = null;
    if (kontakt.person2) {
      const p2Curr = data.person2Data || { ...EMPTY_PERSON };
      p2Synced = {
        ...p2Curr,
        anrede: kontakt.person2.anrede || p2Curr.anrede || "Herr",
        vorname: kontakt.person2.vorname || p2Curr.vorname || "",
        nachname: kontakt.person2.nachname || p2Curr.nachname || "",
        email: kontakt.person2.email || p2Curr.email || "",
        telefon: kontakt.person2.telefon || p2Curr.telefon || "",
        geburtsdatum: kontakt.person2.geburtsdatum || p2Curr.geburtsdatum || "",
      };
    }

    const baseChanged = Object.entries(syncedPreview).some(([key, value]) => data[key as keyof SelbstauskunftData] !== value);
    const p2Changed = !!p2Synced && JSON.stringify(p2Synced) !== JSON.stringify(data.person2Data || {});
    if (!baseChanged && !p2Changed) {
      syncedRef.current = true;
      return;
    }

    syncedRef.current = true;
    setData(prev => {
      const synced: SelbstauskunftData = { ...prev, ...syncedPreview };
      if (p2Synced) {
        synced.person2 = true;
        synced.person2Data = p2Synced;
      }
      // Keine automatische Persistierung beim Prefill-Sync – Daten werden erst
      // bei explizitem "Zwischenspeichern" oder Abschluss gespeichert.
      return synced;
    });
  }, [kundeId, prefillKontakt, data]);

  const handleSaveDraft = async () => {
    const investmentId = propInvestmentId || new URLSearchParams(window.location.search).get("investmentId") || "";
    // 1) IMMER zuerst geraetelokal sichern. Das gelingt ohne Auth/RLS und sorgt
    //    dafuer, dass ein Zwischenspeichern nie komplett scheitert. loadSA liest
    //    diesen Key beim naechsten Oeffnen (gleiches Geraet) wieder ein.
    //    Im Kundenmodus nur fuer diese Sitzung, siehe `entwurfSpeicher`.
    schreibeLokalenEntwurf(kundeId, data, investmentId || undefined, !!customerMode);

    // 2) Zusaetzlich best effort ins Backend persistieren (fuer die Sichtbarkeit
    //    beim Berater und geraetuebergreifend). Ein Fehler blockiert das
    //    Zwischenspeichern NICHT mehr, weil Schritt 1 bereits gesichert hat.
    let backendOk = true;
    if (customerMode && saToken) {
      try {
        const { data: rpcRes, error } = await (supabase as any).rpc("update_sa_fill_token_data", {
          _token: saToken,
          _data: data,
        });
        if (error || (rpcRes && rpcRes.success === false)) {
          backendOk = false;
          console.error("[SA Save] RPC failed:", error, rpcRes);
        }
      } catch (e) {
        backendOk = false;
        console.error("[SA Save] Exception:", e);
      }
    } else {
      try {
        saveDraftExplicit(kundeId, data, investmentId || undefined);
        if (investmentId) setSaData(investmentId, data);
      } catch (e) {
        backendOk = false;
        console.error("[SA Save] userSetting/meta failed:", e);
      }
    }

    const now = new Date().toISOString();
    setDraftSaved(now);
    toast({
      title: t("Zwischenstand gespeichert ✓"),
      description: backendOk
        ? t("Die bisherigen Eingaben wurden gesichert. Du kannst die Seite jetzt verlassen und später fortfahren.")
        : t("Deine Eingaben sind auf diesem Gerät gesichert. Die Synchronisierung mit dem Server erfolgt automatisch, sobald sie wieder möglich ist."),
    });
  };

  /**
   * Entwurfsschutz: automatisch speichern, solange der Berater tippt.
   *
   * Bisher wurde erst bei "Zwischenspeichern" oder beim Abschluss geschrieben.
   * Wer zwanzig Minuten an den rund 160 Feldern arbeitet und dann den Tab
   * schliesst, verlor alles. Im Kundenmodus gibt es diese Sicherung schon
   * (siehe pushCustomerDraft weiter oben), deshalb laeuft sie hier nur fuer
   * den Beraterweg.
   *
   * Gespeichert wird ueber `saveSA`, also geraetelokal UND in
   * `investments.meta.saData`. Damit sieht auch ein Kollege den Stand, und ein
   * Geraetewechsel verliert nichts.
   */
  const [ungespeichert, setUngespeichert] = useState(false);
  const autoSpeicherTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ersterLauf = useRef(true);
  /*
   * Nach dem Einreichen ist der lokale Entwurf geloescht. Das Setzen von
   * `abgeschlossen` aendert danach noch einmal `data`; ohne diese Sperre
   * schriebe das Autospeichern den Entwurf gleich wieder zurueck.
   */
  const eingereicht = useRef(false);

  useEffect(() => {
    // Kundenmodus und Korrekturmodus haben ihre eigenen Wege.
    if (customerMode || korrekturMode) return;
    if (eingereicht.current) return;
    // Der erste Durchlauf ist der geladene Stand, nicht eine Eingabe.
    if (ersterLauf.current) {
      ersterLauf.current = false;
      return;
    }
    setUngespeichert(true);
    if (autoSpeicherTimer.current) clearTimeout(autoSpeicherTimer.current);
    autoSpeicherTimer.current = setTimeout(() => {
      if (eingereicht.current) { setUngespeichert(false); return; }
      const investmentId =
        propInvestmentId || new URLSearchParams(window.location.search).get("investmentId") || "";
      try {
        if (investmentId && !customerMode) {
          merkeKundeStand(investmentId);
          if (kundeHatVorfahrtOeffentlich(investmentId)) setKundeWarSchneller(true);
        }
        saveSA(kundeId, data, investmentId || undefined);
        setUngespeichert(false);
      } catch (e) {
        // Schlaegt das Speichern fehl, bleibt die Kennzeichnung stehen und die
        // Warnung beim Verlassen greift weiterhin.
        console.warn("[SA] Autospeichern fehlgeschlagen", e);
      }
    }, 1500);
    return () => {
      if (autoSpeicherTimer.current) clearTimeout(autoSpeicherTimer.current);
    };
  }, [data, customerMode, korrekturMode, kundeId, propInvestmentId]);

  /**
   * Warnung, solange etwas noch nicht gespeichert ist.
   *
   * Greift nur in dem knappen Fenster zwischen der letzten Eingabe und dem
   * Autospeichern. Danach ist alles sicher und der Browser fragt nicht.
   */
  useEffect(() => {
    if (!ungespeichert) return;
    const aufVerlassen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aufVerlassen);
    return () => window.removeEventListener("beforeunload", aufVerlassen);
  }, [ungespeichert]);

  // Stabiler Ref auf handleSaveDraft, damit Parent (z.B. „Speichern & zurück"-Dialog)
  // den aktuellen Stand persistieren kann ohne stale closures.
  const [korrekturSaving, setKorrekturSaving] = useState(false);
  const saveDraftRef = useRef<() => Promise<void>>(async () => {});
  saveDraftRef.current = handleSaveDraft;
  const ungespeichertRef = useRef(false);
  ungespeichertRef.current = ungespeichert;
  useEffect(() => {
    registerApi?.({
      saveDraft: () => saveDraftRef.current(),
      hatUngespeichertes: () => ungespeichertRef.current,
    });
  }, [registerApi]);

  const update = <K extends keyof SelbstauskunftData>(key: K, value: SelbstauskunftData[K]) => {
    nutzerHatGeaendert.current = true;
    setData(prev => {
      const next = { ...prev, [key]: value };
      // Gespeichert wird verzoegert ueber den Entwurfsschutz weiter oben.
      return next;
    });
    if (errors.has(key as string)) {
      setErrors(prev => { const n = new Set(prev); n.delete(key as string); return n; });
    }
  };

  const clearError = (key: string) => {
    if (errors.has(key)) {
      setErrors(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const updateP2 = <K extends keyof PersonData>(key: K, value: PersonData[K]) => {
    nutzerHatGeaendert.current = true;
    setData(prev => {
      const next = { ...prev, person2Data: { ...prev.person2Data, [key]: value } };
      // Gespeichert wird verzoegert ueber den Entwurfsschutz weiter oben.
      return next;
    });
  };

  /*
   * Die sichtbare Markierung der uebernommenen Angaben.
   *
   * `felder` sind die einzelnen Angaben, die noch als uebernommen gelten,
   * `offeneAbschnitte` die Schritte dazu. Eine Angabe faellt heraus, sobald
   * der Nutzer genau sie aendert, ein Schritt, sobald er keine markierte
   * Angabe mehr traegt oder "Angaben geprueft" gedrueckt wurde. Damit ist ein
   * selbst eingetippter Wert nie als uebernommen markiert.
   */
  const vorbelegung = data.vorbelegung;
  const offeneAbschnitte = vorbelegung?.offeneAbschnitte || [];
  const zeigeVorbelegung = !!vorbelegung && offeneAbschnitte.length > 0 && !data.abgeschlossen;

  const markierteFelder = useMemo(
    () => new Set(zeigeVorbelegung ? vorbelegung?.felder || [] : []),
    [zeigeVorbelegung, vorbelegung],
  );
  /** Traegt genau diese Angabe noch die Herkunft aus dem alten Investment? */
  const istUebernommen = (pfad: string) => markierteFelder.has(pfad);

  const abschnittBestaetigen = useCallback((schritt: number) => {
    nutzerHatGeaendert.current = true;
    setData((prev) => {
      const offen = prev.vorbelegung?.offeneAbschnitte || [];
      if (!prev.vorbelegung || !offen.includes(schritt)) return prev;
      return {
        ...prev,
        vorbelegung: {
          ...prev.vorbelegung,
          offeneAbschnitte: offen.filter((s) => s !== schritt),
          // Sonst stuenden die Feldmarkierungen noch da, waehrend der Streifen
          // darueber schon weg ist. Die Anzeige widerspraeche sich.
          felder: felderOhneAbschnitt(prev.vorbelegung.felder || [], schritt),
        },
      };
    });
  }, []);

  /*
   * Wer eine Angabe aendert, hat sie geprueft. Die Markierung verschwindet
   * dann ohne zusaetzlichen Klick, und zwar nur an dieser Angabe. Bewusst
   * nicht auf den gerade sichtbaren Schritt begrenzt: Die Kredite stehen im
   * Schritt Ausgaben, gehoeren aber zum Abschnitt Verbindlichkeiten.
   */
  const standVorherRef = useRef<SelbstauskunftData | null>(null);
  useEffect(() => {
    const vorher = standVorherRef.current;
    standVorherRef.current = data;
    if (!vorher) return;
    const offeneFelder = data.vorbelegung?.felder || [];
    if (offeneFelder.length === 0) return;
    const bleibt = verbleibendeFelder(
      vorher as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
      offeneFelder,
    );
    if (bleibt.length === offeneFelder.length) return;
    setData((prev) =>
      prev.vorbelegung
        ? {
            ...prev,
            vorbelegung: {
              ...prev.vorbelegung,
              felder: bleibt,
              offeneAbschnitte: abschnitteZuFeldern(bleibt),
            },
          }
        : prev,
    );
  }, [data]);

  /*
   * Zaehlt jede gescheiterte Pruefung. Nur dann wird zum ersten markierten
   * Feld gescrollt, nicht bei jedem Tastendruck, der einen Fehler loescht.
   */
  const [fehlerSprung, setFehlerSprung] = useState(0);
  const inhaltRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fehlerSprung === 0) return;
    const feld = inhaltRef.current?.querySelector<HTMLElement>("[data-sa-fehler]");
    if (!feld) return;
    feld.scrollIntoView?.({ behavior: "smooth", block: "center" });
    // Eingabe oder Auswahl, nicht das Info-Symbol in der Beschriftung.
    feld.querySelector<HTMLElement>("input, textarea, [role=combobox]")?.focus({ preventScroll: true });
  }, [fehlerSprung]);

  /** Der Hinweis im Toast: bei Krediten konkret, welche Angaben fehlen. */
  const fehlerBeschreibung = (errs: Set<string>): string => {
    if (errs.has("immobilien_fehlt")) {
      return t("Für einen Immobilienkredit fehlt die belastete Immobilie. Bitte legen Sie sie unter „Immobilienvermögen (Details)\" an.");
    }
    const erster = [...errs].find(istKreditFehler);
    if (erster) {
      const [, p2, nr] = erster.match(/^(p2_)?kredit_(\d+)_/) || [];
      const vorsatz = `${p2 || ""}kredit_${nr}_`;
      const felder = [...errs]
        .filter((k) => k.startsWith(vorsatz))
        .map((k) => t(KREDIT_FELD_LABEL[k.slice(vorsatz.length) as KreditFeld | "kategorie"]));
      return p2
        ? t("Bei Kredit {nr} von Person 2 fehlen noch: {felder}", { nr: Number(nr) + 1, felder: felder.join(", ") })
        : t("Bei Kredit {nr} fehlen noch: {felder}", { nr: Number(nr) + 1, felder: felder.join(", ") });
    }
    return t("Bitte alle markierten Felder ausfüllen.");
  };

  /**
   * Prueft die Schritte der Reihe nach. Beim ersten Fehler: dorthin springen,
   * Felder markieren, Hinweis zeigen, zum ersten Feld scrollen. Kreditfehler
   * gehoeren immer in den Schritt Ausgaben, auch wenn erst eine Immobilie in
   * Schritt Vermoegenswerte sie ausgeloest hat.
   */
  const pruefeSchritte = (schritte: number[]): boolean => {
    for (const s of schritte) {
      const errs = validateStep(s, data);
      if (errs.size === 0) continue;
      setErrors(errs);
      setStep([...errs].some(istKreditFehler) ? 3 : s);
      setFehlerSprung((n) => n + 1);
      toast({ title: t("Pflichtfelder ausfüllen"), description: fehlerBeschreibung(errs), variant: "destructive" });
      return false;
    }
    return true;
  };

  /** Die Kreditschritte, die ein Sprung von `von` nach `bis` ueberspringt. */
  const kreditSchritteDazwischen = (von: number, bis: number) => [3, 4].filter((s) => s > von && s < bis);

  // ─── Kredite und Immobilien je Person ──────────────────────
  const kreditListe = (person: 1 | 2): SaKredit[] => (person === 2 ? data.person2Data.kredite : data.kredite);
  const setzeKredite = (person: 1 | 2, liste: SaKredit[]) => (person === 2 ? updateP2("kredite", liste) : update("kredite", liste));
  const fehlerPraefix = (person: 1 | 2) => (person === 2 ? "p2_" : "");

  /** Ein Feld eines Kredits aendern und seine Markierung loesen. */
  const kreditAendern = (person: 1 | 2, i: number, patch: Partial<SaKredit>) => {
    setzeKredite(person, kreditListe(person).map((k, j) => (j === i ? { ...k, ...patch } : k)));
    for (const feld of Object.keys(patch)) clearError(`${fehlerPraefix(person)}kredit_${i}_${feld}`);
  };

  /**
   * Die Gegenpruefung beim Verlassen von Schritt Vermoegenswerte: Immobilie im
   * Bestand, aber kein Immobilienkredit. Je Person einmal fragen, die Antwort
   * „schuldenfrei“ wird gespeichert. true heisst weiter.
   */
  const immobilieOhneKreditKlaeren = async (): Promise<boolean> => {
    for (const person of immobilieOhneKreditPersonen(data)) {
      const name = person === 2
        ? `${data.person2Data.vorname} ${data.person2Data.nachname}`.trim() || t("Person 2")
        : `${data.vorname} ${data.nachname}`.trim() || t("Person 1");
      const antwort = await auswahlDialog({
        title: t("Wird die Immobilie noch abbezahlt?"),
        description: data.person2
          ? t("Für {name} ist eine Immobilie im Bestand angegeben, bei den Ausgaben aber kein Immobilienkredit eingetragen. Läuft für die Immobilie noch ein Kredit, tragen Sie ihn bitte bei den Ausgaben unter „Kredite / Verbindlichkeiten\" samt Kreditdetails ein.", { name })
          : t("Sie haben eine Immobilie im Bestand angegeben, bei den Ausgaben aber keinen Immobilienkredit eingetragen. Läuft für die Immobilie noch ein Kredit, tragen Sie ihn bitte bei den Ausgaben unter „Kredite / Verbindlichkeiten\" samt Kreditdetails ein."),
        optionen: [
          { wert: "schuldenfrei", text: t("Nein, schuldenfrei") },
          { wert: "kredit", text: t("Ja, Kredit eintragen") },
        ],
      });
      // Geschlossen ohne Wahl: auf dem Schritt bleiben, nichts merken.
      if (antwort === null) return false;
      if (antwort === "schuldenfrei") {
        if (person === 2) updateP2("immobilienSchuldenfrei", true);
        else update("immobilienSchuldenfrei", true);
        continue;
      }
      const eigene = (person === 2 ? data.person2Data.immobilien : data.immobilien) || [];
      const neu: SaKredit = {
        art: "",
        kategorie: "immobilienkredit",
        rate: "",
        restschuld: "",
        laufzeitEnde: "",
        // Bei genau einer Immobilie dieser Person ist die Zuordnung eindeutig.
        ...(eigene.length === 1 ? { immobilie: immobilienVerweisText(person, 0) } : {}),
      };
      setzeKredite(person, [...kreditListe(person), neu]);
      setErrors(new Set());
      setStep(3);
      toast({ title: t("Immobilienkredit angelegt"), description: t("Bitte ergänzen Sie bei den Ausgaben die Kreditdetails. Alle markierten Felder sind Pflicht.") });
      return false;
    }
    return true;
  };

  const tryNext = async () => {
    if (!pruefeSchritte([step])) return;
    setErrors(new Set());
    // Nur wenn wirklich gefragt wird, wartet der Knopf auf den Dialog.
    if (step === 4 && immobilieOhneKreditPersonen(data).length > 0 && !(await immobilieOhneKreditKlaeren())) return;
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => { setErrors(new Set()); setStep(s => Math.max(s - 1, 0)); };

  // ─── Step renderers ────────────────────────────────────────
  const renderStep0 = () => {
    const selectedCount = data.wuenscheZiele.length;
    const atMax = selectedCount >= MAX_ZIELE;

    return (
      <div>
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">{t("Wünsche & Ziele")}{istUebernommen("wuenscheZiele") && <UebernommenMarke />}</h2>
        <p className={`text-sm mb-1 ${errors.has("wuenscheZiele") ? "text-destructive font-medium" : "text-muted-foreground"}`}>
          {t("Bitte 1–{max} Ziele auswählen", { max: MAX_ZIELE })} <span className="text-destructive">*</span>
        </p>
        <div className={cn(
          "inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mb-4",
          selectedCount === 0 ? "bg-muted text-muted-foreground" :
          selectedCount <= MAX_ZIELE ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
        )}>
          {t("{anzahl} / {max} ausgewählt", { anzahl: selectedCount, max: MAX_ZIELE })}
        </div>
        {/* Hoechstens drei Spalten und mittig: neun Ziele stehen so als
            drei mal drei untereinander, alle gleich breit. Vier Spalten
            liessen in der letzten Reihe eine einzelne Kachel stehen. */}
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ZIELE.map(z => {
            const selected = data.wuenscheZiele.includes(z.id);
            const disabled = !selected && atMax;
            return (
              <button
                key={z.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = selected ? data.wuenscheZiele.filter(x => x !== z.id) : [...data.wuenscheZiele, z.id];
                  update("wuenscheZiele", next);
                }}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all relative",
                  selected
                    ? "border-primary bg-primary/10 shadow-lg ring-2 ring-primary/30"
                    : errors.has("wuenscheZiele")
                    ? "border-destructive hover:border-destructive/70"
                    : disabled
                    ? "border-border opacity-40 cursor-not-allowed"
                    : "border-border hover:border-muted-foreground/40"
                )}
              >
                {selected && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                  selected ? "bg-primary/20" : "bg-muted"
                )}>
                  <z.icon className={cn("h-6 w-6", selected ? "text-primary" : "text-muted-foreground")} />
                </div>
                <span className={cn("text-sm text-center leading-tight", selected && "font-semibold")}>{w(z.label)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStep1 = () => (
    <div>
      <h2 className="text-xl font-bold mb-2">{t("Persönliche Angaben: Angaben Person 1")}</h2>
      <div className="flex items-center gap-2 mb-6">
        <Checkbox checked={data.person2} onCheckedChange={v => handleP2CheckboxChange(!!v)} id="p2" />
        <label htmlFor="p2" className="text-sm">{t("Person 2 anlegen")}</label>
        <FeldInfo text="Zweite Person aufnehmen, wenn die Finanzierung gemeinsam laufen soll, zum Beispiel Ehe- oder Lebenspartner. Beide Personen unterschreiben am Ende." />
        {data.person2 && !customerMode && (
          <button
            type="button"
            onClick={() => setShowRemoveP2Dialog(true)}
            className="text-xs text-destructive underline underline-offset-2 hover:opacity-80"
          >
            {t("Person 2 dauerhaft entfernen")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        <Field label="Anrede" required filled={!!data.anrede}>
          <Select value={data.anrede} onValueChange={v => update("anrede", v)}>
            <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Herr">{w("Herr")}</SelectItem>
              <SelectItem value="Frau">{w("Frau")}</SelectItem>
              <SelectItem value="Divers">{w("Divers")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Titel" uebernommen={istUebernommen("titel")}><Input value={data.titel} onChange={e => update("titel", e.target.value)} /></Field>
        <Field label="Vorname" required error={errors.has("vorname")} filled={!!data.vorname.trim()}><Input value={data.vorname} onChange={e => update("vorname", e.target.value)} /></Field>
        <Field label="Nachname" required error={errors.has("nachname")} filled={!!data.nachname.trim()}><Input value={data.nachname} onChange={e => update("nachname", e.target.value)} /></Field>
        <Field label="Geburtsname" uebernommen={istUebernommen("geburtsname")}><Input value={data.geburtsname} onChange={e => update("geburtsname", e.target.value)} /></Field>
        <Field label="Geburtsdatum" required error={errors.has("geburtsdatum")} filled={!!data.geburtsdatum.trim()}>
          <DatePicker value={data.geburtsdatum} onChange={v => update("geburtsdatum", v)} error={errors.has("geburtsdatum")} />
        </Field>
        {!ohneSteuerIdUndIban && (
        <Field label="Steuer-ID" error={errors.has("steuerId")} filled={!!data.steuerId.trim()}>
          <Input
            value={data.steuerId}
            onChange={e => { update("steuerId", formatSteuerIdInput(e.target.value)); clearError("steuerId"); }}
            placeholder="XXX/XXX/XXXXX"
            inputMode="numeric"
            className={errors.has("steuerId") ? "border-destructive" : ""}
          />
        </Field>
        )}
      </div>

      <div className="mt-4">
        <Label className="text-sm font-medium flex items-center gap-1.5">{t("Staatsangehörigkeit")} <span className="text-destructive">*</span><FeldInfo text="Bei anderer Staatsangehörigkeit bitte das Land eintragen. Die Bank fragt das für die Finanzierungsprüfung ab." />{istUebernommen("staatsangehoerigkeit") && <UebernommenMarke />}</Label>
        <RadioGroup value={data.staatsangehoerigkeit} onValueChange={v => update("staatsangehoerigkeit", v)} className={cn("flex gap-4 mt-1", istUebernommen("staatsangehoerigkeit") && UEBERNOMMEN_RAHMEN)}>
          <div className="flex items-center gap-1.5"><RadioGroupItem value="deutsch" id="sta-de" /><label htmlFor="sta-de" className="text-sm">{t("Deutsch")}</label></div>
          <div className="flex items-center gap-1.5"><RadioGroupItem value="andere" id="sta-other" /><label htmlFor="sta-other" className="text-sm">{t("Andere")}</label></div>
        </RadioGroup>
        {data.staatsangehoerigkeit === "andere" && (
          <Input className={cn("mt-2 max-w-xs", errors.has("staatsangehoerigkeitAndere") && "border-destructive", istUebernommen("staatsangehoerigkeitAndere") && "border-dashed border-accent-foreground/50")} placeholder={t("Staatsangehörigkeit")} value={data.staatsangehoerigkeitAndere} onChange={e => update("staatsangehoerigkeitAndere", e.target.value)} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-4">
        <Field label="Straße" required error={errors.has("strasse")} filled={!!data.strasse.trim()}>
          <AddressAutocomplete
            value={data.strasse}
            onChange={v => update("strasse", v)}
            onSelect={addr => { update("strasse", addr.strasse); update("hausnummer", addr.hausnummer); update("plz", addr.plz); update("ort", addr.ort); }}
            placeholder={t("Straße eingeben...")}
          />
        </Field>
        <Field label="Hausnummer" required error={errors.has("hausnummer")} filled={!!data.hausnummer.trim()}><Input value={data.hausnummer} onChange={e => update("hausnummer", e.target.value)} /></Field>
        <Field label="PLZ" required error={errors.has("plz")} filled={!!data.plz.trim()}><Input value={data.plz} onChange={e => update("plz", formatPLZ(e.target.value))} inputMode="numeric" maxLength={5} /></Field>
        <Field label="Ort" required error={errors.has("ort")} filled={!!data.ort.trim()}><Input value={data.ort} onChange={e => update("ort", e.target.value)} /></Field>
        <Field label="Telefon" required error={errors.has("telefon")} filled={!!data.telefon.trim()}><PhoneInput value={data.telefon} onChange={v => update("telefon", v)} /></Field>
        <Field label="Mobilfunk" error={errors.has("mobilfunk")} uebernommen={istUebernommen("mobilfunk")}><PhoneInput value={data.mobilfunk} onChange={v => update("mobilfunk", v)} /></Field>
        <Field label="E-Mailadresse" required error={errors.has("email")} filled={!!data.email.trim()}><Input value={data.email} onChange={e => update("email", e.target.value)} type="email" /></Field>
        <Field label="Familienstand" required error={errors.has("familienstand")} filled={!!data.familienstand} uebernommen={istUebernommen("familienstand")}>
          <Select value={data.familienstand} onValueChange={v => {
            // Wechselt das zvE seine Bedeutung (eigenes oder gemeinsames), muss es
            // bewusst neu eingetragen werden. Sonst gälte ein persönlicher Wert
            // ungeprüft als gemeinsamer, mit Splitting gerechnet und gedruckt.
            // Der Wert von Person 2 fällt mit weg, damit er beim Zurückwechseln
            // nicht veraltet wieder auftaucht.
            if (hatGueterstand(v) !== hatGueterstand(data.familienstand)) {
              update("zvEJahr", "");
              updateP2("zvEJahr", "");
            }
            update("familienstand", v); clearError("familienstand");
          }}>
            <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
            <SelectContent>
              {["Ledig", "Verheiratet", "Geschieden", "Verwitwet", "Eingetragene Lebenspartnerschaft"].map(f => (
                <SelectItem key={f} value={f}>{w(f)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Seit wann wohnhaft an obiger Anschrift?" className="mt-4 max-w-xs" required error={errors.has("wohnhaftSeit")} filled={!!data.wohnhaftSeit} uebernommen={istUebernommen("wohnhaftSeit")}>
        <Select value={data.wohnhaftSeit} onValueChange={v => update("wohnhaftSeit", v)}>
          <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
          <SelectContent>
            {["Weniger als 1 Jahr", "1-3 Jahre", "3-5 Jahre", "Mehr als 5 Jahre"].map(o => (
              <SelectItem key={o} value={o}>{w(o)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Kinder */}
      <div className="mt-6">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-bold flex items-center gap-2">{t("Kinder")}{istUebernommen("kinder") && <UebernommenMarke />}</Label>
          <Button type="button" size="sm" variant="outline" onClick={() => update("kinder", [...data.kinder, { name: "", geburtsdatum: "", imHaushalt: true }])}>{t("Kind hinzufügen")}</Button>
        </div>
        {data.kinder.map((k, i) => (
          <div key={i} className="flex gap-2 mt-2 items-end">
            <Field label="Name" className="flex-1"><Input value={k.name} onChange={e => { const c = [...data.kinder]; c[i] = { ...c[i], name: e.target.value }; update("kinder", c); }} /></Field>
            <Field label="Geburtsdatum" className="flex-1">
              <DatePicker value={k.geburtsdatum} onChange={v => { const c = [...data.kinder]; c[i] = { ...c[i], geburtsdatum: v }; update("kinder", c); }} />
            </Field>
            {/* Fehlender Wert (Altbestand) zaehlt als ja, deshalb !== false. */}
            <div className="flex items-center gap-1.5 mb-2 shrink-0">
              <Checkbox
                id={`kind-haushalt-${i}`}
                checked={k.imHaushalt !== false}
                onCheckedChange={v => { const c = [...data.kinder]; c[i] = { ...c[i], imHaushalt: !!v }; update("kinder", c); }}
              />
              <label htmlFor={`kind-haushalt-${i}`} className="text-sm whitespace-nowrap">{t("lebt im Haushalt")}</label>
              <FeldInfo text="Haken gesetzt, wenn das Kind im eigenen Haushalt lebt. Das braucht die Bank für die Haushaltsrechnung. Für Kinder außerhalb des Haushalts gibt es gegebenenfalls Unterhaltszahlungen bei den Ausgaben." />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={t("Kind entfernen")} className="mb-0.5" onClick={() => update("kinder", data.kinder.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      {/* ── Person 2 Persönliche Angaben ── */}
      {data.person2 && (
        <div className="mt-8 pt-6 border-t-2 border-primary/30">
          <h2 className="text-xl font-bold mb-4 text-primary">{t("Persönliche Angaben: Angaben Person 2")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            <Field label="Anrede" required filled={!!data.person2Data.anrede}>
              <Select value={data.person2Data.anrede} onValueChange={v => updateP2("anrede", v)}>
                <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Herr">{w("Herr")}</SelectItem>
                  <SelectItem value="Frau">{w("Frau")}</SelectItem>
                  <SelectItem value="Divers">{w("Divers")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Titel" uebernommen={istUebernommen("person2Data.titel")}><Input value={data.person2Data.titel} onChange={e => updateP2("titel", e.target.value)} /></Field>
            <Field label="Vorname" required error={errors.has("p2_vorname")} filled={!!data.person2Data.vorname.trim()}><Input value={data.person2Data.vorname} onChange={e => { updateP2("vorname", e.target.value); clearError("p2_vorname"); }} /></Field>
            <Field label="Nachname" required error={errors.has("p2_nachname")} filled={!!data.person2Data.nachname.trim()}><Input value={data.person2Data.nachname} onChange={e => { updateP2("nachname", e.target.value); clearError("p2_nachname"); }} /></Field>
            <Field label="Geburtsname" uebernommen={istUebernommen("person2Data.geburtsname")}><Input value={data.person2Data.geburtsname} onChange={e => updateP2("geburtsname", e.target.value)} /></Field>
            <Field label="Geburtsdatum" required error={errors.has("p2_geburtsdatum")} filled={!!data.person2Data.geburtsdatum.trim()}>
              <DatePicker value={data.person2Data.geburtsdatum} onChange={v => { updateP2("geburtsdatum", v); clearError("p2_geburtsdatum"); }} error={errors.has("p2_geburtsdatum")} />
            </Field>
            {!ohneSteuerIdUndIban && (
            <Field label="Steuer-ID" error={errors.has("p2_steuerId")}>
              <Input
                value={data.person2Data.steuerId || ""}
                onChange={e => { updateP2("steuerId", formatSteuerIdInput(e.target.value)); clearError("p2_steuerId"); }}
                placeholder="XXX/XXX/XXXXX"
                inputMode="numeric"
                className={errors.has("p2_steuerId") ? "border-destructive" : ""}
              />
            </Field>
            )}
          </div>
          <div className="mt-4">
            <Label className="text-sm font-medium flex items-center gap-1.5">{t("Staatsangehörigkeit")}{istUebernommen("person2Data.staatsangehoerigkeit") && <UebernommenMarke />}</Label>
            <RadioGroup value={data.person2Data.staatsangehoerigkeit} onValueChange={v => updateP2("staatsangehoerigkeit", v)} className={cn("flex gap-4 mt-1", istUebernommen("person2Data.staatsangehoerigkeit") && UEBERNOMMEN_RAHMEN)}>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="deutsch" id="sta-de-p2" /><label htmlFor="sta-de-p2" className="text-sm">{t("Deutsch")}</label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="andere" id="sta-other-p2" /><label htmlFor="sta-other-p2" className="text-sm">{t("Andere")}</label></div>
            </RadioGroup>
            {data.person2Data.staatsangehoerigkeit === "andere" && (
              <Input className={cn("mt-2 max-w-xs", istUebernommen("person2Data.staatsangehoerigkeitAndere") && "border-dashed border-accent-foreground/50")} placeholder={t("Staatsangehörigkeit")} value={data.person2Data.staatsangehoerigkeitAndere} onChange={e => updateP2("staatsangehoerigkeitAndere", e.target.value)} />
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-4">
            <Field label="Straße" error={errors.has("p2_strasse")}>
              <AddressAutocomplete
                value={data.person2Data.strasse}
                onChange={v => { updateP2("strasse", v); clearError("p2_strasse"); }}
                onSelect={addr => { updateP2("strasse", addr.strasse); updateP2("hausnummer", addr.hausnummer); updateP2("plz", addr.plz); updateP2("ort", addr.ort); clearError("p2_strasse"); clearError("p2_hausnummer"); clearError("p2_plz"); clearError("p2_ort"); }}
                placeholder={t("Straße eingeben...")}
              />
            </Field>
            <Field label="Hausnummer" error={errors.has("p2_hausnummer")}><Input value={data.person2Data.hausnummer} onChange={e => { updateP2("hausnummer", e.target.value); clearError("p2_hausnummer"); }} /></Field>
            <Field label="PLZ" error={errors.has("p2_plz")}><Input value={data.person2Data.plz} onChange={e => { updateP2("plz", formatPLZ(e.target.value)); clearError("p2_plz"); }} inputMode="numeric" maxLength={5} /></Field>
            <Field label="Ort" error={errors.has("p2_ort")}><Input value={data.person2Data.ort} onChange={e => { updateP2("ort", e.target.value); clearError("p2_ort"); }} /></Field>
            <Field label="Telefon" error={errors.has("p2_telefon")}><PhoneInput value={data.person2Data.telefon} onChange={v => { updateP2("telefon", v); clearError("p2_telefon"); }} /></Field>
            <Field label="Mobilfunk" error={errors.has("p2_mobilfunk")} uebernommen={istUebernommen("person2Data.mobilfunk")}><PhoneInput value={data.person2Data.mobilfunk} onChange={v => { updateP2("mobilfunk", v); clearError("p2_mobilfunk"); }} /></Field>
            <Field
              label="E-Mailadresse"
              hint="Optional – falls leer, wird die E-Mail von Person 1 für den Unterschrifts-Link verwendet."
            >
              <Input
                value={data.person2Data.email}
                onChange={e => { updateP2("email", e.target.value); }}
                type="email"
                placeholder={data.email || ""}
              />
            </Field>
            <Field label="Familienstand" required error={errors.has("p2_familienstand")} filled={!!data.person2Data.familienstand} uebernommen={istUebernommen("person2Data.familienstand")}>
              <Select value={data.person2Data.familienstand} onValueChange={v => { updateP2("familienstand", v); clearError("p2_familienstand"); }}>
                <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                <SelectContent>
                  {["Ledig", "Verheiratet", "Geschieden", "Verwitwet", "Eingetragene Lebenspartnerschaft"].map(f => (
                    <SelectItem key={f} value={f}>{w(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Seit wann wohnhaft an obiger Anschrift?" className="mt-4 max-w-xs" error={errors.has("p2_wohnhaftSeit")} uebernommen={istUebernommen("person2Data.wohnhaftSeit")}>
            <Select value={data.person2Data.wohnhaftSeit} onValueChange={v => { updateP2("wohnhaftSeit", v); clearError("p2_wohnhaftSeit"); }}>
              <SelectTrigger><SelectValue placeholder={t("Bitte wählen")} /></SelectTrigger>
              <SelectContent>
                {["Weniger als 1 Jahr", "1-3 Jahre", "3-5 Jahre", "Mehr als 5 Jahre"].map(o => (
                  <SelectItem key={o} value={o}>{w(o)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {/* ── Steuerliche & familiäre Angaben (Bank-Ergänzung) ── */}
      <div className="mt-8 p-4 rounded-lg border bg-muted/30">
        <h3 className="font-bold mb-1">{t("Steuerliche & familiäre Angaben")}</h3>
        <p className="text-xs text-muted-foreground mb-4">{t("Von den Banken für die Bonitätsprüfung benötigt.")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <Field label="Steuerklasse" required filled={!!data.steuerklasse} uebernommen={istUebernommen("steuerklasse")}>
            <Select value={data.steuerklasse || ""} onValueChange={v => update("steuerklasse", v)}>
              <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
              <SelectContent>
                {["1","2","3","4","5","6"].map(k => <SelectItem key={k} value={k}>{t("Klasse {k}", { k })}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Kirchensteuerpflicht" required filled={!!data.kirchensteuer} uebernommen={istUebernommen("kirchensteuer")}>
            <Select value={data.kirchensteuer || ""} onValueChange={v => update("kirchensteuer", v)}>
              <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ja">{w("ja")}</SelectItem>
                <SelectItem value="nein">{w("nein")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {/* Gespeichert wird „Verheiratet“ mit großem V, darum nie exakt klein vergleichen. */}
          {(hatGueterstand(data.familienstand) || data.person2) && (
            <Field label="Güterstand" uebernommen={istUebernommen("gueterstand")}>
              <Select value={data.gueterstand || ""} onValueChange={v => update("gueterstand", v)}>
                <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gesetzlich">{t("Zugewinngemeinschaft (gesetzlich)")}</SelectItem>
                  <SelectItem value="guetertrennung">{t("Gütertrennung")}</SelectItem>
                  <SelectItem value="guetergemeinschaft">{t("Gütergemeinschaft")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        {data.person2 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs font-semibold text-primary mb-2">{t("Person 2")}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              <Field label="Steuerklasse Person 2" required filled={!!data.person2Data.steuerklasse} uebernommen={istUebernommen("person2Data.steuerklasse")}>
                <Select value={data.person2Data.steuerklasse || ""} onValueChange={v => updateP2("steuerklasse", v)}>
                  <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                  <SelectContent>
                    {["1","2","3","4","5","6"].map(k => <SelectItem key={k} value={k}>{t("Klasse {k}", { k })}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Kirchensteuerpflicht Person 2" required filled={!!data.person2Data.kirchensteuer} uebernommen={istUebernommen("person2Data.kirchensteuer")}>
                <Select value={data.person2Data.kirchensteuer || ""} onValueChange={v => updateP2("kirchensteuer", v)}>
                  <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ja">{w("ja")}</SelectItem>
                    <SelectItem value="nein">{w("nein")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      {/* Beschäftigungsart P1 */}
      <h2 className="text-xl font-bold mb-2 flex items-center gap-2">{t("Beschäftigungsart")}<FeldInfo text="Die Haupttätigkeit auswählen. Danach richten sich die folgenden Felder." />{istUebernommen("beschaeftigungsart") && <UebernommenMarke />}</h2>
      <p className={`text-sm mb-4 ${errors.has("beschaeftigungsart") ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        {t("Bitte wählen")} <span className="text-destructive">*</span>
      </p>
      <RadioGroup
        value={data.beschaeftigungsart}
        onValueChange={v => { update("beschaeftigungsart", v); clearError("beschaeftigungsart"); }}
        className={cn("flex gap-6 mb-6", errors.has("beschaeftigungsart") && "[&_button]:border-destructive", istUebernommen("beschaeftigungsart") && UEBERNOMMEN_RAHMEN)}
      >
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="angestellt" id="ba-ang" />
          <label htmlFor="ba-ang" className="text-sm font-medium">{t("Angestellt")}</label>
        </div>
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="selbstaendig" id="ba-sel" />
          <label htmlFor="ba-sel" className="text-sm font-medium">{t("Selbstständig")}</label>
        </div>
      </RadioGroup>

      {data.beschaeftigungsart === "angestellt" && (
        <>
          <h2 className="text-xl font-bold mb-4">{t("Anstellung")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            <Field label="Branche" required error={errors.has("anstellung_branche")} filled={!!data.anstellung.branche.trim()} uebernommen={istUebernommen("anstellung.branche")}>
              <Input value={data.anstellung.branche} onChange={e => { update("anstellung", { ...data.anstellung, branche: e.target.value }); clearError("anstellung_branche"); }} />
            </Field>
            <Field label="Firma" required error={errors.has("anstellung_firma")} filled={!!data.anstellung.firma.trim()} uebernommen={istUebernommen("anstellung.firma")}>
              <Input value={data.anstellung.firma} onChange={e => { update("anstellung", { ...data.anstellung, firma: e.target.value }); clearError("anstellung_firma"); }} />
            </Field>
            <Field label="Berufsbezeichnung" required error={errors.has("anstellung_beruf")} filled={!!data.anstellung.berufsbezeichnung.trim()} uebernommen={istUebernommen("anstellung.berufsbezeichnung")}>
              <Input value={data.anstellung.berufsbezeichnung} onChange={e => { update("anstellung", { ...data.anstellung, berufsbezeichnung: e.target.value }); clearError("anstellung_beruf"); }} />
            </Field>
            <Field label="Angestellt seit" required error={errors.has("anstellung_seit")} filled={!!data.anstellung.angestelltSeit?.trim()} uebernommen={istUebernommen("anstellung.angestelltSeit")}>
              <DatePickerField value={data.anstellung.angestelltSeit} onChange={v => { update("anstellung", { ...data.anstellung, angestelltSeit: v }); clearError("anstellung_seit"); }} error={errors.has("anstellung_seit")} fromYear={1960} toYear={new Date().getFullYear()} />
            </Field>
          </div>
          <div className="mt-2">
            <Label className={`text-sm font-medium flex items-center gap-1.5 ${errors.has("probezeit") ? "text-destructive" : ""}`}>{t("Probezeit")} <span className="text-destructive">*</span><FeldInfo text="Ja, wenn die Probezeit im aktuellen Arbeitsverhältnis noch läuft." />{istUebernommen("anstellung.probezeit") && <UebernommenMarke />}</Label>
            <RadioGroup value={data.anstellung.probezeit} onValueChange={v => { update("anstellung", { ...data.anstellung, probezeit: v }); clearError("probezeit"); }} className="flex gap-4 mt-1">
              <div className="flex items-center gap-1.5"><RadioGroupItem value="nein" id="prob-n" /><label htmlFor="prob-n" className="text-sm">{t("Nein")}</label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" id="prob-j" /><label htmlFor="prob-j" className="text-sm">{t("Ja")}</label></div>
            </RadioGroup>
          </div>
        </>
      )}

      {data.beschaeftigungsart === "selbstaendig" && (
        <>
          <h2 className="text-xl font-bold mb-4">{t("Selbstständigkeit")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            <Field label="Branche" required error={errors.has("selbst_branche")} filled={!!data.selbstaendigkeit.branche.trim()} uebernommen={istUebernommen("selbstaendigkeit.branche")}>
              <Input value={data.selbstaendigkeit.branche} onChange={e => { update("selbstaendigkeit", { ...data.selbstaendigkeit, branche: e.target.value }); clearError("selbst_branche"); }} />
            </Field>
            <Field label="Firma" required error={errors.has("selbst_firma")} filled={!!data.selbstaendigkeit.firma.trim()} uebernommen={istUebernommen("selbstaendigkeit.firma")}>
              <Input value={data.selbstaendigkeit.firma} onChange={e => { update("selbstaendigkeit", { ...data.selbstaendigkeit, firma: e.target.value }); clearError("selbst_firma"); }} />
            </Field>
            <Field label="Selbständig seit" required error={errors.has("selbst_seit")} filled={!!data.selbstaendigkeit.selbstaendigSeit?.trim()} uebernommen={istUebernommen("selbstaendigkeit.selbstaendigSeit")}>
              <DatePickerField value={data.selbstaendigkeit.selbstaendigSeit} onChange={v => { update("selbstaendigkeit", { ...data.selbstaendigkeit, selbstaendigSeit: v }); clearError("selbst_seit"); }} error={errors.has("selbst_seit")} fromYear={1960} toYear={new Date().getFullYear()} />
            </Field>
            <Field label="Anzahl Mitarbeiter" uebernommen={istUebernommen("selbstaendigkeit.anzahlMitarbeiter")}><Input value={data.selbstaendigkeit.anzahlMitarbeiter} onChange={e => update("selbstaendigkeit", { ...data.selbstaendigkeit, anzahlMitarbeiter: formatInteger(e.target.value) })} inputMode="numeric" /></Field>
          </div>
        </>
      )}

      {!ohneSteuerIdUndIban && (<>
      {/* Bankkonten P1 */}
      <h3 className="font-bold mt-8 mb-3 flex items-center gap-2">{t("Bankkonten")}{istUebernommen("bankkonten") && <UebernommenMarke />}</h3>
      <p className="text-sm text-muted-foreground mb-2">{t("Angabe optional – nur ausfüllen wenn vorhanden")}</p>
      {data.bankkonten.map((bk, i) => (
        <div key={i} className="grid max-w-4xl grid-cols-[140px_1fr_1fr_auto] gap-2 mb-2 items-end">
          <Field label="Konto">
            <Select value={bk.konto} onValueChange={v => { const c = [...data.bankkonten]; c[i] = { ...c[i], konto: v }; update("bankkonten", c); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Girokonto", "Sparkonto", "Tagesgeld", "Depot"].map(k => <SelectItem key={k} value={k}>{w(k)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Institut">
            <Input value={bk.institut} onChange={e => { const c = [...data.bankkonten]; c[i] = { ...c[i], institut: e.target.value }; update("bankkonten", c); }} />
          </Field>
          <Field label="IBAN">
            <Input value={bk.iban} onChange={e => { const c = [...data.bankkonten]; c[i] = { ...c[i], iban: formatIBAN(e.target.value) }; update("bankkonten", c); }} placeholder="DE89 3704 0044 0532 0130 00" maxLength={27} />
          </Field>
          {i > 0 ? (
            <Button type="button" variant="ghost" size="icon" aria-label={t("Hinzufügen|entfernt einen Eintrag")} className="mb-0.5" onClick={() => update("bankkonten", data.bankkonten.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
          ) : <div className="w-9" />}
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => update("bankkonten", [...data.bankkonten, { konto: "Girokonto", institut: "", iban: "" }])} className="mt-1">
        <Plus className="h-3 w-3 mr-1" /> {t("Konto hinzufügen")}
      </Button>
      </>)}

      {/* Einkommen P1 */}
      <h2 className="text-xl font-bold mt-8 mb-2">{t("Einkommen: Angaben Person 1")}</h2>
      <p className="text-sm text-muted-foreground mb-4">{t("Alle Angaben monatlich")}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {data.beschaeftigungsart === "angestellt" && (
           <Field label="Netto-Gehalt" required error={errors.has("netto")} filled={!!data.einkommen.netto.trim()} uebernommen={istUebernommen("einkommen.netto")}>
            <Input value={betragAus(data.einkommen.netto)} onChange={e => { update("einkommen", { ...data.einkommen, netto: betragEin(e.target.value) }); clearError("netto"); }} inputMode="decimal" placeholder={t("0,00")} />
          </Field>
        )}
        {data.beschaeftigungsart === "selbstaendig" && (
          <Field label="Einkünfte aus Gewerbebetrieb (netto)" required error={errors.has("gewerbe")} filled={!!data.einkommen.gewerbe.trim()} uebernommen={istUebernommen("einkommen.gewerbe")}>
            <Input value={betragAus(data.einkommen.gewerbe)} onChange={e => { update("einkommen", { ...data.einkommen, gewerbe: betragEin(e.target.value) }); clearError("gewerbe"); }} inputMode="decimal" placeholder={t("0,00")} />
          </Field>
        )}
        <Field label="Miet- & Pachteinnahmen (kalt)" uebernommen={istUebernommen("einkommen.miet")}><Input value={betragAus(data.einkommen.miet)} onChange={e => update("einkommen", { ...data.einkommen, miet: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
        <Field label="Zinserträge" uebernommen={istUebernommen("einkommen.zinsen")}><Input value={betragAus(data.einkommen.zinsen)} onChange={e => update("einkommen", { ...data.einkommen, zinsen: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
        <Field label="Rente / Pension" uebernommen={istUebernommen("einkommen.rente")}><Input value={betragAus(data.einkommen.rente)} onChange={e => update("einkommen", { ...data.einkommen, rente: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
        {data.kinder.length > 0 && (
          <Field label="Kindergeld" required error={errors.has("kindergeld")} filled={!!data.einkommen.kindergeld.trim()} uebernommen={istUebernommen("einkommen.kindergeld")} hint={t("{anzahl} Kind(er) hinterlegt – Kindergeld ist Pflicht", { anzahl: data.kinder.length })}>
            <Input value={betragAus(data.einkommen.kindergeld)} onChange={e => { update("einkommen", { ...data.einkommen, kindergeld: betragEin(e.target.value) }); clearError("kindergeld"); }} inputMode="decimal" placeholder={t("0,00")} />
          </Field>
        )}
        <Field label="Sonstige Einkünfte (z.B. Nebenjob)" uebernommen={istUebernommen("einkommen.sonstige")}><Input value={betragAus(data.einkommen.sonstige)} onChange={e => update("einkommen", { ...data.einkommen, sonstige: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
      </div>

      {/*
        Jahresbrutto Person 1.

        Der einzige Jahreswert in diesem Abschnitt, deshalb steht er abgesetzt
        unter den Monatswerten und nicht in deren Raster. Er ist die Grundlage
        der Steuerberechnung im Investmentrechner, das Netto oben taugt dafür
        nicht.
      */}
      <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <Field label="Jahresbrutto (gesamt)" required error={errors.has("bruttoJahr")} filled={!!(data.bruttoJahr || "").trim()} uebernommen={istUebernommen("bruttoJahr")}>
            <Input value={betragAus(data.bruttoJahr || "")} onChange={e => update("bruttoJahr", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t("Jahreswert, nicht monatlich: das gesamte Bruttojahresgehalt vor Steuern, einschließlich Sonderzahlungen wie dem 13. und 14. Gehalt. Wie viele Monatsgehälter gezahlt werden, wird weiter unten getrennt abgefragt. Wir brauchen die Zahl für die Steuerberechnung im Investmentrechner.")}
        </p>
        {/*
          Zu versteuerndes Jahreseinkommen, freiwillig.

          Genauer als die Schätzung aus dem Brutto, deshalb nimmt der
          Investmentrechner diesen Wert zuerst. Bei Ehe und eingetragener
          Lebenspartnerschaft gilt dasselbe wie beim Splitting im Rechner
          (getVerheiratetFromSA): Maßgeblich ist der Familienstand von Person 1.
          Dann steht hier das gemeinsame zvE, und Person 2 bekommt kein eigenes
          Feld. Ein gemeinsamer Steuerbescheid nennt nur eine Zahl, zwei Felder
          würden zum doppelten Eintrag verleiten.
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-4">
          <Field label="Zu versteuerndes Jahreseinkommen" uebernommen={istUebernommen("zvEJahr")}>
            <Input value={betragAus(data.zvEJahr || "")} onChange={e => update("zvEJahr", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} />
          </Field>
        </div>
        {hatGueterstand(data.familienstand) && (
          <p className="text-xs text-primary mt-2 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" /> {t("Bei Zusammenveranlagung tragen Sie bitte das gemeinsame zu versteuernde Einkommen laut Steuerbescheid ein.")}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {t("Freiwillige Angabe. Sie finden den Wert in Ihrem letzten Einkommensteuerbescheid in der Zeile „zu versteuerndes Einkommen“.")}
        </p>
      </div>

      {/* ── Person 2 Beschäftigung & Einkommen ── */}
      {data.person2 && (
        <div className="mt-8 pt-6 border-t-2 border-primary/30">
          <h2 className="text-xl font-bold mb-2 text-primary flex items-center gap-2">{t("Beschäftigungsart & Einkommen: Person 2")}{istUebernommen("person2Data.beschaeftigungsart") && <UebernommenMarke />}</h2>
          <p className={`text-sm mb-4 ${errors.has("p2_beschaeftigungsart") ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {t("Bitte wählen Sie die Beschäftigungsart für Person 2 aus.")}
          </p>
          <RadioGroup
            value={data.person2Data.beschaeftigungsart}
            onValueChange={v => { updateP2("beschaeftigungsart", v); clearError("p2_beschaeftigungsart"); }}
            className={cn("flex gap-6 mb-6", errors.has("p2_beschaeftigungsart") && "[&_button]:border-destructive", istUebernommen("person2Data.beschaeftigungsart") && UEBERNOMMEN_RAHMEN)}
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="angestellt" id="ba-ang-p2" />
              <label htmlFor="ba-ang-p2" className="text-sm font-medium">{t("Angestellt")}</label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="selbstaendig" id="ba-sel-p2" />
              <label htmlFor="ba-sel-p2" className="text-sm font-medium">{t("Selbstständig")}</label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="hausfrau" id="ba-hf-p2" />
              <label htmlFor="ba-hf-p2" className="text-sm font-medium">{t("Hausfrau / Hausmann")}</label>
            </div>
          </RadioGroup>

          {data.person2Data.beschaeftigungsart === "angestellt" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-4">
                <Field label="Branche" required error={errors.has("p2_anstellung_branche")} filled={!!data.person2Data.anstellung.branche.trim()} uebernommen={istUebernommen("person2Data.anstellung.branche")}>
                  <Input value={data.person2Data.anstellung.branche} onChange={e => { updateP2("anstellung", { ...data.person2Data.anstellung, branche: e.target.value }); clearError("p2_anstellung_branche"); }} />
                </Field>
                <Field label="Firma" required error={errors.has("p2_anstellung_firma")} filled={!!data.person2Data.anstellung.firma.trim()} uebernommen={istUebernommen("person2Data.anstellung.firma")}>
                  <Input value={data.person2Data.anstellung.firma} onChange={e => { updateP2("anstellung", { ...data.person2Data.anstellung, firma: e.target.value }); clearError("p2_anstellung_firma"); }} />
                </Field>
                <Field label="Berufsbezeichnung" required error={errors.has("p2_anstellung_beruf")} filled={!!data.person2Data.anstellung.berufsbezeichnung.trim()} uebernommen={istUebernommen("person2Data.anstellung.berufsbezeichnung")}>
                  <Input value={data.person2Data.anstellung.berufsbezeichnung} onChange={e => { updateP2("anstellung", { ...data.person2Data.anstellung, berufsbezeichnung: e.target.value }); clearError("p2_anstellung_beruf"); }} />
                </Field>
                <Field label="Angestellt seit" required error={errors.has("p2_anstellung_seit")} filled={!!data.person2Data.anstellung.angestelltSeit?.trim()} uebernommen={istUebernommen("person2Data.anstellung.angestelltSeit")}>
                  <DatePickerField value={data.person2Data.anstellung.angestelltSeit} onChange={v => { updateP2("anstellung", { ...data.person2Data.anstellung, angestelltSeit: v }); clearError("p2_anstellung_seit"); }} error={errors.has("p2_anstellung_seit")} fromYear={1960} toYear={new Date().getFullYear()} />
                </Field>
              </div>
              <div className="mt-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">{t("Probezeit")}{istUebernommen("person2Data.anstellung.probezeit") && <UebernommenMarke />}</Label>
                <RadioGroup value={data.person2Data.anstellung.probezeit} onValueChange={v => { updateP2("anstellung", { ...data.person2Data.anstellung, probezeit: v }); clearError("p2_probezeit"); }} className="flex gap-4 mt-1">
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="nein" id="prob-n-p2" /><label htmlFor="prob-n-p2" className="text-sm">{t("Nein")}</label></div>
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" id="prob-j-p2" /><label htmlFor="prob-j-p2" className="text-sm">{t("Ja")}</label></div>
                </RadioGroup>
              </div>
            </>
          )}

          {data.person2Data.beschaeftigungsart === "selbstaendig" && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-4">
              <Field label="Branche" required error={errors.has("p2_selbst_branche")} filled={!!data.person2Data.selbstaendigkeit.branche.trim()} uebernommen={istUebernommen("person2Data.selbstaendigkeit.branche")}>
                <Input value={data.person2Data.selbstaendigkeit.branche} onChange={e => { updateP2("selbstaendigkeit", { ...data.person2Data.selbstaendigkeit, branche: e.target.value }); clearError("p2_selbst_branche"); }} />
              </Field>
              <Field label="Firma" required error={errors.has("p2_selbst_firma")} filled={!!data.person2Data.selbstaendigkeit.firma.trim()} uebernommen={istUebernommen("person2Data.selbstaendigkeit.firma")}>
                <Input value={data.person2Data.selbstaendigkeit.firma} onChange={e => { updateP2("selbstaendigkeit", { ...data.person2Data.selbstaendigkeit, firma: e.target.value }); clearError("p2_selbst_firma"); }} />
              </Field>
              <Field label="Selbständig seit" required error={errors.has("p2_selbst_seit")} filled={!!data.person2Data.selbstaendigkeit.selbstaendigSeit?.trim()} uebernommen={istUebernommen("person2Data.selbstaendigkeit.selbstaendigSeit")}>
                <DatePickerField value={data.person2Data.selbstaendigkeit.selbstaendigSeit} onChange={v => { updateP2("selbstaendigkeit", { ...data.person2Data.selbstaendigkeit, selbstaendigSeit: v }); clearError("p2_selbst_seit"); }} error={errors.has("p2_selbst_seit")} fromYear={1960} toYear={new Date().getFullYear()} />
              </Field>
              <Field label="Anzahl Mitarbeiter" uebernommen={istUebernommen("person2Data.selbstaendigkeit.anzahlMitarbeiter")}><Input value={data.person2Data.selbstaendigkeit.anzahlMitarbeiter} onChange={e => updateP2("selbstaendigkeit", { ...data.person2Data.selbstaendigkeit, anzahlMitarbeiter: formatInteger(e.target.value) })} inputMode="numeric" /></Field>
            </div>
          )}

          {!ohneSteuerIdUndIban && (<>
          {/* Bankkonten P2 */}
          <h3 className="font-bold mt-6 mb-3 flex items-center gap-2">{t("Bankkonten Person 2")}{istUebernommen("person2Data.bankkonten") && <UebernommenMarke />}</h3>
          <p className="text-sm text-muted-foreground mb-2">{t("Angabe optional – nur ausfüllen wenn vorhanden")}</p>
          {data.person2Data.bankkonten.map((bk, i) => (
            <div key={i} className="grid max-w-4xl grid-cols-[140px_1fr_1fr_auto] gap-2 mb-2 items-end">
              <Field label="Konto">
                <Select value={bk.konto} onValueChange={v => { const c = [...data.person2Data.bankkonten]; c[i] = { ...c[i], konto: v }; updateP2("bankkonten", c); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Girokonto", "Sparkonto", "Tagesgeld", "Depot"].map(k => <SelectItem key={k} value={k}>{w(k)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Institut">
                <Input value={bk.institut} onChange={e => { const c = [...data.person2Data.bankkonten]; c[i] = { ...c[i], institut: e.target.value }; updateP2("bankkonten", c); }} />
              </Field>
              <Field label="IBAN">
                <Input value={bk.iban} onChange={e => { const c = [...data.person2Data.bankkonten]; c[i] = { ...c[i], iban: formatIBAN(e.target.value) }; updateP2("bankkonten", c); }} placeholder="DE89 3704 0044 0532 0130 00" maxLength={27} />
              </Field>
              {i > 0 ? (
                <Button type="button" variant="ghost" size="icon" aria-label={t("Hinzufügen|entfernt einen Eintrag")} className="mb-0.5" onClick={() => updateP2("bankkonten", data.person2Data.bankkonten.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              ) : <div className="w-9" />}
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => updateP2("bankkonten", [...data.person2Data.bankkonten, { konto: "Girokonto", institut: "", iban: "" }])} className="mt-1">
            <Plus className="h-3 w-3 mr-1" /> {t("Konto hinzufügen")}
          </Button>
          </>)}

          {/* Einkommen P2 */}
          <h3 className="font-bold mt-6 mb-3">{t("Einkommen Person 2")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("Alle Angaben monatlich")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {data.person2Data.beschaeftigungsart === "angestellt" && (
              <Field label="Netto-Gehalt" error={errors.has("p2_netto")} uebernommen={istUebernommen("person2Data.einkommen.netto")}>
                <Input value={betragAus(data.person2Data.einkommen.netto)} onChange={e => { updateP2("einkommen", { ...data.person2Data.einkommen, netto: betragEin(e.target.value) }); clearError("p2_netto"); }} inputMode="decimal" placeholder={t("0,00")} />
              </Field>
            )}
            {data.person2Data.beschaeftigungsart === "selbstaendig" && (
              <Field label="Einkünfte aus Gewerbebetrieb (netto)" error={errors.has("p2_gewerbe")} uebernommen={istUebernommen("person2Data.einkommen.gewerbe")}>
                <Input value={betragAus(data.person2Data.einkommen.gewerbe)} onChange={e => { updateP2("einkommen", { ...data.person2Data.einkommen, gewerbe: betragEin(e.target.value) }); clearError("p2_gewerbe"); }} inputMode="decimal" placeholder={t("0,00")} />
              </Field>
            )}
            <Field label="Miet- & Pachteinnahmen (kalt)" uebernommen={istUebernommen("person2Data.einkommen.miet")}><Input value={betragAus(data.person2Data.einkommen.miet)} onChange={e => updateP2("einkommen", { ...data.person2Data.einkommen, miet: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
            <Field label="Zinserträge" uebernommen={istUebernommen("person2Data.einkommen.zinsen")}><Input value={betragAus(data.person2Data.einkommen.zinsen)} onChange={e => updateP2("einkommen", { ...data.person2Data.einkommen, zinsen: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
            <Field label="Rente / Pension" uebernommen={istUebernommen("person2Data.einkommen.rente")}><Input value={betragAus(data.person2Data.einkommen.rente)} onChange={e => updateP2("einkommen", { ...data.person2Data.einkommen, rente: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
            <Field label="Sonstige Einkünfte" uebernommen={istUebernommen("person2Data.einkommen.sonstige")}><Input value={betragAus(data.person2Data.einkommen.sonstige)} onChange={e => updateP2("einkommen", { ...data.person2Data.einkommen, sonstige: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
          </div>

          {/* Jahresbrutto Person 2, gleiche Stelle und gleiche Beschriftung wie bei Person 1. */}
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              <Field label="Jahresbrutto (gesamt)" required error={errors.has("p2_bruttoJahr")} filled={!!(data.person2Data.bruttoJahr || "").trim()} uebernommen={istUebernommen("person2Data.bruttoJahr")}>
                <Input value={betragAus(data.person2Data.bruttoJahr || "")} onChange={e => updateP2("bruttoJahr", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t("Jahreswert, nicht monatlich: das gesamte Bruttojahresgehalt vor Steuern, einschließlich Sonderzahlungen wie dem 13. und 14. Gehalt.")}
            </p>
            {/* Bei Zusammenveranlagung steht das gemeinsame zvE schon bei Person 1, siehe dort. */}
            {hatGueterstand(data.familienstand) ? (
              <p className="text-xs text-muted-foreground mt-4">
                {t("Zu versteuerndes Jahreseinkommen: gemeinsam mit Person 1 angegeben.")}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-4">
                  <Field label="Zu versteuerndes Jahreseinkommen" uebernommen={istUebernommen("person2Data.zvEJahr")}>
                    <Input value={betragAus(data.person2Data.zvEJahr || "")} onChange={e => updateP2("zvEJahr", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("Freiwillige Angabe. Sie finden den Wert in Ihrem letzten Einkommensteuerbescheid in der Zeile „zu versteuerndes Einkommen“.")}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/*
        Beschäftigungs-Ergänzung (Monatsgehälter, Vertragsart).

        Das Brutto-Jahresgehalt stand hier zweimal im Formular, sobald es auch
        im Einkommensblock erscheint. Es steht jetzt nur noch dort, bei den
        übrigen Einkünften, und gilt zusätzlich für Selbstständige. Der
        Datenschlüssel bleibt unverändert `bruttoJahr`.
      */}
      {(data.beschaeftigungsart === "angestellt" || data.person2Data.beschaeftigungsart === "angestellt") && (
        <div className="mt-8 p-4 rounded-lg border bg-muted/30">
          <h3 className="font-bold mb-1">{t("Bank-Ergänzung: Gehaltszahlung & Vertrag")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("Diese Felder werden von den meisten Banken zusätzlich zum Netto abgefragt.")}</p>
          {data.beschaeftigungsart === "angestellt" && (
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <Field label="Monatsgehälter" required filled={!!data.monatsgehaelter} uebernommen={istUebernommen("monatsgehaelter")}>
                <Select value={data.monatsgehaelter || ""} onValueChange={v => update("monatsgehaelter", v)}>
                  <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                  <SelectContent>
                    {["12","13","14"].map(k => <SelectItem key={k} value={k}>{w(k)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Arbeitsverhältnis" required filled={!!data.arbeitsvertragArt} uebernommen={istUebernommen("arbeitsvertragArt")}>
                <Select value={data.arbeitsvertragArt || ""} onValueChange={v => { update("arbeitsvertragArt", v); if (v !== "befristet") update("befristetBis", ""); }}>
                  <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unbefristet">{t("Unbefristet")}</SelectItem>
                    <SelectItem value="probezeit">{t("In Probezeit")}</SelectItem>
                    <SelectItem value="befristet">{t("Befristet")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {data.arbeitsvertragArt === "befristet" && (
                <Field label="Befristet bis" required filled={!!(data.befristetBis || "").trim()} uebernommen={istUebernommen("befristetBis")}>
                  <DatePickerField value={data.befristetBis || ""} onChange={v => update("befristetBis", v)} fromYear={new Date().getFullYear()} toYear={new Date().getFullYear() + 20} />
                </Field>
              )}
            </div>
          )}
          {data.person2 && data.person2Data.beschaeftigungsart === "angestellt" && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-semibold text-primary mb-2">{t("Person 2")}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
                <Field label="Monatsgehälter" required filled={!!data.person2Data.monatsgehaelter} uebernommen={istUebernommen("person2Data.monatsgehaelter")}>
                  <Select value={data.person2Data.monatsgehaelter || ""} onValueChange={v => updateP2("monatsgehaelter", v)}>
                    <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                    <SelectContent>
                      {["12","13","14"].map(k => <SelectItem key={k} value={k}>{w(k)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Arbeitsverhältnis" required filled={!!data.person2Data.arbeitsvertragArt} uebernommen={istUebernommen("person2Data.arbeitsvertragArt")}>
                  <Select value={data.person2Data.arbeitsvertragArt || ""} onValueChange={v => { updateP2("arbeitsvertragArt", v); if (v !== "befristet") updateP2("befristetBis", ""); }}>
                    <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unbefristet">{t("Unbefristet")}</SelectItem>
                      <SelectItem value="probezeit">{t("In Probezeit")}</SelectItem>
                      <SelectItem value="befristet">{t("Befristet")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {data.person2Data.arbeitsvertragArt === "befristet" && (
                  <Field label="Befristet bis" required filled={!!(data.person2Data.befristetBis || "").trim()} uebernommen={istUebernommen("person2Data.befristetBis")}>
                    <DatePickerField value={data.person2Data.befristetBis || ""} onChange={v => updateP2("befristetBis", v)} fromYear={new Date().getFullYear()} toYear={new Date().getFullYear() + 20} />
                  </Field>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ─── Kredite und Immobilien, fuer Person 1 und Person 2 gleich ─────
  /*
   * Die Immobilien beider Personen als Auswahl fuer „Gehört zu Immobilie“.
   * Nummeriert wie im PDF: erst Person 1, dann Person 2 weitergezaehlt.
   */
  const immobilienOptionen = () => {
    const p1 = (data.immobilien || []).map((im, i) => ({ verweis: immobilienVerweisText(1, i), nr: i + 1, adresse: im.adresse }));
    const p2 = data.person2
      ? (data.person2Data.immobilien || []).map((im, i) => ({ verweis: immobilienVerweisText(2, i), nr: p1.length + i + 1, adresse: im.adresse }))
      : [];
    return [...p1, ...p2];
  };

  /** Die Grundzeilen der Kredite einer Person (Schritt Ausgaben). */
  const renderKreditZeilen = (person: 1 | 2) => {
    const liste = kreditListe(person);
    const vs = fehlerPraefix(person);
    const jahr = new Date().getFullYear();
    return (
      <>
        {liste.map((k, i) => {
          const pflicht = (feld: KreditFeld) => kreditFeldStufe(k.kategorie, feld) === "P";
          const fehler = (feld: string) => errors.has(`${vs}kredit_${i}_${feld}`);
          return (
            <div key={i} className="grid max-w-6xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 mb-4 lg:mb-2 items-end border-b pb-3 lg:border-0 lg:pb-0">
              {/*
                Die Auswahl entscheidet, in welche Zeile der Kredit spaeter faellt
                und welche Angaben Pflicht sind (kreditPflichtfelder.ts). Der
                Freitext daneben sagt der Bank, worum es genau geht.
              */}
              <Field label="Art des Kredits" required filled={!!k.kategorie} error={fehler("kategorie")}>
                <Select value={k.kategorie || ""} onValueChange={v => kreditAendern(person, i, { kategorie: v })}>
                  <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                  <SelectContent>
                    {KREDIT_AUSWAHL.map(a => (
                      <SelectItem key={a.wert} value={a.wert}>{w(a.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Bezeichnung"><Input value={k.art} placeholder={t("z. B. VW Bank")} onChange={e => kreditAendern(person, i, { art: e.target.value })} /></Field>
              <Field label="Monatliche Rate" required={pflicht("rate")} filled={!!(k.rate || "").trim()} error={fehler("rate")}>
                <Input value={betragAus(k.rate || "")} onChange={e => kreditAendern(person, i, { rate: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} />
              </Field>
              <Field label="Restschuld" required={pflicht("restschuld")} filled={!!(k.restschuld || "").trim()} error={fehler("restschuld")}>
                <Input value={betragAus(k.restschuld || "")} onChange={e => kreditAendern(person, i, { restschuld: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} />
              </Field>
              <Field label="Restschuld per" required={pflicht("restschuldPer")} filled={!!(k.restschuldPer || "").trim()} error={fehler("restschuldPer")}>
                <DatePickerField value={k.restschuldPer || ""} onChange={v => kreditAendern(person, i, { restschuldPer: v })} fromYear={jahr - 5} toYear={jahr} />
              </Field>
              <Field label="Laufzeitende" required={pflicht("laufzeitEnde")} filled={!!(k.laufzeitEnde || "").trim()} error={fehler("laufzeitEnde")}>
                <DatePickerField value={k.laufzeitEnde || ""} onChange={v => kreditAendern(person, i, { laufzeitEnde: v })} fromYear={jahr} toYear={jahr + 40} />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Hinzufügen|entfernt einen Eintrag")}
                className="mb-0.5"
                onClick={() => {
                  setzeKredite(person, liste.filter((_, j) => j !== i));
                  // Die Nummern der Kredite verschieben sich, alte Markierungen passten nicht mehr.
                  setErrors(prev => new Set([...prev].filter(e => !e.startsWith(`${vs}kredit_`))));
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button type="button" size="sm" variant="outline" onClick={() => setzeKredite(person, [...liste, { art: "", rate: "", restschuld: "", laufzeitEnde: "" }])} className="mt-1">
          <Plus className="h-3 w-3 mr-1" /> {t("Kredit hinzufügen")}
        </Button>
      </>
    );
  };

  /** Die Bank-Ergänzung je Kredit einer Person. Welche Felder erscheinen und Pflicht sind, sagt die Kreditart. */
  const renderKreditDetails = (person: 1 | 2) => {
    const liste = kreditListe(person);
    if (liste.length === 0) return null;
    const vs = fehlerPraefix(person);
    const optionen = immobilienOptionen();
    const jahr = new Date().getFullYear();
    return (
      <div className="mt-8 p-4 rounded-lg border bg-muted/30">
        <h3 className="font-bold mb-1">{person === 2 ? t("Bank-Ergänzung: Kredit-Details Person 2") : t("Bank-Ergänzung: Kredit-Details")}</h3>
        <p className="text-xs text-muted-foreground mb-4">{t("Zusätzliche Angaben pro Kredit für die Bonitätsprüfung.")}</p>
        {liste.map((k, i) => {
          const stufe = (feld: KreditFeld) => kreditFeldStufe(k.kategorie, feld);
          const zeigen = (feld: KreditFeld) => stufe(feld) !== "-";
          const pflicht = (feld: KreditFeld) => stufe(feld) === "P";
          const fehler = (feld: KreditFeld) => errors.has(`${vs}kredit_${i}_${feld}`);
          const text = (feld: KreditFeld) => ((k[feld] as string | undefined) || "").trim();
          const bezeichnung = k.art || (kreditAuswahlLabel(k.kategorie) ? w(kreditAuswahlLabel(k.kategorie)) : "") || "–";
          return (
            <div key={i} className="mb-4 pb-4 border-b last:border-0">
              <p className="text-sm font-semibold mb-2">{t("Kredit {nr}", { nr: i + 1 })}: {bezeichnung}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {zeigen("bank") && (
                  <Field label="Bank / Darlehensgeber" required={pflicht("bank")} filled={!!text("bank")} error={fehler("bank")}>
                    <Input value={k.bank || ""} onChange={e => kreditAendern(person, i, { bank: e.target.value })} />
                  </Field>
                )}
                {zeigen("ursprung") && (
                  <Field label="Ursprungskredit" required={pflicht("ursprung")} filled={!!text("ursprung")} error={fehler("ursprung")}>
                    <Input value={betragAus(k.ursprung || "")} onChange={e => kreditAendern(person, i, { ursprung: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} />
                  </Field>
                )}
                {zeigen("zinssatz") && (
                  <Field label="Zinssatz (%)" required={pflicht("zinssatz")} filled={!!text("zinssatz")} error={fehler("zinssatz")}>
                    <Input value={k.zinssatz || ""} onChange={e => kreditAendern(person, i, { zinssatz: e.target.value.replace(",", ".") })} inputMode="decimal" placeholder={t("0,00")} />
                  </Field>
                )}
                {zeigen("zinsart") && (
                  <Field label="Zins fest oder variabel" required={pflicht("zinsart")} filled={!!text("zinsart")} error={fehler("zinsart")}>
                    <Select value={k.zinsart || ""} onValueChange={v => kreditAendern(person, i, { zinsart: v })}>
                      <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                      <SelectContent>
                        {ZINSART_AUSWAHL.map(a => <SelectItem key={a.wert} value={a.wert}>{t(a.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {zeigen("vertragsbeginn") && (
                  <Field label="Vertragsbeginn" required={pflicht("vertragsbeginn")} filled={!!text("vertragsbeginn")} error={fehler("vertragsbeginn")}>
                    <DatePickerField value={k.vertragsbeginn || ""} onChange={v => kreditAendern(person, i, { vertragsbeginn: v })} fromYear={1990} toYear={jahr} />
                  </Field>
                )}
                {zeigen("zinsbindungBis") && (
                  <Field label="Zinsbindung bis" required={pflicht("zinsbindungBis")} filled={!!text("zinsbindungBis")} error={fehler("zinsbindungBis")}>
                    <DatePickerField value={k.zinsbindungBis || ""} onChange={v => kreditAendern(person, i, { zinsbindungBis: v })} fromYear={jahr} toYear={jahr + 40} />
                  </Field>
                )}
                {zeigen("zweck") && (
                  <Field label="Verwendungszweck" required={pflicht("zweck")} filled={!!text("zweck")} error={fehler("zweck")}>
                    <Input value={k.zweck || ""} onChange={e => kreditAendern(person, i, { zweck: e.target.value })} />
                  </Field>
                )}
                {zeigen("sondertilgung") && (
                  <Field label="Sondertilgungsrecht" required={pflicht("sondertilgung")} filled={!!text("sondertilgung")} error={fehler("sondertilgung")}>
                    <Select value={k.sondertilgung || ""} onValueChange={v => kreditAendern(person, i, { sondertilgung: v })}>
                      <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                      <SelectContent>
                        {SONDERTILGUNG_AUSWAHL.map(a => <SelectItem key={a.wert} value={a.wert}>{t(a.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {/* Nur mit Person 2 ist offen, wer den Kredit schuldet. */}
                {data.person2 && zeigen("kreditnehmer") && (
                  <Field label="Kreditnehmer" required={pflicht("kreditnehmer")} filled={!!text("kreditnehmer")} error={fehler("kreditnehmer")}>
                    <Select value={k.kreditnehmer || ""} onValueChange={v => kreditAendern(person, i, { kreditnehmer: v })}>
                      <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                      <SelectContent>
                        {KREDITNEHMER_AUSWAHL.map(a => <SelectItem key={a.wert} value={a.wert}>{t(a.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {/*
                  Verknuepfung fuer das PDF: Ein zugeordnetes Darlehen steht dort
                  direkt unter seiner Immobilie. Zur Wahl stehen die Immobilien
                  beider Personen, eine gemeinsame Finanzierung steht oft nur bei
                  einer Person. Gibt es noch keine Immobilie, ist das Feld nicht
                  erfuellbar; dann steht an seiner Stelle der Weg dorthin.
                */}
                {zeigen("immobilie") && optionen.length > 0 && (
                  <Field
                    label="Gehört zu Immobilie"
                    tooltip="Die Immobilie aus dem Block Immobilienvermögen, auf die sich dieses Darlehen bezieht. Im Dokument steht das Darlehen dann direkt bei dieser Immobilie."
                    required={pflicht("immobilie")}
                    filled={optionen.some(o => o.verweis === (k.immobilie ?? ""))}
                    error={fehler("immobilie")}
                  >
                    <Select
                      value={k.immobilie ?? (pflicht("immobilie") ? "" : "keine")}
                      onValueChange={v => kreditAendern(person, i, { immobilie: v === "keine" ? undefined : v })}
                    >
                      <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                      <SelectContent>
                        {!pflicht("immobilie") && <SelectItem value="keine">{t("Keine / allgemeiner Kredit")}</SelectItem>}
                        {optionen.map(o => (
                          <SelectItem key={o.verweis} value={o.verweis}>
                            {`${t("Immobilie {nr}", { nr: o.nr })}${(o.adresse || "").trim() ? `: ${o.adresse}` : ""}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {pflicht("immobilie") && optionen.length === 0 && (
                  <div className="md:col-span-3 xl:col-span-4 flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-orange-400/60 bg-orange-500/10 px-3 py-2 text-sm">
                    <Info className="h-4 w-4 shrink-0 text-orange-500" />
                    <span className="flex-1">{t("Dieser Immobilienkredit muss einer Immobilie zugeordnet werden. Bitte legen Sie die belastete Immobilie unter Vermögenswerte im Block „Immobilienvermögen (Details)\" an.")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setErrors(new Set()); setStep(4); }}>
                      {t("Zu den Vermögenswerten")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /** Der Block Immobilienvermögen einer Person (Schritt Vermögenswerte). */
  const renderImmobilien = (person: 1 | 2) => {
    const liste = (person === 2 ? data.person2Data.immobilien : data.immobilien) || [];
    const setze = (neu: NonNullable<SelbstauskunftData["immobilien"]>) => (person === 2 ? updateP2("immobilien", neu) : update("immobilien", neu));
    // Nummern wie im PDF: Person 2 zaehlt nach den Immobilien von Person 1 weiter.
    const versatz = person === 2 ? (data.immobilien || []).length : 0;
    const aendern = (i: number, patch: Partial<NonNullable<SelbstauskunftData["immobilien"]>[number]>) =>
      setze(liste.map((im, j) => (j === i ? { ...im, ...patch } : im)));
    const eigentuemer = person === 2 ? `${data.person2Data.vorname} ${data.person2Data.nachname}`.trim() : `${data.vorname} ${data.nachname}`.trim();
    return (
      <div className="mt-8 p-4 rounded-lg border bg-muted/30">
        <h3 className="font-bold mb-1 flex items-center gap-2">
          {person === 2 ? t("Immobilienvermögen Person 2 (Details)") : t("Immobilienvermögen (Details)")}
          {istUebernommen(person === 2 ? "person2Data.immobilien" : "immobilien") && <UebernommenMarke />}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">{t("Für jede bestehende Immobilie: Bank-relevante Angaben.")}</p>
        {errors.has("immobilien_fehlt") && (
          <p data-sa-fehler="" className="mb-3 text-sm text-destructive flex items-start gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {t("Für einen Immobilienkredit fehlt die belastete Immobilie. Bitte legen Sie sie hier an.")}
          </p>
        )}
        {liste.map((im, i) => (
          <div key={i} className="mb-4 pb-4 border-b last:border-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">{t("Immobilie {nr}", { nr: versatz + i + 1 })}</p>
              <Button type="button" variant="ghost" size="icon" aria-label={t("Immobilie entfernen")} onClick={() => {
                setze(liste.filter((_, j) => j !== i));
                // Kredit-Zuordnungen beider Personen ruecken nach: Verweise auf
                // die geloeschte Immobilie fallen weg, spaetere ruecken vor.
                update("kredite", verweiseNachLoeschen(data.kredite, person, i));
                updateP2("kredite", verweiseNachLoeschen(data.person2Data.kredite, person, i));
              }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
              <Field label="Eigentümer" required filled={!!(im.eigentuemer || "").trim()}><Input value={im.eigentuemer} onChange={e => aendern(i, { eigentuemer: e.target.value })} /></Field>
              <Field label="Art (EFH/ETW/MFH...)" required filled={!!(im.art || "").trim()}><Input value={im.art} onChange={e => aendern(i, { art: e.target.value })} /></Field>
              <Field label="Adresse" required filled={!!(im.adresse || "").trim()}><Input value={im.adresse} onChange={e => aendern(i, { adresse: e.target.value })} /></Field>
              <Field label="Baujahr" required filled={!!(im.baujahr || "").trim()}><Input value={im.baujahr} onChange={e => aendern(i, { baujahr: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" /></Field>
              <Field label="Grundstück (m²)" required filled={!!(im.grundstueckM2 || "").trim()}><Input value={im.grundstueckM2} onChange={e => aendern(i, { grundstueckM2: formatInteger(e.target.value) })} inputMode="numeric" /></Field>
              <Field label="Wohnfläche (m²)" required filled={!!(im.wohnflaecheM2 || "").trim()}><Input value={im.wohnflaecheM2} onChange={e => aendern(i, { wohnflaecheM2: formatInteger(e.target.value) })} inputMode="numeric" /></Field>
              <Field label="Nutzung" required filled={!!im.nutzung}>
                <Select value={im.nutzung} onValueChange={v => aendern(i, { nutzung: v })}>
                  <SelectTrigger><SelectValue placeholder={t("– wählen –")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eigen">{t("Eigennutzung")}</SelectItem>
                    <SelectItem value="fremd">{t("Fremdvermietet")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Marktwert (€)" required filled={!!(im.marktwert || "").trim()}><Input value={betragAus(im.marktwert)} onChange={e => aendern(i, { marktwert: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Field label="Kaltmiete Ist (€/Monat)" required filled={!!(im.kaltmieteIst || "").trim()}><Input value={betragAus(im.kaltmieteIst)} onChange={e => aendern(i, { kaltmieteIst: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Field label="Kaltmiete zukünftig (€/Monat, optional)"><Input value={betragAus(im.kaltmieteZukunft)} onChange={e => aendern(i, { kaltmieteZukunft: betragEin(e.target.value) })} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <div className="md:col-span-3">
                <Field label="Vermietungsdetails (optional)"><Textarea rows={2} value={im.vermietungsdetails || ""} onChange={e => aendern(i, { vermietungsdetails: e.target.value })} placeholder={t("z. B. teilvermietet: welche Einheit, wie groß, für wie viel")} /></Field>
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setze([...liste, { eigentuemer, art: "", adresse: "", baujahr: "", grundstueckM2: "", wohnflaecheM2: "", nutzung: "fremd", marktwert: "", kaltmieteIst: "", kaltmieteZukunft: "" }]);
            clearError("immobilien_fehlt");
          }}
          className="mt-2"
        >
          <Plus className="h-3 w-3 mr-1" /> {t("Immobilie hinzufügen")}
        </Button>
      </div>
    );
  };

  const renderStep3 = () => (
    <div>
      <h2 className="text-xl font-bold mb-2">{t("Ausgaben: Angaben Person 1")}</h2>
      <p className="text-sm text-muted-foreground mb-4">{t("Alle Angaben monatlich")}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        <Field label="Wohnsituation" required filled={!!data.mietart} uebernommen={istUebernommen("mietart")}>
          <Select value={data.mietart} onValueChange={v => { update("mietart", v); if (v !== "Zur Miete") update("mieteWarm", ""); }}>
            <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
            <SelectContent>
              {["Zur Miete", "Eigentum", "Mietfrei"].map(m => <SelectItem key={m} value={m}>{w(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {data.mietart === "Zur Miete" && (
          <Field label="Kaltmiete" required error={errors.has("mieteWarm")} filled={!!data.mieteWarm.trim()} uebernommen={istUebernommen("mieteWarm")}>
            <Input value={betragAus(data.mieteWarm)} onChange={e => { update("mieteWarm", betragEin(e.target.value)); clearError("mieteWarm"); }} inputMode="decimal" placeholder={t("0,00")} />
          </Field>
        )}
        <Field
          label="Lebenshaltungskosten"
          required
          error={errors.has("lebenshaltungskosten")}
          filled={!!data.lebenshaltungskosten.trim()}
          uebernommen={istUebernommen("lebenshaltungskosten")}
        >
          <Input value={betragAus(data.lebenshaltungskosten)} onChange={e => { update("lebenshaltungskosten", betragEin(e.target.value)); clearError("lebenshaltungskosten"); }} inputMode="decimal" placeholder={t("0,00")} />
        </Field>
        <Field label="Private Krankenversicherung" uebernommen={istUebernommen("privateKV")}><Input value={betragAus(data.privateKV)} onChange={e => update("privateKV", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
        {/*
          Das Betragsfeld allein laedt dazu ein, alles hineinzuschreiben, was
          man gerade nicht zuordnen kann. In einem Fall stand dort ein
          Bausparvertrag, der zu den Krediten gehoert. Das Textfeld daneben
          erscheint erst, wenn ein Betrag steht: Ein leeres Feld neben einer
          Null waere nur eine weitere Zeile ohne Zweck.
        */}
        <Field label="Sonstige Ausgaben" uebernommen={istUebernommen("sonstigeAusgaben")}><Input value={betragAus(data.sonstigeAusgaben)} onChange={e => update("sonstigeAusgaben", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
        {parseCurrencyDE(data.sonstigeAusgaben) > 0 && (
          <Field
            label="Wofür?"
            uebernommen={istUebernommen("sonstigeAusgabenWofuer")}
            hint={!(data.sonstigeAusgabenWofuer || "").trim()
              ? "Kurz benennen, sonst kann die Bank den Betrag nicht einordnen"
              : undefined}
          >
            <Input
              value={data.sonstigeAusgabenWofuer || ""}
              placeholder={t("z. B. Kita, Vereinsbeiträge")}
              onChange={e => update("sonstigeAusgabenWofuer", e.target.value)}
            />
          </Field>
        )}
      </div>

      <h3 className="font-bold mt-8 mb-3 flex items-center gap-2">{t("Kredite / Verbindlichkeiten")}{istUebernommen("kredite") && <UebernommenMarke />}</h3>
      {data.kredite.length === 0 && (
        <p className="text-sm text-muted-foreground mb-2">{t("Keine Kredite hinterlegt. Falls vorhanden, bitte hinzufügen.")}</p>
      )}
      {renderKreditZeilen(1)}

      {/* ── Person 2 Ausgaben ── */}
      {data.person2 && (
        <div className="mt-8 pt-6 border-t-2 border-primary/30">
          <h2 className="text-xl font-bold mb-2 text-primary">{t("Ausgaben: Angaben Person 2")}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t("Alle Angaben monatlich")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            <Field label="Wohnsituation" required error={errors.has("p2_mietart")} filled={!!data.person2Data.mietart} uebernommen={istUebernommen("person2Data.mietart")}>
              <Select value={data.person2Data.mietart} onValueChange={v => { updateP2("mietart", v); clearError("p2_mietart"); if (v !== "Zur Miete") { updateP2("mieteWarm", ""); clearError("p2_mieteWarm"); } }}>
                <SelectTrigger><SelectValue placeholder={t("– Bitte wählen –")} /></SelectTrigger>
                <SelectContent>
                  {["Zur Miete", "Eigentum", "Mietfrei"].map(m => <SelectItem key={m} value={m}>{w(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {data.person2Data.mietart === "Zur Miete" && (
              <Field label="Kaltmiete" required error={errors.has("p2_mieteWarm")} filled={!!data.person2Data.mieteWarm.trim()} uebernommen={istUebernommen("person2Data.mieteWarm")}>
                <Input value={betragAus(data.person2Data.mieteWarm)} onChange={e => { updateP2("mieteWarm", betragEin(e.target.value)); clearError("p2_mieteWarm"); }} inputMode="decimal" placeholder={t("0,00")} />
              </Field>
            )}
            <Field label="Lebenshaltungskosten" uebernommen={istUebernommen("person2Data.lebenshaltungskosten")}>
              <Input value={betragAus(data.person2Data.lebenshaltungskosten)} onChange={e => updateP2("lebenshaltungskosten", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} />
            </Field>
            <Field label="Private Krankenversicherung" uebernommen={istUebernommen("person2Data.privateKV")}><Input value={betragAus(data.person2Data.privateKV)} onChange={e => updateP2("privateKV", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
            <Field label="Sonstige Ausgaben" uebernommen={istUebernommen("person2Data.sonstigeAusgaben")}><Input value={betragAus(data.person2Data.sonstigeAusgaben)} onChange={e => updateP2("sonstigeAusgaben", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
            {parseCurrencyDE(data.person2Data.sonstigeAusgaben) > 0 && (
              <Field
                label="Wofür?"
                uebernommen={istUebernommen("person2Data.sonstigeAusgabenWofuer")}
                hint={!(data.person2Data.sonstigeAusgabenWofuer || "").trim()
                  ? "Kurz benennen, sonst kann die Bank den Betrag nicht einordnen"
                  : undefined}
              >
                <Input
                  value={data.person2Data.sonstigeAusgabenWofuer || ""}
                  placeholder={t("z. B. Kita, Vereinsbeiträge")}
                  onChange={e => updateP2("sonstigeAusgabenWofuer", e.target.value)}
                />
              </Field>
            )}
          </div>

          <h3 className="font-bold mt-6 mb-3 flex items-center gap-2">{t("Kredite / Verbindlichkeiten Person 2")}{istUebernommen("person2Data.kredite") && <UebernommenMarke />}</h3>
          {data.person2Data.kredite.length === 0 && (
            <p className="text-sm text-muted-foreground mb-2">{t("Keine Kredite hinterlegt.")}</p>
          )}
          {renderKreditZeilen(2)}
        </div>
      )}

      {/* ── Ausgaben-Ergänzung (Nebenkosten, Unterhalt, KFZ, Versicherungen aufgeschlüsselt) ── */}
      <div className="mt-8 p-4 rounded-lg border bg-muted/30">
        <h3 className="font-bold mb-1">{t("Bank-Ergänzung: Detaillierte Ausgaben")}</h3>
        <p className="text-xs text-muted-foreground mb-4">{t("Feinere Aufschlüsselung für die Bonitätsprüfung. Alle Angaben monatlich. Bitte hier alle Versicherungsbeiträge detailliert erfassen.")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <Field label="Wohnnebenkosten (Strom, Heizung usw.)" required filled={!!(data.nebenkosten || "").trim()} uebernommen={istUebernommen("nebenkosten")}><Input value={betragAus(data.nebenkosten || "")} onChange={e => update("nebenkosten", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
          <Field label="Unterhaltszahlungen" uebernommen={istUebernommen("unterhalt")}><Input value={betragAus(data.unterhalt || "")} onChange={e => update("unterhalt", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
          <Field label="Anzahl KFZ" required filled={!!(data.kfzAnzahl || "").trim()} uebernommen={istUebernommen("kfzAnzahl")}><Input value={data.kfzAnzahl || ""} onChange={e => { const v = formatInteger(e.target.value); update("kfzAnzahl", v); if ((parseInt(v || "0", 10) || 0) === 0) update("kfzKosten", ""); }} inputMode="numeric" placeholder={t("0")} /></Field>
          {/*
            Bei mehreren Fahrzeugen ist die Summe gemeint, nicht der Betrag je
            Fahrzeug. Ohne diesen Hinweis traegt der eine 250 ein und meint ein
            Auto, der andere 500 fuer beide, und die Bank kann die Zahl nicht
            einordnen.
          */}
          {(parseInt(data.kfzAnzahl || "0", 10) || 0) > 0 && (
            <Field
              label="KFZ-Kosten (Versicherung + Sprit)"
              required
              filled={!!(data.kfzKosten || "").trim()}
              uebernommen={istUebernommen("kfzKosten")}
              hint={(parseInt(data.kfzAnzahl || "0", 10) || 0) > 1
                ? t("Gesamtkosten für alle {anzahl} Fahrzeuge zusammen, nicht je Fahrzeug", { anzahl: data.kfzAnzahl || "" })
                : undefined}
            >
              <Input value={betragAus(data.kfzKosten || "")} onChange={e => update("kfzKosten", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} />
            </Field>
          )}
          <Field label="Berufsunfähigkeitsversicherung" uebernommen={istUebernommen("versBU")}><Input value={betragAus(data.versBU || "")} onChange={e => update("versBU", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
          <Field label="Riester-Vertrag" uebernommen={istUebernommen("versRiester")}><Input value={betragAus(data.versRiester || "")} onChange={e => update("versRiester", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
          <Field label="Sonstige Altersvorsorge" uebernommen={istUebernommen("versAV")}><Input value={betragAus(data.versAV || "")} onChange={e => update("versAV", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
          <Field label="Weitere Versicherungen" uebernommen={istUebernommen("versWeitere")}><Input value={betragAus(data.versWeitere || "")} onChange={e => update("versWeitere", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
        </div>
        {data.person2 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs font-semibold text-primary mb-2">{t("Person 2")}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <Field label="Wohnnebenkosten (Strom, Heizung usw.)" uebernommen={istUebernommen("person2Data.nebenkosten")}><Input value={betragAus(data.person2Data.nebenkosten || "")} onChange={e => updateP2("nebenkosten", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Field label="Unterhaltszahlungen" uebernommen={istUebernommen("person2Data.unterhalt")}><Input value={betragAus(data.person2Data.unterhalt || "")} onChange={e => updateP2("unterhalt", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Field label="KFZ-Kosten" uebernommen={istUebernommen("person2Data.kfzKosten")}><Input value={betragAus(data.person2Data.kfzKosten || "")} onChange={e => updateP2("kfzKosten", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Field label="Berufsunfähigkeitsvers." uebernommen={istUebernommen("person2Data.versBU")}><Input value={betragAus(data.person2Data.versBU || "")} onChange={e => updateP2("versBU", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Field label="Riester" uebernommen={istUebernommen("person2Data.versRiester")}><Input value={betragAus(data.person2Data.versRiester || "")} onChange={e => updateP2("versRiester", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Field label="Sonstige AV" uebernommen={istUebernommen("person2Data.versAV")}><Input value={betragAus(data.person2Data.versAV || "")} onChange={e => updateP2("versAV", betragEin(e.target.value))} inputMode="decimal" placeholder={t("0,00")} /></Field>
            </div>
          </div>
        )}
      </div>

      {/* ── Kredit-Details je Person (Bank-Ergänzung, Pflicht je Kreditart) ── */}
      {renderKreditDetails(1)}
      {data.person2 && renderKreditDetails(2)}

      {/* ── Einnahmen vs. Ausgaben Warnung ── */}
      {(() => {
        const p = (v?: string) => parseFloat((v || "").replace(/\./g, "").replace(",", ".")) || 0;
        // P1 Einnahmen
        const einP1 = p(data.einkommen.netto) + p(data.einkommen.gewerbe) + p(data.einkommen.miet) + p(data.einkommen.zinsen) + p(data.einkommen.rente) + p(data.einkommen.sonstige);
        // P1 Ausgaben
        const lh1 = p(data.lebenshaltungskosten);
        const detailP1 = p(data.nebenkosten) + p(data.unterhalt) + p(data.kfzKosten) + p(data.versBU) + p(data.versRiester) + p(data.versAV) + p(data.versWeitere);
        const ausP1 = (data.mietart === "Zur Miete" ? p(data.mieteWarm) : 0) + lh1 + p(data.privateKV) + detailP1 + p(data.sonstigeAusgaben) + data.kredite.reduce((s, k) => s + p(k.rate), 0);
        // P2
        let einP2 = 0, ausP2 = 0;
        if (data.person2) {
          const d2 = data.person2Data;
          einP2 = p(d2.einkommen.netto) + p(d2.einkommen.gewerbe) + p(d2.einkommen.miet) + p(d2.einkommen.zinsen) + p(d2.einkommen.rente) + p(d2.einkommen.sonstige);
          const lh2 = p(d2.lebenshaltungskosten);
          const detailP2 = p(d2.nebenkosten) + p(d2.unterhalt) + p(d2.kfzKosten) + p(d2.versBU) + p(d2.versRiester) + p(d2.versAV) + p(d2.versWeitere);
          ausP2 = (d2.mietart === "Zur Miete" ? p(d2.mieteWarm) : 0) + lh2 + p(d2.privateKV) + detailP2 + p(d2.sonstigeAusgaben) + d2.kredite.reduce((s, k) => s + p(k.rate), 0);
        }
        const totalEin = einP1 + einP2;
        const totalAus = ausP1 + ausP2;
        // Deutsch wie bisher „1.234,50 €“, Englisch „€1,234.50“.
        const euro = (betrag: number) => (sprache === "en"
          ? euroText(betrag, "en", 2)
          : `${betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`);
        if (totalEin > 0 && totalAus > totalEin) {
          const diff = totalAus - totalEin;
          return (
            <div className="mt-6 p-4 rounded-lg border border-destructive/50 bg-destructive/10 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">{t("Ausgaben übersteigen Einnahmen")}</p>
                <p className="text-sm text-destructive/90 mt-1">
                  {t("Die monatlichen Ausgaben ({ausgaben}) übersteigen die Einnahmen ({einnahmen}) um {differenz}. Bitte prüfen Sie die Angaben – eine Finanzierung ist so nicht darstellbar.", {
                    ausgaben: euro(totalAus),
                    einnahmen: euro(totalEin),
                    differenz: euro(diff),
                  })}
                </p>
              </div>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );

  const renderStep4 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">{t("Vermögenswerte: Angaben Person 1 (Gesamtbetrag)")}</h2>
      <h3 className="font-bold mb-3 flex items-center gap-2">{t("Vermögenswerte")}{istUebernommen("vermoegenswerte") && <UebernommenMarke />}</h3>
      {data.vermoegenswerte.map((v, i) => (
        <div key={i} className="mb-2">
          <div className="grid max-w-4xl grid-cols-[160px_1fr_1fr_auto] gap-2 items-end">
            <Field label="Art" tooltip="Art des Vermögenswerts auswählen. Immobilien bitte unten im Block Immobilienvermögen im Detail erfassen.">
              <Select value={v.art} onValueChange={val => { const c = [...data.vermoegenswerte]; c[i] = { ...c[i], art: val }; if (val === "Immobilien") { c[i] = { ...c[i], institut: "", betrag: "" }; } update("vermoegenswerte", c); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Bank- & Sparguthaben", "Wertpapiere / Depot", "Bausparvertrag", "Lebensversicherung", "Immobilien", "Sonstige"].map(a => (
                    <SelectItem key={a} value={a}>{w(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {v.art === "Immobilien" ? (
              <div className="col-span-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
                {t("Bitte tragen Sie die Immobilie unten im Block „Immobilienvermögen (Details)\" vollständig ein.")}
              </div>
            ) : (
              <>
                <Field label="Institut / Beschreibung"><Input value={v.institut} onChange={e => { const c = [...data.vermoegenswerte]; c[i] = { ...c[i], institut: e.target.value }; update("vermoegenswerte", c); }} placeholder={t("z.B. Sparkasse...")} /></Field>
                <Field label="Betrag"><Input value={betragAus(v.betrag)} onChange={e => { const c = [...data.vermoegenswerte]; c[i] = { ...c[i], betrag: betragEin(e.target.value) }; update("vermoegenswerte", c); }} inputMode="decimal" placeholder={t("0,00")} /></Field>
              </>
            )}
            <Button type="button" variant="ghost" size="icon" aria-label={t("Hinzufügen|entfernt einen Eintrag")} className="mb-0.5" onClick={() => update("vermoegenswerte", data.vermoegenswerte.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => update("vermoegenswerte", [...data.vermoegenswerte, { art: "Bank- & Sparguthaben", institut: "", betrag: "" }])} className="mt-1">
        <Plus className="h-3 w-3 mr-1" /> {t("Vermögenswert hinzufügen")}
      </Button>

      {/* ── Person 2 Vermögenswerte ── */}
      {data.person2 && (
        <div className="mt-8 pt-6 border-t-2 border-primary/30">
          <h2 className="text-xl font-bold mb-4 text-primary flex items-center gap-2">{t("Vermögenswerte: Angaben Person 2 (Gesamtbetrag)")}{istUebernommen("person2Data.vermoegenswerte") && <UebernommenMarke />}</h2>
          {data.person2Data.vermoegenswerte.map((v, i) => (
            <div key={i} className="mb-2">
              <div className="grid max-w-4xl grid-cols-[160px_1fr_1fr_auto] gap-2 items-end">
                <Field label="Art" tooltip="Art des Vermögenswerts auswählen. Immobilien bitte unten im Block Immobilienvermögen im Detail erfassen.">
                  <Select value={v.art} onValueChange={val => { const c = [...data.person2Data.vermoegenswerte]; c[i] = { ...c[i], art: val }; if (val === "Immobilien") { c[i] = { ...c[i], institut: "", betrag: "" }; } updateP2("vermoegenswerte", c); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Bank- & Sparguthaben", "Wertpapiere / Depot", "Bausparvertrag", "Lebensversicherung", "Immobilien", "Sonstige"].map(a => (
                        <SelectItem key={a} value={a}>{w(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {v.art === "Immobilien" ? (
                  <div className="col-span-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
                    {t("Bitte im Block „Immobilienvermögen Person 2 (Details)\" vollständig eintragen.")}
                  </div>
                ) : (
                  <>
                    <Field label="Institut / Beschreibung"><Input value={v.institut} onChange={e => { const c = [...data.person2Data.vermoegenswerte]; c[i] = { ...c[i], institut: e.target.value }; updateP2("vermoegenswerte", c); }} placeholder={t("z.B. Sparkasse...")} /></Field>
                    <Field label="Betrag"><Input value={betragAus(v.betrag)} onChange={e => { const c = [...data.person2Data.vermoegenswerte]; c[i] = { ...c[i], betrag: betragEin(e.target.value) }; updateP2("vermoegenswerte", c); }} inputMode="decimal" placeholder={t("0,00")} /></Field>
                  </>
                )}
                <Button type="button" variant="ghost" size="icon" aria-label={t("Hinzufügen|entfernt einen Eintrag")} className="mb-0.5" onClick={() => updateP2("vermoegenswerte", data.person2Data.vermoegenswerte.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => updateP2("vermoegenswerte", [...data.person2Data.vermoegenswerte, { art: "Bank- & Sparguthaben", institut: "", betrag: "" }])} className="mt-1">
            <Plus className="h-3 w-3 mr-1" /> {t("Vermögenswert hinzufügen")}
          </Button>
        </div>
      )}

      {/* ── Immobilienvermögen je Person (Detail-Tabelle für Bank) ── */}
      {renderImmobilien(1)}
      {data.person2 && renderImmobilien(2)}
    </div>
  );

  const renderStep5 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">{t("Verbindlichkeiten: Angaben Person 1 (Gesamtbetrag)")}</h2>

      <h3 className="font-bold mb-3">{t("Laufende Kredite / Darlehen")}</h3>
      {data.kredite.length > 0 ? (
        <div className="space-y-2 mb-6">
          {data.kredite.map((k, i) => (
            <div key={i} className="flex items-center gap-4 text-sm bg-muted/50 rounded-lg px-4 py-2">
              <span className="font-medium">{k.art || t("Kredit")}</span>
              <span>{t("Rate: {betrag}", { betrag: k.rate ? rateText(k.rate) : "–" })}</span>
              <span>{t("Restschuld: {betrag}", { betrag: k.restschuld ? euroEintrag(k.restschuld) : "–" })}</span>
              <span>{t("bis {datum}", { datum: k.laufzeitEnde || "–" })}</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("Diese Kredite wurden unter „Ausgaben\" erfasst. Änderungen dort vornehmen.")}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-6">{t("Keine laufenden Kredite unter „Ausgaben\" hinterlegt.")}</p>
      )}

      <h3 className="font-bold mb-3 flex items-center gap-2">{t("Bürgschaften")}{istUebernommen("buergschaften") && <UebernommenMarke />}</h3>
      {data.buergschaften.length === 0 && (
        <p className="text-sm text-muted-foreground mb-2">{t("Keine Bürgschaften hinterlegt. Falls vorhanden, bitte hinzufügen.")}</p>
      )}
      {data.buergschaften.map((b, i) => (
        <div key={i} className="grid max-w-3xl grid-cols-[1fr_1fr_auto] gap-2 mb-2 items-end">
          <Field label="Art" tooltip="Wofür die Bürgschaft übernommen wurde, zum Beispiel Mietbürgschaft oder Kreditbürgschaft für ein Familienmitglied."><Input value={b.art} onChange={e => { const c = [...data.buergschaften]; c[i] = { ...c[i], art: e.target.value }; update("buergschaften", c); }} /></Field>
          <Field label="Betrag" tooltip="Höhe der verbürgten Summe in Euro."><Input value={betragAus(b.betrag)} onChange={e => { const c = [...data.buergschaften]; c[i] = { ...c[i], betrag: betragEin(e.target.value) }; update("buergschaften", c); }} inputMode="decimal" placeholder={t("0,00")} /></Field>
          <Button type="button" variant="ghost" size="icon" aria-label={t("Hinzufügen|entfernt einen Eintrag")} className="mb-0.5" onClick={() => update("buergschaften", data.buergschaften.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => update("buergschaften", [...data.buergschaften, { art: "", betrag: "" }])} className="mt-1">
        <Plus className="h-3 w-3 mr-1" /> {t("Bürgschaft hinzufügen")}
      </Button>

      {/* ── Person 2 Verbindlichkeiten ── */}
      {data.person2 && (
        <div className="mt-8 pt-6 border-t-2 border-primary/30">
          <h2 className="text-xl font-bold mb-4 text-primary">{t("Verbindlichkeiten: Angaben Person 2 (Gesamtbetrag)")}</h2>

          <h3 className="font-bold mb-3">{t("Laufende Kredite / Darlehen Person 2")}</h3>
          {data.person2Data.kredite.length > 0 ? (
            <div className="space-y-2 mb-6">
              {data.person2Data.kredite.map((k, i) => (
                <div key={i} className="flex items-center gap-4 text-sm bg-muted/50 rounded-lg px-4 py-2">
                  <span className="font-medium">{k.art || t("Kredit")}</span>
                  <span>{t("Rate: {betrag}", { betrag: k.rate ? rateText(k.rate) : "–" })}</span>
                  <span>{t("Restschuld: {betrag}", { betrag: k.restschuld ? euroEintrag(k.restschuld) : "–" })}</span>
                  <span>{t("bis {datum}", { datum: k.laufzeitEnde || "–" })}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{t("Diese Kredite wurden unter „Ausgaben Person 2\" erfasst.")}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-6">{t("Keine laufenden Kredite unter „Ausgaben Person 2\" hinterlegt.")}</p>
          )}

          <h3 className="font-bold mb-3 flex items-center gap-2">{t("Bürgschaften Person 2")}{istUebernommen("person2Data.buergschaften") && <UebernommenMarke />}</h3>
          {data.person2Data.buergschaften.length === 0 && (
            <p className="text-sm text-muted-foreground mb-2">{t("Keine Bürgschaften hinterlegt.")}</p>
          )}
          {data.person2Data.buergschaften.map((b, i) => (
            <div key={i} className="grid max-w-3xl grid-cols-[1fr_1fr_auto] gap-2 mb-2 items-end">
              <Field label="Art" tooltip="Wofür die Bürgschaft übernommen wurde, zum Beispiel Mietbürgschaft oder Kreditbürgschaft für ein Familienmitglied."><Input value={b.art} onChange={e => { const c = [...data.person2Data.buergschaften]; c[i] = { ...c[i], art: e.target.value }; updateP2("buergschaften", c); }} /></Field>
              <Field label="Betrag" tooltip="Höhe der verbürgten Summe in Euro."><Input value={betragAus(b.betrag)} onChange={e => { const c = [...data.person2Data.buergschaften]; c[i] = { ...c[i], betrag: betragEin(e.target.value) }; updateP2("buergschaften", c); }} inputMode="decimal" placeholder={t("0,00")} /></Field>
              <Button type="button" variant="ghost" size="icon" aria-label={t("Hinzufügen|entfernt einen Eintrag")} className="mb-0.5" onClick={() => updateP2("buergschaften", data.person2Data.buergschaften.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => updateP2("buergschaften", [...data.person2Data.buergschaften, { art: "", betrag: "" }])} className="mt-1">
            <Plus className="h-3 w-3 mr-1" /> {t("Bürgschaft hinzufügen")}
          </Button>
        </div>
      )}
    </div>
  );

  const renderStep6 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">{t("Sonstige Angaben: Angaben Person 1")}</h2>
      <h3 className="font-bold mb-3">{t("Sonstige Angaben")}</h3>
      <p data-sa-fehler={errors.has("mahnverfahren") ? "" : undefined} className={`text-sm mb-3 flex items-start gap-1.5 ${errors.has("mahnverfahren") ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        <span>{t("Bestehen oder bestanden in den letzten zehn Jahren Mahnverfahren oder Zahlungsklagen, Zwangsvollstreckungen, Verfahren zur Abgabe der eidesstattlichen Versicherung, Insolvenzverfahren?")} <span className="text-destructive">*</span></span>
        <FeldInfo text="Gemeint sind offizielle Verfahren wegen unbezahlter Forderungen. Eine einzelne Mahnung eines Händlers zählt nicht. Im Zweifel Ja wählen und die Situation im Hinweisfeld kurz erklären." />{istUebernommen("mahnverfahren") && <UebernommenMarke />}
      </p>
      <RadioGroup value={data.mahnverfahren} onValueChange={v => { update("mahnverfahren", v); clearError("mahnverfahren"); }} className={cn("flex gap-4 mb-6", errors.has("mahnverfahren") && "[&_button]:border-destructive", istUebernommen("mahnverfahren") && UEBERNOMMEN_RAHMEN)}>
        <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" id="mv-j" /><label htmlFor="mv-j" className="text-sm">{t("Ja")}</label></div>
        <div className="flex items-center gap-1.5"><RadioGroupItem value="nein" id="mv-n" /><label htmlFor="mv-n" className="text-sm">{t("Nein")}</label></div>
      </RadioGroup>

      <p data-sa-fehler={errors.has("schufaBekannt") ? "" : undefined} className={`text-sm mb-3 flex items-start gap-1.5 ${errors.has("schufaBekannt") ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        <span>{t("Ist Ihnen Ihr aktuell Schufa Score bekannt?")} <span className="text-destructive">*</span></span>
        <FeldInfo text="Den eigenen Score zeigt zum Beispiel die kostenlose Datenkopie der Schufa. Wer ihn nicht kennt, wählt einfach Nein." />{istUebernommen("schufaBekannt") && <UebernommenMarke />}
      </p>
      <RadioGroup value={data.schufaBekannt} onValueChange={v => { update("schufaBekannt", v); clearError("schufaBekannt"); }} className={cn("flex gap-4 mb-4", errors.has("schufaBekannt") && "[&_button]:border-destructive", istUebernommen("schufaBekannt") && UEBERNOMMEN_RAHMEN)}>
        <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" id="sf-j" /><label htmlFor="sf-j" className="text-sm">{t("Ja")}</label></div>
        <div className="flex items-center gap-1.5"><RadioGroupItem value="nein" id="sf-n" /><label htmlFor="sf-n" className="text-sm">{t("Nein")}</label></div>
      </RadioGroup>
      {data.schufaBekannt === "ja" && (
        <Field label="Schufa Score" className="max-w-xs mb-4" required filled={!!data.schufaScore.trim()} uebernommen={istUebernommen("schufaScore")}><Input value={data.schufaScore} onChange={e => update("schufaScore", e.target.value)} /></Field>
      )}

      <Field label="Hinweise / Erklärungen / Angaben" uebernommen={istUebernommen("hinweise")}>
        <Textarea value={data.hinweise} onChange={e => update("hinweise", e.target.value)} rows={5} />
      </Field>

      {/* ── Person 2 Sonstige Angaben ── */}
      {data.person2 && (
        <div className="mt-8 pt-6 border-t-2 border-primary/30">
          <h2 className="text-xl font-bold mb-4 text-primary">{t("Sonstige Angaben: Angaben Person 2")}</h2>
          <p data-sa-fehler={errors.has("p2_mahnverfahren") ? "" : undefined} className={`text-sm mb-3 ${errors.has("p2_mahnverfahren") ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {t("Bestehen oder bestanden in den letzten zehn Jahren Mahnverfahren oder Zahlungsklagen, Zwangsvollstreckungen, Verfahren zur Abgabe der eidesstattlichen Versicherung, Insolvenzverfahren?")} <span className="text-destructive">*</span>
          </p>
          <RadioGroup value={data.person2Data.mahnverfahren} onValueChange={v => { updateP2("mahnverfahren", v); clearError("p2_mahnverfahren"); }} className={cn("flex gap-4 mb-6", errors.has("p2_mahnverfahren") && "[&_button]:border-destructive", istUebernommen("person2Data.mahnverfahren") && UEBERNOMMEN_RAHMEN)}>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" id="mv-j-p2" /><label htmlFor="mv-j-p2" className="text-sm">{t("Ja")}</label></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="nein" id="mv-n-p2" /><label htmlFor="mv-n-p2" className="text-sm">{t("Nein")}</label></div>
          </RadioGroup>

          <p data-sa-fehler={errors.has("p2_schufaBekannt") ? "" : undefined} className={`text-sm mb-3 ${errors.has("p2_schufaBekannt") ? "text-destructive font-medium" : "text-muted-foreground"}`}>{t("Ist Ihnen Ihr aktueller Schufa Score bekannt?")} <span className="text-destructive">*</span></p>
          <RadioGroup value={data.person2Data.schufaBekannt} onValueChange={v => { updateP2("schufaBekannt", v); clearError("p2_schufaBekannt"); }} className={cn("flex gap-4 mb-4", errors.has("p2_schufaBekannt") && "[&_button]:border-destructive", istUebernommen("person2Data.schufaBekannt") && UEBERNOMMEN_RAHMEN)}>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" id="sf-j-p2" /><label htmlFor="sf-j-p2" className="text-sm">{t("Ja")}</label></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="nein" id="sf-n-p2" /><label htmlFor="sf-n-p2" className="text-sm">{t("Nein")}</label></div>
          </RadioGroup>
          {data.person2Data.schufaBekannt === "ja" && (
            <Field label="Schufa Score" className="max-w-xs mb-4" uebernommen={istUebernommen("person2Data.schufaScore")}><Input value={data.person2Data.schufaScore} onChange={e => updateP2("schufaScore", e.target.value)} /></Field>
          )}
        </div>
      )}
    </div>
  );

  const handleAbschluss = useCallback(async () => {
    if (!confirmed) return;
    // Die Kreditpflicht und die Bonitaetsfragen auch beim Absenden, falls seit
    // dem letzten Weiter etwas geaendert wurde. Alte Daten greifen erst hier,
    // nicht beim Laden.
    if (!pruefeSchritte([3, 4, 6])) return;
    setSending(true);
    try {
      update("abgeschlossen", true);
      /*
       * Mit dem Absenden ist die Vorbelegung erledigt. Was hier hinausgeht,
       * ist die eigene Selbstauskunft dieses Investments, gleich woher die
       * Werte urspruenglich kamen. Woher sie kamen, bleibt als Vermerk
       * stehen, offene Abschnitte gibt es aber keine mehr.
       */
      setData((prev) =>
        prev.vorbelegung
          ? { ...prev, vorbelegung: { ...prev.vorbelegung, offeneAbschnitte: [], felder: [] } }
          : prev,
      );
      // Derselbe Stand fuer alle Wege hinaus. `data` in dieser Funktion ist
      // der Stand beim Klick und kennt die beiden Aenderungen oben noch nicht.
      const abschlussData: SelbstauskunftData = {
        ...data,
        abgeschlossen: true,
        ...(data.vorbelegung
          ? { vorbelegung: { ...data.vorbelegung, offeneAbschnitte: [], felder: [] } }
          : {}),
      };
      const kunde = getKontaktById(kundeId);

      if (kunde) {
        const { updateKontakt } = await import("@/lib/kundenStore");
        /*
         * Hier wurden frueher saemtliche Betraege eingesammelt und zusaetzlich
         * an den Kontakt geschrieben. Das ist entfallen: Zahlen gehoeren zum
         * Vorgang und liegen am Investment. Uebrig bleibt, wer mitkauft.
         */
        const person2Update = data.person2 && data.person2Data.vorname ? {
          anrede: data.person2Data.anrede,
          vorname: data.person2Data.vorname,
          nachname: data.person2Data.nachname,
          geburtsdatum: data.person2Data.geburtsdatum,
          email: data.person2Data.email,
          telefon: data.person2Data.telefon || data.person2Data.mobilfunk,
          strasse: data.person2Data.strasse,
          hausnummer: data.person2Data.hausnummer,
          plz: data.person2Data.plz,
          ort: data.person2Data.ort,
          steuerId: data.person2Data.steuerId || "",
        } : undefined;

        updateKontakt(kundeId, {
          status: kunde.status === "neu" ? "kontaktiert" : kunde.status as any,
          anrede: data.anrede || kunde.anrede,
          vorname: data.vorname || kunde.vorname,
          nachname: data.nachname || kunde.nachname,
          geburtstag: data.geburtsdatum || kunde.geburtstag,
          strasse: data.strasse || kunde.strasse,
          hausnummer: data.hausnummer || kunde.hausnummer,
          plz: data.plz || kunde.plz,
          ort: data.ort || kunde.ort,
          telefon: data.telefon || data.mobilfunk || kunde.telefon,
          email: data.email || kunde.email,
          steuerId: data.steuerId || (kunde as any).steuerId || "",
          /*
           * Einkuenfte und Ausgaben werden bewusst NICHT mehr an den Kontakt
           * kopiert (Entscheidung Christian, 10.09.2026). Sie gehoeren zum
           * Vorgang und liegen am Investment in `meta.saData`. Am Kontakt
           * haetten sie kein Datum und keinen Bezug, und ein zweiter Kauf
           * haette mit den Zahlen des ersten gerechnet. In die Stammdaten
           * gehen nur Name, Anschrift und wer mitkauft.
           */
          ...(person2Update ? { person2: person2Update } : {}),
        });
      }

      // Build list of persons who need to sign
      const persons: { name: string; email: string; personType: string }[] = [];
      const p1Email = kunde?.email || data.email;
      const p1Name = `${kunde?.vorname || data.vorname} ${kunde?.nachname || data.nachname}`;
      if (p1Email) {
        persons.push({ name: p1Name, email: p1Email, personType: "person1" });
      }
      // Person 2: E-Mail ist optional – fällt automatisch auf die E-Mail von Person 1 zurück
      const p2EffectiveEmail = data.person2Data.email?.trim() || p1Email || "";
      if (data.person2 && data.person2Data.vorname && p2EffectiveEmail) {
        persons.push({
          name: `${data.person2Data.vorname} ${data.person2Data.nachname}`,
          email: p2EffectiveEmail,
          personType: "person2",
        });
      }

      // Get investmentId from prop or URL params
      const investmentId = propInvestmentId || new URLSearchParams(window.location.search).get("investmentId") || "";

      if (customerMode) {
        // ── Customer Mode: inline signature flow ──
        const sigP1 = canvasP1Ref.current?.toDataURL("image/png");
        if (!sigP1 || !p1HasDrawn) {
          toast({ title: t("Unterschrift fehlt"), description: t("Bitte unterschreiben Sie im Feld für Person 1."), variant: "destructive" });
          setSending(false);
          return;
        }

        const hasP2 = data.person2 && data.person2Data.vorname;
        const p2NeedsInline = hasP2 && p2SignMode === "inline";
        const p2NeedsEmail = hasP2 && p2SignMode === "email";

        if (p2NeedsInline && (!p2HasDrawn || !canvasP2Ref.current)) {
          toast({ title: t("Unterschrift fehlt"), description: t("Bitte unterschreiben Sie im Feld für Person 2."), variant: "destructive" });
          setSending(false);
          return;
        }

        // Bis zur Antwort des Servers bleibt der Stand in diesem Tab gesichert.
        const finalData = abschlussData;
        saveSA(kundeId, finalData, investmentId || undefined, true);

        // Build inline signatures array
        const signaturesPayload: { personType: string; name: string; email: string; signatureData: string; userAgent: string }[] = [];
        signaturesPayload.push({
          personType: "person1",
          name: p1Name,
          email: p1Email || data.email,
          signatureData: sigP1,
          userAgent: navigator.userAgent,
        });

        if (p2NeedsInline) {
          const sigP2 = canvasP2Ref.current!.toDataURL("image/png");
          signaturesPayload.push({
            personType: "person2",
            name: `${data.person2Data.vorname} ${data.person2Data.nachname}`,
            email: p2EffectiveEmail,
            signatureData: sigP2,
            userAgent: navigator.userAgent,
          });
        }

        const p2ViaEmailPayload = p2NeedsEmail ? {
          name: `${data.person2Data.vorname} ${data.person2Data.nachname}`,
          email: p2EffectiveEmail,
        } : undefined;

        const { data: result, error: fnErr } = await supabase.functions.invoke("submit-sa-signature", {
          body: {
            token: saToken,
            kontaktId: kundeId,
            investmentId,
            saData: finalData,
            signatures: signaturesPayload,
            p2ViaEmail: p2ViaEmailPayload,
          },
        });

        if (fnErr || !result?.success) {
          console.error("Submit SA signature error:", fnErr, result);
          toast({ title: t("Fehler"), description: t("Unterschrift konnte nicht gespeichert werden."), variant: "destructive" });
          setSending(false);
          return;
        }

        // Eingereicht: Auf diesem Geraet bleibt nichts zurueck.
        eingereicht.current = true;
        loescheLokalenSaEntwurf(kundeId, investmentId);

        /*
         * Ehrlich bleiben, wenn die Mail an Person 2 nicht hinausging.
         *
         * Bis zum 16.09.2026 stand hier in jedem Fall "Person 2 erhält eine
         * E-Mail". Ob sie wirklich versendet wurde, hat niemand geprüft: Der
         * Aufruf scheiterte sogar regelmäßig an einer fehlenden Anmeldung, und
         * der Fehlschlag landete nur im Protokoll. Person 2 wartete dann auf
         * eine Mail, die nie kommen konnte, und keiner wusste davon.
         *
         * `p2Mail` ist `null` oder fehlt, wenn gar keine Mail vorgesehen war
         * oder die Edge Function den alten Stand hat. Dann bleibt es beim
         * bisherigen Verhalten, gewarnt wird nur bei einem echten Fehlschlag.
         */
        /*
         * Alle haben hier unterschrieben: Das vollständige PDF gehört ans
         * Investment. Es entsteht in diesem Fenster und geht an
         * `finalize-selbstauskunft`, das es ablegt. Gewartet wird, weil der
         * Kunde die Seite nach der Meldung schließen darf. Scheitert es,
         * bleibt die Unterschrift gültig, und das Kundenprofil holt die Datei
         * beim nächsten Öffnen nach.
         */
        if (result.allSigned && investmentId && saToken) {
          const ablage = await legeSaPdfNachFormularAb({ investmentId, kontaktId: kundeId, saFillToken: saToken, sprache });
          if (!ablage.abgelegt) console.error("Selbstauskunft-PDF nicht abgelegt:", ablage.grund);
        }

        const p2Mail = result.p2Mail as { versendet?: boolean; grund?: string | null } | null | undefined;
        const p2MailFehler = p2NeedsEmail && p2Mail && p2Mail.versendet !== true
          ? String(p2Mail.grund || t("kein Grund vom Server erhalten"))
          : null;

        if (p2MailFehler) {
          const p2Name = `${data.person2Data.vorname ?? ""} ${data.person2Data.nachname ?? ""}`.trim()
            || t("die zweite Person");
          /*
           * Der technische Grund gehört dazu. Er ist unschön, aber er ist das
           * Einzige, was der Kunde weitergeben kann, wenn der Versandweg
           * klemmt. Vorbild ist die Fehlermeldung im BugReportDialog.
           */
          await hinweisDialog({
            title: t("Die E-Mail an Person 2 ging nicht hinaus"),
            description: t(
              "Ihre Unterschrift ist gespeichert, daran geht nichts verloren. "
              + "Nur die E-Mail mit dem Unterschriftslink an {name} konnte nicht versendet werden.\n\n"
              + "Bitte melden Sie sich kurz bei Ihrem Berater und geben Sie diesen Grund weiter: "
              + "{grund}\n\n"
              + "Er kann die Anfrage dann von Hand erneut verschicken.",
              { name: p2Name, grund: p2MailFehler },
            ),
            buttonText: t("Verstanden"),
          });
        } else if (result.allSigned) {
          toast({ title: t("Selbstauskunft abgeschlossen ✓"), description: t("Alle Unterschriften sind eingegangen. Das PDF wird erstellt.") });
        } else if (p2NeedsEmail) {
          toast({ title: t("Unterschrift Person 1 gespeichert ✓"), description: t("Person 2 erhält eine E-Mail mit dem Link zur Unterschrift.") });
        }

        onComplete?.();
      } else {
        // ── Advisor Mode: send signature requests via email ──
        if (persons.length === 0) {
          toast({ title: t("Fehler"), description: t("Keine E-Mail-Adresse hinterlegt."), variant: "destructive" });
          setSending(false);
          return;
        }

        // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
        await stelleKundenspracheSicher(kundeId);
        const { data: result, error: fnError } = await supabase.functions.invoke("send-signature-request", {
          body: {
            kontaktId: kundeId,
            investmentId,
            saData: abschlussData,
            /*
             * Ohne E-Mail-Adresse. Die Function ermittelt sie seit dem
             * 16.09.2026 selbst aus dem gespeicherten Kontakt und ignoriert
             * eine mitgeschickte Adresse (Audit-Befund F03A). Die Adressen
             * oben bleiben trotzdem stehen: Sie entscheiden, wer überhaupt
             * unterschreiben soll, und werden direkt darüber über
             * `updateKontakt` am Kontakt gespeichert.
             */
            persons: persons.map(p => ({ name: p.name, personType: p.personType })),
          },
        });

        if (fnError) {
          console.error("Signature request error:", fnError);
          toast({ title: t("Fehler"), description: t("Signaturanfrage konnte nicht gesendet werden."), variant: "destructive" });
          setSending(false);
          return;
        }

        const sentCount = result?.results?.filter((r: any) => r.sent).length || 0;
        const totalCount = persons.length;

        /*
         * Ging keine einzige Mail hinaus, ist das kein Erfolg.
         *
         * Bisher stand hier immer "Unterschrift angefordert", auch bei 0 von 1.
         * Gemeldet bei Kai Laube: Der Versand scheiterte still, und im CRM sah
         * alles erledigt aus. Der Grund kommt jetzt aus der Function mit.
         */
        if (sentCount === 0) {
          const gruende = (result?.results || [])
            .map((r: any) => r.grund).filter(Boolean);
          toast({
            title: t("Keine E-Mail versendet"),
            description: gruende.length
              ? t("Die Anfrage wurde angelegt, aber nicht zugestellt: {gruende}. Der Unterschriftslink lässt sich über die Kundenakte erneut senden.", { gruende: gruende.join(", ") })
              : t("Die Anfrage wurde angelegt, aber es ging keine E-Mail hinaus. Bitte die Adresse prüfen."),
            variant: "destructive",
          });
          setSending(false);
          return;
        }

        toast({
          title: t("Unterschrift angefordert"),
          description: sentCount < totalCount
            ? t("{versendet} von {gesamt} Signaturanfragen versendet. Bei den übrigen ist der Versand fehlgeschlagen.", { versendet: sentCount, gesamt: totalCount })
            : totalCount > 1
              ? t("{versendet}/{gesamt} Signaturanfragen per E-Mail versendet.", { versendet: sentCount, gesamt: totalCount })
              : t("{versendet}/{gesamt} Signaturanfrage per E-Mail versendet.", { versendet: sentCount, gesamt: totalCount }),
          variant: sentCount < totalCount ? "destructive" : undefined,
        });

        /*
         * Der Versand zur Unterschrift gehoert in die Kundenakte.
         *
         * Bisher blieb davon nur die Bildschirmmeldung oben, und die ist nach
         * ein paar Sekunden weg. In der Akte stand nirgends, dass die
         * Selbstauskunft beim Kunden liegt und auf seine Unterschrift wartet.
         *
         * Genau ein Eintrag je Vorgang, auch bei zwei Kaeufern: Der Aufruf von
         * `send-signature-request` oben schickt alle Personen in EINEM Aufruf,
         * es gibt hier also nur einen Durchlauf.
         *
         * Verfasser ist der angemeldete Berater, denn hier hat ein Mensch
         * gehandelt. `addAktivitaet` setzt ihn von selbst ein.
         */
        if (kundeId) {
          addAktivitaet({
            kundeId,
            art: "notiz",
            beschreibung: versandNotiz("sa").text,
          });
        }

        const finalData = abschlussData;
        saveSA(kundeId, finalData, investmentId || undefined);
        if (investmentId) setSaData(investmentId, finalData);
        // Der Stand liegt am Investment; der geraetelokale Entwurf wird nicht
        // mehr gebraucht. Die Nutzereinstellungen bleiben unberuehrt.
        eingereicht.current = true;
        setUngespeichert(false);
        loescheLokalenSaEntwurf(kundeId, investmentId);
        onComplete?.();
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: t("Fehler"), description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [confirmed, data, kundeId, onComplete, toast, update, propInvestmentId, customerMode, p1HasDrawn, p2HasDrawn, p2SignMode, t, pruefeSchritte]);

  // ─── Render: Inline Signature Canvas Component ───
  const renderSignatureCanvas = (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    handlers: ReturnType<typeof makeDrawHandlers>,
    hasDrawn: boolean,
    label: string,
  ) => (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium flex items-center gap-1.5">✍️ {label}</label>
        {hasDrawn && (
          <Button variant="ghost" size="sm" onClick={handlers.clearCanvas} className="h-7 text-xs gap-1">
            <X className="h-3 w-3" /> {t("Löschen")}
          </Button>
        )}
      </div>
      <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white touch-none">
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          className="w-full cursor-crosshair"
          onMouseDown={handlers.startDraw}
          onMouseMove={handlers.draw}
          onMouseUp={handlers.stopDraw}
          onMouseLeave={handlers.stopDraw}
          onTouchStart={handlers.startDraw}
          onTouchMove={handlers.draw}
          onTouchEnd={handlers.stopDraw}
        />
      </div>
      {!hasDrawn && (
        <p className="text-xs text-muted-foreground mt-1.5 text-center">{t("Bitte unterschreiben Sie im Feld oben (Maus oder Finger)")}</p>
      )}
    </div>
  );

  /*
   * Der deutsche Wortlaut eines Rechtstexts, aufklappbar unter der englischen
   * Fassung. Deutsch ist maßgeblich (Plan Kundensprache, Entscheidung 6), der
   * Kunde soll ihn deshalb mit einem Klick lesen können.
   */
  const deutscherWortlaut = (text: string) => (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer text-primary underline-offset-2 hover:underline">{DEUTSCHES_ORIGINAL_ZEIGEN}</summary>
      <p lang="de" className="mt-1.5 border-l-2 border-border pl-3 text-muted-foreground leading-relaxed">{text}</p>
    </details>
  );

  /*
   * Die Erklärung über der Unterschrift, nur auf Englisch sichtbar.
   *
   * Auf Deutsch steht sie wie bisher erst im PDF über den Unterschriften. Ein
   * englischer Kunde bekommt sie schon hier zu lesen, bevor er unterschreibt,
   * und zwar zweisprachig mit deutschem Vorrang: Englisch führt, der deutsche
   * Wortlaut ist aufklappbar, die Vorrangklausel steht in beiden Sprachen da.
   */
  const renderErklaerungEnglisch = () => (
    <div className="mt-6 rounded-lg border bg-background p-4 space-y-3" data-testid="sa-erklaerung-en">
      <h4 className="font-semibold text-sm">Declaration</h4>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{ZWEISPRACHIG_EINLEITUNG.en}</p>
        <p lang="de">{ZWEISPRACHIG_EINLEITUNG.de}</p>
      </div>
      <div>
        <p className="text-xs leading-relaxed">{SA_ERKLAERUNG.en}</p>
        {deutscherWortlaut(SA_ERKLAERUNG.de)}
      </div>
      <div>
        <p className="text-xs leading-relaxed">{SA_SCHUFA_KLAUSEL.en}</p>
        {deutscherWortlaut(SA_SCHUFA_KLAUSEL.de)}
      </div>
    </div>
  );

  const renderStep7 = () => {
    if (korrekturMode) {
      return (
        <div>
          <h2 className="text-xl font-bold mb-6">{t("Korrekturen übernehmen")}</h2>
          <div className="border-2 border-primary/40 bg-primary/5 rounded-xl p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("Bitte prüfen Sie Ihre Änderungen. Mit dem Klick auf „Korrekturen übernehmen“ wird die Selbstauskunft aktualisiert. Anschließend sehen Sie die neue Fassung als PDF und können sie unterschreiben.")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("Hinweis: Hat die zweite Person bereits unterschrieben, wird diese Unterschrift zurückgesetzt und die Person automatisch erneut zur Unterschrift eingeladen.")}
            </p>
            {sprache === "en" && renderErklaerungEnglisch()}
            <Button
              className="w-full gap-2"
              disabled={korrekturSaving}
              onClick={async () => {
                if (!pruefeSchritte([3, 4, 6])) return;
                setKorrekturSaving(true);
                try {
                  await onKorrekturSave?.(data);
                } finally {
                  setKorrekturSaving(false);
                }
              }}
            >
              {korrekturSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("Korrekturen übernehmen")}
            </Button>
          </div>
        </div>
      );
    }
    const kunde = prefillKontakt || getKontaktById(kundeId);
    const p1Email = (kunde as any)?.email || data.email;
    const p1Name = `${(kunde as any)?.vorname || data.vorname} ${(kunde as any)?.nachname || data.nachname}`;
    const hasP2 = data.person2 && data.person2Data.vorname;
    const p2Name = hasP2 ? `${data.person2Data.vorname} ${data.person2Data.nachname}` : "";
    const p2EmailRaw = data.person2Data?.email?.trim() || "";
    const p2Email = p2EmailRaw || p1Email || "";
    const p2UsesP1Email = !p2EmailRaw && !!p1Email;

    if (customerMode) {
      // ── Customer Mode: inline signatures ──
      return (
        <div>
          <h2 className="text-xl font-bold mb-6">{t("Abschluss & Unterschrift")}</h2>
          <div className="border-2 border-primary/40 bg-primary/5 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg">{t("Selbstauskunft vollständig ausgefüllt")}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("Alle Angaben wurden erfasst. Bitte unterschreiben Sie unten und bestätigen Sie Ihre Angaben.")}
                  {hasP2 ? ` ${t("Beide Personen müssen unterschreiben, damit das PDF erstellt wird.")}` : ""}
                </p>

                {/* Person 1 Signature */}
                <div className="mt-6 p-4 bg-background border rounded-lg">
                  <h4 className="font-semibold text-sm mb-1">{t("Person 1")}: {p1Name}</h4>
                  <p className="text-xs text-muted-foreground">{p1Email}</p>
                  <div className="md:flex md:gap-4 md:items-start">
                    <div className="flex-1">
                      {renderSignatureCanvas(canvasP1Ref as React.RefObject<HTMLCanvasElement>, p1Draw, p1HasDrawn, t("Unterschrift Person 1"))}
                    </div>
                    {mobileSigUrlP1 && (
                      <div className="flex flex-col items-center justify-center mt-4 p-3 border rounded-lg bg-muted/30 w-full md:w-[160px]">
                        <Smartphone className="h-4 w-4 text-muted-foreground mb-1" />
                        <div className="bg-white p-1.5 rounded">
                          <QRCodeSVG value={mobileSigUrlP1} size={104} level="M" />
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center mt-2 leading-tight">
                          {t("Scannen Sie den QR-Code, um bequem mit dem Finger am Handy zu unterschreiben.")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Person 2 */}
                {hasP2 && (
                  <div className="mt-4 p-4 bg-background border rounded-lg">
                    <h4 className="font-semibold text-sm mb-1">{t("Person 2")}: {p2Name}</h4>
                    <p className="text-xs text-muted-foreground mb-3">{p2Email}</p>

                    <div className="flex gap-2 mb-3">
                      <Button
                        size="sm"
                        variant={p2SignMode === "inline" ? "default" : "outline"}
                        onClick={() => setP2SignMode("inline")}
                        className="text-xs"
                      >
                        {t("✍️ Jetzt hier unterschreiben")}
                      </Button>
                      <Button
                        size="sm"
                        variant={p2SignMode === "email" ? "default" : "outline"}
                        onClick={() => setP2SignMode("email")}
                        className="text-xs"
                      >
                        {t("📧 Per E-Mail senden")}
                      </Button>
                    </div>

                    {p2SignMode === "inline" && renderSignatureCanvas(canvasP2Ref as React.RefObject<HTMLCanvasElement>, p2Draw, p2HasDrawn, t("Unterschrift Person 2"))}
                    {p2SignMode === "inline" && mobileSigUrlP2 && (
                      <div className="flex flex-col items-center justify-center mt-3 p-3 border rounded-lg bg-muted/30 w-full md:max-w-[200px]">
                        <Smartphone className="h-4 w-4 text-muted-foreground mb-1" />
                        <div className="bg-white p-1.5 rounded">
                          <QRCodeSVG value={mobileSigUrlP2} size={104} level="M" />
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center mt-2 leading-tight">
                          {t("Scannen Sie den QR-Code, um bequem mit dem Finger am Handy zu unterschreiben.")}
                        </p>
                      </div>
                    )}
                    {p2SignMode === "email" && (
                      <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
                        <Send className="h-4 w-4 inline mr-1.5" />
                        {t("Person 2 erhält nach Ihrer Unterschrift eine E-Mail mit einem Link zur digitalen Unterschrift an")} <strong>{p2Email}</strong>.
                      </div>
                    )}
                  </div>
                )}

                {/* Erklärung, auf Englisch zweisprachig mit deutschem Vorrang */}
                {sprache === "en" && renderErklaerungEnglisch()}

                {/*
                  Consent. Der Wortlaut kommt aus `SA_EINWILLIGUNG`, auf Deutsch
                  zeichengleich mit dem bisherigen Text. Der deutsche Wortlaut
                  steht auf Englisch außerhalb des Labels, sonst setzte ein Klick
                  auf „Show German original“ zugleich den Haken.
                */}
                <div className="mt-6 bg-muted/30 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(!!v)} id="confirm-sa" className="mt-0.5" />
                    <label htmlFor="confirm-sa" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                      {SA_EINWILLIGUNG[sprache]}
                    </label>
                  </div>
                  {sprache === "en" && <div className="pl-7">{deutscherWortlaut(SA_EINWILLIGUNG.de)}</div>}
                </div>

                <Button
                  className="mt-4 w-full"
                  disabled={!confirmed || sending || !p1HasDrawn || (hasP2 && p2SignMode === "inline" && !p2HasDrawn)}
                  onClick={handleAbschluss}
                >
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {sending ? t("Wird gespeichert…") : t("Unterschreiben & einreichen")}
                </Button>

                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  {t("Ihre Daten werden verschlüsselt übertragen und DSGVO-konform gespeichert.")}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Advisor Mode: signature request via email ──
    return (
      <div>
        <h2 className="text-xl font-bold mb-6">{t("Abschluss & Unterschrift anfordern")}</h2>
        <div className="border-2 border-primary/40 bg-primary/5 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-lg">{t("Selbstauskunft vollständig ausgefüllt")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("Alle Angaben wurden erfasst. Mit der Bestätigung wird eine Signaturanfrage per E-Mail an alle beteiligten Personen versendet. Nach Eingang aller Unterschriften wird das PDF automatisch erstellt und unter Bonitätsunterlagen gespeichert.")}
              </p>

              <div className="bg-muted rounded-lg p-3 mt-4 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Send className="h-3 w-3 text-primary" />
                  <span className="font-medium">{t("Person 1")}:</span> {p1Name} ({p1Email || t("keine E-Mail")})
                </div>
                {hasP2 && (
                  <div className="flex items-center gap-2">
                    <Send className="h-3 w-3 text-primary" />
                    <span className="font-medium">{t("Person 2")}:</span> {p2Name} ({p2Email})
                  </div>
                )}
              </div>

              {!p1Email && (
                <p className="text-xs text-destructive mt-2">{t("⚠ Person 1 hat keine E-Mail-Adresse. Bitte zuerst ergänzen.")}</p>
              )}
              {hasP2 && p2UsesP1Email && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("Person 2 hat keine eigene E-Mail – der Unterschrifts-Link geht an die E-Mail von Person 1 ({email}).", { email: p1Email })}
                </p>
              )}
              {hasP2 && !p2Email && (
                <p className="text-xs text-destructive mt-1">{t("⚠ Weder Person 1 noch Person 2 haben eine E-Mail-Adresse. Bitte zuerst ergänzen.")}</p>
              )}

              <div className="flex items-center gap-2 mt-4">
                <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(!!v)} id="confirm-sa" />
                <label htmlFor="confirm-sa" className="text-sm">
                  {t("Ich bestätige die Richtigkeit aller Angaben und möchte die Unterschrift anfordern.")}
                </label>
              </div>

              <Button
                variant="brand"
                className="mt-4"
                disabled={!confirmed || sending || (!isEditMode && data.abgeschlossen) || !p1Email}
                onClick={handleAbschluss}
              >
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {data.abgeschlossen && !isEditMode ? t("Bereits versendet") : isEditMode ? t("Erneut Unterschrift anfordern") : t("Unterschrift anfordern")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const schritte = STEPS.map((s) => t(s));
  const stepRenderers = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];

  return (
    <SaSprache.Provider value={sprache}>
    <VorbelegungHerkunft.Provider value={vorbelegung?.ausInvestment ?? null}>
    <>
    {/*
      Hoehenkette fuer die Knopfleiste.

      `sticky bottom-0` klebt nur, solange oberhalb noch etwas zu scrollen ist.
      Bei kurzen Abschnitten (Ausgaben, Vermoegenswerte) war der Inhalt
      kuerzer als der Bildschirm, und die Leiste rutschte mit dem Inhaltsende
      nach oben. Deshalb fuellt der Rahmen jetzt mindestens die Hoehe des
      Scrollbereichs (`min-h-full`), und die Karte darin waechst mit
      (`flex-1`). Der freie Platz bleibt weiss, die Leiste steht immer unten.
    */}
    {/*
      Aufbau: aussen ein Rahmen ueber die volle Hoehe, darin die Karte als
      einziger Scrollbereich, darunter die Knopfleiste.

      Vorher lag der Scrollbereich aussen und die Leiste klebte per `sticky`
      am Ende des Inhalts. Bei kurzen Abschnitten (Ausgaben, Vermoegenswerte)
      rutschte sie damit nach oben. Jetzt scrollt nur noch der Karteninhalt,
      die Leiste steht ausserhalb davon und damit immer am unteren Rand,
      unabhaengig von der Laenge des Abschnitts. `min-h-0` ist noetig, damit
      die Karte im Flex-Rahmen schrumpfen darf, sonst waechst sie ueber den
      Bildschirm hinaus und der Scrollbereich landet wieder aussen.
    */}
    <div className="apple-form flex h-full min-h-0 flex-col">
    <Card className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
      {/* Draft loaded hint */}
      {draftSaved && !data.abgeschlossen && (
        <div className="px-6 py-2 bg-primary/5 border-b text-xs text-primary flex items-center gap-2">
          <Save className="h-3.5 w-3.5" />
          {t("Zwischenstand vom {datum} geladen", {
            datum: sprache === "en"
              ? datumUhrzeitText(draftSaved, "en")
              : new Date(draftSaved).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          })}
        </div>
      )}
      {/* Apple-style Fortschrittsbalken */}
      <FormProgress
        eyebrow={t("Selbstauskunft")}
        steps={schritte}
        current={step}
        onJump={async (i) => {
          if (i > step) {
            // Auch die Kreditschritte, die der Sprung ueberspringt: Sonst
            // liesse sich die Pflicht ueber die Leiste umgehen.
            if (!pruefeSchritte([step, ...kreditSchritteDazwischen(step, i)])) return;
            if (step <= 4 && i > 4 && immobilieOhneKreditPersonen(data).length > 0 && !(await immobilieOhneKreditKlaeren())) return;
          }
          setErrors(new Set());
          setStep(i);
        }}
      />

      {/*
        Der Hinweis auf die Uebernahme aus dem vorherigen Investment.
        Er steht einmal oben und bleibt, solange noch ein Abschnitt ungeprueft
        ist. Welche Angabe im Einzelnen uebernommen wurde, steht am Feld
        selbst. Der Wortlaut ist an den Kunden gerichtet, er sieht dasselbe
        Formular im Portal.
      */}
      {zeigeVorbelegung && (
        <div className="px-6 py-3 border-b border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t(SA_VORBELEGUNG_TITEL)}</p>
              <p className="text-xs text-muted-foreground">
                {saVorbelegungTextIn(vorbelegung!.ausInvestment, sprache)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Noch zu prüfen: {abschnitte}", { abschnitte: offeneAbschnitte.map((i) => schritte[i]).join(", ") })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div ref={inhaltRef} className={hinweiseImFormular ? "flex flex-col lg:flex-row gap-0 lg:gap-6" : ""}>
        <div className={hinweiseImFormular ? "min-w-0 flex-1 p-6" : "p-6"}>
          {step > 0 && step < STEPS.length - 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 border border-border/60 rounded-lg px-3 py-2">
              <span className="inline-flex items-center gap-1">
                <span className="text-destructive font-bold">*</span>
                <span className="uppercase tracking-wide font-semibold text-orange-500/90 bg-orange-500/10 border border-orange-400/40 rounded px-1 py-px text-[10px]">{t("Pflicht")}</span>
                = {t("Pflichtfeld")}
              </span>
              <span className="hidden sm:inline">·</span>
              <span>{t("Leere Pflichtfelder sind")} <span className="text-orange-500 font-medium">{t("orange umrandet")}</span>, {t("Fehler")} <span className="text-destructive font-medium">{t("rot")}</span>.</span>
              {zeigeVorbelegung && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="uppercase tracking-wide font-semibold text-accent-foreground bg-accent border border-dashed border-accent-foreground/50 rounded px-1 py-px text-[10px]">{t(SA_FELD_MARKE)}</span>
                    = {t(SA_LEGENDE_UEBERNOMMEN)}
                  </span>
                </>
              )}
              {data.person2 && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{t("Für")} <strong>{t("Person 2")}</strong> {t("sind die persönlichen Angaben (Vor-, Nachname, Geburtsdatum) Pflicht, dazu die Angaben zu eingetragenen Krediten.")}</span>
                </>
              )}
              {/* Nur auf Englisch: Das Formular speichert deutsche Formate, die Eingabe folgt aber der englischen Schreibweise. */}
              {sprache === "en" && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{SA_EN_EINGABEHINWEIS}</span>
                </>
              )}
            </div>
          )}
          {/* Die Markierung genau an dem Abschnitt, dessen Angaben uebernommen
              wurden. Sie verschwindet mit dem Knopf, oder von allein, sobald
              in diesem Abschnitt keine markierte Angabe mehr offen ist. */}
          {zeigeVorbelegung && offeneAbschnitte.includes(step) && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/10 px-3 py-2">
              <Info className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
              <span className="text-xs font-medium">{saAbschnittTextIn(vorbelegung!.ausInvestment, sprache)}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs"
                onClick={() => abschnittBestaetigen(step)}
              >
                {t(SA_ABSCHNITT_BESTAETIGEN)}
              </Button>
            </div>
          )}
          {stepRenderers[step]()}
        </div>
        {/*
          Die Hinweisspalte im Formular.

          Ab 1024 Pixeln steht sie rechts neben dem Formular und bleibt beim
          Scrollen stehen (sticky), weil sie sich immer auf den gerade offenen
          Abschnitt bezieht. Scrollte sie mit, wäre sie genau dann weg, wenn
          der Kunde in den unteren Feldern sitzt und die Hilfe am ehesten
          braucht. Auf schmalen Bildschirmen rutscht sie unter das Formular,
          statt wie früher ganz zu verschwinden.

          Die Kundenseite setzt die Hinweise stattdessen als eigene dritte
          Spalte neben das Formular, dort entfaellt dieser Block. Erkennbar ist
          das an `onHinweisSchritt`.
        */}
        {hinweiseImFormular && (
          <div className="w-full shrink-0 px-6 pb-6 lg:w-72 xl:w-80 lg:p-6 lg:pl-0">
            <SelbstauskunftHinweise schritt={step} className="lg:sticky lg:top-4" sprache={sprache} />
          </div>
        )}
      </div>

      {/*
        Vorfahrt fuer den Kunden. Er sitzt gerade selbst am Formular, also
        gelten seine Angaben. Der Berater darf weiterschauen, sein Tippen
        landet aber nicht mehr im gemeinsamen Stand. Ohne diesen Hinweis
        wuerde er weiterarbeiten und sich spaeter wundern.
      */}
      {kundeWarSchneller && (
        <div className="mx-6 mb-4 rounded-md border border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
            <div className="space-y-1.5 text-sm">
              <p className="font-medium">{t("Der Kunde füllt gerade selbst aus.")}</p>
              <p className="text-muted-foreground">
                {t("Seine Angaben gelten. Ihre Änderungen ab jetzt werden nicht mehr übernommen, damit sie seine Eingaben nicht überschreiben.")}
              </p>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                {t("Stand des Kunden laden")}
              </Button>
            </div>
          </div>
        </div>
      )}

    </Card>

      {/*
        Die Knopfleiste am unteren Rand.

        Sie steht bewusst ausserhalb der Karte: Die Karte ist auf
        "overflow-hidden" gestellt, und darin kann ein Element nicht am
        Fensterrand kleben bleiben. Zusammen mit der Hoehenkette oben
        (min-h-full am Rahmen, flex-1 an der Karte) haftet sie am unteren
        Bildschirmrand, unabhaengig davon, wie lang der Abschnitt ist.
      */}
      <div className="sa-knopfleiste z-30 mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div className="flex items-center gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={prev}>{t("Zurück")}</Button>
          ) : (
            <div />
          )}
        </div>
        <div className="flex items-center gap-2">
          {draftSaved && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {t("Gespeichert: {datum}", {
                datum: sprache === "en"
                  ? datumUhrzeitText(draftSaved, "en")
                  : new Date(draftSaved).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
              })}
            </span>
          )}
          {!korrekturMode && (
          <Button variant="outline" onClick={handleSaveDraft} className="gap-1.5">
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{t("Zwischenspeichern")}</span>
            <span className="sm:hidden">{t("Speichern")}</span>
          </Button>
          )}
          {/*
            Der Ausstieg fuer den Berater, wenn im Termin die Zeit ausgeht.
            Vorher musste er dafuer zurueck in die Kundenakte und dort den
            richtigen Knopf suchen, also genau dann navigieren, wenn es eilt.
          */}
          {!korrekturMode && !customerMode && onAnKundenSenden && (
            <Button
              variant="outline"
              disabled={sendeAnKunden}
              onClick={async () => {
                setSendeAnKunden(true);
                try {
                  await handleSaveDraft();
                  await onAnKundenSenden();
                } finally {
                  setSendeAnKunden(false);
                }
              }}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">
                {sendeAnKunden ? t("Wird gesendet ...") : t("An Kunde senden")}
              </span>
              <span className="sm:hidden">{t("Senden")}</span>
            </Button>
          )}
          {step < STEPS.length - 1 && (
            <Button variant="brand" onClick={tryNext}>{t("Weiter")}</Button>
          )}
        </div>
      </div>
    </div>
    {/* Bestätigung: Person 2 dauerhaft entfernen */}
    <AlertDialog open={showRemoveP2Dialog} onOpenChange={setShowRemoveP2Dialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t("Person 2 dauerhaft entfernen?")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-sm">
            <p>{t("Damit wird Person 2 aus")} <strong>{t("Selbstauskunft|im Satz")}</strong> {t("und")} <strong>{t("Stammdaten")}</strong> {t("gelöscht. Alle bisherigen SA-Unterschriften (Person 1 und Person 2) werden gelöscht, weil die SA sich inhaltlich ändert.")}</p>
            <p>{t("Die Selbstauskunft muss anschließend von Person 1")} <strong>{t("neu unterschrieben")}</strong> {t("werden.")}</p>
            <p className="text-xs text-muted-foreground">{t("Diese Aktion kann nicht rückgängig gemacht werden.")}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removingP2}>{t("Abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); removePerson2Everywhere(); }}
            disabled={removingP2}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {removingP2 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t("Ja, Person 2 entfernen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
    </VorbelegungHerkunft.Provider>
    </SaSprache.Provider>
  );
}
