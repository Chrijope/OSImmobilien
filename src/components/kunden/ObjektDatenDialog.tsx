import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormProgress } from "@/components/ui/form-progress";
import { Check, Home, ImagePlus, Loader2, Trash2, AlertCircle } from "lucide-react";
import { verkaeuferNameLabel, type VerkaeuferArt } from "@/lib/verkaeuferName";
import {
  speichereObjektDaten, vorhandeneObjektDaten, rueckenAufObjektauswahl,
  hatBestandsWohnung, renditeAusMiete, kennzahlenLuecken,
  objektBereitsEingetragen, istAnderesObjekt, objektBezeichnung,
  reservierungStandFuerWechsel, weNrIstZahl, bilderListe, MAX_OBJEKT_BILDER,
  type ObjektDaten,
} from "@/lib/objektDatenPflicht";
import { OBJEKTARTEN_AUSWAHL, type Objektart } from "@/lib/objektseiteDaten";
import { zahlAusText } from "@/lib/zahlAusText";
import { PFLICHT_OFFEN_RAHMEN } from "@/lib/pflichtRahmen";
import {
  ladeObjektBildHoch, loescheObjektBild, ERLAUBTE_BILD_FORMATE,
} from "@/lib/objektBildUpload";

/**
 * Trägt die Objektdaten eines Investments ein und ändert sie.
 *
 * Das ist die einzige Stelle, an der Adresse, Einheit und Kaufpreis von Hand
 * gepflegt werden. Sie sitzt im Investment unter „Objektauswahl“. Früher
 * erschien dieses Fenster stattdessen beim Ziehen in der Pipeline, und zwar
 * nur, solange Angaben fehlten. Wer eine falsche Adresse eingetragen hatte,
 * kam nie wieder daran, denn das Fenster war ab da für immer zufrieden.
 *
 * Vier Schritte. Pflicht sind die ersten beiden: „Wo liegt sie“ und seit
 * 09/2026 auch „Kennzahlen“. Verkäufer und Später bleiben freiwillig, denn
 * beim Eintragen des Objekts steht der Verkäufer oft noch nicht fest und das
 * Grundbuch liegt noch gar nicht vor.
 *
 * Pflicht heißt hier: gekennzeichnet und aufgezählt, nicht verriegelt.
 * Gespeichert wird weiterhin, sobald Schritt 1 steht, und Schritt 3 und 4
 * bleiben erreichbar. Eine Sperre würde nur dazu führen, dass jemand eine
 * Etage erfindet, um weiterzukommen, und eine erfundene Etage ist schlechter
 * als eine fehlende. Stattdessen sagt das Fenster an jedem Feld und noch
 * einmal über den Knöpfen, was fehlt und was deshalb leer bleibt.
 *
 * Schritt 2 beginnt mit der Nutzungsart, weil sie die beiden Jahresfelder
 * lenkt: Baujahr und Fertigstellung sind ein Paar, von dem eines genügt. Beim
 * sanierten Bestand gibt es keine Fertigstellung, beim Neubau kein Baujahr.
 *
 * Wer weiterklickt, erspart sich später zwei Formulare: Die
 * Reservierungsvereinbarung und der Notar-Aufnahmebogen lesen aus dieser einen
 * Quelle, statt dieselbe Adresse ein zweites und drittes Mal abzufragen.
 *
 * Unter jedem Feld steht, was es bewirkt. Ohne diesen Hinweis füllt niemand
 * ein Feld aus, das er gerade nicht zur Hand hat.
 *
 * Abbrechen schreibt nichts.
 */

const SCHRITTE = ["Wo liegt sie", "Kennzahlen", "Verkäufer", "Später"];

/**
 * Wie viele Pflichtangaben Schritt 2 kennt.
 *
 * Aus der Prüfung selbst gezogen, mit einem leeren Datensatz. Eine getippte
 * Zahl liefe der Liste davon, sobald dort ein Feld dazukommt oder wegfällt.
 */
const KENNZAHLEN_GESAMT = kennzahlenLuecken({}).length;

/**
 * Beschriftung mit Hinweiszeile darunter.
 *
 * Der Hinweis ist der eigentliche Punkt: Ein freiwilliges Feld ohne
 * erkennbaren Nutzen bleibt leer. Steht darunter „Portal-Kachel Zimmer“, weiß
 * der Vertriebspartner, was der Kunde gleich sieht und was fehlt, wenn er es
 * überspringt.
 */
