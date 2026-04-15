const STORAGE_KEYS = {
  cards: 'kanjisrs-web-study-cards',
  theme: 'kanjisrs-web-theme'
};

const DAY_MS = 24 * 60 * 60 * 1000;

const state = {
  theme: localStorage.getItem(STORAGE_KEYS.theme) || 'dark',
  kanji: [],
  vocab: [],
  jmdictFallback: [],
  jmdictStatus: 'not_loaded',
  jmdictError: '',
  studyCards: loadStudyCards(),
  tab: 'home',
  searchQuery: '',
  autoKana: true,
  isSearchComposing: false,
  selectedReviewCardId: null,
  reviewAnswer: '',
  isReviewComposing: false,
  reviewChecked: false,
  sessionDoneCount: 0
};

const elements = {
  home: document.getElementById('home'),
  search: document.getElementById('search'),
  study: document.getElementById('study'),
  review: document.getElementById('review'),
  detailModal: document.getElementById('detailModal'),
  detailContent: document.getElementById('detailContent'),
  themeToggle: document.getElementById('themeToggle'),
  tabs: Array.from(document.querySelectorAll('.tab'))
};

applyTheme();
wireEvents();
render();
loadCoreData();

async function loadCoreData() {
  try {
    const [kanji, vocab] = await Promise.all([
      fetch('./data/kanji_data.json').then((r) => r.json()),
      fetch('./data/vocab_data.json').then((r) => r.json())
    ]);

    state.kanji = kanji;
    state.vocab = vocab;
    render();
  } catch (error) {
    console.error(error);
    elements.home.innerHTML = cardMarkup('Could not load data', '<p class="muted">Make sure you are serving the site from a local web server instead of opening the file directly.</p>');
  }
}

async function loadJmdictFallback() {
  if (state.jmdictStatus === 'loading' || state.jmdictStatus === 'loaded') return;

  state.jmdictStatus = 'loading';
  state.jmdictError = '';
  renderSearch();

  try {
    const text = await fetch('./data/jmdict_fallback_vocab.jsonl').then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });

    state.jmdictFallback = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    state.jmdictStatus = 'loaded';
    render();
  } catch (error) {
    console.error(error);
    state.jmdictStatus = 'error';
    state.jmdictError = error instanceof Error ? error.message : 'Unknown error';
    renderSearch();
  }
}

function wireEvents() {
  elements.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    applyTheme();
  });

  elements.tabs.forEach((tabButton) => {
    tabButton.addEventListener('click', () => {
      state.tab = tabButton.dataset.tab;
      render();
    });
  });
}

function applyTheme() {
  document.body.classList.toggle('light', state.theme === 'light');
}

function renderTabs() {
  elements.tabs.forEach((button) => button.classList.toggle('active', button.dataset.tab === state.tab));
  Object.entries(elements)
    .filter(([key]) => ['home', 'search', 'study', 'review'].includes(key))
    .forEach(([key, element]) => element.classList.toggle('active', key === state.tab));
}

function render() {
  renderTabs();
  renderHome();
  renderSearch();
  renderStudy();
  renderReview();
}

function renderHome() {
  const dueCards = getDueCards();
  const recentCards = [...state.studyCards].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);

  elements.home.innerHTML = `
    <div class="grid">
      ${statCard('Studying', state.studyCards.length, 'Items currently in your browser-based study list.')}
      ${statCard('Due now', dueCards.length, 'Cards ready to review right now.')}
      ${statCard('Kanji', state.kanji.length || '…', 'Loaded from your existing Android app dataset.')}
      ${statCard('Curated vocab', state.vocab.length || '…', 'Tanuki-based vocabulary available on the web.')}
    </div>
    <div class="card" style="margin-top: 1rem;">
      <h2>What this website includes</h2>
      <p class="muted">This website reuses your KanjiSRS kanji data, curated vocabulary, optional JMdict fallback dictionary, and the same spaced repetition scheduling logic from the Android app, while saving progress in browser localStorage.</p>
      <div class="inline-actions">
        <button class="button" data-jump="search">Browse kanji & vocab</button>
        <button class="ghost-button" data-jump="review">Review due cards</button>
      </div>
    </div>
    <div class="card" style="margin-top: 1rem;">
      <h2>Recently added</h2>
      ${recentCards.length ? `<div class="list">${recentCards.map(studyRowMarkup).join('')}</div>` : '<div class="empty-state">No study items yet. Add kanji or vocabulary from the Search tab.</div>'}
    </div>
  `;

  elements.home.querySelectorAll('[data-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.jump;
      render();
    });
  });

  wireStudyRowActions(elements.home);
}

