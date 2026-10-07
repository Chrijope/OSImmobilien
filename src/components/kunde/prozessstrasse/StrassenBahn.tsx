/**
 * Prozesslinie: die Linie selbst.
 *
 * Eine schlichte Linie als Treppe: jede Etappe liegt eine Ebene höher als die
 * vorige, Kontakt unten, Abschluss oben. Innerhalb einer Etappe liegen die
 * Punkte auf einer Höhe, am Etappenwechsel steigt die Linie mit einer kurzen
 * Schräge hoch. Der erledigte Teil ist kräftig in der Primärfarbe, der offene
 * dünn in Grau. Die Linie liegt als SVG darunter, Punkte und Namen als HTML
 * darüber, damit Info-Knopf, Tastatur und Zeilenumbruch normal funktionieren.
 */
import { PHASEN, zeigtGrundschuld, type Station, type Strasse } from "./prozessstrasseModell";
import {
  ERLEDIGT,
  GrundschuldMarke,
  MoreHaus,
  OFFEN,
  StationsName,
  StationsPunkt,
  ZielSymbol,
  type VarianteProps,
} from "./ProzessstrasseTeile";

const OBEN = 60; // Platz über der höchsten Ebene für Etappenname, Haus und Ziel
const NAMEN_H = 98; // Platz unter der Linie für Name, Hinweis und GS-Marke
export const STUFE_H = 16; // Höhe einer Treppenstufe
const HOECHSTE_EBENE = PHASEN.length - 1;

const EBENE_JE_PHASE = Object.fromEntries(PHASEN.map((p, i) => [p.key, i]));
export const ebeneVon = (s: Station) => EBENE_JE_PHASE[s.phase] ?? HOECHSTE_EBENE;

/** Höhe der Fläche, wenn `stufen` Treppenstufen übereinander zu sehen sind. */
export const bahnHoehe = (stufen: number) => OBEN + stufen * STUFE_H + NAMEN_H;

/** Die Linie liegt für die höchste Ebene auf OBEN, jede tiefere eine Stufe darunter. */
export function bahnPunkte(strasse: Strasse, dx: number) {
  return strasse.stationen.map((s, i) => ({
    x: dx / 2 + i * dx,
    y: OBEN + (HOECHSTE_EBENE - ebeneVon(s)) * STUFE_H,
  }));
}

/** Gerade Abschnitte, am Etappenwechsel eine kurze Schräge; runde Ecken über strokeLinejoin. */
function pfad(punkte: { x: number; y: number }[], bis: number, dx: number) {
  let d = `M ${punkte[0].x} ${punkte[0].y}`;
  for (let i = 1; i <= bis; i++) {
    const a = punkte[i - 1];
    const b = punkte[i];
    if (a.y !== b.y) {
      const m = (a.x + b.x) / 2;
      d += ` L ${m - dx * 0.1} ${a.y} L ${m + dx * 0.1} ${b.y}`;
    }
    d += ` L ${b.x} ${b.y}`;
  }
  return d;
}

