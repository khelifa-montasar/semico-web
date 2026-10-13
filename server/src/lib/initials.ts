/**
 * Avatar initials.
 *
 * Derived on the server so the client never has to invent its own rule — the dashboard header
 * and the worker table both display these, and they need to agree.
 */
export function initialsFrom(fullName: string, fallbackEmail?: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length >= 2) {
    return `${first(parts[0])}${first(parts[1])}`.toUpperCase();
  }
  if (parts.length === 1) {
    const single = parts[0] as string;
    // A mononym gives one letter; pad from the email so the avatar chip never looks broken.
    return (single.length >= 2 ? single.slice(0, 2) : `${single}${fallbackEmail?.[0] ?? ""}`).toUpperCase();
  }
  return (fallbackEmail?.slice(0, 2) ?? "?").toUpperCase();
}

function first(value: string | undefined): string {
  return value?.[0] ?? "";
}

/**
 * Farm owner codes: `XXXX-XXXX`, uppercase alphanumeric.
 *
 * Ambiguous characters (0/O, 1/I) are excluded because these codes get read off a screen and
 * typed by hand on a phone.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateOwnerCode(): string {
  const pick = () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? "A";
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}

/** Rough display helpers used by the mappers. */
export function displayNameFor(user: { fullName: string }): string {
  return user.fullName.trim() || "Unnamed";
}
