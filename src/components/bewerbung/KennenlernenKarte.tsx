import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  ClipboardCopy,
  Loader2,
  Mail,
  Send,
  ThumbsDown,
  Video,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { HR_ANSPRECHPARTNERIN } from "@/lib/bewerberKontaktversuch";
import { changeBewerberStatus, type Bewerber } from "@/lib/bewerbungStore";
import {
  abbruchText,
  fehlerDetail,
  versandFehlerText,
  versandMeldung,
  type VersandAntwort,
} from "@/lib/kennenlernenVersandMeldung";
import {
  brauchtNeuenLink,
  kennenlernLinkStand,
  kennenlernZeilen,
  ohneMailErzeugt,
  type KennenlernLinkStand,
} from "@/lib/kennenlernenLink";
import { sendeKennenlernAbsageMail } from "@/lib/bewerberAbsageMail";
import {
  leseKooperationsEinladung,
  sendeKooperationsEinladung,
  vermerkeKooperationsEinladung,
} from "@/lib/bewerberEinladung";
import { eingereichteKennenlernZeile } from "@/lib/bewerberVideocall";
import {
  ANSICHTEN,
  gespraechsDauerMinuten,
  getWeg,
  istKennenlernen,
  naechsterSchritt,
  themenLabels,
  SCHRITT_TEXTE,
  type KennenlernenAntworten,
} from "@/lib/bewerberKennenlernen";
import { berechneVorabScore, VORAB_EINSTUFUNG_LABELS } from "@/lib/bewerberVorabScore";
import {
  VorabScoreAufschluesselung,
  VorabScoreBadge,
} from "@/components/bewerbung/VorabScoreBadge";
import { TERMIN_ZEITZONE } from "@/lib/bewerberTermine";
import {
  ladeBewerberBuchungen,
  type BewerberBuchungZeile,
} from "@/lib/bewerberTerminStore";
import {
  FAELLIG_TEXTE,
  STOPP_TEXTE,
  faelligeErinnerung,
  naechsterSchrittAm,
  stoppGrund,
  type KettenStand,
} from "@/lib/kennenlernenErinnerungen";
import { standAusBewerber } from "@/lib/kennenlernenStand";
import { WartetAufEntscheidungGrund } from "@/components/bewerbung/WartetAufEntscheidung";
import { kennenlernMailAm } from "@/components/bewerbung/KennenlernMailVermerk";
import { MailOeffnungBadge } from "@/components/bewerbung/MailOeffnungBadge";
import { MAIL_KOOPERATION } from "@/lib/bewerberMailTracking";
import { meldeVersand } from "@/lib/bewerberVersandRunde";
import type { SammelmailKennzeichen } from "@/lib/bewerberSammelmailStand";

/**
 * Das Kennenlernen des neuen Bewerberprozesses, als Karte im Reiter Übersicht.
 *
 * Sie fasst zusammen, was am neuen Ablauf wirklich neu ist und im bestehenden
 * Bewerbungsmanagement keine Entsprechung hat:
 *
 * 1. **Die Einladung.** Eine Mail mit dem persönlichen Link zum Kennenlernbogen.
 * 2. **Der Stand des Bogens.** Offen oder ausgefüllt.
 * 3. **Der passende nächste Schritt.** Ergibt sich aus den Antworten.
 * 4. **Der gebuchte Termin**, falls er nach unserer Einladung schon steht.
 * 5. **Die Erinnerungskette.** Tag 3 und Tag 11, beides Mails an den Bewerber.
 *    Tag 8 ist am 26.09.2026 entfallen.
 *
 * Sie steht bewusst in der Übersicht und nicht in einem eigenen Reiter: Wer
 * die Akte öffnet, will als Erstes wissen, ob schon etwas vorliegt.
 *
 * ## Was hier bewusst nicht mehr steht
 *
 * Die vollständige Antwortliste. Sie stand bis zum 08.09.2026 zweimal in
 * derselben Akte: hier in drei Gruppen und im Reiter Videocall noch einmal,
 * dort sogar vollständiger, weil `vollstaendigerUeberblick` über alle Ansichten
 * dieses Bewerbers geht. Zwei Listen derselben Sache laufen auseinander, und
 * wer die Akte überfliegt, liest zweimal dasselbe.
 *
 * Geblieben ist der knappe Auszug, den man beim Überfliegen wirklich braucht:
 * sein gewählter Weg, die Dauer des Gesprächs und seine Tagesordnung. Das sind
 * die drei Angaben, aus denen sich der nächste Schritt ergibt; alles Weitere
 * braucht erst, wer das Gespräch führt, und der ist im Reiter Videocall.
 *
 * Die Karte lädt selbst und verträgt fehlende Migrationen: Fehlt die Tabelle
 * oder die Spalte `buchungen.bewerbung_id`, bleibt der jeweilige Teil leer,
 * statt die Akte mit einer Fehlermeldung zu füllen.
 */