function renderSearch() {
  if (!elements.search.querySelector('#searchInput')) {
    elements.search.innerHTML = `
      <div class="search-layout">
        <aside class="search-box card">
          <h2>Search</h2>
          <input id="searchInput" class="input" lang="ja" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Try 日, 学校, がっこう, osananajimi" />
          <div class="inline-actions">
            <button id="clearSearch" class="ghost-button">Show kanji grid</button>
            <button id="toggleAutoKana" class="ghost-button"></button>
            <button id="loadJmdict">Load JMdict fallback</button>
          </div>
          <p class="muted">Core search uses kanji_data.json and vocab_data.json. JMdict fallback is optional because it is large, but now you can load it into the website and search dictionary-only words too.</p>
          <p id="jmdictStatusText" class="muted"></p>
          <p id="jmdictErrorText" class="muted"></p>
        </aside>
        <div id="searchResults" class="list"></div>
      </div>
    `;

    const searchInput = document.getElementById('searchInput');
    searchInput.value = state.searchQuery;

    searchInput.addEventListener('compositionstart', () => {
      state.isSearchComposing = true;
    });

    searchInput.addEventListener('compositionend', (event) => {
      state.isSearchComposing = false;
      state.searchQuery = event.target.value;
      renderSearchResults();
    });

    searchInput.addEventListener('input', (event) => {
      let value = event.target.value;
      if (!state.isSearchComposing && state.autoKana) {
        value = convertRomajiToHiragana(value);
        event.target.value = value;
      }
      state.searchQuery = value;
      if (!state.isSearchComposing) {
        renderSearchResults();
      }
    });

    document.getElementById('clearSearch').addEventListener('click', () => {
      state.searchQuery = '';
      state.isSearchComposing = false;
      searchInput.value = '';
      renderSearchResults();
      searchInput.focus();
    });

    document.getElementById('toggleAutoKana').addEventListener('click', () => {
      state.autoKana = !state.autoKana;
      renderSearchResults();
      searchInput.focus();
    });

    document.getElementById('loadJmdict')?.addEventListener('click', () => {
      loadJmdictFallback();
    });
  }

  renderSearchResults();
}

