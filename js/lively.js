(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  /* ── Lively Wallpaper 연동 ── */
  LS.Lively = {
    isLively: false,

    init() {
      // Lively 환경 감지
      this.isLively = typeof livelyPropertyListener !== 'undefined' ||
        window.location.protocol === 'file:' ||
        navigator.userAgent.includes('Lively');
    }
  };

  /* ── Lively 속성 변경 리스너 (전역 함수) ── */
  window.livelyPropertyListener = function (name, val) {
    console.log(`[Lively] 속성 변경: ${name} = ${val}`);

    const config = LS.Config;
    if (!config) return;

    switch (name) {
      case 'schoolName':
        config.set('schoolName', val);
        break;
      case 'neisApiKey':
        config.set('neisApiKey', val);
        break;
      case 'weatherApiKey':
        config.set('weatherApiKey', val);
        break;
      case 'theme':
        config.set('theme', parseInt(val));
        config.applyTheme();
        break;
      case 'widgetOpacity':
        config.set('widgetOpacity', parseInt(val));
        config.applyTheme();
        break;
      case 'fontSize':
        config.set('fontSize', parseInt(val));
        config.applyTheme();
        break;
      case 'clockFormat':
        config.set('clockFormat', parseInt(val));
        break;
      case 'showAnalogClock':
        config.set('showAnalogClock', val === true || val === 'true');
        break;
      case 'showSeconds':
        config.set('showSeconds', val === true || val === 'true');
        break;
      case 'grade':
        config.set('grade', parseInt(val));
        break;
      case 'classNum':
        config.set('classNum', val);
        break;
      case 'startTime':
        config.set('startTime', val);
        break;
      case 'morningMinutes':
        config.set('morningMinutes', parseInt(val));
        break;
      case 'classMinutes':
        config.set('classMinutes', parseInt(val));
        break;
      case 'breakMinutes':
        config.set('breakMinutes', parseInt(val));
        break;
      case 'lunchMinutes':
        config.set('lunchMinutes', parseInt(val));
        break;
      case 'lunchAfterPeriod':
        config.set('lunchAfterPeriod', parseInt(val));
        break;
      case 'totalPeriods':
        config.set('totalPeriods', parseInt(val));
        break;
      case 'afterSchoolEnabled':
        config.set('afterSchoolEnabled', val === true || val === 'true');
        break;
      case 'afterSchoolMinutes':
        config.set('afterSchoolMinutes', parseInt(val));
        break;
      case 'afterSchoolDays':
        config.set('afterSchoolDays', val);
        break;
    }

    // 위젯 갱신 이벤트
    window.dispatchEvent(new CustomEvent('livelysam:configChanged', {
      detail: { key: name, value: val }
    }));
  };
})();
