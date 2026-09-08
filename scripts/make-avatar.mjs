/**
 * Derives public/brand/vezri-avatar.webp from public/brand/vezri.webp.
 *
 * The avatar is a square crop centred on Vezri's head, keeping both the hair
 * bow and the archery bow, with 6% transparent padding on every side so a
 * circular mask clips nothing that matters — the crop was chosen by rendering
 * candidates under an actual circle, not by eye on the square.
 *
 * It exists because the header and the Today preview used to render the FULL
 * body image inside a 36px circle and zoom it with `scale-[2.6]` plus an
 * object-position offset. Two problems, neither of them really about bytes:
 * the crop was re-derived in CSS at every call site and only framed the head
 * at one exact box size (the same offsets land on the quiver at 80px), and it
 * blew up a small region of an already-downscaled render, so the head arrived
 * soft. Dedicating all 256 pixels to the head fixes both. The transfer saving
 * is real but minor — 2.4 KB against 2.8 KB at 1x.
 *
 * Checked in as a build artefact rather than generated at build time — it is
 * brand art, and it should not be able to change without someone seeing the
 * diff. Nothing on the build, test or deploy path runs this file.
 *
 * Run with: node scripts/make-avatar.mjs
 *
 * `sharp` is not a declared dependency: it arrives with Next.js, which uses it
 * for image optimisation. That is fine for a tool run by hand a few times in
 * the life of the asset, and it keeps a large native binary out of the
 * lockfile for something CI never executes. If it ever goes missing:
 * `npm i -D sharp`.
 */
import sharp from "sharp";

const SRC = "public/brand/vezri.webp";
const OUT = "public/brand/vezri-avatar.webp";

/** Head crop in source pixels (vezri.webp is 869x900). */
const CROP = { left: 155, top: 25, width: 410, height: 410 };

const SIZE = 256;
const PAD = Math.round(SIZE * 0.06);
const INNER = SIZE - PAD * 2;

const head = await sharp(SRC)
  .extract(CROP)
  .resize(INNER, INNER, { fit: "fill" })
  .toBuffer();

await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: head, left: PAD, top: PAD }])
  .webp({ quality: 92, alphaQuality: 100 })
  .toFile(OUT);

const { width, height, hasAlpha, size } = await sharp(OUT).metadata();
console.log(`${OUT}: ${width}x${height} alpha=${hasAlpha} ${size} bytes`);
