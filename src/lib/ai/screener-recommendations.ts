// src/lib/ai/screener-recommendations.ts

import Anthropic from '@anthropic-ai/sdk';
import { ScreenerResult } from '@/types/analysis';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ScreenerRecommendation {
  topPicks: {
    symbol: string;
    recommendation: 'strong_buy' | 'buy' | 'hold' | 'avoid';
    reasoning: string;
    suggestedStrategy: string;
    riskLevel: 'low' | 'medium' | 'high';
  }[];
  marketOverview: string;
  sectorInsights: string;
  riskWarnings: string[];
  suggestedPortfolioAllocation: string;
  generatedAt: Date;
}

export async function generateScreenerRecommendations(
  results: ScreenerResult[],
  scanType: string
): Promise<ScreenerRecommendation> {
  const stockData = results.map(r => ({
    symbol: r.symbol,
    price: r.price,
    changePercent: r.changePercent.toFixed(2),
    technicalScore: r.technicalScore,
    signalStrength: (r.signalStrength * 100).toFixed(0),
    criteria: r.matchedCriteria.join(', '),
  }));

  const prompt = `You are an expert swing trading analyst. Analyze these stock screening results and provide actionable trading recommendations.

SCREENING TYPE: ${scanType}

SCREENED STOCKS:
${JSON.stringify(stockData, null, 2)}

Based on this screening data, provide:

1. TOP 3 PICKS - For each stock, provide:
   - Recommendation: strong_buy, buy, hold, or avoid
   - Brief reasoning (2-3 sentences)
   - Suggested trading strategy (entry, target, stop-loss approach)
   - Risk level: low, medium, or high

2. MARKET OVERVIEW - 2-3 sentences about overall market conditions based on this scan

3. SECTOR INSIGHTS - Key observations about the sector/group being scanned

4. RISK WARNINGS - List 2-3 specific risks to watch

5. PORTFOLIO SUGGESTION - How to allocate between these picks

Respond in this exact JSON format:
{
  "topPicks": [
    {
      "symbol": "SYMBOL",
      "recommendation": "strong_buy|buy|hold|avoid",
      "reasoning": "explanation",
      "suggestedStrategy": "strategy details",
      "riskLevel": "low|medium|high"
    }
  ],
  "marketOverview": "overview text",
  "sectorInsights": "insights text", 
  "riskWarnings": ["warning1", "warning2"],
  "suggestedPortfolioAllocation": "allocation suggestion"
}

Focus on swing trading timeframes (3-10 days). Be specific with entry/exit guidance.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Extract JSON from the response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      ...parsed,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Failed to generate recommendations:', error);
    throw error;
  }
}
