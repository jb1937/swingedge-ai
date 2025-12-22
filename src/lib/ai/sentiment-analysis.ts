// src/lib/ai/sentiment-analysis.ts

import Anthropic from '@anthropic-ai/sdk';
import { finnhubClient, FinnhubNews, FinnhubSentiment } from '@/lib/data/finnhub-client';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface NewsArticle {
  headline: string;
  summary: string;
  source: string;
  datetime: Date;
  url: string;
}

export interface SentimentAnalysis {
  symbol: string;
  overallScore: number; // 0-100, 50 = neutral
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100
  momentum: 'improving' | 'deteriorating' | 'stable';
  
  // Component scores
  components: {
    newsHeadlines: number;
    analystSentiment: number;
    socialBuzz: number;
    recentTrend: number;
  };
  
  // Details
  bullishFactors: string[];
  bearishFactors: string[];
  keyNews: Array<{
    headline: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    impact: 'high' | 'medium' | 'low';
  }>;
  
  // Finnhub data
  finnhubSentiment?: {
    bullishPercent: number;
    bearishPercent: number;
    articlesThisWeek: number;
    buzz: number;
  };
  
  lastUpdated: Date;
}

/**
 * Analyze sentiment for a stock using Claude + Finnhub data
 */
export async function analyzeSentiment(symbol: string): Promise<SentimentAnalysis> {
  // Fetch data in parallel
  const [newsResult, sentimentResult, recommendationsResult] = await Promise.allSettled([
    finnhubClient.getCompanyNews(symbol, 7),
    finnhubClient.getNewsSentiment(symbol),
    finnhubClient.getRecommendations(symbol),
  ]);
  
  const news = newsResult.status === 'fulfilled' ? newsResult.value : [];
  const finnhubSentiment = sentimentResult.status === 'fulfilled' ? sentimentResult.value : null;
  const recommendations = recommendationsResult.status === 'fulfilled' ? recommendationsResult.value : [];
  
  // Get top 10 most recent news articles
  const recentNews = news.slice(0, 10);
  
  // Use Claude to analyze headlines
  const claudeAnalysis = await analyzeWithClaude(symbol, recentNews, finnhubSentiment, recommendations);
  
  // Calculate component scores
  const newsScore = claudeAnalysis.headlineSentiment;
  const analystScore = calculateAnalystSentiment(recommendations);
  const socialScore = finnhubSentiment ? 
    finnhubSentiment.sentiment.bullishPercent * 100 : 50;
  const trendScore = calculateTrendScore(recentNews, claudeAnalysis);
  
  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    newsScore * 0.35 +
    analystScore * 0.25 +
    socialScore * 0.20 +
    trendScore * 0.20
  );
  
  // Determine direction and momentum
  const direction = overallScore >= 60 ? 'bullish' : overallScore <= 40 ? 'bearish' : 'neutral';
  const momentum = claudeAnalysis.momentum;
  
  return {
    symbol: symbol.toUpperCase(),
    overallScore,
    direction,
    confidence: claudeAnalysis.confidence,
    momentum,
    components: {
      newsHeadlines: Math.round(newsScore),
      analystSentiment: Math.round(analystScore),
      socialBuzz: Math.round(socialScore),
      recentTrend: Math.round(trendScore),
    },
    bullishFactors: claudeAnalysis.bullishFactors,
    bearishFactors: claudeAnalysis.bearishFactors,
    keyNews: claudeAnalysis.keyNews,
    finnhubSentiment: finnhubSentiment ? {
      bullishPercent: finnhubSentiment.sentiment.bullishPercent * 100,
      bearishPercent: finnhubSentiment.sentiment.bearishPercent * 100,
      articlesThisWeek: finnhubSentiment.buzz.articlesInLastWeek,
      buzz: finnhubSentiment.buzz.buzz,
    } : undefined,
    lastUpdated: new Date(),
  };
}

interface ClaudeAnalysis {
  headlineSentiment: number;
  confidence: number;
  momentum: 'improving' | 'deteriorating' | 'stable';
  bullishFactors: string[];
  bearishFactors: string[];
  keyNews: Array<{
    headline: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    impact: 'high' | 'medium' | 'low';
  }>;
}

