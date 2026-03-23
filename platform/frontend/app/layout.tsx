import type { Metadata } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from 'sonner'

const heading = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['600', '700'],
})

const body = Space_Mono({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'SpectraPRO — Offensive Security Command Platform',
    template: '%s | SpectraPRO',
  },
  description:
    'Orchestrated recon, deep scanning, AI-powered triage, and executive-ready intelligence. Vulnerability management for teams that ship fast.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'SpectraPRO — Offensive Security Command Platform',
    description:
      'Orchestrated recon, deep scanning, AI-powered triage, and executive-ready intelligence.',
    siteName: 'SpectraPRO',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SpectraPRO — Offensive Security Command Platform',
    description:
      'Orchestrated recon, deep scanning, AI-powered triage, and executive-ready intelligence.',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className={`${heading.variable} ${body.variable}`}>
        <AuthProvider>
          {children}
          <Toaster position="top-right" richColors closeButton toastOptions={{ style: { borderRadius: 12 } }} />
        </AuthProvider>
      </body>
    </html>
  )
}
