'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2, Zap, Shield, BookOpen, LogOut, User, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '../lib/auth-store';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user, logout, getAuthHeader } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const startNewConversation = async () => {
    if (!isAuthenticated()) { router.push('/login'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ title: 'Yeni Araştırma', documentIds: [] })
      });
      if (!res.ok) throw new Error('Hata');
      const data = await res.json();
      if (data.id) router.push(`/chat/${data.id}`);
    } catch {
      alert('Backend bağlantısı kurulamadı.');
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Zap, title: 'Anında Yanıt', desc: 'Akıllı akış teknolojisiyle cevaplar saniyeler içinde', color: '#f59e0b' },
    { icon: Shield, title: 'Tamamen Özel', desc: 'Verileriniz yalnızca sizin cihazınızda kalır', color: '#10b981' },
    { icon: BookOpen, title: 'Belge Analizi', desc: 'PDF ve metinleri yapay zeka ile derinlemesine analiz et', color: '#6366f1' },
  ];

  if (!mounted) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #0a0a0f 0%, #0f0f1a 50%, #0a0a0f 100%)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Animated background orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.15), transparent)' }} />
      </div>

      {/* Navbar */}
      <nav style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles style={{ width: '16px', height: '16px', color: 'white' }} />
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em' }}>Research AI</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated() ? (
            <>
              <Link href="/create" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', fontWeight: 500 }}>
                <Wand2 size={13} /> Yaratıcı Araçlar
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af', fontSize: '13px' }}>
                <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={14} color="white" />
                </div>
                {user?.name}
              </div>
              <button onClick={() => { logout(); router.refresh(); }} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LogOut size={13} /> Çıkış
              </button>
            </>
          ) : (
            <>
              <Link href="/create" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', fontWeight: 500, marginRight: '10px' }}>
                <Wand2 size={13} /> Yaratıcı Araçlar
              </Link>
              <Link href="/login" style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>Giriş Yap</Link>
              <Link href="/signup" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', borderRadius: '8px', padding: '8px 18px', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
                Kayıt Ol
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          {/* Pill badge */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '100px', padding: '6px 16px', marginBottom: '28px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 8px #818cf8', display: 'inline-block' }} />
            <span style={{ color: '#a5b4fc', fontSize: '12px', fontWeight: 500 }}>Yeni Nesil Yapay Zeka · Ultra Hızlı</span>
          </motion.div>

          <h1 style={{ fontSize: 'clamp(2.8rem, 7vw, 5rem)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: '24px' }}>
            <span style={{ color: '#ffffff', display: 'block' }}>Araştırmanızı</span>
            <span style={{ background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundSize: '200%' }}>
              Süper Güce
            </span>
            <span style={{ color: '#ffffff', display: 'block' }}>Dönüştürün</span>
          </h1>

          <p style={{ color: '#6b7280', fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: 1.75, maxWidth: '520px', margin: '0 auto 48px' }}>
            Belgelerinizi yükleyin, yapay zekaya derinlemesine analiz ettirin. ChatGPT gibi konuşarak araştırın — inanılmaz hızlı ve profesyonel.
          </p>

          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={startNewConversation}
              disabled={isLoading}
              id="start-conversation-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', borderRadius: '14px', padding: '16px 32px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 16px 50px rgba(99,102,241,0.35)' }}
            >
              {isLoading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={20} />}
              {isLoading ? 'Başlatılıyor...' : isAuthenticated() ? 'Sohbete Başla' : 'Ücretsiz Başla'}
              {!isLoading && <ArrowRight size={18} />}
            </motion.button>

            {isAuthenticated() ? (
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
                <Link href="/create" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', borderRadius: '14px', padding: '16px 32px', fontSize: '16px', fontWeight: 600, textDecoration: 'none', boxShadow: '0 16px 50px rgba(245,158,11,0.15)' }}>
                  <Wand2 size={20} /> Yaratıcı Araçlar
                </Link>
              </motion.div>
            ) : (
              <motion.div whileHover={{ scale: 1.02 }}>
                <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', borderRadius: '14px', padding: '16px 28px', fontSize: '15px', fontWeight: 500, textDecoration: 'none' }}>
                  Giriş Yap
                </Link>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '80px', maxWidth: '780px', width: '100%' }}
        >
          {features.map((f, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '20px', padding: '24px', textAlign: 'left', backdropFilter: 'blur(10px)', transition: 'border-color 0.2s' }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = `${f.color}40`; }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
            >
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${f.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                <f.icon style={{ width: '22px', height: '22px', color: f.color }} />
              </div>
              <p style={{ color: '#f3f4f6', fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>{f.title}</p>
              <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: 1.6 }}>{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '20px', borderTop: '1px solid rgba(255,255,255,0.04)', color: '#374151', fontSize: '12px' }}>
        Research AI © 2024 · Gelişmiş Bulut Altyapısı
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
