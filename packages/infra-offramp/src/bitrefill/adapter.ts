import { err, ok, type Result } from '@pouch/shared';

import type { Amount, DomainError, OffRampCategory, OffRampProvider, Order, OrderRequest, OrderStatus, Product, SearchOptions, WebhookEvent } from '@pouch/domain';

import { BitrefillMapper } from './mapper';
import type {
  BitrefillCreateInvoicePayload,
  BitrefillEnvelope,
  BitrefillInvoiceDto,
  BitrefillListProductsParams,
  BitrefillOrderDto,
  BitrefillProductDto,
  BitrefillSearchProductsParams,
} from './types';

type BitrefillClientLike = {
  listProducts(params?: BitrefillListProductsParams): Promise<BitrefillEnvelope<BitrefillProductDto[]>>;
  searchProducts(params: BitrefillSearchProductsParams): Promise<BitrefillEnvelope<BitrefillProductDto[]>>;
  getProduct(productId: string): Promise<BitrefillEnvelope<BitrefillProductDto>>;
  createInvoice(payload: BitrefillCreateInvoicePayload): Promise<BitrefillEnvelope<BitrefillInvoiceDto>>;
  getInvoice(invoiceId: string): Promise<BitrefillEnvelope<BitrefillInvoiceDto>>;
  getOrder(orderId: string): Promise<BitrefillEnvelope<BitrefillOrderDto>>;
};

export interface BitrefillAdapterOptions {
  includeTestProducts?: boolean;
  paymentMethod: string;
  webhookUrl?: string;
  refundAddress?: string;
  receiptEmail?: string;
  sendEmail?: boolean;
  senderName?: string;
}

function toBitrefillProductType(category: OffRampCategory | undefined): string | undefined {
  switch (category) {
    case 'giftcard':
      return 'gift_card';
    case 'topup':
      return 'phone_refill';
    case 'billpay':
      return 'bill_payment';
    default:
      return undefined;
  }
}

