'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ImageIcon, Video, Mic2, ChevronLeft,
  Download, RefreshCw, Loader2, Play, Pause, Square,
  Wand2, Copy, Check
} from 'lucide-react';
import { useAuthStore } from '../../lib/auth-store';

type Tab = 'image' | 'audio' | 'video';

const MODELS = {
  image: [
    { id: 'flux', name: 'Flux Pro', desc: 'En kaliteli, hızlı' },
    { id: 'gptimage-large', name: 'Flux Realism', desc: 'Fotogerçekçi detaylar' },
    { id: 'klein', name: 'Klein', desc: 'Hızlı modern çizim' },
    { id: 'gptimage', name: 'Anime / Mini', desc: 'Hızlı anime/illüstrasyon' },
  ],
  size: [
    { w: 1024, h: 1024, label: '1:1 Kare' },
    { w: 1344, h: 768, label: '16:9 Geniş' },
    { w: 768, h: 1344, label: '9:16 Dikey' },
    { w: 1024, h: 576, label: '16:9 HD' },
  ]
};

const TTS_VOICES = [
  { name: 'Türkçe Kadın', lang: 'tr-TR', gender: 'female' },
  { name: 'Türkçe Erkek', lang: 'tr-TR', gender: 'male' },
  { name: 'İngilizce', lang: 'en-US', gender: 'female' },
];

