/**
 * Was der Interessent selbst in Steuerrechner und Analysetool ausgefüllt hat.
 *
 * Warum es diese Karte gibt: Beide Werkzeuge legen ihren Stand längst im
 * `meta` des Kontakts ab, `steuerSnapshot` und `analyseSnapshot`. Angezeigt
 * wurde bisher keiner von beiden, nirgends im Projekt. Der Partner hatte damit
 * Daten, die er nicht sehen konnte, und rief an, ohne zu wissen, welche Zahl
 * der Interessent kurz vorher auf dem Bildschirm hatte.
 *
 * Genau das ist die Aufgabe hier: die Angaben so zeigen, wie sie gemacht
 * wurden, mit dem Datum daneben. Eine Angabe ohne Zeitpunkt ist nach ein paar
 * Wochen nichts mehr wert, und wer sie für aktuell hält, ruft mit veralteten
 * Zahlen an.
 *
 * Die Karte ist reine Anzeige. Sie schreibt nichts, sie rechnet nichts. Alle
 * Beträge sind die, die der Interessent gesehen hat, und werden hier nicht neu
 * gerechnet: Rechnete sie nach, stünde nach der nächsten Änderung am
 * Rechenkern eine andere Zahl im Profil als im Gespräch.
 *
 * Ältere Kontakte tragen noch die frühere Fassung des Schnappschusses, mit
 * einer einzelnen Ersparnis statt einer Spanne. Beide Formen werden gelesen,
 * damit die Karte bei Bestandskontakten nicht leer bleibt.
 *
 * Beide Blöcke sind zugeklappt. Die Stammdaten sind die Seite, auf der jemand
 * die Telefonnummer sucht, und ein Dutzend Zahlen dazwischen hilft ihm dabei
 * nicht. Aufgeklappt wird, wer sich auf das Gespräch vorbereitet. Damit
 * niemand ins Leere klicken muss, trägt die zugeklappte Zeile bereits die
 * beiden Angaben, an denen sich entscheidet, ob sich das Aufklappen lohnt.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BookMarked, Calculator, ChevronDown, Download, LineChart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  ausgangText,
  konfiguratorAngaben,
  ladeLeadStaende,
  LEAD_STUFE_TEXT,
  leadStufe,
  rahmenKurz,
  type LeadStandZeile,
} from "@/lib/handbuch/leadStand";
import { AUSGANG_PILLE, FELD_TEXT, STUFE_PILLE } from "@/components/handbuch/HandbuchLeadTabelle";
import { antwortText, rahmenText, UEBERSCHUSS_WENN_UNBEKANNT } from "../../../supabase/functions/_shared/handbuch-funnel.ts";

/* ── Die beiden Schnappschüsse, so wie sie im meta liegen ─────────────────
 * Alles optional: Ein Kontakt kann aus einem der beiden Werkzeuge kommen, aus
 * beiden oder aus keinem, und ältere Einträge kennen die neueren Felder nicht.
 */
export interface SteuerSnapshot {
  erfasstAm?: string;
  jahresbrutto?: number;
  partnerBrutto?: number;
  steuerklasse?: string;
  beschaeftigung?: string;
  beschaeftigungTitel?: string;
  kinder?: number;
  bundesland?: string | null;
  kirchensteuer?: boolean;
  bestehendeImmobilien?: number;
  startzeitpunkt?: string | null;
  zvE?: number;
  grenzsteuersatz?: number;
  steuerlastHeute?: number;
  ersparnisJahrVon?: number;
  ersparnisJahrBis?: number;
  ersparnis10JVon?: number;
  ersparnis10JBis?: number;
  erhaltungEinmalig?: number;
  objektpreis?: number;
  /** Frühere Fassung, einzelne Werte statt einer Spanne. */
  ersparnisJahr?: number;
  ersparnis10J?: number;
  vermoegenszuwachs?: number;
  objektklasse?: string;
}

export interface AnalyseSnapshot {
  erfasstAm?: string;
  monthlyZuzahlung?: number;
  wealthAfter10Years?: number;
}

export interface RechnerMeta {
  steuerSnapshot?: SteuerSnapshot;
  steuerStartzeitpunkt?: string | null;
  analyseSnapshot?: AnalyseSnapshot;
  analyseScore?: number;
  analyseNachricht?: string;
  leadQuality?: string;
}