export function StrassenBahn({
  strasse,
  dx,
  grundschuldHochgeladen = false,
  stufe,
  onStation,
  stationTitel,
  sichtbarAb = 0,
}: {
  strasse: Strasse;
  dx: number;
  /** Linker Rand des sichtbaren Ausschnitts in px; Etappennamen bleiben dort stehen statt abgeschnitten zu werden. */
  sichtbarAb?: number;
} & Pick<VarianteProps, "grundschuldHochgeladen" | "stufe" | "onStation" | "stationTitel">) {
  const punkte = bahnPunkte(strasse, dx);
  const n = punkte.length;
  const breite = dx * n;
  const hoehe = bahnHoehe(HOECHSTE_EBENE);
  const letzte = punkte[n - 1];
  const bisErledigt = strasse.zielErreicht ? n - 1 : strasse.aktuellIndex;
  const aktuell = punkte[strasse.aktuellIndex];

  // Etappenname über der eigenen Ebene, am Beginn der Etappe.
  const phasenStarts = PHASEN.map((p) => ({
    p,
    i: strasse.stationen.findIndex((s) => s.phase === p.key),
  })).filter((e) => e.i >= 0);

  return (
    <div className="relative" style={{ width: breite, height: hoehe }}>
      <svg width={breite} height={hoehe} className="absolute inset-0" aria-hidden="true">
        {/* Offener Weg: dünn und grau */}
        <path d={pfad(punkte, n - 1, dx)} fill="none" stroke={OFFEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {/* Zurückgelegter Weg: kräftig, füllt sich beim Laden */}
        {bisErledigt > 0 && (
          <path
            key={`${strasse.aktuellIndex}-${n}`}
            d={pfad(punkte, bisErledigt, dx)}
            pathLength={1}
            className="ps-fuellen"
            fill="none"
            stroke={ERLEDIGT}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {phasenStarts.map(({ p, i }, k) => {
          // Beginnt die Etappe links vom Ausschnitt, rückt ihr Name an dessen
          // Rand, höchstens bis kurz vor die nächste Etappe.
          const naechste = phasenStarts[k + 1];
          const grenze = naechste ? punkte[naechste.i].x - dx * 0.38 - 90 : Infinity;
          const x = Math.min(Math.max(punkte[i].x - dx * 0.38, sichtbarAb + 2), Math.max(punkte[i].x - dx * 0.38, grenze));
          const y = punkte[i].y;
          return (
            <g key={p.key}>
              <line x1={x} x2={x} y1={y - 57} y2={y - 45} stroke="hsl(var(--border))" strokeWidth={1} />
              <text
                x={x + 6}
                y={y - 47}
                className="fill-muted-foreground"
                style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Ziel über der letzten Station, außer das Haus steht schon dort */}
      {(strasse.zielErreicht || strasse.aktuellIndex !== n - 1) && (
        <div className="absolute flex items-center gap-1" style={{ left: letzte.x - 8, top: letzte.y - 38 }}>
          <ZielSymbol strasse={strasse} className="h-4 w-4" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: strasse.zielErreicht ? ERLEDIGT : "hsl(var(--foreground))" }}
          >
            Ziel
          </span>
        </div>
      )}

      {/* Das Haus aus der Bildmarke gleitet zur aktuellen Station */}
      {!strasse.zielErreicht && (
        <div
          className="ps-haus absolute"
          style={{
            left: aktuell.x - 12,
            top: aktuell.y - 42,
            // Start eine Station weiter links, höchstens bis zum Anfang der Linie.
            ["--ps-start" as string]: `${-Math.min(dx, aktuell.x - punkte[0].x)}px`,
          }}
        >
          <MoreHaus className="h-6 w-6" />
        </div>
      )}

      {strasse.stationen.map((s, i) => {
        const { x, y } = punkte[i];
        const istAktuell = s.zustand === "aktuell";
        return (
          <div key={s.key} className="absolute" style={{ left: x - dx / 2, top: y - 17, width: dx }}>
            <div className="flex h-[34px] items-center justify-center">
              <StationsPunkt
                station={s}
                groesse={22}
                nichtErschienen={strasse.nichtErschienen}
                onClick={onStation ? (e) => onStation(s, e) : undefined}
                title={stationTitel?.(s)}
              />
            </div>
            <div
              className="ps-auftauchen mt-1.5 flex flex-col items-center gap-1 px-1 text-center"
              style={{ animationDelay: `${Math.min(i * 40, 600)}ms` }}
            >
              <StationsName
                station={s}
                className={
                  istAktuell
                    ? "text-[12px] font-semibold leading-tight"
                    : s.zustand === "erledigt"
                      ? "text-[11px] leading-tight text-foreground/80"
                      : "text-[11px] leading-tight text-muted-foreground/80"
                }
              />
              {istAktuell && (
                <span
                  className="rounded-full px-2 py-[1px] text-[10px] font-semibold"
                  style={
                    strasse.nichtErschienen
                      ? { color: "hsl(var(--ps-nein))", background: "hsl(var(--ps-nein) / 0.1)" }
                      : { color: "hsl(var(--ps-aktiv-text))", background: "hsl(var(--ps-aktiv) / 0.14)" }
                  }
                >
                  {strasse.nichtErschienen ? "nicht erschienen" : "Aktuell"}
                </span>
              )}
              {s.key === "notar" && zeigtGrundschuld(stufe) && <GrundschuldMarke hochgeladen={grundschuldHochgeladen} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
