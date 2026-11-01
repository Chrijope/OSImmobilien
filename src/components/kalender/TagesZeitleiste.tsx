import { useEffect, useMemo, useRef, useState } from "react";
import type { KalenderEintrag } from "@/lib/kalenderTermine";

/**
 * Ein Tag mit Zeitleiste wie im Apple-Kalender (01.11.2026): Stundenraster,
 * Termine nach Beginn und Dauer, Überlappende nebeneinander, ganztägige
 * oben, beim heutigen Tag eine Linie für jetzt. Startet bei 7 Uhr bzw. eine
 * Stunde vor jetzt.
 */
const STUNDE_PX = 52;
const MIN_DAUER_MIN = 20;

interface Platz {
  eintrag: KalenderEintrag;
  vonMin: number;
  bisMin: number;
  spur: number;
  spuren: number;
}

/** Minuten seit Mitternacht des Tages, begrenzt auf den Tag. */
function minutenAm(ms: number, tagStart: number): number {
  return Math.min(24 * 60, Math.max(0, (ms - tagStart) / 60_000));
}

/** Verteilt sich überschneidende Termine auf Spuren nebeneinander. */
export function spurenVerteilen(termine: { eintrag: KalenderEintrag; vonMin: number; bisMin: number }[]): Platz[] {
  const sortiert = [...termine].sort((a, b) => a.vonMin - b.vonMin || b.bisMin - a.bisMin);
  const ergebnis: Platz[] = [];
  let gruppe: Platz[] = [];
  let gruppeEnde = -1;
  const abschliessen = () => {
    const spuren = Math.max(1, ...gruppe.map((p) => p.spur + 1));
    for (const p of gruppe) p.spuren = spuren;
    ergebnis.push(...gruppe);
    gruppe = [];
  };
  for (const t of sortiert) {
    if (t.vonMin >= gruppeEnde && gruppe.length) abschliessen();
    const belegt = new Set(gruppe.filter((p) => p.bisMin > t.vonMin).map((p) => p.spur));
    let spur = 0;
    while (belegt.has(spur)) spur++;
    gruppe.push({ ...t, spur, spuren: 1 });
    gruppeEnde = Math.max(gruppeEnde, t.bisMin);
  }
  if (gruppe.length) abschliessen();
  return ergebnis;
}

export function TagesZeitleiste({
  tag,
  termine,
  farbeFuer,
}: {
  tag: Date;
  termine: KalenderEintrag[];
  farbeFuer: (e: KalenderEintrag) => string;
}) {
  const rahmen = useRef<HTMLDivElement>(null);
  const tagStart = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate()).getTime();
  const istHeute = new Date().toDateString() === tag.toDateString();
  const [jetzt, setJetzt] = useState(() => Date.now());

  useEffect(() => {
    if (!istHeute) return;
    const id = window.setInterval(() => setJetzt(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [istHeute]);

  const ganztags = termine.filter((t) => t.ganztags);
  const plaetze = useMemo(
    () =>
      spurenVerteilen(
        termine
          .filter((t) => !t.ganztags)
          .map((t) => {
            const vonMin = minutenAm(t.zeit, tagStart);
            const ende = t.ende ? Date.parse(t.ende) : NaN;
            const bisMin = Number.isNaN(ende) ? vonMin + 60 : Math.max(vonMin + MIN_DAUER_MIN, minutenAm(ende, tagStart));
            return { eintrag: t, vonMin, bisMin };
          }),
      ),
    [termine, tagStart],
  );

  // Beim Öffnen und beim Tageswechsel an eine sinnvolle Stelle scrollen.
  useEffect(() => {
    const startStunde = istHeute ? Math.max(0, new Date().getHours() - 1) : 7;
    rahmen.current?.scrollTo({ top: startStunde * STUNDE_PX });
  }, [tagStart, istHeute]);

  const jetztMin = istHeute ? minutenAm(jetzt, tagStart) : null;
  const uhr = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {ganztags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1 border-b pb-2">
          <span className="w-12 shrink-0 text-[11px] text-muted-foreground pt-1">ganztägig</span>
          {ganztags.map((t) => (
            <div key={t.id} className={`rounded px-2 py-1 text-xs ${farbeFuer(t)}`}>{t.titel}</div>
          ))}
        </div>
      )}
      <div ref={rahmen} className="relative flex-1 min-h-[360px] overflow-y-auto" role="list" aria-label="Termine des Tages">
        <div className="relative" style={{ height: 24 * STUNDE_PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute left-0 right-0 flex" style={{ top: h * STUNDE_PX }}>
              <span className="w-12 shrink-0 -translate-y-2 pr-2 text-right text-[11px] text-muted-foreground tabular-nums">{h === 0 ? "" : `${h}:00`}</span>
              <span className="flex-1 border-t border-border/60" />
            </div>
          ))}
          <div className="absolute inset-y-0 left-12 right-1">
            {plaetze.map((p) => (
              <div
                key={p.eintrag.id}
                role="listitem"
                className={`absolute overflow-hidden rounded-md px-2 py-1 text-xs shadow-sm ${farbeFuer(p.eintrag)}`}
                style={{
                  top: (p.vonMin / 60) * STUNDE_PX + 1,
                  height: Math.max(18, ((p.bisMin - p.vonMin) / 60) * STUNDE_PX - 2),
                  left: `calc(${(p.spur / p.spuren) * 100}% + 2px)`,
                  width: `calc(${100 / p.spuren}% - 4px)`,
                }}
                title={`${uhr(p.vonMin)} bis ${uhr(p.bisMin)} · ${p.eintrag.titel}`}
              >
                <div className="font-medium truncate">{p.eintrag.titel}</div>
                <div className="opacity-70 tabular-nums">{uhr(p.vonMin)} bis {uhr(p.bisMin)}{p.eintrag.ort ? ` · ${p.eintrag.ort}` : ""}</div>
              </div>
            ))}
            {jetztMin !== null && (
              <div className="pointer-events-none absolute left-0 right-0 z-10 flex items-center" style={{ top: (jetztMin / 60) * STUNDE_PX }} aria-hidden="true">
                <span className="-ml-1 h-2 w-2 rounded-full bg-destructive" />
                <span className="h-px flex-1 bg-destructive" />
              </div>
            )}
          </div>
        </div>
      </div>
      {termine.length === 0 && <p className="pt-2 text-sm text-muted-foreground">Keine Termine an diesem Tag.</p>}
    </div>
  );
}
