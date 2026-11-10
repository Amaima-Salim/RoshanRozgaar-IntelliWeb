/**
 * Seed data, part 1 (Phase 0; docs/01 §7, D-16). Everything here is fictional.
 *
 * Area centroids are APPROXIMATE, written from general map knowledge of
 * Islamabad/Rawalpindi at authoring time (2026-11-10), not surveyed. They only
 * need to be in roughly the right place for distance ranking. `is_approximate`
 * is true for all of them and the README says so.
 */

export type Trade = "electrician" | "plumber" | "ac_technician" | "carpenter" | "mechanic";

export const AREAS = [
  { slug: "f-7", nameEn: "F-7", nameUr: "ایف سیون", city: "islamabad", lat: 33.7205, lng: 73.0562 },
  { slug: "g-9", nameEn: "G-9", nameUr: "جی نائن", city: "islamabad", lat: 33.6935, lng: 73.0295 },
  {
    slug: "g-11",
    nameEn: "G-11",
    nameUr: "جی الیون",
    city: "islamabad",
    lat: 33.6686,
    lng: 72.9972,
  },
  { slug: "i-8", nameEn: "I-8", nameUr: "آئی ایٹ", city: "islamabad", lat: 33.6672, lng: 73.0758 },
  {
    slug: "e-11",
    nameEn: "E-11",
    nameUr: "ای الیون",
    city: "islamabad",
    lat: 33.6975,
    lng: 72.9758,
  },
  {
    slug: "satellite-town",
    nameEn: "Satellite Town",
    nameUr: "سیٹلائٹ ٹاؤن",
    city: "rawalpindi",
    lat: 33.6381,
    lng: 73.0703,
  },
  {
    slug: "saddar-rwp",
    nameEn: "Saddar (Rawalpindi)",
    nameUr: "صدر راولپنڈی",
    city: "rawalpindi",
    lat: 33.5973,
    lng: 73.0479,
  },
  {
    slug: "bahria-town",
    nameEn: "Bahria Town",
    nameUr: "بحریہ ٹاؤن",
    city: "rawalpindi",
    lat: 33.5275,
    lng: 73.1003,
  },
] as const;

export type AreaSlug = (typeof AREAS)[number]["slug"];

/** Weekly hours in Asia/Karachi local minutes; weekday 0 = Sunday … 6 = Saturday. */
export type ScheduleTemplate = "day" | "evening" | "long" | "weekend";

export const SCHEDULE_TEMPLATES: Record<
  ScheduleTemplate,
  { weekdays: number[]; startMin: number; endMin: number }[]
> = {
  day: [{ weekdays: [1, 2, 3, 4, 5, 6], startMin: 9 * 60, endMin: 18 * 60 }],
  evening: [{ weekdays: [1, 2, 3, 4, 5, 6], startMin: 14 * 60, endMin: 22 * 60 }],
  long: [
    { weekdays: [1, 2, 3, 4, 5, 6], startMin: 8 * 60, endMin: 21 * 60 },
    { weekdays: [0], startMin: 10 * 60, endMin: 16 * 60 },
  ],
  weekend: [{ weekdays: [0, 5, 6], startMin: 9 * 60, endMin: 20 * 60 }],
};

export type SeedWorker = {
  key: string;
  name: string;
  nameUr: string;
  trade: Trade;
  years: number;
  ratePkr: number;
  rateBasis: "per_visit" | "per_hour" | "per_job";
  areas: AreaSlug[];
  available: boolean;
  schedule: ScheduleTemplate;
  /** Base point as a km offset from EDGE_CASE_REFERENCE_AREA, for distance edge cases. */
  baseOffsetKm?: { north: number; east: number };
  edgeCase?: string;
};

/** Demo customers sign in with one tap (docs/05 §1). Phones follow the fake 0300-0000XXX pattern. */
export const DEMO_CUSTOMERS = [
  {
    key: "customer-1",
    name: "Ayesha Khan",
    nameUr: "عائشہ خان",
    phone: "03000000001",
    area: "g-9" as AreaSlug,
  },
  {
    key: "customer-2",
    name: "Bilal Ahmed",
    nameUr: "بلال احمد",
    phone: "03000000002",
    area: "f-7" as AreaSlug,
  },
  {
    key: "customer-3",
    name: "Sana Malik",
    nameUr: "ثنا ملک",
    phone: "03000000003",
    area: "satellite-town" as AreaSlug,
  },
];

