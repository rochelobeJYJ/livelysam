(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
  const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

  LS.WeatherAPI = {
    apiKey: '',
    lat: null,
    lon: null,
    cachedWeather: null,
    cachedForecast: null,
    cachedAirQuality: null,
    lastFetchTime: 0,
    CACHE_DURATION: 15 * 60 * 1000, // 15분 캐시

    setApiKey(key) {
      this.apiKey = key;
    },

    setLocation(lat, lon) {
      this.lat = lat;
      this.lon = lon;
    },

    /* ── 주소로 좌표 검색 ── */
    async geocode(address) {
      if (!this.apiKey) return null;
      try {
        const url = `${GEO_BASE}/direct?q=${encodeURIComponent(address)},KR&limit=1&appid=${this.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.length > 0) {
          return { lat: data[0].lat, lon: data[0].lon, name: data[0].local_names?.ko || data[0].name };
        }
        return null;
      } catch (e) {
        console.error('[Weather] 지오코딩 실패:', e);
        return null;
      }
    },

    /* ── 현재 날씨 ── */
    async getCurrentWeather() {
      if (!this.apiKey || this.lat === null) return this.cachedWeather;

      const now = Date.now();
      if (this.cachedWeather && now - this.lastFetchTime < this.CACHE_DURATION) {
        return this.cachedWeather;
      }

      try {
        const url = `${OWM_BASE}/weather?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric&lang=kr`;
        const res = await fetch(url);
        const data = await res.json();

        this.cachedWeather = {
          temp: Math.round(data.main.temp),
          feelsLike: Math.round(data.main.feels_like),
          tempMin: Math.round(data.main.temp_min),
          tempMax: Math.round(data.main.temp_max),
          humidity: data.main.humidity,
          description: data.weather[0]?.description || '',
          icon: data.weather[0]?.icon || '',
          windSpeed: data.wind?.speed || 0,
          clouds: data.clouds?.all || 0,
          cityName: data.name
        };
        this.lastFetchTime = now;

        // 캐시에도 저장
        LS.Storage.set('cachedWeather', this.cachedWeather);
        LS.Storage.set('cachedWeatherTime', now);

        return this.cachedWeather;
      } catch (e) {
        console.error('[Weather] 현재 날씨 조회 실패:', e);
        // 캐시된 데이터 반환
        return this.cachedWeather || LS.Storage.get('cachedWeather', null);
      }
    },

    /* ── 3시간 예보 ── */
    async getForecast() {
      if (!this.apiKey || this.lat === null) return this.cachedForecast;

      const now = Date.now();
      if (this.cachedForecast && now - this.lastFetchTime < this.CACHE_DURATION) {
        return this.cachedForecast;
      }

      try {
        const url = `${OWM_BASE}/forecast?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric&lang=kr&cnt=8`;
        const res = await fetch(url);
        const data = await res.json();

        this.cachedForecast = (data.list || []).map(item => ({
          time: new Date(item.dt * 1000),
          temp: Math.round(item.main.temp),
          icon: item.weather[0]?.icon || '',
          description: item.weather[0]?.description || '',
          pop: Math.round((item.pop || 0) * 100) // 강수확률 %
        }));

        LS.Storage.set('cachedForecast', this.cachedForecast);
        return this.cachedForecast;
      } catch (e) {
        console.error('[Weather] 예보 조회 실패:', e);
        return this.cachedForecast || LS.Storage.get('cachedForecast', []);
      }
    },

    /* ── 대기질 (미세먼지) ── */
    async getAirQuality() {
      if (!this.apiKey || this.lat === null) return this.cachedAirQuality;

      const now = Date.now();
      if (this.cachedAirQuality && now - this.lastFetchTime < this.CACHE_DURATION) {
        return this.cachedAirQuality;
      }

      try {
        const url = `${OWM_BASE}/air_pollution?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.list && data.list.length > 0) {
          const comp = data.list[0].components;
          this.cachedAirQuality = {
            aqi: data.list[0].main.aqi, // 1~5
            pm25: Math.round(comp.pm2_5 || 0),
            pm10: Math.round(comp.pm10 || 0),
            o3: Math.round(comp.o3 || 0),
            no2: Math.round(comp.no2 || 0),
            so2: Math.round(comp.so2 || 0),
            co: Math.round(comp.co || 0)
          };

          LS.Storage.set('cachedAirQuality', this.cachedAirQuality);
          return this.cachedAirQuality;
        }
        return null;
      } catch (e) {
        console.error('[Weather] 대기질 조회 실패:', e);
        return this.cachedAirQuality || LS.Storage.get('cachedAirQuality', null);
      }
    },

    /* ── 모든 날씨 정보 한 번에 ── */
    async fetchAll() {
      const [weather, forecast, airQuality] = await Promise.all([
        this.getCurrentWeather(),
        this.getForecast(),
        this.getAirQuality()
      ]);
      return { weather, forecast, airQuality };
    }
  };
})();
