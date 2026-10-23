// Investable products for a Spanish tax resident (UCITS ETFs, ETCs/ETPs listed in Europe and
// index funds). Facts verified on VERIFIED_ON against the sources listed per product. Fees and
// holdings change: the UI always shows the date and asks to check the KID before buying.
// This is data, not advice generated at runtime: every number here has a source.

import { PLAN_KEYS, type Bucket } from "@/lib/portfolio/types";

export const VERIFIED_ON = "2026-10-11";

export type PlanBucket = Exclude<Bucket, "other">;
export type AssetClass = "world" | "world_dev" | "world_imi" | "momentum" | "gold" | "silver" | "commodities" | "bonds" | "bitcoin" | "cash";
/** Spanish income tax treatment (see the Plan page): gain or capital income when sold, or interest taxed every year. */
export type TaxKind = "gain" | "rcm" | "interest";

/** The cash balance of your broker account is not a security: it has no ISIN. */
export const CASH_ACCOUNT = "CASH-ACCOUNT";

export interface Inside {
  asof: string;
  holdings: string; // e.g. "3,784 companies"
  top?: [string, number][]; // largest positions, weight as a fraction
  topShare?: number; // weight of the 10 largest
  usShare?: number;
  note?: string;
  source: string;
}

export interface Product {
  isin: string;
  name: string;
  short: string; // plain name for lists
  bucket: PlanBucket;
  assetClass: AssetClass;
  vehicle: "UCITS ETF" | "ETC" | "ETP" | "Index fund" | "Cash account";
  ter: number; // total expense ratio, fraction per year
  terNote?: string;
  index: string;
  coverage: string;
  distribution: "accumulating" | "no income" | "pays interest";
  domicile: string;
  tax: TaxKind;
  /** US-listed fund used only to measure how the asset class behaves (engine: market.proxies). */
  proxy?: string;
  /** Role in a portfolio, in one line. */
  role: string;
  recommended?: boolean;
  onTradeRepublic?: boolean; // false = not sold there (e.g. index funds)
  pros: string[];
  cons: string[];
  inside?: Inside;
  sources: string[];
}

