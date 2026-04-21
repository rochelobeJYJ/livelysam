(function () {
  'use strict';

  window.LivelySamPublicConfig = window.LivelySamPublicConfig || {};
  window.LivelySamPublicConfig.dataServices = window.LivelySamPublicConfig.dataServices || {};

  const configuredProxyBaseUrl = typeof window.LivelySamPublicConfig.dataServices.proxyBaseUrl === 'string'
    ? window.LivelySamPublicConfig.dataServices.proxyBaseUrl.trim()
    : '';
  const defaultProxyBaseUrl = 'https://livelysam-data-proxy-477938837801.asia-northeast3.run.app';

  // NEIS and default weather requests share the same public data proxy URL.
  window.LivelySamPublicConfig.dataServices.proxyBaseUrl = configuredProxyBaseUrl || defaultProxyBaseUrl;
})();