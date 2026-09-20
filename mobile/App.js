import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, InterTight_400Regular, InterTight_500Medium, InterTight_700Bold, InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight';
import { supabase } from './lib/supabase';
import { useTheme, FONT } from './lib/theme';
import * as api from './lib/api';
import * as notify from './lib/notify';
import Drawer from './components/Drawer';
import MarketScreen from './screens/MarketScreen';
import ChartScreen from './screens/ChartScreen';
import SalesScreen from './screens/SalesScreen';
import SellerScreen from './screens/SellerScreen';
import AdminScreen from './screens/AdminScreen';
import AuthScreen from './screens/AuthScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

const BASE_TABS = [['market', 'Market'], ['chart', 'Charts'], ['sales', 'My Sales']];

export default function App() {
  return <SafeAreaProvider><Root /></SafeAreaProvider>;
}

function Root() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [fontsReady] = useFonts({ InterTight_400Regular, InterTight_500Medium, InterTight_700Bold, InterTight_800ExtraBold });
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('market');
  const [menu, setMenu] = useState(false);
  const [auth, setAuth] = useState({ open: false, message: '' });
  const [selected, setSelected] = useState([]);   // items on the chart
  const [households, setHouseholds] = useState([]);
  const [role, setRole] = useState('buyer');     // buyer | seller | admin (profiles.role)
  const [shop, setShop] = useState(null);        // the user's shop application, if any

  // Seller tab appears once the user has applied (or is a seller/admin); Admin tab for the admin.
  const TABS = [...BASE_TABS,
    ...(shop || role !== 'buyer' ? [['seller', 'Post rates']] : []),
    ...(role === 'admin' ? [['admin', 'Admin']] : [])];

  const reloadShop = useCallback(async () => {
    if (!user) { setShop(null); setRole('buyer'); return; }
    try { const [r, sh] = await Promise.all([api.myRole(), api.myShop()]); setRole(r); setShop(sh); }
    catch { setRole('buyer'); setShop(null); }   // community tables not migrated yet -> plain buyer app
  }, [user]);
  useEffect(() => { reloadShop(); }, [reloadShop]);
  useEffect(() => { if (!TABS.some(([id]) => id === tab)) setTab('market'); }, [TABS.length]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { SystemUI.setBackgroundColorAsync(t.bg); }, [t.bg]);
  useEffect(() => { if (fontsReady) SplashScreen.hideAsync().catch(() => {}); }, [fontsReady]);

  // Price alerts: keep the background task registered and also check on every
  // return to the foreground (covers phones that throttle background work).
  useEffect(() => {
    notify.ensureRegistered();
    const run = () => notify.checkFavourites().catch(() => {});
    run();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') run(); });
    return () => sub.remove();
  }, [user]);

  const reloadHouseholds = useCallback(async () => {
    if (!user) { setHouseholds([]); return; }
    try { setHouseholds(await api.households()); } catch { setHouseholds([]); }
  }, [user]);
  useEffect(() => { reloadHouseholds(); }, [reloadHouseholds]);

  const openAuth = useCallback((message = '') => setAuth({ open: true, message }), []);
  const closeMenu = useCallback(() => setMenu(false), []);
  const requireUser = useCallback(() => {
    if (user) return true;
    openAuth('Sign in to save favourites.');
    return false;
  }, [user, openAuth]);

  // Tapping a price on the Market tab (or a sale) adds it to the chart and switches tabs.
  const onChartItem = (item) => {
    setSelected(sel => sel.some(s => s.id === item.id) ? sel : [...(sel.length >= 4 ? sel.slice(1) : sel), item]);
    setTab('chart');
  };

  if (!fontsReady) return null;
  return (
    <View style={[s.root, { backgroundColor: t.accent, paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={[s.header, { backgroundColor: t.accent }]}>
        <Pressable onPress={() => setMenu(true)} hitSlop={12} style={s.menuBtn} accessibilityRole="button" accessibilityLabel="Menu">
          <View style={{ gap: 4 }}>
            <View style={[s.bar, { backgroundColor: t.onAccent }]} />
            <View style={[s.bar, { backgroundColor: t.onAccent, width: 18 }]} />
            <View style={[s.bar, { backgroundColor: t.onAccent }]} />
          </View>
          <Text style={[s.menuWord, { color: t.onAccent }]}>Menu</Text>
        </Pressable>
        <Text style={[s.title, { color: t.onAccent }]} numberOfLines={1}>Kerala Market</Text>
      </View>

      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {tab === 'market' && <MarketScreen user={user} requireUser={requireUser} onChartItem={onChartItem} />}
        {tab === 'chart' && <ChartScreen selected={selected} setSelected={setSelected} user={user} />}
        {tab === 'sales' && <SalesScreen user={user} openAuth={() => openAuth()} households={households} onChartItem={onChartItem} />}
        {tab === 'seller' && <SellerScreen user={user} openAuth={() => openAuth()} shop={shop} onShopChange={reloadShop} />}
        {tab === 'admin' && <AdminScreen />}
      </View>

      <View style={[s.tabbar, { backgroundColor: t.surface, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
        {TABS.map(([id, label]) => {
          const on = tab === id;
          return (
            <Pressable key={id} onPress={() => setTab(id)} style={s.tabBtn} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <View style={{ height: 3, alignSelf: 'stretch', backgroundColor: on ? t.accent : 'transparent', marginBottom: 10 }} />
              <Text style={{ color: on ? t.ink : t.muted, fontSize: 12, fontFamily: FONT.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Drawer visible={menu} onClose={closeMenu} user={user} openAuth={openAuth} role={role} shop={shop}
        goSeller={() => { closeMenu(); if (!user) openAuth('Sign in to register your shop.'); else setTab('seller'); }}
        signOut={() => supabase.auth.signOut()} households={households} reloadHouseholds={reloadHouseholds} />
      <AuthScreen visible={auth.open} message={auth.message} onClose={() => setAuth({ open: false, message: '' })} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingRight: 6 },
  bar: { width: 24, height: 2.5 },
  title: { flex: 1, fontSize: 24, fontFamily: FONT.black, textTransform: 'uppercase', letterSpacing: -0.8, textAlign: 'right' },
  menuWord: { fontSize: 11, fontFamily: FONT.bold, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.9 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1 },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 6 },
});
