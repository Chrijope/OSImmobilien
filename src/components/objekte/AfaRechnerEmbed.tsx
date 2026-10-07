import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EuroInput } from "@/components/ui/euro-input";
import { Building2, Calculator, Info, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  MAX_MOD_PUNKTE,
  MOD_ELEMENTE,
  OBJEKTART_GND,
  RND_PARAMETER,
  ZEITRAUM_OPTIONEN,
} from "@/lib/restnutzungsdauer";
// Gerechnet wird ausschliesslich in `afaRechnung.ts`. Diese Datei stellt nur dar.
import {
  BUNDESLAND_NK,
  berechneAfa,
  bundeslandFromPlz,
  createDefaultModZeitraeume,
  migrateObjektart,
  migrateZeitraeume,
  nebenkostenBetrag,
  type AfaModus,
} from "@/lib/afaRechnung";

const MAX_MOD_PUNKTE_ANZEIGE = MAX_MOD_PUNKTE;

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const fmtFull = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);

export interface AfaErgebnis {
  rnd: number;
  afaSatz: number;
  gebaeudePct: number;
  bodenPct: number;
  modPunkte: number;
  bodenwertGesamt: number;
  gebaeudewert: number;
  afaBemessungsgrundlage: number;
  afaBetragPa: number;
  /** Für die weiteren Abschreibungsmodelle unterhalb des Rechners. */
  baujahr: number;
  wohnflaeche: number;
}

export interface AfaRechnerDraft {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  objektart: string;
  kaufpreis: number;
  nebenkosten: number;
  sanierungskosten: number;
  /** Verteilung Erhaltungsaufwand auf 1–5 Jahre (§82b EStDV). Default 1. */
  erhaltungsaufwandJahre?: number;
  baujahr: number;
  /** @deprecated – ersetzt durch `bodenAnteilPct`. Wird nur noch aus Legacy-Drafts gelesen. */
  grundstuecksflaeche?: number;
  /** @deprecated – ersetzt durch `bodenAnteilPct`. */
  bodenrichtwert?: number;
  /** Pauschaler Grundstücksanteil in % vom Kaufpreis. Default 20. */
  bodenAnteilPct?: number;
  wohnflaeche: number;
  miteigentumsanteil: number;
  modZeitraeume: Record<string, string>;
  showDetails: boolean;
  showModTable: boolean;
  bundesland?: string;
  /** Manueller Nebenkostensatz (%) – überschreibt Bundesland-Satz wenn > 0 */
  nebenkostenPctManuell?: number;
  /** "berechnen" = Modernisierungsbewertung; "gutachten" = manuelle AfA/RND-Eingabe */
  afaModus?: AfaModus;
  /** Manueller AfA-Satz (%) – nur Modus "gutachten" */
  afaSatzManuell?: number;
  /** Manuelle Restnutzungsdauer (Jahre) – nur Modus "gutachten" */
  rndManuell?: number;
  /** Optional: Gutachter / Quelle (Freitext) */
  gutachterQuelle?: string;
  /** Kernsanierung: fiktives Baujahr + Beschreibung. */
  kernsanierung?: {
    aktiv: boolean;
    jahr?: number;
    umfang?: string;
  };
}

interface AfaRechnerEmbedProps {
  /** Pre-fill values from parent */
  initialStrasse?: string;
  initialPlz?: string;
  initialOrt?: string;
  initialKaufpreis?: number;
  initialBaujahr?: number;
  initialGrundstuecksflaeche?: number;
  initialWohnflaeche?: number;
  /** Erhaltungsaufwand gesamt (€). Prop-Name historisch, repräsentiert Erhaltungsaufwand. */
  initialSanierungskosten?: number;
  initialErhaltungsaufwandJahre?: number;
  /** Live computed Kaufpreis from apartment data */
  computedKaufpreis?: number;
  /** Live computed Wohnfläche from apartment data */
  computedWohnflaeche?: number;
  /** Live computed Baujahr from Basisdaten */
  computedBaujahr?: number;
  /** Live address from Basisdaten */
  computedAdresse?: string;
  computedPlz?: string;
  computedOrt?: string;
  draft?: Partial<AfaRechnerDraft> | null;
  /** Called whenever the result changes */
  onResultChange?: (ergebnis: AfaErgebnis) => void;
  /** Called when Erhaltungsaufwand (€) changes */
  onSanierungskostenChange?: (value: number) => void;
  onErhaltungsaufwandJahreChange?: (value: number) => void;
  onDraftChange?: (draft: AfaRechnerDraft) => void;
  /** Optional slot rendered directly above the "Wie soll die AfA bestimmt werden?" card */
  slotBeforeModus?: ReactNode;
  /** Wenn true, wird der Modus-Umschalter (Berechnen vs. Gutachten) ausgeblendet und „berechnen" erzwungen. */
  hideModusToggle?: boolean;
}

const createDefaultDraft = ({
  initialStrasse,
  initialPlz,
  initialOrt,
  initialKaufpreis,
  initialBaujahr,
  initialGrundstuecksflaeche,
  initialWohnflaeche,
  initialSanierungskosten,
}: Pick<AfaRechnerEmbedProps, "initialStrasse" | "initialPlz" | "initialOrt" | "initialKaufpreis" | "initialBaujahr" | "initialGrundstuecksflaeche" | "initialWohnflaeche" | "initialSanierungskosten">): AfaRechnerDraft => {
  const adressParts = initialStrasse?.match(/^(.+?)\s+(\d+.*)$/) || [];

  return {
    strasse: adressParts[1] || initialStrasse || "",
    hausnummer: adressParts[2] || "",
    plz: initialPlz || "",
    ort: initialOrt || "",
    objektart: "Eigentumswohnung (ETW)",
    kaufpreis: initialKaufpreis || 0,
    nebenkosten: 0,
    sanierungskosten: initialSanierungskosten || 0,
    erhaltungsaufwandJahre: 1,
    // Kein erfundenes Standardbaujahr: Ohne Angabe bleibt das Feld leer und
    // der Rechner weist die Restnutzungsdauer als unbestimmt aus.
    baujahr: initialBaujahr || 0,
    bodenAnteilPct: 20,
    wohnflaeche: initialWohnflaeche || 0,
    miteigentumsanteil: 1000,
    modZeitraeume: createDefaultModZeitraeume(),
    showDetails: false,
    showModTable: false,
    afaModus: "berechnen",
    afaSatzManuell: 0,
    rndManuell: 0,
    gutachterQuelle: "",
    nebenkostenPctManuell: 0,
    kernsanierung: { aktiv: false, jahr: undefined, umfang: "" },
  };
};

