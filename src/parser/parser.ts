/**
 * RECURSIVE DESCENT PARSER
 *
 * Converts token stream → AST.
 *
 * GRAMMAR (simplified BNF):
 *   query        → SELECT [DISTINCT] columns FROM table_expr [where] [groupby] [orderby] [limit]
 *   columns      → column (',' column)*
 *   column       → '*' | [table '.'] identifier [AS identifier]
 *                | aggregate_fn '(' column ')' [AS identifier]
 *   table_expr   → table_ref (join_clause)*
 *   join_clause  → [INNER|LEFT|RIGHT|FULL] JOIN table_ref ON condition
 *   where        → WHERE condition
 *   condition    → and_cond (OR and_cond)*
 *   and_cond     → not_cond (AND not_cond)*
 *   not_cond     → NOT? comparison
 *   comparison   → expression (op expression | IS [NOT] NULL | [NOT] IN '(' values ')' | BETWEEN val AND val)
 *   expression   → term (('+' | '-') term)*
 *   term         → factor (('*' | '/') factor)*
 *   factor       → NUMBER | STRING | identifier | '(' expression ')'
 *
 * Recursive descent maps grammar rules directly to functions.
 * Each non-terminal = one function. Operator precedence handled by
 * call hierarchy (expression calls term calls factor).
 *
 * COMPLEXITY: O(N) token stream length for LL(1) grammar (one lookahead).
 */

import type { Token } from './lexer';
import { Lexer } from './lexer';
import type {
  SelectStatement, Column, TableRef, JoinClause,
  WhereClause, Condition, Expression, GroupByClause, OrderByClause
} from './ast';
import { ParseError } from './error';

export class SQLParser {
  private tokens: Token[] = [];
  private pos = 0;

  parse(sql: string): SelectStatement {
    const lexer = new Lexer(sql);
    this.tokens = lexer.tokenize();
    this.pos = 0;
    const result = this.parseSelect();
    // Allow optional trailing semicolon
    if (this.peek().value === ';') {
      this.consume();
    }
    return result;
  }

  // ─── Helpers ───

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private consume(type?: string, value?: string): Token {
    const token = this.tokens[this.pos];
    if (type && token.type !== type) {
      throw new ParseError(
        `Expected ${type}${value ? ` '${value}'` : ''}, got '${token.value}'`,
        token.line, token.col
      );
    }
    if (value && token.value.toUpperCase() !== value.toUpperCase()) {
      throw new ParseError(
        `Expected '${value}', got '${token.value}'`,
        token.line, token.col
      );
    }
    this.pos++;
    return token;
  }

  private match(value: string): boolean {
    if (this.peek().value.toUpperCase() === value.toUpperCase()) {
      this.pos++;
      return true;
    }
    return false;
  }

  private check(value: string): boolean {
    return this.peek().value.toUpperCase() === value.toUpperCase();
  }

  // ─── Grammar Rules ───

  private parseSelect(): SelectStatement {
    this.consume('KEYWORD', 'SELECT');
    const distinct = this.match('DISTINCT');
    const columns = this.parseColumns();

    this.consume('KEYWORD', 'FROM');
    const from = this.parseTableExpression();

    let where: WhereClause | undefined;
    if (this.check('WHERE')) {
      this.consume('KEYWORD', 'WHERE');
      where = { type: 'WHERE', condition: this.parseCondition() };
    }

    let groupBy: GroupByClause | undefined;
    if (this.check('GROUP')) {
      groupBy = this.parseGroupBy();
    }

    let orderBy: OrderByClause | undefined;
    if (this.check('ORDER')) {
      orderBy = this.parseOrderBy();
    }

    let limit: number | undefined;
    if (this.check('LIMIT')) {
      this.consume('KEYWORD', 'LIMIT');
      limit = parseInt(this.consume('NUMBER').value);
    }

    return { type: 'SELECT', columns, from, where, groupBy, orderBy, limit, distinct };
  }