function matchesQuery(product: Product, query: string): boolean {
  if (!query.trim()) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return [product.id, product.name, product.brand]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export class BitrefillAdapter implements OffRampProvider {
  readonly id = 'bitrefill' as const;
  readonly name = 'Bitrefill';
  readonly categories = ['giftcard', 'topup', 'esim', 'billpay'] as const;

  constructor(
    private readonly client: BitrefillClientLike,
    private readonly mapper: BitrefillMapper,
    private readonly options: BitrefillAdapterOptions,
  ) {}

  async searchProducts(query: string, options: SearchOptions = {}): Promise<Result<Product[], DomainError>> {
    try {
      const bitrefillCategory = toBitrefillProductType(options.category);

      const response = bitrefillCategory
        ? await this.client.listProducts({
            ...(bitrefillCategory ? { category: bitrefillCategory } : {}),
            ...(options.countryCode ? { countryCode: options.countryCode } : {}),
            ...(this.options.includeTestProducts !== undefined
              ? { includeTestProducts: this.options.includeTestProducts }
              : {}),
          })
        : await this.client.searchProducts({
            query,
            ...(this.options.includeTestProducts !== undefined
              ? { includeTestProducts: this.options.includeTestProducts }
              : {}),
          });

      const products = response.data
        .map((product) => this.mapper.toProduct(product, bitrefillCategory && options.category ? { category: options.category } : {}))
        .filter((product) => matchesQuery(product, query));

      return ok(products);
    } catch (error) {
      return err({
        type: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Bitrefill product search failed.',
      });
    }
  }

  async getQuote(product: Product, amount: Amount): Promise<Result<{ providerId: string; productId: string; faceValue: Amount; paymentAmount: Amount; estimatedDelivery: string }, DomainError>> {
    try {
      const productResponse = await this.client.getProduct(product.id);
      return this.mapper.toQuoteFromCatalogProduct(productResponse.data, amount);
    } catch (error) {
      return err({
        type: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Bitrefill quote failed.',
      });
    }
  }

  async createOrder(request: OrderRequest): Promise<Result<Order, DomainError>> {
    try {
      const productResponse = await this.client.getProduct(request.productId);
      const product = this.mapper.toProduct(productResponse.data);
      const quote = this.mapper.toQuoteFromCatalogProduct(productResponse.data, request.amount);

      if (!quote.ok) {
        return quote;
      }

      const invoice = await this.client.createInvoice(this.buildCreateInvoicePayload(product, request));

      return ok(
        this.mapper.toOrder(invoice.data, {
          product,
          amount: request.amount,
          idempotencyKey: request.idempotencyKey,
        }),
      );
    } catch (error) {
      return err({
        type: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Bitrefill order creation failed.',
      });
    }
  }

  async getOrderStatus(orderId: string): Promise<Result<OrderStatus, DomainError>> {
    try {
      const invoice = await this.client.getInvoice(orderId);
      return ok(this.mapper.toOrderStatus(invoice.data.status));
    } catch (error) {
      return err({
        type: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Bitrefill order status failed.',
      });
    }
  }

  async verifyWebhook(payload: unknown, _headers: Record<string, string> = {}): Promise<Result<WebhookEvent, DomainError>> {
    if (!payload || typeof payload !== 'object') {
      return err({
        type: 'UNKNOWN',
        message: 'Bitrefill webhook payload is invalid.',
      });
    }

    const invoice = 'data' in payload && payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (!('id' in invoice) || typeof invoice.id !== 'string') {
      return err({
        type: 'UNKNOWN',
        message: 'Bitrefill webhook payload is missing an invoice id.',
      });
    }

    try {
      const canonicalInvoice = await this.client.getInvoice(invoice.id);
      const canonicalOrderId = canonicalInvoice.data.orders?.[0]?.id;
      const canonicalOrder = canonicalOrderId ? await this.client.getOrder(canonicalOrderId) : null;

      return ok(this.mapper.toWebhookEvent(canonicalInvoice.data, canonicalOrder?.data));
    } catch (error) {
      return err({
        type: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Bitrefill webhook verification failed.',
      });
    }
  }

  private buildCreateInvoicePayload(product: Product, request: OrderRequest): BitrefillCreateInvoicePayload {
    const productPayload = {
      product_id: request.productId,
      quantity: 1,
      ...(product.denominations?.includes(request.amount.value)
        ? { package_id: this.resolvePackageId(product, request.amount) }
        : { value: request.amount.value }),
      ...(request.recipient?.name && request.recipient.email
        ? {
            gift: {
              recipient_name: request.recipient.name,
              recipient_email: request.recipient.email,
              sender_name: this.options.senderName ?? 'Pouch',
            },
          }
        : {}),
    };

    return {
      products: [productPayload],
      payment_method: this.options.paymentMethod,
      auto_pay: false,
      ...(this.options.webhookUrl ? { webhook_url: this.options.webhookUrl } : {}),
      ...(this.options.refundAddress ? { refund_address: this.options.refundAddress } : {}),
      ...(this.options.receiptEmail ? { email: this.options.receiptEmail } : {}),
      ...(this.options.sendEmail !== undefined ? { send_email: this.options.sendEmail } : {}),
    };
  }

  private resolvePackageId(product: Product, amount: Amount): string {
    const packages = this.extractPackages(product);
    const matchingPackage = packages.find((entry) => entry.value === amount.value);

    if (!matchingPackage) {
      throw new Error(`Bitrefill package metadata missing for ${product.id} ${amount.value} USD.`);
    }

    return matchingPackage.id;
  }

  private extractPackages(product: Product): Array<{ id: string; value: number }> {
    const rawProduct = product as Product & {
      __bitrefill?: {
        packages?: Array<{ id: string; value: number }>;
      };
    };

    return rawProduct.__bitrefill?.packages ?? [];
  }
}
