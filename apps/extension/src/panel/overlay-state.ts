import type { AnalysisObject } from '../analysis-object'

export type OverlayMode = 'hidden' | 'pill' | 'card'

export type OverlayPosition = { x: number; y: number }

export type OverlaySize = { width: number; height: number }

/** 浮层收起与否，只有这一个来源；调用方直接传布尔，不传整条记录。 */
export const overlayMode = (object: AnalysisObject | null, collapsed: boolean): OverlayMode => {
  if (object === null) return 'hidden'
  // 收起不等于消失：收起后留一颗小药丸，用户能再点开。
  // 若收起即隐藏，用户就得回到扩展弹窗才能找回浮层，等于给常驻入口加了一道弯路。
  // 只有没有分析对象时才真正不渲染——AC 要求浮层无事可做时静默消失，不打扰页面。
  return collapsed ? 'pill' : 'card'
}

/**
 * 把浮层位置夹回可视区域内。
 *
 * 位置来自上一次会话，期间窗口可能被缩放或换了显示器，所以每次渲染都要夹一次，
 * 否则浮层会跑到屏幕外，用户既看不到也点不到。
 */
export const clampOverlayPosition = (
  position: OverlayPosition,
  size: OverlaySize,
  viewport: OverlaySize,
): OverlayPosition => {
  const maxX = Math.max(0, viewport.width - size.width)
  const maxY = Math.max(0, viewport.height - size.height)
  return {
    x: Math.min(maxX, Math.max(0, Math.round(position.x))),
    y: Math.min(maxY, Math.max(0, Math.round(position.y))),
  }
}