/**
 * Die jüngste Zeile des **Kennenlernbogens**. Zeilen des früheren Vorabbogens
 * liegen in derselben Tabelle und zählen hier nicht, siehe `kennenlernenLink.ts`.
 */
type FormularZeile = {
  token: string;
  status: string;
  antworten: KennenlernenAntworten;
  erstelltAm: string;
  laeuftAbAm: string;
  /** Nur für die Akte erzeugt, es ging keine Mail hinaus. */
  ohneMail: boolean;
};

/** Der Ausgangszustand, solange nichts geladen ist: Es gibt keinen Link. */
const KEIN_LINK: KennenlernLinkStand = { art: "fehlt", grund: "keiner" };

function datum(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

/**
 * Datum und Uhrzeit eines gebuchten Termins, in deutscher Zeit.
 *
 * Ausdrücklich in `TERMIN_ZEITZONE` und nicht in der des Browsers: Wer aus dem
 * Ausland ins CRM sieht, soll dieselbe Uhrzeit lesen wie die HR-Managerin.
 * Dieselbe Entscheidung wie in `bewerberTermine.ts`.
 */
function terminText(termin: BewerberBuchungZeile): string {
  const d = new Date(termin.startAt);
  if (Number.isNaN(d.getTime())) return "";
  const tag = d.toLocaleDateString("de-DE", { timeZone: TERMIN_ZEITZONE });
  const zeit = d.toLocaleTimeString("de-DE", {
    timeZone: TERMIN_ZEITZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${tag} um ${zeit} Uhr`;
}

/**
 * Wie viele Zeilen geholt werden. Zu einem Bewerber gibt es eine Zeile je
 * verschickter Einladung; acht deckt jede realistische Zahl ab.
 */
const FORMULAR_ZEILEN = 8;

export function KennenlernenKarte({
  bewerber,
  canEdit = false,
  sammelmail,
}: {
  bewerber: Bewerber;
  /**
   * Darf dieses Konto den Bewerberprozess bearbeiten?
   *
   * Entscheidet, ob die Knöpfe überhaupt erscheinen. Sie sind keine
   * Zugriffskontrolle, das bleibt die Zeilensicherheit und die Prüfung in den
   * Functions; sie verhindern nur, dass jemand mit reinem Leserecht eine echte
   * Mail an einen Bewerber auslöst. Voreingestellt ist „nein": Wer die Karte
   * ohne ausdrückliche Freigabe einbaut, bekommt die Leseansicht.
   */
  canEdit?: boolean;
  /**
   * Was die Vorschau der Sammelmail über diesen Bewerber sagt: Mail fehlt,
   * Adresse gesperrt, oder nichts.
   *
   * Kommt als Eigenschaft von der Seite und wird hier nicht selbst geholt.
   * Die Seite hat den Stand ohnehin für die Liste, und ein zweiter Aufruf
   * derselben Edge Function beim Öffnen jeder Akte wäre reine Last.
   */
  sammelmail?: SammelmailKennzeichen | null;
}) {
  const [formular, setFormular] = useState<FormularZeile | null>(null);
  const [ausgefuelltZeile, setAusgefuellt] = useState<
    { token: string; antworten: KennenlernenAntworten; eingereichtAm: string } | null
  >(null);
  const [termin, setTermin] = useState<BewerberBuchungZeile | undefined>(undefined);
  /*
   * Welcher Link gerade gilt. Bewusst getrennt von `formular`: Die jüngste
   * Zeile kann ersetzt oder abgelaufen sein, dann gibt es zwar einen Bogen,
   * aber keinen Link, den man kopieren oder ansehen könnte.
   */
  const [linkStand, setLinkStand] = useState<KennenlernLinkStand>(KEIN_LINK);
  const [erzeugtLink, setErzeugtLink] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [ladetEinladung, setLadetEinladung] = useState(false);
  const [ladetAbsage, setLadetAbsage] = useState(false);
  /*
   * Wann eingeladen wurde. Als Zustand und nicht direkt aus dem
   * Zwischenspeicher gelesen, damit die Karte nach dem Versand sofort
   * umschaltet; der Zwischenspeicher meldet die Änderung zwar, aber die Karte
   * hängt an keinem seiner Ereignisse.
   */
  const [eingeladenAm, setEingeladenAm] = useState(() => leseKooperationsEinladung(bewerber.id));
  // Nach einem Versand die Öffnungen neu holen, sonst steht dort der Stand von
  // davor. Ein Zähler genügt, die Anzeige daneben hört darauf.
  const [einladungRunde, setEinladungRunde] = useState(0);

  const bewerbungId = bewerber.id;

  const ladeFormular = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("bewerber_formular")
        .select("token, status, antworten, created_at, expires_at")
        .eq("bewerbung_id", bewerbungId)
        .order("created_at", { ascending: false })
        .limit(FORMULAR_ZEILEN);
      const zeilen = (data ?? []) as {
        token?: string; status?: string; antworten?: unknown;
        created_at?: string; expires_at?: string;
      }[];
      if (error || zeilen.length === 0) {
        setFormular(null); setAusgefuellt(null); setLinkStand(KEIN_LINK);
        return;
      }
      /*
       * Nur der Kennenlernbogen zählt. Bis zum 15.09.2026 stand hier die
       * jüngste Zeile gleich welcher Art, und bei Bewerbern aus dem Altbestand
       * war das der abgelaufene Vorabbogen: Die Karte baute daraus einen
       * Kennenlern-Link, der auf „abgelaufen" lief, und nannte den Versand
       * des Vorabbogens „Einladung".
       */
      setLinkStand(kennenlernLinkStand(zeilen));
      const neueste = kennenlernZeilen(zeilen)[0];
      setFormular(neueste
        ? {
            token: String(neueste.token || ""),
            status: String(neueste.status || ""),
            antworten: (neueste.antworten || {}) as KennenlernenAntworten,
            erstelltAm: String(neueste.created_at || ""),
            laeuftAbAm: String(neueste.expires_at || ""),
            ohneMail: ohneMailErzeugt(neueste.antworten),
          }
        : null);
      /*
       * Der Stand des Bogens hängt an der jüngsten EINGEREICHTEN Zeile, nicht
       * an der jüngsten überhaupt. Wurde nach dem Ausfüllen noch einmal eine
       * Einladung verschickt, ist die jüngste Zeile leer, und die Karte hätte
       * behauptet, es liege nichts vor. Die Einladungsangaben oben stammen
       * weiterhin aus der jüngsten Zeile, denn nur deren Link gilt.
       */
      const eingereicht = eingereichteKennenlernZeile(zeilen);
      setAusgefuellt(
        eingereicht
          ? {
              token: String(eingereicht.token || ""),
              antworten: (eingereicht.antworten || {}) as KennenlernenAntworten,
              eingereichtAm: String(eingereicht.created_at || ""),
            }
          : null,
      );
    } catch {
      // Fehlt die Tabelle, bleibt die Karte bei „noch nichts verschickt".
      setFormular(null);
      setAusgefuellt(null);
      setLinkStand(KEIN_LINK);
    }
  }, [bewerbungId]);

  useEffect(() => { void ladeFormular(); }, [ladeFormular]);

  // Wird die Akte gewechselt, gilt der Vermerk des neuen Bewerbers.
  useEffect(() => { setEingeladenAm(leseKooperationsEinladung(bewerbungId)); }, [bewerbungId]);

  useEffect(() => {
    let abgebrochen = false;
    void ladeBewerberBuchungen().then((karte) => {
      // Nur der stehende Termin. `ladeBewerberBuchungen` liefert seit dem
      // 16.09.2026 auch abgesagte, damit die Liste ein Abzeichen dafür zeigen
      // kann; hier stünde ein abgesagter Termin im grünen Kasten samt Knopf in
      // den Gesprächsraum, obwohl er nicht mehr stattfindet.
      const zeile = karte[bewerbungId];
      if (!abgebrochen) setTermin(zeile && zeile.status !== "abgesagt" ? zeile : undefined);
    });
    return () => { abgebrochen = true; };
  }, [bewerbungId]);

  const antworten = ausgefuelltZeile?.antworten ?? {};
  const ausgefuellt = istKennenlernen(antworten);
  // Gerechnet wird im Browser aus den Antworten, gespeichert wird nichts.
  // Derselbe Score wie in der Bewerberliste, nur hier mit Aufschlüsselung.
  const vorabScore = berechneVorabScore(antworten);
  const link = linkStand.art === "fehlt" ? "" : linkStand.link;

  /*
   * Der Stand der Erinnerungskette, gebaut von `standAusBewerber`.
   *
   * Bis zum 14.09.2026 stand er hier zusammengeschrieben, und dabei fehlten die
   * selbst gewählte Pause und der Widerspruch gegen den Anruf. Die Karte zeigte
   * deshalb „Tag 3 fällig" bei Bewerbern, an die der Zeitplan längst nichts
   * mehr schickt. Jetzt liest die Karte denselben Stand wie er.
   */
  const stand: KettenStand = standAusBewerber(bewerber, {
    // Für die Erinnerungskette zählt, ob überhaupt eingereicht wurde, nicht
    // was auf der jüngsten Einladungszeile steht.
    status: ausgefuelltZeile ? "eingereicht" : formular?.status ?? null,
    laeuftAbAm: formular?.laeuftAbAm ?? null,
    // Eine Zeile, die nur für „Link kopieren" entstand, ist keine Einladung.
    erstelltAm: formular && !formular.ohneMail ? formular.erstelltAm : null,
  });
  const faellig = faelligeErinnerung(stand);
  const stopp = stoppGrund(stand);

  /**
   * Den Link beschaffen, den „Link kopieren" und „So sieht es aus" benutzen.
   *
   * Gilt ein Link, ist er es. Fehlt er, weil der bisherige abgelaufen oder
   * ersetzt ist oder weil der Bewerber bisher nur den früheren Vorabbogen
   * bekommen hat, erzeugt die Function still einen neuen, ohne Mail. Die
   * neue Zeile trägt das Kennzeichen `ohneMail`, damit Liste und Akte nicht
   * behaupten, es sei eine Einladung hinausgegangen.
   *
   * Ohne Bearbeitungsrecht entsteht nichts: Der Aufruf würde an der
   * Rollenprüfung der Function scheitern, und der Hinweis hier sagt das
   * vorher, statt eine technische Meldung durchzureichen.
   */
  const sichereLink = async (): Promise<{ link: string; neu: boolean }> => {
    if (!brauchtNeuenLink(linkStand)) return { link: linkStand.link, neu: false };
    if (!canEdit) {
      toast({
        title: "Kein gültiger Link",
        description: "Ein neuer Link lässt sich nur mit Bearbeitungsrecht für den Bewerberprozess erzeugen.",
        variant: "destructive",
      });
      return { link: "", neu: false };
    }
    if (erzeugtLink) return { link: "", neu: false };
    setErzeugtLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-bewerber-kennenlernen", {
        body: { bewerbungId, nurLink: true, ohneMail: true },
      });
      if (error) throw error;
      const antwort = data as { ok?: boolean; link?: string; grund?: string } | null;
      if (!antwort?.ok || !antwort.link) {
        toast({
          title: "Kein Link erzeugt",
          description: abbruchText(antwort?.grund),
          variant: "destructive",
        });
        return { link: "", neu: false };
      }
      // Die Liste und die Karte sollen den neuen Stand zeigen.
      meldeVersand();
      await ladeFormular();
      return { link: antwort.link, neu: true };
    } catch (e) {
      console.error("[bewerberprozess] Link konnte nicht erzeugt werden", e);
      toast({
        title: "Link konnte nicht erzeugt werden",
        description: versandFehlerText(e, await fehlerDetail(e)),
        variant: "destructive",
      });
      return { link: "", neu: false };
    } finally {
      setErzeugtLink(false);
    }
  };

  /** Warum ein neuer Link nötig war, für den Hinweis danach. */
  const neuerLinkText = () => {
    const grund = linkStand.art === "fehlt" ? linkStand.grund : "";
    if (grund === "nur_vorabbogen") {
      return "Bisher gab es nur den früheren Vorabbogen. Der neue Link führt zum Kennenlernbogen.";
    }
    if (grund === "abgelaufen" || grund === "ersetzt") {
      return "Der bisherige Link galt nicht mehr. Es ging keine Mail hinaus.";
    }
    return "Es ging keine Mail hinaus, der Link ist nur hier in der Akte.";
  };

  const kopieren = async () => {
    const { link: ziel, neu } = await sichereLink();
    if (!ziel) return;
    try {
      await navigator.clipboard.writeText(ziel);
      toast({
        title: neu ? "Neuer Link erzeugt und kopiert" : "Link kopiert",
        description: neu
          ? neuerLinkText()
          : linkStand.art === "eingereicht"
            ? "Der Bogen ist schon ausgefüllt, der Link zeigt seine Abschlussseite."
            : linkStand.art === "gueltig" && datum(linkStand.laeuftAbAm)
              ? `Er gilt bis zum ${datum(linkStand.laeuftAbAm)}.`
              : "Er gilt so lange wie die Mail.",
      });
    } catch {
      toast({ title: "Kopieren nicht möglich", description: ziel });
    }
  };

  /**
   * „So sieht es aus": den Kennenlernbogen in einem neuen Fenster öffnen.
   *
   * Muss erst ein Link erzeugt werden, wird das Fenster vor dem Warten
   * geöffnet und danach auf den Link gelenkt. Ein Fenster, das erst nach
   * einer Antwort vom Server aufgeht, hält der Browser für ein Popup und
   * unterdrückt es.
   */
  const ansehen = async () => {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }
    const fenster = window.open("", "_blank");
    const { link: ziel, neu } = await sichereLink();
    if (!ziel) {
      fenster?.close();
      return;
    }
    if (fenster) fenster.location.href = ziel;
    else window.open(ziel, "_blank", "noopener,noreferrer");
    if (neu) toast({ title: "Neuer Link erzeugt", description: neuerLinkText() });
  };

  const verschicken = async () => {
    // Dieselbe Prüfung wie an den beiden Knöpfen darunter. Der Knopf ist ohne
    // Bearbeitungsrecht ohnehin ausgeblendet; hier steht sie noch einmal,
    // damit auch ein Aufruf am Knopf vorbei nichts auslöst.
    if (!canEdit || sendet) return;
    if (!bewerber.email) {
      toast({
        title: "Keine Mailadresse",
        description: "Ohne Adresse geht nichts hinaus.",
        variant: "destructive",
      });
      return;
    }
    const bereits = !!stand.gesendetAm;
    const ok = await confirmDialog({
      title: bereits ? "Kennenlernen noch einmal schicken?" : "Kennenlernen verschicken?",
      description:
        `Die Mail geht sofort an ${bewerber.email}. ` +
        (ausgefuellt
          // Wer den Bogen schon ausgefüllt hat, soll nicht versehentlich ein
          // zweites Mal danach gefragt werden. Deshalb steht es hier und nicht
          // erst in einer Fehlermeldung hinterher.
          ? "Achtung: Das Kennenlernen ist schon ausgefüllt. Die bisherigen Antworten " +
            "bleiben erhalten, der Bewerber wird aber erneut eingeladen."
          : bereits
            ? "Ein noch gültiger Link bleibt derselbe, ein abgelaufener wird ersetzt. Es gilt immer nur einer."
            : "Sie enthält den persönlichen Link zum Kennenlernbogen."),
      confirmText: "Jetzt verschicken",
      cancelText: "Nicht verschicken",
    });
    if (!ok) return;

    setSendet(true);
    try {
      /*
       * `erneutSenden` ist die ausdrückliche Wiederholung durch HR. Sie hebt
       * die Sperre „schon ausgefüllt" auf und lässt die Function den Versand
       * am selben Tag nicht als Doppel verwerfen. Beim allerersten Versand
       * bleibt sie aus, dann ist es keine Wiederholung.
       */
      const { data, error } = await supabase.functions.invoke("send-bewerber-kennenlernen", {
        body: { bewerbungId, erneutSenden: ausgefuellt || bereits },
      });
      if (error) throw error;
      const meldung = versandMeldung(data as VersandAntwort | null, bewerber.vorname);
      toast({
        title: meldung.titel,
        description: meldung.text,
        variant: meldung.gelungen ? undefined : "destructive",
      });
      /*
       * Auch der Fehlschlag zaehlt als Versand. Bei einer gesperrten Adresse
       * entsteht die Bogenzeile, die Mail aber nicht; die Liste soll danach
       * zeigen, was wirklich gilt, statt den Stand von davor.
       */
      meldeVersand();
      if (!meldung.gelungen) return;
      await ladeFormular();
    } catch (e) {
      console.error("[bewerberprozess] Versand fehlgeschlagen", e);
      toast({
        title: "Versand fehlgeschlagen",
        description: versandFehlerText(e, await fehlerDetail(e)),
        variant: "destructive",
      });
    } finally {
      setSendet(false);
    }
  };

  /**
   * Knopf 1: zum persönlichen Gespräch einladen.
   *
   * Er steht erst zur Verfügung, wenn ein eingereichter Bogen vorliegt, denn
   * genau der ist die Grundlage der Entscheidung. Verschickt wird die Mail mit
   * dem Buchungslink; danach steht der Vermerk am Bewerber, damit sichtbar
   * bleibt, dass eingeladen wurde.
   *
   * Ein zweites Verschicken bleibt möglich, Mails gehen verloren. Es ist aber
   * an Knopf und Rückfrage als Wiederholung erkennbar.
   */
  const einladen = async () => {
    if (!canEdit || ladetEinladung) return;
    if (!bewerber.email) {
      toast({
        title: "Keine Mailadresse",
        description: "Ohne Adresse geht nichts hinaus.",
        variant: "destructive",
      });
      return;
    }
    /*
     * Das Token der EINGEREICHTEN Zeile, nicht der jüngsten.
     *
     * Ging nach dem Ausfüllen noch einmal eine Einladung hinaus, ist die
     * jüngste Zeile leer. Ihr Token führte auf eine Buchungsseite, die sagt
     * „sobald deine Angaben bei uns sind", obwohl sie längst da sind. Nur die
     * eingereichte Zeile ist buchbar.
     */
    const token = ausgefuelltZeile?.token || "";
    if (!token) {
      toast({
        title: "Kein Buchungslink möglich",
        description:
          "Zu diesem Bewerber liegt kein eingereichter Kennenlernbogen vor. Eingeladen wird, " +
          "wessen Antworten uns gefallen haben. Zuerst das Kennenlernen verschicken und abwarten.",
        variant: "destructive",
      });
      return;
    }

    const ok = await confirmDialog({
      title: eingeladenAm ? "Einladung noch einmal schicken?" : "Zum persönlichen Gespräch einladen?",
      description:
        `Die Mail geht sofort an ${bewerber.email}. Darin steht, dass uns seine Antworten ` +
        "gefallen haben, und ein Knopf in die Buchungsstrecke. " +
        (eingeladenAm
          ? `Eingeladen wurde bereits am ${datum(eingeladenAm)}. Der Knopf führt nach Calendly, ` +
            "ein dort schon gebuchter Termin bleibt bestehen."
          : termin
            ? "Achtung: Es steht bereits ein Termin. Der Knopf führt trotzdem in den Calendly-Kalender, " +
              "der Bewerber könnte also ein zweites Mal buchen."
            : "Er sucht sich Tag und Uhrzeit in Calendly selbst aus."),
      confirmText: eingeladenAm ? "Noch einmal einladen" : "Jetzt einladen",
      cancelText: "Nicht einladen",
    });
    if (!ok) return;

    setLadetEinladung(true);
    try {
      const ergebnis = await sendeKooperationsEinladung(bewerber, token);
      if (!ergebnis.ok) {
        toast({
          title: "Einladung nicht verschickt",
          description: ergebnis.grund || "Ohne nähere Meldung.",
          variant: "destructive",
        });
        return;
      }
      const jetzt = new Date().toISOString();
      // Der Vermerk darf den Versand nicht nachträglich verderben: Die Mail ist
      // hinaus, ob wir sie notieren können oder nicht.
      try {
        await vermerkeKooperationsEinladung(bewerbungId, jetzt);
      } catch (e) {
        console.error("[bewerberprozess] Einladung konnte nicht vermerkt werden", e);
      }
      setEingeladenAm(jetzt);
      setEinladungRunde((r) => r + 1);
      toast({
        title: "Einladung ist raus",
        description: `${bewerber.vorname} kann sich jetzt seine Zeit aussuchen.`,
      });
    } finally {
      setLadetEinladung(false);
    }
  };

  /**
   * Knopf 2: absagen, weil es nicht passt.
   *
   * Erst die Mail, dann der Status. Andersherum stünde der Bewerber auf
   * Abgelehnt, ohne je davon erfahren zu haben, und das ist der schlechtere
   * der beiden Halbzustände.
   *
   * Verschickt wird `sendeKennenlernAbsageMail` und nicht die Absage des
   * Videocalls: Die spricht von „unserem Gespräch", und hier hat noch keines
   * stattgefunden.
   */
  const absagen = async () => {
    if (!canEdit || ladetAbsage) return;
    const ok = await confirmDialog({
      title: "Absagen, weil es nicht passt?",
      description:
        (bewerber.email
          ? `${bewerber.vorname} bekommt sofort eine kurze, wertschätzende Absage an ${bewerber.email}. `
          : "Am Bewerber steht keine Mailadresse, es geht also nichts hinaus. ") +
        "Danach steht er auf Abgelehnt. Rückgängig machen lässt sich die Mail nicht.",
      confirmText: "Absagen",
      cancelText: "Doch nicht",
      variant: "destructive",
    });
    if (!ok) return;

    setLadetAbsage(true);
    try {
      const mail = await sendeKennenlernAbsageMail(bewerber);
      changeBewerberStatus(bewerbungId, "Abgelehnt");
      toast({
        title: "Bewerber abgesagt",
        description: mail.ok
          ? `Die Absage ging an ${bewerber.email}. Der Status steht auf Abgelehnt.`
          : `Der Status steht auf Abgelehnt. Die Mail ging nicht hinaus: ${mail.grund || "ohne nähere Meldung"}.`,
        variant: mail.ok ? undefined : "destructive",
      });
    } finally {
      setLadetAbsage(false);
    }
  };

  // `weg` ist im Katalog als Antwort geführt und damit auch als Liste
  // möglich. Gewählt wird immer genau einer, deshalb der erste Eintrag.
  const wegId = Array.isArray(antworten.weg) ? antworten.weg[0] : antworten.weg;
  const wegLabel = ausgefuellt ? getWeg(wegId)?.label ?? "" : "";

  return (
    <Card className="p-4 space-y-4">
      {/* ── Die Einladung ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Kennenlernen</p>
            {ausgefuellt ? (
              <Badge className="bg-[hsl(var(--success))] text-white text-[10px]">Ausgefüllt</Badge>
            ) : linkStand.art === "gueltig" ? (
              <Badge variant="outline" className="text-[10px]">Link offen</Badge>
            ) : linkStand.art === "fehlt" && linkStand.grund === "abgelaufen" ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">Link abgelaufen</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">Noch nicht verschickt</Badge>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {stand.gesendetAm
              /*
               * Die Zahl der Ansichten kommt aus dem Bogen selbst. Sie stand
               * hier als Wort und lief mit jeder Änderung am Bogen
               * auseinander. Auf Weg 2 ist es eine mehr; welchen Weg er
               * wählt, steht zum Zeitpunkt der Einladung noch nicht fest.
               */
              ? `Die Einladung ging am ${datum(stand.gesendetAm)} hinaus.` +
                (bewerber.kennenlernenGesendetVon ? ` Zuletzt von ${bewerber.kennenlernenGesendetVon}.` : "") +
                (bewerber.kennenlernenErneutGesendet
                  ? ` ${bewerber.kennenlernenErneutGesendet}-mal erneut verschickt.`
                  : "") +
                ` ${ANSICHTEN.length} Ansichten in sieben Kapiteln, am Ende sendet er ab. Einen Termin sucht er sich erst nach eurer Einladung aus.`
              : linkStand.art === "fehlt" && linkStand.grund === "nur_vorabbogen"
                ? "Bisher ging nur der frühere Vorabbogen hinaus. Die Eingangsmail mit dem Kennenlernbogen wurde noch nicht verschickt."
                : "Eine kurze Mail mit dem persönlichen Link. Kein Anruf, kein Kalenderlink, keine Zeitzusage."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Seit dem 08.09.2026 an dieselbe Rechteprüfung gebunden wie die
            beiden Knöpfe weiter unten: Verschicken darf, wer den
            Bewerberprozess bearbeiten darf, also HR, Admin und Inhaber
            (`kannBewerberVerwalten`). Vorher löste jedes Konto mit Leserecht
            eine echte Mail an einen Bewerber aus.
          */}
          {canEdit && (
            <Button size="sm" onClick={verschicken} disabled={sendet || !bewerber.email}>
              {sendet
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              {stand.gesendetAm ? "Noch einmal schicken" : "Kennenlernen verschicken"}
            </Button>
          )}
          {/*
            Gilt ein Link, darf ihn jeder mit Leserecht kopieren und ansehen.
            Fehlt er, erzeugen die beiden Knöpfe still einen neuen, und das
            ist ein Schreibvorgang: nur mit Bearbeitungsrecht.
          */}
          {(link || canEdit) && (
            <>
              <Button size="sm" variant="outline" onClick={kopieren} disabled={erzeugtLink}>
                {erzeugtLink
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  : <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                Link kopieren
              </Button>
              <Button size="sm" variant="ghost" onClick={ansehen} disabled={erzeugtLink}>
                So sieht es aus <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Der passende nächste Schritt und der Termin ── */}
      {ausgefuellt && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start gap-2.5">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {SCHRITT_TEXTE[naechsterSchritt(antworten)].titel}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · {gespraechsDauerMinuten(antworten)} Minuten
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {SCHRITT_TEXTE[naechsterSchritt(antworten)].text}
              </p>
              {wegLabel && (
                <p className="mt-1.5 text-xs">
                  <span className="font-medium">Sein Weg: </span>
                  {wegLabel}
                </p>
              )}
              {themenLabels(antworten).length > 0 && (
                <p className="mt-1.5 text-xs">
                  <span className="font-medium">Seine Tagesordnung: </span>
                  {themenLabels(antworten).join(", ")}
                </p>
              )}
              {termin ? (
                <div className="mt-2.5 rounded-md border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5 px-3 py-2 text-sm">
                  <span className="font-medium">
                    {termin.bezeichnung || "Persönliches Gespräch"} am {terminText(termin)}
                  </span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Von ihm selbst gebucht, über die Buchungsstrecke aus eurer Einladung. Es wurde
                    bewusst kein Lead angelegt und keine Pipelinestufe gesetzt. Verschieben und
                    absagen kann er über seinen eigenen Link.
                  </p>
                  {termin.raumPfad && (
                    <Button variant="outline" size="sm" className="mt-2" asChild>
                      <a href={termin.raumPfad} target="_blank" rel="noreferrer">
                        <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Gesprächsraum öffnen
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  Noch kein Termin. Der Bogen endet ohne Terminwahl: Erst eure Einladung führt ihn
                  in den Kalender von {HR_ANSPRECHPARTNERIN}, und dort sucht er sich die Zeit
                  selbst aus. Erscheint hier nichts, obwohl ihr eingeladen habt und er gebucht hat,
                  fehlt entweder die Migration 20260906120000 oder ein Wochenplan im
                  Buchungskalender.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        ── Der Vorab-Score, mit Aufschlüsselung ──

        Er steht unmittelbar über der Entscheidung, denn er ist die Antwort auf
        genau die Frage, die dort gestellt wird: Wen laden wir zuerst ein? Seit
        der Bogen ohne Terminwahl endet, wird nach diesem Score ausgewählt, und
        eine Zahl ohne Herleitung trägt diese Entscheidung nicht. Deshalb steht
        die vollständige Aufschlüsselung darunter und nicht in einem Tooltip.

        Er ist eine Reihenfolge und kein Urteil, und der Satz darunter sagt das
        auch. Ein niedriger Wert schließt niemanden aus.
      */}
      {ausgefuellt && vorabScore && (
        <div className="rounded-lg border p-3" data-testid="kennenlernen-vorab-score">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Vorab-Score</span>
            <VorabScoreBadge score={vorabScore} />
            <Badge variant="outline" className="text-[10px]">
              {VORAB_EINSTUFUNG_LABELS[vorabScore.einstufung]}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{vorabScore.begruendung}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Eine Reihenfolge, kein Urteil: Er sagt, wen es sich lohnt zuerst anzurufen, und
            schließt niemanden aus. Gerechnet wird nur auf die Fragen, die dieser Bogen ihm
            gestellt hat, deshalb sind alle fünf Wege vergleichbar.
          </p>
          <div className="mt-2.5 border-t pt-2.5">
            <VorabScoreAufschluesselung score={vorabScore} />
          </div>
        </div>
      )}

      {/*
        ── Die Entscheidung ──

        Sie steht hier und nicht in einem eigenen Reiter, denn hier liegt das,
        worauf sie sich stützt: der eingereichte Bogen, sein Weg, seine
        Tagesordnung und der daraus abgeleitete nächste Schritt. Wer die
        Antworten gelesen hat, entscheidet im selben Bildschirm, ohne zu
        wechseln.

        Sichtbar erst, wenn ein eingereichter Bogen vorliegt: Vorher gibt es
        nichts zu entscheiden, und einen Einladungsknopf ohne Buchungsstrecke
        gäbe es dann auch nicht.
      */}
      {ausgefuellt && canEdit && (
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium">Wie geht es mit ihm weiter?</p>
            {/*
              Ob die Einladung geöffnet wurde. Erst nach dem Versand sichtbar,
              vorher gäbe es nichts zu messen.
            */}
            <MailOeffnungBadge
              bewerberId={bewerbungId}
              kind={MAIL_KOOPERATION}
              gesendetAm={eingeladenAm}
              neuLaden={einladungRunde}
            />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {eingeladenAm
              ? `Die Einladung zum persönlichen Gespräch ging am ${datum(eingeladenAm)} hinaus. ` +
                "Ein zweiter Versand ist möglich, der Link bleibt derselbe."
              : "Der Bogen liegt vor. Entweder wir laden ihn zum persönlichen Gespräch ein, dann " +
                "sucht er sich Tag und Uhrzeit selbst aus, oder wir sagen ihm ab."}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={einladen}
              disabled={ladetEinladung || ladetAbsage || !bewerber.email}
            >
              {ladetEinladung
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              {eingeladenAm ? "Einladung noch einmal schicken" : "Zum persönlichen Gespräch einladen"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={absagen}
              disabled={ladetEinladung || ladetAbsage}
            >
              {ladetAbsage
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                : <ThumbsDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              Absagen, weil es nicht passt
            </Button>
          </div>
          {!bewerber.email && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Ohne Mailadresse lässt sich nicht einladen. Die Absage geht dann ohne Mail durch und
              setzt nur den Status.
            </p>
          )}
        </div>
      )}

      {/* ── Die Erinnerungskette ── */}
      <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Und wenn nichts passiert</p>
          {stopp ? (
            <>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Die Kette steht. {STOPP_TEXTE[stopp]}
              </p>
              <WartetAufEntscheidungGrund stand={stand} sammelmail={sammelmail} hatMailZumBogen={kennenlernMailAm(bewerber) !== null} />
            </>
          ) : faellig !== "keine" ? (
            <p className="mt-1 text-[11px] leading-relaxed">
              <span className="font-medium text-amber-600">Jetzt fällig: {FAELLIG_TEXTE[faellig]}</span>
              <span className="block text-muted-foreground">
                Der Zeitplan verschickt die Erinnerungen selbst, sobald die Migration
                20260906130000 gelaufen ist. Bis dahin ist das hier die Anzeige, nach der von
                Hand gehandelt wird.
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Zwei Erinnerungen, danach ist Schluss: die erste an Tag 3, die letzte an Tag 11. Die
              letzte schließt den Fall und setzt den Bewerber auf „Kein Interesse“.
              {naechsterSchrittAm(stand) ? ` Nächster Schritt am ${naechsterSchrittAm(stand)}.` : ""}
            </p>
          )}
          {/*
            Auch ohne Stopp kann der Fall dauerhaft stehen: Wer alle
            Erinnerungen bekommen hat und trotzdem im Eingang liegt, wartet auf
            eine Entscheidung von Hand. Die Zeile steht deshalb außerhalb der
            drei Fälle darüber.
          */}
          {!stopp && <WartetAufEntscheidungGrund stand={stand} sammelmail={sammelmail} hatMailZumBogen={kennenlernMailAm(bewerber) !== null} />}
        </div>
      </div>

      {/* ── Der Verweis auf die Antworten, statt einer zweiten Liste ── */}
      {ausgefuellt && (
        <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Alle Antworten aus dem Kennenlernbogen stehen im Reiter Videocall, unter „Aus dem
          Kennenlernbogen“.
        </p>
      )}
    </Card>
  );
}
