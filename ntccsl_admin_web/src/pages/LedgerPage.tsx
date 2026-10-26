import { useCallback, useEffect, useState } from 'react';
import { getRows, mutate } from '../api';
import type { RecordRow, Session } from '../types';
import { allows, dateToday, money, text } from '../utils';
import { PageHeading, RecordForm, RowActions, StatePanel, StatCard, Table } from '../components/ui';

export function LedgerPage({ session, onNotice }: { session: Session; onNotice: (message: string) => void }) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formRow, setFormRow] = useState<RecordRow | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const canAdd = allows(session, 'ledger_add');
  const canEdit = allows(session, 'ledger_edit') || allows(session, 'ledger_update');
  const canDelete = allows(session, 'ledger_delete');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await getRows('getAmount', session)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Ledger is unavailable.'); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const save = async (values: Record<string, string | boolean>) => {
    setBusy(true);
    try {
      const editing = Boolean(formRow);
      const deposit = Number(values.deposit) || 0;
      const withdrawal = Number(values.withdrawal) || 0;
      if ((deposit > 0) === (withdrawal > 0)) {
        throw new Error('Enter either a positive deposit or a positive withdrawal.');
      }
      const openingBalance = openingBalanceFor(formRow);
      const balance = openingBalance + deposit - withdrawal;
      if (balance < 0) throw new Error('The resulting balance cannot be negative.');
      await mutate(editing ? 'editAmount' : 'addAmount', session, {
        ...(editing ? { rowIndex: formRow?.__rowIndex } : {}),
        date: values.date, byWhom: values.byWhom, remarks: values.remarks,
        deposit, withdrawal, balance, payMode: values.payMode,
        entryBy: formRow ? text(formRow.entryBy) || session.user.name : session.user.name,
      });
      setFormRow(undefined); onNotice(editing ? 'Ledger entry updated.' : 'Ledger entry added.');
      await load();
    } finally { setBusy(false); }
  };
  const openingBalanceFor = (entry: RecordRow | null | undefined) => {
    const rowIndex = Number(entry?.__rowIndex);
    if (entry && Number.isInteger(rowIndex)) {
      const previous = rows
        .filter((candidate) => Number(candidate.__rowIndex) < rowIndex)
        .sort((left, right) => Number(right.__rowIndex) - Number(left.__rowIndex))[0];
      if (previous) return Number(previous.balance) || 0;
      return (Number(entry.balance) || 0) - (Number(entry.deposit) || 0) + (Number(entry.withdrawal) || 0);
    }
    const latest = [...rows].sort((left, right) => Number(right.__rowIndex) - Number(left.__rowIndex))[0];
    return Number(latest?.balance) || 0;
  };
  const remove = async (row: RecordRow) => {
    if (!window.confirm('Delete this ledger entry?')) return;
    try { await mutate('deleteAmount', session, { rowIndex: row.__rowIndex }); onNotice('Ledger entry deleted.'); await load(); }
    catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not delete entry.'); }
  };
  const totalDeposits = rows.reduce((sum, row) => sum + (Number(row.deposit) || 0), 0);
  const totalWithdrawals = rows.reduce((sum, row) => sum + (Number(row.withdrawal) || 0), 0);
  const columns = [
    { key: 'date', label: 'Date' }, { key: 'byWhom', label: 'Member / source' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'deposit', label: 'Deposit', render: (row: RecordRow) => money(row.deposit) },
    { key: 'withdrawal', label: 'Withdrawal', render: (row: RecordRow) => money(row.withdrawal) },
    { key: 'balance', label: 'Balance', render: (row: RecordRow) => money(row.balance) },
    { key: 'payMode', label: 'Payment mode' },
    { key: 'actions', label: 'Actions', render: (row: RecordRow) => <RowActions edit={canEdit ? () => setFormRow(row) : undefined} remove={canDelete ? () => void remove(row) : undefined} /> },
  ];
  return <>
    <PageHeading title="Bank ledger" subtitle="Track deposits, withdrawals, and running balances."
      action={canAdd && <button className="button button-primary" onClick={() => setFormRow(null)}>＋ Add entry</button>} />
    <div className="stats-grid stats-grid-small">
      <StatCard label="Total deposits" value={money(totalDeposits)} tone="green" />
      <StatCard label="Total withdrawals" value={money(totalWithdrawals)} tone="orange" />
      <StatCard label="Current balance" value={money(rows.length ? rows[rows.length - 1].balance : 0)} />
    </div>
    <section className="panel"><StatePanel loading={loading} error={error} retry={() => void load()}>
      <Table rows={rows} columns={columns} />
    </StatePanel></section>
    {formRow !== undefined && <RecordForm title={formRow ? 'Edit ledger entry' : 'Add ledger entry'} busy={busy}
      initial={formRow ?? { date: dateToday(), payMode: 'Cash', entryBy: session.user.name, balance: openingBalanceFor(null).toFixed(2) }} openingBalance={openingBalanceFor(formRow)} onClose={() => setFormRow(undefined)} onSubmit={save}
      fields={[
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'byWhom', label: 'By whom', required: true },
        { name: 'remarks', label: 'Remarks' },
        { name: 'deposit', label: 'Deposit amount', type: 'number', min: 0, step: '0.01' },
        { name: 'withdrawal', label: 'Withdrawal amount', type: 'number', min: 0, step: '0.01' },
        { name: 'balance', label: 'Updated balance', type: 'number', step: '0.01', readOnly: true },
        { name: 'payMode', label: 'Payment mode', type: 'select', required: true, options: [...new Set(['Cash', 'G Pay', 'Net Banking', 'Others', 'Pay Mode', 'Phonepe', 'QR', 'UPI', 'Bank', 'Cheque', 'Other', ...(formRow && !['Cash', 'G Pay', 'Net Banking', 'Others', 'Pay Mode', 'Phonepe', 'QR', 'UPI', 'Bank', 'Cheque', 'Other'].includes(text(formRow.payMode)) ? [text(formRow.payMode)] : [])])].map((value) => ({ value, label: value })) },
        { name: 'entryBy', label: 'Entry by', required: true },
      ]} />}
  </>;
}
