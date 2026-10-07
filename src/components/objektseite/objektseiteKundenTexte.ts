import type { ZweiSprachen } from "@/lib/seitenSprache";
import type { Oberbegriff } from "@/lib/dokumentGruppen";

/**
 * Texte der Objektseiten-Bausteine, die auch der Kunde sieht: Galerie,
 * Vollbildansicht und Dokumentenansicht im Kundenmodus. Deutsch und
 * Englisch (Kundensprache, Etappe 3).
 *
 * Die Bausteine lesen die Sprache über `useAnzeigeSprache()`. Im CRM gibt es
 * keinen Sprachrahmen, dort bleibt alles deutsch, auch die Sätze, die nur
 * Mitarbeiter sehen; die stehen deshalb nicht hier.
 */
export interface ObjektseiteKundenTexte {
  galerie: {
    vollbildOeffnen: (beschriftung: string) => string;
    alleFotos: (gesamt: number, weitere: number) => string;
    leerTitel: string;
    leerKunde: string;
    fotoDerImmobilie: string;
    fotoDerImmobilieIn: (ort: string) => string;
    bildVon: (nr: number, gesamt: number) => string;
  };
  vollbild: {
    titel: string;
    beschreibung: (nr: number, gesamt: number) => string;
    bereich: string;
    vorheriges: string;
    naechstes: string;
  };
  dokumente: {
    gruppe: string;
    datei: (n: number) => string;
    leerKunde: string;
    liste: string;
    vorschau: string;
    vorschauVon: (name: string) => string;
    herunterladen: string;
    herunterladenVon: (name: string) => string;
    neuerTab: string;
    fehlerHerunterladen: string;
    rotHinweis: string;
    ladeFehler: string;
    erneut: string;
    fremderServer: string;
    handyHinweis: string;
    bildFehler: string;
    dateiart: (endung: string) => string;
    laedt: string;
    oberbegriffe: Record<Oberbegriff, string>;
  };
}

