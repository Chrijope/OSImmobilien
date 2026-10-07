import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EuroInput } from "@/components/ui/euro-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOptionalUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Image, CalendarIcon, Building2, CheckCircle } from "lucide-react";
import { compressForUpload } from "@/lib/imageCompression";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  bereinigeDetails,
  detailsAlsText,
  istBerechtigungsFehler,
  istFehlendeDetailsSpalte,
  JA_NEIN_OPTIONEN,
  JA_NEIN_UNBEKANNT_OPTIONEN,
  leereDetails,
  OBJEKTTYP_OPTIONEN,
  pruefePflichtfelder,
  UNTERLAGEN_OPTIONEN,
  VERHAELTNIS_OPTIONEN,
  ZUSTAND_OPTIONEN,
  type AuswahlOption,
  type EinreichungDetails,
} from "@/lib/objektEinreichungFormular";
import { EINREICHUNG_BILDTYPEN, EINREICHUNG_MAX_MB, ladeEinreichungsDateiHoch, sendeObjektEinreichung } from "@/lib/objektEinreichungVersand";

interface WohnungEntry {
  id: string;
  bezeichnung: string;
  etage: string;
  vermietet: string;
  mieter_name: string;
}

interface BildEntry {
  thumbnailUrl: string;
  originalUrl: string;
  name: string;
}

