/**
 * Der Chat im Videoraum: Regeln und Gedaechtnis.
 *
 * Geschrieben wird ueber den Signalkanal, der ohnehin schon steht, siehe
 * `RegieBefehl` mit der Art „chat". Das ist derselbe Weg, ueber den heute
 * „stumm", „tonstand" und „bildschirm" laufen: ein Broadcast bei Supabase
 * Realtime, dessen Kanalname am Geheimnis des Raumes haengt. Der Vorteil wiegt
 * schwer: Ein Gast hat kein Konto und keine Anmeldung, er koennte in
 * `chat_nachrichten` gar nicht schreiben, ohne dass eigens eine
 * SECURITY-DEFINER-Funktion samt Zeilensicherheit dafuer gebaut wird.
 *
 * Der Preis: Der Kanal merkt sich nichts. Wer spaeter dazukommt, sieht nichts
 * von vorher, und mit dem Auflegen ist alles weg. Das ist bei Zoom nicht
 * anders und fuer ein Gespraech das richtige Verhalten. Was NICHT verloren
 * gehen darf, ist der Verlauf innerhalb einer laufenden Verbindung: Der
 * Gastgeber macht das Gespraech kleiner und wieder gross, und die Ansicht wird
 * dabei ab- und neu aufgebaut. Deshalb liegt der Verlauf hier im Modul und
 * nicht in der Ansicht. Er gilt genau fuer eine Verbindung und raeumt sich
 * selbst ab, sobald eine neue beginnt (andere `eigeneKennung`).
 *
 * Alles, was von aussen hereinkommt, ist fremdes Material: Ein Gast ist ein
 * Fremder ohne Konto. Deshalb wird jeder eingehende Beitrag geprueft,
 * gekuerzt und als reiner Text gehalten. Er wird nie als HTML eingesetzt.
 */

/** Hoechstlaenge eines Beitrags. Ein Gespraechschat ist kein Aufsatz. */
export const CHAT_MAX_ZEICHEN = 800;
/** Hoechstlaenge eines angezeigten Namens. */
export const CHAT_MAX_NAME = 60;
/** So viele Beitraege bleiben im Gedaechtnis. */
export const CHAT_VERLAUF_MAX = 200;

/** Eigene Sendegrenze: hoechstens so viele Beitraege im Zeitfenster. */
export const CHAT_SENDE_GRENZE = 5;
export const CHAT_SENDE_FENSTER_MS = 10_000;
/**
 * Empfangsgrenze je Gegenstelle, etwas grosszuegiger als die eigene.
 *
 * Die eigene Grenze ist Hoeflichkeit, diese hier ist Schutz: Ein fremder
 * Browser haelt sich an gar nichts, und ohne Grenze koennte er die Ansicht mit
 * Beitraegen zuschuetten. Verworfen wird still, ein Hinweis waere nur ein
 * zweiter Weg, die Ansicht vollzuschreiben.
 */
export const CHAT_EMPFANG_GRENZE = 12;
export const CHAT_EMPFANG_FENSTER_MS = 10_000;

export interface ChatBeitrag {
  /** Eindeutig je Beitrag. Verhindert Doppel, wenn dieselbe Nachricht zweimal ankommt. */
  id: string;
  /** Kennung des Absenders im Signalkanal, leer beim eigenen Beitrag. */
  von: string;
  name: string;
  text: string;
  /** Millisekunden seit 1970, beim Empfaenger notfalls die eigene Uhr. */
  zeit: number;
  eigen: boolean;
}

/** Was ueber die Leitung geht. Bewusst klein und ohne alles Ueberfluessige. */
export interface ChatNutzlast {
  id: string;
  name: string;
  text: string;
  zeit: number;
}

/**
 * Steuerzeichen raus, Laenge begrenzt, Rand abgeschnitten.
 *
 * Zeilenumbrueche bleiben erhalten, alles andere unterhalb von Leerzeichen
 * nicht: Solche Zeichen sind in einem Gespraechsbeitrag nie gemeint und
 * koennen in der Anzeige Unsinn anrichten. Mehr als zwei Umbrueche
 * hintereinander werden zu zweien, sonst schiebt ein einziger Beitrag den
 * ganzen Verlauf aus dem Bild.
 */
