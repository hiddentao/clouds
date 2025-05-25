export class PerlinNoise {
  private permutation: number[]
  private p: number[]

  constructor(seed = 0) {
    this.permutation = this.generatePermutation(seed)
    this.p = [...this.permutation, ...this.permutation]
  }

  private generatePermutation(seed: number): number[] {
    const perm = Array.from({ length: 256 }, (_, i) => i)

    // Simple seeded shuffle
    let random = seed
    for (let i = perm.length - 1; i > 0; i--) {
      random = (random * 9301 + 49297) % 233280
      const j = Math.floor((random / 233280) * (i + 1))
      ;[perm[i], perm[j]] = [perm[j], perm[i]]
    }

    return perm
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a)
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15
    const u = h < 8 ? x : y
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }

  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255

    const xFrac = x - Math.floor(x)
    const yFrac = y - Math.floor(y)

    const u = this.fade(xFrac)
    const v = this.fade(yFrac)

    const A = this.p[X] + Y
    const AA = this.p[A]
    const AB = this.p[A + 1]
    const B = this.p[X + 1] + Y
    const BA = this.p[B]
    const BB = this.p[B + 1]

    return this.lerp(
      this.lerp(this.grad(this.p[AA], xFrac, yFrac), this.grad(this.p[BA], xFrac - 1, yFrac), u),
      this.lerp(
        this.grad(this.p[AB], xFrac, yFrac - 1),
        this.grad(this.p[BB], xFrac - 1, yFrac - 1),
        u,
      ),
      v,
    )
  }

  octaveNoise(x: number, y: number, octaves: number, persistence: number): number {
    let total = 0
    let frequency = 1
    let amplitude = 1
    let maxValue = 0

    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= 2
    }

    return total / maxValue
  }
}
