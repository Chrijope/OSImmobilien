/**
 * Sichtbare Texte der Referenzen, auf Deutsch und Englisch.
 *
 * Die Beratungspräsentation OS Immobilien zeigt diesen Abschnitt in ihrer gewählten
 * Sprache. Alle anderen Aufrufer übergeben keine Sprache und bleiben deutsch.
 * Die Projekte stehen in derselben Reihenfolge wie die Bilder in `projects`
 * aus `src/components/landing/BeforeAfterSection.tsx`.
 */
export const REFERENZ_TEXTE = {
  de: {
    kicker: "Unsere Projekte",
    titel: "Ausgewählte",
    titelBetont: "Referenzen",
    text: "Von der Kernsanierung bis zur komplexen Projektentwicklung, unsere realisierten Projekte sprechen für sich.",
    bildZurueck: "Vorheriges Bild",
    bildWeiter: "Nächstes Bild",
    projektZurueck: "Vorheriges Projekt",
    projektWeiter: "Nächstes Projekt",
    projekt: "Projekt",
    projekte: [
      {
        name: "München",
        location: "WG/Co-Living Konzept",
        desc: "Vollständig sanierte Altbauwohnung in beliebter Lage, möbliert und voll vermietet als All-inclusive WG.",
      },
      {
        name: "Hof",
        location: "Sanierter Bestand",
        desc: "Aus unsaniertem Altbau mit denkmalgeschützten Eingangsbereichen entstand hochwertig sanierter Wohnraum mit modernen Bädern, hellen Schlafzimmern und großzügigen Fluren in zentraler Lage.",
      },
      {
        name: "Nürnberg",
        location: "Sanierter Bestand",
        desc: "Sanierter Altbau mit hell möblierten Schlafzimmern, modernem Bad mit ebenerdiger Dusche, kompakter Küche mit Balkonzugang sowie aufgewerteten Treppenhäusern und neuer Fassade mit Glasbalkonen.",
      },
      {
        name: "Frankfurt am Main",
        location: "Micro-Apartments",
        desc: "Voll möbliertes Micro-Apartment-Haus mit kompakten, effizient geschnittenen Einheiten, ideal für Pendler, Studierende und Berufstätige in zentraler Lage.",
      },
      {
        name: "Leipzig",
        location: "Sanierter Bestand",
        desc: "Hochwertig sanierte Altbauwohnungen in zentraler Leipziger Lage mit modernen Bädern, offenen Wohnküchen und ruhigem Balkon zum begrünten Innenhof.",
      },
      {
        name: "Berlin",
        location: "Neubau",
        desc: "Moderner Neubau mit hochwertig ausgestatteten Wohnungen, bodentiefen Fenstern, Balkonen und durchdachten Grundrissen in grüner, gut angebundener Lage.",
      },
      {
        name: "Ansbach",
        location: "Neubau KfW 40 QNG",
        desc: "Quartiersentwicklung Park-Living mit Reihen- und Doppelhäusern nach KfW 40 QNG, Photovoltaik auf den Dächern, Balkonen, Terrassen und eigenen Gärten sowie Carports mit Gründach, förderfähig über die KfW, Fertigstellung 2027.",
      },
    ],
  },
  en: {
    kicker: "Our projects",
    titel: "Selected",
    titelBetont: "references",
    text: "From complete refurbishment to complex project development, our completed projects speak for themselves.",
    bildZurueck: "Previous image",
    bildWeiter: "Next image",
    projektZurueck: "Previous project",
    projektWeiter: "Next project",
    projekt: "Project",
    projekte: [
      {
        name: "Munich",
        location: "Shared flat / co-living concept",
        desc: "Fully renovated period flat in a popular location, furnished and fully let as an all-inclusive shared flat.",
      },
      {
        name: "Hof",
        location: "Renovated existing property",
        desc: "An unrenovated period building with listed entrance areas was turned into high-quality renovated living space with modern bathrooms, bright bedrooms and spacious hallways in a central location.",
      },
      {
        name: "Nuremberg",
        location: "Renovated existing property",
        desc: "Renovated period building with brightly furnished bedrooms, a modern bathroom with walk-in shower, a compact kitchen with balcony access, upgraded stairwells and a new facade with glass balconies.",
      },
      {
        name: "Frankfurt am Main",
        location: "Micro-apartments",
        desc: "Fully furnished micro-apartment building with compact, efficiently laid-out units, ideal for commuters, students and professionals in a central location.",
      },
      {
        name: "Leipzig",
        location: "Renovated existing property",
        desc: "High-quality renovated period flats in a central Leipzig location with modern bathrooms, open-plan kitchen and living areas, and a quiet balcony facing the green courtyard.",
      },
      {
        name: "Berlin",
        location: "New build",
        desc: "Modern new build with high-quality flats, floor-to-ceiling windows, balconies and well-designed floor plans in a green, well-connected location.",
      },
      {
        name: "Ansbach",
        location: "New build KfW 40 QNG",
        desc: "Park-Living neighbourhood development with terraced and semi-detached houses to the KfW 40 QNG standard, solar panels on the roofs, balconies, terraces and private gardens as well as carports with green roofs, eligible for KfW subsidies, completion 2027.",
      },
    ],
  },
} as const;

export type ReferenzSprache = keyof typeof REFERENZ_TEXTE;
