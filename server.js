const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data storage (file-based for persistence)
const DATA_DIR = './data';
const LEADS_FILE = `${DATA_DIR}/leads.json`;
const EMAILS_FILE = `${DATA_DIR}/emails.json`;
const ORDERS_FILE = `${DATA_DIR}/orders.json`;
const SETTINGS_FILE = `${DATA_DIR}/settings.json`;
const CAMPAIGNS_FILE = `${DATA_DIR}/campaigns.json`;
const CONVERSATIONS_FILE = `${DATA_DIR}/conversations.json`;
const ORDER_FORMS_FILE = `${DATA_DIR}/order_forms.json`;

// Rogue River, OR coordinates (zip 97537)
const ROGUE_RIVER_COORDS = { lat: 42.4332, lng: -123.1717 };
const FREE_DELIVERY_RADIUS = 60; // miles

// Bulk pricing tiers (per pound)
const BULK_DISCOUNT_TIERS = {
  2: 0.25,   // 2 lbs = 25% off
  3: 0.30,   // 3-4 lbs = 30% off
  5: 0.35,   // 5 lbs = 35% off
  6: 0.40    // 6+ lbs = 40% off
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files
function initDataFile(file, defaultData = []) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
  }
}

initDataFile(LEADS_FILE);
initDataFile(EMAILS_FILE);
initDataFile(ORDERS_FILE);
initDataFile(CAMPAIGNS_FILE);
initDataFile(CONVERSATIONS_FILE);
initDataFile(ORDER_FORMS_FILE);
initDataFile(SETTINGS_FILE, {
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: '',
    pass: ''
  },
  businessEmail: 'steven@themysticvalleyfarm.com',
  companyName: 'Mystic Valley Farm',
  phone: '707-690-2040',
  address: 'Rogue River, OR 97537',
  openaiKey: '',
  serpApiKey: '',
  emailTemplates: {
    initial: {
      subject: 'Partnership Opportunity with Mystic Valley Farm - Premium Teas',
      body: `Dear {name},

I hope this email finds you well. My name is Steven Scott from Mystic Valley Farm, and I'm reaching out because I believe our premium organic teas would be a perfect addition to {company}.

We specialize in high-quality loose-leaf teas including Black, Green, Oolong, White, and Herbal varieties. Our wholesale program offers:
- Competitive pricing with 25-40% off retail
- Flexible ordering (small and large bags, bulk by the pound)
- No minimum order requirements for first-time partners
- FREE DELIVERY within 60 miles of Rogue River, OR

I'd love to discuss how we can help enhance your beverage offerings. Would you be available for a quick call this week?

Best regards,
Steven Scott
Mystic Valley Farm
707-690-2040
steven@themysticvalleyfarm.com`
    },
    followup: {
      subject: 'Following Up: Mystic Valley Farm Tea Partnership',
      body: `Dear {name},

I wanted to follow up on my previous email about partnering with Mystic Valley Farm for your tea offerings.

I understand you're busy, so I'll keep this brief. We've recently expanded our product line and are offering special introductory pricing for new wholesale partners.

Would you have 10 minutes this week to discuss how our premium teas could benefit your business?

Best regards,
Steven Scott
Mystic Valley Farm
707-690-2040
steven@themysticvalleyfarm.com`
    }
  }
});

