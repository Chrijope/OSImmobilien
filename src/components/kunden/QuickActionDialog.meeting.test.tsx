import { render,act,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),invite:vi.fn(),toast:vi.fn(),close:vi.fn(),saved:vi.fn()}));
vi.mock('@/hooks/useVideocallFreigabe',()=>({useVideocallFreigabe:()=>({darf:true})}));
vi.mock('@/contexts/UserContext',()=>({useUser:()=>({user:{id:'u1',name:'Berater',role:'admin'}})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:m.toast})}));
vi.mock('@/lib/meetingSpeichern',()=>({speichereMeeting:m.save}));
vi.mock('@/lib/meetingEinladung',()=>({versendeMeetingEinladung:m.invite,versendeGastEinladungen:async()=>({gesendet:[],fehlgeschlagen:[]})}));
vi.mock('@/lib/aktivitaetenStore',()=>({addAktivitaet:vi.fn()}));
vi.mock('@/lib/aufgabenStore',()=>({addAufgabe:vi.fn()}));
vi.mock('@/lib/loadAllUsers',()=>({loadAllUsers:()=>[]}));
vi.mock('@/lib/investmentsStore',()=>({getInvestmentsByKontakt:()=>[]}));
vi.mock('@/lib/beraterProfil',()=>({ladeBerater:()=>({name:'Berater'})}));
vi.mock('@/lib/userSettingsCache',()=>({getUserSetting:()=>null}));
vi.mock('@/lib/buchungStore',()=>({ladeTerminarten:async()=>[],ladeLinks:async()=>[],erstelleLink:vi.fn(),setzeLinkAktiv:vi.fn(),buchungUrl:()=>'',istExternerLink:()=>true}));
vi.mock('@/lib/buchungslinkMail',()=>({versendeBuchungslinkMail:vi.fn()}));
vi.mock('@/lib/kontaktPipeline',()=>({istTerminInZukunft:()=>true,heuteIso:()=> '2026-09-09',TERMIN_ZUKUNFT_MELDUNG:'Zukunft'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:async()=>({data:{user:null}})}}}));
import { QuickActionDialog } from './QuickActionDialog';
beforeEach(()=>{vi.clearAllMocks();const storage=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});m.invite.mockResolvedValue(true);m.save.mockResolvedValue('https://osimmobilien.netlify.app/raum/test');});
afterEach(cleanup);
async function anzeigen(){await act(async()=>{render(<QuickActionDialog art="meeting" kundeId="kunde" kundeName="Testkunde" kundeEmail="kunde@example.test" kundeTelefon="" berater="Berater" onClose={m.close} onSaved={m.saved}/>);});}
function eingeben(){fireEvent.change(screen.getByLabelText('Meeting-Titel'),{target:{value:'Beratung'}});fireEvent.change(screen.getByLabelText('Teilnehmer'),{target:{value:'Berater, Testkunde'}});}
describe('Meeting aus dem Kundenprofil',()=>{
 it('sendet keine Einladung und schließt nicht, wenn Speichern scheitert',async()=>{
  m.save.mockRejectedValue(new Error('Zeit bereits vergeben'));await anzeigen();eingeben();
  fireEvent.click(screen.getByRole('button',{name:'Meeting erstellen & einladen'}));
  await waitFor(()=>expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Nicht vollständig gespeichert'})));
  expect(m.invite).not.toHaveBeenCalled();expect(m.close).not.toHaveBeenCalled();
 });
 it('wartet auf das gespeicherte Meeting vor dem Einladungsversand und sperrt doppelte Klicks',async()=>{
  let fertig!:(s:string)=>void;m.save.mockReturnValue(new Promise<string>(r=>{fertig=r}));await anzeigen();eingeben();
  const btn=screen.getByRole('button',{name:'Meeting erstellen & einladen'});fireEvent.click(btn);fireEvent.click(btn);
  expect(m.save).toHaveBeenCalledTimes(1);expect(m.invite).not.toHaveBeenCalled();
  fertig('https://osimmobilien.netlify.app/raum/test');await waitFor(()=>expect(m.close).toHaveBeenCalledTimes(1));
  expect(m.invite).toHaveBeenCalledWith(expect.objectContaining({meetingLink:'https://osimmobilien.netlify.app/raum/test',kundeEmail:'kunde@example.test'}));
 });
 it('begrenzt die zusätzlichen Gäste auf zwei',async()=>{
  await anzeigen();const btn=screen.getByRole('button',{name:'Gast hinzufügen'});fireEvent.click(btn);fireEvent.click(btn);
  expect(btn).toBeDisabled();expect(screen.getByLabelText('E-Mail Gast 2')).toBeInTheDocument();
 });
});

it('speichert Kunde und alle Gäste für spätere automatische Benachrichtigungen',async()=>{
 await anzeigen();eingeben();const add=screen.getByRole('button',{name:'Gast hinzufügen'});fireEvent.click(add);fireEvent.click(add);
 fireEvent.change(screen.getByLabelText('E-Mail Gast 1'),{target:{value:'one@example.test'}});
 fireEvent.change(screen.getByLabelText('E-Mail Gast 2'),{target:{value:'two@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Meeting erstellen & einladen'}));
 await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
 expect(m.save.mock.calls[0][4].empfaenger.map((g:{email:string})=>g.email)).toEqual(['kunde@example.test','one@example.test','two@example.test']);
 await waitFor(()=>expect(m.close).toHaveBeenCalled());
});
