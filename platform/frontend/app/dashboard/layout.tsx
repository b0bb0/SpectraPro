'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Shield,
  LayoutDashboard,
  Server,
  AlertTriangle,
  FileText,
  Settings,
  Users,
  Activity,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ClipboardList,
  Target,
  Terminal,
  Network,
  FileCode,
  Clock,
  Radio,
  Crosshair,
  TrendingUp,
  Power,
  PlugZap,
  Bell,
  Search,
  Code2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import ErrorBoundary from '@/components/ErrorBoundary'
import StarCanvas from '@/components/StarCanvas'
import { WebSocketProvider } from '@/contexts/WebSocketContext'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  section?: string
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'overview' },
  { name: 'Executive', href: '/dashboard/executive', icon: Shield, section: 'overview' },
  { name: 'Assets', href: '/dashboard/assets', icon: Server, section: 'inventory' },
  { name: 'Vulnerabilities', href: '/dashboard/vulnerabilities', icon: AlertTriangle, section: 'inventory' },
  { name: 'Attack Surface', href: '/dashboard/attack-surface', icon: Target, section: 'inventory' },
  { name: 'Exposure', href: '/dashboard/exposure', icon: Network, section: 'inventory' },
  { name: 'Integrations', href: '/dashboard/integrations', icon: PlugZap, section: 'inventory' },
  { name: 'Scans', href: '/dashboard/scans', icon: Activity, section: 'operations' },
  { name: 'Scheduled Scans', href: '/dashboard/scheduled-scans', icon: Clock, section: 'operations' },
  { name: 'Reconnaissance', href: '/dashboard/reconnaissance', icon: Radio, section: 'offensive' },
  { name: 'Source Scanner', href: '/dashboard/source-scanner', icon: Code2, section: 'offensive' },
  { name: 'Exploitation', href: '/dashboard/exploitation', icon: Crosshair, section: 'offensive' },
  { name: 'Impact Assessment', href: '/dashboard/impact', icon: TrendingUp, section: 'offensive' },
  { name: 'Kill Switch', href: '/dashboard/kill-switch', icon: Power, adminOnly: true, section: 'offensive' },
  { name: 'Templates', href: '/dashboard/templates', icon: FileCode, adminOnly: true, section: 'admin' },
  { name: 'Console', href: '/dashboard/console', icon: Terminal, adminOnly: true, section: 'admin' },
  { name: 'Reports', href: '/dashboard/reports', icon: FileText, section: 'admin' },
  { name: 'Users', href: '/dashboard/users', icon: Users, section: 'admin' },
  { name: 'Audit Logs', href: '/dashboard/audit', icon: ClipboardList, section: 'admin' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, section: 'admin' },
]

