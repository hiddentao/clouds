export const CANVAS_CONFIG = {
  ANTIALIAS: false,
  RESOLUTION: 1,
} as const

export const CLOUD_CONFIG = {
  MIN_CLOUDS: 20,
  MAX_CLOUDS: 50,
  MIN_SCALE: 0.3,
  MAX_SCALE: 2.0,
  SPEED_MIN: 0.01,
  SPEED_MAX: 3,
  FADE_SPEED: 0.02,
  RESPAWN_MARGIN: 400,
} as const

export const DEPTH_CONFIG = {
  DEFAULT_LAYERS: 10,
  MIN_LAYERS: 5,
  MAX_LAYERS: 30,
  SLICE_OVERLAP_FACTOR: 0.3,
  CONSTRAINED_CLOUD_PERCENTAGE: 0.75,
  DEPTH_MULTIPLIER_BASE: 0.6, // base multiplier for layer distribution
  DEPTH_MULTIPLIER_RANGE: 0.4, // range multiplier for layer distribution
} as const

export const SUN_CONFIG = {
  UPDATE_INTERVAL: 60000, // milliseconds between sun position updates
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

  // Total vertical space from 50% (rear) to 100% (front) of viewport
  const totalVerticalSpace = 0.5 // From 0.5 to 1.0 (50% of viewport height)
  const sliceHeight = totalVerticalSpace / numLayers
  const overlapAmount = sliceHeight * DEPTH_CONFIG.SLICE_OVERLAP_FACTOR

  for (let i = 0; i < numLayers; i++) {
    const depth = i / (numLayers - 1)
    const layerKey = `LAYER_${i}`

    // Calculate the primary slice for this layer
    // Layer 0 (depth=0, furthest/rear) starts at Y=0.5 (50% of screen)
    // Layer N-1 (depth=1, closest/front) starts at Y=1.0 (bottom of screen)
    const sliceStart = 0.5 + i * sliceHeight
    const sliceEnd = Math.min(1.0, sliceStart + sliceHeight)

    // Constrained range (most clouds will be in this slice)
    const constrainedStart = Math.max(0.5, sliceStart - overlapAmount * 0.3)
    const constrainedEnd = Math.min(1.0, sliceEnd + overlapAmount * 0.3)

    // Full range (for clouds that can overlap between layers)
    // Allow some variation but keep the general layering
    const fullStart = Math.max(0.45, sliceStart - overlapAmount * 0.8)
    const fullEnd = Math.min(1.05, sliceEnd + overlapAmount * 0.8) // Allow slight overflow below viewport

    // Reverse scale logic: front layers (depth=1) have smaller clouds, back layers (depth=0) have larger clouds
    const inverseDepth = 1 - depth // 1 for back layers, 0 for front layers

    layers[layerKey] = {
      depth,
      speedMultiplier: 0.1 + depth * 1.4,
      scaleRange: {
        min: 0.4 + inverseDepth * 0.6, // Front: 0.4-0.5, Back: 1.0-1.1
        max: 0.5 + inverseDepth * 0.6, // Front: 0.5, Back: 1.1
      },
      alphaRange: {
        min: 0.3 + depth * 0.4, // Front: 0.7, Back: 0.3
        max: 0.5 + depth * 0.4, // Front: 0.9, Back: 0.5
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
