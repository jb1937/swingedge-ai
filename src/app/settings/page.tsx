// src/app/settings/page.tsx
//
// Automation settings page. Values here are informational — they map to
// environment variables that must be set in the Vercel dashboard or .env.local.
// The page provides a clear reference so operators know which vars to set.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function EnvRow({ name, description, defaultVal, danger }: {
  name: string;
  description: string;
  defaultVal: string;
  danger?: boolean;
}) {
  const value = process.env[name];
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-800 last:border-0">
      <div className="flex-1 pr-4">
        <code className="text-sm font-mono text-blue-400">{name}</code>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        <p className="text-xs text-gray-600 mt-0.5">Default: <span className="text-gray-500">{defaultVal}</span></p>
      </div>
      <Badge
        variant="outline"
        className={`text-xs shrink-0 ${
          value
            ? danger && value === 'true'
              ? 'bg-orange-900 text-orange-300 border-orange-700'
              : 'bg-green-900 text-green-300 border-green-700'
            : 'bg-gray-800 text-gray-500 border-gray-700'
        }`}
      >
        {value ?? 'not set'}
      </Badge>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Automation configuration — set these as environment variables in Vercel or .env.local
        </p>
      </div>

      {/* Auto-Trading */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Trading</CardTitle>
          <CardDescription>
            Controls the 9:35 AM ET automated order placement cron job
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnvRow
            name="AUTO_TRADE_ENABLED"
            description="Master on/off switch for automated order placement. Set to 'true' to enable."
            defaultVal="false (disabled)"
            danger
          />
          <EnvRow
            name="AUTO_TRADE_MIN_QUALITY"
            description="Minimum trade quality required for auto-placement. Options: excellent, good"
            defaultVal="excellent"
          />
          <EnvRow
            name="AUTO_TRADE_MAX_POSITIONS"
            description="Maximum number of concurrent open positions the bot will hold."
            defaultVal="5"
          />
          <EnvRow
            name="AUTO_TRADE_MAX_DAILY_ORDERS"
            description="Maximum number of new bracket orders placed per day."
            defaultVal="3"
          />
        </CardContent>
      </Card>

      {/* Market Regime & Risk */}
      <Card>
        <CardHeader>
          <CardTitle>Market Regime &amp; Risk</CardTitle>
          <CardDescription>
            Controls how the system responds to adverse market conditions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnvRow
            name="EOD_CANCEL_UNFILLED_BUYS"
            description="If true, the 3:55 PM ET cron cancels unfilled limit buy orders so they don't fill tomorrow at stale prices."
            defaultVal="true"
          />
          <EnvRow
            name="CRON_SECRET"
            description="Secret token used to authenticate Vercel cron calls. Set to any random string. Vercel sends this as 'Authorization: Bearer <CRON_SECRET>'."
            defaultVal="(none — set this in production)"
          />
        </CardContent>
      </Card>

      {/* Cron Schedule Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Cron Schedule Reference</CardTitle>
          <CardDescription>vercel.json — all times in UTC (ET = UTC-5 in winter, UTC-4 in summer)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {[
              { path: '/api/cron/daily-scan',      schedule: '30 13 * * 1-5', et: '8:30 AM ET',  desc: 'Pre-market screener — finds top setups' },
              { path: '/api/cron/auto-trade',       schedule: '35 14 * * 1-5', et: '9:35 AM ET',  desc: 'Automated order placement (if enabled)' },
              { path: '/api/cron/position-monitor', schedule: '*/30 14-21 * * 1-5', et: 'Every 30 min', desc: 'Trailing stop management' },
              { path: '/api/cron/eod-cleanup',      schedule: '55 20 * * 1-5', et: '3:55 PM ET', desc: 'Cancel unfilled limit buy orders' },
            ].map((row) => (
              <div key={row.path} className="p-3 bg-gray-900 rounded-lg border border-gray-800">
                <div className="flex items-center justify-between">
                  <code className="text-blue-400 text-xs">{row.path}</code>
                  <span className="text-xs text-gray-400">{row.et}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{row.desc}</p>
                <code className="text-xs text-gray-600 mt-1 block">{row.schedule}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Manual Triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Triggers</CardTitle>
          <CardDescription>
            Invoke cron jobs manually by calling these GET endpoints (requires CRON_SECRET header in production)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs font-mono text-gray-400">
            <p>GET /api/cron/daily-scan</p>
            <p>GET /api/cron/auto-trade</p>
            <p>GET /api/cron/position-monitor</p>
            <p>GET /api/cron/eod-cleanup</p>
            <p>GET /api/cron/opportunities  <span className="text-gray-600">(read-only — view cached results)</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
