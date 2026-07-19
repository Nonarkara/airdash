// Configure the AirDash Telegram bot (Air / @AirDash_bot).
//
// Setup (operator, once):
//   1. Create the bot via @BotFather in Telegram, save the token.
//   2. node scripts/set-telegram-token.mjs <bot_token>
//      The script verifies the token, stores it in DB kv, sets the
//      command list, and registers the webhook URL on the bot.
//
// The token is stored in the DB kv table. It is NEVER printed and
// NEVER returned by the admin GET endpoint — only a masked suffix.
//
// Webhook URL: defaults to https://api-air.nonarkara.org/api/telegram/webhook
// Override with: node scripts/set-telegram-token.mjs <token> <webhook_url>
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const DEFAULT_WEBHOOK = 'https://api-air.nonarkara.org/api/telegram/webhook'
const argv = process.argv.slice(2)
if (!argv.length || argv[0] === '-h' || argv[0] === '--help') {
  console.log('usage:')
  console.log(`  node scripts/set-telegram-token.mjs <bot_token> [webhook_url]`)
  console.log(`  default webhook: ${DEFAULT_WEBHOOK}`)
  process.exit(2)
}

const token = argv[0].trim()
const webhookUrl = (argv[1] ?? DEFAULT_WEBHOOK).trim()
if (token.length < 20 || !token.includes(':')) {
  console.error('bot_token looks wrong (expected "<digits>:<alnum>", ≥20 chars).')
  process.exit(2)
}

const { openDb } = await import('../server/db.js')
const { createTelegram } = await import('../server/telegram.js')
const db = openDb()
const tg = createTelegram(db)

// 1. Store the token FIRST so the probe + register + setCommands
//    helpers can read it via db.kvGet('telegram_bot_token').
db.kvSet('telegram_bot_token', token)
db.kvSet('telegram_webhook_url', webhookUrl)
console.log(`✓ Token stored; webhook URL saved → ${webhookUrl}`)

// 2. Probe
console.log('1) Probing bot...')
const info = await tg.canPush()
if (!info) {
  console.error('✗ getMe failed — token rejected by Telegram.')
  console.error('  The token is stored in the DB but the bot is not reachable.')
  process.exit(1)
}
console.log(`✓ Bot: ${info.first_name} (@${info.username}, id=${info.id})`)

// 3. Register webhook
console.log('2) Registering webhook...')
try {
  const wh = await tg.registerWebhook(webhookUrl)
  console.log(`✓ Webhook set: ok=${wh?.ok ?? '?'} (description: ${wh?.description ?? '—'})`)
} catch (err) {
  console.error(`✗ setWebhook failed: ${err?.message ?? err}`)
  console.error('  The token is stored; webhook will be retried on the next POST /api/admin/telegram-config call.')
}

// 4. Set commands
console.log('3) Setting command list...')
await tg.setCommands([
  { command: 'start', description: 'Start receiving dust alerts for my province' },
  { command: 'stop', description: 'Unsubscribe from dust alerts' },
  { command: 'status', description: 'Check my current subscription' },
  { command: 'language', description: 'Switch message language (ไทย/EN)' },
  { command: 'province', description: 'Change the province I follow' },
  { command: 'help', description: 'Show what Air can do' },
])
console.log('✓ Commands registered')

const status = tg.status()
console.log('  bot:', status.bot)
console.log('  has_token:', status.has_token)