interface Props {
  meta?: RechnerMeta | null;
  /**
   * Wann der Kontakt angelegt wurde. Nur Rückfallebene: Ältere Einträge haben
   * keinen eigenen Zeitpunkt im Schnappschuss, und dann ist das Anlagedatum
   * die beste verfügbare Näherung. Es wird als solche gekennzeichnet.
   */
  erstelltAm?: string;
  /** Für den Block „Konfigurator“: Kennung und Quelle des Kontakts. */
  kontaktId?: string;
  quelle?: string;
  /** Für das Handbuch-PDF: Name wie im Handbuch und der Zuständige als Partner im Kopf. */
  vorname?: string;
  nachname?: string;
  zustaendigId?: string | null;
}

const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

const datum = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/** Die Startzeitpunkte des Rechners in Klartext. Gleicher Wortlaut wie dort. */
const STARTZEITPUNKT: Record<string, string> = {
  sofort: "So bald wie möglich",
  zwoelf_monate: "In den nächsten zwölf Monaten",
  irgendwann: "Irgendwann",
  neugier: "Nur aus Neugier",
};

const BUNDESLAND: Record<string, string> = {
  bw: "Baden-Württemberg",
  by: "Bayern",
  be: "Berlin",
  bb: "Brandenburg",
  hb: "Bremen",
  hh: "Hamburg",
  he: "Hessen",
  mv: "Mecklenburg-Vorpommern",
  ni: "Niedersachsen",
  nw: "Nordrhein-Westfalen",
  rp: "Rheinland-Pfalz",
  sl: "Saarland",
  sn: "Sachsen",
  st: "Sachsen-Anhalt",
  sh: "Schleswig-Holstein",
  th: "Thüringen",
};

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{wert}</div>
    </div>
  );
}

/** Ist überhaupt etwas da, das sich zeigen lässt? */
/**
 * Ein zugeklappter Block mit Kopfzeile.
 *
 * Die Kurzfassung in der Kopfzeile ist der eigentliche Kniff: Ohne sie müsste
 * man aufklappen, um zu sehen, ob sich das Aufklappen lohnt. Mit ihr steht die
 * wichtigste Angabe schon da, und wer mehr will, klappt auf.
 */
