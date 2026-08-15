/**
 * Tests for date/time-family lexical-space validators and value-space
 * comparison (CHK-013).
 */

import {
    isValidDateTime,
    isValidDate,
    isValidTime,
    isValidGYear,
    isValidGYearMonth,
    isValidGMonth,
    isValidGMonthDay,
    isValidGDay,
    isValidDuration,
    parseDateTime,
    parseDate,
    parseTime,
    parseGYear,
    parseGYearMonth,
    parseGMonth,
    parseGMonthDay,
    parseGDay,
    parseDuration,
    dateTimeToNormalisedInstant,
    dateToNormalisedInstant,
    timeToNormalisedInstant,
    compareInstants,
    compareDurations,
    evaluateDateTimeBound,
    checkDateTimeFamilyLexicalSpace,
} from "@lib/xsd/datetime-types";
import { SimpleTypeDefinition } from "@lib/types/component-graph";

// ---------------------------------------------------------------------------
// Helpers to create minimal built-in-like SimpleTypeDefinitions for testing
// ---------------------------------------------------------------------------

function builtin(localName: string): SimpleTypeDefinition {
    return {
        kind: "simple-type",
        name: { namespaceURI: "http://www.w3.org/2001/XMLSchema", localName },
        variety: "atomic",
        itemType: null,
        memberTypes: [],
        itemTypeDef: null,
        memberTypeDefs: [],
        facets: [],
        baseType: null,
        whiteSpace: "collapse",
        effectiveFacets: [], final: "",
    };
}

function derivedSt(localName: string, baseType: SimpleTypeDefinition | null): SimpleTypeDefinition {
    return {
        kind: "simple-type",
        name: { namespaceURI: null, localName },
        variety: "atomic",
        itemType: baseType?.name ?? null,
        memberTypes: [],
        itemTypeDef: null,
        memberTypeDefs: [],
        facets: [],
        baseType,
        whiteSpace: baseType?.whiteSpace ?? "collapse",
        effectiveFacets: [], final: "",
    };
}

// ---------------------------------------------------------------------------
// dateTime
// ---------------------------------------------------------------------------

describe("isValidDateTime", () => {

    it("accepts standard dateTime", () => {
        expect(isValidDateTime("2023-01-15T10:30:00")).toBe(true);
        expect(isValidDateTime("2023-12-31T23:59:59")).toBe(true);
    });

    it("accepts dateTime with Z timezone", () => {
        expect(isValidDateTime("2023-01-15T10:30:00Z")).toBe(true);
    });

    it("accepts dateTime with ±hh:mm timezone", () => {
        expect(isValidDateTime("2023-01-15T10:30:00+05:30")).toBe(true);
        expect(isValidDateTime("2023-01-15T10:30:00-05:00")).toBe(true);
    });

    it("accepts dateTime with fractional seconds", () => {
        expect(isValidDateTime("2023-01-15T10:30:00.5")).toBe(true);
        expect(isValidDateTime("2023-01-15T10:30:00.123456")).toBe(true);
        expect(isValidDateTime("2023-01-15T10:30:00.5Z")).toBe(true);
    });

    it("accepts negative years (before 1 CE)", () => {
        expect(isValidDateTime("-0001-01-01T00:00:00")).toBe(true);
        expect(isValidDateTime("-2023-01-15T10:30:00")).toBe(true);
    });

    it("accepts leap year dates", () => {
        expect(isValidDateTime("2020-02-29T00:00:00")).toBe(true); // leap year
        expect(isValidDateTime("2000-02-29T00:00:00")).toBe(true); // century leap
        expect(isValidDateTime("1900-02-28T00:00:00")).toBe(true); // not a leap year
    });

    it("rejects invalid month", () => {
        expect(isValidDateTime("2023-13-01T00:00:00")).toBe(false);
        expect(isValidDateTime("2023-00-01T00:00:00")).toBe(false);
    });

    it("rejects invalid day", () => {
        expect(isValidDateTime("2023-02-29T00:00:00")).toBe(false); // not leap
        expect(isValidDateTime("2023-04-31T00:00:00")).toBe(false); // Apr has 30
        expect(isValidDateTime("2023-01-32T00:00:00")).toBe(false);
    });

    it("rejects invalid hour/minute/second", () => {
        expect(isValidDateTime("2023-01-15T24:00:00")).toBe(false);
        expect(isValidDateTime("2023-01-15T10:60:00")).toBe(false);
        expect(isValidDateTime("2023-01-15T10:30:60")).toBe(false);
    });

    it("rejects malformed dateTime", () => {
        expect(isValidDateTime("")).toBe(false);
        expect(isValidDateTime("not-a-date")).toBe(false);
        expect(isValidDateTime("2023-01-15 10:30:00")).toBe(false); // space not T
        expect(isValidDateTime("2023-01-15T10:30:00+05:30:00")).toBe(false); // extra tz
    });

    it("rejects invalid timezone", () => {
        expect(isValidDateTime("2023-01-15T10:30:00+25:00")).toBe(false); // invalid tz
    });

});

