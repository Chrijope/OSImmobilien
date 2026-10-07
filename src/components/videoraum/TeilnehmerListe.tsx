import { useState } from "react";
import { Copy, Mic, MicOff, Video, VideoOff } from "lucide-react";
import type { Gegenstelle } from "@/lib/videoraumVerbindung";
import { STAND_AN, type Stand, type Staende } from "@/lib/videoraumStaende";
import { kopiereText } from "@/lib/textKopieren";
import { mitWerten } from "@/lib/videoraumAnrede";
import { videoraumGastTexte, type VideoraumGastTexte } from "@/lib/videoraumGastTexte";
import type { Sprache } from "@/lib/seitenSprache";

/**
 * Wer ist im Raum, und wie steht es bei ihm um Mikrofon und Kamera.
 *
 * Christian wollte „wie in Zoom ein Menuepunkt … mit Teilnehmer" und darin den
 * Einladungslink zum Kopieren, um ihn dem Kunden noch einmal per WhatsApp oder
 * Mail zu schicken.
 *
 * Bewusst KEIN kleiner Pfeil am Knopf mit eigenem Klappmenue. In der Leiste
 * stehen jetzt acht Knoepfe; ein zusaetzliches Pfeilchen daran waere auf dem
 * Telefon eine Trefferflaeche von wenigen Pixeln direkt neben einer anderen,
 * und wer danebentippt, schaltet etwas anderes. Ein Knopf, ein Ziel, und der
 * Link steht oben in der Liste: Das ist dieselbe Funktion mit der Haelfte der
 * Fehlerquellen.
 *
 * Den Link bekommt nur der Gastgeber. Ein Gast soll den Zugang zum Raum nicht
 * weiterreichen koennen, die Liste der Anwesenden dagegen sieht er sehr wohl,
 * sie beantwortet ihm „wer ist ausser mir da und hoert mich jemand".
 */

/**
 * Eine Zeile: Name links, Mikrofon und Kamera rechts.
 *
 * Das Mikrofon ist beim Gastgeber ein Knopf, siehe `aufStumm`. Christian am
 * 18.09.2026: „wenn ich unten auf teilnehmer klicke so soll ich dort auch mit
 * klick auf stumm schalten … da soll ich zumindest nur mit Klick auf Stumm
 * schalten, den Teilnehmer stumm schalten koennen." Die Kamera bleibt
 * ausdruecklich Anzeige, er hat sie offengelassen.
 */
