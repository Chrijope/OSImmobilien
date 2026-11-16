/**
 * Finanzierungsanfrage (Baufi24/Europace, „Datenerfassung“) aus unserer
 * Selbstauskunft füllen.
 *
 * Christian, 16.11.2026: Ist unsere Selbstauskunft ausgefüllt, sollen ihre
 * Angaben eins zu eins in diese Anfrage übernommen werden. Erzeugt wird sie
 * bei jedem Abruf neu aus der gespeicherten Selbstauskunft, so kann sie nie
 * veralten.
 *
 * Die Vorlage liegt leer unter `public/vorlagen/`. Gefüllt wird über die
 * Feldnamen und Exportcodes des Formulars; es bleibt ausfüllbar, damit die
 * Finanzierung Lücken (Kaufnebenkosten, Darlehenswunsch) selbst ergänzen kann.
 *
 * Nicht enthalten: die Unterschrift auf Seite 6. Die setzt erst ein eigener
 * Zustimmungsschritt des Kunden, siehe Umsetzungsplan vom 16.11.2026.
 */
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { kreditArt, parseFinanzNum, versicherungenGesamt } from "./finanzierbarkeitUtils";
import { hatGueterstand } from "./familienstand";
import { bankCode, SA_BRANCHEN, SA_TAETIGKEITEN } from "./saBankListen";

export const FINANZIERUNGSANFRAGE_VORLAGE = "/vorlagen/finanzierungsanfrage-datenerfassung.pdf";

/** Was das Investment über die Wohnung weiß. Alles optional. */
export interface AnfrageObjekt {
  strasse?: string;
  plz?: string;
  ort?: string;
  baujahr?: number;
  wohnflaeche?: number;
  kaufpreis?: number;
}

