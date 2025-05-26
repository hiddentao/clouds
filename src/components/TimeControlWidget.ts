import './TimeControlWidget.css'

export class TimeControlWidget {
  private container: HTMLElement
  private timeDisplay!: HTMLElement
  private dialContainer!: HTMLElement
  private dialBackground!: HTMLElement
  private dialControlsContainer!: HTMLElement
  private leftButton!: HTMLButtonElement
  private rightButton!: HTMLButtonElement
  private currentTime: Date
  private onTimeChange: (time: Date) => void
  private debounceTimer: number | null = null
  private isDragging = false
  private blinkInterval: number | null = null

  constructor(onTimeChange: (time: Date) => void) {
    this.currentTime = new Date()
    this.onTimeChange = onTimeChange
    this.container = this.createWidget()
    this.setupEventListeners()
    this.startBlinking()
    this.updateTimeDisplay()
  }

  private createWidget(): HTMLElement {
    const widget = document.createElement('div')
    widget.className = 'time-control-widget'

    // Time display
    this.timeDisplay = document.createElement('div')
    this.timeDisplay.className = 'time-display'
    widget.appendChild(this.timeDisplay)

    // Dial controls container (holds buttons and dial)
    this.dialControlsContainer = document.createElement('div')
    this.dialControlsContainer.className = 'dial-controls-container'

    // Left button (counter-clockwise)
    this.leftButton = document.createElement('button')
    this.leftButton.className = 'time-adjust-button left'
    this.leftButton.innerHTML = '‹'
    this.leftButton.title = 'Decrease time by 1 minute'
    this.dialControlsContainer.appendChild(this.leftButton)

    // Dial container
    this.dialContainer = document.createElement('div')
    this.dialContainer.className = 'dial-container'

    // Dial background
    this.dialBackground = document.createElement('div')
    this.dialBackground.className = 'dial-background'
    this.dialContainer.appendChild(this.dialBackground)

    // Hour markers
    const mainHours = [0, 6, 12, 18]
    for (const hour of mainHours) {
      const marker = document.createElement('div')
      marker.className = 'hour-marker major'
      const angle = hour * 15 - 90 // 360/24 = 15 degrees per hour, -90 to start at top
      marker.style.transform = `rotate(${angle}deg) translateY(-45px)`

      this.dialBackground.appendChild(marker)
    }

    this.dialControlsContainer.appendChild(this.dialContainer)

    // Right button (clockwise)
    this.rightButton = document.createElement('button')
    this.rightButton.className = 'time-adjust-button right'
    this.rightButton.innerHTML = '›'
    this.rightButton.title = 'Increase time by 1 minute'
    this.dialControlsContainer.appendChild(this.rightButton)

    widget.appendChild(this.dialControlsContainer)

    return widget
  }

  private setupEventListeners(): void {
    let startAngle = 0
    let currentAngle = 0

    const getAngleFromEvent = (event: MouseEvent | TouchEvent): number => {
      const rect = this.dialContainer.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
      const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

      const deltaX = clientX - centerX
      const deltaY = clientY - centerY

      return Math.atan2(deltaY, deltaX) * (180 / Math.PI)
    }

    const updateTimeFromAngle = (angle: number): void => {
      // Convert angle to hours (0-24)
      const normalizedAngle = (((angle + 90) % 360) + 360) % 360 // Normalize to 0-360, starting from top
      const hours = Math.floor((normalizedAngle / 360) * 24)
      const minutes = Math.floor(((normalizedAngle % (360 / 24)) / (360 / 24)) * 60)

      this.currentTime.setHours(hours, minutes, 0, 0)
      this.updateTimeDisplay()
      this.updateDialPosition()
      this.debouncedTimeChange()
    }

    const handleStart = (event: MouseEvent | TouchEvent): void => {
      event.preventDefault()
      this.isDragging = true
      startAngle = getAngleFromEvent(event)
      currentAngle = this.getAngleFromTime()

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleEnd)
      document.addEventListener('touchmove', handleMove, { passive: false })
      document.addEventListener('touchend', handleEnd)
    }

    const handleMove = (event: MouseEvent | TouchEvent): void => {
      if (!this.isDragging) return
      event.preventDefault()

      const newAngle = getAngleFromEvent(event)
      const angleDiff = newAngle - startAngle
      const targetAngle = currentAngle + angleDiff

      updateTimeFromAngle(targetAngle)
    }

    const handleEnd = (): void => {
      this.isDragging = false

      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleEnd)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleEnd)
    }

    // Dial event listeners
    this.dialContainer.addEventListener('mousedown', handleStart)
    this.dialContainer.addEventListener('touchstart', handleStart, { passive: false })

    // Button event listeners
    this.leftButton.addEventListener('click', () => {
      this.adjustTimeByMinutes(-1)
    })

    this.rightButton.addEventListener('click', () => {
      this.adjustTimeByMinutes(1)
    })
  }

  private adjustTimeByMinutes(minutes: number): void {
    const newTime = new Date(this.currentTime)
    newTime.setMinutes(newTime.getMinutes() + minutes)
    this.currentTime = newTime
    this.updateTimeDisplay()
    this.updateDialPosition()
    this.debouncedTimeChange()
  }

  private getAngleFromTime(): number {
    const hours = this.currentTime.getHours()
    const minutes = this.currentTime.getMinutes()
    const totalMinutes = hours * 60 + minutes
    const angle = (totalMinutes / (24 * 60)) * 360 - 90 // -90 to start from top
    return angle
  }

  private updateDialPosition(): void {
    const angle = this.getAngleFromTime()
    this.dialBackground.style.transform = `rotate(${angle}deg)`
  }

  private updateTimeDisplay(): void {
    const hours = this.currentTime.getHours().toString().padStart(2, '0')
    const minutes = this.currentTime.getMinutes().toString().padStart(2, '0')
    this.timeDisplay.innerHTML = `${hours}<span class="colon">:</span>${minutes}`
  }

  private startBlinking(): void {
    this.blinkInterval = window.setInterval(() => {
      const colon = this.timeDisplay.querySelector('.colon')
      if (colon) {
        colon.classList.toggle('hidden')
      }
    }, 500)
  }

  private debouncedTimeChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = window.setTimeout(() => {
      this.onTimeChange(new Date(this.currentTime))
    }, 250)
  }

  public setTime(time: Date): void {
    this.currentTime = new Date(time)
    this.updateTimeDisplay()
    this.updateDialPosition()
  }

  public getElement(): HTMLElement {
    return this.container
  }

  public destroy(): void {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval)
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.container.remove()
  }
}
