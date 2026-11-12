export interface NiftyConstituent {
  symbol: string;         // Official NSE Trading Symbol
  companyName: string;    // Display Company Name
  exchange: string;       // Exchange Segment (NSE_EQ)
  weightage: number;      // approx. weight at previous close (fraction) - display fallback and seed only
  indexPtsPerRupee?: number; // index points per Rs 1 move in the stock; stable between rebalances
  sector: string;         // Industry Group
}

export const NIFTY_50_CONSTITUENTS: NiftyConstituent[] = [
  { symbol: "ADANIENT", companyName: "Adani Enterprises Ltd.", exchange: "NSE_EQ", weightage: 0.00801, sector: "Metals & Mining", indexPtsPerRupee: 0.073570 },
  { symbol: "ADANIPORTS", companyName: "Adani Ports and SEZ Ltd.", exchange: "NSE_EQ", weightage: 0.01331, sector: "Services", indexPtsPerRupee: 0.169730 },
  { symbol: "APOLLOHOSP", companyName: "Apollo Hospitals Enterprise Ltd.", exchange: "NSE_EQ", weightage: 0.00792, sector: "Healthcare", indexPtsPerRupee: 0.022348 },
  { symbol: "ASIANPAINT", companyName: "Asian Paints Ltd.", exchange: "NSE_EQ", weightage: 0.01005, sector: "Consumer Durables", indexPtsPerRupee: 0.098164 },
  { symbol: "AXISBANK", companyName: "Axis Bank Ltd.", exchange: "NSE_EQ", weightage: 0.03216, sector: "Financial Services", indexPtsPerRupee: 0.621233 },
  { symbol: "BSE", companyName: "BSE Ltd.", exchange: "NSE_EQ", weightage: 0.01240, sector: "Financial Services" },
  { symbol: "BAJAJ-AUTO", companyName: "Bajaj Auto Ltd.", exchange: "NSE_EQ", weightage: 0.01018, sector: "Automobile", indexPtsPerRupee: 0.022994 },
  { symbol: "BAJFINANCE", companyName: "Bajaj Finance Ltd.", exchange: "NSE_EQ", weightage: 0.02390, sector: "Financial Services", indexPtsPerRupee: 0.586673 },
  { symbol: "BAJAJFINSV", companyName: "Bajaj Finserv Ltd.", exchange: "NSE_EQ", weightage: 0.00885, sector: "Financial Services", indexPtsPerRupee: 0.122587 },
  { symbol: "BEL", companyName: "Bharat Electronics Ltd.", exchange: "NSE_EQ", weightage: 0.01231, sector: "Capital Goods", indexPtsPerRupee: 0.771363 },
  { symbol: "BHARTIARTL", companyName: "Bharti Airtel Ltd.", exchange: "NSE_EQ", weightage: 0.05844, sector: "Telecommunication", indexPtsPerRupee: 0.673883 },
  { symbol: "CIPLA", companyName: "Cipla Ltd.", exchange: "NSE_EQ", weightage: 0.00724, sector: "Healthcare", indexPtsPerRupee: 0.123437 },
  { symbol: "COALINDIA", companyName: "Coal India Ltd.", exchange: "NSE_EQ", weightage: 0.00889, sector: "Oil Gas & Consu.", indexPtsPerRupee: 0.518555 },
  { symbol: "DRREDDY", companyName: "Dr. Reddy's Laboratories Ltd.", exchange: "NSE_EQ", weightage: 0.00761, sector: "Healthcare", indexPtsPerRupee: 0.132418 },
  { symbol: "EICHERMOT", companyName: "Eicher Motors Ltd.", exchange: "NSE_EQ", weightage: 0.00931, sector: "Automobile", indexPtsPerRupee: 0.029805 },
  { symbol: "ETERNAL", companyName: "Eternal Ltd.", exchange: "NSE_EQ", weightage: 0.02295, sector: "Consumer Services", indexPtsPerRupee: 1.563923 },
  { symbol: "GRASIM", companyName: "Grasim Industries Ltd.", exchange: "NSE_EQ", weightage: 0.01065, sector: "Construction Materials", indexPtsPerRupee: 0.082067 },
  { symbol: "HCLTECH", companyName: "HCL Technologies Ltd.", exchange: "NSE_EQ", weightage: 0.01368, sector: "Information Technology", indexPtsPerRupee: 0.226367 },
  { symbol: "HDFCBANK", companyName: "HDFC Bank Ltd.", exchange: "NSE_EQ", weightage: 0.10112, sector: "Financial Services", indexPtsPerRupee: 3.318776 },
  { symbol: "HDFCLIFE", companyName: "HDFC Life Insurance Co. Ltd.", exchange: "NSE_EQ", weightage: 0.00510, sector: "Financial Services", indexPtsPerRupee: 0.231117 },
  { symbol: "HINDALCO", companyName: "Hindalco Industries Ltd.", exchange: "NSE_EQ", weightage: 0.01202, sector: "Metals & Mining", indexPtsPerRupee: 0.312430 },
  { symbol: "HINDUNILVR", companyName: "Hindustan Unilever Ltd.", exchange: "NSE_EQ", weightage: 0.01584, sector: "FMCG", indexPtsPerRupee: 0.192195 },
  { symbol: "ICICIBANK", companyName: "ICICI Bank Ltd.", exchange: "NSE_EQ", weightage: 0.09285, sector: "Financial Services", indexPtsPerRupee: 1.551993 },
  { symbol: "ITC", companyName: "ITC Ltd.", exchange: "NSE_EQ", weightage: 0.02403, sector: "FMCG", indexPtsPerRupee: 2.089413 },
  { symbol: "INFY", companyName: "Infosys Ltd.", exchange: "NSE_EQ", weightage: 0.03696, sector: "Information Technology", indexPtsPerRupee: 0.766519 },
  { symbol: "INDIGO", companyName: "InterGlobe Aviation Ltd.", exchange: "NSE_EQ", weightage: 0.01034, sector: "Services", indexPtsPerRupee: 0.049014 },
  { symbol: "JSWSTEEL", companyName: "JSW Steel Ltd.", exchange: "NSE_EQ", weightage: 0.01156, sector: "Metals & Mining", indexPtsPerRupee: 0.208600 },
  { symbol: "JIOFIN", companyName: "Jio Financial Services Ltd.", exchange: "NSE_EQ", weightage: 0.00638, sector: "Financial Services", indexPtsPerRupee: 0.709240 },
  { symbol: "KOTAKBANK", companyName: "Kotak Mahindra Bank Ltd.", exchange: "NSE_EQ", weightage: 0.03109, sector: "Financial Services", indexPtsPerRupee: 1.593396 },
  { symbol: "LT", companyName: "Larsen & Toubro Ltd.", exchange: "NSE_EQ", weightage: 0.04195, sector: "Construction", indexPtsPerRupee: 0.252980 },
  { symbol: "M&M", companyName: "Mahindra & Mahindra Ltd.", exchange: "NSE_EQ", weightage: 0.02351, sector: "Automobile", indexPtsPerRupee: 0.192481 },
  { symbol: "MARUTI", companyName: "Maruti Suzuki India Ltd.", exchange: "NSE_EQ", weightage: 0.01400, sector: "Automobile", indexPtsPerRupee: 0.028090 },
  { symbol: "MAXHEALTH", companyName: "Max Healthcare Institute Ltd.", exchange: "NSE_EQ", weightage: 0.00597, sector: "Healthcare", indexPtsPerRupee: 0.158819 },
  { symbol: "NTPC", companyName: "NTPC Ltd.", exchange: "NSE_EQ", weightage: 0.01387, sector: "Power", indexPtsPerRupee: 1.027293 },
  { symbol: "NESTLEIND", companyName: "Nestle India Ltd.", exchange: "NSE_EQ", weightage: 0.00809, sector: "FMCG", indexPtsPerRupee: 0.154365 },
  { symbol: "ONGC", companyName: "Oil & Natural Gas Corporation Ltd.", exchange: "NSE_EQ", weightage: 0.00813, sector: "Oil Gas & Consu.", indexPtsPerRupee: 0.833564 },
  { symbol: "POWERGRID", companyName: "Power Grid Corporation of India Ltd.", exchange: "NSE_EQ", weightage: 0.01064, sector: "Power", indexPtsPerRupee: 0.976070 },
  { symbol: "RELIANCE", companyName: "Reliance Industries Ltd.", exchange: "NSE_EQ", weightage: 0.07945, sector: "Oil Gas & Consu.", indexPtsPerRupee: 1.446424 },
  { symbol: "SBILIFE", companyName: "SBI Life Insurance Company Ltd.", exchange: "NSE_EQ", weightage: 0.00686, sector: "Financial Services", indexPtsPerRupee: 0.097061 },
  { symbol: "SHRIRAMFIN", companyName: "Shriram Finance Ltd.", exchange: "NSE_EQ", weightage: 0.01127, sector: "Financial Services", indexPtsPerRupee: 0.303304 },
  { symbol: "SBIN", companyName: "State Bank of India", exchange: "NSE_EQ", weightage: 0.03643, sector: "Financial Services", indexPtsPerRupee: 0.893934 },
  { symbol: "SUNPHARMA", companyName: "Sun Pharmaceutical Industries Ltd.", exchange: "NSE_EQ", weightage: 0.01732, sector: "Healthcare", indexPtsPerRupee: 0.233059 },
  { symbol: "TCS", companyName: "Tata Consultancy Services Ltd.", exchange: "NSE_EQ", weightage: 0.02324, sector: "Information Technology", indexPtsPerRupee: 0.221382 },
  { symbol: "TATACONSUM", companyName: "Tata Consumer Products Ltd.", exchange: "NSE_EQ", weightage: 0.00635, sector: "FMCG", indexPtsPerRupee: 0.140855 },
  { symbol: "TMPV", companyName: "Tata Motors Passenger Vehicles Ltd.", exchange: "NSE_EQ", weightage: 0.00529, sector: "Automobile", indexPtsPerRupee: 0.455400 },
  { symbol: "TATASTEEL", companyName: "Tata Steel Ltd.", exchange: "NSE_EQ", weightage: 0.01324, sector: "Metals & Mining", indexPtsPerRupee: 1.786204 },
  { symbol: "TECHM", companyName: "Tech Mahindra Ltd.", exchange: "NSE_EQ", weightage: 0.01029, sector: "Information Technology", indexPtsPerRupee: 0.136933 },
  { symbol: "TITAN", companyName: "Titan Company Ltd.", exchange: "NSE_EQ", weightage: 0.01714, sector: "Consumer Durables", indexPtsPerRupee: 0.089461 },
  { symbol: "TRENT", companyName: "Trent Ltd.", exchange: "NSE_EQ", weightage: 0.00919, sector: "Consumer Services", indexPtsPerRupee: 0.072073 },
  { symbol: "ULTRACEMCO", companyName: "UltraTech Cement Ltd.", exchange: "NSE_EQ", weightage: 0.01259, sector: "Construction Materials", indexPtsPerRupee: 0.025631 },
];
// Calibrated 2026-11-04 from a live snapshot with index previous close 23810.85.
// points = indexPtsPerRupee * (ltp - previousClose). Re-run scripts/calibrate_nifty50.py after each NSE rebalance
// (end of March / September) and after any split/bonus. Stocks without indexPtsPerRupee are calibrated at runtime.
export const NIFTY_WEIGHTS_AS_OF = "2026-11-04";