  private parseColumns(): Column[] {
    const columns: Column[] = [];
    do {
      columns.push(this.parseColumn());
    } while (this.match(','));
    return columns;
  }

  private parseColumn(): Column {
    const AGGREGATES = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN'];

    // Wildcard
    if (this.peek().value === '*') {
      this.consume();
      return { type: 'COLUMN', name: '*', isWildcard: true };
    }

    // Aggregate function: COUNT(col)
    if (AGGREGATES.includes(this.peek().value.toUpperCase())) {
      const fn = this.consume().value.toUpperCase() as Column['aggregateFunction'];
      this.consume('PUNCTUATION', '(');
      let inner: string;
      if (this.peek().value === '*') {
        inner = '*';
        this.consume();
      } else {
        inner = this.consume('IDENTIFIER').value;
        // Handle table.column inside aggregate
        if (this.peek().value === '.') {
          this.consume('PUNCTUATION', '.');
          inner = inner + '.' + this.consume('IDENTIFIER').value;
        }
      }
      this.consume('PUNCTUATION', ')');
      const alias = this.match('AS') ? this.consume('IDENTIFIER').value : undefined;
      return {
        type: 'COLUMN', name: inner, isWildcard: inner === '*',
        aggregateFunction: fn, alias
      };
    }

    // Regular column or table.column
    const first = this.consume('IDENTIFIER').value;
    let name = first;
    let table: string | undefined;

    if (this.peek().value === '.') {
      this.consume('PUNCTUATION', '.');
      table = first;
      name = this.consume('IDENTIFIER').value;
    }

    const alias = this.match('AS') ? this.consume('IDENTIFIER').value : undefined;
    return { type: 'COLUMN', name, table, alias, isWildcard: false };
  }

  private parseTableExpression(): TableRef | JoinClause {
    let left: TableRef | JoinClause = this.parseTableRef();

    while (['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'].includes(
      this.peek().value.toUpperCase()
    )) {
      left = this.parseJoin(left);
    }

    return left;
  }

  private parseTableRef(): TableRef {
    const name = this.consume('IDENTIFIER').value;
    let alias: string | undefined;
    if (this.match('AS')) {
      alias = this.consume('IDENTIFIER').value;
    } else if (
      this.peek().type === 'IDENTIFIER' &&
      !['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'ON',
        'GROUP', 'ORDER', 'LIMIT', 'HAVING'].includes(this.peek().value.toUpperCase())
    ) {
      alias = this.consume('IDENTIFIER').value;
    }
    return { type: 'TABLE_REF', name, alias };
  }

  private parseJoin(left: TableRef | JoinClause): JoinClause {
    let joinType: JoinClause['joinType'] = 'INNER';
    if (this.check('LEFT')) { joinType = 'LEFT'; this.consume(); }
    else if (this.check('RIGHT')) { joinType = 'RIGHT'; this.consume(); }
    else if (this.check('FULL')) { joinType = 'FULL'; this.consume(); }
    else if (this.check('CROSS')) { joinType = 'CROSS'; this.consume(); }
    else if (this.check('INNER')) { this.consume(); }

    if (this.check('OUTER')) this.consume(); // OUTER is optional keyword
    this.consume('KEYWORD', 'JOIN');

    const right = this.parseTableRef();

    // CROSS JOIN doesn't have ON clause
    if (joinType === 'CROSS') {
      return {
        type: 'JOIN', joinType, left, right,
        on: { type: 'CONDITION', left: { type: 'EXPRESSION', kind: 'literal', value: 'TRUE' }, operator: '=' }
      };
    }

    this.consume('KEYWORD', 'ON');
    const on = this.parseCondition();

    return { type: 'JOIN', joinType, left, right, on };
  }

  private parseCondition(): Condition {
    return this.parseOrCondition();
  }

