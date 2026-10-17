import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, Redo2, Save, MousePointer2, Hand, Minus, DoorOpen, RectangleHorizontal, Square, Ruler, Trash2, Loader2, ImageUp, Box } from "lucide-react";
import { PlanSvg } from "./PlanSvg";
import { Grundriss3dBlock } from "./Grundriss3dBlock";
import { entwurfLaden, entwurfLoeschen, entwurfSichern } from "./speichern";
import {
  RAUM_TYPEN, aufWand, flaeche, laenge, leererPlan, massstabAusStrecke, meter, neueId, planRahmen, planSkalieren, qm, wohnflaeche,
  type Grundriss3dPlan, type Punkt, type RaumTyp,
} from "./plan";

/*
 * Grundriss-Editor: Plan als Bild oder PDF-Seite in den Hintergrund legen,
 * Maßstab über eine bekannte Strecke setzen, dann Wände, Türen, Fenster und
 * Räume nachzeichnen. Am besten mit Maus am großen Bildschirm.
 */

type Werkzeug = "auswahl" | "verschieben" | "wand" | "tuer" | "fenster" | "raum" | "massstab";
type Auswahl = { art: "wand" | "oeffnung" | "raum"; id: string } | null;

const WERKZEUGE: Array<{ id: Werkzeug; name: string; icon: typeof Hand; hilfe: string }> = [
  { id: "auswahl", name: "Auswählen", icon: MousePointer2, hilfe: "Teil anklicken, um es zu ändern oder zu löschen. Eckpunkte einer gewählten Wand lassen sich ziehen." },
  { id: "verschieben", name: "Verschieben", icon: Hand, hilfe: "Ansicht ziehen. Mausrad zoomt." },
  { id: "massstab", name: "Maßstab", icon: Ruler, hilfe: "Zwei Punkte einer bekannten Strecke anklicken, etwa eine bemaßte Wand, dann die Länge eintragen." },
  { id: "wand", name: "Wand", icon: Minus, hilfe: "Klick für Klick zeichnen. Esc, Doppelklick oder rechte Maustaste beendet den Zug. Fängt an Ecken und rechten Winkeln." },
  { id: "tuer", name: "Tür", icon: DoorOpen, hilfe: "Auf eine Wand klicken." },
  { id: "fenster", name: "Fenster", icon: RectangleHorizontal, hilfe: "Auf eine Wand klicken." },
  { id: "raum", name: "Raum", icon: Square, hilfe: "Ecken des Raums anklicken, zum Schließen den ersten Punkt erneut anklicken." },
];

const DICKEN = [
  { wert: 0.36, name: "Außenwand 36 cm" },
  { wert: 0.24, name: "Tragend 24 cm" },
  { wert: 0.12, name: "Innenwand 12 cm" },
];

interface Props {
  start: Grundriss3dPlan | null;
  /** Schlüssel für den Entwurf im Browser, etwa die Kennung der Einheit. */
  entwurfId: string;
  onSpeichern: (plan: Grundriss3dPlan) => Promise<void>;
  /** Bild für den Hintergrund, falls schon bekannt (Vorschau). */
  hintergrundVorschlag?: string;
  titel?: string;
}

