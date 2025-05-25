export interface CloudData {
  x: number
  y: number
  scale: number
  speed: number
  alpha: number
  fadeDirection: number
  noiseOffset: number
}

export interface NoiseLayer {
  scale: number
  intensity: number
  offset: { x: number; y: number }
}

export interface ShaderUniforms {
  uTime: number
  uResolution: [number, number]
  uNoiseScale: number
  uPixelationFactor: number
  uCloudThreshold: number
  uShadowOffset: number
  uShadowIntensity: number
  uGradientStart: [number, number, number]
  uGradientEnd: [number, number, number]
}

export interface CloudscapeConfig {
  canvas: {
    backgroundColor: number
    antialias: boolean
    resolution: number
  }
  clouds: {
    count: number
    minScale: number
    maxScale: number
    speedMin: number
    speedMax: number
    fadeSpeed: number
    respawnMargin: number
  }
}
