import type { SkyGradient, SunPosition, TimeOfDay } from '../types'

export class SkyGradientService {
  private static instance: SkyGradientService

  private constructor() {}

  static getInstance(): SkyGradientService {
    if (!SkyGradientService.instance) {
      SkyGradientService.instance = new SkyGradientService()
    }
    return SkyGradientService.instance
  }

  generateSkyGradient(sunPosition: SunPosition): SkyGradient {
    const gradientColors = this.getGradientColorsForTimeOfDay(sunPosition.timeOfDay)
    const cloudColors = this.getCloudColorsForTimeOfDay(sunPosition.timeOfDay)

    return {
      gradientColors,
      sunColor: this.getSunColorForTimeOfDay(sunPosition.timeOfDay),
      ...cloudColors,
    }
  }

  private getGradientColorsForTimeOfDay(timeOfDay: TimeOfDay): [number, number, number][] {
    switch (timeOfDay) {
      case 'midnight-to-sunrise':
        return [
          [0.02, 0.02, 0.08], // Very dark blue
          [0.03, 0.03, 0.12], // Dark blue
          [0.05, 0.05, 0.15], // Slightly lighter dark blue
          [0.04, 0.04, 0.1], // Back to darker
          [0.01, 0.01, 0.05], // Almost black
        ]

      case 'sunrise-hour':
        return [
          [0.15, 0.1, 0.25], // Deep purple
          [0.3, 0.15, 0.35], // Purple
          [0.5, 0.25, 0.4], // Purple-pink
          [0.8, 0.4, 0.3], // Orange-pink
          [0.95, 0.6, 0.2], // Bright orange
          [1.0, 0.8, 0.3], // Golden yellow
        ]

      case 'post-sunrise':
        return [
          [0.4, 0.5, 0.8], // Light purple-blue
          [0.6, 0.7, 0.9], // Soft blue
          [0.8, 0.85, 0.95], // Very light blue
          [0.95, 0.9, 0.8], // Warm white
          [1.0, 0.95, 0.85], // Golden white
        ]

      case 'early-morning':
        return [
          [0.5, 0.7, 0.95], // Clear blue
          [0.65, 0.8, 0.98], // Light blue
          [0.8, 0.9, 1.0], // Very light blue
          [0.9, 0.95, 1.0], // Almost white blue
          [0.95, 0.98, 1.0], // Pure light
        ]

      case 'late-morning':
        return [
          [0.55, 0.75, 1.0], // Bright blue
          [0.7, 0.85, 1.0], // Light blue
          [0.85, 0.92, 1.0], // Very light blue
          [0.92, 0.96, 1.0], // Almost white
          [0.96, 0.98, 1.0], // Pure white
        ]

      case 'midday-hour':
        return [
          [0.6, 0.8, 1.0], // Pure blue
          [0.75, 0.88, 1.0], // Light blue
          [0.88, 0.94, 1.0], // Very light blue
          [0.94, 0.97, 1.0], // Almost white
          [0.98, 0.99, 1.0], // Pure white
        ]

      case 'early-afternoon':
        return [
          [0.58, 0.78, 1.0], // Clear blue
          [0.72, 0.86, 1.0], // Light blue
          [0.86, 0.93, 1.0], // Very light blue
          [0.93, 0.96, 1.0], // Almost white
          [0.97, 0.98, 1.0], // Pure white
        ]

      case 'late-afternoon':
        return [
          [0.55, 0.75, 0.98], // Slightly warm blue
          [0.7, 0.82, 0.95], // Warm light blue
          [0.85, 0.9, 0.95], // Warm very light blue
          [0.92, 0.94, 0.96], // Warm almost white
          [0.96, 0.96, 0.98], // Warm white
        ]

      case 'early-evening':
        return [
          [0.5, 0.65, 0.9], // Evening blue
          [0.65, 0.75, 0.85], // Soft blue-gray
          [0.8, 0.82, 0.85], // Light blue-gray
          [0.9, 0.88, 0.85], // Warm gray
          [0.95, 0.92, 0.88], // Warm light gray
        ]

      case 'dusk-hour':
        return [
          [0.25, 0.2, 0.45], // Deep purple
          [0.45, 0.3, 0.55], // Purple
          [0.7, 0.45, 0.5], // Purple-pink
          [0.9, 0.6, 0.35], // Orange-pink
          [1.0, 0.75, 0.25], // Bright orange
          [1.0, 0.85, 0.4], // Golden orange
        ]

      case 'post-dusk':
        return [
          [0.15, 0.1, 0.3], // Dark purple
          [0.25, 0.15, 0.4], // Purple
          [0.4, 0.25, 0.45], // Light purple
          [0.6, 0.4, 0.5], // Purple-pink
          [0.8, 0.6, 0.55], // Soft pink
        ]

      case 'evening':
        return [
          [0.08, 0.05, 0.2], // Deep night blue
          [0.12, 0.08, 0.25], // Night blue
          [0.18, 0.12, 0.3], // Lighter night blue
          [0.15, 0.1, 0.25], // Back to darker
          [0.1, 0.06, 0.18], // Dark blue
        ]

      case 'late-night':
        return [
          [0.03, 0.02, 0.1], // Very dark blue
          [0.04, 0.03, 0.12], // Dark blue
          [0.06, 0.04, 0.15], // Slightly lighter
          [0.05, 0.03, 0.12], // Back to darker
          [0.02, 0.01, 0.08], // Almost black
        ]

      default:
        return [
          [0.5, 0.7, 1.0], // Default blue
          [0.7, 0.85, 1.0],
          [0.85, 0.92, 1.0],
          [0.92, 0.96, 1.0],
          [0.96, 0.98, 1.0],
        ]
    }
  }

