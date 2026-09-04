<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { StatusFlow, ApplicationStatus } from '../../api'

const props = defineProps<{ flow: StatusFlow | null }>()

interface StatusMeta { label: string; color: string; rank: number }

// Rank fixes each status to a column so the tree reads top-to-bottom even
// though real transitions can skip columns (e.g. Applied straight to
// Rejected) or run sideways (Interviewing to Assessment). Order here also
// fixes left-to-right position within a rank and is never re-sorted by count,
// so a status keeps the same seat as the underlying counts change.
const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  Applied:             { label: 'Applied',        color: '#60A5FA', rank: 0 },
  InterviewScheduled:  { label: 'Interviewing',   color: '#A78BFA', rank: 1 },
  Assessment:          { label: 'Assessment',     color: '#FB923C', rank: 1 },
  OfferReceived:       { label: 'Offer Received', color: '#34D399', rank: 2 },
  Accepted:            { label: 'Accepted',       color: '#10B981', rank: 3 },
  OnHold:              { label: 'On Hold',        color: '#FBBF24', rank: 3 },
  Rejected:            { label: 'Rejected',       color: '#F87171', rank: 3 },
  Withdrawn:           { label: 'Withdrawn',      color: '#9CA3AF', rank: 3 },
  Ghosted:             { label: 'Ghosted',        color: '#71717A', rank: 3 },
}
const STATUS_ORDER = Object.keys(STATUS_META) as ApplicationStatus[]

const COL_W = 168
const ROW_H = 132
const NODE_W = 148
const NODE_H = 62
// Side padding doubles as the routing lane an edge uses when every gap
// between nodes in a crossed row is taken.
const PAD_X = 44
const PAD_Y = 20
// Gap kept between an edge and any node box it routes past.
const EDGE_CLEARANCE = 14

const nodesByStatus = computed(() => {
  const map = new Map<ApplicationStatus, { total: number; current: number }>()
  for (const n of props.flow?.nodes ?? []) map.set(n.status, { total: n.total, current: n.current })
  return map
})

const total = computed(() => nodesByStatus.value.get('Applied')?.total ?? 0)
const isEmpty = computed(() => total.value === 0)

const ranks = computed(() => {
  const byRank = new Map<number, ApplicationStatus[]>()
  for (const status of STATUS_ORDER) {
    if (!nodesByStatus.value.has(status)) continue
    const r = STATUS_META[status].rank
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(status)
  }
  return [...byRank.entries()].sort((a, b) => a[0] - b[0])
})

const maxCols = computed(() => Math.max(1, ...ranks.value.map(([, ss]) => ss.length)))
const svgWidth  = computed(() => maxCols.value * COL_W + PAD_X * 2)
// Height has to be measured off the same thing the nodes are positioned by.
// Rows are the *present* ranks compacted (a status keeps its rank order, but
// an absent rank doesn't leave a blank row) — so the last row's bottom edge
// is (rows - 1) pitches down plus one node, not a full pitch per row.
const svgHeight = computed(() => (ranks.value.length - 1) * ROW_H + NODE_H + PAD_Y * 2)

interface Positioned { status: ApplicationStatus; x: number; y: number; total: number; current: number }

// Rank -> row index. Positioning by raw rank would leave a blank row wherever
// a rank has no statuses (e.g. nothing ever reached Assessment or Offer
// Received) and, worse, push the bottom row past the canvas height, clipping
// those nodes in half. Compacting keeps the two in agreement.
const rowOfStatus = computed(() => {
  const out = new Map<ApplicationStatus, number>()
  ranks.value.forEach(([, statuses], row) => statuses.forEach(s => out.set(s, row)))
  return out
})

const positions = computed(() => {
  const out = new Map<ApplicationStatus, Positioned>()
  ranks.value.forEach(([, statuses], row) => {
    const rowW = statuses.length * COL_W
    const startX = (svgWidth.value - rowW) / 2 + COL_W / 2
    statuses.forEach((status, i) => {
      const info = nodesByStatus.value.get(status)!
      out.set(status, {
        status,
        x: startX + i * COL_W,
        y: PAD_Y + row * ROW_H + NODE_H / 2,
        total: info.total,
        current: info.current,
      })
    })
  })
  return out
})

