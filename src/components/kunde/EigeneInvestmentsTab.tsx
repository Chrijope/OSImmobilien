import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { openUnterlage } from "@/lib/storage";
import { confirmDialog } from "@/lib/confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, Plus, Euro, MapPin, Calendar, TrendingUp, FileText,
  Trash2, Edit, ArrowLeft, Home, Landmark, PiggyBank,
  Receipt, Percent, BarChart3, Eye, Download, Loader2, Milestone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend } from "recharts";
import { SteuerCockpitEigen } from "@/components/kunde/eigene/SteuerCockpitEigen";
import { TilgungsplanCard } from "@/components/kunde/eigene/TilgungsplanCard";
import { CashflowForecastCard } from "@/components/kunde/eigene/CashflowForecastCard";
import { MarktwertCard } from "@/components/kunde/eigene/MarktwertCard";
import { ReinvestHinweisCard } from "@/components/kunde/eigene/ReinvestHinweisCard";
import { RentalOneHinweisCard } from "@/components/kunde/RentalOneHinweisCard";
import { SchillingGutachtenHinweisCard } from "@/components/kunde/SchillingGutachtenHinweisCard";
import { monateSeitLetztemKauf, leseAnlageV, ERHALTUNG_TYP_REGEX, aktuelleRestschuld, type ExternesInvestment as BerechnungsInvestment } from "@/lib/eigeneInvestmentBerechnungen";
import { linearerAfaSatz } from "@/lib/afaSaetze";
import { validiereEigenesInvestment, zahlOderNull, type PruefErgebnis } from "@/lib/eigeneInvestmentValidierung";
import {
  aktualisiereEigenesInvestment, anlageVAusFormular, einzelwerteZuAenderung, istSpaltenFehler,
  uebernimmAltwerte, wendeAenderungAn, type CockpitFeld,
} from "@/lib/eigeneInvestmentSpeichern";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import { portalLocale, portalSprache } from "@/i18n/portalSprache";
import { datumText, euroText, prozentText } from "@/lib/sprachFormat";

// Zahlenfelder sind NULL-faehig: Ein leeres Formularfeld bleibt NULL und wird
// nicht still zu 0 (Stufe 2 der Kundenportal-Sanierung).
type ExternesInvestment = {
  id: string;
  user_id: string;
  bezeichnung: string;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  objekttyp: string | null;
  baujahr: number | null;
  wohnflaeche: number | null;
  kaufpreis: number | null;
  kaufdatum: string | null;
  nebenkosten: number | null;
  darlehenssumme: number | null;
  offene_tilgung: number | null;
  zinssatz: number | null;
  monatliche_rate: number | null;
  mieteinnahmen_kalt: number | null;
  mieteinnahmen_warm: number | null;
  hausgeld: number | null;
  ruecklagen: number | null;
  verwalter: string | null;
  notizen: string | null;
  dokumente: any[];
  meta: any;
  erstellt_am: string;
  aktualisiert_am: string;
  // Anlage-V-Spalten, fehlen bis zur Migration 20260818100000 (dann meta.anlageV)
  gebaeude_anteil_prozent?: number | null;
  afa_satz_prozent?: number | null;
  grundsteuer_jahr?: number | null;
  versicherung_jahr?: number | null;
  verwaltungskosten_jahr?: number | null;
  hausgeld_nicht_umlage_monat?: number | null;
  umlagen_monat?: number | null;
  miteigentumsanteil_prozent?: number | null;
};

type DokumentEntry = {
  id: string; name: string; titel?: string; url: string; typ: string; datum: string; size?: number;
  /** Belegbetrag in Euro, fuer Erhaltungsaufwand-Belege. */
  betrag?: number | null;
  /** true = zaehlt im Steuer-Cockpit als Erhaltungsaufwand. */
  steuer_relevant?: boolean;
};

const OBJEKT_TYPEN = [
  { value: "wohnung", labelKey: "typ_wohnung" },
  { value: "haus", labelKey: "typ_haus" },
  { value: "mehrfamilienhaus", labelKey: "typ_mehrfamilienhaus" },
  { value: "gewerbe", labelKey: "typ_gewerbe" },
  { value: "grundstueck", labelKey: "typ_grundstueck" },
  { value: "sonstige", labelKey: "typ_sonstige" },
];

