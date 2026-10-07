import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, act, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

/**
 * „Anruf notieren" nach einem Klick auf Anrufen.
 *
 * Christian, 26.09.2026: Jeder Anruf aus dem Kundenprofil öffnet sofort das
 * Protokoll. Das Ergebnis ist Pflicht, die Zusammenfassung Pflicht, sobald ein
 * Gespräch stattfand, und im selben Fenster lässt sich eine Aufgabe anlegen.
 * Wer nach einem Anruf ohne Protokoll schließt, wird einmal gefragt.
 */

const m = vi.hoisted(() => ({
  toast: vi.fn(), close: vi.fn(), saved: vi.fn(), ergebnis: vi.fn(),
  aktivitaet: vi.fn(), aufgabe: vi.fn(), confirm: vi.fn(),
}));
vi.mock('@/hooks/useVideocallFreigabe', () => ({ useVideocallFreigabe: () => ({ darf: false }) }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'u1', name: 'Berater', role: 'admin' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: m.toast }) }));
vi.mock('@/lib/meetingSpeichern', () => ({ speichereMeeting: vi.fn() }));
vi.mock('@/lib/meetingEinladung', () => ({ versendeMeetingEinladung: vi.fn(), versendeGastEinladungen: vi.fn() }));
vi.mock('@/lib/aktivitaetenStore', () => ({ addAktivitaet: m.aktivitaet }));
vi.mock('@/lib/aufgabenStore', () => ({ addAufgabe: m.aufgabe }));
vi.mock('@/lib/anrufStarten', () => ({ starteAnrufFuerKontakt: vi.fn() }));
vi.mock('@/lib/loadAllUsers', () => ({ loadAllUsers: () => [] }));
vi.mock('@/lib/investmentsStore', () => ({ getInvestmentsByKontakt: () => [] }));
vi.mock('@/lib/beraterProfil', () => ({ ladeBerater: () => ({ name: 'Berater' }) }));
vi.mock('@/lib/userSettingsCache', () => ({ getUserSetting: () => null }));
vi.mock('@/lib/buchungStore', () => ({ ladeTerminarten: async () => [], ladeLinks: async () => [], erstelleLink: vi.fn(), setzeLinkAktiv: vi.fn(), buchungUrl: () => '', istExternerLink: () => true }));
vi.mock('@/lib/buchungslinkMail', () => ({ versendeBuchungslinkMail: vi.fn() }));
vi.mock('@/lib/eigeneBuchungslinks', () => ({ useEigeneBuchungslinks: () => ({ links: {}, laedt: false }) }));
vi.mock('@/lib/confirm', () => ({ confirmDialog: m.confirm }));
// Dieselbe Rechnung wie das Original, nur ohne dessen Abhängigkeiten zu Cache und Datenbank.
vi.mock('@/lib/kontaktPipeline', () => ({
  istTerminInZukunft: (datum: string, uhrzeit: string) => new Date(`${datum}T${uhrzeit || '23:59'}:00`).getTime() > Date.now(),
  heuteIso: () => '2026-09-26',
  TERMIN_ZUKUNFT_MELDUNG: 'Der Termin muss in der Zukunft liegen',
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

import { QuickActionDialog } from './QuickActionDialog';

// Freitag, 26.09.2026, 14:37 Ortszeit.
const FREITAG_1437 = new Date(2026, 8, 26, 14, 37, 0);

beforeEach(() => {
  vi.clearAllMocks();
  // Nur die Uhr anhalten, die Zeitgeber laufen echt weiter, sonst wartet waitFor ewig.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FREITAG_1437);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  m.aufgabe.mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/**
 * Zeigt das Protokoll an, auf Wunsch mit schon gewähltem Ergebnis.
 *
 * Das Ergebnis kommt über den Entwurf, den der Dialog selbst beim Öffnen
 * wiederherstellt, nicht über einen Klick in die Auswahlliste: Nach einer
 * Auswahl in der Radix-Liste steht der Testbrowser rund 14 Sekunden still,
 * auch beim unveränderten Dialog. Im echten Browser tritt das nicht auf.
 */
async function anzeigen(props: { anrufGestartet?: boolean; nichtErreichtCount?: number; ergebnis?: string } = {}) {
  const { ergebnis, ...rest } = props;
  if (ergebnis) localStorage.setItem('quickActionDraft:kunde-1:anruf_protokoll', JSON.stringify({ ergebnis }));
  await act(async () => {
    render(
      <QuickActionDialog
        art="anruf_protokoll" kundeId="kunde-1" kundeName="Testkunde" kundeEmail="kunde@example.test"
        kundeTelefon="0170 0000000" berater="Berater"
        onClose={m.close} onSaved={m.saved} onProtokollResult={m.ergebnis}
        {...rest}
      />,
    );
  });
}

function zusammenfassung(text: string) {
  fireEvent.change(screen.getByLabelText(/^Zusammenfassung/), { target: { value: text } });
}
function speichern() {
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
}
function aufgabeOeffnen() {
  fireEvent.click(screen.getByRole('button', { name: /Aufgabe erstellen/ }));
}

describe('Ergebnis ist Pflicht', () => {
  it('startet ohne vorbelegtes Ergebnis und speichert ohne Wahl nichts', async () => {
    await anzeigen();
    expect(screen.getByLabelText(/^Ergebnis/)).toHaveTextContent('Bitte wählen');
    speichern();
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bitte das Ergebnis angeben' })));
    expect(m.aktivitaet).not.toHaveBeenCalled();
    expect(m.ergebnis).not.toHaveBeenCalled();
  });
});

describe('Zusammenfassung', () => {
  it('ist Pflicht, wenn ein Gespräch stattfand', async () => {
    await anzeigen({ ergebnis: 'erreicht' });
    expect(screen.getByLabelText(/^Ergebnis/)).toHaveTextContent('Erreicht');
    expect(screen.getByLabelText(/^Zusammenfassung/)).toBeRequired();
    speichern();
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bitte kurz zusammenfassen, was besprochen wurde' })));
    expect(m.aktivitaet).not.toHaveBeenCalled();

    zusammenfassung('Will Unterlagen bis Montag schicken');
    speichern();
    await waitFor(() => expect(m.ergebnis).toHaveBeenCalledTimes(1));
    expect(m.aktivitaet).toHaveBeenCalledWith(expect.objectContaining({
      art: 'anruf_protokoll', ergebnis: 'erreicht',
      beschreibung: 'Anruf mit Testkunde: Will Unterlagen bis Montag schicken',
    }));
  });

  it('bleibt bei „Nicht erreicht“ freiwillig und stößt die Abläufe an', async () => {
    await anzeigen({ ergebnis: 'nicht_erreicht' });
    expect(screen.getByLabelText(/^Zusammenfassung/)).not.toBeRequired();
    speichern();
    await waitFor(() => expect(m.ergebnis).toHaveBeenCalledWith(expect.objectContaining({ ergebnis: 'nicht_erreicht', eigeneAufgabe: false })));
    expect(m.aktivitaet).toHaveBeenCalledWith(expect.objectContaining({ beschreibung: 'Anruf mit Testkunde: Nicht erreicht' }));
    expect(m.aufgabe).not.toHaveBeenCalled();
    expect(m.close).toHaveBeenCalled();
  });
});

describe('Aufgabe aus dem Anruf-Protokoll', () => {
  it('belegt Titel und Fälligkeit bei „Nicht erreicht“ nach der Staffel vor und legt genau eine Aufgabe an', async () => {
    // Zweiter Versuch: laut Staffel morgen 09:00.
    await anzeigen({ nichtErreichtCount: 1, ergebnis: 'nicht_erreicht' });
    aufgabeOeffnen();
    expect(screen.getByLabelText('Titel der Aufgabe')).toHaveValue('Rückruf: Testkunde');
    expect(screen.getByLabelText('Fällig am')).toHaveValue('27.09.2026');
    expect(screen.getByLabelText('Uhrzeit der Aufgabe')).toHaveValue('09:00');

    speichern();
    await waitFor(() => expect(m.aufgabe).toHaveBeenCalledTimes(1));
    expect(m.aufgabe).toHaveBeenCalledWith(expect.objectContaining({
      kontaktId: 'kunde-1', titel: 'Rückruf: Testkunde', faelligAm: '2026-09-27', uhrzeit: '09:00', prioritaet: 'mittel',
    }));
    // Die Seite erfährt davon und lässt ihre automatische Nachfass-Aufgabe weg.
    expect(m.ergebnis).toHaveBeenCalledWith(expect.objectContaining({ ergebnis: 'nicht_erreicht', eigeneAufgabe: true }));
  });

  it('schlägt nach einem Gespräch morgen 10:00 vor', async () => {
    await anzeigen({ ergebnis: 'kein_interesse' });
    aufgabeOeffnen();
    expect(screen.getByLabelText('Fällig am')).toHaveValue('27.09.2026');
    expect(screen.getByLabelText('Uhrzeit der Aufgabe')).toHaveValue('10:00');
  });

  it('lehnt eine Fälligkeit in der Vergangenheit ab, bevor irgendetwas gespeichert ist', async () => {
    await anzeigen({ ergebnis: 'nicht_erreicht' });
    aufgabeOeffnen();
    fireEvent.change(screen.getByLabelText('Fällig am'), { target: { value: '26.09.2026' } });
    fireEvent.change(screen.getByLabelText('Uhrzeit der Aufgabe'), { target: { value: '09:00' } });
    speichern();
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Der Termin muss in der Zukunft liegen' })));
    // Vorher war das Protokoll an dieser Stelle schon gespeichert, ein
    // zweiter Klick legte es doppelt an.
    expect(m.aktivitaet).not.toHaveBeenCalled();
    expect(m.ergebnis).not.toHaveBeenCalled();
    expect(m.aufgabe).not.toHaveBeenCalled();
  });
});

describe('Schließen nach einem gestarteten Anruf', () => {
  function schliessen() {
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  }

  it('fragt nach und bleibt offen, wenn weiter protokolliert wird', async () => {
    m.confirm.mockResolvedValue(false);
    await anzeigen({ anrufGestartet: true });
    schliessen();
    await waitFor(() => expect(m.confirm).toHaveBeenCalledWith(expect.objectContaining({
      confirmText: 'Ohne Protokoll schließen', cancelText: 'Weiter protokollieren',
    })));
    await act(async () => {});
    expect(m.close).not.toHaveBeenCalled();
  });

  it('schließt, wenn ausdrücklich ohne Protokoll geschlossen wird', async () => {
    m.confirm.mockResolvedValue(true);
    await anzeigen({ anrufGestartet: true });
    schliessen();
    await waitFor(() => expect(m.close).toHaveBeenCalledTimes(1));
  });

  it('fragt nicht, wenn das Protokoll ohne Anruf von Hand geöffnet wurde', async () => {
    await anzeigen();
    schliessen();
    await waitFor(() => expect(m.close).toHaveBeenCalledTimes(1));
    expect(m.confirm).not.toHaveBeenCalled();
  });
});

describe('Verdrahtung im Kundenprofil', () => {
  /*
   * Die Seite selbst ist zu groß, um sie im Test zu rendern. Wie in
   * `objektauswahlEineStelle.test.ts` sichern diese Prüfungen am Quelltext
   * ab, dass kein Anrufen-Einstieg am Protokoll vorbeiläuft.
   */
  const seite = readFileSync(resolve(process.cwd(), 'src/pages/KundenDetail.tsx'), 'utf8');

  it('startet jeden Anruf über die eine Stelle, die auch das Protokoll öffnet', () => {
    const rumpf = seite.slice(seite.indexOf('const rufeAnUndProtokolliere'), seite.indexOf('const fuehreSchnellaktionAus'));
    expect(rumpf).toContain('starteAnrufFuerKontakt(');
    expect(rumpf).toContain('setActionDialog("anruf_protokoll")');
    expect(rumpf).toContain('setAnrufGestartet(true)');
    // Außerhalb dieser Stelle wird nirgends mehr direkt gewählt.
    expect(seite.split('starteAnrufFuerKontakt(').length - 1).toBe(1);
  });

  it('lässt die Aktionsleiste sofort wählen statt den Zwischendialog zu öffnen', () => {
    expect(seite).toContain('rufeAnUndProtokolliere(kunde?.telefon, "Schnellaktion")');
    expect(seite).not.toContain('setActionDialog("anruf")');
  });

  it('führt jede Telefonnummer im Profil über dieselbe Stelle, auch die von Person 2', () => {
    const telZeilen = seite.split('\n').filter((z) => z.includes('`tel:'));
    expect(telZeilen.length).toBe(4);
    for (const zeile of telZeilen) expect(zeile).toContain('rufeAnUndProtokolliere(');
  });

  it('legt bei „Nicht erreicht“ keine zweite Aufgabe an, wenn der Nutzer selbst eine anlegt', () => {
    expect(seite).toContain('handleSetterNichtErreicht({ ohneNachfassAufgabe: r.eigeneAufgabe })');
    const zweig = seite.slice(seite.indexOf('if (isAdvancedStage) {'), seite.indexOf('// E-Mail an Lead bei jedem Versuch'));
    expect(zweig).toMatch(/if \(!opts\.ohneNachfassAufgabe\) \{\s*try \{\s*addGeteilteAufgabe\(/);
  });

  it('gibt dem Dialog weiter, dass ein Anruf lief, und vergisst es beim Schließen', () => {
    expect(seite).toContain('anrufGestartet={anrufGestartet}');
    expect(seite).toContain('onClose={() => { setActionDialog(null); setAnrufGestartet(false); }}');
  });
});

