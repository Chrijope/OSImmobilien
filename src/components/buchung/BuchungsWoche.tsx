import { useEffect, useMemo, useState } from 'react';
import { ladeBuchungen, type Buchung } from '@/lib/buchungStore';
import { meetingZeitISO } from '@/lib/meetingZeit';
import { Button } from '@/components/ui/button';
const datum = (d: Date) => d.toISOString().slice(0, 10);
function wochenStart() {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return datum(d);
}
export function BuchungsWoche() {
  const [start, setStart] = useState(wochenStart);
  const [termine, setTermine] = useState<Buchung[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState(false);
  const tage = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(`${start}T12:00Z`); d.setUTCDate(d.getUTCDate() + i); return datum(d); }), [start]);
  useEffect(() => {
    let lebt = true; setLaedt(true); setFehler(false);
    void (async () => {
      try {
        const gesammelt: Buchung[] = [];
        let offset = 0;
        while (true) {
          const seite = await ladeBuchungen({ vonISO: meetingZeitISO(start, '00:00'), bisISO: meetingZeitISO(tage[6], '23:59'), nurEigene: true, fehlerWerfen: true, limit: 200, offset });
          gesammelt.push(...seite); if (seite.length < 200) break; offset += 200;
        }
        if (lebt) setTermine(gesammelt);
      } catch { if (lebt) setFehler(true); }
      finally { if (lebt) setLaedt(false); }
    })();
    return () => { lebt = false; };
  }, [start, tage]);
  const wechsel = (tage: number) => { const d = new Date(`${start}T12:00Z`); d.setUTCDate(d.getUTCDate() + tage); setStart(datum(d)); };
  return <section className="rounded-xl border p-4 space-y-3" aria-label="Buchungen der Woche">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Wochenübersicht</h2><div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => wechsel(-7)}>Vorige Woche</Button><Button variant="outline" size="sm" onClick={() => setStart(wochenStart())}>Heute</Button><Button variant="outline" size="sm" onClick={() => wechsel(7)}>Nächste Woche</Button>
    </div></div>
    <p className="text-xs text-muted-foreground">Buchungen über deine Links · Zeitzone Europe/Berlin. Weitere Meetings findest du im Kundenprofil und unter „Meine Gespräche“.</p>
    {laedt ? <p role="status">Termine werden geladen…</p> : fehler ? <p role="alert">Die Wochenübersicht konnte nicht geladen werden.</p> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">{tage.map((tag) => {
      const events = termine.filter((b) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(b.start_at)) === tag);
      return <div key={tag} className="min-w-0 rounded-lg bg-muted/40 p-3"><h3 className="mb-2 text-sm font-medium">{new Date(`${tag}T12:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })}</h3>
        {events.length ? events.map((b) => <div key={b.id} className="mb-2 rounded-md border bg-background p-2 text-xs"><p className="font-semibold tabular-nums">{new Date(b.start_at).toLocaleTimeString('de-DE', { hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin' })} · {b.dauer_minuten} Min.</p><p className="break-words">{b.name}</p><p className="text-muted-foreground">{b.status === 'nicht_erschienen' ? 'Nicht erschienen' : b.status}</p></div>) : <p className="text-xs text-muted-foreground">Keine Buchung</p>}
      </div>;
    })}</div>}
  </section>;
}
