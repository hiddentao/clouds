import './Sidebar.css'
import { CLOUD_CONFIG, DEPTH_CONFIG } from '../constants'
import { TimeControlWidget } from './TimeControlWidget'

export interface CloudSettings {
  cloudCount: number
  speed: number
  depthLayers: number
}

export class Sidebar {
  private container: HTMLElement
  private content!: HTMLElement
  private collapseButton!: HTMLButtonElement
  private timeControlWidget: TimeControlWidget
  private onCloudSettingsChange: (settings: CloudSettings) => void
  private cloudSettings: CloudSettings
  private debounceTimer: number | null = null
  private isCollapsed = true

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
    this.setupCollapseButton()

    this.container.classList.add('collapsed')
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

  private setupCollapseButton(): void {
    this.collapseButton = document.createElement('button')
    this.collapseButton.className = 'collapse-button'
    this.collapseButton.innerHTML = '<'
    this.collapseButton.title = 'Expand sidebar'

    this.collapseButton.addEventListener('click', () => {
      this.toggleCollapse()
    })

    document.body.appendChild(this.collapseButton)
  }

  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed

    if (this.isCollapsed) {
      this.container.classList.add('collapsed')
      this.collapseButton.innerHTML = '<'
      this.collapseButton.title = 'Expand sidebar'
    } else {
      this.container.classList.remove('collapsed')
      this.collapseButton.innerHTML = '×'
      this.collapseButton.title = 'Collapse sidebar'
    }
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
    this.content.appendChild(this.createDepthLayersControl())
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
        this.debouncedCloudSettingsChange()
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
        this.debouncedCloudSettingsChange()
      },
      0.01,
    )
  }

  private createDepthLayersControl(): HTMLElement {
    return this.createSliderControl(
      'Depth Layers',
      'depth-layers',
      DEPTH_CONFIG.MIN_LAYERS,
      DEPTH_CONFIG.MAX_LAYERS,
      this.cloudSettings.depthLayers,
      (value) => {
        this.cloudSettings.depthLayers = value
        this.debouncedCloudSettingsChange()
      },
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

  private debouncedCloudSettingsChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = window.setTimeout(() => {
      this.onCloudSettingsChange({ ...this.cloudSettings })
    }, 100)
  }

  public setTime(time: Date): void {
    this.timeControlWidget.setTime(time)
  }

  public getElement(): HTMLElement {
    return this.container
  }

  public destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.timeControlWidget.destroy()
    this.container.remove()

    // Remove the collapse button from document body
    this.collapseButton?.parentNode?.removeChild(this.collapseButton)
  }
}
