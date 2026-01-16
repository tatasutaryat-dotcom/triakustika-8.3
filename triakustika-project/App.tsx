
import React, { useState, useEffect, useRef } from 'react';
import { GeminiService } from './services/geminiService';
import { AudioData, AnalysisResult, BuanaType, QualityType } from './types';

const App: React.FC = () => {
  const [mamaosName, setMamaosName] = useState(() => localStorage.getItem('t_name') || '');
  const [songTitle, setSongTitle] = useState(() => localStorage.getItem('t_title') || '');
  const [rumpaka, setRumpaka] = useState(() => localStorage.getItem('t_text') || '');
  
  const [isSensing, setIsSensing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentFrequencies, setCurrentFrequencies] = useState<AudioData>({ f1: 0, f2: 0, f3: 0 });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const h1Ref = useRef<number[]>([]);
  const h2Ref = useRef<number[]>([]);
  const h3Ref = useRef<number[]>([]);

  useEffect(() => {
    localStorage.setItem('t_name', mamaosName);
    localStorage.setItem('t_title', songTitle);
    localStorage.setItem('t_text', rumpaka);
  }, [mamaosName, songTitle, rumpaka]);

  useEffect(() => {
    const win = window as any;
    if (analysisResult && win.QRCode) {
      const shareUrl = window.location.origin; 
      win.QRCode.toDataURL(shareUrl, { 
        width: 600, 
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      }, (err: any, url: string) => {
        if (!err) setQrCodeUrl(url);
      });
    }
  }, [analysisResult]);

  const startSensing = async () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      source.connect(analyser);
      h1Ref.current = []; h2Ref.current = []; h3Ref.current = [];
      setIsSensing(true);
      animate();
    } catch (err) {
      alert("Izin mikrofon diperlukan untuk melakukan analisis frekuensi.");
    }
  };

  const stopSensing = (triggerAnalysis = true) => {
    setIsSensing(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (triggerAnalysis) {
      const mean = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b) / arr.length) : 0;
      const finalData = { f1: mean(h1Ref.current), f2: mean(h2Ref.current), f3: mean(h3Ref.current) };
      setCurrentFrequencies(finalData);
      performAIAnalysis(finalData);
    }
  };

  const animate = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 128; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      ctx.fillStyle = `hsla(${(i / 128) * 360}, 80%, 60%, 0.8)`;
      ctx.fillRect(i * (canvas.width / 128), canvas.height - barHeight, (canvas.width / 128) - 1, barHeight);
    }
    const hzPerBin = (audioCtxRef.current?.sampleRate || 44100) / analyser.fftSize;
    [{s:250,e:320,r:h1Ref}, {s:350,e:480,r:h2Ref}, {s:550,e:750,r:h3Ref}].forEach(rng => {
      let max = 0;
      for (let h = rng.s; h <= rng.e; h++) {
        const b = Math.round(h/hzPerBin);
        if(dataArray[b] > max) max = dataArray[b];
      }
      if(max > 40) rng.r.current.push(max);
    });
    animationRef.current = requestAnimationFrame(animate);
  };

  const performAIAnalysis = async (data: AudioData) => {
    if (!mamaosName || !rumpaka) { 
      alert("Silakan lengkapi Nama Juru Mamaos dan Rumpaka lirik terlebih dahulu."); 
      return; 
    }
    setIsLoading(true);
    try {
      const gemini = new GeminiService();
      const vals = [data.f1, data.f2, data.f3];
      const maxIdx = vals.indexOf(Math.max(...vals));
      const buanas = [BuanaType.LARANG, BuanaType.TENGAH, BuanaType.NYUNGCUNG];
      const qualities = [QualityType.CAGEUR_BENER, QualityType.BAGEUR_SINGER, QualityType.PINTER];
      
      const [narrative, muso] = await Promise.all([
        gemini.analyzeMamaos(mamaosName, songTitle, rumpaka, data, buanas[maxIdx], qualities[maxIdx]),
        gemini.generateMusonography(buanas[maxIdx], data.f3)
      ]);

      setAnalysisResult({
        text: narrative,
        curatorial: muso.curatorial,
        imageUrl: muso.imageUrl,
        dominantBuana: buanas[maxIdx],
        quality: qualities[maxIdx],
        timestamp: new Date().toLocaleString()
      });
    } catch (err) {
      alert("Terjadi kesalahan saat menghubungi sistem AI.");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadPoster = async () => {
    if (!analysisResult) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = analysisResult.imageUrl;

    img.onload = () => {
      const padding = 80;
      const textSpace = 300;
      canvas.width = img.width;
      canvas.height = img.height + textSpace;

      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, img.height, canvas.width, textSpace);

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 40px Arial";
      ctx.fillText("MUSONOGRAPHY V.8", padding, img.height + 70);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "italic 28px Georgia, serif";
      const words = analysisResult.curatorial.split(' ');
      let line = '';
      let y = img.height + 130;
      const maxWidth = canvas.width - (padding * 2);

      for(let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, padding, y);
          line = words[n] + ' ';
          y += 45;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, padding, y);

      ctx.fillStyle = "#6366f1";
      ctx.font = "bold 22px Arial";
      ctx.fillText("TRIAKUSTIKA SUNDA © 2025", padding, canvas.height - 40);

      const link = document.createElement('a');
      link.download = `Triakustika_Karya_${mamaosName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
  };

  const generatePDF = () => {
    const { jspdf } = window as any;
    if (!jspdf || !analysisResult) return;
    const doc = new jspdf.jsPDF();
    doc.setFillColor(2, 6, 23); 
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(255, 255, 255); 
    doc.setFontSize(26); 
    doc.text(`TRIAKUSTIKA 8.3 AUTHORITY`, 105, 40, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`Digital Sonic Laboratory - Tata Sutaryat`, 105, 48, { align: 'center' });
    doc.setDrawColor(99, 102, 241);
    doc.line(40, 55, 170, 55);
    
    doc.setFontSize(18); 
    doc.text(`Sertifikat Resonansi Batin`, 105, 75, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Identitas:`, 30, 95);
    doc.setFontSize(16);
    doc.text(`${mamaosName}`, 30, 105);
    
    doc.setFontSize(12);
    doc.text(`Karya Tembang:`, 30, 120);
    doc.setFontSize(16);
    doc.text(`${songTitle || 'Tanpa Judul'}`, 30, 130);
    
    doc.setFontSize(12);
    doc.text(`Dominansi Buana:`, 30, 145);
    doc.setFontSize(16);
    doc.setTextColor(251, 191, 36);
    doc.text(`${analysisResult.dominantBuana}`, 30, 155);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(analysisResult.text, 150);
    doc.text(splitText, 30, 175);
    
    doc.text(`Waktu Analisis: ${analysisResult.timestamp}`, 30, 270);
    doc.save(`Triakustika_Sertifikat_${mamaosName}.pdf`);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden p-3 lg:p-6 gap-3 bg-[#020617] text-slate-200">
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-indigo-500/20 pb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-4xl font-black bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent uppercase tracking-tighter">Triakustika 8.3</h1>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/30 animate-pulse">
               <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
               <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">LIVE SYSTEM v8.3.5</span>
            </div>
          </div>
          <span className="text-xs lg:text-sm text-indigo-400/80 font-black tracking-[0.3em] uppercase mt-1">
            Digital Sonic Lab — Tata Sutaryat
          </span>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
        {/* Rumpaka Section */}
        <section className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl backdrop-blur-md overflow-hidden group">
          <div className="flex justify-between items-center">
            <label className="text-amber-500 font-black uppercase tracking-[0.2em] text-[11px] flex items-center gap-2">
              <span className="w-4 h-[2px] bg-amber-500"></span>
              Rumpaka Lirik
            </label>
          </div>
          <textarea 
            value={rumpaka} 
            onChange={(e) => setRumpaka(e.target.value)} 
            placeholder="Tulis lirik tembang di sini..." 
            className="flex-1 bg-black/60 border border-slate-800 rounded-xl p-4 lg:p-6 text-emerald-400 placeholder:text-slate-800 outline-none resize-none text-lg lg:text-2xl font-bold focus:border-indigo-500/50 transition-all scrollbar-hide shadow-inner"
          />
        </section>

        {/* Sensing Section */}
        <section className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 flex flex-col gap-4 relative shadow-2xl backdrop-blur-md overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-black text-indigo-400/80 tracking-widest ml-1">Nama Juru Mamaos</label>
              <input 
                type="text" 
                placeholder="Identitas Mamaos" 
                value={mamaosName} 
                onChange={(e) => setMamaosName(e.target.value)} 
                className="bg-black/60 border border-slate-800 focus:border-indigo-500/50 outline-none rounded-xl px-4 py-3 font-black text-sm lg:text-base text-white transition-all shadow-md placeholder:text-slate-800" 
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-black text-indigo-400/80 tracking-widest ml-1">Judul Tembang</label>
              <input 
                type="text" 
                placeholder="Judul Karya" 
                value={songTitle} 
                onChange={(e) => setSongTitle(e.target.value)} 
                className="bg-black/60 border border-slate-800 focus:border-indigo-500/50 outline-none rounded-xl px-4 py-3 font-black text-sm lg:text-base text-white transition-all shadow-md placeholder:text-slate-800" 
              />
            </div>
          </div>
          
          <div className="flex-1 bg-black rounded-2xl border border-indigo-500/10 overflow-hidden relative shadow-2xl group">
            <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            {!isSensing && currentFrequencies.f1 === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-slate-800 font-black uppercase tracking-[0.5em] text-[10px]">Frequency Engine Standby</span>
                <div className="w-32 h-[1px] bg-indigo-500/10 mt-2"></div>
              </div>
            )}
          </div>

          <button 
            onClick={isSensing ? () => stopSensing() : startSensing} 
            className={`w-full py-5 lg:py-6 rounded-2xl font-black uppercase tracking-[0.3em] text-sm lg:text-2xl transition-all transform active:scale-[0.98] shadow-2xl flex items-center justify-center gap-3 ${
              isSensing 
                ? 'bg-red-600 animate-pulse shadow-red-900/40 text-white ring-4 ring-red-600/20' 
                : 'bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:scale-[1.01] shadow-indigo-900/40 text-white border border-white/10'
            }`}
          >
            {isSensing ? (
              <>
                <span className="w-3 h-3 bg-white rounded-full animate-ping"></span>
                Berhenti & Analisis
              </>
            ) : 'Mulai Recording'}
          </button>
        </section>
      </main>

      <footer className="w-full py-4 lg:py-8 border-t border-indigo-500/10 flex flex-col items-center gap-2 mt-auto">
        <div className="flex items-center gap-4 opacity-40 group hover:opacity-100 transition-opacity">
           <div className="h-[1px] w-12 bg-indigo-500"></div>
           <h4 className="font-black text-xs lg:text-base text-slate-300 tracking-[0.4em] uppercase">Triakustika Sunda</h4>
           <div className="h-[1px] w-12 bg-indigo-500"></div>
        </div>
        <p className="text-[9px] lg:text-[11px] uppercase tracking-[0.3em] font-black text-slate-500/80">
          Digital Sonic Laboratory — Versi 8.3.5 Master — © 2025 Tata Sutaryat
        </p>
      </footer>

      {/* Modern Loading Glassmorphism */}
      {isLoading && (
        <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-2xl z-[300] flex flex-col items-center justify-center p-8 text-center">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 border-[6px] border-indigo-500/5 rounded-full" />
            <div className="absolute inset-0 border-[6px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-4 border-[2px] border-emerald-500/20 border-b-transparent rounded-full animate-[spin_1.5s_linear_infinite]" />
          </div>
          <h2 className="text-2xl lg:text-4xl font-black uppercase tracking-[0.4em] bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent mb-3">AI Resonansi</h2>
          <p className="text-slate-500 font-black max-w-sm uppercase text-[9px] tracking-[0.2em] leading-relaxed opacity-60">
            Mengukur panca waluya melalui algoritma getaran semesta...
          </p>
        </div>
      )}

      {/* Enhanced Result Modal */}
      {analysisResult && (
        <div className="fixed inset-0 bg-[#020617] z-[200] overflow-y-auto p-4 lg:p-12 animate-in fade-in zoom-in duration-700">
          <button 
            onClick={() => setAnalysisResult(null)} 
            className="fixed top-6 right-6 bg-slate-800/80 hover:bg-white hover:text-black w-12 h-12 rounded-full font-black text-xl transition-all active:scale-90 z-[210] shadow-2xl border border-white/10 flex items-center justify-center"
          >
            ✕
          </button>
          
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 py-4">
            <div className="space-y-8">
              <div className="space-y-2">
                <span className="text-indigo-400 font-black uppercase tracking-[0.3em] text-[10px] block">Laporan Laboratorium Sonic</span>
                <h3 className="text-3xl lg:text-6xl font-black text-amber-500 uppercase leading-none tracking-tighter">Narasi Getaran</h3>
              </div>
              <div className="bg-slate-900/40 border border-white/5 p-8 lg:p-12 rounded-[2.5rem] text-xl lg:text-3xl leading-relaxed shadow-2xl backdrop-blur-3xl italic text-slate-100 font-serif relative">
                <span className="absolute -top-6 -left-2 text-8xl text-indigo-500/10 font-serif">“</span>
                {analysisResult.text}
              </div>
              <div className="flex gap-4">
                <div className="flex-1 bg-indigo-900/20 border border-indigo-500/20 p-5 rounded-3xl text-center shadow-xl group hover:border-indigo-500/50 transition-colors">
                  <span className="block text-[9px] uppercase text-indigo-400 font-black mb-1.5 tracking-widest opacity-60">Dominansi Buana</span>
                  <span className="font-black text-white block text-sm lg:text-xl uppercase tracking-tighter">{analysisResult.dominantBuana}</span>
                </div>
                <div className="flex-1 bg-emerald-900/20 border border-emerald-500/20 p-5 rounded-3xl text-center shadow-xl group hover:border-emerald-500/50 transition-colors">
                  <span className="block text-[9px] uppercase text-emerald-400 font-black mb-1.5 tracking-widest opacity-60">Kualitas Batin</span>
                  <span className="font-black text-white block text-sm lg:text-xl uppercase tracking-tighter">{analysisResult.quality}</span>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-slate-900/40 rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl flex flex-col group">
                <div className="relative overflow-hidden aspect-square">
                  <img 
                    src={analysisResult.imageUrl} 
                    alt="Musonography"
                    className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110" 
                  />
                  <div className="absolute top-6 left-6 bg-indigo-600/90 shadow-2xl text-white px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 backdrop-blur-md">
                    MUSONOGRAPHY MASTER v8
                  </div>
                </div>
                
                <div className="p-8 bg-black/40 border-t border-white/5">
                  <h5 className="text-amber-500 font-black uppercase text-[11px] tracking-[0.4em] mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                    Kuratorial Visual:
                  </h5>
                  <p className="text-slate-300 text-base lg:text-xl font-medium leading-relaxed italic mb-6">
                    "{analysisResult.curatorial}"
                  </p>
                  <button 
                    onClick={downloadPoster}
                    className="flex items-center gap-3 text-indigo-400 hover:text-white font-black uppercase text-[11px] tracking-[0.2em] transition-all group/btn"
                  >
                    <div className="p-3 bg-indigo-500/10 rounded-2xl group-hover/btn:bg-indigo-500 group-hover/btn:text-white transition-all shadow-xl">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    </div>
                    <span>Arsip Karya Digital</span>
                  </button>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[3rem] flex flex-col items-center gap-6 shadow-2xl">
                <div className="text-center">
                  <h4 className="text-slate-950 font-black uppercase tracking-[0.2em] text-xl lg:text-2xl">Otoritas Digital</h4>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest italic mt-1">Pindai QR untuk otentikasi smartphone</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-[2rem] shadow-inner">
                  <img src={qrCodeUrl} className="w-32 h-32 lg:w-48 lg:h-48 rounded-2xl" alt="QR Code" />
                </div>
                <button 
                  onClick={generatePDF} 
                  className="w-full bg-slate-950 hover:bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-[0.3em] transition-all transform active:scale-[0.97] flex items-center justify-center gap-3 text-sm lg:text-lg shadow-2xl"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                  Cetak Sertifikat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
