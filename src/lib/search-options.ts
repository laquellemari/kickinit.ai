/** Dropdown options for the home search card. */
export const WHAT = ["Dinner", "Brunch", "Drinks", "Live music", "Comedy show", "Spa day", "Massage", "Yoga or Pilates", "Museum or gallery", "Theater", "Outdoors", "Surf or paddle", "Class or workshop", "Cooking class", "Weekend getaway"] as const;
export const WHEN = ["Morning", "Afternoon", "Evening"] as const;
export const WHO = ["1 guest", ...Array.from({ length: 9 }, (_, i) => `${i + 2} guests`)] as const;
export const GIFT_FOR = ["My partner", "My mom", "My dad", "My sister", "My brother", "A friend", "A coworker", "My grandparent"] as const;
export const OCCASION = ["Birthday", "Anniversary", "Thank you", "Congratulations", "Holiday", "Just because"] as const;
export const BUDGET = ["Under $50", "Under $100", "Under $200", "Under $500", "No limit"] as const;
/** Los Angeles first (where the partners are), then nearby, then other big US cities (request-to-book). */
export const WHERE = [
  "Los Angeles, CA", "Santa Monica, CA", "West Hollywood, CA", "Pasadena, CA", "Long Beach, CA", "Malibu, CA", "Palm Springs, CA", "Santa Barbara, CA",
  "San Diego, CA", "San Francisco, CA", "Las Vegas, NV", "Seattle, WA", "Denver, CO", "Austin, TX", "Houston, TX", "Chicago, IL", "Nashville, TN", "Miami, FL", "New York, NY", "Boston, MA", "Washington, DC",
] as const;
