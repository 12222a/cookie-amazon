import { afterEach, describe, expect, it, vi } from 'vitest'
import { SELLERSPRITE_SESSION_EXPIRED_EVENT } from '@cookie-amazon/web-sdk'
import { startSellerSpriteSessionMonitor } from './sellersprite-session-monitor'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SellerSprite session monitor', () => {
  it('rechecks on initialization, focus, visible restoration and polling, then cleans up', () => {
    let poll: (() => void) | undefined
    const setIntervalMock = vi.fn((callback: TimerHandler) => {
      poll = callback as () => void
      return 7
    })
    const clearIntervalMock = vi.fn()
    const fakeWindow = new EventTarget() as EventTarget & Pick<Window, 'setInterval' | 'clearInterval'>
    fakeWindow.setInterval = setIntervalMock as Window['setInterval']
    fakeWindow.clearInterval = clearIntervalMock as Window['clearInterval']
    const fakeDocument = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState }
    fakeDocument.visibilityState = 'visible'
    vi.stubGlobal('window', fakeWindow)
    vi.stubGlobal('document', fakeDocument)

    const recheck = vi.fn()
    const onExpired = vi.fn()
    const stop = startSellerSpriteSessionMonitor({ recheck, onExpired, pollIntervalMs: 30_000 })
    expect(recheck).toHaveBeenCalledTimes(1)
    expect(setIntervalMock).toHaveBeenCalledWith(recheck, 30_000)

    fakeWindow.dispatchEvent(new Event('focus'))
    expect(recheck).toHaveBeenCalledTimes(2)

    fakeDocument.visibilityState = 'hidden'
    fakeDocument.dispatchEvent(new Event('visibilitychange'))
    expect(recheck).toHaveBeenCalledTimes(2)
    fakeDocument.visibilityState = 'visible'
    fakeDocument.dispatchEvent(new Event('visibilitychange'))
    expect(recheck).toHaveBeenCalledTimes(3)

    poll?.()
    expect(recheck).toHaveBeenCalledTimes(4)
    fakeWindow.dispatchEvent(new Event(SELLERSPRITE_SESSION_EXPIRED_EVENT))
    expect(onExpired).toHaveBeenCalledTimes(1)

    stop()
    expect(clearIntervalMock).toHaveBeenCalledWith(7)
    fakeWindow.dispatchEvent(new Event('focus'))
    fakeDocument.dispatchEvent(new Event('visibilitychange'))
    fakeWindow.dispatchEvent(new Event(SELLERSPRITE_SESSION_EXPIRED_EVENT))
    expect(recheck).toHaveBeenCalledTimes(4)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })
})