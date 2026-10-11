import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { installPolyfills } from './src/platform/polyfills';
import { hydrateStorage } from './src/platform/storage';

installPolyfills();

// 'main' must be registered synchronously — the native runtime calls
// AppRegistry.runApplication right after the bundle evaluates, so deferring
// registration behind the async storage hydrate leaves it unregistered
// ("Application main has not been registered"). Register a gate component
// instead: it hydrates the localStorage shim in an effect, then lazily
// requires App so the game store still evaluates only after hydration.
function Root() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    hydrateStorage()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const App = require('./src/App').default;
  // GestureHandlerRootView is required for react-native-gesture-handler.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
}

registerRootComponent(Root);
