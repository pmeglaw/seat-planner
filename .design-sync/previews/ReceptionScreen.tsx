import { ReceptionScreen } from "seat-planner";

// ReceptionScreen is the /reception front-desk call-routing directory. It
// renders published data only and owns all interaction state internally, so
// the initial render (full roster, "Waiting for a call" detail card) is the
// one reachable story. The --r-* tokens are scoped to .reception-theme,
// mirroring app/(shell)/reception/page.tsx's wrapper.

const person = (
  id: string,
  name: string,
  position: string,
  department: string,
  extension: string | null,
  seatLabel: string | null,
  zone: string | null
) => ({ id, name, position, department, extension, seatLabel, zone });

// 8 rows so the full roster fits the 900x700 capture viewport (which sits
// below the lg two-column breakpoint — the detail card stacks underneath).
const people = [
  person("p1", "Anahit Petrosyan", "Senior Paralegal", "Litigation", "204", "A-12", "North Wing"),
  person("p2", "Daniel Kim", "Intake Specialist", "Intake", "218", "C-01", "South Wing"),
  person("p3", "Elena Vasquez", "Office Manager", "Records", "202", "C-03", "South Wing"),
  person("p4", "Grace Lindqvist", "Receptionist", "Intake", "200", "C-02", "South Wing"),
  person("p5", "James Harootunian", "Senior Attorney", "Litigation", "201", "A-05", "North Wing"),
  person("p6", "Marcus Webb", "Associate Attorney", "Litigation", "211", "B-03", "North Wing"),
  person("p7", "Maria Duarte", "Billing Coordinator", "Records", "226", null, null),
  person("p8", "Tom Okafor", "Litigation Paralegal", "Litigation", null, "A-03", "North Wing")
];

export const FrontDeskDirectory = () => (
  <div
    className="reception-theme"
    style={{
      minHeight: 700,
      background: "var(--sp-background, #EFECE6)",
      color: "var(--sp-text-primary, #161616)"
    }}
  >
    <ReceptionScreen people={people} />
  </div>
);
