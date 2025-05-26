import * as Comlink from 'comlink'
import * as PIXI from 'pixi.js'
import { type CloudSettings, Sidebar } from '../components/Sidebar'
import { CANVAS_CONFIG, CLOUD_CONFIG, DEPTH_CONFIG, generateDepthLayers } from '../constants'
import { CloudFragment } from '../entities/CloudFragment'
import type { LocationData, SkyGradient, SunPosition } from '../types'
import { LocationService } from '../utils/locationService'
import { SkyGradientService } from '../utils/skyGradientService'
import { SunCalculator } from '../utils/sunCalculator'
import type { CloudDataWorker } from '../workers/cloudDataWorker'

export class CloudscapeRenderer {
  private app: PIXI.Application
  private cloudFragments: CloudFragment[] = []
  private cloudContainer: PIXI.Container
  private depthContainers: Map<string, PIXI.Container> = new Map()
  private skyContainer: PIXI.Container
  private skySprite: PIXI.Sprite | null = null
  private time = 0

  private locationService: LocationService
  private sunCalculator: SunCalculator
  private skyGradientService: SkyGradientService
  private currentLocation: LocationData | null = null
  private currentSunPosition: SunPosition | null = null
  private currentSkyGradient: SkyGradient | null = null

  private lastSunUpdate = 0
  private nextSpawnTime = 0
  private readonly SUN_UPDATE_INTERVAL = 60000

