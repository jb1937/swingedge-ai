// src/lib/analysis/options-flow.ts

import { finnhubClient } from '@/lib/data/finnhub-client';

export interface OptionsFlowAnalysis {
  symbol: string;
  
  // Put/Call Ratio Analysis
  putCallRatio: {
    current: number;
    average7Day: number;
    signal: 'bullish' | 'bearish' | 'neutral';
    description: string;
  };
  
  // Volume Analysis  
  volumeAnalysis: {
    callVolume: number;
    putVolume: number;
    totalVolume: number;
    bullishPercent: number;
    volumeSpike: boolean;
    avgDailyVolume: number;
  };
  
  // Open Interest
  openInterest: {
    callOI: number;
    putOI: number;
    oiRatio: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  
  // Smart Money Indicators
  smartMoneySignal: {
    score: number; // 0-100
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    signals: string[];
  };
  
  // Unusual Activity
  unusualActivity: Array<{
    type: 'call' | 'put';
    strike: number;
    expiration: string;
    volume: number;
    openInterest: number;
    volumeOIRatio: number;
    sentiment: 'bullish' | 'bearish';
    description: string;
  }>;
  
  // Overall Assessment
  overallSentiment: 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish';
  summary: string;
  
  lastUpdated: Date;
}

/**
 * Analyze options flow for a symbol using multiple data sources
 */
export async function analyzeOptionsFlow(symbol: string): Promise<OptionsFlowAnalysis> {
  // Fetch multiple data sources in parallel
  const [insidersResult, recommendationsResult] = await Promise.allSettled([
    finnhubClient.getInsiderTransactions(symbol),
    finnhubClient.getRecommendations(symbol),
  ]);
  
  const insiders = insidersResult.status === 'fulfilled' ? insidersResult.value : null;
  const recommendations = recommendationsResult.status === 'fulfilled' ? recommendationsResult.value : [];
  
  // Calculate smart money metrics from insider activity + analyst recommendations
  const analysis = calculateSmartMoneyMetrics(symbol, insiders, recommendations);
  
  return analysis;
}

interface InsiderData {
  data: Array<{
    name: string;
    share: number;
    change: number;
    filingDate: string;
    transactionDate: string;
    transactionPrice: number;
    transactionCode: string;
  }>;
}

interface RecommendationData {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
}

/**
 * Calculate smart money metrics from insider activity + analyst recommendations
 */
function calculateSmartMoneyMetrics(
  symbol: string,
  insiders: InsiderData | null,
  recommendations: RecommendationData[]
): OptionsFlowAnalysis {
  const signals: string[] = [];
  let score = 50; // Start neutral
  
  // Analyze insider activity
  let insiderBuys = 0;
  let insiderSells = 0;
  let totalInsiderValue = 0;
  
  if (insiders && insiders.data && insiders.data.length > 0) {
    // Look at last 90 days of insider transactions
    const recentInsiders = insiders.data.slice(0, 20);
    
    for (const tx of recentInsiders) {
      // P = Purchase, S = Sale
      if (tx.transactionCode === 'P' || tx.change > 0) {
        insiderBuys++;
        totalInsiderValue += Math.abs(tx.change * (tx.transactionPrice || 0));
      } else if (tx.transactionCode === 'S' || tx.change < 0) {
        insiderSells++;
        totalInsiderValue += Math.abs(tx.change * (tx.transactionPrice || 0));
      }
    }
    
    // Note: Insider selling is common for tax/diversification reasons, so it's weighted less heavily
    // Insider BUYING is a stronger signal since they're using their own money
    if (insiderBuys > insiderSells * 2) {
      score += 25; // Strong bullish - insiders are buying heavily
      signals.push(`Strong insider buying (${insiderBuys} buys vs ${insiderSells} sells)`);
    } else if (insiderBuys > insiderSells) {
      score += 15;
      signals.push(`Net insider buying activity`);
    } else if (insiderSells > insiderBuys * 5) {
      // Only penalize heavily if selling is extreme
      score -= 10;
      signals.push(`Heavy insider selling (${insiderSells} sells vs ${insiderBuys} buys)`);
    } else if (insiderSells > insiderBuys) {
      // Light penalty - selling is often routine
      score -= 3;
      signals.push(`Routine insider selling (${insiderSells} sells vs ${insiderBuys} buys)`);
    }
  } else {
    signals.push('No recent insider transactions');
  }
  
  // Analyze analyst recommendations (weighted more heavily as it's professional consensus)
  let analystScore = 50;
  if (recommendations && recommendations.length > 0) {
    const latest = recommendations[0];
    const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
    
    if (total > 0) {
      // Weighted score: Strong Buy = 100, Buy = 75, Hold = 50, Sell = 25, Strong Sell = 0
      analystScore = (
        latest.strongBuy * 100 +
        latest.buy * 75 +
        latest.hold * 50 +
        latest.sell * 25 +
        latest.strongSell * 0
      ) / total;
      
      const bullishAnalysts = latest.strongBuy + latest.buy;
      const bearishAnalysts = latest.sell + latest.strongSell;
      const bullishRatio = total > 0 ? bullishAnalysts / total : 0.5;
      
      // Scale analyst impact based on consensus strength
      if (analystScore >= 75 && bullishRatio > 0.8) {
        // Very strong consensus (80%+ bullish)
        score += 30;
        signals.push(`Very strong analyst consensus: ${bullishAnalysts} buy vs ${bearishAnalysts} sell (${(bullishRatio * 100).toFixed(0)}% bullish)`);
      } else if (analystScore >= 70) {
        score += 20;
        signals.push(`Strong analyst consensus: ${bullishAnalysts} buy vs ${bearishAnalysts} sell`);
      } else if (analystScore >= 60) {
        score += 12;
        signals.push(`Positive analyst sentiment (${bullishAnalysts} bullish)`);
      } else if (analystScore <= 30 && bearishAnalysts > bullishAnalysts) {
        score -= 25;
        signals.push(`Strong negative consensus: ${bearishAnalysts} sell ratings`);
      } else if (analystScore <= 40) {
        score -= 15;
        signals.push(`Negative analyst consensus: ${bearishAnalysts} sell ratings`);
      } else {
        signals.push(`Neutral analyst consensus (${latest.hold} hold ratings)`);
      }
    }
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Determine direction
  const direction = score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
  const confidence = Math.abs(score - 50) * 2;
  
  // Determine overall sentiment
  const overallSentiment: OptionsFlowAnalysis['overallSentiment'] = 
    score >= 75 ? 'strongly_bullish' :
    score >= 60 ? 'bullish' :
    score <= 25 ? 'strongly_bearish' :
    score <= 40 ? 'bearish' : 'neutral';
  
  // Generate summary
  const sentimentText = {
    'strongly_bullish': 'strongly bullish',
    'bullish': 'bullish',
    'neutral': 'neutral',
    'bearish': 'bearish',
    'strongly_bearish': 'strongly bearish',
  };
  
  let summary = `Smart money analysis for ${symbol} is ${sentimentText[overallSentiment]}. `;
  if (signals.length > 0) {
    summary += signals.slice(0, 2).join('. ') + '.';
  }
  
  return {
    symbol: symbol.toUpperCase(),
    putCallRatio: {
      current: 0,
      average7Day: 0,
      signal: 'neutral',
      description: 'Based on insider + analyst data (options data requires additional subscription)',
    },
    volumeAnalysis: {
      callVolume: insiderBuys,
      putVolume: insiderSells,
      totalVolume: insiderBuys + insiderSells,
      bullishPercent: (insiderBuys + insiderSells) > 0 
        ? (insiderBuys / (insiderBuys + insiderSells)) * 100 
        : 50,
      volumeSpike: false,
      avgDailyVolume: 0,
    },
    openInterest: {
      callOI: recommendations[0]?.strongBuy + recommendations[0]?.buy || 0,
      putOI: recommendations[0]?.sell + recommendations[0]?.strongSell || 0,
      oiRatio: 1,
      trend: 'stable',
    },
    smartMoneySignal: {
      score,
      direction,
      confidence,
      signals,
    },
    unusualActivity: [],
    overallSentiment,
    summary,
    lastUpdated: new Date(),
  };
}

interface OptionsSentimentData {
  symbol: string;
  data: Array<{
    date: string;
    callVolume: number;
    putVolume: number;
    callOpenInterest: number;
    putOpenInterest: number;
    pcRatio: number;
  }>;
}

function calculateOptionsMetrics(
  symbol: string,
  sentimentData: OptionsSentimentData | null
): OptionsFlowAnalysis {
  // Default values if no data
  if (!sentimentData || !sentimentData.data || sentimentData.data.length === 0) {
    return createDefaultAnalysis(symbol);
  }
  
  const data = sentimentData.data;
  const latest = data[data.length - 1];
  const recent7Days = data.slice(-7);
  
  // Put/Call Ratio Analysis
  const currentPCR = latest.pcRatio;
  const avg7DayPCR = recent7Days.reduce((sum, d) => sum + d.pcRatio, 0) / recent7Days.length;
  
  // PCR interpretation: > 1.0 = more puts (bearish), < 0.7 = more calls (bullish)
  // However, extreme PCR can be contrarian (too many puts = everyone bearish = bullish reversal)
  let pcrSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let pcrDescription = '';
  
  if (currentPCR > 1.2) {
    // Very high PCR - could be bearish or contrarian bullish
    pcrSignal = 'bullish'; // Contrarian - everyone is buying puts
    pcrDescription = 'Extreme put buying - contrarian bullish signal';
  } else if (currentPCR > 1.0) {
    pcrSignal = 'bearish';
    pcrDescription = 'Elevated put activity suggests bearish sentiment';
  } else if (currentPCR < 0.5) {
    // Very low PCR - could be bullish or complacent
    pcrSignal = 'bearish'; // Contrarian - too complacent
    pcrDescription = 'Extreme call buying - contrarian bearish (complacency)';
  } else if (currentPCR < 0.7) {
    pcrSignal = 'bullish';
    pcrDescription = 'Strong call buying suggests bullish sentiment';
  } else {
    pcrSignal = 'neutral';
    pcrDescription = 'Balanced options activity';
  }
  
  // Volume Analysis
  const callVolume = latest.callVolume;
  const putVolume = latest.putVolume;
  const totalVolume = callVolume + putVolume;
  const bullishPercent = totalVolume > 0 ? (callVolume / totalVolume) * 100 : 50;
  
  const avgVolume = recent7Days.reduce((sum, d) => sum + d.callVolume + d.putVolume, 0) / recent7Days.length;
  const volumeSpike = totalVolume > avgVolume * 1.5;
  
  // Open Interest Analysis
  const callOI = latest.callOpenInterest;
  const putOI = latest.putOpenInterest;
  const oiRatio = putOI > 0 ? callOI / putOI : 1;
  
  // Determine OI trend
  let oiTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (recent7Days.length >= 2) {
    const firstTotalOI = recent7Days[0].callOpenInterest + recent7Days[0].putOpenInterest;
    const lastTotalOI = callOI + putOI;
    const oiChange = (lastTotalOI - firstTotalOI) / firstTotalOI;
    
    if (oiChange > 0.1) oiTrend = 'increasing';
    else if (oiChange < -0.1) oiTrend = 'decreasing';
  }
  
  // Calculate Smart Money Score
  const smartMoneyScore = calculateSmartMoneyScore(
    currentPCR,
    avg7DayPCR,
    volumeSpike,
    bullishPercent,
    oiTrend
  );
  
  // Detect unusual activity
  const unusualActivity = detectUnusualActivity(data);
  
  // Determine overall sentiment
  const overallSentiment = determineOverallSentiment(
    smartMoneyScore.score,
    pcrSignal,
    bullishPercent
  );
  
  // Generate summary
  const summary = generateSummary(
    symbol,
    overallSentiment,
    pcrSignal,
    smartMoneyScore,
    volumeSpike
  );
  
  return {
    symbol: symbol.toUpperCase(),
    putCallRatio: {
      current: Number(currentPCR.toFixed(2)),
      average7Day: Number(avg7DayPCR.toFixed(2)),
      signal: pcrSignal,
      description: pcrDescription,
    },
    volumeAnalysis: {
      callVolume,
      putVolume,
      totalVolume,
      bullishPercent: Number(bullishPercent.toFixed(1)),
      volumeSpike,
      avgDailyVolume: Math.round(avgVolume),
    },
    openInterest: {
      callOI,
      putOI,
      oiRatio: Number(oiRatio.toFixed(2)),
      trend: oiTrend,
    },
    smartMoneySignal: smartMoneyScore,
    unusualActivity,
    overallSentiment,
    summary,
    lastUpdated: new Date(),
  };
}

function calculateSmartMoneyScore(
  currentPCR: number,
  avgPCR: number,
  volumeSpike: boolean,
  bullishPercent: number,
  oiTrend: 'increasing' | 'decreasing' | 'stable'
): { score: number; direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; signals: string[] } {
  let score = 50; // Start neutral
  const signals: string[] = [];
  
  // PCR deviation from average (contrarian)
  const pcrDeviation = currentPCR - avgPCR;
  if (pcrDeviation > 0.3) {
    score += 15; // Contrarian bullish
    signals.push('Elevated put buying (contrarian bullish)');
  } else if (pcrDeviation < -0.3) {
    score -= 15; // Contrarian bearish
    signals.push('Elevated call buying (contrarian bearish)');
  }
  
  // Volume spike with direction
  if (volumeSpike) {
    if (bullishPercent > 60) {
      score += 10;
      signals.push('High-volume call buying');
    } else if (bullishPercent < 40) {
      score -= 10;
      signals.push('High-volume put buying');
    }
  }
  
  // Call/Put ratio
  if (bullishPercent > 65) {
    score += 10;
    signals.push('Strong call dominance');
  } else if (bullishPercent < 35) {
    score -= 10;
    signals.push('Strong put dominance');
  }
  
  // Open interest trend
  if (oiTrend === 'increasing') {
    score += 5;
    signals.push('Increasing open interest (new positions)');
  } else if (oiTrend === 'decreasing') {
    signals.push('Decreasing open interest (closing positions)');
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Determine direction and confidence
  const direction = score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
  const confidence = Math.abs(score - 50) * 2; // 0-100 based on how far from neutral
  
  return { score, direction, confidence, signals };
}

function detectUnusualActivity(
  data: Array<{
    date: string;
    callVolume: number;
    putVolume: number;
    callOpenInterest: number;
    putOpenInterest: number;
    pcRatio: number;
  }>
): OptionsFlowAnalysis['unusualActivity'] {
  const unusual: OptionsFlowAnalysis['unusualActivity'] = [];
  
  if (data.length < 2) return unusual;
  
  const latest = data[data.length - 1];
  const avgCallVol = data.slice(0, -1).reduce((sum, d) => sum + d.callVolume, 0) / (data.length - 1);
  const avgPutVol = data.slice(0, -1).reduce((sum, d) => sum + d.putVolume, 0) / (data.length - 1);
  
  // Detect unusual call volume
  if (latest.callVolume > avgCallVol * 2) {
    unusual.push({
      type: 'call',
      strike: 0, // Would need chain data for specifics
      expiration: 'Near-term',
      volume: latest.callVolume,
      openInterest: latest.callOpenInterest,
      volumeOIRatio: latest.callOpenInterest > 0 ? latest.callVolume / latest.callOpenInterest : 0,
      sentiment: 'bullish',
      description: `Call volume ${(latest.callVolume / avgCallVol).toFixed(1)}x average`,
    });
  }
  
  // Detect unusual put volume
  if (latest.putVolume > avgPutVol * 2) {
    unusual.push({
      type: 'put',
      strike: 0,
      expiration: 'Near-term',
      volume: latest.putVolume,
      openInterest: latest.putOpenInterest,
      volumeOIRatio: latest.putOpenInterest > 0 ? latest.putVolume / latest.putOpenInterest : 0,
      sentiment: 'bearish',
      description: `Put volume ${(latest.putVolume / avgPutVol).toFixed(1)}x average`,
    });
  }
  
  return unusual;
}

function determineOverallSentiment(
  smartScore: number,
  pcrSignal: 'bullish' | 'bearish' | 'neutral',
  bullishPercent: number
): OptionsFlowAnalysis['overallSentiment'] {
  // Weight different signals
  let sentimentScore = smartScore;
  
  if (pcrSignal === 'bullish') sentimentScore += 10;
  else if (pcrSignal === 'bearish') sentimentScore -= 10;
  
  if (bullishPercent > 60) sentimentScore += 5;
  else if (bullishPercent < 40) sentimentScore -= 5;
  
  if (sentimentScore >= 75) return 'strongly_bullish';
  if (sentimentScore >= 60) return 'bullish';
  if (sentimentScore <= 25) return 'strongly_bearish';
  if (sentimentScore <= 40) return 'bearish';
  return 'neutral';
}

function generateSummary(
  symbol: string,
  sentiment: OptionsFlowAnalysis['overallSentiment'],
  pcrSignal: 'bullish' | 'bearish' | 'neutral',
  smartMoney: { signals: string[] },
  volumeSpike: boolean
): string {
  const sentimentText = {
    'strongly_bullish': 'strongly bullish',
    'bullish': 'bullish',
    'neutral': 'neutral',
    'bearish': 'bearish',
    'strongly_bearish': 'strongly bearish',
  };
  
  let summary = `Options flow for ${symbol} is ${sentimentText[sentiment]}. `;
  
  if (smartMoney.signals.length > 0) {
    summary += `Key signals: ${smartMoney.signals.slice(0, 2).join(', ')}. `;
  }
  
  if (volumeSpike) {
    summary += 'Elevated options volume detected. ';
  }
  
  return summary.trim();
}

function createDefaultAnalysis(symbol: string): OptionsFlowAnalysis {
  return {
    symbol: symbol.toUpperCase(),
    putCallRatio: {
      current: 0,
      average7Day: 0,
      signal: 'neutral',
      description: 'Options data unavailable',
    },
    volumeAnalysis: {
      callVolume: 0,
      putVolume: 0,
      totalVolume: 0,
      bullishPercent: 50,
      volumeSpike: false,
      avgDailyVolume: 0,
    },
    openInterest: {
      callOI: 0,
      putOI: 0,
      oiRatio: 1,
      trend: 'stable',
    },
    smartMoneySignal: {
      score: 50,
      direction: 'neutral',
      confidence: 0,
      signals: ['Options data unavailable for this symbol'],
    },
    unusualActivity: [],
    overallSentiment: 'neutral',
    summary: `Options flow data unavailable for ${symbol}. This may be due to low options trading volume or data limitations.`,
    lastUpdated: new Date(),
  };
}
