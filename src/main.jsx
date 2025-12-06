import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Chart from 'chart.js/auto';
import { Analytics } from "@vercel/analytics/react"

const BASE_URL = 'https://api.mnstr.xyz';
const PRICE_URL = `${BASE_URL}/gacha/prices`;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const probabilityScale = (cards) => {
  const rawSum = cards.reduce((sum, card) => sum + Number(card.probability), 0);
  if (Math.abs(rawSum - 1) < 1e-6) return 1;
  if (Math.abs(rawSum - 100) < 1e-2) return 0.01;
  return 1 / rawSum;
};

const computeMetrics = (cards, priceUsd) => {
  const costOfPack = Number(priceUsd);
  const scale = probabilityScale(cards);

  const expectedValue = cards.reduce((sum, card) => {
    const p = Number(card.probability) * scale;
    const value = Number(card.fmv);
    return sum + p * value;
  }, 0);

  const sorted = [...cards].sort((a, b) => Number(a.fmv) - Number(b.fmv));
  let cumulative = 0;
  let medianValue = 0;
  for (const card of sorted) {
    cumulative += Number(card.probability) * scale;
    if (cumulative >= 0.5) {
      medianValue = Number(card.fmv);
      break;
    }
  }

  const oddsOverCost = cards.reduce((sum, card) => {
    if (Number(card.fmv) >= costOfPack) {
      return sum + Number(card.probability) * scale;
    }
    return sum;
  }, 0) * 100;

  const profit = expectedValue - costOfPack;
  const evPercent = (expectedValue / costOfPack) * 100;
  const profitPercent = (profit / costOfPack) * 100;
  const medianPercent = ((medianValue - costOfPack) / costOfPack) * 100;

  return {
    expectedValue,
    medianValue,
    oddsOverCost,
    costOfPack,
    profit,
    evPercent,
    profitPercent,
    medianPercent,
    probScale: scale
  };
};

const buildProfitCurve = (cards, priceUsd, scale) => {
  const sorted = [...cards].sort((a, b) => Number(a.fmv) - Number(b.fmv));
  let tailProb = sorted.reduce((sum, card) => sum + Number(card.probability) * scale, 0);
  return sorted.map(card => {
    const value = Math.max(Number(card.fmv), 0.01);
    const profitPct = ((value - priceUsd) / priceUsd) * 100;
    const y = tailProb * 100;
    tailProb -= Number(card.probability) * scale;
    return { x: value, y, profitPct };
  });
};

const usePersistentTheme = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark');
  return { theme, toggleTheme };
};

const ChartBox = ({ id, curve }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !curve?.length) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Odds of pulling ≥ value',
          data: curve.map(pt => ({ x: pt.x, y: pt.y })),
          borderColor: 'rgba(13, 17, 28, 0.7)',
          backgroundColor: 'rgba(246, 201, 14, 0.35)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#f6c90e',
          pointBorderColor: '#0d111c'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 24 } },
        scales: {
          x: {
            type: 'logarithmic',
            title: { display: true, text: 'Card FMV ($, log scale)' },
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--subtext'),
              callback: val => currency.format(val)
            }
          },
          y: {
            beginAtZero: true,
            suggestedMax: 120,
            title: { display: true, text: 'Probability (%)' },
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--subtext'),
              callback: val => val > 100 ? '' : val
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const val = currency.format(ctx.parsed.x);
                const prob = percent.format(ctx.parsed.y);
                return `${prob}% odds of pulling ≥ ${val}`;
              }
            }
          },
          decimation: { enabled: false }
        }
      }
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [curve]);

  return (
    <div className="chart-box">
      <h3>EV curve</h3>
      <canvas id={id} ref={canvasRef}></canvas>
    </div>
  );
};

