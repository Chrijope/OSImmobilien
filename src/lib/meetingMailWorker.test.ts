import { describe, it, expect, vi } from 'vitest';
import { meetingKalender, meetingMailAuftrag, verarbeiteMeetingMails, type MeetingMailJob } from '../../supabase/functions/_shared/meeting-mail';
const job: MeetingMailJob = { id:'job', meeting_id:'meeting',kontakt_id:'customer',benutzer_id:'host',revision:2,art:'aenderung',email:'gast@example.test',lease_id:'lease',daten:{name:'Gast',titel:'Beratung',datum:'2026-12-10',uhrzeit:'10:00',dauer:45,start:'2026-12-10T09:00:00Z',alteZeit:'2026-12-09 10:00',zugangUrl:'https://osimmobilien.netlify.app/raum/test',modus:'video',icsUid:'meeting-original'} };
describe('Automatischer Versand manueller Terminänderungen',()=>{
 it('aktualisiert denselben Kalendereintrag mit neuer Sequenz und Berliner Winterzeit',()=>{
  const ics=meetingKalender(job,'host@example.test');
  expect(ics).toContain('UID:meeting-original\r\n');expect(ics).toContain('SEQUENCE:2');expect(ics).toContain('DTSTART:20261210T090000Z');expect(ics).toContain('DTEND:20261210T094500Z');expect(ics).toContain('METHOD:REQUEST');
 });
 it('sendet eine echte Kalenderabsage ohne Beitrittslink in der Mail',()=>{
  const j={...job,art:'absage' as const};const mail=meetingMailAuftrag(j,'host@example.test');
  expect(meetingKalender(j,'host@example.test')).toContain('METHOD:CANCEL');expect(meetingKalender(j,'host@example.test')).toContain('STATUS:CANCELLED');expect(mail.templateData.zugangUrl).toBeUndefined();expect(mail.templateData.abgesagt).toBe(true);
 });
 it('teilt keine Kundendaten oder anderen Gäste mit dem Empfänger',()=>{
  const mail=meetingMailAuftrag(job,'host@example.test');
  expect(mail.recipientEmail).toBe('gast@example.test');expect(mail.templateData).not.toHaveProperty('kundeTelefon');expect(mail.templateData).not.toHaveProperty('details');expect(mail.templateData).not.toHaveProperty('empfaenger');expect(mail.idempotencyKey).toBe('meeting-status-job');
 });
 it('faltet UTF-8-Zeilen korrekt und verhindert ICS-Zeileninjektion',()=>{
  const ics=meetingKalender({...job,daten:{...job.daten,titel:'Ä'.repeat(100)+'\nSTATUS:CANCELLED'}},'host@example.test');
  expect(ics).not.toContain('\r\nSTATUS:CANCELLED');
  expect(ics.split('\r\n').every(l=>new TextEncoder().encode(l).length<=75)).toBe(true);
 });
 it('verwendet für Vor-Ort und Telefon passende Ortsangaben',()=>{
  expect(meetingKalender({...job,daten:{...job.daten,modus:'vor_ort',treffpunkt:'Büro 1'}},'')).toContain('LOCATION:Büro 1');
  expect(meetingKalender({...job,daten:{...job.daten,modus:'telefon'}},'')).toContain('LOCATION:Telefontermin');
 });
 it('wertet den Versand je Gast getrennt aus und wiederholt nur mit stabiler Kennung',async()=>{
  const jobs=[job,{...job,id:'job2',email:'two@example.test'}];
  const rpc=vi.fn().mockImplementation((name:string)=>Promise.resolve({data:name==='meeting_mail_claim'?jobs:null,error:null}));
  const invoke=vi.fn().mockResolvedValueOnce({data:{success:true},error:null}).mockResolvedValueOnce({data:{success:false,reason:'email_suppressed'},error:null});
  const db={rpc,functions:{invoke},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{email:'host@example.test'},error:null})})})})};
  await verarbeiteMeetingMails(db as never);
  expect(invoke).toHaveBeenCalledTimes(2);expect(rpc).toHaveBeenCalledWith('meeting_mail_fertig',expect.objectContaining({_id:'job',_lease:'lease',_erfolg:true}));expect(rpc).toHaveBeenCalledWith('meeting_mail_fertig',expect.objectContaining({_id:'job2',_erfolg:false}));
 });
 it('meldet eine leere oder fehlerhafte Versandantwort nicht als Erfolg',async()=>{
  const rpc=vi.fn().mockImplementation((n:string)=>Promise.resolve({data:n==='meeting_mail_claim'?[job]:null,error:null}));
  const db={rpc,functions:{invoke:async()=>({data:null,error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})};
  await verarbeiteMeetingMails(db as never);expect(rpc).toHaveBeenCalledWith('meeting_mail_fertig',expect.objectContaining({_erfolg:false}));
 });
});
