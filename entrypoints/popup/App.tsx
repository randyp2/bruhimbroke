import { useEffect, useState } from 'react';
import './App.css';
import { ShoppingHome } from './ShoppingHome';
import { SiteAccess } from './SiteAccess';
import { Professor } from '../../components/Professor';
import { onboardingLines } from '../../lib/professorLines';
import type { ComparisonType } from '../../lib/metrics';

type FinancialSituation = 'raise' | 'new-job' | 'improved' | 'no-change';

interface OnboardingData {
  situation: FinancialSituation;
  monthlyIncomeIncrease: number | null;
  monthlyShoppingBudget: number | null;
  comparisonType: ComparisonType;
  trackingEnabled: boolean;
}

/** Unfinished setup stays separate from the preferences used by shopping checks. */
interface OnboardingDraft {
  step: 1 | 2 | 3;
  situation: FinancialSituation | null;
  monthlyIncomeIncrease: string;
  monthlyShoppingBudget: string;
  comparisonType: ComparisonType;
  trackingEnabled: boolean;
}

const emptyDraft: OnboardingDraft = { step: 1, situation: null, monthlyIncomeIncrease: '', monthlyShoppingBudget: '', comparisonType: 'income-increase', trackingEnabled: true };

/** Reject malformed drafts and steps that would bypass the required situation choice. */
function readDraft(value: unknown): OnboardingDraft {
  if (!value || typeof value !== 'object') return emptyDraft;
  const draft = value as Record<string, unknown>;
  const validSituation = typeof draft.situation === 'string' && ['raise', 'new-job', 'improved', 'no-change'].includes(draft.situation);
  if (typeof draft.step !== 'number' || ![1, 2, 3].includes(draft.step)
    || !(validSituation || (draft.step === 1 && draft.situation === null))
    || typeof draft.monthlyIncomeIncrease !== 'string'
    || typeof draft.trackingEnabled !== 'boolean') return emptyDraft;
  const comparisonType: ComparisonType = draft.comparisonType === 'shopping-budget' || (!draft.comparisonType && draft.situation === 'no-change') ? 'shopping-budget' : 'income-increase';
  return { ...emptyDraft, ...draft, monthlyShoppingBudget: typeof draft.monthlyShoppingBudget === 'string' ? draft.monthlyShoppingBudget : '', comparisonType } as OnboardingDraft;
}

interface ChromeStorageArea {
  get(keys: string[], callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback: () => void): void;
}

interface ChromeExtensionApi {
  storage: { local: ChromeStorageArea };
  runtime: { lastError?: { message?: string } };
}

const STORAGE_KEY = 'onboarding';
const DRAFT_KEY = 'onboardingDraft';
const extensionChrome = (globalThis as typeof globalThis & { chrome: ChromeExtensionApi }).chrome;

function App() {
  const [onboarding, setOnboarding] = useState<OnboardingData | null | undefined>();
  const [draft, setDraft] = useState(emptyDraft);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) setLoadError(true);
    }, 1000);

    extensionChrome.storage.local.get([STORAGE_KEY, DRAFT_KEY], (stored) => {
      if (settled) return;
      window.clearTimeout(timeout);
      if (extensionChrome.runtime.lastError) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      setDraft(readDraft(stored[DRAFT_KEY]));
      // An absent record means first-time setup, not an unfinished storage read.
      setOnboarding((stored[STORAGE_KEY] as OnboardingData | undefined) ?? null);
    });

    return () => { settled = true; window.clearTimeout(timeout); };
  }, [revision]);

  if (loadError) {
    return <main className="home-shell loading"><p role="alert">Couldn’t load your saved setup.</p><button className="history-button" onClick={() => { setLoadError(false); setRevision((value) => value + 1); }}>Retry</button></main>;
  }

  if (onboarding === undefined) {
    return <main className="home-shell loading" aria-label="Loading BruhImBroke"><div className="loading-mark">$</div><p>Loading...</p></main>;
  }

  return onboarding ? <ShoppingHome /> : <Onboarding initialDraft={draft} onComplete={setOnboarding} />;
}

