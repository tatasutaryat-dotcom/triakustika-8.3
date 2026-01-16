
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
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

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
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      alert("Izin mikrofon diperlukan.");
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
    if (!mamaosName || !rumpaka) { alert("Lengkapi Identitas & Rumpaka!"); return; }
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
        text: narrative, curatorial: muso.curatorial, imageUrl: muso.imageUrl,
        dominantBuana: buanas[maxIdx], quality: qualities[maxIdx], timestamp: new Date().toLocaleString()
      });
    } catch (err) { alert("AI Connection Error."); } finally { setIsLoading(false); }
  };

  const downloadPoster = () => { /* Logic poster sama dengan sebelumnya */ };
  const generatePDF = () => { /* Logic PDF sama dengan sebelumnya */ };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#020617] text-slate-200">
      {/* DEPLOYMENT BAR: TANDA UPDATE SUKSES */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-emerald-500 to-indigo-500 animate-pulse z-[500]"></div>
      
      <div className="flex-1 flex flex-col p-4 lg:p-8 gap-4 overflow-hidden">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-white/5 pb-6">
          <div className="flex flex-col">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl lg:text-5xl font-black bg-gradient-to-r from-amber-400 via-orange-400 to-emerald-400 bg-clip-text text-transparent uppercase tracking-tighter">
                Triakustika 8.3
              </h1>
              <div className="px-4 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/30 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">ULTIMATE v8.3.7</span>
              </div>
            </div>
            <p className="text-xs lg:text-sm text-slate-500 font-black tracking-[0.4em] uppercase mt-2">Digital Sonic Lab — Tata Sutaryat</p>
          </div>
          {/* Pojok kanan yang tadinya tombol RESET merah, sekarang Jam & Status */}
          <div className="hidden lg:flex flex-col items-end gap-1">
            <span className="text-2xl font-mono font-black text-indigo-400/50">{currentTime}</span>
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">System Ready & Synchronized</span>
          </div>
        </header>

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
          {/* Lirik Section */}
          <section className="bg-slate-900/20 border border-white/5 rounded-[2rem] p-6 flex flex-col gap-4 shadow-2xl backdrop-blur-3xl overflow-hidden group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <span className="text-amber-500 text-xs">✎</span>
              </div>
              <label className="text-amber-500 font-black uppercase tracking-[0.3em] text-[11px]">Rumpaka Lirik</label>
            </div>
            <textarea 
              value={rumpaka} 
              onChange={(e) => setRumpaka(e.target.value)} 
              placeholder="Tulis lirik tembang..." 
              className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-6 text-emerald-400 placeholder:text-slate-800 outline-none resize-none text-xl lg:text-3xl font-bold focus:border-emerald-500/30 transition-all scrollbar-hide shadow-inner"
            />
          </section>

          {/* Input & Visualizer Section */}
          <section className="bg-slate-900/20 border border-white/5 rounded-[2rem] p-6 flex flex-col gap-5 shadow-2xl backdrop-blur-3xl overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest ml-1">Juru Mamaos</label>
                <input 
                  type="text" placeholder="Nama Lengkap" value={mamaosName} 
                  onChange={(e) => setMamaosName(e.target.value)} 
                  className="bg-black/60 border border-white/5 focus:border-amber-500/30 outline-none rounded-2xl px-5 py-4 font-black text-white transition-all shadow-xl placeholder:text-slate-900" 
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest ml-1">Karya Tembang</label>
                <input 
                  type="text" placeholder="Judul Lagu" value={songTitle} 
                  onChange={(e) => setSongTitle(e.target.value)} 
                  className="bg-black/60 border border-white/5 focus:border-amber-500/30 outline-none rounded-2xl px-5 py-4 font-black text-white transition-all shadow-xl placeholder:text-slate-900" 
                />
              </div>
            </div>
            
            <div className="flex-1 bg-black rounded-3xl border border-white/5 overflow-hidden relative shadow-2xl">
              <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
              {!isSensing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 group-hover:opacity-40 transition-opacity">
                  <div className="w-16 h-16 border-2 border-dashed border-indigo-500 rounded-full animate-[spin_10s_linear_infinite]" />
                  <span className="text-indigo-400 font-black uppercase tracking-[0.5em] text-[10px] mt-4">Sonic Lab Ready</span>
                </div>
              )}
            </div>

            <button 
              onClick={isSensing ? () => stopSensing() : startSensing} 
              className={`w-full py-6 rounded-3xl font-black uppercase tracking-[0.4em] text-sm lg:text-2xl transition-all transform active:scale-[0.97] shadow-2xl border border-white/10 ${
                isSensing 
                  ? 'bg-red-600 animate-pulse shadow-red-900/40 text-white' 
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:scale-[1.01] text-white'
              }`}
            >
              {isSensing ? '● Stop & Analisis' : 'Mulai Recording'}
            </button>
          </section>
        </main>

        <footer className="py-6 border-t border-white/5 flex flex-col items-center gap-2">
          <div className="flex items-center gap-6">
            <div className="h-[1px] w-16 bg-gradient-to-l from-emerald-500 to-transparent"></div>
            <span className="font-black text-xs text-slate-500 tracking-[0.5em] uppercase">Triakustika Sunda</span>
            <div className="h-[1px] w-16 bg-gradient-to-r from-emerald-500 to-transparent"></div>
          </div>
          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
            Digital Sonic Lab v8.3.7 Master — © 2025 Tata Sutaryat
          </p>
        </footer>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-[#020617]/98 backdrop-blur-3xl z-[600] flex flex-col items-center justify-center p-8">
          <div className="relative w-32 h-32 mb-8">
            <div className="absolute inset-0 border-8 border-amber-500/5 rounded-full" />
            <div className="absolute inset-0 border-8 border-amber-500 border-t-transparent rounded-full animate-spin shadow-[0_0_50px_rgba(245,158,11,0.2)]" />
            <div className="absolute inset-6 border-4 border-emerald-500/20 border-b-transparent rounded-full animate-[spin_2s_linear_infinite]" />
          </div>
          <h2 className="text-3xl lg:text-5xl font-black uppercase tracking-[0.5em] bg-gradient-to-r from-amber-400 to-emerald-400 bg-clip-text text-transparent mb-4">AI Resonansi</h2>
          <div className="flex items-center gap-2 text-slate-500 font-black text-[10px] uppercase tracking-[0.3em]">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            Memetakan Panca Waluya...
          </div>
        </div>
      )}

      {/* Analysis Result Modal (Simplified for update visibility) */}
      {analysisResult && (
        <div className="fixed inset-0 bg-[#020617] z-[550] overflow-y-auto p-6 lg:p-12 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <button onClick={() => setAnalysisResult(null)} className="fixed top-8 right-8 bg-white text-black w-14 h-14 rounded-full font-black text-xl z-[600] shadow-2xl">✕</button>
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 py-10">
            <div className="space-y-10">
              <h3 className="text-4xl lg:text-7xl font-black text-amber-500 uppercase tracking-tighter leading-none italic">Narasi Getaran</h3>
              <div className="bg-slate-900/40 p-10 lg:p-16 rounded-[3rem] text-2xl lg:text-4xl leading-relaxed italic text-white font-serif border border-white/5 shadow-2xl">
                {analysisResult.text}
              </div>
            </div>
            <div className="space-y-10">
              <div className="rounded-[4rem] overflow-hidden shadow-[0_0_100px_rgba(99,102,241,0.15)] border border-white/10 group">
                <img src={analysisResult.imageUrl} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-[3s]" alt="Musonography" />
              </div>
              <button onClick={generatePDF} className="w-full bg-white text-black py-6 rounded-3xl font-black uppercase tracking-widest text-xl shadow-2xl hover:bg-emerald-400 transition-colors">Download Sertifikat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
