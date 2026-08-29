export type ProhibitedDataFinding = {
  readonly path: string;
  readonly kind: "key" | "value";
  readonly rule: string;
};

const PROHIBITED_KEY_RULES = [
  { rule: "child-name", pattern: /^(child|player|legal|full)?name$/ },
  {
    rule: "precise-age",
    pattern: /^(precise)?age$|birth(date|day)|dateofbirth/,
  },
  { rule: "school", pattern: /school|classroom|teachername/ },
  {
    rule: "location",
    pattern:
      /location|geolocation|latitude|longitude|postcode|zipcode|homeaddress|streetaddress/,
  },
  {
    rule: "raw-conversation",
    pattern: /raw(chat|message)|chatlog|transcript|prompt/,
  },
  {
    rule: "wallet",
    pattern: /wallet|accountaddress|publickey|privatekey|seedphrase/,
  },
  {
    rule: "behavioural-profile",
    pattern:
      /behavio(u)?ralprofile|psychologicalprofile|personalityprofile|engagementprofile|inferredprofile/,
  },
  { rule: "contact", pattern: /email|phonenumber|telephone|contactdetails/ },
] as const;

const PROHIBITED_VALUE_RULES = [
  {
    rule: "email-address",
    pattern: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  },
  { rule: "evm-wallet", pattern: /\b0x[a-f0-9]{40}\b/i },
  {
    rule: "phone-number",
    pattern: /(?:^|\s)(?:\+?\d[\d ().-]{7,}\d)(?:$|\s)/,
  },
  {
    rule: "precise-location",
    pattern: /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/,
  },
  {
    rule: "private-disclosure",
    pattern:
      /\b(?:my name is|i am \d{1,2} years old|i go to .* school|my school is|i live at|my home address|my wallet)\b/i,
  },
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Defense-in-depth scanner for data that must never cross the Compute boundary.
 * The guide schema deliberately has no such fields; this catches unsafe changes
 * if a future caller bypasses or widens that schema.
 */
export function scanProhibitedComputeData(
  input: unknown,
): readonly ProhibitedDataFinding[] {
  const findings: ProhibitedDataFinding[] = [];
  const visited = new WeakSet<object>();

  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      for (const { rule, pattern } of PROHIBITED_VALUE_RULES) {
        if (pattern.test(value)) {
          findings.push({ path, kind: "value", rule });
        }
      }
      return;
    }

    if (value === null || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      const entryPath = path === "$" ? `$.${key}` : `${path}.${key}`;
      const normalizedKey = normalizeKey(key);
      for (const { rule, pattern } of PROHIBITED_KEY_RULES) {
        if (pattern.test(normalizedKey)) {
          findings.push({ path: entryPath, kind: "key", rule });
        }
      }
      visit(entry, entryPath);
    }
  };

  visit(input, "$");
  return findings;
}

export function assertNoProhibitedComputeData(input: unknown): void {
  const findings = scanProhibitedComputeData(input);
  if (findings.length === 0) return;

  const first = findings[0];
  throw new Error(
    `Prohibited Compute data (${first?.rule ?? "unknown"}) at ${first?.path ?? "$"}`,
  );
}
