// Product naming in one place; the wordmark is this string in one plain colour.
export const BRAND = {
  name: "DiveGrade",
  tagline: "Colour, stabilise and dewarp dive video and photos.",
  /** Private beta: "Beta" in plain text beside the wordmark and in About. */
  beta: true,
  /** Where "Open a GitHub issue" in Send feedback goes (owner/repo). */
  issues: "majdyz/video",
  /** Tip jar for everyone (Ko-fi / Buy Me a Coffee URL). Empty: no support link anywhere (unless donateId applies). */
  donate: "",
  /** Indonesian tip jar (Trakteer / Saweria: QRIS, e-wallets) for phones set to Indonesian; falls back to `donate`. */
  donateId: "",
};

/** The support link for this browser's language (empty: none). */
export function donateUrl(langs: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]): string {
  const indonesian = langs.some((l) => /^(id|in)\b/i.test(l));
  return (indonesian && BRAND.donateId) || BRAND.donate || BRAND.donateId;
}

/**
 * The bundled sample clip. CC0 (public domain dedication), so no attribution
 * is required; credited anyway. public/samples/thresher.mp4 is a 6 s cut
 * (from 0:07, scaled to 1280×720, H.264, no audio: the source has none) of
 * the Commons file below.
 */
export const SAMPLE = {
  file: "thresher.mp4",
  title: "Pelagic thresher shark (Alopias pelagicus)",
  author: "Bo Mancao",
  url: "https://commons.wikimedia.org/wiki/File:Pelagic_thresher_shark_(Alopias_pelagicus).webm",
  licence: { name: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  note: "Malapascua Island, Philippines; a 6 s excerpt, re-encoded.",
};
