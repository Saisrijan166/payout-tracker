import { canonicalPostKey } from '../../src/domain/post-url';

describe('canonicalPostKey', () => {
  describe('Instagram', () => {
    it.each([
      'https://www.instagram.com/p/C8xYz12AbC/',
      'https://instagram.com/p/C8xYz12AbC',
      'http://m.instagram.com/p/C8xYz12AbC/?utm_source=ig_web_copy_link&igsh=abc',
      'instagram.com/reel/C8xYz12AbC/',
      'https://www.instagram.com/reels/C8xYz12AbC/',
      'https://www.instagram.com/tv/C8xYz12AbC',
      'https://www.instagram.com/memepage/p/C8xYz12AbC/',
      '  https://WWW.INSTAGRAM.COM/reel/C8xYz12AbC#comments  ',
    ])('%s -> instagram:C8xYz12AbC', (url) => {
      expect(canonicalPostKey(url, 'instagram')).toEqual({ ok: true, key: 'instagram:C8xYz12AbC' });
    });

    it('keeps the shortcode case-sensitive', () => {
      expect(canonicalPostKey('https://instagram.com/p/c8xyz12abc/', 'instagram')).toEqual({
        ok: true,
        key: 'instagram:c8xyz12abc',
      });
    });

    it.each([
      'https://www.instagram.com/memepage/',
      'https://www.instagram.com/stories/memepage/123/',
      'https://www.instagram.com/p/',
      'https://www.instagram.com/p/a!b/',
    ])('rejects non-post link %s', (url) => {
      expect(canonicalPostKey(url, 'instagram')).toEqual({ ok: false, reason: 'INVALID_POST_URL' });
    });
  });

  describe('YouTube', () => {
    it.each([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&si=tracking',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=share',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'youtube.com/embed/dQw4w9WgXcQ',
    ])('%s -> youtube:dQw4w9WgXcQ', (url) => {
      expect(canonicalPostKey(url, 'youtube')).toEqual({ ok: true, key: 'youtube:dQw4w9WgXcQ' });
    });

    it.each([
      'https://www.youtube.com/@channel',
      'https://www.youtube.com/watch?v=tooShort',
      'https://www.youtube.com/watch',
      'https://www.youtube.com/playlist?list=PL123',
      'https://youtu.be/',
    ])('rejects non-video link %s', (url) => {
      expect(canonicalPostKey(url, 'youtube')).toEqual({ ok: false, reason: 'INVALID_POST_URL' });
    });
  });

  it('reports a post from the other platform as PLATFORM_MISMATCH', () => {
    expect(canonicalPostKey('https://youtu.be/dQw4w9WgXcQ', 'instagram')).toEqual({
      ok: false,
      reason: 'PLATFORM_MISMATCH',
    });
    expect(canonicalPostKey('https://instagram.com/p/C8xYz12AbC', 'youtube')).toEqual({
      ok: false,
      reason: 'PLATFORM_MISMATCH',
    });
  });

  it.each([
    'not a url',
    'ftp://instagram.com/p/C8xYz12AbC',
    'https://tiktok.com/@user/video/123',
    'https://instagram.com.evil.example/p/C8xYz12AbC',
    'javascript:alert(1)',
    '',
  ])('rejects %p as INVALID_POST_URL', (url) => {
    expect(canonicalPostKey(url, 'instagram')).toEqual({ ok: false, reason: 'INVALID_POST_URL' });
  });
});
