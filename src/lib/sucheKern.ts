/**
 * Der gemeinsame Kern der Fragensuche.
 *
 * Er stand zuerst im Vertriebshandbuch und wurde am 11.09.2026 hier
 * herausgelöst, weil die Vertriebsakademie genau dieselbe Suche braucht.
 * Zwei Kopien derselben Regel laufen nach der ersten Änderung auseinander,
 * und dann findet dieselbe Frage an zwei Stellen Verschiedenes.
 *
 * Die Regel ist bewusst einfach und ohne künstliche Intelligenz:
 *
 *   1. **Füllwörter fliegen raus.** "wann bekomme ich eine glocke" wird zu
 *      "bekomme glocke". Sonst gewinnt jeder Text, in dem zufällig "ich"
 *      vorkommt.
 *   2. **Die Frage wiegt schwerer als der Fließtext.** Wer die Frage trägt,
 *      die der Nutzer stellt, ist gemeint.
 *   3. **Wer mehrere Wörter der Frage trifft, gewinnt.** Deshalb zählt der
 *      Anteil der getroffenen Wörter mit, nicht nur die Summe der Punkte.
 *
 * Eine nachvollziehbare Regel ist hier mehr wert als ein kluger Zufall: Wer
 * nicht findet, was er sucht, soll die Suche mit einem anderen Wort
 * wiederholen können und verstehen, warum es diesmal klappt.
 */

/** Wörter ohne Aussagekraft, die jede Frage mitbringt. */
export const FUELLWOERTER = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "eines", "einer",
  "und", "oder", "aber", "wenn", "dann", "also", "auch", "noch", "schon", "nur", "denn",
  "ich", "du", "er", "sie", "es", "wir", "ihr", "man", "mir", "mich", "dir", "dich",
  "ist", "sind", "war", "waren", "wird", "werden", "wurde", "hat", "habe", "haben", "kann",
  "muss", "soll", "will", "darf", "gibt", "geht", "macht", "machen", "tun", "sein",
  "was", "wer", "wie", "wo", "wann", "warum", "welche", "welcher", "welches", "wieso",
  "im", "in", "an", "am", "auf", "aus", "bei", "mit", "von", "vom", "zu", "zum", "zur",
  "fuer", "für", "ueber", "über", "nach", "vor", "seit", "bis", "ohne", "durch", "gegen",
  "sich", "nicht", "kein", "keine", "mal", "etwas", "alles", "immer", "dass", "damit",
  "meine", "mein", "meinem", "meinen", "passiert", "bedeutet",
]);

/** Umlaute vereinheitlichen, damit "fällig" und "faellig" dasselbe finden. */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Eine ganze Frage in die Wörter zerlegen, auf die es ankommt. */
export function zerlegeFrage(frage: string): string[] {
  return normalisiere(frage)
    .split(" ")
    .filter((w) => w.length >= 3 && !FUELLWOERTER.has(w));
}

/**
 * Die durchsuchbaren Felder einer Fundstelle, alle bereits normalisiert.
 *
 * Die Namen stammen aus dem Handbuch, gelten aber genauso für die Akademie:
 * `frage` ist die Stelle, an der die Frage des Nutzers wörtlich stehen könnte,
 * `titel` die Überschrift, `schlagworte` die andere Wortwahl für dieselbe
 * Sache, `bereich` die Umgebung (Abschnitt oder Kapitel) und `text` alles
 * Übrige.
 */
export interface SuchFelder {
  frage: string;
  titel: string;
  schlagworte: string;
  bereich: string;
  text: string;
}

export interface SuchWertung {
  punkte: number;
  getroffen: string[];
}

