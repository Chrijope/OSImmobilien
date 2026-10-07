import { getUserSetting, setUserSettingSicher } from "./userSettingsCache";
import { cacheReload, isTableLoaded } from "./dataCache";

/**
 * Die persoenlichen Videocall-Einstellungen eines Nutzers.
 *
 * Alles haengt am userSetting "videocall", das schon das Warteraum-Zitat
 * traegt. Neue Felder kommen dazu, alte bleiben unangetastet: Gespeichert wird
 * immer nur ein Teil-Patch ueber `speichereVideocallProfil`, der Rest der
 * Einstellung bleibt stehen.
 *
 * Der Gast hat kein Konto und damit keine Einstellungen. Alles hier gilt nur
 * fuer angemeldete Gastgeber.
 */

export const VIDEOCALL_SCHLUESSEL = "videocall";

export type HintergrundArt = "aus" | "weich" | "bild";

/**
 * Welcher Video-Hintergrund gerade gewaehlt ist. Bei "bild" steht in
 * `bildPfad` der Pfad im Bucket videocall-hintergruende, nicht die URL: Die
 * ist signiert und laeuft ab, der Pfad bleibt.
 */
export interface HintergrundWahl {
  art: HintergrundArt;
  bildPfad?: string;
}

export interface VideocallProfil {
  /** Satz an den Kunden im Warteraum, siehe VideocallEinstellungen. */
  zitat?: string;
  /** Bevorzugte Geraete. Fehlt das Geraet, greift der Browser-Standard. */
  kameraId?: string;
  mikrofonId?: string;
  lautsprecherId?: string;
  /** Vorgaben beim Gespraechsstart des Gastgebers. */
  beitrittStumm?: boolean;
  beitrittOhneKamera?: boolean;
  /** Eigenbild spiegeln, Vorgabe an. Wirkt nur auf die eigene Vorschau. */
  spiegeln?: boolean;
  /** Gewaehlter Video-Hintergrund, Vorgabe aus. */
  hintergrund?: HintergrundWahl;
  /**
   * Videos in der Leiste oben aufgeklappt, Vorgabe zu.
   *
   * Wer das Gespraech kleiner macht, will Platz. Deshalb ist die Leiste in der
   * Vorgabe so flach wie bisher. Die Wahl haelt aber ueber das Gespraech
   * hinaus: Wer sie einmal aufgeklappt hat, findet sie beim naechsten Mal
   * wieder offen vor.
   */
  leisteVideosOffen?: boolean;
}

/**
 * Eine rohe Hintergrund-Wahl absichern. Aus der Datenbank kann alles kommen,
 * etwa ein Bild-Verweis ohne Pfad, nachdem das Bild geloescht wurde. Alles
 * Unbrauchbare faellt auf "aus" zurueck, damit nirgends ein kaputter Zustand
 * weitergereicht wird.
 */
export function normalisiereHintergrund(roh: unknown): HintergrundWahl {
  if (!roh || typeof roh !== "object") return { art: "aus" };
  const wahl = roh as Partial<HintergrundWahl>;
  if (wahl.art === "weich") return { art: "weich" };
  if (wahl.art === "bild" && typeof wahl.bildPfad === "string" && wahl.bildPfad.trim()) {
    return { art: "bild", bildPfad: wahl.bildPfad };
  }
  return { art: "aus" };
}

/**
 * Wird die eigene Vorschau gespiegelt?
 *
 * Die Regel steht hier und nicht in der Ansicht, weil sie an mehreren Stellen
 * gebraucht wird: im Gespraech, in der Leiste und im schwebenden Fenster auf
 * dem Schreibtisch. Gespiegelt wird die ganze Videospur, also auch ein
 * eingesetztes Hintergrundbild. Bei einem Bild ruht die Spiegelung deshalb,
 * sonst stuende die Schrift darin verkehrt (Christian am 18.09.2026: sein
 * Firmenlogo war als „ommlE" zu lesen). Beim Weichzeichnen und ohne
 * Hintergrund gibt es keine Schrift, die verkehrt stehen koennte.
 */
export function spiegeltVorschau(spiegeln: boolean, art: HintergrundArt): boolean {
  return spiegeln && art !== "bild";
}

/**
 * Rohe Einstellungen in einen verlaesslichen Stand bringen. Reine Funktion,
 * damit die Vorgaben testbar sind: Spiegeln ist an, solange es nicht
 * ausdruecklich abgeschaltet wurde, der Hintergrund ist aus, solange nichts
 * Gueltiges gewaehlt ist.
 */
export function normalisiereVideocallProfil(roh: unknown): Required<Pick<VideocallProfil, "spiegeln" | "beitrittStumm" | "beitrittOhneKamera" | "hintergrund" | "leisteVideosOffen">> & VideocallProfil {
  const profil = (roh && typeof roh === "object" ? roh : {}) as VideocallProfil;
  return {
    ...profil,
    spiegeln: profil.spiegeln !== false,
    beitrittStumm: profil.beitrittStumm === true,
    beitrittOhneKamera: profil.beitrittOhneKamera === true,
    hintergrund: normalisiereHintergrund(profil.hintergrund),
    leisteVideosOffen: profil.leisteVideosOffen === true,
  };
}

/** Die eigenen Videocall-Einstellungen lesen, mit sicheren Vorgaben. */
export function ladeVideocallProfil() {
  return normalisiereVideocallProfil(getUserSetting<VideocallProfil | null>(VIDEOCALL_SCHLUESSEL, null));
}

/**
 * Dasselbe, aber erst nachdem die Einstellungen wirklich im Zwischenspeicher
 * liegen.
 *
 * `ladeVideocallProfil` liest synchron aus `dataCache`. Ist die Tabelle
 * `user_settings` noch nicht geladen, liefert sie kommentarlos die Vorgaben:
 * kein Hintergrund, Standardgeraete, nicht stumm. Genau das passiert beim
 * Bewerbergespraech, denn "Videoraum oeffnen" geht in einen **neuen Tab**.
 * Dort faengt der Zwischenspeicher bei null an, und wer zuegig auf "Raum
 * betreten" klickt, ist schneller als die erste Ladewelle. Der gewaehlte
 * Hintergrund fiel dann still auf "aus" zurueck, ohne jede Meldung.
 *
 * Ein Ladefehler ist kein Grund, das Gespraech zu verhindern: Dann gelten
 * eben die Vorgaben, wie bisher.
 */
export async function ladeVideocallProfilSicher() {
  if (!isTableLoaded("user_settings")) {
    try {
      await cacheReload("user_settings");
    } catch {
      // Ohne Einstellungen laeuft das Gespraech mit den Vorgaben weiter.
    }
  }
  return ladeVideocallProfil();
}

/**
 * Einen Teil der Einstellungen speichern. Der Rest bleibt stehen, deshalb
 * zuerst lesen und dann als Ganzes zurueckschreiben: `setUserSetting` ersetzt
 * den Wert unter dem Schluessel komplett.
 */
let speicherKette: Promise<boolean> = Promise.resolve(true);
export function speichereVideocallProfil(patch: Partial<VideocallProfil>): Promise<boolean> {
  speicherKette = speicherKette.then(async () => {
    try {
      const bisher = getUserSetting<VideocallProfil | null>(VIDEOCALL_SCHLUESSEL, null) ?? {};
      await setUserSettingSicher(VIDEOCALL_SCHLUESSEL, { ...bisher, ...patch });
      return true;
    } catch {
      const { toast } = await import("sonner");
      toast.error("Videocall-Einstellung nicht gespeichert. Bitte erneut versuchen.");
      return false;
    }
  });
  return speicherKette;
}
