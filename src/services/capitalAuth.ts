// Capital.com Authentication Service
export const BASE_URL = "https://api-capital.backend-capital.com";

export interface SessionTokens {
  cst: string;
  securityToken: string;
}

export interface AuthConfig {
  apiKey: string;
  identifier: string;
  password: string;
}

export class CapitalAuthService {
  private tokens: SessionTokens | null = null;
  private config: AuthConfig | null = null;

  setConfig(config: AuthConfig) {
    this.config = config;
    this.tokens = null; // Clear existing tokens when config changes
  }

  async createSession(): Promise<SessionTokens> {
    if (!this.config) {
      throw new Error('Authentication config not set');
    }

    try {
      const response = await fetch(`${BASE_URL}/api/v1/session`, {
        method: 'POST',
        headers: {
          'X-CAP-API-KEY': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: this.config.identifier,
          password: this.config.password,
          encryptedPassword: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Authentication failed: ${response.status} - ${errorText}`);
      }

      const cst = response.headers.get('CST');
      const securityToken = response.headers.get('X-SECURITY-TOKEN');

      if (!cst || !securityToken) {
        throw new Error('Authentication tokens not received');
      }

      this.tokens = { cst, securityToken };
      console.log('Session created successfully');
      return this.tokens;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  async getValidTokens(): Promise<SessionTokens> {
    // If we don't have tokens, create a new session
    if (!this.tokens) {
      return await this.createSession();
    }
    return this.tokens;
  }

  clearTokens() {
    this.tokens = null;
  }

  hasConfig(): boolean {
    return this.config !== null;
  }
}

// Singleton instance
let authService: CapitalAuthService | null = null;

export function getAuthService(): CapitalAuthService {
  if (!authService) {
    authService = new CapitalAuthService();
  }
  return authService;
}
