// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'

const mockSpawn = vi.fn()
const mockExistsSync = vi.fn()
const mockGetAppPath = vi.fn()
const mockApp = {
  isPackaged: false,
  getAppPath: mockGetAppPath
}

vi.mock('child_process', () => ({
  spawn: mockSpawn
}))

vi.mock('fs', () => ({
  existsSync: mockExistsSync
}))

vi.mock('electron', () => ({
  app: mockApp
}))

type MockChildProcess = ChildProcess & {
  kill: ReturnType<typeof vi.fn>
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.exitCode = null
  child.killed = false
  child.kill = vi.fn((signal?: NodeJS.Signals): boolean => {
    child.killed = true
    child.exitCode = 0
    child.emit('exit', 0, signal ?? null)
    return true
  })
  return child
}

function mockExists({
  codexHome,
  watcherScript
}: {
  codexHome: boolean
  watcherScript: boolean
}): void {
  mockExistsSync.mockImplementation((filePath: string) => {
    const normalized = normalizePath(filePath)
    if (normalized.endsWith('/.codex')) return codexHome
    if (normalized.endsWith('/codex/watcher.js')) return watcherScript
    return false
  })
}

const originalNodeEnv = process.env.NODE_ENV

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  process.env.NODE_ENV = 'development'
  mockApp.isPackaged = false
  mockGetAppPath.mockReturnValue('/repo/app')
  mockExists({ codexHome: true, watcherScript: true })
})

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
})

describe('startDevCodexWatcher', () => {
  it('does not spawn outside development mode', async () => {
    process.env.NODE_ENV = 'production'
    const { startDevCodexWatcher } = await import('./codex-watcher')

    startDevCodexWatcher()

    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('does not spawn in packaged mode', async () => {
    mockApp.isPackaged = true
    const { startDevCodexWatcher } = await import('./codex-watcher')

    startDevCodexWatcher()

    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('does not spawn when ~/.codex is missing', async () => {
    mockExists({ codexHome: false, watcherScript: true })
    const { startDevCodexWatcher } = await import('./codex-watcher')

    startDevCodexWatcher()

    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('does not spawn when watcher script is missing', async () => {
    mockExists({ codexHome: true, watcherScript: false })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { startDevCodexWatcher } = await import('./codex-watcher')

    startDevCodexWatcher()

    expect(mockSpawn).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Codex watcher script not found'))
    warnSpy.mockRestore()
  })

  it('spawns only once while the watcher process is active', async () => {
    const child = createMockChildProcess()
    mockSpawn.mockReturnValue(child)
    const { startDevCodexWatcher } = await import('./codex-watcher')

    startDevCodexWatcher()
    startDevCodexWatcher()

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/[\\/]codex[\\/]watcher\.js$/)],
      { stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
    )
  })
})

describe('stopDevCodexWatcher', () => {
  it('kills the tracked watcher and allows restart', async () => {
    const child = createMockChildProcess()
    mockSpawn.mockReturnValue(child)
    const { startDevCodexWatcher, stopDevCodexWatcher } = await import('./codex-watcher')

    startDevCodexWatcher()
    stopDevCodexWatcher()
    startDevCodexWatcher()

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })
})
