'use client'

import { useRouter } from 'next/navigation'

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

// Shared feed/favourites card. Pass isFavourite + onToggleFavourite to show the ☆ toggle.
export default function FeedCard({ item, isActive, isFavourite, onToggleFavourite }) {
  const router = useRouter()

  function handleCardClick() {
    const topicId = item.angle?.topic?.id
    const angleId = item.angle?.id
    if (topicId) {
      router.push(`/topics/${topicId}?openAngle=${angleId}#shabad-${item.id}`)
    }
  }

  function handleStarClick(e) {
    e.stopPropagation()
    onToggleFavourite?.(item.id)
  }

  return (
    <div className={`feed-card${isActive ? ' is-active' : ' is-inactive'}`}>
      {/* Glass sheen overlay */}
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
        <button
          onClick={handleCardClick}
          className="feed-nav-btn"
          title="ਵਿਸ਼ੇ ਵੱਲ ਜਾਓ"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
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

      {/* Divider */}
      <div className="divider-royal mx-5" />

      {/* Shabad text */}
      <div className="feed-shabad-body" onClick={handleCardClick}>
        <p className="gurbani-text whitespace-pre-wrap" style={{ color: '#0c2540', fontSize: '1.05rem', lineHeight: 2 }}>
          {item.shabad_text}
        </p>
      </div>

      {/* Translation / comment */}
      {item.comment && (
        <div className="feed-comment" onClick={handleCardClick}>
          <p className="text-sm leading-relaxed italic" style={{ color: 'rgba(12,36,64,0.62)', lineHeight: 1.75 }}>
            "{item.comment}"
          </p>
        </div>
      )}

      {/* Footer — favourite toggle */}
      {onToggleFavourite && (
        <div className="feed-card-footer">
          <button
            onClick={handleStarClick}
            className={`feed-fav-btn${isFavourite ? ' is-fav' : ''}`}
            title={isFavourite ? 'ਮਨਪਸੰਦ ਤੋਂ ਹਟਾਓ' : 'ਮਨਪਸੰਦ ਵਿੱਚ ਜੋੜੋ'}
            aria-pressed={isFavourite}
          >
            <StarIcon filled={isFavourite} />
            <span className="text-sm font-medium">ਮਨਪਸੰਦ</span>
          </button>
        </div>
      )}
    </div>
  )
}
