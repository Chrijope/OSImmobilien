import { BuchungsWoche } from "@/components/buchung/BuchungsWoche";
import { VersandStatus } from "@/components/buchung/VersandStatus";
import { useVideocallFreigabe } from "@/hooks/useVideocallFreigabe";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarPlus, CalendarX, CheckCircle2, Copy, Plus, Trash2, Link2, ShieldAlert, Loader2,
  ExternalLink, AlertTriangle, Share2, Pencil,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useUser } from "@/contexts/UserContext";
import { confirmDialog } from "@/lib/confirm";
import {
  buchungFehlerMeldung, endeVorAnfangMeldung,
  leererWochenplanRueckfrage, letzteTerminartRueckfrage, buchungGesperrtHinweis,
} from "@/lib/buchungZeitenMeldung";
import {
  ladeEinstellungen, speichereEinstellungen, normalisiereSlug,
  ladeTerminarten, erstelleTerminart, aktualisiereTerminart, loescheTerminart,
  stelleStandardTerminartenSicher,
  zaehleLinksMitTerminart,
  ladeVerfuegbarkeiten, setzeWochenplan, setzeAusnahme, loescheVerfuegbarkeit,
  ladeBuchungen, setzeBuchungStatus, buchungUrl,
  type Terminart, type VerfuegbarkeitZeile, type Buchung,
  type BuchungAnlass, type BuchungStatus,
} from "@/lib/buchungStore";

/**
 * Terminarten, Verfuegbarkeiten und der eigene Buchungslink.
 *
 * Das ist die Seite, die langfristig den fremden Buchungslink aus den
 * Einstellungen ersetzt. Bis zur Freigabe sehen sie nur admin und inhaber,
 * und der alte Link bleibt daneben unveraendert in Betrieb.
 */

const WOCHENTAGE = [
  { nr: 1, lang: "Montag" },
  { nr: 2, lang: "Dienstag" },
  { nr: 3, lang: "Mittwoch" },
  { nr: 4, lang: "Donnerstag" },
  { nr: 5, lang: "Freitag" },
  { nr: 6, lang: "Samstag" },
  { nr: 0, lang: "Sonntag" },
];

/**
 * Voreingestellte Begruessung auf der Buchungsseite.
 *
 * Sie steht von Anfang an da, damit niemand mit einem leeren Feld starten
 * muss und die Seite nie ohne Ansprache erscheint. Jeder kann sie fuer sich
 * umschreiben, gespeichert wird dann die eigene Fassung.
 */
const BEGRUESSUNG_VORLAGE =
  "Schön, dass du dir Zeit nimmst. Such dir einfach eine Zeit aus, die dir passt. " +
  "Wir klären in Ruhe, was zu dir passt, und du entscheidest danach, ob es weitergeht.";

const ANLASS_TEXT: Record<BuchungAnlass, string> = {
  erstgespraech: "Erstgespräch",
  beratung: "Beratungsgespräch",
  objektvorstellung: "Objektvorstellung",
  finanzierungsgespraech: "Finanzierungsgespräch",
  bewerbergespraech: "Bewerbergespräch",
  sonstiges: "Sonstiges",
};

interface TagZeile {
  offen: boolean;
  von: string;
  bis: string;
}

type Wochenplan = Record<number, TagZeile>;

const LEERER_PLAN: Wochenplan = WOCHENTAGE.reduce((plan, tag) => {
  plan[tag.nr] = { offen: tag.nr >= 1 && tag.nr <= 5, von: "09:00", bis: "17:00" };
  return plan;
}, {} as Wochenplan);

function zeitKuerzen(wert: string | null): string {
  return (wert ?? "").slice(0, 5);
}

function Abschnitt({
  titel,
  hinweis,
  rechts,
  children,
}: {
  titel: string;
  hinweis?: string;
  rechts?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{titel}</h2>
          {hinweis && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hinweis}</p>}
        </div>
        {rechts}
      </div>
      {children}
    </Card>
  );
}

