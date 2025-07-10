# FMV API Deployment Guide

## Overview

This guide covers the deployment and configuration of the FMV (Fair Market Value) API integration for the Total Compensation Calculator. The system fetches real-time stock prices from multiple providers with fallback support, caching, and rate limiting.

## API Provider Setup

### 1. Yahoo Finance (Default - No API Key Required)
- **Free tier**: Unlimited (unofficial API)
- **Rate limit**: 100 requests/minute
- **Coverage**: US and international stocks
- **No setup required** - works out of the box

### 2. Alpha Vantage (Backup Provider)
1. Sign up at https://www.alphavantage.co/support/#api-key
2. Get your free API key (5 requests/minute, 500/day)
3. Add to environment: `ALPHA_VANTAGE_API_KEY=your_key_here`

### 3. Finnhub (Premium Backup)
1. Register at https://finnhub.io/register
2. Get your free API key (60 requests/minute)
3. Add to environment: `FINNHUB_API_KEY=your_key_here`

## Environment Variables

### Local Development (.env.local)
```bash
# FMV API Configuration
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
FINNHUB_API_KEY=your_finnhub_key
FMV_DEFAULT_PROVIDER=yahoo
FMV_ENABLE_FALLBACK=true
FMV_CACHE_TTL_MINUTES=5
FMV_CACHE_TTL_CLOSED=60
```

### Vercel Environment Variables
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable for both Preview and Production environments:
   - `ALPHA_VANTAGE_API_KEY`
   - `FINNHUB_API_KEY`
   - `FMV_DEFAULT_PROVIDER`
   - `FMV_ENABLE_FALLBACK`
   - `FMV_CACHE_TTL_MINUTES`
   - `FMV_CACHE_TTL_CLOSED`

### Convex Environment Variables
```bash
# Set environment variables for Convex
npx convex env set ALPHA_VANTAGE_API_KEY your_key --prod
npx convex env set FINNHUB_API_KEY your_key --prod
npx convex env set FMV_DEFAULT_PROVIDER yahoo --prod
npx convex env set FMV_ENABLE_FALLBACK true --prod
```

## Deployment Steps

### 1. Update Convex Schema
```bash
# Deploy the updated schema with cache and rate limit tables
npx convex dev  # For development
npx convex deploy --prod  # For production
```

### 2. Deploy Convex Functions
The following files need to be deployed:
- `convex/actions/fmvApi.ts` - Main FMV API action
- `convex/lib/fmvCache.ts` - Caching system
- `convex/lib/fmvRateLimit.ts` - Rate limiting
- `convex/fmvUpdates.ts` - Updated to use real API

### 3. Verify Deployment
```bash
# Check Convex logs
npx convex logs --prod

# Monitor FMV updates
npx convex logs --prod --filter "FMV"
```

## Testing the Integration

### 1. Manual Test via Convex Dashboard
```typescript
// Run in Convex dashboard console
await ctx.runAction("actions/fmvApi:fetchFMV", {
  ticker: "AAPL",
  provider: "yahoo"
});
```

### 2. Test Rate Limiting
```typescript
// Check rate limit status
await ctx.runQuery("lib/fmvRateLimit:getRateLimitStatus", {
  provider: "alphavantage"
});
```

### 3. Test Cache
```typescript
// Check cache statistics
await ctx.runQuery("lib/fmvCache:getCacheStats");
```

## Monitoring

### Key Metrics to Monitor

1. **API Success Rate**
   - Monitor via `getRateLimitStats` query
   - Alert if success rate drops below 90%

2. **Rate Limit Usage**
   - Check `getRateLimitStatus` for each provider
   - Alert if usage exceeds 80% of limits

3. **Cache Hit Rate**
   - Monitor via `getCacheHitRate` query
   - Target: >50% cache hit rate

4. **Response Times**
   - Track average response time per provider
   - Alert if response time exceeds 2 seconds

### Monitoring Queries
```typescript
// Overall API health
const stats = await convex.query(api.lib.fmvRateLimit.getRateLimitStats);

// Provider-specific status
const alphaStatus = await convex.query(api.lib.fmvRateLimit.getRateLimitStatus, {
  provider: "alphavantage"
});

// Cache effectiveness
const cacheStats = await convex.query(api.lib.fmvCache.getCacheStats);
```

## Cost Management

### Estimated Monthly Costs
- **Yahoo Finance**: Free
- **Alpha Vantage**: Free (500 calls/day limit)
- **Finnhub**: Free (1000 calls/day limit)

### Cost Optimization Tips
1. Yahoo Finance is set as default (free, no limits)
2. Paid providers only used as fallback
3. Aggressive caching reduces API calls by 50%+
4. Rate limiting prevents accidental overuse

## Troubleshooting

### Common Issues

#### 1. "Rate limit exceeded" errors
**Solution**: 
- Check rate limit status for the provider
- Ensure fallback is enabled
- Consider increasing cache TTL

#### 2. "Invalid API key" errors
**Solution**:
- Verify API keys in environment variables
- Check Convex has access to env vars
- Ensure keys are valid and active

#### 3. Cache not working
**Solution**:
- Check cache table exists in Convex
- Verify cache TTL settings
- Clear expired cache entries

#### 4. Slow response times
**Solution**:
- Check provider response times
- Increase parallel processing
- Warm cache for popular tickers

### Debug Commands
```bash
# Check environment variables
npx convex env list --prod

# View recent errors
npx convex logs --prod --filter "error"

# Check specific provider
npx convex logs --prod --filter "alphavantage"
```

## Security Considerations

1. **API Keys**: 
   - Never commit API keys to code
   - Use environment variables only
   - Rotate keys periodically

2. **Rate Limiting**:
   - Prevents abuse and cost overruns
   - Circuit breaker prevents cascading failures

3. **Data Validation**:
   - All API responses validated
   - Anomalous prices rejected
   - Confidence scores tracked

## Maintenance

### Daily Tasks
- Monitor API success rates
- Check for provider outages
- Review error logs

### Weekly Tasks
- Review API usage vs limits
- Check cache hit rates
- Clean old rate limit data

### Monthly Tasks
- Review cost vs budget
- Update API keys if needed
- Performance optimization review

## Rollback Plan

If issues occur:

1. **Immediate**: Set `FMV_ENABLE_FALLBACK=false` to disable API calls
2. **Revert to Mock**: Deploy previous version of `fmvUpdates.ts`
3. **Debug**: Check logs and fix issues
4. **Re-enable**: Gradually re-enable with monitoring

## Support Resources

- **Yahoo Finance**: Community forums (unofficial API)
- **Alpha Vantage**: support@alphavantage.co
- **Finnhub**: support@finnhub.io
- **Convex**: https://docs.convex.dev

---

**Last Updated**: 2025-01-10
**Status**: Ready for Production Deployment