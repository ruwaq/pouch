export interface BitrefillEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface BitrefillPackageDto {
  id: string;
  value: number | string;
  price?: number;
}

export interface BitrefillRangeDto {
  min: number;
  max: number;
  step?: number;
  price_rate?: number;
}

export interface BitrefillProductDto {
  id: string;
  name: string;
  image?: string;
  packages?: BitrefillPackageDto[];
  range?: BitrefillRangeDto;
}

export interface BitrefillInvoiceOrderProductDto {
  id: string;
  name: string;
  value?: number | string;
  currency?: string;
  image?: string;
}

export interface BitrefillInvoiceOrderDto {
  id: string;
  status: string;
  product?: BitrefillInvoiceOrderProductDto;
}

export interface BitrefillRedemptionInfoDto {
  code?: string;
  link?: string;
  instructions?: string;
}

export interface BitrefillOrderDto {
  id: string;
  status: string;
  redemption_info?: BitrefillRedemptionInfoDto;
  redeem_url?: string;
  claim_url?: string;
  instructions?: string;
}

export interface BitrefillPaymentDto {
  method: string;
  address?: string;
  price: number;
  currency: string;
  status?: string;
}

export interface BitrefillInvoiceDto {
  id: string;
  status: string;
  payment?: BitrefillPaymentDto;
  orders?: BitrefillInvoiceOrderDto[];
}

export interface BitrefillListProductsParams {
  category?: string;
  countryCode?: string;
  includeTestProducts?: boolean;
  limit?: number;
}

export interface BitrefillSearchProductsParams {
  query: string;
  includeTestProducts?: boolean;
  limit?: number;
}

export interface BitrefillCreateInvoiceProductPayload {
  product_id: string;
  quantity: number;
  value?: number;
  package_id?: string;
  gift?: {
    recipient_name: string;
    recipient_email: string;
    sender_name: string;
  };
}

export interface BitrefillCreateInvoicePayload {
  products: BitrefillCreateInvoiceProductPayload[];
  payment_method: string;
  auto_pay: boolean;
  webhook_url?: string;
  refund_address?: string;
  email?: string;
  send_email?: boolean;
}
