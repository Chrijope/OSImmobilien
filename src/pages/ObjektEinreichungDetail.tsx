import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, XCircle, Clock, Building2, Phone, Mail, User, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  JA_NEIN_OPTIONEN,
  JA_NEIN_UNBEKANNT_OPTIONEN,
  labelFuer,
  OBJEKTTYP_OPTIONEN,
  UNTERLAGEN_OPTIONEN,
  VERHAELTNIS_OPTIONEN,
  ZUSTAND_OPTIONEN,
  type EinreichungDetails,
} from "@/lib/objektEinreichungFormular";

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const statusColors: Record<string, string> = {
  eingereicht: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  in_pruefung: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  angenommen: "bg-green-500/15 text-green-700 border-green-500/30",
  abgelehnt: "bg-red-500/15 text-red-700 border-red-500/30",
  uebernommen: "bg-primary/15 text-primary border-primary/30",
};
const statusLabels: Record<string, string> = {
  eingereicht: "Eingereicht", in_pruefung: "In Prüfung", angenommen: "Angenommen", abgelehnt: "Abgelehnt", uebernommen: "Übernommen",
};

interface NotizEintrag {
  id: string;
  einreichung_id: string;
  verfasser_id: string | null;
  verfasser_name: string | null;
  text: string;
  erstellt_am: string;
}

