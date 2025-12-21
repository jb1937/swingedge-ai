# SwingEdge AI 🚀

An AI-powered swing trading platform built with Next.js, featuring technical analysis, stock screening, backtesting, and an AI trading assistant powered by Claude.

## Features

### 📊 Dashboard
- Real-time portfolio view
- Position tracking with P&L
- Order entry (buy/sell with market/limit orders)
- One-click position closing

### 📈 Technical Analysis
- RSI, MACD, EMAs, Bollinger Bands, ADX, ATR
- Support/Resistance levels
- AI-generated trade thesis with entry/exit recommendations

### 🔍 Stock Screener
- Sector-based scanning (Technology, Financials, Healthcare, etc.)
- Custom symbol input
- AI-powered strategy recommendations
- Technical scoring and signal strength

### ⏮️ Backtesting
- EMA crossover strategy testing
- Historical performance metrics
- Win rate, Sharpe ratio, max drawdown
- Equity curve visualization

### 🤖 AI Trading Assistant
- Natural language chat interface
- Ask questions about strategies, indicators, risk management
- Powered by Claude Sonnet

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, Shadcn/ui
- **AI**: Anthropic Claude API
- **Market Data**: Alpha Vantage (historical), Alpaca (real-time)
- **Trading**: Alpaca Paper Trading API

## Getting Started

### Prerequisites

- Node.js 18+
- API Keys for:
  - [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
  - [Alpaca](https://alpaca.markets/) (Paper Trading)
  - [Anthropic](https://console.anthropic.com/)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/swingedge-ai.git
cd swingedge-ai
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` with your API keys:
```env
# Alpha Vantage
ALPHA_VANTAGE_API_KEY=your_key_here

# Alpaca (Paper Trading)
ALPACA_API_KEY=your_paper_key
ALPACA_SECRET_KEY=your_paper_secret

# Anthropic
ANTHROPIC_API_KEY=your_claude_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Deployment on Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

### Environment Variables for Vercel

Add these in your Vercel project settings:
- `ALPHA_VANTAGE_API_KEY`
- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`
- `ANTHROPIC_API_KEY`

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home page |
| `/dashboard` | Portfolio & trading |
| `/analysis` | Technical analysis |
| `/screener` | Stock screening |
| `/backtest` | Strategy backtesting |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/trading/account` | GET | Account info |
| `/api/trading/positions` | GET | Current positions |
| `/api/trading/orders` | GET/POST/DELETE | Orders management |
| `/api/data/quote/[symbol]` | GET | Stock quote |
| `/api/data/historical/[symbol]` | GET | OHLCV data |
| `/api/analysis/technical/[symbol]` | GET | Technical indicators |
| `/api/analysis/thesis` | POST | AI trade thesis |
| `/api/analysis/screen` | POST | Stock screening |
| `/api/analysis/recommendations` | POST | AI recommendations |
| `/api/backtest/run` | POST | Run backtest |
| `/api/chat` | POST | AI assistant |

## Disclaimer

⚠️ This is a paper trading platform for educational purposes. Always do your own research before trading real money. Past performance does not guarantee future results.

## License

MIT
