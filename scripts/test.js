const BASE_URL = 'https://api.mnstr.xyz';
const PRICE_URL = `${BASE_URL}/gacha/prices`;

async function calculateExpectedValue(tier) {
  const CARD_URL = `${BASE_URL}/gacha/chase-cards?tier=${tier}`;

  // Fetch data from APIs
  const [pricesResponse, cardsResponse] = await Promise.all([
    fetch(PRICE_URL),
    fetch(CARD_URL)
  ]);

  const prices = await pricesResponse.json();
  const payload = await cardsResponse.json();

  const cards = payload.data;
  const costOfPack = Number(prices.data[tier].priceUsd);

  // --- Helper: figure out how probabilities are encoded ---
  let rawProbSum = cards.reduce((sum, card) => sum + Number(card.probability), 0);

  // Decide how to scale probabilities:
  // - If they sum to ~1, treat as true probabilities.
  // - If they sum to ~100, treat as percentages.
  // - Otherwise, normalize them so they sum to 1.
  let probScale;
  if (Math.abs(rawProbSum - 1) < 1e-6) {
    probScale = 1;          // already proper probabilities
  } else if (Math.abs(rawProbSum - 100) < 1e-2) {
    probScale = 1 / 100;    // percentages
  } else {
    probScale = 1 / rawProbSum; // arbitrary scale; normalize
  }

  // --- Compute expected value of a random card ---
  const expectedCardValue = cards.reduce((sum, card) => {
    const p = Number(card.probability) * probScale;
    const value = Number(card.fmv);
    return sum + p * value;
  }, 0);

  // --- Compute median card value (weighted by probability) ---
  const sortedCards = [...cards].sort((a, b) => Number(a.fmv) - Number(b.fmv));
  let cumulativeProb = 0;
  let medianCardValue = 0;
  for (const card of sortedCards) {
    cumulativeProb += Number(card.probability) * probScale;
    if (cumulativeProb >= 0.5) {
      medianCardValue = Number(card.fmv);
      break;
    }
  }

  // --- Compute odds of pulling a card worth more than pack cost ---
  const oddsOverCost = cards.reduce((sum, card) => {
    if (Number(card.fmv) >= costOfPack) {
      return sum + Number(card.probability) * probScale;
    }
    return sum;
  }, 0);
  const oddsOverCostPercent = oddsOverCost * 100;

  // Expected profit after paying for the pack
  const expectedProfit = expectedCardValue - costOfPack;
  const evPercent = (expectedCardValue / costOfPack) * 100;
  const profitPercent = (expectedProfit / costOfPack) * 100;

  console.log(`\n=== ${tier} Pack ===`);
  console.log("Expected card value:", expectedCardValue.toFixed(2));
  console.log("Median card value:", medianCardValue.toFixed(2));
  console.log("Cost of pack:", costOfPack.toFixed(2));
  console.log("Expected profit (value - cost):", expectedProfit.toFixed(2));
  console.log(`EV: ${evPercent.toFixed(2)}% | Profit: ${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%`);
  console.log(`Odds of pulling card >= pack cost: ${oddsOverCostPercent.toFixed(2)}%`);

  return { tier, expectedCardValue, medianCardValue, costOfPack, expectedProfit, evPercent, profitPercent, oddsOverCostPercent };
}

// Run for both tiers
async function main() {
  await calculateExpectedValue('Starter');
  await calculateExpectedValue('Premium');
}

main().catch(console.error);
