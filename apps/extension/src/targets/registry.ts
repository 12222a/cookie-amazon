import { createTargetAdapter, type TargetAdapter } from './adapter'
import { SELLERSPRITE_ADAPTER } from './sellersprite'

export type TargetConfigOverride = { enabled?: boolean }
export type TargetStatus = 'unknown' | 'disabled' | 'permission-required' | 'ready'

export type TargetDescriptor = {
  targetId: string
  displayName: string
  origin: TargetAdapter['origin']
  enabled: boolean
}

export class TargetRegistry {
  private readonly adapters: ReadonlyMap<string, TargetAdapter>

  public constructor(adapters: readonly TargetAdapter[]) {
    const entries = adapters.map((adapter) => [adapter.targetId, adapter] as const)
    if (new Set(entries.map(([targetId]) => targetId)).size !== entries.length) {
      throw new Error('DUPLICATE_TARGET_ID')
    }
    this.adapters = new Map(entries)
  }

  public get(targetId: string): TargetAdapter | undefined {
    return this.adapters.get(targetId)
  }

  public list(overrides: Readonly<Record<string, TargetConfigOverride>> = {}): TargetDescriptor[] {
    return [...this.adapters.values()].map((adapter) => {
      const enabled = overrides[adapter.targetId]?.enabled ?? adapter.enabled
      return {
        targetId: adapter.targetId,
        displayName: adapter.displayName,
        origin: adapter.origin,
        enabled,
      }
    })
  }

  public status(targetId: string, hasPermission: boolean, overrides: Readonly<Record<string, TargetConfigOverride>> = {}): TargetStatus {
    const adapter = this.get(targetId)
    if (!adapter) return 'unknown'
    if (!(overrides[targetId]?.enabled ?? adapter.enabled)) return 'disabled'
    return hasPermission ? 'ready' : 'permission-required'
  }

  public isEnabled(targetId: string, overrides: Readonly<Record<string, TargetConfigOverride>> = {}): boolean {
    const adapter = this.get(targetId)
    return adapter !== undefined && (overrides[targetId]?.enabled ?? adapter.enabled)
  }
}

export const TARGET_REGISTRY = new TargetRegistry([
  createTargetAdapter({
    targetId: 'example',
    displayName: 'Example Target',
    origin: 'https://example.com',
  }),
  SELLERSPRITE_ADAPTER,
])