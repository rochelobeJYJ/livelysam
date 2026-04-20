(function () {
  'use strict';
  // games-catalog.js is the generated source of truth; this file only bootstraps the hub from that data.

  try {
    const hub = window.LivelySam?.MinigamesHub;
    if (!hub?.ensureCatalogLoaded) return;
    const bootstrapOptions = {
      forceCatalog: true,
      preferRemote: true
    };

    const embeddedCatalog = window.LivelySamMinigameCatalog;
    if (Array.isArray(embeddedCatalog?.games) && embeddedCatalog.games.length) {
      const result = hub.syncCatalog(embeddedCatalog, {
        source: 'catalog',
        replaceExisting: true,
        render: false
      });

      if (result.registeredCount > 0) {
        hub.ensureCatalogLoaded(bootstrapOptions).catch((error) => {
          console.warn('[Minigames] Catalog bootstrap failed:', error);
        });
        return;
      }
    }

    hub.ensureCatalogLoaded(bootstrapOptions).catch((error) => {
      console.warn('[Minigames] Catalog bootstrap failed:', error);
    });
  } catch (error) {
    console.warn('[Minigames] Registry bootstrap crashed:', error);
  }
})();
