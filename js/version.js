(function (global) {
  'use strict';

  const versionInfo = Object.freeze({
    appId: 'livelysam',
    version: '1.1.2',
    releaseTag: 'v1.1.2',
    defaultChannel: 'stable',
    githubRepo: 'rochelobeJYJ/livelysam',
    installerBaseName: 'LivelySamSetup',
    installerFileName: 'LivelySamSetup-1.1.2.exe'
  });

  global.LivelySamVersion = versionInfo;
  global.LivelySam = global.LivelySam || {};
  global.LivelySam.VERSION_INFO = versionInfo;
  global.LivelySam.VERSION = versionInfo.version;
}(window));