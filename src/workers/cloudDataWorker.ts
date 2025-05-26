import * as Comlink from 'comlink'
import { CLOUD_CONFIG, generateDepthLayers } from '../constants'
import type { CloudFragmentData, SkyGradient } from '../types'
import { PerlinNoise } from '../utils/perlinNoise'

// Define the structure for individual pixel data calculated by the worker
export interface PixelProperty {
  nx: number
  ny: number
  density: number
  isEdge: boolean
  edgeDistance: number
  shadowFactor: number
  brightness: number
  alpha: number
  color: number // Initial color calculated by worker if skyGradient is provided
  pixelX: number
  pixelY: number
  pixelSize: number
  depth: number // Add depth for depth-based lighting calculations
}

// Define the output structure of the worker
export interface FullCloudData {
  fragmentData: CloudFragmentData
  pixelProperties: PixelProperty[]
}

// --- Helper Functions (Internal to Worker) ---

function _simpleRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function _calculatePixelColorLogic(
  pixelInfo: {
    density: number
    isEdge: boolean
    edgeDistance: number
    shadowFactor: number
    brightness: number
    alpha?: number
    depth?: number // Add depth parameter for depth-based lighting
    depthDarkeningFactor?: number // Pre-calculated depth factor to avoid recalculation
    isDaytime?: boolean // Pre-calculated to avoid repeated checks
  }, // alpha is optional as it's not used for color calculation itself
  skyGradient: SkyGradient | null,
): number {
  const { brightness, shadowFactor, depth, depthDarkeningFactor, isDaytime } = pixelInfo

  if (skyGradient) {
    // Use pre-calculated values if available, otherwise calculate
    const isCurrentlyDaytime =
      isDaytime !== undefined
        ? isDaytime
        : skyGradient.cloudBaseColor[0] > 0.8 &&
          skyGradient.cloudBaseColor[1] > 0.8 &&
          skyGradient.cloudBaseColor[2] > 0.8

    // Use the pre-calculated cloud colors from the sky gradient
    const baseColor = skyGradient.cloudBaseColor
    const highlightColor = skyGradient.cloudHighlightColor
    const shadowColor = skyGradient.cloudShadowColor

    // Apply depth-based lighting for daytime only
    let depthAdjustedShadowFactor = shadowFactor
    let depthAdjustedBaseColor = baseColor

    if (isCurrentlyDaytime && (depthDarkeningFactor !== undefined || depth !== undefined)) {
      // Use pre-calculated factor if available, otherwise calculate
      const darkeningFactor =
        depthDarkeningFactor !== undefined
          ? depthDarkeningFactor
          : depth !== undefined
            ? 1.0 - depth * 0.4
            : 1.0

      // Apply depth darkening to the base color
      depthAdjustedBaseColor = [
        baseColor[0] * darkeningFactor,
        baseColor[1] * darkeningFactor,
        baseColor[2] * darkeningFactor,
      ]

      // Also reduce the shadow factor slightly for closer clouds to enhance the depth effect
      const depthShadowMultiplier = depth !== undefined ? 0.8 + depth * 0.2 : 1.0
      depthAdjustedShadowFactor = shadowFactor * depthShadowMultiplier
    }

    // Determine which color to use based on shadow factor
    let finalColor: [number, number, number]

    if (depthAdjustedShadowFactor > 0.7) {
      // Lit areas: interpolate between base and highlight colors
      const highlightMix = (depthAdjustedShadowFactor - 0.7) / 0.3 // 0 to 1 for shadowFactor 0.7 to 1.0
      finalColor = [
        depthAdjustedBaseColor[0] + (highlightColor[0] - depthAdjustedBaseColor[0]) * highlightMix,
        depthAdjustedBaseColor[1] + (highlightColor[1] - depthAdjustedBaseColor[1]) * highlightMix,
        depthAdjustedBaseColor[2] + (highlightColor[2] - depthAdjustedBaseColor[2]) * highlightMix,
      ]
    } else {
      // Shadow areas: interpolate between shadow and base colors
      const shadowMix = depthAdjustedShadowFactor / 0.7 // 0 to 1 for shadowFactor 0.0 to 0.7
      finalColor = [
        shadowColor[0] + (depthAdjustedBaseColor[0] - shadowColor[0]) * shadowMix,
        shadowColor[1] + (depthAdjustedBaseColor[1] - shadowColor[1]) * shadowMix,
        shadowColor[2] + (depthAdjustedBaseColor[2] - shadowColor[2]) * shadowMix,
      ]
    }

    // Apply subtle brightness variation
    const brightnessVariation = 0.85 + brightness * 0.15
    finalColor = [
      Math.min(1.0, finalColor[0] * brightnessVariation),
      Math.min(1.0, finalColor[1] * brightnessVariation),
      Math.min(1.0, finalColor[2] * brightnessVariation),
    ]

    const r = Math.round(Math.min(255, finalColor[0] * 255))
    const g = Math.round(Math.min(255, finalColor[1] * 255))
    const b = Math.round(Math.min(255, finalColor[2] * 255))
    return (r << 16) | (g << 8) | b
  }

  // Fallback to grayscale if no sky gradient
  const gray = Math.floor(brightness * 255)
  return (gray << 16) | (gray << 8) | gray
}

