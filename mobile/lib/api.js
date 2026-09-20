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
// "2026-09-19" -> "Sat 19 Sep"
export const niceDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
