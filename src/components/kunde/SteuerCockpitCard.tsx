import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { einlage } from "@/components/kunde/portal/einlage";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Calculator, Pencil, Check, TrendingUp, Info, Lock, RotateCcw, PiggyBank, AlertCircle, FileText, Mail } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  suggestSteuersatz,
  getBruttoFromSA,
  getVerheiratetFromSA,
  berechneSteuerersparnis,
  zvEFuerRechnungAusSA,
} from "@/lib/steuerHelper";
import { linearerAfaSatz, denkmalVerlauf } from "@/lib/afaSaetze";
import { aktuellesSteuerjahr } from "@/lib/einkommensteuer";
import { adaptMoreImmoInvestment } from "@/lib/kundePortalInvestment";
import { baueAnlageVAufstellung, type AnlageVAufstellung } from "@/lib/anlageVExport";
import { erzeugeAnlageVPdf } from "@/lib/anlageVPdf";
import { AnlageVSendenDialog } from "@/components/kunde/AnlageVSendenDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { portalLocale, portalSprache } from "@/i18n/portalSprache";
import { euroText, zahlText } from "@/lib/sprachFormat";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from "recharts";

interface Props {
  inv: any;
  invMeta: Record<string, any>;
  kontakt: any;
  kontaktMeta: Record<string, any>;
  finanzierung?: any;
  saData?: any;
  onRefresh: () => void;
}

/**
 * Steuer-Cockpit + Wertentwicklung.
 * Sichtbar NUR wenn:
 *  - Finanzierungsangebot UND Darlehensvertrag hochgeladen (echte Daten)
 *  - Kaufpreis bekannt
 */