// Herkunft als Badge in Tokens mit Dunkelwert (vorher slate, amber, pink).
const QUELLEN = [
  { value: "extern", labelKey: "quelle_extern", color: "bg-muted text-muted-foreground border-border" },
  { value: "erbschaft", labelKey: "quelle_erbschaft", color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30" },
  { value: "schenkung", labelKey: "quelle_schenkung", color: "bg-primary/10 text-primary border-primary/30" },
];

const DOK_TYPEN = [
  "Kaufvertrag", "Grundbuchauszug", "Darlehensvertrag", "Energieausweis",
  "Hausgeldabrechnung", "Mietvertrag", "Nebenkostenabrechnung", "Versicherung",
  "Reparatur/Erhaltung", "Steuerunterlagen", "Fotos", "Sonstige",
];

const emptyForm = {
  bezeichnung: "", adresse: "", plz: "", ort: "",
  objekttyp: "wohnung", baujahr: "", wohnflaeche: "",
  kaufpreis: "", kaufdatum: "", nebenkosten: "",
  darlehenssumme: "", offene_tilgung: "", zinssatz: "", monatliche_rate: "",
  anfangstilgung: "", sondertilgung_jahr: "", zinsbindung_bis: "",
  mieteinnahmen_kalt: "", mieteinnahmen_warm: "", hausgeld: "", ruecklagen: "",
  verwalter: "", notizen: "",
  // Meilensteine
  notartermin: "", kaufpreis_faelligkeit: "", grundschuld_eingetragen: "",
  uebergabe: "", erste_miete: "",
  eigenanteil_manuell: "",
  quelle: "extern",
  // Steuerangaben fuer die Anlage V (Stufe 2)
  gebaeude_anteil_prozent: "", afa_satz_prozent: "",
  grundsteuer_jahr: "", versicherung_jahr: "", verwaltungskosten_jahr: "",
  hausgeld_nicht_umlage_monat: "", umlagen_monat: "",
  miteigentumsanteil_prozent: "",
};

interface EigeneInvestmentsTabProps {
  /**
   * Zurück zur Investments-Übersicht. Der Knopf steht nur in der Liste. In
   * der Detailansicht gibt es genau einen Zurück-Knopf (zur Liste), vorher
   * standen dort „Zur Übersicht“ und „Zurück“ übereinander.
   */
  onZurUebersicht?: () => void;
}

const EigeneInvestmentsTab = ({ onZurUebersicht }: EigeneInvestmentsTabProps = {}) => {
  const { t } = useTranslation();
  const sprache = portalSprache();
  const fmt = (v: number) => euroText(v, sprache, 2);
  const fmtPct = (v: number) => prozentText(v, sprache, 2);
  // Unlesbares bleibt stehen, wie es gespeichert ist.
  const fmtDate = (d?: string | null) => {
    if (!d) return "—";
    return datumText(d, sprache) || d;
  };
  // Dokumenttypen sind gespeicherte Werte (siehe ERHALTUNG_TYP_REGEX), übersetzt wird nur die Anzeige.
  const dokTypLabel = (typ: string): string => {
    const labels: Record<string, string> = {
      Kaufvertrag: t("portal.cards.eigene.dok_typ_kaufvertrag"),
      Grundbuchauszug: t("portal.cards.eigene.dok_typ_grundbuchauszug"),
      Darlehensvertrag: t("portal.cards.eigene.dok_typ_darlehensvertrag"),
      Energieausweis: t("portal.cards.eigene.dok_typ_energieausweis"),
      Hausgeldabrechnung: t("portal.cards.eigene.dok_typ_hausgeldabrechnung"),
      Mietvertrag: t("portal.cards.eigene.dok_typ_mietvertrag"),
      Nebenkostenabrechnung: t("portal.cards.eigene.dok_typ_nebenkostenabrechnung"),
      Versicherung: t("portal.cards.eigene.dok_typ_versicherung"),
      "Reparatur/Erhaltung": t("portal.cards.eigene.dok_typ_reparatur"),
      Steuerunterlagen: t("portal.cards.eigene.dok_typ_steuerunterlagen"),
      Fotos: t("portal.cards.eigene.dok_typ_fotos"),
      Sonstige: t("portal.cards.eigene.dok_typ_sonstige"),
    };
    return labels[typ] ?? typ;
  };
  const { authUser } = useUser();
  const [investments, setInvestments] = useState<ExternesInvestment[]>([]);
  const [saData, setSaData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightDocs, setHighlightDocs] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadDokTyp, setUploadDokTyp] = useState("Sonstige");
  const [uploadTitel, setUploadTitel] = useState("");
  const [uploadBetrag, setUploadBetrag] = useState("");
  const [uploadBelegDatum, setUploadBelegDatum] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Validierung: harte Fehler blockieren, Warnungen brauchen eine Bestaetigung.
  const [pruefung, setPruefung] = useState<PruefErgebnis | null>(null);
  const [warnungBestaetigt, setWarnungBestaetigt] = useState(false);

  const loadData = async () => {
    if (!authUser) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("externe_investments")
      .select("*")
      .order("erstellt_am", { ascending: false });
    if (!error && data) {
      // "Über OS Immobilien" Investments laufen über den anderen Tab (Tabelle `investments`).
      // In "Eigene Investments" werden ausschließlich Immobilien angezeigt, die NICHT
      // über OS Immobilien erworben wurden.
      const filtered = (data as any[]).filter(i => (i.meta?.quelle || "extern") !== "moreimmo");
      // Einmalig: Bodenwert- und Verwaltungsanteil aus meta.steuerCockpit in
      // die Dialogfelder uebernehmen, danach gilt nur noch der Dialogwert.
      const uebernommen = await Promise.all(filtered.map(i => uebernimmAltwerte(i)));
      setInvestments(uebernommen as any);
    }
    // Selbstauskunft des Kunden für Steuersatz-Vorschlag laden
    const { data: kontakte } = await supabase
      .from("kontakte")
      .select("meta")
      .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
      .limit(1);
    const meta: any = kontakte?.[0]?.meta;
    setSaData(meta?.selbstauskunft || null);
    setLoading(false);
  };

  // An der Kennung statt am Objekt, siehe KundeInvestments: Ein neues
  // authUser-Objekt bei gleicher Sitzung soll nicht neu laden.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [authUser?.id]);

  // Tiefenlink: ?inv=<id>&highlight=dokumente -> Investment direkt öffnen +
  // Dokumente-Bereich hervorheben & dorthin scrollen.
  useEffect(() => {
    if (loading || investments.length === 0) return;
    const invId = searchParams.get("inv");
    if (!invId) return;
    const exists = investments.some(i => i.id === invId);
    if (!exists) return;
    setSelectedId(invId);
    if (searchParams.get("highlight") === "dokumente") {
      // nach dem Render scrollen + highlighten
      setTimeout(() => {
        const el = document.getElementById("eigene-dokumente");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightDocs(true);
        setTimeout(() => setHighlightDocs(false), 4000);
      }, 250);
    }
    // URL-Params aufräumen, damit erneutes Klicken im Tab nicht hängenbleibt
    const next = new URLSearchParams(searchParams);
    next.delete("inv");
    next.delete("highlight");
    // tab-Parameter beibehalten
    setSearchParams(next, { replace: true });
  }, [loading, investments, searchParams, setSearchParams]);

  const selected = investments.find(i => i.id === selectedId) || null;

  // Die Detailansicht beginnt oben. Auf dem Handy öffnete sie sonst mitten
  // auf der Seite, dort, wo in der Liste die Karte angetippt wurde.
  useEffect(() => {
    if (!selectedId) return;
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* ohne Fenster, etwa im Test */ }
  }, [selectedId]);

  const openNew = () => {
    setEditId(null); setForm(emptyForm);
    setPruefung(null); setWarnungBestaetigt(false);
    setShowForm(true);
  };

  const openEdit = (inv: ExternesInvestment) => {
    const m = inv.meta || {};
    const av = leseAnlageV(inv as any);
    setEditId(inv.id);
    setPruefung(null); setWarnungBestaetigt(false);
    setForm({
      bezeichnung: inv.bezeichnung || "",
      adresse: inv.adresse || "", plz: inv.plz || "", ort: inv.ort || "",
      objekttyp: inv.objekttyp || "wohnung",
      baujahr: inv.baujahr?.toString() || "",
      wohnflaeche: inv.wohnflaeche?.toString() || "",
      kaufpreis: inv.kaufpreis?.toString() || "",
      kaufdatum: inv.kaufdatum || "",
      nebenkosten: inv.nebenkosten?.toString() || "",
      darlehenssumme: inv.darlehenssumme?.toString() || "",
      offene_tilgung: inv.offene_tilgung?.toString() || "",
      zinssatz: inv.zinssatz?.toString() || "",
      monatliche_rate: inv.monatliche_rate?.toString() || "",
      anfangstilgung: m.anfangstilgung?.toString() || "",
      sondertilgung_jahr: m.sondertilgung_jahr?.toString() || "",
      zinsbindung_bis: m.zinsbindung_bis || "",
      mieteinnahmen_kalt: inv.mieteinnahmen_kalt?.toString() || "",
      mieteinnahmen_warm: inv.mieteinnahmen_warm?.toString() || "",
      hausgeld: inv.hausgeld?.toString() || "",
      ruecklagen: inv.ruecklagen?.toString() || "",
      verwalter: inv.verwalter || "",
      notizen: inv.notizen || "",
      notartermin: m.notartermin || "",
      kaufpreis_faelligkeit: m.kaufpreis_faelligkeit || "",
      grundschuld_eingetragen: m.grundschuld_eingetragen || "",
      uebergabe: m.uebergabe || "",
      erste_miete: m.erste_miete || "",
      eigenanteil_manuell: m.eigenanteil_manuell?.toString() || "",
      quelle: m.quelle || "extern",
      gebaeude_anteil_prozent: av.gebaeudeAnteilProzent?.toString() ?? "",
      afa_satz_prozent: av.afaSatzProzent?.toString() ?? "",
      grundsteuer_jahr: av.grundsteuerJahr?.toString() ?? "",
      versicherung_jahr: av.versicherungJahr?.toString() ?? "",
      verwaltungskosten_jahr: av.verwaltungskostenJahr?.toString() ?? "",
      hausgeld_nicht_umlage_monat: av.hausgeldNichtUmlageMonat?.toString() ?? "",
      umlagen_monat: av.umlagenMonat?.toString() ?? "",
      miteigentumsanteil_prozent: av.miteigentumsanteilProzent?.toString() ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    // Echte Validierung: harte Fehler blockieren, Warnungen brauchen eine
    // ausdrueckliche Bestaetigung ("Trotzdem speichern").
    const ergebnis = validiereEigenesInvestment(form);
    // Pflichtfeld: Das leere Feld wird rot markiert und die Meldung steht im
    // Formular ueber den Knoepfen. Vorher kam nur ein Toast, der unten rechts
    // genau ueber dem Knopf „Anlegen“ lag.
    if (!form.bezeichnung.trim()) {
      ergebnis.fehler.unshift(t("portal.cards.eigene.toast_need_name"));
      ergebnis.felder.bezeichnung = "fehler";
    }
    setPruefung(ergebnis);
    if (ergebnis.fehler.length > 0) {
      setWarnungBestaetigt(false);
      return;
    }
    if (ergebnis.warnungen.length > 0 && !warnungBestaetigt) {
      setWarnungBestaetigt(true);
      return;
    }

    setSaving(true);
    // Anlage-V-Werte: gleiche Schluessel wie die Tabellenspalten, zusaetzlich
    // als meta.anlageV (Uebergangspfad, solange die Migration nicht lief).
    // Dieselbe Umwandlung nutzt der Stift im Steuer-Cockpit.
    const anlageV = anlageVAusFormular(form);
    const meta = {
      anfangstilgung: zahlOderNull(form.anfangstilgung),
      sondertilgung_jahr: zahlOderNull(form.sondertilgung_jahr),
      zinsbindung_bis: form.zinsbindung_bis || null,
      notartermin: form.notartermin || null,
      kaufpreis_faelligkeit: form.kaufpreis_faelligkeit || null,
      grundschuld_eingetragen: form.grundschuld_eingetragen || null,
      uebergabe: form.uebergabe || null,
      erste_miete: form.erste_miete || null,
      eigenanteil_manuell: zahlOderNull(form.eigenanteil_manuell),
      quelle: form.quelle || "extern",
      anlageV,
    };
    // Leere Zahlenfelder bleiben NULL statt still 0 zu werden.
    const payload = {
      bezeichnung: form.bezeichnung.trim(),
      adresse: form.adresse.trim() || null,
      plz: form.plz.trim() || null,
      ort: form.ort.trim() || null,
      objekttyp: form.objekttyp,
      baujahr: form.baujahr ? parseInt(form.baujahr) : null,
      wohnflaeche: zahlOderNull(form.wohnflaeche),
      kaufpreis: zahlOderNull(form.kaufpreis),
      kaufdatum: form.kaufdatum || null,
      nebenkosten: zahlOderNull(form.nebenkosten),
      darlehenssumme: zahlOderNull(form.darlehenssumme),
      offene_tilgung: zahlOderNull(form.offene_tilgung),
      zinssatz: zahlOderNull(form.zinssatz),
      monatliche_rate: zahlOderNull(form.monatliche_rate),
      mieteinnahmen_kalt: zahlOderNull(form.mieteinnahmen_kalt),
      mieteinnahmen_warm: zahlOderNull(form.mieteinnahmen_warm),
      hausgeld: zahlOderNull(form.hausgeld),
      ruecklagen: zahlOderNull(form.ruecklagen),
      verwalter: form.verwalter.trim() || null,
      notizen: form.notizen.trim() || null,
    };

    if (editId) {
      const existing = investments.find(i => i.id === editId);
      const mergedMeta = { ...(existing?.meta || {}), ...meta };
      const { error } = await aktualisiereEigenesInvestment(editId, { payload, anlageV, meta: mergedMeta });
      if (error) { toast.error(t("portal.cards.eigene.toast_save_failed")); console.error(error); }
      else toast.success(t("portal.cards.eigene.toast_updated"));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      let { error } = await supabase.from("externe_investments")
        .insert({ ...payload, ...anlageV, meta, user_id: userData.user?.id });
      if (error && istSpaltenFehler(error)) {
        ({ error } = await supabase.from("externe_investments")
          .insert({ ...payload, meta, user_id: userData.user?.id }));
      }
      if (error) { toast.error(t("portal.cards.eigene.toast_create_failed")); console.error(error); }
      else toast.success(t("portal.cards.eigene.toast_created"));
    }
    setSaving(false);
    setShowForm(false);
    setWarnungBestaetigt(false);
    setPruefung(null);
    loadData();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: t("portal.cards.eigene.confirm_delete"),
      confirmText: t("portal.cards.eigene.delete", "Löschen"),
      cancelText: t("portal.cards.eigene.keep", "Behalten"),
      variant: "destructive",
    });
    if (!ok) return;
    // Erst die Belege aus dem Storage entfernen, DANN den Datensatz: Die
    // Loesch-Policy prueft, ob das Investment dem Nutzer gehoert, und greift
    // deshalb nur, solange der Datensatz noch existiert. Schlaegt das
    // Entfernen fehl (z. B. Storage-Migration nicht gelaufen), wird das
    // Investment trotzdem geloescht; die Dateien blieben dann verwaist.
    const inv = investments.find(i => i.id === id);
    const pfade = (inv?.dokumente || [])
      .map((d: any) => d?.url)
      .filter((u: any): u is string => typeof u === "string" && !!u && !/^https?:/i.test(u));
    if (pfade.length > 0) {
      const { error: removeError } = await supabase.storage.from("unterlagen").remove(pfade);
      if (removeError) {
        console.warn("Belege konnten nicht aus dem Storage geloescht werden:", removeError.message);
      }
    }
    await supabase.from("externe_investments").delete().eq("id", id);
    if (selectedId === id) setSelectedId(null);
    toast.success(t("portal.cards.eigene.toast_deleted"));
    loadData();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    if (file.size > 20 * 1024 * 1024) { toast.error(t("portal.cards.eigene.toast_upload_max")); return; }
    const betrag = zahlOderNull(uploadBetrag);
    if (betrag !== null && (!Number.isFinite(betrag) || betrag < 0)) {
      toast.error(t("portal.cards.eigene.toast_doc_betrag", "Bitte einen gültigen Betrag eingeben"));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    const path = `externe-investments/${selectedId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("unterlagen").upload(path, file);
    if (uploadError) { toast.error(t("portal.cards.eigene.toast_upload_failed")); setUploading(false); return; }
    // Belegdatum (falls angegeben) wird als Dokumentdatum gespeichert, damit
    // das Steuer-Cockpit den Beleg dem richtigen Steuerjahr zuordnen kann.
    const belegDatum = uploadBelegDatum
      ? new Date(`${uploadBelegDatum}T12:00:00`).toISOString()
      : new Date().toISOString();
    const newDoc: DokumentEntry = {
      id: crypto.randomUUID(),
      name: file.name,
      titel: uploadTitel.trim() || file.name,
      url: path,
      typ: uploadDokTyp,
      datum: belegDatum,
      size: file.size,
      betrag,
      // Erhaltungsaufwand zaehlt nur mit Betrag, Belege ohne Betrag nie.
      steuer_relevant: betrag !== null && betrag > 0 && ERHALTUNG_TYP_REGEX.test(uploadDokTyp),
    };
    const inv = investments.find(i => i.id === selectedId);
    const docs = [...(inv?.dokumente || []), newDoc];
    await supabase.from("externe_investments").update({ dokumente: docs as any }).eq("id", selectedId);
    toast.success(t("portal.cards.eigene.toast_doc_uploaded"));
    setUploading(false);
    setUploadTitel("");
    setUploadBetrag("");
    setUploadBelegDatum("");
    if (fileRef.current) fileRef.current.value = "";
    loadData();
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedId) return;
    const inv = investments.find(i => i.id === selectedId);
    const doc = (inv?.dokumente || []).find((d: any) => d.id === docId) as DokumentEntry | undefined;
    // Erst fragen: Das Dokument verschwindet samt Datei und laesst sich nicht
    // wiederherstellen. Vorher loeschte ein Klick auf den Papierkorb sofort.
    const ok = await confirmDialog({
      title: t("portal.cards.eigene.confirm_delete_doc", "Dokument löschen?"),
      description: t("portal.cards.eigene.confirm_delete_doc_text", "„{{name}}“ wird samt Datei entfernt. Das lässt sich nicht rückgängig machen.", { name: doc?.titel || doc?.name || "" }),
      confirmText: t("portal.cards.eigene.delete", "Löschen"),
      cancelText: t("portal.cards.eigene.keep", "Behalten"),
      variant: "destructive",
    });
    if (!ok) return;
    // Datei im Storage mitloeschen, nicht nur den JSON-Eintrag. Schlaegt das
    // mangels Rechten fehl (Storage-Migration noch nicht gelaufen), wird der
    // Eintrag trotzdem entfernt; die Datei bleibt dann verwaist im Bucket.
    if (doc?.url && !/^https?:/i.test(doc.url)) {
      const { data: removed, error: removeError } = await supabase.storage
        .from("unterlagen")
        .remove([doc.url]);
      if (removeError || !removed || removed.length === 0) {
        console.warn(
          "Storage-Datei konnte nicht geloescht werden (Eintrag wird trotzdem entfernt):",
          removeError?.message || doc.url,
        );
      }
    }
    const docs = (inv?.dokumente || []).filter((d: any) => d.id !== docId);
    await supabase.from("externe_investments").update({ dokumente: docs as any }).eq("id", selectedId);
    toast.success(t("portal.cards.eigene.toast_doc_removed"));
    loadData();
  };

  const calcKennzahlen = (inv: ExternesInvestment) => {
    // Zahlenfelder koennen NULL sein (leere Formularfelder bleiben leer).
    const kaufpreis = inv.kaufpreis ?? 0;
    const nebenkosten = inv.nebenkosten ?? 0;
    const mieteKalt = inv.mieteinnahmen_kalt ?? 0;
    const hausgeld = inv.hausgeld ?? 0;
    const ruecklagen = inv.ruecklagen ?? 0;
    const rate = inv.monatliche_rate ?? 0;
    const darlehen = inv.darlehenssumme ?? 0;
    const gesamtkosten = kaufpreis + nebenkosten;
    const jahresMieteKalt = mieteKalt * 12;
    const bruttoRendite = gesamtkosten > 0 ? (jahresMieteKalt / gesamtkosten) * 100 : 0;
    const jahresKosten = (hausgeld + ruecklagen) * 12;
    const nettoMiete = jahresMieteKalt - jahresKosten;
    const nettoRendite = gesamtkosten > 0 ? (nettoMiete / gesamtkosten) * 100 : 0;
    const cashflow = mieteKalt - rate - hausgeld - ruecklagen;
    const eigenkapital = gesamtkosten - darlehen;
    const ltv = gesamtkosten > 0 ? (darlehen / gesamtkosten) * 100 : 0;
    const eigenanteilAuto = Math.max(0, rate + hausgeld + ruecklagen - mieteKalt);
    const eigenanteilManuell = inv.meta?.eigenanteil_manuell;
    const eigenanteil = eigenanteilManuell != null ? Number(eigenanteilManuell) : eigenanteilAuto;
    return { gesamtkosten, bruttoRendite, nettoRendite, cashflow, eigenkapital, ltv, jahresMieteKalt, nettoMiete, eigenanteil, eigenanteilAuto };
  };

  // Offene Tilgung: eingetragen oder aus dem Darlehen fortgeschrieben, dieselbe
  // Rechnung wie der Tilgungsplan. Vorher stand bei leerem Feld 0,00 €.
  const restschuldVon = (inv: ExternesInvestment) => aktuelleRestschuld(inv as any);

  const portfolioSummary = investments.reduce(
    (acc, inv) => {
      acc.gesamtwert += inv.kaufpreis ?? 0;
      acc.gesamtMiete += inv.mieteinnahmen_kalt ?? 0;
      acc.gesamtRate += inv.monatliche_rate ?? 0;
      acc.offeneTilgung += restschuldVon(inv) ?? 0;
      return acc;
    },
    { gesamtwert: 0, gesamtMiete: 0, gesamtRate: 0, offeneTilgung: 0 }
  );

  const typLabel = (typ: string | null) => {
    const found = OBJEKT_TYPEN.find(o => o.value === typ);
    return found ? t(`portal.cards.eigene.${found.labelKey}`) : (typ || "–");
  };
  const quelleConfig = (q: string | undefined) => {
    const cfg = QUELLEN.find(x => x.value === (q || "extern")) || QUELLEN[0];
    return { ...cfg, label: t(`portal.cards.eigene.${cfg.labelKey}`) };
  };

  const persistMeta = async (id: string, patch: any) => {
    const inv = investments.find(i => i.id === id);
    const merged = { ...(inv?.meta || {}), ...patch };
    const { error } = await supabase.from("externe_investments").update({ meta: merged }).eq("id", id);
    if (error) { toast.error(t("portal.cards.eigene.toast_persist_failed")); return; }
    loadData();
  };

  // Stift im Steuer-Cockpit: dieselbe Aenderung und derselbe Schreibweg wie
  // der Bearbeiten-Dialog. Die Zeile wird sofort lokal uebernommen, damit das
  // Cockpit ohne Warten neu rechnet, danach laedt der Stand aus der Datenbank.
  const speichereCockpitFelder = async (id: string, werte: Partial<Record<CockpitFeld, string>>) => {
    const inv = investments.find(i => i.id === id);
    if (!inv) return false;
    const aenderung = einzelwerteZuAenderung(inv as unknown as BerechnungsInvestment, werte);
    const { error } = await aktualisiereEigenesInvestment(id, aenderung);
    if (error) { toast.error(t("portal.cards.eigene.toast_save_failed")); console.error(error); return false; }
    setInvestments(prev => prev.map(i => (i.id === id ? wendeAenderungAn(i, aenderung) : i)));
    toast.success(t("portal.cards.eigene.toast_updated"));
    loadData();
    return true;
  };

  /* ═══════ DETAIL VIEW ═══════ */
  if (selected) {
    const kz = calcKennzahlen(selected);
    const docs = (selected.dokumente || []) as DokumentEntry[];
    const m = selected.meta || {};
    const qc = quelleConfig(m.quelle);
    const monate = monateSeitLetztemKauf(selected as any);

    const cashflowData = [
      { name: t("portal.cards.eigene.cf_kaltmiete"), value: selected.mieteinnahmen_kalt ?? 0, color: "hsl(var(--success))" },
      { name: t("portal.cards.eigene.cf_bankrate"), value: selected.monatliche_rate ?? 0, color: "hsl(var(--destructive))" },
      { name: t("portal.cards.eigene.cf_hausgeld"), value: selected.hausgeld ?? 0, color: "hsl(var(--warning))" },
      { name: t("portal.cards.eigene.cf_ruecklagen"), value: selected.ruecklagen ?? 0, color: "hsl(var(--primary))" },
    ].filter(d => d.value > 0);

    const milestones = [
      { label: t("portal.cards.eigene.ms_kauf"), date: selected.kaufdatum },
      { label: t("portal.cards.eigene.ms_notar"), date: m.notartermin },
      { label: t("portal.cards.eigene.ms_faelligkeit"), date: m.kaufpreis_faelligkeit },
      { label: t("portal.cards.eigene.ms_grundschuld"), date: m.grundschuld_eingetragen },
      { label: t("portal.cards.eigene.ms_uebergabe"), date: m.uebergabe },
      { label: t("portal.cards.eigene.ms_erste_miete"), date: m.erste_miete },
    ];
    const milestonesWithDate = milestones.filter(ms => ms.date);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />{t("portal.cards.eigene.back")}
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate">{selected.bezeichnung}</h2>
            {selected.adresse && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3.5 w-3.5" />{selected.adresse}{selected.plz ? `, ${selected.plz}` : ""} {selected.ort || ""}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openEdit(selected)} className="gap-1.5">
              <Edit className="h-4 w-4" />{t("portal.cards.eigene.edit")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDelete(selected.id)} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />{t("portal.cards.eigene.delete")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{typLabel(selected.objekttyp)}</Badge>
          <Badge variant="outline" className={qc.color}>{qc.label}</Badge>
          {selected.baujahr && <Badge variant="outline">{t("portal.cards.eigene.year_built", { year: selected.baujahr })}</Badge>}
          {selected.wohnflaeche && <Badge variant="outline">{selected.wohnflaeche} m²</Badge>}
          {selected.kaufdatum && <Badge variant="outline"><Calendar className="h-3 w-3 mr-1" />{t("portal.cards.eigene.purchase_on", { date: fmtDate(selected.kaufdatum) })}</Badge>}
        </div>

        {m.quelle === "moreimmo" && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-foreground/80">
            <span dangerouslySetInnerHTML={{ __html: t("portal.cards.eigene.moreimmo_hint") }} />
          </div>
        )}

        {monate !== null && monate >= 6 && (
          <ReinvestHinweisCard monateSeitKauf={monate} />
        )}

        {/* Kennzahlen Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("portal.cards.eigene.kpi_kaufpreis"), value: fmt(selected.kaufpreis ?? 0), icon: Euro },
            { label: t("portal.cards.eigene.kpi_gesamt"), value: fmt(kz.gesamtkosten), icon: Receipt },
            { label: t("portal.cards.eigene.kpi_eigenkapital"), value: fmt(kz.eigenkapital), icon: PiggyBank },
            { label: t("portal.cards.eigene.kpi_offene"), value: fmt(restschuldVon(selected) ?? 0), icon: Landmark },
            { label: t("portal.cards.eigene.kpi_rate"), value: fmt(selected.monatliche_rate ?? 0), icon: BarChart3 },
            { label: t("portal.cards.eigene.kpi_miete_kalt"), value: fmt(selected.mieteinnahmen_kalt ?? 0), icon: Home },
            { label: t("portal.cards.eigene.kpi_eigenanteil"), value: fmt(kz.eigenanteil), icon: PiggyBank, accent: kz.eigenanteil > 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--success))]" },
            { label: t("portal.cards.eigene.kpi_brutto"), value: fmtPct(kz.bruttoRendite), icon: Percent },
          ].map((k, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <k.icon className="h-4 w-4" />
                <span className="text-xs">{k.label}</span>
              </div>
              <div className={`text-lg font-bold ${k.accent || ""}`}>{k.value}</div>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Cashflow Donut */}
          <Card className="p-5">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />{t("portal.cards.eigene.cashflow_title")}</h3>
            <p className="text-xs text-muted-foreground mb-3">{t("portal.cards.eigene.cashflow_subtitle")}</p>
            {cashflowData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">{t("portal.cards.eigene.cashflow_empty")}</p>
            ) : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={cashflowData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                      {cashflowData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <ReTooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-border/40 flex justify-between text-sm">
              <span className="text-muted-foreground">{t("portal.cards.eigene.saldo")}</span>
              <span className={`font-semibold ${kz.cashflow >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>{fmt(kz.cashflow)}</span>
            </div>
          </Card>

          {/* Meilenstein-Timeline */}
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Milestone className="h-4 w-4 text-primary" />{t("portal.cards.eigene.milestones_title")}</h3>
            {milestonesWithDate.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">{t("portal.cards.eigene.milestones_empty")}</p>
            ) : (
              <div className="space-y-3">
                {milestones.map((ms, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shrink-0 ${ms.date ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    <div className="flex-1 flex items-center justify-between text-sm">
                      <span className={ms.date ? "font-medium" : "text-muted-foreground"}>{ms.label}</span>
                      <span className={ms.date ? "text-foreground" : "text-muted-foreground/60"}>{fmtDate(ms.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Marktwert */}
        <MarktwertCard inv={selected as any} onPersist={(p) => persistMeta(selected.id, p)} />

        {/* Tilgungsplan + Cashflow-Forecast */}
        <div className="grid lg:grid-cols-2 gap-4">
          <TilgungsplanCard inv={selected as any} />
          <CashflowForecastCard inv={selected as any} saData={saData} />
        </div>

        {/* Steuer-Cockpit */}
        <SteuerCockpitEigen
          inv={selected as any}
          saData={saData}
          onPersist={(p) => persistMeta(selected.id, p)}
          onFelderSpeichern={(werte) => speichereCockpitFelder(selected.id, werte)}
          onBearbeiten={() => openEdit(selected)}
          onBelegeZeigen={() => document.getElementById("eigene-dokumente")?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
        />

        {/* Finanzierung & Mieten Detail */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />{t("portal.cards.eigene.fin_title")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_darlehen")}</span><span className="font-medium">{fmt(selected.darlehenssumme ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_offen")}</span><span className="font-medium">{fmt(restschuldVon(selected) ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_zins")}</span><span className="font-medium">{fmtPct(selected.zinssatz ?? 0)}</span></div>
              {m.anfangstilgung != null && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_anf_tilgung")}</span><span className="font-medium">{fmtPct(Number(m.anfangstilgung))}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_rate")}</span><span className="font-medium">{fmt(selected.monatliche_rate ?? 0)}</span></div>
              {m.sondertilgung_jahr != null && m.sondertilgung_jahr !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_sonder")}</span><span className="font-medium">{fmt(Number(m.sondertilgung_jahr))}</span></div>}
              {m.zinsbindung_bis && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_bindung")}</span><span className="font-medium">{fmtDate(m.zinsbindung_bis)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.fin_ltv")}</span><span className="font-medium">{fmtPct(kz.ltv)}</span></div>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Home className="h-4 w-4 text-primary" />{t("portal.cards.eigene.rent_title")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.rent_kalt")}</span><span className="font-medium">{fmt(selected.mieteinnahmen_kalt ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.rent_warm")}</span><span className="font-medium">{fmt(selected.mieteinnahmen_warm ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.rent_hausgeld")}</span><span className="font-medium">{fmt(selected.hausgeld ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.rent_ruecklagen")}</span><span className="font-medium">{fmt(selected.ruecklagen ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.rent_eigenanteil")}</span><span className={`font-medium ${kz.eigenanteil > 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--success))]"}`}>{fmt(kz.eigenanteil)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.rent_netto")}</span><span className="font-medium">{fmtPct(kz.nettoRendite)}</span></div>
              {selected.verwalter && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.cards.eigene.rent_verwalter")}</span><span className="font-medium">{selected.verwalter}</span></div>}
            </div>
          </Card>
        </div>

        {selected.notizen && (
          <Card className="p-5">
            <h3 className="font-semibold mb-2">{t("portal.cards.eigene.notes_title")}</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.notizen}</p>
          </Card>
        )}

        {/* Dokumente */}
        <Card
          id="eigene-dokumente"
          className={`p-5 transition-all duration-500 ${highlightDocs ? "ring-2 ring-primary shadow-lg shadow-primary/20" : ""}`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />{t("portal.cards.eigene.docs_title", { count: docs.length })}</h3>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end mb-1 p-4 bg-muted/30 rounded-lg border border-border/40">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portal.cards.eigene.doc_type")}</Label>
              <Select value={uploadDokTyp} onValueChange={setUploadDokTyp}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOK_TYPEN.map(typ => <SelectItem key={typ} value={typ}>{dokTypLabel(typ)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portal.cards.eigene.doc_title")}</Label>
              <Input value={uploadTitel} onChange={(e) => setUploadTitel(e.target.value)} placeholder={t("portal.cards.eigene.doc_title_ph")} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portal.cards.eigene.doc_betrag", "Betrag (€, optional)")}</Label>
              <Input type="number" step="0.01" min="0" value={uploadBetrag} onChange={(e) => setUploadBetrag(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portal.cards.eigene.doc_beleg_datum", "Belegdatum (optional)")}</Label>
              <Input type="date" value={uploadBelegDatum} onChange={(e) => setUploadBelegDatum(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("portal.cards.eigene.doc_file")}</Label>
              <Input ref={fileRef} type="file" onChange={handleFileUpload} disabled={uploading} className="h-9 file:text-xs" />
            </div>
            {uploading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {t("portal.cards.eigene.doc_betrag_hint", "Belege vom Typ Reparatur/Erhaltung zählen mit Betrag und Belegdatum als Erhaltungsaufwand im Steuer-Cockpit. Belege ohne Betrag zählen nicht.")}
          </p>

          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("portal.cards.eigene.docs_empty")}</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:bg-muted/20 transition-colors">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{doc.titel || doc.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{dokTypLabel(doc.typ)} · {fmtDate(doc.datum)}{doc.betrag != null ? ` · ${fmt(Number(doc.betrag))}` : ""}{doc.titel && doc.titel !== doc.name ? ` · ${doc.name}` : ""}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" aria-label={t("portal.cards.eigene.doc_anzeigen")} className="h-8 w-8" onClick={() => openUnterlage(doc.url)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={t("portal.cards.eigene.doc_herunterladen")} className="h-8 w-8" onClick={() => openUnterlage(doc.url)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={t("portal.cards.eigene.delete")} className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteDoc(doc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <FormDialog open={showForm} onOpenChange={setShowForm} form={form} setForm={setForm} onSave={handleSave} saving={saving} editId={editId} pruefung={pruefung} warnungBestaetigt={warnungBestaetigt} onFieldChange={() => { if (warnungBestaetigt) setWarnungBestaetigt(false); }} />
      </div>
    );
  }

  /* ═══════ LIST VIEW ═══════ */
  return (
    <div className="space-y-6">
      {onZurUebersicht && (
        <button
          type="button"
          onClick={onZurUebersicht}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("portal.investments.back_to_overview")}
        </button>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("portal.cards.eigene.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("portal.cards.eigene.subtitle")}</p>
        </div>
        <Button variant="brand" onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />{t("portal.cards.eigene.add")}
        </Button>
      </div>

      <RentalOneHinweisCard />

      <SchillingGutachtenHinweisCard />

      {(() => {
        const last = investments
          .map(i => ({ d: i.kaufdatum || i.meta?.uebergabe, q: i.meta?.quelle }))
          .filter(x => x.d)
          .sort((a, b) => (a.d! < b.d! ? 1 : -1))[0];
        if (!last?.d) return null;
        const monate = Math.floor((Date.now() - new Date(last.d).getTime()) / (30.44 * 24 * 3600 * 1000));
        return monate >= 6 ? <ReinvestHinweisCard monateSeitKauf={monate} /> : null;
      })()}

      {investments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-background">
            <div className="text-xs text-muted-foreground mb-1">{t("portal.cards.eigene.portfolio_value")}</div>
            <div className="text-xl font-bold">{fmt(portfolioSummary.gesamtwert)}</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-background">
            <div className="text-xs text-muted-foreground mb-1">{t("portal.cards.eigene.monthly_rent")}</div>
            <div className="text-xl font-bold">{fmt(portfolioSummary.gesamtMiete)}</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-background">
            <div className="text-xs text-muted-foreground mb-1">{t("portal.cards.eigene.monthly_rate")}</div>
            <div className="text-xl font-bold">{fmt(portfolioSummary.gesamtRate)}</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-background">
            <div className="text-xs text-muted-foreground mb-1">{t("portal.cards.eigene.open_debt")}</div>
            <div className="text-xl font-bold">{fmt(portfolioSummary.offeneTilgung)}</div>
          </Card>
        </div>
      )}

      {loading ? (
        // Skeleton-Karten in Seitenstruktur statt zentriertem Spinner
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-2 bg-muted" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : investments.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t("portal.cards.eigene.empty_title")}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{t("portal.cards.eigene.empty_text")}</p>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />{t("portal.cards.eigene.add_first")}
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {investments.map((inv) => {
            const kz = calcKennzahlen(inv);
            const docs = (inv.dokumente || []) as DokumentEntry[];
            return (
              <Card
                key={inv.id}
                className="overflow-hidden hover:shadow-lg transition-all cursor-pointer border-border/60 hover:border-primary/30"
                onClick={() => setSelectedId(inv.id)}
              >
                <div className="h-2 bg-gradient-to-r from-primary to-accent" />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base truncate">{inv.bezeichnung}</h3>
                      {inv.ort && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />{inv.ort}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      <Badge variant="secondary" className="text-xs">{typLabel(inv.objekttyp)}</Badge>
                      {(() => { const qc = quelleConfig(inv.meta?.quelle); return qc.value !== "extern" && <Badge variant="outline" className={qc.color}>{qc.label}</Badge>; })()}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">{t("portal.cards.eigene.list_card_kaufpreis")}</div>
                      <div className="font-semibold">{fmt(inv.kaufpreis ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t("portal.cards.eigene.list_card_kaltmiete")}</div>
                      <div className="font-semibold">{fmt(inv.mieteinnahmen_kalt ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t("portal.cards.eigene.list_card_eigenanteil")}</div>
                      <div className={`font-semibold ${kz.eigenanteil > 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--success))]"}`}>
                        {fmt(kz.eigenanteil)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t("portal.cards.eigene.list_card_brutto")}</div>
                      <div className="font-semibold">{fmtPct(kz.bruttoRendite)}</div>
                    </div>
                  </div>
                  {docs.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />{t(`portal.cards.eigene.list_card_docs_${docs.length === 1 ? "one" : "other"}`, { count: docs.length })}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          <Card
            className="flex items-center justify-center min-h-[200px] border-dashed border-2 border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer"
            onClick={openNew}
          >
            <div className="text-center">
              <Plus className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <span className="text-sm text-muted-foreground">{t("portal.cards.eigene.add")}</span>
            </div>
          </Card>
        </div>
      )}

      <FormDialog open={showForm} onOpenChange={setShowForm} form={form} setForm={setForm} onSave={handleSave} saving={saving} editId={editId} pruefung={pruefung} warnungBestaetigt={warnungBestaetigt} onFieldChange={() => { if (warnungBestaetigt) setWarnungBestaetigt(false); }} />
    </div>
  );
};

/* ═══════ FORM DIALOG ═══════ */

/*
 * Beschriftungen mindestens 14px, Hilfetexte mindestens 12px. Die Wurzel-
 * schrift steht projektweit bei 90 Prozent, `text-sm` ergab im Dialog darum
 * nur gut 12,5px und die Hilfetexte mit 10px waren kaum lesbar.
 */
const FORM_LABEL = "text-[14px] leading-snug";
const FormDialog = ({
  open, onOpenChange, form, setForm, onSave, saving, editId,
  pruefung, warnungBestaetigt, onFieldChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  onSave: () => void;
  saving: boolean;
  editId: string | null;
  pruefung: PruefErgebnis | null;
  warnungBestaetigt: boolean;
  onFieldChange: () => void;
}) => {
  const { t } = useTranslation();
  // Die Meldungen stehen am Ende des langen Formulars. Nach dem Klick auf
  // „Anlegen“ werden sie ins Bild geholt, sonst sieht man nur, dass nichts
  // passiert.
  const meldungRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pruefung && (pruefung.fehler.length > 0 || pruefung.warnungen.length > 0)) {
      meldungRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [pruefung]);
  const upd = (key: string, val: string) => {
    onFieldChange();
    setForm(f => ({ ...f, [key]: val }));
  };
  // Rote bzw. gelbe Feldmarkierung aus der Validierung.
  const fk = (key: string) =>
    pruefung?.felder[key] === "fehler"
      ? "border-destructive focus-visible:ring-destructive"
      : pruefung?.felder[key] === "warnung"
        ? "border-[hsl(var(--warning))]"
        : "";
  // AfA-Vorschlag nach Baujahr (§ 7 Abs. 4 EStG), nie automatisch uebernommen.
  const baujahrZahl = parseInt(form.baujahr);
  const afaVorschlag = Number.isFinite(baujahrZahl) && baujahrZahl > 0 ? linearerAfaSatz(baujahrZahl) : null;
  const zahlFormat = (v: number) => v.toLocaleString(portalLocale());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Rechteckig statt laenglich: Der Dialog ist breit und stellt die
          Formularbloecke in zwei Spalten NEBENEINANDER (links Objekt und
          Finanzierung, rechts Kauf, Meilensteine und Mieten). Dadurch
          halbiert sich die Hoehe und es muss kaum gescrollt werden. */}
      <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? t("portal.cards.eigene.form_edit_title") : t("portal.cards.eigene.form_new_title")}</DialogTitle>
          <DialogDescription>{editId ? t("portal.cards.eigene.form_edit_desc") : t("portal.cards.eigene.form_new_desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid lg:grid-cols-2 gap-x-10 gap-y-6 pt-2">
          {/* Linke Spalte: Objekt + Finanzierung */}
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />{t("portal.cards.eigene.form_objekt")}</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_bezeichnung")}</Label>
                  <Input value={form.bezeichnung} onChange={e => upd("bezeichnung", e.target.value)} placeholder={t("portal.cards.eigene.form_bezeichnung_ph")} maxLength={200} className={fk("bezeichnung")} aria-invalid={pruefung?.felder.bezeichnung === "fehler"} aria-required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_adresse")}</Label>
                  <Input value={form.adresse} onChange={e => upd("adresse", e.target.value)} placeholder={t("portal.cards.eigene.form_adresse_ph")} />
                </div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_plz")}</Label><Input value={form.plz} onChange={e => upd("plz", e.target.value)} maxLength={10} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_ort")}</Label><Input value={form.ort} onChange={e => upd("ort", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_typ")}</Label>
                  <Select value={form.objekttyp} onValueChange={v => upd("objekttyp", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OBJEKT_TYPEN.map(o => <SelectItem key={o.value} value={o.value}>{t(`portal.cards.eigene.${o.labelKey}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_baujahr")}</Label><Input type="number" value={form.baujahr} onChange={e => upd("baujahr", e.target.value)} className={fk("baujahr")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_wohnflaeche")}</Label><Input type="number" step="0.01" value={form.wohnflaeche} onChange={e => upd("wohnflaeche", e.target.value)} className={fk("wohnflaeche")} /></div>
                <div className="space-y-1.5">
                  <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_quelle")}</Label>
                  <Select value={form.quelle} onValueChange={v => upd("quelle", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUELLEN.map(q => <SelectItem key={q.value} value={q.value}>{t(`portal.cards.eigene.${q.labelKey}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />{t("portal.cards.eigene.form_fin")}</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_darlehen")}</Label><Input type="number" step="0.01" value={form.darlehenssumme} onChange={e => upd("darlehenssumme", e.target.value)} className={fk("darlehenssumme")} /></div>
                <div className="space-y-1.5">
                  <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_offen")}</Label>
                  <Input type="number" step="0.01" value={form.offene_tilgung} onChange={e => upd("offene_tilgung", e.target.value)} className={fk("offene_tilgung")} />
                  <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_offen_hint", "Leer lassen, dann rechnen wir sie aus Darlehen, Zins, Tilgung und Kaufdatum.")}</p>
                </div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_zins")}</Label><Input type="number" step="0.01" value={form.zinssatz} onChange={e => upd("zinssatz", e.target.value)} className={fk("zinssatz")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_anf_tilgung")}</Label><Input type="number" step="0.01" value={form.anfangstilgung} onChange={e => upd("anfangstilgung", e.target.value)} className={fk("anfangstilgung")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_rate")}</Label><Input type="number" step="0.01" value={form.monatliche_rate} onChange={e => upd("monatliche_rate", e.target.value)} className={fk("monatliche_rate")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_sonder")}</Label><Input type="number" step="0.01" value={form.sondertilgung_jahr} onChange={e => upd("sondertilgung_jahr", e.target.value)} className={fk("sondertilgung_jahr")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_bindung")}</Label><Input type="date" value={form.zinsbindung_bis} onChange={e => upd("zinsbindung_bis", e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* Rechte Spalte: Kauf + Meilensteine + Mieten */}
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Euro className="h-4 w-4 text-primary" />{t("portal.cards.eigene.form_kauf")}</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_kaufpreis")}</Label><Input type="number" step="0.01" value={form.kaufpreis} onChange={e => upd("kaufpreis", e.target.value)} className={fk("kaufpreis")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_kaufdatum")}</Label><Input type="date" value={form.kaufdatum} onChange={e => upd("kaufdatum", e.target.value)} className={fk("kaufdatum")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_nebenkosten")}</Label><Input type="number" step="0.01" value={form.nebenkosten} onChange={e => upd("nebenkosten", e.target.value)} className={fk("nebenkosten")} /></div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Milestone className="h-4 w-4 text-primary" />{t("portal.cards.eigene.form_meilensteine")}</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_ms_notar")}</Label><Input type="date" value={form.notartermin} onChange={e => upd("notartermin", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_ms_faelligkeit")}</Label><Input type="date" value={form.kaufpreis_faelligkeit} onChange={e => upd("kaufpreis_faelligkeit", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_ms_grundschuld")}</Label><Input type="date" value={form.grundschuld_eingetragen} onChange={e => upd("grundschuld_eingetragen", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_ms_uebergabe")}</Label><Input type="date" value={form.uebergabe} onChange={e => upd("uebergabe", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_ms_erste_miete")}</Label><Input type="date" value={form.erste_miete} onChange={e => upd("erste_miete", e.target.value)} /></div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Home className="h-4 w-4 text-primary" />{t("portal.cards.eigene.form_mieten")}</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_kalt")}</Label><Input type="number" step="0.01" value={form.mieteinnahmen_kalt} onChange={e => upd("mieteinnahmen_kalt", e.target.value)} className={fk("mieteinnahmen_kalt")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_warm")}</Label><Input type="number" step="0.01" value={form.mieteinnahmen_warm} onChange={e => upd("mieteinnahmen_warm", e.target.value)} className={fk("mieteinnahmen_warm")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_hausgeld")}</Label><Input type="number" step="0.01" value={form.hausgeld} onChange={e => upd("hausgeld", e.target.value)} className={fk("hausgeld")} /></div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_ruecklagen")}</Label><Input type="number" step="0.01" value={form.ruecklagen} onChange={e => upd("ruecklagen", e.target.value)} className={fk("ruecklagen")} /></div>
                <div className="space-y-1.5">
                  <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_eigenanteil")}</Label>
                  <Input type="number" step="0.01" value={form.eigenanteil_manuell} onChange={e => upd("eigenanteil_manuell", e.target.value)} placeholder={t("portal.cards.eigene.form_eigenanteil_kurz", "automatisch")} className={fk("eigenanteil_manuell")} />
                  <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_eigenanteil_ph")}</p>
                </div>
                <div className="space-y-1.5"><Label className={FORM_LABEL}>{t("portal.cards.eigene.form_verwalter")}</Label><Input value={form.verwalter} onChange={e => upd("verwalter", e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* Volle Breite: Steuerangaben fuer die Anlage V */}
          <div className="lg:col-span-2">
            <Separator className="mb-5" />
            <h4 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" />{t("portal.cards.eigene.form_steuer", "Steuerangaben (für die Anlage V)")}</h4>
            <p className="text-[12px] text-muted-foreground mb-3">{t("portal.cards.eigene.form_steuer_hint", "Alle Angaben sind freiwillig. Ohne Angabe bleibt der jeweilige Posten im Steuer-Cockpit auf „Angabe fehlt“, geschätzt wird nichts.")}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-4">
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_gebaeude_anteil", "Gebäudeanteil (%)")}</Label>
                <Input type="number" step="0.01" value={form.gebaeude_anteil_prozent} onChange={e => upd("gebaeude_anteil_prozent", e.target.value)} className={fk("gebaeude_anteil_prozent")} />
                <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_gebaeude_anteil_hint", "Anteil des Gebäudes an den Anschaffungskosten laut Kaufpreisaufteilung, z. B. nach der BMF-Arbeitshilfe.")}</p>
              </div>
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_afa_satz", "AfA-Satz (%)")}</Label>
                <Input type="number" step="0.1" value={form.afa_satz_prozent} onChange={e => upd("afa_satz_prozent", e.target.value)} className={fk("afa_satz_prozent")} />
                {afaVorschlag ? (
                  <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 w-full whitespace-normal text-left text-[12px] leading-snug px-2 py-1.5"
                    onClick={() => upd("afa_satz_prozent", String(afaVorschlag.satz))}>
                    {t("portal.cards.eigene.form_afa_vorschlag", "Vorschlag übernehmen: {{satz}} % nach {{paragraf}}", { satz: zahlFormat(afaVorschlag.satz), paragraf: afaVorschlag.paragraf })}
                  </Button>
                ) : (
                  <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_afa_vorschlag_ohne_baujahr", "Ein Vorschlag nach § 7 Abs. 4 EStG ist erst mit eingetragenem Baujahr möglich.")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_grundsteuer", "Grundsteuer p. a. (€)")}</Label>
                <Input type="number" step="0.01" value={form.grundsteuer_jahr} onChange={e => upd("grundsteuer_jahr", e.target.value)} className={fk("grundsteuer_jahr")} />
              </div>
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_versicherung", "Versicherung p. a. (€)")}</Label>
                <Input type="number" step="0.01" value={form.versicherung_jahr} onChange={e => upd("versicherung_jahr", e.target.value)} className={fk("versicherung_jahr")} />
                <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_versicherung_hint", "Gebäude- und Haftpflichtversicherung pro Jahr.")}</p>
              </div>
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_verwaltungskosten", "Verwaltungskosten p. a. (€)")}</Label>
                <Input type="number" step="0.01" value={form.verwaltungskosten_jahr} onChange={e => upd("verwaltungskosten_jahr", e.target.value)} className={fk("verwaltungskosten_jahr")} />
                <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_verwaltungskosten_hint", "Verwaltervergütung, Kontoführung und Ähnliches.")}</p>
              </div>
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_hausgeld_nicht_umlage", "Hausgeld nicht umlagefähig (€/Monat)")}</Label>
                <Input type="number" step="0.01" value={form.hausgeld_nicht_umlage_monat} onChange={e => upd("hausgeld_nicht_umlage_monat", e.target.value)} className={fk("hausgeld_nicht_umlage_monat")} />
                <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_hausgeld_nicht_umlage_hint", "Ohne Rücklagenzuführung, die ist steuerlich nicht abziehbar.")}</p>
              </div>
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_umlagen", "Vereinnahmte Umlagen (€/Monat)")}</Label>
                <Input type="number" step="0.01" value={form.umlagen_monat} onChange={e => upd("umlagen_monat", e.target.value)} className={fk("umlagen_monat")} />
                <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_umlagen_hint", "Nebenkosten-Vorauszahlungen des Mieters, steuerlich Einnahmen.")}</p>
              </div>
              <div className="space-y-1.5">
                <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_miteigentum", "Miteigentumsanteil (%)")}</Label>
                <Input type="number" step="0.01" value={form.miteigentumsanteil_prozent} onChange={e => upd("miteigentumsanteil_prozent", e.target.value)} placeholder="100" className={fk("miteigentumsanteil_prozent")} />
                <p className="text-[12px] text-muted-foreground leading-snug">{t("portal.cards.eigene.form_miteigentum_hint", "Ohne Angabe wird mit 100 % gerechnet.")}</p>
              </div>
            </div>
          </div>

          {/* Volle Breite: Notizen und Aktionen */}
          <div className="lg:col-span-2 space-y-1.5">
            <Label className={FORM_LABEL}>{t("portal.cards.eigene.form_notizen")}</Label>
            <Textarea value={form.notizen} onChange={e => upd("notizen", e.target.value)} rows={2} maxLength={2000} />
          </div>

          {pruefung && (pruefung.fehler.length > 0 || pruefung.warnungen.length > 0) && (
            <div ref={meldungRef} role="alert" className="lg:col-span-2 space-y-2">
              {pruefung.fehler.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="font-semibold text-destructive mb-1">{t("portal.cards.eigene.form_fehler_titel", "Bitte korrigieren:")}</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-destructive">
                    {pruefung.fehler.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              {pruefung.fehler.length === 0 && pruefung.warnungen.length > 0 && (
                <div className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 p-3 text-sm">
                  <p className="font-semibold mb-1">{t("portal.cards.eigene.form_warnungen_titel", "Bitte prüfen:")}</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {pruefung.warnungen.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">{t("portal.cards.eigene.form_warnungen_hinweis", "Mit „Trotzdem speichern“ übernimmst du die Angaben unverändert.")}</p>
                </div>
              )}
            </div>
          )}

          <div className="lg:col-span-2 flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("portal.cards.eigene.cancel")}</Button>
            <Button variant="brand" onClick={onSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {warnungBestaetigt
                ? t("portal.cards.eigene.form_trotzdem", "Trotzdem speichern")
                : editId ? t("portal.cards.eigene.save") : t("portal.cards.eigene.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EigeneInvestmentsTab;
