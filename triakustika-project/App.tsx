
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
      const shareUrl = window.location.href;
      win.QRCode.toDataURL(shareUrl, { width: 400, margin: 2 }, (err: any, url: string) => {
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

  const stopSensing = () => {
    setIsSensing(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    const mean = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b) / arr.length) : 0;
    const finalData = { f1: mean(h1Ref.current), f2: mean(h2Ref.current), f3: mean(h3Ref.current) };
    setCurrentFrequencies(finalData);
    performAIAnalysis(finalData);
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
    if (!mamaosName || !rumpaka) { alert("Isi data terlebih dahulu."); return; }
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
      alert("Kesalahan sistem AI.");
    } finally {
      setIsLoading(false);
    }
  };

  const generatePDF = () => {
    const { jspdf } = window as any;
    if (!jspdf || !analysisResult) return;
    const doc = new jspdf.jsPDF();
    doc.setFillColor(2, 6, 23); doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(255, 255, 255); 
    doc.setFontSize(24); doc.text(`TRIAKUSTIKA 8.3 AUTHORITY`, 105, 40, { align: 'center' });
    doc.setFontSize(16); doc.text(`Sertifikat Frekuensi Batin`, 105, 50, { align: 'center' });
    doc.text(`Juru Mamaos: ${mamaosName}`, 20, 80);
    doc.text(`Lagu: ${songTitle}`, 20, 90);
    doc.text(`Dominansi: ${analysisResult.dominantBuana}`, 20, 100);
    doc.save(`Triakustika_${mamaosName}.pdf`);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden p-4 gap-4 bg-slate-950 text-slate-200">
      <header className="flex justify-between items-center border-b border-indigo-500/30 pb-3">
        <div className="flex flex-col">
          <h1 className="text-xl lg:text-3xl font-black bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent uppercase">Triakustika 8.3</h1>
          <span className="text-[9px] text-slate-500 tracking-widest uppercase">Digital Sonic Lab - Tata Sutaryat</span>
        </div>
        <button onClick={() => window.location.reload()} className="text-[10px] bg-red-600 px-4 py-2 rounded-full uppercase font-bold">Reset</button>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
        <section className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-6 flex flex-col gap-4">
          <label className="text-amber-500 font-black uppercase tracking-widest">Rumpaka (Lirik)</label>
          <textarea value={rumpaka} onChange={(e) => setRumpaka(e.target.value)} placeholder="Tulis lirik di sini..." className="flex-1 bg-black/40 border border-slate-800 rounded-2xl p-5 text-emerald-400 outline-none resize-none" />
        </section>

        <section className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-6 flex flex-col gap-4">
          <input type="text" placeholder="Nama Juru Mamaos" value={mamaosName} onChange={(e) => setMamaosName(e.target.value)} className="bg-black/60 border border-slate-800 rounded-xl px-4 py-3 font-bold" />
          <input type="text" placeholder="Judul Tembang" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} className="bg-black/60 border border-slate-800 rounded-xl px-4 py-3 font-bold" />
          
          <div className="h-32 bg-black rounded-xl border border-indigo-500/20 overflow-hidden">
            <canvas ref={canvasRef} width={600} height={200} className="w-full h-full" />
          </div>

          <button onClick={isSensing ? stopSensing : startSensing} className={`py-4 rounded-xl font-black uppercase tracking-widest ${isSensing ? 'bg-red-600 animate-pulse' : 'bg-indigo-600 shadow-xl'}`}>
            {isSensing ? 'Berhenti & Analisis' : 'Mulai Sensing'}
          </button>
        </section>
      </main>

      {isLoading && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <h2 className="text-xl font-black uppercase tracking-widest">Merajut Frekuensi...</h2>
        </div>
      )}

      {analysisResult && (
        <div className="fixed inset-0 bg-slate-950 z-[110] overflow-y-auto p-4 lg:p-12">
          <button onClick={() => setAnalysisResult(null)} className="fixed top-6 right-6 bg-slate-800 w-12 h-12 rounded-full font-bold">✕</button>
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 py-10">
            <div className="space-y-6">
              <h3 className="text-3xl font-black text-amber-500 uppercase">Narasi Getaran</h3>
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] text-lg leading-relaxed">{analysisResult.text}</div>
            </div>
            <div className="space-y-6">
              <img src={analysisResult.imageUrl} className="w-full aspect-square rounded-[2.5rem] border-4 border-indigo-500/20 shadow-2xl" />
              <div className="bg-white p-6 rounded-3xl flex flex-col items-center gap-4">
                <img src={qrCodeUrl} className="w-40 h-40" />
                <button onClick={generatePDF} className="w-full bg-slate-950 text-white py-3 rounded-xl font-bold uppercase tracking-widest">Cetak Sertifikat</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
