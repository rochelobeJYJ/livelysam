(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.MealWidget = {
    _meals: [],
    _currentView: 'today', // today, tomorrow, week

    async init() {
      await this.loadMeals();
      this.render();
      this._bindEvents();
    },

    async loadMeals() {
      const atpt = LS.Config.get('atptCode');
      const school = LS.Config.get('schoolCode');
      if (!atpt || !school) {
        this._meals = [];
        return;
      }

      try {
        const monday = LS.NeisAPI.getMonday(new Date());
        this._meals = await LS.NeisAPI.getWeekMeals(atpt, school, monday);
        LS.Storage.set('cachedMeals', this._meals);
      } catch (e) {
        console.error('[Meal] 급식 로드 실패:', e);
        this._meals = LS.Storage.get('cachedMeals', []);
      }
    },

    _bindEvents() {
      document.querySelectorAll('.meal-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this._currentView = e.target.dataset.view;
          document.querySelectorAll('.meal-tab-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          this.render();
        });
      });
    },

    render() {
      const container = document.getElementById('meal-content');
      if (!container) return;

      const atpt = LS.Config.get('atptCode');
      if (!atpt) {
        container.innerHTML = '<div class="widget-empty"><p>⚙️ 설정에서 학교를 검색해주세요</p></div>';
        return;
      }

      if (this._meals.length === 0) {
        container.innerHTML = '<div class="widget-empty"><p>📭 급식 정보가 없습니다</p></div>';
        return;
      }

      const now = new Date();

      switch (this._currentView) {
        case 'today':
          this._renderDay(container, now);
          break;
        case 'tomorrow':
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          this._renderDay(container, tomorrow);
          break;
        case 'week':
          this._renderWeek(container);
          break;
      }
    },

    _renderDay(container, date) {
      const dateStr = LS.Helpers.formatDate(date, 'YYYYMMDD');
      const dayMeals = this._meals.filter(m => m.date === dateStr);

      if (dayMeals.length === 0) {
        const label = this._currentView === 'today' ? '오늘' : '내일';
        container.innerHTML = `<div class="widget-empty"><p>📭 ${label} 급식 정보가 없습니다</p></div>`;
        return;
      }

      let html = `<div class="meal-date-label">${LS.Helpers.formatDate(date, 'M월 D일 (요일)')}</div>`;

      dayMeals.forEach(meal => {
        const mealTypeEmoji = meal.mealType === '조식' ? '🌅' : meal.mealType === '중식' ? '☀️' : '🌙';
        const menuItems = LS.Helpers.parseMealMenu(meal.menu);
        const calorie = LS.Helpers.parseCalorie(meal.calorie);

        html += `<div class="meal-card">`;
        html += `<div class="meal-type">${mealTypeEmoji} ${meal.mealType}</div>`;
        html += '<ul class="meal-menu-list">';

        menuItems.forEach(item => {
          html += `<li class="meal-menu-item">`;
          html += `<span class="meal-item-name">${LS.Helpers.escapeHtml(item.name)}</span>`;
          if (item.allergens.length > 0) {
            html += '<span class="meal-allergens">';
            item.allergens.forEach(a => {
              const info = LS.Helpers.ALLERGENS[a];
              if (info) {
                html += `<span class="allergen-badge" title="${info.name}">${info.emoji}</span>`;
              }
            });
            html += '</span>';
          }
          html += '</li>';
        });

        html += '</ul>';
        if (calorie) {
          html += `<div class="meal-calorie">🔥 ${calorie}</div>`;
        }
        html += '</div>';
      });

      container.innerHTML = html;
    },

    _renderWeek(container) {
      const monday = LS.NeisAPI.getMonday(new Date());
      const dayLabels = ['월', '화', '수', '목', '금'];
      let html = '<div class="meal-week-grid">';

      for (let d = 0; d < 5; d++) {
        const date = new Date(monday);
        date.setDate(date.getDate() + d);
        const dateStr = LS.Helpers.formatDate(date, 'YYYYMMDD');
        const dayMeals = this._meals.filter(m => m.date === dateStr);
        const lunch = dayMeals.find(m => m.mealType === '중식');
        const dinner = dayMeals.find(m => m.mealType === '석식');
        const isToday = LS.Helpers.formatDate(new Date(), 'YYYYMMDD') === dateStr;

        html += `<div class="meal-week-day ${isToday ? 'meal-week-today' : ''}">`;
        html += `<div class="meal-week-day-label">${dayLabels[d]}</div>`;

        if (lunch || dinner) {
          const renderBrief = (type, mealObj, isBoth) => {
            if (!mealObj) return '';
            const items = LS.Helpers.parseMealMenu(mealObj.menu);
            let res = '<div class="meal-week-items">';
            if (isBoth) res += `<div style="font-size:0.7em;font-weight:600;color:var(--theme-accent);margin-top:2px;">[${type}]</div>`;
            
            const limit = isBoth ? 3 : 5;
            items.slice(0, limit).forEach(item => {
              res += `<div class="meal-week-item">${LS.Helpers.escapeHtml(item.name)}</div>`;
            });
            if (items.length > limit) {
              res += `<div class="meal-week-item meal-more">+${items.length - limit}개</div>`;
            }
            res += '</div>';
            return res;
          };

          const isBoth = !!(lunch && dinner);
          html += renderBrief('중식', lunch, isBoth);
          if (isBoth) html += '<div style="margin: 4px 0; border-top: 1px dashed rgba(0,0,0,0.1);"></div>';
          html += renderBrief('석식', dinner, isBoth);

        } else {
          html += '<div class="meal-week-empty">급식 없음</div>';
        }

        html += '</div>';
      }

      html += '</div>';
      container.innerHTML = html;
    },

    refresh() {
      this.loadMeals().then(() => this.render());
    }
  };
})();