function renderSearchResults() {
  const query = state.searchQuery.trim();
  const kanjiMatches = !query
    ? state.kanji.slice(0, 150)
    : state.kanji.filter((entry) => matchesKanji(entry, query)).slice(0, 24);
  const vocabMatches = !query
    ? []
    : state.vocab.filter((entry) => matchesVocab(entry, query)).slice(0, 40);
  const fallbackMatches = !query || state.jmdictStatus !== 'loaded'
    ? []
    : state.jmdictFallback.filter((entry) => matchesFallbackVocab(entry, query)).slice(0, 40);

  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value !== state.searchQuery && document.activeElement !== searchInput) {
    searchInput.value = state.searchQuery;
  }

  const autoKanaButton = document.getElementById('toggleAutoKana');
  if (autoKanaButton) {
    autoKanaButton.textContent = state.autoKana ? 'Romaji → かな: On' : 'Romaji → かな: Off';
  }

  const loadJmdictButton = document.getElementById('loadJmdict');
  if (loadJmdictButton) {
    loadJmdictButton.textContent = jmdictButtonLabel();
    loadJmdictButton.className = state.jmdictStatus === 'loaded' ? 'ghost-button' : 'button';
    loadJmdictButton.disabled = state.jmdictStatus === 'loading' || state.jmdictStatus === 'loaded';
  }

  const statusText = document.getElementById('jmdictStatusText');
  if (statusText) {
    statusText.textContent = `JMdict status: ${jmdictStatusLabel()}`;
  }

  const errorText = document.getElementById('jmdictErrorText');
  if (errorText) {
    errorText.textContent = state.jmdictError ? `JMdict error: ${state.jmdictError}` : '';
  }

  const results = document.getElementById('searchResults');
  if (!results) return;

  results.innerHTML = `
    <div class="card">
      <h2>${query ? 'Kanji results' : 'Kanji grid'}</h2>
      ${kanjiMatches.length ? `<div class="kanji-grid">${kanjiMatches.map((entry) => `<button class="kanji-tile" data-open-kanji="${escapeHtml(entry.kanji)}">${escapeHtml(entry.kanji)}</button>`).join('')}</div>` : '<div class="empty-state">No matching kanji found.</div>'}
    </div>
    ${query ? `<div class="card"><h2>Curated vocabulary results</h2>${vocabMatches.length ? `<div class="list">${vocabMatches.map((entry, index) => vocabCardMarkup(entry, index, 'curated')).join('')}</div>` : '<div class="empty-state">No matching curated vocabulary found.</div>'}</div>` : ''}
    ${query ? `<div class="card"><h2>JMdict fallback results</h2>${renderFallbackSearchBody(fallbackMatches)}</div>` : ''}
  `;

  results.querySelectorAll('[data-open-kanji]').forEach((button) => {
    button.addEventListener('click', () => openKanjiDetail(button.dataset.openKanji));
  });

  results.querySelectorAll('[data-open-vocab]').forEach((button) => {
    button.addEventListener('click', () => openVocabDetail(button.dataset.openVocabSource, Number(button.dataset.openVocabIndex)));
  });

  results.querySelectorAll('[data-add-vocab]').forEach((button) => {
    button.addEventListener('click', () => addVocabToStudy(button.dataset.addVocabSource, Number(button.dataset.addVocabIndex)));
  });
}

function renderFallbackSearchBody(fallbackMatches) {
  if (state.jmdictStatus === 'not_loaded') {
    return '<div class="empty-state">JMdict fallback is available but not loaded yet. Click “Load JMdict fallback” to include the large dictionary list in website search.</div>';
  }

  if (state.jmdictStatus === 'loading') {
    return '<div class="empty-state">Loading and parsing JMdict fallback. This can take a bit because the file is large.</div>';
  }

  if (state.jmdictStatus === 'error') {
    return `<div class="empty-state">Could not load JMdict fallback. ${escapeHtml(state.jmdictError || '')}</div>`;
  }

  if (!fallbackMatches.length) {
    return '<div class="empty-state">No matching fallback vocabulary found.</div>';
  }

  return `<div class="list">${fallbackMatches.map((entry, index) => vocabCardMarkup(entry, index, 'fallback')).join('')}</div>`;
}

function jmdictButtonLabel() {
  if (state.jmdictStatus === 'loading') return 'Loading JMdict fallback…';
  if (state.jmdictStatus === 'loaded') return `JMdict loaded (${state.jmdictFallback.length.toLocaleString()} entries)`;
  return 'Load JMdict fallback';
}

function jmdictStatusLabel() {
  if (state.jmdictStatus === 'loading') return 'loading';
  if (state.jmdictStatus === 'loaded') return `loaded (${state.jmdictFallback.length.toLocaleString()} entries)`;
  if (state.jmdictStatus === 'error') return 'error';
  return 'not loaded';
}

function renderStudy() {
  const sorted = [...state.studyCards].sort((a, b) => a.nextReviewAt - b.nextReviewAt);

  elements.study.innerHTML = `
    <div class="card">
      <h2>Study list</h2>
      ${sorted.length ? `<div class="list">${sorted.map(studyRowMarkup).join('')}</div>` : '<div class="empty-state">Your study list is empty.</div>'}
    </div>
  `;

  wireStudyRowActions(elements.study);
}

