import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Brain, Download, Search, ShieldAlert, Star, X, Dumbbell, ArrowRight, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  EINWAND_BIBLIOTHEK,
  EINWAND_KATEGORIEN,
  EINWAND_TECHNIKEN,
  type EinwandKategorie,
} from "@/lib/vertriebsakademieContent";
import { useZielgruppe, showGoldNugget } from "@/lib/vertriebsakademieZielgruppe";
import { ZielgruppenFilter } from "@/components/vertriebsakademie/ZielgruppenFilter";
import { EinwandAntwort } from "@/components/einwaende/EinwandSchnellhilfe";
import { mischeMitSaat } from "@/components/vertriebsakademie/aufgaben/AufgabenHelfer";

// ─── PDF je Technik, weiterhin auf Abruf geladen ───
const PDF_FUNKTION: Record<string, string> = {
  bumerang: "generateBumerangTechnikPDF",
  kontextwechsel: "generateKontextwechselPDF",
  "hypothetische-frage": "generateHypothetischeFragePDF",
  vorwegnahme: "generateVorwegnahmePDF",
  "isolierende-frage": "generateIsolierendeFragePDF",
  referenz: "generateReferenzTechnikPDF",
  gegenfrage: "generateGegenfragePDF",
  zerlegung: "generateZerlegungsTechnikPDF",
  zeitumkehr: "generateZeitumkehrPDF",
  "zahlen-zerlegung": "generateZahlenZerlegungPDF",
};

async function ladePdf(name: string) {
  const m = await import("@/lib/einwandTechnikenPdf");
  await (m as unknown as Record<string, () => Promise<void>>)[name]?.();
}

// ─── Merkliste, lokal im Browser ───
const MERK_KEY = "einwand_merkliste";

