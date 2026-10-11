import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cardImage } from '../assets';
import { BACKGROUNDS } from '../game/backgrounds';
import { useGameStore } from '../game/store';
import type { AbilityKind } from '../game/types';
import { colors, RARITY_COLOR, RARITY_LABEL } from '../theme';

const KIND_LABEL: Record<AbilityKind, string> = {
  none: 'No Ability',
  onReveal: 'On Reveal',
  ongoing: 'Ongoing',
  chaos: 'Chaos',
  spy: 'Spy',
  medic: 'Medic',
  muster: 'Muster',
  move: 'Move',
  factionBond: 'Faction Bond',
  hero: 'Hero',
};

/** Centered card-detail window — opened by long-pressing any card.
 *  Springs in (scale + fade), fades out on close. Overlays whatever screen
 *  is active (deck builder, deck menu, board) since it's mounted at App root. */
export function CardInspector() {
  const inspected = useGameStore((s) => s.inspected);
  const closeInspector = useGameStore((s) => s.closeInspector);
  const anim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  // Pop in whenever a new card is inspected.
  useEffect(() => {
    if (!inspected) return;
    closingRef.current = false;
    anim.setValue(0);
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 90,
    }).start();
  }, [inspected, anim]);

  if (!inspected) return null;
  const { def, bonus, power } = inspected;
  const shownPower = Math.max(0, power ?? def.power + bonus);
  const tint = RARITY_COLOR[def.rarity];
  const background = BACKGROUNDS[def.id];
  const art = cardImage(def.art);

  // Animate out, then clear the store so the modal unmounts after the tween.
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(anim, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => closeInspector());
  };

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Modal transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        {/* Tap outside the window to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />

        <Animated.View
          style={[styles.window, { opacity: anim, transform: [{ scale }, { translateY }] }]}
        >
          {/* X close button */}
          <Pressable onPress={close} style={styles.xBtn} hitSlop={10}>
            <Text style={styles.xText}>✕</Text>
          </Pressable>

          <View style={styles.body}>
            <View style={[styles.artWrap, { borderColor: tint }]}>
              {art && <Image source={art} style={styles.art} resizeMode="cover" />}
              <View style={[styles.coin, { borderColor: tint }]}>
                <Text style={styles.coinText}>{shownPower}</Text>
              </View>
            </View>

            <ScrollView style={styles.details} showsVerticalScrollIndicator={false}>
              <Text style={styles.name}>{def.name}</Text>
              <Text style={[styles.rarity, { color: tint }]}>
                {RARITY_LABEL[def.rarity]} · {def.faction}
              </Text>

              <View style={styles.block}>
                <Text style={styles.blockLabel}>Power</Text>
                <Text style={styles.blockValue}>
                  {shownPower}
                  {bonus !== 0 && (
                    <Text style={{ color: bonus > 0 ? '#34d399' : colors.bloodNeon }}>
                      {' '}
                      ({def.power} {bonus > 0 ? `+${bonus}` : bonus})
                    </Text>
                  )}
                </Text>
              </View>

              <View style={styles.block}>
                <Text style={styles.blockLabel}>{KIND_LABEL[def.kind]}</Text>
                <Text style={styles.blockText}>{def.text}</Text>
              </View>

              {background && (
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>Background</Text>
                  <Text style={styles.lore}>{background}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  window: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '86%',
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.bloodDim,
    borderRadius: 8,
    padding: 14,
    // subtle neon edge glow
    shadowColor: colors.bloodNeon,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  xBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.bloodNeon,
    backgroundColor: 'rgba(42,6,11,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xText: {
    color: colors.bloodNeon,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: 'monospace',
    marginTop: -1,
  },
  body: {
    flexDirection: 'row',
    gap: 14,
  },
  artWrap: {
    width: 150,
    height: 210,
    borderWidth: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#14101a',
  },
  art: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coin: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: '#16121a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinText: { color: colors.chromeBright, fontSize: 16, fontWeight: '900', fontFamily: 'monospace' },
  details: { flex: 1 },
  name: { color: colors.chromeBright, fontSize: 20, fontWeight: '900', letterSpacing: 0.5, paddingRight: 30 },
  rarity: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  block: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  blockLabel: {
    color: 'rgba(255,42,60,0.6)',
    fontSize: 9,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  blockValue: { color: colors.chromeBright, fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  blockText: { marginTop: 3, color: 'rgba(232,236,241,0.9)', fontSize: 12, lineHeight: 17 },
  lore: { marginTop: 3, color: colors.chrome, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
});