// Helper functions
function readData(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Calculate bulk discount based on pounds
function getBulkDiscount(lbs) {
  if (lbs >= 6) return 0.40;
  if (lbs >= 5) return 0.35;
  if (lbs >= 3) return 0.30;
  if (lbs >= 2) return 0.25;
  return 0; // No discount for under 2 lbs
}

// Product catalog
const PRODUCTS = {
  blackTeas: [
    { name: 'Assam (TGFOP)', smallPrice: 9.00, largePrice: 18.00, bulkPricePerLb: 45.00 },
    { name: 'Chai (Black)', smallPrice: 10.00, largePrice: 20.00, bulkPricePerLb: 50.00 },
    { name: 'China', smallPrice: 10.25, largePrice: 20.50, bulkPricePerLb: 51.25 },
    { name: 'Earl Grey', smallPrice: 9.75, largePrice: 19.50, bulkPricePerLb: 48.75 },
    { name: 'English Breakfast', smallPrice: 10.00, largePrice: 20.00, bulkPricePerLb: 50.00 },
    { name: 'Ginger Peach', smallPrice: 12.00, largePrice: 24.00, bulkPricePerLb: 60.00 },
    { name: 'Orange Spice', smallPrice: 8.75, largePrice: 17.50, bulkPricePerLb: 43.75 },
    { name: 'Peach Black', smallPrice: 8.50, largePrice: 17.00, bulkPricePerLb: 42.50 },
    { name: 'Raspberry Black', smallPrice: 7.50, largePrice: 15.00, bulkPricePerLb: 37.50 },
    { name: 'Small Farmers Black Tea', smallPrice: 9.00, largePrice: 18.00, bulkPricePerLb: 45.00 },
    { name: 'Yunnan Gold', smallPrice: 9.75, largePrice: 19.50, bulkPricePerLb: 48.75 }
  ],
  greenTeas: [
    { name: 'Bancha Green Tea', smallPrice: 7.75, largePrice: 15.50, bulkPricePerLb: 38.75 },
    { name: 'Chai Green Tea', smallPrice: 7.25, largePrice: 14.50, bulkPricePerLb: 36.25 },
    { name: 'Chunmee Green Tea', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 },
    { name: 'Dragonwell Green Tea', smallPrice: 8.75, largePrice: 17.50, bulkPricePerLb: 43.75 },
    { name: 'Genmaicha Green Tea', smallPrice: 9.25, largePrice: 18.50, bulkPricePerLb: 46.25 },
    { name: 'Gunpowder Green Tea', smallPrice: 8.25, largePrice: 16.50, bulkPricePerLb: 41.25 },
    { name: 'Jasmine Green Tea', smallPrice: 8.75, largePrice: 17.50, bulkPricePerLb: 43.75 },
    { name: 'Moroccan Mint Green Tea', smallPrice: 8.25, largePrice: 16.50, bulkPricePerLb: 41.25 },
    { name: 'Sencha Green Tea', smallPrice: 9.00, largePrice: 18.00, bulkPricePerLb: 45.00 },
    { name: 'Strawberry Green Tea', smallPrice: 7.50, largePrice: 15.00, bulkPricePerLb: 37.50 },
    { name: 'Young Hyson Green Tea', smallPrice: 6.50, largePrice: 13.00, bulkPricePerLb: 32.50 }
  ],
  oolongTeas: [
    { name: 'Da Hong Pao Oolong Tea', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 },
    { name: 'Shui Xian Oolong Tea', smallPrice: 7.25, largePrice: 14.50, bulkPricePerLb: 36.25 },
    { name: 'Tie Kuan Yin Oolong Tea', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 }
  ],
  whiteTeas: [
    { name: 'Peach White Tea', smallPrice: 8.50, largePrice: 17.00, bulkPricePerLb: 42.50 },
    { name: "Pu'erh White Tea", smallPrice: 8.25, largePrice: 16.50, bulkPricePerLb: 41.25 },
    { name: 'Shu Mee White Tea', smallPrice: 7.50, largePrice: 15.00, bulkPricePerLb: 37.50 }
  ],
  herbalTeas: [
    { name: 'Chai Rooibos Tea', smallPrice: 10.00, largePrice: 20.00, bulkPricePerLb: 50.00 },
    { name: 'Chai Turmeric Tea', smallPrice: 11.00, largePrice: 22.00, bulkPricePerLb: 55.00 },
    { name: 'Big Brain', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 },
    { name: 'Circulation Support', smallPrice: 9.00, largePrice: 18.00, bulkPricePerLb: 45.00 },
    { name: 'Deep Sleep', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 },
    { name: 'Detox Delight', smallPrice: 10.00, largePrice: 20.00, bulkPricePerLb: 50.00 },
    { name: 'Happy Heart', smallPrice: 9.00, largePrice: 18.00, bulkPricePerLb: 45.00 },
    { name: 'Iron Infusion', smallPrice: 9.00, largePrice: 18.00, bulkPricePerLb: 45.00 },
    { name: 'Libido Boost', smallPrice: 10.00, largePrice: 20.00, bulkPricePerLb: 50.00 },
    { name: 'Revitalize', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 },
    { name: 'Stay Well', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 },
    { name: 'Yummy Tummy', smallPrice: 8.00, largePrice: 16.00, bulkPricePerLb: 40.00 }
  ],
  bottles: [
    { name: '12oz Herbal Tea Bottle', price: 4.50, wholesalePrice: 3.00 }
  ]
};

const WHOLESALE_DISCOUNTS = {
  1: 0.25,
  2: 0.30,
  3: 0.35,
  4: 0.40
};

// Email transporter setup
function createTransporter() {
  const settings = readData(SETTINGS_FILE);
  return nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: {
      user: settings.smtp.user,
      pass: settings.smtp.pass
    }
  });
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Geocode an address using OpenStreetMap Nominatim
async function geocodeAddress(address) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'MysticValleyFarm-CRM/1.0'
      }
    });
    
    if (response.data && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon)
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
}

// Check if address is within free delivery radius
async function checkDeliveryZone(address) {
  const coords = await geocodeAddress(address);
  if (!coords) {
    return { canDeliver: false, distance: null, freeDelivery: false, error: 'Could not geocode address' };
  }
  
  const distance = calculateDistance(ROGUE_RIVER_COORDS.lat, ROGUE_RIVER_COORDS.lng, coords.lat, coords.lng);
  
  return {
    canDeliver: true,
    distance: Math.round(distance * 10) / 10,
    freeDelivery: distance <= FREE_DELIVERY_RADIUS,
    coordinates: coords
  };
}

// ============ REAL LEAD SCRAPING ============

// Search for real businesses using Google Custom Search API or SerpAPI
async function searchRealLeads(query, location, businessType) {
  const settings = readData(SETTINGS_FILE);
  const serpApiKey = settings.serpApiKey || settings.serpapiKey;
  console.log('SerpAPI key present:', serpApiKey ? 'yes' : 'no');
  
  // If SerpAPI key is configured, use it for real search
  if (serpApiKey) {
    console.log('Using SerpAPI for lead search...');
    const serpResults = await searchWithSerpAPI(query, location, businessType, serpApiKey);
    console.log('SerpAPI returned:', serpResults.length, 'results');
    if (serpResults.length > 0) {
      return serpResults;
    }
    console.log('SerpAPI returned no results, falling back to web scraping');
  }
  
  // Otherwise, use a fallback - search via web scraping
  console.log('Using web scraping (DuckDuckGo) for lead search...');
  return await searchWithWebScraping(query, location, businessType);
}

// Search using SerpAPI (requires API key)
async function searchWithSerpAPI(query, location, businessType, apiKey) {
  try {
    const searchQuery = `${businessType} ${query} wholesale tea ${location}`;
    console.log('SerpAPI search query:', searchQuery);
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        q: searchQuery,
        api_key: apiKey,
        num: 10
      }
    });
    
    const results = response.data.organic_results || [];
    console.log('SerpAPI found', results.length, 'results');
    return results.map(result => ({
      id: uuidv4(),
      company: result.title.replace(/[-|].*$/, '').trim(),
      email: null, // Will need to be found by visiting the site
      phone: null,
      website: result.link,
      snippet: result.snippet,
      industry: businessType,
      businessType,
      location,
      source: 'serpapi',
      status: 'new',
      score: 0,
      rank: 'unqualified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: [],
      emails: [],
      orders: [],
      verified: false
    }));
  } catch (error) {
    console.error('SerpAPI error:', error.message);
    return [];
  }
}