const positionList = computed(() => [...positions.value.values()])

const maxEdgeCount = computed(() =>
  Math.max(1, ...(props.flow?.edges ?? []).map(e => e.count))
)

interface Point { x: number; y: number }

const nodesByRow = computed(() =>
  ranks.value.map(([, statuses]) => statuses.map(s => positions.value.get(s)!))
)

// Horizontal stretches of a row that no node box occupies, with clearance so
// an edge threading one doesn't graze a box corner.
function freeChannels(centers: number[]): [number, number][] {
  const blocked = centers
    .map(x => [x - NODE_W / 2 - EDGE_CLEARANCE, x + NODE_W / 2 + EDGE_CLEARANCE] as [number, number])
    .sort((a, b) => a[0] - b[0])

  const channels: [number, number][] = []
  let cursor = EDGE_CLEARANCE
  for (const [lo, hi] of blocked) {
    if (lo - cursor > 2) channels.push([cursor, lo])
    cursor = Math.max(cursor, hi)
  }
  const right = svgWidth.value - EDGE_CLEARANCE
  if (right - cursor > 2) channels.push([cursor, right])
  return channels
}

// The x in a free channel closest to where the edge "wants" to be, so it
// hugs the node it routes past instead of swinging out to the canvas edge.
function nearestFreeX(channels: [number, number][], ideal: number): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (const [lo, hi] of channels) {
    const x = Math.min(Math.max(ideal, lo), hi)
    const dist = Math.abs(x - ideal)
    if (dist < bestDist) { bestDist = dist; best = x }
  }
  return best
}

// Catmull-Rom through the waypoints, converted to cubic beziers. The phantom
// end points give the curve vertical tangents where it meets a node, so it
// leaves the parent heading down and enters the child heading down.
function smoothPath(points: Point[]): string {
  if (points.length === 2) {
    const [p0, p1] = points
    const midY = (p0.y + p1.y) / 2
    return `M ${p0.x} ${p0.y} C ${p0.x} ${midY}, ${p1.x} ${midY}, ${p1.x} ${p1.y}`
  }
  const first = points[0]
  const last  = points[points.length - 1]
  const pts: Point[] = [
    { x: first.x, y: first.y - ROW_H * 0.5 },
    ...points,
    { x: last.x,  y: last.y  + ROW_H * 0.5 },
  ]
  let d = `M ${first.x} ${first.y}`
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2]
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

// Halfway along the route — where the count badge sits, so it reads as
// belonging to this edge rather than to whatever node it passes.
function midpointOf(points: Point[]): Point {
  const segments = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let remaining = segments.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < segments.length; i++) {
    if (remaining <= segments[i]) {
      const f = segments[i] === 0 ? 0 : remaining / segments[i]
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * f,
        y: points[i].y + (points[i + 1].y - points[i].y) * f,
      }
    }
    remaining -= segments[i]
  }
  return points[points.length - 1]
}

const edgePaths = computed(() => {
  const list: { from: ApplicationStatus; to: ApplicationStatus; count: number; d: string; strokeWidth: number; color: string; mx: number; my: number }[] = []
  for (const e of props.flow?.edges ?? []) {
    const from = positions.value.get(e.from)
    const to   = positions.value.get(e.to)
    if (!from || !to) continue

    const fromRow = rowOfStatus.value.get(e.from) ?? 0
    const toRow   = rowOfStatus.value.get(e.to) ?? 0
    const start: Point = { x: from.x, y: from.y + NODE_H / 2 }
    const end:   Point = { x: to.x,   y: to.y   - NODE_H / 2 }

    // An edge spanning more than one row (e.g. Applied straight to Rejected)
    // crosses rows that have their own nodes. Drawn as a plain curve it runs
    // under one of them and its count badge then reads as if it belonged to
    // that node. Instead, pin a waypoint in each crossed row: the free gap
    // nearest to where the edge would naturally pass.
    const waypoints: Point[] = []
    for (let row = Math.min(fromRow, toRow) + 1; row < Math.max(fromRow, toRow); row++) {
      const rowY = PAD_Y + row * ROW_H + NODE_H / 2
      const span = to.y - from.y
      const ideal = span === 0 ? from.x : from.x + (to.x - from.x) * ((rowY - from.y) / span)
      const x = nearestFreeX(freeChannels(nodesByRow.value[row].map(n => n.x)), ideal)
      if (x !== null) waypoints.push({ x, y: rowY })
    }

    const route = [start, ...waypoints, end]
    const badge = midpointOf(route)

    list.push({
      from: e.from,
      to: e.to,
      count: e.count,
      d: smoothPath(route),
      strokeWidth: 1.5 + (e.count / maxEdgeCount.value) * 7,
      color: STATUS_META[e.from].color,
      mx: badge.x,
      my: badge.y,
    })
  }
  return list
})