/** Kleines Select im Stil der uebrigen Formularfelder. */
function AuswahlFeld({ label, value, onChange, optionen, pflicht, platzhalter }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optionen: AuswahlOption[];
  pflicht?: boolean;
  platzhalter?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}{pflicht ? " *" : ""}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={platzhalter ?? "Bitte wählen"} />
        </SelectTrigger>
        <SelectContent>
          {optionen.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ObjektAkquise() {
  const navigate = useNavigate();
  // Offener Link: funktioniert mit und ohne Anmeldung
  const userCtx = useOptionalUser();
  const authUserId = userCtx?.authUser?.id ?? null;
  const userName = userCtx?.user?.name || "";
  const [saving, setSaving] = useState(false);
  const [eingereicht, setEingereicht] = useState(false);
  /* Der Honigtopf gegen Bots. Fuer Menschen unsichtbar, deshalb immer leer.
     Ist er gefuellt, nimmt die Edge Function die Einreichung freundlich an
     und wirft sie weg. Siehe objektEinreichungVersand.ts. */
  const [hp, setHp] = useState("");

  // Einreicher (Akquisiteur)
  const [akquisiteurName, setAkquisiteurName] = useState(userName);

  // Eigentümer
  const [eigName, setEigName] = useState("");
  const [eigGeburt, setEigGeburt] = useState<Date | undefined>(undefined);
  const [eigEmail, setEigEmail] = useState("");
  const [eigTelefon, setEigTelefon] = useState("");
  const [eigFamilienstand, setEigFamilienstand] = useState("");
  const [eigIban, setEigIban] = useState("");
  const [eigHrb, setEigHrb] = useState("");

  // Objekt
  const [titel, setTitel] = useState("");
  const [strasse, setStrasse] = useState("");
  const [hausnummer, setHausnummer] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");
  const [einheiten, setEinheiten] = useState<number | "">("");
  const [baujahr, setBaujahr] = useState<number | "">("");
  const [wohnflaeche, setWohnflaeche] = useState<number | "">("");
  const [kaufpreis, setKaufpreis] = useState(0);

  // Neue Ankaufsfelder, gesammelt in objekt_einreichungen.details
  const [details, setDetails] = useState<EinreichungDetails>(leereDetails());
  const setDetail = <K extends keyof EinreichungDetails>(key: K, value: EinreichungDetails[K]) =>
    setDetails(p => ({ ...p, [key]: value }));

  // Zustand je Gewerk (Bestandsfelder)
  const [zustand, setZustand] = useState<Record<string, string>>({
    aussenfassade: "", dach: "", heizung: "", elektrik: "", fenster: "",
    waende: "", boden: "", haustuer: "", wohnungstueren: "", baeder: "", treppenhaus: "",
  });

  // Sanierung & Sonstiges
  const [sanierungsangebot, setSanierungsangebot] = useState("");
  const [sonstigeInfos, setSonstigeInfos] = useState("");
  const [whgMassnahmen, setWhgMassnahmen] = useState("");
  const [musterwohnung, setMusterwohnung] = useState("");

  // Wohnungen
  const [wohnungen, setWohnungen] = useState<WohnungEntry[]>([]);

  // Visualisierung & Verwaltung
  const [visualisierung, setVisualisierung] = useState("");
  const [hausverwaltung, setHausverwaltung] = useState("");

  // AB & TK
  const [abEingereicht, setAbEingereicht] = useState("");
  const [bauamt, setBauamt] = useState("");
  const [bauamtAnsprech, setBauamtAnsprech] = useState("");
  const [notartermin, setNotartermin] = useState<Date | undefined>(undefined);
  const [zusatzInfosTk, setZusatzInfosTk] = useState("");

  // Bilder
  const [bilder, setBilder] = useState<BildEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const addWohnung = () => setWohnungen(p => [...p, { id: `w${Date.now()}`, bezeichnung: "", etage: "", vermietet: "nein", mieter_name: "" }]);
  const removeWohnung = (id: string) => setWohnungen(p => p.filter(w => w.id !== id));
  const updateWohnung = (id: string, field: keyof WohnungEntry, value: string) =>
    setWohnungen(p => p.map(w => w.id === id ? { ...w, [field]: value } : w));

  const toggleUnterlage = (wert: string, aktiv: boolean) =>
    setDetail("unterlagen", aktiv
      ? [...details.unterlagen, wert]
      : details.unterlagen.filter(u => u !== wert));

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Vor dem Hochladen pruefen, sonst wartet der Einreicher erst und
        // bekommt dann eine Ablehnung.
        if (file.size > EINREICHUNG_MAX_MB * 1024 * 1024) {
          toast.error(`„${file.name}“ ist größer als ${EINREICHUNG_MAX_MB} MB und wurde nicht hochgeladen.`);
          continue;
        }
        const { compressed, original } = await compressForUpload(file, "standard");

        // Seit dem 04.10.2026 laeuft jeder Upload ueber die Function (nur
        // Bilder, Groesse begrenzt, Mengenbremse). Sie legt im Ordner der
        // Anmeldung ab, ohne Anmeldung unter public, wie bisher.
        const thumbUrl = await ladeEinreichungsDateiHoch(compressed);
        const origUrl = await ladeEinreichungsDateiHoch(original);
        setBilder(prev => [...prev, { thumbnailUrl: thumbUrl, originalUrl: origUrl, name: file.name }]);
      }
    } catch (err) {
      const meldung = err instanceof Error ? err.message : String(err);
      if (istBerechtigungsFehler({ message: meldung })) {
        toast.error("Der Bild-Upload ist gerade nicht möglich. Du kannst das Formular trotzdem absenden, wir fragen Bilder dann bei dir an.");
      } else {
        toast.error("Fehler beim Hochladen: " + meldung);
      }
    }
    setUploading(false);
    e.target.value = "";
  };

  const removeBild = (origUrl: string) => setBilder(p => p.filter(b => b.originalUrl !== origUrl));

  const handleSubmit = async () => {
    const fehler = pruefePflichtfelder({
      strasse, plz, ort,
      objekttyp: details.objekttyp,
      wohneinheiten: einheiten,
      kaufpreis,
      jahresnettokaltmiete: details.jahresnettokaltmiete_ist ?? 0,
      leerstand: details.leerstand,
      einreicherName: akquisiteurName,
      einreicherTelefon: details.einreicher_telefon,
      einreicherEmail: details.einreicher_email,
    });
    if (fehler.length > 0) {
      fehler.forEach(f => toast.error(f));
      return;
    }

    setSaving(true);
    const autoTitel = titel || `${strasse} ${hausnummer}, ${plz} ${ort}`.trim();
    const detailsDaten = bereinigeDetails(details);
    const basis = {
      benutzer_id: authUserId || "00000000-0000-0000-0000-000000000000",
      titel: autoTitel,
      akquisiteur_name: akquisiteurName || null,
      eigentuemer_name: eigName,
      eigentuemer_geburtsdatum: eigGeburt ? format(eigGeburt, "dd.MM.yyyy") : null,
      eigentuemer_email: eigEmail,
      eigentuemer_telefon: eigTelefon,
      eigentuemer_familienstand: eigFamilienstand,
      eigentuemer_iban: eigIban,
      eigentuemer_hrb: eigHrb,
      strasse, hausnummer, plz, ort,
      einheiten: einheiten || null,
      baujahr: baujahr || null,
      wohnflaeche_gesamt: wohnflaeche || null,
      kaufpreis: kaufpreis || null,
      zustand_aussenfassade: zustand.aussenfassade,
      zustand_dach: zustand.dach,
      zustand_heizung: zustand.heizung,
      zustand_elektrik: zustand.elektrik,
      zustand_fenster: zustand.fenster,
      zustand_waende: zustand.waende,
      zustand_boden: zustand.boden,
      zustand_haustuer: zustand.haustuer,
      zustand_wohnungstueren: zustand.wohnungstueren,
      zustand_baeder: zustand.baeder,
      zustand_treppenhaus: zustand.treppenhaus,
      sanierungsangebot, sonstige_infos: sonstigeInfos,
      whg_massnahmen: whgMassnahmen, musterwohnung,
      wohnungen: wohnungen as unknown,
      visualisierung, hausverwaltung,
      ab_eingereicht_am: abEingereicht,
      bauamt, bauamt_ansprechpartner: bauamtAnsprech,
      notartermin_tk: notartermin ? format(notartermin, "yyyy-MM-dd") : null,
      zusaetzliche_infos_tk: zusatzInfosTk,
      bilder: bilder as unknown,
    };

    // Der Versand laeuft ueber die Edge Function, nicht mehr direkt in die
    // Tabelle. Dort sitzen Honigtopf und Kontingent je Anschluss.
    let antwort = await sendeObjektEinreichung({ ...basis, details: detailsDaten }, hp);

    if (!antwort.ok && antwort.fehler && istFehlendeDetailsSpalte({ message: antwort.fehler })) {
      // Migration 20260831180000 noch nicht ausgefuehrt: die neuen Felder
      // wandern lesbar in sonstige_infos, damit nichts verloren geht.
      const fallbackInfos = [basis.sonstige_infos, detailsAlsText(details)].filter(Boolean).join("\n\n");
      antwort = await sendeObjektEinreichung({ ...basis, sonstige_infos: fallbackInfos }, hp);
    }

    setSaving(false);
    if (!antwort.ok) {
      const meldung = antwort.fehler || "";
      if (antwort.zuVieleAnfragen || antwort.nichtErreichbar) {
        // Beide Fälle bringen bereits einen Satz mit, den der Einreicher lesen
        // kann.
        toast.error(meldung);
      } else if (istBerechtigungsFehler({ message: meldung })) {
        toast.error("Der Versand ist im Moment leider nicht möglich. Bitte versuche es später noch einmal oder melde dich direkt bei uns.");
      } else {
        toast.error("Fehler beim Speichern: " + meldung);
      }
    } else {
      toast.success("Objekt erfolgreich eingereicht!");
      if (authUserId) {
        navigate("/objekt-einreichungen");
      } else {
        setEingereicht(true);
        window.scrollTo({ top: 0 });
      }
    }
  };

  const zustandFelder = [
    { key: "aussenfassade", label: "Außenfassade" },
    { key: "dach", label: "Dach" },
    { key: "heizung", label: "Heizung" },
    { key: "elektrik", label: "Elektrik" },
    { key: "fenster", label: "Fenster" },
    { key: "waende", label: "Wände" },
    { key: "boden", label: "Boden" },
    { key: "haustuer", label: "Haustür" },
    { key: "wohnungstueren", label: "Wohnungstüren" },
    { key: "baeder", label: "Bäder" },
    { key: "treppenhaus", label: "Treppenhaus" },
  ];

  const zahlOderLeer = (wert: string): number | null => {
    const parsed = parseFloat(wert.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };

  if (eingereicht) {
    return (
      <div className="w-full px-4 md:px-8 py-12">
        <Card className="max-w-xl mx-auto p-8 text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
          <h2 className="text-xl font-bold">Vielen Dank für deine Einreichung!</h2>
          <p className="text-muted-foreground">
            Wir prüfen das Objekt und melden uns über die angegebenen Kontaktdaten bei dir.
          </p>
          <Button onClick={() => window.location.reload()}>Weiteres Objekt einreichen</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-8 xl:px-12 py-6 space-y-6">
      <PageHeader title="Objekt Akquise" subtitle="Neues Objekt zur Ankaufsprüfung einreichen" />

      {/* Ansprache: was wir suchen */}
      <Card className="p-6 border-primary/40 bg-primary/5 space-y-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" /> Welche Objekte suchen wir?
        </h2>
        <p className="text-sm leading-relaxed">
          Wir kaufen bevorzugt <strong>Mehrfamilienhäuser und Wohnanlagen</strong> für den
          Kapitalanlagevertrieb, ideal ab etwa <strong>6 bis 8 Einheiten aufwärts</strong>, gern auch
          deutlich größer. Portfolios sind willkommen. Einzelne Eigentumswohnungen sind nur in
          Ausnahmefällen interessant, zum Beispiel als Paket mehrerer Wohnungen in einem Haus.
        </p>
        <p className="text-sm leading-relaxed">
          Wichtig sind uns: <strong>solide Vermietbarkeit</strong>, ein <strong>realistischer Kaufpreis im
          Verhältnis zur Miete</strong> und <strong>Entwicklungspotenzial</strong>, etwa durch Mietanpassung
          oder die Aufteilung in Wohnungseigentum.
        </p>
        <p className="text-sm leading-relaxed">
          Je vollständiger deine Angaben, desto schneller können wir prüfen und dem Eigentümer eine
          Rückmeldung geben. Pflichtfelder sind mit * markiert.
        </p>
      </Card>

      {/* Objekt */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg">Objekt</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <div className="md:col-span-2"><Label className="text-xs">Straße *</Label><Input value={strasse} onChange={e => setStrasse(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Hausnummer</Label><Input value={hausnummer} onChange={e => setHausnummer(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">PLZ *</Label><Input value={plz} onChange={e => setPlz(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Ort *</Label><Input value={ort} onChange={e => setOrt(e.target.value)} className="h-9" /></div>
          <AuswahlFeld label="Objekttyp" pflicht value={details.objekttyp} onChange={v => setDetail("objekttyp", v)} optionen={OBJEKTTYP_OPTIONEN} />
          <div><Label className="text-xs">Anzahl Wohneinheiten *</Label><Input type="number" min={1} value={einheiten} onChange={e => setEinheiten(e.target.value ? parseInt(e.target.value) : "")} className="h-9" /></div>
          <div><Label className="text-xs">Anzahl Gewerbeeinheiten</Label><Input type="number" min={0} value={details.gewerbeeinheiten ?? ""} onChange={e => setDetail("gewerbeeinheiten", e.target.value ? parseInt(e.target.value) : null)} className="h-9" /></div>
          <div><Label className="text-xs">Wohnfläche gesamt (m²)</Label><Input type="number" value={wohnflaeche} onChange={e => setWohnflaeche(e.target.value ? parseFloat(e.target.value) : "")} className="h-9" /></div>
          <div><Label className="text-xs">Gewerbefläche (m²)</Label><Input type="number" value={details.gewerbeflaeche_qm ?? ""} onChange={e => setDetail("gewerbeflaeche_qm", zahlOderLeer(e.target.value))} className="h-9" /></div>
          <div><Label className="text-xs">Grundstücksfläche (m²)</Label><Input type="number" value={details.grundstuecksflaeche_qm ?? ""} onChange={e => setDetail("grundstuecksflaeche_qm", zahlOderLeer(e.target.value))} className="h-9" /></div>
          <div><Label className="text-xs">Baujahr</Label><Input type="number" value={baujahr} onChange={e => setBaujahr(e.target.value ? parseInt(e.target.value) : "")} className="h-9" /></div>
          <div><Label className="text-xs">Stellplätze / Garagen</Label><Input type="number" min={0} value={details.stellplaetze ?? ""} onChange={e => setDetail("stellplaetze", e.target.value ? parseInt(e.target.value) : null)} className="h-9" /></div>
          <AuswahlFeld label="Zustand" value={details.zustand_gesamt} onChange={v => setDetail("zustand_gesamt", v)} optionen={ZUSTAND_OPTIONEN} />
          <AuswahlFeld label="Denkmalschutz" value={details.denkmalschutz} onChange={v => setDetail("denkmalschutz", v)} optionen={JA_NEIN_UNBEKANNT_OPTIONEN} />
          <AuswahlFeld label="Erbbaurecht" value={details.erbbaurecht} onChange={v => setDetail("erbbaurecht", v)} optionen={JA_NEIN_UNBEKANNT_OPTIONEN} />
          <AuswahlFeld label="Aufteilung in WEG bereits erfolgt" value={details.weg_aufteilung} onChange={v => setDetail("weg_aufteilung", v)} optionen={JA_NEIN_UNBEKANNT_OPTIONEN} />
          <div><Label className="text-xs">Heizungsart</Label><Input value={details.heizungsart} onChange={e => setDetail("heizungsart", e.target.value)} placeholder="z.B. Gas-Zentralheizung" className="h-9" /></div>
          <div><Label className="text-xs">Baujahr Heizung</Label><Input value={details.heizung_baujahr} onChange={e => setDetail("heizung_baujahr", e.target.value)} placeholder="z.B. 2015" className="h-9" /></div>
          <AuswahlFeld label="Energieausweis vorhanden" value={details.energieausweis_vorhanden} onChange={v => setDetail("energieausweis_vorhanden", v)} optionen={JA_NEIN_OPTIONEN} />
          <div><Label className="text-xs">Titel / Bezeichnung (optional)</Label><Input value={titel} onChange={e => setTitel(e.target.value)} placeholder="wird sonst automatisch erzeugt" className="h-9" /></div>
        </div>
        <div>
          <Label className="text-xs">Letzte Sanierungen (was und wann)</Label>
          <Textarea value={details.letzte_sanierungen} onChange={e => setDetail("letzte_sanierungen", e.target.value)} rows={2} placeholder="z.B. Dach 2019, Fenster 2021, Heizung 2015" />
        </div>
      </Card>

      {/* Wirtschaftlichkeit */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg">Wirtschaftlichkeit</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div><Label className="text-xs">Kaufpreisvorstellung des Eigentümers *</Label><EuroInput value={kaufpreis} onChange={setKaufpreis} className="h-9" /></div>
          <div><Label className="text-xs">Jahresnettokaltmiete Ist *</Label><EuroInput value={details.jahresnettokaltmiete_ist ?? 0} onChange={v => setDetail("jahresnettokaltmiete_ist", v)} className="h-9" /></div>
          <div><Label className="text-xs">Nicht umlagefähige Kosten p.a. (falls bekannt)</Label><EuroInput value={details.nicht_umlagefaehige_kosten ?? 0} onChange={v => setDetail("nicht_umlagefaehige_kosten", v > 0 ? v : null)} className="h-9" /></div>
          <div><Label className="text-xs">Leerstand (Einheiten / m²)</Label><Input value={details.leerstand} onChange={e => setDetail("leerstand", e.target.value)} placeholder="z.B. 2 Einheiten, ca. 130 m²" className="h-9" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label className="text-xs">Mietsteigerungspotenzial</Label><Textarea value={details.mietsteigerungspotenzial} onChange={e => setDetail("mietsteigerungspotenzial", e.target.value)} rows={2} placeholder="z.B. Bestandsmieten deutlich unter Marktniveau" /></div>
          <div><Label className="text-xs">Rückstände / Besonderheiten</Label><Textarea value={details.rueckstaende_besonderheiten} onChange={e => setDetail("rueckstaende_besonderheiten", e.target.value)} rows={2} /></div>
        </div>
      </Card>

      {/* Eigentümer & Prozess */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg">Eigentümer & Prozess</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div><Label className="text-xs">Eigentümername</Label><Input value={eigName} onChange={e => setEigName(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Eigentümer Telefon</Label><PhoneInput value={eigTelefon} onChange={v => setEigTelefon(v)} className="h-9" /></div>
          <div><Label className="text-xs">Eigentümer E-Mail</Label><Input type="email" value={eigEmail} onChange={e => setEigEmail(e.target.value)} className="h-9" /></div>
          <AuswahlFeld label="Dein Verhältnis zum Eigentümer" value={details.verhaeltnis_eigentuemer} onChange={v => setDetail("verhaeltnis_eigentuemer", v)} optionen={VERHAELTNIS_OPTIONEN} />
          <div>
            <Label className="text-xs">Geburtsdatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full h-9 justify-start text-left font-normal", !eigGeburt && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {eigGeburt ? format(eigGeburt, "dd.MM.yyyy") : "TT.MM.JJJJ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={eigGeburt}
                  onSelect={setEigGeburt}
                  locale={de}
                  captionLayout="dropdown-buttons"
                  fromYear={1920}
                  toYear={new Date().getFullYear()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div><Label className="text-xs">Familienstand</Label><Input value={eigFamilienstand} onChange={e => setEigFamilienstand(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">IBAN</Label><Input value={eigIban} onChange={e => setEigIban(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">HRB</Label><Input value={eigHrb} onChange={e => setEigHrb(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Verkaufsgrund</Label><Input value={details.verkaufsgrund} onChange={e => setDetail("verkaufsgrund", e.target.value)} placeholder="z.B. Alter, Erbauseinandersetzung" className="h-9" /></div>
          <div><Label className="text-xs">Zeithorizont des Verkaufs</Label><Input value={details.zeithorizont} onChange={e => setDetail("zeithorizont", e.target.value)} placeholder="z.B. kurzfristig, 3 bis 6 Monate" className="h-9" /></div>
          <AuswahlFeld label="Makler beauftragt" value={details.makler_beauftragt} onChange={v => setDetail("makler_beauftragt", v)} optionen={JA_NEIN_OPTIONEN} />
          <AuswahlFeld label="Bereits anderweitig angeboten" value={details.anderweitig_angeboten} onChange={v => setDetail("anderweitig_angeboten", v)} optionen={JA_NEIN_OPTIONEN} />
        </div>
        {details.makler_beauftragt === "ja" && (
          <div>
            <Label className="text-xs">Welcher Makler und wie ist die Provisionssituation?</Label>
            <Textarea value={details.makler_details} onChange={e => setDetail("makler_details", e.target.value)} rows={2} />
          </div>
        )}
      </Card>

      {/* Zustand je Gewerk */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg">Zustand der Immobilie im Detail</h3>
        <p className="text-xs text-muted-foreground">Optional: jeweils Jahr der letzten Maßnahme und ggf. Details angeben</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {zustandFelder.map(f => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                value={zustand[f.key]}
                onChange={e => setZustand(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder="z.B. 2023 saniert"
                className="h-9"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Sanierung & Sonstiges */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg">Sanierung & Sonstiges</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label className="text-xs">Sanierungsangebot</Label><Textarea value={sanierungsangebot} onChange={e => setSanierungsangebot(e.target.value)} rows={3} /></div>
          <div><Label className="text-xs">Sonstige Infos</Label><Textarea value={sonstigeInfos} onChange={e => setSonstigeInfos(e.target.value)} rows={3} /></div>
          <div><Label className="text-xs">WHG's – Was wird gemacht?</Label><Textarea value={whgMassnahmen} onChange={e => setWhgMassnahmen(e.target.value)} rows={3} /></div>
          <div className="space-y-4">
            <div><Label className="text-xs">Musterwohnung (WHG Nr.)</Label><Input value={musterwohnung} onChange={e => setMusterwohnung(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Visualisierung</Label><Input value={visualisierung} onChange={e => setVisualisierung(e.target.value)} placeholder="z.B. Nicht benötigt" className="h-9" /></div>
            <div><Label className="text-xs">Welche Hausverwaltung?</Label><Input value={hausverwaltung} onChange={e => setHausverwaltung(e.target.value)} className="h-9" /></div>
          </div>
        </div>
      </Card>

      {/* Wohnungen */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Wohneinheiten im Detail</h3>
          <Button variant="outline" size="sm" onClick={addWohnung} className="gap-1"><Plus className="h-4 w-4" /> Wohnung</Button>
        </div>
        {wohnungen.length === 0 && <p className="text-sm text-muted-foreground">Optional: einzelne Wohnungen mit Vermietungsstand erfassen.</p>}
        {wohnungen.map((w, i) => (
          <div key={w.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">WHG {i + 1}</span>
              <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => removeWohnung(w.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label className="text-xs">Bezeichnung</Label><Input value={w.bezeichnung} onChange={e => updateWohnung(w.id, "bezeichnung", e.target.value)} placeholder="z.B. WHG 1 / EG" className="h-8" /></div>
              <div><Label className="text-xs">Etage</Label><Input value={w.etage} onChange={e => updateWohnung(w.id, "etage", e.target.value)} placeholder="EG, 1.OG, DG" className="h-8" /></div>
              <div><Label className="text-xs">Vermietet?</Label>
                <select value={w.vermietet} onChange={e => updateWohnung(w.id, "vermietet", e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="ja">Ja</option>
                  <option value="nein">Nein</option>
                </select>
              </div>
              <div><Label className="text-xs">Mieter Name</Label><Input value={w.mieter_name} onChange={e => updateWohnung(w.id, "mieter_name", e.target.value)} className="h-8" disabled={w.vermietet === "nein"} /></div>
            </div>
          </div>
        ))}
      </Card>

      {/* AB & Teilungserklärung */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg">Abgeschlossenheitsbescheinigung & Teilungserklärung</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div><Label className="text-xs">AB eingereicht am</Label><Input value={abEingereicht} onChange={e => setAbEingereicht(e.target.value)} placeholder="TT.MM.JJJJ" className="h-9" /></div>
          <div><Label className="text-xs">Bauamt</Label><Input value={bauamt} onChange={e => setBauamt(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Ansprechpartner / Tel.</Label><Input value={bauamtAnsprech} onChange={e => setBauamtAnsprech(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Notartermin TK</Label><Input type="date" value={notartermin ? format(notartermin, "yyyy-MM-dd") : ""} onChange={e => setNotartermin(e.target.value ? new Date(e.target.value + "T00:00:00") : undefined)} className="h-9" /></div>
        </div>
        <div><Label className="text-xs">Zusätzliche Informationen zur TK</Label><Textarea value={zusatzInfosTk} onChange={e => setZusatzInfosTk(e.target.value)} rows={3} /></div>
      </Card>

      {/* Unterlagen & Bilder */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><Image className="h-5 w-5" /> Unterlagen & Bilder</h3>
        <div>
          <Label className="text-xs">Welche Unterlagen liegen vor?</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            {UNTERLAGEN_OPTIONEN.map(u => (
              <label key={u.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={details.unterlagen.includes(u.value)}
                  onCheckedChange={checked => toggleUnterlage(u.value, checked === true)}
                />
                {u.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Bilder</Label>
          <p className="text-xs text-muted-foreground mb-2">JPEG, PNG, WebP, GIF oder HEIC, höchstens {EINREICHUNG_MAX_MB} MB je Bild. Bilder werden automatisch komprimiert. Klicke auf ein Bild für die Originalansicht.</p>
          <div className="flex flex-wrap gap-3">
            {bilder.map(b => (
              <div key={b.originalUrl} className="relative group">
                <img
                  src={b.thumbnailUrl}
                  alt={b.name}
                  className="h-24 w-24 object-cover rounded-lg border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                  onClick={() => setLightboxUrl(b.originalUrl)}
                />
                <button onClick={() => removeBild(b.originalUrl)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
              </div>
            ))}
            <label className="h-24 w-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground mt-1">{uploading ? "..." : "Hochladen"}</span>
              <input type="file" accept={EINREICHUNG_BILDTYPEN} multiple onChange={handleImageUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>
      </Card>

      {/* Einreicher */}
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-lg">Deine Kontaktdaten</h3>
        <p className="text-xs text-muted-foreground">Für Rückfragen und ggf. die Tippgeber-Vergütung.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label className="text-xs">Dein Name *</Label><Input value={akquisiteurName} onChange={e => setAkquisiteurName(e.target.value)} placeholder="Vor- und Nachname" className="h-9" /></div>
          <div><Label className="text-xs">Telefon</Label><PhoneInput value={details.einreicher_telefon} onChange={v => setDetail("einreicher_telefon", v)} className="h-9" /></div>
          <div><Label className="text-xs">E-Mail</Label><Input type="email" value={details.einreicher_email} onChange={e => setDetail("einreicher_email", e.target.value)} className="h-9" /></div>
        </div>
        <p className="text-xs text-muted-foreground">Bitte gib mindestens Telefon oder E-Mail an.</p>
        <div>
          <Label className="text-xs">Bemerkungen</Label>
          <Textarea value={details.bemerkungen} onChange={e => setDetail("bemerkungen", e.target.value)} rows={3} placeholder="Alles, was wir sonst noch wissen sollten" />
        </div>
      </Card>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Original" className="w-full h-auto max-h-[80vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>

      {/* Honigtopf, vor Bots versteckt und für Menschen unsichtbar. Wer ihn
          ausfüllt, ist kein Mensch: Die Einreichung wird angenommen und
          stillschweigend verworfen. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <Label htmlFor="website-zusatz">Website</Label>
        <Input
          id="website-zusatz"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={e => setHp(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pb-8">
        {authUserId && (
          <Button variant="outline" onClick={() => navigate("/objekt-einreichungen")}>Abbrechen</Button>
        )}
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Wird eingereicht..." : "Objekt einreichen"}
        </Button>
      </div>
    </div>
  );
}
