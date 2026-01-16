
import { GoogleGenAI } from "@google/genai";
import { AudioData } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  async analyzeMamaos(
    name: string,
    songTitle: string,
    rumpaka: string,
    data: AudioData,
    buana: string,
    quality: string
  ): Promise<string> {
    const prompt = `
      Identitas Juru Mamaos: ${name}
      Judul Lagu: ${songTitle}
      Rumpaka (Lirik): "${rumpaka}"
      Data Frekuensi Fisik: f1=${data.f1}Hz, f2=${data.f2}Hz, f3=${data.f3}Hz
      Dominansi Buana: ${buana}
      Kualitas Karakter: ${quality}

      Tugas: 
      Berikan narasi pameran seni digital yang puitis dan mendalam (Bahasa Indonesia). 
      - Awali dengan sapaan hormat: "Sampurasun Bp/Ibu ${name}".
      - Jelaskan bagaimana getaran suara mereka mencerminkan koneksi antara mikrokosmos dan makrokosmos.
      - Sisipkan satu paribasa Sunda kuno yang relevan dengan dominansi ${buana}.
      - Tutup dengan: "Hasil Triakustika Anda: Dominan pada Buana ${buana}. Kualitas: ${quality}." 
      - Sapaan penutup: "Tetaplah bergetar dalam harmoni Tembang Sunda. Rahayu, Cag Rampes."
      
      JANGAN gunakan tanda bintang (*) atau underscore (_).
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
      });
      return response.text?.replace(/[\*\_]/g, "") || "Gagal menghasilkan narasi.";
    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }

  async generateMusonography(buana: string, f3Value: number): Promise<{imageUrl: string, curatorial: string}> {
    const style = buana.includes("Nyungcung") ? "ethereal cosmic nebula" : "deep earthy volcanic textures";
    
    try {
      const textResponse = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: `Berikan kuratorial singkat (2-3 kalimat) untuk karya 'Musonography' frekuensi ${f3Value}Hz dalam konteks Tembang Sunda (${buana}). Tanpa tanda bintang (*).` }] }],
      });
      const curatorialText = textResponse.text?.replace(/[\*\_]/g, "") || "Visualisasi resonansi batin.";

      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{
          parts: [{ text: `Professional digital art 'Musonography'. Sundanese mystical frequency ${f3Value}Hz. Style: ${style}. High detail, 4k, cinematic. No text.` }],
        }],
        config: { imageConfig: { aspectRatio: "1:1" } },
      });

      let imageUrl = "https://picsum.photos/800/800";
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      
      return { imageUrl, curatorial: curatorialText };
    } catch (error) {
      return { imageUrl: "https://picsum.photos/800/800", curatorial: "Visualisasi batin." };
    }
  }
}