// Zoom/pan: the tree scrolls inside a height-capped card, so it needs its
// own zoom rather than relying on max-width to shrink-to-fit. fitScale keeps
// the initial view at "whole tree fits the card's width" (same look as
// before); userZoom is what a trackpad pinch (delivered as wheel+ctrlKey) or
// ctrl+scroll multiplies on top of that. Plain scroll/trackpad-pan is left
// alone so the browser's native overflow scrolling handles panning.
const scrollRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
let containerResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (scrollRef.value) {
    containerResizeObserver = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) containerWidth.value = w
    })
    containerResizeObserver.observe(scrollRef.value)
  }
})
onUnmounted(() => containerResizeObserver?.disconnect())

const fitScale = computed(() =>
  containerWidth.value && svgWidth.value ? Math.min(1, containerWidth.value / svgWidth.value) : 1
)

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const userZoom = ref(1)
const scale = computed(() => fitScale.value * userZoom.value)

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey) return // plain wheel/trackpad scroll — let the container pan natively
  e.preventDefault()
  const factor = Math.exp(-e.deltaY * 0.01)
  userZoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, userZoom.value * factor))
}

const hovered = ref<ApplicationStatus | null>(null)
function toggleHover(status: ApplicationStatus) {
  hovered.value = hovered.value === status ? null : status
}
const connected = computed(() => {
  if (!hovered.value) return null
  const set = new Set<ApplicationStatus>([hovered.value])
  for (const e of props.flow?.edges ?? []) {
    if (e.from === hovered.value) set.add(e.to)
    if (e.to === hovered.value) set.add(e.from)
  }
  return set
})
function nodeDim(status: ApplicationStatus) { return connected.value !== null && !connected.value.has(status) }
function edgeDim(from: ApplicationStatus, to: ApplicationStatus) {
  return hovered.value !== null && hovered.value !== from && hovered.value !== to
}
</script>