  private parseOrCondition(): Condition {
    let left = this.parseAndCondition();
    while (this.check('OR')) {
      this.consume();
      const right = this.parseAndCondition();
      left = { type: 'CONDITION', left, operator: 'OR', right };
    }
    return left;
  }

  private parseAndCondition(): Condition {
    let left = this.parseNotCondition();
    while (this.check('AND') && !this.isPartOfBetween()) {
      this.consume();
      const right = this.parseNotCondition();
      left = { type: 'CONDITION', left, operator: 'AND', right };
    }
    return left;
  }

  /** Check if the current AND is part of a BETWEEN ... AND ... expression */
  private isPartOfBetween(): boolean {
    // We track this contextually – look backwards for BETWEEN
    // Since our parser handles BETWEEN explicitly in parseComparison, this is just a safeguard
    return false;
  }

  private parseNotCondition(): Condition {
    if (this.check('NOT')) {
      this.consume();
      const operand = this.parseComparison();
      return { type: 'CONDITION', left: operand, operator: 'NOT' };
    }
    return this.parseComparison();
  }

  private parseComparison(): Condition {
    // Handle parenthesized conditions
    if (this.peek().value === '(') {
      // Look ahead to see if this is a subexpression or grouped condition
      const savePos = this.pos;
      this.consume(); // consume (
      try {
        const cond = this.parseCondition();
        this.consume('PUNCTUATION', ')');
        // Check if there's a comparison operator after
        const op = this.peek().value.toUpperCase();
        if (['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'IN', 'IS', 'BETWEEN', 'AND', 'OR'].includes(op)) {
          // It was a grouped condition, continue
          return cond;
        }
        return cond;
      } catch {
        // Not a condition, restore and treat as expression
        this.pos = savePos;
      }
    }

    const left: Expression = this.parseExpression();
    const op = this.peek().value.toUpperCase();
    const ops = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'IN', 'IS', 'BETWEEN', 'NOT'];

    if (!ops.includes(op)) {
      // Bare expression as condition
      return { type: 'CONDITION', left, operator: '=' };
    }

    if (op === 'IS') {
      this.consume();
      const notNull = this.check('NOT');
      if (notNull) this.consume();
      this.consume('KEYWORD', 'NULL');
      return { type: 'CONDITION', left, operator: notNull ? 'IS NOT NULL' : 'IS NULL' };
    }

    if (op === 'NOT') {
      this.consume(); // NOT
      if (this.check('IN')) {
        this.consume(); // IN
        this.consume('PUNCTUATION', '(');
        const values: Expression[] = [];
        do {
          values.push(this.parseExpression());
        } while (this.match(','));
        this.consume('PUNCTUATION', ')');
        return {
          type: 'CONDITION', left, operator: 'NOT IN',
          right: { type: 'EXPRESSION', kind: 'literal', value: values.map(v => v.value).join(', ') }
        };
      }
      // If not IN after NOT, treat as NOT condition
      const operand = this.parseComparison();
      return { type: 'CONDITION', left: operand, operator: 'NOT' };
    }

    if (op === 'IN') {
      this.consume();
      this.consume('PUNCTUATION', '(');
      const values: Expression[] = [];
      do {
        values.push(this.parseExpression());
      } while (this.match(','));
      this.consume('PUNCTUATION', ')');
      return {
        type: 'CONDITION', left, operator: 'IN',
        right: { type: 'EXPRESSION', kind: 'literal', value: `(${values.map(v => v.value).join(', ')})` }
      };
    }

    if (op === 'BETWEEN') {
      this.consume();
      const low = this.parseExpression();
      this.consume('KEYWORD', 'AND');
      const high = this.parseExpression();
      return {
        type: 'CONDITION', left, operator: 'BETWEEN',
        right: {
          type: 'EXPRESSION', kind: 'arithmetic',
          value: 'BETWEEN_RANGE', left: low, right: high
        }
      };
    }

    const operator = this.consume().value as Condition['operator'];
    const right = this.parseExpression();
    return { type: 'CONDITION', left, operator, right };
  }

