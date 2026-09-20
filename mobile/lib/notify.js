// Price-move alerts for starred items. A background task (WorkManager on
// Android) wakes a few times a day, pulls the user's favourites and, if the
// market date is newer than the last one we told them about, posts one local
// notification listing what rose and fell. The same check also runs whenever
// the app comes to the foreground, so a phone that throttles background work
// still catches up on open.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { supabase } from './supabase';
import * as api from './api';

const TASK = 'kerala-market-price-check';
const K_ENABLED = 'notif:enabled';
const K_LAST = 'notif:lastDate';
const CHANNEL = 'prices';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export const isEnabled = async () => (await AsyncStorage.getItem(K_ENABLED)) === '1';

async function register() {
  try { await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 180 }); } catch {}
}

// Returns false if the OS refused notification permission.
export async function setEnabled(on) {
  if (!on) {
    await AsyncStorage.setItem(K_ENABLED, '0');
    try { await BackgroundTask.unregisterTaskAsync(TASK); } catch {}
    return true;
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Price changes', importance: Notifications.AndroidImportance.DEFAULT });
  }
  await AsyncStorage.setItem(K_ENABLED, '1');
  await register();
  return true;
}

// Called on app start: keep the background task registered across updates.
export async function ensureRegistered() {
  if (await isEnabled()) await register();
}

const line = (r) => {
  const c = +r.change;
  const pct = r.prev_low ? ` (${(Math.abs(c) / +r.prev_low * 100).toFixed(1)}%)` : '';
  return `${r.name || r.name_ml} ${c > 0 ? '▲' : '▼'} ₹${api.fmt(Math.abs(c))}${pct}`;
};

// One notification per market date, only when something starred moved.
export async function checkFavourites() {
  if (!(await isEnabled())) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const [status, rows] = await Promise.all([api.dataStatus(), api.favouriteRates()]);
  const date = status?.latest_date;
  if (!date || (await AsyncStorage.getItem(K_LAST)) === date) return false;
  await AsyncStorage.setItem(K_LAST, date);
  const moves = rows.filter(r => r.change != null && +r.change !== 0);
  if (!moves.length) return false;
  const body = moves.slice(0, 4).map(line).join('\n') + (moves.length > 4 ? `\n+${moves.length - 4} more` : '');
  await Notifications.scheduleNotificationAsync({
    content: { title: `Your favourites · ${api.niceDate(date)}`, body, ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) },
    trigger: null,
  });
  return true;
}

TaskManager.defineTask(TASK, async () => {
  try { await checkFavourites(); return BackgroundTask.BackgroundTaskResult.Success; }
  catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});
