(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.ClockWidget = {
    _interval: null,
    _analogCtx: null,

    init() {
      this._startClock();
    },

    _startClock() {
      this._tick();
      this._interval = setInterval(() => this._tick(), 1000);
    },

    _tick() {
      const now = new Date();
      const config = LS.Config;
      const is24h = config.get('clockFormat') === 1;
      const showSec = config.get('showSeconds');

      // 디지털 시계
      const digitalEl = document.getElementById('clock-digital');
      if (digitalEl) {
        digitalEl.textContent = LS.Helpers.formatTime(now, is24h, showSec);
      }

      // 날짜
      const dateEl = document.getElementById('clock-date');
      if (dateEl) {
        dateEl.textContent = LS.Helpers.formatDate(now, 'YYYY년 M월 D일');
      }
      this._updateMoonPhase(now);

      // 요일
      const dayEl = document.getElementById('clock-day');
      if (dayEl) {
        dayEl.textContent = LS.Helpers.DAY_NAMES_FULL[now.getDay()];
      }

      // 학기
      const semesterEl = document.getElementById('clock-semester');
      if (semesterEl) {
        semesterEl.textContent = LS.Helpers.getSemester(now);
      }

      // 공휴일 체크
      const holidayEl = document.getElementById('clock-holiday');
      if (holidayEl) {
        const dateStr = LS.Helpers.formatDate(now, 'YYYY-MM-DD');
        const holiday = LS.Holidays.isHoliday(dateStr);
        if (holiday) {
          holidayEl.textContent = `🎉 ${holiday.name}`;
          holidayEl.style.display = 'block';
        } else {
          holidayEl.style.display = 'none';
        }
      }

      // 현재 교시
      this._updatePeriodInfo(now);

      // 아날로그 시계
      const analogWrap = document.querySelector('.clock-analog-wrap');
      if (config.get('showAnalogClock')) {
        if (analogWrap) analogWrap.style.display = 'block';
        this._drawAnalogClock(now);
      } else {
        if (analogWrap) analogWrap.style.display = 'none';
      }
    },

    _updatePeriodInfo(now) {
      const periods = LS.Config.getPeriods();
      const info = LS.Helpers.getCurrentPeriod(periods, now);
      const periodEl = document.getElementById('clock-period');
      const remainEl = document.getElementById('clock-remaining');
      const nextEl = document.getElementById('clock-next');
      const progressEl = document.getElementById('clock-progress-bar');

      if (!periodEl) return;

      if (info.status === 'weekend') {
        const weekendInfo = info.nextSchoolStart;
        periodEl.textContent = '주말';
        periodEl.className = 'period-badge period-before';
        if (remainEl) {
          remainEl.textContent = weekendInfo
            ? `${weekendInfo.dayName} 일과 시작까지 ${LS.Helpers.formatRemainingMinutes(weekendInfo.remainingMinutes)} 남음`
            : '다음 일과 정보를 확인할 수 없습니다.';
        }
        if (progressEl) progressEl.style.width = '0%';
        if (nextEl) {
          if (weekendInfo) {
            nextEl.textContent = `다음 일과: ${weekendInfo.dayName} ${weekendInfo.label} (${weekendInfo.start})`;
            nextEl.style.display = 'block';
          } else {
            nextEl.style.display = 'none';
          }
        }
      } else if (info.current) {
        periodEl.textContent = info.current.label;
        periodEl.className = 'period-badge period-' + info.current.type;

        if (remainEl) {
          const mins = info.remaining;
          remainEl.textContent = `${mins}분 남음`;
        }

        // 진행률 바
        if (progressEl) {
          const total = info.current.endMin - info.current.startMin;
          const elapsed = total - info.remaining;
          const pct = Math.min(100, (elapsed / total) * 100);
          progressEl.style.width = pct + '%';
        }

        // 다음 교시
        const next = LS.Helpers.getNextPeriod(periods, info.index);
        if (nextEl && next) {
          nextEl.textContent = `다음: ${next.label} (${next.start})`;
          nextEl.style.display = 'block';
        } else if (nextEl) {
          nextEl.style.display = 'none';
        }
      } else if (info.status === 'before') {
        periodEl.textContent = '일과 시작 전';
        periodEl.className = 'period-badge period-before';
        if (remainEl) remainEl.textContent = `${info.next?.start || ''} 시작`;
        if (progressEl) progressEl.style.width = '0%';
        if (nextEl) { nextEl.textContent = `첫 일정: ${info.next?.label || ''}`; nextEl.style.display = 'block'; }
      } else {
        periodEl.textContent = '일과 종료';
        periodEl.className = 'period-badge period-after';
        if (remainEl) remainEl.textContent = '수고하셨습니다!';
        if (progressEl) progressEl.style.width = '100%';
        if (nextEl) nextEl.style.display = 'none';
      }
    },

    _drawAnalogClock(now) {
      const canvas = document.getElementById('clock-analog');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const size = canvas.width;
      const center = size / 2;
      const radius = center - 8;

      ctx.clearRect(0, 0, size, size);

      // 배경
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'var(--theme-primary)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 눈금
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 - 90) * Math.PI / 180;
        const isMain = i % 3 === 0;
        const innerR = radius - (isMain ? 12 : 7);
        ctx.beginPath();
        ctx.moveTo(center + innerR * Math.cos(angle), center + innerR * Math.sin(angle));
        ctx.lineTo(center + (radius - 3) * Math.cos(angle), center + (radius - 3) * Math.sin(angle));
        ctx.strokeStyle = isMain ? 'var(--theme-accent)' : 'rgba(100,100,100,0.5)';
        ctx.lineWidth = isMain ? 2.5 : 1;
        ctx.stroke();
      }

      const h = now.getHours() % 12;
      const m = now.getMinutes();
      const s = now.getSeconds();

      // 시침
      this._drawHand(ctx, center, (h + m / 60) * 30 - 90, radius * 0.5, 3.5, 'var(--theme-accent)');
      // 분침
      this._drawHand(ctx, center, (m + s / 60) * 6 - 90, radius * 0.7, 2.5, 'var(--theme-primary)');
      // 초침
      if (LS.Config.get('showSeconds')) {
        this._drawHand(ctx, center, s * 6 - 90, radius * 0.8, 1, '#FF6B6B');
      }

      // 중심점
      ctx.beginPath();
      ctx.arc(center, center, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'var(--theme-accent)';
      ctx.fill();
    },

    _drawHand(ctx, center, angleDeg, length, width, color) {
      const angle = angleDeg * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(center + length * Math.cos(angle), center + length * Math.sin(angle));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    },

    _updateMoonPhase(now) {
      const moonWrap = document.getElementById('clock-moon');
      const moonCanvas = document.getElementById('clock-moon-canvas');
      if (!moonWrap || !moonCanvas || !LS.Helpers?.getMoonPhaseInfo) return;

      const info = LS.Helpers.getMoonPhaseInfo(now);

      const tooltip = `${info.label} · 월령 ${info.age.toFixed(1)}일 · 밝기 ${Math.round(info.illumination * 100)}% · ${info.stageNumber}/${info.totalStages} 단계`;
      moonWrap.title = tooltip;
      moonWrap.setAttribute('aria-label', tooltip);

      this._drawMoonPhase(moonCanvas, info);
    },

    _drawMoonPhase(canvas, info) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = canvas.width;
      const center = size / 2;
      const radius = size * 0.35;
      const image = ctx.createImageData(size, size);
      const data = image.data;
      const waxing = info.isWaxing;
      const rawTerminator = Math.cos(info.renderFraction * Math.PI * 2);
      const terminator = Math.sign(rawTerminator) * Math.pow(Math.abs(rawTerminator), 2);
      const lightTone = { r: 255, g: 224, b: 118 };
      const shadowTone = { r: 136, g: 140, b: 160 };
      const smoothstep = (edge0, edge1, value) => {
        const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      };

      ctx.clearRect(0, 0, size, size);

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const dx = (x + 0.5 - center) / radius;
          const dy = (y + 0.5 - center) / radius;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq > 1) continue;

          const rim = Math.sqrt(Math.max(0, 1 - distanceSq));
          const limbX = Math.sqrt(Math.max(0, 1 - dy * dy));
          const threshold = waxing ? terminator * limbX : -terminator * limbX;
          const terminatorDelta = waxing ? dx - threshold : threshold - dx;
          const lightMix = smoothstep(-0.03, 0.03, terminatorDelta);
          const outerFade = 1 - smoothstep(0.94, 1, Math.sqrt(distanceSq));
          const litBrightness = 0.92 + rim * 0.08;
          const shadowBrightness = 0.54 + rim * 0.08;
          const r = Math.round(((shadowTone.r * shadowBrightness) * (1 - lightMix)) + ((lightTone.r * litBrightness) * lightMix));
          const g = Math.round(((shadowTone.g * shadowBrightness) * (1 - lightMix)) + ((lightTone.g * litBrightness) * lightMix));
          const b = Math.round(((shadowTone.b * shadowBrightness) * (1 - lightMix)) + ((lightTone.b * litBrightness) * lightMix));
          const alpha = Math.round(255 * outerFade);
          const index = (y * size + x) * 4;

          data[index] = r;
          data[index + 1] = g;
          data[index + 2] = b;
          data[index + 3] = alpha;
        }
      }

      ctx.putImageData(image, 0, 0);

      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.clip();

      const glowOffsetX = center + (waxing ? radius * 0.34 : -radius * 0.34);
      const glow = ctx.createRadialGradient(glowOffsetX, center - radius * 0.08, radius * 0.05, glowOffsetX, center, radius * 0.9);
      glow.addColorStop(0, 'rgba(255, 228, 138, 0.34)');
      glow.addColorStop(0.28, 'rgba(255, 210, 90, 0.14)');
      glow.addColorStop(1, 'rgba(255, 210, 90, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(center - radius * 1.3, center - radius * 1.3, radius * 2.6, radius * 2.6);

      ctx.restore();

      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(124, 102, 38, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    },

    destroy() {
      if (this._interval) clearInterval(this._interval);
    }
  };
})();