export const PRODUCTS: Product[] = [
  // ------------------------------------------------------------------ core
  {
    isin: "IE00BK5BQT80",
    name: "Vanguard FTSE All-World UCITS ETF (USD) Accumulating",
    short: "Vanguard FTSE All-World",
    bucket: "core",
    assetClass: "world",
    vehicle: "UCITS ETF",
    ter: 0.0014,
    terNote: "cut from 0.19% in July 2026",
    index: "FTSE All-World",
    coverage: "Large and mid-sized companies in developed and emerging countries",
    distribution: "accumulating",
    domicile: "Ireland",
    tax: "gain",
    proxy: "ACWI",
    role: "The whole world stock market in one fund",
    recommended: true,
    pros: ["Developed and emerging markets in one fund", "0.14% a year", "Reinvests dividends: no tax until you sell"],
    cons: ["No small companies", "Like any world index, the US is about 60%"],
    inside: {
      asof: "2026-08-31",
      holdings: "3,784 companies",
      top: [["NVIDIA", 0.0477], ["Apple", 0.0424], ["Microsoft", 0.0349]],
      topShare: 0.236,
      usShare: 0.617,
      note: "Then Amazon, Alphabet, TSMC, Broadcom, Meta and Micron.",
      source: "https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits-etf-usd-accumulating",
    },
    sources: [
      "https://www.justetf.com/en/etf-profile.html?isin=IE00BK5BQT80",
      "https://www.boerse-global.de/vanguard-ftse-all-world-etf-ter-auf-014-prozent-gesenkt/827983",
    ],
  },
  {
    isin: "IE00B4L5Y983",
    name: "iShares Core MSCI World UCITS ETF USD (Acc)",
    short: "iShares Core MSCI World",
    bucket: "core",
    assetClass: "world_dev",
    vehicle: "UCITS ETF",
    ter: 0.002,
    index: "MSCI World",
    coverage: "Large and mid-sized companies in 23 developed countries (no emerging markets)",
    distribution: "accumulating",
    domicile: "Ireland",
    tax: "gain",
    proxy: "URTH",
    role: "Developed-world stocks only",
    pros: ["The largest and most traded world ETF in Europe", "Reinvests dividends"],
    cons: ["No emerging markets", "Dearer than the All-World (0.20% vs 0.14%)", "The US is over 70%"],
    inside: {
      asof: "2026-09-21",
      holdings: "about 1,300 companies",
      top: [["NVIDIA", 0.0568], ["Apple", 0.0541], ["Microsoft", 0.0384]],
      topShare: 0.276,
      usShare: 0.72,
      source: "https://www.justetf.com/en/etf-profile.html?isin=IE00B4L5Y983",
    },
    sources: ["https://www.trackingdifferences.com/ETF/ISIN/IE00B4L5Y983"],
  },
  {
    isin: "IE00BJ0KDQ92",
    name: "Xtrackers MSCI World UCITS ETF 1C",
    short: "Xtrackers MSCI World",
    bucket: "core",
    assetClass: "world_dev",
    vehicle: "UCITS ETF",
    ter: 0.0012,
    index: "MSCI World",
    coverage: "Same index as iShares Core MSCI World (developed only)",
    distribution: "accumulating",
    domicile: "Ireland",
    tax: "gain",
    proxy: "URTH",
    role: "Developed-world stocks only, cheapest",
    pros: ["The cheapest MSCI World here (0.12%)"],
    cons: ["No emerging markets", "Some sites still show the old 0.19% fee: check the KID"],
    sources: ["https://www.finanzfluss.de/informer/etf/IE00BJ0KDQ92/", "https://etfstream.com/etf-screener/XDWD"],
  },
  {
    isin: "IE00B3YLTY66",
    name: "SPDR MSCI ACWI IMI UCITS ETF (Acc)",
    short: "SPDR MSCI ACWI IMI",
    bucket: "core",
    assetClass: "world_imi",
    vehicle: "UCITS ETF",
    ter: 0.0017,
    index: "MSCI ACWI IMI",
    coverage: "Developed and emerging markets including small companies: the broadest",
    distribution: "accumulating",
    domicile: "Ireland",
    tax: "gain",
    proxy: "ACWI",
    role: "The whole world, small companies included",
    pros: ["Adds small companies (about 10% of the market)", "0.17% a year"],
    cons: ["Smaller fund than the others", "Renamed in 2026: search it by ISIN"],
    sources: ["https://www.ssga.com/se/en_gb/intermediary/etfs/spdr-msci-acwi-imi-ucits-etf-acc-spyi-gy"],
  },
  {
    isin: "IE00BYX5NX33",
    name: "Fidelity MSCI World Index Fund P-Acc-EUR",
    short: "Fidelity MSCI World (index fund)",
    bucket: "core",
    assetClass: "world_dev",
    vehicle: "Index fund",
    ter: 0.0012,
    index: "MSCI World",
    coverage: "Developed-world stocks (no emerging markets)",
    distribution: "accumulating",
    domicile: "Ireland",
    tax: "gain",
    proxy: "URTH",
    role: "Developed-world stocks with Spain's tax-free fund switching",
    onTradeRepublic: false,
    pros: [
      "A mutual fund: in Spain you can switch to another fund without paying tax (traspaso)",
      "0.12% a year",
    ],
    cons: ["Not sold on Trade Republic (use MyInvestor, Openbank, etc.)", "No emerging markets", "Priced once a day"],
    sources: ["https://www.fidelityinternational.com/FILPS/Documents/en/current/ret.en.xx.IE00BYX5NX33.pdf"],
  },
  // ------------------------------------------------------------ diversifiers
  {
    isin: "IE00B4ND3602",
    name: "iShares Physical Gold ETC",
    short: "Gold",
    bucket: "gold",
    assetClass: "gold",
    vehicle: "ETC",
    ter: 0.0012,
    index: "Gold price (LBMA)",
    coverage: "Backed by physical gold bars stored in London",
    distribution: "no income",
    domicile: "Ireland",
    tax: "rcm",
    proxy: "GLD",
    role: "Crisis cushion: often holds up or rises when stocks crash",
    recommended: true,
    pros: ["The best-documented crisis hedge (Baur & Lucey 2010)", "0.12% a year", "No income: tax only when you sell"],
    cons: [
      "Over decades it barely beats inflation and can lose half its value for years (Erb & Harvey 2013)",
      "An issuer's debt security backed by gold, not a fund",
    ],
    inside: { asof: VERIFIED_ON, holdings: "Gold bars", note: "Each share is backed by allocated gold held by the custodian.", source: "https://www.ishares.com/uk/individual/en/products/258441/ishares-physical-gold-etc-fund" },
    sources: ["https://www.ishares.com/uk/individual/en/products/258441/ishares-physical-gold-etc-fund"],
  },
  {
    isin: "IE00B579F325",
    name: "Invesco Physical Gold ETC",
    short: "Gold (Invesco)",
    bucket: "gold",
    assetClass: "gold",
    vehicle: "ETC",
    ter: 0.0012,
    index: "Gold price (LBMA)",
    coverage: "Gold bars in J.P. Morgan's London vault",
    distribution: "no income",
    domicile: "Ireland",
    tax: "rcm",
    proxy: "GLD",
    role: "Same as iShares Physical Gold: an equivalent alternative",
    pros: ["Same fee (0.12%) and structure as the iShares one"],
    cons: ["Same as above"],
    sources: ["https://extraetf.com/ch/etf-profile/IE00B579F325"],
  },
  {
    isin: "LU1650487413",
    name: "Amundi Euro Government Bond 1-3Y UCITS ETF Acc",
    short: "Short euro government bonds",
    bucket: "gold",
    assetClass: "bonds",
    vehicle: "UCITS ETF",
    ter: 0.0015,
    index: "Bloomberg Euro Treasury 50bn 1-3 Year",
    coverage: "Euro-area government bonds maturing in 1 to 3 years",
    distribution: "accumulating",
    domicile: "Luxembourg",
    tax: "gain",
    role: "The steadiest money you can own after cash: small swings, earns the euro interest rate",
    pros: ["Very small swings (a few % a year)", "Taxed like any ETF (capital gain), no currency risk"],
    cons: ["Low expected return", "Does not protect against inflation surprises (2022)"],
    sources: ["https://www.justetf.com/en/etf-profile.html?isin=LU1650487413"],
  },
  {
    isin: "IE00BDFL4P12",
    name: "iShares Diversified Commodity Swap UCITS ETF",
    short: "Broad commodities",
    bucket: "gold",
    assetClass: "commodities",
    vehicle: "UCITS ETF",
    ter: 0.0019,
    index: "Bloomberg Commodity Total Return",
    coverage: "Energy, metals, agriculture and livestock through futures",
    distribution: "accumulating",
    domicile: "Ireland",
    tax: "gain",
    proxy: "DBC",
    role: "Inflation hedge: tends to rise when prices surge (Gorton & Rouwenhorst 2006)",
    pros: ["Diversified across ~20 commodities", "A UCITS ETF: taxed as a normal capital gain"],
    cons: [
      "Returns since 2004 have been weak; rolling futures costs money (Bhardwaj, Gorton & Rouwenhorst 2015)",
      "Falls with stocks in recessions",
    ],
    sources: ["https://blackrock.com/uk/literature/fact-sheet/icom-ishares-diversified-commodity-swap-ucits-etf-fund-fact-sheet-en-gb.pdf"],
  },
  {
    isin: "IE00B4NCWG09",
    name: "iShares Physical Silver ETC",
    short: "Silver",
    bucket: "gold",
    assetClass: "silver",
    vehicle: "ETC",
    ter: 0.002,
    index: "Silver price (LBMA)",
    coverage: "Backed by physical silver bars",
    distribution: "no income",
    domicile: "Ireland",
    tax: "rcm",
    proxy: "SLV",
    role: "Gold's wilder cousin: half precious metal, half industrial",
    pros: ["Physically backed", "0.20% a year"],
    cons: ["About twice as volatile as gold", "Industrial demand makes it fall with the economy: a weaker hedge"],
    sources: ["https://extraetf.com/etf-profile/IE00B4NCWG09"],
  },
  {
    isin: "XS2940466316",
    name: "iShares Bitcoin ETP",
    short: "Bitcoin",
    bucket: "gold",
    assetClass: "bitcoin",
    vehicle: "ETP",
    ter: 0.0025,
    terNote: "0.15% until 31 Dec 2026",
    index: "Bitcoin price",
    coverage: "Backed by bitcoin held by a custodian",
    distribution: "no income",
    domicile: "Switzerland",
    tax: "rcm",
    proxy: "IBIT",
    role: "Speculation, not a safe haven: big potential, falls of 70%+ have happened several times",
    pros: ["Bitcoin without managing wallets or keys", "Physically backed"],
    cons: [
      "Extremely volatile; since 2020 it has often fallen together with stocks",
      "Its returns are not explained by any economic cash flow (Liu & Tsyvinski 2021)",
      "Spanish tax treatment of crypto ETPs is not explicitly ruled: likely the same as gold ETCs",
    ],
    sources: ["https://www.blackrock.com/uk/individual/products/337088/ishares-bitcoin-etp", "https://www.justetf.com/en/etf-profile.html?isin=XS2940466316"],
  },
  // ------------------------------------------------------------------ cash (optional block)
  {
    isin: CASH_ACCOUNT,
    name: "Cash in your Trade Republic account",
    short: "Trade Republic cash (interest)",
    bucket: "cash",
    assetClass: "cash",
    vehicle: "Cash account",
    ter: 0,
    index: "ECB deposit rate",
    coverage: "Your uninvested euros, paid interest that follows the ECB deposit rate",
    distribution: "pays interest",
    domicile: "Trade Republic Bank (Germany, Spanish branch)",
    tax: "interest",
    role: "Money you can use any day, earning interest, protected up to €100,000",
    recommended: true,
    pros: [
      "No fees and nothing to buy or sell",
      "Covered by the deposit guarantee up to €100,000",
      "With a Spanish IBAN, Trade Republic withholds the 19% for Hacienda on each payment",
    ],
    cons: [
      "Interest is taxed every year (19-30%), even if you leave it there",
      "The rate falls when the ECB cuts rates; check the current rate and limit in the app",
      "After inflation it barely grows: it is for safety, not for growth",
    ],
    sources: [
      "https://support.traderepublic.com/es-es",
      "https://www.rankia.com/blog/cuentas-corrientes/6780762-declarar-intereses-trade-republic",
    ],
  },
  {
    isin: "LU0290358497",
    name: "Xtrackers II EUR Overnight Rate Swap UCITS ETF 1C",
    short: "Euro overnight rate ETF (XEON)",
    bucket: "cash",
    assetClass: "cash",
    vehicle: "UCITS ETF",
    ter: 0.001,
    index: "Solactive €STR +8.5 Daily",
    coverage: "Earns the euro overnight interest rate (€STR) day by day, through a fully collateralised swap",
    distribution: "accumulating",
    domicile: "Luxembourg",
    tax: "gain",
    role: "Cash-like, earning about the ECB rate, taxed only when you sell",
    pros: ["Reinvests the interest: no tax until you sell", "Moves very little (follows the overnight rate)", "One of Europe's largest funds (over €20bn)"],
    cons: [
      "Not covered by the deposit guarantee (it is a fund; its assets are kept apart from the issuer)",
      "Each buy or sell costs the broker fee (savings plans are usually free)",
      "0.10% a year",
    ],
    sources: ["https://www.finect.com/etfs/LU0290358497-Xtrackers_ii_eur_overnight_rt_swap_etf1c", "https://www.etfstream.com/etf-screener/XEON"],
  },
  // ------------------------------------------------------------------ momentum
  {
    isin: "IE00BP3QZ825",
    name: "iShares Edge MSCI World Momentum Factor UCITS ETF",
    short: "World momentum ETF",
    bucket: "momentum",
    assetClass: "momentum",
    vehicle: "UCITS ETF",
    ter: 0.0025,
    index: "MSCI World Momentum",
    coverage: "About 350 developed-world companies with the strongest 6 and 12-month trends, risk-adjusted",
    distribution: "accumulating",
    domicile: "Ireland",
    tax: "gain",
    role: "The radar's idea, already diversified and with no tax on each rotation",
    recommended: true,
    pros: [
      "Same idea as the radar (6 and 12-month trend adjusted for volatility)",
      "The fund rotates inside: you do not sell, so you do not pay tax on each change",
      "Works with small monthly amounts",
    ],
    cons: ["0.25% a year", "Rebalances every 6 months: slower than the radar"],
    inside: { asof: VERIFIED_ON, holdings: "about 350 companies", note: "Holdings change at each semi-annual rebalance; see the issuer factsheet.", source: "https://www.finanzfluss.de/informer/etf/ie00bp3qz825/" },
    sources: ["https://www.finanzfluss.de/informer/etf/ie00bp3qz825/", "https://extraetf.com/etf-profile/IE00BP3QZ825"],
  },
];

