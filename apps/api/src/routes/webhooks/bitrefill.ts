import { Hono } from 'hono';

import { BitrefillWebhookService } from '../../services/bitrefill-webhook-service';

export function createBitrefillWebhookRoutes(service: BitrefillWebhookService): Hono {
  const router = new Hono();

  router.post('/', async (context) => {
    let payload: unknown;

    try {
      payload = await context.req.json();
    } catch {
      return context.json({ error: 'request body must be valid JSON' }, 400);
    }

    const headers: Record<string, string> = {};
    context.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const result = await service.handle(payload, headers);

    if (!result.ok) {
      context.status(400);
      return context.json({
        error: 'Invalid Bitrefill webhook payload.',
        type: result.error.type,
      });
    }

    return context.json(result.value, 200);
  });

  return router;
}
