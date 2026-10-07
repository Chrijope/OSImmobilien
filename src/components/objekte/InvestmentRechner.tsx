import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { EuroInput } from "@/components/ui/euro-input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart } from "recharts";
import { Download, TrendingUp, Percent, Building2, Calculator, PiggyBank, ChevronDown, ChevronUp, AlertTriangle, Plus, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import jsPDF from "jspdf";
import { estimateGrenzsteuersatz, reverseSteuersatzZuZvE, berechneSteuerersparnis } from "@/lib/steuerHelper";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number) => `${v.toFixed(2)} %`;

interface Tranche {
  id: string;
  bezeichnung: string;
  betrag: number;
  zinssatz: number;
  tilgung: number;
}

interface InvestmentRechnerProps {
  modus: "objekt" | "wohnung";
  kaufpreis: number;
  mieteMonat: number;
  objektTitel: string;
  weNr?: string;
  editable?: boolean;
  sanierungskosten?: number;
  tausendstel?: number;
  /** Wohnfläche in m² (für Modernisierungsumlage) */
  groesse?: number;
  /** User role for visibility control */
  userRole?: string;
  /** Unique key for saving/loading analysis (e.g. objektId or objektId-weId) */
  analyseKey?: string;
  /** AfA-Voreinstellungen aus Objektanlage */
  initialAfaModell?: "linear" | "degressiv" | "gutachten";
  initialAfaSatz?: number;
  initialRestnutzungsdauer?: number;
  initialGrundAnteilPct?: number;
  /** Bodenrichtwert €/m² aus AfA-Rechner */
  initialBodenrichtwert?: number;
  /** Grundstücksfläche m² aus Objektdaten */
  initialGrundstuecksflaeche?: number;
  /** Baujahr aus Objektdaten */
  initialBaujahr?: number;
  /** Kaufnebenkosten % aus Objektdaten */
  initialKaufnebenkosten?: number;
  /** Sprache des Kunden für das PDF (Plan Kundensprache, D14). Ohne Angabe Deutsch. */
  pdfSprache?: "de" | "en";
  /** Geplante Mieterhöhung */
  neueMiete?: number;
  /** Datum der Mieterhöhung (YYYY-MM-DD) */
  mieterhoehungAb?: string;
}

interface JahresZeile {
  jahr: number;
  afa: number;
  zinsen: number;
  tilgung: number;
  hausgeldNu: number;
  abzuegeSumme: number;
  steuerlichesErgebnis: number;
  steuerersparnis: number;
  miete: number;
  cashflowBrutto: number;
  cashflowNetto: number;
  eigenbelastungVorSteuer: number;
  eigenbelastungNachSteuer: number;
  tilgungKumuliert: number;
  wertsteigerungJahr: number;
  vermoegenAufbau: number;
  vermoegenKumuliert: number;
  restschuld: number;
  immobilienWert: number;
  renditeNachSteuer: number;
}

