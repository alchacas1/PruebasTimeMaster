// app/layout.tsx 
import './globals.css';
import { ThemeProvider, HeaderWrapper, Footer, PermissionsManager } from '../components/layout';
import { ToastProvider } from '../components/ui/ToastProvider';
import { AuthWrapper } from '../components/auth';
import VersionCheckInitializer from '../components/VersionCheckInitializer';
import { XmlEgresosProvider } from '../components/xml/XmlEgresosProvider';
import BackToTop from '../components/ui/BackToTop';

export const metadata = {
  title: 'Time Master',
  description: 'Plataforma para gestión de precios, escaneo de códigos de barras, control de inventario y horarios laborales',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' }
    ],
    apple: '/apple-touch-icon.png',
    other: [
      {
        rel: 'android-chrome-192x192',
        url: '/android-chrome-192x192.png',
      },
      {
        rel: 'android-chrome-512x512',
        url: '/android-chrome-512x512.png',
      },
    ],
  },
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Time Master',
  },
  verification: {
    google: '9TNvqvQrFhVHvPtQR01Du1GhCiG1yjPPvCgJTGf09w0',
  },
  authors: [
    { name: 'AndersFloresM' },
    { name: 'AlvaroChavesC' }
  ],
  creator: 'AndersFloresM',
  robots: 'index, follow',
  generator: 'Next.js',
  applicationName: 'Time Master',
  keywords: ['Time Master', 'calculadora', 'contador', 'escaner', 'precio', 'codigo barras', 'horarios laborales', 'inventario'],
  category: 'business',
  other: {
    copyright: '2025 Time Master - AndersFloresM & AlvaroChavesC',
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#2563eb',
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="min-h-full bg-white dark:bg-zinc-900">
      <head suppressHydrationWarning>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <link rel="dns-prefetch" href="https://www.googleapis.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "Time Master",
              "description": "Plataforma integral para gestión de precios, escaneo de códigos de barras, control de inventario y horarios laborales",
              "url": "https://price-master-peach.vercel.app",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "author": {
                "@type": "Organization",
                "name": "Time Master",
                "url": "https://github.com/FloresAnders/Price-Master"
              }
            })
          }}
        />
      </head>
      <body className="bg-background text-foreground transition-colors duration-500 min-h-screen flex flex-col" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthWrapper>
            <PermissionsManager>
              <ToastProvider>
                <XmlEgresosProvider>
                  <VersionCheckInitializer />
                  <HeaderWrapper />
                  <main role="main" className="flex-1 flex flex-col w-full">
                    <div className="w-full" suppressHydrationWarning>
                      {children}
                    </div>
                  </main>
                  <BackToTop />
                  <Footer />
                </XmlEgresosProvider>
              </ToastProvider>
            </PermissionsManager>
          </AuthWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
