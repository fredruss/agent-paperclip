// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'stream'
import path from 'path'
import os from 'os'

const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockRenameSync = vi.fn()
const mockRmSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockSpawnSync = vi.fn()

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    renameSync: mockRenameSync,
    rmSync: mockRmSync,
    readFileSync: mockReadFileSync
  }
}))

vi.mock('child_process', () => ({
  spawnSync: mockSpawnSync
}))

const { extractUsage, main } = await import('./usage-reporter')

const USAGE_FILE = path.join(os.homedir(), '.agent-paperclip', 'usage.json')

function feedStdin(input: string): void {
  Object.defineProperty(process, 'stdin', {
    value: Readable.from([input]),
    configurable: true
  })
}

describe('extractUsage', () => {
  it('returns snapshot when five_hour data is present', () => {
    const snapshot = extractUsage({
      rate_limits: { five_hour: { used_percentage: 42.5, resets_at: 1_700_000_000 } }
    })
    expect(snapshot?.usedPercentage).toBe(42.5)
    expect(snapshot?.resetsAt).toBe(1_700_000_000)
    expect(typeof snapshot?.updatedAt).toBe('number')
  })

  it('returns null when five_hour is missing', () => {
    expect(extractUsage({})).toBeNull()
    expect(extractUsage({ rate_limits: {} })).toBeNull()
  })

  it('returns null when fields have wrong types', () => {
    expect(
      extractUsage({
        rate_limits: { five_hour: { used_percentage: '42' as unknown as number, resets_at: 1 } }
      })
    ).toBeNull()
  })
})

describe('usage-reporter main()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false) // no wrapped-statusline.json
  })

  it('writes usage.json when payload has five_hour data', async () => {
    feedStdin(JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 30, resets_at: 9_999_999_999 } }
    }))

    await main()

    expect(mockWriteFileSync).toHaveBeenCalled()
    expect(mockRenameSync).toHaveBeenCalledWith(
      expect.stringContaining(`${USAGE_FILE}.tmp-`),
      USAGE_FILE
    )
    expect(mockRmSync).not.toHaveBeenCalled()
  })

  it('clears usage.json when payload has no five_hour data', async () => {
    feedStdin(JSON.stringify({ rate_limits: {} }))

    await main()

    expect(mockRmSync).toHaveBeenCalledWith(USAGE_FILE, { force: true })
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('clears usage.json when payload is an empty object', async () => {
    feedStdin(JSON.stringify({}))

    await main()

    expect(mockRmSync).toHaveBeenCalledWith(USAGE_FILE, { force: true })
  })

  it('leaves usage.json untouched when stdin is unparseable', async () => {
    feedStdin('not-json')

    await main()

    expect(mockRmSync).not.toHaveBeenCalled()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('leaves usage.json untouched when stdin is empty', async () => {
    feedStdin('')

    await main()

    expect(mockRmSync).not.toHaveBeenCalled()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('swallows rmSync errors silently', async () => {
    mockRmSync.mockImplementation(() => {
      throw new Error('boom')
    })
    feedStdin(JSON.stringify({}))

    await expect(main()).resolves.toBeUndefined()
  })
})
