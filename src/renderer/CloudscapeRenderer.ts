import * as PIXI from 'pixi.js'
import { type CloudSettings, Sidebar } from '../components/Sidebar'
import { CANVAS_CONFIG, CLOUD_CONFIG } from '../constants'
import { CloudFragment } from '../entities/CloudFragment'
import type { LocationData, SkyGradient, SunPosition } from '../types'
import { LocationService } from '../utils/locationService'
import { SkyGradientService } from '../utils/skyGradientService'
import { SunCalculator } from '../utils/sunCalculator'

export class CloudscapeRenderer {
  private app: PIXI.Application
  private cloudFragments: CloudFragment[] = []
  private cloudContainer: PIXI.Container
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
  }

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

    this.locationService = LocationService.getInstance()
    this.sunCalculator = SunCalculator.getInstance()
    this.skyGradientService = SkyGradientService.getInstance()

    // Create sidebar with time control and cloud settings
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

  private async initialize(): Promise<void> {
    try {
      this.currentLocation = await this.locationService.getCurrentLocation()
      this.updateSunPosition()
      await this.createSkyBackground()
      this.createClouds()
      this.setupEventListeners()
      this.startAnimation()

      // Add sidebar to DOM
      document.body.appendChild(this.sidebar.getElement())
    } catch (error) {
      console.error('Failed to initialize cloudscape:', error)
      // Fallback initialization without location
      this.createClouds()
      this.setupEventListeners()
      this.startAnimation()

      // Add sidebar to DOM even on error
      document.body.appendChild(this.sidebar.getElement())
    }
  }

  private updateSunPosition(): void {
    if (!this.currentLocation) return

    // Use custom time if available, otherwise use current time
    const timeToUse = this.customTime || new Date()

    this.currentSunPosition = this.sunCalculator.calculateSunPosition(
      this.currentLocation,
      timeToUse,
    )
    this.currentSkyGradient = this.skyGradientService.generateSkyGradient(this.currentSunPosition)

    console.log('Sun position updated:', {
      time: timeToUse.toLocaleTimeString(),
      timeOfDay: this.currentSunPosition.timeOfDay,
      altitude: this.currentSunPosition.altitude,
      azimuth: this.currentSunPosition.azimuth,
      isDay: this.currentSunPosition.isDay,
      isDawn: this.currentSunPosition.isDawn,
      isDusk: this.currentSunPosition.isDusk,
      isNight: this.currentSunPosition.isNight,
    })

    this.updateSkyBackground()
  }

  private async createSkyBackground(): Promise<void> {
    // Create a smooth multi-color gradient background
    const graphics = new PIXI.Graphics()

    if (this.currentSkyGradient) {
      // Create a smooth vertical gradient with multiple colors
      const gradientColors = this.currentSkyGradient.gradientColors

      const totalStrips = 100 // More strips for smoother transitions
      const stripHeight = this.app.screen.height / totalStrips

      for (let i = 0; i < totalStrips; i++) {
        const t = i / (totalStrips - 1) // Interpolation factor (0 to 1)

        // Find which color segment we're in
        const segmentSize = 1 / (gradientColors.length - 1)
        const segmentIndex = Math.floor(t / segmentSize)
        const segmentT = (t % segmentSize) / segmentSize

        // Get the two colors to interpolate between
        const color1 = gradientColors[Math.min(segmentIndex, gradientColors.length - 1)]
        const color2 = gradientColors[Math.min(segmentIndex + 1, gradientColors.length - 1)]

        // Interpolate between the two colors
        const r = Math.round((color1[0] + (color2[0] - color1[0]) * segmentT) * 255)
        const g = Math.round((color1[1] + (color2[1] - color1[1]) * segmentT) * 255)
        const b = Math.round((color1[2] + (color2[2] - color1[2]) * segmentT) * 255)

        const color = (r << 16) | (g << 8) | b

        graphics.beginFill(color)
        graphics.drawRect(0, i * stripHeight, this.app.screen.width, stripHeight + 1) // +1 to avoid gaps
        graphics.endFill()
      }
    } else {
      // Fallback to simple sky blue
      graphics.beginFill(0x87ceeb)
      graphics.drawRect(0, 0, this.app.screen.width, this.app.screen.height)
      graphics.endFill()
    }

    const skyTexture = this.app.renderer.generateTexture(graphics)
    this.skySprite = new PIXI.Sprite(skyTexture)
    this.skySprite.width = this.app.screen.width
    this.skySprite.height = this.app.screen.height

    graphics.destroy()
    this.skyContainer.addChild(this.skySprite)
  }

  private createClouds(): void {
    // Create initial clouds spread across the screen
    for (let i = 0; i < this.cloudSettings.cloudCount; i++) {
      this.spawnCloud(i)
    }
  }

  private spawnCloud(index?: number): CloudFragment {
    const cloud = new CloudFragment(this.app.screen.width, this.app.screen.height)

    // Set cloud speed from settings
    cloud.data.speed = this.cloudSettings.speed

    if (index !== undefined) {
      // Initial positioning - spread across much wider area to prevent gaps
      const totalWidth = this.app.screen.width * 3 + CLOUD_CONFIG.RESPAWN_MARGIN * 2
      const spacing = totalWidth / this.cloudSettings.cloudCount
      const baseX = -CLOUD_CONFIG.RESPAWN_MARGIN - this.app.screen.width + index * spacing
      const randomOffset = (Math.random() - 0.5) * spacing * 0.6
      cloud.data.x = baseX + randomOffset
    } else {
      // New spawn - start from right side with varied distance
      const spawnDistance = CLOUD_CONFIG.RESPAWN_MARGIN + Math.random() * 400
      cloud.data.x = this.app.screen.width + spawnDistance
    }

    // Position clouds in specific height bands with more variation
    const heightBand = Math.random()
    const verticalVariation = (Math.random() - 0.5) * 0.4 // Additional vertical randomization

    if (heightBand < 0.4) {
      // Lower clouds (40% chance) with more vertical spread
      const baseY = this.app.screen.height * (0.6 + verticalVariation * 0.2)
      cloud.data.y = baseY + Math.random() * this.app.screen.height * 0.35
    } else if (heightBand < 0.7) {
      // Middle clouds (30% chance) with varied positioning
      const baseY = this.app.screen.height * (0.4 + verticalVariation * 0.15)
      cloud.data.y = baseY + Math.random() * this.app.screen.height * 0.25
    } else {
      // Upper clouds (30% chance) with more spread
      const baseY = this.app.screen.height * (0.1 + verticalVariation * 0.1)
      cloud.data.y = baseY + Math.random() * this.app.screen.height * 0.35
    }

    cloud.sprite.position.set(cloud.data.x, cloud.data.y)

    this.cloudFragments.push(cloud)
    this.cloudContainer.addChild(cloud.sprite)

    return cloud
  }

  private checkAndSpawnClouds(): void {
    // Count clouds currently visible on screen
    const visibleClouds = this.cloudFragments.filter(
      (cloud) =>
        cloud.data.x > -CLOUD_CONFIG.RESPAWN_MARGIN &&
        cloud.data.x < this.app.screen.width + CLOUD_CONFIG.RESPAWN_MARGIN,
    ).length

    // Use dynamic cloud count from settings
    const minOnScreen = Math.floor(this.cloudSettings.cloudCount * 0.8) // 80% of target count
    const maxTotal = Math.floor(this.cloudSettings.cloudCount * 1.2) // 120% of target count

    // Spawn new clouds if below minimum
    if (visibleClouds < minOnScreen && this.cloudFragments.length < maxTotal) {
      const cloudsToSpawn = Math.min(
        minOnScreen - visibleClouds,
        maxTotal - this.cloudFragments.length,
      )

      for (let i = 0; i < cloudsToSpawn; i++) {
        this.spawnCloud()
      }
    }

    // Remove clouds that are too far off screen to prevent memory issues
    this.cloudFragments = this.cloudFragments.filter((cloud) => {
      if (cloud.data.x < -CLOUD_CONFIG.RESPAWN_MARGIN * 2) {
        this.cloudContainer.removeChild(cloud.sprite)
        cloud.destroy()
        return false
      }
      return true
    })
  }

  private updateSkyBackground(): void {
    if (!this.skySprite || !this.currentSkyGradient) return

    // Update sky background with smooth multi-color gradient
    const graphics = new PIXI.Graphics()
    const gradientColors = this.currentSkyGradient.gradientColors

    const totalStrips = 100 // More strips for smoother transitions
    const stripHeight = this.app.screen.height / totalStrips

    for (let i = 0; i < totalStrips; i++) {
      const t = i / (totalStrips - 1) // Interpolation factor (0 to 1)

      // Find which color segment we're in
      const segmentSize = 1 / (gradientColors.length - 1)
      const segmentIndex = Math.floor(t / segmentSize)
      const segmentT = (t % segmentSize) / segmentSize

      // Get the two colors to interpolate between
      const color1 = gradientColors[Math.min(segmentIndex, gradientColors.length - 1)]
      const color2 = gradientColors[Math.min(segmentIndex + 1, gradientColors.length - 1)]

      // Interpolate between the two colors
      const r = Math.round((color1[0] + (color2[0] - color1[0]) * segmentT) * 255)
      const g = Math.round((color1[1] + (color2[1] - color1[1]) * segmentT) * 255)
      const b = Math.round((color1[2] + (color2[2] - color1[2]) * segmentT) * 255)

      const color = (r << 16) | (g << 8) | b

      graphics.beginFill(color)
      graphics.drawRect(0, i * stripHeight, this.app.screen.width, stripHeight + 1) // +1 to avoid gaps
      graphics.endFill()
    }

    const newTexture = this.app.renderer.generateTexture(graphics)
    this.skySprite.texture = newTexture
    graphics.destroy()
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

  private update(deltaTime: number): void {
    this.time += deltaTime * 0.003

    // Update sun position periodically
    const now = Date.now()
    if (now - this.lastSunUpdate > this.SUN_UPDATE_INTERVAL) {
      this.updateSunPosition()
      this.lastSunUpdate = now
    }

    // Check and spawn clouds using randomized intervals
    if (now >= this.nextSpawnTime) {
      this.checkAndSpawnClouds()
      // Set next spawn time with randomized interval
      const randomInterval = this.cloudSettings.spawnInterval > 0 
        ? Math.random() * this.cloudSettings.spawnInterval 
        : 0
      this.nextSpawnTime = now + randomInterval
    }

    // Update all cloud fragments
    for (const cloud of this.cloudFragments) {
      cloud.update(deltaTime)
    }
  }

  private updateCloudSettings(settings: CloudSettings): void {
    const oldSpawnInterval = this.cloudSettings.spawnInterval
    this.cloudSettings = settings

    // Reset spawn timing if spawn interval changed
    if (oldSpawnInterval !== settings.spawnInterval) {
      this.nextSpawnTime = Date.now()
    }

    // Adjust cloud count
    const currentCount = this.cloudFragments.length
    const targetCount = settings.cloudCount

    if (currentCount < targetCount) {
      // Add more clouds
      for (let i = currentCount; i < targetCount; i++) {
        this.spawnCloud()
      }
    } else if (currentCount > targetCount) {
      // Remove excess clouds
      const cloudsToRemove = currentCount - targetCount
      for (let i = 0; i < cloudsToRemove; i++) {
        const cloud = this.cloudFragments.pop()
        if (cloud) {
          this.cloudContainer.removeChild(cloud.sprite)
          cloud.destroy()
        }
      }
    }

    // Update speed for existing clouds
    for (const cloud of this.cloudFragments) {
      cloud.data.speed = settings.speed
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
}
