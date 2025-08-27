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
  private autoShowTimer: number | null = null
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
    this.setupAutoShow()
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

  private setupAutoShow(): void {
    this.autoShowTimer = window.setTimeout(() => {
      if (this.isCollapsed) {
        this.toggleCollapse()
      }
    }, 5000)
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

    // Add combined controls block
    const controlsSection = document.createElement('div')
    controlsSection.className = 'sidebar-section'
    controlsSection.appendChild(this.createControlsBlock())
    this.content.appendChild(controlsSection)

    // Add social links
    const socialSection = document.createElement('div')
    socialSection.className = 'sidebar-section'
    socialSection.appendChild(this.createSocialLinks())
    this.content.appendChild(socialSection)
  }

  private createControlsBlock(): HTMLElement {
    const controlsBlock = document.createElement('div')
    controlsBlock.className = 'controls-block'

    // Cloud Count Control
    const cloudCountItem = this.createControlItem(
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
    controlsBlock.appendChild(cloudCountItem)

    // Speed Control
    const speedItem = this.createControlItem(
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
    controlsBlock.appendChild(speedItem)

    // Depth Layers Control
    const depthLayersItem = this.createControlItem(
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
    controlsBlock.appendChild(depthLayersItem)

    return controlsBlock
  }

  private createControlItem(
    label: string,
    id: string,
    min: number,
    max: number,
    value: number,
    onChange: (value: number) => void,
    step = 1,
  ): HTMLElement {
    const item = document.createElement('div')
    item.className = 'control-item'

    const labelElement = document.createElement('label')
    labelElement.textContent = label
    labelElement.htmlFor = id
    labelElement.className = 'control-label'
    item.appendChild(labelElement)

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

    item.appendChild(slider)

    return item
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
    if (this.autoShowTimer) {
      clearTimeout(this.autoShowTimer)
    }
    this.timeControlWidget.destroy()
    this.container.remove()

    // Remove the collapse button from document body
    this.collapseButton?.parentNode?.removeChild(this.collapseButton)
  }

  private createSocialLinks(): HTMLElement {
    const socialLinks = document.createElement('div')
    socialLinks.className = 'social-links'

    const xLink = document.createElement('a')
    xLink.href = 'https://x.com/taoofdev'
    xLink.target = '_blank'
    xLink.rel = 'noopener noreferrer'
    xLink.textContent = 'X'

    const githubLink = document.createElement('a')
    githubLink.href = 'https://github.com/hiddentao/clouds'
    githubLink.target = '_blank'
    githubLink.rel = 'noopener noreferrer'
    githubLink.textContent = 'Github'

    socialLinks.appendChild(xLink)
    socialLinks.appendChild(githubLink)

    return socialLinks
  }
}
