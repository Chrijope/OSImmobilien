import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  starteVerbindung, holeMedien, setzeSpurZustand,
  type Gegenstelle, type Verbindung, type VerbindungsZustand,
} from "@/lib/videoraumVerbindung";
import { supabase } from "@/integrations/supabase/client";
import { beendeTeilnehmerImRaum, setzeRaumStatus } from "@/lib/videoraumStore";
import { ladeVideocallProfilSicher, speichereVideocallProfil, type HintergrundWahl } from "@/lib/videocallEinstellungen";
import { erstelleHintergrundRegie, type HintergrundRegie } from "@/lib/videocallHintergrund";
import { hintergrundBildUrl } from "@/lib/videocallHintergrundStore";
import { wechsleEingabeGeraet, holeEinzelSpur } from "@/lib/videocallGeraete";
import { kannSchweben, oeffneSchwebendesFenster, schliesseSchwebendesFenster } from "@/lib/schwebendesFenster";
import { entferneAbwesende, uebernehmeStand, type Staende } from "@/lib/videoraumStaende";
import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";

/** Ein Start, der nach dem Entzug der Freigabe nicht mehr abschliessen darf. */
class StartAbgebrochen extends Error {}

/**
 * Das laufende Gespraech, oberhalb der Seiten.
 *
 * Der Partner muss waehrend eines Gespraechs im CRM springen koennen, um dem
 * Kunden etwas zu zeigen. Laege die Verbindung in der Seite, riss sie bei
 * jedem Seitenwechsel ab. Deshalb wohnt sie hier, ueber dem Router, und die
 * Seite zeigt nur noch an, was hier liegt.
 *
 * Minimiert heisst: Das Gespraech laeuft weiter, es ist nur nicht mehr im
 * Vollbild. Oben im CRM bleibt eine Leiste stehen, siehe VideoraumLeiste.
 */

export interface AktivesGespraech {
  raumId: string;
  token: string;
  titel: string;
  gegenName: string;
  /** Zeitpunkt des Verbindungsaufbaus, Grundlage der Dauer in der Leiste. */
  startZeit: number;
}

/** Was `starte` braucht: das Gespraech und das Geheimnis des Signalkanals. */
export type GespraechStart = Omit<AktivesGespraech, "startZeit"> & {
  /** Siehe videoraumVerbindung. Fehlt es, faellt der Kanal auf den Token zurueck. */
  signalGeheimnis?: string | null;
  /** Eigener Anzeigename, steht bei den Gegenstellen an der Kachel. */
  eigenerName?: string;
};

interface VideoraumWert {
  aktiv: AktivesGespraech | null;
  minimiert: boolean;
  lokalerStream: MediaStream | null;
  /** Alle Gegenstellen im Netz, bis zu drei. */
  gegenstellen: Gegenstelle[];
  zustand: VerbindungsZustand;
  verbindung: Verbindung | null;
  tonAn: boolean;
  bildAn: boolean;
  medienFehler: string | null;
  /** Eigenbild spiegeln, nur die eigene Vorschau. Wird gespeichert. */
  spiegeln: boolean;
  /** Gewaehlter Lautsprecher, null heisst Standard. Wird gespeichert. */
  lautsprecherId: string | null;
  /** Aktive Geraete, fuer die Auswahlfelder. */
  kameraId: string | null;
  mikrofonId: string | null;
  /** Aktiver Video-Hintergrund. */
  hintergrund: HintergrundWahl;
  hintergrundLaedt: boolean;
  /**
   * Ton und Kamera der anderen, wie sie es selbst melden. Die
   * Gespraechsansicht fuehrt dieselbe Liste und beantwortet die Nachfragen;
   * hier wird nur mitgehoert, damit die Kacheln in der Leiste und im
   * schwebenden Fenster auch dann stimmen, wenn das Gespraech gerade nicht auf
   * dem Bildschirm steht.
   */
  staende: Staende;
  /**
   * Das schwebende Fenster auf dem Schreibtisch, siehe `schwebendesFenster`.
   * Null, solange keines offen ist.
   */
  schwebeFenster: Window | null;
  /** Kann dieser Browser ueberhaupt ein schwebendes Fenster? */
  schwebenMoeglich: boolean;

