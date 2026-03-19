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
  title: 'SpectraPRO - AI-Powered Vulnerability Management',
  description: 'Enterprise-grade vulnerability management platform with AI-powered analysis',
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