export function saeubereChatText(roh: unknown): string {
  if (typeof roh !== "string") return "";
  return ohneSteuerzeichen(roh, true)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, CHAT_MAX_ZEICHEN);
}

/** Derselbe Gedanke fuer den Namen, nur einzeilig und mit Rueckfall. */
export function saeubereChatName(roh: unknown, rueckfall = "Teilnehmer"): string {
  if (typeof roh !== "string") return rueckfall;
  const sauber = ohneSteuerzeichen(roh, false)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_NAME);
  return sauber || rueckfall;
}

/**
 * Steuerzeichen entfernen.
 *
 * Bewusst Zeichen fuer Zeichen und nicht mit einem regulaeren Ausdruck: Ein
 * Ausdruck ueber einen Bereich von Steuerzeichen enthaelt genau diese Zeichen
 * im Quelltext, und dort sieht man sie nicht. Eine Zeile, die aussieht wie
 * `[ - ]`, ist beim Lesen nicht zu verstehen und beim Bearbeiten leicht
 * kaputtzumachen.
 *
 * Der Zeilenumbruch ist der einzige Sonderfall: Im Beitrag bleibt er, im Namen
 * wird ein Leerzeichen daraus.
 */
function ohneSteuerzeichen(text: string, umbruchBehalten: boolean): string {
  let sauber = "";
  for (const zeichen of text) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code === 10) { sauber += umbruchBehalten ? "\n" : " "; continue; }
    // Alles unterhalb des Leerzeichens und das Loeschzeichen faellt weg.
    if (code < 32 || code === 127) continue;
    sauber += zeichen;
  }
  return sauber;
}

/** Eine Kennung fuer den eigenen Beitrag. Muss nur im Raum eindeutig sein. */
export function neueBeitragsId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Einen fremden Beitrag pruefen und in die eigene Form bringen.
 *
 * Gibt `null` zurueck, wenn nichts Brauchbares uebrig bleibt. Die Zeit kommt
 * von der Gegenstelle und darf deshalb nicht blind geglaubt werden: Eine
 * falsch gestellte Uhr wuerde den Beitrag sonst in die Zukunft oder weit in
 * die Vergangenheit setzen. Weicht sie um mehr als fuenf Minuten von der
 * eigenen ab, gilt die eigene.
 */
export function pruefeFremdenBeitrag(
  daten: unknown,
  von: string,
  jetzt = Date.now(),
): ChatBeitrag | null {
  if (!daten || typeof daten !== "object") return null;
  const roh = daten as Partial<ChatNutzlast>;
  const text = saeubereChatText(roh.text);
  if (!text) return null;

  const gemeldet = typeof roh.zeit === "number" && Number.isFinite(roh.zeit) ? roh.zeit : jetzt;
  const zeit = Math.abs(gemeldet - jetzt) > 5 * 60_000 ? jetzt : gemeldet;

  const id = typeof roh.id === "string" && roh.id.trim()
    ? `${von}:${roh.id.trim().slice(0, 40)}`
    : `${von}:${neueBeitragsId()}`;

  return { id, von, name: saeubereChatName(roh.name), text, zeit, eigen: false };
}

/**
 * Einen Beitrag aufnehmen. Doppel werden verworfen, der Verlauf bleibt
 * begrenzt und nach Zeit geordnet.
 *
 * Gibt die alte Liste unveraendert zurueck, wenn sich nichts aendert. Sonst
 * zeichnete React auch bei einem Doppel neu.
 */
