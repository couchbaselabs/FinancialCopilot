require('dotenv').config();
const { connect } = require('./db');
const { v4: uuidv4 } = require('uuid');

const holdings = [
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', shares: 50, avgCost: 145.20, currentPrice: 189.50 },
  { ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', shares: 30, avgCost: 280.00, currentPrice: 415.20 },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', shares: 15, avgCost: 125.00, currentPrice: 172.80 },
  { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financials', shares: 40, avgCost: 148.50, currentPrice: 198.60 },
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', shares: 25, avgCost: 158.00, currentPrice: 147.30 },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary', shares: 20, avgCost: 132.00, currentPrice: 182.40 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', shares: 35, avgCost: 220.00, currentPrice: 875.40 },
  { ticker: 'BRK', name: 'Berkshire Hathaway', sector: 'Financials', shares: 10, avgCost: 310.00, currentPrice: 382.00 },
  { ticker: 'V', name: 'Visa Inc.', sector: 'Financials', shares: 45, avgCost: 210.00, currentPrice: 271.50 },
  { ticker: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples', shares: 30, avgCost: 138.00, currentPrice: 159.80 },
];

const transactions = [
  { ticker: 'NVDA', type: 'BUY', shares: 35, price: 220.00, date: '2023-06-15' },
  { ticker: 'AAPL', type: 'BUY', shares: 50, price: 145.20, date: '2023-07-01' },
  { ticker: 'MSFT', type: 'BUY', shares: 30, price: 280.00, date: '2023-08-10' },
  { ticker: 'GOOGL', type: 'BUY', shares: 15, price: 125.00, date: '2023-09-05' },
  { ticker: 'JPM', type: 'BUY', shares: 40, price: 148.50, date: '2023-10-12' },
  { ticker: 'JNJ', type: 'BUY', shares: 25, price: 158.00, date: '2023-11-20' },
  { ticker: 'AMZN', type: 'BUY', shares: 20, price: 132.00, date: '2023-12-01' },
  { ticker: 'BRK', type: 'BUY', shares: 10, price: 310.00, date: '2024-01-15' },
  { ticker: 'V', type: 'BUY', shares: 45, price: 210.00, date: '2024-02-08' },
  { ticker: 'PG', type: 'BUY', shares: 30, price: 138.00, date: '2024-03-22' },
  { ticker: 'AAPL', type: 'SELL', shares: 10, price: 175.00, date: '2024-04-10' },
  { ticker: 'NVDA', type: 'BUY', shares: 10, price: 680.00, date: '2024-05-01' },
];

async function seed() {
  try {
    const { bucket } = await connect();
    const collection = bucket.defaultCollection();

    console.log('Seeding holdings...');
    for (const h of holdings) {
      const id = `holding::${h.ticker}`;
      await collection.upsert(id, { type: 'holding', ...h, updatedAt: new Date().toISOString() });
      console.log(`  ✓ ${h.ticker}`);
    }

    console.log('Seeding transactions...');
    for (const t of transactions) {
      const id = `transaction::${uuidv4()}`;
      await collection.upsert(id, { type: 'transaction', ...t, createdAt: new Date().toISOString() });
      console.log(`  ✓ ${t.type} ${t.ticker}`);
    }

    console.log('\n✅ Seed complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
