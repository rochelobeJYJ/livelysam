(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
  const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

  function createCacheBucket() {
    return Object.create(null);
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

    async geocode(address) {
      if (!String(address || '').trim()) return null;

      try {
        if (!this.usesDirectKey()) {
          const payload = await LS.DataService.fetchJson('weather/geocode', { address });
          return payload?.location || null;
        }

        const url = `${GEO_BASE}/direct?q=${encodeURIComponent(address)},KR&limit=1&appid=${this.apiKey}`;
        const data = await this._fetchJson(url);
        if (Array.isArray(data) && data.length > 0) {
          return {
            lat: data[0].lat,
            lon: data[0].lon,
            name: data[0].local_names?.ko || data[0].name
          };
        }
        return null;
      } catch (error) {
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
        const url = `${OWM_BASE}/weather?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric&lang=kr`;
        const data = await this._fetchJson(url);

        return {
          temp: Math.round(data.main.temp),
          feelsLike: Math.round(data.main.feels_like),
          tempMin: Math.round(data.main.temp_min),
          tempMax: Math.round(data.main.temp_max),
          humidity: data.main.humidity,
          pressure: data.main.pressure,
          description: data.weather[0]?.description || '',
          icon: data.weather[0]?.icon || '',
          windSpeed: data.wind?.speed || 0,
          windGust: data.wind?.gust || 0,
          visibilityKm: Math.round(((data.visibility || 0) / 1000) * 10) / 10,
          clouds: data.clouds?.all || 0,
          cityName: data.name,
          sunrise: data.sys?.sunrise ? data.sys.sunrise * 1000 : null,
          sunset: data.sys?.sunset ? data.sys.sunset * 1000 : null,
          updatedAt: Date.now()
        };
      }, null);
    },

    async getForecast() {
      if (!this.usesDirectKey()) {
        const bundle = await this._getProxyBundle();
        return Array.isArray(bundle?.forecast) ? bundle.forecast : [];
      }

      const list = await this._getForecastList();
      return list.slice(0, 6).map((item) => this._mapForecastEntry(item));
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
        const url = `${OWM_BASE}/air_pollution?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}`;
        const data = await this._fetchJson(url);
        const first = data.list?.[0];
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
        time: item.dt * 1000
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
        return payload?.bundle || null;
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
        const url = `${OWM_BASE}/forecast?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric&lang=kr`;
        const data = await this._fetchJson(url);
        return Array.isArray(data.list) ? data.list : [];
      }, []);
    },

    async _getAirQualityForecastList() {
      return this._fetchCachedResource('airQualityForecastRaw', 'cachedAirQualityForecastRaw', async () => {
        const url = `${OWM_BASE}/air_pollution/forecast?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}`;
        const data = await this._fetchJson(url);
        return Array.isArray(data.list) ? data.list : [];
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

    async _fetchJson(url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    }
  };
})();
