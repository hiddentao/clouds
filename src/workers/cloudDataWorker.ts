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
  const { isEdge, edgeDistance, shadowFactor, brightness } = pixelInfo
  if (skyGradient) {
    const baseColor = skyGradient.cloudBaseColor
    const highlightColor = skyGradient.cloudHighlightColor
    const shadowColor = skyGradient.cloudShadowColor
    let finalColor: [number, number, number]

    if (isEdge || edgeDistance < 0.1) {
      // Edge pixels get more highlight mixing for softer edges
      const mixFactor = brightness * 0.8 + 0.2
      finalColor = [
        baseColor[0] * (1 - mixFactor) + highlightColor[0] * mixFactor,
        baseColor[1] * (1 - mixFactor) + highlightColor[1] * mixFactor,
        baseColor[2] * (1 - mixFactor) + highlightColor[2] * mixFactor,
      ]
    } else {
      // Start with base color for interior pixels
      finalColor = [...baseColor] as [number, number, number]

      // Apply shadows more strongly for negative shadow factors (bottom/shadowed areas)
      const shadowMix = Math.max(0, -shadowFactor)
      const lightMix = Math.max(0, shadowFactor)

      if (shadowMix > 0) {
        // Increase shadow strength for more pronounced bottom shadows
        const strength = shadowMix * 0.8
        finalColor = [
          finalColor[0] * (1 - strength) + shadowColor[0] * strength,
          finalColor[1] * (1 - strength) + shadowColor[1] * strength,
          finalColor[2] * (1 - strength) + shadowColor[2] * strength,
        ]
      }

      if (lightMix > 0) {
        // Reduce highlight strength to keep clouds more white-based
        const strength = lightMix * 0.3
        finalColor = [
          finalColor[0] * (1 - strength) + highlightColor[0] * strength,
          finalColor[1] * (1 - strength) + highlightColor[1] * strength,
          finalColor[2] * (1 - strength) + highlightColor[2] * strength,
        ]
      }
    }

    // Apply brightness with more subtle effect to preserve white appearance
    finalColor = [
      Math.min(1.0, finalColor[0] * (0.7 + brightness * 0.3)),
      Math.min(1.0, finalColor[1] * (0.7 + brightness * 0.3)),
      Math.min(1.0, finalColor[2] * (0.7 + brightness * 0.3)),
    ]

    const r = Math.round(finalColor[0] * 255)
    const g = Math.round(finalColor[1] * 255)
    const b = Math.round(finalColor[2] * 255)
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
  let dens = 0
  const turbulenceScale = 1.0 + fragmentData.turbulence
  const complexityFactor = fragmentData.shapeComplexity

  switch (fragmentData.type) {
    case 'wispy': {
      const stretchFactor = 1.0 + Math.abs(nxLocal) * (0.4 * complexityFactor)
      const verticalFalloff = Math.max(0, 1.0 - Math.abs(nyLocal) * (2.0 * turbulenceScale))
      const tendrilOffset1 = _simpleRandom(fragmentData.noiseOffset + 100) * 0.4 - 0.2
      const tendrilOffset2 = _simpleRandom(fragmentData.noiseOffset + 200) * 0.4 - 0.2
      const tendrilOffset3 = _simpleRandom(fragmentData.noiseOffset + 300) * 0.4 - 0.2
      const t1 =
        Math.max(0, 1.0 - Math.abs(nyLocal + 0.3 + tendrilOffset1) * (3.0 * turbulenceScale)) *
        Math.max(0, 1.0 - Math.abs(nxLocal) * (0.8 * complexityFactor))
      const t2 =
        Math.max(0, 1.0 - Math.abs(nyLocal - 0.2 + tendrilOffset2) * (4.0 * turbulenceScale)) *
        Math.max(0, 1.0 - Math.abs(nxLocal + 0.3) * (1.2 * complexityFactor))
      const t3 =
        Math.max(0, 1.0 - Math.abs(nyLocal + tendrilOffset3) * (2.5 * turbulenceScale)) *
        Math.max(0, 1.0 - Math.abs(nxLocal - 0.4) * (1.0 * complexityFactor))
      dens = Math.max(t1, t2, t3) * stretchFactor * verticalFalloff
      break
    }
    case 'puffy': {
      const numMasses = Math.floor(3 + complexityFactor * 4)
      for (let i = 0; i < numMasses; i++) {
        const offsetX =
          _simpleRandom(fragmentData.noiseOffset + i * 10) * (0.6 * turbulenceScale) -
          0.3 * turbulenceScale
        const offsetY =
          _simpleRandom(fragmentData.noiseOffset + i * 20) * (0.4 * turbulenceScale) -
          0.2 * turbulenceScale
        const massRadius =
          (0.25 + _simpleRandom(fragmentData.noiseOffset + i * 30) * 0.35) * complexityFactor
        const distance = Math.sqrt((nxLocal - offsetX) ** 2 + (nyLocal - offsetY) ** 2)
        const massDensity = Math.max(0, 1.0 - distance / massRadius)
        dens = Math.max(dens, massDensity ** (1.2 / turbulenceScale))
      }
      break
    }
    case 'scattered': {
      const numPatches = Math.floor(4 + complexityFactor * 6)
      for (let i = 0; i < numPatches; i++) {
        const offsetX =
          _simpleRandom(fragmentData.noiseOffset + i * 15) * (1.6 * turbulenceScale) -
          0.8 * turbulenceScale
        const offsetY =
          _simpleRandom(fragmentData.noiseOffset + i * 25) * (1.0 * turbulenceScale) -
          0.5 * turbulenceScale
        const patchSize =
          (0.15 + _simpleRandom(fragmentData.noiseOffset + i * 35) * 0.3) * complexityFactor
        const distance = Math.sqrt((nxLocal - offsetX) ** 2 + (nyLocal - offsetY) ** 2)
        if (distance < patchSize) {
          const patchDensity = Math.max(0, 1.0 - distance / patchSize)
          dens = Math.max(dens, patchDensity * turbulenceScale)
        }
      }
      break
    }
    case 'dense': {
      const centerDistance = Math.sqrt(nxLocal ** 2 + nyLocal ** 2)
      const baseDensity = Math.max(0, 1.0 - centerDistance * (0.6 * turbulenceScale))
      const numBulges = Math.floor(2 + complexityFactor * 3)
      let maxBulgeDensity = 0
      for (let i = 0; i < numBulges; i++) {
        const bulgeX = _simpleRandom(fragmentData.noiseOffset + i * 40) * 0.6 - 0.3
        const bulgeY = _simpleRandom(fragmentData.noiseOffset + i * 50) * 0.4 - 0.2
        const bulgeSize =
          0.8 + _simpleRandom(fragmentData.noiseOffset + i * 60) * (0.6 * complexityFactor)
        const bulgeStrength = 0.7 + _simpleRandom(fragmentData.noiseOffset + i * 70) * 0.2
        const bulgeDensity = Math.max(
          0,
          1.0 - Math.sqrt((nxLocal - bulgeX) ** 2 + (nyLocal - bulgeY) ** 2) * bulgeSize,
        )
        maxBulgeDensity = Math.max(maxBulgeDensity, bulgeDensity * bulgeStrength)
      }
      dens = Math.max(baseDensity, maxBulgeDensity)
      break
    }
  }

  const noiseValScale = 2.5 + turbulenceScale * 1.5
  const noiseXVal = nxLocal * noiseValScale + fragmentData.noiseOffset * 0.01
  const noiseYVal = nyLocal * noiseValScale + fragmentData.noiseOffset * 0.01
  let noiseIntensity: number
  if (fragmentData.type === 'dense') {
    noiseIntensity = 0.05 + fragmentData.turbulence * 0.03
  } else if (fragmentData.type === 'puffy') {
    noiseIntensity = 0.08 + fragmentData.turbulence * 0.05
  } else {
    noiseIntensity = 0.15 + fragmentData.turbulence * 0.1
  }
  const organicNoiseVal = pNoise.noise(noiseXVal, noiseYVal) * noiseIntensity
  dens += organicNoiseVal
  return Math.max(0, Math.min(1, dens * fragmentData.density))
}

