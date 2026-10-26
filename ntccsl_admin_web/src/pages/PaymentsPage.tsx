import { useCallback, useEffect, useState } from 'react';
import { getRows, request } from '../api';
import { DEPOSIT_ROUTES, type LoanPayment, type Session } from '../types';
import { allows, money, text } from '../utils';
import { PageHeading, PortalLoader, StatePanel } from '../components/ui';

type PaymentOption = {
  key: string;
  label: string;
  memberName: string;
  amount: number;
  dueDate: string;
  target: { kind: 'deposit' | 'loan'; id: string; periodIndex: number };
};

export function PaymentsPage({ session, onNotice }: { session: Session; onNotice: (message: string) => void }) {
  const [options, setOptions] = useState<PaymentOption[]>([]);
  const [phone, setPhone] = useState(session.user.phoneNumber);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [selected, setSelected] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const sources = await Promise.all([
        ...DEPOSIT_ROUTES.filter((route) => session.reportAccess[route.cadence] !== false).map(async (route) => ({
          route,
          rows: await getRows('getDepositAccounts', session, { product: route.product, cadence: route.cadence }),
        })),
        ...(allows(session, 'loan_add') || allows(session, 'loan_view') ? [getRows('getLoans', session, { approvedOnly: true })] : []),
      ]);
      const paymentOptions: PaymentOption[] = [];
      for (const source of sources) {
        if ('route' in source) {
          for (const row of source.rows) {
            const payments = Array.isArray(row.payments) ? row.payments : [];
            const dates = Array.isArray(row.periodDates) ? row.periodDates : [];
            payments.forEach((paid, index) => {
              if (paid !== true) paymentOptions.push({
                key: `deposit:${text(row.id)}:${index + 1}`,
                label: `${source.route.product} ${source.route.cadence} · ${text(row.memberName)}`,
                memberName: text(row.memberName),
                amount: Number(row.amount) || 0,
                dueDate: text(dates[index]) || `Installment ${index + 1}`,
                target: { kind: 'deposit', id: text(row.id), periodIndex: index + 1 },
              });
            });
          }
        } else {
          for (const row of source) {
            try {
              const schedule = await request<{ payments: LoanPayment[] }>('getLoanPaymentSchedule', { id: row.id }, session);
              schedule.payments.forEach((payment) => {
                if (!payment.paid) paymentOptions.push({
                  key: `loan:${text(row.id)}:${payment.periodIndex}`,
                  label: `${text(row.loanType)} loan · ${text(row.loanNumber || row.memberName)}`,
                  memberName: text(row.memberName),
                  amount: Number(payment.installmentAmount) || 0,
                  dueDate: payment.dueDate,
                  target: { kind: 'loan', id: text(row.id), periodIndex: payment.periodIndex },
                });
              });
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : 'Unknown error';
              setError((current) => current ? `${current}; ${text(row.loanNumber || row.id)}: ${message}` : `${text(row.loanNumber || row.id)}: ${message}`);
            }
          }
        }
      }
      setOptions(paymentOptions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load payment schedules.');
    } finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const startPayment = async () => {
    const option = options.find((item) => item.key === selected);
    if (!option) { onNotice('Choose an unpaid installment first.'); return; }
    if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) { onNotice('Enter a valid 10-digit mobile number.'); return; }
    setBusy(true); setPaymentMessage('');
    try {
      const order = await request<{ status: string; orderId: string; paymentSessionId: string; environment: 'sandbox' | 'production' }>(
        'createCashfreeOrder',
        { baseAmount: option.amount.toFixed(2), customerPhone: phone.replace(/\D/g, ''), scheduleTarget: option.target },
        session,
      );
      if (!order.orderId || !order.paymentSessionId) throw new Error('The server returned invalid payment details.');
      setOrderId(order.orderId);
      const sdk = await loadCashfree();
      await sdk({ mode: order.environment }).checkout({ paymentSessionId: order.paymentSessionId, redirectTarget: '_modal' });
      setPaymentMessage(`Checkout closed for order ${order.orderId}. Verify the payment status below.`);
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Could not start secure payment.');
    } finally { setBusy(false); }
  };
  const verifyPayment = async () => {
    if (!orderId) return;
    setBusy(true);
    try {
      const result = await request<{ orderId: string; paid: boolean; paymentStatus: string; scheduleApplied?: boolean; scheduleDescription?: string }>('verifyCashfreePayment', { orderId }, session);
      setPaymentMessage(result.paid
        ? `Payment verified. ${result.scheduleDescription || 'The installment is updated.'}`
        : `Payment status: ${result.paymentStatus}. The installment is not marked paid.`);
      if (result.paid) { setOrderId(''); setSelected(''); await load(); }
    } catch (cause) { onNotice(cause instanceof Error ? cause.message : 'Could not verify the payment.'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeading title="Make a payment" subtitle="Choose one of your unpaid deposit or loan installments." />
    <section className="panel payment-panel">
      <StatePanel loading={loading} error={error} retry={() => void load()}>
        {options.length === 0 ? <div className="empty-state"><strong>All caught up</strong><span>No unpaid schedules are available for this account.</span></div> : <>
          <label className="field"><span>Unpaid installment</span><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a payment…</option>{options.map((option) => <option key={option.key} value={option.key}>{option.label} · {option.dueDate} · {money(option.amount)}</option>)}</select></label>
          <label className="field"><span>Mobile number</span><input type="tel" inputMode="numeric" maxLength={10} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          {selected && <p className="payment-note">A 2% service charge is added by the server. The total is shown in Cashfree checkout.</p>}
          <button className="button button-primary" disabled={busy || !selected} onClick={() => void startPayment()}>{busy && <PortalLoader label="Preparing secure checkout" inline size={16} />}{busy ? 'Preparing secure checkout…' : `Continue to payment${selected ? ` · ${money(options.find((item) => item.key === selected)?.amount)}` : ''}`}</button>
        </>}
        {paymentMessage && <div className="payment-result" role="status"><span>{paymentMessage}</span>{orderId && <button className="button button-secondary" disabled={busy} onClick={() => void verifyPayment()}>{busy && <PortalLoader label="Verifying payment" inline size={16} />}{busy ? 'Verifying…' : 'Verify payment'}</button>}</div>}
      </StatePanel>
    </section>
  </>;
}

async function loadCashfree() {
  if (window.Cashfree) return window.Cashfree;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Cashfree checkout. Check your network and retry.'));
    document.head.appendChild(script);
  });
  if (!window.Cashfree) throw new Error('Cashfree checkout did not initialize.');
  return window.Cashfree;
}
