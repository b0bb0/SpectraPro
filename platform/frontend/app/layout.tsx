import type { Metadata } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from 'sonner'

const heading = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const body = Space_Mono({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SpectraPRO — AI-Powered Offensive Security Platform',
  description:
    'Orchestrated recon, deep scanning, AI triage, and executive-ready intelligence. Vulnerability management for security teams that ship fast.',
  keywords: [
    'vulnerability management',
    'penetration testing',
    'security platform',
    'AI security',
    'attack surface management',
    'nuclei scanner',
    'security operations',
  ],
  authors: [{ name: 'SpectraPRO' }],
  openGraph: {
    title: 'SpectraPRO — AI-Powered Offensive Security Platform',
    description:
      'Orchestrated recon, deep scanning, AI triage, and executive-ready intelligence. Built for programs iterating weekly, not yearly.',
    url: 'https://spectrapro.io',
    siteName: 'SpectraPRO',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SpectraPRO — AI-Powered Offensive Security Platform',
    description:
      'Orchestrated recon, deep scanning, AI triage, and executive-ready intelligence.',
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL('https://spectrapro.io'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className={`${heading.variable} ${body.variable} antialiased`}>
        <AuthProvider>
          {children}
          <Toaster position="top-right" richColors closeButton toastOptions={{ style: { borderRadius: 12 } }} />
        </AuthProvider>
      </body>
    </html>
  )
}
