import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import { itemIcon } from '../lib/icons';
import { Card, H2, Hint, Chip, Label, Change } from '../components/ui';

const COMPARE = 'compare';

// Shop rates reported by shopkeepers, shown per market (never per shop).
// One market: every item with today's median, source count, spread, freshness.
// Compare: every item across all markets, cheapest first.
export default function CommunityRates({ q = '', reloadKey = 0 }) {
  const t = useTheme();
  const [markets, setMarkets] = useState([]);
  const [rates, setRates] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [ms, rs] = await Promise.all([api.communityMarkets(), api.communityRates(null)]);
        setMarkets(ms); setRates(rs); setError('');
        setCurrent(c => c ?? (ms.length ? ms[0].id : null));
      } catch (e) { setError(e.message); }
    })();
  }, [reloadKey]);

  const term = q.trim().toLowerCase();
  const visible = useMemo(() => rates.filter(r => !term || r.item.toLowerCase().includes(term) || (r.item_ml || '').includes(q.trim()) || r.market.toLowerCase().includes(term)), [rates, q, term]);

  const marketRows = useMemo(() => visible.filter(r => r.market_id === current), [visible, current]);
  const bySide = side => marketRows.filter(r => r.side === side);

  // Compare: item -> markets sorted by price (retail only; a buyer wants the cheapest).
  const compare = useMemo(() => {
    const m = new Map();
    for (const r of visible.filter(r => r.side === 'retail')) {
      if (!m.has(r.item_id)) m.set(r.item_id, { item: r.item, item_ml: r.item_ml, unit: r.unit, rows: [] });
      m.get(r.item_id).rows.push(r);
    }
    return [...m.values()].map(g => ({ ...g, rows: g.rows.sort((a, b) => +a.price - +b.price) }));
  }, [visible]);

  const Row = ({ r, showMarket, best }) => (
    <View style={[s.row, { borderBottomColor: t.line }]}>
      <Text style={s.icon}>{showMarket ? (best ? '✓' : ' ') : itemIcon(r.item, r.item_ml)}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{showMarket ? r.market : r.item}</Text>
        <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }} numberOfLines={1}>
          {showMarket ? r.district : r.item_ml}{' · '}
          {r.n_shops === 1 ? 'admin-verified · 1 source' : `${r.n_shops} sources`}
          {+r.price_min !== +r.price_max ? ` · ₹${api.fmt(r.price_min)}–${api.fmt(r.price_max)}` : ''}
        </Text>
      </View>
      <View style={s.priceCol}>
        <Text style={[s.price, { color: best ? t.accent : t.ink }]} numberOfLines={1}>
          ₹{api.fmt(r.price)}<Text style={{ color: t.muted, fontFamily: FONT.regular, fontSize: 11 }}>/{r.unit}</Text>
        </Text>
        <Text style={{ color: t.muted, fontSize: 11, fontFamily: FONT.regular }}>{api.niceDate(r.rate_date)} · {api.ago(r.posted_at)}</Text>
        <Change change={r.prev_price != null ? +r.price - +r.prev_price : null} base={r.prev_price} size={11} />
      </View>
    </View>
  );

  return (
    <Card>
      <H2 right={rates.length ? `${new Set(rates.map(r => r.market_id)).size} markets` : ''}>Shop rates</H2>
      <Hint>What you pay at the market today, as reported by shopkeepers there. Each figure is the middle value across shops in that market; single-source figures are checked by the admin first.</Hint>
      {error ? <Text style={{ color: t.down, marginBottom: 8 }}>{error}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
        {markets.map(m => <Chip key={m.id} title={m.name} on={current === m.id} onPress={() => setCurrent(m.id)} />)}
        {markets.length > 1 && <Chip title="⇄ Compare" on={current === COMPARE} onPress={() => setCurrent(COMPARE)} />}
      </ScrollView>

      {current === COMPARE ? (
        !compare.length ? <Text style={{ color: t.muted, paddingVertical: 14, fontFamily: FONT.regular }}>Nothing to compare yet.</Text>
          : compare.map(g => (
            <View key={g.item}>
              <View style={[s.secRow, { borderTopColor: t.line }]}>
                <Text style={{ fontSize: 15 }}>{itemIcon(g.item, g.item_ml)} </Text>
                <Label style={{ marginBottom: 0 }} color={t.ink}>{g.item}</Label>
                <Text style={{ color: t.muted, fontSize: 11, marginLeft: 6 }}>{g.item_ml} · cheapest first</Text>
              </View>
              {g.rows.map((r, i) => <Row key={r.market_id} r={r} showMarket best={i === 0 && g.rows.length > 1} />)}
            </View>
          ))
      ) : (
        !marketRows.length ? (
          <Text style={{ color: t.muted, paddingVertical: 14, fontFamily: FONT.regular }}>
            {term ? `Nothing here matches “${q.trim()}”.` : 'No shop rates for this market yet. Shopkeepers post them from the Post rates tab.'}
          </Text>
        ) : (
          <>
            {bySide('retail').map(r => <Row key={`r${r.item_id}`} r={r} />)}
            {bySide('farmgate').length > 0 && (
              <>
                <View style={[s.secRow, { borderTopColor: t.line }]}>
                  <Label style={{ marginBottom: 0 }} color={t.muted}>Farm-gate · what these shops pay farmers</Label>
                </View>
                {bySide('farmgate').map(r => <Row key={`f${r.item_id}`} r={r} />)}
              </>
            )}
          </>
        )
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, paddingBottom: 12 },
  secRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 4, borderTopWidth: 2, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  name: { fontSize: 15, fontFamily: FONT.bold, letterSpacing: -0.2, textTransform: 'uppercase' },
  priceCol: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '46%' },
  price: { fontSize: 15, fontFamily: FONT.bold, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
});
