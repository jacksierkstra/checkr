/**
 * Validates that a timezone suffix embedded in a date/time string has a valid offset (±14:00 max).
 * Returns true if no timezone is present or if the timezone offset is within range.
 */
function isValidTimezone(value: string): boolean {
  const match = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (!match) return true; // Z or no timezone — always valid
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  return hours < 14 || (hours === 14 && minutes === 0);
}

/**
 * Checks whether a string value is valid for the given XSD built-in type.
 * Returns true if valid, false if invalid. Unknown types return true (skip).
 */
export function isValidBuiltinType(value: string, type: string): boolean {
  switch (type) {
    case "xs:string":
      return true;
    case "xs:normalizedString":
      return !/[\r\n\t]/.test(value);
    case "xs:token":
      return !/^\s|\s$/.test(value) && !/\s{2,}/.test(value) && !/[\r\n\t]/.test(value);
    case "xs:NMTOKEN":
      return /^[\w.:-]+$/.test(value);
    case "xs:NMTOKENS": {
      const tokens = value.trim().split(/\s+/);
      return tokens.length > 0 && tokens.every((t) => /^[\w.:-]+$/.test(t));
    }
    case "xs:NCName":
      return /^[a-zA-Z_][\w.-]*$/.test(value);
    case "xs:ID":
    case "xs:IDREF":
    case "xs:ENTITY":
      return /^[a-zA-Z_][\w.-]*$/.test(value);
    case "xs:IDREFS":
    case "xs:ENTITIES": {
      const tokens = value.trim().split(/\s+/);
      return tokens.length > 0 && tokens[0] !== "" && tokens.every((t) => /^[a-zA-Z_][\w.-]*$/.test(t));
    }
    case "xs:QName":
    case "xs:NOTATION":
      return /^([a-zA-Z_][\w.-]*:)?[a-zA-Z_][\w.-]*$/.test(value);
    case "xs:Name":
      return /^[a-zA-Z_:][\w.:-]*$/.test(value);
    case "xs:language":
      return /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(value);
    case "xs:boolean":
      return ["true", "false", "1", "0"].includes(value);
    case "xs:integer":
      return /^-?\d+$/.test(value);
    case "xs:long":
      return /^-?\d+$/.test(value);
    case "xs:int": {
      const v = parseInt(value, 10);
      return /^-?\d+$/.test(value) && v >= -2147483648 && v <= 2147483647;
    }
    case "xs:short": {
      const v = parseInt(value, 10);
      return /^-?\d+$/.test(value) && v >= -32768 && v <= 32767;
    }
    case "xs:byte": {
      const v = parseInt(value, 10);
      return /^-?\d+$/.test(value) && v >= -128 && v <= 127;
    }
    case "xs:unsignedLong":
      return /^\d+$/.test(value);
    case "xs:unsignedInt": {
      const v = parseInt(value, 10);
      return /^\d+$/.test(value) && v <= 4294967295;
    }
    case "xs:unsignedShort": {
      const v = parseInt(value, 10);
      return /^\d+$/.test(value) && v <= 65535;
    }
    case "xs:unsignedByte": {
      const v = parseInt(value, 10);
      return /^\d+$/.test(value) && v <= 255;
    }
    case "xs:nonNegativeInteger":
      return /^\d+$/.test(value);
    case "xs:positiveInteger":
      return /^\d+$/.test(value) && parseInt(value, 10) > 0;
    case "xs:negativeInteger":
      return /^-\d+$/.test(value) && parseInt(value, 10) < 0;
    case "xs:nonPositiveInteger": {
      const v = parseInt(value, 10);
      return /^-?\d+$/.test(value) && v <= 0;
    }
    case "xs:decimal":
      // XSD spec §3.2.3: optional leading sign, integer and/or fractional part, no scientific notation
      return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(value);
    case "xs:float":
    case "xs:double":
      // XSD spec §3.2.4–3.2.5: numeric values plus IEEE 754 specials INF, -INF, NaN
      return (
        value === "INF" ||
        value === "-INF" ||
        value === "NaN" ||
        /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)
      );
    case "xs:date":
      // XSD spec §3.2.9: YYYY-MM-DD with optional timezone (Z or ±hh:mm)
      return /^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value);
    case "xs:dateTime":
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value);
    case "xs:time":
      return /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value);
    case "xs:duration":
      // XSD spec §3.2.6: must have at least one duration field; T must be followed by time fields
      return (
        /^-?P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/.test(value) &&
        value !== "P" &&
        value !== "-P" &&
        !value.endsWith("T")
      );
    case "xs:gYear":
      return /^-?\d{4,}(Z|[+-]\d{2}:\d{2})?$/.test(value) && isValidTimezone(value);
    case "xs:gYearMonth":
      return /^-?\d{4,}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && isValidTimezone(value);
    case "xs:gMonth":
      return /^--\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && isValidTimezone(value);
    case "xs:gDay":
      return /^---\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && isValidTimezone(value);
    case "xs:gMonthDay":
      return /^--\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && isValidTimezone(value);
    case "xs:hexBinary":
      return /^([0-9A-Fa-f]{2})*$/.test(value);
    case "xs:base64Binary":
      return (
        /^[A-Za-z0-9+/\s]*={0,2}$/.test(value) && value.replace(/\s/g, "").length % 4 === 0
      );
    case "xs:anyURI":
      return value.trim().length > 0;
    default:
      return true; // Unknown type — skip validation
  }
}
