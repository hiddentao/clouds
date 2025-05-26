import * as PIXI from 'pixi.js'
import { CLOUD_CONFIG } from '../constants'
import type { CloudFragmentData } from '../types'

export class CloudFragment {
  public sprite: PIXI.Container
  public data: CloudFragmentData

  constructor(screenWidth: number, screenHeight: number) {
    this.data = this.generateFragmentData(screenWidth, screenHeight)
    this.sprite = this.createCloudGraphics()
    this.initializeSprite()
  }

  private generateFragmentData(screenWidth: number, screenHeight: number): CloudFragmentData {
    const fragmentTypes: Array<'wispy' | 'puffy' | 'dense' | 'scattered'> = [
      'wispy',
      'puffy',
      'dense',
      'scattered',
    ]
    const type = fragmentTypes[Math.floor(Math.random() * fragmentTypes.length)]

    const baseY = this.getBaseYForType(type, screenHeight)
    const sizeRange = this.getSizeRangeForType(type)
    const speedRange = this.getSpeedRangeForType(type)
    const density = this.getDensityForType(type)

    return {
      x: screenWidth + CLOUD_CONFIG.RESPAWN_MARGIN,
      y: baseY + (Math.random() - 0.5) * screenHeight * 0.3,
      width: sizeRange.width.min + Math.random() * (sizeRange.width.max - sizeRange.width.min),
      height: sizeRange.height.min + Math.random() * (sizeRange.height.max - sizeRange.height.min),
      speed: speedRange.min + Math.random() * (speedRange.max - speedRange.min),
      alpha: density,
      fadeDirection: 1,
      noiseOffset: Math.random() * 10000,
      density,
      type,
      layers: this.getLayersForType(type),
      turbulence: Math.random() * 0.8,
      shapeComplexity: Math.random() * 1.0 + 0.1,
      edgeSoftness: Math.random() * 0.6 + 0.1,
      rotation: 0,
      rotationSpeed: 0,
    }
  }

  private getBaseYForType(type: string, screenHeight: number): number {
    switch (type) {
      case 'wispy':
        return screenHeight * 0.15
      case 'scattered':
        return screenHeight * 0.25
      case 'puffy':
        return screenHeight * 0.45
      default:
        return screenHeight * 0.65
    }
  }

  private getSizeRangeForType(type: string): {
    width: { min: number; max: number }
    height: { min: number; max: number }
  } {
    switch (type) {
      case 'wispy':
        return {
          width: { min: 200, max: 500 },
          height: { min: 60, max: 120 },
        }
      case 'scattered':
        return {
          width: { min: 150, max: 350 },
          height: { min: 80, max: 140 },
        }
      case 'puffy':
        return {
          width: { min: 250, max: 600 },
          height: { min: 120, max: 250 },
        }
      default:
        return {
          width: { min: 180, max: 450 },
          height: { min: 100, max: 200 },
        }
    }
  }

  private getSpeedRangeForType(type: string): { min: number; max: number } {
    switch (type) {
      case 'wispy':
        return { min: 0.8, max: 1.5 }
      case 'scattered':
        return { min: 0.6, max: 1.2 }
      case 'puffy':
        return { min: 0.2, max: 0.6 }
      default:
        return { min: 0.3, max: 0.8 }
    }
  }

  private getDensityForType(type: string): number {
    switch (type) {
      case 'wispy':
        return 0.4 + Math.random() * 0.4
      case 'scattered':
        return 0.5 + Math.random() * 0.4
      case 'puffy':
        return 0.7 + Math.random() * 0.3
      default:
        return 0.6 + Math.random() * 0.3
    }
  }

  private getLayersForType(type: string): number {
    switch (type) {
      case 'wispy':
        return 1 + Math.floor(Math.random() * 2)
      case 'scattered':
        return 2 + Math.floor(Math.random() * 2)
      case 'puffy':
        return 3 + Math.floor(Math.random() * 3)
      default:
        return 2 + Math.floor(Math.random() * 3)
    }
  }

