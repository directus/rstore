const MIRROR_STYLE_PROPERTIES = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontStretch',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'tabSize',
  'textAlign',
  'textIndent',
  'textTransform',
] as const

export interface TextCursorLayout {
  left: number
  top: number
  height: number
  visible: boolean
}

export interface TextSelectionLayout {
  left: number
  top: number
  width: number
  height: number
  visible: boolean
}

export function getTextCursorLayout(
  container: HTMLElement,
  target: HTMLInputElement | HTMLTextAreaElement,
  position: number,
): TextCursorLayout | null {
  if (!container.isConnected || !target.isConnected) {
    return null
  }

  const { document, mirror, styles } = createMirror(target)

  const safePosition = clamp(position, 0, target.value.length)
  const beforeText = target.value.slice(0, safePosition)
  const marker = document.createElement('span')
  marker.textContent = target.value[safePosition] ?? '\u200B'

  mirror.textContent = beforeText || '\u200B'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)

  const mirrorRect = mirror.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const markerRect = marker.getBoundingClientRect()
  const lineHeight = Number.parseFloat(styles.lineHeight) || (Number.parseFloat(styles.fontSize) || 16) * 1.2

  const left = targetRect.left - containerRect.left + (markerRect.left - mirrorRect.left) - target.scrollLeft
  const top = targetRect.top - containerRect.top + (markerRect.top - mirrorRect.top) - target.scrollTop

  document.body.removeChild(mirror)

  const targetLeft = targetRect.left - containerRect.left
  const targetTop = targetRect.top - containerRect.top
  const visible = left >= targetLeft - 4
    && left <= targetLeft + target.clientWidth + 4
    && top + lineHeight >= targetTop
    && top <= targetTop + target.clientHeight

  return {
    left,
    top,
    height: lineHeight,
    visible,
  }
}

export function getTextSelectionLayouts(
  container: HTMLElement,
  target: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
): TextSelectionLayout[] {
  if (!container.isConnected || !target.isConnected) {
    return []
  }

  const safeStart = clamp(Math.min(start, end), 0, target.value.length)
  const safeEnd = clamp(Math.max(start, end), 0, target.value.length)
  if (safeStart === safeEnd || target.value.length === 0) {
    return []
  }

  const { document, mirror } = createMirror(target)
  const textNode = document.createTextNode(target.value)
  mirror.appendChild(textNode)
  document.body.appendChild(mirror)

  const range = document.createRange()
  range.setStart(textNode, safeStart)
  range.setEnd(textNode, safeEnd)

  const mirrorRect = mirror.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const targetLeft = targetRect.left - containerRect.left
  const targetTop = targetRect.top - containerRect.top

  const rects = Array.from(range.getClientRects())
    .map((rect) => {
      const left = targetRect.left - containerRect.left + (rect.left - mirrorRect.left) - target.scrollLeft
      const top = targetRect.top - containerRect.top + (rect.top - mirrorRect.top) - target.scrollTop
      const visible = left + rect.width >= targetLeft
        && left <= targetLeft + target.clientWidth
        && top + rect.height >= targetTop
        && top <= targetTop + target.clientHeight

      return {
        left,
        top,
        width: rect.width,
        height: rect.height,
        visible,
      } satisfies TextSelectionLayout
    })
    .filter(rect => rect.width > 0 && rect.height > 0)

  document.body.removeChild(mirror)

  return rects
}

function createMirror(target: HTMLInputElement | HTMLTextAreaElement) {
  const document = target.ownerDocument
  const window = document.defaultView
  if (!window) {
    throw new Error('Window not available')
  }

  const styles = window.getComputedStyle(target)
  const mirror = document.createElement('div')

  for (const property of MIRROR_STYLE_PROPERTIES) {
    mirror.style[property] = styles[property]
  }

  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.pointerEvents = 'none'
  mirror.style.left = '-9999px'
  mirror.style.top = '0'
  mirror.style.overflow = 'hidden'
  mirror.style.whiteSpace = target instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre'
  mirror.style.wordBreak = target instanceof HTMLTextAreaElement ? 'break-word' : 'normal'
  mirror.style.overflowWrap = target instanceof HTMLTextAreaElement ? 'break-word' : 'normal'

  return {
    document,
    styles,
    mirror,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