  starte: (gespraech: GespraechStart) => Promise<boolean>;
  beende: () => Promise<void>;
  /**
   * Kleiner machen. Wo der Browser es kann, wandern die Kacheln dabei in das
   * schwebende Fenster auf dem Schreibtisch. Muss aus einem Klick heraus
   * aufgerufen werden, sonst laesst der Browser das Fenster nicht zu.
   */
  minimiere: () => void;
  oeffne: () => void;
  /**
   * Das schwebende Fenster oeffnen. Nur aus einem Klick heraus, siehe
   * `schwebendesFenster`. Gibt zurueck, ob es aufgegangen ist.
   */
  oeffneSchwebend: () => Promise<boolean>;
  schliesseSchwebend: () => void;
  setzeGegenName: (name: string) => void;
  wechsleTon: () => void;
  wechsleBild: () => void;
  teileBildschirm: (an: boolean) => Promise<boolean>;
  /**
   * Die rohe Kamera fuer die eigene Vorschau, siehe `roheKamera` in
   * `videocallHintergrund`. Waehrend des Bildschirmteilens ruht die Leinwand
   * des Video-Hintergrunds, das eigene Bild stuende sonst still.
   */
  roheKamera: () => MediaStream | null;
  setzeSpiegeln: (an: boolean) => void;
  setzeLautsprecher: (id: string | null) => void;
  wechsleKamera: (id: string) => Promise<boolean>;
  wechsleMikrofon: (id: string) => Promise<boolean>;
  setzeHintergrund: (wahl: HintergrundWahl) => Promise<void>;
}

const Zusammenhang = createContext<VideoraumWert | null>(null);

