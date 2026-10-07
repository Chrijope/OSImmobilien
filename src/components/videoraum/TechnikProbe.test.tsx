import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
const eis = vi.hoisted(() => vi.fn());
vi.mock('@/lib/videoraumVerbindung', () => ({ ladeEisServer: eis }));
vi.mock('@/lib/videocallHintergrund', () => ({ erstelleHintergrundRegie: vi.fn() }));
vi.mock('@/lib/videocallHintergrundStore', () => ({ hintergrundBildUrl: vi.fn() }));
import { TechnikProbe } from './TechnikProbe';
afterEach(cleanup);
describe('Technikprobe', () => {
  it('fragt Geräte erst nach einem bewussten Klick an und erklärt verweigerten Zugriff', async () => {
    const media=vi.fn().mockRejectedValue(new DOMException('denied','NotAllowedError'));
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:media}});
    render(<TechnikProbe spiegeln hintergrund={{art:'aus'}} />);
    expect(media).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Vorschau starten'));
    await waitFor(() => expect(screen.getByText(/Website-Berechtigungen/)).toBeInTheDocument());
  });
  it('unterscheidet fehlenden Relay vom erreichbaren Dienst', async () => {
    eis.mockResolvedValueOnce([{urls:'stun:example.test'}]).mockResolvedValueOnce([{urls:['turn:example.test']}]);
    render(<TechnikProbe spiegeln hintergrund={{art:'aus'}} />);
    fireEvent.click(screen.getByText('Verbindungsdienst prüfen'));
    await waitFor(() => expect(screen.getByText(/kein Relay verfügbar/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Verbindungsdienst prüfen'));
    await waitFor(() => expect(screen.getByText(/Verbindungsdienst mit Relay verfügbar/)).toBeInTheDocument());
  });
});
