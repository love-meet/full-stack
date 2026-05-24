import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import { VitePWA } from 'vite-plugin-pwa'
// PWA is wired in package.json but disabled in the config pending Vite-8/Rolldown
// compatibility in workbox-build. To re-enable: either upgrade vite-plugin-pwa to
// a version that supports Vite 8, or pin Vite to ^7 and uncomment.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'logo.png'],
    //   manifest: {
    //     name: 'Love meet',
    //     short_name: 'Love meet',
    //     description: 'Connect, chat, gift.',
    //     theme_color: '#0D1117',
    //     background_color: '#0D1117',
    //     display: 'standalone',
    //     start_url: '/',
    //     icons: [
    //       { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    //       { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    //     ],
    //   },
    //   workbox: { navigateFallback: '/index.html' },
    // }),
  ],
})