function _getBaseYForDepthLayer(layerConfig: any, screenHeight: number, seed: number): number {
  const shouldConstrain = _simpleRandom(seed) < layerConfig.constrainedPercentage
  let yMin: number
  let yMax: number
  if (shouldConstrain) {
    yMin = screenHeight * layerConfig.constrainedYRange.min
    yMax = screenHeight * layerConfig.constrainedYRange.max
  } else {
    yMin = screenHeight * layerConfig.yRange.min
    yMax = screenHeight * layerConfig.yRange.max
  }
  return yMin + _simpleRandom(seed + 1) * (yMax - yMin)
}

type CloudTypeKey = 'wispy' | 'puffy' | 'dense' | 'scattered' | 'default'
const SIZE_RANGES: Record<
  CloudTypeKey,
  { w: { min: number; max: number }; h: { min: number; max: number } }
> = {
  wispy: { w: { min: 400, max: 800 }, h: { min: 100, max: 200 } },
  scattered: { w: { min: 350, max: 700 }, h: { min: 150, max: 280 } },
  puffy: { w: { min: 500, max: 1200 }, h: { min: 200, max: 450 } },
  dense: { w: { min: 600, max: 1400 }, h: { min: 250, max: 500 } },
  default: { w: { min: 400, max: 900 }, h: { min: 180, max: 350 } },
}
const SPEED_RANGES: Record<CloudTypeKey, { min: number; max: number }> = {
  wispy: { min: 0.8, max: 1.5 },
  scattered: { min: 0.6, max: 1.2 },
  puffy: { min: 0.2, max: 0.6 },
  dense: { min: 0.3, max: 0.8 },
  default: { min: 0.3, max: 0.8 },
}

function _getDensityForType(type: CloudTypeKey, seed: number): number {
  switch (type) {
    case 'wispy':
      return 0.4 + _simpleRandom(seed) * 0.4
    case 'scattered':
      return 0.5 + _simpleRandom(seed) * 0.4
    case 'puffy':
      return 0.7 + _simpleRandom(seed) * 0.3
    default:
      return 0.6 + _simpleRandom(seed) * 0.3
  }
}

function _getLayersForType(type: CloudTypeKey, seed: number): number {
  switch (type) {
    case 'wispy':
      return 1 + Math.floor(_simpleRandom(seed) * 2)
    case 'scattered':
      return 2 + Math.floor(_simpleRandom(seed) * 2)
    case 'puffy':
      return 3 + Math.floor(_simpleRandom(seed) * 3)
    default:
      return 2 + Math.floor(_simpleRandom(seed) * 3)
  }
}

