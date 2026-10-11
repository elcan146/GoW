import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

export interface PagerHandle {
  scrollToPage: (i: number) => void;
}

interface Props {
  pages: React.ReactNode[];
  initialPage?: number;
  onPageChange?: (index: number) => void;
}

/**
 * Horizontal page swiper with edge arrows (left/right, vertically centered).
 * Pages are full-width; arrows hide at the first/last page.
 */
export const Pager = forwardRef<PagerHandle, Props>(function Pager(
  { pages, initialPage = 0, onPageChange },
  ref,
) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(initialPage);
  const [pagerH, setPagerH] = useState(0);
  const listRef = useRef<FlatList<React.ReactNode>>(null);

  const go = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, i));
      listRef.current?.scrollToIndex({ index: clamped, animated: true });
      if (clamped !== page) {
        setPage(clamped);
        onPageChange?.(clamped);
      }
    },
    [pages.length, page, onPageChange],
  );

  useImperativeHandle(ref, () => ({ scrollToPage: go }), [go]);

  return (
    <View
      style={styles.root}
      onLayout={(e) => setPagerH(e.nativeEvent.layout.height)}
    >
      <FlatList
        ref={listRef}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialPage}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          // Explicit pixel height: on web, CSS min-height:auto lets flex
          // children grow past the horizontal list's height, breaking
          // vertical scroll inside pages. Native (Yoga) is unaffected.
          <View style={{ width, height: pagerH || undefined }}>{item}</View>
        )}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== page) {
            setPage(i);
            onPageChange?.(i);
          }
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
});
