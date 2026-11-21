export type StudioMode = "web" | "social"

export type BackgroundType = "none" | "color" | "image" | "unsplash"
export type ColorFillMode = "gradient" | "solid"
export type BorderStyle = "sharp" | "curved" | "round"

export type WebLayoutStyle = "offset" | "centered" | "docked" | "floating"
export type BrowserChromeStyle = "chrome" | "safari" | "arc" | "minimal" | "none"
export type ChromeTheme = "light" | "dark" | "glass"

export type SocialCardStyle = "glass" | "elevated" | "browser" | "pill" | "bento"
export type SocialPlatformId =
  | "x"
  | "github"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "tiktok"
  | "threads"
  | "bluesky"
  | "dribbble"
  | "spotify"
  | "twitch"
  | "discord"
  | "custom"

export type ExportFormat = "png" | "jpeg" | "webp"
export type ExportScale = 1 | 2 | 3

export interface AspectRatioPreset {
  id: string
  label: string
  ratioLabel: string
  width: number
  height: number
  category: "square" | "landscape" | "portrait" | "custom"
}

export interface GradientPreset {
  id: string
  name: string
  from: string
  via?: string
  to: string
  angle: number
}

export interface UnsplashPhoto {
  id: string
  category: "Abstract" | "Gradients" | "Architecture" | "Minimal" | "Nature" | "Textures"
  alt: string
  photographer: string
  photographerHandle: string
  thumbUrl: string
  fullUrl: string
  exportUrl?: string
  accent: string
}

export interface LinkMetadata {
  requestedUrl: string
  normalizedUrl: string
  displayUrl: string
  domain: string
  title: string
  description: string
  siteName: string
  faviconUrl: string | null
  ogImageUrl: string | null
  screenshotUrl: string | null
  avatarUrl: string | null
  coverUrl: string | null
  themeColor: string | null
  detectedPlatform: SocialPlatformId
  handle: string | null
  metrics: string | null
  fetchedAt: string
}

export interface StudioState {
  mode: StudioMode
  url: string

  // Canvas geometry
  aspectRatioId: string
  customWidth: number
  customHeight: number

  // Background
  backgroundType: BackgroundType
  colorFillMode: ColorFillMode
  gradientId: string
  gradientFrom: string
  gradientVia: string
  gradientTo: string
  gradientAngle: number
  solidColor: string
  noiseOverlay: boolean
  backgroundImageUrl: string
  unsplashPhotoId: string
  unsplashPhotographer: string
  bgBlur: number
  bgDim: number

  // Outer canvas border
  borderStyle: BorderStyle

  // Web mode options
  webLayout: WebLayoutStyle
  browserChrome: BrowserChromeStyle
  chromeTheme: ChromeTheme
  frameScale: number
  frameShadow: number
  customScreenshotUrl: string

  // Social mode options
  socialPlatform: SocialPlatformId
  socialCardStyle: SocialCardStyle
  socialCardTheme: ChromeTheme
  socialDisplayName: string
  socialHandle: string
  socialBio: string
  socialMetrics: string
  socialCtaLabel: string
  socialAvatarUrl: string
  socialCoverUrl: string
  socialVerified: boolean
  socialShowQr: boolean

  // Live metadata snapshot
  metadata: LinkMetadata | null
}

export const DEFAULT_STUDIO_STATE: StudioState = {
  mode: "web",
  url: "www.lerhem.space",

  aspectRatioId: "default-1-1",
  customWidth: 500,
  customHeight: 500,

  backgroundType: "color",
  colorFillMode: "gradient",
  gradientId: "royal-indigo",
  gradientFrom: "#7C3AED",
  gradientVia: "#4F46E5",
  gradientTo: "#3B82F6",
  gradientAngle: 135,
  solidColor: "#6366F1",
  noiseOverlay: false,
  backgroundImageUrl: "",
  unsplashPhotoId: "",
  unsplashPhotographer: "",
  bgBlur: 0,
  bgDim: 15,

  borderStyle: "round",

  webLayout: "offset",
  browserChrome: "chrome",
  chromeTheme: "light",
  frameScale: 100,
  frameShadow: 65,
  customScreenshotUrl: "",

  socialPlatform: "x",
  socialCardStyle: "elevated",
  socialCardTheme: "light",
  socialDisplayName: "Olivia Rhye",
  socialHandle: "@Oliviar_",
  socialBio:
    "Product designer & creative developer sharing interface systems, motion studies, and web tools.",
  socialMetrics: "125 Posts · 12.4K Followers · 340 Following",
  socialCtaLabel: "Get in Touch",
  socialAvatarUrl: "",
  socialCoverUrl: "",
  socialVerified: true,
  socialShowQr: false,

  metadata: null,
}
