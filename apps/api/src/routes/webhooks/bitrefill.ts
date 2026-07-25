import { Hono } from 'hono';

import { BitrefillWebhookService } from '../../services/bitrefill-webhook-service';

export function createBitrefillWebhookRoutes(service: BitrefillWebhookService): Hono {
  const router = new Hono();

  router.post('/', async (context) => {
    const rawBody = await context.req.text();

    const headers: Record<string, string> = {};
    context.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const result = await service.handle(rawBody, headers);

    if (!result.ok) {
      // Signature failures are 401 (request could not be authenticated as Bitrefill).
      // Malformed-but-signed payloads (bad JSON, missing invoice id) are 400.
      const message = 'message' in result.error ? result.error.message : '';
      const isAuthFailure = message.startsWith('UNAUTHORIZED:');
      context.status(isAuthFailure ? 401 : 400);
      return context.json({
        error: 'Invalid Bitrefill webhook.',
        type: result.error.type,
      });
    }

    return context.json(result.value, 200);
  });

  return router;
}