function renderReview() {
  const dueCards = getDueCards();
  const card = getActiveReviewCard(dueCards);

  if (!card) {
    elements.review.innerHTML = `
      <div class="card review-card">
        <h2>No reviews due right now</h2>
        <p class="muted">Add more kanji or vocabulary, or come back later.</p>
        <p class="muted">Reviewed this session: ${state.sessionDoneCount}</p>
        <div class="inline-actions">
          <button class="button" data-jump="search">Search</button>
        </div>
      </div>
    `;
    elements.review.querySelector('[data-jump]')?.addEventListener('click', () => {
      state.tab = 'search';
      render();
    });
    return;
  }

  const expectedReading = normalizeReading(card.reading || '');
  const normalizedAnswer = normalizeReading(state.reviewAnswer);
  const isCorrect = expectedReading && normalizedAnswer === expectedReading;
  const previews = ['Again', 'Hard', 'Good', 'Easy'].map((rating) => ({
    rating,
    preview: scheduleReview(card, rating, Date.now())
  }));

  elements.review.innerHTML = `
    <div class="card review-card">
      <div class="review-meta">
        <span>Due: ${dueCards.length}</span>
        <span>Reviewed: ${state.sessionDoneCount}</span>
        <span>Interval: ${card.intervalDays} day(s)</span>
        <span>Ease: ${card.easeFactor.toFixed(2)}</span>
      </div>
      <p class="muted">Type the hiragana reading. Romaji auto-conversion is ${state.autoKana ? 'on' : 'off'}.</p>
      <div class="review-face">${escapeHtml(card.front)}</div>
      <input id="reviewAnswer" class="input" lang="ja" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ひらがな / romaji" value="${escapeHtml(state.reviewAnswer)}" />
      ${state.reviewChecked ? `
        <div class="${isCorrect ? 'feedback good' : 'feedback bad'}"><strong>${isCorrect ? 'Correct' : 'Not quite'}</strong></div>
        <div class="muted">Reading: ${escapeHtml(card.reading || '—')}</div>
        <div class="muted">Meaning: ${escapeHtml(card.meanings.join(', '))}</div>
        ${card.parts.length ? `<div class="muted">Parts: ${escapeHtml(card.parts.join(' '))}</div>` : ''}
        <div class="review-actions">
          ${previews.map(({ rating, preview }) => `<button class="${rating === (isCorrect ? 'Good' : 'Again') ? 'button' : 'ghost-button'}" data-rate="${rating}">${rating} (${formatReviewDelay(preview.nextReviewAt)})</button>`).join('')}
        </div>
      ` : '<button id="checkAnswer" class="button">Check</button>'}
    </div>
  `;

  const answerInput = document.getElementById('reviewAnswer');
  answerInput.addEventListener('compositionstart', () => {
    state.isReviewComposing = true;
  });

  answerInput.addEventListener('compositionend', (event) => {
    state.isReviewComposing = false;
    state.reviewAnswer = event.target.value;
  });

  answerInput.addEventListener('input', (event) => {
    let value = event.target.value;
    if (!state.isReviewComposing && state.autoKana) {
      value = convertRomajiToHiragana(value);
      event.target.value = value;
    }
    state.reviewAnswer = value;
    if (state.reviewChecked) state.reviewChecked = false;
  });

  answerInput.addEventListener('keydown', (event) => {
    if (state.isReviewComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      state.reviewChecked = true;
      renderReview();
    }
  });

  document.getElementById('checkAnswer')?.addEventListener('click', () => {
    state.reviewChecked = true;
    renderReview();
  });

  elements.review.querySelectorAll('[data-rate]').forEach((button) => {
    button.addEventListener('click', () => {
      const updated = scheduleReview(card, button.dataset.rate, Date.now());
      state.studyCards = state.studyCards.map((item) => item.id === card.id ? updated : item);
      persistStudyCards();
      state.selectedReviewCardId = null;
      state.reviewAnswer = '';
      state.reviewChecked = false;
      state.sessionDoneCount += 1;
      render();
    });
  });
}

