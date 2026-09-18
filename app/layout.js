import './globals.css'

export const metadata = {
  title: 'ਸਹਿਜ ਪਾਠ ਖੋਜ',
  description: 'ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਦੀ ਸਾਂਝੀ ਖੋਜ',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
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
        <div className="relative z-10 min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)', minHeight: '100vh' }}>
          {children}
        </div>
      </body>
    </html>
  )
}
