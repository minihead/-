(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./vendor/lunar.js'));
  else root.FortuneEngine = factory(root.FortuneData, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (data, calendarLibrary) {
  'use strict';
  function dateKey(date = new Date()) {
    if (!Number.isFinite(date.getTime())) throw new Error('日期无效');
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function randomGenerator(seed) {
    let state = 2166136261;
    for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
    return function () {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function calendar(date = new Date()) {
    if (date.getFullYear() < 1900 || date.getFullYear() > 2100) throw new Error('历法支持1900至2100年，请检查系统日期');
    const lunar = calendarLibrary.Solar.fromYmdHms(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()).getLunar();
    const times = lunar.getTimes();
    return {
      key: dateKey(date), solar: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
      lunar: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      year: lunar.getYearInGanZhi(), month: lunar.getMonthInGanZhi(), day: lunar.getDayInGanZhi(),
      yi: lunar.getDayYi(), ji: lunar.getDayJi(), nayin: lunar.getDayNaYin(),
      clash: lunar.getDayChongDesc(), sha: lunar.getDaySha(), officer: lunar.getZhiXing(),
      joy: lunar.getDayPositionXiDesc(), wealth: lunar.getDayPositionCaiDesc(), blessing: lunar.getDayPositionFuDesc(),
      term: lunar.getJieQi(), animal: lunar.getYearShengXiao(),
      hours: times.slice(0, 12).map((time, index) => {
        const current = date.getHours() === 23 && index === 0 ? times[12] : time;
        return { branch: current.getZhi(), luck: current.getTianShenLuck() };
      }),
      currentHour: Math.floor((date.getHours() + 1) / 2) % 12
    };
  }
  function fortune(key, kind, sign) {
    const choices = kind === 'zodiac' ? data.signs : data.animals;
    const identity = choices.find(item => item.key === sign);
    if (!identity) throw new Error('请选择有效的星座或生肖');
    const random = randomGenerator(`${key}:${kind}:${sign}:v1`);
    const scores = Array.from({ length: 4 }, () => 55 + Math.floor(random() * 44));
    const summary = data.advice[Math.floor(random() * data.advice.length)];
    return { ...identity, key, kind, scores, score: Math.round(scores.reduce((total, value) => total + value, 0) / 4), color: data.colors[Math.floor(random() * data.colors.length)], number: 1 + Math.floor(random() * 9), summary, advice: data.advice[Math.floor(random() * data.advice.length)] };
  }
  function profileFromBirthday(value, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请输入完整生日');
    const [year, month, day] = value.split('-').map(Number);
    const birthday = new Date(year, month - 1, day, 12);
    if (dateKey(birthday) !== value || value > dateKey(now) || year < 1900) throw new Error('请输入1900年至今天之间的有效生日');
    const boundaries = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
    const monthSigns = ['capricorn','aquarius','pisces','aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn'];
    const sign = monthSigns[month - 1 + (day >= boundaries[month - 1] ? 1 : 0)];
    const animal = calendar(birthday).animal;
    return { birthday: value, sign, animal: data.animals.find(item => item.name === animal).key };
  }
  function emptyState() {
    return { version: 1, profile: { birthday: '', sign: 'aries', animal: 'rat' }, preferences: { sound: true, motion: true }, daily: {}, wishes: [] };
  }
  function parseState(raw) {
    if (!raw) return emptyState();
    const state = JSON.parse(raw);
    if (state.version !== 1 || !state.profile || !state.preferences || !state.daily || Array.isArray(state.daily) || typeof state.daily !== 'object' || !Array.isArray(state.wishes)) throw new Error('本地记录格式异常，请先导出备份，暂未覆盖原记录');
    if (!data.signs.some(item => item.key === state.profile.sign) || !data.animals.some(item => item.key === state.profile.animal)) throw new Error('个人配置损坏，原记录已保留');
    if (typeof state.profile.birthday !== 'string' || typeof state.preferences.sound !== 'boolean' || typeof state.preferences.motion !== 'boolean') throw new Error('个人配置格式异常');
    if (state.wishes.length > 1000 || Object.keys(state.daily).length > 1000) throw new Error('本地记录超出容量，请先导出备份');
    for (const [key, entry] of Object.entries(state.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !entry || (entry.oracle !== undefined && !data.oracles.some(item => item.id === entry.oracle)) || (entry.tarot !== undefined && (!data.tarot.some(item => item.id === entry.tarot.id) || typeof entry.tarot.reversed !== 'boolean'))) throw new Error('每日记录损坏，原记录已保留');
    }
    for (const wish of state.wishes) {
      if (!wish || typeof wish.id !== 'string' || typeof wish.text !== 'string' || Array.from(wish.text).length > 50 || !data.wishThemes.includes(wish.theme) || typeof wish.date !== 'string') throw new Error('心愿记录损坏，原记录已保留');
    }
    return state;
  }
  function draw(state, key, kind, random = Math.random) {
    if (!['oracle','tarot'].includes(kind)) throw new Error('抽取类型无效');
    const updated = JSON.parse(JSON.stringify(state));
    if (updated.daily[key]?.[kind] !== undefined) return { state: updated, result: updated.daily[key][kind], repeated: true };
    const count = kind === 'oracle' ? data.oracles.length : data.tarot.length;
    const index = Math.min(count - 1, Math.floor(Math.max(0, random()) * count));
    const result = kind === 'oracle' ? data.oracles[index].id : { id: data.tarot[index].id, reversed: random() < 0.5 };
    updated.daily[key] = { ...updated.daily[key], [kind]: result };
    for (const expiredKey of Object.keys(updated.daily).sort().slice(0, -90)) delete updated.daily[expiredKey];
    return { state: updated, result, repeated: false };
  }
  function addWish(state, key, text, theme, id) {
    const cleaned = text.trim();
    if (!cleaned || Array.from(cleaned).length > 50) throw new Error('请填写1至50字的心愿');
    if (!data.wishThemes.includes(theme)) throw new Error('请选择祈福主题');
    if (state.wishes.length >= 1000) throw new Error('心愿已满1000条，请导出备份后清理部分记录');
    return { ...state, wishes: [...state.wishes, { id, date: key, text: cleaned, theme }] };
  }
  return { dateKey, randomGenerator, calendar, fortune, profileFromBirthday, emptyState, parseState, draw, addWish };
});
