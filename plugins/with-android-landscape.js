const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * No Android, `"orientation": "landscape"` trava a tela num lado só.
 * `sensorLandscape` deixa usar o celular deitado para qualquer um dos dois lados,
 * como o iPhone já faz.
 */
module.exports = function withAndroidLandscape(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:screenOrientation'] = 'sensorLandscape';
    return cfg;
  });
};
