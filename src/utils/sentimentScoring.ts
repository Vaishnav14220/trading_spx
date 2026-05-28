import { OptionTrade } from '../types/options';
import {
  classifyTrade,
  getBreakevenLevel,
  getTradePremium,
  HIGH_DELTA_THRESHOLD,
  LevelDirection,
  parseTradeTimestampMs,
} from './tradeClassification';

export type SignalAction = 'BUY' | 'SELL' | 'WATCH';
export type SignalBias = 'bullish' | 'bearish' | 'balanced';

export interface ScoredBreakevenSentiment {
  level: number;
  totalPremium: number;
  bullishPremium: number;
  bearishPremium: number;
  netPremium: number;
  direction: LevelDirection;
  trades: OptionTrade[];
  distance: number;
  score: number;
  confidence: number;
  latestTimestamp: string;
  avgAbsDelta: number;
  avgSpotGap: number | null;
  premiumScore: number;
  distanceScore: number;
  recencyScore: number;
  deltaScore: number;
  gapScore: number;
}

export interface SentimentSignal {
  action: SignalAction;
  bias: SignalBias;
  confidence: number;
  entry: number;
  target?: number;
  nextTarget?: number;
  points: number;
  premium: number;
  score: number;
  bullishScore: number;
  bearishScore: number;
  reasons: string[];
}

interface LevelAccumulator {
  level: number;
  trades: OptionTrade[];
  totalPremium: number;
  bullishPremium: number;
  bearishPremium: number;
  weightedAbsDelta: number;
  weightedSpotGap: number;
  spotGapPremium: number;
  latestTimestamp: string;
  latestTimeMs: number | null;
}

interface BuildSentimentParams {
  trades: OptionTrade[];
  currentPrice: number;
  roundFigures: boolean;
  highDeltaThreshold?: number;
  nowMs?: number;
}

const SCORE_WEIGHTS = {
  premium: 0.34,
  distance: 0.22,
  recency: 0.15,
  delta: 0.13,
  gap: 0.16,
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function getRecencyScore(latestTimeMs: number | null, nowMs: number): number {
  if (latestTimeMs === null) {
    return 0.5;
  }

  const ageHours = Math.max(0, (nowMs - latestTimeMs) / (60 * 60 * 1000));
  return Math.max(0.25, Math.exp(-ageHours / 4));
}

function getDeltaScore(avgAbsDelta: number, highDeltaThreshold: number): number {
  if (!Number.isFinite(avgAbsDelta)) {
    return 0.5;
  }

  return 0.6 + clamp((avgAbsDelta - highDeltaThreshold) / (1 - highDeltaThreshold)) * 0.4;
}

function getGapScore(direction: LevelDirection, avgSpotGap: number | null): number {
  if (avgSpotGap === null) {
    return 0.5;
  }

  const signedGap = direction === 'above' ? avgSpotGap : -avgSpotGap;
  return clamp(0.5 + signedGap / 40);
}

function getDistanceScore(distance: number, currentPrice: number): number {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return 0.5;
  }

  return 1 / (1 + Math.abs(distance) / 30);
}

function buildReasons(signal: SentimentSignal, target: ScoredBreakevenSentiment | undefined): string[] {
  if (!target) {
    return ['No dominant level passed the scoring threshold'];
  }

  const reasons = [
    `${Math.round(target.confidence * 100)}% directional premium at the leading level`,
    `${Math.round(target.distanceScore * 100)}% distance score from spot`,
    `${Math.round(target.recencyScore * 100)}% recency score`,
  ];

  if (target.avgSpotGap !== null) {
    reasons.push(`BE was ${Math.abs(target.avgSpotGap).toFixed(1)} pts ${target.avgSpotGap >= 0 ? 'above' : 'below'} spot at trade`);
  }

  reasons.push(`${Math.round(signal.confidence * 100)}% aggregate ${signal.bias} confidence`);
  return reasons;
}

