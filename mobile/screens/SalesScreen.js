import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../lib/theme';
import * as api from '../lib/api';
import { Card, H2, Hint, Button } from '../components/ui';

const ITEMS = ['Arecanut', 'Coconut', 'Copra', 'Coconut Oil', 'Pepper', 'Rubber', 'Cashew', 'Cocoa',
  'Rice', 'Paddy', 'Ginger', 'Turmeric', 'Nutmeg', 'Mace', 'Clove', 'Coir', 'Cardamom', 'Banana', 'Pineapple', 'Tapioca'];
const today = () => new Date().toISOString().slice(0, 10);

// A private log of what the user sold - date, item, kg, amount - for their
// own accounts. Every row is theirs alone (RLS on ledger_entries).
export default function SalesScreen({ user, openAuth }) {
  const t = useTheme();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [date, setDate] = useState(today());
  const [item, setItem] = useState('');
  const [kg, setKg] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setRows([]); return; }
    try { setRows(await api.ledgerEntries()); setError(''); }
    catch (e) { setError(e.message); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const month = useMemo(() => {
    const ym = today().slice(0, 7);
    const m = rows.filter(r => r.entry_date.startsWith(ym));
    return { n: m.length, kg: m.reduce((a, r) => a + +r.quantity_kg, 0), amt: m.reduce((a, r) => a + +r.amount, 0) };
  }, [rows]);

  const add = async () => {
    const entry = { user_id: user.id, entry_date: date.trim(), item_name: item.trim(), quantity_kg: +kg, amount: +amount, note: note.trim() };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.entry_date)) return setError('Date must be YYYY-MM-DD.');
    if (!entry.item_name || !(entry.quantity_kg > 0) || !(entry.amount >= 0)) return setError('Item, kg and amount are needed.');
    setBusy(true);
    try { await api.addLedgerEntry(entry); setItem(''); setKg(''); setAmount(''); setNote(''); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const del = (r) => Alert.alert('Delete entry?', `${r.entry_date} · ${r.item_name} · ${api.fmt(r.quantity_kg)} kg`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.deleteLedgerEntry(r.id); await load(); } catch (e) { setError(e.message); } } },
  ]);

  const inp = [s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.bg }];

  if (!user) return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Card>
        <H2>My Sales</H2>
        <Hint>Keep a private record of what you sold — how many kg, for how much — for your own accounts. Only you can see it.</Hint>
        <Button title="Sign in to start" primary onPress={openAuth} />
      </Card>
    </ScrollView>
  );

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <H2 right={month.n ? `· this month: ${api.fmt(month.kg)} kg · ₹${api.fmt(month.amt)}` : ''}>My Sales</H2>
        <Hint>Keep a private record of what you sold — how many kg, for how much — for your own accounts. Only you can see it.</Hint>

        <View style={s.formRow}>
          <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={t.muted} style={[...inp, { flex: 1 }]} />
          <TextInput value={item} onChangeText={setItem} placeholder="Item (e.g. Arecanut)" placeholderTextColor={t.muted} style={[...inp, { flex: 1.4 }]} />
        </View>
        {item.length > 0 && !ITEMS.includes(item) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
            {ITEMS.filter(n => n.toLowerCase().startsWith(item.toLowerCase())).map(n => (
              <Pressable key={n} onPress={() => setItem(n)} style={[s.suggest, { borderColor: t.line, backgroundColor: t.bg }]}><Text style={{ color: t.ink, fontSize: 13 }}>{n}</Text></Pressable>
            ))}
          </ScrollView>
        )}
        <View style={s.formRow}>
          <TextInput value={kg} onChangeText={setKg} placeholder="Kg" keyboardType="decimal-pad" placeholderTextColor={t.muted} style={[...inp, { flex: 1 }]} />
          <TextInput value={amount} onChangeText={setAmount} placeholder="Amount (₹)" keyboardType="decimal-pad" placeholderTextColor={t.muted} style={[...inp, { flex: 1.4 }]} />
        </View>
        <View style={s.formRow}>
          <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={t.muted} style={[...inp, { flex: 1 }]} />
          <Button title="Add" primary onPress={add} disabled={busy} />
        </View>
        {error ? <Text style={{ color: t.down, fontSize: 13, marginBottom: 6 }}>{error}</Text> : null}

        {!rows.length ? <Text style={{ color: t.muted, paddingVertical: 14 }}>No entries yet — add your first sale above.</Text>
          : rows.map(r => {
            const per = +r.quantity_kg ? +r.amount / +r.quantity_kg : null;
            return (
              <View key={r.id} style={[s.row, { borderBottomColor: t.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 14 }}>{r.item_name} <Text style={{ color: t.muted, fontSize: 12 }}>{r.entry_date}</Text></Text>
                  {r.note ? <Text style={{ color: t.muted, fontSize: 12 }}>{r.note}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: t.ink, fontSize: 14, fontVariant: ['tabular-nums'] }}>{api.fmt(r.quantity_kg)} kg · ₹{api.fmt(r.amount)}</Text>
                  <Text style={{ color: t.muted, fontSize: 11 }}>{per != null ? `₹${api.fmt(per)}/kg` : '—'}</Text>
                </View>
                <Pressable onPress={() => del(r)} hitSlop={10} style={{ paddingLeft: 8 }}><Text style={{ color: t.muted, fontSize: 18 }}>×</Text></Pressable>
              </View>
            );
          })}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 14, paddingBottom: 40 },
  formRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  suggest: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
});
