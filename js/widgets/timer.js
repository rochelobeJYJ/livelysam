(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.TimerWidget = {
    _mode: 'timer', // timer, pomodoro
    _running: false,
    _interval: null,
    _seconds: 0,
    _totalSeconds: 0,
    _pomodoroState: 'work', // work, break
    _pomodoroCount: 0,

    POMODORO_WORK: 25 * 60,
    POMODORO_BREAK: 5 * 60,
    POMODORO_LONG_BREAK: 15 * 60,

    init() {
      this.render();
      this._bindEvents();
    },

    _bindEvents() {
      document.getElementById('timer-start')?.addEventListener('click', () => this.toggle());
      document.getElementById('timer-reset')?.addEventListener('click', () => this.reset());
      document.getElementById('timer-mode-btn')?.addEventListener('click', () => this.switchMode());
      document.getElementById('timer-set')?.addEventListener('click', () => this.openTimerSetup());
    },

    toggle() {
      if (this._running) {
        this.pause();
      } else {
        this.start();
      }
    },

    start() {
      if (this._mode === 'timer' && this._seconds <= 0) {
        this.openTimerSetup();
        return;
      }
      this._running = true;
      this._updateButton();
      this._interval = setInterval(() => this._tick(), 1000);
    },

    pause() {
      this._running = false;
      this._updateButton();
      if (this._interval) { clearInterval(this._interval); this._interval = null; }
    },

    reset() {
      this.pause();
      if (this._mode === 'pomodoro') {
        this._pomodoroState = 'work';
        this._seconds = this.POMODORO_WORK;
        this._totalSeconds = this.POMODORO_WORK;
        this._pomodoroCount = 0;
      } else {
        this._seconds = 0;
        this._totalSeconds = 0;
      }
      this._updateDisplay();
    },

    async openTimerSetup() {
      const result = await LS.Helpers.promptModal('타이머 설정', [
        { id: 'minutes', type: 'number', label: '분 단위 시간', value: '50', min: 1, max: 999, step: 1 }
      ], {
        confirmText: '설정'
      });

      const minutes = parseInt(result?.minutes, 10);
      if (!minutes || Number.isNaN(minutes) || minutes <= 0) return;

      this._seconds = minutes * 60;
      this._totalSeconds = minutes * 60;
      this._updateDisplay();
      LS.Helpers.showToast('타이머 시간을 설정했습니다.', 'success');
    },

    setTimer() {
      return this.openTimerSetup();
    },

    switchMode() {
      this.pause();
      this._mode = this._mode === 'timer' ? 'pomodoro' : 'timer';
      const modeBtn = document.getElementById('timer-mode-btn');
      if (modeBtn) modeBtn.textContent = this._mode === 'timer' ? '⏱️ 타이머' : '🍅 포모도로';

      if (this._mode === 'pomodoro') {
        this._pomodoroState = 'work';
        this._seconds = this.POMODORO_WORK;
        this._totalSeconds = this.POMODORO_WORK;
        this._pomodoroCount = 0;
      } else {
        this._seconds = 0;
        this._totalSeconds = 0;
      }
      this._updateDisplay();
    },

    _tick() {
      if (this._seconds > 0) {
        this._seconds--;
        this._updateDisplay();

        if (this._seconds <= 0) {
          this._onTimerEnd();
        }
      }
    },

    _onTimerEnd() {
      this.pause();

      if (this._mode === 'pomodoro') {
        if (this._pomodoroState === 'work') {
          this._pomodoroCount++;
          if (this._pomodoroCount % 4 === 0) {
            this._pomodoroState = 'break';
            this._seconds = this.POMODORO_LONG_BREAK;
            this._totalSeconds = this.POMODORO_LONG_BREAK;
          } else {
            this._pomodoroState = 'break';
            this._seconds = this.POMODORO_BREAK;
            this._totalSeconds = this.POMODORO_BREAK;
          }
        } else {
          this._pomodoroState = 'work';
          this._seconds = this.POMODORO_WORK;
          this._totalSeconds = this.POMODORO_WORK;
        }
        this._updateDisplay();
      }

      // 화면 깜빡임 효과
      const widget = document.getElementById('widget-timer');
      if (widget) {
        widget.classList.add('timer-flash');
        setTimeout(() => widget.classList.remove('timer-flash'), 3000);
      }
    },

    _updateDisplay() {
      const display = document.getElementById('timer-display');
      if (!display) return;

      const mins = Math.floor(this._seconds / 60);
      const secs = this._seconds % 60;
      display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      // 진행률
      const progress = document.getElementById('timer-progress');
      if (progress && this._totalSeconds > 0) {
        const pct = ((this._totalSeconds - this._seconds) / this._totalSeconds) * 100;
        progress.style.width = pct + '%';
      }

      // 포모도로 상태
      const stateEl = document.getElementById('timer-state');
      if (stateEl && this._mode === 'pomodoro') {
        stateEl.textContent = this._pomodoroState === 'work'
          ? `🍅 집중 (${this._pomodoroCount + 1}번째)`
          : `☕ 휴식`;
        stateEl.style.display = 'block';
      } else if (stateEl) {
        stateEl.style.display = 'none';
      }
    },

    _updateButton() {
      const btn = document.getElementById('timer-start');
      if (btn) btn.textContent = this._running ? '⏸️ 일시정지' : '▶️ 시작';
    },

    render() {
      this._updateDisplay();
      this._updateButton();
    },

    destroy() {
      if (this._interval) clearInterval(this._interval);
    }
  };
})();
