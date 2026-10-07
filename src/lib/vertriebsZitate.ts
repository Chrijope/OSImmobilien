// 53 motivierende Vertriebszitate – ein Zitat pro Kalenderwoche, das ganze Jahr
export interface VertriebsZitat {
  text: string;
  author: string;
}

export const VERTRIEBS_ZITATE: VertriebsZitat[] = [
  { text: "Erfolg ist die Summe richtiger Entscheidungen, getroffen Tag für Tag.", author: "Jim Rohn" },
  { text: "Menschen kaufen nicht, was du tust – sie kaufen, warum du es tust.", author: "Simon Sinek" },
  { text: "Beginne dort, wo du bist. Nutze, was du hast. Tu, was du kannst.", author: "Arthur Ashe" },
  { text: "Verkaufen heißt zuhören – nicht reden.", author: "Brian Tracy" },
  { text: "Der beste Weg, die Zukunft vorherzusagen, ist, sie zu gestalten.", author: "Peter Drucker" },
  { text: "Disziplin ist die Brücke zwischen Zielen und Ergebnissen.", author: "Jim Rohn" },
  { text: "Wer nicht fragt, bleibt dumm – und ohne Abschluss.", author: "Sesamstraße (frei nach)" },
  { text: "Erfolg ist kein Zufall. Er ist harte Arbeit, Ausdauer und Lernen.", author: "Pelé" },
  { text: "Energie und Beharrlichkeit besiegen alles.", author: "Benjamin Franklin" },
  { text: "Mach jeden Tag eine Sache, vor der du dich fürchtest.", author: "Eleanor Roosevelt" },
  { text: "Verkäufer scheitern nicht – sie geben einfach zu früh auf.", author: "Zig Ziglar" },
  { text: "Du verkaufst keine Produkte, du verkaufst bessere Versionen vom Leben deines Kunden.", author: "Unbekannt" },
  { text: "Ein Ziel ohne Plan ist nur ein Wunsch.", author: "Antoine de Saint-Exupéry" },
  { text: "Qualität bedeutet, es richtig zu tun, wenn niemand zuschaut.", author: "Henry Ford" },
  { text: "Glaube an dich – auch dann, wenn niemand sonst es tut.", author: "Muhammad Ali" },
  { text: "Erfolg ist 1 % Inspiration und 99 % Transpiration.", author: "Thomas Edison" },
  { text: "Niemand plant zu scheitern – aber viele scheitern am Planen.", author: "Benjamin Franklin" },
  { text: "Dein Einkommen wächst nur dann, wenn du wächst.", author: "Tony Robbins" },
  { text: "Großes entsteht, wenn man tut, was andere für unmöglich halten.", author: "Walt Disney" },
  { text: "Verkaufen ist Vertrauen aufbauen – Stück für Stück.", author: "Jeffrey Gitomer" },
  { text: "Du musst die Veränderung sein, die du in der Welt sehen willst.", author: "Mahatma Gandhi" },
  { text: "Kunden kaufen Emotionen und rechtfertigen es mit Logik.", author: "Zig Ziglar" },
  { text: "Der einzige Ort, an dem Erfolg vor Arbeit kommt, ist das Wörterbuch.", author: "Vidal Sassoon" },
  { text: "Konzentrier dich auf den nächsten Anruf, nicht auf die nächste Provision.", author: "Grant Cardone" },
  { text: "Jeder Experte war einmal ein Anfänger.", author: "Helen Hayes" },
  { text: "Wenn du keine eigenen Träume baust, stellt dich jemand ein, um seine zu bauen.", author: "Tony Gaskins" },
  { text: "Halbjahresmitte: Wer jetzt nicht jagt, sitzt im Dezember am leeren Tisch.", author: "Vertriebsweisheit" },
  { text: "Im Vertrieb gewinnt nicht der Beste, sondern der Beständigste.", author: "Unbekannt" },
  { text: "Aktivität schlägt Talent, wenn Talent nicht aktiv ist.", author: "Tim Notke" },
  { text: "Frag nach dem Abschluss – sonst tut es die Konkurrenz.", author: "Brian Tracy" },
  { text: "Was du heute säst, erntest du im nächsten Quartal.", author: "Vertriebsweisheit" },
  { text: "Empfehlungen sind die ehrlichste Form der Bezahlung.", author: "Unbekannt" },
  { text: "Erst zuhören, dann verstehen, dann verkaufen.", author: "Stephen Covey" },
  { text: "Ein gutes Gespräch ist 80 % Vorbereitung und 20 % Persönlichkeit.", author: "Unbekannt" },
  { text: "Komfortzone ist der Friedhof der Träume.", author: "Tony Robbins" },
  { text: "Top-Verkäufer haben keinen besseren Tag – sie haben bessere Gewohnheiten.", author: "Unbekannt" },
  { text: "Kein Nein ist endgültig – es bedeutet meist „noch nicht“.", author: "Jeffrey Gitomer" },
  { text: "Wer Kunden begeistert, braucht keine Rabatte.", author: "Edgar K. Geffroy" },
  { text: "Pipeline ist Pflicht – Abschluss ist die Kür.", author: "Vertriebsweisheit" },
  { text: "Vertrauen kommt zu Fuß und geht im Galopp.", author: "Sprichwort" },
  { text: "Klarheit schafft Tempo. Tempo schafft Abschlüsse.", author: "Unbekannt" },
  { text: "Q4 entscheidet das Jahr. Bleib dran.", author: "Vertriebsweisheit" },
  { text: "Verkäufer sind die Helden des Mittelstands.", author: "Hermann Scherer" },
  { text: "Mut steht am Anfang des Handelns, Glück am Ende.", author: "Demokrit" },
  { text: "Wer aufhört, besser zu werden, hat aufgehört, gut zu sein.", author: "Philip Rosenthal" },
  { text: "Heute ist der erste Tag vom Rest deines Jahres.", author: "Unbekannt" },
  { text: "Jeder Anruf bringt dich näher an dein Ziel – auch ein Nein.", author: "Grant Cardone" },
  { text: "Im Vertrieb zählt nicht die Stunde, sondern was du daraus machst.", author: "Unbekannt" },
  { text: "Endspurt: Wer jetzt nachlässt, verliert das Momentum für das neue Jahr.", author: "Vertriebsweisheit" },
  { text: "Der beste Verkäufer ist der, dem der Kunde vertraut.", author: "Unbekannt" },
  { text: "Pflege deine Bestandskunden – sie sind dein bestes Asset.", author: "Philip Kotler" },
  { text: "Reflektiere das Jahr, plane das nächste, feiere die Erfolge.", author: "Vertriebsweisheit" },
  { text: "Was du jetzt vorbereitest, schließt du im Januar ab.", author: "Vertriebsweisheit" },
];

// ISO-Kalenderwoche (1-53)
export function getISOWeek(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getWochenZitat(date: Date = new Date()) {
  const kw = getISOWeek(date);
  const idx = (kw - 1) % VERTRIEBS_ZITATE.length;
  return { ...VERTRIEBS_ZITATE[idx], kw };
}