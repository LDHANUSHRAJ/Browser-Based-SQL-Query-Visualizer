/**
 * ParseError class with line and column information.
 * Used by both the Lexer and Parser to report precise error locations.
 */
export class ParseError extends Error {
  line: number;
  col: number;

  constructor(message: string, line: number, col: number) {
    super(`${message} at line ${line}, column ${col}`);
    this.name = 'ParseError';
    this.line = line;
    this.col = col;
  }
}
