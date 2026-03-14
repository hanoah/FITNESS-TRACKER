/**
 * Barbell plate math: given total weight and bar weight, return plate configuration.
 * Default bar: 45 lb.
 * Assumes standard plates: 45, 25, 10, 5, 2.5, 1.25 (each side).
 */

export const DEFAULT_BAR_WEIGHT = 45

const PLATE_WEIGHTS = [45, 25, 10, 5, 2.5, 1.25] as const

export interface PlateConfig {
  plates: { weight: number; count: number }[]
  perSide: { weight: number; count: number }[]
  totalWeight: number
  barWeight: number
}

export function plateCalc(
  totalWeight: number,
  barWeight: number = DEFAULT_BAR_WEIGHT
): PlateConfig {
  if (totalWeight < 0 || !Number.isFinite(totalWeight)) {
    throw new Error('Weight must be a positive number')
  }
  if (totalWeight < barWeight) {
    throw new Error(`Weight ${totalWeight} is less than bar (${barWeight})`)
  }

  const loadPerSide = (totalWeight - barWeight) / 2
  if (loadPerSide < 0) {
    return {
      plates: [],
      perSide: [],
      totalWeight,
      barWeight,
    }
  }

  const perSide: { weight: number; count: number }[] = []
  let remaining = loadPerSide

  for (const plate of PLATE_WEIGHTS) {
    if (remaining <= 0) break
    const count = Math.floor(remaining / plate)
    if (count > 0) {
      perSide.push({ weight: plate, count })
      remaining = Math.round((remaining - count * plate) * 100) / 100
    }
  }

  // Aggregate for full barbell (each plate counts x2)
  const plates = perSide.map(({ weight, count }) => ({
    weight,
    count: count * 2,
  }))

  return {
    plates,
    perSide,
    totalWeight,
    barWeight,
  }
}
