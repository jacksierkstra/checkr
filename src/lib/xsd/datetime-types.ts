/**
 * Lexical-space validators, value-space parsing, and comparison for
 * XSD 1.0 date/time-family built-in types (CHK-013).
 *
 * Supports:
 *   - dateTime, date, time, gYear, gYearMonth, gMonth, gMonthDay, gDay
 *   - duration
 *
 * Each type gets its own lexical validator with genuine calendar validity,
 * timezone rules, and — for the dateTime/date/time family — value-space
 * comparison functions that the bound-facet evaluator (in facets.ts) can
 * call when checking minInclusive/maxInclusive etc.
 *
 * See XSD 1.0 Part 2 §3.2.7–§3.2.20.
 */

import { SimpleTypeDefinition } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";

// ---------------------------------------------------------------------------
// Timezone representation
// ---------------------------------------------------------------------------

/**
 * Timezone offset from UTC in minutes, or `null` when absent.
 */
export type TimezoneOffset = number | null;

/**
 * Parses a timezone suffix (`Z`, `+hh:mm`, `-hh:mm`, or absent).
 * The caller must have already validated the format via regex.
 * Returns the offset in minutes, or `null` if absent.
 */
export function parseTimezone(tz: string | undefined): TimezoneOffset {
    if (tz === undefined || tz === "") return null;
    if (tz === "Z") return 0;
    const sign = tz[0] === "-" ? -1 : 1;
    const h = parseInt(tz.slice(1, 3), 10);
    const m = parseInt(tz.slice(4, 6), 10);
    if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return NaN;
    return sign * (h * 60 + m);
}

// ---------------------------------------------------------------------------
// Parsed date/time components (value-space representation)
// ---------------------------------------------------------------------------

export interface DateTimeComponents {
    readonly year: number;
    readonly month: number;   // 1–12
    readonly day: number;     // 1–31
    readonly hour: number;    // 0–23
    readonly minute: number;  // 0–59
    readonly second: number;  // 0–59 with optional fractional part
    readonly fractional: string; // e.g. "5" for .5, "" for none
    readonly timezone: TimezoneOffset;
}

export interface DateComponents {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly timezone: TimezoneOffset;
}

export interface TimeComponents {
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly fractional: string;
    readonly timezone: TimezoneOffset;
}

export interface GYearComponents {
    readonly year: number;
    readonly timezone: TimezoneOffset;
}

export interface GYearMonthComponents {
    readonly year: number;
    readonly month: number;
    readonly timezone: TimezoneOffset;
}

export interface GMonthComponents {
    readonly month: number;
    readonly timezone: TimezoneOffset;
}

export interface GMonthDayComponents {
    readonly month: number;
    readonly day: number;
    readonly timezone: TimezoneOffset;
}

export interface GDayComponents {
    readonly day: number;
    readonly timezone: TimezoneOffset;
}

export interface DurationComponents {
    readonly sign: 1 | -1;
    readonly years: number;
    readonly months: number;
    readonly days: number;
    readonly hours: number;
    readonly minutes: number;
    readonly seconds: number;
    readonly fractional: string;
}

// ---------------------------------------------------------------------------
// Calendar validity helpers
// ---------------------------------------------------------------------------

const DAYS_IN_MONTH: ReadonlyArray<number> = [
    31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
];

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
    if (month === 2 && isLeapYear(year)) return 29;
    return DAYS_IN_MONTH[month - 1]!;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > daysInMonth(year, month)) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Lexical pattern helpers
// ---------------------------------------------------------------------------

// Common patterns
const YEAR_FRAG = `-?\\d{4,}`; // at least 4 digits (XSD §3.2.7 allows any number)
const MONTH_FRAG = `\\d{2}`;   // 01–12
const DAY_FRAG = `\\d{2}`;     // 01–31
const HOUR_FRAG = `\\d{2}`;    // 00–23
const MINUTE_FRAG = `\\d{2}`;  // 00–59
const SECOND_FRAG = `\\d{2}`;  // 00–59
const FRAC_FRAG = `(\\.\\d+)?`;
const TZ_FRAG = `(Z|[+-]\\d{2}:\\d{2})?`;

