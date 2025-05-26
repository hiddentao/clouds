import { getPosition, getSunTimes } from 'suncalc3'
import type { LocationData, SunPosition, TimeOfDay } from '../types'

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

    const now = date.getTime()
    const sunrise = new Date(sunTimes.sunriseStart.value).getTime()
    const sunset = new Date(sunTimes.sunsetEnd.value).getTime()
    const dawn = new Date(sunTimes.civilDawn.value).getTime()
    const dusk = new Date(sunTimes.civilDusk.value).getTime()

    const isDay = now >= sunrise && now <= sunset
    const isDawn = now >= dawn && now <= sunrise
    const isDusk = now >= sunset && now <= dusk
    const isNight = !isDay && !isDawn && !isDusk

    const timeOfDay = this.determineTimeOfDay(date, sunTimes)

    return {
      altitude: sunPos.altitude,
      azimuth: sunPos.azimuth,
      isDay,
      isDawn,
      isDusk,
      isNight,
      timeOfDay,
    }
  }

  private determineTimeOfDay(date: Date, sunTimes: any): TimeOfDay {
    const hour = date.getHours()
    const minute = date.getMinutes()
    const timeInMinutes = hour * 60 + minute

    const sunrise = new Date(sunTimes.sunriseStart.value)
    const sunset = new Date(sunTimes.sunsetEnd.value)
    const dawn = new Date(sunTimes.civilDawn.value)
    const dusk = new Date(sunTimes.civilDusk.value)

    const sunriseMinutes = sunrise.getHours() * 60 + sunrise.getMinutes()
    const sunsetMinutes = sunset.getHours() * 60 + sunset.getMinutes()
    const dawnMinutes = dawn.getHours() * 60 + dawn.getMinutes()
    const duskMinutes = dusk.getHours() * 60 + dusk.getMinutes()

    // Define time periods
    if (timeInMinutes >= 0 && timeInMinutes < dawnMinutes) {
      return 'midnight-to-sunrise'
    }
    if (timeInMinutes >= dawnMinutes && timeInMinutes <= sunriseMinutes + 30) {
      return 'sunrise-hour'
    }
    if (timeInMinutes > sunriseMinutes + 30 && timeInMinutes < sunriseMinutes + 120) {
      return 'post-sunrise'
    }
    if (timeInMinutes >= sunriseMinutes + 120 && timeInMinutes < 600) {
      // 10 AM
      return 'early-morning'
    }
    if (timeInMinutes >= 600 && timeInMinutes < 720) {
      // 10 AM - 12 PM
      return 'late-morning'
    }
    if (timeInMinutes >= 720 && timeInMinutes < 780) {
      // 12 PM - 1 PM
      return 'midday-hour'
    }
    if (timeInMinutes >= 780 && timeInMinutes < 960) {
      // 1 PM - 4 PM
      return 'early-afternoon'
    }
    if (timeInMinutes >= 960 && timeInMinutes < sunsetMinutes - 120) {
      return 'late-afternoon'
    }
    if (timeInMinutes >= sunsetMinutes - 120 && timeInMinutes < sunsetMinutes - 30) {
      return 'early-evening'
    }
    if (timeInMinutes >= sunsetMinutes - 30 && timeInMinutes <= duskMinutes) {
      return 'dusk-hour'
    }
    if (timeInMinutes > duskMinutes && timeInMinutes < duskMinutes + 120) {
      return 'post-dusk'
    }
    if (timeInMinutes >= duskMinutes + 120 && timeInMinutes < 1320) {
      // Until 10 PM
      return 'evening'
    }
    return 'late-night'
  }

  getSunIntensity(sunPosition: SunPosition): number {
    if (sunPosition.isNight) return 0
    if (sunPosition.isDawn || sunPosition.isDusk) {
      return Math.max(0, Math.sin(sunPosition.altitude) * 0.5)
    }
    return Math.max(0, Math.sin(sunPosition.altitude))
  }
}
