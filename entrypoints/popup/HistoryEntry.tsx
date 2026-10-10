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

  return <section className="confirmation">
    <h3>{intent.title}</h3>
    <p className="message help">{confirmed ? 'Confirmed purchase' : intent.continuedAt ? 'Continued anyway · Unconfirmed attempt' : 'Unconfirmed reminder'}</p>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label>Product<input required maxLength={200} disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Website or store<input required maxLength={253} disabled={busy} value={site} onChange={(event) => setSite(event.target.value)} /></label>
      <label>Amount (USD)<input inputMode="decimal" required={purchased} disabled={busy} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Date<input type="date" required disabled={busy} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Status<select disabled={busy} value={purchased ? 'purchased' : 'unconfirmed'} onChange={(event) => setPurchased(event.target.value === 'purchased')}>
        <option value="unconfirmed">Unconfirmed</option>
        <option value="purchased" disabled={!trackingEnabled && !confirmed}>Purchased</option>
      </select></label>
      <p className="message help">Choose Purchased only if you actually bought it. Unconfirmed entries are excluded from spending totals.</p>
      <button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
      <button className="secondary" disabled={busy} type="button" onClick={() => { setEditing(false); setError(''); }}>Cancel editing</button>
    </form> : <>
      <p className="message help">{intent.site}<br />{intent.amountCents === null ? 'Amount unknown' : money(intent.amountCents)} · {confirmed || intent.recordedAt || intent.continuedAt ? historyDate(intent) : 'Date not recorded'}</p>
      {!confirmed && <>
        <p className="message help">Confirm once, using your final total. Do not record both an item and a cart that includes it.</p>
        <button className="primary" disabled={busy || !trackingEnabled} onClick={() => void confirm()}>I bought it</button>
      </>}
      <button className="secondary" disabled={busy} onClick={edit} aria-label={`Edit ${intent.title}`}>Edit entry</button>
      {deleting ? <>
        <p className="message help">Delete this entry permanently?</p>
        <button className="secondary" disabled={busy} onClick={() => void remove()}>Yes, delete entry</button>
        <button className="secondary" disabled={busy} onClick={() => setDeleting(false)}>Cancel deletion</button>
      </> : <button className="secondary" disabled={busy} onClick={() => setDeleting(true)} aria-label={`Delete ${intent.title}`}>Delete entry</button>}
    </>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