  private parseExpression(): Expression {
    let left = this.parseTerm();
    while (['+', '-'].includes(this.peek().value)) {
      const op = this.consume().value as '+' | '-';
      const right = this.parseTerm();
      left = { type: 'EXPRESSION', kind: 'arithmetic', value: op, left, right, operator: op };
    }
    return left;
  }

  private parseTerm(): Expression {
    let left = this.parseFactor();
    while (this.peek().value === '/' || (this.peek().value === '*' && this.peek().type === 'OPERATOR')) {
      const op = this.consume().value as '*' | '/';
      const right = this.parseFactor();
      left = { type: 'EXPRESSION', kind: 'arithmetic', value: op, left, right, operator: op };
    }
    return left;
  }

  private parseFactor(): Expression {
    const token = this.peek();

    if (token.type === 'NUMBER') {
      this.consume();
      return { type: 'EXPRESSION', kind: 'literal', value: token.value };
    }
    if (token.type === 'STRING') {
      this.consume();
      return { type: 'EXPRESSION', kind: 'literal', value: `'${token.value}'` };
    }
    if (token.value === 'NULL' || token.value === 'TRUE' || token.value === 'FALSE') {
      this.consume();
      return { type: 'EXPRESSION', kind: 'literal', value: token.value };
    }
    if (token.value === '(') {
      this.consume();
      const expr = this.parseExpression();
      this.consume('PUNCTUATION', ')');
      return expr;
    }
    if (token.type === 'IDENTIFIER' || token.type === 'KEYWORD') {
      // Allow aggregate functions in expressions
      const AGGREGATES = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN'];
      if (AGGREGATES.includes(token.value.toUpperCase()) && this.peek(1).value === '(') {
        const fn = this.consume().value;
        this.consume('PUNCTUATION', '(');
        let arg: string;
        if (this.peek().value === '*') {
          arg = '*';
          this.consume();
        } else {
          arg = this.parseExpression().value;
        }
        this.consume('PUNCTUATION', ')');
        return { type: 'EXPRESSION', kind: 'function_call', value: `${fn}(${arg})` };
      }

      this.consume();
      let value = token.value;
      if (this.peek().value === '.') {
        this.consume();
        value += '.' + this.consume('IDENTIFIER').value;
      }
      return { type: 'EXPRESSION', kind: 'column_ref', value };
    }

    throw new ParseError(`Unexpected token: '${token.value}'`, token.line, token.col);
  }

  private parseGroupBy(): GroupByClause {
    this.consume('KEYWORD', 'GROUP');
    this.consume('KEYWORD', 'BY');
    const columns: string[] = [];
    do {
      let col = this.consume('IDENTIFIER').value;
      if (this.peek().value === '.') {
        this.consume();
        col += '.' + this.consume('IDENTIFIER').value;
      }
      columns.push(col);
    } while (this.match(','));

    let having: Condition | undefined;
    if (this.check('HAVING')) {
      this.consume('KEYWORD', 'HAVING');
      having = this.parseCondition();
    }
    return { type: 'GROUP_BY', columns, having };
  }

  private parseOrderBy(): OrderByClause {
    this.consume('KEYWORD', 'ORDER');
    this.consume('KEYWORD', 'BY');
    const columns: OrderByClause['columns'] = [];
    do {
      let column = this.consume('IDENTIFIER').value;
      if (this.peek().value === '.') {
        this.consume();
        column += '.' + this.consume('IDENTIFIER').value;
      }
      const direction = this.check('DESC')
        ? (this.consume(), 'DESC' as const)
        : (this.match('ASC'), 'ASC' as const);
      columns.push({ column, direction });
    } while (this.match(','));
    return { type: 'ORDER_BY', columns };
  }
}
