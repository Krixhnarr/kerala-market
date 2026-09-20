import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import { itemIcon } from '../lib/icons';
import { Card, H2, Hint, Button, Input, Label } from '../components/ui';

// Admin only: approve single-source rates, approve shop applications, add
// markets and items. Rejections carry a short reason the shop can read.
export default function AdminScreen() {
  const t = useTheme();
  const [rates, setRates] = useState([]);
  const [shops, setShops] = useState([]);
  const [reasons, setReasons] = useState({});   // key -> reject reason text
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [mk, setMk] = useState({ district: '', name: '', name_ml: '' });
  const [it, setIt] = useState({ name: '', name_ml: '', unit: 'kg' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { const [r, s] = await Promise.all([api.adminPendingRates(), api.adminPendingShops()]); setRates(r); setShops(s); setError(''); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const act = async (fn) => { try { await fn(); setMsg(''); await load(); } catch (e) { setError(e.message); } };
  const rateKey = r => `r${r.id}`, shopKey = s => `s${s.id}`;

  const addMarket = () => act(async () => {
    if (!mk.district.trim() || !mk.name.trim()) throw new Error('District and market name are needed.');
    await api.addCommunityMarket(mk.district.trim(), mk.name.trim(), mk.name_ml.trim());
    setMk({ district: '', name: '', name_ml: '' }); setMsg(`Added market ${mk.name.trim()}.`);
  });
  const addItem = () => act(async () => {
    if (!it.name.trim()) throw new Error('Item name is needed.');
    await api.addCommunityItem(it.name.trim(), it.name_ml.trim(), it.unit.trim() || 'kg');
    setIt({ name: '', name_ml: '', unit: 'kg' }); setMsg(`Added item ${it.name.trim()}.`);
  });

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} colors={[t.accent]} />}>
      {error ? <Text style={{ color: t.down, marginBottom: 8 }}>{error}</Text> : null}

      <Card>
        <H2 right={`${rates.length} waiting`}>Rates to approve</H2>
        <Hint>Single-source posts. Approving publishes the price as that market's rate, marked "admin-verified · 1 source". If a second shop posts the same item today, the post leaves this queue on its own.</Hint>
        {!rates.length ? <Text style={{ color: t.muted, fontFamily: FONT.regular }}>Queue is empty.</Text>
          : rates.map(r => (
            <View key={r.id} style={[s.block, { borderTopColor: t.line }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.icon}>{itemIcon(r.item, r.item_ml)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{r.item} <Text style={{ color: t.muted, fontFamily: FONT.regular, textTransform: 'none' }}>· {r.side === 'retail' ? 'shop price' : 'farm-gate'}</Text></Text>
                  <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }} numberOfLines={1}>{r.market}, {r.district} · {r.shop} · {api.niceDate(r.rate_date)} · {api.ago(r.posted_at)}</Text>
                </View>
                <Text style={{ color: t.ink, fontSize: 16, fontFamily: FONT.black, fontVariant: ['tabular-nums'] }}>₹{api.fmt(r.price)}<Text style={{ color: t.muted, fontSize: 11, fontFamily: FONT.regular }}>/{r.unit}</Text></Text>
              </View>
              <View style={s.actions}>
                <Button title="Approve" primary small onPress={() => act(() => api.reviewRate(r.id, true))} />
                <Input value={reasons[rateKey(r)] ?? ''} onChangeText={v => setReasons(x => ({ ...x, [rateKey(r)]: v }))} placeholder="Reason (optional)" style={{ flex: 1, paddingVertical: 6 }} />
                <Button title="Reject" small onPress={() => act(() => api.reviewRate(r.id, false, (reasons[rateKey(r)] ?? '').trim()))} />
              </View>
            </View>
          ))}
      </Card>

      <Card>
        <H2 right={`${shops.length} waiting`}>Shop applications</H2>
        <Hint>Approving lets the shop post prices for its market and marks the account as a seller. Verify by phone first.</Hint>
        {!shops.length ? <Text style={{ color: t.muted, fontFamily: FONT.regular }}>No applications.</Text>
          : shops.map(sh => (
            <View key={sh.id} style={[s.block, { borderTopColor: t.line }]}>
              <Text style={[s.name, { color: t.ink }]}>{sh.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }}>{sh.community_markets.name}, {sh.community_markets.district} · {sh.phone || 'no phone'} · applied {api.ago(sh.created_at)}</Text>
              <View style={s.actions}>
                <Button title="Approve" primary small onPress={() => act(() => api.reviewShop(sh, true))} />
                <Input value={reasons[shopKey(sh)] ?? ''} onChangeText={v => setReasons(x => ({ ...x, [shopKey(sh)]: v }))} placeholder="Reason (optional)" style={{ flex: 1, paddingVertical: 6 }} />
                <Button title="Reject" small onPress={() => act(() => api.reviewShop(sh, false, (reasons[shopKey(sh)] ?? '').trim()))} />
              </View>
            </View>
          ))}
      </Card>

      <Card>
        <H2>Add a market</H2>
        <View style={s.formRow}>
          <Input value={mk.district} onChangeText={v => setMk({ ...mk, district: v })} placeholder="District" style={{ flex: 1 }} />
          <Input value={mk.name} onChangeText={v => setMk({ ...mk, name: v })} placeholder="Market" style={{ flex: 1 }} />
        </View>
        <View style={s.formRow}>
          <Input value={mk.name_ml} onChangeText={v => setMk({ ...mk, name_ml: v })} placeholder="മലയാളം (optional)" style={{ flex: 1 }} />
          <Button title="Add" dark small onPress={addMarket} />
        </View>
        <Label style={{ marginTop: 10 }}>Add an item</Label>
        <View style={s.formRow}>
          <Input value={it.name} onChangeText={v => setIt({ ...it, name: v })} placeholder="Item" style={{ flex: 1.2 }} />
          <Input value={it.name_ml} onChangeText={v => setIt({ ...it, name_ml: v })} placeholder="മലയാളം" style={{ flex: 1 }} />
          <Input value={it.unit} onChangeText={v => setIt({ ...it, unit: v })} placeholder="unit" style={{ width: 64 }} />
          <Button title="Add" dark small onPress={addItem} />
        </View>
        {msg ? <Text style={{ color: t.up, fontSize: 13, marginTop: 6, fontFamily: FONT.medium }}>{msg}</Text> : null}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 12, paddingBottom: 40 },
  block: { paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  formRow: { flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center' },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  name: { fontSize: 14, fontFamily: FONT.bold, letterSpacing: -0.2, textTransform: 'uppercase' },
});
