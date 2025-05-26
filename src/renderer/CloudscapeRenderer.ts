import * as Comlink from 'comlink'
import * as PIXI from 'pixi.js'
import { type CloudSettings, Sidebar } from '../components/Sidebar'
import {
  CANVAS_CONFIG,
  CLOUD_CONFIG,
  DEPTH_CONFIG,
  SUN_CONFIG,
  generateDepthLayers,
} from '../constants'
import { CloudFragment } from '../entities/CloudFragment'
import type { LocationData, SkyGradient, SunPosition } from '../types'
import { LocationService } from '../utils/locationService'
import { SkyGradientService } from '../utils/skyGradientService'
import { SunCalculator } from '../utils/sunCalculator'
import type { CloudDataWorker } from '../workers/cloudDataWorker'

interface StarData {
  baseAlpha: number
  twinkleSpeed: number
  twinkleOffset: number
}

interface StarGraphics extends PIXI.Graphics {
  starData?: StarData
}

export class CloudscapeRenderer {
  private app: PIXI.Application
  private cloudFragments: CloudFragment[] = []
  private cloudContainer: PIXI.Container
  private depthContainers: Map<string, PIXI.Container> = new Map()
  private skyContainer: PIXI.Container
  private skySprite: PIXI.Sprite | null = null
  private starsContainer: PIXI.Container
  private stars: StarGraphics[] = []
  private time = 0

  private locationService: LocationService
  private sunCalculator: SunCalculator
  private skyGradientService: SkyGradientService
  private currentLocation: LocationData | null = null
  private currentSunPosition: SunPosition | null = null
  private currentSkyGradient: SkyGradient | null = null

  private lastSunUpdate = 0
  private readonly SUN_UPDATE_INTERVAL = SUN_CONFIG.UPDATE_INTERVAL

  private sidebar: Sidebar
  private customTime: Date | null = null
  private cloudSettings: CloudSettings = {
    cloudCount: CLOUD_CONFIG.MIN_CLOUDS,
    speed: (CLOUD_CONFIG.SPEED_MIN + CLOUD_CONFIG.SPEED_MAX) / 2,
    depthLayers: DEPTH_CONFIG.DEFAULT_LAYERS,
  }
  private currentDepthLayers: Record<string, any> = {}
  private cloudDataWorker: Comlink.Remote<CloudDataWorker>

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application({
      view: canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x87ceeb, // Sky blue background
      antialias: CANVAS_CONFIG.ANTIALIAS,
      resolution: CANVAS_CONFIG.RESOLUTION,
    })

    this.skyContainer = new PIXI.Container()
    this.starsContainer = new PIXI.Container()
    this.cloudContainer = new PIXI.Container()

    this.app.stage.addChild(this.skyContainer)
    this.app.stage.addChild(this.starsContainer)
    this.app.stage.addChild(this.cloudContainer)

    this.initializeDepthLayers()

    this.locationService = LocationService.getInstance()
    this.sunCalculator = SunCalculator.getInstance()
    this.skyGradientService = SkyGradientService.getInstance()

    // Initialize the Web Worker
    const workerInstance = new Worker(new URL('../workers/cloudDataWorker.ts', import.meta.url), {
      type: 'module',
    })
    this.cloudDataWorker = Comlink.wrap<CloudDataWorker>(workerInstance)

    this.sidebar = new Sidebar(
      (time: Date) => {
        this.customTime = time
        this.updateSunPosition()
      },
      (settings: CloudSettings) => {
        this.updateCloudSettings(settings)
      },
      this.cloudSettings,
    )

