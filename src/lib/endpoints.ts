/**
 * Endpoint map — ported 1:1 from the Flutter services layer
 * (lib/features/<feature>/services) so the web app talks to the exact
 * same AveonTrade broker REST API. Paths are appended to ServerConfig.baseUrl
 * by the /api/broker proxy.
 */
export const Endpoints = {
  auth: {
    session: "/authentication/v1/user/session", // POST login / PUT refresh
    registerTotp: "/authentication/v1/user/registertotp",
    verifyTotp: "/authentication/v1/user/verifytotp",
    profile: "/authentication/v1/user/profile",
    password: "/authentication/v1/user/password",
    sendOtp: "/authentication/v1/user/password/reset/send-otp",
    mpinResetSendOtp: "/authentication/v1/user/mpin/reset/send-otp",
    verifyOtp: "/authentication/v1/user/otp/verify",
    passwordReset: "/authentication/v1/user/password/reset",
    dynamicProductTypes: "/authentication/v1/getDynamicProductTypes",
  },
  orders: {
    book: "/transactional/v1/orders",
    regular: "/transactional/v1/orders/regular",
    cover: "/transactional/v1/orders/cover",
    bracket: "/transactional/v1/orders/bracket",
    multileg: "/transactional/v1/orders/multileg",
    multilegBook: "/transactional/v1/multilegOrders",
    bulk: "/transactional/v1/orders/bulkOrders",
    orderCart: "/transactional/v1/ordercart",
    orderCartPlace: "/transactional/v1/ordercart/placecartorders",
    squareoff: "/transactional/v1/orders/squareoff",
    cancel: "/transactional/v1/cancelorders",
    gtd: "/transactional/v1/gtdOrders",
    gtdHistory: "/transactional/v1/gtdOrdersHistory",
    margin: "/transactional/v1/getOrderMarginInfo",
    eqSipDetails: "/transactional/v1/eqsipOrderDetails",
    eqSipSettings: "/transactional/v1/eqsipSettingDetails",
  },
  trades: {
    book: "/transactional/v1/trades",
  },
  positions: {
    /** Base position endpoint; type is appended by positionsPath(). */
    list: "/transactional/v1/portfolio/positions",
    conversion: "/transactional/v1/portfolio/positions",
    conversionInquiry: "/transactional/v1/portfolio/positions",
  },
  holdings: {
    list: "/transactional/v1/portfolio/holdings",
  },
  funds: {
    /**
     * Confirmed working: POST /transactional/{tenantId}/v1/getFundsViewSummary
     * (built dynamically in src/app/api/broker/funds-summary/route.ts since it
     * needs the tenant id embedded in the path and a POST body).
     * `report` below ("fundsReport") is a different, POST-only report-export
     * endpoint from funds_workflow_service.dart — NOT a real-time balance
     * source. Kept here for completeness, not used by the dashboard/funds page.
     */
    report: "/transactional/v1/fundsReport",
    transfer: "/transactional/v1/fundsTransfer",
    withdrawal: "/transactional/v1/fundsWithdrawal",
    withdrawalCancel: "/transactional/v1/fundsWithdrawalCancellation",
    bankAccounts: "/transactional/v1/getBankAccList",
    purchasePower: "/transactional/v1/getPurchasePower",
    upiDetails: "/transactional/v1/getUPIDetails",
    defaultBankDetails: "/transactional/v1/getDefaultBankDetails",
    banksForSelectedProduct: "/transactional/v1/getBanksForSelectedProduct",
    mappedBanks: "/transactional/v1/getMappedBanksList",
    gatewayDetails: "/transactional/v1/getGatewayDetails",
    transferMappedProduct: "/transactional/v1/fundTransferMappedProduct",
  },
  margin: {
    detailedLimit: "/transactional/v1/marginInfo/detailed_limit",
    list: "/transactional/v1/marginInfo/list",
    productTypeWise: "/transactional/v1/marginInfo/producttypewise",
    tokenWise: "/transactional/v1/marginInfo/tokenwise",
    periodicityWiseBalance: "/transactional/v1/peridiocityWiseBalance",
    productWiseBalance: "/transactional/v1/producteWiseBalance",
  },
  ipo: {
    list: "/transactional/v1/ipo/list",
    details: "/transactional/v1/ipo/details",
    orders: "/transactional/v1/ipo/orders",
  },
  edis: {
    dpDetails: "/transactional/v1/getDPDetailsEDIS",
    summary: "/transactional/v1/edis/summary",
  },
  notices: {
    list: "/nontransactional/v1/addendumAndNotices",
    acknowledge: "/nontransactional/v1/addendumAndNotice",
  },
  messages: {
    broker: "/nontransactional/v1/brokerMessages",
    order: "/nontransactional/v1/orderMessages",
    exchange: "/nontransactional/v1/exchangeMessages",
    recommendations: "/nontransactional/v1/recommendation",
  },
} as const;

