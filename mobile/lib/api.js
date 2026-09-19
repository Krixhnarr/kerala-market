// Every call here is the same RPC/table the website uses; nothing is
// app-specific on the server. Errors are thrown so screens can show them.
import { supabase } from './supabase';

// Item IDs pinned as tiles (Manorama's itemId; stable across years).
export const FEATURED = [254, 256, 267, 196, 263, 147];

const unwrap = ({ data, error }) => { if (error) throw error; return data; };

export const dataStatus = async () => (unwrap(await supabase.rpc('data_status')))[0] ?? null;
export const itemSummary = async (ids) => unwrap(await supabase.rpc('item_summary', { p_item_ids: ids }));
export const marketRates = async (marketId) => unwrap(await supabase.rpc('market_rates', { p_market_id: marketId }));
export const favouriteRates = async () => unwrap(await supabase.rpc('market_rates', { p_favourites: true }));
export const itemHistory = async (itemId, sinceIso) => unwrap(await supabase.rpc('item_history', { p_item_id: itemId, p_since: sinceIso }));

export const markets = async () => unwrap(await supabase.from('markets').select('id,name,name_ml,rank').order('rank').order('id'));

export const searchItems = async (q) => {
  const pat = `%${q.replace(/[,()"\%]/g, ' ').trim()}%`;
  const rows = unwrap(await supabase.from('items').select('id,name,name_ml,section,markets(name,rank)')
    .or(`name.ilike.${pat},name_ml.ilike.${pat},section.ilike.${pat}`).limit(60));
  return rows.sort((a, b) => (a.markets.rank - b.markets.rank) || (a.id - b.id));
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

// ---- My Sales ledger
export const ledgerEntries = async () => unwrap(await supabase.from('ledger_entries').select('*')
  .order('entry_date', { ascending: false }).order('id', { ascending: false }));
export const addLedgerEntry = async (entry) => unwrap(await supabase.from('ledger_entries').insert(entry));
export const deleteLedgerEntry = async (id) => unwrap(await supabase.from('ledger_entries').delete().eq('id', id));

// ---- formatting shared by screens
export const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(+n);
export const perKg = (unit, low, high) => unit !== 'quintal' || low == null ? ''
  : `≈ ₹${fmt(low / 100)}${high != null && +high !== +low ? '–' + fmt(high / 100) : ''}/kg`;
