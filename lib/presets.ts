import type {
  AspectRatioPreset,
  BackgroundPattern,
  GradientPreset,
  StudioMode,
  StudioState,
  UnsplashPhoto,
} from "@/lib/studio-types"

export const BACKGROUND_PATTERNS: Array<{
  id: BackgroundPattern
  label: string
}> = [
  { id: "none", label: "None" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "diagonal", label: "Lines" },
  { id: "cross", label: "Plus" },
  { id: "rings", label: "Rings" },
  { id: "diamond", label: "Diamond" },
  { id: "spotlight", label: "Glow" },
]

export const ASPECT_RATIOS: AspectRatioPreset[] = [
  {
    id: "default-1-1",
    label: "Default 1:1",
    ratioLabel: "1:1",
    width: 500,
    height: 500,
    category: "square",
  },
  {
    id: "square-hd",
    label: "Square HD",
    ratioLabel: "1:1",
    width: 1080,
    height: 1080,
    category: "square",
  },
  {
    id: "twitter-16-9",
    label: "X / Twitter Post",
    ratioLabel: "16:9",
    width: 1200,
    height: 675,
    category: "landscape",
  },
  {
    id: "og-card",
    label: "Open Graph",
    ratioLabel: "1.91:1",
    width: 1200,
    height: 630,
    category: "landscape",
  },
  {
    id: "dribbble-4-3",
    label: "Dribbble Shot",
    ratioLabel: "4:3",
    width: 1200,
    height: 900,
    category: "landscape",
  },
  {
    id: "linkedin-share",
    label: "LinkedIn Card",
    ratioLabel: "1.91:1",
    width: 1200,
    height: 627,
    category: "landscape",
  },
  {
    id: "instagram-4-5",
    label: "Instagram Portrait",
    ratioLabel: "4:5",
    width: 1080,
    height: 1350,
    category: "portrait",
  },
  {
    id: "poster-2-3",
    label: "Brand Poster",
    ratioLabel: "2:3",
    width: 1080,
    height: 1620,
    category: "portrait",
  },
  {
    id: "story-9-16",
    label: "Story / Reels",
    ratioLabel: "9:16",
    width: 1080,
    height: 1920,
    category: "portrait",
  },
  {
    id: "custom",
    label: "Custom Size",
    ratioLabel: "Custom",
    width: 800,
    height: 600,
    category: "custom",
  },
]