function _calculateCloudDensity(
  nxLocal: number,
  nyLocal: number,
  fragmentData: CloudFragmentData,
  pNoise: PerlinNoise,
): number {
  // Create organic base shape instead of geometric semi-oval
  const centerDistance = Math.sqrt(nxLocal * nxLocal + nyLocal * nyLocal)

  // Apply organic vertical compression with noise variation
  const baseCompressionFactor = nyLocal < 0 ? 1.2 : 0.9
  const compressionNoise = pNoise.noise(
    nxLocal * 2.0 + fragmentData.noiseOffset * 0.01,
    nyLocal * 2.0 + fragmentData.noiseOffset * 0.01,
  )
  const verticalCompressionFactor = baseCompressionFactor + compressionNoise * 0.3
  const adjustedNy = nyLocal * verticalCompressionFactor
  const adjustedDistance = Math.sqrt(nxLocal * nxLocal + adjustedNy * adjustedNy)

  // Create organic base cloud shape with noise-driven boundaries
  const baseShapeNoise = pNoise.noise(
    nxLocal * 1.5 + fragmentData.noiseOffset * 0.008,
    nyLocal * 1.5 + fragmentData.noiseOffset * 0.008,
  )
  let baseDensity = Math.max(0, 1.0 - adjustedDistance * (0.6 + baseShapeNoise * 0.2))

  // Add multiple layers of organic noise to eliminate any straight edges
  const organicNoise1 = pNoise.noise(
    nxLocal * 3.5 + fragmentData.noiseOffset * 0.012,
    nyLocal * 3.5 + fragmentData.noiseOffset * 0.012,
  )
  const organicNoise2 = pNoise.noise(
    nxLocal * 7.0 + fragmentData.noiseOffset * 0.018,
    nyLocal * 7.0 + fragmentData.noiseOffset * 0.018,
  )
  const organicNoise3 = pNoise.noise(
    nxLocal * 14.0 + fragmentData.noiseOffset * 0.025,
    nyLocal * 14.0 + fragmentData.noiseOffset * 0.025,
  )

  // Apply organic noise layers with decreasing influence
  baseDensity *= 0.7 + organicNoise1 * 0.25
  baseDensity *= 0.8 + organicNoise2 * 0.15
  baseDensity *= 0.9 + organicNoise3 * 0.1

  // Add aggressive bottom edge variation for realistic cloud bottoms
  if (nyLocal > 0) {
    // Bottom half of cloud
    // Multiple noise layers for complex bottom variation
    const bottomVariationNoise1 = pNoise.noise(
      nxLocal * 6.0 + fragmentData.noiseOffset * 0.02,
      nyLocal * 3.0 + fragmentData.noiseOffset * 0.015,
    )
    const bottomVariationNoise2 = pNoise.noise(
      nxLocal * 12.0 + fragmentData.noiseOffset * 0.03,
      nyLocal * 6.0 + fragmentData.noiseOffset * 0.025,
    )
    const bottomDetailNoise = pNoise.noise(
      nxLocal * 20.0 + fragmentData.noiseOffset * 0.04,
      nyLocal * 10.0 + fragmentData.noiseOffset * 0.035,
    )

    // Create complex irregular bottom boundary
    const horizontalExtent = Math.abs(nxLocal)
    const bottomIrregularity =
      (bottomVariationNoise1 * 0.4 + bottomVariationNoise2 * 0.25 + bottomDetailNoise * 0.15) *
      (1.0 + horizontalExtent * 0.3)

    // Apply the irregularity to create varied bottoms
    baseDensity *= 0.5 + bottomIrregularity * 0.8

    // Add rotational noise to break up any remaining linear patterns
    const angle = Math.atan2(nyLocal, nxLocal)
    const rotationalNoise = pNoise.noise(
      Math.cos(angle * 5) * 8.0 + fragmentData.noiseOffset * 0.03,
      Math.sin(angle * 5) * 8.0 + fragmentData.noiseOffset * 0.03,
    )
    baseDensity *= 0.7 + rotationalNoise * 0.5
  }

  // Keep tops relatively flat but with organic variation
  if (nyLocal < 0) {
    const topOrganicNoise = pNoise.noise(
      nxLocal * 4.0 + fragmentData.noiseOffset * 0.015,
      nyLocal * 2.0 + fragmentData.noiseOffset * 0.01,
    )
    const topUniformityFactor = 1.0 - Math.abs(nyLocal) * 0.1 + topOrganicNoise * 0.05
    baseDensity *= Math.max(0.3, topUniformityFactor)
  }

  // Add primary noise layer for overall organic shape
  const primaryScale = 3.0 + fragmentData.shapeComplexity * 2.0
  const primaryNoise = pNoise.noise(
    nxLocal * primaryScale + fragmentData.noiseOffset * 0.01,
    nyLocal * primaryScale + fragmentData.noiseOffset * 0.01,
  )
  baseDensity *= 0.6 + (primaryNoise + 1) * 0.2 // Wider range for more variation

  // Add secondary detail layer with different frequency
  const detailScale = primaryScale * 2.5
  const detailNoise = pNoise.noise(
    nxLocal * detailScale + fragmentData.noiseOffset * 0.022,
    nyLocal * detailScale + fragmentData.noiseOffset * 0.022,
  )
  baseDensity += detailNoise * 0.12 // Slightly more detail

  // Apply type-specific modifications with organic considerations
  switch (fragmentData.type) {
    case 'wispy': {
      // Enhance organic streaking patterns
      const wispyNoise1 = pNoise.noise(nxLocal * 8.0, nyLocal * 2.0)
      const wispyNoise2 = pNoise.noise(nxLocal * 4.0, nyLocal * 6.0)
      const horizontalFactor = 1.0 + wispyNoise1 * 0.5
      const verticalFactor = 0.6 + wispyNoise2 * 0.4

      const wispyTopFactor = nyLocal < 0 ? 1.0 - Math.abs(nyLocal) * 0.3 : 1.0
      baseDensity *= horizontalFactor * verticalFactor * wispyTopFactor

      // Add extra organic bottom variation for wispy clouds
      if (nyLocal > 0) {
        const wispyBottomNoise = pNoise.noise(
          nxLocal * 15.0 + fragmentData.noiseOffset * 0.04,
          nyLocal * 8.0 + fragmentData.noiseOffset * 0.03,
        )
        baseDensity *= 0.4 + wispyBottomNoise * 0.8
      }
      break
    }

    case 'puffy': {
      // Enhance organic rounded characteristics
      const puffyNoise = pNoise.noise(
        nxLocal * 5.0 + fragmentData.noiseOffset * 0.02,
        nyLocal * 5.0 + fragmentData.noiseOffset * 0.02,
      )
      const puffiness = Math.max(0, 1.0 - centerDistance * (0.4 + puffyNoise * 0.2)) ** 0.8

      const puffyTopFactor = nyLocal < 0 ? 1.0 - Math.abs(nyLocal) * 0.15 : 1.0
      baseDensity *= (0.7 + puffiness * 0.4) * puffyTopFactor

      // Add organic puffy bottom variations
      if (nyLocal > 0) {
        const puffyBottomNoise1 = pNoise.noise(nxLocal * 9.0, nyLocal * 7.0)
        const puffyBottomNoise2 = pNoise.noise(nxLocal * 18.0, nyLocal * 14.0)
        baseDensity *= 0.5 + puffyBottomNoise1 * 0.4 + puffyBottomNoise2 * 0.2
      }
      break
    }

    case 'dense': {
      // More solid structure with organic edges
      const denseNoise = pNoise.noise(
        nxLocal * 3.0 + fragmentData.noiseOffset * 0.015,
        nyLocal * 3.0 + fragmentData.noiseOffset * 0.015,
      )
      const solidness = Math.max(0, 1.0 - centerDistance * (0.5 + denseNoise * 0.1)) ** 0.6

      const denseTopFactor = nyLocal < 0 ? 1.0 - Math.abs(nyLocal) * 0.1 : 1.0
      baseDensity *= (0.8 + solidness * 0.3) * denseTopFactor

      // Even dense clouds need organic irregular bottoms
      if (nyLocal > 0) {
        const denseBottomNoise = pNoise.noise(
          nxLocal * 8.0 + fragmentData.noiseOffset * 0.025,
          nyLocal * 6.0 + fragmentData.noiseOffset * 0.02,
        )
        baseDensity *= 0.6 + denseBottomNoise * 0.6
      }
      break
    }

    case 'scattered': {
      // Create organic gaps and variations
      const scatteredNoise1 = pNoise.noise(
        nxLocal * 6.0 + fragmentData.noiseOffset * 0.02,
        nyLocal * 6.0 + fragmentData.noiseOffset * 0.02,
      )
      const scatteredNoise2 = pNoise.noise(
        nxLocal * 12.0 + fragmentData.noiseOffset * 0.035,
        nyLocal * 12.0 + fragmentData.noiseOffset * 0.035,
      )

      // Create organic gaps based on noise
      if (scatteredNoise1 < -0.3 || scatteredNoise2 < -0.4) {
        baseDensity *= 0.2 // Create organic gaps
      }

      const scatteredTopFactor = nyLocal < 0 ? 1.0 - Math.abs(nyLocal) * 0.2 : 1.0
      baseDensity *= scatteredTopFactor
      break
    }
  }

  // Apply organic edge erosion to eliminate any remaining straight edges
  const edgeNoise1 = pNoise.noise(
    nxLocal * 10.0 + fragmentData.noiseOffset * 0.035,
    nyLocal * 10.0 + fragmentData.noiseOffset * 0.035,
  )
  const edgeNoise2 = pNoise.noise(
    nxLocal * 16.0 + fragmentData.noiseOffset * 0.045,
    nyLocal * 16.0 + fragmentData.noiseOffset * 0.045,
  )

  if (adjustedDistance > 0.5) {
    // Apply organic erosion to all edges
    const edgeFactor = 1.0 - (adjustedDistance - 0.5) / 0.5
    const organicEdgeFactor = edgeFactor * (0.7 + edgeNoise1 * 0.25 + edgeNoise2 * 0.15)
    baseDensity *= Math.max(0.1, organicEdgeFactor)
  }

  return Math.max(0, Math.min(1, baseDensity * fragmentData.density))
}