function openKanjiDetail(kanjiChar) {
  const entry = state.kanji.find((item) => item.kanji === kanjiChar);
  if (!entry) return;

  const inStudy = state.studyCards.some((card) => card.id === `KANJI:${entry.kanji}`);
  elements.detailContent.innerHTML = `
    <div class="card">
      <h2 style="font-size: 3rem; margin-top: 0;">${escapeHtml(entry.kanji)}</h2>
      <p><strong>Meanings:</strong> ${escapeHtml((entry.meanings || []).join(', ') || '—')}</p>
      <p><strong>On'yomi:</strong> ${escapeHtml((entry.on_readings || []).join(', ') || '—')}</p>
      <p><strong>Kun'yomi:</strong> ${escapeHtml((entry.kun_readings || []).join(', ') || '—')}</p>
      <div class="pill-row">
        ${entry.jlpt ? `<span class="pill">JLPT N${entry.jlpt}</span>` : ''}
        ${entry.grade ? `<span class="pill">Grade ${entry.grade}</span>` : ''}
        ${entry.stroke_count ? `<span class="pill">Strokes ${entry.stroke_count}</span>` : ''}
      </div>
      <div class="inline-actions" style="margin-top: 1rem;">
        ${inStudy ? `<button class="ghost-button" data-remove-study="KANJI:${escapeHtml(entry.kanji)}">Remove from study</button>` : `<button class="button" data-detail-add-kanji="${escapeHtml(entry.kanji)}">Add to study</button>`}
      </div>
    </div>
  `;
  elements.detailModal.showModal();

  elements.detailContent.querySelector('[data-detail-add-kanji]')?.addEventListener('click', () => {
    addKanjiToStudy(entry.kanji);
    openKanjiDetail(entry.kanji);
  });

  elements.detailContent.querySelector('[data-remove-study]')?.addEventListener('click', (event) => {
    removeStudyCard(event.target.dataset.removeStudy);
    openKanjiDetail(entry.kanji);
  });
}

function openVocabDetail(source, index) {
  const entry = getVocabEntry(source, index);
  if (!entry) return;

  const id = vocabCardId(source, index, entry);
  const inStudy = state.studyCards.some((card) => card.id === id);
  elements.detailContent.innerHTML = `
    <div class="card">
      <h2 style="font-size: 2.5rem; margin-top: 0;">${escapeHtml(entry.word)}</h2>
      <p><strong>Reading:</strong> ${escapeHtml(entry.reading || '—')}</p>
      <p><strong>Meanings:</strong> ${escapeHtml((entry.meanings || []).join(', ') || '—')}</p>
      ${entry.parts?.length ? `<p><strong>Kanji used:</strong> ${escapeHtml(entry.parts.join(' '))}</p>` : ''}
      ${entry.japanese_definition_kanji?.length ? `<p><strong>Japanese definition:</strong> ${escapeHtml(entry.japanese_definition_kanji[0])}</p>` : ''}
      ${entry.example_sentence_kanji?.length ? `<p><strong>Example:</strong> ${escapeHtml(entry.example_sentence_kanji[0])}</p>` : ''}
      ${entry.dictionary_source ? `<p><strong>Source:</strong> ${escapeHtml(entry.dictionary_source)}</p>` : `<p><strong>Source:</strong> ${source === 'fallback' ? 'JMdict' : 'Tanuki'}</p>`}
      <div class="pill-row">
        ${(entry.jlpt_tags || []).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}
        ${entry.common === true ? '<span class="pill">Common</span>' : ''}
      </div>
      <div class="inline-actions" style="margin-top: 1rem;">
        ${inStudy ? `<button class="ghost-button" data-remove-study="${escapeHtml(id)}">Remove from study</button>` : `<button class="button" data-detail-add-vocab-source="${escapeHtml(source)}" data-detail-add-vocab-index="${index}">Add to study</button>`}
      </div>
    </div>
  `;
  elements.detailModal.showModal();

  elements.detailContent.querySelector('[data-detail-add-vocab-source]')?.addEventListener('click', (event) => {
    addVocabToStudy(event.target.dataset.detailAddVocabSource, Number(event.target.dataset.detailAddVocabIndex));
    openVocabDetail(source, index);
  });

  elements.detailContent.querySelector('[data-remove-study]')?.addEventListener('click', (event) => {
    removeStudyCard(event.target.dataset.removeStudy);
    openVocabDetail(source, index);
  });
}

