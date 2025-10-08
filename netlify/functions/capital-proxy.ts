import { Handler } from '@netlify/functions';

const BASE_URL = "https://api-capital.backend-capital.com";

export const handler: Handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, CST, X-SECURITY-TOKEN',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  try {
    // Get the path from query parameters
    const path = event.queryStringParameters?.path || '';
    const cst = event.headers['cst'] || '';
    const securityToken = event.headers['x-security-token'] || '';

    if (!cst || !securityToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing authentication tokens' }),
      };
    }

    // Forward the request to Capital.com API
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        'CST': cst,
        'X-SECURITY-TOKEN': securityToken,
        'Content-Type': 'application/json',
      },
      body: event.body || undefined,
    });

    const data = await response.text();

    return {
      statusCode: response.status,
      headers,
      body: data,
    };
  } catch (error) {
    console.error('Error in capital-proxy function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Proxy error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};