export function SteuerCockpitCard({ inv, invMeta, kontakt, kontaktMeta, finanzierung, saData, onRefresh }: Props) {
  const { t } = useTranslation();
  const sprache = portalSprache();
  const fmt = (v: number) => euroText(v, sprache, 0);
  // Zahlen in Hinweistexten; das Prozentzeichen steht im übersetzten Text.
  const zahl = (v: number, nachkomma: number) => zahlText(v, sprache, nachkomma);
  // Akzeptiertes Angebot: explizit gesetzt ODER (Fallback) jenes, dessen Pflichtdokumente alle freigegeben sind
  const angebote: any[] = finanzierung?.angebote || [];
  const explicitAkz = angebote.find((a: any) => a.id === finanzierung?.akzeptiertes_angebot_id);
  const isFreigegeben = (a: any, name: string) =>
    (a?.dokumente || []).some((d: any) => d.name === name && d.status === "signed");
  const implicitAkz = explicitAkz
    ? null
    : angebote.find((a: any) => isFreigegeben(a, "Finanzierungsangebot") && isFreigegeben(a, "Darlehensvertrag"));
  const akz = explicitAkz || implicitAkz;

  // Darlehensvertrag-URL: aus invMeta, akz-Feld, oder direkt aus dem Dokument am Angebot
  const akzDarlehensDoc = (akz?.dokumente || []).find((d: any) => d.name === "Darlehensvertrag" && d.status === "signed");
  const darlehensvertragUrl = invMeta?.docFileUrls?.["Darlehensvertrag"]
    || invMeta?.docFileUrls?.["Kreditvertrag"]
    || akz?.darlehensvertragUrl
    || akzDarlehensDoc?.fileUrl;

  // Kaufpreis: Investment, Objekt-Snapshot, Meta-Fallback ODER aus reservierter Wohnung (vk_gesamt)
  const objMetaForPrice = (invMeta?.objektSnapshot || {}) as Record<string, any>;
  const wohnungSnap = (invMeta?.wohnungSnapshot || {}) as Record<string, any>;
  const directKaufpreis = Number(
    inv.kaufpreis
      || invMeta?.kaufpreis
      || wohnungSnap?.vkGesamt
      || wohnungSnap?.vk_gesamt
      || wohnungSnap?.kaufpreis
      || objMetaForPrice?.kaufpreis
      || objMetaForPrice?.global_verkaufspreis
      || 0
  );

  // Live-Fallback: Objekt+Wohnung aus DB nachladen, um Kaufpreis, Miete, AfA-Satz, Sanierungskosten,
  // Hausgeld und Gebäudeanteil aus der reservierten Wohnung / dem Objekt zu übernehmen
  const objektId = invMeta?.objektId || inv?.objektId || "";
  const wohnungId = invMeta?.wohnungId || inv?.wohnungId || "";
  const [liveExpose, setLiveExpose] = useState<any>(null);
  useEffect(() => {
    if (!objektId) return;
    let abort = false;
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-expose?id=${objektId}`;
        // Ohne den apikey-Header weist die Function den Aufruf ab, dann fehlten
        // im Portal still alle Live-Kennzahlen. Gleiches Muster wie in ExposePublic.
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!abort) setLiveExpose(data);
      } catch {}
    })();
    return () => { abort = true; };
  }, [objektId]);

  const liveWohnung = (liveExpose?.wohnungen || []).find((w: any) => w.id === wohnungId) || null;
  const livePreis = Number(liveWohnung?.vkGesamt || liveWohnung?.vk_gesamt || 0);
  const kaufpreis = directKaufpreis > 0 ? directKaufpreis : livePreis;

  // Steuersatz: nur belastbare Quellen, KEIN 42-%-Fallback.
  //  (a) manuell vom Kunden gesetzt → rechnen
  //  (b) aus der Selbstauskunft ableitbar → rechnen, Ableitung offenlegen
  //  (c) weder noch → Steuereffekt "Angabe fehlt"
  // (Hooks IMMER aufrufen)
  // Das angegebene zvE der Selbstauskunft, sonst die Schätzung aus dem Brutto.
  const zvESA = zvEFuerRechnungAusSA(saData);
  const autoSteuersatz = zvESA ? suggestSteuersatz(saData) : null;
  const manuellGesetzt = kontaktMeta?.steuersatzManuell != null;
  const steuersatzVorhanden = manuellGesetzt || autoSteuersatz != null;
  const [steuersatz, setSteuersatz] = useState<number>(
    Number(kontaktMeta?.steuersatzManuell ?? autoSteuersatz ?? 0)
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(steuersatz);
  const [wertSteigerung, setWertSteigerung] = useState<number>(2);
  const [mietSteigerung, setMietSteigerung] = useState<number>(2.5);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const [sendenAufstellung, setSendenAufstellung] = useState<AnlageVAufstellung | null>(null);

  useEffect(() => {
    // Wenn der Auto-Vorschlag ankommt oder sich der manuell gespeicherte Wert ändert: State synchronisieren
    const next = manuellGesetzt ? Number(kontaktMeta?.steuersatzManuell) : (autoSteuersatz ?? 0);
    setSteuersatz(next);
  }, [autoSteuersatz, manuellGesetzt, kontaktMeta?.steuersatzManuell]);

  // GATE: nur echte Daten anzeigen
  if (!akz || !darlehensvertragUrl || kaufpreis <= 0) {
    const fehlendeKaufpreis = kaufpreis <= 0;
    const fehlendeDocs = !akz || !darlehensvertragUrl;
    return (
      <Card className="p-5 border-dashed border-border/60 bg-muted/20">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-bold text-sm">{t("portal.cards.steuer_cockpit.title")}</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {fehlendeDocs && fehlendeKaufpreis && t("portal.cards.steuer_cockpit.locked_missing_all")}
          {fehlendeDocs && !fehlendeKaufpreis && t("portal.cards.steuer_cockpit.locked_missing_docs")}
          {!fehlendeDocs && fehlendeKaufpreis && t("portal.cards.steuer_cockpit.locked_missing_price")}
        </p>
      </Card>
    );
  }

  const saveSteuersatz = async () => {
    try {
      await supabase.rpc("merge_kontakt_meta", {
        _kontakt_id: kontakt.id,
        _updates: { steuersatzManuell: draft },
      });
      setSteuersatz(draft);
      setEditing(false);
      toast.success(t("portal.cards.steuer_cockpit.toast_saved"));
      onRefresh();
    } catch (e) {
      console.error(e);
      toast.error(t("portal.cards.steuer_cockpit.toast_save_failed"));
    }
  };

  const resetSteuersatz = async () => {
    try {
      await supabase.rpc("merge_kontakt_meta", {
        _kontakt_id: kontakt.id,
        _updates: { steuersatzManuell: null },
      });
      setSteuersatz(autoSteuersatz ?? 0);
      toast.success(t("portal.cards.steuer_cockpit.toast_reset"));
      onRefresh();
    } catch (e) {
      console.error(e);
      toast.error(t("portal.cards.steuer_cockpit.toast_reset_failed"));
    }
  };

  // ─── Berechnungen (real, mit Live-Daten aus reservierter Wohnung / Objekt als Fallback) ───
  const objMeta = (invMeta?.objektSnapshot || {}) as Record<string, any>;
  const liveObjekt = liveExpose || {};
  // Gebäudeanteil: 100 % - Grundstücksanteil (aus Objektdaten). OHNE Angabe wird
  // KEINE AfA gerechnet, der fruehere 80-%-Default ist gestrichen.
  const grundstuecksAnteilProz = Number(invMeta.grundstueckAnteil ?? objMeta.grundstueckAnteil ?? liveObjekt.grundstueckAnteil ?? liveObjekt.grundstueck_anteil ?? 0);
  const gebaeudeAnteilGemeldet = Number(invMeta.gebaeudeAnteil || objMeta.gebaeudeAnteil || 0);
  const gebaeudeAnteilFehlt = !(grundstuecksAnteilProz > 0) && !(gebaeudeAnteilGemeldet > 0);
  const gebaeudeAnteilProz = grundstuecksAnteilProz > 0
    ? (100 - grundstuecksAnteilProz) / 100
    : gebaeudeAnteilGemeldet > 0 ? gebaeudeAnteilGemeldet / 100 : 0;
  // AfA-Satz: gemeldeter Satz hat Vorrang, sonst der gesetzliche Satz nach
  // § 7 Abs. 4 EStG aus dem Baujahr (2,5 % vor 1925, 2 % bis 2022, 3 % ab 2023).
  // Ohne beides KEINE AfA, der fruehere 2-%-Fallback ist gestrichen.
  const afaSatzGemeldet = Number(
    invMeta.afaSatz
    || inv.afa_satz
    || objMeta.afaSatz
    || liveObjekt.afaSatz
    || liveObjekt.afa_satz
    || 0
  );
  const baujahr = Number(
    invMeta.baujahr
    || objMeta.baujahr
    || wohnungSnap?.baujahr
    || liveWohnung?.baujahr
    || liveObjekt.baujahr
    || 0
  ) || null;
  const afaSatzFehlt = !(afaSatzGemeldet > 0) && !baujahr;
  const afaSatzP = afaSatzGemeldet > 0
    ? afaSatzGemeldet
    : baujahr ? linearerAfaSatz(baujahr).satz : 0;
  const afaSatz = afaSatzP / 100;
  // Kaufnebenkosten (Grunderwerbsteuer, Notar, Makler) gehoeren nach § 7 EStG zu den
  // Anschaffungskosten und damit in die AfA-Bemessungsgrundlage. Es zaehlen nur
  // ERFASSTE Nebenkosten, der fruehere 10,5-%-Pauschalansatz ist gestrichen.
  const nebenkostenGemeldet = Number(invMeta.nebenkosten || objMeta.nebenkosten || liveObjekt.nebenkosten || 0);
  const nebenkostenErfasst = nebenkostenGemeldet > 0;
  const nebenkosten = nebenkostenErfasst ? nebenkostenGemeldet : 0;
  // Sanierungskosten aus Objekt
  const sanierungskosten = Number(
    invMeta.sanierungskosten
    || objMeta.sanierungskosten
    || liveObjekt.sanierungskosten
    || 0
  );
  // Erhoehte Abschreibung nach § 7h/i gibt es nur mit Bescheinigung fuer Denkmal oder
  // Sanierungsgebiet. Ohne ausdruecklich gesetztes Flag wird regulaer abgeschrieben.
  const denkmalFlag = [
    invMeta?.denkmalAfa, invMeta?.denkmalschutz, invMeta?.sanierungsgebiet,
    objMeta?.denkmalAfa, objMeta?.denkmalschutz, objMeta?.sanierungsgebiet,
    liveObjekt?.denkmalAfa, liveObjekt?.denkmalschutz, liveObjekt?.sanierungsgebiet,
  ].some((v) => v === true);
  const denkmalAfaAktiv = denkmalFlag && sanierungskosten > 0;

  // Lineare AfA nur, wenn Gebaeudeanteil UND Satz (aus Baujahr oder Meldung)
  // vorliegen. AfA-Bemessungsgrundlage = (Kaufpreis + erfasste Nebenkosten)
  // x Gebaeudeanteil. Ohne Denkmal-Flag erhoehen die Sanierungskosten diese
  // Grundlage statt mit der Staffel zu laufen.
  const afaBerechenbar = !gebaeudeAnteilFehlt && !afaSatzFehlt;
  const gebaeudeBasis = afaBerechenbar
    ? (kaufpreis + nebenkosten) * gebaeudeAnteilProz + (denkmalAfaAktiv ? 0 : sanierungskosten)
    : 0;
  const linearAfaJahr = afaBerechenbar ? gebaeudeBasis * afaSatz : 0;
  // § 7h/i EStG ist eine Staffel, kein Dauersatz: 9 % in den Jahren 1 bis 8,
  // 7 % in den Jahren 9 bis 12, danach nichts mehr. Das Jahr ergibt sich aus
  // dem Kaufdatum. Fehlt es, wird der Sanierungsanteil NICHT angesetzt
  // (frueher wurde still Jahr 1 angenommen).
  const kaufdatumStr = inv.kaufdatum || invMeta?.kaufdatum || invMeta?.notarTermin || null;
  const kaufdatumDate = kaufdatumStr ? new Date(kaufdatumStr) : null;
  const kaufjahr = kaufdatumDate && !Number.isNaN(kaufdatumDate.getTime()) ? kaufdatumDate.getFullYear() : null;
  const denkmalJahr = kaufjahr ? Math.max(1, new Date().getFullYear() - kaufjahr + 1) : 1;
  const denkmalJahrFehlt = denkmalAfaAktiv && !kaufjahr;
  const denkmalRow = denkmalAfaAktiv && kaufjahr
    ? (denkmalVerlauf(sanierungskosten, "vermietet")[denkmalJahr - 1] || null)
    : null;
  const sanierungsAfaJahr = denkmalRow?.betrag || 0;
  const sanierungsAfaSatzP = denkmalJahr <= 8 ? 9 : denkmalJahr <= 12 ? 7 : 0;
  const denkmalAbgelaufen = denkmalAfaAktiv && !!kaufjahr && !denkmalRow;
  const afaGesamtJahr = linearAfaJahr + sanierungsAfaJahr;
  const afaFehlt = !afaBerechenbar && sanierungsAfaJahr <= 0;
  const steuerjahr = aktuellesSteuerjahr();

  const darlehenSumme = Number(akz.darlehensbetrag || akz.summe || 0);
  const zinssatzProz = Number(akz.zinssatz || parseFloat(String(akz.zins || "0").replace(",", ".")) || 0);
  const zinsenJahr = Number(akz.zinsenJahr1 || (darlehenSumme * zinssatzProz / 100) || 0);

  // Miete pro Jahr: zuerst Investment-Meta, dann reservierte Wohnung (mieteGesamt = monatlich), dann Objekt-Global
  const wohnungMieteMonat = Number(liveWohnung?.mieteGesamt || liveWohnung?.miete_gesamt || 0);
  const mieteJahr = Number(
    invMeta.jahresnettomiete
    || objMeta.jahresnettomiete
    || (wohnungMieteMonat * 12)
    || liveObjekt?.globalDaten?.jahresnettomiete
    || 0
  );

  // Hausgeld monatlich:
  //  1) Investment-Meta (manuell gesetzt vom VP)
  //  2) Snapshot der reservierten Wohnung (falls dort hinterlegt)
  //  3) Live: globales Objekt-Hausgeld geteilt durch Anzahl Wohnungen (anteilig pro Wohnung)
  //  4) Objekt-Snapshot
  const wohnungenAnzahl = Math.max(
    Number(liveExpose?.wohnungen?.length || 0),
    Number(objMeta?.wohnungenAnzahl || 0),
    1
  );
  const liveHausgeldGlobal = Number(liveObjekt?.globalDaten?.hausgeldMonat || 0);
  const liveHausgeldAnteilig = liveHausgeldGlobal > 0 ? liveHausgeldGlobal / wohnungenAnzahl : 0;
  const hausgeldMonat = Number(
    invMeta.hausgeldMonat
    || wohnungSnap?.hausgeldMonat
    || wohnungSnap?.hausgeld
    || liveWohnung?.hausgeldMonat
    || liveWohnung?.hausgeld
    // get-expose liefert Tabellenzeilen, das Hausgeld steht dort in `meta`.
    || liveWohnung?.meta?.hausgeldMonat
    || liveHausgeldAnteilig
    || objMeta.hausgeldMonat
    || 0
  );
  // Nur der Verwaltungsanteil des Hausgelds ist Werbungskosten. Die Zuführung
  // zur Instandhaltungsrücklage ist nicht abziehbar. Es zählt nur ein aktiv
  // erfasster Betrag, die frühere Prozent-Pauschale ist gestrichen.
  const hausgeldVerwGemeldet = Number(invMeta.hausgeldNichtUmlage || 0);
  const hausgeldVerwFehlt = !(hausgeldVerwGemeldet > 0) && hausgeldMonat > 0;
  const hausgeldVerw = hausgeldVerwGemeldet > 0 ? hausgeldVerwGemeldet : 0;

  const werbungskostenJahr = afaGesamtJahr + zinsenJahr + hausgeldVerw;
  const werbungskostenUnvollstaendig = afaFehlt || hausgeldVerwFehlt || !nebenkostenErfasst || denkmalJahrFehlt;
  // Steuerliches Ergebnis aus Vermietung und Verpachtung: negativ = Verlust, positiv = Überschuss
  const ergebnisJahr = mieteJahr - werbungskostenJahr;
  const istVerlust = ergebnisJahr < 0;
  const mieteFehlt = mieteJahr <= 0;

  // Steuereffekt (§ 32a EStG), ohne stille Annahmen:
  //  1) Satz nicht manuell gesetzt und Selbstauskunft vorhanden → Differenzmethode
  //     mit zvE, die Ableitung (Brutto × 0,7) wird im Tooltip offengelegt
  //  2) Satz manuell gesetzt → flache Rechnung mit diesem Satz, als Schätzwert markiert
  //  3) weder noch → KEIN Steuereffekt, "Angabe fehlt" (kein 42-%-Fallback)
  const bruttoSA = getBruttoFromSA(saData);
  const verheiratet = getVerheiratetFromSA(saData);
  const zvEausSA = zvESA?.zvE ?? 0;
  const zvE = manuellGesetzt ? 0 : zvEausSA;
  // Auch ein zvE von 0 aus der Selbstauskunft trägt die Differenzmethode.
  const zvEBelastbar = !manuellGesetzt && !!zvESA;
  // Eine angegebene 0 ist eine Angabe: Satz 0, kein Steuereffekt, keine Lücke.
  const steuersatzFehlt = !manuellGesetzt && !zvESA;

  const minderung = -ergebnisJahr; // Verlust > 0, Überschuss < 0
  const diff = zvEBelastbar ? berechneSteuerersparnis(zvE, minderung, verheiratet) : null;
  // positiv = Ersparnis (Verlust), negativ = Mehrsteuer (Überschuss)
  const steuerEffektJahr = diff ? diff.ersparnis : steuersatzFehlt ? 0 : minderung * (steuersatz / 100);
  const steuerEffektMonat = steuerEffektJahr / 12;
  const effektiverSatzP = diff ? Math.abs(diff.effektiverSatzP) : steuersatz;
  const effektSatzText = zahl(effektiverSatzP, 1);
  const steuerEffektGeschaetzt = !zvEBelastbar;

  // Fehlende Angaben offenlegen: betroffene Posten werden NICHT gerechnet,
  // das Gesamtergebnis ist unvollständig (keine stillen Pauschalen mehr).
  const fehlendeAngaben: string[] = [];
  if (mieteFehlt) fehlendeAngaben.push(t("portal.cards.steuer_cockpit.miss_rent", "Jahresmiete fehlt, bitte vom Vertriebspartner ergänzen lassen"));
  if (gebaeudeAnteilFehlt) fehlendeAngaben.push(t("portal.cards.steuer_cockpit.miss_share", "Gebäudeanteil fehlt, ohne ihn wird keine AfA berechnet, bitte vom Vertriebspartner ergänzen lassen"));
  if (afaSatzFehlt) fehlendeAngaben.push(t("portal.cards.steuer_cockpit.miss_afa", "Baujahr oder AfA-Satz fehlt, ohne sie wird keine AfA berechnet, bitte vom Vertriebspartner ergänzen lassen"));
  if (!nebenkostenErfasst) fehlendeAngaben.push(t("portal.cards.steuer_cockpit.miss_nk", "Kaufnebenkosten nicht erfasst, die AfA-Grundlage enthält nur den Kaufpreis, bitte vom Vertriebspartner ergänzen lassen"));
  if (hausgeldVerwFehlt) fehlendeAngaben.push(t("portal.cards.steuer_cockpit.miss_hausgeld", "Nicht umlagefähiger Verwaltungsanteil des Hausgelds fehlt, der Posten wird nicht angesetzt, bitte vom Vertriebspartner ergänzen lassen"));
  if (steuersatzFehlt) fehlendeAngaben.push(t("portal.cards.steuer_cockpit.miss_tax", "Steuersatz fehlt, über Anpassen eintragen oder die Selbstauskunft ausfüllen, ohne ihn wird kein Steuereffekt berechnet"));
  if (denkmalJahrFehlt) fehlendeAngaben.push(t("portal.cards.steuer_cockpit.miss_denkmal", "Kaufdatum fehlt, das Jahr der § 7h/i Staffel ist nicht bestimmbar, der Sanierungsanteil wird nicht angesetzt"));

  // Klartext, welche AfA-Variante gerechnet wurde
  const sanierungHinweis = sanierungskosten <= 0
    ? ""
    : denkmalAfaAktiv
      ? denkmalAbgelaufen
        ? t("portal.cards.steuer_cockpit.afa_denkmal_abgelaufen", "Erhöhte Abschreibung nach § 7h/i EStG: Der Begünstigungszeitraum von 12 Jahren ist abgelaufen, es wird kein Sanierungsanteil mehr abgeschrieben.")
        : t("portal.cards.steuer_cockpit.afa_denkmal_hint", "Erhöhte Abschreibung nach § 7h/i EStG: 9 % in den Jahren 1 bis 8, danach 7 % in den Jahren 9 bis 12. Angesetzt ist Jahr {{year}} mit {{rate}} %.", {
            year: denkmalJahr,
            rate: sanierungsAfaSatzP,
          })
      : t("portal.cards.steuer_cockpit.afa_regulaer_hint", "Für § 7h/i liegt keine Bescheinigung vor. Die Sanierungskosten von {{cost}} erhöhen deshalb die normale AfA-Grundlage und werden mit {{rate}} % abgeschrieben.", {
          cost: fmt(sanierungskosten),
          rate: zahl(afaSatz * 100, 1),
        });
  const afaBasisHinweis = t("portal.cards.steuer_cockpit.afa_basis_hint", "Bemessungsgrundlage: Kaufpreis {{kp}} + Kaufnebenkosten {{nk}}, davon {{share}} % Gebäudeanteil.", {
    kp: fmt(kaufpreis),
    nk: fmt(nebenkosten),
    share: zahl(gebaeudeAnteilProz * 100, 0),
  });

  // Anlage-V-Aufstellung fuer dieses MOREImmo-Investment: ueber den
  // gemeinsamen Adapter in das ExternesInvestment-Shape gebracht und dann mit
  // derselben Rechenlogik wie bei eigenen Investments gerechnet. Die in der
  // Karte aufgeloesten Werte (Live-Expose-Fallbacks) werden uebernommen, damit
  // PDF und Karte dieselben Zahlen zeigen. Posten, die der MOREImmo-Datensatz
  // nicht kennt (Grundsteuer, Versicherung, Verwaltung, Umlagen), erscheinen
  // im PDF ausdruecklich als "Angabe fehlt".
  const baueAufstellung = () => {
    const adapted = adaptMoreImmoInvestment(inv, invMeta, finanzierung);
    const basis = {
      ...adapted,
      kaufpreis,
      nebenkosten,
      baujahr,
      mieteinnahmen_kalt: mieteJahr > 0 ? mieteJahr / 12 : 0,
      hausgeld: hausgeldMonat,
      meta: {
        ...(adapted.meta || {}),
        anlageV: {
          ...(adapted.meta?.anlageV || {}),
          ...(gebaeudeAnteilGemeldet > 0 ? { gebaeude_anteil_prozent: gebaeudeAnteilGemeldet } : {}),
          ...(afaSatzGemeldet > 0 ? { afa_satz_prozent: afaSatzGemeldet } : {}),
          ...(hausgeldVerwGemeldet > 0 ? { hausgeld_nicht_umlage_monat: hausgeldVerwGemeldet } : {}),
        },
      },
    };
    return baueAnlageVAufstellung(basis, {
      jahr: new Date().getFullYear(),
      herkunft: "moreimmo",
      bodenwertAnteil: grundstuecksAnteilProz > 0 ? grundstuecksAnteilProz : null,
    });
  };

  const exportPdf = async () => {
    setPdfLaeuft(true);
    try {
      await erzeugeAnlageVPdf(baueAufstellung());
    } finally {
      setPdfLaeuft(false);
    }
  };

  // Server-Versand mit echtem PDF-Anhang: Der Dialog erzeugt das PDF beim
  // Senden und schickt es ueber die Edge Function send-anlage-v.
  const teilePerMail = () => setSendenAufstellung(baueAufstellung());

  // Daten für Charts (einfache Berechnung – keine Hooks nach early return)
  const wertChartData: { jahr: number; wert: number; gewinn: number; miete: number }[] = [];
  for (let j = 0; j <= 30; j++) {
    const w = kaufpreis * Math.pow(1 + wertSteigerung / 100, j);
    wertChartData.push({
      jahr: j,
      wert: Math.round(w),
      gewinn: Math.round(w - kaufpreis),
      miete: Math.round(mieteJahr * Math.pow(1 + mietSteigerung / 100, j)),
    });
  }

  const werbungsChartData = [
    { name: "AfA", wert: Math.round(afaGesamtJahr) },
    { name: "Zinsen", wert: Math.round(zinsenJahr) },
    { name: "Hausgeld", wert: Math.round(hausgeldVerw) },
  ];

  // Kurze Achsenbeschriftung: Deutsch „350.000 €“ wird „350.000 €“ (ab Mio. „1,2 Mio. €“), Englisch „€350k“.
  const fmtCompact = (v: number) => {
    const kurz = new Intl.NumberFormat(portalLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(v);
    return sprache === "en" ? `€${kurz}` : `${kurz} €`;
  };

  // Wertentwicklung-Helper für Stat-Tiles
  const wertNach = (jahre: number) => kaufpreis * Math.pow(1 + wertSteigerung / 100, jahre);
  const mieteNach = (jahre: number) => mieteJahr * Math.pow(1 + mietSteigerung / 100, jahre);

  return (
    <Card className="p-5 border-primary/15 bg-gradient-to-br from-primary/5 via-card to-card w-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Calculator className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-bold text-base">{t("portal.cards.steuer_cockpit.title")}</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/60 ml-auto cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {t("portal.cards.steuer_cockpit.info", { afaType: denkmalAfaAktiv ? t("portal.cards.steuer_cockpit.afa_sanierung") : t("portal.cards.steuer_cockpit.afa_linear") })}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ─── Hauptlayout: 12-Spalten-Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Linke Spalte: Steuersatz + KPIs */}
        <div className="lg:col-span-5 space-y-3">
          {/* Steuersatz Editor */}
          <div {...einlage("p-3 flex items-center justify-between gap-2")}>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("portal.cards.steuer_cockpit.tax_rate_label")}</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      {t(zvESA?.angegeben ? "portal.cards.steuer_cockpit.tax_rate_tooltip_zve" : "portal.cards.steuer_cockpit.tax_rate_tooltip", {
                        splitting: getVerheiratetFromSA(saData) ? t("portal.cards.steuer_cockpit.splitting") : "",
                        brutto: fmt(getBruttoFromSA(saData)),
                        zve: fmt(zvESA?.zvE ?? 0),
                      })}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {editing ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number" min={0} max={50} step={1}
                    value={draft}
                    onChange={(e) => setDraft(Number(e.target.value))}
                    className="h-8 w-20 text-sm"
                  />
                  <span className="text-sm">%</span>
                  <Button size="sm" className="h-8" onClick={saveSteuersatz}><Check className="h-3.5 w-3.5" /></Button>
                </div>
              ) : steuersatzVorhanden ? (
                <div className="flex items-center gap-2">
                  <p className="font-bold text-2xl text-primary">{prozentKurz(steuersatz)}</p>
                  {manuellGesetzt && (
                    <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">{t("portal.cards.steuer_cockpit.manual")}</Badge>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-bold text-lg text-muted-foreground">{t("portal.cards.steuer_cockpit.missing_badge", "Angabe fehlt")}</p>
                </div>
              )}
            </div>
            {!editing && (
              <div className="flex items-center gap-1">
                {manuellGesetzt && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={resetSteuersatz} title={t("portal.cards.steuer_cockpit.reset_title")}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => { setDraft(steuersatz); setEditing(true); }}>
                  <Pencil className="h-3 w-3" /> {t("portal.cards.steuer_cockpit.adjust")}
                </Button>
              </div>
            )}
          </div>
          {!manuellGesetzt && zvESA && (
            <p className="text-xs text-muted-foreground">{t("portal.cards.steuer_cockpit.suggestion_hint")}</p>
          )}

          {/* KPI-Tiles */}
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label={t("portal.cards.steuer_cockpit.afa_pa")}
              value={afaFehlt ? "–" : fmt(afaGesamtJahr)}
              sub={afaFehlt
                ? t("portal.cards.steuer_cockpit.afa_sub_missing", "Angabe Gebäudeanteil oder Baujahr fehlt")
                : denkmalAfaAktiv ? t("portal.cards.steuer_cockpit.afa_sub_san") : t("portal.cards.steuer_cockpit.afa_sub_linear", { rate: zahl(afaSatz * 100, 1) })}
              estimate={afaFehlt || !nebenkostenErfasst || denkmalJahrFehlt}
              estimateLabel={afaFehlt || denkmalJahrFehlt
                ? t("portal.cards.steuer_cockpit.missing_badge", "Angabe fehlt")
                : t("portal.cards.steuer_cockpit.incomplete_badge", "Unvollständig")}
              info={afaFehlt
                ? t("portal.cards.steuer_cockpit.afa_missing_info", "Ohne Gebäudeanteil und Baujahr (oder gemeldeten AfA-Satz) wird keine AfA berechnet, es werden keine Pauschalen angesetzt. Bitte lass die Angaben von deinem Vertriebspartner ergänzen.")
                : [
                    t("portal.cards.steuer_cockpit.afa_info", {
                      share: zahl(gebaeudeAnteilProz * 100, 0),
                      price: fmt(kaufpreis + nebenkosten),
                      base: fmt(gebaeudeBasis),
                      linear: fmt(linearAfaJahr),
                      rate: zahl(afaSatz * 100, 1),
                      sanText: denkmalAfaAktiv ? t("portal.cards.steuer_cockpit.afa_san_text", { san: fmt(sanierungsAfaJahr), cost: fmt(sanierungskosten), sanrate: sanierungsAfaSatzP, sanjahr: denkmalJahr }) : "",
                    }),
                    afaBasisHinweis,
                    sanierungHinweis,
                  ].filter(Boolean).join(" ")}
            />
            <Stat
              label={t("portal.cards.steuer_cockpit.werbungskosten_pa")}
              value={fmt(werbungskostenJahr)}
              sub={t("portal.cards.steuer_cockpit.werbungskosten_sub")}
              estimate={werbungskostenUnvollstaendig}
              estimateLabel={t("portal.cards.steuer_cockpit.incomplete_badge", "Unvollständig")}
              info={[
                t("portal.cards.steuer_cockpit.werbungskosten_info", { afa: fmt(afaGesamtJahr), zinsen: fmt(zinsenJahr), hg: fmt(hausgeldVerw), sum: fmt(werbungskostenJahr), miete: fmt(mieteJahr) }),
                werbungskostenUnvollstaendig
                  ? t("portal.cards.steuer_cockpit.werbungskosten_unvollstaendig_info", "Es fehlen Angaben, betroffene Posten sind nicht enthalten, Details unter den Kacheln.")
                  : "",
                t("portal.cards.steuer_cockpit.werbungskosten_stufe2", "Noch ohne Grundsteuer, Versicherung und Verwaltervergütung, diese Posten folgen in einer späteren Ausbaustufe."),
              ].filter(Boolean).join(" ")}
            />
            <Stat
              label={istVerlust
                ? t("portal.cards.steuer_cockpit.loss")
                : t("portal.cards.steuer_cockpit.surplus", "Steuerlicher Überschuss")}
              value={mieteFehlt ? "–" : fmt(Math.abs(ergebnisJahr))}
              sub={istVerlust
                ? t("portal.cards.steuer_cockpit.loss_sub")
                : t("portal.cards.steuer_cockpit.surplus_sub", "erhöht zvE")}
              estimate={mieteFehlt || werbungskostenUnvollstaendig}
              estimateLabel={mieteFehlt
                ? t("portal.cards.steuer_cockpit.rent_missing_badge", "Miete fehlt")
                : t("portal.cards.steuer_cockpit.incomplete_badge", "Unvollständig")}
              info={mieteFehlt
                ? t("portal.cards.steuer_cockpit.rent_missing_info", "Ohne Jahresmiete lässt sich das steuerliche Ergebnis nicht berechnen. Bitte lass die Mieteinnahmen von deinem Vertriebspartner ergänzen.")
                : t("portal.cards.steuer_cockpit.loss_info", { miete: fmt(mieteJahr), wk: fmt(werbungskostenJahr), loss: fmt(ergebnisJahr) })}
            />
            <Stat
              label={steuersatzFehlt || steuerEffektJahr >= 0
                ? t("portal.cards.steuer_cockpit.saving")
                : t("portal.cards.steuer_cockpit.extra_tax", "Mehrsteuer")}
              value={mieteFehlt || steuersatzFehlt ? "–" : fmt(Math.abs(steuerEffektJahr))}
              sub={mieteFehlt
                ? t("portal.cards.steuer_cockpit.rent_missing_sub", "Jahresmiete fehlt")
                : steuersatzFehlt
                  ? t("portal.cards.steuer_cockpit.tax_missing_sub", "Angabe Steuersatz fehlt")
                  : t("portal.cards.steuer_cockpit.saving_sub", { per_month: fmt(Math.abs(steuerEffektMonat)) })}
              highlight={!mieteFehlt && !steuersatzFehlt && steuerEffektJahr >= 0}
              estimate={mieteFehlt || steuersatzFehlt || steuerEffektGeschaetzt}
              estimateLabel={mieteFehlt
                ? t("portal.cards.steuer_cockpit.rent_missing_badge", "Miete fehlt")
                : steuersatzFehlt
                  ? t("portal.cards.steuer_cockpit.missing_badge", "Angabe fehlt")
                  : t("portal.cards.steuer_cockpit.estimate_badge", "Schätzwert")}
              info={mieteFehlt
                ? t("portal.cards.steuer_cockpit.rent_missing_info", "Ohne Jahresmiete lässt sich das steuerliche Ergebnis nicht berechnen. Bitte lass die Mieteinnahmen von deinem Vertriebspartner ergänzen.")
                : steuersatzFehlt
                  ? t("portal.cards.steuer_cockpit.tax_missing_info", "Ohne Steuersatz wird kein Steuereffekt berechnet, ein Pauschalsatz wird nicht angesetzt. Trag deinen Grenzsteuersatz über Anpassen ein oder füll die Selbstauskunft aus.")
                  : zvEBelastbar && zvESA?.angegeben
                    ? t("portal.cards.steuer_cockpit.tax_effect_info_zve", "Differenzmethode nach § 32a EStG, Tarif {{year}}. Dein zvE von {{zve}} stammt aus deiner Selbstauskunft. Ergebnis {{result}}, effektiver Steuersatz {{eff}} % (Grenzsteuersatz {{rate}} %), Wirkung {{effect}} pro Jahr. Ohne Soli und Kirchensteuer.", {
                        year: steuerjahr,
                        zve: fmt(zvEausSA),
                        result: fmt(ergebnisJahr),
                        eff: effektSatzText,
                        rate: prozentZahl(steuersatz),
                        effect: fmt(Math.abs(steuerEffektJahr)),
                      })
                  : zvEBelastbar
                    ? t("portal.cards.steuer_cockpit.tax_effect_info", "Differenzmethode nach § 32a EStG, Tarif {{year}}. Dein zvE ist aus der Selbstauskunft abgeleitet: Brutto {{brutto}} mal 0,7 ergibt rund {{zve}}. Ergebnis {{result}}, effektiver Steuersatz {{eff}} % (Grenzsteuersatz {{rate}} %), Wirkung {{effect}} pro Jahr. Ohne Soli und Kirchensteuer.", {
                        year: steuerjahr,
                        brutto: fmt(bruttoSA),
                        zve: fmt(zvEausSA),
                        result: fmt(ergebnisJahr),
                        eff: effektSatzText,
                        rate: prozentZahl(steuersatz),
                        effect: fmt(Math.abs(steuerEffektJahr)),
                      })
                    : t("portal.cards.steuer_cockpit.tax_effect_flat_info", "Flache Rechnung mit deinem eingetragenen Grenzsteuersatz: Ergebnis {{result}} mal {{rate}} %. Dein zu versteuerndes Einkommen ist nicht bekannt, deshalb ist die Wirkung von {{effect}} pro Jahr ein Schätzwert. Ohne Soli und Kirchensteuer.", {
                        result: fmt(ergebnisJahr),
                        rate: prozentZahl(steuersatz),
                        effect: fmt(Math.abs(steuerEffektJahr)),
                      })}
            />
          </div>

          {fehlendeAngaben.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {fehlendeAngaben.length === 1
                  ? t("portal.cards.steuer_cockpit.missing_intro_one", "Ergebnis unvollständig, eine Angabe fehlt:")
                  : t("portal.cards.steuer_cockpit.missing_intro_other", "Ergebnis unvollständig, {{count}} Angaben fehlen:", { count: fehlendeAngaben.length })}{" "}
                {fehlendeAngaben.join("; ")}.
              </span>
            </div>
          )}
        </div>

        {/* Rechte Spalte: Werbungskosten-Chart */}
        <div className="lg:col-span-7">
          <div {...einlage("p-3 h-full")}>
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm">{t("portal.cards.steuer_cockpit.split_title")}</h4>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: t("portal.cards.steuer_cockpit.split_afa"), wert: Math.round(afaGesamtJahr) },
                  { name: t("portal.cards.steuer_cockpit.split_zinsen"), wert: Math.round(zinsenJahr) },
                  { name: t("portal.cards.steuer_cockpit.split_hausgeld"), wert: Math.round(hausgeldVerw) },
                ]} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <RTooltip
                    formatter={(v: any) => fmt(Number(v))}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="wert" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              <MiniStat label={t("portal.cards.steuer_cockpit.mini_rent")} value={fmt(mieteJahr)} />
              <MiniStat label={t("portal.cards.steuer_cockpit.mini_wk")} value={fmt(werbungskostenJahr)} />
              <MiniStat
                label={steuersatzFehlt || steuerEffektJahr >= 0
                  ? t("portal.cards.steuer_cockpit.mini_saving")
                  : t("portal.cards.steuer_cockpit.mini_extra_tax", "Überschuss → Mehrsteuer")}
                value={mieteFehlt || steuersatzFehlt ? "–" : fmt(Math.abs(steuerEffektJahr))}
                accent={!mieteFehlt && !steuersatzFehlt && steuerEffektJahr >= 0}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Wertentwicklung mit Area-Chart (volle Breite) ─── */}
      <div {...einlage("p-3 mt-4")}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">{t("portal.cards.steuer_cockpit.forecast_title")}</h4>
          <Badge variant="secondary" className="ml-auto">{t("portal.cards.steuer_cockpit.forecast_badge")}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <SliderRow label={t("portal.cards.steuer_cockpit.value_growth")} value={wertSteigerung} onChange={setWertSteigerung} min={0} max={5} step={0.25} />
          <SliderRow label={t("portal.cards.steuer_cockpit.rent_growth")} value={mietSteigerung} onChange={setMietSteigerung} min={0} max={3} step={0.25} />
        </div>

        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={wertChartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="cWert" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cMiete" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="jahr" tickFormatter={(j) => t("portal.cards.steuer_cockpit.year_short", { n: j })} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="left" tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <RTooltip
                formatter={(v: any, name: any) => [fmt(Number(v)), name === "wert" ? t("portal.cards.steuer_cockpit.property_value") : t("portal.cards.steuer_cockpit.annual_rent")]}
                labelFormatter={(l) => t("portal.cards.steuer_cockpit.after_years", { n: l })}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "wert" ? t("portal.cards.steuer_cockpit.property_value") : t("portal.cards.steuer_cockpit.annual_rent")} />
              <Area yAxisId="left" type="monotone" dataKey="wert" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cWert)" />
              <Area yAxisId="right" type="monotone" dataKey="miete" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#cMiete)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {[10, 20, 30].map((j) => (
            <div key={j} {...einlage("p-2 text-center")}>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("portal.cards.steuer_cockpit.in_years", { n: j })}</p>
              <p className="font-bold text-sm text-foreground">{fmt(wertNach(j))}</p>
              <p className="text-xs text-[hsl(var(--success))]">+{fmt(wertNach(j) - kaufpreis)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("portal.cards.steuer_cockpit.rent_label", { value: fmt(mieteNach(j)) })}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {t("portal.cards.steuer_cockpit.forecast_disclaimer")}
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="brand" onClick={exportPdf} disabled={pdfLaeuft} className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />{t("portal.cards.steuer_cockpit.export_pdf", "Anlage-V-Aufstellung (PDF)")}
        </Button>
        <Button size="sm" variant="ghost" onClick={teilePerMail} disabled={pdfLaeuft} className="gap-1.5">
          <Mail className="h-3.5 w-3.5" />{t("portal.cards.steuer_cockpit.mail_teilen", "Per E-Mail teilen")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {t("portal.cards.steuer_cockpit.beratung_hinweis", "Aufstellung zur Vorbereitung, ersetzt keine Steuerberatung.")}
      </p>

      <AnlageVSendenDialog
        aufstellung={sendenAufstellung}
        open={sendenAufstellung != null}
        onOpenChange={(o) => { if (!o) setSendenAufstellung(null); }}
      />
    </Card>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div {...(accent
      ? { className: "rounded-xl p-2 bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20" }
      : einlage("p-2"))}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-bold text-xs mt-0.5 ${accent ? "text-[hsl(var(--success))]" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value, sub, highlight, info, estimate, estimateLabel }: {
  label: string; value: string; sub?: string; highlight?: boolean; info?: string;
  /** kennzeichnet Werte, die auf Annahmen statt auf gepflegten Daten beruhen */
  estimate?: boolean; estimateLabel?: string;
}) {
  return (
    <div {...(highlight
      ? { className: "rounded-xl p-3 bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20" }
      : einlage("p-3"))}>
      <div className="flex items-center gap-1 flex-wrap">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        {estimate && estimateLabel && (
          <Badge variant="secondary" className="font-normal">
            {estimateLabel}
          </Badge>
        )}
        {info && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">{info}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <p className={`font-bold text-sm md:text-base mt-0.5 ${highlight ? "text-[hsl(var(--success))]" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step }: any) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{prozentKurz(value)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

/** Zahl eines Prozentsatzes mit bis zu zwei Nachkommastellen, ohne aufzufüllen. */
function prozentZahl(v: number): string {
  return Number(v).toLocaleString(portalLocale(), { maximumFractionDigits: 2 });
}

/** Prozentsatz wie „42 %“ (Deutsch) oder „42%“ (Englisch). */
function prozentKurz(v: number): string {
  return portalSprache() === "en" ? `${prozentZahl(v)}%` : `${prozentZahl(v)} %`;
}
