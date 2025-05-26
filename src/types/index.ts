export interface LocationData {
  latitude: number
  longitude: number
  timezone: string
  city: string
  country: string
}

export interface TimePeriodInfo {
  name: TimeOfDay
  startTime: number // Store as epoch milliseconds for easier transfer to worker
  endTime: number // Store as epoch milliseconds
}

export interface SunPosition {
  altitude: number
  azimuth: number
  isDay: boolean
  isDawn: boolean
  isDusk: boolean
  isNight: boolean
  timeOfDay: TimeOfDay // Keep the general name for broader categorization
  currentTimePeriod: TimePeriodInfo // Add specific start/end for current period
}

export type TimeOfDay =
  | 'night_before_dawn' // Astronomical dusk to civil dawn
  | 'dawn' // Civil dawn to sunrise start
  | 'sunrise' // Sunrise start to sunrise end (golden hour part 1)
  | 'morning' // Sunrise end to solar noon - 2 hours
  | 'solar_noon_transition' // Solar noon - 2 hours to solar noon
  | 'solar_noon' // Solar noon (peak)
  | 'afternoon' // Solar noon to sunset start - 2 hours
  | 'evening_transition' // Sunset start - 2 hours to sunset start
  | 'sunset' // Sunset start to sunset end (golden hour part 2)
  | 'dusk' // Sunset end to civil dusk
  | 'night_after_dusk' // Civil dusk to astronomical dusk (or midnight if no astro dusk)
  | 'deep_night' // Astronomical dusk to midnight / Midnight to astronomical dawn

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
  depth: number
  depthLayer: string
  scale: number
  speedMultiplier: number
}