async function analyzeWithClaude(
  symbol: string,
  news: FinnhubNews[],
  finnhubSentiment: FinnhubSentiment | null,
  recommendations: Array<{ buy: number; hold: number; sell: number; strongBuy: number; strongSell: number }>
): Promise<ClaudeAnalysis> {
  if (news.length === 0) {
    return {
      headlineSentiment: 50,
      confidence: 20,
      momentum: 'stable',
      bullishFactors: ['No recent news available'],
      bearishFactors: [],
      keyNews: [],
    };
  }
  
  const newsContext = news.map(n => ({
    headline: n.headline,
    summary: n.summary?.slice(0, 200),
    source: n.source,
    date: new Date(n.datetime * 1000).toISOString().split('T')[0],
  }));
  
  const prompt = `Analyze the sentiment of recent news for ${symbol} stock. 

Recent News Headlines:
${newsContext.map((n, i) => `${i + 1}. [${n.date}] ${n.headline} (${n.source})
   ${n.summary || 'No summary'}`).join('\n\n')}

${finnhubSentiment ? `
Finnhub Sentiment Data:
- Bullish: ${(finnhubSentiment.sentiment.bullishPercent * 100).toFixed(1)}%
- Bearish: ${(finnhubSentiment.sentiment.bearishPercent * 100).toFixed(1)}%
- Articles this week: ${finnhubSentiment.buzz.articlesInLastWeek}
- Buzz score: ${finnhubSentiment.buzz.buzz.toFixed(2)}
` : ''}

${recommendations.length > 0 ? `
Latest Analyst Recommendations:
- Strong Buy: ${recommendations[0].strongBuy}
- Buy: ${recommendations[0].buy}
- Hold: ${recommendations[0].hold}
- Sell: ${recommendations[0].sell}
- Strong Sell: ${recommendations[0].strongSell}
` : ''}

Provide analysis in JSON format:
{
  "headlineSentiment": <0-100 score, 50=neutral, >60=bullish, <40=bearish>,
  "confidence": <0-100 how confident in this analysis>,
  "momentum": "<improving|deteriorating|stable> - is sentiment getting better or worse?",
  "bullishFactors": ["<up to 3 key bullish factors from news>"],
  "bearishFactors": ["<up to 3 key bearish factors from news>"],
  "keyNews": [
    {"headline": "<headline>", "sentiment": "<positive|negative|neutral>", "impact": "<high|medium|low>"}
  ] // Top 3-5 most impactful news items
}

Focus on:
1. Overall tone of headlines - are they positive or negative?
2. Any earnings, product, or strategic news
3. Any analyst upgrades/downgrades or price target changes
4. Any sector or macro factors affecting the stock
5. Is sentiment improving or worsening compared to older articles?`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    return JSON.parse(jsonMatch[0]) as ClaudeAnalysis;
  } catch (error) {
    console.error('Claude sentiment analysis error:', error);
    // Return default values on error
    return {
      headlineSentiment: 50,
      confidence: 10,
      momentum: 'stable',
      bullishFactors: ['Analysis unavailable'],
      bearishFactors: [],
      keyNews: news.slice(0, 3).map(n => ({
        headline: n.headline,
        sentiment: 'neutral' as const,
        impact: 'medium' as const,
      })),
    };
  }
}

function calculateAnalystSentiment(
  recommendations: Array<{ buy: number; hold: number; sell: number; strongBuy: number; strongSell: number }>
): number {
  if (recommendations.length === 0) return 50;
  
  const latest = recommendations[0];
  const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
  
  if (total === 0) return 50;
  
  // Weighted score: Strong Buy = 100, Buy = 75, Hold = 50, Sell = 25, Strong Sell = 0
  const weightedSum = 
    latest.strongBuy * 100 +
    latest.buy * 75 +
    latest.hold * 50 +
    latest.sell * 25 +
    latest.strongSell * 0;
  
  return weightedSum / total;
}

function calculateTrendScore(news: FinnhubNews[], claudeAnalysis: ClaudeAnalysis): number {
  // If momentum is improving, trend score is higher
  // If momentum is deteriorating, trend score is lower
  const baseScore = claudeAnalysis.headlineSentiment;
  
  switch (claudeAnalysis.momentum) {
    case 'improving':
      return Math.min(100, baseScore + 15);
    case 'deteriorating':
      return Math.max(0, baseScore - 15);
    default:
      return baseScore;
  }
}

/**
 * Quick sentiment check (lighter weight, no Claude call)
 */
export async function quickSentimentCheck(symbol: string): Promise<{
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  articlesThisWeek: number;
}> {
  try {
    const sentiment = await finnhubClient.getNewsSentiment(symbol);
    const bullish = sentiment.sentiment.bullishPercent * 100;
    
    return {
      score: Math.round(bullish),
      direction: bullish >= 60 ? 'bullish' : bullish <= 40 ? 'bearish' : 'neutral',
      articlesThisWeek: sentiment.buzz.articlesInLastWeek,
    };
  } catch {
    return {
      score: 50,
      direction: 'neutral',
      articlesThisWeek: 0,
    };
  }
}