  private createCloudGraphics(): PIXI.Container {
    const container = new PIXI.Container()

    // Create pixelated cloud based on type
    const pixelSize = 8
    const gridWidth = Math.ceil(this.data.width / pixelSize)
    const gridHeight = Math.ceil(this.data.height / pixelSize)

    // Light direction (from upper left)
    const lightDir = { x: -0.4, y: -0.6 }

    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const nx = (x / gridWidth) * 2 - 1 // Normalize to [-1, 1]
        const ny = (y / gridHeight) * 2 - 1

        const density = this.calculateCloudDensity(nx, ny)

        if (density > 0.1) {
          const pixelGraphics = new PIXI.Graphics()

          // Calculate if this is an edge or center pixel
          const neighbors = this.getNeighborDensities(nx, ny, gridWidth)
          const avgNeighbor = neighbors.reduce((sum, n) => sum + n, 0) / neighbors.length
          const isEdge = density < avgNeighbor * 0.7 || density < 0.4

          // Calculate shadow based on light direction
          const shadowFactor = (nx * lightDir.x + ny * lightDir.y) * 0.3

          let alpha = density
          let brightness = 0.8

          if (isEdge) {
            // Gradient edges - lighter and more transparent
            brightness = 0.9 + density * 0.1
            alpha *= 0.5 + density * 0.3
          } else {
            // Solid centers - add shadows and depth
            brightness = 0.6 + density * 0.3
            brightness += shadowFactor // Apply shadow
            alpha = Math.min(1.0, density * 1.2)
          }

          // Add some noise for texture
          const noiseX = x * 0.3 + this.data.noiseOffset * 0.1
          const noiseY = y * 0.3 + this.data.noiseOffset * 0.1
          const noise = this.simpleNoise(noiseX, noiseY) * 0.1
          brightness += noise

          brightness = Math.max(0.3, Math.min(1.0, brightness))
          alpha = Math.max(0.1, Math.min(1.0, alpha))

          // Get base color for cloud type
          const gray = Math.floor(brightness * 255)
          const color = (gray << 16) | (gray << 8) | gray

          pixelGraphics.beginFill(color, alpha)
          pixelGraphics.drawRect(
            (x - gridWidth / 2) * pixelSize,
            (y - gridHeight / 2) * pixelSize,
            pixelSize,
            pixelSize,
          )
          pixelGraphics.endFill()

          container.addChild(pixelGraphics)
        }
      }
    }

    container.position.set(this.data.x, this.data.y)
    container.alpha = this.data.alpha

    return container
  }

  private calculateCloudDensity(nx: number, ny: number): number {
    let density = 0

    // Use turbulence and shape complexity for more variation
    const turbulenceScale = 1.0 + this.data.turbulence
    const complexityFactor = this.data.shapeComplexity

    switch (this.data.type) {
      case 'wispy': {
        // Elongated, stretched horizontally with more variation
        const stretchFactor = 1.0 + Math.abs(nx) * (0.4 * complexityFactor)
        const verticalFalloff = Math.max(0, 1.0 - Math.abs(ny) * (2.0 * turbulenceScale))

        // Create wispy tendrils with varied positioning
        const tendrilOffset1 = this.simpleRandom(this.data.noiseOffset + 100) * 0.4 - 0.2
        const tendrilOffset2 = this.simpleRandom(this.data.noiseOffset + 200) * 0.4 - 0.2
        const tendrilOffset3 = this.simpleRandom(this.data.noiseOffset + 300) * 0.4 - 0.2

        const tendril1 =
          Math.max(0, 1.0 - Math.abs(ny + 0.3 + tendrilOffset1) * (3.0 * turbulenceScale)) *
          Math.max(0, 1.0 - Math.abs(nx) * (0.8 * complexityFactor))
        const tendril2 =
          Math.max(0, 1.0 - Math.abs(ny - 0.2 + tendrilOffset2) * (4.0 * turbulenceScale)) *
          Math.max(0, 1.0 - Math.abs(nx + 0.3) * (1.2 * complexityFactor))
        const tendril3 =
          Math.max(0, 1.0 - Math.abs(ny + tendrilOffset3) * (2.5 * turbulenceScale)) *
          Math.max(0, 1.0 - Math.abs(nx - 0.4) * (1.0 * complexityFactor))

        density = Math.max(tendril1, tendril2, tendril3) * stretchFactor * verticalFalloff
        break
      }

      case 'puffy': {
        // Round, billowy masses with varied count and positioning
        const numMasses = Math.floor(3 + complexityFactor * 4) // 3-7 masses based on complexity
        for (let i = 0; i < numMasses; i++) {
          const offsetX =
            this.simpleRandom(this.data.noiseOffset + i * 10) * (0.8 * turbulenceScale) -
            0.4 * turbulenceScale
          const offsetY =
            this.simpleRandom(this.data.noiseOffset + i * 20) * (0.6 * turbulenceScale) -
            0.3 * turbulenceScale
          const massRadius =
            (0.2 + this.simpleRandom(this.data.noiseOffset + i * 30) * 0.4) * complexityFactor

          const distance = Math.sqrt((nx - offsetX) ** 2 + (ny - offsetY) ** 2)
          const massDensity = Math.max(0, 1.0 - distance / massRadius)
          density = Math.max(density, massDensity ** (1.5 / turbulenceScale)) // Varied falloff
        }
        break
      }

      case 'scattered': {
        // Broken, irregular patches with more variation
        const numPatches = Math.floor(4 + complexityFactor * 6) // 4-10 patches based on complexity
        for (let i = 0; i < numPatches; i++) {
          const offsetX =
            this.simpleRandom(this.data.noiseOffset + i * 15) * (1.6 * turbulenceScale) -
            0.8 * turbulenceScale
          const offsetY =
            this.simpleRandom(this.data.noiseOffset + i * 25) * (1.0 * turbulenceScale) -
            0.5 * turbulenceScale
          const patchSize =
            (0.15 + this.simpleRandom(this.data.noiseOffset + i * 35) * 0.3) * complexityFactor

          const distance = Math.sqrt((nx - offsetX) ** 2 + (ny - offsetY) ** 2)
          if (distance < patchSize) {
            const patchDensity = Math.max(0, 1.0 - distance / patchSize)
            density = Math.max(density, patchDensity * turbulenceScale)
          }
        }
        break
      }

      case 'dense': {
        // Thick, heavy cloud mass with varied bulges
        const centerDistance = Math.sqrt(nx ** 2 + ny ** 2)
        const baseDensity = Math.max(0, 1.0 - centerDistance * (0.8 * turbulenceScale))

        // Add varied bulges for organic shape
        const numBulges = Math.floor(2 + complexityFactor * 3) // 2-5 bulges
        let maxBulgeDensity = 0

        for (let i = 0; i < numBulges; i++) {
          const bulgeX = this.simpleRandom(this.data.noiseOffset + i * 40) * 0.8 - 0.4
          const bulgeY = this.simpleRandom(this.data.noiseOffset + i * 50) * 0.6 - 0.3
          const bulgeSize =
            1.0 + this.simpleRandom(this.data.noiseOffset + i * 60) * (0.8 * complexityFactor)
          const bulgeStrength = 0.6 + this.simpleRandom(this.data.noiseOffset + i * 70) * 0.3

          const bulgeDensity = Math.max(
            0,
            1.0 - Math.sqrt((nx - bulgeX) ** 2 + (ny - bulgeY) ** 2) * bulgeSize,
          )
          maxBulgeDensity = Math.max(maxBulgeDensity, bulgeDensity * bulgeStrength)
        }

        density = Math.max(baseDensity, maxBulgeDensity)
        break
      }
    }

    // Add more varied organic variation
    const noiseScale = 2.5 + turbulenceScale * 1.5
    const noiseX = nx * noiseScale + this.data.noiseOffset * 0.01
    const noiseY = ny * noiseScale + this.data.noiseOffset * 0.01
    const organicNoise = this.simpleNoise(noiseX, noiseY) * (0.15 + this.data.turbulence * 0.1)
    density += organicNoise

    return Math.max(0, Math.min(1, density * this.data.density))
  }

  private getNeighborDensities(nx: number, ny: number, gridWidth: number): number[] {
    const step = 2 / gridWidth
    const neighbors = [
      this.calculateCloudDensity(nx, ny - step), // top
      this.calculateCloudDensity(nx, ny + step), // bottom
      this.calculateCloudDensity(nx - step, ny), // left
      this.calculateCloudDensity(nx + step, ny), // right
    ]
    return neighbors
  }

  private simpleNoise(x: number, y: number): number {
    // Simple noise function
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return (n - Math.floor(n)) * 2 - 1 // Return value between -1 and 1
  }

  private simpleRandom(seed: number): number {
    // Simple deterministic random number generator
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }

  private initializeSprite(): void {
    this.sprite.position.set(this.data.x, this.data.y)
    this.sprite.width = this.data.width
    this.sprite.height = this.data.height
    this.sprite.alpha = this.data.alpha
  }

  update(deltaTime: number): void {
    // Move cloud from right to left
    this.data.x -= this.data.speed * deltaTime

    // Update sprite properties
    this.sprite.position.set(this.data.x, this.data.y)
    this.sprite.alpha = this.data.alpha
  }

  destroy(): void {
    this.sprite.destroy()
  }
}
