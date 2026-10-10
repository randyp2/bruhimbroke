import { useState } from 'react';
import './App.css';

function App() {
  const [demoMode, setDemoMode] = useState(true);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">$</div>
        <div>
          <p className="eyebrow">Financial intervention unit</p>
          <h1>BruhImBroke</h1>
        </div>
        <span className="status-dot" title="BruhImBroke is active" />
      </header>

      <section className="intervention" aria-labelledby="intervention-title">
        <div className="wallet" aria-hidden="true">👛</div>
        <p className="eyebrow warning">INCOMING PURCHASE</p>
        <h2 id="intervention-title">Hold on. We need to talk.</h2>
        <p className="message">You are really about to spend <strong>$140</strong> on headphones? Your bank account has requested an emergency meeting.</p>
        <div className="insight">
          <span>Monthly shopping so far</span>
          <strong>$870</strong>
          <small>Demo insight: that is 89% of your imaginary raise.</small>
        </div>
        <div className="actions">
          <button className="primary" type="button">Okay, I’ll think about it</button>
          <button className="secondary" type="button">I’m buying it anyway</button>
        </div>
      </section>

      <footer className="footer-row">
        <span>Demo mode</span>
        <button className={`toggle ${demoMode ? 'on' : ''}`} type="button" aria-pressed={demoMode} onClick={() => setDemoMode((enabled) => !enabled)}>
          <span />
        </button>
        <span className="privacy">Local only</span>
      </footer>
    </main>
  );
}

export default App;
