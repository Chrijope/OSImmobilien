/**
 * Seeds localStorage with comprehensive demo data when switching to testaccount role.
 * Called once on role switch; skips if already seeded.
 */

import type { KundeData } from "./kundenStore";

const SEED_FLAG = "mi_demo_seeded_v2";

export function seedTestDemoData() {
  if (localStorage.getItem(SEED_FLAG)) return;

  // ── Kontakte ──
  const kontakte: KundeData[] = [
    // Pipeline: Erstgespräch
    {
      id: "demo-001", moreId: 1001, anrede: "Herr", vorname: "Stefan", nachname: "Gruber",
      email: "s.gruber@example.com", telefon: "+49 170 1234567", geburtstag: "1985-03-15",
      strasse: "Musterstraße", hausnummer: "12", plz: "80331", ort: "München",
      quelle: "Website", berater: "Christian Peetz", erstellt_am: "2025-12-01T10:00:00Z",
      archiviert: false, status: "kontaktiert", firma: "", position: "",
      objekt: "Memmingen – Kalchstraße", kaufpreis: 189000, finanzierbarkeit: "gut",
      pipelineStufe: "erstgespraech_geplant", leadTyp: "website",
      qualZiel: "Altersvorsorge, Vermögensaufbau", qualEinkommen: "4.200 €",
      qualEigenkapital: "35.000 €", qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 4200, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 850, lebenshaltung: 800, privateKV: 0, zinsTilgung: 0, autokredite: 250, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 0 },
    },
    // Pipeline: Bonitätsunterlagen
    {
      id: "demo-002", moreId: 1002, anrede: "Frau", vorname: "Maria", nachname: "Schneider",
      email: "m.schneider@example.com", telefon: "+49 171 2345678", geburtstag: "1990-07-22",
      strasse: "Lindenweg", hausnummer: "5", plz: "86150", ort: "Augsburg",
      quelle: "Empfehlung", berater: "Christian Peetz", erstellt_am: "2025-11-15T14:30:00Z",
      archiviert: false, status: "qualifiziert", firma: "", position: "",
      objekt: "Augsburg – Gögginger Str.", kaufpreis: 245000, finanzierbarkeit: "sehr gut",
      pipelineStufe: "bonitaetsunterlagen", leadTyp: "manuell",
      qualZiel: "Steueroptimierung", qualEinkommen: "5.800 €",
      qualEigenkapital: "60.000 €", qualBeruflicheSituation: "Beamtin",
      einkuenfte: { gehalt: 5800, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 50, sonstige: 0, kindergeld: 500 },
      ausgaben: { miete: 950, lebenshaltung: 1000, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 200 },
    },
    // Pipeline: Objektauswahl
    {
      id: "demo-003", moreId: 1003, anrede: "Herr", vorname: "Thomas", nachname: "Weber",
      email: "t.weber@example.com", telefon: "+49 172 3456789", geburtstag: "1978-11-03",
      strasse: "Rosenweg", hausnummer: "8a", plz: "93047", ort: "Regensburg",
      quelle: "Google Ads", berater: "Christian Peetz", erstellt_am: "2025-10-20T09:15:00Z",
      archiviert: false, status: "qualifiziert", firma: "", position: "",
      objekt: "", kaufpreis: 0, finanzierbarkeit: "gut",
      pipelineStufe: "objektauswahl", leadTyp: "google",
      qualZiel: "Kapitalanlage", qualEinkommen: "6.500 €",
      qualEigenkapital: "80.000 €", qualBeruflicheSituation: "Selbständig",
      einkuenfte: { gehalt: 0, selbstaendig: 6500, renten: 0, mieteinnahmen: 800, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 0, lebenshaltung: 1200, privateKV: 650, zinsTilgung: 400, autokredite: 350, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 300 },
    },
    // Pipeline: Reservierung
    {
      id: "demo-004", moreId: 1004, anrede: "Frau", vorname: "Sandra", nachname: "Müller",
      email: "s.mueller@example.com", telefon: "+49 173 4567890", geburtstag: "1988-05-18",
      strasse: "Schillerstr.", hausnummer: "22", plz: "68159", ort: "Mannheim",
      quelle: "Meta Ads", berater: "Christian Peetz", erstellt_am: "2025-09-05T16:45:00Z",
      archiviert: false, status: "kunde", firma: "", position: "",
      objekt: "Memmingen – Kalchstraße", kaufpreis: 175000, finanzierbarkeit: "sehr gut",
      pipelineStufe: "reservierung", leadTyp: "meta",
      reservierungsDatum: "2026-01-15",
      qualZiel: "Altersvorsorge", qualEinkommen: "4.800 €",
      qualEigenkapital: "45.000 €", qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 4800, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 250 },
      ausgaben: { miete: 750, lebenshaltung: 900, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 150, sonstigeKredite: 0, unterhalt: 0, sonstige: 100 },
    },
    // Pipeline: Finanzierung
    {
      id: "demo-005", moreId: 1005, anrede: "Herr", vorname: "Michael", nachname: "Fischer",
      email: "m.fischer@example.com", telefon: "+49 174 5678901", geburtstag: "1975-01-30",
      strasse: "Beethovenstr.", hausnummer: "3", plz: "94315", ort: "Straubing",
      quelle: "Website", berater: "Christian Peetz", erstellt_am: "2025-08-12T11:00:00Z",
      archiviert: false, status: "kunde", firma: "", position: "",
      objekt: "Straubing – Am Stadtgraben", kaufpreis: 210000, finanzierbarkeit: "gut",
      pipelineStufe: "finanzierung", leadTyp: "website",
      reservierungsDatum: "2025-12-01",
      finanzierungsStatus: "offen", finanzierungsBank: "Sparkasse",
      finanzierungsSumme: 180000, finanzierungsZins: "3,2%", finanzierungsTilgung: "2%",
      qualZiel: "Vermögensaufbau, Steuerersparnis", qualEinkommen: "7.200 €",
      qualEigenkapital: "55.000 €", qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 7200, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 100, sonstige: 0, kindergeld: 500 },
      ausgaben: { miete: 1100, lebenshaltung: 1200, privateKV: 0, zinsTilgung: 0, autokredite: 300, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 200 },
    },
    // Pipeline: Notar
    {
      id: "demo-006", moreId: 1006, anrede: "Herr", vorname: "Andreas", nachname: "Hoffmann",
      email: "a.hoffmann@example.com", telefon: "+49 175 6789012", geburtstag: "1982-09-14",
      strasse: "Goethestr.", hausnummer: "17", plz: "72178", ort: "Waldachtal",
      quelle: "Empfehlung", berater: "Christian Peetz", erstellt_am: "2025-07-20T08:30:00Z",
      archiviert: false, status: "kunde", firma: "", position: "",
      objekt: "Waldachtal – Im Wiesengrund", kaufpreis: 195000, finanzierbarkeit: "sehr gut",
      pipelineStufe: "notar", leadTyp: "manuell",
      reservierungsDatum: "2025-11-10",
      finanzierungsStatus: "bestaetigt", finanzierungsBank: "DKB",
      finanzierungsSumme: 165000, finanzierungsZins: "3,0%", finanzierungsTilgung: "2,5%",
      notarTermin: "2026-04-15", notarUhrzeit: "14:00", notarName: "Dr. Huber", notarAdresse: "Maximilianstr. 5, München",
      qualZiel: "Kapitalanlage", qualEinkommen: "5.500 €",
      qualEigenkapital: "70.000 €", qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 5500, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 800, lebenshaltung: 900, privateKV: 0, zinsTilgung: 0, autokredite: 200, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 150 },
    },
    // Pipeline: Fälligkeit
    {
      id: "demo-007", moreId: 1007, anrede: "Frau", vorname: "Julia", nachname: "Becker",
      email: "j.becker@example.com", telefon: "+49 176 7890123", geburtstag: "1992-04-07",
      strasse: "Hauptstr.", hausnummer: "45", plz: "84028", ort: "Landshut",
      quelle: "Google Ads", berater: "Christian Peetz", erstellt_am: "2025-06-01T13:20:00Z",
      archiviert: false, status: "kunde", firma: "", position: "",
      objekt: "Memmingen – Kalchstraße", kaufpreis: 165000, finanzierbarkeit: "gut",
      pipelineStufe: "faelligkeit", leadTyp: "google",
      reservierungsDatum: "2025-09-15",
      finanzierungsStatus: "bestaetigt", finanzierungsBank: "Commerzbank",
      finanzierungsSumme: 140000, finanzierungsZins: "3,1%", finanzierungsTilgung: "2%",
      notarTermin: "2025-12-20", notarUhrzeit: "10:00", notarName: "Notar Schmidt",
      qualZiel: "Altersvorsorge", qualEinkommen: "3.800 €",
      qualEigenkapital: "30.000 €", qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 3800, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 650, lebenshaltung: 700, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 100 },
    },
    // Pipeline: Abgeschlossen
    {
      id: "demo-008", moreId: 1008, anrede: "Herr", vorname: "Markus", nachname: "Klein",
      email: "m.klein@example.com", telefon: "+49 177 8901234", geburtstag: "1970-12-25",
      strasse: "Am Marktplatz", hausnummer: "1", plz: "88400", ort: "Biberach",
      quelle: "Website", berater: "Christian Peetz", erstellt_am: "2025-04-10T15:00:00Z",
      archiviert: false, status: "kunde", firma: "", position: "",
      objekt: "Augsburg – Gögginger Str.", kaufpreis: 280000, finanzierbarkeit: "sehr gut",
      pipelineStufe: "abgeschlossen", leadTyp: "website",
      reservierungsDatum: "2025-06-01",
      finanzierungsStatus: "bestaetigt", finanzierungsBank: "HypoVereinsbank",
      finanzierungsSumme: 230000, finanzierungsZins: "2,9%", finanzierungsTilgung: "3%",
      notarTermin: "2025-09-10", notarUhrzeit: "11:00", notarName: "Dr. Wagner",
      qualZiel: "Vermögensaufbau", qualEinkommen: "9.000 €",
      qualEigenkapital: "120.000 €", qualBeruflicheSituation: "Geschäftsführer",
      einkuenfte: { gehalt: 9000, selbstaendig: 0, renten: 0, mieteinnahmen: 1200, zinsen: 200, sonstige: 0, kindergeld: 500 },
      ausgaben: { miete: 0, lebenshaltung: 1500, privateKV: 800, zinsTilgung: 600, autokredite: 500, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 400 },
    },
    // Setter-Lead: neuer Lead
    {
      id: "demo-009", moreId: 1009, anrede: "Frau", vorname: "Lisa", nachname: "Wagner",
      email: "l.wagner@example.com", telefon: "+49 178 9012345", geburtstag: "1995-08-12",
      strasse: "Bergstr.", hausnummer: "9", plz: "87700", ort: "Memmingen",
      quelle: "Meta Ads", berater: "", erstellt_am: new Date().toISOString(),
      archiviert: false, status: "neu", firma: "", position: "",
      objekt: "", kaufpreis: 0, finanzierbarkeit: "",
      pipelineStufe: "neuer_lead", leadTyp: "meta",
      setter: "Setterin Demo",
      funnelKontaktzeit: "Nachmittags", funnelInvestitionsvolumen: "150.000 – 250.000 €",
      funnelZeitrahmen: "3–6 Monate", funnelImmobilienbesitz: "Nein",
      funnelZiele: "Altersvorsorge, Steuerersparnis",
      einkuenfte: { gehalt: 3200, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 600, lebenshaltung: 600, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 50 },
    },
    // Setter-Lead: kontaktiert
    {
      id: "demo-010", moreId: 1010, anrede: "Herr", vorname: "Daniel", nachname: "Braun",
      email: "d.braun@example.com", telefon: "+49 179 0123456", geburtstag: "1987-02-28",
      strasse: "Kirchplatz", hausnummer: "14", plz: "89073", ort: "Ulm",
      quelle: "Google Ads", berater: "", erstellt_am: "2026-03-10T09:00:00Z",
      archiviert: false, status: "kontaktiert", firma: "", position: "",
      objekt: "", kaufpreis: 0, finanzierbarkeit: "",
      pipelineStufe: "neuer_lead", leadTyp: "google",
      setter: "Setterin Demo",
      setterSkriptNotizen: "Sehr interessiert, möchte Infos zu Memmingen.",
      setterTerminGebucht: true, setterTerminDatum: "2026-03-25", setterTerminUhrzeit: "15:00",
      setterCloser: "Christian Peetz",
      funnelKontaktzeit: "Vormittags", funnelInvestitionsvolumen: "200.000 – 300.000 €",
      funnelZeitrahmen: "1–3 Monate", funnelImmobilienbesitz: "Ja, 1 Immobilie",
      funnelZiele: "Vermögensaufbau, Kapitalanlage",
      qualEinkommen: "5.000 €", qualEigenkapital: "40.000 €",
      qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 5000, selbstaendig: 0, renten: 0, mieteinnahmen: 450, zinsen: 0, sonstige: 0, kindergeld: 250 },
      ausgaben: { miete: 900, lebenshaltung: 800, privateKV: 0, zinsTilgung: 350, autokredite: 200, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 100 },
    },
    // Verlorener Lead
    {
      id: "demo-011", moreId: 1011, anrede: "Herr", vorname: "Peter", nachname: "Schulz",
      email: "p.schulz@example.com", telefon: "+49 160 1112233", geburtstag: "1980-06-10",
      strasse: "Industriestr.", hausnummer: "7", plz: "90402", ort: "Nürnberg",
      quelle: "Website", berater: "Christian Peetz", erstellt_am: "2025-11-01T10:00:00Z",
      archiviert: false, status: "verloren", firma: "", position: "",
      objekt: "", kaufpreis: 0, finanzierbarkeit: "schlecht",
      pipelineStufe: "erstgespraech_geplant", leadTyp: "website",
      verlorenGrund: "nf_bonitaet",
      verlorenAm: "2025-11-20T10:00:00Z",
      einkuenfte: { gehalt: 2200, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 700, lebenshaltung: 600, privateKV: 0, zinsTilgung: 200, autokredite: 150, privatkredite: 300, sonstigeKredite: 0, unterhalt: 400, sonstige: 0 },
    },
    // Archivierter Lead
    {
      id: "demo-012", moreId: 1012, anrede: "Frau", vorname: "Claudia", nachname: "Richter",
      email: "c.richter@example.com", telefon: "+49 161 2223344", geburtstag: "1993-10-05",
      strasse: "Sonnenallee", hausnummer: "30", plz: "10967", ort: "Berlin",
      quelle: "Meta Ads", berater: "Christian Peetz", erstellt_am: "2025-08-15T12:00:00Z",
      archiviert: true, status: "inaktiv", firma: "", position: "",
      objekt: "", kaufpreis: 0, finanzierbarkeit: "",
      pipelineStufe: "erstgespraech_geplant", leadTyp: "meta",
      einkuenfte: { gehalt: 3500, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 800, lebenshaltung: 700, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 0 },
    },
    // Person mit Partner (Person 2)
    {
      id: "demo-013", moreId: 1013, anrede: "Herr", vorname: "Robert", nachname: "Hartmann",
      email: "r.hartmann@example.com", telefon: "+49 162 3334455", geburtstag: "1983-04-20",
      strasse: "Friedrichstr.", hausnummer: "88", plz: "70174", ort: "Stuttgart",
      quelle: "Website", berater: "Christian Peetz", erstellt_am: "2025-10-10T10:00:00Z",
      archiviert: false, status: "qualifiziert", firma: "", position: "",
      objekt: "Memmingen – Kalchstraße", kaufpreis: 199000, finanzierbarkeit: "sehr gut",
      pipelineStufe: "reservierung", leadTyp: "website",
      reservierungsDatum: "2026-02-20",
      qualZiel: "Altersvorsorge, Vermögensaufbau", qualEinkommen: "5.200 €",
      qualEigenkapital: "90.000 €", qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 5200, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 500 },
      ausgaben: { miete: 1000, lebenshaltung: 1000, privateKV: 0, zinsTilgung: 0, autokredite: 300, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 200 },
      person2: {
        anrede: "Frau", vorname: "Sabine", nachname: "Hartmann",
        geburtsdatum: "1985-09-12", email: "s.hartmann@example.com", telefon: "+49 162 3334456",
        strasse: "Friedrichstr.", hausnummer: "88", plz: "70174", ort: "Stuttgart",
        einkuenfte: { gehalt: 3800, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
        ausgaben: { miete: 0, lebenshaltung: 0, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 0 },
      },
    },
    // Nicht erreicht Lead (Setterin)
    {
      id: "demo-014", moreId: 1014, anrede: "Herr", vorname: "Kevin", nachname: "Neumann",
      email: "k.neumann@example.com", telefon: "+49 163 4445566", geburtstag: "1998-01-17",
      strasse: "Dorfstr.", hausnummer: "2", plz: "73230", ort: "Kirchheim",
      quelle: "Meta Ads", berater: "", erstellt_am: "2026-03-15T08:00:00Z",
      archiviert: false, status: "neu", firma: "", position: "",
      objekt: "", kaufpreis: 0, finanzierbarkeit: "",
      pipelineStufe: "neuer_lead", leadTyp: "meta",
      setter: "Setterin Demo",
      nichtErreichtCount: 3, verstecktBis: "2026-03-20T10:00:00Z",
      funnelKontaktzeit: "Abends", funnelInvestitionsvolumen: "100.000 – 200.000 €",
      funnelZeitrahmen: "6–12 Monate", funnelImmobilienbesitz: "Nein",
      funnelZiele: "Steuerersparnis",
      einkuenfte: { gehalt: 2800, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 550, lebenshaltung: 500, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 0 },
    },
    // Abrechnung
    {
      id: "demo-015", moreId: 1015, anrede: "Frau", vorname: "Anna", nachname: "Lehmann",
      email: "a.lehmann@example.com", telefon: "+49 164 5556677", geburtstag: "1991-12-08",
      strasse: "Kastanienallee", hausnummer: "15", plz: "10435", ort: "Berlin",
      quelle: "Empfehlung", berater: "Christian Peetz", erstellt_am: "2025-05-20T09:00:00Z",
      archiviert: false, status: "kunde", firma: "", position: "",
      objekt: "Regensburg – Am Galgenberg", kaufpreis: 220000, finanzierbarkeit: "gut",
      pipelineStufe: "abrechnung", leadTyp: "manuell",
      reservierungsDatum: "2025-07-01",
      finanzierungsStatus: "bestaetigt", finanzierungsBank: "PSD Bank",
      finanzierungsSumme: 185000, finanzierungsZins: "3,3%", finanzierungsTilgung: "2%",
      notarTermin: "2025-10-05", notarUhrzeit: "09:30", notarName: "Notar Meier",
      qualZiel: "Kapitalanlage, Altersvorsorge", qualEinkommen: "4.500 €",
      qualEigenkapital: "50.000 €", qualBeruflicheSituation: "Angestellt",
      einkuenfte: { gehalt: 4500, selbstaendig: 0, renten: 0, mieteinnahmen: 0, zinsen: 0, sonstige: 0, kindergeld: 0 },
      ausgaben: { miete: 700, lebenshaltung: 800, privateKV: 0, zinsTilgung: 0, autokredite: 0, privatkredite: 0, sonstigeKredite: 0, unterhalt: 0, sonstige: 150 },
    },
  ];

  localStorage.setItem("mi_kontakte", JSON.stringify(kontakte));

  // ── Investments ──
  const investments = [
    { id: "inv-001", kundeId: "demo-007", objekt: "Memmingen – Kalchstraße", wohnung: "WHG 19", kaufpreis: 165000, kaufdatum: "2025-12-20", status: "aktiv", notizen: "" },
    { id: "inv-002", kundeId: "demo-008", objekt: "Augsburg – Gögginger Str.", wohnung: "WHG 5", kaufpreis: 280000, kaufdatum: "2025-09-10", status: "aktiv", notizen: "Zweites Investment geplant" },
    { id: "inv-003", kundeId: "demo-015", objekt: "Regensburg – Am Galgenberg", wohnung: "WHG 12", kaufpreis: 220000, kaufdatum: "2025-10-05", status: "aktiv", notizen: "" },
  ];
  localStorage.setItem("mi_investments", JSON.stringify(investments));

  // ── Aktivitäten ──
  const aktivitaeten = [
    { id: "akt-001", kundeId: "demo-001", art: "anruf", beschreibung: "Erstgespräch geführt, großes Interesse", datum: "2025-12-05T10:00:00Z", von: "Christian Peetz", ergebnis: "Termin vereinbart" },
    { id: "akt-002", kundeId: "demo-002", art: "email", beschreibung: "Bonitätsunterlagen angefordert", datum: "2025-11-20T14:00:00Z", von: "Christian Peetz", ergebnis: "Unterlagen eingegangen" },
    { id: "akt-003", kundeId: "demo-004", art: "meeting", beschreibung: "Objektbesichtigung Memmingen WHG 19", datum: "2026-01-10T14:00:00Z", von: "Christian Peetz", ergebnis: "Reservierung gewünscht" },
    { id: "akt-004", kundeId: "demo-005", art: "anruf", beschreibung: "Finanzierungsstatus besprochen", datum: "2026-02-15T11:00:00Z", von: "Christian Peetz", ergebnis: "Sparkasse prüft" },
    { id: "akt-005", kundeId: "demo-006", art: "notiz", beschreibung: "Notartermin bestätigt für 15.04.", datum: "2026-03-01T09:00:00Z", von: "Christian Peetz" },
    { id: "akt-006", kundeId: "demo-009", art: "anruf", beschreibung: "Erstkontakt versucht – AB besprochen", datum: new Date().toISOString(), von: "Setterin Demo", ergebnis: "Rückruf erwartet" },
    { id: "akt-007", kundeId: "demo-010", art: "anruf", beschreibung: "Qualifizierungsgespräch erfolgreich", datum: "2026-03-12T10:30:00Z", von: "Setterin Demo", ergebnis: "Termin mit VP gebucht" },
    { id: "akt-008", kundeId: "demo-013", art: "meeting", beschreibung: "Gemeinsamer Termin mit Ehepaar Hartmann", datum: "2026-02-25T16:00:00Z", von: "Christian Peetz", ergebnis: "Reservierung unterschrieben" },
  ];
  localStorage.setItem("mi_aktivitaeten", JSON.stringify(aktivitaeten));

  // ── Follow-Ups ──
  const followUps = [
    { id: "fu-001", kundeId: "demo-001", kundeName: "Stefan Gruber", titel: "Unterlagen nachfassen", typ: "anruf", faelligAm: "2026-03-22", status: "offen", prioritaet: "hoch", berater: "Christian Peetz", pipelineStufe: "erstgespraech_geplant" },
    { id: "fu-002", kundeId: "demo-003", kundeName: "Thomas Weber", titel: "Objektvorschläge senden", typ: "email", faelligAm: "2026-03-20", status: "offen", prioritaet: "mittel", berater: "Christian Peetz", pipelineStufe: "objektauswahl" },
    { id: "fu-003", kundeId: "demo-005", kundeName: "Michael Fischer", titel: "Finanzierungszusage prüfen", typ: "anruf", faelligAm: "2026-03-25", status: "offen", prioritaet: "hoch", berater: "Christian Peetz", pipelineStufe: "finanzierung" },
    { id: "fu-004", kundeId: "demo-007", kundeName: "Julia Becker", titel: "Zufriedenheitscheck", typ: "anruf", faelligAm: "2026-04-01", status: "offen", prioritaet: "niedrig", berater: "Christian Peetz", pipelineStufe: "faelligkeit" },
    { id: "fu-005", kundeId: "demo-009", kundeName: "Lisa Wagner", titel: "Rückruf – Erstkontakt", typ: "anruf", faelligAm: "2026-03-21", status: "offen", prioritaet: "hoch", berater: "", pipelineStufe: "neuer_lead" },
  ];
  localStorage.setItem("mi_followups", JSON.stringify(followUps));

  // ── Finanzierungen ──
  localStorage.setItem("mi_finanzierung_v2_demo-005", JSON.stringify({
    angebote: [
      { id: "fa-001", bank: "Sparkasse", zinssatz: 3.2, tilgung: 2, laufzeit: 15, darlehensbetrag: 180000, monatlicheRate: 780, sondertilgung: "5%", bereitstellungsfrei: "6 Monate", status: "offen", erstellt_am: "2026-02-01" },
      { id: "fa-002", bank: "DKB", zinssatz: 3.0, tilgung: 2.5, laufzeit: 15, darlehensbetrag: 180000, monatlicheRate: 825, sondertilgung: "5%", bereitstellungsfrei: "12 Monate", status: "offen", erstellt_am: "2026-02-05" },
    ],
    phase: "gesendet",
  }));

  localStorage.setItem("mi_finanzierung_v2_demo-006", JSON.stringify({
    angebote: [
      { id: "fa-003", bank: "DKB", zinssatz: 3.0, tilgung: 2.5, laufzeit: 20, darlehensbetrag: 165000, monatlicheRate: 756, sondertilgung: "5%", bereitstellungsfrei: "12 Monate", status: "akzeptiert", erstellt_am: "2025-12-10" },
    ],
    phase: "akzeptiert",
    akzeptiertesAngebotId: "fa-003",
  }));

  localStorage.setItem(SEED_FLAG, new Date().toISOString());
  console.log("[TestDemo] Demo-Daten erfolgreich geladen:", kontakte.length, "Kontakte");
}

/** Reset seed flag to allow re-seeding */
export function resetTestDemoSeed() {
  localStorage.removeItem(SEED_FLAG);
}

/**
 * Entfernt alle Demo-Daten aus localStorage. Wird beim Wechsel WEG vom
 * testaccount aufgerufen, damit reguläre Nutzer keine Mock-Investments,
 * Mock-Kontakte oder Mock-Notartermine mehr in ihren Dashboards sehen.
 */
export function clearTestDemoData() {
  const keys = [
    SEED_FLAG,
    "mi_kontakte",
    "mi_investments",
    "mi_aktivitaeten",
    "mi_followups",
    "mi_finanzierung_v2_demo-005",
    "mi_finanzierung_v2_demo-006",
  ];
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch { /* noop */ }
  }
}
