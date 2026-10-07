import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Image, Link as LinkIcon, Pin, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { YoutubeNachKlick } from "@/components/news/YoutubeNachKlick";
import { NotizZielrollen } from "@/components/news/NotizZielrollen";
import { useUser } from "@/contexts/UserContext";
import { ROLES } from "@/types/user";
import { toast } from "sonner";
import {
  getNews, addNews, updateNews, deleteNews, markNewsAsRead, getReadNewsIds,
  canEditNews, isNewsVisibleForRole, type NewsArticle,
} from "@/lib/newsStore";
import {
  geladeneVersionsnotiz, ladeVersionsnotiz, istNotizSichtbar, notizLeseId, notizFreigabeStand, mitUeberarbeitung,
  type VersionsnotizEintrag, type VersionsnotizArt, type NotizFreigabe, type NotizFreigabeStand,
  type NotizUeberarbeitung,
} from "@/lib/versionsnotiz";
import {
  hatNeuImCrm, neuImCrmBetrachter, leseNotizFreigaben, setzeNotizFreigabe,
  leseNotizUeberarbeitungen, setzeNotizUeberarbeitung,
} from "@/lib/neuImCrmZugang";
import { notifyAllInternal } from "@/lib/bellNotifications";
import { onCacheChange } from "@/lib/dataCache";

const KATEGORIEN = ["Update", "Event", "Info", "Provision"] as const;
const KAT_COLORS: Record<string, string> = {
  Update: "bg-primary text-primary-foreground",
  Event: "bg-success text-white",
  Info: "bg-accent text-accent-foreground",
  Provision: "bg-primary text-primary-foreground",
};

const EMOJI_OPTIONS = ["📢", "🚀", "🎉", "🏆", "💼", "📊", "🔥", "⚡", "💡", "📌", "🎯", "✨"];

// Roles that can be targeted with news
const TARGETABLE_ROLES = ROLES.filter(r => !["bewerber", "kunde"].includes(r.id));

