(function () {
  'use strict';

  window.LivelySamPublicConfig = window.LivelySamPublicConfig || {};
  window.LivelySamPublicConfig.dataServices = window.LivelySamPublicConfig.dataServices || {};

  const configuredProxyBaseUrl = typeof window.LivelySamPublicConfig.dataServices.proxyBaseUrl === 'string'
    ? window.LivelySamPublicConfig.dataServices.proxyBaseUrl.trim()
    : '';

  // Keep the default empty so local preview falls back to localhost and
  // production or staging can inject an explicit proxy endpoint.
  window.LivelySamPublicConfig.dataServices.proxyBaseUrl = configuredProxyBaseUrl;
})();
