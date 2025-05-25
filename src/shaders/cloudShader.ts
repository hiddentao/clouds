export const cloudVertexShader = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void) {
  gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  vTextureCoord = aTextureCoord;
}
`

export const cloudFragmentShader = `
precision mediump float;

varying vec2 vTextureCoord;

uniform float uTime;
uniform vec2 uResolution;
uniform float uNoiseScale;
uniform float uPixelationFactor;
uniform float uCloudThreshold;
uniform float uShadowOffset;
uniform float uShadowIntensity;
uniform vec3 uGradientStart;
uniform vec3 uGradientEnd;

// Perlin noise implementation
vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec2 fade(vec2 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod(Pi, 289.0);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = 2.0 * fract(i * 0.0243902439) - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
  return 2.3 * n_xy;
}

float fbm(vec2 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amplitude * cnoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  
  return value;
}

void main() {
  vec2 uv = vTextureCoord;
  vec2 pixelatedUV = floor(uv * uPixelationFactor) / uPixelationFactor;
  
  // Animated noise coordinates
  vec2 noiseCoord = pixelatedUV * uNoiseScale + vec2(uTime * 0.1, uTime * 0.05);
  vec2 shadowCoord = noiseCoord + vec2(uShadowOffset, uShadowOffset);
  
  // Generate multiple noise layers
  float noise1 = fbm(noiseCoord, 4);
  float noise2 = fbm(noiseCoord * 2.0 + vec2(100.0), 3);
  float shadowNoise = fbm(shadowCoord, 4);
  
  // Combine noise layers
  float cloudDensity = (noise1 + noise2 * 0.5) * 0.5 + 0.5;
  float shadowDensity = (shadowNoise) * 0.5 + 0.5;
  
  // Create cloud mask
  float cloudMask = smoothstep(uCloudThreshold, uCloudThreshold + 0.1, cloudDensity);
  float shadowMask = smoothstep(uCloudThreshold - 0.1, uCloudThreshold, shadowDensity);
  
  // Gradient coloring based on position and density
  float gradientFactor = uv.y + cloudDensity * 0.3;
  vec3 cloudColor = mix(uGradientStart, uGradientEnd, gradientFactor);
  
  // Apply shadows
  float shadowFactor = mix(1.0, uShadowIntensity, shadowMask * cloudMask);
  cloudColor *= shadowFactor;
  
  // Final color with alpha
  vec4 finalColor = vec4(cloudColor, cloudMask);
  
  gl_FragColor = finalColor;
}
`
