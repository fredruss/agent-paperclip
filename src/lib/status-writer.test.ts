// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockWriteFile = vi.fn()
const mockMkdir = vi.fn()

vi.mock('fs', () => ({
  default: { existsSync: mockExistsSync },
  existsSync: mockExistsSync
}))

vi.mock('fs/promises', () => ({
  default: { writeFile: mockWriteFile, mkdir: mockMkdir },
  writeFile: mockWriteFile,
  mkdir: mockMkdir
}))

const { writeStatus } = await import('./status-writer')

describe('writeStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
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
