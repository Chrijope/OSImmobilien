// Image map for resolving seed image keys to actual imports
import waldachtal1 from "@/assets/objekt-waldachtal-1.jpg";
import waldachtalInnen from "@/assets/objekt-waldachtal-innen.jpg";
import straubing1 from "@/assets/objekt-straubing-1.jpg";
import mannheim1 from "@/assets/objekt-mannheim-1.jpg";
import innenBad from "@/assets/objekt-innen-bad.jpg";
import innenSchlafzimmer from "@/assets/objekt-innen-schlafzimmer.jpg";
import regensburg1 from "@/assets/objekt-regensburg-1.jpg";
import herrenberg1 from "@/assets/objekt-herrenberg-1.jpg";
import augsburg1 from "@/assets/objekt-augsburg-1.jpg";
import memmingen1 from "@/assets/objekt-memmingen-1.jpeg";
import memmingen2 from "@/assets/objekt-memmingen-2.jpeg";
import memmingen3 from "@/assets/objekt-memmingen-3.jpeg";
import memmingen4 from "@/assets/objekt-memmingen-4.jpeg";
import memmingen5 from "@/assets/objekt-memmingen-5.jpeg";
import memmingen6 from "@/assets/objekt-memmingen-6.jpeg";
import memmingen7 from "@/assets/objekt-memmingen-7.jpeg";
import memWhg19Bad from "@/assets/memmingen-whg19-bad.jpg";
import memWhg19Flur from "@/assets/memmingen-whg19-flur.jpg";
import memWhg19Kueche from "@/assets/memmingen-whg19-kueche.jpg";
import memWhg19Schlafen from "@/assets/memmingen-whg19-schlafen.jpg";
import memWhg19Keller from "@/assets/memmingen-whg19-keller.jpg";

const IMAGE_MAP: Record<string, string> = {
  "__waldachtal1__": waldachtal1,
  "__waldachtal_innen__": waldachtalInnen,
  "__straubing1__": straubing1,
  "__mannheim1__": mannheim1,
  "__innen_bad__": innenBad,
  "__innen_schlafzimmer__": innenSchlafzimmer,
  "__regensburg1__": regensburg1,
  "__herrenberg1__": herrenberg1,
  "__augsburg1__": augsburg1,
  "__memmingen1__": memmingen1,
  "__memmingen2__": memmingen2,
  "__memmingen3__": memmingen3,
  "__memmingen4__": memmingen4,
  "__memmingen5__": memmingen5,
  "__memmingen6__": memmingen6,
  "__memmingen7__": memmingen7,
  "__mem_whg19_bad__": memWhg19Bad,
  "__mem_whg19_flur__": memWhg19Flur,
  "__mem_whg19_kueche__": memWhg19Kueche,
  "__mem_whg19_schlafen__": memWhg19Schlafen,
  "__mem_whg19_keller__": memWhg19Keller,
};

export function resolveImageUrl(url: string): string {
  return IMAGE_MAP[url] || url;
}
