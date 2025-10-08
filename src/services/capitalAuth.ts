// Capital.com Authentication Service
export const BASE_URL = "https://api-capital.backend-capital.com";

// Check if we're running on Netlify
const isNetlify = window.location.hostname.includes('netlify.app') || 
                  window.location.hostname.includes('netlify.live');

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
    try {
      // Use Netlify Function if deployed, otherwise use direct API
      if (isNetlify) {
        console.log('[Auth] Using Netlify Function for authentication');
        console.log('[Auth] Fetching from:', '/.netlify/functions/capital-auth');
        
        const response = await fetch('/.netlify/functions/capital-auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log('[Auth] Response status:', response.status);

        if (!response.ok) {
          const error = await response.json();
          console.error('[Auth] Authentication failed:', error);
          throw new Error(
            `Authentication failed (${response.status}): ${error.details || error.error || 'Unknown error'}\n` +
            `Debug info: ${JSON.stringify(error.debug || {})}`
          );
        }

        const tokens = await response.json();
        console.log('[Auth] Tokens received:', {
          hasCst: !!tokens.cst,
          hasSecurityToken: !!tokens.securityToken,
        });
        
        this.tokens = tokens;
        console.log('[Auth] Session created successfully via Netlify Function');
        return this.tokens;
      } else {
        // Local development - use localStorage credentials
        if (!this.config) {
          throw new Error('Authentication config not set');
        }

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
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  async getValidTokens(): Promise<SessionTokens> {
    // If we don't have tokens, create a new session
    if (!this.tokens) {
      // On Netlify, check if tokens are cached in sessionStorage to avoid rate limiting
      if (isNetlify && typeof sessionStorage !== 'undefined') {
        const cached = sessionStorage.getItem('capital_tokens');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            const age = Date.now() - (parsed.timestamp || 0);
            // Use cached tokens if less than 5 minutes old
            if (age < 5 * 60 * 1000) {
              console.log('[Auth] Using cached tokens');
              this.tokens = { cst: parsed.cst, securityToken: parsed.securityToken };
              return this.tokens;
            }
          } catch (e) {
            console.error('[Auth] Failed to parse cached tokens:', e);
          }
        }
      }
      
      const tokens = await this.createSession();
      
      // Cache tokens on Netlify to prevent rate limiting
      if (isNetlify && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('capital_tokens', JSON.stringify({
          ...tokens,
          timestamp: Date.now()
        }));
      }
      
      return tokens;
    }
    return this.tokens;
  }

  clearTokens() {
    this.tokens = null;
  }

  hasConfig(): boolean {
    // On Netlify, config is handled by environment variables
    if (isNetlify) {
      return true;
    }
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
