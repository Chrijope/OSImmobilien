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
  /** Felder, die aus dem CRM kamen und seither nicht geändert wurden. */
  vorausgefuellt?: string[];
}

export type Feld = Exclude<keyof BeratungsprotokollDaten, "vorlage" | "vorausgefuellt">;

export function leeresProtokoll(): BeratungsprotokollDaten {
  return {
    vorlage: BERATUNGSPROTOKOLL_VORLAGE,
    kaeuferName: "", kaeuferAnschrift: "", weitereKaeufer: "",
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
  person2?: { vorname?: string; nachname?: string } | null;
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

/** ISO → TT.MM.JJJJ für das PDF. Anderes bleibt, wie es ist. */
export function datumDe(iso?: string | null): string {
  const s = String(iso ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s;
}

export function vorbelegen(q: CrmQuellen): BeratungsprotokollDaten {
  const k = q.kunde;
  const o = q.objekt;
  const kaufpreis = euro(o.kaufpreis);
  const werte: Partial<Record<Feld, string>> = {
    kaeuferName: t(k.vorname, k.nachname).join(" "),
    kaeuferAnschrift: t(t(k.strasse, k.hausnummer).join(" "), t(k.plz, k.ort).join(" ")).join(", "),
    weitereKaeufer: q.person2 ? t(q.person2.vorname, q.person2.nachname).join(" ") : "",
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
  bestaetigung: (abschnitte: string) => `Bestätigung der/des Käufer(s) für die Abschnitte ${abschnitte}: Ort, Datum, Unterschrift`,
  unterschriftVp: "Name / Unterschrift Vertriebspartner(in)",
  unterschriftKunde: "Name / Unterschrift Käufer(in)(nen)",
  unterschriebenAm: (zeitpunkt: string) => `Elektronisch unterschrieben am ${zeitpunkt} (EES)`,
  dateiname: (name: string, datum: string) => `Beratungsprotokoll_${name}_${datum}.pdf`,
} as const;