/**
 * Wie viel ein Wort wert ist, gemessen daran, wie verbreitet es im Bestand ist.
 *
 * "Kunde" steht in fast jedem Abschnitt der Akademie und entscheidet deshalb
 * nichts; "Grunderwerbsteuer" steht in dreien und entscheidet alles. Ohne
 * diese Abstufung gewinnt bei einer ganzen Frage regelmäßig der längste
 * Abschnitt, weil er zufällig die meisten Allerweltswörter enthält.
 *
 * `anteil` ist der Anteil der Fundstellen, die das Wort überhaupt enthalten.
 * Die Stufen sind bewusst grob: Sie sollen erklärbar bleiben.
 */
export function seltenheitsGewicht(anteil: number): number {
  if (anteil > 0.5) return 0.3;
  if (anteil > 0.25) return 0.6;
  return 1;
}

/**
 * Sucht aus mehreren einzelnen Fragen die eine heraus, die am besten passt.
 *
 * Gebraucht wird das dort, wo eine Fundstelle nicht eine Frage trägt, sondern
 * viele, etwa ein Akademieabschnitt mit fünf Einwänden. Würde man sie
 * aneinanderhängen, gewänne jeder Abschnitt mit vielen Einwänden gegen den
 * einen, der den gesuchten Einwand wirklich beantwortet: Die Wörter der Frage
 * verteilen sich dann auf fünf verschiedene Sätze und zählen trotzdem alle
 * schwer. Maßgeblich ist deshalb der Satz, in dem die meisten Wörter
 * zusammen stehen.
 *
 * Die Einträge müssen bereits normalisiert sein.
 */
export function besteFrage(woerter: string[], fragen: string[]): string {
  let beste = "";
  let meiste = 0;
  for (const f of fragen) {
    let treffer = 0;
    for (const wort of woerter) if (f.includes(wort)) treffer++;
    if (treffer > meiste) {
      meiste = treffer;
      beste = f;
    }
  }
  return beste;
}

/**
 * Bewertet eine einzelne Fundstelle. Gibt `null` zurück, wenn kein einziges
 * Wort getroffen hat, damit die Aufrufer nicht selbst auf Null prüfen müssen.
 */
export function bewerte(
  woerter: string[],
  felder: SuchFelder,
  gewicht: (wort: string) => number = () => 1,
): SuchWertung | null {
  if (woerter.length === 0) return null;

  let punkte = 0;
  const getroffen: string[] = [];

  for (const wort of woerter) {
    let wertung = 0;
    if (felder.frage.includes(wort)) wertung += 6;
    if (felder.titel.includes(wort)) wertung += 4;
    if (felder.schlagworte.includes(wort)) wertung += 4;
    if (felder.bereich.includes(wort)) wertung += 2;
    if (felder.text.includes(wort)) wertung += 1;
    if (wertung > 0) {
      punkte += wertung * gewicht(wort);
      getroffen.push(wort);
    }
  }

  if (punkte === 0) return null;

  /*
    Wer mehrere Wörter der Frage trifft, ist fast immer gemeinter als wer ein
    einziges häufiges Wort oft enthält. Deshalb zählt der Anteil der
    getroffenen Wörter mit, nicht nur die Summe.
  */
  const anteil = getroffen.length / woerter.length;
  return { punkte: punkte * (0.5 + anteil), getroffen };
}

/**
 * Ein kurzer Ausschnitt um das erste getroffene Wort, für die Trefferliste.
 * Der Ausschnitt kommt aus dem rohen Text, nicht aus dem normalisierten:
 * gelesen wird er von einem Menschen.
 */
export function textAusschnittAus(roh: string, wort: string, laenge = 160): string {
  const sauber = roh.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const stelle = wort ? normalisiere(sauber).indexOf(wort) : -1;
  if (stelle < 0) return sauber.slice(0, laenge).trim() + (sauber.length > laenge ? " …" : "");
  const von = Math.max(0, Math.round(stelle - laenge / 3));
  const ausschnitt = sauber.slice(von, von + laenge).trim();
  return (von > 0 ? "… " : "") + ausschnitt + (von + laenge < sauber.length ? " …" : "");
}