  private sidebar: Sidebar
  private customTime: Date | null = null
  private cloudSettings: CloudSettings = {
    cloudCount: CLOUD_CONFIG.MIN_CLOUDS,
    speed: (CLOUD_CONFIG.SPEED_MIN + CLOUD_CONFIG.SPEED_MAX) / 2,
    spawnInterval: CLOUD_CONFIG.SPAWN_INTERVAL_MIN,
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
    this.cloudContainer = new PIXI.Container()

    this.app.stage.addChild(this.skyContainer)
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

  private async createInitialClouds(): Promise<void> {
    const layerKeys = Object.keys(this.currentDepthLayers)
    const cloudPromises: Promise<CloudFragment | null>[] = []

    for (const layerKey of layerKeys) {
      const layerConfig = this.currentDepthLayers[layerKey]
      const depthMultiplier = 0.3 + layerConfig.depth * 0.7
      const cloudsForThisLayer = Math.floor(this.cloudSettings.cloudCount * depthMultiplier)

      for (let i = 0; i < cloudsForThisLayer; i++) {
        const totalWidth = this.app.screen.width * 3 + CLOUD_CONFIG.RESPAWN_MARGIN * 2
        const spacing = totalWidth / cloudsForThisLayer
        const baseX = -CLOUD_CONFIG.RESPAWN_MARGIN - this.app.screen.width + i * spacing
        const randomOffset = (Math.random() - 0.5) * spacing * 0.6
        const initialX = baseX + randomOffset
        // Pass currentSkyGradient for initial color calculation in worker
        cloudPromises.push(this.spawnCloud(initialX, layerKey, this.currentSkyGradient))
      }
    }
    const newCloudsWithNulls = await Promise.all(cloudPromises)
    const newClouds = newCloudsWithNulls.filter((c) => c !== null) as CloudFragment[]

    // Initial drawing for new clouds is handled within spawnCloud or by the first updateSkyGradient call
    // If an explicit initial draw is still needed after creation and before first regular update:
    const initialDrawPromises = newClouds.map((cloud) => {
      if (this.currentSkyGradient) {
        // Ensure renderer is available and texture exists before trying to draw
        // The check for !this.renderTexture in updateSkyGradient should handle initial draw.
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
      const weights = layerKeys.map((key) => 0.3 + (this.currentDepthLayers[key]?.depth || 0) * 0.7)
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
      let random = Math.random() * totalWeight
      // Ensure selectedLayerKey is definitely assigned a value from layerKeys
      selectedLayerKey = layerKeys[0] // Default to first layer if loop doesn't find one (should not happen if totalWeight > 0)
      for (let i = 0; i < layerKeys.length; i++) {
        if (random <= weights[i]) {
          selectedLayerKey = layerKeys[i]
          break
        }
        random -= weights[i]
      }
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
      const spawnDistance = CLOUD_CONFIG.RESPAWN_MARGIN + Math.random() * 400
      cloud.data.x = this.app.screen.width + spawnDistance
    }

    cloud.displayObject.alpha = cloud.data.alpha // Set final alpha on the sprite

    this.cloudFragments.push(cloud)
    const depthContainer = this.depthContainers.get(cloud.data.depthLayer)
    if (depthContainer) {
      depthContainer.addChild(cloud.displayObject)
    }

    // The first updateSkyGradient (if skyGradient is present and different or texture not ready)
    // will handle the initial drawing to the render texture.
    // If initialSkyGradientForWorker was null, and this.currentSkyGradient is now available,
    // this call will trigger the first color calculation and draw.
    if (this.currentSkyGradient) {
      await cloud.updateSkyGradient(this.currentSkyGradient, this.app.renderer as PIXI.Renderer)
    }

    return cloud
  }

  private async checkAndSpawnClouds(): Promise<void> {
    const visibleClouds = this.cloudFragments.filter(
      (cloud) =>
        cloud.data.x > -CLOUD_CONFIG.RESPAWN_MARGIN &&
        cloud.data.x < this.app.screen.width + CLOUD_CONFIG.RESPAWN_MARGIN,
    ).length

    const layerKeys = Object.keys(this.currentDepthLayers)
    let totalExpectedClouds = 0
    for (const layerKey of layerKeys) {
      const layerConfig = this.currentDepthLayers[layerKey]
      if (layerConfig) {
        // Check if layerConfig exists
        const depthMultiplier = 0.3 + layerConfig.depth * 0.7
        totalExpectedClouds += Math.floor(this.cloudSettings.cloudCount * depthMultiplier)
      }
    }

    const minOnScreen = Math.floor(totalExpectedClouds * 0.8)
    const maxTotal = Math.floor(totalExpectedClouds * 1.2)

    if (visibleClouds < minOnScreen && this.cloudFragments.length < maxTotal) {
      const cloudsToSpawn = Math.min(
        minOnScreen - visibleClouds,
        maxTotal - this.cloudFragments.length,
      )
      const spawnPromises: Promise<CloudFragment | null>[] = [] // Can be null
      for (let i = 0; i < cloudsToSpawn; i++) {
        spawnPromises.push(this.spawnCloud(undefined, undefined, this.currentSkyGradient))
      }
      const spawnedCloudsWithNulls = await Promise.all(spawnPromises)
      // Filter out nulls before doing anything else with them, though spawnCloud itself adds to this.cloudFragments
      // This step might be redundant if spawnCloud handles adding to this.cloudFragments correctly upon successful creation.
    }

    this.cloudFragments = this.cloudFragments.filter((cloud) => {
      if (cloud.data.x < -CLOUD_CONFIG.RESPAWN_MARGIN * 2) {
        const depthContainer = this.depthContainers.get(cloud.data.depthLayer)
        if (depthContainer) {
          depthContainer.removeChild(cloud.displayObject)
        }
        cloud.destroy()
        return false
      }
      return true
    })
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

    // Check and spawn clouds using randomized intervals
    if (now >= this.nextSpawnTime) {
      await this.checkAndSpawnClouds()
      // Set next spawn time with randomized interval
      const randomInterval =
        this.cloudSettings.spawnInterval > 0 ? Math.random() * this.cloudSettings.spawnInterval : 0
      this.nextSpawnTime = now + randomInterval
    }

    // Update all cloud fragments
    for (const cloud of this.cloudFragments) {
      cloud.update(deltaTime)
    }
  }

  private async updateCloudSettings(settings: CloudSettings): Promise<void> {
    const oldSpawnInterval = this.cloudSettings.spawnInterval
    const oldDepthLayers = this.cloudSettings.depthLayers
    const oldCloudCount = this.cloudSettings.cloudCount
    this.cloudSettings = settings

    if (oldDepthLayers !== settings.depthLayers || oldCloudCount !== settings.cloudCount) {
      for (const cloud of this.cloudFragments) {
        cloud.destroy()
      }
      this.cloudFragments = []

      this.initializeDepthLayers()

      await this.createInitialClouds() // createInitialClouds is already async
      return
    }

    if (oldSpawnInterval !== settings.spawnInterval) {
      this.nextSpawnTime = Date.now()
    }

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
    this.skySprite?.destroy()
    this.sidebar.destroy()
    this.app.destroy(true)
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
}