/** Builds the real order book path: /transactional/v1/orders?offset=&limit=&orderStatus= (offset is a 1-indexed page number, not a byte offset). */
export function orderBookPath(offset = 1, limit = 100, orderStatus = 0): string {
  return `${Endpoints.orders.book}?offset=${offset}&limit=${limit}&orderstatus=${orderStatus}`;
}

/** Builds the real trade book path — offset/limit are required (page number starting at 1). */
export function tradeBookPath(offset = 1, limit = 100): string {
  return `${Endpoints.trades.book}?offset=${offset}&limit=${limit}`;
}

/** Builds the real positions path: /transactional/v1/portfolio/positions/{daily|expiry}?intropStatus=1 */
export function positionsPath(type: "daily" | "all" | "expiry" = "daily", intropStatus = 1): string {
  return `${Endpoints.positions.list}/${type}?intropStatus=${intropStatus}`;
}

export function orderHistoryPath(orderId: string): string {
  return `${Endpoints.orders.book}/${encodeURIComponent(orderId)}`;
}

export function gtdOrderBookPath(offset = 1, limit = 100, orderStatus = -1): string {
  return `${Endpoints.orders.gtd}?offset=${offset}&limit=${limit}&orderstatus=${orderStatus}`;
}

export function gtdOrderHistoryPath(offset = 1, limit = 100, gtdOrderId = ""): string {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (gtdOrderId.trim()) query.set("gtdOrderId", gtdOrderId.trim());
  return `${Endpoints.orders.gtdHistory}?${query.toString()}`;
}

export function multilegOrderBookPath(offset = 1, limit = 100, orderStatus = -1, orderType = ""): string {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    orderStatus: String(orderStatus),
  });
  if (orderType.trim()) query.set("orderType", orderType.trim());
  return `${Endpoints.orders.multilegBook}?${query.toString()}`;
}

export function orderModifyPath(family: "regular" | "cover" | "bracket", exchange: string, orderId: string): string {
  const endpoint =
    family === "cover" ? Endpoints.orders.cover :
    family === "bracket" ? Endpoints.orders.bracket :
    Endpoints.orders.regular;
  return `${endpoint}/${encodeURIComponent(exchange)}/${encodeURIComponent(orderId)}`;
}

export function orderCancelPath(family: "regular" | "cover" | "bracket", exchange: string, orderId: string, validity = "DAY", validityDays = 0): string {
  const endpoint =
    family === "cover" ? Endpoints.orders.cover :
    family === "bracket" ? Endpoints.orders.bracket :
    Endpoints.orders.regular;
  if (family !== "regular") return `${endpoint}/${encodeURIComponent(exchange)}/${encodeURIComponent(orderId)}`;
  const query = new URLSearchParams({
    validity: validity.toUpperCase() === "GTD" ? "DAY" : validity,
    validity_days: String(validityDays || 0),
  });
  return `${endpoint}/${encodeURIComponent(exchange)}/${encodeURIComponent(orderId)}?${query.toString()}`;
}

