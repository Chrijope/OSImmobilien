import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { addAktivitaet, type AktivitaetEntry } from "@/lib/aktivitaetenStore";
import { starteAnrufFuerKontakt } from "@/lib/anrufStarten";
import { addAufgabe } from "@/lib/aufgabenStore";
import { versendeMeetingEinladung, versendeGastEinladungen, type TerminGast } from "@/lib/meetingEinladung";
import { loadAllUsers, type SystemUser } from "@/lib/loadAllUsers";
import { useToast } from "@/hooks/use-toast";
import { StickyNote, Phone, Mail, CheckSquare, CalendarDays, PhoneCall, Users, Send, Video, Link, Plus, ExternalLink } from "lucide-react";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { useUser } from "@/contexts/UserContext";
import { ladeBerater } from "@/lib/beraterProfil";
import { getUserSetting } from "@/lib/userSettingsCache";
import { raumUrl, type VideoraumArt } from "@/lib/videoraumStore";
import { ladeTerminarten, ladeLinks, erstelleLink, setzeLinkAktiv, buchungUrl, istExternerLink, type Terminart, type BuchungLink } from "@/lib/buchungStore";
import { BuchungskalenderListe } from "@/components/kunden/BuchungskalenderListe";
import { useEigeneBuchungslinks } from "@/lib/eigeneBuchungslinks";

import { buchungFehlerMeldung } from "@/lib/buchungZeitenMeldung";
import { versendeBuchungslinkMail } from "@/lib/buchungslinkMail";
import { stelleKundenspracheSicher } from "@/lib/kundenSprache";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";
import { speichereMeeting } from "@/lib/meetingSpeichern";
import { berlinJetzt, meetingVorschlag, meetingZeitInZukunft } from "@/lib/meetingZeit";
import { terminToken } from "@/lib/oeffentlicheBasis";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import { confirmDialog } from "@/lib/confirm";
import { TERMINE_AKTUALISIERT_EVENT } from "@/lib/terminAnzeige";
import { istTerminInZukunft, heuteIso, TERMIN_ZUKUNFT_MELDUNG } from "@/lib/kontaktPipeline";
import { gespraechFandStatt as fandGespraechStatt, wiedervorlageVorschlag, zusammenfassungIstPflicht } from "@/lib/anrufProtokoll";
import { cacheGetById } from "@/lib/dataCache";

export interface AnrufProtokollResult {
  ergebnis: string;
  zusammenfassung?: string;
  investmentId?: string;
  datum?: string;
  uhrzeit?: string;
  /**
   * Hat der Nutzer im selben Protokoll selbst eine Aufgabe angelegt? Dann
   * entfällt die automatische Nachfass-Aufgabe bei „Nicht erreicht", sonst
   * stünden zwei Aufgaben für denselben Rückruf in der Inbox.
   */
  eigeneAufgabe?: boolean;
}

interface QuickActionDialogProps {
  art: AktivitaetEntry["art"] | null;
  kundeId: string;
  kundeName: string;
  kundeEmail: string;
  kundeTelefon: string;
  berater: string;
  onClose: () => void;
  onSaved: () => void;
  /** Callback für Ergebnisse aus dem Anruf-Protokoll (nicht_erreicht, kein_interesse, daten_falsch, beratungsgespraech_vereinbart, …). */
  onProtokollResult?: (r: AnrufProtokollResult) => void;
  /** Aktueller "Nicht erreicht"-Zähler (für Anzeige im Anruf-Protokoll-Dialog). */
  nichtErreichtCount?: number;
  /** Maximale Kontaktversuche bevor Lead verloren. */
  maxKontaktversuche?: number;
  /**
   * Gilt das Limit von 15 Versuchen ueberhaupt noch?
   *
   * Ab der Stufe „Beratungsgespraech" wird ein Lead nicht mehr automatisch
   * auf verloren gesetzt. Dann ist die Zahl reine Information, deshalb ohne
   * „/ 15" und ohne Punktleiste.
   */
  verlorenLimitAktiv?: boolean;
  /**
   * Wurde unmittelbar vorher ein Anruf gestartet? Dann fragt der Dialog beim
   * Schließen ohne Speichern nach, damit der Anruf nicht undokumentiert
   * bleibt. Wer „Anruf notieren" von Hand öffnet, bekommt die Rückfrage nicht.
   */
  anrufGestartet?: boolean;
}

/**
 * Die Ergebnisse eines Anrufs, ausgeschrieben.
 *
 * Steht hier einmal, damit die Auswahlliste und die Historie dieselben Worte
 * benutzen. Fehlt die Zusammenfassung, ist dieser Text alles, was spaeter
 * ueber den Anruf zu lesen ist.
 */
const ERGEBNIS_TEXT: Record<string, string> = {
  erreicht: "Erreicht",
  nicht_erreicht: "Nicht erreicht",
  mailbox: "Mailbox",
  erstgespraech_vereinbart: "Erstgespräch vereinbart",
  beratungsgespraech_vereinbart: "Beratungsgespräch vereinbart",
  kein_interesse: "Kein Interesse",
  daten_falsch: "Daten falsch",
};

/**
 * Uebersetzt den Anlass einer Terminart in die Warteraum-Art.
 * Der Warteraum kennt kein Finanzierungsgespraech, inhaltlich passt dort
 * die Beratungs-Ansicht.
 */
function anlassZuRaumArt(anlass: string): VideoraumArt {
  if (
    anlass === "erstgespraech" || anlass === "beratung" ||
    anlass === "objektvorstellung" || anlass === "bewerbergespraech" ||
    anlass === "sonstiges"
  ) {
    return anlass;
  }
  return "beratung";
}

