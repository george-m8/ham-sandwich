(function () {
  const QUESTION_FILES = {
    'licensing-and-regulations': '/data/questions/licensing-and-regulations.json',
    'technical-basics': '/data/questions/technical-basics.json',
    'transmitters-receivers': '/data/questions/transmitters-receivers.json',
    propagation: '/data/questions/propagation.json',
    'antennas-feeders': '/data/questions/antennas-feeders.json',
    safety: '/data/questions/safety.json',
    'operating-practices': '/data/questions/operating-practices.json',
    'electromagnetic-compatibility': '/data/questions/electromagnetic-compatibility.json'
  };

  const CATEGORY_LABELS = {
    'licensing-and-regulations': 'Licensing and Regulations',
    'technical-basics': 'Technical Basics',
    'transmitters-receivers': 'Transmitters and Receivers',
    propagation: 'Propagation',
    'antennas-feeders': 'Antennas and Feeders',
    safety: 'Safety',
    'operating-practices': 'Operating Practices',
    'electromagnetic-compatibility': 'Electromagnetic Compatibility'
  };

  const STORAGE_KEYS = {
    lastWrongIds: 'ham_test_last_wrong_ids',
    lastSession: 'ham_test_last_session'
  };

  const PASS_MARK = 19;
  const MOCK_TOTAL = 26;
  const MOCK_SECONDS = 30 * 60;

  const root = document.querySelector('[data-test-app]');
  if (!root) {
    return;
  }

  const escapeHtml = (value) => (window.HamUtils && typeof window.HamUtils.escapeHtml === 'function'
    ? window.HamUtils.escapeHtml(value)
    : String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'));

  function getCurrentUserName() {
    if (!window.currentUser) {
      return null;
    }
    return window.currentUser.name || window.currentUser.email || 'Operator';
  }

  function getCategoryLabel(categoryId) {
    return CATEGORY_LABELS[categoryId] || categoryId;
  }

  function sanitizeId(value, fallback) {
    const normalized = String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '-');
    return normalized || fallback;
  }

  function toSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function inferCategoryId(fileCategoryId, sourceCategoryValue) {
    const knownBySource = toSlug(sourceCategoryValue);
    if (knownBySource && Object.prototype.hasOwnProperty.call(QUESTION_FILES, knownBySource)) {
      return knownBySource;
    }
    return fileCategoryId;
  }

  function buildOptionObjects(sourceOptions) {
    if (!Array.isArray(sourceOptions)) {
      return [];
    }

    if (sourceOptions.length > 0 && typeof sourceOptions[0] === 'object' && sourceOptions[0] !== null) {
      return sourceOptions.map((option, index) => ({
        key: String(option.key || String.fromCharCode(65 + index)).toUpperCase(),
        text: String(option.text || ''),
        reason_if_wrong: option.reason_if_wrong ? String(option.reason_if_wrong) : ''
      }));
    }

    return sourceOptions.map((text, index) => ({
      key: String.fromCharCode(65 + index),
      text: String(text || ''),
      reason_if_wrong: ''
    }));
  }

  function normalizeQuestion(rawQuestion, index, categoryId) {
    const options = buildOptionObjects(rawQuestion.options || rawQuestion.answers || []);
    if (options.length < 2) {
      return null;
    }

    const rawCorrect = String(rawQuestion.correct || 'A').toUpperCase();
    const fallbackCorrectKey = options[0].key;
    const correctKey = options.some((item) => item.key === rawCorrect) ? rawCorrect : fallbackCorrectKey;

    const question = {
      id: sanitizeId(rawQuestion.id, `${categoryId.slice(0, 2).toUpperCase()}-${String(index + 1).padStart(3, '0')}`),
      category: inferCategoryId(categoryId, rawQuestion.category),
      subcategory: String(rawQuestion.subcategory || ''),
      question: String(rawQuestion.question || ''),
      options,
      correct: correctKey,
      reason: String(rawQuestion.reason || rawQuestion.explanation || '')
    };

    if (!question.question || question.options.length < 2) {
      return null;
    }

    return question;
  }

  function normalizeQuestionFile(fileCategoryId, payload) {
    const sourceQuestions = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.questions)
        ? payload.questions
        : [];

    return sourceQuestions
      .map((item, index) => normalizeQuestion(item, index, fileCategoryId))
      .filter(Boolean);
  }

  function shuffle(array) {
    const next = [...array];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
    }
    return next;
  }

  function remapShuffledOptions(question, sessionId) {
    const shuffledOptions = shuffle(question.options);
    const keyedOptions = shuffledOptions.map((option, index) => ({
      key: String.fromCharCode(65 + index),
      text: option.text,
      reason_if_wrong: option.reason_if_wrong || '',
      originalKey: option.key
    }));

    const correctOption = keyedOptions.find((option) => option.originalKey === question.correct) || keyedOptions[0];

    return {
      ...question,
      sessionId,
      options: keyedOptions,
      correct: correctOption.key
    };
  }

  const TestEngine = {
    allQuestions: [],
    currentTest: [],
    mode: 'practice',
    currentIndex: 0,
    answers: {},
    timerId: null,
    remainingSeconds: 0,
    startedAtMs: 0,

    elements: {
      setup: document.getElementById('test-setup'),
      setupStatus: document.getElementById('test-setup-status'),
      runtime: document.getElementById('test-runtime'),
      results: document.getElementById('test-results'),
      status: document.getElementById('test-status'),
      progressMeta: document.getElementById('test-progress-meta'),
      progressBar: document.getElementById('test-progress'),
      timerWrap: document.getElementById('test-timer-wrap'),
      timer: document.getElementById('test-timer'),
      questionBox: document.getElementById('test-question-box'),
      feedbackBox: document.getElementById('test-feedback-box'),
      nextButton: document.getElementById('test-next-btn'),
      submitButton: document.getElementById('test-submit-btn'),
      resultsBox: document.getElementById('test-results-box'),
      startForm: document.getElementById('test-start-form'),
      countSelect: document.getElementById('test-num-questions'),
      categorySelect: document.getElementById('test-category'),
      sessionRetestButton: document.getElementById('test-session-retest-btn'),
      historyRetestButton: document.getElementById('test-history-retest-btn')
    },

    isMockMode() {
      return this.mode === 'mock';
    },

    isImmediateFeedbackMode() {
      return this.mode === 'practice' || this.mode === 'retest';
    },

    isAnswered(question) {
      return Object.prototype.hasOwnProperty.call(this.answers, question.sessionId);
    },

    clearStatus() {
      if (this.elements.status) {
        this.elements.status.textContent = '';
      }
    },

    setStatus(message) {
      if (this.elements.status) {
        this.elements.status.textContent = message;
      }
    },

    setSetupStatus(message, allowHtml = false) {
      if (this.elements.setupStatus) {
        if (allowHtml) {
          this.elements.setupStatus.innerHTML = message;
          return;
        }
        this.elements.setupStatus.textContent = message;
      }
    },

    getLoginSaveLink() {
      if (getCurrentUserName()) {
        return '';
      }

      return '<a class="btn-secondary" href="/account/">Log In to Save Results & Wrong Answers</a>';
    },

    showRetestEmptyState(message) {
      this.setView('setup');
      this.setSetupStatus(`
        ${escapeHtml(message)}
        <br>
        <span class="test-inline-actions">
          <a class="btn-box btn-sm" href="/test/practice/">New Test</a>
          ${this.getLoginSaveLink()}
        </span>
      `, true);
    },

    setView(viewName) {
      if (this.elements.setup) {
        this.elements.setup.hidden = viewName !== 'setup';
      }
      if (this.elements.runtime) {
        this.elements.runtime.hidden = viewName !== 'runtime';
      }
      if (this.elements.results) {
        this.elements.results.hidden = viewName !== 'results';
      }
    },

    async loadQuestions(categoryFilter = 'all') {
      const requestedCategories = categoryFilter && categoryFilter !== 'all'
        ? [categoryFilter]
        : Object.keys(QUESTION_FILES);

      const loaded = [];

      await Promise.all(requestedCategories.map(async (categoryId) => {
        const path = QUESTION_FILES[categoryId];
        if (!path) {
          return;
        }

        try {
          const payload = await window.HamUtils.fetchJson(path);
          const normalized = normalizeQuestionFile(categoryId, payload);
          loaded.push(...normalized);
        } catch (_error) {
          return;
        }
      }));

      this.allQuestions = loaded;
      return loaded;
    },

    buildQuestionSet(requestedCount) {
      const shuffledPool = shuffle(this.allQuestions);
      if (shuffledPool.length === 0) {
        return [];
      }

      if (requestedCount === 'all') {
        return shuffledPool.map((question, index) => remapShuffledOptions(question, `${question.id}--${index + 1}`));
      }

      const numericCount = Number(requestedCount);
      const targetCount = Number.isFinite(numericCount) && numericCount > 0
        ? Math.floor(numericCount)
        : shuffledPool.length;

      const selected = [];
      for (let index = 0; index < targetCount; index += 1) {
        const sourceQuestion = shuffledPool[index % shuffledPool.length];
        selected.push(remapShuffledOptions(sourceQuestion, `${sourceQuestion.id}--${index + 1}`));
      }

      return selected;
    },

    resetSessionState() {
      this.currentTest = [];
      this.answers = {};
      this.currentIndex = 0;
      this.startedAtMs = Date.now();
      this.stopTimer();
      if (this.elements.feedbackBox) {
        this.elements.feedbackBox.hidden = true;
        this.elements.feedbackBox.innerHTML = '';
      }
      if (this.elements.nextButton) {
        this.elements.nextButton.hidden = this.isImmediateFeedbackMode();
        this.elements.nextButton.textContent = this.currentIndex >= this.currentTest.length - 1
          ? 'Finish Test'
          : 'Next Question →';
      }
      if (this.elements.submitButton) {
        this.elements.submitButton.hidden = !this.isMockMode();
      }
    },

    startTest(questionCount, categoryFilter = 'all') {
      this.mode = root.dataset.testMode || 'practice';
      this.resetSessionState();

      this.setStatus('Loading questions…');

      this.loadQuestions(categoryFilter)
        .then(() => {
          const countToUse = this.isMockMode() ? MOCK_TOTAL : questionCount;
          this.currentTest = this.buildQuestionSet(countToUse);

          if (this.currentTest.length === 0) {
            this.setStatus('No questions available yet for this selection.');
            this.setView('setup');
            return;
          }

          if (this.isMockMode()) {
            this.startTimer(MOCK_SECONDS);
          }

          this.clearStatus();
          this.setView('runtime');
          this.renderQuestion();
        })
        .catch(() => {
          this.setStatus('Unable to load questions right now.');
        });
    },

    selectAnswer(selectedKey) {
      const question = this.currentTest[this.currentIndex];
      if (!question) {
        return;
      }

      if (this.isImmediateFeedbackMode() && this.isAnswered(question)) {
        return;
      }

      this.answers[question.sessionId] = {
        questionId: question.id,
        category: question.category,
        selected: selectedKey,
        correct: question.correct,
        isCorrect: selectedKey === question.correct,
        question
      };

      if (this.isImmediateFeedbackMode()) {
        this.renderFeedback(question);
        if (this.elements.nextButton) {
          this.elements.nextButton.hidden = false;
        }
      } else {
        this.renderQuestion();
      }
    },

    renderProgress() {
      const position = this.currentIndex + 1;
      const total = this.currentTest.length;
      const percent = total > 0 ? Math.round((position / total) * 100) : 0;

      if (this.elements.progressMeta) {
        this.elements.progressMeta.textContent = `Question ${position} of ${total}`;
      }
      if (this.elements.progressBar) {
        this.elements.progressBar.max = 100;
        this.elements.progressBar.value = percent;
      }
    },

    renderQuestion() {
      const question = this.currentTest[this.currentIndex];
      if (!question) {
        this.finishTest();
        return;
      }

      this.renderProgress();

      const selected = this.answers[question.sessionId]?.selected || null;
      const disableOptions = this.isImmediateFeedbackMode() && Boolean(selected);

      const optionButtons = question.options
        .map((option) => {
          const isSelected = selected === option.key;
          const classes = ['btn-box', 'btn-sm', 'test-option-btn'];
          if (isSelected) {
            classes.push('is-selected');
          }
          return `
            <button
              type="button"
              class="${classes.join(' ')}"
              data-option-key="${escapeHtml(option.key)}"
              ${disableOptions ? 'disabled' : ''}
            >
              ${escapeHtml(option.key)}) ${escapeHtml(option.text)}
            </button>
          `;
        })
        .join('');

      if (this.elements.questionBox) {
        this.elements.questionBox.innerHTML = `
          <p class="small-text muted">Category: ${escapeHtml(getCategoryLabel(question.category))}</p>
          <h3>${escapeHtml(question.question)}</h3>
          <div class="vertical-flex test-options-wrap">
            ${optionButtons}
          </div>
        `;

        this.elements.questionBox.querySelectorAll('[data-option-key]').forEach((button) => {
          button.addEventListener('click', () => {
            const selectedKey = button.getAttribute('data-option-key');
            if (!selectedKey) {
              return;
            }
            this.selectAnswer(selectedKey);
          });
        });
      }

      if (this.elements.feedbackBox && !this.isImmediateFeedbackMode()) {
        this.elements.feedbackBox.hidden = true;
      }

      if (this.elements.feedbackBox && this.isImmediateFeedbackMode() && !selected) {
        this.elements.feedbackBox.hidden = true;
        this.elements.feedbackBox.innerHTML = '';
      }

      if (this.elements.nextButton) {
        this.elements.nextButton.hidden = this.isImmediateFeedbackMode();
        this.elements.nextButton.textContent = this.currentIndex >= this.currentTest.length - 1
          ? 'Finish Test'
          : 'Next Question →';
      }
      if (this.elements.submitButton) {
        this.elements.submitButton.hidden = !this.isMockMode();
      }

      this.clearStatus();
    },

    renderFeedback(question) {
      if (!this.elements.feedbackBox) {
        return;
      }

      const answer = this.answers[question.sessionId];
      if (!answer) {
        return;
      }

      const selectedOption = question.options.find((item) => item.key === answer.selected);
      const correctOption = question.options.find((item) => item.key === question.correct);

      const selectedText = selectedOption ? `${selectedOption.key}) ${selectedOption.text}` : answer.selected;
      const correctText = correctOption ? `${correctOption.key}) ${correctOption.text}` : question.correct;
      const wrongReason = !answer.isCorrect && selectedOption?.reason_if_wrong
        ? `<p>${escapeHtml(selectedOption.reason_if_wrong)}</p>`
        : '';

      this.elements.feedbackBox.className = `output-box ${answer.isCorrect ? 'test-feedback-correct' : 'test-feedback-incorrect'}`;
      this.elements.feedbackBox.innerHTML = answer.isCorrect
        ? `
          <p><strong>✅ Correct!</strong></p>
          <p>${escapeHtml(correctText)}</p>
          <p>${escapeHtml(question.reason || '')}</p>
        `
        : `
          <p><strong>❌ Incorrect</strong></p>
          <p>You selected: ${escapeHtml(selectedText)}</p>
          ${wrongReason}
          <hr>
          <p><strong>✅ Correct answer:</strong> ${escapeHtml(correctText)}</p>
          <p>${escapeHtml(question.reason || '')}</p>
        `;
      this.elements.feedbackBox.hidden = false;

      this.renderQuestion();
    },

    nextQuestion() {
      if (this.currentIndex < this.currentTest.length - 1) {
        this.currentIndex += 1;
        this.renderQuestion();
        return;
      }
      this.finishTest();
    },

    calculateResults() {
      const records = Object.values(this.answers);
      const total = this.currentTest.length;
      const correctCount = records.filter((item) => item.isCorrect).length;
      const wrongRecords = records.filter((item) => !item.isCorrect);
      const unansweredQuestionIds = this.currentTest
        .filter((question) => !this.answers[question.sessionId])
        .map((question) => question.id);
      const wrongQuestionIds = Array.from(new Set([
        ...wrongRecords.map((item) => item.questionId),
        ...unansweredQuestionIds
      ]));
      const answered = records.length;
      const unanswered = Math.max(0, total - answered);

      const categories = {};
      this.currentTest.forEach((question) => {
        if (!categories[question.category]) {
          categories[question.category] = { total: 0, correct: 0 };
        }
        categories[question.category].total += 1;
      });
      records.forEach((record) => {
        if (!categories[record.category]) {
          categories[record.category] = { total: 0, correct: 0 };
        }
        if (record.isCorrect) {
          categories[record.category].correct += 1;
        }
      });

      const scorePercentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - this.startedAtMs) / 1000));

      return {
        mode: this.mode,
        totalQuestions: total,
        answered,
        unanswered,
        correctCount,
        incorrectCount: total - correctCount,
        scorePercentage,
        categories,
        wrongQuestionIds,
        pass: this.isMockMode() ? correctCount >= PASS_MARK : null,
        passMark: PASS_MARK,
        elapsedSeconds,
        allowedSeconds: this.isMockMode() ? MOCK_SECONDS : null,
        answers: records,
        startedAt: new Date(this.startedAtMs).toISOString(),
        completedAt: new Date().toISOString()
      };
    },

    renderCategoryBreakdown(categories) {
      const categoryEntries = Object.entries(categories);
      if (categoryEntries.length === 0) {
        return '<p class="small-text">No category data available.</p>';
      }

      const lines = categoryEntries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([categoryId, stats]) => {
          const isPerfect = stats.total > 0 && stats.correct === stats.total;
          const practiceLink = `/test/practice/?category=${encodeURIComponent(categoryId)}`;
          return `<li><a href="${practiceLink}">${escapeHtml(getCategoryLabel(categoryId))}</a>: ${stats.correct}/${stats.total} ${isPerfect ? '✅' : ''}</li>`;
        })
        .join('');

      return `<ul>${lines}</ul>`;
    },

    renderMockAnswerReview(results) {
      if (!this.isMockMode()) {
        return '';
      }

      const items = this.currentTest.map((question) => {
        const answer = this.answers[question.sessionId];
        const selectedKey = answer?.selected || '—';
        const selectedOption = question.options.find((item) => item.key === selectedKey);
        const correctOption = question.options.find((item) => item.key === question.correct);
        const correctText = correctOption ? `${correctOption.key}) ${correctOption.text}` : question.correct;
        const selectedText = selectedOption ? `${selectedOption.key}) ${selectedOption.text}` : 'Unanswered';
        const isCorrect = Boolean(answer && answer.isCorrect);

        return `
          <article class="card test-review-card">
            <p><strong>${isCorrect ? '✅ Correct' : '❌ Incorrect'}</strong></p>
            <p><strong>Q:</strong> ${escapeHtml(question.question)}</p>
            <p><strong>You selected:</strong> ${escapeHtml(selectedText)}</p>
            <p><strong>Correct answer:</strong> ${escapeHtml(correctText)}</p>
            <p class="small-text">${escapeHtml(question.reason || '')}</p>
          </article>
        `;
      }).join('');

      return `
        <h3>Answer Review</h3>
        <div class="vertical-flex test-review-list">
          ${items}
        </div>
      `;
    },

    renderResults(results) {
      if (!this.elements.resultsBox) {
        return;
      }

      const weakestCategory = Object.entries(results.categories)
        .filter(([, stats]) => stats.total > 0)
        .map(([categoryId, stats]) => ({
          categoryId,
          score: stats.correct / stats.total
        }))
        .sort((a, b) => a.score - b.score)[0] || null;

      const hasWrongAnswers = results.wrongQuestionIds.length > 0;
      const showRevisingHint = Boolean(weakestCategory && weakestCategory.score < 1);
      const weakestCategoryLink = weakestCategory
        ? `/test/practice/?category=${encodeURIComponent(weakestCategory.categoryId)}`
        : '';

      const mockSummary = this.isMockMode()
        ? `
          <p class="test-pass-state ${results.pass ? 'pass' : 'fail'}"><strong>${results.pass ? '✅ PASS' : '❌ FAIL'}</strong></p>
          <p>You needed ${results.passMark} — you got ${results.correctCount}.</p>
          <p>Time used: ${formatDuration(results.elapsedSeconds)} / ${formatDuration(results.allowedSeconds || 0)}</p>
        `
        : '';

      this.elements.resultsBox.innerHTML = `
        <h3>Test Complete</h3>
        <p><strong>Score:</strong> ${results.correctCount} / ${results.totalQuestions} (${results.scorePercentage}%)</p>
        <p>✅ Correct: ${results.correctCount} | ❌ Incorrect: ${results.incorrectCount}</p>
        ${mockSummary}
        <h4>Breakdown by Category</h4>
        ${this.renderCategoryBreakdown(results.categories)}
        ${showRevisingHint ? `<p>💡 Consider revising: <a href="${weakestCategoryLink}">${escapeHtml(getCategoryLabel(weakestCategory.categoryId))}</a></p>` : ''}
        <div class="horizontal-flex gap-sm test-result-actions">
          ${hasWrongAnswers ? '<a class="btn-secondary" href="/test/retest/">Retest Wrong Answers</a>' : ''}
          <a class="btn-box btn-sm" href="${this.mode === 'mock' ? '/test/mock/' : this.mode === 'retest' ? '/test/retest/' : '/test/practice/'}">New Test</a>
          <a class="btn-secondary" href="/test/">Back to Menu</a>
          ${this.getLoginSaveLink()}
        </div>
        ${this.renderMockAnswerReview(results)}
      `;
    },

    saveSession(results) {
      try {
        window.sessionStorage.setItem(STORAGE_KEYS.lastWrongIds, JSON.stringify(results.wrongQuestionIds));
        window.sessionStorage.setItem(STORAGE_KEYS.lastSession, JSON.stringify({
          mode: this.mode,
          completedAt: results.completedAt,
          wrongQuestionIds: results.wrongQuestionIds,
          scorePercentage: results.scorePercentage
        }));
      } catch (_error) {
        return;
      }
    },

    async saveToFirebase(results) {
      try {
        if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') {
          return;
        }

        const state = await window.HamFirebase.init();
        const authUser = state?.auth?.currentUser;
        if (!state.available || !state.db || !authUser?.uid) {
          return;
        }

        const userRef = state.db.collection('users').doc(authUser.uid);

        await userRef.collection('test_results').add({
          test_type: this.mode,
          date: results.completedAt,
          total_questions: results.totalQuestions,
          correct_count: results.correctCount,
          score_percentage: results.scorePercentage,
          categories: results.categories,
          wrong_answers: results.wrongQuestionIds,
          time_taken_seconds: results.elapsedSeconds,
          pass: this.isMockMode() ? results.pass : null
        });

        const statsPromises = [];
        results.answers.forEach((answer) => {
          const statRef = userRef.collection('question_stats').doc(answer.questionId);
          statsPromises.push(
            statRef.get().then((doc) => {
              const data = doc.exists ? doc.data() : {};
              const timesWrong = Number(data.times_wrong || 0) + (answer.isCorrect ? 0 : 1);
              const timesCorrect = Number(data.times_correct || 0) + (answer.isCorrect ? 1 : 0);
              const weight = Math.max(0.1, 1 + (timesWrong * 0.5) - (timesCorrect * 0.2));

              return statRef.set({
                question_id: answer.questionId,
                times_wrong: timesWrong,
                times_correct: timesCorrect,
                last_wrong: answer.isCorrect ? (data.last_wrong || null) : results.completedAt,
                last_correct: answer.isCorrect ? results.completedAt : (data.last_correct || null),
                weight
              }, { merge: true });
            })
          );
        });

        await Promise.all(statsPromises);
      } catch (_error) {
        return;
      }
    },

    async finishTest() {
      this.stopTimer();
      const results = this.calculateResults();
      this.saveSession(results);
      await this.saveToFirebase(results);
      this.renderResults(results);
      this.setView('results');
    },

    startTimer(seconds) {
      this.remainingSeconds = seconds;
      this.updateTimerDisplay();
      this.stopTimer();

      this.timerId = window.setInterval(() => {
        this.remainingSeconds -= 1;
        if (this.remainingSeconds <= 0) {
          this.remainingSeconds = 0;
          this.updateTimerDisplay();
          this.onTimerExpired();
          return;
        }
        this.updateTimerDisplay();
      }, 1000);
    },

    stopTimer() {
      if (this.timerId) {
        window.clearInterval(this.timerId);
      }
      this.timerId = null;
    },

    updateTimerDisplay() {
      if (!this.elements.timerWrap || !this.elements.timer) {
        return;
      }

      const visible = this.isMockMode();
      this.elements.timerWrap.hidden = !visible;
      if (!visible) {
        return;
      }

      const isCritical = this.remainingSeconds <= 60;
      const isWarning = this.remainingSeconds <= 5 * 60;

      this.elements.timerWrap.classList.toggle('is-warning', isWarning && !isCritical);
      this.elements.timerWrap.classList.toggle('is-critical', isCritical);
      this.elements.timer.textContent = formatDuration(this.remainingSeconds);
    },

    onTimerExpired() {
      this.stopTimer();
      this.finishTest();
    },

    getSessionWrongIds() {
      try {
        const raw = window.sessionStorage.getItem(STORAGE_KEYS.lastWrongIds) || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_error) {
        return [];
      }
    },

    async getHistoricalWrongIds() {
      if (!window.HamFirebase || typeof window.HamFirebase.init !== 'function') {
        return [];
      }

      const state = await window.HamFirebase.init();
      const authUser = state?.auth?.currentUser;
      if (!state.available || !state.db || !authUser?.uid) {
        return [];
      }

      const snapshot = await state.db
        .collection('users')
        .doc(authUser.uid)
        .collection('question_stats')
        .limit(500)
        .get();

      return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((item) => Number(item.times_wrong || 0) > Number(item.times_correct || 0))
        .map((item) => String(item.question_id || item.id));
    },

    async startRetestFromIds(ids) {
      this.mode = 'retest';
      this.resetSessionState();

      this.setStatus('Loading retest questions…');
      await this.loadQuestions('all');

      const idSet = new Set(ids.map((item) => String(item)));
      const filtered = this.allQuestions.filter((question) => idSet.has(question.id));
      const source = filtered.length > 0 ? filtered : [];

      if (source.length === 0) {
        this.clearStatus();
        this.showRetestEmptyState('No more wrong-answer questions are available right now.');
        return;
      }

      this.currentTest = shuffle(source).map((question, index) => remapShuffledOptions(question, `${question.id}--retest-${index + 1}`));
      this.setView('runtime');
      this.clearStatus();
      this.renderQuestion();
    },

    updateRetestAuthButton() {
      const button = this.elements.historyRetestButton;
      if (!button) {
        return;
      }

      if (getCurrentUserName()) {
        button.classList.remove('auth-required');
        button.title = '';
        return;
      }

      button.classList.add('auth-required');
      button.title = 'Login required';
    },

    bindCommonEvents() {
      if (this.elements.nextButton) {
        this.elements.nextButton.addEventListener('click', () => this.nextQuestion());
      }

      if (this.elements.submitButton) {
        this.elements.submitButton.addEventListener('click', () => this.finishTest());
      }

      if (this.elements.startForm) {
        this.elements.startForm.addEventListener('submit', (event) => {
          event.preventDefault();
          const count = this.elements.countSelect ? this.elements.countSelect.value : '10';
          const category = this.elements.categorySelect ? this.elements.categorySelect.value : 'all';
          this.startTest(count, category);
        });
      }
    },

    bindRetestEvents() {
      if (this.elements.sessionRetestButton) {
        this.elements.sessionRetestButton.addEventListener('click', () => {
          const ids = this.getSessionWrongIds();
          if (ids.length === 0) {
            this.showRetestEmptyState('No wrong answers found in this browser session yet.');
            return;
          }
          this.setSetupStatus('Starting session retest…');
          this.startRetestFromIds(ids);
        });
      }

      if (this.elements.historyRetestButton) {
        this.elements.historyRetestButton.addEventListener('click', async () => {
          if (!getCurrentUserName()) {
            return;
          }

          this.setSetupStatus('Loading historical wrong answers…');
          try {
            const ids = await this.getHistoricalWrongIds();
            if (ids.length === 0) {
              this.showRetestEmptyState('No historical wrong answers found yet.');
              return;
            }

            this.setSetupStatus(`Loaded ${ids.length} historical wrong-answer question(s).`);
            this.startRetestFromIds(ids);
          } catch (_error) {
            this.setSetupStatus('Unable to load historical wrong answers right now.');
          }
        });
      }

      this.updateRetestAuthButton();
      window.setInterval(() => this.updateRetestAuthButton(), 2000);
    },

    init() {
      this.mode = root.dataset.testMode || 'practice';
      this.setView('setup');
      this.bindCommonEvents();

      if (this.mode === 'practice' && this.elements.categorySelect) {
        const params = new URLSearchParams(window.location.search);
        const category = params.get('category');
        if (category && this.elements.categorySelect.querySelector(`option[value="${category}"]`)) {
          this.elements.categorySelect.value = category;
        }
      }

      if (this.mode === 'retest') {
        this.bindRetestEvents();
      }

      if (this.mode === 'mock' && this.elements.countSelect) {
        this.elements.countSelect.value = String(MOCK_TOTAL);
      }

      if (this.mode === 'mock' && this.elements.categorySelect) {
        this.elements.categorySelect.value = 'all';
        this.elements.categorySelect.disabled = true;
      }
    }
  };

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  TestEngine.init();
})();
