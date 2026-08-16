import { describe, expect, it } from 'vitest'
import { createTargetAdapter, isTrustedPermissionOrigin, isTrustedTargetOrigin } from '../adapter'
import { TargetPermissionManager } from '../permissions'
import { TargetRegistry } from '../registry'

const createFixture = () => {
  const registry = new TargetRegistry([
    createTargetAdapter({ targetId: 'targetA', displayName: 'Target A', origin: 'https://target.example' }),
    createTargetAdapter({ targetId: 'disabled', displayName: 'Disabled', origin: 'https://disabled.example', enabled: false }),
  ])
  const calls: string[] = []
  let granted = false
  const manager = new TargetPermissionManager(registry, {
    async contains({ origins }) { calls.push(`contains:${origins?.join(',')}`); return granted },
    async request({ origins }) { calls.push(`request:${origins?.join(',')}`); granted = true; return true },
    async remove({ origins }) { calls.push(`remove:${origins?.join(',')}`); granted = false; return true },
  })
  return { registry, manager, calls }
}

describe('target adapter trust boundaries', () => {
  it('accepts only HTTPS origins and their matching permission patterns', () => {
    expect(isTrustedTargetOrigin('https://target.example')).toBe(true)
    expect(isTrustedPermissionOrigin('https://target.example/*')).toBe(true)
    expect(isTrustedTargetOrigin('http://target.example')).toBe(false)
    expect(isTrustedTargetOrigin('https://target.example/path')).toBe(false)
    expect(isTrustedPermissionOrigin('https://other.example/*')).toBe(true)
  })

  it('does not allow duplicate IDs or invalid adapter input', () => {
    expect(() => createTargetAdapter({ targetId: 'bad id', displayName: 'Bad', origin: 'https://bad.example' })).toThrow('INVALID_TARGET_ADAPTER')
    const adapter = createTargetAdapter({ targetId: 'same', displayName: 'Same', origin: 'https://same.example' })
    expect(() => new TargetRegistry([adapter, adapter])).toThrow('DUPLICATE_TARGET_ID')
  })
})

describe('target registry and permissions', () => {
  it('keeps unknown config IDs out of the static registry', () => {
    const { registry } = createFixture()
    expect(registry.get('remote-created-target')).toBeUndefined()
    expect(registry.list({ remoteCreated: { enabled: true } })).toHaveLength(2)
    expect(registry.status('disabled', true)).toBe('disabled')
  })

  it('requests and removes only known enabled target permissions', async () => {
    const { manager, calls } = createFixture()
    expect(await manager.requestPermission('unknown')).toBe(false)
    expect(await manager.requestPermission('disabled')).toBe(false)
    expect(calls).toEqual([])

    expect(await manager.getStatus('targetA')).toBe('permission-required')
    expect(await manager.requestPermission('targetA')).toBe(true)
    expect(await manager.getStatus('targetA')).toBe('ready')
    expect(await manager.removePermission('targetA')).toBe(true)
    expect(await manager.getStatus('targetA')).toBe('permission-required')
    expect(calls).toEqual([
      'contains:https://target.example/*',
      'request:https://target.example/*',
      'contains:https://target.example/*',
      'remove:https://target.example/*',
      'contains:https://target.example/*',
    ])
  })
})