import { ChartData } from '../types/chart';
import { getAuthService, SessionTokens } from './capitalAuth';

const WS_URL = "wss://api-streaming-capital.backend-capital.com/connect";
const EPIC = "US500";

interface WebSocketMessage {
  destination?: string;
  payload?: {
    bid?: number;
    ask?: number;
    timestamp?: number;
  };
}

export class SPXWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private priceHistory: ChartData[] = [];
  private currentCandle: Partial<ChartData> = {};
  private lastCandleTime: number = 0;
  private onPriceUpdate: ((data: ChartData[]) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private isConnected: boolean = false;
  private tokens: SessionTokens | null = null;

  constructor() {
    this.initializeHistory();
  }

  private initializeHistory() {
    // Initialize with some minimal history
    const now = Math.floor(Date.now() / 1000);
    this.lastCandleTime = Math.floor(now / 60) * 60; // Round to nearest minute
  }

  private getCandleTime(timestamp: number): number {
    return Math.floor(timestamp / 60) * 60;
  }

  async connect(
    onPriceUpdate: (data: ChartData[]) => void,
    onError: (error: string) => void,
    initialHistoricalData?: ChartData[]
  ) {
    this.onPriceUpdate = onPriceUpdate;
    this.onError = onError;

    // Set initial historical data if provided
    if (initialHistoricalData && initialHistoricalData.length > 0) {
      this.priceHistory = [...initialHistoricalData];
      // Set lastCandleTime to the last historical candle time
      const lastCandle = initialHistoricalData[initialHistoricalData.length - 1];
      this.lastCandleTime = this.getCandleTime(lastCandle.time);
      console.log(`[WebSocket] Initialized with ${initialHistoricalData.length} historical candles`);
      console.log(`[WebSocket] Last candle time: ${new Date(lastCandle.time * 1000).toLocaleString()}`);
      
      // Emit initial historical data immediately
      if (this.onPriceUpdate) {
        this.onPriceUpdate(this.priceHistory);
      }
    }

    try {
      // Get valid authentication tokens
      const authService = getAuthService();
      this.tokens = await authService.getValidTokens();
      this.createConnection();
    } catch (error) {
      console.error('Failed to authenticate:', error);
      if (this.onError) {
        this.onError('Authentication failed. Please check your credentials.');
      }
    }
  }

  private createConnection() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.subscribe();
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
        if (this.onError) {
          this.onError('WebSocket connection error');
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.isConnected = false;
        this.stopPingInterval();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      if (this.onError) {
        this.onError('Failed to connect to real-time data');
      }
    }
  }

  private subscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.tokens) return;

    const subscribeMsg = {
      destination: "marketData.subscribe",
      correlationId: "1",
      cst: this.tokens.cst,
      securityToken: this.tokens.securityToken,
      payload: {
        epics: [EPIC]
      }
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    console.log('Subscribed to real-time prices for', EPIC);
  }

  private handleMessage(data: WebSocketMessage) {
    // Log first few messages for debugging
    if (this.priceHistory.length < 5) {
      console.log('[WebSocket] Received message:', data);
    }
    
    if (data.destination === "quote" && data.payload) {
      const { bid, timestamp } = data.payload;
      
      if (bid && timestamp) {
        // Use bid price as close, you could also use mid price: (bid + ask) / 2
        const price = bid;
        const ts = Math.floor(timestamp / 1000); // Convert to seconds
        const candleTime = this.getCandleTime(ts);

        // Check if we need to start a new candle
        if (candleTime !== this.lastCandleTime) {
          // Complete the previous candle
          if (this.currentCandle.time && this.currentCandle.open) {
            const completedCandle: ChartData = {
              time: this.currentCandle.time,
              open: this.currentCandle.open,
              high: this.currentCandle.high || this.currentCandle.open,
              low: this.currentCandle.low || this.currentCandle.open,
              close: this.currentCandle.close || this.currentCandle.open,
            };
            this.priceHistory.push(completedCandle);
            console.log(`[WebSocket] ✅ Completed candle #${this.priceHistory.length} at ${new Date(this.currentCandle.time * 1000).toLocaleTimeString()}, price: $${completedCandle.close.toFixed(2)}`);
          }

          // Start new candle
          this.currentCandle = {
            time: candleTime,
            open: price,
            high: price,
            low: price,
            close: price,
          };
          this.lastCandleTime = candleTime;
        } else {
          // Update current candle
          if (!this.currentCandle.open) {
            this.currentCandle = {
              time: candleTime,
              open: price,
              high: price,
              low: price,
              close: price,
            };
          } else {
            this.currentCandle.high = Math.max(this.currentCandle.high || price, price);
            this.currentCandle.low = Math.min(this.currentCandle.low || price, price);
            this.currentCandle.close = price;
          }
        }

        // Emit update with history + current candle
        const currentData = [...this.priceHistory];
        if (this.currentCandle.time && this.currentCandle.open) {
          currentData.push({
            time: this.currentCandle.time,
            open: this.currentCandle.open,
            high: this.currentCandle.high || this.currentCandle.open,
            low: this.currentCandle.low || this.currentCandle.open,
            close: this.currentCandle.close || this.currentCandle.open,
          });
        }

        if (this.onPriceUpdate && currentData.length > 0) {
          this.onPriceUpdate(currentData);
        }
      }
    }
  }

  private startPingInterval() {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.tokens) {
        const pingMsg = {
          destination: "ping",
          correlationId: "ping1",
          cst: this.tokens.cst,
          securityToken: this.tokens.securityToken
        };
        this.ws.send(JSON.stringify(pingMsg));
        console.log('Ping sent to keep connection alive');
      }
    }, 300000); // 5 minutes
  }

  private stopPingInterval() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.reconnectTimer = null;
      this.createConnection();
    }, 5000); // Retry after 5 seconds
  }

  disconnect() {
    this.stopPingInterval();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnectedToWebSocket(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let wsService: SPXWebSocketService | null = null;

export function getWebSocketService(): SPXWebSocketService {
  if (!wsService) {
    wsService = new SPXWebSocketService();
  }
  return wsService;
}