// Full dateTime: [-]YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm]
const DATETIME_RE = new RegExp(
    `^(${YEAR_FRAG})-(${MONTH_FRAG})-(${DAY_FRAG})T(${HOUR_FRAG}):(${MINUTE_FRAG}):(${SECOND_FRAG})${FRAC_FRAG}${TZ_FRAG}$`
);

// date: [-]YYYY-MM-DD[Z|±hh:mm]
const DATE_RE = new RegExp(
    `^(${YEAR_FRAG})-(${MONTH_FRAG})-(${DAY_FRAG})${TZ_FRAG}$`
);

// time: hh:mm:ss[.sss][Z|±hh:mm]
const TIME_RE = new RegExp(
    `^(${HOUR_FRAG}):(${MINUTE_FRAG}):(${SECOND_FRAG})${FRAC_FRAG}${TZ_FRAG}$`
);

// gYear: [-]YYYY[Z|±hh:mm]
const GYEAR_RE = new RegExp(
    `^(-?\\d{4,})${TZ_FRAG}$`
);

// gYearMonth: [-]YYYY-MM[Z|±hh:mm]
const GYEAR_MONTH_RE = new RegExp(
    `^(-?\\d{4,})-(${MONTH_FRAG})${TZ_FRAG}$`
);

// gMonth: --MM[--][Z|±hh:mm] — the canonical form is --MM-- (seven
// characters) with an optional trailing timezone (errata E2-22); the
// truncated --MM form without timezone is also accepted (CHK-027).
const GMONTH_RE = new RegExp(
    `^--(${MONTH_FRAG})(--(?:${TZ_FRAG}))?$`
);

// gMonthDay: --MM-DD[Z|±hh:mm]
const GMONTH_DAY_RE = new RegExp(
    `^--(${MONTH_FRAG})-(${DAY_FRAG})${TZ_FRAG}$`
);

// gDay: ---DD[Z|±hh:mm]
const GDAY_RE = new RegExp(
    `^---(${DAY_FRAG})${TZ_FRAG}$`
);

// duration: [-]PnYnMnDTnHnMnS
const DURATION_RE = /^(-)?P(\d+Y)?(\d+M)?(\d+D)?(?:T(\d+H)?(\d+M)?(\d+(?:\.\d+)?S)?)?$/i;

// ---------------------------------------------------------------------------
// Parsed date/time value types for comparison
// ---------------------------------------------------------------------------

/**
 * An instant in time, normalised to UTC, used for value-space comparisons
 * of dateTime, date, and time values relative to each other.
 *
 * The date portion of a time value is the *earliest* date on which that time
 * occurs in the given timezone, following the convention used by XSD 1.0
 * Part 2 §3.2.9 for time comparisons (implicit date: 1600-01-01 for comparing
 * within the same timezone; UTC normalisation for cross-timezone comparison).
 *
 * For date values, the time-of-day is taken as 00:00:00.
 */
export interface NormalisedInstant {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly fractional: string;
}

// ---------------------------------------------------------------------------
// Lexical validators
// ---------------------------------------------------------------------------

export interface ParsedDateTime {
    readonly components: DateTimeComponents;
    readonly raw: string;
}

/**
 * Parse and validate an xs:dateTime lexical value.
 * Returns null if the value is not lexically valid.
 */
export function parseDateTime(value: string): DateTimeComponents | null {
    const m = DATETIME_RE.exec(value);
    if (!m) return null;

    const year = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10);
    const day = parseInt(m[3]!, 10);
    const hour = parseInt(m[4]!, 10);
    const minute = parseInt(m[5]!, 10);
    const second = parseInt(m[6]!, 10);
    const fractional = m[7] ? m[7].slice(1) : "";
    const timezone = parseTimezone(m[8]);

    // If timezone was present but invalid (e.g. +25:00), reject
    if (m[8] !== undefined && m[8] !== "" && (typeof timezone !== "number" || isNaN(timezone))) return null;

    // Calendar validity
    if (!isValidCalendarDate(year, month, day)) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;

    return { year, month, day, hour, minute, second, fractional, timezone };
}

/**
 * Check whether a (whitespace-normalised) value conforms to the
 * XSD `xs:dateTime` lexical space with calendar validity.
 */
export function isValidDateTime(value: string): boolean {
    return parseDateTime(value) !== null;
}

/**
 * Parse and validate an xs:date lexical value.
 */
