import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import { itemIcon } from '../lib/icons';
import { Card, H2, Hint, Button, Chip, Input, Label } from '../components/ui';

const SIDES = [['retail', 'Shop price', 'what buyers pay you'], ['farmgate', 'Farm-gate', 'what you pay farmers']];
const weekAgo = () => new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const STATUS = { pending: 'Waiting — needs a second shop or admin approval', published: 'Published', rejected: 'Rejected' };

// The shopkeeper's gateway: apply for a shop in a market, then post today's
// prices. Shops are never shown to buyers - only the market's combined rate.
export default function SellerScreen({ user, openAuth, shop, onShopChange }) {
  const t = useTheme();
  const [markets, setMarkets] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  // application
  const [marketId, setMarketId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // posting
  const [side, setSide] = useState('retail');
  const [prices, setPrices] = useState({});      // item_id -> text
  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([api.communityMarkets(), api.communityItems()]).then(([m, i]) => { setMarkets(m); setItems(i); }).catch(e => setError(e.message));
  }, [user]);

  const loadPosts = useCallback(async () => {
    if (!shop || shop.status !== 'approved') { setPosts([]); return; }
    try { setPosts(await api.myPosts(shop.id, weekAgo())); } catch (e) { setError(e.message); }
  }, [shop]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Last price this shop posted per item/side, shown as the placeholder.
  const last = useMemo(() => {
    const m = {};
    for (const p of posts) { const k = `${p.side}:${p.item_id}`; if (!(k in m)) m[k] = p.price; }
    return m;
  }, [posts]);

  const apply = async () => {
    if (!marketId || name.trim().length < 2) return setError('Pick your market and enter the shop name.');
    setBusy(true);
    try { await api.applyShop(user.id, marketId, name.trim(), phone.trim()); setError(''); await onShopChange(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const filled = items.filter(i => +String(prices[i.id] ?? '').replace(/,/g, '') > 0);
  const submit = async () => {
    if (!filled.length) return;
    setBusy(true); setDone('');
    try {
      await api.postRates(filled.map(i => ({ shop_id: shop.id, item_id: i.id, side, price: +String(prices[i.id]).replace(/,/g, '') })));
      setPrices({}); setError(''); setDone(`Posted ${filled.length} price${filled.length > 1 ? 's' : ''}.`);
      await loadPosts();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!user) return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Card>
        <H2>Post rates</H2>
        <Hint>Shopkeepers post the day's prices for their market. Buyers see only the market's combined rate — never your shop.</Hint>
        <Button title="Sign in to start" primary onPress={openAuth} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </ScrollView>
  );

  if (!shop) {
    const districts = [...new Set(markets.map(m => m.district))];
    return (
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Card>
          <H2>Register your shop</H2>
          <Hint>Once the admin approves you, you can post daily prices for your market. Your shop name and phone are seen only by the admin.</Hint>
          <Label>Your market</Label>
          {districts.map(d => (
            <View key={d} style={{ marginBottom: 8 }}>
              <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.medium, marginBottom: 4 }}>{d}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {markets.filter(m => m.district === d).map(m => <Chip key={m.id} title={m.name} on={marketId === m.id} onPress={() => setMarketId(m.id)} />)}
              </View>
            </View>
          ))}
          <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular, marginBottom: 10 }}>Market not listed? Ask the admin from the menu's About section.</Text>
          <Input value={name} onChangeText={setName} placeholder="Shop name" style={{ marginBottom: 8 }} />
          <Input value={phone} onChangeText={setPhone} placeholder="Phone (for the admin to verify)" keyboardType="phone-pad" style={{ marginBottom: 10 }} />
          {error ? <Text style={{ color: t.down, fontSize: 13, marginBottom: 8 }}>{error}</Text> : null}
          <Button title="Apply" primary onPress={apply} disabled={busy} style={{ alignSelf: 'flex-start' }} />
        </Card>
      </ScrollView>
    );
  }

  if (shop.status !== 'approved') return (
    <ScrollView contentContainerStyle={s.wrap} refreshControl={<RefreshControl refreshing={busy} onRefresh={async () => { setBusy(true); await onShopChange(); setBusy(false); }} tintColor={t.accent} colors={[t.accent]} />}>
      <Card>
        <H2>{shop.status === 'pending' ? 'Awaiting approval' : 'Application declined'}</H2>
        <Text style={{ color: t.ink, fontSize: 14, fontFamily: FONT.medium }}>{shop.name} · {shop.community_markets.name}, {shop.community_markets.district}</Text>
        <Hint>{shop.status === 'pending'
          ? 'The admin will check your shop (usually by phone) and switch on posting. Pull down to refresh.'
          : `Reason: ${shop.reject_reason || 'not given'}. Contact the admin if you think this is a mistake.`}</Hint>
      </Card>
    </ScrollView>
  );

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <H2 right={shop.community_markets.name}>Post today's prices</H2>
        <Hint>Enter only the items you trade today; leave the rest blank. Your last posted value is shown faint. Prices publish when a second shop in {shop.community_markets.name} posts too, or after the admin checks a single post.</Hint>
        <View style={[s.sideRow, { borderColor: t.line }]}>
          {SIDES.map(([id, title, sub]) => {
            const on = side === id;
            return (
              <Pressable key={id} onPress={() => setSide(id)} style={[s.sideBtn, { backgroundColor: on ? t.ink : 'transparent' }]}>
                <Text style={{ color: on ? t.bg : t.ink, fontSize: 13, fontFamily: FONT.bold, textTransform: 'uppercase' }}>{title}</Text>
                <Text style={{ color: on ? t.bg : t.muted, fontSize: 10, fontFamily: FONT.regular }}>{sub}</Text>
              </Pressable>
            );
          })}
        </View>
        {items.map(i => (
          <View key={i.id} style={[s.row, { borderBottomColor: t.line }]}>
            <Text style={s.icon}>{itemIcon(i.name, i.name_ml)}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{i.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }}>{i.name_ml} · ₹ per {i.unit}</Text>
            </View>
            <Input value={prices[i.id] ?? ''} onChangeText={v => setPrices(p => ({ ...p, [i.id]: v }))} keyboardType="decimal-pad"
              placeholder={last[`${side}:${i.id}`] != null ? api.fmt(last[`${side}:${i.id}`]) : '—'} style={{ width: 96, textAlign: 'right' }} />
          </View>
        ))}
        {error ? <Text style={{ color: t.down, fontSize: 13, marginTop: 8 }}>{error}</Text> : null}
        {done ? <Text style={{ color: t.up, fontSize: 13, marginTop: 8, fontFamily: FONT.medium }}>{done}</Text> : null}
        <Button title={filled.length ? `Post ${filled.length} price${filled.length > 1 ? 's' : ''}` : 'Post prices'} primary onPress={submit}
          disabled={busy || !filled.length} style={{ alignSelf: 'flex-start', marginTop: 12 }} />
      </Card>

      <Card>
        <H2>Your posts · last 7 days</H2>
        {!posts.length ? <Text style={{ color: t.muted, fontFamily: FONT.regular }}>Nothing posted yet.</Text>
          : posts.map(p => {
            const it = items.find(i => i.id === p.item_id);
            const col = p.status === 'published' ? t.up : p.status === 'rejected' ? t.down : t.muted;
            return (
              <View key={p.id} style={[s.row, { borderBottomColor: t.line }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.ink, fontSize: 14, fontFamily: FONT.bold, textTransform: 'uppercase' }} numberOfLines={1}>{it?.name ?? p.item_id} <Text style={{ color: t.muted, fontFamily: FONT.regular, textTransform: 'none' }}>· {p.side === 'retail' ? 'shop price' : 'farm-gate'}</Text></Text>
                  <Text style={{ color: col, fontSize: 12, fontFamily: FONT.regular }} numberOfLines={2}>{STATUS[p.status]}{p.status === 'rejected' && p.reject_reason ? ` — ${p.reject_reason}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: t.ink, fontSize: 15, fontFamily: FONT.bold, fontVariant: ['tabular-nums'] }}>₹{api.fmt(p.price)}</Text>
                  <Text style={{ color: t.muted, fontSize: 11, fontFamily: FONT.regular }}>{api.niceDate(p.rate_date)} · {api.ago(p.posted_at)}</Text>
                </View>
              </View>
            );
          })}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 12, paddingBottom: 40 },
  sideRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 2, padding: 3, marginBottom: 6 },
  sideBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  name: { fontSize: 14, fontFamily: FONT.bold, letterSpacing: -0.2, textTransform: 'uppercase' },
});
