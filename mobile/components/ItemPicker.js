import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import { itemIcon } from '../lib/icons';
import { Input, Label } from './ui';

// Full-screen overlay listing every market item, filtered as you type.
// onPick({name, id, unit}); a free-text name is allowed for things the feed
// doesn't carry (id null - it just won't be marked on a chart).
export default function ItemPicker({ visible, onClose, onPick }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) { setQ(''); return; }
    if (items) return;
    api.allItems().then(setItems).catch(e => setError(e.message));
  }, [visible, items]);
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  const term = q.trim().toLowerCase();
  const list = useMemo(() => {
    if (!items) return [];
    if (!term) return items;
    const score = (it) => {
      const n = (it.name || '').toLowerCase(), m = it.name_ml || '', sec = (it.section || '').toLowerCase(), mk = it.markets.name.toLowerCase();
      if (n === term) return 0;
      if (n.startsWith(term)) return 1;
      if (n.includes(term) || m.includes(q.trim())) return 2;
      if (sec.includes(term) || mk.includes(term)) return 3;
      return 9;
    };
    return items.map(it => [score(it), it]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0]).map(([, it]) => it);
  }, [items, term, q]);

  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]}>
      <View style={[s.head, { borderBottomColor: t.line }]}>
        <View style={{ flex: 1 }}>
          <Label style={{ marginBottom: 2 }}>Choose an item</Label>
          <Input value={q} onChangeText={setQ} placeholder="Search — coconut, അടയ്ക്ക, rubber, Kochi…" autoFocus />
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={{ paddingLeft: 12, paddingTop: 14 }}><Text style={{ color: t.ink, fontSize: 26, lineHeight: 28 }}>×</Text></Pressable>
      </View>
      {error ? <Text style={{ color: t.down, padding: 14 }}>{error}</Text> : null}
      {!items && !error ? <Text style={{ color: t.muted, padding: 14, fontFamily: FONT.regular }}>Loading items…</Text> : null}
      <FlatList
        data={list}
        keyExtractor={it => String(it.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListHeaderComponent={q.trim() ? (
          <Pressable onPress={() => onPick({ name: q.trim(), id: null, unit: null })} style={[s.row, { borderBottomColor: t.line, backgroundColor: t.surface }]}>
            <Text style={s.icon}>✎</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.name, { color: t.ink }]}>Use “{q.trim()}”</Text>
              <Text style={[s.sub, { color: t.muted }]}>Not a market item — recorded by name only</Text>
            </View>
          </Pressable>
        ) : null}
        ListEmptyComponent={items ? <Text style={{ color: t.muted, padding: 14, fontFamily: FONT.regular }}>No items match.</Text> : null}
        renderItem={({ item: it }) => (
          <Pressable onPress={() => onPick({ name: it.name || it.name_ml, id: it.id, unit: it.unit })} style={[s.row, { borderBottomColor: t.line }]}>
            <Text style={s.icon}>{itemIcon(it.name, it.name_ml)}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{it.name || it.name_ml}</Text>
              <Text style={[s.sub, { color: t.muted }]} numberOfLines={1}>
                {it.name && it.name_ml ? it.name_ml + ' · ' : ''}{it.markets.name}{it.section && it.section !== it.markets.name ? ' / ' + it.section : ''}
                {it.unit === 'quintal' ? ' · per quintal' : it.unit === 'sovereign' ? ' · per pavan' : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1 },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  name: { fontSize: 15, fontFamily: FONT.bold, textTransform: 'uppercase', letterSpacing: -0.2 },
  sub: { fontSize: 12, fontFamily: FONT.regular },
});
