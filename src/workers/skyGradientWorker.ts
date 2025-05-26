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
          [0.9, 0.95, 1.0], // Light yellow-white at sun
          [0.6, 0.75, 0.98], // Very light blue
          [0.5, 0.7, 0.95], // Light blue
          [0.4, 0.6, 0.9], // Medium blue at edges
        ]
      case 'solar_noon_transition':
      case 'solar_noon':
        return [
          [0.95, 0.98, 1.0], // Very light yellow-white at sun
          [0.6, 0.75, 0.98], // Very light blue
          [0.5, 0.7, 0.95], // Light blue
          [0.35, 0.55, 0.85], // Deeper blue at edges
        ]
      case 'afternoon':
        return [
          [0.9, 0.95, 1.0], // Light yellow-white at sun
          [0.6, 0.75, 0.98], // Very light blue
          [0.5, 0.7, 0.95], // Light blue
          [0.4, 0.6, 0.9], // Medium blue at edges
        ]
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
      case 'solar_noon':
        return [1.0, 1.0, 0.9] // Bright yellow-white for all daytime periods
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
          cloudBaseColor: [0.7, 0.7, 0.75], // Light gray for visibility
          cloudHighlightColor: [0.85, 0.85, 0.9], // Lighter gray for highlights
          cloudShadowColor: [0.5, 0.5, 0.55], // Medium gray shadows
        }
      case 'dawn':
      case 'dusk':
        return {
          cloudBaseColor: [0.6, 0.6, 0.65], // Gray for contrast against colorful sky
          cloudHighlightColor: [0.75, 0.75, 0.8], // Lighter gray for highlights
          cloudShadowColor: [0.4, 0.4, 0.45], // Darker gray shadows
        }
      case 'sunrise':
      case 'sunset':
        return {
          cloudBaseColor: [0.9, 0.85, 0.8], // Warm white
          cloudHighlightColor: [1.0, 0.95, 0.9], // Bright warm white
          cloudShadowColor: [0.5, 0.4, 0.45], // Warm gray shadows
        }
      case 'morning':
      case 'solar_noon_transition':
      case 'afternoon':
      case 'solar_noon':
        return {
          cloudBaseColor: [0.95, 0.95, 0.95], // Pure white base
          cloudHighlightColor: [1.0, 1.0, 1.0], // Pure white highlights
          cloudShadowColor: [0.5, 0.55, 0.7], // Blue-tinted shadows for daytime
        }
      default:
        return {
          cloudBaseColor: [0.95, 0.95, 0.95], // Pure white base
          cloudHighlightColor: [1.0, 1.0, 1.0], // Pure white highlights
          cloudShadowColor: [0.5, 0.55, 0.7], // Blue-tinted shadows for daytime
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

    // Determine gradient type and colors
    const useRadialGradient = this.shouldUseRadialGradient(currentPeriodName)
    const currentGradientColors = useRadialGradient
      ? this.getRadialGradientColorsForTimeOfDay(currentPeriodName)
      : this.getGradientColorsForTimeOfDay(currentPeriodName)

    const currentCloudColors = this.getCloudColorsForTimeOfDay(currentPeriodName)
    const currentSunColor = this.getSunColorForTimeOfDay(currentPeriodName)

    // Calculate sun position and light direction
    const sunPositionData = this.calculateSunViewportPosition(currentPeriodName, sunPosition)

    if (transitionInfo.isTransitioning && transitionInfo.nextTimeOfDayName !== currentPeriodName) {
      const nextUseRadialGradient = this.shouldUseRadialGradient(transitionInfo.nextTimeOfDayName)
      const nextGradientColors = nextUseRadialGradient
        ? this.getRadialGradientColorsForTimeOfDay(transitionInfo.nextTimeOfDayName)
        : this.getGradientColorsForTimeOfDay(transitionInfo.nextTimeOfDayName)

      const nextCloudColors = this.getCloudColorsForTimeOfDay(transitionInfo.nextTimeOfDayName)
      const nextSunColor = this.getSunColorForTimeOfDay(transitionInfo.nextTimeOfDayName)

      // Calculate next sun position for interpolation
      const nextSunPositionData = this.calculateSunViewportPosition(
        transitionInfo.nextTimeOfDayName,
        sunPosition,
      )

      // For transitions between gradient types, prefer the current type
      const finalGradientType = useRadialGradient ? 'radial' : 'linear'
      const finalGradientCenter = useRadialGradient
        ? sunPositionData.sunViewportPosition
        : undefined
      const finalGradientRadius = useRadialGradient ? 2.5 : undefined // Increased radius to cover viewport from off-screen positions

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
        sunViewportPosition: {
          x:
            sunPositionData.sunViewportPosition.x +
            (nextSunPositionData.sunViewportPosition.x - sunPositionData.sunViewportPosition.x) *
              transitionInfo.progress,
          y:
            sunPositionData.sunViewportPosition.y +
            (nextSunPositionData.sunViewportPosition.y - sunPositionData.sunViewportPosition.y) *
              transitionInfo.progress,
        },
        lightDirection: {
          x:
            sunPositionData.lightDirection.x +
            (nextSunPositionData.lightDirection.x - sunPositionData.lightDirection.x) *
              transitionInfo.progress,
          y:
            sunPositionData.lightDirection.y +
            (nextSunPositionData.lightDirection.y - sunPositionData.lightDirection.y) *
              transitionInfo.progress,
        },
        gradientType: finalGradientType,
        radialGradientCenter: finalGradientCenter,
        radialGradientRadius: finalGradientRadius,
      }
    }

    return {
      gradientColors: currentGradientColors,
      sunColor: currentSunColor,
      ...currentCloudColors,
      sunViewportPosition: sunPositionData.sunViewportPosition,
      lightDirection: sunPositionData.lightDirection,
      gradientType: useRadialGradient ? 'radial' : 'linear',
      radialGradientCenter: useRadialGradient ? sunPositionData.sunViewportPosition : undefined,
      radialGradientRadius: useRadialGradient ? 2.5 : undefined,
    }
  },

  // Calculate sun position in viewport coordinates (0-1) based on time of day
  calculateSunViewportPosition(
    timeOfDay: TimeOfDay,
    sunPosition: SunPosition,
  ): {
    sunViewportPosition: { x: number; y: number }
    lightDirection: { x: number; y: number }
  } {
    let sunX = 0.5 // Default to center
    let sunY = 0.5 // Default to center

    switch (timeOfDay) {
      case 'dawn':
      case 'sunrise':
      case 'morning':
        // Dawn/early morning sun positioned off-screen to the right
        sunX = 1.5 // Well outside right edge
        sunY = 0.3 // Slightly above center
        break

      case 'solar_noon_transition':
      case 'solar_noon':
        // Midday sun positioned off-screen above
        sunX = 0.5 // Center horizontally
        sunY = -0.5 // Well above top edge
        break

      case 'afternoon':
      case 'evening_transition':
      case 'sunset':
        // Early evening sun positioned off-screen to the left
        sunX = -0.5 // Well outside left edge
        sunY = 0.3 // Slightly above center
        break

      case 'dusk':
      case 'night_after_dusk':
      case 'deep_night':
      case 'night_before_dawn':
        // Post-dusk sun doesn't exist - position far below viewport
        sunX = 0.5
        sunY = 2.0 // Well below viewport
        break

      default:
        // Interpolate for other times
        // Use sun azimuth and altitude for more precise positioning
        if (sunPosition.altitude > 0) {
          // Sun is above horizon
          // Convert azimuth (0-360°) to viewport X (0-1)
          // Azimuth 0° = North, 90° = East, 180° = South, 270° = West
          // We want East (dawn) = right (1.5), West (sunset) = left (-0.5)
          const azimuthRad = sunPosition.azimuth
          const azimuthDeg = (azimuthRad * 180) / Math.PI

          // Map azimuth to viewport X: East (90°) -> 1.5, West (270°) -> -0.5
          if (azimuthDeg >= 0 && azimuthDeg <= 180) {
            // Morning to afternoon (East to South to West)
            sunX = 1.5 - (azimuthDeg / 180) * 2.0 // 1.5 to -0.5
          } else {
            // Evening to night to morning (West to North to East)
            sunX = -0.5 + ((360 - azimuthDeg) / 180) * 2.0 // -0.5 to 1.5
          }

          // Map altitude to viewport Y: higher altitude = further above viewport
          const altitudeDeg = (sunPosition.altitude * 180) / Math.PI
          // For high sun (90°), position well above viewport (-0.5)
          // For low sun (0°), position at horizon level (1.0)
          sunY = 1.0 - (altitudeDeg / 90) * 1.5 // 1.0 to -0.5 for 0° to 90°
        } else {
          // Sun is below horizon
          sunX = 0.5
          sunY = 2.0
        }
        break
    }

    // Calculate light direction vector from sun position to center of viewport
    // Light comes FROM the sun TO the clouds
    const centerX = 0.5
    const centerY = 0.5
    const lightDirX = centerX - sunX
    const lightDirY = centerY - sunY

    // Normalize the light direction vector
    const length = Math.sqrt(lightDirX * lightDirX + lightDirY * lightDirY)
    const normalizedLightDir =
      length > 0
        ? {
            x: lightDirX / length,
            y: lightDirY / length,
          }
        : { x: 0, y: 0 }

    return {
      sunViewportPosition: { x: sunX, y: sunY },
      lightDirection: normalizedLightDir,
    }
  },

  // Generate radial gradient colors based on sun position
  getRadialGradientColorsForTimeOfDay(timeOfDay: TimeOfDay): [number, number, number][] {
    switch (timeOfDay) {
      case 'dawn':
        return [
          [0.8, 0.4, 0.3], // Warm orange-red at sun center
          [0.6, 0.3, 0.4], // Purple-pink
          [0.3, 0.15, 0.35], // Deep purple
          [0.15, 0.1, 0.25], // Dark purple at edges
        ]
      case 'sunrise':
        return [
          [1.0, 0.8, 0.3], // Bright golden yellow at sun
          [0.95, 0.6, 0.2], // Orange
          [0.7, 0.35, 0.35], // Reddish
          [0.5, 0.25, 0.4], // Purple at edges
        ]
      case 'morning':
        return [
          [0.9, 0.95, 1.0], // Light yellow-white at sun
          [0.6, 0.75, 0.98], // Very light blue
          [0.5, 0.7, 0.95], // Light blue
          [0.4, 0.6, 0.9], // Medium blue at edges
        ]
      case 'solar_noon_transition':
      case 'solar_noon':
        return [
          [0.95, 0.98, 1.0], // Very light yellow-white at sun
          [0.6, 0.75, 0.98], // Very light blue
          [0.5, 0.7, 0.95], // Light blue
          [0.35, 0.55, 0.85], // Deeper blue at edges
        ]
      case 'afternoon':
        return [
          [0.9, 0.95, 1.0], // Light yellow-white at sun
          [0.6, 0.75, 0.98], // Very light blue
          [0.5, 0.7, 0.95], // Light blue
          [0.4, 0.6, 0.9], // Medium blue at edges
        ]
      case 'evening_transition':
        return [
          [1.0, 0.9, 0.7], // Warm yellow at sun
          [0.9, 0.8, 0.8], // Warm gray
          [0.8, 0.82, 0.85], // Cool gray
          [0.5, 0.65, 0.9], // Blue at edges
        ]
      case 'sunset':
        return [
          [1.0, 0.75, 0.25], // Bright orange at sun
          [0.9, 0.6, 0.35], // Orange-red
          [0.7, 0.45, 0.5], // Purple-pink
          [0.45, 0.3, 0.55], // Deep purple at edges
        ]
      default:
        // Fallback to morning colors
        return [
          [1.0, 1.0, 0.95],
          [0.8, 0.9, 1.0],
          [0.65, 0.8, 0.98],
          [0.5, 0.7, 0.95],
        ]
    }
  },

  // Determine if we should use radial gradient based on time of day
  shouldUseRadialGradient(timeOfDay: TimeOfDay): boolean {
    switch (timeOfDay) {
      case 'deep_night':
      case 'night_before_dawn':
      case 'night_after_dusk':
      case 'dusk':
        return false // Use linear gradient for night
      default:
        return true // Use radial gradient for day
    }
  },
}

Comlink.expose(skyGradientCalculator)

export type SkyGradientWorker = typeof skyGradientCalculator
