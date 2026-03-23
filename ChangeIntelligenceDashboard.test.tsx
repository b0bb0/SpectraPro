import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChangeIntelligenceDashboard from '../ChangeIntelligenceDashboard'

// Mock the API_URL
jest.mock('@/lib/api', () => ({
  API_URL: 'http://localhost:3000',
}))

// Mock lucide-react icons to simplify DOM and avoid SVG issues
jest.mock('lucide-react', () => ({
  GitCompare: () => <div data-testid="icon-git-compare" />,
  TrendingUp: () => <div data-testid="icon-trending-up" />,
  TrendingDown: () => <div data-testid="icon-trending-down" />,
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
  Plus: () => <div data-testid="icon-plus" />,
  Search: () => <div data-testid="icon-search" />,
  Loader2: () => <div data-testid="loader" />,
  Calendar: () => <div data-testid="icon-calendar" />,
}))

// Mock global fetch
global.fetch = jest.fn()

const mockChanges = [
  {
    id: '1',
    assetId: 'asset1',
    changeType: 'NEW_PARAMETERS',
    previousValue: '[]',
    newValue: '["param1", "param2"]',
    riskDelta: 5,
    detectedAt: '2023-01-01T10:00:00Z',
    assets: {
      name: 'Asset One',
      url: 'https://example.com/1',
    },
  },
  {
    id: '2',
    assetId: 'asset2',
    changeType: 'NEW_EXPOSURE',
    previousValue: '{}',
    newValue: '{"path": "/admin"}',
    riskDelta: 20,
    detectedAt: '2023-01-02T10:00:00Z',
    assets: {
      name: 'Asset Two',
      url: 'https://example.com/2',
    },
  },
]

describe('ChangeIntelligenceDashboard', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear()
  })

  it('renders loading state initially', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}))
    render(<ChangeIntelligenceDashboard />)
    expect(screen.getByTestId('loader')).toBeInTheDocument()
  })

  it('renders dashboard with data after loading', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ success: true, data: { changes: mockChanges } }),
    })

    render(<ChangeIntelligenceDashboard />)

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Change Intelligence')).toBeInTheDocument()
    
    // Check if changes are rendered
    expect(screen.getByText('Asset One')).toBeInTheDocument()
    expect(screen.getByText('Asset Two')).toBeInTheDocument()
    
    // Check stats (Total Risk: 5 + 20 = 25)
    expect(screen.getByText('+25')).toBeInTheDocument()
  })

  it('filters changes by type', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ success: true, data: { changes: mockChanges } }),
    })

    render(<ChangeIntelligenceDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Asset One')).toBeInTheDocument()
    })

    // Select 'New Exposure' filter
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'NEW_EXPOSURE' } })

    await waitFor(() => {
      expect(screen.queryByText('Asset One')).not.toBeInTheDocument()
      expect(screen.getByText('Asset Two')).toBeInTheDocument()
    })
  })

  it('filters changes by search term', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ success: true, data: { changes: mockChanges } }),
    })

    render(<ChangeIntelligenceDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Asset One')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search by asset...')
    fireEvent.change(searchInput, { target: { value: 'Two' } })

    await waitFor(() => {
      expect(screen.queryByText('Asset One')).not.toBeInTheDocument()
      expect(screen.getByText('Asset Two')).toBeInTheDocument()
    })
  })

  it('opens comparison modal on click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ success: true, data: { changes: mockChanges } }),
    })

    render(<ChangeIntelligenceDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Asset One')).toBeInTheDocument()
    })

    const compareButtons = screen.getAllByText('Compare')
    fireEvent.click(compareButtons[0]) // Click compare on first item

    await waitFor(() => {
      expect(screen.getByText('Change Comparison')).toBeInTheDocument()
      expect(screen.getByText('Previous State')).toBeInTheDocument()
      expect(screen.getByText('Current State')).toBeInTheDocument()
    })
  })
})