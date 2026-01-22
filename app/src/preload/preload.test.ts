import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron before importing the preload module
const mockInvoke = vi.fn()
const mockSend = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()
const mockExposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld
  },
  ipcRenderer: {
    invoke: mockInvoke,
    send: mockSend,
    on: mockOn,
    removeListener: mockRemoveListener
  }
}))

describe('preload', () => {
  let exposedAPI: Record<string, unknown>

  beforeEach(async () => {
    // Reset all mocks before each test
    vi.resetAllMocks()

    // Capture what gets exposed to the main world
    mockExposeInMainWorld.mockImplementation((_name, api) => {
      exposedAPI = api
    })

    // Reset module cache and re-import to trigger exposeInMainWorld
    vi.resetModules()
    await import('./index')
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('exposes electronAPI to main world', () => {
    expect(mockExposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object))
  })

  it('exposes all required methods', () => {
    expect(exposedAPI).toHaveProperty('getStatus')
    expect(exposedAPI).toHaveProperty('onStatusUpdate')
    expect(exposedAPI).toHaveProperty('startDrag')
    expect(exposedAPI).toHaveProperty('getActivePack')
    expect(exposedAPI).toHaveProperty('showPackMenu')
    expect(exposedAPI).toHaveProperty('onPackChanged')
  })

  describe('getStatus', () => {
    it('invokes get-status IPC channel', async () => {
      const mockStatus = { status: 'idle', action: 'Waiting...', timestamp: Date.now() }
      mockInvoke.mockResolvedValue(mockStatus)

      const getStatus = exposedAPI.getStatus as () => Promise<unknown>
      const result = await getStatus()

      expect(mockInvoke).toHaveBeenCalledWith('get-status')
      expect(result).toEqual(mockStatus)
    })
  })

  describe('onStatusUpdate', () => {
    it('registers listener on status-update channel', () => {
      const callback = vi.fn()
      const onStatusUpdate = exposedAPI.onStatusUpdate as (cb: (status: unknown) => void) => () => void

      onStatusUpdate(callback)

      expect(mockOn).toHaveBeenCalledWith('status-update', expect.any(Function))
    })

    it('returns working unsubscribe function', () => {
      const callback = vi.fn()
      const onStatusUpdate = exposedAPI.onStatusUpdate as (cb: (status: unknown) => void) => () => void

      const unsubscribe = onStatusUpdate(callback)

      expect(typeof unsubscribe).toBe('function')

      unsubscribe()

      expect(mockRemoveListener).toHaveBeenCalledWith('status-update', expect.any(Function))
    })

    it('calls callback with status when event fires', () => {
      const callback = vi.fn()
      const onStatusUpdate = exposedAPI.onStatusUpdate as (cb: (status: unknown) => void) => () => void

      onStatusUpdate(callback)

      // Get the handler that was registered
      const registeredHandler = mockOn.mock.calls[0][1]
      const mockStatus = { status: 'working', action: 'Working...', timestamp: Date.now() }

      // Simulate the event firing
      registeredHandler({}, mockStatus)

      expect(callback).toHaveBeenCalledWith(mockStatus)
    })
  })

  describe('startDrag', () => {
    it('sends start-drag IPC message', () => {
      const startDrag = exposedAPI.startDrag as () => void

      startDrag()

      expect(mockSend).toHaveBeenCalledWith('start-drag')
    })
  })

  describe('getActivePack', () => {
    it('invokes get-active-pack IPC channel', async () => {
      mockInvoke.mockResolvedValue('default')

      const getActivePack = exposedAPI.getActivePack as () => Promise<string>
      const result = await getActivePack()

      expect(mockInvoke).toHaveBeenCalledWith('get-active-pack')
      expect(result).toBe('default')
    })
  })

  describe('showPackMenu', () => {
    it('sends show-pack-menu IPC message', () => {
      const showPackMenu = exposedAPI.showPackMenu as () => void

      showPackMenu()

      expect(mockSend).toHaveBeenCalledWith('show-pack-menu')
    })
  })

  describe('onPackChanged', () => {
    it('registers listener on pack-changed channel', () => {
      const callback = vi.fn()
      const onPackChanged = exposedAPI.onPackChanged as (cb: (packId: string) => void) => () => void

      onPackChanged(callback)

      expect(mockOn).toHaveBeenCalledWith('pack-changed', expect.any(Function))
    })

    it('returns working unsubscribe function', () => {
      const callback = vi.fn()
      const onPackChanged = exposedAPI.onPackChanged as (cb: (packId: string) => void) => () => void

      const unsubscribe = onPackChanged(callback)

      expect(typeof unsubscribe).toBe('function')

      unsubscribe()

      expect(mockRemoveListener).toHaveBeenCalledWith('pack-changed', expect.any(Function))
    })

    it('calls callback with packId when event fires', () => {
      const callback = vi.fn()
      const onPackChanged = exposedAPI.onPackChanged as (cb: (packId: string) => void) => () => void

      onPackChanged(callback)

      // Get the handler that was registered
      const registeredHandler = mockOn.mock.calls[0][1]

      // Simulate the event firing
      registeredHandler({}, 'new-pack-id')

      expect(callback).toHaveBeenCalledWith('new-pack-id')
    })
  })
})