// Search using web scraping (no API key needed, but limited)
async function searchWithWebScraping(query, location, businessType) {
  try {
    // Use DuckDuckGo for search (no API key required)
    const searchQuery = encodeURIComponent(`${businessType} tea coffee shop ${location} contact`);
    const response = await axios.get(`https://html.duckduckgo.com/html/?q=${searchQuery}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    
    $('.result__a').each((i, elem) => {
      if (i >= 10) return false; // Limit to 10 results
      const title = $(elem).text().trim();
      const link = $(elem).attr('href');
      
      if (title && link && !link.includes('youtube.com')) {
        results.push({
          id: uuidv4(),
          company: title.replace(/[-|].*$/, '').trim(),
          email: null,
          phone: null,
          website: link,
          industry: businessType,
          businessType,
          location,
          source: 'web_search',
          status: 'new',
          score: 0,
          rank: 'unqualified',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: [{ text: 'Found via web search - contact info needs verification', date: new Date().toISOString() }],
          emails: [],
          orders: [],
          verified: false
        });
      }
    });
    
    return results;
  } catch (error) {
    console.error('Web scraping error:', error.message);
    // Return empty array instead of mock data
    return [];
  }
}

// Scrape contact info from a website
async function scrapeContactInfo(website) {
  try {
    const response = await axios.get(website, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    });
    
    const $ = cheerio.load(response.data);
    
    // Find email
    let email = null;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const pageText = $.text();
    const emails = pageText.match(emailRegex);
    if (emails && emails.length > 0) {
      // Filter out common non-business emails
      email = emails.find(e => 
        !e.includes('example.com') && 
        !e.includes('domain.com') &&
        !e.includes('email.com') &&
        !e.includes('your.')
      ) || emails[0];
    }
    
    // Find phone
    let phone = null;
    const phoneRegex = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
    const phones = pageText.match(phoneRegex);
    if (phones && phones.length > 0) {
      phone = phones[0];
    }
    
    // Find address
    let address = null;
    $('address, .address, .contact-address').each((i, elem) => {
      if (!address) {
        address = $(elem).text().trim();
      }
    });
    
    return { email, phone, address };
  } catch (error) {
    console.error('Contact scraping error:', error.message);
    return { email: null, phone: null, address: null };
  }
}

// AI Email Generation
async function generateAIEmail(lead, emailType, context = {}) {
  const settings = readData(SETTINGS_FILE);
  
  const leadProfile = {
    company: lead.company || 'your business',
    name: lead.name || 'there',
    industry: lead.industry || 'business',
    location: lead.location || 'your area',
    email: lead.email,
    phone: lead.phone,
    website: lead.website,
    estimatedVolume: lead.estimatedVolume,
    notes: lead.notes
  };
  
  if (settings.openaiKey) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are Steven Scott, owner of Mystic Valley Farm, a premium organic tea company based in Rogue River, Oregon. You're writing professional but warm wholesale partnership emails. Your teas include Black, Green, Oolong, White, and Herbal varieties. Wholesale discounts are 25-40% based on volume (cases or bulk by pound). Bulk pricing: 2lbs=25% off, 3-4lbs=30% off, 5lbs=35% off, 6+lbs=40% off. You offer FREE DELIVERY within 60 miles of Rogue River, OR (97537). Your phone is 707-690-2040 and email is steven@themysticvalleyfarm.com. Be personable, concise, and focused on value.`
          },
          {
            role: 'user',
            content: `Write a ${emailType} email for a lead with this profile:
- Company: ${leadProfile.company}
- Contact: ${leadProfile.name}
- Industry: ${leadProfile.industry}
- Location: ${leadProfile.location}
- Estimated Volume: ${leadProfile.estimatedVolume || 'unknown'}
${context.previousEmails ? `- Previous emails: ${JSON.stringify(context.previousEmails)}` : ''}
${context.response ? `- Their response: ${context.response}` : ''}
${context.questions ? `- Questions to answer: ${context.questions}` : ''}

${emailType === 'initial' ? 'Write an initial outreach email proposing a wholesale partnership.' : ''}
${emailType === 'followup' ? 'Write a follow-up email (no response received yet).' : ''}
${emailType === 'response' ? 'Write a response to their email, answering their questions professionally.' : ''}

Return JSON format: {"subject": "...", "body": "..."}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${settings.openaiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      const content = response.data.choices[0].message.content;
      try {
        return JSON.parse(content);
      } catch {
        return {
          subject: `Partnership Opportunity with Mystic Valley Farm`,
          body: content
        };
      }
    } catch (error) {
      console.error('OpenAI API error:', error.message);
    }
  }
  
  return generatePersonalizedEmail(leadProfile, emailType, context);
}

function generatePersonalizedEmail(lead, emailType, context) {
  const industryMessages = {
    cafe: 'your cafe',
    restaurant: 'your restaurant',
    tea: 'your tea shop',
    spa: 'your spa and wellness center',
    hotel: 'your hotel',
    grocery: 'your grocery store',
    retail: 'your retail store'
  };
  
  const industryTip = industryMessages[lead.industry] || 'your business';
  
  if (emailType === 'initial') {
    return {
      subject: `Premium Teas for ${lead.company} - Wholesale Partnership`,
      body: `Dear ${lead.name},

I hope this email finds you well! My name is Steven Scott, and I own Mystic Valley Farm, a premium organic tea company based in Rogue River, Oregon.

I noticed ${lead.company} and thought our handcrafted loose-leaf teas would be a perfect addition to ${industryTip}. We specialize in:

- Black, Green, Oolong, White, and Herbal teas
- Organic and sustainably sourced ingredients
- Competitive wholesale pricing (25-40% off retail)
- Bulk ordering by the pound with volume discounts
- Flexible case quantities to fit your needs

${lead.location ? `Since you're located in ${lead.location}, I wanted to mention we offer FREE DELIVERY within 60 miles of Rogue River, OR!` : 'We offer FREE DELIVERY within 60 miles of Rogue River, OR!'}

I'd love to send you our full product catalog and discuss how we can support ${lead.company}'s beverage program. Would you have 15 minutes this week for a quick call?

You can reach me directly at 707-690-2040 or simply reply to this email.

Warm regards,
Steven Scott
Mystic Valley Farm
707-690-2040
steven@themysticvalleyfarm.com`
    };
  }
  
  if (emailType === 'followup') {
    return {
      subject: `Re: Premium Teas for ${lead.company}`,
      body: `Hi ${lead.name},

I wanted to follow up on my previous email about partnering with Mystic Valley Farm for your tea offerings.

I understand you're busy, so I'll keep this brief. We're currently offering special introductory pricing for new wholesale partners, and I'd love to help ${lead.company} enhance its beverage menu.

Would you have just 10 minutes this week for a quick chat? I can answer any questions about our products, pricing, or delivery options.

Looking forward to hearing from you!

Best,
Steven Scott
Mystic Valley Farm
707-690-2040
steven@themysticvalleyfarm.com`
    };
  }
  
  if (emailType === 'response') {
    return {
      subject: `Re: Your Inquiry - Mystic Valley Farm Teas`,
      body: `Dear ${lead.name},

Thank you so much for getting back to me! I'm excited to help ${lead.company} get started with our teas.

${context.response ? `Regarding your question: ${context.response}` : ''}

Here's what I can offer:
- Our full product catalog with wholesale pricing
- Sample pack to try our bestsellers
- Free delivery to your location
- No minimum order for your first purchase

I've attached our wholesale order form. Feel free to fill it out and send it back, or we can schedule a call to discuss your specific needs.

What would work best for you?

Warm regards,
Steven Scott
Mystic Valley Farm
707-690-2040
steven@themysticvalleyfarm.com`
    };
  }
  
  return {
    subject: `Mystic Valley Farm - Premium Teas`,
    body: `Dear ${lead.name},\n\nThank you for your interest in Mystic Valley Farm teas!\n\nBest regards,\nSteven Scott\nMystic Valley Farm`
  };
}

// Generate AI response to customer inquiry
async function generateAIResponse(lead, customerMessage, conversationHistory = []) {
  const settings = readData(SETTINGS_FILE);
  
  if (settings.openaiKey) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are Steven Scott, owner of Mystic Valley Farm. You're responding to a customer inquiry about wholesale tea. Be helpful, professional, and warm. Address their specific questions. Mention free delivery within 60 miles of Rogue River, OR 97537 when relevant. Bulk pricing: 2lbs=25% off, 3-4lbs=30% off, 5lbs=35% off, 6+lbs=40% off. Your contact: 707-690-2040, steven@themysticvalleyfarm.com. Return JSON: {"subject": "...", "body": "..."}`
          },
          {
            role: 'user',
            content: `Customer: ${lead.company} (${lead.industry})
Their message: "${customerMessage}"

${conversationHistory.length > 0 ? `Previous conversation: ${JSON.stringify(conversationHistory.slice(-3))}` : ''}

Write a helpful response addressing their questions. If they want to order, direct them to the order form. If they have pricing questions, mention our wholesale discounts.`
          }
        ],
        temperature: 0.7,
        max_tokens: 400
      }, {
        headers: {
          'Authorization': `Bearer ${settings.openaiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      const content = response.data.choices[0].message.content;
      try {
        return JSON.parse(content);
      } catch {
        return { subject: 'Re: Your Inquiry', body: content };
      }
    } catch (error) {
      console.error('OpenAI API error:', error.message);
    }
  }
  
  return {
    subject: `Re: Your Inquiry - Mystic Valley Farm`,
    body: `Dear ${lead.name || 'there'},

Thank you for your message! I'd be happy to help you with your inquiry.

Here's what I can tell you:
- Our wholesale discounts range from 25-40% based on order volume
- Bulk orders by the pound: 2lbs=25% off, 3-4lbs=30% off, 5lbs=35% off, 6+lbs=40% off
- We offer free delivery within 60 miles of Rogue River, OR
- No minimum order for first-time partners

Please let me know what specific information you need, and I'll get back to you promptly.

Best regards,
Steven Scott
Mystic Valley Farm
707-690-2040
steven@themysticvalleyfarm.com`
  };
}

// ============ API ROUTES ============

// Products API
app.get('/api/products', (req, res) => {
  res.json({ 
    products: PRODUCTS, 
    discounts: WHOLESALE_DISCOUNTS,
    bulkDiscountTiers: BULK_DISCOUNT_TIERS
  });
});

// Get bulk pricing info
app.get('/api/bulk-pricing', (req, res) => {
  res.json({
    tiers: BULK_DISCOUNT_TIERS,
    description: 'Bulk pricing per pound with volume discounts',
    rules: [
      { minLbs: 2, maxLbs: 2.99, discount: '25%', description: '2 lbs' },
      { minLbs: 3, maxLbs: 4.99, discount: '30%', description: '3-4 lbs' },
      { minLbs: 5, maxLbs: 5.99, discount: '35%', description: '5 lbs' },
      { minLbs: 6, maxLbs: null, discount: '40%', description: '6+ lbs' }
    ]
  });
});

// Leads API
app.get('/api/leads', (req, res) => {
  const leads = readData(LEADS_FILE);
  res.json(leads);
});

app.post('/api/leads', (req, res) => {
  const leads = readData(LEADS_FILE);
  const newLead = {
    id: uuidv4(),
    ...req.body,
    status: 'new',
    score: 0,
    rank: 'unqualified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: [],
    emails: [],
    orders: [],
    conversations: []
  };
  leads.push(newLead);
  writeData(LEADS_FILE, leads);
  res.json(newLead);
});

app.put('/api/leads/:id', (req, res) => {
  const leads = readData(LEADS_FILE);
  const index = leads.findIndex(l => l.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Lead not found' });
  
  leads[index] = {
    ...leads[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  writeData(LEADS_FILE, leads);
  res.json(leads[index]);
});

app.delete('/api/leads/:id', (req, res) => {
  const leads = readData(LEADS_FILE);
  const filtered = leads.filter(l => l.id !== req.params.id);
  writeData(LEADS_FILE, filtered);
  res.json({ success: true });
});

// Lead Scoring & Qualification
app.post('/api/leads/:id/qualify', (req, res) => {
  const leads = readData(LEADS_FILE);
  const index = leads.findIndex(l => l.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Lead not found' });
  
  const lead = leads[index];
  let score = 0;
  
  if (lead.email && lead.email.includes('@')) score += 15;
  if (lead.phone) score += 10;
  if (lead.company && lead.company.length > 2) score += 15;
  if (lead.website) score += 10;
  if (lead.businessType) score += 10;
  if (lead.estimatedVolume) score += 15;
  if (lead.source === 'referral') score += 15;
  if (lead.source === 'organic') score += 10;
  if (lead.notes && lead.notes.length > 0) score += 5;
  if (lead.verified) score += 10;
  
  const relevantIndustries = ['restaurant', 'cafe', 'coffee', 'tea', 'retail', 'grocery', 'hotel', 'spa', 'wellness'];
  if (lead.industry && relevantIndustries.some(i => lead.industry.toLowerCase().includes(i))) {
    score += 20;
  }
  
  let rank = 'unqualified';
  if (score >= 70) rank = 'hot';
  else if (score >= 50) rank = 'warm';
  else if (score >= 30) rank = 'cold';
  
  leads[index] = {
    ...lead,
    score,
    rank,
    status: 'qualified',
    updatedAt: new Date().toISOString()
  };
  
  writeData(LEADS_FILE, leads);
  res.json(leads[index]);
});

// Batch qualify all leads
app.post('/api/leads/qualify-all', (req, res) => {
  const leads = readData(LEADS_FILE);
  const qualifiedLeads = leads.map(lead => {
    let score = 0;
    
    if (lead.email && lead.email.includes('@')) score += 15;
    if (lead.phone) score += 10;
    if (lead.company && lead.company.length > 2) score += 15;
    if (lead.website) score += 10;
    if (lead.businessType) score += 10;
    if (lead.estimatedVolume) score += 15;
    if (lead.source === 'referral') score += 15;
    if (lead.source === 'organic') score += 10;
    if (lead.notes && lead.notes.length > 0) score += 5;
    if (lead.verified) score += 10;
    
    const relevantIndustries = ['restaurant', 'cafe', 'coffee', 'tea', 'retail', 'grocery', 'hotel', 'spa', 'wellness'];
    if (lead.industry && relevantIndustries.some(i => lead.industry.toLowerCase().includes(i))) {
      score += 20;
    }
    
    let rank = 'unqualified';
    if (score >= 70) rank = 'hot';
    else if (score >= 50) rank = 'warm';
    else if (score >= 30) rank = 'cold';
    
    return {
      ...lead,
      score,
      rank,
      status: lead.status === 'new' ? 'qualified' : lead.status,
      updatedAt: new Date().toISOString()
    };
  });
  
  writeData(LEADS_FILE, qualifiedLeads);
  res.json(qualifiedLeads);
});

// ============ REAL LEAD SCRAPING ENDPOINT ============

app.post('/api/leads/scrape', async (req, res) => {
  const { query, location, businessType } = req.body;
  
  try {
    const results = await searchRealLeads(query, location, businessType);
    
    // Mark results that need verification
    const leadsWithStatus = results.map(lead => ({
      ...lead,
      needsVerification: !lead.email || !lead.phone
    }));
    
    res.json(leadsWithStatus);
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: 'Failed to scrape leads', details: error.message });
  }
});

// Enrich a lead with contact info from their website
app.post('/api/leads/:id/enrich', async (req, res) => {
  const leads = readData(LEADS_FILE);
  const index = leads.findIndex(l => l.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Lead not found' });
  
  const lead = leads[index];
  if (!lead.website) {
    return res.status(400).json({ error: 'Lead has no website to scrape' });
  }
  
  try {
    const contactInfo = await scrapeContactInfo(lead.website);
    
    leads[index] = {
      ...lead,
      email: contactInfo.email || lead.email,
      phone: contactInfo.phone || lead.phone,
      address: contactInfo.address || lead.address,
      verified: !!(contactInfo.email || contactInfo.phone),
      updatedAt: new Date().toISOString()
    };
    
    writeData(LEADS_FILE, leads);
    res.json(leads[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to enrich lead', details: error.message });
  }
});

// ============ AI EMAIL ENDPOINTS ============

app.post('/api/leads/:id/generate-email', async (req, res) => {
  const leads = readData(LEADS_FILE);
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  
  const { emailType = 'initial', context = {} } = req.body;
  
  try {
    const email = await generateAIEmail(lead, emailType, context);
    res.json({ success: true, email, leadId: lead.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate email', details: error.message });
  }
});

app.post('/api/leads/:id/generate-response', async (req, res) => {
  const leads = readData(LEADS_FILE);
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  
  const { customerMessage } = req.body;
  if (!customerMessage) return res.status(400).json({ error: 'Customer message required' });
  
  try {
    const response = await generateAIResponse(lead, customerMessage, lead.conversations || []);
    res.json({ success: true, email: response, leadId: lead.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate response', details: error.message });
  }
});

app.post('/api/leads/:id/send-ai-email', async (req, res) => {
  const { emailType = 'initial', overrideEmail } = req.body;
  const leads = readData(LEADS_FILE);
  const leadIndex = leads.findIndex(l => l.id === req.params.id);
  if (leadIndex === -1) return res.status(404).json({ error: 'Lead not found' });
  
  const lead = leads[leadIndex];
  const settings = readData(SETTINGS_FILE);
  
  if (!settings.smtp.user || !settings.smtp.pass) {
    return res.status(400).json({ error: 'SMTP not configured' });
  }
  
  if (!lead.email) {
    return res.status(400).json({ error: 'Lead has no email address' });
  }
  
  try {
    const emailContent = overrideEmail || await generateAIEmail(lead, emailType);
    
    const transporter = createTransporter();
    
    const info = await transporter.sendMail({
      from: settings.smtp.user,
      to: lead.email,
      subject: emailContent.subject,
      text: emailContent.body,
      replyTo: settings.businessEmail
    });
    
    const emails = readData(EMAILS_FILE);
    const emailRecord = {
      id: uuidv4(),
      leadId: lead.id,
      to: lead.email,
      subject: emailContent.subject,
      body: emailContent.body,
      sentAt: new Date().toISOString(),
      status: 'sent',
      messageId: info.messageId,
      type: emailType,
      aiGenerated: true
    };
    emails.push(emailRecord);
    writeData(EMAILS_FILE, emails);
    
    leads[leadIndex].emails.push({
      id: emailRecord.id,
      subject: emailContent.subject,
      sentAt: new Date().toISOString(),
      status: 'sent',
      type: emailType
    });
    leads[leadIndex].status = 'contacted';
    leads[leadIndex].lastContactedAt = new Date().toISOString();
    writeData(LEADS_FILE, leads);
    
    res.json({ success: true, messageId: info.messageId, email: emailRecord });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

app.post('/api/leads/:id/response', (req, res) => {
  const { message, receivedAt } = req.body;
  const leads = readData(LEADS_FILE);
  const index = leads.findIndex(l => l.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Lead not found' });
  
  const response = {
    id: uuidv4(),
    message,
    receivedAt: receivedAt || new Date().toISOString(),
    needsResponse: true
  };
  
  if (!leads[index].responses) leads[index].responses = [];
  leads[index].responses.push(response);
  leads[index].status = 'responded';
  leads[index].updatedAt = new Date().toISOString();
  
  writeData(LEADS_FILE, leads);
  res.json({ success: true, response });
});

app.get('/api/leads/pending-responses', (req, res) => {
  const leads = readData(LEADS_FILE);
  const pending = leads.filter(l => 
    l.status === 'responded' || 
    (l.responses && l.responses.some(r => r.needsResponse))
  );
  res.json(pending);
});

// ============ ORDER FORM ENDPOINTS ============

app.post('/api/order-forms/create', async (req, res) => {
  const { leadId, expiresInDays = 30 } = req.body;
  const leads = readData(LEADS_FILE);
  const lead = leads.find(l => l.id === leadId);
  
  const orderForms = readData(ORDER_FORMS_FILE);
  const formId = uuidv4();
  const formCode = formId.split('-')[0].toUpperCase();
  
  const orderForm = {
    id: formId,
    code: formCode,
    leadId: leadId || null,
    leadInfo: lead ? {
      company: lead.company,
      name: lead.name,
      email: lead.email,
      phone: lead.phone
    } : null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
    used: false,
    usedAt: null
  };
  
  orderForms.push(orderForm);
  writeData(ORDER_FORMS_FILE, orderForms);
  
  res.json({ 
    success: true, 
    form: orderForm,
    url: `${req.protocol}://${req.get('host')}/order-form.html?code=${formCode}`
  });
});

