import type { StorageArea } from '../remote-config'
import type { OverlayPosition } from './overlay-state'

export const OVERLAY_PREFERENCE_STORAGE_KEY = 'overlay-preference:v1'

export type OverlayPreference = {
  collapsed: boolean
  position: OverlayPosition | null
}

export const DEFAULT_OVERLAY_PREFERENCE: OverlayPreference = Object.freeze({ collapsed: true, position: null })

const readPosition = (value: unknown): OverlayPosition | null => {
  if (typeof value !== 'object' || value === null) return null
  const { x, y } = value as { x?: unknown; y?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/**
 * 浮层的用户偏好：是否收起、拖到哪里。
 *
 * 与当前分析对象分开存放——对象是按 ASIN 变的，偏好是用户的选择，
 * 切换选中对象不应该把浮层的位置重置回默认值。
 *
 * 这里是 collapsed 的唯一归一化处：存储里的东西可能是旧版本、缺字段或被改过，
 * 一律在这里收敛成布尔，调用方不必再判断。
 */
export class OverlayPreferenceStore {
  public constructor(private readonly storage: StorageArea) {}

  public async read(): Promise<OverlayPreference> {
    try {
      const stored = (await this.storage.get(OVERLAY_PREFERENCE_STORAGE_KEY))[OVERLAY_PREFERENCE_STORAGE_KEY]
      if (typeof stored !== 'object' || stored === null) return { ...DEFAULT_OVERLAY_PREFERENCE }
      const { collapsed, position } = stored as { collapsed?: unknown; position?: unknown }
      return {
        // 没存过、或存了不可信的值，一律当作已收起。
        collapsed: collapsed !== false,
        position: readPosition(position),
      }
    } catch {
      return { ...DEFAULT_OVERLAY_PREFERENCE }
    }
  }

  public async write(preference: OverlayPreference): Promise<boolean> {
    try {
      await this.storage.set({ [OVERLAY_PREFERENCE_STORAGE_KEY]: preference })
      return true
    } catch {
      return false
    }
  }
}
