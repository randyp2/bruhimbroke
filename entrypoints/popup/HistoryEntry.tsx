import { useState } from 'react';
import { confirmPurchase, deleteHistory, historyDate, updateHistory } from '../../lib/purchases';
import { isPurchase, money, parseAmount } from '../../lib/shopping';
import type { Purchase, PurchaseIntent } from '../../lib/shopping';

/** Editable local record; only confirmed purchases contribute to spending totals. */
export function HistoryEntry({ intent, trackingEnabled }: { intent: PurchaseIntent | Purchase; trackingEnabled: boolean }) {
  const confirmed = isPurchase(intent);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState(intent.title);
  const [site, setSite] = useState(intent.site);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [purchased, setPurchased] = useState(confirmed);

  function edit() {
    setTitle(intent.title);
    setSite(intent.site);
    setAmount(intent.amountCents === null ? '' : (intent.amountCents / 100).toFixed(2));
    setDate(historyDate(intent));
    setPurchased(confirmed);
    setEditing(true);
    setDeleting(false);
    setError('');
  }

  async function save() {
    const amountCents = parseAmount(amount);
    if ((amount.trim() !== '' || purchased) && amountCents === null) {
      setError('Enter a valid USD amount with at most two decimals. Unconfirmed entries can have a blank amount.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateHistory({ ...intent, title, site, amountCents }, purchased, date);
      setEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save changes. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (intent.amountCents === null) {
      edit();
      setPurchased(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await confirmPurchase(intent, intent.amountCents);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not confirm this purchase. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await deleteHistory(intent);
    } catch {
      setError('Could not delete this entry. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="history-entry">
    <div className="history-entry-heading">
      <div className="history-entry-product">
        <h3 title={intent.title}>{intent.title}</h3>
        <p className="history-entry-meta">{intent.site}<span aria-hidden="true"> · </span>{confirmed || intent.recordedAt || intent.continuedAt ? <time dateTime={historyDate(intent)}>{historyDate(intent)}</time> : 'Date not recorded'}</p>
      </div>
      <strong className="history-entry-amount">{intent.amountCents === null ? 'Amount unknown' : money(intent.amountCents)}</strong>
    </div>
    {!confirmed && <p className="history-entry-status">{intent.continuedAt ? 'Unconfirmed attempt' : 'Unconfirmed reminder'}</p>}
    {editing ? <form className="history-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="history-editor-wide">Product<input required maxLength={200} disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Website or store<input required maxLength={253} disabled={busy} value={site} onChange={(event) => setSite(event.target.value)} /></label>
      <label>Amount (USD)<input inputMode="decimal" required={purchased} disabled={busy} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Date<input type="date" required disabled={busy} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Status<select disabled={busy} value={purchased ? 'purchased' : 'unconfirmed'} onChange={(event) => setPurchased(event.target.value === 'purchased')}>
        <option value="unconfirmed">Unconfirmed</option>
        <option value="purchased" disabled={!trackingEnabled && !confirmed}>Purchased</option>
      </select></label>
      <p className="history-editor-wide history-caption">Only Purchased entries count toward spending.</p>
      <div className="history-editor-wide history-entry-actions">
        <button className="history-button history-button-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
        <button className="history-button" disabled={busy} type="button" onClick={() => { setEditing(false); setError(''); }}>Cancel editing</button>
      </div>
    </form> : <>
      <div className="history-entry-actions">
        {!confirmed && <button className="history-button history-button-primary" disabled={busy || !trackingEnabled} onClick={() => void confirm()}>I bought it</button>}
        <button className="history-button" disabled={busy} onClick={edit} aria-label={`Edit ${intent.title}`}>Edit entry</button>
        {!deleting && <button className="history-button history-button-danger" disabled={busy} onClick={() => setDeleting(true)} aria-label={`Delete ${intent.title}`}>Delete entry</button>}
      </div>
      {deleting && <div className="history-delete-confirm">
        <p>Delete this entry permanently?</p>
        <div className="history-entry-actions">
          <button className="history-button history-button-danger" disabled={busy} onClick={() => void remove()}>Yes, delete entry</button>
          <button className="history-button" disabled={busy} onClick={() => setDeleting(false)}>Cancel deletion</button>
        </div>
      </div>}
    </>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