/** Die Werte je Formularfeld, getrennt nach Feldart. */
export interface AnfrageFelder {
  texte: Record<string, string>;
  /** Auswahllisten, Wert ist der Exportcode. */
  auswahl: Record<string, string>;
  /** Optionsfelder (Anrede, Nutzung, Miete entfällt), Wert ist die Option. */
  optionen: Record<string, string>;
  haken: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Selbstauskunft kommt roh aus investments.meta
type Roh = any;

const betrag = (n: number) => (n ? n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const zahlText = (v: unknown) => betrag(parseFinanzNum(v));
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

const FAMILIENSTAND: Record<string, string> = {
  ledig: "ledig",
  verheiratet: "verheirt",
  "verheiratet, getrennt lebend": "getrennt",
  geschieden: "geschieden",
  verwitwet: "verwitwet",
  "eingetragene lebenspartnerschaft": "eingleben",
};
const GUETERSTAND: Record<string, string> = { gesetzlich: "Zugew", guetertrennung: "GterTrenn", guetergemeinschaft: "GterGem" };
const TITEL: Record<string, string> = { "dr.": "Dr", dr: "Dr", "prof.": "Prof", prof: "Prof", "prof. dr.": "ProfDr", phd: "PhD", "pd dr.": "PDDr" };

/** Länder und Staatsangehörigkeiten: Text → Code. Unbekanntes wird „Sonstige“ (XX). */
function landCode(eingabe: string, optionen: { code: string; label: string }[]): string {
  const e = eingabe.trim().toLowerCase();
  if (!e) return "";
  return optionen.find((o) => o.label.toLowerCase() === e || o.code.toLowerCase() === e)?.code || "XX";
}

/** Die Ländernamen des Formulars, aus der Vorlage gelesen (Code → Name). */
export type Laenderlisten = { geburtsland: { code: string; label: string }[]; staatsangehoerigkeit: { code: string; label: string }[] };

function personFelder(p: Roh, prefix: string, laender: Laenderlisten, f: AnfrageFelder, haushalt: Roh) {
  const t = (feld: string, wert: string) => { if (wert) f.texte[`${prefix}.${feld}`] = wert; };
  const a = (feld: string, code: string | undefined) => { if (code) f.auswahl[`${prefix}.${feld}`] = code; };

  if (p.anrede === "Herr") f.optionen[`${prefix}.sex`] = "M";
  else if (p.anrede === "Frau") f.optionen[`${prefix}.sex`] = "F";
  a("title", TITEL[text(p.titel).toLowerCase()]);
  t("fname", text(p.vorname));
  t("lname", text(p.nachname));
  t("street", [text(p.strasse), text(p.hausnummer)].filter(Boolean).join(" "));
  t("zip", text(p.plz));
  t("city", text(p.ort));
  t("birthdate", text(p.geburtsdatum));
  a("birthCountry", landCode(text(p.geburtsland), laender.geburtsland));
  a("nationality", p.staatsangehoerigkeit === "andere"
    ? landCode(text(p.staatsangehoerigkeitAndere), laender.staatsangehoerigkeit)
    : "DE");
  a("maritalStatus", FAMILIENSTAND[text(p.familienstand).toLowerCase()]);
  // Der Güterstand gilt für den Haushalt und steht bei Person 1.
  if (hatGueterstand(p.familienstand)) a("maritalPropertyStatus", GUETERSTAND[text(haushalt.gueterstand)]);
  t("phoneDay", text(p.telefon) || text(p.mobilfunk));
  t("email", text(p.email));
  const konten: Roh[] = Array.isArray(p.bankkonten) ? p.bankkonten : [];
  t("iban", text((konten.find((k) => k?.konto === "Girokonto" && text(k?.iban)) || konten.find((k) => text(k?.iban)))?.iban));
  t("taxId", text(p.steuerId));

  // Beruf
  const selbst = p.beschaeftigungsart === "selbstaendig";
  const angestellt = p.beschaeftigungsart === "angestellt";
  const taetigkeit = selbst ? SA_TAETIGKEITEN.selbstaendig : SA_TAETIGKEITEN.angestellt;
  a("jobStatus", bankCode(taetigkeit, p.taetigkeit)
    || (angestellt ? "Angest" : selbst ? "SelbstNB" : p.beschaeftigungsart === "hausfrau" ? "Haus" : undefined));
  const branche = text(selbst ? p.selbstaendigkeit?.branche : p.anstellung?.branche);
  if (branche) a("lineOfBusiness", bankCode(SA_BRANCHEN, branche) || "Sonstige");
  t("employedSince", text(selbst ? p.selbstaendigkeit?.selbstaendigSeit : p.anstellung?.angestelltSeit));
  t("employer", text(selbst ? p.selbstaendigkeit?.firma : p.anstellung?.firma));
  t("job", text(selbst ? p.taetigkeit : p.anstellung?.berufsbezeichnung));
  t("pensionEntryDate", text(p.rentenbeginn));
  if (angestellt && p.arbeitsvertragArt === "befristet") {
    f.haken.push(`${prefix}.temporaryJob`);
    t("jobTermination", text(p.befristetBis));
  }
  if (angestellt && (p.anstellung?.probezeit === "ja" || p.arbeitsvertragArt === "probezeit")) {
    f.haken.push(`${prefix}.inProbation`);
    t("endProbation", text(p.probezeitBis));
  }

  // Einnahmen, monatlich
  const e = p.einkommen || {};
  t("netSalary", zahlText(e.netto));
  t("numberOfPayments", angestellt ? text(p.monatsgehaelter) : "");
  t("variableIncome", zahlText(e.variabel));
  t("selfEmplIncome", zahlText(e.gewerbe));
  t("pensions", zahlText(e.rente));
  t("childAllowance", zahlText(e.kindergeld));
  // Mieteinnahmen stehen im Formular beim Immobilienvermögen, Zinsen haben kein eigenes Feld.
  t("otherIncome", betrag(parseFinanzNum(e.sonstige) + parseFinanzNum(e.zinsen)));
  t("pensionsClaimState", zahlText(p.rentenanspruchGesetzlich));
  t("pensionsClaimInsurance", zahlText(p.rentenanspruchPrivat));

  // Ausgaben, monatlich
  if (p.mietart === "Zur Miete") {
    t("rentalExpenses", zahlText(p.mieteWarm));
    if (p.mieteEntfaellt === "ja") f.optionen[`${prefix}.rentNoLonger`] = "true";
    if (p.mieteEntfaellt === "nein") f.optionen[`${prefix}.rentNoLonger`] = "false";
  }
  t("lifeInsuranceBurden", betrag(versicherungenGesamt(p)));
  t("healthInsuranceBurden", zahlText(p.privateKV));
  t("additionalBurden", betrag(parseFinanzNum(p.sonstigeAusgaben) + parseFinanzNum(p.unterhalt)));
}

/**
 * Die Feldwerte der Anfrage aus Selbstauskunft und Objekt. Rein, ohne PDF,
 * damit die Zuordnung prüfbar ist.
 */
export function anfrageFelder(sa: Roh, objekt: AnfrageObjekt | null, laender: Laenderlisten): AnfrageFelder {
  const f: AnfrageFelder = { texte: {}, auswahl: {}, optionen: {}, haken: [] };
  if (!sa) return f;
  const mitP2 = sa.person2 === true && !!sa.person2Data;
  personFelder(sa, "mainApplicant", laender, f, sa);
  if (sa.kinder?.length) f.texte["mainApplicant.numberOfChilds"] = String(sa.kinder.length);
  if (mitP2) personFelder(sa.person2Data, "addApplicant", laender, f, sa);

  // Vermögen und Verbindlichkeiten beider Personen
  const personen: Roh[] = mitP2 ? [sa, sa.person2Data] : [sa];
  const vermoegen = (art: string) => personen.reduce((s, p) => s + (p.vermoegenswerte || [])
    .filter((v: Roh) => v?.art === art).reduce((t: number, v: Roh) => t + parseFinanzNum(v?.betrag), 0), 0);
  const setz = (feld: string, n: number) => { if (n) f.texte[feld] = betrag(n); };
  setz("capital.equityCash", vermoegen("Bank- & Sparguthaben"));
  setz("capital.equityStocks", vermoegen("Wertpapiere / Depot"));
  setz("capital.equityBuildingLoan", vermoegen("Bausparvertrag"));
  setz("capital.lifeInsurances", vermoegen("Lebensversicherung"));
  setz("capital.otherCapital", vermoegen("Sonstige"));

  const immobilien: Roh[] = personen.flatMap((p) => p.immobilien || []);
  const kredite: Roh[] = personen.flatMap((p) => p.kredite || []);
  const istImmoKredit = (k: Roh) => kreditArt(k?.art, k?.kategorie) === "hypothek";
  if (immobilien.length) {
    f.texte["capital.properties.number"] = String(immobilien.length);
    const summe = (lesen: (im: Roh) => unknown, filter: (im: Roh) => boolean = () => true) =>
      immobilien.filter(filter).reduce((s, im) => s + parseFinanzNum(lesen(im)), 0);
    const vermietet = (im: Roh) => /vermiet/i.test(text(im?.nutzung));
    const zahl = (n: number) => (n ? n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "");
    f.texte["capital.allProperties.livingArea.sum"] = zahl(summe((im) => im.wohnflaecheM2));
    f.texte["capital.allProperties.rentedLivingArea.sum"] = zahl(summe((im) => im.wohnflaecheM2, vermietet));
    setz("capital.allProperties.rent", summe((im) => im.kaltmieteIst));
    setz("capital.otherEstates", summe((im) => im.marktwert));
    const immoKredite = kredite.filter(istImmoKredit);
    setz("capital.allProperties.residualDebt.sum", immoKredite.reduce((s, k) => s + parseFinanzNum(k.restschuld), 0));
    setz("capital.allProperties.amortBurden.sum", immoKredite.reduce((s, k) => s + parseFinanzNum(k.rate), 0));
  }
  // Ohne Einzelaufstellung zählt der Wert aus den Vermögenswerten.
  else setz("capital.otherEstates", vermoegen("Immobilien"));
  // Raten- und Leasingkredite: drei Felder; was darüber hinausgeht, steht im Hinweis.
  const sonstige = kredite.filter((k) => !istImmoKredit(k) && (parseFinanzNum(k?.rate) || parseFinanzNum(k?.restschuld)));
  sonstige.slice(0, 3).forEach((k, i) => {
    setz(`capital.credits${i + 1}.residualDebt`, parseFinanzNum(k.restschuld));
    setz(`capital.credits${i + 1}.burden`, parseFinanzNum(k.rate));
    if (text(k.laufzeitEnde)) f.texte[`capital.credits${i + 1}.until`] = text(k.laufzeitEnde);
  });
  if (sonstige.length > 3) {
    f.texte["capital.creditsDesc"] = sonstige.slice(3)
      .map((k) => `${text(k.art) || "Kredit"}: Rate ${betrag(parseFinanzNum(k.rate))} €, Restschuld ${betrag(parseFinanzNum(k.restschuld))} €`)
      .join("; ");
  }

  // Vorhaben: vermietete Eigentumswohnung aus dem Bestand
  f.auswahl["venture.reason"] = "KaufBest";
  f.auswahl["estate.combiType"] = "Wohnung";
  f.optionen["estate.utilization"] = "fremd";
  f.auswahl["venture.partner"] = !mitP2 ? "Nein"
    : /lebenspartnerschaft/i.test(text(sa.familienstand)) ? "EingLeben"
    : hatGueterstand(sa.familienstand) ? "Ehepartner" : "Partner";
  if (objekt) {
    if (objekt.strasse) f.texte["estate.street"] = objekt.strasse;
    if (objekt.plz) f.texte["estate.zip"] = objekt.plz;
    if (objekt.ort) f.texte["estate.city"] = objekt.ort;
    if (objekt.baujahr) f.texte["estate.yearOfConstruction"] = String(objekt.baujahr);
    if (objekt.wohnflaeche) {
      const qm = objekt.wohnflaeche.toLocaleString("de-DE", { maximumFractionDigits: 2 });
      f.texte["estate.areaTotal"] = qm;
      f.texte["estate.areaRented"] = qm;
    }
    setz("venture.priceBuilding", objekt.kaufpreis || 0);
  }
  return f;
}

/** Die Länderlisten stehen in der Vorlage selbst; so bleiben sie mit ihr gleich. */
/** Code und Anzeigetext einer Auswahlliste. pdf-lib liefert nur die Anzeige, die Paare stehen roh in /Opt. */
function optionsPaare(form: ReturnType<PDFDocument["getForm"]>, name: string): { code: string; label: string }[] {
  const opt = form.getDropdown(name).acroField.dict.lookup(PDFName.of("Opt"));
  const paare: { code: string; label: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf-lib-Rohobjekte
  for (const eintrag of ((opt as any)?.asArray?.() ?? []) as any[]) {
    const p = eintrag?.asArray?.();
    if (p?.length === 2) paare.push({ code: p[0].decodeText(), label: p[1].decodeText() });
  }
  return paare;
}

function laenderAusVorlage(form: ReturnType<PDFDocument["getForm"]>): Laenderlisten {
  return { geburtsland: optionsPaare(form, "mainApplicant.birthCountry"), staatsangehoerigkeit: optionsPaare(form, "mainApplicant.nationality") };
}

/** Füllt die Vorlage; `vorlage` sind ihre Bytes. Felder, die es nicht gibt, fallen still weg. */
export async function fuelleFinanzierungsanfrage(vorlage: ArrayBuffer | Uint8Array, sa: Roh, objekt: AnfrageObjekt | null): Promise<Uint8Array> {
  const doc = await PDFDocument.load(vorlage);
  const form = doc.getForm();
  const felder = anfrageFelder(sa, objekt, laenderAusVorlage(form));
  const versuche = (aktion: () => void) => { try { aktion(); } catch (err) { console.warn("[Finanzierungsanfrage]", err); } };
  for (const [name, wert] of Object.entries(felder.texte)) versuche(() => form.getTextField(name).setText(wert));
  /*
   * Auswahllisten: Sichtbar sein soll der Text („verheiratet“), gespeichert
   * der Code („verheirt“), den Europace beim Einlesen erwartet. Deshalb erst
   * mit dem Text zeichnen und danach nur den Wert auf den Code setzen.
   */
  const codes: [string, string][] = [];
  for (const [name, code] of Object.entries(felder.auswahl)) {
    versuche(() => {
      const label = optionsPaare(form, name).find((o) => o.code === code)?.label;
      if (!label) return;
      form.getDropdown(name).select(label);
      codes.push([name, code]);
    });
  }
  for (const [name, option] of Object.entries(felder.optionen)) versuche(() => form.getRadioGroup(name).select(option));
  for (const name of felder.haken) versuche(() => form.getCheckBox(name).check());
  form.updateFieldAppearances();
  // Direkt in /V: pdf-lib prüft setValues gegen die Anzeigetexte.
  for (const [name, code] of codes) form.getDropdown(name).acroField.dict.set(PDFName.of("V"), PDFString.of(code));
  return doc.save({ updateFieldAppearances: false });
}

/** Lädt die Vorlage und gibt das gefüllte PDF zurück. */
export async function erzeugeFinanzierungsanfrage(sa: Roh, objekt: AnfrageObjekt | null): Promise<Uint8Array> {
  const antwort = await fetch(FINANZIERUNGSANFRAGE_VORLAGE);
  if (!antwort.ok) throw new Error(`Vorlage nicht gefunden (${antwort.status})`);
  return fuelleFinanzierungsanfrage(await antwort.arrayBuffer(), sa, objekt);
}
