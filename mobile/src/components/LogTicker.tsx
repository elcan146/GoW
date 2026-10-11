import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../game/store';
import { colors } from '../theme';

/** Bottom event ticker — last two log entries. */
export function LogTicker() {
  const log = useGameStore((s) => s.log);
  return (
    <View style={styles.bar}>
      <Text style={styles.arrow}>▸▸</Text>
      {log.slice(0, 2).map((entry, i) => (
        <Text key={i} numberOfLines={1} style={styles.entry}>
          {entry}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 22,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.55)',
    overflow: 'hidden',
  },
  arrow: { color: colors.chromeDark, fontSize: 9, fontFamily: 'monospace' },
  entry: {
    flexShrink: 1,
    color: 'rgba(255,42,60,0.5)',
    fontSize: 9,
    fontFamily: 'monospace',
  },
});
