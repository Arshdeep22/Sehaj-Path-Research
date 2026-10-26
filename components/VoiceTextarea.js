'use client';
import { useRef, useState, useEffect } from 'react';

export default function VoiceTextarea({ value, onChange, placeholder, rows = 3, required, className = 'textarea-royal', id }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window));
  }, []);

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'pa-IN';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('');
      const prefix = value && !value.endsWith(' ') && !value.endsWith('\n') ? ' ' : '';
      onChange({ target: { value: value + prefix + transcript } });
    };

    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="relative">
      <textarea
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={rows}
        required={required}
        style={{ paddingRight: supported ? '3rem' : undefined }}
      />
      {supported && (
        <button
          type="button"
          onClick={toggleVoice}
          title={listening ? 'ਰੋਕੋ' : 'ਆਵਾਜ਼ ਨਾਲ ਟਾਈਪ ਕਰੋ (ਪੰਜਾਬੀ)'}
          style={{
            position: 'absolute',
            top: '50%',
            right: '0.5rem',
            transform: 'translateY(-50%)',
            background: listening
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'linear-gradient(135deg, #0c2540 0%, #1a3a5c 100%)',
            border: 'none',
            borderRadius: '50%',
            width: '2rem',
            height: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            boxShadow: listening
              ? '0 0 0 3px rgba(239,68,68,0.25), 0 2px 8px rgba(239,68,68,0.35)'
              : '0 2px 6px rgba(12,36,64,0.25)',
            transition: 'background 0.25s, box-shadow 0.25s, transform 0.15s',
          }}
          onMouseEnter={e => { if (!listening) e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {listening ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <style>{`@keyframes voice-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
              <rect x="6" y="5" width="4" height="14" rx="2" fill="white" style={{ animation: 'voice-pulse 0.9s ease-in-out infinite' }} />
              <rect x="14" y="5" width="4" height="14" rx="2" fill="white" style={{ animation: 'voice-pulse 0.9s ease-in-out infinite 0.45s' }} />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="2" width="6" height="13" rx="3" fill="white" />
              <path d="M5 11a7 7 0 0 0 14 0" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="8.5" y1="22" x2="15.5" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
