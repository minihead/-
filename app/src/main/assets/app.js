(function () {
  'use strict';
  const data = window.FortuneData;
  const engine = window.FortuneEngine;
  const bridge = window.AndroidBridge;
  const storageKey = 'xingyun.state.v1';
  const element = identifier => document.getElementById(identifier);
  let state = engine.emptyState();
  let storageReady = true;
  let calendarInfo = null;
  let currentModule = 'fortune';
  let fortuneTab = 'zodiac';
  let selectedTheme = data.wishThemes[0];
  let historyLimit = 20;
  let drawing = false;
  let animationToken = 0;
  let audioContext = null;
  let lastSound = 0;
  let toastTimer;
  let previousFocus;
  let nativeBackground = false;
  let powerSaving = false;
  let currentPosterKind = 'fortune';
  let tarotCandidates = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function toast(message) {
    element('app-toast').textContent = message;
    element('app-toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { element('app-toast').hidden = true; }, 3500);
  }
  function showError(message) {
    element('app-error').textContent = message;
    element('app-error').hidden = !message;
  }
  try {
    const raw = bridge?.readState ? bridge.readState() : localStorage.getItem(storageKey);
    state = engine.parseState(raw);
  } catch (error) {
    storageReady = false;
    showError('本地记录暂时无法读取，已停止写入以保护原数据。' + error.message);
  }
  function commit(nextState) {
    if (!storageReady) { toast('本地记录不可写，原数据已保留'); return false; }
    try {
      const serialized = JSON.stringify(nextState);
      if (bridge?.writeState) {
        if (!bridge.writeState(serialized)) throw new Error('系统未能保存记录');
      } else localStorage.setItem(storageKey, serialized);
      state = nextState;
      return true;
    } catch (error) {
      toast('保存失败，未更改已有记录：' + error.message);
      return false;
    }
  }
  function secureRandom() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }
  function haptic() {
    if (document.hidden || nativeBackground) return;
    try {
      if (bridge?.vibrate) bridge.vibrate(25);
      else navigator.vibrate?.(25);
    } catch (_) {}
  }
  function sound(frequency = 432) {
    haptic();
    if (!state.preferences.sound || document.hidden || nativeBackground || performance.now() - lastSound < 100) return;
    lastSound = performance.now();
    try {
      const AudioConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioConstructor) return;
      if (!audioContext) audioContext = new AudioConstructor();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const start = audioContext.currentTime;
      for (const harmonic of [1, 2.76]) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = frequency * harmonic;
        gain.gain.setValueAtTime(0.08 / harmonic, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.2);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + 1.2);
      }
    } catch (_) {}
  }
  function renderPreferences() {
    element('btn-sound').textContent = state.preferences.sound ? '音效开' : '音效关';
    element('btn-sound').setAttribute('aria-pressed', String(state.preferences.sound));
    element('btn-motion').textContent = state.preferences.motion ? '动效开' : '动效关';
    element('btn-motion').setAttribute('aria-pressed', String(state.preferences.motion));
    document.body.classList.toggle('reduced-motion', !state.preferences.motion || reducedMotion.matches || powerSaving);
    element('btn-profile').textContent = state.profile.birthday ? '我的生日配置' : '设置生日';
  }
  function createPills(containerId, entries, className, profileField) {
    const container = element(containerId);
    entries.forEach(identity => {
      const button = document.createElement('button');
      button.className = className;
      button.dataset.sign = identity.key;
      button.textContent = `${identity.icon} ${identity.name}`;
      button.addEventListener('click', () => {
        if (commit({ ...state, profile: { ...state.profile, [profileField]: identity.key } })) {
          renderFortunes();
          sound(600);
        }
      });
      container.appendChild(button);
    });
  }
  function renderMetrics(containerId, labels, scores) {
    const container = element(containerId);
    container.replaceChildren();
    labels.forEach((label, index) => {
      const box = document.createElement('div');
      box.className = 'energy-metric-box';
      const row = document.createElement('div');
      row.className = 'metric-row';
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('span');
      value.textContent = scores[index] + '分';
      row.append(name, value);
      const track = document.createElement('div');
      track.className = 'metric-track';
      const bar = document.createElement('div');
      bar.className = 'metric-fill';
      bar.style.width = scores[index] + '%';
      track.appendChild(bar);
      box.append(row, track);
      container.appendChild(box);
    });
  }
  function renderFortunes() {
    if (!calendarInfo) return;
    for (const [kind, field, prefix] of [['zodiac','sign','zodiac'], ['animal','animal','czodiac']]) {
      const reading = engine.fortune(calendarInfo.key, kind, state.profile[field]);
      element(prefix + '-title').textContent = reading.icon + ' ' + reading.name;
      element(prefix + '-score-badge').textContent = reading.score + '分';
      element(prefix + '-desc').textContent = reading.summary;
      renderMetrics(prefix + '-metrics', kind === 'zodiac' ? ['综合','事业','财富','情感'] : ['行动','协作','资源','心情'], reading.scores);
      element(kind === 'zodiac' ? 'zodiac-guide-body' : 'czodiac-tips').textContent = reading.advice;
      document.querySelectorAll('.' + prefix + '-pill-item').forEach(button => {
        const active = button.dataset.sign === reading.key || button.dataset.sign === state.profile[field];
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (kind === 'zodiac') {
        element('zodiac-color').textContent = reading.color;
        element('zodiac-num').textContent = reading.number;
      }
    }
  }
  function renderCalendar() {
    const current = calendarInfo;
    element('top-date-text').textContent = `${current.key.slice(5).replace('-', '月')}日 · ${current.lunar}`;
    element('top-date-text').dateTime = current.key;
    element('almanac-gz-header').textContent = `${current.year}年 ${current.month}月 ${current.day}日`;
    element('almanac-day-tag').textContent = current.term || current.officer + '日';
    element('almanac-gz-detail').textContent = `五行纳音：${current.nayin} · 冲${current.clash} · 煞${current.sha}`;
    element('almanac-yi').textContent = current.yi.join(' · ');
    element('almanac-ji').textContent = current.ji.join(' · ');
    element('almanac-directions').textContent = `喜神${current.joy} · 财神${current.wealth} · 福神${current.blessing}`;
    element('almanac-hours').replaceChildren(...current.hours.map((hour, index) => {
      const item = document.createElement('span');
      item.textContent = hour.branch + '时 · ' + hour.luck;
      item.classList.toggle('current', index === current.currentHour);
      return item;
    }));
  }
  function refreshDate() {
    try {
      const now = new Date();
      if (calendarInfo?.key === engine.dateKey(now) && calendarInfo.currentHour === Math.floor((now.getHours() + 1) / 2) % 12) return true;
      const next = engine.calendar(now);
      const changed = next.key !== calendarInfo?.key;
      calendarInfo = next;
      renderCalendar();
      if (changed) {
        cancelAnimation();
        renderFortunes();
        renderResults();
        if (!element('poster-modal-preview').hidden) renderPoster(currentPosterKind);
        element('profile-birthday').max = next.key;
      }
      if (storageReady) showError('');
      return true;
    } catch (error) {
      calendarInfo = null;
      showError(error.message + '。请检查设备系统日期。');
      return false;
    }
  }
  function renderResults() {
    const daily = state.daily[calendarInfo?.key] || {};
    const oracle = data.oracles.find(item => item.id === daily.oracle);
    element('divine-result-card').hidden = !oracle;
    element('oracle-status').textContent = oracle ? '今日已求，心诚则灵。再次点击可查看今日结果。' : '在此页晃动手机或轻触签筒，每日一次。';
    element('btn-trigger-shake').textContent = oracle ? '查看今日灵签' : '摇一摇 · 求今日指引';
    if (oracle) {
      element('oracle-title').textContent = `第${oracle.id}签 · ${oracle.title}`;
      element('oracle-level').textContent = oracle.level;
      for (const key of ['poem','explanation','advice']) element('oracle-' + key).textContent = oracle[key];
    }
    const tarot = data.tarot.find(item => item.id === daily.tarot?.id);
    element('revealed-tarot-box').hidden = !tarot;
    element('tarot-meaning-card').hidden = !tarot;
    element('tarot-arc-stage').hidden = !!tarot;
    element('tarot-flipper-target').classList.toggle('flipped', !!tarot);
    element('tarot-status').textContent = tarot ? '今日已抽，可随时回来看这一份指引。' : '从78张牌中洗出7张候选牌。左右滑动重新切牌，点击牌背抽取，每日一次。';
    element('btn-draw-tarot').textContent = tarot ? '查看今日塔罗' : '凭直觉 · 抽取今日塔罗';
    if (tarot) {
      const meaning = daily.tarot.reversed ? tarot.reversed : tarot.upright;
      element('tarot-arcana').textContent = tarot.arcana;
      element('tarot-icon').textContent = tarot.icon;
      element('tarot-title').textContent = tarot.name + (daily.tarot.reversed ? ' · 逆位' : ' · 正位');
      element('tarot-summary').textContent = meaning.summary;
      element('tarot-state').textContent = '今日状态：' + meaning.state;
      element('tarot-social').textContent = '人际交往：' + meaning.social;
      element('tarot-advice').textContent = '内在建议：' + meaning.advice;
    }
  }
  function cancelAnimation() {
    animationToken++;
    drawing = false;
    element('tube-click-area').classList.remove('shaking');
    element('btn-trigger-shake').disabled = false;
    element('btn-draw-tarot').disabled = false;
  }
  function showResult(kind) {
    const target = element(kind === 'oracle' ? 'divine-result-card' : 'revealed-tarot-box');
    target.scrollIntoView({ block: 'nearest', behavior: document.body.classList.contains('reduced-motion') ? 'auto' : 'smooth' });
  }
  async function draw(kind, candidate) {
    if (drawing || !refreshDate() || !storageReady) return;
    const module = kind === 'oracle' ? 'divine' : 'tarot';
    if (currentModule !== module || activeModal()) return;
    const key = calendarInfo.key;
    let first = true;
    const random = () => {
      if (first && kind === 'tarot' && Number.isInteger(candidate)) { first = false; return (candidate + 0.5) / data.tarot.length; }
      return secureRandom();
    };
    const drawn = engine.draw(state, key, kind, random);
    if (!drawn.repeated && !commit(drawn.state)) return;
    if (drawn.repeated) { renderResults(); showResult(kind); toast('今日结果已保留'); return; }
    drawing = true;
    const token = ++animationToken;
    element(kind === 'oracle' ? 'btn-trigger-shake' : 'btn-draw-tarot').disabled = true;
    if (kind === 'oracle') element('tube-click-area').classList.add('shaking');
    sound(kind === 'oracle' ? 432 : 528);
    try {
      await new Promise(resolve => setTimeout(resolve, document.body.classList.contains('reduced-motion') ? 0 : 650));
      if (token !== animationToken || currentModule !== module || engine.dateKey() !== key || nativeBackground || document.hidden) return;
      renderResults();
      if (kind === 'tarot' && !document.body.classList.contains('reduced-motion')) {
        const flipper = element('tarot-flipper-target');
        flipper.classList.remove('flipped');
        void flipper.offsetWidth;
        requestAnimationFrame(() => flipper.classList.add('flipped'));
      }
      showResult(kind);
    } finally {
      if (token === animationToken) cancelAnimation();
    }
  }
  function shuffleTarot() {
    tarotCandidates = data.tarot.map(item => item.id);
    for (let index = tarotCandidates.length - 1; index > 0; index--) {
      const other = Math.floor(secureRandom() * (index + 1));
      [tarotCandidates[index], tarotCandidates[other]] = [tarotCandidates[other], tarotCandidates[index]];
    }
    element('tarot-arc-stage').replaceChildren(...tarotCandidates.slice(0, 7).map((candidate, index) => {
      const button = document.createElement('button');
      button.className = 'tarot-card-item';
      button.style.transform = `translateX(${(index - 3) * 28}px) rotate(${(index - 3) * 8}deg)`;
      button.setAttribute('aria-label', '选择第' + (index + 1) + '张牌');
      button.addEventListener('click', () => draw('tarot', candidate));
      return button;
    }));
  }
  function switchModule(module) {
    cancelAnimation();
    currentModule = module;
    document.querySelectorAll('[data-mod]').forEach(button => {
      button.classList.toggle('active', button.dataset.mod === module);
      if (button.dataset.mod === module) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    for (const name of ['fortune','divine','tarot','lantern']) element('view-' + name).hidden = name !== module;
    const titles = { fortune: '今日运势', divine: '摇签求吉', tarot: '每日塔罗', lantern: '祈福明灯' };
    element('app-title-text').textContent = '星运灵签 · ' + titles[module];
    refreshDate();
    renderResults();
    element('app-screen-scroll-body').scrollTop = 0;
  }
  function setFortuneTab(tab) {
    fortuneTab = tab;
    for (const name of ['zodiac','almanac']) {
      element('tab-sub-' + name).classList.toggle('active', name === tab);
      element('tab-sub-' + name).setAttribute('aria-selected', String(name === tab));
      element('subview-' + name).hidden = name !== tab;
    }
  }
  function renderWishes() {
    element('wish-count').textContent = state.wishes.length + '盏明灯';
    element('wish-storage-note').textContent = bridge?.writeState ? '记录经安卓密钥加密保存在本机，不上传。卸载会删除记录，请定期导出。' : '网页预览记录保存在此浏览器，未加密；清除网站数据会删除记录。';
    element('wish-atmosphere').textContent = '本地预置祝福：' + data.wishes[Math.floor(secureRandom() * data.wishes.length)];
    const sky = element('lantern-sky-canvas');
    sky.replaceChildren(...state.wishes.slice(-24).map((wish, index) => {
      const lantern = document.createElement('div');
      lantern.className = 'celestial-lantern stored-lantern';
      lantern.style.left = (8 + index % 8 * 12) + '%';
      lantern.style.top = (20 + Math.floor(index / 8) * 42) + 'px';
      lantern.style.animationDelay = -(index % 5) + 's';
      return lantern;
    }));
    element('wish-history').replaceChildren(...state.wishes.slice().reverse().slice(0, historyLimit).map(wish => {
      const item = document.createElement('li');
      const heading = document.createElement('div');
      heading.className = 'small-note';
      heading.textContent = wish.date + ' · ' + wish.theme;
      const text = document.createElement('p');
      text.textContent = wish.text;
      const remove = document.createElement('button');
      remove.className = 'secondary-btn';
      remove.textContent = '删除此心愿';
      remove.addEventListener('click', () => {
        if (confirm('删除这条心愿？此操作无法撤销。') && commit({ ...state, wishes: state.wishes.filter(record => record.id !== wish.id) })) renderWishes();
      });
      item.append(heading, text, remove);
      return item;
    }));
    element('btn-more-wishes').hidden = state.wishes.length <= historyLimit;
  }
  function activeModal() { return document.querySelector('.poster-modal:not([hidden])'); }
  function openModal(identifier) {
    previousFocus = document.activeElement;
    cancelAnimation();
    renderResults();
    element(identifier).hidden = false;
    document.querySelector('.app-viewport').inert = true;
    element(identifier).querySelector('input,button').focus({ preventScroll: true });
  }
  function closeModal() {
    document.querySelectorAll('.poster-modal').forEach(modal => { modal.hidden = true; });
    document.querySelector('.app-viewport').inert = false;
    previousFocus?.focus({ preventScroll: true });
  }
  function posterContent(kind) {
    const daily = state.daily[calendarInfo.key] || {};
    if (kind === 'oracle') {
      const oracle = data.oracles.find(item => item.id === daily.oracle);
      if (!oracle) throw new Error('请先求取今日灵签');
      return { title: `第${oracle.id}签 · ${oracle.title}`, subtitle: oracle.level, sections: [oracle.poem, oracle.explanation, oracle.advice] };
    }
    if (kind === 'tarot') {
      const card = data.tarot.find(item => item.id === daily.tarot?.id);
      if (!card) throw new Error('请先抽取今日塔罗');
      const meaning = daily.tarot.reversed ? card.reversed : card.upright;
      return { title: card.name, subtitle: daily.tarot.reversed ? '逆位' : '正位', sections: [meaning.summary, '今日状态：' + meaning.state, '人际交往：' + meaning.social, '内在建议：' + meaning.advice] };
    }
    const zodiac = fortuneTab === 'zodiac';
    const reading = engine.fortune(calendarInfo.key, zodiac ? 'zodiac' : 'animal', zodiac ? state.profile.sign : state.profile.animal);
    return { title: reading.icon + ' ' + reading.name, subtitle: reading.score + '分 · 今日指引', sections: [reading.summary, reading.advice, `幸运色：${reading.color}   幸运数字：${reading.number}`, ...(zodiac ? [] : ['宜：' + calendarInfo.yi.join('、'), '忌：' + calendarInfo.ji.join('、')])] };
  }
  function renderPoster(kind) {
    let content;
    try { content = posterContent(kind); } catch (error) { closeModal(); toast(error.message); return false; }
    currentPosterKind = kind;
    const context = element('poster-render-canvas').getContext('2d');
    context.fillStyle = '#0c1020';
    context.fillRect(0, 0, 750, 1334);
    context.strokeStyle = '#c5a059';
    context.lineWidth = 2;
    context.strokeRect(32, 32, 686, 1270);
    context.fillStyle = '#fae6b8';
    context.textAlign = 'center';
    context.font = 'bold 36px serif';
    context.fillText('✦ 星运灵签 ✦', 375, 120);
    context.font = '22px sans-serif';
    context.fillStyle = '#afb6c7';
    context.fillText(calendarInfo.solar + ' · 农历' + calendarInfo.lunar, 375, 175);
    context.fillStyle = '#fae6b8';
    context.font = 'bold 32px serif';
    context.fillText(content.title, 375, 265, 600);
    context.font = '25px sans-serif';
    context.fillText(content.subtitle, 375, 315);
    context.textAlign = 'left';
    context.fillStyle = '#e0e3eb';
    function wrapSections(fontSize) {
      context.font = fontSize + 'px sans-serif';
      return content.sections.map(section => section.split('\n').flatMap(paragraph => {
        const lines = [];
        let line = '';
        for (const character of paragraph) {
          if (context.measureText(line + character).width > 594) { lines.push(line); line = ''; }
          line += character;
        }
        lines.push(line);
        return lines;
      }));
    }
    let fontSize = 26;
    let sections = wrapSections(fontSize);
    while (sections.reduce((height, lines) => height + lines.length * fontSize * 1.55 + 20, 0) > 730 && fontSize > 14) {
      fontSize--;
      sections = wrapSections(fontSize);
    }
    let position = 405;
    for (const section of sections) {
      for (const line of section) {
        context.fillText(line, 78, position);
        position += fontSize * 1.55;
      }
      position += 20;
    }
    context.textAlign = 'center';
    context.font = '20px sans-serif';
    context.fillStyle = '#a9aebe';
    context.fillText('文化娱乐 · 关照自己 · 不作为决策依据', 375, 1220);
    context.fillText('日期依设备系统时间 · 全部内容离线生成', 375, 1255);
    return true;
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function exportPoster(share) {
    if (!refreshDate() || !renderPoster(currentPosterKind)) return;
    const canvas = element('poster-render-canvas');
    try {
      if (bridge?.shareImage && bridge?.saveImageToGallery) {
        const accepted = share ? bridge.shareImage(canvas.toDataURL('image/png')) : bridge.saveImageToGallery(canvas.toDataURL('image/png'));
        if (!accepted) toast('已有图片正在处理，请稍候');
        return;
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('图片生成失败');
      const file = new File([blob], 'xingyun-' + calendarInfo.key + '.png', { type: 'image/png' });
      if (share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: '星运灵签', files: [file] });
      else download(blob, file.name);
    } catch (error) { if (error.name !== 'AbortError') toast(error.message); }
  }

  createPills('zodiac-ribbon', data.signs, 'zodiac-pill-item', 'sign');
  createPills('chinese-zodiac-ribbon', data.animals, 'czodiac-pill-item', 'animal');
  data.wishThemes.forEach(theme => {
    const button = document.createElement('button');
    button.className = 'wish-theme-pill';
    button.textContent = theme;
    button.classList.toggle('active', theme === selectedTheme);
    button.setAttribute('aria-pressed', String(theme === selectedTheme));
    button.addEventListener('click', () => {
      selectedTheme = theme;
      element('wish-themes').querySelectorAll('button').forEach(pill => {
        pill.classList.toggle('active', pill === button);
        pill.setAttribute('aria-pressed', String(pill === button));
      });
    });
    element('wish-themes').appendChild(button);
  });
  document.querySelectorAll('[data-mod]').forEach(button => button.addEventListener('click', () => { switchModule(button.dataset.mod); sound(); }));
  for (const tab of ['zodiac','almanac']) element('tab-sub-' + tab).addEventListener('click', () => { setFortuneTab(tab); sound(600); });
  element('btn-trigger-shake').addEventListener('click', () => draw('oracle'));
  element('tube-click-area').addEventListener('click', () => draw('oracle'));
  element('btn-draw-tarot').addEventListener('click', () => draw('tarot', tarotCandidates[0]));
  let pointerStart = 0;
  element('tarot-arc-stage').addEventListener('pointerdown', event => { pointerStart = event.clientX; });
  element('tarot-arc-stage').addEventListener('pointerup', event => {
    if (Math.abs(event.clientX - pointerStart) > 45 && !drawing) { shuffleTarot(); sound(600); }
  });
  element('input-wish-text').addEventListener('input', event => {
    const count = Array.from(event.target.value).length;
    element('wish-length').textContent = count + ' / 50';
    element('btn-submit-wish').disabled = count > 50 || !event.target.value.trim();
  });
  element('btn-submit-wish').addEventListener('click', () => {
    if (!refreshDate()) return;
    try {
      const next = engine.addWish(state, calendarInfo.key, element('input-wish-text').value, selectedTheme, Date.now() + '-' + secureRandom().toString(16).slice(2));
      if (commit(next)) {
        element('input-wish-text').value = '';
        element('input-wish-text').dispatchEvent(new Event('input'));
        renderWishes();
        sound(639);
        toast('心愿已保存');
      }
    } catch (error) { toast(error.message); }
  });
  element('btn-more-wishes').addEventListener('click', () => { historyLimit += 20; renderWishes(); });
  element('btn-export-data').addEventListener('click', () => {
    if (!storageReady) { toast('记录无法读取，请保留应用数据以便恢复'); return; }
    const serialized = JSON.stringify(state, null, 2);
    if (bridge?.exportData) bridge.exportData(serialized);
    else download(new Blob([serialized], { type: 'application/json' }), 'xingyun-backup.json');
    toast('备份包含私人记录，请妥善保管');
  });
  element('btn-profile').addEventListener('click', () => {
    element('profile-birthday').value = state.profile.birthday;
    element('profile-error').textContent = '';
    openModal('profile-modal');
  });
  element('profile-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const profile = engine.profileFromBirthday(element('profile-birthday').value);
      if (commit({ ...state, profile })) { renderFortunes(); renderPreferences(); closeModal(); toast('配置已保存'); }
    } catch (error) { element('profile-error').textContent = error.message; }
  });
  for (const preference of ['sound','motion']) element('btn-' + preference).addEventListener('click', () => {
    if (commit({ ...state, preferences: { ...state.preferences, [preference]: !state.preferences[preference] } })) {
      renderPreferences();
      if (!state.preferences.sound) audioContext?.suspend().catch(() => {});
    }
  });
  document.querySelectorAll('[data-poster]').forEach(button => button.addEventListener('click', () => {
    if (refreshDate() && renderPoster(button.dataset.poster)) openModal('poster-modal-preview');
  }));
  element('btn-close-poster').addEventListener('click', closeModal);
  element('btn-close-profile').addEventListener('click', closeModal);
  element('btn-save-poster-img').addEventListener('click', () => exportPoster(false));
  element('btn-share-poster-img').addEventListener('click', () => exportPoster(true));
  document.addEventListener('keydown', event => {
    const modal = activeModal();
    if (!modal) return;
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button:not(:disabled), input')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.setSystemInsets = (top, bottom) => {
    for (const [name, value] of [['top',top],['bottom',bottom]]) document.documentElement.style.setProperty('--safe-' + name, Math.max(0, Math.min(500, Number(value) || 0)) + 'px');
  };
  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== window.parent || event.data?.type !== 'fortune-preview-theme') return;
    if (location.protocol !== 'file:' && event.origin !== location.origin) return;
    const themes = {
      gold: ['#c5a059', 'rgba(197,160,89,.3)', '#120e06'],
      silver: ['#bcc8da', 'rgba(188,200,218,.2)', '#121820'],
      rose: ['#e1b0b8', 'rgba(225,176,184,.2)', '#211318'],
      jade: ['#a1c6b3', 'rgba(161,198,179,.2)', '#102019']
    };
    const theme = themes[event.data.theme];
    if (!theme) return;
    const style = document.documentElement.style;
    style.setProperty('--theme-primary', theme[0]);
    style.setProperty('--theme-glow', theme[1]);
    style.setProperty('--theme-btn-bg', theme[0]);
    style.setProperty('--theme-btn-color', theme[2]);
    style.setProperty('--theme-border', theme[0] + '66');
  });
  window.handleNativeShake = () => {
    if (currentModule === 'divine' && !activeModal() && !document.hidden && !nativeBackground) draw('oracle');
  };
  window.handleAndroidBack = () => {
    if (activeModal()) { closeModal(); return true; }
    if (currentModule !== 'fortune') { switchModule('fortune'); return true; }
    return false;
  };
  window.onNativeResult = (_operation, _success, message) => toast(message);
  window.setPowerSaving = enabled => { powerSaving = enabled; renderPreferences(); };
  window.onNativePause = () => {
    nativeBackground = true;
    cancelAnimation();
    document.body.classList.add('backgrounded');
    audioContext?.suspend().catch(() => {});
  };
  window.onNativeResume = () => {
    nativeBackground = false;
    document.body.classList.remove('backgrounded');
    refreshDate();
    renderResults();
  };
  document.addEventListener('visibilitychange', () => document.hidden ? window.onNativePause() : window.onNativeResume());
  window.addEventListener('focus', refreshDate);
  reducedMotion.addEventListener?.('change', renderPreferences);
  setInterval(() => { if (!document.hidden && !nativeBackground) refreshDate(); }, 15000);
  renderPreferences();
  shuffleTarot();
  refreshDate();
  renderWishes();
  element('input-wish-text').dispatchEvent(new Event('input'));
})();