export function InvestmentRechner({
  modus,
  kaufpreis: initialKaufpreis,
  mieteMonat: initialMiete,
  objektTitel,
  weNr,
  editable = false,
  sanierungskosten: initialSanierung = 0,
  tausendstel,
  groesse: initialGroesse = 0,
  userRole = "",
  analyseKey,
  initialAfaModell,
  initialAfaSatz,
  initialRestnutzungsdauer,
  initialGrundAnteilPct,
  initialBodenrichtwert,
  initialGrundstuecksflaeche,
  initialBaujahr,
  initialKaufnebenkosten,
  neueMiete: propNeueMiete,
  mieterhoehungAb: propMieterhoehungAb,
  pdfSprache,
}: InvestmentRechnerProps) {
  const isAdmin = ["admin", "inhaber"].includes(userRole);
  // Editable base values
  const [kaufpreis, setKaufpreis] = useState(initialKaufpreis);
  const [mieteMonat, setMieteMonat] = useState(initialMiete);
  const mieteJahr = mieteMonat * 12;
  // effektive Miete: bei aktiver Sanierung wird neueMiete (inkl. Modernisierungsumlage) verwendet
  // Hinweis: neueMiete wird weiter unten berechnet – wir verwenden eine abgeleitete Variable im useMemo

  // Parameters – Steuer wird aus zu versteuerndem Einkommen abgeleitet
  const [zvE, setZvE] = useState<number>(reverseSteuersatzZuZvE(36, false));
  const [verheiratet, setVerheiratet] = useState<boolean>(false);
  const steuersatz = useMemo(() => estimateGrenzsteuersatz(zvE, verheiratet), [zvE, verheiratet]);
  const [betrachtungszeitraum, setBetrachtungszeitraum] = useState<10 | 20 | 30>(10);
  const [mietSteigerung, setMietSteigerung] = useState(2);
  const [wertSteigerung, setWertSteigerung] = useState(2);
  const [showTable, setShowTable] = useState(false);

  // Grund & Boden
  const [grundAnteilPct, setGrundAnteilPct] = useState(initialGrundAnteilPct ?? 20);
  const gebaeudeAnteilPct = 100 - grundAnteilPct;

  // AfA
  const [afaModell, setAfaModell] = useState<"linear" | "degressiv" | "gutachten">(initialAfaModell ?? "linear");
  const [afaSatz, setAfaSatz] = useState(initialAfaSatz ?? 2); // 2% standard (gesetzlich linear)
  const [restnutzungsdauer, setRestnutzungsdauer] = useState(initialRestnutzungsdauer ?? 50); // Jahre (100/2)

  // Finanzierung – Standard: 1 Tranche, Kaufpreis, 4% Zins, 1.5% Tilgung
  const [tranchen, setTranchen] = useState<Tranche[]>([
    { id: "t1", bezeichnung: "Bankdarlehen", betrag: initialKaufpreis, zinssatz: 4.5, tilgung: 1.5 },
  ]);

  const [nkPct, setNkPct] = useState(5);
  // Nebenkosten & Hausgeld (Standard: 4,50 €/m² Wohnfläche, davon 3,00 € umlagefähig)
  const defaultHausgeld = initialGroesse > 0 ? Math.round(initialGroesse * 4.5) : Math.round(initialMiete * 0.25);
  const [hausgeldMonat, setHausgeldMonat] = useState(defaultHausgeld);
  const [hausgeldUmlagefaehigQm, setHausgeldUmlagefaehigQm] = useState(3.0);
  const hausgeldUmlagefaehig = initialGroesse > 0 ? Math.round(initialGroesse * hausgeldUmlagefaehigQm) : Math.round(hausgeldMonat * 0.67);
  const hausgeldNichtUmlagefaehig = Math.max(0, hausgeldMonat - hausgeldUmlagefaehig);
  const hausgeldJahr = hausgeldMonat * 12;
  const hausgeldNichtUmlagefaehigJahr = hausgeldNichtUmlagefaehig * 12;
  const [eigenkapital, setEigenkapital] = useState(0);

  // Save/Load state
  const STORAGE_KEY = analyseKey ? `mi_analyse_${analyseKey}` : "";
  const [isSaved, setIsSaved] = useState(false);

  // Load saved analysis on mount + sync AfA from object props (source of truth)
  useState(() => {
    if (!STORAGE_KEY) return;
    try {
      const saved = isTestAccount()
        ? (() => { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; })()
        : getUserSetting<any>(`investment_rechner_${analyseKey}`, null);
      if (saved) {
        if (saved.kaufpreis != null) setKaufpreis(saved.kaufpreis);
        if (saved.mieteMonat != null) setMieteMonat(saved.mieteMonat);
        if (saved.zvE != null) setZvE(saved.zvE);
        else if (saved.steuersatz != null) setZvE(reverseSteuersatzZuZvE(saved.steuersatz, !!saved.verheiratet));
        if (saved.verheiratet != null) setVerheiratet(!!saved.verheiratet);
        if (saved.betrachtungszeitraum != null) setBetrachtungszeitraum(saved.betrachtungszeitraum);
        if (saved.mietSteigerung != null) setMietSteigerung(saved.mietSteigerung);
        if (saved.wertSteigerung != null) setWertSteigerung(saved.wertSteigerung);
        // AfA fields from saved data are loaded below ONLY if no object-level AfA props exist
        if (saved.tranchen != null) setTranchen(saved.tranchen);
        if (saved.nkPct != null) setNkPct(saved.nkPct);
        if (saved.hausgeldMonat != null) setHausgeldMonat(saved.hausgeldMonat);
        if (saved.hausgeldUmlagefaehigQm != null) setHausgeldUmlagefaehigQm(saved.hausgeldUmlagefaehigQm);
        if (saved.eigenkapital != null) setEigenkapital(saved.eigenkapital);
        if (saved.sanierungskosten != null) setSanierungskosten(saved.sanierungskosten);
        if (saved.groesse != null) setGroesse(saved.groesse);
        // Only load saved AfA fields if no object-level AfA data was passed as props
        if (initialAfaModell == null && initialAfaSatz == null && initialRestnutzungsdauer == null && initialGrundAnteilPct == null) {
          if (saved.grundAnteilPct != null) setGrundAnteilPct(saved.grundAnteilPct);
          if (saved.afaModell != null) setAfaModell(saved.afaModell);
          if (saved.afaSatz != null) setAfaSatz(saved.afaSatz);
          if (saved.restnutzungsdauer != null) setRestnutzungsdauer(saved.restnutzungsdauer);
        }
        setIsSaved(true);
      }
    } catch { /* ignore */ }

    // If object-level AfA props are provided, they are already set via useState defaults – 
    // but also check AfA-Rechner RND result as a secondary override (only when no object props)
    if (analyseKey && initialAfaModell == null && initialAfaSatz == null && initialRestnutzungsdauer == null) {
      try {
        const parts = analyseKey.split("-");
        const objektId = parts[0];
        const weId = parts.length > 1 ? parts.slice(1).join("-") : null;
        const afaDbKey = weId ? `afa_rnd_${objektId}_${weId}` : `afa_rnd_${objektId}`;
        const afaData = isTestAccount()
          ? (() => { const r = localStorage.getItem(`mi_afa_rnd_${objektId}${weId ? `_${weId}` : ""}`); return r ? JSON.parse(r) : null; })()
          : getUserSetting<any>(afaDbKey, null);
        if (afaData && afaData.rnd > 0) {
          setRestnutzungsdauer(Math.round(afaData.rnd));
          setAfaSatz(parseFloat((100 / afaData.rnd).toFixed(2)));
          setAfaModell("gutachten");
          if (afaData.gebaeudePct > 0) {
            setGrundAnteilPct(Math.round(afaData.bodenPct));
          }
        }
      } catch { /* ignore */ }
    }
  });

  const handleSaveAnalyse = () => {
    if (!STORAGE_KEY) return;
    const data = {
      kaufpreis, mieteMonat, steuersatz, zvE, verheiratet, betrachtungszeitraum, mietSteigerung, wertSteigerung,
      grundAnteilPct, afaModell, afaSatz, restnutzungsdauer, tranchen, nkPct, hausgeldMonat,
      hausgeldUmlagefaehigQm, eigenkapital, sanierungskosten, groesse, savedAt: new Date().toISOString(),
    };
    if (isTestAccount()) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      setUserSetting(`investment_rechner_${analyseKey}`, data);
    }
    setIsSaved(true);
  };



  // Sanierungskosten
  const [sanierungskosten, setSanierungskosten] = useState(initialSanierung);
  const sanierungAnteil = modus === "wohnung" && tausendstel ? Math.round(sanierungskosten * tausendstel / 1000) : sanierungskosten;

  // Modernisierungsumlage (§559 BGB)
  const [groesse, setGroesse] = useState(initialGroesse);
  const [umlagePct, setUmlagePct] = useState(8); // 8% der Modernisierungskosten p.a.
  const [showUmlage, setShowUmlage] = useState(false);

  // Modernisierungsumlage wird angezeigt wenn Sanierungskosten vorhanden
  const showModernisierung = sanierungAnteil > 0;

  const qmMiete = groesse > 0 ? mieteMonat / groesse : 0;
  const umlageNach8Pct = sanierungAnteil > 0 ? (sanierungAnteil * (umlagePct / 100)) / 12 : 0;
  const deckelProQm = qmMiete < 7 ? 2 : 3; // €/m² Deckel
  const maxUmlageDeckel = groesse * deckelProQm;
  const erlaubteUmlage = Math.min(umlageNach8Pct, maxUmlageDeckel);
  const neueMiete = mieteMonat + erlaubteUmlage;
  const neueMieteJahr = neueMiete * 12;
  const gesamtInvestition = kaufpreis + sanierungAnteil;
  const renditeVorher = kaufpreis > 0 ? ((mieteMonat * 12) / kaufpreis) * 100 : 0;
  const renditeNachher = gesamtInvestition > 0 ? (neueMieteJahr / gesamtInvestition) * 100 : 0;

  // Mischzins calculation
  const gesamtDarlehen = tranchen.reduce((s, t) => s + t.betrag, 0);
  const gewichteterZins = gesamtDarlehen > 0 ? tranchen.reduce((s, t) => s + t.betrag * t.zinssatz, 0) / gesamtDarlehen : 0;
  const gewichteteTilgung = gesamtDarlehen > 0 ? tranchen.reduce((s, t) => s + t.betrag * t.tilgung, 0) / gesamtDarlehen : 0;
  const mischAnnuitaet = gewichteterZins + gewichteteTilgung;
  const monatsrate = (gesamtDarlehen * mischAnnuitaet) / 100 / 12;

  // AfA
  const gebaeudeWert = kaufpreis * (gebaeudeAnteilPct / 100);
  const effektiverAfaSatz = afaModell === "gutachten" ? (100 / restnutzungsdauer) : afaSatz;
  const afaJahr = gebaeudeWert * (effektiverAfaSatz / 100);
  // Sanierung kann auch abgeschrieben werden (auf Restnutzungsdauer)
  const afaSanierung = sanierungAnteil > 0 ? sanierungAnteil / restnutzungsdauer : 0;
  const afaGesamt = afaJahr + afaSanierung;

  const gesamtkosten = kaufpreis * (1 + nkPct / 100) + sanierungAnteil;

  const addTranche = () => setTranchen(p => [...p, { id: `t${Date.now()}`, bezeichnung: "", betrag: 0, zinssatz: 0, tilgung: 0 }]);
  const updateTranche = (id: string, field: keyof Tranche, value: string) =>
    setTranchen(p => p.map(t => (t.id === id ? { ...t, [field]: field === "bezeichnung" ? value : parseFloat(value) || 0 } : t)));
  const removeTranche = (id: string) => setTranchen(p => p.filter(t => t.id !== id));

  const berechnung = useMemo((): JahresZeile[] => {
    const rows: JahresZeile[] = [];
    let restschuld = gesamtDarlehen;
    let kumulativTilgung = 0;
    let vermoegenKumuliert = 0;

    // Effektive Miete: bei aktiver Sanierung die erhöhte Miete (inkl. Modernisierungsumlage) verwenden
    const effektiveMonatsmiete = sanierungAnteil > 0 ? neueMiete : mieteMonat;
    const effektiveJahresmiete = effektiveMonatsmiete * 12;

    // Geplante Mieterhöhung: Berechne ab welchem Jahr die erhöhte Miete greift
    const mieterhoehungJahr = propMieterhoehungAb
      ? Math.max(1, new Date(propMieterhoehungAb).getFullYear() - new Date().getFullYear() + 1)
      : 0;
    const geplanteNeueMiete = propNeueMiete || 0;

    for (let j = 1; j <= betrachtungszeitraum; j++) {
      // Basis-Miete: Sprung bei geplanter Mieterhöhung, danach jährliche Steigerung
      let basisMiete = effektiveJahresmiete;
      if (mieterhoehungJahr > 0 && geplanteNeueMiete > 0 && j >= mieterhoehungJahr) {
        basisMiete = geplanteNeueMiete * 12;
      }
      const mietEinnahme = basisMiete * Math.pow(1 + mietSteigerung / 100, j - 1);
      const zinsenJahr = restschuld * (gewichteterZins / 100);
      const annuitaet = gesamtDarlehen * (mischAnnuitaet / 100);
      const tilgungJahr = Math.min(annuitaet - zinsenJahr, restschuld);

      const afa = j <= restnutzungsdauer ? afaGesamt : 0;

      // ✅ KORREKTE Steuerberechnung:
      // Steuerliche Einnahmen = Kaltmiete (umlagefähiges HG ist neutral, da Mieter es erstattet)
      // Steuerliche Abzüge = Zinsen + AfA + nicht-umlagefähiges Hausgeld
      const steuerlicheAbzuege = afa + zinsenJahr + hausgeldNichtUmlagefaehigJahr;
      const steuerlichesErgebnis = mietEinnahme - steuerlicheAbzuege;
      // Differenzmethode §32a EStG: ESt(zvE) − ESt(zvE − Minderung)
      const minderung = -steuerlichesErgebnis; // Verlust > 0
      const { ersparnis } = berechneSteuerersparnis(zvE, minderung, verheiratet);
      const steuerersparnis = ersparnis;

      // ✅ KORREKTE Cashflow-Berechnung:
      // Cashflow vor Steuern = Kaltmiete - Darlehensrate - nicht-umlagefähiges Hausgeld
      const cashflowBrutto = mietEinnahme - annuitaet - hausgeldNichtUmlagefaehigJahr;
      const cashflowNetto = cashflowBrutto + steuerersparnis;

      // Monatlicher Nettoaufwand: negativ = Belastung, positiv = Überschuss
      const eigenbelastungVorSteuer = cashflowBrutto / 12;
      const eigenbelastungNachSteuer = cashflowNetto / 12;

      restschuld = Math.max(0, restschuld - tilgungJahr);
      kumulativTilgung += tilgungJahr;

      // ✅ KORREKTE Vermögensaufbau-Berechnung:
      // Pro Jahr: Tilgung + Wertsteigerung + Cashflow nach Steuern
      const immobilienWertVorjahr = kaufpreis * Math.pow(1 + wertSteigerung / 100, j - 1);
      const immobilienWert = kaufpreis * Math.pow(1 + wertSteigerung / 100, j);
      const wertsteigerungJahr = immobilienWert - immobilienWertVorjahr;
      const vermoegenAufbauJahr = tilgungJahr + wertsteigerungJahr + cashflowNetto;
      vermoegenKumuliert += vermoegenAufbauJahr;

      const renditeNachSteuer = eigenkapital > 0
        ? (vermoegenAufbauJahr / eigenkapital) * 100
        : gesamtDarlehen > 0
        ? (vermoegenAufbauJahr / gesamtDarlehen) * 100
        : 0;

      rows.push({
        jahr: j, afa, zinsen: zinsenJahr, tilgung: tilgungJahr,
        hausgeldNu: hausgeldNichtUmlagefaehigJahr,
        abzuegeSumme: steuerlicheAbzuege,
        steuerlichesErgebnis, steuerersparnis,
        miete: mietEinnahme, cashflowBrutto, cashflowNetto,
        eigenbelastungVorSteuer, eigenbelastungNachSteuer,
        tilgungKumuliert: kumulativTilgung,
        wertsteigerungJahr,
        vermoegenAufbau: vermoegenAufbauJahr,
        vermoegenKumuliert,
        restschuld, immobilienWert, renditeNachSteuer,
      });
    }
    return rows;
  }, [steuersatz, zvE, verheiratet, betrachtungszeitraum, mietSteigerung, wertSteigerung, kaufpreis, mieteMonat, neueMiete, sanierungAnteil, gesamtDarlehen, gewichteterZins, mischAnnuitaet, hausgeldNichtUmlagefaehigJahr, afaGesamt, eigenkapital, restnutzungsdauer, propNeueMiete, propMieterhoehungAb]);

  const totalSteuerersparnis = berechnung.reduce((s, r) => s + r.steuerersparnis, 0);
  const totalCashflow = berechnung.reduce((s, r) => s + r.cashflowNetto, 0);
  const totalTilgung = berechnung.reduce((s, r) => s + r.tilgung, 0);
  const totalWertsteigerung = berechnung.reduce((s, r) => s + r.wertsteigerungJahr, 0);
  const avgRendite = berechnung.reduce((s, r) => s + r.renditeNachSteuer, 0) / berechnung.length;
  const lastRow = berechnung[berechnung.length - 1];
  const firstRow = berechnung[0];

  const chartData = berechnung.map(r => ({
    name: `J${r.jahr}`,
    Steuerersparnis: Math.round(r.steuerersparnis),
    "CF netto": Math.round(r.cashflowNetto),
    Tilgung: Math.round(r.tilgungKumuliert),
    Wertsteigerung: Math.round(r.immobilienWert - kaufpreis),
    Vermögensaufbau: Math.round(r.vermoegenKumuliert),
    "Nettoaufwand/Monat": Math.round(r.eigenbelastungNachSteuer < 0 ? Math.abs(r.eigenbelastungNachSteuer) : -r.eigenbelastungNachSteuer),
  }));

  const handleExportPdf = async () => {
    const { generateInvestmentAnalysePdf } = await import("@/lib/investmentAnalysePdf");
    generateInvestmentAnalysePdf({
      sprache: pdfSprache,
      objektTitel,
      weNr,
      modus,
      kaufpreis,
      mieteMonat,
      groesse,
      nkPct,
      hausgeldMonat,
      hausgeldUmlagefaehig,
      hausgeldNichtUmlagefaehig,
      eigenkapital,
      sanierungskosten,
      sanierungAnteil,
      grundAnteilPct,
      gebaeudeAnteilPct,
      gebaeudeWert,
      afaModell,
      afaSatz,
      effektiverAfaSatz,
      restnutzungsdauer,
      afaJahr,
      afaGesamt,
      tranchen,
      gesamtDarlehen,
      gewichteterZins,
      gewichteteTilgung,
      monatsrate,
      steuersatz,
      mietSteigerung,
      wertSteigerung,
      betrachtungszeitraum,
      berechnung,
      totalSteuerersparnis,
      totalCashflow,
      avgRendite,
      showModernisierung,
      umlagePct,
      erlaubteUmlage,
      neueMiete,
      deckelProQm,
    });
  };

  return (
    <div className="space-y-5">
      {/* ⚠️ Disclaimer */}
      <Card className="p-4 border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-[hsl(var(--warning))] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Wichtiger Hinweis – Keine steuerliche Beratung!</p>
            <p className="text-xs text-muted-foreground mt-1">
              Diese Berechnung dient ausschließlich als <strong>grobe Einschätzung</strong> und ersetzt keine individuelle steuerliche Beratung durch einen Steuerberater.
              Alle Werte sind Näherungen und können je nach persönlicher Steuersituation abweichen. 
              Die tatsächliche steuerliche Auswirkung hängt von vielen individuellen Faktoren ab.
            </p>
          </div>
        </div>
      </Card>

      {/* Basisdaten (editable for admin/inhaber/objektpartner) */}
      <Card className="p-5">
        <h4 className="font-bold text-sm mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Basisdaten {modus === "wohnung" && weNr ? `– WE ${weNr}` : `– ${objektTitel}`}
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">Kaufpreis</Label>
            <EuroInput value={kaufpreis} onChange={v => setKaufpreis(v)} disabled={!editable} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Miete mtl.</Label>
            <EuroInput value={mieteMonat} onChange={v => setMieteMonat(v)} disabled={!editable} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Wohnfläche (m²)</Label>
            <Input type="number" step="0.01" value={groesse || ""} onChange={e => setGroesse(parseFloat(e.target.value) || 0)} className="h-8" />
          </div>
          <div className="relative">
            <Label className="text-xs">Miete pro m²</Label>
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Miete pro m²</p>
                <p>= Kaltmiete mtl. ÷ Wohnfläche m²</p>
              </PopoverContent>
            </Popover>
            <div className="h-8 flex items-center text-sm font-medium bg-muted/50 rounded-md px-3">
              {groesse > 0 ? `${(mieteMonat / groesse).toFixed(2)} €/m²` : "–"}
            </div>
          </div>
          <div>
            <Label className="text-xs">Nebenkosten (%)</Label>
            <Input type="number" value={nkPct || ""} onChange={e => setNkPct(parseFloat(e.target.value) || 0)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Hausgeld mtl.</Label>
            <EuroInput value={hausgeldMonat} onChange={v => setHausgeldMonat(v)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">davon umlagefähig (€/m²)</Label>
            <Input type="number" step="0.1" value={hausgeldUmlagefaehigQm || ""} onChange={e => setHausgeldUmlagefaehigQm(parseFloat(e.target.value) || 0)} className="h-8" />
          </div>
        </div>
        <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground grid grid-cols-4 gap-2">
          <span className="relative group">Hausgeld gesamt: <strong>{fmt(hausgeldMonat)}/mtl.</strong>
            <Popover><PopoverTrigger asChild><button className="ml-1 inline text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5 inline" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Hausgeld gesamt</p><p>= Wohnfläche × Hausgeld-Satz €/m² (editierbar)</p></PopoverContent></Popover>
          </span>
          <span className="relative">Umlagefähig: <strong>{fmt(hausgeldUmlagefaehig)}/mtl.</strong>
            <Popover><PopoverTrigger asChild><button className="ml-1 inline text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5 inline" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Umlagefähiges Hausgeld</p><p>= Wohnfläche × {hausgeldUmlagefaehigQm.toFixed(2)} €/m²</p><p className="text-muted-foreground mt-1">Wird vom Mieter erstattet → steuerlich neutral.</p></PopoverContent></Popover>
          </span>
          <span className="relative">Nicht umlagefähig: <strong>{fmt(hausgeldNichtUmlagefaehig)}/mtl.</strong>
            <Popover><PopoverTrigger asChild><button className="ml-1 inline text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5 inline" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Nicht umlagefähiges Hausgeld</p><p>= Hausgeld gesamt − umlagefähiges Hausgeld</p><p className="text-muted-foreground mt-1">Steuerlich absetzbar als Werbungskosten.</p></PopoverContent></Popover>
          </span>
          <span className="relative">QM-Preis: <strong>{groesse > 0 ? fmt(kaufpreis / groesse) : "–"}/m²</strong>
            <Popover><PopoverTrigger asChild><button className="ml-1 inline text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5 inline" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Kaufpreis pro m²</p><p>= Kaufpreis ÷ Wohnfläche</p></PopoverContent></Popover>
          </span>
        </div>
        {sanierungskosten > 0 && (
          <div className="mt-3 p-2 bg-muted/50 rounded text-xs text-muted-foreground grid grid-cols-2 gap-2">
            <span>Sanierungskosten gesamt: <strong>{fmt(sanierungskosten)}</strong></span>
            {modus === "wohnung" && tausendstel ? (
              <span>Anteil Wohnung ({tausendstel}/1000): <strong>{fmt(sanierungAnteil)}</strong></span>
            ) : null}
          </div>
        )}
      </Card>

      {/* Grund & Boden + AfA */}
      <Card className="p-5">
        <h4 className="font-bold text-sm mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          Grund & Boden / AfA-Modell
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="text-xs">Grundstücksanteil (%)</Label>
            <div className="flex items-center gap-3 mt-1">
              <Slider value={[grundAnteilPct]} onValueChange={v => setGrundAnteilPct(v[0])} min={5} max={50} step={5} className="flex-1" />
              <span className="text-sm font-semibold w-24 text-right">{grundAnteilPct}% / {gebaeudeAnteilPct}%</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Grundstück / Gebäude – Nur der Gebäudeanteil ist steuerlich absetzbar</p>
          </div>
          <div>
            <Label className="text-xs">AfA-Modell</Label>
            <Select value={afaModell} onValueChange={v => {
              setAfaModell(v as any);
              if (v === "linear") { setAfaSatz(2); setRestnutzungsdauer(50); }
              else if (v === "degressiv") { setAfaSatz(5); setRestnutzungsdauer(20); }
              else { setAfaSatz(4); setRestnutzungsdauer(25); }
            }}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">Linear (2% / 50 Jahre)</SelectItem>
                <SelectItem value="degressiv">Degressiv (5% / 20 Jahre)</SelectItem>
                <SelectItem value="gutachten">Restnutzungsdauer-Gutachten</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* Restnutzungsdauer – immer sichtbar */}
        <div className="mt-4 p-3 border rounded-lg border-[hsl(var(--info))]/30 bg-[hsl(var(--info))]/5">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-[hsl(var(--info))] mt-0.5" />
            <div>
              <p className="text-xs font-medium">Restnutzungsdauer & AfA-Satz</p>
              <p className="text-[10px] text-muted-foreground mb-2">
                {afaModell === "gutachten"
                  ? "Ein Gutachten kann die Restnutzungsdauer verkürzen und damit den jährlichen AfA-Satz erhöhen."
                  : "Pass die Restnutzungsdauer an, um den AfA-Satz individuell zu berechnen."}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Restnutzungsdauer (Jahre)</Label>
                  <Input type="number" value={restnutzungsdauer} onChange={e => {
                    const v = parseInt(e.target.value) || 1;
                    setRestnutzungsdauer(v);
                    if (afaModell !== "gutachten") setAfaSatz(parseFloat((100 / v).toFixed(2)));
                  }} className="h-8 w-20" min={1} max={50} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">AfA-Satz (%)</Label>
                  <Input type="number" step="0.1" value={afaModell === "gutachten" ? effektiverAfaSatz.toFixed(2) : afaSatz} onChange={e => {
                    const v = parseFloat(e.target.value) || 1;
                    setAfaSatz(v);
                    setRestnutzungsdauer(Math.round(100 / v));
                  }} className="h-8 w-20" min={0.5} max={20} />
                </div>
                <span className="text-xs font-semibold">→ {effektiverAfaSatz.toFixed(2)}% = {fmt(afaJahr)}/Jahr</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div className="bg-muted/50 rounded p-2 text-center relative">
            <Popover><PopoverTrigger asChild><button className="absolute top-1 right-1 text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Gebäudeanteil</p><p>= Kaufpreis × {gebaeudeAnteilPct}%</p><p className="text-muted-foreground mt-1">Nur der Gebäudeanteil ist steuerlich über AfA absetzbar. Der Grundstücksanteil ({grundAnteilPct}%) unterliegt keiner Abnutzung.</p></PopoverContent></Popover>
            <span className="text-muted-foreground block">Gebäudeanteil</span>
            <span className="font-bold">{fmt(gebaeudeWert)}</span>
          </div>
          <div className="bg-muted/50 rounded p-2 text-center relative">
            <Popover><PopoverTrigger asChild><button className="absolute top-1 right-1 text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">AfA p.a. (nur Gebäude)</p><p>= Gebäudeanteil ({fmt(gebaeudeWert)}) × AfA-Satz ({effektiverAfaSatz.toFixed(2)}%)</p><p className="text-muted-foreground mt-1">Jährliche Abschreibung auf den Gebäudewert (ohne Sanierung).</p></PopoverContent></Popover>
            <span className="text-muted-foreground block">AfA p.a.</span>
            <span className="font-bold">{fmt(afaJahr)}</span>
          </div>
          <div className="bg-muted/50 rounded p-2 text-center relative">
            <Popover><PopoverTrigger asChild><button className="absolute top-1 right-1 text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">AfA-Satz</p><p>{afaModell === "gutachten" ? `= 100 ÷ Restnutzungsdauer (${restnutzungsdauer} J.)` : afaModell === "linear" ? "= 2% (gesetzlich linear, §7 Abs. 4 EStG)" : "= 5% (degressiv, §7 Abs. 5a EStG)"}</p></PopoverContent></Popover>
            <span className="text-muted-foreground block">AfA-Satz</span>
            <span className="font-bold">{effektiverAfaSatz.toFixed(2)}%</span>
          </div>
        </div>
        {/* Quellenhinweise aus Objektanlage – hinter Info-Icon */}
        {(initialAfaModell || initialBodenrichtwert || initialGrundstuecksflaeche || initialBaujahr) && (
          <div className="mt-4 flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-3.5 w-3.5" />
                  <span>Übernommene Werte aus Objektanlage</span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="max-w-sm text-[10px] p-3">
                <p className="font-semibold text-xs mb-2">📋 Übernommene Werte</p>
                <div className="grid grid-cols-2 gap-2">
                  {initialAfaModell && (
                    <div>
                      <span className="text-muted-foreground">AfA-Modell:</span>
                      <span className="font-semibold ml-1">{initialAfaModell === "gutachten" ? "Gutachten" : initialAfaModell === "degressiv" ? "Degressiv" : "Linear"}</span>
                      <p className="text-muted-foreground/70">aus Objekt anlegen (Schritt 3)</p>
                    </div>
                  )}
                  {initialAfaSatz != null && (
                    <div>
                      <span className="text-muted-foreground">AfA-Satz:</span>
                      <span className="font-semibold ml-1">{initialAfaSatz.toFixed(2)}%</span>
                      <p className="text-muted-foreground/70">aus AfA-Berechnung</p>
                    </div>
                  )}
                  {initialRestnutzungsdauer != null && (
                    <div>
                      <span className="text-muted-foreground">RND:</span>
                      <span className="font-semibold ml-1">{initialRestnutzungsdauer} Jahre</span>
                      <p className="text-muted-foreground/70">aus AfA-Berechnung</p>
                    </div>
                  )}
                  {initialGrundAnteilPct != null && (
                    <div>
                      <span className="text-muted-foreground">Grundstücksanteil:</span>
                      <span className="font-semibold ml-1">{initialGrundAnteilPct}%</span>
                      <p className="text-muted-foreground/70">aus AfA-Berechnung</p>
                    </div>
                  )}
                  {(initialBodenrichtwert ?? 0) > 0 && (
                    <div>
                      <span className="text-muted-foreground">Bodenrichtwert:</span>
                      <span className="font-semibold ml-1">{fmt(initialBodenrichtwert!)} /m²</span>
                      <p className="text-muted-foreground/70">aus AfA-Rechner (Objektanlage)</p>
                    </div>
                  )}
                  {(initialGrundstuecksflaeche ?? 0) > 0 && (
                    <div>
                      <span className="text-muted-foreground">Grundstücksfläche:</span>
                      <span className="font-semibold ml-1">{initialGrundstuecksflaeche} m²</span>
                      <p className="text-muted-foreground/70">aus Objektdaten</p>
                    </div>
                  )}
                  {(initialBaujahr ?? 0) > 0 && (
                    <div>
                      <span className="text-muted-foreground">Baujahr:</span>
                      <span className="font-semibold ml-1">{initialBaujahr}</span>
                      <p className="text-muted-foreground/70">aus Objektdaten</p>
                    </div>
                  )}
                  {(initialKaufnebenkosten ?? 0) > 0 && (
                    <div>
                      <span className="text-muted-foreground">Kaufnebenkosten:</span>
                      <span className="font-semibold ml-1">{initialKaufnebenkosten}%</span>
                      <p className="text-muted-foreground/70">aus Objektdaten</p>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </Card>

      {/* Finanzierung (Mischzins) */}
      <Card className="p-5">
        <h4 className="font-bold text-sm mb-4">Finanzierung / Mischzinsrechner</h4>
        {tranchen.map((t, i) => (
          <div key={t.id} className="mb-3 p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Tranche {i + 1}</span>
              {tranchen.length > 1 && <Button variant="ghost" size="sm" className="text-destructive h-6 px-2 text-xs" onClick={() => removeTranche(t.id)}>Entfernen</Button>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label className="text-xs">Bezeichnung</Label><Input value={t.bezeichnung} onChange={e => updateTranche(t.id, "bezeichnung", e.target.value)} className="h-8" /></div>
              <div><Label className="text-xs">Betrag (€)</Label><EuroInput value={t.betrag} onChange={v => updateTranche(t.id, "betrag", String(v))} className="h-8" /></div>
              <div><Label className="text-xs">Zinssatz (%)</Label><Input type="number" step="0.01" value={t.zinssatz || ""} onChange={e => updateTranche(t.id, "zinssatz", e.target.value)} className="h-8" /></div>
              <div><Label className="text-xs">Tilgung (%)</Label><Input type="number" step="0.01" value={t.tilgung || ""} onChange={e => updateTranche(t.id, "tilgung", e.target.value)} className="h-8" /></div>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addTranche}><Plus className="h-3 w-3 mr-1" /> Tranche</Button>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-primary/5 border border-primary/20 rounded p-2 text-center relative">
            <Popover><PopoverTrigger asChild><button className="absolute top-1 right-1 text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Darlehen gesamt</p><p>= Σ aller Tranchenbeträge</p><p className="text-muted-foreground mt-1">Gesamte Darlehenssumme über alle Finanzierungstranchen.</p></PopoverContent></Popover>
            <span className="text-muted-foreground block">Darlehen gesamt</span>
            <span className="font-bold text-sm">{fmt(gesamtDarlehen)}</span>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded p-2 text-center relative">
            <Popover><PopoverTrigger asChild><button className="absolute top-1 right-1 text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Mischzins</p><p>= Σ (Tranchenbetrag × Zinssatz) ÷ Darlehen gesamt</p><p className="text-muted-foreground mt-1">Gewichteter Durchschnittszins über alle Tranchen.</p></PopoverContent></Popover>
            <span className="text-muted-foreground block">Mischzins</span>
            <span className="font-bold text-sm">{gewichteterZins.toFixed(3)}%</span>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded p-2 text-center relative">
            <Popover><PopoverTrigger asChild><button className="absolute top-1 right-1 text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Ø Tilgung</p><p>= Σ (Tranchenbetrag × Tilgungssatz) ÷ Darlehen gesamt</p><p className="text-muted-foreground mt-1">Gewichtete Durchschnittstilgung über alle Tranchen.</p></PopoverContent></Popover>
            <span className="text-muted-foreground block">Ø Tilgung</span>
            <span className="font-bold text-sm">{gewichteteTilgung.toFixed(3)}%</span>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded p-2 text-center relative">
            <Popover><PopoverTrigger asChild><button className="absolute top-1 right-1 text-muted-foreground/40 hover:text-muted-foreground"><Info className="h-2.5 w-2.5" /></button></PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3"><p className="font-semibold mb-1">Monatsrate</p><p>= Darlehen × (Mischzins + Ø Tilgung) ÷ 12</p><p className="text-muted-foreground mt-1">Monatliche Gesamtrate für alle Darlehenstranchen.</p></PopoverContent></Popover>
            <span className="text-muted-foreground block">Monatsrate</span>
            <span className="font-bold text-sm">{fmt(monatsrate)}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Eigenkapital (€) <span className="text-muted-foreground font-normal">(reduziert den Kaufpreis)</span></Label>
            <EuroInput value={eigenkapital} onChange={v => setEigenkapital(v)} className="h-8" />
          </div>
        </div>
      </Card>

      {/* Modernisierungsumlage (§559 BGB) – Admin steuert Sichtbarkeit */}
      {showModernisierung && (
        <Card className="p-5 border-[hsl(var(--info))]/30">
          <div className="flex items-center gap-2 w-full">
            <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setShowUmlage(!showUmlage)}>
              <h4 className="font-bold text-sm flex-1 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[hsl(var(--info))]" />
                Modernisierungsumlage nach §559 BGB – Vorher / Nachher Vergleich
              </h4>
              {showUmlage ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
          {showUmlage && (
            <div className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Vermieter dürfen energetische Modernisierungskosten teilweise auf die Miete umlegen. 
                Max. {umlagePct}% der Kosten p.a. – gedeckelt auf {deckelProQm} €/m² monatlich (bei Miete {'<'} 7 €/m²: max. 2 €/m²).
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Wohnfläche (m²)</Label>
                  <div className="h-8 flex items-center text-sm font-medium bg-muted/50 rounded-md px-3">
                    {groesse > 0 ? `${groesse.toFixed(2)} m²` : "–"}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Umlagesatz (%)</Label>
                  <div className="h-8 flex items-center text-sm font-medium bg-muted/50 rounded-md px-3">
                    {umlagePct}%
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Aktuelle QM-Miete</Label>
                  <div className="h-8 flex items-center text-sm font-medium bg-muted/50 rounded-md px-3">{groesse > 0 ? `${qmMiete.toFixed(2)} €/m²` : "–"}</div>
                </div>
                <div>
                  <Label className="text-xs">Sanierungskosten (Anteil)</Label>
                  <div className="h-8 flex items-center text-sm font-medium bg-muted/50 rounded-md px-3">{fmt(sanierungAnteil)}</div>
                </div>
              </div>

              {groesse > 0 && (
                <>
                  {/* Berechnung */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Berechnung</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-xs">{umlagePct}% von {fmt(sanierungAnteil)} p.a.:</span>
                          <span className="font-medium text-xs">{fmt(sanierungAnteil * (umlagePct / 100))} / Jahr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-xs">→ pro Monat:</span>
                          <span className="font-medium text-xs">{fmt(umlageNach8Pct)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-xs">Deckel ({deckelProQm} €/m² × {groesse.toFixed(0)} m²):</span>
                          <span className="font-medium text-xs">{fmt(maxUmlageDeckel)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-xs">Erlaubte Umlage:</span>
                          <span className="font-bold text-xs text-[hsl(var(--success))]">{fmt(erlaubteUmlage)}</span>
                        </div>
                        {umlageNach8Pct > maxUmlageDeckel && (
                          <p className="text-[10px] text-[hsl(var(--warning))]">⚠ Deckelung greift – {fmt(umlageNach8Pct - maxUmlageDeckel)} weniger als nach {umlagePct}%-Regel</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ergebnis */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card className="p-3 text-center border-2 border-muted relative">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="absolute top-1.5 right-1.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="max-w-xs text-xs p-3">Aktuelle Kaltmiete pro Monat</PopoverContent>
                        </Popover>
                        <p className="text-[10px] text-muted-foreground uppercase">Miete vorher</p>
                        <p className="text-lg font-bold">{fmt(mieteMonat)}</p>
                        <p className="text-[10px] text-muted-foreground">{qmMiete.toFixed(2)} €/m²</p>
                      </Card>
                      <Card className="p-3 text-center border-2 border-[hsl(var(--success))]/30 relative">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="absolute top-1.5 right-1.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="max-w-xs text-xs p-3">
                            <p>= Miete vorher + erlaubte Modernisierungsumlage</p>
                            <p className="text-muted-foreground">Umlage = min({umlagePct}% × Sanierungskosten / 12, Deckel {deckelProQm} €/m²)</p>
                          </PopoverContent>
                        </Popover>
                        <p className="text-[10px] text-muted-foreground uppercase">Miete nachher</p>
                        <p className="text-lg font-bold text-[hsl(var(--success))]">{fmt(neueMiete)}</p>
                        <p className="text-[10px] text-muted-foreground">{groesse > 0 ? (neueMiete / groesse).toFixed(2) : "0"} €/m²</p>
                      </Card>
                      <Card className="p-3 text-center border-2 border-muted relative">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="absolute top-1.5 right-1.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="max-w-xs text-xs p-3">= (Miete p.a. / Kaufpreis) × 100</PopoverContent>
                        </Popover>
                        <p className="text-[10px] text-muted-foreground uppercase">Rendite vorher</p>
                        <p className="text-lg font-bold">{renditeVorher.toFixed(2)}%</p>
                        <p className="text-[10px] text-muted-foreground">Bruttorendite</p>
                      </Card>
                      <Card className="p-3 text-center border-2 border-[hsl(var(--success))]/30 relative">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="absolute top-1.5 right-1.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="max-w-xs text-xs p-3">= (Neue Miete p.a. / Gesamtinvestition) × 100</PopoverContent>
                        </Popover>
                        <p className="text-[10px] text-muted-foreground uppercase">Rendite nachher</p>
                        <p className="text-lg font-bold text-[hsl(var(--success))]">{renditeNachher.toFixed(2)}%</p>
                        <p className="text-[10px] text-muted-foreground">inkl. Sanierung</p>
                      </Card>
                    </div>

                  {/* Zusatzhinweis */}
                  <div className="p-3 bg-[hsl(var(--info))]/5 border border-[hsl(var(--info))]/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-[hsl(var(--info))] mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p><strong>Nicht vergessen:</strong> Neben der gesetzlichen Umlage steigt oft auch der Marktwert der Immobilie und die Marktmiete nach energetischer Sanierung.</p>
                        <p>• Bessere Vermietbarkeit & geringerer Leerstand</p>
                        <p>• Höherer Wiederverkaufswert</p>
                        <p>• Niedrigere Instandhaltungskosten</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h4 className="font-bold text-sm mb-4">Steuerliche Parameter</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label className="text-xs flex items-center gap-1">
              Zu versteuerndes Einkommen
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <EuroInput value={zvE} onChange={setZvE} placeholder="60.000" />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" className="accent-primary"
                checked={verheiratet} onChange={e => setVerheiratet(e.target.checked)} />
              Verheiratet (Splittingtarif)
            </label>
            <div className="text-[11px] text-muted-foreground">
              Abgeleiteter Grenzsteuersatz: <strong className="text-primary">{steuersatz} %</strong>
            </div>
          </div>
          <div>
            <Label className="text-xs">Mietsteigerung p.a.</Label>
            <div className="flex items-center gap-3 mt-1">
              <Slider value={[mietSteigerung]} onValueChange={v => setMietSteigerung(v[0])} min={0} max={5} step={0.5} className="flex-1" />
              <span className="text-sm font-semibold w-12 text-right">{mietSteigerung}%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs">Wertsteigerung p.a.</Label>
            <div className="flex items-center gap-3 mt-1">
              <Slider value={[wertSteigerung]} onValueChange={v => setWertSteigerung(v[0])} min={0} max={5} step={0.5} className="flex-1" />
              <span className="text-sm font-semibold w-12 text-right">{wertSteigerung}%</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Zeitraum + Save */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Betrachtungszeitraum:</span>
        {([10, 20, 30] as const).map(z => (
          <Button key={z} size="sm" variant={betrachtungszeitraum === z ? "default" : "outline"} onClick={() => setBetrachtungszeitraum(z)}>{z} Jahre</Button>
        ))}
        <div className="ml-auto flex gap-2">
          {analyseKey && (
            <Button size="sm" variant={isSaved ? "outline" : "default"} onClick={handleSaveAnalyse}>
              {isSaved ? "✓ Gespeichert" : "💾 Analyse speichern"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleExportPdf}><Download className="h-3 w-3 mr-1" /> PDF</Button>
        </div>
      </div>

      {/* ★ Monatlicher Nettoaufwand Highlight */}
      <Card className="p-5 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <h4 className="font-bold text-sm mb-4">⭐ Monatlicher Nettoaufwand: Was kostet dich das Investment monatlich?</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Nettoaufwand vor Steuer</p>
                <p>= (Annuität + nicht umlagef. HG − Kaltmiete) / 12</p>
                <p className="mt-1 text-muted-foreground">Was du monatlich aus eigener Tasche zahlst, ohne Steuereffekt.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {(firstRow?.eigenbelastungVorSteuer || 0) >= 0 ? "Überschuss vor Steuer / Monat" : "Belastung vor Steuer / Monat"}
            </p>
            <p className={`text-2xl font-bold ${(firstRow?.eigenbelastungVorSteuer || 0) >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {(firstRow?.eigenbelastungVorSteuer || 0) > 0 ? "+" : ""}{fmt(Math.abs(firstRow?.eigenbelastungVorSteuer || 0))}
            </p>
            <p className="text-[10px] text-muted-foreground">im 1. Jahr</p>
          </div>
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Nettoaufwand nach Steuer</p>
                <p>= Nettoaufwand vor Steuer − (Steuerersparnis / 12)</p>
                <p className="mt-1 text-muted-foreground">Deine tatsächliche monatliche Belastung nach Berücksichtigung der Steuerersparnis. Positiv = Überschuss.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {(firstRow?.eigenbelastungNachSteuer || 0) > 0 ? "Monatlicher Überschuss nach Steuer" : (firstRow?.eigenbelastungNachSteuer || 0) === 0 ? "Nach Steuer / Monat" : "Belastung nach Steuer / Monat"}
            </p>
            <p className={`text-2xl font-bold ${(firstRow?.eigenbelastungNachSteuer || 0) >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {(firstRow?.eigenbelastungNachSteuer || 0) > 0 ? "+" : ""}{fmt(Math.abs(firstRow?.eigenbelastungNachSteuer || 0))}
            </p>
            <p className="text-[10px] text-muted-foreground">im 1. Jahr</p>
          </div>
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Monatsrate (Annuität)</p>
                <p>= Σ aller Tranchen (Zins + Tilgung) / 12</p>
                <p className="mt-1 text-muted-foreground">Summe der monatlichen Darlehensraten über alle Finanzierungstranchen.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Monatsrate</p>
            <p className="text-2xl font-bold">{fmt(monatsrate)}</p>
            <p className="text-[10px] text-muted-foreground">Darlehensrate</p>
          </div>
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Mietabdeckung</p>
                <p>= (Kaltmiete / Monatsrate) × 100</p>
                <p className="mt-1 text-muted-foreground">Wie viel Prozent der Darlehensrate durch die Mieteinnahmen gedeckt werden.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Miete deckt</p>
            <p className="text-2xl font-bold">{monatsrate > 0 ? Math.round((mieteMonat / monatsrate) * 100) : 0}%</p>
            <p className="text-[10px] text-muted-foreground">der Rate</p>
          </div>
        </div>
      </Card>


      {/* Bereich 2 – Vermögen */}
      <Card className="p-5 border-2 border-[hsl(var(--success))]/20">
        <h4 className="font-bold text-sm mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[hsl(var(--success))]" /> Vermögensentwicklung
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Tilgung pro Jahr</p>
                <p>= Annuität − Zinsen</p>
                <p className="mt-1 text-muted-foreground">Der Anteil deiner Darlehensrate, der die Restschuld reduziert. Steigt jährlich (Annuitäteneffekt).</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tilgung / Jahr</p>
            <p className="text-lg font-bold">{fmt(firstRow?.tilgung || 0)}</p>
          </div>
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Wertsteigerung pro Jahr</p>
                <p>= Immobilienwert Vorjahr × {wertSteigerung}%</p>
                <p className="mt-1 text-muted-foreground">Angenommene jährliche Wertsteigerung der Immobilie.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Wertsteigerung / Jahr</p>
            <p className="text-lg font-bold">{fmt(firstRow?.wertsteigerungJahr || 0)}</p>
          </div>
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Vermögensaufbau pro Jahr</p>
                <p>= Tilgung + Wertsteigerung + Cashflow nach Steuern</p>
                <p className="mt-1 text-muted-foreground">Zeigt, wie viel Vermögen du jährlich durch die Immobilie aufbaust.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vermögensaufbau / Jahr</p>
            <p className="text-lg font-bold text-[hsl(var(--success))]">{fmt(firstRow?.vermoegenAufbau || 0)}</p>
          </div>
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Vermögen gesamt</p>
                <p>= Σ Vermögensaufbau über {betrachtungszeitraum} Jahre</p>
                <p className="mt-1 text-muted-foreground">Kumulierter Vermögenszuwachs aus Tilgung, Wertsteigerung und Cashflow.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vermögen gesamt</p>
            <p className="text-lg font-bold text-[hsl(var(--success))]">{fmt(lastRow?.vermoegenKumuliert || 0)}</p>
            <p className="text-[10px] text-muted-foreground">nach {betrachtungszeitraum} Jahren</p>
          </div>
          <div className="text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-0 right-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3 w-3" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs p-3">
                <p className="font-semibold mb-1">Immobilienwert</p>
                <p>= Kaufpreis × (1 + {wertSteigerung}%)^{betrachtungszeitraum}</p>
                <p className="mt-1 text-muted-foreground">Geschätzter Marktwert der Immobilie nach {betrachtungszeitraum} Jahren.</p>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Immobilienwert</p>
            <p className="text-lg font-bold">{fmt(lastRow?.immobilienWert || 0)}</p>
            <p className="text-[10px] text-muted-foreground">nach {betrachtungszeitraum} Jahren</p>
          </div>
        </div>
      </Card>

      {/* Erhaltungsaufwand & Mieterhöhungen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Erhaltungsaufwand */}
        <Card className="p-4 text-center relative">
          <Popover>
            <PopoverTrigger asChild>
              <button className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3">
              <p className="font-semibold mb-1">Erhaltungsaufwand (AfA Sanierung)</p>
              <p>= Sanierungskosten / Restnutzungsdauer</p>
              <p className="mt-1 text-muted-foreground">Jährliche steuerliche Abschreibung auf die Sanierungskosten, verteilt über die Restnutzungsdauer.</p>
            </PopoverContent>
          </Popover>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2"><Calculator className="h-5 w-5 text-primary" /></div>
          <p className="text-xs text-muted-foreground">Erhaltungsaufwand / Jahr</p>
          <p className="text-lg font-bold">{fmt(afaSanierung)}</p>
          <p className="text-[10px] text-muted-foreground">{fmt(sanierungAnteil)} ÷ {restnutzungsdauer} J.</p>
        </Card>

        {/* Energetische Mieterhöhung */}
        <Card className="p-4 text-center relative">
          <Popover>
            <PopoverTrigger asChild>
              <button className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3">
              <p className="font-semibold mb-1">Energetische Mieterhöhung (§559 BGB)</p>
              <p>= Sanierungskosten × {umlagePct}% / 12, max. {deckelProQm} €/m²</p>
              <p className="mt-1 text-muted-foreground">Monatliche Mieterhöhung nach Modernisierung, gedeckelt nach §559 BGB.</p>
            </PopoverContent>
          </Popover>
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto mb-2"><TrendingUp className="h-5 w-5 text-[hsl(var(--success))]" /></div>
          <p className="text-xs text-muted-foreground">Energetische Mieterhöhung</p>
          <p className="text-lg font-bold text-[hsl(var(--success))]">{sanierungAnteil > 0 ? `+${fmt(erlaubteUmlage)}/mtl.` : "–"}</p>
          <p className="text-[10px] text-muted-foreground">{sanierungAnteil > 0 ? `Neue Miete: ${fmt(neueMiete)}` : "Keine Sanierung"}</p>
        </Card>

        {/* Geplante Mieterhöhung */}
        <Card className="p-4 text-center relative">
          <Popover>
            <PopoverTrigger asChild>
              <button className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-xs text-xs p-3">
              <p className="font-semibold mb-1">Geplante Mieterhöhung</p>
              <p>Im System hinterlegte Mieterhöhung, die ab dem Stichtag als Stufe in die Berechnung einfließt.</p>
              <p className="mt-1 text-muted-foreground">Die jährliche Mietsteigerung ({mietSteigerung}%) wird auf den neuen Betrag angewendet.</p>
            </PopoverContent>
          </Popover>
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--info))]/10 flex items-center justify-center mx-auto mb-2"><Percent className="h-5 w-5 text-[hsl(var(--info))]" /></div>
          <p className="text-xs text-muted-foreground">Geplante Mieterhöhung</p>
          <p className="text-lg font-bold">{propNeueMiete ? fmt(propNeueMiete) : "–"}</p>
          <p className="text-[10px] text-muted-foreground">{propMieterhoehungAb ? `ab ${new Date(propMieterhoehungAb).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}` : "Nicht hinterlegt"}</p>
        </Card>
      </div>

      {/* Bereich 3 – Investment */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3.5 w-3.5" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs leading-relaxed p-3">
                <p className="font-semibold mb-1">AfA (Absetzung für Abnutzung)</p>
                <p>= (Kaufpreis × {gebaeudeAnteilPct}% Gebäudeanteil + Sanierungskosten) × {effektiverAfaSatz.toFixed(2)}%</p>
                <p className="mt-1 text-muted-foreground">Jährliche steuerliche Abschreibung auf den Gebäudeanteil inkl. Sanierungskosten.</p>
              </PopoverContent>
            </Popover>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2"><Building2 className="h-5 w-5 text-primary" /></div>
            <p className="text-xs text-muted-foreground">AfA p.a. (inkl. Sanierung)</p>
            <p className="text-lg font-bold">{fmt(afaGesamt)}</p>
            <p className="text-[10px] text-muted-foreground">{effektiverAfaSatz.toFixed(2)}% · {gebaeudeAnteilPct}% Gebäude</p>
          </Card>
          <Card className="p-4 text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3.5 w-3.5" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs leading-relaxed p-3">
                <p className="font-semibold mb-1">Steuerersparnis gesamt</p>
                <p>= Σ (Zinsen + AfA + nicht umlagef. HG − Kaltmiete) × Steuersatz</p>
                <p className="mt-1 text-muted-foreground">Nur nicht-umlagefähiges Hausgeld ist steuerlich absetzbar. Umlagefähiges HG ist neutral (Mieter erstattet es).</p>
              </PopoverContent>
            </Popover>
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mx-auto mb-2"><PiggyBank className="h-5 w-5 text-[hsl(var(--success))]" /></div>
            <p className="text-xs text-muted-foreground">Steuerersparnis gesamt</p>
            <p className="text-lg font-bold text-[hsl(var(--success))]">{fmt(totalSteuerersparnis)}</p>
          </Card>
          <Card className="p-4 text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3.5 w-3.5" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs leading-relaxed p-3">
                <p className="font-semibold mb-1">Cashflow netto gesamt</p>
                <p>= Σ (Kaltmiete − Annuität − nicht umlagef. HG + Steuerersparnis)</p>
              </PopoverContent>
            </Popover>
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--info))]/10 flex items-center justify-center mx-auto mb-2"><TrendingUp className="h-5 w-5 text-[hsl(var(--info))]" /></div>
            <p className="text-xs text-muted-foreground">Cashflow netto gesamt</p>
            <p className={`text-lg font-bold ${totalCashflow >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>{fmt(totalCashflow)}</p>
          </Card>
          <Card className="p-4 text-center relative">
            <Popover>
              <PopoverTrigger asChild>
                <button className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Info className="h-3.5 w-3.5" /></button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-xs text-xs leading-relaxed p-3">
                <p className="font-semibold mb-1">Vermögensaufbau</p>
                <p>= Σ (Tilgung + Wertsteigerung + Cashflow nach Steuern)</p>
                <p className="mt-1 text-muted-foreground">Kumuliert über {betrachtungszeitraum} Jahre.</p>
              </PopoverContent>
            </Popover>
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--warning))]/10 flex items-center justify-center mx-auto mb-2"><Percent className="h-5 w-5 text-[hsl(var(--warning))]" /></div>
            <p className="text-xs text-muted-foreground">Vermögensaufbau gesamt</p>
            <p className="text-lg font-bold">{fmt(lastRow?.vermoegenKumuliert || 0)}</p>
          </Card>
        </div>

      {/* Charts */}
      <Tabs defaultValue="eigenbelastung">
        <TabsList>
          <TabsTrigger value="eigenbelastung">Nettoaufwand</TabsTrigger>
          <TabsTrigger value="cashflow">Cashflow & Steuer</TabsTrigger>
          <TabsTrigger value="vermoegen">Vermögensaufbau</TabsTrigger>
        </TabsList>

        <TabsContent value="eigenbelastung" className="mt-4">
          <Card className="p-4">
            <h4 className="font-bold text-sm mb-3">Monatlicher Nettoaufwand nach Steuer über {betrachtungszeitraum} Jahre</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="Nettoaufwand/Monat" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.7} />
                <Line dataKey="CF netto" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="cashflow" className="mt-4">
          <Card className="p-4">
            <h4 className="font-bold text-sm mb-3">Cashflow & Steuerersparnis</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="Steuerersparnis" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line dataKey="CF netto" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="vermoegen" className="mt-4">
          <Card className="p-4">
            <h4 className="font-bold text-sm mb-3">Vermögensaufbau (kumuliert)</h4>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Area type="monotone" dataKey="Vermögensaufbau" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                <Line dataKey="Tilgung" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="Wertsteigerung" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expandable Table */}
      <Card className="p-4">
        <button className="flex items-center gap-2 w-full text-left" onClick={() => setShowTable(!showTable)}>
          <h4 className="font-bold text-sm flex-1">Detaillierte Jahresübersicht</h4>
          {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showTable && (
          <div className="overflow-x-auto mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Jahr</TableHead>
                  <TableHead className="text-xs">Miete</TableHead>
                  <TableHead className="text-xs">AfA</TableHead>
                  <TableHead className="text-xs">Zinsen</TableHead>
                  <TableHead className="text-xs">Tilgung</TableHead>
                  <TableHead className="text-xs">Steuervorteil</TableHead>
                  <TableHead className="text-xs">CF brutto</TableHead>
                  <TableHead className="text-xs">CF netto</TableHead>
                  <TableHead className="text-xs">Netto/Monat</TableHead>
                  <TableHead className="text-xs">Restschuld</TableHead>
                  <TableHead className="text-xs">Vermögen kum.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {berechnung.map(r => (
                  <TableRow key={r.jahr}>
                    <TableCell className="text-xs font-medium">{r.jahr}</TableCell>
                    <TableCell className="text-xs">{fmt(r.miete)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.afa)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.zinsen)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.tilgung)}</TableCell>
                    <TableCell className={`text-xs font-medium ${r.steuerersparnis >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>{fmt(r.steuerersparnis)}</TableCell>
                    <TableCell className={`text-xs ${r.cashflowBrutto >= 0 ? "" : "text-destructive"}`}>{fmt(r.cashflowBrutto)}</TableCell>
                    <TableCell className={`text-xs font-medium ${r.cashflowNetto >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>{fmt(r.cashflowNetto)}</TableCell>
                    <TableCell className="text-xs font-medium">{fmt(r.eigenbelastungNachSteuer)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.restschuld)}</TableCell>
                    <TableCell className="text-xs font-medium text-[hsl(var(--success))]">{fmt(r.vermoegenKumuliert)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Disclaimer repeat at bottom */}
      <p className="text-[10px] text-muted-foreground text-center italic">
        ⚠️ Berechnetes Beispiel – Keine steuerliche Beratung. Alle Angaben ohne Gewähr.
      </p>
    </div>
  );
}
