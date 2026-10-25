import { alsDatumsString, heuteAlsString, istUeberfaellig, liegtInZukunft } from './faelligkeit';
import type { InboxVorgang } from './inboxVorgaenge';
export type HeuteFilter = 'alle' | 'follow_up' | 'aufgabe' | 'termine';
export function dashboardHeute(vorgaenge: InboxVorgang[], filter: HeuteFilter, jetzt = new Date()) {
  const passend = [...new Map(vorgaenge.map(v => [v.id,v])).values()].filter(v =>
    !liegtInZukunft(v.faellig_am,jetzt) && (filter === 'alle' || (filter === 'termine' ? ['anruf','meeting','deadline'].includes(v.typ) : v.typ === filter)));
  passend.sort((a,b) => {
    const spaetA=istUeberfaellig(a.faellig_am,a.uhrzeit,jetzt),spaetB=istUeberfaellig(b.faellig_am,b.uhrzeit,jetzt);
    return Number(spaetB)-Number(spaetA) ||
      (alsDatumsString(a.faellig_am) || '9999').localeCompare(alsDatumsString(b.faellig_am) || '9999') ||
      (/^\d{1,2}:\d{2}/.test(a.uhrzeit) ? a.uhrzeit.padStart(5,'0') : '99:99').localeCompare(/^\d{1,2}:\d{2}/.test(b.uhrzeit) ? b.uhrzeit.padStart(5,'0') : '99:99') || a.id.localeCompare(b.id);
  });
  return {gesamt:passend.length,heute:passend.filter(v => alsDatumsString(v.faellig_am) === heuteAlsString(jetzt)).length,
    ueberfaellig:passend.filter(v => istUeberfaellig(v.faellig_am,v.uhrzeit,jetzt)).length,
    ohneTermin:passend.filter(v => !alsDatumsString(v.faellig_am)).length,vorschau:passend.slice(0,5)};
}
