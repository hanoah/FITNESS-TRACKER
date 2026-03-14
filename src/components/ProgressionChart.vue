<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Bar } from 'rough-viz'

const props = defineProps<{
  data: { date: string; weight: number }[]
  title?: string
}>()

const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: { remove?: () => void } | null = null
let mounted = true
let renderSlot = 0

function doRender() {
  if (!mounted || !chartRef.value || props.data.length === 0) return

  const labels = props.data.map((d) => d.date)
  const values = props.data.map((d) => d.weight)

  try {
    if (chartInstance?.remove) chartInstance.remove()
  } catch {
    // ignore
  }

  chartInstance = new Bar({
    element: chartRef.value,
    data: { labels, values },
    title: props.title ?? 'Weight over time',
    width: Math.min(400, typeof window !== 'undefined' ? window.innerWidth - 80 : 400),
    height: 200,
    roughness: 1,
    color: 'blue',
  })
}

function renderChart() {
  if (!chartRef.value || props.data.length === 0) return
  const framesToWait = renderSlot++
  function waitThenRender(remaining: number) {
    requestAnimationFrame(() => {
      if (remaining <= 0) {
        doRender()
      } else {
        waitThenRender(remaining - 1)
      }
    })
  }
  requestAnimationFrame(() => waitThenRender(framesToWait))
}

onMounted(() => {
  if (props.data.length > 0) {
    renderChart()
  }
})

watch(
  () => [props.data, props.title],
  () => {
    if (props.data.length > 0) {
      renderChart()
    }
  },
  { deep: true }
)

onUnmounted(() => {
  mounted = false
  try {
    if (chartInstance?.remove) chartInstance.remove()
  } catch {
    // ignore
  }
  chartInstance = null
})
</script>

<template>
  <div class="progression-chart">
    <div v-if="data.length === 0" class="empty-state">
      <span>No history yet</span>
    </div>
    <div v-else ref="chartRef" class="chart-container" />
  </div>
</template>

<style scoped>
.progression-chart {
  min-height: 120px;
}
.empty-state {
  padding: 1.5rem;
  text-align: center;
  color: var(--r-color-text-secondary, #666);
  font-size: 0.95rem;
}
.chart-container {
  min-height: 200px;
}
.chart-container :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
