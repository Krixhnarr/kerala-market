// Every call here is the same RPC/table the website uses; nothing is
// app-specific on the server. Errors are thrown so screens can show them.
import { supabase } from './supabase';

const unwrap = ({ data, error }) => { if (error) throw error; return data; };

export const dataStatus = async () => (unwrap(await supabase.rpc('data_status')))[0] ?? null;
export const marketRates = async (marketId) => unwrap(await supabase.rpc('market_rates', { p_market_id: marketId }));
export const favouriteRates = async () => unwrap(await supabase.rpc('market_rates', { p_favourites: true }));
export const itemHistory = async (itemId, sinceIso) => unwrap(await supabase.rpc('item_history', { p_item_id: itemId, p_since: sinceIso }));

export const markets = async () => unwrap(await supabase.from('markets').select('id,name,name_ml,rank').order('rank').order('id'));

export const searchItems = async (q) => {
  const pat = `%${q.replace(/[,()"\%]/g, ' ').trim()}%`;
  const rows = unwrap(await supabase.from('items').select('id,name,name_ml,section,unit,markets(name,rank)')
    .or(`name.ilike.${pat},name_ml.ilike.${pat},section.ilike.${pat}`).limit(60));
  return rows.sort((a, b) => (a.markets.rank - b.markets.rank) || (a.id - b.id));
};
// Every item (a few hundred rows) for the sales item picker; filtered client-side.
export const allItems = async () => {
  const rows = unwrap(await supabase.from('items').select('id,name,name_ml,section,unit,markets(name,rank)').limit(2000));
  return rows.sort((a, b) => (a.markets.rank - b.markets.rank) || (a.id - b.id));
};
// Latest price + day change for a set of item ids (search results).
export const itemSummary = async (ids) => ids.length ? unwrap(await supabase.rpc('item_summary', { p_item_ids: ids })) : [];
// unit per item id, used to scale a ₹/kg sale onto a per-quintal chart.
export const itemUnits = async (ids) => {
  if (!ids.length) return {};
  const rows = unwrap(await supabase.from('items').select('id,unit').in('id', ids));
  return Object.fromEntries(rows.map(r => [r.id, r.unit]));
};

// ---- favourites (rows are the user's own; RLS scopes every query)
export const favouriteMarketIds = async () => (unwrap(await supabase.from('favourite_markets').select('market_id'))).map(r => r.market_id);
export const favouriteItemIds = async () => (unwrap(await supabase.from('favourite_items').select('item_id'))).map(r => r.item_id);
export const favouriteCounts = async () => {
  const [s, i] = await Promise.all([
    unwrap(await supabase.from('favourite_sections').select('market_id')),
    unwrap(await supabase.from('favourite_items').select('item_id')),
  ]);
  return s.length + i.length;
};
export const setFavMarket = (userId, id, on) => on
  ? supabase.from('favourite_markets').insert({ user_id: userId, market_id: id })
  : supabase.from('favourite_markets').delete().match({ user_id: userId, market_id: id });
export const setFavSection = (userId, marketId, section, on) => on
  ? supabase.from('favourite_sections').insert({ user_id: userId, market_id: marketId, section })
  : supabase.from('favourite_sections').delete().match({ user_id: userId, market_id: marketId, section });
export const setFavItem = (userId, itemId, on) => on
  ? supabase.from('favourite_items').insert({ user_id: userId, item_id: itemId })
  : supabase.from('favourite_items').delete().match({ user_id: userId, item_id: itemId });

// ---- households: a user with several homes/farms keeps each one's sales apart
export const households = async () => unwrap(await supabase.from('households').select('id,name').order('id'));
export const addHousehold = async (userId, name) => unwrap(await supabase.from('households').insert({ user_id: userId, name }).select('id,name').single());
export const renameHousehold = async (id, name) => unwrap(await supabase.from('households').update({ name }).eq('id', id));
export const deleteHousehold = async (id) => unwrap(await supabase.from('households').delete().eq('id', id));

// ---- My Sales ledger (householdId: undefined = all, null = unassigned only)
export const ledgerEntries = async (householdId) => {
  let q = supabase.from('ledger_entries').select('*').order('entry_date', { ascending: false }).order('id', { ascending: false });
  if (householdId === null) q = q.is('household_id', null);
  else if (householdId !== undefined) q = q.eq('household_id', householdId);
  return unwrap(await q);
};
export const addLedgerEntry = async (entry) => unwrap(await supabase.from('ledger_entries').insert(entry));
export const deleteLedgerEntry = async (id) => unwrap(await supabase.from('ledger_entries').delete().eq('id', id));

