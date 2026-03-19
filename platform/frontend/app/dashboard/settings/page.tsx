'use client'

import { useState, useEffect } from 'react'
import { Settings, User, Bell, Shield, Database, Key, Save, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { integrationsAPI } from '@/lib/api'

export default function SettingsPage() {
  const { user } = useAuth()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('profile')

  // API Keys tab state
  const [shodanKey, setShodanKey] = useState('')
  const [shodanIntegrationId, setShodanIntegrationId] = useState<string | null>(null)
  const [virusTotalKey, setVirusTotalKey] = useState('')
  const [virusTotalIntegrationId, setVirusTotalIntegrationId] = useState<string | null>(null)
  const [keysLoading, setKeysLoading] = useState(false)

  useEffect(() => {
    if (activeTab !== 'api') return
    setKeysLoading(true)
    integrationsAPI.list().then((integrations) => {
      const shodan = integrations.find((i: any) => i.type === 'SHODAN' || i.name?.toLowerCase() === 'shodan')
      if (shodan) {
        setShodanIntegrationId(shodan.id)
        // authValue is masked server-side; show placeholder so user knows it's set
        setShodanKey(shodan.authValue ? '••••••••' : '')
      }
      const vt = integrations.find((i: any) => i.name?.toLowerCase().includes('virustotal'))
      if (vt) {
        setVirusTotalIntegrationId(vt.id)
        setVirusTotalKey(vt.authValue ? '••••••••' : '')
      }
    }).catch(() => {}).finally(() => setKeysLoading(false))
  }, [activeTab])

  const handleSave = async () => {
    setSaveError(null)

    if (activeTab === 'api') {
      try {
        // Save Shodan key if user typed a real value (not the masked placeholder)
        if (shodanKey && shodanKey !== '••••••••') {
          if (shodanIntegrationId) {
            await integrationsAPI.update(shodanIntegrationId, { authValue: shodanKey })
          } else {
            const created = await integrationsAPI.create({
              name: 'shodan',
              provider: 'Shodan',
              type: 'SHODAN',
              endpointUrl: 'https://api.shodan.io/shodan/host/search',
              query: '*',
              authType: 'API_KEY',
              authValue: shodanKey,
            })
            setShodanIntegrationId(created.id)
          }
          setShodanKey('••••••••')
        }

        // Save VirusTotal key if user typed a real value
        if (virusTotalKey && virusTotalKey !== '••••••••') {
          if (virusTotalIntegrationId) {
            await integrationsAPI.update(virusTotalIntegrationId, { authValue: virusTotalKey })
          } else {
            const created = await integrationsAPI.create({
              name: 'virustotal',
              provider: 'VirusTotal',
              type: 'HTTP_JSON',
              endpointUrl: 'https://www.virustotal.com/api/v3/',
              authType: 'API_KEY',
              authValue: virusTotalKey,
            })
            setVirusTotalIntegrationId(created.id)
          }
          setVirusTotalKey('••••••••')
        }
      } catch (err: any) {
        setSaveError(err.message || 'Failed to save API keys')
        return
      }
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'platform', label: 'Platform', icon: Database },
    { id: 'api', label: 'API Keys', icon: Key },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center space-x-3 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(240,184,64,0.2), rgba(157,95,255,0.15))', border: '1px solid rgba(240,184,64,0.3)' }}>
          <Settings className="w-5 h-5 text-[#f0b840]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#e0d6f6' }}>Settings</h1>
          <p className="text-sm" style={{ color: '#8878a9' }}>Manage your account and platform preferences</p>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
                  style={{
                    background: isActive ? 'linear-gradient(135deg, rgba(240,184,64,0.12), rgba(157,95,255,0.08))' : 'transparent',
                    borderLeft: isActive ? '2px solid #f0b840' : '2px solid transparent',
                    color: isActive ? '#f0b840' : '#8878a9',
                  }}>
                  <tab.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="flex-1 cosmic-panel p-6 space-y-6">
          {activeTab === 'profile' && (
            <>
              <h2 className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>Profile Settings</h2>
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                  style={{ background: 'linear-gradient(135deg, #f0b840, #9d5fff)', color: '#02020d' }}>
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
                <div>
                  <p className="font-semibold" style={{ color: '#e0d6f6' }}>{user?.firstName} {user?.lastName}</p>
                  <p className="text-sm" style={{ color: '#8878a9' }}>{user?.email}</p>
                  <span className="text-xs font-mono px-2 py-0.5 rounded mt-1 inline-block"
                    style={{ background: 'rgba(157,95,255,0.15)', color: '#c8a0ff' }}>{user?.role}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>First Name</label>
                  <input type="text" defaultValue={user?.firstName} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Last Name</label>
                  <input type="text" defaultValue={user?.lastName} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Email Address</label>
                  <input type="email" defaultValue={user?.email} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Organization</label>
                  <input type="text" defaultValue={user?.tenant?.name} className="input-field" />
                </div>
              </div>
            </>
          )}

          {activeTab === 'notifications' && (
            <>
              <h2 className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>Notification Preferences</h2>
              <div className="space-y-3">
                {[
                  { label: 'Critical vulnerability discovered', desc: 'Immediate alert for CRITICAL severity findings', on: true },
                  { label: 'Scan completed', desc: 'Notify when a scan finishes', on: true },
                  { label: 'Exploitation attempt result', desc: 'Alert on exploit success or failure', on: true },
                  { label: 'ROE expiry warning', desc: 'Warn 24h before ROE expires', on: false },
                  { label: 'Weekly summary report', desc: 'Weekly digest of security posture', on: false },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-lg"
                    style={{ background: 'rgba(14,14,58,0.4)', border: '1px solid rgba(157,95,255,0.08)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#e0d6f6' }}>{item.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#8878a9' }}>{item.desc}</p>
                    </div>
                    <input type="checkbox" defaultChecked={item.on} className="h-4 w-4 accent-[#f0b840]" />
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'security' && (
            <>
              <h2 className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>Security Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Current Password</label>
                  <input type="password" placeholder="••••••••" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>New Password</label>
                  <input type="password" placeholder="••••••••" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Confirm New Password</label>
                  <input type="password" placeholder="••••••••" className="input-field" />
                </div>
                <div className="p-4 rounded-lg" style={{ background: 'rgba(240,184,64,0.06)', border: '1px solid rgba(240,184,64,0.2)' }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: '#f0b840' }}>Two-Factor Authentication</p>
                  <p className="text-xs mb-3" style={{ color: '#8878a9' }}>Add an extra layer of security to your account</p>
                  <button className="btn-secondary text-xs px-3 py-1.5">Enable 2FA</button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'platform' && (
            <>
              <h2 className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>Platform Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Ollama API URL</label>
                  <input type="text" defaultValue="http://localhost:11434" className="input-field font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>AI Model</label>
                  <input type="text" defaultValue="Meta-Llama-3.1-8B-Instruct-abliterated" className="input-field font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Nuclei Rate Limit (req/s)</label>
                  <input type="number" defaultValue={150} className="input-field" />
                </div>
                <div className="p-4 rounded-lg" style={{ background: 'rgba(157,95,255,0.06)', border: '1px solid rgba(157,95,255,0.15)' }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: '#c8a0ff' }}>ROE Default Behaviour</p>
                  <p className="text-xs mb-3" style={{ color: '#8878a9' }}>
                    When no ROE is defined, exploitation is permitted if the user confirms authorization via the UI checkbox
                  </p>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked id="roe-default" className="h-4 w-4 accent-[#f0b840]" />
                    <label htmlFor="roe-default" className="text-xs" style={{ color: '#8878a9' }}>
                      Allow exploitation without defined ROE (requires auth confirmation)
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'api' && (
            <>
              <h2 className="text-lg font-semibold" style={{ color: '#e0d6f6' }}>API Keys</h2>
              {keysLoading && <p className="text-xs" style={{ color: '#8878a9' }}>Loading saved keys…</p>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>Shodan API Key</label>
                  <input
                    type="password"
                    placeholder="Enter Shodan API key…"
                    className="input-field font-mono text-sm"
                    value={shodanKey}
                    onChange={(e) => setShodanKey(e.target.value)}
                    onFocus={(e) => { if (e.target.value === '••••••••') setShodanKey('') }}
                  />
                  {shodanIntegrationId && <p className="text-xs mt-1" style={{ color: '#8878a9' }}>Key saved — enter a new value to replace it</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#8878a9' }}>VirusTotal API Key</label>
                  <input
                    type="password"
                    placeholder="Enter VirusTotal API key…"
                    className="input-field font-mono text-sm"
                    value={virusTotalKey}
                    onChange={(e) => setVirusTotalKey(e.target.value)}
                    onFocus={(e) => { if (e.target.value === '••••••••') setVirusTotalKey('') }}
                  />
                  {virusTotalIntegrationId && <p className="text-xs mt-1" style={{ color: '#8878a9' }}>Key saved — enter a new value to replace it</p>}
                </div>
                <div className="p-4 rounded-lg" style={{ background: 'rgba(14,14,58,0.4)', border: '1px solid rgba(157,95,255,0.1)' }}>
                  <p className="text-xs font-mono mb-2" style={{ color: '#8878a9' }}>Platform API Key</p>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 text-xs font-mono p-2 rounded"
                      style={{ background: 'rgba(157,95,255,0.08)', color: '#c8a0ff' }}>
                      sk-spectra-••••••••••••••••••••••••••••••••
                    </code>
                    <button className="btn-secondary text-xs px-3 py-1.5">Reveal</button>
                    <button className="btn-secondary text-xs px-3 py-1.5">Rotate</button>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="pt-4 border-t" style={{ borderColor: 'rgba(157,95,255,0.1)' }}>
            {saveError && <p className="text-sm mb-3" style={{ color: '#ff6b6b' }}>{saveError}</p>}
            <button onClick={handleSave} className="btn-premium flex items-center space-x-2 px-5 py-2.5 text-sm">
              {saved
                ? <><CheckCircle2 className="w-4 h-4" /><span>Saved!</span></>
                : <><Save className="w-4 h-4" /><span>Save Changes</span></>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
