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
import type { SkyGradient, SunPosition } from '../types'
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
  private radialGradientContainer: PIXI.Container | null = null
  private radialGradientSprite: PIXI.Sprite | null = null
  private starsContainer: PIXI.Container
  private stars: StarGraphics[] = []
  private time = 0

  private sunCalculator: SunCalculator
  private skyGradientService: SkyGradientService
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
  private isUpdatingSettings = false // Flag to prevent race conditions during settings updates
  private lastCloudSpawnCheck = 0 // Throttle cloud spawning checks
  private readonly CLOUD_SPAWN_CHECK_INTERVAL = 100

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
    this.radialGradientContainer = new PIXI.Container()
    this.starsContainer = new PIXI.Container()
    this.cloudContainer = new PIXI.Container()

    this.app.stage.addChild(this.skyContainer)
    this.app.stage.addChild(this.radialGradientContainer)
    this.app.stage.addChild(this.starsContainer)
    this.app.stage.addChild(this.cloudContainer)

    this.initializeDepthLayers()

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
    const timeToUse = this.customTime || new Date()
    this.currentSunPosition = this.sunCalculator.calculateSunPosition(timeToUse)
    const newSkyGradient = await this.skyGradientService.generateSkyGradient(
      this.currentSunPosition,
      timeToUse.getTime(),
    )

    // Check if the sky gradient has actually changed significantly
    const skyGradientChanged =
      !this.currentSkyGradient ||
      this.currentSkyGradient.gradientType !== newSkyGradient.gradientType ||
      Math.abs(this.currentSkyGradient.lightDirection.x - newSkyGradient.lightDirection.x) > 0.01 ||
      Math.abs(this.currentSkyGradient.lightDirection.y - newSkyGradient.lightDirection.y) > 0.01 ||
      this.currentSkyGradient.cloudBaseColor.some(
        (c, i) => Math.abs(c - newSkyGradient.cloudBaseColor[i]) > 0.05,
      )

    this.currentSkyGradient = newSkyGradient

    console.log('Sun position updated:', {
      time: timeToUse.toLocaleTimeString(),
      timeOfDay: this.currentSunPosition.timeOfDay,
      currentPeriod: this.currentSunPosition.currentTimePeriod.name,
      altitude: this.currentSunPosition.altitude,
      azimuth: this.currentSunPosition.azimuth,
      skyGradientChanged,
    })

    await this.updateSkyBackground()

    // Only update clouds if the sky gradient has changed significantly
    if (skyGradientChanged) {
      // Batch cloud updates in smaller groups to avoid blocking the main thread
      const BATCH_SIZE = 10
      for (let i = 0; i < this.cloudFragments.length; i += BATCH_SIZE) {
        const batch = this.cloudFragments.slice(i, i + BATCH_SIZE)
        const updatePromises = batch.map((cloud) =>
          cloud.updateSkyGradient(this.currentSkyGradient, this.app.renderer as PIXI.Renderer),
        )
        await Promise.all(updatePromises)

        // Small delay between batches to prevent blocking
        if (i + BATCH_SIZE < this.cloudFragments.length) {
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      }
    }
  }

  private async updateSkyBackground(): Promise<void> {
    if (!this.skySprite) {
      console.error('skySprite not initialized before updateSkyBackground call')
      return
    }

    if (!this.currentSkyGradient) {
      this.skySprite.visible = false
      if (this.radialGradientContainer) {
        this.radialGradientContainer.visible = false
      }
      return
    }

    const gradientColors = this.currentSkyGradient.gradientColors

    if (
      this.currentSkyGradient.gradientType === 'radial' &&
      this.currentSkyGradient.radialGradientCenter
    ) {
      // Hide linear gradient sprite and show radial gradient container
      this.skySprite.visible = false

      if (!this.radialGradientContainer) {
        console.error('radialGradientContainer not initialized')
        return
      }

      this.radialGradientContainer.visible = true

      // Create radial gradient centered at origin (0,0)
      const graphics = new PIXI.Graphics()
      const maxRadius =
        (this.currentSkyGradient.radialGradientRadius || 1.5) *
        Math.max(this.app.screen.width, this.app.screen.height)

      // Create concentric circles from outside to inside (so inner colors render on top)
      const numRings = 60
      const radiusStep = maxRadius / numRings

      for (let i = numRings - 1; i >= 0; i--) {
        const t = i / (numRings - 1)
        const radius = (i + 1) * radiusStep

        // Interpolate color based on distance from center
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
        graphics.drawCircle(0, 0, radius) // Draw centered at origin
        graphics.endFill()
      }

      // Generate texture from graphics
      const radialTexture = this.app.renderer.generateTexture(graphics)
      graphics.destroy()

      // Create or update radial gradient sprite
      if (!this.radialGradientSprite) {
        this.radialGradientSprite = new PIXI.Sprite(radialTexture)
        this.radialGradientContainer.addChild(this.radialGradientSprite)
      } else {
        // Destroy old texture and assign new one
        if (this.radialGradientSprite.texture) {
          this.radialGradientSprite.texture.destroy(true)
        }
        this.radialGradientSprite.texture = radialTexture
      }

      // Set anchor to center so positioning works correctly
      this.radialGradientSprite.anchor.set(0.5, 0.5)

      // Position the container at the sun's viewport position
      const sunX = this.currentSkyGradient.radialGradientCenter.x * this.app.screen.width
      const sunY = this.currentSkyGradient.radialGradientCenter.y * this.app.screen.height
      this.radialGradientContainer.position.set(sunX, sunY)
    } else {
      // Hide radial gradient and show linear gradient sprite
      if (this.radialGradientContainer) {
        this.radialGradientContainer.visible = false
      }
      this.skySprite.visible = true

      // Render linear gradient (legacy system for nighttime)
      const graphics = new PIXI.Graphics()
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
        this.skySprite.texture.destroy(true)
      }
      this.skySprite.texture = newTexture
      graphics.destroy()
    }
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
    console.log('Starting createInitialClouds...')

    // Check if worker is available
    if (!this.cloudDataWorker) {
      console.error('Cloud data worker is not available!')
      return
    }

    const targetCloudCounts = this.calculateCloudCountsPerLayer()
    console.log('Target cloud counts:', targetCloudCounts)

    // Create a more natural distribution across the entire visible area
    const totalScreenWidth = this.app.screen.width
    const extendedWidth = totalScreenWidth * 2.5 // Cover more area for natural flow
    const startX = -CLOUD_CONFIG.RESPAWN_MARGIN - totalScreenWidth * 0.5

    // Create clouds in batches to prevent OOM
    const BATCH_SIZE = 5 // Create 5 clouds at a time
    const allCloudSpecs: Array<{ x: number; layerKey: string }> = []

    // First, collect all cloud specifications without creating them
    for (const [layerKey, targetCount] of targetCloudCounts) {
      console.log(`Planning clouds for layer ${layerKey}: ${targetCount} clouds`)

      // Ensure at least some clouds are visible on screen immediately
      const visibleClouds = Math.max(1, Math.floor(targetCount * 0.6)) // 60% visible
      const offScreenClouds = targetCount - visibleClouds

      // Plan visible clouds first - spread them across the screen
      for (let i = 0; i < visibleClouds; i++) {
        const x =
          (i / Math.max(1, visibleClouds - 1)) * totalScreenWidth * 0.8 + totalScreenWidth * 0.1 // Spread across 80% of screen width
        allCloudSpecs.push({ x, layerKey })
      }

      // Plan off-screen clouds for natural flow
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

          allCloudSpecs.push({ x: currentX, layerKey })
        }
      }
    }

    console.log(`Planning to create ${allCloudSpecs.length} clouds in batches of ${BATCH_SIZE}`)

    // Create clouds in batches with delays between batches
    const newClouds: CloudFragment[] = []
    for (let i = 0; i < allCloudSpecs.length; i += BATCH_SIZE) {
      const batch = allCloudSpecs.slice(i, i + BATCH_SIZE)
      console.log(
        `Creating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allCloudSpecs.length / BATCH_SIZE)} (${batch.length} clouds)`,
      )

      const batchPromises = batch.map((spec) =>
        this.spawnCloud(spec.x, spec.layerKey, this.currentSkyGradient),
      )

      const batchResults = await Promise.all(batchPromises)
      const validClouds = batchResults.filter((c) => c !== null) as CloudFragment[]
      newClouds.push(...validClouds)

      // Small delay between batches to prevent overwhelming the worker
      if (i + BATCH_SIZE < allCloudSpecs.length) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

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

    // Initial drawing for new clouds in batches
    console.log('Starting initial drawing for clouds in batches...')
    const DRAW_BATCH_SIZE = 10 // Draw 10 clouds at a time
    for (let i = 0; i < newClouds.length; i += DRAW_BATCH_SIZE) {
      const drawBatch = newClouds.slice(i, i + DRAW_BATCH_SIZE)
      const drawPromises = drawBatch.map((cloud) => {
        if (this.currentSkyGradient) {
          return cloud.updateSkyGradient(
            this.currentSkyGradient,
            this.app.renderer as PIXI.Renderer,
          )
        }
        return Promise.resolve()
      })
      await Promise.all(drawPromises)

      // Small delay between draw batches
      if (i + DRAW_BATCH_SIZE < newClouds.length) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }
    console.log('Initial drawing completed')
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

    try {
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
    } catch (error) {
      console.error('Error creating cloud fragment:', error)
      return null
    }
  }

  private async checkAndSpawnClouds(): Promise<void> {
    // Skip if settings are being updated to prevent race conditions
    if (this.isUpdatingSettings) {
      return
    }

    // Calculate current cloud counts per layer more efficiently
    const cloudCountsByLayer = new Map<string, number>()
    const targetCountsByLayer = this.calculateCloudCountsPerLayer()

    // Initialize current counts to 0
    for (const layerKey of targetCountsByLayer.keys()) {
      cloudCountsByLayer.set(layerKey, 0)
    }

    // Count existing clouds by layer (only count visible clouds for efficiency)
    const visibleClouds = this.cloudFragments.filter(
      (cloud) =>
        cloud.data.x > -CLOUD_CONFIG.RESPAWN_MARGIN &&
        cloud.data.x < this.app.screen.width + CLOUD_CONFIG.RESPAWN_MARGIN * 2,
    )

    for (const cloud of visibleClouds) {
      const currentCount = cloudCountsByLayer.get(cloud.data.depthLayer) || 0
      cloudCountsByLayer.set(cloud.data.depthLayer, currentCount + 1)
    }

    // Spawn missing clouds in batches to avoid blocking
    const spawnPromises: Promise<CloudFragment | null>[] = []
    for (const [layerKey, targetCount] of targetCountsByLayer) {
      const currentCount = cloudCountsByLayer.get(layerKey) || 0
      const deficit = targetCount - currentCount

      // Limit spawning to prevent performance issues
      const maxSpawnPerFrame = 2
      const actualSpawnCount = Math.min(deficit, maxSpawnPerFrame)

      for (let i = 0; i < actualSpawnCount; i++) {
        spawnPromises.push(this.spawnCloud(undefined, layerKey, this.currentSkyGradient))
      }
    }

    // Execute spawning in parallel but limit concurrency
    if (spawnPromises.length > 0) {
      await Promise.all(spawnPromises)
    }

    // Clean up off-screen clouds more efficiently
    const cloudsToRemove: CloudFragment[] = []
    for (const cloud of this.cloudFragments) {
      if (cloud.data.x < -CLOUD_CONFIG.RESPAWN_MARGIN * 2) {
        cloudsToRemove.push(cloud)
      }
    }

    // Remove off-screen clouds and spawn replacements in batches
    if (cloudsToRemove.length > 0) {
      const replacementPromises: Promise<CloudFragment | null>[] = []

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

        // Queue replacement spawn
        replacementPromises.push(this.spawnCloud(undefined, layerKey, this.currentSkyGradient))
      }

      // Spawn replacements
      await Promise.all(replacementPromises)
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

    // Update sky background to handle new screen dimensions
    this.updateSkyBackground()
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

    // Check for clouds that need respawning (throttled for performance)
    if (now - this.lastCloudSpawnCheck > this.CLOUD_SPAWN_CHECK_INTERVAL) {
      await this.checkAndSpawnClouds()
      this.lastCloudSpawnCheck = now
    }

    // Update all cloud fragments (position only, no expensive operations)
    for (const cloud of this.cloudFragments) {
      cloud.update(deltaTime)
    }

    this.updateStars()
  }

  private async updateCloudSettings(settings: CloudSettings): Promise<void> {
    const oldDepthLayers = this.cloudSettings.depthLayers
    const oldCloudCount = this.cloudSettings.cloudCount
    const oldSpeed = this.cloudSettings.speed
    this.cloudSettings = settings

    // If only speed changed, just update existing clouds
    if (
      oldDepthLayers === settings.depthLayers &&
      oldCloudCount === settings.cloudCount &&
      oldSpeed !== settings.speed
    ) {
      // Update speed for existing clouds efficiently
      for (const cloud of this.cloudFragments) {
        cloud.data.speed = settings.speed * cloud.data.speedMultiplier
      }
      return
    }

    // Only recreate clouds if depth layers or cloud count changed
    if (oldDepthLayers !== settings.depthLayers || oldCloudCount !== settings.cloudCount) {
      console.log(
        `Cloud settings changing: oldCount=${oldCloudCount}, newCount=${settings.cloudCount}, currentClouds=${this.cloudFragments.length}`,
      )

      // Set flag to prevent race conditions with checkAndSpawnClouds
      this.isUpdatingSettings = true

      try {
        // Properly clean up existing clouds in batches to avoid blocking
        const CLEANUP_BATCH_SIZE = 20
        for (let i = 0; i < this.cloudFragments.length; i += CLEANUP_BATCH_SIZE) {
          const batch = this.cloudFragments.slice(i, i + CLEANUP_BATCH_SIZE)
          for (const cloud of batch) {
            const depthContainer = this.depthContainers.get(cloud.data.depthLayer)
            if (depthContainer) {
              depthContainer.removeChild(cloud.displayObject)
            }
            cloud.destroy()
          }

          // Small delay between cleanup batches
          if (i + CLEANUP_BATCH_SIZE < this.cloudFragments.length) {
            await new Promise((resolve) => setTimeout(resolve, 1))
          }
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

        // Add a small delay to ensure cleanup is complete
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Create new clouds with proper error handling
        await this.createInitialClouds()
        console.log(`Cloud settings updated: ${this.cloudFragments.length} clouds created`)
      } catch (error) {
        console.error('Failed to create initial clouds after settings change:', error)
      } finally {
        // Clear flag to allow normal operation
        this.isUpdatingSettings = false
      }
      return
    }

    // If we get here, no significant changes were made
    console.log('Cloud settings updated with no significant changes')
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

    // Clean up radial gradient resources
    if (this.radialGradientSprite) {
      this.radialGradientSprite.destroy()
      this.radialGradientSprite = null
    }
    if (this.radialGradientContainer) {
      this.radialGradientContainer.destroy()
      this.radialGradientContainer = null
    }

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
