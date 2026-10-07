import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, Info, Loader2, MapPin, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { cn } from "@/lib/utils";
import { getObjekte, type ObjektData } from "@/lib/objekteStore";
import { getEigeneSaData, type Investment } from "@/lib/investmentsStore";
import type { KundeData } from "@/lib/kundenStore";
import { selbstauskunftEntfaellt } from "@/lib/selbstauskunftEntfaellt";
import { getCachedCoords } from "@/lib/geocodeCache";
import type { Koordinate } from "@/lib/umgebung";
import { eur0 } from "@/lib/objektKennzahlen";
import { weNrAnzeige } from "@/lib/objektDatenPflicht";
import {
  ANZAHL_EMPFEHLUNGEN, LISTEN_SORTIERUNGEN, NEBENKOSTEN_IM_RAHMEN, empfehlungenAuswaehlen, empfehlungsGrund,
  empfehlungsKandidaten, entfernungZeile, finanzierungsrahmen, gespeicherteObjektKoordinate,
  kaufpreisRahmenUeberSaetze, keinRahmenHinweis, objektAdressAnfrage, objektListe, sortiereObjektListe, spanneText,
  type EmpfehlungsKandidat, type KeinRahmenGrund, type ListenSortierung, type ObjektListenEintrag, type WohnortStand,
} from "@/lib/einheitEmpfehlung";
import { besteTreffer, vergleicheScore, zieleText, type ObjektScore } from "@/lib/objektScore";
import { kundenScoreDaten, scoreFuerKandidat } from "@/lib/objektScoreDaten";
import { ScoreChips, ScoreHinweis, ScoreRing, ScoreWarum } from "@/components/objektscore/ScoreAnzeige";
import {
  wohnortAus, wohnortGeoAmInvestment, wohnortGeoMerken, wohnortKoordinateErmitteln, type Wohnort,
} from "@/lib/wohnortKoordinate";
import { einheitOeffnenLink, objektOeffnenLink, rueckwegImVerlaufMerken, type KundenBezug } from "@/lib/empfehlungAuswahl";
import { ObjektauswahlFenster, Vorschaubild } from "./ObjektauswahlFenster";

type WohnortErgebnis = { stand: WohnortStand | "laedt"; koordinate: Koordinate | null };

/**
 * Die Koordinate des Wohnorts: gemerkt am Investment, sonst einmal über
 * Photon nachgeschlagen (nur „PLZ Ort", siehe `wohnortKoordinate.ts`).
 */
function useWohnortKoordinate(investmentId: string, wohnort: Wohnort | null, rolle: string): WohnortErgebnis {
  const plz = wohnort?.plz || "";
  const ort = wohnort?.ort || "";
  const gemerkt = plz ? wohnortGeoAmInvestment(investmentId, plz) : null;
  const hatGemerkt = !!gemerkt;
  const [nachgeschlagen, setNachgeschlagen] = useState<{ plz: string; koordinate: Koordinate | null } | null>(null);

  useEffect(() => {
    if (!plz || hatGemerkt) return;
    let abgebrochen = false;
    wohnortKoordinateErmitteln({ plz, ort })
      .then((geo) => {
        if (abgebrochen) return;
        wohnortGeoMerken(investmentId, geo, rolle);
        setNachgeschlagen({ plz, koordinate: { lat: geo.lat, lng: geo.lng } });
      })
      .catch(() => {
        // Nicht gefunden oder Dienst nicht erreichbar: Dann wird nach Preis
        // sortiert, und der Hinweis sagt es. Kein Absturz, kein stiller Fehler.
        if (!abgebrochen) setNachgeschlagen({ plz, koordinate: null });
      });
    return () => { abgebrochen = true; };
  }, [investmentId, plz, ort, hatGemerkt, rolle]);

  if (!plz) return { stand: "fehlt", koordinate: null };
  if (gemerkt) return { stand: "bekannt", koordinate: { lat: gemerkt.lat, lng: gemerkt.lng } };
  if (nachgeschlagen && nachgeschlagen.plz === plz) {
    return nachgeschlagen.koordinate
      ? { stand: "bekannt", koordinate: nachgeschlagen.koordinate }
      : { stand: "nicht_gefunden", koordinate: null };
  }
  return { stand: "laedt", koordinate: null };
}

