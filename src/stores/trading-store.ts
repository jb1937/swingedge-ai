// src/stores/trading-store.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ScreenerResult } from '@/types/analysis';

// Types for our store
export interface AnalysisData {
  symbol: string;
  latestPrice: number;
  priceChange: number;
  priceChangePercent: number;
  technicalScore: number;
  signalDirection: 'long' | 'short' | 'neutral';
  supportLevels: number[];
  resistanceLevels: number[];
  atr14: number;
  rsi14: number;
  timestamp: Date;
}

export interface TradeIdea {
  id: string;
  symbol: string;
  price: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  side: 'long' | 'short';
  technicalScore: number;
  signalStrength: number;
  notes?: string;
  source: 'analysis' | 'screener' | 'manual';
  createdAt: Date;
}

interface TradingState {
  // Analysis state
  currentAnalysis: AnalysisData | null;
  analysisHistory: AnalysisData[];
  
  // Screener state
  screenerResults: ScreenerResult[];
  lastScreenerScanType: string;
  lastScreenerScanTime: Date | null;
  
  // Trade Ideas (pinned stocks)
  tradeIdeas: TradeIdea[];
  
  // Panel visibility
  isTradeIdeasPanelOpen: boolean;
  
  // Actions
  setCurrentAnalysis: (analysis: AnalysisData | null) => void;
  addToAnalysisHistory: (analysis: AnalysisData) => void;
  clearAnalysisHistory: () => void;
  
  setScreenerResults: (results: ScreenerResult[], scanType: string) => void;
  clearScreenerResults: () => void;
  
  addTradeIdea: (idea: Omit<TradeIdea, 'id' | 'createdAt'>) => void;
  updateTradeIdea: (id: string, updates: Partial<TradeIdea>) => void;
  removeTradeIdea: (id: string) => void;
  clearTradeIdeas: () => void;
  
  toggleTradeIdeasPanel: () => void;
  setTradeIdeasPanelOpen: (open: boolean) => void;
}

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 15);

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentAnalysis: null,
      analysisHistory: [],
      screenerResults: [],
      lastScreenerScanType: '',
      lastScreenerScanTime: null,
      tradeIdeas: [],
      isTradeIdeasPanelOpen: false,
      
      // Analysis actions
      setCurrentAnalysis: (analysis) => {
        set({ currentAnalysis: analysis });
        if (analysis) {
          const history = get().analysisHistory;
          // Keep only last 10 analyses in history
          const newHistory = [analysis, ...history.filter(a => a.symbol !== analysis.symbol)].slice(0, 10);
          set({ analysisHistory: newHistory });
        }
      },
      
      addToAnalysisHistory: (analysis) => {
        const history = get().analysisHistory;
        const newHistory = [analysis, ...history.filter(a => a.symbol !== analysis.symbol)].slice(0, 10);
        set({ analysisHistory: newHistory });
      },
      
      clearAnalysisHistory: () => set({ analysisHistory: [], currentAnalysis: null }),
      
      // Screener actions
      setScreenerResults: (results, scanType) => set({
        screenerResults: results,
        lastScreenerScanType: scanType,
        lastScreenerScanTime: new Date(),
      }),
      
      clearScreenerResults: () => set({
        screenerResults: [],
        lastScreenerScanType: '',
        lastScreenerScanTime: null,
      }),
      
      // Trade Ideas actions
      addTradeIdea: (idea) => {
        const newIdea: TradeIdea = {
          ...idea,
          id: generateId(),
          createdAt: new Date(),
        };
        set((state) => ({
          tradeIdeas: [newIdea, ...state.tradeIdeas],
        }));
      },
      
      updateTradeIdea: (id, updates) => {
        set((state) => ({
          tradeIdeas: state.tradeIdeas.map((idea) =>
            idea.id === id ? { ...idea, ...updates } : idea
          ),
        }));
      },
      
      removeTradeIdea: (id) => {
        set((state) => ({
          tradeIdeas: state.tradeIdeas.filter((idea) => idea.id !== id),
        }));
      },
      
      clearTradeIdeas: () => set({ tradeIdeas: [] }),
      
      // Panel visibility
      toggleTradeIdeasPanel: () => set((state) => ({
        isTradeIdeasPanelOpen: !state.isTradeIdeasPanelOpen,
      })),
      
      setTradeIdeasPanelOpen: (open) => set({ isTradeIdeasPanelOpen: open }),
    }),
    {
      name: 'swingedge-trading-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields
      partialize: (state) => ({
        analysisHistory: state.analysisHistory,
        screenerResults: state.screenerResults,
        lastScreenerScanType: state.lastScreenerScanType,
        lastScreenerScanTime: state.lastScreenerScanTime,
        tradeIdeas: state.tradeIdeas,
        currentAnalysis: state.currentAnalysis,
      }),
    }
  )
);

// Selector hooks for better performance
export const useCurrentAnalysis = () => useTradingStore((state) => state.currentAnalysis);
export const useAnalysisHistory = () => useTradingStore((state) => state.analysisHistory);
export const useScreenerResults = () => useTradingStore((state) => state.screenerResults);
export const useTradeIdeas = () => useTradingStore((state) => state.tradeIdeas);
export const useTradeIdeasPanelOpen = () => useTradingStore((state) => state.isTradeIdeasPanelOpen);
