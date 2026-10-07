import { erstelleNotizSpeicher } from "@/lib/notizSpeicher";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, DoorOpen, Loader2, UserCheck, UserX, ShieldAlert, Minimize2,
  DoorClosed, RotateCcw, Mic, MicOff, MonitorUp, Video,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/contexts/UserContext";
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { kopiereText } from "@/lib/textKopieren";
import { Gespraech } from "@/components/videoraum/Gespraech";
import {
  ladeRaum, beobachteTeilnehmer, setzeTeilnehmerStatus, sendeEinlass, raumUrl,
  beendeTeilnehmerImRaum, setzeRaumStatus, speichereRaumNotiz, holeSignalGeheimnis,
  type Videoraum, type VideoraumTeilnehmer,
} from "@/lib/videoraumStore";
import { legeGespraechsnotizAb } from "@/lib/videoraumNotizAkte";
import { useVideoraum } from "@/contexts/VideoraumContext";
import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useGeraeteListe } from "@/hooks/useGeraeteListe";
import { kannLautsprecherWaehlen } from "@/lib/videocallGeraete";
import { ladeVideocallProfilSicher, speichereVideocallProfil } from "@/lib/videocallEinstellungen";
import { GeraeteSchnellzugriff, type HintergrundBildOption } from "@/components/videoraum/GeraeteSchnellzugriff";
import { listeHintergrundBilder, hintergrundBildUrl } from "@/lib/videocallHintergrundStore";

/**
 * Der Videoraum aus Sicht des Gastgebers: Warteliste, Einlass, Gespraech.
 *
 * Bis zu vier Teilnehmer gleichzeitig: der Gastgeber und drei Gaeste. Die
 * Verbindungen laufen als Netz, jeder haelt zu jedem eine eigene
 * Paarverbindung (siehe videoraumVerbindung). Der Einlass-Knopf sperrt ab dem
 * dritten Gast, und die Verbindungsschicht lehnt Ueberzaehlige zusaetzlich
 * selbst ab.
 */

/** Hoechstzahl an Gaesten neben dem Gastgeber, zusammen also vier Teilnehmer. */
const MAX_GAESTE = 3;

const VOLL_HINWEIS = "Der Raum ist voll. Es können höchstens vier Personen teilnehmen, du und drei Gäste.";