export function VideoraumProvider({ children }: { children: React.ReactNode }) {
  const [aktiv, setAktiv] = useState<AktivesGespraech | null>(null);
  const [minimiert, setMinimiert] = useState(false);
  const [lokalerStream, setLokalerStream] = useState<MediaStream | null>(null);
  const [gegenstellen, setGegenstellen] = useState<Gegenstelle[]>([]);
  const [zustand, setZustand] = useState<VerbindungsZustand>("bereit");
  const [tonAn, setTonAn] = useState(true);
  const [bildAn, setBildAn] = useState(true);
  const [medienFehler, setMedienFehler] = useState<string | null>(null);
  const [verbindung, setVerbindung] = useState<Verbindung | null>(null);
  const [spiegeln, setSpiegelnState] = useState(true);
  const [lautsprecherId, setLautsprecherIdState] = useState<string | null>(null);
  const [kameraId, setKameraId] = useState<string | null>(null);
  const [mikrofonId, setMikrofonId] = useState<string | null>(null);
  const [hintergrund, setHintergrundState] = useState<HintergrundWahl>({ art: "aus" });
  const [hintergrundLaedt, setHintergrundLaedt] = useState(false);
  const [staende, setStaende] = useState<Staende>({});
  const [schwebeFenster, setSchwebeFenster] = useState<Window | null>(null);
  // Einmal gefragt: Ob der Browser es kann, aendert sich waehrend einer
  // Sitzung nicht mehr.
  const [schwebenMoeglich] = useState(() => kannSchweben());

  // Der Aufraeumer braucht den aktuellen Stand, nicht den vom Einhaengen.
  const streamRef = useRef<MediaStream | null>(null);
  const verbindungRef = useRef<Verbindung | null>(null);
  // Die Hintergrund-Regie (MediaPipe) haengt am laufenden Gespraech.
  const hintergrundRef = useRef<HintergrundRegie | null>(null);
  // Zwei Klicks auf "Raum betreten" duerfen nicht zwei Verbindungen aufbauen.
  // Der Riegel muss vor dem ersten `await` fallen, sonst kommt er zu spaet.
  const startetRef = useRef(false);
  // Das schwebende Fenster auch dort, wo kein neues Zeichnen stattfindet.
  const schwebeRef = useRef<Window | null>(null);

  /*
   * Die Videocall-Freigabe (seit dem 27.09.2026 nur Christian Peetz als
   * admin). Faellt sie weg, etwa durch einen Rollenwechsel, endet ein
   * laufendes Gespraech, siehe den Waechter weiter unten. `entzugRef` zaehlt
   * jeden Entzug; ein Start, der davor begann, erkennt daran, dass er nicht
   * mehr abschliessen darf.
   */
  const { darf: darfVideocall, laedt: freigabeLaedt } = useVideocallFreigabe();
  const darfRef = useRef(darfVideocall);
  darfRef.current = darfVideocall;
  const entzugRef = useRef(0);

  /** Das schwebende Fenster zumachen, falls eines offen ist. */
  const schliesseSchwebend = useCallback(() => {
    const fenster = schwebeRef.current;
    if (!fenster) return;
    schwebeRef.current = null;
    setSchwebeFenster(null);
    /*
     * Erst zeichnen lassen, dann zumachen.
     *
     * React baut die Kacheln aus dem fremden Dokument ab, und das soll es zu
     * diesem Zeitpunkt noch geben. Wuerde hier sofort geschlossen, raeumte
     * React gleich darauf in einem Dokument auf, das der Browser schon
     * abgeraeumt hat. Beim Schliessen der ganzen Seite kommt der Nachgang
     * nicht mehr dran, dort schliesst der Browser das Fenster ohnehin mit dem
     * Dokument, das es geoeffnet hat.
     */
    window.setTimeout(() => schliesseSchwebendesFenster(fenster), 0);
  }, []);
  const schliesseSchwebendRef = useRef(schliesseSchwebend);
  schliesseSchwebendRef.current = schliesseSchwebend;

  /**
   * Das schwebende Fenster aufmachen.
   *
   * Muss im Klickpfad stehen, siehe `schwebendesFenster`. Geht es nicht auf,
   * bleibt es kommentarlos beim heutigen Verhalten: In Safari und Firefox gibt
   * es diese Technik nicht, und ein Hinweis darauf haette fuer den Nutzer
   * keinen Wert.
   */
  const oeffneSchwebend = useCallback(async () => {
    const offen = schwebeRef.current;
    if (offen && !offen.closed) return true;
    const fenster = await oeffneSchwebendesFenster();
    if (!fenster) return false;
    schwebeRef.current = fenster;
    setSchwebeFenster(fenster);
    // Der Nutzer kann das Fenster selbst zumachen. Dann muss der Stand hier
    // mit, sonst zeigte die Leiste weiter auf ein Fenster, das es nicht gibt.
    fenster.addEventListener("pagehide", () => {
      if (schwebeRef.current !== fenster) return;
      schwebeRef.current = null;
      setSchwebeFenster(null);
    }, { once: true });
    return true;
  }, []);

  /**
   * Einen Hintergrund anwenden. Bei einem eigenen Bild wird zuerst die
   * signierte Adresse geholt, der Bucket ist privat. Mit `speichern` wandert
   * die Wahl in die Videocall-Einstellungen und gilt beim naechsten Gespraech
   * wieder.
   */
  const wendeHintergrundAn = useCallback(async (wahl: HintergrundWahl, speichern: boolean) => {
    const regie = hintergrundRef.current;
    if (!regie) return;
    setHintergrundLaedt(true);
    try {
      let bildUrl: string | null = null;
      if (wahl.art === "bild" && wahl.bildPfad) {
        bildUrl = await hintergrundBildUrl(wahl.bildPfad);
        if (!bildUrl) {
          toast.error("Das Hintergrundbild konnte nicht geladen werden.");
          return;
        }
      }
      const ok = await regie.setzeWahl(wahl, bildUrl);
      const wirksam = ok ? wahl : { art: "aus" as const };
      setHintergrundState(wirksam);
      if (speichern && ok) speichereVideocallProfil({ hintergrund: wahl });
    } finally {
      setHintergrundLaedt(false);
    }
  }, []);
  const wendeHintergrundAnRef = useRef(wendeHintergrundAn);
  wendeHintergrundAnRef.current = wendeHintergrundAn;

  const starte = useCallback<VideoraumWert["starte"]>(async ({ signalGeheimnis, eigenerName, ...gespraech }) => {
    if (verbindungRef.current || startetRef.current) return true;
    if (!darfRef.current) return false;
    startetRef.current = true;
    setMedienFehler(null);
    const entzugBeimStart = entzugRef.current;
    const pruefeFreigabe = () => {
      if (entzugRef.current !== entzugBeimStart) throw new StartAbgebrochen();
    };

    try {
      // Die persoenlichen Vorgaben: bevorzugte Geraete, Beitritt stumm oder
      // ohne Kamera, Spiegeln, Hintergrund. Fehlt ein Geraet, faellt
      // holeMedien selbst auf den Standard zurueck.
      const profil = await ladeVideocallProfilSicher();
      pruefeFreigabe();
      const ergebnis = await holeMedien({
        kameraId: profil.kameraId,
        mikrofonId: profil.mikrofonId,
      });
      if (!ergebnis.stream) {
        setMedienFehler(ergebnis.grund);
        return false;
      }
      streamRef.current = ergebnis.stream;
      pruefeFreigabe();
      setLokalerStream(ergebnis.stream);

      const tonStart = !profil.beitrittStumm;
      const bildStart = !profil.beitrittOhneKamera;
      if (!tonStart) setzeSpurZustand(ergebnis.stream, "audio", false);
      if (!bildStart) setzeSpurZustand(ergebnis.stream, "video", false);
      setTonAn(tonStart);
      setBildAn(bildStart);
      setSpiegelnState(profil.spiegeln);
      setLautsprecherIdState(profil.lautsprecherId ?? null);
      setKameraId(profil.kameraId ?? null);
      setMikrofonId(profil.mikrofonId ?? null);

      const v = await starteVerbindung({
        token: gespraech.token,
        signalGeheimnis,
        istGastgeber: true,
        eigenerName,
        lokalerStream: ergebnis.stream,
        aufGegenstellen: setGegenstellen,
        aufZustand: setZustand,
      });
      verbindungRef.current = v;
      pruefeFreigabe();
      // Der Verbindung den Beitrittsstand nachziehen: Sie merkt sich intern,
      // ob das Bild an ist, und wuerde sonst beim Bildschirmteilen trotz
      // "Ohne Kamera beitreten" den Bildschirm sichtbar hinausgeben.
      if (!tonStart) v.setzeSpur("audio", false);
      if (!bildStart) v.setzeSpur("video", false);
      setVerbindung(v);
      setAktiv({ ...gespraech, startZeit: Date.now() });
      setMinimiert(false);
      void setzeRaumStatus(gespraech.raumId, "laufend");

      /*
       * Die Hintergrund-Regie fuer dieses Gespraech. Sie laeuft auch waehrend
       * des Bildschirmteilens weiter: Seit dem 18.09.2026 geht das Gesicht
       * zusammen mit dem Bildschirm hinaus, und die Leinwand ist dieses
       * Gesicht. Ruhte sie, saehe der Kunde dort ein Standbild.
       */
      const regie = erstelleHintergrundRegie({
        stream: ergebnis.stream,
        ersetzeSenderSpur: (spur) => verbindungRef.current?.ersetzeSpur?.("video", spur),
        aufFehler: (meldung) => {
          setHintergrundState({ art: "aus" });
          toast.error(meldung);
        },
      });
      hintergrundRef.current = regie;
      regie.setzeKameraAn(bildStart);
      v.beobachteTeilen((an) => {
        // Mit dem Teilen endet auch das schwebende Fenster. Es geht beim Klick
        // auf "Teilen" auf, also gehoert es beim Aufhoeren wieder zu. Der
        // Melder liefert beim Anmelden sofort den aktuellen Stand, hier also
        // "aus"; dann ist ohnehin kein Fenster offen und nichts zu tun.
        if (!an) schliesseSchwebendRef.current();
      });

      // Der gespeicherte Hintergrund gilt ab dem Start. Vorgabe ist aus,
      // dann passiert hier nichts und MediaPipe bleibt ungeladen.
      setHintergrundState({ art: "aus" });
      if (profil.hintergrund.art !== "aus") {
        void wendeHintergrundAnRef.current(profil.hintergrund, false);
      }
      return true;
    } catch (fehler) {
      // Ohne diesen Zweig bliebe die Kamera an, ohne dass es eine Ansicht
      // gaebe, ueber die man sie wieder ausschalten koennte.
      const abgebrochen = fehler instanceof StartAbgebrochen;
      if (!abgebrochen) console.error("Gespraech konnte nicht gestartet werden:", fehler);
      hintergrundRef.current?.beenden();
      hintergrundRef.current = null;
      // Auch die Signalisierung, falls sie schon stand.
      verbindungRef.current?.beenden();
      verbindungRef.current = null;
      setVerbindung(null);
      streamRef.current?.getTracks().forEach((s) => s.stop());
      streamRef.current = null;
      setLokalerStream(null);
      if (!abgebrochen) setMedienFehler("Das Gespräch konnte nicht gestartet werden. Bitte erneut versuchen.");
      return false;
    } finally {
      startetRef.current = false;
    }
  }, []);

  const beende = useCallback(async () => {
    // Zuerst das schwebende Fenster: Es liegt ueber allen Anwendungen und darf
    // kein Gespraech ueberleben, das es gar nicht mehr gibt.
    schliesseSchwebendRef.current();
    setStaende({});
    // Erst die Hintergrund-Regie: sie legt die rohe Kameraspur zurueck in
    // den Stream, damit das Stoppen darunter auch die Kameraleuchte trifft.
    hintergrundRef.current?.beenden();
    hintergrundRef.current = null;
    setHintergrundState({ art: "aus" });
    verbindungRef.current?.beenden();
    verbindungRef.current = null;
    setVerbindung(null);
    streamRef.current?.getTracks().forEach((s) => s.stop());
    streamRef.current = null;
    setLokalerStream(null);
    setGegenstellen([]);
    setZustand("bereit");
    setMinimiert(false);

    const raumId = aktiv?.raumId;
    setAktiv(null);
    if (raumId) {
      /*
       * Auflegen heisst nicht schliessen. Vorher stand der Raum danach auf
       * "beendet", und niemand kam mehr herein: ein versehentlicher Klick auf
       * Auflegen oder ein zugefallenes Fenster kostete den Kunden seinen Link.
       * Endgueltig schliesst nur der Gastgeber selbst, siehe `schliesseRaum`
       * auf der Gastgeberseite.
       */
      await setzeRaumStatus(raumId, "offen");
      // Auch beim Auflegen aus der Leiste heraus, nicht nur von der
      // Gastgeberseite aus. Sonst steht der Gast dort weiter als eingelassen.
      await beendeTeilnehmerImRaum(raumId);
    }
  }, [aktiv]);

  /*
   * Beim Abmelden muss das Gespraech mit. Sonst laeuft die Kamera weiter,
   * waehrend schon die Anmeldeseite zu sehen ist. Nur das ausdrueckliche
   * Abmelden zaehlt, ein erneuertes Zugangsmerkmal ist kein Grund aufzulegen.
   */
  const beendeRef = useRef(beende);
  beendeRef.current = beende;
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((ereignis) => {
      if (ereignis === "SIGNED_OUT") void beendeRef.current();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /*
   * Fenster zu, Gespraech zu.
   *
   * Faellt dem Gastgeber das Fenster zu, blieb der Raum bisher auf "laufend"
   * und der Gast in der Liste auf "eingelassen" stehen. Damit war der Raum
   * fuer den naechsten Gast blockiert.
   *
   * Zwei Ereignisse, weil kein Browser beide zuverlaessig liefert:
   * `pagehide` greift auch auf iOS, `beforeunload` auf dem Schreibtisch. Der
   * Riegel `laeuftAufraeumen` sorgt dafuer, dass es trotzdem nur einmal
   * passiert. Die Schreibvorgaenge sind ein Versuch, keine Garantie: Der
   * Browser darf laufende Anfragen beim Schliessen abbrechen. Der Abschied an
   * die Gegenstelle geht ueber den schon offenen Websocket und kommt deshalb
   * meistens noch durch.
   */
  const aktivRef = useRef(aktiv);
  aktivRef.current = aktiv;
  useEffect(() => {
    let laeuftAufraeumen = false;
    const aufraeumen = () => {
      if (laeuftAufraeumen || !verbindungRef.current) return;
      laeuftAufraeumen = true;
      hintergrundRef.current?.beenden();
      hintergrundRef.current = null;
      verbindungRef.current.beenden();
      verbindungRef.current = null;
      streamRef.current?.getTracks().forEach((s) => s.stop());
      streamRef.current = null;
      schliesseSchwebendRef.current();
      const raumId = aktivRef.current?.raumId;
      if (raumId) {
        void setzeRaumStatus(raumId, "offen");
        void beendeTeilnehmerImRaum(raumId);
      }
    };
    window.addEventListener("pagehide", aufraeumen);
    window.addEventListener("beforeunload", aufraeumen);
    return () => {
      window.removeEventListener("pagehide", aufraeumen);
      window.removeEventListener("beforeunload", aufraeumen);
    };
  }, []);

  /*
   * Freigabe weg, Gespraech zu.
   *
   * Wechselt der Gastgeber die Rolle weg von admin, verliert er den
   * Videocall. Ohne diesen Waechter liefen Kamera, Signalisierung und das
   * schwebende Fenster weiter, obwohl die Seiten dazu schon gesperrt sind.
   * Ein Start, der gerade laeuft, bricht ueber `entzugRef` ab.
   */
  useEffect(() => {
    if (freigabeLaedt || darfVideocall) return;
    entzugRef.current += 1;
    if (verbindungRef.current || streamRef.current || aktivRef.current || schwebeRef.current) {
      void beendeRef.current();
    }
  }, [darfVideocall, freigabeLaedt]);

  /*
   * Mithoeren, wie es bei den anderen um Ton und Kamera steht.
   *
   * Nur mithoeren: Gefragt und geantwortet wird in der Gespraechsansicht, die
   * kennt den eigenen Stand. Beide Melder haengen an derselben Verbindung und
   * bekommen jede eingehende Meldung, auch die Antwort auf eine Nachfrage der
   * Ansicht. Gebraucht wird es hier, weil die Kacheln in der Leiste und im
   * schwebenden Fenster weiterlaufen, waehrend die Ansicht abgebaut ist.
   */
  useEffect(() => {
    if (!verbindung?.beobachteRegie) return;
    return verbindung.beobachteRegie((befehl, von) => {
      if (befehl.art !== "tonstand" && befehl.art !== "bildstand") return;
      setStaende((bisher) => uebernehmeStand(bisher, von, befehl.art, befehl.an));
    });
  }, [verbindung]);

  // Wer weg ist, hinterlaesst keinen Stand.
  const kennungen = gegenstellen.map((g) => g.kennung).join("|");
  useEffect(() => {
    const vorhandene = kennungen ? kennungen.split("|") : [];
    setStaende((bisher) => entferneAbwesende(bisher, vorhandene));
  }, [kennungen]);

  const wechsleTon = useCallback(() => {
    setTonAn((vorher) => {
      const neu = !vorher;
      setzeSpurZustand(streamRef.current, "audio", neu);
      verbindungRef.current?.setzeSpur("audio", neu);
      return neu;
    });
  }, []);

  const wechsleBild = useCallback(() => {
    setBildAn((vorher) => {
      const neu = !vorher;
      setzeSpurZustand(streamRef.current, "video", neu);
      verbindungRef.current?.setzeSpur("video", neu);
      // Kamera aus stoppt auch die Hintergrund-Verarbeitung, und die rohe
      // Kameraspur haengt waehrend der Komposition nicht mehr im Stream.
      hintergrundRef.current?.setzeKameraAn(neu);
      return neu;
    });
  }, []);

  const teileBildschirm = useCallback(async (an: boolean) => {
    return (await verbindungRef.current?.teileBildschirm(an)) ?? false;
  }, []);

  const roheKamera = useCallback(() => hintergrundRef.current?.roheKamera() ?? null, []);

  const setzeSpiegeln = useCallback((an: boolean) => {
    setSpiegelnState(an);
    speichereVideocallProfil({ spiegeln: an });
  }, []);

  const setzeLautsprecher = useCallback((id: string | null) => {
    setLautsprecherIdState(id);
    speichereVideocallProfil({ lautsprecherId: id ?? undefined });
  }, []);

  const wechsleKamera = useCallback(async (id: string) => {
    const stream = streamRef.current;
    if (!stream) return false;
    const regie = hintergrundRef.current;
    if (regie?.aktiv()) {
      // Waehrend der Komposition laeuft die Kamera nicht im Stream, sondern
      // in der Regie. Die neue Spur geht direkt dorthin.
      const neu = await holeEinzelSpur("video", id);
      if (!neu) { toast.error("Die Kamera konnte nicht gewechselt werden."); return false; }
      regie.wechsleKameraSpur(neu);
    } else {
      const ok = await wechsleEingabeGeraet({
        stream,
        art: "video",
        geraetId: id,
        ersetzeSenderSpur: (spur) => verbindungRef.current?.ersetzeSpur?.("video", spur),
      });
      if (!ok) { toast.error("Die Kamera konnte nicht gewechselt werden."); return false; }
    }
    setKameraId(id);
    speichereVideocallProfil({ kameraId: id });
    return true;
  }, []);

  const wechsleMikrofon = useCallback(async (id: string) => {
    const stream = streamRef.current;
    if (!stream) return false;
    const ok = await wechsleEingabeGeraet({
      stream,
      art: "audio",
      geraetId: id,
      ersetzeSenderSpur: (spur) => verbindungRef.current?.ersetzeSpur?.("audio", spur),
    });
    if (!ok) { toast.error("Das Mikrofon konnte nicht gewechselt werden."); return false; }
    setMikrofonId(id);
    speichereVideocallProfil({ mikrofonId: id });
    return true;
  }, []);

  const setzeHintergrund = useCallback(async (wahl: HintergrundWahl) => {
    await wendeHintergrundAn(wahl, true);
  }, [wendeHintergrundAn]);

  const wert = useMemo<VideoraumWert>(() => ({
    aktiv,
    minimiert,
    lokalerStream,
    gegenstellen,
    zustand,
    verbindung,
    tonAn,
    bildAn,
    medienFehler,
    spiegeln,
    lautsprecherId,
    kameraId,
    mikrofonId,
    hintergrund,
    hintergrundLaedt,
    staende,
    schwebeFenster,
    schwebenMoeglich,
    starte,
    beende,
    /*
     * Kleiner machen und die Kacheln mitnehmen.
     *
     * Der Klick auf "Kleiner" ist die Nutzergeste, die der Browser fuer das
     * schwebende Fenster verlangt, deshalb steht das Oeffnen hier und nicht in
     * einem Nachgang. Wo es nicht geht, bleibt es bei der Leiste oben, dort
     * mit den einklappbaren Videos.
     */
    minimiere: () => {
      setMinimiert(true);
      void oeffneSchwebend();
    },
    /*
     * Zurueck ins Vollbild. Dann steht das Gespraech wieder gross auf dem
     * Bildschirm, und ein zweites kleines Fenster mit denselben Gesichtern
     * daneben waere nur doppelt.
     */
    oeffne: () => {
      setMinimiert(false);
      schliesseSchwebend();
    },
    oeffneSchwebend,
    schliesseSchwebend,
    setzeGegenName: (name: string) => setAktiv((v) => (v ? { ...v, gegenName: name } : v)),
    wechsleTon,
    wechsleBild,
    teileBildschirm,
    roheKamera,
    setzeSpiegeln,
    setzeLautsprecher,
    wechsleKamera,
    wechsleMikrofon,
    setzeHintergrund,
  }), [
    aktiv, minimiert, lokalerStream, gegenstellen, zustand, verbindung, tonAn, bildAn,
    medienFehler, spiegeln, lautsprecherId, kameraId, mikrofonId, hintergrund, hintergrundLaedt, roheKamera,
    staende, schwebeFenster, schwebenMoeglich, oeffneSchwebend, schliesseSchwebend,
    starte, beende, wechsleTon, wechsleBild, teileBildschirm,
    setzeSpiegeln, setzeLautsprecher, wechsleKamera, wechsleMikrofon, setzeHintergrund,
  ]);

  return <Zusammenhang.Provider value={wert}>{children}</Zusammenhang.Provider>;
}

/** Zugriff auf das laufende Gespraech. Setzt den Provider voraus. */
export function useVideoraum(): VideoraumWert {
  const wert = useContext(Zusammenhang);
  if (!wert) {
    throw new Error("useVideoraum braucht den VideoraumProvider");
  }
  return wert;
}

/** Fuer Stellen, an denen es auch ohne Provider weitergehen muss. */
export function useVideoraumOptional(): VideoraumWert | null {
  return useContext(Zusammenhang);
}
