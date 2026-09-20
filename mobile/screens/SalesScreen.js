import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import { itemIcon } from '../lib/icons';
import { Card, H2, Hint, Button, Chip, Input, Stat, Label } from '../components/ui';
import ItemPicker from '../components/ItemPicker';

const today = () => new Date().toISOString().slice(0, 10);
const ALL = 'all';

// A private log of what the user sold - date, item, kg, amount - per
// household. Every row is theirs alone (RLS on ledger_entries).
export default function SalesScreen({ user, openAuth, households, onChartItem }) {
  const t = useTheme();
  const [hh, setHh] = useState(ALL);            // ALL | household id
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [date, setDate] = useState(today());
  const [item, setItem] = useState({ name: '', id: null, unit: null });
  const [picking, setPicking] = useState(false);
  const [kg, setKg] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setRows([]); return; }
    try { setRows(await api.ledgerEntries(hh === ALL ? undefined : hh)); setError(''); }
    catch (e) { setError(e.message); }
  }, [user, hh]);
  useEffect(() => { load(); }, [load]);
  // A deleted household drops the filter back to All.
  useEffect(() => { if (hh !== ALL && !households.some(h => h.id === hh)) setHh(ALL); }, [households, hh]);

  const month = useMemo(() => {
    const ym = today().slice(0, 7);
    const m = rows.filter(r => r.entry_date.startsWith(ym));
    return { n: m.length, kg: m.reduce((a, r) => a + +r.quantity_kg, 0), amt: m.reduce((a, r) => a + +r.amount, 0) };
  }, [rows]);
  const hhName = (id) => households.find(h => h.id === id)?.name;

  const add = async () => {
    const entry = {
      user_id: user.id, entry_date: date.trim(), item_name: item.name.trim(), item_id: item.id,
      household_id: hh === ALL ? null : hh, quantity_kg: +kg, amount: +amount, note: note.trim(),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.entry_date)) return setError('Date must be YYYY-MM-DD.');
    if (!entry.item_name || !(entry.quantity_kg > 0) || !(entry.amount >= 0)) return setError('Item, kg and amount are needed.');
    setBusy(true);
    try { await api.addLedgerEntry(entry); setItem({ name: '', id: null, unit: null }); setKg(''); setAmount(''); setNote(''); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const del = (r) => Alert.alert('Delete entry?', `${r.entry_date} · ${r.item_name} · ${api.fmt(r.quantity_kg)} kg`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.deleteLedgerEntry(r.id); await load(); } catch (e) { setError(e.message); } } },
  ]);

  if (!user) return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Card>
        <H2>My Sales</H2>
        <Hint>Keep a private record of what you sold — how many kg, for how much — for your own accounts. Only you can see it.</Hint>
        <Button title="Sign in to start" primary onPress={openAuth} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <View style={s.stats}>
        <Stat label="This month" value={`₹${api.fmt(Math.round(month.amt))}`} />
        <Stat label="Sold" value={`${api.fmt(month.kg)} kg`} />
        <Stat label="Entries" value={String(month.n)} />
      </View>

      <Card>
        <H2>My Sales</H2>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          <Chip title="All" on={hh === ALL} onPress={() => setHh(ALL)} />
          {households.map(h => <Chip key={h.id} title={h.name} on={hh === h.id} onPress={() => setHh(h.id)} />)}
        </ScrollView>
        <Hint>{households.length
          ? (hh === ALL ? 'Showing every household. Pick one to filter, and new entries are filed under it.' : `Entries for ${hhName(hh)}.`)
          : 'Several houses or farms? Add households from the menu (☰) to keep their sales apart.'}</Hint>

        <Label>New entry</Label>
        <View style={s.formRow}>
          <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={{ flex: 1 }} />
          <Pressable onPress={() => setPicking(true)} style={[s.pick, { borderColor: t.line, backgroundColor: t.bg, flex: 1.4 }]}>
            <Text style={{ color: item.name ? t.ink : t.muted, fontSize: 14, fontFamily: FONT.regular, flex: 1 }} numberOfLines={1}>
              {item.name ? `${itemIcon(item.name)}  ${item.name}` : 'Item — tap to choose'}
            </Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>▾</Text>
          </Pressable>
        </View>
        <View style={s.formRow}>
          <Input value={kg} onChangeText={setKg} placeholder="Kg" keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Input value={amount} onChangeText={setAmount} placeholder="Amount received (₹)" keyboardType="decimal-pad" style={{ flex: 1.4 }} />
        </View>
        <View style={s.formRow}>
          <Input value={note} onChangeText={setNote} placeholder="Note (optional)" style={{ flex: 1 }} />
          <Button title="Add" primary onPress={add} disabled={busy} />
        </View>
        {error ? <Text style={{ color: t.down, fontSize: 13, marginBottom: 6 }}>{error}</Text> : null}
        {item.id ? <Text style={{ color: t.muted, fontSize: 12, marginBottom: 6, fontFamily: FONT.regular }}>Linked to the market item — this sale will show on its chart.</Text> : null}

        {!rows.length ? <Text style={{ color: t.muted, paddingVertical: 14, fontFamily: FONT.regular }}>No entries yet — add your first sale above.</Text>
          : rows.map(r => {
            const per = +r.quantity_kg ? +r.amount / +r.quantity_kg : null;
            const sub = [api.niceDate(r.entry_date), hh === ALL && r.household_id ? hhName(r.household_id) : null, r.note || null].filter(Boolean).join(' · ');
            return (
              <Pressable key={r.id} style={[s.row, { borderBottomColor: t.line }]}
                onPress={() => r.item_id && onChartItem({ id: r.item_id, name: r.item_name, name_ml: '', market: '' })}>
                <Text style={s.icon}>{itemIcon(r.item_name)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.name, { color: t.ink }]} numberOfLines={1}>{r.item_name}</Text>
                  <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.regular }} numberOfLines={1}>{sub}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                  <Text style={[s.price, { color: t.ink }]}>₹{api.fmt(r.amount)}</Text>
                  <Text style={{ color: t.muted, fontSize: 11, fontFamily: FONT.regular }}>{api.fmt(r.quantity_kg)} kg{per != null ? ` · ₹${api.fmt(per)}/kg` : ''}</Text>
                </View>
                <Pressable onPress={() => del(r)} hitSlop={10} style={{ paddingLeft: 6 }}><Text style={{ color: t.muted, fontSize: 18 }}>×</Text></Pressable>
              </Pressable>
            );
          })}
      </Card>
    </ScrollView>
    <ItemPicker visible={picking} onClose={() => setPicking(false)} onPick={(it) => { setItem(it); setPicking(false); }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 12, paddingBottom: 40 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 6, paddingBottom: 10 },
  formRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  name: { fontSize: 15, fontFamily: FONT.bold, letterSpacing: -0.2, textTransform: 'uppercase' },
  price: { fontSize: 15, fontFamily: FONT.bold, fontVariant: ['tabular-nums'] },
});