function _calculateOrganicBoundary(
  nxLocal: number,
  nyLocal: number,
  fragmentData: CloudFragmentData,
  pNoise: PerlinNoise,
): number {
  // Apply organic vertical compression with noise variation
  const baseCompressionFactor = nyLocal < 0 ? 1.2 : 0.9
  const compressionNoise = pNoise.noise(
    nxLocal * 2.0 + fragmentData.noiseOffset * 0.01,
    nyLocal * 2.0 + fragmentData.noiseOffset * 0.01,
  )
  const verticalCompressionFactor = baseCompressionFactor + compressionNoise * 0.2
  const adjustedNy = nyLocal * verticalCompressionFactor

  // Start with organic base boundary
  const baseBoundaryNoise = pNoise.noise(
    nxLocal * 1.8 + fragmentData.noiseOffset * 0.01,
    nyLocal * 1.8 + fragmentData.noiseOffset * 0.01,
  )
  let boundary = 1.0 + baseBoundaryNoise * 0.15

  // Add multiple layers of organic noise for completely curved edges
  const organicNoise1 = pNoise.noise(
    nxLocal * 4.0 + fragmentData.noiseOffset * 0.015,
    nyLocal * 4.0 + fragmentData.noiseOffset * 0.015,
  )
  boundary += organicNoise1 * 0.25

  const organicNoise2 = pNoise.noise(
    nxLocal * 8.0 + fragmentData.noiseOffset * 0.025,
    nyLocal * 8.0 + fragmentData.noiseOffset * 0.025,
  )
  boundary += organicNoise2 * 0.15

  const organicNoise3 = pNoise.noise(
    nxLocal * 16.0 + fragmentData.noiseOffset * 0.035,
    nyLocal * 16.0 + fragmentData.noiseOffset * 0.035,
  )
  boundary += organicNoise3 * 0.08

  // Add rotational noise to break up any linear patterns
  const angle = Math.atan2(adjustedNy, nxLocal)
  const rotationalNoise1 = pNoise.noise(
    Math.cos(angle * 3) * 6.0 + fragmentData.noiseOffset * 0.02,
    Math.sin(angle * 3) * 6.0 + fragmentData.noiseOffset * 0.02,
  )
  const rotationalNoise2 = pNoise.noise(
    Math.cos(angle * 7) * 10.0 + fragmentData.noiseOffset * 0.03,
    Math.sin(angle * 7) * 10.0 + fragmentData.noiseOffset * 0.03,
  )
  boundary += rotationalNoise1 * 0.12 + rotationalNoise2 * 0.08

  // Add spiral noise to create completely organic curves
  const spiralAngle = angle + Math.sqrt(nxLocal * nxLocal + nyLocal * nyLocal) * 2.0
  const spiralNoise = pNoise.noise(
    Math.cos(spiralAngle) * 8.0 + fragmentData.noiseOffset * 0.025,
    Math.sin(spiralAngle) * 8.0 + fragmentData.noiseOffset * 0.025,
  )
  boundary += spiralNoise * 0.1

  // Add additional bottom edge variation for realistic cloud bottoms
  if (nyLocal > 0) {
    // Bottom half of cloud
    const bottomEdgeNoise1 = pNoise.noise(
      nxLocal * 10.0 + fragmentData.noiseOffset * 0.03,
      nyLocal * 4.0 + fragmentData.noiseOffset * 0.02,
    )
    const bottomEdgeNoise2 = pNoise.noise(
      nxLocal * 20.0 + fragmentData.noiseOffset * 0.045,
      nyLocal * 8.0 + fragmentData.noiseOffset * 0.035,
    )
    boundary += bottomEdgeNoise1 * 0.18 + bottomEdgeNoise2 * 0.1

    // Add turbulent bottom variation
    const turbulentNoise = pNoise.noise(
      nxLocal * 15.0 + fragmentData.noiseOffset * 0.04,
      nyLocal * 12.0 + fragmentData.noiseOffset * 0.038,
    )
    boundary += turbulentNoise * 0.12
  }

  // Keep top boundary more uniform but still organic
  if (nyLocal < 0) {
    const topOrganicNoise1 = pNoise.noise(
      nxLocal * 5.0 + fragmentData.noiseOffset * 0.018,
      nyLocal * 3.0 + fragmentData.noiseOffset * 0.012,
    )
    const topOrganicNoise2 = pNoise.noise(
      nxLocal * 12.0 + fragmentData.noiseOffset * 0.03,
      nyLocal * 6.0 + fragmentData.noiseOffset * 0.025,
    )

    // Reduce but don't eliminate top variation
    const topVariation =
      (topOrganicNoise1 * 0.08 + topOrganicNoise2 * 0.05) * (1.0 - Math.abs(nyLocal) * 0.3)
    boundary += topVariation
  }

  // Apply organic edge softness
  const softnessFactor = 1.0 - fragmentData.edgeSoftness * 0.15
  boundary *= softnessFactor

  // Add final micro-variations for completely organic edges
  const microNoise1 = pNoise.noise(
    nxLocal * 25.0 + fragmentData.noiseOffset * 0.05,
    nyLocal * 25.0 + fragmentData.noiseOffset * 0.05,
  )
  const microNoise2 = pNoise.noise(
    nxLocal * 35.0 + fragmentData.noiseOffset * 0.06,
    nyLocal * 35.0 + fragmentData.noiseOffset * 0.06,
  )
  boundary += microNoise1 * 0.04 + microNoise2 * 0.03

  // Add fractal-like noise for natural complexity
  const fractalNoise = pNoise.noise(
    nxLocal * 18.0 + fragmentData.noiseOffset * 0.042,
    nyLocal * 18.0 + fragmentData.noiseOffset * 0.042,
  )
  boundary += fractalNoise * 0.06

  return Math.max(0.4, Math.min(1.6, boundary))
}

