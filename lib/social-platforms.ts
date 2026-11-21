import type { SocialPlatformId } from "@/lib/studio-types"

export interface SocialPlatformConfig {
  id: SocialPlatformId
  name: string
  shortLabel: string
  accent: string
  accentGradient: string
  defaultCta: string
  sampleUrl: string
  handlePrefix: string
}

export const SOCIAL_PLATFORMS: Record<SocialPlatformId, SocialPlatformConfig> = {
  x: {
    id: "x",
    name: "X (Twitter)",
    shortLabel: "X",
    accent: "#1D9BF0",
    accentGradient: "linear-gradient(135deg, #1DA1F2 0%, #0F172A 100%)",
    defaultCta: "Follow on X",
    sampleUrl: "x.com/lerhem",
    handlePrefix: "@",
  },
  github: {
    id: "github",
    name: "GitHub",
    shortLabel: "GitHub",
    accent: "#2EA043",
    accentGradient: "linear-gradient(135deg, #238636 0%, #0D1117 100%)",
    defaultCta: "View on GitHub",
    sampleUrl: "github.com/shadcn-ui/ui",
    handlePrefix: "@",
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    shortLabel: "Instagram",
    accent: "#E1306C",
    accentGradient: "linear-gradient(135deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)",
    defaultCta: "Follow on Instagram",
    sampleUrl: "instagram.com/lerhem.space",
    handlePrefix: "@",
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    shortLabel: "LinkedIn",
    accent: "#0A66C2",
    accentGradient: "linear-gradient(135deg, #0A66C2 0%, #004182 100%)",
    defaultCta: "Connect on LinkedIn",
    sampleUrl: "linkedin.com/in/lerhem",
    handlePrefix: "in/",
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    shortLabel: "YouTube",
    accent: "#FF0033",
    accentGradient: "linear-gradient(135deg, #FF0033 0%, #99001F 100%)",
    defaultCta: "Subscribe",
    sampleUrl: "youtube.com/@lerhem",
    handlePrefix: "@",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    shortLabel: "TikTok",
    accent: "#FE2C55",
    accentGradient: "linear-gradient(135deg, #25F4EE 0%, #FE2C55 100%)",
    defaultCta: "Follow on TikTok",
    sampleUrl: "tiktok.com/@lerhem",
    handlePrefix: "@",
  },
  threads: {
    id: "threads",
    name: "Threads",
    shortLabel: "Threads",
    accent: "#101010",
    accentGradient: "linear-gradient(135deg, #27272A 0%, #09090B 100%)",
    defaultCta: "Follow on Threads",
    sampleUrl: "threads.net/@lerhem",
    handlePrefix: "@",
  },
  bluesky: {
    id: "bluesky",
    name: "Bluesky",
    shortLabel: "Bluesky",
    accent: "#0285FF",
    accentGradient: "linear-gradient(135deg, #0285FF 0%, #0055CC 100%)",
    defaultCta: "Follow on Bluesky",
    sampleUrl: "bsky.app/profile/lerhem.space",
    handlePrefix: "@",
  },
  dribbble: {
    id: "dribbble",
    name: "Dribbble",
    shortLabel: "Dribbble",
    accent: "#EA4C89",
    accentGradient: "linear-gradient(135deg, #EA4C89 0%, #C32361 100%)",
    defaultCta: "View Shots",
    sampleUrl: "dribbble.com/lerhem",
    handlePrefix: "@",
  },
  spotify: {
    id: "spotify",
    name: "Spotify",
    shortLabel: "Spotify",
    accent: "#1DB954",
    accentGradient: "linear-gradient(135deg, #1ED760 0%, #15803D 100%)",
    defaultCta: "Listen on Spotify",
    sampleUrl: "open.spotify.com/artist/lerhem",
    handlePrefix: "",
  },
  twitch: {
    id: "twitch",
    name: "Twitch",
    shortLabel: "Twitch",
    accent: "#9146FF",
    accentGradient: "linear-gradient(135deg, #9146FF 0%, #5B21B6 100%)",
    defaultCta: "Watch on Twitch",
    sampleUrl: "twitch.tv/lerhem",
    handlePrefix: "@",
  },
  discord: {
    id: "discord",
    name: "Discord",
    shortLabel: "Discord",
    accent: "#5865F2",
    accentGradient: "linear-gradient(135deg, #5865F2 0%, #3B43B8 100%)",
    defaultCta: "Join Discord",
    sampleUrl: "discord.gg/prettylink",
    handlePrefix: "",
  },
  custom: {
    id: "custom",
    name: "Website / Link",
    shortLabel: "Website",
    accent: "#84CC16",
    accentGradient: "linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)",
    defaultCta: "Visit Website",
    sampleUrl: "www.lerhem.space",
    handlePrefix: "",
  },
}

