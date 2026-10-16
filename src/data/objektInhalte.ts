/**
 * Beschreibung, Standortargumente und interne Highlights je Objekt
 * (Christian, 16.10.2026), für den Import „Objektinhalte einspielen“ auf der
 * Seite Objekte.
 *
 * Nur aus belegten Quellen, keine erfundenen Zahlen. Die Quelle steht je
 * Aussage als Kommentar. Kürzel:
 *   [B]   Exposé Barfusstraße 9 (WE 20 als Muster, Stand 14.10.2026)
 *   [H]   Exposé Hauffstraße 38 (WE 40 als Muster, Energieklassen aus WE01, 06, 17, 45)
 *   [L72] Exposé Luisenstraße 72, [A29] Exposé Agnesstraße 29, [A30] Exposé Agnesstraße 30
 *   [KfW] KfW-Strategie Zossen-Wünsdorf, Stand 14.10.2026
 *   [S]   Entwurf 1_Umsetzungsstrategie_Vertrieb, Abschnitt „Auffälligkeiten in den Exposés“
 *
 * Kundensichtbar sind `kurzbeschreibung` und `standortargumente` (Objektseite,
 * Einheitenseite, Exposé). Sie bleiben sachlich und ohne Versprechen.
 * `interneHighlights` landen in `meta.interneHighlightsHand` (dasselbe Feld wie im Objektformular) und sind NUR
 * intern (siehe `src/lib/interneHighlights.ts`); dort dürfen Risiken offen
 * stehen.
 *
 * Höchstens acht interne Highlights: Die Karte zeigt zehn Punkte, zwei davon
 * belegen Erhaltungsaufwand und Restnutzungsdauer, der Rest wird abgeschnitten.
 *
 * Genau fünf Standortargumente je Objekt: So viele Felder speichert der
 * Pflegedialog (`ANZAHL_STANDORTARGUMENTE`), mehr gingen dort beim nächsten
 * Speichern verloren.
 */

export interface ObjektInhalt {
  /** Straße und Hausnummer, daran wird das Objekt erkannt (wie bei „Exposés zuordnen“). */
  adresse: string;
  kurzbeschreibung: string;
  standortargumente: string[];
  interneHighlights: string[];
}

