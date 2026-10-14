'use client'

import Link from 'next/link'

function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (secs < 60) return 'ਹੁਣੇ'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} ਮਿੰਟ ਪਹਿਲਾਂ`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ਘੰਟੇ ਪਹਿਲਾਂ`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} ਦਿਨ ਪਹਿਲਾਂ`
  return new Date(dateStr).toLocaleDateString('pa-IN')
}

function StarIcon({ filled }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24"
      fill={filled ? '#f59e0b' : 'none'}
      stroke={filled ? '#d97706' : 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function KanthIcon({ active }) {
  const color = active ? '#8b5cf6' : 'currentColor'
  const brainFill = active ? 'rgba(139,92,246,0.15)' : 'none'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <path fill={brainFill} strokeWidth="2"
        d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.99-3.01 3 3 0 0 1 .34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3z" />
      <path fill={brainFill} strokeWidth="2"
        d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.99-3.01 3 3 0 0 0-.34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3z" />
      <circle cx="19" cy="5" r="4.5" fill={active ? 'rgba(139,92,246,0.12)' : 'white'} strokeWidth="1.5" />
      <path d="M19 2.8v4.4M16.8 5h4.4" strokeWidth="1.8" />
    </svg>
  )
}

// Shared feed card. Props:
//   isFavourite + onToggleFavourite  → show ☆ toggle
//   isKanth + onToggleKanth          → show 🧠 toggle
export default function FeedCard({ item, isActive, isFavourite, onToggleFavourite, isKanth, onToggleKanth }) {
  const topicId = item.angle?.topic?.id
  const angleId = item.angle?.id
  const topicUrl = topicId ? `/topics/${topicId}?openAngle=${angleId}#shabad-${item.id}` : null

  function stopProp(e) { e.stopPropagation() }

  return (
    <div className={`feed-card${isActive ? ' is-active' : ' is-inactive'}`}>
      <div className="feed-card-sheen" />

      {/* Header row */}
      <div className="feed-card-header">
        <div className="flex items-center gap-3">
          <div className="feed-avatar">
            {(item.author?.full_name || item.author?.username || '?')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight" style={{ color: '#0c2540' }}>
              {item.author?.full_name || item.author?.username || 'ਅਣਜਾਣ'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(12,36,64,0.42)' }}>
              {timeAgo(item.created_at)}
            </p>
          </div>
        </div>
        {topicUrl && (
          <Link
            href={topicUrl}
            onClick={stopProp}
            className="feed-nav-btn"
            title="ਵਿਸ਼ੇ ਵੱਲ ਜਾਓ"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* Topic → Angle breadcrumb */}
      <div className="px-5 py-2.5 relative" style={{ zIndex: 2 }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="badge-royal" style={{ fontSize: '11px' }}>
            {item.angle?.topic?.title}
          </span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(12,36,64,0.28)" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="badge-gold" style={{ fontSize: '11px' }}>
            {item.angle?.title}
          </span>
        </div>
      </div>

      <div className="divider-royal mx-5" />

      {/* Shabad text */}
      <div className="feed-shabad-body">
        <p className="gurbani-text whitespace-pre-wrap" style={{ color: '#0c2540', fontSize: '1.05rem', lineHeight: 2 }}>
          {item.shabad_text}
        </p>
      </div>

      {/* Comment */}
      {item.comment && (
        <div className="feed-comment">
          <p className="text-sm leading-relaxed italic" style={{ color: 'rgba(12,36,64,0.62)', lineHeight: 1.75 }}>
            "{item.comment}"
          </p>
        </div>
      )}

      {/* Footer — actions */}
      {(onToggleFavourite || onToggleKanth) && (
        <div className="feed-card-footer" style={{ gap: 8 }}>
          {onToggleKanth && (
            <button
              onClick={e => { e.stopPropagation(); onToggleKanth(item.id) }}
              className={`feed-fav-btn${isKanth ? ' is-fav' : ''}`}
              style={isKanth ? { background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.3)', color: '#8b5cf6' } : {}}
              title={isKanth ? 'ਕੰਠ ਤੋਂ ਹਟਾਓ' : 'ਕੰਠ ਕਰੋ'}
              aria-pressed={isKanth}
            >
              <KanthIcon active={isKanth} />
              <span className="text-sm font-medium">ਕੰਠ</span>
            </button>
          )}
          {onToggleFavourite && (
            <button
              onClick={e => { e.stopPropagation(); onToggleFavourite(item.id) }}
              className={`feed-fav-btn${isFavourite ? ' is-fav' : ''}`}
              title={isFavourite ? 'ਮਨਪਸੰਦ ਤੋਂ ਹਟਾਓ' : 'ਮਨਪਸੰਦ ਵਿੱਚ ਜੋੜੋ'}
              aria-pressed={isFavourite}
            >
              <StarIcon filled={isFavourite} />
              <span className="text-sm font-medium">ਮਨਪਸੰਦ</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
