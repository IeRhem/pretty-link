import {
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandDribbble,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandSpotify,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandTwitch,
  IconBrandX,
  IconBrandYoutube,
  IconWorld,
} from "@tabler/icons-react"
import type { SocialPlatformId } from "@/lib/studio-types"

export function SocialPlatformIcon({
  platform,
  className,
  stroke = 1.85,
}: {
  platform: SocialPlatformId
  className?: string
  stroke?: number
}) {
  switch (platform) {
    case "x":
      return <IconBrandX className={className} stroke={stroke} />
    case "github":
      return <IconBrandGithub className={className} stroke={stroke} />
    case "instagram":
      return <IconBrandInstagram className={className} stroke={stroke} />
    case "linkedin":
      return <IconBrandLinkedin className={className} stroke={stroke} />
    case "youtube":
      return <IconBrandYoutube className={className} stroke={stroke} />
    case "tiktok":
      return <IconBrandTiktok className={className} stroke={stroke} />
    case "threads":
      return <IconBrandThreads className={className} stroke={stroke} />
    case "bluesky":
      return <IconBrandBluesky className={className} stroke={stroke} />
    case "dribbble":
      return <IconBrandDribbble className={className} stroke={stroke} />
    case "spotify":
      return <IconBrandSpotify className={className} stroke={stroke} />
    case "twitch":
      return <IconBrandTwitch className={className} stroke={stroke} />
    case "discord":
      return <IconBrandDiscord className={className} stroke={stroke} />
    default:
      return <IconWorld className={className} stroke={stroke} />
  }
}
