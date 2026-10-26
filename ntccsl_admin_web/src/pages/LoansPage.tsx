import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getRows, mutate, request } from '../api';
import type { LoanPayment, RecordRow, Session } from '../types';
import { allows, dateToday, money, normalize, text } from '../utils';
import { Modal, PageHeading, PortalLoader, RowActions, StatePanel, Table } from '../components/ui';

export function LoanForm({
  session,
  row,
  defaultType,
  schemes,
  onClose,
  onSave,
}: {
  session: Session;
  row?: RecordRow;
  defaultType?: 'personal' | 'gold';
  schemes: RecordRow[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const loanTypes = (['personal', 'gold'] as const);
  const [loanType, setLoanType] = useState<'personal' | 'gold'>(
    defaultType ?? (normalize(row?.loanType) === 'gold' ? 'gold' : 'personal'),
  );
  const [schemeId, setSchemeId] = useState(text(row?.schemeId));
  const [memberName, setMemberName] = useState(session.user.role === 'Member' ? session.user.name : text(row?.memberName));
  const [startDate, setStartDate] = useState(text(row?.startDate) || dateToday());
  const [principal, setPrincipal] = useState(text(row?.principal));
  const [annualRate, setAnnualRate] = useState(text(row?.annualRate));
  const [tenureYears, setTenureYears] = useState(text(row?.tenureYears || 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = schemes.filter((scheme) => normalize(scheme.loanType) === loanType && (scheme.active === true || scheme.active === 'TRUE' || scheme.active === undefined || row?.schemeId === scheme.schemeId));
  const currentScheme = options.find((scheme) => text(scheme.schemeId) === schemeId);

  useEffect(() => {
    if (!options.some((scheme) => text(scheme.schemeId) === schemeId)) {
      setSchemeId(text(options[0]?.schemeId));
    }
  }, [options, schemeId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await onSave({
        ...(row ? { id: row.id } : {}),
        schemeId, loanType, memberName, startDate,
        principal: Number(principal), annualRate: Number(annualRate), tenureYears: Number(tenureYears),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The loan could not be saved.');
    } finally { setBusy(false); }
  };

  return <Modal title={row ? 'Edit loan' : 'New loan application'} onClose={onClose}>
    <form className="record-form" onSubmit={submit}>
      <div className="form-grid">
        {session.user.role !== 'Member' && !defaultType && <label className="field"><span>Loan category *</span>
          <select value={loanType} onChange={(event) => setLoanType(event.target.value as 'personal' | 'gold')}>
            {loanTypes.map((type) => <option value={type} key={type}>{type === 'personal' ? 'Personal loan' : 'Gold loan'}</option>)}
          </select>
        </label>}
        {session.user.role !== 'Member' && <label className="field"><span>Member name *</span><input required value={memberName} onChange={(event) => setMemberName(event.target.value)} /></label>}
        <label className="field"><span>Loan scheme *</span><select required value={schemeId} onChange={(event) => setSchemeId(event.target.value)}>
          <option value="">Choose a scheme…</option>{options.map((scheme) => <option key={text(scheme.schemeId)} value={text(scheme.schemeId)}>{text(scheme.schemeName)}</option>)}
        </select></label>
        <label className="field"><span>Application date *</span><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="field"><span>Principal amount (₹) *</span><input required type="number" min={currentScheme?.minAmount === undefined ? 1 : Number(currentScheme.minAmount)} max={currentScheme?.maxAmount === undefined ? 1000000000 : Number(currentScheme.maxAmount)} step="0.01" value={principal} onChange={(event) => setPrincipal(event.target.value)} /></label>
        <label className="field"><span>Annual rate (%) *</span><input required type="number" min={currentScheme?.minAnnualRate === undefined ? 18 : Number(currentScheme.minAnnualRate)} max={currentScheme?.maxAnnualRate === undefined ? 37 : Number(currentScheme.maxAnnualRate)} step="0.01" value={annualRate} onChange={(event) => setAnnualRate(event.target.value)} /></label>
        <label className="field"><span>Tenure (years) *</span><input required type="number" min={currentScheme?.minTenureYears === undefined ? 1 : Number(currentScheme.minTenureYears)} max={currentScheme?.maxTenureYears === undefined ? 7 : Number(currentScheme.maxTenureYears)} step="1" value={tenureYears} onChange={(event) => setTenureYears(event.target.value)} /></label>
      </div>
      {currentScheme && <p className="form-hint">Repayment method: {normalize(currentScheme.calculationMethod) === 'interest_only' ? 'Interest EMI' : 'Fixed EMI'}. The server calculates repayment and fees from the selected scheme.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || options.length === 0}>{busy && <PortalLoader label="Saving loan" inline size={16} />}{busy ? 'Saving…' : row ? 'Save loan' : 'Submit application'}</button></footer>
    </form>
  </Modal>;
}

export function SchemeForm({
  row,
  onClose,
  onSave,
}: {
  row?: RecordRow;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(text(row?.schemeName));
  const [loanType, setLoanType] = useState(text(row?.loanType) || 'personal');
  const [minAmount, setMinAmount] = useState(text(row?.minAmount || 1));
  const [maxAmount, setMaxAmount] = useState(text(row?.maxAmount || 1000000000));
  const [minRate, setMinRate] = useState(text(row?.minAnnualRate || 18));
  const [maxRate, setMaxRate] = useState(text(row?.maxAnnualRate || 37));
  const [minYears, setMinYears] = useState(text(row?.minTenureYears || 1));
  const [maxYears, setMaxYears] = useState(text(row?.maxTenureYears || 7));
  const [fileFee, setFileFee] = useState(text(row?.fileChargePercent || 0));
  const [processingFee, setProcessingFee] = useState(text(row?.processingFeePercent || 0));
  const [calculationMethod, setCalculationMethod] = useState(text(row?.calculationMethod || 'fixed_emi'));
  const [active, setActive] = useState(row ? row.active === true || text(row.active).toLowerCase() === 'true' : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await onSave({
        ...(row ? { schemeId: row.schemeId } : {}),
        schemeName: name, loanType, minAmount: Number(minAmount), maxAmount: Number(maxAmount),
        minAnnualRate: Number(minRate), maxAnnualRate: Number(maxRate),
        minTenureYears: Number(minYears), maxTenureYears: Number(maxYears),
        fileChargePercent: Number(fileFee), processingFeePercent: Number(processingFee),
        calculationMethod: loanType === 'gold' ? calculationMethod : 'fixed_emi', active,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scheme could not be saved.');
    } finally { setBusy(false); }
  };
  const numberField = (label: string, value: string, onChange: (value: string) => void, min = 0, max?: number, step = '0.01') => (
    <label className="field" key={label}><span>{label}</span><input type="number" required min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} /></label>
  );
  return <Modal title={row ? 'Edit loan scheme' : 'Add loan scheme'} onClose={onClose}>
    <form className="record-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Scheme name *</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>Loan type *</span><select value={loanType} onChange={(event) => setLoanType(event.target.value)}><option value="personal">Personal</option><option value="gold">Gold</option></select></label>
        {numberField('Minimum amount (₹)', minAmount, setMinAmount, 1, 1000000000)}
        {numberField('Maximum amount (₹)', maxAmount, setMaxAmount, 1, 1000000000)}
        {numberField('Minimum annual rate (%)', minRate, setMinRate, 18, 37)}
        {numberField('Maximum annual rate (%)', maxRate, setMaxRate, 18, 37)}
        {numberField('Minimum term (years)', minYears, setMinYears, 1, 7, '1')}
        {numberField('Maximum term (years)', maxYears, setMaxYears, 1, 7, '1')}
        {numberField('File charge (%)', fileFee, setFileFee, 0, 100)}
        {numberField('Processing fee (%)', processingFee, setProcessingFee, 0, 100)}
        {loanType === 'gold' && <label className="field"><span>Repayment method</span><select value={calculationMethod} onChange={(event) => setCalculationMethod(event.target.value)}><option value="fixed_emi">Fixed EMI</option><option value="interest_only">Interest EMI</option></select></label>}
        <label className="field field-checkbox"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Scheme is active</span></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy && <PortalLoader label="Saving scheme" inline size={16} />}{busy ? 'Saving…' : 'Save scheme'}</button></footer>
    </form>
  </Modal>;
}

export function LoanPage({
  session,
  page,
  onNotice,
}: {
  session: Session;
  page: string;
  onNotice: (message: string) => void;
}) {
  const master = page === 'loan-master';
  const approvedOnly = page === 'approved-loans';
  const loanType = page === 'personal-loan' ? 'personal' : page === 'gold-loan' ? 'gold' : undefined;
  const [loans, setLoans] = useState<RecordRow[]>([]);
  const [schemes, setSchemes] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formRow, setFormRow] = useState<RecordRow | undefined>();
  const [creating, setCreating] = useState(false);
  const [schemeRow, setSchemeRow] = useState<RecordRow | null | undefined>(undefined);
  const [schedules, setSchedules] = useState<Record<string, LoanPayment[]>>({});
  const [loadingSchedules, setLoadingSchedules] = useState<Set<string>>(() => new Set());
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>({});
  const [pendingLoanActions, setPendingLoanActions] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState('');
  const canAdd = allows(session, 'loan_add');
  const canEdit = allows(session, 'loan_edit');
  const canDelete = allows(session, 'loan_delete');
  const canReview = allows(session, 'loan_update');
  const isAdmin = session.user.role === 'Admin';
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [loanRows, schemeRows] = await Promise.all([
        getRows('getLoans', session, { ...(loanType ? { loanType } : {}), ...(approvedOnly ? { approvedOnly: true } : {}) }),
        isAdmin || canAdd ? getRows('getLoanSchemes', session, { ...(loanType ? { loanType } : {}), ...(isAdmin && master ? { includeInactive: true } : {}) }) : Promise.resolve([]),
      ]);
      setLoans(loanRows); setSchemes(schemeRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Loan data is unavailable.');
    } finally { setLoading(false); }
  }, [approvedOnly, canAdd, isAdmin, loanType, master, session]);
  useEffect(() => { void load(); }, [load]);

  const saveLoan = async (payload: Record<string, unknown>) => {
    await mutate(payload.id ? 'editLoan' : 'addLoan', session, payload);
    setFormRow(undefined); setCreating(false); onNotice(payload.id ? 'Loan updated. It is pending review.' : 'Loan application submitted.'); await load();
  };
  const saveScheme = async (payload: Record<string, unknown>) => {
    await mutate(payload.schemeId ? 'editLoanScheme' : 'addLoanScheme', session, payload);
    setSchemeRow(undefined); onNotice('Loan scheme saved.'); await load();
  };
  const removeLoan = async (row: RecordRow) => {
    if (!window.confirm('Delete this loan record?')) return;
    const actionKey = `delete:${text(row.id)}`;
    setPendingLoanActions((current) => new Set(current).add(actionKey));
    try { await mutate('deleteLoan', session, { id: row.id }); onNotice('Loan record deleted.'); await load(); }
    catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not delete loan.'); }
    finally {
      setPendingLoanActions((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };
  const reviewLoan = async (row: RecordRow, approvalStatus: 'Approved' | 'Rejected') => {
    const actionKey = `review:${text(row.id)}`;
    setPendingLoanActions((current) => new Set(current).add(actionKey));
    try {
      await mutate('approveLoan', session, { id: row.id, approvalStatus });
      onNotice(`Loan ${approvalStatus.toLowerCase()}.`);
      await load();
    } catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not update approval status.'); }
    finally {
      setPendingLoanActions((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };
  const removeScheme = async (row: RecordRow) => {
    if (!window.confirm(`Delete scheme "${text(row.schemeName)}"?`)) return;
    try { await mutate('deleteLoanScheme', session, { schemeId: row.schemeId }); onNotice('Loan scheme deleted.'); await load(); }
    catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not delete scheme.'); }
  };
  const togglePayment = async (loanId: string, periodIndex: number) => {
    const actionKey = `payment:${loanId}:${periodIndex}`;
    setPendingLoanActions((current) => new Set(current).add(actionKey));
    try {
      await mutate('toggleLoanPayment', session, { id: loanId, periodIndex });
      const schedule = await request<{ payments: LoanPayment[] }>('getLoanPaymentSchedule', { id: loanId }, session);
      setSchedules((current) => ({ ...current, [loanId]: schedule.payments }));
      onNotice('Loan payment updated.');
    }
    catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not update payment.'); }
    finally {
      setPendingLoanActions((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };
  const toggleSchedule = async (loanId: string, open = false) => {
    const willOpen = open || expandedId !== loanId;
    setExpandedId(willOpen ? loanId : '');
    if (willOpen && !schedules[loanId]) {
      setLoadingSchedules((current) => new Set(current).add(loanId));
      setScheduleErrors((current) => ({ ...current, [loanId]: '' }));
      try {
        const schedule = await request<{ payments: LoanPayment[] }>('getLoanPaymentSchedule', { id: loanId }, session);
        setSchedules((current) => ({ ...current, [loanId]: schedule.payments }));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not load payment schedule.';
        setScheduleErrors((current) => ({ ...current, [loanId]: message }));
        onNotice(message);
      } finally {
        setLoadingSchedules((current) => {
          const next = new Set(current);
          next.delete(loanId);
          return next;
        });
      }
    }
  };

  const filteredLoans = loans.filter((loan) => !approvedOnly || normalize(loan.approvalStatus || 'Approved') === 'approved');
  const title = master ? 'Loan master' : approvedOnly ? 'Approved loans' : `${loanType === 'gold' ? 'Gold' : 'Personal'} loans`;
  const subtitle = master ? 'Review applications and maintain loan products and terms.' : approvedOnly ? 'Approved accounts and repayment progress.' : 'Review loans, repayment schedules, and applications.';
  const loanColumns = [
    { key: 'loanNumber', label: 'Loan no.' },
    { key: 'memberName', label: 'Member' },
    { key: 'schemeName', label: 'Scheme' },
    { key: 'principal', label: 'Principal', render: (row: RecordRow) => money(row.principal) },
    { key: 'monthlyInstallment', label: 'Installment', render: (row: RecordRow) => money(row.monthlyInstallment) },
    { key: 'approvalStatus', label: 'Status', render: (row: RecordRow) => <span className={`status status-${normalize(row.approvalStatus || 'approved')}`}>{text(row.approvalStatus || 'Approved')}</span> },
    { key: 'actions', label: 'Actions', render: (row: RecordRow) => <div className="row-actions">
      {normalize(row.approvalStatus) === 'pending' && canReview && <><button className="text-button" disabled={pendingLoanActions.has(`review:${text(row.id)}`)} onClick={() => void reviewLoan(row, 'Approved')}>{pendingLoanActions.has(`review:${text(row.id)}`) && <PortalLoader label="Updating loan" inline size={15} />}Approve</button><button className="text-button danger-text" disabled={pendingLoanActions.has(`review:${text(row.id)}`)} onClick={() => void reviewLoan(row, 'Rejected')}>Reject</button></>}
      <RowActions
        edit={canEdit ? () => setFormRow(row) : undefined}
        remove={canDelete ? () => void removeLoan(row) : undefined}
        removeDisabled={pendingLoanActions.has(`delete:${text(row.id)}`)}
        removeBusyLabel="Deleting loan"
      />
      {normalize(row.approvalStatus || 'approved') === 'approved' && <button className="text-button" onClick={() => void toggleSchedule(text(row.id))}>{expandedId === text(row.id) ? 'Hide schedule' : 'Schedule'}</button>}
    </div> },
  ];
  return <>
    <PageHeading title={title} subtitle={subtitle} action={canAdd && !master && <button className="button button-primary" onClick={() => setCreating(true)}>＋ New loan</button>} />
    {master && isAdmin && <section className="panel scheme-panel">
      <div className="panel-heading"><div><h2>Loan schemes</h2><p className="muted">Rates, limits, terms, and disbursement charges</p></div><button className="button button-secondary" onClick={() => setSchemeRow(null)}>＋ Add scheme</button></div>
      <StatePanel loading={loading} error={error} retry={() => void load()}><Table rows={schemes} columns={[
        { key: 'schemeName', label: 'Scheme' }, { key: 'loanType', label: 'Type' },
        { key: 'minAmount', label: 'Amount range', render: (row) => `${money(row.minAmount)} – ${money(row.maxAmount)}` },
        { key: 'minAnnualRate', label: 'Rate range', render: (row) => `${text(row.minAnnualRate)}% – ${text(row.maxAnnualRate)}%` },
        { key: 'calculationMethod', label: 'Method', render: (row) => normalize(row.calculationMethod) === 'interest_only' ? 'Interest EMI' : 'Fixed EMI' },
        { key: 'active', label: 'Status', render: (row) => <span className={`status ${row.active === false || text(row.active).toLowerCase() === 'false' ? 'status-rejected' : 'status-approved'}`}>{row.active === false || text(row.active).toLowerCase() === 'false' ? 'Inactive' : 'Active'}</span> },
        { key: 'actions', label: 'Actions', render: (row) => <RowActions edit={() => setSchemeRow(row)} remove={() => void removeScheme(row)} /> },
      ]} empty="No schemes configured." /></StatePanel>
    </section>}
    <section className="panel loan-panel">
      <div className="panel-heading"><h2>{master ? 'Application queue' : `${title} records`}</h2><span className="badge">{filteredLoans.length} records</span></div>
      <StatePanel loading={loading} error={error} retry={() => void load()}>
        <Table rows={filteredLoans} columns={loanColumns} empty={canAdd ? 'Submit a loan application to get started.' : 'There are no loan records to show.'} />
        {filteredLoans.map((loan) => expandedId === text(loan.id) && <section className="schedule-panel" key={`schedule-${text(loan.id)}`}>
          <div className="panel-heading"><h3>Repayment schedule · {text(loan.loanNumber || loan.memberName)}</h3><span className="muted">{text(loan.repaymentMethod) === 'interest_only' ? 'Interest EMI' : 'Fixed EMI'}</span></div>
          {loadingSchedules.has(text(loan.id)) ? <div className="state-panel state-loading"><PortalLoader label="Loading repayment schedule…" size={48} /></div> : scheduleErrors[text(loan.id)] ? <div className="state-panel state-error"><span>{scheduleErrors[text(loan.id)]}</span><button className="button button-secondary" onClick={() => void toggleSchedule(text(loan.id), true)}>Try again</button></div> : !schedules[text(loan.id)] ? null : <div className="table-scroll"><table><thead><tr><th>#</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Installment</th><th>Status</th></tr></thead><tbody>{schedules[text(loan.id)].map((payment) => {
            const actionKey = `payment:${text(loan.id)}:${payment.periodIndex}`;
            return <tr key={payment.periodIndex}><td>{payment.periodIndex}</td><td>{payment.dueDate}</td><td>{money(payment.principalAmount)}</td><td>{money(payment.interestAmount)}</td><td>{money(payment.installmentAmount)}</td><td>{canReview ? <button className={`status status-button ${payment.paid ? 'status-paid' : 'status-neutral'}`} disabled={pendingLoanActions.has(actionKey)} onClick={() => void togglePayment(text(loan.id), payment.periodIndex)}>{pendingLoanActions.has(actionKey) && <PortalLoader label="Updating installment" inline size={14} />}{payment.paid ? 'Paid · mark unpaid' : 'Unpaid · mark paid'}</button> : text(payment.status || (payment.paid ? 'Paid' : 'Unpaid'))}</td></tr>;
          })}</tbody></table></div>}
        </section>)}
      </StatePanel>
    </section>
    {(creating || formRow) && <LoanForm session={session} row={formRow} defaultType={loanType} schemes={schemes}
      onClose={() => { setCreating(false); setFormRow(undefined); }} onSave={saveLoan} />}
    {schemeRow !== undefined && <SchemeForm row={schemeRow ?? undefined} onClose={() => setSchemeRow(undefined)} onSave={saveScheme} />}
  </>;
}
