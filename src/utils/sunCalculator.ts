import { getPosition, getSunTimes } from 'suncalc3'
import type { LocationData, SunPosition, TimeOfDay, TimePeriodInfo } from '../types'

export class SunCalculator {
  private static instance: SunCalculator

  private constructor() {}

  static getInstance(): SunCalculator {
    if (!SunCalculator.instance) {
      SunCalculator.instance = new SunCalculator()
    }
    return SunCalculator.instance
  }

  calculateSunPosition(location: LocationData, date: Date = new Date()): SunPosition {
    const sunPos = getPosition(date, location.latitude, location.longitude)
    const sunTimes = getSunTimes(date, location.latitude, location.longitude)
    const nowTs = date.getTime()

    const currentTimePeriod = this.determineCurrentTimePeriod(nowTs, sunTimes, date)
    const generalTimeOfDay = this.mapPeriodToGeneralTimeOfDay(currentTimePeriod.name)

    return {
      altitude: sunPos.altitude,
      azimuth: sunPos.azimuth,
      isDay: nowTs >= sunTimes.sunriseStart.ts && nowTs <= sunTimes.sunsetEnd.ts,
      isDawn: nowTs >= sunTimes.civilDawn.ts && nowTs < sunTimes.sunriseStart.ts,
      isDusk: nowTs > sunTimes.sunsetEnd.ts && nowTs <= sunTimes.civilDusk.ts,
      isNight: !(nowTs >= sunTimes.civilDawn.ts && nowTs <= sunTimes.civilDusk.ts), // Night is outside civil dawn/dusk
      timeOfDay: generalTimeOfDay,
      currentTimePeriod,
    }
  }

  private determineCurrentTimePeriod(
    nowTs: number,
    sunTimes: ReturnType<typeof getSunTimes>,
    currentDate: Date,
  ): TimePeriodInfo {
    // Create a day-spanning list of solar events with names and times
    // Order matters for finding the current period.
    // Times are already in epoch ms from suncalc3 SunTimeDef.ts

    const todaySolarEvents: { name: TimeOfDay; time: number }[] = [
      { name: 'deep_night' as TimeOfDay, time: this.getStartOfDay(currentDate).getTime() }, // Start of day for deep_night boundary
      {
        name: 'night_before_dawn' as TimeOfDay,
        time: sunTimes.astronomicalDawn?.valid
          ? sunTimes.astronomicalDawn.ts
          : this.getStartOfDay(currentDate).getTime(),
      }, // Approx
      { name: 'dawn' as TimeOfDay, time: sunTimes.civilDawn.ts },
      { name: 'sunrise' as TimeOfDay, time: sunTimes.sunriseStart.ts },
      { name: 'morning' as TimeOfDay, time: sunTimes.sunriseEnd.ts },
      {
        name: 'solar_noon_transition' as TimeOfDay,
        time: sunTimes.solarNoon.ts - 2 * 60 * 60 * 1000,
      },
      { name: 'solar_noon' as TimeOfDay, time: sunTimes.solarNoon.ts },
      { name: 'afternoon' as TimeOfDay, time: sunTimes.solarNoon.ts + 5 * 60 * 1000 }, // Solar noon lasts conceptually short, start afternoon soon after
      {
        name: 'evening_transition' as TimeOfDay,
        time: sunTimes.sunsetStart.ts - 2 * 60 * 60 * 1000,
      },
      { name: 'sunset' as TimeOfDay, time: sunTimes.sunsetStart.ts },
      { name: 'dusk' as TimeOfDay, time: sunTimes.sunsetEnd.ts },
      { name: 'night_after_dusk' as TimeOfDay, time: sunTimes.civilDusk.ts },
      {
        name: 'deep_night' as TimeOfDay,
        time: sunTimes.astronomicalDusk?.valid
          ? sunTimes.astronomicalDusk.ts
          : this.getEndOfDay(currentDate).getTime(),
      }, // Approx
    ].sort((a, b) => a.time - b.time)

    // Add end of day event to cap the last period
    const endOfDayEvent = {
      name: 'deep_night' as TimeOfDay,
      time: this.getEndOfDay(currentDate).getTime(),
    }

    for (let i = 0; i < todaySolarEvents.length; i++) {
      const currentEvent = todaySolarEvents[i]
      const nextEvent = todaySolarEvents[i + 1] || endOfDayEvent
      if (nowTs >= currentEvent.time && nowTs < nextEvent.time) {
        return { name: currentEvent.name, startTime: currentEvent.time, endTime: nextEvent.time }
      }
    }
    // Default to deep_night if no other period matches (should not happen with sorted events and cap)
    return { name: 'deep_night' as TimeOfDay, startTime: nowTs, endTime: nowTs + 3600000 }
  }

  private mapPeriodToGeneralTimeOfDay(periodName: TimeOfDay): TimeOfDay {
    // This can be a simple mapping if the TimeOfDay enum is already granular enough
    // or a broader categorization if needed elsewhere.
    // For now, assume the periodName itself is the general TimeOfDay we want to expose.
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
    // Max altitude is PI/2 (90 deg). Negative altitude means below horizon.
    return Math.max(0, Math.sin(sunPosition.altitude))
  }
}
