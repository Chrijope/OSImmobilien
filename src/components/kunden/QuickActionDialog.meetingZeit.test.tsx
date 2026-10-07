import { render, act, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

/**
 * „Meeting erstellen" darf keinen Termin in der Vergangenheit annehmen.
 *
 * Drei Stufen werden hier festgehalten:
 *   1. Der Datumswähler lässt keinen Tag vor heute zu.
 *   2. Am heutigen Tag muss die Uhrzeit nach jetzt liegen, an einem späteren
 *      Tag ist jede Uhrzeit erlaubt. Geprüft wird beim Absenden, also mit der
 *      Zeit von dann und nicht mit der vom Öffnen.
 *   3. Der Vorschlag beim Öffnen liegt nie in der Vergangenheit.
 *
 * Alle Tests arbeiten mit einer festen Zeit, damit sie nicht je nach Tageszeit
 * umfallen. Gerechnet wird in Europe/Berlin, so wie die Datenbank es tut.
 */

const m = vi.hoisted(() => ({ save: vi.fn(), invite: vi.fn(), toast: vi.fn(), close: vi.fn(), saved: vi.fn() }));
vi.mock('@/hooks/useVideocallFreigabe', () => ({ useVideocallFreigabe: () => ({ darf: true }) }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'u1', name: 'Berater', role: 'admin' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: m.toast }) }));
vi.mock('@/lib/meetingSpeichern', () => ({ speichereMeeting: m.save }));
vi.mock('@/lib/meetingEinladung', () => ({ versendeMeetingEinladung: m.invite, versendeGastEinladungen: async () => ({ gesendet: [], fehlgeschlagen: [] }) }));
vi.mock('@/lib/aktivitaetenStore', () => ({ addAktivitaet: vi.fn() }));
vi.mock('@/lib/aufgabenStore', () => ({ addAufgabe: vi.fn() }));
vi.mock('@/lib/loadAllUsers', () => ({ loadAllUsers: () => [] }));
vi.mock('@/lib/investmentsStore', () => ({ getInvestmentsByKontakt: () => [] }));
vi.mock('@/lib/beraterProfil', () => ({ ladeBerater: () => ({ name: 'Berater' }) }));
vi.mock('@/lib/userSettingsCache', () => ({ getUserSetting: () => null }));
vi.mock('@/lib/buchungStore', () => ({ ladeTerminarten: async () => [], ladeLinks: async () => [], erstelleLink: vi.fn(), setzeLinkAktiv: vi.fn(), buchungUrl: () => '', istExternerLink: () => true }));
vi.mock('@/lib/buchungslinkMail', () => ({ versendeBuchungslinkMail: vi.fn() }));
vi.mock('@/lib/kontaktPipeline', () => ({ istTerminInZukunft: () => true, heuteIso: () => '2026-09-18', TERMIN_ZUKUNFT_MELDUNG: 'Der Termin muss in der Zukunft liegen' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

import { QuickActionDialog } from './QuickActionDialog';

// 18.09.2026, 13:05 Berliner Zeit (Sommerzeit, also zwei Stunden vor UTC).
const DONNERSTAG_1305 = new Date('2026-09-18T11:05:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(DONNERSTAG_1305);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  m.invite.mockResolvedValue(true);
  m.save.mockResolvedValue('https://portal.more.immo/raum/test');
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function anzeigen() {
  await act(async () => {
    render(
      <QuickActionDialog
        art="meeting" kundeId="kunde" kundeName="Testkunde" kundeEmail="kunde@example.test"
        kundeTelefon="" berater="Berater" onClose={m.close} onSaved={m.saved}
      />,
    );
  });
}
function pflichtfelderFuellen() {
  fireEvent.change(screen.getByLabelText('Meeting-Titel'), { target: { value: 'Beratung' } });
  fireEvent.change(screen.getByLabelText('Teilnehmer'), { target: { value: 'Berater, Testkunde' } });
}
function termin(datum: string, uhrzeit: string) {
  fireEvent.change(screen.getByLabelText('Datum'), { target: { value: datum } });
  fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: uhrzeit } });
}
function absenden() {
  fireEvent.click(screen.getByRole('button', { name: 'Meeting erstellen & einladen' }));
}
const ZUKUNFT_MELDUNG = { title: 'Der Termin muss in der Zukunft liegen', variant: 'destructive' };

describe('Meeting: Vorschlag beim Öffnen', () => {
  // Seit dem 19.09.2026: heute, jetzt plus fünf Minuten, ohne Rundung. Vorher
  // wurde auf die nächste halbe Stunde aufgerundet, hier also auf 14:00.
  it('schlägt heute mit der aktuellen Uhrzeit vor, nicht mehr fest 10:00', async () => {
    await anzeigen();
    expect(screen.getByLabelText('Datum')).toHaveValue('18.09.2026');
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('13:10');
  });

  it('lässt sich ohne weitere Eingabe absenden, der Vorschlag liegt in der Zukunft', async () => {
    await anzeigen();
    pflichtfelderFuellen();
    absenden();
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    expect(m.toast).not.toHaveBeenCalledWith(expect.objectContaining(ZUKUNFT_MELDUNG));
  });

  it('bringt aus einem alten Entwurf keinen vergangenen Termin zurück', async () => {
    localStorage.setItem('quickActionDraft:kunde:meeting', JSON.stringify({
      titel: 'Alter Entwurf', faelligAm: '2026-09-18', uhrzeit: '09:00',
    }));
    await anzeigen();
    expect(screen.getByLabelText('Meeting-Titel')).toHaveValue('Alter Entwurf');
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('13:10');
  });

  it('übernimmt aus einem Entwurf einen Termin, der noch in der Zukunft liegt', async () => {
    localStorage.setItem('quickActionDraft:kunde:meeting', JSON.stringify({
      titel: 'Frischer Entwurf', faelligAm: '2026-09-21', uhrzeit: '08:30',
    }));
    await anzeigen();
    expect(screen.getByLabelText('Datum')).toHaveValue('21.09.2026');
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('08:30');
  });
});

describe('Meeting: Datum nicht vor heute', () => {
  it('übernimmt einen getippten Tag vor heute gar nicht erst', async () => {
    await anzeigen();
    const feld = screen.getByLabelText('Datum');
    fireEvent.change(feld, { target: { value: '17.09.2026' } });
    fireEvent.blur(feld);
    // Das Feld fällt auf den gültigen Vorschlag zurück, statt gestern zu übernehmen.
    expect(feld).toHaveValue('18.09.2026');
    pflichtfelderFuellen();
    absenden();
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    expect(m.save.mock.calls[0][1]).toMatchObject({ faelligAm: '2026-09-18' });
  });
});

describe('Meeting: Uhrzeit am heutigen Tag', () => {
  it('lehnt heute mit vergangener Uhrzeit ab', async () => {
    await anzeigen();
    pflichtfelderFuellen();
    termin('18.09.2026', '09:00');
    absenden();
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.objectContaining(ZUKUNFT_MELDUNG)));
    expect(m.save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Heute geht es ab 13:05 Uhr.');
  });

  it('nimmt heute mit künftiger Uhrzeit an', async () => {
    await anzeigen();
    pflichtfelderFuellen();
    termin('18.09.2026', '13:06');
    absenden();
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    expect(m.save.mock.calls[0][1]).toMatchObject({ faelligAm: '2026-09-18', uhrzeit: '13:06' });
  });

  it('nimmt morgen auch mit früher Uhrzeit an', async () => {
    await anzeigen();
    pflichtfelderFuellen();
    termin('19.09.2026', '07:00');
    absenden();
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    expect(m.save.mock.calls[0][1]).toMatchObject({ faelligAm: '2026-09-19', uhrzeit: '07:00' });
  });

  it('prüft beim Absenden die Zeit von dann, nicht die vom Öffnen', async () => {
    // Geöffnet um 17:55, gewählt 18:05, abgeschickt erst um 18:10.
    vi.setSystemTime(new Date('2026-09-18T15:55:00Z'));
    await anzeigen();
    pflichtfelderFuellen();
    termin('18.09.2026', '18:05');
    vi.setSystemTime(new Date('2026-09-18T16:10:00Z'));
    absenden();
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.objectContaining(ZUKUNFT_MELDUNG)));
    expect(m.save).not.toHaveBeenCalled();
  });
});