export function AfaRechnerEmbed({
  initialStrasse = "",
  initialPlz = "",
  initialOrt = "",
  initialKaufpreis = 0,
  initialBaujahr = 0,
  initialGrundstuecksflaeche = 0,
  initialWohnflaeche = 0,
  initialSanierungskosten = 0,
  initialErhaltungsaufwandJahre = 1,
  computedKaufpreis,
  computedWohnflaeche,
  computedBaujahr,
  computedAdresse,
  computedPlz,
  computedOrt,
  draft,
  onResultChange,
  onSanierungskostenChange,
  onErhaltungsaufwandJahreChange,
  onDraftChange,
  slotBeforeModus,
  hideModusToggle = false,
}: AfaRechnerEmbedProps) {
  const defaultDraft = useMemo(() => createDefaultDraft({
    initialStrasse,
    initialPlz,
    initialOrt,
    initialKaufpreis,
    initialBaujahr,
    initialGrundstuecksflaeche,
    initialWohnflaeche,
    initialSanierungskosten,
  }), [initialStrasse, initialPlz, initialOrt, initialKaufpreis, initialBaujahr, initialGrundstuecksflaeche, initialWohnflaeche, initialSanierungskosten]);

  const mergedDraft = useMemo<AfaRechnerDraft>(() => ({
    ...defaultDraft,
    ...draft,
    modZeitraeume: draft?.modZeitraeume ?? defaultDraft.modZeitraeume,
    showDetails: draft?.showDetails ?? defaultDraft.showDetails,
    showModTable: draft?.showModTable ?? defaultDraft.showModTable,
  }), [defaultDraft, draft]);

  const [strasse, setStrasse] = useState(mergedDraft.strasse);
  const [hausnummer, setHausnummer] = useState(mergedDraft.hausnummer);
  const [plz, setPlz] = useState(mergedDraft.plz);
  const [ort, setOrt] = useState(mergedDraft.ort);
  const [objektart, setObjektart] = useState(migrateObjektart(mergedDraft.objektart));
  const [kaufpreis, setKaufpreis] = useState(mergedDraft.kaufpreis);
  const [nebenkosten, setNebenkosten] = useState(mergedDraft.nebenkosten);
  const [sanierungskosten, setSanierungskosten] = useState(mergedDraft.sanierungskosten);
  const [erhaltungsaufwandJahre, setErhaltungsaufwandJahre] = useState<number>(
    mergedDraft.erhaltungsaufwandJahre ?? initialErhaltungsaufwandJahre ?? 1,
  );
  const [baujahr, setBaujahr] = useState(mergedDraft.baujahr);
  const [bodenAnteilPct, setBodenAnteilPct] = useState<number>(mergedDraft.bodenAnteilPct ?? 20);
  const [wohnflaeche, setWohnflaeche] = useState(mergedDraft.wohnflaeche);
  const [miteigentumsanteil, setMiteigentumsanteil] = useState(mergedDraft.miteigentumsanteil);
  const [modZeitraeume, setModZeitraeume] = useState<Record<string, string>>(mergedDraft.modZeitraeume);
  const [showDetails, setShowDetails] = useState(mergedDraft.showDetails);
  const [showModTable, setShowModTable] = useState(mergedDraft.showModTable);
  const [afaModus, setAfaModus] = useState<AfaModus>(mergedDraft.afaModus ?? "berechnen");
  const [afaSatzManuell, setAfaSatzManuell] = useState<number>(mergedDraft.afaSatzManuell ?? 0);
  const [rndManuell, setRndManuell] = useState<number>(mergedDraft.rndManuell ?? 0);
  const [gutachterQuelle, setGutachterQuelle] = useState<string>(mergedDraft.gutachterQuelle ?? "");
  const [kernsanierungAktiv, setKernsanierungAktiv] = useState<boolean>(mergedDraft.kernsanierung?.aktiv ?? false);
  const [kernsanierungJahr, setKernsanierungJahr] = useState<number | undefined>(mergedDraft.kernsanierung?.jahr);
  const [kernsanierungUmfang, setKernsanierungUmfang] = useState<string>(mergedDraft.kernsanierung?.umfang ?? "");
  const [kaufpreisManuallyEdited, setKaufpreisManuallyEdited] = useState(false);
  const [wohnflaecheManuallyEdited, setWohnflaecheManuallyEdited] = useState(false);
  const [nebenkostenManuallyEdited, setNebenkostenManuallyEdited] = useState(
    // Wenn ein manueller Satz oder ein Nebenkosten-Wert hinterlegt ist, der nicht
    // dem reinen Bundesland-Default entspricht, gilt das Feld als manuell – sonst
    // würde der Auto-Effect den gespeicherten Wert beim Mount überschreiben (Flackern).
    (mergedDraft.nebenkostenPctManuell ?? 0) > 0 ||
      (Number(mergedDraft.nebenkosten) || 0) > 0
  );
  const [bundesland, setBundesland] = useState(
    mergedDraft.bundesland || bundeslandFromPlz(mergedDraft.plz) || "andere"
  );
  const [bundeslandManuallyEdited, setBundeslandManuallyEdited] = useState(
    !!mergedDraft.bundesland && mergedDraft.bundesland !== bundeslandFromPlz(mergedDraft.plz)
  );
  const [nebenkostenPctManuell, setNebenkostenPctManuell] = useState<number>(mergedDraft.nebenkostenPctManuell ?? 0);
  const lastAppliedDraftRef = useRef(JSON.stringify(mergedDraft));
  const lastEmittedDraftRef = useRef("");
  const prevComputedRef = useRef(computedKaufpreis);
  const prevComputedWfRef = useRef(computedWohnflaeche);
  const [adresseManuallyEdited, setAdresseManuallyEdited] = useState(false);

  // Auto-sync address from Basisdaten
  useEffect(() => {
    if (adresseManuallyEdited) return;
    if (computedAdresse !== undefined && computedAdresse !== "") {
      const parts = computedAdresse.match(/^(.+?)\s+(\d+.*)$/) || [];
      setStrasse(parts[1] || computedAdresse);
      setHausnummer(parts[2] || "");
    }
    if (computedPlz !== undefined && computedPlz !== "") setPlz(computedPlz);
    if (computedOrt !== undefined && computedOrt !== "") setOrt(computedOrt);
  }, [computedAdresse, computedPlz, computedOrt, adresseManuallyEdited]);

  // Auto-sync kaufpreis from computed apartment total unless manually edited
  useEffect(() => {
    if (computedKaufpreis !== undefined && computedKaufpreis > 0 && !kaufpreisManuallyEdited) {
      if (computedKaufpreis !== prevComputedRef.current || kaufpreis !== computedKaufpreis) {
        setKaufpreis(computedKaufpreis);
      }
    }
    prevComputedRef.current = computedKaufpreis;
  }, [computedKaufpreis, kaufpreisManuallyEdited]);

  // Auto-sync wohnflaeche from computed apartment total unless manually edited
  useEffect(() => {
    if (computedWohnflaeche !== undefined && computedWohnflaeche > 0 && !wohnflaecheManuallyEdited) {
      const rounded = Math.round(computedWohnflaeche * 100) / 100;
      setWohnflaeche(prev => (prev === rounded ? prev : rounded));
    }
    prevComputedWfRef.current = computedWohnflaeche;
  }, [computedWohnflaeche, wohnflaecheManuallyEdited]);

  // Auto-calc Nebenkosten from Bundesland unless manually edited
  useEffect(() => {
    if (nebenkostenManuallyEdited || kaufpreis <= 0) return;
    if (nebenkostenPctManuell && nebenkostenPctManuell > 0) {
      setNebenkosten(nebenkostenBetrag(kaufpreis, nebenkostenPctManuell));
      return;
    }
    if (bundesland !== "andere") {
      const bl = BUNDESLAND_NK.find(b => b.value === bundesland);
      if (bl) setNebenkosten(nebenkostenBetrag(kaufpreis, bl.pct));
    }
  }, [bundesland, kaufpreis, nebenkostenManuallyEdited, nebenkostenPctManuell]);

  // Auto-derive Bundesland from PLZ unless user picked one manually
  useEffect(() => {
    if (bundeslandManuallyEdited) return;
    const derived = bundeslandFromPlz(plz);
    if (derived && derived !== bundesland) {
      setBundesland(derived);
      setNebenkostenManuallyEdited(false);
    }
  }, [plz, bundeslandManuallyEdited]);

  // Auto-sync baujahr from Basisdaten (use ref to prevent ping-pong loop)
  const baujahrSyncRef = useRef(false);
  useEffect(() => {
    if (computedBaujahr !== undefined && computedBaujahr > 0 && computedBaujahr !== baujahr) {
      baujahrSyncRef.current = true;
      setBaujahr(computedBaujahr);
    }
  }, [computedBaujahr]);


  useEffect(() => {
    const serialized = JSON.stringify(mergedDraft);
    if (serialized !== lastAppliedDraftRef.current) {
      setStrasse(mergedDraft.strasse);
      setHausnummer(mergedDraft.hausnummer);
      setPlz(mergedDraft.plz);
      setOrt(mergedDraft.ort);
      setObjektart(migrateObjektart(mergedDraft.objektart));
      setKaufpreis(mergedDraft.kaufpreis);
      setNebenkosten(mergedDraft.nebenkosten);
      setSanierungskosten(mergedDraft.sanierungskosten);
      setErhaltungsaufwandJahre(mergedDraft.erhaltungsaufwandJahre ?? 1);
      setBaujahr(mergedDraft.baujahr);
      setBodenAnteilPct(mergedDraft.bodenAnteilPct ?? 20);
      // Wohnfläche nicht aus Draft restaurieren wenn Auto-Sync aus berechnetem Wert aktiv —
      // sonst flackert der Wert (Draft-Write -> Restore -> Auto-Sync -> Draft-Write …).
      if (!(computedWohnflaeche !== undefined && computedWohnflaeche > 0 && !wohnflaecheManuallyEdited)) {
        setWohnflaeche(mergedDraft.wohnflaeche);
      }
      setMiteigentumsanteil(mergedDraft.miteigentumsanteil);
      setModZeitraeume(migrateZeitraeume(mergedDraft.modZeitraeume));
      setShowDetails(mergedDraft.showDetails);
      setShowModTable(mergedDraft.showModTable);
      setAfaModus(mergedDraft.afaModus ?? "berechnen");
      setAfaSatzManuell(mergedDraft.afaSatzManuell ?? 0);
      setRndManuell(mergedDraft.rndManuell ?? 0);
      setGutachterQuelle(mergedDraft.gutachterQuelle ?? "");
      setKernsanierungAktiv(mergedDraft.kernsanierung?.aktiv ?? false);
      setKernsanierungJahr(mergedDraft.kernsanierung?.jahr);
      setKernsanierungUmfang(mergedDraft.kernsanierung?.umfang ?? "");
      if (mergedDraft.bundesland) setBundesland(mergedDraft.bundesland);
      setNebenkostenPctManuell(mergedDraft.nebenkostenPctManuell ?? 0);
      lastAppliedDraftRef.current = serialized;
    }
  }, [mergedDraft]);

  const ergebnis = useMemo(() => berechneAfa({
    objektart,
    kaufpreis,
    nebenkosten,
    bodenAnteilPct,
    sanierungskosten,
    baujahr,
    modZeitraeume,
    kernsanierungAktiv,
    kernsanierungJahr,
    afaModus,
    afaSatzManuell,
    rndManuell,
  }), [kaufpreis, nebenkosten, baujahr, bodenAnteilPct, modZeitraeume, afaModus, afaSatzManuell, rndManuell, objektart, kernsanierungAktiv, kernsanierungJahr, sanierungskosten]);

  // Notify parent of result changes
  useEffect(() => {
    onResultChange?.({
      rnd: ergebnis.rnd,
      afaSatz: ergebnis.afaSatz,
      gebaeudePct: ergebnis.gebaeudePct,
      bodenPct: ergebnis.bodenPct,
      modPunkte: ergebnis.modPunkte,
      bodenwertGesamt: ergebnis.bodenwertGesamt,
      gebaeudewert: ergebnis.gebaeudewert,
      afaBemessungsgrundlage: ergebnis.afaBemessungsgrundlage,
      afaBetragPa: ergebnis.afaBetragPa,
      baujahr,
      wohnflaeche,
    });
  }, [ergebnis.rnd, ergebnis.afaSatz, ergebnis.gebaeudePct, ergebnis.bodenPct, ergebnis.modPunkte, ergebnis.bodenwertGesamt, ergebnis.gebaeudewert, ergebnis.afaBemessungsgrundlage, ergebnis.afaBetragPa, baujahr, wohnflaeche, onResultChange]);

  useEffect(() => {
    const nextDraft = {
      strasse,
      hausnummer,
      plz,
      ort,
      objektart,
      kaufpreis,
      nebenkosten,
      sanierungskosten,
      erhaltungsaufwandJahre,
      baujahr,
      bodenAnteilPct,
      wohnflaeche,
      miteigentumsanteil,
      modZeitraeume,
      showDetails,
      showModTable,
      bundesland,
      afaModus,
      afaSatzManuell,
      rndManuell,
      gutachterQuelle,
      nebenkostenPctManuell,
      kernsanierung: {
        aktiv: kernsanierungAktiv,
        jahr: kernsanierungJahr,
        umfang: kernsanierungUmfang,
      },
    };

    const serialized = JSON.stringify(nextDraft);
    if (serialized === lastEmittedDraftRef.current) return;

    // Skip emitting when baujahr change originated from external sync (prevents ping-pong)
    if (baujahrSyncRef.current) {
      baujahrSyncRef.current = false;
      lastEmittedDraftRef.current = serialized;
      lastAppliedDraftRef.current = serialized;
      return;
    }

    lastEmittedDraftRef.current = serialized;
    lastAppliedDraftRef.current = serialized;
    onDraftChange?.(nextDraft);
  }, [strasse, hausnummer, plz, ort, objektart, kaufpreis, nebenkosten, sanierungskosten, erhaltungsaufwandJahre, baujahr, bodenAnteilPct, wohnflaeche, miteigentumsanteil, modZeitraeume, showDetails, showModTable, bundesland, afaModus, afaSatzManuell, rndManuell, gutachterQuelle, nebenkostenPctManuell, kernsanierungAktiv, kernsanierungJahr, kernsanierungUmfang, onDraftChange]);

  const handleSanierungChange = (v: number) => {
    setSanierungskosten(v);
    onSanierungskostenChange?.(v);
  };
  const handleJahreChange = (v: string) => {
    const n = Math.max(1, Math.min(5, parseInt(v, 10) || 1));
    setErhaltungsaufwandJahre(n);
    onErhaltungsaufwandJahreChange?.(n);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Objektinformationen */}
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Objektinformationen</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><Label className="text-xs">Straße</Label><Input value={strasse} onChange={e => { setStrasse(e.target.value); setAdresseManuallyEdited(true); }} className="h-8 mt-1" /></div>
              <div><Label className="text-xs">Hausnr.</Label><Input value={hausnummer} onChange={e => { setHausnummer(e.target.value); setAdresseManuallyEdited(true); }} className="h-8 mt-1" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">PLZ</Label><Input value={plz} onChange={e => { setPlz(e.target.value); setAdresseManuallyEdited(true); }} className="h-8 mt-1" /></div>
              <div className="col-span-2"><Label className="text-xs">Ort</Label><Input value={ort} onChange={e => { setOrt(e.target.value); setAdresseManuallyEdited(true); }} className="h-8 mt-1" /></div>
            </div>
            <div>
              <Label className="text-xs">Grundstücks-/Objektart</Label>
              <Select value={objektart} onValueChange={setObjektart}>
                <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{OBJEKTART_GND.map(o => <SelectItem key={o.value} value={o.label}>{o.label} · GND {o.gnd}J</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Bestimmt die Gesamtnutzungsdauer (GND) für die RND-Formel.</p>
            </div>
          </div>
        </Card>

        {/* Wirtschaftliche Daten */}
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /> Wirtschaftliche Daten</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Kaufpreis (ohne NK) €</Label>
                <EuroInput
                  value={kaufpreis}
                  onChange={v => {
                    setKaufpreis(v);
                    setKaufpreisManuallyEdited(true);
                  }}
                  className="h-8 mt-1"
                />
                {computedKaufpreis !== undefined && computedKaufpreis > 0 && kaufpreisManuallyEdited && kaufpreis !== computedKaufpreis && (
                  <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => { setKaufpreis(computedKaufpreis); setKaufpreisManuallyEdited(false); }}>
                    Berechneter Wert aus Wohnungen: {fmtFull(computedKaufpreis)} — übernehmen
                  </button>
                )}
                {!kaufpreisManuallyEdited && computedKaufpreis !== undefined && computedKaufpreis > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Automatisch berechnet aus den Verkaufspreisen der Wohnungen</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Kaufpreis pro m² (€)</Label>
                <EuroInput
                  value={wohnflaeche > 0 ? Math.round((kaufpreis / wohnflaeche) * 100) / 100 : 0}
                  onChange={v => {
                    if (wohnflaeche > 0) {
                      setKaufpreis(Math.round(v * wohnflaeche * 100) / 100);
                      setKaufpreisManuallyEdited(true);
                    }
                  }}
                  className="h-8 mt-1"
                  disabled={wohnflaeche <= 0}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {wohnflaeche > 0
                    ? `Bezugsgröße: ${wohnflaeche.toLocaleString("de-DE")} m² Wohnfläche`
                    : "Wohnfläche erforderlich für Berechnung"}
                </p>
              </div>
            </div>
            <div>
              <Label className="text-xs">Bundesland (für Nebenkostenberechnung)</Label>
              <Select value={bundesland} onValueChange={v => {
                setBundesland(v);
                setBundeslandManuallyEdited(true);
                setNebenkostenManuallyEdited(false);
                // Bundesland-Wahl überschreibt manuellen Satz und Nebenkosten gesamt
                setNebenkostenPctManuell(0);
                if (kaufpreis > 0) {
                  const bl = BUNDESLAND_NK.find(b => b.value === v);
                  if (bl && bl.pct > 0) setNebenkosten(nebenkostenBetrag(kaufpreis, bl.pct));
                }
              }}>
                <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUNDESLAND_NK.map(bl => (
                    <SelectItem key={bl.value} value={bl.value}>{bl.label}{bl.pct > 0 ? ` (${bl.pct.toLocaleString("de-DE")} %, davon ${bl.grEst.toLocaleString("de-DE")} % GrESt)` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!bundeslandManuallyEdited && plz && bundeslandFromPlz(plz) && (
                <p className="text-[10px] text-muted-foreground mt-1">Automatisch aus PLZ {plz} ermittelt – manuell änderbar.</p>
              )}
              {bundeslandManuallyEdited && (
                <button type="button" className="text-[10px] text-primary hover:underline mt-1" onClick={() => { setBundeslandManuallyEdited(false); const d = bundeslandFromPlz(plz); if (d) { setBundesland(d); setNebenkostenManuallyEdited(false); } }}>
                  Auf automatische Ermittlung aus PLZ zurücksetzen
                </button>
              )}
              <div className="mt-2">
                <Label className="text-xs">Nebenkostensatz manuell (%) – überschreibt Bundesland</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={20}
                  value={nebenkostenPctManuell || ""}
                  placeholder="z. B. 8.5"
                  onChange={e => {
                    const v = parseFloat(e.target.value.replace(",", "."));
                    const pct = isFinite(v) && v > 0 ? v : 0;
                    setNebenkostenPctManuell(pct);
                    setNebenkostenManuallyEdited(false);
                    // Direkt neu berechnen
                    if (kaufpreis > 0) {
                      if (pct > 0) {
                        setNebenkosten(nebenkostenBetrag(kaufpreis, pct));
                      } else if (bundesland !== "andere") {
                        const bl = BUNDESLAND_NK.find(b => b.value === bundesland);
                        if (bl && bl.pct > 0) setNebenkosten(nebenkostenBetrag(kaufpreis, bl.pct));
                      }
                    }
                  }}
                  className="h-8 mt-1"
                />
                {nebenkostenPctManuell > 0 ? (
                  <p className="text-[10px] text-primary mt-1">
                    Manueller Satz aktiv: {nebenkostenPctManuell.toLocaleString("de-DE")}% – Bundesland-Satz wird ignoriert.
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground mt-1">Leer lassen, um den Bundesland-Satz zu verwenden.</p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Nebenkosten gesamt (€)</Label>
              <EuroInput value={nebenkosten} onChange={v => {
                setNebenkosten(v);
                setNebenkostenManuallyEdited(true);
                // Rückrechnung: aus Nebenkosten gesamt den manuellen Satz ableiten
                if (kaufpreis > 0 && v > 0) {
                  const pct = Math.round((v / kaufpreis) * 1000) / 10; // 1 Dezimalstelle
                  setNebenkostenPctManuell(pct);
                }
              }} className="h-8 mt-1" />
              {nebenkostenPctManuell > 0 && !nebenkostenManuallyEdited && kaufpreis > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Automatisch berechnet: {nebenkostenPctManuell.toLocaleString("de-DE")}% (manuell) von {fmtFull(kaufpreis)}
                </p>
              )}
              {nebenkostenPctManuell <= 0 && bundesland !== "andere" && !nebenkostenManuallyEdited && kaufpreis > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Automatisch berechnet: {BUNDESLAND_NK.find(b => b.value === bundesland)?.pct}% von {fmtFull(kaufpreis)}
                </p>
              )}
              {nebenkostenManuallyEdited && (nebenkostenPctManuell > 0 || bundesland !== "andere") && (
                <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => {
                  const pct = nebenkostenPctManuell > 0
                    ? nebenkostenPctManuell
                    : (BUNDESLAND_NK.find(b => b.value === bundesland)?.pct || 0);
                  if (pct > 0 && kaufpreis > 0) { setNebenkosten(nebenkostenBetrag(kaufpreis, pct)); setNebenkostenManuallyEdited(false); }
                }}>
                  {(() => {
                    const pct = nebenkostenPctManuell > 0
                      ? nebenkostenPctManuell
                      : (BUNDESLAND_NK.find(b => b.value === bundesland)?.pct || 0);
                    return `Berechneten Wert übernehmen (${pct.toLocaleString("de-DE")}%) — ${fmtFull(nebenkostenBetrag(kaufpreis, pct))}`;
                  })()}
                </button>
              )}
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Info className="h-3 w-3" /> Grunderwerbsteuer Stand Juli 2026, zuzüglich rund 2 % für Notar und Grundbuch. Eine Maklercourtage ist nicht enthalten, sie lässt sich über den manuellen Satz ergänzen.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Erhaltungsaufwand gesamt (€)</Label>
                <EuroInput value={sanierungskosten} onChange={handleSanierungChange} className="h-8 mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Reparaturen / Renovierungen – sofort absetzbar nach §82b EStDV (NICHT in AfA-Basis). Anteilig pro Wohnung verteilt.</p>
              </div>
              {sanierungskosten > 0 && (
                <div>
                  <Label className="text-xs">Verteilung (Jahre)</Label>
                  <Select value={String(erhaltungsaufwandJahre)} onValueChange={handleJahreChange}>
                    <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5].map(n => (
                        <SelectItem key={n} value={String(n)}>{n === 1 ? "1 Jahr (voll)" : `${n} Jahre`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">§82b EStDV – Wahlrecht 1–5 Jahre.</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Ursprüngliches Baujahr</Label><Input type="number" min={1800} max={new Date().getFullYear()} value={baujahr || ""} onChange={e => setBaujahr(Number(e.target.value) || 0)} className="h-8 mt-1" /></div>
              <div><Label className="text-xs">Gebäudealter</Label><div className="h-8 mt-1 bg-muted/50 rounded-md flex items-center px-3 text-sm font-medium">{ergebnis.baujahrBekannt ? `${ergebnis.alter} Jahre` : "–"}</div></div>
            </div>
          </div>
        </Card>

        {/* Grundstücksdaten */}
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-4">Grundstücksdaten</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Grundstücksanteil (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={bodenAnteilPct || ""}
                onChange={e => setBodenAnteilPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="h-8 mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Pauschaler Anteil des Grundstücks am Kaufpreis. Der Wert ist eine Annahme und keine Ableitung aus dem
                Bodenrichtwert. In gefragten Lagen liegt er bei einer Eigentumswohnung oft deutlich über 20 %. Ein zu
                niedriger Ansatz vergrößert den Gebäudeanteil und damit die ausgewiesene AfA.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Bodenwert gesamt</p>
              <p className="text-lg font-bold">{fmtFull(ergebnis.bodenwertGesamt)}</p>
              <p className="text-[10px] text-muted-foreground">{fmtFull(kaufpreis)} × {bodenAnteilPct.toLocaleString("de-DE")} %</p>
            </div>
          </div>
        </Card>

        {/* Gebäudedaten */}
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-4">Gebäudedaten</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Wohnfläche (m²)</Label>
              <Input type="number" min={0} step="0.01" value={wohnflaeche || ""} onChange={e => { setWohnflaeche(Math.round((Number(e.target.value) || 0) * 100) / 100); setWohnflaecheManuallyEdited(true); }} className="h-8 mt-1" />
              {computedWohnflaeche !== undefined && computedWohnflaeche > 0 && wohnflaecheManuallyEdited && wohnflaeche !== Math.round(computedWohnflaeche * 100) / 100 && (
                <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => { setWohnflaeche(Math.round(computedWohnflaeche * 100) / 100); setWohnflaecheManuallyEdited(false); }}>
                  Berechneter Wert aus Wohnungen: {(Math.round(computedWohnflaeche * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m² — übernehmen
                </button>
              )}
              {!wohnflaecheManuallyEdited && computedWohnflaeche !== undefined && computedWohnflaeche > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Automatisch berechnet aus den Wohnflächen der Wohnungen</p>
              )}
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><Info className="h-3 w-3" /> Bitte manuell überprüfen</p>
            </div>
            <div><Label className="text-xs">Miteigentumsanteil (‰)</Label><Input type="number" min={0} max={1000} value={miteigentumsanteil || ""} onChange={e => setMiteigentumsanteil(Number(e.target.value) || 0)} className="h-8 mt-1" /></div>
          </div>
        </Card>
      </div>

      {slotBeforeModus}

      {/* Kernsanierung */}
      <Card className="p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-sm">Kernsanierung</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Bei einer Kernsanierung wird das Sanierungsjahr als fiktives Baujahr für die RND-Formel verwendet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="ks-toggle" className="text-xs">Kernsanierung durchgeführt</Label>
            <Switch id="ks-toggle" checked={kernsanierungAktiv} onCheckedChange={setKernsanierungAktiv} />
          </div>
        </div>
        {kernsanierungAktiv && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div>
              <Label className="text-xs">Jahr der Kernsanierung</Label>
              <Input
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                value={kernsanierungJahr ?? ""}
                onChange={e => setKernsanierungJahr(Number(e.target.value) || undefined)}
                placeholder="z. B. 2020"
                className="h-8 mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Wird als fiktives Baujahr für die RND-Berechnung herangezogen.</p>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Umfang der Kernsanierung</Label>
              <Textarea
                value={kernsanierungUmfang}
                onChange={e => setKernsanierungUmfang(e.target.value)}
                placeholder="z. B. Dach, Fenster, Heizung, Leitungen, Bäder, Innenausbau …"
                rows={2}
                className="mt-1 text-sm"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Modus-Umschalter: Berechnen vs. RND-Gutachten */}
      {!hideModusToggle && (
      <Card className="p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-sm">Wie soll die AfA bestimmt werden?</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {afaModus === "berechnen"
                ? "AfA wird über die Modernisierungsbewertung nach Anlage 2 ImmoWertV errechnet."
                : "AfA-Satz und Restnutzungsdauer werden aus einem vorliegenden Gutachten direkt übernommen."}
            </p>
          </div>
          <Tabs value={afaModus} onValueChange={(v) => setAfaModus(v as AfaModus)}>
            <TabsList>
              <TabsTrigger value="berechnen" className="gap-1.5">
                <Calculator className="h-3.5 w-3.5" /> AfA berechnen
              </TabsTrigger>
              <TabsTrigger value="gutachten" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" /> RND-Gutachten liegt vor
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>
      )}

      {!hideModusToggle && afaModus === "gutachten" && (
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-2">Werte aus Restnutzungsdauer-Gutachten</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Trage entweder die <strong>Restnutzungsdauer (Jahre)</strong> oder den <strong>AfA-Satz (%)</strong> ein, der jeweils andere Wert wird automatisch berechnet (AfA-Satz = 100 / RND).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Restnutzungsdauer (Jahre)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                step="1"
                value={rndManuell || ""}
                onChange={e => {
                  const n = Number(e.target.value) || 0;
                  setRndManuell(n);
                  if (n > 0) setAfaSatzManuell(Math.round((100 / n) * 100) / 100);
                }}
                className="h-9 mt-1"
                placeholder="z.B. 17"
              />
            </div>
            <div>
              <Label className="text-xs">AfA-Satz (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={afaSatzManuell || ""}
                onChange={e => {
                  const v = Number(e.target.value) || 0;
                  setAfaSatzManuell(v);
                  if (v > 0) setRndManuell(Math.max(1, Math.round(100 / v)));
                }}
                className="h-9 mt-1"
                placeholder="z.B. 5,88"
              />
            </div>
            <div>
              <Label className="text-xs">Gutachter / Quelle (optional)</Label>
              <Input
                value={gutachterQuelle}
                onChange={e => setGutachterQuelle(e.target.value)}
                className="h-9 mt-1"
                placeholder="z.B. Sachverständigenbüro Müller"
              />
            </div>
          </div>
          <div className="mt-4 p-3 bg-[hsl(var(--info))]/5 border border-[hsl(var(--info))]/20 rounded-lg flex items-start gap-2">
            <Info className="h-4 w-4 text-[hsl(var(--info))] mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Die Modernisierungsbewertung entfällt in diesem Modus. Die unten angezeigten Werte (AfA p.a., Gebäude-/Bodenanteil) basieren auf deiner Eingabe.
            </p>
          </div>
        </Card>
      )}

      {/* Modernisierung – nur im Modus "berechnen" */}
      {afaModus === "berechnen" && (
      <Card className="p-5">
        <h3 className="font-bold text-sm mb-4">Modernisierungsbewertung</h3>
        <p className="text-xs text-muted-foreground mb-1">Bewerte den Modernisierungszustand. Je aktueller die Modernisierungen, desto höher der Modernisierungsgrad und desto länger die Restnutzungsdauer.</p>
        <p className="text-[11px] text-muted-foreground mb-4">
          Die acht Elemente und ihre Punkte stehen so in der Anlage 2 ImmoWertV. Wie stark zurückliegende Maßnahmen
          abgewertet werden, gibt die Verordnung nicht vor, das überlässt sie der sachverständigen Würdigung. Die
          Staffel 100, 85, 60, 35 und 10 Prozent ist eine Annahme dieses Rechners.
        </p>
        <div className="space-y-3">
          {MOD_ELEMENTE.map(el => {
            const zeitraum = modZeitraeume[el.key] || "keine";
            const option = ZEITRAUM_OPTIONEN.find(o => o.value === zeitraum);
            const punkte = option ? Math.round(el.maxPunkte * option.faktor) : 0;
            return (
              <div key={el.key} className="flex items-center gap-3">
                <div className="flex-1 min-w-0"><p className="text-sm truncate">{el.label}</p><p className="text-[10px] text-muted-foreground">max. {el.maxPunkte} Punkte</p></div>
                <Select value={zeitraum} onValueChange={v => setModZeitraeume(prev => ({ ...prev, [el.key]: v }))}><SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger><SelectContent>{ZEITRAUM_OPTIONEN.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
                <Badge variant="outline" className="w-10 justify-center text-xs">{punkte}</Badge>
              </div>
            );
          })}
        </div>
        <Separator className="my-4" />
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-semibold">Modernisierungspunkte gesamt</p><p className="text-xs text-muted-foreground">max. {MAX_MOD_PUNKTE_ANZEIGE} Punkte möglich</p></div>
          <div className="text-right"><p className="text-2xl font-bold text-primary">{ergebnis.modPunkte}</p><p className="text-xs text-muted-foreground">Formel ab {ergebnis.params.abRelativemAlter} % relativem Alter</p></div>
        </div>
        <button className="text-xs text-primary flex items-center gap-1 mt-3 hover:underline" onClick={() => setShowModTable(!showModTable)}>
          {showModTable ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Parameter-Tabelle {showModTable ? "ausblenden" : "anzeigen"}
        </button>
        {showModTable && (
          <div className="mt-3 border rounded-lg overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0"><tr><th className="px-2 py-1 text-left">Punkte</th><th className="px-2 py-1 text-right">a</th><th className="px-2 py-1 text-right">b</th><th className="px-2 py-1 text-right">c</th><th className="px-2 py-1 text-right">rel. RND</th></tr></thead>
              <tbody>{RND_PARAMETER.map(row => (<tr key={row.punkte} className={row.punkte === ergebnis.modPunkte ? "bg-primary/10 font-semibold" : ""}><td className="px-2 py-0.5">{row.punkte}</td><td className="px-2 py-0.5 text-right">{row.a}</td><td className="px-2 py-0.5 text-right">{row.b}</td><td className="px-2 py-0.5 text-right">{row.c}</td><td className="px-2 py-0.5 text-right">{row.abRelativemAlter}%</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
      )}

      {/* Ergebnis */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm">Berechnung und Ergebnis</h3>
          <button className="text-xs text-primary flex items-center gap-1 hover:underline" onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {showDetails ? "Rechenweg ausblenden" : "Rechenweg anzeigen"}
          </button>
        </div>
        <div className="space-y-2 mb-4">
          {ergebnis.untergrenze.untergrenzeGreift && ergebnis.afaSatz > 0 && (
            <div className="rounded-lg border border-[hsl(var(--info))]/30 bg-[hsl(var(--info))]/5 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-[hsl(var(--info))] mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Aus der Restnutzungsdauer ergäben sich {ergebnis.afaSatzRoh.toFixed(2)} %. Das Gesetz gibt für dieses
                Objekt {ergebnis.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} % her
                ({ergebnis.untergrenze.gesetzlich.grund}, {ergebnis.untergrenze.gesetzlich.paragraf}). Angesetzt wird
                deshalb der gesetzliche Satz, denn niemand schreibt freiwillig langsamer ab.
              </p>
            </div>
          )}
          {ergebnis.untergrenze.nachweisNoetig && ergebnis.afaSatz > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Der Satz liegt über dem gesetzlichen von{" "}
                {ergebnis.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} %. Zulässig ist das nur bei einer
                kürzeren tatsächlichen Nutzungsdauer nach § 7 Abs. 4 Satz 2 EStG. Darlegen lässt sie sich mit jeder im
                Einzelfall geeigneten Methode. Der Modellwert nach ImmoWertV allein trägt dafür nicht, weil er nicht
                auf das konkrete Gebäude eingeht. Dafür braucht es eine objektbezogene Begutachtung, und ob das
                Finanzamt ihr folgt, entscheidet es im Einzelfall.
              </p>
            </div>
          )}
          {sanierungskosten > 0 && ergebnis.anschaffungsnah.ueberschritten && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Anschaffungsnahe Herstellungskosten.</strong> Der Erhaltungsaufwand
                von {fmt(sanierungskosten)} übersteigt 15 % der Gebäude-Anschaffungskosten
                ({fmt(ergebnis.anschaffungsnah.grenze)}). Fällt er innerhalb von drei Jahren nach dem Kauf an, ist er
                nach § 6 Abs. 1 Nr. 1a EStG nicht sofort absetzbar, sondern erhöht die AfA-Bemessungsgrundlage. Genau
                so ist er hier gerechnet.
              </p>
            </div>
          )}
          {sanierungskosten > 0 && !ergebnis.anschaffungsnah.ueberschritten && ergebnis.anschaffungsnah.auslastung > 0.8 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Der Erhaltungsaufwand liegt bei {(ergebnis.anschaffungsnah.auslastung * 100).toFixed(0)} % der
                15-Prozent-Grenze ({fmt(ergebnis.anschaffungsnah.grenze)}). Noch{" "}
                {fmt(Math.abs(ergebnis.anschaffungsnah.abstand))} Spielraum, bevor daraus anschaffungsnahe
                Herstellungskosten werden.
              </p>
            </div>
          )}
        </div>
        {showDetails && (
          <div className="space-y-4 mb-6 text-sm bg-muted/30 rounded-lg p-4">
            <div><p className="font-semibold text-xs uppercase text-muted-foreground mb-1">Bodenwert</p><p>{fmtFull(kaufpreis)} × {bodenAnteilPct.toLocaleString("de-DE")} % = <strong>{fmtFull(ergebnis.bodenwertGesamt)}</strong></p></div>
            <Separator />
            <div><p className="font-semibold text-xs uppercase text-muted-foreground mb-1">Vorläufiger Ertragswert Gebäude</p><p>Kaufpreis {fmtFull(kaufpreis)} − Bodenwert {fmtFull(ergebnis.bodenwertGesamt)} = <strong>{fmtFull(ergebnis.gebaeudewert)}</strong></p></div>
            <Separator />
            <div>
              <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">Restnutzungsdauer (RND)</p>
              {!ergebnis.baujahrBekannt ? (
                <p className="text-muted-foreground">
                  Ohne Baujahr lässt sich das Gebäudealter nicht bestimmen. Trage es oben ein, dann erscheint hier der
                  vollständige Rechenweg.
                </p>
              ) : (
              <>
              <p className="mb-1">
                Relatives Gebäudealter: {ergebnis.alter} / {ergebnis.gnd} ={" "}
                <strong>{ergebnis.rndErgebnis.relativesAlter.toFixed(1)} %</strong>, Schwelle laut Anlage 2 bei{" "}
                {ergebnis.rndErgebnis.schwelle} %.
              </p>
              {ergebnis.rndErgebnis.unterSchwelle ? (
                <>
                  <p className="text-muted-foreground">
                    Unterhalb der Schwelle wirken sich Modernisierungen noch nicht aus. Es gilt
                    Gesamtnutzungsdauer minus Alter.
                  </p>
                  <p className="font-mono text-xs bg-background p-2 rounded border my-1">RND = GND − Alter</p>
                  <p className="font-mono text-xs">= {ergebnis.gnd} − {ergebnis.alter} = {ergebnis.gnd - ergebnis.alter}</p>
                </>
              ) : (
                <>
                  <p className="font-mono text-xs bg-background p-2 rounded border my-1">RND = a × (Alter² / GND) − b × Alter + c × GND</p>
                  <p className="font-mono text-xs">= {ergebnis.params.a} × ({ergebnis.alter}² / {ergebnis.gnd}) − {ergebnis.params.b} × {ergebnis.alter} + {ergebnis.params.c} × {ergebnis.gnd}</p>
                  <p className="font-mono text-xs">= {ergebnis.params.a} × {((ergebnis.alter * ergebnis.alter) / ergebnis.gnd).toFixed(2)} − {(ergebnis.params.b * ergebnis.alter).toFixed(2)} + {(ergebnis.params.c * ergebnis.gnd).toFixed(2)} = {ergebnis.rndErgebnis.rndFormel.toFixed(1)}</p>
                </>
              )}
              {ergebnis.rndErgebnis.gedeckelt && (
                <p className="text-muted-foreground mt-1">
                  Gedeckelt auf {ergebnis.kernsaniert ? "90" : "70"} % der Gesamtnutzungsdauer ={" "}
                  {ergebnis.rndErgebnis.deckel.toFixed(0)} Jahre.
                </p>
              )}
              <p className="mt-1">= <strong>{ergebnis.rnd} Jahre</strong></p>
              </>
              )}
            </div>
            <Separator />
            <div>
              <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">AfA-Satz</p>
              {ergebnis.rnd > 0 && (
                <p>Aus der Restnutzungsdauer: 100 / {ergebnis.rnd} = <strong>{ergebnis.afaSatzRoh.toFixed(2)} %</strong></p>
              )}
              <p>
                Gesetzlich nach {ergebnis.untergrenze.gesetzlich.paragraf}:{" "}
                <strong>{ergebnis.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} %</strong>{" "}
                ({ergebnis.untergrenze.gesetzlich.grund})
              </p>
              <p className="font-semibold mt-1">
                Angesetzt: {ergebnis.afaSatz > 0 ? `${ergebnis.afaSatz.toFixed(2)} %` : "noch nichts, das Baujahr fehlt"}
              </p>
            </div>
            <Separator />
            <div>
              <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">Steuerlich absetzbar</p>
              <p>Gebäudeanteil: {fmtFull(ergebnis.steuerlichGebaeude)} ({ergebnis.gebaeudePct.toFixed(1)}%)</p>
              <p>NK-Anteil Gebäude: {fmtFull(ergebnis.steuerlichNK)}</p>
              {sanierungskosten > 0 && (
                ergebnis.anschaffungsnah.ueberschritten ? (
                  <p className="text-muted-foreground">
                    Erhaltungsaufwand {fmtFull(sanierungskosten)} übersteigt die 15-Prozent-Grenze von{" "}
                    {fmtFull(ergebnis.anschaffungsnah.grenze)} und zählt damit zu den anschaffungsnahen
                    Herstellungskosten. Er ist in der AfA-Bemessungsgrundlage enthalten.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Erhaltungsaufwand {fmtFull(sanierungskosten)} bleibt unter der 15-Prozent-Grenze von{" "}
                    {fmtFull(ergebnis.anschaffungsnah.grenze)} und fließt deshalb nicht in die AfA-Basis, sondern ist
                    sofort absetzbar (§ 82b EStDV{erhaltungsaufwandJahre > 1 ? `, auf ${erhaltungsaufwandJahre} Jahre verteilt` : ""}).
                  </p>
                )
              )}
              <p className="font-semibold mt-1">AfA-Bemessungsgrundlage: {fmtFull(ergebnis.afaBemessungsgrundlage)}</p>
              <p>AfA p.a.: {fmtFull(ergebnis.afaBetragPa)}</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center"><p className="text-[10px] uppercase text-muted-foreground mb-1">Gebäudeanteil</p><p className="text-lg font-bold">{fmt(ergebnis.gebaeudewert)}</p><p className="text-sm text-primary font-semibold">{ergebnis.gebaeudePct.toFixed(1)}%</p></div>
          <div className="bg-muted/50 rounded-lg p-4 text-center"><p className="text-[10px] uppercase text-muted-foreground mb-1">Bodenanteil</p><p className="text-lg font-bold">{fmt(ergebnis.bodenwertGesamt)}</p><p className="text-sm text-primary font-semibold">{ergebnis.bodenPct.toFixed(1)}%</p></div>
          <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4 text-center"><p className="text-[10px] uppercase text-muted-foreground mb-1">Restnutzungsdauer</p><p className="text-2xl font-bold text-primary">{ergebnis.rnd > 0 ? `${ergebnis.rnd} Jahre` : "–"}</p><p className="text-[10px] text-muted-foreground">{afaModus === "gutachten" ? "lt. Gutachten" : ergebnis.baujahrBekannt ? `Mod.-Punkte: ${ergebnis.modPunkte}` : "Baujahr fehlt"}</p></div>
          <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4 text-center"><p className="text-[10px] uppercase text-muted-foreground mb-1">AfA-Satz</p><p className="text-2xl font-bold text-primary">{ergebnis.afaSatz > 0 ? `${ergebnis.afaSatz.toFixed(2)} %` : "–"}</p><p className="text-[10px] text-muted-foreground">{ergebnis.afaSatz <= 0 ? "Baujahr fehlt" : ergebnis.untergrenze.untergrenzeGreift ? `gesetzlicher Mindestsatz (${ergebnis.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} %)` : `= 100 / ${ergebnis.rnd}`}</p></div>
        </div>
        {afaModus === "berechnen" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-[10px] uppercase text-muted-foreground mb-1">Effektives Baujahr</p>
              <p className="text-lg font-bold">{ergebnis.baujahrBekannt ? ergebnis.effektivesBaujahr : "–"}</p>
              <p className="text-[10px] text-muted-foreground">{!ergebnis.baujahrBekannt ? "noch nicht eingetragen" : kernsanierungAktiv && kernsanierungJahr ? "Kernsanierungsjahr" : "Original-Baujahr"}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-[10px] uppercase text-muted-foreground mb-1">Relatives Gebäudealter</p>
              <p className="text-lg font-bold">{ergebnis.baujahrBekannt ? `${ergebnis.rndErgebnis.relativesAlter.toFixed(0)} %` : "–"}</p>
              <p className="text-[10px] text-muted-foreground">
                {!ergebnis.baujahrBekannt
                  ? "Baujahr eintragen"
                  : ergebnis.rndErgebnis.unterSchwelle
                  ? `unter der Schwelle von ${ergebnis.rndErgebnis.schwelle} %`
                  : `Schwelle ${ergebnis.rndErgebnis.schwelle} % erreicht`}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-[10px] uppercase text-muted-foreground mb-1">Gesamtnutzungsdauer (GND)</p>
              <p className="text-lg font-bold">{ergebnis.gnd} Jahre</p>
              <p className="text-[10px] text-muted-foreground">{objektart}</p>
            </div>
          </div>
        )}
        <Separator className="my-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-muted/50 rounded-lg p-4"><p className="text-[10px] uppercase text-muted-foreground mb-1">Steuerlich absetzbar (Gebäude)</p><p className="text-lg font-bold">{fmt(ergebnis.steuerlichGebaeude)}</p></div>
          <div className="bg-muted/50 rounded-lg p-4"><p className="text-[10px] uppercase text-muted-foreground mb-1">Absetzbarer NK-Anteil</p><p className="text-lg font-bold">{fmt(ergebnis.steuerlichNK)}</p></div>
          <div className="bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 rounded-lg p-4"><p className="text-[10px] uppercase text-muted-foreground mb-1">AfA p.a.</p><p className="text-lg font-bold text-[hsl(var(--success))]">{fmt(ergebnis.afaBetragPa)}</p><p className="text-[10px] text-muted-foreground">= {ergebnis.afaSatz.toFixed(2)}% von {fmt(ergebnis.afaBemessungsgrundlage)}</p></div>
        </div>
      </Card>

    </div>
  );
}
