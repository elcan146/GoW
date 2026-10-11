const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// zustand's ESM build uses `import.meta.env`, which crashes Expo's web bundle
// (loaded as a classic script). Resolve zustand to its CJS build on web only.
const zustandRoot = path.dirname(require.resolve('zustand/package.json'));
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const file =
      moduleName === 'zustand' ? 'index.js' : moduleName.slice('zustand/'.length) + '.js';
    return { type: 'sourceFile', filePath: path.join(zustandRoot, file) };
  }
  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
