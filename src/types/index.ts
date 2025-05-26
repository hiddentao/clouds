export interface LocationData {
  latitude: number
  longitude: number
  timezone: string
  city: string
  country: string
}

export interface SunPosition {
  altitude: number
  azimuth: number
  isDay: boolean
  isDawn: boolean
  isDusk: boolean
  isNight: boolean
  timeOfDay: TimeOfDay
}

export type TimeOfDay =
  | 'midnight-to-sunrise'
  | 'sunrise-hour'
  | 'post-sunrise'
  | 'early-morning'
  | 'late-morning'
  | 'midday-hour'
  | 'early-afternoon'
  | 'late-afternoon'
  | 'early-evening'
  | 'dusk-hour'
  | 'post-dusk'
  | 'evening'
  | 'late-night'

export interface SkyGradient {
  gradientColors: [number, number, number][] // Array of colors from top to bottom
  sunColor: [number, number, number]
  cloudBaseColor: [number, number, number]
  cloudHighlightColor: [number, number, number]
  cloudShadowColor: [number, number, number]
}

export interface CloudFragmentData {
  x: number
  y: number
  width: number
  height: number
  speed: number
  alpha: number
  fadeDirection: number
  noiseOffset: number
  density: number
  type: 'wispy' | 'puffy' | 'dense' | 'scattered'
  layers: number
  turbulence: number
  shapeComplexity: number
  edgeSoftness: number
  rotation: number
  rotationSpeed: number
}
