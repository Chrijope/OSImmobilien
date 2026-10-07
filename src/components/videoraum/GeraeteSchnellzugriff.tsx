import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import type { GeraeteListe } from "@/lib/videocallGeraete";
import type { HintergrundWahl } from "@/lib/videocallEinstellungen";
import { Schalter } from "@/components/videoraum/Warteraum";
import { ladeSegmentierungVor } from "@/lib/videocallHintergrund";
import { mitWerten } from "@/lib/videoraumAnrede";
import { videoraumGastTexte } from "@/lib/videoraumGastTexte";
import type { Sprache } from "@/lib/seitenSprache";

/**
 * Der schnelle Umschalter fuer Geraete und Hintergrund, im Warteraum und im
 * Gespraech. Beide Seiten nutzen dieselbe Komponente: Der Gastgeber bekommt
 * zusaetzlich seine hochgeladenen Hintergrundbilder, der Gast nur Aus und
 * Weichzeichnen, denn eigene Bilder haengen am Konto.
 *
 * Dunkel gestaltet, weil sie ausschliesslich auf den dunklen Videoseiten
 * steht.
 */

export interface HintergrundBildOption {
  pfad: string;
  name: string;
  /** Signierte Vorschau-Adresse, kann fehlen, dann gibt es keine Kachel. */
  url: string | null;
}

interface GeraeteSchnellzugriffProps {
  geraete: GeraeteListe;
  kameraId?: string;
  mikrofonId?: string;
  lautsprecherId?: string;
  aufKamera: (id: string) => void;
  aufMikrofon: (id: string) => void;
  /** Nur gesetzt, wenn der Browser `setSinkId` kann. Sonst kein Feld. */
  aufLautsprecher?: (id: string) => void;
  spiegeln: boolean;
  aufSpiegeln: (an: boolean) => void;
  hintergrund: HintergrundWahl;
  aufHintergrund: (wahl: HintergrundWahl) => void;
  /** Eigene Bilder des Gastgebers. Fehlt beim Gast. */
  hintergrundBilder?: HintergrundBildOption[];
  /** Der Hintergrund laedt gerade (Modell oder Bild). */
  hintergrundLaedt?: boolean;
  /** Sprache der Beschriftungen, Vorgabe Deutsch. Nur die Gastseite reicht sie herein. */
  sprache?: Sprache;
}

