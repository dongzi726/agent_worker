// ============================================================
// routes/chat.ts — User-facing chat API routes (v3: API Key auth)
// ============================================================

import type { Request, Response } from 'express';
import type { ModelRouter } from '../router';
import type { ApiResponse, ChatRequest } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../logger';
import { requireApiKey } from '../auth/middleware';
import { db, usageLogs } from '../db/db';
import { sql } from 'drizzle-orm';

export class ChatRoutes {
  private router: ModelRouter;
  private includeFallbackDetail: boolean;

  constructor(router: ModelRouter, includeFallbackDetail: boolean = false) {
    this.router = router;
    this.includeFallbackDetail = includeFallbackDetail;
  }

  /** POST /v1/chat — Unified chat endpoint */
  async chat(req: Request, res: Response): Promise<void> {
    // API Key auth
    await requireApiKey(req, res, () => {});
    if (res.headersSent) return;

    try {
      const body = req.body as ChatRequest;

      // Validate prompt
      if (!body?.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        res.status(400).json({
          code: 'INVALID_REQUEST',
          message: 'prompt is required and must be a non-empty string',
          data: null,
        } as ApiResponse<null>);
        return;
      }

      // Validate max_tokens if provided
      if (body.max_tokens !== undefined) {
        if (typeof body.max_tokens !== 'number' || body.max_tokens <= 0) {
          res.status(400).json({
            code: 'INVALID_REQUEST',
            message: 'max_tokens must be a positive number',
            data: null,
          } as ApiResponse<null>);
          return;
        }
      }

      // Validate temperature if provided
      if (body.temperature !== undefined) {
        if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 1) {
          res.status(400).json({
            code: 'INVALID_REQUEST',
            message: 'temperature must be between 0 and 1',
            data: null,
          } as ApiResponse<null>);
          return;
        }
      }

      const requestId = uuidv4();
      const startTime = Date.now();
      log.info('Chat request received', { requestId, promptLength: body.prompt.length });

      // Route to best available model
      const { result, modelId, vendorId, keyId, fallbackDetail } = await this.router.route({
        prompt: body.prompt.trim(),
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        system_prompt: body.system_prompt,
      });

      const elapsed = Date.now() - startTime;

      // Log usage
      const apiKeyId = (req as any).apiKey?.keyId;
      const apiUserId = (req as any).apiKey?.userId;
      if (apiUserId && apiKeyId) {
        await db.insert(usageLogs).values({
          userId: apiUserId,
          keyId: apiKeyId,
          modelId,
          statusCode: 200,
          promptTokens: result.prompt_tokens,
          completionTokens: result.completion_tokens,
          totalTokens: result.total_tokens,
          latencyMs: elapsed,
        });

        // Update user + key used_tokens
        await db.execute(sql`
          UPDATE users SET used_tokens = used_tokens + ${result.total_tokens}
          WHERE id = ${apiUserId}
        `);
        await db.execute(sql`
          UPDATE user_api_keys SET used_tokens = used_tokens + ${result.total_tokens},
            last_used_at = NOW()
          WHERE key_id = ${apiKeyId}
        `);
      }

      const responseData: {
        id: string;
        content: string;
        model_used: string;
        vendor_used: string;
        key_used: string;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        fallback_count: number;
        fallback_detail?: ReturnType<typeof buildFallbackDetail>;
      } = {
        id: requestId,
        content: result.content,
        model_used: modelId,
        vendor_used: vendorId,
        key_used: keyId,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        total_tokens: result.total_tokens,
        fallback_count: fallbackDetail.key_fallbacks + fallbackDetail.model_fallbacks,
      };

      if (this.includeFallbackDetail) {
        responseData.fallback_detail = buildFallbackDetail(fallbackDetail);
      }

      const response: ApiResponse<typeof responseData> = {
        code: 0,
        message: 'ok',
        data: responseData,
      };

      res.json(response);
    } catch (err: unknown) {
      this.handleError(err, res);
    }
  }

  /** POST /v1/chat/completions — OpenAI-compatible endpoint */
  async chatCompletions(req: Request, res: Response): Promise<void> {
    // API Key auth
    await requireApiKey(req, res, () => {});
    if (res.headersSent) return;

    try {
      const body = req.body;

      // Validate messages
      if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        res.status(400).json({
          code: 'INVALID_REQUEST',
          message: 'messages array is required and must not be empty',
          data: null,
        } as ApiResponse<null>);
        return;
      }

      // Extract prompt from messages (use last user message as prompt)
      const userMessages = body.messages.filter((m: { role: string }) => m.role === 'user');
      const lastUserMessage = userMessages[userMessages.length - 1];
      const systemMessages = body.messages.filter((m: { role: string }) => m.role === 'system');
      const systemPrompt = systemMessages.length > 0
        ? systemMessages.map((m: { content: string }) => m.content).join('\n')
        : undefined;

      const prompt = lastUserMessage?.content ?? '';
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        res.status(400).json({
          code: 'INVALID_REQUEST',
          message: 'at least one user message with non-empty content is required',
          data: null,
        } as ApiResponse<null>);
        return;
      }

      // Build chat request for the router
      const chatRequest: ChatRequest = {
        prompt: prompt.trim(),
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        system_prompt: systemPrompt,
      };

      const requestId = uuidv4();
      const startTime = Date.now();
      log.info('OpenAI-compatible chat request received', { requestId, promptLength: prompt.length });

      // Route to best available model
      const { result, modelId, vendorId, keyId, fallbackDetail } = await this.router.route(chatRequest);

      const elapsed = Date.now() - startTime;

      // Log usage
      const apiKeyId = (req as any).apiKey?.keyId;
      const apiUserId = (req as any).apiKey?.userId;
      if (apiUserId && apiKeyId) {
        await db.insert(usageLogs).values({
          userId: apiUserId,
          keyId: apiKeyId,
          modelId,
          statusCode: 200,
          promptTokens: result.prompt_tokens,
          completionTokens: result.completion_tokens,
          totalTokens: result.total_tokens,
          latencyMs: elapsed,
        });

        // Update user + key used_tokens
        await db.execute(sql`
          UPDATE users SET used_tokens = used_tokens + ${result.total_tokens}
          WHERE id = ${apiUserId}
        `);
        await db.execute(sql`
          UPDATE user_api_keys SET used_tokens = used_tokens + ${result.total_tokens},
            last_used_at = NOW()
          WHERE key_id = ${apiKeyId}
        `);
      }

      const responseData: {
        id: string;
        object: string;
        created: number;
        model: string;
        choices: Array<{
          index: number;
          message: { role: string; content: string };
          finish_reason: string;
        }>;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
        vendor_used: string;
        key_used: string;
        fallback_count: number;
      } = {
        id: requestId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result.content,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: result.prompt_tokens,
          completion_tokens: result.completion_tokens,
          total_tokens: result.total_tokens,
        },
        vendor_used: vendorId,
        key_used: keyId,
        fallback_count: fallbackDetail.key_fallbacks + fallbackDetail.model_fallbacks,
      };

      const response: ApiResponse<typeof responseData> = {
        code: 0,
        message: 'ok',
        data: responseData,
      };

      res.json(response);
    } catch (err: unknown) {
      this.handleError(err, res);
    }
  }

  /** Unified error handler for chat routes */
  private handleError(err: unknown, res: Response): void {
    const error = err instanceof Error ? err : new Error(String(err));
    const errorObj = err as Record<string, unknown>;
    const errorCode = (errorObj.code as string) || 'INTERNAL_ERROR';
    const statusCode = (errorObj.statusCode as number) || 500;

    log.error('Chat request failed', {
      code: errorCode,
      statusCode,
      message: error.message,
    });

    res.status(statusCode).json({
      code: errorCode,
      message: error.message,
      data: null,
    } as ApiResponse<null>);
  }
}

/** Build fallback_detail for API response */
function buildFallbackDetail(detail: {
  key_fallbacks: number;
  model_fallbacks: number;
  tried_keys: string[];
  tried_models: string[];
}) {
  return {
    key_fallbacks: detail.key_fallbacks,
    model_fallbacks: detail.model_fallbacks,
    tried_keys: detail.tried_keys,
    tried_models: detail.tried_models,
  };
}

// (sql already imported at top)