function getVocabEntry(source, index) {
  return source === 'fallback' ? state.jmdictFallback[index] : state.vocab[index];
}

function vocabCardId(source, index, entry) {
  if (source === 'fallback') return `FALLBACK:${index}:${entry.word}:${entry.reading || ''}`;
  return `VOCAB:${entry.word}`;
}

function addKanjiToStudy(kanjiChar) {
  const entry = state.kanji.find((item) => item.kanji === kanjiChar);
  if (!entry || state.studyCards.some((card) => card.id === `KANJI:${kanjiChar}`)) return;

  state.studyCards.push({
    id: `KANJI:${entry.kanji}`,
    type: 'KANJI',
    front: entry.kanji,
    reading: bestReading(entry.on_readings || [], entry.kun_readings || []),
    meanings: entry.meanings || [],
    parts: [],
    jlpt: entry.jlpt ? `JLPT N${entry.jlpt}` : null,
    addedAt: Date.now(),
    lastReviewedAt: null,
    nextReviewAt: Date.now(),
    intervalDays: 0,
    easeFactor: 2.5,
    reviewCount: 0,
    lapseCount: 0
  });
  persistStudyCards();
  render();
}

function addVocabToStudy(source, index) {
  const entry = getVocabEntry(source, index);
  if (!entry) return;

  const id = vocabCardId(source, index, entry);
  if (state.studyCards.some((card) => card.id === id)) return;

  state.studyCards.push({
    id,
    type: 'VOCAB',
    front: entry.word || '',
    reading: entry.reading || '',
    meanings: entry.meanings || [],
    parts: entry.parts || [],
    jlpt: (entry.jlpt_tags || [])[0] || null,
    addedAt: Date.now(),
    lastReviewedAt: null,
    nextReviewAt: Date.now(),
    intervalDays: 0,
    easeFactor: 2.5,
    reviewCount: 0,
    lapseCount: 0
  });
  persistStudyCards();
  render();
}

function removeStudyCard(id) {
  state.studyCards = state.studyCards.filter((card) => card.id !== id);
  persistStudyCards();
  render();
}

function getDueCards() {
  const now = Date.now();
  return state.studyCards.filter((card) => card.nextReviewAt <= now);
}

function getActiveReviewCard(dueCards) {
  if (!dueCards.length) return null;
  const current = dueCards.find((card) => card.id === state.selectedReviewCardId);
  if (current) return current;
  state.selectedReviewCardId = dueCards[0].id;
  return dueCards[0];
}

function matchesKanji(entry, query) {
  const q = normalizeSearchText(query);
  return [
    entry.kanji,
    ...(entry.meanings || []),
    ...(entry.on_readings || []),
    ...(entry.kun_readings || [])
  ].some((value) => normalizeSearchText(String(value)).includes(q));
}

function matchesVocab(entry, query) {
  const q = normalizeSearchText(query);
  return [
    entry.word,
    entry.reading,
    ...(entry.meanings || []),
    ...(entry.parts || []),
    ...(entry.source_kanji || [])
  ].some((value) => normalizeSearchText(String(value)).includes(q));
}

