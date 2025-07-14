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

// Helper function to sort object keys recursively
export const sortObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    // Recursively sort elements, then sort the array itself.
    // For objects within an array, sort them by their stringified representation
    // to ensure a consistent order.
    return obj.map(sortObject).sort((a, b) => {
      const stringA = JSON.stringify(a);
      const stringB = JSON.stringify(b);
      if (stringA < stringB) return -1;
      if (stringA > stringB) return 1;
      return 0;
    });
  }

  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObject(obj[key]);
      return result;
    }, {});
};