// Seat data recreated from pmeglaw/seat-planner:
// - Pod seat coords: supabase/migrations/002_seed_initial_data.sql (normalized saved x/y)
// - Saved->visual calibration: lib/mapLayoutTransform.ts (per-area linear transforms)
// - OF office seats: display positions measured from docs/audits/2026-07-28 screenshots
(function () {
  var T = {
    north: { xs: 0.815189, xo: 0.101478, ys: 0.994098, yo: 0.014924 },
    neL: { xs: 0.944658, xo: 0.002919, ys: 1.044793, yo: 0.010215 },
    neR: { xs: 1.010018, xo: -0.056543, ys: 1.020304, yo: 0.012247 },
    west: { xs: 0.879674, xo: 0.076266, ys: 1.040423, yo: 0.016583 },
    cwU: { xs: 0.843074, xo: 0.086277, ys: 1.138639, yo: -0.026398 },
    cwL: { xs: 0.7805, xo: 0.1035, ys: 1.125499, yo: -0.031461 },
    cd: { xs: 0.876898, xo: 0.068871, ys: 1.069709, yo: 0.013881 },
    east: { xs: 0.867223, xo: 0.075999, ys: 1.108807, yo: -0.010603 },
    seU: { xs: 0.84886, xo: 0.080006, ys: 1.04, yo: 0.021498 },
    seL: { xs: 0.835824, xo: 0.094817, ys: 1.243613, yo: -0.093395 }
  };
  function tf(t, x, y) { return { x: x * t.xs + t.xo, y: y * t.ys + t.yo }; }
  function areaFor(label, x, y) {
    var p = label.match(/^[A-Z]+/)[0];
    if (p === "N") return T.north;
    if (p === "NE") return x < 0.849 ? T.neL : T.neR;
    if (p === "W") return T.west;
    if (p === "CW") return y < 0.5 ? T.cwU : T.cwL;
    if (p === "C") return T.cd;
    if (p === "E") return T.east;
    if (p === "SE") return y < 0.59 ? T.seU : T.seL;
    return null;
  }
  // label, saved x, saved y, zone (from 002_seed_initial_data.sql)
  var seed = [
    ["N01",0.288917,0.066468],["N02",0.345291,0.066468],["N03",0.406150,0.066468],["N04",0.461883,0.066468],
    ["N05",0.288917,0.137897],["N06",0.345291,0.137897],["N07",0.406150,0.137897],["N08",0.461883,0.137897],
    ["N09",0.288917,0.210317],["N10",0.345291,0.210317],["N11",0.406150,0.210317],["N12",0.461883,0.210317],
    ["NE01",0.771941,0.067460],["NE02",0.832159,0.067460],["NE03",0.875721,0.067460],["NE04",0.934017,0.067460],
    ["NE05",0.770019,0.142857],["NE06",0.831518,0.142857],["NE07",0.875721,0.144841],["NE08",0.934017,0.143849],
    ["W01",0.080077,0.382937],["W02",0.115951,0.382937],["W03",0.179372,0.382937],
    ["W04",0.080077,0.453373],["W05",0.115951,0.453373],["W06",0.179372,0.453373],
    ["W07",0.067905,0.549603],["W08",0.125561,0.549603],["W09",0.183216,0.549603],
    ["W10",0.067905,0.722222],["W11",0.122357,0.722222],["W12",0.183857,0.722222],
    ["CW01",0.299167,0.375992],["CW02",0.345291,0.375992],["CW03",0.298527,0.438492],["CW04",0.345291,0.438492],
    ["CW05",0.305573,0.548611],["CW06",0.337604,0.548611],["CW07",0.305573,0.710317],["CW08",0.338885,0.710317],
    ["C01",0.426650,0.536706],["C02",0.486227,0.536706],["C03",0.528507,0.536706],["C04",0.587444,0.536706],
    ["C05",0.427290,0.682540],["C06",0.486227,0.682540],["C07",0.528507,0.682540],["C08",0.587444,0.682540],
    ["E01",0.588085,0.382937],["E02",0.671365,0.382937],["E03",0.707239,0.382937],["E04",0.772582,0.382937],
    ["E05",0.588085,0.452381],["E06",0.671365,0.452381],["E07",0.707239,0.452381],["E08",0.772582,0.452381],
    ["SE01",0.885330,0.548611],["SE02",0.929532,0.548611],["SE03",0.903267,0.629960],["SE04",0.939782,0.612103]
  ];
  var zoneOf = { N: "North Pod", NE: "Northeast Pod", W: "West Pod", CW: "Center West", C: "Center Desks", E: "East Pod", SE: "Southeast Office", OF: "South Offices" };
  // OF office seats: visual (already-calibrated) fractions measured from the audit screenshots.
  var of = [
    ["OF01",0.140,0.178,"plate"],["OF02",0.192,0.212,"code"],["OF03",0.251,0.165,"plate"],["OF04",0.373,0.188,"code"],
    ["OF05",0.445,0.175,"code"],["OF06",0.500,0.202,"code"],["OF07",0.556,0.168,"plate"],["OF08",0.663,0.170,"plate"],
    ["OF09",0.736,0.133,"code"],["OF10",0.790,0.188,"code"],["OF11",0.146,0.267,"code"],["OF12",0.218,0.256,"code"],
    ["OF13",0.306,0.277,"code"],["OF14",0.371,0.267,"code"],["OF15",0.439,0.248,"code"],["OF16",0.514,0.256,"code"],
    ["OF17",0.595,0.267,"code"],["OF18",0.662,0.256,"code"],["OF19",0.721,0.254,"code"],["OF20",0.820,0.267,"code"],
    ["OF21",0.144,0.356,"code"],["OF22",0.235,0.343,"code"],["OF23",0.296,0.361,"code"],["OF24",0.366,0.356,"code"],
    ["OF25",0.442,0.343,"code"],["OF26",0.521,0.361,"code"],["OF27",0.586,0.356,"code"],["OF28",0.652,0.343,"code"],
    ["OF29",0.745,0.361,"code"],["OF30",0.809,0.356,"code"]
  ];
  // seat -> [name, position, department]
  var roster = {
    C01:["Adele Marchetti","Billing Specialist","IT"],C02:["Alex Shabazian","","Intake"],C03:["Alice Nguyen","Associate Attorney","Pre-Litigation"],C04:["Anthony Cruz","","Litigation"],
    C05:["Aria Moretti","Associate Attorney","Case Management"],C06:["Bodhi Rana","Case Manager","Intake"],C07:["Brandon Okafor","Case Manager","Case Management"],C08:["Bruno Sorensen","IT Support","Litigation"],
    CW01:["Camille Ramirez","Intake Specialist","Intake"],CW02:["Clio Stavros","Paralegal","Litigation"],CW03:["Cora Diallo","Legal Assistant","Records"],CW04:["Daniel Garcia","IT Support","IT"],
    CW05:["David Kim","Attorney","Litigation"],CW06:["Diego Fuentes","Case Manager","Case Management"],CW07:["Elena Vasquez","Paralegal","Pre-Litigation"],
    E01:["Emil Novak","Accountant","Accounting"],E02:["Farah Khan","Intake Specialist","Intake"],E03:["Felix Turner","Paralegal","Litigation"],E04:["Gia Romano","Case Manager","Case Management"],
    E05:["Grace Liu","Associate Attorney","Pre-Litigation"],E06:["Hana Suzuki","Records Clerk","Records"],E07:["Hugo Marchand","Paralegal","Litigation"],E08:["Ines Castro","Intake Specialist","Intake"],
    N01:["Ivan Petrov","Case Manager","Case Management"],N02:["Jade Whitfield","Paralegal","Pre-Litigation"],N03:["Jonas Weber","Accountant","Accounting"],N04:["Julia Santos","Legal Assistant","Records"],
    N05:["Kai Nakamura","IT Support","IT"],N06:["Lena Fischer","Paralegal","Litigation"],N07:["Leo Barnes","Case Manager","Case Management"],N08:["Lucia Moreno","Intake Specialist","Intake"],
    NE01:["Marco Silva","Paralegal","Pre-Litigation"],NE02:["Maria Lopez","Case Manager","Case Management"],NE03:["Maya Singh","Associate Attorney","Litigation"],NE04:["Miles Carter","Accountant","Accounting"],
    NE05:["Nadia Rahman","Records Clerk","Records"],NE06:["Nina Patel","Accountant","Accounting"],NE07:["Noah Kim","Paralegal","Pre-Litigation"],NE08:["Olga Ivanova","Intake Specialist","Intake"],
    W01:["Omar Haddad","Case Manager","Case Management"],W02:["Owen Riley","Paralegal","Litigation"],W03:["Paolo Ricci","Intake Specialist","Intake"],W04:["Petra Kovacs","Legal Assistant","Records"],
    W05:["Quinn Foster","Paralegal","Pre-Litigation"],W06:["Rafael Ortiz","Case Manager","Case Management"],W07:["Rebecca Stone","Associate Attorney","Litigation"],W08:["Rosa Mendez","Intake Specialist","Intake"],
    W09:["Ruth Adler","Paralegal","Litigation"],SE01:["Sofia Marino","Office Admin","Accounting"],SE02:["Tessa Boyd","Records Manager","Records"],
    OF01:["Priya Shah","Senior Paralegal","Pre-Litigation"],OF02:["Noor Farid","Attorney","Litigation"],OF03:["Rachel Nguyen","Records Manager","Records"],OF04:["Theo Lang","Case Manager","Case Management"],
    OF05:["Uma Krishnan","Attorney","Litigation"],OF06:["Vera Kovac","Paralegal","Pre-Litigation"],OF07:["Samantha Reed","Managing Attorney","Pre-Litigation"],OF08:["Samir Rahimi","Office Coordinator","Operations"],
    OF09:["Victor Chen","Attorney","Litigation"],OF10:["Wendy Park","Intake Specialist","Intake"]
  };
  var reserved = { OF28: 1, OF29: 1 };
  var unavailable = { OF30: 1 };
  var seats = [];
  seed.forEach(function (s) {
    var label = s[0], p = label.match(/^[A-Z]+/)[0];
    var v = tf(areaFor(label, s[1], s[2]), s[1], s[2]);
    seats.push({ label: label, x: v.x, y: v.y, kind: "code", zone: zoneOf[p] });
  });
  of.forEach(function (s) {
    seats.push({ label: s[0], x: s[1], y: s[2], kind: s[3], zone: "South Offices" });
  });
  seats.forEach(function (s) {
    var r = roster[s.label];
    s.name = r ? r[0] : "";
    s.position = r ? r[1] : "";
    s.dept = r ? r[2] : "";
    s.status = r ? "assigned" : reserved[s.label] ? "reserved" : unavailable[s.label] ? "unavailable" : "available";
    if (s.label === "OF01") s.draft = true; // ZZCANARYDRAFT canary row, D badge
    var parts = s.name.split(" ");
    s.shortName = parts[0] ? parts[0] + (parts[1] ? " " + parts[1][0] + "." : "") : "";
    s.initials = parts[0] ? (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase() : "";
  });
  window.SEAT_DATA = { seats: seats };
})();
