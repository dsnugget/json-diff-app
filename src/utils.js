export const unescapeString = (text) => {
  // This function only removes backslashes from escaped double quotes.
  // It does not attempt to parse JSON.
  return text.replace(/\\"/g, '"');
};

export const parseRecursive = (value) => {
  // If it's not a string, or it's null, return as is.
  if (typeof value !== 'string' || value === null) {
    return value;
  }

  try {
    let parsed = JSON.parse(value);

    // If parsed value is still a string, it means it was a JSON string literal.
    // Recursively call parseRecursive on this new string.
    if (typeof parsed === 'string') {
      return parseRecursive(unescapeString(parsed));
    }
    // If parsed value is an object or array, recursively parse its contents.
    else if (typeof parsed === 'object' && parsed !== null) {
      if (Array.isArray(parsed)) {
        return parsed.map(item => parseRecursive(item));
      } else {
        for (const key in parsed) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            parsed[key] = parseRecursive(parsed[key]);
          }
        }
        return parsed;
      }
    }
    // If it's a primitive (number, boolean, null), return as is.
    else {
      return parsed;
    }
  } catch (e) {
    // If JSON.parse fails, it means the string is not valid JSON.
    // In this case, return the original string.
    return value;
  }
};