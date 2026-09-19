import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useTheme } from '../lib/theme';
import * as api from '../lib/api';
import { Card, H2, Hint, Star, Change } from '../components/ui';

const FAV = 'fav';

export default function MarketScreen({ user, requireUser, onChartItem }) {
  const t = useTheme();
  const [status, setStatus] = useState(null);
  const [featured, setFeatured] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [favMarkets, setFavMarkets] = useState(new Set());
  const [favCount, setFavCount] = useState(0);
  const [current, setCurrent] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadTop = useCallback(async () => {
    try {
      const [st, f, ms, fm, fc] = await Promise.all([
        api.dataStatus(), api.itemSummary(api.FEATURED), api.markets(),
        user ? api.favouriteMarketIds() : [], user ? api.favouriteCounts() : 0,
      ]);
      setStatus(st); setFeatured(f); setMarkets(ms); setFavMarkets(new Set(fm)); setFavCount(fc); setError('');
    } catch (e) { setError(e.message); }
  }, [user]);

  const loadRows = useCallback(async (marketId) => {
    if (marketId == null) return;
    try {
      setRows(marketId === FAV ? await api.favouriteRates() : await api.marketRates(marketId));
      setError('');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { loadTop(); }, [loadTop]);

  // Favourites first, then Manorama's order; the first tab is the default view.
  const ordered = useMemo(() => [...markets]
    .map(m => ({ ...m, fav: favMarkets.has(m.id) }))
    .sort((a, b) => (b.fav - a.fav) || (a.rank - b.rank) || (a.id - b.id)), [markets, favMarkets]);

  useEffect(() => {
    if (!ordered.length) return;
    if (current === FAV && !favCount) { setCurrent(null); return; }
    const id = current ?? ordered[0].id;
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
  const groups = useMemo(() => {
    const out = []; let key = null;
    for (const r of rows) {
      const k = r.fav_item ? '★items' : `${r.market_id}|${r.section}`;
      if (k !== key) { key = k; out.push({ key: k, starred: !!r.fav_item, head: r, rows: [] }); }
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [rows]);

  return (
    <ScrollView contentContainerStyle={s.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}>
      <Text style={[s.status, { color: t.secondary }]}>
        {error ? `Error: ${error}` : status?.latest_date ? `Latest: ${status.latest_date} · ${status.days} days of history` : 'Loading…'}
      </Text>

      <View style={s.tiles}>
        {featured.map(it => {
          const range = it.price_high != null && +it.price_high !== +it.price_low ? `–${api.fmt(it.price_high)}` : '';
          const kg = api.perKg(it.unit, it.price_low, it.price_high);
          const prevBase = it.price_low != null && it.change != null ? +it.price_low - +it.change : null;
          return (
            <Pressable key={it.item_id} onPress={() => onChartItem({ id: it.item_id, name: it.name, name_ml: it.name_ml, market: it.market })}
              style={[s.tile, { backgroundColor: t.surface, borderColor: t.line, borderTopColor: t.gold }]}>
              <Text style={{ color: t.secondary, fontSize: 13 }} numberOfLines={1}>{it.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>{it.name_ml}</Text>
              <Text style={{ color: t.ink, fontSize: 20, fontWeight: '600', marginTop: 4 }}>₹{api.fmt(it.price_low)}{range}</Text>
              {kg ? <Text style={{ color: t.muted, fontSize: 12 }}>{kg}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <Change change={it.change} base={prevBase} />
                <Text style={{ color: t.muted, fontSize: 12 }}>vs {it.prev_date || '—'}</Text>
              </View>
              <Text style={{ color: t.muted, fontSize: 11 }}>{it.market}{it.section && it.section !== it.market ? ` · ${it.section}` : ''}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <H2 right={status?.latest_date ? `· ${status.latest_date}` : ''}>Today's rates</H2>
        <Hint>{user
          ? 'Star a market to keep it first. Star a sub-market or an item to pin it to the top and collect it under ★ Favourites.'
          : 'Sign in to star markets, sub-markets and items — your favourites are saved to your account.'}</Hint>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          {favCount > 0 && (
            <Pressable onPress={() => setCurrent(FAV)} style={[s.tab, { borderColor: favView ? t.accent : t.line, backgroundColor: favView ? t.accent : t.surface }]}>
              <Text style={{ color: favView ? t.onAccent : t.ink, fontSize: 13 }}>★ Favourites ({favCount})</Text>
            </Pressable>
          )}
          {ordered.map(m => {
            const on = current === m.id;
            return (
              <View key={m.id} style={[s.tab, { borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : t.surface, paddingRight: 4 }]}>
                <Pressable onPress={() => setCurrent(m.id)}><Text style={{ color: on ? t.onAccent : t.ink, fontSize: 13 }}>{m.name}</Text></Pressable>
                <Star on={m.fav} onPress={toggleMarket(m)} size={15} />
              </View>
            );
          })}
        </ScrollView>

        {!rows.length ? (
          <Text style={{ color: t.muted, paddingVertical: 14 }}>{favView ? 'Nothing starred yet.' : 'No rates for this market on the latest day.'}</Text>
        ) : groups.map(g => (
          <View key={g.key}>
            <View style={[s.secRow, { backgroundColor: t.bg, borderLeftColor: g.starred || g.head.fav_section ? t.gold : t.goldSoft }]}>
              {g.starred ? <Text style={{ color: t.gold }}>★ </Text>
                : g.head.section ? <Star on={g.head.fav_section} onPress={toggleSection(g.head)} size={15} /> : null}
              <Text style={{ color: g.starred || g.head.fav_section ? t.ink : t.secondary, fontWeight: '600', fontSize: 13, flexShrink: 1 }}>
                {g.starred ? 'Starred items' : `${favView ? g.head.market + ' · ' : ''}${g.head.section || 'Other'}${g.head.section_ml && g.head.section_ml !== g.head.section ? ' · ' + g.head.section_ml : ''}`}
              </Text>
            </View>
            {g.rows.map(r => {
              const range = r.price_high != null && +r.price_high !== +r.price_low ? `–${api.fmt(r.price_high)}` : '';
              const kg = api.perKg(r.unit, r.price_low, r.price_high);
              const ctx = r.fav_item ? [favView ? r.market : null, r.section && r.section !== r.market ? r.section : null].filter(Boolean).join(' · ') : '';
              return (
                <Pressable key={r.item_id} onPress={() => onChartItem({ id: r.item_id, name: r.name, name_ml: r.name_ml, market: r.market })}
                  style={[s.row, { borderBottomColor: t.line }]}>
                  <Star on={r.fav_item} onPress={toggleItem(r)} size={15} dim />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 14 }}>{r.name || r.name_ml}{ctx ? <Text style={{ color: t.muted, fontSize: 12 }}>  {ctx}</Text> : null}</Text>
                    <Text style={{ color: t.muted, fontSize: 12 }}>{r.name_ml}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: r.price_low == null ? t.muted : t.ink, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                      {r.price_low == null ? (r.raw || '—') : api.fmt(r.price_low) + range}
                    </Text>
                    {kg ? <Text style={{ color: t.muted, fontSize: 11 }}>{kg}</Text> : null}
                    <Change change={r.change} base={r.prev_low} />
                  </View>
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
  wrap: { padding: 14, paddingBottom: 40 },
  status: { fontSize: 12, marginBottom: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  tile: { width: '48%', flexGrow: 1, borderWidth: 1, borderTopWidth: 3, borderRadius: 12, padding: 12, gap: 1 },
  tabs: { flexDirection: 'row', gap: 6, paddingBottom: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 11 },
  secRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 6, borderLeftWidth: 3, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1 },
});
