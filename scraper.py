"""Fetch daily commodity rates from Manorama Online's market feed.

The market page (manoramaonline.com/business/commodity-market-prices-live-updates.html)
is filled client-side from a JSON feed, so we read the feed directly:

    { "18/09/2026": [ { "marketId": 37, "marketNameEnglish": "Kochi", "marketName": "കൊച്ചി",
                        "subMarkets": [ { "subMarketNameEng": "Kochi", "subMarketName": "കൊച്ചി",
                                          "marketItems": [ { "itemId": 254, "item": "വെളിച്ചെണ്ണ തയ്യാർ",
                                                             "itemEnglish": "Coconut Oil Ready",
                                                             "value": "25,400" }, ... ] } ] }, ... ] }

Values appear as "25,400", "1,13,240" (Indian grouping) or "1,750-1,900" (range).
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import date, datetime

import requests

FEED_URL = "https://appdata.manoramaonline.com/common/MMOnlineVipani/market/marketVipani.json"
PAGE_URL = "https://www.manoramaonline.com/business/commodity-market-prices-live-updates.html"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
    ),
    "Referer": PAGE_URL,
}

_price_re = re.compile(r"\d[\d,]*(?:\.\d+)?")


@dataclass
class Rate:
    date: date
    market_id: int
    market_rank: int
    market: str
    market_ml: str
    section: str
    section_ml: str
    item_id: int
    item: str
    item_ml: str
    price_low: float | None
    price_high: float | None
    unit: str
    raw: str


def _clean(text: str) -> str:
    # Collapse whitespace and drop zero-width (non-)joiners that vary between days
    # for the same Malayalam word, so names stay stable across scrapes.
    return re.sub(r"\s+", " ", (text or "").replace("\u200d", "").replace("\u200c", "")).strip()


def parse_price(raw: str) -> tuple[float | None, float | None]:
    """'25,400' -> (25400, 25400); '1,750-1,900' -> (1750, 1900); '' -> (None, None)."""
    nums = [float(n.replace(",", "")) for n in _price_re.findall(raw)]
    if not nums:
        return None, None
    if len(nums) == 1:
        return nums[0], nums[0]
    return min(nums[:2]), max(nums[:2])


# Manorama's rates use several units and the feed carries no unit field, so a
# ₹/kg figure is only shown for commodities positively confirmed as quoted
# per quintal (100 kg) - checked against independent Kerala mandi listings
# (copra, arecanut, pepper). The commodity identity is often carried by the
# SECTION or even the MARKET rather than repeated in every item name (e.g.
# Kochi's "Black Pepper" section lists grades just as "Garbled"/"Ungarbled";
# the whole "Kottayam Rubber Board" market is rubber), so classification
# looks at item + section + market together, in both languages.
#
# The spice family (nutmeg, mace, clove, cardamom) is deliberately NOT on this
# list: within this feed those print few-hundred to low-thousand values that
# only make sense as an already-per-kg price (dividing by 100 would put
# clove, say, at nine rupees a kilo) - no conversion is safer than a wrong
# one. A handful of items are explicitly labelled by Manorama itself as
# "Per Kg"/"Per Litre" (small retail lots alongside the bulk quintal rate for
# the same commodity, e.g. "Coconut Oil Per Kg" beside "Coconut Oil Ready");
# those are excluded outright rather than guessed at. As a last safety net, a
# price under ₹1,000 never gets a quintal conversion - every genuine quintal
# rate in this feed prints well above that, so anything lower matching a
# keyword is far more likely a mislabelled per-kg line than a real bargain.
_QUINTAL_RE = re.compile(
    "|".join([
        r"കൊപ്ര", r"copra", r"faq", r"എഫ്എക്യു",                       # copra
        r"അടയ്ക്ക", r"അടക്ക", r"കൊട്ടയ്ക്ക", r"കൊട്ടപ്പാക്ക്",
        r"areca", r"betel\s*nut", r"kottapak",                          # arecanut
        r"കുരുമുളക്", r"pepper",                                        # pepper
        r"വെളിച്ചെണ്ണ", r"coconut\s*oil",                               # coconut oil
        r"ചുക്ക്", r"dry\s*ginger", r"ginger",                          # dry ginger
        r"മഞ്ഞൾ", r"turmeric",                                         # turmeric
        r"പച്ചരി", r"പുഴുക്കൽ", r"\brice\b",                            # rice
        r"പഞ്ചസാര", r"\bsugar\b",                                      # sugar
        r"പിണ്ണാക്ക്", r"oil\s*cake",                                   # oil cake
        r"കശുവണ്ടി", r"cashew",                                        # cashew
        r"കൊക്കോ", r"cocoa",                                           # cocoa
        r"കയർ", r"\bcoir\b",                                           # coir
        r"കാഞ്ഞിരക്കുരു", r"nux.?vomica",                              # nux vomica
        r"നെല്ല്", r"paddy",                                           # paddy
        r"കാപ്പി", r"coffee",                                          # coffee
        r"റബ്ബർ", r"റബർ", r"ആർഎസ്എസ്",
        r"\brubber\b", r"\brss\s*\d", r"\bisnr\b", r"\bdrc\b", r"\blatex\b",  # rubber
    ]),
    re.IGNORECASE,
)
_GOLD_RE = re.compile(r"സ്വർണം|gold", re.IGNORECASE)
_EXPLICIT_UNIT_RE = re.compile(r"per\s*kg|per\s*litre|per\s*liter|/\s*kg|\bkg\b|litre|liter|ലിറ്റർ", re.IGNORECASE)
QUINTAL_MIN_PRICE = 1000


def classify_unit(
    name_ml: str, name: str, section: str, section_ml: str,
    market: str, market_ml: str, price_low: float | None,
) -> str:
    """'quintal' (show a computed ₹/kg alongside), 'sovereign' (gold), or
    'other' (everything else - no conversion is safer than a wrong one)."""
    own = f"{name_ml} {name}"
    context = f"{own} {section} {section_ml} {market} {market_ml}"
    if _GOLD_RE.search(own):
        return "sovereign"
    if _EXPLICIT_UNIT_RE.search(own):
        return "other"
    if _QUINTAL_RE.search(context) and price_low is not None and price_low >= QUINTAL_MIN_PRICE:
        return "quintal"
    return "other"


def parse_feed(data: dict) -> tuple[date, list[Rate]]:
    if not data:
        raise ValueError("empty feed")
    date_str, markets = next(iter(data.items()))
    rate_date = datetime.strptime(date_str.strip(), "%d/%m/%Y").date()

    rates: list[Rate] = []
    for m in markets:
        for sm in m.get("subMarkets", []):
            for it in sm.get("marketItems", []):
                raw = _clean(str(it.get("value", "")))
                low, high = parse_price(raw)
                rates.append(
                    Rate(
                        date=rate_date,
                        market_id=int(m["marketId"]),
                        market_rank=int(m.get("marketRank") or 0),
                        market=_clean(m.get("marketNameEnglish")),
                        market_ml=_clean(m.get("marketName")),
                        section=_clean(sm.get("subMarketNameEng")),
                        section_ml=_clean(sm.get("subMarketName")),
                        item_id=int(it["itemId"]),
                        item=_clean(it.get("itemEnglish")),
                        item_ml=_clean(it.get("item")),
                        price_low=low,
                        price_high=high,
                        unit=classify_unit(
                            _clean(it.get("item")), _clean(it.get("itemEnglish")),
                            sm.get("subMarketNameEng") or "", sm.get("subMarketName") or "",
                            m.get("marketNameEnglish") or "", m.get("marketName") or "",
                            low,
                        ),
                        raw=raw,
                    )
                )
    if not rates:
        raise ValueError("feed contained no rates - format may have changed")
    return rate_date, rates


def fetch_feed(url: str = FEED_URL, timeout: int = 30) -> dict:
    resp = requests.get(url, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def scrape() -> tuple[date, list[Rate]]:
    return parse_feed(fetch_feed())


if __name__ == "__main__":
    d, rows = scrape()
    print(f"{d}: {len(rows)} rates across {len({r.market for r in rows})} markets")
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    for r in rows[:limit]:
        print(f"  {r.market:<12} {r.section:<16} {r.item:<30} {r.raw:>14}")