const TierSection = ({ tierName, cards, metrics, curve }) => {
  const canvasId = `chart-${tierName.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <section className="tier">
      <div className="tier-head">
        <h2>{tierName} Pack</h2>
        <div className="actions" style={{ margin: 0, gap: 8 }}>
          <span className="pill price">Pack price {currency.format(metrics.costOfPack)}</span>
          <span className="pill">{cards.length} available cards</span>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <label>Expected Value</label>
          <div className="ev-row">
            <strong>{currency.format(metrics.expectedValue)}</strong>
            <span className={`profit-chip ${metrics.profitPercent >= 0 ? '' : 'negative'}`}>
              {metrics.profitPercent >= 0 ? '+' : ''}{percent.format(metrics.profitPercent)}%
            </span>
          </div>
          <small>Pack price {currency.format(metrics.costOfPack)}</small>
        </div>

        <div className="metric">
          <label>Median Card</label>
          <div className="ev-row">
            <strong>{currency.format(metrics.medianValue)}</strong>
            <span className={`profit-chip ${metrics.medianPercent >= 0 ? '' : 'negative'}`}>
              {metrics.medianPercent >= 0 ? '+' : ''}{percent.format(metrics.medianPercent)}%
            </span>
          </div>
          <small>50% of pulls at least this value</small>
        </div>

        <div className="metric">
          <label>Profit Odds</label>
          <strong>{percent.format(metrics.oddsOverCost)}%</strong>
          <small>Chance pull ≥ pack cost</small>
        </div>
      </div>

      {cards.length ? (
        <>
          <details className="card-toggle">
            <summary>
              <span>Show cards ({cards.length})</span>
              <span className="chevron">⌄</span>
            </summary>
            <div className="card-table">
              <table>
                <thead>
                  <tr>
                    <th>Card</th>
                    <th>FMV</th>
                    <th>Pull %</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card, idx) => {
                    const chance = Number(card.probability) * metrics.probScale * 100;
                    const title = card.title || card.playerName || card.cardName || 'Card';
                    const setYear = [card.year, card.set].filter(Boolean).join(' · ');
                    const grading = [card.gradingCompany, card.grading].filter(Boolean).join(' ');
                    const metaPieces = [setYear, grading].filter(Boolean);
                    const imageUrl = card.image || (Array.isArray(card.images) && card.images[0]?.url) || '';
                    return (
                      <tr className="card-row" key={`${title}-${idx}`}>
                        <td>
                          <span className="card-name">{title}</span>
                          {metaPieces.length ? <span className="card-meta">{metaPieces.join(' • ')}</span> : null}
                          {imageUrl ? (
                            <div className="card-preview">
                              <img src={imageUrl} alt={title} />
                            </div>
                          ) : null}
                        </td>
                        <td className="value-cell">{currency.format(Number(card.fmv))}</td>
                        <td className="prob-cell">{percent.format(chance)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>

          <ChartBox id={canvasId} curve={curve} />
        </>
      ) : (
        <p className="empty">No card data available.</p>
      )}
    </section>
  );
};

const App = () => {
  const { theme, toggleTheme } = usePersistentTheme();
  const [tiers, setTiers] = useState([]);
  const [status, setStatus] = useState('Waiting to load…');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setStatus('Fetching current prices…');

    try {
      const priceResponse = await fetch(PRICE_URL);
      if (!priceResponse.ok) throw new Error('Failed to fetch prices');
      const priceData = await priceResponse.json();
      const tiers = Object.keys(priceData.data || {});

      const tierResults = await Promise.all(tiers.map(async (tierName) => {
        const cardUrl = `${BASE_URL}/gacha/chase-cards?tier=${encodeURIComponent(tierName)}`;
        const cardRes = await fetch(cardUrl);
        if (!cardRes.ok) throw new Error(`Failed to fetch cards for ${tierName}`);
        const payload = await cardRes.json();
        const cards = payload.data || [];
        const metrics = computeMetrics(cards, priceData.data[tierName].priceUsd);
        const curve = buildProfitCurve(cards, metrics.costOfPack, metrics.probScale);
        return { tierName, cards, metrics, curve };
      }));

      setTiers(tierResults);
      const time = new Date();
      setStatus(`Updated ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Unable to load data right now.');
      setStatus('Error loading data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="app">
      <header>
        <div className="hero">
          <div className="hero-copy">
            <h1>
              <a href="https://mnstr.xyz" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                MNSTR
              </a>{' '}Gacha Dashboard
            </h1>
            <p className="lede">
              Metrics from <a href="https://mnstr.xyz" target="_blank" rel="noreferrer" style={{ color: '#0070ff', textDecoration: 'underline' }}>mnstr.xyz</a>
            </p>
          </div>

          <div className="hero-visual">
            <div className="card-image">
              <img src="images/gambol.jpeg" alt="Featured card" />
            </div>
          </div>
          <div className="actions header-actions">
            <button onClick={loadData} disabled={loading}>
              <span className="btn-label">{loading ? 'Loading…' : 'Refresh data'}</span>
            </button>
            <button className="ghost" type="button" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <span className="status">{status}</span>
          </div>
        </div>
      </header>

      <main>
        {tiers.map(({ tierName, cards, metrics, curve }) => (
          <TierSection
            key={tierName}
            tierName={tierName}
            cards={cards}
            metrics={metrics}
            curve={curve}
          />
        ))}
      </main>

      {error ? <div className="error">{error}</div> : null}
      <Analytics />
    </div>
  );
};

createRoot(document.getElementById('root')).render(<App />);