export function resolveAspectDimensions(state: Pick<StudioState, "aspectRatioId" | "customWidth" | "customHeight">): {
  preset: AspectRatioPreset
  width: number
  height: number
} {
  const preset =
    ASPECT_RATIOS.find((r) => r.id === state.aspectRatioId) ?? ASPECT_RATIOS[0]

  if (preset.id === "custom") {
    const w = Math.max(240, Math.min(2400, Math.round(state.customWidth || 800)))
    const h = Math.max(240, Math.min(2400, Math.round(state.customHeight || 600)))
    return { preset, width: w, height: h }
  }

  return { preset, width: preset.width, height: preset.height }
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: "royal-indigo",
    name: "Royal Indigo",
    from: "#7C3AED",
    via: "#4F46E5",
    to: "#3B82F6",
    angle: 135,
  },
  {
    id: "lime-pulse",
    name: "Lime Pulse",
    from: "#A3E635",
    via: "#65A30D",
    to: "#14532D",
    angle: 135,
  },
  {
    id: "sunset-coral",
    name: "Sunset Coral",
    from: "#FF6B6B",
    via: "#F97316",
    to: "#FACC15",
    angle: 135,
  },
  {
    id: "emerald-mist",
    name: "Emerald Mist",
    from: "#10B981",
    via: "#059669",
    to: "#0F766E",
    angle: 135,
  },
  {
    id: "unifield-mint",
    name: "Unifield Mint",
    from: "#34B36E",
    via: "#58C87D",
    to: "#8CE09A",
    angle: 160,
  },
  {
    id: "obsidian-violet",
    name: "Obsidian Violet",
    from: "#1E1B4B",
    via: "#5B21B6",
    to: "#C026D3",
    angle: 140,
  },
  {
    id: "ocean-glass",
    name: "Ocean Glass",
    from: "#06B6D4",
    via: "#0284C7",
    to: "#1D4ED8",
    angle: 135,
  },
  {
    id: "rose-quartz",
    name: "Rose Quartz",
    from: "#F43F5E",
    via: "#EC4899",
    to: "#A855F7",
    angle: 135,
  },
  {
    id: "amber-dusk",
    name: "Amber Dusk",
    from: "#F59E0B",
    via: "#EA580C",
    to: "#9A3412",
    angle: 135,
  },
  {
    id: "nordic-ice",
    name: "Nordic Ice",
    from: "#E0F2FE",
    via: "#BAE6FD",
    to: "#C7D2FE",
    angle: 135,
  },
  {
    id: "cyber-magenta",
    name: "Cyber Magenta",
    from: "#D946EF",
    via: "#9333EA",
    to: "#2563EB",
    angle: 125,
  },
  {
    id: "midnight-slate",
    name: "Midnight Slate",
    from: "#09090B",
    via: "#18181B",
    to: "#3F3F46",
    angle: 145,
  },
  {
    id: "peach-aurora",
    name: "Peach Aurora",
    from: "#FDBA74",
    via: "#FB7185",
    to: "#C084FC",
    angle: 135,
  },
  {
    id: "mint-breeze",
    name: "Mint Breeze",
    from: "#A7F3D0",
    via: "#5EEAD4",
    to: "#38BDF8",
    angle: 135,
  },
  {
    id: "crimson-noir",
    name: "Crimson Noir",
    from: "#18181B",
    via: "#7F1D1D",
    to: "#EF4444",
    angle: 135,
  },
  {
    id: "champagne-sand",
    name: "Champagne",
    from: "#FEF3C7",
    via: "#FDE68A",
    to: "#FCA5A5",
    angle: 135,
  },
  {
    id: "electric-cobalt",
    name: "Electric Cobalt",
    from: "#2563EB",
    via: "#1D4ED8",
    to: "#06B6D4",
    angle: 135,
  },
  {
    id: "solar-flare",
    name: "Solar Flare",
    from: "#FDE047",
    via: "#F97316",
    to: "#DC2626",
    angle: 140,
  },
  {
    id: "arctic-teal",
    name: "Arctic Teal",
    from: "#99F6E4",
    via: "#14B8A6",
    to: "#0F172A",
    angle: 145,
  },
  {
    id: "velvet-plum",
    name: "Velvet Plum",
    from: "#3B0764",
    via: "#9D174D",
    to: "#FB7185",
    angle: 135,
  },
  {
    id: "matcha-sage",
    name: "Matcha Sage",
    from: "#D9F99D",
    via: "#4ADE80",
    to: "#166534",
    angle: 145,
  },
  {
    id: "titanium-noir",
    name: "Titanium Noir",
    from: "#09090B",
    via: "#27272A",
    to: "#71717A",
    angle: 135,
  },
  {
    id: "copper-bronze",
    name: "Copper Bronze",
    from: "#451A03",
    via: "#B45309",
    to: "#FCD34D",
    angle: 135,
  },
  {
    id: "neon-lagoon",
    name: "Neon Lagoon",
    from: "#0EA5E9",
    via: "#22D3EE",
    to: "#34D399",
    angle: 135,
  },
]

export const SOLID_PRESETS: Array<{ name: string; color: string }> = [
  { name: "Violet", color: "#6D28D9" },
  { name: "Cobalt", color: "#2563EB" },
  { name: "Lime", color: "#84CC16" },
  { name: "Emerald", color: "#10B981" },
  { name: "Rose", color: "#E11D48" },
  { name: "Amber", color: "#F59E0B" },
  { name: "Obsidian", color: "#111114" },
  { name: "Zinc", color: "#27272A" },
  { name: "Slate", color: "#475569" },
  { name: "Ivory", color: "#F8FAFC" },
  { name: "Warm Sand", color: "#F5EFE6" },
  { name: "Blush", color: "#FCE7F3" },
]

export const UNSPLASH_CATEGORIES: Array<
  "All" | UnsplashPhoto["category"]
> = ["All", "Abstract", "Gradients", "Architecture", "Minimal", "Nature", "Textures"]

