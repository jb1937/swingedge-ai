// src/app/api/chat/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import Anthropic from '@anthropic-ai/sdk';
import { chatRequestSchema } from '@/lib/validation/schemas';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are SwingEdge AI, an expert swing trading assistant. You help traders with:

1. **Technical Analysis** - Explaining indicators (RSI, MACD, EMAs, Bollinger Bands, etc.)
2. **Trading Strategies** - Swing trading setups, entry/exit criteria, risk management
3. **Market Analysis** - Understanding market conditions, sector rotation, trends
4. **Position Sizing** - Risk per trade, portfolio allocation, stop-loss placement
5. **Trade Planning** - Creating trading plans, journaling, reviewing trades

GUIDELINES:
- Keep responses concise but informative (2-4 paragraphs max unless more detail is requested)
- Focus on swing trading timeframes (3-10 days typically)
- Always emphasize risk management
- Provide specific, actionable advice when possible
- If asked about specific stocks, explain you can analyze them using the Analysis page
- For real-time prices, direct users to check the Dashboard or Analysis pages

You have access to the following features in the platform:
- Dashboard: View portfolio, positions, P&L, and place orders
- Technical Analysis: RSI, MACD, EMAs, Bollinger Bands, ADX, ATR for any stock
- Stock Screener: Scan sectors for trading opportunities
- Backtesting: Test EMA crossover strategy on historical data
- AI Thesis: Get detailed trade recommendations with entry/stop/target levels

Be friendly, helpful, and educational. Help traders improve their skills and make better decisions.`;

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResponse = rateLimitMiddleware(request, 'chat');
    if (rateLimitResponse) return rateLimitResponse;

    // Get session
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request
    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          code: 'VALIDATION_ERROR',
          details: validation.error.flatten() 
        },
        { status: 400 }
      );
    }

    const { message, messages } = validation.data;
    
    // Build conversation history for Claude
    const claudeMessages = [
      ...(messages || []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: claudeMessages,
    });
    
    const assistantMessage = response.content[0];
    if (assistantMessage.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
    const jsonResponse = NextResponse.json({
      message: assistantMessage.text,
    });
    
    return addRateLimitHeaders(jsonResponse, getClientIP(request), 'chat');
  } catch (error) {
    console.error('Chat API error:', error);
    // Don't expose internal error details
    return NextResponse.json(
      { error: 'Failed to get response. Please try again.' },
      { status: 500 }
    );
  }
}
