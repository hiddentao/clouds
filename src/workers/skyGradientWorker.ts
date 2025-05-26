import * as Comlink from 'comlink'
import type { SkyGradient, SunPosition, TimeOfDay } from '../types'

const skyGradientCalculator = {
  getGradientColorsForTimeOfDay(timeOfDay: TimeOfDay): [number, number, number][] {
    switch (timeOfDay) {
      case 'deep_night':
        return [
          [0.01, 0.01, 0.05],
          [0.02, 0.02, 0.08],
          [0.03, 0.03, 0.1],
        ] // Almost black to very dark blue
      case 'night_before_dawn':
        return [
          [0.02, 0.02, 0.08],
          [0.03, 0.03, 0.12],
          [0.05, 0.05, 0.15],
        ] // Dark blue to very dark blue
      case 'dawn':
        return [
          [0.15, 0.1, 0.25],
          [0.3, 0.15, 0.35],
          [0.5, 0.25, 0.4],
          [0.7, 0.35, 0.35],
        ] // Deep purple to reddish purple
      case 'sunrise':
        return [
          [0.8, 0.4, 0.3],
          [0.95, 0.6, 0.2],
          [1.0, 0.8, 0.3],
          [1.0, 0.9, 0.5],
        ] // Orange-pink to bright golden yellow
      case 'morning':
        return [
          [0.5, 0.7, 0.95],
          [0.65, 0.8, 0.98],
          [0.8, 0.9, 1.0],
          [0.9, 0.95, 1.0],
        ] // Clear blue to very light blue
      case 'solar_noon_transition':
        return [
          [0.55, 0.75, 1.0],
          [0.7, 0.85, 1.0],
          [0.85, 0.92, 1.0],
          [0.95, 0.98, 1.0],
        ] // Bright blue to almost white blue
      case 'solar_noon':
        return [
          [0.6, 0.8, 1.0],
          [0.85, 0.92, 1.0],
          [0.98, 0.99, 1.0],
          [1.0, 1.0, 1.0],
        ] // Pure blue to pure white
      case 'afternoon':
        return [
          [0.58, 0.78, 1.0],
          [0.72, 0.86, 1.0],
          [0.86, 0.93, 1.0],
          [0.93, 0.96, 1.0],
        ] // Clear blue (slightly warmer) to almost white
      case 'evening_transition':
        return [
          [0.5, 0.65, 0.9],
          [0.65, 0.75, 0.85],
          [0.8, 0.82, 0.85],
          [0.9, 0.88, 0.85],
        ] // Evening blue to warm gray
      case 'sunset':
        return [
          [0.9, 0.6, 0.35],
          [0.7, 0.45, 0.5],
          [1.0, 0.75, 0.25],
          [0.8, 0.5, 0.6],
        ] // Orange-pink, purple-pink, bright orange, reddish purple
      case 'dusk':
        return [
          [0.45, 0.3, 0.55],
          [0.25, 0.2, 0.45],
          [0.15, 0.1, 0.3],
        ] // Purple to deep purple/dark purple
      case 'night_after_dusk':
        return [
          [0.08, 0.05, 0.2],
          [0.12, 0.08, 0.25],
          [0.05, 0.03, 0.12],
        ] // Deep night blue to dark blue
      default: // Fallback for any unmapped TimeOfDay, or general default
        return [
          [0.5, 0.7, 1.0],
          [0.7, 0.85, 1.0],
          [0.85, 0.92, 1.0],
        ]
    }
  },
  // Copied and adjusted: getSunColorForTimeOfDay
  getSunColorForTimeOfDay(timeOfDay: TimeOfDay): [number, number, number] {
    switch (timeOfDay) {
      case 'deep_night':
      case 'night_before_dawn':
      case 'night_after_dusk':
        return [0.1, 0.1, 0.2] // Dark blue/purple sun for deep night
      case 'dawn':
      case 'dusk':
        return [0.8, 0.5, 0.3] // Muted orange for dawn/dusk
      case 'sunrise':
      case 'sunset':
        return [1.0, 0.7, 0.2] // Bright orange/yellow for sunrise/sunset
      case 'morning':
      case 'afternoon':
      case 'solar_noon_transition':
        return [1.0, 1.0, 0.9] // Bright yellow-white for day
      case 'solar_noon':
        return [1.0, 1.0, 1.0] // Pure white at noon
      default:
        return [1.0, 1.0, 0.9]
    }
  },
  // Copied and adjusted: getCloudColorsForTimeOfDay
  getCloudColorsForTimeOfDay(timeOfDay: TimeOfDay): {
    cloudBaseColor: [number, number, number]
    cloudHighlightColor: [number, number, number]
    cloudShadowColor: [number, number, number]
  } {
    switch (timeOfDay) {
      case 'deep_night':
      case 'night_before_dawn':
      case 'night_after_dusk':
        return {
          cloudBaseColor: [0.12, 0.12, 0.22],
          cloudHighlightColor: [0.2, 0.2, 0.3],
          cloudShadowColor: [0.06, 0.06, 0.12],
        }
      case 'dawn':
      case 'dusk':
        return {
          cloudBaseColor: [0.6, 0.45, 0.55],
          cloudHighlightColor: [0.8, 0.7, 0.75],
          cloudShadowColor: [0.35, 0.2, 0.3],
        }
      case 'sunrise':
      case 'sunset':
        return {
          cloudBaseColor: [0.75, 0.55, 0.5],
          cloudHighlightColor: [0.95, 0.8, 0.7],
          cloudShadowColor: [0.45, 0.3, 0.25],
        } // Warmer, more vibrant
      case 'morning':
      case 'solar_noon_transition':
      case 'afternoon':
      case 'solar_noon':
        return {
          cloudBaseColor: [0.9, 0.9, 0.95],
          cloudHighlightColor: [1.0, 1.0, 1.0],
          cloudShadowColor: [0.65, 0.65, 0.75],
        } // Standard day clouds
      default:
        return {
          cloudBaseColor: [0.9, 0.9, 0.95],
          cloudHighlightColor: [1.0, 1.0, 1.0],
          cloudShadowColor: [0.65, 0.65, 0.75],
        }
    }
  },
  // Copied and adjusted: easeInOutCubic
  easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
  },
  // Copied and adjusted: interpolateColor
  interpolateColor(
    color1: [number, number, number],
    color2: [number, number, number],
    progress: number,
  ): [number, number, number] {
    return [
      color1[0] + (color2[0] - color1[0]) * progress,
      color1[1] + (color2[1] - color1[1]) * progress,
      color1[2] + (color2[2] - color1[2]) * progress,
    ]
  },
  // Copied and adjusted: interpolateGradientColors
  interpolateGradientColors(
    colors1: [number, number, number][],
    colors2: [number, number, number][],
    progress: number,
  ): [number, number, number][] {
    const maxLength = Math.max(colors1.length, colors2.length)
    const result: [number, number, number][] = []
    for (let i = 0; i < maxLength; i++) {
      const c1 = colors1[Math.min(i, colors1.length - 1)]
      const c2 = colors2[Math.min(i, colors2.length - 1)]
      result.push(this.interpolateColor(c1, c2, progress))
    }
    return result
  },
  // Copied and adjusted: calculateTransitionInfo
  calculateTransitionInfo(
    sunPosition: SunPosition,
    currentTimeMs?: number,
  ): { isTransitioning: boolean; nextTimeOfDayName: TimeOfDay; progress: number } {
    const currentPeriod = sunPosition.currentTimePeriod
    const now = currentTimeMs || Date.now()

    // Define the chronological order of TimeOfDay names based on typical solar progression.
    const timeOfDayChronologicalOrder: TimeOfDay[] = [
      'deep_night',
      'night_before_dawn',
      'dawn',
      'sunrise',
      'morning',
      'solar_noon_transition',
      'solar_noon',
      'afternoon',
      'evening_transition',
      'sunset',
      'dusk',
      'night_after_dusk',
      'deep_night', // Ends with deep_night to loop to start
    ]

    let currentIndex = timeOfDayChronologicalOrder.indexOf(currentPeriod.name)
    // If currentPeriod.name is 'deep_night' and it's the one at the end of the array (meaning it's past midnight leading to a new day's cycle beginning),
    // we might need to adjust currentIndex to ensure 'next' picks the start of the cycle.
    // However, SunCalculator should give the correct currentPeriod.name for the *current actual time*.
    // This order is primarily to find what the *next* distinct phase is for color interpolation.
    if (currentIndex === -1) {
      // Should not happen if currentPeriod.name is always in the list
      console.warn(
        'Current period name not in chronological order for transition: ',
        currentPeriod.name,
      )
      currentIndex = 0 // Default to start if lookup fails
    }

    const nextTimeOfDayName =
      timeOfDayChronologicalOrder[(currentIndex + 1) % timeOfDayChronologicalOrder.length]

    let periodProgress = 0
    const periodDuration = currentPeriod.endTime - currentPeriod.startTime
    if (periodDuration > 0) {
      const timeIntoPeriod = now - currentPeriod.startTime
      periodProgress = Math.max(0, Math.min(1, timeIntoPeriod / periodDuration))
    }

    const transitionThreshold = 0.75
    let isTransitioning = false
    let progress = 0

    if (periodProgress >= transitionThreshold) {
      isTransitioning = true
      progress = (periodProgress - transitionThreshold) / (1 - transitionThreshold)
      progress = this.easeInOutCubic(Math.min(1, Math.max(0, progress)))
    }

    return { isTransitioning, nextTimeOfDayName, progress }
  },

  // Main worker method exposed via Comlink
  generateSkyGradient(sunPosition: SunPosition, currentTimeEpochMs?: number): SkyGradient {
    // currentTimeEpochMs is passed as Date.getTime() from main thread
    const currentPeriodName = sunPosition.currentTimePeriod.name
    const transitionInfo = this.calculateTransitionInfo(sunPosition, currentTimeEpochMs)

    const currentGradientColors = this.getGradientColorsForTimeOfDay(currentPeriodName)
    const currentCloudColors = this.getCloudColorsForTimeOfDay(currentPeriodName)
    const currentSunColor = this.getSunColorForTimeOfDay(currentPeriodName)

    if (transitionInfo.isTransitioning && transitionInfo.nextTimeOfDayName !== currentPeriodName) {
      const nextGradientColors = this.getGradientColorsForTimeOfDay(
        transitionInfo.nextTimeOfDayName,
      )
      const nextCloudColors = this.getCloudColorsForTimeOfDay(transitionInfo.nextTimeOfDayName)
      const nextSunColor = this.getSunColorForTimeOfDay(transitionInfo.nextTimeOfDayName)
      return {
        gradientColors: this.interpolateGradientColors(
          currentGradientColors,
          nextGradientColors,
          transitionInfo.progress,
        ),
        sunColor: this.interpolateColor(currentSunColor, nextSunColor, transitionInfo.progress),
        cloudBaseColor: this.interpolateColor(
          currentCloudColors.cloudBaseColor,
          nextCloudColors.cloudBaseColor,
          transitionInfo.progress,
        ),
        cloudHighlightColor: this.interpolateColor(
          currentCloudColors.cloudHighlightColor,
          nextCloudColors.cloudHighlightColor,
          transitionInfo.progress,
        ),
        cloudShadowColor: this.interpolateColor(
          currentCloudColors.cloudShadowColor,
          nextCloudColors.cloudShadowColor,
          transitionInfo.progress,
        ),
      }
    }
    return {
      gradientColors: currentGradientColors,
      sunColor: currentSunColor,
      ...currentCloudColors,
    }
  },
}

Comlink.expose(skyGradientCalculator)

export type SkyGradientWorker = typeof skyGradientCalculator