function _calculateOrganicBoundary(
  nxLocal: number,
  nyLocal: number,
  fragmentData: CloudFragmentData,
  pNoise: PerlinNoise,
): number {
  let boundary = 1.0
  switch (fragmentData.type) {
    case 'wispy': {
      const horizontalStretch = 1.0 + Math.abs(nxLocal) * 0.3
      const verticalCompress = 0.4 + Math.abs(nyLocal) * 0.2
      boundary = horizontalStretch * verticalCompress
      const tendrilNoise =
        pNoise.noise(nxLocal * 3 + fragmentData.noiseOffset * 0.01, nyLocal * 4) * 0.3
      boundary += tendrilNoise
      break
    }
    case 'puffy': {
      const angle = Math.atan2(nyLocal, nxLocal)
      const radialNoise = pNoise.noise(angle * 2 + fragmentData.noiseOffset * 0.01, 0) * 0.2
      boundary = 0.9 + radialNoise
      const bulgeFactor = Math.sin(angle * 3 + fragmentData.noiseOffset * 0.02) * 0.15
      boundary += bulgeFactor
      break
    }
    case 'dense': {
      const angle = Math.atan2(nyLocal, nxLocal)
      const solidNoise = pNoise.noise(angle * 1.5 + fragmentData.noiseOffset * 0.01, 0) * 0.1
      boundary = 0.95 + solidNoise
      break
    }
    case 'scattered': {
      const patchNoise =
        pNoise.noise(nxLocal * 4 + fragmentData.noiseOffset * 0.01, nyLocal * 4) * 0.4
      const baseNoise = pNoise.noise(nxLocal * 2, nyLocal * 2) * 0.2
      boundary = 0.7 + patchNoise + baseNoise
      break
    }
  }
  const organicNoiseVal =
    pNoise.noise(nxLocal * 2.5 + fragmentData.noiseOffset * 0.005, nyLocal * 2.5) * 0.1
  boundary += organicNoiseVal
  boundary *= 1.0 - fragmentData.edgeSoftness * 0.3
  return Math.max(0.3, Math.min(1.2, boundary))
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
      edgeSoftness: _simpleRandom(noiseOffset + 9) * 0.6 + 0.1,
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
    const lightDir = { x: -0.2, y: -0.8 }
    const densityThreshold =
      fragmentData.type === 'dense' || fragmentData.type === 'puffy' ? 0.05 : 0.1
    const centerX = fragmentData.width / 2
    const centerY = fragmentData.height / 2

    const densityMemo: Map<string, number> = new Map()
    const getMemoizedDensity = (nxLocal: number, nyLocal: number): number => {
      const key = `${nxLocal.toFixed(5)},${nyLocal.toFixed(5)}`
      if (densityMemo.has(key)) return densityMemo.get(key) as number
      const calculatedDensity = _calculateCloudDensity(nxLocal, nyLocal, fragmentData, perlin)
      densityMemo.set(key, calculatedDensity)
      return calculatedDensity
    }

    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const nx = (x / gridWidth) * 2 - 1
        const ny = (y / gridHeight) * 2 - 1
        const densityValue = getMemoizedDensity(nx, ny)

        if (densityValue > densityThreshold) {
          const distanceFromCenter = Math.sqrt(nx * nx + ny * ny)
          const organicBoundary = _calculateOrganicBoundary(nx, ny, fragmentData, perlin)

          if (distanceFromCenter <= organicBoundary) {
            const step = 2 / gridWidth
            const neighborDensities = [
              getMemoizedDensity(nx, ny - step),
              getMemoizedDensity(nx, ny + step),
              getMemoizedDensity(nx - step, ny),
              getMemoizedDensity(nx + step, ny),
            ]
            const avgNeighbor =
              neighborDensities.reduce((s, n) => s + n, 0) / neighborDensities.length
            const isEdge =
              fragmentData.type === 'dense' || fragmentData.type === 'puffy'
                ? densityValue < avgNeighbor * 0.4 || densityValue < 0.2
                : densityValue < avgNeighbor * 0.7 || densityValue < 0.4

            // Enhanced shadow calculation for bottom edges
            const baseShadowFactor = (nx * lightDir.x + ny * lightDir.y) * 0.4
            // Add extra shadow for lower parts of the cloud (positive ny values)
            const bottomShadowBoost = Math.max(0, ny * 0.3) // 0 to 0.3 boost for bottom half
            const shadowFactor = baseShadowFactor - bottomShadowBoost

            let currentAlpha = densityValue
            let currentBrightness = 0.8
            const edgeDistance = organicBoundary - distanceFromCenter
            const edgeSoftness = Math.min(1.0, edgeDistance * 3.0)

            if (isEdge || edgeDistance < 0.1) {
              currentBrightness = 0.9 + densityValue * 0.1
              currentAlpha *= (0.5 + densityValue * 0.3) * edgeSoftness
            } else {
              currentBrightness = 0.6 + densityValue * 0.3
              currentBrightness += shadowFactor
              currentAlpha = Math.min(1.0, densityValue * 1.2) * edgeSoftness
            }
            const texNX = x * 0.3 + fragmentData.noiseOffset * 0.01
            const texNY = y * 0.3 + fragmentData.noiseOffset * 0.01
            const texNoise = perlin.noise(texNX, texNY) * 0.05
            currentBrightness += texNoise
            currentBrightness = Math.max(0.3, Math.min(1.0, currentBrightness))
            currentAlpha = Math.max(0.1, Math.min(1.0, currentAlpha))

            const pixelX = (x - gridWidth / 2) * pixelSize + centerX
            const pixelY = (y - gridHeight / 2) * pixelSize + centerY
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
              pixelSize,
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
          shadowFactor: prop.shadowFactor,
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
}

Comlink.expose(cloudDataGenerator)
export type CloudDataWorker = typeof cloudDataGenerator
