(function () {
  'use strict';

  const POPUP_TEXT = 'this section is not available anymore';
  const ALT_POPUP_TEXT = 'please use the main exam page';
  const BANK_KEY = 'etkBank';
  const LOOP_KEY = 'etkLoop';
  let loopTickFired = false;

  let busy = false;
  let throttle = 0;

  function restoreScroll() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      el.classList.remove('modal-open');
      if (el.style.overflow === 'hidden') el.style.removeProperty('overflow');
      if (el.style.paddingRight) el.style.removeProperty('padding-right');
    }
  }

  function findPopupByText() {
    const all = document.querySelectorAll('div, section, aside, dialog');
    for (const el of all) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (!text || text.length > 600) continue;
      if (text.includes(POPUP_TEXT) || text.includes(ALT_POPUP_TEXT)) {
        return el.closest('.modal, [role="dialog"], [class*="modal"]') || el;
      }
    }
    return null;
  }

  function hideElement(el) {
    if (!el || !el.style) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.setAttribute('data-killed-by-popup-killer', '1');
  }

  function cleanup() {
    if (busy) return;
    busy = true;
    try {
      const popup = findPopupByText();
      if (popup && !popup.hasAttribute('data-killed-by-popup-killer')) {
        hideElement(popup);
        document.querySelectorAll('.modal-backdrop').forEach(hideElement);
        restoreScroll();
      } else {
        restoreScroll();
      }
    } catch (_) {} finally {
      busy = false;
    }
  }

  function scheduleCleanup() {
    if (throttle) return;
    throttle = setTimeout(() => {
      throttle = 0;
      cleanup();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanup, { once: true });
  } else {
    cleanup();
  }
  window.addEventListener('load', cleanup, { once: true });

  const observer = new MutationObserver(scheduleCleanup);
  const startObserver = () => {
    if (!document.body) return false;
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  };

  if (!startObserver()) {
    const ready = new MutationObserver(() => {
      if (startObserver()) ready.disconnect();
    });
    ready.observe(document.documentElement, { childList: true, subtree: true });
  }

  const VIEW_URL_REGEX = /^(https?:\/\/[^/]+\/discussions\/[^/]+\/view\/)(\d+)(-[^/]*\/?)/i;
  const EXAM_META_REGEX = /\/discussions\/([^/]+)\/view\/\d+-exam-(.+?)-topic-(\d+)-question-(\d+)-discussion/i;

  function parseViewUrl(href) {
    const match = href.match(VIEW_URL_REGEX);
    if (!match) return null;
    return { prefix: match[1], number: parseInt(match[2], 10), suffix: match[3] };
  }

  function buildUrl(parts, delta) {
    const next = parts.number + delta;
    if (next < 1) return null;
    return parts.prefix + next + parts.suffix;
  }

  function parseExamMeta(href) {
    const m = href.match(EXAM_META_REGEX);
    if (!m) return null;
    return {
      vendor: m[1],
      examCode: m[2].toUpperCase(),
      topic: parseInt(m[3], 10),
      question: parseInt(m[4], 10),
    };
  }

  function nodesToText(parent, imageSink) {
    let out = '';
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') {
        out += '\n';
      } else if (tag === 'img') {
        const src = node.getAttribute('src');
        if (src) {
          if (imageSink) imageSink.push(src);
          out += `[IMG: ${src}]`;
        }
      } else {
        out += nodesToText(node, imageSink);
      }
    });
    return out;
  }

  function scrapeQuestion() {
    const body = document.querySelector('.question-body');
    if (!body) return null;
    const card = body.querySelector('p.card-text') || body.querySelector('.card-text');
    if (!card) return null;

    const images = [];
    const text = nodesToText(card, images).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    const options = [];
    body.querySelectorAll('.question-choices-container li.multi-choice-item').forEach((li) => {
      const letterEl = li.querySelector('.multi-choice-letter');
      const letter = letterEl ? letterEl.getAttribute('data-choice-letter') : null;
      if (!letter) return;
      const optImages = [];
      let optText = '';
      li.childNodes.forEach((node) => {
        if (node === letterEl) return;
        if (node.nodeType === Node.TEXT_NODE) {
          optText += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.contains(letterEl)) return;
          const tag = node.tagName.toLowerCase();
          if (tag === 'br') optText += '\n';
          else if (tag === 'img') {
            const src = node.getAttribute('src');
            if (src) { optImages.push(src); optText += `[IMG: ${src}]`; }
          } else {
            optText += nodesToText(node, optImages);
          }
        }
      });
      const opt = { letter, text: optText.trim(), isCorrect: li.classList.contains('correct-hidden') };
      if (optImages.length) opt.images = optImages;
      options.push(opt);
    });

    let voted = null;
    const voteScript = body.querySelector('.voted-answers-tally script[type="application/json"]');
    if (voteScript) {
      try { voted = JSON.parse(voteScript.textContent); } catch (_) {}
    }
    let suggestedAnswer = null;
    if (Array.isArray(voted) && voted.length) {
      const top = voted.find((v) => v.is_most_voted) || voted[0];
      if (top) suggestedAnswer = top.voted_answers;
    }
    if (!suggestedAnswer) {
      const correct = options.find((o) => o.isCorrect);
      if (correct) suggestedAnswer = correct.letter;
    }

    const idAttr = body.getAttribute('data-id');
    return {
      questionId: idAttr ? parseInt(idAttr, 10) : null,
      question: text,
      images,
      options,
      suggestedAnswer,
      voted,
    };
  }

  function loadBank() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(BANK_KEY, (result) => {
          resolve((result && result[BANK_KEY]) || {});
        });
      } catch (_) { resolve({}); }
    });
  }

  function saveBank(bank) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [BANK_KEY]: bank }, () => resolve());
      } catch (_) { resolve(); }
    });
  }

  async function saveCurrentQuestion() {
    const meta = parseExamMeta(location.href);
    if (!meta) { toast('Không nhận diện được mã đề từ URL'); return; }
    const data = scrapeQuestion();
    if (!data || !data.question) { toast('Không tìm thấy nội dung câu hỏi'); return; }

    const bank = await loadBank();
    bank[meta.examCode] = bank[meta.examCode] || {};
    const key = data.questionId ? String(data.questionId) : `${meta.topic}-${meta.question}`;
    const existed = !!bank[meta.examCode][key];
    bank[meta.examCode][key] = {
      ...data,
      url: location.href,
      examCode: meta.examCode,
      vendor: meta.vendor,
      topic: meta.topic,
      questionNumber: meta.question,
      savedAt: Date.now(),
    };
    await saveBank(bank);
    toast(`${existed ? 'Đã cập nhật' : 'Đã lưu'} ${meta.examCode} • Topic ${meta.topic} • Q${meta.question}`);
  }

  function toast(msg) {
    const old = document.getElementById('etk-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'etk-toast';
    el.textContent = msg;
    (document.body || document.documentElement).appendChild(el);
    setTimeout(() => el.classList.add('etk-toast-fade'), 1800);
    setTimeout(() => el.remove(), 2400);
  }

  async function openBankPanel() {
    const existing = document.getElementById('etk-bank-panel');
    if (existing) { existing.remove(); return; }

    const meta = parseExamMeta(location.href);
    const bank = await loadBank();
    const codes = Object.keys(bank).sort();
    const activeCode = (meta && bank[meta.examCode]) ? meta.examCode : (codes[0] || (meta && meta.examCode) || '');

    const panel = document.createElement('div');
    panel.id = 'etk-bank-panel';

    const header = document.createElement('div');
    header.className = 'etk-bank-header';
    const title = document.createElement('strong');
    title.textContent = 'Bank';
    header.appendChild(title);

    const select = document.createElement('select');
    select.className = 'etk-bank-select';
    if (codes.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(chưa có đề nào)';
      select.appendChild(opt);
      select.disabled = true;
    } else {
      codes.forEach((code) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = `${code} (${Object.keys(bank[code]).length})`;
        if (code === activeCode) opt.selected = true;
        select.appendChild(opt);
      });
    }
    header.appendChild(select);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'etk-bank-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => panel.remove());
    header.appendChild(closeBtn);

    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'etk-bank-list';
    panel.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'etk-bank-footer';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'etk-bank-action';
    exportBtn.textContent = 'Export JSON';
    exportBtn.addEventListener('click', () => exportBank(select.value));
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'etk-bank-action etk-bank-danger';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', async () => {
      const code = select.value;
      if (!code) return;
      if (!confirm(`Xoá toàn bộ bank ${code}?`)) return;
      const b = await loadBank();
      delete b[code];
      await saveBank(b);
      panel.remove();
      openBankPanel();
    });
    footer.appendChild(exportBtn);
    footer.appendChild(clearBtn);
    panel.appendChild(footer);

    select.addEventListener('change', () => renderBankList(list, select.value));
    (document.body || document.documentElement).appendChild(panel);
    if (select.value) renderBankList(list, select.value);
    else renderBankList(list, '');
  }

  async function renderBankList(container, code) {
    container.innerHTML = '';
    if (!code) {
      const empty = document.createElement('div');
      empty.className = 'etk-bank-empty';
      empty.textContent = 'Bấm 💾 Save trên một câu để bắt đầu.';
      container.appendChild(empty);
      return;
    }
    const bank = await loadBank();
    const items = bank[code] || {};
    const keys = Object.keys(items).sort((a, b) => (items[a].questionNumber || 0) - (items[b].questionNumber || 0));
    if (keys.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'etk-bank-empty';
      empty.textContent = 'Chưa có câu nào trong bank này.';
      container.appendChild(empty);
      return;
    }
    keys.forEach((k) => {
      const q = items[k];
      const row = document.createElement('div');
      row.className = 'etk-bank-row';

      const meta = document.createElement('div');
      meta.className = 'etk-bank-row-meta';
      const num = document.createElement('span');
      num.className = 'etk-bank-row-num';
      num.textContent = `T${q.topic || '?'}·Q${q.questionNumber || '?'}`;
      meta.appendChild(num);
      if (q.suggestedAnswer) {
        const ans = document.createElement('span');
        ans.className = 'etk-bank-row-ans';
        ans.textContent = q.suggestedAnswer;
        meta.appendChild(ans);
      }
      if (q.images && q.images.length) {
        const img = document.createElement('span');
        img.className = 'etk-bank-row-img';
        img.textContent = `🖼${q.images.length}`;
        meta.appendChild(img);
      }
      row.appendChild(meta);

      const body = document.createElement('div');
      body.className = 'etk-bank-row-body';
      const preview = (q.question || '').replace(/\s+/g, ' ').slice(0, 140);
      body.textContent = preview + ((q.question || '').length > 140 ? '…' : '');
      row.appendChild(body);

      const actions = document.createElement('div');
      actions.className = 'etk-bank-row-actions';
      const open = document.createElement('a');
      open.href = q.url;
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = 'Open';
      actions.appendChild(open);
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        const b = await loadBank();
        if (b[code]) {
          delete b[code][k];
          if (Object.keys(b[code]).length === 0) delete b[code];
        }
        await saveBank(b);
        renderBankList(container, b[code] ? code : '');
      });
      actions.appendChild(del);
      row.appendChild(actions);

      container.appendChild(row);
    });
  }

  async function exportBank(code) {
    if (!code) return;
    const bank = await loadBank();
    const items = bank[code] || {};
    const payload = {
      examCode: code,
      exportedAt: new Date().toISOString(),
      count: Object.keys(items).length,
      questions: Object.values(items).sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0)),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `examtopics-bank-${code}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function loadLoop() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(LOOP_KEY, (r) => resolve((r && r[LOOP_KEY]) || null));
      } catch (_) { resolve(null); }
    });
  }

  function saveLoopState(state) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [LOOP_KEY]: state }, () => resolve()); }
      catch (_) { resolve(); }
    });
  }

  function clearLoop() {
    return new Promise((resolve) => {
      try { chrome.storage.local.remove(LOOP_KEY, () => resolve()); }
      catch (_) { resolve(); }
    });
  }

  function waitForQuestionBody(timeoutMs) {
    return new Promise((resolve) => {
      if (document.querySelector('.question-body p.card-text')) { resolve(true); return; }
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (document.querySelector('.question-body p.card-text')) { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve(false); }
      }, 200);
    });
  }

  async function refreshLoopUI() {
    const btn = document.getElementById('etk-loop-btn');
    if (!btn) return;
    const state = await loadLoop();
    if (state && state.active) {
      btn.textContent = `⏸ ${state.savedCount || 0}/${state.targetN}`;
      btn.title = `Đang loop ${state.examCode} → Q${state.targetN}. Bấm để dừng.`;
      btn.classList.add('etk-loop-active');
    } else {
      btn.textContent = '🔁 Auto';
      btn.title = 'Auto-loop & autosave theo mã đề';
      btn.classList.remove('etk-loop-active');
    }
  }

  async function loopTick() {
    if (loopTickFired) return;
    loopTickFired = true;

    const state = await loadLoop();
    if (!state || !state.active) return;

    const viewParts = parseViewUrl(location.href);
    if (!viewParts) {
      await clearLoop();
      toast('⛔ Loop dừng: không phải trang câu hỏi');
      refreshLoopUI();
      return;
    }

    await waitForQuestionBody(8000);
    const meta = parseExamMeta(location.href);
    let reachedTarget = false;

    if (meta && meta.examCode === state.examCode) {
      state.misses = 0;
      if (meta.question > state.targetN) {
        reachedTarget = true;
      } else {
        const data = scrapeQuestion();
        if (data && data.question) {
          const bank = await loadBank();
          bank[meta.examCode] = bank[meta.examCode] || {};
          const key = data.questionId ? String(data.questionId) : `${meta.topic}-${meta.question}`;
          const wasNew = !bank[meta.examCode][key];
          bank[meta.examCode][key] = {
            ...data,
            url: location.href,
            examCode: meta.examCode,
            vendor: meta.vendor,
            topic: meta.topic,
            questionNumber: meta.question,
            savedAt: Date.now(),
          };
          await saveBank(bank);
          if (wasNew) state.savedCount = (state.savedCount || 0) + 1;
          state.lastQ = meta.question;
        }
        if (meta.question >= state.targetN) reachedTarget = true;
      }
    } else {
      state.misses = (state.misses || 0) + 1;
    }

    await saveLoopState(state);
    refreshLoopUI();

    if (reachedTarget) {
      await clearLoop();
      toast(`✅ Loop ${state.examCode} xong: đã lưu ${state.savedCount} câu (tới Q${state.lastQ || state.targetN})`);
      refreshLoopUI();
      return;
    }

    if (state.misses >= (state.maxMisses || 25)) {
      await clearLoop();
      toast(`⛔ Loop dừng: ${state.maxMisses} URL liên tiếp không khớp ${state.examCode}`);
      refreshLoopUI();
      return;
    }

    setTimeout(() => {
      const next = buildUrl(viewParts, 1);
      if (next) location.href = next;
    }, Math.max(500, state.delayMs || 1800));
  }

  function openLoopDialog() {
    const existing = document.getElementById('etk-loop-dialog');
    if (existing) { existing.remove(); return; }

    const meta = parseExamMeta(location.href);
    const viewParts = parseViewUrl(location.href);
    if (!viewParts) { toast('Hãy mở 1 câu hỏi rồi mới chạy loop'); return; }

    const dlg = document.createElement('div');
    dlg.id = 'etk-loop-dialog';

    const header = document.createElement('div');
    header.className = 'etk-loop-header';
    header.textContent = '🔁 Auto-loop & autosave';
    dlg.appendChild(header);

    const body = document.createElement('div');
    body.className = 'etk-loop-body';

    function makeField(labelText, input) {
      const wrap = document.createElement('label');
      wrap.className = 'etk-loop-field';
      const span = document.createElement('span');
      span.textContent = labelText;
      wrap.appendChild(span);
      wrap.appendChild(input);
      return wrap;
    }

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.value = meta ? meta.examCode : '';
    codeInput.placeholder = 'vd AB-731';
    body.appendChild(makeField('Mã đề chỉ định', codeInput));

    const nInput = document.createElement('input');
    nInput.type = 'number';
    nInput.min = '1';
    nInput.value = '50';
    body.appendChild(makeField('Tới câu N', nInput));

    const delayInput = document.createElement('input');
    delayInput.type = 'number';
    delayInput.min = '500';
    delayInput.step = '100';
    delayInput.value = '1800';
    body.appendChild(makeField('Delay mỗi bước (ms)', delayInput));

    const missInput = document.createElement('input');
    missInput.type = 'number';
    missInput.min = '5';
    missInput.value = '25';
    body.appendChild(makeField('Bỏ qua tối đa (URL không khớp liên tiếp)', missInput));

    const hint = document.createElement('div');
    hint.className = 'etk-loop-hint';
    const hereQ = meta ? `Q${meta.question}` : '?';
    hint.innerHTML =
      `Loop chỉ lưu câu khi <strong>mã đề khớp</strong>. ` +
      `Đi từ câu hiện tại (${hereQ}) theo ID tăng dần. ` +
      (meta && meta.question > 1 ? '<br>⚠️ Để lưu từ Q1, hãy mở Q1 trước khi bắt đầu.' : '') +
      '<br>Chỉ chạy ở 1 tab. Đóng tab giữa chừng → mở lại trang examtopics sẽ tiếp tục loop.';
    body.appendChild(hint);

    dlg.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'etk-loop-footer';
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'etk-bank-action';
    startBtn.textContent = 'Bắt đầu';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'etk-bank-action';
    cancelBtn.textContent = 'Hủy';
    footer.appendChild(startBtn);
    footer.appendChild(cancelBtn);
    dlg.appendChild(footer);

    cancelBtn.addEventListener('click', () => dlg.remove());
    startBtn.addEventListener('click', async () => {
      const code = (codeInput.value || '').trim().toUpperCase();
      const n = parseInt(nInput.value, 10);
      const delay = parseInt(delayInput.value, 10) || 1800;
      const misses = parseInt(missInput.value, 10) || 25;
      if (!code) { toast('Nhập mã đề'); return; }
      if (!n || n < 1) { toast('Nhập N hợp lệ'); return; }
      await saveLoopState({
        active: true,
        examCode: code,
        targetN: n,
        delayMs: delay,
        maxMisses: misses,
        misses: 0,
        savedCount: 0,
        lastQ: 0,
        startedAt: Date.now(),
      });
      dlg.remove();
      toast(`▶ Loop ${code} → Q${n} bắt đầu`);
      refreshLoopUI();
      loopTickFired = false;
      setTimeout(loopTick, 400);
    });

    document.body.appendChild(dlg);
  }

  function mkBtn(label, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'etk-nav-btn';
    b.textContent = label;
    if (title) b.title = title;
    return b;
  }

  function injectFloatingUI() {
    if (window.self !== window.top) return;
    if (document.getElementById('etk-nav-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'etk-nav-wrapper';

    const viewParts = parseViewUrl(location.href);
    const examMeta = parseExamMeta(location.href);

    if (viewParts) {
      const prev = mkBtn('◀ Prev', 'Câu trước (' + (viewParts.number - 1) + ')');
      if (viewParts.number <= 1) prev.disabled = true;
      prev.addEventListener('click', () => {
        const url = buildUrl(viewParts, -1);
        if (url) location.href = url;
      });
      wrapper.appendChild(prev);

      if (examMeta) {
        const save = mkBtn('💾 Save', `Lưu vào bank ${examMeta.examCode}`);
        save.addEventListener('click', saveCurrentQuestion);
        wrapper.appendChild(save);
      }

      const auto = mkBtn('🔁 Auto', 'Auto-loop & autosave theo mã đề');
      auto.id = 'etk-loop-btn';
      auto.addEventListener('click', async () => {
        const state = await loadLoop();
        if (state && state.active) {
          if (confirm(`Dừng loop ${state.examCode} (đã lưu ${state.savedCount || 0}/${state.targetN})?`)) {
            await clearLoop();
            toast('⛔ Đã dừng loop');
            refreshLoopUI();
          }
        } else {
          openLoopDialog();
        }
      });
      wrapper.appendChild(auto);

      const next = mkBtn('Next ▶', 'Câu sau (' + (viewParts.number + 1) + ')');
      next.addEventListener('click', () => {
        const url = buildUrl(viewParts, 1);
        if (url) location.href = url;
      });
      wrapper.appendChild(next);
    }

    const bankBtn = mkBtn('📚 Bank', 'Xem bank đã lưu');
    bankBtn.addEventListener('click', openBankPanel);
    wrapper.appendChild(bankBtn);

    (document.body || document.documentElement).appendChild(wrapper);
  }

  function tryInjectUI() {
    const run = () => {
      injectFloatingUI();
      refreshLoopUI();
      setTimeout(loopTick, 600);
    };
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  }
  tryInjectUI();
})();
