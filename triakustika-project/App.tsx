
import React, { useState, useEffect, useRef } from 'react';
import { GeminiService } from './services/geminiService';
import { AudioData, AnalysisResult, BuanaType, QualityType } from './types';

const APP_VERSION = "8.4.0-REBORN";

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

  // Force Update Detection
  useEffect(() => {
    const savedVer = localStorage.getItem('app_version');
    if (savedVer !== APP_VERSION) {
      localStorage.setItem('app_version', APP_VERSION);
      console.log("System Updated to " + APP_VERSION);
    }
  }, []);

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
        color: { dark: '#050112', light: '#ffffff' }
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
      alert("Izin mikrofon diperlukan untuk laboratorium sonic.");
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
    const ctx = canvasRef.current.getContext('2d')!;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    ctx.fillStyle = '#050112';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    for (let i = 0; i < 128; i++) {
      const barHeight = (dataArray[i] / 255) * canvasRef.current.height;
      const gradient = ctx.createLinearGradient(0, canvasRef.current.height, 0, 0);
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(1, '#ec4899');
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
    } catch (err) { alert("Koneksi AI Terputus."); } finally { setIsLoading(false); }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#050112] text-slate-200 font-sans selection:bg-pink-500/30">
      {/* Top Border Glow - Tanda Update v8.4 */}
      <div className="h-1.5 w-full bg-gradient-to-r from-violet-600 via-pink-600 to-amber-600 shadow-[0_0_20px_rgba(236,72,153,0.5)] z-[500]"></div>
      
      <div className="flex-1 flex flex-col p-4 lg:p-10 gap-6 overflow-hidden">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-white/10 pb-8">
          <div className="flex flex-col">
            <div className="flex items-center gap-5">
              <h1 className="text-4xl lg:text-6xl font-black bg-gradient-to-r from-violet-400 via-magenta-400 to-pink-400 bg-clip-text text-transparent uppercase tracking-tighter">
                Triakustika 8.4
              </h1>
              <div className="px-5 py-2 bg-pink-500/10 rounded-2xl border border-pink-500/30 flex items-center gap-3 backdrop-blur-md">
                <span className="w-2.5 h-2.5 bg-pink-500 rounded-full animate-pulse shadow-[0_0_10px_#ec4899]"></span>
                <span className="text-[11px] font-black text-pink-400 uppercase tracking-[0.3em]">REBORN v8.4.0</span>
              </div>
            </div>
            <p className="text-xs lg:text-sm text-violet-400/60 font-black tracking-[0.5em] uppercase mt-3">Digital Sonic Authority — Tata Sutaryat</p>
          </div>
          
          <div className="hidden lg:flex flex-col items-end gap-2 p-4 bg-white/5 rounded-3xl border border-white/5">
            <span className="text-3xl font-mono font-black text-violet-300 drop-shadow-sm">{currentTime}</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Encrypted Connection Active</span>
          </div>
        </header>

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-hidden">
          {/* Lirik Area */}
          <section className="bg-slate-900/10 border border-white/5 rounded-[3rem] p-8 flex flex-col gap-6 shadow-2xl backdrop-blur-3xl overflow-hidden group hover:border-pink-500/20 transition-all duration-700">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                <span className="text-violet-400 text-sm">✦</span>
              </div>
              <label className="text-violet-400 font-black uppercase tracking-[0.4em] text-[12px]">Rumpaka Lirik</label>
            </div>
            <textarea 
              value={rumpaka} 
              onChange={(e) => setRumpaka(e.target.value)} 
              placeholder="Input teks lirik tembang..." 
              className="flex-1 bg-black/40 border border-white/5 rounded-3xl p-8 text-pink-300 placeholder:text-slate-900 outline-none resize-none text-2xl lg:text-4xl font-black focus:border-pink-500/30 transition-all scrollbar-hide shadow-inner leading-tight"
            />
          </section>

          {/* Sensing Area */}
          <section className="bg-slate-900/10 border border-white/5 rounded-[3rem] p-8 flex flex-col gap-6 shadow-2xl backdrop-blur-3xl overflow-hidden hover:border-violet-500/20 transition-all duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <label className="text-[11px] uppercase font-black text-slate-600 tracking-widest ml-2">Juru Mamaos</label>
                <input 
                  type="text" placeholder="Identitas Penyanyi" value={mamaosName} 
                  onChange={(e) => setMamaosName(e.target.value)} 
                  className="bg-black/60 border border-white/5 focus:border-violet-500/40 outline-none rounded-2xl px-6 py-5 font-black text-white transition-all shadow-xl placeholder:text-slate-900 text-lg" 
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[11px] uppercase font-black text-slate-600 tracking-widest ml-2">Karya Tembang</label>
                <input 
                  type="text" placeholder="Judul Tembang" value={songTitle} 
                  onChange={(e) => setSongTitle(e.target.value)} 
                  className="bg-black/60 border border-white/5 focus:border-violet-500/40 outline-none rounded-2xl px-6 py-5 font-black text-white transition-all shadow-xl placeholder:text-slate-900 text-lg" 
                />
              </div>
            </div>
            
            <div className="flex-1 bg-black rounded-[2.5rem] border border-white/5 overflow-hidden relative shadow-inner group">
              <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050112] via-transparent to-transparent pointer-events-none" />
              {!isSensing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30">
                  <div className="w-20 h-20 border-2 border-dashed border-pink-500/30 rounded-full animate-[spin_20s_linear_infinite]" />
                  <span className="text-pink-500/50 font-black uppercase tracking-[0.8em] text-[10px] mt-6">Spectral Core Idle</span>
                </div>
              )}
            </div>

            <button 
              onClick={isSensing ? () => stopSensing() : startSensing} 
              className={`w-full py-8 rounded-[2.5rem] font-black uppercase tracking-[0.5em] text-sm lg:text-3xl transition-all transform active:scale-[0.96] shadow-2xl border border-white/10 ${
                isSensing 
                  ? 'bg-crimson-600 bg-red-600 animate-pulse shadow-[0_0_40px_rgba(220,38,38,0.4)] text-white' 
                  : 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 hover:shadow-[0_0_50px_rgba(139,92,246,0.3)] text-white'
              }`}
            >
              {isSensing ? '● Stop Transmisi' : 'Aktifkan Sensor'}
            </button>
          </section>
        </main>

        <footer className="py-8 border-t border-white/5 flex flex-col items-center gap-3">
          <div className="flex items-center gap-8">
            <div className="h-[1.5px] w-24 bg-gradient-to-l from-violet-500 to-transparent"></div>
            <span className="font-black text-sm text-slate-500 tracking-[0.6em] uppercase">Triakustika Authority</span>
            <div className="h-[1.5px] w-24 bg-gradient-to-r from-violet-500 to-transparent"></div>
          </div>
          <p className="text-[11px] font-black text-slate-700 uppercase tracking-widest flex gap-4">
            <span>Core v8.4.0</span>
            <span className="opacity-30">|</span>
            <span>Sundanese Sonic Intelligence</span>
            <span className="opacity-30">|</span>
            <span>© 2025 Tata Sutaryat</span>
          </p>
        </footer>
      </div>

      {/* Loading Overlay v8.4 */}
      {isLoading && (
        <div className="fixed inset-0 bg-[#050112]/98 backdrop-blur-3xl z-[600] flex flex-col items-center justify-center p-12">
          <div className="relative w-40 h-40 mb-10">
            <div className="absolute inset-0 border-[10px] border-violet-500/5 rounded-full" />
            <div className="absolute inset-0 border-[10px] border-violet-500 border-t-transparent rounded-full animate-spin shadow-[0_0_80px_rgba(139,92,246,0.3)]" />
            <div className="absolute inset-8 border-[5px] border-pink-500/20 border-b-transparent rounded-full animate-[spin_1.5s_linear_infinite]" />
          </div>
          <h2 className="text-4xl lg:text-6xl font-black uppercase tracking-[0.6em] bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-6 text-center">AI Resonansi</h2>
          <div className="flex items-center gap-3 text-violet-400/60 font-black text-[11px] uppercase tracking-[0.4em]">
            <span className="w-2 h-2 bg-pink-500 rounded-full animate-ping"></span>
            Mengonversi Getaran Batin v8.4...
          </div>
        </div>
      )}

      {/* Result Display v8.4 */}
      {analysisResult && (
        <div className="fixed inset-0 bg-[#050112] z-[550] overflow-y-auto p-6 lg:p-20 animate-in fade-in slide-in-from-bottom-20 duration-1000">
          <button onClick={() => setAnalysisResult(null)} className="fixed top-10 right-10 bg-white text-black w-16 h-16 rounded-full font-black text-2xl z-[600] shadow-2xl hover:bg-pink-500 hover:text-white transition-all transform hover:rotate-90">✕</button>
          
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 py-10">
            <div className="space-y-12">
              <div className="space-y-4">
                <span className="text-pink-500 font-black uppercase tracking-[0.5em] text-[12px] block">Spectral Narrative Report</span>
                <h3 className="text-5xl lg:text-8xl font-black text-white uppercase tracking-tighter leading-none italic">Resonansi</h3>
              </div>
              <div className="bg-white/5 p-12 lg:p-20 rounded-[4rem] text-3xl lg:text-5xl leading-tight italic text-pink-100 font-serif border border-white/5 shadow-2xl relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500/10 rounded-full blur-3xl group-hover:bg-pink-500/20 transition-all duration-1000"></div>
                {analysisResult.text}
              </div>
            </div>
            
            <div className="space-y-12">
              <div className="rounded-[5rem] overflow-hidden shadow-[0_0_120px_rgba(236,72,153,0.2)] border border-white/10 group relative">
                <img src={analysisResult.imageUrl} className="w-full aspect-square object-cover group-hover:scale-110 transition-transform duration-[5s]" alt="Musonography" />
                <div className="absolute bottom-10 left-10 right-10 p-8 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-[3rem] transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-700">
                  <p className="text-white text-lg font-medium italic leading-snug">"{analysisResult.curatorial}"</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-violet-900/20 p-8 rounded-[3rem] border border-violet-500/20 text-center">
                  <span className="block text-[10px] font-black text-violet-400 uppercase tracking-widest mb-2 opacity-50">Dominansi Buana</span>
                  <span className="text-xl lg:text-2xl font-black text-white uppercase">{analysisResult.dominantBuana}</span>
                </div>
                <div className="bg-pink-900/20 p-8 rounded-[3rem] border border-pink-500/20 text-center">
                  <span className="block text-[10px] font-black text-pink-400 uppercase tracking-widest mb-2 opacity-50">Kualitas Karakter</span>
                  <span className="text-xl lg:text-2xl font-black text-white uppercase">{analysisResult.quality}</span>
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
