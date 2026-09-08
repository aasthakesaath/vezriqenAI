import Image from "next/image";
import Link from "next/link";
import { BRAND, BRAND_LINE, ROUTES } from "@/lib/site";

export default function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href={ROUTES.home} className="flex items-center gap-2.5" aria-label={`${BRAND} home`}>
      {/* A real cropped avatar, not the full-body art zoomed with CSS.
          scale-[2.6] + object-position re-derived the crop at every call site
          and only framed the head at one exact box size — the identical pair
          applied to an 80px box lands on the quiver. It also upscaled the head
          out of an already-downscaled full-body render, so it arrived soft;
          256 square pixels of actual head is sharper and slightly smaller. */}
      <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full bg-blush-wash ring-1 ring-blush">
        <Image
          src="/brand/vezri-avatar.webp"
          alt=""
          width={256}
          height={256}
          className="h-full w-full"
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
