# Pixelated Cloudscape

A beautiful, animated cloudscape application built with PixiJS, featuring pixelated clouds with Perlin noise generation, gradient coloring, shadows, and smooth animations.

## Features

- **Pixelated Cloud Rendering**: Uses custom fragment shaders with Perlin noise for organic cloud shapes
- **Gradient Coloring**: Beautiful color transitions from pink to orange tones
- **Shadow Effects**: Realistic shadow rendering for depth perception
- **Smooth Animations**: Clouds gently move from right to left with fade in/out effects
- **Responsive Design**: Full-screen canvas that adapts to window resizing
- **Performance Optimized**: GPU-accelerated rendering with efficient memory management

## Technology Stack

- **TypeScript** - Type-safe development
- **PixiJS 7.4.x** - High-performance 2D rendering
- **Vite** - Fast development server and build tool
- **Bun** - Package manager and script runner
- **Biome** - Linting and formatting
- **Husky** - Git hooks for code quality

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- Bun package manager

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd clouds
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Start the development server:
   ```bash
   bun run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Run linter
- `bun run format` - Format code
- `bun run check` - Run linter and formatter checks

## Project Structure

```
src/
├── constants/          # Configuration constants
├── entities/           # Cloud entity classes
├── renderer/           # Main rendering engine
├── shaders/            # GLSL shader code
├── styles/             # CSS styles
├── types/              # TypeScript type definitions
├── utils/              # Utility functions (Perlin noise)
└── main.ts            # Application entry point
```

## Configuration

The cloudscape can be customized by modifying constants in `src/constants/index.ts`:

- **Cloud behavior**: Count, speed, scale, fade effects
- **Shader settings**: Pixelation factor, cloud threshold, shadow intensity
- **Colors**: Gradient colors and cloud tones
- **Noise parameters**: Octaves, persistence, scale

## Technical Details

### Rendering Pipeline

1. **Perlin Noise Generation**: Multi-octave noise for organic cloud shapes
2. **Fragment Shader Processing**: GPU-accelerated pixelation and coloring
3. **Shadow Calculation**: Offset noise layers for realistic shadows
4. **Gradient Mapping**: Position-based color interpolation
5. **Alpha Blending**: Smooth cloud edges and transparency

### Performance Features

- Single full-screen sprite with shader filters
- Efficient cloud recycling system
- GPU-based noise generation
- Optimized texture sizes
- Responsive canvas resizing

## Browser Compatibility

- Modern browsers with WebGL support
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `bun run check` to ensure code quality
5. Submit a pull request

## Acknowledgments

- Perlin noise algorithm implementation
- PixiJS community for excellent documentation
- Inspiration from atmospheric cloud rendering techniques 