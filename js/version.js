(function (global) {
  'use strict';

  const versionInfo = Object.freeze({
    appId: 'livelysam',
    version: '1.0.5',
    releaseTag: 'v1.0.5',
    defaultChannel: 'stable',
    githubRepo: 'rochelobeJYJ/livelysam',
    installerBaseName: 'LivelySamSetup',
    installerFileName: 'LivelySamSetup-1.0.5.exe'
  });

  global.LivelySamVersion = versionInfo;
  global.LivelySam = global.LivelySam || {};
  global.LivelySam.VERSION_INFO = versionInfo;
  global.LivelySam.VERSION = versionInfo.version;
}(window));