module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated worklets — must be listed last.
    plugins: ['react-native-reanimated/plugin'],
  };
};