export function nimmBeitragAn(bisher: readonly ChatBeitrag[], beitrag: ChatBeitrag): ChatBeitrag[] {
  if (bisher.some((b) => b.id === beitrag.id)) return bisher as ChatBeitrag[];
  const neu = [...bisher, beitrag];
  /*
   * Stabil nach Zeit sortieren. Zwei Beitraege mit derselben Zeit behalten
   * damit die Reihenfolge des Eintreffens, und ein Beitrag, der wegen einer
   * langsamen Leitung verspaetet ankommt, rutscht an seine Stelle statt ans
   * Ende.
   */
  neu.sort((a, b) => a.zeit - b.zeit);
  return neu.length > CHAT_VERLAUF_MAX ? neu.slice(neu.length - CHAT_VERLAUF_MAX) : neu;
}

/** Zeitpunkte im Fenster behalten, alles Aeltere vergessen. */
export function imFenster(zeiten: readonly number[], jetzt: number, fensterMs: number): number[] {
  return zeiten.filter((z) => jetzt - z < fensterMs);
}

/**
 * Darf jetzt gesendet werden? Rechnet nur, sie merkt sich nichts.
 * Der Aufrufer haelt die Liste der Zeitpunkte.
 */
export function darfSenden(
  zeiten: readonly number[],
  jetzt: number,
  grenze = CHAT_SENDE_GRENZE,
  fensterMs = CHAT_SENDE_FENSTER_MS,
): boolean {
  return imFenster(zeiten, jetzt, fensterMs).length < grenze;
}

