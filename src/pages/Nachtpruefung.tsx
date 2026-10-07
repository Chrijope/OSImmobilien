import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Moon,
  OctagonX,
  RefreshCw,
} from "lucide-react";
import { ObjektdatenKarte } from "@/components/nachtpruefung/ObjektdatenKarte";
import {
  OBJEKTDATEN_PRAEFIX,
  OBJEKTDATEN_TITEL,
  leseTreffer,
  trefferText,
} from "../../supabase/functions/_shared/nachtpruefung-objektdaten.ts";

/**
 * Die Befunde der nächtlichen Systemprüfung, neueste Nacht zuerst.
 *
 * Warum diese Seite direkt auf `nachtpruefung_befunde` liest und nicht über
 * ein Store-Modul oder `dataCache` geht: Der Zwischenspeicher hält die
 * Tabellen, die fast jede Seite braucht, und wird beim Start gefüllt. Diese
 * Befunde brauchen Admin und Inhaber, sonst niemand, und sie sollen beim
 * Öffnen frisch sein. Ein Eintrag im Cache hieße, die Daten für alle Rollen
 * zu laden, die sie ohnehin nicht sehen dürfen. Dieselbe Entscheidung liegt
 * hinter den übrigen Prüfseiten (Session-Anomalien, Webhook-Audit).
 *
 * Warum nicht `nachtpruefung_bericht()`: Diese Funktion liefert
 * ausschließlich den letzten Lauf. Hier soll aber der Verlauf zu sehen sein,
 * damit man erkennt, ob ein Befund neu ist oder seit zwei Wochen steht.
 * Gelesen wird deshalb die Tabelle selbst, unter der Zugriffsregel, die dort
 * seit jeher liegt: nur Administratoren und Inhaber.
 *
 * Seit dem 24.09.2026 prüft der Nachtwächter auch die Objektdaten, je Bereich
 * OBJ, FIN und AS. Diese Befunde zeigt die Karte `ObjektdatenKarte` für die
 * letzte Nacht je Objekt, mit Link auf die Objektseite. Gelesen werden dafür
 * alle Spalten (`select("*")`), weil die Spalte `bereich` erst mit Migration
 * 20260924170000 kommt; eine ausdrückliche Auswahl mit ihr bräche die Seite,
 * solange die Migration nicht gelaufen ist.
 */

type Schwere = "hinweis" | "warnung" | "fehler";

interface Befund {
  id: string;
  lauf_at: string;
  pruefung: string;
  schwere: string;
  anzahl: number;
  meldung: string;
  beispiele: unknown;
  /** Seit Migration 20260924170000, vorher undefiniert. */
  bereich?: string | null;
}

interface Nacht {
  lauf_at: string;
  befunde: Befund[];
  fehler: number;
  warnungen: number;
}

/** Die letzten vier Wochen. Ältere räumt der Nachtlauf ohnehin selbst weg. */
const MAX_ZEILEN = 600;

/**
 * Wie eine Schwere aussieht.
 *
 * Bewusst mit eigenem Symbol und eigenem Wort je Stufe, nicht nur mit einer
 * Farbe: Wer Rot und Orange nicht unterscheiden kann, sieht sonst überall
 * dasselbe.
 */
const SCHWERE_DARSTELLUNG: Record<Schwere, {
  wort: string;
  Symbol: typeof AlertTriangle;
  klasse: string;
  rang: number;
}> = {
  fehler: { wort: "Kaputt", Symbol: OctagonX, klasse: "text-destructive", rang: 0 },
  warnung: { wort: "Ansehen", Symbol: AlertTriangle, klasse: "text-warning", rang: 1 },
  hinweis: { wort: "Hinweis", Symbol: Info, klasse: "text-muted-foreground", rang: 2 },
};

function darstellung(schwere: string) {
  return SCHWERE_DARSTELLUNG[(schwere as Schwere)] ?? SCHWERE_DARSTELLUNG.hinweis;
}

