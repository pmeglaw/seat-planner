/**
 * Prototype-only fixture: the real 60-seat PUBLISHED map captured 2026-07-08 from
 * Supabase project wujsniclwzefvufavama (seats layer='published' joined to
 * published_employees). Coordinates are saved/normalized x,y in [0,1] — render
 * them through lib/mapLayoutTransform (seatsToVisualSeats) + lib/seatMath
 * (pointToStyle) exactly like production so markers land on the same chairs.
 *
 * Floor plan image: /images/office-floor-plan.png (1695x841, map-v3).
 * Counts: 60 published · 6 assigned · 54 available.
 */

export type FixtureSeatStatus = "available" | "assigned" | "reserved" | "unavailable";

export type FixtureSeat = {
  seat_key: string;
  label: string;
  x: number;
  y: number;
  status: FixtureSeatStatus;
  zone: string;
  is_custom: boolean;
  full_name: string | null;
  position: string | null;
  phone_extension: string | null;
  emp_department: string | null;
};

export const FIXTURE_ZONES = [
  "Center Desks",
  "Center West",
  "East Pod",
  "North Pod",
  "Northeast Pod",
  "Southeast Office",
  "West Pod"
] as const;

export const FIXTURE_SEATS: FixtureSeat[] = [
  { seat_key: "C01", label: "C01", x: 0.420564, y: 0.535714, status: "available", zone: "Center Desks", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "C02", label: "C02", x: 0.486227, y: 0.536706, status: "available", zone: "Center Desks", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "C03", label: "C03", x: 0.528507, y: 0.536706, status: "available", zone: "Center Desks", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "C04", label: "C04", x: 0.587444, y: 0.536706, status: "available", zone: "Center Desks", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "C05", label: "C05", x: 0.42729, y: 0.68254, status: "available", zone: "Center Desks", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "C06", label: "C06", x: 0.486227, y: 0.68254, status: "available", zone: "Center Desks", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "C07", label: "C07", x: 0.528507, y: 0.68254, status: "assigned", zone: "Center Desks", is_custom: false, full_name: "DANIEL", position: "Social Media", phone_extension: null, emp_department: null },
  { seat_key: "C08", label: "C08", x: 0.587444, y: 0.68254, status: "available", zone: "Center Desks", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW01", label: "CW01", x: 0.299167, y: 0.375992, status: "assigned", zone: "Center West", is_custom: false, full_name: "MIKE", position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW02", label: "CW02", x: 0.345291, y: 0.375992, status: "available", zone: "Center West", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW03", label: "CW03", x: 0.298527, y: 0.438492, status: "available", zone: "Center West", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW04", label: "CW04", x: 0.345291, y: 0.438492, status: "available", zone: "Center West", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW05", label: "CW05", x: 0.305573, y: 0.548611, status: "available", zone: "Center West", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW06", label: "CW06", x: 0.337604, y: 0.548611, status: "available", zone: "Center West", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW07", label: "CW07", x: 0.305573, y: 0.710317, status: "available", zone: "Center West", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "CW08", label: "CW08", x: 0.338885, y: 0.710317, status: "available", zone: "Center West", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "e01-mpwz8zxl", label: "E01", x: 0.587764, y: 0.383929, status: "available", zone: "East Pod", is_custom: true, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "E02", label: "E02", x: 0.671365, y: 0.382937, status: "available", zone: "East Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "E03", label: "E03", x: 0.707239, y: 0.382937, status: "available", zone: "East Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "E04", label: "E04", x: 0.772582, y: 0.382937, status: "available", zone: "East Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "E05", label: "E05", x: 0.588085, y: 0.452381, status: "available", zone: "East Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "E06", label: "E06", x: 0.671365, y: 0.452381, status: "available", zone: "East Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "E07", label: "E07", x: 0.707239, y: 0.452381, status: "available", zone: "East Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "E08", label: "E08", x: 0.772582, y: 0.452381, status: "available", zone: "East Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N01", label: "N01", x: 0.288917, y: 0.066468, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N02", label: "N02", x: 0.345291, y: 0.066468, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N03", label: "N03", x: 0.40615, y: 0.066468, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N04", label: "N04", x: 0.461883, y: 0.066468, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N05", label: "N05", x: 0.288917, y: 0.137897, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N06", label: "N06", x: 0.345291, y: 0.137897, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N07", label: "N07", x: 0.40615, y: 0.137897, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N08", label: "N08", x: 0.461883, y: 0.137897, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N09", label: "N09", x: 0.288917, y: 0.210317, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N10", label: "N10", x: 0.345291, y: 0.210317, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N11", label: "N11", x: 0.40615, y: 0.210317, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "N12", label: "N12", x: 0.461883, y: 0.210317, status: "available", zone: "North Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE01", label: "NE01", x: 0.771941, y: 0.06746, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE02", label: "NE02", x: 0.832159, y: 0.06746, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE03", label: "NE03", x: 0.866266, y: 0.066037, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE04", label: "NE04", x: 0.922105, y: 0.067196, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE05", label: "NE05", x: 0.770019, y: 0.142857, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE06", label: "NE06", x: 0.831518, y: 0.142857, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE07", label: "NE07", x: 0.867847, y: 0.14603, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "NE08", label: "NE08", x: 0.922105, y: 0.142551, status: "available", zone: "Northeast Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "SE01", label: "SE01", x: 0.88533, y: 0.548611, status: "available", zone: "Southeast Office", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "SE02", label: "SE02", x: 0.929532, y: 0.548611, status: "available", zone: "Southeast Office", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "SE03", label: "SE03", x: 0.903267, y: 0.62996, status: "available", zone: "Southeast Office", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "SE04", label: "SE04", x: 0.939782, y: 0.612103, status: "available", zone: "Southeast Office", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W01", label: "W01", x: 0.080077, y: 0.382937, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W02", label: "W02", x: 0.115951, y: 0.382937, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W03", label: "W03", x: 0.179372, y: 0.382937, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W04", label: "W04", x: 0.080077, y: 0.453373, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W05", label: "W05", x: 0.115951, y: 0.453373, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W06", label: "W06", x: 0.179372, y: 0.453373, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W07", label: "W07", x: 0.067905, y: 0.549603, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W08", label: "W08", x: 0.125561, y: 0.549603, status: "assigned", zone: "West Pod", is_custom: true, full_name: "PATRICK", position: null, phone_extension: "202", emp_department: "IT" },
  { seat_key: "W09", label: "W09", x: 0.183216, y: 0.549603, status: "assigned", zone: "West Pod", is_custom: false, full_name: "PAM", position: null, phone_extension: null, emp_department: null },
  { seat_key: "W10", label: "W10", x: 0.067905, y: 0.722222, status: "available", zone: "West Pod", is_custom: false, full_name: null, position: null, phone_extension: null, emp_department: null },
  { seat_key: "W11", label: "W11", x: 0.122357, y: 0.722222, status: "assigned", zone: "West Pod", is_custom: false, full_name: "ALEX S", position: null, phone_extension: null, emp_department: "Accounting" },
  { seat_key: "W12", label: "W12", x: 0.183857, y: 0.722222, status: "assigned", zone: "West Pod", is_custom: false, full_name: "RENATA", position: "Executive Assistant", phone_extension: null, emp_department: null }
];