function matchesFallbackVocab(entry, query) {
  const q = normalizeSearchText(query);
  const queryHiragana = katakanaToHiragana(q);
  return [
    entry.word,
    entry.reading,
    ...(entry.meanings || []),
    ...(entry.parts || []),
    ...(entry.source_kanji || []),
    ...(entry.japanese_definition_kanji || []),
    ...(entry.japanese_definition_kana || [])
  ].some((value) => {
    const normalized = normalizeSearchText(String(value));
    return normalized.includes(q) || katakanaToHiragana(normalized).includes(queryHiragana);
  });
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeReading(value) {
  return katakanaToHiragana(String(value || '').trim().replace(/\s+/g, '').replace(/[ー・]/g, ''));
}

function convertRomajiToHiragana(value) {
  const map = {
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
    gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
    sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
    jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
    cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ',
    nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
    bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
    pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
    mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
    dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
    tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
    shi: 'し', chi: 'ち', tsu: 'つ', fu: 'ふ', ji: 'じ',
    aa: 'ああ', ii: 'いい', uu: 'うう', ee: 'ええ', oo: 'おお',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    sa: 'さ', si: 'し', su: 'す', se: 'せ', so: 'そ',
    za: 'ざ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    ta: 'た', ti: 'ち', tu: 'つ', te: 'て', to: 'と',
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    ha: 'は', hi: 'ひ', hu: 'ふ', he: 'へ', ho: 'ほ',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    wa: 'わ', wo: 'を',
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    n: 'ん'
  };

  const source = String(value || '');
  const lower = source.toLowerCase();
  let result = '';
  let i = 0;

  while (i < lower.length) {
    const char = lower[i];

    if (!/[a-z'-]/.test(char)) {
      result += source[i];
      i += 1;
      continue;
    }

    const next = lower[i + 1] || '';

    if (char === 'n' && next === "'") {
      result += 'ん';
      i += 2;
      continue;
    }

    if (char === next && /[bcdfghjklmpqrstvwxyz]/.test(char) && char !== 'n') {
      result += 'っ';
      i += 1;
      continue;
    }

    if (char === 'n' && next && !/[aeiouy]/.test(next)) {
      result += 'ん';
      i += 1;
      continue;
    }

    const chunk3 = lower.slice(i, i + 3);
    const chunk2 = lower.slice(i, i + 2);
    const chunk1 = lower.slice(i, i + 1);

    if (map[chunk3]) {
      result += map[chunk3];
      i += 3;
      continue;
    }

    if (map[chunk2]) {
      result += map[chunk2];
      i += 2;
      continue;
    }

    if (map[chunk1]) {
      result += map[chunk1];
      i += 1;
      continue;
    }

    result += source[i];
    i += 1;
  }

  return result;
}

function katakanaToHiragana(value) {
  return String(value).replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function bestReading(onReadings, kunReadings) {
  return normalizeReading((onReadings.find(Boolean) || kunReadings.find(Boolean) || '').replace(/（.*?）/g, ''));
}

function scheduleReview(card, rating, now) {
  const currentInterval = Math.max(card.intervalDays, 0);

  if (rating === 'Again') {
    return {
      ...card,
      lastReviewedAt: now,
      nextReviewAt: now,
      intervalDays: 0,
      easeFactor: Math.max(1.3, card.easeFactor - 0.2),
      lapseCount: card.lapseCount + 1,
      reviewCount: card.reviewCount + 1
    };
  }

  if (rating === 'Hard') {
    const nextInterval = Math.max(1, currentInterval === 0 ? 1 : Math.floor(currentInterval * 1.2));
    return {
      ...card,
      lastReviewedAt: now,
      nextReviewAt: now + nextInterval * DAY_MS,
      intervalDays: nextInterval,
      easeFactor: Math.max(1.3, card.easeFactor - 0.05),
      reviewCount: card.reviewCount + 1
    };
  }

  if (rating === 'Good') {
    const nextInterval = currentInterval === 0 ? 1 : currentInterval === 1 ? 3 : Math.max(1, Math.floor(currentInterval * card.easeFactor));
    return {
      ...card,
      lastReviewedAt: now,
      nextReviewAt: now + nextInterval * DAY_MS,
      intervalDays: nextInterval,
      reviewCount: card.reviewCount + 1
    };
  }

  const nextInterval = currentInterval === 0 ? 3 : currentInterval === 1 ? 5 : Math.max(1, Math.floor(currentInterval * (card.easeFactor + 0.3)));
  return {
    ...card,
    lastReviewedAt: now,
    nextReviewAt: now + nextInterval * DAY_MS,
    intervalDays: nextInterval,
    easeFactor: card.easeFactor + 0.05,
    reviewCount: card.reviewCount + 1
  };
}

function loadStudyCards() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.cards) || '[]');
  } catch {
    return [];
  }
}

