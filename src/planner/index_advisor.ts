/**
 * INDEX ADVISOR
 *
 * Scans the AST and execution plan to suggest which columns to index.
 */

import type { SelectStatement } from '../parser/ast';

export interface IndexSuggestion {
  table: string;
  column: string;
  indexType: 'B-TREE' | 'HASH' | 'NONE';
  reason: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sqlStatement: string;
}

export function suggestIndexes(ast: SelectStatement): IndexSuggestion[] {
  const suggestions: IndexSuggestion[] = [];

  // WHERE columns
  if (ast.where) {
    const cols = extractWhereColumns(ast.where.condition);
    for (const { table, column, operator } of cols) {
      if (operator === 'LIKE') {
        suggestions.push({
          table: table || 'unknown',
          column,
          indexType: 'NONE',
          reason: `LIKE operator with leading wildcard cannot use B-tree index`,
          impact: 'HIGH',
          sqlStatement: `-- Cannot index LIKE '%${column}%'. Consider full-text search.`
        });
      } else {
        suggestions.push({
          table: table || 'unknown',
          column,
          indexType: 'B-TREE',
          reason: `Column used in WHERE clause — index reduces scan from O(N) to O(log N)`,
          impact: 'HIGH',
          sqlStatement: `CREATE INDEX idx_${table || 'table'}_${column} ON ${table || 'table'}(${column});`
        });
      }
    }
  }

  // JOIN columns
  if (ast.from.type === 'JOIN') {
    const joinCols = extractJoinColumns(ast.from);
    for (const { table, column } of joinCols) {
      suggestions.push({
        table,
        column,
        indexType: 'B-TREE',
        reason: `Column used in JOIN ON — index prevents full table scan on each join`,
        impact: 'HIGH',
        sqlStatement: `CREATE INDEX idx_${table}_${column} ON ${table}(${column});`
      });
    }
  }

  // ORDER BY columns
  if (ast.orderBy) {
    for (const { column } of ast.orderBy.columns) {
      // column could be "table.col"
      const parts = column.split('.');
      const t = parts.length > 1 ? parts[0] : 'table_name';
      const c = parts.length > 1 ? parts[1] : column;
      suggestions.push({
        table: t,
        column: c,
        indexType: 'B-TREE',
        reason: `Column used in ORDER BY — index eliminates O(N log N) filesort`,
        impact: 'MEDIUM',
        sqlStatement: `CREATE INDEX idx_${t}_${c} ON ${t}(${c});`
      });
    }
  }

  // GROUP BY columns
  if (ast.groupBy) {
    for (const column of ast.groupBy.columns) {
      const parts = column.split('.');
      const t = parts.length > 1 ? parts[0] : 'table_name';
      const c = parts.length > 1 ? parts[1] : column;
      suggestions.push({
        table: t,
        column: c,
        indexType: 'B-TREE',
        reason: `Column used in GROUP BY — index avoids sorting phase during aggregation`,
        impact: 'MEDIUM',
        sqlStatement: `CREATE INDEX idx_${t}_${c} ON ${t}(${c});`
      });
    }
  }

  // Deduplicate by column name
  const seen = new Set<string>();
  return suggestions.filter(s => {
    const key = `${s.table}.${s.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractWhereColumns(condition: any): Array<{ table?: string; column: string; operator: string }> {
  if (!condition) return [];
  const cols: Array<{ table?: string; column: string; operator: string }> = [];

  if (condition.operator === 'AND' || condition.operator === 'OR') {
    cols.push(...extractWhereColumns(condition.left));
    cols.push(...extractWhereColumns(condition.right));
  } else if (condition.left?.kind === 'column_ref') {
    const parts = condition.left.value.split('.');
    cols.push({
      table: parts.length > 1 ? parts[0] : undefined,
      column: parts[parts.length - 1],
      operator: condition.operator
    });
  }
  return cols;
}

function extractJoinColumns(node: any): Array<{ table: string; column: string }> {
  if (node.type !== 'JOIN') return [];
  const cols: Array<{ table: string; column: string }> = [];

  const on = node.on;
  if (on?.left?.kind === 'column_ref') {
    const parts = on.left.value.split('.');
    if (parts.length > 1) cols.push({ table: parts[0], column: parts[1] });
  }
  if (on?.right?.kind === 'column_ref') {
    const parts = on.right.value.split('.');
    if (parts.length > 1) cols.push({ table: parts[0], column: parts[1] });
  }

  cols.push(...extractJoinColumns(node.left));
  return cols;
}