export const CURATED_UNSPLASH_PHOTOS: UnsplashPhoto[] = [
  {
    id: "photo-1618005182384-a83a8bd57fbe",
    category: "Abstract",
    alt: "Fluid purple and blue 3D glass waves",
    photographer: "Milad Fakurian",
    photographerHandle: "@fakurian",
    thumbUrl:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=85",
    accent: "#7C3AED",
  },
  {
    id: "photo-1634017839464-5c339ebe3cb4",
    category: "Abstract",
    alt: "Iridescent sculptural waves in dark studio light",
    photographer: "Milad Fakurian",
    photographerHandle: "@fakurian",
    thumbUrl:
      "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1600&q=85",
    accent: "#3B82F6",
  },
  {
    id: "photo-1557683316-973673baf926",
    category: "Gradients",
    alt: "Smooth cobalt and indigo gradient mesh",
    photographer: "Luke Chesser",
    photographerHandle: "@lukechesser",
    thumbUrl:
      "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=1600&q=85",
    accent: "#4F46E5",
  },
  {
    id: "photo-1579546929518-9e396f3cc809",
    category: "Gradients",
    alt: "Vibrant prism spectrum blur",
    photographer: "Lucas Benjamin",
    photographerHandle: "@aznbokchoy",
    thumbUrl:
      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1600&q=85",
    accent: "#EC4899",
  },
  {
    id: "photo-1620641788421-7a1c342ea42e",
    category: "Gradients",
    alt: "Warm tangerine and violet aura",
    photographer: "Codioful",
    photographerHandle: "@codioful",
    thumbUrl:
      "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=1600&q=85",
    accent: "#F97316",
  },
  {
    id: "photo-1614850523296-d8c1af93d400",
    category: "Gradients",
    alt: "Deep electric cyan and violet light",
    photographer: "Codioful",
    photographerHandle: "@codioful",
    thumbUrl:
      "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&w=1600&q=85",
    accent: "#06B6D4",
  },
  {
    id: "photo-1604076913837-52ab5629fba9",
    category: "Abstract",
    alt: "Soft silk pastel ripples",
    photographer: "Milad Fakurian",
    photographerHandle: "@fakurian",
    thumbUrl:
      "https://images.unsplash.com/photo-1604076913837-52ab5629fba9?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1604076913837-52ab5629fba9?auto=format&fit=crop&w=1600&q=85",
    accent: "#A855F7",
  },
  {
    id: "photo-1486406146926-c627a92ad1ab",
    category: "Architecture",
    alt: "Glass facade skyscraper looking up",
    photographer: "Sean Pollock",
    photographerHandle: "@seanpollock",
    thumbUrl:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=85",
    accent: "#38BDF8",
  },
  {
    id: "photo-1513694203232-719a280e022f",
    category: "Architecture",
    alt: "Minimalist architectural sunlight shadows",
    photographer: "Spacejoy",
    photographerHandle: "@spacejoy",
    thumbUrl:
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1600&q=85",
    accent: "#F59E0B",
  },
  {
    id: "photo-1507652313519-d4e9174996dd",
    category: "Minimal",
    alt: "Calm neutral minimalist plaster shadow",
    photographer: "Joanna Kosinska",
    photographerHandle: "@joannakosinska",
    thumbUrl:
      "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=1600&q=85",
    accent: "#D6D3D1",
  },
  {
    id: "photo-1553356084-58ef4a67b2a7",
    category: "Abstract",
    alt: "Pastel coral and sky marble swirls",
    photographer: "Pawel Czerwinski",
    photographerHandle: "@pawel_czerwinski",
    thumbUrl:
      "https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?auto=format&fit=crop&w=1600&q=85",
    accent: "#FB7185",
  },
  {
    id: "photo-1506744038136-46273834b3fb",
    category: "Nature",
    alt: "Alpine valley golden hour reflection",
    photographer: "Bailey Zindel",
    photographerHandle: "@baileyzindel",
    thumbUrl:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85",
    accent: "#10B981",
  },
  {
    id: "photo-1470071459604-3b5ec3a7fe05",
    category: "Nature",
    alt: "Misty mountain ridge at dawn",
    photographer: "v2osk",
    photographerHandle: "@v2osk",
    thumbUrl:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=85",
    accent: "#14B8A6",
  },
  {
    id: "photo-1519681393784-d120267933ba",
    category: "Nature",
    alt: "Starry midnight mountain peaks",
    photographer: "Benjamin Voros",
    photographerHandle: "@vorosbenisop",
    thumbUrl:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=85",
    accent: "#6366F1",
  },
  {
    id: "photo-1550684848-fac1c5b4e853",
    category: "Textures",
    alt: "Dark geometric ribbed matte surface",
    photographer: "Jean-Philippe Delberghe",
    photographerHandle: "@jipy32",
    thumbUrl:
      "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1600&q=85",
    accent: "#27272A",
  },
  {
    id: "photo-1558591710-4b4a1ae0f04d",
    category: "Minimal",
    alt: "Soft minimalist white frosted glass light",
    photographer: "Resource Database",
    photographerHandle: "@resourcedatabase",
    thumbUrl:
      "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=1600&q=85",
    accent: "#94A3B8",
  },
  {
    id: "photo-1618005198919-d3d4b5a92ead",
    category: "Textures",
    alt: "Sculpted matte clay wave texture",
    photographer: "Milad Fakurian",
    photographerHandle: "@fakurian",
    thumbUrl:
      "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?auto=format&fit=crop&w=1600&q=85",
    accent: "#EC4899",
  },
  {
    id: "photo-1541701494587-cb58502866ab",
    category: "Textures",
    alt: "Rich cobalt and coral acrylic pigment swirl",
    photographer: "Lucas Benjamin",
    photographerHandle: "@aznbokchoy",
    thumbUrl:
      "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=480&q=75",
    fullUrl:
      "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1600&q=85",
    accent: "#F43F5E",
  },
]

