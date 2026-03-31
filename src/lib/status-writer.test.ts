// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockWriteFile = vi.fn()
const mockMkdir = vi.fn()
const mockOpen = vi.fn()
const mockRename = vi.fn()
const mockRm = vi.fn()
const mockStat = vi.fn()

vi.mock('fs', () => ({
  default: { existsSync: mockExistsSync },
  existsSync: mockExistsSync
}))

const mockReadFile = vi.fn()

vi.mock('fs/promises', () => ({
  default: {
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    readFile: mockReadFile,
    open: mockOpen,
    rename: mockRename,
    rm: mockRm,
    stat: mockStat
  },
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  open: mockOpen,
  rename: mockRename,
  rm: mockRm,
  stat: mockStat
}))

const { writeStatus, sessionIdFromPath, writeSessionStatus, removeSession, clearSessions } = await import('./status-writer')

describe('writeStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockExistsSync.mockReturnValue(true)
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockOpen.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) })
    mockRename.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    mockStat.mockRejectedValue(new Error('ENOENT'))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes status directly to status.json', async () => {
    await writeStatus('working', 'Editing file...')

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/status\.json$/),
      expect.stringContaining('"status": "working"')
    )
  })

  it('includes usage when provided', async () => {
    await writeStatus('thinking', 'Thinking...', { context: 1000, output: 50 })

    const written = mockWriteFile.mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.usage).toEqual({ context: 1000, output: 50 })
  })

  it('omits usage when null', async () => {
    await writeStatus('idle', 'Session started!')

    const written = mockWriteFile.mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.usage).toBeUndefined()
  })

  it('creates status directory if it does not exist', async () => {
    mockExistsSync.mockReturnValue(false)

    await writeStatus('idle', 'Ready')

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.agent-paperclip'),
      { recursive: true }
    )
  })

  it('skips mkdir when directory already exists', async () => {
    mockExistsSync.mockReturnValue(true)

    await writeStatus('idle', 'Ready')

    expect(mockMkdir).not.toHaveBeenCalled()
  })

  it('includes timestamp in output', async () => {
    await writeStatus('done', 'All done!')

    const written = mockWriteFile.mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.timestamp).toBeTypeOf('number')
    expect(parsed.timestamp).toBeGreaterThan(0)
  })

  it('serializes writes in call order', async () => {
    let releaseFirst = () => {}
    const firstWritePending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    mockWriteFile.mockImplementationOnce(() => firstWritePending)

    const first = writeStatus('working', 'First write')
    const second = writeStatus('thinking', 'Second write')

    await vi.waitFor(() => {
      expect(mockWriteFile).toHaveBeenCalledTimes(1)
    })
    expect(mockWriteFile.mock.calls[0][1]).toContain('First write')

    releaseFirst()
    await first
    await second

    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    expect(mockWriteFile.mock.calls[1][1]).toContain('Second write')
  })
})

