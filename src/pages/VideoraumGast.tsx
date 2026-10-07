import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  User, Calendar, Lock, Mic, MicOff, Video as VideoIcon, VideoOff, ArrowRight, Loader2,
} from "lucide-react";
import { Buehne, Balken, Kennung, FLAECHE_FELD, FLAECHE_KASTEN } from "@/components/videoraum/Buehne";
import { Gespraech } from "@/components/videoraum/Gespraech";
import { useSeitentitel, oeffentlicherTitel } from "@/lib/seitentitel";
import { supabase } from "@/integrations/supabase/client";
import { Warteraum, EigenesBild, Schalter, type MedienSteuerung } from "@/components/videoraum/Warteraum";
import {
  ladeGastAnsicht, betreteRaumAlsGast, frageGastStatus, meldeGast, beobachteEinlass,
  beobachteMitschriftHinweis, frageMitschriftStand,
  GASTGEBER_UNBEKANNT, gastFehlerText, warteHinweisText,
  ladeGastSitzung, merkeGastSitzung, vergissGastSitzung,
  type VideoraumGastAnsicht, type GastgeberSnapshot,
} from "@/lib/videoraumStore";
import {
  starteVerbindung, holeMedien, setzeSpurZustand, istGastgeberKennung,
  type Gegenstelle, type Verbindung, type VerbindungsZustand,
} from "@/lib/videoraumVerbindung";
import { gastTexte, istPlatzhalterName, mitWerten } from "@/lib/videoraumAnrede";
import { medienMeldung, videoraumGastTexte } from "@/lib/videoraumGastTexte";
import { useLinkSprache, type Sprache } from "@/lib/seitenSprache";
import { SPRACH_LOCALE } from "@/lib/sprachFormat";
import { nurEchteBezeichnung } from "@/lib/berufsbezeichnung";
import { erstelleHintergrundRegie, ladeSegmentierungVor, type HintergrundRegie } from "@/lib/videocallHintergrund";
import type { HintergrundWahl } from "@/lib/videocallEinstellungen";
import { kannLautsprecherWaehlen, wechsleEingabeGeraet, holeEinzelSpur } from "@/lib/videocallGeraete";
import { useGeraeteListe } from "@/hooks/useGeraeteListe";
import { GeraeteSchnellzugriff } from "@/components/videoraum/GeraeteSchnellzugriff";

/**
 * Der Videoraum aus Sicht des Kunden. Kein Konto, kein Programm, nur ein Link.
 *
 * Drei Zustaende hintereinander: Namenseingabe, Warteraum, Gespraech. Der
 * Warteraum sieht je nach Anlass anders aus, eine Beratung braucht die Agenda,
 * eine Objektvorstellung das Objekt.
 *
 * Wer neu laedt, kehrt dorthin zurueck, wo er war: Die Sitzung liegt im
 * `sessionStorage` am Raumtoken. Vorher war ein Neuladen ein neuer Mensch, der
 * Gastgeber sah denselben Kunden zweimal und der alte Eintrag blieb fuer immer
 * auf "wartet" stehen.
 */

type Phase = "laden" | "fehlt" | "name" | "warteraum" | "gespraech" | "raus";

/**
 * Termin des Raums, etwa „Heute, 14:30 Uhr“ oder englisch „25 September,
 * 14:30“. Wie bisher in der Ortszeit des Browsers; nur Wortlaut und
 * Schreibweise folgen der Sprache (Englisch `en-GB`, siehe `sprachFormat`).
 */
function uhrzeit(iso: string | null, sprache: Sprache): string {
  if (!iso) return "";
  const t = videoraumGastTexte(sprache).seite;
  const locale = SPRACH_LOCALE[sprache];
  const d = new Date(iso);
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  const zeit = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (gleicherTag) return mitWerten(t.heute, { zeit });
  const datum = d.toLocaleDateString(locale, { day: sprache === "en" ? "numeric" : "2-digit", month: "long" });
  return mitWerten(t.datumZeit, { datum, zeit });
}