export const BUCKET_NAME: Record<PlanBucket, string> = {
  core: "Core",
  gold: "Diversifiers",
  momentum: "Momentum",
  cash: "Cash",
};

export function productsFor(bucket: PlanBucket): Product[] {
  return PRODUCTS.filter((p) => p.bucket === bucket).sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended));
}

export function recommended(bucket: PlanBucket): Product {
  const p = PRODUCTS.find((x) => x.bucket === bucket && x.recommended);
  if (!p) throw new Error(`no recommended product for ${bucket}`);
  return p;
}

export function byIsin(isin: string): Product | undefined {
  return PRODUCTS.find((p) => p.isin === isin);
}

/** ISIN check digit (ISO 6166): letters -> numbers, then Luhn mod 10. */
export function isinValid(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const digits = isin
    .slice(0, 11)
    .split("")
    .map((c) => (c >= "A" && c <= "Z" ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let sum = 0;
  let double = true; // rightmost digit of the payload is doubled
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10 === Number(isin[11]);
}

/**
 * Momentum sleeve: below this amount, ten equal positions would be under ~500 € each and the
 * broker's fixed fee per order weighs too much: the momentum ETF is the sensible choice.
 */
export const MIN_SLEEVE_FOR_STOCKS_EUR = 5000;
export const STOCK_POSITIONS = 10;

export function momentumRoute(sleeveValueEur: number): "etf" | "stocks" {
  return sleeveValueEur >= MIN_SLEEVE_FOR_STOCKS_EUR ? "stocks" : "etf";
}

// ------------------------------------------------------------------ choices

/** What the user holds in each block: product ISIN -> share of the block (sums to 1). */
export type Choices = Partial<Record<PlanBucket, { isin: string; weight: number }[]>>;

export function defaultChoices(): Required<Choices> {
  return {
    core: [{ isin: recommended("core").isin, weight: 1 }],
    gold: [{ isin: recommended("gold").isin, weight: 1 }],
    momentum: [{ isin: recommended("momentum").isin, weight: 1 }],
    cash: [{ isin: recommended("cash").isin, weight: 1 }],
  };
}

/** Valid, normalised choices: unknown ISINs dropped, weights clamped and summing to 1, defaults filled. */
export function normaliseChoices(c: Choices | null | undefined): Required<Choices> {
  const out = defaultChoices();
  for (const b of Object.keys(out) as PlanBucket[]) {
    const list = (c?.[b] ?? []).filter((x) => byIsin(x.isin)?.bucket === b && Number.isFinite(x.weight) && x.weight > 0);
    const merged = new Map<string, number>();
    for (const x of list) merged.set(x.isin, (merged.get(x.isin) ?? 0) + x.weight);
    const total = [...merged.values()].reduce((s, w) => s + w, 0);
    if (total > 0) out[b] = [...merged.entries()].map(([isin, w]) => ({ isin, weight: w / total }));
  }
  return out;
}

/** Split each block's euros across the chosen products. */
export function splitByProduct(amounts: Partial<Record<PlanBucket, number>>, choices: Required<Choices>): { bucket: PlanBucket; product: Product; amount: number }[] {
  const out: { bucket: PlanBucket; product: Product; amount: number }[] = [];
  for (const b of PLAN_KEYS) {
    for (const c of choices[b]) {
      const p = byIsin(c.isin);
      if (p) out.push({ bucket: b, product: p, amount: (amounts[b] ?? 0) * c.weight });
    }
  }
  return out;
}

// ------------------------------------------------------------------ core chooser

export interface CoreAnswers {
  emerging: boolean; // include China, India, Taiwan...
  small: boolean; // include small companies
  taxFreeSwitch: boolean; // wants Spain's tax-free fund switching (index funds, not on Trade Republic)
}

/** Picks the core product from three plain questions. Pure and tested. */
export function chooseCore(a: CoreAnswers): { isin: string; why: string[] } {
  if (a.taxFreeSwitch) {
    return {
      isin: "IE00BYX5NX33",
      why: [
        "Only mutual funds can be switched without tax in Spain; ETFs cannot.",
        "This one tracks the MSCI World for 0.12%. It is not on Trade Republic.",
        ...(a.emerging ? ["For emerging markets add an emerging-markets index fund (about 10% of the block)."] : []),
      ],
    };
  }
  if (a.emerging && a.small) return { isin: "IE00B3YLTY66", why: ["The only option with developed, emerging and small companies.", "0.17% a year."] };
  if (a.emerging) return { isin: "IE00BK5BQT80", why: ["The whole world (developed + emerging) in one fund.", "The cheapest world-wide option: 0.14% a year."] };
  return { isin: "IE00BJ0KDQ92", why: ["Developed countries only.", "The cheapest MSCI World: 0.12% a year."] };
}

/** Portfolio instrument type for a catalog product (ETPs are debt securities like ETCs for tax). */
export function instrumentKind(p: Product): "etf" | "etc" | "fund" | "other" {
  if (p.vehicle === "Cash account") return "other";
  return p.vehicle === "Index fund" ? "fund" : p.vehicle === "UCITS ETF" ? "etf" : "etc";
}

/** The answers that lead to a given core product (so the chooser opens on your current choice). */
export function answersFor(isin: string): CoreAnswers {
  const p = byIsin(isin);
  if (p?.vehicle === "Index fund") return { emerging: false, small: false, taxFreeSwitch: true };
  if (p?.assetClass === "world_imi") return { emerging: true, small: true, taxFreeSwitch: false };
  if (p?.assetClass === "world_dev") return { emerging: false, small: false, taxFreeSwitch: false };
  return { emerging: true, small: false, taxFreeSwitch: false };
}