export interface QuickTemplate {
  id: string
  name: string
  mode: "web" | "social"
  swatch: string
  patch: Partial<StudioState>
}

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: "lerhem-web",
    name: "Lerhem Offset",
    mode: "web",
    swatch: "linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)",
    patch: {
      mode: "web",
      url: "www.lerhem.space",
      aspectRatioId: "default-1-1",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "royal-indigo",
      gradientFrom: "#7C3AED",
      gradientVia: "#4F46E5",
      gradientTo: "#3B82F6",
      gradientAngle: 135,
      borderStyle: "round",
      webLayout: "offset",
      browserChrome: "chrome",
      chromeTheme: "light",
      metadata: null,
    },
  },
  {
    id: "icon-design",
    name: "Brand Header",
    mode: "web",
    swatch: "linear-gradient(135deg, #10B981 0%, #0F766E 100%)",
    patch: {
      mode: "web",
      url: "www.lerhem.space",
      aspectRatioId: "instagram-4-5",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "emerald-mist",
      gradientFrom: "#10B981",
      gradientVia: "#059669",
      gradientTo: "#0F766E",
      gradientAngle: 135,
      bgPattern: "grid",
      bgPatternOpacity: 18,
      borderStyle: "round",
      webLayout: "tab",
      browserChrome: "chrome",
      chromeTheme: "light",
      frameScale: 100,
      frameOffsetX: 0,
      frameOffsetY: 8,
      frameShadow: 45,
      showNavButtons: true,
      tabTitle: "Lerhem Studio",
      tabAccentColor: "#059669",
      customFaviconUrl: "",
      showCornerIcon: true,
      cornerIconPosition: "top-left",
      showPosterHeader: true,
      posterHeadline: "Digital\nProduct",
      posterAccentText: "Showcase",
      posterHeadlineAlign: "left",
      posterHeadlineSize: 100,
      showPosterFooter: true,
      posterFooterTitle: "leRhem",
      posterFooterSubtitle: "lerhem.space",
      metadata: null,
    },
  },
  {
    id: "mobile-chrome",
    name: "Mobile Chrome",
    mode: "web",
    swatch: "linear-gradient(140deg, #1E1B4B 0%, #C026D3 100%)",
    patch: {
      mode: "web",
      url: "www.lerhem.space",
      aspectRatioId: "instagram-4-5",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "obsidian-violet",
      gradientFrom: "#1E1B4B",
      gradientVia: "#5B21B6",
      gradientTo: "#C026D3",
      gradientAngle: 140,
      bgPattern: "dots",
      bgPatternOpacity: 16,
      borderStyle: "round",
      webLayout: "centered",
      browserChrome: "mobile",
      chromeTheme: "dark",
      webShowQr: true,
      showCapturedFrom: true,
      metadata: null,
    },
  },
  {
    id: "x-creator",
    name: "X Creator",
    mode: "social",
    swatch: "linear-gradient(135deg, #1DA1F2 0%, #1E1B4B 100%)",
    patch: {
      mode: "social",
      url: "x.com/lerhem",
      aspectRatioId: "default-1-1",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "obsidian-violet",
      gradientFrom: "#1E1B4B",
      gradientVia: "#5B21B6",
      gradientTo: "#C026D3",
      gradientAngle: 140,
      borderStyle: "round",
      socialPlatform: "x",
      socialCardStyle: "elevated",
      socialCardTheme: "light",
      socialDisplayName: "Lerhem Studio",
      socialHandle: "@lerhem",
      socialBio: "Shipping tactile design systems, micro-interactions, and open-source web tools.",
      socialMetrics: "4.9 Rating · 148 Posts · 12.4K Followers",
      socialCtaLabel: "Get in Touch",
      socialVerified: true,
      socialShowQr: false,
    },
  },
  {
    id: "github-repo",
    name: "GitHub Repo",
    mode: "social",
    swatch: "linear-gradient(135deg, #A3E635 0%, #14532D 100%)",
    patch: {
      mode: "social",
      url: "github.com/shadcn-ui/ui",
      aspectRatioId: "twitter-16-9",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "lime-pulse",
      gradientFrom: "#A3E635",
      gradientVia: "#65A30D",
      gradientTo: "#14532D",
      gradientAngle: 135,
      borderStyle: "round",
      socialPlatform: "github",
      socialCardStyle: "glass",
      socialCardTheme: "dark",
      socialDisplayName: "shadcn/ui",
      socialHandle: "shadcn-ui/ui",
      socialBio: "Beautifully designed components built with Tailwind CSS and Base UI primitives.",
      socialMetrics: "4.9 Rating · 6.1K Forks · 88.2K Stars",
      socialCtaLabel: "View on GitHub",
      socialVerified: true,
      socialShowQr: false,
    },
  },
  {
    id: "ig-story",
    name: "IG Story 9:16",
    mode: "social",
    swatch: "linear-gradient(135deg, #F43F5E 0%, #A855F7 100%)",
    patch: {
      mode: "social",
      url: "instagram.com/lerhem.space",
      aspectRatioId: "story-9-16",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "rose-quartz",
      gradientFrom: "#F43F5E",
      gradientVia: "#EC4899",
      gradientTo: "#A855F7",
      gradientAngle: 135,
      borderStyle: "round",
      socialPlatform: "instagram",
      socialCardStyle: "glass",
      socialCardTheme: "light",
      socialDisplayName: "Lerhem Visuals",
      socialHandle: "@lerhem.space",
      socialBio: "Weekly UI breakdowns, gradient recipes, and creative coding snapshots.",
      socialMetrics: "5.0 Rating · 210 Posts · 24.8K Followers",
      socialCtaLabel: "Get in Touch",
      socialVerified: true,
      socialShowQr: false,
    },
  },
  {
    id: "launch-og",
    name: "Product OG",
    mode: "web",
    swatch: "linear-gradient(135deg, #06B6D4 0%, #1D4ED8 100%)",
    patch: {
      mode: "web",
      url: "ui.shadcn.com",
      aspectRatioId: "og-card",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "ocean-glass",
      gradientFrom: "#06B6D4",
      gradientVia: "#0284C7",
      gradientTo: "#1D4ED8",
      gradientAngle: 135,
      borderStyle: "curved",
      webLayout: "centered",
      browserChrome: "safari",
      chromeTheme: "dark",
    },
  },
  {
    id: "minimal-pill",
    name: "Link Pill",
    mode: "social",
    swatch: "linear-gradient(135deg, #18181B 0%, #3F3F46 100%)",
    patch: {
      mode: "social",
      url: "dribbble.com/lerhem",
      aspectRatioId: "twitter-16-9",
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: "midnight-slate",
      gradientFrom: "#09090B",
      gradientVia: "#18181B",
      gradientTo: "#3F3F46",
      gradientAngle: 145,
      borderStyle: "curved",
      socialPlatform: "dribbble",
      socialCardStyle: "pill",
      socialCardTheme: "glass",
      socialDisplayName: "Lerhem Design",
      socialHandle: "@lerhem",
      socialBio: "Product interfaces, icons & web showcases",
      socialMetrics: "42 Shots",
      socialCtaLabel: "View Shots",
      socialVerified: true,
      socialShowQr: false,
    },
  },
]

