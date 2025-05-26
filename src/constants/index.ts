export const CANVAS_CONFIG = {
  ANTIALIAS: false,
  RESOLUTION: 1,
} as const

export const CLOUD_CONFIG = {
  COUNT: 30,
  MIN_ON_SCREEN: 25,
  MAX_TOTAL: 50,
  MIN_SCALE: 0.3,
  MAX_SCALE: 2.0,
  SPEED_MIN: 0.1,
  SPEED_MAX: 0.3,
  FADE_SPEED: 0.02,
  RESPAWN_MARGIN: 400,
  SPAWN_INTERVAL: 2000, // milliseconds between spawn checks
} as const