export function QuickActionDialog({
  art, kundeId, kundeName, kundeEmail, kundeTelefon, berater, onClose, onSaved, onProtokollResult,
  nichtErreichtCount = 0, maxKontaktversuche = 15, verlorenLimitAktiv = true, anrufGestartet = false,
}: QuickActionDialogProps) {
  const { toast } = useToast();

  // Shared
  const [beschreibung, setBeschreibung] = useState("");
  const [details, setDetails] = useState("");
  // Aufgabe / Meeting
  const [titel, setTitel] = useState("");
  const [prioritaet, setPrioritaet] = useState<"niedrig" | "mittel" | "hoch" | "dringend">("mittel");
  const [faelligAm, setFaelligAm] = useState(heuteIso());
  const [uhrzeit, setUhrzeit] = useState("10:00");
  const [zugewiesenAn, setZugewiesenAn] = useState(berater);
  // Echte Zuweisung: die Nutzer-ID des Empfängers. Leer bedeutet "ich selbst".
  const [zugewiesenAnId, setZugewiesenAnId] = useState<string>("");
  // Zu welchem Investment gehört die Aufgabe? Die Pipeline zeigt pro
  // Investment eine eigene Kachel, ohne diese Angabe erscheint die Aufgabe auf
  // allen Kacheln des Kunden.
  const [investmentId, setInvestmentId] = useState<string>("");
  const investmentsDesKunden = useMemo(() => {
    try { return getInvestmentsByKontakt(kundeId); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kundeId, art]);
  const [interneNutzer, setInterneNutzer] = useState<SystemUser[]>([]);
  // Gibt es genau ein Investment, ist die Zuordnung eindeutig. Dann wird sie
  // gleich gesetzt, statt eine Wahl ohne Alternative zu verlangen.
  useEffect(() => {
    if (investmentsDesKunden.length === 1) {
      setInvestmentId(prev => prev || investmentsDesKunden[0].id);
      setLinkInvestmentId(prev => prev || investmentsDesKunden[0].id);
    }
  }, [investmentsDesKunden]);
  useEffect(() => {
    try {
      setInterneNutzer(
        loadAllUsers().filter(u => {
          const r = (u.rolle || "").toLowerCase();
          return r !== "kunde" && r !== "tippgeber";
        }),
      );
    } catch { /* ignore */ }
  }, []);
  // Meeting
  // `authUser` liefert die Nutzer-ID. Sie geht als Kennung des Beraters in die
  // Einladung, damit die Mail ihn nicht ueber seinen Namen suchen muss.
  const { user, authUser } = useUser();
  /*
   * Verfasser immer ausdruecklich mitgeben. Ohne `von` faellt der Store auf
   * die Namensaufloesung ueber loadAllUsers zurueck, und die liefert bei
   * Vertriebspartnern haeufig "System". Solche Eintraege blendet der
   * Notizen-Reiter als Systemeintraege aus, die Notiz wirkt verschwunden
   * (gemeldet von Julian Meyer bei Ellermann und Nostadt).
   */
  const addMitVerfasser: typeof addAktivitaet = (e) => addAktivitaet({ von: user.name, ...e });
  // Der eigene Videoraum ist noch in Erprobung, siehe sidebarPermissions.
  const { darf: darfVideoraum } = useVideocallFreigabe();
  /**
   * Wie das Meeting stattfindet. Der eigene Videoraum ist noch in Erprobung
   * und deshalb nur fuer admin und inhaber waehlbar, genau wie die Seite
   * selbst. Alle anderen starten mit "Telefon".
   */
  const [videoWeg, setVideoWeg] = useState<"videoraum" | "vor_ort" | "telefon" | "ohne">(() =>
    darfVideoraum ? "videoraum" : "telefon");
  // Die Freigabe einzelner Nutzer kommt asynchron. Kommt sie nach dem ersten
  // Rendern an, ruecken wir den unberuehrten Standard auf den Videoraum.
  useEffect(() => {
    if (darfVideoraum) setVideoWeg((w) => (w === "telefon" ? "videoraum" : w));
  }, [darfVideoraum]);
  /** Adresse fuer ein Treffen vor Ort. */
  const [treffpunkt, setTreffpunkt] = useState("");
  /**
   * Zusaetzliche Gaeste des Termins (Ehepartner, Steuerberater). Muessen
   * nicht im CRM angelegt sein, jeder bekommt seine eigene Einladung.
   */
  const [gaeste, setGaeste] = useState<TerminGast[]>([]);
  const [raumArt, setRaumArt] = useState<VideoraumArt>("beratung");
  // Die Terminart des festen Termins. Sie liefert Titel, Dauer und den
  // Anlass fuer den Warteraum.
  const [festTerminartId, setFestTerminartId] = useState<string>("");
  /**
   * Zwei Wege zu einem Termin: Der Partner legt ihn fest, oder der Kunde
   * sucht sich selbst eine Zeit aus. Beim zweiten Weg entsteht kein Termin,
   * sondern ein persoenlicher Buchungslink fuer genau diesen Kunden.
   */
  const [terminModus, setTerminModus] = useState<"fest" | "kunde">("fest");
  const [terminarten, setTerminarten] = useState<Terminart[]>([]);
  const [terminartId, setTerminartId] = useState("");
  const [links, setLinks] = useState<BuchungLink[]>([]);
  const [legtLinkAn, setLegtLinkAn] = useState(false);
  /**
   * Ein einmaliger Link ist verbraucht, sobald darueber ein Termin steht. Das
   * ist die richtige Wahl fuer die Einladung zu genau einem Gespraech, aber
   * die falsche fuer den Stammkunden. Standard bleibt deshalb mehrfach
   * nutzbar, damit sich fuer niemanden etwas aendert.
   */
  const [linkEinmalig, setLinkEinmalig] = useState(false);
  // Zu welchem Investment der gebuchte Termin gehoert. Vorbelegt mit dem
  // einzigen bzw. dem oben gewaehlten Investment des Kunden.
  const [linkInvestmentId, setLinkInvestmentId] = useState<string>("");
  /** Gueltigkeit in Tagen, "0" heisst unbegrenzt. */
  const [linkGueltigTage, setLinkGueltigTage] = useState("0");

  /**
   * Die Adresse eines vergebenen Links: unsere eigene Buchungsstrecke.
   *
   * Links auf die Terminseite mit dem eigenen Kalender des Partners
   * (`/terminwahl`) gibt es hier seit dem 29.09.2026 nicht mehr: Die Seite ist
   * nur noch für den Partner selbst, ein Kunde kann sie nicht öffnen. Der
   * Partner erreicht sie über „Terminseite öffnen“ unter „Termin festlegen“.
   */
  const linkAdresse = (l: BuchungLink): string => buchungUrl(l.token);

  const legeLinkAn = async () => {
    if (!terminartId) {
      toast({ title: "Bitte eine Terminart wählen", variant: "destructive" });
      return;
    }
    setLegtLinkAn(true);
    const tage = Number(linkGueltigTage);
    const gueltigBis = tage > 0
      ? new Date(Date.now() + tage * 24 * 60 * 60 * 1000).toISOString()
      : null;
    // Die Terminart haengt am Link, denn sie legt Dauer, Puffer und Vorlauf fest.
    const ergebnis = await erstelleLink({
      kontaktId: kundeId,
      kontaktName: kundeName,
      kontaktEmail: kundeEmail || undefined,
      terminartId,
      ziel: "intern",
      terminartName: terminarten.find((a) => a.id === terminartId)?.bezeichnung,
      investmentId: linkInvestmentId || null,
      einmalig: linkEinmalig,
      gueltigBis,
    });
    setLegtLinkAn(false);
    const link = ergebnis.link;
    if (!link) {
      // Der Link haengt an derselben Einfuegeregel wie die Verfuegbarkeiten.
      // Ohne Grund stand hier nur, dass es nicht ging.
      const meldung = buchungFehlerMeldung(ergebnis.fehler, "linkAnlegen");
      toast({ title: meldung.titel, description: meldung.text, variant: "destructive" });
      return;
    }
    setLinks((v) => [link, ...v]);
    // Im Verlauf festhalten, dass der Kunde einen Link bekommen hat. Sonst
    // weiss beim naechsten Blick niemand mehr, warum ein Termin auftauchte.
    addMitVerfasser({
      kundeId,
      art: "notiz",
      beschreibung: "Buchungslink an den Kunden gegeben",
      details: terminarten.find((a) => a.id === terminartId)?.bezeichnung,
    });
    try {
      await navigator.clipboard.writeText(linkAdresse(link));
      toast({ title: "Buchungslink erstellt und kopiert ✓" });
    } catch {
      toast({ title: "Buchungslink erstellt ✓" });
    }
  };

  /**
   * Einen vergebenen Link abschalten oder wieder anschalten.
   *
   * Bisher gab es dafuer keinen Knopf: Ein einmal verschickter Link galt fuer
   * immer. Wer ihn versehentlich an die falsche Adresse geschickt hatte,
   * konnte nichts tun.
   */
  const wechsleLink = async (link: BuchungLink, aktiv: boolean) => {
    if (!(await setzeLinkAktiv(link.id, aktiv))) {
      toast({ title: "Die Änderung konnte nicht gespeichert werden", variant: "destructive" });
      return;
    }
    setLinks((v) => v.map((l) => (l.id === link.id ? { ...l, aktiv } : l)));
    toast({ title: aktiv ? "Link wieder aktiv ✓" : "Link abgeschaltet ✓" });
  };

  /** Der Link, dessen Mail gerade hinausgeht. Sperrt nur diesen einen Knopf. */
  const [sendetMailFuerLink, setSendetMailFuerLink] = useState<string | null>(null);

  /**
   * Den Buchungslink direkt per E-Mail an den Kunden schicken.
   *
   * Vorher gab es hier nur einen mailto-Knopf mit generischem Text. Jetzt geht
   * eine richtige Mail im Hausstil hinaus, deren Text zum Anlass der Terminart
   * passt, und der Versand landet im Kundenverlauf.
   */
  const sendeLinkMail = async (link: BuchungLink) => {
    if (!kundeEmail || sendetMailFuerLink) return;
    const artDesLinks = terminarten.find((a) => a.id === link.terminart_id);
    // Die Adresse, die zum Link gehoert: Ein externer Link fuehrt auf die
    // Terminseite mit dem eigenen Kalender. Die interne Buchungsadresse lehnt
    // ihn seit dem 27.09.2026 ab.
    const adresse = linkAdresse(link);
    setSendetMailFuerLink(link.id);
    const erfolg = await versendeBuchungslinkMail({
      kundeId,
      kundeName,
      kundeEmail,
      berater,
      // Die Kennung vom Kontakt, gleiche Quelle wie `berater`. Sonst suchte die
      // Mail den Berater ueber seinen Namen.
      beraterId: berater
        ? cacheGetById<{ zustaendig_id?: string }>("kontakte", kundeId)?.zustaendig_id || undefined
        : undefined,
      linkId: link.id,
      buchungUrl: adresse,
      anlass: artDesLinks?.anlass ?? "sonstiges",
      terminartName: artDesLinks?.bezeichnung,
      dauerMinuten: artDesLinks?.dauer_minuten,
      gueltigBis: link.gueltig_bis,
    });
    setSendetMailFuerLink(null);
    if (!erfolg) {
      toast({
        title: "Die E-Mail konnte nicht versendet werden",
        description: "Der Link bleibt gültig. Bitte erneut versuchen oder ihn kopieren und selbst verschicken.",
        variant: "destructive",
      });
      return;
    }
    addMitVerfasser({
      kundeId,
      art: "email",
      beschreibung: `Buchungslink per E-Mail gesendet: ${artDesLinks?.bezeichnung ?? "Termin"}`,
      details: `An ${kundeEmail}\n${adresse}`,
    });
    toast({ title: "Buchungslink per E-Mail gesendet ✓", description: `An ${kundeEmail}` });
  };
  const [teilnehmer, setTeilnehmer] = useState(berater);
  const [emailEinladung, setEmailEinladung] = useState(true);
  // Anruf Protokoll
  const [dauer, setDauer] = useState("");
  /*
   * Startet leer: Das Ergebnis ist Pflicht und soll bewusst gewählt werden.
   * Vorher stand „Erreicht" vorbelegt da, wer nicht hinsah, protokollierte
   * damit ein Gespräch, das es nie gab.
   */
  const [ergebnis, setErgebnis] = useState<string>("");
  // Nur wenn tatsächlich jemand am Telefon war, gibt es eine Gesprächsdauer.
  // Bei "nicht erreicht", "Mailbox" und "Daten falsch" verschwindet das Feld.
  const gespraechFandStatt = fandGespraechStatt(ergebnis);
  const zusammenfassungPflicht = art === "anruf_protokoll" && zusammenfassungIstPflicht(ergebnis);
  const setzeErgebnis = (neu: string) => {
    setErgebnis(neu);
    // Eine stehengebliebene Dauer aus einem vorherigen Versuch waere falsch.
    if (!fandGespraechStatt(neu)) setDauer("");
  };
  // Beratungsgespräch vereinbart – Investment/Datum/Uhrzeit (nur bei diesem Ergebnis sichtbar)
  const [bgInvestmentId, setBgInvestmentId] = useState<string>("");
  const [bgDatum, setBgDatum] = useState<string>(heuteIso());
  const [bgUhrzeit, setBgUhrzeit] = useState<string>("10:00");
  const investmentsForBg = art === "anruf_protokoll" ? getInvestmentsByKontakt(kundeId) : [];
  useEffect(() => {
    if (!bgInvestmentId && investmentsForBg.length > 0) {
      setBgInvestmentId(investmentsForBg[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investmentsForBg.length]);

  // Bestätigung "über den Buchungskalender gebucht" bei "Beratungsgespräch vereinbart"
  const [bgViaBuchungskalender, setBgViaBuchungskalender] = useState(false);

  /*
   * Termin fuer das Erstgespraech.
   *
   * Bisher gab es hier nur eine Folge-Aufgabe: Wer beim Anruf keine Zeit
   * hatte, bekam einen Zettel, aber keinen Termin. Damit stand nirgends im
   * System, dass ein Erstgespraech vereinbart ist, und die Ampel im Profil
   * blieb grau.
   */
  const [egDatum, setEgDatum] = useState("");
  const [egUhrzeit, setEgUhrzeit] = useState("");

  /*
   * Die vier eigenen Buchungskalender aus den Einstellungen.
   *
   * Sie stehen an mehreren Stellen im Kundenprofil, deshalb liegt das Laden
   * seit dem 21.09.2026 in `useEigeneBuchungslinks` und nicht mehr dreimal
   * einzeln da. Geladen wird erst, wenn eine Art gewaehlt ist: Der Dialog
   * haengt an jeder Kundenseite und soll sie nicht bei jedem Rendern holen.
   */
  const { links: eigeneKalender, laedt: kalenderLaedt } = useEigeneBuchungslinks(!!art);
  const eigenerBuchungslink = eigeneKalender.erstgespraech;
  const eigenerBeratungslink = eigeneKalender.beratung;

  /*
   * „Kunde wählt selbst“ gibt es nur noch mit unserer eigenen Strecke samt
   * Videoraum, also nur mit Videocall-Freigabe.
   *
   * Bis zum 29.09.2026 ging es auch über die Terminseite mit dem eigenen
   * Kalender des Partners (Calendly und Co.), der Kunde bekam den Link per
   * Mail. Seit Christians Freigabe vom 29.09.2026 ist diese Seite nur noch
   * für den angemeldeten Partner, dem der Link gehört; ein Kunde sähe dort
   * nur die Bitte um Anmeldung. Der Partner trägt den Termin deshalb selbst
   * ein, über „Terminseite öffnen“ unter „Termin festlegen“.
   */
  const kundeWaehltMoeglich = darfVideoraum;

  // Terminarten und bereits vergebene Links laden, sobald der Weg gewaehlt ist.
  useEffect(() => {
    if (!kundeWaehltMoeglich || art !== "meeting") return;
    let lebt = true;
    void (async () => {
      const [arten, vorhandene] = await Promise.all([ladeTerminarten(), ladeLinks(kundeId)]);
      if (!lebt) return;
      const aktive = arten.filter((a) => a.aktiv);
      setTerminarten(aktive);
      // Links auf die Terminseite gehören nicht zum Kunden, siehe oben.
      setLinks(vorhandene.filter((l) => !istExternerLink(l)));
      setTerminartId((wert) => wert || aktive[0]?.id || "");
    })();
    return () => { lebt = false; };
  }, [kundeWaehltMoeglich, darfVideoraum, art, kundeId]);

  // Auto-open Folge-Aufgabe bei Mailbox und "Erstgespräch vereinbart".
  // Bei "Beratungsgespräch vereinbart" NICHT — der Termin wird oben inline
  // (Datum/Uhrzeit) eingetragen und die Pipeline springt auf Beratungsgespräch,
  // wodurch in den Stammdaten die BG-Ergebnis-Karte (Erschienen/NoShow/Verschoben) erscheint.
  useEffect(() => {
    if (art !== "anruf_protokoll") return;
    if (ergebnis === "mailbox") {
      setFollowupTaskOpen(true);
      setFollowupTitel(`Nochmal anrufen: ${kundeName}`);
    } else if (ergebnis === "erstgespraech_vereinbart") {
      // Kein automatischer Aufgaben-Vorschlag mehr: Der Termin wird jetzt
      // oben mit Datum und Uhrzeit eingetragen und ist damit selbst der
      // naechste Schritt. Eine zusaetzliche Aufgabe waere doppelt.
      setFollowupTaskOpen(false);
    } else if (ergebnis === "beratungsgespraech_vereinbart") {
      setFollowupTaskOpen(false);
    }
    /*
     * Fälligkeit der Aufgabe passend zum Ergebnis vorbelegen: bei „Nicht
     * erreicht" der nächste Versuch laut Staffel, sonst morgen 10:00. Hat der
     * Nutzer Datum oder Uhrzeit schon selbst gesetzt, bleibt seine Wahl
     * stehen, auch wenn er danach das Ergebnis noch einmal umstellt.
     */
    if (!followupTerminManuell.current) {
      const vorschlag = wiedervorlageVorschlag(ergebnis, nichtErreichtCount);
      setFollowupFaellig(vorschlag.datum);
      setFollowupUhrzeit(vorschlag.uhrzeit);
    }
  }, [ergebnis, art, kundeName, nichtErreichtCount]);
  // Email
  const [betreff, setBetreff] = useState("");
  const [emailInhalt, setEmailInhalt] = useState("");
  // Anruf-Protokoll: optionale Folge-Aufgabe
  const [followupTaskOpen, setFollowupTaskOpen] = useState(false);
  const [followupTitel, setFollowupTitel] = useState("");
  const [followupBeschreibung, setFollowupBeschreibung] = useState("");
  const [followupPrio, setFollowupPrio] = useState<"niedrig" | "mittel" | "hoch" | "dringend">("mittel");
  const [followupFaellig, setFollowupFaellig] = useState(heuteIso());
  const [followupUhrzeit, setFollowupUhrzeit] = useState("10:00");
  const [followupZugewiesen, setFollowupZugewiesen] = useState(berater);
  // Hat der Nutzer die Fälligkeit selbst gesetzt? Dann überschreibt der
  // Vorschlag zum Ergebnis sie nicht mehr.
  const followupTerminManuell = useRef(false);

  // ── Auto-Draft: speichert Eingaben in localStorage, damit sie bei Tab-Wechsel,
  // Reload oder versehentlichem Schließen nicht verloren gehen.
  const draftKey = art ? `quickActionDraft:${kundeId}:${art}` : null;
  const restoredRef = useRef<string | null>(null);

  // Reset restore-marker whenever the dialog closes so reopening restores again.
  useEffect(() => {
    if (!art) restoredRef.current = null;
  }, [art]);

  /*
   * Terminvorschlag beim Öffnen von „Meeting erstellen".
   *
   * Vorher stand hier fest der heutige Tag und 10:00. Ab dem späten Vormittag
   * lag der Vorschlag damit von sich aus in der Vergangenheit und musste bei
   * jedem Meeting von Hand korrigiert werden. `meetingVorschlag` rechnet in
   * Berliner Zeit und liefert immer einen Zeitpunkt in der Zukunft.
   *
   * Steht vor dem Wiederherstellen des Entwurfs, damit ein gültiger Entwurf
   * den Vorschlag gleich danach überschreiben kann.
   */
  useEffect(() => {
    if (art !== "meeting") return;
    const vorschlag = meetingVorschlag();
    setFaelligAm(vorschlag.datum);
    setUhrzeit(vorschlag.uhrzeit);
  }, [art]);

  /*
   * Die Berliner Uhr für den Meeting-Dialog, alle 30 Sekunden nachgezogen.
   *
   * Ohne das Nachziehen bliebe die Grenze stehen, die beim Öffnen galt. Wer den
   * Dialog um 17:55 öffnet und um 18:05 abschickt, soll den Hinweis schon im
   * Formular sehen und nicht erst als Meldung beim Absenden.
   */
  const [meetingJetzt, setMeetingJetzt] = useState(() => berlinJetzt());
  useEffect(() => {
    if (art !== "meeting") return;
    setMeetingJetzt(berlinJetzt());
    const ticker = setInterval(() => setMeetingJetzt(berlinJetzt()), 30_000);
    return () => clearInterval(ticker);
  }, [art]);
  const meetingHeute = meetingJetzt.datum;
  const meetingJetztUhr = meetingJetzt.uhrzeit;
  // Liegt die aktuelle Eingabe in der Vergangenheit? Gerechnet wie beim
  // Absenden, damit Hinweis und Meldung nie verschiedener Meinung sind.
  const meetingZeitVorbei =
    art === "meeting" && !!faelligAm && !!uhrzeit && !meetingZeitInZukunft(faelligAm, uhrzeit);

  // Restore on open
  useEffect(() => {
    if (!draftKey) return;
    if (restoredRef.current === draftKey) return;
    restoredRef.current = draftKey;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d.beschreibung === "string") setBeschreibung(d.beschreibung);
      if (typeof d.details === "string") setDetails(d.details);
      if (typeof d.titel === "string") setTitel(d.titel);
      if (typeof d.prioritaet === "string") setPrioritaet(d.prioritaet);
      /*
       * Beim Meeting darf ein liegengebliebener Entwurf keinen vergangenen
       * Termin zurückbringen. Liegt die gespeicherte Zeit nicht mehr in der
       * Zukunft, bleibt der frische Vorschlag von oben stehen. Bei Aufgaben
       * und den übrigen Arten zählt der Entwurf unverändert, dort kann ein
       * nachträglich erfasstes Datum sinnvoll sein.
       */
      const entwurfsTerminGilt =
        art !== "meeting" ||
        (typeof d.faelligAm === "string" &&
          typeof d.uhrzeit === "string" &&
          meetingZeitInZukunft(d.faelligAm, d.uhrzeit));
      if (entwurfsTerminGilt) {
        if (typeof d.faelligAm === "string") setFaelligAm(d.faelligAm);
        if (typeof d.uhrzeit === "string") setUhrzeit(d.uhrzeit);
      }
      if (typeof d.zugewiesenAn === "string") setZugewiesenAn(d.zugewiesenAn);
      if (typeof d.teilnehmer === "string") setTeilnehmer(d.teilnehmer);
      if (typeof d.dauer === "string") setDauer(d.dauer);
      if (typeof d.ergebnis === "string") setErgebnis(d.ergebnis);
      if (typeof d.betreff === "string") setBetreff(d.betreff);
      if (typeof d.emailInhalt === "string") setEmailInhalt(d.emailInhalt);
      if (d.beschreibung || d.details || d.titel || d.betreff || d.emailInhalt) {
        toast({ title: "Entwurf wiederhergestellt", description: "Deine letzte Eingabe wurde geladen." });
      }
    } catch {}
  }, [art, draftKey, toast]);

  // Persist on change (debounced via microtask is fine for textareas)
  useEffect(() => {
    if (!draftKey) return;
    const hasContent =
      beschreibung || details || titel || dauer || betreff || emailInhalt;
    try {
      if (hasContent) {
        localStorage.setItem(draftKey, JSON.stringify({
          beschreibung, details, titel, prioritaet, faelligAm, uhrzeit,
          zugewiesenAn, teilnehmer, dauer, ergebnis, betreff, emailInhalt,
        }));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {}
  }, [draftKey, beschreibung, details, titel, prioritaet, faelligAm, uhrzeit, zugewiesenAn, teilnehmer, dauer, ergebnis, betreff, emailInhalt]);

  // Warn before leaving page (reload/close/tab-switch) with unsaved draft
  useEffect(() => {
    if (!art) return;
    const hasContent = beschreibung || details || titel || betreff || emailInhalt;
    if (!hasContent) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [art, beschreibung, details, titel, betreff, emailInhalt]);

  // Warn before in-app navigation (Sidebar / Header-Links) with unsaved draft.
  // Wir arbeiten mit Capture-Phase auf <a href>-Klicks, damit React-Router
  // die Navigation gar nicht erst startet, wenn der Nutzer ablehnt.
  useEffect(() => {
    if (!art) return;
    /*
     * Ein einmaliger Freifahrtschein für den Klick, den wir selbst auslösen.
     * Ohne ihn liefe der nachgereichte Klick wieder in dieselbe Rückfrage.
     */
    let wechselFreigegeben = false;
    const handler = (ev: MouseEvent) => {
      if (wechselFreigegeben) { wechselFreigegeben = false; return; }
      const hasContent = !!(beschreibung || details || titel || betreff || emailInhalt);
      if (!hasContent) return;
      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      // Nur interne Navigation abfangen (kein target=_blank, kein Download, kein Mailto/Tel)
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      /*
       * Die Rückfrage läuft jetzt über den Projektdialog und ist damit nicht
       * mehr sofort beantwortet. Deshalb wird der Klick zuerst angehalten und
       * der Wechsel danach selbst ausgelöst, wenn zugestimmt wurde. Ein
       * abwartendes `preventDefault` gibt es im Browser nicht.
       */
      ev.preventDefault();
      ev.stopPropagation();
      void confirmDialog({
        title: "Seite wechseln und Eingaben liegen lassen?",
        description:
          "Du hast ungespeicherte Eingaben. Sie werden als Entwurf zwischengespeichert und stehen beim nächsten Öffnen wieder da, gespeichert ist damit aber nichts.",
        confirmText: "Trotzdem wechseln",
        cancelText: "Zurück zum Formular",
      }).then((ok) => {
        if (!ok) return;
        wechselFreigegeben = true;
        anchor.click();
      });
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [art, beschreibung, details, titel, betreff, emailInhalt]);

  const reset = (opts: { clearDraft?: boolean } = { clearDraft: true }) => {
    setBeschreibung(""); setDetails(""); setTitel(""); setPrioritaet("mittel");
    // Beim Meeting derselbe Vorschlag wie beim Öffnen, sonst stünde nach dem
    // Speichern wieder eine Zeit in der Vergangenheit im Formular.
    const startTermin = art === "meeting"
      ? meetingVorschlag()
      : { datum: heuteIso(), uhrzeit: "10:00" };
    setFaelligAm(startTermin.datum); setUhrzeit(startTermin.uhrzeit);
    setZugewiesenAn(berater); setZugewiesenAnId(""); setInvestmentId(""); setTeilnehmer(berater);
    setDauer(""); setErgebnis(""); setBetreff(""); setEmailInhalt("");
    // Der Anlass des Videoraums blieb nach dem Speichern stehen. Der naechste
    // Termin bekam so ungefragt den Warteraum des vorigen.
    setRaumArt("beratung");
    // Dasselbe galt fuer Ereignis, Treffpunkt, Weg und Link-Investment.
    setFestTerminartId("");
    setTreffpunkt("");
    setGaeste([]);
    setVideoWeg(darfVideoraum ? "videoraum" : "telefon");
    setLinkInvestmentId("");
    if (opts.clearDraft && draftKey) {
      try { localStorage.removeItem(draftKey); } catch {}
    }
    restoredRef.current = null;
  };

  const speichernLaeuft = useRef(false);
  const meetingVersuch = useRef({ id: crypto.randomUUID(), token: terminToken("meeting") });
  const [speichertMeeting, setSpeichertMeeting] = useState(false);
  const handleSave = async () => {
    if (!art || speichernLaeuft.current) return;
    speichernLaeuft.current = true;
    setSpeichertMeeting(true);
    try {

    /*
     * Generische Folge-Aufgabe: aus JEDER Aktion heraus möglich (außer aus der
     * reinen Aufgaben-Erstellung selbst, dort wäre es redundant).
     *
     * Geprüft wird VOR dem Speichern der eigentlichen Aktion. Vorher stand die
     * Prüfung dahinter: Das Anruf-Protokoll war dann schon gespeichert und die
     * Abläufe zu „Nicht erreicht" schon angestoßen, das Fenster blieb aber
     * wegen der Aufgabe offen. Ein zweiter Klick auf „Speichern" legte alles
     * ein zweites Mal an.
     */
    const legtFolgeaufgabeAn = art !== "aufgabe" && followupTaskOpen;
    if (legtFolgeaufgabeAn) {
      const fehltF = ersteLuecke([
        [followupTitel.trim(), "einen Titel für die Folgeaufgabe"],
        [followupFaellig, "ein Datum für die Folgeaufgabe"],
        [followupUhrzeit, "eine Uhrzeit für die Folgeaufgabe"],
        [followupPrio, "eine Priorität für die Folgeaufgabe"],
        [followupZugewiesen.trim(), "einen Empfänger für die Folgeaufgabe"],
        [
          investmentsDesKunden.length === 0 ? "ok" : investmentId || bgInvestmentId,
          "die Zuordnung der Folgeaufgabe zum Investment",
        ],
      ]);
      if (fehltF) { toast({ title: `Bitte ${fehltF} angeben`, variant: "destructive" }); return; }
      if (!istTerminInZukunft(followupFaellig, followupUhrzeit)) {
        toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
        return;
      }
    }

    switch (art) {
      case "notiz": {
        if (!beschreibung.trim()) { toast({ title: "Bitte Notiz eingeben", variant: "destructive" }); return; }
        addMitVerfasser({ kundeId, art: "notiz", beschreibung: beschreibung.trim(), details: details.trim() || undefined });
        toast({ title: "Notiz gespeichert ✓", description: `Für ${kundeName}` });
        break;
      }
      case "anruf": {
        // Ohne Nummer gibt es nichts zu wählen und nichts zu vermerken.
        if (!kundeTelefon?.trim()) { toast({ title: "Keine Nummer hinterlegt", variant: "destructive" }); return; }
        // Wählen und im Verlauf vermerken laufen über dieselbe Stelle wie
        // jeder andere Klick auf eine Kundennummer.
        starteAnrufFuerKontakt(kundeId, kundeTelefon, "Schnellaktion", user.name);
        toast({ title: "Anruf gestartet", description: kundeTelefon });
        break;
      }
      case "email": {
        // Open native mail client directly – ohne Betreff/Nachricht-Vorbelegung
        window.open(`mailto:${kundeEmail}`, "_self");
        addMitVerfasser({
          kundeId, art: "email",
          beschreibung: `E-Mail geschrieben an ${kundeName}`,
          details: `Gesendet an ${kundeEmail}`,
        });
        toast({ title: "E-Mail-Programm geöffnet", description: `An ${kundeEmail}` });
        break;
      }
      case "aufgabe": {
        // Die Beschreibung ist optional. Termin, Empfänger und Titel bleiben
        // Pflicht, sonst erscheint die Aufgabe in der Pipeline gar nicht.
        const fehlt = ersteLuecke([
          [titel.trim(), "einen Titel"],
          [faelligAm, "ein Fälligkeitsdatum"],
          [uhrzeit, "eine Uhrzeit"],
          [prioritaet, "eine Priorität"],
          [zugewiesenAnId || zugewiesenAn.trim(), "einen Empfänger"],
          [investmentsDesKunden.length === 0 ? "ok" : investmentId, "die Zuordnung zum Investment"],
        ]);
        if (fehlt) { toast({ title: `Bitte ${fehlt} angeben`, variant: "destructive" }); return; }
        if (!istTerminInZukunft(faelligAm, uhrzeit)) {
          toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
          return;
        }
        addMitVerfasser({
          kundeId, art: "aufgabe",
          beschreibung: titel.trim(),
          details: beschreibung.trim() || undefined,
          prioritaet, faelligAm, uhrzeit,
          zugewiesenAn: zugewiesenAn.trim(),
        });
        // Die Aufgabe hängt am Kunden und trägt einen Empfänger. Damit sieht
        // sie jeder, der auf denselben Kunden schaut, und die Zuweisung wirkt.
        void addAufgabe({
          kontaktId: kundeId,
          investmentId: investmentId && investmentId !== "__allgemein__" ? investmentId : undefined,
          typ: "aufgabe",
          prioritaet,
          titel: titel.trim(),
          beschreibung: beschreibung.trim() || `Aufgabe für ${kundeName}`,
          faelligAm,
          uhrzeit,
          zugewiesenAn: zugewiesenAnId || undefined,
          erstelltVonName: berater,
        });
        toast({
          title: "Aufgabe erstellt ✓",
          description: zugewiesenAnId
            ? `${titel} – zugewiesen an ${zugewiesenAn}.`
            : `${titel} – in Inbox und Timeline. Bitte prüfen: Ist die Pipeline-Stufe noch korrekt?`,
          duration: 6000,
        });
        break;
      }
      case "meeting": {
        const fehltM = ersteLuecke([
          [titel.trim(), "einen Titel"],
          // Die Beschreibung ist laut Beschriftung optional und wird ueberall
          // mit "|| undefined" behandelt. Als Pflichtfeld stand sie nur hier.
          [faelligAm, "ein Datum"],
          [uhrzeit, "eine Uhrzeit"],
          [prioritaet, "eine Priorität"],
          [teilnehmer.trim(), "die Teilnehmer"],
          // Beim Videoraum bestimmt das Ereignis Dauer und Warteraum. Gibt es
          // Terminarten, muss eine gewaehlt sein, sonst liefe der Termin
          // stillschweigend mit 60 Minuten und dem Beratungs-Warteraum.
          [videoWeg === "videoraum" && terminarten.length > 0 ? festTerminartId : "ok", "ein Ereignis"],
          [videoWeg === "vor_ort" ? treffpunkt.trim() : "ok", "den Treffpunkt für das Treffen vor Ort"],
          // Eine angefangene Gastzeile ohne Mail waere eine Einladung ins Leere.
          [gaeste.some((g) => (g.name.trim() || g.email.trim()) && !/^\S+@\S+\.\S+$/.test(g.email.trim())) ? "" : "ok", "für jeden Gast eine gültige E-Mail-Adresse"],
          [investmentsDesKunden.length === 0 ? "ok" : investmentId, "die Zuordnung zum Investment"],
        ]);
        if (fehltM) { toast({ title: `Bitte ${fehltM} angeben`, variant: "destructive" }); return; }
        /*
         * Der Termin muss in der Zukunft liegen, gerechnet in Berliner Zeit.
         *
         * `meetingZeitInZukunft` benutzt dieselbe Umrechnung wie das Speichern
         * und damit dieselbe Zeitzone wie `meeting_anlegen` in der Datenbank.
         * Geprüft wird hier beim Absenden, also mit der Uhrzeit von jetzt und
         * nicht mit der vom Öffnen des Dialogs.
         */
        if (!meetingZeitInZukunft(faelligAm, uhrzeit)) {
          toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
          return;
        }

        /*
         * Beim eigenen Videoraum entsteht der Link erst hier. Er wird danach
         * wie jeder Meeting-Link behandelt: Er steht in der Aktivitaet, in der
         * Aufgabe und in der Einladung an den Kunden. Damit muss an den
         * nachgelagerten Stellen nichts angepasst werden.
         */
        // Die gewaehlte Terminart liefert Dauer und Warteraum-Anlass. Einmal
        // nachgeschlagen, damit Raum und E-Mail-Einladung dieselbe Dauer
        // verwenden.
        const gewaehlteTerminart = terminarten.find((t) => t.id === festTerminartId);

        if (videoWeg === "videoraum" && gaeste.filter((g) => g.email.trim()).length > 2) {
          toast({ title: "Höchstens zwei zusätzliche Gäste", description: "Mit dir und dem Kunden sind maximal vier Personen möglich.", variant: "destructive" });
          return;
        }
        const raumEntwurf = videoWeg === "videoraum" ? {
          token: meetingVersuch.current.token, art: raumArt,
          gastgeber: ((b) => ({ name: b.name, position: b.position, telefon: b.telefon, email: b.email, bild: b.bild ?? null, zitat: getUserSetting<{ zitat?: string } | null>("videocall", null)?.zitat }))(ladeBerater()),
          hinweis: beschreibung.trim() || null,
        } : undefined;
        let besprechungsLink = raumEntwurf ? raumUrl(raumEntwurf.token) : "";
        // Wie das Treffen stattfindet, gehoert in Verlauf, Aufgabe und Mail.
        const treffenHinweis =
          videoWeg === "vor_ort" && treffpunkt.trim()
            ? `Treffpunkt: ${treffpunkt.trim()}`
            : videoWeg === "telefon"
              ? "Telefontermin, der Berater ruft an"
              : "";
        const echteGaeste = gaeste.filter((g) => g.email.trim());
        // Investment als lesbare Zeile in den Details: Die Aktivitaeten-Tabelle
        // hat keine Investment-Spalte, die Termin-Karte liest die Zeile aus.
        const gewaehltesInvestment = investmentId && investmentId !== "__allgemein__"
          ? investmentsDesKunden.find((inv: { id: string }) => inv.id === investmentId) as
            { label?: string; objektName?: string } | undefined
          : undefined;
        const investmentHinweis = gewaehltesInvestment
          ? `Investment: ${gewaehltesInvestment.label || gewaehltesInvestment.objektName || "Investment"}`
          : "";
        const gaesteHinweis = echteGaeste.length > 0
          ? `Gäste: ${echteGaeste.map((g) => `${g.name.trim() || "Gast"} <${g.email.trim()}>`).join(", ")}`
          : "";

        besprechungsLink = await speichereMeeting(meetingVersuch.current.id, {
          von: user.name,
          kundeId, art: "meeting",
          beschreibung: titel.trim(),
          details: [beschreibung.trim(), treffenHinweis, gaesteHinweis, investmentHinweis].filter(Boolean).join("\n") || undefined,
          prioritaet, faelligAm, uhrzeit, teilnehmer,
          // Die Dauer des gewaehlten Ereignisses, damit die Termin-Karte sie
          // anzeigen kann. 60 ist der Standard ohne Ereignis.
          dauer: String(gewaehlteTerminart?.dauer_minuten ?? 60),
          zoomLink: besprechungsLink || undefined,
        }, {
          kontaktId: kundeId,
          investmentId: investmentId && investmentId !== "__allgemein__" ? investmentId : undefined,
          typ: "meeting",
          prioritaet,
          titel: titel.trim(),
          beschreibung: [
            beschreibung.trim() || `Meeting mit ${kundeName}`,
            treffenHinweis,
            gaesteHinweis,
            besprechungsLink ? `Videoraum: ${besprechungsLink}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          faelligAm,
          uhrzeit,
          erstelltVonName: user.name,
        }, raumEntwurf, {
          empfaenger: [...(emailEinladung && kundeEmail ? [{ name: kundeName, email: kundeEmail }] : []), ...echteGaeste],
          modus: videoWeg === "vor_ort" ? "vor_ort" : videoWeg === "telefon" ? "telefon" : "video",
          treffpunkt: videoWeg === "vor_ort" ? treffpunkt.trim() : undefined,
        });
        // Sagt der Ergebnis-Karte im Profil sofort Bescheid. Wichtig fuer den
        // Testkonto-Modus: Dort schreibt addAktivitaet nur in localStorage,
        // der Datenzwischenspeicher bekommt nichts mit.
        window.dispatchEvent(new CustomEvent(TERMINE_AKTUALISIERT_EVENT));
        // Die Einladung wurde bisher nur als Aktivität protokolliert. Der
        // Hinweis sagte "Einladung an ..." und es ging nie eine Mail raus.
        // Jetzt wird sie wirklich verschickt, mit Kalendereintrag zum
        // Hinzufügen.
        if (emailEinladung && kundeEmail) {
          // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie
          // gewählt (Plan Kundensprache 2.4). Nur für den Kunden, nicht für Gäste.
          await stelleKundenspracheSicher(kundeId);
          await versendeMeetingEinladung({
            meetingId: meetingVersuch.current.id,
            kundeId,
            kundeName,
            kundeEmail,
            berater: user.name,
            beraterId: authUser?.id,
            titel: titel.trim(),
            agenda: beschreibung.trim(),
            datum: faelligAm,
            uhrzeit,
            meetingLink: besprechungsLink,
            // Ohne diese Angabe rechnete die Einladung immer mit 60 Minuten,
            // auch wenn das gewaehlte Ereignis kuerzer oder laenger dauert.
            dauerMinuten: gewaehlteTerminart?.dauer_minuten,
            modus: videoWeg === "videoraum" ? "video"
              : videoWeg === "vor_ort" ? "vor_ort"
              : videoWeg === "telefon" ? "telefon"
              : undefined,
            treffpunkt: videoWeg === "vor_ort" ? treffpunkt.trim() : undefined,
            kundeTelefon: videoWeg === "telefon" ? (kundeTelefon || undefined) : undefined,
          }).then((erfolg) => {
            /*
             * Was der Vertriebspartner im Verlauf liest.
             *
             * Vorher stand dort "Meeting-Einladung an ... zum Versand
             * angenommen". Das ist die Sprache des Maildienstes und nicht die
             * des Lesers: Er will wissen, ob die Einladung heraus ist, und
             * nicht, in welchem Zustand sich eine Warteschlange befindet.
             *
             * Die Art des Termins steht jetzt mit drin. "Einladung zum
             * Telefontermin" sagt beim Ueberfliegen mehr als "Meeting", und
             * der Verlauf zeigt fuer alle drei Arten dieselbe Zeile, wenn man
             * sie nicht unterscheidet.
             */
            const artText = videoWeg === "vor_ort" ? "zum Vor-Ort-Termin"
              : videoWeg === "telefon" ? "zum Telefontermin"
              : "zum Videogespräch";
            addMitVerfasser({
              kundeId,
              art: "email",
              beschreibung: erfolg
                ? `Einladung ${artText} verschickt an ${kundeName}`
                : `Einladung ${artText} an ${kundeName} konnte nicht verschickt werden`,
              // Vorher stand hier zoomLink: beim Videoraum war das Feld leer
              // und der verschickte Link fehlte im Verlauf.
              details: `Termin: ${faelligAm} um ${uhrzeit} Uhr${besprechungsLink ? `\nVideoraum: ${besprechungsLink}` : ""}`,
            });
            if (!erfolg) {
              toast({
                title: "Einladung nicht versendet",
                description: "Das Meeting ist gespeichert, die E-Mail konnte nicht zugestellt werden.",
                variant: "destructive",
              });
            }
          });
        }
        if (echteGaeste.length > 0) {
          await versendeGastEinladungen(echteGaeste, {
            meetingId: meetingVersuch.current.id,
            kundeId,
            berater: user.name,
            beraterId: authUser?.id,
            titel: titel.trim(),
            agenda: beschreibung.trim(),
            datum: faelligAm,
            uhrzeit,
            meetingLink: besprechungsLink,
            dauerMinuten: gewaehlteTerminart?.dauer_minuten,
            modus: videoWeg === "videoraum" ? "video"
              : videoWeg === "vor_ort" ? "vor_ort"
              : videoWeg === "telefon" ? "telefon"
              : undefined,
            treffpunkt: videoWeg === "vor_ort" ? treffpunkt.trim() : undefined,
            // Bewusst ohne die Kundennummer: Der Anruf-Hinweis der Gast-Mail
            // bleibt allgemein, die Nummer des Kunden geht Gaeste nichts an.
          }).then(({ gesendet, fehlgeschlagen }) => {
            if (gesendet.length > 0) {
              addMitVerfasser({
                kundeId,
                art: "email",
                beschreibung: `Gast-Einladungen versendet (${gesendet.length})`,
                details: gesendet.map((g) => `${g.name || "Gast"} <${g.email}>`).join("\n"),
              });
            }
            if (fehlgeschlagen.length > 0) {
              toast({
                title: `${fehlgeschlagen.length} Gast-Einladung${fehlgeschlagen.length === 1 ? "" : "en"} nicht versendet`,
                description: fehlgeschlagen.map((g) => g.email).join(", "),
                variant: "destructive",
              });
            }
          });
        }
        toast({
          title: "Meeting erstellt ✓",
          description:
            emailEinladung && kundeEmail
              ? `${titel} – Einladung verarbeitet für ${kundeEmail}${echteGaeste.length > 0 ? ` und ${echteGaeste.length} Gast${echteGaeste.length === 1 ? "" : "e"}` : ""}`
              : echteGaeste.length > 0
                ? `${titel} – Einladungen verarbeitet für ${echteGaeste.length} Gast${echteGaeste.length === 1 ? "" : "e"}`
                : `${titel} – ohne E-Mail-Einladung`,
        });
        break;
      }
      case "anruf_protokoll": {
        // Die Dauer ist bewusst kein Pflichtfeld. Wer niemanden erreicht hat,
        // hat keine Gesprächsdauer, und eine erfundene Zahl waere schlechter
        // als gar keine.
        /*
         * Das Ergebnis ist immer Pflicht, die Zusammenfassung nur, wenn ein
         * Gespraech stattfand (siehe `zusammenfassungIstPflicht`).
         *
         * Wer jemanden nicht erreicht hat, hat nichts zusammenzufassen, und
         * ein Pflichtfeld an dieser Stelle fuehrt dazu, dass "kA" oder ein
         * Punkt darin steht. Die Historie bekommt dann das Ergebnis als Text,
         * siehe unten. Wer aber gesprochen hat, muss festhalten, was dabei
         * herauskam, sonst geht die Dokumentation unter (Christian,
         * 26.09.2026).
         */
        if (!ergebnis) { toast({ title: "Bitte das Ergebnis angeben", variant: "destructive" }); return; }
        if (zusammenfassungIstPflicht(ergebnis) && !beschreibung.trim()) {
          toast({ title: "Bitte kurz zusammenfassen, was besprochen wurde", variant: "destructive" });
          return;
        }
        if (ergebnis === "beratungsgespraech_vereinbart" && !bgViaBuchungskalender) {
          toast({
            title: "Bitte Buchungskalender-Hinweis bestätigen",
            description: "Nur über den Buchungskalender bekommt der Kunde die Terminbestätigung samt Meeting-Link automatisch.",
            variant: "destructive",
          });
          return;
        }
        // Vereinbarte Termine muessen in der Zukunft liegen. Die Felder sind
        // optional, geprueft wird nur, wenn ein Datum eingetragen wurde.
        if (ergebnis === "erstgespraech_vereinbart" && egDatum && !istTerminInZukunft(egDatum, egUhrzeit)) {
          toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
          return;
        }
        if (ergebnis === "beratungsgespraech_vereinbart" && bgDatum && !istTerminInZukunft(bgDatum, bgUhrzeit)) {
          toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
          return;
        }
        addMitVerfasser({
          kundeId, art: "anruf_protokoll",
          /*
           * Fehlt die Zusammenfassung, steht das Ergebnis in der Historie.
           * Sonst stuende dort "Anruf mit Max Muster:" und danach nichts, und
           * niemand koennte spaeter sagen, was der Anruf ergeben hat.
           */
          beschreibung: beschreibung.trim()
            ? `Anruf mit ${kundeName}: ${beschreibung.trim()}`
            : `Anruf mit ${kundeName}: ${ERGEBNIS_TEXT[ergebnis] || ergebnis}`,
          details: details.trim() || undefined,
          // Ohne Gespräch keine Dauer, damit in der Historie keine leere
          // oder alte Angabe steht.
          dauer: gespraechFandStatt ? dauer.trim() : "",
          ergebnis,
        });
        // Parent-Callback: startet spezielle Logik (Wartezeit, Verloren-Mail, BG-Booking, …)
        try {
          onProtokollResult?.({
            ergebnis,
            zusammenfassung: beschreibung.trim(),
            investmentId: ergebnis === "beratungsgespraech_vereinbart" ? bgInvestmentId : undefined,
            datum: ergebnis === "beratungsgespraech_vereinbart" ? bgDatum
              : ergebnis === "erstgespraech_vereinbart" ? egDatum : undefined,
            uhrzeit: ergebnis === "beratungsgespraech_vereinbart" ? bgUhrzeit
              : ergebnis === "erstgespraech_vereinbart" ? egUhrzeit : undefined,
            eigeneAufgabe: legtFolgeaufgabeAn,
          });
        } catch (e) { console.warn("onProtokollResult failed", e); }
        toast({ title: "Anruf protokolliert ✓" });
        break;
      }
      case "meeting_protokoll": {
        if (!beschreibung.trim()) { toast({ title: "Bitte Zusammenfassung eingeben", variant: "destructive" }); return; }
        addMitVerfasser({
          kundeId, art: "meeting_protokoll",
          beschreibung: `Meeting mit ${kundeName}: ${beschreibung.trim()}`,
          details: details.trim() || undefined,
          teilnehmer, dauer,
        });
        toast({ title: "Meeting protokolliert ✓" });
        break;
      }
    }

    if (legtFolgeaufgabeAn) {
      addMitVerfasser({
        kundeId, art: "aufgabe",
        beschreibung: followupTitel.trim(),
        details: followupBeschreibung.trim() || undefined,
        prioritaet: followupPrio,
        faelligAm: followupFaellig,
        uhrzeit: followupUhrzeit,
        zugewiesenAn: followupZugewiesen.trim(),
      });
      void addAufgabe({
        kontaktId: kundeId,
        // Die Auswahl im Aufgabenblock zählt zuerst. Vorher gewann das
        // Investment des Beratungsgesprächs, das beim Anruf-Protokoll immer
        // vorbelegt ist; eine andere Wahl im Aufgabenblock lief damit ins
        // Leere.
        investmentId: (investmentId && investmentId !== "__allgemein__" ? investmentId : undefined) || bgInvestmentId || undefined,
        typ: "aufgabe",
        prioritaet: followupPrio,
        titel: followupTitel.trim(),
        beschreibung: followupBeschreibung.trim() || `Aufgabe für ${kundeName}`,
        faelligAm: followupFaellig,
        uhrzeit: followupUhrzeit,
        erstelltVonName: berater,
      });
      toast({ title: "Aufgabe erstellt ✓", description: followupTitel });
    }
    setFollowupTaskOpen(false);
    setFollowupTitel(""); setFollowupBeschreibung("");
    followupTerminManuell.current = false;

    reset({ clearDraft: true });
    onSaved();
    onClose();
    meetingVersuch.current = { id: crypto.randomUUID(), token: terminToken("meeting") };
    } catch (e) {
      toast({ title: "Nicht vollständig gespeichert", description: (e as Error)?.message || "Bitte erneut versuchen. Es wurden noch keine Einladungen versendet.", variant: "destructive" });
    } finally {
      speichernLaeuft.current = false;
      setSpeichertMeeting(false);
    }
  };

  if (!art) return null;

  const TITLES: Record<string, string> = {
    notiz: "📝 Notiz erstellen",
    anruf: "📞 Anruf tätigen",
    email: "✉️ E-Mail schreiben",
    aufgabe: "☑️ Aufgabe erstellen",
    meeting: "📅 Meeting erstellen",
    anruf_protokoll: "📋 Anruf protokollieren",
    meeting_protokoll: "👥 Meeting protokollieren",
  };

  return (
    <Dialog modal={false} open={!!art} onOpenChange={(open) => {
      if (!open) {
        if (speichernLaeuft.current) return;
        /*
         * Nach einem gestarteten Anruf nicht kommentarlos schließen.
         *
         * Christian, 26.09.2026: Sonst geht die Dokumentation unter. Wer
         * trotzdem schließt, darf das, zum Beispiel wenn er sich verwählt hat.
         * Getippter Text bleibt als Entwurf liegen wie bei jedem anderen
         * Schließen.
         */
        if (art === "anruf_protokoll" && anrufGestartet) {
          void confirmDialog({
            title: "Anruf ohne Protokoll schließen?",
            description: "Du hast gerade angerufen. Ohne Protokoll steht nirgends, was dabei herausgekommen ist, und bei „Nicht erreicht“ laufen Wartezeit und Wiedervorlage nicht an.",
            confirmText: "Ohne Protokoll schließen",
            cancelText: "Weiter protokollieren",
          }).then((ok) => { if (ok) onClose(); });
          return;
        }
        const hasContent = !!(beschreibung || details || titel || betreff || emailInhalt);
        if (hasContent) {
          /*
           * Das Fenster wird von außen über `art` offen gehalten. Solange
           * `onClose` nicht läuft, bleibt es also stehen, und die Rückfrage
           * darf sich in Ruhe beantworten lassen.
           */
          void confirmDialog({
            title: "Fenster schließen und als Entwurf behalten?",
            description: "Der getippte Text wird zwischengespeichert und steht beim nächsten Öffnen wieder da.",
            confirmText: "Schließen",
            cancelText: "Weiterschreiben",
          }).then((ok) => { if (ok) onClose(); });
          return;
        }
        // Close without clearing draft – will be restored next time
        onClose();
      }
    }}>
      <DialogContent
        overlayClassName={NUR_POPUP_OVERLAY}
        // Der Meeting-Dialog traegt die Linkliste mit Adresse, Schaltern und
        // Knoepfen. In max-w-lg lief die ueber und musste seitlich gescrollt
        // werden, deshalb bekommt er mehr Breite als die uebrigen Aktionen.
        className={`${art === "meeting" ? "sm:max-w-3xl" : "max-w-lg"} max-h-[85vh] overflow-y-auto overflow-x-hidden shadow-2xl border-border`}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{TITLES[art]}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Kunde: {kundeName}</DialogDescription>
        </DialogHeader>

        {/* min-w-0: Als Rasterkind richtet sich der Inhalt sonst an der laengsten ungebrochenen Zeile aus und laeuft seitlich ueber. */}
        <div className="min-w-0 space-y-4 pt-2">
          {/* ── NOTIZ ── */}
          {art === "notiz" && (
            <>
              <div>
                <Label className="text-sm font-medium">Notiz</Label>
                <Textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Was möchtest du festhalten?" className="mt-1" rows={4} autoFocus />
              </div>
              <div>
                <Label className="text-sm font-medium">Zusätzliche Details (optional)</Label>
                <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Weitere Infos..." className="mt-1" rows={2} />
              </div>
            </>
          )}

          {/* ── ANRUF ── */}
          {art === "anruf" && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center">
                <Phone className="h-8 w-8" style={{ color: "hsl(var(--success))" }} />
              </div>
              <div>
                <p className="text-lg font-bold">{kundeName}</p>
                <p className="text-muted-foreground">{kundeTelefon || "Keine Nummer hinterlegt"}</p>
              </div>
              <p className="text-sm text-muted-foreground">Klicke auf „Jetzt anrufen" um den Anruf über dein Gerät zu starten.</p>
            </div>
          )}

          {/* ── EMAIL ── */}
          {art === "email" && (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Dein E-Mail-Programm wird geöffnet. Der Vorgang wird automatisch als „E-Mail geschrieben" in den Aktivitäten protokolliert.
              </p>
              <div>
                <Label className="text-sm font-medium">An</Label>
                <Input value={kundeEmail} disabled className="mt-1 bg-muted" />
              </div>
            </>
          )}

          {/* ── AUFGABE ── */}
          {art === "aufgabe" && (
            <>
              <div>
                <Label className="text-sm font-medium">Titel der Aufgabe</Label>
                <Input value={titel} onChange={e => setTitel(e.target.value)} placeholder="z.B. Unterlagen nachfassen" className="mt-1" autoFocus />
              </div>
              <div>
                <Label className="text-sm font-medium">Beschreibung (optional)</Label>
                <Textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Details zur Aufgabe..." className="mt-1" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Priorität *</Label>
                  <Select value={prioritaet} onValueChange={(v) => setPrioritaet(v as any)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="niedrig">Niedrig</SelectItem>
                      <SelectItem value="mittel">Mittel</SelectItem>
                      <SelectItem value="hoch">Hoch</SelectItem>
                      <SelectItem value="dringend">Dringend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Fällig am</Label>
                  <DateInput ariaLabel="Datum" value={faelligAm} onChange={v => setFaelligAm(v)} className="mt-1" minDate={heuteIso()} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Uhrzeit * (Berlin)</Label>
                  <Input aria-label="Uhrzeit" type="time" value={uhrzeit} onChange={e => setUhrzeit(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Zugewiesen an *</Label>
                  {/* Auswahl statt Freitext: Nur so landet die Aufgabe wirklich
                      in der Inbox des Empfängers. */}
                  <select
                    value={zugewiesenAnId}
                    onChange={e => {
                      setZugewiesenAnId(e.target.value);
                      const gewaehlt = interneNutzer.find(u => u.id === e.target.value);
                      setZugewiesenAn(gewaehlt?.name || berater);
                    }}
                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Mir selbst</option>
                    {interneNutzer
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}{u.rolle ? ` · ${u.rolle}` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <InvestmentAuswahl
                investments={investmentsDesKunden}
                wert={investmentId}
                setzen={setInvestmentId}
              />
            </>
          )}

          {/* ── MEETING ── */}
          {art === "meeting" && kundeWaehltMoeglich && (
            <div className="grid grid-cols-2 gap-2">
              {([["fest", "Termin festlegen", "Du bestimmst Datum und Uhrzeit"],
                 ["kunde", "Kunde wählt selbst", "Er sucht sich eine freie Zeit aus"]] as const).map(([wert, titelText, unter]) => (
                <button
                  key={wert}
                  type="button"
                  aria-pressed={terminModus === wert}
                  onClick={() => setTerminModus(wert)}
                  className={`rounded-xl border p-2.5 text-left text-sm transition-colors ${terminModus === wert ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <span className="font-medium">{titelText}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{unter}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── MEETING: Kunde bucht selbst ── */}
          {art === "meeting" && kundeWaehltMoeglich && terminModus === "kunde" && (
            <>
              <div>
                <Label className="text-sm font-medium">Wofür soll der Link gelten?</Label>
                {terminarten.length === 0 ? (
                  <p className="mt-1.5 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Es gibt noch keine Terminart. Lege unter Videocall, Buchungen eine an, sonst
                    weiß der Kunde nicht, was er buchen soll.
                  </p>
                ) : (
                  <Select value={terminartId} onValueChange={setTerminartId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Terminart wählen" /></SelectTrigger>
                    <SelectContent>
                      {terminarten.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.bezeichnung} · {a.dauer_minuten} Min.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {investmentsDesKunden.length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Zu welchem Investment gehört der Termin?</Label>
                  <Select value={linkInvestmentId} onValueChange={setLinkInvestmentId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Investment wählen" /></SelectTrigger>
                    <SelectContent>
                      {investmentsDesKunden.map((inv: { id: string; label?: string; objektName?: string }) => (
                        <SelectItem key={inv.id} value={inv.id}>{inv.label || inv.objektName || "Investment"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-medium">Nur einmal buchbar</p>
                  <p className="text-xs text-muted-foreground">
                    Der Link ist verbraucht, sobald der Kunde einen Termin gebucht hat.
                  </p>
                </div>
                <Switch checked={linkEinmalig} onCheckedChange={setLinkEinmalig} />
              </div>

              <div>
                <Label className="text-sm font-medium">Gültig bis</Label>
                <Select value={linkGueltigTage} onValueChange={setLinkGueltigTage}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Unbegrenzt</SelectItem>
                    <SelectItem value="7">7 Tage</SelectItem>
                    <SelectItem value="14">14 Tage</SelectItem>
                    <SelectItem value="30">30 Tage</SelectItem>
                    <SelectItem value="90">90 Tage</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
                Der Link gilt nur für {kundeName}. Sobald gebucht wird, entsteht automatisch der
                Termin in dieser Akte und ein Videoraum, den der Kunde betreten kann. Du kannst
                den Link auch selbst öffnen und den Termin gemeinsam mit dem Kunden am Telefon
                oder im Gespräch aussuchen.
              </div>

              <Button
                onClick={() => void legeLinkAn()}
                disabled={legtLinkAn || terminarten.length === 0}
                className="w-full gap-2"
              >
                <Link className="h-4 w-4" />
                {legtLinkAn ? "Wird erstellt…" : "Buchungslink erstellen & kopieren"}
              </Button>

              {links.length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Bereits vergebene Links</Label>
                  <div className="mt-1.5 space-y-2">
                    {links.map((l) => {
                      const adresse = linkAdresse(l);
                      const artName = terminarten.find((a) => a.id === l.terminart_id)?.bezeichnung;
                      return (
                        /*
                         * Zwei Zeilen statt einer: oben die Adresse mit dem
                         * Schalter, darunter die Knoepfe mit Umbruch. Vorher
                         * stand alles nebeneinander und lief seitlich ueber.
                         */
                        <div key={l.id} className="rounded-xl border border-border p-2.5">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-xs ${l.aktiv ? "" : "text-muted-foreground line-through"}`}>
                                {adresse}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {artName ? `${artName} · ` : ""}
                                {new Date(l.created_at).toLocaleDateString("de-DE")}
                                {l.einmalig ? " · einmalig" : ""}
                                {l.gueltig_bis
                                  ? ` · gültig bis ${new Date(l.gueltig_bis).toLocaleDateString("de-DE")}`
                                  : ""}
                                {l.aktiv ? "" : " · abgeschaltet"}
                              </p>
                            </div>
                            {/* Abschalten macht den Link sofort ungültig, ohne ihn zu löschen. */}
                            <Switch
                              checked={l.aktiv}
                              onCheckedChange={(an) => void wechsleLink(l, an)}
                              aria-label={l.aktiv ? "Link abschalten" : "Link wieder anschalten"}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {/* Selbst oeffnen: den Termin gemeinsam mit dem Kunden aussuchen. */}
                            {l.aktiv && (
                              <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild title="Buchungsseite öffnen und gemeinsam einen Termin aussuchen">
                                <a href={adresse} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" /> Öffnen
                                </a>
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!l.aktiv}
                              onClick={() => {
                                void navigator.clipboard.writeText(adresse).then(
                                  () => toast({ title: "Link kopiert ✓" }),
                                  () => toast({ title: "Der Link konnte nicht kopiert werden", variant: "destructive" }),
                                );
                              }}
                            >
                              Kopieren
                            </Button>
                            {/*
                              Versendet direkt, kein mailto mehr. Die Vorlage
                              passt zum Anlass der Terminart, siehe
                              buchungslinkMail.ts. Ohne E-Mail-Adresse gibt es
                              den Knopf nicht.
                            */}
                            {kundeEmail && l.aktiv && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                disabled={sendetMailFuerLink === l.id}
                                onClick={() => void sendeLinkMail(l)}
                              >
                                <Send className="h-3.5 w-3.5" />
                                {sendetMailFuerLink === l.id ? "Wird gesendet…" : "An Kunden senden"}
                              </Button>
                            )}
                            {kundeEmail && l.aktiv && <KundenspracheHinweis kontaktId={kundeId} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── MEETING: Termin festlegen ── */}
          {art === "meeting" && terminModus === "fest" && (
            <>
              <BuchungskalenderListe
                links={eigeneKalender}
                laedt={kalenderLaedt}
                kontaktId={kundeId}
                kontaktName={kundeName}
                kontaktEmail={kundeEmail || undefined}
                investmentId={investmentId || linkInvestmentId || null}
              />

              <div>
                <Label htmlFor="meeting-titel" className="text-sm font-medium">Meeting-Titel</Label>
                <Input id="meeting-titel" aria-label="Meeting-Titel" value={titel} onChange={e => setTitel(e.target.value)} placeholder="z.B. Objektvorstellung mit Kunden" className="mt-1" autoFocus />
              </div>
              <div>
                <Label className="text-sm font-medium">Beschreibung (optional)</Label>
                <Textarea aria-label="Beschreibung des Meetings" value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Agenda…" className="mt-1" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Datum *</Label>
                  {/* Kein Tag vor heute. „Heute" ist der Berliner Tag, nicht der
                      des Geräts, damit der Kalender dasselbe erlaubt wie die
                      Datenbank. */}
                  <DateInput ariaLabel="Datum" value={faelligAm} onChange={v => setFaelligAm(v)} className="mt-1" minDate={meetingHeute} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Uhrzeit * (Berlin)</Label>
                  {/* Am heutigen Tag erst ab jetzt. An einem späteren Tag ist
                      jede Uhrzeit erlaubt, dann steht kein `min`. */}
                  <Input
                    aria-label="Uhrzeit"
                    type="time"
                    value={uhrzeit}
                    onChange={e => setUhrzeit(e.target.value)}
                    className="mt-1"
                    min={faelligAm === meetingHeute ? meetingJetztUhr : undefined}
                  />
                </div>
              </div>
              {meetingZeitVorbei && (
                <p className="text-sm text-destructive" role="alert">
                  {TERMIN_ZUKUNFT_MELDUNG}. Heute geht es ab {meetingJetztUhr} Uhr.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Priorität *</Label>
                  <Select value={prioritaet} onValueChange={(v) => setPrioritaet(v as any)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="niedrig">Niedrig</SelectItem>
                      <SelectItem value="mittel">Mittel</SelectItem>
                      <SelectItem value="hoch">Hoch</SelectItem>
                      <SelectItem value="dringend">Dringend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Teilnehmer *</Label>
                  <Input aria-label="Teilnehmer" value={teilnehmer} onChange={e => setTeilnehmer(e.target.value)} placeholder="Namen kommagetrennt" className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Gäste einladen (optional)
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Jeder Gast bekommt seine eigene Einladung per E-Mail, auch ohne Eintrag im CRM.
                  Die Mail enthält nur Termin und Zugang, keine Kundendaten.
                </p>
                <div className="mt-1.5 space-y-2">
                  {gaeste.map((g, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        aria-label={`Name Gast ${i + 1}`}
                        value={g.name}
                        onChange={(e) => setGaeste((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="Name"
                        className="h-9"
                      />
                      <Input
                        aria-label={`E-Mail Gast ${i + 1}`}
                        value={g.email}
                        onChange={(e) => setGaeste((prev) => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                        placeholder="gast@example.com"
                        type="email"
                        className="h-9"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 px-2 text-muted-foreground"
                        onClick={() => setGaeste((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Gast entfernen"
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={videoWeg === "videoraum" && gaeste.length >= 2}
                    onClick={() => setGaeste((prev) => [...prev, { name: "", email: "" }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Gast hinzufügen
                  </Button>
                </div>
                {videoWeg === "videoraum" && gaeste.filter((g) => g.email.trim()).length > 2 && (
                  <p className="mt-1.5 rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-2 text-xs">
                    Am Videogespräch können neben dir höchstens drei Personen teilnehmen. Bitte entferne zusätzliche Gäste, bevor du das Meeting erstellst.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" /> Wie findet das Meeting statt?
                </Label>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {darfVideoraum && (
                    <button
                      type="button"
                      aria-pressed={videoWeg === "videoraum"} onClick={() => setVideoWeg("videoraum")}
                      className={`rounded-xl border p-2.5 text-left text-sm transition-colors ${videoWeg === "videoraum" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        Videoraum
                        <span className="rounded border border-primary/40 bg-primary/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                          Freigegeben
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Eigener Raum, Link entsteht automatisch</span>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={videoWeg === "vor_ort"} onClick={() => setVideoWeg("vor_ort")}
                    className={`rounded-xl border p-2.5 text-left text-sm transition-colors ${videoWeg === "vor_ort" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  >
                    <span className="font-medium">Vor Ort</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Persönliches Treffen mit Adresse</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={videoWeg === "telefon"} onClick={() => setVideoWeg("telefon")}
                    className={`rounded-xl border p-2.5 text-left text-sm transition-colors ${videoWeg === "telefon" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  >
                    <span className="font-medium">Telefon</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Du rufst den Kunden pünktlich an</span>
                  </button>
                </div>

                {videoWeg === "vor_ort" && (
                  <div className="mt-3">
                    <Label className="text-sm font-medium">Treffpunkt (Adresse) *</Label>
                    <Input
                      value={treffpunkt}
                      onChange={(e) => setTreffpunkt(e.target.value)}
                      placeholder="z.B. Am Ostbahnhof 1, 15749 Mittenwalde"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Steht in der Einladung und im Kalendereintrag des Kunden.
                    </p>
                  </div>
                )}

                {videoWeg === "telefon" && (
                  <p className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
                    Der Kunde bekommt in der Einladung den Hinweis, dass Du ihn zum Termin pünktlich
                    unter seiner Nummer{kundeTelefon ? ` (${kundeTelefon})` : ""} anrufst.
                  </p>
                )}

                {videoWeg === "videoraum" && (
                  <div className="mt-3">
                    {/* Beim Videoraum ist das Ereignis Pflicht (bestimmt Titel,
                        Dauer und Warteraum). Vorher fehlte der Stern und der
                        Fehler kam erst beim Absenden. */}
                    <Label className="text-sm font-medium">Ereignis *</Label>
                    {terminarten.length === 0 ? (
                      <p className="mt-1 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                        Es gibt noch keine Terminart. Lege unter Videocall, Buchungskalender
                        eine an, dann erscheint sie hier.
                      </p>
                    ) : (
                      <Select
                        value={festTerminartId}
                        onValueChange={(v) => {
                          setFestTerminartId(v);
                          const gewaehlt = terminarten.find((t) => t.id === v);
                          if (!gewaehlt) return;
                          setRaumArt(anlassZuRaumArt(gewaehlt.anlass));
                          // Der Titel folgt dem Ereignis, solange er nicht von
                          // Hand geaendert wurde.
                          setTitel((alt) =>
                            !alt.trim() || terminarten.some((t) => t.bezeichnung === alt.trim())
                              ? gewaehlt.bezeichnung
                              : alt);
                        }}
                      >
                        <SelectTrigger aria-label="Ereignis" className={`mt-1 ${!festTerminartId ? "border-destructive/60 ring-1 ring-destructive/30" : ""}`}><SelectValue placeholder="Ereignis wählen" /></SelectTrigger>
                        <SelectContent>
                          {terminarten.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.bezeichnung} · {t.dauer_minuten} Min.
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Deine Terminarten aus dem Buchungskalender. Das Ereignis bestimmt Titel,
                      Dauer und was der Kunde im Warteraum sieht. Der Link wird beim Speichern
                      erzeugt und steht danach im Kundenprofil.
                    </p>
                  </div>
                )}
              </div>
              <InvestmentAuswahl
                investments={investmentsDesKunden}
                wert={investmentId}
                setzen={setInvestmentId}
              />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="email-invite" checked={emailEinladung} onChange={e => setEmailEinladung(e.target.checked)} className="rounded" />
                <label htmlFor="email-invite" className="text-sm cursor-pointer">
                  Einladung per E-Mail an <strong>{kundeEmail || "–"}</strong> senden
                </label>
                {emailEinladung && <KundenspracheHinweis kontaktId={kundeId} />}
              </div>
            </>
          )}

          {/* ── ANRUF PROTOKOLL ── */}
          {art === "anruf_protokoll" && (
            <>
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p>📞 Anruf mit <strong>{kundeName}</strong> · {kundeTelefon}</p>
              </div>
              {/* Der Zaehler „x / 15 nicht erreicht" ist entfallen: Es gibt kein
                  Auto-Verloren mehr, und bei mehreren Investments war die Zahl
                  ohnehin nicht eindeutig. Die Historie steht in der Karte
                  „Kontaktversuche". */}
              {/* Erst das Ergebnis, dann die Dauer.
                  Vorher stand die Dauer links daneben und damit als Erstes im
                  Blick. Wer einen Kunden nicht erreicht hatte, sah beim Öffnen
                  trotzdem ein Feld "Dauer" und hielt es für eine Pflichtangabe,
                  obwohl es verschwindet, sobald man "Nicht erreicht" auswählt.
                  Gemeldet über Julian Meyer zum Kunden Max Niedermeyer. */}
              <div className={gespraechFandStatt ? "grid grid-cols-2 gap-3" : ""}>
                <div>
                  <Label htmlFor="anruf-ergebnis" className="text-sm font-medium">Ergebnis <span aria-hidden="true">*</span></Label>
                  <Select value={ergebnis} onValueChange={setzeErgebnis}>
                    <SelectTrigger id="anruf-ergebnis" className="mt-1" aria-required="true"><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ERGEBNIS_TEXT).map(([wert, text]) => (
                        <SelectItem key={wert} value={wert}>{text}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {gespraechFandStatt && (
                  <div>
                    <Label className="text-sm font-medium">
                      Dauer <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input value={dauer} onChange={e => setDauer(e.target.value)} placeholder="z.B. 15 Min." className="mt-1" />
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="anruf-zusammenfassung" className="text-sm font-medium">
                  Zusammenfassung{" "}
                  {zusammenfassungPflicht
                    ? <span aria-hidden="true">*</span>
                    : <span className="font-normal text-muted-foreground">(optional)</span>}
                </Label>
                <Textarea
                  id="anruf-zusammenfassung"
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder={zusammenfassungPflicht
                    ? "Was wurde besprochen? Was hat der Kunde gesagt?"
                    : "Kann leer bleiben, das Ergebnis genügt."}
                  className="mt-1"
                  rows={4}
                  required={zusammenfassungPflicht}
                  aria-required={zusammenfassungPflicht}
                  autoFocus
                />
              </div>
              {ergebnis === "erstgespraech_vereinbart" && (
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-primary">Erstgespräch-Termin</p>
                  {eigenerBuchungslink && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => window.open(eigenerBuchungslink, "_blank")}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      Meinen Erstgesprächs-Kalender öffnen
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Datum</Label>
                      <DateInput value={egDatum} onChange={setEgDatum} className="mt-1" minDate={heuteIso()} />
                    </div>
                    <div>
                      <Label className="text-xs">Uhrzeit</Label>
                      <Input type="time" value={egUhrzeit} onChange={e => setEgUhrzeit(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Trag den Termin hier ein, auch wenn du ihn über den Kalender gebucht hast. Erst dann
                    steht er im System und die Ampel im Profil zeigt „Termin geplant".
                  </p>
                </div>
              )}
              {ergebnis === "beratungsgespraech_vereinbart" && (
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-primary">Beratungsgespräch-Termin</p>
                  {eigenerBeratungslink && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => window.open(eigenerBeratungslink, "_blank")}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      Meinen Beratungs-Kalender öffnen
                    </Button>
                  )}
                  {investmentsForBg.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Kein Investment vorhanden – bitte zuerst ein Investment im Kundenprofil anlegen.
                    </p>
                  ) : (
                    <div>
                      <Label className="text-xs">Investment</Label>
                      <Select value={bgInvestmentId} onValueChange={setBgInvestmentId}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {investmentsForBg.map(inv => (
                            <SelectItem key={inv.id} value={inv.id}>
                              #{inv.nummer} {inv.objektTitel || inv.label || "Investment"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Datum</Label>
                      <DateInput value={bgDatum} onChange={setBgDatum} className="mt-1" minDate={heuteIso()} />
                    </div>
                    <div>
                      <Label className="text-xs">Uhrzeit</Label>
                      <Input type="time" value={bgUhrzeit} onChange={e => setBgUhrzeit(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bgViaBuchungskalender}
                      onChange={e => setBgViaBuchungskalender(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>Pflicht:</strong> Das Beratungsgespräch wurde über meinen eigenen Buchungskalender gebucht. Der Kunde bekommt die Terminbestätigung samt Meeting-Link automatisch per Mail.
                    </span>
                  </label>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">Nächste Schritte (optional)</Label>
                <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Was muss als nächstes passieren?" className="mt-1" rows={2} />
              </div>
            </>
          )}

          {/* ── MEETING PROTOKOLL ── */}
          {art === "meeting_protokoll" && (
            <>
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p>👥 Meeting mit <strong>{kundeName}</strong></p>
              </div>
              <div>
                <Label className="text-sm font-medium">Zusammenfassung</Label>
                <Textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Was wurde besprochen / beschlossen?" className="mt-1" rows={4} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Teilnehmer *</Label>
                  <Input aria-label="Teilnehmer" value={teilnehmer} onChange={e => setTeilnehmer(e.target.value)} placeholder="Namen" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Dauer</Label>
                  <Input value={dauer} onChange={e => setDauer(e.target.value)} placeholder="z.B. 45 Min." className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Nächste Schritte / Action Items</Label>
                <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="To-Dos nach dem Meeting..." className="mt-1" rows={3} />
              </div>
            </>
          )}

          {/* ── Gemeinsame Folge-Aufgabe (bei allen Aktionen außer der reinen Aufgabe) ── */}
          {art !== "aufgabe" && (
            <div className="border-t pt-4">
              {!followupTaskOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setFollowupTaskOpen(true);
                    // Nach einem Anruf ist die Aufgabe fast immer der Rückruf.
                    if (!followupTitel && art === "anruf_protokoll") {
                      setFollowupTitel(`Rückruf: ${kundeName}`);
                    } else if (!followupTitel && (beschreibung.trim() || titel.trim() || betreff.trim())) {
                      const src = beschreibung.trim() || titel.trim() || betreff.trim();
                      setFollowupTitel(`Follow-Up: ${src.slice(0, 60)}`);
                    }
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Aufgabe erstellen
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckSquare className="h-4 w-4" /> Neue Aufgabe (wird zusammen gespeichert)
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setFollowupTaskOpen(false)}
                    >
                      Entfernen
                    </button>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Titel der Aufgabe</Label>
                    <Input aria-label="Titel der Aufgabe" value={followupTitel} onChange={e => setFollowupTitel(e.target.value)} placeholder="z.B. Unterlagen nachfassen" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Beschreibung (optional)</Label>
                    <Textarea value={followupBeschreibung} onChange={e => setFollowupBeschreibung(e.target.value)} placeholder="Details zur Aufgabe..." className="mt-1" rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm font-medium">Priorität *</Label>
                      <Select value={followupPrio} onValueChange={(v) => setFollowupPrio(v as any)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="niedrig">Niedrig</SelectItem>
                          <SelectItem value="mittel">Mittel</SelectItem>
                          <SelectItem value="hoch">Hoch</SelectItem>
                          <SelectItem value="dringend">Dringend</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Fällig am</Label>
                      <DateInput ariaLabel="Fällig am" value={followupFaellig} onChange={v => { if (v !== followupFaellig) followupTerminManuell.current = true; setFollowupFaellig(v); }} className="mt-1" minDate={heuteIso()} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm font-medium">Uhrzeit * (Berlin)</Label>
                      <Input type="time" aria-label="Uhrzeit der Aufgabe" value={followupUhrzeit} onChange={e => { followupTerminManuell.current = true; setFollowupUhrzeit(e.target.value); }} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Zugewiesen an *</Label>
                      <Input value={followupZugewiesen} onChange={e => setFollowupZugewiesen(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  {/* Jede Aufgabe gehört zu einem Investment. Die Auswahl steht
                      deshalb auch hier, damit sie beim Anrufprotokoll nicht
                      fehlt. */}
                  <InvestmentAuswahl
                    investments={investmentsDesKunden}
                    wert={investmentId || bgInvestmentId}
                    setzen={setInvestmentId}
                  />
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          {!(art === "meeting" && terminModus === "kunde") && (
          <Button onClick={() => void handleSave()} className="w-full" disabled={speichertMeeting}>
            {art === "anruf" ? (
              <><Phone className="h-4 w-4 mr-2" /> Jetzt anrufen</>
            ) : art === "email" ? (
              <><Mail className="h-4 w-4 mr-2" /> E-Mail-Programm öffnen</>
            ) : art === "meeting" ? (
              speichertMeeting
                ? <>Meeting wird gespeichert und Einladung verarbeitet…</>
                : <><CalendarDays className="h-4 w-4 mr-2" /> {emailEinladung && kundeEmail ? "Meeting erstellen & einladen" : "Meeting erstellen"}</>
            ) : (
              "Speichern"
            )}
          </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gibt die Bezeichnung des ersten leeren Pflichtfelds zurück, sonst null.
 * So nennt die Meldung genau das Feld, das fehlt, statt nur "Pflichtfeld".
 */
function ersteLuecke(felder: Array<[string | undefined, string]>): string | null {
  for (const [wert, bezeichnung] of felder) {
    if (!wert || !String(wert).trim()) return bezeichnung;
  }
  return null;
}

/**
 * Auswahl, zu welchem Investment eine Aufgabe gehört.
 *
 * Die Pipeline zeigt pro Investment eine eigene Kachel, oft in verschiedenen
 * Stufen. Ohne diese Angabe wüsste das System nicht, auf welcher Kachel der
 * neue Termin stehen soll, und würde ihn auf allen zeigen.
 *
 * Hat der Kunde noch kein Investment, erscheint das Feld nicht. Dann gibt es
 * genau eine Kachel, und die Zuordnung wäre eine Frage ohne Wahl.
 *
 * Exportiert, weil der Bearbeiten-Dialog fuer Aufgaben dieselbe Auswahl
 * braucht und sie nicht doppelt bauen soll.
 */
export function InvestmentAuswahl({
  investments,
  wert,
  setzen,
}: {
  investments: Array<{ id: string; nummer?: number; label?: string; objektTitel?: string; pipelineStufe?: string }>;
  wert: string;
  setzen: (v: string) => void;
}) {
  if (investments.length === 0) return null;

  return (
    <div>
      <Label className="text-sm font-medium">Gehört zu *</Label>
      <select
        value={wert}
        onChange={(e) => setzen(e.target.value)}
        className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Bitte wählen</option>
        {investments.map((inv) => (
          <option key={inv.id} value={inv.id}>
            {inv.nummer ? `${inv.nummer}. ` : ""}
            {inv.objektTitel || inv.label || "Investment"}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground mt-1.5">
        Bestimmt, auf welcher Pipeline-Kachel der Termin erscheint.
      </p>
    </div>
  );
}
