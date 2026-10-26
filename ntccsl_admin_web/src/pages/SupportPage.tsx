import { PageHeading } from '../components/ui';

export function SupportPage() {
  return <>
    <PageHeading title="Help & support" subtitle="Get help using the NTCCSL Finance System." />
    <div className="support-grid">
      <section className="panel"><div className="support-icon">?</div><h2>Account access</h2><p>For password resets, account access, or profile corrections, contact your NTCCSL portal administrator. Administrators can update an account from the Users page.</p></section>
      <section className="panel"><div className="support-icon">₹</div><h2>Payments</h2><p>Payments are securely processed by Cashfree. A payment is recorded only after the server verifies the Cashfree order status.</p></section>
      <section className="panel"><div className="support-icon">↻</div><h2>Data not loading?</h2><p>Use the retry button on the affected page. If the issue continues, ask the administrator to verify the Apps Script deployment and spreadsheet setup.</p></section>
    </div>
  </>;
}
