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
import { useCacheReady } from "@/hooks/useCacheReady";
import { confirmDialog } from "@/lib/confirm";
import { getInvestmentById } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { loadKundenkontext } from "@/lib/kundenkontextHelper";
import { getObjekte, objektMetaErgaenzen, type ObjektData } from "@/lib/objekteStore";
import { selbstauskunftAus } from "@/lib/investmentrechner/kundenUebernahme";
import {
  rechneEinheit, vergleichDateiname,
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

const feldKlasse = "h-8 w-full rounded-md border bg-background px-2 text-sm";

function Feld({ label, children, hinweis }: { label: string; children: ReactNode; hinweis?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hinweis && <span className="block text-xs text-muted-foreground">{hinweis}</span>}
    </label>
  );
}

/** Zahl; `prozent` zeigt Anteile (0,042) als Prozent (4,2). */
function Zahl({ label, wert, onWert, prozent, hinweis }: { label: string; wert: number; onWert: (w: number) => void; prozent?: boolean; hinweis?: string }) {
  const anzeige = prozent ? Math.round(wert * 100000) / 1000 : wert;
  return (
    <Feld label={label} hinweis={hinweis}>
      <input type="number" step="any" className={feldKlasse} value={Number.isFinite(anzeige) ? anzeige : 0}
        onChange={(e) => { const n = Number(e.target.value); onWert(Number.isFinite(n) ? (prozent ? n / 100 : n) : 0); }} />
    </Feld>
  );
}

function Text({ label, wert, onWert, hinweis, mehrzeilig, platzhalter }: { label: string; wert: string; onWert: (w: string) => void; hinweis?: string; mehrzeilig?: boolean; platzhalter?: string }) {
  return (
    <Feld label={label} hinweis={hinweis}>
      {mehrzeilig
        ? <textarea className="w-full rounded-md border bg-background px-2 py-1 text-sm min-h-[72px]" value={wert} placeholder={platzhalter} onChange={(e) => onWert(e.target.value)} />
        : <input className={feldKlasse} value={wert} placeholder={platzhalter} onChange={(e) => onWert(e.target.value)} />}
    </Feld>
  );
}

