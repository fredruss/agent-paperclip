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
    expect(exposedAPI).toHaveProperty('dragStart')
    expect(exposedAPI).toHaveProperty('dragMove')
    expect(exposedAPI).toHaveProperty('dragEnd')
    expect(exposedAPI).toHaveProperty('getActivePack')
    expect(exposedAPI).toHaveProperty('showPackMenu')
    expect(exposedAPI).toHaveProperty('onPackChanged')
    expect(exposedAPI).toHaveProperty('getSoundEnabled')
    expect(exposedAPI).toHaveProperty('onSoundChanged')
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

  describe('drag methods', () => {
    it('dragStart sends drag-start IPC message with coordinates', () => {
      const dragStart = exposedAPI.dragStart as (x: number, y: number) => void

      dragStart(100, 200)

      expect(mockSend).toHaveBeenCalledWith('drag-start', { x: 100, y: 200 })
    })

    it('dragMove sends drag-move IPC message with coordinates', () => {
      const dragMove = exposedAPI.dragMove as (x: number, y: number) => void

      dragMove(150, 250)

      expect(mockSend).toHaveBeenCalledWith('drag-move', { x: 150, y: 250 })
    })

    it('dragEnd sends drag-end IPC message', () => {
      const dragEnd = exposedAPI.dragEnd as () => void

      dragEnd()

      expect(mockSend).toHaveBeenCalledWith('drag-end')
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

  describe('getSoundEnabled', () => {
    it('invokes get-sound-enabled IPC channel', async () => {
      mockInvoke.mockResolvedValue(true)

      const getSoundEnabled = exposedAPI.getSoundEnabled as () => Promise<boolean>
      const result = await getSoundEnabled()

      expect(mockInvoke).toHaveBeenCalledWith('get-sound-enabled')
      expect(result).toBe(true)
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

  describe('onSoundChanged', () => {
    it('registers listener on sound-changed channel', () => {
      const callback = vi.fn()
      const onSoundChanged = exposedAPI.onSoundChanged as (cb: (enabled: boolean) => void) => () => void

      onSoundChanged(callback)

      expect(mockOn).toHaveBeenCalledWith('sound-changed', expect.any(Function))
    })

    it('returns working unsubscribe function', () => {
      const callback = vi.fn()
      const onSoundChanged = exposedAPI.onSoundChanged as (cb: (enabled: boolean) => void) => () => void

      const unsubscribe = onSoundChanged(callback)

      expect(typeof unsubscribe).toBe('function')

      unsubscribe()

      expect(mockRemoveListener).toHaveBeenCalledWith('sound-changed', expect.any(Function))
    })

    it('calls callback with enabled state when event fires', () => {
      const callback = vi.fn()
      const onSoundChanged = exposedAPI.onSoundChanged as (cb: (enabled: boolean) => void) => () => void

      onSoundChanged(callback)

      const registeredHandler = mockOn.mock.calls[0][1]
      registeredHandler({}, false)

      expect(callback).toHaveBeenCalledWith(false)
    })
  })
})
