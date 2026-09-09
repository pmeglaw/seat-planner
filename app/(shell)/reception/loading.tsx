import { ReceptionFrame } from "@/components/reception/ReceptionFrame";
import { SearchIcon } from "@/components/ui/icons";

// Content-pane loading state for /reception (PHASE2UX §1R.6 "Loading"; P2-5):
// the skeleton sits on the REAL layout — the page header and the search are
// real so the frame does not jump when the directory lands; the list is six
// asset skeleton rows under the count header; the readout column is one
// skeleton block. The persistent shell keeps the header and panels mounted
// while this streams. The search here is a lookalike (readOnly, out of the
// tab order, inside the aria-hidden block): the live field arrives with the
// screen and takes focus then.
export default function ReceptionLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]"
    >
      <span className="sr-only">Loading reception…</span>
      <div aria-hidden="true">
        <ReceptionFrame>
          <div className="sp-recep">
            <div className="sp-recep-list">
              <div className="sp-search-lg">
                <SearchIcon />
                <input
                  className="cds-text-input"
                  type="search"
                  readOnly
                  tabIndex={-1}
                  placeholder="Name, department, seat, or extension…"
                />
              </div>
              <div className="sp-recep-header">
                <span className="sp-recep-count"><span className="sp-skeleton sp-skeleton--w2" /></span>
                <span className="sp-recep-ext-head">Ext</span>
              </div>
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="sp-recep-skeleton-row">
                  <span className="sp-skeleton" />
                  <span className="sp-skeleton" />
                  <span className="sp-skeleton" />
                </div>
              ))}
            </div>
            {/* The readout's two groups, so the skeleton reflows where the real
                screen does (Phase 5 PR 2, sheet amendment I): under the fold the
                band pins between the search and the count header and the tail
                follows the list, so a skeleton that stayed one block would jump
                by the band's height when the directory lands. */}
            <div className="sp-recep-readout">
              <div className="sp-recep-band">
                <span className="sp-skeleton sp-skeleton--w3" />
                <span className="sp-skeleton sp-skeleton--w2" />
              </div>
              <div className="sp-recep-tail">
                <span className="sp-skeleton" />
              </div>
            </div>
          </div>
        </ReceptionFrame>
      </div>
    </div>
  );
}
