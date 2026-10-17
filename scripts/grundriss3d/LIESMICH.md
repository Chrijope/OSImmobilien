# 3D-Grundriss aus CAD-Plänen

Liest Wände, Fenster, Türen und Räume aus Werkplänen (PDF mit Vektordaten,
Maßstab 1:100) und baut daraus die Daten für das 3D-Modell im CRM
(`src/components/grundriss3d/daten/*.json`, eingebunden über
`planBibliothek.ts`).

- `plan2d.py`: ein Planblatt auswerten. Tragende schwarze Linien (ab 0,5 pt)
  werden gezeichnet, Wandkörper per Morphologie geschlossen, Lücken bis
  1,45 m sind Öffnungen (an der Außenseite Fenster, innen Türen), die Flächen
  dazwischen Räume (Wasserscheide). Raumname und Wohnungsnummer kommen aus
  der Beschriftung im Plan.
- `hauff_bauen.py`: Beispiel für ein ganzes Objekt (Hauffstraße 38, fünf
  Blätter): Etagen je Haus zuordnen, Einheiten über die Nummern bilden.

Einrichtung (einmalig, nur lokal):

    python3 -m venv .venv-plaene
    .venv-plaene/bin/pip install pymupdf shapely opencv-python-headless numpy

Grenzen: Dünn gezeichnete Innenwände fehlen teilweise, dann laufen Räume
zusammen. Eingescannte Pläne (Bild statt Vektor) eignen sich nicht; die
werden im Editor nachgezeichnet. Dachformen werden nicht gelesen.