function Abschnitt({ titel, children, offen }: { titel: string; children: ReactNode; offen?: boolean }) {
  return (
    <details className="rounded-xl border bg-card p-4" open={offen}>
      <summary className="cursor-pointer text-sm font-semibold">{titel}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

const raster = "grid gap-3 grid-cols-2 md:grid-cols-4";

// ---------------------------------------------------------------------------

export default function KundenObjektvergleich() {
  const bereit = useCacheReady(TABELLEN);
  const [params, setParams] = useSearchParams();
  const [v, setV] = useState<KundenObjektvergleich | null>(null);
  const [objektId, setObjektId] = useState<string>("");
  const [gespeichertId, setGespeichertId] = useState<string | null>(null);
  const [liste, setListe] = useState<GespeicherterVergleich[]>([]);
  const [arbeitet, setArbeitet] = useState(false);
  // Kunde und Investment, auch solange noch kein Objekt gewählt ist.
  const [wahl, setWahl] = useState<{ kontaktId: string | null; investmentId: string | null }>({ kontaktId: null, investmentId: null });
  const dokument = useRef<HTMLDivElement>(null);
  const gestartet = useRef(false);

  const objekte = useMemo(() => (bereit ? getObjekte().filter((o) => o.wohnungen.length + (o.wohnungenNichtImAngebot?.length || 0) >= 2) : []), [bereit]);
  const objekt: ObjektData | undefined = objekte.find((o) => o.id === objektId);
  const wohnungen = objekt ? [...objekt.wohnungen, ...(objekt.wohnungenNichtImAngebot || [])]
    .sort((a, b) => String(a.weNr).localeCompare(String(b.weNr), "de", { numeric: true })) : [];

  const aufbauen = useCallback((o: ObjektData, ids: string[], basis: KundenObjektvergleich | null, kontaktId: string | null, investmentId: string | null) => {
    const alle = [...o.wohnungen, ...(o.wohnungenNichtImAngebot || [])];
    const gewaehlt = ids.map((id) => alle.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
    const neu = neuerVergleich({ objekt: o, wohnungen: gewaehlt, kontaktId, investmentId, kunde: basis?.kunde ?? kundeFuer(kontaktId, investmentId) });
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
        setV(g.vergleich); setGespeichertId(g.id); setObjektId(g.vergleich.objekt.objektId || "");
        setWahl({ kontaktId: g.vergleich.kontaktId, investmentId: g.vergleich.investmentId });
      }).catch(() => toast.error("Der Vergleich konnte nicht geladen werden."));
      return;
    }
    const inv = params.get("investment") ? getInvestmentById(params.get("investment")!) : undefined;
    if (inv) setWahl({ kontaktId: inv.kontaktId, investmentId: inv.id });
    if (inv?.objektId && objekte.some((o) => o.id === inv.objektId)) {
      const o = objekte.find((x) => x.id === inv.objektId)!;
      setObjektId(o.id);
      const alle = [...o.wohnungen, ...(o.wohnungenNichtImAngebot || [])];
      const a = alle.find((w) => w.id === inv.wohnungId) ?? alle[0];
      const b = alle.find((w) => w.id !== a.id);
      aufbauen(o, [a.id, b?.id ?? ""], null, inv.kontaktId, inv.id);
    } else if (inv) {
      toast.info("Das Investment hat noch kein Objekt. Bitte Objekt und Wohnungen wählen.");
    }
  }, [bereit, params, objekte, aufbauen]);

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
  const setze = (patch: Partial<KundenObjektvergleich>) => setV((alt) => (alt ? { ...alt, ...patch } : alt));
  const setzeKunde = (patch: Partial<VergleichKunde>) => setV((alt) => (alt ? { ...alt, kunde: { ...alt.kunde, ...patch } } : alt));
  const setzeObjekt = (patch: Partial<VergleichObjekt>) => setV((alt) => (alt ? { ...alt, objekt: { ...alt.objekt, ...patch } } : alt));
  const setzeAnnahmen = (patch: Partial<VergleichAnnahmen>) => setV((alt) => (alt ? { ...alt, annahmen: { ...alt.annahmen, ...patch } } : alt));
  const setzeTexte = (patch: Partial<VergleichTexte>) => setV((alt) => (alt ? { ...alt, texte: { ...alt.texte, ...patch } } : alt));
  const setzeEinheit = (i: number, patch: Partial<VergleichEinheit>) =>
    setV((alt) => (alt ? { ...alt, einheiten: alt.einheiten.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : alt));

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

  const objektWaehlen = (id: string) => {
    setObjektId(id);
    setGespeichertId(null);
    const o = objekte.find((x) => x.id === id);
    if (!o) { setV(null); return; }
    const alle = [...o.wohnungen, ...(o.wohnungenNichtImAngebot || [])].sort((a, b) => String(a.weNr).localeCompare(String(b.weNr), "de", { numeric: true }));
    aufbauen(o, [alle[0]?.id, alle[1]?.id].filter(Boolean) as string[], v, kontaktId, investmentId);
  };
  const wohnungWaehlen = (i: number, id: string) => {
    if (!objekt || !v) return;
    const ids = v.einheiten.map((e) => e.wohnungId || "");
    ids[i] = id;
    aufbauen(objekt, ids, v, v.kontaktId, v.investmentId);
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

  const alsStandard = async () => {
    if (!v?.objekt.objektId) return;
    try {
      await objektMetaErgaenzen(v.objekt.objektId, { objektvergleich: vorgabenAusVergleich(v) });
      toast.success("Vorgaben am Objekt gespeichert. Neue Vergleiche zu diesem Objekt starten damit.");
    } catch (f: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(f?.message || "Speichern am Objekt hat nicht geklappt.");
    }
  };

  const oeffnen = (g: GespeicherterVergleich) => {
    setV(g.vergleich); setGespeichertId(g.id); setObjektId(g.vergleich.objekt.objektId || "");
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
            <Button size="sm" variant="outline" onClick={() => { setV(null); setObjektId(""); setGespeichertId(null); setParams({}, { replace: true }); }}>
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
              <Feld label="Objekt">
                <select className={feldKlasse} value={objektId} onChange={(e) => objektWaehlen(e.target.value)}>
                  <option value="">Bitte wählen</option>
                  {objekte.map((o) => <option key={o.id} value={o.id}>{o.titel}</option>)}
                </select>
              </Feld>
              {v && (
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((i) => (
                    <Feld key={i} label={`Wohnung ${i ? "B" : "A"}`}>
                      <select className={feldKlasse} value={v.einheiten[i]?.wohnungId || ""} onChange={(e) => wohnungWaehlen(i, e.target.value)}>
                        {wohnungen.map((w) => <option key={w.id} value={w.id} disabled={v.einheiten[1 - i]?.wohnungId === w.id}>WE {w.weNr}{w.groesse ? ` · ${w.groesse} m²` : ""}</option>)}
                      </select>
                    </Feld>
                  ))}
                </div>
              )}
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

            {v && (
              <>
                <Abschnitt titel="Dokument und Annahmen">
                  <div className="grid grid-cols-2 gap-3">
                    <Feld label="Stand (Datum)"><input type="date" className={feldKlasse} value={v.stand} onChange={(e) => setze({ stand: e.target.value })} /></Feld>
                    <Text label="Variante (Titel, Dateiname)" wert={v.variante} onWert={(w) => setze({ variante: w })} platzhalter="z. B. Kaufpreis angepasst" />
                  </div>
                  <div className={raster}>
                    <Zahl label="Steuersatz %" prozent wert={v.annahmen.steuer} onWert={(w) => setzeAnnahmen({ steuer: w })} />
                    <Zahl label="Zins %" prozent wert={v.annahmen.zins} onWert={(w) => setzeAnnahmen({ zins: w })} />
                    <Zahl label="Tilgung %" prozent wert={v.annahmen.tilgung} onWert={(w) => setzeAnnahmen({ tilgung: w })} />
                    <Zahl label="Kaufnebenkosten %" prozent wert={v.annahmen.knk} onWert={(w) => setzeAnnahmen({ knk: w })} />
                    <Zahl label="Gebäudeanteil %" prozent wert={v.annahmen.gebaeudeanteil} onWert={(w) => setzeAnnahmen({ gebaeudeanteil: w })} />
                    <Zahl label="Wertsteigerung %" prozent wert={v.annahmen.wertPa} onWert={(w) => setzeAnnahmen({ wertPa: w })} />
                    <Zahl label="Kostensteigerung %" prozent wert={v.annahmen.kostenPa} onWert={(w) => setzeAnnahmen({ kostenPa: w })} />
                    <Zahl label="Jahr 1" wert={v.annahmen.startJahr} onWert={(w) => setzeAnnahmen({ startJahr: w })} />
                    <Zahl label="Zielmiete €/m²" wert={v.annahmen.mieteZielQm} onWert={(w) => setzeAnnahmen({ mieteZielQm: w })} />
                    <Zahl label="Zieljahr Miete" wert={v.annahmen.mieteZielJahr} onWert={(w) => setzeAnnahmen({ mieteZielJahr: w })} />
                    <Zahl label="Kappungsgrenze %" prozent wert={v.annahmen.kappung} onWert={(w) => setzeAnnahmen({ kappung: w })} hinweis="20 %, mit Verordnung 15 %" />
                    <Zahl label="Subvention Monate" wert={v.annahmen.subventionMonate} onWert={(w) => setzeAnnahmen({ subventionMonate: w })} />
                    <Zahl label="Lastenwechsel nach Monaten" wert={v.annahmen.lastenwechselMonate} onWert={(w) => setzeAnnahmen({ lastenwechselMonate: w })} hinweis="Monate nach dem Kauf, in der Regel 5" />
                  </div>
                </Abschnitt>

                <Abschnitt titel="Wohnungen A und B">
                  <div className="grid grid-cols-2 gap-4">
                    {v.einheiten.map((e, i) => (
                      <div key={i} className="space-y-2">
                        <p className="text-sm font-medium">{i ? "B" : "A"} · WE {e.nr}</p>
                        <Text label="Lage" wert={e.lage} onWert={(w) => setzeEinheit(i, { lage: w })} />
                        <Zahl label="Wohnfläche m²" wert={e.qm} onWert={(w) => setzeEinheit(i, { qm: w })} />
                        <Zahl label="Zimmer" wert={e.zimmer} onWert={(w) => setzeEinheit(i, { zimmer: w })} />
                        <Zahl label="Kaufpreis Wohnung €" wert={e.kpWohnung} onWert={(w) => setzeEinheit(i, { kpWohnung: w })} />
                        <Zahl label="Listenpreis € (bei Preisnachlass)" wert={e.kpListe} onWert={(w) => setzeEinheit(i, { kpListe: w })} hinweis="0 = kein Nachlass" />
                        <Zahl label="Garagen (Anzahl)" wert={e.garagen} onWert={(w) => setzeEinheit(i, { garagen: Math.max(0, Math.round(w)) })} hinweis="nur die erste mit Kaufpreis" />
                        <Zahl label="Kaufpreis Garage €" wert={e.garageKp} onWert={(w) => setzeEinheit(i, { garageKp: w })} />
                        <Zahl label="Garagenmiete 1. Jahr € je Platz" wert={e.garageMiete1} onWert={(w) => setzeEinheit(i, { garageMiete1: w })} />
                        <Zahl label="Garagenmiete im Zieljahr €" wert={e.garageMieteZiel} onWert={(w) => setzeEinheit(i, { garageMieteZiel: w })} />
                        <div className="grid grid-cols-2 gap-2">
                          <Zahl label="Garage heute von €" wert={e.garageIstVon} onWert={(w) => setzeEinheit(i, { garageIstVon: w })} />
                          <Zahl label="bis €" wert={e.garageIstBis} onWert={(w) => setzeEinheit(i, { garageIstBis: w })} />
                        </div>
                        <Zahl label="Kaltmiete heute €" wert={e.mieteIst} onWert={(w) => setzeEinheit(i, { mieteIst: w })} />
                        <Zahl label="Gerechnete Miete €/m² (subventioniert)" wert={e.mieteSubQm} onWert={(w) => setzeEinheit(i, { mieteSubQm: w })} />
                        <Zahl label="Hausgeld umlagefähig €" wert={e.u} onWert={(w) => setzeEinheit(i, { u: w })} />
                        <Zahl label="Hausgeld nicht umlagefähig €" wert={e.n} onWert={(w) => setzeEinheit(i, { n: w })} />
                        <Zahl label="Erhaltungsrücklage €" wert={e.r} onWert={(w) => setzeEinheit(i, { r: w })} />
                        <Zahl label="AfA-Dauer Jahre (Restnutzungsdauer)" wert={e.afaJahre} onWert={(w) => setzeEinheit(i, { afaJahre: w })} />
                      </div>
                    ))}
                  </div>
                </Abschnitt>

                <Abschnitt titel="Objekt">
                  <Text label="Straße" wert={v.objekt.strasse} onWert={(w) => setzeObjekt({ strasse: w })} />
                  <Text label="PLZ und Ort" wert={v.objekt.ortZeile} onWert={(w) => setzeObjekt({ ortZeile: w })} />
                  <Text label="Das Haus (eine Zeile je Punkt)" mehrzeilig wert={v.objekt.hausPunkte.join("\n")} onWert={(w) => setzeObjekt({ hausPunkte: w.split("\n").map((x) => x.trim()).filter(Boolean) })} />
                  <Text label="Verwaltung" wert={v.objekt.verwaltung} onWert={(w) => setzeObjekt({ verwaltung: w })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Zahl label="Vergleichsmiete am Ort €/m²" wert={v.objekt.vergleichsmieteQm} onWert={(w) => setzeObjekt({ vergleichsmieteQm: w })} hinweis="0 = Satz entfällt" />
                    <Text label="Quelle Vergleichsmiete" wert={v.objekt.vergleichsmieteQuelle} onWert={(w) => setzeObjekt({ vergleichsmieteQuelle: w })} platzhalter="z. B. MieteAktuell" />
                  </div>
                  <Text label="Hausgeld laut" wert={v.objekt.wirtschaftsplan} onWert={(w) => setzeObjekt({ wirtschaftsplan: w })} platzhalter="Wirtschaftsplan 2027" />
                  <Text label="Titelbild (Adresse)" wert={v.objekt.fotoTitel} onWert={(w) => setzeObjekt({ fotoTitel: w })} />
                  <Text label="Hausfoto Seite 3 (Adresse)" wert={v.objekt.fotoHaus} onWert={(w) => setzeObjekt({ fotoHaus: w })} />
                  <Button size="sm" variant="outline" onClick={alsStandard}>
                    <Star className="h-4 w-4 mr-1.5" /> Als Standard am Objekt speichern
                  </Button>
                  <p className="text-xs text-muted-foreground">Speichert Subvention, Zielmiete, Vergleichsmiete, Garagenwerte und die Hauspunkte am Objekt, damit jeder neue Vergleich damit startet.</p>
                </Abschnitt>

                <Abschnitt titel="Kunde (aus der Selbstauskunft, änderbar)">
                  <div className="grid grid-cols-3 gap-3">
                    <Text label="Anrede" wert={v.kunde.anrede} onWert={(w) => setzeKunde({ anrede: w })} />
                    <Text label="Vorname" wert={v.kunde.vorname} onWert={(w) => setzeKunde({ vorname: w })} />
                    <Text label="Nachname" wert={v.kunde.nachname} onWert={(w) => setzeKunde({ nachname: w })} />
                  </div>
                  <div className={raster}>
                    <Zahl label="Netto im Monat €" wert={v.kunde.netto} onWert={(w) => setzeKunde({ netto: w })} />
                    <Zahl label="Brutto im Jahr €" wert={v.kunde.bruttoJahr} onWert={(w) => setzeKunde({ bruttoJahr: w })} />
                    <Zahl label="Miete warm €" wert={v.kunde.mieteWarm} onWert={(w) => setzeKunde({ mieteWarm: w })} />
                    <Zahl label="Lebenshaltung €" wert={v.kunde.lebenshaltung} onWert={(w) => setzeKunde({ lebenshaltung: w })} />
                    <Zahl label="Kreditraten €" wert={v.kunde.kreditRaten} onWert={(w) => setzeKunde({ kreditRaten: w })} />
                    <Zahl label="Kapital €" wert={v.kunde.kapital} onWert={(w) => setzeKunde({ kapital: w })} />
                    <Zahl label="Jahre bis zur Rente" wert={v.kunde.jahreBisRente} onWert={(w) => setzeKunde({ jahreBisRente: w })} />
                    <Text label="Steuerklasse" wert={v.kunde.steuerklasse} onWert={(w) => setzeKunde({ steuerklasse: w })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Text label="Beschäftigung" wert={v.kunde.beschaeftigung} onWert={(w) => setzeKunde({ beschaeftigung: w })} />
                    <Text label="Familienstand" wert={v.kunde.familienstand} onWert={(w) => setzeKunde({ familienstand: w })} />
                    <Text label="Kinder" wert={v.kunde.kinder} onWert={(w) => setzeKunde({ kinder: w })} />
                    <Text label="Antrag" wert={v.kunde.antrag} onWert={(w) => setzeKunde({ antrag: w })} />
                    <Text label="Wohnsituation" wert={v.kunde.wohnsituation} onWert={(w) => setzeKunde({ wohnsituation: w })} />
                    <Text label="Laufende Kredite (Text)" wert={v.kunde.kredite} onWert={(w) => setzeKunde({ kredite: w })} />
                    <Feld label="Selbstauskunft vom"><input type="date" className={feldKlasse} value={v.kunde.saDatum.slice(0, 10)} onChange={(e) => setzeKunde({ saDatum: e.target.value })} /></Feld>
                  </div>
                </Abschnitt>

                <Abschnitt titel="Empfehlung (leer = automatisch aus den Kriterien)">
                  <Text label="Überschrift" wert={v.texte.empfehlungTitel} onWert={(w) => setzeTexte({ empfehlungTitel: w })} />
                  <Text label="Empfehlung (Absätze durch Leerzeile)" mehrzeilig wert={v.texte.empfehlung} onWert={(w) => setzeTexte({ empfehlung: w })} />
                  <Text label="Wann die andere Wohnung besser passt" mehrzeilig wert={v.texte.wannAndere} onWert={(w) => setzeTexte({ wannAndere: w })} />
                  <Text label="Nächste Schritte (eine Zeile je Schritt)" mehrzeilig wert={v.texte.naechsteSchritte.join("\n")}
                    onWert={(w) => setzeTexte({ naechsteSchritte: w.split("\n").map((x) => x.trim()).filter(Boolean) })} />
                </Abschnitt>
              </>
            )}
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
