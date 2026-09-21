import './globals.css'

export const metadata = {
  title: 'ਸਹਿਜ ਪਾਠ ਖੋਜ',
  description: 'ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਦੀ ਸਾਂਝੀ ਖੋਜ',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

// SVG lotus/flower for background decoration
function Flower({ size = 120, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <g transform="translate(60,60)">
        {/* 8 outer petals */}
        {[0,45,90,135,180,225,270,315].map(deg => (
          <path
            key={deg}
            d="M0,0 C-9,-16 -7,-38 0,-50 C7,-38 9,-16 0,0"
            fill="rgba(56,189,248,0.55)"
            transform={`rotate(${deg})`}
          />
        ))}
        {/* 8 inner petals offset 22.5° */}
        {[22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5].map(deg => (
          <path
            key={deg}
            d="M0,0 C-6,-11 -5,-26 0,-35 C5,-26 6,-11 0,0"
            fill="rgba(14,65,110,0.5)"
            transform={`rotate(${deg})`}
          />
        ))}
        {/* Center */}
        <circle r="11" fill="rgba(245,158,11,0.6)" />
        <circle r="5" fill="rgba(245,158,11,0.8)" />
      </g>
    </svg>
  )
}

export default function RootLayout({ children }) {
  return (
    <html lang="pa">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi:wght@300;400;500;600;700;800;900&family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: 'linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)', minHeight: '100vh' }}>

        {/* Background orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* Flower decorations */}
        <div className="flower-bg" aria-hidden="true">
          <Flower size={160} style={{ top: '-40px', left: '-40px', animation: 'flowerDrift 14s ease-in-out infinite' }} />
          <Flower size={100} style={{ top: '15%', right: '-20px', animation: 'flowerDriftAlt 11s ease-in-out infinite' }} />
          <Flower size={130} style={{ top: '40%', left: '-30px', animation: 'flowerDrift 17s ease-in-out infinite reverse' }} />
          <Flower size={80}  style={{ bottom: '20%', right: '-10px', animation: 'flowerDriftAlt 9s ease-in-out infinite' }} />
          <Flower size={110} style={{ bottom: '-30px', left: '30%', animation: 'flowerDrift 13s ease-in-out infinite' }} />
          <Flower size={70}  style={{ top: '60%', left: '55%', animation: 'flowerDriftAlt 15s ease-in-out infinite reverse' }} />
          <Flower size={90}  style={{ top: '25%', left: '40%', animation: 'flowerDrift 12s ease-in-out infinite', opacity: 0.07 }} />
        </div>

        <div className="relative z-10 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
