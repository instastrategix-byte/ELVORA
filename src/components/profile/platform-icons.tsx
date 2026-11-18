import { Globe, Link2 } from "lucide-react";
import type { ReactNode, SVGProps } from "react";
import type { LinkPlatform } from "@backend/modules/profiles/links";

/*
 * Monochrome platform glyphs drawn in the same stroke style as lucide (which no longer ships
 * brand icons). They inherit currentColor so they follow the theme.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

const InstagramIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

const LinkedinIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 10.5V17M8 7.4v.1M11.5 17v-6.5M11.5 13.4c0-1.6 1.1-2.9 2.6-2.9 1.4 0 2.4 1 2.4 2.7V17" />
  </Svg>
);

const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l16 16M20 4l-6.6 7.3M10.6 12.7L4 20" />
    <path d="M4 4h4.5L20 20h-4.5z" strokeWidth={1.4} />
  </Svg>
);

const FacebookIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M13.2 21v-7.6H16l.4-3h-3.2V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.7" />
    <path d="M10 13.4h3.2" />
  </Svg>
);

const YoutubeIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
    <path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor" />
  </Svg>
);

const TiktokIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3v11.2a3.8 3.8 0 1 1-3.8-3.8" />
    <path d="M14 3c.4 2.6 2.2 4.4 5 4.7" />
  </Svg>
);

const PinterestIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10.3 20.6l1.9-8M9.4 14.2c-.8-.7-1.1-1.6-1.1-2.6 0-2.4 1.9-4.3 4.3-4.3 2.2 0 3.8 1.5 3.8 3.6 0 2.4-1.3 4.2-3 4.2-1 0-1.6-.8-1.4-1.7l.6-2.6" />
  </Svg>
);

const GithubIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 19c-4.3 1.4-4.3-2.2-6-2.6M15 21.5v-3.4c0-1 .1-1.5-.5-2.1 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 3.3 5.4 3.6 5.4 3.6a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 10c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2.1v3.4" />
  </Svg>
);

const ICONS: Record<LinkPlatform, (p: IconProps) => ReactNode> = {
  website: ({ size = 18, ...p }) => <Globe size={size} strokeWidth={1.8} aria-hidden="true" {...(p as object)} />,
  other: ({ size = 18, ...p }) => <Link2 size={size} strokeWidth={1.8} aria-hidden="true" {...(p as object)} />,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  x: XIcon,
  facebook: FacebookIcon,
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
  pinterest: PinterestIcon,
  github: GithubIcon,
};

export function PlatformIcon({ platform, size, className }: { platform: LinkPlatform; size?: number; className?: string }) {
  const Icon = ICONS[platform];
  return <Icon size={size} className={className} />;
}
