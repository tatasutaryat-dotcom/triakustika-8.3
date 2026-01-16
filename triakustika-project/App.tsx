
import React, { useState, useEffect, useRef } from 'react';
import { GeminiService } from './services/geminiService';
import { AudioData, AnalysisResult, BuanaType, QualityType } from './types';

const VERSION_KEY = "TRIAKUSTIKA_ENGINE_V";
const CURRENT_VERSION = "8.6.0-DIAMOND";

const App: React.FC = () => {
  useEffect(() => {
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
  }, []);

  const [mamaosName, setMamaosName] = useState(() => localStorage.getItem('t_name') || '');
  const [songTitle, setSongTitle] = useState(() => localStorage.getItem('t_title') || '');
  const [rumpaka, setRumpaka] = useState(() => localStorage.getItem('t_text') || '');
  
  const [isSensing, setIsSensing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentFrequencies, setCurrentFrequencies] = useState<AudioData>({ f1: 0, f2: 0, f3: 0 });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
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

  const stopSensing = () => {
    setIsSensing(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    const mean = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b) / arr.length) : 0;
    const finalData = { f1: mean(h1Ref.current), f2: mean(h2Ref.current), f3: mean(h3Ref.current) };
    setCurrentFrequencies(finalData);
    performAIAnalysis(finalData);
  };

  const animate = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    for (let i = 0; i < 128; i++) {
      const barHeight = (dataArray[i] / 255) * canvasRef.current.height;
      const gradient = ctx.createLinearGradient(0, canvasRef.current.height, 0, 0);
      gradient.addColorStop(0, '#0ea5e9'); // Cyan
      gradient.addColorStop(1, '#f8fafc'); // Diamond White
      ctx.fillStyle = gradient;
      ctx.fillRect(i * (canvasRef.current.width / 128), canvasRef.current.height - barHeight, (canvasRef.current.width / 128) - 1, barHeight);
    }

    const hzPerBin = (audioCtxRef.current?.sampleRate || 44100) / analyserRef.current.fftSize;
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
    if (!mamaosName || !rumpaka) { alert("Data identitas belum lengkap."); return; }
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
    } catch (err) { alert("Koneksi AI Terhambat."); } finally { setIsLoading(false); }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#020617] text-slate-300 font-sans">
      {/* Visual Header Strip */}
      <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-white to-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)] z-[1000]"></div>
      
      <div className="flex-1 flex flex-col p-4 lg:p-8 gap-6 overflow-hidden">
        <header className="flex flex-col lg:flex-row justify-between items-center border-b border-white/5 pb-6">
          <div className="text-center lg:text-left">
            <div className="flex flex-col lg:flex-row items-center gap-4">
              <h1 className="text-3xl lg:text-4xl font-black bg-gradient-to-r from-cyan-400 to-slate-100 bg-clip-text text-transparent uppercase tracking-tight">
                Triakustika <span className="text-cyan-500 font-light">8.6</span>
              </h1>
              <span className="px-4 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Diamond Engine</span>
            </div>
            <p className="text-[10px] text-slate-500 font-bold tracking-[0.4em] uppercase mt-2">Sonic Anthropology — Tata Sutaryat</p>
          </div>
          
          <div className="hidden lg:flex flex-col items-end opacity-40">
            <span className="text-2xl font-mono font-bold text-cyan-100">{currentTime}</span>
            <span className="text-[9px] font-black uppercase tracking-widest">Calibration: Optimal</span>
          </div>
        </header>

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
          {/* Lirik Area (Left) */}
          <section className="lg:col-span-5 bg-white/[0.03] border border-white/5 rounded-3xl p-6 flex flex-col gap-4 shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-6 bg-cyan-500 rounded-full"></div>
              <label className="text-slate-400 font-bold uppercase tracking-widest text-xs">Rumpaka / Lirik</label>
            </div>
            <textarea 
              value={rumpaka} 
              onChange={(e) => setRumpaka(e.target.value)} 
              placeholder="Tuliskan lirik tembang di sini..." 
              className="flex-1 bg-black/20 border border-white/5 rounded-2xl p-6 text-cyan-50 placeholder:text-slate-700 outline-none resize-none text-lg lg:text-xl font-medium focus:border-cyan-500/20 transition-all scrollbar-hide"
            />
          </section>

          {/* Rec & Identity Area (Right) */}
          <section className="lg:col-span-7 flex flex-col gap-6 overflow-hidden">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-2">Identitas Penyanyi</label>
                <input 
                  type="text" placeholder="Juru Mamaos" value={mamaosName} 
                  onChange={(e) => setMamaosName(e.target.value)} 
                  className="w-full bg-white/[0.02] border border-white/5 focus:border-cyan-500/30 outline-none rounded-xl px-5 py-4 font-bold text-white transition-all text-sm uppercase tracking-wide" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-2">Judul Lagu</label>
                <input 
                  type="text" placeholder="Karya Tembang" value={songTitle} 
                  onChange={(e) => setSongTitle(e.target.value)} 
                  className="w-full bg-white/[0.02] border border-white/5 focus:border-cyan-500/30 outline-none rounded-xl px-5 py-4 font-bold text-white transition-all text-sm uppercase tracking-wide" 
                />
              </div>
            </div>
            
            <div className="flex-1 bg-slate-950 rounded-3xl border border-white/5 overflow-hidden relative shadow-inner group">
              <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-60" />
              {!isSensing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border border-cyan-500/10 rounded-full animate-ping mb-4" />
                  <span className="text-cyan-500/30 font-bold uppercase tracking-[0.6em] text-[9px]">Sensor Ready</span>
                </div>
              )}
            </div>

            <button 
              onClick={isSensing ? stopSensing : startSensing} 
              className={`w-full py-6 rounded-2xl font-black uppercase tracking-[0.4em] text-sm lg:text-lg transition-all transform active:scale-[0.98] shadow-lg border border-white/5 ${
                isSensing 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
              }`}
            >
              {isSensing ? 'Berhenti & Analisis' : 'Aktifkan Laboratorium'}
            </button>
          </section>
        </main>

        <footer className="py-4 border-t border-white/5 flex flex-col lg:flex-row justify-between items-center gap-4 opacity-30">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            v8.6.0 DIAMOND — TRIAKUSTIKA RESEARCH LAB
          </p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            © 2025 Tata Sutaryat — Sundanese Sonic Authority
          </p>
        </footer>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[1100] flex flex-col items-center justify-center p-8">
          <div className="w-16 h-16 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-8" />
          <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-[0.6em] text-white text-center">Spectral Processing</h2>
          <p className="text-cyan-500/50 font-bold text-[10px] uppercase tracking-widest mt-4 animate-pulse">Menghubungkan Mikrokosmos...</p>
        </div>
      )}

      {/* Result Display */}
      {analysisResult && (
        <div className="fixed inset-0 bg-[#020617] z-[1200] overflow-y-auto p-4 lg:p-12 animate-in fade-in slide-in-from-bottom-10 duration-500">
          <button onClick={() => setAnalysisResult(null)} className="fixed top-8 right-8 bg-white text-black w-12 h-12 rounded-full font-black text-xl z-[1300] shadow-xl hover:bg-cyan-500 hover:text-white transition-all">✕</button>
          
          <div className="max-w-6xl mx-auto space-y-12 py-10">
            <header className="text-center space-y-2">
              <span className="text-cyan-500 font-bold uppercase tracking-[0.6em] text-[10px]">Sonic Manifestation Report</span>
              <h3 className="text-4xl lg:text-6xl font-black text-white uppercase tracking-tighter">Resonansi <span className="text-cyan-500">Batin</span></h3>
            </header>

            <div className="grid lg:grid-cols-2 gap-10 items-start">
              <div className="bg-white/[0.02] p-8 lg:p-12 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <p className="text-xl lg:text-3xl leading-relaxed italic text-slate-200 font-serif whitespace-pre-line">
                  {analysisResult.text}
                </p>
              </div>
              
              <div className="space-y-8">
                <div className="rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 relative group aspect-square max-w-md mx-auto">
                  <img src={analysisResult.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[8s]" alt="Musonography" />
                  <div className="absolute inset-x-0 bottom-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs text-slate-300 italic">"{analysisResult.curatorial}"</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <div className="bg-cyan-500/5 p-6 rounded-3xl border border-cyan-500/10 text-center">
                    <span className="block text-[8px] font-black text-cyan-500 uppercase tracking-widest mb-1">Dominansi</span>
                    <span className="text-xs font-bold text-white uppercase">{analysisResult.dominantBuana}</span>
                  </div>
                  <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center">
                    <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Karakter</span>
                    <span className="text-xs font-bold text-white uppercase">{analysisResult.quality}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