/** Aus dem Kurznamen einer Prüfung eine Überschrift machen. */
const PRUEFUNG_TITEL: Record<string, string> = {
  buchung_ohne_bestaetigung: "Buchungen ohne Bestätigung",
  erinnerung_fehlgeschlagen: "Fehlgeschlagene Terminerinnerungen",
  erinnerungsdienst_still: "Erinnerungsdienst",
  videoraum_haengt: "Hängende Videoräume",
  signatur_abgelaufen: "Abgelaufene Unterschriften",
  kontakt_ohne_zustaendigen: "Kontakte ohne Zuständigen",
  termin_ohne_raum: "Termine ohne Videoraum",
  kunde_auf_sperrliste: "Kontakte auf der Mail-Sperrliste",
  reservierung_ohne_bonitaet: "Reservierungen ohne Bonität",
  objektdaten: "Prüfung der Objektdaten",
  ...OBJEKTDATEN_TITEL,
};

function pruefungTitel(name: string): string {
  return PRUEFUNG_TITEL[name] ?? name.replace(/_/g, " ");
}

function nachtTitel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function uhrzeit(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Ein Beispiel als lesbare Zeile. Die Prüfungen legen verschiedene Felder ab. */
function beispielText(eintrag: unknown): string {
  if (typeof eintrag === "string") return eintrag;
  if (!eintrag || typeof eintrag !== "object") return String(eintrag ?? "");
  const e = eintrag as Record<string, unknown>;
  const teile: string[] = [];
  for (const feld of ["name", "titel", "email", "stufe"]) {
    const wert = e[feld];
    if (typeof wert === "string" && wert.trim()) {
      teile.push(wert.trim());
      break;
    }
  }
  if (teile.length === 0 && typeof e.id === "string") teile.push(e.id);
  for (const feld of ["grund", "fehler"]) {
    const wert = e[feld];
    if (typeof wert === "string" && wert.trim()) teile.push(wert.trim());
  }
  for (const feld of ["seit", "start", "abgelaufen", "termin"]) {
    const wert = e[feld];
    if (typeof wert === "string" && wert.trim()) {
      const datum = new Date(wert);
      if (!Number.isNaN(datum.getTime())) {
        teile.push(datum.toLocaleDateString("de-DE"));
        break;
      }
    }
  }
  return teile.length > 0 ? teile.join(" · ") : JSON.stringify(e);
}

function beispieleAls(pruefung: string, roh: unknown): string[] {
  if (!Array.isArray(roh)) return [];
  // Die Objektbefunde tragen je Objekt Titel, Angabe und Einheiten. Die
  // allgemeine Darstellung zeigte davon nur den Titel.
  if (pruefung.startsWith(OBJEKTDATEN_PRAEFIX)) {
    return leseTreffer(roh).map((t) => `${t.titel} · ${trefferText(t)}${t.neu ? " · neu" : ""}`);
  }
  return roh.map(beispielText).filter(Boolean);
}

export default function Nachtpruefung() {
  const [laden, setLaden] = useState(true);
  const [fehlertext, setFehlertext] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<Befund[]>([]);

  const laden_ = useCallback(async () => {
    setLaden(true);
    setFehlertext(null);
    try {
      const { data, error } = await supabase
        .from("nachtpruefung_befunde")
        .select("*")
        .order("lauf_at", { ascending: false })
        .limit(MAX_ZEILEN);
      if (error) throw error;
      setZeilen((data ?? []) as Befund[]);
    } catch (e) {
      // Die Seite darf auch dann nicht weiß bleiben, wenn die Tabelle in
      // dieser Umgebung noch gar nicht existiert oder die Zugriffsregel
      // greift. Beides endet hier in einer lesbaren Meldung.
      const text = e instanceof Error ? e.message : String(e);
      console.error("Nachtprüfung konnte nicht geladen werden:", e);
      setFehlertext(text);
      setZeilen([]);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    void laden_();
  }, [laden_]);

  /** Nach Nächten gruppieren, neueste zuerst, in jeder Nacht das Schlimmste oben. */
  const naechte = useMemo<Nacht[]>(() => {
    const nachMap = new Map<string, Befund[]>();
    for (const z of zeilen) {
      const liste = nachMap.get(z.lauf_at);
      if (liste) liste.push(z);
      else nachMap.set(z.lauf_at, [z]);
    }
    return [...nachMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([lauf_at, befunde]) => ({
        lauf_at,
        befunde: [...befunde].sort(
          (a, b) =>
            darstellung(a.schwere).rang - darstellung(b.schwere).rang ||
            b.anzahl - a.anzahl ||
            a.pruefung.localeCompare(b.pruefung),
        ),
        fehler: befunde.filter((b) => b.schwere === "fehler" && b.anzahl > 0).length,
        warnungen: befunde.filter((b) => b.schwere === "warnung" && b.anzahl > 0).length,
      }));
  }, [zeilen]);

  const neueste = naechte[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Moon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Nachtprüfung</h1>
            <p className="text-sm text-muted-foreground">
              Was die nächtliche Systemprüfung gefunden hat, neueste Nacht zuerst.
              Ältere Befunde als vier Wochen räumt der Lauf selbst weg.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void laden_()} disabled={laden}>
          {laden ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" /> Neu laden
            </>
          )}
        </Button>
      </div>

      {laden && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!laden && fehlertext && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 mx-auto text-warning" />
            <div className="font-medium">Die Befunde konnten nicht geladen werden.</div>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Entweder ist die zugehörige Migration in dieser Umgebung noch nicht
              gelaufen oder die Zugriffsregel lässt dieses Konto nicht zu. Diese Seite
              sehen nur Administratoren und Inhaber.
            </p>
            <p className="text-xs text-muted-foreground font-mono break-all">{fehlertext}</p>
            <Button variant="outline" size="sm" onClick={() => void laden_()}>
              Noch einmal versuchen
            </Button>
          </CardContent>
        </Card>
      )}

      {!laden && !fehlertext && naechte.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Moon className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="font-medium">Noch keine Befunde</div>
            <p className="text-sm text-muted-foreground">
              Die nächtliche Prüfung hat bisher nichts abgelegt. Der nächste Lauf ist
              in der kommenden Nacht.
            </p>
          </CardContent>
        </Card>
      )}

      {!laden && !fehlertext && neueste && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Letzte Nacht</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-sm text-muted-foreground">{nachtTitel(neueste.lauf_at)}</div>
              <div className="text-xs text-muted-foreground">{uhrzeit(neueste.lauf_at)} Uhr</div>
            </div>
            <div className="flex items-center gap-2">
              <OctagonX className="h-5 w-5 text-destructive" />
              <span className="text-2xl font-bold">{neueste.fehler}</span>
              <span className="text-sm text-muted-foreground">kaputt</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <span className="text-2xl font-bold">{neueste.warnungen}</span>
              <span className="text-sm text-muted-foreground">anzusehen</span>
            </div>
            {neueste.fehler === 0 && neueste.warnungen === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Alles in Ordnung.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!laden && !fehlertext && neueste && <ObjektdatenKarte befunde={neueste.befunde} />}

      {!laden && !fehlertext && naechte.map((nacht) => (
        <Card key={nacht.lauf_at}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              <span>{nachtTitel(nacht.lauf_at)}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {uhrzeit(nacht.lauf_at)} Uhr
              </span>
              {nacht.fehler > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <OctagonX className="h-3 w-3" /> {nacht.fehler} kaputt
                </Badge>
              )}
              {nacht.warnungen > 0 && (
                <Badge variant="outline" className="gap-1 border-warning text-warning">
                  <AlertTriangle className="h-3 w-3" /> {nacht.warnungen} anzusehen
                </Badge>
              )}
              {nacht.fehler === 0 && nacht.warnungen === 0 && (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" /> ohne Befund
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {nacht.befunde.map((befund) => {
                const stil = darstellung(befund.schwere);
                const beispiele = beispieleAls(befund.pruefung, befund.beispiele);
                return (
                  <AccordionItem key={befund.id} value={befund.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex flex-1 items-start gap-3 text-left pr-3">
                        <stil.Symbol className={`h-4 w-4 mt-0.5 shrink-0 ${stil.klasse}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{pruefungTitel(befund.pruefung)}</div>
                          <div className="text-xs text-muted-foreground">{befund.meldung}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-sm font-semibold ${stil.klasse}`}>{befund.anzahl}</div>
                          <div className="text-[11px] text-muted-foreground">{stil.wort}</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {beispiele.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-7">
                          Zu diesem Punkt hat die Prüfung keine Beispiele abgelegt.
                        </p>
                      ) : (
                        <ul className="pl-7 space-y-1">
                          {beispiele.map((text, i) => (
                            <li key={i} className="text-sm text-muted-foreground">
                              {text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
