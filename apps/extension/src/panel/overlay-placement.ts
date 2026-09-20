import { clampOverlayPosition, type OverlayPosition, type OverlaySize } from './overlay-state'

/**
 * 浮层首屏的假定尺寸，用来算首次出现的位置与夹取。
 * 与 overlay.css 里 .ca-card 的宽度、最大高度一致：卡片里现在是对话串，比原来的字段卡大。
 */
export const OVERLAY_WIDTH = 320
export const OVERLAY_HEIGHT = 460
const MARGIN = 24

/**
 * 浮层首次出现的位置：视口右下角。
 *
 * 选右下角是因为 Amazon 搜索结果页的关键内容在左上到中部（图片、标题、价格），
 * 右下通常是空白或分页区，浮层放这里最不容易挡住要看的东西。
 *
 * 只是首次位置；用户拖动过之后由偏好存储中的位置接管。
 */
export const initialOverlayPosition = (viewport: OverlaySize): OverlayPosition =>
  clampOverlayPosition(
    { x: viewport.width - OVERLAY_WIDTH - MARGIN, y: viewport.height - OVERLAY_HEIGHT - MARGIN },
    { width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT },
    viewport,
  )
