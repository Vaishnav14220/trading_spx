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

    if (!apiKey || !identifier || !password) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error: Missing credentials',
          details: 'Please configure CAPITAL_API_KEY, CAPITAL_IDENTIFIER, and CAPITAL_PASSWORD in Netlify environment variables'
        }),
      };
    }

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

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: 'Authentication failed',
          details: errorText 
        }),
      };
    }

    const cst = response.headers.get('CST');
    const securityToken = response.headers.get('X-SECURITY-TOKEN');

    if (!cst || !securityToken) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Authentication tokens not received' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cst,
        securityToken,
      }),
    };
  } catch (error) {
    console.error('Error in capital-auth function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};
