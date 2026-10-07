# Technische Entscheidungen

- Die heruntergeladene Investmentkalkulation fotografiert die Seiten der React-Berechnungsansicht einzeln und setzt davor das gemeinsame CI-Deckblatt, damit keine zweite Zeichenvorlage optisch abweicht.
- Beim Fotografieren mit html2canvas werden verlinkte Stildateien in der Kopie durch die bereits geladenen Regeln ersetzt, weil die Kopie sonst vor dem Nachladen der Stile gezeichnet wird und ungestaltet herauskommt.