export const DEFAULT_BATCH_RATIO_IDS: string[] = [
  "square-hd",
  "twitter-16-9",
  "og-card",
  "instagram-4-5",
  "story-9-16",
]

export interface CustomPreset {
  id: string
  name: string
  mode: StudioMode
  swatch: string
  createdAt: number
  patch: Partial<StudioState>
}

export const CUSTOM_PRESETS_STORAGE_KEY = "prettylink:custom-presets:v1"

export function computeStyleSwatch(state: StudioState): string {
  if (state.backgroundType === "none") {
    return "linear-gradient(135deg, #27272A 0%, #71717A 100%)"
  }
  if (
    state.backgroundType === "color" &&
    state.colorFillMode === "solid" &&
    state.solidColor
  ) {
    return `linear-gradient(135deg, ${state.solidColor} 0%, ${state.solidColor} 100%)`
  }
  const from = state.gradientFrom || "#4F46E5"
  const via = state.gradientVia?.trim()
  const to = state.gradientTo || "#06B6D4"
  const angle = Number.isFinite(state.gradientAngle) ? state.gradientAngle : 135
  return via
    ? `linear-gradient(${angle}deg, ${from} 0%, ${via} 50%, ${to} 100%)`
    : `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`
}

/**
 * Extracts style and layout properties for a custom preset while preserving
 * the user's current target URL, fetched metadata, and custom uploaded assets.
 */
