/*
 * Gemeinsame Beispielrechnung der Beratungspräsentation (PDF, CRM, Artefakt).
 * ERZEUGT aus scripts/beratung-beispielrechnung/gemeinsam.py mit export.py, nicht von Hand ändern.
 * Beispielperson 80.000 € brutto (Grundtarif 2026), Beispielwohnung Hauffstraße 38 a, Wohnung 1,
 * AfA 4 % als Annahme (Ersteinschätzung, Gutachten erforderlich). Beträge in Euro, gerundet wie in der PDF.
 */
export const BEISPIEL = {
  "person": {
    "bruttoJahr": 80000,
    "bruttoMonat": 6667,
    "lohnsteuerJahr": 15281,
    "lohnsteuerMonat": 1273,
    "sozialMonat": 1355,
    "nettoMonat": 4038,
    "abzuegeMonat": 2628,
    "rv": 620,
    "kv": 509,
    "pv": 140,
    "av": 87,
    "zuVersteuern": 62686,
    "lebenBrutto": 3200000,
    "lebenAbgaben": 1261525,
    "lebenNetto": 1938475,
    "lebenLohnsteuer": 611240,
    "lebenSozial": 650285
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
    "ersparnis": 267,
    "anteil": 144,
    "laufend": 231,
    "ersparnisOhneGutachten": 173,
    "ersparnisJahr": 3213,
    "afa2": 3055,
    "afa4": 6111,
    "ergebnisJahr": -8445,
    "neuZuVersteuern": 54241,
    "lohnsteuerMonatNeu": 1006,
    "nettoMonatNeu": 4305,
    "lohnsteuerMonat2": 1100,
    "nettoMonat2": 4211,
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
    "schnitt30": 201,
    "bis49": 200,
    "max57": 490,
    "ueberschuss58": 670,
    "restRaten": 8
  },
  "mehr": [
    {
      "vor": 411,
      "anfang": 144,
      "spaet": 490,
      "ab58": 670,
      "zu": 89600
    },
    {
      "vor": 822,
      "anfang": 308,
      "spaet": 1000,
      "ab58": 1350,
      "zu": 182700
    },
    {
      "vor": 1233,
      "anfang": 492,
      "spaet": 1500,
      "ab58": 2020,
      "zu": 278700
    }
  ],
  "drei": {
    "rente65": 1440,
    "gerettet": 147200,
    "wert65": 1165800,
    "miete": 1209207,
    "afa": 458304,
    "wertzuwachs": 637845,
    "rente60": 1510,
    "rente60Vor": 2020,
    "verkauf60": 1055942,
    "renteAusVerkauf": 3500,
    "ersparnisJahr1": 741
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
      -144
    ],
    [
      26,
      -404,
      -142
    ],
    [
      27,
      -396,
      -141
    ],
    [
      28,
      -389,
      -140
    ],
    [
      29,
      -382,
      -140
    ],
    [
      30,
      -374,
      -139
    ],
    [
      31,
      -367,
      -139
    ],
    [
      32,
      -360,
      -140
    ],
    [
      33,
      -353,
      -140
    ],
    [
      34,
      -346,
      -141
    ],
    [
      35,
      -339,
      -142
    ],
    [
      36,
      -332,
      -143
    ],
    [
      37,
      -326,
      -145
    ],
    [
      38,
      -319,
      -147
    ],
    [
      39,
      -312,
      -150
    ],
    [
      40,
      -306,
      -153
    ],
    [
      41,
      -299,
      -156
    ],
    [
      42,
      -293,
      -160
    ],
    [
      43,
      -287,
      -164
    ],
    [
      44,
      -281,
      -168
    ],
    [
      45,
      -275,
      -173
    ],
    [
      46,
      -269,
      -179
    ],
    [
      47,
      -263,
      -185
    ],
    [
      48,
      -257,
      -192
    ],
    [
      49,
      -252,
      -199
    ],
    [
      50,
      -246,
      -412
    ],
    [
      51,
      -241,
      -421
    ],
    [
      52,
      -235,
      -431
    ],
    [
      53,
      -230,
      -442
    ],
    [
      54,
      -225,
      -454
    ],
    [
      55,
      -220,
      -466
    ],
    [
      56,
      -215,
      -480
    ],
    [
      57,
      -210,
      -494
    ],
    [
      58,
      149,
      -153
    ],
    [
      59,
      679,
      371
    ],
    [
      60,
      672,
      366
    ],
    [
      61,
      666,
      362
    ],
    [
      62,
      659,
      357
    ],
    [
      63,
      652,
      353
    ],
    [
      64,
      645,
      348
    ]
  ]
} as const;
