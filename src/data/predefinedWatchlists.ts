import { NIFTY_50_CONSTITUENTS } from "@/data/nifty50";

export interface WatchlistConstituent {
  symbol: string;         // Official NSE Trading Symbol
  companyName: string;    // Display Company Name
  exchange: string;       // Exchange Segment (NSE_EQ)
  sector: string;         // Industry Group
  weightage?: number;     // Index Weightage (e.g., 0.3052 = 30.52%)
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
      sector: c.sector,
      weightage: c.weightage ?? 0.0 // Falls back to 0 if not present in base dataset
    }))
  },
  {
    id: "nifty-bank",
    name: "NIFTY BANK",
    items: [
      { symbol: "HDFCBANK", companyName: "HDFC Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.3052 },
      { symbol: "ICICIBANK", companyName: "ICICI Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.2804 },
      { symbol: "SBIN", companyName: "State Bank of India", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.1114 },
      { symbol: "AXISBANK", companyName: "Axis Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0961 },
      { symbol: "KOTAKBANK", companyName: "Kotak Mahindra Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0895 },
      { symbol: "FEDERALBNK", companyName: "Federal Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0220 },
      { symbol: "INDUSINDBK", companyName: "IndusInd Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0149 },
      { symbol: "AUBANK", companyName: "AU Small Finance Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0138 },
      { symbol: "IDFCFIRSTB", companyName: "IDFC First Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0134 },
      { symbol: "PNB", companyName: "Punjab National Bank", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0125 },
      { symbol: "BANKBARODA", companyName: "Bank of Baroda", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0124 },
      { symbol: "CANBK", companyName: "Canara Bank", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0110 },
      { symbol: "UNIONBANK", companyName: "Union Bank of India", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0098 },
      { symbol: "YESBANK", companyName: "Yes Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0076 },
    ]
  },
  {
    id: "nifty-finance",
    name: "NIFTY FINANCE",
    items: [
      { symbol: "HDFCBANK", companyName: "HDFC Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.2664 },
      { symbol: "ICICIBANK", companyName: "ICICI Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.2449 },
      { symbol: "SBIN", companyName: "State Bank of India", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0974 },
      { symbol: "AXISBANK", companyName: "Axis Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0839 },
      { symbol: "KOTAKBANK", companyName: "Kotak Mahindra Bank Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0780 },
      { symbol: "BAJFINANCE", companyName: "Bajaj Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0647 },
      { symbol: "SHRIRAMFIN", companyName: "Shriram Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0294 },
      { symbol: "BAJAJFINSV", companyName: "Bajaj Finserv Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0224 },
      { symbol: "SBILIFE", companyName: "SBI Life Insurance Company Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0173 },
      { symbol: "CHOLAFIN", companyName: "Cholamandalam Investment and Finance Co Ltd", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0173 },
      { symbol: "JIOFIN", companyName: "Jio Financial Services Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0160 },
      { symbol: "HDFCLIFE", companyName: "HDFC Life Insurance Co. Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0136 },
      { symbol: "PFC", companyName: "Power Finance Corporation Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0102 },
      { symbol: "ICICILOMB", companyName: "ICICI Lombard General Insurance Co Ltd", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0087 },
      { symbol: "MAXFSL", companyName: "Max Financial Services Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0080 },
      { symbol: "REC", companyName: "REC Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0079 },
      { symbol: "MUTHOOTFIN", companyName: "Muthoot Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0063 },
      { symbol: "LICHSGFIN", companyName: "LIC Housing Finance Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0040 },
      { symbol: "SBICARD", companyName: "SBI Cards and Payment Services Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0036 },
      { symbol: "BSE", companyName: "BSE Ltd.", exchange: "NSE_EQ", sector: "Financial Services", weightage: 0.0 },
    ]
  },
  {
    id: "nifty-auto",
    name: "NIFTY AUTO",
    items: [
      { symbol: "M&M", companyName: "Mahindra & Mahindra Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.2476 },
      { symbol: "MARUTI", companyName: "Maruti Suzuki India Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.1328 },
      { symbol: "BAJAJ-AUTO", companyName: "Bajaj Auto Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0926 },
      { symbol: "EICHERMOT", companyName: "Eicher Motors Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0866 },
      { symbol: "TVSMOTOR", companyName: "TVS Motor Company Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0851 },
      { symbol: "MOTHERSON", companyName: "Samvardhana Motherson International Ltd", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0588 },
      { symbol: "HEROMOTOCO", companyName: "Hero MotoCorp Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0559 },
      { symbol: "TATAMOTORS", companyName: "Tata Motors Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0442 },
      { symbol: "ASHOKLEY", companyName: "Ashok Leyland Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0381 },
      { symbol: "BHARATFORG", companyName: "Bharat Forge Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0378 },
      { symbol: "BOSCHLTD", companyName: "Bosch Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0344 },
      { symbol: "SONACOMS", companyName: "Sona BLW Precision Forgings Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0326 },
      { symbol: "UNOMINDA", companyName: "Uno Minda Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0204 },
      { symbol: "TIINDIA", companyName: "Tube Investments of India Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0191 },
      { symbol: "EXIDEIND", companyName: "Exide Industries Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0139 },
      { symbol: "HYUNDAI", companyName: "Hyundai Motor India Ltd.", exchange: "NSE_EQ", sector: "Automobile", weightage: 0.0 },
    ]
  },
  {
    id: "nifty-fmcg",
    name: "NIFTY FMCG",
    items: [
      { symbol: "ITC", companyName: "ITC Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.2896 },
      { symbol: "HINDUNILVR", companyName: "Hindustan Unilever Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.1821 },
      { symbol: "NESTLEIND", companyName: "Nestle India Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0942 },
      { symbol: "TATACONSUM", companyName: "Tata Consumer Products Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0734 },
      { symbol: "VBL", companyName: "Varun Beverages Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0602 },
      { symbol: "BRITANNIA", companyName: "Britannia Industries Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0564 },
      { symbol: "MARICO", companyName: "Marico Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0495 },
      { symbol: "MCDOWELL-N", companyName: "United Spirits Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0434 },
      { symbol: "RADICO", companyName: "Radico Khaitan Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0371 },
      { symbol: "GODREJCP", companyName: "Godrej Consumer Products Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0365 },
      { symbol: "DABUR", companyName: "Dabur India Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0231 },
      { symbol: "COLPAL", companyName: "Colgate Palmolive (India) Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0230 },
      { symbol: "PATANJALI", companyName: "Patanjali Foods Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0142 },
      { symbol: "UBL", companyName: "United Breweries Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0088 },
      { symbol: "EMAMI", companyName: "Emami Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0083 },
      { symbol: "GODFRYPHLP", companyName: "Godfrey Phillips India Ltd.", exchange: "NSE_EQ", sector: "FMCG", weightage: 0.0 },
    ]
  },
  {
    id: "nifty-india-def",
    name: "NIFTY India Def",
    items: [
      { symbol: "BEL", companyName: "Bharat Electronics Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.3658 },
      { symbol: "HAL", companyName: "Hindustan Aeronautics Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.2304 },
      { symbol: "SOLARINDS", companyName: "Solar Industries India Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.1174 },
      { symbol: "ASTRA-MIC", companyName: "Astra Microwave Products Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0366 },
      { symbol: "MAZDOCK", companyName: "Mazagon Dock Shipbuilders Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0361 },
      { symbol: "MTARTECH", companyName: "MTAR Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0318 },
      { symbol: "DATAPATTNS", companyName: "Data Patterns (India) Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0314 },
      { symbol: "COCHINSHIP", companyName: "Cochin Shipyard Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0248 },
      { symbol: "BDL", companyName: "Bharat Dynamics Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0244 },
      { symbol: "ZENTEC", companyName: "Zen Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0204 },
      { symbol: "BEML", companyName: "BEML Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0202 },
      { symbol: "GRSE", companyName: "Garden Reach Shipbuilders & Engineers Ltd", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0159 },
      { symbol: "DYNAMATIC", companyName: "Dynamatic Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0132 },
      { symbol: "PARAS", companyName: "Paras Defence and Space Technologies Ltd", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0115 },
      { symbol: "CYIENTDLM", companyName: "Cyient DLM Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0083 },
      { symbol: "UNIMECH", companyName: "Unimech Aerospace and Manufacturing Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0050 },
      { symbol: "MIDHANI", companyName: "Mishra Dhatu Nigam Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0049 },
      { symbol: "DCX", companyName: "DCX Systems Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0021 },
      { symbol: "AEQUS", companyName: "Aequus Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0 },
      { symbol: "APOLLO", companyName: "Apollo Micro Systems Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0 },
      { symbol: "AXISCADES", companyName: "Axiscades Technologies Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0 },
      { symbol: "BHARATFORG", companyName: "Bharat Forge Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0 },
      { symbol: "SIGMA", companyName: "Sigma Solve Ltd.", exchange: "NSE_EQ", sector: "Capital Goods", weightage: 0.0 },
    ]
  },
  {
    id: "nifty-pharma",
    name: "NIFTY PHARMA",
    items: [
      { symbol: "SUNPHARMA", companyName: "Sun Pharmaceutical Industries Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.2001 },
      { symbol: "DIVISLAB", companyName: "Divi's Laboratories Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.1390 },
      { symbol: "LAURUSLABS", companyName: "Laurus Labs Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0897 },
      { symbol: "DRREDDY", companyName: "Dr. Reddy's Laboratories Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0831 },
      { symbol: "CIPLA", companyName: "Cipla Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0776 },
      { symbol: "TORNTPHARM", companyName: "Torrent Pharmaceuticals Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0536 },
      { symbol: "AUROPHARMA", companyName: "Aurobindo Pharma Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0487 },
      { symbol: "LUPIN", companyName: "Lupin Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0465 },
      { symbol: "GLENMARK", companyName: "Glenmark Pharmaceuticals Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0386 },
      { symbol: "ALKEM", companyName: "Alkem Laboratories Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0301 },
      { symbol: "ZYDUSLIFE", companyName: "Zydus Lifesciences Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0292 },
      { symbol: "MANKIND", companyName: "Mankind Pharma Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0292 },
      { symbol: "GLAND", companyName: "Gland Pharma Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0257 },
      { symbol: "IPCA", companyName: "IPCA Laboratories Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0249 },
      { symbol: "BIOCON", companyName: "Biocon Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0247 },
      { symbol: "WOCKPHARMA", companyName: "Wockhardt Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0163 },
      { symbol: "PIRAMALPHARM", companyName: "Piramal Pharma Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0149 },
      { symbol: "AJANTPHARM", companyName: "Ajanta Pharma Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0148 },
      { symbol: "ABBOTINDIA", companyName: "Abbott India Ltd.", exchange: "NSE_EQ", sector: "Healthcare", weightage: 0.0133 },
    ]
  }
];