/**
 * Die Lage der Objekte, ohne jede Anfrage: gespeicherte Koordinaten
 * (`gespeicherteObjektKoordinate`: gemessene Analyse, `meta.koordinaten`),
 * sonst der Zwischenspeicher früherer Nachschlagungen der Objektkarte. Bis zum
 * 23.09.2026 schlug die Seite fehlende Objekte bei Nominatim nach; seitdem
 * misst der Import den Standort einmal und hinterlegt ihn (Christian: keine
 * unnötigen Aufrufe). Ohne Lage gibt es für das Objekt keine Entfernung.
 */
function useObjektKoordinaten() {
  return useCallback((o: ObjektData): Koordinate | null => {
    const gespeichert = gespeicherteObjektKoordinate(o);
    if (gespeichert) return gespeichert;
    const anfrage = objektAdressAnfrage(o);
    return (anfrage ? getCachedCoords(anfrage) : null) ?? null;
  }, []);
}

interface ObjektEmpfehlungenProps {
  kunde: KundeData;
  inv: Investment;
  minRahmen: number;
  maxRahmen: number;
  userRole: string;
  userName?: string;
  onNavigate: (pfad: string) => void;
}


/** Ein Treffer oben: der Kandidat, sein Score und was dazu im Haus noch passt. */
interface Treffer {
  kandidat: EmpfehlungsKandidat;
  score: ObjektScore | null;
  weiterePassendeImHaus: number;
  grund: string;
}

/** Warum ein Objekt der Gesamtliste keine passende Einheit hat, kurz für die Zeile. */
function ohnePassendeText(e: ObjektListenEintrag, rahmenBis: number | null, rahmenVon: number | null): string {
  if (rahmenBis === null || rahmenVon === null) return "";
  const preise = e.einheiten.map((k) => k.gesamtkosten).filter((p) => p > 0);
  if (preise.length && preise.every((p) => p > rahmenBis)) return e.global ? "Gesamtobjekt über dem Rahmen" : "alle Einheiten über dem Rahmen";
  if (preise.length && preise.every((p) => p < rahmenVon)) return e.global ? "Gesamtobjekt unter dem Rahmen" : "alle Einheiten unter dem Rahmen";
  return "keine Einheit im Rahmen";
}

/**
 * Die Objektauswahl im Kundenprofil, mit Objektscore (seit dem 04.10.2026).
 *
 * Oben die fünf besten Treffer nach Score, höchstens einer je Objekt und nur
 * aus dem Finanzierungsrahmen. Haben weniger als fünf einen Score (etwa ohne
 * Überschuss in der Selbstauskunft), werden sie mit der bisherigen
 * Reihenfolge aufgefüllt (Entfernung, dann Rahmenmitte) und tragen „n. b.“.
 * Darunter alle Objekte mit freien, angebotenen Einheiten, sortierbar nach
 * Bester Score, Entfernung, Preis und Passende zuerst. „Objektauswahl
 * vergrößern" öffnet dieselbe Liste groß. Seit dem 05.10.2026 ist die
 * Gesamtliste zu, bis jemand „Alle Objekte mit freien Einheiten anzeigen"
 * klickt, und die Score-Erklärung steht bei jedem Treffer zu. Die Regeln stehen in
 * `einheitEmpfehlung.ts` und `objektScore.ts`.
 *
 * Der Score ist intern: Er wird hier nur angezeigt, nicht gespeichert, und
 * steht in keiner Adresse.
 */