function Auswahl({
  label,
  wert,
  geraete,
  aufWechsel,
  standard,
}: {
  label: string;
  standard: string;
  wert?: string;
  geraete: MediaDeviceInfo[];
  aufWechsel: (id: string) => void;
}) {
  const id = useId();
  if (geraete.length === 0) return null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-white/40">
        {label}
      </label>
      <select
        id={id}
        value={wert && geraete.some((g) => g.deviceId === wert) ? wert : ""}
        onChange={(e) => { if (e.target.value) aufWechsel(e.target.value); }}
        className="h-9 w-full rounded-lg border border-white/10 bg-[#18222e] px-2.5 text-[12.5px] text-white outline-none focus:border-[#88CFFF]/60"
      >
        <option value="">{standard}</option>
        {geraete.map((g, i) => (
          <option key={g.deviceId} value={g.deviceId}>
            {g.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function GeraeteSchnellzugriff({
  geraete,
  kameraId,
  mikrofonId,
  lautsprecherId,
  aufKamera,
  aufMikrofon,
  aufLautsprecher,
  spiegeln,
  aufSpiegeln,
  hintergrund,
  aufHintergrund,
  hintergrundBilder,
  hintergrundLaedt = false,
  sprache = "de",
}: GeraeteSchnellzugriffProps) {
  const t = videoraumGastTexte(sprache).geraete;
  // Ein Bild kann laut Wahl aktiv sein, das in der Liste fehlt (geloescht).
  // Die Kacheln zeigen dann schlicht keins als aktiv an.
  const [zeigtAlle, setZeigtAlle] = useState(false);
  const bilder = hintergrundBilder ?? [];

  /*
   * Was gerade angeklickt wurde, nur fuer die Anzeige.
   *
   * Dauert es doch einmal, etwa weil der Nutzer klickt, bevor das Vorladen
   * durch ist, soll er sehen, woran es arbeitet. Deshalb dreht sich der Kreis
   * in der angeklickten Pille selbst und nicht irgendwo daneben. Gesperrt
   * wird nichts: Ein zweiter Klick auf etwas anderes gilt, der letzte Klick
   * gewinnt (siehe `setzeWahl` in videocallHintergrund).
   */
  const [geklickt, setGeklickt] = useState<string | null>(null);
  useEffect(() => { if (!hintergrundLaedt) setGeklickt(null); }, [hintergrundLaedt]);
  const waehle = (kennung: string, wahl: HintergrundWahl) => {
    setGeklickt(kennung);
    aufHintergrund(wahl);
  };
  const laedtGerade = (kennung: string) => hintergrundLaedt && geklickt === kennung;

  /*
   * Die Segmentierung schon laden, sobald der Schalter ueberhaupt zu sehen
   * ist. Vorher begann das Laden erst mit dem Klick, und der erste Wechsel auf
   * Weichzeichnen oder Hintergrundbild liess den Nutzer warten. Wer diese
   * Leiste nie oeffnet, laedt weiterhin nichts.
   */
  useEffect(() => { void ladeSegmentierungVor().catch(() => { /* faellt beim Klick erneut an */ }); }, []);
  const sichtbareBilder = zeigtAlle ? bilder : bilder.slice(0, 6);

  const pille = (aktivPille: boolean) =>
    `rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
      aktivPille
        ? "border-[#88CFFF]/45 bg-[#88CFFF]/15 text-[#88CFFF]"
        : "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
    }`;

  return (
    <div className="flex flex-col gap-3.5">
      <Auswahl label={t.kamera} standard={t.standard} wert={kameraId} geraete={geraete.kameras} aufWechsel={aufKamera} />
      <Auswahl label={t.mikrofon} standard={t.standard} wert={mikrofonId} geraete={geraete.mikrofone} aufWechsel={aufMikrofon} />
      {aufLautsprecher && (
        <Auswahl label={t.lautsprecher} standard={t.standard} wert={lautsprecherId} geraete={geraete.lautsprecher} aufWechsel={aufLautsprecher} />
      )}
      {geraete.kameras.length === 0 && geraete.mikrofone.length === 0 && (
        <p className="text-[11.5px] leading-relaxed text-white/40">
          {t.keineGeraete}
        </p>
      )}

      <div className="border-t border-white/10 pt-1">
        {/*
          Der Schalter bleibt bedienbar und behaelt seine Bedeutung. Er ruht
          nur, solange ein Hintergrundbild laeuft, denn gespiegelt wuerde das
          ganze Bild und damit auch die Schrift darin. Das steht als ruhiger
          Satz am Schalter, nicht als Hinweisfenster.
        */}
        <Schalter
          an={spiegeln}
          beschriftung={t.spiegeln}
          hinweis={hintergrund.art === "bild" ? t.spiegelnRuht : t.spiegelnHinweis}
          aufWechsel={() => aufSpiegeln(!spiegeln)}
        />
      </div>

      <div className="border-t border-white/10 pt-3">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-white/40">
          {t.hintergrund}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={pille(hintergrund.art === "aus")}
            onClick={() => waehle("aus", { art: "aus" })}
          >
            <span className="inline-flex items-center gap-1.5">
              {laedtGerade("aus") && <Loader2 className="h-3 w-3 animate-spin" />}
              {t.kein}
            </span>
          </button>
          <button
            type="button"
            className={pille(hintergrund.art === "weich")}
            onClick={() => waehle("weich", { art: "weich" })}
          >
            <span className="inline-flex items-center gap-1.5">
              {laedtGerade("weich") && <Loader2 className="h-3 w-3 animate-spin" />}
              {t.weich}
            </span>
          </button>
        </div>
        {bilder.length > 0 && (
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {sichtbareBilder.map((bild) => (
              <button
                key={bild.pfad}
                type="button"
                title={bild.name}
                onClick={() => waehle(bild.pfad, { art: "bild", bildPfad: bild.pfad })}
                className={`relative aspect-[16/10] overflow-hidden rounded-lg border transition-colors ${
                  hintergrund.art === "bild" && hintergrund.bildPfad === bild.pfad
                    ? "border-[#88CFFF]"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                {laedtGerade(bild.pfad) && (
                  <span className="absolute inset-0 z-10 flex items-center justify-center bg-[#0B1119]/55">
                    <Loader2 className="h-4 w-4 animate-spin text-white/80" />
                  </span>
                )}
                {bild.url ? (
                  <img src={bild.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[10px] text-white/40">{t.bild}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {bilder.length > 6 && (
          <button
            type="button"
            onClick={() => setZeigtAlle((v) => !v)}
            className="mt-2 text-[11px] text-white/50 hover:text-white/80"
          >
            {zeigtAlle ? t.weniger : mitWerten(t.alleBilder, { zahl: bilder.length })}
          </button>
        )}
      </div>
    </div>
  );
}
