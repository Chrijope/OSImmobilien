import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, Crown, Award, Flame, Sparkles, Handshake, ArrowRight, ExternalLink, MapPin, Calendar, Presentation, MonitorPlay, XCircle, ThumbsUp, RefreshCw, Mail, FileText, HandCoins, Clock, PhoneCall, Target, Pencil, AlertCircle, Circle, MessageSquare } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/hooks/use-toast";
import { updateBewerber, changeBewerberStatus, type Bewerber } from "@/lib/bewerbungStore";
import { sendeBewerberAbsageMail } from "@/lib/bewerberAbsageMail";
import {
  LIZENZ_PAKETE, WAEHLBARE_LIZENZ_PAKETE, ZAHLUNGSWEISEN, formatPreis, formatMonatlich, berechneRaten,
  GESTELLT_ZUSATZ_KURZ, LEAD_PAKET_PREIS, LEAD_PAKET_ANZAHL, LEAD_PAKET_PREIS_PRO_LEAD, LEAD_EINZELPREIS, berechneLeadAnzahl,
  PAKETE_MIT_VERTRAGSSCHALTERN,
  type LizenzPaketId, type Zahlungsweise,
} from "@/lib/lizenzPakete";
import { buildVertragPdf, uploadVertragPdf } from "@/lib/vertragGenerator";
import { featuresMitProvisionsSaetzen, leadpaketAnlageNummer, paketMitVertragsSchaltern, vertragsFassungKennung, vertragsFassungVon } from "@/lib/vertragKlauseln";
import { vertragsKonditionenStempel } from "@/lib/vertragsZusammenfassung";
import { sendeStartfahrplan, waehleStartfahrplanFassung } from "@/lib/startfahrplanVersand";
import { LEAD_QUALIFIZIERUNG_BUCHUNGSLINK, istClosingDirektAktiv } from "@/lib/closingDirektSkript";
import { moderationsUrl, praesentationsUrl } from "@/lib/praesentationsKopplung";
import { ablaufFuerBewerber } from "@/lib/bewerberArbeitsplatz";
import { useKennenlernenAntworten } from "@/components/bewerbung/useBewerberVideocall";
import {
  KennenlernbogenTagesordnung,
  KennenlernbogenUebersicht,
} from "@/components/bewerbung/KennenlernbogenKarte";
import { ENTSCHEIDUNG_LABELS, WUNSCH_LABELS } from "@/lib/bewerberVideocall";
import { berechneClosingFortschritt, CLOSING_SCHRITT_TITEL, type ClosingSchrittNr } from "@/lib/closingFortschritt";
import type { BewerberBuchungZeile } from "@/lib/bewerberTerminStore";
import {
  BEDENKZEIT_KANAELE, BEDENKZEIT_KANAL_STANDARD, BEDENKZEIT_ERINNERUNG_OPTIONEN,
  bedenkzeitErinnerungTage, bedenkzeitErinnerungsTag, erinnerungLabel,
} from "@/lib/bewerberErinnerungen";
import { berechneAssessmentScore, hatAssessmentDaten, staerksterPfad, EMPFEHLUNG_LABELS } from "@/lib/assessmentSkript";
import { formatDatum } from "@/lib/utils";
import { mailArtLabel } from "@/lib/bewerberMailTracking";
import { ClosingSchrittKarte } from "./ClosingSchrittKarte";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

/**
 * Terminkalender fuer das Folgegespraech mit Christian Kurz: eine Quelle fuer
 * alle Stellen (hier und Teil 2 des Erstgespraechs), definiert in
 * closingDirektSkript.ts. Gedacht fuer erfahrene Partner, die von Beginn an
 * mit Leads arbeiten wollen; das Gespraech findet vor dem Vertragsversand statt.
 */
const LEAD_FOLGEGESPRAECH_LINK = LEAD_QUALIFIZIERUNG_BUCHUNGSLINK;

type MailTracking = {
  token: string;
  bewerber_id: string;
  kind: string;
  paket: string | null;
  paket_titel: string | null;
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
  tracked: boolean;
};

const ICONS: Record<LizenzPaketId, React.ComponentType<{ className?: string }>> = {
  junior: Sparkles, lead_berater: Target, lead: Flame, team_builder: Award, enterprise: Crown, partner_2: Handshake, tippgeber: HandCoins,
};

const ZEIT_LABEL: Record<string, string> = { unter_10: "unter 10 Std", "10_bis_20": "10 bis 20 Std", vollzeit: "Vollzeit" };
const ERLAUBNIS_LABEL: Record<string, string> = {
  vorhanden: "Vorhanden", beantragt: "Beantragt", wuerde_beantragen: "Würde beantragen", lehnt_ab: "Lehnt ab",
};
const STARTWEICHE_LABEL: Record<string, string> = { direkt: "Will direkt starten", unterlagen: "Möchte Unterlagen" };

