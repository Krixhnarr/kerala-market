import React from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { useTheme, FONT } from '../lib/theme';
import { fmt } from '../lib/api';

export function Card({ children, style }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

// Small grey uppercase caption - "INNOVATION", "Feature 01".
export function Label({ children, style, color }) {
  const t = useTheme();
  return <Text style={[s.label, { color: color || t.muted }, style]}>{children}</Text>;
}

export function H1({ children, style, color }) {
  const t = useTheme();
  return <Text style={[s.h1, { color: color || t.ink }, style]}>{children}</Text>;
}

export function H2({ children, right }) {
  const t = useTheme();
  return (
    <View style={s.h2row}>
      <Text style={[s.h2, { color: t.ink }]} numberOfLines={1}>{children}</Text>
      {right ? <Label style={{ marginBottom: 0 }}>{right}</Label> : null}
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
      <Text style={{ fontSize: size, color: on ? t.accent : (dim ? t.line : t.muted), lineHeight: size + 4 }}>{on ? '★' : '☆'}</Text>
    </Pressable>
  );
}

export function Change({ change, base, size = 12 }) {
  const t = useTheme();
  const st = { fontSize: size, fontFamily: FONT.medium, fontVariant: ['tabular-nums'] };
  if (change == null) return <Text style={[st, { color: t.muted }]}>—</Text>;
  const c = +change; const b = base == null ? null : +base;
  const pct = b ? ` (${(Math.abs(c) / b * 100).toFixed(1)}%)` : '';
  if (c > 0) return <Text style={[st, { color: t.up }]}>▲ {fmt(c)}{pct}</Text>;
  if (c < 0) return <Text style={[st, { color: t.down }]}>▼ {fmt(-c)}{pct}</Text>;
  return <Text style={[st, { color: t.muted }]}>0</Text>;
}

// Pill button. primary = red, dark = charcoal, otherwise outlined.
export function Button({ title, onPress, primary, dark, small, style, disabled }) {
  const t = useTheme();
  const bg = primary ? t.accent : dark ? t.panel : 'transparent';
  const fg = primary ? t.onAccent : dark ? t.onPanel : t.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [
      s.btn, small && s.btnSmall,
      { backgroundColor: bg, borderColor: primary ? t.accent : dark ? t.panel : t.ink, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      style,
    ]}>
      <Text style={{ color: fg, fontSize: small ? 12 : 14, fontFamily: FONT.bold, letterSpacing: 0.3 }}>{title}</Text>
    </Pressable>
  );
}

// Selectable pill (market tabs, chart ranges, households).
export function Chip({ title, on, onPress, right, style }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[s.chip, { backgroundColor: on ? t.ink : 'transparent', borderColor: on ? t.ink : t.line }, style]}>
      <Text style={{ color: on ? t.bg : t.ink, fontSize: 12, fontFamily: FONT.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{title}</Text>
      {right}
    </Pressable>
  );
}

export function Input({ style, ...props }) {
  const t = useTheme();
  return <TextInput placeholderTextColor={t.muted} {...props}
    style={[s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.bg, fontFamily: FONT.regular }, style]} />;
}

// Dark stat block: small caption over a big red figure.
export function Stat({ label, value, style }) {
  const t = useTheme();
  return (
    <View style={[s.stat, { backgroundColor: t.panel, borderColor: t.line }, style]}>
      <Label color={t.onPanel} style={{ opacity: 0.7 }}>{label}</Label>
      <Text style={{ color: t.accent, fontSize: 26, fontFamily: FONT.black, letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 2, padding: 14, marginBottom: 12 },
  label: { fontSize: 11, fontFamily: FONT.medium, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  h1: { fontSize: 34, fontFamily: FONT.black, letterSpacing: -1, textTransform: 'uppercase', lineHeight: 36 },
  h2row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  h2: { fontSize: 20, fontFamily: FONT.black, letterSpacing: -0.4, textTransform: 'uppercase', flexShrink: 1 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 8, fontFamily: FONT.regular },
  star: { paddingHorizontal: 4 },
  btn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  input: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  stat: { flex: 1, padding: 14, borderWidth: 1, borderRadius: 2, gap: 2 },
});