function Zeile({
  name,
  stand,
  zusatz,
  aufStumm,
  t,
}: {
  t: VideoraumGastTexte["liste"];
  name: string;
  stand: Stand;
  zusatz?: string;
  /**
   * Diesen Teilnehmer stummschalten. Nur beim Gastgeber gesetzt, und nur fuer
   * die Gaeste: Fuer die eigene Zeile gibt es die Knopfleiste.
   *
   * Fehlt die Funktion, bleibt das Zeichen reine Anzeige. Ein Gast bekommt sie
   * nie, er darf niemanden stummschalten.
   */
  aufStumm?: () => void;
}) {
  /*
   * Aufheben laesst sich die Stummschaltung nicht: Ein fremdes Mikrofon kann
   * von aussen niemand einschalten, es gibt dafuer auch keinen Regiebefehl,
   * siehe `RegieBefehl`. Bei einem stummen Gast bleibt das Zeichen deshalb
   * Anzeige. Ein Knopf, der aussieht, als koennte er etwas, das er nicht kann,
   * waere schlimmer als gar keiner.
   */
  const schaltbar = Boolean(aufStumm) && stand.tonAn;
  const tonTitel = stand.tonAn
    ? (schaltbar ? mitWerten(t.stummschalten, { name }) : t.mikrofonAn)
    : t.mikrofonAusLang;

  return (
    <div data-pruefung="teilnehmer-zeile" className="flex items-center gap-2 py-1">
      <span className="min-w-0 flex-1 truncate text-[13px] text-white">
        {name}
        {zusatz && <span className="ml-1.5 text-[11.5px] text-white/40">{zusatz}</span>}
      </span>
      {schaltbar ? (
        /*
          44 mal 44 in FESTEN Pixeln. In `index.css` steht unter 768 Pixeln
          eine Regel `button { min-height: 40px }`, die ein `min-h-[44px]` aus
          Tailwind schlagen wuerde.
        */
        <button
          type="button"
          data-pruefung="zeile-stumm"
          onClick={aufStumm}
          title={tonTitel}
          aria-label={tonTitel}
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Mic className="h-4 w-4" />
        </button>
      ) : (
        <span
          title={tonTitel}
          aria-label={`${name}: ${stand.tonAn ? t.mikrofonAn : t.mikrofonAus}`}
          className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center ${stand.tonAn ? "text-white/55" : "text-[#E5372B]"}`}
        >
          {stand.tonAn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </span>
      )}
      {/*
        Die Kamera bleibt Anzeige. Christian hat sie ausdruecklich
        offengelassen, und technisch waere es ohnehin dasselbe halbe Ding wie
        beim Ton: ausschalten ja, wieder einschalten nie.
      */}
      <span
        title={stand.bildAn ? t.kameraAn : t.kameraAus}
        aria-label={`${name}: ${stand.bildAn ? t.kameraAn : t.kameraAus}`}
        className={`flex h-[44px] w-8 shrink-0 items-center justify-center ${stand.bildAn ? "text-white/55" : "text-[#E5372B]"}`}
      >
        {stand.bildAn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </span>
    </div>
  );
}

/**
 * Der Einladungslink mit dem Knopf zum Kopieren.
 *
 * Schlaegt das Kopieren fehl, verschwindet nicht einfach die Rueckmeldung:
 * Dann steht der Link in einem Feld zum Markieren da. Genau dieser Fall hat
 * Christian am 18.09.2026 einen haengenden Browser vorgetaeuscht, siehe
 * `textKopieren`. Ein Browser-Dialog kommt hier nicht vor.
 */
function EinladungsLink({ link }: { link: string }) {
  const [stand, setStand] = useState<"bereit" | "kopiert" | "gescheitert">("bereit");

  const kopieren = async () => {
    const ergebnis = await kopiereText(link);
    setStand(ergebnis === "kopiert" ? "kopiert" : "gescheitert");
  };

  return (
    <div className="border-b border-white/[0.07] pb-3">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
        Einladungslink
      </p>
      <p className="mb-2 text-[11.5px] leading-relaxed text-white/50">
        Schick ihn deinem Kunden noch einmal, etwa per WhatsApp oder Mail. Er führt in den
        Warteraum, hereingelassen wird weiterhin nur von dir.
      </p>
      <button
        type="button"
        data-pruefung="einladung-kopieren"
        onClick={() => void kopieren()}
        className="flex h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/[0.14]"
      >
        <Copy aria-hidden className="h-4 w-4" />
        {stand === "kopiert" ? "Link kopiert" : "Link kopieren"}
      </button>

      {/*
        Nach dem Fehlschlag der Link zum Markieren. `readOnly` statt
        `disabled`: ein gesperrtes Feld laesst sich nicht markieren, und genau
        darum geht es hier.
      */}
      {stand === "gescheitert" && (
        <div data-pruefung="einladung-auswahl" className="mt-2">
          <p className="mb-1.5 text-[11.5px] leading-relaxed text-[#FFB4AE]">
            Dein Browser hat das Kopieren nicht zugelassen. Markiere den Link und kopiere ihn von
            Hand.
          </p>
          <input
            readOnly
            value={link}
            aria-label="Einladungslink zum Markieren"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white outline-none focus:border-[#88CFFF]/50"
          />
        </div>
      )}
    </div>
  );
}

export function TeilnehmerListe({
  gegenstellen,
  staende,
  eigenerStand,
  eigenerName,
  einladungsLink,
  aufStumm,
  sprache = "de",
}: {
  gegenstellen: Gegenstelle[];
  staende: Staende;
  eigenerStand: Stand;
  /** Der eigene Anzeigename. Fehlt er, steht dort nur „Du". */
  eigenerName?: string;
  /** Nur beim Gastgeber gesetzt. Fehlt er, gibt es den Abschnitt nicht. */
  einladungsLink?: string;
  /**
   * Einen Gast stummschalten, dieselbe Funktion wie in der Spalte und im
   * Dreipunktmenue an der Kachel.
   *
   * Nur der Gastgeber reicht sie herein. Beim Gast bleiben beide Zeichen
   * Anzeige, und das steht hier nicht im Ausblenden, sondern im Bauplan:
   * Wer die Funktion nicht bekommt, hat keinen Knopf. Massgeblich bleibt
   * ohnehin, dass ein fremder Browser nur dem Gastgeber gehorcht.
   */
  aufStumm?: (kennung: string) => void;
  /**
   * Sprache der Liste, Vorgabe Deutsch. Einladungslink und Stummschalt-Hinweis
   * sieht nur der Gastgeber, sie bleiben deutsch.
   */
  sprache?: Sprache;
}) {
  const t = videoraumGastTexte(sprache).liste;
  return (
    <div className="flex flex-col gap-3">
      {einladungsLink && <EinladungsLink link={einladungsLink} />}

      <div>
        {/* Die eigene Zeile nie schaltbar: Sich selbst schaltet man unten in
            der Knopfleiste, dort geht auch das Wiedereinschalten. */}
        <Zeile name={eigenerName?.trim() || t.du} stand={eigenerStand} zusatz={t.duZusatz} t={t} />
        {gegenstellen.map((g) => (
          <Zeile
            key={g.kennung}
            name={g.name}
            stand={staende[g.kennung] ?? STAND_AN}
            aufStumm={aufStumm ? () => aufStumm(g.kennung) : undefined}
            t={t}
          />
        ))}
        {gegenstellen.length === 0 && (
          <p className="py-2 text-[12px] leading-relaxed text-white/45">
            {t.niemand}
          </p>
        )}
        {/*
          Pflichthinweis, derselbe Wortlaut wie in der Gastregie: Wer jemanden
          stummschaltet, greift in dessen Geraet ein. Das darf niemand aus
          Versehen tun, und niemand soll glauben, er habe es danach in der Hand.
        */}
        {aufStumm && gegenstellen.length > 0 && (
          <p data-pruefung="stumm-hinweis" className="mt-1.5 text-[11px] leading-relaxed text-white/35">
            Ein Klick auf das Mikrofon schaltet den Teilnehmer stumm. Das wirkt bei ihm, nicht nur
            hier. Er sieht einen Hinweis und kann sein Mikrofon selbst wieder einschalten.
          </p>
        )}
      </div>
    </div>
  );
}
