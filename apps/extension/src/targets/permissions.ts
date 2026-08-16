import type { TargetAdapter } from './adapter'
import { TargetRegistry, type TargetStatus } from './registry'

export type PermissionApi = {
  contains(permission: { origins?: readonly string[] }): Promise<boolean>
  request(permission: { origins?: readonly string[] }): Promise<boolean>
  remove(permission: { origins?: readonly string[] }): Promise<boolean>
}

const permissionRequest = (adapter: TargetAdapter): { origins: readonly string[] } => ({
  origins: adapter.permissionOrigins,
})

export class TargetPermissionManager {
  public constructor(
    private readonly registry: TargetRegistry,
    private readonly permissions: PermissionApi,
  ) {}

  public async hasPermission(targetId: string): Promise<boolean> {
    const adapter = this.registry.get(targetId)
    if (!adapter || !this.registry.isEnabled(targetId)) return false
    return this.permissions.contains(permissionRequest(adapter))
  }

  public async requestPermission(targetId: string): Promise<boolean> {
    const adapter = this.registry.get(targetId)
    if (!adapter || !this.registry.isEnabled(targetId)) return false
    return this.permissions.request(permissionRequest(adapter))
  }

  public async removePermission(targetId: string): Promise<boolean> {
    const adapter = this.registry.get(targetId)
    if (!adapter) return false
    return this.permissions.remove(permissionRequest(adapter))
  }

  public async getStatus(targetId: string): Promise<TargetStatus> {
    return this.registry.status(targetId, await this.hasPermission(targetId))
  }
}