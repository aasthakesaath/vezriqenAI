import Image from "next/image";
import Link from "next/link";
import { BRAND, BRAND_LINE, ROUTES } from "@/lib/site";

export default function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href={ROUTES.home} className="flex items-center gap-2.5" aria-label={`${BRAND} home`}>
      <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full bg-blush-wash ring-1 ring-blush">
        <Image
          src="/brand/vezri.webp"
          alt=""
          width={72}
          height={72}
          className="h-full w-full scale-[2.6] object-cover object-[38%_18%]"
        />
      </span>
      <span className="leading-none">
        <span className="block text-[1.35rem] font-bold tracking-tight text-berry">{BRAND}</span>
        {!compact && (
          <span className="mt-1 block text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-rose">
            {BRAND_LINE}
          </span>
        )}
      </span>
    </Link>
  );
}
