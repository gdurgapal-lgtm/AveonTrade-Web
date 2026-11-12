export interface MoneyLine { label: string; value: number; sign?: string; indicator?: string }
export interface ProductBalance { id: string; name: string; amount: number; isDefault: boolean; isActive: boolean; periodicities: string[] }
export interface BalanceGroup { id: string; name: string; lines: MoneyLine[] }
export interface MarginPeriodicity { name: string; id: string }
export interface MarginUsageRow { title: string; subtitle: string; marginUtilized: number; exposureMargin: number; bookedPnl: number; mtmPnl: number; netAvailable: number }
export interface FundsSummary { lines: MoneyLine[] }
export interface MarginSnapshot { periodicities: MarginPeriodicity[]; lines: MoneyLine[]; productRows: MarginUsageRow[]; tokenRows: MarginUsageRow[] }
export interface FundsResult { success: boolean; message: string; summary: FundsSummary; products: ProductBalance[]; balanceGroups: BalanceGroup[]; margin: MarginSnapshot }
export interface FundGenericRow { raw: Record<string, any>; bankId: string; bankName: string; accountNo: string; ifsc: string; productId: string; productName: string; displayName: string }
export interface FundsWorkflowData { bankDetails: FundGenericRow[]; defaultBanks: FundGenericRow[]; selectedProductBanks: FundGenericRow[]; upiDetails: FundGenericRow[]; mappedBanks: FundGenericRow[]; purchasePower: FundGenericRow[]; gatewayDetails: FundGenericRow[]; transferMappedProducts: FundGenericRow[]; messages: string[] }
