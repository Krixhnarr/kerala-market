import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import { itemIcon } from '../lib/icons';
import { Card, H2, Hint, Star, Change, Chip, Label, Input } from '../components/ui';

const FAV = 'fav';
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function MarketScreen({ user, requireUser, onChartItem, onStatus }) {
  const t = useTheme();
  const [status, setStatus] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [favMarkets, setFavMarkets] = useState(new Set());
  const [favCount, setFavCount] = useState(0);
  const [current, setCurrent] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);   // all-market search results

  // Search across every market: item names -> latest price for each.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound(null); return; }
    let live = true;
    const h = setTimeout(async () => {
      try {
        const items = await api.searchItems(term);
        const sum = await api.itemSummary(items.map(i => i.id));
        const order = new Map(items.map((i, k) => [i.id, k]));
        if (live) setFound(sum.sort((a, b) => order.get(a.item_id) - order.get(b.item_id)));
      } catch (e) { if (live) setError(e.message); }
    }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [q]);

  const loadTop = useCallback(async () => {
    try {
      const [st, ms, fm, fc] = await Promise.all([
        api.dataStatus(), api.markets(),
        user ? api.favouriteMarketIds() : [], user ? api.favouriteCounts() : 0,
      ]);
      setStatus(st); setMarkets(ms); setFavMarkets(new Set(fm)); setFavCount(fc); setError('');
      onStatus?.(st);
    } catch (e) { setError(e.message); }
  }, [user, onStatus]);

  const loadRows = useCallback(async (marketId) => {
    if (marketId == null) return;
    try {
      setRows(marketId === FAV ? await api.favouriteRates() : await api.marketRates(marketId));
      setError('');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { loadTop(); }, [loadTop]);

  // Favourites first, then the feed's own order; the first tab is the default view.
  const ordered = useMemo(() => [...markets]
    .map(m => ({ ...m, fav: favMarkets.has(m.id) }))
    .sort((a, b) => (b.fav - a.fav) || (a.rank - b.rank) || (a.id - b.id)), [markets, favMarkets]);

  useEffect(() => {
    if (!ordered.length) return;
    if (current === FAV && !favCount) { setCurrent(null); return; }
    const id = current ?? (favCount ? FAV : ordered[0].id);
    if (current == null) setCurrent(id);
    loadRows(id);
  }, [ordered, current, favCount, loadRows]);

  const refresh = async () => { setRefreshing(true); await loadTop(); await loadRows(current); setRefreshing(false); };
  const afterToggle = async () => { await loadTop(); await loadRows(current); };

  const toggleMarket = (m) => async () => {
    if (!requireUser()) return;
    await api.setFavMarket(user.id, m.id, !m.fav); afterToggle();
  };
  const toggleSection = (r) => async () => {
    if (!requireUser()) return;
    await api.setFavSection(user.id, r.market_id, r.section, !r.fav_section); afterToggle();
  };
  const toggleItem = (r) => async () => {
    if (!requireUser()) return;
    await api.setFavItem(user.id, r.item_id, !r.fav_item); afterToggle();
  };

  const favView = current === FAV;
  // Group rows: starred items first under one heading, then sections in feed order.
  // A search term narrows the open market's rows instantly.
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hit = r => !term || (r.name || '').toLowerCase().includes(term) || (r.name_ml || '').includes(q.trim()) || (r.section || '').toLowerCase().includes(term);
    const out = []; let key = null;
    for (const r of rows) {
      if (!hit(r)) continue;
      const k = r.fav_item ? '★items' : `${r.market_id}|${r.section}`;
      if (k !== key) { key = k; out.push({ key: k, starred: !!r.fav_item, head: r, rows: [] }); }
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [rows, q]);

  const stale = status?.latest_date && status.latest_date < todayIso();
  const statusLine = error ? `Error: ${error}`
    : !status?.latest_date ? 'Loading…'
    : stale ? `Rates as of ${api.niceDate(status.latest_date)} · no new rates published yet today`
    : `Updated today · ${api.niceDate(status.latest_date)}`;

  return (
    <ScrollView contentContainerStyle={s.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} colors={[t.accent]} />}>
      <Text style={[s.status, { color: error ? t.down : t.secondary }]}>{statusLine}</Text>

      <View style={s.searchRow}>
        <Input value={q} onChangeText={setQ} placeholder="Search items — coconut, അടയ്ക്ക, gold…" style={{ flex: 1 }} returnKeyType="search" />
        {q ? <Pressable onPress={() => setQ('')} hitSlop={10} style={{ paddingHorizontal: 8 }}><Text style={{ color: t.muted, fontSize: 20 }}>×</Text></Pressable> : null}
      </View>

      {found && (
        <Card>
          <H2 right={`${found.length} found`}>All markets</H2>
          {!found.length ? <Text style={{ color: t.muted, paddingVertical: 8, fontFamily: FONT.regular }}>Nothing matches “{q.trim()}”.</Text>
            : found.map(r => (
              <Pressable key={r.item_id} onPress={() => onChartItem({ id: r.item_id, name: r.name, name_ml: r.name_ml, market: r.market, unit: r.unit })}
                style={[s.row, { borderBottomColor: t.line }]}>
                <Text style={s.icon}>{itemIcon(r.name, r.name_ml)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{r.name || r.name_ml}</Text>
                  <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }} numberOfLines={1}>
                    {r.market}{r.section && r.section !== r.market ? ` / ${r.section}` : ''}{r.date ? ` · ${api.niceDate(r.date)}` : ''}
                  </Text>
                </View>
                <View style={s.priceCol}>
                  <Text style={[s.price, { color: r.price_low == null ? t.muted : t.ink }]} numberOfLines={1}>
                    {r.price_low == null ? '—' : '₹' + api.fmt(r.price_low) + (r.price_high != null && +r.price_high !== +r.price_low ? `–${api.fmt(r.price_high)}` : '')}
                    <Text style={{ color: t.muted, fontFamily: FONT.regular, fontSize: 11 }}>{api.unitLabel(r.unit)}</Text>
                  </Text>
                  <Change change={r.change} base={r.price_low != null && r.change != null ? +r.price_low - +r.change : null} size={11} />
                </View>
              </Pressable>
            ))}
        </Card>
      )}

      <Card>
        <H2 right={status?.days ? `${status.days} days of history` : ''}>Rates</H2>
        <Hint>{user
          ? 'Star a market to keep it first. Star a sub-market or an item to pin it to the top and collect it under Favourites.'
          : 'Sign in from the menu to star markets, sub-markets and items — your favourites are saved to your account.'}</Hint>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          {favCount > 0 && <Chip title={`★ Favourites (${favCount})`} on={favView} onPress={() => setCurrent(FAV)} />}
          {ordered.map(m => (
            <Chip key={m.id} title={m.name} on={current === m.id} onPress={() => setCurrent(m.id)}
              right={<Star on={m.fav} onPress={toggleMarket(m)} size={14} />} style={{ paddingRight: 6 }} />
          ))}
        </ScrollView>

        {!groups.length ? (
          <Text style={{ color: t.muted, paddingVertical: 14, fontFamily: FONT.regular }}>
            {q.trim() ? `Nothing here matches “${q.trim()}”.` : favView ? 'Nothing starred yet.' : 'No rates for this market on the latest day.'}
          </Text>
        ) : groups.map(g => (
          <View key={g.key}>
            <View style={[s.secRow, { borderTopColor: g.starred || g.head.fav_section ? t.accent : t.line }]}>
              {g.starred ? <Text style={{ color: t.accent, fontSize: 13 }}>★ </Text>
                : g.head.section ? <Star on={g.head.fav_section} onPress={toggleSection(g.head)} size={14} /> : null}
              <Label style={{ marginBottom: 0, flexShrink: 1 }} color={g.starred || g.head.fav_section ? t.ink : t.muted}>
                {g.starred ? 'Starred items' : `${favView ? g.head.market + ' · ' : ''}${g.head.section || 'Other'}`}
              </Label>
              {!g.starred && g.head.section_ml && g.head.section_ml !== g.head.section
                ? <Text style={{ color: t.muted, fontSize: 11, marginLeft: 6, flexShrink: 1 }} numberOfLines={1}>{g.head.section_ml}</Text> : null}
            </View>
            {g.rows.map((r, i) => {
              const range = r.price_high != null && +r.price_high !== +r.price_low ? `–${api.fmt(r.price_high)}` : '';
              const unitLine = api.unitLine(r.unit, r.price_low, r.price_high);
              const ctx = r.fav_item ? [favView ? r.market : null, r.section && r.section !== r.market ? r.section : null].filter(Boolean).join(' · ') : '';
              return (
                <Pressable key={r.item_id} onPress={() => onChartItem({ id: r.item_id, name: r.name, name_ml: r.name_ml, market: r.market, unit: r.unit })}
                  style={[s.row, { borderBottomColor: t.line }]}>
                  <Text style={s.icon}>{itemIcon(r.name, r.name_ml)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{r.name || r.name_ml}</Text>
                    <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }} numberOfLines={1}>
                      {r.name && r.name_ml ? r.name_ml : ''}{ctx ? `${r.name && r.name_ml ? ' · ' : ''}${ctx}` : ''}
                    </Text>
                  </View>
                  <View style={s.priceCol}>
                    <Text style={[s.price, { color: r.price_low == null ? t.muted : t.ink }]} numberOfLines={1}>
                      {r.price_low == null ? (r.raw || '—') : '₹' + api.fmt(r.price_low) + range}
                      {r.price_low != null ? <Text style={{ color: t.muted, fontFamily: FONT.regular, fontSize: 11 }}>{api.unitLabel(r.unit)}</Text> : null}
                    </Text>
                    {unitLine ? <Text style={{ color: t.muted, fontSize: 11, fontFamily: FONT.regular }} numberOfLines={1}>{unitLine}</Text> : null}
                    <Change change={r.change} base={r.prev_low} size={11} />
                  </View>
                  <Star on={r.fav_item} onPress={toggleItem(r)} size={16} dim />
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 12, paddingBottom: 40 },
  status: { fontSize: 12, marginBottom: 10, fontFamily: FONT.medium, letterSpacing: 0.2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 6, paddingBottom: 12 },
  secRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 4, borderTopWidth: 2, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  name: { fontSize: 15, fontFamily: FONT.bold, letterSpacing: -0.2, textTransform: 'uppercase' },
  priceCol: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '46%' },
  price: { fontSize: 15, fontFamily: FONT.bold, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
});
