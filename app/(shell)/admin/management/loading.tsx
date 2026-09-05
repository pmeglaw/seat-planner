// Content-pane loading state for /admin/management (PHASE2UX §1G.5): the page
// header and the tab strip are REAL (the frame does not jump when the data
// lands), the table is six asset skeleton rows under real column headers.
// The persistent shell keeps the header and panels mounted while this streams.
const COLUMNS = ["Name", "Department", "Position", "Extension", "Seat", "Status"];

export default function AdminManagementLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]"
    >
      <span className="sr-only">Loading management…</span>
      <div aria-hidden="true" className="sp-page mx-auto w-full">
        <div className="cds-page-header">
          <div>
            <h1 className="cds-page-title">Management</h1>
            <p className="cds-page-subtitle">People, departments and zones.</p>
          </div>
          <div className="sp-page-actions">
            <span className="cds-btn cds-btn--primary cds-btn--md" aria-hidden="true">Add employee</span>
          </div>
        </div>
        <div className="sp-tabs-host">
          <ul className="sp-tabs">
            <li role="presentation"><span className="sp-tab" role="tab" aria-selected="true">Employees</span></li>
            <li role="presentation"><span className="sp-tab" role="tab" aria-selected="false">Departments</span></li>
            <li role="presentation"><span className="sp-tab" role="tab" aria-selected="false">Zones</span></li>
          </ul>
        </div>
        <div className="sp-table">
          <div className="cds-toolbar sp-toolbar"><span className="cds-toolbar-count">Loading employees…</span></div>
          <table className="cds-table">
            <thead>
              <tr>
                {COLUMNS.map(column => (
                  <th key={column} scope="col"><span className="cds-th-static">{column}</span></th>
                ))}
                <th scope="col" className="cds-col-actions" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, index) => (
                <tr key={index} className="cds-skeleton-row">
                  {COLUMNS.map(column => <td key={column} />)}
                  <td className="cds-col-actions" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
