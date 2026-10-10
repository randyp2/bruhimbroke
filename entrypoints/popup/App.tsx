import { useEffect, useState } from 'react';
import './App.css';
import { ShoppingHome } from './ShoppingHome';

type FinancialSituation = 'raise' | 'new-job' | 'improved' | 'no-change';

interface OnboardingData {
  situation: FinancialSituation;
  monthlyIncomeIncrease: number | null;
  trackingEnabled: boolean;
}

interface ChromeStorageArea {
  get(keys: string, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback: () => void): void;
}

interface ChromeExtensionApi {
  storage: { local: ChromeStorageArea };
  runtime: { lastError?: { message?: string } };
}

const STORAGE_KEY = 'onboarding';
const extensionChrome = (globalThis as typeof globalThis & { chrome: ChromeExtensionApi }).chrome;

function App() {
  const [onboarding, setOnboarding] = useState<OnboardingData | null | undefined>();

  useEffect(() => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) setOnboarding(null);
    }, 1000);

    extensionChrome.storage.local.get(STORAGE_KEY, (stored) => {
      settled = true;
      window.clearTimeout(timeout);
      if (extensionChrome.runtime.lastError) {
        setOnboarding(null);
        return;
      }
      // An absent record means first-time setup, not an unfinished storage read.
      setOnboarding((stored[STORAGE_KEY] as OnboardingData | undefined) ?? null);
    });

    return () => window.clearTimeout(timeout);
  }, []);

  if (onboarding === undefined) {
    return <main className="app-shell loading" aria-label="Loading BruhImBroke"><div className="loading-mark">$</div><p>Checking your financial situation...</p></main>;
  }

  return onboarding ? <ShoppingHome /> : <Onboarding onComplete={setOnboarding} />;
}

function Onboarding({ onComplete }: { onComplete: (data: OnboardingData) => void }) {
  const [step, setStep] = useState(1);
  const [situation, setSituation] = useState<FinancialSituation | null>(null);
  const [monthlyIncomeIncrease, setMonthlyIncomeIncrease] = useState('');
  const [trackingEnabled, setTrackingEnabled] = useState(true);

  const finish = async (tracking = trackingEnabled) => {
    if (!situation) return;

    const data: OnboardingData = {
      situation,
      monthlyIncomeIncrease: monthlyIncomeIncrease ? Number(monthlyIncomeIncrease) : null,
      trackingEnabled: tracking,
    };
    await new Promise<void>((resolve, reject) => {
      extensionChrome.storage.local.set({ [STORAGE_KEY]: data }, () => {
        const error = extensionChrome.runtime.lastError;
        if (error) reject(error);
        else resolve();
      });
    });
    onComplete(data);
  };

  return (
    <main className="app-shell onboarding-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">$</div>
        <div>
          <p className="eyebrow">Financial intervention unit</p>
          <h1>BruhImBroke</h1>
        </div>
      </header>

      <div className="progress" aria-label={`Onboarding step ${step} of 3`}>
        {[1, 2, 3].map((item) => <span className={item <= step ? 'active' : ''} key={item} />)}
      </div>

      {step === 1 && (
        <section className="onboarding-card" aria-labelledby="step-one-title">
          <div className="onboarding-emoji" aria-hidden="true">🤑</div>
          <p className="eyebrow warning">STEP 1 OF 3</p>
          <h2 id="step-one-title">Did your money situation change?</h2>
          <p className="message">No judgment. We just need enough context to make the jokes land.</p>
          <div className="choice-list">
            <Choice label="I got a raise" selected={situation === 'raise'} onClick={() => setSituation('raise')} />
            <Choice label="I started a better-paying job" selected={situation === 'new-job'} onClick={() => setSituation('new-job')} />
            <Choice label="Things generally improved" selected={situation === 'improved'} onClick={() => setSituation('improved')} />
            <Choice label="No major change" selected={situation === 'no-change'} onClick={() => setSituation('no-change')} />
          </div>
          <button className="primary" type="button" disabled={!situation} onClick={() => setStep(2)}>Continue</button>
        </section>
      )}

      {step === 2 && (
        <section className="onboarding-card" aria-labelledby="step-two-title">
          <div className="onboarding-emoji" aria-hidden="true">💸</div>
          <p className="eyebrow warning">STEP 2 OF 3</p>
          <h2 id="step-two-title">How much did your monthly take-home income increase?</h2>
          <p className="message">Optional. A rough number is plenty. We do not need your salary, bank login, or tax returns.</p>
          <label className="money-input">
            <span>$</span>
            <input type="number" min="0" step="1" inputMode="numeric" placeholder="800" value={monthlyIncomeIncrease} onChange={(event) => setMonthlyIncomeIncrease(event.target.value)} aria-label="Monthly take-home income increase" />
            <small>per month</small>
          </label>
          <div className="actions step-actions">
            <button className="primary" type="button" onClick={() => setStep(3)}>Continue</button>
            <button className="secondary" type="button" onClick={() => { setMonthlyIncomeIncrease(''); setStep(3); }}>Skip for now</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="onboarding-card" aria-labelledby="step-three-title">
          <div className="onboarding-emoji" aria-hidden="true">🧾</div>
          <p className="eyebrow warning">STEP 3 OF 3</p>
          <h2 id="step-three-title">Want help spotting the pattern?</h2>
          <p className="message">Your final “Log my purchase” confirmation saves a purchase immediately, even before checkout finishes. If you change your mind, edit or delete it in Shopping history. Everything stays on this device.</p>
          <button className={`tracking-choice ${trackingEnabled ? 'selected' : ''}`} type="button" aria-pressed={trackingEnabled} onClick={() => setTrackingEnabled((enabled) => !enabled)}>
            <span className="choice-icon">✓</span>
            <span><strong>Save shopping history</strong><small>Log purchases on your final confirmation</small></span>
            <span className="choice-check">{trackingEnabled ? 'ON' : 'OFF'}</span>
          </button>
          <div className="actions step-actions">
            <button className="primary" type="button" onClick={() => void finish()}>Finish setup</button>
            <button className="secondary" type="button" onClick={() => void finish(false)}>Skip tracking</button>
          </div>
        </section>
      )}

      <p className="privacy-note">🔒 Stored locally in Chrome</p>
    </main>
  );
}

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <button className={`choice ${selected ? 'selected' : ''}`} type="button" aria-pressed={selected} onClick={onClick}><span>{label}</span><span className="choice-check">{selected ? '✓' : ''}</span></button>;
}

export default App;