function formatVersandTs(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} · ${hh}:${mi} Uhr`;
}

/**
 * Kennzeichen für Werte, die Teil 2 des Erstgesprächs bereits erfasst hat.
 *
 * Bewusst ein Zeichen statt eines Textes: Der Vermerk stand an vier Karten
 * ausgeschrieben und hat die Balken überladen. Die Sprechblase ist von dem
 * grünen Haken daneben in Form UND Farbe verschieden (Haken grün, rund und
 * gefüllt; Sprechblase blau, eckig umrandet), damit beide nebeneinander
 * lesbar bleiben. Die Bedeutung steht im Titel beim Überfahren mit der Maus
 * und als Beschriftung für Vorlesewerkzeuge.
 */
const AusGespraechZeichen = ({ klein = false }: { klein?: boolean }) => (
  <span
    role="img"
    aria-label="aus dem Gespräch übernommen"
    title="aus dem Gespräch übernommen"
    className={`inline-flex shrink-0 items-center justify-center rounded border border-primary/40 bg-primary/5 text-primary ${
      klein ? "h-4 w-4" : "h-5 w-5"
    }`}
  >
    <MessageSquare className={klein ? "h-2.5 w-2.5" : "h-3 w-3"} />
  </span>
);

/** Hinweis, dass der Formularstand vom gespeicherten Stand abweicht. */
const NichtGespeichertBadge = () => (
  <Badge
    variant="outline"
    className="h-5 border-amber-400/60 text-[10px] text-amber-700 dark:text-amber-400"
    title="Die Anzeige rechts zeigt den gespeicherten Stand. Zum Übernehmen speichern."
  >
    nicht gespeichert
  </Badge>
);

export const ClosingTab = ({
  bewerber: b,
  canEdit,
  hrName,
  onRefresh,
  gebuchterTermin,
}: {
  bewerber: Bewerber;
  canEdit: boolean;
  hrName: string;
  onRefresh: () => void;
  /**
   * Der Termin aus `buchungen`, durchgereicht vom Arbeitsplatz. Ohne ihn
   * rechnet der Fortschritt allein mit den Feldern am Bewerber und kann einen
   * Termin uebersehen, den es gibt. Siehe `closingFortschritt.ts`.
   */
  gebuchterTermin?: BewerberBuchungZeile | null;
}) => {
  const [paket, setPaket] = useState<LizenzPaketId | "">((b.paketwahl as LizenzPaketId) || "");
  const [zw, setZw] = useState<Zahlungsweise>((b.zahlungsweise as Zahlungsweise) || "einmal");
  const [rechnungsAdresse, setRechnungsAdresse] = useState(b.rechnungsAdresse || "");
  // Vertragsanschrift: die Anschrift der Person, die den Vertrag
  // unterschreibt. Die Rechnungsadresse darf davon abweichen, etwa wenn
  // ueber eine Firma abgerechnet wird.
  const [vertragsAdresse, setVertragsAdresse] = useState(b.vertragsAdresse || "");
  // Strukturierte Rechnungsadresse (wird zu rechnungsAdresse zusammengebaut)
  const parseRA = (raw: string) => {
    const lines = (raw || "").split(/\r?\n/).map((l) => l.trim());
    const plzOrt = (lines[2] || "").match(/^(\d{4,5})\s+(.+)$/);
    /*
     * Die vierte Zeile trug früher die Umsatzsteuer-Identifikationsnummer.
     * Das Feld ist am 07.09.2026 entfallen. Sie wird hier weiter erkannt und
     * verworfen, damit sie in alten Adressen nicht als Ortszeile auftaucht.
     */
    const ust = "";
    return {
      name: lines[0] || "",
      strasse: lines[1] || "",
      // Ohne führende PLZ zählt die ganze Zeile als Ort. Vorher wanderte das
      // erste Wort ins PLZ-Feld, aus „München" wurde also PLZ „München" und
      // ein leerer Ort. Gleiche Auslegung wie im Abschlussformular der
      // Präsentation, damit beide Seiten denselben String gleich lesen.
      plz: plzOrt ? plzOrt[1] : "",
      ort: plzOrt ? plzOrt[2] : lines[2] || "",
      ust,
    };
  };
  const initial = parseRA(b.rechnungsAdresse || "");
  const initialVa = parseRA(b.vertragsAdresse || "");
  const [vaName, setVaName] = useState(initialVa.name);
  const [vaStrasse, setVaStrasse] = useState(initialVa.strasse);
  const [vaPlz, setVaPlz] = useState(initialVa.plz);
  const [vaOrt, setVaOrt] = useState(initialVa.ort);
  const [raName, setRaName] = useState(initial.name);
  const [raStrasse, setRaStrasse] = useState(initial.strasse);
  const [raPlz, setRaPlz] = useState(initial.plz);
  const [raOrt, setRaOrt] = useState(initial.ort);
  const [identischVertrag, setIdentischVertrag] = useState(false);
  const [entscheidung, setEntscheidung] = useState<"" | "ja" | "nein" | "bedenkzeit">(b.closingEntscheidung || "");
  const [bedenkzeitDatum, setBedenkzeitDatum] = useState(b.bedenkzeitRueckrufAm || "");
  const [bedenkzeitGrund, setBedenkzeitGrund] = useState(b.bedenkzeitGrund || "");
  // Follow-up zum Rückruf: Uhrzeit, Kanal (Standard Telefon), Erinnerung
  // (Standard 1 Tag vorher) und Vorbereitung. Getrennt vom Status Follow-Up.
  const [bedenkzeitUhrzeit, setBedenkzeitUhrzeit] = useState(b.bedenkzeitRueckrufUhrzeit || "");
  const [bedenkzeitKanal, setBedenkzeitKanal] = useState(b.bedenkzeitKanal || BEDENKZEIT_KANAL_STANDARD);
  const [bedenkzeitErinnerung, setBedenkzeitErinnerung] = useState<number>(bedenkzeitErinnerungTage(b));
  const [bedenkzeitVorbereitung, setBedenkzeitVorbereitung] = useState(b.bedenkzeitVorbereitung || "");
  const [bedenkzeitSpeichert, setBedenkzeitSpeichert] = useState(false);
  const [abgelehntGrund, setAbgelehntGrund] = useState(b.closingAbgelehntGrund || "");
  // Wertschätzende Absage-Mail beim Ablehnen: standardmäßig an
  const [absageMailSenden, setAbsageMailSenden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendingUebersicht, setSendingUebersicht] = useState(false);
  const [trackings, setTrackings] = useState<MailTracking[]>([]);
  const [tippgeberModell, setTippgeberModell] = useState<"euro" | "prozent">(
    (b.tippgeberProvisionsModell as "euro" | "prozent") || "euro",
  );
  const [tippgeberBetrag, setTippgeberBetrag] = useState<string>(b.tippgeberProvisionsBetrag || "");
  // Individuell im Closing vereinbarte Provisionssätze (nur Lead/Team/Lizenz)
  const [satzIndividuell, setSatzIndividuell] = useState<string>(b.satzIndividuell != null ? String(b.satzIndividuell) : "");
  const [satzLead, setSatzLead] = useState<string>(b.satzLead != null ? String(b.satzLead) : "");
  const [satzEigen, setSatzEigen] = useState<string>(b.satzEigen != null ? String(b.satzEigen) : "");
  const [satzBestand, setSatzBestand] = useState<string>(b.satzBestand != null ? String(b.satzBestand) : "");
  const [satzNeubau, setSatzNeubau] = useState<string>(b.satzNeubau != null ? String(b.satzNeubau) : "");
  // Altwerte der beiden Schalter "Ohne CRM-Gebühr" und "Ohne Mindestlaufzeit",
  // die es bis zum 06.09.2026 in Karte 3 gab. Seither gibt es weder ein
  // laufendes Entgelt noch eine Mindestlaufzeit; die gespeicherten Werte
  // werden nur noch unverändert durchgereicht, damit der Konditionen-Stempel
  // bereits erzeugter Verträge gültig bleibt.
  const ohneCrmGebuehr = !!b.ohneCrmGebuehr;
  const laufzeitOffen = !!b.laufzeitOffen;
  // Individuelle Fassung des Wettbewerbsparagraphen (nur für einzelne
  // Bewerber aktivierbar): kein Wettbewerbsverbot, Eigentumsregel für
  // Kontakte und Datenschutz gelten unverändert. Die erklärten anderen
  // Vertriebe stehen im Konditionenblatt (Anlage 1), in der Altfassung in
  // Anlage 8.
  const [individuelleFassung, setIndividuelleFassung] = useState<boolean>(!!b.individuelleVertragsFassung);
  const [andereVertriebe, setAndereVertriebe] = useState<string>(b.andereVertriebe || "");

  // Optionales Lead-Paket (nur Vertriebspartner): kein Kauf, Standardpaket
  // oder individueller Betrag mit abgeleiteter Leadanzahl.
  // Die vier Wege schliessen sich gegenseitig aus, deshalb eine Auswahl und
  // keine Schalter nebeneinander: kein Leadkauf, Leadpaket zum Festpreis,
  // Leadpaket mit individuellem Betrag oder der Einzelkauf einzelner Leads.
  // "einzeln" ist die Ausnahme (Standard bleibt "keins") und wird als
  // leadEinzelkauf am Bewerber gespeichert; ein Leadpaket gibt es dann nicht.
  type LeadPaketModus = "keins" | "paket" | "individuell" | "einzeln";
  const leadPaketModusVon = (bw: Pick<Bewerber, "leadPaket" | "leadEinzelkauf">): LeadPaketModus => {
    const lp = bw.leadPaket;
    if (!lp) return bw.leadEinzelkauf ? "einzeln" : "keins";
    return lp.betrag === LEAD_PAKET_PREIS && lp.anzahl === LEAD_PAKET_ANZAHL ? "paket" : "individuell";
  };
  const [leadPaketModus, setLeadPaketModus] = useState<LeadPaketModus>(leadPaketModusVon(b));
  const [leadPaketBetrag, setLeadPaketBetrag] = useState<string>(
    b.leadPaket && leadPaketModusVon(b) === "individuell" ? String(b.leadPaket.betrag) : "",
  );

  // Welche erledigten Karten hat die HR-Managerin per Stift wieder geöffnet?
  // Erledigte Karten sind eingeklappt, bleiben aber änderbar.
  const [offen, setOffen] = useState<Partial<Record<ClosingSchrittNr, boolean>>>({});
  const aufklappen = (nr: ClosingSchrittNr) => setOffen((o) => ({ ...o, [nr]: true }));
  const einklappen = (nr: ClosingSchrittNr) => setOffen((o) => ({ ...o, [nr]: false }));

  /**
   * Klick auf eine Zeile im Fortschritt: Karte aufklappen und hinspringen.
   * Das Aufklappen braucht einen Durchlauf, deshalb wird erst danach
   * gescrollt.
   */
  const springeZuSchritt = (nr: ClosingSchrittNr) => {
    aufklappen(nr);
    requestAnimationFrame(() => {
      const karte = document.querySelector(`[data-testid="closing-karte-${nr}"]`) as HTMLElement | null;
      // Optionaler Aufruf: In Testumgebungen gibt es scrollIntoView nicht.
      karte?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    setPaket((b.paketwahl as LizenzPaketId) || "");
    setZw((b.zahlungsweise as Zahlungsweise) || "einmal");
    setRechnungsAdresse(b.rechnungsAdresse || "");
    setVertragsAdresse(b.vertragsAdresse || "");
    const pv = parseRA(b.vertragsAdresse || "");
    setVaName(pv.name); setVaStrasse(pv.strasse); setVaPlz(pv.plz); setVaOrt(pv.ort);
    const p = parseRA(b.rechnungsAdresse || "");
    setRaName(p.name); setRaStrasse(p.strasse); setRaPlz(p.plz); setRaOrt(p.ort);
    setIdentischVertrag(false);
    setEntscheidung(b.closingEntscheidung || "");
    setBedenkzeitDatum(b.bedenkzeitRueckrufAm || "");
    setBedenkzeitGrund(b.bedenkzeitGrund || "");
    setBedenkzeitUhrzeit(b.bedenkzeitRueckrufUhrzeit || "");
    setBedenkzeitKanal(b.bedenkzeitKanal || BEDENKZEIT_KANAL_STANDARD);
    setBedenkzeitErinnerung(bedenkzeitErinnerungTage(b));
    setBedenkzeitVorbereitung(b.bedenkzeitVorbereitung || "");
    setAbgelehntGrund(b.closingAbgelehntGrund || "");
    setTippgeberModell((b.tippgeberProvisionsModell as "euro" | "prozent") || "euro");
    setTippgeberBetrag(b.tippgeberProvisionsBetrag || "");
    setSatzIndividuell(b.satzIndividuell != null ? String(b.satzIndividuell) : "");
    setSatzLead(b.satzLead != null ? String(b.satzLead) : "");
    setSatzEigen(b.satzEigen != null ? String(b.satzEigen) : "");
    setSatzBestand(b.satzBestand != null ? String(b.satzBestand) : "");
    setSatzNeubau(b.satzNeubau != null ? String(b.satzNeubau) : "");
    setIndividuelleFassung(!!b.individuelleVertragsFassung);
    setAndereVertriebe(b.andereVertriebe || "");
    setLeadPaketModus(leadPaketModusVon(b));
    setLeadPaketBetrag(
      b.leadPaket && leadPaketModusVon(b) === "individuell" ? String(b.leadPaket.betrag) : "",
    );
    setOffen({});
  }, [b.id]);

  // Nachtrag aus dem Videocall.
  //
  // Die Moderation des Videocalls läuft in einem zweiten Browser-Tab und
  // schreibt Vertragsanschrift, Rechnungsadresse und die Entscheidung direkt
  // ins Bewerberprofil. Über Realtime landet der neue
  // Stand im Cache, das Bewerbermanagement rendert neu und reicht ein frisches
  // `b` herein. Der große useEffect oben hängt aber nur an `b.id` und lief
  // deshalb nicht mit: Der Reiter zeigte weiter den Stand vom Öffnen, bis die
  // Seite neu geladen wurde. Diese Effekte hängen am gespeicherten Wert selbst
  // und ziehen genau dann nach, wenn er sich wirklich geändert hat.
  useEffect(() => {
    setVertragsAdresse(b.vertragsAdresse || "");
    const p = parseRA(b.vertragsAdresse || "");
    setVaName(p.name); setVaStrasse(p.strasse); setVaPlz(p.plz); setVaOrt(p.ort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.vertragsAdresse]);

  useEffect(() => {
    setRechnungsAdresse(b.rechnungsAdresse || "");
    const p = parseRA(b.rechnungsAdresse || "");
    setRaName(p.name); setRaStrasse(p.strasse); setRaPlz(p.plz); setRaOrt(p.ort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.rechnungsAdresse]);

  // Ohne die Entscheidung „ja" blieben die beiden Adressblöcke ausgeblendet,
  // obwohl der Bewerber sie gerade ausgefüllt hat.
  useEffect(() => {
    setEntscheidung(b.closingEntscheidung || "");
  }, [b.closingEntscheidung]);

  // Paket, Zahlungsweise und andere Vertriebe schreibt Teil 2 des
  // Erstgesprächs ebenfalls direkt ins Profil. Ohne diese Effekte führte der
  // Fortschritt Karte 3 als erledigt, während die Kopfzeile noch "Paket
  // wählen" zeigte, weil der Formularwert vom Öffnen stammte.
  useEffect(() => {
    setPaket((b.paketwahl as LizenzPaketId) || "");
  }, [b.paketwahl]);
  useEffect(() => {
    setZw((b.zahlungsweise as Zahlungsweise) || "einmal");
  }, [b.zahlungsweise]);
  useEffect(() => {
    setAndereVertriebe(b.andereVertriebe || "");
  }, [b.andereVertriebe]);
  // Bedenkzeit aus Teil 2: Rückruftermin und Grund.
  useEffect(() => {
    setBedenkzeitDatum(b.bedenkzeitRueckrufAm || "");
    setBedenkzeitGrund(b.bedenkzeitGrund || "");
  }, [b.bedenkzeitRueckrufAm, b.bedenkzeitGrund]);

  // Tracking-Einträge für Service-Mails laden (Open/Klick-Status)
  const loadTrackings = async () => {
    try {
      const { data, error } = await supabase
        .from("bewerber_mail_tracking")
        .select("token, bewerber_id, kind, paket, paket_titel, sent_at, opened_at, clicked_at, tracked")
        .eq("bewerber_id", b.id)
        .order("sent_at", { ascending: false });
      if (!error && data) setTrackings(data as MailTracking[]);
    } catch { /* noop */ }
  };
  useEffect(() => {
    loadTrackings();
    const ch = supabase
      .channel(`bewerber-mail-tracking-${b.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bewerber_mail_tracking", filter: `bewerber_id=eq.${b.id}` }, () => loadTrackings())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id]);

  // Strukturierte Felder → kombinierter rechnungsAdresse-String
  useEffect(() => {
    const lines = [
      raName.trim(),
      raStrasse.trim(),
      [raPlz.trim(), raOrt.trim()].filter(Boolean).join(" "),
    ].filter(Boolean);
    setRechnungsAdresse(lines.join("\n"));
  }, [raName, raStrasse, raPlz, raOrt]);

  useEffect(() => {
    const lines = [
      vaName.trim(),
      vaStrasse.trim(),
      [vaPlz.trim(), vaOrt.trim()].filter(Boolean).join(" "),
    ].filter(Boolean);
    setVertragsAdresse(lines.join("\n"));
  }, [vaName, vaStrasse, vaPlz, vaOrt]);

  // Checkbox "identisch mit Vertragsanschrift" → Felder automatisch befüllen.
  // Vorher zog der Haken die Privatadresse heran; seit es die
  // Vertragsanschrift gibt, ist sie die richtige Vorlage, denn sie steht
  // direkt darueber und ist bereits geprueft.
  const handleIdentisch = (checked: boolean) => {
    setIdentischVertrag(checked);
    if (!checked) return;
    setRaName(vaName); setRaStrasse(vaStrasse); setRaPlz(vaPlz); setRaOrt(vaOrt);
  };

  const aktiv = useMemo(() => LIZENZ_PAKETE.find(p => p.id === paket) ?? null, [paket]);
  const raten = useMemo(() => (aktiv ? berechneRaten(aktiv.preis, zw) : []), [aktiv, zw]);
  // Die Vertragsschalter (Leadauswahl, Individualfassung) gelten für alle
  // Pakete aus PAKETE_MIT_VERTRAGSSCHALTERN; individuelle Sätze zusätzlich
  // für die Bestandspakete.
  const hatVertragsSchalter = paket !== "" && PAKETE_MIT_VERTRAGSSCHALTERN.includes(paket);
  const supportsIndividuell = hatVertragsSchalter || paket === "lead" || paket === "team_builder" || paket === "enterprise";
  // Textfassung des Vertrags für diesen Bewerber: Bestandspartner mit
  // gesendetem oder unterschriebenem Vertrag bleiben in der langen
  // Altfassung, alle anderen bekommen die kompakte Fassung.
  const vertragsFassung = vertragsFassungVon(b, paket || undefined);
  const leadAnlage = leadpaketAnlageNummer(vertragsFassung);
  const nebentaetigkeitOrt = vertragsFassung === "alt" ? "Anlage 8" : "das Konditionenblatt (Anlage 1)";
  // Die Wettbewerbsklausel hat je Fassung eine andere Nummer: § 10 in der
  // langen Altfassung, § 8 in der kompakten Fassung (dort ist § 10 die
  // Vertragsstrafe). Die Oberflaeche sagte bis zur Fassung 2026-09-04
  // durchgaengig "§ 10" und beschriftete damit bei neuen Vertraegen den
  // falschen Paragraphen.
  const wettbewerbsParagraph = vertragsFassung === "alt" ? "§ 10" : "§ 8";
  // Closing-Sperre: Der Eigen-Satz und die Objektart-Sätze (Bestand/Neubau)
  // schließen sich aus, weil beide für denselben Abschluss gelten könnten und
  // der Vertrag dann eine Rangfolge bräuchte, die es in der Praxis nicht
  // gibt. Lead-Satz plus Eigen-Satz und Lead-Satz plus Bestand/Neubau bleiben
  // möglich; Altdaten mit beiden Feldern druckt der Vertrag weiterhin.
  const eigenGesperrtDurchObjektart = !!(satzBestand.trim() || satzNeubau.trim());
  const objektartGesperrtDurchEigen = !!satzEigen.trim();
  const parseSatz = (v: string): number | undefined => {
    const n = parseFloat((v || "").replace(",", "."));
    return isFinite(n) && n > 0 ? n : undefined;
  };
  const currentSaetze = () => ({
    individuell: parseSatz(satzIndividuell),
    lead: parseSatz(satzLead),
    eigen: parseSatz(satzEigen),
    bestand: parseSatz(satzBestand),
    neubau: parseSatz(satzNeubau),
  });

  // Abgeleitetes Lead-Paket aus der aktuellen Auswahl. Beim individuellen
  // Betrag gilt der Mindestbetrag eines Standardpakets, die Anzahl wird
  // abgerundet (berechneLeadAnzahl liefert 0 bei ungültigem Betrag).
  const leadPaketIndividuellBetrag = parseFloat((leadPaketBetrag || "").replace(",", "."));
  const leadPaketIndividuellAnzahl = berechneLeadAnzahl(leadPaketIndividuellBetrag);
  // Beim Einzelkauf gibt es kein Leadpaket: Damit kann die Kombination gar
  // nicht erst entstehen, die sich im Vertragstext beissen wuerde.
  const leadEinzelkauf = paket === "junior" && leadPaketModus === "einzeln";
  const gewaehltesLeadPaket: { betrag: number; anzahl: number } | null =
    paket !== "junior" || leadPaketModus === "keins" || leadPaketModus === "einzeln"
      ? null
      : leadPaketModus === "paket"
        ? { betrag: LEAD_PAKET_PREIS, anzahl: LEAD_PAKET_ANZAHL }
        : leadPaketIndividuellAnzahl > 0
          ? { betrag: leadPaketIndividuellBetrag, anzahl: leadPaketIndividuellAnzahl }
          : null;

  // Auto-Status: Sobald "Ja, will starten" + Paket gewählt -> Status "Paketwahl"
  useEffect(() => {
    if (entscheidung === "ja" && paket && b.status === "Closing") {
      changeBewerberStatus(b.id, "Paketwahl");
      onRefresh();
    }
  }, [entscheidung, paket, b.status, b.id, onRefresh]);

  const vName = b.vorname || "[Vorname]";

  // Der Fortschritt hängt an den GESPEICHERTEN Werten, siehe closingFortschritt.ts.
  // Aus der Mail-Verfolgung kommt nur der Aufruf des PDF-Links dazu (seit
  // 26.09.2026 ohne Zählpixel, deshalb `clicked_at` statt `opened_at`). Ob der Startfahrplan
  // versendet ist, entscheidet allein das Feld am Bewerber: Der Verfolgungseintrag
  // entsteht schon vor dem Versand und stünde nach einem Fehlschlag auf
  // "versendet", obwohl nie eine Mail ankam.
  const startfahrplanGeoeffnet = trackings.some((t) => t.kind === "paket_uebersicht" && !!t.clicked_at);
  const fortschritt = useMemo(
    () => berechneClosingFortschritt(b, { startfahrplanGeoeffnet, buchung: gebuchterTermin }),
    [b, startfahrplanGeoeffnet, gebuchterTermin],
  );
  const bewerberName = [b.vorname, b.nachname].filter(Boolean).join(" ");
  /*
   * In welchem Ablauf der Bewerber steht.
   *
   * Hinter den beiden Knöpfen der Karte 1 liegt seit dem 23.09.2026 für jeden
   * Bewerber derselbe Videocall. Der Ablauf entscheidet nur noch über den
   * Hinweis darunter und über den Kennenlernbogen weiter unten.
   *
   * Derselbe Reiter läuft im Bewerbungsmanagement und im Bewerberprozess, und
   * ein Bewerber steht in genau einer der beiden Listen. Deshalb hängt der
   * Ablauf am Kennzeichen des Bewerbers und nicht an der Seite, genau wie im
   * Reiter Videocall. Abgeleitet wird er über bewerberArbeitsplatz.ts, damit
   * die Regel nicht an jedem Reiter neu entsteht.
   */
  const neuerProzess = ablaufFuerBewerber(b).id === "neu";
  /*
   * Im neuen Ablauf ersetzt der Kennenlernbogen den Kasten „Aus dem
   * Erstgespräch". Dort stand alles aus `assessment` und nichts aus dem
   * Persönliches Gespräch, also genau das, was in diesem Ablauf niemand
   * ausfüllt. Ohne Kennzeichen bleibt die Kennung leer und der Haken lädt
   * nichts.
   */
  const { antworten: kennenlernen } = useKennenlernenAntworten(neuerProzess ? b.id : "");
  const videocall = b.erstgespraechSkript?.bewerberVideocall;
  const teil2Aktiv = istClosingDirektAktiv(b.erstgespraechSkript?.closingDirekt);
  const startfahrplanFassung = useMemo(() => waehleStartfahrplanFassung(b), [b]);

  // Konditionen-Wächter: Wurde der Vertrag mit anderen Konditionen erzeugt
  // als jetzt gespeichert sind? Dann weist Karte 6 darauf hin. Gleicher
  // Vergleich wie im Reiter Vertrag.
  const vertragVeraltet =
    !!b.paketBestaetigtAm &&
    b.vertragStatus !== "unterschrieben" &&
    !!b.vertragKonditionenStand &&
    b.vertragKonditionenStand !== vertragsKonditionenStempel(b);

  const handlePaketBestaetigen = async () => {
    if (!paket || !aktiv) {
      toast({ title: "Bitte zuerst ein Paket wählen", variant: "destructive" });
      return;
    }
    if (paket === "tippgeber") {
      const val = tippgeberBetrag.replace(",", ".").trim();
      if (!val || isNaN(Number(val)) || Number(val) <= 0) {
        toast({ title: "Tippgeber-Vergütung fehlt", description: "Bitte trag die vereinbarte Provision (€ oder %) ein, bevor du den Vertrag erzeugst.", variant: "destructive" });
        return;
      }
    }
    if (!vertragsAdresse.trim()) {
      toast({ title: "Vertragsanschrift fehlt", description: "Ohne Anschrift des Vertriebspartners kann der Vertrag nicht erstellt werden.", variant: "destructive" });
      return;
    }
    if (!rechnungsAdresse.trim()) {
      toast({ title: "Rechnungsadresse fehlt", description: "Bitte trag die vollständige Rechnungsadresse ein, bevor du den Vertrag erstellst.", variant: "destructive" });
      return;
    }
    if (paket === "junior" && leadPaketModus === "individuell" && !gewaehltesLeadPaket) {
      toast({
        title: "Lead-Paket unvollständig",
        description: `Der individuelle Betrag muss mindestens ${formatPreis(LEAD_PAKET_PREIS)} netto betragen.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const isRegenerate = Boolean(b.paketBestaetigtAm);
      // 1) Paket + Zahlweise + Rechnungsadresse speichern
      await updateBewerber(b.id, {
        paketwahl: paket, zahlungsweise: zw, rechnungsAdresse, vertragsAdresse,
        closingEntscheidung: "ja",
        tippgeberProvisionsModell: paket === "tippgeber" ? tippgeberModell : undefined,
        tippgeberProvisionsBetrag: paket === "tippgeber" ? tippgeberBetrag : "",
        satzIndividuell: supportsIndividuell ? satzIndividuell : "",
        satzLead: supportsIndividuell ? satzLead : "",
        satzEigen: supportsIndividuell ? satzEigen : "",
        satzBestand: supportsIndividuell ? satzBestand : "",
        satzNeubau: supportsIndividuell ? satzNeubau : "",
        ohneCrmGebuehr,
        laufzeitOffen,
        individuelleVertragsFassung: individuelleFassung,
        andereVertriebe,
        leadPaket: gewaehltesLeadPaket ?? undefined,
        leadEinzelkauf,
      });

      // 2) Vertrag automatisch generieren. Die beiden Vertragsschalter gehen
      //    wie alle anderen Formularwerte ausdrücklich mit, statt sich auf den
      //    Stand von `b` zu verlassen: PDF und Stempel sollen exakt das
      //    tragen, was in Karte 3 sichtbar ist.
      const version = (b.vertragVersion || 0) + 1;
      const blob = await buildVertragPdf({
        bewerber: {
          ...b,
          rechnungsAdresse,
          vertragsAdresse,
          tippgeberProvisionsModell: paket === "tippgeber" ? tippgeberModell : b.tippgeberProvisionsModell,
          tippgeberProvisionsBetrag: paket === "tippgeber" ? tippgeberBetrag : b.tippgeberProvisionsBetrag,
          satzIndividuell: supportsIndividuell ? satzIndividuell : "",
          satzLead: supportsIndividuell ? satzLead : "",
          satzEigen: supportsIndividuell ? satzEigen : "",
          satzBestand: supportsIndividuell ? satzBestand : "",
          satzNeubau: supportsIndividuell ? satzNeubau : "",
          ohneCrmGebuehr,
          laufzeitOffen,
          individuelleVertragsFassung: individuelleFassung,
          andereVertriebe,
          leadPaket: gewaehltesLeadPaket ?? undefined,
        leadEinzelkauf,
          // Die Kennung, die unten gespeichert wird, schon beim Erzeugen: Sonst
          // baute eine alte gespeicherte Kennung den Text ohne Anlage 4.
          vertragFassung: vertragsFassungKennung({ ...b, paketwahl: paket }, paket),
        },
        paketId: paket,
        zahlungsweise: zw,
        hrName,
        version,
        saetze: supportsIndividuell ? currentSaetze() : undefined,
      });
      const url = await uploadVertragPdf(b.id, blob, "draft");
      // Bei Neu-Erstellung mit geändertem Paket: Versand-/Signatur-Status zurücksetzen,
      // damit der Bewerber den aktualisierten Vertrag erneut zur Unterschrift bekommt.
      const resetSendState = isRegenerate
        ? {
            vertragDatum: "",
            vertragErstVersandAt: "",
            vertragErinnerungenAt: [] as string[],
          }
        : {};
      await updateBewerber(b.id, {
        ...resetSendState,
        vertragPdfUrl: url,
        vertragVersion: version,
        vertragHrName: hrName,
        vertragStatus: "nicht_gesendet",
        paketBestaetigtAm: new Date().toISOString(),
        // Textfassung, mit der dieses PDF erzeugt wurde (kompakt oder alt).
        vertragFassung: vertragsFassungKennung({ ...b, paketwahl: paket }, paket),
        // Merkt sich, mit welchen Konditionen dieses PDF erzeugt wurde,
        // exakt die Werte, die oben in buildVertragPdf eingeflossen sind.
        vertragKonditionenStand: vertragsKonditionenStempel({
          ...b,
          paketwahl: paket,
          zahlungsweise: zw,
          tippgeberProvisionsModell: paket === "tippgeber" ? tippgeberModell : b.tippgeberProvisionsModell,
          tippgeberProvisionsBetrag: paket === "tippgeber" ? tippgeberBetrag : b.tippgeberProvisionsBetrag,
          satzIndividuell: supportsIndividuell ? satzIndividuell : "",
          satzLead: supportsIndividuell ? satzLead : "",
          satzEigen: supportsIndividuell ? satzEigen : "",
          satzBestand: supportsIndividuell ? satzBestand : "",
          satzNeubau: supportsIndividuell ? satzNeubau : "",
          ohneCrmGebuehr,
          laufzeitOffen,
          individuelleVertragsFassung: individuelleFassung,
          andereVertriebe,
          leadPaket: gewaehltesLeadPaket ?? undefined,
        leadEinzelkauf,
        }),
      });

      // 3) Status weiterschalten
      if (b.status === "Closing" || b.status === "Paketwahl") {
        changeBewerberStatus(b.id, "Vertrag");
      }

      setOffen({});
      onRefresh();
      toast({
        title: isRegenerate ? "Vertrag neu erstellt" : "Paket bestätigt – Vertrag erstellt",
        description: isRegenerate
          ? `Handelsvertretervertrag „${aktiv.titel}" v${version} wurde mit dem geänderten Vertragsdokument neu erzeugt und überschreibt die vorherige Version. Bitte im Reiter „Vertrag" erneut zur Unterschrift senden.`
          : `Handelsvertretervertrag „${aktiv.titel}" v${version} wurde generiert. Wechsle in den Reiter „Vertrag", um ihn zu senden.`,
      });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Vertrag konnte nicht generiert werden.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const speichern = () => {
    updateBewerber(b.id, {
      paketwahl: paket || "", zahlungsweise: zw, rechnungsAdresse, vertragsAdresse,
      closingEntscheidung: entscheidung, closingAbgelehntGrund: abgelehntGrund,
      tippgeberProvisionsModell: paket === "tippgeber" ? tippgeberModell : undefined,
      tippgeberProvisionsBetrag: paket === "tippgeber" ? tippgeberBetrag : "",
      satzIndividuell: supportsIndividuell ? satzIndividuell : "",
      satzLead: supportsIndividuell ? satzLead : "",
      satzEigen: supportsIndividuell ? satzEigen : "",
      satzBestand: supportsIndividuell ? satzBestand : "",
      satzNeubau: supportsIndividuell ? satzNeubau : "",
      ohneCrmGebuehr,
      laufzeitOffen,
      individuelleVertragsFassung: individuelleFassung,
      andereVertriebe,
      leadPaket: gewaehltesLeadPaket ?? undefined,
        leadEinzelkauf,
    });
    onRefresh();
    toast({ title: "Closing-Daten gespeichert" });
  };

  /** Speichern aus einer Karte heraus: dieselben Daten, danach klappt die Karte ein. */
  const speichernUndEinklappen = (nr: ClosingSchrittNr) => {
    speichern();
    einklappen(nr);
  };

  /**
   * „Ja, will starten" wird sofort gespeichert, genau wie in Teil 2 des
   * Erstgesprächs (waehleEntscheidung). Erst dadurch schalten die Karten 3
   * und 4 frei, deren Zustand an den gespeicherten Feldern hängt.
   */
  const waehleJa = () => {
    setEntscheidung("ja");
    updateBewerber(b.id, { closingEntscheidung: "ja" });
    einklappen(2);
    onRefresh();
  };

  const handlePaketUebersichtSenden = async () => {
    if (!b.email) {
      toast({ title: "Keine E-Mail hinterlegt", description: "Trag im Bewerberprofil eine E-Mail-Adresse ein, bevor du den Startfahrplan versendest.", variant: "destructive" });
      return;
    }
    setSendingUebersicht(true);
    try {
      // Eine Versandlogik für alle Auslöser (auch Teil 2 des Erstgesprächs),
      // siehe startfahrplanVersand.ts. Sie wählt auch die Fassung: erweitert
      // nach komplettem Teil 1 plus Teil 2, sonst der kompakte Bestand. Das
      // aktuell gewählte Paket mitgeben (Formularwert vor gespeicherter
      // Paketwahl): beim Lead-Berater druckt der Fahrplan den
      // Bereitstellungs-Absatz statt des Kaufabsatzes.
      const ergebnis = await sendeStartfahrplan(b, { hrName, paketId: paket || b.paketwahl || "" });
      onRefresh();
      loadTrackings();
      toast({
        title: ergebnis?.fassung === "erweitert"
          ? "Startfahrplan (erweiterte Fassung) versendet"
          : "Startfahrplan versendet",
        description: `Dein Startfahrplan bei MOREImmo (PDF) wurde an ${b.email} geschickt.`,
      });
    } catch (e) {
      toast({
        title: "Versand fehlgeschlagen",
        description: e instanceof Error ? e.message : "Bitte erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setSendingUebersicht(false);
    }
  };

  /**
   * Setzt den Bewerber auf Bedenkzeit.
   *
   * Der Rückruftermin ist Pflicht. Eine Bedenkzeit ohne Termin unterscheidet
   * sich nicht vom Liegenlassen, und genau das war der bisherige Zustand:
   * Wer weder Ja noch Nein sagte, blieb unsichtbar im Status Closing.
   */
  const handleBedenkzeit = async () => {
    if (!bedenkzeitDatum.trim()) {
      toast({
        title: "Bitte einen Rückruftermin setzen",
        description: "Ohne Termin geht der Bewerber erfahrungsgemäß verloren.",
        variant: "destructive",
      });
      return;
    }
    setBedenkzeitSpeichert(true);
    try {
      updateBewerber(b.id, {
        closingEntscheidung: "bedenkzeit",
        bedenkzeitRueckrufAm: bedenkzeitDatum.trim(),
        bedenkzeitGrund: bedenkzeitGrund.trim(),
        bedenkzeitRueckrufUhrzeit: bedenkzeitUhrzeit.trim(),
        bedenkzeitKanal,
        bedenkzeitErinnerungTage: bedenkzeitErinnerung,
        bedenkzeitVorbereitung: bedenkzeitVorbereitung.trim(),
      });
      // Der Statuswechsel läuft nur einmal; beim späteren Nachpflegen des
      // Rückrufs bleibt der Status, sonst gäbe es jedes Mal eine Meldung.
      const bereitsBedenkzeit = b.status === "Bedenkzeit";
      if (!bereitsBedenkzeit) changeBewerberStatus(b.id, "Bedenkzeit");
      toast({
        title: bereitsBedenkzeit ? "Rückruf gespeichert" : "Auf Bedenkzeit gesetzt",
        description: `Rückruf am ${formatDatum(bedenkzeitDatum.trim())}${bedenkzeitUhrzeit.trim() ? ` um ${bedenkzeitUhrzeit.trim()} Uhr` : ""} vorgemerkt, Erinnerung ${erinnerungLabel(bedenkzeitErinnerung)} in der Inbox.`,
      });
      onRefresh();
    } finally {
      setBedenkzeitSpeichert(false);
    }
  };

  /**
   * Nach dem Rückruf: Die Entscheidungsknöpfe wieder freigeben. Der Status
   * bleibt Bedenkzeit, bis Ja oder Nein gesetzt ist; die Erinnerung in der
   * Inbox verschwindet dann von selbst.
   */
  const rueckrufErledigt = () => {
    setEntscheidung("");
    toast({ title: "Rückruf erledigt", description: "Jetzt die Entscheidung erfassen: Ja, Nein oder erneut Bedenkzeit." });
  };

  const handleZurueckziehen = async () => {
    if (!abgelehntGrund.trim()) {
      toast({ title: "Bitte Grund angeben", description: "Trag kurz den Grund ein, warum der Interessent nicht starten möchte.", variant: "destructive" });
      return;
    }
    updateBewerber(b.id, {
      closingEntscheidung: "nein", closingAbgelehntGrund: abgelehntGrund,
    });
    changeBewerberStatus(b.id, "Abgelehnt");
    // Wertschätzende Absage-Mail (optional, best-effort): der Statuswechsel
    // ist bereits erledigt und darf am Mailversand nicht scheitern.
    let mailHinweis = "Es wurde keine Mail an den Bewerber gesendet.";
    if (absageMailSenden) {
      const mail = await sendeBewerberAbsageMail(b);
      mailHinweis = mail.ok
        ? `Die Absage-Mail wurde an ${b.email} gesendet.`
        : `Die Absage-Mail konnte nicht gesendet werden (${mail.grund}).`;
    }
    onRefresh();
    toast({ title: "Bewerbung abgelehnt", description: `Status auf „Kein Interesse / Abgelehnt" gesetzt. ${mailHinweis}` });
  };

  // ── Abgeleitete Anzeigen ──
  const schritt = (nr: ClosingSchrittNr) => fortschritt.schritte[nr - 1];
  // Maßgeblich ist das Feld am Bewerber, es wird erst nach erfolgreichem
  // Versand gesetzt. Der Verfolgungseintrag entsteht davor und darf deshalb
  // nicht als Beleg für den Versand dienen.
  const startfahrplanVersendetAm = b.paketUebersichtSentAt || "";

  /**
   * Weicht der Formularstand vom gespeicherten ab? Balken und Seitenleiste
   * zeigen beide den gespeicherten Stand (eine Quelle). Damit eine gerade
   * getroffene, noch nicht gespeicherte Auswahl nicht unsichtbar bleibt,
   * bekommt die Karte stattdessen den Hinweis "nicht gespeichert".
   */
  const paketUngespeichert =
    paket !== ((b.paketwahl as LizenzPaketId) || "") ||
    zw !== ((b.zahlungsweise as Zahlungsweise) || "einmal") ||
    individuelleFassung !== !!b.individuelleVertragsFassung ||
    leadEinzelkauf !== !!b.leadEinzelkauf ||
    (gewaehltesLeadPaket?.anzahl ?? null) !== (b.leadPaket?.anzahl ?? null) ||
    (gewaehltesLeadPaket?.betrag ?? null) !== (b.leadPaket?.betrag ?? null) ||
    tippgeberBetrag !== (b.tippgeberProvisionsBetrag || "");
  const adressenUngespeichert =
    vertragsAdresse.trim() !== (b.vertragsAdresse || "").trim() ||
    rechnungsAdresse.trim() !== (b.rechnungsAdresse || "").trim();
  const entscheidungUngespeichert = entscheidung !== (b.closingEntscheidung || "");

  // Welche Werte stammen aus Teil 2? Der Hinweis steht einmal im Kopf, an den
  // Karten selbst nur noch als Zeichen. Schritt 1 bleibt außen vor, "das
  // Gespräch stammt aus dem Gespräch" sagt nichts.
  const uebernommeneSchritte = fortschritt.schritte
    .filter((s) => s.ausGespraech && s.nr !== 1)
    .map((s) => s.titel);
  const assessment = b.erstgespraechSkript?.assessment;
  const score = assessment && hatAssessmentDaten(assessment) ? berechneAssessmentScore(assessment) : null;
  const profil = staerksterPfad(assessment?.pfade);
  const startWeiche = b.erstgespraechSkript?.closingDirekt?.startWeiche || "";
  // Rechnerwert aus Teil 2: personalisiert die erweiterte Fassung des Startfahrplans.
  const rechnerAbschluesse = (b.erstgespraechSkript?.closingDirekt?.notizen?.rechnerAbschluesse || "").trim();
  const folgeCallAngeboten = b.erstgespraechSkript?.closingDirekt?.qualiCallAngeboten === true;

  // Text aus derselben Quelle wie die Seitenleiste, nur die Farbe hängt an
  // der Entscheidung. Vorher hatte das Badge eine eigene Formulierung.
  const entscheidungBadge = (() => {
    const e = fortschritt.entscheidung;
    const text = schritt(2).kurz;
    if (e === "ja") return <Badge className="h-5 bg-green-600 text-white hover:bg-green-600 text-[10px]">{text}</Badge>;
    if (e === "nein") return <Badge variant="destructive" className="h-5 text-[10px]">{text}</Badge>;
    if (e === "bedenkzeit") return <Badge className="h-5 bg-violet-600 text-white hover:bg-violet-600 text-[10px]">{text}</Badge>;
    return <Badge variant="secondary" className="h-5 text-[10px]">offen</Badge>;
  })();

  return (
    <div className="space-y-4">
      {/* ── Kopf: Chips, nächster Schritt, Stand ── */}
      <Card className="p-4 space-y-3" data-testid="closing-kopf">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(b.closingTerminDatum || b.closingTerminUhrzeit) && (
              <Badge variant="outline" className="h-6 gap-1 border-primary/40 bg-primary/5 text-[11px] text-primary">
                <Calendar className="h-3 w-3" />
                Closing-Termin: {formatDatum(b.closingTerminDatum)}{b.closingTerminUhrzeit && ` um ${b.closingTerminUhrzeit} Uhr`}
              </Badge>
            )}
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">Entscheidung: {entscheidungBadge}</span>
            {b.paketBestaetigtAm ? (
              <Badge className="h-5 bg-blue-600 text-white hover:bg-blue-600 text-[10px]">
                Vertrag {schritt(6).kurz}
              </Badge>
            ) : (
              <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                {fortschritt.teil2Komplett
                  ? "Teil 2 im Gespräch komplett"
                  : teil2Aktiv
                    ? "Teil 2 im Gespräch begonnen"
                    : "Teil 1 am Telefon · Präsentation folgt im Videocall"}
              </Badge>
            )}
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Nächster Schritt: </span>
            <span className="font-semibold text-primary" data-testid="closing-naechster-schritt">{fortschritt.naechsterSchritt}</span>
          </div>
        </div>
        {/* Die sechs Kästchen mit den Schrittnamen standen hier früher ein
            drittes Mal (Karte und Seitenleiste zeigen dasselbe). Geblieben ist
            der Stand in einer Zeile, samt Hinweis auf die übernommenen Werte,
            der vorher an vier Karten ausgeschrieben stand. */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[11px]" data-testid="closing-kopf-stand">
          <Badge variant="outline" className="h-5 text-[10px]">
            {fortschritt.aktiverSchritt === 0
              ? "Alle Pflichtschritte erledigt"
              : `Schritt ${fortschritt.aktiverSchritt} von 6`}
          </Badge>
          {uebernommeneSchritte.length > 0 && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <AusGespraechZeichen klein />
              {uebernommeneSchritte.join(", ")}
              {fortschritt.teil1AbgeschlossenAm ? ` aus dem Gespräch vom ${fortschritt.teil1AbgeschlossenAm}` : " aus dem Gespräch"}
              {" "}übernommen und hier vorbelegt.
            </span>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4 min-w-0">
          {/* ── 1 Präsentation und Gespräch ── */}
          <ClosingSchrittKarte
            nr={1}
            titel={CLOSING_SCHRITT_TITEL[1]}
            zustand={schritt(1).zustand}
            aufgeklappt={offen[1] === true}
            onAufklappen={() => aufklappen(1)}
            onEinklappen={() => einklappen(1)}
            hervorgehoben={fortschritt.aktiverSchritt === 1}
            /* Der Balken trägt nur noch Nummer, Namen und den Knopf. Das
               Ergebnis und die Herkunft stehen in der Seitenleiste. */
          >
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Videocall: Präsentationsfenster teilen, Moderation bleibt bei dir.</strong>{" "}
              Die Präsentation läuft in einem eigenen Fenster, nur dieses Fenster wird im Videocall geteilt. Der Bewerber
              klickt nie selbst. Sprechtext, Regie, Notizfelder und alle Bedienelemente der Folien liegen in der
              Moderationsansicht. Beide Fenster sind gekoppelt: Weiter in der Moderation blättert die Präsentation.
            </p>
            {/* Die Präsentation für den Termin: seit dem 23.09.2026 für jeden
                Bewerber, im alten wie im neuen Ablauf, der Videocall mit den
                fünf Wegen. Die alte Closing-Präsentation mit ihren 22 Folien
                und ihrem Abschlussformular ist entfernt. Die Kennung muss mit,
                damit die Folien die Antworten aus dem Kennenlernbogen tragen
                und beide Fenster denselben Kanal finden. */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <a
                href={praesentationsUrl(b.id, 1, bewerberName)}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button size="sm" className="gap-1.5 w-full md:w-auto">
                  <Presentation className="h-4 w-4" />
                  Videocall: Präsentation öffnen
                  <ExternalLink className="h-3.5 w-3.5 ml-1 opacity-70" />
                </Button>
              </a>
              {/* Die Moderationsansicht: Sprechtext, Regie und Felder je Folie,
                  gekoppelt mit der Präsentation im zweiten Fenster. */}
              <a
                href={moderationsUrl(b.id, 1)}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button size="sm" variant="outline" className="gap-1.5 w-full md:w-auto">
                  <MonitorPlay className="h-4 w-4" /> Moderation öffnen
                  <ExternalLink className="h-3.5 w-3.5 ml-1 opacity-70" />
                </Button>
              </a>
              <span className="text-[11px] text-muted-foreground">Präsentation im zweiten Fenster, Skript und Felder im CRM.</span>
            </div>
            {/* Eine Wahl zwischen Teil 1 und Teil 2 gibt es nicht mehr. Die
                gehörte zum alten Deck; der Videocall führt durch eine einzige
                Präsentation. */}
            {neuerProzess ? (
              <div
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed"
                data-testid="closing-einstieg-neu"
              >
                <div className="font-semibold mb-0.5">Ein Termin, eine Präsentation</div>
                Im neuen Bewerberprozess gibt es nur einen regulären Termin. Deshalb gibt es hier keine
                Wahl zwischen Teil 1 und Teil 2 mehr: Es öffnet sich dieselbe Präsentation wie im Reiter
                Videocall, mit den sechs Kernbausteinen und den Modulen der Strecke dieses Bewerbers.
                Wie viele Folien es werden, hängt am gewählten Weg und nicht an einer festen Zahl.
                Alles Weitere in diesem Reiter bleibt unverändert: Entscheidung, Paketwahl,
                Konditionen und Vertrag.
              </div>
            ) : fortschritt.teil2Komplett ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed" data-testid="closing-karte-1-gespraech">
                <div className="font-semibold mb-0.5">
                  {fortschritt.gespraechKomplett
                    ? `Erstgespräch und Closing-Gespräch bereits geführt am ${fortschritt.teil1AbgeschlossenAm}`
                    : "Aus Teil 2 bereits übernommen"}
                </div>
                Teil 2 wurde im Erstgespräch direkt geführt. Entscheidung
                {b.paketwahl ? ", Paket" : ""}
                {b.vertragsAdresse ? ", Adressen" : ""}
                {b.andereVertriebe ? ", andere Vertriebe" : ""}
                {" "}sind unten vorbelegt und als „aus dem Gespräch übernommen" gekennzeichnet.
                {/* Teil 2 komplett, aber der Abschluss fehlt: Der Reiter
                    Erstgespräch ist nicht grün, das Datum des Gesprächs fehlt
                    deshalb noch. */}
                {!fortschritt.teil1Abgeschlossen && (
                  <div className="mt-2 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Das Erstgespräch ist noch nicht abgeschlossen (kein grünes Häkchen am Reiter Erstgespräch).
                      Dort auf „Erstgespräch abschließen" klicken, dann steht hier das Datum des Gesprächs.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Der alte Ablauf. Hier lief bis zum 23.09.2026 die alte
                 Closing-Präsentation; jetzt ist es derselbe Videocall wie im
                 neuen Prozess. Der Hinweis sagt ehrlich, woran er hängt: Die
                 Folien bauen auf dem Kennenlernbogen auf, und den haben
                 Bewerber aus dem alten Ablauf oft nicht. */
              <div
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed"
                data-testid="closing-einstieg-videocall"
              >
                <div className="font-semibold mb-0.5">Präsentation im Videocall</div>
                Es öffnet sich dieselbe Präsentation wie im neuen Bewerberprozess, mit den Folien zum Weg
                dieses Bewerbers. Die alte Closing-Präsentation gibt es nicht mehr. Die Folien bauen auf dem
                Kennenlernbogen auf: Hat der Bewerber keinen ausgefüllt, zeigt das Präsentationsfenster statt
                der Folien einen Hinweis. Entscheidung, Paketwahl, Konditionen und Vertrag laufen in diesem
                Reiter weiter wie bisher.
              </div>
            )}
          </ClosingSchrittKarte>

          {/* ── 2 Entscheidung ── */}
          <ClosingSchrittKarte
            nr={2}
            titel={CLOSING_SCHRITT_TITEL[2]}
            zustand={schritt(2).zustand}
            aufgeklappt={offen[2] === true}
            onAufklappen={() => aufklappen(2)}
            onEinklappen={() => einklappen(2)}
            hervorgehoben={fortschritt.aktiverSchritt === 2}
            /* Kein Ergebnis mehr im Balken, nur die Warnung: Sie gehört
               dorthin, wo der Knopf zum Beheben sitzt. */
            badges={entscheidungUngespeichert ? <NichtGespeichertBadge /> : undefined}
          >
            <p className="text-xs text-muted-foreground">
              Das Ergebnis nach der Präsentation. Das häufigste ist weder Ja noch Nein, sondern
              „muss ich mir überlegen", dafür gibt es den dritten Knopf. Wurde die Entscheidung schon in
              Teil 2 oder im Abschluss der Moderation zum Videocall erfasst, ist sie hier vorbelegt.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button" size="sm" disabled={!canEdit}
                variant={entscheidung === "ja" ? "brand" : "outline"}
                onClick={waehleJa}
                className={entscheidung === "ja" ? "gap-1.5" : "btn-brand-umriss gap-1.5"}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Ja, will starten
              </Button>
              {/* Der dritte Zustand. Ohne ihn blieb der Bewerber unsichtbar im
                  Status Closing liegen, bis ihn zufällig jemand wiederfand. */}
              <Button
                type="button" size="sm" disabled={!canEdit}
                variant={entscheidung === "bedenkzeit" ? "secondary" : "outline"}
                onClick={() => setEntscheidung("bedenkzeit")}
                className="gap-1.5"
              >
                <Clock className="h-3.5 w-3.5" /> Braucht Bedenkzeit
              </Button>
              <Button
                type="button" size="sm" disabled={!canEdit}
                variant={entscheidung === "nein" ? "destructive" : "outline"}
                onClick={() => setEntscheidung("nein")}
                className="gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" /> Nein, möchte nicht starten
              </Button>
            </div>

            {entscheidung === "" && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-3 text-[11px] leading-snug text-muted-foreground">
                  <div className="font-semibold text-foreground mb-0.5">Bei Bedenkzeit</div>
                  Rückruftermin (Pflicht) und „Woran macht {vName} die Entscheidung fest?". Status wechselt auf
                  <strong> Bedenkzeit</strong>, eigene Spalte im Bewerbermanagement.
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-[11px] leading-snug text-muted-foreground">
                  <div className="font-semibold text-foreground mb-0.5">Bei Nein</div>
                  Verlust-Grund (intern), wertschätzende Absage-Mail{b.email ? ` an ${b.email}` : ""}. Status wechselt auf
                  <strong> Abgelehnt</strong>, der Startfahrplan wird ausgeblendet.
                </div>
              </div>
            )}

            {entscheidung === "bedenkzeit" && (
              <div className="rounded-lg border border-violet-300/60 bg-muted/30 p-4 space-y-2" data-testid="bedenkzeit-block">
                <div className="text-sm font-semibold">Bei Bedenkzeit</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Wann rufst du wieder an? <span className="text-destructive">*</span>
                    </Label>
                    <DateInput
                      value={bedenkzeitDatum}
                      onChange={setBedenkzeitDatum}
                      disabled={!canEdit}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Pflicht. Eine Bedenkzeit ohne Termin ist keine Bedenkzeit, sondern ein
                      verlorener Bewerber.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Woran macht {vName} die Entscheidung fest?
                    </Label>
                    <Textarea
                      className="text-sm min-h-[70px]"
                      value={bedenkzeitGrund}
                      onChange={(e) => setBedenkzeitGrund(e.target.value)}
                      disabled={!canEdit}
                      placeholder="z. B. Rücksprache mit Partnerin, Zeitpunkt, Leadkosten, will erst die Objekte sehen …"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5"
                      disabled={bedenkzeitSpeichert || !bedenkzeitDatum.trim()}
                      onClick={handleBedenkzeit}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {bedenkzeitSpeichert ? "Wird gesetzt …" : b.closingEntscheidung === "bedenkzeit" ? "Rückruf speichern" : "Auf Bedenkzeit setzen"}
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Status wechselt auf <strong>Bedenkzeit</strong>. Der Bewerber erscheint dann
                    in der eigenen Spalte im Bewerbermanagement, nicht mehr unter Closing.
                  </p>
                </div>

                {/* Follow-up zum Rückruf: dieselbe Speicherung wie der Knopf oben. */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3 mt-3" data-testid="bedenkzeit-follow-up">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <PhoneCall className="h-4 w-4 text-primary" /> Follow-up zum Rückruf
                    {b.closingEntscheidung === "bedenkzeit" && b.bedenkzeitRueckrufAm && (
                      <Badge className="h-5 bg-green-600 text-white hover:bg-green-600 text-[10px]">
                        Auf Bedenkzeit gesetzt
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="bedenkzeit-uhrzeit" className="text-xs font-medium">Uhrzeit</Label>
                      <Input
                        id="bedenkzeit-uhrzeit"
                        type="time"
                        value={bedenkzeitUhrzeit}
                        onChange={(e) => setBedenkzeitUhrzeit(e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Kanal</Label>
                      <Select value={bedenkzeitKanal} onValueChange={setBedenkzeitKanal} disabled={!canEdit}>
                        <SelectTrigger aria-label="Kanal"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BEDENKZEIT_KANAELE.map((k) => (
                            <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Erinnerung</Label>
                      <Select
                        value={String(bedenkzeitErinnerung)}
                        onValueChange={(v) => setBedenkzeitErinnerung(Number(v))}
                        disabled={!canEdit}
                      >
                        <SelectTrigger aria-label="Erinnerung"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BEDENKZEIT_ERINNERUNG_OPTIONEN.map((o) => (
                            <SelectItem key={o.tage} value={String(o.tage)}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {bedenkzeitDatum.trim() && (
                        <p className="text-[10px] text-muted-foreground">
                          erscheint am {bedenkzeitErinnerungsTag(bedenkzeitDatum, bedenkzeitErinnerung) || "–"} in der Inbox
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bedenkzeit-vorbereitung" className="text-xs font-medium">Vorbereitung für den Rückruf</Label>
                    <Textarea
                      id="bedenkzeit-vorbereitung"
                      className="text-sm min-h-[70px]"
                      value={bedenkzeitVorbereitung}
                      onChange={(e) => setBedenkzeitVorbereitung(e.target.value)}
                      disabled={!canEdit}
                      placeholder="z. B. Zwei Bestandsobjekte als Exposé mitschicken, Nebenberuf-Rechnung vorrechnen …"
                    />
                  </div>
                  {canEdit && b.closingEntscheidung === "bedenkzeit" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" className="gap-1.5" onClick={rueckrufErledigt}>
                        <PhoneCall className="h-3.5 w-3.5" /> Rückruf erledigt: Entscheidung erfassen
                      </Button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    <strong>Erscheint in der Übersicht des Bewerbers:</strong> Datum, Uhrzeit und die Vorbereitung
                    stehen dort in der Follow-up-Karte. Gespeichert wird alles mit dem Knopf oben.
                  </p>
                  <div className="rounded-md border border-violet-300/50 bg-violet-50/60 dark:bg-violet-500/10 p-2.5 text-[10px] leading-snug">
                    <strong>Bedenkzeit und Follow-Up bleiben getrennte Status.</strong> Follow-Up ist der Status nach
                    Teil 1 (Empfehlung B oder Unterlagen-Weiche im Erstgespräch). Bedenkzeit ist der Status nach der
                    Präsentation, wenn der Bewerber alles gesehen hat und die Entscheidung vertagt. Der Rückruf hier ist
                    das Follow-up zur Bedenkzeit, kein Statuswechsel nach Follow-Up.
                  </div>
                </div>
              </div>
            )}

            {entscheidung === "nein" && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2" data-testid="nein-block">
                <div className="text-sm font-semibold">Bei Nein</div>
                <Label className="text-xs font-medium">Verlust-Grund</Label>
                <Textarea
                  className="text-sm min-h-[70px]"
                  value={abgelehntGrund}
                  onChange={(e) => setAbgelehntGrund(e.target.value)}
                  disabled={!canEdit}
                  placeholder="z. B. Kein Budget, falscher Zeitpunkt, anderes Angebot, kein Vertrieb mehr …"
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1">
                  <Checkbox
                    checked={absageMailSenden}
                    onCheckedChange={(v) => setAbsageMailSenden(v === true)}
                    disabled={!canEdit || !b.email}
                  />
                  <span>Wertschätzende Absage-Mail senden{b.email ? ` (an ${b.email})` : " (keine E-Mail hinterlegt)"}</span>
                </label>
                {canEdit && (
                  <Button size="sm" variant="destructive" onClick={handleZurueckziehen} className="gap-1.5">
                    <XCircle className="h-3.5 w-3.5" /> Bewerbung als „Kein Interesse / Abgelehnt" markieren
                  </Button>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Status wechselt automatisch auf <strong>Kein Interesse / Abgelehnt</strong>.
                  Der Verlust-Grund bleibt intern und steht nicht in der Mail.
                </p>
              </div>
            )}
          </ClosingSchrittKarte>

          {/* ── 3 Paket und Konditionen ── */}
          <ClosingSchrittKarte
            nr={3}
            titel={CLOSING_SCHRITT_TITEL[3]}
            zustand={schritt(3).zustand}
            aufgeklappt={offen[3] === true}
            onAufklappen={() => aufklappen(3)}
            onEinklappen={() => einklappen(3)}
            hervorgehoben={fortschritt.aktiverSchritt === 3}
            sperrText="Vertragsdokument wählen (Vertriebspartner, Lead-Berater, Tippgeber), Vertragsschalter, individuelle Provisionssätze, Lead-Paket, Zahlungsweise oder Tippgeber-Vergütung und die Liste der erhaltenen Leistungen. Erscheint, sobald die Entscheidung auf Ja steht. Ein in Teil 2 gewähltes Paket ist dann vorbelegt."
            /* Paket, Preis, Laufzeit, Lead-Paket und die individuelle Fassung
               stehen jetzt ausschließlich in der Seitenleiste. Im Balken bleibt
               die Warnung vor ungespeicherten Änderungen. */
            badges={paketUngespeichert ? <NichtGespeichertBadge /> : undefined}
          >
            <p className="text-xs text-muted-foreground">
              Vertragsdokument wählen. Neu vergeben werden nur noch Vertriebspartner, Lead-Berater und Tippgeber.
              Die Schalter darunter steuern die Klauseln im Vertrag.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Neuwahl: nur noch die wählbaren Pakete (Vertriebspartner, Tippgeber).
                  Bestandspakete bleiben über LIZENZ_PAKETE auflösbar, werden aber
                  nicht mehr angeboten. */}
              {WAEHLBARE_LIZENZ_PAKETE.map((p) => {
                const Icon = ICONS[p.id];
                const isSelected = paket === p.id;
                return (
                  <button
                    key={p.id} type="button" disabled={!canEdit} onClick={() => setPaket(p.id)}
                    className={`text-left rounded-xl border p-4 transition bg-card ${
                      isSelected ? "border-primary ring-2 ring-primary/30 shadow" : "border-border hover:border-primary/40"
                    } ${!canEdit ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="flex items-start mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-sm font-semibold">{p.titel}</div>
                    <div className="text-xs text-muted-foreground mb-2">{p.zielgruppe}</div>
                    {p.istTippgeber ? (
                      <>
                        <div className="text-lg font-bold">Individuell</div>
                        <div className="text-[10px] text-muted-foreground">Vergütung im Einzelfall vereinbart · keine Gebühr</div>
                      </>
                    ) : p.preis > 0 ? (
                      <>
                        <div className="text-lg font-bold">{formatPreis(p.preis)}</div>
                        <div className="text-[10px] text-muted-foreground">einmalig, netto · + {formatPreis(p.monatlich)}/Monat</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-bold">Kein laufendes Entgelt</div>
                        <div className="text-[10px] text-muted-foreground">keine Setup-Gebühr · keine Mindestlaufzeit</div>
                      </>
                    )}
                    <div className="mt-2 text-xs font-medium text-primary">
                      {p.istTippgeber ? "Individuelle Absprache" : `${p.provisionssatz}% Provision`}
                    </div>
                  </button>
                );
              })}
            </div>

            {aktiv && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    {aktiv.titel}
                    <Badge variant="outline">
                      {aktiv.preis > 0
                        ? `${formatPreis(aktiv.preis)} einmalig + ${formatPreis(aktiv.monatlich)}/Monat`
                        : aktiv.istTippgeber ? "Vergütung individuell" : "Kein laufendes Entgelt"}
                    </Badge>
                  </h4>
                  <p className="text-xs text-muted-foreground">{aktiv.kurz}</p>
                  {aktiv.einmaligAufschluesselung && aktiv.einmaligAufschluesselung.length > 0 && (
                    <ul className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                      {aktiv.einmaligAufschluesselung.map((it, i) => (
                        <li key={i}>· {it.label} · <span className="font-medium text-foreground/70">{formatPreis(it.betrag)}</span></li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {aktiv.istTippgeber
                      ? "Kostenfrei, kein laufendes Entgelt"
                      : aktiv.preis > 0
                        ? `CRM-Systemgebühr (Bestandspaket): ${formatMonatlich(aktiv)}`
                        : `Gestellt, ohne laufendes Entgelt: CRM, Objektzugänge, Pflichtschulungen, dazu ${GESTELLT_ZUSATZ_KURZ}`}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2 items-start">
                  {/* Linke Spalte: Vertragsschalter, Wettbewerbsklausel, Zahlungsweise */}
                  <div className="space-y-4">
                    {/* Bis zum 06.09.2026 standen hier die Schalter zur
                        Servicevereinbarung und ihrer Mindestlaufzeit. Beides gibt es
                        nicht mehr: Alles wird gestellt, ein laufendes Entgelt und eine
                        Mindestlaufzeit kennt der Vertrag nicht. Die gespeicherten
                        Altwerte ohneCrmGebuehr und laufzeitOffen bleiben unangetastet. */}

                    {/* Individuelle Fassung der Wettbewerbsklausel (§ 8 kompakt, § 10 alt).
                        Schieberegler, Standard AUS = Standardvertrag mit
                        Wettbewerbsverbot. Die fruehere Positivliste ist entfallen,
                        die Bestandskunden-Ausnahme steht abstrakt in Absatz 2 und 3. */}
                    <div className="rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-500/5 p-4 space-y-3">
                      {/* Gleiches Muster wie die Vertragsschalter: Name und
                          Zusatzzeile links, Beschriftung und Schalter rechts, der
                          Schalter als letztes Element. So stehen alle drei Schalter
                          der Closing-Karten auf einer Linie. */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                          <div>
                            <label htmlFor="individuelle-fassung-toggle" className="text-sm font-semibold cursor-pointer">
                              Wettbewerbsklausel {wettbewerbsParagraph}
                            </label>
                            <div className="text-[11px] text-muted-foreground">
                              {individuelleFassung
                                ? "Individuelle Fassung: kein Wettbewerbsverbot"
                                : "Standardvertrag mit Wettbewerbsverbot"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Label htmlFor="individuelle-fassung-toggle" className="text-xs text-muted-foreground sm:whitespace-nowrap">
                              {individuelleFassung ? "Individuelle Fassung" : "Standardvertrag"}
                            </Label>
                            <Switch
                              id="individuelle-fassung-toggle"
                              checked={individuelleFassung}
                              onCheckedChange={async (v) => {
                                const next = !!v;
                                setIndividuelleFassung(next);
                                await updateBewerber(b.id, {
                                  individuelleVertragsFassung: next,
                                  // Die Angabe des Bewerbers bleibt beim Umschalten erhalten:
                                  // sie stammt ggf. aus der Closing-Praesentation und ist
                                  // beim Standardvertrag die Offenlegung nach Absatz 2.
                                  andereVertriebe,
                                });
                                onRefresh();
                              }}
                              disabled={!canEdit}
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                            Individuelle Fassung: Der Vertriebspartner darf parallel für andere Unternehmen
                            arbeiten (Anzeigepflicht, keine Zustimmung nötig). Unverändert gelten die{" "}
                            <strong>Eigentumsregel für Kontakte</strong> (Eigenkontakte bleiben seine, zugewiesene
                            Leads und Gesellschaftskontakte bleiben Eigentum der Gesellschaft), der Bauträger- und
                            Geschäftschancenschutz während der Laufzeit, Daten- und Geheimnisschutz nach Vertragsende
                            (24 Monate) und die Vertragsstrafe nach billigem Ermessen (bis 25.000 € je Verstoß,
                            bis 50.000 € bei systematischem Datenmissbrauch). Ein nachvertragliches Wettbewerbsverbot
                            gibt es in keiner Fassung. Die erklärten anderen Vertriebe stehen in {nebentaetigkeitOrt}.
                        </p>
                      </div>
                      {/* Am Bewerber sind andere Vertriebe hinterlegt (aus Teil 2
                          oder, bei älteren Bewerbern, aus dem Abschlussformular der
                          alten Closing-Präsentation), aber der Vertrag steht noch auf
                          Standard: sichtbar machen, damit die Angabe nicht untergeht
                          und ggf. die Individualfassung aktiviert wird. */}
                      {!individuelleFassung && !!(b.andereVertriebe || "").trim() && (
                        <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400 pl-1">
                          Der Bewerber hat angegeben, NICHT exklusiv zu arbeiten:
                          {" "}{(b.andereVertriebe || "").split("\n").map(z => z.trim()).filter(Boolean).join(", ")}.
                          Falls das so bleiben soll, hier die individuelle Fassung aktivieren.
                        </p>
                      )}
                      {individuelleFassung && (
                        <div className="space-y-1 pl-6">
                          <Label className="text-xs font-medium">
                            Tätigkeiten für andere Vertriebe bei Vertragsbeginn
                          </Label>
                          <Textarea
                            className="min-h-[80px] text-xs"
                            value={andereVertriebe}
                            onChange={(e) => setAndereVertriebe(e.target.value)}
                            onBlur={() => updateBewerber(b.id, {
                              individuelleVertragsFassung: individuelleFassung,
                              andereVertriebe,
                            })}
                            disabled={!canEdit}
                            placeholder={"Ein Unternehmen pro Zeile, z. B.:\nMuster Vertriebs GmbH, München\nBeispiel Immobilien AG"}
                          />
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Wird als Erklärung in <strong>{nebentaetigkeitOrt}</strong> eingedruckt. Leer lassen = der
                            Vertrag druckt „keine". Spätere Änderungen laufen über die Anzeigepflicht des
                            Partners in Textform, hier muss nichts nachgepflegt werden.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Zahlungsweise */}
                    {aktiv.istTippgeber ? (
                      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <HandCoins className="h-4 w-4 text-primary" /> Individuelle Tippgeber-Vergütung
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">Provisionsmodell</Label>
                            <Select value={tippgeberModell} onValueChange={(v) => setTippgeberModell(v as "euro" | "prozent")} disabled={!canEdit}>
                              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="euro">Festbetrag (€ pro Abschluss)</SelectItem>
                                <SelectItem value="prozent">Prozentual (% vom Kaufpreis)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs font-medium">
                              {tippgeberModell === "euro" ? "Betrag pro Abschluss (€ netto)" : "Prozentsatz vom notariellen Kaufpreis (%)"}
                            </Label>
                            <Input
                              className="h-9 mt-1"
                              inputMode="decimal"
                              value={tippgeberBetrag}
                              onChange={(e) => setTippgeberBetrag(e.target.value)}
                              placeholder={tippgeberModell === "euro" ? "z.B. 500" : "z.B. 1,5"}
                              disabled={!canEdit}
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Diese Konditionen werden verbindlich in die Tippgebervereinbarung übernommen und bei der Aktivierung
                          automatisch in den Tippgeber-Datensatz (Nutzerverwaltung / Teampartner → Tippgeber) übertragen.
                        </p>
                      </div>
                    ) : aktiv.preis > 0 ? (
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <Label className="text-xs font-medium">Zahlungsweise</Label>
                        <div className="flex flex-col gap-2 mt-2 sm:flex-row">
                          {ZAHLUNGSWEISEN.map((z) => (
                            <button key={z.id} type="button" disabled={!canEdit} onClick={() => setZw(z.id)}
                              className={`flex-1 rounded-lg border px-4 py-3 text-sm transition ${
                                zw === z.id ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/40"
                              } ${!canEdit ? "opacity-70 cursor-not-allowed" : ""}`}>
                              {z.label}
                            </button>
                          ))}
                        </div>
                        {raten.length > 1 && (
                          <div className="mt-3 text-xs text-muted-foreground">
                            {raten.length} Raten à <span className="font-semibold text-foreground">{formatPreis(raten[0])}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                        <div className="text-sm font-semibold">Zahlungsweise</div>
                        <div className="text-xs text-muted-foreground">
                          Vertriebspartner: keine einmalige Setup-Investition und
                          {" "}<span className="font-semibold text-foreground">kein laufendes Entgelt</span>.
                          CRM, Objektzugänge, Pflichtschulungen, Training, Landingpage, Verkaufsunterlagen,
                          Coaching, Community und Support werden gestellt; nur ein Leadpaket wird nach
                          Rechnung abgerechnet.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rechte Spalte: individuelle Sätze, Lead-Paket */}
                  <div className="space-y-4">
                    {/* Individuell vereinbarte Provisionssätze (Lead / Team / Lizenz) */}
                    {supportsIndividuell && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <HandCoins className="h-4 w-4 text-primary" />
                          Individuelle Provisionssätze (optional)
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Wenn du im Closing abweichende Sätze vereinbart hast, hinterlege sie hier – sie überschreiben
                          den Standardsatz des Pakets ({aktiv.provisionssatz}%) im Vertrag & den Anlagen und werden bei
                          der späteren Aktivierung 1:1 in die Nutzerverwaltung übertragen.
                          <br />
                          <strong>Individueller Satz</strong>: gleicher %-Wert für Leads (über MOREImmo) & Eigenkontakte.
                          <strong> Lead Satz</strong>: nur bei Leads aus MOREImmo.
                          <strong> Eigen Satz</strong>: bei Interessenten/Leads aus dem eigenen Netzwerk.
                        </p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs font-medium">Individueller Satz (%)</Label>
                            <Input
                              className="h-9 mt-1"
                              inputMode="decimal"
                              value={satzIndividuell}
                              onChange={(e) => setSatzIndividuell(e.target.value)}
                              placeholder={`z. B. ${aktiv.provisionssatz}`}
                              disabled={!canEdit || !!(satzLead.trim() || satzEigen.trim())}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Gilt für Lead + Eigenkontakte</p>
                          </div>
                          <div>
                            <Label className="text-xs font-medium">Lead Satz (%)</Label>
                            <Input
                              className="h-9 mt-1"
                              inputMode="decimal"
                              value={satzLead}
                              onChange={(e) => setSatzLead(e.target.value)}
                              placeholder="z. B. 3"
                              disabled={!canEdit || !!satzIndividuell.trim()}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Bei Leads aus MOREImmo</p>
                          </div>
                          <div>
                            <Label className="text-xs font-medium">Eigen Satz (%)</Label>
                            <Input
                              className="h-9 mt-1"
                              inputMode="decimal"
                              value={satzEigen}
                              onChange={(e) => setSatzEigen(e.target.value)}
                              placeholder="z. B. 5"
                              disabled={!canEdit || !!satzIndividuell.trim() || eigenGesperrtDurchObjektart}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {eigenGesperrtDurchObjektart
                                ? "Gesperrt: Bestand/Neubau eingetragen, der Eigen-Satz kann nicht zusätzlich gelten"
                                : "Aus eigenem Netzwerk"}
                            </p>
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-primary/20">
                          <div>
                            <Label className="text-xs font-medium">Bestandsobjekte (%)</Label>
                            <Input
                              className="h-9 mt-1"
                              inputMode="decimal"
                              value={satzBestand}
                              onChange={(e) => setSatzBestand(e.target.value)}
                              placeholder="z. B. 5"
                              disabled={!canEdit || !!satzIndividuell.trim() || objektartGesperrtDurchEigen}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {objektartGesperrtDurchEigen
                                ? "Gesperrt: Eigen-Satz eingetragen, Objektart-Sätze können nicht zusätzlich gelten"
                                : "Bei Vermittlung eines Bestandsobjekts"}
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs font-medium">Neubauobjekte (%)</Label>
                            <Input
                              className="h-9 mt-1"
                              inputMode="decimal"
                              value={satzNeubau}
                              onChange={(e) => setSatzNeubau(e.target.value)}
                              placeholder="z. B. 4,5"
                              disabled={!canEdit || !!satzIndividuell.trim() || objektartGesperrtDurchEigen}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {objektartGesperrtDurchEigen
                                ? "Gesperrt: Eigen-Satz eingetragen"
                                : "Bei Vermittlung eines Neubauprojekts"}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Leer lassen = Standardsatz „{aktiv.titel}" ({aktiv.provisionssatz}%) gilt. Lead-Satz lässt sich
                          mit Eigen-Satz oder mit Bestand/Neubau kombinieren; Eigen-Satz und Bestand/Neubau schließen sich aus.
                        </p>
                      </div>
                    )}

                    {/* Optionales Lead-Paket – nur beim Vertriebspartner */}
                    {paket === "junior" && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <Flame className="h-4 w-4 text-primary" />
                          Lead-Paket (optional)
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          {([
                            { modus: "keins" as const, titel: "Kein Lead-Kauf", unter: "Start ohne gekaufte Leads" },
                            {
                              modus: "paket" as const,
                              titel: `Leadpaket ${formatPreis(LEAD_PAKET_PREIS)}`,
                              unter: `= ${LEAD_PAKET_ANZAHL} qualifizierte Leads`,
                            },
                            { modus: "individuell" as const, titel: "Individueller Betrag", unter: `mindestens ${formatPreis(LEAD_PAKET_PREIS)}` },
                            // Ausnahme, nicht der Regelfall: Nur mit dieser Wahl
                            // weist der Vertrag den Einzelkauf aus (§ 5 Absatz 2a).
                            { modus: "einzeln" as const, titel: `Leads einzeln ${formatPreis(LEAD_EINZELPREIS)}`, unter: "je Lead netto, ohne Paket" },
                          ]).map((opt) => {
                            const aktivOpt = leadPaketModus === opt.modus;
                            return (
                              <button
                                key={opt.modus}
                                type="button"
                                disabled={!canEdit}
                                onClick={() => setLeadPaketModus(opt.modus)}
                                className={`text-left rounded-lg border px-3 py-2.5 transition bg-card ${
                                  aktivOpt ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                                } ${!canEdit ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                              >
                                <div className="text-sm font-medium">{opt.titel}</div>
                                <div className="text-[11px] text-muted-foreground">{opt.unter}</div>
                              </button>
                            );
                          })}
                        </div>
                        {leadPaketModus === "individuell" && (
                          <div className="grid sm:grid-cols-2 gap-3 items-end">
                            <div>
                              <Label className="text-xs font-medium">Betrag (€ netto)</Label>
                              <Input
                                className="h-9 mt-1"
                                inputMode="decimal"
                                value={leadPaketBetrag}
                                onChange={(e) => setLeadPaketBetrag(e.target.value)}
                                placeholder={`z. B. ${LEAD_PAKET_PREIS + 500}`}
                                disabled={!canEdit}
                              />
                            </div>
                            <div className="text-sm pb-1.5">
                              {leadPaketIndividuellAnzahl > 0 ? (
                                <span>
                                  = <span className="font-semibold">{leadPaketIndividuellAnzahl} qualifizierte Leads</span>
                                </span>
                              ) : (
                                <span className="text-destructive text-xs font-medium">
                                  Mindestbetrag {formatPreis(LEAD_PAKET_PREIS)} netto
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Der Hinweis gehoert zur getroffenen Wahl, nicht zum
                            Kasten: Ein fester Text stand hier bis 04.09.2026 auch
                            unter "Kein Lead-Kauf" und behauptete dort ein Paket,
                            das niemand gebucht hat. Er trug ausserdem noch die
                            abgeschaffte Bedingung "nach dem ersten Paket". */}
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {leadPaketModus === "keins" && (
                            <>Es werden keine Leads gekauft. Der Vertriebspartner arbeitet mit seinem eigenen Netzwerk;
                            im Vertrag steht, dass kein Leadpaket vereinbart ist. Das lässt sich später jederzeit ändern,
                            eine Umstellung ist nur ein neuer Vertrag mit aktuellem Paket.</>
                          )}
                          {leadPaketModus === "paket" && (
                            <>{LEAD_PAKET_ANZAHL} qualifizierte Leads für {formatPreis(LEAD_PAKET_PREIS)} netto.
                            Das Paket kann jederzeit erneut gebucht werden. Der Paketpreis wird innerhalb eines Monats ab
                            Zahlungseingang für Werbemaßnahmen eingesetzt, die Leads werden nach Eingang zugewiesen und
                            fehlende nachgeliefert. Endet der Vertrag vorher, werden nicht gelieferte Leads anteilig erstattet.</>
                          )}
                          {leadPaketModus === "individuell" && (
                            <>Abweichender Paketbetrag, mindestens {formatPreis(LEAD_PAKET_PREIS)} netto. Die Leadanzahl
                            ergibt sich aus dem Betrag geteilt durch {formatPreis(LEAD_PAKET_PREIS_PRO_LEAD)} je Lead,
                            abgerundet. Sonst gelten dieselben Bedingungen wie beim Standardpaket.</>
                          )}
                          {leadPaketModus === "einzeln" && (
                            <>Einzelne Leads für {formatPreis(LEAD_EINZELPREIS)} netto je Lead, jederzeit und in beliebiger
                            Zahl. Ein Leadpaket ist dafür nicht nötig, es gibt keine Abnahmepflicht und keine Mindestmenge.
                            Das weicht vom Regelmodell ab und wird im Vertrag ausdrücklich als individuell vereinbart geführt.</>
                          )}
                        </p>
                        {gewaehltesLeadPaket && (
                          <p className="text-[11px] text-primary font-medium">
                            Wird als {leadAnlage} (Leadpaket-Vereinbarung) in den Vertrag übernommen:{" "}
                            {formatPreis(gewaehltesLeadPaket.betrag)} netto für {gewaehltesLeadPaket.anzahl} qualifizierte Leads.
                          </p>
                        )}
                        {leadEinzelkauf && (
                          <p className="text-[11px] text-primary font-medium">
                            Kommt als § 5 Absatz 2a in den Vertrag: Einzelne Leads jederzeit erwerbbar,
                            {" "}{formatPreis(LEAD_EINZELPREIS)} netto je Lead, ohne Paket und ohne Abnahmepflicht.
                            Eine Leadpaket-Vereinbarung wird dann nicht geschlossen.
                          </p>
                        )}
                        {leadPaketModus === "keins" && (
                          <p className="text-[11px] text-muted-foreground">
                            Im Vertrag: „Kein Leadpaket vereinbart“ im Konditionenblatt, keine {leadAnlage}.
                          </p>
                        )}

                        {/*
                          Folgegespraech mit Christian Kurz, bewusst innerhalb des
                          Lead-Paket-Kastens: Es geht um dieselbe Entscheidung. Als
                          eigener Block darunter war der Bezug nicht zu erkennen.

                          Und nicht am Ende der Closing-Praesentation: Die ist der
                          Bildschirm, den der Bewerber sieht, das Folgegespraech ist
                          eine interne Absprache vor dem Vertragsversand.
                        */}
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                          <div className="flex items-start gap-2.5">
                            <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                                Startet der Partner erfahren und sofort mit Leads?
                                {/* In Teil 2 des Erstgesprächs bereits eingeblendet (qualiCallAngeboten). */}
                                {folgeCallAngeboten && (
                                  <Badge variant="outline" className="h-5 border-amber-500/50 text-[10px] font-normal text-amber-700 dark:text-amber-400">
                                    im Gespräch angeboten
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                Dann vor dem Vertragsversand ein Folgegespräch mit Christian Kurz buchen. Der Vertrag
                                geht erst danach raus.
                              </p>
                              <a
                                href={LEAD_FOLGEGESPRAECH_LINK}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 hover:underline"
                              >
                                Termin mit Christian Kurz buchen
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Erhaltene Leistungen, untereinander (spiegelt die individuellen
                    Sätze und das gewählte Lead-Paket wider) */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs font-medium mb-2">Erhaltene Leistungen (spiegelt Schalter, Sätze und Lead-Paket)</div>
                  <ul className="space-y-1.5">
                    {(() => {
                      // Dieselbe Ableitung wie im Vertrag (provisionsSaetze in
                      // vertragKlauseln.ts): Sind individuelle Sätze vereinbart,
                      // ersetzt der vertragsgleiche Satztext die Zeile
                      // "Einheitlich 4 % Provision". Die Formularwerte überlagern
                      // die gespeicherten Felder, damit die Liste beim Tippen
                      // sofort mitzieht und geleerte Felder nicht auf alte
                      // Profilwerte zurückfallen.
                      // Dieselbe Normalisierung wie im Vertrags-PDF; die Altwerte
                      // ohneCrmGebuehr und laufzeitOffen sind bei den aktuellen
                      // Paketen ohne Wirkung.
                      const paketAngezeigt = paketMitVertragsSchaltern(aktiv, b);
                      let liste = featuresMitProvisionsSaetzen(
                        paketAngezeigt,
                        { ...b, satzIndividuell, satzLead, satzEigen, satzBestand, satzNeubau },
                        supportsIndividuell ? currentSaetze() : undefined,
                      );
                      if (paket === "junior" && gewaehltesLeadPaket) {
                        liste = liste
                          .filter((f) => !f.startsWith("Optionales Leadpaket"))
                          .concat([
                            `Lead-Paket gebucht: ${formatPreis(gewaehltesLeadPaket.betrag)} netto für ${gewaehltesLeadPaket.anzahl} qualifizierte Leads (${leadAnlage})`,
                          ]);
                      } else if (leadEinzelkauf) {
                        liste = liste
                          .filter((f) => !f.startsWith("Optionales Leadpaket"))
                          .concat([
                            `Leads einzeln erwerbbar: ${formatPreis(LEAD_EINZELPREIS)} netto je Lead, ohne Paket und ohne Abnahmepflicht (individuell vereinbart, § 5 Absatz 2a)`,
                          ]);
                      }
                      return liste;
                    })().map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="flex justify-end border-t pt-3">
                <Button size="sm" variant="brand" onClick={() => speichernUndEinklappen(3)} disabled={busy || !paket}>
                  Paket und Konditionen speichern
                </Button>
              </div>
            )}
          </ClosingSchrittKarte>

          {/* ── 4 Adressen und Vertragsdaten ── */}
          <ClosingSchrittKarte
            nr={4}
            titel={CLOSING_SCHRITT_TITEL[4]}
            zustand={schritt(4).zustand}
            aufgeklappt={offen[4] === true}
            onAufklappen={() => aufklappen(4)}
            onEinklappen={() => einklappen(4)}
            hervorgehoben={fortschritt.aktiverSchritt === 4}
            sperrText="Vertragsanschrift (Pflicht) und Rechnungsadresse (Pflicht, darf abweichen). Werden im Videocall in der Moderation erfasst und hier nachgebessert."
            badges={adressenUngespeichert ? <NichtGespeichertBadge /> : undefined}
          >
            <p className="text-xs text-muted-foreground">
              Vertragsanschrift ist die Anschrift der Person, die unterschreibt. Die Rechnungsadresse darf abweichen,
              etwa ein Firmensitz. Beide Blöcke werden im Videocall in der Moderation erfasst und können hier
              nachgebessert werden.
            </p>
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              {/* Vertragsanschrift: steht im Handelsvertretervertrag als Anschrift
                  des Vertriebspartners. Getrennt von der Rechnungsadresse, denn die
                  darf ein Firmensitz sein. */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    Vertragsanschrift <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-destructive font-medium ml-1">Pflichtfeld</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">Vorname Nachname <span className="text-destructive">*</span></Label>
                    <Input
                      value={vaName} onChange={(e) => setVaName(e.target.value)}
                      disabled={!canEdit} placeholder="z. B. Max Mustermann"
                      className={!vaName.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">Straße und Hausnummer <span className="text-destructive">*</span></Label>
                    <Input
                      value={vaStrasse} onChange={(e) => setVaStrasse(e.target.value)}
                      disabled={!canEdit} placeholder="z. B. Musterstraße 12"
                      className={!vaStrasse.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">PLZ <span className="text-destructive">*</span></Label>
                    <Input
                      value={vaPlz} onChange={(e) => setVaPlz(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                      disabled={!canEdit} placeholder="83075" inputMode="numeric"
                      className={!vaPlz.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ort <span className="text-destructive">*</span></Label>
                    <Input
                      value={vaOrt} onChange={(e) => setVaOrt(e.target.value)}
                      disabled={!canEdit} placeholder="Bad Feilnbach"
                      className={!vaOrt.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                </div>
              </div>

              {/* Rechnungsadresse */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    Rechnungsadresse <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-destructive font-medium ml-1">Pflichtfeld</span>
                </div>

                {/* Identisch mit der Vertragsanschrift */}
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1">
                  <Checkbox
                    checked={identischVertrag}
                    onCheckedChange={(v) => handleIdentisch(Boolean(v))}
                    disabled={!canEdit || !vertragsAdresse.trim()}
                  />
                  <span>
                    Identisch mit Vertragsanschrift
                    {vertragsAdresse.trim() && (
                      <span className="text-muted-foreground ml-1">
                        ({vertragsAdresse.split("\n").join(", ")})
                      </span>
                    )}
                  </span>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">Vorname Nachname / Firmenname <span className="text-destructive">*</span></Label>
                    <Input
                      value={raName} onChange={(e) => setRaName(e.target.value)}
                      disabled={!canEdit} placeholder="z. B. Max Mustermann oder Mustermann GmbH"
                      className={!raName.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">Straße und Hausnummer <span className="text-destructive">*</span></Label>
                    <Input
                      value={raStrasse} onChange={(e) => setRaStrasse(e.target.value)}
                      disabled={!canEdit} placeholder="z. B. Musterstraße 12"
                      className={!raStrasse.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">PLZ <span className="text-destructive">*</span></Label>
                    <Input
                      value={raPlz} onChange={(e) => setRaPlz(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                      disabled={!canEdit} placeholder="83075" inputMode="numeric"
                      className={!raPlz.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ort <span className="text-destructive">*</span></Label>
                    <Input
                      value={raOrt} onChange={(e) => setRaOrt(e.target.value)}
                      disabled={!canEdit} placeholder="Bad Feilnbach"
                      className={!raOrt.trim() ? "border-destructive/60" : ""}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">↑ wird in der Übersicht und auf der Rechnung verwendet</p>
              </div>
            </div>
            {(!vertragsAdresse.trim() || !rechnungsAdresse.trim()) && (
              <p className="text-[11px] text-destructive font-medium">
                Ohne Vertragsanschrift und Rechnungsadresse kann kein Vertrag erstellt werden.
              </p>
            )}
            {canEdit && (
              <div className="flex justify-end border-t pt-3">
                <Button size="sm" variant="brand" onClick={() => speichernUndEinklappen(4)} disabled={busy}>
                  Adressen speichern
                </Button>
              </div>
            )}
          </ClosingSchrittKarte>

          {/* ── 5 Startfahrplan. Nach einer Absage ausgeblendet,
                Startunterlagen sind dann gegenstandslos. ── */}
          {entscheidung !== "nein" && (
            <ClosingSchrittKarte
              nr={5}
              titel={CLOSING_SCHRITT_TITEL[5]}
              zustand={schritt(5).zustand}
              aufgeklappt={offen[5] === true}
              onAufklappen={() => aufklappen(5)}
              onEinklappen={() => einklappen(5)}
              /* Ob und wann der Startfahrplan raus ist, steht in der
                 Seitenleiste. Maßgeblich ist dort das Feld am Bewerber, nicht
                 der Verfolgungseintrag: Der entsteht schon vor dem Absenden. */
            >
              <p className="text-xs text-muted-foreground">
                Unverbindlich: der persönliche <strong>Startfahrplan bei MOREImmo</strong> als PDF per E-Mail
                (Einleitung, der Weg als Vertriebspartner, der optionale Leadkanal und die nächsten Schritte).
                {" "}Jetzt geht die{" "}
                <strong>{startfahrplanFassung === "erweitert" ? "erweiterte Fassung" : "kompakte Fassung"}</strong>
                {" "}raus{startfahrplanFassung === "erweitert"
                  ? ", weil das Erstgespräch abgeschlossen ist und Teil 2 komplett geführt wurde."
                  : "; die erweiterte Fassung folgt erst, wenn das Erstgespräch abgeschlossen und Teil 2 komplett ist."}
                {" "}Der Startfahrplan ist <strong>kein</strong> Bestandteil des späteren Vertrags.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handlePaketUebersichtSenden}
                  disabled={!canEdit || sendingUebersicht || !b.email}
                  title={!b.email ? "Bewerber-E-Mail fehlt" : "Startfahrplan bei MOREImmo (PDF) per E-Mail an den Bewerber schicken"}
                  className="gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {sendingUebersicht ? "Wird versendet …" : startfahrplanVersendetAm ? "Startfahrplan erneut senden" : "Startfahrplan senden"}
                </Button>
                {/* `break-all`: Eine Mailadresse hat keine Umbruchstelle und stand
                    auf dem Handy sonst ueber dem Kartenrand. */}
                <span className="break-all text-[11px] text-muted-foreground">
                  {b.email ? `an ${b.email}` : "Hinweis: Für den Versand muss im Bewerberprofil eine E-Mail-Adresse hinterlegt sein."}
                </span>
              </div>
              {trackings.length > 0 && (
                <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Versand-Historie & Tracking
                  </p>
                  {trackings.map((t) => {
                    const isPaket = t.kind === "paket_uebersicht";
                    const Icon = isPaket ? Mail : FileText;
                    /*
                     * Hier stand bis zum 17.09.2026 eine Weiche mit zwei
                     * Faellen fuer sieben Mailarten: Alles, was nicht der
                     * Startfahrplan war, hiess „Mustervertrag". Seit dem
                     * 15.09.2026 laufen auch die Kennenlern-Einladung, drei
                     * Erinnerungen und die Kooperations-Einladung ueber
                     * dieselbe Tabelle, und diese Liste laedt ALLE Zeilen des
                     * Bewerbers.
                     *
                     * Christian las daraufhin „Mustervertrag „?" · versendet"
                     * und musste annehmen, ein Vertrag gehe von selbst hinaus.
                     * Das Fragezeichen war der fehlende Paketname: Eine
                     * Kennenlern-Mail hat keines.
                     */
                    const label = mailArtLabel(t.kind, t.paket_titel || t.paket);
                    return (
                      <div key={t.token} className="rounded border border-border/60 bg-background/60 p-2 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">versendet:</span>
                          <strong className="font-medium">{formatVersandTs(t.sent_at)}</strong>
                          {/* Der Eintrag entsteht vor dem Absenden. Fehlt danach
                              der Zeitstempel am Bewerber, ist die Mail nicht
                              rausgegangen. */}
                          {isPaket && !b.paketUebersichtSentAt && (
                            <Badge
                              variant="outline"
                              className="h-5 border-amber-400/60 text-[10px] text-amber-700 dark:text-amber-400"
                              title="Der Eintrag wird vor dem Absenden angelegt. Ohne bestätigten Versand am Bewerber ist die Mail vermutlich nicht angekommen."
                            >
                              Versand nicht bestätigt
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pl-5 text-[11px]">
                          {t.tracked === false ? (
                            <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                              Tracking nicht verfügbar (Altdaten)
                            </Badge>
                          ) : (
                            <Badge
                              className={`h-5 text-[10px] ${t.clicked_at ? "bg-green-600 text-white hover:bg-green-600" : "bg-muted text-muted-foreground hover:bg-muted"}`}
                            >
                              {t.clicked_at ? `🖱 Link geöffnet · ${formatVersandTs(t.clicked_at)}` : "Link noch nicht geöffnet"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">
                    Hinweis: Öffnen wird über ein 1×1-Pixel erkannt – manche Mail-Clients blockieren Bilder, dann bleibt der Status „nicht geöffnet" obwohl die Mail gelesen wurde. Der Link-Klick ist zuverlässiger.
                  </p>
                </div>
              )}
            </ClosingSchrittKarte>
          )}

          {/* Hinweis im Endzustand: Eingeklappt heißt nicht gesperrt. */}
          {fortschritt.vertragErzeugt && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-[11px] leading-snug text-muted-foreground">
              <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div>
                <strong className="text-foreground">Eingeklappte Karten bleiben änderbar.</strong> Ein Klick auf die Karte
                oder auf den Stift öffnet sie wieder, auch nach dem Vertrag. Ändert sich danach Paket, Schalter, Satz oder
                Adresse, weist Karte 6 darauf hin und bietet „Vertrag mit aktuellem Paket neu erstellen" an. Nach der
                Unterschrift sind Paket und Adressen schreibgeschützt.
              </div>
            </div>
          )}

          {/* ── 6 Vertrag erzeugen und senden ── */}
          <ClosingSchrittKarte
            nr={6}
            titel={CLOSING_SCHRITT_TITEL[6]}
            zustand={schritt(6).zustand}
            // Karte 6 bleibt immer offen, hier stehen Stempel und Wächter.
            aufgeklappt
            onAufklappen={() => aufklappen(6)}
            onEinklappen={() => einklappen(6)}
            hervorgehoben={fortschritt.aktiverSchritt === 6}
            sperrText="Erzeugt den Handelsvertretervertrag mit allen Anlagen aus Paket, Schaltern, Sätzen, Lead-Paket und beiden Adressen. Freigeschaltet, sobald Entscheidung, Paket und Adressen stehen."
            badges={
              schritt(6).zustand === "gesperrt"
                ? <Badge variant="secondary" className="h-5 text-[10px]">noch nicht möglich</Badge>
                : b.paketBestaetigtAm
                  ? <Badge className={`h-5 text-white text-[10px] ${b.vertragStatus === "nicht_gesendet" ? "bg-green-600 hover:bg-green-600" : "bg-blue-600 hover:bg-blue-600"}`}>
                      Vertrag {schritt(6).kurz}
                    </Badge>
                  : <Badge className="h-5 bg-primary/10 text-primary hover:bg-primary/10 text-[10px]">nächster Schritt</Badge>
            }
          >
            <p className="text-xs text-muted-foreground">
              {b.paketBestaetigtAm
                ? <>Der Handelsvertretervertrag mit allen Anlagen wurde erzeugt. Versand, Erinnerungen, Unterschrift und Gegenzeichnung laufen im Reiter <strong>Vertrag</strong>.</>
                : <>Erzeugt den Handelsvertretervertrag mit allen Anlagen aus dem oben gewählten Paket, den Schaltern, den Sätzen, dem Lead-Paket und beiden Adressen. Der Status springt auf <strong>Vertrag</strong>. Gesendet wird im Reiter Vertrag.</>}
            </p>
            {vertragVeraltet && (
              <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2" data-testid="konditionen-waechter">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">Der Vertrag (Version {b.vertragVersion || 1}) ist veraltet:</span>{" "}
                  Seit der Erstellung wurden Paket, Sätze, Schalter, Vertragsfassung oder Leadpaket geändert.
                  Bitte „Vertrag mit aktuellem Paket neu erstellen", bevor er versendet wird.
                </span>
              </div>
            )}
            {aktiv && (
              <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[11px]">
                <span className="text-muted-foreground">Vertragsdokument</span>
                <span className="text-right font-medium">{aktiv.titel}{aktiv.istTippgeber ? "" : `, ${aktiv.provisionssatz} % Provision`}</span>
                <span className="text-muted-foreground">Laufendes Entgelt und Laufzeit</span>
                <span className="text-right font-medium">
                  {aktiv.istTippgeber ? "keines, unbefristet"
                    : aktiv.preis > 0 ? `${formatPreis(aktiv.monatlich)}/Monat, ${aktiv.laufzeitMonate} Monate Mindestlaufzeit`
                    : "keines, unbestimmte Zeit nach § 89 HGB"}
                </span>
                {aktiv.istTippgeber ? (
                  <>
                    <span className="text-muted-foreground">Tippgeber-Vergütung</span>
                    <span className="text-right font-medium">
                      {tippgeberBetrag.trim() ? `${tippgeberBetrag} ${tippgeberModell === "euro" ? "€ pro Abschluss" : "% vom Kaufpreis"}` : "fehlt"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">Provisionssätze</span>
                    <span className="text-right font-medium">
                      {satzIndividuell.trim() ? `${satzIndividuell} % (individuell)`
                        : satzLead.trim() || satzEigen.trim() ? `Lead ${satzLead || "Standard"} %, Eigen ${satzEigen || "Standard"} % (individuell)`
                        : "Standard (keine individuellen Sätze)"}
                    </span>
                    <span className="text-muted-foreground">Wettbewerb</span>
                    <span className="text-right font-medium">
                      {individuelleFassung
                        ? (vertragsFassung === "alt" ? "Individuelle Fassung mit Anlage 8" : "Individuelle Fassung, erklärt im Konditionenblatt")
                        : "Standard mit Wettbewerbsverbot"}
                      {!individuelleFassung && (b.andereVertriebe || "").trim() ? " · Hinweis: andere Vertriebe genannt" : ""}
                    </span>
                    <span className="text-muted-foreground">Lead-Paket</span>
                    <span className="text-right font-medium">
                      {gewaehltesLeadPaket ? `${formatPreis(gewaehltesLeadPaket.betrag)} netto für ${gewaehltesLeadPaket.anzahl} Leads, ${leadAnlage}` : "keins"}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">Adressen</span>
                <span className="text-right font-medium">
                  {vertragsAdresse.trim() && rechnungsAdresse.trim() ? "Vertragsanschrift und Rechnungsadresse vollständig" : "fehlen noch"}
                </span>
              </div>
            )}

            {canEdit && (
              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" onClick={speichern} disabled={busy}>
                  Speichern
                </Button>
                {b.paketBestaetigtAm ? (
                  <>
                    <Button
                      size="sm"
                      variant="erfolg"
                      disabled
                      className="opacity-100 disabled:opacity-100 cursor-default"
                      title={`Bestätigt am ${new Date(b.paketBestaetigtAm).toLocaleString("de-DE")}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Paket bestätigt & Vertrag erstellt · {new Date(b.paketBestaetigtAm).toLocaleString("de-DE", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </Button>
                    {b.vertragStatus !== "unterschrieben" && (
                      <Button
                        size="sm"
                        variant="brand"
                        onClick={handlePaketBestaetigen}
                        disabled={busy || !paket || !rechnungsAdresse.trim()}
                        title="Erstellt den Handelsvertretervertrag inkl. aller Anlagen mit dem aktuell ausgewählten Vertragsdokument neu und überschreibt die bisherige Version."
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        {busy ? "Vertrag wird neu erstellt …" : "Vertrag mit aktuellem Paket neu erstellen"}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={handlePaketBestaetigen}
                    disabled={busy || !paket || !rechnungsAdresse.trim()}
                    title={!rechnungsAdresse.trim() ? "Bitte zuerst die Rechnungsadresse eintragen" : undefined}
                  >
                    {busy ? "Vertrag wird erstellt …" : <>Paket bestätigen & Vertrag erstellen <ArrowRight className="h-3.5 w-3.5 ml-1" /></>}
                  </Button>
                )}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground text-right">
              {b.paketBestaetigtAm
                ? <>„Neu erstellen" setzt Versand und Signatur zurück und ist nach der Unterschrift gesperrt.</>
                : <>Nach dem Erzeugen: grüner Stempel „Paket bestätigt & Vertrag erstellt" und der Knopf „Vertrag mit aktuellem Paket neu erstellen".</>}
            </p>
          </ClosingSchrittKarte>
        </div>

        {/* ── Seitenleiste ── */}
        <aside className="space-y-4">
          <Card className="p-4" data-testid="closing-seitenleiste-fortschritt">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Fortschritt im Closing</p>
            {/* Die einzige vollständige Übersicht: gleiche Namen und gleiche
                Ergebnisse wie an den Karten, nur ausführlicher. Der Text darf
                umbrechen, vorher wurde er einzeilig abgeschnitten. Ein Klick
                öffnet die zugehörige Karte und springt hin. */}
            <ul className="space-y-2">
              {fortschritt.schritte.map((s) => {
                const aktivSchritt = s.nr === fortschritt.aktiverSchritt;
                return (
                  <li key={s.nr}>
                    <button
                      type="button"
                      onClick={() => springeZuSchritt(s.nr)}
                      disabled={s.zustand === "gesperrt"}
                      className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
                      title={s.zustand === "gesperrt" ? undefined : `Zu Schritt ${s.nr} springen`}
                    >
                      {s.zustand === "erledigt"
                        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                        : <Circle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${aktivSchritt ? "text-primary fill-primary/20" : "text-muted-foreground/50"}`} />}
                      <div className="min-w-0 flex-1">
                        <div className={`flex items-center gap-1.5 font-medium ${aktivSchritt ? "text-primary" : s.zustand === "gesperrt" ? "text-muted-foreground" : ""}`}>
                          <span>{s.nr} {s.titel}</span>
                          {s.ausGespraech && <AusGespraechZeichen klein />}
                        </div>
                        {s.zeilen.map((z, i) => (
                          <div key={i} className="text-[10px] leading-snug text-muted-foreground">{z}</div>
                        ))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4" data-testid="closing-seitenleiste-fehlt">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Was noch fehlt</p>
            {fortschritt.fehlt.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {fortschritt.entscheidung === "nein"
                  ? "Nichts. Die Bewerbung ist abgelehnt."
                  : "Nichts. Der nächste Schritt liegt im Reiter Vertrag."}
              </p>
            ) : (
              <ul className="space-y-2">
                {fortschritt.fehlt.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {f.dringend
                      ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
                    <div className="min-w-0">
                      <div className={`font-medium ${f.dringend ? "text-amber-700 dark:text-amber-400" : ""}`}>{f.text}</div>
                      {f.unter && <div className="text-[10px] text-muted-foreground">{f.unter}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {neuerProzess ? (
            /* Dieselbe Zusammenfassung wie im Reiter Videocall: der Weg, alle
               Antworten, die Merkmale, unsere Entscheidung und sein Wunsch. */
            <Card className="p-4 space-y-3" data-testid="closing-seitenleiste-kennenlernbogen">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Aus dem Kennenlernbogen
              </p>
              {kennenlernen ? (
                <>
                  <KennenlernbogenUebersicht antworten={kennenlernen} />
                  <KennenlernbogenTagesordnung antworten={kennenlernen} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Es liegt kein eingereichter Bogen vor. Die Einladung lässt sich in der Übersicht
                  erneut verschicken.
                </p>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-2 text-[11px]">
                <dt className="text-muted-foreground">Unsere Entscheidung</dt>
                <dd className="text-right font-medium">
                  {videocall?.entscheidung ? ENTSCHEIDUNG_LABELS[videocall.entscheidung] : "noch offen"}
                </dd>
                <dt className="text-muted-foreground">Sein Wunsch</dt>
                <dd className="text-right font-medium">
                  {videocall?.wunsch ? WUNSCH_LABELS[videocall.wunsch].label : "noch offen"}
                </dd>
              </dl>
              <p className="border-t pt-2 text-[10px] leading-snug text-muted-foreground">
                Erfasst im persönlichen Gespräch. Entscheidung und Adressen bleiben hier änderbar.
              </p>
            </Card>
          ) : (
          <Card className="p-4" data-testid="closing-seitenleiste-erstgespraech">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Aus dem Erstgespräch</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-muted-foreground">Empfehlung</dt>
              <dd className="text-right font-medium">{score ? `${EMPFEHLUNG_LABELS[score.empfehlung]} (${score.punkte} Punkte)` : "noch offen"}</dd>
              <dt className="text-muted-foreground">Profil</dt>
              <dd className="text-right font-medium">{profil?.label || "—"}</dd>
              <dt className="text-muted-foreground">Zeit pro Woche</dt>
              <dd className="text-right font-medium">{ZEIT_LABEL[assessment?.zeitProWoche || ""] || "—"}</dd>
              <dt className="text-muted-foreground">Gewerbe und 34c</dt>
              <dd className="text-right font-medium">{ERLAUBNIS_LABEL[assessment?.bereitschaft34c || ""] || "—"}</dd>
              <dt className="text-muted-foreground">Teil 2</dt>
              <dd className="text-right font-medium">
                {fortschritt.teil2Komplett ? "im Gespräch komplett" : teil2Aktiv ? "im Gespräch begonnen" : b.closingTerminDatum ? "nicht geführt (Termin gebucht)" : "nicht geführt"}
              </dd>
              <dt className="text-muted-foreground">Startweiche</dt>
              <dd className="text-right font-medium">{STARTWEICHE_LABEL[startWeiche] || "offen"}</dd>
              <dt className="text-muted-foreground">Rechner</dt>
              <dd className="text-right font-medium">{rechnerAbschluesse ? `${rechnerAbschluesse} Abschlüsse pro Monat` : "—"}</dd>
            </dl>
            <p className="mt-3 border-t pt-2 text-[10px] text-muted-foreground leading-snug">
              KI-Zusammenfassung Erstgespräch und Closing liegt im Reiter Erstgespräch und in der Übersicht.
            </p>
          </Card>
          )}
        </aside>
      </div>
    </div>
  );
};
