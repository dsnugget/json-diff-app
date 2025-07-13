import { unescapeString, parseRecursive } from './utils';

describe('unescapeString', () => {
  it('should remove backslashes from escaped quotes', () => {
    const input = '{"message": "hello"}';
    const expected = '{"message": "hello"}';
    expect(unescapeString(input)).toEqual(expected);
  });

  it('should not modify a string without escaped quotes', () => {
    const input = '{"message": "hello"}';
    expect(unescapeString(input)).toEqual(input);
  });

  it('should handle multiple escaped quotes', () => {
    const input = '"{\"message\": \"hello\"}"';
    const expected = '{"message": "hello"}';
    expect(unescapeString(input)).toEqual(expected);
  });
});

describe('parseRecursive', () => {
  it('should parse a simple JSON string', () => {
    const input = '{"message": "hello"}';
    const expected = {
      message: 'hello',
    };
    expect(parseRecursive(input)).toEqual(expected);
  });

  it('should parse a string containing a JSON string literal', () => {
    const input = '["{\"fulfillment\":\"DELIVERY\"}"]';
    const expected = [{
      fulfillment: 'DELIVERY'
    }];
    expect(parseRecursive(input)).toEqual(expected);
  });

  it('should handle multiple layers of nested JSON strings', () => {
    const input = '"[\"{\\\"fulfillment\\\":\\\"DELIVERY\\\"}\"]"'
    const expected = [{
      fulfillment: 'DELIVERY'
    }];
    expect(parseRecursive(input)).toEqual(expected);
  });

  it('should return the original value if it cannot be parsed as JSON', () => {
    const input = 'just a string';
    expect(parseRecursive(input)).toEqual('just a string');
  });
});
