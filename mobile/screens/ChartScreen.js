import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText, Circle, Polygon } from 'react-native-svg';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import { itemIcon } from '../lib/icons';
import { Card, H2, Hint, Chip, Input, Label } from '../components/ui';

const RANGES = [[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y'], [0, 'All']];
const MAX_SERIES = 4;
const DAY = 864e5;

// selected: [{id, name, name_ml, market, unit}] - managed by App so a tap on
// the Market tab can add an item and switch here. user: for overlaying sales.
export default function ChartScreen({ selected, setSelected, user }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [days, setDays] = useState(365);
  const [series, setSeries] = useState([]);
  const [sales, setSales] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);   // index into chart.labels

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const since = days > 0 ? new Date(Date.now() - days * DAY).toISOString().slice(0, 10) : '1970-01-01';
        const missing = selected.filter(s => s.unit === undefined).map(s => s.id);
        const units = await api.itemUnits(missing);
        const out = await Promise.all(selected.map(async s => ({ ...s, unit: s.unit ?? units[s.id] ?? null, points: await api.itemHistory(s.id, since) })));
        if (live) { setSeries(out); setError(''); setCursor(null); }
      } catch (e) { if (live) setError(e.message); }
    })();
    return () => { live = false; };
  }, [selected, days]);

  // The user's own sales, to mark on the chart. Failure here (e.g. the ledger
  // table not migrated yet) must not take the chart down.
  useEffect(() => {
    if (!user || !selected.length) { setSales([]); return; }
    api.ledgerEntries().then(setSales).catch(() => setSales([]));
  }, [user, selected]);

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
    const first = labels[0], last = labels[labels.length - 1];
    const sLo = Math.min(...vals), sHi = Math.max(...vals);

    // Sales matched to a series: by item id, else by name. Converted to the
    // chart's unit (₹/kg × 100 for per-quintal items) and kept only when they
    // land in the same order of magnitude as the line, so one odd entry can't
    // squash the whole chart.
    const marks = [];
    series.forEach((s, si) => {
      const nm = (s.name || '').toLowerCase();
      for (const e of sales) {
        const byId = e.item_id != null && e.item_id === s.id;
        const en = (e.item_name || '').toLowerCase();
        const byName = e.item_id == null && nm && en && (nm.includes(en) || en.includes(nm));
        if (!(byId || byName) || !(+e.quantity_kg > 0)) continue;
        if (e.entry_date < first || e.entry_date > last) continue;
        const perKg = +e.amount / +e.quantity_kg;
        const v = s.unit === 'quintal' ? perKg * 100 : perKg;
        if (v < sLo * 0.3 || v > sHi * 3) continue;
        marks.push({ si, date: e.entry_date, v, perKg, kg: +e.quantity_kg, amount: +e.amount, household_id: e.household_id });
      }
    });

    let lo = Math.min(sLo, ...marks.map(m => m.v)), hi = Math.max(sHi, ...marks.map(m => m.v));
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const W = width - 24 - 30, H = 260, L = 54, R = 10, T = 10, B = 26;
    const x = i => L + (labels.length === 1 ? (W - L - R) / 2 : (i / (labels.length - 1)) * (W - L - R));
    const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    // Fractional index for a date that isn't a trading day (Sunday sales).
    const idxOf = (d) => {
      const i = labels.indexOf(d);
      if (i >= 0) return i;
      const j = labels.findIndex(l => l > d);
      if (j <= 0) return j === 0 ? 0 : labels.length - 1;
      const a = Date.parse(labels[j - 1]), b = Date.parse(labels[j]);
      return j - 1 + (Date.parse(d) - a) / (b - a);
    };
    const lines = series.map(s => {
      const by = new Map(s.points.map(p => [p.date, +p.price_low]));
      return labels.map((d, i) => by.has(d) ? [x(i), y(by.get(d))] : null);
    });
    const ticks = 5;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => lo + (i / ticks) * (hi - lo));
    const xTickIdx = labels.length <= 5 ? labels.map((_, i) => i)
      : Array.from({ length: 5 }, (_, i) => Math.round(i * (labels.length - 1) / 4));
    const markPts = marks.map(m => ({ ...m, px: x(idxOf(m.date)), py: y(m.v) }));
    return { labels, lines, yTicks, xTickIdx, marks: markPts, W, H, L, R, T, B, x, y };
  }, [series, sales, width]);

  // Nearest date to a touch.
  const onTouch = (e) => {
    if (!chart) return;
    const lx = e.nativeEvent.locationX;
    const n = chart.labels.length;
    const span = chart.W - chart.L - chart.R;
    const i = n === 1 ? 0 : Math.round(((lx - chart.L) / span) * (n - 1));
    setCursor(Math.max(0, Math.min(n - 1, i)));
  };
  const cursorDate = chart && cursor != null ? chart.labels[cursor] : null;
  const cursorSales = chart && cursorDate ? chart.marks.filter(m => m.date === cursorDate) : [];

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <H2>Price history</H2>
        <Input value={q} onChangeText={setQ} placeholder="Add item… (e.g. areca, കൊപ്ര, rubber)" style={{ marginBottom: 8 }} />
        {results.length > 0 && (
          <View style={[s.results, { borderColor: t.line, backgroundColor: t.surface }]}>
            {results.slice(0, 12).map(r => (
              <Pressable key={r.id} onPress={() => { add({ id: r.id, name: r.name, name_ml: r.name_ml, market: r.markets.name, unit: r.unit }); setQ(''); setResults([]); }} style={[s.result, { borderBottomColor: t.line }]}>
                <Text style={{ color: t.ink, fontSize: 14, fontFamily: FONT.bold, textTransform: 'uppercase' }}>{itemIcon(r.name, r.name_ml)}  {r.name || r.name_ml}</Text>
                <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }}>{r.name_ml} · {r.markets.name}{r.section && r.section !== r.markets.name ? ' / ' + r.section : ''}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={s.rangeRow}>
          {RANGES.map(([d, label]) => <Chip key={d} title={label} on={days === d} onPress={() => setDays(d)} style={{ paddingHorizontal: 10, paddingVertical: 4 }} />)}
        </View>

        <View style={s.chips}>
          {selected.map((sel, i) => (
            <View key={sel.id} style={[s.chip, { borderColor: t.line }]}>
              <View style={{ width: 14, height: 3, backgroundColor: t.series[i] }} />
              <Text style={{ color: t.ink, fontSize: 12, fontFamily: FONT.medium }}>{sel.name || sel.name_ml} <Text style={{ color: t.muted }}>· {sel.market}</Text></Text>
              <Pressable onPress={() => remove(sel.id)} hitSlop={8}><Text style={{ color: t.muted, fontSize: 15 }}>×</Text></Pressable>
            </View>
          ))}
        </View>

        {error ? <Text style={{ color: t.down }}>Error: {error}</Text> : null}
        {!selected.length ? (
          <Text style={{ color: t.muted, paddingVertical: 30, textAlign: 'center', fontFamily: FONT.regular }}>Tap any price on the Market tab, or search above, to chart it. Up to 4 items.</Text>
        ) : !chart ? (
          <Text style={{ color: t.muted, paddingVertical: 30, textAlign: 'center', fontFamily: FONT.regular }}>Loading…</Text>
        ) : (
          <View onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
            onResponderGrant={onTouch} onResponderMove={onTouch}>
            <Svg width={chart.W} height={chart.H}>
              {chart.yTicks.map((v, i) => (
                <React.Fragment key={i}>
                  <Line x1={chart.L} x2={chart.W - chart.R} y1={chart.y(v)} y2={chart.y(v)} stroke={t.grid} strokeWidth={1} />
                  <SvgText x={chart.L - 6} y={chart.y(v) + 4} fontSize={10} fill={t.secondary} textAnchor="end">₹{api.fmt(Math.round(v))}</SvgText>
                </React.Fragment>
              ))}
              {chart.xTickIdx.map(i => (
                <SvgText key={i} x={chart.x(i)} y={chart.H - 8} fontSize={10} fill={t.secondary}
                  textAnchor={i === 0 ? 'start' : i === chart.labels.length - 1 ? 'end' : 'middle'}>{chart.labels[i].slice(2)}</SvgText>
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
              {chart.marks.map((m, k) => (
                <Polygon key={k} points={`${m.px},${m.py - 6} ${m.px + 6},${m.py} ${m.px},${m.py + 6} ${m.px - 6},${m.py}`}
                  fill={t.series[m.si]} stroke={t.surface} strokeWidth={1.5} />
              ))}
              {cursor != null && (
                <>
                  <Line x1={chart.x(cursor)} x2={chart.x(cursor)} y1={chart.T} y2={chart.H - chart.B} stroke={t.ink} strokeWidth={1} strokeDasharray="3,3" />
                  {chart.lines.map((pts, si) => pts[cursor]
                    ? <Circle key={si} cx={pts[cursor][0]} cy={pts[cursor][1]} r={4.5} fill={t.series[si]} stroke={t.surface} strokeWidth={2} />
                    : null)}
                </>
              )}
            </Svg>
          </View>
        )}

        {chart && (
          <View style={[s.readout, { backgroundColor: t.panel }]}>
            {cursor == null ? (
              <Text style={{ color: t.onPanel, opacity: 0.7, fontSize: 12, fontFamily: FONT.regular }}>Touch or drag on the chart to read a day's prices.</Text>
            ) : (
              <>
                <Label color={t.onPanel} style={{ opacity: 0.7, marginBottom: 4 }}>{api.niceDate(cursorDate)} · {cursorDate}</Label>
                {series.map((sr, si) => {
                  const p = sr.points.find(pt => pt.date === cursorDate);
                  return (
                    <View key={sr.id} style={s.readRow}>
                      <View style={{ width: 10, height: 3, backgroundColor: t.series[si] }} />
                      <Text style={{ flex: 1, color: t.onPanel, fontSize: 13, fontFamily: FONT.medium }} numberOfLines={1}>{sr.name || sr.name_ml}</Text>
                      <Text style={{ color: t.onPanel, fontSize: 14, fontFamily: FONT.bold, fontVariant: ['tabular-nums'] }}>
                        {p ? '₹' + api.fmt(p.price_low) + (p.price_high != null && +p.price_high !== +p.price_low ? '–' + api.fmt(p.price_high) : '') : '—'}
                      </Text>
                    </View>
                  );
                })}
                {cursorSales.map((m, k) => (
                  <View key={k} style={s.readRow}>
                    <Text style={{ color: t.series[m.si], fontSize: 12 }}>◆</Text>
                    <Text style={{ flex: 1, color: t.accent, fontSize: 13, fontFamily: FONT.medium }}>Your sale · {api.fmt(m.kg)} kg for ₹{api.fmt(m.amount)}</Text>
                    <Text style={{ color: t.accent, fontSize: 13, fontFamily: FONT.bold }}>₹{api.fmt(m.perKg)}/kg</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
        {chart?.marks.length ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 6, fontFamily: FONT.regular }}>◆ your sales from My Sales, placed at the ₹ per kg you received (× 100 on per-quintal charts).</Text> : null}
        <Hint>Prices in ₹ as published (mostly per quintal = 100 kg; gold per sovereign). Where a range is printed, the lower value is charted.</Hint>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 12, paddingBottom: 40 },
  results: { borderWidth: 1, borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  result: { paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 1 },
  rangeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 9, borderWidth: 1, borderRadius: 999 },
  readout: { marginTop: 8, padding: 12, borderRadius: 2, gap: 4 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
