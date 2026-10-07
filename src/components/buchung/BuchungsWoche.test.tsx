import { render,screen,waitFor,cleanup } from '@testing-library/react';
import { describe,it,expect,vi,afterEach } from 'vitest';
const load=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/buchungStore',()=>({ladeBuchungen:load}));
import { BuchungsWoche } from './BuchungsWoche';
afterEach(cleanup);
describe('Wochenübersicht',()=>{
 it('zeigt Ladefehler statt einer scheinbar leeren Woche',async()=>{
   load.mockRejectedValue(new Error('offline')); render(<BuchungsWoche/>);
   await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('nicht geladen'));
 });
 it('fragt ausschließlich die eigene Woche mit nachgewiesener Fehlerbehandlung ab',async()=>{
   load.mockResolvedValue([]); render(<BuchungsWoche/>);
   await waitFor(()=>expect(screen.getAllByText('Keine Buchung')).toHaveLength(7));
   expect(load).toHaveBeenLastCalledWith(expect.objectContaining({nurEigene:true,fehlerWerfen:true,offset:0}));
 });
});
