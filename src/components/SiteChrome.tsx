"use client";

import { usePathname } from "next/navigation";
import { isAppPath } from "@/lib/routes";

/**
 * Chooses between the marketing chrome and the signed-in product chrome.
 *
 * The header and footer arrive as already-rendered elements so they stay
 * server components; only this switch runs on the client. The public site
 * keeps exactly the markup it shipped with in Milestone 1, and the app group
 * supplies its own <main>.
 */
export default function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname && isAppPath(pathname)) return <>{children}</>;

  return (
    <>
      {header}
      <main id="main">{children}</main>
      {footer}
    </>
  );
}