export default function CreatePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const [tab, setTab] = useState<Tab>('image');

  // Image state
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgNegative, setImgNegative] = useState('');
  const [imgModel, setImgModel] = useState('flux');
  const [imgSize, setImgSize] = useState(MODELS.size[0]);
  const [imgUrl, setImgUrl] = useState('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgSeed, setImgSeed] = useState<number>(Math.floor(Math.random() * 999999));
  const [imgHistory, setImgHistory] = useState<string[]>([]);

  // Audio state
  const [audioText, setAudioText] = useState('');
  const [audioVoice, setAudioVoice] = useState(TTS_VOICES[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState(1);
  const [audioRate, setAudioRate] = useState(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Video state
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoError, setVideoError] = useState('');
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [videoPolls, setVideoPolls] = useState(0);

  const [copied, setCopied] = useState(false);

  // ── IMAGE GENERATION ──
  const generateImage = async () => {
    if (!imgPrompt.trim()) return;
    setImgLoading(true);
    setImgUrl('');
    const seed = Math.floor(Math.random() * 999999);
    setImgSeed(seed);
    const encoded = encodeURIComponent(imgPrompt + (imgNegative ? ` | avoid: ${imgNegative}` : ''));
    const url = `/api/image?prompt=${encoded}&width=${imgSize.w}&height=${imgSize.h}&seed=${seed}&model=${imgModel}`;
    
    setImgUrl(url);
    setImgHistory(prev => [url, ...prev.slice(0, 7)]);
  };

  const downloadImage = async () => {
    if (!imgUrl) return;
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = `research-ai-${imgSeed}.jpg`;
    a.click();
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(imgPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── AUDIO GENERATION ──
  const speak = () => {
    if (!audioText.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(audioText);
    utterance.lang = audioVoice.lang;
    utterance.rate = audioRate;
    utterance.pitch = 1;
    
    // Try to find matching voice
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(v => v.lang.startsWith(audioVoice.lang.split('-')[0]) && 
      (audioVoice.gender === 'female' ? v.name.toLowerCase().includes('female') || v.name.includes('Yelda') || v.name.includes('Filiz') : !v.name.toLowerCase().includes('female')));
    if (match) utterance.voice = match;
    
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  // ── VIDEO GENERATION ──
  const generateVideo = async () => {
    if (!videoPrompt.trim()) return;
    
    setVideoLoading(true);
    setVideoError('');
    setVideoUrl('');
    setVideoPolls(0);

    try {
      // Create generation via our secure backend route
      const createRes = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          aspect_ratio: videoAspect,
          loop: false,
        }),
      });
      
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Video oluşturulamadı');
      }

      const { id } = await createRes.json();

      // Poll for completion
      const poll = async (attempts: number = 0): Promise<void> => {
        if (attempts > 60) { throw new Error('Zaman aşımı — video çok uzun sürdü'); }
        setVideoPolls(attempts);
        
        await new Promise(r => setTimeout(r, 5000));
        
        const statusRes = await fetch(`/api/video/${id}`);
        const data = await statusRes.json();
        
        if (data.state === 'completed' && data.assets?.video) {
          setVideoUrl(data.assets.video);
          setVideoLoading(false);
        } else if (data.state === 'failed') {
          throw new Error(data.failure_reason || 'Video oluşturma başarısız');
        } else {
          return poll(attempts + 1);
        }
      };

      await poll();
    } catch (err: any) {
      setVideoError(err.message || 'Bir hata oluştu');
      setVideoLoading(false);
    }
  };

  const TABS: { id: Tab; icon: any; label: string; color: string }[] = [
    { id: 'image', icon: ImageIcon, label: 'Görsel Oluştur', color: '#6366f1' },
    { id: 'audio', icon: Mic2, label: 'Ses Oluştur', color: '#10b981' },
    { id: 'video', icon: Video, label: 'Video Oluştur', color: '#f59e0b' },
  ];

  const SUGGESTIONS = {
    image: ['Gün batımında Tokyo sokakları, neon ışıklar, sinematik', 'Derin ormanda kristal şelale, fantastik, 8K', 'Fütüristik şehir manzarası, cyberpunk tarzı, gece'],
    audio: ['Yapay zeka araştırma asistanı olarak size yardımcı olmaktan büyük mutluluk duyuyorum.', 'Türkçe doğal dil işleme teknolojisi günden güne gelişiyor.', 'Bu metin okuma sistemi ElevenLabs benzeri kalitede çalışmaktadır.'],
    video: [
      'Gün doğumunda karla kaplı dağların üzerinde uçan sinematik bir dron çekimi',
      'Geceleyin uçan arabalar ve neon ışıklarla dolu fütüristik bir şehir',
      'Dalgaların kayalara çarpışı, ağır çekim, ultra gerçekçi sinematik video'
    ],
  };

  const themeColors = {
    image: { primary: '#6366f1', glow: 'rgba(99,102,241,0.15)', text: '#a5b4fc', bg: 'rgba(99,102,241,0.06)' },
    audio: { primary: '#10b981', glow: 'rgba(16,185,129,0.15)', text: '#a7f3d0', bg: 'rgba(16,185,129,0.06)' },
    video: { primary: '#f59e0b', glow: 'rgba(245,158,11,0.15)', text: '#fde68a', bg: 'rgba(245,158,11,0.06)' },
  };
  const activeTheme = themeColors[tab];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #0a0a0f 0%, #0c0c16 50%, #0a0a0f 100%)', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      
      {/* Animated background orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '500px', height: '500px', background: `radial-gradient(circle, ${activeTheme.glow} 0%, transparent 70%)`, borderRadius: '50%', transition: 'background 0.5s ease-in-out' }} />
      </div>

      {/* Navbar */}
      <nav style={{ display: 'flex', alignItems: 'center', padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: '16px', backdropFilter: 'blur(8px)', zIndex: 10, position: 'relative' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '13px', transition: 'color 0.2s' }}
          onMouseOver={e => e.currentTarget.style.color = '#fff'}
          onMouseOut={e => e.currentTarget.style.color = '#6b7280'}>
          <ChevronLeft size={16} /> Geri
        </button>
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}>
            <Wand2 size={14} color="white" />
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.01em' }}>Yaratıcı Araçlar</span>
        </div>
      </nav>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '24px 32px 0', gap: '10px', zIndex: 10, position: 'relative' }}>
        {TABS.map(t => {
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 24px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: isActive ? `${t.color}15` : 'rgba(255,255,255,0.03)',
                color: isActive ? '#ffffff' : '#9ca3af',
                fontWeight: isActive ? 600 : 500, fontSize: '14px',
                border: '1px solid',
                borderColor: isActive ? `${t.color}45` : 'rgba(255,255,255,0.05)',
                boxShadow: isActive ? `0 8px 24px ${t.color}15` : 'none',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseOver={e => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseOut={e => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = '#9ca3af';
                }
              }}
            >
              <t.icon size={16} color={isActive ? t.color : '#6b7280'} style={{ transition: 'color 0.3s' }} /> {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '24px', padding: '24px 32px', maxWidth: '1400px', width: '100%', margin: '0 auto', boxSizing: 'border-box', zIndex: 10, position: 'relative' }}>
        
        {/* ── IMAGE TAB ── */}
        {tab === 'image' && (
          <AnimatePresence mode="wait">
            <motion.div key="image" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: '24px', width: '100%' }} className="tab-content">
              
              {/* Controls */}
              <div style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={cardStyle}>
                  <label style={labelStyle}>Görsel Açıklaması</label>
                  <textarea
                    value={imgPrompt}
                    onChange={e => setImgPrompt(e.target.value)}
                    placeholder="Hayal ettiğiniz görseli Türkçe veya İngilizce açıklayın..."
                    style={{ ...inputStyle, minHeight: '110px', resize: 'vertical', '--focus-color': activeTheme.primary, '--focus-shadow': activeTheme.glow } as React.CSSProperties}
                    className="creative-input"
                  />
                  
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ ...labelStyle, fontSize: '11px', marginBottom: '6px' }}>Hızlı Öneri</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {SUGGESTIONS.image.map((s, i) => (
                        <button key={i} onClick={() => setImgPrompt(s)}
                          style={{
                            background: activeTheme.bg,
                            border: '1px solid rgba(99,102,241,0.12)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            color: activeTheme.text,
                            fontSize: '11px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            lineHeight: 1.4,
                            transition: 'all 0.2s',
                          }}
                          onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; }}
                          onMouseOut={e => { e.currentTarget.style.background = activeTheme.bg; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.12)'; }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label style={labelStyle}>Negatif Prompt (İstenmeyen)</label>
                    <input value={imgNegative} onChange={e => setImgNegative(e.target.value)}
                      placeholder="Örn: bulanık, çirkin, filigran, bozuk..."
                      style={{ ...inputStyle, '--focus-color': activeTheme.primary, '--focus-shadow': activeTheme.glow } as React.CSSProperties}
                      className="creative-input"
                    />
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label style={labelStyle}>Model</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {MODELS.image.map(m => {
                        const isSel = imgModel === m.id;
                        return (
                          <button key={m.id} onClick={() => setImgModel(m.id)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              border: '1px solid',
                              borderColor: isSel ? activeTheme.primary : 'rgba(255,255,255,0.05)',
                              background: isSel ? `${activeTheme.primary}18` : 'rgba(255,255,255,0.02)',
                              boxShadow: isSel ? `0 0 15px ${activeTheme.primary}10` : 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.2s',
                            }}
                            onMouseOver={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                            onMouseOut={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                          >
                            <p style={{ color: isSel ? '#ffffff' : '#d1d5db', fontSize: '12px', fontWeight: 600, margin: 0 }}>{m.name}</p>
                            <p style={{ color: isSel ? activeTheme.text : '#6b7280', fontSize: '10px', margin: '2px 0 0 0', opacity: 0.8 }}>{m.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label style={labelStyle}>Boyut</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {MODELS.size.map(s => {
                        const isSel = imgSize.label === s.label;
                        return (
                          <button key={s.label} onClick={() => setImgSize(s)}
                            style={{
                              padding: '10px',
                              borderRadius: '10px',
                              border: '1px solid',
                              borderColor: isSel ? activeTheme.primary : 'rgba(255,255,255,0.05)',
                              background: isSel ? `${activeTheme.primary}18` : 'rgba(255,255,255,0.02)',
                              boxShadow: isSel ? `0 0 15px ${activeTheme.primary}10` : 'none',
                              cursor: 'pointer',
                              color: isSel ? '#ffffff' : '#9ca3af',
                              fontSize: '11px',
                              fontWeight: 500,
                              transition: 'all 0.2s',
                            }}
                            onMouseOver={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                            onMouseOut={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                          >
                            {s.label}<br />
                            <span style={{ fontSize: '9px', color: isSel ? activeTheme.text : '#6b7280', marginTop: '2px', display: 'inline-block', opacity: 0.8 }}>{s.w}×{s.h}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={generateImage} disabled={imgLoading || !imgPrompt.trim()}
                    style={{ marginTop: '16px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 600, cursor: imgLoading || !imgPrompt.trim() ? 'not-allowed' : 'pointer', opacity: imgLoading || !imgPrompt.trim() ? 0.7 : 1, boxShadow: '0 8px 30px rgba(99,102,241,0.3)', transition: 'all 0.2s' }}>
                    {imgLoading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Oluşturuluyor...</> : <><Wand2 size={18} /> Görsel Oluştur</>}
                  </motion.button>
                </div>
              </div>

              {/* Preview */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ ...cardStyle, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(10, 10, 15, 0.4)' }}>
                  {imgLoading && (
                    <div style={{ textAlign: 'center' }}>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                        style={{ width: '56px', height: '56px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.05)', borderTopColor: '#6366f1', margin: '0 auto 16px' }} />
                      <p style={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}>Görsel işleniyor...</p>
                      <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>{imgModel} · {imgSize.label}</p>
                    </div>
                  )}
                  {!imgLoading && !imgUrl && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'rgba(99,102,241,0.06)', border: '1.5px dashed rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <ImageIcon size={32} color="#6366f1" strokeWidth={1.5} />
                      </div>
                      <p style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 500 }}>Görseliniz burada görünecek</p>
                      <p style={{ color: '#4b5563', fontSize: '12px', marginTop: '4px' }}>Yapay zeka hayal etmeye hazır</p>
                    </div>
                  )}
                  {imgUrl && (
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img 
                        src={imgUrl} 
                        alt="Generated" 
                        onLoad={() => setImgLoading(false)}
                        onError={() => {
                          setImgLoading(false);
                          alert('Görsel oluşturulurken hata oluştu. Tekrar deneyin.');
                        }}
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: '550px', 
                          objectFit: 'contain', 
                          borderRadius: '12px', 
                          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                          display: imgLoading ? 'none' : 'block'
                        }} 
                      />
                      {!imgLoading && (
                        <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
                          <button onClick={copyPrompt} style={{ ...iconBtnStyle, background: 'rgba(15,15,20,0.85)', border: '1px solid rgba(255,255,255,0.08)' }} title="Promptu Kopyala">
                            {copied ? <Check size={15} color="#10b981" /> : <Copy size={15} color="white" />}
                          </button>
                          <button onClick={() => generateImage()} style={{ ...iconBtnStyle, background: 'rgba(15,15,20,0.85)', border: '1px solid rgba(255,255,255,0.08)' }} title="Yeniden Oluştur">
                            <RefreshCw size={15} color="white" />
                          </button>
                          <button onClick={downloadImage} style={{ ...iconBtnStyle, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none' }} title="Görseli İndir">
                            <Download size={15} color="white" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* History */}
                {imgHistory.length > 0 && (
                  <div style={cardStyle}>
                    <p style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Geçmiş</p>
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {imgHistory.map((url, i) => (
                        <img key={i} src={url} alt="" onClick={() => setImgUrl(url)}
                          style={{ width: '76px', height: '76px', objectFit: 'cover', borderRadius: '10px', cursor: 'pointer', border: imgUrl === url ? '2px solid #6366f1' : '2px solid transparent', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', transition: 'all 0.2s', flexShrink: 0 }}
                          onMouseOver={e => { if (imgUrl !== url) e.currentTarget.style.transform = 'scale(1.05)'; }}
                          onMouseOut={e => { if (imgUrl !== url) e.currentTarget.style.transform = 'scale(1)'; }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── AUDIO TAB ── */}
        {tab === 'audio' && (
          <AnimatePresence mode="wait">
            <motion.div key="audio" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: '24px', width: '100%' }} className="tab-content">
              <div style={{ width: '340px', flexShrink: 0 }}>
                <div style={cardStyle}>
                  <label style={labelStyle}>Ses Tonu</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                    {TTS_VOICES.map(v => {
                      const isSel = audioVoice.name === v.name;
                      return (
                        <button key={v.name} onClick={() => setAudioVoice(v)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '10px',
                            border: '1px solid',
                            borderColor: isSel ? activeTheme.primary : 'rgba(255,255,255,0.05)',
                            background: isSel ? `${activeTheme.primary}18` : 'rgba(255,255,255,0.02)',
                            boxShadow: isSel ? `0 0 15px ${activeTheme.primary}10` : 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: isSel ? '#ffffff' : '#9ca3af',
                            fontSize: '13px',
                            fontWeight: isSel ? 600 : 400,
                            transition: 'all 0.2s',
                          }}
                          onMouseOver={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
                          onMouseOut={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'; }}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                  </div>

                  <label style={labelStyle}>Konuşma Hızı: {audioRate.toFixed(1)}x</label>
                  <input type="range" min="0.5" max="2" step="0.1" value={audioRate} onChange={e => setAudioRate(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#10b981', marginBottom: '16px' }} />

                  <label style={labelStyle}>Metin (max 2000 karakter)</label>
                  <textarea value={audioText} onChange={e => setAudioText(e.target.value.slice(0, 2000))}
                    placeholder="Seslendirilecek metni buraya yazın..." rows={8}
                    style={{ ...inputStyle, minHeight: '160px', resize: 'vertical', '--focus-color': activeTheme.primary, '--focus-shadow': activeTheme.glow } as React.CSSProperties}
                    className="creative-input"
                  />
                  <p style={{ color: '#4b5563', fontSize: '11px', textAlign: 'right', marginTop: '4px' }}>{audioText.length}/2000</p>

                  <div style={{ marginTop: '12px' }}>
                    <p style={labelStyle}>Hızlı Metin</p>
                    {SUGGESTIONS.audio.map((s, i) => (
                      <button key={i} onClick={() => setAudioText(s)}
                        style={{
                          display: 'block', width: '100%',
                          background: activeTheme.bg,
                          border: '1px solid rgba(16,185,129,0.12)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          color: activeTheme.text,
                          fontSize: '11px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          lineHeight: 1.4,
                          marginBottom: '6px',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.25)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = activeTheme.bg; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.12)'; }}
                      >
                        {s.slice(0, 60)}...
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '28px', border: '1px solid rgba(16,185,129,0.15)', background: 'rgba(10, 15, 12, 0.4)' }}>
                  {/* Waveform visual */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '70px' }}>
                    {Array.from({ length: 32 }).map((_, i) => (
                      <motion.div key={i}
                        animate={isPlaying ? { scaleY: [0.2, Math.random() * 0.9 + 0.2, 0.2] } : { scaleY: 0.15 }}
                        transition={{ repeat: Infinity, duration: 0.35 + Math.random() * 0.35, delay: i * 0.02 }}
                        style={{ width: '6px', height: '100%', background: `linear-gradient(180deg, #10b981, #059669)`, borderRadius: '3px', transformOrigin: 'center' }}
                      />
                    ))}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
                      {isPlaying ? 'Konuşma Oynatılıyor' : 'Metin Hazır'}
                    </p>
                    <p style={{ color: '#6b7280', fontSize: '13px' }}>
                      {audioVoice.name} · {audioRate}x hız ayarı
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={isPlaying ? stopSpeech : speak}
                      disabled={!audioText.trim()}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', background: isPlaying ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, #10b981, #059669)', color: isPlaying ? '#f87171' : 'white', border: isPlaying ? '1px solid rgba(239,68,68,0.3)' : 'none', borderRadius: '14px', padding: '14px 32px', fontSize: '15px', fontWeight: 600, cursor: !audioText.trim() ? 'not-allowed' : 'pointer', opacity: !audioText.trim() ? 0.5 : 1, boxShadow: isPlaying ? 'none' : '0 8px 24px rgba(16,185,129,0.25)', transition: 'all 0.2s' }}>
                      {isPlaying ? <><Square size={18} /> Durdur</> : <><Play size={18} /> Seslendir</>}
                    </motion.button>
                  </div>

                  <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '12px', padding: '14px 20px', maxWidth: '460px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <p style={{ color: '#6ee7b7', fontSize: '12.5px', lineHeight: 1.6, margin: 0 }}>
                      💡 Doğal ve akıcı sesler için tarayıcı Sentezi kullanılmaktadır. En iyi sonuçlar için <strong>Chrome</strong> veya <strong>Safari</strong> önerilir.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── VIDEO TAB ── */}
        {tab === 'video' && (
          <AnimatePresence mode="wait">
            <motion.div key="video" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: '24px', width: '100%' }} className="tab-content">
              <div style={{ width: '340px', flexShrink: 0 }}>
                <div style={cardStyle}>
                  <label style={labelStyle}>Video Açıklaması</label>
                  <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)}
                    placeholder="Örn: Gün batımında karlı dağların üzerinde uçan sinematik bir dron çekimi..." rows={5}
                    style={{ ...inputStyle, minHeight: '110px', resize: 'vertical', marginBottom: '14px', '--focus-color': activeTheme.primary, '--focus-shadow': activeTheme.glow } as React.CSSProperties}
                    className="creative-input"
                  />

                  <label style={labelStyle}>En Boy Oranı</label>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                    {['16:9', '9:16', '4:3', '1:1'].map(r => {
                      const isSel = videoAspect === r;
                      return (
                        <button key={r} onClick={() => setVideoAspect(r)}
                          style={{
                            flex: 1, padding: '8px 4px', borderRadius: '8px',
                            border: '1px solid',
                            borderColor: isSel ? activeTheme.primary : 'rgba(255,255,255,0.05)',
                            background: isSel ? `${activeTheme.primary}18` : 'rgba(255,255,255,0.02)',
                            cursor: 'pointer',
                            color: isSel ? '#ffffff' : '#6b7280',
                            fontSize: '11px',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                          }}
                          onMouseOver={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
                          onMouseOut={e => { if (!isSel) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'; }}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>

                  <label style={labelStyle}>Hızlı Öneri</label>
                  {SUGGESTIONS.video.map((s, i) => (
                    <button key={i} onClick={() => setVideoPrompt(s)}
                      style={{
                        display: 'block', width: '100%',
                        background: activeTheme.bg,
                        border: '1px solid rgba(245,158,11,0.12)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: activeTheme.text,
                        fontSize: '11px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        lineHeight: 1.4,
                        marginBottom: '6px',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)'; }}
                      onMouseOut={e => { e.currentTarget.style.background = activeTheme.bg; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.12)'; }}
                    >
                      {s}
                    </button>
                  ))}

                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={generateVideo} disabled={videoLoading || !videoPrompt.trim()}
                    style={{ marginTop: '16px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 600, cursor: videoLoading || !videoPrompt.trim() ? 'not-allowed' : 'pointer', opacity: videoLoading || !videoPrompt.trim() ? 0.7 : 1, boxShadow: '0 8px 30px rgba(245,158,11,0.25)', transition: 'all 0.2s' }}>
                    {videoLoading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Oluşturuluyor ({videoPolls * 5}s)...</> : <><Video size={18} /> Video Oluştur</>}
                  </motion.button>
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ ...cardStyle, minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(245,158,11,0.15)', background: 'rgba(15, 12, 10, 0.4)' }}>
                  {videoError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', color: '#f87171', fontSize: '13px', maxWidth: '460px', textAlign: 'center' }}>
                      ⚠️ {videoError}
                    </div>
                  )}

                  {videoLoading && (
                    <div style={{ textAlign: 'center' }}>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                        style={{ width: '64px', height: '64px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.05)', borderTopColor: '#f59e0b', margin: '0 auto 20px' }} />
                      <p style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Video oluşturuluyor...</p>
                      <p style={{ color: '#6b7280', fontSize: '13px' }}>Luma AI sunucularında işleniyor · ~{Math.max(0, 75 - videoPolls * 5)} saniye</p>
                      <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '100px', height: '6px', width: '240px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <motion.div animate={{ width: `${Math.min(100, videoPolls * 7.5)}%` }} style={{ height: '100%', background: 'linear-gradient(90deg, #f59e0b, #d97706)', borderRadius: '100px' }} />
                      </div>
                    </div>
                  )}

                  {videoUrl && !videoLoading && (
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <video src={videoUrl} controls autoPlay style={{ width: '100%', borderRadius: '14px', maxHeight: '480px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }} />
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', gap: '12px' }}>
                        <a href={videoUrl} download="research-ai-video.mp4"
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', borderRadius: '10px', padding: '12px 24px', fontSize: '13.5px', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 15px rgba(245,158,11,0.25)', transition: 'all 0.2s' }}
                          onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                          onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                          <Download size={15} /> Videoyu İndir
                        </a>
                      </div>
                    </motion.div>
                  )}

                  {!videoLoading && !videoUrl && !videoError && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'rgba(245,158,11,0.06)', border: '1.5px dashed rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Video size={32} color="#f59e0b" strokeWidth={1.5} />
                      </div>
                      <p style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 500 }}>Videonuz burada görünecek</p>
                      <p style={{ color: '#4b5563', fontSize: '12px', marginTop: '4px' }}>Ortalama işlem süresi: 45-75 saniye</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 4px; background: #27272a; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #10b981; cursor: pointer; }
        
        .creative-input:focus {
          border-color: var(--focus-color) !important;
          box-shadow: 0 0 15px var(--focus-shadow) !important;
          background: rgba(10, 10, 12, 0.85) !important;
        }
        
        .tab-content {
          animation: fadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(20, 20, 25, 0.65)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.35)',
  position: 'relative',
  zIndex: 1,
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#8a8d98',
  fontSize: '11px',
  fontWeight: 600,
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(10, 10, 12, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '10px',
  padding: '12px 14px',
  color: '#fff',
  fontSize: '13px',
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  transition: 'all 0.2s ease-in-out',
  boxSizing: 'border-box',
  lineHeight: 1.5,
};
const iconBtnStyle: React.CSSProperties = {
  width: '34px',
  height: '34px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  transition: 'all 0.2s',
};
