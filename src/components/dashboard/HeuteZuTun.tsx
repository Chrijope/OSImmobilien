import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUser } from '@/contexts/UserContext';
import { useLiveVersion } from '@/hooks/useLiveData';
import { leseInboxVorgaenge, type InboxVorgang } from '@/lib/inboxVorgaenge';
import { dashboardHeute, type HeuteFilter } from '@/lib/dashboardHeute';
import { istUeberfaellig } from '@/lib/faelligkeit';
import { formatDatumFlexibel } from '@/lib/datumsformate';
import { getKontakte } from '@/lib/kundenStore';
import { tarnName } from '@/lib/vorfuehrmodus';
import { starteAnrufFuerKontakt } from '@/lib/anrufStarten';
import type { Sicht } from '@/lib/dashboardKpis';

const filterNamen: [HeuteFilter,string][] = [['alle','Alle'],['follow_up','Follow-ups'],['aufgabe','Aufgaben'],['termine','Anrufe und Termine']];
export function HeuteZuTun({sicht}:{sicht:Sicht}) {
  const {user,authUser}=useUser();
  const location=useLocation();
  const basis=import.meta.env.DEV && location.pathname.startsWith("/vorschau/crm") ? "/vorschau/crm" : "";
  useLiveVersion(['kontakte','aufgaben','follow_ups','aktivitaeten','bewerbungen','user_settings']);
  const [,aktualisiere]=useState(0);
  const karte = useRef<HTMLElement>(null);
  const [filter,setFilter]=useState<HeuteFilter>('alle');
  useEffect(() => {
    const refresh=()=>aktualisiere(v=>v+1);
    const events=['inbox-updated','inbox-count-updated','followups-updated'];
    events.forEach(e=>window.addEventListener(e,refresh));
    const timer=window.setInterval(refresh,60000);
    return ()=>{ events.forEach(e=>window.removeEventListener(e,refresh));window.clearInterval(timer); };
  },[]);
  const {offen,termine}=leseInboxVorgaenge({userId:authUser?.id,userName:user.name,role:user.role,sicht});
  const terminVorgaenge: InboxVorgang[]=termine.map(t=>({id:t.id,titel:t.titel,beschreibung:'',typ:'meeting',prioritaet:'mittel',faellig_am:t.faelligAm,uhrzeit:t.uhrzeit,kundeId:t.kundeId,kundeName:t.kundeName}));
  const liste=dashboardHeute([...offen,...terminVorgaenge],filter);
  const inbox=`${basis}/inbox?umfang=${sicht}&art=${filter}&faellig=heute`;
  // Die Kennzahlen bestimmen die Desktop-Höhe. Nur ganze Vorgänge zeigen;
  // der Inbox-Link bleibt immer erreichbar, auch bei langen Aufgabentiteln.
  useLayoutEffect(() => {
    const element = karte.current;
    const nachbar = element?.parentElement?.querySelector<HTMLElement>('[aria-labelledby="dashboard-fortschritt-title"]');
    if (!element || !nachbar) return;
    const anpassen = () => {
      const zeilen = [...element.querySelectorAll<HTMLElement>('li')];
      zeilen.forEach(z => { z.style.display = ""; });
      const nebeneinander = Math.abs(element.getBoundingClientRect().top - nachbar.getBoundingClientRect().top) < 2;
      element.style.height = nebeneinander ? `${nachbar.getBoundingClientRect().height}px` : '';
      const link = element.querySelector<HTMLElement>('[data-inbox-link]');
      if (!nebeneinander || !link) return;
      const unten = element.getBoundingClientRect().bottom - parseFloat(getComputedStyle(element).paddingBottom) - 1;
      for (let i = zeilen.length - 1; i >= 0 && link.getBoundingClientRect().bottom > unten + 1; i--) zeilen[i].style.display = "none";
    };
    anpassen();
    const observer = new ResizeObserver(anpassen);
    observer.observe(nachbar);
    observer.observe(element);
    window.addEventListener('resize', anpassen);
    return () => { observer.disconnect(); window.removeEventListener('resize', anpassen); };
  });
  return <section ref={karte} aria-labelledby="dashboard-heute-title" className="flex flex-col [&>*]:shrink-0 rounded-2xl border border-primary/20 bg-accent/30 p-4 md:p-6">
    <h2 id="dashboard-heute-title" className="text-xl font-semibold tracking-tight">Heute zu tun</h2>
    <p className="mt-1 text-sm">Heute fällig: {liste.heute} · Überfällig: {liste.ueberfaellig}{liste.ohneTermin > 0 && ` · Ohne Termin: ${liste.ohneTermin}`}</p>
    <div role="group" aria-label="Vorgänge filtern" className="my-4 flex flex-wrap gap-2">
      {filterNamen.map(([wert,label])=><button key={wert} type="button" aria-pressed={filter===wert} onClick={()=>setFilter(wert)} className={`rounded-lg border px-3 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 ${filter===wert?'bg-primary text-primary-foreground':'bg-card text-foreground'}`}>{label}</button>)}
    </div>
    {liste.vorschau.length === 0 ? <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">Für diese Auswahl gibt es heute keine offenen Vorgänge.</p> :
      <ul className="space-y-2">{liste.vorschau.slice(0,3).map(v=>{
        const spaet=istUeberfaellig(v.faellig_am,v.uhrzeit);
        const kontakt=!v.bewerber && getKontakte().find(k=>k.id===v.kundeId);
        const telefon=kontakt ? kontakt.telefon : '';
        const ziel=v.bewerber ? '/bewerberprozess' : v.kundeId ? `${basis}/kunden/${v.kundeId}` : `${inbox}&aufgabe=${encodeURIComponent(v.id.replace(/^ag-/,''))}`;
        return <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-foreground">
          <div className="min-w-0 flex-1 basis-40">
            <Link to={ziel} className="text-sm font-semibold underline-offset-4 hover:underline">{tarnName(v.kundeName || 'Ohne Kunde')}</Link>
            <p className="mt-1 text-sm break-words">{v.titel}</p>
            <p className={`mt-1 text-xs ${spaet?'font-semibold text-destructive':'text-muted-foreground'}`}>{spaet && 'Überfällig · '}{v.faellig_am ? formatDatumFlexibel(v.faellig_am) : 'Ohne Termin'}{v.uhrzeit && v.uhrzeit!=='—' && ` · ${v.uhrzeit}`}</p>
          </div>
          {(v.typ==='anruf' || v.typ==='follow_up') && telefon ? <button type="button" onClick={()=>starteAnrufFuerKontakt(v.kundeId,telefon,'Dashboard',user.name)} className="rounded-lg border px-3 py-2 text-sm font-medium text-primary">Anrufen</button> :
            <Link to={v.id.startsWith('ag-') ? `${inbox}&aufgabe=${encodeURIComponent(v.id.slice(3))}` : ziel} className="rounded-lg border px-3 py-2 text-sm font-medium text-primary">{v.typ==='meeting' ? 'Termin ansehen' : 'Vorgang öffnen'}</Link>}
        </li>;
      })}</ul>}
    <Link data-inbox-link to={inbox} className="mt-auto self-start pt-2 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold underline-offset-4 hover:underline">Alle {liste.gesamt} in der Inbox ansehen →</Link>
  </section>;
}