export function buildScoredSentiment({
  trades,
  currentPrice,
  roundFigures,
  highDeltaThreshold = HIGH_DELTA_THRESHOLD,
  nowMs = Date.now(),
}: BuildSentimentParams): { sentiments: ScoredBreakevenSentiment[]; signal: SentimentSignal | null } {
  const levelMap = new Map<number, LevelAccumulator>();
  const highDeltaTrades = trades.filter(trade => Math.abs(Number(trade.delta)) > highDeltaThreshold);

  highDeltaTrades.forEach(trade => {
    const level = getBreakevenLevel(trade, roundFigures);
    const classified = classifyTrade(trade);
    const premium = getTradePremium(trade);
    const tradeTimeMs = parseTradeTimestampMs(trade.timestamp);
    const spotGap = Number.isFinite(trade.underlyingPrice) && trade.underlyingPrice > 0
      ? level - trade.underlyingPrice
      : null;

    const existing = levelMap.get(level) ?? {
      level,
      trades: [],
      totalPremium: 0,
      bullishPremium: 0,
      bearishPremium: 0,
      weightedAbsDelta: 0,
      weightedSpotGap: 0,
      spotGapPremium: 0,
      latestTimestamp: trade.timestamp,
      latestTimeMs: tradeTimeMs,
    };

    existing.trades.push(trade);
    existing.totalPremium += premium;
    existing.weightedAbsDelta += trade.absDelta * premium;

    if (spotGap !== null) {
      existing.weightedSpotGap += spotGap * premium;
      existing.spotGapPremium += premium;
    }

    if (classified.bias === 'bullish') {
      existing.bullishPremium += premium;
    } else {
      existing.bearishPremium += premium;
    }

    if (tradeTimeMs !== null && (existing.latestTimeMs === null || tradeTimeMs > existing.latestTimeMs)) {
      existing.latestTimestamp = trade.timestamp;
      existing.latestTimeMs = tradeTimeMs;
    }

    levelMap.set(level, existing);
  });

  const accumulators = Array.from(levelMap.values());

  if (accumulators.length === 0) {
    return { sentiments: [], signal: null };
  }

  const maxPremium = Math.max(...accumulators.map(level => level.totalPremium), 1);
  const maxLogPremium = Math.log10(maxPremium + 1);

  const sentiments = accumulators.map<ScoredBreakevenSentiment>((level) => {
    const netPremium = level.bullishPremium - level.bearishPremium;
    const direction: LevelDirection = netPremium >= 0 ? 'above' : 'below';
    const distance = level.level - currentPrice;
    const confidence = level.totalPremium > 0 ? Math.abs(netPremium) / level.totalPremium : 0;
    const avgAbsDelta = level.totalPremium > 0 ? level.weightedAbsDelta / level.totalPremium : 0;
    const avgSpotGap = level.spotGapPremium > 0 ? level.weightedSpotGap / level.spotGapPremium : null;
    const premiumScore = maxLogPremium > 0 ? Math.log10(level.totalPremium + 1) / maxLogPremium : 0;
    const distanceScore = getDistanceScore(distance, currentPrice);
    const recencyScore = getRecencyScore(level.latestTimeMs, nowMs);
    const deltaScore = getDeltaScore(avgAbsDelta, highDeltaThreshold);
    const gapScore = getGapScore(direction, avgSpotGap);
    const blendedScore =
      premiumScore * SCORE_WEIGHTS.premium +
      distanceScore * SCORE_WEIGHTS.distance +
      recencyScore * SCORE_WEIGHTS.recency +
      deltaScore * SCORE_WEIGHTS.delta +
      gapScore * SCORE_WEIGHTS.gap;
    const score = blendedScore * (0.35 + confidence * 0.65);

    return {
      level: level.level,
      totalPremium: level.totalPremium,
      bullishPremium: level.bullishPremium,
      bearishPremium: level.bearishPremium,
      netPremium,
      direction,
      trades: level.trades,
      distance,
      score,
      confidence,
      latestTimestamp: level.latestTimestamp,
      avgAbsDelta,
      avgSpotGap,
      premiumScore,
      distanceScore,
      recencyScore,
      deltaScore,
      gapScore,
    };
  });

  const bullishLevels = sentiments
    .filter(level => level.direction === 'above')
    .sort((a, b) => b.score - a.score);
  const bearishLevels = sentiments
    .filter(level => level.direction === 'below')
    .sort((a, b) => b.score - a.score);
  const bullishScore = bullishLevels.reduce((sum, level) => sum + level.score, 0);
  const bearishScore = bearishLevels.reduce((sum, level) => sum + level.score, 0);
  const scoreTotal = bullishScore + bearishScore;
  const aggregateConfidence = scoreTotal > 0 ? Math.abs(bullishScore - bearishScore) / scoreTotal : 0;
  const bias: SignalBias = aggregateConfidence < 0.12
    ? 'balanced'
    : bullishScore > bearishScore
    ? 'bullish'
    : 'bearish';
  const action: SignalAction = bias === 'balanced' ? 'WATCH' : bias === 'bullish' ? 'BUY' : 'SELL';
  const candidates = action === 'BUY' ? bullishLevels : action === 'SELL' ? bearishLevels : [...sentiments].sort((a, b) => b.score - a.score);
  const target = candidates[0];
  const nextTarget = candidates[1];

  const signal: SentimentSignal = {
    action,
    bias,
    confidence: aggregateConfidence,
    entry: currentPrice,
    target: target?.level,
    nextTarget: nextTarget?.level,
    points: target ? Math.abs(target.level - currentPrice) : 0,
    premium: target?.totalPremium ?? 0,
    score: target?.score ?? 0,
    bullishScore,
    bearishScore,
    reasons: [],
  };
  signal.reasons = buildReasons(signal, target);

  return { sentiments, signal };
}
