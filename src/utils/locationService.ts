import type { LocationData } from '../types'

export class LocationService {
  private static instance: LocationService
  private cachedLocation: LocationData | null = null

  private constructor() {}

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService()
    }
    return LocationService.instance
  }

  async getCurrentLocation(): Promise<LocationData> {
    if (this.cachedLocation) {
      return this.cachedLocation
    }

    try {
      const response = await fetch('http://ip-api.com/json/')
      const data = await response.json()

      if (data.status === 'success') {
        this.cachedLocation = {
          latitude: data.lat,
          longitude: data.lon,
          timezone: data.timezone,
          city: data.city,
          country: data.country,
        }
        return this.cachedLocation
      }

      throw new Error('Failed to get location from IP')
    } catch (error) {
      console.warn('Failed to get location, using default:', error)

      // Fallback to a default location (San Francisco)
      this.cachedLocation = {
        latitude: 37.7749,
        longitude: -122.4194,
        timezone: 'America/Los_Angeles',
        city: 'San Francisco',
        country: 'United States',
      }

      return this.cachedLocation
    }
  }
}