app.get('/api/order-forms/:code', (req, res) => {
  const orderForms = readData(ORDER_FORMS_FILE);
  const form = orderForms.find(f => f.code === req.params.code.toUpperCase());
  
  if (!form) return res.status(404).json({ error: 'Order form not found' });
  if (new Date() > new Date(form.expiresAt)) return res.status(400).json({ error: 'Order form has expired' });
  
  res.json(form);
});

// Submit order from form (with bulk/pound support)
app.post('/api/order-forms/:code/submit', async (req, res) => {
  const { customerInfo, items, billingInfo, shippingInfo, bulkItems, notes } = req.body;
  const orderForms = readData(ORDER_FORMS_FILE);
  const form = orderForms.find(f => f.code === req.params.code.toUpperCase());
  
  if (!form) return res.status(404).json({ error: 'Order form not found' });
  if (new Date() > new Date(form.expiresAt)) return res.status(400).json({ error: 'Order form has expired' });
  
  const settings = readData(SETTINGS_FILE);
  
  // Calculate totals for case items
  let subtotal = 0;
  const processedItems = (items || []).map(item => {
    const price = item.size === 'large' ? item.largePrice : item.smallPrice;
    const itemTotal = price * item.quantity;
    subtotal += itemTotal;
    return { ...item, price, total: itemTotal, type: 'case' };
  });
  
  // Calculate totals for bulk items (by pound)
  let bulkSubtotal = 0;
  let totalLbs = 0;
  const processedBulkItems = (bulkItems || []).map(item => {
    const itemTotal = (item.bulkPricePerLb || 0) * (item.lbs || 0);
    bulkSubtotal += itemTotal;
    totalLbs += item.lbs || 0;
    return { 
      ...item, 
      pricePerLb: item.bulkPricePerLb,
      lbs: item.lbs,
      total: itemTotal,
      type: 'bulk'
    };
  });
  
  // Determine case discount
  const totalCases = (items || []).reduce((sum, item) => sum + item.quantity, 0);
  let caseDiscount = 0.25;
  if (totalCases >= 4) caseDiscount = 0.40;
  else if (totalCases >= 3) caseDiscount = 0.35;
  else if (totalCases >= 2) caseDiscount = 0.30;
  
  // Determine bulk discount based on total pounds
  const bulkDiscount = getBulkDiscount(totalLbs);
  
  // Check delivery zone
  let deliveryInfo = { freeDelivery: false, distance: null };
  if (shippingInfo && shippingInfo.address && shippingInfo.city && shippingInfo.state) {
    const fullAddress = `${shippingInfo.address}, ${shippingInfo.city}, ${shippingInfo.state} ${shippingInfo.zip || ''}`;
    deliveryInfo = await checkDeliveryZone(fullAddress);
  }
  
  const shipping = deliveryInfo.freeDelivery ? 0 : (req.body.shipping || 0);
  
  // Calculate final totals
  const caseDiscountAmount = subtotal * caseDiscount;
  const bulkDiscountAmount = bulkSubtotal * bulkDiscount;
  const total = (subtotal - caseDiscountAmount) + (bulkSubtotal - bulkDiscountAmount) + shipping;
  
  // Create order
  const orders = readData(ORDERS_FILE);
  const order = {
    id: uuidv4(),
    orderNumber: `MVF-${Date.now().toString().slice(-6)}`,
    formId: form.id,
    leadId: form.leadId,
    customerInfo,
    billingInfo,
    shippingInfo,
    items: processedItems,
    bulkItems: processedBulkItems,
    subtotal,
    caseDiscount: caseDiscount * 100,
    caseDiscountAmount,
    bulkSubtotal,
    bulkDiscount: bulkDiscount * 100,
    bulkDiscountAmount,
    totalLbs,
    shipping,
    total,
    deliveryInfo,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: notes || '',
    isQuote: req.body.isQuote || false
  };
  
  orders.push(order);
  writeData(ORDERS_FILE, orders);
  
  // Mark form as used
  form.used = true;
  form.usedAt = new Date().toISOString();
  writeData(ORDER_FORMS_FILE, orderForms);
  
  // Update lead if exists
  if (form.leadId) {
    const leads = readData(LEADS_FILE);
    const leadIndex = leads.findIndex(l => l.id === form.leadId);
    if (leadIndex !== -1) {
      leads[leadIndex].orders.push(order.id);
      leads[leadIndex].status = 'customer';
      leads[leadIndex].billingInfo = billingInfo;
      leads[leadIndex].shippingInfo = shippingInfo;
      writeData(LEADS_FILE, leads);
    }
  }
  
  // Send notification email
  try {
    if (settings.smtp.user && settings.smtp.pass) {
      const transporter = createTransporter();
      
      let itemsList = '';
      if (processedItems.length > 0) {
        itemsList += 'CASE ORDERS:\n' + processedItems.map(i => 
          `- ${i.name} (${i.size}) x${i.quantity}: $${i.total.toFixed(2)}`
        ).join('\n');
      }
      if (processedBulkItems.length > 0) {
        itemsList += '\n\nBULK ORDERS (by pound):\n' + processedBulkItems.map(i => 
          `- ${i.name} ${i.lbs} lbs @ $${i.pricePerLb}/lb: $${i.total.toFixed(2)}`
        ).join('\n');
      }
      
      await transporter.sendMail({
        from: settings.smtp.user,
        to: settings.businessEmail,
        subject: `${order.isQuote ? 'QUOTE REQUEST' : 'New Order'}: ${order.orderNumber} from ${customerInfo.company || customerInfo.name}`,
        text: `${order.isQuote ? 'QUOTE REQUEST' : 'New order'} received!

Order: ${order.orderNumber}
Customer: ${customerInfo.company || customerInfo.name}
Email: ${customerInfo.email}
Phone: ${customerInfo.phone}

${itemsList}

${processedItems.length > 0 ? `
Case Orders Subtotal: $${subtotal.toFixed(2)}
Case Discount: ${caseDiscount * 100}%
Case Discount Amount: -$${caseDiscountAmount.toFixed(2)}
` : ''}

${processedBulkItems.length > 0 ? `
Bulk Orders Subtotal: $${bulkSubtotal.toFixed(2)}
Total Weight: ${totalLbs} lbs
Bulk Discount: ${bulkDiscount * 100}%
Bulk Discount Amount: -$${bulkDiscountAmount.toFixed(2)}
` : ''}

Shipping: $${shipping.toFixed(2)}${deliveryInfo.freeDelivery ? ' (FREE DELIVERY)' : ''}
TOTAL: $${total.toFixed(2)}

Shipping Address:
${shippingInfo.address}
${shippingInfo.city}, ${shippingInfo.state} ${shippingInfo.zip}

${deliveryInfo.distance ? `Distance from Rogue River: ${deliveryInfo.distance} miles` : ''}

${notes ? `Notes: ${notes}` : ''}

View in CRM: ${req.protocol}://${req.get('host')}
`,
        replyTo: customerInfo.email
      });
    }
  } catch (error) {
    console.error('Failed to send order notification:', error);
  }
  
  res.json({ success: true, order });
});

