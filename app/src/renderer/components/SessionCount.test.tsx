import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionCount } from './SessionCount'

describe('SessionCount', () => {
  it('returns null when count is 0', () => {
    const { container } = render(<SessionCount count={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when count is 1', () => {
    const { container } = render(<SessionCount count={1} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders count when greater than 1', () => {
    render(<SessionCount count={2} />)
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('renders larger counts', () => {
    render(<SessionCount count={5} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('has session-count class', () => {
    const { container } = render(<SessionCount count={3} />)
    expect(container.querySelector('.session-count')).toBeTruthy()
  })
})
