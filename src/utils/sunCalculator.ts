import type { SunPosition, TimeOfDay, TimePeriodInfo } from '../types'

export class SunCalculator {
  private static instance: SunCalculator

  private constructor() {}

  static getInstance(): SunCalculator {
    if (!SunCalculator.instance) {
      SunCalculator.instance = new SunCalculator()
    }
    return SunCalculator.instance
  }

  calculateSunPosition(date: Date = new Date()): SunPosition {
    const now = date.getTime()
    const currentTimePeriod = this.determineCurrentTimePeriod(now, date)
    const generalTimeOfDay = this.mapPeriodToGeneralTimeOfDay(currentTimePeriod.name)

    // Calculate basic sun properties based on time of day
    const { altitude, azimuth } = this.calculateSunAltitudeAzimuth(currentTimePeriod.name)

    return {
      altitude,
      azimuth,
      isDay: this.isDayTime(currentTimePeriod.name),
      isDawn: currentTimePeriod.name === 'dawn',
      isDusk: currentTimePeriod.name === 'dusk',
      isNight: this.isNightTime(currentTimePeriod.name),
      timeOfDay: generalTimeOfDay,
      currentTimePeriod,
    }
  }

  private determineCurrentTimePeriod(nowTs: number, currentDate: Date): TimePeriodInfo {
    // Hardcoded times: sunrise at 6:30 AM, sunset at 7:30 PM
    const startOfDay = this.getStartOfDay(currentDate)
    const endOfDay = this.getEndOfDay(currentDate)

    // Define fixed solar events for the day
    const sunriseTime = new Date(startOfDay.getTime() + 6.5 * 60 * 60 * 1000) // 6:30 AM
    const sunsetTime = new Date(startOfDay.getTime() + 19.5 * 60 * 60 * 1000) // 7:30 PM
    const solarNoonTime = new Date(startOfDay.getTime() + 13 * 60 * 60 * 1000) // 1:00 PM

    // Create time periods with fixed durations
    const todaySolarEvents: { name: TimeOfDay; time: number }[] = [
      { name: 'deep_night' as TimeOfDay, time: startOfDay.getTime() },
      { name: 'night_before_dawn' as TimeOfDay, time: sunriseTime.getTime() - 2 * 60 * 60 * 1000 }, // 4:30 AM
      { name: 'dawn' as TimeOfDay, time: sunriseTime.getTime() - 60 * 60 * 1000 }, // 5:30 AM
      { name: 'sunrise' as TimeOfDay, time: sunriseTime.getTime() }, // 6:30 AM
      { name: 'morning' as TimeOfDay, time: sunriseTime.getTime() + 60 * 60 * 1000 }, // 7:30 AM
      {
        name: 'solar_noon_transition' as TimeOfDay,
        time: solarNoonTime.getTime() - 2 * 60 * 60 * 1000,
      }, // 11:00 AM
      { name: 'solar_noon' as TimeOfDay, time: solarNoonTime.getTime() }, // 1:00 PM
      { name: 'afternoon' as TimeOfDay, time: solarNoonTime.getTime() + 5 * 60 * 1000 }, // 1:05 PM
      { name: 'evening_transition' as TimeOfDay, time: sunsetTime.getTime() - 2 * 60 * 60 * 1000 }, // 5:30 PM
      { name: 'sunset' as TimeOfDay, time: sunsetTime.getTime() }, // 7:30 PM
      { name: 'dusk' as TimeOfDay, time: sunsetTime.getTime() + 60 * 60 * 1000 }, // 8:30 PM
      { name: 'night_after_dusk' as TimeOfDay, time: sunsetTime.getTime() + 2 * 60 * 60 * 1000 }, // 9:30 PM
      { name: 'deep_night' as TimeOfDay, time: sunsetTime.getTime() + 3 * 60 * 60 * 1000 }, // 10:30 PM
    ].sort((a, b) => a.time - b.time)

    // Add end of day event to cap the last period
    const endOfDayEvent = {
      name: 'deep_night' as TimeOfDay,
      time: endOfDay.getTime(),
    }

    for (let i = 0; i < todaySolarEvents.length; i++) {
      const currentEvent = todaySolarEvents[i]
      const nextEvent = todaySolarEvents[i + 1] || endOfDayEvent
      if (nowTs >= currentEvent.time && nowTs < nextEvent.time) {
        return { name: currentEvent.name, startTime: currentEvent.time, endTime: nextEvent.time }
      }
    }

    // Default to deep_night if no other period matches
    return { name: 'deep_night' as TimeOfDay, startTime: nowTs, endTime: nowTs + 3600000 }
  }

  private calculateSunAltitudeAzimuth(timeOfDay: TimeOfDay): { altitude: number; azimuth: number } {
    // Simple approximation based on time of day
    switch (timeOfDay) {
      case 'deep_night':
      case 'night_before_dawn':
      case 'night_after_dusk':
        return { altitude: -0.5, azimuth: 0 } // Below horizon

      case 'dawn':
        return { altitude: -0.1, azimuth: Math.PI / 2 } // Just below horizon, east

      case 'sunrise':
        return { altitude: 0.1, azimuth: Math.PI / 2 } // Just above horizon, east

      case 'morning':
        return { altitude: 0.5, azimuth: Math.PI / 3 } // Rising, southeast

      case 'solar_noon_transition':
      case 'solar_noon':
        return { altitude: Math.PI / 3, azimuth: Math.PI } // High, south

      case 'afternoon':
        return { altitude: 0.5, azimuth: (4 * Math.PI) / 3 } // Descending, southwest

      case 'evening_transition':
        return { altitude: 0.3, azimuth: (3 * Math.PI) / 2 } // Lower, west

      case 'sunset':
        return { altitude: 0.1, azimuth: (3 * Math.PI) / 2 } // Just above horizon, west

      case 'dusk':
        return { altitude: -0.1, azimuth: (3 * Math.PI) / 2 } // Just below horizon, west

      default:
        return { altitude: 0, azimuth: 0 }
    }
  }

  private isDayTime(timeOfDay: TimeOfDay): boolean {
    return [
      'sunrise',
      'morning',
      'solar_noon_transition',
      'solar_noon',
      'afternoon',
      'evening_transition',
      'sunset',
    ].includes(timeOfDay)
  }

  private isNightTime(timeOfDay: TimeOfDay): boolean {
    return ['deep_night', 'night_before_dawn', 'night_after_dusk'].includes(timeOfDay)
  }

  private mapPeriodToGeneralTimeOfDay(periodName: TimeOfDay): TimeOfDay {
    // This method can remain the same as it just maps specific periods to general categories
    return periodName
  }

  private getStartOfDay(date: Date): Date {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    return start
  }

  private getEndOfDay(date: Date): Date {
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    return end
  }

  getSunIntensity(sunPosition: SunPosition): number {
    if (sunPosition.isNight) return 0
    // Use altitude for intensity. Altitude is in radians, sin(alt) gives a good curve.
    return Math.max(0, Math.sin(sunPosition.altitude))
  }
}