export default function GrundrissEditor({ start, entwurfId, onSpeichern, hintergrundVorschlag, titel }: Props) {
  const [verlauf, setVerlauf] = useState<{ liste: Grundriss3dPlan[]; index: number }>(() => ({ liste: [start ?? leererPlan()], index: 0 }));
  const plan = verlauf.liste[verlauf.index];
  const [werkzeug, setWerkzeug] = useState<Werkzeug>(start ? "auswahl" : "massstab");
  const [dicke, setDicke] = useState(0.24);
  const [raumTyp, setRaumTyp] = useState<RaumTyp>("zimmer");
  const [offen, setOffen] = useState<Punkt[]>([]);
  const [maus, setMaus] = useState<Punkt | null>(null);
  const [auswahl, setAuswahl] = useState<Auswahl>(null);
  const [masslaenge, setMasslaenge] = useState("");
  const [status, setStatus] = useState<{ art: "ok" | "fehler" | "laeuft"; text: string } | null>(null);
  const [dreiD, setDreiD] = useState(false);
  const [entwurf] = useState(() => entwurfLaden(entwurfId));
  const [entwurfOffen, setEntwurfOffen] = useState(() => !!entwurf && (!start?.geaendertAm || entwurf.gesichertAm > start.geaendertAm));
  const [pdfSeite, setPdfSeite] = useState(1);
  const svg = useRef<SVGSVGElement>(null);
  const ziehen = useRef<{ art: "pan"; x: number; y: number } | { art: "ecke"; alt: Punkt } | null>(null);

  const rahmenStart = useMemo(() => {
    if (plan.waende.length) { const r = planRahmen(plan); return { x: r.minX - 1, y: r.minY - 1, w: r.maxX - r.minX + 2, h: r.maxY - r.minY + 2 }; }
    return { x: -1, y: -1, w: 20, h: 14 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sicht, setSicht] = useState(rahmenStart);

  /* ── Verlauf ── */
  const aendern = useCallback((fn: (p: Grundriss3dPlan) => Grundriss3dPlan) => {
    setVerlauf((v) => {
      const neu = fn(v.liste[v.index]);
      const liste = [...v.liste.slice(Math.max(0, v.index - 99), v.index + 1), neu];
      return { liste, index: liste.length - 1 };
    });
  }, []);
  const ersetzen = (fn: (p: Grundriss3dPlan) => Grundriss3dPlan) =>
    setVerlauf((v) => ({ liste: v.liste.map((p, i) => (i === v.index ? fn(p) : p)), index: v.index }));
  const rueckgaengig = () => setVerlauf((v) => ({ ...v, index: Math.max(0, v.index - 1) }));
  const wiederholen = () => setVerlauf((v) => ({ ...v, index: Math.min(v.liste.length - 1, v.index + 1) }));

  // Jede Änderung sofort als Entwurf im Browser sichern.
  useEffect(() => { if (verlauf.index > 0) entwurfSichern(entwurfId, plan); }, [plan, verlauf.index, entwurfId]);

  /* ── Hintergrund ── */
  useEffect(() => {
    if (hintergrundVorschlag && !plan.hintergrund?.url) {
      ersetzen((p) => ({ ...p, hintergrund: { url: hintergrundVorschlag, pxProMeter: p.hintergrund?.pxProMeter ?? 50 } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintergrundVorschlag]);

  const hintergrundWaehlen = async (datei: File | undefined) => {
    if (!datei) return;
    let url: string;
    try {
      if (datei.type === "application/pdf" || /\.pdf$/i.test(datei.name)) {
        const { pdfOeffnen } = await import("@/lib/grundrissAusPdf");
        const lokal = URL.createObjectURL(datei);
        const quelle = await pdfOeffnen(lokal);
        const flaeche = await quelle.zeichnen(Math.min(Math.max(1, pdfSeite), quelle.seiten), 2400);
        url = flaeche.toDataURL("image/jpeg", 0.9);
        quelle.schliessen();
        URL.revokeObjectURL(lokal);
      } else {
        url = URL.createObjectURL(datei);
      }
    } catch (e) {
      setStatus({ art: "fehler", text: `Datei ließ sich nicht öffnen: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    aendern((p) => ({ ...p, hintergrund: { url, pxProMeter: p.hintergrund?.pxProMeter ?? 50 } }));
    setWerkzeug("massstab");
  };

  /* ── Koordinaten ── */
  const welt = (e: { clientX: number; clientY: number }): Punkt => {
    const s = svg.current;
    const m = s?.getScreenCTM();
    if (!s || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const toleranz = () => (sicht.w / (svg.current?.clientWidth || 800)) * 10;

  /** Fangen: erst an vorhandenen Ecken, sonst rechtwinklig zum letzten Punkt, auf Zentimeter. */
  const fang = (p: Punkt, bezug?: Punkt): Punkt => {
    const tol = toleranz();
    const ecken = [...plan.waende.flatMap((w) => [w.a, w.b]), ...plan.raeume.flatMap((r) => r.punkte), ...offen];
    let best: Punkt | null = null, bestD = tol;
    for (const e of ecken) { const d = laenge(e, p); if (d < bestD && e !== bezug) { best = e; bestD = d; } }
    if (best) return { ...best };
    let q = { ...p };
    if (bezug) {
      const dx = Math.abs(p.x - bezug.x), dy = Math.abs(p.y - bezug.y);
      if (dx < dy * 0.12) q.x = bezug.x;
      else if (dy < dx * 0.12) q.y = bezug.y;
    }
    q = { x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 };
    return q;
  };

  /* ── Zeichnen ── */
  const zugBeenden = () => { setOffen([]); };

  const unten = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) { zugBeenden(); return; }
    const roh = welt(e);
    const ziel = e.target as Element;
    if (e.button === 1 || werkzeug === "verschieben") {
      ziehen.current = { art: "pan", x: e.clientX, y: e.clientY };
      svg.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (werkzeug === "auswahl") {
      const griff = ziel.getAttribute("data-griff");
      const wand = auswahl?.art === "wand" ? plan.waende.find((w) => w.id === auswahl.id) : undefined;
      if (griff && wand) {
        aendern((p) => p); // Startpunkt für Rückgängig
        ziehen.current = { art: "ecke", alt: griff === "a" ? wand.a : wand.b };
        svg.current?.setPointerCapture(e.pointerId);
        return;
      }
      const oeff = ziel.closest("[data-oeffnung]")?.getAttribute("data-oeffnung");
      const w = ziel.getAttribute("data-wand");
      const r = ziel.getAttribute("data-raum");
      if (oeff) setAuswahl({ art: "oeffnung", id: oeff });
      else if (w) setAuswahl({ art: "wand", id: w });
      else if (r) setAuswahl({ art: "raum", id: r });
      else {
        setAuswahl(null);
        ziehen.current = { art: "pan", x: e.clientX, y: e.clientY };
        svg.current?.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (werkzeug === "wand") {
      const p = fang(roh, offen[offen.length - 1]);
      const letzter = offen[offen.length - 1];
      if (!letzter) { setOffen([p]); return; }
      if (laenge(letzter, p) < 0.05) { zugBeenden(); return; }
      const id = neueId("w");
      aendern((x) => ({ ...x, waende: [...x.waende, { id, a: letzter, b: p, dicke }] }));
      setOffen([p]);
      return;
    }
    if (werkzeug === "tuer" || werkzeug === "fenster") {
      const tol = toleranz() * 2;
      let best: { id: string; position: number; abstand: number; l: number } | null = null;
      for (const w of plan.waende) {
        const t = aufWand(roh, w);
        if (t.abstand < w.dicke / 2 + tol && (!best || t.abstand < best.abstand)) best = { id: w.id, position: t.position, abstand: t.abstand, l: laenge(w.a, w.b) };
      }
      if (!best) { setStatus({ art: "fehler", text: "Bitte direkt auf eine Wand klicken." }); return; }
      const breite = Math.min(werkzeug === "tuer" ? 0.885 : 1.2, best.l);
      const position = Math.max(breite / 2, Math.min(best.l - breite / 2, best.position));
      const id = neueId("o");
      aendern((x) => ({ ...x, oeffnungen: [...x.oeffnungen, { id, wandId: best!.id, art: werkzeug, position, breite }] }));
      setAuswahl({ art: "oeffnung", id });
      setStatus(null);
      return;
    }
    if (werkzeug === "raum") {
      const p = fang(roh, offen[offen.length - 1]);
      if (offen.length >= 3 && laenge(p, offen[0]) < toleranz() * 1.5) {
        const id = neueId("r");
        const name = RAUM_TYPEN.find((t) => t.id === raumTyp)?.name.split(" /")[0] ?? "Raum";
        aendern((x) => ({ ...x, raeume: [...x.raeume, { id, name, typ: raumTyp, punkte: offen }] }));
        setOffen([]);
        setAuswahl({ art: "raum", id });
        return;
      }
      setOffen([...offen, p]);
      return;
    }
    if (werkzeug === "massstab") {
      setOffen(offen.length >= 2 ? [roh] : [...offen, roh]);
    }
  };

  const bewegen = (e: React.PointerEvent<SVGSVGElement>) => {
    const z = ziehen.current;
    if (z?.art === "pan") {
      const k = sicht.w / (svg.current?.clientWidth || 800);
      setSicht((s) => ({ ...s, x: s.x - (e.clientX - z.x) * k, y: s.y - (e.clientY - z.y) * k }));
      ziehen.current = { art: "pan", x: e.clientX, y: e.clientY };
      return;
    }
    const p = welt(e);
    if (z?.art === "ecke") {
      const neu = fang(p);
      const gleich = (q: Punkt) => laenge(q, z.alt) < 0.005;
      // Alle Wände, die an dieser Ecke hängen, ziehen mit.
      ersetzen((x) => ({ ...x, waende: x.waende.map((w) => ({ ...w, a: gleich(w.a) ? neu : w.a, b: gleich(w.b) ? neu : w.b })) }));
      ziehen.current = { art: "ecke", alt: neu };
      return;
    }
    setMaus(werkzeug === "wand" || werkzeug === "raum" ? fang(p, offen[offen.length - 1]) : p);
  };

  const hoch = () => { ziehen.current = null; };

  // Mausrad zoomt um den Mauszeiger. Als eigener Listener, weil React ihn passiv anmeldet.
  useEffect(() => {
    const s = svg.current;
    if (!s) return;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const p = welt(e);
      const f = Math.exp(e.deltaY * 0.0015);
      setSicht((v) => ({ x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: v.w * f, h: v.h * f }));
    };
    s.addEventListener("wheel", rad, { passive: false });
    return () => s.removeEventListener("wheel", rad);
  });

  const loeschen = useCallback(() => {
    if (!auswahl) return;
    aendern((x) => auswahl.art === "wand"
      ? { ...x, waende: x.waende.filter((w) => w.id !== auswahl.id), oeffnungen: x.oeffnungen.filter((o) => o.wandId !== auswahl.id) }
      : auswahl.art === "oeffnung" ? { ...x, oeffnungen: x.oeffnungen.filter((o) => o.id !== auswahl.id) }
      : { ...x, raeume: x.raeume.filter((r) => r.id !== auswahl.id) });
    setAuswahl(null);
  }, [auswahl, aendern]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const imFeld = (e.target as HTMLElement)?.closest?.("input, select, textarea");
      if (e.key === "Escape") { zugBeenden(); return; }
      if (imFeld) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) wiederholen(); else rueckgaengig(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); wiederholen(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (auswahl) { e.preventDefault(); loeschen(); } }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [auswahl, loeschen]);

  /* ── Maßstab übernehmen ── */
  const massstabSetzen = () => {
    const wirklich = Number(masslaenge.replace(",", "."));
    if (offen.length !== 2 || !(wirklich > 0)) { setStatus({ art: "fehler", text: "Zwei Punkte anklicken und eine Länge über null eintragen." }); return; }
    const alt = plan.hintergrund?.pxProMeter ?? 50;
    const { pxProMeter, faktor } = massstabAusStrecke(alt, laenge(offen[0], offen[1]), wirklich);
    aendern((x) => ({ ...planSkalieren(x, faktor), hintergrund: x.hintergrund ? { ...x.hintergrund, pxProMeter } : undefined }));
    setSicht((s) => ({ x: s.x * faktor, y: s.y * faktor, w: s.w * faktor, h: s.h * faktor }));
    setOffen([]);
    setMasslaenge("");
    setStatus({ art: "ok", text: `Maßstab gesetzt: ${pxProMeter.toFixed(1).replace(".", ",")} Bildpunkte je Meter.` });
    setWerkzeug("wand");
  };

  const speichern = async () => {
    setStatus({ art: "laeuft", text: "Wird gespeichert" });
    try {
      await onSpeichern(plan);
      entwurfLoeschen(entwurfId);
      setStatus({ art: "ok", text: "Gespeichert." });
    } catch (e) {
      // Der Entwurf bleibt im Browser, nichts geht verloren.
      setStatus({ art: "fehler", text: `${e instanceof Error ? e.message : String(e)} Dein Stand ist im Browser gesichert.` });
    }
  };

  /* ── Auswahl bearbeiten ── */
  const wand = auswahl?.art === "wand" ? plan.waende.find((w) => w.id === auswahl.id) : undefined;
  const oeffnung = auswahl?.art === "oeffnung" ? plan.oeffnungen.find((o) => o.id === auswahl.id) : undefined;
  const raum = auswahl?.art === "raum" ? plan.raeume.find((r) => r.id === auswahl.id) : undefined;
  const hilfe = WERKZEUGE.find((w) => w.id === werkzeug)?.hilfe;
  const tol = toleranz();

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[1fr_300px]" data-testid="grundriss-editor">
      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {WERKZEUGE.map((w) => (
            <Button key={w.id} size="sm" variant={werkzeug === w.id ? "default" : "outline"} className="h-8 gap-1 text-xs"
              onClick={() => { setWerkzeug(w.id); setOffen([]); }}>
              <w.icon className="h-3.5 w-3.5" /> {w.name}
            </Button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          <Button size="sm" variant="outline" className="h-8" onClick={rueckgaengig} disabled={verlauf.index === 0} aria-label="Rückgängig" title="Rückgängig (Strg+Z)"><Undo2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" className="h-8" onClick={wiederholen} disabled={verlauf.index >= verlauf.liste.length - 1} aria-label="Wiederholen" title="Wiederholen (Strg+Y)"><Redo2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant={dreiD ? "default" : "outline"} className="h-8 gap-1 text-xs" onClick={() => setDreiD((d) => !d)}><Box className="h-3.5 w-3.5" /> 3D-Vorschau</Button>
        </div>
        {hilfe && <p className="text-xs text-muted-foreground">{hilfe}</p>}
        {entwurfOffen && entwurf && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
            Es gibt einen ungespeicherten Entwurf vom {new Date(entwurf.gesichertAm).toLocaleString("de-DE")}.
            <Button size="sm" className="h-7 text-xs" onClick={() => { aendern(() => entwurf.plan); setEntwurfOffen(false); }}>Entwurf laden</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { entwurfLoeschen(entwurfId); setEntwurfOffen(false); }}>Verwerfen</Button>
          </div>
        )}
        <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-lg border bg-white" onContextMenu={(e) => e.preventDefault()}>
          <PlanSvg plan={plan} svgRef={svg} className="absolute inset-0 h-full w-full" viewBox={`${sicht.x} ${sicht.y} ${sicht.w} ${sicht.h}`}
            beschriftung={!plan.hintergrund?.url || plan.waende.length > 0}
            onPointerDown={unten} onPointerMove={bewegen} onPointerUp={hoch}>
            {/* Auswahl hervorheben */}
            {wand && (
              <>
                <line x1={wand.a.x} y1={wand.a.y} x2={wand.b.x} y2={wand.b.y} stroke="#2563eb" strokeWidth={wand.dicke} strokeOpacity={0.5} pointerEvents="none" />
                {(["a", "b"] as const).map((k) => <circle key={k} data-griff={k} cx={wand[k].x} cy={wand[k].y} r={tol * 0.9} fill="#2563eb" stroke="#fff" strokeWidth={tol * 0.2} style={{ cursor: "move" }} />)}
              </>
            )}
            {raum && <polygon points={raum.punkte.map((p) => `${p.x},${p.y}`).join(" ")} fill="#2563eb" fillOpacity={0.15} stroke="#2563eb" strokeWidth={tol * 0.3} pointerEvents="none" />}
            {oeffnung && (() => {
              const w = plan.waende.find((x) => x.id === oeffnung.wandId);
              if (!w) return null;
              const l = laenge(w.a, w.b), ux = (w.b.x - w.a.x) / l, uy = (w.b.y - w.a.y) / l;
              const v = oeffnung.position - oeffnung.breite / 2, b = oeffnung.position + oeffnung.breite / 2;
              return <line x1={w.a.x + ux * v} y1={w.a.y + uy * v} x2={w.a.x + ux * b} y2={w.a.y + uy * b} stroke="#2563eb" strokeWidth={w.dicke + 0.06} strokeOpacity={0.6} pointerEvents="none" />;
            })()}
            {/* Offener Zug mit Länge */}
            {offen.length > 0 && maus && (werkzeug === "wand" || werkzeug === "raum" || werkzeug === "massstab") && (
              <g pointerEvents="none">
                <polyline points={[...offen, ...(offen.length < 2 || werkzeug !== "massstab" ? [maus] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={werkzeug === "raum" ? "#2563eb22" : "none"} stroke={werkzeug === "massstab" ? "#dc2626" : "#2563eb"} strokeWidth={werkzeug === "wand" ? dicke : tol * 0.3} strokeOpacity={0.7} />
                {offen.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={tol * 0.5} fill="#2563eb" />)}
                {werkzeug !== "massstab" || offen.length < 2 ? (
                  <text x={maus.x + tol} y={maus.y - tol} fontSize={tol * 1.4} fill="#1d4ed8" fontWeight={600}>{meter(laenge(offen[offen.length - 1], maus))}</text>
                ) : null}
              </g>
            )}
            {werkzeug !== "auswahl" && werkzeug !== "verschieben" && maus && <circle cx={maus.x} cy={maus.y} r={tol * 0.35} fill="#dc2626" pointerEvents="none" />}
          </PlanSvg>
        </div>
        {dreiD && plan.waende.length > 0 && <Grundriss3dBlock einheiten={[{ plan }]} hoehe={380} />}
      </div>

      <aside className="min-h-0 space-y-4 overflow-y-auto pr-1 text-sm">
        {titel && <h3 className="font-semibold">{titel}</h3>}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vorlage</h4>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-2 text-xs hover:bg-muted/50">
            <ImageUp className="h-4 w-4" /> Grundriss als Bild oder PDF wählen
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => void hintergrundWaehlen(e.target.files?.[0])} />
          </label>
          <label className="flex items-center gap-2 text-xs">PDF-Seite <Input type="number" min={1} value={pdfSeite} onChange={(e) => setPdfSeite(Number(e.target.value) || 1)} className="h-7 w-16" /></label>
          {plan.hintergrund && <p className="text-xs text-muted-foreground">Maßstab: {plan.hintergrund.pxProMeter.toFixed(1).replace(".", ",")} Bildpunkte je Meter{plan.hintergrund.url ? "" : ". Das Bild selbst wird nicht gespeichert; zum Weiterzeichnen dieselbe Datei erneut wählen."}</p>}
        </section>

        {werkzeug === "massstab" && (
          <section className="space-y-2 rounded-md border p-2">
            <p className="text-xs">{offen.length < 2 ? `Punkt ${offen.length + 1} von 2 anklicken.` : `Strecke im Bild: ${meter(laenge(offen[0], offen[1]))} (bisheriger Maßstab). Wie lang ist sie wirklich?`}</p>
            <div className="flex gap-2">
              <Input value={masslaenge} onChange={(e) => setMasslaenge(e.target.value)} placeholder="z. B. 3,81" className="h-8" inputMode="decimal" aria-label="Länge in Metern"
                onKeyDown={(e) => e.key === "Enter" && massstabSetzen()} />
              <Button size="sm" className="h-8" onClick={massstabSetzen} disabled={offen.length !== 2}>Übernehmen</Button>
            </div>
          </section>
        )}
        {werkzeug === "wand" && (
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wandstärke</h4>
            <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={dicke} onChange={(e) => setDicke(Number(e.target.value))}>
              {DICKEN.map((d) => <option key={d.wert} value={d.wert}>{d.name}</option>)}
            </select>
          </section>
        )}
        {werkzeug === "raum" && (
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raumtyp für den nächsten Raum</h4>
            <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={raumTyp} onChange={(e) => setRaumTyp(e.target.value as RaumTyp)}>
              {RAUM_TYPEN.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </section>
        )}

        {(wand || oeffnung || raum) && (
          <section className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-900">Ausgewählt</h4>
            {wand && (
              <>
                <p className="text-xs">Wand, {meter(laenge(wand.a, wand.b))} lang</p>
                <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={wand.dicke}
                  onChange={(e) => aendern((x) => ({ ...x, waende: x.waende.map((w) => (w.id === wand.id ? { ...w, dicke: Number(e.target.value) } : w)) }))}>
                  {[...DICKEN, ...(DICKEN.some((d) => d.wert === wand.dicke) ? [] : [{ wert: wand.dicke, name: `${Math.round(wand.dicke * 100)} cm` }])].map((d) => <option key={d.wert} value={d.wert}>{d.name}</option>)}
                </select>
              </>
            )}
            {oeffnung && (
              <>
                <div className="flex gap-1">
                  {(["tuer", "fenster"] as const).map((a) => (
                    <Button key={a} size="sm" variant={oeffnung.art === a ? "default" : "outline"} className="h-7 text-xs"
                      onClick={() => aendern((x) => ({ ...x, oeffnungen: x.oeffnungen.map((o) => (o.id === oeffnung.id ? { ...o, art: a } : o)) }))}>
                      {a === "tuer" ? "Tür" : "Fenster"}
                    </Button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs">Breite in m
                  <Input type="number" step={0.01} min={0.3} value={oeffnung.breite} className="h-7 w-24"
                    onChange={(e) => { const b = Number(e.target.value); if (b > 0) aendern((x) => ({ ...x, oeffnungen: x.oeffnungen.map((o) => (o.id === oeffnung.id ? { ...o, breite: b } : o)) })); }} />
                </label>
              </>
            )}
            {raum && (
              <>
                <Input value={raum.name} className="h-8" aria-label="Raumname"
                  onChange={(e) => ersetzen((x) => ({ ...x, raeume: x.raeume.map((r) => (r.id === raum.id ? { ...r, name: e.target.value } : r)) }))} />
                <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={raum.typ}
                  onChange={(e) => aendern((x) => ({ ...x, raeume: x.raeume.map((r) => (r.id === raum.id ? { ...r, typ: e.target.value as RaumTyp } : r)) }))}>
                  {RAUM_TYPEN.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p className="text-xs">{qm(flaeche(raum.punkte))}</p>
              </>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive" onClick={loeschen}><Trash2 className="h-3.5 w-3.5" /> Löschen</Button>
          </section>
        )}

        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Räume</h4>
          {plan.raeume.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Räume.</p>}
          <ul className="space-y-0.5 text-xs">
            {plan.raeume.map((r) => (
              <li key={r.id}>
                <button type="button" className="flex w-full justify-between rounded px-1 hover:bg-muted" onClick={() => { setWerkzeug("auswahl"); setAuswahl({ art: "raum", id: r.id }); }}>
                  <span>{r.name}</span><span className="tabular-nums">{qm(flaeche(r.punkte))}</span>
                </button>
              </li>
            ))}
          </ul>
          {plan.raeume.length > 0 && <p className="border-t pt-1 text-xs font-medium">Wohnfläche (Balkon zur Hälfte): {qm(wohnflaeche(plan))}</p>}
        </section>

        <section className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">Norden (Grad)
            <Input type="number" min={0} max={359} value={plan.nordWinkel} className="h-7" onChange={(e) => ersetzen((x) => ({ ...x, nordWinkel: Number(e.target.value) || 0 }))} />
          </label>
          <label className="space-y-1">Geschoss (0 = EG)
            <Input type="number" value={plan.geschoss ?? 0} className="h-7" onChange={(e) => ersetzen((x) => ({ ...x, geschoss: Number(e.target.value) || 0 }))} />
          </label>
          <label className="space-y-1">Lage im Haus x (m)
            <Input type="number" step={0.1} value={plan.versatz?.x ?? 0} className="h-7" onChange={(e) => ersetzen((x) => ({ ...x, versatz: { x: Number(e.target.value) || 0, y: x.versatz?.y ?? 0 } }))} />
          </label>
          <label className="space-y-1">Lage im Haus y (m)
            <Input type="number" step={0.1} value={plan.versatz?.y ?? 0} className="h-7" onChange={(e) => ersetzen((x) => ({ ...x, versatz: { x: x.versatz?.x ?? 0, y: Number(e.target.value) || 0 } }))} />
          </label>
        </section>

        <section className="space-y-2 border-t pt-3">
          <Button className="w-full gap-2" onClick={() => void speichern()} disabled={status?.art === "laeuft" || plan.waende.length === 0}>
            {status?.art === "laeuft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern
          </Button>
          {status && status.art !== "laeuft" && <p className={`text-xs ${status.art === "fehler" ? "text-destructive" : "text-green-700"}`} role="status">{status.text}</p>}
          <p className="text-[11px] text-muted-foreground">Jede Änderung wird sofort im Browser gesichert. Gespeichert für alle ist sie erst mit „Speichern“.</p>
        </section>
      </aside>
    </div>
  );
}