const sectionLabels: Record<string, string> = {
  overview: 'OVERVIEW',
  inventory: 'ASSET INVENTORY',
  operations: 'SCAN OPS',
  offensive: 'OFFENSIVE SEC',
  admin: 'ADMIN',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  // Group nav items by section
  const sections = navigation.reduce((acc, item) => {
    const s = item.section || 'other'
    if (!acc[s]) acc[s] = []
    acc[s].push(item)
    return acc
  }, {} as Record<string, NavItem[]>)

  return (
    <ProtectedRoute>
    <WebSocketProvider>
      <div className="min-h-screen text-[var(--color-text)] transition-colors" style={{ background: 'var(--color-bg)' }}>
        {/* Cosmic background layers */}
        <StarCanvas />
        <div className="aurora-1" />
        <div className="aurora-2" />
        <div className="aurora-3" />
        <div className="shoot" />
        <div className="shoot" />
        <div className="shoot" />

        {/* Sidebar for desktop */}
        <aside
          aria-label="Main navigation"
          className={`hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-[width] duration-200 ease-out ${
            sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'
          }`}
          style={{
            background: 'rgba(8, 8, 42, 0.85)',
            backdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(157, 95, 255, 0.1)',
            zIndex: 30,
          }}
        >
          <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
            {/* Logo */}
            <div className={`flex items-center flex-shrink-0 ${sidebarCollapsed ? 'px-3 justify-center' : 'px-5'} mb-8`}>
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #f0b840, #9d5fff)',
                    boxShadow: '0 0 20px rgba(240, 184, 64, 0.3)',
                  }}
                >
                  <Shield className="w-5 h-5 text-[#02020d]" />
                </div>
                {!sidebarCollapsed && (
                  <div>
                    <span className="text-xl font-bold gradient-text leading-tight">SpectraPRO</span>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      Offensive Command
                    </p>
                  </div>
                )}
              </div>
              <button
                className="ml-auto hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all"
                style={{
                  border: '1px solid rgba(157, 95, 255, 0.15)',
                  color: 'var(--color-text-muted)',
                }}
                onClick={() => setSidebarCollapsed((v) => !v)}
                aria-label="Toggle sidebar"
              >
                {sidebarCollapsed ? <ChevronDown className="-rotate-90 w-3.5 h-3.5" /> : <ChevronDown className="rotate-90 w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Navigation by sections */}
            <nav aria-label="Dashboard navigation" className="flex-1 px-2 space-y-4 overflow-y-auto">
              {Object.entries(sections).map(([section, items]) => (
                <div key={section} role="group" aria-label={sectionLabels[section] || section}>
                  {!sidebarCollapsed && (
                    <div
                      className="px-3 mb-1.5 text-[10px] font-mono tracking-[0.12em] uppercase"
                      style={{ color: 'var(--color-gold)' }}
                      aria-hidden="true"
                    >
                      {sectionLabels[section] || section}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {items
                      .filter((item) => !item.adminOnly || user?.role === 'ADMIN')
                      .map((item) => {
                        const isActive = pathname === item.href
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            aria-current={isActive ? 'page' : undefined}
                            className="group flex items-center px-3 py-2 text-[13px] font-medium rounded-lg transition-all"
                            style={{
                              background: isActive
                                ? 'linear-gradient(135deg, rgba(240,184,64,0.15), rgba(157,95,255,0.12))'
                                : 'transparent',
                              borderLeft: isActive
                                ? '2px solid #f0b840'
                                : '2px solid transparent',
                              color: isActive ? '#f0b840' : 'var(--color-text-muted)',
                              boxShadow: isActive ? '0 0 12px rgba(240,184,64,0.08)' : 'none',
                            }}
                          >
                            <item.icon
                              className={`${sidebarCollapsed ? 'mr-0' : 'mr-2.5'} h-4 w-4 flex-shrink-0 transition-colors ${
                                isActive ? 'text-[#f0b840]' : 'text-[#8878a9]'
                              }`}
                              aria-hidden="true"
                            />
                            {!sidebarCollapsed ? item.name : <span className="sr-only">{item.name}</span>}
                          </Link>
                        )
                      })}
                  </div>
                </div>
              ))}
            </nav>

            {/* User Menu */}
            <div className="flex-shrink-0 px-2 pb-3">
              <div
                className={`rounded-xl p-3 ${sidebarCollapsed ? 'flex flex-col items-center gap-2' : ''}`}
                style={{
                  background: 'rgba(14, 14, 58, 0.5)',
                  border: '1px solid rgba(157, 95, 255, 0.1)',
                }}
              >
                <div className={`flex ${sidebarCollapsed ? 'flex-col items-center' : 'items-center space-x-3'} mb-2`}>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[#02020d] font-semibold text-sm"
                    style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)' }}
                  >
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </div>
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {user?.role}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-center space-x-2'} px-3 py-1.5 text-sm rounded-lg transition-all`}
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ff6b6b'
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <LogOut className="w-4 h-4" />
                  {!sidebarCollapsed && <span>Sign out</span>}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile sidebar */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: 'rgba(2, 2, 13, 0.7)', backdropFilter: 'blur(4px)' }}
              onClick={() => setSidebarOpen(false)}
            />
            <div
              className="fixed inset-y-0 left-0 flex flex-col w-64 z-50 lg:hidden"
              style={{
                background: 'rgba(8, 8, 42, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRight: '1px solid rgba(157, 95, 255, 0.12)',
              }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)', boxShadow: '0 0 14px rgba(240,184,64,0.3)' }}
                  >
                    <Shield className="w-5 h-5 text-[#02020d]" />
                  </div>
                  <span className="text-xl font-bold gradient-text">SpectraPRO</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} style={{ color: 'var(--color-text-muted)' }} aria-label="Close navigation menu">
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
                {navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className="group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all"
                      style={{
                        background: isActive ? 'rgba(240,184,64,0.1)' : 'transparent',
                        color: isActive ? '#f0b840' : 'var(--color-text-muted)',
                      }}
                    >
                      <item.icon
                        className={`mr-3 h-4 w-4 flex-shrink-0 ${isActive ? 'text-[#f0b840]' : 'text-[#8878a9]'}`}
                      />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>

              <div className="flex-shrink-0 px-3 pb-3">
                <div className="rounded-lg p-3" style={{ background: 'rgba(14,14,58,0.5)', border: '1px solid rgba(157,95,255,0.1)' }}>
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#02020d] font-semibold" style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)' }}>
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{user?.firstName} {user?.lastName}</p>
                      <p className="text-xs font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>{user?.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-2 justify-center px-3 py-1.5 text-sm rounded-lg transition-all"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Main content */}
        <div
          className={`${sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]'} flex flex-col flex-1 transition-[padding] duration-200`}
          style={{ position: 'relative', zIndex: 10 }}
        >
          {/* Top bar for mobile */}
          <div
            className="sticky top-0 z-20 flex-shrink-0 flex h-14 lg:hidden"
            style={{
              background: 'rgba(8, 8, 42, 0.85)',
              backdropFilter: 'blur(16px)',
              borderBottom: '1px solid rgba(157, 95, 255, 0.1)',
            }}
          >
            <button
              type="button"
              className="px-4"
              style={{ color: 'var(--color-text-muted)' }}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex items-center space-x-3 flex-1 px-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)', boxShadow: '0 0 12px rgba(240,184,64,0.25)' }}
              >
                <Shield className="w-4 h-4 text-[#02020d]" />
              </div>
              <span className="text-lg font-bold gradient-text">SpectraPRO</span>
            </div>
          </div>

          {/* Top bar desktop */}
          <header
            className="hidden lg:flex sticky top-0 z-20 h-14 items-center px-6"
            style={{
              background: 'rgba(2, 2, 13, 0.6)',
              backdropFilter: 'blur(20px)',
              borderBottom: '1px solid rgba(157, 95, 255, 0.08)',
            }}
          >
            <div className="relative w-[380px] max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
              <input
                placeholder="Search anywhere (⌘K)"
                aria-label="Search anywhere"
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'rgba(14, 14, 58, 0.4)',
                  border: '1px solid rgba(157, 95, 255, 0.12)',
                  color: 'var(--color-text)',
                }}
              />
            </div>

            <div className="ml-auto flex items-center space-x-3">
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono"
                style={{ border: '1px solid rgba(157,95,255,0.15)', color: 'var(--color-text-muted)' }}
              >
                ⌘K
              </button>
              <button
                className="relative p-2 rounded-lg transition-all"
                style={{ color: 'var(--color-text)' }}
                aria-label="Notifications"
              >
                <Bell className="w-4.5 h-4.5" aria-hidden="true" />
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                  style={{ background: '#f0b840', boxShadow: '0 0 6px rgba(240,184,64,0.5)' }}
                  aria-label="New notifications available"
                />
              </button>
              <div
                className="flex items-center space-x-2 rounded-full px-3 py-1.5"
                style={{
                  background: 'rgba(14, 14, 58, 0.4)',
                  border: '1px solid rgba(157, 95, 255, 0.12)',
                }}
              >
                <div
                  className="w-7 h-7 rounded-full font-semibold text-xs flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)', color: '#02020d' }}
                >
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{user?.firstName}</p>
                  <p className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{user?.role}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-10">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </WebSocketProvider>
    </ProtectedRoute>
  )
}
