/**
 * PLT Scorer — analyzes any text and scores it along Profit·Love·Tax.
 *
 * Profit = multiply, build, earn (extroverted creation)
 * Love   = connect, nurture, share (heart/relating)
 * Tax    = balance, audit, structure (mind/governance)
 *
 * Every action in the soul gets a PLT score. These scores persist
 * and accumulate. The soul's PLT state is its measure of growth.
 */

const PROFIT_WORDS = [
  'profit', 'earn', 'money', 'revenue', 'sell', 'sale', 'grow', 'growth',
  'multiply', 'build', 'create', 'value', 'efficiency', 'wealth', 'gold',
  'income', 'invest', 'return', 'gain', 'produce', 'output', 'scale',
  'asset', 'capital', 'trade', 'market', 'business', 'product', 'service',
  'customer', 'lead', 'convert', 'optimize', 'automate', 'generate',
  // PLT Doctrine — Architect, Builder, Master, calculation, deal
  'architect', 'builder', 'master', 'calculation', 'deal', 'stiforp', 'mirror'
];

const LOVE_WORDS = [
  'love', 'connect', 'help', 'share', 'care', 'nurture', 'bond',
  'relationship', 'community', 'support', 'empathy', 'kind', 'trust',
  'collaborate', 'team', 'together', 'give', 'donate', 'mentor',
  'teach', 'guide', 'heal', 'listen', 'understand', 'forgive',
  'thank', 'grateful', 'compassion', 'friend', 'family', 'belong',
  // PLT Doctrine — Pope, Brasi, frequency, the saying
  'pope', 'brasi', 'frequency', 'saying', 'albany', 'evol', 'boardroom'
];

const TAX_WORDS = [
  'tax', 'balance', 'audit', 'check', 'verify', 'assess', 'cost',
  'price', 'fee', 'review', 'analyze', 'measure', 'weight', 'assess',
  'evaluate', 'audit', 'account', 'ledger', 'book', 'record', 'track',
  'report', 'compliance', 'rule', 'law', 'regulation', 'standard',
  'quality', 'control', 'govern', 'structure', 'process', 'system',
  // PLT Doctrine — archetype, doctrine, ledger, scorer, economy
  'archetype', 'doctrine', 'ledger', 'scorer', 'economy', 'calculation',
  'checkpoint', 'compensate', 'saga', 'journal'
];

function scoreText(text) {
  if (!text) return { profit: 0, love: 0, tax: 0 };

  const lower = text.toLowerCase();
  const tokens = lower.split(/\s+/);
  const total = tokens.length || 1;

  let profit = 0, love = 0, tax = 0;

  for (const word of tokens) {
    const clean = word.replace(/[^a-z]/g, '');
    if (PROFIT_WORDS.includes(clean)) profit++;
    if (LOVE_WORDS.includes(clean)) love++;
    if (TAX_WORDS.includes(clean)) tax++;
  }

  // Normalize to 0-1 range, cap at 1
  return {
    profit: Math.min(profit / Math.max(1, Math.sqrt(total) * 0.5), 1),
    love: Math.min(love / Math.max(1, Math.sqrt(total) * 0.5), 1),
    tax: Math.min(tax / Math.max(1, Math.sqrt(total) * 0.5), 1)
  };
}

function scoreSkill(skill) {
  const text = `${skill.name || ''} ${skill.description || ''}`;
  const base = scoreText(text);
  // Boost the dominant PLT by 0.1 based on category
  if (skill.category === 'core') base.profit = Math.min(base.profit + 0.1, 1);
  if (skill.category === 'integration') base.love = Math.min(base.love + 0.1, 1);
  if (skill.category === 'utility') base.tax = Math.min(base.tax + 0.1, 1);
  return base;
}

function scoreMessage(message) {
  if (!message || !message.text) return { profit: 0, love: 0, tax: 0 };
  const base = scoreText(message.text);
  // Boost by role
  if (message.role === 'user') base.love = Math.min(base.love + 0.05, 1);
  if (message.role === 'model' || message.role === 'gsk') base.profit = Math.min(base.profit + 0.05, 1);
  if (message.role === 'system') base.tax = Math.min(base.tax + 0.05, 1);
  return base;
}

function combine(...scores) {
  const result = { profit: 0, love: 0, tax: 0, count: 0 };
  for (const s of scores) {
    if (!s) continue;
    result.profit += s.profit || 0;
    result.love += s.love || 0;
    result.tax += s.tax || 0;
    result.count++;
  }
  if (result.count > 0) {
    result.profit = Math.min(result.profit / result.count, 1);
    result.love = Math.min(result.love / result.count, 1);
    result.tax = Math.min(result.tax / result.count, 1);
  }
  result.soul = (result.profit + result.love + result.tax) / 3;
  return result;
}

function format(scores) {
  const p = (scores.profit * 100).toFixed(0);
  const l = (scores.love * 100).toFixed(0);
  const t = (scores.tax * 100).toFixed(0);
  const soul = scores.soul !== undefined ? (scores.soul * 100).toFixed(0) : (((scores.profit + scores.love + scores.tax) / 3) * 100).toFixed(0);
  return `P:${p} L:${l} T:${t} = ${soul}`;
}

module.exports = { scoreText, scoreSkill, scoreMessage, combine, format };
