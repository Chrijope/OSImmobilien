/*
 * Gemeinsame Beispielrechnung der Beratungspräsentation (PDF, CRM, Artefakt).
 * ERZEUGT aus scripts/beratung-beispielrechnung/gemeinsam.py mit export.py, nicht von Hand ändern.
 * Beispielperson 65.000 € brutto (Grundtarif 2026), Beispielwohnung Hauffstraße 38 a, Wohnung 1,
 * AfA 4 % als Annahme (Ersteinschätzung, Gutachten erforderlich). Beträge in Euro, gerundet wie in der PDF.
 */
export const BEISPIEL = {
  "person": {
    "bruttoJahr": 65000,
    "bruttoMonat": 5417,
    "lohnsteuerJahr": 10475,
    "lohnsteuerMonat": 873,
    "sozialMonat": 1178,
    "nettoMonat": 3366,
    "abzuegeMonat": 2051,
    "rv": 504,
    "kv": 474,
    "pv": 130,
    "av": 70,
    "zuVersteuern": 49792,
    "lebenBrutto": 2600000,
    "lebenAbgaben": 984500,
    "lebenNetto": 1615500,
    "lebenLohnsteuer": 419000,
    "lebenSozial": 565500
  },
  "wohnung": {
    "name": "Hauffstraße 38 a, Wohnung 1",
    "kaufpreis": 176000,
    "qm": 42.53,
    "nebenkosten": 14960,
    "afaGrundlage": 152768,
    "mieteWohnung": 552.89,
    "garage": 80,
    "miete": 633,
    "hausgeld": 164,
    "ruecklage": 37,
    "rate": 880,
    "zinsMonat": 700,
    "tilgung": 180,
    "vorSteuer": 411,
    "ersparnis": 236,
    "anteil": 175,
    "laufend": 231,
    "ersparnisOhneGutachten": 153,
    "ersparnisJahr": 2837,
    "afa2": 3055,
    "afa4": 6111,
    "ergebnisJahr": -8445,
    "neuZuVersteuern": 41347,
    "lohnsteuerMonatNeu": 637,
    "nettoMonatNeu": 3602,
    "lohnsteuerMonat2": 720,
    "nettoMonat2": 3519,
    "mieteJahr": 7595,
    "zinsJahr": 8401,
    "kostenAbziehbarJahr": 1528,
    "freiMonate": 404,
    "freiJahr": 2059,
    "freiAlter": 58,
    "afaEndeAlter": 50,
    "wertFrei": 342800,
    "wert60": 352000,
    "wert65": 388600,
    "wert30": 318800,
    "schnitt30": 214,
    "bis49": 210,
    "max57": 460,
    "ueberschuss58": 670,
    "restRaten": 8
  },
  "mehr": [
    {
      "vor": 411,
      "anfang": 175,
      "spaet": 460,
      "ab58": 670,
      "zu": 93200
    },
    {
      "vor": 822,
      "anfang": 370,
      "spaet": 950,
      "ab58": 1350,
      "zu": 190600
    },
    {
      "vor": 1233,
      "anfang": 587,
      "spaet": 1450,
      "ab58": 2020,
      "zu": 292000
    }
  ],
  "drei": {
    "rente65": 1440,
    "gerettet": 129100,
    "wert65": 1165800,
    "miete": 1209207,
    "afa": 458304,
    "wertzuwachs": 637845,
    "rente60": 1510,
    "rente60Vor": 2020,
    "verkauf60": 1055942,
    "renteAusVerkauf": 3500,
    "ersparnisJahr1": 646
  },
  "verlauf": [
    [
      25,
      176000,
      176000
    ],
    [
      26,
      173841,
      179520
    ],
    [
      27,
      171576,
      183110
    ],
    [
      28,
      169200,
      186773
    ],
    [
      29,
      166707,
      190508
    ],
    [
      30,
      164092,
      194318
    ],
    [
      31,
      161348,
      198205
    ],
    [
      32,
      158470,
      202169
    ],
    [
      33,
      155451,
      206212
    ],
    [
      34,
      152284,
      210336
    ],
    [
      35,
      148961,
      214543
    ],
    [
      36,
      145475,
      218834
    ],
    [
      37,
      141818,
      223211
    ],
    [
      38,
      137981,
      227675
    ],
    [
      39,
      133957,
      232228
    ],
    [
      40,
      129735,
      236873
    ],
    [
      41,
      125305,
      241610
    ],
    [
      42,
      120659,
      246442
    ],
    [
      43,
      115784,
      251371
    ],
    [
      44,
      110670,
      256399
    ],
    [
      45,
      105305,
      261527
    ],
    [
      46,
      99677,
      266757
    ],
    [
      47,
      93773,
      272092
    ],
    [
      48,
      87579,
      277534
    ],
    [
      49,
      81081,
      283085
    ],
    [
      50,
      74264,
      288747
    ],
    [
      51,
      67113,
      294522
    ],
    [
      52,
      59611,
      300412
    ],
    [
      53,
      51740,
      306420
    ],
    [
      54,
      43484,
      312549
    ],
    [
      55,
      34822,
      318800
    ],
    [
      56,
      25735,
      325176
    ],
    [
      57,
      16203,
      331679
    ],
    [
      58,
      6202,
      338313
    ],
    [
      59,
      0,
      345079
    ],
    [
      60,
      0,
      351981
    ],
    [
      61,
      0,
      359020
    ],
    [
      62,
      0,
      366201
    ],
    [
      63,
      0,
      373525
    ],
    [
      64,
      0,
      380995
    ],
    [
      65,
      0,
      388615
    ]
  ],
  "monate": [
    [
      25,
      -411,
      -175
    ],
    [
      26,
      -404,
      -173
    ],
    [
      27,
      -396,
      -171
    ],
    [
      28,
      -389,
      -169
    ],
    [
      29,
      -382,
      -168
    ],
    [
      30,
      -374,
      -167
    ],
    [
      31,
      -367,
      -166
    ],
    [
      32,
      -360,
      -165
    ],
    [
      33,
      -353,
      -165
    ],
    [
      34,
      -346,
      -165
    ],
    [
      35,
      -339,
      -165
    ],
    [
      36,
      -332,
      -165
    ],
    [
      37,
      -326,
      -166
    ],
    [
      38,
      -319,
      -167
    ],
    [
      39,
      -312,
      -168
    ],
    [
      40,
      -306,
      -170
    ],
    [
      41,
      -299,
      -172
    ],
    [
      42,
      -293,
      -175
    ],
    [
      43,
      -287,
      -178
    ],
    [
      44,
      -281,
      -181
    ],
    [
      45,
      -275,
      -185
    ],
    [
      46,
      -269,
      -189
    ],
    [
      47,
      -263,
      -194
    ],
    [
      48,
      -257,
      -199
    ],
    [
      49,
      -252,
      -205
    ],
    [
      50,
      -246,
      -393
    ],
    [
      51,
      -241,
      -401
    ],
    [
      52,
      -235,
      -410
    ],
    [
      53,
      -230,
      -419
    ],
    [
      54,
      -225,
      -429
    ],
    [
      55,
      -220,
      -439
    ],
    [
      56,
      -215,
      -451
    ],
    [
      57,
      -210,
      -463
    ],
    [
      58,
      149,
      -121
    ],
    [
      59,
      679,
      404
    ],
    [
      60,
      672,
      399
    ],
    [
      61,
      666,
      395
    ],
    [
      62,
      659,
      390
    ],
    [
      63,
      652,
      385
    ],
    [
      64,
      645,
      380
    ]
  ]
} as const;
