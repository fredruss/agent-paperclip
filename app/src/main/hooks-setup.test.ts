// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fs and fs/promises before any imports that might use them
const mockExistsSync = vi.fn()
const mockWriteFile = vi.fn()
const mockMkdir = vi.fn()
const mockReadFile = vi.fn()
const mockCopyFile = vi.fn()

vi.mock('fs', () => ({
  default: { existsSync: mockExistsSync },
  existsSync: mockExistsSync
}))

vi.mock('fs/promises', () => ({
  default: {
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    readFile: mockReadFile,
    copyFile: mockCopyFile
  },
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  copyFile: mockCopyFile
}))

// Now import the module under test
const { isHookConfigured, setupHooks, createHookConfig, COMPANION_HOOKS_DIR, CLAUDE_SETTINGS_FILE, STATUS_DIR } =
  await import('./hooks-setup')

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

describe('isHookConfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when hook script file does not exist', async () => {
    // Hook script doesn't exist
    mockExistsSync.mockReturnValue(false)

    const result = await isHookConfigured()

    expect(result).toBe(false)
    // Should check for hook script file existence first
    expect(mockExistsSync).toHaveBeenCalled()
    // Should NOT try to read settings if file doesn't exist
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('returns false when settings file cannot be read', async () => {
    // Hook script exists
    mockExistsSync.mockReturnValue(true)
    // Settings file read fails
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const result = await isHookConfigured()

    expect(result).toBe(false)
  })

  it('returns false when settings has invalid JSON', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue('not valid json')

    const result = await isHookConfigured()

    expect(result).toBe(false)
  })

  it('returns false when settings has no hooks section', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(JSON.stringify({ someOtherSetting: true }))

    const result = await isHookConfigured()

    expect(result).toBe(false)
  })

  it('returns false when hooks do not reference claude-companion', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'some-other-hook' }] }]
        }
      })
    )

    const result = await isHookConfigured()

    expect(result).toBe(false)
  })

  it('returns true when hook script exists AND settings reference claude-companion', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: '*',
              hooks: [{ type: 'command', command: 'node "/home/user/.claude-companion/hooks/status-reporter.js"' }]
            }
          ]
        }
      })
    )

    const result = await isHookConfigured()

    expect(result).toBe(true)
  })
})

describe('setupHooks', () => {
  const mockGetHookSourcePath = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockCopyFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('skips setup when hooks are already configured', async () => {
    // Hook script exists
    mockExistsSync.mockReturnValue(true)
    // Settings contain claude-companion
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ command: 'node "/path/claude-companion/hooks/script.js"' }] }]
        }
      })
    )

    await setupHooks({ getHookSourcePath: mockGetHookSourcePath })

    // Should not copy files or write settings
    expect(mockCopyFile).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('creates backup BEFORE attempting to parse settings', async () => {
    const callOrder: string[] = []

    // Hook script doesn't exist (triggers setup)
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes('status-reporter.js') && path.includes(COMPANION_HOOKS_DIR)) {
        return false // Hook script doesn't exist
      }
      if (path.includes(CLAUDE_SETTINGS_FILE)) {
        return true // Settings file exists
      }
      return true // Source hook exists
    })

    mockGetHookSourcePath.mockReturnValue('/source/hooks/status-reporter.js')

    // Track call order
    mockCopyFile.mockImplementation(async (src: string, dest: string) => {
      if (dest.includes('.backup-')) {
        callOrder.push('backup')
      } else {
        callOrder.push('copy-hook')
      }
    })

    mockReadFile.mockImplementation(async () => {
      callOrder.push('read-settings')
      return JSON.stringify({ existingSetting: true })
    })

    mockWriteFile.mockImplementation(async () => {
      callOrder.push('write-settings')
    })

    await setupHooks({ getHookSourcePath: mockGetHookSourcePath })

    // Backup should happen BEFORE read (which triggers parse)
    const backupIndex = callOrder.indexOf('backup')
    const readIndex = callOrder.indexOf('read-settings')

    expect(backupIndex).toBeGreaterThan(-1)
    expect(readIndex).toBeGreaterThan(-1)
    expect(backupIndex).toBeLessThan(readIndex)
  })

  it('continues with empty settings when JSON parse fails (backup already saved)', async () => {
    // Hook script doesn't exist (triggers setup)
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes('status-reporter.js') && path.includes(COMPANION_HOOKS_DIR)) {
        return false
      }
      return true
    })

    mockGetHookSourcePath.mockReturnValue('/source/hooks/status-reporter.js')

    // Return invalid JSON
    mockReadFile.mockResolvedValue('{ invalid json }}}')

    await setupHooks({ getHookSourcePath: mockGetHookSourcePath })

    // Should still write settings (with our hooks added to empty object)
    expect(mockWriteFile).toHaveBeenCalledWith(
      CLAUDE_SETTINGS_FILE,
      expect.stringContaining('"hooks"')
    )
  })

  it('merges hooks with existing settings without losing other config', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes('status-reporter.js') && path.includes(COMPANION_HOOKS_DIR)) {
        return false
      }
      return true
    })

    mockGetHookSourcePath.mockReturnValue('/source/hooks/status-reporter.js')

    // Existing settings with other hooks and config
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        apiKey: 'secret',
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other-hook' }] }]
        }
      })
    )

    await setupHooks({ getHookSourcePath: mockGetHookSourcePath })

    // Verify the written settings
    const writeCall = mockWriteFile.mock.calls.find((call) => call[0] === CLAUDE_SETTINGS_FILE)
    expect(writeCall).toBeDefined()

    const writtenSettings = JSON.parse(writeCall![1] as string)

    // Should preserve existing config
    expect(writtenSettings.apiKey).toBe('secret')

    // Should preserve existing hooks and add ours
    expect(writtenSettings.hooks.PreToolUse).toHaveLength(2)
    expect(writtenSettings.hooks.PreToolUse[0].hooks[0].command).toBe('other-hook')
    expect(writtenSettings.hooks.PreToolUse[1].hooks[0].command).toContain('agent-paperclip')
  })

  it('throws error when hook source file does not exist', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes('status-reporter.js')) {
        return false // Neither source nor dest exists
      }
      return true
    })

    mockGetHookSourcePath.mockReturnValue('/nonexistent/source/status-reporter.js')

    // Should not throw, but should not write settings either
    await setupHooks({ getHookSourcePath: mockGetHookSourcePath })

    // Should not have written settings since source was missing
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('copies lib/status-writer.js alongside the hook script', async () => {
    const { join } = await import('path')

    mockExistsSync.mockImplementation((path: string) => {
      // Hook script not installed yet (triggers setup)
      if (path.includes('status-reporter.js') && path.includes(COMPANION_HOOKS_DIR)) {
        return false
      }
      // Source hook file exists
      if (path === '/source/hooks/status-reporter.js') {
        return true
      }
      // Lib source file exists
      if (path.includes('lib/status-writer.js')) {
        return true
      }
      return false
    })

    mockGetHookSourcePath.mockReturnValue('/source/hooks/status-reporter.js')
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await setupHooks({ getHookSourcePath: mockGetHookSourcePath })

    // Should copy lib/status-writer.js
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining('lib/status-writer.js'),
      join(STATUS_DIR, 'lib', 'status-writer.js')
    )

    // Should create the lib directory
    expect(mockMkdir).toHaveBeenCalledWith(
      join(STATUS_DIR, 'lib'),
      { recursive: true }
    )
  })
})
