import { useCallback, useEffect, useState } from 'react';
import { getRows, mutate } from '../api';
import type { DepositRoute, RecordRow, Session } from '../types';
import { allows, money, normalize, text, dateToday } from '../utils';
import { PageHeading, PortalLoader, RecordForm, RowActions, StatePanel, StatCard } from '../components/ui';

export function DepositPage({
  session,
  route,
  onNotice,
}: {
  session: Session;
  route: DepositRoute;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formRow, setFormRow] = useState<RecordRow | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [pendingInstallment, setPendingInstallment] = useState('');
  const [query, setQuery] = useState('');
  const canWrite = session.user.role !== 'Member';
  const canAdd = canWrite && allows(session, 'deposit_add');
  const canEdit = canWrite && allows(session, 'deposit_edit');
  const canDelete = canWrite && allows(session, 'deposit_delete');
  const canUpdate = canWrite && allows(session, 'deposit_update');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setRows(await getRows('getDepositAccounts', session, { product: route.product, cadence: route.cadence }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deposit accounts are unavailable.');
    } finally { setLoading(false); }
  }, [route.cadence, route.product, session]);
  useEffect(() => { void load(); }, [load]);

  const save = async (values: Record<string, string | boolean>) => {
    setBusy(true);
    try {
      const editing = Boolean(formRow);
      await mutate(editing ? 'editDepositAccount' : 'addDepositAccount', session, {
        ...(editing ? { id: formRow?.id } : {}),
        memberName: values.memberName,
        product: route.product,
        cadence: route.cadence,
        startDate: values.startDate,
        amount: values.amount,
        annualRate: values.annualRate,
        tenureMonths: values.tenureMonths,
      });
      setFormRow(undefined);
      onNotice(editing ? 'Deposit account updated.' : 'Deposit account created.');
      await load();
    } finally { setBusy(false); }
  };
  const remove = async (row: RecordRow) => {
    if (!window.confirm(`Delete the ${route.product} account for ${text(row.memberName)}? This also deletes its payment history.`)) return;
    try { await mutate('deleteDepositAccount', session, { id: row.id }); onNotice('Deposit account deleted.'); await load(); }
    catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not delete this account.'); }
  };
  const togglePayment = async (row: RecordRow, periodIndex: number) => {
    const actionKey = `${text(row.id)}:${periodIndex}`;
    setPendingInstallment(actionKey);
    try {
      await mutate('toggleDepositPayment', session, { id: row.id, periodIndex });
      onNotice(`Installment ${periodIndex} updated.`);
      await load();
    } catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not update installment.'); }
    finally { setPendingInstallment(''); }
  };

  const filtered = rows.filter((row) => !query || normalize(row.memberName).includes(normalize(query)) || normalize(row.id).includes(normalize(query)));
  const paid = rows.reduce((sum, row) => sum + (Array.isArray(row.payments) ? row.payments.filter(Boolean).length : Number(row.paid_count) || 0), 0);
  const scheduled = rows.reduce((sum, row) => sum + (Array.isArray(row.payments) ? row.payments.length : Number(row.payment_count) || 0), 0);

  return <>
    <PageHeading title={route.title} subtitle={`${route.product === 'FD' ? 'Fixed deposit' : route.product === 'RD' ? 'Recurring deposit' : 'Daily recurring deposit'} · Track contributions and estimated maturity.`}
      action={canAdd && <button className="button button-primary" onClick={() => setFormRow(null)}>＋ New account</button>} />
    <div className="stats-grid stats-grid-small">
      <StatCard label="Accounts" value={String(rows.length)} />
      <StatCard label="Installments paid" value={`${paid} / ${scheduled}`} tone="green" />
      <StatCard label="Estimated maturity" value={money(rows.reduce((sum, row) => sum + (Number(row.maturityAmount) || 0), 0))} tone="violet" />
    </div>
    <section className="panel">
      <div className="panel-toolbar"><label className="search-field"><span>⌕</span><input placeholder="Search member or account" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      <StatePanel loading={loading} error={error} retry={() => void load()}>
        <div className="account-list">
          {filtered.map((row) => {
            const payments = Array.isArray(row.payments) ? row.payments : [];
            const dates = Array.isArray(row.periodDates) ? row.periodDates : [];
            const currentPaid = payments.filter(Boolean).length;
            return <article className="account-card" key={text(row.id)}>
              <div className="account-card-main">
                <div className="avatar">{text(row.memberName).slice(0, 1).toUpperCase() || 'M'}</div>
                <div className="account-title"><strong>{text(row.memberName) || 'Member'}</strong><span>{text(row.accountNo || row.id)} · {route.product} {route.cadence}</span></div>
                <span className="status status-neutral">{currentPaid}/{payments.length || Number(row.payment_count) || 0} paid</span>
                <RowActions edit={canEdit ? () => setFormRow(row) : undefined} remove={canDelete ? () => void remove(row) : undefined} />
              </div>
              <div className="account-metrics">
                <div><span>{route.product === 'FD' ? 'Principal' : 'Installment'}</span><strong>{money(row.amount)}</strong></div>
                <div><span>Rate / tenure</span><strong>{text(row.annualRate)}% · {text(row.tenureMonths)} months</strong></div>
                <div><span>Maturity date</span><strong>{text(row.maturityDate) || '—'}</strong></div>
                <div><span>Estimated maturity</span><strong>{money(row.maturityAmount)}</strong></div>
              </div>
              {payments.length > 0 && <details className="schedule-details">
                <summary>Installment schedule <span>{currentPaid} paid · {payments.length - currentPaid} due</span></summary>
                <div className="installment-grid">{payments.map((isPaid, index) =>
                  <div className={`installment ${isPaid ? 'installment-paid' : ''}`} key={index}>
                    <span>#{index + 1}</span><span>{text(dates[index]) || `Period ${index + 1}`}</span>
                    {canUpdate ? <button className="text-button" disabled={pendingInstallment === `${text(row.id)}:${index + 1}`} onClick={() => void togglePayment(row, index + 1)}>{pendingInstallment === `${text(row.id)}:${index + 1}` && <PortalLoader label="Updating installment" inline size={15} />}{isPaid ? 'Mark unpaid' : 'Mark paid'}</button> : <span>{isPaid ? 'Paid' : 'Due'}</span>}
                  </div>,
                )}</div>
              </details>}
            </article>;
          })}
          {!filtered.length && <div className="empty-state"><strong>No accounts found</strong><span>{query ? 'Try a different search.' : 'Create an account to start tracking deposits.'}</span></div>}
        </div>
      </StatePanel>
    </section>
    {formRow !== undefined && <RecordForm title={formRow ? 'Edit deposit account' : 'Create deposit account'} busy={busy}
      initial={formRow ?? { startDate: dateToday(), tenureMonths: 12, annualRate: 0 }}
      onClose={() => setFormRow(undefined)} onSubmit={save} fields={[
        { name: 'memberName', label: 'Member name', required: true },
        { name: 'startDate', label: 'Start date', type: 'date', required: true },
        { name: 'amount', label: route.product === 'FD' ? 'Principal amount' : 'Installment amount', type: 'number', min: 1, step: '0.01', required: true },
        { name: 'annualRate', label: 'Annual rate (%)', type: 'number', min: 0, max: 100, step: '0.01', required: true },
        { name: 'tenureMonths', label: 'Tenure (months)', type: 'number', min: 1, max: 120, step: '1', required: true },
      ]} />}
  </>;
}
