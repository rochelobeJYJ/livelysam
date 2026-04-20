(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const WEATHER_REQUEST_TIMEOUT_MS = 10000;

  function withTimeout(promise, timeoutMs, label = '요청') {
    const ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) {
      return Promise.resolve(promise);
    }

    let timeoutId = 0;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          const error = new Error(`${label} 시간이 초과되었습니다. (${ms}ms)`);
          error.name = 'TimeoutError';
          reject(error);
        }, ms);
      })
    ]).finally(() => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    });
  }

  LS.WeatherWidget = {
    _updateInterval: null,
    _lastData: null,
    _activeTab: 'current',
    _wheelBridgeHandler: null,
    _wheelBridgeTarget: null,

    async init() {
      await this.update();
      this._updateInterval = setInterval(() => this.update(), 15 * 60 * 1000);
    },

    _setConnectionState(state = {}) {
      LS.App?.setWeatherConnectionState?.(state);
    },

    async update() {
      const preset = this._getActivePreset();
      const weatherMode = typeof LS.Config.getWeatherProviderMode === 'function'
        ? LS.Config.getWeatherProviderMode()
        : 'proxy';
      const apiKey = typeof LS.Config.getWeatherApiKeyForUse === 'function'
        ? LS.Config.getWeatherApiKeyForUse()
        : LS.Config.get('weatherApiKey');
      const providerLabel = weatherMode === 'custom' ? '개인 OpenWeather API 키' : '기본 날씨 서버';
      let resolvedPreset = preset;
      let stage = 'resolve';

      LS.WeatherAPI.setMode(weatherMode);
      LS.WeatherAPI.setApiKey(apiKey);

      try {
        if (weatherMode === 'custom' && !apiKey) {
          this._setConnectionState({
            status: 'idle',
            stage: 'idle',
            presetKey: preset?.key || '',
            message: '내 API 키 사용을 선택했습니다. OpenWeather API 키를 입력해 주세요.'
          });
          this._renderEmpty('설정에서 OpenWeather API 키를 입력해 주세요.');
          return;
        }

        this._setConnectionState({
          status: 'loading',
          stage: 'resolve',
          presetKey: preset?.key || '',
          message: `${preset?.label || '선택한 위치'} 주소와 좌표를 ${providerLabel} 기준으로 확인하는 중입니다.`
        });
        resolvedPreset = await withTimeout(
          this._ensurePresetLocation(preset, apiKey),
          WEATHER_REQUEST_TIMEOUT_MS,
          '좌표 해석 요청'
        );
        if (!resolvedPreset?.hasCoordinates) {
          this._setConnectionState({
            status: 'error',
            stage: 'resolve',
            presetKey: resolvedPreset?.key || preset?.key || '',
            message: this._getPresetEmptyMessage(resolvedPreset || preset)
          });
          this._renderEmpty(this._getPresetEmptyMessage(resolvedPreset || preset));
          return;
        }

        stage = 'fetch';
        this._setConnectionState({
          status: 'loading',
          stage: 'fetch',
          presetKey: resolvedPreset.key || '',
          locationName: resolvedPreset.resolvedName || resolvedPreset.label || '',
          message: `${resolvedPreset.resolvedName || resolvedPreset.label || '선택한 위치'} 좌표 확인 완료. ${providerLabel} 기준 실제 날씨와 미세먼지를 불러오는 중입니다.`
        });
        LS.WeatherAPI.setLocation(resolvedPreset.lat, resolvedPreset.lon);
        const data = await withTimeout(
          LS.WeatherAPI.fetchAll(),
          WEATHER_REQUEST_TIMEOUT_MS,
          '날씨 정보 요청'
        );
        this._lastData = {
          ...data,
          preset: resolvedPreset
        };
        this._setConnectionState({
          status: 'ready',
          stage: 'done',
          presetKey: resolvedPreset.key || '',
          locationName: resolvedPreset.resolvedName || data?.weather?.cityName || '',
          checkedAt: Date.now(),
          message: `${resolvedPreset.resolvedName || data?.weather?.cityName || resolvedPreset.label || '선택한 위치'} 연결 확인 완료. ${providerLabel} 기준 실제 날씨와 미세먼지 호출까지 마쳤습니다.`
        });
        this.render(this._lastData);
      } catch (error) {
        console.error('[Weather] Update failed:', error);
        const isResolveStage = stage === 'resolve';
        const displayPreset = resolvedPreset || preset || {};
        const displayLabel = displayPreset.resolvedName || displayPreset.label || '선택한 위치';
        const isTimeout = error?.name === 'TimeoutError';
        const failureMessage = isTimeout
          ? (isResolveStage
            ? '위치 좌표 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
            : '날씨 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')
          : (isResolveStage
            ? '날씨 위치 정보를 확인하지 못했습니다.'
            : '날씨 정보를 불러오지 못했습니다.');
        this._setConnectionState({
          status: 'error',
          stage,
          presetKey: displayPreset.key || preset?.key || '',
          locationName: displayPreset.resolvedName || displayPreset.label || '',
          message: isTimeout
            ? (isResolveStage
              ? `${displayLabel} 기준 ${providerLabel} 좌표 확인 시간이 초과되었습니다.`
              : `${displayLabel} 기준 ${providerLabel} 응답 시간이 초과되었습니다.`)
            : (isResolveStage
              ? `${displayLabel} 기준 ${providerLabel} 위치 확인에 실패했습니다.`
              : `${displayLabel} 기준 ${providerLabel} 호출에 실패했습니다.`)
        });
        this._renderEmpty(failureMessage);
      }
    },

    render(data) {
      const container = document.getElementById('weather-content');
      if (!container || !data) return;

      const options = this._getDisplayOptions();
      const hourlyLimit = 6;
      const hourlyWeather = options.showHourlyWeather && Array.isArray(data.forecast)
        ? data.forecast.filter(Boolean).slice(0, hourlyLimit)
        : [];
      const hourlyAirRaw = options.showHourlyAir && Array.isArray(data.airQualityForecast)
        ? data.airQualityForecast.filter(Boolean)
        : [];
      const hourlyAir = hourlyWeather.length
        ? this._alignHourlyAirForecast(hourlyWeather, hourlyAirRaw)
        : hourlyAirRaw.slice(0, hourlyLimit);
      const dailyWeather = options.showDailyWeather && Array.isArray(data.dailyForecast) ? data.dailyForecast.filter(Boolean) : [];
      const dailyAir = options.showDailyAir && Array.isArray(data.dailyAirQualityForecast) ? data.dailyAirQualityForecast.filter(Boolean) : [];

      const showCurrentWeather = options.showCurrent && data.weather;
      const showCurrentAir = options.showAirCurrent && data.airQuality;
      const sections = [this._renderPresetSelector(data.preset)];
      const currentSections = [];

      if (showCurrentWeather) {
        currentSections.push(this._renderCurrentWeather(data.weather, data, options));
      }
      if (options.showAlerts) {
        const alerts = this._buildAlerts(data);
        if (alerts.length > 0) {
          currentSections.push(this._renderAlerts(alerts));
        }
      }
      if (showCurrentAir && !showCurrentWeather) {
        currentSections.push(this._renderCurrentAirQuality(data.airQuality));
      }

      if (currentSections.length > 0) {
        sections.push(...currentSections);
      }

      const hourlySection = this._renderHourlySection(hourlyWeather, hourlyAir, options);
      if (hourlySection) {
        sections.push(hourlySection);
      }

      const dailySection = this._renderDailySection(dailyWeather, dailyAir, options);
      if (dailySection) {
        sections.push(dailySection);
      }

      const weeklySkySection = options.showTonightSky && (LS.Config.get('calendarAstronomyLevel') || 'basic') !== 'off'
        ? this._renderWeeklySkySection(this._getWeeklyHighlights(data))
        : '';
      if (weeklySkySection) {
        sections.push(weeklySkySection);
      }

      if (sections.length <= 1) {
        sections.push(this._renderInfoCard('표시할 날씨 정보가 없습니다.'));
      }

      container.innerHTML = sections.join('');
      this._compactDailyAirLabels(container);
      this._bindInteractions(container);
      this._publishValidationDiagnostic(container);
    },

    _getDisplayOptions() {
      return {
        showCurrent: LS.Config.get('weatherShowCurrent'),
        showDetails: LS.Config.get('weatherShowDetails'),
        showTonightSky: LS.Config.get('weatherShowTonightSky'),
        showHourlyWeather: LS.Config.get('weatherShowHourlyForecast'),
        showDailyWeather: LS.Config.get('weatherShowDailyForecast'),
        showAirCurrent: LS.Config.get('weatherShowAirCurrent'),
        showHourlyAir: LS.Config.get('weatherShowAirHourlyForecast'),
        showDailyAir: LS.Config.get('weatherShowAirDailyForecast'),
        showAlerts: LS.Config.get('weatherShowAlerts'),
        showUpdatedAt: LS.Config.get('weatherShowUpdatedAt')
      };
    },

    _getActivePreset() {
      if (typeof LS.Config.getWeatherPresetConfig === 'function') {
        return LS.Config.getWeatherPresetConfig();
      }

      const lat = LS.Config.get('weatherLat');
      const lon = LS.Config.get('weatherLon');
      return {
        key: 'school',
        label: LS.Config.get('schoolName') || '학교',
        address: LS.Config.get('schoolAddress') || '',
        lat,
        lon,
        hasCoordinates: lat !== null && lon !== null
      };
    },

    async _ensurePresetLocation(preset, apiKey) {
      if (preset?.hasCoordinates) return preset;
      if (!preset?.address) return preset;

      LS.WeatherAPI.setMode(typeof LS.Config.getWeatherProviderMode === 'function' ? LS.Config.getWeatherProviderMode() : 'proxy');
      LS.WeatherAPI.setApiKey(apiKey);
      let location = await LS.WeatherAPI.geocode(preset.address);
      if (!location) {
        const city = String(preset.address || '').split(' ')[0];
        if (city) {
          location = await LS.WeatherAPI.geocode(city);
        }
      }

      if (!location) return preset;

      const isHome = preset?.key === 'home';
      const nextConfig = isHome
        ? {
            weatherHomeLat: location.lat,
            weatherHomeLon: location.lon
          }
        : {
            weatherLat: location.lat,
            weatherLon: location.lon,
            weatherSchoolLat: location.lat,
            weatherSchoolLon: location.lon
          };
      LS.Config.setMultiple(nextConfig);

      return {
        ...preset,
        lat: location.lat,
        lon: location.lon,
        hasCoordinates: true,
        resolvedName: location.name || ''
      };
    },

    _getPresetEmptyMessage(preset) {
      const weatherMode = typeof LS.Config.getWeatherProviderMode === 'function'
        ? LS.Config.getWeatherProviderMode()
        : 'proxy';
      if (weatherMode === 'custom') {
        return preset?.key === 'home'
          ? '집 주소와 개인 OpenWeather API 키를 설정하면 집 기준 날씨와 미세먼지를 표시합니다.'
          : '학교 설정과 개인 OpenWeather API 키를 준비하면 학교 기준 날씨와 미세먼지를 바로 표시합니다.';
      }
      if (preset?.key === 'home') {
        return '설정에서 집 주소를 입력하면 기본 날씨 서버 기준 집 날씨와 미세먼지를 표시합니다.';
      }
      return '학교 설정을 완료하면 기본 날씨 서버 기준 날씨와 미세먼지 정보를 함께 표시합니다.';
    },

    _renderPresetSelector(activePreset) {
      const weatherPreset = typeof LS.Config.getWeatherPresetConfig === 'function'
        ? LS.Config.getWeatherPresetConfig()
        : { key: 'school', label: '학교', address: '' };
      const schoolLabel = weatherPreset?.label || activePreset?.label || '학교';
      const schoolAddress = String(weatherPreset?.address || activePreset?.address || '').trim();

      return `
        <section class="weather-section weather-preset-section">
          <div class="weather-preset-caption">
            <span class="weather-preset-name">${LS.Helpers.escapeHtml(schoolLabel)}</span>
            ${schoolAddress ? `<span class="weather-preset-address">(${LS.Helpers.escapeHtml(schoolAddress)})</span>` : ''}
          </div>
        </section>
      `;

      const schoolPreset = typeof LS.Config.getWeatherPresetConfig === 'function'
        ? LS.Config.getWeatherPresetConfig('school')
        : { key: 'school', label: '학교' };
      const homePreset = typeof LS.Config.getWeatherPresetConfig === 'function'
        ? LS.Config.getWeatherPresetConfig('home')
        : { key: 'home', label: '집' };
      const activeKey = activePreset?.key || LS.Config.get('weatherActivePreset') || 'school';

      return `
        <section class="weather-section weather-preset-section">
          <div class="weather-preset-switch" role="tablist" aria-label="날씨 위치 프리셋">
            <button type="button" class="weather-preset-btn ${activeKey === 'school' ? 'active' : ''}" data-weather-preset="school">
              학교
            </button>
            <button type="button" class="weather-preset-btn ${activeKey === 'home' ? 'active' : ''}" data-weather-preset="home">
              ${LS.Helpers.escapeHtml(homePreset.label || '집')}
            </button>
          </div>
          <div class="weather-preset-caption">
            ${activeKey === 'school'
              ? `학교 기준: ${LS.Helpers.escapeHtml(schoolPreset.label || '학교')}`
              : `집 기준: ${LS.Helpers.escapeHtml(homePreset.label || '집')}`}
          </div>
        </section>
      `;
    },

    _buildAlerts(data) {
      const alerts = [];
      const weather = data.weather || null;
      const dailyForecast = Array.isArray(data.dailyForecast) ? data.dailyForecast : [];
      const airQuality = data.airQuality || null;
      const airDaily = Array.isArray(data.dailyAirQualityForecast) ? data.dailyAirQualityForecast : [];

      const rainPeak = dailyForecast.reduce((max, entry) => Math.max(max, entry?.popMax || 0), 0);
      if (rainPeak >= 60) {
        alerts.push({
          severity: 'high',
          title: '강수 주의',
          message: `가장 높은 강수 가능성은 ${rainPeak}%입니다. 우산을 챙기시는 편이 좋습니다.`
        });
      } else if (rainPeak >= 30) {
        alerts.push({
          severity: 'medium',
          title: '비 가능성',
          message: `오늘과 내일 중 비 가능성이 ${rainPeak}%까지 올라갑니다.`
        });
      }

      const hotDay = dailyForecast.find((entry) => (entry?.maxTemp ?? -999) >= 30);
      if (hotDay) {
        alerts.push({
          severity: 'medium',
          title: '더위 대비',
          message: `${this._getRelativeDayLabel(new Date(hotDay.date))} 최고기온이 ${hotDay.maxTemp}도까지 올라갑니다.`
        });
      }

      const coldDay = dailyForecast.find((entry) => (entry?.minTemp ?? 999) <= 0);
      if (coldDay) {
        alerts.push({
          severity: 'info',
          title: '한파 주의',
          message: `${this._getRelativeDayLabel(new Date(coldDay.date))} 최저기온이 ${coldDay.minTemp}도입니다.`
        });
      }

      if (weather && (weather.windGust >= 10 || weather.windSpeed >= 7)) {
        alerts.push({
          severity: 'info',
          title: '강한 바람',
          message: `현재 풍속 ${weather.windSpeed}m/s${weather.windGust ? `, 순간풍속 ${Math.round(weather.windGust)}m/s` : ''} 수준입니다.`
        });
      }

      const airPeak = [
        airQuality?.pm25 || 0,
        ...airDaily.map((entry) => entry?.pm25Max || 0)
      ].reduce((max, value) => Math.max(max, value), 0);

      if (airPeak >= 76) {
        alerts.push({
          severity: 'high',
          title: '미세먼지 매우 나쁨',
          message: `초미세먼지 최고 예상치가 ${airPeak}㎍/㎥입니다. 야외 활동은 주의하시는 편이 좋습니다.`
        });
      } else if (airPeak >= 36) {
        alerts.push({
          severity: 'medium',
          title: '미세먼지 주의',
          message: `초미세먼지 최고 예상치가 ${airPeak}㎍/㎥입니다.`
        });
      }

      return alerts.slice(0, 4);
    },

    _renderAlerts(alerts) {
      return `
        <section class="weather-section">
          <div class="weather-section-title">주의 정보</div>
          <div class="weather-alert-list">
            ${alerts.map((alert) => `
              <article class="weather-alert-card is-${alert.severity}">
                <strong>${LS.Helpers.escapeHtml(alert.title)}</strong>
                <span>${LS.Helpers.escapeHtml(alert.message)}</span>
              </article>
            `).join('')}
          </div>
        </section>
      `;
    },

    _renderCurrentWeather(weather, data, options) {
      const daily = Array.isArray(data?.dailyForecast) ? data.dailyForecast[0] : null;
      const airQuality = options.showAirCurrent ? data?.airQuality : null;
      const pm25Level = airQuality ? LS.Helpers.getAirQualityLevel(airQuality.pm25) : null;
      const pm10Level = airQuality ? LS.Helpers.getAirQualityLevelPM10(airQuality.pm10) : null;
      const hasAirSummary = Boolean(airQuality && pm25Level && pm10Level);
      const hasSideSummary = Boolean(daily || hasAirSummary);
      const updatedText = options.showUpdatedAt && data?.updatedAt
        ? `업데이트 ${this._formatTime(data.updatedAt)}`
        : '';

      let html = '<section class="weather-section weather-current-section">';
      html += '<div class="weather-section-head">';
      html += '<div class="weather-section-title">현재 날씨</div>';
      if (updatedText) {
        html += `<div class="weather-section-meta">${LS.Helpers.escapeHtml(updatedText)}</div>`;
      }
      html += '</div>';
      html += '<div class="weather-current weather-summary-card">';
      html += `<div class="weather-current-hero ${hasSideSummary ? 'has-side-summary' : ''}">`;
      html += '<div class="weather-current-main-block">';
      html += '<div class="weather-main">';
      html += `<span class="weather-emoji">${LS.Helpers.getWeatherEmoji(weather.icon)}</span>`;
      html += `<span class="weather-temp">${weather.temp}°</span>`;
      html += '</div>';
      html += `<div class="weather-desc">${LS.Helpers.escapeHtml(weather.description || '')}</div>`;
      html += '</div>';
      if (hasSideSummary) {
        html += '<div class="weather-current-side">';
        if (daily) {
          html += '<div class="weather-current-side-row">';
          html += `<span class="weather-current-chip">오늘 ${daily.minTemp}° / ${daily.maxTemp}°</span>`;
          html += '</div>';
        }
        if (hasAirSummary) {
          html += '<div class="weather-current-side-row weather-current-air">';
          html += `<span class="weather-current-air-badge" style="background:${pm25Level.bg};color:${pm25Level.color}">초미세 ${airQuality.pm25} ${LS.Helpers.escapeHtml(pm25Level.level)}</span>`;
          html += `<span class="weather-current-air-badge" style="background:${pm10Level.bg};color:${pm10Level.color}">미세 ${airQuality.pm10} ${LS.Helpers.escapeHtml(pm10Level.level)}</span>`;
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';

      if (options.showDetails) {
        html += '<div class="weather-details">';
        html += `<span>체감 ${weather.feelsLike}°</span>`;
        html += `<span>습도 ${weather.humidity}%</span>`;
        html += `<span>풍속 ${weather.windSpeed}m/s</span>`;
        if (weather.visibilityKm) {
          html += `<span>가시거리 ${weather.visibilityKm}km</span>`;
        }
        html += '</div>';
      }

      const solarInfo = this._getSolarInfo(weather);
      if (solarInfo) {
        html += '<div class="weather-solar-row">';
        html += `<span class="weather-solar-chip">일출 ${this._formatTime(solarInfo.sunrise)}</span>`;
        html += `<span class="weather-solar-chip">남중 ${this._formatTime(solarInfo.solarNoon)}</span>`;
        html += `<span class="weather-solar-chip">일몰 ${this._formatTime(solarInfo.sunset)}</span>`;
        html += '</div>';
      }

      html += '</div>';
      html += '</section>';
      return html;
    },

    _getTonightHighlights(data) {
      const level = LS.Config.get('calendarAstronomyLevel') || 'basic';
      if (level === 'off' || !LS.Astronomy?.getTonightHighlights) return [];
      const preset = data?.preset || {};
      return LS.Astronomy.getTonightHighlights(Date.now(), {
        level,
        koreaOnly: LS.Config.get('calendarAstronomyKoreaOnly'),
        lat: preset.lat,
        lon: preset.lon
      });
    },

    _renderTonightSkyCard(events) {
      let html = '<aside class="weather-tonight-card">';
      html += '<div class="weather-tonight-title">오늘 밤 볼거리</div>';
      if (!events.length) {
        html += '<div class="weather-tonight-empty">오늘 밤은 특별히 눈에 띄는 천문 이벤트가 없습니다.</div>';
        html += '</aside>';
        return html;
      }

      html += '<div class="weather-tonight-list">';
      events.forEach((event) => {
        const timeLabel = event.allDay ? (event.astronomyKind === 'meteor' ? '밤새' : '오늘 밤') : (event.startTime || '오늘 밤');
        html += `
          <div class="weather-tonight-item">
            <strong>${LS.Helpers.escapeHtml(event.name)}</strong>
            <span>${LS.Helpers.escapeHtml(timeLabel)}</span>
          </div>
        `;
      });
      html += '</div>';
      html += '</aside>';
      return html;
    },

    _getWeeklyHighlights(data) {
      const level = LS.Config.get('calendarAstronomyLevel') || 'basic';
      if (level === 'off' || !LS.Astronomy?.getWeeklyHighlights) return [];
      const preset = data?.preset || {};
      return LS.Astronomy.getWeeklyHighlights(Date.now(), {
        level,
        koreaOnly: LS.Config.get('calendarAstronomyKoreaOnly'),
        lat: preset.lat,
        lon: preset.lon
      });
    },

    _renderWeeklySkySection(events) {
      let html = '<section class="weather-section weather-weekly-sky-section">';
      html += '<div class="weather-section-title">이번주 볼거리</div>';
      if (!events.length) {
        html += '<div class="weather-weekly-sky-empty">이번 주에 눈에 띄는 천문 이벤트가 없습니다.</div>';
        html += '</section>';
        return html;
      }

      html += '<div class="weather-weekly-sky-list">';
      events.forEach((event) => {
        const eventDate = new Date(event.date);
        const dayLabel = `${this._getRelativeDayLabel(eventDate)} ${this._formatShortDate(eventDate)}`;
        const timeLabel = event.allDay
          ? (event.astronomyKind === 'meteor' ? `${dayLabel} 밤` : dayLabel)
          : `${dayLabel} ${event.startTime || ''}`.trim();
        html += `
          <div class="weather-weekly-sky-item">
            <strong>${LS.Helpers.escapeHtml(event.name)}</strong>
            <span>${LS.Helpers.escapeHtml(timeLabel)}</span>
          </div>
        `;
      });
      html += '</div>';
      html += '</section>';
      return html;
    },

    _getSolarInfo(weather) {
      const sunrise = Number(weather?.sunrise || 0);
      const sunset = Number(weather?.sunset || 0);
      if (!sunrise || !sunset || sunset <= sunrise) return null;

      return {
        sunrise,
        sunset,
        solarNoon: sunrise + Math.round((sunset - sunrise) / 2)
      };
    },

    _renderCurrentAirQuality(airQuality) {
      const pm25Level = LS.Helpers.getAirQualityLevel(airQuality.pm25);
      const pm10Level = LS.Helpers.getAirQualityLevelPM10(airQuality.pm10);

      let html = '<section class="weather-section">';
      html += '<div class="weather-section-title">현재 미세먼지</div>';
      html += '<div class="weather-air">';
      html += `<div class="air-badge" style="background:${pm25Level.bg};color:${pm25Level.color}">초미세 ${airQuality.pm25} <b>${pm25Level.level}</b></div>`;
      html += `<div class="air-badge" style="background:${pm10Level.bg};color:${pm10Level.color}">미세 ${airQuality.pm10} <b>${pm10Level.level}</b></div>`;
      html += '</div>';
      html += '</section>';
      return html;
    },

    _renderHourlySection(hourlyWeather, hourlyAir, options) {
      const hasHourlyWeather = options.showHourlyWeather && Array.isArray(hourlyWeather) && hourlyWeather.length > 0;
      const hasHourlyAir = options.showHourlyAir && Array.isArray(hourlyAir) && hourlyAir.length > 0;

      if (hasHourlyWeather && hasHourlyAir) {
        return this._renderCombinedHourlyForecast(hourlyWeather, hourlyAir);
      }
      if (hasHourlyWeather) {
        return this._renderHourlyWeather(hourlyWeather);
      }
      if (hasHourlyAir) {
        return this._renderHourlyAirQuality(hourlyAir);
      }
      return '';
    },

    _renderHourlyWeather(forecast) {
      let html = '<section class="weather-section">';
      html += '<div class="weather-section-title">시간별 날씨</div>';
      html += '<div class="weather-forecast">';

      forecast.forEach((entry) => {
        const time = new Date(entry.time);
        html += '<div class="forecast-item">';
        html += `<span class="forecast-time">${this._formatTime(time)}</span>`;
        html += `<span class="forecast-icon">${LS.Helpers.getWeatherEmoji(entry.icon)}</span>`;
        html += `<span class="forecast-temp">${entry.temp}°</span>`;
        if (entry.pop > 0) {
          html += `<span class="forecast-rain">강수 ${entry.pop}%</span>`;
        }
        html += '</div>';
      });

      html += '</div>';
      html += '</section>';
      return html;
    },

    _renderCombinedHourlyForecast(hourlyWeather, hourlyAir) {
      let html = '<section class="weather-section">';
      html += '<div class="weather-section-title">시간별 예보</div>';
      html += '<div class="weather-hourly-grid">';

      hourlyWeather.forEach((entry, index) => {
        const time = new Date(entry.time);
        const airEntry = hourlyAir[index] || null;
        const pm25Level = airEntry ? LS.Helpers.getAirQualityLevel(airEntry.pm25) : null;
        const pm10Level = airEntry ? LS.Helpers.getAirQualityLevelPM10(airEntry.pm10) : null;

        html += '<div class="weather-hourly-card">';
        html += `<div class="forecast-time">${this._formatTime(time)}</div>`;
        html += '<div class="weather-hourly-main">';
        html += `<span class="forecast-icon">${LS.Helpers.getWeatherEmoji(entry.icon)}</span>`;
        html += `<span class="forecast-temp">${entry.temp}°</span>`;
        html += '</div>';

        const hasRain = entry.pop > 0;
        const hasAir = Boolean(airEntry && pm25Level && pm10Level);

        html += '<div class="weather-hourly-rain-slot">';
        if (hasRain) {
          html += `<div class="weather-hourly-pill weather-daily-pill-rain">비 ${entry.pop}%</div>`;
        } else {
          html += '<div class="weather-hourly-pill weather-daily-pill-rain is-placeholder">비 0%</div>';
        }
        html += '</div>';

        html += '<div class="weather-hourly-air">';
        if (hasAir) {
          html += `<div class="weather-hourly-pill" style="background:${pm25Level.bg};color:${pm25Level.color}">초 ${airEntry.pm25}</div>`;
          html += `<div class="weather-hourly-pill" style="background:${pm10Level.bg};color:${pm10Level.color}">미 ${airEntry.pm10}</div>`;
        } else {
          html += '<div class="weather-hourly-pill is-placeholder">초 0</div>';
          html += '<div class="weather-hourly-pill is-placeholder">미 0</div>';
        }
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
      html += '</section>';
      return html;
    },

    _alignHourlyAirForecast(baseForecast, airForecast) {
      const base = Array.isArray(baseForecast) ? baseForecast : [];
      const source = Array.isArray(airForecast) ? airForecast : [];
      if (!base.length || !source.length) return [];

      return base.map((entry) => {
        const matched = this._findClosestAirForecast(entry.time, source);
        if (!matched) return null;
        return {
          ...matched,
          time: entry.time
        };
      }).filter(Boolean);
    },

    _findClosestAirForecast(targetTime, airForecast) {
      const target = Number(new Date(targetTime).getTime());
      if (!Number.isFinite(target)) return null;

      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      airForecast.forEach((entry) => {
        const current = Number(new Date(entry?.time).getTime());
        if (!Number.isFinite(current)) return;
        const distance = Math.abs(current - target);
        if (distance < bestDistance) {
          best = entry;
          bestDistance = distance;
        }
      });
      return best;
    },

    _renderDailyWeather(dailyForecast) {
      let html = '<section class="weather-section">';
      html += '<div class="weather-section-title">날짜별 날씨</div>';
      html += '<div class="weather-daily-grid">';

      dailyForecast.forEach((entry) => {
        const date = new Date(entry.date);
        html += '<div class="weather-daily-card">';
        html += '<div class="weather-daily-topline">';
        html += `<div class="weather-daily-label">${this._getRelativeDayLabel(date)}</div>`;
        html += `<div class="weather-daily-date">${this._formatShortDate(date)}</div>`;
        html += '</div>';
        html += '<div class="weather-daily-summary">';
        html += `<div class="weather-daily-icon">${LS.Helpers.getWeatherEmoji(entry.icon)}</div>`;
        html += `<div class="weather-daily-temp">${entry.minTemp}° / ${entry.maxTemp}°</div>`;
        html += '</div>';
        if (entry.popMax > 0) {
          html += '<div class="weather-daily-meta">';
          html += `<div class="weather-daily-pill weather-daily-pill-rain">비 ${entry.popMax}%</div>`;
          html += '</div>';
        }
        html += '</div>';
      });

      html += '</div>';
      html += '</section>';
      return html;
    },

    _renderHourlyAirQuality(forecast) {
      let html = '<section class="weather-section">';
      html += '<div class="weather-section-title">시간별 미세먼지</div>';
      html += '<div class="weather-air-forecast">';

      forecast.forEach((entry) => {
        const time = new Date(entry.time);
        const pm25Level = LS.Helpers.getAirQualityLevel(entry.pm25);
        const pm10Level = LS.Helpers.getAirQualityLevelPM10(entry.pm10);

        html += '<div class="air-forecast-card">';
        html += `<div class="air-forecast-time">${this._formatTime(time)}</div>`;
        html += '<div class="air-forecast-pill-group">';
        html += `<div class="air-forecast-pill" style="background:${pm25Level.bg};color:${pm25Level.color}">초 ${entry.pm25} ${LS.Helpers.escapeHtml(pm25Level.level)}</div>`;
        html += `<div class="air-forecast-pill" style="background:${pm10Level.bg};color:${pm10Level.color}">미 ${entry.pm10} ${LS.Helpers.escapeHtml(pm10Level.level)}</div>`;
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
      html += '</section>';
      return html;
    },

    _renderDailyAirQuality(dailyForecast) {
      let html = '<section class="weather-section">';
      html += '<div class="weather-section-title">날짜별 미세먼지 예보</div>';
      html += '<div class="weather-daily-grid weather-daily-air-grid">';

      dailyForecast.forEach((entry) => {
        const date = new Date(entry.date);
        const pm25Level = LS.Helpers.getAirQualityLevel(entry.pm25Max);
        const pm10Level = LS.Helpers.getAirQualityLevelPM10(entry.pm10Max);

        html += '<div class="weather-daily-card weather-air-daily-card">';
        html += '<div class="weather-daily-topline">';
        html += `<div class="weather-daily-label">${this._getRelativeDayLabel(date)}</div>`;
        html += `<div class="weather-daily-date">${this._formatShortDate(date)}</div>`;
        html += '</div>';
        html += '<div class="weather-daily-meta">';
        html += `<div class="weather-daily-pill" style="background:${pm25Level.bg};color:${pm25Level.color}">초미세 ${entry.pm25Max} ${LS.Helpers.escapeHtml(pm25Level.level)}</div>`;
        html += `<div class="weather-daily-pill" style="background:${pm10Level.bg};color:${pm10Level.color}">미세 ${entry.pm10Max} ${LS.Helpers.escapeHtml(pm10Level.level)}</div>`;
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
      html += '</section>';
      return html;
    },

    _renderDailySection(dailyWeather, dailyAir, options) {
      const hasDailyWeather = options.showDailyWeather && Array.isArray(dailyWeather) && dailyWeather.length > 0;
      const hasDailyAir = options.showDailyAir && Array.isArray(dailyAir) && dailyAir.length > 0;

      if (hasDailyWeather && hasDailyAir) {
        return this._renderCombinedDailyForecast(dailyWeather, dailyAir);
      }
      if (hasDailyWeather) {
        return this._renderDailyWeather(dailyWeather);
      }
      if (hasDailyAir) {
        return this._renderDailyAirQuality(dailyAir);
      }
      return '';
    },

    _renderCombinedDailyForecast(dailyWeather, dailyAir) {
      const merged = this._mergeDailyForecasts(dailyWeather, dailyAir);

      let html = '<section class="weather-section">';
      html += '<div class="weather-section-title">날짜별 예보</div>';
      html += '<div class="weather-daily-grid">';

      merged.forEach((entry) => {
        const date = new Date(entry.date);
        const pm25Level = entry.air ? LS.Helpers.getAirQualityLevel(entry.air.pm25Max) : null;
        const pm10Level = entry.air ? LS.Helpers.getAirQualityLevelPM10(entry.air.pm10Max) : null;
        const hasRain = Boolean(entry.weather && entry.weather.popMax > 0);
        const hasAir = Boolean(entry.air && pm25Level && pm10Level);

        html += '<div class="weather-daily-card weather-daily-combined-card">';
        html += '<div class="weather-daily-topline">';
        html += `<div class="weather-daily-label">${this._getRelativeDayLabel(date)}</div>`;
        html += `<div class="weather-daily-date">${this._formatShortDate(date)}</div>`;
        html += '</div>';

        if (entry.weather) {
          html += '<div class="weather-daily-summary">';
          html += `<div class="weather-daily-icon">${LS.Helpers.getWeatherEmoji(entry.weather.icon)}</div>`;
          html += `<div class="weather-daily-temp">${entry.weather.minTemp}° / ${entry.weather.maxTemp}°</div>`;
          html += '</div>';
        }

        html += '<div class="weather-daily-meta">';
        html += '<div class="weather-daily-rain-slot">';
        if (hasRain) {
          html += `<div class="weather-daily-pill weather-daily-pill-rain">비 ${entry.weather.popMax}%</div>`;
        } else {
          html += '<div class="weather-daily-pill weather-daily-pill-rain is-placeholder">비 0%</div>';
        }
        html += '</div>';
        html += '<div class="weather-daily-air">';
        if (hasAir) {
          html += `<div class="weather-daily-pill" style="background:${pm25Level.bg};color:${pm25Level.color}">초미세 ${entry.air.pm25Max} ${LS.Helpers.escapeHtml(pm25Level.level)}</div>`;
          html += `<div class="weather-daily-pill" style="background:${pm10Level.bg};color:${pm10Level.color}">미세 ${entry.air.pm10Max} ${LS.Helpers.escapeHtml(pm10Level.level)}</div>`;
        } else {
          html += '<div class="weather-daily-pill is-placeholder">초미세 0 좋음</div>';
          html += '<div class="weather-daily-pill is-placeholder">미세 0 좋음</div>';
        }
        html += '</div>';
        html += '</div>';

        html += '</div>';
      });

      html += '</div>';
      html += '</section>';
      return html;
    },

    _mergeDailyForecasts(dailyWeather, dailyAir) {
      const mergedMap = new Map();

      (dailyWeather || []).forEach((entry) => {
        const key = this._getDateKey(entry.date);
        if (!key) return;
        mergedMap.set(key, {
          date: entry.date,
          weather: entry,
          air: null
        });
      });

      (dailyAir || []).forEach((entry) => {
        const key = this._getDateKey(entry.date);
        if (!key) return;
        const existing = mergedMap.get(key) || {
          date: entry.date,
          weather: null,
          air: null
        };
        existing.date = existing.date || entry.date;
        existing.air = entry;
        mergedMap.set(key, existing);
      });

      return [...mergedMap.values()]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5);
    },

    _renderInfoCard(message) {
      return `
        <section class="weather-section">
          <div class="weather-info-card">${LS.Helpers.escapeHtml(message)}</div>
        </section>
      `;
    },

    _compactDailyAirLabels(container) {
      container.querySelectorAll('.weather-daily-card .weather-daily-pill:not(.weather-daily-pill-rain):not(.is-placeholder)').forEach((pill) => {
        const text = String(pill.textContent || '').replace(/\s+/g, ' ').trim();
        const pm25Match = text.match(/^초미세\s*(\d+)/);
        if (pm25Match) {
          pill.textContent = `초 ${pm25Match[1]}`;
          return;
        }

        const pm10Match = text.match(/^미세\s*(\d+)/);
        if (pm10Match) {
          pill.textContent = `미 ${pm10Match[1]}`;
        }
      });
    },

    _bindInteractions(container) {
      this._bindScrollBridge(container);
    },

      _publishValidationDiagnostic(container) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('validate') !== '1') return;

        const scroller = document.getElementById('weather-scroll') || container.closest('.widget-body');
        const diagnostic = {
          bodyClass: document.body.className,
          scrollerId: scroller?.id || '',
          scrollerClass: scroller?.className || '',
          contentChildren: container.children.length,
          clientHeight: scroller?.clientHeight || 0,
          scrollHeight: scroller?.scrollHeight || 0,
          initialScrollTop: scroller?.scrollTop || 0,
          overflowed: Boolean(scroller && scroller.scrollHeight > scroller.clientHeight)
        };

        if (scroller) {
          const before = scroller.scrollTop;
          scroller.scrollTop = Math.min(200, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
          diagnostic.afterScrollTop = scroller.scrollTop;

          const wheelEvent = new WheelEvent('wheel', {
            deltaY: 120,
            bubbles: true,
            cancelable: true
          });
          container.dispatchEvent(wheelEvent);
          diagnostic.afterSyntheticWheelTop = scroller.scrollTop;
          diagnostic.syntheticWheelMoved = scroller.scrollTop > Math.max(before, diagnostic.afterScrollTop || 0);
        }

        document.body.setAttribute('data-weather-diagnostic', JSON.stringify(diagnostic));
      },

    _bindScrollBridge(container) {
      const scroller = container.closest('.widget-body');
      if (!scroller) return;

      if (this._wheelBridgeHandler && this._wheelBridgeTarget) {
        this._wheelBridgeTarget.removeEventListener('wheel', this._wheelBridgeHandler);
        this._wheelBridgeTarget.removeEventListener('mousewheel', this._wheelBridgeHandler);
      }

      this._wheelBridgeHandler = (event) => {
        const deltaY = Number.isFinite(Number(event.deltaY))
          ? Number(event.deltaY)
          : Number.isFinite(Number(event.wheelDeltaY))
            ? -Number(event.wheelDeltaY)
            : Number.isFinite(Number(event.wheelDelta))
              ? -Number(event.wheelDelta)
              : 0;
        const deltaX = Number(event.deltaX || 0);
        if (Math.abs(deltaY) < Math.abs(deltaX)) return;

        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (maxTop <= 0) return;

        const currentTop = scroller.scrollTop;
        const nextTop = Math.max(0, Math.min(maxTop, currentTop + deltaY));
        if (nextTop === currentTop) return;

        scroller.scrollTop = nextTop;
        event.preventDefault();
        event.stopPropagation();
      };

      this._wheelBridgeTarget = scroller;
      scroller.addEventListener('wheel', this._wheelBridgeHandler, { passive: false });
      scroller.addEventListener('mousewheel', this._wheelBridgeHandler, { passive: false });
    },

    _getRelativeDayLabel(date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      const diff = Math.round((target.getTime() - today.getTime()) / 86400000);

      if (diff === 0) return '오늘';
      if (diff === 1) return '내일';
      return LS.Helpers.DAY_NAMES[target.getDay()] || this._formatShortDate(target);
    },

    _getDateKey(dateLike) {
      const date = new Date(dateLike);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },

    _formatShortDate(dateLike) {
      const date = new Date(dateLike);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    },

    _formatTime(dateLike) {
      const date = new Date(dateLike);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },

    _renderEmpty(message) {
      const container = document.getElementById('weather-content');
      if (container) {
        container.innerHTML = `<div class="widget-empty"><p>${LS.Helpers.escapeHtml(message)}</p></div>`;
      }
    },

    destroy() {
      if (this._wheelBridgeHandler && this._wheelBridgeTarget) {
        this._wheelBridgeTarget.removeEventListener('wheel', this._wheelBridgeHandler);
        this._wheelBridgeTarget.removeEventListener('mousewheel', this._wheelBridgeHandler);
        this._wheelBridgeHandler = null;
        this._wheelBridgeTarget = null;
      }
      if (this._updateInterval) {
        clearInterval(this._updateInterval);
        this._updateInterval = null;
      }
    }
  };
})();
