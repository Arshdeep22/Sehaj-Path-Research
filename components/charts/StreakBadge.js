'use client'

// Compact streak pill — current consecutive "done" days for a category.
export default function StreakBadge({ streak, best }) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
        style={{ background: streak > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(12,36,64,0.05)', border: `1px solid ${streak > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(12,36,64,0.1)'}` }}>
        <span style={{ fontSize: '15px' }}>{streak > 0 ? '🔥' : '·'}</span>
        <span className="font-bold text-sm" style={{ color: streak > 0 ? '#b45309' : 'rgba(12,36,64,0.5)' }}>{streak}</span>
        <span style={{ fontSize: '11px', color: 'rgba(12,36,64,0.45)' }}>ਦਿਨ</span>
      </div>
      {best > 0 && (
        <span style={{ fontSize: '10px', color: 'rgba(12,36,64,0.4)' }}>ਸਭ ਤੋਂ ਵੱਧ: {best}</span>
      )}
    </div>
  )
}