// Request a quote for bulk orders
app.post('/api/quotes/request', async (req, res) => {
  const { customerInfo, bulkItems, notes } = req.body;
  const settings = readData(SETTINGS_FILE);
  
  // Calculate bulk discount
  let totalLbs = 0;
  let bulkSubtotal = 0;
  const processedItems = (bulkItems || []).map(item => {
    const itemTotal = (item.bulkPricePerLb || 0) * (item.lbs || 0);
    bulkSubtotal += itemTotal;
    totalLbs += item.lbs || 0;
    return { ...item, total: itemTotal };
  });
  
  const bulkDiscount = getBulkDiscount(totalLbs);
  const discountAmount = bulkSubtotal * bulkDiscount;
  const estimatedTotal = bulkSubtotal - discountAmount;
  
  // Create a quote record
  const quoteId = uuidv4();
  const quote = {
    id: quoteId,
    quoteNumber: `QUOTE-${Date.now().toString().slice(-6)}`,
    customerInfo,
    bulkItems: processedItems,
    totalLbs,
    bulkSubtotal,
    bulkDiscount: bulkDiscount * 100,
    discountAmount,
    estimatedTotal,
    notes,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  // Send notification email
  try {
    if (settings.smtp.user && settings.smtp.pass) {
      const transporter = createTransporter();
      
      await transporter.sendMail({
        from: settings.smtp.user,
        to: settings.businessEmail,
        subject: `Bulk Quote Request from ${customerInfo.company || customerInfo.name}`,
        text: `New bulk quote request!

Quote: ${quote.quoteNumber}
Customer: ${customerInfo.company || customerInfo.name}
Email: ${customerInfo.email}
Phone: ${customerInfo.phone}

BULK ITEMS REQUESTED:
${processedItems.map(i => `- ${i.name}: ${i.lbs} lbs @ $${i.bulkPricePerLb}/lb = $${i.total.toFixed(2)}`).join('\n')}

Total Weight: ${totalLbs} lbs
Subtotal: $${bulkSubtotal.toFixed(2)}
Applicable Discount: ${bulkDiscount * 100}%
Discount Amount: -$${discountAmount.toFixed(2)}
ESTIMATED TOTAL: $${estimatedTotal.toFixed(2)}

${notes ? `Notes: ${notes}` : ''}

Please contact the customer to finalize the quote.
`,
        replyTo: customerInfo.email
      });
    }
  } catch (error) {
    console.error('Failed to send quote notification:', error);
  }
  
  res.json({ success: true, quote, estimatedTotal, discount: bulkDiscount * 100 });
});

// Check delivery zone
app.post('/api/check-delivery', async (req, res) => {
  const { address, city, state, zip } = req.body;
  const fullAddress = `${address}, ${city}, ${state} ${zip}`;
  
  const result = await checkDeliveryZone(fullAddress);
  res.json(result);
});

// ============ STANDARD CRUD ENDPOINTS ============

app.get('/api/campaigns', (req, res) => {
  const campaigns = readData(CAMPAIGNS_FILE);
  res.json(campaigns);
});

app.post('/api/campaigns', (req, res) => {
  const campaigns = readData(CAMPAIGNS_FILE);
  const newCampaign = {
    id: uuidv4(),
    ...req.body,
    status: 'draft',
    createdAt: new Date().toISOString(),
    sentAt: null,
    stats: { sent: 0, opened: 0, clicked: 0, replied: 0 }
  };
  campaigns.push(newCampaign);
  writeData(CAMPAIGNS_FILE, campaigns);
  res.json(newCampaign);
});

app.post('/api/emails/send', async (req, res) => {
  const { to, subject, body, leadId } = req.body;
  const settings = readData(SETTINGS_FILE);
  
  if (!settings.smtp.user || !settings.smtp.pass) {
    return res.status(400).json({ error: 'SMTP not configured. Please update settings.' });
  }
  
  try {
    const transporter = createTransporter();
    
    const info = await transporter.sendMail({
      from: settings.smtp.user,
      to: to,
      subject: subject,
      text: body,
      replyTo: settings.businessEmail
    });
    
    const emails = readData(EMAILS_FILE);
    emails.push({
      id: uuidv4(),
      leadId,
      to,
      subject,
      body,
      sentAt: new Date().toISOString(),
      status: 'sent',
      messageId: info.messageId
    });
    writeData(EMAILS_FILE, emails);
    
    if (leadId) {
      const leads = readData(LEADS_FILE);
      const index = leads.findIndex(l => l.id === leadId);
      if (index !== -1) {
        leads[index].emails.push({
          subject,
          sentAt: new Date().toISOString(),
          status: 'sent'
        });
        leads[index].status = 'contacted';
        writeData(LEADS_FILE, leads);
      }
    }
    
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

app.post('/api/emails/bulk', async (req, res) => {
  const { leadIds, subject, body } = req.body;
  const settings = readData(SETTINGS_FILE);
  
  if (!settings.smtp.user || !settings.smtp.pass) {
    return res.status(400).json({ error: 'SMTP not configured' });
  }
  
  const results = [];
  const transporter = createTransporter();
  const leads = readData(LEADS_FILE);
  const emails = readData(EMAILS_FILE);
  
  for (const leadId of leadIds) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || !lead.email) continue;
    
    try {
      const personalizedSubject = subject.replace('{name}', lead.name || lead.company);
      const personalizedBody = body
        .replace('{name}', lead.name || 'there')
        .replace('{company}', lead.company || 'your business');
      
      const info = await transporter.sendMail({
        from: settings.smtp.user,
        to: lead.email,
        subject: personalizedSubject,
        text: personalizedBody,
        replyTo: settings.businessEmail
      });
      
      emails.push({
        id: uuidv4(),
        leadId,
        to: lead.email,
        subject: personalizedSubject,
        body: personalizedBody,
        sentAt: new Date().toISOString(),
        status: 'sent',
        messageId: info.messageId
      });
      
      const leadIndex = leads.findIndex(l => l.id === leadId);
      leads[leadIndex].emails.push({
        subject: personalizedSubject,
        sentAt: new Date().toISOString(),
        status: 'sent'
      });
      leads[leadIndex].status = 'contacted';
      
      results.push({ leadId, success: true });
    } catch (error) {
      results.push({ leadId, success: false, error: error.message });
    }
  }
  
  writeData(EMAILS_FILE, emails);
  writeData(LEADS_FILE, leads);
  
  res.json({ results, totalSent: results.filter(r => r.success).length });
});

app.get('/api/orders', (req, res) => {
  const orders = readData(ORDERS_FILE);
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const orders = readData(ORDERS_FILE);
  const newOrder = {
    id: uuidv4(),
    orderNumber: `MVF-${Date.now().toString().slice(-6)}`,
    ...req.body,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  orders.push(newOrder);
  writeData(ORDERS_FILE, orders);
  
  if (req.body.leadId) {
    const leads = readData(LEADS_FILE);
    const index = leads.findIndex(l => l.id === req.body.leadId);
    if (index !== -1) {
      leads[index].orders.push(newOrder.id);
      leads[index].status = 'customer';
      writeData(LEADS_FILE, leads);
    }
  }
  
  res.json(newOrder);
});

app.put('/api/orders/:id', (req, res) => {
  const orders = readData(ORDERS_FILE);
  const index = orders.findIndex(o => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Order not found' });
  
  orders[index] = {
    ...orders[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  writeData(ORDERS_FILE, orders);
  res.json(orders[index]);
});

app.get('/api/settings', (req, res) => {
  const settings = readData(SETTINGS_FILE);
  const safeSettings = { ...settings };
  if (safeSettings.smtp) {
    safeSettings.smtp = { ...safeSettings.smtp, pass: safeSettings.smtp.pass ? '********' : '' };
  }
  if (safeSettings.openaiKey) {
    safeSettings.openaiKey = safeSettings.openaiKey ? '********' : '';
  }
  if (safeSettings.serpApiKey) {
    safeSettings.serpApiKey = safeSettings.serpApiKey ? '********' : '';
  }
  res.json(safeSettings);
});

app.put('/api/settings', (req, res) => {
  const settings = readData(SETTINGS_FILE);
  const updated = { ...settings, ...req.body };
  
  if (req.body.smtp && !req.body.smtp.pass) {
    updated.smtp.pass = settings.smtp.pass;
  }
  if (req.body.openaiKey === undefined && settings.openaiKey) {
    updated.openaiKey = settings.openaiKey;
  }
  if (req.body.serpApiKey === undefined && settings.serpApiKey) {
    updated.serpApiKey = settings.serpApiKey;
  }
  
  writeData(SETTINGS_FILE, updated);
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  const leads = readData(LEADS_FILE);
  const orders = readData(ORDERS_FILE);
  const emails = readData(EMAILS_FILE);
  
  const stats = {
    totalLeads: leads.length,
    newLeads: leads.filter(l => l.status === 'new').length,
    qualifiedLeads: leads.filter(l => l.status === 'qualified').length,
    contactedLeads: leads.filter(l => l.status === 'contacted').length,
    respondedLeads: leads.filter(l => l.status === 'responded').length,
    customers: leads.filter(l => l.status === 'customer').length,
    hotLeads: leads.filter(l => l.rank === 'hot').length,
    warmLeads: leads.filter(l => l.rank === 'warm').length,
    coldLeads: leads.filter(l => l.rank === 'cold').length,
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 'pending').length,
    completedOrders: orders.filter(o => o.status === 'completed').length,
    totalRevenue: orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + (o.total || 0), 0),
    emailsSent: emails.length,
    pendingResponses: leads.filter(l => l.responses && l.responses.some(r => r.needsResponse)).length
  };
  
  res.json(stats);
});

app.listen(PORT, () => {
  console.log(`Mystic Valley Farm CRM running on port ${PORT}`);
});