export default function ObjektEinreichungDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const [e, setE] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bewertung, setBewertung] = useState("");
  const [saving, setSaving] = useState(false);
  const [uebernehmen, setUebernehmen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Interner Notizverlauf (Ruecksprache mit dem Eigentuemer)
  const [notizen, setNotizen] = useState<NotizEintrag[]>([]);
  const [notizenVerfuegbar, setNotizenVerfuegbar] = useState(true);
  const [neueNotiz, setNeueNotiz] = useState("");
  const [notizSpeichern, setNotizSpeichern] = useState(false);

  const canManage = ["admin", "inhaber"].includes(user.role);

  const loadNotizen = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("objekt_einreichung_notizen" as never)
      .select("*")
      .eq("einreichung_id", id)
      .order("erstellt_am", { ascending: false });
    if (error) {
      // Tabelle existiert noch nicht (Migration 20260831180000 offen) oder
      // keine Berechtigung: Verlauf ausblenden statt Fehler werfen.
      setNotizenVerfuegbar(false);
      return;
    }
    setNotizenVerfuegbar(true);
    setNotizen((data as unknown as NotizEintrag[]) || []);
  }, [id]);

  const loadData = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("objekt_einreichungen").select("*").eq("id", id).maybeSingle();
    setE(data);
    setBewertung((data as any)?.bewertung || "");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
    loadNotizen();
  }, [loadData, loadNotizen]);

  const handleNotizSpeichern = async () => {
    const text = neueNotiz.trim();
    if (!text || !id) return;
    setNotizSpeichern(true);
    const { error } = await supabase.from("objekt_einreichung_notizen" as never).insert({
      einreichung_id: id,
      verfasser_id: authUser?.id ?? null,
      verfasser_name: user.name || null,
      text,
    } as never);
    setNotizSpeichern(false);
    if (error) {
      toast.error("Notiz konnte nicht gespeichert werden: " + error.message);
      return;
    }
    setNeueNotiz("");
    await loadNotizen();
  };

  const updateStatus = async (status: string) => {
    setSaving(true);
    await supabase.from("objekt_einreichungen").update({ status, bewertung } as any).eq("id", id!);
    toast.success(`Status auf "${statusLabels[status]}" gesetzt.`);
    await loadData();
    setSaving(false);
  };

  const handleUebernehmen = async () => {
    if (!e) return;
    setUebernehmen(true);

    // Neues Objekt im Bestand anlegen
    const { data: newObjekt, error } = await supabase.from("objekte").insert({
      titel: e.titel || `${e.strasse} ${e.hausnummer}, ${e.plz} ${e.ort}`,
      adresse: [e.strasse, e.hausnummer].filter(Boolean).join(" "),
      plz: e.plz,
      ort: e.ort,
      global_baujahr: e.baujahr,
      global_gesamt_qm: e.wohnflaeche_gesamt ? Number(e.wohnflaeche_gesamt) : null,
      global_verkaufspreis: e.kaufpreis ? Number(e.kaufpreis) : null,
      beschreibung: [
        e.sonstige_infos,
        e.eigentuemer_name ? `Eigentümer: ${e.eigentuemer_name}` : "",
        e.hausverwaltung ? `HV: ${e.hausverwaltung}` : "",
      ].filter(Boolean).join("\n"),
      sichtbar: false,
      erstellt_von: (await supabase.auth.getUser()).data.user?.id,
    } as any).select("id").single();

    if (error || !newObjekt) {
      toast.error("Fehler beim Übernehmen: " + (error?.message || "Unbekannt"));
      setUebernehmen(false);
      return;
    }

    // Einreichung aktualisieren
    await supabase.from("objekt_einreichungen").update({
      status: "uebernommen",
      uebernommen_am: new Date().toISOString(),
      uebernommenes_objekt_id: newObjekt.id,
    } as any).eq("id", id!);

    toast.success("Objekt wurde in den Bestand übernommen!");
    navigate(`/objekte`);
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Laden...</div>;
  if (!e) return <div className="p-8 text-center text-muted-foreground">Einreichung nicht gefunden.</div>;

  const bilder = Array.isArray(e.bilder) ? e.bilder : [];
  const wohnungen = Array.isArray(e.wohnungen) ? e.wohnungen : [];
  // Neue Ankaufsfelder aus der jsonb-Spalte details; fehlt die Spalte noch
  // (Migration offen), bleibt d einfach leer.
  const d: Partial<EinreichungDetails> = (e.details && typeof e.details === "object" && !Array.isArray(e.details)) ? e.details : {};

  const InfoRow = ({ label, value }: { label: string; value: any }) =>
    value ? <div><span className="text-xs text-muted-foreground">{label}</span><p className="font-medium text-sm">{value}</p></div> : null;

  const einreicherTelefon = d.einreicher_telefon || "";
  const einreicherEmail = d.einreicher_email || "";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Zurück" onClick={() => navigate("/objekt-einreichungen")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader title={e.titel || "Einreichung"} subtitle={`Eingereicht am ${format(new Date(e.erstellt_am), "dd.MM.yyyy HH:mm", { locale: de })}`} />
        <div className="ml-auto">
          <Badge className={`text-sm ${statusColors[e.status] || statusColors.eingereicht}`}>
            {statusLabels[e.status] || e.status}
          </Badge>
        </div>
      </div>

      {/* Status-Aktionen */}
      {canManage && e.status !== "uebernommen" && (
        <Card className="p-4 flex flex-wrap items-center gap-3 bg-muted/30">
          <span className="text-sm font-medium mr-2">Aktion:</span>
          {e.status === "eingereicht" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={saving}>
                  <Clock className="h-4 w-4 mr-1" /> In Prüfung setzen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Status ändern?</AlertDialogTitle>
                  <AlertDialogDescription>Möchtest du den Status auf „In Prüfung" setzen?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={() => updateStatus("in_pruefung")}>Ja, in Prüfung setzen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {["eingereicht", "in_pruefung"].includes(e.status) && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-green-700 border-green-300" disabled={saving}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Annehmen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Einreichung annehmen?</AlertDialogTitle>
                    <AlertDialogDescription>Möchtest du diese Einreichung als „Angenommen" markieren?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={() => updateStatus("angenommen")}>Ja, annehmen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-red-700 border-red-300" disabled={saving}>
                    <XCircle className="h-4 w-4 mr-1" /> Ablehnen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Einreichung ablehnen?</AlertDialogTitle>
                    <AlertDialogDescription>Möchtest du diese Einreichung wirklich ablehnen? Diese Aktion kann rückgängig gemacht werden.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={() => updateStatus("abgelehnt")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Ja, ablehnen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {["angenommen", "in_pruefung", "eingereicht"].includes(e.status) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={uebernehmen} className="gap-1 bg-primary">
                  <Building2 className="h-4 w-4" /> {uebernehmen ? "Wird übernommen..." : "Objekt übernehmen"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Objekt in den Bestand übernehmen?</AlertDialogTitle>
                  <AlertDialogDescription>Das Objekt wird aus den Einreichungsdaten automatisch im Objektbestand angelegt. Du wirst anschließend zur Bearbeitung weitergeleitet.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleUebernehmen}>Ja, übernehmen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </Card>
      )}

      {e.status === "uebernommen" && e.uebernommenes_objekt_id && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-primary" />
            <span className="text-sm">Dieses Objekt wurde in den Bestand übernommen.</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => navigate(`/objekte/${e.uebernommenes_objekt_id}`)}>
              Zum Objekt →
            </Button>
          </div>
        </Card>
      )}

      {/* Eigentümerkontakt prominent */}
      <Card className="p-6 border-primary/40 bg-primary/5">
        <h3 className="font-bold mb-3 flex items-center gap-2"><User className="h-5 w-5 text-primary" /> Eigentümerkontakt</h3>
        {(e.eigentuemer_name || e.eigentuemer_telefon || e.eigentuemer_email) ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {e.eigentuemer_name && <span className="text-lg font-semibold">{e.eigentuemer_name}</span>}
            {e.eigentuemer_telefon && (
              <Button asChild size="sm" variant="outline" className="gap-2">
                <a href={`tel:${e.eigentuemer_telefon}`}><Phone className="h-4 w-4" /> {e.eigentuemer_telefon}</a>
              </Button>
            )}
            {e.eigentuemer_email && (
              <Button asChild size="sm" variant="outline" className="gap-2">
                <a href={`mailto:${e.eigentuemer_email}`}><Mail className="h-4 w-4" /> {e.eigentuemer_email}</a>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Eigentümer-Kontaktdaten angegeben.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <InfoRow label="Geburtsdatum" value={e.eigentuemer_geburtsdatum} />
          <InfoRow label="Familienstand" value={e.eigentuemer_familienstand} />
          <InfoRow label="IBAN" value={e.eigentuemer_iban} />
          <InfoRow label="HRB" value={e.eigentuemer_hrb} />
        </div>
      </Card>

      {/* Einreicher */}
      <Card className="p-6 space-y-3">
        <h3 className="font-bold">Einreicher</h3>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {e.akquisiteur_name && <span className="font-semibold">{e.akquisiteur_name}</span>}
          {einreicherTelefon && (
            <Button asChild size="sm" variant="outline" className="gap-2">
              <a href={`tel:${einreicherTelefon}`}><Phone className="h-4 w-4" /> {einreicherTelefon}</a>
            </Button>
          )}
          {einreicherEmail && (
            <Button asChild size="sm" variant="outline" className="gap-2">
              <a href={`mailto:${einreicherEmail}`}><Mail className="h-4 w-4" /> {einreicherEmail}</a>
            </Button>
          )}
          {!e.akquisiteur_name && !einreicherTelefon && !einreicherEmail && (
            <p className="text-sm text-muted-foreground">Keine Angaben zum Einreicher.</p>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InfoRow label="Verhältnis zum Eigentümer" value={labelFuer(VERHAELTNIS_OPTIONEN, d.verhaeltnis_eigentuemer ?? "")} />
          <InfoRow label="Bemerkungen" value={d.bemerkungen} />
        </div>
      </Card>

      {/* Interner Notizverlauf */}
      <Card className="p-6 space-y-4 border-yellow-500/30 bg-yellow-500/5">
        <h3 className="font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Interne Notizen (Rücksprache Eigentümer)</h3>
        {!notizenVerfuegbar ? (
          <p className="text-sm text-muted-foreground">
            Der Notizverlauf ist noch nicht verfügbar. Die Migration 20260831180000_objektakquise_offener_link.sql muss zuerst in Supabase ausgeführt werden.
          </p>
        ) : (
          <>
            <div className="flex gap-2 items-start">
              <Textarea
                value={neueNotiz}
                onChange={ev => setNeueNotiz(ev.target.value)}
                rows={2}
                placeholder="Neue Notiz, z.B. Ergebnis des Telefonats mit dem Eigentümer"
                className="flex-1"
              />
              <Button size="sm" onClick={handleNotizSpeichern} disabled={notizSpeichern || !neueNotiz.trim()}>
                {notizSpeichern ? "Speichert..." : "Speichern"}
              </Button>
            </div>
            {notizen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Notizen vorhanden.</p>
            ) : (
              <div className="space-y-3">
                {notizen.map(n => (
                  <div data-ui="card" key={n.id} className="border rounded-lg p-3 bg-background">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className="font-medium">{n.verfasser_name || "Unbekannt"}</span>
                      <span>{format(new Date(n.erstellt_am), "dd.MM.yyyy HH:mm", { locale: de })}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Bilder */}
      {bilder.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold mb-3">Bilder</h3>
          <div className="flex flex-wrap gap-3">
            {bilder.map((b: any, i: number) => {
              // Neues Format: thumbnailUrl/originalUrl, altes Format: url
              const vorschau = b.thumbnailUrl || b.url || b.originalUrl;
              const original = b.originalUrl || b.url || b.thumbnailUrl;
              if (!vorschau) return null;
              return (
                <img
                  key={i}
                  src={vorschau}
                  alt={b.name || `Bild ${i + 1}`}
                  className="h-32 w-32 object-cover rounded-lg border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                  onClick={() => setLightboxUrl(original)}
                />
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Original" className="w-full h-auto max-h-[80vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>

      {/* Objektdaten */}
      <Card className="p-6 space-y-3">
        <h3 className="font-bold">Objekt</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Adresse" value={[e.strasse, e.hausnummer].filter(Boolean).join(" ")} />
          <InfoRow label="PLZ / Ort" value={[e.plz, e.ort].filter(Boolean).join(" ")} />
          <InfoRow label="Objekttyp" value={labelFuer(OBJEKTTYP_OPTIONEN, d.objekttyp ?? "")} />
          <InfoRow label="Wohneinheiten" value={e.einheiten} />
          <InfoRow label="Gewerbeeinheiten" value={d.gewerbeeinheiten} />
          <InfoRow label="Wohnfläche" value={e.wohnflaeche_gesamt ? `${e.wohnflaeche_gesamt} m²` : null} />
          <InfoRow label="Gewerbefläche" value={d.gewerbeflaeche_qm ? `${d.gewerbeflaeche_qm} m²` : null} />
          <InfoRow label="Grundstücksfläche" value={d.grundstuecksflaeche_qm ? `${d.grundstuecksflaeche_qm} m²` : null} />
          <InfoRow label="Baujahr" value={e.baujahr} />
          <InfoRow label="Stellplätze / Garagen" value={d.stellplaetze} />
          <InfoRow label="Zustand" value={labelFuer(ZUSTAND_OPTIONEN, d.zustand_gesamt ?? "")} />
          <InfoRow label="Denkmalschutz" value={labelFuer(JA_NEIN_UNBEKANNT_OPTIONEN, d.denkmalschutz ?? "")} />
          <InfoRow label="Erbbaurecht" value={labelFuer(JA_NEIN_UNBEKANNT_OPTIONEN, d.erbbaurecht ?? "")} />
          <InfoRow label="WEG-Aufteilung erfolgt" value={labelFuer(JA_NEIN_UNBEKANNT_OPTIONEN, d.weg_aufteilung ?? "")} />
          <InfoRow label="Heizungsart" value={d.heizungsart} />
          <InfoRow label="Baujahr Heizung" value={d.heizung_baujahr} />
          <InfoRow label="Energieausweis vorhanden" value={labelFuer(JA_NEIN_OPTIONEN, d.energieausweis_vorhanden ?? "")} />
        </div>
        <InfoRow label="Letzte Sanierungen" value={d.letzte_sanierungen} />
      </Card>

      {/* Wirtschaftlichkeit */}
      <Card className="p-6 space-y-3">
        <h3 className="font-bold">Wirtschaftlichkeit</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Kaufpreisvorstellung" value={e.kaufpreis ? fmt(Number(e.kaufpreis)) : null} />
          <InfoRow label="Jahresnettokaltmiete Ist" value={typeof d.jahresnettokaltmiete_ist === "number" ? fmt(d.jahresnettokaltmiete_ist) : null} />
          <InfoRow label="Nicht umlagefähige Kosten p.a." value={typeof d.nicht_umlagefaehige_kosten === "number" ? fmt(d.nicht_umlagefaehige_kosten) : null} />
          <InfoRow label="Leerstand" value={d.leerstand} />
        </div>
        <InfoRow label="Mietsteigerungspotenzial" value={d.mietsteigerungspotenzial} />
        <InfoRow label="Rückstände / Besonderheiten" value={d.rueckstaende_besonderheiten} />
      </Card>

      {/* Prozess */}
      {(d.verkaufsgrund || d.zeithorizont || d.makler_beauftragt || d.anderweitig_angeboten) && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold">Verkaufsprozess</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoRow label="Verkaufsgrund" value={d.verkaufsgrund} />
            <InfoRow label="Zeithorizont" value={d.zeithorizont} />
            <InfoRow label="Makler beauftragt" value={labelFuer(JA_NEIN_OPTIONEN, d.makler_beauftragt ?? "")} />
            <InfoRow label="Anderweitig angeboten" value={labelFuer(JA_NEIN_OPTIONEN, d.anderweitig_angeboten ?? "")} />
          </div>
          <InfoRow label="Makler / Provisionssituation" value={d.makler_details} />
        </Card>
      )}

      {/* Unterlagen */}
      {Array.isArray(d.unterlagen) && d.unterlagen.length > 0 && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold">Vorhandene Unterlagen</h3>
          <div className="flex flex-wrap gap-2">
            {d.unterlagen.map(u => (
              <Badge key={u} variant="secondary">{labelFuer(UNTERLAGEN_OPTIONEN, u)}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Zustand je Gewerk */}
      {(e.zustand_aussenfassade || e.zustand_dach || e.zustand_heizung || e.zustand_elektrik || e.zustand_fenster || e.zustand_waende || e.zustand_boden || e.zustand_haustuer || e.zustand_wohnungstueren || e.zustand_baeder || e.zustand_treppenhaus) && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold">Zustand der Immobilie im Detail</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoRow label="Außenfassade" value={e.zustand_aussenfassade} />
            <InfoRow label="Dach" value={e.zustand_dach} />
            <InfoRow label="Heizung" value={e.zustand_heizung} />
            <InfoRow label="Elektrik" value={e.zustand_elektrik} />
            <InfoRow label="Fenster" value={e.zustand_fenster} />
            <InfoRow label="Wände" value={e.zustand_waende} />
            <InfoRow label="Boden" value={e.zustand_boden} />
            <InfoRow label="Haustür" value={e.zustand_haustuer} />
            <InfoRow label="Wohnungstüren" value={e.zustand_wohnungstueren} />
            <InfoRow label="Bäder" value={e.zustand_baeder} />
            <InfoRow label="Treppenhaus" value={e.zustand_treppenhaus} />
          </div>
        </Card>
      )}

      {/* Sanierung */}
      {(e.sanierungsangebot || e.sonstige_infos || e.whg_massnahmen || e.musterwohnung) && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold">Sanierung & Sonstiges</h3>
          <InfoRow label="Sanierungsangebot" value={e.sanierungsangebot} />
          <InfoRow label="Sonstige Infos" value={e.sonstige_infos} />
          <InfoRow label="WHG Maßnahmen" value={e.whg_massnahmen} />
          <InfoRow label="Musterwohnung" value={e.musterwohnung} />
        </Card>
      )}

      {/* Wohnungen */}
      {wohnungen.length > 0 && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold">Wohneinheiten ({wohnungen.length})</h3>
          <div className="space-y-2">
            {wohnungen.map((w: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 grid grid-cols-4 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground">Bezeichnung</span><p className="font-medium">{w.bezeichnung || `WHG ${i + 1}`}</p></div>
                <div><span className="text-xs text-muted-foreground">Etage</span><p>{w.etage || "–"}</p></div>
                <div><span className="text-xs text-muted-foreground">Vermietet</span><p>{w.vermietet || "–"}</p></div>
                <div><span className="text-xs text-muted-foreground">Mieter</span><p>{w.mieter_name || "–"}</p></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Verwaltung & AB */}
      {(e.hausverwaltung || e.visualisierung || e.ab_eingereicht_am || e.bauamt) && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold">Verwaltung & AB/TK</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoRow label="Hausverwaltung" value={e.hausverwaltung} />
            <InfoRow label="Visualisierung" value={e.visualisierung} />
            <InfoRow label="AB eingereicht am" value={e.ab_eingereicht_am} />
            <InfoRow label="Bauamt" value={e.bauamt} />
            <InfoRow label="Ansprechpartner" value={e.bauamt_ansprechpartner} />
            <InfoRow label="Notartermin TK" value={e.notartermin_tk ? format(new Date(e.notartermin_tk + "T00:00:00"), "dd.MM.yyyy") : "–"} />
          </div>
          <InfoRow label="Zusätzliche Infos TK" value={e.zusaetzliche_infos_tk} />
        </Card>
      )}

      {/* Bewertung / Notizen */}
      {canManage && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold">Interne Bewertung</h3>
          <Label className="text-xs">Bewertung / Notizen</Label>
          <Textarea value={bewertung} onChange={ev => setBewertung(ev.target.value)} rows={4} placeholder="Interne Einschätzung..." />
          <Button variant="outline" size="sm" onClick={async () => {
            await supabase.from("objekt_einreichungen").update({ bewertung } as any).eq("id", id!);
            toast.success("Bewertung gespeichert.");
          }}>Bewertung speichern</Button>
        </Card>
      )}
    </div>
  );
}