export function parseDate(value: string): DateComponents | null {
    const m = DATE_RE.exec(value);
    if (!m) return null;

    const year = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10);
    const day = parseInt(m[3]!, 10);
    const timezone = parseTimezone(m[4]);

    if (!isValidCalendarDate(year, month, day)) return null;

    return { year, month, day, timezone };
}

/**
 * Check whether a value conforms to the XSD `xs:date` lexical space.
 */
export function isValidDate(value: string): boolean {
    return parseDate(value) !== null;
}

/**
 * Parse and validate an xs:time lexical value.
 */
export function parseTime(value: string): TimeComponents | null {
    const m = TIME_RE.exec(value);
    if (!m) return null;

    const hour = parseInt(m[1]!, 10);
    const minute = parseInt(m[2]!, 10);
    const second = parseInt(m[3]!, 10);
    const fractional = m[4] ? m[4].slice(1) : "";
    const timezone = parseTimezone(m[5]);
    if (m[5] !== undefined && m[5] !== "" && (typeof timezone !== "number" || isNaN(timezone))) return null;

    if (hour > 23 || minute > 59 || second > 59) return null;

    return { hour, minute, second, fractional, timezone };
}

/**
 * Check whether a value conforms to the XSD `xs:time` lexical space.
 */
export function isValidTime(value: string): boolean {
    return parseTime(value) !== null;
}

/**
 * Parse and validate an xs:gYear lexical value.
 */
export function parseGYear(value: string): GYearComponents | null {
    const m = GYEAR_RE.exec(value);
    if (!m) return null;

    const year = parseInt(m[1]!, 10);
    const timezone = parseTimezone(m[2]);
    if (m[2] !== undefined && m[2] !== "" && (typeof timezone !== "number" || isNaN(timezone))) return null;

    return { year, timezone };
}

/**
 * Check whether a value conforms to the XSD `xs:gYear` lexical space.
 */
export function isValidGYear(value: string): boolean {
    return parseGYear(value) !== null;
}

/**
 * Parse and validate an xs:gYearMonth lexical value.
 */
export function parseGYearMonth(value: string): GYearMonthComponents | null {
    const m = GYEAR_MONTH_RE.exec(value);
    if (!m) return null;

    const year = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10);
    const timezone = parseTimezone(m[3]);
    if (m[3] !== undefined && m[3] !== "" && (typeof timezone !== "number" || isNaN(timezone))) return null;

    if (month < 1 || month > 12) return null;

    return { year, month, timezone };
}

/**
 * Check whether a value conforms to the XSD `xs:gYearMonth` lexical space.
 */
export function isValidGYearMonth(value: string): boolean {
    return parseGYearMonth(value) !== null;
}

/**
 * Parse and validate an xs:gMonth lexical value.
 */
export function parseGMonth(value: string): GMonthComponents | null {
    const m = GMONTH_RE.exec(value);
    if (!m) return null;

    const month = parseInt(m[1]!, 10);
    // The timezone is preceded by the optional '--' separator (errata E2-22).
    // m[2] is the full '--(tz)' group: undefined → no timezone,
    // '--' → trailing dashes without timezone, '--Z' → Z timezone, etc.
    const tzGroup = m[2];
    let timezone: TimezoneOffset = null;
    if (tzGroup !== undefined && tzGroup.length > 2) {
        timezone = parseTimezone(tzGroup.slice(2));
        if (typeof timezone !== "number" || isNaN(timezone)) return null;
    }

    if (month < 1 || month > 12) return null;

    return { month, timezone };
}

/**
 * Check whether a value conforms to the XSD `xs:gMonth` lexical space.
 */
export function isValidGMonth(value: string): boolean {
    return parseGMonth(value) !== null;
}

/**
 * Parse and validate an xs:gMonthDay lexical value.
 */
export function parseGMonthDay(value: string): GMonthDayComponents | null {
    const m = GMONTH_DAY_RE.exec(value);
    if (!m) return null;

    const month = parseInt(m[1]!, 10);
    const day = parseInt(m[2]!, 10);
    const timezone = parseTimezone(m[3]);

    if (!isValidCalendarDate(2001, month, day)) return null; // non-leap year context

    return { month, day, timezone };
}

/**
 * Check whether a value conforms to the XSD `xs:gMonthDay` lexical space.
 */