export const OBJEKTSEITE_KUNDEN_TEXTE: ZweiSprachen<ObjektseiteKundenTexte> = {
  de: {
    galerie: {
      vollbildOeffnen: (beschriftung) => `Vollbild öffnen: ${beschriftung}`,
      alleFotos: (gesamt, weitere) => `Alle ${gesamt} Fotos ansehen, ${weitere} weitere sind gerade nicht zu sehen`,
      leerTitel: "Noch keine Fotos hinterlegt",
      leerKunde: "Für diese Immobilie liegen hier noch keine Fotos vor. Dein Ansprechpartner schickt dir gern welche.",
      fotoDerImmobilie: "Foto der Immobilie",
      fotoDerImmobilieIn: (ort) => `Foto der Immobilie ${ort}`,
      bildVon: (nr, gesamt) => `Bild ${nr} von ${gesamt}`,
    },
    vollbild: {
      titel: "Objektfotos",
      beschreibung: (nr, gesamt) => `Bild ${nr} von ${gesamt}. Mit den Pfeiltasten blättern, mit Escape schließen.`,
      bereich: "Objektfotos in voller Größe",
      vorheriges: "Vorheriges Bild",
      naechstes: "Nächstes Bild",
    },
    dokumente: {
      gruppe: "Welche Dokumente",
      datei: (n) => (n === 1 ? "Datei" : "Dateien"),
      leerKunde: "Hier liegen noch keine Unterlagen zum Ansehen.",
      liste: "Dokumentenliste",
      vorschau: "Vorschau",
      vorschauVon: (name) => `Vorschau: ${name}`,
      herunterladen: "Herunterladen",
      herunterladenVon: (name) => `${name} herunterladen`,
      neuerTab: "In neuem Tab öffnen",
      fehlerHerunterladen: "Die Datei ließ sich gerade nicht herunterladen. Versuch es bitte gleich noch einmal.",
      rotHinweis: "Mietvertrag und Grundbuchauszug stellt dir dein Ansprechpartner persönlich zur Verfügung.",
      ladeFehler: "Die Datei ließ sich gerade nicht laden. Vielleicht fehlt die Verbindung, oder die Datei liegt nicht mehr im Speicher.",
      erneut: "Erneut versuchen",
      fremderServer: "Diese Datei liegt auf einem fremden Server und lässt sich hier nicht anzeigen.",
      handyHinweis: "Auf dem Handy zeigt die Vorschau oft nur die erste Seite. Das ganze Dokument öffnet „In neuem Tab öffnen\".",
      bildFehler: "Das Bild ließ sich hier nicht anzeigen.",
      dateiart: (endung) => `Diese Dateiart${endung ? ` (${endung})` : ""} lässt sich hier nicht anzeigen.`,
      laedt: "Vorschau wird geladen…",
      oberbegriffe: {
        "Exposé und Beschreibung": "Exposé und Beschreibung",
        "Grundrisse und Pläne": "Grundrisse und Pläne",
        "Flächen": "Flächen",
        "Mietverhältnis": "Mietverhältnis",
        "WEG und Hausgeld": "WEG und Hausgeld",
        "Teilungserklärung": "Teilungserklärung",
        "Grundbuch": "Grundbuch",
        "Energie": "Energie",
        "Versicherung": "Versicherung",
        "Behördliche Auskünfte": "Behördliche Auskünfte",
        "Vertragsunterlagen": "Vertragsunterlagen",
        "Sonstiges": "Sonstiges",
      },
    },
  },
  en: {
    galerie: {
      vollbildOeffnen: (beschriftung) => `Open full screen: ${beschriftung}`,
      alleFotos: (gesamt, weitere) => `View all ${gesamt} photos, ${weitere} more are not shown right now`,
      leerTitel: "No photos yet",
      leerKunde: "There are no photos of this property here yet. Your contact will be happy to send you some.",
      fotoDerImmobilie: "Photo of the property",
      fotoDerImmobilieIn: (ort) => `Photo of the property, ${ort}`,
      bildVon: (nr, gesamt) => `image ${nr} of ${gesamt}`,
    },
    vollbild: {
      titel: "Property photos",
      beschreibung: (nr, gesamt) => `Image ${nr} of ${gesamt}. Use the arrow keys to browse and Escape to close.`,
      bereich: "Property photos in full size",
      vorheriges: "Previous image",
      naechstes: "Next image",
    },
    dokumente: {
      gruppe: "Which documents",
      datei: (n) => (n === 1 ? "file" : "files"),
      leerKunde: "There are no documents to view here yet.",
      liste: "List of documents",
      vorschau: "Preview",
      vorschauVon: (name) => `Preview: ${name}`,
      herunterladen: "Download",
      herunterladenVon: (name) => `Download ${name}`,
      neuerTab: "Open in new tab",
      fehlerHerunterladen: "The file couldn’t be downloaded just now. Please try again in a moment.",
      rotHinweis: "Your contact will provide the tenancy agreement and the land register extract to you personally.",
      ladeFehler: "The file couldn’t be loaded just now. The connection may be down, or the file is no longer in storage.",
      erneut: "Try again",
      fremderServer: "This file is stored on an external server and can’t be displayed here.",
      handyHinweis: "On a phone the preview often shows only the first page. “Open in new tab” opens the whole document.",
      bildFehler: "The image couldn’t be displayed here.",
      dateiart: (endung) => `This file type${endung ? ` (${endung})` : ""} can’t be displayed here.`,
      laedt: "Loading preview…",
      oberbegriffe: {
        "Exposé und Beschreibung": "Exposé and description",
        "Grundrisse und Pläne": "Floor plans and drawings",
        "Flächen": "Floor areas",
        "Mietverhältnis": "Tenancy",
        "WEG und Hausgeld": "Owners’ association and service charge",
        "Teilungserklärung": "Declaration of division (Teilungserklärung)",
        "Grundbuch": "Land register",
        "Energie": "Energy",
        "Versicherung": "Insurance",
        "Behördliche Auskünfte": "Official information",
        "Vertragsunterlagen": "Contract documents",
        "Sonstiges": "Other",
      },
    },
  },
};
