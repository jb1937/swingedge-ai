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
    riskRewardRatio?: number;
    tradeQuality?: 'excellent' | 'good' | 'fair' | 'poor';
    suggestedEntry?: number;
    suggestedStop?: number;
    suggestedTarget?: number;
  }[];
  marketOverview: string;
  sectorInsights: string;
  riskWarnings: string[];
  suggestedPortfolioAllocation: string;
  generatedAt: Date;
}

// Minimum R:R ratio threshold for buy recommendations
// Thresholds adjusted for swing trading with tighter, achievable targets
const MIN_RR_FOR_BUY = 1.2;
const MIN_RR_FOR_STRONG_BUY = 1.5;

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
    // Include R:R data
    riskRewardRatio: r.riskRewardRatio?.toFixed(2) || 'N/A',
    tradeQuality: r.tradeQuality || 'unknown',
    suggestedEntry: r.suggestedEntry?.toFixed(2) || 'N/A',
    suggestedStop: r.suggestedStop?.toFixed(2) || 'N/A',
    suggestedTarget: r.suggestedTarget?.toFixed(2) || 'N/A',
  }));

  const prompt = `You are an expert swing trading analyst. Analyze these stock screening results and provide actionable trading recommendations.

SCREENING TYPE: ${scanType}

SCREENED STOCKS (including pre-calculated Risk/Reward ratios based on support/resistance levels):
${JSON.stringify(stockData, null, 2)}

CRITICAL: RISK/REWARD RATIO REQUIREMENTS
- The riskRewardRatio field shows the calculated reward-to-risk ratio based on actual support/resistance levels
- tradeQuality field indicates: excellent (≥2:1), good (≥1.5:1), fair (≥1.2:1), poor (<1.2:1)
- NEVER recommend "strong_buy" for stocks with R:R below 1.5:1
- NEVER recommend "buy" for stocks with R:R below 1.2:1
- Stocks with "poor" tradeQuality should be "hold" or "avoid" regardless of technical score
- A high technical score does NOT justify a buy if R:R is unfavorable

Based on this screening data, provide:

1. TOP 3 PICKS - For each stock, provide:
   - Recommendation: strong_buy (only if R:R ≥ 2:1), buy (only if R:R ≥ 1.5:1), hold, or avoid
   - Brief reasoning (2-3 sentences) - MUST mention the R:R ratio and why it supports or limits the recommendation
   - Suggested trading strategy using the pre-calculated entry, stop, and target prices
   - Risk level: low, medium, or high

2. MARKET OVERVIEW - 2-3 sentences about overall market conditions based on this scan

3. SECTOR INSIGHTS - Key observations about the sector/group being scanned

4. RISK WARNINGS - List 2-3 specific risks to watch

5. PORTFOLIO SUGGESTION - How to allocate between these picks (consider R:R quality)

Respond in this exact JSON format:
{
  "topPicks": [
    {
      "symbol": "SYMBOL",
      "recommendation": "strong_buy|buy|hold|avoid",
      "reasoning": "explanation that includes R:R ratio justification",
      "suggestedStrategy": "strategy details with specific entry/stop/target from the data",
      "riskLevel": "low|medium|high"
    }
  ],
  "marketOverview": "overview text",
  "sectorInsights": "insights text", 
  "riskWarnings": ["warning1", "warning2"],
  "suggestedPortfolioAllocation": "allocation suggestion"
}

Focus on swing trading timeframes (3-10 days). Prioritize stocks with good R:R ratios over those with high technical scores but poor R:R.`;

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

    // Post-process to enforce R:R constraints and add R:R data
    const processedPicks = parsed.topPicks.map((pick: { symbol: string; recommendation: string; reasoning: string; suggestedStrategy: string; riskLevel: string }) => {
      // Find the original result data for this symbol
      const originalData = results.find(r => r.symbol === pick.symbol);
      const rr = originalData?.riskRewardRatio || 0;
      const tradeQuality = originalData?.tradeQuality || 'poor';
      
      // Enforce R:R constraints - downgrade recommendations if necessary
      let adjustedRecommendation = pick.recommendation;
      let adjustedReasoning = pick.reasoning;
      
      if (pick.recommendation === 'strong_buy' && rr < MIN_RR_FOR_STRONG_BUY) {
        adjustedRecommendation = rr >= MIN_RR_FOR_BUY ? 'buy' : 'hold';
        adjustedReasoning = `${pick.reasoning} [Adjusted from strong_buy due to R:R of ${rr.toFixed(2)}:1 - below ${MIN_RR_FOR_STRONG_BUY}:1 threshold]`;
      } else if (pick.recommendation === 'buy' && rr < MIN_RR_FOR_BUY) {
        adjustedRecommendation = 'hold';
        adjustedReasoning = `${pick.reasoning} [Adjusted from buy due to R:R of ${rr.toFixed(2)}:1 - below ${MIN_RR_FOR_BUY}:1 threshold]`;
      }
      
      return {
        ...pick,
        recommendation: adjustedRecommendation,
        reasoning: adjustedReasoning,
        riskRewardRatio: rr,
        tradeQuality,
        suggestedEntry: originalData?.suggestedEntry,
        suggestedStop: originalData?.suggestedStop,
        suggestedTarget: originalData?.suggestedTarget,
      };
    });

    return {
      ...parsed,
      topPicks: processedPicks,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Failed to generate recommendations:', error);
    throw error;
  }
}
