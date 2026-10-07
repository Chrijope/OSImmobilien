import { useState, useMemo, useRef, useEffect } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { formatDatum } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Archive, Search, User, Users, Calendar, Building2, Banknote, Scale, Clock, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getInvestmentById, getInvestmentsByKontakt, isGrundschuldUploaded } from "@/lib/investmentsStore";
import { cn } from "@/lib/utils";
import { getFinanzierung } from "@/lib/finanzierungStore";
import { cacheGet, ladezeitLoggen } from "@/lib/dataCache";

import { PageHeader } from "@/components/PageHeader";
import { getKontakte, updateKontakt, mergeKontaktMeta, type KundeData } from "@/lib/kundenStore";
import { updateInvestment, setInvestmentMetaFields } from "@/lib/investmentsStore";
import {
  stufeBrauchtObjektDaten, objektDatenFehlen, investmentKaufpreis,
} from "@/lib/objektDatenPflicht";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { KontaktTypBadge } from "@/components/kunden/KontaktTypBadge";
import { getEffectivePipelineStufe, calculateLogicalPipelineStufe, PIPELINE_STUFEN, buildBucketEntries, type PipelineStufe } from "@/lib/kontaktPipeline";
import { stufenFilterLabel, kontaktGanzVerloren } from "@/lib/pipelineStufen";
import { sichtfenster } from "@/lib/pipelineSichtfenster";
import { getInboxTasks } from "@/lib/aktivitaetenStore";
import { getFollowUps } from "@/lib/followUpStore";
// Die Schwellen stehen an einer Stelle. Die Pipeline hatte lange eine eigene
// Kopie, in der Beratungsgespräch, die NoShow-Stufen und Selbstauskunft
// fehlten. Kacheln dieser Stufen blieben deshalb immer farblos.
import { getDaysSinceUpdate } from "@/lib/inactivityThresholds";
// Was eine Stufe bedeutet, steht an einer Stelle. Die Pipeline hatte dafür eine
// eigene Tabelle, das Kundenprofil eine zweite, und beide beschrieben die alte
// Reihenfolge.
import { STUFEN_ERKLAERUNG } from "@/lib/stufenErklaerung";
import { bewertePipelineKachel } from "@/lib/pipelineAmpel";
import { kontaktQuellen, setterTerminName } from "@/lib/kontaktTermine";
import { getAufgabenFuerKunde } from "@/lib/aufgabenStore";
import { hatGeplantenTermin, naechsterKontakt, zuZeitpunkt, type KontaktEingabe } from "@/lib/naechsterKontakt";
import { useUser } from "@/contexts/UserContext";
import { getUserSetting } from "@/lib/userSettingsCache";
import { getCurrentUserId } from "@/lib/currentUser";
import { fuehrungsumfang, istFuehrungskraft, teamMitgliederIds } from "@/lib/datenSicht";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { finanzierungspartnerAnzeige } from "@/lib/finanzierungspartner";
import { VerlustGrundAuswahl } from "@/components/verlust/VerlustGrundAuswahl";
import { verlustGrundLabel } from "@/lib/verlustgruende";
import { getAbwicklungDaten as abwicklungLesen, ABSCHLUSS_HINWEIS, ABSCHLUSS_NUR_ROLLEN, ABSCHLUSS_STUFEN, darfAbschlussStufeWechseln } from "@/lib/abwicklungStore";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";
import { PipelineSummenLeiste, type SummenSpalte } from "@/components/pipeline/PipelineSummenLeiste";

type AbwDaten = {
  kaufpreisfaelligkeitDatum?: string;
  kaufpreisEingegangen?: boolean;
  kaufpreisEingegangenDatum?: string;
  grundbuchDatum?: string;
  grundbuchEingetragen?: boolean;
  provisionsRechnungGestellt?: boolean;
  provisionsRechnungDatum?: string;
  auszahlungDatum?: string;
  auszahlungBestaetigt?: boolean;
  uebergabeDatum?: string;
};

// Eigene Fassung entfernt, es gilt der gemeinsame Store. Vorher las die
// Pipeline aus den persoenlichen Einstellungen des ANGEMELDETEN Nutzers und
// zeigte deshalb Striche, sobald jemand anderes die Daten eingetragen hatte.
function getAbwicklungDaten(investmentId: string): AbwDaten {
  return abwicklungLesen(investmentId) as AbwDaten;
}

function getStufe(k: KundeData): PipelineStufe {
  return getEffectivePipelineStufe(k);
}

// Normalisierung wie in kontaktPipeline.ts (lokal, damit kein Export nötig)
function normalizeStufeKey(stufe?: string | null): PipelineStufe | null {
  if (!stufe) return null;
  let n = stufe === "after_sales" || stufe === "aftersales" ? "faelligkeit" : stufe;
  if (n === "closing") n = "objektauswahl";
  return (PIPELINE_STUFEN as readonly { key: string }[]).some(s => s.key === n) ? (n as PipelineStufe) : null;
}

type PipelineEntry = { kunde: KundeData; stufe: PipelineStufe; investmentId?: string; entryKey: string };

/** Eine einzige leere Liste für alle leeren Spalten, damit kein neues Feld entsteht. */
const KEINE_EINTRAEGE: PipelineEntry[] = [];

/**
 * Wie viele Kacheln eine Spalte zunächst zeichnet, und wie viele beim
 * Nachladen dazukommen.
 *
 * In der Pipeline stehen firmenweit über zweitausend Kontakte. Alle auf einmal
 * zu zeichnen hat den Browser beim Öffnen sekundenlang blockiert, obwohl in
 * eine Spalte nur etwa acht Kacheln auf den Bildschirm passen. Gezeigt wird
 * deshalb ein gutes Sichtfenster, der Rest kommt beim Scrollen in der Spalte
 * oder über den Knopf darunter. Die Zahl in der Spaltenüberschrift bleibt die
 * Gesamtzahl, nicht die gezeichnete.
 *
 * Dasselbe Muster nutzt bereits die Marktanalyse (`SEITENGROESSE` dort).
 */
const KACHELN_JE_SPALTE = 25;

/*
 * Spalten, unter denen die Summenleiste eine Kaufpreis-Summe zeigt.
 * Objektauswahl und das Follow-Up danach zaehlen mit: Genau dort wird der
 * Kaufpreis eingetragen, und die Summe blieb ausgerechnet unter der Spalte
 * leer, in der er entsteht. Bonitaetsunterlagen ebenso, dort erzwingt der
 * Dialog ihn. Unter allen anderen Spalten steht keine Kachel.
 */
const GESAMT_STUFEN = new Set([
  "objektauswahl", "follow_up_objekt",
  "bonitaetsunterlagen", "reservierung", "finanzierung", "notar",
  "faelligkeit", "abrechnung", "abgeschlossen", "bestandskunden", "bestandsimport",
]);

function buildPipelineEntries(kunden: KundeData[]): PipelineEntry[] {
  const entries: PipelineEntry[] = [];
  for (const k of kunden) {
    // Archivierte Kontakte bleiben EINE Karte in "archiviert"
    if (k.archiviert) {
      entries.push({ kunde: k, stufe: "archiviert", entryKey: k.id });
      continue;
    }
    const invs = getInvestmentsByKontakt(k.id);
    // Bei mehreren Investments: pro Investment eine eigene Karte in dessen Stufe
    if (invs.length >= 2) {
      for (const inv of invs) {
        const s = normalizeStufeKey(inv.pipelineStufe) || getStufe(k);
        entries.push({ kunde: k, stufe: s, investmentId: inv.id, entryKey: `${k.id}__${inv.id}` });
      }
      continue;
    }
    // 0 oder 1 Investment → bisheriges Verhalten (effektive Stufe des Kunden)
    entries.push({ kunde: k, stufe: getStufe(k), investmentId: invs[0]?.id, entryKey: k.id });
  }
  return entries;
}


const isSetterRole = (role: string) => role === "setterin";
const isVersicherungsexperte = (role: string) => role === "versicherungsexperte";

const headerColor = (key: string): string => {
  const colors: Record<string, string> = {
    neuer_lead: "bg-sky-500",
    zugewiesen: "bg-teal-500",
    kontaktversuche: "bg-slate-500",
    follow_up: "bg-lime-500",
    erstgespraech_geplant: "bg-cyan-500",
    closing: "bg-violet-500",
    bonitaetsunterlagen: "bg-orange-500",
    objektauswahl: "bg-amber-500",
    follow_up_objekt: "bg-lime-600",
    reservierung: "bg-purple-500",
    finanzierung: "bg-yellow-500",
    notar: "bg-indigo-500",
    // aftersales removed
    faelligkeit: "bg-rose-500",
    abrechnung: "bg-cyan-500",
    abgeschlossen: "bg-green-500",
    bestandskunden: "bg-emerald-600",
    bestandsimport: "bg-zinc-500",
    vermoegensaufbau: "bg-emerald-500",
    archiviert: "bg-gray-500",
    verloren: "bg-red-500",
  };
  return colors[key] || "bg-muted";
};

