import * as PIXI from 'pixi.js'
import { CLOUD_CONFIG } from '../constants'
import type { CloudData } from '../types'

export class Cloud {
  public sprite: PIXI.Sprite
  public data: CloudData

  constructor(texture: PIXI.Texture, screenWidth: number, screenHeight: number) {
    this.sprite = new PIXI.Sprite(texture)
    this.data = this.generateCloudData(screenWidth, screenHeight)
    this.initializeSprite()
  }

  private generateCloudData(screenWidth: number, screenHeight: number): CloudData {
    return {
      x: screenWidth + CLOUD_CONFIG.RESPAWN_MARGIN,
      y: Math.random() * screenHeight * 0.8,
      scale:
        CLOUD_CONFIG.MIN_SCALE + Math.random() * (CLOUD_CONFIG.MAX_SCALE - CLOUD_CONFIG.MIN_SCALE),
      speed:
        CLOUD_CONFIG.SPEED_MIN + Math.random() * (CLOUD_CONFIG.SPEED_MAX - CLOUD_CONFIG.SPEED_MIN),
      alpha: 0,
      fadeDirection: 1,
      noiseOffset: Math.random() * 1000,
    }
  }

  private initializeSprite(): void {
    this.sprite.anchor.set(0.5)
    this.sprite.position.set(this.data.x, this.data.y)
    this.sprite.scale.set(this.data.scale)
    this.sprite.alpha = this.data.alpha
  }

  update(deltaTime: number, screenWidth: number, screenHeight: number): void {
    // Move cloud from right to left
    this.data.x -= this.data.speed * deltaTime

    // Handle fade in/out
    this.data.alpha += this.data.fadeDirection * CLOUD_CONFIG.FADE_SPEED * deltaTime

    if (this.data.alpha >= 1) {
      this.data.alpha = 1
      this.data.fadeDirection = -1
    } else if (this.data.alpha <= 0) {
      this.data.alpha = 0
      this.data.fadeDirection = 1
    }

    // Respawn cloud when it goes off screen
    if (this.data.x < -CLOUD_CONFIG.RESPAWN_MARGIN) {
      this.respawn(screenWidth, screenHeight)
    }

    // Update sprite properties
    this.sprite.position.set(this.data.x, this.data.y)
    this.sprite.alpha = this.data.alpha
  }

  private respawn(screenWidth: number, screenHeight: number): void {
    this.data.x = screenWidth + CLOUD_CONFIG.RESPAWN_MARGIN
    this.data.y = Math.random() * screenHeight * 0.8
    this.data.scale =
      CLOUD_CONFIG.MIN_SCALE + Math.random() * (CLOUD_CONFIG.MAX_SCALE - CLOUD_CONFIG.MIN_SCALE)
    this.data.speed =
      CLOUD_CONFIG.SPEED_MIN + Math.random() * (CLOUD_CONFIG.SPEED_MAX - CLOUD_CONFIG.SPEED_MIN)
    this.data.alpha = 0
    this.data.fadeDirection = 1
    this.data.noiseOffset = Math.random() * 1000

    this.sprite.scale.set(this.data.scale)
  }

  destroy(): void {
    this.sprite.destroy()
  }
}
