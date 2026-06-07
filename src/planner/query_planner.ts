/**
 * QUERY EXECUTION PLANNER
 *
 * Converts the AST into an ordered list of execution steps.
 * This is what a real database query optimizer does (simplified).
 */

import type { SelectStatement, JoinClause } from '../parser/ast';

export interface PlanStep {
  id: string;
  order: number;
  operation: string;
  operationLabel: string;
  description: string;
  tables: string[];
  columns: string[];
  estimatedCost: number;
  costLabel: string;
  optimization?: string;
  icon: string;
}

export function generateExecutionPlan(ast: SelectStatement): PlanStep[] {
  const steps: PlanStep[] = [];
  let order = 1;

  // ── Step 1: FROM + TABLE SCAN ──
  const tables = extractTables(ast.from);
  steps.push({
    id: `step-${order}`,
    order: order++,
    operation: 'TABLE_SCAN',
    operationLabel: 'Table Scan',
    description: `Scan all rows from: ${tables.join(', ')}`,
    tables,
    columns: [],
    estimatedCost: tables.length * 1000,
    costLabel: `O(N) per table — ${tables.length} table(s)`,
    icon: '🗂️'
  });

  // ── Step 2: JOIN ──
  if (ast.from.type === 'JOIN') {
    const joins = flattenJoins(ast.from);
    for (const join of joins) {
      const isEquiJoin = join.on.operator === '=';
      steps.push({
        id: `step-${order}`,
        order: order++,
        operation: isEquiJoin ? 'HASH_JOIN' : 'NESTED_LOOP_JOIN',
        operationLabel: isEquiJoin ? 'Hash Join' : 'Nested Loop Join',
        description: `${join.joinType} JOIN ${join.right.name} ON ${conditionToString(join.on)}`,
        tables: [join.right.name],
        columns: extractConditionColumns(join.on),
        estimatedCost: isEquiJoin ? 2000 : 10000,
        costLabel: isEquiJoin ? 'O(N+M) — hash join' : 'O(N×M) — nested loop',
        optimization: !isEquiJoin
          ? 'Consider rewriting join condition as an equality for hash join optimization'
          : undefined,
        icon: '🔗'
      });
    }
  }

  // ── Step 3: WHERE ──
  if (ast.where) {
    const filterCols = extractConditionColumns(ast.where.condition);
    const condStr = conditionToString(ast.where.condition);
    steps.push({
      id: `step-${order}`,
      order: order++,
      operation: 'FILTER',
      operationLabel: 'Filter (WHERE)',
      description: `Filter rows: ${condStr}`,
      tables,
      columns: filterCols,
      estimatedCost: 500,
      costLabel: 'O(N) — full row scan',
      icon: '🔍'
    });
  }

  // ── Step 4: GROUP BY ──
  if (ast.groupBy) {
    steps.push({
      id: `step-${order}`,
      order: order++,
      operation: 'AGGREGATE',
      operationLabel: 'Group By + Aggregate',
      description: `Group by: ${ast.groupBy.columns.join(', ')}${
        ast.groupBy.having ? ` HAVING ${conditionToString(ast.groupBy.having)}` : ''
      }`,
      tables,
      columns: ast.groupBy.columns,
      estimatedCost: 800,
      costLabel: 'O(N log N) — sort-based grouping',
      icon: '📊'
    });
  }

  // ── Step 5: SELECT (Projection) ──
  const selectedCols = ast.columns.map(c =>
    c.isWildcard ? '*' : `${c.aggregateFunction ? c.aggregateFunction + '(' : ''}${c.table ? c.table + '.' : ''}${c.name}${c.aggregateFunction ? ')' : ''}${c.alias ? ' AS ' + c.alias : ''}`
  );
  steps.push({
    id: `step-${order}`,
    order: order++,
    operation: 'PROJECT',
    operationLabel: 'Project Columns (SELECT)',
    description: `Return columns: ${selectedCols.join(', ')}`,
    tables,
    columns: selectedCols,
    estimatedCost: 100,
    costLabel: 'O(N) — column extraction',
    icon: '📋'
  });

  // ── Step 6: DISTINCT ──
  if (ast.distinct) {
    steps.push({
      id: `step-${order}`,
      order: order++,
      operation: 'DEDUPLICATE',
      operationLabel: 'Deduplicate (DISTINCT)',
      description: 'Remove duplicate rows using hash set',
      tables,
      columns: [],
      estimatedCost: 600,
      costLabel: 'O(N) average — hash deduplication',
      icon: '🔄'
    });
  }

  // ── Step 7: ORDER BY ──
  if (ast.orderBy) {
    const sortCols = ast.orderBy.columns.map(c => `${c.column} ${c.direction}`).join(', ');
    steps.push({
      id: `step-${order}`,
      order: order++,
      operation: 'SORT',
      operationLabel: 'Sort (ORDER BY)',
      description: `Sort result by: ${sortCols}`,
      tables,
      columns: ast.orderBy.columns.map(c => c.column),
      estimatedCost: 700,
      costLabel: 'O(N log N) — comparison sort',
      icon: '↕️'
    });
  }

  // ── Step 8: LIMIT ──
  if (ast.limit !== undefined) {
    steps.push({
      id: `step-${order}`,
      order: order++,
      operation: 'LIMIT',
      operationLabel: 'Limit Rows',
      description: `Return first ${ast.limit} rows`,
      tables,
      columns: [],
      estimatedCost: 10,
      costLabel: 'O(1) — early termination',
      icon: '✂️'
    });
  }

  return steps;
}

// ─── Helpers ───

function extractTables(node: any): string[] {
  if (node.type === 'TABLE_REF') return [node.alias || node.name];
  if (node.type === 'JOIN') {
    return [...extractTables(node.left), node.right.alias || node.right.name];
  }
  return [];
}

function flattenJoins(node: any): any[] {
  if (node.type !== 'JOIN') return [];
  return [...flattenJoins(node.left), node];
}

export function conditionToString(condition: any): string {
  if (!condition) return '';
  if (condition.operator === 'AND' || condition.operator === 'OR') {
    return `(${conditionToString(condition.left)} ${condition.operator} ${conditionToString(condition.right)})`;
  }
  if (condition.operator === 'NOT') return `NOT ${conditionToString(condition.left)}`;
  if (condition.operator === 'IS NULL') return `${expressionToString(condition.left)} IS NULL`;
  if (condition.operator === 'IS NOT NULL') return `${expressionToString(condition.left)} IS NOT NULL`;
  return `${expressionToString(condition.left)} ${condition.operator} ${expressionToString(condition.right)}`;
}

export function expressionToString(expr: any): string {
  if (!expr) return '';
  if (expr.kind === 'column_ref') return expr.value;
  if (expr.kind === 'literal') return expr.value;
  if (expr.kind === 'function_call') return expr.value;
  if (expr.kind === 'arithmetic') return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
  return expr.value || '';
}

function extractConditionColumns(condition: any): string[] {
  if (!condition) return [];
  const cols: string[] = [];
  if (condition.left?.kind === 'column_ref') cols.push(condition.left.value);
  if (condition.right?.kind === 'column_ref') cols.push(condition.right.value);
  if (condition.left?.type === 'CONDITION') cols.push(...extractConditionColumns(condition.left));
  if (condition.right?.type === 'CONDITION') cols.push(...extractConditionColumns(condition.right));
  return [...new Set(cols)];
}
