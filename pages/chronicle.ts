import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '../src/layout.ts'

const FONT = '20px "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif'
const LINE_HEIGHT = 32

const BODY_COPY = [
  'By the time the room settled, the drawing had already changed from an image into a route. The first pass was only a ribbon of sand drifting diagonally through the composition, but that was enough to force every sentence to admit that its old rectangle had been temporary. The text wanted to cling to the contour, then veer away from it, then return as if the page had a weather system instead of a column grid.',
  'That is the pleasure of doing this work in userland. The text is no longer sealed inside a block formatting context that has to be measured after the fact. Each line can be asked where it begins, where it ends, and how far it can travel before the next shape narrows the corridor. Instead of pleading with layout, the page can negotiate with it.',
  'The scent of the idea comes from that moment of control. A pull quote can occupy the left margin without freezing the rest of the story. A central figure can widen, shrink, or drift upward, and the copy will route itself through the changed openings without forfeiting the continuity of the paragraph. The geometry becomes part of the rhetoric.',
  'The point is not to mimic print nostalgically. It is to recover a capability that was always there in richer editorial tools: text that understands the surface it inhabits. Once the browser is not the only keeper of line breaks, you can build timelines, comparisons, notebooks, and braided views that stay anchored while the window changes under them.',
  'That is why this page keeps the art soft and the rules crisp. The shapes here are only scaffolds, but they prove the more important thing: a responsive layout can still behave like composition. It can keep its rhythm, keep its memory, and keep enough structure exposed that a human author can steer it on purpose.',
].join(' ')

type RectBox = {
  x: number
  y: number
  width: number
  height: number
}

type StageMetrics = {
  width: number
  stageTop: number
  bodyLeft: number
  bodyRight: number
  ribbonBox: RectBox
  blobBox: RectBox
  titleBox: RectBox
  centerBox: RectBox
  rightBox: RectBox
  leftBox: RectBox
  bottomBox: RectBox
}

const prepared: PreparedTextWithSegments = prepareWithSegments(BODY_COPY, FONT)

const spread = document.getElementById('spread') as HTMLDivElement
const titleBlock = document.getElementById('title-block') as HTMLDivElement
const deckCenter = document.getElementById('deck-center') as HTMLParagraphElement
const deckRight = document.getElementById('deck-right') as HTMLParagraphElement
const deckLeft = document.getElementById('deck-left') as HTMLParagraphElement
const deckBottom = document.getElementById('deck-bottom') as HTMLParagraphElement
const ribbonArt = document.getElementById('ribbon-art') as HTMLDivElement
const blobArt = document.getElementById('blob-art') as HTMLDivElement
const lineStage = document.getElementById('line-stage') as HTMLDivElement
const statusMeta = document.getElementById('status-meta')!

let lineElements: HTMLDivElement[] = []

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function setBox(el: HTMLElement, box: RectBox): RectBox {
  el.style.left = `${box.x}px`
  el.style.top = `${box.y}px`
  el.style.width = `${box.width}px`
  const height = Math.ceil(el.getBoundingClientRect().height)
  el.style.height = 'auto'
  return { ...box, height }
}

function lineOverlaps(box: RectBox, lineTop: number): boolean {
  return lineTop + LINE_HEIGHT > box.y && lineTop < box.y + box.height
}

function subtractIntervals(rangeLeft: number, rangeRight: number, intervals: Array<{ left: number, right: number }>): Array<{ left: number, right: number }> {
  if (intervals.length === 0) return [{ left: rangeLeft, right: rangeRight }]

  const sorted = intervals
    .map(interval => ({
      left: clamp(interval.left, rangeLeft, rangeRight),
      right: clamp(interval.right, rangeLeft, rangeRight),
    }))
    .filter(interval => interval.right - interval.left > 0)
    .sort((a, b) => a.left - b.left)

  const merged: Array<{ left: number, right: number }> = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last === undefined || interval.left > last.right) {
      merged.push({ ...interval })
    } else {
      last.right = Math.max(last.right, interval.right)
    }
  }

  const slots: Array<{ left: number, right: number }> = []
  let cursor = rangeLeft
  for (const interval of merged) {
    if (interval.left > cursor) slots.push({ left: cursor, right: interval.left })
    cursor = Math.max(cursor, interval.right)
  }
  if (cursor < rangeRight) slots.push({ left: cursor, right: rangeRight })
  return slots
}

