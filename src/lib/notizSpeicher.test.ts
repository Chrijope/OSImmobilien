import { describe, it, expect, vi } from 'vitest';
import { erstelleNotizSpeicher } from './notizSpeicher';
describe('Notizen verlustfrei speichern', () => {
  it('schreibt Änderungen in Reihenfolge, auch wenn die erste Antwort spät kommt', async () => {
    let fertig!: (ok: boolean) => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<boolean>((r) => { fertig = r; })).mockResolvedValue(true);
    const save = erstelleNotizSpeicher(write);
    const first = save('eins'); const last = save('letzte Eingabe');
    await Promise.resolve(); await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    fertig(true); await first; await last;
    expect(write.mock.calls.map(([text]) => text)).toEqual(['eins', 'letzte Eingabe']);
  });
  it('verarbeitet die nächste Eingabe trotz Netzwerkfehler', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    const save = erstelleNotizSpeicher(write);
    expect(await save('erst')).toBe(false);
    expect(await save('vollständig')).toBe(true);
  });
});
