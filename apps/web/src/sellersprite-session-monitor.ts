import { SELLERSPRITE_SESSION_EXPIRED_EVENT } from '@cookie-amazon/web-sdk'

export type SellerSpriteSessionMonitorOptions = {
  recheck: () => void
  onExpired: () => void
  pollIntervalMs?: number
}

export const startSellerSpriteSessionMonitor = ({
  recheck,
  onExpired,
  pollIntervalMs = 30_000,
}: SellerSpriteSessionMonitorOptions): (() => void) => {
  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') recheck()
  }

  recheck()
  const intervalId = window.setInterval(recheck, pollIntervalMs)
  window.addEventListener('focus', recheck)
  window.addEventListener(SELLERSPRITE_SESSION_EXPIRED_EVENT, onExpired)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    window.clearInterval(intervalId)
    window.removeEventListener('focus', recheck)
    window.removeEventListener(SELLERSPRITE_SESSION_EXPIRED_EVENT, onExpired)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}