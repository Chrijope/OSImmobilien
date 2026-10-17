/**
 * Beratungs- und Qualitätsprotokoll (Christian, 17.10.2026).
 *
 * Ersetzt das Aftersales-Beratungsdokument im Kästchen Notar. Vorlage:
 * „Beratungs-_und_Qualitaetsprotokoll.pdf“ (4 Seiten, 17 Abschnitte). Die
 * festen Texte stehen hier und nur im PDF; das Formular zeigt allein die
 * Felder, die ausgefüllt werden.
 *
 * Geändert gegenüber der Vorlage, sonst wortgleich:
 *   - Anrede in der Einleitung: du statt Sie (Kunden werden geduzt).
 *   - Gedankenstriche durch Komma, Klammer oder Doppelpunkt ersetzt.
 *   - „Bestätigung … für Seite 1“ heißt „für die Abschnitte 1 bis 4“: Die
 *     Seiten des erzeugten PDFs fallen anders als in der Vorlage.
 *
 * Gespeichert wird wie bisher unter `aftersalesBeratung.formData` (schreibt
 * nur `finalize-aftersales-beratung`), der Entwurf unter
 * `beratungsprotokollEntwurf`. Ältere Dokumente ohne `vorlage` bleiben, wie
 * sie sind, und werden weiter mit `aftersalesBeratungPdf.ts` gezeigt.
 *
 * Bewusst ohne Supabase und Stores, damit die Tests es direkt laden.
 */

export const BERATUNGSPROTOKOLL_VORLAGE = "qualitaetsprotokoll-2026-10";
/** Meta-Schlüssel des Entwurfs am Investment. */
export const ENTWURF_SCHLUESSEL = "beratungsprotokollEntwurf";

export type Nutzung = "" | "eigennutzung" | "vermietung";
export type Besichtigung = "" | "selbst" | "beauftragt_zugeschaltet" | "beauftragt" | "nicht_wahrgenommen";
export type Mietverhaeltnis = "" | "leer" | "vermietet";
export type Lage = "" | "rechts" | "links" | "mitte";

export interface BeratungsprotokollDaten {
  vorlage: typeof BERATUNGSPROTOKOLL_VORLAGE;
  // 1. Käufer
  kaeuferName: string;
  kaeuferAnschrift: string;
  weitereKaeufer: string;
  /** Käufer 2 unterschreibt selbst, dafür braucht es seine Adresse (17.10.2026). */
  kaeufer2Email: string;
  // 2. Objektdaten
  objektAdresse: string;
  objektLage: string;
  einheitNr: string;
  groesse: string;
  verkaufspreis: string;
  stellplatz: string;
  // 4. Nutzung
  nutzung: Nutzung;
  besichtigtGeschoss: string;
  besichtigtLage: Lage;
  // 5. Besichtigung
  besichtigung: Besichtigung;
  beauftragter: string;
  // 6. Kaufangebot
  kaufangebot: string;
  vertriebDurch: string;
  // 10. Mietverhältnis
  mietverhaeltnis: Mietverhaeltnis;
  nettokaltmiete: string;
  // 11. Unterlagen (ISO-Datum)
  unterlagenUebergebenAm: string;
  // 16. Ablauf der Beratung
  erstkontaktDurch: string;
  erstgespraechVon: string;
  erstgespraechOrt: string;
  erstgespraechDatum: string;
  unterlagenPapierAm: string;
  // Ort und Datum der Unterzeichnung (ISO), gilt für jede Bestätigung
  ort: string;
  datum: string;
  /** Sprache des Kunden, gesetzt beim Versand. Ohne Angabe Deutsch. */
  sprache?: "de" | "en";
  /** Felder, die aus dem CRM kamen und seither nicht geändert wurden. */
  vorausgefuellt?: string[];
}

export type Feld = Exclude<keyof BeratungsprotokollDaten, "vorlage" | "vorausgefuellt" | "sprache">;

export function leeresProtokoll(): BeratungsprotokollDaten {
  return {
    vorlage: BERATUNGSPROTOKOLL_VORLAGE,
    kaeuferName: "", kaeuferAnschrift: "", weitereKaeufer: "", kaeufer2Email: "",
    objektAdresse: "", objektLage: "", einheitNr: "", groesse: "", verkaufspreis: "", stellplatz: "",
    nutzung: "", besichtigtGeschoss: "", besichtigtLage: "",
    besichtigung: "", beauftragter: "",
    kaufangebot: "", vertriebDurch: "",
    mietverhaeltnis: "", nettokaltmiete: "",
    unterlagenUebergebenAm: "",
    erstkontaktDurch: "", erstgespraechVon: "", erstgespraechOrt: "", erstgespraechDatum: "", unterlagenPapierAm: "",
    ort: "", datum: "",
    vorausgefuellt: [],
  };
}

export function istBeratungsprotokoll(formData: unknown): formData is BeratungsprotokollDaten {
  return !!formData && typeof formData === "object" && (formData as { vorlage?: unknown }).vorlage === BERATUNGSPROTOKOLL_VORLAGE;
}

