import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock child_process before importing the module
const mockExecSync = vi.fn()
const mockSpawn = vi.fn(() => ({ unref: vi.fn() }))

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawn: mockSpawn
}))

// Mock electron to avoid import errors
vi.mock('electron', () => '/path/to/electron')

describe('stopAppWindows', () => {
  let originalPlatform: PropertyDescriptor | undefined
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock process.platform as 'win32'
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    consoleSpy.mockRestore()
  })

  it('stops running processes and logs success', async () => {
    // First call: PowerShell finds PIDs
    // Second call: taskkill (succeeds)
    mockExecSync
      .mockReturnValueOnce('12345\r\n67890')
      .mockReturnValue(undefined)

    const { stopAppWindows } = await import('./agent-paperclip')
    stopAppWindows()

    // Verify PowerShell command was called with correct pattern
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('Get-CimInstance Win32_Process'),
      expect.any(Object)
    )
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("electron.exe"),
      expect.any(Object)
    )

    // Verify taskkill was called for each PID
    expect(mockExecSync).toHaveBeenCalledWith('taskkill /F /PID 12345', { stdio: 'ignore' })
    expect(mockExecSync).toHaveBeenCalledWith('taskkill /F /PID 67890', { stdio: 'ignore' })

    // Verify success message
    expect(consoleSpy).toHaveBeenCalledWith('Agent Paperclip stopped.')
  })

  it('reports not running when no processes found (empty output)', async () => {
    mockExecSync.mockReturnValueOnce('')

    const { stopAppWindows } = await import('./agent-paperclip')
    stopAppWindows()

    expect(consoleSpy).toHaveBeenCalledWith('Agent Paperclip is not running.')
  })

  it('reports not running when PowerShell throws error', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('PowerShell error')
    })

    const { stopAppWindows } = await import('./agent-paperclip')
    stopAppWindows()

    expect(consoleSpy).toHaveBeenCalledWith('Agent Paperclip is not running.')
  })

  it('uses correct PowerShell command with Get-CimInstance and pattern matching', async () => {
    mockExecSync.mockReturnValueOnce('')

    const { stopAppWindows } = await import('./agent-paperclip')
    stopAppWindows()

    const call = mockExecSync.mock.calls[0]
    expect(call[0]).toContain('powershell -NoProfile -Command')
    expect(call[0]).toContain('Get-CimInstance Win32_Process')
    expect(call[0]).toContain("$_.Name -eq 'electron.exe'")
    expect(call[0]).toContain("$_.CommandLine -like '*agent-paperclip*out*main*index.js*'")
    expect(call[0]).toContain('Select-Object -ExpandProperty ProcessId')
  })

  it('continues killing processes even if one taskkill fails', async () => {
    mockExecSync
      .mockReturnValueOnce('111\r\n222\r\n333')
      .mockImplementationOnce(() => { throw new Error('Process not found') }) // First taskkill fails
      .mockReturnValueOnce(undefined) // Second taskkill succeeds
      .mockReturnValueOnce(undefined) // Third taskkill succeeds

    const { stopAppWindows } = await import('./agent-paperclip')
    stopAppWindows()

    // All taskkill calls should be attempted
    expect(mockExecSync).toHaveBeenCalledWith('taskkill /F /PID 111', { stdio: 'ignore' })
    expect(mockExecSync).toHaveBeenCalledWith('taskkill /F /PID 222', { stdio: 'ignore' })
    expect(mockExecSync).toHaveBeenCalledWith('taskkill /F /PID 333', { stdio: 'ignore' })

    // Should still report success
    expect(consoleSpy).toHaveBeenCalledWith('Agent Paperclip stopped.')
  })
})

describe('stopAppUnix', () => {
  let originalPlatform: PropertyDescriptor | undefined
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock process.platform as 'darwin'
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    consoleSpy.mockRestore()
  })

  it('stops running processes with pkill and logs success', async () => {
    mockExecSync.mockReturnValue(undefined)

    const { stopAppUnix } = await import('./agent-paperclip')
    stopAppUnix()

    expect(mockExecSync).toHaveBeenCalledWith(
      'pkill -f "agent-paperclip/out/main"',
      { stdio: 'ignore' }
    )
    expect(consoleSpy).toHaveBeenCalledWith('Agent Paperclip stopped.')
  })

  it('reports not running when pkill fails (no matching processes)', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('pkill: no process found')
    })

    const { stopAppUnix } = await import('./agent-paperclip')
    stopAppUnix()

    expect(consoleSpy).toHaveBeenCalledWith('Agent Paperclip is not running.')
  })

  it('uses correct pkill pattern', async () => {
    mockExecSync.mockReturnValue(undefined)

    const { stopAppUnix } = await import('./agent-paperclip')
    stopAppUnix()

    const call = mockExecSync.mock.calls[0]
    expect(call[0]).toBe('pkill -f "agent-paperclip/out/main"')
    expect(call[1]).toEqual({ stdio: 'ignore' })
  })
})

describe('stopApp', () => {
  let originalPlatform: PropertyDescriptor | undefined
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    consoleSpy.mockRestore()
  })

  it('calls Windows implementation on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    mockExecSync.mockReturnValueOnce('12345').mockReturnValue(undefined)

    const { stopApp } = await import('./agent-paperclip')
    stopApp()

    // Verify PowerShell command (Windows path)
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('powershell'),
      expect.any(Object)
    )
  })

  it('calls Unix implementation on darwin', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    mockExecSync.mockReturnValue(undefined)

    const { stopApp } = await import('./agent-paperclip')
    stopApp()

    // Verify pkill command (Unix path)
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('pkill'),
      expect.any(Object)
    )
  })

  it('calls Unix implementation on linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    mockExecSync.mockReturnValue(undefined)

    const { stopApp } = await import('./agent-paperclip')
    stopApp()

    // Verify pkill command (Unix path)
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('pkill'),
      expect.any(Object)
    )
  })
})
