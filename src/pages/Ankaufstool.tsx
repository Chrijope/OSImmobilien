import { useMemo, useState } from "react";
import { FileDown, RotateCcw, Save, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import {
  SectionCard, SectionCardContent, SectionCardDescription, SectionCardHeader, SectionCardTitle,
} from "@/components/ui/section-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ANKAUF_STANDARD, ANKAUF_VERSIONEN_SCHLUESSEL, OBJEKT_LEER, anteilAmErloes, berechneAnkauf, eingabenAusVersion,
  objektAusVersion, versionSpeichern, type AnkaufEingaben, type AnkaufErgebnis, type AnkaufObjekt, type AnkaufVersion,
} from "@/lib/ankaufstool";
import { getUserSetting, setUserSettingSicher } from "@/lib/userSettingsCache";
import { useLiveVersion } from "@/hooks/useLiveData";
import { ANKAUF_HINWEIS, buildAnkaufstoolPdf, eur, prozent, zahl } from "@/lib/ankaufstoolPdf";

/*
 * Seite /ankaufstool: der Bauträger-Kalkulator aus Ankaufstool.xlsx.
 * Gerechnet wird ausschließlich in `src/lib/ankaufstool.ts`. Rechnungen lassen
 * sich als Versionen speichern; sie liegen je Nutzer in `user_settings`
 * (Schlüssel `ankaufstool_versionen`), sichtbar nur für die Person selbst.
 */

type Feld = { key: keyof AnkaufEingaben; label: string; einheit: "€" | "%" | "m²" | "€/m²" | "€/Jahr" | "Monate" | "Stück"; hinweis?: string };
type Zeile = { label: string; betrag: (r: AnkaufErgebnis, e: AnkaufEingaben) => number; summe?: boolean; info?: boolean };
type Abschnitt = { titel: string; beschreibung?: string; felder: Feld[]; zeilen: Zeile[] };

/* Abschnitt „Objektdaten aus Exposé“: in der Reihenfolge, in der ein Exposé die Angaben meist bringt. */
type TextFeld = { key: keyof AnkaufObjekt; label: string; platzhalter: string };
const EXPOSE_TEXTE: TextFeld[] = [
  { key: "objektart", label: "Objektart", platzhalter: "z. B. Mehrfamilienhaus, Wohn- und Geschäftshaus" },
  { key: "baujahr", label: "Baujahr", platzhalter: "z. B. 1988" },
  { key: "zustand", label: "Zustand / Modernisierung", platzhalter: "z. B. modernisiert, Dach und Fenster 2011" },
  { key: "vermietung", label: "Vermietung / Leerstand", platzhalter: "z. B. voll vermietet, 2 WE leer" },
  { key: "energie", label: "Energie / Heizung", platzhalter: "z. B. Gas-Zentralheizung, Klasse C" },
  { key: "makler", label: "Makler / Quelle", platzhalter: "z. B. Musterimmobilien, Kennung 123" },
];
const EXPOSE_GRUPPEN: { titel: string; felder: Feld[] }[] = [
  {
    titel: "Flächen",
    felder: [
      { key: "wohnflaeche", label: "Wohnfläche", einheit: "m²" },
      { key: "gewerbeflaeche", label: "Gewerbefläche", einheit: "m²", hinweis: "wird wie Wohnen aufgeteilt und je m² verkauft" },
      { key: "gesamtflaecheManuell", label: "Gesamtfläche laut Exposé", einheit: "m²", hinweis: "0 = Wohn- + Gewerbefläche; nur für Kaufpreis je m²" },
      { key: "grundstuecksflaeche", label: "Grundstücksfläche", einheit: "m²" },
    ],
  },
  {
    titel: "Einheiten",
    felder: [
      { key: "wohneinheiten", label: "Wohneinheiten", einheit: "Stück" },
      { key: "gewerbeeinheiten", label: "Gewerbeeinheiten", einheit: "Stück" },
      { key: "stellplaetze", label: "Stellplätze / Garagen", einheit: "Stück" },
    ],
  },
  {
    titel: "Ist-Mieten (Nettokalt p. a.)",
    felder: [
      { key: "istMieteWohnenJahr", label: "Wohnen", einheit: "€/Jahr", hinweis: "nur vermietete Einheiten, Leerstand = 0" },
      { key: "istMieteGewerbeJahr", label: "Gewerbe", einheit: "€/Jahr" },
      { key: "istMieteStellplaetzeJahr", label: "Stellplätze", einheit: "€/Jahr" },
      { key: "bewirtschaftungJahr", label: "Nicht umlagefähige Kosten", einheit: "€/Jahr", hinweis: "Verwaltung, Instandhaltung, Leerstandskosten" },
    ],
  },
  {
    titel: "Kosten",
    felder: [
      { key: "kaufpreis", label: "Kaufpreis", einheit: "€" },
      { key: "maklerEinkauf", label: "Käuferprovision inkl. MwSt.", einheit: "%", hinweis: "0 eintragen, wenn provisionsfrei" },
    ],
  },
];

