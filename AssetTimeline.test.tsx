import React from 'react'
import { render, screen } from '@testing-library/react'
import AssetTimeline from '../AssetTimeline'

// Mock Lucide icons to avoid SVG rendering issues in tests
jest.mock('lucide-react', () => ({
  Activity: () => <div data-testid="icon-activity" />,
  ShieldAlert: () => <div data-testid="icon-shield-alert" />,
  CheckCircle: () => <div data-testid="icon-check-circle" />,
  Clock: () => <div data-testid="icon-clock" />,
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
  FileText: () => <div data-testid="icon-file-text" />,
}))

// Mock UI components that might be used inside the timeline
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: any, className?: string }) => <div className={className}>{children}</div>,
  CardHeader: ({ children }: { children: any }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: any }) => <div>{children}</div>,
  CardContent: ({ children }: { children: any }) => <div>{children}</div>,
}))

const mockEvents = [
  {
    id: '1',
    type: 'SCAN_COMPLETED',
    title: 'Scan Completed',
    description: 'Manual scan initiated by admin',
    timestamp: '2024-01-20T10:00:00Z',
    status: 'success',
  },
  {
    id: '2',
    type: 'VULNERABILITY_DETECTED',
    title: 'New Vulnerability',
    description: 'SQL Injection detected on login page',
    timestamp: '2024-01-21T15:30:00Z',
    status: 'danger',
    severity: 'high'
  },
  {
    id: '3',
    type: 'NOTE_ADDED',
    title: 'Note Added',
    description: 'Investigating potential false positive',
    timestamp: '2024-01-22T09:15:00Z',
    status: 'info',
  }
]

describe('AssetTimeline', () => {
  it('renders the timeline header', () => {
    render(<AssetTimeline events={[]} />)
    expect(screen.getByText(/Activity Timeline/i)).toBeInTheDocument()
  })

  it('renders a list of events', () => {
    render(<AssetTimeline events={mockEvents} />)
    
    expect(screen.getByText('Scan Completed')).toBeInTheDocument()
    expect(screen.getByText('New Vulnerability')).toBeInTheDocument()
    expect(screen.getByText('Note Added')).toBeInTheDocument()
    
    expect(screen.getByText('Manual scan initiated by admin')).toBeInTheDocument()
  })

  it('renders correct icons for different event types', () => {
    render(<AssetTimeline events={mockEvents} />)
    
    expect(screen.getByTestId('icon-check-circle')).toBeInTheDocument() // Success/Scan
    expect(screen.getByTestId('icon-alert-triangle')).toBeInTheDocument() // Danger/Vuln
    expect(screen.getByTestId('icon-file-text')).toBeInTheDocument() // Info/Note
  })

  it('renders empty state when no events provided', () => {
    render(<AssetTimeline events={[]} />)
    expect(screen.getByText(/No activity recorded/i)).toBeInTheDocument()
  })
})