function Block({
  titel,
  symbol,
  kurz,
  zeitpunkt: zeit,
  abstand,
  children,
}: {
  titel: string;
  symbol: React.ReactNode;
  kurz: string;
  zeitpunkt: string;
  abstand?: boolean;
  children: React.ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <Collapsible open={offen} onOpenChange={setOffen}>
      <div className={`rounded-lg border border-border ${abstand ? "mt-4" : ""}`}>
        <CollapsibleTrigger className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
          <div className="flex min-w-0 items-center gap-2">
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${offen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            {symbol}
            <span className="text-sm font-semibold">{titel}</span>
            {kurz && !offen && (
              <span className="truncate text-xs text-muted-foreground">· {kurz}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{zeit}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border p-4">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/** Die zwei Angaben, an denen sich entscheidet, ob man aufklappt. */
function kurzfassungSteuer(s: SteuerSnapshot): string {
  const teile: string[] = [];
  if (typeof s.jahresbrutto === "number") teile.push(`${eur(s.jahresbrutto)} brutto`);
  if (s.steuerklasse) teile.push(`Klasse ${s.steuerklasse}`);
  return teile.join(" · ");
}

function kurzfassungAnalyse(meta?: RechnerMeta | null): string {
  const teile: string[] = [];
  if (typeof meta?.analyseScore === "number") teile.push(`${meta.analyseScore} Punkte`);
  if (meta?.leadQuality) teile.push(String(meta.leadQuality));
  return teile.join(" · ");
}

export function hatRechnerAngaben(meta?: RechnerMeta | null, quelle?: string): boolean {
  if (!meta) return false;
  if (konfiguratorAngaben({ quelle, meta }).ausHandbuch) return true;
  const s = meta.steuerSnapshot;
  const a = meta.analyseSnapshot;
  const steuerDa = !!s && Object.values(s).some((w) => w !== undefined && w !== null);
  const analyseDa =
    (!!a && Object.values(a).some((w) => w !== undefined && w !== null)) ||
    typeof meta.analyseScore === "number";
  return steuerDa || analyseDa;
}

export default function RechnerAngaben({ meta, erstelltAm, kontaktId, quelle, vorname, nachname, zustaendigId }: Props) {
  if (!hatRechnerAngaben(meta, quelle)) return null;
  const s = meta?.steuerSnapshot;
  const a = meta?.analyseSnapshot;
  const analyseDa = !!a || typeof meta?.analyseScore === "number";

  /* Der Zeitpunkt. Steht er nicht im Schnappschuss, wird das Anlagedatum
     genommen und ausdruecklich als solches benannt. */
  const zeitpunkt = (eigen?: string) => {
    const genau = datum(eigen);
    if (genau) return `Ausgefüllt am ${genau}`;
    const ersatz = datum(erstelltAm);
    return ersatz ? `Kontakt angelegt am ${ersatz}` : "Zeitpunkt nicht vermerkt";
  };

  const angaben: Array<{ label: string; wert: string }> = [];
  if (s) {
    if (typeof s.jahresbrutto === "number")
      angaben.push({ label: "Jahresbrutto", wert: eur(s.jahresbrutto) });
    if (s.beschaeftigungTitel || s.beschaeftigung)
      angaben.push({
        label: "Beschäftigung",
        wert: s.beschaeftigungTitel || s.beschaeftigung || "",
      });
    if (s.steuerklasse) angaben.push({ label: "Steuerklasse", wert: s.steuerklasse });
    if (typeof s.partnerBrutto === "number" && s.partnerBrutto > 0)
      angaben.push({ label: "Partner, Jahresbrutto", wert: eur(s.partnerBrutto) });
    if (typeof s.kinder === "number")
      angaben.push({
        label: "Kinder",
        wert: s.kinder === 0 ? "Keine" : String(s.kinder),
      });
    if (s.bundesland)
      angaben.push({ label: "Bundesland", wert: BUNDESLAND[s.bundesland] || s.bundesland });
    if (typeof s.kirchensteuer === "boolean")
      angaben.push({ label: "Kirchensteuer", wert: s.kirchensteuer ? "Ja" : "Nein" });
    if (typeof s.bestehendeImmobilien === "number")
      angaben.push({
        label: "Bestehende Anlageimmobilien",
        wert: s.bestehendeImmobilien === 0 ? "Keine, Erstinvestor" : String(s.bestehendeImmobilien),
      });
    const start = s.startzeitpunkt || meta?.steuerStartzeitpunkt || "";
    if (start)
      angaben.push({ label: "Gewünschter Start", wert: STARTZEITPUNKT[start] || start });
  }

  const ergebnisse: Array<{ label: string; wert: string }> = [];
  if (s) {
    if (typeof s.steuerlastHeute === "number")
      ergebnisse.push({ label: "Steuerlast heute, pro Jahr", wert: eur(s.steuerlastHeute) });
    if (typeof s.zvE === "number")
      ergebnisse.push({ label: "Zu versteuerndes Einkommen", wert: eur(s.zvE) });
    if (typeof s.grenzsteuersatz === "number")
      ergebnisse.push({
        label: "Grenzsteuersatz",
        wert: `${s.grenzsteuersatz.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Prozent`,
      });
    if (typeof s.ersparnisJahrVon === "number" && typeof s.ersparnisJahrBis === "number") {
      ergebnisse.push({
        label: "Gezeigte Ersparnis, pro Jahr",
        wert: `${eur(s.ersparnisJahrVon)} bis ${eur(s.ersparnisJahrBis)}`,
      });
    } else if (typeof s.ersparnisJahr === "number") {
      ergebnisse.push({ label: "Gezeigte Ersparnis, pro Jahr", wert: eur(s.ersparnisJahr) });
    }
    if (typeof s.ersparnis10JVon === "number" && typeof s.ersparnis10JBis === "number") {
      ergebnisse.push({
        label: "Gezeigte Ersparnis, zehn Jahre",
        wert: `${eur(s.ersparnis10JVon)} bis ${eur(s.ersparnis10JBis)}`,
      });
    } else if (typeof s.ersparnis10J === "number") {
      ergebnisse.push({ label: "Gezeigte Ersparnis, zehn Jahre", wert: eur(s.ersparnis10J) });
    }
    if (typeof s.erhaltungEinmalig === "number")
      ergebnisse.push({
        label: "Erhaltungsaufwand, einmalig",
        wert: `bis zu ${eur(s.erhaltungEinmalig)}`,
      });
    if (typeof s.objektpreis === "number")
      ergebnisse.push({ label: "Typisiertes Objekt", wert: eur(s.objektpreis) });
    if (typeof s.vermoegenszuwachs === "number")
      ergebnisse.push({ label: "Vermögenszuwachs, zehn Jahre", wert: eur(s.vermoegenszuwachs) });
  }

  const analyse: Array<{ label: string; wert: string }> = [];
  if (typeof meta?.analyseScore === "number")
    analyse.push({ label: "Punktzahl", wert: String(meta.analyseScore) });
  if (typeof a?.monthlyZuzahlung === "number")
    analyse.push({ label: "Monatliche Zuzahlung", wert: eur(a.monthlyZuzahlung) });
  if (typeof a?.wealthAfter10Years === "number")
    analyse.push({ label: "Vermögen nach zehn Jahren", wert: eur(a.wealthAfter10Years) });
  if (meta?.leadQuality)
    analyse.push({ label: "Eingestufte Dringlichkeit", wert: meta.leadQuality });

  return (
    <Card className="p-6">
      <div className="w-8 h-1 bg-primary mb-3" />
      <h3 className="font-bold mb-1">Angaben aus unseren Rechnern</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Was der Interessent selbst ausgefüllt hat, bevor er sich eingetragen hat. Genau diese Zahlen
        hatte er auf dem Bildschirm.
      </p>

      <KonfiguratorBlock
        meta={meta}
        quelle={quelle}
        kontaktId={kontaktId}
        zeitpunkt={zeitpunkt}
        kontakt={{ vorname, nachname, zustaendigId }}
      />

      {s && (
        <Block
          titel="Steuerrechner"
          symbol={<Calculator className="h-4 w-4 text-primary" aria-hidden="true" />}
          kurz={kurzfassungSteuer(s)}
          zeitpunkt={zeitpunkt(s.erfasstAm)}
        >
          {angaben.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {angaben.map((z) => (
                <Zeile key={z.label} label={z.label} wert={z.wert} />
              ))}
            </div>
          )}

          {ergebnisse.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {ergebnisse.map((z) => (
                  <Zeile key={z.label} label={z.label} wert={z.wert} />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Die Ersparnis steht als Spanne, weil zwei Abschreibungswege offenstehen. Das untere
                Ende gilt ohne Nachweis, das obere setzt ein Gutachten zur Restnutzungsdauer voraus.
                Modellrechnung an einem typisierten Objekt, keine Steuerberatung.
              </p>
            </div>
          )}
        </Block>
      )}

      {analyseDa && (
        <Block
          titel="Analysetool"
          symbol={<LineChart className="h-4 w-4 text-primary" aria-hidden="true" />}
          kurz={kurzfassungAnalyse(meta)}
          zeitpunkt={zeitpunkt(a?.erfasstAm)}
          abstand={!!s}
        >
          {analyse.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {analyse.map((z) => (
                <Zeile key={z.label} label={z.label} wert={z.wert} />
              ))}
            </div>
          )}
          {meta?.analyseNachricht && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="text-xs font-semibold text-muted-foreground">Seine Nachricht</div>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                {meta.analyseNachricht}
              </p>
            </div>
          )}
        </Block>
      )}
    </Card>
  );
}

/**
 * Was der Lead im Konfigurator der Handbuch-Seite angegeben hat (seit dem
 * 26.09.2026): Rahmen, Ausgang, die sechs Antworten und wie weit er im
 * Trichter ist. Damit der Partner nach der Zuweisung weiß, wo er ansetzt.
 * Aufgeklappt, weil genau das vor dem ersten Anruf gelesen werden soll.
 */
function KonfiguratorBlock({
  meta,
  quelle,
  kontaktId,
  zeitpunkt,
  kontakt,
}: {
  meta?: RechnerMeta | null;
  quelle?: string;
  kontaktId?: string;
  zeitpunkt: (iso?: string) => string;
  kontakt: { vorname?: string; nachname?: string; zustaendigId?: string | null };
}) {
  const angaben = konfiguratorAngaben({ quelle, meta });
  const [zeile, setZeile] = useState<LeadStandZeile | null>(null);
  useEffect(() => {
    if (!angaben.ausHandbuch || !kontaktId) return;
    let ab = false;
    ladeLeadStaende([kontaktId]).then((r) => {
      if (!ab && r.status === "ok") setZeile(r.zeilen.get(kontaktId) ?? null);
    });
    return () => {
      ab = true;
    };
  }, [angaben.ausHandbuch, kontaktId]);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  if (!angaben.ausHandbuch) return null;
  const pdfLaden = async () => {
    setPdfLaeuft(true);
    try {
      // Erst beim Klick laden, damit das Profil nicht auf jsPDF wartet.
      const { ladeHandbuchPdfAusProfil } = await import("@/lib/handbuch/profilPdf");
      await ladeHandbuchPdfAusProfil({ ...kontakt, meta }, { saAusgefuellt: !!zeile?.saUnterschrieben });
    } catch (e) {
      console.error("Handbuch-PDF im Profil:", e);
      toast({
        title: "Handbuch nicht erstellt",
        description: "Das PDF ließ sich gerade nicht erzeugen. Bitte versuch es noch einmal.",
        variant: "destructive",
      });
    } finally {
      setPdfLaeuft(false);
    }
  };
  const stufe = leadStufe(angaben, zeile);
  const a = angaben.antworten;
  const kurz = [angaben.rahmen ? `Rahmen ${rahmenKurz(angaben.rahmen)}` : "", LEAD_STUFE_TEXT[stufe]].filter(Boolean).join(" · ");
  return (
    <div className="mb-4">
      <Collapsible defaultOpen>
        <div className="rounded-lg border border-border">
          <CollapsibleTrigger className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted/40 rounded-lg">
            <div className="flex min-w-0 items-center gap-2">
              <BookMarked className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold">Aus dem Konfigurator</span>
              <span className="truncate text-xs text-muted-foreground">· {kurz}</span>
            </div>
            <span className="text-xs text-muted-foreground">{zeitpunkt(angaben.zeitpunkt ?? undefined)}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 border-t border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                {angaben.rahmen ? (
                  <>
                    <span className="text-base font-bold">Rahmen {rahmenText(angaben.rahmen)}</span>
                    {angaben.ausgang && (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${AUSGANG_PILLE[angaben.ausgang]}`}>{ausgangText(angaben.ausgang)}</span>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Über die offene Selbstauskunft gekommen, ohne Konfigurator.</span>
                )}
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STUFE_PILLE[stufe]}`}>{LEAD_STUFE_TEXT[stufe]}</span>
                {stufe === "sa_liegt_vor" && zeile?.saPdfImInvestment && <span className="text-xs text-muted-foreground">PDF im Investment</span>}
                {/* Nur mit allen sechs Antworten: ohne sie gäbe es kein Handbuch, das der Kunde gesehen haben kann. */}
                {a && (
                  <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={pdfLaden} disabled={pdfLaeuft}>
                    {pdfLaeuft ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                    {pdfLaeuft ? "Handbuch wird erstellt" : "Handbuch als PDF"}
                  </Button>
                )}
              </div>
              {a && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {(["ziel", "beruf", "brutto", "ueberschuss", "eigenkapital", "start"] as const).map((f) => (
                    <Zeile key={f} label={FELD_TEXT[f]} wert={antwortText(f, a[f])} />
                  ))}
                </div>
              )}
              {angaben.rahmen && (
                <p className="text-xs text-muted-foreground">
                  Modellrechnung mit der Untergrenze der Antworten{a?.ueberschuss === "unbekannt" ? `, Überschuss unbekannt, gerechnet mit ${UEBERSCHUSS_WENN_UNBEKANNT} €` : ""}: 80 % des Überschusses als Rate, 6 % Annuität, plus Eigenkapital. Keine Finanzierungszusage. Nach der Selbstauskunft gilt die genaue Rechnung.
                </p>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