const ABSCHNITTE: Abschnitt[] = [
  {
    titel: "Verkaufserlös",
    felder: [
      { key: "laufzeitMonate", label: "Projektlaufzeit", einheit: "Monate", hinweis: "Ankauf bis letzter Verkauf" },
      { key: "abgabepreisProQm", label: "Abgabepreis Wohnen", einheit: "€/m²", hinweis: "Durchschnitt über alle Wohnungen" },
      { key: "abgabepreisGewerbeProQm", label: "Abgabepreis Gewerbe", einheit: "€/m²", hinweis: "Durchschnitt über alle Gewerbeeinheiten" },
      { key: "abgabepreisStellplatz", label: "Abgabepreis je Stellplatz", einheit: "€" },
    ],
    zeilen: [
      { label: "Erlös Wohnen", betrag: (r) => r.erloesWohnen },
      { label: "Erlös Gewerbe", betrag: (r) => r.erloesGewerbe },
      { label: "Erlös Stellplätze", betrag: (r) => r.erloesStellplaetze },
      { label: "Verkaufserlös gesamt", betrag: (r) => r.verkaufserloes, summe: true },
      { label: "Ø Abgabepreis je Einheit (ohne Stellplätze)", betrag: (r) => r.abgabepreisJeWohnung, info: true },
    ],
  },
  {
    titel: "1. Ankauf",
    beschreibung: "Kaufpreis und Käuferprovision stehen oben bei den Objektdaten.",
    felder: [
      { key: "grunderwerbsteuer", label: "Grunderwerbsteuer", einheit: "%", hinweis: "BW 5,0 % · Bayern 3,5 % · Brandenburg 6,5 % · je Bundesland prüfen" },
      { key: "notarAnkauf", label: "Notar & Grundbuch Ankauf", einheit: "%", hinweis: "Faustwert ca. 1,5–2 %" },
    ],
    zeilen: [
      { label: "Kaufpreis", betrag: (_r, e) => e.kaufpreis },
      { label: "Grunderwerbsteuer", betrag: (r) => r.grunderwerbsteuer },
      { label: "Notar & Grundbuch", betrag: (r) => r.notarAnkauf },
      { label: "Maklerprovision", betrag: (r) => r.maklerEinkauf },
      { label: "Summe Ankauf", betrag: (r) => r.summeAnkauf, summe: true },
    ],
  },
  {
    titel: "2. Sanierung & Aufteilung",
    felder: [
      { key: "sanierungProQm", label: "Sanierung Wohnungen", einheit: "€/m²", hinweis: "je m² Wohnfläche" },
      { key: "sanierungGewerbeProQm", label: "Sanierung Gewerbe", einheit: "€/m²", hinweis: "je m² Gewerbefläche" },
      { key: "sanierungGemeinschaft", label: "Sanierung Gemeinschaftseigentum pauschal", einheit: "€", hinweis: "Dach, Fassade, Treppenhaus, Heizung …" },
      { key: "pufferSanierung", label: "Puffer Unvorhergesehenes", einheit: "%", hinweis: "der Sanierung" },
      { key: "aufteilung", label: "Aufteilung", einheit: "€", hinweis: "Teilungserklärung, Abgeschlossenheit, Notar" },
      { key: "gutachtenSonstiges", label: "Gutachten / Planung / Sonstiges", einheit: "€" },
    ],
    zeilen: [
      { label: "Sanierung Wohnungen", betrag: (r) => r.sanierungWohnungen },
      { label: "Sanierung Gewerbe", betrag: (r) => r.sanierungGewerbe },
      { label: "Gemeinschaftseigentum", betrag: (_r, e) => e.sanierungGemeinschaft },
      { label: "Puffer", betrag: (r) => r.pufferSanierung },
      { label: "Aufteilung", betrag: (_r, e) => e.aufteilung },
      { label: "Gutachten / Sonstiges", betrag: (_r, e) => e.gutachtenSonstiges },
      { label: "Summe Sanierung & Aufteilung", betrag: (r) => r.summeSanierung, summe: true },
    ],
  },
  {
    titel: "3. Vertrieb & Mietsubvention",
    felder: [
      { key: "vertriebsprovision", label: "Vertriebsprovision", einheit: "%", hinweis: "vom Abgabepreis, Gesamt-Courtage an den Vertrieb" },
      { key: "garantiemieteProQm", label: "Garantiemiete an Käufer", einheit: "€/m²", hinweis: "nur Wohnfläche" },
      { key: "marktmieteProQm", label: "Tatsächliche Marktmiete", einheit: "€/m²" },
      { key: "subventionMonate", label: "Laufzeit Mietsubvention", einheit: "Monate" },
      { key: "marketing", label: "Marketing / Exposé / Fotos", einheit: "€" },
    ],
    zeilen: [
      { label: "Vertriebsprovision", betrag: (r) => r.vertriebsprovision },
      { label: "Mietsubvention gesamt", betrag: (r) => r.mietsubvention },
      { label: "Marketing", betrag: (_r, e) => e.marketing },
      { label: "Summe Vertrieb & Mietsubvention", betrag: (r) => r.summeVertrieb, summe: true },
    ],
  },
  {
    titel: "4. Finanzierung",
    felder: [
      { key: "fremdkapitalquote", label: "Fremdkapitalquote", einheit: "%", hinweis: "von Ankauf + Sanierung" },
      { key: "zinssatz", label: "Zinssatz p. a.", einheit: "%" },
      { key: "inanspruchnahme", label: "Ø Inanspruchnahme des Darlehens", einheit: "%", hinweis: "Abruf und Rückführung aus Verkäufen" },
      { key: "bankgebuehren", label: "Bankgebühren / Bereitstellungszinsen", einheit: "€", hinweis: "pauschal" },
    ],
    zeilen: [
      { label: "Fremdkapital (Darlehen), nur Info", betrag: (r) => r.fremdkapital, info: true },
      { label: "Eigenkapitaleinsatz, nur Info", betrag: (r) => r.eigenkapital, info: true },
      { label: "Zinskosten Projektlaufzeit", betrag: (r) => r.zinskosten },
      { label: "Bankgebühren", betrag: (_r, e) => e.bankgebuehren },
      { label: "Summe Finanzierung", betrag: (r) => r.summeFinanzierung, summe: true },
    ],
  },
];

