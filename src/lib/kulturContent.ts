// MOREImmo Kultur-Modul
//
// Zentrale Quelle für Werte, Standards, Glaubenssätze, Feindbilder und Vision.
// Jede Stelle im CRM liest von hier: die Kulturseite, das Kultur-Kapitel der
// Vertriebsakademie, der Glaubenssatz des Tages im Dashboard, der Wert der
// Woche auf der Weekly-Call-Kachel und das Kultur-PDF. Ändert sich hier ein
// Wert, ändert er sich überall.
//
// Grundlage: die Kultur-Säule aus dem Vertriebssystem der Marktführer,
// zugeschnitten auf MOREImmo. Vier Werte statt acht, denn wer acht Werte hat,
// hat keine. Feindbilder richten sich gegen Verhalten, nie gegen Menschen;
// dazu kommen zwei äußere Gegner, gegen die wir für unsere Kunden antreten.

export interface KulturWert {
  titel: string;
  text: string;
}

export interface KulturStandard {
  titel: string;
  text: string;
  /** true, wenn das CRM die Einhaltung selbst messen kann */
  messbar?: boolean;
}

export interface KulturFeindbild {
  titel: string;
  text: string;
  /** intern = eigenes Verhalten, extern = wogegen wir für Kunden antreten */
  richtung: "intern" | "extern";
}

/** Vier Werte. Werte werden gelebt, nicht plakatiert. */
export const KULTUR_WERTE: KulturWert[] = [
  {
    titel: "Ehrlich rechnen",
    text: "Wer uns vertraut, hat ein Recht auf die Zahl, die stimmt, auch wenn eine andere freundlicher aussähe. Wir nennen das gute Jahr und das schwierige im selben Atemzug. Ein Nein zum falschen Objekt ist uns lieber als ein Ja, das jemand in zwei Jahren bereut.",
  },
  {
    titel: "Verstehen vor Zustimmung",
    text: "Am Ende eines guten Gesprächs steht kein überredeter Mensch, sondern ein informierter. Wir erklären so lange, bis unser Gegenüber die eigene Entscheidung selbst begründen kann. Die Entscheidung gehört ihm, nicht uns.",
  },
  {
    titel: "Verlässlich sein",
    text: "Ein zugesagter Rückruf findet statt, ein Termin steht, eine offene Frage bleibt nicht liegen. Verlässlichkeit ist die Währung, in der Vertrauen ausgezahlt wird, gegenüber unseren Kunden genauso wie im Team.",
  },
  {
    titel: "Begleiten statt abschließen",
    text: "Unsere Arbeit endet nicht beim Notartermin, sie beginnt dort. Wir bleiben ansprechbar, wenn die erste Nebenkostenabrechnung kommt und wenn die zweite Immobilie ansteht. Dass ein Kunde ein zweites Mal mit uns arbeitet, ist der einzige Beweis, der wirklich zählt.",
  },
];

/**
 * Sechs Standards. Jeder ist ein Versprechen an die Menschen, die mit uns
 * arbeiten, und fünf davon kann das CRM selbst nachhalten. Deshalb stehen sie
 * im System und nicht auf einem Poster.
 */
export const KULTUR_STANDARDS: KulturStandard[] = [
  {
    titel: "Antwort binnen 24 Stunden",
    text: "Wer sich bei uns meldet, hört innerhalb eines Tages von uns. Niemand soll mit einer offenen Frage warten.",
    messbar: true,
  },
  {
    titel: "Noch am selben Tag festgehalten",
    text: "Was besprochen wurde, steht am selben Tag im System. So muss niemand seine Geschichte beim nächsten Mal noch einmal erzählen.",
    messbar: true,
  },
  {
    titel: "Immer ein nächster Schritt",
    text: "Zu jedem Kunden gehört ein vereinbarter Termin oder eine offene Aufgabe. Niemand fällt zwischen zwei Gespräche.",
    messbar: true,
  },
  {
    titel: "Erst die Zahlen, dann das Objekt",
    text: "Ohne ausgefüllte Selbstauskunft gibt es keinen Objektvorschlag. Alles andere wäre geraten, und Raten kann sich niemand leisten, der hier viel Geld anlegt.",
    messbar: true,
  },
  {
    titel: "Jede Zahl kommt aus dem System",
    text: "Im Gespräch nennen wir nur Zahlen, die auch später im Profil stehen. Eine schnell geschätzte Zahl, die nicht hält, beschädigt das ganze Gespräch rückwirkend.",
    messbar: true,
  },
  {
    titel: "Weekly Sales Call",
    text: "Pünktlich und mit Kamera. Die Stunde gehört dem Team und den Fällen, bei denen jemand Unterstützung braucht.",
  },
];

/**
 * Sieben Glaubenssätze in Ich-Form. Positiv, kurz genug zum Merken.
 * Einer davon steht jeden Tag im Dashboard, für alle im Team derselbe.
 */
export const KULTUR_GLAUBENSSAETZE: string[] = [
  "Ich rufe an, bevor ich mich bereit fühle. Auf der anderen Seite wartet jemand auf eine Antwort.",
  "Ein Nein ist eine Information, keine Bewertung meiner Person.",
  "Ich verkaufe nichts. Ich mache verständlich, was möglich ist, und die Entscheidung gehört dem Menschen mir gegenüber.",
  "Meine Zahlen sind das Ergebnis meiner Gewohnheiten, nicht meines Glücks.",
  "Aufs und Abs gehören dazu. Ich bleibe im Prozess, auch wenn die Woche nicht läuft.",
  "Wenn ich etwas nicht weiß, sage ich das und finde es heraus. Das kostet mich nichts und bringt meinem Kunden alles.",
  "Ich übernehme die Verantwortung für jeden Menschen, der in meiner Pipeline steht.",
];