function renderMarkdown(text: string) {
  return text.split("**").map((part, j) =>
    j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
  );
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

const ART_PILLE: Record<VersionsnotizArt, { text: string; klasse: string }> = {
  neu: { text: "Neu", klasse: "bg-success text-white" },
  geaendert: { text: "Geändert", klasse: "bg-primary text-primary-foreground" },
  behoben: { text: "Behoben", klasse: "bg-amber-400 text-amber-950" },
};

const FREIGABE_TEXT: Record<NotizFreigabeStand, string> = {
  offen: "Wartet auf Freigabe",
  abgelehnt: "Abgelehnt, nur für dich sichtbar",
  frei: "Freigegeben",
};

/**
 * Die Freigabezeile oben in der Karte, nur für Christian. Jede Entscheidung
 * lässt sich umkehren, deshalb ohne Rückfrage.
 */
function FreigabeZeile({ stand, entscheide, bearbeiten, ueberarbeitet }: {
  stand: NotizFreigabeStand;
  entscheide: (neu: NotizFreigabe) => void;
  bearbeiten: () => void;
  /** Der angezeigte Text weicht von der Datei ab. */
  ueberarbeitet: boolean;
}) {
  const hervor = stand !== "frei";
  return (
    <div
      data-pruefung="notiz-freigabe"
      className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${hervor ? "border border-warning/40 bg-warning/15" : "bg-muted/50"}`}
    >
      <span className={`flex-1 ${hervor ? "font-semibold" : "text-muted-foreground"}`}>
        {FREIGABE_TEXT[stand]}{ueberarbeitet ? ", Text von dir bearbeitet" : ""}
      </span>
      <Button size="sm" variant="outline" onClick={bearbeiten}>
        <Pencil className="h-3.5 w-3.5 mr-1" /> Bearbeiten
      </Button>
      {stand !== "frei" && (
        <Button size="sm" variant="brand" onClick={() => entscheide("frei")}>Freigeben</Button>
      )}
      {stand !== "abgelehnt" && (
        <Button size="sm" variant="outline" onClick={() => entscheide("abgelehnt")}>Ablehnen</Button>
      )}
    </div>
  );
}

/** Eine Karte aus „Neu im CRM“, also aus `public/versionsnotiz.json`. */
function NotizKarte({ e, ungelesen, aktiveRolle, freigabe }: {
  e: VersionsnotizEintrag;
  ungelesen: boolean;
  aktiveRolle: string;
  /** Nur für Christian gesetzt. */
  freigabe?: { stand: NotizFreigabeStand; entscheide: (neu: NotizFreigabe) => void; bearbeiten: () => void; ueberarbeitet: boolean };
}) {
  const pille = ART_PILLE[e.art];
  return (
    <Card className="p-6" data-pruefung="neu-im-crm">
      {freigabe && <FreigabeZeile {...freigabe} />}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          {e.angepinnt && <Pin className="h-3.5 w-3.5 text-primary" />}
          {ungelesen && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" aria-label="Ungelesen" />}
          <h2 className="text-lg font-bold">{e.titel}</h2>
        </div>
        <Badge className={`${pille.klasse} text-xs flex-shrink-0`}>{pille.text}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {new Date(e.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · Neu im CRM
        <NotizZielrollen zielrollen={e.zielrollen} aktiveRolle={aktiveRolle} />
      </p>
      <p className="text-sm text-foreground leading-relaxed">{e.kurztext}</p>
      {e.wasHeisstDasFuerDich && e.wasHeisstDasFuerDich.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Was heißt das für dich</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {e.wasHeisstDasFuerDich.map((punkt, i) => <li key={i}>{punkt}</li>)}
          </ul>
        </div>
      )}
      {e.soFindestDuEs && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted-foreground mb-1">So findest du es</p>
          <p className="text-sm">{e.soFindestDuEs}</p>
        </div>
      )}
    </Card>
  );
}

/**
 * Text eines „Neu im CRM“-Eintrags vor der Freigabe ändern, nur für Christian.
 * Gespeichert wird in `app_config` (siehe `setzeNotizUeberarbeitung`), die
 * Datei unter `public` bleibt unverändert. „Original wiederherstellen“ wirft
 * die Überarbeitung wieder weg.
 */
function NotizBearbeitenDialog({ eintrag, original, ueberarbeitet, onClose, onSave }: {
  /** Der angezeigte Stand, also schon mit einer früheren Überarbeitung. */
  eintrag: VersionsnotizEintrag;
  original: VersionsnotizEintrag;
  ueberarbeitet: boolean;
  onClose: () => void;
  onSave: (text: NotizUeberarbeitung | null) => Promise<void>;
}) {
  const [titel, setTitel] = useState(eintrag.titel);
  const [kurztext, setKurztext] = useState(eintrag.kurztext);
  // Ein Punkt je Zeile, leere Zeilen fallen beim Speichern weg.
  const [punkte, setPunkte] = useState((eintrag.wasHeisstDasFuerDich ?? []).join("\n"));
  const [soFindest, setSoFindest] = useState(eintrag.soFindestDuEs ?? "");
  const [speichert, setSpeichert] = useState(false);

  const speichern = async (text: NotizUeberarbeitung | null) => {
    setSpeichert(true);
    try { await onSave(text); } finally { setSpeichert(false); }
  };

  const neuerText: NotizUeberarbeitung = {
    titel: titel.trim(),
    kurztext: kurztext.trim(),
    wasHeisstDasFuerDich: punkte.split("\n").map(p => p.trim()).filter(Boolean),
    soFindestDuEs: soFindest.trim(),
  };
  const gleichWieOriginal =
    neuerText.titel === original.titel &&
    neuerText.kurztext === original.kurztext &&
    (neuerText.soFindestDuEs ?? "") === (original.soFindestDuEs ?? "") &&
    JSON.stringify(neuerText.wasHeisstDasFuerDich) === JSON.stringify(original.wasHeisstDasFuerDich ?? []);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eintrag bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="notiz-titel">Titel</label>
            <Input id="notiz-titel" value={titel} onChange={(e) => setTitel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="notiz-kurztext">Kurztext</label>
            <Textarea id="notiz-kurztext" rows={3} value={kurztext} onChange={(e) => setKurztext(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="notiz-punkte">Was heißt das für dich</label>
            <Textarea id="notiz-punkte" rows={6} value={punkte} onChange={(e) => setPunkte(e.target.value)} />
            <p className="text-xs text-muted-foreground">Ein Punkt je Zeile.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="notiz-so-findest">So findest du es</label>
            <Input id="notiz-so-findest" value={soFindest} onChange={(e) => setSoFindest(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {ueberarbeitet ? (
            <Button variant="ghost" size="sm" disabled={speichert} onClick={() => void speichern(null)}>
              Original wiederherstellen
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={speichert} onClick={onClose}>Verwerfen</Button>
            <Button
              size="sm"
              disabled={speichert || !neuerText.titel}
              onClick={() => void speichern(gleichWieOriginal ? null : neuerText)}
            >
              Text speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type NewsFilter = "alle" | "crm" | "unternehmen";

interface NewsFormData {
  emoji: string;
  titel: string;
  kategorie: "Update" | "Event" | "Info" | "Provision";
  inhalt: string;
  bild: string;
  links: { bezeichnung: string; url: string }[];
  angepinnt: boolean;
  zielrollen: string[];
}

const emptyForm: NewsFormData = {
  emoji: "📢",
  titel: "",
  kategorie: "Update",
  inhalt: "",
  bild: "",
  links: [],
  angepinnt: false,
  zielrollen: [],
};

function NewsDialog({
  open,
  onOpenChange,
  editArticle,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editArticle?: NewsArticle;
  onSave: (data: NewsFormData) => void;
}) {
  const [form, setForm] = useState<NewsFormData>(emptyForm);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [newLink, setNewLink] = useState({ bezeichnung: "", url: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editArticle) {
      setForm({
        emoji: editArticle.emoji,
        titel: editArticle.titel,
        kategorie: editArticle.kategorie,
        inhalt: editArticle.inhalt,
        bild: editArticle.bild || "",
        links: editArticle.links || [],
        angepinnt: editArticle.angepinnt,
        zielrollen: editArticle.zielrollen || [],
      });
    } else {
      setForm(emptyForm);
    }
  }, [editArticle, open]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, bild: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const addLink = () => {
    if (!newLink.url) return;
    setForm(prev => ({ ...prev, links: [...prev.links, { ...newLink }] }));
    setNewLink({ bezeichnung: "", url: "" });
  };

  const removeLink = (idx: number) => {
    setForm(prev => ({ ...prev, links: prev.links.filter((_, i) => i !== idx) }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editArticle ? "News bearbeiten" : "Neue News erstellen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Emoji + Titel */}
          <div className="flex items-start gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Emoji</label>
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-lg h-10 w-12"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  {form.emoji}
                </Button>
                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-50 bg-card border rounded-lg p-2.5 grid grid-cols-6 gap-1.5 shadow-lg min-w-[220px]">
                    {EMOJI_OPTIONS.map(e => (
                      <button
                        key={e}
                        type="button"
                        className="text-xl hover:bg-muted rounded-md w-8 h-8 flex items-center justify-center leading-none"
                        onClick={() => { setForm(prev => ({ ...prev, emoji: e })); setShowEmojiPicker(false); }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Titel *</label>
              <Input
                placeholder="News-Titel..."
                value={form.titel}
                onChange={(e) => setForm(prev => ({ ...prev, titel: e.target.value }))}
              />
            </div>
          </div>

          {/* Kategorie + Anpinnen */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Kategorie</label>
              <div className="flex gap-2">
                {KATEGORIEN.map(k => (
                  <Button
                    key={k}
                    size="sm"
                    variant={form.kategorie === k ? "default" : "outline"}
                    className="text-xs h-7"
                    onClick={() => setForm(prev => ({ ...prev, kategorie: k }))}
                  >
                    {k}
                  </Button>
                ))}
              </div>
            </div>
            <button
              className={`flex items-center gap-1 text-xs ${form.angepinnt ? "text-primary font-semibold" : "text-muted-foreground"}`}
              onClick={() => setForm(prev => ({ ...prev, angepinnt: !prev.angepinnt }))}
            >
              <Pin className={`h-3.5 w-3.5 ${form.angepinnt ? "text-primary" : ""}`} />
              Anpinnen
            </button>
          </div>

          {/* Inhalt */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Inhalt * (Markdown **fett**, Links im Text möglich)</label>
            <Textarea
              placeholder={"News-Inhalt hier eingeben...\n\nNutze **fett** für Hervorhebungen.\nYouTube-Links werden automatisch eingebettet."}
              value={form.inhalt}
              onChange={(e) => setForm(prev => ({ ...prev, inhalt: e.target.value }))}
              className="min-h-[160px]"
            />
          </div>

          {/* Bild */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Bild (optional, 16:9 empfohlen)</label>
            {form.bild ? (
              <div className="relative">
                <img src={form.bild} alt="Preview" className="w-full rounded-lg border object-cover max-h-40" />
                <Button variant="ghost" size="icon" aria-label="Bild entfernen" className="absolute top-1 right-1 h-6 w-6 bg-background/80" onClick={() => setForm(prev => ({ ...prev, bild: "" }))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => fileInputRef.current?.click()}>
                <Image className="h-3.5 w-3.5 mr-1" /> Bild hochladen
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          {/* Links */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Links & YouTube-Videos</label>
            {form.links.map((link, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2">
                <LinkIcon className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{link.bezeichnung || "Link"}</span>
                <span className="text-muted-foreground truncate flex-1">{link.url}</span>
                <Button variant="ghost" size="icon" aria-label="Link entfernen" className="h-5 w-5" onClick={() => removeLink(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Bezeichnung (optional)"
                value={newLink.bezeichnung}
                onChange={(e) => setNewLink(prev => ({ ...prev, bezeichnung: e.target.value }))}
                className="h-8 text-xs"
              />
              <Input
                placeholder="https://... oder YouTube-Link"
                value={newLink.url}
                onChange={(e) => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                className="h-8 text-xs flex-1"
              />
              <Button variant="outline" size="icon" aria-label="Hinzufügen" className="h-8 w-8 flex-shrink-0" onClick={addLink} disabled={!newLink.url}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Zielrollen */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Sichtbar für (leer = alle Rollen)</label>
            <div className="grid grid-cols-3 gap-2">
              {TARGETABLE_ROLES.map(role => {
                const checked = form.zielrollen.includes(role.id);
                return (
                  <label key={role.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 transition-colors">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setForm(prev => ({
                          ...prev,
                          zielrollen: v
                            ? [...prev.zielrollen, role.id]
                            : prev.zielrollen.filter(r => r !== role.id),
                        }));
                      }}
                    />
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
                    <span>{role.label}</span>
                  </label>
                );
              })}
            </div>
            {form.zielrollen.length > 0 && (
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground">
                  {form.zielrollen.length} Rolle(n) ausgewählt
                </p>
                <button className="text-[10px] text-primary hover:underline" onClick={() => setForm(prev => ({ ...prev, zielrollen: [] }))}>
                  Alle abwählen
                </button>
                <button className="text-[10px] text-primary hover:underline" onClick={() => setForm(prev => ({ ...prev, zielrollen: TARGETABLE_ROLES.map(r => r.id) }))}>
                  Alle auswählen
                </button>
              </div>
            )}
            {form.zielrollen.length === 0 && (
              <p className="text-[10px] text-muted-foreground">News wird für alle Nutzerrollen angezeigt</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button size="sm" onClick={() => onSave(form)} disabled={!form.titel || !form.inhalt}>
            {editArticle ? "Aktualisieren" : "Veröffentlichen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const News = () => {
  const { user, authUser } = useUser();
  const canEdit = canEditNews(user.role);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | undefined>();
  // „Neu im CRM“, seit 26.09.2026 für alle, siehe lib/neuImCrmZugang.ts. Ist
  // der Schalter aus, bleibt die Seite wie vorher: nur die Meldungen aus der
  // Datenbank, kein Filter.
  const neuImCrm = hatNeuImCrm(authUser?.id, authUser?.email);
  const [filter, setFilter] = useState<NewsFilter>("alle");
  const [notiz, setNotiz] = useState<VersionsnotizEintrag[]>(geladeneVersionsnotiz);
  // Freigabestand aus app_config; aendert er sich (auch durch Christian in
  // einem anderen Tab), meldet das onCacheChange weiter unten.
  const [freigaben, setFreigaben] = useState(leseNotizFreigaben);
  const [ueberarbeitungen, setUeberarbeitungen] = useState(leseNotizUeberarbeitungen);
  const [bearbeiteNr, setBearbeiteNr] = useState<number | null>(null);
  const betrachter = neuImCrmBetrachter(user.role, authUser?.id, authUser?.email, freigaben);
  // Was beim Anzeigen noch ungelesen war. Der Punkt soll stehen bleiben,
  // solange die Seite offen ist, obwohl der Eintrag sofort als gelesen gilt.
  const [ungelesenBeimOeffnen, setUngelesenBeimOeffnen] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!neuImCrm) return;
    // Frisch vom Server, damit auch ein alter Programmstand die neuesten
    // Eintraege zeigt.
    let abgebrochen = false;
    void ladeVersionsnotiz().then((eintraege) => {
      if (!abgebrochen && eintraege) setNotiz(eintraege);
    });
    return () => { abgebrochen = true; };
  }, [neuImCrm]);

  useEffect(() => {
    const load = () => setArticles(getNews());
    load();
    window.addEventListener("news-updated", load);
    // Die Tabelle "news" laedt erst in der zweiten Welle in den
    // Zwischenspeicher. Wer die Seite vorher oeffnet, sah sonst eine leere
    // Liste, bis er neu lud, und es wurde nichts als gelesen gemerkt.
    const unsubCache = onCacheChange((table) => {
      if (table === "news") load();
      if (table === "app_config") {
        setFreigaben(leseNotizFreigaben());
        setUeberarbeitungen(leseNotizUeberarbeitungen());
      }
    });
    return () => {
      window.removeEventListener("news-updated", load);
      unsubCache();
    };
  }, []);

  const sorted = [...articles]
    .filter(a => canEdit || isNewsVisibleForRole(a, user.role))
    .sort((a, b) => {
      if (a.angepinnt && !b.angepinnt) return -1;
      if (!a.angepinnt && b.angepinnt) return 1;
      return new Date(b.erstelltAm).getTime() - new Date(a.erstelltAm).getTime();
    });

  // Gelesen heisst: die Seite war offen und hat die Meldung gezeigt. Deshalb
  // wird genau das gemerkt, was hier auch angezeigt wird, und nicht jede
  // Meldung in der Datenbank. Sonst gaelte eine Meldung, die nur eine andere
  // Rolle sieht, nach einem Rollenwechsel faelschlich als gelesen.
  // Als Abhaengigkeit dient nur die Kennungsliste, damit das Ereignis
  // "news-updated" keine Endlosschleife mit setArticles ausloest.
  const sichtbareNotiz = neuImCrm && filter !== "unternehmen"
    ? notiz.filter(e => istNotizSichtbar(e, betrachter)).map(e => mitUeberarbeitung(e, ueberarbeitungen))
    : [];
  const sichtbareNews = !neuImCrm || filter !== "crm" ? sorted : [];
  const karten: ({ art: "news"; n: NewsArticle; datum: string; angepinnt: boolean } | { art: "notiz"; e: VersionsnotizEintrag; datum: string; angepinnt: boolean })[] = [
    ...sichtbareNews.map(n => ({ art: "news" as const, n, datum: n.erstelltAm, angepinnt: n.angepinnt })),
    ...sichtbareNotiz.map(e => ({ art: "notiz" as const, e, datum: e.datum, angepinnt: !!e.angepinnt })),
  ].sort((a, b) => {
    if (a.angepinnt !== b.angepinnt) return a.angepinnt ? -1 : 1;
    const zeit = new Date(b.datum).getTime() - new Date(a.datum).getTime();
    // Am selben Tag kommt der juengere Notizeintrag zuerst.
    if (zeit === 0 && a.art === "notiz" && b.art === "notiz") return b.e.nr - a.e.nr;
    return zeit;
  });

  const sichtbareIdsKey = [
    ...sichtbareNews.map(a => a.id),
    ...sichtbareNotiz.map(e => notizLeseId(e.nr)),
  ].join(",");
  useEffect(() => {
    if (!sichtbareIdsKey) return;
    const ids = sichtbareIdsKey.split(",");
    const gelesen = new Set(getReadNewsIds());
    const neu = ids.filter(id => id.startsWith("neu-im-crm-") && !gelesen.has(id));
    if (neu.length > 0) setUngelesenBeimOeffnen(alt => new Set([...alt, ...neu]));
    markNewsAsRead(ids);
  }, [sichtbareIdsKey]);

  const entscheideNotiz = async (nr: number, stand: NotizFreigabe) => {
    // Bei einem Fehlschlag meldet setAppConfig selbst, warum.
    if (!(await setzeNotizFreigabe(nr, stand))) return;
    setFreigaben(leseNotizFreigaben());
    toast.success(stand === "frei" ? "Eintrag freigegeben" : "Eintrag abgelehnt, nur noch für dich sichtbar");
  };

  const speichereNotizText = async (nr: number, text: NotizUeberarbeitung | null) => {
    // Bei einem Fehlschlag meldet setAppConfig selbst, warum; der Dialog bleibt offen.
    if (!(await setzeNotizUeberarbeitung(nr, text))) return;
    setUeberarbeitungen(leseNotizUeberarbeitungen());
    setBearbeiteNr(null);
    toast.success(text ? "Text gespeichert" : "Originaltext wiederhergestellt");
  };
  const bearbeiteOriginal = bearbeiteNr === null ? undefined : notiz.find(e => e.nr === bearbeiteNr);

  const handleSave = (data: NewsFormData) => {
    if (editingArticle) {
      updateNews(editingArticle.id, {
        emoji: data.emoji,
        titel: data.titel,
        kategorie: data.kategorie,
        inhalt: data.inhalt,
        bild: data.bild || undefined,
        links: data.links,
        angepinnt: data.angepinnt,
        zielrollen: data.zielrollen.length > 0 ? data.zielrollen : undefined,
      });
      toast.success("News aktualisiert");
    } else {
      addNews({
        emoji: data.emoji,
        titel: data.titel,
        kategorie: data.kategorie,
        inhalt: data.inhalt,
        bild: data.bild || undefined,
        links: data.links,
        angepinnt: data.angepinnt,
        erstelltVon: user.name,
        autorId: authUser?.id,
        zielrollen: data.zielrollen.length > 0 ? data.zielrollen : undefined,
      });
      // Alle internen Nutzer benachrichtigen
      notifyAllInternal({
        titel: "Neue News: " + data.titel,
        nachricht: `${user.name} hat eine neue News veröffentlicht: ${data.titel}`,
        link: "/news",
      });
      toast.success("News veröffentlicht");
    }
    setArticles(getNews());
    setDialogOpen(false);
    setEditingArticle(undefined);
  };

  const handleDelete = (id: string) => {
    deleteNews(id);
    setArticles(getNews());
    toast.success("News gelöscht");
  };

  const handleEdit = (article: NewsArticle) => {
    setEditingArticle(article);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingArticle(undefined);
    setDialogOpen(true);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="News & Updates"
          subtitle="Interne Mitteilungen für Vertriebspartner"
        >
          {canEdit && (
            <Button variant="brand" size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" /> News erstellen
            </Button>
          )}
        </PageHeader>

        {neuImCrm && (
          <Tabs value={filter} onValueChange={(v) => setFilter(v as NewsFilter)}>
            <TabsList>
              <TabsTrigger value="alle">Alle</TabsTrigger>
              <TabsTrigger value="crm">Neu im CRM</TabsTrigger>
              <TabsTrigger value="unternehmen">Aus dem Unternehmen</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="space-y-6">
          {karten.map((k) => {
            if (k.art === "notiz") {
              const nr = k.e.nr;
              return (
                <NotizKarte
                  key={`notiz-${nr}`}
                  e={k.e}
                  ungelesen={ungelesenBeimOeffnen.has(notizLeseId(nr))}
                  aktiveRolle={user.role}
                  freigabe={betrachter.istFreigeber
                    ? {
                        stand: notizFreigabeStand(k.e, freigaben),
                        entscheide: (s) => void entscheideNotiz(nr, s),
                        bearbeiten: () => setBearbeiteNr(nr),
                        ueberarbeitet: !!ueberarbeitungen[String(nr)],
                      }
                    : undefined}
                />
              );
            }
            const n = k.n;
            return (
            <Card key={n.id} className="p-6">
              {/* Mit Bild: auf breiten Schirmen Bild links (ein Drittel), Text
                  rechts; auf dem Handy untereinander, Bild oben. */}
              <div className={n.bild ? "grid gap-4 md:grid-cols-3 md:gap-6" : undefined}>
              {n.bild && (
                <img src={n.bild} alt={n.titel} className="w-full aspect-video rounded-lg border object-cover" />
              )}
              <div className={n.bild ? "min-w-0 md:col-span-2" : undefined}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {n.angepinnt && <Pin className="h-3.5 w-3.5 text-primary" />}
                  <h2 className="text-lg font-bold">{n.emoji} {n.titel}</h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={`${KAT_COLORS[n.kategorie] || "bg-muted"} text-xs`}>{n.kategorie}</Badge>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" aria-label="Bearbeiten" className="h-7 w-7" onClick={() => handleEdit(n)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Löschen" className="h-7 w-7" onClick={() => handleDelete(n.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {formatDate(n.erstelltAm)}
                {canEdit && n.zielrollen && n.zielrollen.length > 0 && (
                  <span className="ml-2">· Sichtbar für: {n.zielrollen.map(r => ROLES.find(role => role.id === r)?.label || r).join(", ")}</span>
                )}
              </p>

              <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                {renderMarkdown(n.inhalt)}
              </div>

              {/* Links / YouTube embeds */}
              {n.links && n.links.length > 0 && (
                <div className="mt-4 space-y-3">
                  <Separator />
                  {n.links.map((link, i) => {
                    const ytId = extractYoutubeId(link.url);
                    if (ytId) {
                      return (
                        <div key={i} className="space-y-1">
                          {link.bezeichnung && <p className="text-xs font-semibold text-muted-foreground">{link.bezeichnung}</p>}
                          <div className="aspect-video rounded-lg overflow-hidden border">
                            <YoutubeNachKlick videoId={ytId} titel={link.bezeichnung || "Video"} />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                        <LinkIcon className="h-3.5 w-3.5" />
                        {link.bezeichnung || link.url}
                      </a>
                    );
                  })}
                </div>
              )}
              </div>
              </div>
            </Card>
            );
          })}
          {neuImCrm && karten.length === 0 && (
            <p className="text-sm text-muted-foreground">Hier gibt es gerade nichts Neues.</p>
          )}
        </div>
      </div>

      <NewsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editArticle={editingArticle}
        onSave={handleSave}
      />
      {betrachter.istFreigeber && bearbeiteOriginal && (
        <NotizBearbeitenDialog
          key={bearbeiteOriginal.nr}
          eintrag={mitUeberarbeitung(bearbeiteOriginal, ueberarbeitungen)}
          original={bearbeiteOriginal}
          ueberarbeitet={!!ueberarbeitungen[String(bearbeiteOriginal.nr)]}
          onClose={() => setBearbeiteNr(null)}
          onSave={(text) => speichereNotizText(bearbeiteOriginal.nr, text)}
        />
      )}
    </DashboardLayout>
  );
};

export default News;
