import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useToast } from "@/hooks/use-toast";
import { Send, Check, AlertTriangle, ArrowLeft } from "lucide-react";
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { stelleKundenspracheSicher, useKundenSprache } from "@/lib/kundenSprache";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { getKontaktById } from "@/lib/kundenStore";
import { reserveWohnung, getObjektById, vormerkeEinheit, vormerkeObjekt, EinheitVergebenFehler } from "@/lib/objekteStore";
import { vormerkMeldung, uhrzeit, VORMERKUNG_MIGRATION_HINWEIS, VORMERKUNG_MIGRATION } from "@/lib/einheitVormerkung";
import {
  anzahlEinheiten,
  hausReservierungFreigeschaltet,
  objektVormerkMeldung,
  OBJEKT_RESERVIERUNG_MIGRATION,
  OBJEKT_RESERVIERUNG_MIGRATION_HINWEIS,
  type ObjektVormerkErgebnis,
} from "@/lib/objektBelegung";
import { useOptionalUser } from "@/contexts/UserContext";
import { updateInvestment, getInvestmentsByKontakt, setInvestmentMetaFields, getInvestmentMetaField, investmentGespeichert } from "@/lib/investmentsStore";
import { darfReservierungStarten } from "@/lib/reservierungStart";
import { RV_OHNE_INVESTMENT, RV_SA_FEHLT } from "../../../supabase/functions/_shared/reservierung-voraussetzungen.ts";
import { vorhandeneObjektDaten, hatBestandsWohnung } from "@/lib/objektDatenPflicht";
import { verkaeuferArt, type VerkaeuferArt } from "@/lib/verkaeuferName";
import { zahlAusText, textAusZahl } from "@/lib/zahlAusText";
import {
  NOTAR_HINWEIS,
  VEREINBARUNG_EINLEITUNG,
  DATENSCHUTZ_EINVERSTAENDNIS,
  WIDERRUFSBELEHRUNG,
  WIDERRUF_WAHL_TITEL,
  WIDERRUF_WAHL_EINLEITUNG,
  AUFTEILUNG_AUSWAHL,
  KAUFGEGENSTAND_GESAMTOBJEKT,
  gebuehrAbschnitt,
  objektEinleitung,
  preisBeschriftung,
  reservierungTexte,
  textFassungEn,
  vertragsAufbau,
  vertragsOptionenAus,
  type AufteilungWert,
  type VertragsSprache,
} from "@/lib/reservierungErklaerung";
import { ZWEISPRACHIG_EINLEITUNG } from "@/lib/zweisprachig";
import { stelleDolmetscherAufgabeSicher } from "@/lib/dolmetscherAufgabe";
import { updateKontakt } from "@/lib/kundenStore";
import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { versandNotiz } from "@/lib/prozessNotizen";
import { addDocNotification } from "@/lib/notificationStore";
import { supabase } from "@/integrations/supabase/client";
import { PhoneInput } from "@/components/ui/phone-input";
import { FormProgress } from "@/components/ui/form-progress";
import { rueckweg, rueckwegBeschriftung } from "@/lib/reservierungRueckweg";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { versandErgebnisLesen, type VersandErgebnis } from "@/lib/versandErgebnis";
import { hatGueterstand } from "@/lib/familienstand";

/* ── Formatting helpers ── */
function formatTausender(raw: string): string {
  const cleaned = raw.replace(/\./g, "").replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.length > 1 ? `${intPart},${parts[1]}` : intPart;
}

function plzOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 5);
}

/**
 * IBAN: Großbuchstaben, in Vierergruppen, deutsche IBAN mit 22 Zeichen.
 *
 * Eingetippt wird sie in jeder Schreibweise, mal mit, mal ohne Leerzeichen.
 * Gespeichert und gedruckt wird sie in Vierergruppen, so wie sie auf jeder
 * Bankkarte steht; das ist die Form, die sich beim Abtippen am wenigsten
 * verliest. Die Begrenzung ist dieselbe wie in der Selbstauskunft:
 * 22 Zeichen, mit Leerzeichen 27.
 */
export function ibanEingabe(raw: string): string {
  const zeichen = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 22);
  return zeichen.replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * IBAN-Prüfziffer nach ISO 13616 (Modulo 97).
 *
 * Die ersten vier Zeichen wandern ans Ende, Buchstaben werden zu Zahlen
 * (A = 10 bis Z = 35), die entstehende Zahl muss durch 97 geteilt Rest 1
 * lassen. Damit fallen Vertipper auf, bevor sie ins Dokument laufen.
 * Eine deutsche IBAN hat genau 22 Zeichen.
 */