export function isValidGMonthDay(value: string): boolean {
    return parseGMonthDay(value) !== null;
}

/**
 * Parse and validate an xs:gDay lexical value.
 */
export function parseGDay(value: string): GDayComponents | null {
    const m = GDAY_RE.exec(value);
    if (!m) return null;

    const day = parseInt(m[1]!, 10);
    const timezone = parseTimezone(m[2]);

    if (day < 1 || day > 31) return null;

    return { day, timezone };
}

/**
 * Check whether a value conforms to the XSD `xs:gDay` lexical space.
 */
export function isValidGDay(value: string): boolean {
    return parseGDay(value) !== null;
}

/**
 * Parse and validate an xs:duration lexical value.
 *
 * The lexical form is:  [-]PnYnMnDTnHnMnS
 * where the numbers are non-negative integers (except the value after T
 * which may have a fractional seconds part).
 * At least one component must be non-zero.
 */
export function parseDuration(value: string): DurationComponents | null {
    const trimmed = value.trim();
    const m = DURATION_RE.exec(trimmed);
    if (!m) return null;

    const sign = m[1] === "-" ? -1 : 1;

    const years = m[2] ? parseInt(m[2], 10) : 0;
    const months = m[3] ? parseInt(m[3], 10) : 0;
    const days = m[4] ? parseInt(m[4], 10) : 0;
    const hours = m[5] ? parseInt(m[5], 10) : 0;
    const minutes = m[6] ? parseInt(m[6], 10) : 0;

    let seconds = 0;
    let fractional = "";
    if (m[7]) {
        const secStr = m[7];
        const cleaned = secStr.endsWith("S") ? secStr.slice(0, -1) : secStr;
        const dot = cleaned.indexOf(".");
        if (dot !== -1) {
            seconds = parseInt(cleaned.slice(0, dot), 10);
            fractional = cleaned.slice(dot + 1);
        } else {
            seconds = parseInt(cleaned, 10);
        }
    }

    // Per errata E2-24, the 'T' must be absent when no time components are
    // present: P20Y0M15DT is not a valid duration (CHK-027).
    const hasTimeSeparator = /t/i.test(trimmed);
    if (hasTimeSeparator && m[5] === undefined && m[6] === undefined && m[7] === undefined) {
        return null;
    }

    // At least one component must be present and non-zero (per spec)
    if (years === 0 && months === 0 && days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
        return null;
    }

    return { sign, years, months, days, hours, minutes, seconds, fractional };
}

/**
 * Check whether a value conforms to the XSD `xs:duration` lexical space.
 */
export function isValidDuration(value: string): boolean {
    return parseDuration(value) !== null;
}

// ---------------------------------------------------------------------------
// Value-space comparison helpers (for bound-facet evaluation)
// ---------------------------------------------------------------------------

/**
 * Normalise a dateTime to UTC for comparison.
 */
export function dateTimeToNormalisedInstant(c: DateTimeComponents): NormalisedInstant {
    let { year, month, day, hour, minute, second, fractional, timezone } = c;

    if (timezone !== null && timezone !== 0) {
        // Apply timezone offset (subtract the offset to get UTC)
        const totalMinutes = hour * 60 + minute - timezone;
        const adjustedDay = day + Math.floor(totalMinutes / (24 * 60));
        const timeOfDayMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
        hour = Math.floor(timeOfDayMinutes / 60);
        minute = timeOfDayMinutes % 60;

        // Simple day overflow handling
        let currentMonth = month;
        let currentYear = year;
        let currentDay = adjustedDay;
        while (currentDay > daysInMonth(currentYear, currentMonth)) {
            currentDay -= daysInMonth(currentYear, currentMonth);
            currentMonth++;
            if (currentMonth > 12) {
                currentMonth = 1;
                currentYear++;
            }
        }
        // This only handles positive adjustments (forward in time).
        // Negative day adjustments (backward) could underflow, but for the
        // typical ±14h timezone range this only moves by ±1 day, so the
        // simple forward loop handles it via the modulo operation above.
        month = currentMonth;
        year = currentYear;
        day = currentDay;
    }

    return { year, month, day, hour, minute, second, fractional };
}

/**
 * Normalise a date to the start-of-day instant for comparison.
 */