function Feld({
  id, label, pflicht, offen, paar, freiwillig, hinweis, children,
}: {
  id: string; label: string; pflicht?: boolean;
  /**
   * Pflicht und noch nicht ausgefüllt: orange Rahmen wie in der
   * Selbstauskunft. Ob ein Feld ausgefüllt ist, entscheidet die Aufrufstelle
   * mit derselben Regel wie die Pflichtprüfung, sonst verschwände der Rahmen
   * etwa bei einer getippten 0, die die Prüfung gar nicht gelten lässt.
   */
  offen?: boolean;
  /**
   * Das zweite Feld einer Pflicht, von der eines von beiden genügt.
   * Steht als Klammerzusatz hinter dem Stern, sonst liest sich das Paar wie
   * zwei einzelne Pflichtfelder und eines davon ist immer unerfüllbar.
   */
  paar?: string;
  freiwillig?: boolean;
  hinweis?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
        {pflicht && <span className="text-destructive"> *</span>}
        {paar && <span className="text-muted-foreground font-normal"> (oder {paar})</span>}
        {freiwillig && <span className="text-muted-foreground font-normal"> (freiwillig)</span>}
      </Label>
      <div className={offen ? `mt-1 ${PFLICHT_OFFEN_RAHMEN}` : "mt-1"}>{children}</div>
      {hinweis && <p className="mt-1 text-[11px] text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

/**
 * Eine von wenigen Möglichkeiten, sichtbar bevor jemand tippt.
 *
 * Für „Firma oder Privatperson“ beim Verkäufer und für die Nutzungsart in
 * Schritt 2. Eine Auswahlliste wäre an beiden Stellen falsch: Sie versteckt
 * die übrigen Möglichkeiten hinter einem Klick, und beide Fragen sind mit
 * einem Blick beantwortet, wenn alle Antworten nebeneinander stehen.
 */
function Wahl({
  gewaehlt, label, onClick,
}: { gewaehlt: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={gewaehlt}
      className={[
        "flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors",
        gewaehlt
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/50",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          gewaehlt ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        ].join(" ")}
      >
        {gewaehlt && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </button>
  );
}

/** Ein Geldbetrag, wie ihn die Objektauswahl überall zeigt. */
const euro = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

export function ObjektDatenDialog({
  offen,
  investmentId,
  zielStufeLabel,
  gewechseltVon,
  onAbbrechen,
  onGespeichert,
}: {
  offen: boolean;
  investmentId: string;
  /**
   * Nur noch für Aufrufe, die unmittelbar eine Stufe setzen. Bleibt das Feld
   * leer, erklärt der Kopf stattdessen die Objektauswahl selbst.
   */
  zielStufeLabel?: string;
  /**
   * Wer gerade eingetragen hat. Steht beim Objektwechsel im Verlauf. Fehlt der
   * Name, bleibt der Verlauf trotzdem vollständig, nur ohne Person.
   */
  gewechseltVon?: string;
  onAbbrechen: () => void;
  onGespeichert: () => void;
}) {
  const [schritt, setSchritt] = useState(0);
  // Schritt 1, Pflicht
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");
  const [weNr, setWeNr] = useState("");
  /**
   * Was mit der Eingabe der Wohneinheit geschehen ist, im Klartext.
   *
   * Zwei Fälle: Beim Öffnen wurde ein altes „WE 14“ auf die Zahl gekürzt, oder
   * beim Tippen ist etwas weggefallen, das keine Ziffer war. Ohne diesen Satz
   * verschwänden Zeichen kommentarlos, und das sieht aus wie ein Fehler.
   */
  const [weNrMeldung, setWeNrMeldung] = useState("");
  const [kaufpreis, setKaufpreis] = useState("");
  /*
    Alle Bilder der Immobilie, das erste ist das Titelbild. Bis zum 22.09.2026
    war hier genau ein Bild vorgesehen; Christian wollte mehrere, damit der
    Kunde die Wohnung sieht und nicht nur die Fassade.
  */
  const [bilder, setBilder] = useState<string[]>([]);
  /** Schwebt gerade eine Datei über dem Feld? Nur für die Einfärbung. */
  const [ueberDemFeld, setUeberDemFeld] = useState(false);
  /** Das Bild, das gerade an eine andere Stelle gezogen wird, und sein Ziel. */
  const [geschoben, setGeschoben] = useState<number | null>(null);
  const [zielPlatz, setZielPlatz] = useState<number | null>(null);
  // Schritt 2, empfohlen
  const [objektart, setObjektart] = useState<Objektart | "">("");
  const [wohnflaeche, setWohnflaeche] = useState("");
  const [zimmer, setZimmer] = useState("");
  const [baujahr, setBaujahr] = useState("");
  const [etage, setEtage] = useState("");
  const [lage, setLage] = useState("");
  const [fertigstellung, setFertigstellung] = useState("");
  const [miete, setMiete] = useState("");
  const [hausgeld, setHausgeld] = useState("");
  // Schritt 3, empfohlen
  const [vkArt, setVkArt] = useState<VerkaeuferArt | "">("");
  const [vkVorname, setVkVorname] = useState("");
  const [vkName, setVkName] = useState("");
  const [vkStrasse, setVkStrasse] = useState("");
  const [vkPlz, setVkPlz] = useState("");
  const [vkOrt, setVkOrt] = useState("");
  const [vkHrb, setVkHrb] = useState("");
  const [vkEmail, setVkEmail] = useState("");
  const [vkTelefon, setVkTelefon] = useState("");
  // Schritt 4, freiwillig
  const [amtsgericht, setAmtsgericht] = useState("");
  const [gemarkung, setGemarkung] = useState("");
  const [blatt, setBlatt] = useState("");
  const [flurstueck, setFlurstueck] = useState("");
  const [miteigentum, setMiteigentum] = useState("");
  const [wohnungsnummer, setWohnungsnummer] = useState("");
  const [nebenkosten, setNebenkosten] = useState("");
  const [grundstueckAnteil, setGrundstueckAnteil] = useState("");
  const [hausgeldNichtUmlage, setHausgeldNichtUmlage] = useState("");

  const [laedt, setLaedt] = useState(false);
  const [bildFehler, setBildFehler] = useState("");
  /*
   * Die Rückfrage vor dem Ersetzen eines eingetragenen Objekts.
   *
   * Beide Fassungen werden festgehalten, das bisherige Objekt und das neue.
   * Nur so kann die Rückfrage beide beim Namen nennen, statt allgemein zu
   * fragen, ob man sich sicher sei.
   */
  const [rueckfrage, setRueckfrage] = useState<{ alt: Partial<ObjektDaten>; neu: ObjektDaten } | null>(null);
  const dateiFeld = useRef<HTMLInputElement>(null);
  /*
   * Ein Bild, das hochgeladen und dann doch verworfen wurde, bleibt sonst als
   * Leiche im Speicher liegen. Beim Abbrechen wird es wieder entfernt, beim
   * Speichern nicht.
   */
  const neuHochgeladen = useRef<string[]>([]);
  /** Die Bilder, die beim Öffnen gespeichert waren. Entfernte werden aufgeräumt. */
  const urspruenglicheBilder = useRef<string[]>([]);
  /*
   * Ob das Fenster für einen frischen Eintrag offen ist.
   *
   * Das Bild ist seit dem 22.09.2026 Pflicht, aber nur beim Anlegen. Ein
   * Investment, das es lange vor dieser Regel ohne Bild gab, liesse sich sonst
   * nicht einmal mehr im Kaufpreis korrigieren, ohne dass jemand erst ein Foto
   * sucht.
   */
  const frischerEintrag = useRef(false);
  /*
   * Beim eigenen Bestand hängen die Bilder am Objekt und werden dort gepflegt.
   *
   * Solange der Bestandsweg abgeschaltet ist (`BESTANDSWOHNUNG_AKTIV` in
   * `objektDatenPflicht`), ist das nie der Fall: Jedes Investment bekommt das
   * Bildfeld und schreibt seine Bildadresse selbst. Die beiden Zweige bleiben
   * stehen, damit sie beim Wiedereinschalten sofort wieder greifen.
   */
  const ausBestand = hatBestandsWohnung(investmentId);

  // Was schon bekannt ist, wird vorausgefüllt. Getippt wird nur, was fehlt.
  useEffect(() => {
    if (!offen || !investmentId) return;
    const d = vorhandeneObjektDaten(investmentId);
    const t = (v?: number) => (v && v > 0 ? String(v) : "");
    setSchritt(0);
    setStrasse(d.strasse || "");
    setPlz(d.plz || "");
    setOrt(d.ort || "");
    /*
     * Die Wohneinheit ist seit 09/2026 eine reine Zahl. Bestehende Vorgänge
     * tragen dort aber Text, meist „WE 14“, weil genau das jahrelang als
     * Platzhalter vorgeschlagen wurde.
     *
     * Ein vorangestelltes „WE“ vor einer Ziffer wird deshalb beim Öffnen
     * abgeschnitten und der Fall benannt. Alles andere bleibt stehen, wie es
     * ist: Aus „2. OG links“ eine 2 zu machen wäre geraten, nicht korrigiert.
     * Gespeichert wird ohnehin erst auf Knopfdruck.
     */
    const weRoh = String(d.weNr || "").trim();
    const weGekuerzt = weRoh.replace(/^we[\s.:_-]*(?=\d)/i, "");
    setWeNr(weGekuerzt);
    setWeNrMeldung(
      weGekuerzt !== weRoh
        ? `Bisher stand hier „${weRoh}“. Die Wohneinheit ist jetzt eine reine Zahl.`
        : "",
    );
    setKaufpreis(d.kaufpreis ? String(d.kaufpreis) : "");
    setObjektart(d.objektart || "");
    setWohnflaeche(t(d.wohnflaeche));
    setBilder(bilderListe(d.bilder, d.bildUrl));
    setZimmer(t(d.zimmer));
    setBaujahr(t(d.baujahr));
    setEtage(d.etage || "");
    setLage(d.lage || "");
    setFertigstellung(d.fertigstellung || "");
    setMiete(t(d.miete));
    setHausgeld(t(d.hausgeld));
    setVkArt(d.verkaeufer?.art || "");
    setVkVorname(d.verkaeufer?.vorname || "");
    setVkName(d.verkaeufer?.name || "");
    setVkStrasse(d.verkaeufer?.strasse || "");
    setVkPlz(d.verkaeufer?.plz || "");
    setVkOrt(d.verkaeufer?.ort || "");
    setVkHrb(d.verkaeufer?.handelsregister || "");
    setVkEmail(d.verkaeufer?.email || "");
    setVkTelefon(d.verkaeufer?.telefon || "");
    setAmtsgericht(d.grundbuch?.amtsgericht || "");
    setGemarkung(d.grundbuch?.gemarkung || "");
    setBlatt(d.grundbuch?.blatt || "");
    setFlurstueck(d.grundbuch?.flurstueck || "");
    setMiteigentum(t(d.grundbuch?.miteigentumsanteil));
    setWohnungsnummer(d.grundbuch?.wohnungsnummer || "");
    setNebenkosten(t(d.nebenkosten));
    setGrundstueckAnteil(t(d.grundstueckAnteil));
    setHausgeldNichtUmlage(t(d.hausgeldNichtUmlage));
    setBildFehler("");
    setRueckfrage(null);
    neuHochgeladen.current = [];
    urspruenglicheBilder.current = bilderListe(d.bilder, d.bildUrl);
    // Frisch ist der Eintrag, wenn weder Adresse noch Kaufpreis dastehen.
    frischerEintrag.current = !String(d.strasse || "").trim() && !(Number(d.kaufpreis) > 0);
  }, [offen, investmentId]);

  /**
   * Nimmt Bilder auf, aus dem Dateidialog wie aus dem Ziehen ins Feld.
   *
   * Nacheinander und nicht gleichzeitig: Jedes Bild wird vor dem Hochladen
   * verkleinert, und sechs davon parallel bringen ein Telefon ins Stocken.
   * Der Reihe nach dauert es etwas länger und bleibt bedienbar.
   */
  const bilderAufnehmen = async (dateien: File[]) => {
    const platz = MAX_OBJEKT_BILDER - bilder.length;
    if (platz <= 0) {
      setBildFehler(`Mehr als ${MAX_OBJEKT_BILDER} Bilder gehen nicht. Entferne eines, um ein anderes aufzunehmen.`);
      return;
    }
    const bildDateien = dateien.filter((datei) => datei.type.startsWith("image/"));
    setBildFehler(
      bildDateien.length < dateien.length
        ? "Aufgenommen werden nur Bilder. Unterlagen gehören an das Objekt, nicht an den Kaufvorgang."
        : "",
    );
    if (bildDateien.length === 0) return;

    setLaedt(true);
    const neue: string[] = [];
    let fehler = "";
    for (const datei of bildDateien.slice(0, platz)) {
      const ergebnis = await ladeObjektBildHoch(investmentId, datei);
      if (ergebnis.ok && ergebnis.url) {
        neue.push(ergebnis.url);
        neuHochgeladen.current.push(ergebnis.url);
      } else if (!fehler) {
        fehler = ergebnis.fehler || "Das Bild konnte nicht gespeichert werden.";
      }
    }
    setLaedt(false);
    if (neue.length > 0) setBilder((bisher) => bilderListe([...bisher, ...neue]));
    if (fehler) setBildFehler(fehler);
    else if (bildDateien.length > platz) {
      setBildFehler(
        `Es war noch Platz für ${platz}. Mehr als ${MAX_OBJEKT_BILDER} Bilder trägt ein Kaufvorgang nicht.`,
      );
    }
  };

  const bildEntfernen = (index: number) => {
    setBildFehler("");
    const weg = bilder[index];
    /*
     * Ein Bild, das gerade erst in diesem Fenster hochgeladen wurde, ist
     * sofort löschbar. Ein bereits gespeichertes bleibt liegen, bis wirklich
     * gespeichert wird, sonst wäre es beim Abbrechen unwiederbringlich weg.
     */
    if (weg && neuHochgeladen.current.includes(weg)) {
      void loescheObjektBild(weg);
      neuHochgeladen.current = neuHochgeladen.current.filter((u) => u !== weg);
    }
    setBilder((bisher) => bisher.filter((_, i) => i !== index));
    if (dateiFeld.current) dateiFeld.current.value = "";
  };

  /**
   * Schiebt ein Bild an eine andere Stelle, für die Wahl des Titelbilds.
   *
   * Verschieben, nicht tauschen: Wer das dritte Bild nach vorne zieht, will es
   * als Titelbild und erwartet, dass die anderen nachrücken.
   */
  const bilderUmsortieren = (von: number, nach: number) => {
    setBilder((bisher) => {
      if (von === nach || von < 0 || nach < 0 || von >= bisher.length || nach >= bisher.length) return bisher;
      const sortiert = [...bisher];
      const [bild] = sortiert.splice(von, 1);
      sortiert.splice(nach, 0, bild);
      return sortiert;
    });
  };

  /** Beim Abbrechen wird alles wieder entfernt, was hier neu entstanden ist. */
  const abbrechen = () => {
    for (const u of neuHochgeladen.current) void loescheObjektBild(u);
    neuHochgeladen.current = [];
    onAbbrechen();
  };

  const preis = zahlAusText(kaufpreis);
  const flaeche = zahlAusText(wohnflaeche);
  const mieteZahl = zahlAusText(miete);
  const rendite = renditeAusMiete(preis, mieteZahl);
  /*
   * Fünf Pflichtangaben, neu darunter die PLZ.
   *
   * Sie war bisher freiwillig, wird aber von der Reservierungsvereinbarung
   * verlangt und von der Marktwertschätzung gebraucht. Wer sie hier nicht
   * einträgt, tippt sie später doch, nur an einer Stelle, die es niemandem
   * sagt.
   */
  /*
   * Seit dem 22.09.2026 gehört mindestens ein Bild dazu, entschieden von
   * Christian: Ein Kaufvorgang ohne Bild sieht im Kundenportal nach nichts
   * aus. Gefordert wird es nur beim Anlegen. Bei einem Investment, das es
   * schon vorher gab, bleibt es ein Hinweis, sonst käme niemand mehr an den
   * Kaufpreis, ohne vorher ein Foto zu suchen.
   *
   * Beim eigenen Bestand entfällt die Forderung: Dort hängen die Bilder am
   * Objekt und lassen sich hier gar nicht eintragen.
   */
  const bildPflichtOffen = !ausBestand && frischerEintrag.current && bilder.length === 0;
  const vollstaendig =
    !!strasse.trim() && !!plz.trim() && !!ort.trim() && weNrIstZahl(weNr) && preis > 0 && !bildPflichtOffen;
  /*
   * Steht in der Wohneinheit etwas, das keine Zahl ist? Das kann nur aus einem
   * Altbestand kommen, denn hier lässt sich nichts anderes mehr tippen.
   * Gesagt wird es trotzdem, sonst bliebe der Speichern-Knopf ohne Grund grau.
   */
  const weNrUnzulaessig = !!weNr.trim() && !weNrIstZahl(weNr);
  const weNrHinweis = weNrUnzulaessig
    ? `„${weNr.trim()}“ ist keine Zahl. Bitte nur die Nummer der Einheit eintragen, also zum Beispiel 6.`
    : weNrMeldung;
  /*
   * Was in Schritt 2 noch fehlt, aus dem gerade Getippten und nicht aus der
   * Ablage. Sonst hinkte die Liste jedem Tastendruck einen Speichervorgang
   * hinterher.
   */
  const luecken = kennzahlenLuecken({
    objektart: objektart || undefined,
    wohnflaeche: flaeche,
    zimmer: zahlAusText(zimmer),
    baujahr: zahlAusText(baujahr),
    fertigstellung,
    etage,
    lage,
    miete: mieteZahl,
    hausgeld: zahlAusText(hausgeld),
  });
  /**
   * Steht diese Kennzahl noch in der offenen Liste? Für den orangen Rahmen.
   * Gefragt wird die Liste selbst, damit Rahmen und Aufzählung nie
   * auseinanderlaufen, auch nicht beim Paar Baujahr und Fertigstellung.
   */
  const kennzahlOffen = (feld: string) => luecken.some((l) => l.feld === feld);
  /*
   * Ob schon eine Reservierungsvereinbarung vorliegt. Für die Rückfrage vor
   * dem Objektwechsel: Sie wird beim Wechsel nicht gelöscht und nennt danach
   * weiter das alte Objekt.
   */
  const rvStand = reservierungStandFuerWechsel(investmentId);

  /** Was in den Feldern steht, als fertiger Datensatz. */
  const datenSammeln = (): ObjektDaten => {
    const daten: ObjektDaten = {
      strasse: strasse.trim(),
      plz: plz.trim(),
      ort: ort.trim(),
      weNr: weNr.trim(),
      kaufpreis: preis,
      ...(flaeche > 0 ? { wohnflaeche: flaeche } : {}),
      // Beim eigenen Bestand nichts schreiben: Die Bilder kommen vom Objekt.
      // Das erste Bild steht zusätzlich als `bildUrl` da, damit Kundenportal,
      // Mails und Exposé weiterhin genau ein Titelbild lesen.
      ...(ausBestand ? {} : { bilder, bildUrl: bilder[0] || "" }),
      // Ohne Wahl bleibt das Feld leer, statt eine Art zu erfinden. Die Karte
      // zeigt dann kein Kennzeichen, so wie bisher bei jedem Handeintrag.
      ...(objektart ? { objektart } : {}),
      zimmer: zahlAusText(zimmer),
      etage: etage.trim(),
      lage: lage.trim(),
      baujahr: zahlAusText(baujahr),
      fertigstellung: fertigstellung.trim(),
      miete: mieteZahl,
      hausgeld: zahlAusText(hausgeld),
      verkaeufer: {
        art: vkArt,
        name: vkName.trim(),
        // Bei einer Firma gibt es keinen Vornamen. Ein stehen gebliebener
        // Wert aus einer vorherigen Wahl würde sonst mitgespeichert und im
        // Notarbogen wieder auftauchen.
        vorname: vkArt === "firma" ? "" : vkVorname.trim(),
        strasse: vkStrasse.trim(),
        plz: vkPlz.trim(),
        ort: vkOrt.trim(),
        email: vkEmail.trim(),
        telefon: vkTelefon.trim(),
        handelsregister: vkHrb.trim(),
      },
      grundbuch: {
        amtsgericht: amtsgericht.trim(),
        gemarkung: gemarkung.trim(),
        blatt: blatt.trim(),
        flurstueck: flurstueck.trim(),
        miteigentumsanteil: zahlAusText(miteigentum),
        wohnungsnummer: wohnungsnummer.trim(),
      },
      nebenkosten: zahlAusText(nebenkosten),
      grundstueckAnteil: zahlAusText(grundstueckAnteil),
      hausgeldNichtUmlage: zahlAusText(hausgeldNichtUmlage),
    };
    return daten;
  };

  /** Schreibt wirklich. Erst hier, nach einer etwaigen Rückfrage. */
  const uebernehmen = (daten: ObjektDaten) => {
    speichereObjektDaten(investmentId, daten, { gewechseltVon });
    /*
     * Erst jetzt das alte Bild entfernen, nach dem Speichern.
     *
     * Vorher wäre es weg, obwohl der Vorgang noch scheitern oder abgebrochen
     * werden könnte. Gelöscht wird nur ein Bild dieses Investments, das
     * Aufräumen ist in `loescheObjektBild` auf diesen Pfad begrenzt.
     */
    const bleiben = new Set(daten.bilder || []);
    for (const alt of urspruenglicheBilder.current) {
      if (!bleiben.has(alt)) void loescheObjektBild(alt);
    }
    urspruenglicheBilder.current = daten.bilder || [];
    neuHochgeladen.current = [];
    setRueckfrage(null);
    onGespeichert();
  };

  /*
   * Speichern, mit einer Rückfrage genau dann, wenn ein eingetragenes Objekt
   * durch ein anderes ersetzt wird.
   *
   * Gefragt wird beim Speichern und nicht schon beim Öffnen des Fensters. Beim
   * Öffnen steht nämlich noch gar nicht fest, ob überhaupt gewechselt werden
   * soll: Dasselbe Fenster dient auch dazu, das Hausgeld nachzutragen. Erst
   * hier sind beide Objekte bekannt, und erst hier kann die Rückfrage sie beim
   * Namen nennen.
   */
  const speichern = () => {
    if (!vollstaendig) return;
    const daten = datenSammeln();
    const alt = vorhandeneObjektDaten(investmentId);
    if (objektBereitsEingetragen(investmentId) && istAnderesObjekt(alt, daten)) {
      setRueckfrage({ alt, neu: daten });
      return;
    }
    uebernehmen(daten);
  };

  /* ── Schritt 1: wo liegt die Wohnung ── */
  const schritt1 = (
    <div className="space-y-3">
      <Feld id="od-strasse" label="Straße und Hausnummer" pflicht offen={!strasse.trim()}>
        <Input
          id="od-strasse"
          className="h-9"
          aria-required
          value={strasse}
          onChange={(e) => setStrasse(e.target.value)}
          placeholder="z. B. Roonstraße 3"
          autoFocus
        />
      </Feld>

      <div className="grid grid-cols-3 gap-3">
        <Feld
          id="od-plz"
          label="PLZ"
          pflicht
          offen={!plz.trim()}
          hinweis="Neu Pflicht: Die Reservierung und die Marktwertschätzung verlangen sie ohnehin."
        >
          <Input id="od-plz" className="h-9" aria-required value={plz} onChange={(e) => setPlz(e.target.value)} placeholder="95028" />
        </Feld>
        <div className="col-span-2">
          <Feld id="od-ort" label="Ort" pflicht offen={!ort.trim()}>
            <Input id="od-ort" className="h-9" aria-required value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="Hof" />
          </Feld>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/*
          Nur die Zahl, kein freier Text.

          Vorher stand hier „z. B. WE 6“ als Platzhalter, und genau das wurde
          eingetragen: „WE 14“, manchmal auch „2. OG links“. In der Karte
          stand danach „WE WE 14“, und sortieren ließ sich das nirgends.
          Deshalb nimmt das Feld nur noch Ziffern an, mit der Zifferntastatur
          auf dem Telefon. Das „WE“ setzt die Anzeige selbst davor.
        */}
        {/*
          Die Warnzeile steht hinter dem Feld und nicht darin: Der orange
          Rahmen färbt alles, was direkt im Feldbehälter liegt, sonst bekäme
          die Zeile selbst einen Rahmen.
        */}
        <div>
          <Feld
            id="od-we"
            label="Wohneinheit"
            pflicht
            offen={!weNrIstZahl(weNr)}
            hinweis={weNrHinweis ? undefined : "Nur die Zahl. In Karte und Kundenportal steht sie als „WE 6“."}
          >
            <Input
              id="od-we"
              className="h-9"
              aria-required
              inputMode="numeric"
              value={weNr}
              onChange={(e) => {
                const roh = e.target.value;
                const nurZiffern = roh.replace(/\D/g, "");
                setWeNr(nurZiffern);
                setWeNrMeldung(
                  nurZiffern === roh ? "" : "Hier gehört nur die Zahl hinein, ohne „WE“ und ohne Zusatz.",
                );
              }}
              placeholder="z. B. 6"
            />
          </Feld>
          {weNrHinweis && (
            <p className="mt-1 text-[11px] text-[hsl(var(--warning))] flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>{weNrHinweis}</span>
            </p>
          )}
        </div>
        <Feld id="od-preis" label="Kaufpreis in Euro" pflicht offen={!(preis > 0)}>
          <Input
            id="od-preis"
            className="h-9"
            aria-required
            inputMode="decimal"
            value={kaufpreis}
            onChange={(e) => setKaufpreis(e.target.value)}
            placeholder="z. B. 189000"
          />
        </Feld>
      </div>

      {/*
        Die Bilder der Immobilie.

        Beim eigenen Bestand entfällt das Feld: Dort hängen die Bilder am
        Objekt und werden zentral gepflegt, genau wie Adresse und Preis.
        Ein zweiter Satz am Kaufvorgang liefe ihnen davon.
      */}
      <div>
        <Label className="text-xs font-semibold">
          Bilder der Immobilie{" "}
          {ausBestand ? null : bildPflichtOffen ? (
            <span className="text-destructive font-normal">(mindestens eines)</span>
          ) : (
            <span className="text-muted-foreground font-normal">({bilder.length} von {MAX_OBJEKT_BILDER})</span>
          )}
        </Label>

        {ausBestand ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Die Bilder kommen aus dem Objekt im eigenen Bestand und werden dort gepflegt.
          </p>
        ) : (
          <>
            {/*
              Ziehen und Ablegen wie in der Investmentkalkulation, damit beide
              Stellen sich gleich anfühlen. Ohne `preventDefault` am Überfahren
              nimmt der Browser die Datei selbst an und öffnet sie in einem
              neuen Tab, das halb ausgefüllte Fenster wäre dann weg.

              Der äußere Behälter trägt den orangen Pflichtrahmen, solange
              beim Anlegen noch kein Bild da ist, dieselbe Regel wie beim
              Speichern-Knopf.
            */}
            <div className={bildPflichtOffen ? PFLICHT_OFFEN_RAHMEN : undefined}>
              <div
                className={`mt-1 rounded-md border border-dashed p-3 transition-colors ${
                  ueberDemFeld ? "border-primary bg-primary/5" : "border-border"
                }`}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  setUeberDemFeld(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUeberDemFeld(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setUeberDemFeld(false);
                  void bilderAufnehmen(Array.from(e.dataTransfer.files));
                }}
              >
                <div className="flex gap-2 flex-wrap items-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    disabled={laedt || bilder.length >= MAX_OBJEKT_BILDER}
                    onClick={() => dateiFeld.current?.click()}
                  >
                    {laedt ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Wird hochgeladen</>
                    ) : (
                      <><ImagePlus className="h-3 w-3 mr-1" /> Bilder hochladen</>
                    )}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {ueberDemFeld ? "Jetzt loslassen" : `Bilder hierher ziehen oder klicken · bis zu ${MAX_OBJEKT_BILDER}`}
                  </span>
                </div>

                {bilder.length > 0 && (
                  <>
                    {/*
                      Das erste Bild ist das Titelbild. Wer ein anderes vorne
                      haben will, zieht es nach vorne, statt alle zu löschen und
                      neu hochzuladen.
                    */}
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {bilder.map((url, index) => (
                        <div
                          key={url}
                          className={`relative aspect-square overflow-hidden rounded-md border bg-muted/40 cursor-grab ${
                            geschoben === index ? "opacity-40" : ""
                          } ${zielPlatz === index && geschoben !== index ? "ring-2 ring-primary" : ""}`}
                          draggable
                          onDragStart={(e) => {
                            setGeschoben(index);
                            // Ohne Nutzlast bricht Firefox das Ziehen sofort ab.
                            e.dataTransfer.setData("text/plain", String(index));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            if (e.dataTransfer.types.includes("Files")) return;
                            e.preventDefault();
                            setZielPlatz(index);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (geschoben !== null) bilderUmsortieren(geschoben, index);
                            setGeschoben(null);
                            setZielPlatz(null);
                          }}
                          onDragEnd={() => {
                            setGeschoben(null);
                            setZielPlatz(null);
                          }}
                        >
                          <img
                            src={url}
                            alt={`Bild ${index + 1} der Immobilie`}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                          <button
                            type="button"
                            aria-label={`Bild ${index + 1} entfernen`}
                            className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                            onClick={() => bildEntfernen(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          {index === 0 && (
                            <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
                              Titelbild
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {bilder.length > 1 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Ein Bild auf ein anderes ziehen, um die Reihenfolge zu ändern.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              JPG, PNG oder WEBP, bis 10 MB je Bild. Große Bilder werden automatisch verkleinert.
              Der Kunde sieht sie in seinem Portal, das erste als Titelbild.
            </p>

            <input
              ref={dateiFeld}
              type="file"
              accept={ERLAUBTE_BILD_FORMATE}
              multiple
              className="hidden"
              onChange={(e) => {
                const dateien = Array.from(e.target.files ?? []);
                // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
                e.target.value = "";
                void bilderAufnehmen(dateien);
              }}
            />

            {bildFehler && (
              <p className="mt-2 text-[11px] text-destructive flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>{bildFehler}</span>
              </p>
            )}
          </>
        )}
      </div>

      <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Wirkung:</span> Diese fünf Angaben füllen im
        Kundenportal die Objektkachel, tragen den Kaufpreis in Portfoliowert und Pipelinesumme und
        werden ab jetzt auch in die Reservierungsvereinbarung und den Notar-Aufnahmebogen übernommen.
      </p>
    </div>
  );

  /* ── Schritt 2: was die Wohnung ausmacht, seit 09/2026 Pflicht ── */
  const schritt2 = (
    <div className="space-y-3">
      {/*
        Die Nutzungsart, drei Knöpfe nebeneinander.

        Sie steht vor allen anderen Kennzahlen, weil sie die beiden
        Jahresfelder darunter lenkt: Beim Neubau zählt die Fertigstellung,
        beim sanierten Bestand das Baujahr. Wer zuerst wählt, weiß danach,
        welches der beiden Felder er ausfüllt.

        Zur Wahl stehen drei der vier Objektarten. KfW 40 fehlt auf
        ausdrückliche Entscheidung, ein KfW-40-Haus ist hier ein Neubau.
        Warum die Art trotzdem in `OBJEKTARTEN` bleibt, steht bei
        `OBJEKTARTEN_AUSWAHL`.
      */}
      <div>
        <Label className="text-xs font-semibold">
          Nutzungsart<span className="text-destructive"> *</span>
        </Label>
        {/*
          Der Rahmen legt sich um die ganze Knopfreihe, nicht um jeden Knopf.
          Der durchsichtige Rand hält den Platz, damit nach der Wahl nichts
          springt.
        */}
        <div className={kennzahlOffen("Nutzungsart") ? `mt-1.5 ${PFLICHT_OFFEN_RAHMEN}` : "mt-1.5"}>
          <div className="flex w-fit flex-wrap gap-2 rounded-lg border border-transparent p-1">
            {OBJEKTARTEN_AUSWAHL.map((art) => (
              <Wahl
                key={art.id}
                gewaehlt={objektart === art.id}
                label={art.label}
                onClick={() => setObjektart(art.id)}
              />
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Kennzeichen an der Objektkarte. Ein Klick, und jeder sieht auf einen Blick, um welche Art
          von Objekt es geht.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Feld id="od-flaeche" label="Wohnfläche in m²" pflicht offen={kennzahlOffen("Wohnfläche")} hinweis="Portal-Kachel, Anlage V, Preis je m²">
          <Input id="od-flaeche" className="h-9" aria-required inputMode="decimal" value={wohnflaeche} onChange={(e) => setWohnflaeche(e.target.value)} placeholder="62" />
        </Feld>
        <Feld id="od-zimmer" label="Zimmer" pflicht offen={kennzahlOffen("Zimmer")} hinweis="Portal-Kachel Zimmer">
          <Input id="od-zimmer" className="h-9" aria-required inputMode="decimal" value={zimmer} onChange={(e) => setZimmer(e.target.value)} placeholder="2" />
        </Feld>
        <Feld
          id="od-baujahr"
          label="Baujahr"
          pflicht
          offen={kennzahlOffen("Baujahr oder Fertigstellung")}
          paar="Fertigstellung"
          hinweis="Abschreibungssatz im Steuer-Cockpit. Beim Neubau bleibt es leer."
        >
          <Input id="od-baujahr" className="h-9" aria-required={kennzahlOffen("Baujahr oder Fertigstellung")} inputMode="numeric" value={baujahr} onChange={(e) => setBaujahr(e.target.value)} placeholder="1996" />
        </Feld>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Feld id="od-etage" label="Etage" pflicht offen={kennzahlOffen("Etage")} hinweis="Portal-Kachel Etage">
          <Input id="od-etage" className="h-9" aria-required value={etage} onChange={(e) => setEtage(e.target.value)} placeholder="2. OG" />
        </Feld>
        <Feld
          id="od-lage"
          label="Lage"
          pflicht
          offen={kennzahlOffen("Lage")}
          hinweis="Portal-Kachel Lage. Links, rechts, Mitte oder die Himmelsrichtung, je nachdem was im Exposé steht."
        >
          <Input id="od-lage" className="h-9" aria-required value={lage} onChange={(e) => setLage(e.target.value)} placeholder="links oder Südwest" />
        </Feld>
        <Feld
          id="od-fertig"
          label="Fertigstellung"
          pflicht
          offen={kennzahlOffen("Baujahr oder Fertigstellung")}
          paar="Baujahr"
          hinweis="Nur bei Neubau. Die Jahreszahl daraus ersetzt dann das Baujahr."
        >
          <Input id="od-fertig" className="h-9" aria-required={kennzahlOffen("Baujahr oder Fertigstellung")} value={fertigstellung} onChange={(e) => setFertigstellung(e.target.value)} placeholder="nur bei Neubau, z. B. Q3 2024" />
        </Feld>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Feld id="od-miete" label="Kaltmiete je Monat" pflicht offen={kennzahlOffen("Kaltmiete")} hinweis="Portal, Rendite, Steuer-Cockpit, Liquidität">
          <Input id="od-miete" className="h-9" aria-required inputMode="decimal" value={miete} onChange={(e) => setMiete(e.target.value)} placeholder="620" />
        </Feld>
        <Feld id="od-hausgeld" label="Hausgeld je Monat" pflicht offen={kennzahlOffen("Hausgeld")} hinweis="Steuer-Cockpit, Liquidität, Anlage V">
          <Input id="od-hausgeld" className="h-9" aria-required inputMode="decimal" value={hausgeld} onChange={(e) => setHausgeld(e.target.value)} placeholder="185" />
        </Feld>
        <div>
          <Label className="text-xs font-semibold">Rendite</Label>
          <div className="mt-1 h-9 rounded-md border border-input bg-muted/40 px-3 flex items-center text-sm">
            {rendite != null ? `${rendite.toFixed(2).replace(".", ",")} %` : "–"}
          </div>
          <p className="mt-1 text-[11px] text-primary">Wird gerechnet, nicht getippt</p>
        </div>
      </div>

      {/*
        Die offene Liste, ausführlich und mit Grund.

        Sie steht hier und nicht nur über den Knöpfen, weil hier eingetragen
        wird. Wer liest, dass ohne Hausgeld die Liquiditätskachel fehlt, holt
        das Exposé. Wer nur ein rotes Sternchen sieht, tippt eine Null.
      */}
      {luecken.length > 0 ? (
        <div className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2 text-[11px]">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
            Noch offen: {luecken.length} von {KENNZAHLEN_GESAMT} Kennzahlen
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {luecken.map((l) => (
              <li key={l.feld}>
                <span className="font-medium text-foreground">{l.feld}</span> · {l.wofuer}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted-foreground">
            Speichern geht trotzdem. Was hier fehlt, fehlt danach im Kundenportal und muss vor der
            Reservierungsvereinbarung nachgetragen werden.
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Vollständig:</span> Objektkachel,
          Steuer-Cockpit, Liquidität und Anlage V haben alles, was sie brauchen.
        </p>
      )}
    </div>
  );

  /*
   * Firma oder Privatperson wählen.
   *
   * Bei „Firma“ wandert ein bereits eingetragener Vorname zurück an den
   * Namen, statt unsichtbar liegen zu bleiben. Geteilt wird in die andere
   * Richtung nichts: Wer auf „Privatperson“ stellt, trägt Vorname und
   * Nachname selbst ein. Genau diese Teilung war der Fehler.
   */
  const waehleVkArt = (art: VerkaeuferArt) => {
    setVkArt(art);
    if (art !== "firma") return;
    const vorname = vkVorname.trim();
    if (!vorname) return;
    setVkName([vorname, vkName.trim()].filter(Boolean).join(" "));
    setVkVorname("");
  };

  /* ── Schritt 3: wer verkauft ── */
  const schritt3 = (
    <div className="space-y-3">
      {/*
        Die Wahl steht vor den Namensfeldern, nicht darunter. Sie entscheidet,
        ob es ein Namensfeld gibt oder zwei, und das soll man sehen, bevor man
        tippt. Bei Bauträgern ist die Firma der Regelfall, deshalb links.
      */}
      <div>
        <Label className="text-xs font-semibold">Wer verkauft?</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Wahl gewaehlt={vkArt === "firma"} label="Firma" onClick={() => waehleVkArt("firma")} />
          <Wahl gewaehlt={vkArt === "person"} label="Privatperson" onClick={() => waehleVkArt("person")} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {vkArt === "firma"
            ? "Der Firmenname steht vollständig in einem Feld. Im Notarbogen wird er nicht mehr geteilt."
            : vkArt === "person"
              ? "Vorname und Nachname stehen getrennt, so wie der Notar sie braucht."
              : "Bei Bauträgern ist die Firma der Regelfall. Ohne diese Wahl bleibt der Name so stehen, wie er eingetragen ist."}
        </p>
      </div>

      {vkArt === "person" ? (
        <div className="grid grid-cols-2 gap-3">
          <Feld id="od-vkvorname" label="Vorname" hinweis="Pflichtfeld im Notar-Aufnahmebogen">
            <Input id="od-vkvorname" className="h-9" value={vkVorname} onChange={(e) => setVkVorname(e.target.value)} placeholder="Erika" />
          </Feld>
          <Feld id="od-vkname" label="Nachname" hinweis="Pflichtfeld in der Reservierungsvereinbarung und im Notar-Aufnahmebogen">
            <Input id="od-vkname" className="h-9" value={vkName} onChange={(e) => setVkName(e.target.value)} placeholder="Mustermann" />
          </Feld>
        </div>
      ) : (
        <Feld
          id="od-vkname"
          label={verkaeuferNameLabel(vkArt)}
          hinweis="Pflichtfeld in der Reservierungsvereinbarung und im Notar-Aufnahmebogen"
        >
          <Input id="od-vkname" className="h-9" value={vkName} onChange={(e) => setVkName(e.target.value)} placeholder="Musterbau Projektentwicklung GmbH" />
        </Feld>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Feld id="od-vkplz" label="PLZ">
          <Input id="od-vkplz" className="h-9" value={vkPlz} onChange={(e) => setVkPlz(e.target.value)} placeholder="83022" />
        </Feld>
        <div className="col-span-2">
          <Feld id="od-vkstrasse" label="Straße und Hausnummer">
            <Input id="od-vkstrasse" className="h-9" value={vkStrasse} onChange={(e) => setVkStrasse(e.target.value)} placeholder="Beispielallee 12" />
          </Feld>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Feld id="od-vkort" label="Ort">
          <Input id="od-vkort" className="h-9" value={vkOrt} onChange={(e) => setVkOrt(e.target.value)} placeholder="Rosenheim" />
        </Feld>
        <Feld id="od-vkhrb" label="Handelsregisternummer" freiwillig hinweis="Pflichtfeld im Notar-Aufnahmebogen">
          <Input id="od-vkhrb" className="h-9" value={vkHrb} onChange={(e) => setVkHrb(e.target.value)} placeholder="HRB 12345" />
        </Feld>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Feld id="od-vkmail" label="E-Mail" freiwillig hinweis="Notar-Aufnahmebogen">
          <Input id="od-vkmail" className="h-9" value={vkEmail} onChange={(e) => setVkEmail(e.target.value)} placeholder="kontakt@beispiel.test" />
        </Feld>
        <Feld id="od-vktel" label="Telefon" freiwillig hinweis="Notar-Aufnahmebogen">
          <Input id="od-vktel" className="h-9" value={vkTelefon} onChange={(e) => setVkTelefon(e.target.value)} placeholder="08031 000000" />
        </Feld>
      </div>

      <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Wirkung:</span> Die dritte Seite der
        Reservierungsvereinbarung ist damit vollständig vorausgefüllt, und im Notar-Aufnahmebogen
        entfällt der ganze erste Schritt bis auf das Geburtsdatum. Steht der Verkäufer noch nicht
        fest, bleibt der Schritt leer: Was später in der Reservierung eingetragen wird, fließt
        hierher zurück.
      </p>
    </div>
  );

  /* ── Schritt 4: später, spätestens zum Notartermin ── */
  const schritt4 = (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-xs font-semibold">
          Grundbuch <span className="text-muted-foreground font-normal">· aus dem Grundbuchauszug</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Feld id="od-ag" label="Amtsgericht" hinweis="Pflichtfeld im Notarbogen">
            <Input id="od-ag" className="h-9" value={amtsgericht} onChange={(e) => setAmtsgericht(e.target.value)} placeholder="Hof" />
          </Feld>
          <Feld id="od-gemarkung" label="Gemarkung" hinweis="Pflichtfeld im Notarbogen">
            <Input id="od-gemarkung" className="h-9" value={gemarkung} onChange={(e) => setGemarkung(e.target.value)} placeholder="Hof" />
          </Feld>
          <Feld id="od-blatt" label="Blatt" hinweis="Pflichtfeld im Notarbogen">
            <Input id="od-blatt" className="h-9" value={blatt} onChange={(e) => setBlatt(e.target.value)} placeholder="12345" />
          </Feld>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Feld id="od-flur" label="Flurstücknummer" hinweis="Pflichtfeld im Notarbogen">
            <Input id="od-flur" className="h-9" value={flurstueck} onChange={(e) => setFlurstueck(e.target.value)} placeholder="412/7" />
          </Feld>
          <Feld id="od-mea" label="Miteigentumsanteil in Prozent" hinweis="Anlage V, sonst 100 %">
            <Input id="od-mea" className="h-9" inputMode="decimal" value={miteigentum} onChange={(e) => setMiteigentum(e.target.value)} placeholder="2,41" />
          </Feld>
          <Feld id="od-wnr" label="Wohnungsnummer laut Teilungserklärung" hinweis="Notarbogen, Kaufvertrag">
            <Input id="od-wnr" className="h-9" value={wohnungsnummer} onChange={(e) => setWohnungsnummer(e.target.value)} placeholder="Nr. 6" />
          </Feld>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold">
          Steuerangaben <span className="text-muted-foreground font-normal">· aus dem Kaufvertrag</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Feld id="od-nk" label="Kaufnebenkosten in Euro" hinweis="Abschreibungsgrundlage">
            <Input id="od-nk" className="h-9" inputMode="decimal" value={nebenkosten} onChange={(e) => setNebenkosten(e.target.value)} placeholder="22.680" />
          </Feld>
          <Feld id="od-ga" label="Grundstücksanteil in Prozent" hinweis="Ohne diese Angabe keine Abschreibung">
            <Input id="od-ga" className="h-9" inputMode="decimal" value={grundstueckAnteil} onChange={(e) => setGrundstueckAnteil(e.target.value)} placeholder="18" />
          </Feld>
          <Feld
            id="od-hgnu"
            label="Nicht umlagefähiges Hausgeld"
            hinweis={
              zahlAusText(hausgeld) > 0
                ? `Nur dieser Teil des Hausgelds ist absetzbar. Vorschlag: 30 % von ${zahlAusText(hausgeld)}, also ${Math.round(zahlAusText(hausgeld) * 0.3)}.`
                : "Nur dieser Teil des Hausgelds ist absetzbar, ohne die Zuführung zur Rücklage."
            }
          >
            <Input id="od-hgnu" className="h-9" inputMode="decimal" value={hausgeldNichtUmlage} onChange={(e) => setHausgeldNichtUmlage(e.target.value)} placeholder="55" />
          </Feld>
        </div>
      </div>

      <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Wirkung:</span> Alles freiwillig und jederzeit
        nachtragbar. Wer es hier einträgt, muss es im Notar-Aufnahmebogen nicht mehr tippen.
      </p>
    </div>
  );

  const inhalte = [schritt1, schritt2, schritt3, schritt4];
  const letzter = schritt === SCHRITTE.length - 1;

  return (
    <Dialog open={offen} onOpenChange={(o) => { if (!o) abbrechen(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            Um welche Wohnung geht es?
          </DialogTitle>
          <DialogDescription>
            {zielStufeLabel ? (
              <>
                Für die Stufe „{zielStufeLabel}" muss feststehen, welche Immobilie gekauft wird und
                zu welchem Preis. Der Kunde sieht diese Angaben in seinem Portal, und der Kaufpreis
                fließt in die Gesamtsumme der Pipeline.
              </>
            ) : (
              <>
                Diese Angaben gelten für dieses Investment. Der Kunde sieht sie in seinem Portal,
                der Kaufpreis fließt in die Gesamtsumme der Pipeline, und in der Pipeline steht die
                Adresse an der Karte dieses Investments.
                {rueckenAufObjektauswahl(investmentId)
                  ? " Nach dem Speichern rückt der Vorgang auf die Stufe „Objektauswahl“ vor."
                  : ""}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/*
          Die Fortschrittsleiste zeigt, dass es weitergeht und was noch kommen
          kann. Sie zwingt zu nichts: Gespeichert wird ab Schritt 1, die
          Sprungmarken sind jederzeit erreichbar.
        */}
        <div className="-mx-6 border-y">
          <FormProgress steps={SCHRITTE} current={schritt} onJump={setSchritt} />
        </div>

        <div className="py-1">{inhalte[schritt]}</div>

        {/*
          Dieselbe Lücke noch einmal in einer Zeile, für die anderen Schritte.

          Erst ab dem Moment, in dem Schritt 1 steht: Vor dem ersten Tastendruck
          ist alles leer, und eine Warnung über ein Fenster, in dem noch nichts
          eingetragen wurde, liest niemand zweimal. In Schritt 2 selbst steht
          die ausführliche Liste, dort wäre die Zeile doppelt.
        */}
        {vollstaendig && schritt !== 1 && luecken.length > 0 && (
          <p className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px text-[hsl(var(--warning))]" />
            <span>
              <span className="font-semibold text-foreground">Kennzahlen unvollständig:</span>{" "}
              {luecken.map((l) => l.feld).join(", ")}. Gespeichert wird trotzdem.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setSchritt(1)}
              >
                Zu den Kennzahlen
              </button>
            </span>
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {schritt > 0 ? (
            <Button variant="ghost" onClick={() => setSchritt((s) => s - 1)} disabled={laedt}>Zurück</Button>
          ) : (
            <Button variant="ghost" onClick={abbrechen} disabled={laedt}>Abbrechen</Button>
          )}
          {!letzter && (
            <Button variant="outline" onClick={speichern} disabled={!vollstaendig || laedt}>
              {zielStufeLabel ? "Speichern und verschieben" : "Speichern und später ergänzen"}
            </Button>
          )}
          {letzter ? (
            <Button onClick={speichern} disabled={!vollstaendig || laedt}>
              {zielStufeLabel ? "Speichern und verschieben" : "Speichern"}
            </Button>
          ) : (
            <Button onClick={() => setSchritt((s) => s + 1)} disabled={laedt}>Weiter</Button>
          )}
        </DialogFooter>

        {/*
          Die Rückfrage vor dem Ersetzen.

          Sie nennt beide Objekte und sagt, was am Wechsel hängt. Eine
          allgemeine Frage, ob man sich sicher sei, wird nach dem dritten Mal
          weggeklickt, ohne gelesen zu werden.
        */}
        <AlertDialog open={!!rueckfrage} onOpenChange={(o) => { if (!o) setRueckfrage(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Objekt wirklich ersetzen?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  {rueckfrage && (
                    <>
                      <div className="divide-y rounded-md border">
                        <div className="px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bisher eingetragen</p>
                          <p className="text-sm text-foreground line-through decoration-muted-foreground/50">
                            {objektBezeichnung(rueckfrage.alt) || "ohne Adresse"}
                          </p>
                          {!!rueckfrage.alt.kaufpreis && rueckfrage.alt.kaufpreis > 0 && (
                            <p className="text-xs">{euro(rueckfrage.alt.kaufpreis)}</p>
                          )}
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Neu</p>
                          <p className="text-sm font-semibold text-foreground">
                            {objektBezeichnung(rueckfrage.neu)}
                          </p>
                          {rueckfrage.neu.kaufpreis > 0 && (
                            <p className="text-xs">{euro(rueckfrage.neu.kaufpreis)}</p>
                          )}
                        </div>
                      </div>

                      <p>
                        Kundenportal, Steuer-Cockpit und die Kaufpreissumme der Pipeline stellen
                        sofort auf das neue Objekt um. Eine neue Reservierungsvereinbarung wird ab
                        jetzt mit dem neuen Objekt vorausgefüllt.
                      </p>

                      {/*
                        Der Wechsel rührt eine bereits erzeugte Vereinbarung
                        nicht an. Sie bleibt liegen und nennt weiter das alte
                        Objekt. Ohne diesen Satz übersieht das jeder.
                      */}
                      {rvStand.vorhanden && (
                        <p className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2 text-[13px]">
                          <span className="font-semibold text-foreground">
                            {rvStand.unterschrieben
                              ? "Die unterschriebene Reservierungsvereinbarung"
                              : "Die vorhandene Reservierungsvereinbarung"}
                          </span>{" "}
                          wird dabei nicht gelöscht und nennt weiter das bisherige Objekt. Sie muss
                          für das neue Objekt neu erstellt und unterschrieben werden.
                        </p>
                      )}

                      {/*
                        Verkäufer und Grundbuch gehören zum alten Objekt, wenn
                        sie beim Wechsel unverändert stehen bleiben. Beim
                        Bauträgerobjekt ist das oft richtig, im selben Haus
                        bleibt der Verkäufer derselbe. Deshalb ein Hinweis und
                        keine Sperre.
                      */}
                      {(() => {
                        const uebernommen = [
                          rueckfrage.neu.verkaeufer?.name ? "der Verkäufer" : "",
                          rueckfrage.neu.grundbuch?.blatt ? "das Grundbuch" : "",
                        ].filter(Boolean);
                        if (uebernommen.length === 0) return null;
                        const eines = uebernommen.length === 1;
                        return (
                          <p>
                            <span className="font-semibold text-foreground">Bitte prüfen:</span>{" "}
                            {uebernommen.join(" und ")} {eines ? "steht" : "stehen"} unverändert und{" "}
                            {eines ? "gehört" : "gehören"} noch zum bisherigen Objekt.
                          </p>
                        );
                      })()}

                      <p>
                        Das bisherige Objekt bleibt in der Zeitachse der Objektauswahl sichtbar,
                        mit dem Zeitraum, in dem es ausgewählt war.
                      </p>
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setRueckfrage(null)}>
                Bisheriges Objekt behalten
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => rueckfrage && uebernehmen(rueckfrage.neu)}>
                Objekt ersetzen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