export function ibanGueltig(raw: string): boolean {
  const iban = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const z of umgestellt) {
    const wert = z >= "0" && z <= "9" ? z : String(z.charCodeAt(0) - 55);
    for (const d of wert) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/**
 * Dasselbe für ein freiwilliges Feld: leer ist in Ordnung, getippt wird geprüft.
 *
 * Seit dem 22.09.2026 ist die IBAN freiwillig. `ibanGueltig("")` sagt nein,
 * und das ist dort auch richtig; wer nur das Sternchen am Feld entfernt hätte,
 * hätte deshalb nichts gewonnen. Leerzeichen zählen nicht als Eingabe, sonst
 * blockiert ein versehentlicher Tastendruck das Formular.
 */
export function ibanLeerOderGueltig(raw: string | null | undefined): boolean {
  const eingabe = (raw || "").trim();
  return eingabe === "" || ibanGueltig(eingabe);
}

/** Die Wahl zum Beginn der Reservierung, siehe Abschnitt 7 des Dokuments. */
export type WiderrufWahlWert = "sofort" | "abwarten" | "";

/** Beim Globalobjekt: Wer kauft? Pflichtwahl ohne Voreinstellung. */
export type KaeuferArt = "privat" | "gesellschaft";

/**
 * Wohneinheit: nur die Zahl, wie im Objektfenster seit 09/2026.
 *
 * Der alte Platzhalter dort hiess "z. B. WE 6", deshalb stand in der
 * Datenbank "WE 14" und in der Objektkarte am Ende "WE WE 14". Dieses
 * Formular schreibt sein Feld in dieselbe Ablage zurueck, also muss es
 * dieselbe Regel haben, sonst kommt der Text von hier wieder herein.
 */
function weNrOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/*
 * Die Auswertung des Versands liegt in `@/lib/versandErgebnis`, seit sie auch
 * das Kundenprofil beim erneuten Zusenden braucht. Sie wird hier weiterhin
 * ausgegeben, damit bestehende Aufrufe und Tests unverändert bleiben.
 */
export { versandErgebnisLesen };
export type { VersandErgebnis };

export interface ReservierungData {
  vorname: string; nachname: string; geburtsdatum: string; staatsangehoerigkeit: string;
  /**
   * Der Geburtsname, wenn er vom heutigen Nachnamen abweicht.
   *
   * Kein Pflichtfeld: Die meisten haben keinen. Der Notar braucht ihn aber,
   * wo es ihn gibt, denn im Grundbuch steht er.
   */
  geburtsname?: string;
  /** Freiwillig. Für den Notar nützlich, nicht zwingend. */
  geburtsort?: string;
  strasse: string; hausnummer: string; plz: string; ort: string;
  telefon: string; email: string; gueterstand: string;
  /**
   * Das Konto, auf das die Reservierungsgebühr zurückfließt.
   *
   * Am 15.09.2026 wurde das Feld Pflicht: Der Text versprach die Rückzahlung
   * „auf das benannte Konto", aber es gab kein Feld dafür, und die Rückzahlung
   * stockte an einer Rückfrage.
   *
   * Seit dem 22.09.2026 ist es wieder freiwillig. Der Grund für die Pflicht
   * ist entfallen, denn der Vertrag regelt den Fall der fehlenden
   * Bankverbindung jetzt selbst (Punkt zur Rückzahlung: Der Kaufinteressent
   * teilt sie dann vor der Beurkundung mit). Eine getippte IBAN wird
   * weiterhin geprüft, siehe `ibanLeerOderGueltig`.
   */
  iban?: string;

  // Person 2
  hatPerson2: boolean;
  p2Vorname: string; p2Nachname: string; p2Geburtsdatum: string; p2Staatsangehoerigkeit: string;
  p2Strasse: string; p2Hausnummer: string; p2Plz: string; p2Ort: string;
  p2Telefon: string; p2Email: string;
  p2Geburtsname?: string;
  p2Geburtsort?: string;
  p2Iban?: string;
  // Objekt
  wohneinheit: string; objStrasse: string; objPlz: string; objOrt: string; gesamtpreis: string;
  /**
   * Dolmetscher zur Beurkundung, siehe Punkt 9. Die Sprache ist Pflicht,
   * sobald der Haken gesetzt ist, sonst weiß das Notariat nicht, wen es
   * bestellen soll.
   */
  dolmetscher?: boolean;
  dolmetscherSprache?: string;
  /**
   * Stellplatz und Garage, jeweils mit ihrer Nummer.
   *
   * Sie gehören zur reservierten Einheit, haben aber eine eigene Nummer und
   * stehen im Kaufvertrag getrennt. Leer heißt: gehört nicht dazu, deshalb
   * erscheinen sie im PDF nur, wenn etwas eingetragen ist.
   */
  stellplatz?: string;
  garage?: string;

  /* ── Globalobjekt, seit dem 23.09.2026 ──
   *
   * Reservierung des ganzen Hauses statt einer Einheit (Entwurf
   * `Reservierung_Globalobjekt_Entwurf_2026-09-23.md`, Teil 2). Alle Felder
   * sind freiwillig im Typ, damit jede ältere Reservierung und jeder Entwurf
   * einer Einzelwohnung unverändert bleibt; Pflicht werden sie erst im Modus
   * „gesamtes Objekt“, siehe `validateRvStep`.
   */
  /** Reservierung eines Globalobjekts. Nur ein ausdrückliches `true` zählt. */
  gesamtobjekt?: boolean;
  /** Privatperson(en) oder Gesellschaft, Pflichtwahl beim Globalobjekt. */
  kaeuferArt?: KaeuferArt | "";
  /** Die Gesellschaft (Tabelle B). Der Vertreter steht in `vorname`, `nachname`, `vertreterFunktion`. */
  firma?: string;
  rechtsform?: string;
  firmaStrasse?: string;
  firmaHausnummer?: string;
  firmaPlz?: string;
  firmaOrt?: string;
  registergericht?: string;
  registernummer?: string;
  vertreterFunktion?: string;
  /** Anzahl der Einheiten im Haus, vorbelegt aus den Einheiten am Objekt. */
  anzahlEinheiten?: string;
  /** WEG-Aufteilung: aufgeteilt, nicht aufgeteilt oder noch offen (dann nicht im PDF). */
  aufteilung?: AufteilungWert | "";
  grundbuchAmtsgericht?: string;
  grundbuchGemarkung?: string;
  grundbuchFlurstueck?: string;
  /** Freitext, etwa „8 Stellplätze auf dem Grundstück“. Was nicht genannt ist, ist nicht reserviert. */
  stellplaetzeGaragen?: string;
  /** Wohn- und Nutzfläche gesamt, freiwillig. Wird bewusst nicht gedruckt. */
  flaecheGesamt?: string;

  /**
   * Firma oder Privatperson, ausdrücklich gewählt.
   *
   * Bei einer Firma steht der Firmenname allein in `vkName`, bei einer
   * Privatperson sind es `vkVorname` und `vkName`. Leer heißt: noch nicht
   * gewählt, dann bleibt stehen, was da ist. Siehe `verkaeuferName.ts`.
   */
  vkArt?: VerkaeuferArt | "";
  vkVorname?: string;
  vkName: string; vkStrasse: string; vkPlz: string; vkOrt: string;
  /** Freitext, freiwillig: Wunschnotar, Terminwünsche, Besonderheiten der Finanzierung. */
  sonstigeInformationen?: string;
  erklaerungAkzeptiert: boolean;
  /*
   * Felder, die es seit dem 15.09.2026 nicht mehr gibt: das vorgeschlagene
   * Notariat und die beiden Datenschutz-Haken. Sie stehen noch in älteren
   * Datensätzen und bleiben deshalb lesbar, werden aber weder abgefragt noch
   * geprüft noch gedruckt.
   */
  /** @deprecated Entfallen am 15.09.2026, nur noch in alten Datensätzen. */
  eigenerNotar?: boolean;
  /** @deprecated Entfallen am 15.09.2026, nur noch in alten Datensätzen. */
  notarName?: string; notarStrasse?: string; notarPlz?: string; notarOrt?: string; notarEmail?: string; notarTelefon?: string;
  /** @deprecated Entfallen am 15.09.2026, nur noch in alten Datensätzen. */
  datenschutzKenntnis?: boolean;
  /** @deprecated Entfallen am 15.09.2026, nur noch in alten Datensätzen. */
  datenschutzAkzeptiert?: boolean;
  /** @deprecated Entfallen am 15.09.2026, nur noch in alten Datensätzen. */
  bankEinwilligung?: boolean;
  /**
   * Zahlt dieser Kunde ausnahmsweise keine Reservierungsgebühr?
   *
   * Bewusst negativ benannt und bewusst nur `true` als Ja. Jede Reservierung
   * von vor dem 22.09.2026 kennt das Feld gar nicht; „nicht entfallen" ergibt
   * dann von selbst den Regelfall „zahlt eine Gebühr", und alte Vorgänge
   * verhalten sich unverändert. Ein positiv benanntes Feld hätte sie alle
   * stillschweigend auf „zahlt nicht" gedreht.
   *
   * Die Entscheidung trifft die interne Vorbereitung, nicht der Kunde:
   * Das Formular sehen nur Vertriebspartner, Vertriebsleitung, Backoffice,
   * Inhaber und Admin, der Kunde bekommt nur die Signaturseite und das PDF.
   */
  gebuehrEntfaellt?: boolean;
  /**
   * Pflichtwahl im Widerrufsabschnitt: sofort beginnen oder die
   * Widerrufsfrist abwarten. Ohne Gebühr gibt es diese Wahl nicht, dann
   * bleibt das Feld leer.
   */
  widerrufWahl?: WiderrufWahlWert;
  /** Welche Fassung des Vertragstextes unterschrieben wurde, siehe `TEXT_FASSUNG`. */
  textFassung?: string;
  /**
   * In welcher Sprache die Vereinbarung hinausging, seit dem 25.09.2026.
   *
   * „en“ heißt: zweisprachig, Deutsch maßgeblich (Plan Kundensprache,
   * Entscheidung 6). Gesetzt beim Versand aus der Kundensprache. Fehlt das
   * Feld, wie bei jeder älteren Reservierung, ist sie deutsch.
   */
  vertragssprache?: VertragsSprache;
  /** Nur bei Englisch: die Fassung der Übersetzung, siehe `TEXT_FASSUNG_EN`. */
  textFassungEn?: string;
  abgeschlossen: boolean;
}

const EMPTY: ReservierungData = {
  vorname: "", nachname: "", geburtsdatum: "", staatsangehoerigkeit: "Deutsch", geburtsname: "", geburtsort: "",
  strasse: "", hausnummer: "", plz: "", ort: "",
  telefon: "", email: "", gueterstand: "", iban: "",
  hatPerson2: false,
  p2Vorname: "", p2Nachname: "", p2Geburtsdatum: "", p2Staatsangehoerigkeit: "Deutsch",
  p2Strasse: "", p2Hausnummer: "", p2Plz: "", p2Ort: "",
  p2Telefon: "", p2Email: "", p2Geburtsname: "", p2Geburtsort: "", p2Iban: "",
  wohneinheit: "", objStrasse: "", objPlz: "", objOrt: "", gesamtpreis: "", stellplatz: "", garage: "",
  dolmetscher: false, dolmetscherSprache: "",
  vkArt: "", vkVorname: "",
  vkName: "", vkStrasse: "", vkPlz: "", vkOrt: "",
  sonstigeInformationen: "",
  erklaerungAkzeptiert: false,
  gebuehrEntfaellt: false,
  widerrufWahl: "",
  textFassung: "",
  abgeschlossen: false,
};

const RV_KEY_PREFIX = "reservierung_";
const LS_RV_KEY = "mi_reservierung_";

/** Ein Feldwert als Text, damit sich leer, fehlend und "0" vergleichen lassen. */
function alsText(wert: unknown): string {
  if (wert === undefined || wert === null) return "";
  if (typeof wert === "string") return wert.trim();
  return String(wert);
}

/**
 * Hat hier jemand selbst etwas eingetragen?
 *
 * Verglichen wird gegen den Stand, mit dem das Formular aufgegangen ist. Die
 * Vorbefüllung aus Kontakt, Investment und Adresszeile steht in diesem
 * Ausgangsstand schon drin und zählt deshalb ausdrücklich nicht als Eingabe.
 * Wer das Formular öffnet, sich vertut und sofort zurückgeht, wird darum auch
 * nicht gefragt, ob etwas verworfen werden soll.
 *
 * Wer eine Änderung wieder rückgängig tippt, steht danach ebenfalls wieder auf
 * dem Ausgangsstand. Dann ist nichts mehr zu verlieren, und die Rückfrage
 * bleibt aus.
 */
export function eigeneEingabeVorhanden(
  ausgang: ReservierungData,
  aktuell: ReservierungData,
): boolean {
  const links = ausgang as unknown as Record<string, unknown>;
  const rechts = aktuell as unknown as Record<string, unknown>;
  const schluessel = new Set([...Object.keys(links), ...Object.keys(rechts)]);
  for (const k of schluessel) {
    const a = alsText(links[k]);
    const b = alsText(rechts[k]);
    if (a !== b) return true;
  }
  return false;
}
/*
 * Der Schritt „Verkäuferdaten" ist am 14.09.2026 entfallen, auf Christians
 * Wunsch. Er war eine Wiederholung: Die Verkäuferdaten gehören zum Objekt und
 * werden im Kundenprofil unter „Objektdaten" gepflegt. Hier standen sie nur
 * vorbefüllt noch einmal da. Die Felder selbst bleiben im Datensatz, werden
 * weiter aus dem Objekt gefüllt und beim Absenden ans Investment
 * zurückgeschrieben, denn von dort holt sie der Notar-Aufnahmebogen.
 */
const STEPS = ["Käuferdaten", "Objektdaten", "Reservierung & Abschluss"];

function load(kundeId: string): ReservierungData {
  if (isTestAccount()) {
    try { const r = localStorage.getItem(LS_RV_KEY + kundeId); if (r) return JSON.parse(r); } catch {}
    return { ...EMPTY };
  }
  const all = getUserSetting<Record<string, ReservierungData>>("reservierungen", {});
  return all[kundeId] || { ...EMPTY };
}
function save(kundeId: string, d: ReservierungData) {
  if (isTestAccount()) {
    localStorage.setItem(LS_RV_KEY + kundeId, JSON.stringify(d));
    return;
  }
  const all = getUserSetting<Record<string, ReservierungData>>("reservierungen", {});
  all[kundeId] = d;
  setUserSetting("reservierungen", all);
}

/** Nur die Ziffern einer Wohneinheit, damit „WE 6“ und „6“ gleich sind. */
function weZiffern(we?: string | null): string {
  return String(we ?? "").replace(/\D/g, "");
}

/**
 * Den Entwurf laden, mit Übergang für Entwürfe von vor dem 23.09.2026.
 *
 * Seitdem trägt der Schlüssel die Einheit. Ein älterer Entwurf liegt noch
 * unter dem Schlüssel ohne Einheit. Er wird nur übernommen, wenn er zu dieser
 * Einheit passt oder noch gar keine Einheit kennt. Ein Entwurf für eine
 * andere Wohnung bleibt liegen, sonst stünde deren Nummer im Formular.
 */
export function entwurfLaden(schluessel: string, alterSchluessel: string, weNr?: string): ReservierungData {
  const neu = load(schluessel);
  if (schluessel === alterSchluessel || eigeneEingabeVorhanden(EMPTY, neu)) return neu;
  const alt = load(alterSchluessel);
  const altWe = weZiffern(alt.wohneinheit);
  if (!altWe || !weNr || altWe === weZiffern(weNr)) return alt;
  return { ...EMPTY };
}

/**
 * Die englische Fassung unter einem deutschen Absatz, nur bei englischen
 * Kunden. Klein und kursiv, damit der deutsche, maßgebliche Wortlaut der
 * Haupttext bleibt.
 */
function EnglischeFassung({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <p lang="en" className="mt-1 text-xs italic text-muted-foreground/90">
      <span className="mr-1 not-italic font-semibold text-muted-foreground">EN</span>
      {text}
    </p>
  );
}

/** Der englische Titel hinter einer Abschnittsüberschrift, nur bei englischen Kunden. */
function EnglischerTitel({ titel }: { titel?: string | null }) {
  if (!titel) return null;
  return <span lang="en" className="font-normal text-muted-foreground"> / {titel}</span>;
}

function Field({ label, children, className, required, error, hinweis }: { label: string; children: React.ReactNode; className?: string; required?: boolean; error?: boolean; hinweis?: string }) {
  return (
    <div className={className}>
      <Label className={`text-sm font-medium mb-1 block ${error ? "text-destructive" : ""}`}>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className={error ? "[&>*]:border-destructive" : ""}>
        {children}
      </div>
      {error && hinweis && <p className="text-xs text-destructive mt-1">{hinweis}</p>}
    </div>
  );
}

/**
 * Die Pflichtprüfung eines Schrittes. Alle Wege ins nächste Formularblatt
 * gehen hier durch, auch das Abschicken; deshalb gibt es keine zweite Prüfung
 * daneben, die auseinanderlaufen könnte. Ausgegeben, damit die Tests sie
 * ohne das ganze Formular prüfen können.
 */
export function validateRvStep(step: number, data: ReservierungData, showGueterstand: boolean): Set<string> {
  const errs = new Set<string>();
  /*
   * Ohne Gebühr stehen die IBAN-Felder und die Widerrufswahl gar nicht im
   * Formular. Sie dürfen dann auch nichts blockieren: Eine unsichtbare Pflicht
   * hält den Schritt an, ohne dass etwas markiert wäre.
   */
  const mitGebuehr = data.gebuehrEntfaellt !== true;
  const gesamtobjekt = data.gesamtobjekt === true;
  switch (step) {
    case 0:
      /*
       * Beim Globalobjekt zuerst die Wahl, wer kauft. Solange sie fehlt, steht
       * im Formular nichts weiter, und nur die Wahl ist markiert. Bei einer
       * Gesellschaft gelten die Felder aus Tabelle B; Geburtsdatum,
       * Staatsangehörigkeit und Güterstand fallen weg, die IBAN bleibt
       * freiwillig.
       */
      if (gesamtobjekt) {
        if (data.kaeuferArt !== "privat" && data.kaeuferArt !== "gesellschaft") {
          errs.add("kaeuferArt");
          break;
        }
        if (data.kaeuferArt === "gesellschaft") {
          const pflicht: (keyof ReservierungData)[] = [
            "firma", "rechtsform", "firmaStrasse", "firmaHausnummer", "firmaPlz", "firmaOrt",
            "registergericht", "registernummer", "vorname", "nachname", "vertreterFunktion", "telefon", "email",
          ];
          for (const feld of pflicht) {
            if (!String(data[feld] ?? "").trim()) errs.add(feld);
          }
          if (mitGebuehr && !ibanLeerOderGueltig(data.iban)) errs.add("iban");
          break;
        }
      }
      if (!data.vorname.trim()) errs.add("vorname");
      if (!data.nachname.trim()) errs.add("nachname");
      if (!data.geburtsdatum.trim()) errs.add("geburtsdatum");
      if (!data.staatsangehoerigkeit.trim()) errs.add("staatsangehoerigkeit");
      if (!data.strasse.trim()) errs.add("strasse");
      if (!data.hausnummer.trim()) errs.add("hausnummer");
      if (!data.plz.trim()) errs.add("plz");
      if (!data.ort.trim()) errs.add("ort");
      if (!data.telefon.trim()) errs.add("telefon");
      if (!data.email.trim()) errs.add("email");
      // Freiwillig seit dem 22.09.2026: leer kommt durch, falsch getippt nicht.
      if (mitGebuehr && !ibanLeerOderGueltig(data.iban)) errs.add("iban");
      if (showGueterstand && !data.gueterstand) errs.add("gueterstand");

      if (data.hatPerson2) {
        if (!data.p2Vorname.trim()) errs.add("p2Vorname");
        if (!data.p2Nachname.trim()) errs.add("p2Nachname");
        if (!data.p2Geburtsdatum.trim()) errs.add("p2Geburtsdatum");
        if (!data.p2Staatsangehoerigkeit.trim()) errs.add("p2Staatsangehoerigkeit");
        if (!data.p2Strasse.trim()) errs.add("p2Strasse");
        if (!data.p2Hausnummer.trim()) errs.add("p2Hausnummer");
        if (!data.p2Plz.trim()) errs.add("p2Plz");
        if (!data.p2Ort.trim()) errs.add("p2Ort");
        if (!data.p2Telefon.trim()) errs.add("p2Telefon");
        if (!data.p2Email.trim()) errs.add("p2Email");
        if (mitGebuehr && !ibanLeerOderGueltig(data.p2Iban)) errs.add("p2Iban");
      }
      break;
    case 1:
      if (gesamtobjekt) {
        // Keine Wohneinheit beim ganzen Haus, dafür Anzahl und Aufteilung.
        if (!/^\d+$/.test(String(data.anzahlEinheiten ?? "").trim()) || Number(data.anzahlEinheiten) < 1) errs.add("anzahlEinheiten");
        if (data.aufteilung !== "aufgeteilt" && data.aufteilung !== "nicht_aufgeteilt" && data.aufteilung !== "offen") errs.add("aufteilung");
      } else if (!data.wohneinheit.trim()) errs.add("wohneinheit");
      if (!data.objStrasse.trim()) errs.add("objStrasse");
      if (!data.objPlz.trim()) errs.add("objPlz");
      if (!data.objOrt.trim()) errs.add("objOrt");
      if (!data.gesamtpreis.trim()) errs.add("gesamtpreis");
      if (data.dolmetscher && !(data.dolmetscherSprache || "").trim()) errs.add("dolmetscherSprache");
      break;
    case 2:
      if (!data.erklaerungAkzeptiert) errs.add("erklaerungAkzeptiert");
      /*
       * Genau eine der beiden Wahlmöglichkeiten, ohne Voreinstellung. Ob es
       * die Wahl in diesem Fall überhaupt gibt, sagt der Aufbau des Dokuments:
       * Ohne Gebühr entfällt die Widerrufsthematik und mit ihr diese Wahl.
       */
      if (vertragsAufbau(vertragsOptionenAus(data)).mitWiderruf
        && data.widerrufWahl !== "sofort" && data.widerrufWahl !== "abwarten") errs.add("widerrufWahl");
      break;
  }
  return errs;
}

/** Ist der Abschlussschritt vollständig? Steuert den Knopf, die Prüfung selbst steht in `validateRvStep`. */
export function abschlussVollstaendig(data: ReservierungData): boolean {
  return validateRvStep(2, data, false).size === 0;
}

interface ReservierungsFormProps {
  kundeId: string;
  objektTitel?: string;
  wohnungData?: { weNr: string; groesse: number; kaufpreis: number; etage: string; lage: string; zimmer?: number; miete?: number; rendite?: number; objAdresse?: string; objPlz?: string; objOrt?: string };
  verkaeuferData?: { vkArt?: VerkaeuferArt | ""; vkVorname?: string; vkName: string; vkStrasse: string; vkPlz: string; vkOrt: string };
  kundeData?: { vorname: string; nachname: string; email: string; telefon: string; strasse: string; hausnummer: string; plz: string; ort: string; geburtsdatum: string };
  investmentId?: string;
  wohnungId?: string;
  objektId?: string;
  /**
   * Reservierung des ganzen Hauses (Globalobjekt) statt einer Einheit.
   *
   * Dann gibt es keine Wohneinheit, beim Absenden wird das Haus vorgemerkt
   * (`vormerkeObjekt`) und der Vertrag steht in der Globalfassung. Ohne die
   * Migration `20260923152000_globalobjekt_reservierung.sql` geht in diesem
   * Modus nichts hinaus.
   */
  gesamtobjekt?: boolean;
  /**
   * Wohin der Zurückweg oben führt.
   *
   * Der Aufrufer gibt seine eigene Adresse mit, denn in dieses Formular führen
   * drei Wege: das Kundenprofil, die Objektseite und die Wohnungsseite. Fehlt
   * die Angabe, etwa beim direkten Aufruf der Adresse oder aus einem
   * Lesezeichen, geht es zum Kundenprofil und ohne Kunden zur Kontaktliste.
   */
  zurueckZiel?: string;
  onComplete?: () => void;
}

export function ReservierungsForm({ kundeId, objektTitel, wohnungData, verkaeuferData, kundeData, investmentId, wohnungId, objektId, gesamtobjekt = false, zurueckZiel, onComplete }: ReservierungsFormProps) {
  const [step, setStep] = useState(0);
  // Pro Investment eigenen Draft-Key, damit Verkäuferdaten aus Investment 1
  // nicht in den Reservierungsentwurf von Investment 2 hineinbluten.
  const investmentSchluessel = (kundeId || "rv-temp") + (investmentId ? `:${investmentId}` : "");
  /*
   * Seit dem 23.09.2026 gehört auch die Einheit in den Schlüssel. Sonst blieb
   * ein Entwurf für WE 12 stehen, wenn derselbe Kunde über die Einheitsseite
   * WE 6 reservieren sollte, und im Formular stand die falsche Wohnung.
   */
  /*
   * Beim ganzen Haus gehört das Objekt in den Schlüssel, und ein älterer
   * Entwurf ohne Objekt wird nicht übernommen: Er gehört zu einer
   * Einzelwohnung, und deren Nummer hätte in der Vereinbarung für ein Haus
   * nichts zu suchen.
   */
  const storageKey = gesamtobjekt
    ? `${investmentSchluessel}:objekt:${objektId || ""}`
    : investmentSchluessel + (wohnungId ? `:${wohnungId}` : "");
  const [data, setData] = useState(() => {
    const loaded = entwurfLaden(storageKey, gesamtobjekt ? storageKey : investmentSchluessel, wohnungData?.weNr);
    if (gesamtobjekt) {
      /*
       * Vorbelegung beim ganzen Haus, aus dem Objekt (Teil 2 des Entwurfs).
       * Nur ergänzt, nie überschrieben. Die Anzahl der Einheiten wird an den
       * Einheiten gezählt, nicht aus der „Anzahl Einheiten“ der Objektanlage,
       * die gar nicht gespeichert wird.
       */
      loaded.gesamtobjekt = true;
      loaded.wohneinheit = "";
      loaded.stellplatz = "";
      loaded.garage = "";
      const haus = objektId ? getObjektById(objektId) : undefined;
      if (haus) {
        if (!loaded.objStrasse) loaded.objStrasse = haus.adresse || "";
        if (!loaded.objPlz) loaded.objPlz = haus.plz || "";
        if (!loaded.objOrt) loaded.objOrt = haus.ort || "";
        if (!loaded.gesamtpreis && zahlAusText(haus.globalDaten?.verkaufspreis) > 0) {
          loaded.gesamtpreis = textAusZahl(haus.globalDaten?.verkaufspreis);
        }
        const einheiten = anzahlEinheiten(haus);
        if (!loaded.anzahlEinheiten && einheiten > 0) loaded.anzahlEinheiten = String(einheiten);
        const stellplaetze = zahlAusText(haus.globalDaten?.stellplaetze);
        if (!loaded.stellplaetzeGaragen && stellplaetze > 0) loaded.stellplaetzeGaragen = `${stellplaetze} Stellplätze`;
        if (!loaded.flaecheGesamt && zahlAusText(haus.globalDaten?.gesamtQm) > 0) {
          loaded.flaecheGesamt = textAusZahl(haus.globalDaten?.gesamtQm);
        }
      }
      // Das Grundbuch steht heute nur am Investment, aus der Objektauswahl.
      if (investmentId) {
        const gb = getInvestmentMetaField<Record<string, unknown>>(investmentId, "objektGrundbuch", {}) || {};
        const gbText = (v: unknown) => (typeof v === "string" ? v.trim() : "");
        if (!loaded.grundbuchAmtsgericht) loaded.grundbuchAmtsgericht = gbText(gb.amtsgericht);
        if (!loaded.grundbuchGemarkung) loaded.grundbuchGemarkung = gbText(gb.gemarkung);
        if (!loaded.grundbuchFlurstueck) loaded.grundbuchFlurstueck = gbText(gb.flurstueck);
      }
    } else if (loaded.gesamtobjekt) {
      // Ein Entwurf für ein ganzes Haus darf eine Einzelwohnung nicht umschalten.
      delete loaded.gesamtobjekt;
    }
    if (wohnungData && !loaded.wohneinheit) {
      loaded.wohneinheit = wohnungData.weNr;
    }
    /*
     * Ausdrücklich größer null: sonst steht im Preisfeld eine nackte "0", und
     * die gilt danach als ausgefüllt, sodass keine Ausweichkette mehr greift.
     *
     * Geschrieben wird der Betrag mit `textAusZahl`, nicht mit `String`. Über
     * `String` käme ein krummer Betrag als "650000.5" an, und die
     * Tausenderformatierung darunter liest jeden Punkt als Trennzeichen und
     * machte daraus 6.500.005.
     */
    if (wohnungData && zahlAusText(wohnungData.kaufpreis) > 0 && !loaded.gesamtpreis) {
      loaded.gesamtpreis = textAusZahl(wohnungData.kaufpreis);
    }
    if (wohnungData && !loaded.objStrasse) loaded.objStrasse = wohnungData.objAdresse || "";
    if (wohnungData && !loaded.objPlz) loaded.objPlz = wohnungData.objPlz || "";
    if (wohnungData && !loaded.objOrt) loaded.objOrt = wohnungData.objOrt || "";
    // Verkäuferdaten aus den URL-Props (per-Feld, damit auch einzeln fehlende Felder ergänzt werden)
    if (verkaeuferData) {
      if (!loaded.vkArt) loaded.vkArt = verkaeuferData.vkArt || "";
      if (!loaded.vkVorname) loaded.vkVorname = verkaeuferData.vkVorname || "";
      if (!loaded.vkName) loaded.vkName = verkaeuferData.vkName || "";
      if (!loaded.vkStrasse) loaded.vkStrasse = verkaeuferData.vkStrasse || "";
      if (!loaded.vkPlz) loaded.vkPlz = verkaeuferData.vkPlz || "";
      if (!loaded.vkOrt) loaded.vkOrt = verkaeuferData.vkOrt || "";
    }
    // Fallback: einzelne noch leere Verkäuferfelder aus dem Objekt nachladen
    if (objektId && (!loaded.vkName || !loaded.vkStrasse || !loaded.vkPlz || !loaded.vkOrt)) {
      const obj = getObjektById(objektId);
      const vk = obj?.verkaeuferDaten || (obj?.meta as any)?.verkaeuferDaten;
      if (vk) {
        if (!loaded.vkArt) loaded.vkArt = verkaeuferArt(vk);
        if (!loaded.vkVorname) loaded.vkVorname = vk.vorname || "";
        if (!loaded.vkName) loaded.vkName = vk.name || "";
        if (!loaded.vkStrasse) loaded.vkStrasse = vk.strasse || "";
        if (!loaded.vkPlz) loaded.vkPlz = vk.plz || "";
        if (!loaded.vkOrt) loaded.vkOrt = vk.ort || "";
      }
    }
    /*
     * Die Objektauswahl des Investments.
     *
     * Bisher endete die Vorbefüllung hier beim eigenen Bestand: Wer ein Objekt
     * von Hand eingetragen hatte, tippte Wohneinheit, Straße, PLZ, Ort und
     * Preis ein zweites Mal, obwohl sie am Investment längst standen.
     *
     * Solange der Bestandsweg abgeschaltet ist (`BESTANDSWOHNUNG_AKTIV` in
     * `objektDatenPflicht`), sucht `vorhandeneObjektDaten` gar nicht mehr im
     * Bestand, sondern liest allein die Felder am Investment. Was über die
     * Adresszeile mitgereist ist, steht ohnehin schon oben und wird hier nur
     * ergänzt, nie überschrieben.
     */
    if (investmentId) {
      const objektDaten = vorhandeneObjektDaten(investmentId);
      // Beim ganzen Haus gibt es keine Wohneinheit, auch wenn am Investment noch eine steht.
      if (!gesamtobjekt && !loaded.wohneinheit) loaded.wohneinheit = objektDaten.weNr || "";
      if (!loaded.objStrasse) loaded.objStrasse = objektDaten.strasse || "";
      if (!loaded.objPlz) loaded.objPlz = objektDaten.plz || "";
      if (!loaded.objOrt) loaded.objOrt = objektDaten.ort || "";
      if (!loaded.gesamtpreis && objektDaten.kaufpreis) {
        loaded.gesamtpreis = textAusZahl(objektDaten.kaufpreis);
      }
      const vk = objektDaten.verkaeufer || {};
      if (!loaded.vkArt) loaded.vkArt = verkaeuferArt(vk);
      if (!loaded.vkVorname) loaded.vkVorname = vk.vorname || "";
      if (!loaded.vkName) loaded.vkName = vk.name || "";
      if (!loaded.vkStrasse) loaded.vkStrasse = vk.strasse || "";
      if (!loaded.vkPlz) loaded.vkPlz = vk.plz || "";
      if (!loaded.vkOrt) loaded.vkOrt = vk.ort || "";
    }
    // Per-field prefill from URL params (kundeData)
    if (kundeData) {
      if (!loaded.vorname) loaded.vorname = kundeData.vorname || "";
      if (!loaded.nachname) loaded.nachname = kundeData.nachname || "";
      if (!loaded.email) loaded.email = kundeData.email || "";
      if (!loaded.telefon) loaded.telefon = kundeData.telefon || "";
      if (!loaded.strasse) loaded.strasse = kundeData.strasse || "";
      if (!loaded.hausnummer) loaded.hausnummer = kundeData.hausnummer || "";
      if (!loaded.plz) loaded.plz = kundeData.plz || "";
      if (!loaded.ort) loaded.ort = kundeData.ort || "";
      if (!loaded.geburtsdatum) loaded.geburtsdatum = kundeData.geburtsdatum || "";
    }
    // Always fall back to Kontakt store for any still-empty fields
    if (kundeId) {
      const k = getKontaktById(kundeId);
      if (k) {
        if (!loaded.vorname) loaded.vorname = k.vorname || "";
        if (!loaded.nachname) loaded.nachname = k.nachname || "";
        if (!loaded.email) loaded.email = k.email || "";
        if (!loaded.telefon) loaded.telefon = k.telefon || "";
        if (!loaded.strasse) loaded.strasse = k.strasse || "";
        if (!loaded.hausnummer) loaded.hausnummer = k.hausnummer || "";
        if (!loaded.plz) loaded.plz = k.plz || "";
        if (!loaded.ort) loaded.ort = k.ort || "";
        if (!loaded.geburtsdatum) loaded.geburtsdatum = k.geburtstag || "";
        if (k.person2 && k.person2.vorname && !loaded.p2Vorname) {
          loaded.hatPerson2 = true;
          loaded.p2Vorname = k.person2.vorname || "";
          loaded.p2Nachname = k.person2.nachname || "";
          loaded.p2Email = k.person2.email || "";
          loaded.p2Telefon = k.person2.telefon || "";
          loaded.p2Geburtsdatum = k.person2.geburtsdatum || "";
        }
      }
    }
    /*
     * Die IBAN für die Rückzahlung aus der Selbstauskunft, wenn es sie gibt.
     *
     * Die Selbstauskunft fragt die Bankkonten ab, das erste ist in aller
     * Regel das Girokonto. Wer sie schon ausgefüllt hat, soll die IBAN hier
     * nicht ein zweites Mal abtippen. Nur ergänzt, nie überschrieben, und
     * im Formular weiter änderbar.
     */
    if (investmentId && (!loaded.iban || (loaded.hatPerson2 && !loaded.p2Iban))) {
      try {
        const inv = getInvestmentsByKontakt(kundeId).find(i => i.id === investmentId) as { meta?: Record<string, unknown> } | undefined;
        const saData = (inv?.meta?.saData ?? {}) as { bankkonten?: unknown; person2Data?: { bankkonten?: unknown } };
        const erstesKonto = (konten: unknown): string => {
          if (!Array.isArray(konten)) return "";
          const mitIban = (konten as { iban?: unknown }[]).find((b) => typeof b?.iban === "string" && b.iban.trim());
          return typeof mitIban?.iban === "string" ? mitIban.iban : "";
        };
        if (!loaded.iban) loaded.iban = ibanEingabe(erstesKonto(saData.bankkonten));
        if (loaded.hatPerson2 && !loaded.p2Iban) loaded.p2Iban = ibanEingabe(erstesKonto(saData.person2Data?.bankkonten));
      } catch { /* ohne Selbstauskunft bleibt das Feld leer */ }
    }
    return loaded;
  });
  /*
   * Der Stand, mit dem das Formular aufgegangen ist.
   *
   * Er entsteht genau einmal, direkt nach der Vorbefüllung oben, und ändert
   * sich danach nicht mehr. An ihm hängt die Frage, ob der Zurückweg
   * nachfragen muss: Nur was von diesem Stand abweicht, hat jemand selbst
   * eingetragen.
   */
  const ausgangsDatenRef = useRef<ReservierungData | null>(null);
  if (ausgangsDatenRef.current === null) ausgangsDatenRef.current = { ...data };
  /** Weicht das Formular vom Ausgangsstand ab? */
  const [entwurfGeaendert, setEntwurfGeaendert] = useState(false);
  useEffect(() => {
    setEntwurfGeaendert(eigeneEingabeVorhanden(ausgangsDatenRef.current as ReservierungData, data));
  }, [data]);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [signatureSent, setSignatureSent] = useState(false);
  /** Läuft gerade ein Versuch? Verhindert den Doppelklick. */
  const [versandLaeuft, setVersandLaeuft] = useState(false);
  /** Der letzte Fehlschlag, sichtbar über dem Knopf, bis er behoben ist. */
  const [versandFehler, setVersandFehler] = useState<string | null>(null);
  /**
   * Was beim ersten Versuch schon geschehen ist.
   *
   * Der zweite Klick soll nur den Versand wiederholen. Pipelinestufe,
   * Kontaktstatus, Wohnungsreservierung und der Rückfluss ans Investment sind
   * dann längst geschrieben, ein zweiter Durchlauf brächte nichts und legte
   * eine zweite Benachrichtigung an.
   */
  const vorbereitetRef = useRef(false);
  /** Nebenwege, die schiefgingen, ohne den Vorgang zu stoppen. */
  const nebenHinweiseRef = useRef<string[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  /*
   * Den Hinweis auf die fehlende Migration sehen nur Admin und Inhaber. Wer
   * vertreibt, soll davon nichts merken: Für ihn läuft der Rückfallweg einfach
   * weiter. Ohne Anmeldung (etwa in Tests) gibt es keine Rolle und keinen
   * Hinweis.
   */
  const rolle = useOptionalUser()?.user?.role;
  const zeigtTechnikHinweise = rolle === "admin" || rolle === "inhaber";

  const saFamilienstandInfo = (() => {
    if (!kundeId) return { p1: "", p2: "" };
    try {
      const invs = getInvestmentsByKontakt(kundeId);
      const inv = investmentId ? invs.find(i => i.id === investmentId) : invs[0];
      const saData = (inv as any)?.meta?.saData;
      return {
        p1: saData?.familienstand || "",
        p2: saData?.person2Data?.familienstand || "",
      };
    } catch { return { p1: "", p2: "" }; }
  })();
  /*
   * Beim ganzen Haus: Kauft eine Gesellschaft? Dann gibt es weder einen
   * zweiten Käufer noch einen Güterstand, und die Widerrufsthematik entfällt.
   */
  const istGesellschaft = gesamtobjekt && data.kaeuferArt === "gesellschaft";
  // Eingetragene Lebenspartner haben wie Ehegatten einen Güterstand (§ 6 LPartG).
  const showGueterstand = !istGesellschaft && data.hatPerson2 && hatGueterstand(saFamilienstandInfo.p1) && hatGueterstand(saFamilienstandInfo.p2);

  /*
   * Der Aufbau des Dokuments für diese Reservierung.
   *
   * Von hier kommen die Abschnittsnummern und die Punkte der Vereinbarung,
   * und zwar genau so, wie sie auch im PDF stehen. Beides hängt am
   * Schieberegler unten: Ohne Gebühr fallen der Gebührenabschnitt, die IBAN
   * und die ganze Widerrufsthematik weg, und alles Folgende rückt auf.
   */
  const optionen = vertragsOptionenAus(data);
  const aufbau = vertragsAufbau(optionen);
  const mitGebuehr = aufbau.mitGebuehr;
  /*
   * Die Sprache des Kunden (Plan Kundensprache, Etappe 4). Bei Englisch geht
   * die Vereinbarung zweisprachig hinaus, Deutsch maßgeblich. Dieses Formular
   * bleibt deutsch, denn es füllt die interne Vorbereitung aus; im letzten
   * Schritt steht die englische Fassung unter jedem Absatz, damit hier zu
   * sehen ist, was der Kunde bekommt. Festgeschrieben wird die Sprache erst
   * beim Versand, siehe `absenden`.
   */
  const { sprache: kundenSprachWahl } = useKundenSprache(kundeId);
  const zeigtEnglisch = kundenSprachWahl === "en";
  const aufbauEn = zeigtEnglisch ? vertragsAufbau(optionen, "en") : null;
  const textEn = reservierungTexte("en");

  /*
   * Ohne die Migration `20260923152000_globalobjekt_reservierung.sql` hält
   * niemand das Haus fest, obwohl die Vereinbarung es verspricht. Dann geht
   * im Modus „gesamtes Objekt“ nichts hinaus: Der Knopf ist gesperrt, und
   * beim Absenden lehnt zusätzlich `vormerkeObjekt` ab.
   */
  const [hausOhneMigration] = useState(() => {
    if (!gesamtobjekt || !objektId) return false;
    try {
      const haus = getObjektById(objektId);
      return !!haus && !hausReservierungFreigeschaltet(haus);
    } catch {
      return false;
    }
  });

  const update = <K extends keyof ReservierungData>(key: K, value: ReservierungData[K]) => {
    setData(prev => { const next = { ...prev, [key]: value }; save(storageKey, next); return next; });
    if (errors.has(key as string)) {
      setErrors(prev => { const n = new Set(prev); n.delete(key as string); return n; });
    }
  };

  const tryNext = () => {
    const errs = validateRvStep(step, data, showGueterstand);
    if (errs.size > 0) {
      setErrors(errs);
      toast({ title: "Pflichtfelder ausfüllen", description: "Bitte alle markierten Felder ausfüllen.", variant: "destructive" });
      return;
    }
    setErrors(new Set());
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => { setErrors(new Set()); setStep(s => Math.max(s - 1, 0)); };

  /*
   * Der Weg zurück, dorthin, wo der Nutzer hergekommen ist.
   *
   * Ohne Angabe des Aufrufers bleibt das Kundenprofil, und ohne Kunden die
   * Kontaktliste. Eine fremde Adresse wird nicht angenommen: Nur ein Pfad
   * innerhalb der Anwendung ist erlaubt, damit die Adresszeile niemanden auf
   * eine fremde Seite schicken kann.
   */
  const ziel = rueckweg(zurueckZiel, kundeId);
  const zielBeschriftung = rueckwegBeschriftung(ziel);

  /**
   * Zurückspringen, bei angefangener Eingabe erst nach Rückfrage.
   *
   * Gefragt wird nur, wenn wirklich etwas zu verlieren ist. Nach dem Versand
   * ist das nicht mehr der Fall, dann geht es ohne Umweg zurück.
   */
  const zurueckGehen = async () => {
    if (entwurfGeaendert && !signatureSent) {
      const ok = await confirmDialog({
        title: "Reservierungsvereinbarung verwerfen?",
        description:
          "Die Angaben in diesem Formular sind noch nicht zur Unterschrift versendet. "
          + "Beim Verwerfen geht der Entwurf auf den Stand zurück, mit dem das Formular aufgegangen ist.",
        confirmText: "Verwerfen",
        cancelText: "Weiter ausfüllen",
        variant: "destructive",
      });
      if (!ok) return;
      save(storageKey, ausgangsDatenRef.current as ReservierungData);
    }
    navigate(ziel);
  };

  /**
   * Abschicken und Unterschrift anfordern.
   *
   * Reihenfolge: erst die Daten, dann der Versand. Das ist Absicht und wurde
   * geprüft. `send-reservation-signature` braucht die Pipelinestufe nicht, sie
   * liest nur `rvData` aus dem Aufruf und den zuständigen Ansprechpartner am
   * Kontakt. Umgekehrt schreibt die Funktion am Ende selbst in `meta` des
   * Investments (`rvData`, `rvSignaturePending`, `rvSignatureSentAt`). Käme
   * `updateInvestment` danach, überschriebe es dieses Feld mit dem älteren
   * Stand aus dem Zwischenspeicher, und die Kundenakte wüsste nichts mehr von
   * einer offenen Unterschrift. Deshalb bleibt der Versand hinten, und die
   * Erfolgsmeldung hängt allein an seinem Ergebnis.
   *
   * Seit dem 23.09.2026 steht davor ein erster Schritt: die Einheit vormerken
   * (Christians Regeln, siehe `vormerkeEinheit`). Lehnt die Datenbank ab,
   * weil die Einheit vergeben oder für einen anderen Kunden vorgemerkt ist,
   * geschieht gar nichts, weder am Investment noch am Kontakt, und es geht
   * keine Mail hinaus. Die Einheit bleibt dabei „frei“, reserviert wird erst
   * mit der Unterschrift. Der Schritt läuft bei jedem Versuch, auch beim
   * zweiten Klick: Zwischen zwei Versuchen kann die Vormerkung abgelaufen und
   * von jemand anderem übernommen worden sein.
   */
  const absenden = async () => {
    if (versandLaeuft) return;
    const errs = validateRvStep(step, data, showGueterstand);
    if (errs.size > 0) {
      setErrors(errs);
      toast({ title: "Pflichtfelder ausfüllen", description: "Bitte alle markierten Felder ausfüllen.", variant: "destructive" });
      return;
    }
    /*
     * Dieselbe Regel, die `send-reservation-signature` erzwingt (29.09.2026),
     * hier vor allem anderen. Lehnte erst der Server ab, stünden Stufe und
     * Kontaktstatus schon auf „Reservierung“. Das Objekt prüft allein der
     * Server: Es kann in genau diesem Formular erst eingetragen werden.
     */
    const vorabGrund = !investmentId ? RV_OHNE_INVESTMENT : !darfReservierungStarten(investmentId) ? RV_SA_FEHLT : "";
    if (vorabGrund) {
      setVersandFehler(vorabGrund);
      await hinweisDialog({ title: "Die Reservierung geht noch nicht", description: `${vorabGrund} Es ist nichts hinausgegangen.`, buttonText: "Verstanden" });
      return;
    }

    setVersandLaeuft(true);
    // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan
    // Kundensprache 2.4). Nach dem Sperren des Knopfes, damit ein zweiter Klick
    // während der Rückfrage nicht doppelt sendet. Sie wirft nie.
    // Die Antwort ist zugleich die Vertragssprache dieser Vereinbarung.
    const vertragssprache: VertragsSprache = await stelleKundenspracheSicher(kundeId);
    try {
      const currentInvestment = investmentId
        ? getInvestmentsByKontakt(kundeId).find(inv => inv.id === investmentId)
        : undefined;
      const resolvedObjektId = objektId || currentInvestment?.objektId;
      // Beim ganzen Haus gibt es keine Einheit, auch keine frühere am Investment.
      const resolvedWohnungId = gesamtobjekt ? undefined : (wohnungId || currentInvestment?.wohnungId);
      const resolvedObjektTitel = objektTitel || currentInvestment?.objektTitel || "";
      const resolvedWeNr = gesamtobjekt ? "" : (wohnungData?.weNr || data.wohneinheit || currentInvestment?.weNr || "");
      /*
       * Der Preis steht im Feld mit Tausenderpunkten. `Number` würde
       * daraus 189 statt 189.000 lesen, deshalb die gemeinsame
       * Umwandlung aus `zahlAusText`.
       */
      const parsedKaufpreis =
        zahlAusText(data.gesamtpreis) || zahlAusText(wohnungData?.kaufpreis) || 0;

      const bereitsGeschehen: string[] = [];
      /*
       * Was zur Unterschrift geht, trägt die Fassung des Vertragstextes.
       * Sie wird hier gesetzt und nicht beim Öffnen des Formulars, denn ein
       * Entwurf kann tagelang liegen; maßgeblich ist der Text, der im
       * Moment des Versands gilt.
       */
      const fassung = aufbau.textFassung;
      /*
       * Dazu die Sprache und bei Englisch die Fassung der Übersetzung. Aus
       * ihnen bauen Signaturseite und PDF das zweisprachige Dokument, und
       * sie belegen später, welcher Wortlaut in welcher Sprache hinausging.
       */
      const sprachFelder: Pick<ReservierungData, "vertragssprache" | "textFassungEn"> = {
        vertragssprache,
        textFassungEn: vertragssprache === "en" ? textFassungEn(optionen) : undefined,
      };
      /*
       * Beim ganzen Haus trägt der Datensatz das Kennzeichen, an dem PDF,
       * Signaturseite und `finalize-reservierung` die Globalfassung erkennen.
       * Eine Gesellschaft hat keinen zweiten Käufer und keine Widerrufswahl.
       */
      const rvData: ReservierungData = gesamtobjekt
        ? {
          ...data,
          gesamtobjekt: true,
          wohneinheit: "",
          stellplatz: "",
          garage: "",
          ...(istGesellschaft ? { hatPerson2: false, widerrufWahl: "" as WiderrufWahlWert } : {}),
          abgeschlossen: true,
          textFassung: fassung,
          ...sprachFelder,
        }
        : { ...data, abgeschlossen: true, textFassung: fassung, ...sprachFelder };

      /*
       * Schritt 1: vormerken, vor allem anderen.
       *
       * Nur mit einer Einheit aus dem Bestand und einem Kunden. Ohne Einheit
       * gibt es nichts vorzumerken, dann läuft alles wie bisher.
       */
      let ohneMigration = false;
      let vorgemerktBis = "";
      const hinweise: string[] = [];
      if (gesamtobjekt) {
        /*
         * Das ganze Haus vormerken. Ohne Objekt und Kunden gibt es nichts
         * vorzumerken, und ohne Vormerkung geht beim Haus nichts hinaus:
         * Anders als bei der Einheit gibt es keinen Rückfallweg, auch nicht
         * ohne Migration (`vormerkeObjekt`).
         */
        const vormerkung: ObjektVormerkErgebnis = resolvedObjektId && kundeId
          ? await vormerkeObjekt(resolvedObjektId, kundeId)
          : { ok: false, grund: "nicht_gefunden" };
        if (!vormerkung.ok) {
          const meldung = objektVormerkMeldung(vormerkung, { technik: zeigtTechnikHinweise });
          setVersandFehler(meldung.text);
          toast({ title: meldung.titel, description: "Es ist nichts hinausgegangen.", variant: "destructive" });
          await hinweisDialog({ title: meldung.titel, description: meldung.text, buttonText: "Verstanden" });
          return;
        }
        vorgemerktBis = uhrzeit(vormerkung.vorgemerktBis);
      } else if (resolvedWohnungId && kundeId) {
        const vormerkung = await vormerkeEinheit(resolvedWohnungId, kundeId);
        if (vormerkung.ok) vorgemerktBis = uhrzeit(vormerkung.vorgemerktBis);
        if (vormerkung.grund === "ohne_migration") {
          ohneMigration = true;
          if (zeigtTechnikHinweise) {
            toast({
              title: VORMERKUNG_MIGRATION_HINWEIS,
              description: `Solange ${VORMERKUNG_MIGRATION} nicht gelaufen ist, wird die Einheit wie bisher beim Absenden reserviert.`,
            });
          }
        } else if (!vormerkung.ok) {
          const meldung = vormerkMeldung(vormerkung);
          setVersandFehler(meldung.text);
          toast({ title: meldung.titel, description: "Es ist nichts hinausgegangen.", variant: "destructive" });
          await hinweisDialog({ title: meldung.titel, description: meldung.text, buttonText: "Verstanden" });
          return;
        }
      }

      if (!vorbereitetRef.current) {
        /*
         * Rückfall, solange die Migration fehlt: der bisherige Weg, die
         * Einheit beim Absenden zu reservieren. Er steht jetzt vor Investment
         * und Kontakt und prüft vorher, ob die Einheit noch frei ist. Ist sie
         * vergeben, geht nichts hinaus.
         *
         * Dass hier oft nichts geschieht, ist kein Fehler: Ohne Einheit im
         * eigenen Bestand gibt es nichts zu reservieren.
         */
        if (ohneMigration && resolvedObjektId && resolvedWohnungId && kundeId) {
          try {
            await reserveWohnung(resolvedObjektId, resolvedWohnungId, kundeId, `${data.vorname} ${data.nachname}`);
            bereitsGeschehen.push("Die Wohnung ist im Objekt als reserviert eingetragen.");
          } catch (error) {
            if (error instanceof EinheitVergebenFehler) {
              const meldung = vormerkMeldung({ ok: false, grund: error.grund });
              setVersandFehler(meldung.text);
              toast({ title: meldung.titel, description: "Es ist nichts hinausgegangen.", variant: "destructive" });
              await hinweisDialog({ title: meldung.titel, description: meldung.text, buttonText: "Verstanden" });
              return;
            }
            console.error("Wohnung konnte nicht auf reserviert gesetzt werden:", error);
            hinweise.push(
              `Die Wohnung konnte nicht auf „reserviert“ gesetzt werden (${(error as Error)?.message || "unbekannter Fehler"}). `
              + "Bitte im Objekt von Hand auf reserviert setzen, sonst kann sie ein zweites Mal verkauft werden.",
            );
          }
        }

        setData(prev => { const next = { ...prev, abgeschlossen: true, textFassung: fassung, ...sprachFelder }; save(storageKey, next); return next; });

        if (investmentId) {
          updateInvestment(investmentId, {
            pipelineStufe: "reservierung",
            objektId: resolvedObjektId,
            objektTitel: resolvedObjektTitel,
            wohnungId: resolvedWohnungId,
            weNr: resolvedWeNr,
          });
        }
        if (kundeId) {
          /*
           * Seit dem 16.09.2026 holt `send-reservation-signature` die
           * Empfängeradresse aus dem gespeicherten Kontakt und nicht mehr aus
           * dem Aufruf (Audit-Befund F03A, sonst ließe sich eine fremde
           * Anfrage an die eigene Adresse umleiten). Was hier im Formular an
           * Adressen steht, muss deshalb vorher am Kontakt ankommen, sonst
           * ginge der Unterschriftslink an einen älteren Stand.
           *
           * Person 2 wird über den vorhandenen Stand gelegt, nicht ersetzt:
           * Anschrift und Anrede stehen im Reservierungsformular nicht
           * vollständig und dürfen nicht verloren gehen.
           */
          const bisherigerKontakt = getKontaktById(kundeId);
          const p2Bisher = (bisherigerKontakt?.person2 ?? {}) as Record<string, any>;
          // Eine Gesellschaft hat keinen zweiten Käufer; dann bleibt Person 2 am Kontakt unberührt.
          const p2Neu = !istGesellschaft && data.hatPerson2 && data.p2Vorname.trim()
            ? {
                ...p2Bisher,
                vorname: data.p2Vorname.trim(),
                nachname: data.p2Nachname.trim(),
                ...(data.p2Email.trim() ? { email: data.p2Email.trim() } : {}),
                ...(data.p2Telefon.trim() ? { telefon: data.p2Telefon.trim() } : {}),
                ...(data.p2Geburtsdatum ? { geburtsdatum: data.p2Geburtsdatum } : {}),
              }
            : undefined;
          updateKontakt(kundeId, {
            pipelineStufe: "reservierung",
            status: "qualifiziert",
            objekt: resolvedObjektTitel,
            kaufpreis: parsedKaufpreis,
            ...(data.email.trim() ? { email: data.email.trim() } : {}),
            ...(p2Neu ? { person2: p2Neu as any } : {}),
          });
        }
        /*
         * Rückfluss in die Objektauswahl.
         *
         * Was hier ergänzt wurde, landet am Investment und steht damit
         * beim nächsten Mal schon da: im Kundenportal, im
         * Notar-Aufnahmebogen und in einer zweiten Reservierung im
         * selben Haus. Bisher geschah das nur bei einer
         * Investagon-Reservierung, und die Verkäuferangaben blieben
         * überhaupt im Entwurf des Bearbeiters liegen.
         *
         * Eine Wohnung aus dem eigenen Bestand bleibt ausgenommen. Dort
         * werden Adresse, Preis und Verkäufer am Objekt gepflegt und
         * ändern sich zentral. Eine Abschrift am Investment liefe ihnen
         * davon, genau das soll dieser Umbau ja beenden.
         *
         * Solange der Bestandsweg abgeschaltet ist, ist diese Ausnahme
         * nie erfüllt: `hatBestandsWohnung` sagt immer nein, es wird
         * also immer zurückgeschrieben. Die Prüfung bleibt stehen und
         * greift wieder, sobald der Schalter auf an steht.
         */
        if (investmentId && !hatBestandsWohnung(investmentId)) {
          try {
            const bisher = vorhandeneObjektDaten(investmentId);
            const felder: Record<string, any> = {
              kaufpreis: parsedKaufpreis,
              rvVirtualWohnung: {
                // Was die Objektauswahl schon kennt, bleibt erhalten.
                // Nur so gehen Zimmer, Fläche und Miete nicht verloren:
                // Der Datensatz wird zwar zusammengeführt, aber dieser
                // Zweig als Ganzes ersetzt. Beim ganzen Haus nicht: Dort
                // wären es die Angaben einer früheren Wohnung.
                ...(gesamtobjekt ? {} : (getInvestmentMetaField<Record<string, any>>(investmentId, "rvVirtualWohnung", {}) || {})),
                // Beim ganzen Haus ausdrücklich leer, sonst fragt der
                // Notar-Aufnahmebogen nach einer Wohneinheit.
                weNr: gesamtobjekt ? "" : (data.wohneinheit || bisher.weNr || ""),
                objAdresse: data.objStrasse || bisher.strasse || "",
                objPlz: data.objPlz || bisher.plz || "",
                objOrt: data.objOrt || bisher.ort || "",
                kaufpreis: parsedKaufpreis,
              },
              objektVerkaeufer: {
                ...(bisher.verkaeufer || {}),
                art: data.vkArt || bisher.verkaeufer?.art || "",
                name: data.vkName || bisher.verkaeufer?.name || "",
                // Bei einer Firma ausdrücklich leer, sonst bliebe ein
                // Vorname aus einer früheren Wahl in der Objektauswahl
                // stehen und käme im Notarbogen wieder hoch.
                vorname: data.vkArt === "firma"
                  ? ""
                  : (data.vkVorname || bisher.verkaeufer?.vorname || ""),
                strasse: data.vkStrasse || bisher.verkaeufer?.strasse || "",
                plz: data.vkPlz || bisher.verkaeufer?.plz || "",
                ort: data.vkOrt || bisher.verkaeufer?.ort || "",
              },
            };
            /*
             * Das Kennzeichen „Globalobjekt“ am Investment. An ihm erkennt
             * der Notar-Aufnahmebogen, dass es um das ganze Haus geht und
             * nicht um eine Wohnung darin.
             */
            if (gesamtobjekt) felder.globalObjekt = true;
            setInvestmentMetaFields(investmentId, felder);
          } catch (e) {
            console.error("Objektdaten konnten nicht zurückgeschrieben werden:", e);
            hinweise.push(
              `Die Objekt- und Verkäuferdaten konnten nicht ans Investment zurückgeschrieben werden (${(e as Error)?.message || "unbekannter Fehler"}). `
              + "Bitte im Kundenprofil unter „Objektdaten“ nachtragen, sonst fehlen sie im Notar-Aufnahmebogen.",
            );
          }
        }

        if (investmentId) bereitsGeschehen.unshift("Die Pipelinestufe steht auf „Reservierung“.");
        if (kundeId) bereitsGeschehen.unshift("Der Kontakt steht auf „qualifiziert“.");
        nebenHinweiseRef.current = hinweise;
        vorbereitetRef.current = true;

        // Nebenwege melden, sobald sie schiefgehen. Sie brechen den Vorgang
        // nicht ab, dürfen aber auch nicht im Protokoll verschwinden.
        for (const hinweis of hinweise) {
          toast({ title: "Bitte von Hand nachholen", description: hinweis, variant: "destructive" });
        }
      }

      /*
       * Die Function prüft das Objekt am gespeicherten Investment. Was eben
       * zurückgeschrieben wurde (Objekt, Kaufpreis), muss also schon in der
       * Datenbank stehen, sonst lehnt sie ab und überschreibt obendrein
       * `meta` mit dem alten Stand.
       */
      if (investmentId) await investmentGespeichert(investmentId);

      let ergebnis: VersandErgebnis;
      try {
        const { data: antwort, error } = await supabase.functions.invoke("send-reservation-signature", {
          body: {
            kontaktId: kundeId,
            investmentId,
            rvData,
            /*
             * Ohne E-Mail-Adresse. Die Function ermittelt sie seit dem
             * 16.09.2026 selbst aus dem Kontakt und ignoriert eine
             * mitgeschickte Adresse (Audit-Befund F03A). `personType` sagt
             * weiterhin, welche Unterschrift gemeint ist, `name` dient dort
             * nur noch als Rückfall.
             */
            persons: [
              { name: `${data.vorname} ${data.nachname}`, personType: "kaeufer1" },
              ...(!istGesellschaft && data.hatPerson2 && data.p2Email ? [{ name: `${data.p2Vorname} ${data.p2Nachname}`, personType: "kaeufer2" }] : []),
            ],
          },
        });
        // Den Grund aus dem Rumpf nachlesen. Ohne diesen Schritt steht in der
        // Meldung nur „Edge Function returned a non-2xx status code“, und das
        // stündliche Versandlimit sieht aus wie eine abgelaufene Anmeldung.
        ergebnis = versandErgebnisLesen(antwort, await edgeFehlerMitGrund(error));
      } catch (e) {
        console.error("Versand der Unterschriftsanfrage fehlgeschlagen:", e);
        ergebnis = versandErgebnisLesen(null, e);
      }

      if (ergebnis.art === "fehler") {
        setVersandFehler(ergebnis.text);
        toast({
          title: "Nicht versendet",
          description: "Der Versand wurde nicht bestätigt. Bitte den Hinweis lesen.",
          variant: "destructive",
        });
        const liste = bereitsGeschehen.length > 0
          ? `\n\nDas ist trotzdem schon geschehen:\n${bereitsGeschehen.map(z => `• ${z}`).join("\n")}`
          : "";
        await hinweisDialog({
          title: "Die Unterschrift wurde nicht angefordert",
          description:
            `${ergebnis.text}\n\nDer Versand wurde nicht bestätigt. In aller Regel heißt das, `
            + `dass der Kunde keine Mail bekommen hat und nicht unterschreiben kann.${liste}`
            + "\n\nDer Knopf „Jetzt Unterschrift anfordern“ bleibt aktiv. Ein zweiter Klick wiederholt nur den "
            + "Versand. Das ausgefüllte Formular bleibt erhalten, und Pipelinestufe, Kontaktstatus und "
            + "Benachrichtigung werden kein zweites Mal gesetzt. Der Kunde bekommt dabei einen neuen "
            + "Unterschriftslink. Sollte die erste Mail doch noch hinausgegangen sein, bleibt auch deren Link "
            + "gültig, beide führen zum selben Vorgang.",
          buttonText: "Verstanden",
        });
        return;
      }

      setVersandFehler(null);

      /*
       * Der Versand gehoert in die Kundenakte.
       *
       * Bisher blieb davon nur eine Bildschirmmeldung, die nach ein paar
       * Sekunden verschwindet, und ein Protokolleintrag mit dem falschen Text
       * „Reservierungs-PDF erstellt". Wer die Akte spaeter aufschlug, sah
       * nirgends, dass und wann die Vereinbarung hinausgegangen ist.
       *
       * Genau ein Eintrag je Vorgang, auch bei zwei Kaeufern: Der Aufruf oben
       * schickt beide Personen in EINEM Aufruf an die Function, es gibt hier
       * also nur einen Durchlauf.
       *
       * Verfasser ist der angemeldete Nutzer. Hier hat wirklich ein Mensch
       * gehandelt, anders als bei der Unterschrift. `addAktivitaet` setzt ihn
       * von selbst ein, solange `von` nicht gesetzt wird.
       */
      if (kundeId) {
        addAktivitaet({ kundeId, art: "notiz", beschreibung: versandNotiz("rv").text });
      }

      if (investmentId) {
        /*
          * Die eigene Art fuer diesen Fall, seit 16.09.2026.
          *
          * Vorher stand hier `alle_hochgeladen`, weil es nichts Passenderes
          * gab. In der Glocke las das Backoffice dann „Alle Pflichtunterlagen
          * wurden hochgeladen, bitte pruefen und freigeben“, obwohl hier nur
          * eine Reservierung zur Unterschrift hinausgegangen ist. Bei Jonas
          * Lins fuehrte das dazu, dass eine Pruefung angefordert wurde, zu der
          * es keine einzige Unterlage gab.
          */
        addDocNotification({
          type: "reservierung_versandt",
          kundeId: kundeId,
          kundeName: `${data.vorname} ${data.nachname}`,
          investmentId: investmentId,
          beraterName: "",
        });
      }

      /*
       * Englischer Kunde: Die Notarurkunde ist deutsch. Das Backoffice klärt
       * den Dolmetscher, bevor der Termin geplant wird (Plan Kundensprache 4.3).
       * Wirft nie und hält den Versand nicht auf.
       */
      await stelleDolmetscherAufgabeSicher({
        sprache: vertragssprache,
        kundeId,
        kundeName: istGesellschaft ? (data.firma || `${data.vorname} ${data.nachname}`) : `${data.vorname} ${data.nachname}`.trim(),
        investmentId,
      });

      if (ergebnis.art === "teilweise") {
        toast({
          title: "Teilweise versendet",
          description: ergebnis.text,
          variant: "destructive",
        });
        await hinweisDialog({
          title: "Nur ein Teil der Mails ging raus",
          description:
            `${ergebnis.text}\n\nEin zweiter Versuch würde dem anderen Käufer einen zweiten Link schicken, `
            + "deshalb wird hier nicht automatisch wiederholt. Bitte die fehlende Adresse prüfen und die Anfrage von Hand nachholen.",
          buttonText: "Verstanden",
        });
      } else {
        toast({
          title: "Unterschrift angefordert ✓",
          description: "Die Reservierungsvereinbarung wurde zur Unterschrift an den Kunden gesendet."
            + (vorgemerktBis
              ? ` ${gesamtobjekt ? "Das Haus" : "Die Einheit"} ist bis ${vorgemerktBis} Uhr für ihn vorgemerkt und bleibt frei, bis er unterschreibt.`
              : ""),
        });
      }

      if (nebenHinweiseRef.current.length > 0) {
        await hinweisDialog({
          title: "Bitte von Hand nachholen",
          description: nebenHinweiseRef.current.map(z => `• ${z}`).join("\n\n"),
          buttonText: "Verstanden",
        });
      }

      setSignatureSent(true);
      /*
       * Zurück, und zwar dorthin, wo der Nutzer hergekommen ist.
       *
       * Bisher stand hier beides: erst `onComplete`, dann ein fester Sprung
       * ins Kundenprofil. Der zweite Sprung überfuhr den ersten, das Ziel des
       * Aufrufers war damit wirkungslos. Jetzt entscheidet `onComplete`, und
       * nur ohne diesen bleibt der feste Weg.
       */
      setTimeout(() => {
        if (onComplete) onComplete();
        else navigate(ziel);
      }, 1500);
    } finally {
      setVersandLaeuft(false);
    }
  };

  /*
   * Beim ganzen Haus: Wer kauft? Pflichtwahl ohne Voreinstellung. Beim
   * Umlegen wird die Widerrufswahl zurückgesetzt, denn eine Gesellschaft hat
   * keine, und eine mitgereiste Wahl ließe `finalize-reservierung` sonst die
   * Frist abwarten.
   */
  const kaeuferArtWaehlen = (art: KaeuferArt) => {
    setData(prev => {
      const next = { ...prev, kaeuferArt: art, ...(art === "gesellschaft" ? { widerrufWahl: "" as WiderrufWahlWert } : {}) };
      save(storageKey, next);
      return next;
    });
    setErrors(new Set());
  };

  const renderKaeuferArt = () => (
    <div className={`rounded-lg border p-4 mb-6 ${errors.has("kaeuferArt") ? "border-destructive" : "border-border"}`}>
      <p className={`text-sm font-semibold mb-3 ${errors.has("kaeuferArt") ? "text-destructive" : ""}`}>
        Wer kauft das Haus? <span className="text-destructive">*</span>
      </p>
      <RadioGroup value={data.kaeuferArt || ""} onValueChange={(v) => kaeuferArtWaehlen(v as KaeuferArt)} className="gap-3">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="privat" id="kaeuferart-privat" />
          <label htmlFor="kaeuferart-privat" className="text-sm cursor-pointer">Privatperson(en)</label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="gesellschaft" id="kaeuferart-gesellschaft" />
          <label htmlFor="kaeuferart-gesellschaft" className="text-sm cursor-pointer">Gesellschaft, etwa eine GmbH</label>
        </div>
      </RadioGroup>
      {errors.has("kaeuferArt") && <p className="text-xs text-destructive mt-2">Bitte wähle, ob Privatpersonen oder eine Gesellschaft kaufen.</p>}
    </div>
  );

  /** Die Käuferin ist eine Gesellschaft: Felder aus Tabelle B des Entwurfs. */
  const renderGesellschaft = () => (
    <>
      <h2 className="text-lg font-bold mb-4">Käuferin</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Firma" required error={errors.has("firma")}><Input value={data.firma || ""} onChange={e => update("firma", e.target.value)} placeholder="z. B. Muster Immobilien GmbH" /></Field>
        <Field label="Rechtsform" required error={errors.has("rechtsform")}><Input value={data.rechtsform || ""} onChange={e => update("rechtsform", e.target.value)} placeholder="z. B. GmbH" /></Field>
        <Field label="Straße (Sitz / Anschrift)" required error={errors.has("firmaStrasse")}><Input value={data.firmaStrasse || ""} onChange={e => update("firmaStrasse", e.target.value)} /></Field>
        <Field label="Hausnummer" required error={errors.has("firmaHausnummer")}><Input value={data.firmaHausnummer || ""} onChange={e => update("firmaHausnummer", e.target.value)} /></Field>
        <Field label="PLZ" required error={errors.has("firmaPlz")}><Input value={data.firmaPlz || ""} onChange={e => update("firmaPlz", plzOnly(e.target.value))} inputMode="numeric" placeholder="z.B. 80331" /></Field>
        <Field label="Ort" required error={errors.has("firmaOrt")}><Input value={data.firmaOrt || ""} onChange={e => update("firmaOrt", e.target.value)} /></Field>
        <Field label="Registergericht" required error={errors.has("registergericht")}><Input value={data.registergericht || ""} onChange={e => update("registergericht", e.target.value)} placeholder="z. B. Amtsgericht München" /></Field>
        <Field label="Registernummer" required error={errors.has("registernummer")}><Input value={data.registernummer || ""} onChange={e => update("registernummer", e.target.value)} placeholder="z. B. HRB 123456, bei Gründung: in Gründung" /></Field>
      </div>
      <h3 className="text-sm font-semibold mt-6 mb-1">Vertreten durch</h3>
      {/*
        Den Unterschriftslink bekommt die E-Mail-Adresse am Kontakt. Der
        Kontakt muss deshalb der Vertreter sein, der hier unterschreibt.
      */}
      <p className="text-xs text-muted-foreground mb-3">
        Den Unterschriftslink bekommt die E-Mail-Adresse am Kontakt. Der Kontakt muss deshalb die Person sein, die für die Gesellschaft unterschreibt.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Vorname" required error={errors.has("vorname")}><Input value={data.vorname} onChange={e => update("vorname", e.target.value)} /></Field>
        <Field label="Nachname" required error={errors.has("nachname")}><Input value={data.nachname} onChange={e => update("nachname", e.target.value)} /></Field>
        <Field label="Funktion" required error={errors.has("vertreterFunktion")}><Input value={data.vertreterFunktion || ""} onChange={e => update("vertreterFunktion", e.target.value)} placeholder="z. B. Geschäftsführer" /></Field>
        <Field label="Telefon" required error={errors.has("telefon")}><PhoneInput value={data.telefon} onChange={v => update("telefon", v)} /></Field>
        <Field label="E-Mailadresse" required error={errors.has("email")}><Input value={data.email} onChange={e => update("email", e.target.value)} /></Field>
        {mitGebuehr && (
          <Field label="IBAN für die Rückzahlung der Reservierungsgebühr (freiwillig)" error={errors.has("iban")} hinweis="Diese IBAN ist ungültig. Eine deutsche IBAN hat 22 Zeichen und beginnt mit DE.">
            <Input value={data.iban || ""} onChange={e => update("iban", ibanEingabe(e.target.value))} placeholder="DE00 0000 0000 0000 0000 00" autoComplete="off" maxLength={27} />
          </Field>
        )}
      </div>
    </>
  );

  const renderStep0 = () => (
    <div>
      {gesamtobjekt && renderKaeuferArt()}
      {istGesellschaft
        ? renderGesellschaft()
        : (!gesamtobjekt || data.kaeuferArt === "privat") && renderPersonen()}
    </div>
  );

  /** Käufer 1 und gegebenenfalls Käufer 2 als Privatpersonen, wie bisher. */
  const renderPersonen = () => (
    <>
      <h2 className="text-lg font-bold mb-4">Käufer 1</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Vorname" required error={errors.has("vorname")}><Input value={data.vorname} onChange={e => update("vorname", e.target.value)} /></Field>
        <Field label="Nachname" required error={errors.has("nachname")}><Input value={data.nachname} onChange={e => update("nachname", e.target.value)} /></Field>
        <Field label="Geburtsname"><Input value={data.geburtsname || ""} onChange={e => update("geburtsname", e.target.value)} placeholder="nur falls abweichend" /></Field>
        <Field label="Geburtsdatum" required error={errors.has("geburtsdatum")}><DatePickerField value={data.geburtsdatum} onChange={v => update("geburtsdatum", v)} error={errors.has("geburtsdatum")} /></Field>
        <Field label="Geburtsort"><Input value={data.geburtsort || ""} onChange={e => update("geburtsort", e.target.value)} placeholder="freiwillig" /></Field>
        <Field label="Staatsangehörigkeit" required error={errors.has("staatsangehoerigkeit")}><Input value={data.staatsangehoerigkeit} onChange={e => update("staatsangehoerigkeit", e.target.value)} /></Field>
        <Field label="Straße" required error={errors.has("strasse")}><Input value={data.strasse} onChange={e => update("strasse", e.target.value)} /></Field>
        <Field label="Hausnummer" required error={errors.has("hausnummer")}><Input value={data.hausnummer} onChange={e => update("hausnummer", e.target.value)} /></Field>
        <Field label="PLZ" required error={errors.has("plz")}><Input value={data.plz} onChange={e => update("plz", plzOnly(e.target.value))} inputMode="numeric" placeholder="z.B. 80331" /></Field>
        <Field label="Ort" required error={errors.has("ort")}><Input value={data.ort} onChange={e => update("ort", e.target.value)} /></Field>
        <Field label="Telefon" required error={errors.has("telefon")}><PhoneInput value={data.telefon} onChange={v => update("telefon", v)} /></Field>
        <Field label="E-Mailadresse" required error={errors.has("email")}><Input value={data.email} onChange={e => update("email", e.target.value)} /></Field>
        {/*
          Das Konto für die Rückzahlung der Gebühr, im Abschnitt „Käuferdaten".
          Freiwillig seit dem 22.09.2026, und ganz weg, wenn keine Gebühr
          erhoben wird: Dann gibt es nichts zurückzuzahlen.
        */}
        {mitGebuehr && (
          <Field label="IBAN für die Rückzahlung der Reservierungsgebühr (freiwillig)" error={errors.has("iban")} hinweis="Diese IBAN ist ungültig. Eine deutsche IBAN hat 22 Zeichen und beginnt mit DE.">
            <Input value={data.iban || ""} onChange={e => update("iban", ibanEingabe(e.target.value))} placeholder="DE00 0000 0000 0000 0000 00" autoComplete="off" maxLength={27} />
          </Field>
        )}
        {showGueterstand && (
          <Field label="Güterstand" required error={errors.has("gueterstand")}>
            <Select value={data.gueterstand} onValueChange={v => update("gueterstand", v)}>
              <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
              <SelectContent>
                {["Zugewinngemeinschaft", "Gütertrennung", "Gütergemeinschaft"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {data.hatPerson2 && (
        <div className="mt-8 pt-6 border-t-2 border-primary/30">
          <h2 className="text-lg font-bold mb-4 text-primary">Käufer 2</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Vorname" required error={errors.has("p2Vorname")}><Input value={data.p2Vorname} onChange={e => update("p2Vorname", e.target.value)} /></Field>
            <Field label="Nachname" required error={errors.has("p2Nachname")}><Input value={data.p2Nachname} onChange={e => update("p2Nachname", e.target.value)} /></Field>
            <Field label="Geburtsname"><Input value={data.p2Geburtsname || ""} onChange={e => update("p2Geburtsname", e.target.value)} placeholder="nur falls abweichend" /></Field>
            <Field label="Geburtsdatum" required error={errors.has("p2Geburtsdatum")}><DatePickerField value={data.p2Geburtsdatum} onChange={v => update("p2Geburtsdatum", v)} error={errors.has("p2Geburtsdatum")} /></Field>
            <Field label="Geburtsort"><Input value={data.p2Geburtsort || ""} onChange={e => update("p2Geburtsort", e.target.value)} placeholder="freiwillig" /></Field>
            <Field label="Staatsangehörigkeit" required error={errors.has("p2Staatsangehoerigkeit")}><Input value={data.p2Staatsangehoerigkeit} onChange={e => update("p2Staatsangehoerigkeit", e.target.value)} /></Field>
            <Field label="Straße" required error={errors.has("p2Strasse")}><Input value={data.p2Strasse} onChange={e => update("p2Strasse", e.target.value)} /></Field>
            <Field label="Hausnummer" required error={errors.has("p2Hausnummer")}><Input value={data.p2Hausnummer} onChange={e => update("p2Hausnummer", e.target.value)} /></Field>
            <Field label="PLZ" required error={errors.has("p2Plz")}><Input value={data.p2Plz} onChange={e => update("p2Plz", plzOnly(e.target.value))} inputMode="numeric" placeholder="z.B. 80331" /></Field>
            <Field label="Ort" required error={errors.has("p2Ort")}><Input value={data.p2Ort} onChange={e => update("p2Ort", e.target.value)} /></Field>
            <Field label="Telefon" required error={errors.has("p2Telefon")}><PhoneInput value={data.p2Telefon} onChange={v => update("p2Telefon", v)} /></Field>
            <Field label="E-Mailadresse" required error={errors.has("p2Email")}><Input value={data.p2Email} onChange={e => update("p2Email", e.target.value)} /></Field>
            {mitGebuehr && (
              <Field label="IBAN für die Rückzahlung der Reservierungsgebühr (freiwillig)" error={errors.has("p2Iban")} hinweis="Diese IBAN ist ungültig. Eine deutsche IBAN hat 22 Zeichen und beginnt mit DE.">
                <Input value={data.p2Iban || ""} onChange={e => update("p2Iban", ibanEingabe(e.target.value))} placeholder="DE00 0000 0000 0000 0000 00" autoComplete="off" maxLength={27} />
              </Field>
            )}
          </div>
        </div>
      )}
    </>
  );

  /**
   * Die Objektdaten beim ganzen Haus (Teil 2 des Entwurfs): Kaufgegenstand
   * fest, Anzahl Einheiten und Aufteilung Pflicht, Grundbuch, Stellplätze und
   * Fläche freiwillig. Die Wohneinheit entfällt samt Pflichtprüfung.
   */
  const renderObjektGesamt = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Kaufgegenstand" className="md:col-span-2">
          <Input value={KAUFGEGENSTAND_GESAMTOBJEKT} readOnly disabled />
        </Field>
        <Field label="Anzahl Einheiten" required error={errors.has("anzahlEinheiten")} hinweis="Bitte die Zahl der Einheiten im Haus eintragen.">
          <Input value={data.anzahlEinheiten || ""} onChange={e => update("anzahlEinheiten", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="z. B. 8" />
        </Field>
        <Field label="Stellplätze / Garagen">
          <Input value={data.stellplaetzeGaragen || ""} onChange={e => update("stellplaetzeGaragen", e.target.value)} placeholder="z. B. 8 Stellplätze auf dem Grundstück" />
        </Field>
      </div>
      <div className={`rounded-lg border p-4 ${errors.has("aufteilung") ? "border-destructive" : "border-border"}`}>
        <p className={`text-sm font-semibold mb-3 ${errors.has("aufteilung") ? "text-destructive" : ""}`}>
          Aufteilung nach WEG <span className="text-destructive">*</span>
        </p>
        <RadioGroup value={data.aufteilung || ""} onValueChange={(v) => update("aufteilung", v as AufteilungWert)} className="gap-2">
          {AUFTEILUNG_AUSWAHL.map((a) => (
            <div key={a.wert} className="flex items-center gap-2">
              <RadioGroupItem value={a.wert} id={`aufteilung-${a.wert}`} />
              <label htmlFor={`aufteilung-${a.wert}`} className="text-sm cursor-pointer">{a.label}</label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground mt-2">„Noch offen“ erscheint nicht in der Vereinbarung.</p>
      </div>
      <div>
        <p className="text-sm font-semibold mb-2">Grundbuch (freiwillig)</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Amtsgericht"><Input value={data.grundbuchAmtsgericht || ""} onChange={e => update("grundbuchAmtsgericht", e.target.value)} placeholder="z. B. München" /></Field>
          <Field label="Gemarkung"><Input value={data.grundbuchGemarkung || ""} onChange={e => update("grundbuchGemarkung", e.target.value)} /></Field>
          <Field label="Flurstück(e)"><Input value={data.grundbuchFlurstueck || ""} onChange={e => update("grundbuchFlurstueck", e.target.value)} placeholder="z. B. 123/4" /></Field>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Straße" required error={errors.has("objStrasse")}><Input value={data.objStrasse} onChange={e => update("objStrasse", e.target.value)} /></Field>
        <Field label="PLZ" required error={errors.has("objPlz")}><Input value={data.objPlz} onChange={e => update("objPlz", plzOnly(e.target.value))} inputMode="numeric" /></Field>
        <Field label="Ort" required error={errors.has("objOrt")}><Input value={data.objOrt} onChange={e => update("objOrt", e.target.value)} /></Field>
        <Field label={preisBeschriftung(optionen)} required error={errors.has("gesamtpreis")}><Input value={data.gesamtpreis} onChange={e => update("gesamtpreis", formatTausender(e.target.value))} placeholder="z.B. 1.850.000" inputMode="numeric" /></Field>
        <Field label="Wohn- und Nutzfläche gesamt in m² (freiwillig)">
          <Input value={data.flaecheGesamt || ""} onChange={e => update("flaecheGesamt", e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Die Fläche steht nur im Datensatz und nicht in der Vereinbarung. Abweichende Flächen sind ein häufiger Streitpunkt, das Flurstück bezeichnet das Haus schon eindeutig.
      </p>
    </div>
  );

  const renderStep1 = () => (
    <div>
      <h2 className="text-lg font-bold mb-2">Objektdaten</h2>
      {/* Derselbe Satz wie im PDF, damit hier steht, was dort unterschrieben wird. */}
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">{objektEinleitung(optionen)}</p>
        {zeigtEnglisch && <EnglischeFassung text={objektEinleitung(optionen, "en")} />}
      </div>
      {gesamtobjekt ? renderObjektGesamt() : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Wohneinheit" required error={errors.has("wohneinheit")}><Input value={data.wohneinheit} onChange={e => update("wohneinheit", weNrOnly(e.target.value))} inputMode="numeric" placeholder="z. B. 6" /></Field>
        <Field label="Stellplatz / Nr."><Input value={data.stellplatz || ""} onChange={e => update("stellplatz", e.target.value)} placeholder="nur falls vorhanden" /></Field>
        <Field label="Garage / Nr."><Input value={data.garage || ""} onChange={e => update("garage", e.target.value)} placeholder="nur falls vorhanden" /></Field>
        <Field label="Straße" required error={errors.has("objStrasse")}><Input value={data.objStrasse} onChange={e => update("objStrasse", e.target.value)} /></Field>
        <Field label="PLZ" required error={errors.has("objPlz")}><Input value={data.objPlz} onChange={e => update("objPlz", plzOnly(e.target.value))} inputMode="numeric" /></Field>
        <Field label="Ort" required error={errors.has("objOrt")}><Input value={data.objOrt} onChange={e => update("objOrt", e.target.value)} /></Field>
        <Field label="Gesamtpreis" required error={errors.has("gesamtpreis")}><Input value={data.gesamtpreis} onChange={e => update("gesamtpreis", formatTausender(e.target.value))} placeholder="z.B. 363.000" inputMode="numeric" /></Field>
      </div>
      )}
      {/* Dolmetscher zur Beurkundung, Abschnitt 2 des Dokuments und Punkt 9. */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox id="dolmetscher" checked={!!data.dolmetscher} onCheckedChange={v => update("dolmetscher", !!v)} />
          <label htmlFor="dolmetscher" className="text-sm">Dolmetscher zur Beurkundung benötigt</label>
        </div>
        {/*
          Bei englischen Kunden ein Hinweis, kein Haken von selbst: Ob jemand
          genug Deutsch für die Beurkundung spricht, weiß nur der Berater. Die
          Urkunde selbst ist deutsch (Plan Kundensprache 4.3).
        */}
        {zeigtEnglisch && !data.dolmetscher && (
          <p className="text-xs text-[hsl(var(--warning))]">
            Der Kunde hat Englisch als Sprache. Die Notarurkunde ist deutsch. Bitte klären, ob zur Beurkundung ein Dolmetscher gebraucht wird.
          </p>
        )}
        {data.dolmetscher && (
          <Field label="Sprache" required error={errors.has("dolmetscherSprache")} className="md:w-1/2">
            <Input value={data.dolmetscherSprache || ""} onChange={e => update("dolmetscherSprache", e.target.value)} placeholder="z. B. Englisch" />
          </Field>
        )}
      </div>
    </div>
  );

  /*
   * Der Gebührenbetrag hängt am Kaufpreis aus Schritt 2 und wird bei jeder
   * Eingabe dort neu berechnet. Deshalb steht er hier und nicht im Zustand:
   * eine gespeicherte Kopie liefe auseinander, sobald jemand den Preis ändert.
   */
  const gebuehrDaten = gebuehrAbschnitt(
    data.gesamtpreis,
    data.objStrasse,
    data.wohneinheit,
    istGesellschaft ? (data.firma || "") : data.nachname,
    { gesamtobjekt },
  );

  const renderStep2 = () => (
    <div>
      <h2 className="text-lg font-bold mb-1">Reservierung</h2>
      {/*
        Alle Texte dieses Schritts stehen in `reservierungErklaerung.ts`, damit
        hier genau das steht, was der Kunde später im PDF unterschreibt. Auch
        die Abschnittsnummern kommen von dort und werden nicht hier getippt:
        Ohne Reservierungsgebühr fallen Abschnitte weg, und alles Folgende
        rückt auf.
      */}
      <p className="text-xs text-muted-foreground mb-5">
        Fassung des Vertragstextes: {aufbau.textFassung}
        {zeigtEnglisch && <> · englische Übersetzung {textFassungEn(optionen)}</>}
      </p>
      {/*
        Bei englischen Kunden geht die Vereinbarung zweisprachig hinaus. Das
        steht hier oben, damit niemand den englischen Text für einen Fehler
        hält, und mit der Vorrangklausel in beiden Sprachen, so wie sie im
        Dokument steht.
      */}
      {zeigtEnglisch && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-6 text-sm">
          <p className="font-semibold">Zweisprachige Vereinbarung</p>
          <p className="text-muted-foreground mt-1">
            Der Kunde hat Englisch als Sprache. Die Vereinbarung geht auf Deutsch und Englisch hinaus, maßgeblich ist die deutsche Fassung. Unter jedem Absatz steht hier die englische Fassung, wie sie auch im PDF steht.
          </p>
          <p className="mt-2 text-xs">{ZWEISPRACHIG_EINLEITUNG.de}</p>
          <EnglischeFassung text={ZWEISPRACHIG_EINLEITUNG.en} />
        </div>
      )}

      {/* ── Der Schieberegler zur Reservierungsgebühr ──
        Er steht hier und nicht beim Kunden: Dieses Formular füllt die interne
        Vorbereitung aus, der Kunde bekommt nur die Signaturseite und das PDF.
        Über die eigene Gebühr entscheidet niemand selbst.

        Standard ist „zahlt eine Gebühr". Der Regler steht unmittelbar über
        dem Abschnitt, den er ein- und ausblendet, damit die Wirkung
        unmittelbar zu sehen ist.
      */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor="gebuehr-entfaellt" className="text-sm font-semibold cursor-pointer">
              Kunde zahlt keine Reservierungsgebühr
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Standard ist, dass eine Gebühr erhoben wird. Wird der Regler umgelegt, entfallen der
              Gebührenabschnitt, die IBAN für die Rückzahlung und die Widerrufsbelehrung samt der
              Wahl zum Beginn der Reservierung. Die Reservierung wird dann sofort mit der
              Unterschrift wirksam.
            </p>
          </div>
          <Switch
            id="gebuehr-entfaellt"
            checked={!!data.gebuehrEntfaellt}
            onCheckedChange={(v) => {
              /*
               * Die Widerrufswahl wird beim Umlegen zurückgesetzt. Sonst
               * reiste eine Wahl mit, die im Dokument gar nicht mehr steht,
               * und `finalize-reservierung` würde die Wohnung vierzehn Tage
               * lang frei lassen, obwohl es keine Widerrufsfrist gibt.
               */
              setData(prev => {
                const next = { ...prev, gebuehrEntfaellt: !!v, ...(v ? { widerrufWahl: "" as WiderrufWahlWert } : {}) };
                save(storageKey, next);
                return next;
              });
              setErrors(prev => {
                const n = new Set(prev);
                n.delete("iban"); n.delete("p2Iban"); n.delete("widerrufWahl");
                return n;
              });
            }}
          />
        </div>
      </div>

      {/* ── Notar und Abwicklung ──
        Nur der Hinweis und der Freitext. Die Felder für ein vorgeschlagenes
        Notariat sind am 15.09.2026 entfallen.
      */}
      <h3 className="text-sm font-semibold mb-2">{aufbau.ueberschrift("notar")}<EnglischerTitel titel={aufbauEn?.abschnitt("notar")?.titel} /></h3>
      <div className="border-l-4 border-muted pl-4 text-sm text-muted-foreground leading-relaxed mb-4">
        <p><span className="font-medium text-foreground">Hinweis zur Beurkundung: </span>{NOTAR_HINWEIS}</p>
        {zeigtEnglisch && <EnglischeFassung text={textEn.notarHinweis} />}
      </div>
      <div className="mb-6">
        <Field label="Sonstige Informationen">
          <Textarea
            value={data.sonstigeInformationen || ""}
            onChange={e => update("sonstigeInformationen", e.target.value)}
            placeholder="freiwillig, etwa Wunschnotar, Terminwünsche, Besonderheiten der Finanzierung"
            rows={3}
          />
        </Field>
      </div>

      {/* ── Reservierungsgebühr ──
        Der Gebührenblock nennt den Betrag dieser Reservierung, nicht die
        allgemeine Regel: Er wird aus dem eingetragenen Kaufpreis berechnet.
        Fehlt der Kaufpreis, steht hier die Staffel. Die Rückzahlungsregel
        steht direkt darunter in den Punkten zur Rückzahlung und zum Verfall.
      */}
      {mitGebuehr && (
      <div className="rounded-lg border border-border bg-muted/30 p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">{aufbau.ueberschrift("gebuehr")}<EnglischerTitel titel={aufbauEn?.abschnitt("gebuehr")?.titel} /></h3>
        <div className="mb-3">
          <p className="text-sm text-muted-foreground">{gebuehrDaten.einleitung}</p>
          {zeigtEnglisch && <EnglischeFassung text={textEn.gebuehrEinleitung} />}
        </div>
        {/*
          Die Staffel steht immer da, auch wenn der Kaufpreis den Betrag schon
          festlegt: Sie ist der Vertragstext und gilt unabhängig vom Einzelfall.
        */}
        {/* Beim ganzen Haus gibt es keine Staffel, nur den festen Betrag darunter. */}
        {gebuehrDaten.staffel.length > 0 && (
        <ul className="space-y-1 text-sm mb-3">
          {gebuehrDaten.staffel.map((stufe) => (
            <li key={stufe.bereich} className="flex justify-between gap-4 border-b border-border/60 pb-1">
              <span className="text-muted-foreground">{stufe.bereich}</span>
              <span className="font-medium">{stufe.betrag}</span>
            </li>
          ))}
        </ul>
        )}
        <dl className="grid grid-cols-1 gap-y-2 text-sm">
          {gebuehrDaten.zeilen.map((z) => (
            <div key={z.label} className="flex justify-between gap-4 border-b border-border/60 pb-1">
              {/*
                Die betonte Zeile traegt den Betrag fuer genau diesen
                Kaufpreis. Beschriftung und Zahl stehen fett, damit sie sich
                von Kontoinhaber und IBAN darunter abhebt.
              */}
              <dt className={z.betont ? "font-bold text-foreground" : "text-muted-foreground"}>{z.label}</dt>
              <dd className={z.betont ? "font-bold text-right" : "font-medium text-right"}>{z.wert}</dd>
            </div>
          ))}
        </dl>
      </div>
      )}

      {/* ── Reservierungsvereinbarung ── */}
      <h3 className="text-sm font-semibold mb-2">{aufbau.ueberschrift("vereinbarung")}<EnglischerTitel titel={aufbauEn?.abschnitt("vereinbarung")?.titel} /></h3>
      <div className="border-l-4 border-muted pl-4 space-y-3 text-sm text-muted-foreground leading-relaxed mb-6">
        <div>
          <p>{VEREINBARUNG_EINLEITUNG}</p>
          {zeigtEnglisch && <EnglischeFassung text={textEn.vereinbarungEinleitung} />}
        </div>
        {aufbau.ziffern.map((z, i) => {
          const en = aufbauEn?.ziffern[i];
          return (
            <div key={z.nummer}>
              <p><span className="font-medium text-foreground">{z.nummer}</span> {z.text}</p>
              {z.punkte && (
                <ul className="mt-1 space-y-1 pl-4">
                  {z.punkte.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              {en && <EnglischeFassung text={[en.text, ...(en.punkte ?? [])].join(" ")} />}
            </div>
          );
        })}
      </div>

      {/* ── Datenschutzerklärung ──
        Ein Absatz ohne Haken: Das Einverständnis gilt mit der Unterschrift.
      */}
      <h3 className="text-sm font-semibold mb-2">{aufbau.ueberschrift("datenschutz")}<EnglischerTitel titel={aufbauEn?.abschnitt("datenschutz")?.titel} /></h3>
      <div className="border-l-4 border-muted pl-4 text-sm text-muted-foreground leading-relaxed mb-6">
        <p>
          {DATENSCHUTZ_EINVERSTAENDNIS}{" "}
          <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="text-primary font-medium cursor-pointer hover:underline">Datenschutzerklärung öffnen</a>
        </p>
        {zeigtEnglisch && <EnglischeFassung text={textEn.datenschutz} />}
      </div>

      {/* ── Widerrufsbelehrung ──
        Gesetzlicher Wortlaut im abgesetzten Kasten, darunter die Wahl zum
        Beginn. Die Wahl hat keine Voreinstellung: Genau eins ist anzukreuzen,
        und das soll der Kunde selbst tun.

        Ohne Reservierungsgebühr entfällt der ganze Teil, siehe
        `WIDERRUF_ENTFAELLT_OHNE_GEBUEHR` in `reservierungErklaerung.ts`.
      */}
      {aufbau.mitWiderruf && (<>
      <h3 className="text-sm font-semibold mb-2">{aufbau.ueberschrift("widerruf")}<EnglischerTitel titel={aufbauEn?.abschnitt("widerruf")?.titel} /></h3>
      <div className="rounded-lg border-2 border-border bg-background p-4 mb-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
        {WIDERRUFSBELEHRUNG.map((block) => (
          <div key={block.ueberschrift} className="space-y-2">
            <p className="font-semibold text-foreground">{block.ueberschrift}</p>
            {block.absaetze.map((a) => <p key={a}>{a}</p>)}
          </div>
        ))}
        {zeigtEnglisch && textEn.widerrufsbelehrung.map((block) => (
          <div key={block.ueberschrift} lang="en" className="space-y-1 border-t border-border/60 pt-2">
            <p className="text-xs font-semibold">EN · {block.ueberschrift}</p>
            {block.absaetze.map((a) => <p key={a} className="text-xs italic">{a}</p>)}
          </div>
        ))}
      </div>
      <div className={`rounded-lg border p-4 mb-3 ${errors.has("widerrufWahl") ? "border-destructive" : "border-border"}`}>
        <p className={`text-sm font-semibold mb-1 ${errors.has("widerrufWahl") ? "text-destructive" : ""}`}>
          {WIDERRUF_WAHL_TITEL} <span className="text-destructive">*</span>
        </p>
        <div className="mb-3">
          <p className="text-xs text-muted-foreground">{WIDERRUF_WAHL_EINLEITUNG}</p>
          {zeigtEnglisch && <EnglischeFassung text={`${textEn.widerrufWahlTitel}. ${textEn.widerrufWahlEinleitung}`} />}
        </div>
        <RadioGroup
          value={data.widerrufWahl || ""}
          onValueChange={(v) => update("widerrufWahl", v as WiderrufWahlWert)}
          className="gap-3"
        >
          {aufbau.widerrufWahlen.map((wahl, i) => {
            const en = aufbauEn?.widerrufWahlen[i];
            return (
              <div key={wahl.wert} className="flex items-start gap-2">
                <RadioGroupItem value={wahl.wert} id={`widerruf-${wahl.wert}`} className="mt-0.5" />
                <label htmlFor={`widerruf-${wahl.wert}`} className="text-sm leading-relaxed cursor-pointer">
                  <span className="font-medium">{wahl.satz}</span>{" "}
                  <span className="text-muted-foreground">{wahl.erlaeuterung}</span>
                  {en && <EnglischeFassung text={`${en.satz} ${en.erlaeuterung}`} />}
                </label>
              </div>
            );
          })}
        </RadioGroup>
      </div>
      <div className="mb-6">
        <p className="text-xs text-muted-foreground leading-relaxed">{aufbau.aufloesendeBedingung}</p>
        {aufbauEn && <EnglischeFassung text={aufbauEn.aufloesendeBedingung} />}
      </div>
      </>)}

      {/*
        Die ganze Zeile ist die Tippfläche, mindestens 44 px hoch (Befund vom
        24.09.2026: auf dem Handy traf man nur das winzige Kästchen). Das
        Kästchen steht dafür im Label, der Text bleibt wortgleich.
      */}
      <label
        htmlFor="erk"
        data-testid="erklaerung-zeile"
        className="-mx-2 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40"
      >
        <Checkbox checked={data.erklaerungAkzeptiert} onCheckedChange={v => update("erklaerungAkzeptiert", !!v)} id="erk" className="h-5 w-5 shrink-0" />
        <span className={`text-sm ${errors.has("erklaerungAkzeptiert") ? "text-destructive font-medium" : ""}`}>
          Ich akzeptiere die vorstehende Reservierungsvereinbarung <span className="text-destructive">*</span>
        </span>
      </label>
    </div>
  );

  const renderers = [renderStep0, renderStep1, renderStep2];

  return (
    <div className="apple-form">
    {/*
      Der Zurückweg, oben und vor dem Formular.

      Die Reservierungsvereinbarung geht im selben Reiter auf, es gibt also
      keinen zweiten Reiter mehr, den man einfach zuklappen könnte. Deshalb
      steht hier der Weg zurück dorthin, wo der Nutzer hergekommen ist.
    */}
    <div className="mb-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={zurueckGehen}
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> {zielBeschriftung}
      </Button>
    </div>
    <Card className="p-0 overflow-hidden">
      {/* Apple-style Fortschrittsbalken */}
      <FormProgress
        eyebrow="Reservierungsvereinbarung"
        steps={STEPS}
        current={step}
        onJump={(i) => {
          if (i > step) {
            const errs = validateRvStep(step, data, showGueterstand);
            if (errs.size > 0) {
              setErrors(errs);
              toast({ title: "Pflichtfelder ausfüllen", description: "Bitte alle markierten Felder ausfüllen.", variant: "destructive" });
              return;
            }
          }
          setErrors(new Set());
          setStep(i);
        }}
      />

      {/*
        Ohne Migration geht beim ganzen Haus nichts hinaus. Admin und Inhaber
        lesen, welche Migration fehlt; alle anderen nur, dass es noch nicht
        freigeschaltet ist.
      */}
      {hausOhneMigration && (
        <div className="px-6 pt-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{zeigtTechnikHinweise ? OBJEKT_RESERVIERUNG_MIGRATION_HINWEIS : "Reservierung des ganzen Hauses noch nicht freigeschaltet"}</AlertTitle>
            <AlertDescription>
              {zeigtTechnikHinweise
                ? `Solange ${OBJEKT_RESERVIERUNG_MIGRATION} nicht gelaufen ist, kann niemand das Haus festhalten. Deshalb lässt sich diese Vereinbarung nicht zur Unterschrift senden.`
                : "Diese Vereinbarung lässt sich noch nicht zur Unterschrift senden. Bitte wende dich an die Geschäftsleitung."}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="p-6">{renderers[step]()}</div>

      {/* Der letzte Fehlschlag bleibt stehen, bis der Versand geklappt hat. */}
      {versandFehler && (
        <div className="px-6 pb-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Die Unterschrift wurde nicht angefordert</AlertTitle>
            <AlertDescription>
              <p>{versandFehler}</p>
              <p className="mt-1">
                Der Kunde hat keine Mail bekommen. Der Knopf unten wiederholt nur den Versand, das Formular bleibt ausgefüllt.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t">
        {step > 0 ? <Button variant="outline" onClick={prev}>Zurück</Button> : <div />}
        {step < STEPS.length - 1 ? (
          <Button variant="brand" onClick={tryNext}>Weiter</Button>
        ) : (
          /*
            Nach dem Versand bleibt der Knopf gruen. Die Marken-Variante gilt
            deshalb nur davor: Sie zeichnet einen Verlauf, und ein Verlauf
            liegt ueber jeder Hintergrundfarbe. Das Gruen waere sonst
            wirkungslos, und der Erfolg nicht mehr zu erkennen.
          */
          <div className="flex flex-wrap items-center justify-end gap-2">
          {!signatureSent && <KundenspracheHinweis kontaktId={kundeId} />}
          <Button
            variant={signatureSent ? "default" : "brand"}
            disabled={!abschlussVollstaendig(data) || signatureSent || versandLaeuft || hausOhneMigration}
            className={signatureSent ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))] text-white" : ""}
            onClick={absenden}
          >
            {signatureSent
              ? <><Check className="h-4 w-4 mr-2" /> Unterschrift angefordert</>
              : <><Send className="h-4 w-4 mr-2" /> {versandFehler ? "Versand erneut versuchen" : "Jetzt Unterschrift anfordern"}</>}
          </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-3 border-t text-xs text-muted-foreground">
        <a href="/impressum" target="_blank" rel="noopener noreferrer" className="hover:underline cursor-pointer">Impressum</a>
        <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:underline cursor-pointer">Datenschutz</a>
      </div>
    </Card>
    </div>
  );
}
