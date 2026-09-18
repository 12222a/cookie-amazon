import type { AnalysisObject } from '../analysis-object'
import { overlayMode, type OverlayMode, type OverlayPosition } from './overlay-state'

export type OverlayView = {
  render(object: AnalysisObject | null, mode: OverlayMode): void
  remove(): void
}

export type OverlayControllerOptions = {
  /** 建浮层；建不出来（页面异常等）返回 null，由控制器降级为「没有浮层」。 */
  createView: () => OverlayView | null
  readObject: () => Promise<AnalysisObject | null>
  readPreference: () => Promise<{ collapsed: boolean; position: OverlayPosition | null }>
  writePreference: (preference: { collapsed: boolean; position: OverlayPosition | null }) => Promise<boolean>
  initialPosition: () => OverlayPosition
}

/**
 * 浮层的挂载与两态同步逻辑，与 DOM 分开以便测试。
 *
 * 有状态的东西都在这里：当前对象、当前偏好、已挂载的 view、以及一个进行中的同步。
 * 存储变更可能连着来多次，若每次各自走过两个 await 再挂载，就会挂出两个浮层；
 * 因此用 in-flight promise 把并发同步串成一条线。
 */
export class OverlayController {
  private view: OverlayView | null = null
  private object: AnalysisObject | null = null
  private collapsed = true
  private position: OverlayPosition | null = null
  private inFlight: Promise<void> | null = null

  public constructor(private readonly options: OverlayControllerOptions) {}

  /** 读存储并把浮层调到与之一致；并发调用共用同一次执行。 */
  public sync(): Promise<void> {
    if (this.inFlight !== null) return this.inFlight
    this.inFlight = this.run().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private async run(): Promise<void> {
    const [object, preference] = await Promise.all([
      this.options.readObject().catch(() => null),
      this.options.readPreference().catch(() => ({ collapsed: true, position: null })),
    ])
    this.object = object
    this.collapsed = preference.collapsed
    this.position = preference.position ?? this.position
    if (object === null) { this.removeView(); return }
    if (this.view === null) {
      this.view = this.options.createView()
      if (this.view === null) { this.object = null; return }
    }
    this.paint()
  }

  public async toggleCollapsed(): Promise<void> {
    this.collapsed = !this.collapsed
    await this.persist()
    this.paint()
  }

  public async move(position: OverlayPosition): Promise<void> {
    this.position = position
    await this.persist()
  }

  private async persist(): Promise<void> {
    // 收起与位置写在一起，且都保留对方——位置与开合是两件事。
    await this.options
      .writePreference({ collapsed: this.collapsed, position: this.position })
      .catch(() => false)
  }

  private paint(): void {
    if (this.view === null) return
    try {
      this.view.render(this.object, overlayMode(this.object, this.collapsed))
    } catch {
      // AC：渲染失败时浮层静默消失。留着旧内容会显示与当前对象不符的数据，
      // 比没有浮层更糟——用户会以为那就是这个 ASIN 的信息。
      this.removeView()
    }
  }

  private removeView(): void {
    const view = this.view
    this.view = null
    if (view === null) return
    try { view.remove() } catch { /* 移除失败不抛给页面 */ }
  }

  public currentPosition(): OverlayPosition {
    return this.position ?? this.options.initialPosition()
  }
}

