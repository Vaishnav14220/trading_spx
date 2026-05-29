import { getAuthService, SessionTokens } from './capitalAuth';
import { DEFAULT_SPOT_EPIC, getDefaultFuturesEpic } from '../utils/marketDefaults';

const WS_URL = "wss://api-streaming-capital.backend-capital.com/connect";
const SPREAD_EMIT_THROTTLE_MS = 1000;
const DEBUG_WS = import.meta.env.DEV && import.meta.env.VITE_DEBUG_MARKET_DATA === 'true';

export interface FuturesRealtimeData {
  spotPrice: number;
  futuresPrice: number;
  spread: number;
  spreadPercent: number;
  spotEpic: string;
  futuresEpic: string;
  lastUpdate: Date;
}

type DataCallback = (data: FuturesRealtimeData) => void;
type StatusCallback = (connected: boolean) => void;

interface WebSocketMessage {
  destination?: string;
  payload?: {
    bid?: number;
    ask?: number;
    offer?: number;
    mid?: number;
    epic?: string;
  };
}

class FuturesWebSocketService {
  private ws: WebSocket | null = null;
  private dataCallback: DataCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private tokens: SessionTokens | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private shouldReconnect = false;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingData: FuturesRealtimeData | null = null;
  private lastEmitAt = 0;
  
  private spotEpic = DEFAULT_SPOT_EPIC;
  private futuresEpic = getDefaultFuturesEpic();
  
  private latestSpotPrice = 0;
  private latestFuturesPrice = 0;

  async connect(
    onData: DataCallback,
    onStatus: StatusCallback,
    spotEpic?: string,
    futuresEpic?: string
  ) {
    if (spotEpic) this.spotEpic = spotEpic;
    if (futuresEpic) this.futuresEpic = futuresEpic;
    this.shouldReconnect = true;
    
    this.dataCallback = onData;
    this.statusCallback = onStatus;

    try {
      // Get authentication tokens
      const authService = getAuthService();
      this.tokens = await authService.getValidTokens();

      if (DEBUG_WS) console.log('[Futures WS] Connecting to', WS_URL);
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        if (DEBUG_WS) console.log('[Futures WS] Connected successfully');
        this.reconnectAttempts = 0;
        this.statusCallback?.(true);
        this.subscribeToMarkets();
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Futures WS] Error:', error);
      };