<template>
  <div class="st-wrap">
    <div class="st-header">
      <h3 class="st-title">Application Journey</h3>
      <span v-if="!isEmpty" class="st-total"><strong>{{ total }}</strong> total</span>
    </div>

    <div v-if="isEmpty" class="st-empty">No applications to display.</div>

    <div v-else class="st-scroll" ref="scrollRef" @wheel="onWheel">
      <svg
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        :width="svgWidth * scale"
        :height="svgHeight * scale"
        role="img"
        aria-label="Application status flow, showing how applications branch from Applied into later stages. Scroll to pan, or pinch / ctrl-scroll to zoom."
      >
        <g v-for="e in edgePaths" :key="`${e.from}-${e.to}`" :class="{ 'st-edge--dim': edgeDim(e.from, e.to) }">
          <path :d="e.d" fill="none" :stroke="e.color" stroke-opacity="0.45" :stroke-width="e.strokeWidth" stroke-linecap="round" />
          <rect :x="e.mx - 12" :y="e.my - 9" width="24" height="18" rx="5" class="st-edge-badge-bg" />
          <text :x="e.mx" :y="e.my + 4" class="st-edge-label" text-anchor="middle">{{ e.count }}</text>
        </g>

        <g
          v-for="p in positionList"
          :key="p.status"
          class="st-node"
          :class="{ 'st-node--dim': nodeDim(p.status) }"
          @mouseenter="hovered = p.status"
          @mouseleave="hovered = null"
          @click="toggleHover(p.status)"
        >
          <rect
            :x="p.x - NODE_W / 2" :y="p.y - NODE_H / 2"
            :width="NODE_W" :height="NODE_H" rx="10"
            class="st-node-rect"
            :style="{ stroke: STATUS_META[p.status].color }"
          />
          <circle :cx="p.x - NODE_W / 2 + 14" :cy="p.y - NODE_H / 2 + 14" r="4" :fill="STATUS_META[p.status].color" />
          <text :x="p.x - NODE_W / 2 + 24" :y="p.y - NODE_H / 2 + 18" class="st-node-label">{{ STATUS_META[p.status].label }}</text>
          <text :x="p.x - NODE_W / 2 + 12" :y="p.y + 18" class="st-node-count">{{ p.total }}</text>
          <text v-if="p.current !== p.total" :x="p.x + NODE_W / 2 - 12" :y="p.y + 18" text-anchor="end" class="st-node-current">
            {{ p.current }} now
          </text>
        </g>
      </svg>
    </div>

    <div class="st-hover-label">
      <template v-if="hovered && nodesByStatus.get(hovered)">
        <span class="st-hover-dot" :style="{ background: STATUS_META[hovered].color }" />
        {{ STATUS_META[hovered].label }}:
        <strong>{{ nodesByStatus.get(hovered)!.total }}</strong> total
        <template v-if="nodesByStatus.get(hovered)!.current !== nodesByStatus.get(hovered)!.total">
          &nbsp;·&nbsp;<strong>{{ nodesByStatus.get(hovered)!.current }}</strong> currently here
        </template>
      </template>
      <template v-else>&nbsp;</template>
    </div>
  </div>
</template>

<style scoped>
.st-wrap {
  display: flex;
  flex-direction: column;
  /* Without these, a grid/flex ancestor sizes this item to fit the zoomed-in
     SVG's full content instead of respecting its own track/flex-basis size —
     the classic "min-width/height: auto" overflow gotcha. */
  min-width: 0;
  min-height: 0;
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: .75rem;
  padding: 1.25rem 1rem 1rem;
  box-shadow:
    0 1px 3px  color-mix(in srgb, var(--col-text) 6%, transparent),
    0 4px 16px color-mix(in srgb, var(--col-text) 9%, transparent);
}

.st-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: .75rem;
  flex-shrink: 0;
}
.st-title {
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--col-muted);
  margin: 0;
}
.st-total { font-size: .8125rem; color: var(--col-muted); }
.st-total strong { color: var(--col-text); font-weight: 700; }

.st-empty {
  flex: 1 1 auto;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--col-subtle);
  font-size: .875rem;
}

.st-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  touch-action: pan-x pan-y pinch-zoom;
}
.st-scroll svg { display: block; }

.st-node { cursor: default; transition: opacity .15s; }
.st-node--dim { opacity: .35; }
.st-node-rect { fill: var(--col-bg); stroke-width: 2; }
.st-node-label { font-size: 11px; font-weight: 600; fill: var(--col-text); }
.st-node-count { font-size: 15px; font-weight: 700; fill: var(--col-text); }
.st-node-current { font-size: 10.5px; font-weight: 600; fill: var(--col-muted); }

.st-edge--dim { opacity: .2; }
.st-edge-badge-bg { fill: var(--col-surface); stroke: var(--col-border); stroke-width: 1; }
.st-edge-label { font-size: 10px; font-weight: 600; fill: var(--col-muted); }

.st-hover-label {
  height: 1.375rem;
  flex-shrink: 0;
  margin-top: .5rem;
  font-size: .8rem;
  color: var(--col-muted);
  display: flex;
  align-items: center;
  gap: .375rem;
}
.st-hover-dot {
  display: inline-block;
  width: .5rem;
  height: .5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
