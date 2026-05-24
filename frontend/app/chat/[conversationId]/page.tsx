'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import {
  Send, Loader2, Sparkles, FileText, Plus,
  ChevronLeft, Mic, MicOff, Paperclip, X,
  LogOut, User, ChevronDown, Volume2, Wand2,
  Trash2, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../../lib/auth-store';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const { getAuthHeader, user, logout, isAuthenticated } = useAuthStore();
  const conversationId = params.conversationId as string;

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [playingMsgIdx, setPlayingMsgIdx] = useState<number | null>(null);

  const speakMessage = (text: string, idx: number) => {
    window.speechSynthesis.cancel();
    if (playingMsgIdx === idx) { setPlayingMsgIdx(null); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.05;
    utterance.onend = () => setPlayingMsgIdx(null);
    utterance.onerror = () => setPlayingMsgIdx(null);
    setPlayingMsgIdx(idx);
    window.speechSynthesis.speak(utterance);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) router.push('/login');
  }, []);

  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/api/conversations/${conversationId}`, {
        headers: { ...getAuthHeader() } as any
      });
      if (!res.ok) throw new Error('Sohbet yüklenemedi');
      return res.json();
    },
    enabled: isAuthenticated(),
  });

  const { data: conversations, refetch: refetchConversations } = useQuery<any[]>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3001/api/conversations', {
        headers: { ...getAuthHeader() } as any
      });
      if (!res.ok) throw new Error('Sohbetler yüklenemedi');
      return res.json();
    },
    enabled: isAuthenticated(),
  });

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bu sohbeti kalıcı olarak silmek istediğinizden emin misiniz?')) return;
    try {
      const res = await fetch(`http://localhost:3001/api/conversations/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() } as any
      });
      if (!res.ok) throw new Error('Silme işlemi başarısız');
      refetchConversations();
      if (id === conversationId) {
        const remaining = conversations?.filter(c => c.id !== id);
        if (remaining && remaining.length > 0) {
          router.push(`/chat/${remaining[0].id}`);
        } else {
          router.push('/');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Sohbet silinirken bir hata oluştu.');
    }
  };

  useEffect(() => {
    if (conversation?.messages) setMessages(conversation.messages);
  }, [conversation]);

  // Voice recognition setup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SR = (window as any).webkitSpeechRecognition;
      const recognition = new SR();
      recognition.lang = 'tr-TR';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        setInput(transcript);
      };
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      alert('Tarayıcınız ses tanımayı desteklemiyor. Lütfen Chrome kullanın.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      alert('❌ PDF dosyaları doğrudan okunamıyor.\n\nLütfen PDF içeriğini kopyalayıp .txt dosyası olarak kaydedin ve tekrar ekleyin.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) { alert('Dosya 5MB den büyük olamaz.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedFile({ name: file.name, content: ev.target?.result as string });
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleAsk = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const questionText = attachedFile
      ? `${input}\n\n--- Ekli Dosya: ${attachedFile.name} ---\n${attachedFile.content}`
      : input;
    if (!questionText.trim() || isStreaming) return;

    setInput('');
    setAttachedFile(null);
    setIsStreaming(true);
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = '48px';

    setMessages(prev => [...prev, {
      role: 'user',
      content: input || '(Dosya eklendi)',
      attachment: attachedFile?.name
    }]);

    let assistantMessage = '';

    try {
      const response = await fetch(
        `http://localhost:3001/api/conversations/${conversationId}/ask`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() } as any,
          body: JSON.stringify({ question: questionText })
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Yapay zeka yanıt veremedi.');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream okunamadı');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content') {
              assistantMessage += data.delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last?.isStreaming) {
                  return [...prev.slice(0, -1), { ...last, content: assistantMessage }];
                }
                return [...prev, { role: 'assistant', content: assistantMessage, isStreaming: true, sources: [] }];
              });
            } else if (data.type === 'done') {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                return [...prev.slice(0, -1), { ...last, isStreaming: false }];
              });
            } else if (data.type === 'error') {
              throw new Error(data.delta);
            }
          } catch { }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.');
    } finally {
      setIsStreaming(false);
    }
  }, [input, attachedFile, isStreaming, conversationId, getAuthHeader]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = '48px';
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
  };

  const newChat = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() } as any,
        body: JSON.stringify({ title: 'Yeni Araştırma', documentIds: [] })
      });
      const data = await res.json();
      if (data.id) {
        refetchConversations();
        router.push(`/chat/${data.id}`);
      }
    } catch { }
  };

  const suggestions = ['Bu konuyu özetle', 'Anahtar noktalar neler?', 'Detaylı açıkla', 'Örnekler ver'];

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter, sans-serif', background: '#fff' }}>

      {/* ── SIDEBAR ── */}
      <div style={{ width: '256px', flexShrink: 0, background: '#0f0f10', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1c1c1e' }}>
        
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid #1c1c1e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles style={{ width: '16px', height: '16px', color: 'white' }} />
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: '13px', lineHeight: 1 }}>Research AI</p>
              <p style={{ color: '#4b5563', fontSize: '11px', marginTop: '3px' }}>Yapay Zeka Asistanı</p>
            </div>
          </div>
        </div>

        {/* New chat */}
        <div style={{ padding: '10px 10px 6px' }}>
          <button onClick={newChat} id="new-chat-btn"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', padding: '9px 13px', color: '#a5b4fc', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.22)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.12)')}
          >
            <Plus style={{ width: '14px', height: '14px' }} /> Yeni Sohbet
          </button>
        </div>

        {/* Create tools shortcut */}
        <div style={{ padding: '0 10px 6px' }}>
          <button onClick={() => router.push('/create')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '10px', padding: '9px 13px', color: '#fbbf24', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.18)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.08)')}
          >
            <Wand2 style={{ width: '14px', height: '14px' }} /> Yaratıcı Araçlar
          </button>
        </div>

        {/* Conversations list */}
        <div style={{ padding: '8px 10px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ color: '#4b5563', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 4px 6px' }}>Sohbet Geçmişi</p>
          {conversations && conversations.length > 0 ? (
            conversations.map((c: any) => {
              const isActive = c.id === conversationId;
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/chat/${c.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: isActive ? '#1a1a1c' : 'transparent',
                    border: isActive ? '1px solid #2d2d35' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                  onMouseOver={e => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                  onMouseOut={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                    <MessageSquare size={13} color={isActive ? '#fbbf24' : '#6b7280'} style={{ flexShrink: 0 }} />
                    <span style={{ color: isActive ? '#fff' : '#9ca3af', fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>
                      {c.title}
                    </span>
                  </div>
                  
                  <button
                    onClick={(e) => deleteConversation(c.id, e)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      color: '#4b5563',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.15s, background 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseOut={e => { e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.background = 'none'; }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          ) : (
            <p style={{ color: '#4b5563', fontSize: '11px', padding: '0 4px', fontStyle: 'italic' }}>Henüz sohbet yok.</p>
          )}
        </div>

        {/* User section */}
        <div style={{ padding: '10px', borderTop: '1px solid #1c1c1e' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(p => !p)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '9px', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: '8px', transition: 'background 0.15s' }}
              onMouseOver={e => (e.currentTarget.style.background = '#1a1a1c')}
              onMouseOut={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ width: '30px', height: '30px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User style={{ width: '14px', height: '14px', color: 'white' }} />
              </div>
              <span style={{ color: '#d1d5db', fontSize: '13px', fontWeight: 500, flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'Kullanıcı'}
              </span>
              <ChevronDown style={{ width: '13px', height: '13px', color: '#6b7280' }} />
            </button>
            {showUserMenu && (
              <div style={{ position: 'absolute', bottom: '44px', left: 0, right: 0, background: '#18181b', border: '1px solid #2d2d35', borderRadius: '10px', overflow: 'hidden', zIndex: 50 }}>
                <button onClick={() => router.push('/')}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', padding: '10px 14px', color: '#d1d5db', fontSize: '13px', cursor: 'pointer' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  <ChevronLeft size={14} /> Ana Sayfa
                </button>
                <button onClick={() => { logout(); router.push('/login'); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', borderTop: '1px solid #27272a', padding: '10px 14px', color: '#f87171', fontSize: '13px', cursor: 'pointer' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  <LogOut size={14} /> Çıkış Yap
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CHAT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fafafa' }}>

        {/* Header */}
        <div style={{ height: '55px', background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '12px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '14px', fontWeight: 600, color: '#111', margin: 0 }}>
              {conversation?.title || 'Araştırma Asistanı'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '100px', padding: '4px 12px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
            <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 600 }}>Çevrimiçi</span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 0' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px' }}>

            {/* Empty state */}
            {messages.length === 0 && !isStreaming && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', paddingTop: '60px' }}>
                <div style={{ width: '68px', height: '68px', margin: '0 auto 18px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 40px rgba(99,102,241,0.25)' }}>
                  <Sparkles style={{ width: '30px', height: '30px', color: 'white' }} />
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111', marginBottom: '8px' }}>Nasıl yardımcı olabilirim?</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.7, maxWidth: '380px', margin: '0 auto 28px' }}>
                  Sorularınızı sorun, dosya ekleyin ya da 🎤 ile sesli konuşun.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '100px', padding: '8px 16px', color: '#374151', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Messages list */}
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div key={idx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '20px' }}
                >
                  {msg.role === 'assistant' && (
                    <div style={{ width: '30px', height: '30px', flexShrink: 0, marginRight: '10px', marginTop: '2px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles style={{ width: '13px', height: '13px', color: 'white' }} />
                    </div>
                  )}

                  <div style={{
                    maxWidth: '74%',
                    background: msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#111',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    padding: '12px 16px',
                    fontSize: '14.5px', lineHeight: 1.65,
                    boxShadow: msg.role === 'user' ? '0 4px 20px rgba(99,102,241,0.3)' : '0 1px 6px rgba(0,0,0,0.07)',
                    border: msg.role === 'assistant' ? '1px solid #f0f0f0' : 'none',
                  }}>
                    {/* Attachment badge */}
                    {msg.attachment && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '5px 10px', fontSize: '12px' }}>
                        <Paperclip size={11} /> {msg.attachment}
                      </div>
                    )}

                    <div className={msg.isStreaming ? 'streaming-cursor' : ''} style={{ color: msg.role === 'user' ? 'white' : '#111' }}>
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p style={{ margin: '0 0 6px 0', color: msg.role === 'user' ? 'white' : '#111' }}>{children}</p>,
                          code: ({ children }) => <code style={{ background: msg.role === 'user' ? 'rgba(255,255,255,0.15)' : '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>{children}</code>,
                          ul: ({ children }) => <ul style={{ paddingLeft: '18px', margin: '4px 0' }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ paddingLeft: '18px', margin: '4px 0' }}>{children}</ol>,
                          li: ({ children }) => <li style={{ color: msg.role === 'user' ? 'white' : '#111', marginBottom: '2px' }}>{children}</li>,
                          strong: ({ children }) => <strong style={{ color: msg.role === 'user' ? 'white' : '#111', fontWeight: 600 }}>{children}</strong>,
                        }}
                      >{msg.content}</ReactMarkdown>
                    </div>

                    {/* TTS button for assistant messages */}
                    {msg.role === 'assistant' && !msg.isStreaming && (
                      <button
                        onClick={() => speakMessage(msg.content, idx)}
                        title="Sesli dinle"
                        style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '5px', background: playingMsgIdx === idx ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.04)', border: `1px solid ${playingMsgIdx === idx ? 'rgba(16,185,129,0.3)' : '#e5e7eb'}`, borderRadius: '8px', padding: '5px 10px', color: playingMsgIdx === idx ? '#10b981' : '#9ca3af', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}
                      >
                        <Volume2 size={12} /> {playingMsgIdx === idx ? 'Duraksatmak için tıkla' : 'Sesli Dinle'}
                      </button>
                    )}

                    {msg.sources?.length > 0 && (
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f0f0f0' }}>
                        <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Kaynaklar</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {msg.sources.map((src: any, i: number) => (
                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ede9fe', borderRadius: '100px', padding: '3px 10px', fontSize: '11px', color: '#7c3aed', fontWeight: 500 }}>
                              <FileText style={{ width: '9px', height: '9px' }} />
                              §{src.chunkIndex} · {(src.similarity * 100).toFixed(0)}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing dots */}
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px' }}
              >
                <div style={{ width: '30px', height: '30px', flexShrink: 0, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles style={{ width: '13px', height: '13px', color: 'white' }} />
                </div>
                <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: '18px 18px 18px 4px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
                  {[0, 0.18, 0.36].map((delay, i) => (
                    <motion.div key={i}
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 0.75, delay }}
                      style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#6366f1' }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
                ⚠️ {error}
              </div>
            )}

            <div ref={messagesEndRef} style={{ height: '4px' }} />
          </div>
        </div>

        {/* ── INPUT AREA ── */}
        <div style={{ background: '#fff', borderTop: '1px solid #f0f0f0', padding: '14px 24px 18px', flexShrink: 0 }}>
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>

            {/* File attachment preview */}
            <AnimatePresence>
              {attachedFile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ marginBottom: '10px' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '7px 12px', fontSize: '13px', color: '#7c3aed' }}>
                    <Paperclip size={13} />
                    <span style={{ fontWeight: 500 }}>{attachedFile.name}</span>
                    <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', display: 'flex', padding: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Voice listening indicator */}
            <AnimatePresence>
              {isListening && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ marginBottom: '10px' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '7px 14px', fontSize: '13px', color: '#ef4444' }}>
                    <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                      <Mic size={14} />
                    </motion.div>
                    Dinleniyor... (Türkçe konuşun)
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleAsk}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: '8px',
                background: '#fff', border: '1.5px solid #e5e7eb',
                borderRadius: '18px', padding: '8px 8px 8px 16px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
                onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
                onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)'; }}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(e); }
                  }}
                  disabled={isStreaming}
                  placeholder={isListening ? 'Sizi dinliyorum...' : 'Sorunuzu yazın... (Enter ile gönderin, Shift+Enter yeni satır)'}
                  id="chat-input"
                  style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none', fontSize: '14.5px', color: '#111', lineHeight: 1.6, minHeight: '48px', maxHeight: '180px', fontFamily: 'Inter, sans-serif', paddingTop: '8px' }}
                  rows={1}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingBottom: '4px' }}>
                  {/* File attach */}
                  <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json" onChange={handleFileAttach} style={{ display: 'none' }} id="file-input" />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    title="Dosya ekle"
                    style={{ width: '36px', height: '36px', borderRadius: '10px', background: attachedFile ? '#ede9fe' : 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: attachedFile ? '#7c3aed' : '#9ca3af', transition: 'all 0.15s' }}
                    onMouseOver={e => { if (!attachedFile) e.currentTarget.style.background = '#f5f5f7'; }}
                    onMouseOut={e => { if (!attachedFile) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Paperclip size={17} />
                  </button>

                  {/* Voice input */}
                  <button type="button" onClick={toggleVoice}
                    title={isListening ? 'Sesi durdur' : 'Sesle yaz'}
                    style={{ width: '36px', height: '36px', borderRadius: '10px', background: isListening ? '#fef2f2' : 'transparent', border: isListening ? '1px solid #fecaca' : '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isListening ? '#ef4444' : '#9ca3af', transition: 'all 0.15s' }}
                    onMouseOver={e => { if (!isListening) e.currentTarget.style.background = '#f5f5f7'; }}
                    onMouseOut={e => { if (!isListening) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>

                  {/* Send */}
                  <button type="submit" id="send-btn"
                    disabled={isStreaming || (!input.trim() && !attachedFile)}
                    style={{ width: '36px', height: '36px', borderRadius: '11px', background: (input.trim() || attachedFile) && !isStreaming ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e5e7eb', border: 'none', cursor: (input.trim() || attachedFile) && !isStreaming ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: (input.trim() || attachedFile) && !isStreaming ? '0 4px 14px rgba(99,102,241,0.35)' : 'none' }}
                  >
                    {isStreaming
                      ? <Loader2 style={{ width: '16px', height: '16px', color: '#9ca3af', animation: 'spin 1s linear infinite' }} />
                      : <Send style={{ width: '15px', height: '15px', color: (input.trim() || attachedFile) ? 'white' : '#9ca3af', transform: 'translateX(1px)' }} />
                    }
                  </button>
                </div>
              </div>
            </form>

            <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '11px', color: '#d1d5db' }}>
              Research AI · Yanıltıcı bilgiler içerebilir
            </p>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
