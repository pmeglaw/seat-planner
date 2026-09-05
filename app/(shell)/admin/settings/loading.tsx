// Content-pane loading state for /admin/settings (PHASE2UX §1S.5): the page
// header is REAL and the two sections render their heading with a skeleton
// action row — the frame does not jump when the data lands. Chrome-free like
// the Management skeleton: the persistent shell already shows the header.
export default function AdminSettingsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]"
    >
      <span className="sr-only">Loading settings…</span>
      <div aria-hidden="true" className="sp-page mx-auto w-full">
        <div className="cds-page-header">
          <div>
            <h1 className="cds-page-title">Settings</h1>
            <p className="cds-page-subtitle">Import, export and recovery. Everything here changes the draft only.</p>
          </div>
        </div>
        <div className="sp-settings">
          <div className="sp-callout"><p><span className="sp-skeleton" style={{ width: "60%" }} /></p></div>
          <section className="sp-section">
            <h2>CSV assignments</h2>
            <p className="sp-section-helper"><span className="sp-skeleton" style={{ width: "40%" }} /></p>
            <div className="sp-action-row"><span className="sp-skeleton" style={{ width: 240, height: 40 }} /><span className="sp-skeleton" style={{ width: 128, height: 40 }} /><span className="sp-skeleton" style={{ width: 160, height: 40 }} /></div>
          </section>
          <section className="sp-section">
            <h2>Draft working-copy snapshots</h2>
            <p className="sp-section-helper"><span className="sp-skeleton" style={{ width: "50%" }} /></p>
            <div className="sp-action-row"><span className="sp-skeleton" style={{ width: 200, height: 40 }} /><span className="sp-skeleton" style={{ width: 200, height: 40 }} /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
