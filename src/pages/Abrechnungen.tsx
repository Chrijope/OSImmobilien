import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { getKontakte } from "@/lib/kundenStore";
import { getInvestments } from "@/lib/investmentsStore";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { istZustaendig } from "@/lib/kontaktOwnership";
import { kennungZuName } from "@/lib/beraterNamensabgleich";
import { KARRIERE_STUFEN, findKarriereStufe, formatSatzProzent, getKarriereOverrideForUser, getKarriereStufe, getEffectiveRate, getCustomProvisionRate, getCustomProvisionRateSetter, getCustomProvisionRateEigen, getEffectiveRateInfoForKontakt, festgeschriebenerSatz, type Satzart } from "@/lib/karriereStufeHelper";
import { OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import { SatzartBadge, SatzartLegende } from "@/components/abrechnung/SatzartBadge";
import { logAudit } from "@/lib/auditLog";
import { cacheGet } from "@/lib/dataCache";
import { PageHeader } from "@/components/PageHeader";
import { AbrechnungenTabs } from "@/components/AbrechnungenTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RechnungsGeneratorDialog } from "@/components/unterlagen/RechnungsGeneratorDialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Search, FileText, Download, ArrowLeft, Info, Users,
  CheckCircle2, AlertTriangle, Clock, Upload, X, FilePlus2,
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { darfGesamtabrechnungSehen } from "@/lib/datenSicht";
import {
  istAbschluss,
  istProvisionsrelevant,
  istStorniert,
  istQualifiziert,
  istNotarDurchlaufen,
  istKaufphaseVorNotar,
  ABSCHLUSS_STUFEN,
  ABWICKLUNG_STUFEN,
} from "@/lib/abschlussDefinition";
import {
  abgerechneteGeschaefte, abrechnungsHistorie, abrechnungsstand, notarDatumFuer, investmentsJeKontakt,
  investmentsOhneKaufpreis, istAbrechenbar, kaufpreisMitRueckfall, provisionCent, rechnungsHinweis,
  type GeschaeftZuordnung, type KaufpreisFehlt,
} from "@/lib/abrechnungRechnung";
import {
  AbschlussDoppelt, BescheidWeichtAb, abrechnungenPersistenz, bisherErhalten, getAbrechnungen, rechnungFuer,
  rechnungsStatus, refreshAbrechnungen, setzeRechnungBezahlt,
} from "@/lib/provisionsAbrechnungStore";
import { hinweisDialog } from "@/lib/confirm";
import { useCacheReady } from "@/hooks/useCacheReady";
import { monatBerlinIso } from "@/lib/datumsformate";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { investmentKaufpreis } from "@/lib/objektDatenPflicht";
import { abwicklungAusMeta } from "@/lib/abwicklungStore";
import { toast } from "sonner";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";

// ── Karrierestufen mit Overhead-Rang ──
// Satz und Titel kommen aus der kanonischen Stufen-Definition in
// karriereStufeHelper (findKarriereStufe loest auch Legacy-Titel und
// Kennungen auf). Der Rang fuer den Overhead-Vergleich ergibt sich aus der
// Reihenfolge in KARRIERE_STUFEN, 1 ist die niedrigste Stufe.
function findStufeMitRang(karriere: string): { rate: number; rang: number } | undefined {
  const stufe = findKarriereStufe(karriere);
  if (!stufe) return undefined;
  return { rate: stufe.rate, rang: KARRIERE_STUFEN.indexOf(stufe) + 1 };
}

// ── Partner-Daten mit Teamzugehörigkeit ──
interface PartnerData {
  userId: string;
  kuerzel: string;
  name: string;
  email: string;
  karriere: string;
  karriereIcon: string;
  status: string;
  /** Alles ab Reservierung: was kommen koennte, die Erwartung. */
  provision: number;
  /**
   * Nur mit erreichter Kaufpreisfaelligkeit und noch nicht ausgezahlt: was
   * heute abrechenbar ist. Bis zum 04.10.2026 zaehlte hier auch, was laengst
   * in einem ausgezahlten Bescheid stand.
   */
  faellig: number;
  /** Abrechenbar und bereits in einem ausgezahlten Bescheid. */
  bezahlt: number;
  /** Abrechenbar, aber einem Altbescheid nicht eindeutig zuzuordnen: bitte klären. */
  klaeren: number;
  /**
   * Geschaefte mit durchlaufenem Notartermin. Heisst in der Oberflaeche
   * "Abschluesse"; der Feldname bleibt vorerst, damit nicht dieselbe
   * Aenderung an zwanzig Stellen noetig wird.
   */
  vermittlungen: number;
  teamleaderId?: string;
  effectiveRate: number;
  setterRate?: number | null;
  eigenRate?: number | null;
  abschluesse: {
    investmentId: string;
    kontaktId: string;
    kundeName: string;
    /** Steht schon in einem ausgezahlten Bescheid. */
    ausgezahlt: boolean;
    /** Ein Altbescheid zum Kunden laesst sich nicht eindeutig zuordnen. */
    klaeren: boolean;
    objekt: string;
    kaufpreis: number;
    notarDatum: string;
    kaufpreisfaellig: string;
    /** Dasselbe Datum unformatiert, JJJJ-MM-TT. Die Historie gruppiert danach. */
    kaufpreisfaelligAm: string;
    /** Die Pipelinestufe, fuer die Zaehlung der Abschluesse. */
    stufe: string;
    /** Notartermin durchlaufen UND Kaufpreisfaelligkeit erreicht. */
    abrechenbar: boolean;
    status: string;
    /** Welcher Satz auf genau diesen Abschluss angewandt wurde und warum. */
    satz: number;
    satzart: Satzart;
    /** Nur bei festgeschriebenem Satz und nur, wenn er vom heutigen abweicht. */
    heutigerSatz?: number;
    provision: number;
  }[];
}

// ── Overhead-Berechnung (Funktion bleibt, wird jetzt dynamisch aufgerufen) ──
function berechneOverhead(allPartner: PartnerData[]) {
  const overheadEinnahmen: Record<string, { gesamt: number; details: { vonPartner: string; objekt: string; kaufpreis: number; overheadRate: number; betrag: number }[] }> = {};
  const overheadAusgaben: Record<string, { anPartner: string; objekt: string; kaufpreis: number; overheadRate: number; betrag: number }[]> = {};

  allPartner.forEach(p => {
    const stufe = findStufeMitRang(p.karriere);
    if (!stufe || !p.teamleaderId) return;
    const teamleader = allPartner.find(tl => tl.userId === p.teamleaderId);
    if (!teamleader) return;
    const tlStufe = findStufeMitRang(teamleader.karriere);
    if (!tlStufe || tlStufe.rang <= stufe.rang) return;
    // Overhead = Differenz zwischen Teamleiter-Rate und Partner-Rate
    const tlEffectiveRate = getEffectiveRate(teamleader.userId) ?? tlStufe.rate;
    const pEffectiveRate = getEffectiveRate(p.userId) ?? stufe.rate;
    const overheadRate = tlEffectiveRate - pEffectiveRate;
    if (overheadRate <= 0) return;

    p.abschluesse.forEach(a => {
      const betrag = Math.round(a.kaufpreis * (overheadRate / 100));
      if (!overheadEinnahmen[teamleader.kuerzel]) overheadEinnahmen[teamleader.kuerzel] = { gesamt: 0, details: [] };
      overheadEinnahmen[teamleader.kuerzel].gesamt += betrag;
      overheadEinnahmen[teamleader.kuerzel].details.push({ vonPartner: p.name, objekt: a.objekt, kaufpreis: a.kaufpreis, overheadRate, betrag });
      if (!overheadAusgaben[p.kuerzel]) overheadAusgaben[p.kuerzel] = [];
      overheadAusgaben[p.kuerzel].push({ anPartner: teamleader.name, objekt: a.objekt, kaufpreis: a.kaufpreis, overheadRate, betrag });
    });
  });
  return { overheadEinnahmen, overheadAusgaben };
}

function gesamtAuszahlungWith(p: PartnerData, ohMap: Record<string, { gesamt: number; details: any[] }>) {
  return p.provision + (ohMap[p.kuerzel]?.gesamt || 0);
}

// ── Gutschrift-Status pro Partner (localStorage) ──
interface GutschriftStatus {
  provisionBestaetigt: boolean;
  overheadBestaetigt: boolean;
  gutschriftUeberwiesen: boolean;
  pdfHinterlegt: boolean;
  pdfName?: string;
  pdfData?: string; // base64
  pdfUploadedAt?: string;
  bestaetigtAm?: string;
  bestaetigtVon?: string;
}

const GS_KEY = "mi_gutschrift_status";
const GS_NOTIF_KEY = "mi_gutschrift_notifications";

type GutschriftStore = { [partnerMonthKey: string]: GutschriftStatus };

interface GutschriftNotification {
  id: string;
  partnerKuerzel: string;
  partnerName: string;
  monat: string;
  betrag: number;
  pdfName: string;
  gelesen: boolean;
  timestamp: string;
}

function loadGutschriftStatus(): GutschriftStore {
  if (isTestAccount()) { try { const raw = localStorage.getItem(GS_KEY); if (raw) return JSON.parse(raw); } catch {} return {}; }
  return getUserSetting<GutschriftStore>("gutschrift_status", {});
}

function saveGutschriftStatus(data: GutschriftStore) {
  if (isTestAccount()) { localStorage.setItem(GS_KEY, JSON.stringify(data)); return; }
  setUserSetting("gutschrift_status", data);
}

function getDefaultGS(): GutschriftStatus {
  return { provisionBestaetigt: false, overheadBestaetigt: false, gutschriftUeberwiesen: false, pdfHinterlegt: false };
}

function loadGutschriftNotifications(): GutschriftNotification[] {
  if (isTestAccount()) { try { const raw = localStorage.getItem(GS_NOTIF_KEY); if (raw) return JSON.parse(raw); } catch {} return []; }
  return getUserSetting<GutschriftNotification[]>("gutschrift_notifications", []);
}

function saveGutschriftNotification(n: Omit<GutschriftNotification, "id" | "timestamp" | "gelesen">) {
  const notifs = loadGutschriftNotifications();
  notifs.unshift({
    ...n,
    id: `gs-${Date.now()}`,
    timestamp: new Date().toISOString(),
    gelesen: false,
  });
  if (isTestAccount()) { localStorage.setItem(GS_NOTIF_KEY, JSON.stringify(notifs)); return; }
  setUserSetting("gutschrift_notifications", notifs);
}

function downloadBase64(data: string, filename: string) {
  const link = document.createElement("a");
  link.href = data;
  link.download = filename;
  link.click();
}

// Provisionsentwicklung wird dynamisch über die ProvisionsEntwicklungChart-Komponente berechnet

const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/**
 * Provisionsentwicklung pro VP – aktuelles Jahr
 * - Festgeschrieben: Notartermin in Vergangenheit
 * - Prognose: Notartermin in Zukunft + Pipeline (Reservierung/Notar/Finanzierung)
 */
function ProvisionsEntwicklungChart({ partnerName, partnerId }: { partnerName: string; partnerId?: string }) {
  const _cv = useLiveVersion(["kontakte", "investments", "user_settings", "profiles"]);
  const data = useMemo(() => {
    const allUsers = loadAllUsers();
    // Kennung zuerst; der Name nur, wenn genau ein Nutzer so heisst.
    const kennung = partnerId || kennungZuName(partnerName, allUsers);
    const u = kennung ? allUsers.find((au: any) => au.id === kennung) : undefined;
    // Ohne auffindbaren Nutzer gibt es keinen gepflegten Satz. Früher stand
    // hier ein stiller Notfallwert von 5 %; jetzt rechnet der Chart ehrlich
    // mit 0 und weist den fehlenden Satz im Kopf aus.
    const override = u ? getKarriereOverrideForUser(u.id) : null;
    const rate: number | null = u ? getEffectiveRate(u.id, getKarriereStufe(0, override)) : null;

    const now = new Date();
    const currentYear = now.getFullYear();
    const kontakteById = new Map(
      getKontakte().filter(k => !k.archiviert && (!partnerName || istZustaendig(k, { userId: u?.id, userName: partnerName }, allUsers)))
        .map(k => [k.id, k]),
    );
    const monthMap: Record<string, { festgeschrieben: number; prognose: number }> = {};
    MONTHS_DE.forEach(m => { monthMap[m] = { festgeschrieben: 0, prognose: 0 }; });

    const alleInvestments = getInvestments();
    const jeKontakt = investmentsJeKontakt(alleInvestments);
    alleInvestments.forEach(inv => {
      const k = kontakteById.get(inv.kontaktId);
      if (!k) return;
      // Verlorene und stornierte Geschaefte zaehlen nicht, auch wenn ein
      // Notartermin eingetragen ist.
      if (istStorniert(inv) || istStorniert(k)) return;
      // Der Kaufpreis kommt vom Investment, der Kontaktwert nur bei genau
      // einem Investment des Kontakts.
      const kp = kaufpreisMitRueckfall(investmentKaufpreis(inv.id), k.kaufpreis, jeKontakt.get(inv.kontaktId) ?? 0);
      if (kp <= 0) return;
      const provisionBetrag = provisionCent(kp, rate ?? 0) / 100;
      if (inv.notarTermin) {
        const d = new Date(inv.notarTermin);
        if (!isNaN(d.getTime()) && d.getFullYear() === currentYear) {
          if (d < now) {
            monthMap[MONTHS_DE[d.getMonth()]].festgeschrieben += provisionBetrag;
          } else {
            monthMap[MONTHS_DE[d.getMonth()]].prognose += provisionBetrag;
          }
          return;
        }
      }
      // Reservierung bis Notar. Vorher ein Teilwortvergleich mit dem
      // Schluessel "notartermin", den es nie gab; "bonitaetsunterlagen" fehlte.
      if (istKaufphaseVorNotar(inv.pipelineStufe)) {
        monthMap[MONTHS_DE[now.getMonth()]].prognose += provisionBetrag;
      }
    });

    return {
      rate,
      bars: MONTHS_DE.map(m => ({
        monat: m,
        festgeschrieben: Math.round(monthMap[m].festgeschrieben),
        prognose: Math.round(monthMap[m].prognose),
      })),
    };
  }, [partnerName, partnerId, _cv]);

  const totalFest = data.bars.reduce((s, d) => s + d.festgeschrieben, 0);
  const totalPrognose = data.bars.reduce((s, d) => s + d.prognose, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-primary rounded-full" />
            <CardTitle className="text-sm font-semibold font-sans">Provisionsentwicklung ({new Date().getFullYear()})</CardTitle>
            <Badge variant="outline" className="text-[10px]">{data.rate !== null ? `${data.rate} % Satz` : "Satz nicht gepflegt"}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Festgeschrieben: <span className={unscharfKlasse("font-semibold text-foreground")}>{totalFest.toLocaleString("de-DE")} €</span></span>
            <span className="text-muted-foreground">Prognose: <span className={unscharfKlasse("font-semibold text-primary")}>{totalPrognose.toLocaleString("de-DE")} €</span></span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Festgeschrieben: nach erfolgreichem Notartermin · Prognose: in Reservierung / Finanzierung / Notar
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.bars}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="monat" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} €`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
              formatter={(v: number, name: string) => [
                `${Number(v).toLocaleString("de-DE")} €`,
                name === "festgeschrieben" ? "Festgeschrieben" : "Prognose",
              ]}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} formatter={(v) => v === "festgeschrieben" ? "Festgeschrieben" : "Prognose"} />
            <Bar dataKey="festgeschrieben" stackId="a" fill="hsl(43 25% 74%)" barSize={22} />
            <Bar dataKey="prognose" stackId="a" fill="hsl(43 25% 74% / 0.4)" radius={[4, 4, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Titel und Saetze kommen aus KARRIERE_STUFEN, nur die Beispielrechnung ist
// lokal: Mehrverdienst bei 1.000.000 € vermitteltem Volumen. Die Uebersichten
// zeigen nur das aktuelle Modell (einheitliche 4-%-Stufe); Bestandsstufen
// (nurBestand) erscheinen nur, wenn der betrachtete Partner selbst darauf
// steht, damit seine Anzeige korrekt bleibt.
const provisionsStufen = KARRIERE_STUFEN.map((s) => ({
  id: s.id,
  nurBestand: !!s.nurBestand,
  volumen: s.titel,
  provision: formatSatzProzent(s.rate),
  beispiel: `${(s.rate * 10000).toLocaleString("de-DE")} €`,
}));

// Vorteile und Voraussetzungen sind Anzeige-Texte dieser Seite. Titel, Emoji
// und Saetze kommen aus der kanonischen Stufen-Definition.
const KARRIERE_STUFEN_ZUSATZ: Record<string, { vorteile: string[]; voraussetzungen: string[] }> = {
  tippgeber: {
    vorteile: ["Vollzugriff CRM & Pipeline", "Academy Grundkurse", "Persönliches Vertriebspartner-Microsite"],
    voraussetzungen: ["Bestandsstufe, wird nicht mehr neu vergeben"],
  },
  vertriebspartner: {
    vorteile: ["Einheitlich 4 % auf Lead- und Eigenkontakte", "Vollzugriff CRM & Pipeline", "Academy inkl. Aufbau- & Tax-Kursen", "Eigene Empfehlungsprogramme"],
    voraussetzungen: ["Onboarding abgeschlossen", "Paket: Vertriebspartner"],
  },
  manager: {
    vorteile: ["Alles aus Vertriebspartner", "Vertriebspartner werben & coachen", "1,5 % Override auf jeden Junior-Abschluss", "Team-Dashboard & Statistiken"],
    voraussetzungen: ["Bestandsstufe, wird nicht mehr neu vergeben"],
  },
  vertriebsfirma: {
    vorteile: ["Alles aus Team Lead", "2 % Override auf jeden Junior-Abschluss", "Whitelabel-Optionen für eigene Marke", "Direkter Ansprechpartner aus der Geschäftsleitung"],
    voraussetzungen: ["Bestandsstufe, wird nicht mehr neu vergeben"],
  },
};

const karriereStufen = KARRIERE_STUFEN.map((s) => ({
  titel: s.titel,
  emoji: s.emoji,
  nurBestand: !!s.nurBestand,
  provision: formatSatzProzent(s.rate),
  extras: s.juniorOverride ? `+${formatSatzProzent(s.juniorOverride)} Junior-Override` : undefined,
  vorteile: KARRIERE_STUFEN_ZUSATZ[s.id].vorteile,
  voraussetzungen: KARRIERE_STUFEN_ZUSATZ[s.id].voraussetzungen,
}));

// kontaktPotenzial wird dynamisch in der Komponente berechnet

// Abschluss-Boni gibt es in der Abrechnung nicht mehr.

/*
 * Die Abrechnungshistorie eines Partners.
 *
 * Hier stand bis zum 14.09.2026 ein fest leeres Array. Die Tabelle darunter
 * war damit nicht kaputt, sondern nie gebaut worden: Sie zeigte seit jeher
 * keine einzige Zeile.
 *
 * Gruppiert wird nach dem Monat der KAUFPREISFAELLIGKEIT, nicht nach dem des
 * Notartermins. Das ist der Monat, in dem der Partner abrechnen darf, und
 * danach fragt diese Tabelle. Zwischen Beurkundung und Zahlung liegen Wochen,
 * die beiden fallen also regelmaessig auseinander.
 *
 * Den Status holt `rechnungsStatus` aus `provisionsabrechnungen`. Ist dort
 * fuer den Monat nichts hinterlegt, gilt "Offen": Der Anspruch besteht, die
 * Abrechnung wurde nur noch nicht erstellt.
 */
function baueHistorie(
  abschluesse: PartnerData["abschluesse"],
  userId: string,
  // `fmt` liefert JSX und nicht Text, weil es im Vorfuehrmodus unscharf
  // zeichnet. Deshalb ReactNode statt string.
): { monat: string; abschluesse: number; provision: React.ReactNode; overhead: string; gesamt: React.ReactNode; status: string; kaufpreisfaellig: string; pdf: string | null }[] {
  return abrechnungsHistorie(
    abschluesse.map((a) => ({
      kaufpreis: a.kaufpreis,
      stufe: a.stufe,
      satz: a.satz,
      kaufpreisfaelligAm: a.kaufpreisfaelligAm,
    })),
  ).map((zeile) => {
    // Der Status kommt aus der Monatsabrechnung, sofern es dort eine Zeile
    // gibt. Ohne Zeile gilt "Offen": Der Anspruch besteht, die Abrechnung
    // wurde nur noch nicht erstellt.
    const abrechnung = rechnungFuer(userId, zeile.monatKey);
    const status =
      abrechnung?.status === "ausgezahlt" ? "Bezahlt"
      : abrechnung?.status === "freigegeben" ? "Freigegeben"
      : "Offen";
    return {
      monat: zeile.monat,
      abschluesse: zeile.abschluesse,
      provision: fmt(zeile.provision),
      overhead: "0 €",
      gesamt: fmt(abrechnung?.netto ?? zeile.provision),
      status,
      kaufpreisfaellig: zeile.kaufpreisfaellig,
      pdf: null,
    };
  });
}

/*
 * Betragsanzeige der ganzen Seite. Im Vorfuehrmodus wird der Wert
 * weichgezeichnet, die Beschriftung daneben bleibt lesbar. Weil hier jede
 * Zahl durchlaeuft, genuegt diese eine Stelle fuer die gesamte Abrechnung.
 */
const fmt = (v: number) => {
  // Gerechnet wird in Cent, gerundet erst hier. Ganze Betraege ohne Nachkomma.
  const rund = Math.round(v * 100) / 100;
  const nachkomma = Number.isInteger(rund) ? 0 : 2;
  return (
    <span className={unscharfKlasse("tabular-nums")}>
      {rund.toLocaleString("de-DE", { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma })} €
    </span>
  );
};
/** Der laufende Monat als Schluessel. Stand hier lange fest verdrahtet als
 *  "2026-03", waehrend daneben das echte Datum gerendert wurde. */
const currentMonthKey = monatBerlinIso();
const currentMonthLabel = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" });

// ── Detail-View Component ──
function PartnerDetail({ partner: p, onBack, showBackButton, overheadEinnahmen = {}, overheadAusgaben = {} }: {
  partner: PartnerData; onBack: () => void; showBackButton: boolean;
  overheadEinnahmen?: Record<string, { gesamt: number; details: any[] }>;
  overheadAusgaben?: Record<string, any[]>;
}) {
  const navigate = useNavigate();
  const { user } = useUser();
  const isBuchhaltung = ["admin", "buchhaltung"].includes(user.role);

  const stufe = findStufeMitRang(p.karriere);
  const ownOverhead = overheadEinnahmen[p.kuerzel];
  const ownOverheadAusgaben = overheadAusgaben[p.kuerzel];

  /*
   * Der Rechnungsbetrag ist das ABRECHENBARE, nicht die Erwartung.
   *
   * Bis zum 14.09.2026 stand hier `p.provision`, also die Summe aller
   * Investments ab Reservierung ueber alle Zeiten. Darueber schrieb die
   * Seite "Aktueller Monat" und "Diesen Betrag kannst du diesen Monat in
   * Rechnung stellen" — beides traf nicht zu, und die Zahl war fuer eine
   * Rechnung unbrauchbar.
   *
   * `p.faellig` enthaelt nur, was beide Bedingungen erfuellt: Notartermin
   * durchlaufen und Kaufpreisfaelligkeit am Investment eingetragen. Das ist
   * Christians Vorgabe und zugleich die einzige Lesart, bei der ein Partner
   * die Zahl wirklich in eine Rechnung schreiben darf.
   *
   * Auch die Rechnungspruefung der Buchhaltung haengt daran (siehe unten),
   * damit nicht bestaetigt werden kann, was noch gar nicht faellig ist.
   */
  const gesamtRechnung = p.faellig + (ownOverhead?.gesamt || 0);

  // Die Zeilen der Abrechnungshistorie, siehe `baueHistorie`.
  const historie = baueHistorie(p.abschluesse, p.userId);

  // Dynamische Kontakt-Potenzial-Daten.
  //
  // Frueher standen hier die Kontakte des ganzen Hauses, auch wenn ein
  // einzelner Partner geoeffnet war. Jeder sah damit fremde Zahlen in seiner
  // eigenen Abrechnung. Jetzt zaehlen nur die Kunden dieses Partners.
  const alleKontakte = useMemo(
    () =>
      getKontakte().filter(
        (k) =>
          !k.archiviert &&
          !k.geloescht &&
          !istStorniert(k) &&
          ((k as any).zustaendig_id === p.userId ||
            (!!k.berater && k.berater.toLowerCase() === p.name.toLowerCase())),
      ),
    [p.userId, p.name],
  );
  const potenzialPhasen = useMemo(() => {
    const qualifiziert = alleKontakte.filter(istQualifiziert);
    const abwicklung = alleKontakte.filter(k => ABWICKLUNG_STUFEN.some(s => s === k.pipelineStufe));
    const reserviert = alleKontakte.filter(k => k.pipelineStufe === "reservierung");
    const abgeschlossen = alleKontakte.filter(k => ABSCHLUSS_STUFEN.some(s => s === k.pipelineStufe));

    return [
      { label: "Qualifizierte Leads", kunden: qualifiziert, color: "hsl(38 92% 50%)" },
      { label: "In Abwicklung", kunden: abwicklung, color: "hsl(72 18% 42%)" },
      { label: "Reserviert", kunden: reserviert, color: "hsl(210 40% 55%)" },
      { label: "Abgeschlossen", kunden: abgeschlossen, color: "hsl(43 25% 74%)" },
    ];
  }, [alleKontakte]);

  const [potenzialDetail, setPotenzialDetail] = useState<{ label: string; kunden: typeof alleKontakte } | null>(null);
  const [rechnungOpen, setRechnungOpen] = useState(false);

  // Gutschrift-Status für Buchhaltung
  const [gsStatusAll, setGsStatusAll] = useState<GutschriftStore>(loadGutschriftStatus);
  const gsKey = `${p.kuerzel}_${currentMonthKey}`;
  const gs: GutschriftStatus = gsStatusAll[gsKey] || getDefaultGS();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateGS = (updates: Partial<GutschriftStatus>) => {
    const newAll = { ...gsStatusAll, [gsKey]: { ...gs, ...updates } };
    setGsStatusAll(newAll);
    saveGutschriftStatus(newAll);
  };

  const handleFileUpload = useCallback((file: File) => {
    if (!file.type.includes("pdf") && !file.type.includes("image")) {
      toast.error("Bitte nur PDF- oder Bilddateien hochladen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const uploadedAt = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      updateGS({
        pdfHinterlegt: true,
        pdfName: file.name,
        pdfData: base64,
        pdfUploadedAt: uploadedAt,
      });
      // Send notification to partner
      saveGutschriftNotification({
        partnerKuerzel: p.kuerzel,
        partnerName: p.name,
        monat: currentMonthKey,
        betrag: gesamtRechnung,
        pdfName: file.name,
      });
      toast.success(`Zahlungsbeleg für ${p.name} hinterlegt`, {
        description: `${file.name} wurde in der Abrechnungshistorie gespeichert. Der Partner wird benachrichtigt.`,
        duration: 6000,
      });
    };
    reader.readAsDataURL(file);
  }, [gs, gsKey, gsStatusAll, p.kuerzel, p.name, gesamtRechnung]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  /*
   * „Rechnung bezahlt“ bestätigen.
   *
   * Die Bestaetigung gehoert in die Datenbank (`provisionsabrechnungen`), dort
   * lesen Partner, Buchhaltung und die Seite Provisionsabrechnung. `updateGS`
   * schreibt nur in die Einstellungszeile der Buchhaltung und bleibt wegen
   * des Zahlungsbelegs daneben stehen.
   *
   * Seit dem 04.10.2026 erst speichern, dann Vermerk, Protokoll und Meldung.
   * Vorher kamen „bestätigt“ und der Protokolleintrag sofort, auch wenn das
   * Speichern danach scheiterte. Passt ein vorhandener Monatsbescheid nicht
   * zu den Geschaeften oder dem Betrag, wird nichts geaendert und das im
   * Projektstil gemeldet.
   */
  const handleGutschriftBestaetigen = async () => {
    // Der Monat in deutscher Zeit.
    const monat = currentMonthKey;
    // Die Geschaefte, die mit dieser Zahlung abgegolten sind. Sie stehen im
    // Bescheid, damit „Faellig" sie danach nicht noch einmal zaehlt. Was
    // „bitte klären“ traegt, gehoert nicht dazu.
    const deals = p.abschluesse
      .filter((a) => a.abrechenbar && !a.ausgezahlt && !a.klaeren)
      .map((a) => ({
        investmentId: a.investmentId,
        kontaktId: a.kontaktId,
        kundeName: a.kundeName,
        objekt: a.objekt,
        kaufpreis: a.kaufpreis,
        satz: a.satz,
        betrag: a.provision,
        satzTyp: a.satzart,
      }));
    setShowConfirmDialog(false);

    let ergebnis: Awaited<ReturnType<typeof setzeRechnungBezahlt>> = null;
    try {
      ergebnis = await setzeRechnungBezahlt(
        { userId: p.userId, name: p.name, karriere: p.karriere },
        monat,
        gesamtRechnung,
        true,
        user.name,
        deals,
      );
    } catch (e) {
      if (e instanceof BescheidWeichtAb) {
        await hinweisDialog({ title: "Bescheid weicht ab, bitte prüfen", description: e.message });
        return;
      }
      if (e instanceof AbschlussDoppelt) {
        await hinweisDialog({ title: "Abschluss schon abgerechnet, bitte prüfen", description: e.message });
        return;
      }
      toast.error("Die Bestätigung konnte nicht gespeichert werden", {
        description: (e as Error).message || "Bitte noch einmal versuchen.",
      });
      return;
    }
    if (!ergebnis) {
      toast.error("Die Bestätigung konnte nicht gespeichert werden", {
        description: "Sie ist damit auch beim Partner nicht sichtbar. Bitte noch einmal versuchen.",
      });
      return;
    }

    const now = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    updateGS({
      provisionBestaetigt: true,
      overheadBestaetigt: true,
      gutschriftUeberwiesen: true,
      bestaetigtAm: now,
      bestaetigtVon: user.name,
    });
    void logAudit({
      action: "provision_ausgezahlt",
      entity: "abrechnung",
      entityId: p.kuerzel,
      nachher: {
        partner: p.name,
        kuerzel: p.kuerzel,
        provision: p.provision,
        overhead: ownOverhead?.gesamt || 0,
        gesamt: gesamtRechnung,
        bestaetigt_am: now,
        bestaetigt_von: user.name,
        nur_lokal: abrechnungenPersistenz() === "lokal",
      },
      meta: { source: "Abrechnungen.handleGutschriftBestaetigen" },
    });
    if (abrechnungenPersistenz() === "lokal") {
      toast.warning(`Rechnung von ${p.name} nur in diesem Browser gespeichert`, {
        description: "Die Tabelle für Abrechnungen fehlt noch. Partner und Kollegen sehen die Bestätigung nicht, bis die Migration eingespielt ist.",
        duration: 12000,
      });
      return;
    }
    toast.success(`Rechnung von ${p.name} als bezahlt bestätigt`, {
      description: "Du kannst jetzt optional den Zahlungsbeleg hochladen.",
      duration: 8000,
    });
  };

  const hasOverhead = (ownOverhead?.gesamt || 0) > 0;
  const allChecked = gs.provisionBestaetigt && (hasOverhead ? gs.overheadBestaetigt : true);
  const isComplete = gs.gutschriftUeberwiesen && gs.pdfHinterlegt;

  // Partner notification (for non-buchhaltung view)
  const partnerNotifs = loadGutschriftNotifications().filter(n => n.partnerKuerzel === p.kuerzel);

  /*
   * Der Stand der Rechnung, gelesen aus der Datenbank.
   *
   * `partnerNotifs` daruber kommt aus `user_settings` und ist deshalb beim
   * Partner immer leer, siehe die Begruendung bei
   * `handleGutschriftBestaetigen`. Diese Zeile hier ist der Weg, auf dem er
   * die Bestaetigung tatsaechlich sieht.
   */
  const rechnungStand = rechnungsStatus(p.userId, currentMonthKey, gesamtRechnung);

  return (
    <div className="space-y-6">
      {showBackButton && (
        <div>
          <button onClick={onBack} className="text-sm text-primary hover:underline flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" /> Gesamtübersicht
          </button>
        </div>
      )}
      <PageHeader
        title={`Abrechnung – ${p.name}`}
        subtitle="Provisionsübersicht und Abrechnungsdetails"
      />

      {/* ═══ BUCHHALTUNG: Gutschrift-Zusammenfassung & Bestätigung ═══ */}
      {isBuchhaltung && (
        <Card className="border-l-4 border-l-warning bg-warning/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
                💼 Rechnungsprüfung – {p.name}
                {isComplete ? (
                  <Badge className="bg-success text-destructive-foreground text-[10px]">✅ Abgeschlossen</Badge>
                ) : gs.gutschriftUeberwiesen ? (
                  <Badge variant="outline" className="text-[10px] border-warning text-warning">⚠️ PDF fehlt</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Offen</Badge>
                )}
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Prüfe und bestätige alle Positionen der eingegangenen Rechnung.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Positionen-Checkliste */}
            <div data-ui="card" className="bg-card border border-border rounded-lg divide-y divide-border">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <Checkbox checked={gs.provisionBestaetigt} onCheckedChange={(v) => updateGS({ provisionBestaetigt: !!v })} />
                  <span className="text-sm text-foreground">Eigene Vermittlungsprovisionen</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{fmt(p.provision)}</span>
              </div>
              {(ownOverhead?.gesamt || 0) > 0 && (
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={gs.overheadBestaetigt} onCheckedChange={(v) => updateGS({ overheadBestaetigt: !!v })} />
                    <span className="text-sm text-foreground">Team-Overhead Provision</span>
                  </div>
                  <span className="text-sm font-semibold text-primary">+{fmt(ownOverhead!.gesamt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-muted/50 font-bold">
                <span className="text-sm text-foreground">Gesamtbetrag Rechnung</span>
                <span className="text-lg font-bold text-foreground">{fmt(gesamtRechnung)}</span>
              </div>
            </div>

            {/* PDF Upload Zone */}
            {gs.gutschriftUeberwiesen && !gs.pdfHinterlegt && (
              <div
                className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                  isDragging ? "border-primary bg-primary/10" : "border-destructive/40 bg-destructive/5"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDragging ? "bg-primary/20" : "bg-destructive/10"}`}>
                    <Upload className={`h-6 w-6 ${isDragging ? "text-primary" : "text-destructive"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">
                      {isDragging ? "Datei hier ablegen..." : "Zahlungsbeleg hochladen"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ziehe den Zahlungsbeleg hierher oder klicke zum Auswählen.
                      <br />Optional – zur Dokumentation der Zahlung an <strong>{tarnName(p.name, "partner")}</strong>.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Datei auswählen
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </div>
              </div>
            )}

            {/* Uploaded PDF info */}
            {gs.pdfHinterlegt && gs.pdfName && (
              <div className="flex items-center justify-between bg-success/5 border border-success/20 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{gs.pdfName}</p>
                    <p className="text-[10px] text-muted-foreground">Hochgeladen am {gs.pdfUploadedAt}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {gs.pdfData && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => downloadBase64(gs.pdfData!, gs.pdfName!)}>
                      <Download className="h-3 w-3 mr-1" /> Download
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Bestätigen" className="h-7 w-7" onClick={() => updateGS({ pdfHinterlegt: false, pdfName: undefined, pdfData: undefined, pdfUploadedAt: undefined })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Bestätigungs-Info */}
            {gs.bestaetigtAm && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" />
                Bestätigt am {gs.bestaetigtAm} von {gs.bestaetigtVon}
              </p>
            )}

            {/* Aktions-Buttons */}
            <div className="flex items-center gap-3">
              {!gs.gutschriftUeberwiesen ? (
                <Button size="sm" onClick={() => setShowConfirmDialog(true)} disabled={!allChecked}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Rechnung als bezahlt bestätigen
                </Button>
              ) : (
                <Badge className="bg-success text-destructive-foreground text-xs px-3 py-1.5">
                  ✅ Rechnung bezahlt
                </Badge>
              )}
              {!allChecked && !gs.gutschriftUeberwiesen && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" /> Bitte alle Positionen abhaken
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bestätigungs-Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> Zahlung bestätigen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Du bestätigst hiermit, dass die Rechnung von <strong>{tarnName(p.name, "partner")}</strong> in Höhe von <strong>{fmt(gesamtRechnung)}</strong> bezahlt wurde.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Eigene Provision</span><span>{fmt(p.provision)}</span></div>
              {(ownOverhead?.gesamt || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Team-Overhead</span><span className="text-primary">+{fmt(ownOverhead!.gesamt)}</span></div>}
              <Separator />
              <div className="flex justify-between font-bold"><span>Gesamt</span><span>{fmt(gesamtRechnung)}</span></div>
            </div>
            <Card className="border-l-4 border-l-warning bg-warning/5 p-3">
              <p className="text-xs text-foreground flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <span>Nach der Bestätigung kannst du den <strong>Zahlungsbeleg</strong> unter der Abrechnungshistorie des Partners hinterlegen.</span>
              </p>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleGutschriftBestaetigen}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Bestätigen & überweisen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abrechnungsinfo */}
      <Card className="border-l-4 border-l-primary bg-muted/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Abrechnung per Rechnung</p>
              <p className="text-sm text-muted-foreground mt-1">
                {isBuchhaltung
                  ? `${p.name} stellt uns eine Rechnung über die fälligen Provisionen.`
                  : <>Du stellst OS Immobilien eine <strong>Rechnung</strong> über deine fälligen Provisionen. Die Auszahlung erfolgt nach Rechnungseingang.</>
                }
              </p>
              <div className="mt-4">
                <div data-ui="card" className="bg-card border border-border rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fälligkeit der Kaufpreiszahlung</p>
                  <p className="font-semibold text-foreground mt-1">
                    Die Provision wird fällig, sobald der Kaufpreis der vermittelten Kapitalanlage beim Verkäufer eingegangen ist.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Im Durchschnitt erfolgt die Kaufpreiszahlung <strong>4–8 Wochen nach dem Notartermin</strong>.
                  </p>
                </div>
              </div>
              {!isBuchhaltung && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <Info className="h-3 w-3" /> Stelle sicher, dass deine Stammdaten in den{" "}
                  <button onClick={() => navigate("/einstellungen")} className="text-primary underline cursor-pointer">Einstellungen</button>{" "}
                  hinterlegt sind, damit du korrekte Rechnungen stellen kannst.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ PROMINENTE MONATLICHE RECHNUNGSÜBERSICHT ═══ */}
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold font-sans flex items-center gap-2">
              📋 {isBuchhaltung ? `Rechnungsbetrag ${p.name}` : "Dein Rechnungsbetrag"} – {new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
            </CardTitle>
            <Badge variant="outline" className="text-xs border-primary text-primary">Aktueller Monat</Badge>
          </div>
          {/*
            Der Hinweis erklaert eine Null, statt sie nackt stehen zu lassen.

            Vorher stand hier immer "Diesen Betrag kannst du diesen Monat in
            Rechnung stellen", ueber einer Summe, die weder einen Monat kannte
            noch die Faelligkeit. Wer nichts abrechnen konnte, las den Satz
            trotzdem und suchte den Fehler bei sich.
          */}
          <p className="text-xs text-muted-foreground">
            {rechnungsHinweis(
              { erwartet: p.provision, faellig: p.faellig, abschluesse: p.vermittlungen },
              p.provision - p.faellig - p.bezahlt - p.klaeren,
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div data-ui="card" className="bg-card border border-border rounded-xl divide-y divide-border">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Vermittlungsprovision, Kaufpreis fällig
              </span>
              <span className="text-sm font-semibold text-foreground">{fmt(p.faellig)}</span>
            </div>
            {p.provision - p.faellig - p.bezahlt - p.klaeren > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  Noch nicht abrechenbar
                  <span className="block text-[11px]">Abschluss oder Kaufpreisfälligkeit steht aus</span>
                </span>
                <span className="text-sm text-muted-foreground">{fmt(p.provision - p.faellig - p.bezahlt - p.klaeren)}</span>
              </div>
            )}
            {p.klaeren > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-[hsl(var(--warning))]">
                  Bitte klären
                  <span className="block text-[11px] text-muted-foreground">Älterer Bescheid zum Kunden ohne Zuordnung zum Investment</span>
                </span>
                <span className="text-sm text-[hsl(var(--warning))]">{fmt(p.klaeren)}</span>
              </div>
            )}
            {p.bezahlt > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">Bereits ausgezahlt</span>
                <span className="text-sm text-muted-foreground">{fmt(p.bezahlt)}</span>
              </div>
            )}
            {ownOverhead && ownOverhead.gesamt > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">Team-Overhead Provision</span>
                <span className="text-sm font-semibold text-primary">+{fmt(ownOverhead.gesamt)}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-4 bg-primary/10 rounded-b-xl">
              <span className="text-base font-bold text-foreground">Rechnungsbetrag gesamt</span>
              <span className="text-2xl font-bold text-primary">{fmt(gesamtRechnung)}</span>
            </div>
          </div>
          {!isBuchhaltung && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {gesamtRechnung > 0 ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" /> Stelle diesen Betrag nach Kaufpreisfälligkeit an OS Immobilien in Rechnung.
                </p>
              ) : <span />}
              <Button
                size="sm"
                onClick={() => setRechnungOpen(true)}
                className="gap-2 self-start sm:self-auto"
              >
                <FilePlus2 className="h-4 w-4" /> Rechnung jetzt erstellen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <RechnungsGeneratorDialog open={rechnungOpen} onOpenChange={setRechnungOpen} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {potenzialPhasen.map((kp) => {
          const volumen = kp.kunden.reduce((s, k) => s + (k.kaufpreis || 0), 0);
          const provisionRate = stufe?.rate || 5;
          const provisionBetrag = Math.round(volumen * (provisionRate / 100));
          return (
            <Card
              key={kp.label}
              className="p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setPotenzialDetail({ label: kp.label, kunden: kp.kunden })}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: kp.color }} />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{kp.label}</p>
              </div>
              <p className="text-2xl font-bold text-foreground">{kp.kunden.length}</p>
              <div className="mt-2 space-y-0.5">
                <p className="text-xs text-muted-foreground">Volumen: <span className="font-semibold text-foreground">{fmt(volumen)}</span></p>
                <p className="text-xs text-muted-foreground">Provision: <span className="font-semibold text-primary">{fmt(provisionBetrag)}</span></p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Potenzial-Detail Dialog */}
      <Dialog open={!!potenzialDetail} onOpenChange={() => setPotenzialDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{potenzialDetail?.label} – {potenzialDetail?.kunden.length} Kontakte</DialogTitle>
          </DialogHeader>
          {potenzialDetail?.kunden.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Keine Kontakte in dieser Phase.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase">Name</TableHead>
                  <TableHead className="text-[10px] uppercase">Objekt</TableHead>
                  <TableHead className="text-[10px] uppercase text-right">Kaufpreis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {potenzialDetail?.kunden.map(k => (
                  <TableRow key={k.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setPotenzialDetail(null); navigate(`/kunden/${k.id}`); }}>
                    <TableCell className="text-sm font-medium">{tarnName(`${k.vorname ?? ""} ${k.nachname ?? ""}`.trim())}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{k.objekt || "–"}</TableCell>
                    <TableCell className="text-sm text-right">{k.kaufpreis ? fmt(k.kaufpreis) : "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Team-Overhead Provision */}
      {ownOverhead && ownOverhead.details.length > 0 && (
        <Card className="border-l-4 border-l-accent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
              👥 Team-Overhead Provision
              <Badge variant="outline" className="text-xs">Differenz-Overhead auf Team-Abschlüsse</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Team-Mitglied</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Objekt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Kaufpreis</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Rate</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Overhead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownOverhead.details.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{tarnName(d.vonPartner, "partner")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.objekt}</TableCell>
                    <TableCell className="text-sm">{fmt(d.kaufpreis)}</TableCell>
                    <TableCell className="text-sm">{d.overheadRate} %</TableCell>
                    <TableCell className="text-sm font-semibold text-primary text-right">+{fmt(d.betrag)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={4} className="text-sm">Gesamt Overhead</TableCell>
                  <TableCell className="text-sm font-bold text-primary text-right">+{fmt(ownOverhead.gesamt)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Overhead-Info für Team-Mitglieder */}
      {ownOverheadAusgaben && ownOverheadAusgaben.length > 0 && (
        <Card className="border-l-4 border-l-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
              ℹ️ Team-Overhead auf {isBuchhaltung ? `${p.name}s` : "deine"} Abschlüsse
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isBuchhaltung ? `Der Teamleiter von ${p.name} erhält` : "Dein Teamleiter erhält"} eine Overhead-Provision. Dies hat keinen Einfluss auf die eigene Provision.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Teamleiter</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Objekt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Rate</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownOverheadAusgaben.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{tarnName(d.anPartner, "partner")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.objekt}</TableCell>
                    <TableCell className="text-sm">{d.overheadRate} %</TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">{fmt(d.betrag)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Offene Kaufpreisfälligkeiten */}
      {p.abschluesse.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">📋 Offene Kaufpreisfälligkeiten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Objekt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Kaufpreis</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Satz</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Provision</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Notartermin</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Kaufpreis fällig (ca.)</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.abschluesse.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{a.objekt}</TableCell>
                    <TableCell className="text-sm tabular-nums">{fmt(a.kaufpreis)}</TableCell>
                    <TableCell>
                      <SatzartBadge art={a.satzart} satz={a.satz} heutigerSatz={a.heutigerSatz} />
                    </TableCell>
                    <TableCell className="text-sm font-medium tabular-nums">{fmt(a.provision)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.notarDatum}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.kaufpreisfaellig}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{a.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Zusammenfassung nach Satzart: woraus die Provision entsteht. */}
            {(() => {
              const nachArt = new Map<Satzart, { anzahl: number; volumen: number; provision: number }>();
              for (const a of p.abschluesse) {
                const e = nachArt.get(a.satzart) ?? { anzahl: 0, volumen: 0, provision: 0 };
                e.anzahl += 1;
                e.volumen += a.kaufpreis;
                e.provision += a.provision;
                nachArt.set(a.satzart, e);
              }
              return (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-foreground">Woraus sich die Provision zusammensetzt</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {Array.from(nachArt.entries()).map(([art, e]) => (
                      <div key={art} className="flex items-center gap-2 text-xs">
                        <SatzartBadge art={art} />
                        <span className="text-muted-foreground tabular-nums">
                          {e.anzahl} {e.anzahl === 1 ? "Abschluss" : "Abschlüsse"} · {fmt(e.volumen)} Volumen ·{" "}
                          <span className="font-medium text-foreground">{fmt(e.provision)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <SatzartLegende className="border-t pt-3" />
          </CardContent>
        </Card>
      )}

      {/* Karrierestufen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">🚀 Karrierestufen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {karriereStufen.filter((s) => !s.nurBestand || s.titel === p.karriere).map((s, i) => {
              const istAktuell = s.titel === p.karriere;
              return (
                <div key={i} className={`relative rounded-xl border p-5 ${istAktuell ? "border-primary bg-primary/5 shadow-md" : "border-border"}`}>
                  {istAktuell && <Badge className="absolute -top-2 left-4 bg-primary text-primary-foreground text-[9px]">{isBuchhaltung ? p.name : "Deine Stufe"}</Badge>}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{s.emoji}</span>
                    <p className="font-bold text-foreground">{s.titel}</p>
                  </div>
                  <div className="space-y-1 text-sm mb-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Provision</span><span className="font-semibold">{s.provision}</span></div>
                    {s.extras && <div className="flex justify-between"><span className="text-muted-foreground">Team-Overhead</span><span className="font-semibold text-primary">{s.extras}</span></div>}
                  </div>
                  <Separator className="my-3" />
                  {s.vorteile.map((v, vi) => (<p key={vi} className="text-xs text-muted-foreground flex items-center gap-1.5"><span className="text-primary">◎</span> {v}</p>))}
                  <Separator className="my-3" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Voraussetzungen</p>
                  {s.voraussetzungen.map((v, vi) => (<p key={vi} className="text-xs text-muted-foreground">• {v}</p>))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Provisionsstaffel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">📊 Provisionsstaffel (Kapitalanlagen)</CardTitle>
        </CardHeader>
        <CardContent>
          {/*
            Die Spalte "Mehrverdienst*" ist am 14.09.2026 entfallen.

            Sie zeigte `rate * 10000`, also schlicht die Provision bei einer
            Million Euro Volumen, und war damit kein Mehrverdienst gegenueber
            irgendeiner Vorstufe. Das Sternchen verwies zudem auf eine
            Fussnote, die es auf der Seite nie gab. Da es seit der Umstellung
            auf die vier Prozent ohnehin keine Staffel mit Mehrverdienst mehr
            gibt, faellt die Spalte ersatzlos weg.
          */}
          <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground uppercase mb-2 px-2">
            <span>Stufe</span><span>Provision</span><span />
          </div>
          {provisionsStufen.filter((s) => {
            const istAktuelleStufe = stufe && s.provision.replace(" ", "") === stufe.rate + "%";
            return !s.nurBestand || istAktuelleStufe;
          }).map((s, i) => {
            const istAktuelleStufe = stufe && s.provision.replace(" ", "") === stufe.rate + "%";
            return (
              <div key={i} className={`grid grid-cols-3 gap-2 items-center px-2 py-3 rounded-lg text-sm ${istAktuelleStufe ? "bg-primary/5" : ""} border-b border-border last:border-0`}>
                <span className="font-medium text-foreground flex items-center gap-2">{s.volumen}{istAktuelleStufe && <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 h-4">{isBuchhaltung ? p.kuerzel : "Du"}</Badge>}</span>
                <span className="text-foreground">{s.provision}</span>
                <span />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Provisionsentwicklung Chart – Festgeschrieben + Prognose */}
      <ProvisionsEntwicklungChart partnerName={p.name} partnerId={p.userId} />

      {/* Steuerdaten-Sektion entfernt – VP stellt eigenständig Rechnungen */}

      {/*
        Die Zahlungsbestaetigung fuer den Partner, aus der Datenbank gelesen.

        Vorher haing dieser Block an `partnerNotifs`, also an der eigenen
        Einstellungszeile des Partners. Dort schreibt aber nur die Buchhaltung
        in ihre eigene, weshalb hier nie etwas stand.
      */}
      {!isBuchhaltung && rechnungStand.bezahlt && (
        <Card className="border-l-4 border-l-success bg-success/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Zahlung bestätigt – {fmt(rechnungStand.betrag)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Deine Rechnung für diesen Monat wurde als bezahlt vermerkt
                  {rechnungStand.von ? ` von ${rechnungStand.von}` : ""}
                  {rechnungStand.am ? ` am ${new Date(rechnungStand.am).toLocaleDateString("de-DE")}` : ""}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aeltere Benachrichtigung aus der Einstellungszeile, siehe oben. */}
      {!isBuchhaltung && partnerNotifs.length > 0 && (
        <Card className="border-l-4 border-l-success bg-success/5">
          <CardContent className="p-4">
            <div className="space-y-3">
              {partnerNotifs.map(n => (
                <div key={n.id} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      ✅ Zahlung erfolgt – {fmt(n.betrag)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deine Rechnung wurde beglichen. Das Zahlungsdokument steht in der Abrechnungshistorie zum Download bereit.
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Abrechnungshistorie */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="w-6 h-0.5 bg-primary rounded-full" /><CardTitle className="text-sm font-semibold font-sans">Abrechnungshistorie</CardTitle></div>
            <Button variant="outline" size="sm" className="text-xs"><Download className="h-3 w-3 mr-1" /> PDF herunterladen</Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Current month uploaded row */}
          {gs.pdfHinterlegt && gs.pdfName && (
            <div className="flex items-center justify-between bg-success/5 border border-success/20 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-success" />
                <div>
                  <p className="text-sm font-medium text-foreground">Mär 2026 – {gs.pdfName}</p>
                  <p className="text-[10px] text-muted-foreground">Hochgeladen am {gs.pdfUploadedAt} · {fmt(gesamtRechnung)}</p>
                </div>
              </div>
              {gs.pdfData && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => downloadBase64(gs.pdfData!, gs.pdfName!)}>
                  <Download className="h-3 w-3 mr-1" /> Download
                </Button>
              )}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider">Monat</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Abschlüsse</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Provision</TableHead>
                {OVERHEAD_AKTIV && <TableHead className="text-[10px] uppercase tracking-wider">Overhead</TableHead>}
                <TableHead className="text-[10px] uppercase tracking-wider">Gesamt</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Kaufpreisfälligkeit</TableHead>
                 <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historie.map((h, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm font-medium">{h.monat}</TableCell>
                  <TableCell className="text-sm">{h.abschluesse}</TableCell>
                  <TableCell className={unscharfKlasse("text-sm text-foreground")}>{h.provision}</TableCell>
                  {OVERHEAD_AKTIV && <TableCell className={unscharfKlasse("text-sm text-primary font-semibold")}>{h.overhead !== "0 €" ? h.overhead : "–"}</TableCell>}
                  <TableCell className={unscharfKlasse("text-sm font-bold")}>{h.gesamt}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{h.kaufpreisfaellig}</TableCell>
                   <TableCell>
                    {h.status === "Bezahlt" ? (
                      <Badge className="bg-success text-destructive-foreground text-[10px]">Bezahlt</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{h.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {h.pdf ? (
                      <button className="text-xs text-primary hover:underline flex items-center gap-1"><Download className="h-3 w-3" /> {h.pdf}</button>
                    ) : (
                      <span className="text-muted-foreground text-xs">–</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Wer die Liste „Kaufpreis fehlt“ sieht. */
const KAUFPREIS_FEHLT_ROLLEN = ["admin", "inhaber", "backoffice", "buchhaltung"];

/**
 * Investments ab Reservierung ohne Kaufpreis.
 *
 * Bis zum 04.10.2026 fielen sie in Abrechnung und Provisionskurve wortlos
 * heraus. Einen Kaufpreis gibt es erst ab der Objektauswahl; fehlt er ab der
 * Reservierung, ist das ein Pflegefehler, der Geld kostet. Der Link fuehrt
 * direkt ins Investment.
 */
function KaufpreisFehltKarte({ eintraege }: { eintraege: KaufpreisFehlt[] }) {
  const navigate = useNavigate();
  if (eintraege.length === 0) return null;
  const kontakte = new Map(getKontakte().map((k) => [k.id, k]));
  const stufenLabel = (s: string) => PIPELINE_STUFEN.find((x) => x.key === s)?.label || s;
  return (
    <Card className="border-l-4 border-l-warning bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Kaufpreis fehlt
          <Badge variant="outline" className="text-[10px]">{eintraege.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Diese Investments sind ab Reservierung, haben aber keinen Kaufpreis. Sie fehlen in Abrechnung,
          Bescheid und Provisionskurve, bis der Kaufpreis im Investment eingetragen ist.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase tracking-wider">Kunde</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Stufe</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Investment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eintraege.map((e) => {
              const k = kontakte.get(e.kontaktId);
              return (
                <TableRow key={e.investmentId}>
                  <TableCell className="text-sm">{tarnName(`${k?.vorname ?? ""} ${k?.nachname ?? ""}`.trim()) || "Unbekannt"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{stufenLabel(e.stufe)}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/kunden/${e.kontaktId}?investment=${e.investmentId}`)}
                    >
                      Kaufpreis eintragen
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──
const Abrechnungen = () => {
  const { user, authUser } = useUser();
  // Inhaber und Vertriebsleiter landeten bisher im Einzelpartner-Zweig und
  // sahen dort dauerhaft null Euro, obwohl sie die Gesamtuebersicht brauchen.
  const isOverviewRole = darfGesamtabrechnungSehen(user.role);
  const isBuchhaltung = ["admin", "buchhaltung"].includes(user.role);
  const _settingsVersion = useLiveVersion(["user_settings", "kontakte", "investments", "profiles", "user_roles", "provisionsabrechnungen"]);
  /*
   * Die Bescheide muessen da sein, bevor gerechnet wird: „Faellig“ zieht ab,
   * was schon ausgezahlt ist. Ohne sie zeigte die Seite beim ersten Oeffnen
   * alles als faellig. Die Route meldet die Tabelle an, `useCacheReady`
   * wartet darauf. Im lokalen Rueckfall kommt die Aenderung ueber das
   * Ereignis des Stores.
   */
  const abrechnungenBereit = useCacheReady(["provisionsabrechnungen"]);
  const [lokalVersion, setLokalVersion] = useState(0);
  // Lesefehler ausser „Tabelle fehlt“: melden statt mit leeren Bescheiden rechnen.
  const [abrechnungenFehler, setAbrechnungenFehler] = useState<string | null>(null);
  useEffect(() => {
    const neu = () => setLokalVersion((v) => v + 1);
    window.addEventListener("mi_provisionsabrechnungen_changed", neu);
    void refreshAbrechnungen().then((fehler) => {
      setAbrechnungenFehler(fehler);
      neu();
    });
    return () => window.removeEventListener("mi_provisionsabrechnungen_changed", neu);
  }, []);

  // Investments ab Reservierung ohne Kaufpreis, nur fuer die Verwaltung.
  const zeigeKaufpreisFehlt = KAUFPREIS_FEHLT_ROLLEN.includes(user.role);
  const ohneKaufpreis = useMemo(() => {
    if (!zeigeKaufpreisFehlt) return [];
    const kontakteById = new Map(getKontakte().map((k) => [k.id, k as any]));
    return investmentsOhneKaufpreis(getInvestments(), kontakteById, investmentKaufpreis);
  }, [_settingsVersion, zeigeKaufpreisFehlt]);

  // ── Partner dynamisch aus DB aufbauen ──
  const { partner, overheadEinnahmen, overheadAusgaben, totalAuszahlungen, aktivPartner } = useMemo(() => {
    const allUsers = loadAllUsers();
    const kontakte = getKontakte();
    const investments = getInvestments();
    const allSettings = cacheGet<any>("user_settings");
    // Geschaefte, die schon in einem ausgezahlten Bescheid stehen, und die
    // Zuordnung zu Altbescheiden ohne Investment-Kennung ueber den Notarmonat.
    const abgerechnet = abgerechneteGeschaefte(getAbrechnungen());
    const jeKontakt = investmentsJeKontakt(investments);
    const kontakteAlle = new Map(kontakte.map((k) => [k.id, k]));
    const zuordnungJeKontakt = new Map<string, GeschaeftZuordnung[]>();
    for (const inv of investments) {
      const z = { investmentId: inv.id, kontaktId: inv.kontaktId, notarMonat: monatBerlinIso(notarDatumFuer(inv, kontakteAlle.get(inv.kontaktId))) };
      zuordnungJeKontakt.set(inv.kontaktId, [...(zuordnungJeKontakt.get(inv.kontaktId) ?? []), z]);
    }

    // Nur VPs (nicht Kunden, nicht Admins ohne Provision)
    const userRoles = cacheGet<any>("user_roles");
    // Nur Vertriebspartner & Vertriebsleiter (keine Tippgeber/Kunden/Inhaber etc.)
    const vpRoles = new Set(["vertriebspartner", "vertriebsleiter"]);
    const vpUserIds = new Set(
      userRoles.filter((r: any) => vpRoles.has(r.role)).map((r: any) => r.user_id)
    );

    const partnerList: PartnerData[] = allUsers
      .filter(u => vpUserIds.has(u.id))
      .map(u => {
        const override = getKarriereOverrideForUser(u.id);
        const karriere = getKarriereStufe(0, override);
        const customRate = getCustomProvisionRate(u.id);
        // Bleibt für die Anzeige der Konditionen im Profil. Gerechnet wird
        // nicht mehr damit: der Satz haengt am einzelnen Kontakt.
        const effectiveRate = customRate ?? karriere.rate;
        const setterRate = getCustomProvisionRateSetter(u.id);
        const eigenRate = getCustomProvisionRateEigen(u.id);

        // Kontakte dieses VPs
        // Kennung zuerst, der Name nur fuer Kontakte ohne Kennung und nur
        // eindeutig. Vorher zaehlte allein der Name.
        const vpKontakte = kontakte.filter(k => !k.archiviert && !k.geloescht && istZustaendig(k, { userId: u.id, userName: u.name }, allUsers));
        const kontaktMap = new Map(vpKontakte.map(k => [k.id, k]));

        // Abschlüsse: Investments mit Notartermin oder in fortgeschrittener Pipeline
        const abschluesse: PartnerData["abschluesse"] = [];
        // In Cent, gerundet wird erst in der Anzeige.
        let provisionCentSumme = 0;

        // Wie viele Geschaefte den Notartermin hinter sich haben. Das ist die
        // Zahl, die in der Uebersicht als "Abschluesse" steht.
        let abschlussZahl = 0;
        // Was heute in Rechnung gestellt werden darf, also nur mit erreichter
        // Kaufpreisfaelligkeit und noch nicht ausgezahlt.
        let faelligCent = 0;
        let bezahltCent = 0;
        let klaerenCent = 0;

        investments.forEach(inv => {
          const k = kontaktMap.get(inv.kontaktId);
          if (!k) return;
          /*
           * Der Kaufpreis kommt vom INVESTMENT, nicht vom Kontakt.
           *
           * Bis zum 14.09.2026 stand hier `k.kaufpreis`. Seit August liegt der
           * Preis aber am Investment, und wo er nur dort stand, fiel die Zeile
           * wegen der Null-Pruefung darunter wortlos aus der Abrechnung. Bei
           * zwei Investments desselben Kunden rechnete die Seite umgekehrt
           * beide mit demselben Kontaktwert.
           *
           * Der Kontaktwert bleibt als Rueckfall, fuer Altbestand ohne
           * Objektdaten am Investment.
           */
          // Der Kontaktwert gilt nur bei genau einem Investment des Kontakts,
          // sonst steht das Investment unter „Kaufpreis fehlt“.
          const kp = kaufpreisMitRueckfall(investmentKaufpreis(inv.id), k.kaufpreis, jeKontakt.get(inv.kontaktId) ?? 0);
          if (kp <= 0) return;

          const stufe = (inv.pipelineStufe || "").toLowerCase();
          // Stornierte und verlorene Geschaefte gehoeren in keine Abrechnung.
          if (istStorniert(inv) || istStorniert(k)) return;
          const notarDatum = inv.notarTermin || k.notarTermin || "";
          const hatNotar = istAbschluss(inv.pipelineStufe);
          if (istNotarDurchlaufen(inv.pipelineStufe)) abschlussZahl += 1;
          // Das echte Datum aus der Abwicklungskarte im Kundenprofil.
          const faelligAm = abwicklungAusMeta((inv as any)?.meta).kaufpreisfaelligkeitDatum || "";

          if (istProvisionsrelevant(inv.pipelineStufe)) {
            // Der Satz gilt je Kontakt, nicht je Partner. Vorher rechnete diese
            // Seite jeden Abschluss mit einem einzigen flachen Prozentsatz, und
            // zwar ausschliesslich dem aus dem Feld "Individueller Satz". Wer
            // nur Eigen- und Lead-Satz gepflegt hatte, wurde hier still mit dem
            // Satz seiner Karrierestufe abgerechnet.
            /*
             * Der beim Anlegen festgeschriebene Satz gilt (Entscheidung
             * Christian vom 29.09.2026). Die Reihenfolge steht in
             * `getEffectiveRateInfoForKontakt`: Festschreibung in der
             * Nutzerverwaltung, dann dieser Satz, dann Eigen- oder Lead-Satz,
             * dann die Stufe. Bis zum 29.09.2026 kam `inv.meta` hier nie an,
             * es galt also immer der aktuelle Satz.
             */
            const info = getEffectiveRateInfoForKontakt(u.id, k, festgeschriebenerSatz(inv.meta));
            const cent = provisionCent(kp, info.rate);
            const betrag = cent / 100;
            provisionCentSumme += cent;

            const abrechenbar = istAbrechenbar(
              { kaufpreis: kp, stufe: inv.pipelineStufe, satz: info.rate, kaufpreisfaelligAm: faelligAm },
            );
            const stand = abrechnungsstand(
              abgerechnet,
              { investmentId: inv.id, kontaktId: k.id, notarMonat: monatBerlinIso(notarDatumFuer(inv, k)) },
              zuordnungJeKontakt.get(k.id) ?? [],
            );
            const ausgezahlt = stand === "ja";
            const klaeren = stand === "klaeren";
            if (abrechenbar && ausgezahlt) bezahltCent += cent;
            else if (abrechenbar && klaeren) klaerenCent += cent;
            else if (abrechenbar) faelligCent += cent;

            /*
             * Die Kaufpreisfaelligkeit, wie sie eingetragen wurde.
             *
             * Vorher schaetzte die Seite hier Notartermin plus 42 Tage und
             * schrieb "ca." davor. Das Datum steht aber am Investment, sobald
             * es jemand im Kundenprofil unter Abwicklung eintraegt. Eine
             * Schaetzung neben einer vorhandenen Tatsache ist eine zweite
             * Wahrheit, und in einer Abrechnung ist das eine zu viel.
             */
            let kaufpreisfaellig = "noch nicht eingetragen";
            if (faelligAm) {
              const fd = new Date(faelligAm);
              if (!isNaN(fd.getTime())) kaufpreisfaellig = fd.toLocaleDateString("de-DE");
            }

            const statusLabel = abrechenbar && ausgezahlt
              ? "Ausgezahlt"
              : abrechenbar && klaeren ? "Bitte klären"
              : hatNotar ? "Notar" : stufe.charAt(0).toUpperCase() + stufe.slice(1);
            abschluesse.push({
              investmentId: inv.id,
              kontaktId: k.id,
              kundeName: `${k.vorname || ""} ${k.nachname || ""}`.trim(),
              ausgezahlt,
              klaeren,
              satz: info.rate,
              satzart: info.quelle,
              heutigerSatz: info.heutigerSatz,
              provision: betrag,
              objekt: inv.objektTitel || k.objekt || "–",
              kaufpreis: kp,
              notarDatum: notarDatum ? new Date(notarDatum).toLocaleDateString("de-DE") : "–",
              kaufpreisfaellig,
              kaufpreisfaelligAm: faelligAm,
              stufe: inv.pipelineStufe || "",
              abrechenbar,
              status: statusLabel,
            });
          }
        });

        const initials = u.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        const settings = allSettings.find((s: any) => s.user_id === u.id);
        const teamleaderId = settings?.einstellungen?.teamleader_id || undefined;
        // einstellungen.email is the email-settings object, not a string address
        // Use the profile email from profiles table instead
        const profileRow = cacheGet<any>("profiles").find((pr: any) => pr.id === u.id);
        const email = profileRow?.email || "";

        return {
          userId: u.id,
          kuerzel: initials,
          name: u.name,
          email,
          karriere: karriere.titel,
          karriereIcon: karriere.emoji,
          status: "Aktiv",
          provision: provisionCentSumme / 100,
          faellig: faelligCent / 100,
          bezahlt: bezahltCent / 100,
          klaeren: klaerenCent / 100,
          // Christians Definition vom 14.09.2026: ein Abschluss ist ein
          // durchlaufener Notartermin. Vorher stand hier `vpKontakte.length`,
          // also die Zahl ALLER Kontakte des Partners, unabhaengig von jeder
          // Stufe. Ein frisch importierter Lead zaehlte wie ein Kauf.
          vermittlungen: abschlussZahl,
          abschluesse,
          teamleaderId,
          effectiveRate,
          setterRate,
          eigenRate,
        } satisfies PartnerData;
      });

    // Ohne aktive Overhead-Provision wird kein Differenz-Overhead berechnet;
    // die Funktion bleibt für eine spätere Reaktivierung stehen.
    const oh: ReturnType<typeof berechneOverhead> = OVERHEAD_AKTIV
      ? berechneOverhead(partnerList)
      : { overheadEinnahmen: {}, overheadAusgaben: {} };
    const total = partnerList.reduce((a, p) => a + p.provision + (oh.overheadEinnahmen[p.kuerzel]?.gesamt || 0), 0);
    const aktiv = partnerList.filter(p => p.status === "Aktiv").length;

    return {
      partner: partnerList,
      overheadEinnahmen: oh.overheadEinnahmen,
      overheadAusgaben: oh.overheadAusgaben,
      totalAuszahlungen: total,
      aktivPartner: aktiv,
    };
  }, [_settingsVersion, lokalVersion, abrechnungenBereit]);

  // Der gewaehlte Partner per Kennung, immer aus den aktuellen Zahlen. Vorher
  // hielt die Seite einen Schnappschuss fest, der nach einer Zahlung veraltet war.
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const selectedPartner = selectedPartnerId ? partner.find((x) => x.userId === selectedPartnerId) ?? null : null;
  const setSelectedPartner = (p: PartnerData | null) => setSelectedPartnerId(p?.userId ?? null);
  const [statusFilter, setStatusFilter] = useState("alle");
  const [searchQuery, setSearchQuery] = useState("");

  // Erst rechnen, wenn die Bescheide geladen sind, sonst stuende alles als faellig da.
  if (abrechnungenFehler && abrechnungenPersistenz() !== "lokal") {
    return (
      <DashboardLayout>
        <Card className="m-6 border-l-4 border-l-destructive">
          <CardContent className="py-4 text-sm">
            <p className="font-medium text-foreground">Die Bescheide konnten nicht geladen werden.</p>
            <p className="text-muted-foreground mt-1">
              Ohne sie stimmen „Fällig“ und „Ausgezahlt“ nicht, deshalb zeigt die Seite keine Beträge. Bitte lade die Seite neu.
            </p>
            <p className="text-xs text-muted-foreground mt-2">{abrechnungenFehler}</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }
  if (!abrechnungenBereit && abrechnungenPersistenz() !== "lokal") {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-muted-foreground">Abrechnungen werden geladen …</div>
      </DashboardLayout>
    );
  }

  // Gutschrift-Status für Gesamtübersicht
  const gsStatusAll: GutschriftStore = loadGutschriftStatus();

  const filtered = partner.filter((p) => {
    if (statusFilter !== "alle" && p.status.toLowerCase() !== statusFilter) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (selectedPartner) {
    return (
      <DashboardLayout>
        <PartnerDetail partner={selectedPartner} onBack={() => setSelectedPartner(null)} showBackButton={true} overheadEinnahmen={overheadEinnahmen} overheadAusgaben={overheadAusgaben} />
      </DashboardLayout>
    );
  }

  if (!isOverviewRole) {
    /*
     * Der Partner sieht seine EIGENEN Zahlen.
     *
     * Bis zum 14.09.2026 wurde hier ein Objekt mit `provision: 0`,
     * `vermittlungen: 0` und leerer Abschlussliste gebaut. Jeder
     * Vertriebspartner, der diese Seite oeffnete, sah deshalb dauerhaft
     * null Euro, auch wenn er Abschluesse hatte. Derselbe Fehler war fuer
     * Inhaber und Vertriebsleitung schon einmal behoben worden, siehe den
     * Kommentar bei `isOverviewRole`; fuer den Partner selbst blieb er
     * stehen.
     *
     * Seine Zahlen stehen laengst in `partner`: Die Liste wird fuer jede
     * Rolle gebaut und enthaelt jeden Vertriebspartner. Was er darin sieht,
     * begrenzt die Datenbank ueber ihre Zugriffsregeln, nicht diese Seite.
     */
    const ownOverride = getKarriereOverrideForUser(authUser?.id);
    const ownKarriere = getKarriereStufe(0, ownOverride);
    const ownEffectiveRate = getEffectiveRate(authUser?.id, ownKarriere);
    const ownSetterRate = getCustomProvisionRateSetter(authUser?.id);
    const ownEigenRate = getCustomProvisionRateEigen(authUser?.id);
    const eigener = partner.find((p) => p.userId === authUser?.id);
    // Der Rueckfall greift, wenn der Angemeldete gar kein Vertriebspartner
    // ist. Dann gibt es nichts abzurechnen, und null ist die Wahrheit.
    const ownPartner: PartnerData = eigener ?? {
      userId: authUser?.id || "", kuerzel: "", name: user.name, email: "",
      karriere: ownKarriere.titel, karriereIcon: ownKarriere.emoji, status: "Aktiv",
      provision: 0, faellig: 0, bezahlt: 0, klaeren: 0, vermittlungen: 0,
      abschluesse: [],
      effectiveRate: ownEffectiveRate,
      setterRate: ownSetterRate,
      eigenRate: ownEigenRate,
    };
    return (
      <DashboardLayout>
        {zeigeKaufpreisFehlt && ohneKaufpreis.length > 0 && (
          <div className="mb-6"><KaufpreisFehltKarte eintraege={ohneKaufpreis} /></div>
        )}
        <PartnerDetail partner={ownPartner} onBack={() => {}} showBackButton={false} overheadEinnahmen={{}} overheadAusgaben={{}} />
      </DashboardLayout>
    );
  }

  // ── Admin/Buchhaltung Gesamtübersicht ──
  const ausstGutschriften = partner.filter((p: PartnerData) => p.provision > 0).length;

  // Helper using current overhead data
  const gesamtAuszahlung = (p: PartnerData) => gesamtAuszahlungWith(p, overheadEinnahmen);

  // Auszahlungs-Status pro Partner
  const getPartnerGSStatus = (kuerzel: string) => {
    const gs = gsStatusAll[`${kuerzel}_${currentMonthKey}`];
    if (!gs) return "offen";
    if (gs.gutschriftUeberwiesen && gs.pdfHinterlegt) return "abgeschlossen";
    if (gs.gutschriftUeberwiesen) return "pdf_fehlt";
    return "offen";
  };

  const offeneCount = partner.filter((p: PartnerData) => getPartnerGSStatus(p.kuerzel) === "offen" && gesamtAuszahlung(p) > 0).length;
  const pdfFehltCount = partner.filter(p => getPartnerGSStatus(p.kuerzel) === "pdf_fehlt").length;
  const abgeschlossenCount = partner.filter(p => getPartnerGSStatus(p.kuerzel) === "abgeschlossen").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <AbrechnungenTabs />
        <PageHeader
          title="Abrechnungen – Gesamtübersicht"
          subtitle="Alle Vertriebspartner und ihre Provisionen"
        />

        {zeigeKaufpreisFehlt && <KaufpreisFehltKarte eintraege={ohneKaufpreis} />}

        {/* Fälligkeit Info */}
        <Card className="border-l-4 border-l-primary bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground text-sm">Fälligkeit der Kaufpreiszahlung</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Die Provisionen werden erst ausgezahlt, sobald die Kaufpreiszahlung eingegangen ist (im Durchschnitt 4–8 Wochen nach Notartermin).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 text-center flex flex-col items-center justify-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Vertriebspartner</p>
            <p className="text-3xl font-bold text-foreground">{partner.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{aktivPartner} aktiv · systemweit</p>
          </Card>
          <Card className="p-5 text-center flex flex-col items-center justify-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Auszahlungen (akt. Monat)</p>
            <p className="text-3xl font-bold text-foreground">{fmt(totalAuszahlungen)}</p>
            <p className="text-xs text-muted-foreground mt-1">{OVERHEAD_AKTIV ? "Provisionen + Overhead" : "Provisionen"}</p>
          </Card>
          <Card className="p-5 text-center flex flex-col items-center justify-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">ø Auszahlung / Partner</p>
            <p className="text-3xl font-bold text-foreground">{fmt(partner.length > 0 ? Math.round(totalAuszahlungen / partner.length) : 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Durchschnitt aktueller Monat</p>
          </Card>
          <Card className="p-5 text-center flex flex-col items-center justify-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Offene Rechnungen</p>
            <p className="text-3xl font-bold text-foreground">{ausstGutschriften}</p>
            <p className="text-xs text-muted-foreground mt-1">Von VPs zu stellen · warten auf Kaufpreisfälligkeit</p>
          </Card>
        </div>

        {/* ═══ BUCHHALTUNG: Auszahlungs-Tracker ═══ */}
        {isBuchhaltung && (
          <Card className="border-l-4 border-l-warning">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
                📋 Auszahlungs-Tracker – {currentMonthLabel}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Überblick aller offenen und erledigten Gutschriften diesen Monat.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-center">
                  <Clock className="h-5 w-5 text-destructive mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{offeneCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Offen</p>
                </div>
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 text-center">
                  <AlertTriangle className="h-5 w-5 text-warning mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{pdfFehltCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">PDF fehlt</p>
                </div>
                <div className="bg-success/5 border border-success/20 rounded-lg p-3 text-center">
                  <CheckCircle2 className="h-5 w-5 text-success mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{abgeschlossenCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Abgeschlossen</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">Partner</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Provision</TableHead>
                    {OVERHEAD_AKTIV && <TableHead className="text-[10px] uppercase tracking-wider">Overhead</TableHead>}
                    <TableHead className="text-[10px] uppercase tracking-wider">Gesamt</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partner.filter(p => gesamtAuszahlung(p) > 0).map(p => {
                    const oh = overheadEinnahmen[p.kuerzel]?.gesamt || 0;
                    // Die Boni-Spalte stand fest auf 100 Euro, unabhaengig von
                    // Partner und Monat. Sie ist ersatzlos entfallen.
                    const total = p.provision + oh;
                    const status = getPartnerGSStatus(p.kuerzel);
                    return (
                      <TableRow key={p.kuerzel}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">{p.kuerzel}</div>
                            <span className="text-sm font-medium">{tarnName(p.name, "partner")}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{fmt(p.provision)}</TableCell>
                        {OVERHEAD_AKTIV && <TableCell className="text-sm text-primary">{oh > 0 ? `+${fmt(oh)}` : "–"}</TableCell>}
                        <TableCell className="text-sm font-bold">{fmt(total)}</TableCell>
                        <TableCell>
                          {status === "abgeschlossen" ? (
                            <Badge className="bg-success text-destructive-foreground text-[10px]">✅ Erledigt</Badge>
                          ) : status === "pdf_fehlt" ? (
                            <Badge variant="outline" className="text-[10px] border-warning text-warning">⚠️ PDF fehlt</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]"><Clock className="h-3 w-3 mr-1" /> Offen</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <button onClick={() => setSelectedPartner(p)} className="text-xs text-primary hover:underline">
                            {status === "offen" ? "Prüfen & Bestätigen" : "Details"}
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Overhead-Übersicht */}
        {Object.keys(overheadEinnahmen).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold font-sans">Team-Overhead Provisionen</CardTitle>
                <Badge variant="outline" className="text-xs">Übersicht für Buchhaltung</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">Overhead an</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Karrierestufe</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Abschluss von</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Objekt</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Kaufpreis</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Rate</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-right">Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(overheadEinnahmen).flatMap(([kuerzel, data]) => {
                    const empfaenger = partner.find(p => p.kuerzel === kuerzel);
                    return data.details.map((d, i) => (
                      <TableRow key={`${kuerzel}-${i}`}>
                        <TableCell className="text-sm font-medium">{tarnName(empfaenger?.name, "partner") || kuerzel}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{empfaenger?.karriereIcon} {empfaenger?.karriere}</Badge></TableCell>
                        <TableCell className="text-sm">{tarnName(d.vonPartner, "partner")}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.objekt}</TableCell>
                        <TableCell className="text-sm">{fmt(d.kaufpreis)}</TableCell>
                        <TableCell className="text-sm">{d.overheadRate} %</TableCell>
                        <TableCell className="text-sm font-semibold text-primary text-right">+{fmt(d.betrag)}</TableCell>
                      </TableRow>
                    ));
                  })}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell colSpan={6} className="text-sm">Gesamt Overhead-Auszahlungen</TableCell>
                    <TableCell className="text-sm font-bold text-primary text-right">+{fmt(Object.values(overheadEinnahmen).reduce((a, b) => a + b.gesamt, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Vertriebspartner Übersicht */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold font-sans">Vertriebspartner Übersicht</CardTitle>
                <Badge variant="outline" className="text-xs">{filtered.length} von {partner.length}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Partner suchen" className="pl-8 h-8 w-40 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Status</SelectItem>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="inaktiv">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Partner</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Karrierestufe</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  {/*
                    Vier Spalten, vier verschiedene Zahlen. Sie hiessen vorher
                    alle irgendwie nach "Provision" und meinten Verschiedenes:

                      Erwartet   alles ab Reservierung, also die Prognose
                      Abrechenbar  nur mit erreichter Kaufpreisfaelligkeit
                      Abschluesse  Geschaefte mit durchlaufenem Notartermin
                      Gesamt     was tatsaechlich ausgezahlt wurde
                  */}
                  <TableHead className="text-[10px] uppercase tracking-wider">Erwartet</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Abrechenbar</TableHead>
                  {OVERHEAD_AKTIV && <TableHead className="text-[10px] uppercase tracking-wider">Overhead</TableHead>}
                  <TableHead className="text-[10px] uppercase tracking-wider">Abschlüsse</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Gesamt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const oh = overheadEinnahmen[p.kuerzel]?.gesamt || 0;
                  // "Gesamt" ist seit dem 14.09.2026 das tatsaechlich
                  // Ausgezahlte, nicht mehr die Erwartung plus Overhead.
                  const erhalten = bisherErhalten(p.userId);
                  return (
                    <TableRow key={p.kuerzel}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{p.kuerzel}</div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{tarnName(p.name, "partner")}</p>
                            <p className="text-[10px] text-muted-foreground">{p.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-xs">{p.karriereIcon} {p.karriere}</Badge>
                          {(p.setterRate != null || p.eigenRate != null) ? (
                            <>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Setter {p.setterRate ?? p.effectiveRate} %</Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Eigen {p.eigenRate ?? p.effectiveRate} %</Badge>
                            </>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold">{p.effectiveRate} %</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={p.status === "Aktiv" ? "bg-success text-destructive-foreground text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmt(p.provision)}</TableCell>
                      <TableCell className="text-sm font-semibold text-foreground">
                        {p.faellig > 0 ? fmt(p.faellig) : <span className="text-muted-foreground">–</span>}
                      </TableCell>
                      {OVERHEAD_AKTIV && <TableCell className="text-sm font-semibold text-primary">{oh > 0 ? `+${fmt(oh)}` : "–"}</TableCell>}
                      <TableCell>
                        {p.vermittlungen > 0
                          ? <Badge variant="outline" className="text-[10px]">{p.vermittlungen} {p.vermittlungen === 1 ? "Abschluss" : "Abschlüsse"}</Badge>
                          : <span className="text-muted-foreground text-sm">–</span>}
                      </TableCell>
                      <TableCell className="text-sm font-bold text-foreground">
                        {erhalten > 0 ? fmt(erhalten) : <span className="font-normal text-muted-foreground">noch nichts</span>}
                      </TableCell>
                      <TableCell>
                        <button onClick={() => setSelectedPartner(p)} className="text-xs text-primary hover:underline flex items-center gap-1">⊙ Details</button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell className="text-sm">Gesamt ({filtered.length} Partner)</TableCell>
                  <TableCell /><TableCell />
                  <TableCell className="text-sm">{fmt(filtered.reduce((a, p) => a + p.provision, 0))}</TableCell>
                  {OVERHEAD_AKTIV && <TableCell className="text-sm text-primary">+{fmt(filtered.reduce((a, p) => a + (overheadEinnahmen[p.kuerzel]?.gesamt || 0), 0))}</TableCell>}
                  <TableCell><Badge variant="outline" className="text-[10px]">{filtered.reduce((a, p) => a + p.vermittlungen, 0)} Verm.</Badge></TableCell>
                  <TableCell className="text-sm font-bold">{fmt(filtered.reduce((a, p) => a + gesamtAuszahlung(p), 0))}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Abrechnungen;
