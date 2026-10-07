import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reload: vi.fn(), kalender: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./dataCache', () => ({ cacheReload: mocks.reload }));
vi.mock('./aktivitaetenStore', () => ({ uebertrageInKalender: mocks.kalender }));
vi.mock('./videoraumStore', () => ({ raumUrl: (token: string) => `https://portal.more.immo/raum/${token}` }));
import { speichereMeeting, entferneMeetingRaum } from './meetingSpeichern';
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({error:null}); mocks.reload.mockResolvedValue(undefined); });
const entry = { kundeId:'kunde',art:'meeting' as const,beschreibung:'Termin',von:'Berater',faelligAm:'2026-12-10',uhrzeit:'10:00' };
describe('Gemeinsame Meetingtransaktion', () => {
  it('sendet Raum, Aktivität und Aufgabe zusammen mit stabiler Kennung', async () => {
    expect(await speichereMeeting('id',entry,{titel:'Termin'},{token:'raum',art:'beratung',gastgeber:{name:'Berater'}})).toBe('https://portal.more.immo/raum/raum');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('meeting_anlegen',expect.objectContaining({_id:'id',_daten:expect.objectContaining({aufgabe:{titel:'Termin'},raum:expect.objectContaining({token:'raum'})})}));
    expect(mocks.reload).toHaveBeenCalledTimes(2);
  });
  it('bricht bei Datenbankfehler ab und meldet keinen lokalen Erfolg', async () => {
    mocks.rpc.mockResolvedValue({error:new Error('conflict')});
    await expect(speichereMeeting('id',entry,{titel:'Termin'})).rejects.toThrow('conflict');
    expect(mocks.reload).not.toHaveBeenCalled(); expect(mocks.kalender).not.toHaveBeenCalled();
  });
  it('behält bei fehlgeschlagener Absage alle Daten im Cache', async () => {
    mocks.rpc.mockResolvedValue({error:new Error('denied')});
    await expect(entferneMeetingRaum('raum')).rejects.toThrow('denied');
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
