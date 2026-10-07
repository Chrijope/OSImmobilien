import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Download, FileText, Mail, AlertCircle } from "lucide-react";
import {
  berechneSteuer,
  cockpitWerte,
  erhaltungsaufwandAusBelegen,
  gebaeudeAnteilAusBodenwert,
  hausgeldEuroAusProzent,
  leseAnlageV,
  type ExternesInvestment,
  type SteuerErgebnis,
  type SteuerPosten,
  type SteuerPostenSchluessel,
} from "@/lib/eigeneInvestmentBerechnungen";
import { linearerAfaSatz, SONDER_7B_JAHRE, SONDER_7B_SATZ } from "@/lib/afaSaetze";
import type { TFunction } from "i18next";
import { portalLocale, portalSprache } from "@/i18n/portalSprache";
import { euroText, zahlText, type FormatSprache } from "@/lib/sprachFormat";
import { CockpitFeldStift, type StiftFeld, type StiftWerte } from "@/components/kunde/eigene/CockpitFeldStift";
import type { CockpitFeld } from "@/lib/eigeneInvestmentSpeichern";
import { baueAnlageVAufstellung, type AnlageVAufstellung } from "@/lib/anlageVExport";
import { erzeugeAnlageVPdf } from "@/lib/anlageVPdf";
import { AnlageVSendenDialog } from "@/components/kunde/AnlageVSendenDialog";
import {
  suggestSteuersatz,
  getVerheiratetFromSA,
  zvEFuerRechnungAusSA,
} from "@/lib/steuerHelper";
import { useTranslation, Trans } from "react-i18next";

/** Zahl als deutscher Text fuer ein Eingabefeld, leer bei fehlender Angabe. */
const alsText = (v: number | null | undefined) =>
  v == null ? "" : String(v).replace(".", ",");

interface StiftAufbau {
  titel: string;
  felder: StiftFeld[];
  hinweis?: string;
  zusatz?: (werte: StiftWerte, setze: (key: CockpitFeld, wert: string) => void) => React.ReactNode;
}

