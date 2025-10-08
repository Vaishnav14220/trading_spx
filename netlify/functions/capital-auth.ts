import { Handler } from '@netlify/functions';

const BASE_URL = "https://api-capital.backend-capital.com";

export const handler: Handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Get credentials from environment variables
    const apiKey = process.env.CAPITAL_API_KEY;
    const identifier = process.env.CAPITAL_IDENTIFIER;
    const password = process.env.CAPITAL_PASSWORD;

    console.log('[capital-auth] Environment check:', {
      hasApiKey: !!apiKey,
      hasIdentifier: !!identifier,
      hasPassword: !!password,
      apiKeyLength: apiKey?.length,
      identifierValue: identifier,
    });

    if (!apiKey || !identifier || !password) {
      console.error('[capital-auth] Missing credentials');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error: Missing credentials',
          details: 'Please configure CAPITAL_API_KEY, CAPITAL_IDENTIFIER, and CAPITAL_PASSWORD in Netlify environment variables',
          debug: {
            hasApiKey: !!apiKey,
            hasIdentifier: !!identifier,
            hasPassword: !!password,
          }
        }),
      };
    }

    console.log('[capital-auth] Attempting to create session with Capital.com');

    // Create session with Capital.com
    const response = await fetch(`${BASE_URL}/api/v1/session`, {
      method: 'POST',
      headers: {
        'X-CAP-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier,
        password,
        encryptedPassword: false,
      }),
    });

    console.log('[capital-auth] Capital.com response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[capital-auth] Authentication failed:', errorText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: 'Authentication failed',
          details: errorText,
          status: response.status,
        }),
      };
    }

    const cst = response.headers.get('CST');
    const securityToken = response.headers.get('X-SECURITY-TOKEN');

    console.log('[capital-auth] Tokens received:', {
      hasCst: !!cst,
      hasSecurityToken: !!securityToken,
    });

    if (!cst || !securityToken) {
      console.error('[capital-auth] Tokens not received in response headers');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Authentication tokens not received',
          debug: {
            hasCst: !!cst,
            hasSecurityToken: !!securityToken,
          }
        }),
      };
    }

    console.log('[capital-auth] Session created successfully');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cst,
        securityToken,
      }),
    };
  } catch (error) {
    console.error('[capital-auth] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
    };
  }
};
