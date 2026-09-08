import { VezriPoseImage } from "@/components/VezriWorking";
import { POSE_FOR } from "@/lib/vezri-poses";

/**
 * Vezri and a handwritten note, at the top right of Today and My Goals.
 *
 * The pose stays `thinking` on both screens rather than becoming a cheerful
 * one. §4.6 forbids guilt, and the mirror of that rule is worth keeping too:
 * a beaming mascot above a section that says "30 days overdue" reads as
 * obliviousness, which is its own kind of unkindness. The note carries the
 * encouragement; the drawing stays a calm presence. Nothing here is announced
 * — the pose is decorative and the note is short, visible, and already said in
 * the heading beneath it.
 */
export default function VezriNote({ note }: { note: string }) {
  return (
    <div className="flex shrink-0 items-end gap-3">
      {/* Hidden below sm, where the heading needs the width more than the
          margin note does. Nothing is lost: it repeats no information. */}
      <p className="note hidden max-w-[13rem] rounded-2xl border border-blush bg-white px-4 py-3 text-[0.95rem] leading-snug shadow-soft sm:block">
        {note}{" "}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          className="inline-block h-3.5 w-3.5 align-[-0.1em] text-rose"
          fill="currentColor"
        >
          <path d="M12 20.2 4.6 12.8a4.7 4.7 0 0 1 6.7-6.6l.7.7.7-.7a4.7 4.7 0 0 1 6.7 6.6L12 20.2Z" />
        </svg>
      </p>
      <VezriPoseImage pose={POSE_FOR.goalHealth} alt="" className="h-[4.5rem] w-auto sm:h-32" />
    </div>
  );
}
