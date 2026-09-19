import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { supabase } from './lib/supabase';
import { useTheme, DARK } from './lib/theme';
import { Kasavu } from './components/ui';
import MarketScreen from './screens/MarketScreen';
import ChartScreen from './screens/ChartScreen';
import SalesScreen from './screens/SalesScreen';
import AuthScreen from './screens/AuthScreen';

const TABS = [['market', 'Market'], ['chart', 'Charts'], ['sales', 'My Sales']];

export default function App() {
  const t = useTheme();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('market');
  const [auth, setAuth] = useState({ open: false, message: '' });
  const [selected, setSelected] = useState([]);   // items on the chart

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { SystemUI.setBackgroundColorAsync(t.bg); }, [t.bg]);

  const openAuth = useCallback((message = '') => setAuth({ open: true, message }), []);
  const requireUser = useCallback(() => {
    if (user) return true;
    openAuth('Sign in to save favourites.');
    return false;
  }, [user, openAuth]);

  // Tapping a price on the Market tab adds it to the chart and switches tabs.
  const onChartItem = (item) => {
    setSelected(sel => sel.some(s => s.id === item.id) ? sel : [...(sel.length >= 4 ? sel.slice(1) : sel), item]);
    setTab('chart');
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: t.bg }]}>
      <StatusBar style={t === DARK ? 'light' : 'dark'} />
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: t.ink }]}>Kerala Market</Text>
          <Text style={[s.sub, { color: t.secondary }]}>വിപണി നിലവാരം · Malayala Manorama</Text>
        </View>
        {user ? <Text style={{ color: t.muted, fontSize: 12, maxWidth: 140 }} numberOfLines={1}>{user.email}</Text> : null}
        <Pressable onPress={() => user ? supabase.auth.signOut() : openAuth()} style={[s.authBtn, { borderColor: t.line, backgroundColor: t.surface }]}>
          <Text style={{ color: t.ink, fontSize: 13 }}>{user ? 'Sign out' : 'Sign in'}</Text>
        </Pressable>
      </View>
      <Kasavu />

      <View style={{ flex: 1 }}>
        {tab === 'market' && <MarketScreen user={user} requireUser={requireUser} onChartItem={onChartItem} />}
        {tab === 'chart' && <ChartScreen selected={selected} setSelected={setSelected} />}
        {tab === 'sales' && <SalesScreen user={user} openAuth={() => openAuth()} />}
      </View>

      <View style={[s.tabbar, { backgroundColor: t.surface, borderTopColor: t.line }]}>
        {TABS.map(([id, label]) => {
          const on = tab === id;
          return (
            <Pressable key={id} onPress={() => setTab(id)} style={s.tabBtn} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <View style={{ height: 3, width: 28, borderRadius: 2, backgroundColor: on ? t.gold : 'transparent', marginBottom: 6 }} />
              <Text style={{ color: on ? t.accent : t.secondary, fontSize: 13, fontWeight: on ? '600' : '400' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <AuthScreen visible={auth.open} message={auth.message} onClose={() => setAuth({ open: false, message: '' })} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: '600' },
  sub: { fontSize: 12 },
  authBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: 6 },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 8 },
});
