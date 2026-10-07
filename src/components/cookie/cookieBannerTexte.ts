/**
 * Die Texte des Cookie-Banners auf den öffentlichen Seiten, Deutsch und
 * Englisch.
 *
 * Deutsch in der Du-Form, wie Christian es am 26.09.2026 für den Banner
 * festgelegt hat (Projektstandard seit dem 15.09.2026). Die
 * Datenschutzerklärung selbst bleibt im Sie, sie ist ein Rechtstext der
 * Gruppe F. Englisch sachlich und ohne Kurzformen.
 *
 * Keine Gedankenstriche, in keiner der beiden Sprachen. Anwaltlich geprüft ist
 * keine der beiden Fassungen.
 */

const de = {
  bereich: "Cookie-Einstellungen",
  titel: "Cookies und Datenschutz",
  text:
    "Wir speichern nur, was die Seite zum Funktionieren braucht. Mit deiner Einwilligung merken wir uns zusätzlich, über welche Anzeige du gekommen bist (Statistik), und du entscheidest über Marketing. Das Meta Pixel eines Partners lädt nur, wenn du es auf seiner Seite ausdrücklich für diesen Partner erlaubst. Du kannst deine Wahl jederzeit über „Cookie-Einstellungen“ ändern. Mehr dazu in der ",
  datenschutz: "Datenschutzerklärung",
  textEnde: ".",
  alleAkzeptieren: "Alle akzeptieren",
  nurNotwendige: "Nur notwendige",
  einstellungen: "Einstellungen",
  auswahlSpeichern: "Auswahl speichern",
  immerAktiv: "Immer aktiv",
  kategorien: {
    notwendig: {
      titel: "Notwendig",
      text: "Damit die Seite funktioniert: deine Anmeldung, der Zwischenstand deiner Eingaben, deine Sprachwahl und diese Auswahl. Ohne diese Speicher geht es nicht.",
    },
    statistik: {
      titel: "Statistik",
      text: "Wir merken uns 30 Tage lang in deinem Browser, über welche Anzeige oder welchen Link du gekommen bist. So sehen wir, welche Werbung Anfragen bringt. Ohne Einwilligung gilt das nur, solange die Seite offen ist.",
    },
    marketing: {
      titel: "Marketing",
      text: "Deine allgemeine Wahl zu Marketing. Das Meta Pixel eines Partners lädt damit allein noch nicht, dafür fragen wir auf der Seite des Partners gesondert. Schaltest du Marketing hier aus, nimmst du auch alle Erlaubnisse für Partner zurück.",
    },
  },
  /** Nur auf der Seite eines Partners mit Meta Pixel. */
  partner: {
    titel: (name: string) => `Meta Pixel von ${name}`,
    text: (name: string, anschrift: string) =>
      `Auf dieser Seite möchte ${name}, ${anschrift}, das Meta Pixel laden und deine Anfrage an Meta melden, um den Erfolg eigener Anzeigen auf Facebook und Instagram zu messen. Dafür sind ${name} und OS Immobilien gemeinsam verantwortlich. Dabei gehen Daten an Meta Platforms Ireland. Deine Erlaubnis gilt nur für diesen Partner.`,
  },
  /** Der kurze Hinweis im Fuß einer Partnerseite mit Meta Pixel. */
  fussHinweis: (name: string, anschrift: string) =>
    `Gemeinsam verantwortlich für das Meta Pixel auf dieser Seite: ${name}, ${anschrift}, und OS Immobilien.`,
  fussLink: "Cookie-Einstellungen",
};

export type CookieBannerTexte = typeof de;

const en: CookieBannerTexte = {
  bereich: "Cookie settings",
  titel: "Cookies and privacy",
  text:
    "We only store what this page needs to work. With your consent, we also remember which advertisement brought you here (statistics), and you decide on marketing. A partner's Meta Pixel only loads if you explicitly allow it for that partner on their page. You can change your choice at any time under “Cookie settings”. More details in our ",
  datenschutz: "privacy policy",
  textEnde: ".",
  alleAkzeptieren: "Accept all",
  nurNotwendige: "Necessary only",
  einstellungen: "Settings",
  auswahlSpeichern: "Save selection",
  immerAktiv: "Always on",
  kategorien: {
    notwendig: {
      titel: "Necessary",
      text: "Required for the page to work: your sign in, the progress of your entries, your language choice and this selection. The page cannot work without them.",
    },
    statistik: {
      titel: "Statistics",
      text: "For 30 days, your browser remembers which advertisement or link brought you here. This shows us which advertising leads to enquiries. Without consent, this only applies while the page is open.",
    },
    marketing: {
      titel: "Marketing",
      text: "Your general choice on marketing. On its own, it does not load any partner's Meta Pixel; we ask separately on the partner's page. If you switch marketing off here, you also withdraw all permissions given to partners.",
    },
  },
  partner: {
    titel: (name: string) => `Meta Pixel of ${name}`,
    text: (name: string, anschrift: string) =>
      `On this page, ${name}, ${anschrift}, would like to load the Meta Pixel and report your enquiry to Meta in order to measure the performance of their own advertisements on Facebook and Instagram. ${name} and OS Immobilien are joint controllers for this. Data is transferred to Meta Platforms Ireland. Your permission applies to this partner only.`,
  },
  fussHinweis: (name: string, anschrift: string) =>
    `Joint controllers for the Meta Pixel on this page: ${name}, ${anschrift}, and OS Immobilien.`,
  fussLink: "Cookie settings",
};

export const COOKIE_BANNER_TEXTE = { de, en };
