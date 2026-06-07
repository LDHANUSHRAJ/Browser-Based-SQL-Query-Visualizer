/**
 * Abstract Syntax Tree node definitions for SQL.
 * Every parse result is one of these types.
 *
 * An AST is a tree where each node represents
 * a syntactic construct. Leaves are literals/identifiers.
 * Internal nodes are operations (SELECT, WHERE, JOIN).
 */

export type ASTNode =
  | SelectStatement
  | WhereClause
  | JoinClause
  | GroupByClause
  | OrderByClause
  | Expression
  | Condition
  | Column
  | TableRef
  | Literal
  | Subquery;

export interface SelectStatement {
  type: 'SELECT';
  columns: Column[];
  from: TableRef | JoinClause;
  where?: WhereClause;
  groupBy?: GroupByClause;
  orderBy?: OrderByClause;
  limit?: number;
  distinct: boolean;
}

export interface Column {
  type: 'COLUMN';
  name: string;
  table?: string;
  alias?: string;
  isWildcard: boolean;
  aggregateFunction?: 'COUNT' | 'SUM' | 'AVG' | 'MAX' | 'MIN';
}

export interface TableRef {
  type: 'TABLE_REF';
  name: string;
  alias?: string;
}

export interface JoinClause {
  type: 'JOIN';
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  left: TableRef | JoinClause;
  right: TableRef;
  on: Condition;
}

export interface WhereClause {
  type: 'WHERE';
  condition: Condition;
}

export interface Condition {
  type: 'CONDITION';
  left: Expression | Condition;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL' | 'AND' | 'OR' | 'NOT' | 'BETWEEN';
  right?: Expression | Condition;
}

export interface Expression {
  type: 'EXPRESSION';
  kind: 'column_ref' | 'literal' | 'function_call' | 'arithmetic';
  value: string;
  left?: Expression;
  right?: Expression;
  operator?: '+' | '-' | '*' | '/';
}

export interface Literal {
  type: 'LITERAL';
  dataType: 'string' | 'number' | 'boolean' | 'null';
  value: string | number | boolean | null;
}

export interface GroupByClause {
  type: 'GROUP_BY';
  columns: string[];
  having?: Condition;
}

export interface OrderByClause {
  type: 'ORDER_BY';
  columns: Array<{ column: string; direction: 'ASC' | 'DESC' }>;
}

export interface Subquery {
  type: 'SUBQUERY';
  query: SelectStatement;
  alias?: string;
}
