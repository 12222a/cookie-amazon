const MIME = 'text/csv;charset=utf-8'

export const downloadCsv = (filename: string, text: string): void => {
  const blob = new Blob([text], { type: MIME })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}