    this.initialize()
  }

  private initializeDepthLayers(): void {
    this.currentDepthLayers = generateDepthLayers(this.cloudSettings.depthLayers)

    // Clear existing containers
    this.depthContainers.clear()
    this.cloudContainer.removeChildren()

    // Create containers for each depth layer in order (back to front)
    const layerKeys = Object.keys(this.currentDepthLayers).sort((a, b) => {
      return this.currentDepthLayers[a].depth - this.currentDepthLayers[b].depth
    })

    for (const layerKey of layerKeys) {
      const container = new PIXI.Container()
      this.depthContainers.set(layerKey, container)
      this.cloudContainer.addChild(container)
    }
  }

  private async initialize(): Promise<void> {
    try {
      this.currentLocation = await this.locationService.getCurrentLocation()
      // Create the sky sprite first, then update its content
      this.skySprite = new PIXI.Sprite() // Create an empty sprite initially
      this.skySprite.width = this.app.screen.width
      this.skySprite.height = this.app.screen.height
      this.skyContainer.addChild(this.skySprite)

      await this.updateSunPosition() // This will generate initial gradient and call updateSkyBackground
      this.createStars()
      await this.createInitialClouds()
      this.setupEventListeners()
      this.startAnimation()
      document.body.appendChild(this.sidebar.getElement())
    } catch (error) {
      console.error('Failed to initialize cloudscape:', error)
      // Ensure skySprite is created even in fallback if needed by updateSkyBackground
      if (!this.skySprite) {
        this.skySprite = new PIXI.Sprite()
        this.skySprite.width = this.app.screen.width
        this.skySprite.height = this.app.screen.height
        this.skyContainer.addChild(this.skySprite)
        // Optionally set a default texture or color here if updateSkyBackground won't run or needs a target
        const graphics = new PIXI.Graphics()
        graphics.beginFill(0x87ceeb)
        graphics.drawRect(0, 0, this.app.screen.width, this.app.screen.height)
        graphics.endFill()
        this.skySprite.texture = this.app.renderer.generateTexture(graphics)
        graphics.destroy()
      }
      this.createStars()
      await this.createInitialClouds()
      this.setupEventListeners()
      this.startAnimation()
      document.body.appendChild(this.sidebar.getElement())
    }
  }

  private async updateSunPosition(): Promise<void> {
    if (!this.currentLocation) return
    const timeToUse = this.customTime || new Date()
    this.currentSunPosition = this.sunCalculator.calculateSunPosition(
      this.currentLocation,
      timeToUse,
    )
    this.currentSkyGradient = await this.skyGradientService.generateSkyGradient(
      this.currentSunPosition,
      timeToUse.getTime(),
    )

    console.log('Sun position updated:', {
      time: timeToUse.toLocaleTimeString(),
      timeOfDay: this.currentSunPosition.timeOfDay,
      currentPeriod: this.currentSunPosition.currentTimePeriod.name,
      altitude: this.currentSunPosition.altitude,
      azimuth: this.currentSunPosition.azimuth,
    })

    await this.updateSkyBackground()

    // Cloud sky gradient updates are now async
    const updatePromises = this.cloudFragments.map((cloud) =>
      cloud.updateSkyGradient(this.currentSkyGradient, this.app.renderer as PIXI.Renderer),
    )
    await Promise.all(updatePromises)
  }

  private async updateSkyBackground(): Promise<void> {
    if (!this.skySprite) {
      // Should have been created in initialize
      console.error('skySprite not initialized before updateSkyBackground call')
      return
    }

    if (!this.currentSkyGradient) {
      this.skySprite.visible = false // Hide if no gradient data
      return
    }
    this.skySprite.visible = true

    const graphics = new PIXI.Graphics()
    const gradientColors = this.currentSkyGradient.gradientColors
    const totalStrips = 100
    const stripHeight = this.app.screen.height / totalStrips
    for (let i = 0; i < totalStrips; i++) {
      const t = i / (totalStrips - 1)
      const segmentSize = 1 / (gradientColors.length - 1)
      const segmentIndex = Math.floor(t / segmentSize)
      const segmentT = (t % segmentSize) / segmentSize
      const color1 = gradientColors[Math.min(segmentIndex, gradientColors.length - 1)]
      const color2 = gradientColors[Math.min(segmentIndex + 1, gradientColors.length - 1)]
      const r = Math.round((color1[0] + (color2[0] - color1[0]) * segmentT) * 255)
      const g = Math.round((color1[1] + (color2[1] - color1[1]) * segmentT) * 255)
      const b = Math.round((color1[2] + (color2[2] - color1[2]) * segmentT) * 255)
      const color = (r << 16) | (g << 8) | b
      graphics.beginFill(color)
      graphics.drawRect(0, i * stripHeight, this.app.screen.width, stripHeight + 1)
      graphics.endFill()
    }

    const newTexture = this.app.renderer.generateTexture(graphics)
    if (this.skySprite.texture) {
      this.skySprite.texture.destroy(true) // Destroy old texture before assigning new one
    }
    this.skySprite.texture = newTexture
    graphics.destroy()
  }

  private calculateCloudCountsPerLayer(): Map<string, number> {
    const layerKeys = Object.keys(this.currentDepthLayers)
    const cloudCountsByLayer = new Map<string, number>()

    // Sort layers by depth (0 = furthest back, 1 = front-most)
    const sortedLayers = layerKeys.sort((a, b) => {
      return this.currentDepthLayers[a].depth - this.currentDepthLayers[b].depth
    })

    // Front-most layer (highest depth value) gets the full cloud count
    // Layers further back get progressively fewer clouds
    for (const layerKey of sortedLayers) {
      const layerConfig = this.currentDepthLayers[layerKey]
      // Invert depth so front layer (depth=1) gets full count, back layer (depth=0) gets reduced count
      const depthRatio = 0.3 + layerConfig.depth * 0.7 // Range from 30% to 100%
      const cloudsForLayer = Math.max(1, Math.floor(this.cloudSettings.cloudCount * depthRatio))
      cloudCountsByLayer.set(layerKey, cloudsForLayer)
    }

    return cloudCountsByLayer
  }

  private async createInitialClouds(): Promise<void> {
    const cloudPromises: Promise<CloudFragment | null>[] = []
    const targetCloudCounts = this.calculateCloudCountsPerLayer()

    // Create a more natural distribution across the entire visible area
    const totalScreenWidth = this.app.screen.width
    const extendedWidth = totalScreenWidth * 2.5 // Cover more area for natural flow
    const startX = -CLOUD_CONFIG.RESPAWN_MARGIN - totalScreenWidth * 0.5

    for (const [layerKey, targetCount] of targetCloudCounts) {
      // Ensure at least some clouds are visible on screen immediately
      const visibleClouds = Math.max(1, Math.floor(targetCount * 0.6)) // 60% visible
      const offScreenClouds = targetCount - visibleClouds

      // Create visible clouds first - spread them across the screen
      for (let i = 0; i < visibleClouds; i++) {
        const x =
          (i / Math.max(1, visibleClouds - 1)) * totalScreenWidth * 0.8 + totalScreenWidth * 0.1 // Spread across 80% of screen width
        cloudPromises.push(this.spawnCloud(x, layerKey, this.currentSkyGradient))
      }

      // Create off-screen clouds for natural flow
      if (offScreenClouds > 0) {
        const targetSpacing = extendedWidth / offScreenClouds
        let currentX = startX

        for (let i = 0; i < offScreenClouds; i++) {
          // Add natural variation to spacing (some clusters, some gaps)
          const spacingVariation = (Math.random() - 0.5) * targetSpacing * 0.8
          const clusterChance = Math.random()

          if (clusterChance < 0.15) {
            // 15% chance for tighter clustering
            currentX += targetSpacing * 0.3 + spacingVariation * 0.5
          } else if (clusterChance < 0.25) {
            // 10% chance for wider gaps
            currentX += targetSpacing * 1.7 + spacingVariation
          } else {
            // Normal spacing with variation
            currentX += targetSpacing + spacingVariation
          }

          cloudPromises.push(this.spawnCloud(currentX, layerKey, this.currentSkyGradient))
        }
      }
    }

    const newCloudsWithNulls = await Promise.all(cloudPromises)
    const newClouds = newCloudsWithNulls.filter((c) => c !== null) as CloudFragment[]

    // Calculate total expected clouds for better logging
    const totalExpectedClouds = Array.from(targetCloudCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    )
    console.log(
      `Created ${newClouds.length} clouds (expected: ${totalExpectedClouds}) for front-layer cloud count setting: ${this.cloudSettings.cloudCount}`,
    )

    // Debug cloud distribution by layer
    const cloudsByLayer = new Map<string, number>()
    for (const cloud of newClouds) {
      const currentCount = cloudsByLayer.get(cloud.data.depthLayer) || 0
      cloudsByLayer.set(cloud.data.depthLayer, currentCount + 1)
    }

    console.log('Cloud distribution by layer:')
    for (const [layerKey, actualCount] of cloudsByLayer) {
      const expectedCount = targetCloudCounts.get(layerKey) || 0
      const layerDepth = this.currentDepthLayers[layerKey]?.depth || 0
      console.log(
        `  ${layerKey} (depth: ${layerDepth.toFixed(2)}): ${actualCount}/${expectedCount} clouds`,
      )
    }

    // Initial drawing for new clouds
    const initialDrawPromises = newClouds.map((cloud) => {
      if (this.currentSkyGradient) {
        return cloud.updateSkyGradient(this.currentSkyGradient, this.app.renderer as PIXI.Renderer)
      }
      return Promise.resolve()
    })
    await Promise.all(initialDrawPromises)
  }

  private async spawnCloud(
    initialX?: number,
    targetLayerKey?: string,
    initialSkyGradientForWorker?: SkyGradient | null,
  ): Promise<CloudFragment | null> {
    let selectedLayerKey = targetLayerKey
    if (!selectedLayerKey) {
      const layerKeys = Object.keys(this.currentDepthLayers)
      if (layerKeys.length === 0) {
        console.error(
          'CloudscapeRenderer: No depth layers available to spawn cloud into. Cannot spawn cloud.',
        )
        return null // Cannot proceed without layers
      }
      // Use balanced selection instead of weighted toward closer layers
      selectedLayerKey = layerKeys[Math.floor(Math.random() * layerKeys.length)]
    }

    // At this point, selectedLayerKey should be a valid key from currentDepthLayers or the provided targetLayerKey
    const layerConfig = this.currentDepthLayers[selectedLayerKey]
    if (!layerConfig) {
      console.error(
        `CloudscapeRenderer: Layer configuration not found for key: '${selectedLayerKey}'. Cannot spawn cloud.`,
      )
      return null // Cannot proceed without layer configuration
    }

    const cloud = await CloudFragment.create(
      this.cloudDataWorker,
      this.app.screen.width,
      this.app.screen.height,
      this.currentDepthLayers,
      initialSkyGradientForWorker,
    )

    cloud.data.depthLayer = selectedLayerKey // No longer needs assertion
    cloud.data.depth = layerConfig.depth
    cloud.data.speedMultiplier = layerConfig.speedMultiplier

    const scale =
      layerConfig.scaleRange.min +
      Math.random() * (layerConfig.scaleRange.max - layerConfig.scaleRange.min)
    const alpha =
      layerConfig.alphaRange.min +
      Math.random() * (layerConfig.alphaRange.max - layerConfig.alphaRange.min)
    cloud.data.scale = scale
    cloud.data.alpha = alpha * cloud.data.density // Alpha is now part of fragmentData from worker
    cloud.data.width = (cloud.data.width / (cloud.data.scale || 1)) * scale // Adjust size based on new scale
    cloud.data.height = (cloud.data.height / (cloud.data.scale || 1)) * scale

    const baseY = this.getBaseYForLayer(layerConfig)
    cloud.data.y = baseY + (Math.random() - 0.5) * this.app.screen.height * 0.1
    cloud.data.speed = this.cloudSettings.speed * cloud.data.speedMultiplier

    if (initialX !== undefined) {
      cloud.data.x = initialX
    } else {
      // More natural spawn positioning with variation
      const baseSpawnDistance = CLOUD_CONFIG.RESPAWN_MARGIN + 100
      const randomVariation = Math.random() * 600 // 0-600px variation
      const depthVariation = (1 - layerConfig.depth) * 200 // Farther clouds spawn further out
      cloud.data.x = this.app.screen.width + baseSpawnDistance + randomVariation + depthVariation
    }

    cloud.displayObject.alpha = cloud.data.alpha // Set final alpha on the sprite

    this.cloudFragments.push(cloud)
    const depthContainer = this.depthContainers.get(cloud.data.depthLayer)
    if (depthContainer) {
      depthContainer.addChild(cloud.displayObject)
    } else {
      console.error(`No depth container found for layer: ${cloud.data.depthLayer}`)
      return null
    }

    // The first updateSkyGradient (if skyGradient is present and different or texture not ready)
    // will handle the initial drawing to the render texture.
    // If initialSkyGradientForWorker was null, and this.currentSkyGradient is now available,
    // this call will trigger the first color calculation and draw.
    if (this.currentSkyGradient) {
      await cloud.updateSkyGradient(this.currentSkyGradient, this.app.renderer as PIXI.Renderer)
    } else {
      // Even without sky gradient, ensure the cloud texture is drawn
      await cloud.updateSkyGradient(null, this.app.renderer as PIXI.Renderer)
    }

    return cloud
  }

  private async checkAndSpawnClouds(): Promise<void> {
    // Calculate current cloud counts per layer
    const cloudCountsByLayer = new Map<string, number>()
    const targetCountsByLayer = this.calculateCloudCountsPerLayer()

    // Initialize current counts to 0
    for (const layerKey of targetCountsByLayer.keys()) {
      cloudCountsByLayer.set(layerKey, 0)
    }

    // Count existing clouds by layer
    const visibleClouds = this.cloudFragments.filter(
      (cloud) =>
        cloud.data.x > -CLOUD_CONFIG.RESPAWN_MARGIN &&
        cloud.data.x < this.app.screen.width + CLOUD_CONFIG.RESPAWN_MARGIN * 2,
    )

    for (const cloud of visibleClouds) {
      const currentCount = cloudCountsByLayer.get(cloud.data.depthLayer) || 0
      cloudCountsByLayer.set(cloud.data.depthLayer, currentCount + 1)
    }

    // Immediately spawn clouds for any layer that has a deficit
    for (const [layerKey, targetCount] of targetCountsByLayer) {
      const currentCount = cloudCountsByLayer.get(layerKey) || 0
      const deficit = targetCount - currentCount

      // Spawn all missing clouds immediately
      for (let i = 0; i < deficit; i++) {
        await this.spawnCloud(undefined, layerKey, this.currentSkyGradient)
      }
    }

    // Clean up clouds that have moved off screen and immediately respawn them
    const cloudsToRemove: CloudFragment[] = []
    for (const cloud of this.cloudFragments) {
      if (cloud.data.x < -CLOUD_CONFIG.RESPAWN_MARGIN * 2) {
        cloudsToRemove.push(cloud)
      }
    }

    // Remove off-screen clouds and spawn replacements immediately
    for (const cloud of cloudsToRemove) {
      const layerKey = cloud.data.depthLayer

      // Remove the cloud
      const depthContainer = this.depthContainers.get(layerKey)
      if (depthContainer) {
        depthContainer.removeChild(cloud.displayObject)
      }
      cloud.destroy()

      // Remove from fragments array
      const index = this.cloudFragments.indexOf(cloud)
      if (index > -1) {
        this.cloudFragments.splice(index, 1)
      }

      // Immediately spawn a replacement
      await this.spawnCloud(undefined, layerKey, this.currentSkyGradient)
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.handleResize.bind(this))
  }

  private handleResize(): void {
    this.app.renderer.resize(window.innerWidth, window.innerHeight)

    if (this.skySprite) {
      this.skySprite.width = window.innerWidth
      this.skySprite.height = window.innerHeight
    }

    // Recreate stars for new screen size
    this.destroyStars()
    this.createStars()
  }

  private startAnimation(): void {
    this.app.ticker.add(this.update.bind(this))
  }

  private async update(deltaTime: number): Promise<void> {
    this.time += deltaTime * 0.003

    // Update sun position periodically
    const now = Date.now()
    if (now - this.lastSunUpdate > this.SUN_UPDATE_INTERVAL) {
      await this.updateSunPosition()
      this.lastSunUpdate = now
    }

    // Check for clouds that need respawning
    await this.checkAndSpawnClouds()

    // Update all cloud fragments
    for (const cloud of this.cloudFragments) {
      cloud.update(deltaTime)
    }

    this.updateStars()
  }

  private async updateCloudSettings(settings: CloudSettings): Promise<void> {
    const oldDepthLayers = this.cloudSettings.depthLayers
    const oldCloudCount = this.cloudSettings.cloudCount
    this.cloudSettings = settings

    if (oldDepthLayers !== settings.depthLayers || oldCloudCount !== settings.cloudCount) {
      console.log(
        `Cloud settings changing: oldCount=${oldCloudCount}, newCount=${settings.cloudCount}, currentClouds=${this.cloudFragments.length}`,
      )

      // Properly clean up existing clouds
      for (const cloud of this.cloudFragments) {
        const depthContainer = this.depthContainers.get(cloud.data.depthLayer)
        if (depthContainer) {
          depthContainer.removeChild(cloud.displayObject)
        }
        cloud.destroy()
      }
      this.cloudFragments = []
      console.log(`Cleaned up all clouds, remaining: ${this.cloudFragments.length}`)

      // Reinitialize depth layers if needed
      if (oldDepthLayers !== settings.depthLayers) {
        this.initializeDepthLayers()
      } else {
        // Even if depth layers didn't change, ensure containers are ready
        console.log(
          `Depth containers available: ${Array.from(this.depthContainers.keys()).join(', ')}`,
        )
      }

      // Create new clouds with proper error handling
      try {
        await this.createInitialClouds()
        console.log(`Cloud settings updated: ${this.cloudFragments.length} clouds created`)
      } catch (error) {
        console.error('Failed to create initial clouds after settings change:', error)
      }
      return
    }

    // Update speed for existing clouds
    for (const cloud of this.cloudFragments) {
      cloud.data.speed = settings.speed * cloud.data.speedMultiplier
    }
  }

  public destroy(): void {
    this.app.ticker.remove(this.update.bind(this))
    window.removeEventListener('resize', this.handleResize.bind(this))

    for (const cloud of this.cloudFragments) {
      cloud.destroy()
    }

    this.cloudFragments = []
    this.destroyStars()
    this.skySprite?.destroy()
    this.sidebar.destroy()
    this.app.destroy(true)
  }

  private destroyStars(): void {
    for (const star of this.stars) {
      star.destroy()
    }
    this.stars = []
    this.starsContainer.removeChildren()
  }

  private getBaseYForLayer(layerConfig: any): number {
    // Determine if this cloud should be constrained to its slice or allowed to overlap
    const shouldConstrain = Math.random() < layerConfig.constrainedPercentage

    let yMin: number
    let yMax: number

    if (shouldConstrain) {
      // Most clouds stay within their constrained slice
      yMin = this.app.screen.height * layerConfig.constrainedYRange.min
      yMax = this.app.screen.height * layerConfig.constrainedYRange.max
    } else {
      // Some clouds can use the full range for natural overlap
      yMin = this.app.screen.height * layerConfig.yRange.min
      yMax = this.app.screen.height * layerConfig.yRange.max
    }

    return yMin + Math.random() * (yMax - yMin)
  }

  private createStars(): void {
    const numStars = 150 + Math.floor(Math.random() * 100) // 150-250 stars

    for (let i = 0; i < numStars; i++) {
      const star = new PIXI.Graphics() as StarGraphics
      const x = Math.random() * this.app.screen.width
      const y = Math.random() * this.app.screen.height * 0.7 // Only in upper 70% of screen
      const size = 0.5 + Math.random() * 1.5 // Star size between 0.5 and 2
      const brightness = 0.3 + Math.random() * 0.7 // Brightness variation

      // Create a simple star shape
      star.beginFill(0xffffff, brightness)
      star.drawCircle(0, 0, size)
      star.endFill()

      star.position.set(x, y)
      star.alpha = 0 // Start invisible

      // Add subtle twinkling data
      star.starData = {
        baseAlpha: brightness,
        twinkleSpeed: 0.5 + Math.random() * 1.5,
        twinkleOffset: Math.random() * Math.PI * 2,
      }

      this.stars.push(star)
      this.starsContainer.addChild(star)
    }
  }

  private updateStars(): void {
    if (!this.currentSunPosition) return

    const timeOfDay = this.currentSunPosition.timeOfDay
    let targetAlpha = 0

    // Determine star visibility based on time of day
    switch (timeOfDay) {
      case 'deep_night':
      case 'night_before_dawn':
      case 'night_after_dusk':
        targetAlpha = 1.0
        break
      case 'dawn':
      case 'dusk':
        targetAlpha = 0.3
        break
      default:
        targetAlpha = 0
        break
    }

    // Update each star with twinkling effect
    for (const star of this.stars) {
      const starData = star.starData
      if (starData) {
        // Calculate twinkling
        const twinkle =
          Math.sin(this.time * starData.twinkleSpeed + starData.twinkleOffset) * 0.3 + 0.7
        const finalAlpha = targetAlpha * starData.baseAlpha * twinkle

        // Smooth transition to target alpha
        const currentAlpha = star.alpha
        const alphaSpeed = 0.02
        star.alpha = currentAlpha + (finalAlpha - currentAlpha) * alphaSpeed
      }
    }
  }
}
