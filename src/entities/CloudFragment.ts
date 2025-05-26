import type * as Comlink from 'comlink'
import * as PIXI from 'pixi.js'
import type { CloudFragmentData, SkyGradient } from '../types'
import type { CloudDataWorker, FullCloudData, PixelProperty } from '../workers/cloudDataWorker'

export class CloudFragment {
  public displayObject: PIXI.Sprite
  public data: CloudFragmentData
  private skyGradient: SkyGradient | null
  private renderTexture: PIXI.RenderTexture | null = null
  private graphicsForTexture: PIXI.Graphics
  private pixelProperties: PixelProperty[]
  private cloudDataWorker: Comlink.Remote<CloudDataWorker>
  private isUpdatingSkyGradient = false // Guard against concurrent updates
  private hasBeenDrawn = false // Track if texture has been drawn at least once

  private constructor(
    fullCloudData: FullCloudData,
    worker: Comlink.Remote<CloudDataWorker>,
    skyGradient?: SkyGradient | null,
  ) {
    this.data = fullCloudData.fragmentData
    this.pixelProperties = fullCloudData.pixelProperties
    this.skyGradient = skyGradient || null
    this.cloudDataWorker = worker
    this.hasBeenDrawn = false // Ensure new clouds start as not drawn

    this.displayObject = new PIXI.Sprite()
    this.graphicsForTexture = new PIXI.Graphics()

    this.createRenderTextureIfNeeded()
    this.initializeSpriteProperties()
  }

  public static async create(
    worker: Comlink.Remote<CloudDataWorker>,
    screenWidth: number,
    screenHeight: number,
    depthLayers?: Record<string, any>,
    initialSkyGradient?: SkyGradient | null,
  ): Promise<CloudFragment> {
    const fullCloudData = await worker.generateFullCloudData(
      screenWidth,
      screenHeight,
      depthLayers,
      initialSkyGradient,
    )
    return new CloudFragment(fullCloudData, worker, initialSkyGradient)
  }

  private createRenderTextureIfNeeded(): void {
    const rtWidth = Math.ceil(this.data.width)
    const rtHeight = Math.ceil(this.data.height)

    if (
      !this.renderTexture ||
      this.renderTexture.width !== rtWidth ||
      this.renderTexture.height !== rtHeight
    ) {
      if (this.renderTexture) {
        this.renderTexture.destroy(true)
      }
      this.renderTexture = PIXI.RenderTexture.create({ width: rtWidth, height: rtHeight })
      this.displayObject.texture = this.renderTexture
    }
  }

  private redrawToRenderTexture(renderer: PIXI.Renderer): void {
    if (!this.renderTexture) {
      console.error('No render texture available for redraw')
      return
    }

    this.graphicsForTexture.clear()

    for (const pixel of this.pixelProperties) {
      this.graphicsForTexture.beginFill(pixel.color, pixel.alpha)
      this.graphicsForTexture.drawRect(pixel.pixelX, pixel.pixelY, pixel.pixelSize, pixel.pixelSize)
      this.graphicsForTexture.endFill()
    }

    renderer.render(this.graphicsForTexture, { renderTexture: this.renderTexture, clear: true })
  }

  private initializeSpriteProperties(): void {
    this.displayObject.position.set(this.data.x, this.data.y)
    if (this.data.width > 0 && this.data.height > 0) {
      this.displayObject.pivot.set(this.data.width / 2, this.data.height / 2)
    }
    this.displayObject.x += this.data.width / 2
    this.displayObject.y += this.data.height / 2
    this.displayObject.alpha = this.data.alpha
  }

  update(deltaTime: number): void {
    this.data.x -= this.data.speed * deltaTime
    this.displayObject.position.set(this.data.x, this.data.y)
  }

  async updateSkyGradient(skyGradient: SkyGradient | null, renderer: PIXI.Renderer): Promise<void> {
    // Prevent concurrent updates
    if (this.isUpdatingSkyGradient) {
      return
    }

    // Check if this cloud has been destroyed (pixelProperties would be empty)
    if (this.pixelProperties.length === 0) {
      return
    }

    // Always draw if texture is not ready, or if sky gradient has changed, or if never drawn before
    const skyGradientChanged = this.skyGradient !== skyGradient
    const textureNotReady = !this.displayObject.texture || !this.renderTexture
    const needsRedraw = skyGradientChanged || textureNotReady || !this.hasBeenDrawn

    if (needsRedraw) {
      this.isUpdatingSkyGradient = true

      try {
        // Only recalculate colors if sky gradient has actually changed
        if (skyGradientChanged) {
          this.skyGradient = skyGradient

          const newColors = await this.cloudDataWorker.recalculatePixelColors(
            this.pixelProperties,
            this.skyGradient,
          )

          // Double-check that the cloud hasn't been destroyed while we were waiting for the worker
          if (this.pixelProperties.length === 0) {
            return
          }

          if (newColors.length === this.pixelProperties.length) {
            for (let i = 0; i < this.pixelProperties.length; i++) {
              this.pixelProperties[i].color = newColors[i]
            }
          } else {
            console.error('CloudFragment: Mismatch in length of new colors and pixel properties.', {
              newColorsLength: newColors.length,
              pixelPropertiesLength: this.pixelProperties.length,
              pixelProperties: this.pixelProperties,
              newColors: newColors,
            })
            // Fallback: only update colors for the minimum length to avoid crashes
            const minLength = Math.min(newColors.length, this.pixelProperties.length)
            for (let i = 0; i < minLength; i++) {
              this.pixelProperties[i].color = newColors[i]
            }
          }
        }

        // Always redraw the texture when needed
        this.redrawToRenderTexture(renderer)
        this.hasBeenDrawn = true // Mark as drawn
      } catch (error) {
        console.error('CloudFragment: Error updating sky gradient:', error)
      } finally {
        this.isUpdatingSkyGradient = false
      }
    }
  }

  destroy(): void {
    this.displayObject.destroy()
    if (this.renderTexture) {
      this.renderTexture.destroy(true)
      this.renderTexture = null
    }
    this.graphicsForTexture.destroy()
    this.pixelProperties = []
  }
}
