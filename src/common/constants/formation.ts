/** The states a formation can be filed in (frontend constants/vocab.ts FORMATION_STATES). */
export const FORMATION_STATES = ["Wyoming", "Delaware", "New Mexico", "Florida", "Texas"] as const;

/** Phone numbers: digits, spaces, +, - and brackets, 7 to 20 characters (frontend store/actions/people.ts). Empty clears it. */
export const PHONE_PATTERN = /^[+()\d\s-]{7,20}$/;
export const PHONE_MESSAGE = "Enter a phone number using digits, spaces, +, - or brackets (7 to 20 characters).";

/** Column sizes of ClientProfile. */
export const LIMITS = { businessName: 160, address: 300, preferredName: 120, name: 120 } as const;