export default function VideoraumGastgeber() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const [raum, setRaum] = useState<Videoraum | null>(null);
  const [laden, setLaden] = useState(true);
  const [teilnehmer, setTeilnehmer] = useState<VideoraumTeilnehmer[]>([]);
  const [notiz, setNotiz] = useState("");
  const [notizStand, setNotizStand] = useState<"ruht" | "speichert" | "gesichert" | "fehler">("ruht");
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (notizStand === "speichert" || notizStand === "fehler") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [notizStand]);
  /*
   * Was der Gastgeber je Gast schaltet, siehe `RegieBefehl`. Verwaltet nach
   * der Kennung der Gegenstelle, denn stummschalten soll genau einen treffen,
   * nicht alle.
   *
   * `tonAn` ist eine Meldung des Gastes, keine Annahme: Er kann seine
   * Stummschaltung jederzeit selbst aufheben, und genau das soll hier zu sehen
   * sein. Das Bildschirmteilen ist bei jedem Gast anfangs zu und wird einzeln
   * freigegeben.
   */
  const [gastRegie, setGastRegie] = useState<Record<string, { tonAn: boolean; teilenErlaubt: boolean }>>({});
  const stummVerhaengt = useRef<Record<string, boolean>>({});

  // Das Gespraech selbst lebt oberhalb der Seite, damit es einen
  // Seitenwechsel ueberlebt. Diese Seite zeigt nur noch an, was dort liegt.
  const gespraech = useVideoraum();
  /*
   * Wer den Raum sehen darf, entscheidet derselbe Haken wie überall sonst im
   * Videocall-Bereich: Admin, Inhaber, die Rolle `hr` und die namentliche
   * Freigabeliste.
   *
   * Hier stand bis zum 11.09.2026 als einzige der acht Stellen eine eigene
   * Abfrage auf Admin und Inhaber. Folge: Die HR-Managerin durfte den
   * Buchungskalender pflegen, den Raum in der Übersicht sehen und bekam die
   * Warteraum-Meldung, stand aber genau dort, wo das Bewerbergespräch
   * stattfindet, vor "Noch nicht freigegeben". Und sie ist es, die laut
   * `bewerber_termin_gastgeber()` Gastgeberin jedes Bewerbergesprächs ist.
   *
   * Maßgeblich bleibt die Zeilensicherheit auf `videoraeume`: Sie gibt einem
   * hr-Konto nur die eigenen Räume heraus, ein fremder Kundenraum endet
   * deshalb bei "Raum nicht gefunden".
   */
  const { darf: darfSehen, laedt: freigabeLaedt } = useVideocallFreigabe();
  const laeuftHier = gespraech.aktiv?.raumId === id;

  // Geraetewahl und Hintergrund fuer das Einstellungs-Fenster im Gespraech.
  // Die Geraeteliste ist erst nach der Kamera-Freigabe brauchbar.
  const geraete = useGeraeteListe(laeuftHier && Boolean(gespraech.lokalerStream));
  const [hintergrundBilder, setHintergrundBilder] = useState<HintergrundBildOption[]>([]);
  useEffect(() => {
    if (!laeuftHier) return;
    let aktiv = true;
    void (async () => {
      const { bilder } = await listeHintergrundBilder();
      const mitUrl = await Promise.all(
        bilder.map(async (b) => ({ ...b, url: await hintergrundBildUrl(b.pfad) })),
      );
      if (aktiv) setHintergrundBilder(mitUrl);
    })();
    return () => { aktiv = false; };
  }, [laeuftHier]);

  /*
   * Womit der Gastgeber ins Gespraech startet.
   *
   * In den Videocall-Einstellungen stehen "Mit stummem Mikrofon beitreten"
   * und "Ohne Kamera beitreten". Beide wirken erst beim naechsten Gespraech,
   * und beim Betreten war davon nichts zu sehen. Christian am 18.09.2026:
   * Seine eigene Kachel trug ein Stummzeichen, und wir haben lange nach einem
   * Fehler gesucht, den es nicht gab. Deshalb steht es jetzt vor dem Betreten
   * da, aber nur dann, wenn wirklich etwas aus ist. Wer normal startet,
   * braucht keinen Hinweis.
   *
   * `null` heisst: noch nicht gelesen. Dann zeigen wir nichts, sonst blitzte
   * der Hinweis kurz auf oder fehlte kurz.
   */
  const [start, setStart] = useState<{ stumm: boolean; ohneKamera: boolean } | null>(null);
  useEffect(() => {
    if (freigabeLaedt || !darfSehen) return;
    let aktiv = true;
    void ladeVideocallProfilSicher().then((profil) => {
      if (aktiv) setStart({ stumm: profil.beitrittStumm, ohneKamera: profil.beitrittOhneKamera });
    });
    return () => { aktiv = false; };
  }, [freigabeLaedt, darfSehen]);

  /*
   * Direkt hier umstellen, ohne den Umweg ueber die Einstellungen. Die Anzeige
   * springt sofort um, damit der Klick sich nicht tot anfuehlt; scheitert das
   * Speichern, geht sie zurueck. Die Fehlermeldung kommt aus
   * `speichereVideocallProfil` selbst.
   */
  const starteMitMikrofon = useCallback(async () => {
    setStart((s) => (s ? { ...s, stumm: false } : s));
    const ok = await speichereVideocallProfil({ beitrittStumm: false });
    if (ok) toast.success("Du startest jetzt mit eingeschaltetem Mikrofon.");
    else setStart((s) => (s ? { ...s, stumm: true } : s));
  }, []);

  const starteMitKamera = useCallback(async () => {
    setStart((s) => (s ? { ...s, ohneKamera: false } : s));
    const ok = await speichereVideocallProfil({ beitrittOhneKamera: false });
    if (ok) toast.success("Du startest jetzt mit eingeschalteter Kamera.");
    else setStart((s) => (s ? { ...s, ohneKamera: true } : s));
  }, []);

  useEffect(() => {
    // Solange die Freigabe noch geholt wird, ist weder "darf" noch "darf
    // nicht" entschieden. Ein Raumaufruf zu frueh saehe aus wie ein
    // fehlendes Recht.
    if (freigabeLaedt) return;
    if (!darfSehen) { setLaden(false); return; }
    let aktiv = true;
    void (async () => {
      const daten = await ladeRaum(id);
      if (!aktiv) return;
      setRaum(daten);
      const entwurf = localStorage.getItem(`videocall-notiz:${daten?.id}`);
      setNotiz(entwurf ?? daten?.notiz ?? "");
      if (daten && entwurf !== null) {
        setNotizStand("speichert");
        void speichereRaumNotiz(daten.id, entwurf).then((ok) => {
          if (localStorage.getItem(`videocall-notiz:${daten.id}`) !== entwurf) return;
          setNotizStand(ok ? "gesichert" : "fehler");
          if (ok) localStorage.removeItem(`videocall-notiz:${daten.id}`);
        });
      }
      // Wer das Fenster schliesst statt aufzulegen, brachte seine Notiz nie
      // in die Akte. Beim naechsten Oeffnen wird sie nachgetragen, siehe
      // videoraumNotizAkte. Aendert nichts, wenn sie schon dort steht.
      if (daten) void legeGespraechsnotizAb(daten.id, entwurf ?? daten.notiz ?? "");
      setLaden(false);
    })();
    return () => { aktiv = false; };
  }, [id, darfSehen, freigabeLaedt]);

  useEffect(() => {
    if (!raum) return;
    return beobachteTeilnehmer(raum.id, setTeilnehmer);
  }, [raum]);

  /*
   * Die Regie: zuhoeren, was die Gaeste melden, und jedem seinen Stand
   * nachschicken.
   *
   * Der Signalkanal merkt sich nichts. Wer beim Senden noch nicht eingehaengt
   * war, bekommt die Nachricht nie. Jeder Gast meldet deshalb beim Einhaengen
   * seinen Tonstand, und das ist der Anlass, ihm seine Freigabe nachzuschicken.
   */
  const regieRef = useRef(gastRegie);
  regieRef.current = gastRegie;
  const gegenstellenRef = useRef(gespraech.gegenstellen);
  gegenstellenRef.current = gespraech.gegenstellen;

  const nameZuKennung = (kennung: string) =>
    gegenstellenRef.current.find((g) => g.kennung === kennung)?.name || "Der Gast";

  useEffect(() => {
    const v = gespraech.verbindung;
    if (!laeuftHier || !v?.beobachteRegie) return;
    return v.beobachteRegie((befehl, von) => {
      if (befehl.art !== "tonstand") return;
      setGastRegie((alt) => ({
        ...alt,
        [von]: { tonAn: befehl.an, teilenErlaubt: alt[von]?.teilenErlaubt ?? false },
      }));
      if (befehl.an && stummVerhaengt.current[von]) {
        stummVerhaengt.current[von] = false;
        toast.warning(`${nameZuKennung(von)} hat das Mikrofon wieder eingeschaltet.`);
      }
      // Gezielt an den Absender, nicht in die Runde: sonst schaltete diese
      // Antwort das Teilen bei allen Gaesten gleich.
      v.sendeRegie({ art: "teilen", erlaubt: regieRef.current[von]?.teilenErlaubt ?? false }, von);
    });
  }, [gespraech.verbindung, laeuftHier]);

  /*
   * Sobald eine Leitung steht, jedem Gast seinen Stand einmal nachschicken.
   *
   * Ein Gast kann sich einhaengen, bevor diese Seite ueberhaupt eine
   * Verbindung hat: eingelassen wird er zuerst, das Gespraech startet danach.
   * Seine erste Meldung ginge dann ins Leere, und er wuesste nichts von einer
   * schon erteilten Freigabe.
   */
  const zustand = gespraech.zustand;
  const anwesende = gespraech.gegenstellen.map((g) => g.kennung).join(",");
  useEffect(() => {
    if (!laeuftHier || zustand !== "verbunden") return;
    // regieRef traegt den aktuellen Stand, deshalb steht er nicht in der Liste.
    for (const kennung of anwesende.split(",").filter(Boolean)) {
      gespraech.verbindung?.sendeRegie(
        { art: "teilen", erlaubt: regieRef.current[kennung]?.teilenErlaubt ?? false },
        kennung,
      );
    }
  }, [laeuftHier, zustand, gespraech.verbindung, anwesende]);

  // Jedes Gespraech faengt bei null an: neue Gaeste, keine Freigaben.
  const startZeit = gespraech.aktiv?.startZeit;
  useEffect(() => {
    setGastRegie({});
    stummVerhaengt.current = {};
  }, [startZeit]);

  const schalteGastStumm = (kennung: string) => {
    if (!gespraech.verbindung) return;
    gespraech.verbindung.sendeRegie({ art: "stumm" }, kennung);
    stummVerhaengt.current[kennung] = true;
    setGastRegie((alt) => ({
      ...alt,
      [kennung]: { tonAn: false, teilenErlaubt: alt[kennung]?.teilenErlaubt ?? false },
    }));
  };

  const wechsleGastTeilen = (kennung: string) => {
    const neu = !(gastRegie[kennung]?.teilenErlaubt ?? false);
    setGastRegie((alt) => ({
      ...alt,
      [kennung]: { tonAn: alt[kennung]?.tonAn ?? true, teilenErlaubt: neu },
    }));
    gespraech.verbindung?.sendeRegie({ art: "teilen", erlaubt: neu }, kennung);
  };

  const wartende = teilnehmer.filter((t) => t.status === "wartet");
  const drin = teilnehmer.filter((t) => t.status === "eingelassen" || t.status === "im_gespraech");
  // Ab drei Gaesten ist der Raum voll: mit dem Gastgeber sind das vier.
  const voll = drin.length >= MAX_GAESTE;

  const betreteGespraech = useCallback(async (geheimnis?: string | null) => {
    if (!raum) return;
    if (gespraech.aktiv?.raumId === raum.id) { gespraech.oeffne(); return; }
    if (gespraech.aktiv) {
      toast.error("Es läuft bereits ein anderes Gespräch. Bitte zuerst auflegen.");
      return;
    }
    await gespraech.starte({
      raumId: raum.id,
      token: raum.token,
      // Ohne Geheimnis von aussen das aktuelle holen, sonst faengt der
      // Gastgeber auf einem anderen Kanal an als der Gast.
      signalGeheimnis: geheimnis ?? await holeSignalGeheimnis(raum.id),
      titel: raum.titel || (raum.art === "objektvorstellung" ? "Objektvorstellung" : "Beratungsgespräch"),
      gegenName: drin[0]?.name ?? wartende[0]?.name ?? "dem Gast",
      // Damit die Gaeste an der Kachel den Namen sehen, nicht "Teilnehmer".
      eigenerName: user.name || raum.gastgeber_snapshot?.name || "Gastgeber",
    });
  }, [raum, gespraech, drin, wartende, user.name]);

  const einlassen = async (t: VideoraumTeilnehmer) => {
    if (!raum) return;
    if (voll && !drin.some((d) => d.id === t.id)) {
      toast.error(VOLL_HINWEIS);
      return;
    }

    /*
     * Das Geheimnis des Signalkanals wird hier erneuert, bevor der Gast
     * eingelassen ist: Er erfaehrt es erst mit dem Einlassen, und wer davor
     * nur den Link hat, kennt es nicht. Laeuft in diesem Raum schon ein
     * Gespraech oder ist schon jemand eingelassen, bleibt es beim alten,
     * sonst rissen die stehenden Leitungen ab.
     */
    const laeuftSchon = gespraech.aktiv?.raumId === raum.id;
    const geheimnis = await holeSignalGeheimnis(raum.id, !laeuftSchon && drin.length === 0);

    // Die Datenbank kann den Einlass ablehnen, etwa wenn der Raum inzwischen
    // voll ist. Dann darf der Gast auch keinen Einlassruf bekommen.
    if (!await setzeTeilnehmerStatus(t.id, "eingelassen")) {
      toast.error("Der Gast konnte nicht eingelassen werden. Möglicherweise ist der Raum voll.");
      return;
    }
    sendeEinlass(raum.token, t.id, true);
    // Der erste Gast gibt der Leiste ihren Namen, weitere haengen dort als "+N".
    if (drin.length === 0) gespraech.setzeGegenName(t.name);
    await betreteGespraech(geheimnis);
  };

  const abweisen = async (t: VideoraumTeilnehmer) => {
    if (!raum) return;
    await setzeTeilnehmerStatus(t.id, "abgewiesen");
    sendeEinlass(raum.token, t.id, false);
  };

  // Die Teilnehmer schliesst `beende` selbst, damit es auch beim Auflegen aus
  // der Leiste heraus passiert. Der Raum geht dabei zurueck auf "offen".
  const auflegen = async () => {
    // Die Gespraechsnotiz geht in die Kundenakte, siehe videoraumNotizAkte.
    // Bewusst ohne Warten und ohne Fehlerbehandlung: Die Ablage wirft nie,
    // und das Auflegen ist wichtiger als der Eintrag.
    if (raum) void legeGespraechsnotizAb(raum.id, notiz, user?.name);
    await gespraech.beende();
  };

  /**
   * Endgueltig schliessen. Erst danach ist der Link tot, das Auflegen allein
   * reicht dafuer bewusst nicht.
   */
  const schliesseRaum = async () => {
    if (!raum) return;
    const bestaetigt = await confirmDialog({
      title: "Raum endgültig schließen?",
      description: "Der Kundenlink funktioniert danach nicht mehr. Ein bereits eingeladener Kunde kommt damit nicht mehr in den Raum.",
      confirmText: "Schließen",
      variant: "destructive",
    });
    if (!bestaetigt) return;
    if (gespraech.aktiv?.raumId === raum.id) await gespraech.beende();
    const ok = await setzeRaumStatus(raum.id, "beendet");
    // Hier gehen auch die Wartenden mit, der Raum ist zu.
    await beendeTeilnehmerImRaum(raum.id, true);
    if (!ok) { toast.error("Der Raum konnte nicht geschlossen werden."); return; }
    setRaum({ ...raum, status: "beendet" });
    toast.success("Raum geschlossen.");
  };

  /** Versehentlich geschlossen oder doch noch ein Nachtermin. */
  const oeffneRaum = async () => {
    if (!raum) return;
    if (!await setzeRaumStatus(raum.id, "offen")) {
      toast.error("Der Raum konnte nicht wieder geöffnet werden.");
      return;
    }
    setRaum({ ...raum, status: "offen" });
    toast.success("Raum wieder geöffnet, der alte Link gilt weiter.");
  };

  /**
   * Notiz sichern. Sie haengt am Raum, nicht an der Kundenakte: Ein Raum kann
   * ohne Kontakt bestehen, und die Akte bekommt ihren Eintrag ohnehin ueber
   * die Aktivitaet. Gespeichert wird kurz nach dem Tippen, damit niemand einen
   * Knopf suchen muss.
   */
  const notizRevision = useRef(0);
  const notizSpeicher = useRef<{ id: string; schreibe: ReturnType<typeof erstelleNotizSpeicher> } | null>(null);
  const aendereNotiz = (text: string) => {
    setNotiz(text);
    if (!raum) return;
    const id = raum.id;
    const revision = ++notizRevision.current;
    const schluessel = `videocall-notiz:${id}`;
    // Local recovery also covers closing the browser while a request is in flight.
    localStorage.setItem(schluessel, text);
    setNotizStand("speichert");
    if (notizSpeicher.current?.id !== id) notizSpeicher.current = {
      id, schreibe: erstelleNotizSpeicher((wert) => speichereRaumNotiz(id, wert.trim())),
    };
    void notizSpeicher.current.schreibe(text).then((ok) => {
      if (revision !== notizRevision.current) return;
      setNotizStand(ok ? "gesichert" : "fehler");
      if (ok) localStorage.removeItem(schluessel);
    });
  };


  const notizHinweis = notizStand === "speichert"
    ? "Wird gespeichert…"
    : notizStand === "gesichert"
      ? "Gespeichert."
      : notizStand === "fehler"
        ? "Die Notiz konnte nicht gespeichert werden."
        : "Wird automatisch am Raum gespeichert.";

  // Erst fragen, dann urteilen: Waehrend die Freigabe geholt wird, steht hier
  // dasselbe Warten wie beim Laden des Raums und nicht die Absage.
  if (freigabeLaedt) {
    return <div className="flex items-center justify-center p-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!darfSehen) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Noch nicht freigegeben</h2>
          <p className="mt-2 text-sm text-muted-foreground">Der eigene Videoraum wird gerade getestet und ist noch nicht für alle freigeschaltet.</p>
        </Card>
      </DashboardLayout>
    );
  }

  if (laden) {
    return <div className="flex items-center justify-center p-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!raum) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <h2 className="text-lg font-semibold">Raum nicht gefunden</h2>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/videocall")}>Zurück zur Übersicht</Button>
        </Card>
      </DashboardLayout>
    );
  }

  if (laeuftHier && !gespraech.minimiert) {
    const gegen = drin[0]?.name ?? gespraech.aktiv?.gegenName ?? "dem Gast";
    const verbundene = gespraech.gegenstellen;
    return (
      <Gespraech
        /*
          Im CRM bemisst sich der Raum an der Flaeche, die Kopfzeile und
          Seitenleiste uebrig lassen, nicht am ganzen Fenster. Sonst stuende er
          um die Hoehe der Kopfzeile zu tief, und die Bedienleiste mit dem
          Auflegen waere erst nach dem Scrollen zu sehen.
        */
        rahmen="flaeche"
        /*
          Nur fuer die Anordnung auf dem Telefon: Dort steht der Gastgeber
          oben, siehe `bestimmeBuehne`. Rechte haengen daran nichts.
        */
        istGastgeber
        lokalerStream={gespraech.lokalerStream}
        gegenstellen={verbundene}
        zustand={gespraech.zustand}
        gegenName={gegen}
        verbindung={gespraech.verbindung}
        aufBeenden={() => void auflegen()}
        aufMinimieren={gespraech.minimiere}
        tonAn={gespraech.tonAn}
        bildAn={gespraech.bildAn}
        wechsleTon={gespraech.wechsleTon}
        wechsleBild={gespraech.wechsleBild}
        startZeit={gespraech.aktiv?.startZeit}
        teilenBeschriftung="Das sieht dein Kunde gerade"
        /*
          Steht im Gespraech unter „Teilnehmer" zum Kopieren. Nur hier: Der
          Gast soll den Zugang zum Raum nicht weiterreichen koennen.
        */
        einladungsLink={raumUrl(raum.token)}
        /*
          Beim Teilen wandern die Kacheln in das schwebende Fenster auf dem
          Schreibtisch, wo der Browser es kann. Es muss im Klickpfad aufgehen,
          also vor der Bildschirmauswahl, siehe `schwebendesFenster`. Bricht
          der Gastgeber die Auswahl ab, geht es gleich wieder zu.
        */
        vorTeilen={async () => {
          const auf = await gespraech.oeffneSchwebend();
          return auf ? gespraech.schliesseSchwebend : undefined;
        }}
        spiegelEigenbild={gespraech.spiegeln}
        /*
          Laeuft ein Hintergrundbild, setzt die Spiegelung der eigenen Vorschau
          aus, sonst stuende die Schrift darin verkehrt. Die gesendete Spur
          bleibt in jedem Fall richtig herum.
        */
        hintergrundArt={gespraech.hintergrund.art}
        /*
          Waehrend des Teilens ruht die Leinwand des Video-Hintergrunds. Ohne
          diesen Rueckgriff auf die rohe Kamera saehe der Gastgeber sich selbst
          als Standbild.
        */
        eigeneVorschau={gespraech.roheKamera}
        lautsprecherId={gespraech.lautsprecherId}
        /*
          Dieselbe Regie wie in der Spalte, nur naeher dran: als
          Dreipunktmenue rechts oben in der Kachel des Gastes. Bei drei Gaesten
          musste man vorher unten Namen abgleichen, um den Richtigen
          stummzuschalten. Die Knoepfe in der Spalte bleiben, das Menue ist der
          zweite Weg zu denselben Funktionen.

          Die Gastseite reicht nichts dergleichen herein, dort gibt es also
          auch kein Menue. Massgeblich bleibt ohnehin, dass ein fremder Browser
          nur dem Gastgeber gehorcht, siehe `RegieBefehl`.
        */
        gastRegie={{
          stand: (kennung) => gastRegie[kennung] ?? { tonAn: true, teilenErlaubt: false },
          aufStumm: schalteGastStumm,
          aufTeilen: wechsleGastTeilen,
          gesperrt: !gespraech.verbindung,
        }}
        schnellEinstellungen={
          <GeraeteSchnellzugriff
            geraete={geraete}
            kameraId={gespraech.kameraId ?? undefined}
            mikrofonId={gespraech.mikrofonId ?? undefined}
            lautsprecherId={gespraech.lautsprecherId ?? undefined}
            aufKamera={(geraetId) => void gespraech.wechsleKamera(geraetId)}
            aufMikrofon={(geraetId) => void gespraech.wechsleMikrofon(geraetId)}
            aufLautsprecher={kannLautsprecherWaehlen() ? (geraetId) => gespraech.setzeLautsprecher(geraetId) : undefined}
            spiegeln={gespraech.spiegeln}
            aufSpiegeln={gespraech.setzeSpiegeln}
            hintergrund={gespraech.hintergrund}
            aufHintergrund={(wahl) => void gespraech.setzeHintergrund(wahl)}
            hintergrundBilder={hintergrundBilder}
            hintergrundLaedt={gespraech.hintergrundLaedt}
          />
        }
        titel={raum.titel || (raum.art === "objektvorstellung" ? "Objektvorstellung" : "Beratungsgespräch")}
        seitenSpalte={
          <div className="flex min-h-0 flex-1 flex-col">
            {/*
              Ueberschrift statt Reiter: Seit dem 18.09.2026 gibt es im
              Videoraum keine Mitschrift mehr, und ein Umschalter mit nur einem
              Ziel ist kein Umschalter.
            */}
            <div className="shrink-0 border-b border-white/[0.07] px-4 py-3.5 text-[12.5px] font-semibold text-white">
              Notizen
            </div>

            {/*
              Das Feld waechst und schrumpft mit der Spalte. Vorher stand hier
              `h-full min-h-[180px]` in einem Kasten ohne `min-h-0`: Damit war
              die Spalte immer mindestens 180 Pixel hoch, und in einem flachen
              Fenster schob sie den Rest unter den Rand. Abgeschnitten wurde,
              was unten stand, unter anderem die Warteliste.
            */}
            <div className="flex min-h-[168px] flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <textarea
                value={notiz}
                onChange={(e) => aendereNotiz(e.target.value)}
                placeholder="Was im Gespräch wichtig war…"
                className="min-h-[64px] w-full flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#30E19E]/50"
              />
              <p className="mt-2 shrink-0 text-[11px] text-white/35">{notizHinweis}</p>
            </div>
            </div>

            {/*
              Die Regie je Gast. Sie steht ausserhalb der Reiter, weil sie in
              beiden gebraucht wird.

              Stummschalten wirkt beim jeweiligen Gast, nicht hier am
              Lautsprecher, und trifft gezielt genau diesen einen. Alles andere
              waere Kosmetik: Der Gast glaubte weiter, er sei zu hoeren.
              Zwingen laesst sich ein fremder Browser aber nicht, deshalb steht
              hier auch, wenn er sein Mikrofon wieder einschaltet.
            */}
            {verbundene.length > 0 && (
              <div className="max-h-[34%] shrink-0 overflow-y-auto border-t border-white/[0.07] px-4 py-3">
                {verbundene.map((g) => {
                  const regie = gastRegie[g.kennung] ?? { tonAn: true, teilenErlaubt: false };
                  return (
                    <div key={g.kennung} className="py-1.5">
                      <p className="mb-1.5 truncate text-[11px] font-semibold uppercase tracking-wider text-white/40">
                        {g.name}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => schalteGastStumm(g.kennung)}
                          disabled={!regie.tonAn || !gespraech.verbindung}
                          className="flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors enabled:hover:bg-white/[0.12] disabled:opacity-40"
                        >
                          <MicOff className="h-3 w-3" />
                          {regie.tonAn ? "Stummschalten" : "Ist stumm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => wechsleGastTeilen(g.kennung)}
                          disabled={!gespraech.verbindung}
                          aria-pressed={regie.teilenErlaubt}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-40 ${
                            regie.teilenErlaubt
                              ? "bg-[#30E19E]/15 text-[#30E19E]"
                              : "bg-white/[0.07] text-white enabled:hover:bg-white/[0.12]"
                          }`}
                        >
                          <MonitorUp className="h-3 w-3" />
                          {regie.teilenErlaubt ? "Teilen freigegeben" : "Teilen freigeben"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
                  Stummschalten wirkt beim jeweiligen Gast, nicht nur hier. Er sieht einen Hinweis
                  und kann sein Mikrofon selbst wieder einschalten.
                </p>
              </div>
            )}

            {/* Die Warteliste steht immer unter den Notizen, sonst uebersieht
                man jemanden, waehrend man tippt. */}
            {wartende.length > 0 && (
              <div className="max-h-[38%] shrink overflow-y-auto border-t border-white/[0.07] p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  Im Warteraum
                </p>
                {wartende.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="truncate">{t.name}</span>
                    <button
                      type="button"
                      onClick={() => void einlassen(t)}
                      disabled={voll}
                      title={voll ? VOLL_HINWEIS : undefined}
                      className="shrink-0 rounded-lg bg-[#15724F] px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
                    >
                      Einlassen
                    </button>
                  </div>
                ))}
                {voll && (
                  <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                    {VOLL_HINWEIS} Erst wenn jemand das Gespräch verlässt, kann der Nächste herein.
                  </p>
                )}
              </div>
            )}
          </div>
        }
      />
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/videocall")}>
          <ArrowLeft className="h-4 w-4" /> Übersicht
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {raum.titel || (raum.art === "objektvorstellung" ? "Objektvorstellung" : "Beratungsgespräch")}
          </h1>
          <div aria-hidden className="mt-1.5 h-[3px] w-9 rounded-full bg-primary" />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          /*
            Ueber `kopiereText`, nicht direkt ueber die Zwischenablage.
            Christian am 18.09.2026: Ein Klick hier hat ihm den Browser haengen
            lassen. Der Grund steht in `textKopieren`: In einem eingebetteten
            Rahmen, also auch in der Lovable-Vorschau, kann das Versprechen
            offen bleiben, dann meldet weder der Erfolg noch der Fehler etwas,
            und auf dem Bildschirm geschieht gar nichts. Klappt es nicht, steht
            der Link jetzt im Hinweis zum Markieren.
          */
          onClick={() => {
            const link = raumUrl(raum.token);
            void kopiereText(link).then((ergebnis) => {
              if (ergebnis === "kopiert") { toast.success("Link kopiert."); return; }
              void hinweisDialog({
                title: "Kopieren hat nicht geklappt",
                description: (
                  <div className="space-y-2">
                    <p>Dein Browser hat das Kopieren nicht zugelassen. Markiere den Link und kopiere ihn von Hand.</p>
                    <input
                      readOnly
                      value={link}
                      aria-label="Kundenlink zum Markieren"
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full rounded-md border bg-muted/40 px-2 py-1.5 text-xs"
                    />
                  </div>
                ),
              });
            });
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Kundenlink
        </Button>
        {raum.status === "beendet" ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void oeffneRaum()}>
            <RotateCcw className="h-3.5 w-3.5" /> Raum wieder öffnen
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void schliesseRaum()}>
            <DoorClosed className="h-3.5 w-3.5" /> Raum schließen
          </Button>
        )}
        <Button className="gap-1.5" onClick={() => void betreteGespraech()}>
          {laeuftHier ? <><Minimize2 className="h-4 w-4" /> Zurück ins Gespräch</> : <><DoorOpen className="h-4 w-4" /> Raum betreten</>}
        </Button>
      </div>

      {/*
        Womit du startest. Steht bewusst direkt unter „Raum betreten" und nur
        dann da, wenn Mikrofon oder Kamera ab Werk aus sind. Läuft das Gespräch
        schon hier, ist nichts mehr zu starten, dann bleibt die Zeile weg.
      */}
      {!laeuftHier && start && (start.stumm || start.ohneKamera) && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3.5 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
          {/*
            Auf dem Telefon steht der Satz über den Knöpfen. Nebeneinander
            bliebe für ihn eine Spalte von zwei Wörtern Breite übrig, weil die
            Knöpfe ihre Beschriftung nicht umbrechen.
          */}
          <p className="min-w-0 sm:flex-1">
            <span className="font-medium text-foreground">
              {start.stumm && start.ohneKamera
                ? "Du startest ohne Mikrofon und ohne Kamera."
                : start.stumm
                  ? "Du startest ohne Mikrofon."
                  : "Du startest ohne Kamera."}
            </span>{" "}
            So steht es in deinen Videocall-Einstellungen. Im Gespräch kannst du es jederzeit
            anschalten.
          </p>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            {start.stumm && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => void starteMitMikrofon()}>
                <Mic className="h-3.5 w-3.5" /> Mit Mikrofon starten
              </Button>
            )}
            {start.ohneKamera && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => void starteMitKamera()}>
                <Video className="h-3.5 w-3.5" /> Mit Kamera starten
              </Button>
            )}
          </div>
        </div>
      )}

      {raum.status === "beendet" && (
        <Card className="border-muted-foreground/20 bg-muted/40 p-4 text-sm text-muted-foreground">
          Dieser Raum ist geschlossen. Der Kundenlink führt nicht mehr hinein. Über „Raum wieder
          öffnen" gilt derselbe Link erneut.
        </Card>
      )}

      {gespraech.medienFehler && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{gespraech.medienFehler}</Card>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Warteraum</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Wer den Link öffnet und seinen Namen einträgt, erscheint hier. Erst mit dem Einlassen
          bekommt er den Zugang zur Videoverbindung.
        </p>
        {voll && wartende.length > 0 && (
          <p className="mt-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-2.5 text-xs text-muted-foreground">
            {VOLL_HINWEIS} Erst wenn jemand das Gespräch verlässt, kann der Nächste eingelassen
            werden. Er sieht im Warteraum, dass er an der Reihe ist.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {wartende.length === 0 && drin.length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Noch niemand da.
            </p>
          )}

          {wartende.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  wartet seit {new Date(t.beigetreten_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={voll}
                title={voll ? VOLL_HINWEIS : undefined}
                onClick={() => void einlassen(t)}
              >
                <UserCheck className="h-3.5 w-3.5" /> Einlassen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void abweisen(t)} aria-label="Abweisen">
                <UserX className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}

          {drin.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</p>
              <span className="text-xs text-muted-foreground">eingelassen</span>
              {/*
                Notausgang: Hat der Gast einfach das Fenster geschlossen, steht
                er hier weiter als eingelassen und blockiert den naechsten
                Wartenden. Damit laesst er sich aus der Liste nehmen.
              */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void setzeTeilnehmerStatus(t.id, "beendet")}
                aria-label={`${t.name} aus dem Gespräch nehmen`}
              >
                <UserX className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Notizen</h2>
        <Textarea
          value={notiz}
          onChange={(e) => aendereNotiz(e.target.value)}
          rows={4}
          placeholder="Vorbereitung, offene Punkte…"
          className="mt-3"
        />
        <p className="mt-2 text-xs text-muted-foreground">{notizHinweis}</p>
      </Card>
      </div>
    </DashboardLayout>
  );
}
