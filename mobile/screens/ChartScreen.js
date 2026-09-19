import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText, Circle } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import * as api from '../lib/api';
import { Card, H2, Hint } from '../components/ui';

const RANGES = [[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y'], [0, 'All']];
const MAX_SERIES = 4;

// selected: [{id, name, name_ml, market}] - managed by App so a tap on the
// Market tab can add an item and switch here.
export default function ChartScreen({ selected, setSelected }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [days, setDays] = useState(365);
  const [series, setSeries] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const since = days > 0 ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : '1970-01-01';
        const out = await Promise.all(selected.map(async s => ({ ...s, points: await api.itemHistory(s.id, since) })));
        if (live) { setSeries(out); setError(''); }
      } catch (e) { if (live) setError(e.message); }
    })();
    return () => { live = false; };
  }, [selected, days]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const h = setTimeout(async () => { try { setResults(await api.searchItems(term)); } catch {} }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const add = (item) => {
    if (selected.some(s => s.id === item.id)) return remove(item.id);
    const next = selected.length >= MAX_SERIES ? selected.slice(1) : selected;
    setSelected([...next, item]);
  };
  const remove = (id) => setSelected(selected.filter(s => s.id !== id));

  // ---- geometry: union of dates on X, shared ₹ scale on Y
  const chart = useMemo(() => {
    const labels = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort();
    const vals = series.flatMap(s => s.points.map(p => +p.price_low)).filter(Number.isFinite);
    if (!labels.length || !vals.length) return null;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const W = width - 28 - 30, H = 260, L = 54, R = 10, T = 10, B = 26;
    const x = i => L + (labels.length === 1 ? (W - L - R) / 2 : (i / (labels.length - 1)) * (W - L - R));
    const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const lines = series.map(s => {
      const by = new Map(s.points.map(p => [p.date, +p.price_low]));
      return labels.map((d, i) => by.has(d) ? [x(i), y(by.get(d))] : null);
    });
    const ticks = 5;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => lo + (i / ticks) * (hi - lo));
    const xTickIdx = labels.length <= 6 ? labels.map((_, i) => i)
      : Array.from({ length: 6 }, (_, i) => Math.round(i * (labels.length - 1) / 5));
    return { labels, lines, yTicks, xTickIdx, W, H, L, R, T, B, x, y };
  }, [series, width]);

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <H2>Price history</H2>
        <TextInput value={q} onChangeText={setQ} placeholder="Add item… (e.g. areca, കൊപ്ര, rubber)" placeholderTextColor={t.muted}
          style={[s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.bg }]} />
        {results.length > 0 && (
          <View style={[s.results, { borderColor: t.line, backgroundColor: t.surface }]}>
            {results.slice(0, 12).map(r => (
              <Pressable key={r.id} onPress={() => { add({ id: r.id, name: r.name, name_ml: r.name_ml, market: r.markets.name }); setQ(''); setResults([]); }} style={[s.result, { borderBottomColor: t.line }]}>
                <Text style={{ color: t.ink, fontSize: 14 }}>{r.name || r.name_ml}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{r.name_ml} · {r.markets.name}{r.section && r.section !== r.markets.name ? ' / ' + r.section : ''}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={s.rangeRow}>
          {RANGES.map(([d, label]) => (
            <Pressable key={d} onPress={() => setDays(d)} style={[s.range, { backgroundColor: days === d ? t.accent : 'transparent' }]}>
              <Text style={{ color: days === d ? t.onAccent : t.ink, fontSize: 13 }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.chips}>
          {selected.map((sel, i) => (
            <View key={sel.id} style={[s.chip, { borderColor: t.line, backgroundColor: t.bg }]}>
              <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: t.series[i] }} />
              <Text style={{ color: t.ink, fontSize: 13 }}>{sel.name || sel.name_ml} <Text style={{ color: t.muted }}>· {sel.market}</Text></Text>
              <Pressable onPress={() => remove(sel.id)} hitSlop={8}><Text style={{ color: t.muted, fontSize: 15 }}>×</Text></Pressable>
            </View>
          ))}
        </View>

        {error ? <Text style={{ color: t.down }}>Error: {error}</Text> : null}
        {!selected.length ? (
          <Text style={{ color: t.muted, paddingVertical: 30, textAlign: 'center' }}>Tap any price on the Market tab, or search above, to chart it. Up to 4 items.</Text>
        ) : !chart ? (
          <Text style={{ color: t.muted, paddingVertical: 30, textAlign: 'center' }}>Loading…</Text>
        ) : (
          <Svg width={chart.W} height={chart.H}>
            {chart.yTicks.map((v, i) => (
              <React.Fragment key={i}>
                <Line x1={chart.L} x2={chart.W - chart.R} y1={chart.y(v)} y2={chart.y(v)} stroke={t.grid} strokeWidth={1} />
                <SvgText x={chart.L - 6} y={chart.y(v) + 4} fontSize={10} fill={t.secondary} textAnchor="end">₹{api.fmt(Math.round(v))}</SvgText>
              </React.Fragment>
            ))}
            {chart.xTickIdx.map(i => (
              <SvgText key={i} x={chart.x(i)} y={chart.H - 8} fontSize={10} fill={t.secondary}
                textAnchor={i === 0 ? 'start' : i === chart.labels.length - 1 ? 'end' : 'middle'}>{chart.labels[i]}</SvgText>
            ))}
            {chart.lines.map((pts, si) => {
              // Break the polyline at gaps so missing days don't draw a false slope.
              const segs = []; let cur = [];
              for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
              if (cur.length) segs.push(cur);
              return segs.map((seg, k) => seg.length === 1
                ? <Circle key={`${si}-${k}`} cx={seg[0][0]} cy={seg[0][1]} r={3} fill={t.series[si]} />
                : <Polyline key={`${si}-${k}`} points={seg.map(p => p.join(',')).join(' ')} fill="none" stroke={t.series[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />);
            })}
          </Svg>
        )}
        <Hint>Prices in ₹ as printed by Manorama (mostly per quintal = 100 kg; gold per sovereign). Where a range is printed, the lower value is charted.</Hint>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 14, paddingBottom: 40 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  results: { borderWidth: 1, borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  result: { paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 1 },
  rangeRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  range: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderRadius: 999 },
});
