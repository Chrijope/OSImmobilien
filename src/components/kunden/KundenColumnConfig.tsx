import { useState } from "react";
import { formatDatum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings2 } from "lucide-react";
import type { KundeData } from "@/lib/kundenStore";
import { kontaktQuelleAnzeige } from "@/lib/kontaktQuelle";
import { Badge } from "@/components/ui/badge";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { getEffectivePipelineStufe, PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { normalizeTelefon } from "@/lib/phoneUtils";
import { loadAllUsers } from "@/lib/loadAllUsers";
import {
  tarnArbeitgeber,
  tarnEmail,
  tarnFreitext,
  tarnGeburtsdatum,
  tarnName,
  tarnNachname,
  tarnTelefon,
  tarnVorname,
  unscharfKlasse,
} from "@/lib/vorfuehrmodus";

let _vpCache: { id: string; name: string }[] | null = null;
function resolveVpName(k: KundeData): string {
  if (k.berater && k.berater.trim()) return k.berater.trim();
  const zid = (k as any).zustaendig_id || (k as any).zustaendigId;
  if (!zid) return "";
  if (!_vpCache) _vpCache = loadAllUsers().map(u => ({ id: u.id, name: u.name }));
  return _vpCache.find(u => u.id === zid)?.name || "";
}

// ── All possible columns ──
export interface ColumnDef {
  key: string;
  label: string;
  render: (k: KundeData) => React.ReactNode;
}

// Pipeline-Stufe colors for status display
const PIPELINE_COLORS: Record<string, string> = {
  neuer_lead: "bg-muted text-muted-foreground",
  kontaktversuche: "bg-muted text-muted-foreground",
  follow_up: "bg-warning/10 text-warning",
  erstgespraech: "bg-primary/10 text-primary",
  closing: "bg-primary/10 text-primary",
  bonitaetsunterlagen: "bg-amber-500/10 text-amber-600",
  objektauswahl: "bg-chart-1/10 text-chart-1",
  follow_up_objekt: "bg-warning/10 text-warning",
  reservierung: "bg-blue-500/10 text-blue-600",
  finanzierung: "bg-blue-500/10 text-blue-600",
  notar: "bg-blue-500/10 text-blue-600",
  faelligkeit: "bg-emerald-500/10 text-emerald-600",
  abrechnung: "bg-emerald-500/10 text-emerald-600",
  abgeschlossen: "bg-success/10 text-success",
  verloren: "bg-destructive/10 text-destructive",
};

const fmtEuro = (v: number) => (v ? `${v.toLocaleString("de-DE")} €` : "–");

/*
 * Diese Spaltenliste versorgt saemtliche Kontaktlisten: Kontakte, Alle
 * Kontakte, Neukunden, Bestandskunden, Follow-Up und Verloren. Der
 * Vorfuehrmodus setzt deshalb genau hier an und nicht in jeder Seite einzeln.
 *
 * Namen und Kontaktdaten werden ersetzt, Betraege nur weichgezeichnet. Warum
 * der Unterschied, steht in `src/lib/vorfuehrmodus.ts`.
 */
export const ALL_COLUMNS: ColumnDef[] = [
  { key: "vorname", label: "Vorname", render: (k) => <span className="text-sm">{tarnVorname(k.vorname)}</span> },
  { key: "nachname", label: "Nachname", render: (k) => <span className="text-sm font-medium">{tarnNachname(k.nachname)}</span> },
  { key: "email", label: "E-Mail", render: (k) => <span className="text-sm text-muted-foreground">{tarnEmail(k.email) || "–"}</span> },
  { key: "telefon", label: "Telefon", render: (k) => {
      const vb = (k as any).verstecktBis as string | undefined;
      const inWartezeit = vb && vb > new Date().toISOString();
      let waitLabel = "";
      if (inWartezeit) {
        const ms = new Date(vb!).getTime() - Date.now();
        const h = Math.floor(ms / 3600000);
        const d = Math.floor(h / 24);
        waitLabel = d > 0 ? `Wartezeit noch ${d} Tag${d === 1 ? "" : "e"}` : `Wartezeit noch ${Math.max(1, h)} Std.`;
      }
      return (
        <div className="flex flex-col leading-tight">
          <span className="text-sm text-muted-foreground">{tarnTelefon(normalizeTelefon(k.telefon)) || "–"}</span>
          {inWartezeit && <span className="text-[10px] text-amber-600">⏳ {waitLabel}</span>}
        </div>
      );
    } },
  { key: "firma", label: "Firma", render: (k) => <span className="text-sm text-muted-foreground">{tarnArbeitgeber(k.firma) || "–"}</span> },
  { key: "quelle", label: "Quelle", render: (k) => <span className="text-sm text-muted-foreground">{kontaktQuelleAnzeige(k) || "–"}</span> },
  { key: "berater", label: "Vertriebspartner", render: (k) => <span className="text-sm text-muted-foreground">{tarnName(resolveVpName(k), "partner") || "–"}</span> },
  {
    key: "status", label: "Pipeline-Status", render: (k) => {
      const stufe = getEffectivePipelineStufe(k);
      const label = PIPELINE_STUFEN.find(s => s.key === stufe)?.label || stufe;
      return <Badge className={`text-[10px] ${PIPELINE_COLORS[stufe] || "bg-muted text-muted-foreground"}`}>{label}</Badge>;
    },
  },
  { key: "erstellt_am", label: "Angelegt am", render: (k) => <span className="text-sm text-muted-foreground">{formatDatum(k.erstellt_am)}</span> },
  { key: "objekt", label: "Objekt/Wohneinheit", render: (k) => <span className="text-sm">{k.objekt || "–"}</span> },
  { key: "kaufpreis", label: "Kaufpreis", render: (k) => <span className={unscharfKlasse("text-sm font-medium")}>{fmtEuro(k.kaufpreis)}</span> },
  {
    key: "finanzierbarkeit", label: "Finanzierbarkeit", render: (k) => {
      /*
       * Nur der am Kontakt gepflegte Wert. Frueher stand hier ersatzweise ein
       * "Positiv" / "Negativ", das aus der neuesten Selbstauskunft ueber ALLE
       * Investments gerechnet wurde. In einer Liste je Kontakt laesst sich
       * aber nicht sagen, um welches Investment es geht, und jedes Investment
       * steht fuer sich. Deshalb steht hier jetzt ein Strich, und die
       * Zahl gibt es im Kundenprofil beim jeweiligen Investment.
       */
      const value = k.finanzierbarkeit || "";
      return (
        <div className="flex items-center gap-1" title="Nur der am Kontakt gepflegte Wert. Die gerechnete Finanzierbarkeit steht im Kundenprofil beim jeweiligen Investment, weil sie aus dessen eigener Selbstauskunft entsteht.">
          <Badge className={`text-[10px] ${value === "Positiv" ? "bg-success/10 text-success" : value === "Negativ" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
            {value || "–"}
          </Badge>
        </div>
      );
    },
  },
  { key: "position", label: "Position", render: (k) => <span className="text-sm text-muted-foreground">{tarnFreitext(k.position, "verborgen") || "–"}</span> },
  { key: "ort", label: "Ort", render: (k) => <span className="text-sm text-muted-foreground">{tarnFreitext(k.ort, "verborgen") || "–"}</span> },
  { key: "plz", label: "PLZ", render: (k) => <span className="text-sm text-muted-foreground">{tarnFreitext(k.plz, "•••••") || "–"}</span> },
  { key: "geburtstag", label: "Geburtstag", render: (k) => <span className="text-sm text-muted-foreground">{tarnGeburtsdatum(k.geburtstag) || "–"}</span> },
  { key: "beratungsgespraechAm", label: "Beratungsgespräch am", render: (k) => {
    const meta = (k as any)?.meta || {};
    let am = meta.beratungsgespraechAm || "";
    let uhr = meta.beratungsgespraechUhrzeit || "";
    // Fallback: Bei Bestandskontakten, die schon in/ab Beratungsgespräch sind,
    // liegt der Termin noch im alten Feld `setterTerminDatum` — als Beratungsgespräch deuten.
    if (!am) {
      const stage = (k as any)?.pipelineStufe || "";
      const beratungOrLater = [
        "beratungsgespraech","bonitaetsunterlagen","objektauswahl","follow_up_objekt",
        "reservierung","finanzierung","notar","faelligkeit","abrechnung","abgeschlossen",
      ].includes(stage);
      if (beratungOrLater && (k as any)?.setterTerminDatum) {
        am = (k as any).setterTerminDatum;
        uhr = (k as any).setterTerminUhrzeit || "";
      }
    }
    if (!am) return <span className="text-sm text-muted-foreground">–</span>;
    return <span className="text-sm text-muted-foreground">{formatDatum(am)}{uhr ? ` · ${uhr}` : ""}</span>;
  } },
  { key: "followUpAm", label: "Follow-Up am", render: (k) => {
    let am = (k as any)?.meta?.followUpAm || "";
    let uhr = (k as any)?.meta?.followUpUhrzeit || "";
    // Fallback: bei Alt-Leads ohne Meta-Felder den Termin aus verstecktBis ableiten.
    const vb = (k as any)?.verstecktBis || (k as any)?.meta?.verstecktBis;
    if (!am && vb) {
      const d = new Date(vb);
      if (!isNaN(d.getTime())) {
        am = d.toISOString().split("T")[0];
        if (!uhr) uhr = d.toTimeString().slice(0, 5);
      }
    }
    if (!am) return <span className="text-sm text-muted-foreground">–</span>;
    return <span className="text-sm text-muted-foreground">{formatDatum(am)}{uhr ? ` · ${uhr}` : ""}</span>;
  } },
  { key: "anrede", label: "Anrede", render: (k) => <span className="text-sm text-muted-foreground">{k.anrede || "–"}</span> },
  {
    key: "leadTyp", label: "Lead-Typ", render: (k) => {
      if (!k.leadTyp) return <span className="text-sm text-muted-foreground">–</span>;
      const colors: Record<string, string> = {
        meta: "bg-blue-500/10 text-blue-600 border-blue-200",
        google: "bg-amber-500/10 text-amber-600 border-amber-200",
        website: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
        manuell: "bg-muted text-muted-foreground",
      };
      const labels: Record<string, string> = { meta: "Funnel Lead", google: "Google Ad", website: "Website", manuell: "Manuell" };
      return <Badge className={`text-[10px] ${colors[k.leadTyp] || "bg-muted text-muted-foreground"}`}>{labels[k.leadTyp] || k.leadTyp}</Badge>;
    },
  },
  {
    key: "pipelineStufe", label: "Pipeline-Status", render: (k) => {
      const stufe = getEffectivePipelineStufe(k);
      const label = PIPELINE_STUFEN.find(s => s.key === stufe)?.label || stufe;
      return <Badge className="text-[10px] bg-primary/10 text-primary">{label}</Badge>;
    },
  },
  {
    key: "investments", label: "Investments", render: (k) => {
      const invs = getInvestmentsByKontakt(k.id);
      if (invs.length === 0) return <span className="text-sm text-muted-foreground">–</span>;
      const STEP_LABELS: Record<string, string> = {
        erstgespraech: "Erstgespräch", bonitaetsunterlagen: "Bonität",
        objektauswahl: "Objekt", follow_up_objekt: "Follow-Up", reservierung: "Reserv.", finanzierung: "Finanz.",
        notar: "Notar", abrechnung: "Abrechn.", abgeschlossen: "Abgeschl.",
      };
      return (
        <div className="flex flex-col gap-0.5">
          {invs.map(inv => (
            <div key={inv.id} className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium">Inv. {inv.nummer}</span>
              <Badge className="text-[9px] px-1 py-0 bg-primary/10 text-primary">{STEP_LABELS[inv.pipelineStufe] || inv.pipelineStufe}</Badge>
            </div>
          ))}
        </div>
      );
    },
  },
  {
    key: "reserviertAm", label: "Reserviert am", render: (k) => {
      const invs = getInvestmentsByKontakt(k.id);
      const resInv = invs.find(i => (i as any).wohnungId);
      if (!resInv) return <span className="text-sm text-muted-foreground">–</span>;
      const meta = (resInv as any).meta || {};
      return <span className="text-sm text-muted-foreground">{formatDatum(meta.reserviertAm || resInv.erstellt_am)}</span>;
    },
  },
];

const colMap = new Map(ALL_COLUMNS.map((c) => [c.key, c]));

export function getColumnDef(key: string): ColumnDef | undefined {
  return colMap.get(key);
}

// ── Saved column preferences (now DB-backed) ──
function loadExtra(pageKey: string): string[] {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(`mi_cols_${pageKey}`); return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  const allCols = getUserSetting<Record<string, string[]>>("column_config", {});
  return allCols[pageKey] || [];
}

function saveExtra(pageKey: string, keys: string[]) {
  if (isTestAccount()) {
    localStorage.setItem(`mi_cols_${pageKey}`, JSON.stringify(keys));
    return;
  }
  const allCols = getUserSetting<Record<string, string[]>>("column_config", {});
  allCols[pageKey] = keys;
  setUserSetting("column_config", allCols);
}

// ── Hook ──
export function useColumnConfig(pageKey: string, fixedKeys: string[]) {
  const [extraKeys, setExtraKeys] = useState<string[]>(() => loadExtra(pageKey));

  const toggleExtra = (key: string) => {
    setExtraKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      saveExtra(pageKey, next);
      return next;
    });
  };

  const allKeys = [...fixedKeys, ...extraKeys.filter((k) => !fixedKeys.includes(k))];
  const columns = allKeys.map((k) => colMap.get(k)).filter(Boolean) as ColumnDef[];
  const optionalKeys = ALL_COLUMNS.map((c) => c.key).filter((k) => !fixedKeys.includes(k));

  return { columns, extraKeys, toggleExtra, optionalKeys, fixedKeys };
}

// ── Column Selector UI ──
export function ColumnSelector({
  fixedKeys,
  extraKeys,
  optionalKeys,
  toggleExtra,
}: {
  fixedKeys: string[];
  extraKeys: string[];
  optionalKeys: string[];
  toggleExtra: (key: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          <Settings2 className="h-3.5 w-3.5" />
          <span className="text-xs">Spalten</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <p className="text-xs font-semibold mb-2">Feste Spalten</p>
        {fixedKeys.map((k) => {
          const col = colMap.get(k);
          return col ? (
            <div key={k} className="flex items-center gap-2 py-1">
              <Checkbox checked disabled className="opacity-50" />
              <span className="text-xs text-muted-foreground">{col.label}</span>
            </div>
          ) : null;
        })}
        <hr className="my-2" />
        <p className="text-xs font-semibold mb-2">Optionale Spalten</p>
        {optionalKeys.map((k) => {
          const col = colMap.get(k);
          return col ? (
            <div key={k} className="flex items-center gap-2 py-1">
              <Checkbox
                checked={extraKeys.includes(k)}
                onCheckedChange={() => toggleExtra(k)}
              />
              <span className="text-xs">{col.label}</span>
            </div>
          ) : null;
        })}
      </PopoverContent>
    </Popover>
  );
}
