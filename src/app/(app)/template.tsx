/**
 * Re-mounts on every navigation within this route group, so each page eases in. Motion is
 * disabled automatically for people who prefer reduced motion (see globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