/** Starts un-onboarded so judges can watch O1 live. */
export const DEMO_WORKER = {
  key: "demo-worker",
  name: "Demo Worker",
  nameUr: "ڈیمو کاریگر",
  phone: "03000000010",
};

/**
 * Reference point for the distance edge cases: the G-9 centroid, which is
 * Demo Customer 1's area.
 */
export const EDGE_CASE_REFERENCE_AREA: AreaSlug = "g-9";

export const WORKERS: SeedWorker[] = [
  // ── Electricians ──
  {
    key: "w-elec-1",
    name: "Imran Qureshi",
    nameUr: "عمران قریشی",
    trade: "electrician",
    years: 18,
    ratePkr: 1500,
    rateBasis: "per_visit",
    areas: ["bahria-town"],
    available: true,
    schedule: "long",
    baseOffsetKm: { north: -12.2, east: 6.9 }, // ≈ 14 km from G-9: outside the 10 km radius
    edgeCase: "1: excellent ratings but ~14 km away",
  },
  {
    key: "w-elec-2",
    name: "Kashif Mehmood",
    nameUr: "کاشف محمود",
    trade: "electrician",
    years: 9,
    ratePkr: 1200,
    rateBasis: "per_visit",
    areas: ["g-9", "g-11"],
    available: false,
    schedule: "day",
    edgeCase: "2: nearby but availability toggle OFF",
  },
  {
    key: "w-elec-3",
    name: "Naveed Akhtar",
    nameUr: "نوید اختر",
    trade: "electrician",
    years: 6,
    ratePkr: 1000,
    rateBasis: "per_visit",
    areas: ["g-9", "i-8"],
    available: true,
    schedule: "day",
    edgeCase: "3: nearby, already booked for the next 2 h (a real confirmed job row)",
  },
  {
    key: "w-elec-4",
    name: "Usman Tariq",
    nameUr: "عثمان طارق",
    trade: "electrician",
    years: 1,
    ratePkr: 800,
    rateBasis: "per_visit",
    areas: ["g-11", "e-11"],
    available: true,
    schedule: "evening",
    edgeCase: "4: brand new, no reviews",
  },
  {
    key: "w-elec-5",
    name: "Farhan Saeed",
    nameUr: "فرحان سعید",
    trade: "electrician",
    years: 12,
    ratePkr: 1400,
    rateBasis: "per_visit",
    areas: ["satellite-town", "saddar-rwp"],
    available: true,
    schedule: "long",
    edgeCase: "5: mixed reviews (punctual but pricey)",
  },
  // ── Plumbers ──
  {
    key: "w-plmb-1",
    name: "Zahid Hussain",
    nameUr: "زاہد حسین",
    trade: "plumber",
    years: 10,
    ratePkr: 1000,
    rateBasis: "per_visit",
    areas: ["g-9", "f-7"],
    available: true,
    schedule: "day",
    baseOffsetKm: { north: -0.6, east: 0.5 }, // same point as its twin
    edgeCase: "6a: twin of w-plmb-2, cheaper",
  },
  {
    key: "w-plmb-2",
    name: "Tahir Abbas",
    nameUr: "طاہر عباس",
    trade: "plumber",
    years: 10,
    ratePkr: 1600,
    rateBasis: "per_visit",
    areas: ["g-9", "f-7"],
    available: true,
    schedule: "day",
    baseOffsetKm: { north: -0.6, east: 0.5 }, // same point as its twin
    edgeCase: "6b: twin of w-plmb-1, pricier",
  },
  {
    key: "w-plmb-3",
    name: "Sajid Iqbal",
    nameUr: "ساجد اقبال",
    trade: "plumber",
    years: 15,
    ratePkr: 1300,
    rateBasis: "per_visit",
    areas: ["i-8", "satellite-town"],
    available: true,
    schedule: "long",
  },
  {
    key: "w-plmb-4",
    name: "Waqas Ali",
    nameUr: "وقاص علی",
    trade: "plumber",
    years: 4,
    ratePkr: 900,
    rateBasis: "per_visit",
    areas: ["g-11", "e-11"],
    available: true,
    schedule: "evening",
  },
  {
    key: "w-plmb-5",
    name: "Rashid Mehmood",
    nameUr: "راشد محمود",
    trade: "plumber",
    years: 20,
    ratePkr: 1800,
    rateBasis: "per_visit",
    areas: ["saddar-rwp", "bahria-town"],
    available: true,
    schedule: "weekend",
  },
  // ── AC technicians ──
  {
    key: "w-ac-1",
    name: "Asif Raza",
    nameUr: "آصف رضا",
    trade: "ac_technician",
    years: 11,
    ratePkr: 2500,
    rateBasis: "per_visit",
    areas: ["f-7", "g-9"],
    available: true,
    schedule: "day",
  },
  {
    key: "w-ac-2",
    name: "Shahid Nawaz",
    nameUr: "شاہد نواز",
    trade: "ac_technician",
    years: 7,
    ratePkr: 2000,
    rateBasis: "per_visit",
    areas: ["g-11", "e-11"],
    available: true,
    schedule: "long",
  },
  {
    key: "w-ac-3",
    name: "Junaid Akram",
    nameUr: "جنید اکرم",
    trade: "ac_technician",
    years: 3,
    ratePkr: 1800,
    rateBasis: "per_visit",
    areas: ["i-8", "satellite-town"],
    available: true,
    schedule: "evening",
  },
  {
    key: "w-ac-4",
    name: "Mudassar Iqbal",
    nameUr: "مدثر اقبال",
    trade: "ac_technician",
    years: 14,
    ratePkr: 3000,
    rateBasis: "per_visit",
    areas: ["saddar-rwp", "satellite-town"],
    available: true,
    schedule: "day",
  },
  {
    key: "w-ac-5",
    name: "Adeel Butt",
    nameUr: "عدیل بٹ",
    trade: "ac_technician",
    years: 8,
    ratePkr: 2200,
    rateBasis: "per_visit",
    areas: ["bahria-town"],
    available: true,
    schedule: "weekend",
  },
  // ── Carpenters ──
  {
    key: "w-carp-1",
    name: "Ghulam Rasool",
    nameUr: "غلام رسول",
    trade: "carpenter",
    years: 25,
    ratePkr: 3500,
    rateBasis: "per_job",
    areas: ["g-9", "i-8"],
    available: true,
    schedule: "day",
  },
  {
    key: "w-carp-2",
    name: "Akbar Khan",
    nameUr: "اکبر خان",
    trade: "carpenter",
    years: 9,
    ratePkr: 800,
    rateBasis: "per_hour",
    areas: ["f-7", "e-11"],
    available: true,
    schedule: "long",
  },
  {
    key: "w-carp-3",
    name: "Nadeem Shah",
    nameUr: "ندیم شاہ",
    trade: "carpenter",
    years: 5,
    ratePkr: 2500,
    rateBasis: "per_job",
    areas: ["satellite-town", "saddar-rwp"],
    available: true,
    schedule: "evening",
  },
  {
    key: "w-carp-4",
    name: "Pervaiz Masih",
    nameUr: "پرویز مسیح",
    trade: "carpenter",
    years: 16,
    ratePkr: 3000,
    rateBasis: "per_job",
    areas: ["g-11"],
    available: true,
    schedule: "weekend",
  },
  {
    key: "w-carp-5",
    name: "Iftikhar Ahmed",
    nameUr: "افتخار احمد",
    trade: "carpenter",
    years: 2,
    ratePkr: 600,
    rateBasis: "per_hour",
    areas: ["bahria-town", "saddar-rwp"],
    available: true,
    schedule: "day",
  },
  // ── Mechanics ──
  {
    key: "w-mech-1",
    name: "Liaqat Ali",
    nameUr: "لیاقت علی",
    trade: "mechanic",
    years: 22,
    ratePkr: 1500,
    rateBasis: "per_visit",
    areas: ["i-8", "g-9"],
    available: true,
    schedule: "long",
  },
  {
    key: "w-mech-2",
    name: "Rizwan Haider",
    nameUr: "رضوان حیدر",
    trade: "mechanic",
    years: 6,
    ratePkr: 1200,
    rateBasis: "per_visit",
    areas: ["g-11", "e-11"],
    available: true,
    schedule: "day",
  },
  {
    key: "w-mech-3",
    name: "Babar Javed",
    nameUr: "بابر جاوید",
    trade: "mechanic",
    years: 13,
    ratePkr: 1700,
    rateBasis: "per_visit",
    areas: ["satellite-town", "saddar-rwp"],
    available: true,
    schedule: "evening",
  },
  {
    key: "w-mech-4",
    name: "Shoaib Anwar",
    nameUr: "شعیب انور",
    trade: "mechanic",
    years: 8,
    ratePkr: 1300,
    rateBasis: "per_visit",
    areas: ["f-7", "bahria-town"],
    available: true,
    schedule: "weekend",
  },
];
