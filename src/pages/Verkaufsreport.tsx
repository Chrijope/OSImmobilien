import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer, Plus, Send, Undo2, Trash2, Save, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import { confirmDialog } from "@/lib/confirm";
import { getInvestments, kaufpreisAusMeta } from "@/lib/investmentsStore";
import { getObjekte } from "@/lib/objekteStore";
import { ladeEinreichungen } from "@/lib/finanzierungEinreichung";
import { tagDe } from "@/lib/notarFristen";
import {
  CRM_SPALTEN, SPALTEN, baueStand, betrag, datumIso, istAktuellesFormat, kennzahlen, ladeStaende, legeStandAn,
  loescheStand, salescycle, speichereDaten, veroeffentliche, wert,
  type ReportVorgang, type ReportZeile, type SpaltenKey, type VerkaufsreportDaten, type VerkaufsreportStand,
} from "@/lib/verkaufsreport";

/**
 * Verkaufsreport (Christian, 27.10.2026), Aufbau wie die Excel. Admin und
 * Inhaber erstellen Staende, ergaenzen die gelben Felder von Hand und
 * veroeffentlichen; Geschaeftspartner sehen nur veroeffentlichte Staende.
 * Rechnung und Regeln: `src/lib/verkaufsreport.ts`.
 */

const eur = (v: number | null) => v === null ? "–" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const tag = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("de-DE");
const prozent = (q: number | null) => q === null ? "–" : `${Math.round(q * 100)} %`;
const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Zellwert lesbar: Datum als TT.MM.JJJJ, Kaufpreis in Euro, sonst wie eingetragen. */
function anzeige(k: SpaltenKey, w: string): string {
  if (!w) return "";
  if (k === "kaufpreis") return betrag(w) === null ? w : eur(betrag(w));
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(w) ? datumIso(w) : null;
  return iso ? tagDe(iso) : w;
}

