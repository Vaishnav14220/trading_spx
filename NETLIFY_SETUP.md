# Netlify Deployment Setup for SPX Trading App

## Environment Variables Configuration

To deploy this application on Netlify, you need to configure the following environment variables in your Netlify site settings:

### Required Environment Variables:

1. **CAPITAL_API_KEY**
   - Your Capital.com API key
   - Example: `9bP6pGlM0Tt4q7fO`

2. **CAPITAL_IDENTIFIER**
   - Your Capital.com email/username
   - Example: `your-email@example.com`

3. **CAPITAL_PASSWORD**
   - Your Capital.com password
   - Example: `YourPassword123`

## How to Set Environment Variables in Netlify:

### Method 1: Via Netlify Web UI

1. Go to your Netlify dashboard: https://app.netlify.com
2. Select your site (spx-trading-app)
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**
5. Add each of the three variables listed above
6. Click **Save**
7. Trigger a new deployment (or it will auto-deploy on next push)

### Method 2: Via Netlify CLI

```bash
# Set environment variables
netlify env:set CAPITAL_API_KEY "your-api-key-here"
netlify env:set CAPITAL_IDENTIFIER "your-email@example.com"
netlify env:set CAPITAL_PASSWORD "your-password-here"

# Deploy
netlify deploy --prod
```

## How It Works

### Local Development:
- Uses credentials from localStorage (via the Settings UI)
- Connects directly to Capital.com API

### Production (Netlify):
- Uses environment variables (secure, server-side)
- Routes authentication through Netlify Functions
- Netlify Functions act as a secure proxy to Capital.com API
- No credentials exposed in the browser

## Netlify Functions

The app uses two serverless functions:

1. **`/.netlify/functions/capital-auth`**
   - Handles authentication with Capital.com
   - Returns session tokens (CST and X-SECURITY-TOKEN)

2. **`/.netlify/functions/capital-proxy`** (optional)
   - Proxies API requests to Capital.com
   - Adds authentication headers

## Testing After Deployment

1. Visit your deployed site: https://spx-trading-app.netlify.app
2. The app should automatically connect using the environment variables
3. Check the browser console for connection logs
4. You should see: "Using Netlify Function for authentication"

## Troubleshooting

### Issue: "Authentication config not set"
- **Solution**: Make sure environment variables are set in Netlify

### Issue: WebSocket connection fails
- **Solution**: WebSocket connections should work directly from the browser to Capital.com's WebSocket endpoint (`wss://api-streaming-capital.backend-capital.com/connect`)
- The authentication tokens are obtained via Netlify Function first

### Issue: CORS errors
- **Solution**: Netlify Functions automatically handle CORS headers

## Security Notes

✅ **DO NOT** commit your API credentials to Git  
✅ **DO** use Netlify environment variables for production  
✅ **DO** use different credentials for development and production if possible  

## Redeployment

After setting environment variables, redeploy your site:

```bash
# Via CLI
netlify deploy --prod

# Or via Git
git push origin main  # Auto-deploys if connected to Git
```

## Support

If you encounter issues:
1. Check Netlify Function logs: https://app.netlify.com/sites/spx-trading-app/logs/functions
2. Check browser console for error messages
3. Verify environment variables are set correctly
