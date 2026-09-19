import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import { fmt } from '../lib/api';

export function Card({ children, style }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

export function H2({ children, right }) {
  const t = useTheme();
  return (
    <View style={s.h2row}>
      <Text style={[s.h2, { color: t.ink }]}>{children}</Text>
      {right ? <Text style={[s.h2right, { color: t.muted }]}>{right}</Text> : null}
    </View>
  );
}

export function Hint({ children }) {
  const t = useTheme();
  return <Text style={[s.hint, { color: t.muted }]}>{children}</Text>;
}

// ☆/★ toggle used at all three levels (market, sub-market, item).
export function Star({ on, onPress, size = 18, dim = false }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={s.star} accessibilityRole="button"
      accessibilityLabel={on ? 'Remove from favourites' : 'Add to favourites'}>
      <Text style={{ fontSize: size, color: on ? t.gold : (dim ? t.line : t.muted), lineHeight: size + 4 }}>{on ? '★' : '☆'}</Text>
    </Pressable>
  );
}

export function Change({ change, base }) {
  const t = useTheme();
  if (change == null) return <Text style={{ color: t.muted, fontSize: 12 }}>—</Text>;
  const c = +change; const b = base == null ? null : +base;
  const pct = b ? ` (${(c / b * 100).toFixed(1)}%)` : '';
  if (c > 0) return <Text style={{ color: t.up, fontSize: 12 }}>▲ {fmt(c)}{pct}</Text>;
  if (c < 0) return <Text style={{ color: t.down, fontSize: 12 }}>▼ {fmt(-c)}{pct}</Text>;
  return <Text style={{ color: t.muted, fontSize: 12 }}>0</Text>;
}

export function Button({ title, onPress, primary, small, style, disabled }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [
      s.btn, small && s.btnSmall,
      { backgroundColor: primary ? t.accent : t.surface, borderColor: primary ? t.accent : t.line, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      style,
    ]}>
      <Text style={{ color: primary ? t.onAccent : t.ink, fontSize: small ? 13 : 15, fontWeight: '500' }}>{title}</Text>
    </Pressable>
  );
}

// Thick-and-thin gold stripe: the kasavu border of a Kerala mundu.
export function Kasavu() {
  const t = useTheme();
  return (
    <View style={{ opacity: 0.85 }}>
      <View style={{ height: 3, backgroundColor: t.gold }} />
      <View style={{ height: 1 }} />
      <View style={{ height: 2, backgroundColor: t.gold }} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  h2row: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: '600' },
  h2right: { fontSize: 13, flexShrink: 1 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  star: { paddingHorizontal: 4 },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  btnSmall: { paddingVertical: 5, paddingHorizontal: 10 },
});
