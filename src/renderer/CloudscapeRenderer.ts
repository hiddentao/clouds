import * as PIXI from 'pixi.js'
import { CANVAS_CONFIG, CLOUD_CONFIG, COLORS, SHADER_CONFIG } from '../constants'
import { Cloud } from '../entities/Cloud'
import { cloudFragmentShader, cloudVertexShader } from '../shaders/cloudShader'
import type { ShaderUniforms } from '../types'

export class CloudscapeRenderer {
  private app: PIXI.Application
  private clouds: Cloud[] = []
  private cloudTexture: PIXI.Texture | null = null
  private cloudShader: PIXI.Filter | null = null
  private container: PIXI.Container
  private time = 0

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application({
      view: canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: CANVAS_CONFIG.BACKGROUND_COLOR,
      antialias: CANVAS_CONFIG.ANTIALIAS,
      resolution: CANVAS_CONFIG.RESOLUTION,
    })

    this.container = new PIXI.Container()
    this.app.stage.addChild(this.container)

    this.initialize()
  }

  private async initialize(): Promise<void> {
    await this.createCloudTexture()
    this.createCloudShader()
    this.createClouds()
    this.setupEventListeners()
    this.startAnimation()
  }

  private async createCloudTexture(): Promise<void> {
    const graphics = new PIXI.Graphics()
    graphics.beginFill(0xffffff)
    graphics.drawCircle(0, 0, 100)
    graphics.endFill()

    this.cloudTexture = this.app.renderer.generateTexture(graphics)
    graphics.destroy()
  }

  private createCloudShader(): void {
    const uniforms: ShaderUniforms = {
      uTime: 0,
      uResolution: [this.app.screen.width, this.app.screen.height],
      uNoiseScale: 5.0,
      uPixelationFactor: SHADER_CONFIG.PIXELATION_FACTOR,
      uCloudThreshold: SHADER_CONFIG.CLOUD_THRESHOLD,
      uShadowOffset: SHADER_CONFIG.SHADOW_OFFSET,
      uShadowIntensity: SHADER_CONFIG.SHADOW_INTENSITY,
      uGradientStart: COLORS.GRADIENT_START,
      uGradientEnd: COLORS.GRADIENT_END,
    }

    this.cloudShader = new PIXI.Filter(cloudVertexShader, cloudFragmentShader, uniforms)
    this.container.filters = [this.cloudShader]
  }

  private createClouds(): void {
    if (!this.cloudTexture) return

    for (let i = 0; i < CLOUD_CONFIG.COUNT; i++) {
      const cloud = new Cloud(this.cloudTexture, this.app.screen.width, this.app.screen.height)

      // Stagger initial positions
      cloud.data.x = this.app.screen.width + i * 200
      cloud.sprite.position.set(cloud.data.x, cloud.data.y)

      this.clouds.push(cloud)
      this.container.addChild(cloud.sprite)
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.handleResize.bind(this))
  }

  private handleResize(): void {
    this.app.renderer.resize(window.innerWidth, window.innerHeight)

    if (this.cloudShader) {
      this.cloudShader.uniforms.uResolution = [window.innerWidth, window.innerHeight]
    }
  }

  private startAnimation(): void {
    this.app.ticker.add(this.update.bind(this))
  }

  private update(deltaTime: number): void {
    this.time += deltaTime * 0.01

    // Update shader time uniform
    if (this.cloudShader) {
      this.cloudShader.uniforms.uTime = this.time
    }

    // Update all clouds
    for (const cloud of this.clouds) {
      cloud.update(deltaTime, this.app.screen.width, this.app.screen.height)
    }
  }

  public destroy(): void {
    this.app.ticker.remove(this.update.bind(this))
    window.removeEventListener('resize', this.handleResize.bind(this))

    for (const cloud of this.clouds) {
      cloud.destroy()
    }

    this.clouds = []
    this.cloudTexture?.destroy()
    this.app.destroy(true)
  }
}
