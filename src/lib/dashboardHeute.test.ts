import { describe,it,expect } from 'vitest';
import { dashboardHeute } from './dashboardHeute';
import type { InboxVorgang } from './inboxVorgaenge';
const jetzt=new Date(2026,9,25,10,0);
const task=(id:string,datum='2026-10-25',uhrzeit='11:00',typ:InboxVorgang['typ']='aufgabe'):InboxVorgang=>({id,titel:id,beschreibung:'',prioritaet:'mittel',typ,faellig_am:datum,uhrzeit,kundeId:'k',kundeName:'Kunde'});
describe('Gemeinsame Tagesliste',()=>{
 it('zählt alle Treffer vor der Vorschau und entfernt doppelte IDs sowie zukünftige Vorgänge',()=>{
  const tasks=Array.from({length:8},(_,i)=>task(String(i)));
  const result=dashboardHeute([...tasks,tasks[0],task('morgen','2026-10-26')],'alle',jetzt);
  expect(result.gesamt).toBe(8);expect(result.heute).toBe(8);expect(result.vorschau).toHaveLength(5);
 });
 it('zeigt überfällige zuerst und sortiert heutige Termine nach Uhrzeit',()=>{
  const result=dashboardHeute([task('spaet','2026-10-25','16:00','meeting'),task('frueh','2026-10-25','10:30','anruf'),task('alt','24.10.2026','12:00'),task('heute-verpasst','2026-10-25','09:00')],'alle',jetzt);
  expect(result.vorschau.map(v=>v.id)).toEqual(['alt','heute-verpasst','frueh','spaet']);expect(result.ueberfaellig).toBe(2);expect(result.heute).toBe(3);
 });
 it('wendet jeden Filter auf Zähler und Vorschau gemeinsam an',()=>{
  const tasks=[task('f','','','follow_up'),task('a'),task('t','2026-10-25','12:00','meeting'),task('d','2026-10-25','','deadline')];
  for(const [filter,ids] of [['follow_up',['f']],['aufgabe',['a']],['termine',['t','d']]] as const){
   const result=dashboardHeute(tasks,filter,jetzt);expect(result.gesamt).toBe(ids.length);expect(result.vorschau.map(v=>v.id)).toEqual([...ids]);
  }
  expect(dashboardHeute(tasks,'follow_up',jetzt).ohneTermin).toBe(1);
 });
});
