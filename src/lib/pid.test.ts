// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockWriteFileSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockExistsSync = vi.fn()

vi.mock('fs', () => ({
  default: {
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
    existsSync: mockExistsSync
  },
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
  existsSync: mockExistsSync
}))

const { writePid, readPid, isProcessRunning, removePid } = await import('./pid')

describe('writePid', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.clearAllMocks() })

  it('writes PID to file', () => {
    writePid('/tmp/test.pid', 12345)
    expect(mockWriteFileSync).toHaveBeenCalledWith('/tmp/test.pid', '12345')
  })
})

describe('readPid', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.clearAllMocks() })

  it('returns PID from file', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('12345\n')
    expect(readPid('/tmp/test.pid')).toBe(12345)
  })

  it('returns null when file does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    expect(readPid('/tmp/test.pid')).toBeNull()
  })

  it('returns null for non-numeric content', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('not-a-number')
    expect(readPid('/tmp/test.pid')).toBeNull()
  })

  it('returns null for partially numeric content like 123abc', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('123abc')
    expect(readPid('/tmp/test.pid')).toBeNull()
  })

  it('returns null when read throws', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES') })
    expect(readPid('/tmp/test.pid')).toBeNull()
  })
})

describe('isProcessRunning', () => {
  it('returns true when process exists', () => {
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
    expect(isProcessRunning(12345)).toBe(true)
    expect(killSpy).toHaveBeenCalledWith(12345, 0)
    killSpy.mockRestore()
  })

  it('returns false when process does not exist', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH')
    })
    expect(isProcessRunning(99999)).toBe(false)
    killSpy.mockRestore()
  })
})

describe('removePid', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.clearAllMocks() })

  it('removes PID file', () => {
    removePid('/tmp/test.pid')
    expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/test.pid')
  })

  it('ignores errors when file does not exist', () => {
    mockUnlinkSync.mockImplementation(() => { throw new Error('ENOENT') })
    expect(() => removePid('/tmp/test.pid')).not.toThrow()
  })
})
