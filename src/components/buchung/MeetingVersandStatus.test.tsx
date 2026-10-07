import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({neq:()=>({order:()=>({limit:m.read})})})})}),rpc:m.rpc}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { MeetingVersandStatus } from './MeetingVersandStatus';
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockResolvedValue({error:null});});afterEach(cleanup);
describe('Offene Meetingänderungen im Kundenprofil',()=>{
 it('zeigt gescheiterte Gastabsagen auch ohne bestehenden Termin und erlaubt Wiederholung',async()=>{
  m.read.mockResolvedValue({data:[{id:'j',email:'gast@example.test',art:'absage',status:'fehler',fehler:'failed'}],error:null});
  render(<MeetingVersandStatus kundeId="kunde"/>);await screen.findByText(/Absage an gast@example.test/);
  fireEvent.click(screen.getByRole('button',{name:'Erneut versuchen'}));await waitFor(()=>expect(m.rpc).toHaveBeenCalledWith('meeting_mail_erneut',{_id:'j'}));
 });
 it('behauptet bei einem Ladefehler keinen erfolgreichen Versand',async()=>{
  m.read.mockResolvedValue({data:null,error:{message:'offline'}});render(<MeetingVersandStatus kundeId="kunde"/>);
  expect(await screen.findByText(/derzeit nicht verfügbar/)).toBeInTheDocument();
 });
 it('zeigt ohne offene Aufträge keine irreführende Zustellbestätigung',async()=>{
  m.read.mockResolvedValue({data:[],error:null});const {container}=render(<MeetingVersandStatus kundeId="kunde"/>);
  await waitFor(()=>expect(m.read).toHaveBeenCalled());expect(container).toBeEmptyDOMElement();
 });
});
