import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, FilePlus2, FolderOpen, LoaderCircle, Save, Star, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KundeUndInvestment } from "@/components/investmentrechner/KundeUndInvestment";
import { KundenObjektvergleichDokument } from "@/components/investmentrechner/kundenvergleich/KundenObjektvergleichDokument";
import { Abschnitt, Feld, ObjektvergleichFormular, feldKlasse } from "@/components/investmentrechner/kundenvergleich/ObjektvergleichFormular";
import { useCacheReady } from "@/hooks/useCacheReady";
import { confirmDialog } from "@/lib/confirm";
import { getInvestmentById } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { loadKundenkontext } from "@/lib/kundenkontextHelper";
import { getObjekte, objektMetaErgaenzen, type ObjektData } from "@/lib/objekteStore";
import { selbstauskunftAus } from "@/lib/investmentrechner/kundenUebernahme";
import {
  haeuseruebergreifend, objektVon, rechneEinheit, vergleichDateiname,
  type KundenObjektvergleich, type VergleichAnnahmen, type VergleichEinheit, type VergleichKunde, type VergleichObjekt, type VergleichTexte,
} from "@/lib/investmentrechner/kundenObjektvergleich";
import { kundeAus, neuerVergleich, vorgabenAusVergleich } from "@/lib/investmentrechner/kundenObjektvergleichVorbelegung";
import { ladeVergleich, ladeVergleiche, loescheVergleich, speichereVergleich, type GespeicherterVergleich } from "@/lib/kundenObjektvergleichStore";

/*
 * /investmentrechner/objektvergleich: Persönlicher Objektvergleich zweier
 * Wohnungen eines Objekts (Christian, 28.10.2026). Objekt- und Kundendaten
 * kommen vorbelegt aus dem CRM, alles bleibt änderbar. Ohne Kunde lässt sich
 * ein Vergleich erstellen und herunterladen; gespeichert wird am Investment.
 *
 *   ?investment={id}   Kunde und Investment vorgewählt, Wohnung A aus dem Investment
 *   ?vergleich={id}    gespeicherten Vergleich öffnen
 */

const TABELLEN = ["objekte", "wohnungen", "investments", "kontakte"];

const alleWohnungen = (o: ObjektData) => [...o.wohnungen, ...(o.wohnungenNichtImAngebot || [])]
  .sort((a, b) => String(a.weNr).localeCompare(String(b.weNr), "de", { numeric: true }));

const objektIdsAus = (v: KundenObjektvergleich): [string, string] =>
  [v.objekt.objektId || "", (v.objekt2 ?? v.objekt).objektId || ""];

const kontaktName = (id: string | null) => {
  const k = id ? (getKontaktById(id) as { vorname?: string; nachname?: string } | undefined) : undefined;
  return k ? `${k.vorname || ""} ${k.nachname || ""}`.trim() : "";
};

function kundeFuer(kontaktId: string | null, investmentId: string | null): VergleichKunde {
  const kontakt = kontaktId ? (getKontaktById(kontaktId) as Parameters<typeof kundeAus>[0]) ?? null : null;
  const sa = kontaktId ? selbstauskunftAus(kontaktId, investmentId) : null;
  const saDatum = (kontaktId && loadKundenkontext(kontaktId, investmentId)?.saDatum) || "";
  return kundeAus(kontakt, sa, saDatum);
}

// ---------------------------------------------------------------------------
// Kleine Eingabefelder
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------

