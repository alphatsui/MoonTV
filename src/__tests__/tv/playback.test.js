/* eslint-disable */
const P = require('../../../public/tv/js/playback.js');

describe('TVPlayback', () => {
  test('constants and seekStep', () => {
    expect(P.SAVE_INTERVAL_MS).toBe(10000);
    expect(P.seekStep(0)).toBe(10);
    expect(P.seekStep(999)).toBe(10);
    expect(P.seekStep(1000)).toBe(30);
    expect(P.seekStep(2999)).toBe(30);
    expect(P.seekStep(3000)).toBe(60);
  });

  describe('startTime', () => {
    const rec = { index: 3, play_time: 120, total_time: 2400 };
    test('resumes same episode', () => { expect(P.startTime(rec, null, 2)).toBe(120); });
    test('other episode uses intro', () => {
      expect(P.startTime(rec, { enable: true, intro_time: 90 }, 0)).toBe(90);
    });
    test('near end gives 0', () => {
      expect(P.startTime({ index: 3, play_time: 2398, total_time: 2400 }, null, 2)).toBe(0);
    });
    test('disabled skip gives 0', () => {
      expect(P.startTime(null, { enable: false, intro_time: 90 }, 0)).toBe(0);
    });
    test('null/undefined record and skip are safe', () => {
      expect(P.startTime(null, null, 0)).toBe(0);
      expect(P.startTime(undefined, undefined, 0)).toBe(0);
      expect(P.startTime(rec, undefined, 2)).toBe(120);
    });
    test('garbage numbers never produce NaN', () => {
      expect(P.startTime({ index: 1, play_time: NaN, total_time: 100 }, null, 0)).toBe(0);
      expect(P.startTime(null, { enable: true, intro_time: NaN }, 0)).toBe(0);
      expect(P.startTime(null, { enable: true }, 0)).toBe(0);
    });
  });

  describe('shouldSkipOutro', () => {
    // outro_time is a negative offset from the end, as in the web player.
    const skip = { enable: true, outro_time: -60 };
    test('boundary: skip only after duration + outro_time', () => {
      expect(P.shouldSkipOutro(skip, 2341, 2400)).toBe(true);
      expect(P.shouldSkipOutro(skip, 2340, 2400)).toBe(false);
      expect(P.shouldSkipOutro(skip, 2339, 2400)).toBe(false);
    });
    test('positive, zero and non-finite outro_time are false', () => {
      [60, 0, NaN, Infinity, -Infinity, undefined, null, '-60'].forEach(o => {
        expect(P.shouldSkipOutro({ enable: true, outro_time: o }, 2399, 2400)).toBe(false);
      });
    });
    test('bad duration is false', () => {
      [0, NaN, Infinity, undefined, null, -1].forEach(d => {
        expect(P.shouldSkipOutro(skip, 100, d)).toBe(false);
      });
    });
    test('bad currentTime, disabled, null skip are false', () => {
      expect(P.shouldSkipOutro(skip, NaN, 2400)).toBe(false);
      expect(P.shouldSkipOutro(skip, Infinity, 2400)).toBe(false);
      expect(P.shouldSkipOutro({ enable: false, outro_time: -60 }, 2399, 2400)).toBe(false);
      expect(P.shouldSkipOutro(null, 2399, 2400)).toBe(false);
    });
  });

  test('nextEpisode', () => {
    expect(P.nextEpisode({ episodes: ['a', 'b'] }, 1)).toBeNull();
    expect(P.nextEpisode({ episodes: ['a', 'b'] }, 0)).toBe(1);
    expect(P.nextEpisode(null, 0)).toBeNull();
    expect(P.nextEpisode({}, 0)).toBeNull();
  });

  describe('buildRecord', () => {
    const detail = { title: 'T', source_name: 'S', year: '2020', poster: 'p.jpg', episodes: ['a', 'b', 'c'] };
    test('fields', () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(555);
      const r = P.buildRecord(detail, 1, 12.9, 100.7, 'q');
      now.mockRestore();
      expect(r).toEqual({
        title: 'T', source_name: 'S', year: '2020', cover: 'p.jpg', index: 2,
        total_episodes: 3, play_time: 12, total_time: 100, save_time: 555, search_title: 'q'
      });
    });
    test('never NaN or Infinity', () => {
      [[NaN, NaN], [Infinity, Infinity], [undefined, undefined], [-5, -1]].forEach(a => {
        const r = P.buildRecord(detail, 0, a[0], a[1], 'q');
        expect(Number.isFinite(r.play_time)).toBe(true);
        expect(Number.isFinite(r.total_time)).toBe(true);
        expect(r.play_time).toBeGreaterThanOrEqual(0);
        expect(r.total_time).toBeGreaterThanOrEqual(0);
      });
    });
    test('missing detail fields', () => {
      const r = P.buildRecord({}, 0, 5, 10, 'q');
      expect(r.total_episodes).toBe(1);
      expect(r.cover).toBe('');
      expect(r.year).toBe('');
    });
  });
});