const AMPEL_FELDER: Feld[] = [
  { key: "schwelleGruen", label: "Grün ab Marge", einheit: "%", hinweis: "Darüber: lohnt sich" },
  { key: "schwelleGelb", label: "Gelb ab Marge", einheit: "%", hinweis: "Darunter: rot" },
];

const URTEIL_STIL: Record<AnkaufErgebnis["urteil"], string> = {
  "LOHNT SICH": "bg-green-600 text-white",
  GRENZWERTIG: "bg-amber-500 text-white",
  "LOHNT SICH NICHT": "bg-red-600 text-white",
};

const URTEIL_PUNKT: Record<AnkaufErgebnis["urteil"], string> = {
  "LOHNT SICH": "bg-green-600",
  GRENZWERTIG: "bg-amber-500",
  "LOHNT SICH NICHT": "bg-red-600",
};

function Eingabe({ feld, eingaben, setze }: { feld: Feld; eingaben: AnkaufEingaben; setze: (k: keyof AnkaufEingaben, v: number) => void }) {
  // Prozentfelder rechnen intern als Anteil (0,05), angezeigt wird 5.
  const istProzent = feld.einheit === "%";
  const wert = istProzent ? Math.round(eingaben[feld.key] * 1e8) / 1e6 : eingaben[feld.key];
  return (
    <div className="space-y-1">
      <FormattedNumberInput
        label={feld.label}
        value={wert}
        suffix={feld.einheit === "Stück" ? "" : feld.einheit}
        maxFractionDigits={istProzent ? 4 : 2}
        sofort
        onChange={(v) => setze(feld.key, istProzent ? v / 100 : v)}
      />
      {feld.hinweis && <p className="text-xs text-muted-foreground">{feld.hinweis}</p>}
    </div>
  );
}