/**
 * Feindbilder schweißen zusammen, aber sie richten sich gegen Verhalten,
 * nie gegen Menschen. Vier innere Gegner, zwei äußere, gegen die wir für
 * unsere Kunden antreten.
 */
export const KULTUR_FEINDBILDER: KulturFeindbild[] = [
  {
    titel: "Schöngerechnete Zahlen",
    text: "Wer eine Steuerwirkung zeigt, die nur im ersten Jahr gilt, und das fünfte Jahr verschweigt, verkauft eine Enttäuschung mit Zeitverzögerung.",
    richtung: "intern",
  },
  {
    titel: "Der meldet sich schon",
    text: "Wer darauf wartet, überlässt einen Menschen mit einer offenen Frage sich selbst. Melden ist unsere Aufgabe, nicht seine.",
    richtung: "intern",
  },
  {
    titel: "Das haben wir immer so gemacht",
    text: "Der Satz, der jede Verbesserung stoppt. Wir fragen lieber, was unseren Kunden heute wirklich hilft.",
    richtung: "intern",
  },
  {
    titel: "Unverbindlichkeit",
    text: "Ein Vielleicht hilft niemandem weiter. Klarheit ist freundlicher als ein hingehaltenes Ja, auch wenn sie im Moment unbequemer ist.",
    richtung: "intern",
  },
  {
    titel: "Die stille Geldentwertung",
    text: "Der eigentliche Gegner unserer Kunden: Erspartes, das auf dem Konto Jahr für Jahr an Kaufkraft verliert, ohne dass es jemand bemerkt. Genau davor wollen wir Menschen bewahren.",
    richtung: "extern",
  },
  {
    titel: "Versprechen ohne Deckung",
    text: "Anbieter, die nur die guten Jahre zeigen und Wertsteigerung als sicher verkaufen. Wir rechnen ehrlich, auch wenn die ehrliche Zahl kleiner ist. Genau daran soll man uns erkennen.",
    richtung: "extern",
  },
];

/**
 * Vision, Jahresziel und Warum sind Chefsache. Die Texte hier sind ein
 * gekennzeichneter Entwurf und werden ersetzt, sobald Christian seine
 * Fassung liefert. Nur an dieser Stelle ändern, alle Ansichten ziehen mit.
 */
export const KULTUR_VISION = {
  /** Entwurf, von Christian zu bestätigen oder zu ersetzen */
  entwurf: true,
  satz: "Wir machen den Aufbau von Vermögen mit Immobilien für Menschen erreichbar, die keine Millionen mitbringen: ehrlich gerechnet, persönlich begleitet und in Jahrzehnten gedacht statt in Abschlüssen.",
  warum:
    "Über Geld wird selten offen gesprochen, und wer sich nicht auskennt, traut sich am wenigsten zu fragen. MOREImmo gibt es, damit gute Beratung nicht davon abhängt, wie viel jemand schon besitzt. Ehrliche Beratung im Immobilienvertrieb soll der Normalfall sein und nicht die Ausnahme.",
  ziele: [
    "Jeder Kunde versteht seine eigene Rechnung vollständig, auch die unbequemen Zahlen darin.",
    "Niemand unterschreibt bei uns etwas, das er nicht selbst erklären könnte.",
    "Empfehlungen entstehen aus guter Betreuung, nie aus Druck.",
    "Jeder Partner weiß, wo er steht, was er kann und wie es für ihn weitergeht.",
  ],
};

/** Das Funkengespräch aus dem Onboarding: einmal Feuer entfachen. */
export const FUNKENGESPRAECH_FRAGEN = [
  "Was ist deine Vision?",
  "Warum bist du hier?",
  "Was willst du erreichen?",
];

/* ── Rotation ─────────────────────────────────────────────────── */

/** Tag im Jahr (1 bis 366) für die deterministische Tagesrotation. */
function tagImJahr(datum: Date): number {
  const start = new Date(datum.getFullYear(), 0, 0);
  return Math.floor((datum.getTime() - start.getTime()) / 86400000);
}

/** ISO-Kalenderwoche für die Wochenrotation. */
export function isoWoche(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const tag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tag);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jahresStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Der Glaubenssatz des Tages. Wechsel nach Datum, nicht zufällig, damit alle
 * im Team am selben Tag denselben Satz sehen und man sich im Weekly Call
 * darauf beziehen kann.
 */
export function glaubenssatzDesTages(datum: Date = new Date()): string {
  const index = (tagImJahr(datum) + datum.getFullYear()) % KULTUR_GLAUBENSSAETZE.length;
  return KULTUR_GLAUBENSSAETZE[index];
}

/** Der Wert der Woche: vier Werte, vier Wochen, dann von vorn. */
export function wertDerWoche(datum: Date = new Date()): KulturWert {
  const index = (isoWoche(datum) + datum.getFullYear()) % KULTUR_WERTE.length;
  return KULTUR_WERTE[index];
}
