import type { Platform } from './platform';

export type PostKeyResult =
  { ok: true; key: string } | { ok: false; reason: 'INVALID_POST_URL' | 'PLATFORM_MISMATCH' };

const INSTAGRAM_POST_TYPES = new Set(['p', 'reel', 'reels', 'tv']);
const INSTAGRAM_SHORTCODE = /^[A-Za-z0-9_-]{5,64}$/;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PATH_TYPES = new Set(['shorts', 'live', 'embed']);

function parseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function platformForHost(host: string): Platform | null {
  if (host === 'instagram.com') return 'instagram';
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
  return null;
}

/** `/p/{code}`, `/reel/{code}`, `/reels/{code}`, `/tv/{code}`, optionally after `/{username}`. */
function instagramShortcode(segments: string[]): string | null {
  for (const offset of [0, 1]) {
    const type = segments[offset];
    const code = segments[offset + 1];
    if (type && code && INSTAGRAM_POST_TYPES.has(type) && INSTAGRAM_SHORTCODE.test(code)) {
      return code;
    }
  }
  return null;
}

/** `youtu.be/{id}`, `/watch?v={id}`, `/shorts/{id}`, `/live/{id}` or `/embed/{id}`. */
function youtubeVideoId(url: URL, host: string, segments: string[]): string | null {
  const [first, second] = segments;
  let candidate: string | null | undefined;
  if (host === 'youtu.be') candidate = first;
  else if (first === 'watch') candidate = url.searchParams.get('v');
  else if (first && YOUTUBE_PATH_TYPES.has(first)) candidate = second;
  return candidate && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
}

/**
 * Reduces a post link to a canonical key such as `instagram:C8xYz12AbC` or
 * `youtube:dQw4w9WgXcQ`, so different spellings of the same post (www/m hosts,
 * tracking query strings, trailing slashes, reel vs p, youtu.be vs watch) collide.
 * Shortcodes and video IDs are case-sensitive, so only the host is lowercased.
 */
export function canonicalPostKey(raw: string, expected: Platform): PostKeyResult {
  const url = parseUrl(raw);
  if (!url) return { ok: false, reason: 'INVALID_POST_URL' };

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const platform = platformForHost(host);
  if (!platform) return { ok: false, reason: 'INVALID_POST_URL' };
  if (platform !== expected) return { ok: false, reason: 'PLATFORM_MISMATCH' };

  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const id =
    platform === 'instagram' ? instagramShortcode(segments) : youtubeVideoId(url, host, segments);
  return id ? { ok: true, key: `${platform}:${id}` } : { ok: false, reason: 'INVALID_POST_URL' };
}
