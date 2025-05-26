export const CANVAS_CONFIG = {
  ANTIALIAS: false,
  RESOLUTION: 1,
} as const

export const CLOUD_CONFIG = {
  MIN_CLOUDS: 5,
  MAX_CLOUDS: 10,
  MIN_SCALE: 0.3,
  MAX_SCALE: 2.0,
  SPEED_MIN: 0.01,
  SPEED_MAX: 3,
  FADE_SPEED: 0.02,
  RESPAWN_MARGIN: 400,
  SPAWN_INTERVAL_MIN: 0,
  SPAWN_INTERVAL_MAX: 5000,
} as const

export const DEPTH_CONFIG = {
  DEFAULT_LAYERS: 30,
  MIN_LAYERS: 3,
  MAX_LAYERS: 50,
  SLICE_OVERLAP_FACTOR: 0.3,
  CONSTRAINED_CLOUD_PERCENTAGE: 0.75,
} as const

export const generateDepthLayers = (numLayers: number) => {
  const layers: Record<
    string,
    {
      depth: number
      speedMultiplier: number
      scaleRange: { min: number; max: number }
      alphaRange: { min: number; max: number }
      yRange: { min: number; max: number }
      constrainedYRange: { min: number; max: number }
      constrainedPercentage: number
    }
  > = {}

  const totalVerticalSpace = 0.5 // Bottom 50% of viewport
  const sliceHeight = totalVerticalSpace / numLayers
  const overlapAmount = sliceHeight * DEPTH_CONFIG.SLICE_OVERLAP_FACTOR

  for (let i = 0; i < numLayers; i++) {
    const depth = i / (numLayers - 1)
    const layerKey = `LAYER_${i}`

    // Calculate the primary slice for this layer
    const sliceStart = 0.5 + i * sliceHeight
    const sliceEnd = Math.min(1.0, sliceStart + sliceHeight)

    // Constrained range (most clouds will be in this slice)
    const constrainedStart = Math.max(0.5, sliceStart - overlapAmount * 0.5)
    const constrainedEnd = Math.min(1.0, sliceEnd + overlapAmount * 0.5)

    // Full range (for the remaining clouds that can overlap more)
    const fullStart = 0.5 + depth * 0.25
    const fullEnd = 0.75 + depth * 0.25

    layers[layerKey] = {
      depth,
      speedMultiplier: 0.1 + depth * 1.4,
      scaleRange: {
        min: 0.3 + depth * 0.5,
        max: 0.6 + depth * 1.0,
      },
      alphaRange: {
        min: 0.2 + depth * 0.5,
        max: 0.4 + depth * 0.6,
      },
      yRange: {
        min: fullStart,
        max: fullEnd,
      },
      constrainedYRange: {
        min: constrainedStart,
        max: constrainedEnd,
      },
      constrainedPercentage: DEPTH_CONFIG.CONSTRAINED_CLOUD_PERCENTAGE,
    }
  }

  return layers
}
