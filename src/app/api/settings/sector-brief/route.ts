// src/app/api/settings/sector-brief/route.ts
//
// GET  — return the current sector brief from Redis
// POST — manually trigger a new sector brief generation

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { generateSectorBrief } from '@/lib/analysis/sector-brief';

const REDIS_KEY = 'swingedge:sector_brief';
const AUTO_APPLY_KEY = 'swingedge:sector_brief_auto_apply';

export async function GET() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const brief = await redis.get<string>(REDIS_KEY);
  const autoApply = await redis.get<boolean>(AUTO_APPLY_KEY) ?? true;

  if (!brief) {
    return NextResponse.json({ brief: null, autoApply });
  }

  return NextResponse.json({
    brief: typeof brief === 'string' ? JSON.parse(brief) : brief,
    autoApply,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  // Toggle auto-apply
  if ('autoApply' in body) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.set(AUTO_APPLY_KEY, body.autoApply as boolean);
    return NextResponse.json({ ok: true, autoApply: body.autoApply });
  }

  // Manual regeneration
  try {
    const brief = await generateSectorBrief();
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate sector brief' },
      { status: 500 }
    );
  }
}
