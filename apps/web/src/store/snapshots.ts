import type { ProductSnapshot } from '@cookie-amazon/analytics'

const DB_NAME = 'cookie-amazon-analytics'
const DB_VERSION = 1
const STORE = 'product-snapshots'
const INDEX_CAPTURED_AT = 'by-capturedAt'
const INDEX_MARKET = 'by-market'

const promisifyRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IDB_REQUEST_FAILED'))
  })

const upgrade = (db: IDBDatabase): void => {
  if (db.objectStoreNames.contains(STORE)) return
  const store = db.createObjectStore(STORE, { keyPath: 'snapshotId' })
  store.createIndex(INDEX_CAPTURED_AT, 'capturedAt')
  store.createIndex(INDEX_MARKET, 'market')
}

export const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => upgrade(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IDB_OPEN_FAILED'))
  })

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> => {
  const db = await openDatabase()
  try {
    const tx = db.transaction(STORE, mode)
    const result = await run(tx.objectStore(STORE))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('IDB_TX_ABORTED'))
      tx.onerror = () => reject(tx.error ?? new Error('IDB_TX_FAILED'))
    })
    return result
  } finally {
    db.close()
  }
}

export const putSnapshot = (snapshot: ProductSnapshot): Promise<void> =>
  withStore('readwrite', async (store) => {
    await promisifyRequest(store.add(snapshot))
  })

export const listSnapshots = (): Promise<ProductSnapshot[]> =>
  withStore('readonly', async (store) => {
    const all = await promisifyRequest(store.index(INDEX_CAPTURED_AT).getAll())
    return all as ProductSnapshot[]
  })

export const listSnapshotsByMarket = (market: string): Promise<ProductSnapshot[]> =>
  withStore('readonly', async (store) => {
    const all = await promisifyRequest(store.index(INDEX_MARKET).getAll(market))
    return (all as ProductSnapshot[]).sort((a, b) => a.capturedAt - b.capturedAt)
  })

export const clearSnapshots = (): Promise<void> =>
  withStore('readwrite', async (store) => {
    await promisifyRequest(store.clear())
  })