function ribbonLocalBounds(t: number, width: number): { left: number, right: number } {
  const center =
    width * 0.5 +
    width * 0.13 * Math.sin(t * Math.PI * 2.35 + 0.35) +
    width * 0.045 * Math.sin(t * Math.PI * 5.6 - 0.4)
  const half =
    width * 0.18 +
    width * 0.055 * Math.cos(t * Math.PI * 1.7 - 0.2) +
    width * 0.03 * Math.sin(t * Math.PI * 4.2 + 0.25)

  return {
    left: clamp(center - half, width * 0.05, width * 0.72),
    right: clamp(center + half, width * 0.28, width * 0.95),
  }
}

function ribbonInterval(metrics: StageMetrics, lineTop: number): { left: number, right: number } | null {
  const { ribbonBox } = metrics
  const lineMid = lineTop + LINE_HEIGHT / 2
  if (lineMid < ribbonBox.y || lineMid > ribbonBox.y + ribbonBox.height) return null
  const t = clamp((lineMid - ribbonBox.y) / ribbonBox.height, 0, 1)
  const bounds = ribbonLocalBounds(t, ribbonBox.width)
  return {
    left: ribbonBox.x + bounds.left - 14,
    right: ribbonBox.x + bounds.right + 14,
  }
}

function blobInterval(metrics: StageMetrics, lineTop: number): { left: number, right: number } | null {
  const { blobBox } = metrics
  const lineMid = lineTop + LINE_HEIGHT / 2
  const cy = blobBox.y + blobBox.height * 0.52
  const dy = (lineMid - cy) / (blobBox.height * 0.52)
  if (Math.abs(dy) >= 1) return null

  const rx = blobBox.width * (0.5 + 0.06 * Math.cos(dy * Math.PI * 1.5))
  const wobble = blobBox.width * 0.06 * Math.sin(dy * Math.PI * 3.4)
  const half = rx * Math.sqrt(1 - dy * dy)
  const cx = blobBox.x + blobBox.width * 0.5 + wobble

  return {
    left: cx - half - 10,
    right: cx + half + 10,
  }
}

function buildRibbonPath(width: number, height: number): string {
  const leftPoints: string[] = []
  const rightPoints: string[] = []
  const steps = 28

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const y = t * height
    const bounds = ribbonLocalBounds(t, width)
    leftPoints.push(`${bounds.left.toFixed(2)},${y.toFixed(2)}`)
    rightPoints.push(`${bounds.right.toFixed(2)},${y.toFixed(2)}`)
  }

  return `M ${leftPoints.join(' L ')} L ${rightPoints.reverse().join(' L ')} Z`
}

function buildRibbonContour(width: number, height: number, ratio: number): string {
  const points: string[] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const y = t * height
    const bounds = ribbonLocalBounds(t, width)
    const wobble = Math.sin(t * Math.PI * 6 + ratio * Math.PI * 2) * width * 0.014
    const x = bounds.left + (bounds.right - bounds.left) * ratio + wobble
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return `M ${points.join(' L ')}`
}

