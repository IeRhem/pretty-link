export type StudioMode = "web" | "social"

export type BackgroundType = "none" | "color" | "image" | "unsplash"
export type BackgroundPattern =
  | "none"
  | "dots"
  | "grid"
  | "diagonal"
  | "cross"
  | "rings"
  | "diamond"
  | "spotlight"
export type ColorFillMode = "gradient" | "solid"
export type BorderStyle = "sharp" | "curved" | "round"

export type WebLayoutStyle = "offset" | "centered" | "docked" | "floating" | "tab"
export type BrowserChromeStyle = "chrome" | "safari" | "arc" | "minimal" | "none"
export type ChromeTheme = "light" | "dark" | "glass"
export type PosterHeadlineAlign = "left" | "center" | "right"
export type CornerIconPosition = "top-left" | "top-center" | "top-right"

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
  bgPattern: BackgroundPattern
  bgPatternOpacity: number
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
  frameOffsetX: number
  frameOffsetY: number
  frameShadow: number
  showNavButtons: boolean
  customScreenshotUrl: string

  // Tab showcase & poster branding options
  tabTitle: string
  tabAccentColor: string
  customFaviconUrl: string
  showCornerIcon: boolean
  cornerIconPosition: CornerIconPosition
  showPosterHeader: boolean
  posterHeadline: string
  posterAccentText: string
  posterHeadlineAlign: PosterHeadlineAlign
  posterHeadlineSize: number
  showPosterFooter: boolean
  posterFooterTitle: string
  posterFooterSubtitle: string

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
  bgPattern: "none",
  bgPatternOpacity: 22,
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
  frameOffsetX: 0,
  frameOffsetY: 0,
  frameShadow: 65,
  showNavButtons: true,
  customScreenshotUrl: "",

  tabTitle: "",
  tabAccentColor: "",
  customFaviconUrl: "",
  showCornerIcon: false,
  cornerIconPosition: "top-left",
  showPosterHeader: false,
  posterHeadline: "Digital\nProduct",
  posterAccentText: "Showcase",
  posterHeadlineAlign: "left",
  posterHeadlineSize: 100,
  showPosterFooter: false,
  posterFooterTitle: "leRhem",
  posterFooterSubtitle: "lerhem.space",

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