export const OBJEKT_INHALTE: ObjektInhalt[] = [
  {
    adresse: "Barfusstraße 9",
    kurzbeschreibung:
      // [B] S. 2, 3, 8: Baujahr um 1900, Vorderhaus, Seitenflügel, Quergebäude, Innenhof, Wohnungseigentum
      "Das Ensemble Barfusstraße 9 entstand um 1900 und gliedert sich in Vorderhaus, Seitenflügel und Quergebäude rund um einen gemeinsamen Innenhof. "
      // [B] S. 8: EG und 4 OG, hohe Decken, Dielen bzw. Laminat, Kachelöfen in einzelnen Wohnungen
      + "Das Haus hat ein Erdgeschoss und vier Obergeschosse, typische Altbau-Raumhöhen und in einzelnen Wohnungen noch Kachelöfen. "
      // [B] S. 2, 8: Gas-Etagenheizungen
      + "Beheizt werden die Wohnungen über Gas-Etagenheizungen. "
      // [B] S. 3: aufgeteilt, Verwaltung durch die HWS, Wirtschaftsplan 2025
      + "Die Wohnungen sind als Wohnungseigentum aufgeteilt, die Gemeinschaft wird von der HWS verwaltet. "
      // [B] S. 3, 8: Bauantrag Balkone 2022, Vorplanung Aufzüge und Dachgeschoss 10/2024, unverbindlich
      + "Für Balkone zum Hof liegt ein Bauantrag aus 2022 vor, für Aufzüge und einen Dachgeschossausbau eine Vorplanung; beschlossen ist davon noch nichts.",
    standortargumente: [
      // [B] S. 4, Argument 01
      "Wedding gehört zum Berliner Bezirk Mitte.",
      // [B] S. 4, Argument 02
      "U-Bahn-Linie U6 mit den Bahnhöfen Rehberge und Afrikanische Straße in der Nähe.",
      // [B] S. 4, Argument 02
      "Die Müllerstraße ist die Einkaufs- und Versorgungsachse des Kiezes.",
      // [B] S. 4, Argument 03
      "Volkspark Rehberge und Schillerpark liegen im Umfeld.",
      // [B] S. 4, Argument 04
      "In der Straße wird modernisiert, gegenüber entsteht ein Neubau; Schulen und Gastronomie liegen in der Nähe.",
    ],
    interneHighlights: [
      // [B] S. 9 und 10: RND 18 Jahre, 5,6 %, Gutachten empfohlen; Regel-AfA 2,5 % (Baujahr vor 1925, § 7 Abs. 4 EStG)
      "AfA 5,6 % laut Ersteinschätzung (Restnutzungsdauer 18 Jahre), Gutachten nötig; Regel-AfA 2,5 %. Im Gespräch beide Zahlen zeigen.",
      // [B] S. 2: Gebäudeanteil 93 % in der Rechnung
      "Gebäudeanteil im Exposé mit 93 % gerechnet. Hoch angesetzt, vor einer Steueraussage prüfen lassen.",
      // [B] S. 2, 8: Verbrauchsausweis 218,9 kWh/(m²a), Klasse G, bis 2033
      // [B] S. 9: Heizung und GEG
      "Energieausweis Klasse G (Verbrauch 218,9 kWh/(m²a), gültig bis 2033). Heizungsfrage GEG: Gas-Etagenheizungen, eine Umstellung kann nötig werden, Zeitpunkt und Kosten offen. Offen ansprechen.",
      // [B] S. 3, 8: Allianz, Mietausfall bis 36 Monate im versicherten Schadenfall
      // [B] S. 2, 14: Mietdifferenz bzw. Mietgarantie laut Vereinbarung
      "Allianz-Versicherung mit Mietausfall bis 36 Monate, nur im versicherten Schadenfall, keine Mietgarantie. Mietdifferenz bzw. Mietgarantie gibt es nur laut Vereinbarung je Einheit.",
      // [B] S. 3: 17.500 € Zuführung pro Jahr, WP 2025 beschlossen 24.06.2025
      "Erhaltungsrücklage: 17.500 € Zuführung pro Jahr laut Wirtschaftsplan 2025.",
      // [B] S. 3, 8: Bauantrag 20.12.2022, Vorplanung 10/2024
      "Balkone (Bauantrag 2022), Aufzüge und Dachgeschoss (Vorplanung 10/2024) unverbindlich, nicht Kaufgegenstand. Nicht als Wertsteigerung verkaufen.",
      // [B] S. 3, 4: möblierte Vermietung, WG-Zimmer 550 bis 760 € (Marktbeobachtung)
      "Option möblierte bzw. WG-Vermietung (WG-Zimmer etwa 550 bis 760 € laut Marktbeobachtung); rechtlich und wirtschaftlich im Einzelfall prüfen.",
      // [S] Auffälligkeit 1
      "Exposés WE 06, 23, 37, 44, 47: Mietszenario „steigt“ von 20 auf 18 €/m², also fallend. Vor dem Einsatz klären.",
    ],
  },
  {
    adresse: "Hauffstraße 38",
    kurzbeschreibung:
      // [H] S. 1, 3: Baujahr 2000, 46 ETW, Häuser 38 a bis f, Aufzüge, Keller, Garagen
      "Die Wohnanlage Hauffstraße 38 a bis f in Geltow wurde im Jahr 2000 errichtet und umfasst 46 Eigentumswohnungen mit Aufzügen, Kellern und Garagen. "
      // [H] S. 7: Massivbau, Dämmfassade, Ziegeldach, Isolierverglasung
      + "Die Häuser sind massiv gebaut, haben eine Dämmfassade, ein Ziegeldach und isolierverglaste Fenster. "
      // [H] S. 3, 7: Einbauküche, Fußbodenheizung, Bad mit Dusche und Wanne, Balkon oder Garten
      + "Zur Ausstattung gehören Einbauküche, Fußbodenheizung, Bad mit Dusche und Wanne sowie Balkon oder Garten. "
      // [H] S. 3, 7: rund 350.000 € 2020 bis 2026, Gasheizung 2017
      + "Von 2020 bis 2026 flossen rund 350.000 € in die Instandhaltung, unter anderem in Heizung, Leitungen, Dach, Aufzug und Fenster; die Gas-Zentralheizung stammt von 2017. "
      // [H] S. 3: Stein & Co. aus Werder (Havel), seit 1990
      + "Verwaltet wird die Anlage von der Stein & Co. Vermögensverwaltung GmbH aus Werder (Havel).",
    standortargumente: [
      // [H] S. 4, Argument 01
      "Geltow gehört zur Gemeinde Schwielowsee und liegt in der Havelseen-Landschaft.",
      // [H] S. 4, Argument 02
      "Die Landeshauptstadt Potsdam schließt unmittelbar an Geltow an.",
      // [H] S. 4, Argument 03
      "Werder (Havel) ist der direkte Nachbarort.",
      // [H] S. 4, Argument 04
      "Geltow gehört zum Speckgürtel von Berlin und Potsdam.",
      // [H] S. 4, Argument 05
      "Laut Portal liegt das Mietniveau in Geltow 2026 bei 14,79 €/m² (Angebotsmieten).",
    ],
    interneHighlights: [
      // [H] S. 8: Regel-AfA 2 %, erhöhte AfA 3,1 % mit Gutachten, Ersteinschätzung 32 Jahre
      "AfA 3,1 % laut Ersteinschätzung (Restnutzungsdauer 32 Jahre), Gutachten nötig; Regel-AfA 2 %.",
      // [H] S. 2: Gebäudeanteil 80 %
      "Gebäudeanteil im Exposé mit 80 % gerechnet; vor einer Steueraussage prüfen.",
      // [H] S. 2: subventioniert auf 13 €/m², Mietdifferenz laut Kalkulation, Garantievereinbarung
      "Miete subventioniert auf 13 €/m²; die Mietdifferenz gleicht der Verkäufer laut Vereinbarung aus. Befristung und Bedingungen in der Garantievereinbarung prüfen, danach gilt die Vertragsmiete.",
      // [H] S. 3, 7: rund 350.000 € 2020 bis 2026
      "Rund 350.000 € Instandhaltung 2020 bis 2026 (Heizung, Leitungen, Dach, Aufzug, Fenster). Kein Erhaltungsaufwand des Käufers.",
      // [H] Energieklassen: 38 a und f D, 38 c, d, e C; Bedarfsausweis 2026 bis 2036
      "Energieklasse je Haus C oder D (Bedarfsausweis 2026, gültig bis 2036); Gasheizung von 2017, Heizungsfrage GEG langfristig im Blick behalten.",
      // [H] S. 1, 3: Garage 15.000 € im Kaufpreis, separat im Kaufvertrag
      "Garage ist im Kaufpreis enthalten (15.000 €) und wird im Kaufvertrag separat ausgewiesen.",
      // [H] S. 3: Sondereigentumsverwaltung 40 € netto
      "Sondereigentumsverwaltung optional für 40 € netto im Monat.",
      // [H] S. 3: keine Baulasten, kein Altlasteneintrag laut Auskunft 2019
      "Keine Baulasten und kein Altlasteneintrag laut Auskunft 2019.",
    ],
  },
  {
    adresse: "Luisenstraße 72",
    kurzbeschreibung:
      // [L72] S. 3; [KfW] S. 7: DHH 1, 91 m², 4 Zimmer, ca. 600 m², Baujahr 1937
      "Die Luisenstraße 72 ist eine Doppelhaushälfte von 1937 mit vier Zimmern auf 91 m² und einem eigenen Grundstück von rund 600 m². "
      // [L72] S. 3: rund 70 Häuser gleicher Bauart, ruhige Anliegerstraßen
      + "Sie liegt in der Waldsiedlung Wünsdorf, die rund 70 Häuser gleicher Bauart in ruhigen Anliegerstraßen umfasst. "
      // [L72] S. 2, 3: saniert, leer, keine WEG, kein Hausgeld
      + "Das Haus ist saniert und steht leer. Es gibt keine Eigentümergemeinschaft und kein Hausgeld. "
      // [L72] S. 4: Paket A, Paket B, getrennte Verträge
      + "Optional kommen eine Teilsanierung (Paket A) oder eine Vollsanierung (Paket B, unter anderem Fassade und Dach) hinzu; der Leistungsumfang wird im Werkvertrag festgelegt.",
    standortargumente: [
      // [L72] S. 3, 5: Bahnhof 650 m bzw. 0,7 km, RB/RE nach Berlin Hbf, RB 24 zum BER
      "Bahnhof Wünsdorf-Waldstadt rund 650 m entfernt, mit RE nach Berlin und RB 24 zum BER.",
      // [L72] S. 5: EDEKA, Netto 0,9 km, Kitas 0,7 und 0,9 km, Comenius-Oberschule 1,0 km
      "Supermärkte, Kitas und Schulen in rund 1 km.",
      // [L72] S. 5: Kleiner Wünsdorfer See 0,8 km, Großer Wünsdorfer See 1,9 km
      "Kleiner Wünsdorfer See rund 0,8 km, Großer Wünsdorfer See rund 1,9 km entfernt.",
      // [L72] S. 3, 5: BER ≈ 22 km, Berlin Hbf ≈ 40 km
      "Flughafen BER rund 22 km, Berlin Hauptbahnhof rund 40 km Luftlinie.",
      // [L72] S. 3, 5: B96, Berliner Ring; Ludwigsfelde ≈ 20 km
      "B96 und Berliner Ring in der Nähe; Ludwigsfelde mit Industriepark rund 20 km.",
    ],
    interneHighlights: [
      // [L72] S. 2, 4
      "Kaufpreis Haus 349.000 €. Paket A Teilsanierung 30.000 € (379.000 €) oder Paket B Vollsanierung 50.000 €, u. a. Fassade und Dach (399.000 €), beide optional.",
      // [L72] S. 8; [KfW] S. 9; [S] Auffälligkeit 5
      "15-%-Grenze: Paket A (25.210 € netto) liegt laut Sanierungsrechner darunter, Paket B (42.017 € netto) 137 € darüber. Steckt das Paket im Kaufpreis, gibt es in der Regel keinen Sofortabzug; der „Sofortabzug 12.600 €“ in der Musterrechnung ist vorher zu klären.",
      // [L72] S. 8, 9; [S] Auffälligkeit 3 sinngemäß
      "Gebäudeanteil uneinheitlich: 80 % im Sanierungsrechner, 70 % in der Kostenseite. Vor einer Steueraussage festlegen.",
      // [L72] S. 9; [KfW] S. 9
      "AfA 8,3 % als Modell (Restnutzungsdauer etwa 12 Jahre), Ersteinschätzung bezieht sich auf ein Nachbarhaus, Gutachten nötig; Regel-AfA 2 %.",
      // [KfW] S. 8, 12; [S] Auffälligkeit 2
      // [KfW] S. 7: Gas-Brennwerttherme 1995; S. 3, 8: Gas nicht förderfähig
      "Energieausweis: Exposé nennt C, der Verbrauchsausweis von 2018 zeigt Klasse F (172 kWh/(m²a)); nicht mit C argumentieren. Heizung Gas-Brennwerttherme von 1995.",
      // [KfW] S. 2, 6
      "KfW 261 nur mit neuem Vertragsmodell (Ersterwerb nach Abnahme) und neuem Wärmeerzeuger; das heutige Modell Kauf plus getrennter Werkvertrag passt nicht. Keine Förderung in Aussicht stellen.",
      // [L72] S. 2, 3: Mietgarantie laut Vertrag, Kaltmiete 1.600 €
      "Mietgarantie des Verkäufers für Sanierungs- und Leerstandszeit laut Vertrag; Kaltmiete 1.600 € laut Vereinbarung.",
      // [KfW] S. 8, 12; [S] Auffälligkeit 6
      // [L72] S. 3; [KfW] S. 8: keine Altlasten 2022, kein Denkmalnachweis
      "Grundbuch (Abdruck 02.01.2026) nennt die Quatre Vents Wünsdorf GmbH als Eigentümerin, Abgleich offen. Keine Altlasten erfasst (2022), Denkmalstatus ungeklärt.",
    ],
  },
  {
    adresse: "Agnesstraße 29",
    kurzbeschreibung:
      // [A29] S. 2, 3; [KfW] S. 7: DHH 2, 121,5 m², 5 Zimmer, ca. 800 m², Baujahr 1937
      "Die Agnesstraße 29 ist eine Doppelhaushälfte von 1937 mit fünf Zimmern auf 121,5 m² und einem eigenen Grundstück von rund 800 m². "
      // [A29] S. 3
      + "Sie liegt in der Waldsiedlung Wünsdorf, die rund 70 Häuser gleicher Bauart in ruhigen Anliegerstraßen umfasst. "
      // [A29] S. 2, 3
      + "Das Haus ist derzeit vermietet. Es gibt keine Eigentümergemeinschaft und kein Hausgeld. "
      // [A29] S. 2, 4: Vollsanierung 50.000 € im Kaufpreis, nach Auszug, 2 bis 3 Monate
      + "Eine Vollsanierung ist im Kaufpreis enthalten; sie ist nach dem Auszug des Mieters geplant und dauert etwa zwei bis drei Monate.",
    standortargumente: [
      // [A29] S. 3, 5
      "Bahnhof Wünsdorf-Waldstadt rund 650 m entfernt, mit RE nach Berlin und RB 24 zum BER.",
      // [A29] S. 5
      "Supermärkte, Kitas und Schulen in rund 1 km.",
      // [A29] S. 5
      "Kleiner Wünsdorfer See rund 0,8 km, Großer Wünsdorfer See rund 1,9 km entfernt.",
      // [A29] S. 3, 5
      "Flughafen BER rund 22 km, Berlin Hauptbahnhof rund 40 km Luftlinie.",
      // [A29] S. 3, 5
      "B96 und Berliner Ring in der Nähe; Ludwigsfelde mit Industriepark rund 20 km.",
    ],
    interneHighlights: [
      // [A29] S. 2, 4
      "Kaufpreis Haus 369.000 € plus Vollsanierung 50.000 € im Kaufpreis, gesamt 419.000 €.",
      // [A29] S. 8; [KfW] S. 9
      "15-%-Grenze: 42.017 € netto liegen 2.263 € unter der Grenze (bei 80 % Gebäudeanteil). Weil die Sanierung im Kaufpreis steckt, gibt es in der Regel keinen Sofortabzug.",
      // [A29] S. 8, 9; [S] Auffälligkeit 3
      "Gebäudeanteil uneinheitlich: 80 % im Sanierungsrechner, 65 % in der Rechnung. Vor einer Steueraussage festlegen.",
      // [A29] S. 9
      "AfA 8,3 % als Modell (Restnutzungsdauer etwa 12 Jahre), Ersteinschätzung bezieht sich auf ein Nachbarhaus, Gutachten nötig; Regel-AfA 2 %.",
      // [KfW] S. 8; [S] Auffälligkeit 2
      // [KfW] S. 7: Brennwerttherme 1995
      "Energieausweis: Exposé nennt C, der Verbrauchsausweis von 2017 zeigt Klasse E (135 kWh/(m²a)), gültig bis 09/2027; nicht mit C argumentieren. Heizung Gas-Brennwerttherme von 1995.",
      // [KfW] S. 11
      "Vermietet seit 01.02.2011 unbefristet, kein Auszugstermin vereinbart. Der Sanierungszeitpunkt hängt am Auszug; Mietgarantie laut Vertrag, Zielmiete 1.800 €.",
      // [KfW] S. 2, 6
      "KfW 261 nur mit neuem Vertragsmodell und neuem Wärmeerzeuger (Gas nicht förderfähig); Agnesstraße 29 erst nach dem Ergebnis des Energieeffizienz-Experten prüfen.",
      // [KfW] S. 8
      "Grundbuch nennt die Quatre Vents Wünsdorf GmbH als Eigentümerin; Abgleich offen. Denkmalstatus ungeklärt.",
    ],
  },
  {
    adresse: "Agnesstraße 30",
    kurzbeschreibung:
      // [A30] S. 2, 3; [KfW] S. 7
      "Die Agnesstraße 30 ist eine Doppelhaushälfte von 1937 mit fünf Zimmern auf 121,5 m² und einem eigenen Grundstück von rund 800 m². "
      // [A30] S. 3
      + "Sie liegt in der Waldsiedlung Wünsdorf, die rund 70 Häuser gleicher Bauart in ruhigen Anliegerstraßen umfasst. "
      // [A30] S. 2, 3
      + "Das Haus steht leer im Rohbauzustand. Es gibt keine Eigentümergemeinschaft und kein Hausgeld. "
      // [A30] S. 3, 4
      + "Die Vollsanierung ist im Kaufpreis enthalten und dauert etwa zwei bis drei Monate, danach folgt die Neuvermietung.",
    standortargumente: [
      // [A30] S. 3, 5
      "Bahnhof Wünsdorf-Waldstadt rund 650 m entfernt, mit RE nach Berlin und RB 24 zum BER.",
      // [A30] S. 5
      "Supermärkte, Kitas und Schulen in rund 1 km.",
      // [A30] S. 5
      "Kleiner Wünsdorfer See rund 0,8 km, Großer Wünsdorfer See rund 1,9 km entfernt.",
      // [A30] S. 3, 5
      "Flughafen BER rund 22 km, Berlin Hauptbahnhof rund 40 km Luftlinie.",
      // [A30] S. 3, 5
      "B96 und Berliner Ring in der Nähe; Ludwigsfelde mit Industriepark rund 20 km.",
    ],
    interneHighlights: [
      // [A30] S. 2, 4
      "Kaufpreis Haus 369.000 € plus Vollsanierung 50.000 € im Kaufpreis, gesamt 419.000 €.",
      // [A30] S. 8 (wie A29); [KfW] S. 9
      "15-%-Grenze: 42.017 € netto knapp unter der Grenze (bei 80 % Gebäudeanteil). Sanierung im Kaufpreis heißt in der Regel kein Sofortabzug.",
      // [S] Auffälligkeit 3
      "Gebäudeanteil uneinheitlich: 80 % im Sanierungsrechner, 65 % in der Rechnung. Vor einer Steueraussage festlegen.",
      // [A30] S. 9
      "AfA 8,3 % als Modell (Restnutzungsdauer etwa 12 Jahre), Ersteinschätzung bezieht sich auf ein Nachbarhaus, Gutachten nötig; Regel-AfA 2 %.",
      // [KfW] S. 8
      // [KfW] S. 7: Brennwerttherme 2015
      "Energieausweis: Exposé nennt C, der Verbrauchsausweis von 2017 zeigt Klasse D (111 kWh/(m²a)), gemessen vor dem Rohbauzustand; nicht mit C argumentieren. Heizung Gas-Brennwerttherme von 2015.",
      // [A30] S. 2; [S] Auffälligkeit 4
      "Leer, Zielmiete nach Sanierung 1.800 € (kein laufender Mietvertrag); Musterrechnung nennt trotzdem „Kaltmiete laut Mietvertrag“, vorher korrigieren.",
      // [KfW] S. 2, 7, 12
      "KfW-Pilot: leer und im Rohbau, Kandidat für Effizienzhaus 55 EE. KfW 261 nur mit neuem Vertragsmodell und neuem Wärmeerzeuger, erst nach Nachweis nennen.",
      // [KfW] S. 8
      "Grundbuch nennt die Quatre Vents Wünsdorf GmbH als Eigentümerin; Abgleich offen. Denkmalstatus ungeklärt.",
    ],
  },
];
