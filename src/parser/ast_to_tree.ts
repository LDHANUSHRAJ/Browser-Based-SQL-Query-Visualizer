import { conditionToString, expressionToString } from '../planner/query_planner';

/**
 * Converts our AST into react-d3-tree's format:
 * { name: string, attributes?: object, children?: Node[] }
 */
export function astToTreeData(node: any): any {
  if (!node) return null;

  switch (node.type) {
    case 'SELECT':
      return {
        name: node.distinct ? 'SELECT DISTINCT' : 'SELECT',
        attributes: { columns: node.columns.length },
        children: [
          astToTreeData(node.from),
          node.where && astToTreeData(node.where),
          node.groupBy && astToTreeData(node.groupBy),
          node.orderBy && astToTreeData(node.orderBy),
          node.limit !== undefined && { name: `LIMIT ${node.limit}` }
        ].filter(Boolean)
      };

    case 'TABLE_REF':
      return {
        name: node.alias ? `${node.name} AS ${node.alias}` : node.name,
        attributes: { type: 'table' }
      };

    case 'JOIN':
      return {
        name: `${node.joinType} JOIN`,
        children: [
          astToTreeData(node.left),
          astToTreeData(node.right),
          { name: `ON: ${conditionToString(node.on)}` }
        ]
      };

    case 'WHERE':
      return {
        name: 'WHERE',
        children: [conditionToTreeNode(node.condition)]
      };

    case 'GROUP_BY':
      return {
        name: 'GROUP BY',
        attributes: { columns: node.columns.join(', ') },
        children: node.having ? [{ name: `HAVING: ${conditionToString(node.having)}` }] : []
      };

    case 'ORDER_BY':
      return {
        name: 'ORDER BY',
        attributes: {
          columns: node.columns.map((c: any) => `${c.column} ${c.direction}`).join(', ')
        }
      };

    default:
      return { name: node.type || 'unknown' };
  }
}

function conditionToTreeNode(condition: any): any {
  if (!condition) return { name: 'null' };
  if (condition.operator === 'AND' || condition.operator === 'OR') {
    return {
      name: condition.operator,
      children: [
        conditionToTreeNode(condition.left),
        conditionToTreeNode(condition.right)
      ]
    };
  }
  return { name: `${expressionToString(condition.left)} ${condition.operator} ${expressionToString(condition.right || {})}` };
}
