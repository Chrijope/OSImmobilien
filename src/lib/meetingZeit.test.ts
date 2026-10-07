import { describe, it, expect } from 'vitest';
import { meetingZeitISO } from './meetingZeit';
describe('Meetingzeit Europe/Berlin', () => {
  it('rechnet Sommer- und Winterzeit unabhängig vom Browser', () => {
    expect(meetingZeitISO('2026-09-09','14:00')).toBe('2026-09-09T12:00:00.000Z');
    expect(meetingZeitISO('2026-12-09','14:00')).toBe('2026-12-09T13:00:00.000Z');
  });
  it('lehnt die nicht vorhandene Stunde bei Sommerzeitbeginn ab', () => {
    expect(() => meetingZeitISO('2026-03-29','02:30')).toThrow('Zeitumstellung');
  });
  it('lehnt ungültige Eingaben ab', () => {
    expect(() => meetingZeitISO('2026-02-31','10:00')).toThrow();
    expect(() => meetingZeitISO('2026-01-01','25:00')).toThrow();
  });
});
