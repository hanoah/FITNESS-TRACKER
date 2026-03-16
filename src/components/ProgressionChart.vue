<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Bar } from 'rough-viz'

const props = defineProps<{
  data: { date: string; weight: number }[]
  title?: string
}>()

const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: { remove?: () => void } | null = null
let mounted = true
let renderSlot = 0
const chartError = ref<string | null>(null)

const hasEnoughData = computed(() => props.data.length >= 2)

function doRender() {
  if (!mounted || !chartRef.value || !hasEnoughData.value) return

  chartError.value = null
  const labels = props.data.map((d) => d.date)
  const values = props.data.map((d) => d.weight)

  try {
    if (chartInstance?.remove) chartInstance.remove()
  } catch {
    // ignore
  }

  const containerWidth = chartRef.value.clientWidth || 320
  const chartWidth = Math.min(containerWidth, 400)

  const chartId = 'progression-chart-' + Math.random().toString(36).slice(2, 9)
  chartRef.value.id = chartId
  chartRef.value.style.width = chartWidth + 'px'
  chartRef.value.style.height = '200px'

  try {
    chartInstance = new Bar({
      element: '#' + chartId,
      data: { labels, values },
      title: props.title ?? 'Weight over time',
      roughness: 2,
      color: '#c45c26',
    })
  } catch (e) {
    console.warn('[ProgressionChart] Bar render failed', e)
    chartError.value = 'Chart unavailable'
  }
}

function renderChart() {
  if (!chartRef.value || !hasEnoughData.value) return
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
  if (hasEnoughData.value) {
    renderChart()
  }
})

watch(
  () => [props.data, props.title],
  () => {
    if (hasEnoughData.value) {
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
  <div v-if="hasEnoughData" class="progression-chart">
    <div v-if="chartError" class="chart-fallback">{{ chartError }}</div>
    <div v-else ref="chartRef" class="chart-container" />
  </div>
</template>

<style scoped>
.progression-chart {
  margin-top: 0.5rem;
  overflow: hidden;
}
.chart-fallback {
  padding: var(--space-lg);
  color: var(--r-color-text-secondary);
  font-size: 0.9rem;
}
.chart-container {
  overflow: hidden;
  max-height: 200px;
}
.chart-container :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
