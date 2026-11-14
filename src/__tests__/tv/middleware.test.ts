/** @jest-environment node */
import { isTvPath } from '@/middleware';

describe('isTvPath', () => {
  it('matches /tv', () => expect(isTvPath('/tv')).toBe(true));
  it('matches /tv/ assets', () =>
    expect(isTvPath('/tv/js/app.js')).toBe(true));
  it('rejects /tvshow', () => expect(isTvPath('/tvshow')).toBe(false));
  it('rejects /api paths', () =>
    expect(isTvPath('/api/playrecords')).toBe(false));
  it('rejects /', () => expect(isTvPath('/')).toBe(false));
});