export function SteuerCockpitEigen({ inv, saData, onPersist, onFelderSpeichern, onBearbeiten, onBelegeZeigen }: {
  inv: ExternesInvestment;
  saData?: any;
  onPersist?: (patch: any) => Promise<void> | void;
  /**
   * Stift je Zeile: speichert ueber denselben Weg wie der Bearbeiten-Dialog
   * (eigeneInvestmentSpeichern). Ohne diese Funktion erscheinen keine Stifte.
   */
  onFelderSpeichern?: (werte: StiftWerte) => Promise<boolean>;
  /** Oeffnet den Bearbeiten-Dialog, fuer Zeilen aus Kaltmiete und Finanzierung. */
  onBearbeiten?: () => void;
  /** Springt zu den Belegen, fuer den Erhaltungsaufwand. */
  onBelegeZeigen?: () => void;
}) {
  const { t } = useTranslation();
  const sprache = portalSprache();
  const fmt = (v: number) => euroText(v, sprache, 0);
  const m = inv.meta || {};
  const sc = m.steuerCockpit || {};
  // KEIN 42-%-Fallback: ein Vorschlag existiert nur, wenn die Selbstauskunft
  // ein zvE oder ein Brutto liefert. Ohne Angabe bleibt das Feld leer und der
  // Steuereffekt wird nicht berechnet.
  const zvESA = zvEFuerRechnungAusSA(saData);
  const defaultSatz: number | null = zvESA ? suggestSteuersatz(saData, 0) : null;

  const [sonderAfa, setSonderAfa] = useState<boolean>(!!sc.sonderAfA7b);
  const [grenzsteuersatz, setGrenzsteuersatz] = useState<number | null>(sc.grenzsteuersatz ?? defaultSatz);

  // Anlage-V-Angaben aus dem Bearbeiten-Dialog (Spalte bevorzugt, sonst meta.anlageV).
  const anlageV = useMemo(() => leseAnlageV(inv), [inv]);

  // Bodenwert-Anteil und Verwaltungsanteil oben sind seit dem 25.09.2026 nur
  // eine andere Schreibweise der Dialogfelder Gebaeudeanteil und "Hausgeld
  // nicht umlagefaehig". Es gibt EINEN Wert, gespeichert ueber denselben Weg
  // wie der Stift (onFelderSpeichern). Keine Vorbelegung mit Pauschalen:
  // leeres Feld heisst "Angabe fehlt".
  const werte = useMemo(() => cockpitWerte(inv), [inv]);
  const bodenwertAnteil = werte.bodenwertAnteil;
  const hausgeldP = werte.hausgeldNichtUmlageProzent;
  const hausgeldGesamt = Number(inv.hausgeld) || 0;
  // Ohne Gesamthausgeld je Monat gibt es keine Grundlage fuer die Umrechnung
  // in Euro; das Feld bleibt dann gesperrt und beschreibt, was fehlt.
  const hausgeldUmrechenbar = hausgeldGesamt > 0;
  const [bodenText, setBodenText] = useState(bodenwertAnteil == null ? "" : String(bodenwertAnteil));
  const [hausgeldText, setHausgeldText] = useState(hausgeldP == null ? "" : String(hausgeldP));
  const [bodenFehler, setBodenFehler] = useState(false);
  const [hausgeldFehler, setHausgeldFehler] = useState(false);
  // Nach dem Speichern (oder einer Aenderung im Dialog) den gespeicherten Wert zeigen.
  useEffect(() => { setBodenText(bodenwertAnteil == null ? "" : String(bodenwertAnteil)); }, [bodenwertAnteil]);
  useEffect(() => { setHausgeldText(hausgeldP == null ? "" : String(hausgeldP)); }, [hausgeldP]);

  const alsProzent = (text: string): number | null | "ungueltig" => {
    const roh = text.trim().replace(",", ".");
    if (roh === "") return null;
    const n = Number(roh);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : "ungueltig";
  };
  const speichereBoden = async () => {
    const eingabe = alsProzent(bodenText);
    setBodenFehler(eingabe === "ungueltig");
    if (eingabe === "ungueltig" || !onFelderSpeichern) return;
    const gebaeude = gebaeudeAnteilAusBodenwert(eingabe);
    if (gebaeude === werte.gebaeudeAnteilProzent) return;
    await onFelderSpeichern({ gebaeude_anteil_prozent: gebaeude == null ? "" : String(gebaeude) });
  };
  const speichereHausgeld = async () => {
    const eingabe = alsProzent(hausgeldText);
    setHausgeldFehler(eingabe === "ungueltig");
    if (eingabe === "ungueltig" || !onFelderSpeichern || !hausgeldUmrechenbar) return;
    const euro = hausgeldEuroAusProzent(eingabe, hausgeldGesamt);
    if (euro === werte.hausgeldNichtUmlageMonat) return;
    await onFelderSpeichern({ hausgeld_nicht_umlage_monat: euro == null ? "" : String(euro) });
  };

  // Steuerjahr: aktuelles Jahr zurueck bis zum Kaufjahr. Damit greifen die
  // zeitanteilige AfA im Kaufjahr und der Erhaltungsaufwand des Jahres.
  const aktuellesJahr = new Date().getFullYear();
  const kaufjahr = useMemo(() => {
    const d = inv.kaufdatum ? new Date(inv.kaufdatum) : null;
    if (!d || Number.isNaN(d.getTime())) return aktuellesJahr;
    return Math.min(d.getFullYear(), aktuellesJahr);
  }, [inv.kaufdatum, aktuellesJahr]);
  const jahresAuswahl = useMemo(() => {
    const liste: number[] = [];
    for (let j = aktuellesJahr; j >= kaufjahr; j--) liste.push(j);
    return liste;
  }, [aktuellesJahr, kaufjahr]);
  const [steuerjahr, setSteuerjahr] = useState<number>(aktuellesJahr);

  // zvE fuer die Differenzmethode:
  //  1) aus der Selbstauskunft (belastbar), solange der Satz nicht manuell gesetzt ist
  //  2) hat der Kunde den Satz selbst gesetzt, wird KEIN zvE mehr aus dem Satz
  //     zurueckgerechnet (das erfand Einkommen). Stattdessen rechnet berechneSteuer
  //     flach mit dem Satz und kennzeichnet das Ergebnis als Schaetzwert.
  const verheiratet = getVerheiratetFromSA(saData);
  const zvEausSA = zvESA?.zvE ?? 0;
  const satzManuell = grenzsteuersatz != null
    && (defaultSatz == null || Math.abs(grenzsteuersatz - defaultSatz) > 0.05);
  // undefined heißt: kein zvE, flach mit dem Satz. Eine 0 aus der
  // Selbstauskunft ist dagegen eine Angabe und läuft über die Differenzmethode.
  const zvE = satzManuell || !zvESA ? undefined : zvEausSA;
  const zvEBelastbar = zvE !== undefined;

  // Erhaltungsaufwand: nur Belege mit erfasstem Betrag und Belegdatum im
  // gewaehlten Steuerjahr. Belege ohne Betrag zaehlen nicht (kein Schaetzwert).
  const erhaltung = useMemo(
    () => erhaltungsaufwandAusBelegen(inv.dokumente, steuerjahr),
    [inv.dokumente, steuerjahr],
  );

  const ergebnis = useMemo(() => berechneSteuer(inv, {
    bodenwertAnteil, hausgeldNichtUmlagefaehig: hausgeldP,
    sonderAfA7b: sonderAfa, erhaltungsaufwandJahr: erhaltung.summe, grenzsteuersatz,
    zvE, verheiratet, betrachtungsjahr: steuerjahr,
  }), [inv, bodenwertAnteil, hausgeldP, sonderAfa, erhaltung, grenzsteuersatz, zvE, verheiratet, steuerjahr]);

  // Jahresmiete unbekannt: dann waere jeder "Verlust" reine Kostenaddition und die
  // Steuerersparnis erfunden. In diesem Fall keine Zahl zeigen.
  const mieteFehlt = ergebnis.mietEinnahmenJahr <= 0;
  const effektSatzText = zahlText(ergebnis.effektiverSatzP, sprache, 1);
  const postenText = (p: SteuerPosten) => postenAnzeige(p, ergebnis, sprache, t);

  // `neu` ueberschreibt einzelne Werte: Der Schalter ruft save im selben
  // Durchlauf wie setSonderAfa auf und saehe sonst noch den alten Stand.
  // Bodenwert und Verwaltungsanteil stehen nicht mehr hier, sondern in den
  // Dialogfeldern. Ein noch nicht uebernommener Altwert bleibt erhalten.
  const save = async (neu: { sonderAfA7b?: boolean } = {}) => {
    const patch = {
      ...sc,
      sonderAfA7b: neu.sonderAfA7b ?? sonderAfa, grenzsteuersatz,
    };
    await onPersist?.({ steuerCockpit: patch });
  };

  // Zuordnung Zeile zu Feld. Jede Zeile, die aus einem vom Kunden pflegbaren
  // Wert rechnet, bekommt einen Stift mit genau den Feldern, aus denen sie
  // rechnet. Schluessel und Beschriftungen wie im Bearbeiten-Dialog.
  const zahlFormat = (v: number) => v.toLocaleString(portalLocale(), { maximumFractionDigits: 2 });
  const stiftAufbau = (schluessel?: SteuerPostenSchluessel): StiftAufbau | null => {
    switch (schluessel) {
      case "umlagen":
        return {
          titel: t("portal.cards.steuer_eigen.stift_titel_umlagen", "Vereinnahmte Umlagen"),
          felder: [{ key: "umlagen_monat", art: "zahl", einheit: "€", label: t("portal.cards.eigene.form_umlagen", "Vereinnahmte Umlagen (€/Monat)"), hilfe: t("portal.cards.eigene.form_umlagen_hint", "Nebenkosten-Vorauszahlungen des Mieters, steuerlich Einnahmen.") }],
        };
      case "afa":
        return {
          titel: t("portal.cards.steuer_eigen.stift_titel_afa", "AfA Gebäude"),
          felder: [
            { key: "gebaeude_anteil_prozent", art: "zahl", einheit: "%", label: t("portal.cards.eigene.form_gebaeude_anteil", "Gebäudeanteil (%)"), hilfe: t("portal.cards.eigene.form_gebaeude_anteil_hint", "Anteil des Gebäudes an den Anschaffungskosten laut Kaufpreisaufteilung, z. B. nach der BMF-Arbeitshilfe.") },
            { key: "baujahr", art: "jahr", label: t("portal.cards.eigene.form_baujahr", "Baujahr") },
            { key: "afa_satz_prozent", art: "zahl", einheit: "%", label: t("portal.cards.eigene.form_afa_satz", "AfA-Satz (%)") },
          ],
          // AfA-Vorschlag nach Baujahr wie im Dialog, nie automatisch uebernommen.
          zusatz: (werte, setze) => {
            const bj = parseInt(werte.baujahr ?? "", 10);
            if (!Number.isFinite(bj) || bj <= 0) return null;
            const vorschlag = linearerAfaSatz(bj);
            return (
              <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 w-full whitespace-normal text-left text-[12px] leading-snug px-2 py-1.5"
                onClick={() => setze("afa_satz_prozent", alsText(vorschlag.satz))}>
                {t("portal.cards.eigene.form_afa_vorschlag", "Vorschlag übernehmen: {{satz}} % nach {{paragraf}}", { satz: zahlFormat(vorschlag.satz), paragraf: vorschlag.paragraf })}
              </Button>
            );
          },
        };
      case "hausgeld_nicht_umlage":
        return {
          titel: t("portal.cards.steuer_eigen.stift_titel_hausgeld", "Hausgeld nicht umlagefähig"),
          felder: [{ key: "hausgeld_nicht_umlage_monat", art: "zahl", einheit: "€", label: t("portal.cards.eigene.form_hausgeld_nicht_umlage", "Hausgeld nicht umlagefähig (€/Monat)"), hilfe: t("portal.cards.eigene.form_hausgeld_nicht_umlage_hint", "Ohne Rücklagenzuführung, die ist steuerlich nicht abziehbar.") }],
        };
      case "grundsteuer":
        return {
          titel: t("portal.cards.steuer_eigen.stift_titel_grundsteuer", "Grundsteuer"),
          felder: [{ key: "grundsteuer_jahr", art: "zahl", einheit: "€", label: t("portal.cards.eigene.form_grundsteuer", "Grundsteuer p. a. (€)") }],
        };
      case "versicherung":
        return {
          titel: t("portal.cards.steuer_eigen.stift_titel_versicherung", "Versicherung"),
          felder: [{ key: "versicherung_jahr", art: "zahl", einheit: "€", label: t("portal.cards.eigene.form_versicherung", "Versicherung p. a. (€)"), hilfe: t("portal.cards.eigene.form_versicherung_hint", "Gebäude- und Haftpflichtversicherung pro Jahr.") }],
        };
      case "verwaltung":
        return {
          titel: t("portal.cards.steuer_eigen.stift_titel_verwaltung", "Verwaltungskosten"),
          felder: [{ key: "verwaltungskosten_jahr", art: "zahl", einheit: "€", label: t("portal.cards.eigene.form_verwaltungskosten", "Verwaltungskosten p. a. (€)"), hilfe: t("portal.cards.eigene.form_verwaltungskosten_hint", "Verwaltervergütung, Kontoführung und Ähnliches.") }],
        };
      default:
        return null;
    }
  };

  // Zeilen ohne Stift: Sie rechnen aus Werten, die an anderer Stelle gepflegt
  // werden. Statt eines Stifts steht ein Hinweis, wo das geht.
  const zeilenHinweis = (schluessel?: SteuerPostenSchluessel): { text: string; onClick: () => void } | null => {
    if ((schluessel === "miete" || schluessel === "schuldzinsen") && onBearbeiten) {
      return {
        text: schluessel === "miete"
          ? t("portal.cards.steuer_eigen.hinweis_miete", "Aus der Kaltmiete, zu pflegen unter Bearbeiten")
          : t("portal.cards.steuer_eigen.hinweis_schuldzinsen", "Aus Darlehen und Zinssatz, zu pflegen unter Bearbeiten"),
        onClick: onBearbeiten,
      };
    }
    if (schluessel === "erhaltung" && onBelegeZeigen) {
      return { text: t("portal.cards.steuer_eigen.hinweis_erhaltung", "Summe der Belege, Beleg unter Dokumente erfassen"), onClick: onBelegeZeigen };
    }
    return null;
  };

  // Gespeicherte Werte fuer die Stifte, gleiche Quelle wie der Dialog (openEdit).
  const stiftStartwerte: StiftWerte = {
    gebaeude_anteil_prozent: alsText(werte.gebaeudeAnteilProzent),
    afa_satz_prozent: alsText(anlageV.afaSatzProzent),
    grundsteuer_jahr: alsText(anlageV.grundsteuerJahr),
    versicherung_jahr: alsText(anlageV.versicherungJahr),
    verwaltungskosten_jahr: alsText(anlageV.verwaltungskostenJahr),
    hausgeld_nicht_umlage_monat: alsText(werte.hausgeldNichtUmlageMonat),
    umlagen_monat: alsText(anlageV.umlagenMonat),
    miteigentumsanteil_prozent: alsText(anlageV.miteigentumsanteilProzent),
    baujahr: inv.baujahr ? String(inv.baujahr) : "",
    erste_miete: m.erste_miete || "",
  };
  const nurFelder = (felder: StiftFeld[]): StiftWerte =>
    Object.fromEntries(felder.map(f => [f.key, stiftStartwerte[f.key] ?? ""]));
  // Platzhalter in Zeilen ohne Stift, damit die Betraege buendig bleiben.
  const stiftPlatz = onFelderSpeichern ? <span className="w-7 shrink-0" aria-hidden /> : null;

  // Anlage-V-Aufstellung: gleiche Datenbasis wie die Tabelle oben, gerechnet
  // ausschliesslich in eigeneInvestmentBerechnungen (nichts doppelt).
  const baueAufstellung = () =>
    baueAnlageVAufstellung(inv, {
      jahr: steuerjahr,
      herkunft: "eigen",
      bodenwertAnteil,
      hausgeldNichtUmlagefaehigProzent: hausgeldP,
      sonderAfA7b: sonderAfa,
    });

  const [pdfLaeuft, setPdfLaeuft] = useState(false);
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
  const [sendenAufstellung, setSendenAufstellung] = useState<AnlageVAufstellung | null>(null);
  const teilePerMail = () => setSendenAufstellung(baueAufstellung());

  const exportCSV = () => {
    const lines = steuerCsvZeilen({ bezeichnung: inv.bezeichnung, steuerjahr, ergebnis, sprache, t });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("portal.cards.steuer_eigen.csv.dateiname")}_${inv.bezeichnung.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" />{t("portal.cards.steuer_eigen.title")}</h3>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground" htmlFor="steuerjahr-select">{t("portal.cards.steuer_eigen.jahr_label", "Steuerjahr")}</Label>
          <Select value={String(steuerjahr)} onValueChange={v => setSteuerjahr(Number(v))}>
            <SelectTrigger id="steuerjahr-select" className="h-8 w-[92px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {jahresAuswahl.map(j => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5"><Download className="h-3.5 w-3.5" />{t("portal.cards.steuer_eigen.export_csv")}</Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={pdfLaeuft} className="gap-1.5"><FileText className="h-3.5 w-3.5" />{t("portal.cards.steuer_eigen.export_pdf", "Anlage-V-Aufstellung (PDF)")}</Button>
          <Button size="sm" variant="ghost" onClick={teilePerMail} disabled={pdfLaeuft} className="gap-1.5"><Mail className="h-3.5 w-3.5" />{t("portal.cards.steuer_eigen.mail_teilen", "Per E-Mail teilen")}</Button>
        </div>
      </div>

      <AnlageVSendenDialog
        aufstellung={sendenAufstellung}
        open={sendenAufstellung != null}
        onOpenChange={(o) => { if (!o) setSendenAufstellung(null); }}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="space-y-1"><Label className="text-xs" htmlFor="cockpit-bodenwert">{t("portal.cards.steuer_eigen.boden_anteil")}</Label>
          <Input id="cockpit-bodenwert" type="number" min={0} max={100} step="any" value={bodenText} placeholder={t("portal.cards.steuer_eigen.fehlt_placeholder", "Angabe fehlt")}
            onChange={e => setBodenText(e.target.value)} onBlur={() => speichereBoden()} className="h-8"
            aria-invalid={bodenFehler} disabled={!onFelderSpeichern} />
          <p className={`text-xs leading-snug ${bodenFehler ? "text-destructive" : "text-muted-foreground"}`}>
            {bodenFehler
              ? t("portal.cards.steuer_eigen.prozent_ungueltig", "Bitte einen Wert zwischen 0 und 100 eintragen.")
              : werte.gebaeudeAnteilProzent != null
                ? t("portal.cards.steuer_eigen.boden_gleich_gebaeude", "Entspricht einem Gebäudeanteil von {{wert}} %. Derselbe Wert steht unter Bearbeiten in den Steuerangaben.", { wert: zahlFormat(werte.gebaeudeAnteilProzent) })
                : t("portal.cards.steuer_eigen.boden_hint", "Ohne Angabe wird keine AfA berechnet.")}
          </p></div>
        <div className="space-y-1"><Label className="text-xs" htmlFor="cockpit-hausgeld">{t("portal.cards.steuer_eigen.hausgeld_nicht_umlage")}</Label>
          <Input id="cockpit-hausgeld" type="number" min={0} max={100} step="any" value={hausgeldText} placeholder={t("portal.cards.steuer_eigen.fehlt_placeholder", "Angabe fehlt")}
            onChange={e => setHausgeldText(e.target.value)} onBlur={() => speichereHausgeld()} className="h-8"
            aria-invalid={hausgeldFehler} disabled={!onFelderSpeichern || !hausgeldUmrechenbar} />
          <p className={`text-xs leading-snug ${hausgeldFehler ? "text-destructive" : "text-muted-foreground"}`}>
            {hausgeldFehler
              ? t("portal.cards.steuer_eigen.prozent_ungueltig", "Bitte einen Wert zwischen 0 und 100 eintragen.")
              : !hausgeldUmrechenbar
                ? t("portal.cards.steuer_eigen.hausgeld_ohne_gesamt", "Ohne Hausgeld je Monat lässt sich der Anteil nicht in Euro umrechnen. Trag das Hausgeld unter Bearbeiten ein.")
                : werte.hausgeldNichtUmlageMonat != null
                  ? t("portal.cards.steuer_eigen.hausgeld_gleich_euro", "Entspricht {{euro}} € je Monat von {{gesamt}} € Hausgeld. Derselbe Wert steht unter Bearbeiten in den Steuerangaben.", { euro: zahlFormat(werte.hausgeldNichtUmlageMonat), gesamt: zahlFormat(hausgeldGesamt) })
                  : t("portal.cards.steuer_eigen.hausgeld_hint", "Nur der Verwaltungsanteil ist absetzbar. Die Zuführung zur Instandhaltungsrücklage zählt nicht zu den Werbungskosten. Ohne Angabe wird der Posten nicht angesetzt.")}
          </p></div>
        <div className="space-y-1"><Label className="text-xs" htmlFor="cockpit-grenzsteuersatz">{t("portal.cards.steuer_eigen.grenzsteuersatz")}</Label>
          <Input id="cockpit-grenzsteuersatz" type="number" value={grenzsteuersatz ?? ""} placeholder={t("portal.cards.steuer_eigen.fehlt_placeholder", "Angabe fehlt")}
            onChange={e => setGrenzsteuersatz(e.target.value === "" ? null : Number(e.target.value))} onBlur={() => save()} className="h-8" />
          <p className="text-xs text-muted-foreground leading-snug">{t("portal.cards.steuer_eigen.satz_hint", "Ohne Angabe (oder Selbstauskunft) wird kein Steuereffekt berechnet.")}</p></div>
        <div className="flex items-center gap-2 pt-5">
          <Checkbox checked={sonderAfa} onCheckedChange={v => { setSonderAfa(!!v); save({ sonderAfA7b: !!v }); }} id="sonderafa" />
          <Label htmlFor="sonderafa" className="text-xs cursor-pointer">{t("portal.cards.steuer_eigen.sonder_afa")}</Label>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        {ergebnis.posten.map((p, i) => {
          const aufbau = onFelderSpeichern ? stiftAufbau(p.schluessel) : null;
          const hinweis = zeilenHinweis(p.schluessel);
          return (
            <div key={i} data-posten={p.schluessel} className={`flex justify-between items-center gap-3 px-3 py-2 text-sm ${i % 2 ? "bg-muted/30" : ""}`}>
              <div className="min-w-0">
                <span className="text-muted-foreground">{postenText(p)}</span>
                {hinweis && (
                  <button type="button" onClick={hinweis.onClick} className="block text-left text-[11px] text-primary underline-offset-4 hover:underline">
                    {hinweis.text}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {p.fehlt ? (
                  <span className="text-xs text-muted-foreground text-right max-w-[9rem] sm:max-w-none">
                    {t("portal.cards.steuer_eigen.posten_fehlt", "Angabe fehlt, nicht gerechnet")}
                  </span>
                ) : (
                  <span className={`font-medium tabular-nums ${p.typ === "ausgabe" ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
                    {p.typ === "ausgabe" ? "−" : "+"} {fmt(p.betrag)}
                  </span>
                )}
                {aufbau && onFelderSpeichern ? (
                  <CockpitFeldStift
                    titel={aufbau.titel}
                    felder={aufbau.felder}
                    startwerte={nurFelder(aufbau.felder)}
                    hinweis={aufbau.hinweis}
                    zusatz={aufbau.zusatz}
                    onSpeichern={onFelderSpeichern}
                  />
                ) : stiftPlatz}
              </div>
            </div>
          );
        })}
        <div className="flex justify-between items-center gap-3 px-3 py-2.5 bg-muted/60 text-sm font-semibold">
          <span>{t("portal.cards.steuer_eigen.werbungskosten")}</span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="tabular-nums text-destructive">−{fmt(ergebnis.werbungskostenSumme)}</span>
            {stiftPlatz}
          </span>
        </div>
        <div className="flex justify-between items-center gap-3 px-3 py-2.5 bg-primary/5 text-sm font-bold border-t">
          <span>{t("portal.cards.steuer_eigen.ueberschuss")}</span>
          <span className="flex items-center gap-1 shrink-0">
            <span className={`tabular-nums ${ergebnis.ueberschussVerlust < 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {fmt(ergebnis.ueberschussVerlust)}
            </span>
            {stiftPlatz}
          </span>
        </div>
        <div className="flex justify-between items-center gap-2 px-3 py-2.5 bg-[hsl(var(--success))]/10 text-sm font-bold">
          <span className="flex items-center gap-1.5 flex-wrap">
            {t("portal.cards.steuer_eigen.tax_effect", { rate: effektSatzText })}
            {!mieteFehlt && !ergebnis.steuerEffektFehlt && !zvEBelastbar && (
              <Badge variant="secondary" className="font-normal">
                {t("portal.cards.steuer_eigen.estimate_badge", "Schätzwert")}
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {mieteFehlt ? (
              <span className="tabular-nums text-muted-foreground font-normal text-xs text-right">
                {t("portal.cards.steuer_eigen.rent_missing", "Bitte Mieteinnahmen erfassen")}
              </span>
            ) : ergebnis.steuerEffektFehlt ? (
              <span className="tabular-nums text-muted-foreground font-normal text-xs text-right">
                {t("portal.cards.steuer_eigen.tax_missing", "Angabe Steuersatz fehlt")}
              </span>
            ) : (
              <span className={`tabular-nums ${ergebnis.steuerEffekt < 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {ergebnis.steuerEffekt < 0 ? t("portal.cards.steuer_eigen.savings") : t("portal.cards.steuer_eigen.burden")}{fmt(Math.abs(ergebnis.steuerEffekt))}
              </span>
            )}
            {stiftPlatz}
          </span>
        </div>
      </div>

      {ergebnis.miteigentumsanteilP !== 100 && (
        <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {t("portal.cards.steuer_eigen.miteigentum_hinweis", "Alle Posten sind anteilig mit {{wert}} % Miteigentumsanteil gerechnet.", { wert: ergebnis.miteigentumsanteilP.toLocaleString(portalLocale(), { maximumFractionDigits: 4 }) })}
            {onFelderSpeichern && (
              <>
                {" "}
                <CockpitFeldStift
                  titel={t("portal.cards.steuer_eigen.stift_titel_miteigentum", "Miteigentumsanteil")}
                  felder={[{ key: "miteigentumsanteil_prozent", art: "zahl", einheit: "%", label: t("portal.cards.eigene.form_miteigentum", "Miteigentumsanteil (%)"), hilfe: t("portal.cards.eigene.form_miteigentum_hint", "Ohne Angabe wird mit 100 % gerechnet.") }]}
                  startwerte={{ miteigentumsanteil_prozent: stiftStartwerte.miteigentumsanteil_prozent }}
                  onSpeichern={onFelderSpeichern}
                  linkText={t("portal.cards.steuer_eigen.miteigentum_aendern", "Anteil ändern")}
                />
              </>
            )}
          </span>
        </p>
      )}

      {!mieteFehlt && ergebnis.vermieteteMonateAngenommen && (
        <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {onFelderSpeichern ? (
            <span>
              {t("portal.cards.steuer_eigen.monate_angenommen_kurz", "Erste Mieteinnahme ist nicht erfasst, es werden 12 vermietete Monate angesetzt.")}{" "}
              <CockpitFeldStift
                titel={t("portal.cards.eigene.form_ms_erste_miete", "Erste Mieteinnahme")}
                felder={[{ key: "erste_miete", art: "datum", label: t("portal.cards.eigene.form_ms_erste_miete", "Erste Mieteinnahme"), hilfe: t("portal.cards.steuer_eigen.erste_miete_hilfe", "Ab diesem Monat zählen die Mieteinnahmen im Steuerjahr. Das Datum steht auch unter Meilensteine.") }]}
                startwerte={{ erste_miete: stiftStartwerte.erste_miete }}
                onSpeichern={onFelderSpeichern}
                linkText={t("portal.cards.steuer_eigen.erste_miete_eintragen", "Datum eintragen")}
              />
            </span>
          ) : (
            <span>{t("portal.cards.steuer_eigen.monate_angenommen", "Erste Mieteinnahme ist nicht erfasst, es werden 12 vermietete Monate angesetzt. Das Datum lässt sich im Investment unter Meilensteine pflegen.")}</span>
          )}
        </p>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("portal.cards.steuer_eigen.erhaltung_belege", "Erhaltungsaufwand {{jahr}}: Summe erfasster Belege mit Betrag ({{count}}). Belege ohne Betrag zählen nicht.", { jahr: steuerjahr, count: erhaltung.anzahl })}
      </p>

      {ergebnis.fehlendeAngaben.length > 0 && (
        <div className="mt-2 flex items-start gap-2 p-2.5 rounded-md bg-muted/40 text-[11px] text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {ergebnis.fehlendeAngaben.length === 1
              ? t("portal.cards.steuer_eigen.missing_intro_one", "Ergebnis unvollständig, eine Angabe fehlt:")
              : t("portal.cards.steuer_eigen.missing_intro_other", "Ergebnis unvollständig, {{count}} Angaben fehlen:", { count: ergebnis.fehlendeAngaben.length })}{" "}
            {ergebnis.fehlendeAngaben.map((f) => fehlendeAngabeAnzeige(f, sprache, t)).join("; ")}.
          </span>
        </div>
      )}

      {ergebnis.sonderAfaHinweis && (
        <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{fehlendeAngabeAnzeige(ergebnis.sonderAfaHinweis, sprache, t)}</span>
        </p>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        {zvEBelastbar && zvESA?.angegeben
          ? t("portal.cards.steuer_eigen.method_hint_zve_angegeben", "Steuereffekt nach der Differenzmethode: Einkommensteuer mit und ohne dieses Objekt (§ 32a EStG). Dein zu versteuerndes Einkommen stammt aus deiner Selbstauskunft. Der effektive Satz liegt deshalb meist unter deinem Grenzsteuersatz.")
          : zvEBelastbar
          ? t("portal.cards.steuer_eigen.method_hint_zve", "Steuereffekt nach der Differenzmethode: Einkommensteuer mit und ohne dieses Objekt (§ 32a EStG). Dein zu versteuerndes Einkommen ist aus der Selbstauskunft abgeleitet (Brutto mal 0,7). Der effektive Satz liegt deshalb meist unter deinem Grenzsteuersatz.")
          : ergebnis.steuerEffektFehlt
            ? t("portal.cards.steuer_eigen.method_hint_missing", "Ohne Grenzsteuersatz oder Selbstauskunft wird kein Steuereffekt berechnet, ein Pauschalsatz wird nicht angesetzt.")
            : t("portal.cards.steuer_eigen.method_hint_flat", "Der Steuereffekt ist flach mit deinem eingetragenen Grenzsteuersatz gerechnet, dein zu versteuerndes Einkommen ist nicht bekannt. Deshalb nur ein Schätzwert.")}
      </p>

      <div className="mt-3 flex items-start gap-2 p-2.5 rounded-md bg-muted/40 text-[11px] text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span><Trans i18nKey="portal.cards.steuer_eigen.disclaimer" components={{ strong: <strong /> }} /></span>
      </div>
    </Card>
  );
}

/*
 * Die Posten und Hinweise der Steuerrechnung entstehen deutsch in
 * `eigeneInvestmentBerechnungen.ts`, denn dieselben Texte stehen in der
 * Anlage-V-Aufstellung fuer den Steuerberater, und die bleibt deutsch
 * (Plan Kundensprache, Entscheidung 8). Fuer die englische Anzeige und den
 * englischen CSV-Export werden sie hier aus dem Schluessel des Postens neu
 * gebaut. Auf Deutsch bleibt der Text aus der Rechnung unveraendert.
 */

/** Anzeigetext eines Postens in der Portalsprache. */
export function postenAnzeige(p: SteuerPosten, erg: SteuerErgebnis, sprache: FormatSprache, t: TFunction): string {
  if (sprache === "de" || !p.schluessel) return p.label;
  const monate = erg.vermieteteMonate;
  switch (p.schluessel) {
    case "miete":
      return t("portal.cards.steuer_eigen.posten.miete", { monate });
    case "umlagen":
      return p.fehlt ? t("portal.cards.steuer_eigen.posten.umlagen_fehlt") : t("portal.cards.steuer_eigen.posten.umlagen", { monate });
    case "schuldzinsen":
      return t("portal.cards.steuer_eigen.posten.schuldzinsen");
    case "afa":
      return p.fehlt
        ? t("portal.cards.steuer_eigen.posten.afa_fehlt")
        : t("portal.cards.steuer_eigen.posten.afa", {
            satz: erg.afaSatzP.toLocaleString(portalLocale(), { maximumFractionDigits: 2 }),
            basis: euroText(Math.round(erg.afaBemessungsgrundlage), sprache, 0),
            paragraf: erg.afaParagraf || "§ 7 Abs. 4 EStG",
            anteilig: erg.afaMonate < 12 ? t("portal.cards.steuer_eigen.posten.afa_anteilig", { monate: erg.afaMonate }) : "",
          });
    case "sonderafa":
      return t("portal.cards.steuer_eigen.posten.sonderafa", { satz: SONDER_7B_SATZ });
    case "hausgeld_nicht_umlage":
      return p.fehlt ? t("portal.cards.steuer_eigen.posten.hausgeld_nicht_umlage_fehlt") : t("portal.cards.steuer_eigen.posten.hausgeld_nicht_umlage");
    case "hausgeld_umlagefaehig":
      return p.fehlt ? t("portal.cards.steuer_eigen.posten.hausgeld_umlagefaehig_fehlt") : t("portal.cards.steuer_eigen.posten.hausgeld_umlagefaehig");
    case "grundsteuer":
      return p.fehlt ? t("portal.cards.steuer_eigen.posten.grundsteuer_fehlt") : t("portal.cards.steuer_eigen.posten.grundsteuer");
    case "versicherung":
      return p.fehlt ? t("portal.cards.steuer_eigen.posten.versicherung_fehlt") : t("portal.cards.steuer_eigen.posten.versicherung");
    case "verwaltung":
      return p.fehlt ? t("portal.cards.steuer_eigen.posten.verwaltung_fehlt") : t("portal.cards.steuer_eigen.posten.verwaltung");
    case "erhaltung":
      return t("portal.cards.steuer_eigen.posten.erhaltung");
    default:
      return p.label;
  }
}

/**
 * Fehlende Angaben und Hinweise zur Sonder-AfA in der Portalsprache.
 * Die Rechnung liefert feste deutsche Saetze; bekannte werden fuer die
 * englische Anzeige ersetzt, unbekannte bleiben stehen, wie sie sind.
 */
export function fehlendeAngabeAnzeige(text: string, sprache: FormatSprache, t: TFunction): string {
  if (sprache === "de") return text;
  const bekannt: Record<string, string> = {
    "Vereinnahmte Umlagen fehlen (Nebenkosten-Vorauszahlungen des Mieters eintragen), Einnahme nicht angesetzt":
      t("portal.cards.steuer_eigen.fehlt.umlagen"),
    "Kaufnebenkosten nicht erfasst, die AfA-Grundlage enthält nur den Kaufpreis":
      t("portal.cards.steuer_eigen.fehlt.nebenkosten"),
    "Gebäudeanteil fehlt (in den Steuerangaben oder als Bodenwert-Anteil eintragen), AfA nicht berechnet":
      t("portal.cards.steuer_eigen.fehlt.gebaeudeanteil"),
    "Baujahr und AfA-Satz fehlen, der Satz nach § 7 Abs. 4 EStG ist nicht bestimmbar, AfA nicht berechnet":
      t("portal.cards.steuer_eigen.fehlt.afa_satz"),
    "Verwaltungsanteil des Hausgelds fehlt (Euro je Monat in den Steuerangaben oder Prozentsatz eintragen), Hausgeld-Posten nicht angesetzt":
      t("portal.cards.steuer_eigen.fehlt.hausgeld"),
    "Grundsteuer fehlt, Posten nicht angesetzt": t("portal.cards.steuer_eigen.fehlt.grundsteuer"),
    "Versicherung fehlt, Posten nicht angesetzt": t("portal.cards.steuer_eigen.fehlt.versicherung"),
    "Verwaltungskosten fehlen, Posten nicht angesetzt": t("portal.cards.steuer_eigen.fehlt.verwaltung"),
    "Steuersatz fehlt (Grenzsteuersatz eintragen oder Selbstauskunft ausfüllen), Steuereffekt nicht berechnet":
      t("portal.cards.steuer_eigen.fehlt.steuersatz"),
    "Sonder-AfA nach § 7b EStG nicht angesetzt: Die AfA-Grundlage ist unvollständig (Gebäudeanteil oder Baujahr fehlt).":
      t("portal.cards.steuer_eigen.fehlt.sonderafa_grundlage"),
    "Sonder-AfA nach § 7b EStG nicht angesetzt: Ohne Kaufdatum oder Baujahr laesst sich der Vierjahreszeitraum nicht pruefen.":
      t("portal.cards.steuer_eigen.fehlt.sonderafa_zeitraum"),
    [`Sonder-AfA nach § 7b EStG nicht angesetzt: Der Foerderzeitraum von ${SONDER_7B_JAHRE} Jahren ist abgelaufen.`]:
      t("portal.cards.steuer_eigen.fehlt.sonderafa_abgelaufen", { jahre: SONDER_7B_JAHRE }),
    "Sonder-AfA nach § 7b EStG nicht angesetzt: Anschaffung liegt nach dem Betrachtungsjahr.":
      t("portal.cards.steuer_eigen.fehlt.sonderafa_spaeter"),
  };
  return bekannt[text] ?? text;
}

/**
 * Zeilen des CSV-Exports. Deutsch exakt wie bisher (Semikolon, Dezimalkomma),
 * Englisch mit englischen Kopfzeilen und Dezimalpunkt. Das Trennzeichen
 * bleibt in beiden Sprachen das Semikolon. Die Betraege kommen aus der
 * Rechnung, nie aus einem formatierten Text.
 */
export function steuerCsvZeilen({ bezeichnung, steuerjahr, ergebnis, sprache, t }: {
  bezeichnung: string;
  steuerjahr: number;
  ergebnis: SteuerErgebnis;
  sprache: FormatSprache;
  t: TFunction;
}): string[] {
  const zahl = (v: number) => (sprache === "en" ? v.toFixed(2) : v.toFixed(2).replace(".", ","));
  const satz = sprache === "en" ? ergebnis.effektiverSatzP.toFixed(1) : ergebnis.effektiverSatzP.toFixed(1).replace(".", ",");
  const typ = (p: SteuerPosten) =>
    p.typ === "einnahme" ? t("portal.cards.steuer_eigen.csv.typ_einnahme") : t("portal.cards.steuer_eigen.csv.typ_ausgabe");
  return [
    `${t("portal.cards.steuer_eigen.csv.titel")};${bezeichnung}`,
    `${t("portal.cards.steuer_eigen.csv.steuerjahr")};${steuerjahr}`,
    t("portal.cards.steuer_eigen.csv.kopfzeile"),
    ...ergebnis.posten.map((p) => `${postenAnzeige(p, ergebnis, sprache, t)};${zahl(p.betrag)};${typ(p)}`),
    `${t("portal.cards.steuer_eigen.csv.werbungskosten")};${zahl(ergebnis.werbungskostenSumme)};${t("portal.cards.steuer_eigen.csv.typ_summe")}`,
    `${t("portal.cards.steuer_eigen.csv.ergebnis")};${zahl(ergebnis.ueberschussVerlust)};${t("portal.cards.steuer_eigen.csv.typ_ergebnis")}`,
    `${t("portal.cards.steuer_eigen.csv.steuereffekt", { satz })};${zahl(ergebnis.steuerEffekt)};${t("portal.cards.steuer_eigen.csv.typ_steuer")}`,
  ];
}