export default function VideoraumGast() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  /*
   * Die Sprache des Gastes (Kundensprache, Etappe 3): aus dem Kundenprofil
   * hinter dem Raum, `?lang=` in der Adresse ueberschreibt nur die Anzeige.
   * Ohne Kontakt am Raum oder ohne die Migration bleibt es Deutsch. Die
   * Ladeanzeige wartet auf beides, damit nichts sichtbar umspringt.
   */
  const { sprache, bereit: spracheBereit } = useLinkSprache("videoraum", token);
  const seite = videoraumGastTexte(sprache).seite;
  // Fuer die Rueckrufe, die sich einmal einhaengen, siehe `texteRef` unten.
  const spracheRef = useRef(sprache);
  spracheRef.current = sprache;
  const [phase, setPhase] = useState<Phase>("laden");
  const [ansicht, setAnsicht] = useState<VideoraumGastAnsicht | null>(null);
  const [name, setName] = useState("");
  const [medienFehler, setMedienFehler] = useState<string | null>(null);
  const [lokalerStream, setLokalerStream] = useState<MediaStream | null>(null);
  const [gegenstellen, setGegenstellen] = useState<Gegenstelle[]>([]);
  const [zustand, setZustand] = useState<VerbindungsZustand>("bereit");
  const [betreteGerade, setBetreteGerade] = useState(false);
  const [tonAn, setTonAn] = useState(true);
  const [bildAn, setBildAn] = useState(true);
  /*
   * Geraete und Hintergrund gelten nur fuer diese Sitzung: Der Gast hat kein
   * Konto, es gibt nichts, woran man eine Einstellung dauerhaft haengen
   * koennte. Vorgaben: Standardgeraete, gespiegelte Vorschau, kein
   * Hintergrund.
   */
  const [spiegeln, setSpiegeln] = useState(true);
  const [kameraId, setKameraId] = useState<string | undefined>(undefined);
  const [mikrofonId, setMikrofonId] = useState<string | undefined>(undefined);
  const [lautsprecherId, setLautsprecherId] = useState<string | undefined>(undefined);
  const [hintergrund, setHintergrund] = useState<HintergrundWahl>({ art: "aus" });
  const [hintergrundLaedt, setHintergrundLaedt] = useState(false);
  const [rausGrund, setRausGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  /*
   * Leer, bis der Server das erste Mal geantwortet hat. Vorher kennt die Seite
   * die Raumart noch nicht, und der Warteraum setzt so lange seinen eigenen
   * Satz ein, und zwar in der Anrede, die zum Anlass passt.
   */
  const [warteHinweis, setWarteHinweis] = useState("");
  const [mitschriftLaeuft, setMitschriftLaeuft] = useState(false);
  /*
   * Was der Gastgeber von hier aus steuert, siehe `RegieBefehl`.
   *
   * `vomGastgeberStumm` ist kein Riegel, sondern ein Hinweis: Ein fremder
   * Browser laesst sich nicht zwingen. Der Gast kann sein Mikrofon jederzeit
   * wieder einschalten, aber er sieht, dass er stummgeschaltet wurde, und der
   * Gastgeber bekommt das Wiedereinschalten gemeldet.
   */
  const [vomGastgeberStumm, setVomGastgeberStumm] = useState(false);
  const [teilenErlaubt, setTeilenErlaubt] = useState(false);
  // Fuer den Teilen-Waechter unten: Der haengt sich einmal ein und saehe
  // sonst den Freigabestand von damals.
  const teilenErlaubtRef = useRef(false);

  // Der Kunde hat waehrend des Gespraechs oft mehrere Tabs offen. "OS Immobilien
  // CRM" waere hier ausserdem der Name eines internen Werkzeugs.
  useSeitentitel(oeffentlicherTitel(seite.seitentitel));

  const gastToken = useRef<string | null>(null);
  const teilnehmerId = useRef<string | null>(null);
  // Fuer die Tastaturbehandlung auf dem Telefon, siehe weiter unten.
  const namensfeldRef = useRef<HTMLInputElement | null>(null);
  const beitretenRef = useRef<HTMLButtonElement | null>(null);
  const verbindung = useRef<Verbindung | null>(null);
  // Die Hintergrund-Regie (MediaPipe), entsteht mit dem Kamerastream.
  const hintergrundRef = useRef<HintergrundRegie | null>(null);
  const startet = useRef(false);
  // Der Aufraeumer laeuft erst beim Aushaengen und saehe sonst den Stand von
  // damals, also null. Die Kamera bliebe an.
  const streamRef = useRef<MediaStream | null>(null);
  // Der Regie-Melder haengt sich einmal ein und saehe sonst den Tonstand von
  // damals. Ueber den Zeiger bleibt er auf dem Laufenden.
  const tonAnRef = useRef(true);

  // Am Raum kann ein unvollstaendiger Abzug haengen, etwa wenn beim Buchen
  // kein Profil zu finden war. Ohne Namen zerlegte der Warteraum vorher
  // `undefined` und die Seite blieb beim Kunden weiss.
  //
  // Englisch wird auch ein gespeicherter Platzhalter („Dein Ansprechpartner“)
  // zu „Your contact“. Ein echter Name bleibt, wie er gepflegt ist.
  const gastgeber = useMemo<GastgeberSnapshot>(() => {
    const roh: Partial<GastgeberSnapshot> = ansicht?.gastgeber ?? {};
    const name = roh.name?.trim() || GASTGEBER_UNBEKANNT;
    if (sprache === "en" && istPlatzhalterName(name)) {
      return { ...roh, name: gastTexte(ansicht?.art, "en").ansprechpartnerPlatzhalter };
    }
    return { ...roh, name };
  }, [ansicht, sprache]);
  // Der Abzug aelterer Raeume traegt hier noch die technische Rolle, etwa
  // "Admin". Der Gast soll eine Berufsbezeichnung lesen oder gar nichts.
  const gastgeberBezeichnung = nurEchteBezeichnung(gastgeber.position);
  // Kamera und Mikrofon sind geklaert: entweder steht der Stream, oder es ist
  // klar, dass keiner zustande kommt.
  const medienBereit = Boolean(lokalerStream) || Boolean(medienFehler);
  const istObjekt = ansicht?.art === "objektvorstellung";
  const objekt = useMemo(() => (ansicht?.objekt ?? {}) as Record<string, unknown>, [ansicht]);

  /*
   * Die Anrede haengt am Anlass: Im Bewerbergespraech wird geduzt, beim Kunden
   * gesiezt. Der Wortlaut steht in `videoraumAnrede`, hier wird nur ausgewaehlt.
   *
   * Der Zeiger daneben ist fuer die Rueckrufe, die sich einmal einhaengen. Ohne
   * ihn saehen sie die Texte von damals, also die Sie-Fassung von vor dem Laden
   * des Raums, und der Bewerber bekaeme beim Auflegen wieder ein Sie.
   */
  const texte = useMemo(() => gastTexte(ansicht?.art, sprache), [ansicht?.art, sprache]);
  const texteRef = useRef(texte);
  texteRef.current = texte;
  // Dasselbe fuer die Raumart selbst: Der Warteraum-Takt haengt sich einmal
  // ein und saehe sonst die Art von vor dem Laden des Raums.
  const artRef = useRef(ansicht?.art);
  artRef.current = ansicht?.art;

  /**
   * Eckdaten der Berechnung und die naechsten Schritte kommen aus dem Raum,
   * wenn der Partner sie gepflegt hat. Sonst greifen die Standardschritte, die
   * bei jeder Objektvorstellung gleich sind. Lieber eine ehrliche Vorschau als
   * eine leere Kachel.
   */
  const berechnung = useMemo(() => {
    const roh = (objekt.berechnung ?? []) as unknown;
    if (!Array.isArray(roh)) return [];
    return roh
      .map((p) => p as { label?: unknown; wert?: unknown })
      .filter((p) => p?.label && p?.wert)
      .map((p) => ({ label: String(p.label), wert: String(p.wert) }));
  }, [objekt]);

  const naechsteSchritte = useMemo(() => {
    const roh = (objekt.naechsteSchritte ?? []) as unknown;
    if (Array.isArray(roh) && roh.length > 0) return roh.map((s) => String(s));
    return videoraumGastTexte(sprache).seite.naechsteSchritte;
  }, [objekt, sprache]);

  /*
   * Der Gastgeber gehoert nicht in seinen eigenen Warteraum.
   *
   * In der Meldung an den Gastgeber und im Termineintrag der Kundenakte steht
   * der Kundenlink, nicht die Gastgeberadresse. Wer daraufklickte, landete als
   * Gast im eigenen Raum und wartete auf sich selbst.
   *
   * Die Pruefung macht die Datenbank: Die Lesepolicy auf `videoraeume` laesst
   * nur den Gastgeber und Administratoren an einen Raum. Kommt eine Zeile
   * zurueck, ist der Angemeldete berechtigt, und wir schicken ihn dorthin, wo
   * er hingehoert. Ein Kunde ohne Konto bekommt hier nichts und merkt von der
   * Pruefung nichts.
   *
   * Repariert damit auch alle Links, die schon verschickt sind.
   */
  useEffect(() => {
    if (!token) return;
    let aktiv = true;
    void (async () => {
      try {
        const { data: sitzung } = await supabase.auth.getUser();
        const eigeneKennung = sitzung?.user?.id;
        if (!eigeneKennung) return; // Kunde ohne Konto, der Normalfall

        const { data, error } = await supabase
          .from("videoraeume" as never)
          .select("id, gastgeber_id")
          .eq("token", token)
          .maybeSingle();

        // Ein Netzfehler ist etwas anderes als "nicht berechtigt". Ohne diese
        // Unterscheidung landete der Gastgeber bei einer gestoerten Leitung
        // wieder im eigenen Warteraum, also in genau dem Fehler, den die
        // Weiterleitung beheben soll.
        if (error) { console.warn("Gastgeberpruefung fehlgeschlagen:", error); return; }

        const raum = data as { id?: string; gastgeber_id?: string } | null;
        // Nur der Gastgeber selbst. Ein Administrator darf jeden Raum lesen,
        // gehoert aber nicht ungefragt in ein fremdes Kundengespraech: Er
        // koennte dort Gaeste einlassen und Notizen sehen, waehrend ein
        // Kollege gerade spricht, und kaeme selbst nicht mehr an die
        // Kundenansicht, um den verschickten Link zu pruefen.
        if (aktiv && raum?.id && raum.gastgeber_id === eigeneKennung) {
          navigate(`/videocall/raum/${raum.id}`, { replace: true });
        }
      } catch (fehler) {
        console.warn("Gastgeberpruefung fehlgeschlagen:", fehler);
      }
    })();
    return () => { aktiv = false; };
  }, [token, navigate]);

  // Raumdaten holen und, wenn hier schon jemand war, die Sitzung fortsetzen
  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const daten = await ladeGastAnsicht(token);
      if (!aktiv) return;
      if (!daten) { setPhase("fehlt"); return; }
      setAnsicht(daten);

      const sitzung = ladeGastSitzung(token);
      if (sitzung) {
        const stand = await frageGastStatus(sitzung.gastToken);
        if (!aktiv) return;
        const laeuftNoch = stand && stand !== "weg"
          && stand.raumStatus !== "beendet"
          && ["wartet", "eingelassen", "im_gespraech"].includes(stand.status);
        if (laeuftNoch) {
          gastToken.current = sitzung.gastToken;
          teilnehmerId.current = sitzung.teilnehmerId;
          setName(sitzung.name);
          // Zurueck in den Warteraum. War der Gast schon eingelassen, holt ihn
          // die Statusabfrage dort gleich wieder ins Gespraech.
          setPhase("warteraum");
          return;
        }
        vergissGastSitzung(token);
      }
      setPhase("name");
    })();
    return () => { aktiv = false; };
  }, [token]);

  /*
   * Den Video-Hintergrund vorladen, sobald der Gast die Seite vor sich hat.
   *
   * Auf der Namensseite steht der Schalter „Hintergrund weichzeichnen", im
   * Warteraum noch einmal in der Technikkarte. Genau dort beginnt auch die
   * Wartezeit: Der Gast tippt seinen Namen ein und wartet dann oft eine
   * Minute, bis er eingelassen wird. Das ist die Zeit, die das Modell
   * braucht. Wer nie auf diese Seiten kommt, also bei einem toten Link, laedt
   * weiterhin nichts.
   */
  useEffect(() => {
    if (phase !== "name" && phase !== "warteraum") return;
    void ladeSegmentierungVor().catch(() => { /* faellt beim Klick erneut an */ });
  }, [phase]);

  // Kamera und Mikrofon einmal anfordern, gleich fuer die Vorschau. Auch im
  // Warteraum, weil ein Neuladen mitten im Warten dort wieder anfaengt.
  useEffect(() => {
    if ((phase !== "name" && phase !== "warteraum") || lokalerStream) return;
    let aktiv = true;
    void (async () => {
      const ergebnis = await holeMedien();
      if (!aktiv) return;
      if (ergebnis.stream) {
        streamRef.current = ergebnis.stream;
        setLokalerStream(ergebnis.stream);
        hintergrundRef.current = erstelleHintergrundRegie({
          stream: ergebnis.stream,
          ersetzeSenderSpur: (spur) => verbindung.current?.ersetzeSpur?.("video", spur),
          aufFehler: (meldung) => {
            setHintergrund({ art: "aus" });
            toast.error(medienMeldung(meldung, spracheRef.current));
          },
        });
      } else {
        setMedienFehler(ergebnis.grund);
      }
    })();
    return () => { aktiv = false; };
  }, [phase, lokalerStream]);

  /*
   * Der Hinweis auf die Mitschrift.
   *
   * Der Gastgeber kann waehrend des Gespraechs eine Mitschrift starten. Dass
   * das passiert, muss auch hier zu sehen sein, sonst waere es eine heimliche
   * Aufzeichnung. Beim Betreten wird einmal nachgefragt, damit der Hinweis
   * auch dann steht, wenn die Mitschrift schon vorher lief.
   */
  useEffect(() => {
    if (phase !== "gespraech" || !token) return;
    const abbestellen = beobachteMitschriftHinweis(token, setMitschriftLaeuft);
    frageMitschriftStand(token);
    return () => { abbestellen(); setMitschriftLaeuft(false); };
  }, [phase, token]);

  /*
   * Was der Gastgeber von seiner Seite aus schaltet.
   *
   * Stummschalten passiert hier, an der eigenen Tonspur, nicht drueben am
   * Lautsprecher. Alles andere waere Kosmetik: Der Gast glaubte weiter, er sei
   * zu hoeren, waehrend niemand ihn hoert.
   *
   * Der Kanal traegt keinen Anfangsstand mit sich, wer zu spaet kommt,
   * bekommt nichts. Deshalb meldet der Gast beim Einhaengen seinen Tonstand,
   * und der Gastgeber schickt daraufhin seine Freigaben nach.
   */
  useEffect(() => {
    if (phase !== "gespraech") return;
    const v = verbindung.current;
    if (!v?.beobachteRegie) return;

    const abbestellen = v.beobachteRegie((befehl, von) => {
      // Stummschalten und Teilen-Freigabe darf nur der Gastgeber. Andere
      // Gaeste haengen im selben Kanal, ihre Rufe zaehlen hier nicht.
      if (!istGastgeberKennung(von)) return;
      if (befehl.art === "stumm") {
        tonAnRef.current = false;
        setTonAn(false);
        setzeSpurZustand(streamRef.current, "audio", false);
        v.setzeSpur("audio", false);
        setVomGastgeberStumm(true);
        v.sendeRegie({ art: "tonstand", an: false });
        return;
      }
      if (befehl.art === "teilen") {
        teilenErlaubtRef.current = befehl.erlaubt;
        setTeilenErlaubt(befehl.erlaubt);
        // Nimmt der Gastgeber die Freigabe zurueck, endet ein laufendes Teilen
        // sofort. Sonst bliebe der Bildschirm sichtbar, obwohl er es abgestellt hat.
        if (!befehl.erlaubt) void v.teileBildschirm(false);
      }
    });

    /*
     * Der Waechter fuer das Rennen um die Bildschirmauswahl: Entzieht der
     * Gastgeber die Freigabe, waehrend beim Gast die Auswahl des Browsers
     * noch offen steht, laeuft `teileBildschirm(false)` oben ins Leere, denn
     * die Bildschirmspur gibt es noch gar nicht. Bestaetigt der Gast danach,
     * ginge sein Bildschirm trotz entzogener Freigabe hinaus. Deshalb wird
     * jedes beginnende Teilen hier gegen den aktuellen Freigabestand
     * geprueft und notfalls sofort wieder beendet.
     */
    const abbestellenTeilen = v.beobachteTeilen((an) => {
      if (an && !teilenErlaubtRef.current) void v.teileBildschirm(false);
      /*
       * Der Video-Hintergrund laeuft waehrend des Teilens weiter. Frueher ruhte
       * er, weil damals statt des Gesichts der Bildschirm hinausging. Seit
       * beide gleichzeitig hinausgehen, ist die Leinwand das Gesicht in der
       * Kachel des Gegenuebers und muss weiterrechnen.
       */
    });

    v.sendeRegie({ art: "tonstand", an: tonAnRef.current });
    return () => { abbestellen(); abbestellenTeilen(); };
  }, [phase]);

  /** Gespraech beenden und die Abschiedsseite zeigen. */
  const beendeGespraech = useCallback((grund: string, abmelden = true) => {
    // Erst die Hintergrund-Regie: sie legt die rohe Kameraspur zurueck in
    // den Stream, damit das Stoppen darunter die Kameraleuchte mitnimmt.
    hintergrundRef.current?.beenden();
    hintergrundRef.current = null;
    verbindung.current?.beenden();
    verbindung.current = null;
    if (abmelden && gastToken.current) void meldeGast(gastToken.current, "beendet");
    // Das Gespraech ist vorbei, ein Neuladen soll nicht dorthin zurueckfuehren.
    vergissGastSitzung(token);
    streamRef.current?.getTracks().forEach((s) => s.stop());
    streamRef.current = null;
    setLokalerStream(null);
    setRausGrund(grund);
    setPhase("raus");
  }, [token]);

  const starteGespraech = useCallback(async (signalGeheimnis: string | null) => {
    // Der Riegel muss vor dem ersten `await` fallen. Sonst starten der
    // Einlassruf und die Statusabfrage vier Sekunden spaeter zwei Verbindungen
    // nebeneinander, und beide reden auf demselben Kanal durcheinander.
    if (verbindung.current || startet.current) return;
    startet.current = true;
    try {
      const v = await starteVerbindung({
        token,
        // Kommt aus der Statusabfrage und nur, wenn der Gastgeber eingelassen
        // hat. Ohne die Migration `20260804190000` ist es null, dann bleibt es
        // beim Raumtoken als Kanalnamen.
        signalGeheimnis,
        istGastgeber: false,
        // Damit die anderen an der Kachel den Namen sehen.
        eigenerName: name.trim() || "Gast",
        // Ohne Kamera und Mikrofon geht das Gespraech trotzdem los: der Gast
        // sieht und hoert den Gastgeber, nur umgekehrt nicht. Das ist besser
        // als ein Warteraum, aus dem er nie herauskommt.
        lokalerStream: lokalerStream ?? new MediaStream(),
        aufGegenstellen: setGegenstellen,
        aufZustand: setZustand,
        // Der Gastgeber hat aufgelegt: dann ist das Gespraech vorbei, auch
        // wenn andere Gaeste noch da sind. Verlaesst nur ein anderer Gast den
        // Raum, geht es weiter, seine Kachel verschwindet von selbst.
        aufGegenstelleWeg: (kennung) => {
          if (istGastgeberKennung(kennung)) {
            beendeGespraech(texteRef.current.dankeAmEnde);
          }
        },
      });
      verbindung.current = v;
      setPhase("gespraech");
      if (gastToken.current) void meldeGast(gastToken.current, "im_gespraech");
    } catch (f) {
      console.error("Verbindung konnte nicht aufgebaut werden:", f);
      setFehler(videoraumGastTexte(spracheRef.current).seite.verbindungFehler);
    } finally {
      startet.current = false;
    }
  }, [lokalerStream, token, name, beendeGespraech]);

  /*
   * Im Warteraum auf den Einlass warten.
   *
   * Entschieden wird allein nach der Antwort der Datenbank, nicht nach dem
   * Broadcast-Ruf: Der Warte-Kanal haengt am Raumtoken, den jeder mit dem Link
   * kennt, ein gefaelschter Ruf koennte sonst jemanden hereinwinken. Der Ruf
   * loest deshalb nur eine sofortige Nachfrage aus, sonst dauerte es bis zu
   * vier Sekunden. Und nur diese Nachfrage bringt das Geheimnis des
   * Signalkanals mit, ohne das keine Verbindung zustande kommt.
   */
  useEffect(() => {
    if (phase !== "warteraum" || !gastToken.current || !teilnehmerId.current) return;

    let aktiv = true;

    const raus = (grund: string) => {
      vergissGastSitzung(token);
      setRausGrund(grund);
      setPhase("raus");
    };

    const frageNach = async () => {
      const stand = await frageGastStatus(gastToken.current!);
      if (!aktiv || !stand) return;
      // Den Teilnehmer gibt es nicht mehr, der Gastgeber hat den Raum
      // geloescht. Ohne diesen Zweig wartet der Gast bis zum Sankt-
      // Nimmerleins-Tag vor einem Ladekringel.
      if (stand === "weg") {
        raus(texteRef.current.raumGeschlossen);
        return;
      }
      if (stand.raumStatus === "beendet" || stand.status === "beendet") {
        raus(videoraumGastTexte(spracheRef.current).seite.beendetGrund);
        return;
      }
      if (stand.status === "abgewiesen") {
        raus(texteRef.current.nichtEingelassen);
        return;
      }
      if (stand.status === "eingelassen" || stand.status === "im_gespraech") {
        // Erst losgehen, wenn Kamera und Mikrofon geklaert sind. Nach einem
        // Neuladen faengt der Warteraum wieder von vorne an und der Gast waere
        // sonst ohne Bild und Ton im Gespraech. Sobald der Stream steht oder
        // feststeht, dass es keinen gibt, laeuft dieser Effekt erneut.
        if (!medienBereit) return;
        void starteGespraech(stand.signalGeheimnis);
        return;
      }
      setWarteHinweis(warteHinweisText(stand.warteposition, stand.gespraechLaeuft, artRef.current, spracheRef.current));
    };

    void frageNach();
    const abbestellen = beobachteEinlass(token, teilnehmerId.current, () => { void frageNach(); });
    const takt = window.setInterval(() => { void frageNach(); }, 4000);

    return () => { aktiv = false; abbestellen(); window.clearInterval(takt); };
  }, [phase, token, starteGespraech, medienBereit]);

  // Aufräumen beim Verlassen der Seite
  useEffect(() => {
    return () => {
      hintergrundRef.current?.beenden();
      hintergrundRef.current = null;
      verbindung.current?.beenden();
      streamRef.current?.getTracks().forEach((s) => s.stop());
      streamRef.current = null;
    };
    // Absichtlich nur beim Aushängen, nicht bei jedem Streamwechsel.
  }, []);

  /*
   * Fenster zu: Abschied schicken und die Kamera ausschalten. Sonst bliebe der
   * Gastgeber vor einem stehengebliebenen Bild sitzen und die Kameraleuchte
   * an, bis der Browser irgendwann aufraeumt.
   *
   * Der Teilnehmer wird hier bewusst nicht auf "beendet" gesetzt: Ein
   * Neuladen sieht fuer den Browser genauso aus wie ein Schliessen, und der
   * Gast soll nach F5 nicht wieder bei der Namenseingabe stehen. Abgemeldet
   * wird nur, wer selbst auflegt.
   */
  useEffect(() => {
    const abschied = () => {
      hintergrundRef.current?.beenden();
      hintergrundRef.current = null;
      verbindung.current?.beenden();
      verbindung.current = null;
      streamRef.current?.getTracks().forEach((s) => s.stop());
      streamRef.current = null;
    };
    window.addEventListener("pagehide", abschied);
    return () => window.removeEventListener("pagehide", abschied);
  }, []);

  /**
   * Den Knopf "Warteraum betreten" ueber der eingeblendeten Tastatur halten.
   *
   * Auf dem Telefon schiebt die Tastatur den halben Bildschirm zu. Der Browser
   * rollt zwar das angetippte Feld ins Bild, aber nicht den Knopf darunter, und
   * der Gast steht dann vor einem Formular, das er nicht abschicken kann.
   *
   * Gerechnet wird mit dem sichtbaren Ausschnitt (`visualViewport`), denn nur
   * der schrumpft, wenn die Tastatur aufgeht. Die gewoehnliche Seitenhoehe
   * bleibt gleich, deshalb hilft `scrollIntoView` hier nicht. Fehlt der
   * Browser diese Angabe, wird mit der Fensterhoehe gerechnet, dann ist es
   * wenigstens kein Rueckschritt.
   */
  const holeKnopfInsBild = useCallback(() => {
    const knopf = beitretenRef.current;
    if (!knopf) return;
    const sicht = window.visualViewport;
    const unterkante = (sicht?.offsetTop ?? 0) + (sicht?.height ?? window.innerHeight);
    // Etwas Luft, damit der Knopf nicht an der Tastatur klebt.
    const fehlt = knopf.getBoundingClientRect().bottom + 16 - unterkante;
    if (fehlt > 0) window.scrollBy({ top: fehlt, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (phase !== "name") return;
    const sicht = window.visualViewport;
    if (!sicht) return;
    // Nur wenn der Gast wirklich im Namensfeld steht. Sonst ruckelte die Seite
    // auch dann, wenn sich der Ausschnitt aus einem anderen Grund aendert.
    const beiGroessenwechsel = () => {
      if (document.activeElement !== namensfeldRef.current) return;
      window.setTimeout(holeKnopfInsBild, 80);
    };
    sicht.addEventListener("resize", beiGroessenwechsel);
    return () => sicht.removeEventListener("resize", beiGroessenwechsel);
  }, [phase, holeKnopfInsBild]);

  const betreten = async () => {
    if (!name.trim() || betreteGerade) return;
    setBetreteGerade(true);
    setFehler(null);
    try {
      const ergebnis = await betreteRaumAlsGast({
        token,
        name: name.trim(),
        technik: { kamera: Boolean(lokalerStream?.getVideoTracks().length), mikrofon: Boolean(lokalerStream?.getAudioTracks().length) },
      });
      if (!ergebnis) { setFehler(gastFehlerText(null, ansicht?.art, sprache)); return; }
      gastToken.current = ergebnis.gastToken;
      teilnehmerId.current = ergebnis.teilnehmerId;
      // Damit ein Neuladen nicht als zweiter Gast in der Warteliste landet.
      merkeGastSitzung(token, { ...ergebnis, name: name.trim() });
      setPhase("warteraum");
    } catch (e) {
      // Die Datenbank wirft ihre Meldung ohne Umlaute und im Technikton. Der
      // Kunde bekommt stattdessen einen Satz, mit dem er etwas anfangen kann.
      setFehler(gastFehlerText(e, ansicht?.art, sprache));
    } finally {
      setBetreteGerade(false);
    }
  };

  const auflegen = () => beendeGespraech(texte.dankeAmEnde);

  const agenda = useMemo(() => (Array.isArray(ansicht?.agenda) ? ansicht!.agenda : []), [ansicht]);

  /**
   * Mikrofon und Kamera lassen sich schon vor dem Betreten schalten. Wer
   * stumm oder ohne Bild hereinkommen will, soll das nicht erst im Gespraech
   * merken.
   */
  const steuerung: MedienSteuerung = useMemo(() => ({
    tonAn,
    bildAn,
    spiegeln,
    wechsleTon: () => {
      const neu = !tonAnRef.current;
      tonAnRef.current = neu;
      setTonAn(neu);
      setzeSpurZustand(streamRef.current, "audio", neu);
      verbindung.current?.setzeSpur("audio", neu);
      // Der Gastgeber muss merken, wenn der Gast eine Stummschaltung wieder
      // aufhebt. Sonst waere sie eine Bitte und keine Massnahme.
      verbindung.current?.sendeRegie({ art: "tonstand", an: neu });
      if (neu) setVomGastgeberStumm(false);
    },
    wechsleBild: () => {
      setBildAn((vorher) => {
        const neu = !vorher;
        setzeSpurZustand(streamRef.current, "video", neu);
        verbindung.current?.setzeSpur("video", neu);
        // Kamera aus stoppt auch die Hintergrund-Verarbeitung.
        hintergrundRef.current?.setzeKameraAn(neu);
        return neu;
      });
    },
  }), [tonAn, bildAn, spiegeln]);

  /** Hintergrund umstellen. Der Gast kennt nur Aus und Weichzeichnen. */
  const setzeHintergrundWahl = useCallback(async (wahl: HintergrundWahl) => {
    const regie = hintergrundRef.current;
    if (!regie) return;
    setHintergrundLaedt(true);
    try {
      const ok = await regie.setzeWahl(wahl);
      setHintergrund(ok ? wahl : { art: "aus" });
    } finally {
      setHintergrundLaedt(false);
    }
  }, []);

  const wechsleKamera = useCallback(async (geraetId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    const regie = hintergrundRef.current;
    if (regie?.aktiv()) {
      // Waehrend der Komposition laeuft die Kamera in der Regie, nicht im Stream.
      const neu = await holeEinzelSpur("video", geraetId);
      if (!neu) { toast.error(videoraumGastTexte(spracheRef.current).seite.kameraWechselFehler); return; }
      regie.wechsleKameraSpur(neu);
    } else {
      const ok = await wechsleEingabeGeraet({
        stream,
        art: "video",
        geraetId,
        ersetzeSenderSpur: (spur) => verbindung.current?.ersetzeSpur?.("video", spur),
      });
      if (!ok) { toast.error(videoraumGastTexte(spracheRef.current).seite.kameraWechselFehler); return; }
    }
    setKameraId(geraetId);
  }, []);

  const wechsleMikrofon = useCallback(async (geraetId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    const ok = await wechsleEingabeGeraet({
      stream,
      art: "audio",
      geraetId,
      ersetzeSenderSpur: (spur) => verbindung.current?.ersetzeSpur?.("audio", spur),
    });
    if (!ok) { toast.error(videoraumGastTexte(spracheRef.current).seite.mikrofonWechselFehler); return; }
    setMikrofonId(geraetId);
  }, []);

  // Erst nach der Freigabe traegt die Geraeteliste Namen und Kennungen.
  const geraete = useGeraeteListe(Boolean(lokalerStream));

  const schnellzugriff = lokalerStream ? (
    <GeraeteSchnellzugriff
      geraete={geraete}
      kameraId={kameraId}
      mikrofonId={mikrofonId}
      lautsprecherId={lautsprecherId}
      aufKamera={(geraetId) => void wechsleKamera(geraetId)}
      aufMikrofon={(geraetId) => void wechsleMikrofon(geraetId)}
      aufLautsprecher={kannLautsprecherWaehlen() ? setLautsprecherId : undefined}
      spiegeln={spiegeln}
      aufSpiegeln={setSpiegeln}
      hintergrund={hintergrund}
      aufHintergrund={(wahl) => void setzeHintergrundWahl(wahl)}
      hintergrundLaedt={hintergrundLaedt}
      sprache={sprache}
    />
  ) : null;

  // Die Meldung zu Kamera und Mikrofon kommt deutsch aus `holeMedien`.
  const medienHinweis = medienFehler ? medienMeldung(medienFehler, sprache) : null;

  // -------------------------------------------------------------------------

  if (phase === "laden" || !spracheBereit) {
    return (
      <Buehne>
        <div className="flex min-h-[100dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" aria-label={seite.laedt} />
        </div>
      </Buehne>
    );
  }

  if (phase === "fehlt") {
    return (
      <Buehne>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-bold">{seite.linkUngueltigTitel}</h1>
          {/*
            Anredefrei formuliert, und das mit Absicht.

            Diese Seite erscheint genau dann, wenn der Raum nicht mehr geladen
            werden konnte. Damit ist auch die Raumart unbekannt, und ohne sie
            lässt sich nicht entscheiden, ob hier ein Kunde (Sie) oder ein
            Bewerber (Du) davorsitzt. Bis zum 14.09.2026 stand hier die
            Sie-Fassung, ein Bewerber wurde also ausgerechnet auf der
            Fehlerseite gesiezt. Eine Formulierung ohne Anrede passt für beide.
          */}
          <p className="mt-3 max-w-md text-sm text-white/60">
            {seite.linkUngueltigText}
          </p>
        </div>
      </Buehne>
    );
  }

  if (phase === "raus") {
    return (
      <Buehne>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
          <Balken className="mb-6" />
          <h1 className="text-2xl font-bold">{seite.beendetTitel}</h1>
          <p className="mt-3 max-w-md text-sm text-white/60">{rausGrund}</p>
        </div>
      </Buehne>
    );
  }

  if (phase === "gespraech") {
    return (
      <Gespraech
        lokalerStream={lokalerStream}
        gegenstellen={gegenstellen}
        zustand={zustand}
        gegenName={gastgeber.name}
        verbindung={verbindung.current}
        aufBeenden={auflegen}
        titel={istObjekt ? seite.objektvorstellung : texte.gespraechTitel}
        sprache={sprache}
        /*
          Der Stand der Schalter kommt von hier, nicht aus der Ansicht selbst.
          Sonst stand der Knopf im Gespraech auf "Ton an", obwohl der Gast sich
          schon im Warteraum stummgeschaltet hatte.
        */
        tonAn={tonAn}
        bildAn={bildAn}
        wechsleTon={steuerung.wechsleTon}
        wechsleBild={steuerung.wechsleBild}
        spiegelEigenbild={spiegeln}
        /*
          Laeuft ein Hintergrundbild, setzt die Spiegelung der eigenen Vorschau
          aus, sonst stuende die Schrift darin verkehrt. Die gesendete Spur
          bleibt in jedem Fall richtig herum.
        */
        hintergrundArt={hintergrund.art}
        /*
          Waehrend des Teilens ruht die Leinwand des Video-Hintergrunds. Ohne
          diesen Rueckgriff auf die rohe Kamera saehe der Gast sich selbst als
          Standbild.
        */
        eigeneVorschau={() => hintergrundRef.current?.roheKamera() ?? null}
        lautsprecherId={lautsprecherId ?? null}
        schnellEinstellungen={schnellzugriff}
        teilenGesperrt={!teilenErlaubt}
        teilenHinweis={texte.teilenGesperrt}
        teilenBeschriftung={texte.teilenLaeuft}
        /*
          Beide Hinweise stehen als Streifen unter der Kopfzeile, nicht als
          Kaestchen darin. In der Kopfzeile draengten sie auf dem Handy das
          Logo und die Uhr an den Rand, und ausgerechnet der Satz zur
          Mitschrift war dann nur halb zu lesen.
        */
        banner={
          mitschriftLaeuft || vomGastgeberStumm ? (
            <div className="flex flex-col">
              {mitschriftLaeuft && (
                <div className="flex items-center justify-center gap-2 bg-white/[0.06] px-4 py-1.5 text-center text-[12px] text-white/70">
                  <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#E5372B]" />
                  {seite.mitschrift}
                </div>
              )}
              {vomGastgeberStumm && (
                <div className="flex items-center justify-center gap-2 bg-[#E5372B]/15 px-4 py-1.5 text-center text-[12px] text-[#FFB4AE]">
                  <MicOff className="h-3.5 w-3.5 shrink-0" />
                  <span>{mitWerten(texte.stummgeschaltet, { name: gastgeber.name })}</span>
                </div>
              )}
            </div>
          ) : undefined
        }
      />
    );
  }

  // ---------------------------------------------------------------- Warteraum
  if (phase === "warteraum") {
    return (
      <Buehne>
        <Warteraum
          name={name}
          daten={{
            art: ansicht?.art ?? "sonstiges",
            gastgeber,
            agenda,
            hinweis: ansicht?.hinweis ?? null,
            dauerMinuten: ansicht?.dauer_minuten ?? 0,
            objekt,
            berechnung,
            naechsteSchritte,
            stream: lokalerStream,
            medienFehler: medienHinweis,
            steuerung,
            technikErweiterung: schnellzugriff,
            warteHinweis: warteHinweis || undefined,
          }}
          sprache={sprache}
        />
      </Buehne>
    );
  }

  // ------------------------------------------------------------ Namenseingabe
  return (
    <Buehne>
      {/*
        Auf dem Telefon steht die Seite in drei Bloecken untereinander:
        Begruessung, Karte, Eckdaten. Die Karte rueckt also vor die Eckdaten,
        denn wer hier landet, will seinen Namen eintragen und hineingehen. Vor
        dem Umbau lagen Eckdaten und Fusszeile davor, und das Namensfeld begann
        erst bei 791 Pixeln, also weit unterhalb eines Telefonbildschirms.

        Gemacht wird das mit `contents`: Auf dem Telefon verschwindet die
        Huelle aus dem Layout, ihre beiden Bloecke werden selbst zu Feldern des
        Gitters und lassen sich mit `order` umsortieren. Ab `lg` ist die Huelle
        wieder ein gewoehnlicher Block, damit bleibt die Ansicht am Schreibtisch
        unveraendert zweispaltig.
      */}
      <div data-gastseite className="mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-6 pb-[max(24px,env(safe-area-inset-bottom))] pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[max(56px,calc(env(safe-area-inset-top)+56px))] sm:gap-12 sm:px-10 sm:py-24 lg:grid-cols-[1fr_480px] lg:py-0">
        <div className="contents lg:block">
        <div className="order-1">
          <Kennung>{istObjekt ? seite.objektvorstellung : texte.gespraechTitel}</Kennung>
          <h1 className="mt-3 text-[27px] font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-[44px]">
            {texte.begruessungOben}<br />{texte.begruessungUnten}
          </h1>
          <Balken className="mt-4 sm:mt-6" />
        </div>
        <div className="order-3 lg:order-none">
          <p className="max-w-[430px] text-[14.5px] leading-relaxed text-white/60 sm:text-[15.5px] lg:mt-5">
            {texte.einrichtenVorher}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-8">
            <div className="flex items-center gap-3 text-sm text-white/60">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#30E19E]/[0.13]"><User className="h-3.5 w-3.5" /></span>
              <span>{seite.mit} <b className="font-semibold text-white">{gastgeber.name}</b>{gastgeberBezeichnung ? `, ${gastgeberBezeichnung}` : ""}</span>
            </div>
            {ansicht?.termin_at && (
              <div className="flex items-center gap-3 text-sm text-white/60">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#30E19E]/[0.13]"><Calendar className="h-3.5 w-3.5" /></span>
                <span><b className="font-semibold text-white">{uhrzeit(ansicht.termin_at, sprache)}</b> · {mitWerten(seite.minuten, { minuten: ansicht.dauer_minuten })}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-white/60">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#30E19E]/[0.13]"><Lock className="h-3.5 w-3.5" /></span>
              {/*
                Vorher stand hier zusaetzlich "Server in der EU". Bild und Ton
                gehen direkt von Browser zu Browser, aber die Vermittlung laeuft
                ueber oeffentliche STUN-Server von Google und Cloudflare. Der
                Satz war also nicht zu halten und ist deshalb weg.
              */}
              <span>{seite.verschluesselt}</span>
            </div>
          </div>
        </div>
        </div>

        <div className={`order-2 rounded-[22px] border border-white/10 ${FLAECHE_KASTEN} p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,.9)] sm:p-7 lg:order-none`}>
          <div className="relative">
            {/*
              Auf dem Telefon bleibt die Vorschau flacher, sonst schoebe sie
              allein schon das Namensfeld unter den Bildschirmrand. Das Bild
              selbst wird nur beschnitten, es verzerrt nichts.
            */}
            <EigenesBild stream={lokalerStream} bildAus={!bildAn} className="max-h-[150px] sm:max-h-none" sprache={sprache} />
            <span className="absolute bottom-3 left-3 rounded-lg bg-[#0F1621]/70 px-2.5 py-1 text-[10.5px] text-white/60 backdrop-blur">
              {texte.nurEigenesBild}
            </span>
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button
                type="button"
                onClick={steuerung.wechsleTon}
                aria-label={tonAn ? seite.mikrofonAusschalten : seite.mikrofonEinschalten}
                aria-pressed={tonAn}
                className={`flex h-[44px] w-[44px] items-center justify-center rounded-[10px] backdrop-blur transition-colors sm:h-[34px] sm:w-[34px] ${tonAn ? "bg-[#0F1621]/70 text-white" : "bg-[#E5372B] text-white"}`}
              >
                {tonAn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={steuerung.wechsleBild}
                aria-label={bildAn ? seite.kameraAusschalten : seite.kameraEinschalten}
                aria-pressed={bildAn}
                className={`flex h-[44px] w-[44px] items-center justify-center rounded-[10px] backdrop-blur transition-colors sm:h-[34px] sm:w-[34px] ${bildAn ? "bg-[#0F1621]/70 text-white" : "bg-[#E5372B] text-white"}`}
              >
                {bildAn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-1">
            <Schalter
              an={hintergrund.art === "weich"}
              gesperrt={!lokalerStream || hintergrundLaedt}
              beschriftung={seite.hintergrundWeich}
              hinweis={lokalerStream ? undefined : seite.erstKameraFreigeben}
              aufWechsel={() => void setzeHintergrundWahl(hintergrund.art === "weich" ? { art: "aus" } : { art: "weich" })}
            />
          </div>

          <label htmlFor="gastname" className="mt-5 block text-xs font-semibold text-white/60 sm:mt-6">{texte.namensfeld}</label>
          {/*
            Die Schriftgroesse ist auf dem Telefon keine Geschmacksfrage.

            Safari auf dem iPhone zoomt die ganze Seite heran, sobald der Nutzer
            in ein Feld tippt, dessen Schrift kleiner als 16 Pixel ist. Danach
            steht die Seite quer im Bild und muss von Hand zurechtgeschoben
            werden. Mit 16 Pixeln bleibt der Ausschnitt, wie er ist. Am
            Schreibtisch bleiben es die gewohnten 15.
          */}
          <input
            id="gastname"
            ref={namensfeldRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void betreten(); }}
            onFocus={() => { window.setTimeout(holeKnopfInsBild, 350); }}
            placeholder={seite.namePlatzhalter}
            maxLength={80}
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="go"
            className={`mt-2 h-[52px] w-full rounded-xl border border-[#30E19E]/40 ${FLAECHE_FELD} px-4 text-[16px] text-white outline-none placeholder:text-white/25 focus:border-[#30E19E] sm:h-[50px] sm:text-[15px]`}
          />

          {/*
            Hier stand ein Haekchen zur Zustimmung in eine Mitschrift. Es gibt
            keine Mitschrift, also wird auch keine Einwilligung dafuer
            eingeholt. Es kommt zurueck, wenn die Mitschrift wirklich da ist.
          */}

          {medienHinweis && <p className="mt-4 text-[12px] leading-relaxed text-[#FFB4AE]">{medienHinweis}</p>}
          {fehler && <p className="mt-4 text-[12px] leading-relaxed text-[#FFB4AE]">{fehler}</p>}

          <button
            type="button"
            ref={beitretenRef}
            onClick={() => void betreten()}
            disabled={!name.trim() || betreteGerade}
            className="mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#15724F] text-[15px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(21,114,79,.7)] transition-opacity hover:brightness-110 disabled:opacity-40 sm:mt-5 sm:h-[46px] sm:text-[14.5px]"
          >
            {betreteGerade ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{seite.betreten} <ArrowRight className="h-4 w-4" /></>}
          </button>

          <p className="mt-4 text-center text-[10.5px] text-white/30">
            OS Immobilien · Am Ostbahnhof 1, 15749 Mittenwalde
          </p>
        </div>
      </div>
    </Buehne>
  );
}
