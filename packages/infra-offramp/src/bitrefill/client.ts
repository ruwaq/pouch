import { requestJson, type RequestOptions } from '@pouch/shared';

import type {
  BitrefillCreateInvoicePayload,
  BitrefillEnvelope,
  BitrefillInvoiceDto,
  BitrefillListProductsParams,
  BitrefillOrderDto,
  BitrefillProductDto,
  BitrefillSearchProductsParams,
} from './types';

type RequestJson = <T>(input: RequestInfo | URL, options?: RequestOptions) => Promise<T>;

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();

  return query ? `?${query}` : '';
}

export class BitrefillClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly requester: RequestJson = requestJson,
  ) {}

  async listProducts(params: BitrefillListProductsParams = {}): Promise<BitrefillEnvelope<BitrefillProductDto[]>> {
    return this.get(`/products${toQueryString({
      limit: params.limit ?? 50,
      country: params.countryCode,
      type: params.category,
      include_test_products: params.includeTestProducts ?? false,
    })}`);
  }

  async searchProducts(params: BitrefillSearchProductsParams): Promise<BitrefillEnvelope<BitrefillProductDto[]>> {
    return this.get(`/products/search${toQueryString({
      q: params.query,
      limit: params.limit ?? 50,
      include_test_products: params.includeTestProducts ?? false,
    })}`);
  }

  async getProduct(productId: string): Promise<BitrefillEnvelope<BitrefillProductDto>> {
    return this.get(`/products/${productId}`);
  }

  async createInvoice(payload: BitrefillCreateInvoicePayload): Promise<BitrefillEnvelope<BitrefillInvoiceDto>> {
    return this.request('/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getInvoice(invoiceId: string): Promise<BitrefillEnvelope<BitrefillInvoiceDto>> {
    return this.get(`/invoices/${invoiceId}`);
  }

  async getOrder(orderId: string): Promise<BitrefillEnvelope<BitrefillOrderDto>> {
    return this.get(`/orders/${orderId}`);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request(path, { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return this.requester(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }
}
