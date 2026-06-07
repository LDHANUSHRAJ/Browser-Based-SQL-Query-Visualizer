/**
 * LEXER (TOKENIZER)
 *
 * Converts raw SQL string into a flat array of tokens.
 * Each token has: type, value, line, column.
 *
 * Token types: KEYWORD, IDENTIFIER, NUMBER, STRING, OPERATOR,
 *              PUNCTUATION, WHITESPACE (skipped)
 *
 * Implementation: Single-pass scan with a position pointer.
 * Greedy matching: consume as many chars as valid for current type.
 *
 * Lexer is Phase 1 of compilation (lexical analysis).
 * Parser (Phase 2) operates on token stream, not raw chars.
 * This separation makes the parser cleaner and error messages better.
 */

import { ParseError } from './error';

export type TokenType =
  | 'KEYWORD' | 'IDENTIFIER' | 'NUMBER' | 'STRING'
  | 'OPERATOR' | 'PUNCTUATION' | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL',
  'OUTER', 'CROSS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'IS', 'NULL', 'AS', 'DISTINCT', 'GROUP', 'BY', 'HAVING', 'ORDER',
  'ASC', 'DESC', 'LIMIT', 'OFFSET', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
  'TRUE', 'FALSE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP'
]);

const MULTI_CHAR_OPS = ['<=', '>=', '!=', '<>'];

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];

  constructor(private input: string) {}

  tokenize(): Token[] {
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      const char = this.input[this.pos];

      if (this.isAlpha(char) || char === '_') {
        this.readIdentifierOrKeyword();
      } else if (this.isDigit(char)) {
        this.readNumber();
      } else if (char === "'" || char === '"') {
        this.readString(char);
      } else if (char === '-' && this.input[this.pos + 1] === '-') {
        this.skipLineComment();
      } else if (this.isTwoCharOp()) {
        const op = this.input.slice(this.pos, this.pos + 2);
        this.addToken('OPERATOR', op);
        this.advance(2);
      } else if ('=<>!+-*/'.includes(char)) {
        this.addToken('OPERATOR', char);
        this.advance(1);
      } else if ('(),;.'.includes(char)) {
        this.addToken('PUNCTUATION', char);
        this.advance(1);
      } else {
        throw new ParseError(`Unexpected character: '${char}'`, this.line, this.col);
      }
    }

    this.addToken('EOF', '');
    return this.tokens;
  }

  private readIdentifierOrKeyword(): void {
    const start = this.pos;
    const startCol = this.col;
    while (this.pos < this.input.length &&
           (this.isAlpha(this.input[this.pos]) ||
            this.isDigit(this.input[this.pos]) ||
            this.input[this.pos] === '_')) {
      this.advance(1);
    }
    const raw = this.input.slice(start, this.pos);
    const upper = raw.toUpperCase();
    const type: TokenType = KEYWORDS.has(upper) ? 'KEYWORD' : 'IDENTIFIER';
    this.tokens.push({ type, value: type === 'KEYWORD' ? upper : raw, line: this.line, col: startCol });
  }

  private readNumber(): void {
    const start = this.pos;
    const startCol = this.col;
    while (this.pos < this.input.length &&
           (this.isDigit(this.input[this.pos]) || this.input[this.pos] === '.')) {
      this.advance(1);
    }
    this.tokens.push({ type: 'NUMBER', value: this.input.slice(start, this.pos),
                       line: this.line, col: startCol });
  }

  private readString(quote: string): void {
    const startCol = this.col;
    const startLine = this.line;
    this.advance(1); // skip opening quote
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\n') {
        this.line++;
        this.col = 1;
        this.pos++;
      } else {
        this.advance(1);
      }
    }
    if (this.pos >= this.input.length) {
      throw new ParseError(`Unterminated string literal`, startLine, startCol);
    }
    const value = this.input.slice(start, this.pos);
    this.advance(1); // skip closing quote
    this.tokens.push({ type: 'STRING', value, line: startLine, col: startCol });
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      if (this.input[this.pos] === '\n') { this.line++; this.col = 1; }
      else { this.col++; }
      this.pos++;
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.advance(1);
  }

  private isTwoCharOp(): boolean {
    if (this.pos + 1 >= this.input.length) return false;
    const twoChar = this.input.slice(this.pos, this.pos + 2);
    return MULTI_CHAR_OPS.includes(twoChar);
  }

  private advance(n: number): void { this.pos += n; this.col += n; }
  private addToken(type: TokenType, value: string): void {
    this.tokens.push({ type, value, line: this.line, col: this.col });
  }
  private isAlpha(c: string) { return /[a-zA-Z]/.test(c); }
  private isDigit(c: string) { return /[0-9]/.test(c); }
}
