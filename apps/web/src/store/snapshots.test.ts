import { afterEach, describe, expect, it } from 'vitest'
import type { ProductSnapshot } from '@cookie-amazon/analytics'
import {
  clearSnapshots,
  listSnapshots,
  listSnapshotsByMarket,
  putSnapshot,
} from './snapshots'

const snapshot = (overrides: Partial<ProductSnapshot> = {}): ProductSnapshot => ({
  snapshotId: 'snap-1',
  capturedAt: 1000,
  market: 'US',
  selectType: 'default',
  page: 1,
  total: 1,
  observations: [
    {
      asin: 'A1',
      title: 'Widget',
      brand: null,
      imageUrl: null,
      price: 9.99,
      rating: 4.5,
      reviews: 120,
      estimatedSales: 300,
    },
  ],
  ...overrides,
})

afterEach(async () => {
  await clearSnapshots()
})

describe('snapshots store', () => {
  it('persists and reads a snapshot round-trip', async () => {
    await putSnapshot(snapshot())
    const all = await listSnapshots()
    expect(all).toHaveLength(1)
    expect(all[0]?.snapshotId).toBe('snap-1')
    expect(all[0]?.observations[0]?.asin).toBe('A1')
  })

  it('orders snapshots by capturedAt', async () => {
    await putSnapshot(snapshot({ snapshotId: 'late', capturedAt: 3000 }))
    await putSnapshot(snapshot({ snapshotId: 'early', capturedAt: 1000 }))
    const all = await listSnapshots()
    expect(all.map((item) => item.snapshotId)).toEqual(['early', 'late'])
  })

  it('filters snapshots by market and keeps chronological order', async () => {
    await putSnapshot(snapshot({ snapshotId: 'us-2', capturedAt: 2000, market: 'US' }))
    await putSnapshot(snapshot({ snapshotId: 'de-1', capturedAt: 1500, market: 'DE' }))
    await putSnapshot(snapshot({ snapshotId: 'us-1', capturedAt: 1000, market: 'US' }))
    const us = await listSnapshotsByMarket('US')
    expect(us.map((item) => item.snapshotId)).toEqual(['us-1', 'us-2'])
    const de = await listSnapshotsByMarket('DE')
    expect(de.map((item) => item.snapshotId)).toEqual(['de-1'])
  })

  it('rejects duplicate snapshotId inserts', async () => {
    await putSnapshot(snapshot({ snapshotId: 'dup' }))
    await expect(putSnapshot(snapshot({ snapshotId: 'dup' }))).rejects.toBeDefined()
  })

  it('clears all snapshots', async () => {
    await putSnapshot(snapshot())
    await clearSnapshots()
    expect(await listSnapshots()).toHaveLength(0)
  })
})