function buildRibbonSvg(width: number, height: number): string {
  const path = buildRibbonPath(width, height)
  const contours = [0.16, 0.29, 0.43, 0.58, 0.73, 0.86]
    .map((ratio, index) => (
      `<path d="${buildRibbonContour(width, height, ratio)}" ` +
      `stroke="rgba(255, 243, 222, ${0.34 - index * 0.035})" stroke-width="${1.4 + index * 0.14}" fill="none" stroke-linecap="round" />`
    ))
    .join('')

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="ribbonFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ebbb75" />
          <stop offset="34%" stop-color="#c98747" />
          <stop offset="68%" stop-color="#6f4929" />
          <stop offset="100%" stop-color="#2a1b11" />
        </linearGradient>
        <linearGradient id="ribbonHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.72)" />
          <stop offset="45%" stop-color="rgba(255,255,255,0)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0.1)" />
        </linearGradient>
      </defs>
      <path d="${path}" fill="url(#ribbonFill)" />
      <path d="${path}" fill="url(#ribbonHighlight)" opacity="0.55" />
      ${contours}
    </svg>
  `
}

function buildBlobSvg(width: number, height: number): string {
  const cx = width * 0.5
  const cy = height * 0.52
  const steps = 36
  const outer: string[] = []

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const base =
      1 +
      0.16 * Math.sin(angle * 3 + 0.5) +
      0.1 * Math.cos(angle * 5 - 0.4)
    const rx = width * 0.42 * base
    const ry = height * 0.3 * base
    const x = cx + Math.cos(angle) * rx
    const y = cy + Math.sin(angle) * ry
    outer.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }

  const loops = [0.78, 0.6, 0.44]
    .map(scale => {
      const points: string[] = []
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2
        const wobble = 1 + 0.08 * Math.sin(angle * 4 + scale * 6)
        const rx = width * 0.42 * scale * wobble
        const ry = height * 0.3 * scale * wobble
        const x = cx + Math.cos(angle) * rx
        const y = cy + Math.sin(angle) * ry
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
      }
      return `<path d="M ${points.join(' L ')} Z" fill="none" stroke="rgba(255, 244, 228, 0.5)" stroke-width="2.2" />`
    })
    .join('')

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="blobFill" cx="45%" cy="35%">
          <stop offset="0%" stop-color="#e9d3b0" />
          <stop offset="48%" stop-color="#b99367" />
          <stop offset="100%" stop-color="#6e4b31" />
        </radialGradient>
      </defs>
      <path d="M ${outer.join(' L ')} Z" fill="url(#blobFill)" />
      ${loops}
    </svg>
  `
}

function buildMetrics(width: number): StageMetrics {
  const narrow = width < 920
  const bodyLeft = narrow ? 24 : 74
  const bodyRight = narrow ? width - 24 : width - 72
  const ribbonBox = narrow
    ? { x: width * 0.14, y: 300, width: width * 0.72, height: 280 }
    : { x: width * 0.43, y: 22, width: Math.min(430, width * 0.39), height: 690 }

  const blobBox = narrow
    ? { x: width * 0.16, y: 650, width: width * 0.54, height: 130 }
    : { x: 54, y: 500, width: 300, height: 196 }

  const titleWidth = narrow ? width - 48 : Math.min(620, width * 0.47)
  const titleHeight = setBox(titleBlock, { x: bodyLeft, y: narrow ? 54 : 74, width: titleWidth, height: 0 }).height

  const centerTop = narrow ? titleBlock.offsetTop + titleHeight + 26 : 118
  const centerHeight = setBox(deckCenter, {
    x: narrow ? bodyLeft : width * 0.54,
    y: centerTop,
    width: narrow ? width - 48 : Math.min(280, width * 0.24),
    height: 0,
  }).height

  const rightTop = narrow ? centerTop + centerHeight + 18 : 118
  const rightHeight = setBox(deckRight, {
    x: narrow ? bodyLeft : width - 242,
    y: rightTop,
    width: narrow ? width - 48 : 178,
    height: 0,
  }).height

  const leftTop = narrow ? ribbonBox.y + ribbonBox.height + 28 : 332
  const leftHeight = setBox(deckLeft, {
    x: bodyLeft,
    y: leftTop,
    width: narrow ? width - 48 : 272,
    height: 0,
  }).height

  const bottomTop = narrow ? blobBox.y + blobBox.height + 28 : 682
  const bottomHeight = setBox(deckBottom, {
    x: narrow ? bodyLeft : width * 0.55,
    y: bottomTop,
    width: narrow ? width - 48 : 310,
    height: 0,
  }).height

  ribbonArt.style.left = `${ribbonBox.x}px`
  ribbonArt.style.top = `${ribbonBox.y}px`
  ribbonArt.style.width = `${ribbonBox.width}px`
  ribbonArt.style.height = `${ribbonBox.height}px`
  ribbonArt.innerHTML = buildRibbonSvg(ribbonBox.width, ribbonBox.height)

  blobArt.style.left = `${blobBox.x}px`
  blobArt.style.top = `${blobBox.y}px`
  blobArt.style.width = `${blobBox.width}px`
  blobArt.style.height = `${blobBox.height}px`
  blobArt.innerHTML = buildBlobSvg(blobBox.width, blobBox.height)

  return {
    width,
    stageTop: narrow ? bottomTop + bottomHeight + 34 : 104,
    bodyLeft,
    bodyRight,
    ribbonBox,
    blobBox,
    titleBox: { x: bodyLeft, y: narrow ? 54 : 74, width: titleWidth, height: titleHeight },
    centerBox: {
      x: narrow ? bodyLeft : width * 0.54,
      y: centerTop,
      width: narrow ? width - 48 : Math.min(280, width * 0.24),
      height: centerHeight,
    },
    rightBox: {
      x: narrow ? bodyLeft : width - 242,
      y: rightTop,
      width: narrow ? width - 48 : 178,
      height: rightHeight,
    },
    leftBox: {
      x: bodyLeft,
      y: leftTop,
      width: narrow ? width - 48 : 272,
      height: leftHeight,
    },
    bottomBox: {
      x: narrow ? bodyLeft : width * 0.55,
      y: bottomTop,
      width: narrow ? width - 48 : 310,
      height: bottomHeight,
    },
  }
}

