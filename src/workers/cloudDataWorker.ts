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
  }, // alpha is optional as it's not used for color calculation itself
  skyGradient: SkyGradient | null,
): number {
  const { isEdge, edgeDistance, brightness, shadowFactor } = pixelInfo
  if (skyGradient) {
    // Determine if this is a daytime period where we need off-white clouds for visibility
    const isDaytime = skyGradient.gradientType === 'radial' // Radial gradients are used for daytime

    // Use off-white base color for daytime, pure white for other times
    let finalColor: [number, number, number]
    if (isDaytime) {
      // Off-white with slight warm tint for better visibility against blue sky
      finalColor = [0.95, 0.95, 0.92] // Slightly warm off-white
    } else {
      // Pure white for dawn, dusk, and night periods
      finalColor = [1.0, 1.0, 1.0]
    }

    // Apply brightness variation but keep it subtle for sharper edges
    const brightnessVariation = 0.8 + brightness * 0.2 // Reduced variation for sharper look
    finalColor = [
      Math.min(1.0, finalColor[0] * brightnessVariation),
      Math.min(1.0, finalColor[1] * brightnessVariation),
      Math.min(1.0, finalColor[2] * brightnessVariation),
    ]

    // Apply shadow factor to create contrast
    // Shadow factor ranges from 0 (full shadow) to 1 (no shadow)
    // For better contrast, we'll darken shadowed areas more significantly
    const shadowMultiplier = 0.3 + shadowFactor * 0.7 // Range from 0.3 to 1.0
    finalColor = [
      finalColor[0] * shadowMultiplier,
      finalColor[1] * shadowMultiplier,
      finalColor[2] * shadowMultiplier,
    ]

    const r = Math.round(Math.min(255, finalColor[0] * 255))
    const g = Math.round(Math.min(255, finalColor[1] * 255))
    const b = Math.round(Math.min(255, finalColor[2] * 255))
    return (r << 16) | (g << 8) | b
  }
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
  // Create semi-oval shape with compressed bottom
  const centerDistance = Math.sqrt(nxLocal * nxLocal + nyLocal * nyLocal)

  // Apply vertical compression to create flattened bottom
  const verticalCompressionFactor = nyLocal > 0 ? 1.5 : 0.8 // Compress bottom more than top
  const adjustedNy = nyLocal * verticalCompressionFactor
  const adjustedDistance = Math.sqrt(nxLocal * nxLocal + adjustedNy * adjustedNy)

  // Create base cloud shape with semi-oval profile
  let baseDensity = Math.max(0, 1.0 - adjustedDistance * 0.7)

  // Add additional bottom compression for more natural cloud base
  if (nyLocal > 0) {
    const bottomCompressionFactor = 1.0 - nyLocal * 0.3 // Gradually reduce density toward bottom
    baseDensity *= bottomCompressionFactor
  }

  // Add primary noise layer for organic shape
  const primaryScale = 3.0 + fragmentData.shapeComplexity * 2.0
  const primaryNoise = pNoise.noise(
    nxLocal * primaryScale + fragmentData.noiseOffset * 0.01,
    nyLocal * primaryScale + fragmentData.noiseOffset * 0.01,
  )
  baseDensity *= 0.7 + (primaryNoise + 1) * 0.15 // Normalize noise to 0.7-1.0 range

  // Add secondary detail layer
  const detailScale = primaryScale * 3.0
  const detailNoise = pNoise.noise(
    nxLocal * detailScale + fragmentData.noiseOffset * 0.02,
    nyLocal * detailScale + fragmentData.noiseOffset * 0.02,
  )
  baseDensity += detailNoise * 0.1 // Subtle detail

  // Apply type-specific modifications with semi-oval consideration
  switch (fragmentData.type) {
    case 'wispy': {
      // Enhance horizontal streaking with bottom compression
      const horizontalFactor = 1.0 + Math.abs(Math.sin(nyLocal * 6)) * 0.4
      const verticalFactor = 0.6 + Math.abs(Math.cos(nxLocal * 3)) * 0.4
      // Apply stronger compression for wispy clouds at bottom
      const wispyBottomFactor = nyLocal > 0 ? 1.0 - nyLocal * 0.4 : 1.0
      baseDensity *= horizontalFactor * verticalFactor * wispyBottomFactor
      break
    }

    case 'puffy': {
      // Enhance rounded characteristics but maintain flat bottom
      const puffiness = Math.max(0, 1.0 - centerDistance * 0.4) ** 0.8
      // Reduce puffiness at bottom to maintain flat base
      const puffyBottomFactor = nyLocal > 0 ? 1.0 - nyLocal * 0.2 : 1.0
      baseDensity *= (0.8 + puffiness * 0.3) * puffyBottomFactor
      break
    }

    case 'dense': {
      // More solid structure with flat bottom
      const solidness = Math.max(0, 1.0 - centerDistance * 0.5) ** 0.6
      // Maintain density but compress bottom
      const denseBottomFactor = nyLocal > 0 ? 1.0 - nyLocal * 0.15 : 1.0
      baseDensity *= (0.9 + solidness * 0.2) * denseBottomFactor
      break
    }

    case 'scattered': {
      // Create gaps but maintain semi-oval shape
      const fragmentNoise = _simpleRandom(fragmentData.noiseOffset + nxLocal * 200 + nyLocal * 300)
      if (fragmentNoise < 0.3) {
        baseDensity *= 0.2 // Create gaps
      }
      // Apply bottom compression for scattered clouds too
      const scatteredBottomFactor = nyLocal > 0 ? 1.0 - nyLocal * 0.25 : 1.0
      baseDensity *= scatteredBottomFactor
      break
    }
  }

  // Apply edge erosion for organic boundaries with semi-oval shape
  const edgeNoise = pNoise.noise(
    nxLocal * 8.0 + fragmentData.noiseOffset * 0.03,
    nyLocal * 8.0 + fragmentData.noiseOffset * 0.03,
  )

  if (adjustedDistance > 0.6) {
    // Apply erosion to edges, considering the semi-oval shape
    const edgeFactor = 1.0 - (adjustedDistance - 0.6) / 0.4
    baseDensity *= edgeFactor * (0.8 + edgeNoise * 0.3)
  }

  return Math.max(0, Math.min(1, baseDensity * fragmentData.density))
}

