import '../../src/popup.css'
import { TargetPermissionManager } from '../../src/targets/permissions'
import { TARGET_REGISTRY } from '../../src/targets/registry'

const targetId = 'sellersprite'
const statusElement = document.querySelector<HTMLParagraphElement>('#status')
const grantButton = document.querySelector<HTMLButtonElement>('#grant')
const permissionManager = new TargetPermissionManager(TARGET_REGISTRY, browser.permissions)

const renderStatus = (granted: boolean, message?: string): void => {
  if (statusElement) statusElement.textContent = message ?? (granted ? '已授权' : '需要授权')
  if (grantButton) grantButton.disabled = granted
}

const refresh = async (): Promise<void> => {
  try {
    renderStatus(await permissionManager.hasPermission(targetId))
  } catch {
    renderStatus(false, '无法读取权限状态')
  }
}

grantButton?.addEventListener('click', () => {
  if (grantButton) grantButton.disabled = true
  if (statusElement) statusElement.textContent = '等待 Chrome 确认…'
  void permissionManager.requestPermission(targetId)
    .then((granted) => renderStatus(granted))
    .catch(() => renderStatus(false, '授权失败，请重试'))
})

void refresh()