# -*- coding: utf-8 -*-
"""Erzeugt public/dokumente/selbstauskunft-formular.pdf neu.

Ausfuehren aus dem Projektstamm:  python3 scripts/selbstauskunft-formular-pdf.py
Englische Fassung (seit 25.09.2026, Plan Kundensprache Etappe 4):
                                  python3 scripts/selbstauskunft-formular-pdf.py en
  -> public/dokumente/selbstauskunft-formular-en.pdf
Benoetigt: reportlab (Pflicht) und pikepdf oder pypdf (optional, setzt die
digitalen Signaturfelder fuer Person 1 und 2 auf Seite 7; ohne beide entsteht
die PDF ohne diese beiden Felder).

Die englische Fassung hat dieselben Feldnamen und dieselbe Seitenaufteilung,
nur die Beschriftungen sind englisch. Die Erklaerung auf Seite 7 steht dort
zweisprachig, Deutsch zuerst und massgeblich, mit Vorrangklausel. Ihr
Wortlaut ist derselbe wie in src/lib/selbstauskunftSprache.ts.

Die fertige Datei ist ein statischer Bestandteil der App: Sie wird als
Anhang der Mail "selbstauskunft-formular-pdf" verschickt und ihre
Feldnamen werden beim Hochladen von src/lib/saPdfFormular.ts ausgelesen.
FELDNAMEN DESHALB NICHT UMBENENNEN, ohne saPdfFormular.ts anzupassen.

Seit 28.09.2026: Kreditart, Restschuld per, Zinsart, Sondertilgung und
Kreditnehmer je Kredit, eigene Kredit- und Immobilienfelder fuer Person 2
(p2kredit…, p2kreditdetail…, p2im…) und je Person „Immobilien schuldenfrei“.
Die aelteren Feldnamen sind unveraendert, alte ausgefuellte Dateien bleiben
damit lesbar.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
import sys

SPRACHE = "en" if len(sys.argv) > 1 and sys.argv[1].lower().startswith("en") else "de"

# Die englischen Beschriftungen, nach dem deutschen Text. Ohne Eintrag bleibt
# der deutsche Text stehen; `t` ist deshalb auf Deutsch ohne Wirkung.
EN = {
    "Persönliche Angaben": "Personal details",
    "Beschäftigung & Einnahmen": "Employment & income",
    "Monatliche Ausgaben": "Monthly expenses",
    "Kredit-Details & Vermögen": "Loan details & assets",
    "Immobilienvermögen 1/2": "Real estate 1/2",
    "Immobilienvermögen 2/2": "Real estate 2/2",
    "Sonstige Angaben & Unterschrift": "Other details & signature",
    "Bitte vollständig und gut leserlich in DRUCKBUCHSTABEN ausfüllen.": "Please complete in full and legibly in BLOCK CAPITALS.",
    "Sie können dieses PDF auch direkt am Computer ausfüllen und anschließend drucken.": "You can also fill in this PDF directly on your computer and then print it.",
    "Beträge bitte monatlich in Euro angeben. Nicht zutreffende Felder einfach frei lassen.": "Please state amounts per month in euros. Simply leave fields blank if they do not apply.",
    "Person 1": "Person 1",
    "Person 2": "Person 2",
    "A · PERSÖNLICHE ANGABEN": "A · PERSONAL DETAILS",
    "Anrede (Herr/Frau/Divers)": "Title (Mr/Ms/Mx)",
    "Titel": "Academic title",
    "Vorname(n) laut Ausweis": "First name(s) as in passport or ID",
    "Nachname": "Surname",
    "Geburtsname (falls abweichend)": "Name at birth (if different)",
    "Geburtsdatum": "Date of birth (DD.MM.YYYY)",
    "Steuer-Identifikationsnummer": "German tax ID (Steuer-ID)",
    "Staatsangehörigkeit": "Nationality",
    "Familienstand": "Marital status",
    "Wohnhaft an Anschrift seit": "Resident at this address since",
    "Straße und Hausnummer": "Street and house number",
    "PLZ": "Postcode",
    "Ort": "Town",
    "Telefon": "Telephone",
    "Mobilnummer": "Mobile number",
    "E-Mail-Adresse": "Email address",
    "Steuerklasse (1 bis 6)": "German tax class (1 to 6)",
    "Kirchensteuerpflicht": "Liable for church tax",
    "Güterstand bei Verheirateten (Zugewinngemeinschaft / Gütertrennung / Gütergemeinschaft)": "Matrimonial property regime if married (community of accrued gains / separation of property / community of property)",
    "Kinder": "Children",
    "Nr.": "No.",
    "Name des Kindes": "Name of child",
    "lebt im Haushalt? (ja/nein)": "lives in household? (yes/no)",
    "B · BESCHÄFTIGUNG": "B · EMPLOYMENT",
    "Beschäftigungsart (angestellt / selbstständig / Hausfrau bzw. Hausmann)": "Type of employment (employed / self-employed / homemaker)",
    "Branche": "Industry",
    "Firma / Arbeitgeber": "Company / employer",
    "Berufsbezeichnung": "Job title",
    "Angestellt bzw. selbstständig seit": "Employed or self-employed since",
    "Probezeit?": "Probation period?",
    "Arbeitsverhältnis (unbefristet/befristet)": "Employment (permanent/fixed-term)",
    "Falls befristet: befristet bis": "If fixed-term: until",
    "Anzahl Mitarbeiter (nur Selbstständige)": "Number of employees (self-employed only)",
    "Brutto-Jahresgehalt in EUR": "Gross annual salary in EUR",
    "Monatsgehälter pro Jahr (12/13/14)": "Monthly salaries per year (12/13/14)",
    "Zu versteuerndes Jahreseinkommen in EUR (freiwillig)": "Taxable annual income in EUR (optional)",
    "Sie finden den Wert in Ihrem letzten Einkommensteuerbescheid in der Zeile „zu versteuerndes Einkommen“.": "You will find this figure in your most recent income tax assessment notice, in the line “zu versteuerndes Einkommen” (taxable income).",
    "Bei Zusammenveranlagung tragen Sie bitte das gemeinsame zu versteuernde Einkommen laut Steuerbescheid bei Person 1 ein.": "If you are assessed jointly, please enter the joint taxable income as stated in your tax assessment notice under Person 1.",
    "Bankverbindungen": "Bank accounts",
    "Kontoart (Giro/Spar/Tagesgeld/Depot)": "Account type (current/savings/instant/securities)",
    "Institut": "Bank",
    "IBAN": "IBAN",
    "C · MONATLICHE EINNAHMEN (alle Beträge netto in EUR pro Monat)": "C · MONTHLY INCOME (all amounts net in EUR per month)",
    "Netto-Gehalt": "Net salary",
    "Einkünfte aus Gewerbebetrieb (netto)": "Income from business (net)",
    "Miet-/Pachteinnahmen (kalt)": "Rental income (net cold rent)",
    "Zinsen / Dividenden": "Interest / dividends",
    "Rente / Pension": "Pension",
    "Kindergeld (gesamt)": "Child benefit (total)",
    "Sonstige Einkünfte (z.B. Nebenjob)": "Other income (e.g. second job)",
    "Wofür?": "For what?",
    "D · MONATLICHE AUSGABEN (alle Beträge in EUR pro Monat)": "D · MONTHLY EXPENSES (all amounts in EUR per month)",
    "Wohnsituation (Miete/Eigentum/mietfrei)": "Housing (renting/owner/rent-free)",
    "Kaltmiete (ohne Nebenkosten)": "Net cold rent (excluding utilities)",
    "Wohnnebenkosten (Strom, Heizung usw.)": "Utilities (electricity, heating etc.)",
    "Lebenshaltungskosten": "Living costs",
    "Private Krankenversicherung": "Private health insurance",
    "Unterhaltszahlungen an andere": "Maintenance payments to others",
    "Anzahl Fahrzeuge im Haushalt": "Number of vehicles in household",
    "KFZ-Kosten gesamt (Versicherung + Sprit)": "Total vehicle costs (insurance + fuel)",
    "Berufsunfähigkeitsversicherung": "Occupational disability insurance",
    "Riester-Vertrag": "Riester pension contract",
    "Sonstige Altersvorsorge": "Other retirement provision",
    "Weitere Versicherungen (gesamt)": "Other insurance (total)",
    "Sonstige Ausgaben": "Other expenses",
    "E · VERBINDLICHKEITEN / KREDITE (alle laufenden Kredite beider Personen)": "E · LIABILITIES / LOANS (all current loans of both persons)",
    "Bank / Darlehensgeber": "Bank / lender",
    "Rate mtl. EUR": "Monthly EUR",
    "Restschuld EUR": "Remaining debt EUR",
    "Laufzeit bis": "Term until",
    "Art des Kredits": "Type of loan",
    "Bezeichnung": "Description",
    "Restschuld per": "Debt as of",
    "Details zu jedem Kredit (Zinssatz, Zinsart, Zinsbindung, Sondertilgung, Verwendungszweck, Kreditnehmer) bitte auf der nächsten Seite in derselben Nummerierung angeben.": "Please give details of each loan (interest rate, type of interest, fixed-interest period, special repayment, purpose, borrower) on the next page using the same numbering.",
    "E · KREDIT-DETAILS (gleiche Nummer wie auf Seite 3)": "E · LOAN DETAILS (same number as on page 3)",
    "Ursprungskredit EUR": "Original loan EUR",
    "Zinssatz %": "Interest %",
    "Vertragsbeginn": "Start of contract",
    "Zinsbindung bis": "Fixed until",
    "Verwendungszweck": "Purpose",
    "Zinsart": "Interest type",
    "Sondertilgung": "Special repayment",
    "Kreditnehmer": "Borrower",
    "Immobilie Nr.": "Property no.",
    "Immobilien schuldenfrei (Angabe des Antragstellers)": "Real estate free of debt (applicant's statement)",
    "Bei weiteren Immobilien bitte ein zusätzliches Blatt in gleicher Form beilegen.": "If you own further properties, please attach an additional sheet in the same format.",
    "Bürgschaften": "Guarantees",
    "Art der Bürgschaft (wofür übernommen?)": "Type of guarantee (given for what?)",
    "Betrag EUR": "Amount EUR",
    "F · VERMÖGENSWERTE (beide Personen, aktueller Stand)": "F · ASSETS (both persons, current status)",
    "Art (Sparguthaben, Depot, Bausparer ...)": "Type (savings, securities, building savings ...)",
    "Institut / Beschreibung": "Institution / description",
    "Immobilien bitte NICHT hier eintragen, sondern auf den folgenden Seiten unter G · Immobilienvermögen.": "Please do NOT enter real estate here, but on the following pages under G · Real estate.",
    "Eigentümer": "Owner",
    "Art (EFH / ETW / MFH ...)": "Type (house / apartment / multi-family ...)",
    "Baujahr": "Year of construction",
    "Adresse (Straße, Hausnummer, PLZ, Ort)": "Address (street, house number, postcode, town)",
    "Grundstück in m²": "Plot in m²",
    "Wohnfläche in m²": "Living space in m²",
    "Nutzung (eigen / vermietet)": "Use (own use / let)",
    "Marktwert EUR": "Market value EUR",
    "Kaltmiete aktuell EUR/Monat": "Current net cold rent EUR/month",
    "Kaltmiete zukünftig (optional)": "Future net cold rent (optional)",
    "Vermietungsdetails (z.B. teilvermietet: welche Einheit, wie groß, für wie viel)": "Letting details (e.g. partly let: which unit, how large, for how much)",
    "G · IMMOBILIENVERMÖGEN (je vorhandener Immobilie einen Block ausfüllen)": "G · REAL ESTATE (complete one block per property)",
    "G · IMMOBILIENVERMÖGEN (Fortsetzung)": "G · REAL ESTATE (continued)",
    "H · SONSTIGE ANGABEN": "H · OTHER DETAILS",
    "Bestehen oder bestanden in den letzten zehn Jahren Mahnverfahren, Zahlungsklagen, Zwangsvollstreckungen,": "In the last ten years, have there been any dunning proceedings, actions for payment, enforcement measures,",
    "Verfahren zur Abgabe der eidesstattlichen Versicherung oder Insolvenzverfahren?": "proceedings for a statutory declaration of assets or insolvency proceedings?",
    "Schufa-Score bekannt?": "SCHUFA score known?",
    "Falls ja: Score": "If yes: score",
    "Hinweise / Erklärungen / ergänzende Angaben": "Remarks / explanations / additional details",
    "ERKLÄRUNG": "DECLARATION (DE / EN)",
    "Ort, Datum": "Place, date",
    "ja": "yes",
    "nein": "no",
}

def t(text):
    """Die Beschriftung in der Sprache dieses Laufs."""
    return EN.get(text, text) if SPRACHE == "en" else text

# Auswahlfelder (seit 28.09.2026). Die Texte je Sprache muessen zu
# AUSWAHL_TEXTE in src/lib/saPdfFormular.ts passen, dort wird der Text beim
# Auslesen wieder zum gespeicherten Schluessel. Paare: Deutsch, Englisch.
KREDITARTEN = [
    ("Immobilienkredit", "Mortgage loan"),
    ("Bauspardarlehen", "Building society loan"),
    ("KFZ-Finanzierung", "Car loan"),
    ("Leasing (Fahrzeug)", "Vehicle leasing"),
    ("Ratenkredit", "Instalment loan"),
    ("Dispokredit", "Overdraft"),
    ("Kreditkarte", "Credit card"),
    ("Privatdarlehen", "Private loan"),
    ("Studienkredit", "Student loan"),
    ("Sonstiges", "Other"),
]
ZINSARTEN = [("fest", "fixed"), ("variabel", "variable")]
SONDERTILGUNG = [("ja", "yes"), ("nein", "no"), ("unbekannt", "unknown")]
KREDITNEHMER = [("Person 1", "Person 1"), ("Person 2", "Person 2"), ("gemeinsam", "jointly")]

def optionen(paare):
    """Die Auswahl in der Sprache dieses Laufs, vorn ein leerer Eintrag.

    Leer ist ein Leerzeichen: reportlab bricht bei einem leeren Startwert ab,
    und beim Auslesen wird ohnehin getrimmt."""
    return [LEER] + [en if SPRACHE == "en" else de for de, en in paare]

LEER = " "

# Die Erklaerung, derselbe Wortlaut wie SA_ERKLAERUNG und SA_SCHUFA_KLAUSEL in
# src/lib/selbstauskunftSprache.ts, dazu die Vorrangklausel aus zweisprachig.ts.
ERKLAERUNG_EN = (
    "I/We hereby confirm that the information provided is correct and declare that no composition or bankruptcy proceedings "
    "(Vergleichs- oder Konkursverfahren) have so far been applied for or opened in respect of my (our) assets, that I/we have not made "
    "a statutory declaration of assets (eidesstattliche Versicherung), and that no arrest warrant to enforce such a declaration has been "
    "issued against me (us). The signatory/signatories authorise the financing bank, in accordance with Section 18 of the German Banking "
    "Act (Kreditwesengesetz), to obtain the bank references required for the financing."
)
SCHUFA_EN = (
    "The bank is entitled to transmit data of the borrower and of any co-debtors or guarantors concerning the taking out (loan amount, "
    "term, start of repayments) and the performance of a loan to SCHUFA (Schutzgemeinschaft für allgemeine Kreditsicherung, the German "
    "credit reference agency) for storage, and to obtain information about me (us) from SCHUFA."
)
VORRANG = (
    "Dieses Dokument ist in deutscher und englischer Sprache abgefasst. Im Falle von Abweichungen ist die deutsche Fassung maßgeblich. "
    "This document has been drawn up in German and English. In case of discrepancies, the German version shall prevail."
)

# Hausfarben aus src/lib/pdfBranding.ts (BRAND), damit die PDF wie die
# uebrigen Dokumente des Projekts aussieht.
NAVY = HexColor("#0F1621")      # BRAND.primary
BLAU = HexColor("#0A6EDB")      # BRAND.accent
GRAU = HexColor("#7A8594")      # BRAND.muted
LINIE = HexColor("#E3E8EE")     # BRAND.separator
HELL = HexColor("#F4F7FA")      # BRAND.light
WARN_BG = HexColor("#F4F7FA")
WARN_RAND = HexColor("#0A6EDB")
WARN_TEXT = HexColor("#0F1621")
LOGO_PFAD = "public/images/moreimmo-logo.png"
FIRMENZEILE = "MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach"
GESAMTSEITEN = 7

W, H = A4
M = 14 * mm
CW = W - 2 * M

pfad = "public/dokumente/selbstauskunft-formular-en.pdf" if SPRACHE == "en" else "public/dokumente/selbstauskunft-formular.pdf"
c = pdfcanvas.Canvas(pfad, pagesize=A4)
c.setTitle("Self-disclosure MOREImmo (fillable)" if SPRACHE == "en" else "Selbstauskunft MOREImmo (ausfüllbar)")
c.setAuthor("MOREImmo")

seite = [0]

def y_(oben_mm):
    """Abstand von der Oberkante in mm -> PDF-Koordinate (Unterkante)."""
    return H - oben_mm * mm

def kopf(titelzusatz=""):
    """Kopf wie addBrandedHeader: Logo links, Titel rechts gesperrt, Haarlinie."""
    seite[0] += 1
    try:
        # Seitenverhaeltnis der Datei ist 1920 zu 575, also 20 x 6 mm.
        c.drawImage(LOGO_PFAD, M, y_(15.2), width=20 * mm, height=6 * mm,
                    preserveAspectRatio=True, mask="auto")
    except Exception:
        c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 12)
        c.drawString(M, y_(13), "MOREImmo")
    c.setFillColor(GRAU)
    c.setFont("Helvetica", 7)
    c.setFont("Helvetica", 7)
    titel = ("SELF-DISCLOSURE" if SPRACHE == "en" else "SELBSTAUSKUNFT") + (" \u00b7 " + t(titelzusatz).upper() if titelzusatz else "")
    gesperrt = " ".join(titel)  # einfache Sperrung ohne setCharSpace
    c.drawRightString(W - M, y_(12.5), gesperrt)
    c.setStrokeColor(LINIE); c.setLineWidth(0.4)
    c.line(M, y_(16.5), W - M, y_(16.5))

def fuss():
    """Fusszeile wie addBrandedFooter: Haarlinie, Firmenzeile, Seite x / y."""
    c.setStrokeColor(LINIE); c.setLineWidth(0.3)
    c.line(M, 20 * mm, W - M, 20 * mm)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GRAU)
    c.drawString(M, 15 * mm, FIRMENZEILE)
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(NAVY)
    c.drawRightString(W - M, 15 * mm, f"{seite[0]} / {GESAMTSEITEN}")

def abschnitt(oben, text):
    """Abschnitt wie brandedSectionTitle: Akzentbalken, Versalien, Haarlinie."""
    c.setFillColor(BLAU)
    c.rect(M, y_(oben + 5.2), 2.2 * mm, 6.4 * mm, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(M + 6 * mm, y_(oben + 3.6), t(text))
    c.setStrokeColor(LINIE); c.setLineWidth(0.3)
    c.line(M, y_(oben + 6.8), W - M, y_(oben + 6.8))
    return oben + 10

def feld(x_mm, oben, w_mm, label, name, hoehe=6.2, schrift=9, tooltip="", mehrzeilig=False):
    """Beschriftung klein oben, darunter ein umrandetes Formularfeld.

    Hohe Felder muessen mehrzeilig sein: Ein einzeiliges Feld zentriert den
    Text senkrecht, die Eingabe begann dann mitten im Kasten statt links oben.
    """
    label = t(label)
    if label:
        c.setFillColor(GRAU)
        c.setFont("Helvetica", 6.4)
        c.drawString(x_mm * mm, y_(oben + 2.4), label)
    c.acroForm.textfield(
        name=name, tooltip=t(tooltip) or label,
        x=x_mm * mm, y=y_(oben + 3.0 + hoehe), width=w_mm * mm, height=hoehe * mm,
        borderWidth=0.7, borderColor=LINIE, fillColor=white, textColor=black,
        fontName="Helvetica", fontSize=schrift, relative=False,
        fieldFlags="multiline" if mehrzeilig else "",
    )
    return oben + 3.0 + hoehe + 1.6

def janein(x_mm, oben, label, name):
    c.setFillColor(GRAU); c.setFont("Helvetica", 6.4)
    c.drawString(x_mm * mm, y_(oben + 2.4), t(label))
    yb = y_(oben + 7.6)
    # Die Feldnamen bleiben `_ja` und `_nein`, nur die Beschriftung wechselt.
    for i, (wert, txt) in enumerate([("ja", t("ja")), ("nein", t("nein"))]):
        bx = (x_mm + i * 14) * mm
        c.acroForm.checkbox(name=f"{name}_{wert}", x=bx, y=yb, size=4 * mm,
                            borderWidth=0.8, borderColor=LINIE, fillColor=white)
        c.setFillColor(NAVY); c.setFont("Helvetica", 8)
        c.drawString(bx + 5 * mm, yb + 1 * mm, txt)
    return oben + 10.6

def hinweisbox(oben):
    """Hinweiskasten im Hausstil: helle Flaeche mit Akzentbalken links."""
    hoehe = 19
    c.setFillColor(HELL)
    c.rect(M, y_(oben + hoehe), CW, hoehe * mm, stroke=0, fill=1)
    c.setFillColor(BLAU)
    c.rect(M, y_(oben + hoehe), 2.2 * mm, hoehe * mm, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(M + 6 * mm, y_(oben + 5.5), t("Bitte vollständig und gut leserlich in DRUCKBUCHSTABEN ausfüllen."))
    c.setFillColor(GRAU)
    c.setFont("Helvetica", 8)
    c.drawString(M + 6 * mm, y_(oben + 10), t("Sie können dieses PDF auch direkt am Computer ausfüllen und anschließend drucken."))
    c.drawString(M + 6 * mm, y_(oben + 14), t("Beträge bitte monatlich in Euro angeben. Nicht zutreffende Felder einfach frei lassen."))
    return oben + hoehe + 3

SP1 = 14   # linke Spalte (mm vom linken Blattrand)
SPW = 87   # Spaltenbreite
SP2 = 14 + SPW + 7

def personenkoepfe(oben):
    for x, t_ in ((SP1, "Person 1"), (SP2, "Person 2")):
        c.setFillColor(BLAU)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x * mm, y_(oben + 3), t_)
    return oben + 5

def doppel(oben, label, key, hoehe=6.2):
    o2 = feld(SP1, oben, SPW, label, f"p1_{key}", hoehe)
    feld(SP2, oben, SPW, label, f"p2_{key}", hoehe)
    return o2

def doppel_halb(oben, l1, k1, l2, k2):
    halb = (SPW - 4) / 2
    o2 = feld(SP1, oben, halb, l1, f"p1_{k1}")
    feld(SP1 + halb + 4, oben, halb, l2, f"p1_{k2}")
    feld(SP2, oben, halb, l1, f"p2_{k1}")
    feld(SP2 + halb + 4, oben, halb, l2, f"p2_{k2}")
    return o2

def tab_kopf(oben, spalten):
    c.setFillColor(HELL); c.setStrokeColor(LINIE); c.setLineWidth(0.5)
    c.rect(M, y_(oben + 5), CW, 5 * mm, stroke=1, fill=1)
    x = 14
    c.setFillColor(NAVY)
    for titel, breite, *_ in spalten:
        # Schmale Spalten: die Schrift schrumpft, bis der Titel hineinpasst.
        groesse = 7
        while groesse > 5 and stringWidth(t(titel), "Helvetica-Bold", groesse) > (breite - 1.6) * mm:
            groesse -= 0.25
        c.setFont("Helvetica-Bold", groesse)
        c.drawString((x + 1.2) * mm, y_(oben + 3.6), t(titel))
        x += breite
    return oben + 5.6

def tab_zeile(oben, spalten, name_praefix, nr=None, hoehe=6.0):
    """Eine Tabellenzeile.

    Eine Spalte ist (Titel, Breite) oder (Titel, Breite, Feldname[, Auswahl]).
    Ohne Feldnamen heisst das Feld nach der Spaltennummer, so wie seit jeher.
    Mit Auswahl entsteht ein Auswahlfeld statt eines Textfelds.
    """
    x = 14
    for i, (titel, breite, *rest) in enumerate(spalten):
        name = f"{name_praefix}_{rest[0] if rest else i}"
        auswahl = rest[1] if len(rest) > 1 else None
        if i == 0 and nr is not None:
            c.setFillColor(GRAU); c.setFont("Helvetica", 8)
            c.drawString((x + 1.5) * mm, y_(oben + 4.3), str(nr))
        elif auswahl:
            c.acroForm.choice(
                name=name, tooltip=t(titel), value=LEER, options=optionen(auswahl),
                x=(x + 0.5) * mm, y=y_(oben + hoehe), width=(breite - 1) * mm, height=(hoehe - 0.6) * mm,
                borderWidth=0.5, borderColor=LINIE, fillColor=white, textColor=black,
                fontName="Helvetica", fontSize=7,
            )
        else:
            c.acroForm.textfield(
                name=name, tooltip=t(titel),
                x=(x + 0.5) * mm, y=y_(oben + hoehe), width=(breite - 1) * mm, height=(hoehe - 0.6) * mm,
                borderWidth=0.5, borderColor=LINIE, fillColor=white, textColor=black,
                fontName="Helvetica", fontSize=8,
            )
        x += breite
    return oben + hoehe + 0.6

def unterkopf(oben, text):
    """Blaue Zwischenzeile wie „Bürgschaften“ oder „Person 2“."""
    c.setFillColor(BLAU); c.setFont("Helvetica-Bold", 9)
    c.drawString(M, y_(oben + 3.4), t(text))
    return oben + 5

def hinweiszeile(oben, text):
    """Graue Hinweiszeile unter einer Tabelle, schrumpft auf die Blattbreite."""
    groesse = 7
    while groesse > 5.5 and stringWidth(t(text), "Helvetica", groesse) > CW:
        groesse -= 0.25
    c.setFillColor(GRAU); c.setFont("Helvetica", groesse)
    c.drawString(M, y_(oben + 3), t(text))
    return oben + 5

# ═══════════ SEITE 1: Persönliche Angaben ═══════════
kopf("Persönliche Angaben")
o = 21
o = hinweisbox(o)
o = abschnitt(o, "A · PERSÖNLICHE ANGABEN")
o = personenkoepfe(o)
o = doppel_halb(o, "Anrede (Herr/Frau/Divers)", "anrede", "Titel", "titel")
o = doppel(o, "Vorname(n) laut Ausweis", "vorname")
o = doppel(o, "Nachname", "nachname")
o = doppel_halb(o, "Geburtsname (falls abweichend)", "geburtsname", "Geburtsdatum", "geburtsdatum")
o = doppel_halb(o, "Steuer-Identifikationsnummer", "steuerid", "Staatsangehörigkeit", "staat")
o = doppel_halb(o, "Familienstand", "familienstand", "Wohnhaft an Anschrift seit", "wohnhaft_seit")
o = doppel(o, "Straße und Hausnummer", "strasse")
o = doppel_halb(o, "PLZ", "plz", "Ort", "ort")
o = doppel_halb(o, "Telefon", "telefon", "Mobilnummer", "mobil")
o = doppel(o, "E-Mail-Adresse", "email")
halb = (SPW - 4) / 2
feld(SP1, o, halb, "Steuerklasse (1 bis 6)", "p1_steuerklasse")
janein(SP1 + halb + 4, o, "Kirchensteuerpflicht", "p1_kirche")
feld(SP2, o, halb, "Steuerklasse (1 bis 6)", "p2_steuerklasse")
o = janein(SP2 + halb + 4, o, "Kirchensteuerpflicht", "p2_kirche")
o = feld(SP1, o, CW / mm, "Güterstand bei Verheirateten (Zugewinngemeinschaft / Gütertrennung / Gütergemeinschaft)", "gueterstand")
c.setFillColor(BLAU); c.setFont("Helvetica-Bold", 9)
c.drawString(M, y_(o + 3.4), t("Kinder"))
o += 5
kinder_spalten = [("Nr.", 8), ("Name des Kindes", 78), ("Geburtsdatum", 40), ("lebt im Haushalt? (ja/nein)", 56)]
o = tab_kopf(o, kinder_spalten)
for i in range(4):
    o = tab_zeile(o, kinder_spalten, f"kind{i+1}", nr=i + 1)
fuss()
c.showPage()

# ═══════════ SEITE 2: Beschäftigung + Bank + Einnahmen ═══════════
kopf("Beschäftigung & Einnahmen")
o = 21
o = abschnitt(o, "B · BESCHÄFTIGUNG")
o = personenkoepfe(o)
o = doppel(o, "Beschäftigungsart (angestellt / selbstständig / Hausfrau bzw. Hausmann)", "beschart")
o = doppel_halb(o, "Branche", "branche", "Firma / Arbeitgeber", "firma")
o = doppel_halb(o, "Berufsbezeichnung", "beruf", "Angestellt bzw. selbstständig seit", "seit")
halb = (SPW - 4) / 2
janein(SP1, o, "Probezeit?", "p1_probezeit")
feld(SP1 + halb + 4, o, halb, "Arbeitsverhältnis (unbefristet/befristet)", "p1_arbeitsverh")
janein(SP2, o, "Probezeit?", "p2_probezeit")
o = feld(SP2 + halb + 4, o, halb, "Arbeitsverhältnis (unbefristet/befristet)", "p2_arbeitsverh")
o = doppel_halb(o, "Falls befristet: befristet bis", "befristet", "Anzahl Mitarbeiter (nur Selbstständige)", "mitarbeiter")
o = doppel_halb(o, "Brutto-Jahresgehalt in EUR", "brutto", "Monatsgehälter pro Jahr (12/13/14)", "gehaelter")
# Seit 05.10.2026, freiwillig. Bei Zusammenveranlagung nur bei Person 1, wie im
# Online-Formular; saPdfFormular.ts liest p1_zve und p2_zve als zvEJahr.
o = doppel(o, "Zu versteuerndes Jahreseinkommen in EUR (freiwillig)", "zve")
o = hinweiszeile(o, "Sie finden den Wert in Ihrem letzten Einkommensteuerbescheid in der Zeile „zu versteuerndes Einkommen“.")
o = hinweiszeile(o, "Bei Zusammenveranlagung tragen Sie bitte das gemeinsame zu versteuernde Einkommen laut Steuerbescheid bei Person 1 ein.")

c.setFillColor(BLAU); c.setFont("Helvetica-Bold", 9)
c.drawString(M, y_(o + 3.4), t("Bankverbindungen"))
o += 5
bank_spalten = [("Nr.", 8), ("Kontoart (Giro/Spar/Tagesgeld/Depot)", 52), ("Institut", 52), ("IBAN", 70)]
o = tab_kopf(o, bank_spalten)
for i in range(3):
    o = tab_zeile(o, bank_spalten, f"bank{i+1}", nr=i + 1)
o += 2

o = abschnitt(o, "C · MONATLICHE EINNAHMEN (alle Beträge netto in EUR pro Monat)")
o = personenkoepfe(o)
o = doppel_halb(o, "Netto-Gehalt", "netto", "Einkünfte aus Gewerbebetrieb (netto)", "gewerbe")
o = doppel_halb(o, "Miet-/Pachteinnahmen (kalt)", "miete_ein", "Zinsen / Dividenden", "zinsen")
o = doppel_halb(o, "Rente / Pension", "rente", "Kindergeld (gesamt)", "kindergeld")
o = doppel_halb(o, "Sonstige Einkünfte (z.B. Nebenjob)", "sonst_ein", "Wofür?", "sonst_ein_wofuer")
fuss()
c.showPage()

# ═══════════ SEITE 3: Ausgaben ═══════════
kopf("Monatliche Ausgaben")
o = 21
o = abschnitt(o, "D · MONATLICHE AUSGABEN (alle Beträge in EUR pro Monat)")
o = personenkoepfe(o)
o = doppel_halb(o, "Wohnsituation (Miete/Eigentum/mietfrei)", "wohnsituation", "Kaltmiete (ohne Nebenkosten)", "kaltmiete")
o = doppel_halb(o, "Wohnnebenkosten (Strom, Heizung usw.)", "nebenkosten", "Lebenshaltungskosten", "lebenshaltung")
o = doppel_halb(o, "Private Krankenversicherung", "pkv", "Unterhaltszahlungen an andere", "unterhalt")
o = doppel_halb(o, "Anzahl Fahrzeuge im Haushalt", "kfz_anzahl", "KFZ-Kosten gesamt (Versicherung + Sprit)", "kfz_kosten")
o = doppel_halb(o, "Berufsunfähigkeitsversicherung", "bu", "Riester-Vertrag", "riester")
o = doppel_halb(o, "Sonstige Altersvorsorge", "av", "Weitere Versicherungen (gesamt)", "vers_weitere")
o = doppel_halb(o, "Sonstige Ausgaben", "sonst_aus", "Wofür?", "sonst_aus_wofuer")
o += 2

o = abschnitt(o, "E · VERBINDLICHKEITEN / KREDITE (alle laufenden Kredite beider Personen)")
# Die Feldnamen _1 bis _5 bleiben dieselben wie vor dem 28.09.2026 (Art,
# Bank, Rate, Restschuld, Laufzeit), damit alte Dateien lesbar bleiben.
# Person 2 hat seitdem eigene Zeilen (p2kredit…) statt des Vorsatzes "P2:".
kredit_spalten = [
    ("Nr.", 7), ("Art des Kredits", 30, "kategorie", KREDITARTEN), ("Bezeichnung", 30, "1"),
    ("Bank / Darlehensgeber", 30, "2"), ("Rate mtl. EUR", 20, "3"), ("Restschuld EUR", 26, "4"),
    ("Restschuld per", 20, "restschuld_per"), ("Laufzeit bis", 19, "5"),
]
KREDITE_P1, KREDITE_P2 = 10, 5
o = unterkopf(o, "Person 1")
o = tab_kopf(o, kredit_spalten)
for i in range(KREDITE_P1):
    o = tab_zeile(o, kredit_spalten, f"kredit{i+1}", nr=i + 1)
o += 2
o = unterkopf(o, "Person 2")
o = tab_kopf(o, kredit_spalten)
for i in range(KREDITE_P2):
    o = tab_zeile(o, kredit_spalten, f"p2kredit{i+1}", nr=i + 1)
hinweiszeile(o, "Details zu jedem Kredit (Zinssatz, Zinsart, Zinsbindung, Sondertilgung, Verwendungszweck, Kreditnehmer) bitte auf der nächsten Seite in derselben Nummerierung angeben.")
fuss()
c.showPage()

# ═══════════ SEITE 4: Kreditdetails + Bürgschaften + Vermögen ═══════════
kopf("Kredit-Details & Vermögen")
o = 21
o = abschnitt(o, "E · KREDIT-DETAILS (gleiche Nummer wie auf Seite 3)")
# _1 bis _6 wie vor dem 28.09.2026: Ursprung, Zins, Beginn, Zinsbindung,
# Zweck, Immobilie Nr. Die Immobilien sind 1 bis 4 (Person 1) und 5 bis 6
# (Person 2) nummeriert, so wie die Bloecke auf den Seiten 5 und 6.
detail_spalten = [
    ("Nr.", 7), ("Ursprungskredit EUR", 25.5, "1"), ("Zinssatz %", 14, "2"), ("Zinsart", 15.5, "zinsart", ZINSARTEN),
    ("Vertragsbeginn", 20, "3"), ("Zinsbindung bis", 20, "4"), ("Sondertilgung", 22.5, "sondertilgung", SONDERTILGUNG),
    ("Verwendungszweck", 24, "5"), ("Kreditnehmer", 17, "kreditnehmer", KREDITNEHMER), ("Immobilie Nr.", 16.5, "6"),
]
o = unterkopf(o, "Person 1")
o = tab_kopf(o, detail_spalten)
for i in range(KREDITE_P1):
    o = tab_zeile(o, detail_spalten, f"kreditdetail{i+1}", nr=i + 1)
o += 2
o = unterkopf(o, "Person 2")
o = tab_kopf(o, detail_spalten)
for i in range(KREDITE_P2):
    o = tab_zeile(o, detail_spalten, f"p2kreditdetail{i+1}", nr=i + 1)
o += 2

o = unterkopf(o, "Bürgschaften")
buerg_spalten = [("Nr.", 8), ("Art der Bürgschaft (wofür übernommen?)", 120), ("Betrag EUR", 54)]
o = tab_kopf(o, buerg_spalten)
for i in range(3):
    o = tab_zeile(o, buerg_spalten, f"buerg{i+1}", nr=i + 1)
o += 2

o = abschnitt(o, "F · VERMÖGENSWERTE (beide Personen, aktueller Stand)")
verm_spalten = [("Nr.", 8), ("Art (Sparguthaben, Depot, Bausparer ...)", 64), ("Institut / Beschreibung", 70), ("Betrag EUR", 40)]
o = tab_kopf(o, verm_spalten)
for i in range(8):
    o = tab_zeile(o, verm_spalten, f"verm{i+1}", nr=i + 1)
hinweiszeile(o, "Immobilien bitte NICHT hier eintragen, sondern auf den folgenden Seiten unter G · Immobilienvermögen.")
fuss()
c.showPage()

# ═══════════ SEITE 5 + 6: Immobilienvermögen (4 Objekte) ═══════════
def immobilie(o, nr, person=1, feldnr=None):
    """Ein Block Immobilie. `nr` ist die sichtbare Nummer (1 bis 6), auf die
    „Immobilie Nr.“ in den Kredit-Details verweist. Die Felder heissen bei
    Person 1 im1_… bis im4_…, bei Person 2 p2im1_… und p2im2_…"""
    pr = f"im{nr}" if person == 1 else f"p2im{feldnr}"
    c.setFillColor(BLAU); c.setFont("Helvetica-Bold", 9)
    c.drawString(M, y_(o + 3.4), f"Property {nr} (Person {person})" if SPRACHE == "en" else f"Immobilie {nr} (Person {person})")
    o += 5
    b3 = (CW / mm - 8) / 3
    o2 = feld(SP1, o, b3, "Eigentümer", f"{pr}_eigentuemer")
    feld(SP1 + b3 + 4, o, b3, "Art (EFH / ETW / MFH ...)", f"{pr}_art")
    feld(SP1 + 2 * (b3 + 4), o, b3, "Baujahr", f"{pr}_baujahr")
    o = o2
    o = feld(SP1, o, CW / mm, "Adresse (Straße, Hausnummer, PLZ, Ort)", f"{pr}_adresse")
    o2 = feld(SP1, o, b3, "Grundstück in m²", f"{pr}_grund")
    feld(SP1 + b3 + 4, o, b3, "Wohnfläche in m²", f"{pr}_wohnflaeche")
    feld(SP1 + 2 * (b3 + 4), o, b3, "Nutzung (eigen / vermietet)", f"{pr}_nutzung")
    o = o2
    o2 = feld(SP1, o, b3, "Marktwert EUR", f"{pr}_marktwert")
    feld(SP1 + b3 + 4, o, b3, "Kaltmiete aktuell EUR/Monat", f"{pr}_miete_ist")
    feld(SP1 + 2 * (b3 + 4), o, b3, "Kaltmiete zukünftig (optional)", f"{pr}_miete_zukunft")
    o = o2
    o = feld(SP1, o, CW / mm, "Vermietungsdetails (z.B. teilvermietet: welche Einheit, wie groß, für wie viel)", f"{pr}_details")
    return o + 3

# Seit 28.09.2026 drei Bloecke je Seite: vier fuer Person 1 und zwei eigene
# fuer Person 2 (vorher vier gemeinsame), dazu je Person „schuldenfrei“.
kopf("Immobilienvermögen 1/2")
o = 21
o = abschnitt(o, "G · IMMOBILIENVERMÖGEN (je vorhandener Immobilie einen Block ausfüllen)")
o = immobilie(o, 1)
o = immobilie(o, 2)
o = immobilie(o, 3)
fuss()
c.showPage()

kopf("Immobilienvermögen 2/2")
o = 21
o = abschnitt(o, "G · IMMOBILIENVERMÖGEN (Fortsetzung)")
o = immobilie(o, 4)
o = immobilie(o, 5, person=2, feldnr=1)
o = immobilie(o, 6, person=2, feldnr=2)
o = personenkoepfe(o)
janein(SP1, o, "Immobilien schuldenfrei (Angabe des Antragstellers)", "p1_immo_schuldenfrei")
o = janein(SP2, o, "Immobilien schuldenfrei (Angabe des Antragstellers)", "p2_immo_schuldenfrei")
hinweiszeile(o, "Bei weiteren Immobilien bitte ein zusätzliches Blatt in gleicher Form beilegen.")
fuss()
c.showPage()

# ═══════════ SEITE 7: Sonstige Angaben + Erklärung + Unterschrift ═══════════
kopf("Sonstige Angaben & Unterschrift")
o = 21
o = abschnitt(o, "H · SONSTIGE ANGABEN")
o = personenkoepfe(o)
c.setFillColor(NAVY); c.setFont("Helvetica", 7.5)
c.drawString(M, y_(o + 3), t("Bestehen oder bestanden in den letzten zehn Jahren Mahnverfahren, Zahlungsklagen, Zwangsvollstreckungen,"))
c.drawString(M, y_(o + 6.5), t("Verfahren zur Abgabe der eidesstattlichen Versicherung oder Insolvenzverfahren?"))
o += 9
janein(SP1, o, "Person 1", "p1_mahnverfahren")
o = janein(SP2, o, "Person 2", "p2_mahnverfahren")
halb = (SPW - 4) / 2
janein(SP1, o, "Schufa-Score bekannt?", "p1_schufa")
feld(SP1 + halb + 4, o, halb, "Falls ja: Score", "p1_schufa_score")
janein(SP2, o, "Schufa-Score bekannt?", "p2_schufa")
o = feld(SP2 + halb + 4, o, halb, "Falls ja: Score", "p2_schufa_score")
o = feld(SP1, o, CW / mm, "Hinweise / Erklärungen / ergänzende Angaben", "hinweise", hoehe=22, mehrzeilig=True)
o += 2

o = abschnitt(o, "ERKLÄRUNG")
c.setFillColor(HexColor("#3a4550")); c.setFont("Helvetica", 7)
erkl = [
    "Ich/Wir bestätige/n hiermit die Richtigkeit der gemachten Angaben und versichere/n, dass über mein (unser) Vermögen bisher das Vergleichs- oder",
    "Konkursverfahren nicht beantragt oder eröffnet wurde, dass ich/wir keine eidesstattliche Versicherung abgegeben habe/n und dass kein Haftbefehl zur",
    "Erzwingung der eidesstattlichen Versicherung gegen mich (uns) erlassen wurde. Der/Die Unterzeichner ermächtigen die finanzierende Bank nach",
    "§ 18 Kreditwesengesetz, die zur Finanzierung erforderlichen Bankauskünfte einzuholen.",
    "",
    "Die Bank ist berechtigt, der Schutzgemeinschaft für allgemeine Kreditsicherung (SCHUFA) Daten des Kreditnehmers und etwaiger Mitschuldner oder",
    "Bürgen über die Aufnahme (Kreditbetrag, Laufzeit, Ratenbeginn) und Abwicklung eines Kredits zur Speicherung zu übermitteln sowie Auskünfte über",
    "mich (uns) einzuholen.",
]
if SPRACHE == "en":
    # Auf Englisch ist der Platz knapp: Deutsch in 6,2 pt, Englisch darunter
    # in 6 pt und heller, zuletzt die Vorrangklausel fett.
    c.setFont("Helvetica", 6.2)
    for zeile in erkl:
        if zeile:
            c.drawString(M, y_(o + 3), zeile)
        o += 2.8 if zeile else 1.2
    c.setFillColor(GRAU); c.setFont("Helvetica", 6)
    for absatz in (ERKLAERUNG_EN, SCHUFA_EN):
        for zeile in simpleSplit(absatz, "Helvetica", 6, CW):
            c.drawString(M, y_(o + 3), zeile)
            o += 2.7
        o += 1.0
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 6.2)
    for zeile in simpleSplit(VORRANG, "Helvetica-Bold", 6.2, CW):
        c.drawString(M, y_(o + 3), zeile)
        o += 2.8
    o += 4
else:
    for zeile in erkl:
        c.drawString(M, y_(o + 3), zeile)
        o += 3.4
    o += 8

sig_rects = []
for x, wer in ((SP1, "Person 1"), (SP2, "Person 2")):
    feld(x, o, 38, "Ort, Datum", f"{'p1' if wer.endswith('1') else 'p2'}_ort_datum")
    c.setStrokeColor(NAVY); c.setLineWidth(0.5)
    c.line((x + 44) * mm, y_(o + 9.2), (x + SPW) * mm, y_(o + 9.2))
    c.setFillColor(GRAU); c.setFont("Helvetica", 6.4)
    c.drawString((x + 44) * mm, y_(o + 12), f"Signature {wer.lower()} (handwritten or digital)" if SPRACHE == "en" else f"Unterschrift {wer} (handschriftlich oder digital)")
    # Flaeche oberhalb der Linie fuer das digitale Signaturfeld vormerken.
    sig_rects.append({
        "name": f"unterschrift_{'person1' if wer.endswith('1') else 'person2'}",
        "rect": [float((x + 44) * mm), float(y_(o + 9.0)), float((x + SPW) * mm), float(y_(o + 9.0) + 11 * mm)],
    })
fuss()
c.save()

# Digitale Signaturfelder nachtraeglich einsetzen (reportlab kann keine).
try:
    import pikepdf
    pdf = pikepdf.open(pfad, allow_overwriting_input=True)
    seite7 = pdf.pages[6]
    acro = pdf.Root.AcroForm
    for eintrag in sig_rects:
        annot = pikepdf.Dictionary(
            Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Widget,
            FT=pikepdf.Name.Sig, T=pikepdf.String(eintrag["name"]),
            Rect=pikepdf.Array([round(v, 2) for v in eintrag["rect"]]),
            F=4, P=seite7.obj,
        )
        ind = pdf.make_indirect(annot)
        if "/Annots" in seite7:
            seite7.Annots.append(ind)
        else:
            seite7.Annots = pdf.make_indirect(pikepdf.Array([ind]))
        acro.Fields.append(ind)
    pdf.save(pfad)
    print("Signaturfelder eingesetzt")
except ImportError:
    # Rueckfall ohne pikepdf: dieselben Felder ueber pypdf.
    try:
        from pypdf import PdfReader, PdfWriter
        from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject
        leser = PdfReader(pfad)
        schreiber = PdfWriter(clone_from=leser)
        seite7 = schreiber.pages[6]
        acro = schreiber._root_object["/AcroForm"]
        felder = acro["/Fields"]
        for eintrag in sig_rects:
            annot = DictionaryObject({
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/FT"): NameObject("/Sig"),
                NameObject("/T"): TextStringObject(eintrag["name"]),
                NameObject("/Rect"): ArrayObject([FloatObject(round(v, 2)) for v in eintrag["rect"]]),
                NameObject("/F"): NumberObject(4),
                NameObject("/P"): seite7.indirect_reference,
            })
            ref = schreiber._add_object(annot)
            if "/Annots" in seite7:
                seite7["/Annots"].append(ref)
            else:
                seite7[NameObject("/Annots")] = ArrayObject([ref])
            felder.append(ref)
        with open(pfad, "wb") as ziel:
            schreiber.write(ziel)
        print("Signaturfelder eingesetzt (pypdf)")
    except ImportError:
        print("HINWEIS: pikepdf und pypdf fehlen, PDF ohne digitale Signaturfelder erzeugt")
print("PDF erstellt:", pfad)
