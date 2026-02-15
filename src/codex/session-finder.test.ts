// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReaddir = vi.fn()
const mockStat = vi.fn()

vi.mock('fs', () => ({
  default: { existsSync: mockExistsSync },
  existsSync: mockExistsSync
}))

vi.mock('fs/promises', () => ({
  default: { readdir: mockReaddir, stat: mockStat },
  readdir: mockReaddir,
  stat: mockStat
}))

const { findLatestSession } = await import('./session-finder')

describe('findLatestSession', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.clearAllMocks() })

  it('returns null when sessions directory does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    expect(await findLatestSession()).toBeNull()
  })

  it('returns null when sessions directory is empty', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddir.mockResolvedValue([])
    expect(await findLatestSession()).toBeNull()
  })

  it('finds the latest session file', async () => {
    mockExistsSync.mockReturnValue(true)

    // Mock directory structure: 2026/02/15/ with one rollout file
    mockReaddir
      .mockResolvedValueOnce(['2026'])        // years
      .mockResolvedValueOnce(['02'])           // months
      .mockResolvedValueOnce(['15'])           // days
      .mockResolvedValueOnce(['rollout-2026-02-15T13-00-00-abc.jsonl'])  // files

    mockStat.mockResolvedValue({ mtimeMs: 1000 })

    const result = await findLatestSession()
    expect(result).toContain('rollout-2026-02-15T13-00-00-abc.jsonl')
  })

  it('picks the most recently modified file when multiple exist', async () => {
    mockExistsSync.mockReturnValue(true)

    mockReaddir
      .mockResolvedValueOnce(['2026'])
      .mockResolvedValueOnce(['02'])
      .mockResolvedValueOnce(['15'])
      .mockResolvedValueOnce(['rollout-old.jsonl', 'rollout-new.jsonl'])

    mockStat
      .mockResolvedValueOnce({ mtimeMs: 1000 })   // old
      .mockResolvedValueOnce({ mtimeMs: 2000 })   // new

    const result = await findLatestSession()
    expect(result).toContain('rollout-new.jsonl')
  })

  it('skips non-numeric directories', async () => {
    mockExistsSync.mockReturnValue(true)

    mockReaddir
      .mockResolvedValueOnce(['.DS_Store', '2026'])
      .mockResolvedValueOnce(['02'])
      .mockResolvedValueOnce(['15'])
      .mockResolvedValueOnce(['rollout-test.jsonl'])

    mockStat.mockResolvedValue({ mtimeMs: 1000 })

    const result = await findLatestSession()
    expect(result).toContain('rollout-test.jsonl')
  })

  it('skips non-rollout files', async () => {
    mockExistsSync.mockReturnValue(true)

    mockReaddir
      .mockResolvedValueOnce(['2026'])
      .mockResolvedValueOnce(['02'])
      .mockResolvedValueOnce(['15'])
      .mockResolvedValueOnce(['notes.txt', '.DS_Store'])

    const result = await findLatestSession()
    expect(result).toBeNull()
  })

  it('returns null when readdir throws', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddir.mockRejectedValue(new Error('EACCES'))

    expect(await findLatestSession()).toBeNull()
  })
})
