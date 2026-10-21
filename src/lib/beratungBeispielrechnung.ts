/*
 * Gemeinsame Beispielrechnung der Beratungspräsentation (PDF, CRM, Artefakt).
 * ERZEUGT aus scripts/beratung-beispielrechnung/gemeinsam.py mit export.py, nicht von Hand ändern.
 * Beispielperson 65.000 € brutto (Grundtarif 2026), Beispielwohnung Hauffstraße 38 c, Wohnung 13,
 * AfA 4 % als Annahme (Ersteinschätzung, Gutachten erforderlich). Beträge in Euro, gerundet wie in der PDF.
 */
export const BEISPIEL = {
  "person": {
    "bruttoJahr": 65000,
    "bruttoMonat": 5417,
    "lohnsteuerJahr": 10772,
    "lohnsteuerMonat": 898,
    "sozialMonat": 1178,
    "nettoMonat": 3341,
    "abzuegeMonat": 2076,
    "rv": 504,
    "kv": 474,
    "pv": 130,
    "av": 70,
    "zuVersteuern": 50636,
    "lebenBrutto": 2600000,
    "lebenAbgaben": 996380,
    "lebenNetto": 1603620,
    "lebenLohnsteuer": 430880,
    "lebenSozial": 565500
  },
  "wohnung": {
    "name": "Hauffstraße 38 c, Wohnung 13",
    "kaufpreis": 285000,
    "qm": 72.36,
    "nebenkosten": 24225,
    "afaGrundlage": 247380,
    "mieteWohnung": 940.68,
    "garage": 80,
    "miete": 1021,
    "hausgeld": 257,
    "ruecklage": 63,
    "rate": 1425,
    "zinsMonat": 1134,
    "tilgung": 291,
    "vorSteuer": 661,
    "ersparnis": 373,
    "anteil": 288,
    "laufend": 370,
    "ersparnisOhneGutachten": 244,
    "ersparnisJahr": 4480,
    "afa2": 4948,
    "afa4": 9895,
    "ergebnisJahr": -13581,
    "neuZuVersteuern": 37055,
    "lohnsteuerMonatNeu": 525,
    "nettoMonatNeu": 3714,
    "lohnsteuerMonat2": 654,
    "nettoMonat2": 3585,
    "mieteJahr": 12248,
    "zinsJahr": 13604,
    "kostenAbziehbarJahr": 2331,
    "freiMonate": 404,
    "freiJahr": 2059,
    "freiAlter": 58,
    "afaEndeAlter": 50,
    "wertFrei": 555100,
    "wert60": 570000,
    "wert65": 629300,
    "wert30": 516200,
    "schnitt30": 351,
    "bis49": 340,
    "max57": 770,
    "ueberschuss58": 1090,
    "restRaten": 8
  },
  "mehr": [
    {
      "vor": 661,
      "anfang": 288,
      "spaet": 770,
      "ab58": 1090,
      "zu": 153400
    },
    {
      "vor": 1322,
      "anfang": 629,
      "spaet": 1580,
      "ab58": 2170,
      "zu": 317300
    },
    {
      "vor": 1983,
      "anfang": 1086,
      "spaet": 2400,
      "ab58": 3260,
      "zu": 491700
    }
  ],
  "drei": {
    "rente65": 2320,
    "gerettet": 195000,
    "wert65": 1887900,
    "miete60": 4792,
    "miete": 1936760,
    "afa": 742140,
    "wertzuwachs": 1032874,
    "rente60": 2440,
    "rente60Vor": 3250,
    "verkauf60": 1709906,
    "renteAusVerkauf": 5700,
    "ersparnisJahr1": 897
  },
  "verlauf": [
    [
      25,
      285000,
      285000
    ],
    [
      26,
      281504,
      290700
    ],
    [
      27,
      277836,
      296514
    ],
    [
      28,
      273988,
      302444
    ],
    [
      29,
      269952,
      308493
    ],
    [
      30,
      265717,
      314663
    ],
    [
      31,
      261274,
      320956
    ],
    [
      32,
      256614,
      327375
    ],
    [
      33,
      251725,
      333923
    ],
    [
      34,
      246596,
      340601
    ],
    [
      35,
      241215,
      347413
    ],
    [
      36,
      235570,
      354362
    ],
    [
      37,
      229648,
      361449
    ],
    [
      38,
      223436,
      368678
    ],
    [
      39,
      216919,
      376051
    ],
    [
      40,
      210082,
      383572
    ],
    [
      41,
      202909,
      391244
    ],
    [
      42,
      195385,
      399069
    ],
    [
      43,
      187491,
      407050
    ],
    [
      44,
      179210,
      415191
    ],
    [
      45,
      170523,
      423495
    ],
    [
      46,
      161409,
      431965
    ],
    [
      47,
      151848,
      440604
    ],
    [
      48,
      141818,
      449416
    ],
    [
      49,
      131296,
      458405
    ],
    [
      50,
      120257,
      467573
    ],
    [
      51,
      108677,
      476924
    ],
    [
      52,
      96529,
      486463
    ],
    [
      53,
      83784,
      496192
    ],
    [
      54,
      70414,
      506116
    ],
    [
      55,
      56388,
      516238
    ],
    [
      56,
      41674,
      526563
    ],
    [
      57,
      26237,
      537094
    ],
    [
      58,
      10044,
      547836
    ],
    [
      59,
      0,
      558793
    ],
    [
      60,
      0,
      569969
    ],
    [
      61,
      0,
      581368
    ],
    [
      62,
      0,
      592995
    ],
    [
      63,
      0,
      604855
    ],
    [
      64,
      0,
      616952
    ],
    [
      65,
      0,
      629291
    ]
  ],
  "monate": [
    [
      25,
      -661,
      -288
    ],
    [
      26,
      -650,
      -285
    ],
    [
      27,
      -638,
      -281
    ],
    [
      28,
      -626,
      -279
    ],
    [
      29,
      -615,
      -276
    ],
    [
      30,
      -603,
      -274
    ],
    [
      31,
      -592,
      -273
    ],
    [
      32,
      -581,
      -271
    ],
    [
      33,
      -570,
      -271
    ],
    [
      34,
      -559,
      -270
    ],
    [
      35,
      -548,
      -270
    ],
    [
      36,
      -537,
      -271
    ],
    [
      37,
      -527,
      -272
    ],
    [
      38,
      -516,
      -274
    ],
    [
      39,
      -506,
      -276
    ],
    [
      40,
      -496,
      -279
    ],
    [
      41,
      -486,
      -282
    ],
    [
      42,
      -476,
      -286
    ],
    [
      43,
      -466,
      -291
    ],
    [
      44,
      -457,
      -297
    ],
    [
      45,
      -447,
      -303
    ],
    [
      46,
      -438,
      -310
    ],
    [
      47,
      -429,
      -318
    ],
    [
      48,
      -420,
      -326
    ],
    [
      49,
      -411,
      -336
    ],
    [
      50,
      -402,
      -647
    ],
    [
      51,
      -394,
      -660
    ],
    [
      52,
      -385,
      -675
    ],
    [
      53,
      -377,
      -691
    ],
    [
      54,
      -369,
      -708
    ],
    [
      55,
      -361,
      -727
    ],
    [
      56,
      -354,
      -747
    ],
    [
      57,
      -346,
      -769
    ],
    [
      58,
      235,
      -216
    ],
    [
      59,
      1093,
      633
    ],
    [
      60,
      1083,
      626
    ],
    [
      61,
      1073,
      619
    ],
    [
      62,
      1062,
      611
    ],
    [
      63,
      1052,
      604
    ],
    [
      64,
      1041,
      596
    ]
  ]
} as const;