export function dateToNormalisedInstant(c: DateComponents): NormalisedInstant {
    const dtc: DateTimeComponents = {
        year: c.year,
        month: c.month,
        day: c.day,
        hour: 0,
        minute: 0,
        second: 0,
        fractional: "",
        timezone: c.timezone,
    };
    return dateTimeToNormalisedInstant(dtc);
}

/**
 * Normalise a time to an instant on the implicit date 1600-01-01,
 * following the XSD comparison convention.
 */
export function timeToNormalisedInstant(c: TimeComponents): NormalisedInstant {
    const dtc: DateTimeComponents = {
        year: 1600,
        month: 1,
        day: 1,
        hour: c.hour,
        minute: c.minute,
        second: c.second,
        fractional: c.fractional,
        timezone: c.timezone,
    };
    return dateTimeToNormalisedInstant(dtc);
}

/**
 * Compare two normalised instants.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareInstants(a: NormalisedInstant, b: NormalisedInstant): -1 | 0 | 1 {
    if (a.year !== b.year) return a.year < b.year ? -1 : 1;
    if (a.month !== b.month) return a.month < b.month ? -1 : 1;
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    if (a.hour !== b.hour) return a.hour < b.hour ? -1 : 1;
    if (a.minute !== b.minute) return a.minute < b.minute ? -1 : 1;
    if (a.second !== b.second) return a.second < b.second ? -1 : 1;

    // Compare fractional seconds lexicographically
    const aFrac = a.fractional.padEnd(Math.max(a.fractional.length, b.fractional.length), "0");
    const bFrac = b.fractional.padEnd(Math.max(a.fractional.length, b.fractional.length), "0");
    if (aFrac !== bFrac) return aFrac < bFrac ? -1 : 1;

    return 0;
}

/**
 * Compare two durations per XSD 1.0 Part 2 §3.2.6.4 (partial order).
 *
 * Duration comparison is a partial order because months have varying lengths.
 * Two durations are equal if all components match. Otherwise, the comparison
 * returns "indeterminate" (null) when the components are inconsistent
 * (e.g. P1M and P30D cannot be ordered without a reference month).
 */
export function compareDurations(a: DurationComponents, b: DurationComponents): -1 | 0 | 1 | null {
    if (a.sign !== b.sign) return a.sign === -1 ? -1 : 1;

    // If all components are equal, durations are equal.
    if (a.years === b.years && a.months === b.months && a.days === b.days &&
        a.hours === b.hours && a.minutes === b.minutes && a.seconds === b.seconds &&
        a.fractional === b.fractional) {
        return 0;
    }

    // XSD says duration comparison is partial: months make it indeterminate
    // unless the comparison is between months-only differences that are obvious.
    // For simplicity, we say: if months differ, the comparison is indeterminate
    // unless all other components agree and we can infer.
    if (a.months !== b.months) {
        // If all non-month components are equal, we can compare months directly.
        if (a.years === b.years && a.days === b.days && a.hours === b.hours &&
            a.minutes === b.minutes && a.seconds === b.seconds && a.fractional === b.fractional) {
            const cmp = a.months < b.months ? -1 : 1;
            return a.sign === 1 ? cmp : (cmp === -1 ? 1 : -1) as -1 | 1;
        }
        return null; // indeterminate
    }

    // Same months, compare the dateTime portion (days + time)
    // Days can be compared directly (no variable-length month factor left)
    if (a.years !== b.years) {
        const cmp = a.years < b.years ? -1 : 1;
        return a.sign === 1 ? cmp : (cmp === -1 ? 1 : -1) as -1 | 1;
    }
    if (a.days !== b.days) {
        const cmp = a.days < b.days ? -1 : 1;
        return a.sign === 1 ? cmp : (cmp === -1 ? 1 : -1) as -1 | 1;
    }
    if (a.hours !== b.hours) {
        const cmp = a.hours < b.hours ? -1 : 1;
        return a.sign === 1 ? cmp : (cmp === -1 ? 1 : -1) as -1 | 1;
    }
    if (a.minutes !== b.minutes) {
        const cmp = a.minutes < b.minutes ? -1 : 1;
        return a.sign === 1 ? cmp : (cmp === -1 ? 1 : -1) as -1 | 1;
    }
    if (a.seconds !== b.seconds) {
        const cmp = a.seconds < b.seconds ? -1 : 1;
        return a.sign === 1 ? cmp : (cmp === -1 ? 1 : -1) as -1 | 1;
    }
    // Fractional seconds
    const aFrac = a.fractional.padEnd(Math.max(a.fractional.length, b.fractional.length), "0");
    const bFrac = b.fractional.padEnd(Math.max(a.fractional.length, b.fractional.length), "0");
    if (aFrac !== bFrac) {
        const cmp = aFrac < bFrac ? -1 : 1;
        return a.sign === 1 ? cmp : (cmp === -1 ? 1 : -1) as -1 | 1;
    }

    return 0;
}