export default function Verkaufsreport() {
  const { user } = useUser();
  const leitung = user.role === "admin" || user.role === "inhaber";
  const [staende, setStaende] = useState<VerkaufsreportStand[] | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<VerkaufsreportDaten | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const laden = useCallback(() => {
    ladeStaende().then((liste) => {
      setStaende(liste);
      setGewaehlt((alt) => (alt && liste.some((s) => s.id === alt) ? alt : liste[0]?.id ?? null));
    }).catch((f) => {
      console.error("[Verkaufsreport]", f);
      toast.error("Der Verkaufsreport konnte nicht geladen werden.");
      setStaende([]);
    });
  }, []);
  useEffect(laden, [laden]);

  const stand = staende?.find((s) => s.id === gewaehlt) || null;
  // Ungespeicherte Eingaben gehoeren zum gewaehlten Stand; beim Wechsel weg.
  useEffect(() => setEntwurf(null), [gewaehlt]);

  const ausfuehren = async (aktion: () => Promise<void>, meldung: string): Promise<boolean> => {
    setArbeitet(true);
    try {
      await aktion();
      toast.success(meldung);
      laden();
      return true;
    } catch (f: any) {
      toast.error(f?.message || "Das hat nicht geklappt.");
      return false;
    } finally {
      setArbeitet(false);
    }
  };

  const standErstellen = () => ausfuehren(async () => {
    const einreichungen = await ladeEinreichungen();
    const wohnungen = new Map(getObjekte().flatMap((o) => [...o.wohnungen, ...(o.wohnungenNichtImAngebot || [])]).map((w) => [w.id, w]));
    const s = (x: unknown) => (typeof x === "string" ? x : undefined);
    const vorgaenge: ReportVorgang[] = getInvestments()
      .filter((i) => i.meta?.beispiel !== true)
      .map((i) => {
        const m = (i.meta || {}) as Record<string, any>;
        return {
          id: i.id,
          pipelineStufe: i.pipelineStufe,
          objektTitel: i.objektTitel,
          weNr: i.weNr,
          kaufpreis: kaufpreisAusMeta(m) || Number(wohnungen.get(i.wohnungId || "")?.vkGesamt) || undefined,
          beratungAm: s(m.beratungsgespraechAm),
          closingAm: s(m.objektauswahlSeit),
          reserviertAm: s(m.reserviertAm),
          finanzierungSeit: s(m.finanzierungSeit),
          finanzierungsStatus: i.finanzierungsStatus,
          finanzierungsBank: s(m.finanzierungsBank),
          bankgutachterSeit: s(m.bankgutachterSeit),
          besichtigungSeit: s(m.besichtigungSeit),
          kundenordner: Array.isArray(m.kundenordner) ? m.kundenordner : [],
          notarTermin: i.notarTermin,
          einreichungen: einreichungen.filter((e) => e.investment_id === i.id),
        };
      });
    const vorher = staende?.find((x) => istAktuellesFormat(x.daten))?.daten ?? null;
    await legeStandAn(baueStand(vorgaenge, vorher, heuteIso()));
    setGewaehlt(null);
  }, "Stand erstellt. Gelbe Felder ergänzen, speichern, dann veröffentlichen.");

  const daten = entwurf ?? (stand && istAktuellesFormat(stand.daten) ? stand.daten : null);

  const aendereZelle = (id: string, k: SpaltenKey, w: string) => {
    if (!daten) return;
    setEntwurf({
      ...daten,
      zeilen: daten.zeilen.map((z) => {
        if (z.id !== id) return z;
        const manuell = { ...z.manuell };
        // Gleich dem CRM-Wert: kein Handeintrag, damit spaetere CRM-Werte durchkommen.
        if (w === (z.crm[k] ?? "")) delete manuell[k]; else manuell[k] = w;
        return { ...z, manuell };
      }),
    });
  };
  const zeileHinzufuegen = () => daten && setEntwurf({
    ...daten,
    zeilen: [...daten.zeilen, { id: crypto.randomUUID(), quelle: "manuell", crm: {}, manuell: {} }],
  });
  const zeileEntfernen = (id: string) => daten && setEntwurf({ ...daten, zeilen: daten.zeilen.filter((z) => z.id !== id) });

  return (
    <DashboardLayout>
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>
      <div className="space-y-6">
        <PageHeader
          title="Verkaufsreport Eigentumswohnung"
          subtitle={stand ? `Stand ${tag(stand.stand_am)}` : "Noch kein Stand"}
        />

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {leitung && (
            <Button size="sm" disabled={arbeitet || !!entwurf} onClick={standErstellen}>
              <Plus className="h-4 w-4 mr-1.5" /> Stand erstellen
            </Button>
          )}
          {stand && (
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" /> PDF
            </Button>
          )}
          {staende && staende.length > 1 && (
            <select className="h-9 rounded-md border bg-background px-2 text-sm" disabled={!!entwurf} value={gewaehlt ?? ""} onChange={(e) => setGewaehlt(e.target.value)}>
              {staende.map((s) => (
                <option key={s.id} value={s.id}>
                  Stand {tag(s.stand_am)}{leitung ? (s.veroeffentlicht_am ? " · veröffentlicht" : " · Entwurf") : ""}
                </option>
              ))}
            </select>
          )}
          {leitung && stand && entwurf && (
            <>
              <Button size="sm" disabled={arbeitet} onClick={() => ausfuehren(() => speichereDaten(stand.id, entwurf), "Gespeichert.").then((ok) => ok && setEntwurf(null))}>
                <Save className="h-4 w-4 mr-1.5" /> Speichern
              </Button>
              <Button size="sm" variant="ghost" disabled={arbeitet} onClick={() => setEntwurf(null)}>
                <X className="h-4 w-4 mr-1.5" /> Verwerfen
              </Button>
            </>
          )}
          {leitung && stand && !entwurf && (
            <>
              <Badge variant="outline" className="border-0 bg-muted">
                {stand.veroeffentlicht_am ? `Veröffentlicht am ${tag(stand.veroeffentlicht_am)}` : "Entwurf, für Geschäftspartner nicht sichtbar"}
              </Badge>
              {stand.veroeffentlicht_am ? (
                <Button size="sm" variant="ghost" disabled={arbeitet} onClick={() => ausfuehren(() => veroeffentliche(stand.id, false), "Veröffentlichung zurückgenommen.")}>
                  <Undo2 className="h-4 w-4 mr-1.5" /> Zurücknehmen
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={arbeitet} onClick={() => ausfuehren(() => veroeffentliche(stand.id, true), "Veröffentlicht. Geschäftspartner sehen diesen Stand jetzt.")}>
                  <Send className="h-4 w-4 mr-1.5" /> Veröffentlichen
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={arbeitet} onClick={async () => {
                const ok = await confirmDialog({ title: "Diesen Stand löschen?", confirmText: "Löschen", cancelText: "Abbrechen" });
                if (ok) ausfuehren(() => loescheStand(stand.id), "Stand gelöscht.");
              }}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Löschen
              </Button>
            </>
          )}
        </div>

        {!staende ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : !stand ? (
          <p className="text-sm text-muted-foreground">
            {leitung ? "Noch kein Stand erstellt." : "Es ist noch kein Verkaufsreport veröffentlicht."}
          </p>
        ) : !daten ? (
          <p className="text-sm text-muted-foreground">
            Dieser Stand hat noch den alten Aufbau. {leitung ? "Bitte einen neuen Stand erstellen." : ""}
          </p>
        ) : (
          <ReportAnsicht
            daten={daten}
            bearbeiten={leitung}
            onZelle={aendereZelle}
            onZeileEntfernen={zeileEntfernen}
            onZeileHinzufuegen={zeileHinzufuegen}
          />
        )}

        {leitung && (
          <p className="text-xs text-muted-foreground print:hidden">
            Weiße Felder kommen beim Erstellen aus dem CRM, gelbe sind für Eingaben vorgesehen. Jedes Feld lässt sich überschreiben; Handeinträge und
            eigene Zeilen (etwa Fremdvertrieb) übernimmt der nächste Stand. Den Namen des Kaufinteressenten zeigt der Report bewusst nicht.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

function ReportAnsicht({ daten, bearbeiten, onZelle, onZeileEntfernen, onZeileHinzufuegen }: {
  daten: VerkaufsreportDaten;
  bearbeiten: boolean;
  onZelle: (id: string, k: SpaltenKey, w: string) => void;
  onZeileEntfernen: (id: string) => void;
  onZeileHinzufuegen: () => void;
}) {
  const k = kennzahlen(daten.zeilen);
  return (
    <div className="space-y-6">
      <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-5 overflow-x-auto">
        <div className="grid gap-2 min-w-[900px]" style={{ gridTemplateColumns: `repeat(${k.trichter.length + 3}, minmax(0, 1fr))` }}>
          {k.trichter.map((t, i) => (
            <div key={t.label} className="rounded-lg bg-muted/60 p-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground min-h-[2.5em]">{t.label}</p>
              <p className="text-xl font-semibold mt-1">{t.anzahl}</p>
              <p className="text-[11px] leading-tight text-muted-foreground mt-1">
                {i === 0 ? "Basis" : <>{prozent(t.anteilAller)} aller<br />{prozent(t.anteilVorstufe)} der Vorstufe</>}
              </p>
            </div>
          ))}
          <div className="rounded-lg bg-muted/60 p-2.5">
            <p className="text-[11px] leading-tight text-muted-foreground min-h-[2.5em]">Ø Salescycle (Tage)</p>
            <p className="text-xl font-semibold mt-1">{k.salescycleTage === null ? "–" : k.salescycleTage.toLocaleString("de-DE")}</p>
            <p className="text-[11px] leading-tight text-muted-foreground mt-1">Erstberatung bis Notartermin</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-2.5">
            <p className="text-[11px] leading-tight text-muted-foreground min-h-[2.5em]">Ø Kaufpreis</p>
            <p className="text-xl font-semibold mt-1">{eur(k.kaufpreis)}</p>
            <p className="text-[11px] leading-tight text-muted-foreground mt-1">Eingetragene Kaufpreise</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-2.5">
            <p className="text-[11px] leading-tight text-muted-foreground min-h-[2.5em]">Ausgewertete Vorgänge</p>
            <p className="text-xl font-semibold mt-1">{k.ausgewertet}</p>
            <p className="text-[11px] leading-tight text-muted-foreground mt-1">Mit Start- und Enddatum</p>
          </div>
        </div>
      </div>

      <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
        <p className="text-sm font-semibold">Interessenten und Prozessstatus</p>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-left text-muted-foreground align-bottom">
                {SPALTEN.map((s) => <th key={s.key} className="py-1.5 px-1.5 font-medium min-w-[88px]">{s.label}</th>)}
                <th className="py-1.5 px-1.5 font-medium">Salescycle (Tage)</th>
                {bearbeiten && <th className="print:hidden" />}
              </tr>
            </thead>
            <tbody>
              {daten.zeilen.map((z) => (
                <Zeile key={z.id} z={z} bearbeiten={bearbeiten} onZelle={onZelle} onEntfernen={onZeileEntfernen} />
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="verkaufsreport-ja-nein"><option value="Ja" /><option value="Nein" /></datalist>
        {bearbeiten && (
          <Button size="sm" variant="outline" className="print:hidden" onClick={onZeileHinzufuegen}>
            <Plus className="h-4 w-4 mr-1.5" /> Zeile hinzufügen (z. B. Fremdvertrieb)
          </Button>
        )}
      </div>
    </div>
  );
}

function Zeile({ z, bearbeiten, onZelle, onEntfernen }: {
  z: ReportZeile;
  bearbeiten: boolean;
  onZelle: (id: string, k: SpaltenKey, w: string) => void;
  onEntfernen: (id: string) => void;
}) {
  const zyklus = salescycle(z);
  return (
    <tr className="border-t align-top">
      {SPALTEN.map((s) => {
        const w = wert(z, s.key);
        // Gelb wie in der Excel: Felder, die das CRM nicht liefert.
        const gelb = z.quelle === "manuell" || !CRM_SPALTEN.has(s.key) || z.manuell[s.key] !== undefined;
        return (
          <td key={s.key} className={`px-1 py-1 ${gelb ? "bg-yellow-100/70 dark:bg-yellow-500/15 print:bg-transparent" : ""}`}>
            {bearbeiten ? (
              <input
                className="w-full min-w-[80px] bg-transparent px-0.5 py-0.5 rounded border border-transparent hover:border-border focus:border-primary outline-none print:hidden"
                value={/^\d{4}-\d{2}-\d{2}$/.test(w) ? tagDe(w) : w}
                placeholder={s.key === "maengel" ? "Ja / Nein" : ""}
                list={s.key === "maengel" ? "verkaufsreport-ja-nein" : undefined}
                title={z.crm[s.key] ? `CRM: ${anzeige(s.key, z.crm[s.key]!)}` : undefined}
                onChange={(e) => {
                  // TT.MM.JJJJ wird als JJJJ-MM-TT gespeichert, wie die CRM-Werte.
                  const roh = e.target.value;
                  const iso = /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(roh.trim()) ? datumIso(roh) : null;
                  onZelle(z.id, s.key, iso ?? roh);
                }}
              />
            ) : null}
            <span className={bearbeiten ? "hidden print:inline" : "whitespace-pre-wrap"}>{anzeige(s.key, w)}</span>
          </td>
        );
      })}
      <td className="px-1.5 py-1 whitespace-nowrap">{zyklus === null ? "" : zyklus}</td>
      {bearbeiten && (
        <td className="px-1 py-1 print:hidden">
          {z.quelle === "manuell" && (
            <button type="button" className="text-muted-foreground hover:text-destructive" title="Zeile entfernen" onClick={() => onEntfernen(z.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
