/**
 * Geraetewahl fuer den Videoraum: Kamera, Mikrofon, Lautsprecher.
 *
 * Die reinen Entscheidungen (welche Kennung gilt, kann der Browser den
 * Lautsprecher wechseln) liegen hier getrennt vom Browserzugriff, damit sie
 * sich testen lassen. Der eigentliche Geraetewechsel tauscht die Spur im
 * laufenden Stream aus und reicht sie an die Verbindung weiter, ohne dass die
 * Gegenstellen etwas davon merken.
 */

export interface GeraeteListe {
  kameras: MediaDeviceInfo[];
  mikrofone: MediaDeviceInfo[];
  lautsprecher: MediaDeviceInfo[];
}

/**
 * Gilt eine gespeicherte Geraetekennung noch? Nur wenn das Geraet in der
 * aktuellen Liste steht. Sonst greift der Browser-Standard, das ist der
 * saubere Rueckfall, wenn etwa die USB-Kamera nicht angeschlossen ist.
 */
export function waehleGeraeteId(
  gewuenscht: string | null | undefined,
  vorhandene: Array<Pick<MediaDeviceInfo, "deviceId">>,
): string | undefined {
  if (!gewuenscht) return undefined;
  return vorhandene.some((g) => g.deviceId === gewuenscht) ? gewuenscht : undefined;
}

/**
 * Kann dieser Browser die Tonausgabe auf ein bestimmtes Geraet legen?
 * Safari kann `setSinkId` bis heute nicht, dort wird die Auswahl gar nicht
 * erst angeboten.
 */
export function kannLautsprecherWaehlen(): boolean {
  return typeof HTMLMediaElement !== "undefined"
    && "setSinkId" in HTMLMediaElement.prototype;
}

/** Leere Liste, wenn der Browser nichts hergibt. */
const LEERE_LISTE: GeraeteListe = { kameras: [], mikrofone: [], lautsprecher: [] };

/**
 * Alle Geraete auflisten, nach Art sortiert. Geraete ohne Kennung fallen
 * heraus: Vor der ersten Freigabe liefert der Browser Platzhalter ohne
 * `deviceId`, mit denen sich nichts anfangen laesst.
 */
export async function listeGeraete(): Promise<GeraeteListe> {
  if (!navigator.mediaDevices?.enumerateDevices) return LEERE_LISTE;
  try {
    const alle = await navigator.mediaDevices.enumerateDevices();
    const brauchbar = alle.filter((g) => g.deviceId);
    return {
      kameras: brauchbar.filter((g) => g.kind === "videoinput"),
      mikrofone: brauchbar.filter((g) => g.kind === "audioinput"),
      lautsprecher: kannLautsprecherWaehlen()
        ? brauchbar.filter((g) => g.kind === "audiooutput")
        : [],
    };
  } catch {
    return LEERE_LISTE;
  }
}

/**
 * Die Tonausgabe eines Video-Elements auf ein Geraet legen. Ohne
 * `setSinkId`-Unterstuetzung oder bei Ablehnung passiert schlicht nichts,
 * dann bleibt es beim Standardlautsprecher.
 */
export async function setzeAusgabeGeraet(el: HTMLMediaElement, geraetId: string | null | undefined): Promise<void> {
  const setter = (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (typeof setter !== "function") return;
  try {
    await setter.call(el, geraetId ?? "");
  } catch (fehler) {
    console.warn("Lautsprecher konnte nicht gesetzt werden:", fehler);
  }
}

const BILD = { width: { ideal: 1280 }, height: { ideal: 720 } };
const TON = { echoCancellation: true, noiseSuppression: true };

/** Eine einzelne neue Spur vom gewuenschten Geraet holen. */
export async function holeEinzelSpur(art: "audio" | "video", geraetId: string): Promise<MediaStreamTrack | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      art === "video"
        ? { video: { ...BILD, deviceId: { exact: geraetId } } }
        : { audio: { ...TON, deviceId: { exact: geraetId } } },
    );
    return stream.getTracks()[0] ?? null;
  } catch (fehler) {
    console.warn("Geraet konnte nicht geholt werden:", fehler);
    return null;
  }
}

/**
 * Eine Spur im laufenden Stream gegen ein anderes Geraet tauschen.
 *
 * Die alte Spur wird gestoppt und ersetzt, der Stummschalt-Zustand wandert
 * mit: Wer sein Mikrofon aus hat und das Geraet wechselt, bleibt stumm. Ueber
 * `ersetzeSenderSpur` bekommen die Gegenstellen die neue Spur, waehrend des
 * Bildschirmteilens ist das dort bewusst ein Leerlauf.
 */
export async function wechsleEingabeGeraet(optionen: {
  stream: MediaStream;
  art: "audio" | "video";
  geraetId: string;
  ersetzeSenderSpur?: (spur: MediaStreamTrack) => Promise<void> | void;
}): Promise<boolean> {
  const { stream, art, geraetId, ersetzeSenderSpur } = optionen;
  const neu = await holeEinzelSpur(art, geraetId);
  if (!neu) return false;

  const alt = stream.getTracks().find((s) => s.kind === art) ?? null;
  neu.enabled = alt ? alt.enabled : true;
  if (alt) {
    stream.removeTrack(alt);
    alt.stop();
  }
  stream.addTrack(neu);
  try {
    await ersetzeSenderSpur?.(neu);
  } catch (fehler) {
    console.warn("Neue Spur kam nicht an die Gegenstellen:", fehler);
  }
  return true;
}
