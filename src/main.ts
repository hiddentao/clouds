import { CloudscapeRenderer } from './renderer/CloudscapeRenderer'

class CloudscapeApp {
  private renderer: CloudscapeRenderer | null = null

  async init(): Promise<void> {
    const canvas = document.getElementById('cloudscape-canvas') as HTMLCanvasElement

    if (!canvas) {
      throw new Error('Canvas element not found')
    }

    try {
      this.renderer = new CloudscapeRenderer(canvas)
      console.log('Cloudscape initialized successfully')
    } catch (error) {
      console.error('Failed to initialize cloudscape:', error)
    }
  }

  destroy(): void {
    if (this.renderer) {
      this.renderer.destroy()
      this.renderer = null
    }
  }
}

// Initialize the application
const app = new CloudscapeApp()

// Handle page lifecycle
window.addEventListener('load', () => {
  app.init()
})

window.addEventListener('beforeunload', () => {
  app.destroy()
})

// Handle visibility change for performance
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause or reduce performance when tab is not visible
    console.log('Tab hidden - consider pausing animation')
  } else {
    console.log('Tab visible - resume animation')
  }
})
