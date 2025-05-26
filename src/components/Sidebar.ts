import './Sidebar.css'
import { CLOUD_CONFIG } from '../constants'
import { TimeControlWidget } from './TimeControlWidget'

export interface CloudSettings {
  cloudCount: number
  speed: number
  spawnInterval: number
}

export class Sidebar {
  private container: HTMLElement
  private content!: HTMLElement
  private timeControlWidget: TimeControlWidget
  private onCloudSettingsChange: (settings: CloudSettings) => void
  private cloudSettings: CloudSettings

  constructor(
    onTimeChange: (time: Date) => void,
    onCloudSettingsChange: (settings: CloudSettings) => void,
    initialCloudSettings: CloudSettings,
  ) {
    this.onCloudSettingsChange = onCloudSettingsChange
    this.cloudSettings = { ...initialCloudSettings }
    this.container = this.createSidebar()
    this.timeControlWidget = new TimeControlWidget(onTimeChange)
    this.setupContent()
  }

  private createSidebar(): HTMLElement {
    const sidebar = document.createElement('div')
    sidebar.className = 'sidebar'

    // Content container
    this.content = document.createElement('div')
    this.content.className = 'sidebar-content'
    sidebar.appendChild(this.content)

    return sidebar
  }

  private setupContent(): void {
    // Add time control widget
    const timeSection = document.createElement('div')
    timeSection.className = 'sidebar-section'
    timeSection.appendChild(this.timeControlWidget.getElement())
    this.content.appendChild(timeSection)

    // Add cloud controls
    this.content.appendChild(this.createCloudCountControl())
    this.content.appendChild(this.createSpeedControl())
    this.content.appendChild(this.createSpawnIntervalControl())
  }

  private createCloudCountControl(): HTMLElement {
    return this.createSliderControl(
      'Cloud Count',
      'cloud-count',
      CLOUD_CONFIG.MIN_CLOUDS,
      CLOUD_CONFIG.MAX_CLOUDS,
      this.cloudSettings.cloudCount,
      (value) => {
        this.cloudSettings.cloudCount = value
        this.onCloudSettingsChange(this.cloudSettings)
      },
    )
  }

  private createSpeedControl(): HTMLElement {
    return this.createSliderControl(
      'Speed',
      'speed',
      CLOUD_CONFIG.SPEED_MIN,
      CLOUD_CONFIG.SPEED_MAX,
      this.cloudSettings.speed,
      (value) => {
        this.cloudSettings.speed = value
        this.onCloudSettingsChange(this.cloudSettings)
      },
      0.01,
    )
  }

  private createSpawnIntervalControl(): HTMLElement {
    return this.createSliderControl(
      'Spawn Interval',
      'spawn-interval',
      CLOUD_CONFIG.SPAWN_INTERVAL_MIN,
      CLOUD_CONFIG.SPAWN_INTERVAL_MAX,
      this.cloudSettings.spawnInterval,
      (value) => {
        this.cloudSettings.spawnInterval = value
        this.onCloudSettingsChange(this.cloudSettings)
      },
      10,
    )
  }

  private createSliderControl(
    label: string,
    id: string,
    min: number,
    max: number,
    value: number,
    onChange: (value: number) => void,
    step = 1,
  ): HTMLElement {
    const section = document.createElement('div')
    section.className = 'sidebar-section'

    const control = document.createElement('div')
    control.className = 'slider-control'

    const labelElement = document.createElement('label')
    labelElement.textContent = label
    labelElement.htmlFor = id
    control.appendChild(labelElement)

    const sliderContainer = document.createElement('div')
    sliderContainer.className = 'slider-container'

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = id
    slider.min = min.toString()
    slider.max = max.toString()
    slider.step = step.toString()
    slider.value = value.toString()
    slider.className = 'slider'

    slider.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement
      onChange(Number.parseFloat(target.value))
    })

    sliderContainer.appendChild(slider)
    control.appendChild(sliderContainer)
    section.appendChild(control)

    return section
  }

  public setTime(time: Date): void {
    this.timeControlWidget.setTime(time)
  }

  public getElement(): HTMLElement {
    return this.container
  }

  public destroy(): void {
    this.timeControlWidget.destroy()
    this.container.remove()
  }
}
