import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ObjektWohnung } from "@/lib/objekteStore";
import {
  filtereEinheiten, sortiereEinheiten, istEinheitInaktiv, zaehleEinheiten,
  einheitTabellenWerte, type EinheitenSortFeld, type SortRichtung,
} from "@/lib/objektKennzahlen";
import {
  belegungsAnzeige, belegungsText, darfEinheitOeffnen, empfohleneZuerst, istEmpfohlen, nachBelegungGeordnet,
  type BelegungsKontext,
} from "@/lib/einheitBelegung";
import { cn } from "@/lib/utils";
import { EinheitStatusChip, Hinweis, KartenTitel } from "./Bausteine";
import { BelegungsAngaben, EmpfohlenAbzeichen } from "./BelegungsAngaben";
import { PassendeKundenChip } from "./PassendeKundenChip";
import { ScoreRing } from "@/components/objektscore/ScoreAnzeige";
import type { PassendeKunden } from "@/lib/objektScoreDaten";
import type { ObjektScore } from "@/lib/objektScore";

/**
 * Die Einheitentabelle der Objektseite.
 *
 * Auf dem Desktop eine sortierbare Tabelle, auf dem Handy dieselben Daten als
 * Kartenliste. Verkaufte Einheiten bleiben sichtbar, aber ausgegraut.
 *
 * Seit dem 23.09.2026 laesst sich nur noch eine freie Einheit oeffnen, auch
 * eine vorgemerkte. Bei reservierten und verkauften gibt es keinen Knopf
 * „Einheit öffnen" mehr, und ein Klick auf die Zeile tut nichts, fuer jede
 * Rolle. Dafuer steht in der Spalte „Kunde / VP", wer reserviert hat und
 * wann; die Namen nur fuer die, die sie sehen duerfen (`belegungsAnzeige`).
 *
 * Was noch zu haben ist, steht oben. Die Blockbildung aus `einheitBelegung`
 * laeuft vor der gewaehlten Spalte, die Spalte sortiert innerhalb des Blocks.
 * Einzige Ausnahme ist die Spalte „Status" selbst: Wer sie anklickt, hat
 * ausdruecklich nach einer Reihenfolge nach Status gefragt und bekommt sie,
 * sonst waere der Spaltenkopf ein Knopf ohne Wirkung. Empfohlene Einheiten
 * stehen in jedem Fall oben unter den freien.
 */

/*
 * Die Spalten beider Einheitentabellen, auch „Weitere Einheiten in diesem
 * Haus" auf der Einheitsseite. Die Rendite (seit dem 24.09.2026) ist
 * dieselbe wie in den Kacheln: Jahreskaltmiete durch Kaufpreis.
 */
const SPALTEN: Array<{ feld: EinheitenSortFeld; label: string; rechts?: boolean }> = [
  { feld: "weNr", label: "WE-Nr." },
  { feld: "etage", label: "Etage" },
  { feld: "zimmer", label: "Zimmer", rechts: true },
  { feld: "groesse", label: "Fläche", rechts: true },
  { feld: "vkGesamt", label: "Kaufpreis", rechts: true },
  { feld: "preisJeQm", label: "je m²", rechts: true },
  { feld: "mieteGesamt", label: "Kaltmiete", rechts: true },
  { feld: "rendite", label: "Rendite", rechts: true },
  { feld: "status", label: "Status" },
];

