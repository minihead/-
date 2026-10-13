const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../app/src/main/assets/engine.js');
const data = require('../app/src/main/assets/data.js');

test('100 distinct oracle IDs and 78 complete upright/reversed tarot records', () => {
  assert.equal(data.oracles.length, 100);
  assert.equal(new Set(data.oracles.map(item => item.id)).size, 100);
  assert.equal(data.tarot.length, 78);
  assert.equal(new Set(data.tarot.map(item => item.id)).size, 78);
  for (const card of data.tarot) for (const direction of ['upright', 'reversed']) {
    for (const field of ['state','social','advice','summary']) assert.ok(card[direction][field]);
  }
});
test('calendar computes lunar date, solar-term month, auspicious activities', () => {
  const current = engine.calendar(new Date(2026, 9, 13, 12));
  assert.equal(current.lunar, '九月初四');
  assert.equal(current.month, '戊戌');
  assert.equal(current.day, '庚申');
  assert.deepEqual(current.ji, ['安床','安葬']);
  assert.notEqual(engine.calendar(new Date(2026, 11, 1, 12)).month, current.month);
  assert.equal(current.hours.length, 12);
  assert.throws(() => engine.calendar(new Date(2200, 0, 1)), /1900/);
});
test('birthday derives zodiac from solar date and animal from lunar new year', () => {
  const now = new Date(2026, 9, 13);
  assert.equal(engine.profileFromBirthday('2024-02-09', now).animal, 'rabbit');
  assert.equal(engine.profileFromBirthday('2024-02-10', now).animal, 'dragon');
  assert.equal(engine.profileFromBirthday('2000-03-20', now).sign, 'pisces');
  assert.equal(engine.profileFromBirthday('2000-03-21', now).sign, 'aries');
  assert.throws(() => engine.profileFromBirthday('2025-02-29', now));
  assert.throws(() => engine.profileFromBirthday('2027-01-01', now));
});
test('all signs are deterministic per day and generate new daily readings', () => {
  for (const [kind, choices] of [['zodiac',data.signs],['animal',data.animals]]) {
    for (const choice of choices) {
      const current = engine.fortune('2026-10-13', kind, choice.key);
      assert.deepEqual(current, engine.fortune('2026-10-13', kind, choice.key));
      assert.notDeepEqual(current.scores, engine.fortune('2026-10-14', kind, choice.key).scores);
      assert.ok(current.scores.every(score => score >= 55 && score <= 98));
    }
  }
});
test('draws persist once per date and restore exactly after serialization', () => {
  const initial = engine.emptyState();
  const first = engine.draw(initial, '2026-10-13', 'oracle', () => 0.5);
  assert.equal(first.result, 51);
  assert.equal(initial.daily['2026-10-13'], undefined);
  const restored = engine.parseState(JSON.stringify(first.state));
  const repeat = engine.draw(restored, '2026-10-13', 'oracle', () => { throw new Error('must not redraw'); });
  assert.equal(repeat.result, first.result);
  assert.equal(repeat.repeated, true);
  const tomorrow = engine.draw(restored, '2026-10-14', 'oracle', () => 0.1);
  assert.equal(tomorrow.result, 11);
});
test('tarot samples every card including last minor arcana and both directions', () => {
  for (let index = 0; index < 78; index++) {
    for (const reversed of [false,true]) {
      let count = 0;
      const draw = engine.draw(engine.emptyState(), '2026-10-13', 'tarot', () => count++ === 0 ? (index + 0.1) / 78 : reversed ? 0.1 : 0.9);
      assert.deepEqual(draw.result, { id: index, reversed });
    }
  }
});
test('wish validation preserves Unicode, caps 50 characters and requires a theme', () => {
  const state = engine.addWish(engine.emptyState(), '2026-10-13', '🌙'.repeat(50), '平安喜乐', 'one');
  assert.equal(state.wishes.length, 1);
  assert.equal(engine.parseState(JSON.stringify(state)).wishes[0].text, '🌙'.repeat(50));
  assert.throws(() => engine.addWish(state, '2026-10-13', '愿'.repeat(51), '平安喜乐', 'two'));
  assert.throws(() => engine.addWish(state, '2026-10-13', ' ', '平安喜乐', 'two'));
  assert.throws(() => engine.addWish(state, '2026-10-13', '愿', 'unknown', 'two'));
});
test('corrupt or unsupported storage is rejected rather than reset', () => {
  for (const raw of ['{', '{}', 'null', '{"version":99}', '{"error":"encrypted_state_unavailable"}']) assert.throws(() => engine.parseState(raw));
  const invalid = engine.emptyState();
  invalid.daily['2026-10-13'] = { tarot: { id: 999, reversed: false } };
  assert.throws(() => engine.parseState(JSON.stringify(invalid)));
});
test('retains bounded daily history', () => {
  let state = engine.emptyState();
  for (let offset = 0; offset < 110; offset++) state = engine.draw(state, engine.dateKey(new Date(2026, 0, 1 + offset)), 'oracle', () => 0.5).state;
  assert.equal(Object.keys(state.daily).length, 90);
  assert.ok(state.daily['2026-04-20']);
});
