
export interface AudioData {
  f1: number;
  f2: number;
  f3: number;
}

export interface AnalysisResult {
  text: string;
  curatorial: string;
  imageUrl: string;
  dominantBuana: string;
  quality: string;
  timestamp: string;
}

export enum BuanaType {
  LARANG = "Larang (Grounding)",
  TENGAH = "Panca Tengah (Emosi)",
  NYUNGCUNG = "Nyungcung (Transendensi)"
}

export enum QualityType {
  CAGEUR_BENER = "CAGEUR & BENER",
  BAGEUR_SINGER = "BAGEUR & SINGER",
  PINTER = "PINTER"
}
