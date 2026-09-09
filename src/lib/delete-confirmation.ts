/**
 * The phrase someone has to type to confirm an irreversible delete.
 *
 * Shared by the controls and the routes on purpose. A confirmation the client
 * checks and the server does not is decoration: anything that can send the
 * request can skip it. Both sides import this, so the two cannot drift into
 * disagreeing about what counts as confirmed.
 *
 * Used by account deletion and by goal deletion — the two places where a press
 * destroys work that cannot be recovered.
 */

export const DELETE_PHRASE = "DELETE";

/**
 * Case-sensitive, and trimmed only at the ends.
 *
 * Trimming is for the space a phone keyboard adds after a word, not for
 * leniency: "delete" in lower case does not pass, because the whole purpose of
 * the phrase is that it cannot be produced without meaning to.
 */
export function confirmsDeletion(input: unknown): boolean {
  return typeof input === "string" && input.trim() === DELETE_PHRASE;
}