function Betragszeilen({ zeilen, r, e }: { zeilen: Zeile[]; r: AnkaufErgebnis; e: AnkaufEingaben }) {
  return (
    <div className="mt-4 rounded-xl bg-muted/40 p-3 text-sm">
      <div className="grid grid-cols-[1fr_auto_4.5rem] gap-x-3 text-xs text-muted-foreground pb-1">
        <span />
        <span className="text-right">Betrag</span>
        <span className="text-right">% v. Erlös</span>
      </div>
      {zeilen.map((z) => {
        const betrag = z.betrag(r, e);
        return (
          <div
            key={z.label}
            className={cn(
              "grid grid-cols-[1fr_auto_4.5rem] gap-x-3 py-1 tabular-nums",
              z.summe && "border-t border-border/60 font-semibold",
              z.info && "text-muted-foreground",
            )}
          >
            <span>{z.label}</span>
            <span className="text-right">{eur(betrag)}</span>
            <span className="text-right">{z.info ? "" : prozent(anteilAmErloes(betrag, r.verkaufserloes))}</span>
          </div>
        );
      })}
    </div>
  );
}

const Ankaufstool = () => {
  const [eingaben, setEingaben] = useState<AnkaufEingaben>(ANKAUF_STANDARD);
  const [objektName, setObjektName] = useState("");
  const [objekt, setObjekt] = useState<AnkaufObjekt>(OBJEKT_LEER);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const r = useMemo(() => berechneAnkauf(eingaben), [eingaben]);
  const setze = (k: keyof AnkaufEingaben, v: number) => setEingaben((alt) => ({ ...alt, [k]: v }));

  // Gespeicherte Versionen. Die Einstellungen kommen mit dem Cache nach,
  // deshalb hängt die Liste an dessen Version.
  const cacheStand = useLiveVersion(["user_settings"]);
  const [gespeichertStand, setGespeichertStand] = useState(0);
  const [aktiveVersion, setAktiveVersion] = useState<string | null>(null);
  const [speichertGerade, setSpeichertGerade] = useState(false);
  const versionen = useMemo(
    () => getUserSetting<AnkaufVersion[]>(ANKAUF_VERSIONEN_SCHLUESSEL, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheStand, gespeichertStand],
  );
  const versionenSchreiben = async (liste: AnkaufVersion[]) => {
    await setUserSettingSicher(ANKAUF_VERSIONEN_SCHLUESSEL, liste);
    setGespeichertStand((n) => n + 1);
  };

  const versionSichern = async () => {
    const jetzt = new Date();
    const name = objektName.trim() || `Rechnung vom ${jetzt.toLocaleDateString("de-DE")} ${jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    const neu: AnkaufVersion = { id: crypto.randomUUID(), name, gespeichertAm: jetzt.toISOString(), eingaben, objekt };
    setSpeichertGerade(true);
    try {
      await versionenSchreiben(versionSpeichern(versionen, neu));
      setAktiveVersion(neu.id);
      toast.success(`Version „${name}“ gespeichert.`);
    } catch (err) {
      console.error(err);
      toast.error("Die Version konnte nicht gespeichert werden.");
    } finally {
      setSpeichertGerade(false);
    }
  };

  const versionLaden = (v: AnkaufVersion) => {
    setEingaben(eingabenAusVersion(v));
    setObjekt(objektAusVersion(v));
    setObjektName(v.name.startsWith("Rechnung vom ") ? "" : v.name);
    setAktiveVersion(v.id);
  };

  const versionLoeschen = async (v: AnkaufVersion) => {
    if (!window.confirm(`Version „${v.name}“ löschen?`)) return;
    try {
      await versionenSchreiben(versionen.filter((x) => x.id !== v.id));
      if (aktiveVersion === v.id) setAktiveVersion(null);
    } catch (err) {
      console.error(err);
      toast.error("Die Version konnte nicht gelöscht werden.");
    }
  };

  const pdfSpeichern = async () => {
    setPdfLaeuft(true);
    try {
      const doc = await buildAnkaufstoolPdf(eingaben, objektName.trim(), objekt);
      const datum = new Date().toISOString().slice(0, 10);
      const name = objektName.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
      doc.save(`Ankaufstool_${name ? `${name}_` : ""}${datum}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Das PDF konnte nicht erstellt werden.");
    } finally {
      setPdfLaeuft(false);
    }
  };

  const ergebnisZeilen: [string, string, boolean?][] = [
    ["Gesamtkosten (1–4)", eur(r.gesamtkosten)],
    ["Verkaufserlös", eur(r.verkaufserloes)],
    ...(r.mieteinnahmen !== 0 ? [["Mietüberschuss bis Verkauf", eur(r.mieteinnahmen)] as [string, string]] : []),
    ["Gewinn (was übrig bleibt)", eur(r.gewinn), true],
    ["Marge vom Verkaufserlös", prozent(r.margeErloes), true],
    ["Marge auf Gesamtkosten", prozent(r.margeKosten)],
    ["Rendite auf Eigenkapital (Projekt)", prozent(r.renditeEigenkapital)],
    ["Gewinn je Einheit", eur(r.gewinnJeWohnung)],
    ["Gewinn je m²", eur(r.gewinnJeQm)],
    ["Gesamtkosten je m²", eur(r.gesamtkostenJeQm)],
    ["Ø Abgabepreis angesetzt", `${eur(r.abgabepreisDurchschnitt)}/m²`],
    ["Mindest-Abgabepreis für 0 € Gewinn", `${eur(r.mindestAbgabepreis)}/m²`],
    ["Nötiger Abgabepreis für Grün-Marge", `${eur(r.abgabepreisGruen)}/m²`],
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        <PageHeader title="Ankaufstool" subtitle="Bauträger-Kalkulator: Lohnt sich das Objekt? Grobe Go/No-Go-Rechnung vor Steuern.">
          <Button variant="outline" size="sm" onClick={() => { setEingaben(ANKAUF_STANDARD); setObjektName(""); setObjekt(OBJEKT_LEER); setAktiveVersion(null); }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Zurücksetzen
          </Button>
          <Button size="sm" onClick={pdfSpeichern} disabled={pdfLaeuft}>
            <FileDown className="h-4 w-4 mr-1" /> {pdfLaeuft ? "Erstelle PDF …" : "Als PDF speichern"}
          </Button>
        </PageHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6 min-w-0">
            <SectionCard>
              <SectionCardHeader>
                <SectionCardTitle>Objekt & Versionen</SectionCardTitle>
                <SectionCardDescription>
                  Die Bezeichnung erscheint im PDF und ist der Name der Version. Gleicher Name überschreibt die Version.
                </SectionCardDescription>
              </SectionCardHeader>
              <SectionCardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="ankauf-objekt">Objektbezeichnung</Label>
                  <div className="flex gap-2">
                    <Input id="ankauf-objekt" value={objektName} onChange={(ev) => setObjektName(ev.target.value)} placeholder="z. B. Musterstraße 1, Berlin" />
                    <Button variant="outline" onClick={versionSichern} disabled={speichertGerade} className="shrink-0">
                      <Save className="h-4 w-4 mr-1" /> {speichertGerade ? "Speichert …" : "Version speichern"}
                    </Button>
                  </div>
                </div>
                {versionen.length > 0 && (
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                    {versionen.map((v) => {
                      const urteil = berechneAnkauf(eingabenAusVersion(v)).urteil;
                      return (
                        <li key={v.id} className={cn("flex items-center gap-2 pr-2", aktiveVersion === v.id && "bg-muted/50")}>
                          <button
                            type="button"
                            onClick={() => versionLaden(v)}
                            className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-muted/40 rounded-l-xl"
                          >
                            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", URTEIL_PUNKT[urteil])} title={urteil} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{v.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {new Date(v.gespeichertAm).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                              </span>
                            </span>
                          </button>
                          <Button variant="ghost" size="icon" aria-label={`Version ${v.name} löschen`} onClick={() => versionLoeschen(v)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCardContent>
            </SectionCard>

            <SectionCard>
              <SectionCardHeader>
                <SectionCardTitle>Objektdaten aus Exposé</SectionCardTitle>
                <SectionCardDescription>
                  Angaben aus dem Verkaufs-Exposé übertragen. Was das Exposé nicht nennt, bleibt 0 bzw. leer.
                </SectionCardDescription>
              </SectionCardHeader>
              <SectionCardContent className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Objekt</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {EXPOSE_TEXTE.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label htmlFor={`ankauf-${f.key}`}>{f.label}</Label>
                        <Input
                          id={`ankauf-${f.key}`}
                          value={objekt[f.key]}
                          placeholder={f.platzhalter}
                          onChange={(ev) => setObjekt((alt) => ({ ...alt, [f.key]: ev.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ankauf-lage">Lage / Umfeld</Label>
                    <Textarea
                      id="ankauf-lage"
                      rows={2}
                      value={objekt.lage}
                      placeholder="z. B. Gewerbegebiet, Bahnhof 5 Min., Autobahn 5 Min."
                      onChange={(ev) => setObjekt((alt) => ({ ...alt, lage: ev.target.value }))}
                    />
                  </div>
                </div>
                {EXPOSE_GRUPPEN.map((g) => (
                  <div key={g.titel} className="space-y-3">
                    <h3 className="text-sm font-semibold">{g.titel}</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {g.felder.map((f) => <Eingabe key={f.key} feld={f} eingaben={eingaben} setze={setze} />)}
                    </div>
                  </div>
                ))}
                <dl className="rounded-xl bg-muted/40 p-3 text-sm">
                  {([
                    ["Gesamtfläche", `${zahl(r.gesamtflaeche, 2)} m²`],
                    ["Kaufpreis je m² Gesamtfläche", eur(r.kaufpreisJeQm)],
                    ["Ist-Miete p. a. gesamt", eur(r.istMieteJahr)],
                    ["Kaufpreisfaktor (Kaufpreis / Ist-Miete)", r.kaufpreisFaktor ? zahl(r.kaufpreisFaktor, 1) : "–"],
                    ["Mietüberschuss bis Verkauf (anteilig)", eur(r.mieteinnahmen)],
                  ] as const).map(([label, wert]) => (
                    <div key={label} className="flex justify-between gap-3 py-1 tabular-nums">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right">{wert}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCardContent>
            </SectionCard>

            {ABSCHNITTE.map((a) => (
              <SectionCard key={a.titel}>
                <SectionCardHeader>
                  <SectionCardTitle>{a.titel}</SectionCardTitle>
                  {a.beschreibung && <SectionCardDescription>{a.beschreibung}</SectionCardDescription>}
                </SectionCardHeader>
                <SectionCardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {a.felder.map((f) => <Eingabe key={f.key} feld={f} eingaben={eingaben} setze={setze} />)}
                  </div>
                  <Betragszeilen zeilen={a.zeilen} r={r} e={eingaben} />
                </SectionCardContent>
              </SectionCard>
            ))}

            <SectionCard>
              <SectionCardHeader>
                <SectionCardTitle>Ampel-Schwellen</SectionCardTitle>
                <SectionCardDescription>Marge vom Verkaufserlös. Zwischen Gelb und Grün: grenzwertig.</SectionCardDescription>
              </SectionCardHeader>
              <SectionCardContent className="grid gap-4 sm:grid-cols-2">
                {AMPEL_FELDER.map((f) => <Eingabe key={f.key} feld={f} eingaben={eingaben} setze={setze} />)}
              </SectionCardContent>
            </SectionCard>
          </div>

          <div className="lg:sticky lg:top-4 self-start space-y-4">
            <SectionCard>
              <SectionCardHeader>
                <SectionCardTitle>Ergebnis</SectionCardTitle>
              </SectionCardHeader>
              <SectionCardContent className="space-y-4">
                <div className={cn("rounded-xl px-4 py-3 text-center", URTEIL_STIL[r.urteil])}>
                  <div className="text-lg font-bold tracking-wide">{r.urteil}</div>
                  <div className="text-xs opacity-90">Marge {prozent(r.margeErloes)} vom Erlös</div>
                </div>
                <dl className="text-sm">
                  {ergebnisZeilen.map(([label, wert, fett]) => (
                    <div key={label} className={cn("flex justify-between gap-3 py-1 border-b border-border/40 last:border-0", fett && "font-semibold")}>
                      <dt className={cn(!fett && "text-muted-foreground")}>{label}</dt>
                      <dd className="tabular-nums text-right">{wert}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCardContent>
            </SectionCard>
            <p className="text-xs text-muted-foreground px-1">{ANKAUF_HINWEIS}</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Ankaufstool;