/* ── Vorausfüllung ─────────────────────────────────────────────── */

/** Was das CRM zu einem Investment weiß. Fehlendes bleibt leer, nichts wird geschätzt. */
export interface CrmQuellen {
  kunde: {
    vorname?: string; nachname?: string;
    strasse?: string; hausnummer?: string; plz?: string; ort?: string;
    quelle?: string; berater?: string;
    /** Datum des Erstgesprächs, ISO oder TT.MM.JJJJ. */
    erstgespraechDatum?: string;
  };
  /** Zweite Person aus der Selbstauskunft. */
  person2?: { vorname?: string; nachname?: string; email?: string } | null;
  objekt: {
    strasse?: string; plz?: string; ort?: string; weNr?: string;
    kaufpreis?: number; wohnflaeche?: number; etage?: string; lage?: string;
  };
  stellplatz?: { art: "garage" | "stellplatz"; nr: string } | null;
  /** Nur wenn im CRM ein aktueller Mieter der Einheit steht. */
  mieter?: { kaltmiete?: number } | null;
  /** Name des angemeldeten Nutzers, Rückfall für „Vertrieb durchgeführt durch“. */
  nutzerName?: string;
  /** Heute, ISO (YYYY-MM-DD). */
  heute: string;
}

const t = (...teile: Array<string | undefined | null>) => teile.map((s) => String(s ?? "").trim()).filter(Boolean);

/** 249000 → „249.000,00“, ohne Währung: die Beschriftung sagt schon (EUR). */
export function euro(n?: number | null): string {
  return n && isFinite(n) && n > 0 ? n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}

