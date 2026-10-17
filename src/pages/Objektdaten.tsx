import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MieterDialog } from "@/components/mieter/MieterDialog";
import { Einheitenliste } from "@/components/objektdaten/Einheitenliste";
import { getMieter, type Mieter } from "@/lib/mieterStore";
import { listendatenFuerEinheit } from "@/lib/listendaten";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { cn } from "@/lib/utils";
import { getObjekte, type ObjektData } from "@/lib/objekteStore";
import {
  EINHEIT_FAECHER, OBJEKT_FAECHER, OBJEKTDATEN_EINHEITEN_ROUTE, OBJEKTDATEN_VOLLSTAENDIGKEIT_ROUTE,
  einheitZeile, einheitenSumme, mieterZeilen, objekteFuerRolle, objektVollstaendigkeit,
} from "@/lib/objektdaten";

/*
 * Die Gruppe „Objektdaten“ (17.10.2026): Objektcockpit, Einheitenliste,
 * Mieter und Vollständigkeit. Alle drei lesen dieselben Objekte wie die Objektseite und
 * speichern nichts. Gerechnet wird in `src/lib/objektdaten.ts`.
 */

export type ObjektdatenAnsicht = "cockpit" | "einheiten" | "mieter" | "vollstaendigkeit";

const ALLE = "__alle__";

const eur = (n: number | null, stellen = 0) =>
  n === null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) + " €";
const prozent = (n: number | null) =>
  n === null ? "–" : (n * 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";

function Kennzahl({ titel, wert }: { titel: string; wert: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{titel}</div>
        <div className="text-lg font-semibold tabular-nums whitespace-nowrap">{wert}</div>
      </CardContent>
    </Card>
  );
}

function Balken({ anteil }: { anteil: number }) {
  const farbe = anteil >= 0.8 ? "bg-emerald-500" : anteil >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", farbe)} style={{ width: `${Math.round(anteil * 100)}%` }} /></div>
      <span className="text-xs tabular-nums">{Math.round(anteil * 100)} %</span>
    </div>
  );
}

function Haken({ ja }: { ja: boolean }) {
  return ja
    ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="vorhanden" />
    : <X className="mx-auto h-4 w-4 text-red-500" aria-label="fehlt" />;
}