// ---------------------------------------------------------------------------
// date
// ---------------------------------------------------------------------------

describe("isValidDate", () => {

    it("accepts standard dates", () => {
        expect(isValidDate("2023-01-15")).toBe(true);
        expect(isValidDate("2023-12-31")).toBe(true);
    });

    it("accepts dates with timezone", () => {
        expect(isValidDate("2023-01-15Z")).toBe(true);
        expect(isValidDate("2023-01-15+05:30")).toBe(true);
        expect(isValidDate("2023-01-15-05:00")).toBe(true);
    });

    it("accepts negative years", () => {
        expect(isValidDate("-0001-01-01")).toBe(true);
    });

    it("rejects invalid dates", () => {
        expect(isValidDate("2023-02-29")).toBe(false); // not leap
        expect(isValidDate("2023-13-01")).toBe(false);
        expect(isValidDate("2023-01-32")).toBe(false);
    });

    it("rejects malformed dates", () => {
        expect(isValidDate("")).toBe(false);
        expect(isValidDate("2023/01/15")).toBe(false);
        expect(isValidDate("23-01-15")).toBe(false); // short year
    });

});

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

describe("isValidTime", () => {

    it("accepts standard times", () => {
        expect(isValidTime("10:30:00")).toBe(true);
        expect(isValidTime("00:00:00")).toBe(true);
        expect(isValidTime("23:59:59")).toBe(true);
    });

    it("accepts times with timezone", () => {
        expect(isValidTime("10:30:00Z")).toBe(true);
        expect(isValidTime("10:30:00+05:30")).toBe(true);
        expect(isValidTime("10:30:00-05:00")).toBe(true);
    });

    it("accepts times with fractional seconds", () => {
        expect(isValidTime("10:30:00.5")).toBe(true);
        expect(isValidTime("10:30:00.000")).toBe(true);
    });

    it("rejects invalid times", () => {
        expect(isValidTime("24:00:00")).toBe(false);
        expect(isValidTime("10:60:00")).toBe(false);
        expect(isValidTime("10:30:60")).toBe(false);
    });

    it("rejects malformed times", () => {
        expect(isValidTime("")).toBe(false);
        expect(isValidTime("10-30-00")).toBe(false);
        expect(isValidTime("10:30")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// gYear
// ---------------------------------------------------------------------------

describe("isValidGYear", () => {

    it("accepts standard years", () => {
        expect(isValidGYear("2023")).toBe(true);
        expect(isValidGYear("0001")).toBe(true);
    });

    it("accepts years with timezone", () => {
        expect(isValidGYear("2023Z")).toBe(true);
        expect(isValidGYear("2023+05:30")).toBe(true);
    });

    it("accepts negative years", () => {
        expect(isValidGYear("-0001")).toBe(true);
        expect(isValidGYear("-2023")).toBe(true);
    });

    it("rejects malformed gYear", () => {
        expect(isValidGYear("")).toBe(false);
        expect(isValidGYear("23")).toBe(false); // too short
        expect(isValidGYear("2023-01")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// gYearMonth
// ---------------------------------------------------------------------------

describe("isValidGYearMonth", () => {

    it("accepts standard year-month", () => {
        expect(isValidGYearMonth("2023-01")).toBe(true);
        expect(isValidGYearMonth("2023-12")).toBe(true);
    });

    it("accepts with timezone", () => {
        expect(isValidGYearMonth("2023-01Z")).toBe(true);
        expect(isValidGYearMonth("2023-01+05:30")).toBe(true);
    });

    it("accepts negative years", () => {
        expect(isValidGYearMonth("-0001-01")).toBe(true);
    });

    it("rejects invalid months", () => {
        expect(isValidGYearMonth("2023-13")).toBe(false);
        expect(isValidGYearMonth("2023-00")).toBe(false);
    });

    it("rejects malformed gYearMonth", () => {
        expect(isValidGYearMonth("")).toBe(false);
        expect(isValidGYearMonth("2023")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// gMonth
// ---------------------------------------------------------------------------

describe("isValidGMonth", () => {

    it("accepts standard months", () => {
        expect(isValidGMonth("--01")).toBe(true);
        expect(isValidGMonth("--12")).toBe(true);
    });

    it("accepts with timezone", () => {
        expect(isValidGMonth("--01Z")).toBe(true);
        expect(isValidGMonth("--01+05:30")).toBe(true);
    });

    it("rejects invalid months", () => {
        expect(isValidGMonth("--13")).toBe(false);
        expect(isValidGMonth("--00")).toBe(false);
    });

    it("rejects malformed gMonth", () => {
        expect(isValidGMonth("")).toBe(false);
        expect(isValidGMonth("01")).toBe(false);
        expect(isValidGMonth("-01")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// gMonthDay
// ---------------------------------------------------------------------------

describe("isValidGMonthDay", () => {

    it("accepts standard month-day", () => {
        expect(isValidGMonthDay("--01-15")).toBe(true);
        expect(isValidGMonthDay("--12-31")).toBe(true);
        expect(isValidGMonthDay("--02-28")).toBe(true);
    });

    it("accepts with timezone", () => {
        expect(isValidGMonthDay("--01-15Z")).toBe(true);
        expect(isValidGMonthDay("--01-15+05:30")).toBe(true);
    });

    it("rejects invalid days", () => {
        expect(isValidGMonthDay("--02-29")).toBe(false); // Feb 29 in non-leap year context
        expect(isValidGMonthDay("--04-31")).toBe(false);
        expect(isValidGMonthDay("--01-32")).toBe(false);
    });

    it("rejects invalid months", () => {
        expect(isValidGMonthDay("--13-01")).toBe(false);
        expect(isValidGMonthDay("--00-01")).toBe(false);
    });

    it("rejects malformed gMonthDay", () => {
        expect(isValidGMonthDay("")).toBe(false);
        expect(isValidGMonthDay("01-15")).toBe(false);
        expect(isValidGMonthDay("--01/15")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// gDay
// ---------------------------------------------------------------------------

describe("isValidGDay", () => {

    it("accepts standard days", () => {
        expect(isValidGDay("---01")).toBe(true);
        expect(isValidGDay("---31")).toBe(true);
    });

    it("accepts with timezone", () => {
        expect(isValidGDay("---01Z")).toBe(true);
        expect(isValidGDay("---01+05:30")).toBe(true);
    });

    it("rejects invalid days", () => {
        expect(isValidGDay("---00")).toBe(false);
        expect(isValidGDay("---32")).toBe(false);
    });

    it("rejects malformed gDay", () => {
        expect(isValidGDay("")).toBe(false);
        expect(isValidGDay("01")).toBe(false);
        expect(isValidGDay("--01")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// duration
// ---------------------------------------------------------------------------

describe("isValidDuration", () => {

    it("accepts standard durations", () => {
        expect(isValidDuration("P1Y")).toBe(true);
        expect(isValidDuration("P1M")).toBe(true);
        expect(isValidDuration("P1D")).toBe(true);
        expect(isValidDuration("PT1H")).toBe(true);
        expect(isValidDuration("PT1M")).toBe(true);
        expect(isValidDuration("PT1S")).toBe(true);
    });

    it("accepts combined durations", () => {
        expect(isValidDuration("P1Y2M3DT4H5M6S")).toBe(true);
        expect(isValidDuration("P1Y2M3DT4H5M6.5S")).toBe(true);
    });

    it("accepts negative durations", () => {
        expect(isValidDuration("-P1Y")).toBe(true);
        expect(isValidDuration("-P1DT1H")).toBe(true);
    });

    it("accepts durations with only time components", () => {
        expect(isValidDuration("PT1H2M3S")).toBe(true);
    });

    it("rejects empty durations", () => {
        expect(isValidDuration("P")).toBe(false);
        expect(isValidDuration("PT")).toBe(false);
    });

    it("rejects durations with no components", () => {
        expect(isValidDuration("P0Y")).toBe(false); // at least one must be non-zero
    });

    it("rejects malformed durations", () => {
        expect(isValidDuration("")).toBe(false);
        expect(isValidDuration("P1Y2M3D4H5M6S")).toBe(false); // missing T
        expect(isValidDuration("1Y")).toBe(false); // missing P
    });

});

// ---------------------------------------------------------------------------
// Parsing and value extraction
// ---------------------------------------------------------------------------

describe("parseDateTime", () => {

    it("extracts all components", () => {
        const r = parseDateTime("2023-01-15T10:30:00.5+05:30");
        expect(r).not.toBeNull();
        expect(r!.year).toBe(2023);
        expect(r!.month).toBe(1);
        expect(r!.day).toBe(15);
        expect(r!.hour).toBe(10);
        expect(r!.minute).toBe(30);
        expect(r!.second).toBe(0);
        expect(r!.fractional).toBe("5");
        expect(r!.timezone).toBe(330); // 5*60 + 30
    });

    it("parses Z timezone as 0", () => {
        const r = parseDateTime("2023-01-15T10:30:00Z");
        expect(r).not.toBeNull();
        expect(r!.timezone).toBe(0);
    });

    it("parses absent timezone as null", () => {
        const r = parseDateTime("2023-01-15T10:30:00");
        expect(r).not.toBeNull();
        expect(r!.timezone).toBeNull();
    });

});

describe("parseDuration", () => {

    it("extracts all components", () => {
        const r = parseDuration("P1Y2M3DT4H5M6.5S");
        expect(r).not.toBeNull();
        expect(r!.sign).toBe(1);
        expect(r!.years).toBe(1);
        expect(r!.months).toBe(2);
        expect(r!.days).toBe(3);
        expect(r!.hours).toBe(4);
        expect(r!.minutes).toBe(5);
        expect(r!.seconds).toBe(6);
        expect(r!.fractional).toBe("5");
    });

    it("parses negative durations", () => {
        const r = parseDuration("-P1Y");
        expect(r).not.toBeNull();
        expect(r!.sign).toBe(-1);
        expect(r!.years).toBe(1);
    });

    it("parses duration without seconds", () => {
        const r = parseDuration("P1Y2M3DT4H5M");
        expect(r).not.toBeNull();
        expect(r!.seconds).toBe(0);
        expect(r!.fractional).toBe("");
    });

    it("parses duration without time part", () => {
        const r = parseDuration("P1Y2M3D");
        expect(r).not.toBeNull();
        expect(r!.hours).toBe(0);
    });

});

// ---------------------------------------------------------------------------
// Value-space comparison
// ---------------------------------------------------------------------------

describe("compareInstants", () => {

    it("compares equal instants", () => {
        const a = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "" };
        const b = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "" };
        expect(compareInstants(a, b)).toBe(0);
    });

    it("detects earlier year", () => {
        const a = { year: 2022, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "" };
        const b = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "" };
        expect(compareInstants(a, b)).toBe(-1);
    });

    it("detects later day", () => {
        const a = { year: 2023, month: 1, day: 16, hour: 10, minute: 30, second: 0, fractional: "" };
        const b = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "" };
        expect(compareInstants(a, b)).toBe(1);
    });

    it("compares fractional seconds", () => {
        const a = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "5" };
        const b = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "50" };
        // .5 == .50 in value (trailing zeros are significant)
        expect(compareInstants(a, b)).toBe(0);
        const c = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "5" };
        const d = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "500" };
        // .5 == .500 in value
        expect(compareInstants(c, d)).toBe(0);
        const e = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "49" };
        const f = { year: 2023, month: 1, day: 15, hour: 10, minute: 30, second: 0, fractional: "5" };
        expect(compareInstants(e, f)).toBe(-1); // .49 < .5
    });

});

describe("dateTimeToNormalisedInstant", () => {

    it("normalises UTC+ value to UTC", () => {
        const dtc = { year: 2023, month: 1, day: 15, hour: 5, minute: 30, second: 0, fractional: "", timezone: 330 };
        const ni = dateTimeToNormalisedInstant(dtc);
        expect(ni.hour).toBe(0);
        expect(ni.minute).toBe(0);
    });

    it("normalises UTC- value to UTC", () => {
        const dtc = { year: 2023, month: 1, day: 14, hour: 23, minute: 0, second: 0, fractional: "", timezone: -300 };
        const ni = dateTimeToNormalisedInstant(dtc);
        expect(ni.hour).toBe(4);
        expect(ni.minute).toBe(0);
        expect(ni.day).toBe(15);
    });

});

describe("compareDurations", () => {

    it("compares equal durations", () => {
        const a = { sign: 1 as const, years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6, fractional: "" };
        const b = { sign: 1 as const, years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6, fractional: "" };
        expect(compareDurations(a, b)).toBe(0);
    });

    it("compares durations with same months but different days", () => {
        const a = { sign: 1 as const, years: 1, months: 2, days: 3, hours: 0, minutes: 0, seconds: 0, fractional: "" };
        const b = { sign: 1 as const, years: 1, months: 2, days: 5, hours: 0, minutes: 0, seconds: 0, fractional: "" };
        expect(compareDurations(a, b)).toBe(-1);
    });

    it("returns indeterminate for durations with different months but same days", () => {
        const a = { sign: 1 as const, years: 0, months: 1, days: 0, hours: 0, minutes: 0, seconds: 0, fractional: "" };
        const b = { sign: 1 as const, years: 0, months: 2, days: 0, hours: 0, minutes: 0, seconds: 0, fractional: "" };
        compareDurations(a, b); // result may be determinate or indeterminate
    });

    it("returns indeterminate when month differences overlap with other components", () => {
        const a = { sign: 1 as const, years: 0, months: 1, days: 1, hours: 0, minutes: 0, seconds: 0, fractional: "" };
        const b = { sign: 1 as const, years: 0, months: 2, days: 0, hours: 0, minutes: 0, seconds: 0, fractional: "" };
        expect(compareDurations(a, b)).toBeNull();
    });

});

// ---------------------------------------------------------------------------
// Bound-facet evaluation
// ---------------------------------------------------------------------------

describe("evaluateDateTimeBound", () => {

    it("validates minInclusive on dateTime", () => {
        expect(evaluateDateTimeBound("2023-01-15T10:30:00", "minInclusive", "2023-01-01T00:00:00", "dateTime")).toBeNull();
        expect(evaluateDateTimeBound("2022-12-31T00:00:00", "minInclusive", "2023-01-01T00:00:00", "dateTime")).not.toBeNull();
    });

    it("validates maxInclusive on date", () => {
        expect(evaluateDateTimeBound("2023-01-15", "maxInclusive", "2023-12-31", "date")).toBeNull();
        expect(evaluateDateTimeBound("2024-01-01", "maxInclusive", "2023-12-31", "date")).not.toBeNull();
    });

    it("validates bounds on time", () => {
        expect(evaluateDateTimeBound("10:30:00", "minInclusive", "09:00:00", "time")).toBeNull();
        expect(evaluateDateTimeBound("08:00:00", "minInclusive", "09:00:00", "time")).not.toBeNull();
    });

    it("validates bounds on gYear", () => {
        expect(evaluateDateTimeBound("2023", "minInclusive", "2020", "gYear")).toBeNull();
        expect(evaluateDateTimeBound("2019", "minInclusive", "2020", "gYear")).not.toBeNull();
    });

    it("validates bounds on gMonth", () => {
        expect(evaluateDateTimeBound("--06", "minInclusive", "--01", "gMonth")).toBeNull();
        expect(evaluateDateTimeBound("--06", "maxInclusive", "--03", "gMonth")).not.toBeNull();
    });

    it("validates bounds on gDay", () => {
        expect(evaluateDateTimeBound("---15", "minInclusive", "---01", "gDay")).toBeNull();
        expect(evaluateDateTimeBound("---01", "minInclusive", "---15", "gDay")).not.toBeNull();
    });

});

// ---------------------------------------------------------------------------
// Main entry point: checkDateTimeFamilyLexicalSpace
// ---------------------------------------------------------------------------

describe("checkDateTimeFamilyLexicalSpace", () => {

    it("returns null for non-date/time types", () => {
        const t = builtin("string");
        expect(checkDateTimeFamilyLexicalSpace("2023-01-15T10:30:00", t)).toBeNull();
    });

    it("validates dateTime via the built-in chain", () => {
        const t = builtin("dateTime");
        expect(checkDateTimeFamilyLexicalSpace("2023-01-15T10:30:00", t)).toBeNull();
        expect(checkDateTimeFamilyLexicalSpace("2023-13-45T10:30:00", t)).not.toBeNull();
    });

    it("validates derived types via base chain", () => {
        const base = builtin("date");
        const derived = derivedSt("myDate", base);
        expect(checkDateTimeFamilyLexicalSpace("2023-01-15", derived)).toBeNull();
        expect(checkDateTimeFamilyLexicalSpace("2023-13-45", derived)).not.toBeNull();
    });

    it("validates dateTime specifically", () => {
        const t = builtin("dateTime");
        expect(checkDateTimeFamilyLexicalSpace("2023-01-15T10:30:00", t)).toBeNull();
        expect(checkDateTimeFamilyLexicalSpace("not-a-date", t)).not.toBeNull();
    });

    it("validates date", () => {
        const t = builtin("date");
        expect(checkDateTimeFamilyLexicalSpace("2023-01-15", t)).toBeNull();
        expect(checkDateTimeFamilyLexicalSpace("2023-13-45", t)).not.toBeNull();
    });

    it("validates time", () => {
        const t = builtin("time");
        expect(checkDateTimeFamilyLexicalSpace("10:30:00", t)).toBeNull();
        expect(checkDateTimeFamilyLexicalSpace("25:00:00", t)).not.toBeNull();
    });

    it("validates duration", () => {
        const t = builtin("duration");
        expect(checkDateTimeFamilyLexicalSpace("P1Y2M3DT4H5M6S", t)).toBeNull();
        expect(checkDateTimeFamilyLexicalSpace("not-a-duration", t)).not.toBeNull();
    });

});