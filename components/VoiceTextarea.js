'use client';
import { useRef, useState, useEffect } from 'react';

export default function VoiceTextarea({ value, onChange, placeholder, rows = 3, required, className = 'textarea-royal', id }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // Live interim transcript (what the engine *thinks* you're saying right now).
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef(null);
  // Snapshot of the text that was in the box when recording started. Finals
  // are appended to this so simultaneous typing + speech don't fight each other.
  const baseTextRef = useRef('');
  // Finalized speech for this session (everything the engine has committed).
  const finalTranscriptRef = useRef('');
  // Idle timer — only stop after a long pause instead of the browser's default ~2s.
  const idleTimerRef = useRef(null);
  // When true, onend should not auto-restart (user tapped stop, or we hit idle).
  const manualStopRef = useRef(false);

  // Allow up to ~10 s of silence before fully stopping. The browser engine
  // itself ends on much shorter silences, but we auto-restart until this
  // timer fires, giving users room to think mid-sentence.
  const IDLE_TIMEOUT_MS = 10000;

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window));
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup if the component unmounts mid-session.
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      manualStopRef.current = true;
      try { recognitionRef.current?.stop(); } catch (_) {}
    };
  }, []);

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function resetIdleTimer() {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      // Long silence — stop for real.
      manualStopRef.current = true;
      try { recognitionRef.current?.stop(); } catch (_) {}
    }, IDLE_TIMEOUT_MS);
  }

  // Build the full text we want to show / commit: base + final + (optional) interim.
  function buildText(finalText, interimText) {
    const base = baseTextRef.current || '';
    const needsSpace = base && !base.endsWith(' ') && !base.endsWith('\n');
    const prefix = needsSpace ? ' ' : '';
    const spoken = (finalText + (interimText ? (finalText ? ' ' : '') + interimText : '')).trim();
    if (!spoken) return base;
    return base + prefix + spoken;
  }

  // Emit a change back to the parent using the same event-like shape it expects.
  function emit(nextValue) {
    onChange({ target: { value: nextValue } });
  }

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'pa-IN';
    // Continuous keeps the mic open across pauses; interim gives us the
    // in-progress words so the textarea updates in real time while speaking.
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    baseTextRef.current = value || '';
    finalTranscriptRef.current = '';
    setInterim('');
    manualStopRef.current = false;

    rec.onresult = (e) => {
      let newInterim = '';
      // Only process results from this event's resultIndex forward so we
      // don't double-append previously finalized chunks.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript || '';
        if (res.isFinal) {
          finalTranscriptRef.current = (finalTranscriptRef.current
            ? finalTranscriptRef.current + ' '
            : '') + text.trim();
        } else {
          newInterim += text;
        }
      }
      setInterim(newInterim);
      emit(buildText(finalTranscriptRef.current, newInterim));
      resetIdleTimer();
    };

    rec.onspeechstart = () => resetIdleTimer();
    rec.onaudiostart = () => resetIdleTimer();

    rec.onerror = (e) => {
      // 'no-speech' / 'aborted' fire during normal pauses — don't kill the session.
      if (e?.error === 'no-speech' || e?.error === 'aborted') return;
      manualStopRef.current = true;
    };

    rec.onend = () => {
      // If the browser engine ended on its own (short silence) and the user
      // hasn't explicitly stopped, restart to keep listening.
      if (!manualStopRef.current) {
        try {
          rec.start();
          return;
        } catch (_) {
          // start() can throw if the engine isn't quite ready — fall through.
        }
      }
      clearIdleTimer();
      setListening(false);
      // Commit the final-only value (drop any lingering interim text).
      emit(buildText(finalTranscriptRef.current, ''));
      setInterim('');
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      resetIdleTimer();
    } catch (_) {
      // Already started; ignore.
    }
  }

  function stopRecognition() {
    manualStopRef.current = true;
    clearIdleTimer();
    try { recognitionRef.current?.stop(); } catch (_) {}
    setListening(false);
  }

  function toggleVoice() {
    if (!supported) return;
    if (listening) stopRecognition();
    else startRecognition();
  }

  // While listening we render the live composed value so users see words
  // appear as they speak. When idle, we show whatever the parent passed in.
  const displayValue = listening
    ? buildText(finalTranscriptRef.current, interim)
    : (value || '');

  return (
    <div className="relative">
      <textarea
        id={id}
        className={className}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          if (listening) {
            // User is typing while mic is on — accept their edit as the new
            // base and reset accumulated speech so we don't fight them.
            baseTextRef.current = e.target.value;
            finalTranscriptRef.current = '';
            setInterim('');
          }
          onChange(e);
        }}
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