function Onboarding({ initialDraft, onComplete }: { initialDraft: OnboardingDraft; onComplete: (data: OnboardingData) => void }) {
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const { step, situation, monthlyIncomeIncrease, monthlyShoppingBudget, comparisonType, trackingEnabled } = draft;

  useEffect(() => {
    let active = true;
    extensionChrome.storage.local.set({ [DRAFT_KEY]: draft }, () => {
      const failed = Boolean(extensionChrome.runtime.lastError);
      if (!active) return;
      setSaveError(failed);
      setSaving(false);
    });
    return () => { active = false; };
  }, [draft]);

  const updateDraft = (changes: Partial<OnboardingDraft>) => {
    setSaving(true);
    setSaveError(false);
    setDraft((current) => ({ ...current, ...changes }));
  };

  const finish = (tracking = trackingEnabled) => {
    if (!situation || saving || saveError) return;
    setSaving(true);

    const data: OnboardingData = {
      situation,
      monthlyIncomeIncrease: monthlyIncomeIncrease ? Number(monthlyIncomeIncrease) : null,
      monthlyShoppingBudget: monthlyShoppingBudget ? Number(monthlyShoppingBudget) : null,
      comparisonType,
      trackingEnabled: tracking,
    };
    // Commit completion and clear the draft together, never before the save succeeds.
    extensionChrome.storage.local.set({ [STORAGE_KEY]: data, [DRAFT_KEY]: null }, () => {
      if (extensionChrome.runtime.lastError) {
        setSaveError(true);
        setSaving(false);
        return;
      }
      onComplete(data);
    });
  };

  return (
    <main className="home-shell onboarding-shell">
      <header className="home-header">
        <h1>BruhImBroke<span aria-hidden="true">.</span></h1>
        <div className="onboarding-progress" aria-label={`Onboarding step ${step} of 3`}>
          <span>{step} / 3</span>
          <div aria-hidden="true">{[1, 2, 3].map((item) => <span className={item <= step ? 'active' : ''} key={item} />)}</div>
        </div>
      </header>

      <Professor mood="happy" dialogue={onboardingLines[step]} />

      <div className="onboarding-panel">
        {step === 1 && (
          <section aria-labelledby="step-one-title">
            <h2 id="step-one-title">Any money news?</h2>
            <div className="choice-list">
              <Choice label="Got a raise" selected={situation === 'raise'} onClick={() => updateDraft({ situation: 'raise', comparisonType: 'income-increase' })} />
              <Choice label="New, better-paying job" selected={situation === 'new-job'} onClick={() => updateDraft({ situation: 'new-job', comparisonType: 'income-increase' })} />
              <Choice label="Things improved" selected={situation === 'improved'} onClick={() => updateDraft({ situation: 'improved', comparisonType: 'income-increase' })} />
              <Choice label="No major change" selected={situation === 'no-change'} onClick={() => updateDraft({ situation: 'no-change', comparisonType: 'shopping-budget' })} />
            </div>
            <button className="primary" type="button" disabled={!situation || saving || saveError} onClick={() => updateDraft({ step: 2 })}>Continue</button>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="step-two-title">
            <h2 id="step-two-title">Choose your comparison.</h2>
            <div className="choice-list comparison-choices">
              <Choice label="I have an income increase" selected={comparisonType === 'income-increase'} onClick={() => updateDraft({ comparisonType: 'income-increase' })} />
              <Choice label="No raise yet" selected={comparisonType === 'shopping-budget'} onClick={() => updateDraft({ comparisonType: 'shopping-budget' })} />
            </div>
            <p className="onboarding-caption">{comparisonType === 'income-increase' ? 'Your monthly take-home increase. Optional.' : 'Set a monthly shopping amount to compare against. Optional.'}</p>
            <label className="money-input">
              <span>$</span>
              <input type="number" min="0" step="0.01" inputMode="decimal" placeholder={comparisonType === 'income-increase' ? '800' : '300'} value={comparisonType === 'income-increase' ? monthlyIncomeIncrease : monthlyShoppingBudget} onChange={(event) => updateDraft(comparisonType === 'income-increase' ? { monthlyIncomeIncrease: event.target.value } : { monthlyShoppingBudget: event.target.value })} aria-label={comparisonType === 'income-increase' ? 'Monthly take-home income increase' : 'Monthly shopping target'} />
              <small>USD / month</small>
            </label>
            <div className="actions step-actions">
              <button className="primary" type="button" disabled={saving || saveError} onClick={() => updateDraft({ step: 3 })}>Continue</button>
              <button className="secondary" type="button" disabled={saving || saveError} onClick={() => updateDraft(comparisonType === 'income-increase' ? { monthlyIncomeIncrease: '', step: 3 } : { monthlyShoppingBudget: '', step: 3 })}>Skip for now</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="onboarding-final" aria-labelledby="step-three-title">
            <h2 id="step-three-title">Your call.</h2>
            <button className={`tracking-choice ${trackingEnabled ? 'selected' : ''}`} type="button" aria-pressed={trackingEnabled} disabled={saving} onClick={() => updateDraft({ trackingEnabled: !trackingEnabled })}>
              <span><strong>Save shopping history</strong><small>Log purchases on your final confirmation</small></span>
              <span className="choice-check">{trackingEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <p className="onboarding-caption">Saved before checkout completes. Edit or delete anytime.</p>
            {!saving && !saveError && <SiteAccess onboarding />}
            <div className="actions step-actions">
              <button className="primary" type="button" disabled={saving || saveError} onClick={() => finish()}>Finish setup</button>
              <button className="secondary" type="button" disabled={saving || saveError} onClick={() => finish(false)}>Skip tracking</button>
            </div>
          </section>
        )}

        {saveError && <div role="alert"><p className="error">Couldn’t save setup. Keep this popup open and retry.</p><button className="history-button" onClick={() => updateDraft({})}>Retry save</button></div>}
        <p className="privacy-note">Stored only in your browser.</p>
      </div>
    </main>
  );
}

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <button className={`choice ${selected ? 'selected' : ''}`} type="button" aria-pressed={selected} onClick={onClick}><span>{label}</span><span className="choice-check">{selected ? '✓' : ''}</span></button>;
}

export default App;