export function EinheitenTabelle({ wohnungen, onOeffnen, kontext, empfohleneIds, passendeKunden, kundenScores }: {
  wohnungen: ObjektWohnung[];
  onOeffnen: (w: ObjektWohnung) => void;
  /**
   * Der angemeldete Nutzer: Sein eigener Vorgang steht oben im grauen Block,
   * und an ihm haengt, ob er Kunde und Partner sieht. Ohne ihn keine Namen.
   */
  kontext?: BelegungsKontext;
  /**
   * Die Einheiten, die die Empfehlungsliste vorschlaegt. Nur freie davon
   * tragen das Abzeichen „empfohlen" und stehen oben unter den freien.
   */
  empfohleneIds?: ReadonlySet<string>;
  /**
   * Objektscore, seit dem 04.10.2026, nur intern: die passenden Kunden je
   * freier Einheit. Die Spalte „Kunde / VP“ zeigt bei freien Einheiten dann
   * den Chip „3 Kunden · 86“, oben steht der Zähler. Fehlt der Wert, bleibt
   * die Spalte wie bisher (Rolle ohne Recht, Globalobjekt).
   */
  passendeKunden?: PassendeKunden;
  /**
   * Der Score je Einheit für den Kunden aus der Leiste „Auswahl für …“. Geht
   * vor `passendeKunden`: Wer für einen Kunden auswählt, will dessen Wert sehen.
   */
  kundenScores?: ReadonlyMap<string, ObjektScore>;
}) {
  const [nurFreie, setNurFreie] = useState(false);
  const [feld, setFeld] = useState<EinheitenSortFeld>("weNr");
  const [richtung, setRichtung] = useState<SortRichtung>("asc");

  const zaehler = zaehleEinheiten(wohnungen);
  const zeilen = useMemo(() => {
    const sortiert = sortiereEinheiten(filtereEinheiten(wohnungen, nurFreie), feld, richtung);
    const geblockt = feld === "status" ? sortiert : nachBelegungGeordnet(sortiert, kontext);
    return empfohleneZuerst(geblockt, empfohleneIds);
  }, [wohnungen, nurFreie, feld, richtung, kontext, empfohleneIds]);
  // Einmal je Zeichnen: Ob eine Vormerkung noch gilt, misst sich an diesem Zeitpunkt.
  const jetzt = new Date();
  // Die Sicherung an der Quelle: Auch ein Aufruf an der Zeile vorbei oeffnet
  // keine belegte Einheit.
  const oeffne = (w: ObjektWohnung) => { if (darfEinheitOeffnen(w)) onOeffnen(w); };

  const sortiere = (f: EinheitenSortFeld) => {
    if (f === feld) setRichtung((r) => (r === "asc" ? "desc" : "asc"));
    else { setFeld(f); setRichtung("asc"); }
  };
  const SortIcon = ({ f }: { f: EinheitenSortFeld }) => {
    if (f !== feld) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return richtung === "asc" ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
  };
  const sortLabel = SPALTEN.find((s) => s.feld === feld)?.label || "";

  return (
    <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <KartenTitel
        zusatz={`${zaehler.gesamt} Einheiten, ${zaehler.frei} frei`}
        rechts={
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="nur-freie" checked={nurFreie} onCheckedChange={setNurFreie} />
              <Label htmlFor="nur-freie" className="text-sm">Nur freie Einheiten</Label>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">Sortiert nach {sortLabel}</span>
          </div>
        }
      >
        Wohneinheiten
      </KartenTitel>

      {passendeKunden && !kundenScores && (
        <div className="mb-2.5 flex flex-wrap gap-2" data-testid="passende-kunden-zaehler">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-px text-[10px] font-semibold text-primary">
            {passendeKunden.kundenMitTreffer === 1 ? "Für 1 Kunden passt mindestens eine Einheit" : `Für ${passendeKunden.kundenMitTreffer} Kunden passt mindestens eine Einheit`}
          </span>
          {passendeKunden.nichtBewertet > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-px text-[10px] font-semibold text-muted-foreground">
              {passendeKunden.nichtBewertet === 1 ? "1 Kunde ohne vollständige Selbstauskunft nicht bewertet" : `${passendeKunden.nichtBewertet} Kunden ohne vollständige Selbstauskunft nicht bewertet`}
            </span>
          )}
        </div>
      )}

      {/*
        Desktop: Tabelle. Mit der Spalte Rendite (24.09.2026) passte sie bei
        1440 px nicht mehr in die Karte, der Knopf „Einheit öffnen“ lief
        rechts hinaus. Der schmalere Zellrand holt die Breite zurück.
      */}
      <div className="hidden overflow-x-auto md:block">
        <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
          <TableHeader>
            <TableRow>
              {SPALTEN.map((s) => (
                <TableHead key={s.feld} className={cn("cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-wide", s.rechts && "text-right")}
                  onClick={() => sortiere(s.feld)} aria-sort={s.feld === feld ? (richtung === "asc" ? "ascending" : "descending") : "none"}>
                  {s.label}<SortIcon f={s.feld} />
                </TableHead>
              ))}
              <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide">Kunde / VP</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {zeilen.map((w) => {
              const inaktiv = istEinheitInaktiv(w);
              const oeffenbar = darfEinheitOeffnen(w);
              const werte = einheitTabellenWerte(w);
              return (
                <TableRow key={w.id} data-testid={`einheit-${w.id}`} data-inaktiv={inaktiv ? "true" : "false"}
                  data-oeffenbar={oeffenbar ? "true" : "false"}
                  className={cn(inaktiv && "opacity-50", oeffenbar && "cursor-pointer hover:bg-muted/50")}
                  title={oeffenbar ? undefined : `${belegungsText(w)}, nicht zu öffnen`}
                  onClick={() => oeffne(w)}>
                  <TableCell className="font-semibold">{w.weNr}</TableCell>
                  <TableCell className="whitespace-nowrap">{werte.etage}</TableCell>
                  <TableCell className="text-right">{werte.zimmer}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{werte.flaeche}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold">{werte.kaufpreis}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{werte.jeQm}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{werte.kaltmiete}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums" data-testid={`rendite-${w.id}`}>{werte.rendite}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <EinheitStatusChip status={w.status} />
                      {istEmpfohlen(w, empfohleneIds) && <EmpfohlenAbzeichen />}
                    </div>
                  </TableCell>
                  <TableCell><KundeVpZelle w={w} anzeige={belegungsAnzeige(w, kontext, jetzt)} passendeKunden={passendeKunden} kundenScores={kundenScores} onOeffnen={oeffne} /></TableCell>
                  <TableCell className="text-right">
                    {oeffenbar && (
                      <Button type="button" size="sm" variant="outline" className="gap-1.5"
                        onClick={(e) => { e.stopPropagation(); oeffne(w); }}>
                        <Eye className="h-3.5 w-3.5" /> Einheit öffnen
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {zeilen.length === 0 && (
              <TableRow><TableCell colSpan={SPALTEN.length + 2} className="py-6 text-center text-sm text-muted-foreground">
                {nurFreie ? "Keine freie Einheit." : "Für dieses Objekt sind noch keine Einheiten angelegt."}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobil: Kartenliste */}
      <div className="space-y-2 md:hidden">
        <div className="flex flex-wrap gap-1.5">
          {SPALTEN.filter((s) => ["weNr", "vkGesamt", "groesse", "mieteGesamt"].includes(s.feld)).map((s) => (
            // data-no-min und min-h-[40px]: Die Handyregel für Pillen drückte die Sortierknöpfe auf 32 px.
            <button key={s.feld} type="button" onClick={() => sortiere(s.feld)} data-no-min
              className={cn("min-h-[40px] rounded-full border px-3 py-1 text-xs font-medium", s.feld === feld ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground")}>
              {s.label}{s.feld === feld && (richtung === "asc" ? " ↑" : " ↓")}
            </button>
          ))}
        </div>
        {zeilen.map((w) => {
          const inaktiv = istEinheitInaktiv(w);
          const oeffenbar = darfEinheitOeffnen(w);
          const werte = einheitTabellenWerte(w);
          return (
            <div key={w.id} data-testid={`einheit-karte-${w.id}`} className={cn("rounded-xl border border-border/60 p-3", inaktiv && "opacity-50")}>
              <div className="flex items-center justify-between gap-2">
                <div><span className="font-semibold">{w.weNr}</span>{w.etage && <span className="ml-1 text-xs text-muted-foreground">· {werte.etage}</span>}</div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {istEmpfohlen(w, empfohleneIds) && <EmpfohlenAbzeichen />}
                  <EinheitStatusChip status={w.status} />
                </div>
              </div>
              <div className="mt-1 text-sm"><span className="font-semibold">{werte.kaufpreis}</span>{werte.jeQm && <span className="text-muted-foreground"> · {werte.jeQm} je m²</span>}</div>
              <div className="text-xs text-muted-foreground">
                {[werte.zimmer ? `${werte.zimmer} Zimmer` : "", werte.flaeche, werte.kaltmiete ? `Kaltmiete ${werte.kaltmiete}` : "", werte.rendite ? `Rendite ${werte.rendite}` : ""].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1.5"><KundeVpZelle w={w} anzeige={belegungsAnzeige(w, kontext, jetzt)} passendeKunden={passendeKunden} kundenScores={kundenScores} onOeffnen={oeffne} /></div>
              {oeffenbar && (
                <Button type="button" size="sm" variant="outline" className="mt-2 h-10 w-full gap-1.5" onClick={() => oeffne(w)}>
                  <Eye className="h-3.5 w-3.5" /> Einheit öffnen
                </Button>
              )}
            </div>
          );
        })}
        {zeilen.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{nurFreie ? "Keine freie Einheit." : "Noch keine Einheiten angelegt."}</p>}
      </div>

      <Hinweis>
        Klick auf eine freie Einheit oder auf „Einheit öffnen" führt zur Seite der Wohnung mit Galerie, Kennzahlen und Exposé.
        Reservierte und verkaufte Einheiten lassen sich nicht öffnen.
        Freie Einheiten stehen oben{empfohleneIds && empfohleneIds.size > 0 ? ", die empfohlenen zuerst" : ""}, belegte darunter, verkaufte ganz am Ende. Spaltenkopf klicken sortiert innerhalb dieser Blöcke.
        {(passendeKunden || kundenScores) && " Objektscore: interne Sortierhilfe, nicht für den Kunden bestimmt. Gezählt werden nur Kunden, die du sehen darfst."}
      </Hinweis>
    </div>
  );
}

/**
 * Die Spalte „Kunde / VP“. Belegte und vorgemerkte Einheiten zeigen wie
 * bisher Kunde, Partner und Datum. Bei freien steht, sofern hereingereicht,
 * der Score des gewählten Kunden oder der Chip der passenden Kunden.
 */
function KundeVpZelle({ w, anzeige, passendeKunden, kundenScores, onOeffnen }: {
  w: ObjektWohnung;
  anzeige: ReturnType<typeof belegungsAnzeige>;
  passendeKunden?: PassendeKunden;
  kundenScores?: ReadonlyMap<string, ObjektScore>;
  onOeffnen: (w: ObjektWohnung) => void;
}) {
  if (anzeige.art !== "frei") return <BelegungsAngaben anzeige={anzeige} />;
  if (kundenScores) {
    const score = kundenScores.get(w.id);
    return <ScoreRing klein score={score ?? { wert: null, keinScore: "ausserhalb_rahmen" }} />;
  }
  if (passendeKunden) {
    return <PassendeKundenChip treffer={passendeKunden.jeEinheit.get(w.id) ?? []} weNr={w.weNr} onEinheitOeffnen={() => onOeffnen(w)} />;
  }
  return null;
}

/**
 * „Weitere Einheiten in diesem Haus" auf der Einheitsseite.
 *
 * Seit dem 24.09.2026 mit denselben Spalten, Werten und Schreibweisen wie
 * die Wohneinheiten-Tabelle der Objektseite, aus `SPALTEN` und
 * `einheitTabellenWerte`. Die Spalte „Kunde / VP" fehlt bewusst: Sie hängt
 * an Rollenrechten und gehört auf die Objektseite. Sortiert wird nicht, die
 * Liste steht nach WE-Nummer (`weitereEinheiten`).
 *
 * Die aktuelle Einheit ist hervorgehoben, ein Klick auf eine andere Zeile
 * wechselt zu ihr. Auf dem Handy bleiben WE-Nr., Kaufpreis, Rendite und
 * Status, der Rest kommt ab sm bzw. md dazu; wird es trotzdem zu eng,
 * scrollt die Tabelle in ihrer Karte, nicht die Seite.
 */
const WEITERE_AB: Partial<Record<EinheitenSortFeld, string>> = {
  etage: "hidden md:table-cell",
  zimmer: "hidden md:table-cell",
  groesse: "hidden sm:table-cell",
  preisJeQm: "hidden md:table-cell",
  mieteGesamt: "hidden sm:table-cell",
};

export function WeitereEinheitenTabelle({ wohnungen, aktuelleId, onWechsel }: {
  wohnungen: ObjektWohnung[];
  /** Die Einheit, deren Seite gerade offen ist. */
  aktuelleId: string;
  onWechsel: (w: ObjektWohnung) => void;
}) {
  return (
    <Table data-testid="weitere-einheiten-tabelle">
      <TableHeader>
        <TableRow>
          {SPALTEN.map((s) => (
            <TableHead key={s.feld} className={cn("whitespace-nowrap px-2 text-[11px] uppercase tracking-wide sm:px-4", s.rechts && "text-right", WEITERE_AB[s.feld])}>
              {s.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {wohnungen.map((e) => {
          const werte = einheitTabellenWerte(e);
          const zelle = (feld: EinheitenSortFeld, rechts = true) => cn("whitespace-nowrap px-2 sm:px-4", rechts && "text-right", WEITERE_AB[feld]);
          return (
            <TableRow key={e.id} data-testid={`weitere-${e.id}`} data-aktuell={e.id === aktuelleId ? "true" : "false"}
              className={e.id === aktuelleId ? "bg-accent" : "cursor-pointer hover:bg-muted/50"}
              onClick={() => { if (e.id !== aktuelleId) onWechsel(e); }}>
              <TableCell className="px-2 font-semibold sm:px-4">{e.weNr}</TableCell>
              <TableCell className={zelle("etage", false)}>{werte.etage}</TableCell>
              <TableCell className={zelle("zimmer")}>{werte.zimmer}</TableCell>
              <TableCell className={zelle("groesse")}>{werte.flaeche}</TableCell>
              <TableCell className={cn(zelle("vkGesamt"), "font-semibold")}>{werte.kaufpreis}</TableCell>
              <TableCell className={zelle("preisJeQm")}>{werte.jeQm}</TableCell>
              <TableCell className={zelle("mieteGesamt")}>{werte.kaltmiete}</TableCell>
              <TableCell className={cn(zelle("rendite"), "tabular-nums")} data-testid={`weitere-rendite-${e.id}`}>{werte.rendite}</TableCell>
              <TableCell className="px-2 sm:px-4"><EinheitStatusChip status={e.status} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