      this.ws.onclose = () => {
        if (DEBUG_WS) console.log('[Futures WS] Disconnected');
        this.statusCallback?.(false);
        this.stopPingInterval();
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      console.error('[Futures WS] Connection failed:', error);
      this.statusCallback?.(false);
    }
  }

  private subscribeToMarkets() {
    if (!this.ws || !this.tokens) return;

    if (DEBUG_WS) console.log(`[Futures WS] Subscribing to ${this.spotEpic} and ${this.futuresEpic}`);

    // Subscribe to spot market
    const spotSubscription = JSON.stringify({
      destination: `market.subscribe`,
      correlationId: '1',
      cst: this.tokens.cst,
      securityToken: this.tokens.securityToken,
      payload: {
        epics: [this.spotEpic]
      }
    });

    // Subscribe to futures market
    const futuresSubscription = JSON.stringify({
      destination: `market.subscribe`,
      correlationId: '2',
      cst: this.tokens.cst,
      securityToken: this.tokens.securityToken,
      payload: {
        epics: [this.futuresEpic]
      }
    });

    this.ws.send(spotSubscription);
    this.ws.send(futuresSubscription);
    
    if (DEBUG_WS) console.log('[Futures WS] Subscription messages sent');
  }

  private handleMessage(data: string) {
    try {
      const message: WebSocketMessage = JSON.parse(data);
      
      // Log all messages for debugging
      if (DEBUG_WS && message.destination?.includes('market')) {
        console.log('[Futures WS] Market message:', message);
      }
      
      // Handle market data updates
      if (message.destination?.includes('market') && message.payload) {
        const payload = message.payload;
        const epic = payload.epic;
        
        // Calculate mid price
        let midPrice = 0;
        if (payload.mid !== undefined) {
          midPrice = payload.mid;
        } else if (payload.bid !== undefined && (payload.ask !== undefined || payload.offer !== undefined)) {
          const ask = payload.ask || payload.offer || payload.bid;
          midPrice = (payload.bid + ask) / 2;
        }
        
        if (midPrice > 0) {
          // Check if this is for spot or futures
          const isSpot = epic === this.spotEpic || message.destination.includes(this.spotEpic);
          const isFutures = epic === this.futuresEpic || message.destination.includes(this.futuresEpic);
          
          if (isSpot) {
            this.latestSpotPrice = midPrice;
            if (DEBUG_WS) console.log(`[Futures WS] Spot ${this.spotEpic}: $${midPrice.toFixed(2)}`);
          } else if (isFutures) {
            this.latestFuturesPrice = midPrice;
            if (DEBUG_WS) console.log(`[Futures WS] Futures ${this.futuresEpic}: $${midPrice.toFixed(2)}`);
          }

          // If we have both prices, emit the spread data
          if (this.latestSpotPrice > 0 && this.latestFuturesPrice > 0) {
            this.emitSpreadData();
          }
        }
      }
    } catch (error) {
      console.error('[Futures WS] Failed to parse message:', error, data);
    }
  }

  private emitSpreadData() {
    const spread = this.latestFuturesPrice - this.latestSpotPrice;
    const spreadPercent = (spread / this.latestSpotPrice) * 100;

    const data: FuturesRealtimeData = {
      spotPrice: this.latestSpotPrice,
      futuresPrice: this.latestFuturesPrice,
      spread,
      spreadPercent,
      spotEpic: this.spotEpic,
      futuresEpic: this.futuresEpic,
      lastUpdate: new Date(),
    };

    if (DEBUG_WS) console.log(`[Futures WS] Spread Update: ${spread.toFixed(2)} pts (${spreadPercent.toFixed(2)}%)`);
    this.scheduleDataEmit(data);
  }

  private scheduleDataEmit(data: FuturesRealtimeData) {
    this.pendingData = data;
    if (!this.dataCallback) return;

    const emit = () => {
      this.emitTimer = null;
      this.lastEmitAt = Date.now();
      const nextData = this.pendingData;
      this.pendingData = null;

      if (nextData) {
        this.dataCallback?.(nextData);
      }
    };
    const waitMs = SPREAD_EMIT_THROTTLE_MS - (Date.now() - this.lastEmitAt);

    if (waitMs <= 0) {
      if (this.emitTimer) {
        clearTimeout(this.emitTimer);
        this.emitTimer = null;
      }
      emit();
      return;
    }

    if (!this.emitTimer) {
      this.emitTimer = setTimeout(emit, waitMs);
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN && this.tokens) {
        this.ws.send(JSON.stringify({
          destination: 'ping',
          correlationId: Date.now().toString(),
          cst: this.tokens.cst,
          securityToken: this.tokens.securityToken,
        }));
        if (DEBUG_WS) console.log('[Futures WS] Ping sent');
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (DEBUG_WS) console.log('[Futures WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    if (DEBUG_WS) console.log(`[Futures WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.dataCallback && this.statusCallback) {
        this.connect(this.dataCallback, this.statusCallback, this.spotEpic, this.futuresEpic);
      }
    }, delay);
  }

  disconnect() {
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    this.pendingData = null;
    
    this.stopPingInterval();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.dataCallback = null;
    this.statusCallback = null;
  }
}

let futuresWebSocketInstance: FuturesWebSocketService | null = null;

export function getFuturesWebSocketService(): FuturesWebSocketService {
  if (!futuresWebSocketInstance) {
    futuresWebSocketInstance = new FuturesWebSocketService();
  }
  return futuresWebSocketInstance;
}
