import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, ScrollView, Switch, Alert, BackHandler, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, FONT } from '../lib/theme';
import * as api from '../lib/api';
import * as notify from '../lib/notify';
import { Label, Button, Input } from './ui';

// Slide-in panel from the left: account, households, alerts, about.
// Rendered as an always-mounted overlay (not a Modal) so the slide animation
// has a mounted view to drive; when closed it is off-screen and ignores touches.
export default function Drawer({ visible, onClose, user, openAuth, signOut, households, reloadHouseholds, role = 'buyer', shop = null, goSeller }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const W = Math.min(320, Math.round(width * 0.84));
  const x = useRef(new Animated.Value(-W)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [alerts, setAlerts] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);   // {id, name}
  const [error, setError] = useState('');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(x, { toValue: visible ? 0 : -W, duration: visible ? 220 : 180, useNativeDriver: true }),
      Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
    if (visible) notify.isEnabled().then(setAlerts);
  }, [visible, W, x, fade]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  const toggleAlerts = async (on) => {
    if (on && !user) { onClose(); openAuth('Sign in so we know which items you starred.'); return; }
    const ok = await notify.setEnabled(on);
    setAlerts(on && ok);
    if (on && !ok) Alert.alert('Notifications blocked', 'Allow notifications for Kerala Market in Android settings, then try again.');
  };

  const addHousehold = async () => {
    const name = newName.trim();
    if (!name) return;
    try { await api.addHousehold(user.id, name); setNewName(''); setError(''); await reloadHouseholds(); }
    catch (e) { setError(e.message); }
  };
  const saveRename = async () => {
    const name = editing?.name.trim();
    if (!name) return setEditing(null);
    try { await api.renameHousehold(editing.id, name); setEditing(null); await reloadHouseholds(); }
    catch (e) { setError(e.message); }
  };
  const remove = (h) => Alert.alert('Delete household?', `"${h.name}" — its sales entries are kept and become unassigned.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.deleteHousehold(h.id); await reloadHouseholds(); } catch (e) { setError(e.message); } } },
  ]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[s.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.panel, { width: W, backgroundColor: t.surface, borderColor: t.line, transform: [{ translateX: x }] }]}>
        <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
          <View style={s.top}>
            <Text style={[s.brand, { color: t.accent }]}>Kerala{'\n'}Market</Text>
            <Pressable onPress={onClose} hitSlop={12}><Text style={{ color: t.ink, fontSize: 26, lineHeight: 28 }}>×</Text></Pressable>
          </View>

          <Section title="Account" t={t}>
            {user ? (
              <>
                <Text style={{ color: t.ink, fontSize: 14, fontFamily: FONT.medium, marginBottom: 10 }} numberOfLines={1}>{user.email}</Text>
                <Button title="Sign out" small onPress={() => { signOut(); onClose(); }} style={{ alignSelf: 'flex-start' }} />
              </>
            ) : (
              <>
                <Text style={{ color: t.secondary, fontSize: 13, marginBottom: 10, fontFamily: FONT.regular }}>Sign in to star markets, keep a sales ledger and get price alerts.</Text>
                <Button title="Sign in" primary small onPress={() => { onClose(); openAuth(); }} style={{ alignSelf: 'flex-start' }} />
              </>
            )}
          </Section>

          <Section title="Shopkeepers" t={t}>
            <Text style={{ color: t.secondary, fontSize: 13, marginBottom: 10, fontFamily: FONT.regular }}>
              {role === 'admin' ? 'You are the admin: approve shops and single-source rates from the Admin tab.'
                : shop ? `Your shop: ${shop.name} · ${shop.status}.`
                : 'Run a shop in a local market? Register it and post the day\'s prices. Buyers only ever see the market\'s combined rate.'}
            </Text>
            <Button title={shop || role !== 'buyer' ? 'Open Post rates' : 'Register my shop'} dark small onPress={goSeller} style={{ alignSelf: 'flex-start' }} />
          </Section>

          <Section title="Households" t={t}>
            <Text style={{ color: t.secondary, fontSize: 13, marginBottom: 8, fontFamily: FONT.regular }}>Keep sales from different houses or farms apart. Tap a name to rename it.</Text>
            {!user ? <Text style={{ color: t.muted, fontSize: 13 }}>Sign in to add households.</Text> : (
              <>
                {households.map(h => (
                  <View key={h.id} style={[s.row, { borderBottomColor: t.line }]}>
                    {editing?.id === h.id ? (
                      <Input value={editing.name} onChangeText={v => setEditing({ ...editing, name: v })} onBlur={saveRename} onSubmitEditing={saveRename} autoFocus style={{ flex: 1, paddingVertical: 5 }} />
                    ) : (
                      <Pressable onPress={() => setEditing({ id: h.id, name: h.name })} style={{ flex: 1 }}>
                        <Text style={{ color: t.ink, fontSize: 14, fontFamily: FONT.medium }}>{h.name}</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => remove(h)} hitSlop={10}><Text style={{ color: t.muted, fontSize: 18 }}>×</Text></Pressable>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <Input value={newName} onChangeText={setNewName} placeholder="New household (e.g. Home, Farm)" onSubmitEditing={addHousehold} style={{ flex: 1 }} />
                  <Button title="Add" dark small onPress={addHousehold} disabled={!newName.trim()} />
                </View>
              </>
            )}
            {error ? <Text style={{ color: t.down, fontSize: 12, marginTop: 6 }}>{error}</Text> : null}
          </Section>

          <Section title="Alerts" t={t}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, color: t.ink, fontSize: 14, fontFamily: FONT.regular }}>Notify me when a starred item rises or falls</Text>
              <Switch value={alerts} onValueChange={toggleAlerts} trackColor={{ true: t.accent, false: t.line }} thumbColor={t.surface} />
            </View>
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 6, fontFamily: FONT.regular }}>One notification per market day, checked in the background a few times daily.</Text>
          </Section>

          <Section title="About" t={t}>
            <Text style={{ color: t.secondary, fontSize: 13, lineHeight: 18, fontFamily: FONT.regular }}>
              Two kinds of price, kept apart: farm-gate rates (what traders pay farmers, from the daily paper, no update on Sundays)
              and shop rates (what buyers pay at a local market, reported by shopkeepers there and combined per market).
            </Text>
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 8, fontFamily: FONT.regular }}>Version 1.2.0</Text>
          </Section>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function Section({ title, children, t }) {
  return (
    <View style={[s.section, { borderTopColor: t.line }]}>
      <Label>{title}</Label>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.5)' },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRightWidth: 1, elevation: 12 },
  body: {},
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 18 },
  brand: { fontSize: 30, lineHeight: 30, fontFamily: FONT.black, textTransform: 'uppercase', letterSpacing: -1 },
  section: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
});