// ---- community shop rates (see migration 20260921100000_community.sql)
export const myRole = async () => (unwrap(await supabase.from('profiles').select('role').maybeSingle()))?.role ?? 'buyer';
export const communityMarkets = async () => unwrap(await supabase.from('community_markets').select('id,district,name,name_ml').eq('active', true).order('district').order('name'));
export const communityItems = async () => unwrap(await supabase.from('community_items').select('id,name,name_ml,unit').eq('active', true).order('sort').order('name'));
export const communityRates = async (marketId) => unwrap(await supabase.rpc('community_market_rates', { p_market_id: marketId ?? null }));
export const communityHistory = async (marketId, itemId, side, since) =>
  unwrap(await supabase.rpc('community_rate_history', { p_market_id: marketId, p_item_id: itemId, p_side: side, p_since: since }));

export const myShop = async () => unwrap(await supabase.from('shops').select('id,market_id,name,phone,status,reject_reason,community_markets(name,district)').maybeSingle());
export const applyShop = async (userId, marketId, name, phone) => unwrap(await supabase.from('shops').insert({ user_id: userId, market_id: marketId, name, phone }));
export const myPosts = async (shopId, sinceIso) => unwrap(await supabase.from('shop_rates')
  .select('id,item_id,side,price,rate_date,status,reject_reason,posted_at').eq('shop_id', shopId).gte('rate_date', sinceIso)
  .order('posted_at', { ascending: false }));
export const postRates = async (rows) => unwrap(await supabase.from('shop_rates').insert(rows));

// admin
export const adminPendingRates = async () => unwrap(await supabase.rpc('admin_pending_rates'));
export const adminPendingShops = async () => unwrap(await supabase.from('shops')
  .select('id,user_id,name,phone,created_at,community_markets(name,district)').eq('status', 'pending').order('created_at'));
export const reviewRate = async (id, approve, reason = '') => unwrap(await supabase.from('shop_rates')
  .update({ status: approve ? 'published' : 'rejected', reject_reason: reason, reviewed_at: new Date().toISOString() }).eq('id', id));
export const reviewShop = async (shop, approve, reason = '') => {
  unwrap(await supabase.from('shops').update({ status: approve ? 'approved' : 'rejected', reject_reason: reason, reviewed_at: new Date().toISOString() }).eq('id', shop.id));
  if (approve) unwrap(await supabase.from('profiles').update({ role: 'seller' }).eq('user_id', shop.user_id).eq('role', 'buyer'));
};
export const addCommunityMarket = async (district, name, name_ml = '') => unwrap(await supabase.from('community_markets').insert({ district, name, name_ml }));
export const addCommunityItem = async (name, name_ml = '', unit = 'kg') => unwrap(await supabase.from('community_items').insert({ name, name_ml, unit }));

// "3 h ago" / "yesterday" for a timestamp.
export const ago = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

// ---- formatting shared by screens
export const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(+n);
export const perKg = (unit, low, high) => unit !== 'quintal' || low == null ? ''
  : `≈ ₹${fmt(low / 100)}${high != null && +high !== +low ? '–' + fmt(high / 100) : ''}/kg`;
// Suffix printed after a price: gold is quoted per pavan (sovereign, 8 g).
export const unitLabel = (unit) => unit === 'sovereign' ? '/pavan' : unit === 'quintal' ? '/quintal' : '';
// Second line under a price: the unit plus the ₹/kg estimate where it applies.
export const unitLine = (unit, low, high) => {
  if (low == null) return '';
  if (unit === 'sovereign') return 'per pavan (8 g)';
  if (unit === 'quintal') return `per quintal · ${perKg(unit, low, high)}`;
  return '';
};
// What to print above the rates so a newspaper reader isn't misled by the date.
// Rates carry the market day they belong to; a day's own figures appear around
// midday, and Sundays/holidays have none - so a morning reader sees the previous
// trading day, exactly as the printed paper does.
export const dateNotice = (latestIso, fetchedAt) => {
  if (!latestIso) return { title: 'Loading…', body: '' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const latest = new Date(latestIso + 'T00:00:00');
  const gap = Math.round((today - latest) / 864e5);
  const dow = today.getDay();
  if (gap <= 0) return { title: `Today's rates · ${niceDate(latestIso)}`, body: `Published today${fetchedAt ? ', fetched ' + ago(fetchedAt) : ''}.` };
  const why = dow === 0 ? 'No trading on Sundays — Saturday\'s rates stand until Monday.'
    : gap === 1 ? 'Like the morning paper, this is the most recent trading day\'s rate; today\'s own figures come out around midday.'
    : 'Most recent trading day — no trading since (Sunday or holiday). Like the morning paper; today\'s own figures come out around midday.';
  return { title: `Rates for ${niceDate(latestIso)}`, body: why };
};
// "2026-09-19" -> "Sat 19 Sep"
export const niceDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
