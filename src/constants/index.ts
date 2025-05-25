export const CANVAS_CONFIG = {
  BACKGROUND_COLOR: 0x87ceeb,
  ANTIALIAS: false,
  RESOLUTION: 1,
} as const

export const CLOUD_CONFIG = {
  COUNT: 8,
  MIN_SCALE: 0.5,
  MAX_SCALE: 1.5,
  SPEED_MIN: 0.2,
  SPEED_MAX: 0.8,
  FADE_SPEED: 0.01,
  RESPAWN_MARGIN: 200,
} as const

export const NOISE_CONFIG = {
  OCTAVES: 4,
  PERSISTENCE: 0.5,
  SCALE: 0.01,
  ANIMATION_SPEED: 0.001,
} as const

export const SHADER_CONFIG = {
  PIXELATION_FACTOR: 8,
  CLOUD_THRESHOLD: 0.3,
  SHADOW_OFFSET: 0.1,
  SHADOW_INTENSITY: 0.6,
} as const

export const COLORS = {
  CLOUD_BASE: [1.0, 0.95, 0.9] as [number, number, number],
  CLOUD_HIGHLIGHT: [1.0, 0.98, 0.95] as [number, number, number],
  CLOUD_SHADOW: [0.7, 0.65, 0.6] as [number, number, number],
  GRADIENT_START: [1.0, 0.8, 0.9] as [number, number, number],
  GRADIENT_END: [0.9, 0.7, 0.8] as [number, number, number],
} as const
