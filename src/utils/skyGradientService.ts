import * as Comlink from 'comlink'
import type { SkyGradient, SunPosition } from '../types'
import type { SkyGradientWorker } from '../workers/skyGradientWorker'

export class SkyGradientService {
  private static instance: SkyGradientService
  private worker: Comlink.Remote<SkyGradientWorker>

  private constructor() {
    // Initialize the Web Worker
    const workerInstance = new Worker(new URL('../workers/skyGradientWorker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker = Comlink.wrap<SkyGradientWorker>(workerInstance)
  }

  static getInstance(): SkyGradientService {
    if (!SkyGradientService.instance) {
      SkyGradientService.instance = new SkyGradientService()
    }
    return SkyGradientService.instance
  }

  // This method now calls the worker
  async generateSkyGradient(sunPosition: SunPosition, currentTimeEpochMs?: number): Promise<SkyGradient> {
    // Comlink will handle passing Date objects correctly. Primitives and plain objects are fine.
    // For SunPosition, ensure it's a plain object if it's an instance of a class not known to worker.
    // However, SunPosition is an interface, so it should be fine.
    return this.worker.generateSkyGradient(sunPosition, currentTimeEpochMs)
  }


  // The convertToHex method can remain here if it's used by the main thread,
  // or moved to the worker if only used for worker-internal calculations.
  // For now, let's assume it might still be useful on the main thread for other things.
  convertToHex(color: [number, number, number]): number {
    const r = Math.round(color[0] * 255)
    const g = Math.round(color[1] * 255)
    const b = Math.round(color[2] * 255)
    return (r << 16) | (g << 8) | b
  }
}