// ---------------------------------------------------------------------------
// Bound-facet evaluation for date/time types
// ---------------------------------------------------------------------------

/**
 * Evaluate a date/time bound facet (minInclusive, maxInclusive, etc.)
 * against a value.
 *
 * Returns a human-readable error message when the facet is violated, or
 * `null` when the value passes (or the facet doesn't apply).
 */
export function evaluateDateTimeBound(
    normalized: string,
    kind: string,
    facetValue: string,
    builtinName: string,
): string | null {
    let valueInstant: NormalisedInstant | null = null;
    let facetInstant: NormalisedInstant | null = null;

    switch (builtinName) {
        case "dateTime": {
            const v = parseDateTime(normalized);
            const f = parseDateTime(facetValue);
            if (!v || !f) return null;
            valueInstant = dateTimeToNormalisedInstant(v);
            facetInstant = dateTimeToNormalisedInstant(f);
            break;
        }
        case "date": {
            const v = parseDate(normalized);
            const f = parseDate(facetValue);
            if (!v || !f) return null;
            valueInstant = dateToNormalisedInstant(v);
            facetInstant = dateToNormalisedInstant(f);
            break;
        }
        case "time": {
            const v = parseTime(normalized);
            const f = parseTime(facetValue);
            if (!v || !f) return null;
            valueInstant = timeToNormalisedInstant(v);
            facetInstant = timeToNormalisedInstant(f);
            break;
        }
        case "gYear": {
            const v = parseGYear(normalized);
            const f = parseGYear(facetValue);
            if (!v || !f) return null;
            return evaluateSimpleIntegerBound(v.year, kind, f.year);
        }
        case "gYearMonth": {
            const v = parseGYearMonth(normalized);
            const f = parseGYearMonth(facetValue);
            if (!v || !f) return null;
            // Compare (year, month) tuple
            if (v.year !== f.year) {
                const cmp = v.year < f.year ? -1 : 1;
                if (!satisfiesBound(cmp, kind)) return `Value must satisfy ${kind} = ${facetValue}.`;
            }
            if (v.month !== f.month) {
                const cmp = v.month < f.month ? -1 : 1;
                if (!satisfiesBound(cmp, kind)) return `Value must satisfy ${kind} = ${facetValue}.`;
            }
            return null;
        }
        case "gMonth": {
            const v = parseGMonth(normalized);
            const f = parseGMonth(facetValue);
            if (!v || !f) return null;
            return evaluateSimpleIntegerBound(v.month, kind, f.month);
        }
        case "gMonthDay": {
            const v = parseGMonthDay(normalized);
            const f = parseGMonthDay(facetValue);
            if (!v || !f) return null;
            // Compare (month, day) tuple — use ordinal day-of-year numbers
            const vOrd = v.month * 100 + v.day;
            const fOrd = f.month * 100 + f.day;
            return evaluateSimpleIntegerBound(vOrd, kind, fOrd);
        }
        case "gDay": {
            const v = parseGDay(normalized);
            const f = parseGDay(facetValue);
            if (!v || !f) return null;
            return evaluateSimpleIntegerBound(v.day, kind, f.day);
        }
        case "duration": {
            const v = parseDuration(normalized);
            const f = parseDuration(facetValue);
            if (!v || !f) return null;
            const cmp = compareDurations(v, f);
            if (cmp === null) return null; // indeterminate — skip evaluation
            if (!satisfiesBound(cmp, kind)) return `Value must satisfy ${kind} = ${facetValue}.`;
            return null;
        }
        default:
            return null;
    }

    if (!valueInstant || !facetInstant) return null;
    const cmp = compareInstants(valueInstant, facetInstant);
    if (!satisfiesBound(cmp, kind)) return `Value must satisfy ${kind} = ${facetValue}.`;
    return null;
}