  private getSunColorForTimeOfDay(timeOfDay: TimeOfDay): [number, number, number] {
    switch (timeOfDay) {
      case 'midnight-to-sunrise':
      case 'late-night':
      case 'evening':
        return [0.1, 0.1, 0.2]
      case 'sunrise-hour':
      case 'dusk-hour':
        return [1.0, 0.8, 0.4]
      case 'post-sunrise':
      case 'post-dusk':
        return [1.0, 0.9, 0.6]
      default:
        return [1.0, 1.0, 0.9]
    }
  }

  private getCloudColorsForTimeOfDay(timeOfDay: TimeOfDay): {
    cloudBaseColor: [number, number, number]
    cloudHighlightColor: [number, number, number]
    cloudShadowColor: [number, number, number]
  } {
    switch (timeOfDay) {
      case 'midnight-to-sunrise':
      case 'late-night':
      case 'evening':
        return {
          cloudBaseColor: [0.15, 0.15, 0.25],
          cloudHighlightColor: [0.25, 0.25, 0.35],
          cloudShadowColor: [0.08, 0.08, 0.15],
        }
      case 'sunrise-hour':
        return {
          cloudBaseColor: [0.8, 0.6, 0.7],
          cloudHighlightColor: [1.0, 0.85, 0.8],
          cloudShadowColor: [0.5, 0.3, 0.4],
        }
      case 'dusk-hour':
        return {
          cloudBaseColor: [0.75, 0.55, 0.65],
          cloudHighlightColor: [0.95, 0.8, 0.75],
          cloudShadowColor: [0.45, 0.25, 0.35],
        }
      case 'post-sunrise':
      case 'post-dusk':
        return {
          cloudBaseColor: [0.85, 0.75, 0.8],
          cloudHighlightColor: [0.95, 0.9, 0.9],
          cloudShadowColor: [0.6, 0.5, 0.6],
        }
      default:
        return {
          cloudBaseColor: [0.9, 0.9, 0.95],
          cloudHighlightColor: [1.0, 1.0, 1.0],
          cloudShadowColor: [0.65, 0.65, 0.75],
        }
    }
  }

  convertToHex(color: [number, number, number]): number {
    const r = Math.round(color[0] * 255)
    const g = Math.round(color[1] * 255)
    const b = Math.round(color[2] * 255)
    return (r << 16) | (g << 8) | b
  }
}
