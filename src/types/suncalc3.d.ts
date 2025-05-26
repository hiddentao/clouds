declare module 'suncalc3' {
  export interface SunPosition {
    altitude: number
    azimuth: number
    zenith: number
    azimuthDegrees: number
    altitudeDegrees: number
    zenithDegrees: number
    declination: number
  }

  export interface SunTimeDef {
    value: string
    ts: number
    name: string
    julian: number
    valid: boolean
    pos: number
    elevation?: number
  }

  export interface SunTimes {
    sunriseStart: SunTimeDef
    sunriseEnd: SunTimeDef
    sunsetStart: SunTimeDef
    sunsetEnd: SunTimeDef
    civilDawn: SunTimeDef
    civilDusk: SunTimeDef
    nauticalDawn: SunTimeDef
    nauticalDusk: SunTimeDef
    astronomicalDawn: SunTimeDef
    astronomicalDusk: SunTimeDef
    goldenHourDawnStart: SunTimeDef
    goldenHourDawnEnd: SunTimeDef
    goldenHourDuskStart: SunTimeDef
    goldenHourDuskEnd: SunTimeDef
    solarNoon: SunTimeDef
    nadir: SunTimeDef
  }

  export function getPosition(date: Date, latitude: number, longitude: number): SunPosition
  export function getSunTimes(date: Date, latitude: number, longitude: number): SunTimes
}