export function ObjektEmpfehlungen({ kunde, inv, minRahmen, maxRahmen, userRole, userName, onNavigate }: ObjektEmpfehlungenProps) {
  const { authUser } = useUser();
  const bereit = useCacheReady(["objekte", "wohnungen"]);
  const version = useLiveVersion(["objekte", "wohnungen", "objekt_bilder", "wohnungs_bilder", "investments"]);
  // Neu aufbauen, sobald sich Objekte, Einheiten oder Investments ändern oder geladen sind.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekte = useMemo(() => getObjekte(), [version, bereit]);
  const benutzerId = authUser?.id;
  const nutzer = useMemo(() => ({ rolle: userRole, benutzerId, name: userName }), [userRole, benutzerId, userName]);
  const rahmen = useMemo(() => finanzierungsrahmen(minRahmen, maxRahmen), [minRahmen, maxRahmen]);
  const [fensterOffen, setFensterOffen] = useState(false);

  const sa = getEigeneSaData(inv.id);
  const wohnort = wohnortAus(sa, kunde);
  const wohnortGeo = useWohnortKoordinate(inv.id, wohnort, userRole);
  const wohnortLaedt = wohnortGeo.stand === "laedt";
  const wohnortStand: WohnortStand = wohnortGeo.stand === "laedt" ? "fehlt" : wohnortGeo.stand;
  // Dieselbe Koordinate als dasselbe Objekt, sonst rechnete die Liste bei jedem Zeichnen neu.
  const wLat = wohnortGeo.koordinate?.lat;
  const wLng = wohnortGeo.koordinate?.lng;
  const wohnortKoordinate = useMemo(
    () => (wLat !== undefined && wLng !== undefined ? { lat: wLat, lng: wLng } : null),
    [wLat, wLng],
  );
  const wohnortName = wohnort ? (wohnort.ort || wohnort.plz) : undefined;

  // Nur Objekte mit mindestens einer freien Einheit brauchen eine Lage.
  const relevanteObjekte = useMemo(() => {
    const ids = new Set(
      empfehlungsKandidaten(objekte, { nutzer, kundeId: kunde.id, rahmen: null, wohnort: null, objektKoordinate: () => null })
        .map((k) => k.objektId),
    );
    return objekte.filter((o) => ids.has(o.id));
  }, [objekte, nutzer, kunde.id]);
  const objektKoordinate = useObjektKoordinaten();

  const kandidaten = useMemo(
    () => empfehlungsKandidaten(relevanteObjekte, {
      nutzer, kundeId: kunde.id, rahmen, wohnort: wohnortKoordinate, objektKoordinate,
    }),
    [relevanteObjekte, nutzer, kunde.id, rahmen, wohnortKoordinate, objektKoordinate],
  );

  /*
   * Der Score je passender Einheit. Der Kunde wird einmal vorbereitet, jede
   * Einheit einmal (siehe `objektScoreDaten.ts`), gerechnet wird nur neu,
   * wenn sich Objekte, Einheiten, Investments, Rahmen oder Wohnort ändern.
   */
  const kundeDaten = useMemo(
    () => (rahmen ? kundenScoreDaten(inv.id, kunde.id, { rahmen, wohnort: wohnortKoordinate }) : null),
    // `version` zählt mit: Ändert sich die Selbstauskunft, ändert sich der Score.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inv.id, kunde.id, rahmen, wohnortKoordinate, version],
  );
  const scores = useMemo(() => {
    const m = new Map<string, ObjektScore>();
    if (!kundeDaten) return m;
    const nachId = new Map(relevanteObjekte.map((o) => [o.id, o]));
    for (const k of kandidaten) {
      const o = nachId.get(k.objektId);
      if (k.passt && o) m.set(k.schluessel, scoreFuerKandidat(o, k, kundeDaten));
    }
    return m;
  }, [kandidaten, kundeDaten, relevanteObjekte]);
  const scoreJeObjekt = useMemo(() => {
    const m = new Map<string, ObjektScore>();
    for (const k of kandidaten) {
      const s = scores.get(k.schluessel);
      if (!s || s.wert === null) continue;
      const bisher = m.get(k.objektId);
      if (!bisher || vergleicheScore(s, bisher) < 0) m.set(k.objektId, s);
    }
    return m;
  }, [kandidaten, scores]);

  const ergebnis = empfehlungenAuswaehlen(kandidaten, { rahmen, wohnort: wohnortStand, wohnortName, anzahl: ANZAHL_EMPFEHLUNGEN });
  const treffer: Treffer[] = useMemo(() => {
    const passendJeObjekt = new Map<string, number>();
    for (const k of kandidaten) if (k.passt) passendJeObjekt.set(k.objektId, (passendJeObjekt.get(k.objektId) || 0) + 1);
    const mitScore = kandidaten
      .filter((k) => k.passt && scores.get(k.schluessel))
      .map((k) => ({ objektId: k.objektId, kandidat: k, score: scores.get(k.schluessel) as ObjektScore }));
    const beste = besteTreffer(mitScore, ANZAHL_EMPFEHLUNGEN).map((b) => ({
      kandidat: b.kandidat,
      score: b.score,
      weiterePassendeImHaus: (passendJeObjekt.get(b.objektId) || 1) - 1,
      grund: empfehlungsGrund(b.kandidat, wohnortStand, wohnortName),
    }));
    const schonDa = new Set(beste.map((b) => b.kandidat.objektId));
    const auffuellen = ergebnis.empfehlungen
      .filter((e) => !schonDa.has(e.kandidat.objektId))
      .slice(0, ANZAHL_EMPFEHLUNGEN - beste.length)
      .map((e) => ({ ...e, score: scores.get(e.kandidat.schluessel) ?? null }));
    return [...beste, ...auffuellen];
  }, [kandidaten, scores, ergebnis.empfehlungen, wohnortStand, wohnortName]);

  const liste = useMemo(() => objektListe(kandidaten, relevanteObjekte), [kandidaten, relevanteObjekte]);
  const standardSortierung: ListenSortierung = rahmen ? "score" : "entfernung";
  const [sortierung, setSortierung] = useState<ListenSortierung>(standardSortierung);
  const [nurPassende, setNurPassende] = useState(false);
  // Die Liste aller Objekte ist standardmäßig zu (05.10.2026): Oben stehen die fünf besten Treffer.
  // Beim Selbstfinanzierer gibt es ohne Rahmen keine Treffer, dann steht sie gleich offen (Christian, 05.10.2026).
  const finanziertSelbst = selbstauskunftEntfaellt(inv.id);
  const [gesamtlisteOffen, setGesamtlisteOffen] = useState(finanziertSelbst);
  useEffect(() => { if (finanziertSelbst) setGesamtlisteOffen(true); }, [finanziertSelbst]);
  // Ohne Rahmen gibt es weder Score noch Passende, dann greifen beide Sortierungen nicht.
  const wirksameSortierung: ListenSortierung = !rahmen && (sortierung === "score" || sortierung === "passende") ? "entfernung" : sortierung;
  const gesamtliste = useMemo(() => {
    const gefiltert = rahmen && nurPassende ? liste.filter((e) => e.anzahlPassend > 0) : liste;
    return sortiereObjektListe(gefiltert, wirksameSortierung, scoreJeObjekt);
  }, [liste, rahmen, nurPassende, wirksameSortierung, scoreJeObjekt]);
  const kaufpreis = rahmen ? kaufpreisRahmenUeberSaetze(rahmen, kandidaten.map((k) => k.nebenkostenProzent)) : null;

  const keinRahmenGrund: KeinRahmenGrund | null = rahmen
    ? null
    : selbstauskunftEntfaellt(inv.id) ? "finanziert_selbst" : sa ? "rahmen_negativ" : "keine_selbstauskunft";

  const bezug: KundenBezug = { rolle: userRole, kundeId: kunde.id, investmentId: inv.id, benutzerId };
  // Vorher die Adresse auf den Rückweg setzen, damit auch der Zurück-Knopf
  // des Browsers wieder hier bei der Objektauswahl landet.
  const oeffne = (pfad: string) => { rueckwegImVerlaufMerken(kunde.id, inv.id); onNavigate(pfad); };
  const vorname = (kunde.vorname || "").trim();
  const ziele = kundeDaten?.kunde.ziele ?? [];
  const zieleZeile = ziele.length ? ` · Ziele: ${zieleText(ziele)}` : "";

  const rahmenZeile = rahmen ? (
    <p className="text-[11px] text-muted-foreground" data-testid="empfehlung-rahmen">
      {/* Seit dem 23.09.2026 zählt nur der Kaufpreis (Christian). Dann wären
          Bonitäts- und Kaufpreisrahmen dieselbe Spanne; eine Zeile genügt. */}
      {NEBENKOSTEN_IM_RAHMEN ? (
        <>
          Bonitätsrahmen {spanneText(rahmen.von, rahmen.bis)}, einschließlich Kaufnebenkosten
          {kaufpreis && (
            <>
              {" · "}
              <span className="font-medium text-foreground">
                Kaufpreisrahmen {spanneText(kaufpreis.von, kaufpreis.bis)}
              </span>
              {kaufpreis.einheitlich ? "" : ", je nach Bundesland"}
            </>
          )}
        </>
      ) : (
        <>
          <span className="font-medium text-foreground">Finanzierungsrahmen {spanneText(rahmen.von, rahmen.bis)}</span>, verglichen mit dem Kaufpreis
        </>
      )}
      {zieleZeile}
    </p>
  ) : null;

  // Solange die Entfernung noch berechnet wird, gibt es nichts zu erklären.
  const hinweise = keinRahmenGrund
    ? [keinRahmenHinweis(keinRahmenGrund, wohnortLaedt ? "bekannt" : wohnortStand)]
    : wohnortLaedt ? [] : ergebnis.hinweise;

  if (!bereit && objekte.length === 0) {
    return (
      <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Objekte werden geladen…
      </p>
    );
  }

  return (
    <section className="space-y-3" aria-label="Beste Treffer und freie Objekte" data-testid="objekt-empfehlungen">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {rahmen ? `Beste Treffer${vorname ? ` für ${vorname}` : ""}` : "Freie Objekte"}
          </p>
          {rahmenZeile}
        </div>
        <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => setFensterOffen(true)}>
          <Maximize2 className="mr-1 h-3 w-3" /> Objektauswahl vergrößern
        </Button>
      </div>

      {rahmen && <ScoreHinweis />}

      {hinweise.map((h) => (
        <p key={h} className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {h}
        </p>
      ))}

      {rahmen && wohnortLaedt ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Entfernungen werden berechnet…
        </p>
      ) : treffer.length > 0 && (
        <ol className="space-y-2" data-testid="empfehlungen-liste">
          {treffer.map(({ kandidat: k, score, weiterePassendeImHaus, grund }) => {
            const link = k.wohnungId
              ? einheitOeffnenLink(k.objektId, k.wohnungId, bezug)
              : objektOeffnenLink(objekte.find((o) => o.id === k.objektId) ?? { id: k.objektId, globalObjekt: true }, bezug);
            return (
              <li
                key={k.schluessel}
                data-testid={`empfehlung-${k.schluessel}`}
                className="rounded-xl border border-primary/30 bg-primary/5 p-2.5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ScoreRing score={score} />
                    <Vorschaubild url={k.bildUrl} alt={k.objektTitel} className="h-14 w-20" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {k.objektTitel || "Objekt"}
                        <span className="font-normal text-muted-foreground">
                          {k.global ? " · Gesamtobjekt" : k.weNr ? ` · ${weNrAnzeige(k.weNr)}` : ""}
                        </span>
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{`${k.plz} ${k.ort}`.trim() || "Ort fehlt"}</span>
                      </p>
                      <p className="text-[11px] font-medium text-[hsl(var(--success))]">{grund}</p>
                      {(score?.satz || score?.warnung || score?.teilwert) && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" data-testid="score-satz">
                          {score?.satz && <span>{score.satz}</span>}
                          <ScoreChips score={score} />
                        </p>
                      )}
                      {weiterePassendeImHaus > 0 && (
                        <p className="text-[11px] text-muted-foreground">+{weiterePassendeImHaus} weitere passende im Haus</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1">
                    <div className="text-right">
                      <p className="text-sm font-bold">{eur0(k.kaufpreis)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {k.stellplatz > 0 ? `mit Stellplatz ${eur0(k.stellplatz)}, ` : ""}gesamt {eur0(k.gesamtkosten)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" onClick={() => oeffne(link)}>
                      <Eye className="h-3 w-3" /> {k.wohnungId ? "Einheit öffnen" : "Objekt öffnen"}
                    </Button>
                  </div>
                </div>
                {score && score.wert !== null && (
                  // Bei jedem Treffer zu, auch beim ersten (05.10.2026); aufgeklappt wird nur auf Klick.
                  <ScoreWarum score={score} ziele={ziele} saStand={kundeDaten?.saStand} className="mt-2 sm:ml-[54px]" />
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={gesamtlisteOffen}
            onClick={() => setGesamtlisteOffen((o) => !o)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", gesamtlisteOffen && "rotate-90")} />
            Alle Objekte mit freien Einheiten {gesamtlisteOffen ? "ausblenden" : "anzeigen"} ({gesamtliste.length})
          </button>
          {gesamtlisteOffen && <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Switch id="empfehlung-nur-passende" checked={!!rahmen && nurPassende} onCheckedChange={setNurPassende} disabled={!rahmen} className="scale-75" />
              <Label htmlFor="empfehlung-nur-passende" className="text-[11px] text-muted-foreground">Nur passende</Label>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-border bg-background/70" role="group" aria-label="Sortierung">
              {LISTEN_SORTIERUNGEN.map((s) => {
                const gesperrt = !rahmen && (s.wert === "score" || s.wert === "passende");
                return (
                  <button
                    key={s.wert}
                    type="button"
                    data-no-min
                    disabled={gesperrt}
                    aria-pressed={wirksameSortierung === s.wert}
                    onClick={() => setSortierung(s.wert)}
                    className={cn(
                      "border-l border-border px-2.5 py-1 text-[11px] first:border-l-0 disabled:opacity-40",
                      wirksameSortierung === s.wert ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>}
        </div>
        {!gesamtlisteOffen ? null : gesamtliste.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {rahmen && nurPassende ? "Kein Objekt hat eine passende freie Einheit." : "Keine freien Einheiten im Angebot."}
          </p>
        ) : (
          <div className="max-h-[296px] space-y-1.5 overflow-y-auto pr-1" data-testid="gesamtliste">
            {gesamtliste.map((e) => {
              const passt = e.anzahlPassend > 0;
              const entfernung = entfernungZeile(e.entfernungKm, wohnortStand, wohnortName);
              const bester = scoreJeObjekt.get(e.objektId);
              const besteEinheit = bester ? e.einheiten.find((k) => scores.get(k.schluessel) === bester) : undefined;
              const zusatz = passt
                ? (besteEinheit && !besteEinheit.global && besteEinheit.weNr ? `bester Wert ${weNrAnzeige(besteEinheit.weNr)}` : "")
                : ohnePassendeText(e, rahmen?.bis ?? null, rahmen?.von ?? null);
              return (
                <button
                  key={e.objektId}
                  type="button"
                  data-testid={`gesamtliste-${e.objektId}`}
                  data-passt={passt ? "ja" : "nein"}
                  onClick={() => oeffne(objektOeffnenLink(e.objekt, bezug))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/30",
                    passt ? "border-primary/40 bg-primary/5" : "border-border",
                  )}
                >
                  {rahmen && (
                    <ScoreRing
                      klein
                      score={bester ?? { wert: null, keinScore: passt ? "belastung_fehlt" : "ausserhalb_rahmen" }}
                    />
                  )}
                  <Vorschaubild url={e.bildUrl} alt={e.titel} className="h-10 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.titel || "Objekt"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[`${e.plz} ${e.ort}`.trim(), entfernung, zusatz].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex justify-end gap-1">
                      {e.global ? (
                        <Badge variant="outline" className="text-[10px]">Gesamtobjekt</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">{e.einheiten.length} frei</Badge>
                      )}
                      {passt && (
                        <Badge className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                          {e.global ? "passt" : `${e.anzahlPassend} passend`}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{spanneText(e.preisVon, e.preisBis) || "Preis fehlt"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {gesamtlisteOffen && wirksameSortierung === "score" && (
          <p className="text-[10px] text-muted-foreground">
            Sortiert nach dem besten Score je Objekt. Objekte ohne passende Einheit stehen danach, untereinander nach Entfernung.
          </p>
        )}
      </div>

      <ObjektauswahlFenster
        // Kommt ein Rahmen hinzu oder fällt er weg, beginnt das Fenster mit der passenden Sortierung.
        key={standardSortierung}
        offen={fensterOffen}
        onOffenChange={setFensterOffen}
        titel={`Objektauswahl${vorname ? ` für ${vorname}` : ""}`}
        kopfzeile={rahmenZeile}
        liste={liste}
        rahmenVorhanden={!!rahmen}
        standardSortierung={standardSortierung}
        scores={scores}
        scoreJeObjekt={scoreJeObjekt}
        wohnortStand={wohnortStand}
        wohnortName={wohnortName}
        entfernungLaedt={wohnortLaedt}
        bezug={bezug}
        onNavigate={(pfad) => { setFensterOffen(false); oeffne(pfad); }}
      />
    </section>
  );
}
