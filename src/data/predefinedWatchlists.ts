import { NIFTY_50_CONSTITUENTS } from "@/data/nifty50";

export interface WatchlistConstituent {
  symbol: string;         // Official NSE Trading Symbol
  companyName: string;    // Display Company Name
  exchange: string;       // Exchange Segment (NSE_EQ)
  sector: string;         // Industry Group
}

export interface PredefinedWatchlistGroup {
  id: string;
  name: string;
  items: WatchlistConstituent[];
}

export const PREDEFINED_WATCHLIST_GROUPS: PredefinedWatchlistGroup[] = [
  {
    id: "nifty50",
    name: "NIFTY 50",
    items: NIFTY_50_CONSTITUENTS.map(c => ({
      symbol: c.symbol,
      companyName: c.companyName,
      exchange: c.exchange,
      sector: c.sector
    }))
  },
  {
    id: "nifty-finance",
    name: "NIFTY FINANCE",
    items: [
      { symbol: "AXISBANK", companyName: "Axis Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "BAJAJFINSV", companyName: "Bajaj Finserv Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "BAJFINANCE", companyName: "Bajaj Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "BSE", companyName: "BSE Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "CHOLAFIN", companyName: "Cholamandalam Investment and Finance Co Ltd", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "HDFCBANK", companyName: "HDFC Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "HDFCLIFE", companyName: "HDFC Life Insurance Co. Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "ICICIBANK", companyName: "ICICI Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "ICICILOMB", companyName: "ICICI Lombard General Insurance Co Ltd", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "JIOFIN", companyName: "Jio Financial Services Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "KOTAKBANK", companyName: "Kotak Mahindra Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "LICHSGFIN", companyName: "LIC Housing Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "MAXFSL", companyName: "Max Financial Services Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "MUTHOOTFIN", companyName: "Muthoot Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "PFC", companyName: "Power Finance Corporation Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "REC", companyName: "REC Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "SBICARD", companyName: "SBI Cards and Payment Services Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "SBILIFE", companyName: "SBI Life Insurance Company Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "SBIN", companyName: "State Bank of India", exchange: "NSE_EQ", sector: "Financial Services" },
      { symbol: "SHRIRAMFIN", companyName: "Shriram Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services" },
    ]
  },
  {
    id: "nifty-auto",
    name: "NIFTY AUTO",
    items: [
      { symbol: "ASHOKLEY", companyName: "Ashok Leyland Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "BAJAJ-AUTO", companyName: "Bajaj Auto Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "BHARATFORG", companyName: "Bharat Forge Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "BOSCHLTD", companyName: "Bosch Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "EICHERMOT", companyName: "Eicher Motors Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "HEROMOTOCO", companyName: "Hero MotoCorp Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "HYUNDAI", companyName: "Hyundai Motor India Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "M&M", companyName: "Mahindra & Mahindra Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "MARUTI", companyName: "Maruti Suzuki India Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "MOTHERSON", companyName: "Samvardhana Motherson International Ltd", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "SONACOMS", companyName: "Sona BLW Precision Forgings Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "TATAMOTORS", companyName: "Tata Motors Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "TIINDIA", companyName: "Tube Investments of India Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "TVSMOTOR", companyName: "TVS Motor Company Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
      { symbol: "UNOMINDA", companyName: "Uno Minda Ltd.", exchange: "NSE_EQ", sector: "Automobile" },
    ]
  },
  {
    id: "nifty-fmcg",
    name: "NIFTY FMCG",
    items: [
      { symbol: "BRITANNIA", companyName: "Britannia Industries Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "COLPAL", companyName: "Colgate Palmolive (India) Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "DABUR", companyName: "Dabur India Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "GODFRYPHLP", companyName: "Godfrey Phillips India Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "GODREJCP", companyName: "Godrej Consumer Products Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "HINDUNILVR", companyName: "Hindustan Unilever Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "ITC", companyName: "ITC Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "MARICO", companyName: "Marico Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "NESTLEIND", companyName: "Nestle India Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "PATANJALI", companyName: "Patanjali Foods Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "RADICO", companyName: "Radico Khaitan Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "TATACONSUM", companyName: "Tata Consumer Products Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "UBL", companyName: "United Breweries Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "MCDOWELL-N", companyName: "United Spirits Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
      { symbol: "VBL", companyName: "Varun Beverages Ltd.", exchange: "NSE_EQ", sector: "FMCG" },
    ]
  },
  {
    id: "nifty-india-def",
    name: "NIFTY India Def",
    items: [
      { symbol: "AEQUS", companyName: "Aequus Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "APOLLO", companyName: "Apollo Micro Systems Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "ASTRA-MIC", companyName: "Astra Microwave Products Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "AXISCADES", companyName: "Axiscades Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "BDL", companyName: "Bharat Dynamics Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "BEML", companyName: "BEML Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "BEL", companyName: "Bharat Electronics Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "BHARATFORG", companyName: "Bharat Forge Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "COCHINSHIP", companyName: "Cochin Shipyard Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "DATAPATTNS", companyName: "Data Patterns (India) Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "DYNAMATIC", companyName: "Dynamatic Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "GRSE", companyName: "Garden Reach Shipbuilders & Engineers Ltd", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "HAL", companyName: "Hindustan Aeronautics Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "MAZDOCK", companyName: "Mazagon Dock Shipbuilders Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "MIDHANI", companyName: "Mishra Dhatu Nigam Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "MTARTECH", companyName: "MTAR Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "PARAS", companyName: "Paras Defence and Space Technologies Ltd", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "SIGMA", companyName: "Sigma Solve Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "SOLARINDS", companyName: "Solar Industries India Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
      { symbol: "ZENTEC", companyName: "Zen Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods" },
    ]
  }
];