function leseMerkliste(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MERK_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Einwand-Bibliothek.
 *
 * Bis hierher standen 31 Einwände in zwei verschiedenen Tiefen nebeneinander,
 * unterschieden nur durch ein kleines Badge. Elf erklärten das Motiv des
 * Kunden und die typische Falle, zwanzig lieferten nur einen Satz zum
 * Nachsprechen. Inzwischen tragen alle dasselbe Schema, und jeder Einwand ist
 * mit der Technik verknüpft, die bei ihm greift.
 */
export function EinwandBibliothekMerged() {
  const { toast } = useToast();
  const [zielgruppe] = useZielgruppe();
  const zeigeProfi = showGoldNugget(zielgruppe);
  const [params, setParams] = useSearchParams();

  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState<EinwandKategorie | "alle">(
    (params.get("kategorie") as EinwandKategorie | null) ?? "alle",
  );
  const [technik, setTechnik] = useState<string>("alle");
  const [nurMerkliste, setNurMerkliste] = useState(false);
  const [merkliste, setMerkliste] = useState<string[]>(() => leseMerkliste());
  const [trainer, setTrainer] = useState(false);

  const offenAusUrl = params.get("einwand") || undefined;

  function merken(id: string) {
    const neu = merkliste.includes(id) ? merkliste.filter((x) => x !== id) : [...merkliste, id];
    setMerkliste(neu);
    try {
      localStorage.setItem(MERK_KEY, JSON.stringify(neu));
    } catch { /* Speicher gesperrt, dann nur für diese Sitzung */ }
  }

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return EINWAND_BIBLIOTHEK.filter((e) => {
      if (kategorie !== "alle" && e.kategorie !== kategorie) return false;
      if (technik !== "alle" && e.technik !== technik) return false;
      if (nurMerkliste && !merkliste.includes(e.id)) return false;
      if (!q) return true;
      return [e.einwand, e.meintEigentlich, e.antwortKurz, ...(e.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [suche, kategorie, technik, nurMerkliste, merkliste]);

  return (
    <div className="space-y-6">
      <ZielgruppenFilter />

      {/*
        Was der gewählte Pfad ändert, in einem Satz. Ohne diesen Hinweis
        probiert kaum jemand den Umschalter aus, weil nicht sichtbar ist, dass
        dahinter andere Inhalte liegen.
      */}
      <p className="text-xs text-muted-foreground -mt-3">
        {zeigeProfi
          ? "Profi-Ansicht: mit Profi-Move, Geschichte zum freien Erzählen, dem Prinzip hinter jeder Technik und der Stelle, an der sie nach hinten losgeht."
          : "Quereinsteiger-Ansicht: die Antwort groß zum Vorlesen, dazu die drei Schritte der passenden Technik. Profi-Moves und Feinheiten bleiben ausgeblendet."}
      </p>

      {/* ── Die zehn Techniken, kompakt statt zehn gleich aussehender Karten ── */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold leading-tight">Die zehn Techniken</h3>
              <p className="text-xs text-muted-foreground">
                {zeigeProfi
                  ? "Antippen für das Prinzip dahinter, die drei Schritte und die Grenzen."
                  : "Antippen für Beschreibung, die drei Schritte und ein Beispiel."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() =>
              ladePdf("generateAlleTechnikenPDF").catch(() =>
                toast({ title: "PDF konnte nicht erstellt werden", variant: "destructive" }),
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Alle als PDF
          </Button>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {EINWAND_TECHNIKEN.map((t, i) => {
            const dazu = EINWAND_BIBLIOTHEK.filter((e) => e.technik === t.id);
            return (
              <AccordionItem key={t.id} value={t.id} className="border-b last:border-0">
                <AccordionTrigger className="py-2.5 hover:no-underline text-left">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">
                      {i + 1}.
                    </span>
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                      {t.kurz}
                    </span>
                    {dazu.length > 0 && (
                      <Badge variant="secondary" className="ml-auto mr-2 text-[10px] shrink-0">
                        {dazu.length}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2.5">
                  <p className="text-sm">{t.kurz}</p>

                  {zeigeProfi && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                        Warum sie wirkt
                      </div>
                      <p className="text-sm text-foreground/90">{t.prinzip}</p>
                    </div>
                  )}

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                        In drei Schritten
                      </div>
                      <ol className="list-decimal list-inside space-y-0.5 text-sm text-foreground/90">
                        {t.schritte.map((s, j) => <li key={j}>{s}</li>)}
                      </ol>
                    </div>
                    <div className="rounded border-l-2 border-primary/60 bg-primary/5 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                        So klingt es
                      </div>
                      <p className="text-sm text-foreground/90">{t.beispiel}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">{t.wann}</p>
                  {zeigeProfi && (
                    <p className="text-xs text-rose-700 dark:text-rose-400">
                      <span className="font-semibold">Achtung: </span>{t.achtung}
                    </p>
                  )}
                  {dazu.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Einwände, bei denen sie greift
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {dazu.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => {
                              setTechnik("alle");
                              setKategorie("alle");
                              setSuche("");
                              const next = new URLSearchParams(params);
                              next.set("einwand", e.id);
                              setParams(next, { replace: true });
                              setTimeout(
                                () =>
                                  document
                                    .getElementById(`einwand-${e.id}`)
                                    ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                                60,
                              );
                            }}
                            className="text-xs rounded border px-2 py-1 hover:bg-muted/60 max-w-full"
                          >
                            <span className="line-clamp-1">„{e.einwand}"</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {PDF_FUNKTION[t.id] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() =>
                        ladePdf(PDF_FUNKTION[t.id]).catch(() =>
                          toast({ title: "PDF konnte nicht erstellt werden", variant: "destructive" }),
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" /> Als PDF
                    </Button>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </Card>

      {/* ── Trainer, für beide Pfade mit unterschiedlicher Härte ── */}
      {trainer ? (
        <EinwandTrainer zeigeProfi={zeigeProfi} onBeenden={() => setTrainer(false)} />
      ) : (
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Dumbbell className="h-4 w-4 text-primary" />
            <span>
              {zeigeProfi
                ? "Zehn Einwände, welche Technik greift."
                : "Zehn Einwände, welche Antwort passt. Mit Auflösung nach jeder Frage."}
            </span>
          </div>
          {/* Hauptaktion der Einwand-Bibliothek, deshalb Marken-Orange. */}
          <Button size="sm" variant="brand" onClick={() => setTrainer(true)} className="gap-1 shrink-0">
            Trainer starten <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Card>
      )}

      {/* ── Suche und Filter ── */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Einwand suchen, zwei Wörter reichen"
              className="pl-9"
            />
            {suche && (
              <button
                type="button"
                onClick={() => setSuche("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                aria-label="Suche leeren"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Select value={technik} onValueChange={setTechnik}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Technik" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Techniken</SelectItem>
              {EINWAND_TECHNIKEN.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setKategorie("alle")}
            className={cn(
              "text-xs rounded-full border px-2.5 py-1 transition-colors",
              kategorie === "alle"
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted/60",
            )}
          >
            Alle ({EINWAND_BIBLIOTHEK.length})
          </button>
          {EINWAND_KATEGORIEN.map((k) => {
            const n = EINWAND_BIBLIOTHEK.filter((e) => e.kategorie === k.id).length;
            if (n === 0) return null;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKategorie(k.id)}
                className={cn(
                  "text-xs rounded-full border px-2.5 py-1 transition-colors",
                  kategorie === k.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted/60",
                )}
              >
                {k.label} ({n})
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setNurMerkliste((v) => !v)}
            className={cn(
              "text-xs rounded-full border px-2.5 py-1 transition-colors inline-flex items-center gap-1",
              nurMerkliste
                ? "bg-amber-500/15 border-amber-500/50 text-amber-700"
                : "hover:bg-muted/60",
            )}
          >
            <Star className={cn("h-3 w-3", nurMerkliste && "fill-current")} />
            Merkliste ({merkliste.length})
          </button>
        </div>
      </Card>

      {/* ── Die Einwände ── */}
      <div className="space-y-3">
        {gefiltert.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Kein Einwand passt zu dieser Auswahl.
          </Card>
        )}
        {gefiltert.map((e) => (
          <div key={e.id} id={`einwand-${e.id}`} className="relative">
            <button
              type="button"
              onClick={() => merken(e.id)}
              className="absolute right-3 top-3 z-10"
              aria-label={merkliste.includes(e.id) ? "Aus Merkliste entfernen" : "Merken"}
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  merkliste.includes(e.id)
                    ? "fill-amber-400 text-amber-500"
                    : "text-muted-foreground/40 hover:text-amber-500",
                )}
              />
            </button>
            <Accordion
              type="single"
              collapsible
              defaultValue={offenAusUrl === e.id ? e.id : undefined}
            >
              <AccordionItem value={e.id} className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="text-left hover:no-underline py-4 pr-8">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">„{e.einwand}"</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {e.meintEigentlich}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <EinwandAntwort eintrag={e} zeigeProfi={zeigeProfi} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Einwand-Trainer.
 *
 * Für Quereinsteiger: Welche Antwort passt zu diesem Einwand? Die falschen
 * Optionen sind echte Antworten aus anderen Einwänden, also plausibel.
 * Für Profis: Welche der zehn Techniken greift hier? Ohne Auflösung
 * zwischendurch.
 */
function EinwandTrainer({
  zeigeProfi,
  onBeenden,
}: {
  zeigeProfi: boolean;
  onBeenden: () => void;
}) {
  const [runde] = useState(() =>
    mischeMitSaat(EINWAND_BIBLIOTHEK, String(EINWAND_BIBLIOTHEK.length)).slice(0, 10),
  );
  const [index, setIndex] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [richtig, setRichtig] = useState(0);
  const [fertig, setFertig] = useState(false);

  const aktuell = runde[index];

  const optionen = useMemo(() => {
    if (!aktuell) return [] as { id: string; text: string }[];
    if (zeigeProfi) {
      const falsche = mischeMitSaat(
        EINWAND_TECHNIKEN.filter((t) => t.id !== aktuell.technik),
        aktuell.id,
      ).slice(0, 3);
      const richtigeTechnik = EINWAND_TECHNIKEN.find((t) => t.id === aktuell.technik);
      const alle = [
        ...(richtigeTechnik ? [{ id: richtigeTechnik.id, text: richtigeTechnik.name }] : []),
        ...falsche.map((t) => ({ id: t.id, text: t.name })),
      ];
      return mischeMitSaat(alle, aktuell.id + "opt");
    }
    const falsche = mischeMitSaat(
      EINWAND_BIBLIOTHEK.filter((e) => e.id !== aktuell.id),
      aktuell.id,
    )
      .slice(0, 2)
      .map((e) => ({ id: e.id, text: e.antwortKurz }));
    return mischeMitSaat(
      [{ id: aktuell.id, text: aktuell.antwortKurz }, ...falsche],
      aktuell.id + "opt",
    );
  }, [aktuell, zeigeProfi]);

  const richtigeId = zeigeProfi ? aktuell?.technik : aktuell?.id;

  function weiter() {
    if (index + 1 >= runde.length) {
      setFertig(true);
      return;
    }
    setIndex(index + 1);
    setGewaehlt(null);
  }

  if (fertig) {
    return (
      <Card className="p-6 space-y-3 text-center">
        <div className="text-lg font-semibold">
          {richtig} von {runde.length} richtig
        </div>
        <p className="text-sm text-muted-foreground">
          {richtig >= 8
            ? "Das sitzt."
            : richtig >= 5
              ? "Solide. Die Fallen sind der Teil, der im Gespräch den Unterschied macht."
              : "Geh die Einwände unten in Ruhe durch, besonders den Abschnitt, was der Kunde eigentlich meint."}
        </p>
        <Button onClick={onBeenden}>Zurück zur Bibliothek</Button>
      </Card>
    );
  }

  if (!aktuell) return null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Einwand {index + 1} von {runde.length}
        </span>
        <button type="button" onClick={onBeenden} className="hover:text-foreground">
          Abbrechen
        </button>
      </div>

      <div className="rounded-lg border-l-2 border-primary bg-primary/5 p-3 text-sm font-medium">
        „{aktuell.einwand}"
      </div>
      <p className="text-xs text-muted-foreground">
        {zeigeProfi ? "Welche Technik greift hier?" : "Welche Antwort passt?"}
      </p>

      <div className="grid gap-2">
        {optionen.map((o) => {
          const aufgeloest = gewaehlt !== null;
          const istRichtig = o.id === richtigeId;
          return (
            <button
              key={o.id}
              type="button"
              disabled={aufgeloest}
              onClick={() => {
                setGewaehlt(o.id);
                if (o.id === richtigeId) setRichtig((r) => r + 1);
              }}
              className={cn(
                "text-left text-sm rounded-lg border px-3 py-2 transition-colors",
                !aufgeloest && "hover:bg-muted/50",
                aufgeloest && istRichtig && "border-emerald-500/50 bg-emerald-500/5",
                aufgeloest && !istRichtig && gewaehlt === o.id && "border-rose-500/50 bg-rose-500/5",
                aufgeloest && !istRichtig && gewaehlt !== o.id && "opacity-60",
              )}
            >
              <span className="flex items-start gap-2">
                {aufgeloest && istRichtig && (
                  <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                )}
                <span>{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {gewaehlt !== null && (
        <div className="space-y-3">
          {!zeigeProfi && (
            <div className="rounded-lg border p-3 text-xs space-y-1">
              <div className="font-semibold">Was er eigentlich meint</div>
              <div className="text-foreground/90">{aktuell.meintEigentlich}</div>
              <div className="font-semibold pt-1">Falle</div>
              <div className="text-foreground/90">{aktuell.falle}</div>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={weiter}>
              {index + 1 >= runde.length ? "Auswerten" : "Nächster Einwand"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