function getSlots(metrics: StageMetrics, lineTop: number): Array<{ x: number, width: number }> {
  if (metrics.width < 920) {
    return [{ x: metrics.bodyLeft, width: metrics.bodyRight - metrics.bodyLeft }]
  }

  const intervals: Array<{ left: number, right: number }> = []
  const obstacleGap = 18

  for (const box of [metrics.titleBox, metrics.centerBox, metrics.rightBox, metrics.leftBox, metrics.bottomBox]) {
    if (lineOverlaps(box, lineTop)) {
      intervals.push({
        left: box.x - obstacleGap,
        right: box.x + box.width + obstacleGap,
      })
    }
  }

  const ribbon = ribbonInterval(metrics, lineTop)
  if (ribbon !== null) intervals.push(ribbon)

  const blob = blobInterval(metrics, lineTop)
  if (blob !== null) intervals.push(blob)

  return subtractIntervals(metrics.bodyLeft, metrics.bodyRight, intervals)
    .map(slot => ({ x: slot.left, width: slot.right - slot.left }))
    .filter(slot => slot.width >= 150)
}

function render(): void {
  const metrics = buildMetrics(spread.clientWidth)
  lineStage.replaceChildren()
  lineElements = []

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let rowIndex = 0
  let lineCount = 0
  let lastTop = metrics.stageTop
  const maxRows = 140

  while (rowIndex < maxRows) {
    const lineTop = metrics.stageTop + rowIndex * LINE_HEIGHT
    const slots = getSlots(metrics, lineTop)

    if (slots.length === 0) {
      rowIndex++
      continue
    }

    for (const slot of slots) {
      const line = layoutNextLine(prepared, cursor, slot.width)
      if (line === null) {
        const minimumHeight = Math.max(
          metrics.bottomBox.y + metrics.bottomBox.height + 120,
          lastTop + LINE_HEIGHT + 120,
          metrics.ribbonBox.y + metrics.ribbonBox.height + 90,
        )
        spread.style.minHeight = `${Math.ceil(minimumHeight)}px`
        statusMeta.textContent = `${lineCount} positioned lines • ${metrics.width}px spread • resize to recompose`
        return
      }

      const el = document.createElement('div')
      const currentLineNumber = lineCount + 1
      el.className = 'line'
      el.textContent = line.text
      el.style.left = `${slot.x}px`
      el.style.top = `${lineTop}px`
      el.title =
        `L${currentLineNumber} • ${line.start.segmentIndex}:${line.start.graphemeIndex}→` +
        `${line.end.segmentIndex}:${line.end.graphemeIndex}` +
        (line.trailingDiscretionaryHyphen ? ' • discretionary hyphen' : '')
      el.addEventListener('mouseenter', () => {
        statusMeta.textContent =
          `L${currentLineNumber} • ${line.start.segmentIndex}:${line.start.graphemeIndex}→` +
          `${line.end.segmentIndex}:${line.end.graphemeIndex} • ${line.width.toFixed(2)}px`
      })
      lineStage.appendChild(el)
      lineElements.push(el)

      cursor = line.end
      lineCount++
      lastTop = lineTop
    }

    rowIndex++
  }

  spread.style.minHeight = `${Math.ceil(lastTop + LINE_HEIGHT + 120)}px`
  statusMeta.textContent = `${lineCount} positioned lines • ${metrics.width}px spread • max rows reached`
}

const resizeObserver = new ResizeObserver(() => render())
resizeObserver.observe(spread)

render()