export const SOCIAL_PLATFORM_LIST: SocialPlatformConfig[] = Object.values(SOCIAL_PLATFORMS)

function toTitleCase(input: string): string {
  return input
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim()
}

export function detectSocialPlatform(rawUrl: string): {
  platform: SocialPlatformId
  handle: string
  displayName: string
  cleanUrl: string
} {
  const trimmed = rawUrl.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsed: URL | null = null
  try {
    parsed = new URL(withScheme)
  } catch {
    return {
      platform: "custom",
      handle: "@link",
      displayName: trimmed || "PrettyLink",
      cleanUrl: trimmed,
    }
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
  const segments = parsed.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)

  const cleanUrl = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`

  const firstSeg = segments[0] ?? ""
  const cleanHandle = firstSeg.replace(/^@/, "")

  if (host === "x.com" || host === "twitter.com") {
    const h = cleanHandle || "creator"
    return {
      platform: "x",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "github.com") {
    if (segments.length >= 2) {
      return {
        platform: "github",
        handle: `${segments[0]}/${segments[1]}`,
        displayName: segments[1],
        cleanUrl,
      }
    }
    const h = cleanHandle || "developer"
    return {
      platform: "github",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "instagram.com" || host === "instagr.am") {
    const h = cleanHandle || "creator"
    return {
      platform: "instagram",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    const target = segments[0] === "in" || segments[0] === "company" ? segments[1] ?? "" : firstSeg
    const h = target || "profile"
    return {
      platform: "linkedin",
      handle: `in/${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "youtube.com" || host === "youtu.be") {
    const h = cleanHandle || "channel"
    return {
      platform: "youtube",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "tiktok.com") {
    const h = cleanHandle || "creator"
    return {
      platform: "tiktok",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "threads.net" || host === "threads.com") {
    const h = cleanHandle || "creator"
    return {
      platform: "threads",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "bsky.app") {
    const target = segments[0] === "profile" ? segments[1] ?? "" : firstSeg
    const h = target.replace(/^@/, "") || "handle.bsky.social"
    return {
      platform: "bluesky",
      handle: `@${h}`,
      displayName: toTitleCase(h.split(".")[0] ?? h),
      cleanUrl,
    }
  }

  if (host === "dribbble.com") {
    const h = cleanHandle || "designer"
    return {
      platform: "dribbble",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "open.spotify.com" || host === "spotify.com") {
    const target = segments[1] ?? segments[0] ?? "playlist"
    return {
      platform: "spotify",
      handle: segments[0] ? `${segments[0]} · Spotify` : "Spotify",
      displayName: toTitleCase(target),
      cleanUrl,
    }
  }

  if (host === "twitch.tv") {
    const h = cleanHandle || "streamer"
    return {
      platform: "twitch",
      handle: `@${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  if (host === "discord.gg" || host === "discord.com") {
    const h = segments[segments.length - 1] || "community"
    return {
      platform: "discord",
      handle: `discord.gg/${h}`,
      displayName: toTitleCase(h),
      cleanUrl,
    }
  }

  return {
    platform: "custom",
    handle: host,
    displayName: toTitleCase(host.split(".")[0] ?? host),
    cleanUrl,
  }
}
