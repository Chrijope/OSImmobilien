import type { ReactNode } from "react";
import { flaeche, laenge, planRahmen, qm, schwerpunkt, type Grundriss3dPlan, type Wand } from "./plan";

/*
 * Der Plan als 2D-Zeichnung (SVG, Einheit Meter). Rückfall ohne 3D, für
 * Screenreader mit Text je Raum und Grundlage des Editors.
 */

const RAUM_FARBE: Record<string, string> = {
  bad: "#e6eef3", kueche: "#eef0e6", balkon: "#ecebe6", flur: "#f3f0ea", abstell: "#efefef",
};

export function oeffnungsPunkte(w: Wand, position: number, breite: number) {
  const l = laenge(w.a, w.b);
  const ux = (w.b.x - w.a.x) / l, uy = (w.b.y - w.a.y) / l;
  const von = Math.max(0, position - breite / 2), bis = Math.min(l, position + breite / 2);
  return { a: { x: w.a.x + ux * von, y: w.a.y + uy * von }, b: { x: w.a.x + ux * bis, y: w.a.y + uy * bis }, ux, uy, breite: bis - von };
}

export function PlanSvg({ plan, viewBox, beschriftung = true, className, children, onPointerDown, onPointerMove, onPointerUp, onWheel, svgRef, titel }: {
  plan: Grundriss3dPlan;
  viewBox?: string;
  beschriftung?: boolean;
  className?: string;
  children?: ReactNode;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
  onWheel?: React.WheelEventHandler<SVGSVGElement>;
  svgRef?: React.Ref<SVGSVGElement>;
  titel?: string;
}) {
  const r = plan.waende.length || plan.flaechen ? planRahmen(plan) : { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const rand = 0.8;
  const vb = viewBox ?? `${r.minX - rand} ${r.minY - rand} ${r.maxX - r.minX + 2 * rand} ${r.maxY - r.minY + 2 * rand + 0.6}`;
  const beschreibung = plan.raeume.map((x) => `${x.name} ${qm(flaeche(x.punkte))}`).join(", ");
  return (
    <svg ref={svgRef} viewBox={vb} className={className} role="img" aria-label={`${titel ?? "Grundriss"}: ${beschreibung}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}
      style={{ touchAction: "none", userSelect: "none" }}>
      {plan.hintergrund?.url && (
        <image href={plan.hintergrund.url} x={0} y={0} opacity={0.55} preserveAspectRatio="none"
          ref={(el) => {
            // Größe in Metern aus der Bildgröße und dem Maßstab.
            if (!el || !plan.hintergrund) return;
            const img = new Image();
            const s = plan.hintergrund.pxProMeter;
            img.onload = () => { el.setAttribute("width", String(img.naturalWidth / s)); el.setAttribute("height", String(img.naturalHeight / s)); };
            img.src = plan.hintergrund.url;
          }} />
      )}
      {plan.raeume.map((x) => (
        <polygon key={x.id} points={x.punkte.map((p) => `${p.x},${p.y}`).join(" ")} fill={RAUM_FARBE[x.typ] ?? "#f7f4ee"} fillOpacity={plan.hintergrund?.url ? 0.55 : 1} data-raum={x.id} />
      ))}
      {plan.flaechen && (
        <g pointerEvents="none">
          {plan.flaechen.waende.map((w, i) => (
            <path key={`fw${i}`} d={w.map((ring) => `M ${ring.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`).join(" ")} fill="#3b3d40" fillRule="evenodd" />
          ))}
          {plan.flaechen.fenster.map((f, i) => <polygon key={`ff${i}`} points={f.map(([x, y]) => `${x},${y}`).join(" ")} fill="#bcdcec" />)}
        </g>
      )}
      {plan.waende.map((w) => (
        <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#3b3d40" strokeWidth={w.dicke} strokeLinecap="square" data-wand={w.id} />
      ))}
      {plan.oeffnungen.map((o) => {
        const w = plan.waende.find((x) => x.id === o.wandId);
        if (!w) return null;
        const { a, b, ux, uy, breite } = oeffnungsPunkte(w, o.position, o.breite);
        const nx = -uy, ny = ux;
        return (
          <g key={o.id} data-oeffnung={o.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeWidth={w.dicke + 0.02} />
            {o.art === "fenster" ? (
              <>
                <line x1={a.x + nx * w.dicke / 4} y1={a.y + ny * w.dicke / 4} x2={b.x + nx * w.dicke / 4} y2={b.y + ny * w.dicke / 4} stroke="#4a90b8" strokeWidth={0.03} />
                <line x1={a.x - nx * w.dicke / 4} y1={a.y - ny * w.dicke / 4} x2={b.x - nx * w.dicke / 4} y2={b.y - ny * w.dicke / 4} stroke="#4a90b8" strokeWidth={0.03} />
              </>
            ) : (
              <path d={`M ${a.x} ${a.y} L ${a.x + nx * breite} ${a.y + ny * breite} A ${breite} ${breite} 0 0 ${ux * ny - uy * nx > 0 ? 0 : 1} ${b.x} ${b.y}`} fill="none" stroke="#8a8f94" strokeWidth={0.025} />
            )}
          </g>
        );
      })}
      {beschriftung && plan.raeume.map((x) => {
        const s = schwerpunkt(x.punkte);
        return (
          <g key={`t-${x.id}`} pointerEvents="none">
            <text x={s.x} y={s.y - 0.05} fontSize={0.3} textAnchor="middle" fontWeight={600} fill="#1f2933">{x.name}</text>
            <text x={s.x} y={s.y + 0.3} fontSize={0.24} textAnchor="middle" fill="#52606d">{qm(flaeche(x.punkte))}</text>
          </g>
        );
      })}
      {beschriftung && plan.waende.length > 0 && (
        <g pointerEvents="none">
          {/* Maßstab 1 m */}
          <line x1={r.minX} y1={r.maxY + 0.7} x2={r.minX + 1} y2={r.maxY + 0.7} stroke="#1f2933" strokeWidth={0.04} />
          <text x={r.minX + 1.1} y={r.maxY + 0.78} fontSize={0.22} fill="#52606d">1 m</text>
          {/* Nordpfeil */}
          <g transform={`translate(${r.maxX + 0.2} ${r.maxY + 0.55}) rotate(${plan.nordWinkel})`}>
            <path d="M 0 -0.3 L 0.12 0.15 L 0 0.07 L -0.12 0.15 Z" fill="#c0392b" />
            <text x={0} y={-0.36} fontSize={0.2} textAnchor="middle" fill="#c0392b">N</text>
          </g>
        </g>
      )}
      {children}
    </svg>
  );
}