function _calculateOrganicBoundary(
  nxLocal: number,
  nyLocal: number,
  fragmentData: CloudFragmentData,
  pNoise: PerlinNoise,
): number {
  // Apply the same vertical compression as in density calculation
  const verticalCompressionFactor = nyLocal > 0 ? 1.5 : 0.8
  const adjustedNy = nyLocal * verticalCompressionFactor

  // Calculate boundary based on compressed coordinates
  const angle = Math.atan2(adjustedNy, nxLocal)
  const irregularity = Math.sin(angle * 6) * 0.1 + Math.cos(angle * 8) * 0.05
  let boundary = 1.0 + irregularity

  // Apply additional bottom compression to boundary
  if (nyLocal > 0) {
    const bottomBoundaryFactor = 1.0 - nyLocal * 0.2 // Compress boundary at bottom
    boundary *= bottomBoundaryFactor
  }

  // Apply edge softness
  boundary *= 1.0 - fragmentData.edgeSoftness * 0.2
  return Math.max(0.6, Math.min(1.3, boundary))
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

    const fragmentTypesArray: Array<'wispy' | 'puffy' | 'dense' | 'scattered'> = [
      'wispy',
      'puffy',
      'dense',
      'scattered',
    ]
    const type = fragmentTypesArray[Math.floor(_simpleRandom(seedBase) * fragmentTypesArray.length)]
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
    const pixelSize = 8
    const gridWidth = Math.ceil(fragmentData.width / pixelSize)
    const gridHeight = Math.ceil(fragmentData.height / pixelSize)

    // Limit grid size to prevent OOM during initial generation
    const MAX_GRID_SIZE = 100 // Maximum 100x100 grid
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
        typeof prop.brightness !== 'number'
      ) {
        console.error(`Worker: Missing or invalid properties at index ${i}:`, prop)
        continue // Skip this invalid property
      }

      try {
        // Ensure we pass the correct structure to _calculatePixelColorLogic
        const colorInfo = {
          density: prop.density,
          isEdge: prop.isEdge,
          edgeDistance: prop.edgeDistance,
          shadowFactor: prop.shadowFactor, // Use existing shadow factor
          brightness: prop.brightness,
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
