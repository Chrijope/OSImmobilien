import { describe,it,expect,vi } from 'vitest';
const data=vi.hoisted(()=>({
 kontakte:[{id:'me',vorname:'Meine',nachname:'Kundin',zustaendig_id:'u1'},{id:'team',vorname:'Team',nachname:'Kunde',zustaendig_id:'u2'},{id:'other',vorname:'Andere',nachname:'Kundin',zustaendig_id:'u3'}],
 aufgaben:[{id:'a1',typ:'aufgabe',titel:'Eigen',zugewiesenAn:'u1',kontaktId:'other',status:'offen'},{id:'a2',typ:'anruf',titel:'Team',zugewiesenAn:'u2',kontaktId:'team',status:'offen'},{id:'a3',typ:'aufgabe',titel:'Andere',zugewiesenAn:'u3',kontaktId:'other',status:'offen'},{id:'done',zugewiesenAn:'u1',status:'erledigt'}],
 folgen:[{id:'f1',kundeId:'me',titel:'Eigen',status:'offen'},{id:'f2',kundeId:'team',titel:'Team',status:'offen'},{id:'f3',kundeId:'other',titel:'Andere',status:'offen'}],
}));
vi.mock('./kundenStore',()=>({getKontakte:()=>data.kontakte}));
vi.mock('./aufgabenStore',()=>({getAufgaben:()=>data.aufgaben,getMeineAufgaben:(id:string)=>data.aufgaben.filter(a=>a.zugewiesenAn===id&&a.status!=='erledigt')}));
vi.mock('./followUpStore',()=>({getFollowUps:()=>data.folgen}));
vi.mock('./aktivitaetenStore',()=>({getInboxTasks:()=>[],getAlleTermine:()=>[]}));
vi.mock('./bewerbungStore',()=>({getBewerber:()=>[]}));
vi.mock('./bewerberErinnerungen',()=>({bewerberErinnerungen:()=>[]}));
vi.mock('./bewerberRechte',()=>({siehtBewerberMeldungen:()=>false}));
vi.mock('./investmentsStore',()=>({getInvestments:()=>[]}));
vi.mock('./inboxCountStore',()=>({getDoneInboxIds:()=>['fu-f1']}));
vi.mock('./kontaktOwnership',()=>({kontaktBelongsToUser:(k:any,{userId}:any)=>k.zustaendig_id===userId}));
vi.mock('./juniorOverrideLogic',()=>({getJuniorsForRecruiter:()=>[{userId:'u2'}]}));
vi.mock('./datenSicht',()=>({istFuehrungskraft:(role:string)=>role==='admin'}));
vi.mock('./inboxTermine',()=>({sammleInboxTermine:()=>[]}));
import { leseInboxVorgaenge } from './inboxVorgaenge';
const input={userId:'u1',userName:'Test',role:'admin'};
describe('Gemeinsamer Umfang für Inbox und Dashboard',()=>{
 it('nimmt in Meine zugewiesene Aufgaben auch bei fremdem Kunden und berücksichtigt erledigte IDs',()=>{
  expect(leseInboxVorgaenge({...input,sicht:'eigen'}).offen.map(t=>t.id)).toEqual(['ag-a1']);
 });
 it('enthält in Mein Team eigene und Teamvorgänge, aber keine fremden',()=>{
  expect(leseInboxVorgaenge({...input,sicht:'team'}).offen.map(t=>t.id)).toEqual(['ag-a1','ag-a2','fu-f2']);
 });
 it('enthält firmenweit alle offenen, nie geschlossene Aufgaben',()=>{
  expect(leseInboxVorgaenge({...input,sicht:'firma'}).offen.map(t=>t.id)).toEqual(['ag-a1','ag-a2','ag-a3','fu-f2','fu-f3']);
 });
 it('begrenzt unberechtigte Rollen und entfernt gerade erledigte Vorgänge',()=>{
  expect(leseInboxVorgaenge({...input,role:'vertriebspartner',sicht:'firma',erledigteIds:['ag-a1']}).offen).toEqual([]);
 });
});