/** TT.MM.JJJJ oder ISO → ISO, sonst leer. */
export function alsIso(wert?: string | null): string {
  const s = String(wert ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** ISO → TT.MM.JJJJ (englisch TT/MM/JJJJ) für das PDF. Anderes bleibt, wie es ist. */
export function datumDe(iso?: string | null, sprache: "de" | "en" = "de"): string {
  const s = String(iso ?? "").trim();
  const z = sprache === "en" ? "/" : ".";
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}${z}${s.slice(5, 7)}${z}${s.slice(0, 4)}` : s;
}

export function vorbelegen(q: CrmQuellen): BeratungsprotokollDaten {
  const k = q.kunde;
  const o = q.objekt;
  const kaufpreis = euro(o.kaufpreis);
  const werte: Partial<Record<Feld, string>> = {
    kaeuferName: t(k.vorname, k.nachname).join(" "),
    kaeuferAnschrift: t(t(k.strasse, k.hausnummer).join(" "), t(k.plz, k.ort).join(" ")).join(", "),
    weitereKaeufer: q.person2 ? t(q.person2.vorname, q.person2.nachname).join(" ") : "",
    kaeufer2Email: q.person2 ? String(q.person2.email ?? "").trim() : "",
    objektAdresse: t(o.strasse, t(o.plz, o.ort).join(" ")).join(", "),
    objektLage: t(o.etage, o.lage).join(", "),
    einheitNr: String(o.weNr ?? "").trim(),
    groesse: o.wohnflaeche && o.wohnflaeche > 0 ? o.wohnflaeche.toLocaleString("de-DE") : "",
    verkaufspreis: kaufpreis,
    stellplatz: q.stellplatz?.nr ? `${q.stellplatz.art === "stellplatz" ? "Stellplatz" : "Garage"} ${q.stellplatz.nr}` : "",
    kaufangebot: kaufpreis,
    vertriebDurch: String(k.berater || q.nutzerName || "").trim(),
    mietverhaeltnis: q.mieter ? "vermietet" : "",
    nettokaltmiete: q.mieter ? euro(q.mieter.kaltmiete) : "",
    erstkontaktDurch: String(k.quelle ?? "").trim(),
    erstgespraechVon: String(k.berater ?? "").trim(),
    erstgespraechDatum: alsIso(k.erstgespraechDatum),
  };
  const daten = leeresProtokoll();
  const aus: string[] = [];
  for (const [feld, wert] of Object.entries(werte) as Array<[Feld, string]>) {
    if (!wert) continue;
    (daten as unknown as Record<string, string>)[feld] = wert;
    aus.push(feld);
  }
  // Das Datum der Unterzeichnung ist ein Vorschlag, keine CRM-Angabe.
  daten.datum = q.heute;
  daten.vorausgefuellt = aus;
  return daten;
}

/**
 * Ein gespeicherter Entwurf gewinnt. Nur leere Felder werden aus dem CRM
 * ergänzt, damit inzwischen eingetragene Angaben (etwa die Garage) ankommen,
 * ohne Eingaben zu überschreiben.
 */
export function entwurfErgaenzen(entwurf: Partial<BeratungsprotokollDaten> | null | undefined, crm: BeratungsprotokollDaten): BeratungsprotokollDaten {
  if (!entwurf || !istBeratungsprotokoll(entwurf)) return crm;
  const daten: BeratungsprotokollDaten = { ...leeresProtokoll(), ...entwurf };
  const aus = new Set(entwurf.vorausgefuellt ?? []);
  for (const feld of crm.vorausgefuellt ?? []) {
    const f = feld as Feld;
    if (!String(daten[f] ?? "").trim()) {
      (daten as unknown as Record<string, string>)[f] = String(crm[f]);
      aus.add(f);
    }
  }
  if (!daten.datum) daten.datum = crm.datum;
  daten.vorausgefuellt = [...aus];
  return daten;
}

/** Eine Eingabe übernehmen; die Markierung „aus dem CRM“ fällt dann weg. */
export function feldSetzen<F extends Feld>(d: BeratungsprotokollDaten, feld: F, wert: BeratungsprotokollDaten[F]): BeratungsprotokollDaten {
  return { ...d, [feld]: wert, vorausgefuellt: (d.vorausgefuellt ?? []).filter((f) => f !== feld) };
}

/* ── Pflichtangaben vor dem Versand ────────────────────────────── */

export function offenePflichtfelder(d: BeratungsprotokollDaten): string[] {
  const leer = (s: string) => !String(s ?? "").trim();
  const offen: string[] = [];
  if (leer(d.kaeuferName)) offen.push("Name, Vorname");
  if (leer(d.kaeuferAnschrift)) offen.push("Anschrift des Käufers");
  if (!leer(d.weitereKaeufer) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.kaeufer2Email.trim())) offen.push("E-Mail des weiteren Käufers");
  if (leer(d.objektAdresse)) offen.push("Objektadresse");
  if (leer(d.einheitNr)) offen.push("Einheit-Nr.");
  if (leer(d.verkaufspreis)) offen.push("Verkaufspreis");
  if (!d.nutzung) offen.push("Art der Nutzung");
  if (!d.besichtigung) offen.push("Besichtigung");
  if ((d.besichtigung === "beauftragt" || d.besichtigung === "beauftragt_zugeschaltet") && leer(d.beauftragter)) offen.push("Name der/des Beauftragten");
  if (leer(d.kaufangebot)) offen.push("Unterbreitetes Kaufangebot");
  if (leer(d.vertriebDurch)) offen.push("Vertrieb durchgeführt durch");
  if (!d.mietverhaeltnis) offen.push("Mietverhältnis");
  if (d.mietverhaeltnis === "vermietet" && leer(d.nettokaltmiete)) offen.push("Nettokaltmiete");
  if (leer(d.ort)) offen.push("Ort der Unterzeichnung");
  if (leer(d.datum)) offen.push("Datum der Unterzeichnung");
  return offen;
}

/* ── Stand am Investment ───────────────────────────────────────── */

export type ProtokollStatus = "gesperrt" | "offen" | "wartet_auf_kunde" | "abgeschlossen";

/**
 * Wie bisher in der Karte: freigeschaltet am Tag des Notartermins, danach
 * entscheidet, wer schon unterschrieben hat.
 */
export function protokollStatus(ab: Record<string, unknown> | undefined, notarDatum: string | undefined, heuteIso: string): ProtokollStatus {
  const a = ab || {};
  if (a.kundeSignedAt || a.status === "abgeschlossen") return "abgeschlossen";
  if (a.vpSignedAt || a.status === "wartet_auf_kunde") return "wartet_auf_kunde";
  const notar = alsIso(notarDatum);
  if (!notar) return "gesperrt";
  return notar <= heuteIso ? "offen" : "gesperrt";
}

/** Heute in Berlin, ISO. */
export function heuteIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/* ── Feste Texte aus der Vorlage ───────────────────────────────── */

export const TEXTE = {
  titel: "Beratungs- und Qualitätsprotokoll",
  kopfRechts: "Eigentumswohnung, Käuferberatung",
  untertitel: "zum Erwerb einer Eigentumswohnung: Dokumentation der Käuferberatung",
  einleitung:
    "Liebe Käuferin, lieber Käufer, dieses Protokoll dokumentiert den Verlauf und Inhalt der mit dir geführten Beratungsgespräche im Zusammenhang mit dem nachstehenden Immobilienerwerb. Es dient ausschließlich der Beweissicherung der erteilten Informationen und stellt keine Rechts-, Steuer- oder Anlageberatung dar. Bitte lies das Protokoll vor Unterzeichnung vollständig und sorgfältig durch.",
  hinweisOben:
    "Hinweis: Der unterzeichnende Vertriebspartner handelt im eigenen Namen und auf eigene Rechnung. Er ist weder Vertreter noch Erfüllungsgehilfe des Verkäufers und erbringt keine Rechts-, Steuer- oder Finanzberatung.",
  a1: "1. Angaben zum Käufer / zur Käuferin",
  a1Zeilen: { kaeuferName: "Name, Vorname", kaeuferAnschrift: "Wohnhaft in (Anschrift)", weitereKaeufer: "Weitere/r Käufer (falls vorhanden)" },
  a2: "2. Objektdaten",
  a2Zeilen: {
    objektAdresse: "Objektadresse", objektLage: "Objektlage / Geschoss", einheitNr: "Einheit-Nr.",
    groesse: "Größe (ca. m²)", verkaufspreis: "Verkaufspreis (EUR)", stellplatz: "Stellplatz / Garage / TG-Nr.",
  },
  a2Text:
    "Die Angaben zu Lage, Größe und Ausstattung der Wohnung wurden den vom Verkäufer zur Verfügung gestellten Unterlagen entnommen. Der Vertrieb übernimmt hierfür keine eigene Gewähr und hat diese Angaben nicht selbst überprüft.",
  a3: "3. Hinweis zu Erwerbsnebenkosten",
  a3Text:
    "Mögliche Erwerbskosten (u. a. Betreuungs-, Vermarktungs-, Finanzierungs- und Abschlusskosten, Vermittlungs- und Vertriebskosten, Notar- und Grunderwerbsteuerkosten) können bis zu 30 % des Gesamtkaufpreises betragen. Der Käufer bestätigt, hierauf ausdrücklich und rechtzeitig vor Vertragsschluss hingewiesen worden zu sein.",
  a4: "4. Art der Nutzung",
  a4Eigennutzung:
    "Die Immobilie wird zur Eigennutzung erworben. Der Käufer bestätigt, dass er die Wohnung spätestens nach Auszug eines etwaigen derzeitigen Mieters selbst bezieht. Eine etwaige Kündigung des Mieters obliegt allein dem Käufer; der Käufer wird sich diesbezüglich eigenständig rechtlich beraten lassen.",
  a4Vermietung:
    "Die Immobilie wird zur Vermietung erworben. Der Käufer bestätigt, ausdrücklich auf alle Risiken einer Vermietung hingewiesen worden zu sein (u. a. Mieterkündigung, Mietminderung, Mietausfall, Sonderumlagen der Eigentümergemeinschaft). Eine rechtliche oder steuerliche Beratung hierzu wurde durch den Vertrieb nicht erbracht; der Käufer wurde auf einen Rechtsanwalt, Steuerberater bzw. die Hausverwaltung verwiesen.",
  a4Besichtigt: (geschoss: string, lage: string) =>
    `Besichtigte Wohnung im ${geschoss || "____________"} Geschoss, Lage ${lage || "rechts / links / mitte"} (Zutreffendes angeben)`,
  a5: "5. Zustandskenntnis und Besichtigung der Kaufsache",
  a5Hinweis: "Bitte zutreffende Variante ankreuzen:",
  a5Selbst: "Der Käufer hat die Kaufsache besichtigt.",
  a5Zugeschaltet: (name: string) =>
    `Der Käufer hat ${name || "____________________________"} (Beauftragte/r) mit der Besichtigung der Kaufsache beauftragt und war gleichzeitig bei der Besichtigung durch den/die Beauftragte/n in Bild und Ton zugeschaltet. Die Beauftragung wird hiermit wiederholt bzw. nochmals ausdrücklich bestätigt.`,
  a5Beauftragt: (name: string) =>
    `Der Käufer hat Herrn/Frau ${name || "____________________________"} (Beauftragte/r) mit der Besichtigung der Kaufsache beauftragt. Der/Die Beauftragte hat die Kaufsache besichtigt. Die Beauftragung wird hiermit wiederholt bzw. nochmals ausdrücklich bestätigt.`,
  a5Nicht:
    "Der Käufer hat trotz Besichtigungsmöglichkeit nach eigenem Terminwunsch und trotz jederzeitiger Möglichkeit der Beauftragung einer Vertrauensperson bzw. eines/einer Dritten mit der Besichtigung der Kaufsache (nebst gleichzeitiger Zuschaltung des Käufers in Bild und Ton) eine Besichtigung nicht wahrgenommen.",
  a5Text:
    "Der Käufer bestätigt, dass ihm unabhängig von der gewählten Variante ausreichend Gelegenheit zur Kenntnisnahme des Zustands der Kaufsache gegeben wurde und er hiervon nach freier Entscheidung Gebrauch gemacht oder bewusst keinen Gebrauch gemacht hat.",
  a6: "6. Kaufangebot und Stellung des Vertriebs",
  a6Zeilen: { kaufangebot: "Unterbreitetes Kaufangebot (EUR)", vertriebDurch: "Vertrieb durchgeführt durch" },
  a6Text: [
    "Die Mitwirkung des Verkäufers beschränkt sich auf die Bereitstellung des Objekts und der zugehörigen Unterlagen. Der Käufer wurde ausdrücklich darauf hingewiesen, dass der Vertriebspartner im eigenen Namen und auf eigene Rechnung tätig ist und nicht als Vertreter, Erfüllungsgehilfe oder Beauftragter des Verkäufers handelt. Etwaige Erklärungen des Vertriebs binden ausschließlich den Vertrieb selbst, nicht den Verkäufer.",
    "Der Käufer bestätigt, seine Kaufentscheidung eigenständig, auf Grundlage eigener Prüfung und ohne Zusicherung bestimmter Ergebnisse durch den Vertrieb getroffen zu haben.",
  ],
  a7: "7. Hinweis zu Provisionen",
  a7Text:
    "Dem Käufer ist bekannt, dass der Verkäufer durch den Verkauf einen Gewinn erzielt und der Vertrieb eine Innen-, Vertriebs-, Vermarktungs- bzw. Betreuungsprovision erhält. Diese Provisionen werden aus dem Kaufpreis finanziert.",
  a8: "8. Abtretung / Treuhandabwicklung",
  a8Text:
    "Sofern im Kaufvertragsentwurf eine Abtretung bzw. Treuhandabwicklung vorgesehen ist, wurde der Käufer hierüber umfassend informiert und hat den Sachverhalt vollständig verstanden. Der Abtretungsberechtigte bzw. Treuhänder wird die Abwicklung und Aufteilung gesondert nachweisen und erläutern; der Käufer wird hierzu eigenständig Kontakt aufnehmen. Für die inhaltliche Richtigkeit der Treuhandabwicklung übernimmt der Vertrieb keine Verantwortung.",
  a9: "9. Steuerliche, rechtliche und finanzierungsbezogene Hinweise",
  a9Text:
    "Verbindliche Auskünfte zu steuerlichen oder rechtlichen Fragen kann ausschließlich ein Steuerberater, Steuerbevollmächtigter, Wirtschaftsprüfer bzw. Rechtsanwalt unter Berücksichtigung der persönlichen Verhältnisse des Käufers erteilen. Der Vertrieb hat keine entsprechende Beratung erbracht und übernimmt hierfür keine Haftung. Offene Fragen zur Finanzierung wird der Käufer eigenständig mit einem Finanzierungsinstitut bzw. freien Finanzierungsvermittler klären.",
  a10: "10. Bestehendes Mietverhältnis",
  a10Leer: "Die Wohnung ist leerstehend.",
  a10Vermietet: (miete: string) => `Es besteht ein Mietverhältnis. Die derzeitige Nettokaltmiete beträgt EUR ${miete || "____________"}.`,
  a10Text:
    "Im Falle einer Aufteilung des Hauses in Wohn- und Teileigentum kann ein außerordentlicher Kündigungsschutz bestehen; eine Kündigung ist dann für mindestens drei Jahre ab Aufteilung ausgeschlossen.",
  a11: "11. Übergabe der Vertragsunterlagen",
  a11Text:
    "Alle erforderlichen Unterlagen (einschließlich Kaufvertragsentwurf, Teilungserklärung mit Aufteilungsplänen, Wirtschaftspläne und Protokolle der letzten drei Jahre sowie sämtlicher Unterlagen zum Mietverhältnis) wurden dem Käufer mindestens 14 Tage vor der notariellen Beurkundung übergeben.",
  a11Uebergeben: "Unterlagen übergeben am:",
  a11Text2: [
    "Der Käufer bestätigt, sämtliche Unterlagen, insbesondere die Protokolle, vollständig und inhaltlich genau gelesen zu haben, sich der sich daraus ergebenden Folgen sowie etwaiger künftiger Sonderumlagen bewusst zu sein, und entbindet den Verkäufer sowie den Vertrieb insoweit von jeglicher Haftung, soweit gesetzlich zulässig.",
    "Nachträglich eingegangene Unterlagen (zusätzlicher Schrift- und Mailverkehr mit Mieter und Verwaltung), die bis zum Beurkundungstag eingetroffen sind, wurden dem Käufer vor der Beurkundung zusätzlich in Schriftform durch den Vertriebspartner ausgehändigt. Weitere nach Beurkundung relevante Unterlagen holt der Käufer eigenständig bei den zuständigen Stellen (Hausverwaltung, Mieter, Versicherung usw.) ein.",
  ],
  a12: "12. Vollständigkeit der Besichtigung und Zustand des Objekts",
  a12Text:
    "Der Käufer bestätigt, das Kaufobjekt vollständig besichtigt und alle relevanten Informationen vollständig angefordert und erhalten zu haben. Dem Käufer sind sämtliche Schönheitsmängel an der erworbenen Einheit sowie am Gemeinschaftseigentum bekannt; diese werden im Kaufvertrag nicht gesondert aufgeführt. Der Käufer bestätigt, hierüber informiert worden zu sein, und akzeptiert den Zustand des Objekts in diesem Zusammenhang.",
  a13: "13. Haftungsregelung",
  a13Text: [
    "1. Jegliche Haftung des Verkäufers und des Vertriebs (einschließlich für Folgeschäden oder mittelbare Schäden) wird im gesetzlich zulässigen Umfang ausgeschlossen. Unberührt bleibt die Haftung für Vorsatz, grobe Fahrlässigkeit sowie für die Verletzung von Leben, Körper und Gesundheit gemäß §§ 309, 310 BGB.",
    "2. Der Verkäufer und der Vertrieb übernehmen keine Haftung für Maßnahmen, Sonderumlagen oder Sanierungsmaßnahmen, die in bisherigen Protokollen oder Einladungen erwähnt, jedoch noch nicht beschlossen oder deren Kosten noch nicht feststehen, und die erst nach Vertragsschluss von der Eigentümergemeinschaft beschlossen werden.",
    "3. Der Verkäufer und der Vertrieb übernehmen keine Haftung für Schäden oder Probleme, die erst nach Vertragsschluss bemerkt werden oder auftreten und vor dem Verkauf unbemerkt bzw. nicht definiert bestanden.",
  ],
  a13Hinweis:
    "Hinweis: Vorstehende Haftungsbeschränkungen gelten nur im gesetzlich zulässigen Rahmen (insb. §§ 307 bis 310 BGB) und ersetzen keine individuelle Vertragsprüfung im notariellen Kaufvertrag.",
  a14: "14. Hausgeld und laufende Kosten",
  a14Text:
    "Dem Käufer ist bekannt, dass neben etwaigen Mieteinnahmen Hausgeld an die Wohnungseigentümergemeinschaft zu zahlen ist und diese Beträge variieren können. Informationen zu Nettomiete, Nebenkostenvorauszahlungen und Hausverwaltungskosten wurden dem Käufer zur Verfügung gestellt; weitere Auskünfte holt der Käufer eigenständig bei der Eigentümergemeinschaft/Hausverwaltung ein.",
  a15: "15. Wertentwicklung, Wirtschaftlichkeit und Risiken",
  a15Text: [
    "Der Wert einer Immobilie unterliegt verschiedenen Einflussfaktoren und Schwankungen. Aus der Höhe des Kaufpreises kann kein Rückschluss auf eine Drittbewertung gezogen werden. Der bankseitige Beleihungswert stellt nicht den aktuellen Marktwert dar; vereinbarte Renovierungen erhöhen den Wert nicht notwendigerweise. Es kann nicht zugesichert werden, dass bei einem künftigen Verkauf der vereinbarte Kaufpreis erneut erzielt wird.",
    "Sämtliche wirtschaftlichen und unternehmerischen Risiken des Immobilienerwerbs (insbesondere Wirtschaftlichkeit, steuerliche Auswirkungen und Wertentwicklung) trägt allein der Käufer. Vermietete Objekte sind grundsätzlich als langfristige Kapitalanlage über mindestens 20 Jahre zu betrachten; erst in diesem Zeitraum ist üblicherweise eine Gewinnrealisierung gegenüber dem laufenden Darlehen zu erwarten. Von einem frühzeitigen Verkauf wird ausdrücklich abgeraten, da dieser zu erheblichen Verlusten, steuerlichen Nachteilen und (bei laufender Finanzierung) zu Vorfälligkeitsentschädigungen führen kann.",
  ],
  a16: "16. Ablauf der Beratung",
  a16Zeilen: {
    erstkontaktDurch: "Erstkontakt / Empfehlung durch", erstgespraechVon: "Erstgespräch durchgeführt von",
    erstgespraechOrt: "Ort", erstgespraechDatum: "Datum", unterlagenPapierAm: "Unterlagen in Papierform übergeben am",
  },
  a17: "17. Schlussbestätigung des Käufers",
  a17Text: [
    "Dieses Beratungs- und Qualitätsprotokoll wurde dem Käufer ausführlich erläutert. Der Käufer bestätigt, den Inhalt vollständig verstanden und das Protokoll eigenhändig ausgefüllt zu haben.",
    "Der Käufer bestätigt ferner, den vorstehenden Text vollständig verstanden zu haben, der deutschen Sprache mächtig zu sein, ein vollständiges Exemplar dieses Protokolls erhalten zu haben, und dass keine Nebenabreden oder Vereinbarungen getroffen wurden, die nicht in diesem Protokoll dokumentiert sind.",
  ],
  unterschriften: "Unterschriften",
  ortDatum: "Ort, Datum:",
  datum: "Datum:",
  unterschriftKaeufer: "Unterschrift Käufer:",
  bestaetigung: (von: number, bis?: number) => `Bestätigung der/des Käufer(s) für ${bis ? `die Abschnitte ${von} bis ${bis}` : `Abschnitt ${von}`}: Ort, Datum, Unterschrift`,
  lage: { rechts: "rechts", links: "links", mitte: "mitte" } as Record<string, string>,
  unterschriftVp: "Name / Unterschrift Vertriebspartner(in)",
  unterschriftKunde: "Name / Unterschrift Käufer(in)(nen)",
  unterschriebenAm: (zeitpunkt: string) => `Elektronisch unterschrieben am ${zeitpunkt} (EES)`,
  dateiname: (name: string, datum: string) => `Beratungsprotokoll_${name}_${datum}.pdf`,
};

export type ProtokollTexte = typeof TEXTE;

/**
 * Englische Fassung für Kunden mit Englisch im Profil (Christian, 17.10.2026:
 * alles, was an den Kunden geht, in seiner Sprache). Übersetzt nach
 * `kundenspracheGlossar.ts`, britisch, ohne Kurzformen und Gedankenstriche.
 * Inhaltlich deckungsgleich mit der deutschen Fassung; vor dem ersten
 * Einsatz anwaltlich prüfen lassen.
 */
export const TEXTE_EN: ProtokollTexte = {
  titel: "Consultation and quality record",
  kopfRechts: "Freehold flat, buyer consultation",
  untertitel: "for the purchase of a freehold flat: documentation of the buyer consultation",
  einleitung:
    "Dear buyer, this record documents the course and content of the consultations held with you in connection with the property purchase set out below. It serves exclusively to preserve evidence of the information provided and does not constitute legal, tax or investment advice. Please read the record completely and carefully before signing.",
  hinweisOben:
    "Note: The signing sales partner acts in their own name and for their own account. They are neither a representative nor a vicarious agent of the seller and do not provide legal, tax or financial advice.",
  a1: "1. Details of the buyer",
  a1Zeilen: { kaeuferName: "Surname, first name", kaeuferAnschrift: "Resident at (address)", weitereKaeufer: "Further buyer(s) (if any)" },
  a2: "2. Property details",
  a2Zeilen: {
    objektAdresse: "Property address", objektLage: "Position / floor", einheitNr: "Unit no.",
    groesse: "Size (approx. m²)", verkaufspreis: "Sale price (EUR)", stellplatz: "Parking space / garage / underground no.",
  },
  a2Text:
    "The information on the position, size and fittings of the flat was taken from the documents provided by the seller. The sales organisation assumes no warranty of its own for this and has not verified this information itself.",
  a3: "3. Note on incidental purchase costs",
  a3Text:
    "Possible purchase costs (including support, marketing, financing and completion costs, brokerage and sales costs, notary costs and real estate transfer tax) may amount to up to 30 % of the total purchase price. The buyer confirms that they were expressly informed of this in good time before the contract was concluded.",
  a4: "4. Type of use",
  a4Eigennutzung:
    "The property is being purchased for own use. The buyer confirms that they will move into the flat themselves at the latest after any current tenant has moved out. Any termination of the tenancy is solely the responsibility of the buyer; the buyer will obtain independent legal advice on this.",
  a4Vermietung:
    "The property is being purchased for letting. The buyer confirms that they were expressly informed of all risks of letting (including termination by the tenant, rent reduction, loss of rent, special levies of the owners’ association (WEG / Eigentümergemeinschaft)). No legal or tax advice on this was provided by the sales organisation; the buyer was referred to a lawyer, tax adviser or the property management.",
  a4Besichtigt: (geschoss: string, lage: string) =>
    `Flat viewed on floor ${geschoss || "____________"}, position ${lage || "right / left / centre"} (state as applicable)`,
  a5: "5. Knowledge of condition and viewing of the property",
  a5Hinweis: "Please tick the applicable option:",
  a5Selbst: "The buyer has viewed the property.",
  a5Zugeschaltet: (name: string) =>
    `The buyer instructed ${name || "____________________________"} (authorised person) to view the property and was connected by video and audio during the viewing by the authorised person. The instruction is hereby repeated and expressly confirmed once again.`,
  a5Beauftragt: (name: string) =>
    `The buyer instructed Mr/Ms ${name || "____________________________"} (authorised person) to view the property. The authorised person has viewed the property. The instruction is hereby repeated and expressly confirmed once again.`,
  a5Nicht:
    "Despite the opportunity to view the property at a time of their choosing and despite the possibility at any time of instructing a person of trust or a third party to view the property (with the buyer connected by video and audio at the same time), the buyer did not take up a viewing.",
  a5Text:
    "The buyer confirms that, irrespective of the option chosen, they were given sufficient opportunity to become acquainted with the condition of the property and that they made use of this, or deliberately did not make use of it, by their own free decision.",
  a6: "6. Purchase offer and position of the sales organisation",
  a6Zeilen: { kaufangebot: "Purchase offer made (EUR)", vertriebDurch: "Sales carried out by" },
  a6Text: [
    "The seller’s involvement is limited to providing the property and the related documents. The buyer was expressly informed that the sales partner acts in their own name and for their own account and does not act as a representative, vicarious agent or agent of the seller. Any statements made by the sales organisation bind only the sales organisation itself, not the seller.",
    "The buyer confirms that they made their purchase decision independently, on the basis of their own examination and without any assurance of particular results by the sales organisation.",
  ],
  a7: "7. Note on commissions",
  a7Text:
    "The buyer is aware that the seller makes a profit from the sale and that the sales organisation receives an internal, sales, marketing or support commission. These commissions are financed from the purchase price.",
  a8: "8. Assignment / escrow settlement",
  a8Text:
    "Where the draft purchase contract provides for an assignment or an escrow settlement, the buyer has been comprehensively informed of this and has fully understood the matter. The assignee or escrow agent will separately evidence and explain the settlement and its allocation; the buyer will contact them independently for this purpose. The sales organisation accepts no responsibility for the correctness of the content of the escrow settlement.",
  a9: "9. Tax, legal and financing notes",
  a9Text:
    "Binding information on tax or legal questions can only be given by a tax adviser, tax agent, auditor or lawyer taking into account the buyer’s personal circumstances. The sales organisation has not provided any such advice and accepts no liability for it. The buyer will clarify any open questions on financing independently with a financial institution or an independent financing broker.",
  a10: "10. Existing tenancy",
  a10Leer: "The flat is vacant.",
  a10Vermietet: (miete: string) => `A tenancy exists. The current net cold rent (Kaltmiete) is EUR ${miete || "____________"}.`,
  a10Text:
    "Where the building is divided into residential and partial ownership, extraordinary protection against termination may apply; termination is then excluded for at least three years from the division.",
  a11: "11. Handover of the contract documents",
  a11Text:
    "All required documents (including the draft purchase contract, the declaration of division with division plans, business plans and minutes of the last three years and all documents relating to the tenancy) were handed over to the buyer at least 14 days before the notarial certification.",
  a11Uebergeben: "Documents handed over on:",
  a11Text2: [
    "The buyer confirms that they have read all documents, in particular the minutes, completely and accurately, that they are aware of the resulting consequences and of any future special levies, and releases the seller and the sales organisation from any liability in this respect to the extent permitted by law.",
    "Documents received subsequently (additional correspondence and emails with the tenant and the management) that arrived by the day of certification were additionally handed to the buyer in writing by the sales partner before the certification. The buyer will obtain any further documents relevant after certification independently from the responsible bodies (property management, tenant, insurance and so on).",
  ],
  a12: "12. Completeness of the viewing and condition of the property",
  a12Text:
    "The buyer confirms that they have viewed the property in full and have requested and received all relevant information in full. The buyer is aware of all cosmetic defects in the acquired unit and in the common property; these are not listed separately in the purchase contract. The buyer confirms that they have been informed of this and accepts the condition of the property in this respect.",
  a13: "13. Liability",
  a13Text: [
    "1. Any liability of the seller and of the sales organisation (including for consequential or indirect damage) is excluded to the extent permitted by law. Liability for intent, gross negligence and for injury to life, body and health pursuant to Sections 309 and 310 BGB remains unaffected.",
    "2. The seller and the sales organisation accept no liability for measures, special levies or refurbishment measures that are mentioned in previous minutes or invitations but have not yet been resolved or whose costs have not yet been determined, and that are only resolved by the owners’ association after the contract has been concluded.",
    "3. The seller and the sales organisation accept no liability for damage or problems that are only noticed or occur after the contract has been concluded and that existed unnoticed or undefined before the sale.",
  ],
  a13Hinweis:
    "Note: The above limitations of liability apply only within the limits permitted by law (in particular Sections 307 to 310 BGB) and do not replace an individual review of the notarial purchase contract.",
  a14: "14. Service charge and running costs",
  a14Text:
    "The buyer is aware that, in addition to any rental income, a service charge (Hausgeld) is payable to the owners’ association and that these amounts may vary. Information on net rent, advance payments for ancillary costs and property management costs has been made available to the buyer; the buyer will obtain further information independently from the owners’ association or property management.",
  a15: "15. Development in value, profitability and risks",
  a15Text: [
    "The value of a property is subject to various influencing factors and fluctuations. No conclusion about a third-party valuation can be drawn from the level of the purchase price. The bank’s lending value does not represent the current market value; agreed renovations do not necessarily increase the value. It cannot be guaranteed that the agreed purchase price will be achieved again on a future sale.",
    "All economic and entrepreneurial risks of the property purchase (in particular profitability, tax effects and development in value) are borne solely by the buyer. Let properties are generally to be regarded as a long-term capital investment over at least 20 years; only within this period can a profit be expected in relation to the current loan. An early sale is expressly advised against, as it can lead to considerable losses, tax disadvantages and (where financing is ongoing) early repayment charges.",
  ],
  a16: "16. Course of the consultation",
  a16Zeilen: {
    erstkontaktDurch: "First contact / referral by", erstgespraechVon: "Initial consultation held by",
    erstgespraechOrt: "Place", erstgespraechDatum: "Date", unterlagenPapierAm: "Documents handed over on paper on",
  },
  a17: "17. Final confirmation by the buyer",
  a17Text: [
    "This consultation and quality record has been explained to the buyer in detail. The buyer confirms that they have fully understood the content and completed the record personally.",
    "The buyer further confirms that they have fully understood the above text, have a command of the German language, have received a complete copy of this record, and that no side agreements or arrangements have been made that are not documented in this record.",
  ],
  unterschriften: "Signatures",
  ortDatum: "Place, date:",
  datum: "Date:",
  unterschriftKaeufer: "Signature of buyer:",
  bestaetigung: (von: number, bis?: number) => `Confirmation by the buyer(s) for ${bis ? `sections ${von} to ${bis}` : `section ${von}`}: place, date, signature`,
  lage: { rechts: "right", links: "left", mitte: "centre" },
  unterschriftVp: "Name / signature of sales partner",
  unterschriftKunde: "Name / signature of buyer(s)",
  unterschriebenAm: (zeitpunkt: string) => `Signed electronically on ${zeitpunkt} (simple electronic signature)`,
  dateiname: (name: string, datum: string) => `Consultation-record_${name}_${datum}.pdf`,
};

export function protokollTexte(sprache?: string | null): ProtokollTexte {
  return sprache === "en" ? TEXTE_EN : TEXTE;
}