const FINANZ_LABELS: Record<string, { label: string; className: string }> = {
  offen: { label: "Offen", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  bestaetigt: { label: "Bestätigt", className: "bg-green-500/10 text-green-700 border-green-200" },
  abgelehnt: { label: "Abgelehnt", className: "bg-red-500/10 text-red-700 border-red-200" },
};

function formatEuro(val: number) {
  if (!val) return "";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(val);
}



/**
 * Bewertet eine Kachel. Die Regel selbst steht in pipelineAmpel.ts und ist
 * dort geprüft; hier werden nur die Daten des Kunden eingesammelt.
 *
 * `quellen` wird von aussen hereingereicht, weil das Einsammeln teuer ist:
 * `kontaktQuellen` durchsucht dafuer Aufgaben, Follow-ups und Aktivitaeten
 * einmal komplett. Vorher holte jede Kachel diese Sammlung viermal (zweimal
 * hier, je einmal fuer Rahmenfarbe und Beschriftung). Bei tausend Karten und
 * zwanzigtausend Aktivitaeten sind das Millionen Vergleiche fuer ein Ergebnis,
 * das sich innerhalb einer Kachel nicht unterscheidet.
 */
function bewerteKachel(
  kunde: KundeData,
  stufe: PipelineStufe,
  investmentId?: string,
  quellen?: KontaktEingabe,
) {
  const gesammelt = quellen ?? kontaktQuellen(kunde, investmentId);
  const naechster = naechsterKontakt(gesammelt);
  return bewertePipelineKachel({
    stufe,
    tageSeitAenderung: getDaysSinceUpdate(kunde),
    naechsterKontakt: naechster
      ? {
          zeitpunkt: naechster.zeitpunkt,
          ueberfaellig: naechster.ueberfaellig,
          // Die Herkunft entscheidet mit: eine Sperrfrist ist kein Termin.
          quelle: naechster.quelle,
          // Der Titel sagt, worum es geht. Ohne ihn steht auf der Kachel nur
          // "Termin überfällig" und niemand weiss, welcher.
          bezeichnung: naechster.titel?.trim() || naechster.bezeichnung,
        }
      : null,
    hatZukuenftigenTermin: hatGeplantenTermin(gesammelt),
  });
}

type Kachelbewertung = ReturnType<typeof bewerteKachel>;

/**
 * Prüft, ob für einen Kunden bereits ein fixer, zukünftiger Termin hinterlegt
 * ist. In dem Fall wird die Kachel nicht als inaktiv eingefärbt.
 * Die Wartephase nach "Nicht erreicht" zählt dabei nicht als Termin.
 */
function hasFutureScheduledActivity(kunde: KundeData, investmentId?: string): boolean {
  return hatGeplantenTermin(kontaktQuellen(kunde, investmentId));
}

function InactivityBadge({
  kunde,
  stufe,
  bewertung,
}: {
  kunde: KundeData;
  stufe: PipelineStufe;
  /** `null`, solange Aufgaben und Follow-ups noch nicht im Speicher liegen. */
  bewertung: Kachelbewertung | null;
}) {
  // Ruhiger Platzhalter statt einer falschen Aussage: Ohne Aufgaben und
  // Follow-ups wuesste die Kachel nichts von einem geplanten Termin und
  // schriebe "14d inaktiv" an einen Kunden, der morgen einen Termin hat.
  if (!bewertung) {
    return (
      <div className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
        <Clock className="h-2.5 w-2.5" /> …
      </div>
    );
  }

  if (bewertung.grund === "eingeplant" && bewertung.text) {
    return (
      <div className="text-[10px] font-semibold flex items-center gap-0.5 text-emerald-600">
        <Clock className="h-2.5 w-2.5" />
        {bewertung.text}
      </div>
    );
  }

  if (!bewertung.farbe) {
    // Noch keine Warnung. Die Zahl trotzdem zeigen, damit man den Verlauf sieht.
    if (stufe === "follow_up" || stufe === "kontaktversuche") return null;
    const tage = getDaysSinceUpdate(kunde);
    if (tage < 1) return null;
    return (
      <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
        <Clock className="h-2.5 w-2.5" /> {tage}d inaktiv
      </div>
    );
  }

  const istRot = bewertung.farbe === "red";
  return (
    <div
      className={`text-[10px] font-semibold flex items-center gap-0.5 ${
        istRot ? "text-red-600" : "text-orange-600"
      }`}
    >
      <Clock className="h-2.5 w-2.5" />
      {bewertung.text}
    </div>
  );
}

/**
 * Klasse für eine Terminzeile auf der Kachel.
 *
 * Ein Termin, der vorbei ist, stand bisher genauso grau da wie einer, der
 * morgen stattfindet. Auf einen Blick war nicht zu erkennen, dass er
 * verstrichen ist.
 */
function terminKlasse(datum?: string, uhrzeit?: string): string {
  const zeit = zuZeitpunkt(datum, uhrzeit);
  if (zeit === null) return "text-xs text-muted-foreground";
  return zeit < Date.now()
    ? "text-xs text-destructive font-medium"
    : "text-xs text-muted-foreground";
}

function getInvestmentData(kundeId: string, investmentId?: string) {
  const invs = getInvestmentsByKontakt(kundeId);
  if (invs.length === 0) return null;
  const inv = (investmentId && invs.find(i => i.id === investmentId)) || invs[0];
  // Get raw row from cache for meta access
  const rawRows = cacheGet("investments");
  const raw = rawRows.find((r: any) => r.id === inv.id);
  const meta = raw?.meta || {};
  return { inv, meta, raw };
}

const REQUIRED_DOCS = [
  "Personalausweis",
  "Letzter Gehaltsnachweis",
  "Vorletzter Gehaltsnachweis",
  "Letzter Einkommensteuerbescheid",
  "SCHUFA-Auskunft",
];

function getDocStatus(meta: any): { label: string; className: string } {
  // Kunde finanziert selbst: Es fehlt nichts, es wird nichts gebraucht.
  if (meta?.selbstauskunftEntfaellt?.aktiv) return { label: "Nicht erforderlich", className: "text-muted-foreground" };
  const statuses: Record<string, string> = meta.docStatuses || {};
  
  // Check required docs status
  const requiredStatuses = REQUIRED_DOCS.map(name => statuses[name] || "none");
  const allKeys = Object.keys(statuses);
  
  const anyNone = requiredStatuses.some(s => s === "none");
  const anyRejected = allKeys.some(k => statuses[k] === "rejected");
  const allUploaded = requiredStatuses.every(s => s === "uploaded" || s === "approved");
  const allApproved = requiredStatuses.every(s => s === "approved");
  
  if (allApproved && !anyNone) return { label: "Vollständig", className: "text-green-600" };
  if (anyRejected) return { label: "Abgelehnt", className: "text-red-600" };
  if (allUploaded && !anyNone) return { label: "In Prüfung", className: "text-amber-600" };
  if (anyNone) return { label: "Unvollständig", className: "text-amber-600" };
  return { label: "Ausstehend", className: "text-muted-foreground" };
}

function KundeCard({ kunde, stufe, investmentId, zusatzBereit, datenstand, onClick, onDragStartCard }: { kunde: KundeData; stufe: PipelineStufe; investmentId?: string; zusatzBereit: boolean; datenstand: number; onClick: () => void; onDragStartCard?: (e: React.DragEvent) => void }) {
  const isArchived = kunde.archiviert;
  /*
   * Termine, Aufgaben und Follow-ups dieses Kunden, genau einmal je Kachel.
   *
   * Das Sammeln ist teuer (siehe bewerteKachel). Rahmenfarbe, Beschriftung und
   * die Follow-Up-Zeile unten teilen sich deshalb dasselbe Ergebnis, statt es
   * sich dreimal zu holen. Neu gerechnet wird nur, wenn sich der Kunde selbst
   * oder der Datenstand (`datenstand`, aus useLiveVersion) aendert; ein
   * Tastendruck im Suchfeld oder ein Ziehen einer Kachel loest es nicht aus.
   *
   * Mit investmentId, genau wie das Abzeichen darunter. Ohne sie rechnete der
   * Rahmen bei einem Kunden mit mehreren Investments mit einem anderen
   * Aufgabenbestand als die Beschriftung: roter Rahmen ohne roten Text oder
   * umgekehrt.
   */
  const quellen = useMemo(
    () => (zusatzBereit ? kontaktQuellen(kunde, investmentId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kunde, investmentId, zusatzBereit, datenstand],
  );
  const bewertung = useMemo(
    () => (quellen ? bewerteKachel(kunde, stufe, investmentId, quellen) : null),
    [quellen, kunde, stufe, investmentId],
  );
  const inactivityColor = bewertung?.farbe ?? null;
  const borderClass = inactivityColor === "red"
    ? "border-red-400 border-l-4"
    : inactivityColor === "orange"
    ? "border-orange-400 border-l-4"
    : "";

  // Get investment data for stages that need it
  const invData = useMemo(() => {
    const needsInv = ["erstgespraech_geplant", "erstgespraech", "beratungsgespraech", "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt", "reservierung", "finanzierung", "notar", "faelligkeit", "abrechnung", "abgeschlossen"];
    if (!needsInv.includes(stufe)) return null;
    return getInvestmentData(kunde.id, investmentId);
  }, [kunde.id, stufe, investmentId]);

  // Deal value: show from erstgespraech onwards (inkl. Bestandskunden)
  const showDealValue = ["erstgespraech_geplant", "erstgespraech", "beratungsgespraech", "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt", "reservierung", "finanzierung", "notar", "faelligkeit", "abrechnung", "abgeschlossen", "bestandskunden"].includes(stufe);
  /*
   * Der Kaufpreis des Investments hat Vorrang vor dem am Kontakt.
   *
   * Wer einen Kunden von Hand auf Reservierung oder Finanzierung zieht, traegt
   * die Objektdaten im Dialog ein, und der legt sie am Investment ab. Bisher
   * las die Kachel nur den Kontaktwert, der dabei gar nicht gesetzt wird. Auf
   * der Karte stand deshalb kein Betrag, obwohl einer eingetragen war.
   *
   * Dieselbe Reihenfolge nutzt die Summe unter der Spalte, sonst zeigten
   * Kachel und Summe verschiedene Zahlen fuer denselben Vorgang.
   */
  const dealValue = investmentKaufpreis(investmentId)
    || kunde.kaufpreis
    || (kunde.funnelInvestitionsvolumen ? parseInt(kunde.funnelInvestitionsvolumen.replace(/\D/g, "")) : 0);

  return (
    <div
      onClick={onClick}
      draggable={!isArchived}
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStartCard?.(e);
      }}
      className={`border rounded-lg p-3 space-y-1.5 hover:shadow-md transition-shadow cursor-pointer ${
        isArchived ? "bg-muted/50 border-dashed opacity-70" : "bg-card"
      } ${borderClass}`}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">{tarnName(`${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim())}</h4>
        <div className="flex items-center gap-1">
          <KontaktTypBadge kunde={kunde} size="xs" />
          {isArchived && (
            <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 border-dashed">
              <Archive className="h-2.5 w-2.5" /> Archiviert
            </Badge>
          )}
        </div>
      </div>
      {invData?.inv && (
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          Investment {invData.inv.nummer}
          {invData.inv.objektTitel ? ` · ${invData.inv.objektTitel}` : ""}
        </div>
      )}
      <InactivityBadge kunde={kunde} stufe={stufe} bewertung={bewertung} />

      {/* Deal-Wert ab Erstgespräch */}
      {showDealValue && dealValue > 0 && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Banknote className="h-3 w-3 shrink-0" />
          <span className={unscharfKlasse("font-semibold")}>{formatEuro(dealValue)}</span>
        </div>
      )}

      {/* 1. Neuer Lead */}
      {stufe === "neuer_lead" && (
        <>
          {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setter:</span> {kunde.setter}</div>}
          <div className="text-xs text-muted-foreground"><span className="font-medium">Angelegt:</span> {formatDatum(kunde.erstellt_am)}</div>
        </>
      )}

      {/* 2. Kontaktversuche + Letzter Kontaktversuch */}
      {stufe === "kontaktversuche" && (
        <>
          {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setter:</span> {kunde.setter}</div>}
          <div className="text-xs text-muted-foreground"><span className="font-medium">Kontaktversuche:</span> {kunde.nichtErreichtCount || 0} / 4</div>
          <div className="text-xs text-muted-foreground"><span className="font-medium">Letzter Versuch:</span> {kunde.aktualisiert_am ? formatDatum(kunde.aktualisiert_am) : "–"}</div>
        </>
      )}

      {/* Zugewiesen */}
      {stufe === "zugewiesen" && (
        <>
          {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setter:</span> {kunde.setter}</div>}
          {/* Gespeichert wird ISO, angezeigt wird deutsch. */}
          {kunde.zugewiesenAm && <div className="text-xs text-muted-foreground"><span className="font-medium">Zugewiesen am:</span> {formatDatum(kunde.zugewiesenAm)}</div>}
          {(kunde.setterTerminDatum || kunde.setterTerminUhrzeit) && (
            <div className={terminKlasse(kunde.setterTerminDatum, kunde.setterTerminUhrzeit)}>
              {/* Derselbe Termin heisst je nach Stufe anders, siehe setterTerminName. */}
              <span className="font-medium">{setterTerminName(kunde)}:</span> {formatDatum(kunde.setterTerminDatum) || "–"} {kunde.setterTerminUhrzeit ? `um ${kunde.setterTerminUhrzeit} Uhr` : ""}
            </div>
          )}
        </>
      )}

      {/* 3. Follow-Up */}
      {stufe === "follow_up" && (() => {
        // Nicht mehr `verstecktBis`, sondern der tatsächlich nächste geplante
        // Kontakt aus Aufgaben, Follow-Ups und Terminen aller Kollegen.
        // Dieselbe, oben einmal gesammelte Quelle wie Rahmen und Beschriftung.
        const naechster = quellen ? naechsterKontakt(quellen) : null;
        const nDate = naechster ? new Date(naechster.zeitpunkt) : null;
        return (
          <>
            {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setter:</span> {kunde.setter}</div>}
            {nDate && naechster && (
              <div className={`text-xs ${naechster.ueberfaellig ? "text-destructive" : "text-muted-foreground"}`}>
                <span className="font-medium">{naechster.ueberfaellig ? "Fällig war" : naechster.bezeichnung}:</span>{" "}
                {formatDatum(nDate.toISOString())} um {nDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                {naechster.titel && <span className="block text-[11px] opacity-80 truncate">{naechster.titel}</span>}
              </div>
            )}
            </>
        );
      })()}

      {/* 4. Erstgespräch + Ergebnis */}
      {stufe === "erstgespraech_geplant" && (
        <>
          {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setter:</span> {kunde.setter}</div>}
          {(kunde.setterTerminDatum || kunde.setterTerminUhrzeit) && (
            <div className={terminKlasse(kunde.setterTerminDatum, kunde.setterTerminUhrzeit)}>
              <span className="font-medium">Termin:</span> {formatDatum(kunde.setterTerminDatum) || "–"} {kunde.setterTerminUhrzeit ? `um ${kunde.setterTerminUhrzeit} Uhr` : ""}
            </div>
          )}
          {kunde.qualZiel && <div className="text-xs text-muted-foreground"><span className="font-medium">Interesse:</span> {kunde.qualZiel}</div>}
        </>
      )}

      {/* 5. Beratungsgespräch (Lead an VP übergeben, läuft jetzt beim Berater) */}
      {stufe === "beratungsgespraech" && (
        <>
          {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setter:</span> {kunde.setter}</div>}
          {(kunde.setterTerminDatum || kunde.setterTerminUhrzeit) && (
            <div className={terminKlasse(kunde.setterTerminDatum, kunde.setterTerminUhrzeit)}>
              <span className="font-medium">Termin:</span> {formatDatum(kunde.setterTerminDatum) || "–"} {kunde.setterTerminUhrzeit ? `um ${kunde.setterTerminUhrzeit} Uhr` : ""}
            </div>
          )}
          {kunde.qualZiel && <div className="text-xs text-muted-foreground"><span className="font-medium">Interesse:</span> {kunde.qualZiel}</div>}
        </>
      )}

      {/* 6. Bonitätsunterlagen + Dokument-Status + letzte Einreichung */}
      {stufe === "bonitaetsunterlagen" && (() => {
        const docSt = invData ? getDocStatus(invData.meta) : { label: "–", className: "text-muted-foreground" };
        return (
          <>
            {kunde.finanzierbarkeit && (
              <div className="text-xs text-muted-foreground"><span className="font-medium">Bonität:</span>{" "}
                <span className={kunde.finanzierbarkeit === "Positiv" ? "text-green-600 font-semibold" : "text-amber-600 font-semibold"}>{kunde.finanzierbarkeit}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground"><span className="font-medium">Unterlagen:</span>{" "}
              <span className={`font-semibold ${docSt.className}`}>{docSt.label}</span>
            </div>
            {invData?.meta?.lastDocUploadAt && (
              <div className="text-xs text-muted-foreground"><span className="font-medium">Letzte Einreichung:</span> {formatDatum(invData.meta.lastDocUploadAt)}</div>
            )}
          </>
        );
      })()}

      {/* 7. Objektauswahl + gesetztes Objekt + Kaufpreis. "follow_up_objekt"
          zeigt dieselben Angaben: gleiche Phase, der Kunde ueberlegt noch. */}
      {(stufe === "objektauswahl" || stufe === "follow_up_objekt") && (
        <>
          {kunde.finanzierbarkeit && (
            <div className="text-xs text-muted-foreground"><span className="font-medium">Bonität:</span>{" "}
              <span className="text-green-600 font-semibold">{kunde.finanzierbarkeit}</span>
            </div>
          )}
          {kunde.objekt && <div className="text-xs text-muted-foreground flex items-start gap-1"><Building2 className="h-3 w-3 mt-0.5 shrink-0" /><span>{kunde.objekt}</span></div>}
          {invData?.inv?.weNr && <div className="text-xs text-muted-foreground"><span className="font-medium">WE:</span> {invData.inv.weNr}</div>}
        </>
      )}

      {/* 8. Reservierung */}
      {stufe === "reservierung" && (
        (() => {
          const invMeta = (invData?.inv as any)?.meta || {};
          const rvSignedAtRaw = invMeta.rvSignedAt || (typeof invMeta.rvSigned === "string" ? invMeta.rvSigned : undefined);
          return (
            <>
              {kunde.objekt && <div className="text-xs text-muted-foreground flex items-start gap-1"><Building2 className="h-3 w-3 mt-0.5 shrink-0" /><span>{kunde.objekt}</span></div>}
              {kunde.reservierungsDatum && <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" /><span>Reserviert: {formatDatum(kunde.reservierungsDatum)}</span></div>}
              {rvSignedAtRaw && <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" /><span>RV unterschrieben: {formatDatum(rvSignedAtRaw)}</span></div>}
              {/* Widerrufsfrist abgewartet: bis zu diesem Tag ist die Wohnung nicht reserviert. */}
              {invMeta.rvReservierungAb && !invMeta.rvReservierungWirksamAm && !invMeta.rvReservierungEntfallenAm && (
                <div className="text-xs text-[hsl(var(--warning))] flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" /><span>Reservierung wirksam ab {formatDatum(invMeta.rvReservierungAb)} (Widerrufsfrist)</span></div>
              )}
              {invMeta.rvReservierungEntfallenAm && (
                <div className="text-xs text-destructive flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" /><span>Reservierung entfallen: Wohnung anderweitig reserviert</span></div>
              )}
            </>
          );
        })()
      )}

      {/* 9. Finanzierung. Finanzierungspartner und Bank stehen in der
          Fusszeile, dort gelten sie fuer alle Finanzierungsstufen. */}
      {stufe === "finanzierung" && (
        <>
          {kunde.objekt && <div className="text-xs text-muted-foreground flex items-start gap-1"><Building2 className="h-3 w-3 mt-0.5 shrink-0" /><span>{kunde.objekt}</span></div>}
          {kunde.finanzierungsStatus && (
            <div className="mt-1"><Badge variant="outline" className={`text-[10px] ${FINANZ_LABELS[kunde.finanzierungsStatus]?.className || ""}`}>Finanzierung: {FINANZ_LABELS[kunde.finanzierungsStatus]?.label || kunde.finanzierungsStatus}</Badge></div>
          )}
        </>
      )}

      {/* 10. Notar + Beurkundet + GS-Status */}
      {stufe === "notar" && (() => {
        const notarTerminVal = kunde.notarTermin || (invData?.inv as any)?.notarTermin;
        const notarUhrzeitVal = kunde.notarUhrzeit || (invData?.inv as any)?.notarUhrzeit;
        const notarNameVal = kunde.notarName || (invData?.inv as any)?.notarName;
        const notarDate = notarTerminVal ? new Date(notarTerminVal) : null;
        const beurkundet = notarDate ? notarDate < new Date() : false;
        const gsUp = isGrundschuldUploaded(kunde.id);
        return (
          <>
            {kunde.objekt && <div className="text-xs text-muted-foreground flex items-start gap-1"><Building2 className="h-3 w-3 mt-0.5 shrink-0" /><span>{kunde.objekt}</span></div>}
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>Termin: {notarTerminVal ? `${formatDatum(notarTerminVal)}${notarUhrzeitVal ? ` um ${notarUhrzeitVal}` : ""}` : "–"}</span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Scale className="h-3 w-3 shrink-0" />
              <span>Notar: {notarNameVal || "–"}</span>
            </div>
            <div className="text-xs text-muted-foreground"><span className="font-medium">Beurkundet:</span>{" "}
              <span className={beurkundet ? "text-green-600 font-semibold" : "text-amber-600 font-semibold"}>{beurkundet ? "Ja" : "Nein"}</span>
            </div>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5 italic border-dashed mt-1", gsUp ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/40" : "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40")} title="Nur intern sichtbar">
              {gsUp ? "Notar mit GS" : "Notar ohne GS"} 🔒
            </Badge>
          </>
        );
      })()}

      {/* 11. After Sales removed – merged into Fälligkeit */}

      {/* 12. Fälligkeit + Provision + Zahlungseingang */}
      {stufe === "faelligkeit" && (() => {
        const invs = getInvestmentsByKontakt(kunde.id);
        const targetInv = (investmentId && invs.find(i => i.id === investmentId)) || invs[0];
        const abw = targetInv ? getAbwicklungDaten(targetInv.id) : null;
        const datum = abw?.kaufpreisfaelligkeitDatum;
        const meta = invData?.meta || {};
        return (
          <>
            {kunde.objekt && <div className="text-xs text-muted-foreground flex items-start gap-1"><Building2 className="h-3 w-3 mt-0.5 shrink-0" /><span>{kunde.objekt}</span></div>}
            {(() => {
              const d = datum ? new Date(datum) : null;
              const isOverdue = d ? d < new Date() : false;
              return (
                <div className={`text-xs flex items-center gap-1 ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Kaufpreisfälligkeit: {datum ? formatDatum(datum) : "–"}</span>
                  {isOverdue && <span className="text-[10px]">(überfällig)</span>}
                </div>
              );
            })()}
            {meta.provisionOffen != null && <div className="text-xs text-muted-foreground"><span className="font-medium">Provision offen:</span> <span className={unscharfKlasse()}>{formatEuro(meta.provisionOffen)}</span></div>}
            <div className="text-xs text-muted-foreground"><span className="font-medium">Zahlungseingang:</span>{" "}
              <span className={meta.zahlungseingangErfolgt ? "text-green-600 font-semibold" : "text-amber-600 font-semibold"}>{meta.zahlungseingangErfolgt ? "Ja" : "Nein"}</span>
            </div>
          </>
        );
      })()}

      {/* 13. Abrechnung / Abgeschlossen + Abwicklungs-Status + Provision */}
      {(stufe === "abrechnung" || stufe === "abgeschlossen") && (() => {
        const meta = invData?.meta || {};
        const invs = getInvestmentsByKontakt(kunde.id);
        const targetInv = (investmentId && invs.find(i => i.id === investmentId)) || invs[0];
        const abw = targetInv ? getAbwicklungDaten(targetInv.id) : ({} as AbwDaten);
        const Tick = ({ ok, label }: { ok: boolean; label: string }) => (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <span className={ok ? "text-green-600" : "text-muted-foreground"}>{ok ? "✓" : "○"}</span>
            <span>{label}</span>
          </div>
        );
        return (
          <>
            {kunde.objekt && <div className="text-xs text-muted-foreground flex items-start gap-1"><Building2 className="h-3 w-3 mt-0.5 shrink-0" /><span>{kunde.objekt}</span></div>}
            <Tick ok={!!abw.kaufpreisEingegangen} label="Kaufpreis eingegangen" />
            <Tick ok={!!abw.grundbuchEingetragen} label="Grundbuch eingetragen" />
            <Tick ok={!!abw.provisionsRechnungGestellt} label="Provisions-Rechnung gestellt" />
            <Tick ok={!!abw.auszahlungBestaetigt} label="Auszahlung bestätigt" />
            {meta.provisionTatsaechlich != null && meta.provisionTatsaechlich > 0 && (
              <div className="text-xs text-muted-foreground"><span className="font-medium">Provision:</span> <span className={unscharfKlasse()}>{formatEuro(meta.provisionTatsaechlich)}</span></div>
            )}
            {meta.abschlussDatum && <div className="text-xs text-muted-foreground"><span className="font-medium">Abschluss:</span> {formatDatum(meta.abschlussDatum)}</div>}
          </>
        );
      })()}

      {/* 14. Verloren + Grund + Reaktivierbar + Details */}
      {stufe === "verloren" && (
        <>
          {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setter:</span> {kunde.setter}</div>}
          {kunde.verlorenGrund && (
            <div className="text-xs text-destructive font-medium">Grund: {verlustGrundLabel(kunde.verlorenGrund)}</div>
          )}
          {dealValue > 0 && (
            <div className="text-xs text-muted-foreground"><span className="font-medium">Volumen:</span> <span className={unscharfKlasse()}>{formatEuro(dealValue)}</span></div>
          )}
          {(() => {
            const meta = (cacheGet("kontakte").find((r: any) => r.id === kunde.id) as any)?.meta || {};
            return (
              <>
                {meta.reaktivierbar != null && (
                  <div className="text-xs text-muted-foreground"><span className="font-medium">Reaktivierbar:</span>{" "}
                    <span className={meta.reaktivierbar ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{meta.reaktivierbar ? "Ja" : "Nein"}</span>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* 15. Vermögensaufbau */}
      {stufe === "vermoegensaufbau" && (() => {
        const rawMeta = (cacheGet("kontakte").find((r: any) => r.id === kunde.id) as any)?.meta || {};
        return (
          <>
            {kunde.setter && <div className="text-xs text-muted-foreground"><span className="font-medium">Setterin:</span> {kunde.setter}</div>}
            {rawMeta.versicherungsexperte && <div className="text-xs text-muted-foreground"><span className="font-medium">V-Experte:</span> {rawMeta.versicherungsexperte}</div>}
              {kunde.verlorenGrund && (
              <div className="text-xs text-muted-foreground"><span className="font-medium">Grund:</span> {verlustGrundLabel(kunde.verlorenGrund)}</div>
            )}
            {rawMeta.versicherungNotizen && (
              <div className="text-xs text-muted-foreground line-clamp-2"><span className="font-medium">Notiz:</span> {rawMeta.versicherungNotizen}</div>
            )}
            <div className="text-xs text-muted-foreground"><span className="font-medium">Aktualisiert:</span> {formatDatum(kunde.aktualisiert_am)}</div>
          </>
        );
      })()}

      {/* Fusszeile in JEDEM Kaestchen jeder Stufe: Vertriebspartner und
          Quelle, ab der Finanzierung zusaetzlich der Finanzierungspartner.
          Vorher standen beide Angaben verstreut nur in manchen Stufen, hier
          sind sie einheitlich und immer sichtbar. */}
      {(() => {
        const finStufen = ["finanzierung", "notar", "faelligkeit", "abrechnung", "abgeschlossen"];
        const showFin = finStufen.includes(stufe);
        /*
         * Zwei verschiedene Dinge, deshalb zwei Zeilen.
         *
         * Der Finanzierungspartner ist der Mensch, der die Finanzierung
         * betreut, heute Stefan Kurz. Er steht immer da, auch bevor eine Bank
         * feststeht. Die Bank kommt erst dazu, wenn ein Angebot angenommen
         * ist. Frueher stand hier eine gemeinsame Zeile "Finanzierer", die
         * mal die Bank und mal den Partner zeigte, und in der Stufe
         * Finanzierung stand die Bank zusaetzlich weiter oben ein zweites Mal.
         *
         * Die Finanzierung haengt am Investment. Mit der Kontakt-ID fand die
         * Fusszeile nie eine Bank, die Spalte war strukturell leer.
         */
        const partner = showFin ? finanzierungspartnerAnzeige() : null;
        let bankName: string | null = null;
        if (showFin) {
          const finData = getFinanzierung((invData?.inv as any)?.id || "");
          bankName = finData.angebote.find(a => a.akzeptiert)?.bank || null;
        }
        return (
          <div className="pt-1.5 mt-1.5 border-t border-border/60 space-y-0.5">
            {showFin && (
              <div className="text-xs text-muted-foreground"><span className="font-medium">Finanzierungspartner:</span> {tarnName(partner, "partner") || "–"}</div>
            )}
            {showFin && bankName && (
              <div className="text-[11px] text-muted-foreground"><span className="font-medium">Bank:</span> {bankName}</div>
            )}
            <div className="text-xs text-muted-foreground"><span className="font-medium">Vertriebspartner:</span> {tarnName(kunde.berater, "partner") || "–"}</div>
            <div className="text-xs text-muted-foreground"><span className="font-medium">Quelle:</span> {kunde.quelle || "–"}</div>
          </div>
        );
      })()}
    </div>
  );
}

export default function Pipeline() {
  const { user, authUser } = useUser();
  const navigate = useNavigate();
  /*
   * Zwei Stufen statt einer, damit das Brett nicht auf Nebensachen wartet.
   *
   * Zum Zeichnen reichen Kontakte und Investments: daraus entstehen Spalten,
   * Namen, Zahlen und Summen. Beide Tabellen gelten schon als da, sobald ihr
   * erster Tausenderblock angekommen ist (siehe dataCache), die Pipeline steht
   * also frueh.
   *
   * Aufgaben und Follow-ups liefern nur die Zusatzangabe auf der Kachel, also
   * Rahmenfarbe und die Zeile "Termin geplant" beziehungsweise "Xd inaktiv".
   * Bis sie da sind, steht dort ein ruhiger Platzhalter. Vorher wartete die
   * ganze Seite darauf, obwohl neunzig Prozent des Bildes davon unabhaengig
   * sind.
   */
  const cacheReady = useCacheReady(["kontakte", "investments"]);
  const zusatzBereit = useCacheReady(["aufgaben", "follow_ups"]);
  /*
   * Wer ist hier Führungskraft, und für wen?
   *
   * Bis heute stand hier eine eigene Liste mit genau `admin` und `inhaber`.
   * Der Vertriebsleiter gilt überall sonst als Führungskraft, auf der Pipeline
   * aber nicht: Er sah nur seine eigenen Leads und hatte kein Team-Dropdown.
   * Beides kommt jetzt aus `src/lib/datenSicht.ts`, damit es nur eine Antwort
   * gibt. Der Unterschied zwischen "ganzes Haus" und "mein Team" bleibt dabei
   * erhalten: Ein Vertriebsleiter sieht sein Team, nicht das Haus.
   */
  const umfang = fuehrungsumfang(user.role);
  // Backoffice und Buchhaltung setzen Abrechnung und Abschluss für das ganze
  // Haus (04.10.2026). Ohne eigene Kunden sahen sie hier sonst eine leere Pipeline.
  const siehtGanzesHaus = umfang === "haus" || ABSCHLUSS_NUR_ROLLEN.includes(user.role);
  const isTeamLead = istFuehrungskraft(user.role);
  const isSetter = isSetterRole(user.role);
  const isVExperte = isVersicherungsexperte(user.role);
  const isAdmin = user.role === "admin" || user.role === "inhaber";

  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [beraterFilter, setBeraterFilter] = useState<string>("alle");
  const [teamView, setTeamView] = useState<"gesamt" | "individuell">(isTeamLead ? "gesamt" : "individuell");
  const [showArchived, setShowArchived] = useState(false);
  /** Wie viele Kacheln je Spalte gezeichnet werden, siehe KACHELN_JE_SPALTE. */
  const [sichtbarJeStufe, setSichtbarJeStufe] = useState<Record<string, number>>({});
  /** Zuletzt per Ziehen verschobene Kachel, damit sie im Sichtfenster bleibt. */
  const [zuletztVerschoben, setZuletztVerschoben] = useState<{ kundeId: string; investmentId?: string } | null>(null);
  const mehrZeigen = (stufe: string) =>
    setSichtbarJeStufe((bisher) => ({
      ...bisher,
      [stufe]: (bisher[stufe] ?? KACHELN_JE_SPALTE) + KACHELN_JE_SPALTE,
    }));

  // ── Drag & Drop: Karten zwischen Stufen verschieben (mit Bestätigung) ──
  const [dragEntry, setDragEntry] = useState<{ kundeId: string; kundeName: string; investmentId?: string; from: PipelineStufe } | null>(null);
  const [dragOverStufe, setDragOverStufe] = useState<string | null>(null);
  type MoveDialogState = {
    kundeId: string;
    kundeName: string;
    investmentId?: string;
    from: PipelineStufe;
    to: PipelineStufe;
    fromLabel: string;
    toLabel: string;
    /** Ablauf-Schritt für stufen-spezifische Rückfragen. */
    step: "confirm" | "bg_scheduled" | "bg_input" | "sa_filled" | "sa_action" | "verlust_grund";
    bgDatum?: string;
    bgUhrzeit?: string;
    /** Gewählter Verlustgrund, wenn nach "Verloren" verschoben wird. */
    verlustGrundId?: string;
  };
  const [moveConfirm, setMoveConfirm] = useState<MoveDialogState | null>(null);

  const handleDropOnStufe = (toKey: string, toLabel: string) => {
    if (!dragEntry) return;
    setDragOverStufe(null);
    if (dragEntry.from === toKey) { setDragEntry(null); return; }
    // Virtuelle Bestandskunden-Spalte ist kein echter Stufen-Zielwert
    if (toKey === "bestandskunden") { setDragEntry(null); toast({ title: "Verschieben nicht möglich", description: "Bestandskunden ist eine virtuelle Ansicht — bitte über den Verkaufsprozess in diese Spalte gelangen.", variant: "destructive" }); return; }
    // Auf "Abrechnung"/"Abgeschlossen" und heraus nur Admin, Inhaber, Backoffice. Die Kachel
    // kann aus der virtuellen Spalte "Bestandskunden" kommen, deshalb zaehlt
    // die echte Stufe des Investments beziehungsweise des Kontakts.
    const kunde = getKontakte().find((k) => k.id === dragEntry.kundeId);
    const echteVon = (dragEntry.investmentId && getInvestmentById(dragEntry.investmentId)?.pipelineStufe)
      || (kunde ? getEffectivePipelineStufe(kunde) : dragEntry.from);
    // Backoffice und Buchhaltung ziehen nur nach Abrechnung und Abgeschlossen.
    const nurAbschluss = ABSCHLUSS_NUR_ROLLEN.includes(user.role) && !ABSCHLUSS_STUFEN.includes(toKey);
    if (nurAbschluss || !darfAbschlussStufeWechseln(user.role, echteVon, toKey)) {
      setDragEntry(null);
      toast({ title: "Verschieben nicht möglich", description: ABSCHLUSS_HINWEIS, variant: "destructive" });
      return;
    }
    const fromLabel = (PIPELINE_STUFEN.find(s => s.key === dragEntry.from)?.label) || dragEntry.from;
    setMoveConfirm({ ...dragEntry, to: toKey as PipelineStufe, toLabel, fromLabel, step: "confirm" });
    setDragEntry(null);
  };

  const setStufeOnly = async (state: MoveDialogState) => {
    const { kundeId, investmentId, to } = state;
    // Die verschobene Kachel bleibt sichtbar, auch wenn die Zielspalte mehr
    // Kunden hat als das Sichtfenster zeigt. Sonst sieht ein Zug aus, als
    // waere die Kachel verschwunden.
    setZuletztVerschoben({ kundeId, investmentId });
    try {
      // Erst auf die Datenbank warten. Lehnt sie ab (Zeilenregel oder ein
      // Wächter wie bei Abrechnung und Abgeschlossen), meldet das der
      // Zwischenspeicher und stellt die Kachel zurück; dann kein „aktualisiert“.
      if (investmentId && !(await updateInvestment(investmentId, { pipelineStufe: to } as any))) return;
      try {
        await updateKontakt(kundeId, { pipelineStufe: to } as any);
      } catch {
        return;
      }

      /*
       * Sagen, wenn die Automatik den Zug wieder einholen wird.
       *
       * Die Automatik hat bewusst Vorrang: Sobald eine Reservierung
       * unterschrieben oder eine Bonitaet freigegeben ist, gehoert der Kunde
       * dorthin, unabhaengig davon, wohin ihn jemand gezogen hat. Bisher
       * geschah das aber stumm. Der Nutzer zog, die Karte sprang zurueck, und
       * es sah nach einem Fehler aus. Jetzt steht da, warum.
       */
      const kunde = getKontakte().find((k) => k.id === kundeId);
      const automatisch = kunde ? calculateLogicalPipelineStufe(kunde) : null;
      if (automatisch && automatisch !== to) {
        const autoLabel = PIPELINE_STUFEN.find((st) => st.key === automatisch)?.label || automatisch;
        toast({
          title: "Stufe gesetzt, die Automatik hat aber Vorrang",
          description:
            `${state.kundeName} steht weiterhin in „${autoLabel}", weil die Daten das ergeben ` +
            `(zum Beispiel unterschriebene Reservierung, freigegebene Bonität oder gesetzter Notartermin). ` +
            `Die Automatik wiegt schwerer als das manuelle Verschieben.`,
          duration: 9000,
        });
        return;
      }

      toast({ title: "Stufe aktualisiert ✓", description: `${state.kundeName}: ${state.fromLabel} → ${state.toLabel}` });
    } catch (e) {
      toast({ title: "Fehler beim Verschieben", variant: "destructive" });
    }
  };

  /**
   * Verschieben nach "Verloren" mit dem gewählten Grund abschließen.
   *
   * Bis zum 04.10.2026 setzte das Ziehen eines Investments in diese Spalte
   * immer den ganzen Kontakt auf verloren, auch wenn er noch ein zweites
   * Investment in Arbeit hatte. Jetzt nur dann, wenn kein anderes mehr läuft
   * (`kontaktGanzVerloren`).
   */
  const applyVerlust = async () => {
    if (!moveConfirm?.verlustGrundId) return;
    const { kundeId, investmentId, verlustGrundId, kundeName } = moveConfirm;
    setMoveConfirm(null);
    const verlorenAm = new Date().toISOString();
    try {
      if (investmentId) {
        if (!(await updateInvestment(investmentId, { pipelineStufe: "verloren" } as any))) return;
        setInvestmentMetaFields(investmentId, { verlorenGrund: verlustGrundId, verlorenAm });
      }
      const ganz = kontaktGanzVerloren(getInvestmentsByKontakt(kundeId), investmentId);
      if (ganz) {
        await updateKontakt(kundeId, {
          pipelineStufe: "verloren",
          status: "verloren" as any,
          verlorenGrund: verlustGrundId,
          verlorenAm,
        } as any);
      }
      toast({
        title: ganz ? "Als verloren markiert" : "Investment als verloren markiert",
        description: ganz
          ? `${kundeName}: ${verlustGrundLabel(verlustGrundId)}`
          : `${kundeName}: ${verlustGrundLabel(verlustGrundId)}. Der Kontakt bleibt aktiv, weil noch ein anderes Investment läuft.`,
        variant: "destructive",
      });
    } catch (e) {
      toast({ title: "Fehler beim Verschieben", variant: "destructive" });
    }
  };

  /*
   * Fehlen die Objektdaten, wird der Zug gestoppt statt danach zu fragen.
   *
   * Bis hierher stand an dieser Stelle ein Fenster, das die Adresse abfragte.
   * Damit gab es zwei Eingabestellen fuer dieselbe Angabe, und geaendert
   * werden konnte sie hinterher an keiner von beiden: Das Fenster erschien nur,
   * solange etwas fehlte.
   *
   * Jetzt gibt es genau eine Eingabestelle, naemlich das Investment selbst
   * unter "Objektauswahl". Die Pipeline fragt nichts mehr ab, sie zeigt nur an.
   * Der Hinweis blockiert den Zug aber weiterhin, denn ohne Objekt bleibt
   * hinterher offen, um welche Wohnung es ging, und die Gesamtsumme unter der
   * Spalte bleibt leer. Genau dagegen war das Fenster einmal gebaut worden.
   */
  const [objektHinweis, setObjektHinweis] = useState<{ state: MoveDialogState; invId?: string } | null>(null);

  const proceedConfirm = () => {
    if (!moveConfirm) return;
    // Stufen-spezifische Rückfragen
    if (moveConfirm.to === "verloren") {
      // Ohne Grund kein Verlust: Sonst fehlt die Angabe in der Auswertung.
      setMoveConfirm({ ...moveConfirm, step: "verlust_grund" });
      return;
    }
    if (moveConfirm.to === "beratungsgespraech") {
      setMoveConfirm({ ...moveConfirm, step: "bg_scheduled" });
      return;
    }
    if (moveConfirm.to === "selbstauskunft") {
      setMoveConfirm({ ...moveConfirm, step: "sa_filled" });
      return;
    }
    const invId = resolveInvestmentId(moveConfirm);
    /*
     * Nur die Stufen, die ohne feststehende Wohnung keinen Sinn ergeben.
     *
     * Ohne Investment gibt es keinen Ort fuer die Objektdaten. Automatisch
     * eines anzulegen waere der bequemere Weg, erzeugt aber Karteileichen.
     * Deshalb derselbe Hinweis wie beim Selbstauskunft-Versand weiter unten:
     * bitte zuerst im Kundenprofil eines anlegen.
     */
    if (stufeBrauchtObjektDaten(moveConfirm.to) && (!invId || objektDatenFehlen(invId))) {
      setObjektHinweis({ state: moveConfirm, invId });
      setMoveConfirm(null);
      return;
    }
    setStufeOnly(moveConfirm);
    setMoveConfirm(null);
  };

  const resolveInvestmentId = (state: MoveDialogState): string | undefined => {
    if (state.investmentId) return state.investmentId;
    const invs = getInvestmentsByKontakt(state.kundeId);
    const aktiv = invs.find(i => !["abgeschlossen","archiviert","verloren"].includes(String(i.pipelineStufe || "")));
    return (aktiv || invs[0])?.id;
  };

  const applyBgWithTermin = async () => {
    if (!moveConfirm) return;
    const { kundeId, bgDatum, bgUhrzeit } = moveConfirm;
    if (!bgDatum || !bgUhrzeit) {
      toast({ title: "Datum & Uhrzeit erforderlich", variant: "destructive" });
      return;
    }
    const invId = resolveInvestmentId(moveConfirm);
    if (!invId) {
      toast({ title: "Kein Investment vorhanden", description: "Bitte zuerst im Kundenprofil ein Investment anlegen.", variant: "destructive" });
      setMoveConfirm(null);
      return;
    }
    try {
      updateInvestment(invId, { pipelineStufe: "beratungsgespraech" } as any);
      setInvestmentMetaFields(invId, { beratungsgespraechAm: bgDatum, beratungsgespraechUhrzeit: bgUhrzeit } as any);
      // Erst den Termin in meta schreiben und den Zwischenspeicher nachziehen,
      // danach erst updateKontakt. Sonst baut updateKontakt das meta aus dem
      // alten Zwischenspeicher neu auf und loescht den Termin im selben Klick.
      await mergeKontaktMeta(kundeId, { beratungsgespraechAm: bgDatum, beratungsgespraechUhrzeit: bgUhrzeit });
      updateKontakt(kundeId, { pipelineStufe: "beratungsgespraech" } as any);
      toast({ title: "Beratungsgespräch eingetragen ✓", description: `${moveConfirm.kundeName}: ${bgDatum} um ${bgUhrzeit}` });
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setMoveConfirm(null);
    }
  };

  const handleSaAction = (mode: "online" | "senden") => {
    if (!moveConfirm) return;
    const invId = resolveInvestmentId(moveConfirm);
    // Stufe schon mal setzen
    setStufeOnly(moveConfirm);
    setMoveConfirm(null);
    if (mode === "online") {
      const qs = new URLSearchParams({ kundeId: moveConfirm.kundeId });
      if (invId) qs.set("investmentId", invId);
      qs.set("edit", "true");
      navigate(`/selbstauskunft?${qs.toString()}`);
    } else {
      if (!invId) {
        toast({ title: "Kein Investment vorhanden", description: "Bitte zuerst im Kundenprofil ein Investment anlegen.", variant: "destructive" });
        navigate(`/kunden/${moveConfirm.kundeId}`);
        return;
      }
      navigate(`/kunden/${moveConfirm.kundeId}?investment=${invId}&autoSendSA=${invId}`);
    }
  };

  // Ohne "aufgaben" und "follow_ups" hier merkt die Pipeline nicht, wenn eine
  // Aufgabe dazukommt oder die Tabelle nachgeladen wird. Die Kachel blieb dann
  // bei dem Datum stehen, das beim ersten Rendern bekannt war.
  //
  // `aktivitaeten` gehoert dazu, seit die Kachel ihre Termine nur noch einmal
  // sammelt und das Ergebnis behaelt (siehe KundeCard). `kontaktQuellen` liest
  // auch geplante Aufgaben und Meetings aus der Aktivitaetsliste; ohne diesen
  // Eintrag bliebe ein dort angelegter Termin auf der Kachel unsichtbar, bis
  // zufaellig etwas anderes die Seite neu zeichnet.
  const liveVersion = useLiveVersion(["kontakte", "investments", "aufgaben", "follow_ups", "aktivitaeten"]);
  const kontakte = useMemo(() => getKontakte(), [liveVersion]);
  // In der Pipeline stehen Kunden, und um Kunden kümmern sich Vertriebspartner,
  // Vertriebsleiter und Admins. Alle anderen Rollen, etwa Hausverwaltung,
  // Buchhaltung oder Objektpartner, hatten hier nie einen Kunden und haben die
  // Auswahl nur lang gemacht.
  const VERTRIEBS_ROLLEN = new Set(["vertriebspartner", "vertriebsleiter", "admin", "inhaber"]);
  // Der Filter arbeitet mit der Nutzer-ID, nicht mit dem Namen. Gefiltert wird
  // unten über `zustaendig_id`, und nur die ID ist eindeutig.
  /*
   * Die eigene Kennung kommt zuerst aus der Anmeldung, erst danach aus dem
   * Browserspeicher.
   *
   * Der Filter unten haengt an dieser Kennung. Fehlte sie, sah ein
   * Vertriebspartner eine vollstaendig leere Pipeline, also so, als waeren
   * alle seine Kunden verschwunden. Der Speicher ist dafuer keine verlaessliche
   * Quelle: Er ist im privaten Fenster leer, kann geleert werden und wird beim
   * Abmelden geloescht. `authUser` stammt direkt aus der Supabase-Sitzung und
   * ist dieselbe Kennung, die auch per RLS entscheidet. Dasselbe Muster nutzt
   * bereits das Analysetool.
   */
  const myUserId = authUser?.id || getCurrentUserId();

  /*
   * Das eigene Team, aus derselben Zuordnung wie Dashboard und Statistiken.
   * Für Rollen ohne Team bleibt die Menge leer, dann filtert die Pipeline wie
   * bisher ausschliesslich auf die eigene Kennung.
   */
  const teamVersion = useLiveVersion(["user_settings", "profiles", "bewerbungen"]);
  const teamIds = useMemo(
    () => (umfang === "team" ? teamMitgliederIds(myUserId) : new Set<string>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [umfang, myUserId, teamVersion],
  );

  /*
   * Die Auswahlliste oben. Wer das ganze Haus überblickt, sieht alle
   * Vertriebsrollen. Ein Vertriebsleiter sieht sich und sein Team, sonst
   * stünden im Dropdown Namen, deren Leads er anschliessend gar nicht
   * angezeigt bekommt.
   */
  const teamBerater = useMemo(
    () =>
      loadAllUsers()
        .filter(u => {
          const rollen = [u.rolle, ...(u.rollen || [])]
            .filter(Boolean)
            .map(r => String(r).toLowerCase());
          return rollen.some(r => VERTRIEBS_ROLLEN.has(r));
        })
        .filter(u => !!u.id && !!u.name)
        .filter(u => siehtGanzesHaus || u.id === myUserId || teamIds.has(u.id))
        .map(u => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siehtGanzesHaus, myUserId, teamIds, teamVersion],
  );

  /*
   * Solange die Kennung fehlt, wird gewartet statt eine leere Pipeline zu
   * behaupten. Ein Ladezustand ist ehrlich, eine leere Spaltenreihe waere eine
   * Falschmeldung. Wer das ganze Haus sieht, und ebenso der
   * Versicherungsexperte, filtert nicht ueber die eigene Kennung und ist davon
   * nicht betroffen. Ein Vertriebsleiter dagegen schon: Sein Team haengt an
   * seiner eigenen Kennung.
   */
  const wartetAufKennung = !myUserId && !siehtGanzesHaus && !isVExperte;

  const filteredKontakte = useMemo(() => {
    return kontakte.filter(k => {
      // Unzugewiesene Leads gehören in die Lead-Verwaltung, nicht in die Pipeline.
      //
      // Maßgeblich ist `zustaendig_id`, nicht das Freitextfeld `berater`. Nur die
      // ID entscheidet per RLS, wer den Lead sehen darf. Ein Name ohne ID weist
      // niemandem etwas zu, so ein Lead gehört zurück in den Pool.
      const zustaendigId = String(k.zustaendig_id || "").trim();
      if (!isVExperte && !zustaendigId) return false;
      // Versicherungsexperte: nur Vermögensaufbau-Leads
      if (isVExperte) {
        return getStufe(k) === "vermoegensaufbau" && k.versicherungGeeignet;
      }
      // Setterin sieht ausschließlich Leads, die sie selbst angelegt hat
      // (erstelltVonId === eigene User-ID). Synchron zur Lead-Verwaltung & "Meine Leads".
      if (isSetter) {
        if (!myUserId) return false;
        if (!k.erstelltVonId || k.erstelltVonId !== myUserId) return false;
        // Nur Lead-relevante Kontakte (Funnel/Setter)
        if (!k.leadTyp && !k.setter) return false;
      } else if (!siehtGanzesHaus && zustaendigId !== myUserId && !teamIds.has(zustaendigId)) {
        // Eigene Leads immer, dazu die des eigenen Teams. Für alle ohne Team
        // ist `teamIds` leer, für sie bleibt es bei den eigenen Leads.
        return false;
      }
      if (showArchived && !k.archiviert) return false;
      if (!showArchived && k.archiviert && getStufe(k) !== "archiviert") return false;
      // Show verloren/inaktiv leads in the "verloren" pipeline column even when not archived
      if (!showArchived && (k.status === "verloren" || k.status === "inaktiv") && getStufe(k) !== "verloren" && getStufe(k) !== "archiviert" && getStufe(k) !== "vermoegensaufbau") return false;
      if (isTeamLead && teamView === "individuell" && beraterFilter !== "alle") {
        // Der Filterwert ist die Nutzer-ID, damit er dieselbe Quelle nutzt wie
        // die Sichtbarkeit oben. Über den Namen wären Leads durchgefallen, die
        // eine Zuständigkeit, aber keinen Eintrag im Freitextfeld haben.
        if (zustaendigId !== beraterFilter) return false;
      }
      if (filter) {
        const q = filter.toLowerCase();
        const fullName = `${k.vorname} ${k.nachname}`.toLowerCase();
        const matches = fullName.includes(q) || k.berater.toLowerCase().includes(q) || (k.objekt || "").toLowerCase().includes(q) || (k.email || "").toLowerCase().includes(q) || (k.ort || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (statusFilter !== "alle") {
        if (getStufe(k) !== statusFilter) return false;
      }
      return true;
    });
  }, [kontakte, filter, statusFilter, beraterFilter, teamView, showArchived, isTeamLead, siehtGanzesHaus, teamIds, isSetter, isVExperte, myUserId]);

  const pipelineEntries = useMemo(() => buildPipelineEntries(filteredKontakte), [filteredKontakte, liveVersion]);

  // Virtuelle Spalte "Bestandskunden" – spiegelt die Sidebar-Liste 'Bestandskunden' wider.
  const bestandskundenEntries: PipelineEntry[] = useMemo(() => {
    return buildBucketEntries(filteredKontakte, "bestandskunden").map(e => ({
      kunde: e.kunde,
      stufe: "bestandskunden" as unknown as PipelineStufe,
      investmentId: e.investmentId,
      entryKey: e.investmentId ? `${e.kunde.id}__${e.investmentId}__bk` : `${e.kunde.id}__bk`,
    }));
  }, [filteredKontakte, liveVersion]);

  // Render-Reihenfolge: virtuelle "Bestandskunden"-Spalte direkt vor "Bestandskunden Import"
  const RENDER_STUFEN = useMemo(() => {
    const arr: { key: string; label: string }[] = [];
    for (const s of PIPELINE_STUFEN) {
      if (s.key === "bestandsimport") {
        arr.push({ key: "bestandskunden", label: "Bestandskunden" });
      }
      arr.push({ key: s.key, label: s.label });
    }
    return arr;
  }, []);

  /*
   * Einträge einmal nach Stufe sortieren statt je Spalte die ganze Liste zu
   * durchsuchen. Es gibt rund zwanzig Spalten, und `getEntriesForStufe` wurde
   * beim Zeichnen zweimal je Spalte aufgerufen (Kacheln oben, Summe unten).
   * Das waren vierzig Durchläufe über alle Einträge bei jedem Rendern.
   */
  const entriesJeStufe = useMemo(() => {
    const nachStufe = new Map<string, PipelineEntry[]>();
    for (const e of pipelineEntries) {
      const vorhanden = nachStufe.get(e.stufe);
      if (vorhanden) vorhanden.push(e);
      else nachStufe.set(e.stufe, [e]);
    }
    // Die virtuelle Spalte kommt aus einer eigenen Quelle und ueberschreibt
    // bewusst, genau wie vorher die Abfrage oben in getEntriesForStufe.
    nachStufe.set("bestandskunden", bestandskundenEntries);
    return nachStufe;
  }, [pipelineEntries, bestandskundenEntries]);

  const getEntriesForStufe = (stufe: string) => entriesJeStufe.get(stufe) || KEINE_EINTRAEGE;

  const totalInPipeline = pipelineEntries.length;
  const totalValue = filteredKontakte.reduce((sum, k) => sum + (k.kaufpreis || 0), 0);

  // Ein anderer Filter heisst andere Spalteninhalte. Dann wieder oben anfangen,
  // sonst zeigt eine Spalte nach dem Umschalten stillschweigend hundert Kacheln.
  useEffect(() => {
    setSichtbarJeStufe({});
  }, [filter, statusFilter, beraterFilter, teamView, showArchived]);

  /*
   * Ladezeiten-Protokoll der Pipeline, im selben Format wie dataCache.
   *
   * Zwei Zahlen, die vorher fehlten: wie lange der Aufbau der Seite bis zum
   * ersten Bild gedauert hat, und wie viele Kacheln dafuer tatsaechlich
   * gezeichnet wurden. Ohne die zweite Zahl laesst sich nicht unterscheiden,
   * ob auf Daten oder auf das Zeichnen gewartet wurde.
   */
  const aufbauBeginn = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const erstesBildGemeldet = useRef(false);
  const gezeichneteKacheln = useMemo(
    () =>
      RENDER_STUFEN.reduce((summe, s) => {
        const anzahl = (entriesJeStufe.get(s.key) || KEINE_EINTRAEGE).length;
        return summe + Math.min(anzahl, sichtbarJeStufe[s.key] ?? KACHELN_JE_SPALTE);
      }, 0),
    [RENDER_STUFEN, entriesJeStufe, sichtbarJeStufe],
  );
  useEffect(() => {
    if (!cacheReady || wartetAufKennung || erstesBildGemeldet.current) return;
    erstesBildGemeldet.current = true;
    const dauer = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - aufbauBeginn.current);
    ladezeitLoggen(
      `Pipeline: erstes Bild nach ${dauer} ms ab Seitenaufbau, ${gezeichneteKacheln} von ${totalInPipeline} Kacheln gezeichnet, Zusatzangaben ${zusatzBereit ? "schon da" : "folgen"}`,
    );
  }, [cacheReady, wartetAufKennung, gezeichneteKacheln, totalInPipeline, zusatzBereit]);

  const zusatzGemeldet = useRef(false);
  useEffect(() => {
    if (!zusatzBereit || zusatzGemeldet.current) return;
    zusatzGemeldet.current = true;
    const dauer = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - aufbauBeginn.current);
    ladezeitLoggen(`Pipeline: Aufgaben und Follow-ups nach ${dauer} ms, Kacheln vollständig`);
  }, [zusatzBereit]);

  return (
    <DashboardLayout>
      {/*
        Die Seite fuellt genau den Inhaltsbereich (`h-full`), statt ihre Hoehe
        selbst auszurechnen. Vorher stand hier `calc(100vh-7rem)`: 112 Pixel
        Abzug, gebraucht wurden aber 128 (Kopfleiste 80, Abstand oben und unten
        je 24), mit Liquid Glass 122, und jedes Banner oder jede Leiste oben
        kam noch dazu. Die Seite war damit immer hoeher als der Platz, der
        Inhaltsbereich scrollte, und die Summenleiste unten lag ausserhalb des
        Fensters. `h-full` richtet sich nach dem, was tatsaechlich frei ist.
        `min-h-[26rem]` haelt das Board auf sehr flachen Fenstern benutzbar,
        dann scrollt eben die Seite.
      */}
      <div className="flex flex-col h-full min-h-[26rem]">
        <div className="space-y-6 flex-shrink-0">
          <PageHeader title="Kunden-Pipeline" />
          <p className="text-[11px] text-muted-foreground -mt-3 flex items-center gap-1.5">
            <Info className="h-3 w-3" /> Tipp: Kunden-Kacheln können per Drag &amp; Drop zwischen den Stufen verschoben werden. Vor jedem Verschieben kommt eine Rückfrage.
          </p>

          {/* Filter Bar – kompakt: Team/Partner als ein einziges Dropdown */}
          <div data-ui="card" className="bg-card rounded-lg border p-3 sm:p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {isTeamLead ? (
                  <Select
                    value={teamView === "gesamt" ? "__gesamt__" : (beraterFilter && beraterFilter !== "alle" ? beraterFilter : "__alle__")}
                    onValueChange={(v) => {
                      if (v === "__gesamt__") { setTeamView("gesamt"); setBeraterFilter("alle"); }
                      else if (v === "__alle__") { setTeamView("individuell"); setBeraterFilter("alle"); }
                      else { setTeamView("individuell"); setBeraterFilter(v); }
                    }}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[180px] text-xs sm:text-sm gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <SelectValue placeholder="Team / Partner wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__gesamt__">Ganzes Team</SelectItem>
                      <SelectItem value="__alle__">Alle Partner (einzeln)</SelectItem>
                      {teamBerater.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> Meine Kunden
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {/* Solange geladen wird, waere „0 Kunden" eine Falschmeldung. */}
                {cacheReady && !wartetAufKennung && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs">{totalInPipeline} Kunden</Badge>
                )}
                {totalValue > 0 && <Badge variant="outline" className="text-[10px] sm:text-xs">Σ <span className={unscharfKlasse()}>{formatEuro(totalValue)}</span></Badge>}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[160px] sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="w-full sm:w-52 h-8 pl-8 text-xs sm:text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name, Vertriebspartner..." />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-auto min-w-[120px] h-8 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Stufen</SelectItem>
                  {/* stufenFilterLabel unterscheidet die beiden Follow-Up-Stufen. */}
                  {PIPELINE_STUFEN.map(s => <SelectItem key={s.key} value={s.key}>{stufenFilterLabel(s.key)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Checkbox id="archiv" checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)} />
                <label htmlFor="archiv" className="text-xs sm:text-sm flex items-center gap-1"><Archive className="h-3.5 w-3.5" /> Nur Archivierte</label>
              </div>
            </div>
          </div>
        </div>

        {/*
          Kanban-Board: ein waagerechter Scrollbereich, darin oben die Spalten
          und unten die Summenleiste. Senkrecht scrollt jede Spalte ihre Karten
          selbst; die Summenleiste steht ausserhalb davon und bleibt deshalb
          immer sichtbar. Waagerecht laufen beide gemeinsam, so bleibt jede
          Summe unter ihrer Spalte.

          Die `min-h-0` sind noetig: Ohne sie weigert sich ein Flex-Element,
          unter die Hoehe seines Inhalts zu schrumpfen. Das Board wurde dann so
          hoch wie die laengste Spalte, und die Summen rutschten nach unten weg.

          Geblaettert wird allein mit der Scrollleiste dieses Bereichs (Aussehen
          in `index.css`, fuer das ganze CRM gleich). Bis zum 25.09.2026 stand
          darunter noch ein eigener Schieberegler (`input type="range"`), der
          dasselbe tat; Christian sah zwei Regler uebereinander. Ziehen mit der
          Maus, Trackpad, Shift mit Mausrad und Wischen auf dem Handy erledigt
          die Scrollleiste von selbst.
          `overscroll-x-contain`: Am linken Rand loeste ein Wischen auf dem
          Trackpad sonst „Zurueck" im Browser aus.
        */}
        <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain flex-1 min-h-0 mt-4" id="pipeline-scroll">
          <div className="min-w-max flex flex-col h-full min-h-0">
            <div data-pruefung="pipeline-spalten" className="flex gap-4 flex-1 min-h-0">
              {!cacheReady || wartetAufKennung ? (
                PIPELINE_STUFEN.slice(0, 6).map((stufe) => (
                  <div key={stufe.key} className="w-56 flex-shrink-0 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <Skeleton className="w-2 h-2 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="border rounded-lg p-3 bg-card space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
              RENDER_STUFEN.map((stufe) => {
                const entries = getEntriesForStufe(stufe.key);
                // Gezeichnet wird nur das Sichtfenster (siehe
                // pipelineSichtfenster.ts). Die Anzahl im Spaltenkopf
                // bleibt bewusst `entries.length`, also die Gesamtzahl.
                const sichtbar = sichtbarJeStufe[stufe.key] ?? KACHELN_JE_SPALTE;
                const gezeigt = sichtfenster(entries, sichtbar, zuletztVerschoben);
                const isBlurred = isVExperte && stufe.key !== "vermoegensaufbau";
                const isDropTarget = dragOverStufe === stufe.key && dragEntry && dragEntry.from !== stufe.key;
                /*
                  Spaltenkopf und Trennstriche (Christian, 25.09.2026): Der
                  Kopf steht frei auf dem Seitenhintergrund, ohne helles
                  Kaestchen dahinter. Das Info-Symbol folgt direkt auf den
                  Namen. Rechtsbuendig steht die Anzahl als reine Zahl, ohne
                  „Leads" (zweite Runde am selben Tag: unten in der
                  Summenleiste steht nur noch die Gesamtsumme).
                  Zwischen zwei Stufen laeuft ein leichter senkrechter Strich
                  mitten in der Luecke (`gap-4`, also 8px links der Spalte),
                  vom Kopf bis zur Summenleiste. Die erste Spalte hat keinen.
                  Der Kopf klebte vorher mit `sticky top-0` und deckender
                  Flaeche; gescrollt wird aber nur die Kartenliste darunter,
                  geklebt hat er also nie.
                */
                return (
                  <div
                    key={stufe.key}
                    data-pruefung="pipeline-spalte"
                    data-stufe={stufe.key}
                    className={`relative w-56 flex-shrink-0 flex flex-col min-h-0 rounded-md transition-colors before:pointer-events-none before:absolute before:inset-y-0 before:-left-2 before:w-px before:bg-border/60 first:before:hidden ${isBlurred ? "select-none pointer-events-none" : ""} ${isDropTarget ? "ring-2 ring-primary bg-primary/5" : ""}`}
                    onDragOver={(e) => {
                      if (!dragEntry || isBlurred) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverStufe !== stufe.key) setDragOverStufe(stufe.key);
                    }}
                    onDragLeave={() => { if (dragOverStufe === stufe.key) setDragOverStufe(null); }}
                    onDrop={(e) => { e.preventDefault(); handleDropOnStufe(stufe.key, stufe.label); }}
                  >
                    <div data-pruefung="pipeline-kopf" className={`flex items-center gap-2 mb-3 py-2 ${isBlurred ? "blur-[3px] opacity-40" : ""}`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${headerColor(stufe.key)}`} />
                      <h3 className="font-semibold text-sm">{stufe.label}</h3>
                      {STUFEN_ERKLAERUNG[stufe.key] && (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="-ml-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors" aria-label={`Logik-Hinweis ${stufe.label}`}>
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                              <p className="font-semibold mb-1">{stufe.label}</p>
                              <p>{STUFEN_ERKLAERUNG[stufe.key]}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <span data-pruefung="pipeline-anzahl" className="ml-auto shrink-0 pl-1 text-xs text-muted-foreground tabular-nums">
                        {entries.length}
                      </span>
                    </div>
                    <div
                      data-pruefung="pipeline-karten"
                      className={`space-y-2 flex-1 min-h-0 overflow-y-auto pr-1 ${isBlurred ? "blur-[4px] opacity-30" : ""}`}
                      onScroll={(e) => {
                        // Nachladen beim Scrollen: sobald das Ende der Spalte
                        // in Sicht kommt, kommt der naechste Schwung dazu.
                        if (gezeigt.length >= entries.length) return;
                        const el = e.currentTarget;
                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) mehrZeigen(stufe.key);
                      }}
                    >
                      {gezeigt.map((entry) => (
                        <KundeCard
                          key={entry.entryKey}
                          kunde={entry.kunde}
                          stufe={stufe.key as PipelineStufe}
                          investmentId={entry.investmentId}
                          zusatzBereit={zusatzBereit}
                          datenstand={liveVersion}
                          onClick={() => !isBlurred && navigate(entry.investmentId ? `/kunden/${entry.kunde.id}?investment=${entry.investmentId}` : `/kunden/${entry.kunde.id}`)}
                          onDragStartCard={(e) => {
                            if (isBlurred) { e.preventDefault(); return; }
                            try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", entry.entryKey); } catch {}
                            setDragEntry({
                              kundeId: entry.kunde.id,
                              kundeName: `${entry.kunde.vorname} ${entry.kunde.nachname}`.trim(),
                              investmentId: entry.investmentId,
                              from: stufe.key as PipelineStufe,
                            });
                          }}
                        />
                      ))}
                      {gezeigt.length < entries.length && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => mehrZeigen(stufe.key)}
                        >
                          Weitere {Math.min(KACHELN_JE_SPALTE, entries.length - gezeigt.length)} anzeigen
                        </Button>
                      )}
                      {entries.length === 0 && (
                        <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">Keine Kunden</div>
                      )}
        </div>
      </div>
                );
              })
              )}
            </div>

            {/* Summenleiste: ab der Objektauswahl je Spalte „Gesamt: … €",
                davor ein leerer Platzhalter in Spaltenbreite (die Anzahl
                steht oben im Spaltenkopf).
                Die Summe steht nur unter den Spalten ab der Objektauswahl:
                Erst dort steht das Objekt fest (der Objektdaten-Dialog
                erzwingt Adresse, Einheit und Kaufpreis). Davor waere die
                Zahl nur die Summe von Potenzialwerten aus Kontakt und
                Funnel und sah wie ein echtes Volumen aus (aufgefallen an
                650.000 Euro unter der Selbstauskunft-Spalte, 30.08.2026).
                Aus demselben Grund zaehlt hier ausschliesslich der
                Kaufpreis am Investment, ohne Kontaktwert-Rueckfall.
                Waehrend des Ladens steht sie nicht da: „Gesamt: 0 €" waere
                dann eine Falschmeldung.
                Unten ohne Innenabstand: Direkt darunter folgt die
                Scrollleiste, und deren Unterkante liegt auf der Hoehe der
                Seitenleiste (Regel in `index.css`, Christian 25.09.2026). */}
            {cacheReady && !wartetAufKennung && (
              <PipelineSummenLeiste
                className="mt-2 pt-2 border-t border-border/60"
                spalten={RENDER_STUFEN.map((stufe): SummenSpalte => {
                  const isBlurred = isVExperte && stufe.key !== "vermoegensaufbau";
                  if (!GESAMT_STUFEN.has(stufe.key)) {
                    return { key: stufe.key, label: stufe.label, summe: null, gedimmt: isBlurred };
                  }
                  const entries = getEntriesForStufe(stufe.key);
                  // Kaufpreis je Investment, nicht je Kontakt: Jede Karte steht fuer ein
                  // Investment, der Kontaktwert existiert aber nur einmal. Ein Kunde mit
                  // zwei Immobilien zaehlte damit zweimal denselben Betrag.
                  const total = entries.reduce(
                    (s, e) => s + (investmentKaufpreis(e.investmentId) || 0), 0,
                  );
                  return { key: stufe.key, label: stufe.label, summe: total, gedimmt: isBlurred };
                })}
              />
            )}
          </div>
        </div>
        {/* Bewusst kein Sonderabstand fuer die Lovable-Vorschau (Christian,
            25.09.2026). Bis dahin stand hier ein 56px hoher Platzhalter, damit
            der schwebende Bearbeitungsbalken von Lovable nichts verdeckt. Er
            schob die Scrollleiste aber genau dort nach oben, wo Christian
            testet, und die Leiste fluchtete nicht mehr mit der Seitenleiste.
            Der Balken darf ueber der Scrollleiste schweben; die Unterkante
            steht ueberall gleich (`--seitenleiste-abstand-unten`). */}
      </div>
      <AlertDialog open={!!moveConfirm} onOpenChange={(o) => { if (!o) setMoveConfirm(null); }}>
        <AlertDialogContent>
          {moveConfirm && moveConfirm.step === "confirm" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Pipeline-Stufe ändern?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    <strong>{moveConfirm.kundeName}</strong> von <strong>{moveConfirm.fromLabel}</strong> nach <strong>{moveConfirm.toLabel}</strong> verschieben?
                    <div className="text-xs text-muted-foreground mt-2">Hinweis: Automatische Trigger (E-Mails, Aufgaben) werden dadurch NICHT ausgelöst. Nur die Stufe wird manuell gesetzt.</div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={proceedConfirm}>Weiter</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {moveConfirm && moveConfirm.step === "verlust_grund" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Warum ist der Lead verloren?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{moveConfirm.kundeName}</strong> wird auf „Verloren" gesetzt. Der Grund
                  ist Pflicht, sonst fehlt er später in der Auswertung.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2 max-h-[55vh] overflow-y-auto pr-1">
                <VerlustGrundAuswahl
                  wert={moveConfirm.verlustGrundId || ""}
                  onChange={(grundId) => setMoveConfirm({ ...moveConfirm, verlustGrundId: grundId })}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!moveConfirm.verlustGrundId}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={applyVerlust}
                >
                  Als verloren markieren
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {moveConfirm && moveConfirm.step === "bg_scheduled" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Beratungsgespräch bereits vereinbart?</AlertDialogTitle>
                <AlertDialogDescription>
                  Wurde für <strong>{moveConfirm.kundeName}</strong> bereits ein konkreter Beratungstermin (Datum und Uhrzeit) über den Buchungskalender vereinbart?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <Button variant="outline" onClick={() => { setStufeOnly(moveConfirm); setMoveConfirm(null); }}>Ja — nur Stufe setzen</Button>
                <AlertDialogAction onClick={() => setMoveConfirm({ ...moveConfirm, step: "bg_input" })}>Nein — Termin eintragen</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {moveConfirm && moveConfirm.step === "bg_input" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Beratungsgespräch-Termin</AlertDialogTitle>
                <AlertDialogDescription>
                  Termin für <strong>{moveConfirm.kundeName}</strong> eintragen. Wird im zugehörigen Investment gespeichert.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Datum</label>
                  <Input type="date" value={moveConfirm.bgDatum || ""} onChange={(e) => setMoveConfirm({ ...moveConfirm, bgDatum: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Uhrzeit</label>
                  <Input type="time" value={moveConfirm.bgUhrzeit || ""} onChange={(e) => setMoveConfirm({ ...moveConfirm, bgUhrzeit: e.target.value })} />
                </div>
                <p className="text-[11px] text-muted-foreground">Bitte sicherstellen, dass der Termin über den eigenen Buchungskalender gebucht wurde. Nur so bekommt der Kunde die Terminbestätigung samt Meeting-Link automatisch.</p>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={applyBgWithTermin}>Speichern &amp; Stufe setzen</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {moveConfirm && moveConfirm.step === "sa_filled" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Selbstauskunft bereits ausgefüllt?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hat <strong>{moveConfirm.kundeName}</strong> die Selbstauskunft bereits vollständig ausgefüllt?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <Button variant="outline" onClick={() => { setStufeOnly(moveConfirm); setMoveConfirm(null); }}>Ja — nur Stufe setzen</Button>
                <AlertDialogAction onClick={() => setMoveConfirm({ ...moveConfirm, step: "sa_action" })}>Nein — SA starten</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {moveConfirm && moveConfirm.step === "sa_action" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Wie soll die Selbstauskunft ausgefüllt werden?</AlertDialogTitle>
                <AlertDialogDescription>
                  Wähle, ob du die Online-SA gemeinsam mit dem Kunden ausfüllst oder ob der Kunde den Link per E-Mail erhalten soll. Die Stufe wird in beiden Fällen auf „Selbstauskunft" gesetzt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <Button variant="outline" onClick={() => handleSaAction("online")}>Online mit Kunde ausfüllen</Button>
                <AlertDialogAction onClick={() => handleSaAction("senden")}>SA an Kunde senden</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/*
        Blockierender Hinweis statt Abfrage.

        Der Zug geht erst, wenn das Objekt im Investment steht. Der Knopf
        springt genau dorthin, mit der Kennung des Investments, um das es
        geht, damit bei mehreren Investments nicht das falsche geoeffnet wird.
      */}
      <AlertDialog open={!!objektHinweis} onOpenChange={(o) => { if (!o) setObjektHinweis(null); }}>
        <AlertDialogContent>
          {objektHinweis && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Zuerst das Objekt eintragen</AlertDialogTitle>
                <AlertDialogDescription>
                  {objektHinweis.invId ? (
                    <>
                      Für die Stufe „{objektHinweis.state.toLabel}" muss feststehen, welche Wohnung
                      {" "}{objektHinweis.state.kundeName} kauft und zu welchem Preis. Sonst bleibt später offen,
                      um welches Objekt es ging, und die Gesamtsumme unter der Spalte zählt den Vorgang nicht mit.
                      <br /><br />
                      Eingetragen wird das im Kundenprofil, im Reiter dieses Investments unter „Objektauswahl".
                      Danach lässt sich die Karte verschieben.
                    </>
                  ) : (
                    <>
                      {objektHinweis.state.kundeName} hat noch kein Investment. Objekt, Adresse und Kaufpreis
                      hängen immer an einem Investment, deshalb muss zuerst eines angelegt werden.
                      Das geht im Kundenprofil.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const ziel = objektHinweis.invId
                      ? `/kunden/${objektHinweis.state.kundeId}?investment=${objektHinweis.invId}#objektauswahl`
                      : `/kunden/${objektHinweis.state.kundeId}`;
                    setObjektHinweis(null);
                    navigate(ziel);
                  }}
                >
                  {objektHinweis.invId ? "Zum Investment" : "Zum Kundenprofil"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
