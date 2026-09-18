import { describe, expect, it } from 'vitest'
import {
  OPEN_SIDE_PANEL_ACTION,
  registerOpenSidePanelHandler,
  type OpenSidePanelApi,
} from '../panel/open-side-panel'

const createApi = () => {
  const opened: Array<{ tabId: number }> = []
  let listener: ((message: unknown, sender: unknown) => unknown) | null = null
  let fail = false
  const api: OpenSidePanelApi = {
    runtime: {
      onMessage: {
        addListener(next) { listener = next },
      },
    },
    sidePanel: {
      async open(options) {
        if (fail) throw new Error('no gesture')
        opened.push(options)
      },
    },
  }
  registerOpenSidePanelHandler(api)
  return {
    opened,
    setFail(value: boolean) { fail = value },
    send: (message: unknown, sender: unknown) => listener?.(message, sender),
  }
}

describe('registerOpenSidePanelHandler', () => {
  it('opens the panel for the tab the message came from', async () => {
    const { opened, send } = createApi()
    const response = await send({ action: OPEN_SIDE_PANEL_ACTION }, { tab: { id: 42 } })
    expect(opened).toEqual([{ tabId: 42 }])
    expect(response).toEqual({ ok: true })
  })

  it('ignores unrelated messages so other listeners still get them', async () => {
    const { opened, send } = createApi()
    expect(send({ action: 'SOMETHING_ELSE' }, { tab: { id: 42 } })).toBe(false)
    expect(opened).toEqual([])
  })

  it('ignores a message with no sender tab, because there is nothing to open against', async () => {
    const { opened, send } = createApi()
    expect(await send({ action: OPEN_SIDE_PANEL_ACTION }, {})).toBe(false)
    expect(await send({ action: OPEN_SIDE_PANEL_ACTION }, null)).toBe(false)
    expect(opened).toEqual([])
  })

  it('reports failure instead of throwing when the browser refuses', async () => {
    const { setFail, send } = createApi()
    setFail(true)
    await expect(send({ action: OPEN_SIDE_PANEL_ACTION }, { tab: { id: 7 } })).resolves.toEqual({ ok: false })
  })
})

