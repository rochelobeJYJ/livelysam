(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  /* Lively Wallpaper 연동 */
  LS.Lively = {
    isLively: false,

    init() {
      // Lively WebView에서는 userAgent에 lively 문자열이 포함됩니다.
      this.isLively = /lively/i.test(navigator.userAgent);
      document.body.classList.toggle('lively-mode', this.isLively);
      document.body.classList.toggle('browser-mode', !this.isLively);
    }
  };

  /* Lively 속성 변경 리스너 */
  window.livelyPropertyListener = function (name, val) {
    LS.Lively.isLively = true;
    document.body.classList.add('lively-mode');
    document.body.classList.remove('browser-mode');
    window.dispatchEvent(new CustomEvent('livelysam:runtimeChanged', {
      detail: { isLively: true }
    }));
    console.log(`[Lively] 속성 변경: ${name} = ${val}`);

    const config = LS.Config;
    if (!config) return;

    switch (name) {
      case 'schoolName':
        config.set('schoolName', val);
        break;
      case 'weatherProviderMode':
        config.set('weatherProviderMode', String(val) === '1' || String(val).toLowerCase() === 'custom' ? 'custom' : 'proxy');
        break;
      case 'neisApiKey':
        config.set('neisApiKey', val);
        break;
      case 'weatherApiKey':
        config.set('weatherApiKey', val);
        break;
      case 'theme':
        config.set('theme', parseInt(val, 10));
        config.applyTheme();
        break;
      case 'widgetOpacity':
        config.set('widgetOpacity', parseInt(val, 10));
        config.applyTheme();
        break;
      case 'fontSize':
        config.set('fontSize', parseInt(val, 10));
        config.applyTheme();
        break;
      case 'clockFormat':
        config.set('clockFormat', parseInt(val, 10));
        break;
      case 'showAnalogClock':
        config.set('showAnalogClock', val === true || val === 'true');
        break;
      case 'showSeconds':
        config.set('showSeconds', val === true || val === 'true');
        break;
      case 'grade':
        config.set('grade', parseInt(val, 10));
        break;
      case 'classNum':
        config.set('classNum', val);
        break;
      case 'startTime':
        config.set('startTime', val);
        break;
      case 'morningMinutes':
        config.set('morningMinutes', parseInt(val, 10));
        break;
      case 'classMinutes':
        config.set('classMinutes', parseInt(val, 10));
        break;
      case 'breakMinutes':
        config.set('breakMinutes', parseInt(val, 10));
        break;
      case 'lunchMinutes':
        config.set('lunchMinutes', parseInt(val, 10));
        break;
      case 'lunchAfterPeriod':
        config.set('lunchAfterPeriod', parseInt(val, 10));
        break;
      case 'totalPeriods':
        config.set('totalPeriods', parseInt(val, 10));
        break;
      case 'afterSchoolEnabled':
        config.set('afterSchoolEnabled', val === true || val === 'true');
        break;
      case 'afterSchoolMinutes':
        config.set('afterSchoolMinutes', parseInt(val, 10));
        break;
      case 'afterSchoolDays':
        config.set('afterSchoolDays', val);
        break;
      default:
        break;
    }

    window.dispatchEvent(new CustomEvent('livelysam:configChanged', {
      detail: { key: name, value: val }
    }));
  };
})();
