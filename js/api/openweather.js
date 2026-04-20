(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
  const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';
  const WEATHER_API_TIMEOUT_MS = 8000;

  function createCacheBucket() {
    return Object.create(null);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function hasValidCoordinates(lat, lon) {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
  }

  function resolveTimeout(value, fallback = WEATHER_API_TIMEOUT_MS) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  function buildTimeoutError(timeoutMs) {
    const error = new Error(`날씨 API 요청 시간이 초과되었습니다. (${timeoutMs}ms)`);
    error.name = 'TimeoutError';
    return error;
  }

  LS.WeatherAPI = {
    mode: 'proxy',
    apiKey: '',
    lat: null,
    lon: null,
    CACHE_DURATION: 15 * 60 * 1000,
    _memoryCache: {
      bundle: createCacheBucket(),
      weather: createCacheBucket(),
      forecastRaw: createCacheBucket(),
      airQuality: createCacheBucket(),
      airQualityForecastRaw: createCacheBucket()
    },

    setMode(mode) {
      this.mode = String(mode || '').trim().toLowerCase() === 'custom' ? 'custom' : 'proxy';
    },

    setApiKey(key) {
      this.apiKey = String(key || '').trim();
    },

    setLocation(lat, lon) {
      this.lat = Number.isFinite(Number(lat)) ? Number(lat) : null;
      this.lon = Number.isFinite(Number(lon)) ? Number(lon) : null;
    },

    usesDirectKey() {
      return this.mode === 'custom' && Boolean(this.apiKey);
    },

    usesProxy() {
      return !this.usesDirectKey();
    },

    hasAvailableProvider() {
      return this.usesProxy() || Boolean(this.apiKey);
    },

    hasValidLocation() {
      return hasValidCoordinates(this.lat, this.lon);
    },

    _requireValidLocation() {
      if (!this.hasValidLocation()) {
        throw new Error('Weather location is not configured.');
      }
    },

    _getWeatherDescriptor(raw) {
      const weather = Array.isArray(raw?.weather) ? raw.weather.find((item) => isObject(item)) : null;
      return {
        description: text(raw?.description || weather?.description),
        icon: text(raw?.icon || weather?.icon)
      };
    },

    _normalizeLocation(raw) {
      if (!isObject(raw) || !hasValidCoordinates(raw.lat, raw.lon)) return null;
      return {
        lat: Number(raw.lat),
        lon: Number(raw.lon),
        name: text(raw.local_names?.ko || raw.name)
      };
    },

    _normalizeCurrentWeather(raw) {
      if (!isObject(raw)) return null;
      const main = isObject(raw.main) ? raw.main : raw;
      const wind = isObject(raw.wind) ? raw.wind : raw;
      const clouds = isObject(raw.clouds) ? raw.clouds : raw;
      const sys = isObject(raw.sys) ? raw.sys : raw;
      const descriptor = this._getWeatherDescriptor(raw);
      return {
        temp: Math.round(toNumber(raw.temp ?? main.temp)),
        feelsLike: Math.round(toNumber(raw.feelsLike ?? raw.feels_like ?? main.feelsLike ?? main.feels_like)),
        tempMin: Math.round(toNumber(raw.tempMin ?? raw.minTemp ?? main.tempMin ?? main.temp_min ?? main.temp)),
        tempMax: Math.round(toNumber(raw.tempMax ?? raw.maxTemp ?? main.tempMax ?? main.temp_max ?? main.temp)),
        humidity: Math.round(toNumber(raw.humidity ?? main.humidity)),
        pressure: Math.round(toNumber(raw.pressure ?? main.pressure)),
        description: descriptor.description,
        icon: descriptor.icon,
        windSpeed: toNumber(raw.windSpeed ?? wind.speed),
        windGust: toNumber(raw.windGust ?? wind.gust),
        visibilityKm: Math.round(toNumber(raw.visibilityKm ?? ((raw.visibility ?? 0) / 1000)) * 10) / 10,
        clouds: Math.round(toNumber(raw.clouds ?? clouds.all)),
        cityName: text(raw.cityName || raw.name),
        sunrise: raw.sunrise ? toNumber(raw.sunrise) : (sys.sunrise ? toNumber(sys.sunrise) * 1000 : null),
        sunset: raw.sunset ? toNumber(raw.sunset) : (sys.sunset ? toNumber(sys.sunset) * 1000 : null),
        updatedAt: toNumber(raw.updatedAt, Date.now())
      };
    },

    _normalizeForecastEntry(raw) {
      if (!isObject(raw)) return null;
      const main = isObject(raw.main) ? raw.main : raw;
      const descriptor = this._getWeatherDescriptor(raw);
      const rawPop = raw.pop ?? raw.popMax ?? 0;
      return {
        time: toNumber(raw.time ?? (raw.dt ? raw.dt * 1000 : 0)),
        temp: Math.round(toNumber(raw.temp ?? main.temp)),
        tempMin: Math.round(toNumber(raw.tempMin ?? raw.minTemp ?? main.temp_min ?? main.temp)),
        tempMax: Math.round(toNumber(raw.tempMax ?? raw.maxTemp ?? main.temp_max ?? main.temp)),
        icon: descriptor.icon,
        description: descriptor.description,
        pop: Math.round(toNumber(rawPop) > 1 ? toNumber(rawPop) : toNumber(rawPop) * 100)
      };
    },

    _normalizeAirQuality(raw) {
      if (!isObject(raw)) return null;
      const components = isObject(raw.components) ? raw.components : raw;
      const main = isObject(raw.main) ? raw.main : raw;
      return {
        aqi: Math.round(toNumber(raw.aqi ?? main.aqi)),
        pm25: Math.round(toNumber(raw.pm25 ?? components.pm2_5)),
        pm10: Math.round(toNumber(raw.pm10 ?? components.pm10)),
        o3: Math.round(toNumber(raw.o3 ?? components.o3)),
        no2: Math.round(toNumber(raw.no2 ?? components.no2)),
        so2: Math.round(toNumber(raw.so2 ?? components.so2)),
        co: Math.round(toNumber(raw.co ?? components.co)),
        updatedAt: raw.updatedAt !== undefined ? toNumber(raw.updatedAt) : undefined
      };
    },

    _normalizeBundle(bundle) {
      if (!isObject(bundle)) return null;
      return {
        weather: this._normalizeCurrentWeather(bundle.weather),
        forecast: (Array.isArray(bundle.forecast) ? bundle.forecast : [])
          .map((item) => this._normalizeForecastEntry(item))
          .filter(Boolean),
        dailyForecast: (Array.isArray(bundle.dailyForecast) ? bundle.dailyForecast : [])
          .filter((item) => isObject(item)),
        airQuality: this._normalizeAirQuality(bundle.airQuality),
        airQualityForecast: (Array.isArray(bundle.airQualityForecast) ? bundle.airQualityForecast : [])
          .filter((item) => isObject(item)),
        dailyAirQualityForecast: (Array.isArray(bundle.dailyAirQualityForecast) ? bundle.dailyAirQualityForecast : [])
          .filter((item) => isObject(item)),
        updatedAt: toNumber(bundle.updatedAt, Date.now())
      };
    },

    async geocode(address) {
      if (!String(address || '').trim()) return null;

      try {
        if (!this.usesDirectKey()) {
          const payload = await LS.DataService.fetchJson('weather/geocode', { address }, {
            timeoutMs: WEATHER_API_TIMEOUT_MS
          });
          return this._normalizeLocation(payload?.location);
        }

        const url = `${GEO_BASE}/direct?q=${encodeURIComponent(address)},KR&limit=1&appid=${this.apiKey}`;
        const data = await this._fetchJson(url);
        return this._normalizeLocation(Array.isArray(data) ? data[0] : null);
      } catch (error) {
        if (error?.name === 'TimeoutError') {
          throw error;
        }
        console.error('[Weather] Geocoding failed:', error);
        return null;
      }
    },

    async getCurrentWeather() {
      if (!this.usesDirectKey()) {
        const bundle = await this._getProxyBundle();
        return bundle?.weather || null;
      }

      return this._fetchCachedResource('weather', 'cachedWeather', async () => {
        this._requireValidLocation();
        const url = `${OWM_BASE}/weather?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric&lang=kr`;
        const data = await this._fetchJson(url);
        return this._normalizeCurrentWeather(data);
      }, null);
    },

    async getForecast() {
      if (!this.usesDirectKey()) {
        const bundle = await this._getProxyBundle();
        return Array.isArray(bundle?.forecast) ? bundle.forecast : [];
      }

      const list = await this._getForecastList();
      return list.slice(0, 6).map((item) => this._normalizeForecastEntry(item)).filter(Boolean);
    },

    async getDailyForecast() {
      if (!this.usesDirectKey()) {
        const bundle = await this._getProxyBundle();
        return Array.isArray(bundle?.dailyForecast) ? bundle.dailyForecast : [];
      }

      const list = await this._getForecastList();
      return this._buildDailyForecast(list);
    },

    async getAirQuality() {
      if (!this.usesDirectKey()) {
        const bundle = await this._getProxyBundle();
        return bundle?.airQuality || null;
      }

      return this._fetchCachedResource('airQuality', 'cachedAirQuality', async () => {
        this._requireValidLocation();
        const url = `${OWM_BASE}/air_pollution?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}`;
        const data = await this._fetchJson(url);
        const first = Array.isArray(data?.list) ? data.list.find((item) => isObject(item)) : null;
        if (!first) return null;

        return {
          ...this._mapAirQualityEntry(first),
          updatedAt: Date.now()
        };
      }, null);
    },

    async getAirQualityForecast() {
      if (!this.usesDirectKey()) {
        const bundle = await this._getProxyBundle();
        return Array.isArray(bundle?.airQualityForecast) ? bundle.airQualityForecast : [];
      }

      const list = await this._getAirQualityForecastList();
      return list.slice(0, 24).map((item) => ({
        ...this._mapAirQualityEntry(item),
        time: toNumber(item.dt) * 1000
      }));
    },

    async getDailyAirQualityForecast() {
      if (!this.usesDirectKey()) {
        const bundle = await this._getProxyBundle();
        return Array.isArray(bundle?.dailyAirQualityForecast) ? bundle.dailyAirQualityForecast : [];
      }

      const list = await this._getAirQualityForecastList();
      return this._buildDailyAirQualityForecast(list);
    },

    async fetchAll() {
      if (!this.usesDirectKey()) {
        return this._getProxyBundle();
      }

      const [weather, forecast, dailyForecast, airQuality, airQualityForecast, dailyAirQualityForecast] = await Promise.all([
        this.getCurrentWeather(),
        this.getForecast(),
        this.getDailyForecast(),
        this.getAirQuality(),
        this.getAirQualityForecast(),
        this.getDailyAirQualityForecast()
      ]);

      return {
        weather,
        forecast,
        dailyForecast,
        airQuality,
        airQualityForecast,
        dailyAirQualityForecast,
        updatedAt: this._getLatestUpdatedAt([
          'cachedWeather',
          'cachedForecastRaw',
          'cachedAirQuality',
          'cachedAirQualityForecastRaw'
        ])
      };
    },

    async _getProxyBundle() {
      return this._fetchCachedResource('bundle', 'cachedWeatherBundle', async () => {
        const payload = await LS.DataService.fetchJson('weather/bundle', {
          lat: this.lat,
          lon: this.lon
        });
        return this._normalizeBundle(payload?.bundle);
      }, null);
    },

    _mapForecastEntry(item) {
      return {
        time: item.dt * 1000,
        temp: Math.round(item.main.temp),
        tempMin: Math.round(item.main.temp_min),
        tempMax: Math.round(item.main.temp_max),
        icon: item.weather[0]?.icon || '',
        description: item.weather[0]?.description || '',
        pop: Math.round((item.pop || 0) * 100)
      };
    },

    _mapAirQualityEntry(entry) {
      const components = entry?.components || {};
      return {
        aqi: entry?.main?.aqi || 0,
        pm25: Math.round(components.pm2_5 || 0),
        pm10: Math.round(components.pm10 || 0),
        o3: Math.round(components.o3 || 0),
        no2: Math.round(components.no2 || 0),
        so2: Math.round(components.so2 || 0),
        co: Math.round(components.co || 0)
      };
    },

    async _getForecastList() {
      return this._fetchCachedResource('forecastRaw', 'cachedForecastRaw', async () => {
        this._requireValidLocation();
        const url = `${OWM_BASE}/forecast?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric&lang=kr`;
        const data = await this._fetchJson(url);
        return Array.isArray(data?.list) ? data.list.filter((item) => isObject(item)) : [];
      }, []);
    },

    async _getAirQualityForecastList() {
      return this._fetchCachedResource('airQualityForecastRaw', 'cachedAirQualityForecastRaw', async () => {
        this._requireValidLocation();
        const url = `${OWM_BASE}/air_pollution/forecast?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}`;
        const data = await this._fetchJson(url);
        return Array.isArray(data?.list) ? data.list.filter((item) => isObject(item)) : [];
      }, []);
    },

    _buildDailyForecast(list) {
      const grouped = this._groupByLocalDate(list, (item) => item.dt * 1000);
      return Object.values(grouped)
        .slice(0, 5)
        .map((items) => {
          const representative = this._pickRepresentativeForecast(items);
          const minTemp = Math.min(...items.map((item) => item.main?.temp_min ?? item.main?.temp ?? 0));
          const maxTemp = Math.max(...items.map((item) => item.main?.temp_max ?? item.main?.temp ?? 0));
          const popMax = Math.max(...items.map((item) => item.pop || 0), 0);

          return {
            date: representative.dt * 1000,
            minTemp: Math.round(minTemp),
            maxTemp: Math.round(maxTemp),
            icon: representative.weather?.[0]?.icon || '',
            description: representative.weather?.[0]?.description || '',
            popMax: Math.round(popMax * 100)
          };
        });
    },

    _buildDailyAirQualityForecast(list) {
      const grouped = this._groupByLocalDate(list, (item) => item.dt * 1000);
      return Object.values(grouped)
        .slice(0, 5)
        .map((items) => {
          const mapped = items.map((item) => this._mapAirQualityEntry(item));
          return {
            date: items[0].dt * 1000,
            aqiMax: Math.max(...mapped.map((item) => item.aqi), 0),
            pm25Avg: this._average(mapped.map((item) => item.pm25)),
            pm25Max: Math.max(...mapped.map((item) => item.pm25), 0),
            pm10Avg: this._average(mapped.map((item) => item.pm10)),
            pm10Max: Math.max(...mapped.map((item) => item.pm10), 0)
          };
        });
    },

    _groupByLocalDate(list, getTimestamp) {
      return (list || []).reduce((acc, item) => {
        const date = new Date(getTimestamp(item));
        const key = this._getLocalDateKey(date);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});
    },

    _pickRepresentativeForecast(items) {
      const sorted = [...items].sort((a, b) => {
        const distanceA = Math.abs(new Date(a.dt * 1000).getHours() - 12);
        const distanceB = Math.abs(new Date(b.dt * 1000).getHours() - 12);
        return distanceA - distanceB;
      });
      return sorted[0] || items[0];
    },

    _getLocalDateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },

    _average(values) {
      if (!Array.isArray(values) || values.length === 0) return 0;
      const sum = values.reduce((acc, value) => acc + (Number(value) || 0), 0);
      return Math.round(sum / values.length);
    },

    _getLocationScope(lat = this.lat, lon = this.lon) {
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return '';
      return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
    },

    _getScopedStorageKey(storageKey, scope) {
      return scope ? `${storageKey}:${scope}` : storageKey;
    },

    _getCacheEntry(cacheKey, scope) {
      if (!scope) return null;
      return this._memoryCache[cacheKey]?.[scope] || null;
    },

    _setCacheEntry(cacheKey, scope, value, time) {
      if (!scope) return;
      if (!this._memoryCache[cacheKey]) {
        this._memoryCache[cacheKey] = createCacheBucket();
      }
      this._memoryCache[cacheKey][scope] = { value, time };
    },

    _getStoredTimestamp(storageKey, scope) {
      if (!scope) return 0;
      return Number(LS.Storage.get(`${this._getScopedStorageKey(storageKey, scope)}:time`, 0)) || 0;
    },

    _getLatestUpdatedAt(storageKeys) {
      const scope = this._getLocationScope();
      const latest = (storageKeys || []).reduce((max, storageKey) => {
        return Math.max(max, this._getStoredTimestamp(storageKey, scope));
      }, 0);
      return latest || Date.now();
    },

    async _fetchCachedResource(cacheKey, storageKey, fetcher, fallbackValue) {
      const scope = this._getLocationScope();
      const scopedStorageKey = this._getScopedStorageKey(storageKey, scope);
      const memoryEntry = this._getCacheEntry(cacheKey, scope);

      if (!scope) {
        return memoryEntry?.value ?? LS.Storage.get(scopedStorageKey, fallbackValue);
      }

      if (memoryEntry?.value && Date.now() - memoryEntry.time < this.CACHE_DURATION) {
        return memoryEntry.value;
      }

      const storedTime = this._getStoredTimestamp(storageKey, scope);
      if (storedTime && Date.now() - storedTime < this.CACHE_DURATION) {
        const storedValue = LS.Storage.get(scopedStorageKey, fallbackValue);
        this._setCacheEntry(cacheKey, scope, storedValue, storedTime);
        return storedValue;
      }

      try {
        const value = await fetcher();
        const now = Date.now();
        this._setCacheEntry(cacheKey, scope, value, now);
        LS.Storage.set(scopedStorageKey, value);
        LS.Storage.set(`${scopedStorageKey}:time`, now);
        return value;
      } catch (error) {
        console.error(`[Weather] ${cacheKey} fetch failed:`, error);
        return memoryEntry?.value ?? LS.Storage.get(scopedStorageKey, fallbackValue);
      }
    },

    async _fetchJson(url, options = {}) {
      const timeoutMs = resolveTimeout(options.timeoutMs, WEATHER_API_TIMEOUT_MS);
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timeoutId = 0;

      try {
        const response = await Promise.race([
          fetch(url, controller ? { signal: controller.signal } : {}),
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
              try {
                controller?.abort();
              } catch {
                // noop
              }
              reject(buildTimeoutError(timeoutMs));
            }, timeoutMs);
          })
        ]);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json().catch(() => null);
        if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
          throw new Error('Invalid weather response');
        }
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw buildTimeoutError(timeoutMs);
        }
        throw error;
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }
    }
  };
})();
