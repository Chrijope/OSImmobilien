import type { AgendaPunkt, VideoraumArt } from "@/lib/videoraumStore";
import { STANDARD_AGENDA } from "@/lib/videoraumAgenda";
// Nur Typen: Die Bausteine des Videoraums laufen auch beim Gastgeber im CRM
// und sollen dafür nicht den Supabase-Client und den Router mitladen.
import type { Sprache, ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Die festen Texte der Gastansicht im Videoraum, `/raum/:token`, in Deutsch
 * und Englisch (Kundensprache, Etappe 3, S6).
 *
 * Was hier nicht steht:
 *   - Die Sätze, die am Anlass hängen (Begrüßung, Warten, Fehler beim
 *     Betreten), stehen weiter als `GastTexte` in `videoraumAnrede.ts`.
 *   - Was Mitarbeiter frei am Raum pflegen (Titel, Agenda, Hinweis, Name und
 *     Zitat des Gastgebers, Objektangaben, Eckdaten der Berechnung, nächste
 *     Schritte), bleibt, wie es gespeichert ist. Übersetzt wird zur Laufzeit
 *     nichts.
 *   - Die Oberfläche des Gastgebers im CRM bleibt deutsch. Die geteilten
 *     Bausteine nehmen deshalb `sprache` mit der Vorgabe Deutsch.
 *
 * Platzhalter wie `{name}` setzt `mitWerten` aus `videoraumAnrede.ts` ein.
 * Englisch nach dem Glossar: der Berater heißt „your contact“, nie „advisor“.
 */
export interface VideoraumGastTexte {
  seite: {
    seitentitel: string;
    laedt: string;
    linkUngueltigTitel: string;
    linkUngueltigText: string;
    beendetTitel: string;
    beendetGrund: string;
    objektvorstellung: string;
    mit: string;
    /** `{minuten}` ist die Dauer. */
    minuten: string;
    /** `{zeit}` ist die Uhrzeit. */
    heute: string;
    /** `{datum}` ist Tag und Monat, `{zeit}` die Uhrzeit. */
    datumZeit: string;
    verschluesselt: string;
    mikrofonAusschalten: string;
    mikrofonEinschalten: string;
    kameraAusschalten: string;
    kameraEinschalten: string;
    hintergrundWeich: string;
    erstKameraFreigeben: string;
    namePlatzhalter: string;
    betreten: string;
    verbindungFehler: string;
    kameraWechselFehler: string;
    mikrofonWechselFehler: string;
    mitschrift: string;
    /** Die Standardschritte, wenn am Raum keine gepflegt sind. */
    naechsteSchritte: string[];
  };
  warteraum: {
    /** `{name}` ist der Vorname des Gastes. */
    willkommen: string;
    technik: string;
    kameraBereit: string;
    keineKamera: string;
    mikrofonBereit: string;
    keinMikrofon: string;
    mikrofonAn: string;
    keinMikrofonGefunden: string;
    kameraAn: string;
    keineKameraGefunden: string;
    kameraAus: string;
    ablauf: string;
    agenda: string;
    /** `{minuten}` an einem Agendapunkt. */
    minutenKurz: string;
    objekt: string;
    deineImmobilie: string;
    kaufpreis: string;
    wohnflaeche: string;
    zimmer: string;
    rendite: string;
    unterlagenGleich: string;
    berechnung: string;
    berechnungLeer: string;
    naechsteSchritte: string;
  };
  gespraech: {
    warteAuf: string;
    vorschauAufbau: string;
    bildschirmVon: string;
    teilenStandard: string;
    deineKameraAus: string;
    du: string;
    einklappen: string;
    eingeklapptEins: string;
    /** `{zahl}` Kameras. */
    eingeklapptMehr: string;
    kamerasZeigen: string;
    zeigen: string;
    verbindungGescheitert: string;
    gegenstelleWeg: string;
    geraeteTitel: string;
    einstellungenSchliessen: string;
    ton: string;
    bild: string;
    teilen: string;
    geraete: string;
    kleiner: string;
    auflegen: string;
  };
  kachel: {
    warteBild: string;
    keinBild: string;
    keinBildZusatz: string;
    abgerissen: string;
    abgerissenZusatz: string;
    kameraIstAus: string;
    istStumm: string;
  };
  neben: {
    teilnehmer: string;
    chat: string;
    /** `{zahl}` Personen im Raum. */
    teilnehmerTitel: string;
    teilnehmerSchliessen: string;
    chatSchliessen: string;
    ungelesenEins: string;
    ungelesenMehr: string;
  };
  liste: {
    du: string;
    duZusatz: string;
    mikrofonAn: string;
    mikrofonAus: string;
    mikrofonAusLang: string;
    stummschalten: string;
    kameraAn: string;
    kameraAus: string;
    niemand: string;
  };
  chat: {
    leer: string;
    zuSchnell: string;
    eingabeLabel: string;
    platzhalter: string;
    senden: string;
    /** `{zahl}` verbleibende Zeichen. */
    rest: string;
    du: string;
  };
  geraete: {
    kamera: string;
    mikrofon: string;
    lautsprecher: string;
    standard: string;
    keineGeraete: string;
    spiegeln: string;
    spiegelnRuht: string;
    spiegelnHinweis: string;
    hintergrund: string;
    kein: string;
    weich: string;
    bild: string;
    weniger: string;
    alleBilder: string;
  };
  /**
   * Die Standardagenda je Anlass. Deutsch ist `STANDARD_AGENDA` selbst, damit
   * die Datenbank (`videoraum_standard_agenda`) und diese Datei nicht
   * auseinanderlaufen. Englisch hat dieselbe Form.
   */
  agenda: Record<VideoraumArt, AgendaPunkt[]>;
}

export const VIDEORAUM_GAST_TEXTE: ZweiSprachen<VideoraumGastTexte> = {
  de: {
    seite: {
      seitentitel: "Videomeeting",
      laedt: "Wird geladen",
      linkUngueltigTitel: "Dieser Link ist nicht mehr gültig.",
      linkUngueltigText:
        "Der Raum wurde geschlossen oder der Link ist abgelaufen. Eine kurze Nachricht an den Ansprechpartner genügt, dann kommt ein neuer Link.",
      beendetTitel: "Das Gespräch ist beendet.",
      beendetGrund: "Das Gespräch wurde beendet.",
      objektvorstellung: "Objektvorstellung",
      mit: "Mit",
      minuten: "{minuten} Minuten",
      heute: "Heute, {zeit} Uhr",
      datumZeit: "{datum}, {zeit} Uhr",
      verschluesselt: "Ende zu Ende verschlüsselt",
      mikrofonAusschalten: "Mikrofon ausschalten",
      mikrofonEinschalten: "Mikrofon einschalten",
      kameraAusschalten: "Kamera ausschalten",
      kameraEinschalten: "Kamera einschalten",
      hintergrundWeich: "Hintergrund weichzeichnen",
      erstKameraFreigeben: "Erst Kamera freigeben",
      namePlatzhalter: "Vor- und Nachname",
      betreten: "Warteraum betreten",
      verbindungFehler: "Die Verbindung konnte nicht aufgebaut werden. Bitte die Seite neu laden.",
      kameraWechselFehler: "Die Kamera konnte nicht gewechselt werden.",
      mikrofonWechselFehler: "Das Mikrofon konnte nicht gewechselt werden.",
      mitschrift: "Dieses Gespräch wird mitgeschrieben",
      naechsteSchritte: [
        "Du entscheidest in Ruhe, ob das Objekt zu dir passt.",
        "Bei Interesse reservieren wir die Wohnung unverbindlich für dich.",
        "Danach klären wir die Finanzierung und den Notartermin.",
      ],
    },
    warteraum: {
      willkommen: "Willkommen, {name}.",
      technik: "Technik",
      kameraBereit: "Kamera bereit",
      keineKamera: "Keine Kamera",
      mikrofonBereit: "Mikrofon bereit",
      keinMikrofon: "Kein Mikrofon",
      mikrofonAn: "Mikrofon an",
      keinMikrofonGefunden: "Kein Mikrofon gefunden",
      kameraAn: "Kamera an",
      keineKameraGefunden: "Keine Kamera gefunden",
      kameraAus: "Kamera aus",
      ablauf: "Ablauf",
      agenda: "Agenda",
      minutenKurz: "{minuten} Min.",
      objekt: "Das Objekt",
      deineImmobilie: "Deine Immobilie",
      kaufpreis: "Kaufpreis",
      wohnflaeche: "Wohnfläche",
      zimmer: "Zimmer",
      rendite: "Rendite",
      unterlagenGleich: "Die Unterlagen zum Objekt gehen wir gleich gemeinsam durch.",
      berechnung: "Deine Berechnung",
      berechnungLeer: "Wir rechnen deine persönliche Kalkulation im Gespräch gemeinsam durch, Zeile für Zeile.",
      naechsteSchritte: "Nächste Schritte",
    },
    gespraech: {
      warteAuf: "Warte auf {name}…",
      vorschauAufbau: "Die Vorschau wird gerade aufgebaut…",
      bildschirmVon: "Bildschirm von {name}",
      teilenStandard: "Das sehen die anderen gerade",
      deineKameraAus: "Deine Kamera ist aus",
      du: "Du",
      einklappen: "Kameras einklappen",
      eingeklapptEins: "1 Kamera ist eingeklappt",
      eingeklapptMehr: "{zahl} Kameras sind eingeklappt",
      kamerasZeigen: "Kameras zeigen",
      zeigen: "Zeigen",
      verbindungGescheitert: "Die Verbindung kam nicht zustande. Bitte die Seite neu laden.",
      gegenstelleWeg: "Die Gegenstelle ist nicht mehr da.",
      geraeteTitel: "Geräte und Hintergrund",
      einstellungenSchliessen: "Einstellungen schließen",
      ton: "Ton",
      bild: "Bild",
      teilen: "Teilen",
      geraete: "Geräte",
      kleiner: "Kleiner",
      auflegen: "Auflegen",
    },
    kachel: {
      warteBild: "Warte auf das Bild…",
      keinBild: "Es kommt kein Bild an",
      keinBildZusatz: "Die Kamera ist nicht abgeschaltet. Oft hilft es, die Seite neu zu laden.",
      abgerissen: "Die Verbindung ist abgerissen",
      abgerissenZusatz: "Sie wird gerade neu aufgebaut.",
      kameraIstAus: "Kamera ist aus",
      istStumm: "{name} ist stummgeschaltet",
    },
    neben: {
      teilnehmer: "Teilnehmer",
      chat: "Chat",
      teilnehmerTitel: "Teilnehmer ({zahl})",
      teilnehmerSchliessen: "Teilnehmer schließen",
      chatSchliessen: "Chat schließen",
      ungelesenEins: "1 ungelesene Nachricht",
      ungelesenMehr: "{zahl} ungelesene Nachrichten",
    },
    liste: {
      du: "Du",
      duZusatz: "(du)",
      mikrofonAn: "Mikrofon an",
      mikrofonAus: "Mikrofon aus",
      mikrofonAusLang: "Mikrofon aus. Nur der Teilnehmer selbst kann es wieder einschalten.",
      stummschalten: "{name} stummschalten",
      kameraAn: "Kamera an",
      kameraAus: "Kamera aus",
      niemand: "Außer dir ist noch niemand im Raum.",
    },
    chat: {
      leer: "Noch keine Nachricht. Was hier steht, sehen alle im Raum und ist nach dem Auflegen wieder weg.",
      zuSchnell: "Einen Moment bitte, das waren gerade sehr viele Nachrichten hintereinander.",
      eingabeLabel: "Nachricht an alle im Raum",
      platzhalter: "Nachricht an alle…",
      senden: "Nachricht senden",
      rest: "noch {zahl} Zeichen",
      du: "Du",
    },
    geraete: {
      kamera: "Kamera",
      mikrofon: "Mikrofon",
      lautsprecher: "Lautsprecher",
      standard: "Standard",
      keineGeraete: "Es wurden keine Geräte gefunden. Bitte erst Kamera und Mikrofon freigeben.",
      spiegeln: "Eigene Vorschau spiegeln",
      spiegelnRuht: "Ruht, solange ein Hintergrundbild läuft, sonst stünde die Schrift darin verkehrt.",
      spiegelnHinweis: "Wirkt nur auf deine eigene Vorschau, die anderen sehen dich unverändert.",
      hintergrund: "Hintergrund",
      kein: "Kein",
      weich: "Weichzeichnen",
      bild: "Bild",
      weniger: "Weniger anzeigen",
      alleBilder: "Alle {zahl} Bilder anzeigen",
    },
    agenda: STANDARD_AGENDA,
  },
  en: {
    seite: {
      seitentitel: "Video meeting",
      laedt: "Loading",
      linkUngueltigTitel: "This link is no longer valid.",
      linkUngueltigText:
        "The room has been closed or the link has expired. Just send your contact a short message and you'll receive a new link.",
      beendetTitel: "The meeting has ended.",
      beendetGrund: "The meeting was ended.",
      objektvorstellung: "Property presentation",
      mit: "With",
      minuten: "{minuten} minutes",
      heute: "Today, {zeit}",
      datumZeit: "{datum}, {zeit}",
      verschluesselt: "End-to-end encrypted",
      mikrofonAusschalten: "Turn off microphone",
      mikrofonEinschalten: "Turn on microphone",
      kameraAusschalten: "Turn off camera",
      kameraEinschalten: "Turn on camera",
      hintergrundWeich: "Blur background",
      erstKameraFreigeben: "Allow camera access first",
      namePlatzhalter: "First and last name",
      betreten: "Enter waiting room",
      verbindungFehler: "The connection couldn't be established. Please reload the page.",
      kameraWechselFehler: "The camera couldn't be switched.",
      mikrofonWechselFehler: "The microphone couldn't be switched.",
      mitschrift: "This meeting is being transcribed",
      naechsteSchritte: [
        "You decide in your own time whether the property is right for you.",
        "If you're interested, we'll reserve the flat for you without obligation.",
        "After that, we'll sort out the financing and the notary appointment (Notartermin).",
      ],
    },
    warteraum: {
      willkommen: "Welcome, {name}.",
      technik: "Setup",
      kameraBereit: "Camera ready",
      keineKamera: "No camera",
      mikrofonBereit: "Microphone ready",
      keinMikrofon: "No microphone",
      mikrofonAn: "Microphone on",
      keinMikrofonGefunden: "No microphone found",
      kameraAn: "Camera on",
      keineKameraGefunden: "No camera found",
      kameraAus: "Camera off",
      ablauf: "Schedule",
      agenda: "Agenda",
      minutenKurz: "{minuten} min",
      objekt: "The property",
      deineImmobilie: "Your property",
      kaufpreis: "Purchase price",
      wohnflaeche: "Living space",
      zimmer: "Rooms",
      rendite: "Yield",
      unterlagenGleich: "We'll go through the property documents together in a moment.",
      berechnung: "Your calculation",
      berechnungLeer: "We'll work through your personal calculation together during the meeting, line by line.",
      naechsteSchritte: "Next steps",
    },
    gespraech: {
      warteAuf: "Waiting for {name}…",
      vorschauAufbau: "The preview is loading…",
      bildschirmVon: "{name}'s screen",
      teilenStandard: "This is what the others can see right now",
      deineKameraAus: "Your camera is off",
      du: "You",
      einklappen: "Collapse cameras",
      eingeklapptEins: "1 camera is collapsed",
      eingeklapptMehr: "{zahl} cameras are collapsed",
      kamerasZeigen: "Show cameras",
      zeigen: "Show",
      verbindungGescheitert: "The connection couldn't be established. Please reload the page.",
      gegenstelleWeg: "The other person has left.",
      geraeteTitel: "Devices and background",
      einstellungenSchliessen: "Close settings",
      ton: "Sound",
      bild: "Video",
      teilen: "Share",
      geraete: "Devices",
      kleiner: "Smaller",
      auflegen: "Hang up",
    },
    kachel: {
      warteBild: "Waiting for video…",
      keinBild: "No video is coming through",
      keinBildZusatz: "The camera isn't switched off. Reloading the page often helps.",
      abgerissen: "The connection was lost",
      abgerissenZusatz: "It's being re-established.",
      kameraIstAus: "Camera is off",
      istStumm: "{name} is muted",
    },
    neben: {
      // Kurz, weil der Knopf nur 64 Pixel breit ist; „Participants“ stünde über.
      teilnehmer: "People",
      chat: "Chat",
      teilnehmerTitel: "Participants ({zahl})",
      teilnehmerSchliessen: "Close participants",
      chatSchliessen: "Close chat",
      ungelesenEins: "1 unread message",
      ungelesenMehr: "{zahl} unread messages",
    },
    liste: {
      du: "You",
      duZusatz: "(you)",
      mikrofonAn: "Microphone on",
      mikrofonAus: "Microphone off",
      mikrofonAusLang: "Microphone off. Only the participant can turn it back on.",
      stummschalten: "Mute {name}",
      kameraAn: "Camera on",
      kameraAus: "Camera off",
      niemand: "Nobody else is in the room yet.",
    },
    chat: {
      leer: "No messages yet. Everyone in the room can see what's written here, and it's gone once the meeting ends.",
      zuSchnell: "Just a moment, please. That was a lot of messages in a row.",
      eingabeLabel: "Message to everyone in the room",
      platzhalter: "Message everyone…",
      senden: "Send message",
      rest: "{zahl} characters left",
      du: "You",
    },
    geraete: {
      kamera: "Camera",
      mikrofon: "Microphone",
      lautsprecher: "Speaker",
      standard: "Default",
      keineGeraete: "No devices were found. Please allow access to your camera and microphone first.",
      spiegeln: "Mirror my preview",
      spiegelnRuht: "Paused while a background image is on, otherwise its text would appear reversed.",
      spiegelnHinweis: "Only affects your own preview. Everyone else sees you as normal.",
      hintergrund: "Background",
      kein: "None",
      weich: "Blur",
      bild: "Image",
      weniger: "Show fewer",
      alleBilder: "Show all {zahl} images",
    },
    agenda: {
      erstgespraech: [
        { titel: "Getting to know each other", text: "Who we are and how we work.", minuten: 5 },
        { titel: "Your situation", text: "Where you stand today and what you want to achieve.", minuten: 10 },
        { titel: "Is it a good fit?", text: "Honest and without sales pressure.", minuten: 10 },
        { titel: "Next step", text: "You decide whether a more detailed meeting follows.", minuten: 5 },
      ],
      beratung: [
        { titel: "Your starting point", text: "Income, tax burden and what you've built up so far.", minuten: 10 },
        { titel: "What the numbers allow", text: "We work out your budget together.", minuten: 15 },
        { titel: "Suitable properties", text: "Two or three specific examples from our portfolio.", minuten: 15 },
        {
          titel: "Completing the self-disclosure (Selbstauskunft)",
          text: "We'll go through it together. Afterwards we'll know for certain which budget works for you.",
          minuten: 15,
        },
        { titel: "Your questions and next step", text: "You decide whether and how to continue.", minuten: 5 },
      ],
      objektvorstellung: [
        { titel: "The property at a glance", text: "Location, condition, features.", minuten: 15 },
        { titel: "Your calculation", text: "Line by line, together.", minuten: 20 },
        { titel: "Letting and management", text: "Who takes care of what.", minuten: 10 },
        { titel: "Your questions", text: "Anything that's still open.", minuten: 15 },
      ],
      bewerbergespraech: [
        {
          titel: "Arriving",
          text: "A short introduction on both sides. We've read what you wrote in the introduction form.",
          minuten: 5,
        },
        { titel: "Your topics", text: "What you marked, and your own question.", minuten: 13 },
        {
          titel: "How working together works",
          text: "Pay, what the company provides, business registration and licence.",
          minuten: 12,
        },
        {
          titel: "What happens next",
          text: "You decide whether you'd like to start. A contract only comes afterwards.",
          minuten: 5,
        },
      ],
      sonstiges: [],
    },
  },
};

/** Die Texte in der Sprache der Seite. Ohne Sprache Deutsch. */
export function videoraumGastTexte(sprache: Sprache = "de"): VideoraumGastTexte {
  return VIDEORAUM_GAST_TEXTE[sprache] ?? VIDEORAUM_GAST_TEXTE.de;
}

function gleicheAgenda(a: AgendaPunkt[], b: AgendaPunkt[]): boolean {
  return a.length === b.length && a.every((p, i) => (
    p.titel === b[i].titel && (p.text ?? "") === (b[i].text ?? "") && (p.minuten ?? 0) === (b[i].minuten ?? 0)
  ));
}

/**
 * Die Agenda zur Anzeige.
 *
 * Ein Raum speichert beim Anlegen meist die deutsche Standardagenda mit.
 * Ist sie wortgleich damit, zeigt die englische Seite die englische
 * Standardagenda. Das ist eine Übersetzung über einen bekannten Wortlaut, der
 * gespeicherte Wert bleibt, wie er ist. Eine selbst gepflegte oder ältere
 * Agenda bleibt deutsch, denn ihren Wortlaut kennt diese Datei nicht.
 */
export function agendaZurAnzeige(art: VideoraumArt, agenda: AgendaPunkt[], sprache: Sprache): AgendaPunkt[] {
  if (sprache !== "en") return agenda;
  const deutsch = STANDARD_AGENDA[art];
  const englisch = VIDEORAUM_GAST_TEXTE.en.agenda[art];
  if (deutsch && englisch && gleicheAgenda(agenda, deutsch)) return englisch;
  return agenda;
}

/**
 * Die Meldungen, die Kamera, Mikrofon und Video-Hintergrund auf Deutsch
 * liefern (`holeMedien` in `videoraumVerbindung.ts`, `aufFehler` in
 * `videocallHintergrund.ts`). Beide Dateien laufen auch beim Gastgeber und
 * bleiben deshalb deutsch; die Gastseite übersetzt ihre Meldung hier.
 *
 * Ein Test liest beide Dateien und prüft, dass jede Meldung hier steht.
 */
export const MEDIEN_MELDUNGEN_EN: Readonly<Record<string, string>> = {
  "Dieser Browser unterstützt keine Videogespräche. Bitte Chrome, Safari oder Edge verwenden.":
    "This browser doesn't support video calls. Please use Chrome, Safari or Edge.",
  "Der Zugriff auf Kamera und Mikrofon wurde abgelehnt. Bitte in den Browsereinstellungen erlauben und die Seite neu laden.":
    "Access to your camera and microphone was denied. Please allow it in your browser settings and reload the page.",
  "Es wurde keine Kamera oder kein Mikrofon gefunden.": "No camera or microphone was found.",
  "Kamera oder Mikrofon werden bereits von einem anderen Programm benutzt.":
    "Your camera or microphone is already being used by another program.",
  "Kamera und Mikrofon konnten nicht gestartet werden.": "Your camera and microphone couldn't be started.",
  "Dein Gerät schafft den Hintergrund gerade nicht flüssig. Er ist ausgeschaltet, damit Bild und Ton nicht ruckeln.":
    "Your device can't run the background smoothly right now. It has been turned off so your video and sound don't stutter.",
  "Der Video-Hintergrund läuft auf diesem Gerät nicht stabil. Es wird wieder das Kamerabild gezeigt.":
    "The video background isn't stable on this device. Your normal camera image is shown again.",
  "Der Video-Hintergrund konnte nicht geladen werden. Es bleibt beim Kamerabild.":
    "The video background couldn't be loaded. Your normal camera image stays on.",
};

/** Eine Meldung zu Kamera, Mikrofon oder Hintergrund in der Sprache der Seite. */
export function medienMeldung(text: string, sprache: Sprache): string {
  if (sprache !== "en") return text;
  return MEDIEN_MELDUNGEN_EN[text] ?? text;
}