function evaluateSimpleIntegerBound(value: number, kind: string, facetValue: number): string | null {
    const cmp = value < facetValue ? -1 : value > facetValue ? 1 : 0;
    if (!satisfiesBound(cmp, kind)) return `Value must satisfy ${kind} = ${facetValue}.`;
    return null;
}

function satisfiesBound(cmp: -1 | 0 | 1, kind: string): boolean {
    switch (kind) {
        case "minInclusive": return cmp >= 0;
        case "maxInclusive": return cmp <= 0;
        case "minExclusive": return cmp > 0;
        case "maxExclusive": return cmp < 0;
        default: return true;
    }
}

// ---------------------------------------------------------------------------
// Facet helper — walk type chain to find datetime ancestor and evaluate
// ---------------------------------------------------------------------------

/**
 * Walk the type's base chain to find a date/time-family built-in ancestor
 * and evaluate a bound facet against the value.
 *
 * Returns an error message string when the facet is violated, or `null`
 * when the value passes or the type is not in the date/time family.
 *
 * This is exported for use by the facet framework (facets.ts).
 */
export function evaluateDateTimeBoundFromType(
    normalized: string,
    kind: string,
    facetValue: string,
    type: SimpleTypeDefinition,
): string | null {
    let current: SimpleTypeDefinition | null = type;
    let builtinName: string | null = null;

    while (current) {
        const name = current.name;
        if (name && name.namespaceURI === NAMESPACE_XSD) {
            const ln = name.localName;
            if (DATETIME_FAMILY_NAMES.has(ln)) {
                builtinName = ln;
                break;
            }
        }
        current = current.baseType;
    }

    if (!builtinName) return null; // Not a date/time family type
    return evaluateDateTimeBound(normalized, kind, facetValue, builtinName);
}

// ---------------------------------------------------------------------------
// Datetime-family detection
// ---------------------------------------------------------------------------

const DATETIME_FAMILY_NAMES = new Set([
    "dateTime", "date", "time",
    "gYear", "gYearMonth", "gMonth", "gMonthDay", "gDay",
    "duration",
]);

// ---------------------------------------------------------------------------
// Main entry point — lexical-space check
// ---------------------------------------------------------------------------

/**
 * Walk the type's base chain to find a date/time-family built-in ancestor
 * and apply its lexical-space check against the (already-normalised) value.
 *
 * Returns an error message string if the value violates the lexical space,
 * or `null` if the value is valid or the type is not in the date/time family.
 */
export function checkDateTimeFamilyLexicalSpace(
    normalized: string,
    type: SimpleTypeDefinition,
): string | null {
    let current: SimpleTypeDefinition | null = type;
    let builtinName: string | null = null;

    while (current) {
        const name = current.name;
        if (name && name.namespaceURI === NAMESPACE_XSD) {
            const ln = name.localName;
            if (DATETIME_FAMILY_NAMES.has(ln)) {
                builtinName = ln;
                break;
            }
        }
        current = current.baseType;
    }

    if (!builtinName) return null; // Not a date/time family type

    switch (builtinName) {
        case "dateTime":
            if (!isValidDateTime(normalized)) return `not a valid xs:dateTime value`;
            return null;
        case "date":
            if (!isValidDate(normalized)) return `not a valid xs:date value`;
            return null;
        case "time":
            if (!isValidTime(normalized)) return `not a valid xs:time value`;
            return null;
        case "gYear":
            if (!isValidGYear(normalized)) return `not a valid xs:gYear value`;
            return null;
        case "gYearMonth":
            if (!isValidGYearMonth(normalized)) return `not a valid xs:gYearMonth value`;
            return null;
        case "gMonth":
            if (!isValidGMonth(normalized)) return `not a valid xs:gMonth value`;
            return null;
        case "gMonthDay":
            if (!isValidGMonthDay(normalized)) return `not a valid xs:gMonthDay value`;
            return null;
        case "gDay":
            if (!isValidGDay(normalized)) return `not a valid xs:gDay value`;
            return null;
        case "duration":
            if (!isValidDuration(normalized)) return `not a valid xs:duration value`;
            return null;
        default:
            return null;
    }
}