'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Giriş başarısız');
      setAuth(data.token, data.user);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <Blobs />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={cardStyle}
      >
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
          <div style={logoStyle}>
            <Sparkles style={{ width: '28px', height: '28px', color: 'white' }} />
          </div>
        </div>

        <h1 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, textAlign: 'center', marginBottom: '6px' }}>
          Tekrar Hoş Geldiniz
        </h1>
        <p style={{ color: '#6b7280', textAlign: 'center', fontSize: '14px', marginBottom: '32px' }}>
          Hesabınıza giriş yapın
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              id="login-email"
              type="email"
              required
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="ornek@email.com"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.2)'; }}
              onBlur={e => { e.target.style.borderColor = '#2d2d35'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Şifre</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                required
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: '44px' }}
                onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.2)'; }}
                onBlur={e => { e.target.style.borderColor = '#2d2d35'; e.target.style.boxShadow = 'none'; }}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', color: '#f87171', fontSize: '13px' }}>
              ⚠ {error}
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            id="login-submit-btn"
            disabled={loading}
            style={btnStyle}
          >
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <>Giriş Yap <ArrowRight size={16} /></>}
          </motion.button>
        </form>

        <p style={{ color: '#6b7280', textAlign: 'center', fontSize: '13px', marginTop: '24px' }}>
          Hesabınız yok mu?{' '}
          <Link href="/signup" style={{ color: '#a5b4fc', fontWeight: 600, textDecoration: 'none' }}>
            Kayıt Ol
          </Link>
        </p>
      </motion.div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Blobs() {
  return (
    <>
      <div style={{ position: 'absolute', top: '15%', left: '25%', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '15%', right: '25%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(50px)', pointerEvents: 'none' }} />
    </>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0f0f10',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '2rem', position: 'relative', overflow: 'hidden',
  fontFamily: 'Inter, sans-serif',
};
const cardStyle: React.CSSProperties = {
  background: '#18181b', border: '1px solid #27272a',
  borderRadius: '24px', padding: '40px 36px',
  width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1,
};
const logoStyle: React.CSSProperties = {
  width: '60px', height: '60px',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 12px 40px rgba(99,102,241,0.35)',
};
const labelStyle: React.CSSProperties = {
  display: 'block', color: '#9ca3af', fontSize: '13px', fontWeight: 500, marginBottom: '6px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f0f10', border: '1.5px solid #2d2d35',
  borderRadius: '10px', padding: '11px 14px', color: '#fff',
  fontSize: '14px', outline: 'none', fontFamily: 'Inter, sans-serif',
  transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box',
};
const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  width: '100%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: 'white', border: 'none', borderRadius: '12px', padding: '13px',
  fontSize: '15px', fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 8px 30px rgba(99,102,241,0.3)', marginTop: '4px',
};
