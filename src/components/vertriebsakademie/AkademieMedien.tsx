// Bild und Video im Lehrtext der Vertriebsakademie.
//
// Stand heute gibt es im Inhaltstyp `AkademieSection` KEIN Feld für Bild,
// Video oder Audio. Die Aussage, die Akademie bestehe aus „Texten und ein paar
// Grafiken", stimmt am Code also genau: Grafiken sind ausschließlich die
// gerechneten Recharts-Blöcke aus `AkademieVisuals`.
//
// Diese Datei ist die vorbereitete Gegenseite. Sobald in
// `vertriebsakademieContent.ts` die beiden Felder
//
//     bild?: AkademieBild;
//     video?: AkademieVideo;
//
// am Abschnitt stehen, rendert die Kapitelseite sie ohne weitere Änderung.
// Bis dahin ist der Block schlicht nie sichtbar, weil kein Abschnitt die
// Felder trägt. Die Typen hier sind bewusst die vollständigen Zielformen,
// damit die Ergänzung im Inhaltstyp eine reine Kopie ist.

import { useState } from "react";
import { ExternalLink, Film, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Standbild zu einem Abschnitt. */
export interface AkademieBild {
  /** Pfad unter `public/` oder vollständige Adresse. */
  url: string;
  /** Bildbeschreibung für Screenreader und für den Fall, dass das Bild fehlt. Pflicht. */
  alt: string;
  /** Sichtbare Bildunterschrift. */
  bildunterschrift?: string;
  /** Bild in voller Breite statt auf Lesebreite begrenzt. */
  breit?: boolean;
}

/** Video zu einem Abschnitt. */
export interface AkademieVideo {
  /**
   * Bei `typ: "datei"` der Pfad zur Videodatei (etwa `/video/kapitel-5.mp4`),
   * bei `typ: "einbettung"` die Adresse des Players.
   */
  url: string;
  titel: string;
  /** Standbild, das vor dem Start zu sehen ist. */
  poster?: string;
  /** Voreinstellung „datei". Eine Einbettung läuft im iframe. */
  typ?: "datei" | "einbettung";
  /** Länge in Sekunden. Wird als „3:20" angezeigt, damit man weiß, worauf man sich einlässt. */
  dauerSek?: number;
  /** Ein Satz darüber, was das Video zeigt. */
  beschreibung?: string;
}

function dauerText(sek: number): string {
  const m = Math.floor(sek / 60);
  const s = String(Math.round(sek % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Ein Bild im Lehrtext.
 *
 * Lädt verzögert und fällt bei einem toten Pfad auf eine ruhige Zeile zurück,
 * statt ein kaputtes Symbol im Text stehen zu lassen.
 */
export function AkademieBildBlock({ bild }: { bild: AkademieBild }) {
  const [kaputt, setKaputt] = useState(false);

  if (kaputt) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4 shrink-0" />
        <span>Bild nicht verfügbar: {bild.alt}</span>
      </div>
    );
  }

  return (
    <figure className={bild.breit ? "space-y-2" : "space-y-2 max-w-2xl"}>
      <img
        src={bild.url}
        alt={bild.alt}
        loading="lazy"
        onError={() => setKaputt(true)}
        className="w-full rounded-lg border bg-muted/30"
      />
      {bild.bildunterschrift && (
        <figcaption className="text-xs text-muted-foreground leading-relaxed">
          {bild.bildunterschrift}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Ein Video im Lehrtext.
 *
 * Ausdrücklich ohne Autostart und ohne Endlosschleife: Ein Video, das von
 * selbst losläuft, während jemand liest, ist eine Störung. Geladen werden
 * zunächst nur die Metadaten, damit die Kapitelseite am Telefon nicht
 * unnötig Daten zieht.
 */
export function AkademieVideoBlock({ video }: { video: AkademieVideo }) {
  const istEinbettung = video.typ === "einbettung";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Film className="h-3.5 w-3.5" /> {video.titel}
          {video.dauerSek !== undefined && (
            <span className="font-normal normal-case tabular-nums">
              · {dauerText(video.dauerSek)} Minuten
            </span>
          )}
        </div>
        {istEinbettung && (
          <Button asChild size="sm" variant="outline" className="gap-1">
            <a href={video.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> In neuem Tab öffnen
            </a>
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-black/90">
        {istEinbettung ? (
          <iframe
            src={video.url}
            title={video.titel}
            loading="lazy"
            allowFullScreen
            className="block w-full aspect-video"
          />
        ) : (
          <video
            src={video.url}
            poster={video.poster}
            controls
            preload="metadata"
            playsInline
            className="block w-full"
          />
        )}
      </div>

      {video.beschreibung && (
        <p className="text-xs text-muted-foreground leading-relaxed">{video.beschreibung}</p>
      )}
    </div>
  );
}

/**
 * Liest Bild und Video aus einem Abschnitt, ohne den Inhaltstyp zu kennen.
 *
 * Nötig, solange `AkademieSection` die beiden Felder nicht führt. Der
 * Zwischenschritt kostet nichts und verschwindet, sobald die Felder im Typ
 * stehen: Dann kann `sec.bild` und `sec.video` direkt gelesen werden.
 */
export function medienAusAbschnitt(sec: unknown): { bild?: AkademieBild; video?: AkademieVideo } {
  const s = sec as { bild?: AkademieBild; video?: AkademieVideo } | null | undefined;
  const bild = s?.bild && typeof s.bild.url === "string" && s.bild.url ? s.bild : undefined;
  const video = s?.video && typeof s.video.url === "string" && s.video.url ? s.video : undefined;
  return { bild, video };
}