function persistStudyCards() {
  localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(state.studyCards));
}

function statCard(label, value, description) {
  return `
    <div class="card">
      <div class="muted">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(String(value))}</div>
      <div class="muted">${escapeHtml(description)}</div>
    </div>
  `;
}

function studyRowMarkup(card) {
  return `
    <div class="study-row">
      <div class="result-top">
        <div>
          <div class="muted">${card.type === 'KANJI' ? 'Kanji' : 'Vocabulary'}</div>
          <h3>${escapeHtml(card.front)}</h3>
          ${card.reading ? `<div>${escapeHtml(card.reading)}</div>` : ''}
        </div>
        <div class="inline-actions">
          <button class="chip-button" data-open-study="${escapeHtml(card.id)}">Open</button>
          <button class="chip-button" data-remove-study="${escapeHtml(card.id)}">Remove</button>
        </div>
      </div>
      <div>${escapeHtml(card.meanings.join(', '))}</div>
      <div class="study-meta">
        <span>Due ${escapeHtml(formatRelativeTime(card.nextReviewAt))}</span>
        <span>Reviews ${escapeHtml(String(card.reviewCount))}</span>
        <span>Lapses ${escapeHtml(String(card.lapseCount))}</span>
      </div>
    </div>
  `;
}

function vocabCardMarkup(entry, index, source) {
  const id = vocabCardId(source, index, entry);
  const inStudy = state.studyCards.some((card) => card.id === id);
  return `
    <div class="result-card">
      <div class="result-top">
        <div>
          <div class="muted">${source === 'fallback' ? 'JMdict fallback' : 'Vocabulary'}</div>
          <h3>${escapeHtml(entry.word)}</h3>
          ${entry.reading ? `<div>${escapeHtml(entry.reading)}</div>` : ''}
        </div>
        <div class="inline-actions">
          <button class="chip-button" data-open-vocab-source="${escapeHtml(source)}" data-open-vocab-index="${index}" data-open-vocab="1">Details</button>
          <button class="${inStudy ? 'ghost-button' : 'button'}" data-add-vocab-source="${escapeHtml(source)}" data-add-vocab-index="${index}" data-add-vocab="1" ${inStudy ? 'disabled' : ''}>${inStudy ? 'In study list' : 'Add to study'}</button>
        </div>
      </div>
      <div>${escapeHtml((entry.meanings || []).join(', '))}</div>
      <div class="pill-row">
        ${(entry.parts || []).slice(0, 6).map((part) => `<span class="pill">${escapeHtml(part)}</span>`).join('')}
        ${(entry.jlpt_tags || []).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}
        ${entry.common === true ? '<span class="pill">Common</span>' : ''}
      </div>
    </div>
  `;
}

function wireStudyRowActions(root) {
  root.querySelectorAll('[data-remove-study]').forEach((button) => {
    button.addEventListener('click', () => removeStudyCard(button.dataset.removeStudy));
  });

  root.querySelectorAll('[data-open-study]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = state.studyCards.find((item) => item.id === button.dataset.openStudy);
      if (!card) return;
      if (card.type === 'KANJI') {
        openKanjiDetail(card.front);
        return;
      }

      if (card.id.startsWith('FALLBACK:')) {
        const parts = card.id.split(':');
        openVocabDetail('fallback', Number(parts[1]));
        return;
      }

      const index = state.vocab.findIndex((entry) => `VOCAB:${entry.word}` === card.id);
      if (index >= 0) openVocabDetail('curated', index);
    });
  });
}

function formatRelativeTime(timestamp) {
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'now';
  const days = Math.ceil(diff / DAY_MS);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

function formatReviewDelay(timestamp) {
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'now';
  const days = Math.round(diff / DAY_MS);
  return days <= 1 ? '1d' : `${days}d`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cardMarkup(title, body) {
  return `<div class="card"><h2>${escapeHtml(title)}</h2>${body}</div>`;
}