/** Die Uhrzeit am Beitrag, zweistellig und ohne Sekunden. */
export function chatUhrzeit(zeit: number): string {
  const d = new Date(zeit);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Wie viele fremde Beitraege noch niemand gesehen hat.
 *
 * Gemerkt wird, WELCHE gelesen sind, nicht ab WANN. Eine Uhrzeit war der
 * naheliegende, aber falsche Weg: Ein Beitrag, der in derselben Millisekunde
 * eintrifft, in der zuletzt hingesehen wurde, gilt dann als gelesen und wird
 * nie gemeldet. Das ist kein erfundener Fall, der Pruefstand hat ihn sofort
 * getroffen, und in einem schnellen Netz kann er auch draussen vorkommen.
 *
 * Eigene Beitraege zaehlen nie mit: Wer selbst schreibt, hat gelesen.
 */
export function zaehleUngelesen(
  beitraege: readonly ChatBeitrag[],
  gelesen: readonly string[],
): number {
  return beitraege.filter((b) => !b.eigen && !gelesen.includes(b.id)).length;
}

/** Die Kennungen aller fremden Beitraege, also alles, was gelesen sein kann. */
export function fremdeKennungen(beitraege: readonly ChatBeitrag[]): string[] {
  return beitraege.filter((b) => !b.eigen).map((b) => b.id);
}

/** Zwei Listen von Kennungen gleich? Bewahrt die Ansicht vor leerem Zeichnen. */
export function gleicheKennungen(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

// ---------------------------------------------------------------- Gedaechtnis

/**
 * Der Verlauf einer laufenden Verbindung.
 *
 * `kennung` ist die eigene Kennung im Signalkanal. Sie wechselt mit jeder
 * neuen Verbindung und ist damit der Schluessel, an dem sich erkennen laesst,
 * ob der Verlauf noch derselbe ist.
 */
export interface ChatStand {
  kennung: string;
  beitraege: ChatBeitrag[];
  /**
   * Was im Eingabefeld steht. Liegt hier und nicht in der Ansicht, damit
   * Angefangenes das Zuklappen des Chats und das Kleinermachen des Gespraechs
   * uebersteht.
   */
  entwurf: string;
  /**
   * Die Kennungen der bereits gelesenen fremden Beitraege.
   *
   * Eine Liste und kein Zeitpunkt, siehe `zaehleUngelesen`. Sie bleibt
   * begrenzt, weil auch der Verlauf begrenzt ist.
   */
  gelesen: string[];
  /**
   * Ist der Chat gerade aufgeklappt?
   *
   * Steht hier und nicht in einer Ansicht, weil der Chat an drei Stellen
   * aufgehen kann: im Gespraech, in der Leiste oben und auf Zuruf aus dem
   * schwebenden Fenster auf dem Schreibtisch. Immer nur eine davon steht
   * wirklich auf dem Bildschirm, und sie soll dasselbe zeigen. Ein Wunsch aus
   * dem schwebenden Fenster erreicht so die richtige Stelle, ohne dass das
   * Fenster wissen muesste, welche es gerade ist.
   *
   * Der Nebeneffekt ist gewollt: Wer das Gespraech mit offenem Chat kleiner
   * macht, findet ihn unter der Leiste wieder. Der Chat folgt ihm, statt sich
   * zu schliessen und danach ungelesene Beitraege zu melden, die er haette
   * sehen koennen.
   */
  offen: boolean;
}

export const LEERER_CHAT: ChatStand = {
  kennung: "", beitraege: [], entwurf: "", gelesen: [], offen: false,
};

/**
 * Ein Verlauf je Kennung.
 *
 * Im Browser gibt es immer nur einen, naemlich den eigenen. Eine Sammlung
 * statt eines einzelnen Standes hat trotzdem zwei Gruende: Waehrend eines
 * Wechsels der Verbindung stehen kurz zwei nebeneinander, und im Pruefstand
 * laufen beide Seiten des Gespraechs im selben Prozess. Mit einem einzigen
 * Stand saehen sie sich gegenseitig in die Karten.
 */
const staende = new Map<string, ChatStand>();
/** So viele Verlaeufe bleiben liegen, aeltere fallen heraus. */
const MAX_VERLAEUFE = 4;
const horcher = new Set<() => void>();

function melde(): void {
  for (const h of [...horcher]) h();
}

/** Den gegenwaertigen Stand lesen. Dasselbe Objekt, solange sich nichts aendert. */
export function leseChat(kennung: string): ChatStand {
  return staende.get(kennung) ?? LEERER_CHAT;
}

/** Aenderungen mithoeren. Gibt eine Abmeldefunktion zurueck. */
export function beobachteChat(h: () => void): () => void {
  horcher.add(h);
  return () => { horcher.delete(h); };
}

/**
 * Den Verlauf fuer eine Verbindung anlegen.
 *
 * Gibt es ihn schon, bleibt alles stehen. Das ist der Fall nach dem
 * Kleinermachen: Die Ansicht wird abgebaut und neu aufgebaut, die Verbindung
 * und mit ihr die Kennung bleiben. Eine neue Verbindung traegt eine neue
 * Kennung und faengt damit von vorn an.
 */
export function richteChatEin(kennung: string): void {
  if (!kennung || staende.has(kennung)) return;
  staende.set(kennung, { ...LEERER_CHAT, kennung });
  // Der aelteste Eintrag faellt heraus. Map behaelt die Reihenfolge des
  // Einfuegens, der erste Schluessel ist also der aelteste.
  while (staende.size > MAX_VERLAEUFE) {
    const aeltester = staende.keys().next().value as string | undefined;
    if (aeltester === undefined) break;
    staende.delete(aeltester);
  }
  melde();
}

/** Den Stand aendern. Nur melden, wenn wirklich etwas anders ist. */
export function aendereChat(kennung: string, aendern: (bisher: ChatStand) => ChatStand): void {
  if (!kennung) return;
  const bisher = staende.get(kennung) ?? { ...LEERER_CHAT, kennung };
  const neu = aendern(bisher);
  if (neu === bisher) return;
  staende.set(kennung, neu);
  melde();
}

/**
 * Den Chat auf- oder zuklappen.
 *
 * Eine eigene Funktion und nicht nur `aendereChat`, weil drei Stellen sie
 * brauchen und der Wunsch aus dem schwebenden Fenster sonst wissen muesste,
 * wie der Stand innen aussieht.
 */
export function setzeChatOffen(kennung: string, offen: boolean): void {
  aendereChat(kennung, (s) => (s.offen === offen ? s : { ...s, offen }));
}

/** Alles vergessen. In Tests, und wenn kein Gespraech mehr laeuft. */
export function setzeChatZurueck(): void {
  staende.clear();
  melde();
}
