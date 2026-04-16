# Mystic Valley Farm CRM

AI-powered CRM for tea wholesale business.

## Features

- **Lead Scraping**: Real leads via SerpAPI integration
- **Lead Qualification**: AI-powered scoring and ranking
- **Email Automation**: AI-generated personalized emails
- **Order Management**: Customer order forms with bulk pricing
- **Delivery Calculator**: Free delivery within 60 miles of Rogue River, OR

## Bulk Pricing Tiers

| Pounds | Discount |
|--------|----------|
| 2 lbs  | 25% off  |
| 3-4 lbs| 30% off  |
| 5 lbs  | 35% off  |
| 6+ lbs | 40% off  |

## Deploy to Render.com

### Option 1: One-Click Deploy with Blueprint

1. Fork this repository to your GitHub account
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New" → "Blueprint"
4. Connect your GitHub and select this repository
5. Render will automatically deploy using `render.yaml`

### Option 2: Manual Deploy

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the following:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add environment variables:
   - `NODE_ENV` = `production`

### Environment Variables (Optional)

Set these in Render's Environment tab:
- `SERPAPI_KEY` - For real lead scraping

### After Deployment

1. Your CRM will be available at `https://your-app-name.onrender.com`
2. Configure SMTP settings in the Settings page for email automation
3. Add your SerpAPI key for lead scraping

## Local Development

```bash
cd crm
npm install
npm start
```

The CRM will run on http://localhost:3000

## Tech Stack

- Node.js + Express
- Vanilla JavaScript (no framework)
- JSON file storage (no database required)
- SerpAPI for lead scraping
- OpenStreetMap Nominatim for geocoding

## License

MIT