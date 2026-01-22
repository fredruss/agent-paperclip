import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClaudeSettings } from '../shared/types'

// Mock fs before importing the module
const mockFs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs
}))

// Import after mocking
const {
  ensureDir,
  copyHookScript,
  createHookConfig,
  readSettings,
  createBackup,
  mergeHooks,
  writeSettings,
  runSetupSync
} = await import('./setup')

describe('ensureDir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    ensureDir('/test/dir')

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/dir', { recursive: true })
  })

  it('does not create directory if it exists', () => {
    mockFs.existsSync.mockReturnValue(true)

    ensureDir('/test/dir')

    expect(mockFs.mkdirSync).not.toHaveBeenCalled()
  })
})

describe('copyHookScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies file from source to destination', () => {
    mockFs.existsSync.mockReturnValue(true)

    copyHookScript('/source/hook.js', '/dest/hook.js')

    expect(mockFs.copyFileSync).toHaveBeenCalledWith('/source/hook.js', '/dest/hook.js')
  })

  it('creates destination directory if needed', () => {
    mockFs.existsSync.mockReturnValue(false)

    copyHookScript('/source/hook.js', '/dest/subdir/hook.js')

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/dest/subdir', { recursive: true })
  })
})

describe('createHookConfig', () => {
  it('creates hook config with correct command format', () => {
    const config = createHookConfig('/path/to/hooks/status-reporter.js')

    expect(config.PreToolUse).toEqual([
      { matcher: '*', hooks: [{ type: 'command', command: 'node "/path/to/hooks/status-reporter.js"' }] }
    ])
    expect(config.PostToolUse).toEqual([
      { matcher: '*', hooks: [{ type: 'command', command: 'node "/path/to/hooks/status-reporter.js"' }] }
    ])
    expect(config.Stop).toEqual([
      { hooks: [{ type: 'command', command: 'node "/path/to/hooks/status-reporter.js"' }] }
    ])
  })

  it('includes all required hook events', () => {
    const config = createHookConfig('/path/to/script.js')

    expect(Object.keys(config)).toContain('UserPromptSubmit')
    expect(Object.keys(config)).toContain('PreToolUse')
    expect(Object.keys(config)).toContain('PostToolUse')
    expect(Object.keys(config)).toContain('Stop')
    expect(Object.keys(config)).toContain('Notification')
  })
})

describe('readSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty object if file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    const result = readSettings('/path/to/settings.json')

    expect(result).toEqual({})
  })

  it('parses and returns settings from file', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'test' }))

    const result = readSettings('/path/to/settings.json')

    expect(result).toEqual({ apiKey: 'test' })
  })

  it('throws on invalid JSON', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('not valid json')

    expect(() => readSettings('/path/to/settings.json')).toThrow()
  })
})

describe('createBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'))
  })

  it('creates backup with timestamp', () => {
    const backupPath = createBackup('/path/to/settings.json')

    expect(mockFs.copyFileSync).toHaveBeenCalledWith(
      '/path/to/settings.json',
      '/path/to/settings.json.backup-1705314600000'
    )
    expect(backupPath).toBe('/path/to/settings.json.backup-1705314600000')
  })
})

describe('mergeHooks', () => {
  it('adds hooks to empty settings', () => {
    const settings: ClaudeSettings = {}
    const newHooks = createHookConfig('/path/to/hook.js')

    const result = mergeHooks(settings, newHooks)

    expect(result.hooks).toBeDefined()
    expect(result.hooks!.PreToolUse).toHaveLength(1)
  })

  it('preserves existing settings', () => {
    const settings: ClaudeSettings = { apiKey: 'secret' }
    const newHooks = createHookConfig('/path/to/hook.js')

    const result = mergeHooks(settings, newHooks)

    expect(result.apiKey).toBe('secret')
  })

  it('preserves existing hooks from other sources', () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other-hook' }] }]
      }
    }
    const newHooks = createHookConfig('/path/to/hook.js')

    const result = mergeHooks(settings, newHooks)

    expect(result.hooks!.PreToolUse).toHaveLength(2)
    expect(result.hooks!.PreToolUse![0].hooks![0].command).toBe('other-hook')
  })

  it('updates existing claude-companion hooks instead of duplicating', () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          { matcher: '*', hooks: [{ type: 'command', command: 'node "/old/claude-companion/hook.js"' }] }
        ]
      }
    }
    const newHooks = createHookConfig('/new/path/to/hook.js')

    const result = mergeHooks(settings, newHooks)

    expect(result.hooks!.PreToolUse).toHaveLength(1)
    expect(result.hooks!.PreToolUse![0].hooks![0].command).toContain('/new/path/to/hook.js')
  })
})

describe('writeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes settings as formatted JSON', () => {
    mockFs.existsSync.mockReturnValue(true)

    writeSettings('/path/to/settings.json', { apiKey: 'test' })

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      '/path/to/settings.json',
      JSON.stringify({ apiKey: 'test' }, null, 2)
    )
  })

  it('creates directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    writeSettings('/path/to/settings.json', {})

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true })
  })
})

describe('runSetupSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error if hook source does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    const result = runSetupSync({
      hookSourcePath: '/nonexistent/hook.js',
      hookDestPath: '/dest/hook.js',
      settingsPath: '/path/to/settings.json'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Hook source not found')
  })

  it('copies hook and creates settings when no existing settings', () => {
    mockFs.existsSync.mockImplementation((path: string) => {
      if (path === '/source/hook.js') return true
      return false
    })

    const result = runSetupSync({
      hookSourcePath: '/source/hook.js',
      hookDestPath: '/dest/hook.js',
      settingsPath: '/path/to/settings.json'
    })

    expect(result.success).toBe(true)
    expect(result.hookPath).toBe('/dest/hook.js')
    expect(result.backupPath).toBeUndefined()
    expect(mockFs.copyFileSync).toHaveBeenCalled()
    expect(mockFs.writeFileSync).toHaveBeenCalled()
  })

  it('creates backup when settings exist', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'))

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ existing: true }))

    const result = runSetupSync({
      hookSourcePath: '/source/hook.js',
      hookDestPath: '/dest/hook.js',
      settingsPath: '/path/to/settings.json'
    })

    expect(result.success).toBe(true)
    expect(result.backupPath).toBe('/path/to/settings.json.backup-1705314600000')
  })

  it('continues with empty settings when JSON parse fails', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('invalid json {{{')

    const result = runSetupSync({
      hookSourcePath: '/source/hook.js',
      hookDestPath: '/dest/hook.js',
      settingsPath: '/path/to/settings.json'
    })

    expect(result.success).toBe(true)
    // Should still write settings with our hooks
    expect(mockFs.writeFileSync).toHaveBeenCalled()
    const writtenContent = mockFs.writeFileSync.mock.calls[0][1]
    expect(writtenContent).toContain('"hooks"')
  })
})