export function extractStylePresetPatch(
  state: StudioState
): Partial<StudioState> {
  return {
    mode: state.mode,
    aspectRatioId: state.aspectRatioId,
    customWidth: state.customWidth,
    customHeight: state.customHeight,
    backgroundType:
      state.backgroundType === "image" ? "color" : state.backgroundType,
    colorFillMode: state.colorFillMode,
    gradientId: state.gradientId,
    gradientFrom: state.gradientFrom,
    gradientVia: state.gradientVia,
    gradientTo: state.gradientTo,
    gradientAngle: state.gradientAngle,
    solidColor: state.solidColor,
    noiseOverlay: state.noiseOverlay,
    bgPattern: state.bgPattern,
    bgPatternOpacity: state.bgPatternOpacity,
    unsplashPhotoId: state.unsplashPhotoId,
    unsplashPhotographer: state.unsplashPhotographer,
    bgBlur: state.bgBlur,
    bgDim: state.bgDim,
    borderStyle: state.borderStyle,
    webLayout: state.webLayout,
    browserChrome: state.browserChrome,
    chromeTheme: state.chromeTheme,
    frameScale: state.frameScale,
    frameOffsetX: state.frameOffsetX,
    frameOffsetY: state.frameOffsetY,
    frameShadow: state.frameShadow,
    showNavButtons: state.showNavButtons,
    webShowQr: state.webShowQr,
    showCapturedFrom: state.showCapturedFrom,
    tabAccentColor: state.tabAccentColor,
    showCornerIcon: state.showCornerIcon,
    cornerIconPosition: state.cornerIconPosition,
    showPosterHeader: state.showPosterHeader,
    posterHeadlineAlign: state.posterHeadlineAlign,
    posterHeadlineSize: state.posterHeadlineSize,
    showPosterFooter: state.showPosterFooter,
    socialCardStyle: state.socialCardStyle,
    socialCardTheme: state.socialCardTheme,
    socialVerified: state.socialVerified,
    socialShowQr: state.socialShowQr,
  }
}

export function loadCustomPresets(): CustomPreset[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CustomPreset =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            (item.mode === "web" || item.mode === "social") &&
            typeof item.swatch === "string" &&
            item.patch &&
            typeof item.patch === "object"
        )
    )
  } catch {
    return []
  }
}

export function saveCustomPresets(presets: CustomPreset[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      CUSTOM_PRESETS_STORAGE_KEY,
      JSON.stringify(presets)
    )
  } catch {
    // Ignore storage quota errors
  }
}
