export const SITE_NAME = "Alumni Connect";

/** What alumni can advise on. Broad enough for any college or university. */
export const ADVICE_GROUPS = [
  {
    title: "Technical domains",
    hint: "",
    areas: [
      "Software engineering",
      "AI, machine learning & data science",
      "Cybersecurity & networks",
      "Electronics, VLSI & semiconductors",
      "Embedded systems & IoT",
      "Robotics & automation",
      "Mechanical & automotive engineering",
      "Civil engineering & infrastructure",
      "Chemical & process engineering",
      "Energy, climate & sustainability",
      "Biotech, life sciences & healthcare",
      "Materials & manufacturing",
      "Physics, maths & scientific computing",
      "Product, UX & design",
      "Architecture & urban planning",
    ],
  },
  {
    title: "Careers & industries",
    hint: "",
    areas: [
      "Big Tech & software roles",
      "Core engineering jobs",
      "Product management",
      "Consulting & strategy",
      "Finance, banking & investing",
      "Quant & trading",
      "Marketing, sales & growth",
      "Law & policy",
      "Medicine & healthcare careers",
      "Government & public sector",
      "Media, arts & creative careers",
      "Nonprofits & social impact",
      "Working abroad",
    ],
  },
  {
    title: "Higher studies & research",
    hint: "",
    areas: [
      "Master's & PhD applications abroad",
      "MBA & management programs",
      "Entrance exams & scholarships",
      "Research careers & publishing",
    ],
  },
  {
    title: "Startups & early career",
    hint: "",
    areas: [
      "Founding a startup",
      "Fundraising & early-stage investing",
      "Internships & placements",
      "Resumes & interviews",
      "Competitions & hackathons",
      "Switching fields",
    ],
  },
] as const;

export const ADVICE_AREAS = ADVICE_GROUPS.flatMap((g) => g.areas) as unknown as readonly [string, ...string[]];

/** Suggestions only: departments and degrees are free text, since every institution names them differently. */
export const DEGREES = [
  "B.Tech / B.E.", "B.Sc", "B.A.", "B.Com", "BBA", "B.Arch", "B.Des", "MBBS", "LLB", "Dual degree",
  "M.Tech / M.E.", "M.Sc", "M.A.", "MBA", "MCA", "PhD", "Diploma", "Other",
] as const;

export const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "5th year", "Postgraduate"] as const;

export const DURATIONS = [30, 45, 60] as const;

export const MAX_UPCOMING_BOOKINGS = 3;
/** Students book at least this far ahead. Must match public.min_notice() in the database. */
export const MIN_NOTICE_HOURS = 48;
export const minNoticeCutoff = () => new Date(Date.now() + MIN_NOTICE_HOURS * 3600 * 1000);
export const MATCHES_PER_DAY = 20;