export default function VideocallBuchungen() {
  const { user } = useUser();
  const { darf: darfSehen } = useVideocallFreigabe();
  /**
   * Wer eigene Terminarten anlegen und loeschen darf.
   *
   * Bis zum 10.09.2026 waren das nur admin und inhaber, mit der Begruendung,
   * der Satz an Terminarten sei fest. Diese Begruendung traegt nicht: Eine
   * Terminart gehoert **immer genau einer Person**. Sie haengt an
   * `mitarbeiter_id`, `ladeTerminarten` liest nur die eigenen, und gebucht
   * wird ueber den persoenlichen Link. Wer eine anlegt oder aendert, aendert
   * damit ausschliesslich seinen eigenen Kalender. Es gibt keinen
   * gemeinsamen Satz, den man schuetzen muesste.
   *
   * Die Sperre hatte dafuer eine unangenehme Folge: Wer keine Adminrolle hat,
   * konnte seinen Buchungskalender gar nicht erst in Betrieb nehmen, weil ihm
   * die erste Terminart fehlte. Aendern und Loeschen der eigenen war ohnehin
   * schon erlaubt.
   *
   * Massgeblich ist die Regel in der Datenbank, siehe Migration
   * 20260910143000. Diese Liste hier blendet nur den Knopf aus; ohne die
   * Migration schlaegt das Anlegen still fehl.
   */
  const darfTerminartenVerwalten = ["admin", "inhaber", "hr", "vertriebsleiter", "vertriebspartner"]
    .includes(user.role);

  const [laden, setLaden] = useState(true);
  const [terminarten, setTerminarten] = useState<Terminart[]>([]);
  const [verfuegbarkeiten, setVerfuegbarkeiten] = useState<VerfuegbarkeitZeile[]>([]);
  const [buchungsAnsicht, setBuchungsAnsicht] = useState<"kommend" | "vergangen">("kommend");
  const [buchungsSeite, setBuchungsSeite] = useState(0);
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);

  const [slug, setSlug] = useState("");
  const [offenAktiv, setOffenAktiv] = useState(false);
  // Nur ein gespeichertes Kuerzel ergibt eine Adresse, die man weitergeben kann.
  const [gespeicherterSlug, setGespeicherterSlug] = useState("");
  const [begruessung, setBegruessung] = useState("");
  const [plan, setPlan] = useState<Wochenplan>(LEERER_PLAN);
  const [planSpeichert, setPlanSpeichert] = useState(false);

  const [dialogOffen, setDialogOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [entwurf, setEntwurf] = useState({
    /** Gesetzt heisst bearbeiten, leer heisst neu anlegen. */
    id: "",
    bezeichnung: "",
    beschreibung: "",
    dauerMinuten: 60,
    pufferVorMinuten: 0,
    pufferNachMinuten: 15,
    vorlaufMinuten: 240,
    vorausschauTage: 60,
    anlass: "beratung" as BuchungAnlass,
    oeffentlich: true,
  });

  const [ausnahmeDatum, setAusnahmeDatum] = useState("");
  const [ausnahmeBemerkung, setAusnahmeBemerkung] = useState("");

  const allesLaden = useCallback(async () => {
    setLaden(true);
    const [e, arten, verf] = await Promise.all([
      ladeEinstellungen(),
      ladeTerminarten(),
      ladeVerfuegbarkeiten(),
      // Bewusst nur die eigenen: Die Ueberschrift verspricht "deine Links",
      // und ein Administrator darf ueber RLS alles lesen.

    ]);
    // Ein frisch freigeschalteter Gastgeber hat noch keine Terminart und
    // damit keinen buchbaren Kalender. Deshalb einmalig den Standardsatz
    // anlegen; das Bewerbergespraech nur fuer die Rolle hr.
    let nachgelegt: Terminart[] = [];
    if (arten.length === 0 && darfTerminartenVerwalten) {
      nachgelegt = await stelleStandardTerminartenSicher(user.role === "hr", arten);
    }
    setTerminarten([...arten, ...nachgelegt]);
    setVerfuegbarkeiten(verf);


    setSlug(e?.slug ?? "");
    setGespeicherterSlug(e?.slug ?? "");
    setOffenAktiv(Boolean(e?.offen_aktiv));
    // Noch nichts gespeichert? Dann steht die Vorlage im Feld, nicht nur
    // als blasser Platzhalter, damit sie beim Speichern mitgeht.
    setBegruessung(e?.begruessung ?? BEGRUESSUNG_VORLAGE);

    // Wochenregeln in die Bedienform bringen, fehlende Tage bleiben zu.
    const neuerPlan: Wochenplan = WOCHENTAGE.reduce((p, tag) => {
      p[tag.nr] = { offen: false, von: "09:00", bis: "17:00" };
      return p;
    }, {} as Wochenplan);
    let gefunden = false;
    for (const zeile of verf) {
      if (zeile.wochentag === null || zeile.datum) continue;
      gefunden = true;
      neuerPlan[zeile.wochentag] = {
        offen: !zeile.geschlossen,
        von: zeitKuerzen(zeile.von) || "09:00",
        bis: zeitKuerzen(zeile.bis) || "17:00",
      };
    }
    setPlan(gefunden ? neuerPlan : LEERER_PLAN);
    setLaden(false);
  }, [darfTerminartenVerwalten, user.role]);

  useEffect(() => {
    if (!darfSehen) return;
    let aktiv = true;
    void ladeBuchungen({ ...(buchungsAnsicht === "kommend" ? { vonISO: new Date().toISOString() } : { bisISO: new Date().toISOString(), vergangen: true }), nurEigene: true, fehlerWerfen: true, limit: 25, offset: buchungsSeite * 25 }).then((bu) => { if (aktiv) setBuchungen(bu); }).catch(() => toast.error("Buchungen konnten nicht geladen werden."));
    return () => { aktiv = false; };
  }, [darfSehen, buchungsAnsicht, buchungsSeite, laden]);

  useEffect(() => {
    if (!darfSehen) { setLaden(false); return; }
    void allesLaden();
  }, [darfSehen, allesLaden]);

  const ausnahmen = useMemo(
    () => verfuegbarkeiten.filter((z) => z.datum).sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "")),
    [verfuegbarkeiten],
  );

  const oeffentlicheArten = useMemo(
    () => terminarten.filter((a) => a.aktiv && a.oeffentlich),
    [terminarten],
  );

  const aktiveArten = useMemo(() => terminarten.filter((a) => a.aktiv), [terminarten]);

  /**
   * Wie viele Wochentage sind tatsaechlich gespeichert und buchbar?
   *
   * Bewusst aus den geladenen Daten und nicht aus dem Formular: Die Frage
   * lautet, ob gerade jemand buchen kann, nicht ob im Fenster etwas angeklickt
   * ist. Dieselbe Bedingung wie in `bewerber_termin_gastgeber()`.
   */
  const buchbareTage = useMemo(
    () => verfuegbarkeiten.filter((z) => z.wochentag !== null && !z.geschlossen).length,
    [verfuegbarkeiten],
  );

  /**
   * Haengt am eigenen Kalender auch der Bewerberprozess?
   *
   * `bewerber_termin_gastgeber()` waehlt seit Migration 20260910151500 genau
   * die Person mit der Rolle `hr`, einer aktiven Terminart mit dem Anlass
   * `bewerbergespraech` und wenigstens einer Wochenregel. Wer das ist, verliert
   * mit seinen Zeiten nicht nur die eigenen Termine.
   */
  const istBewerberGastgeber = user.role === "hr"
    && aktiveArten.some((a) => a.anlass === "bewerbergespraech");

  const gesperrtHinweis = buchungGesperrtHinweis({
    buchbareTage,
    aktiveTerminarten: aktiveArten.length,
    istBewerberGastgeber,
  });

  if (!darfSehen) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Noch nicht freigegeben</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Das eigene Buchungssystem wird gerade getestet. Bitte weiterhin den Buchungslink aus den
            Einstellungen verwenden.
          </p>
        </Card>
      </DashboardLayout>
    );
  }

  const speichereLink = async () => {
    const sauber = normalisiereSlug(slug);
    if (offenAktiv && !sauber) {
      toast.error("Für den offenen Link braucht es ein Kürzel.");
      return;
    }
    /*
     * Ein geändertes Kürzel bricht jeden bereits verschickten Link.
     *
     * Die alte Adresse führt danach ins Leere, und der Kunde sieht nur
     * "dieser Buchungslink ist nicht mehr gültig". Wer das Kürzel ändert,
     * soll das vorher wissen und nicht hinterher erfahren.
     */
    if (gespeicherterSlug && sauber !== gespeicherterSlug) {
      const weiter = await confirmDialog(
        sauber
          ? {
              title: "Kürzel wirklich ändern?",
              description:
                `Das Kürzel wird von „${gespeicherterSlug}" auf „${sauber}" geändert.\n\n` +
                "Alle bereits verschickten Links mit dem alten Kürzel führen danach ins Leere.",
              confirmText: "Ändern",
              variant: "destructive",
            }
          : {
              title: "Kürzel wirklich entfernen?",
              description:
                `Das Kürzel „${gespeicherterSlug}" wird entfernt.\n\n` +
                "Alle bereits verschickten Links führen danach ins Leere, und dein offener " +
                "Buchungslink ist nicht mehr erreichbar.",
              confirmText: "Entfernen",
              variant: "destructive",
            },
      );
      if (!weiter) return;
    }

    const ergebnis = await speichereEinstellungen({
      slug: sauber,
      offenAktiv,
      begruessung: begruessung.trim() || BEGRUESSUNG_VORLAGE,
    });
    if (!ergebnis.daten) {
      if (ergebnis.kuerzelVergeben) {
        toast.error("Dieses Kürzel ist schon vergeben. Bitte ein anderes wählen.");
        return;
      }
      const meldung = buchungFehlerMeldung(ergebnis.fehler, "linkEinstellungen");
      toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
      return;
    }
    setSlug(sauber ?? "");
    setGespeicherterSlug(sauber ?? "");
    toast.success("Gespeichert.");
    await allesLaden();
  };

  /**
   * Der Schalter speichert sofort.
   *
   * Vorher war er nur ein Zustand im Fenster: Wer ihn umlegte und nicht auf
   * Speichern klickte, fand ihn beim naechsten Aufruf wieder auf Aus. Das sah
   * aus, als wuerde er von selbst zurueckspringen.
   *
   * Fehlt beim Einschalten noch ein Kuerzel, schlagen wir eines aus dem Namen
   * vor, statt mit einer Fehlermeldung stehen zu bleiben.
   *
   * Der Schalter fasst das gespeicherte Kuerzel nur an, wenn er dabei eines
   * setzen muss. Vorher ging der Wert im Feld immer mit: Stand dort etwas
   * Unbrauchbares, etwa nur ein Bindestrich, wurde daraus `null` und das
   * gespeicherte Kuerzel war beim blossen Umlegen des Schalters geloescht.
   * Damit waren alle verschickten Links tot.
   */
  const wechsleOffen = async (an: boolean) => {
    const ausFeld = normalisiereSlug(slug);
    // Beim Ausschalten bleibt das Kuerzel unberuehrt, es soll ja beim
    // Wiedereinschalten dasselbe sein.
    let sauber: string | null | undefined = an ? (ausFeld ?? gespeicherterSlug ?? null) : undefined;

    if (an && !sauber) {
      sauber = normalisiereSlug(user.name);
      if (!sauber) {
        toast.error("Für den offenen Link braucht es ein Kürzel.");
        return;
      }
    }
    if (an && sauber && sauber !== slug) setSlug(sauber);

    setOffenAktiv(an);
    const ergebnis = await speichereEinstellungen({
      slug: sauber,
      offenAktiv: an,
      begruessung: begruessung.trim() || BEGRUESSUNG_VORLAGE,
    });
    if (!ergebnis.daten) {
      setOffenAktiv(!an);
      if (ergebnis.kuerzelVergeben) {
        toast.error("Dieses Kürzel ist schon vergeben. Bitte ein anderes wählen.");
        return;
      }
      const meldung = buchungFehlerMeldung(ergebnis.fehler, "linkEinstellungen");
      toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
      return;
    }
    if (an && sauber) setGespeicherterSlug(sauber);
    toast.success(an ? "Dein Buchungslink ist jetzt offen." : "Der offene Link ist aus.");
  };

  const speicherePlan = async () => {
    const zeilen = WOCHENTAGE
      .filter((tag) => plan[tag.nr]?.offen)
      .map((tag) => ({ wochentag: tag.nr, von: plan[tag.nr].von, bis: plan[tag.nr].bis }));

    const kaputt = zeilen.find((z) => z.von >= z.bis);
    if (kaputt) {
      const name = WOCHENTAGE.find((t) => t.nr === kaputt.wochentag)?.lang ?? "Ein Tag";
      const meldung = endeVorAnfangMeldung(name);
      toast.error(meldung.titel, { description: meldung.text });
      return;
    }

    /*
     * Der stillste Schaden dieser Seite.
     *
     * Wer alle Wochentage abwaehlte und speicherte, bekam „Zeiten
     * gespeichert." zu lesen und hatte damit seine gesamte Erreichbarkeit
     * geloescht. Danach zeigte der Buchungslink nichts mehr an, und gemerkt
     * hat es niemand, bis sich ein Bewerber beschwerte.
     *
     * Die Rueckfrage benennt deshalb die FOLGE, nicht die Handlung. „Sicher?"
     * beantwortet man mit ja, ohne es gelesen zu haben.
     *
     * Bewusst nur beim Uebergang von etwas auf nichts: Wer ohnehin noch nie
     * Zeiten hatte, wird nicht gefragt, dort gibt es nichts zu verlieren.
     */
    if (zeilen.length === 0 && buchbareTage > 0) {
      const weiter = await confirmDialog(leererWochenplanRueckfrage({ istBewerberGastgeber }));
      if (!weiter) return;
    }

    setPlanSpeichert(true);
    const ergebnis = await setzeWochenplan(zeilen);
    setPlanSpeichert(false);
    if (!ergebnis.ok) {
      // Die Meldung muss den Grund nennen. Ein fehlendes Schreibrecht verlangt
      // einen anderen naechsten Schritt als ein Netzfehler, und Wiederholen
      // hilft dort nie. Gedeutet wird der Fehler in `buchungZeitenMeldung.ts`.
      const meldung = buchungFehlerMeldung(ergebnis.fehler, "zeiten");
      toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
      return;
    }
    toast.success(zeilen.length === 0 ? "Wochenplan geleert. Es kann niemand buchen." : "Zeiten gespeichert.");
    await allesLaden();
  };

  const LEERER_ENTWURF = {
    id: "",
    bezeichnung: "",
    beschreibung: "",
    dauerMinuten: 60,
    pufferVorMinuten: 0,
    pufferNachMinuten: 15,
    vorlaufMinuten: 240,
    vorausschauTage: 60,
    anlass: "beratung" as BuchungAnlass,
    oeffentlich: true,
  };

  const oeffneNeu = () => {
    // Nicht nur der ausgeblendete Knopf: Auch der direkte Aufruf scheitert.
    if (!darfTerminartenVerwalten) {
      toast.error("Deine Rolle darf keine Terminarten anlegen.");
      return;
    }
    setEntwurf(LEERER_ENTWURF);
    setDialogOffen(true);
  };

  const oeffneBearbeiten = (art: Terminart) => {
    setEntwurf({
      id: art.id,
      bezeichnung: art.bezeichnung,
      beschreibung: art.beschreibung ?? "",
      dauerMinuten: art.dauer_minuten,
      pufferVorMinuten: art.puffer_vor_minuten,
      pufferNachMinuten: art.puffer_nach_minuten,
      vorlaufMinuten: art.vorlauf_minuten,
      vorausschauTage: art.vorausschau_tage,
      anlass: art.anlass,
      oeffentlich: art.oeffentlich,
    });
    setDialogOffen(true);
  };

  /** Legt an oder ändert, je nachdem ob der Entwurf eine Kennung trägt. */
  const speichereArt = async () => {
    // Anlegen ist Administratoren vorbehalten, Bearbeiten bleibt allen
    // erlaubt, die die Seite sehen.
    if (!entwurf.id && !darfTerminartenVerwalten) {
      toast.error("Deine Rolle darf keine Terminarten anlegen.");
      return;
    }
    if (!entwurf.bezeichnung.trim()) { toast.error("Bitte eine Bezeichnung angeben."); return; }
    // Dieselben Grenzen wie die Pruefung in der Datenbank. Ohne sie kommt nur
    // "konnte nicht gespeichert werden" zurueck, ohne zu sagen woran es lag.
    if (entwurf.vorausschauTage < 1 || entwurf.vorausschauTage > 365) {
      toast.error("Die Vorausschau muss zwischen 1 und 365 Tagen liegen.");
      return;
    }
    setSpeichert(true);

    const felder = {
      bezeichnung: entwurf.bezeichnung,
      beschreibung: entwurf.beschreibung,
      dauerMinuten: entwurf.dauerMinuten,
      pufferVorMinuten: entwurf.pufferVorMinuten,
      pufferNachMinuten: entwurf.pufferNachMinuten,
      vorlaufMinuten: entwurf.vorlaufMinuten,
      vorausschauTage: entwurf.vorausschauTage,
      anlass: entwurf.anlass,
      oeffentlich: entwurf.oeffentlich,
    };

    const ergebnis = entwurf.id
      ? await aktualisiereTerminart(entwurf.id, {
          bezeichnung: felder.bezeichnung.trim(),
          beschreibung: felder.beschreibung.trim() || null,
          dauer_minuten: felder.dauerMinuten,
          puffer_vor_minuten: felder.pufferVorMinuten,
          puffer_nach_minuten: felder.pufferNachMinuten,
          vorlauf_minuten: felder.vorlaufMinuten,
          vorausschau_tage: felder.vorausschauTage,
          anlass: felder.anlass,
          oeffentlich: felder.oeffentlich,
        })
      : await erstelleTerminart({ ...felder, sortierung: terminarten.length })
          .then((e) => ({ ok: Boolean(e.art), fehler: e.fehler }));

    setSpeichert(false);
    if (!ergebnis.ok) {
      const meldung = buchungFehlerMeldung(
        ergebnis.fehler,
        entwurf.id ? "terminartAendern" : "terminartAnlegen",
      );
      toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
      return;
    }
    setDialogOffen(false);
    setEntwurf(LEERER_ENTWURF);
    toast.success(entwurf.id ? "Terminart geändert." : "Terminart angelegt.");
    await allesLaden();
  };

  const legeAusnahmeAn = async () => {
    if (!ausnahmeDatum) { toast.error("Bitte ein Datum wählen."); return; }
    // Derselbe Tag zweimal ergibt zwei Zeilen, von denen das Aufheben nur eine
    // erwischt. Die Datenbank verbietet es seit 20260804180000, hier steht
    // der verständliche Satz dazu.
    if (ausnahmen.some((z) => z.datum === ausnahmeDatum)) {
      toast.error("Dieser Tag ist bereits gesperrt.");
      return;
    }
    const ergebnis = await setzeAusnahme({
      datum: ausnahmeDatum,
      geschlossen: true,
      bemerkung: ausnahmeBemerkung.trim() || undefined,
    });
    if (!ergebnis.zeile) {
      if (ergebnis.schonGesperrt) {
        toast.error("Dieser Tag ist bereits gesperrt.");
        return;
      }
      // Derselbe Weg wie beim Speichern der Zeiten: Das Sperren schreibt in
      // dieselbe Tabelle und haengt an derselben Einfuegeregel. „Der Tag
      // konnte nicht gesperrt werden" allein verschweigt genau das.
      const meldung = buchungFehlerMeldung(ergebnis.fehler, "tagSperren");
      toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
      return;
    }
    setAusnahmeDatum("");
    setAusnahmeBemerkung("");
    toast.success("Tag gesperrt.");
    await allesLaden();
  };

  /**
   * Eine Terminart löschen, aber erst nach ehrlicher Warnung.
   *
   * Beim Löschen setzt die Datenbank `terminart_id` der persönlichen Links auf
   * `NULL`. Die Links bleiben gültig, bieten dem Kunden danach aber alle
   * Terminarten an statt der einen, für die sie gedacht waren. Das passiert
   * still, deshalb steht die Zahl der betroffenen Links in der Rückfrage.
   */
  const loescheArt = async (art: Terminart) => {
    // Nicht nur der ausgeblendete Knopf: Auch der direkte Aufruf scheitert.
    if (!darfTerminartenVerwalten) {
      toast.error("Deine Rolle darf keine Terminarten löschen.");
      return;
    }
    const betroffen = await zaehleLinksMitTerminart(art.id);
    const warnung = betroffen > 0
      ? `${betroffen === 1
          ? "Achtung: Ein bereits verschickter persönlicher Link gilt"
          : `Achtung: ${betroffen} bereits verschickte persönliche Links gelten`} für genau diese Terminart. ` +
        "Nach dem Löschen bieten sie dem Kunden alle Terminarten zur Auswahl an."
      : "";

    /*
     * War es die letzte aktive, kann danach niemand mehr buchen. Dieselbe
     * Wirkung wie ein geleerter Wochenplan, nur ueber einen anderen Knopf.
     */
    const istLetzteAktive = art.aktiv && aktiveArten.length === 1;
    const ok = await confirmDialog(
      istLetzteAktive
        ? letzteTerminartRueckfrage({
            bezeichnung: art.bezeichnung,
            art: "loeschen",
            istBewerberGastgeber: user.role === "hr" && art.anlass === "bewerbergespraech",
            zusatz: warnung || undefined,
          })
        : {
            title: `„${art.bezeichnung}" wirklich löschen?`,
            description: warnung || undefined,
            confirmText: "Löschen",
            cancelText: "Behalten",
            variant: "destructive",
          },
    );
    if (!ok) return;
    const ergebnis = await loescheTerminart(art.id);
    if (ergebnis.ok) { toast.success("Gelöscht."); await allesLaden(); return; }
    const meldung = buchungFehlerMeldung(ergebnis.fehler, "terminartLoeschen");
    toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
  };

  /**
   * Der Aktiv-Schalter einer Terminart.
   *
   * Beim Ausschalten der letzten aktiven kommt dieselbe Rueckfrage wie beim
   * Leeren des Wochenplans: Ohne etwas Buchbares zeigt der Link nichts an.
   */
  const wechsleArtAktiv = async (art: Terminart, an: boolean) => {
    if (!an && aktiveArten.length === 1 && aktiveArten[0].id === art.id) {
      const weiter = await confirmDialog(letzteTerminartRueckfrage({
        bezeichnung: art.bezeichnung,
        art: "ausschalten",
        istBewerberGastgeber: user.role === "hr" && art.anlass === "bewerbergespraech",
      }));
      if (!weiter) return;
    }
    const ergebnis = await aktualisiereTerminart(art.id, { aktiv: an });
    if (!ergebnis.ok) {
      const meldung = buchungFehlerMeldung(ergebnis.fehler, "terminartAendern");
      toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
      return;
    }
    await allesLaden();
  };

  /** Eine Buchung absagen oder als wahrgenommen abhaken. */
  const setzeStatus = async (buchung: Buchung, status: BuchungStatus) => {
    if (status === "abgesagt") {
      const wann = new Date(buchung.start_at).toLocaleString("de-DE", {
        dateStyle: "medium", timeStyle: "short",
      });
      const weiter = await confirmDialog({
        title: `Termin mit ${buchung.name} am ${wann} absagen?`,
        description:
          "Der Videoraum wird geschlossen, der Termin in der Kundenakte wird abgehakt " +
          "und die Zeit ist wieder frei. Die Benachrichtigung wird zum Versand vorgemerkt.",
        confirmText: "Absagen",
        variant: "destructive",
      });
      if (!weiter) return;
    }
    const ergebnis = await setzeBuchungStatus(buchung.id, status);
    if (!ergebnis.ok) {
      const meldung = buchungFehlerMeldung(ergebnis.fehler, "buchungStatus");
      toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
      return;
    }
    toast.success(status === "abgesagt" ? "Termin abgesagt." : status === "nicht_erschienen" ? "Als nicht erschienen vermerkt." : "Als wahrgenommen vermerkt.");
    await allesLaden();
  };

  // Bewusst das gespeicherte Kuerzel, nicht das im Feld. Sonst gaebe man einen
  // Link weiter, den es in der Datenbank noch gar nicht gibt.
  const linkAdresse = gespeicherterSlug ? buchungUrl(gespeicherterSlug) : "";

  /** Teilen ueber das Geraet, sonst schlicht kopieren. */
  const teileLink = async (adresse: string) => {
    const teilen = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
    if (teilen) {
      try {
        await teilen.call(navigator, { title: "Termin buchen", url: adresse });
        return;
      } catch {
        // Abgebrochen oder nicht erlaubt, dann eben kopieren.
      }
    }
    try {
      await navigator.clipboard.writeText(adresse);
      toast.success("Link kopiert.");
    } catch {
      toast.error("Der Link konnte nicht geteilt werden.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <PageHeader
        title="Buchungskalender"
        subtitle="Deine Terminarten, deine Zeiten und dein Buchungslink. Für freigegebene Mitarbeitende."
      >
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] uppercase tracking-wide text-primary">
          Persönlich
        </Badge>
      </PageHeader>

      {laden ? (
        <p className="text-sm text-muted-foreground">Wird geladen…</p>
      ) : (
        <>
          {/*
            ── Niemand kann buchen ──

            Nicht nur im Augenblick des Speicherns, sondern solange der Zustand
            anhaelt. Ein geleerter Wochenplan sieht auf dieser Seite genauso
            aus wie ein nie gepflegter, und wer den Kalender oeffnet und nichts
            sieht, weiss sonst nicht, ob das Absicht ist.
          */}
          {gesperrtHinweis && (
            <Alert variant="destructive" role="status">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{gesperrtHinweis.titel}</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                {gesperrtHinweis.text}
              </AlertDescription>
            </Alert>
          )}

          {/* ── In drei Schritten startklar ── */}
          {(() => {
            const schritte: Array<{ text: string; fertig: boolean }> = [
              { text: "Terminarten anlegen", fertig: terminarten.some((t) => t.aktiv) },
              {
                text: "Deine Zeiten festlegen",
                fertig: verfuegbarkeiten.some((z) => z.wochentag !== null && !z.geschlossen),
              },
              {
                text: "Link verschicken",
                fertig: Boolean(gespeicherterSlug && offenAktiv) || buchungen.length > 0,
              },
            ];
            if (schritte.every((sch) => sch.fertig)) return null;
            return (
              <Card className="border-primary/20 bg-primary/[0.04] p-4">
                <p className="mb-2 text-sm font-semibold">In drei Schritten startklar</p>
                <ol className="flex flex-col gap-1.5 sm:flex-row sm:gap-6">
                  {schritte.map((sch, i) => (
                    <li key={sch.text} className="flex items-center gap-2 text-sm">
                      {sch.fertig ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                      ) : (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/50 text-[10px] font-semibold text-primary">
                          {i + 1}
                        </span>
                      )}
                      <span className={sch.fertig ? "text-muted-foreground line-through" : ""}>{sch.text}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  Persönliche Links je Kunde verschickst Du aus dem Kundenprofil über „Meeting erstellen".
                </p>
              </Card>
            );
          })()}

          {/* ── Terminarten ── */}
          <Abschnitt
            titel="Terminarten"
            hinweis="Was gebucht werden kann. Dauer, Puffer und Vorlaufzeit gelten je Terminart."
            rechts={
              darfTerminartenVerwalten ? (
                <Button variant="brand" size="sm" className="gap-1.5" onClick={oeffneNeu}>
                  <Plus className="h-4 w-4" /> Terminart
                </Button>
              ) : undefined
            }
          >
            {terminarten.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {darfTerminartenVerwalten
                  ? "Noch keine Terminart. Ohne mindestens eine kann niemand buchen."
                  : "Noch keine Terminart. Für deine Rolle ist das Anlegen nicht vorgesehen."}
              </p>
            ) : (
              <div className="space-y-2">
                {terminarten.map((art) => (
                  <div key={art.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarPlus className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{art.bezeichnung}</span>
                        <Badge variant="secondary" className="text-[10px]">{ANLASS_TEXT[art.anlass]}</Badge>
                        {!art.oeffentlich && <Badge variant="outline" className="text-[10px]">nur persönlich</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {art.dauer_minuten} Minuten
                        {art.puffer_nach_minuten > 0 ? ` · ${art.puffer_nach_minuten} Min. Puffer danach` : ""}
                        {` · frühestens in ${Math.round(art.vorlauf_minuten / 60)} Std.`}
                        {` · ${art.vorausschau_tage} Tage im Voraus`}
                      </p>
                      {art.beschreibung && (
                        /*
                         * Absaetze bleiben erhalten. Die Beschreibung ist oft
                         * mehrzeilig, und als ein zusammengeschobener Block
                         * ist sie unlesbar.
                         */
                        <p className="mt-2 max-h-24 overflow-hidden whitespace-pre-line border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
                          {art.beschreibung}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{art.aktiv ? "Aktiv" : "Aus"}</span>
                        <Switch
                          className="data-[state=checked]:bg-success data-[state=unchecked]:bg-alert-red"
                          checked={art.aktiv}
                          onCheckedChange={(an) => void wechsleArtAktiv(art, an)}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => oeffneBearbeiten(art)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Bearbeiten
                      </Button>
                      {darfTerminartenVerwalten && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${art.bezeichnung} löschen`}
                          onClick={() => void loescheArt(art)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Abschnitt>

          {/* ── Wochenzeiten ── */}
          <Abschnitt
            titel="Deine Zeiten"
            hinweis="Wann grundsätzlich gebucht werden darf. Bereits vergebene Termine und Puffer werden automatisch abgezogen."
            rechts={
              <Button variant="brand" size="sm" onClick={() => void speicherePlan()} disabled={planSpeichert}>
                {planSpeichert ? "Wird gespeichert…" : "Zeiten speichern"}
              </Button>
            }
          >
            <div className="space-y-2">
              {WOCHENTAGE.map((tag) => {
                const zeile = plan[tag.nr];
                return (
                  <div key={tag.nr} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2">
                    <Switch
                      className="data-[state=checked]:bg-success data-[state=unchecked]:bg-alert-red"
                      checked={zeile.offen}
                      onCheckedChange={(an) => setPlan((p) => ({ ...p, [tag.nr]: { ...p[tag.nr], offen: an } }))}
                      aria-label={`${tag.lang} buchbar`}
                    />
                    <span className="w-24 text-sm font-medium">{tag.lang}</span>
                    {zeile.offen ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={zeile.von}
                          onChange={(e) => setPlan((p) => ({ ...p, [tag.nr]: { ...p[tag.nr], von: e.target.value } }))}
                          className="w-[110px]"
                          aria-label={`${tag.lang} von`}
                        />
                        <span className="text-xs text-muted-foreground">bis</span>
                        <Input
                          type="time"
                          value={zeile.bis}
                          onChange={(e) => setPlan((p) => ({ ...p, [tag.nr]: { ...p[tag.nr], bis: e.target.value } }))}
                          className="w-[110px]"
                          aria-label={`${tag.lang} bis`}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">nicht buchbar</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Abschnitt>

          {/* ── Urlaub und einzelne Tage ── */}
          <Abschnitt
            titel="Gesperrte Tage"
            hinweis="Urlaub oder einzelne Tage, an denen nichts gebucht werden kann. Sie gehen der Wochenregel vor."
          >
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="ausnahme-datum">Datum</Label>
                <Input
                  id="ausnahme-datum"
                  type="date"
                  value={ausnahmeDatum}
                  onChange={(e) => setAusnahmeDatum(e.target.value)}
                  className="mt-1.5 w-[170px]"
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <Label htmlFor="ausnahme-bemerkung">Grund (optional)</Label>
                <Input
                  id="ausnahme-bemerkung"
                  value={ausnahmeBemerkung}
                  onChange={(e) => setAusnahmeBemerkung(e.target.value)}
                  placeholder="Urlaub"
                  className="mt-1.5"
                />
              </div>
              <Button variant="outline" onClick={() => void legeAusnahmeAn()}>Sperren</Button>
            </div>

            {ausnahmen.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {ausnahmen.map((z) => (
                  <span key={z.id} className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1 text-xs">
                    {new Date(`${z.datum}T00:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    {z.bemerkung ? ` · ${z.bemerkung}` : ""}
                    <button
                      type="button"
                      aria-label="Sperre aufheben"
                      onClick={async () => {
                        const ergebnis = await loescheVerfuegbarkeit(z.id);
                        if (ergebnis.ok) { toast.success("Sperre aufgehoben."); await allesLaden(); return; }
                        const meldung = buchungFehlerMeldung(ergebnis.fehler, "sperreAufheben");
                        toast.error(meldung.titel, { description: meldung.text, duration: 12000 });
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Abschnitt>

          {/* ── Offener Link ── */}
          <Abschnitt
            titel="Dein offener Buchungslink"
            hinweis="Wie bei Calendly. Wer den Link öffnet, sieht deine freien Zeiten und bucht selbst. Wer noch kein Kontakt ist, wird als Lead angelegt."
            rechts={
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{offenAktiv ? "Aktiv" : "Aus"}</span>
                <Switch className="data-[state=checked]:bg-success data-[state=unchecked]:bg-alert-red" aria-label="Öffentlichen Buchungslink aktivieren" checked={offenAktiv} onCheckedChange={(an) => void wechsleOffen(an)} />
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor="buchung-slug">Kürzel</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground">{new URL(buchungUrl("" )).host}/termin/</span>
                  <Input
                    id="buchung-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="christian-peetz"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Das Kürzel wird Teil deiner Buchungsadresse, am besten dein Name.
                </p>
              </div>
              <div className="flex items-end">
                <Button variant="brand" onClick={() => void speichereLink()}>Speichern</Button>
              </div>
            </div>

            {/* Der fertige Link zum Weitergeben, erst wenn ein Kürzel gespeichert ist. */}
            {linkAdresse ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-2.5">
                <span className="min-w-0 flex-1 truncate text-xs">{linkAdresse}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    void navigator.clipboard.writeText(linkAdresse).then(
                      () => toast.success("Link kopiert."),
                      () => toast.error("Der Link konnte nicht kopiert werden."),
                    );
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Kopieren
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void teileLink(linkAdresse)}
                >
                  <Share2 className="h-3.5 w-3.5" /> Teilen
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={linkAdresse} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Vorschau
                  </a>
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Sobald ein Kürzel gespeichert ist, steht hier der Link zum Weitergeben.
              </p>
            )}

            <div className="mt-4">
              <Label htmlFor="buchung-begruessung">Begrüßung auf der Buchungsseite</Label>
              <Textarea
                id="buchung-begruessung"
                value={begruessung}
                onChange={(e) => setBegruessung(e.target.value)}
                rows={2}
                placeholder={BEGRUESSUNG_VORLAGE}
                className="mt-1.5"
              />
            </div>

            {offenAktiv && oeffentlicheArten.length === 0 && (
              <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  Der Link ist an, aber es gibt keine öffentliche Terminart. Wer ihn öffnet, sieht
                  nichts zum Buchen.
                </span>
              </div>
            )}
          </Abschnitt>

          {/* ── Kommende Buchungen ── */}
          <Abschnitt
            titel="Deine Buchungen"
            hinweis="Was über deine Links gebucht wurde. Eine Absage schließt den Videoraum und gibt die Zeit wieder frei."
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(["kommend", "vergangen"] as const).map((ansicht) => <Button key={ansicht} variant={buchungsAnsicht === ansicht ? "default" : "outline"} aria-pressed={buchungsAnsicht === ansicht} onClick={() => { setBuchungsAnsicht(ansicht); setBuchungsSeite(0); }}>{ansicht === "kommend" ? "Kommende Termine" : "Vergangene Termine"}</Button>)}
              <Button variant="outline" disabled={buchungsSeite === 0} onClick={() => setBuchungsSeite((n) => n - 1)}>Zurück</Button>
              <span className="text-xs">Seite {buchungsSeite + 1}</span>
              <Button variant="outline" disabled={buchungen.length < 25} onClick={() => setBuchungsSeite((n) => n + 1)}>Weitere Termine</Button>
            </div>
            {buchungen.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                Noch nichts gebucht.
              </p>
            ) : (
              <div className="space-y-2">
                {buchungen.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{b.name}</span>
                      <VersandStatus buchungId={b.id} />
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(b.start_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                        {b.email ? ` · ${b.email}` : ""}
                        {b.quelle === "offen" ? " · offener Link" : b.quelle === "persoenlich" ? " · persönlicher Link" : ""}
                      </p>
                    </div>
                    <Badge variant={b.status === "abgesagt" ? "secondary" : "outline"} className="text-[10px]">
                      {b.status}
                    </Badge>
                    {/*
                      Nur ein offener Termin lässt sich noch bewegen. Ein
                      abgesagter bleibt stehen, damit die Historie vollständig
                      ist.
                    */}
                    {b.status === "offen" && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={new Date(b.start_at).getTime() > Date.now()}
                          onClick={() => void setzeStatus(b, "wahrgenommen")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Wahrgenommen
                        </Button>
                        {new Date(b.start_at).getTime() <= Date.now() && <Button variant="outline" size="sm" onClick={() => void setzeStatus(b, "nicht_erschienen")}>Nicht erschienen</Button>}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground"
                          onClick={() => void setzeStatus(b, "abgesagt")}
                        >
                          <CalendarX className="h-3.5 w-3.5" /> Absagen
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Abschnitt>

          <Card className="border-primary/20 bg-primary/[0.04] p-4">
            <div className="flex gap-3">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Der bisherige Buchungslink in den Einstellungen bleibt unverändert in Betrieb.
                Abgelöst wird er erst, wenn du das hier freigibst.
              </p>
            </div>
          </Card>
        </>
      )}

      {!laden && <BuchungsWoche />}

      {/* ── Terminart anlegen ── */}
      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>{entwurf.id ? "Terminart bearbeiten" : "Terminart anlegen"}</DialogTitle>
            <DialogDescription>
              Der Anlass bestimmt, welchen Warteraum der Kunde im Videoraum sieht.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="art-bezeichnung">Bezeichnung</Label>
              <Input
                id="art-bezeichnung"
                value={entwurf.bezeichnung}
                onChange={(e) => setEntwurf((v) => ({ ...v, bezeichnung: e.target.value }))}
                placeholder="Erstgespräch"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="art-beschreibung">Beschreibung (optional)</Label>
              <Textarea
                id="art-beschreibung"
                value={entwurf.beschreibung}
                onChange={(e) => setEntwurf((v) => ({ ...v, beschreibung: e.target.value }))}
                rows={2}
                placeholder="Wir klären in Ruhe, ob eine Kapitalanlage zu dir passt."
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="art-dauer">Dauer in Minuten</Label>
                <Input
                  id="art-dauer"
                  type="number"
                  min={5}
                  step={5}
                  value={entwurf.dauerMinuten}
                  onChange={(e) => setEntwurf((v) => ({ ...v, dauerMinuten: Number(e.target.value) || 60 }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="art-anlass">Anlass</Label>
                <Select
                  value={entwurf.anlass}
                  onValueChange={(w) => setEntwurf((v) => ({ ...v, anlass: w as BuchungAnlass }))}
                >
                  <SelectTrigger id="art-anlass" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="erstgespraech">Erstgespräch</SelectItem>
                    <SelectItem value="beratung">Beratungsgespräch</SelectItem>
                    <SelectItem value="objektvorstellung">Objektvorstellung</SelectItem>
                    <SelectItem value="finanzierungsgespraech">Finanzierungsgespräch</SelectItem>
                    {/* Der Bewerberprozess gehoert allein der Rolle hr. Eine
                        bereits gesetzte Art bleibt sichtbar, sonst stuende im
                        Feld ein leerer Wert. */}
                    {(user.role === "hr" || entwurf.anlass === "bewerbergespraech") && (
                      <SelectItem value="bewerbergespraech">Bewerbergespräch</SelectItem>
                    )}
                    <SelectItem value="sonstiges">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="art-puffer">Puffer danach in Minuten</Label>
                <Input
                  id="art-puffer"
                  type="number"
                  min={0}
                  step={5}
                  value={entwurf.pufferNachMinuten}
                  onChange={(e) => setEntwurf((v) => ({ ...v, pufferNachMinuten: Number(e.target.value) || 0 }))}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Pause nach dem Gespräch, bevor der nächste Termin buchbar ist.
                </p>
              </div>
              <div>
                <Label htmlFor="art-vorlauf">Frühestens buchbar in Stunden</Label>
                <Input
                  id="art-vorlauf"
                  type="number"
                  min={0}
                  value={Math.round(entwurf.vorlaufMinuten / 60)}
                  onChange={(e) => setEntwurf((v) => ({ ...v, vorlaufMinuten: (Number(e.target.value) || 0) * 60 }))}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  So viel Vorlauf hast du mindestens vor einem neuen Termin.
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="art-vorausschau">Buchbar bis wie viele Tage im Voraus</Label>
              <Input
                id="art-vorausschau"
                type="number"
                min={1}
                max={365}
                value={entwurf.vorausschauTage}
                onChange={(e) => setEntwurf((v) => ({ ...v, vorausschauTage: Number(e.target.value) || 60 }))}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                So weit darf der Kunde nach vorne blättern. Zwischen 1 und 365 Tagen.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium">Am offenen Link zeigen</p>
                <p className="text-xs text-muted-foreground">Sonst nur über einen persönlichen Link buchbar.</p>
              </div>
              <Switch
                className="data-[state=checked]:bg-success data-[state=unchecked]:bg-alert-red"
                aria-label="Terminart am öffentlichen Buchungslink anzeigen"
                checked={entwurf.oeffentlich}
                onCheckedChange={(an) => setEntwurf((v) => ({ ...v, oeffentlich: an }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOffen(false)}>Abbrechen</Button>
            <Button onClick={() => void speichereArt()} disabled={speichert}>
              {speichert
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Wird gespeichert…</>
                : entwurf.id ? "Änderungen speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
