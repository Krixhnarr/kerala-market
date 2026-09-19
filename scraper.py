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
