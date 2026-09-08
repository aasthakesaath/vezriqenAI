import Image from "next/image";
import { CtaSupport, FinalCtaHome, SignUpButton } from "@/components/Cta";
import ProgressPreview from "@/components/ProgressPreview";
import { BRAND, HOW_IT_WORKS, MASCOT } from "@/lib/site";

const ICONS: Record<string, React.ReactNode> = {
  upload: <path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />,
  schedule: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  track: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <path d="M8 12.2l2.7 2.7L16.5 9" />
    </>
  ),
  unstuck: <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v8a1.5 1.5 0 01-1.5 1.5H10l-4.2 3.6a.6.6 0 01-1-.46V15H5.5A1.5 1.5 0 014 13.5z" />,
};

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blush-wash via-white to-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-6rem] top-[-4rem] hidden h-[34rem] w-[34rem] rounded-full bg-blush/25 blur-2xl lg:block"
        />
        <div className="shell grid items-center gap-10 pb-14 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-20 lg:pt-20">
          <div className="relative z-10 text-center lg:text-left">
            <p className="eyebrow">Your goals. A smarter way.</p>
            <h1 className="mt-4 text-balance text-[2.6rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-6xl">
              Turn Your Plans
              <br />
              <span className="text-berry">Into Progress.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-mauve lg:mx-0">
              Upload your plan. {MASCOT} helps you follow it, adjust when life happens, and achieve
              your goals.
            </p>
            <SignUpButton className="mt-8 px-9 py-4 text-lg" />
            <CtaSupport className="mt-4" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-md lg:max-w-none">
            {/* Subtle target/summit motif; the mascot stays the focal visual. */}
            <svg
              viewBox="0 0 400 300"
              aria-hidden="true"
              className="absolute inset-x-0 bottom-6 w-full text-blush"
            >
              <circle cx="278" cy="86" r="62" fill="currentColor" opacity=".28" />
              <circle cx="278" cy="86" r="40" fill="#F5E8D7" opacity=".5" />
              <path d="M0 268l86-92 58 60 74-96 96 128z" fill="currentColor" opacity=".35" />
              <path d="M132 300l88-118 96 118z" fill="#C98F9D" opacity=".22" />
            </svg>
            <Image
              src="/brand/vezri.webp"
              alt={`${MASCOT}, the ${BRAND} falcon archer, drawing a bow at a target`}
              width={1138}
              height={1179}
              priority
              sizes="(max-width: 1024px) 80vw, 460px"
              className="relative mx-auto w-[78%] max-w-[440px] drop-shadow-[0_24px_40px_rgba(118,84,93,0.22)] lg:w-full"
            />
            <p className="note absolute right-0 top-2 hidden text-lg leading-tight lg:block">
              Small steps.
              <br />
              Big wins. <span aria-hidden="true">&hearts;</span>
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- How It Works (§30.5) */}
      <section id="how-it-works" className="shell scroll-mt-24 py-14 lg:py-20">
        <h2 className="sr-only">How {BRAND} works</h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((card) => (
            <li
              key={card.id}
              className="rounded-2xl border border-blush/60 bg-white p-6 text-center shadow-soft sm:text-left"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blush-light text-berry">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {ICONS[card.id]}
                </svg>
              </span>
              <h3 className="mt-5 text-lg font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-mauve">{card.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------- Progress preview (§30.5) */}
      <section className="bg-cream-light py-14 lg:py-20">
        <div className="shell grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="text-center lg:text-left">
            <p className="eyebrow">A clearer today. A brighter tomorrow.</p>
            <h2 className="mt-4 text-balance text-4xl font-bold leading-tight tracking-tight text-ink sm:text-[2.75rem]">
              Progress Feels Good.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-mauve lg:mx-0">
              See what matters today, check off what you completed, and keep moving forward &mdash;
              one step at a time.
            </p>
          </div>
          <ProgressPreview />
        </div>
      </section>

      <FinalCtaHome />
    </>
  );
}