describe('sessionIdFromPath', () => {
  it('returns an 8-char hex string', () => {
    const id = sessionIdFromPath('/some/path')
    expect(id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('returns the same id for the same input', () => {
    expect(sessionIdFromPath('/foo/bar')).toBe(sessionIdFromPath('/foo/bar'))
  })

  it('returns different ids for different inputs', () => {
    expect(sessionIdFromPath('/foo/bar')).not.toBe(sessionIdFromPath('/baz/qux'))
  })
})

describe('writeSessionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockExistsSync.mockReturnValue(true)
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockOpen.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) })
    mockRename.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    mockStat.mockRejectedValue(new Error('ENOENT'))
  })

  it('creates sessions.json with correct structure', async () => {
    await writeSessionStatus('abc123', 'claude-code', 'working', 'Editing index.ts...')

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(mockOpen).toHaveBeenCalledWith(expect.stringMatching(/sessions\.json\.lock$/), 'wx')
    expect(mockRename).toHaveBeenCalledWith(
      expect.stringMatching(/sessions\.json\.\d+\.\d+\.tmp$/),
      expect.stringMatching(/sessions\.json$/)
    )
    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(written.sessions.abc123).toMatchObject({
      sessionId: 'abc123',
      source: 'claude-code',
      status: 'working',
      action: 'Editing index.ts...'
    })
    expect(written.sessions.abc123.timestamp).toBeTypeOf('number')
    expect(written.sessions.abc123.lastActivity).toBeTypeOf('number')
  })

  it('updates existing session without clobbering other sessions', async () => {
    const existing = {
      sessions: {
        other: {
          sessionId: 'other',
          source: 'codex',
          status: 'working',
          action: 'Running...',
          timestamp: 1000,
          lastActivity: 1000
        }
      }
    }
    mockReadFile.mockResolvedValue(JSON.stringify(existing))

    await writeSessionStatus('new1', 'claude-code', 'reading', 'Reading file...')

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(written.sessions.other).toMatchObject({ sessionId: 'other', source: 'codex' })
    expect(written.sessions.new1).toMatchObject({ sessionId: 'new1', source: 'claude-code' })
  })

  it('includes usage when provided', async () => {
    await writeSessionStatus('s1', 'claude-code', 'thinking', 'Thinking...', { context: 2200, output: 100 })

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(written.sessions.s1.usage).toEqual({ context: 2200, output: 100 })
  })

  it.each([
    ['an array', '[]'],
    ['a string', '"hello"'],
    ['sessions as array', '{"sessions": []}'],
    ['sessions as null', '{"sessions": null}'],
    ['a number', '42']
  ])('recovers when sessions.json contains %s', async (_label, content) => {
    mockReadFile.mockResolvedValue(content)

    await writeSessionStatus('s1', 'claude-code', 'idle', 'Ready')

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(written.sessions.s1).toMatchObject({ sessionId: 's1' })
  })

  it('retries until the sessions lock becomes available', async () => {
    vi.useFakeTimers()
    mockOpen
      .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EEXIST' }))
      .mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) })
    mockStat.mockResolvedValue({ mtimeMs: Date.now() })

    const writePromise = writeSessionStatus('s1', 'claude-code', 'idle', 'Ready')
    await vi.advanceTimersByTimeAsync(50)
    await writePromise

    expect(mockOpen).toHaveBeenCalledTimes(2)
  })
})

describe('removeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockExistsSync.mockReturnValue(true)
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockOpen.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) })
    mockRename.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    mockStat.mockRejectedValue(new Error('ENOENT'))
  })

  it('removes only the target session', async () => {
    const existing = {
      sessions: {
        keep: { sessionId: 'keep', source: 'codex', status: 'idle', action: '', timestamp: 1, lastActivity: 1 },
        remove: { sessionId: 'remove', source: 'claude-code', status: 'done', action: '', timestamp: 2, lastActivity: 2 }
      }
    }
    mockReadFile.mockResolvedValue(JSON.stringify(existing))

    await removeSession('remove')

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(written.sessions.keep).toBeDefined()
    expect(written.sessions.remove).toBeUndefined()
  })

  it('is a no-op on missing session', async () => {
    const existing = { sessions: { keep: { sessionId: 'keep' } } }
    mockReadFile.mockResolvedValue(JSON.stringify(existing))

    await removeSession('nonexistent')

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(written.sessions.keep).toBeDefined()
  })
})

describe('clearSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockExistsSync.mockReturnValue(true)
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockOpen.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) })
    mockRename.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    mockStat.mockRejectedValue(new Error('ENOENT'))
  })

  it('writes an empty sessions map', async () => {
    await clearSessions()

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/sessions\.json\.\d+\.\d+\.tmp$/),
      JSON.stringify({ sessions: {} }, null, 2)
    )
    expect(mockRename).toHaveBeenCalledWith(
      expect.stringMatching(/sessions\.json\.\d+\.\d+\.tmp$/),
      expect.stringMatching(/sessions\.json$/)
    )
  })
})
