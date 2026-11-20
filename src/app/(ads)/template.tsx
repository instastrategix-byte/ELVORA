/** Re-mounts on navigation so each Ads Manager page eases in (reduced motion respected in globals.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