export function fundsProductPath(productId: string): string { return `${Endpoints.funds.defaultBankDetails}/${encodeURIComponent(productId)}`; }
export function fundsBanksForProductPath(productId: string): string { return `${Endpoints.funds.banksForSelectedProduct}/${encodeURIComponent(productId)}`; }
export function fundsMappedBanksPath(productId: string, bankId: string): string { return `${Endpoints.funds.mappedBanks}/${encodeURIComponent(productId)}/${encodeURIComponent(bankId)}`; }
export function fundsGatewayPath(productId: string): string { return `${Endpoints.funds.gatewayDetails}/${encodeURIComponent(productId)}`; }
export function fundsTransferProductsPath(productId: string): string { return `${Endpoints.funds.transferMappedProduct}/${encodeURIComponent(productId)}`; }
export function fundsReportPath(): string { return Endpoints.funds.report; }

export function positionConversionInquiryPath(orderId: string): string {
  return `${Endpoints.positions.conversionInquiry}?orderId=${encodeURIComponent(orderId)}`;
}

/* ------------------------------ IPO ------------------------------ */

/**
 * IPO list. type: C = current, F = future, P = past, -1 = all.
 * Response: { CurrentIPOList, FutureIPOList, PastIPOList }.
 */
export function ipoListPath(type: "C" | "F" | "P" | "-1" = "-1", offerName = "", offerType: "IPO" | "FPO" | "" = "IPO"): string {
  const query = new URLSearchParams({ type, offerName: offerName.trim(), offerType });
  return `${Endpoints.ipo.list}?${query.toString()}`;
}

/** IPO details for one IPO code: /transactional/v1/ipo/details/{ipocode} */
export function ipoDetailsPath(ipoCode: string): string {
  return `${Endpoints.ipo.details}/${encodeURIComponent(ipoCode)}`;
}

/**
 * IPO order book. Dates are YYYY-MM-DD. `status` -1 = all.
 * NOTE: the API reference shows offerType as an integer (example 1) here,
 * unlike the list API which takes "IPO"/"FPO" — confirm the mapping with the broker.
 */
export function ipoOrdersPath(params: {
  startDate: string;
  endDate: string;
  offerType?: string;
  offerName?: string;
  status?: string;
  ipoCode?: string;
  applicationNo?: string;
}): string {
  const query = new URLSearchParams({
    startdate: params.startDate,
    endDate: params.endDate,
    offerType: params.offerType ?? "1",
    offername: params.offerName ?? "",
    status: params.status ?? "-1",
    ipoCode: params.ipoCode ?? "",
    applicationNo: params.applicationNo ?? "",
  });
  return `${Endpoints.ipo.orders}?${query.toString()}`;
}

/** Cancel an IPO order: DELETE /transactional/v1/ipo/orders/{transactionNo} */
export function ipoOrderPath(transactionNo: string): string {
  return `${Endpoints.ipo.orders}/${encodeURIComponent(transactionNo)}`;
}

/* ------------------------------ Messages Hub ------------------------------ */

export function brokerMessagesPath(pageNo = 1, pageSize = 10): string {
  return `/nontransactional/v1/brokerMessages?pageNo=${pageNo}&pageSize=${pageSize}`;
}

export function orderMessagesPath(pageNo = 1, pageSize = 10): string {
  return `/nontransactional/v1/orderMessages?pageNo=${pageNo}&pageSize=${pageSize}`;
}

export function exchangeMessagesPath(segmentId = "NSE_EQ", noofhrs = 1, pageNo = 1, pageSize = 10): string {
  return `/nontransactional/v1/exchangeMessages/${encodeURIComponent(segmentId)}?noofhrs=${noofhrs}&pageNo=${pageNo}&pageSize=${pageSize}`;
}

export function recommendationsPath(allowedNewsCat = "25014,25033,25000,25035,25034,25039", pageNo = 1, pageSize = 10): string {
  return `/nontransactional/v1/recommendation?allowedNewsCat=${encodeURIComponent(allowedNewsCat)}&pageNo=${pageNo}&pageSize=${pageSize}`;
}