(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.WeatherWidget = {
    _updateInterval: null,

    async init() {
      await this.update();
      this._updateInterval = setInterval(() => this.update(), 15 * 60 * 1000); // 15분 갱신
    },

    async update() {
      const apiKey = LS.Config.get('weatherApiKey');
      if (!apiKey) {
        this._renderEmpty('⚙️ 설정에서 OpenWeatherMap API 키를 입력해주세요');
        return;
      }

      // 위치 설정 확인
      if (!LS.Config.get('weatherLat')) {
        const address = LS.Config.get('schoolAddress');
        if (address) {
          LS.WeatherAPI.setApiKey(apiKey);
          let loc = await LS.WeatherAPI.geocode(address);
          if (!loc) {
            // 전체 주소 실패 시 '시/도' 단위로 재시도 (예: 서울특별시)
            const city = address.split(' ')[0];
            if (city) loc = await LS.WeatherAPI.geocode(city);
          }
          if (loc) {
            LS.Config.setMultiple({ weatherLat: loc.lat, weatherLon: loc.lon });
          }
        }
        if (!LS.Config.get('weatherLat')) {
          this._renderEmpty('⚙️ 학교 설정 후 날씨가 표시됩니다');
          return;
        }
      }

      try {
        LS.WeatherAPI.setApiKey(apiKey);
        LS.WeatherAPI.setLocation(LS.Config.get('weatherLat'), LS.Config.get('weatherLon'));
        
        const data = await LS.WeatherAPI.fetchAll();
        this.render(data);
      } catch (e) {
        console.error('[Weather] 업데이트 실패:', e);
      }
    },

    render(data) {
      const container = document.getElementById('weather-content');
      if (!container || !data) return;

      let html = '';

      // 현재 날씨
      if (data.weather) {
        const w = data.weather;
        const emoji = LS.Helpers.getWeatherEmoji(w.icon);

        html += `<div class="weather-current">`;
        html += `<div class="weather-main">`;
        html += `<span class="weather-emoji">${emoji}</span>`;
        html += `<span class="weather-temp">${w.temp}°</span>`;
        html += `</div>`;
        html += `<div class="weather-desc">${w.description}</div>`;
        html += `<div class="weather-details">`;
        html += `<span>체감 ${w.feelsLike}°</span>`;
        html += `<span>💧 ${w.humidity}%</span>`;
        html += `<span>💨 ${w.windSpeed}m/s</span>`;
        html += `</div>`;
        html += `</div>`;
      }

      // 대기질
      if (data.airQuality) {
        const aq = data.airQuality;
        const pm25Level = LS.Helpers.getAirQualityLevel(aq.pm25);
        const pm10Level = LS.Helpers.getAirQualityLevelPM10(aq.pm10);

        html += `<div class="weather-air">`;
        html += `<div class="air-badge" style="background:${pm25Level.bg};color:${pm25Level.color}">`;
        html += `초미세 ${aq.pm25}㎍ <b>${pm25Level.level}</b></div>`;
        html += `<div class="air-badge" style="background:${pm10Level.bg};color:${pm10Level.color}">`;
        html += `미세 ${aq.pm10}㎍ <b>${pm10Level.level}</b></div>`;
        html += `</div>`;
      }

      // 3시간 예보
      if (data.forecast && data.forecast.length > 0) {
        html += `<div class="weather-forecast">`;
        data.forecast.slice(0, 5).forEach(f => {
          const time = f.time instanceof Date ? f.time : new Date(f.time);
          const hour = time.getHours();
          const emoji = LS.Helpers.getWeatherEmoji(f.icon);
          html += `<div class="forecast-item">`;
          html += `<span class="forecast-time">${hour}시</span>`;
          html += `<span class="forecast-icon">${emoji}</span>`;
          html += `<span class="forecast-temp">${f.temp}°</span>`;
          if (f.pop > 0) {
            html += `<span class="forecast-rain">💧${f.pop}%</span>`;
          }
          html += `</div>`;
        });
        html += `</div>`;
      }

      container.innerHTML = html;
    },

    _renderEmpty(msg) {
      const container = document.getElementById('weather-content');
      if (container) {
        container.innerHTML = `<div class="widget-empty"><p>${msg}</p></div>`;
      }
    },

    destroy() {
      if (this._updateInterval) clearInterval(this._updateInterval);
    }
  };
})();
