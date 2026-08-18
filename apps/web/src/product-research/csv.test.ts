import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv } from './csv'

type StubAnchor = {
  href: string
  download: string
  style: { display: string }
  click: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

const originalBlob = globalThis.Blob
const originalURL = globalThis.URL
const originalDocument = (globalThis as { document?: unknown }).document

afterEach(() => {
  globalThis.Blob = originalBlob
  globalThis.URL = originalURL
  ;(globalThis as { document?: unknown }).document = originalDocument
  vi.restoreAllMocks()
})

describe('downloadCsv', () => {
  it('creates a blob url, triggers a named download, and revokes the url', () => {
    const anchor: StubAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
      remove: vi.fn(),
    }
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    let capturedText: unknown
    let capturedType: unknown

    globalThis.Blob = vi.fn((parts: unknown[], options: { type?: string }) => {
      capturedText = parts[0]
      capturedType = options.type
      return { parts, options } as unknown as Blob
    }) as unknown as typeof Blob
    globalThis.URL = { createObjectURL, revokeObjectURL } as unknown as typeof URL
    const appendChild = vi.fn()
    ;(globalThis as { document?: unknown }).document = {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    }

    downloadCsv('report.csv', 'a,b\r\n1,2')

    expect(capturedText).toBe('a,b\r\n1,2')
    expect(capturedType).toBe('text/csv;charset=utf-8')
    expect(anchor.href).toBe('blob:mock-url')
    expect(anchor.download).toBe('report.csv')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(anchor.remove).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('revokes the url even if the click throws', () => {
    const revokeObjectURL = vi.fn()
    const anchor: StubAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(() => {
        throw new Error('click failed')
      }),
      remove: vi.fn(),
    }
    globalThis.Blob = vi.fn(() => ({}) as unknown as Blob) as unknown as typeof Blob
    globalThis.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL,
    } as unknown as typeof URL
    ;(globalThis as { document?: unknown }).document = {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    }

    expect(() => downloadCsv('report.csv', 'x')).toThrow('click failed')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})