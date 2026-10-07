/**
 * Der Bereich „Handbuch-Seite“ der Lead-Verwaltung (seit dem 26.09.2026).
 *
 * Alle Leads der allgemeinen Handbuch-Seite ohne Partnerkürzel, schon direkt
 * nach dem Konfigurator. Je Zeile: Name mit Beruf und Start, Quelle mit dem
 * Kanal aus der Kampagnenkennung, Rahmen mit Ausgang, der höchste erreichte
 * Stand im Trichter, wie lange der Lead liegt, und die Knöpfe „Zuweisen“ und
 * Papierkorb. Leads mit Selbstauskunft stehen hervorgehoben.
 *
 * Der Stand kommt aus `handbuch_lead_staende` (Migration 20260926180000);
 * ohne Migration aus dem Kontakt selbst, dann höchstens „Handbuch erhalten“.
 */
import { useEffect, useMemo, useState } from "react";
import { FileCheck2, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";
import type { KundeData } from "@/lib/kundenStore";
import { kanalText } from "@/lib/handbuch/wege";
import {
  ausgangText,
  konfiguratorAngabenFuerKontakt,
  ladeLeadStaende,
  LEAD_STUFE_TEXT,
  leadStufe,
  liegtSeitText,
  rahmenKurz,
  type LeadStandZeile,
  type LeadStufe,
  type StandLaden,
} from "@/lib/handbuch/leadStand";
import { antwortText, type Ausgang } from "../../../supabase/functions/_shared/handbuch-funnel.ts";

const START_KURZ: Record<string, string> = {
  sofort: "Start so bald wie möglich",
  drei_monate: "Start in 3 Monaten",
  spaeter: "Start später",
  informieren: "informiert sich erst",
};

export const AUSGANG_PILLE: Record<Ausgang, string> = {
  passt: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  vielleicht: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  noch_nicht: "bg-muted text-muted-foreground",
};

export const STUFE_PILLE: Record<LeadStufe, string> = {
  erhalten: "bg-muted text-foreground",
  sa_angefragt: "bg-muted text-foreground",
  gelesen: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  pdf: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  sa_begonnen: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  sa_liegt_vor: "bg-primary text-primary-foreground",
};

function Pille({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>{children}</span>;
}

function zeitText(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Wie oft der Stand bei offenem Tab von selbst nachgeladen wird. */
export const STAND_NEU_LADEN_MS = 2 * 60 * 1000;

interface Props {
  leads: KundeData[];
  laedt: boolean;
  /** Zählt bei jedem Klick auf „Aktualisieren“ hoch, dann wird der Stand neu geladen. */
  aktualisierung?: number;
  zuweisenErlaubt: boolean;
  loeschenErlaubt: boolean;
  onOeffnen: (k: KundeData) => void;
  onZuweisen: (k: KundeData) => void;
  onLoeschen: (k: KundeData) => void;
}

/**
 * Der Stand (gelesen, PDF, Selbstauskunft) für diese Leads, frisch gehalten.
 * Genutzt von dieser Tabelle und seit dem 01.10.2026 von der gemeinsamen
 * Liste der Lead-Verwaltung.
 */
export function useHandbuchLeadStand(leads: { id: string }[], aktualisierung = 0): StandLaden | null {
  const ids = useMemo(() => leads.map((k) => k.id).sort().join(","), [leads]);
  const [stand, setStand] = useState<StandLaden | null>(null);
  /*
   * Der Stand (gelesen, PDF, Selbstauskunft) ändert sich, ohne dass sich die
   * Liste der Leads ändert. Bis zum 26.09.2026 wurde er nur beim Wechsel der
   * Liste geladen und blieb sonst veraltet, auch nach „Aktualisieren“. Jetzt
   * zusätzlich: auf „Aktualisieren“, alle zwei Minuten bei sichtbarem Tab und
   * beim Zurückkehren in den Tab.
   */
  const [takt, setTakt] = useState(0);
  useEffect(() => {
    const weiter = () => {
      if (document.visibilityState === "visible") setTakt((t) => t + 1);
    };
    const uhr = window.setInterval(weiter, STAND_NEU_LADEN_MS);
    document.addEventListener("visibilitychange", weiter);
    return () => {
      window.clearInterval(uhr);
      document.removeEventListener("visibilitychange", weiter);
    };
  }, []);
  useEffect(() => {
    let ab = false;
    const liste = ids ? ids.split(",") : [];
    ladeLeadStaende(liste).then((r) => {
      // Ein kurzer Aussetzer beim Nachladen soll den bekannten Stand nicht wegwerfen.
      if (!ab) setStand((vorher) => (r.status === "fehler" && vorher?.status === "ok" ? vorher : r));
    });
    return () => {
      ab = true;
    };
  }, [ids, aktualisierung, takt]);
  return stand;
}

/**
 * Konfigurator-Stand kompakt für eine Zeile der gemeinsamen Lead-Liste:
 * Rahmen mit Ausgang und der höchste erreichte Stand. Ohne Handbuch nichts.
 */
export function HandbuchStandKurz({ kontakt, stand }: { kontakt: KundeData; stand: StandLaden | null }) {
  const angaben = konfiguratorAngabenFuerKontakt(kontakt);
  if (!angaben.ausHandbuch) return null;
  const z = stand?.status === "ok" ? stand.zeilen.get(kontakt.id) ?? null : null;
  const stufe = leadStufe(angaben, z);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-testid="handbuch-stand">
      {angaben.rahmen ? (
        <span className="text-xs font-bold tabular-nums">{rahmenKurz(angaben.rahmen)}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{angaben.nurSelbstauskunft ? "Offene Selbstauskunft" : "ohne Konfigurator"}</span>
      )}
      {angaben.ausgang && <Pille className={AUSGANG_PILLE[angaben.ausgang]}>{ausgangText(angaben.ausgang)}</Pille>}
      <Pille className={STUFE_PILLE[stufe]}>{LEAD_STUFE_TEXT[stufe]}</Pille>
      {stufe === "sa_liegt_vor" && z?.saPdfImInvestment && <span className="text-xs text-muted-foreground">PDF im Investment</span>}
    </div>
  );
}

export default function HandbuchLeadTabelle({ leads, laedt, aktualisierung = 0, zuweisenErlaubt, loeschenErlaubt, onOeffnen, onZuweisen, onLoeschen }: Props) {
  const stand = useHandbuchLeadStand(leads, aktualisierung);

  const zeilen = useMemo(
    () =>
      leads
        .map((k) => {
          const angaben = konfiguratorAngabenFuerKontakt(k);
          const z: LeadStandZeile | null = stand?.status === "ok" ? stand.zeilen.get(k.id) ?? null : null;
          return { k, angaben, z, stufe: leadStufe(angaben, z) };
        })
        // Die Wartenden zuerst: wer die Selbstauskunft schon hat, dann nach Alter.
        .sort((a, b) => {
          const sa = Number(b.stufe === "sa_liegt_vor") - Number(a.stufe === "sa_liegt_vor");
          if (sa !== 0) return sa;
          return String(a.k.erstellt_am || "").localeCompare(String(b.k.erstellt_am || ""));
        }),
    [leads, stand],
  );
  const mitSa = zeilen.filter((z) => z.stufe === "sa_liegt_vor").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Leads der allgemeinen Handbuch-Seite, ohne Partner. Leads über einen Partnerlink stehen direkt beim Partner.</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
          {mitSa} mit Selbstauskunft
        </span>
      </div>
      {stand?.status === "migration" && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
          Der genaue Stand (gelesen, PDF, Selbstauskunft) erscheint, sobald die Migration 20260926180000 gelaufen ist. Bis dahin steht hier der Stand aus dem Kontakt.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Quelle</TableHead>
            <TableHead>Rahmen</TableHead>
            <TableHead>Stand</TableHead>
            <TableHead>Liegt seit</TableHead>
            <TableHead className="text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {laedt ? (
            <TableRow>
              <TableCell colSpan={6}>
                <TableSkeleton columns={6} rows={4} />
              </TableCell>
            </TableRow>
          ) : zeilen.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                Keine offenen Leads von der Handbuch-Seite.
              </TableCell>
            </TableRow>
          ) : (
            zeilen.map(({ k, angaben, z, stufe }) => {
              const hervor = stufe === "sa_liegt_vor";
              const a = angaben.antworten;
              const unter = angaben.nurSelbstauskunft
                ? "Offene Selbstauskunft"
                : [a ? antwortText("beruf", a.beruf) : "", a ? START_KURZ[a.start] ?? "" : ""].filter(Boolean).join(", ");
              return (
                <TableRow
                  key={k.id}
                  className={cn("cursor-pointer hover:bg-muted/50", hervor && "bg-primary/5 outline outline-2 -outline-offset-2 outline-primary/60")}
                  onClick={() => onOeffnen(k)}
                >
                  <TableCell>
                    <div className="text-sm font-semibold">
                      {k.vorname} {k.nachname}
                    </div>
                    <div className="text-xs text-muted-foreground">{unter}</div>
                    <div className="text-xs text-muted-foreground">{zeitText(angaben.zeitpunkt || k.erstellt_am)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">Konfigurator</div>
                    <div className="text-xs text-muted-foreground">{kanalText(angaben.kampagne)}</div>
                  </TableCell>
                  <TableCell>
                    {angaben.rahmen ? (
                      <>
                        <div className="text-sm font-bold tabular-nums">{rahmenKurz(angaben.rahmen)}</div>
                        {angaben.ausgang && <Pille className={AUSGANG_PILLE[angaben.ausgang]}>{ausgangText(angaben.ausgang)}</Pille>}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">ohne Konfigurator</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Pille className={STUFE_PILLE[stufe]}>{LEAD_STUFE_TEXT[stufe]}</Pille>
                    {hervor && z?.saPdfImInvestment && <div className="mt-0.5 text-xs text-muted-foreground">PDF im Investment</div>}
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{liegtSeitText(k.erstellt_am)}</span>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {zuweisenErlaubt && (
                        <Button size="sm" variant={hervor ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => onZuweisen(k)}>
                          <UserPlus className="h-3.5 w-3.5" /> Zuweisen
                        </Button>
                      )}
                      {loeschenErlaubt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          aria-label={`${k.vorname} ${k.nachname} in den Papierkorb`}
                          onClick={() => onLoeschen(k)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/** Die Angaben aus dem Konfigurator kurz, für den Zuweisen-Dialog. Ohne Konfigurator nichts. */
export function KonfiguratorKurz({ kontakt }: { kontakt: KundeData }) {
  const angaben = konfiguratorAngabenFuerKontakt(kontakt);
  if (!angaben.ausHandbuch) return null;
  const a = angaben.antworten;
  return (
    <div className="space-y-2 rounded-lg border border-primary/10 bg-primary/5 p-3">
      <p className="text-xs font-semibold text-primary">Aus dem Konfigurator</p>
      {angaben.rahmen ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">Rahmen {rahmenKurz(angaben.rahmen)}</span>
          {angaben.ausgang && <Pille className={AUSGANG_PILLE[angaben.ausgang]}>{ausgangText(angaben.ausgang)}</Pille>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Kam über die offene Selbstauskunft, ohne Konfigurator.</p>
      )}
      {a && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {(["ziel", "beruf", "brutto", "ueberschuss", "eigenkapital", "start"] as const).map((f) => (
            <div key={f}>
              <span className="text-muted-foreground">{FELD_TEXT[f]}: </span>
              {antwortText(f, a[f])}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const FELD_TEXT: Record<"ziel" | "beruf" | "brutto" | "ueberschuss" | "eigenkapital" | "start", string> = {
  ziel: "Ziel",
  beruf: "Beruf",
  brutto: "Jahresbrutto",
  ueberschuss: "Überschuss",
  eigenkapital: "Eigenkapital",
  start: "Start",
};