// --- Comlink Exposed Object ---
const cloudDataGenerator = {
  generateFullCloudData(
    screenWidth: number,
    screenHeight: number,
    depthLayersInput?: Record<string, any>,
    initialSkyGradient?: SkyGradient | null,
  ): FullCloudData {
    const seedBase = Date.now() + _simpleRandom(Math.random() * 1000) * 10000 // Base seed for this cloud

    // Select cloud type based on time of day
    let type: 'wispy' | 'puffy' | 'dense' | 'scattered'
    const randomValue = _simpleRandom(seedBase)

    // Determine if this is daytime based on sky gradient (if available)
    const isDaytimeForCloudType = initialSkyGradient?.cloudBaseColor
      ? initialSkyGradient.cloudBaseColor[0] > 0.8 &&
        initialSkyGradient.cloudBaseColor[1] > 0.8 &&
        initialSkyGradient.cloudBaseColor[2] > 0.8
      : false

    if (isDaytimeForCloudType) {
      // Daytime: favor puffy and dense clouds (70% chance)
      if (randomValue < 0.4) {
        type = 'puffy'
      } else if (randomValue < 0.7) {
        type = 'dense'
      } else if (randomValue < 0.85) {
        type = 'scattered'
      } else {
        type = 'wispy'
      }
    } else {
      // Nighttime: favor wispy and scattered clouds (70% chance)
      if (randomValue < 0.4) {
        type = 'wispy'
      } else if (randomValue < 0.7) {
        type = 'scattered'
      } else if (randomValue < 0.85) {
        type = 'puffy'
      } else {
        type = 'dense'
      }
    }

    const currentTypeKey = type as CloudTypeKey

    const depthLayers = depthLayersInput || generateDepthLayers(30)
    const layerKeys = Object.keys(depthLayers)
    const noiseOffsetForLayerSelection = _simpleRandom(seedBase + 1) * 10000
    const depthLayer =
      layerKeys[Math.floor(_simpleRandom(noiseOffsetForLayerSelection) * layerKeys.length)]
    const layerConfig = depthLayers[depthLayer] as any

    const sizeRange = SIZE_RANGES[currentTypeKey] || SIZE_RANGES.default
    const speedRange = SPEED_RANGES[currentTypeKey] || SPEED_RANGES.default
    const cloudDensityValue = _getDensityForType(currentTypeKey, seedBase + 2)
    const numLayersForType = _getLayersForType(currentTypeKey, seedBase + 3)

    const noiseOffset = _simpleRandom(seedBase + 4) * 10000
    const perlin = new PerlinNoise(noiseOffset)

    const baseY = _getBaseYForDepthLayer(layerConfig, screenHeight, seedBase + 5)
    const scale =
      layerConfig.scaleRange.min +
      _simpleRandom(noiseOffset + 1) * (layerConfig.scaleRange.max - layerConfig.scaleRange.min)
    const alpha =
      layerConfig.alphaRange.min +
      _simpleRandom(noiseOffset + 2) * (layerConfig.alphaRange.max - layerConfig.alphaRange.min)

    const fragmentData: CloudFragmentData = {
      x: screenWidth + CLOUD_CONFIG.RESPAWN_MARGIN,
      y: baseY + (_simpleRandom(noiseOffset + 3) - 0.5) * screenHeight * 0.1,
      width:
        (sizeRange.w.min + _simpleRandom(noiseOffset + 4) * (sizeRange.w.max - sizeRange.w.min)) *
        scale,
      height:
        (sizeRange.h.min + _simpleRandom(noiseOffset + 5) * (sizeRange.h.max - sizeRange.h.min)) *
        scale,
      speed:
        (speedRange.min + _simpleRandom(noiseOffset + 6) * (speedRange.max - speedRange.min)) *
        layerConfig.speedMultiplier,
      alpha: alpha * cloudDensityValue,
      fadeDirection: 1,
      noiseOffset,
      density: cloudDensityValue,
      type,
      layers: numLayersForType,
      turbulence: _simpleRandom(noiseOffset + 7) * 0.8,
      shapeComplexity: _simpleRandom(noiseOffset + 8) * 1.0 + 0.1,
      edgeSoftness: _simpleRandom(noiseOffset + 9) * 0.2 + 0.05,
      rotation: 0,
      rotationSpeed: 0,
      depth: layerConfig.depth,
      depthLayer,
      scale,
      speedMultiplier: layerConfig.speedMultiplier,
    }

    const pixelProperties: PixelProperty[] = []
    const pixelSize = 10 // Increased from 8 to 10 for better performance
    const gridWidth = Math.ceil(fragmentData.width / pixelSize)
    const gridHeight = Math.ceil(fragmentData.height / pixelSize)

    // Limit grid size to prevent OOM during initial generation
    const MAX_GRID_SIZE = 80 // Reduced from 100 to 80 for better performance
    const actualGridWidth = Math.min(gridWidth, MAX_GRID_SIZE)
    const actualGridHeight = Math.min(gridHeight, MAX_GRID_SIZE)

    // Adjust pixel size if we had to limit the grid
    const adjustedPixelSizeX = fragmentData.width / actualGridWidth
    const adjustedPixelSizeY = fragmentData.height / actualGridHeight
    const adjustedPixelSize = Math.max(adjustedPixelSizeX, adjustedPixelSizeY)

    // Use dynamic light direction from sky gradient, fallback to default
    const lightDir = initialSkyGradient?.lightDirection || { x: -0.2, y: -0.8 }
    const centerX = fragmentData.width / 2
    const centerY = fragmentData.height / 2

    // Pre-calculate common values for performance
    const isDaytime = initialSkyGradient
      ? initialSkyGradient.cloudBaseColor[0] > 0.8 &&
        initialSkyGradient.cloudBaseColor[1] > 0.8 &&
        initialSkyGradient.cloudBaseColor[2] > 0.8
      : false
    const depthDarkeningFactor = isDaytime ? 1.0 - fragmentData.depth * 0.4 : 1.0

    const densityMemo: Map<string, number> = new Map()
    const getMemoizedDensity = (nxLocal: number, nyLocal: number): number => {
      const key = `${nxLocal.toFixed(3)},${nyLocal.toFixed(3)}` // Reduced precision for memory efficiency
      if (densityMemo.has(key)) return densityMemo.get(key) as number
      const calculatedDensity = _calculateCloudDensity(nxLocal, nyLocal, fragmentData, perlin)
      densityMemo.set(key, calculatedDensity)
      return calculatedDensity
    }

    for (let y = 0; y < actualGridHeight; y++) {
      for (let x = 0; x < actualGridWidth; x++) {
        const nx = (x / actualGridWidth) * 2 - 1
        const ny = (y / actualGridHeight) * 2 - 1
        const densityValue = getMemoizedDensity(nx, ny)

        // Use a reasonable threshold to capture cloud pixels
        const densityThreshold = 0.1

        if (densityValue > densityThreshold) {
          const distanceFromCenter = Math.sqrt(nx * nx + ny * ny)
          const organicBoundary = _calculateOrganicBoundary(nx, ny, fragmentData, perlin)

          if (distanceFromCenter <= organicBoundary) {
            // Simplified edge detection
            const step = 2 / actualGridWidth
            const neighborDensities = [
              getMemoizedDensity(nx, ny - step),
              getMemoizedDensity(nx, ny + step),
              getMemoizedDensity(nx - step, ny),
              getMemoizedDensity(nx + step, ny),
            ]
            const avgNeighbor =
              neighborDensities.reduce((s, n) => s + n, 0) / neighborDensities.length
            const densityGradient = Math.abs(densityValue - avgNeighbor)

            // Simple edge detection
            const isEdge = densityGradient > 0.15 || densityValue < 0.4

            // Calculate shadow factor based on light direction
            // Light direction comes from the sky gradient
            const pixelToLightDot = nx * lightDir.x + ny * lightDir.y
            // Convert dot product to shadow factor (0 = full shadow, 1 = no shadow)
            // Pixels facing away from light get more shadow
            const baseShadowFactor = Math.max(0, Math.min(1, (pixelToLightDot + 1) * 0.5))

            // Apply additional shadow based on density and edge properties
            let shadowFactor = baseShadowFactor

            // Denser areas cast more shadows on themselves
            shadowFactor *= 0.7 + densityValue * 0.3

            // Edge pixels get less shadow to maintain definition
            if (isEdge) {
              shadowFactor = Math.max(shadowFactor, 0.6)
            }

            // Ensure shadow factor stays in valid range
            shadowFactor = Math.max(0.1, Math.min(1.0, shadowFactor))

            // Use density for alpha with better visibility
            let currentAlpha = Math.max(0.3, densityValue) // Ensure minimum visibility

            // Apply fuzzy edges but keep them visible
            if (isEdge) {
              currentAlpha *= 0.8 // Slight reduction for edges
            }

            // Apply fragment density
            currentAlpha *= fragmentData.density

            // Calculate brightness with texture noise
            let currentBrightness = 0.7 + densityValue * 0.2
            const edgeDistance = organicBoundary - distanceFromCenter

            // Apply depth-based brightness
            const depthBrightnessMultiplier = 0.8 + fragmentData.depth * 0.3

            // Add subtle texture noise
            const texNX = nx * 6.0 + fragmentData.noiseOffset * 0.02
            const texNY = ny * 6.0 + fragmentData.noiseOffset * 0.02
            const texNoise = perlin.noise(texNX, texNY) * 0.1

            currentBrightness += texNoise
            currentBrightness *= depthBrightnessMultiplier
            currentBrightness = Math.max(0.4, Math.min(1.0, currentBrightness))

            // Ensure good visibility
            currentAlpha = Math.max(0.2, Math.min(1.0, currentAlpha))

            const pixelX = (x - actualGridWidth / 2) * adjustedPixelSize + centerX
            const pixelY = (y - actualGridHeight / 2) * adjustedPixelSize + centerY
            const colorInfoForCalc = {
              density: densityValue,
              isEdge,
              edgeDistance,
              shadowFactor,
              brightness: currentBrightness,
              depth: fragmentData.depth, // Pass depth for depth-based lighting
              depthDarkeningFactor, // Pre-calculated for performance
              isDaytime, // Pre-calculated for performance
            }
            const calculatedColor = _calculatePixelColorLogic(
              colorInfoForCalc,
              initialSkyGradient || null,
            )

            pixelProperties.push({
              nx,
              ny,
              density: densityValue,
              isEdge,
              edgeDistance,
              shadowFactor,
              brightness: currentBrightness,
              alpha: currentAlpha,
              color: calculatedColor,
              pixelX,
              pixelY,
              pixelSize: adjustedPixelSize,
              depth: fragmentData.depth,
            })
          }
        }
      }
    }
    return { fragmentData, pixelProperties }
  },

  recalculatePixelColors(
    pixelProps: PixelProperty[], // Expecting only the data needed for color calc, or full PixelProperty
    newSkyGradient: SkyGradient | null,
  ): number[] {
    // Returns an array of new colors
    const newColors: number[] = []

    // Safety check
    if (!Array.isArray(pixelProps)) {
      console.error('Worker: pixelProps is not an array:', pixelProps)
      return []
    }

    // Early return if array is empty (cloud was destroyed)
    if (pixelProps.length === 0) {
      console.log('Worker: Received empty pixelProps array, returning empty colors array')
      return []
    }

    // Pre-calculate common values to avoid redundant calculations
    const isDaytime = newSkyGradient
      ? newSkyGradient.cloudBaseColor[0] > 0.8 &&
        newSkyGradient.cloudBaseColor[1] > 0.8 &&
        newSkyGradient.cloudBaseColor[2] > 0.8
      : false

    for (let i = 0; i < pixelProps.length; i++) {
      const prop = pixelProps[i]

      // Check if the property is valid
      if (!prop || typeof prop !== 'object') {
        console.error(`Worker: Invalid pixel property at index ${i}:`, prop)
        continue // Skip this invalid property
      }

      // Check if required properties exist
      if (
        typeof prop.density !== 'number' ||
        typeof prop.isEdge !== 'boolean' ||
        typeof prop.edgeDistance !== 'number' ||
        typeof prop.shadowFactor !== 'number' ||
        typeof prop.brightness !== 'number' ||
        typeof prop.depth !== 'number'
      ) {
        console.error(`Worker: Missing or invalid properties at index ${i}:`, prop)
        continue // Skip this invalid property
      }

      try {
        // Pre-calculate depth darkening factor for performance
        const depthDarkeningFactor = isDaytime ? 1.0 - prop.depth * 0.4 : 1.0

        // Ensure we pass the correct structure to _calculatePixelColorLogic
        const colorInfo = {
          density: prop.density,
          isEdge: prop.isEdge,
          edgeDistance: prop.edgeDistance,
          shadowFactor: prop.shadowFactor, // Use existing shadow factor
          brightness: prop.brightness,
          depth: prop.depth, // Pass depth for depth-based lighting
          depthDarkeningFactor, // Pre-calculated for performance
          isDaytime, // Pre-calculated for performance
        }
        const color = _calculatePixelColorLogic(colorInfo, newSkyGradient)
        newColors.push(color)
      } catch (error) {
        console.error(`Worker: Error processing pixel at index ${i}:`, error, prop)
        // Push a default gray color as fallback
        newColors.push(0x808080)
      }
    }

    // Only log if there's a mismatch
    if (newColors.length !== pixelProps.length) {
      console.warn('Worker: Array length mismatch:', {
        inputLength: pixelProps.length,
        outputLength: newColors.length,
        skippedCount: pixelProps.length - newColors.length,
      })
    }

    return newColors
  },

  recalculatePixelColorsAndShadows(
    pixelProps: PixelProperty[],
    newSkyGradient: SkyGradient | null,
    fragmentData: CloudFragmentData,
  ): { colors: number[]; updatedPixelProps: PixelProperty[] } {
    // Returns both new colors and updated pixel properties with recalculated shadows
    const newColors: number[] = []
    const updatedPixelProps: PixelProperty[] = []

    // Safety check
    if (!Array.isArray(pixelProps)) {
      console.error('Worker: pixelProps is not an array:', pixelProps)
      return { colors: [], updatedPixelProps: [] }
    }

    // Early return if array is empty (cloud was destroyed)
    if (pixelProps.length === 0) {
      console.log('Worker: Received empty pixelProps array, returning empty arrays')
      return { colors: [], updatedPixelProps: [] }
    }

    // Pre-calculate common values to avoid redundant calculations
    const isDaytime = newSkyGradient
      ? newSkyGradient.cloudBaseColor[0] > 0.8 &&
        newSkyGradient.cloudBaseColor[1] > 0.8 &&
        newSkyGradient.cloudBaseColor[2] > 0.8
      : false

    // Get new light direction from sky gradient
    const lightDir = newSkyGradient?.lightDirection || { x: -0.2, y: -0.8 }

    for (let i = 0; i < pixelProps.length; i++) {
      const prop = pixelProps[i]

      // Check if the property is valid
      if (!prop || typeof prop !== 'object') {
        console.error(`Worker: Invalid pixel property at index ${i}:`, prop)
        continue // Skip this invalid property
      }

      // Check if required properties exist
      if (
        typeof prop.density !== 'number' ||
        typeof prop.isEdge !== 'boolean' ||
        typeof prop.edgeDistance !== 'number' ||
        typeof prop.shadowFactor !== 'number' ||
        typeof prop.brightness !== 'number' ||
        typeof prop.depth !== 'number' ||
        typeof prop.nx !== 'number' ||
        typeof prop.ny !== 'number'
      ) {
        console.error(`Worker: Missing or invalid properties at index ${i}:`, prop)
        continue // Skip this invalid property
      }

      try {
        // Calculate shadow factor based on light direction
        const pixelToLightDot = prop.nx * lightDir.x + prop.ny * lightDir.y
        // Convert dot product to shadow factor (0 = full shadow, 1 = no shadow)
        const baseShadowFactor = Math.max(0, Math.min(1, (pixelToLightDot + 1) * 0.5))

        // Apply additional shadow based on density and edge properties
        let newShadowFactor = baseShadowFactor

        // Denser areas cast more shadows on themselves
        newShadowFactor *= 0.7 + prop.density * 0.3

        // Edge pixels get less shadow to maintain definition
        if (prop.isEdge) {
          newShadowFactor = Math.max(newShadowFactor, 0.6)
        }

        // Ensure shadow factor stays in valid range
        newShadowFactor = Math.max(0.1, Math.min(1.0, newShadowFactor))

        // Recalculate brightness with shadow factor
        const depthBrightnessMultiplier = 0.7 + fragmentData.depth * 0.4
        let newBrightness: number

        if (prop.isEdge) {
          newBrightness = (0.7 + prop.density * 0.2) * depthBrightnessMultiplier
        } else {
          newBrightness = (0.6 + prop.density * 0.3) * depthBrightnessMultiplier
        }

        // Apply shadow influence to brightness
        newBrightness *= 0.8 + newShadowFactor * 0.2 // Shadows reduce brightness slightly
        newBrightness = Math.max(0.3, Math.min(1.0, newBrightness))

        // Pre-calculate depth darkening factor for performance
        const depthDarkeningFactor = isDaytime ? 1.0 - prop.depth * 0.4 : 1.0

        // Create updated pixel property
        const updatedProp: PixelProperty = {
          ...prop,
          shadowFactor: newShadowFactor,
          brightness: newBrightness,
        }

        // Calculate new color with proper shadows
        const colorInfo = {
          density: prop.density,
          isEdge: prop.isEdge,
          edgeDistance: prop.edgeDistance,
          shadowFactor: newShadowFactor,
          brightness: newBrightness,
          depth: prop.depth, // Pass depth for depth-based lighting
          depthDarkeningFactor, // Pre-calculated for performance
          isDaytime, // Pre-calculated for performance
        }
        const color = _calculatePixelColorLogic(colorInfo, newSkyGradient)

        newColors.push(color)
        updatedPixelProps.push(updatedProp)
      } catch (error) {
        console.error(`Worker: Error processing pixel at index ${i}:`, error, prop)
        // Push defaults as fallback
        newColors.push(0x808080)
        updatedPixelProps.push(prop) // Keep original if calculation fails
      }
    }

    return { colors: newColors, updatedPixelProps }
  },
}

Comlink.expose(cloudDataGenerator)
export type CloudDataWorker = typeof cloudDataGenerator
