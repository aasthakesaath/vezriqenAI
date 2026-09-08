import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { FOOTER_NAV, LEGAL_OWNER } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="border-t border-blush/60 bg-blush-wash">
      <div className="shell flex flex-col gap-6 py-9 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-7 gap-y-2">
            {FOOTER_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-sm text-mauve transition-colors hover:text-berry">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="shell border-t border-blush/60 py-5">
        <p className="text-xs text-mauve-light">
          &copy; {new Date().getFullYear()} {LEGAL_OWNER}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