export default function KundenObjektvergleich() {
  const bereit = useCacheReady(TABELLEN);
  const [params, setParams] = useSearchParams();
  const [v, setV] = useState<KundenObjektvergleich | null>(null);
  // Objekt je Wohnung (A, B); verschieden = häuserübergreifend.
  const [objektIds, setObjektIds] = useState<[string, string]>(["", ""]);
  const [gespeichertId, setGespeichertId] = useState<string | null>(null);
  const [liste, setListe] = useState<GespeicherterVergleich[]>([]);
  const [arbeitet, setArbeitet] = useState(false);
  // Kunde und Investment, auch solange noch kein Objekt gewählt ist.
  const [wahl, setWahl] = useState<{ kontaktId: string | null; investmentId: string | null }>({ kontaktId: null, investmentId: null });
  const dokument = useRef<HTMLDivElement>(null);
  const gestartet = useRef(false);

  const objekte = useMemo(() => (bereit ? getObjekte().filter((o) => alleWohnungen(o).length > 0) : []), [bereit]);
  const wohnungenVon = (id: string) => {
    const o = objekte.find((x) => x.id === id);
    return o ? alleWohnungen(o) : [];
  };

  /** Vergleich aus zwei Paaren Objekt/Wohnung bauen; Kunde und Texte bleiben. */
  const aufbauen = useCallback((paare: Array<{ objektId: string; wohnungId: string }>, basis: KundenObjektvergleich | null, kontaktId: string | null, investmentId: string | null) => {
    setObjektIds([paare[0]?.objektId ?? "", paare[1]?.objektId ?? ""]);
    const wohnungen = paare.flatMap((p) => {
      const o = getObjekte().find((x) => x.id === p.objektId);
      const w = o && alleWohnungen(o).find((x) => x.id === p.wohnungId);
      return o && w ? [{ objekt: o, wohnung: w }] : [];
    });
    if (wohnungen.length < 2) { setV(null); return; }
    const neu = neuerVergleich({ wohnungen, kontaktId, investmentId, kunde: basis?.kunde ?? kundeFuer(kontaktId, investmentId) });
    setV(basis ? { ...neu, kunde: basis.kunde, texte: basis.texte, variante: basis.variante, stand: basis.stand } : neu);
  }, []);

  // Start: gespeicherten Vergleich öffnen oder aus dem Investment vorbelegen.
  useEffect(() => {
    if (!bereit || gestartet.current) return;
    gestartet.current = true;
    const vergleichId = params.get("vergleich");
    if (vergleichId) {
      ladeVergleich(vergleichId).then((g) => {
        if (!g) { toast.error("Der Vergleich wurde nicht gefunden."); return; }
        setV(g.vergleich); setGespeichertId(g.id); setObjektIds(objektIdsAus(g.vergleich));
        setWahl({ kontaktId: g.vergleich.kontaktId, investmentId: g.vergleich.investmentId });
      }).catch(() => toast.error("Der Vergleich konnte nicht geladen werden."));
      return;
    }
    const inv = params.get("investment") ? getInvestmentById(params.get("investment")!) : undefined;
    if (inv) setWahl({ kontaktId: inv.kontaktId, investmentId: inv.id });
    if (inv?.objektId && objekte.some((o) => o.id === inv.objektId)) {
      const alle = wohnungenVon(inv.objektId);
      const a = alle.find((w) => w.id === inv.wohnungId) ?? alle[0];
      const b = alle.find((w) => w.id !== a.id);
      if (b) aufbauen([{ objektId: inv.objektId, wohnungId: a.id }, { objektId: inv.objektId, wohnungId: b.id }], null, inv.kontaktId, inv.id);
      else setObjektIds([inv.objektId, ""]);
    } else if (inv) {
      toast.info("Das Investment hat noch kein Objekt. Bitte Objekt und Wohnungen wählen.");
    }
  }, [bereit, params, objekte, aufbauen]); // eslint-disable-line react-hooks/exhaustive-deps

  const { kontaktId, investmentId } = wahl;

  useEffect(() => {
    if (!kontaktId) { setListe([]); return; }
    ladeVergleiche(kontaktId).then(setListe).catch(() => setListe([]));
  }, [kontaktId, gespeichertId]);

  const ergebnisse = useMemo(() => {
    if (!v || v.einheiten.length !== 2) return null;
    if (v.einheiten.some((e) => !(e.qm > 0) || !(e.kpWohnung + e.garageKp > 0) || !(e.afaJahre > 0))) return null;
    return v.einheiten.map((e) => rechneEinheit(e, v.annahmen));
  }, [v]);

  // ------------------------------------------------------------------ Ändern
  const kundeWaehlen = (id: string | null) => {
    setWahl({ kontaktId: id, investmentId: null });
    setGespeichertId(null);
    setV((alt) => (alt ? { ...alt, kontaktId: id, investmentId: null, kunde: kundeFuer(id, null) } : alt));
  };
  const investmentWaehlen = (id: string | null) => {
    setWahl((w) => ({ ...w, investmentId: id }));
    setGespeichertId(null);
    setV((alt) => (alt ? { ...alt, investmentId: id, kunde: kundeFuer(alt.kontaktId, id) } : alt));
  };

  /** Aktuelle Paare; fehlt B noch, steht dort nichts. */
  const paare = () => [0, 1].map((i) => ({ objektId: objektIds[i], wohnungId: v?.einheiten[i]?.wohnungId || "" }));

  const objektWaehlen = (i: number, id: string) => {
    setGespeichertId(null);
    const p = paare();
    const alle = wohnungenVon(id);
    // Erste Wohnung des Objekts, die nicht schon die andere Seite ist.
    const andere = p[1 - i];
    const w = alle.find((x) => !(andere.objektId === id && andere.wohnungId === x.id));
    p[i] = { objektId: id, wohnungId: w?.id ?? "" };
    // Wohnung A gewählt, B noch leer: B startet im selben Objekt (wie bisher).
    if (i === 0 && !p[1].objektId) {
      const b = alle.find((x) => x.id !== p[0].wohnungId);
      p[1] = { objektId: id, wohnungId: b?.id ?? "" };
    }
    aufbauen(p, v, kontaktId, investmentId);
  };
  const wohnungWaehlen = (i: number, id: string) => {
    const p = paare();
    p[i] = { ...p[i], wohnungId: id };
    aufbauen(p, v, kontaktId, investmentId);
  };

  // ------------------------------------------------------------------ Aktionen
  const name = v ? `Objektvergleich WE ${v.einheiten.map((e) => e.nr).join(" und WE ")}${v.variante ? ` (${v.variante})` : ""}` : "";

  const speichern = async (alsNeu: boolean) => {
    if (!v) return;
    setArbeitet(true);
    try {
      const id = await speichereVergleich(v, name, alsNeu ? null : gespeichertId);
      setGespeichertId(id);
      setParams({ vergleich: id }, { replace: true });
      toast.success(alsNeu || !gespeichertId ? "Vergleich gespeichert." : "Änderungen gespeichert.");
    } catch (f: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(f?.message || "Speichern hat nicht geklappt.");
    } finally {
      setArbeitet(false);
    }
  };

  const herunterladen = async () => {
    if (!v || !dokument.current) return;
    setArbeitet(true);
    try {
      const { erzeugeBerechnungsansichtPdf } = await import("@/lib/investmentrechner/berechnungAnsichtPdf");
      dokument.current.classList.add("kov-export");
      const doc = await erzeugeBerechnungsansichtPdf(dokument.current);
      doc.save(vergleichDateiname(v, v.stand.split("-").reverse().join(".")));
    } catch (f) {
      console.error("[Objektvergleich] PDF", f);
      toast.error("Das PDF konnte nicht erzeugt werden.");
    } finally {
      dokument.current?.classList.remove("kov-export");
      setArbeitet(false);
    }
  };

  const alsStandard = async (i: number) => {
    const id = v && objektVon(v, i).objektId;
    if (!v || !id) return;
    try {
      await objektMetaErgaenzen(id, { objektvergleich: vorgabenAusVergleich(v, i) });
      toast.success("Vorgaben am Objekt gespeichert. Neue Vergleiche zu diesem Objekt starten damit.");
    } catch (f: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(f?.message || "Speichern am Objekt hat nicht geklappt.");
    }
  };

  const oeffnen = (g: GespeicherterVergleich) => {
    setV(g.vergleich); setGespeichertId(g.id); setObjektIds(objektIdsAus(g.vergleich));
    setWahl({ kontaktId: g.vergleich.kontaktId, investmentId: g.vergleich.investmentId });
    setParams({ vergleich: g.id }, { replace: true });
  };
  const loeschen = async (g: GespeicherterVergleich) => {
    if (!(await confirmDialog({ title: `„${g.name}“ löschen?`, confirmText: "Löschen", cancelText: "Abbrechen" }))) return;
    try {
      await loescheVergleich(g.id);
      if (g.id === gespeichertId) setGespeichertId(null);
      setListe((l) => l.filter((x) => x.id !== g.id));
      toast.success("Vergleich gelöscht.");
    } catch {
      toast.error("Löschen hat nicht geklappt.");
    }
  };

  // ------------------------------------------------------------------ Ansicht
  if (!bereit) {
    return (
      <DashboardLayout>
        <PageHeader title="Persönlicher Objektvergleich" />
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Daten werden geladen …</Card>
      </DashboardLayout>
    );
  }

  const A = ergebnisse?.[0], B = ergebnisse?.[1];
  const kannSpeichern = !!v?.kontaktId && !!v?.investmentId;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="Persönlicher Objektvergleich" subtitle="Zwei Wohnungen im Aufbau des Kundenvergleichs, vorbelegt aus Objekt und Selbstauskunft.">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setV(null); setObjektIds(["", ""]); setGespeichertId(null); setParams({}, { replace: true }); }}>
              <FilePlus2 className="h-4 w-4 mr-1.5" /> Neu
            </Button>
            <Button size="sm" variant="outline" disabled={!v || !kannSpeichern || arbeitet} title={kannSpeichern ? undefined : "Zum Speichern Kunde und Investment wählen"} onClick={() => speichern(false)}>
              <Save className="h-4 w-4 mr-1.5" /> {gespeichertId ? "Speichern" : "Vergleich speichern"}
            </Button>
            {gespeichertId && (
              <Button size="sm" variant="ghost" disabled={arbeitet} onClick={() => speichern(true)}>Als neue Variante speichern</Button>
            )}
            <Button size="sm" disabled={!A || !B || arbeitet} onClick={herunterladen}>
              {arbeitet ? <LoaderCircle className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} PDF herunterladen
            </Button>
          </div>
        </PageHeader>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
          <div className="space-y-3">
            <Abschnitt titel="Kunde und Wohnungen" offen>
              <div className="investmentrechner">
                <KundeUndInvestment
                  kundeId={kontaktId}
                  investmentId={investmentId}
                  onKundeWaehlen={(k) => kundeWaehlen(k?.id ?? null)}
                  onInvestmentWaehlen={investmentWaehlen}
                />
              </div>
              {[0, 1].map((i) => (
                <div key={i} className="grid grid-cols-[1fr_120px] gap-2">
                  <Feld label={`Objekt ${i ? "B" : "A"}`}>
                    <select className={feldKlasse} value={objektIds[i]} disabled={i === 1 && !objektIds[0]} onChange={(e) => objektWaehlen(i, e.target.value)}>
                      <option value="">Bitte wählen</option>
                      {objekte.map((o) => <option key={o.id} value={o.id}>{o.titel}</option>)}
                    </select>
                  </Feld>
                  <Feld label={`Wohnung ${i ? "B" : "A"}`}>
                    <select className={feldKlasse} value={v?.einheiten[i]?.wohnungId || ""} disabled={!objektIds[i]} onChange={(e) => wohnungWaehlen(i, e.target.value)}>
                      <option value="">wählen</option>
                      {wohnungenVon(objektIds[i]).map((w) => (
                        <option key={w.id} value={w.id} disabled={objektIds[0] === objektIds[1] && v?.einheiten[1 - i]?.wohnungId === w.id}>WE {w.weNr}{w.groesse ? ` · ${w.groesse} m²` : ""}</option>
                      ))}
                    </select>
                  </Feld>
                </div>
              ))}
              {v && haeuseruebergreifend(v) && <p className="text-xs text-muted-foreground">Häuserübergreifend: Hausdaten, Fotos und Zielmiete gelten je Haus.</p>}
              {!kannSpeichern && v && <p className="text-xs text-muted-foreground">Ohne Kunde und Investment lässt sich der Vergleich erstellen und herunterladen, aber nicht speichern.</p>}
            </Abschnitt>

            {liste.length > 0 && (
              <Abschnitt titel={`Gespeicherte Vergleiche von ${kontaktName(kontaktId) || "diesem Kunden"} (${liste.length})`} offen>
                <ul className="divide-y text-sm">
                  {liste.map((g) => (
                    <li key={g.id} className="flex items-center gap-2 py-1.5">
                      <button type="button" className="flex-1 text-left hover:underline" onClick={() => oeffnen(g)}>
                        <FolderOpen className="inline h-3.5 w-3.5 mr-1.5 text-muted-foreground" />{g.name}
                        <span className="ml-2 text-xs text-muted-foreground">{new Date(g.geaendertAm).toLocaleDateString("de-DE")}</span>
                        {g.id === gespeichertId && <span className="ml-2 text-xs text-primary">geöffnet</span>}
                      </button>
                      <button type="button" className="text-muted-foreground hover:text-destructive" title="Löschen" onClick={() => loeschen(g)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </Abschnitt>
            )}

            {v && <ObjektvergleichFormular v={v} setV={setV} onAlsStandard={alsStandard} />}
          </div>

          <div className="min-w-0 overflow-x-auto rounded-xl border bg-muted/30 p-4">
            {!v ? (
              <p className="text-sm text-muted-foreground">Bitte Objekt und zwei Wohnungen wählen. Kunde und Investment sind für das Dokument freiwillig, zum Speichern nötig.</p>
            ) : !A || !B ? (
              <p className="text-sm text-muted-foreground">Für beide Wohnungen fehlen noch Wohnfläche, Kaufpreis oder AfA-Dauer.</p>
            ) : (
              <div ref={dokument}><KundenObjektvergleichDokument v={v} A={A} B={B} /></div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
