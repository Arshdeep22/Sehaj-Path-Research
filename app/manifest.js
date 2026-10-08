export default function manifest() {
  return {
    name: 'ਸਹਿਜ ਪਾਠ ਖੋਜ',
    short_name: 'ਸਹਿਜ ਪਾਠ',
    description: 'ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਦੀ ਸਾਂਝੀ ਖੋਜ',
    start_url: '/jhalak',
    display: 'standalone',
    background_color: '#f0f9ff',
    theme_color: '#0c2540',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