export default function Objektdaten({ ansicht }: { ansicht: ObjektdatenAnsicht }) {
  const { user, authUser } = useUser();
  const stand = useLiveVersion(["objekte", "wohnungen", "objekt_dokumente", "wohnungs_dokumente", "objekt_bilder", "wohnungs_bilder"]);
  const [params, setParams] = useSearchParams();
  const [suche, setSuche] = useState("");

  const objekte = useMemo(
    () => objekteFuerRolle(getObjekte(), user.role, authUser?.id).sort((a, b) => a.titel.localeCompare(b.titel, "de")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stand, user.role, authUser?.id],
  );
  const objektId = params.get("objekt") || ALLE;
  const gewaehlt = objekte.filter((o) => objektId === ALLE || o.id === objektId);

  const objektWahl = (
    <Select value={objektId} onValueChange={(v) => setParams(v === ALLE ? {} : { objekt: v })}>
      <SelectTrigger className="w-full sm:w-[320px]"><SelectValue placeholder="Alle Objekte" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALLE}>Alle Objekte ({objekte.length})</SelectItem>
        {objekte.map((o) => <SelectItem key={o.id} value={o.id}>{o.titel} ({o.wohnungen.length} WE)</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {ansicht === "cockpit" && <Cockpit objekte={objekte} suche={suche} setSuche={setSuche} />}
        {ansicht === "einheiten" && <Einheitenliste objekte={gewaehlt} objektWahl={objektWahl} />}
        {ansicht === "mieter" && <MieterListe objekte={gewaehlt} objektWahl={objektWahl} />}
        {ansicht === "vollstaendigkeit" && <Vollstaendigkeit objekte={gewaehlt} objektWahl={objektWahl} einzeln={objektId !== ALLE} />}
      </div>
    </DashboardLayout>
  );
}

function Cockpit({ objekte, suche, setSuche }: { objekte: ObjektData[]; suche: string; setSuche: (s: string) => void }) {
  const q = suche.trim().toLocaleLowerCase("de-DE");
  const liste = objekte.filter((o) => !q || `${o.titel} ${o.adresse} ${o.plz} ${o.ort}`.toLocaleLowerCase("de-DE").includes(q));
  return (
    <>
      <PageHeader title="Objektcockpit" subtitle="Alle Objekte mit Verkaufsstand und Vollständigkeit der Unterlagen" />
      <Input placeholder="Objekt, Straße oder Ort suchen" value={suche} onChange={(e) => setSuche(e.target.value)} className="w-full sm:w-[320px]" />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Objekt</TableHead>
                <TableHead className="text-right">Einheiten</TableHead>
                <TableHead className="text-right">frei</TableHead>
                <TableHead className="text-right">reserviert</TableHead>
                <TableHead className="text-right">verkauft</TableHead>
                <TableHead className="text-right">Kaufpreise gesamt</TableHead>
                <TableHead className="text-right">Mietrendite</TableHead>
                <TableHead>Unterlagen</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liste.map((o) => {
                const s = einheitenSumme(o.wohnungen.map(einheitZeile));
                const v = objektVollstaendigkeit(o, listenwerte);
                return (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link to={`/objekte/${o.id}`} className="font-medium hover:underline">{o.titel}</Link>
                      <div className="text-xs text-muted-foreground">{[o.adresse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.einheiten}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.frei}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.reserviert}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.verkauft}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{eur(s.kaufpreis || null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{prozent(s.rendite)}</TableCell>
                    <TableCell><Balken anteil={v.anteil} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <Link to={`${OBJEKTDATEN_EINHEITEN_ROUTE}?objekt=${o.id}`} className="text-primary hover:underline">Einheiten</Link>
                      {" · "}
                      <Link to={`${OBJEKTDATEN_VOLLSTAENDIGKEIT_ROUTE}?objekt=${o.id}`} className="text-primary hover:underline">Lücken</Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {liste.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Keine Objekte gefunden.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Vollstaendigkeit({ objekte, objektWahl, einzeln }: { objekte: ObjektData[]; objektWahl: React.ReactNode; einzeln: boolean }) {
  const [nurLuecken, setNurLuecken] = useState(false);
  return (
    <>
      <PageHeader title="Vollständigkeit" subtitle="Welche Unterlagen und Bilder je Objekt und Einheit noch fehlen" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {objektWahl}
        {einzeln && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={nurLuecken} onChange={(e) => setNurLuecken(e.target.checked)} /> nur Einheiten mit Lücken
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Geprüft werden die Unterlagenfächer aus dem Objektformular. „Liste“ heißt: Die Excel-Liste meldet die Unterlage als vorhanden, im CRM liegt aber noch keine Datei. Welche Unterlagen für den Vertriebsstart Pflicht sind, ist noch nicht festgelegt; bis dahin zählt jedes Fach gleich.
      </p>
      {einzeln && objekte[0]
        ? <VollstaendigkeitObjekt objekt={objekte[0]} nurLuecken={nurLuecken} />
        : <VollstaendigkeitUebersicht objekte={objekte} />}
    </>
  );
}

function VollstaendigkeitUebersicht({ objekte }: { objekte: ObjektData[] }) {
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Objekt</TableHead>
              <TableHead>gesamt</TableHead>
              <TableHead className="text-right">Objektunterlagen</TableHead>
              {EINHEIT_FAECHER.map((f) => <TableHead key={f} className="text-right whitespace-nowrap">fehlt: {f}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {objekte.map((o) => {
              const v = objektVollstaendigkeit(o, listenwerte);
              return (
                <TableRow key={o.id}>
                  <TableCell><Link to={`${OBJEKTDATEN_VOLLSTAENDIGKEIT_ROUTE}?objekt=${o.id}`} className="font-medium hover:underline">{o.titel}</Link></TableCell>
                  <TableCell><Balken anteil={v.anteil} /></TableCell>
                  <TableCell className="text-right tabular-nums">{v.vorhanden} von {v.gesamt}</TableCell>
                  {EINHEIT_FAECHER.map((f) => (
                    <TableCell key={f} className={cn("text-right tabular-nums", v.fehlendJeFach[f] > 0 && "text-red-600 font-medium")}>
                      {v.einheiten.length === 0 ? "–" : v.fehlendJeFach[f]}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function VollstaendigkeitObjekt({ objekt, nurLuecken }: { objekt: ObjektData; nurLuecken: boolean }) {
  const v = objektVollstaendigkeit(objekt, listenwerte);
  const einheiten = v.einheiten.filter((e) => !nurLuecken || e.vorhanden < e.gesamt);
  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 text-sm font-semibold">Objektunterlagen: {v.vorhanden} von {v.gesamt}</div>
          <div className="flex flex-wrap gap-2">
            {OBJEKT_FAECHER.map((f) => (
              <span key={f} className={cn("rounded-full px-2.5 py-1 text-xs", v.faecher[f] ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                {v.faecher[f] ? "✓" : "fehlt:"} {f}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Einheit</TableHead>
                {EINHEIT_FAECHER.map((f) => <TableHead key={f} className="text-center whitespace-nowrap">{f}</TableHead>)}
                <TableHead className="text-right">Stand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {einheiten.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    <Link to={`/objekte/${objekt.id}/einheiten/${e.id}`} className="hover:underline">{e.weNr || "ohne Nr."}</Link>
                  </TableCell>
                  {EINHEIT_FAECHER.map((f) => (
                    <TableCell key={f}>
                      {e.lautListe[f]
                        ? <span className="mx-auto block w-fit rounded bg-amber-50 px-1.5 text-[11px] text-amber-700" title="Laut Excel-Liste vorhanden, aber keine Datei im CRM. Bitte hochladen.">Liste</span>
                        : <Haken ja={e.faecher[f]} />}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{e.vorhanden} von {e.gesamt}</TableCell>
                </TableRow>
              ))}
              {einheiten.length === 0 && (
                <TableRow><TableCell colSpan={EINHEIT_FAECHER.length + 2} className="py-8 text-center text-sm text-muted-foreground">
                  {v.einheiten.length === 0 ? "Keine Einheiten erfasst." : "Alle Einheiten vollständig."}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

/** Listendaten einer Einheit für die Vollständigkeit (Häkchen „Unterlage vorhanden“ der Excel-Listen). */
const listenwerte = (wohnungId: string) => listendatenFuerEinheit(wohnungId)?.werte || {};

const datum = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso || "–");

const MIETER_STATUS: Record<Mieter["status"], string> = { aktiv: "aktiv", neu: "neu", gekuendigt: "gekündigt", ausgezogen: "ausgezogen" };

function MieterListe({ objekte, objektWahl }: { objekte: ObjektData[]; objektWahl: React.ReactNode }) {
  // Bei jedem Zeichnen frisch: nach dem Speichern steht der Mieter sofort im Cache.
  useLiveVersion(["mieter"]);
  const mieter = getMieter();
  const [dialog, setDialog] = useState<{ mieter: Mieter | null; vorgabe?: { objektId: string; wohneinheitId: string } } | null>(null);
  const [, neuZeichnen] = useState(0);
  const { user } = useUser();
  const mieterAkte = ["admin", "inhaber", "hausverwaltung"].includes(user.role);
  const mehrere = objekte.length > 1;
  const zeilen = objekte.flatMap((o) => mieterZeilen(o, mieter).map((z) => ({ objekt: o, z })));
  const vermietet = zeilen.filter((x) => x.z.mieter).length;
  return (
    <>
      <PageHeader title="Mieter & Mietverträge" subtitle="Wer wohnt in welcher Einheit, seit wann, zu welcher Miete" />
      {objektWahl}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kennzahl titel="Einheiten" wert={String(zeilen.length)} />
        <Kennzahl titel="mit Mieter" wert={String(vermietet)} />
        <Kennzahl titel="ohne Mietvertrag" wert={String(zeilen.filter((x) => x.z.mieter && !x.z.vertragVorhanden).length)} />
        <Kennzahl titel="Miete abweichend" wert={String(zeilen.filter((x) => x.z.mieteAbweichend).length)} />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {mehrere && <TableHead>Objekt</TableHead>}
                <TableHead>WE</TableHead>
                <TableHead>Lage</TableHead>
                <TableHead>Mieter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Beginn</TableHead>
                <TableHead>befristet bis</TableHead>
                <TableHead className="text-right">Kaltmiete</TableHead>
                <TableHead className="text-right">NK</TableHead>
                <TableHead className="text-right">Kaution</TableHead>
                <TableHead className="text-center">Vertrag</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zeilen.map(({ objekt, z }) => {
                const m = z.mieter;
                return (
                  <TableRow key={z.wohnungId}>
                    {mehrere && <TableCell className="whitespace-nowrap text-xs">{objekt.titel}</TableCell>}
                    <TableCell className="whitespace-nowrap font-medium">
                      <Link to={`/objekte/${objekt.id}/einheiten/${z.wohnungId}`} className="hover:underline">{z.weNr || "ohne Nr."}</Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{z.lage || "–"}</TableCell>
                    {m ? (
                      <>
                        <TableCell className="whitespace-nowrap">
                          {/* Die Mieterakte gehört zur Hausverwaltung; ohne deren Seiten nur der Name. */}
                          {mieterAkte ? <Link to={`/mieter/${m.id}`} className="hover:underline">{m.nachname}, {m.vorname}</Link> : `${m.nachname}${m.vorname ? `, ${m.vorname}` : ""}`}
                        </TableCell>
                        <TableCell className="text-xs">{MIETER_STATUS[m.status]}</TableCell>
                        <TableCell className="tabular-nums text-xs">{datum(m.mietvertragBeginn)}</TableCell>
                        <TableCell className="tabular-nums text-xs">{m.mietvertragEnde ? datum(m.mietvertragEnde) : "unbefristet"}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {z.mieteAbweichend && (
                            <span title={`An der Einheit stehen ${eur(z.mieteEinheit, 2)}`}>
                              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-500" aria-label="weicht von der Miete an der Einheit ab" />
                            </span>
                          )}
                          {eur(m.kaltmiete || null, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{eur(m.nebenkosten || null, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{eur(m.kaution || null, 2)}</TableCell>
                        <TableCell><Haken ja={z.vertragVorhanden} /></TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={() => setDialog({ mieter: m })}>Bearbeiten</Button></TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell colSpan={7} className="text-xs text-muted-foreground">kein Mieter erfasst</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">–</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setDialog({ mieter: null, vorgabe: { objektId: objekt.id, wohneinheitId: z.wohnungId } })}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Mieter
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
              {zeilen.length === 0 && (
                <TableRow><TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">Keine Einheiten erfasst.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Mieterdaten sehen nur Admin, Inhaber, Backoffice, Hausverwaltung und der Objektpartner an seinen Objekten. Das Warnzeichen heißt: Die Kaltmiete am Mieter weicht von der Miete an der Einheit ab, die der Vertrieb sieht.
      </p>
      <MieterDialog
        open={!!dialog}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        mieter={dialog?.mieter}
        vorgabe={dialog?.vorgabe}
        onGespeichert={() => neuZeichnen((n) => n + 1)}
      />
    </>
  );
}
