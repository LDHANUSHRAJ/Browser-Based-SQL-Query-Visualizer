import { useState } from 'react';
import Editor from '@monaco-editor/react';
import Tree from 'react-d3-tree';
import { SQLParser } from '../parser/parser';
import { generateExecutionPlan } from '../planner/query_planner';
import { suggestIndexes } from '../planner/index_advisor';
import { astToTreeData } from '../parser/ast_to_tree';

const SAMPLE_QUERIES = [
  `SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.name
ORDER BY order_count DESC
LIMIT 10;`,

  `SELECT p.title, c.name AS category, AVG(r.rating) AS avg_rating
FROM products p
INNER JOIN categories c ON p.category_id = c.id
LEFT JOIN reviews r ON p.id = r.product_id
WHERE p.price BETWEEN 10 AND 100
  AND c.name LIKE 'Electronics%'
GROUP BY p.title, c.name
HAVING AVG(r.rating) > 3.5
ORDER BY avg_rating DESC;`
];

export function Visualizer() {
  const [sql, setSql] = useState(SAMPLE_QUERIES[0]);
  const [ast, setAst] = useState<any>(null);
  const [plan, setPlan] = useState<any[]>([]);
  const [indexes, setIndexes] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tree' | 'plan' | 'indexes'>('plan');

  const analyze = () => {
    try {
      const parser = new SQLParser();
      const parsedAst = parser.parse(sql);
      const execPlan = generateExecutionPlan(parsedAst);
      const indexSuggestions = suggestIndexes(parsedAst);

      setAst(parsedAst);
      setPlan(execPlan);
      setIndexes(indexSuggestions);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setAst(null);
      setPlan([]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fdfbf7] to-[#f4f2ee] text-gray-800 flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-md border-b border-gray-200/60 px-8 py-5 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <span className="text-[#d97757]">✦</span> SQL Visualizer
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">
            Recursive descent parser · Execution plan · Index advisor
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden m-4 gap-4">
        {/* Left: Editor */}
        <div className="w-1/2 flex flex-col bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-200 overflow-hidden">
          <div className="flex-1 relative pt-4">
            <Editor
              height="100%"
              language="sql"
              value={sql}
              onChange={(v) => setSql(v || '')}
              theme="light"
              options={{ 
                fontSize: 14, 
                minimap: { enabled: false }, 
                wordWrap: 'on',
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false,
                padding: { top: 16 }
              }}
            />
          </div>

          {/* Sample query buttons */}
          <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex gap-2 items-center">
            {SAMPLE_QUERIES.map((q, i) => (
              <button key={i} onClick={() => setSql(q)}
                className="text-xs px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer shadow-sm font-medium">
                Sample {i + 1}
              </button>
            ))}
            <button onClick={analyze}
              className="ml-auto px-6 py-2 bg-gradient-to-r from-[#da7b5b] to-[#d1613d] hover:from-[#d1613d] hover:to-[#c25533] text-white rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2">
              <span>▶</span> Analyze
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50/80 border-t border-red-100 text-red-600 font-mono text-sm">
              <span className="font-bold mr-2">Parse Error:</span> {error}
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="w-1/2 flex flex-col bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 bg-gray-50/50 px-2 pt-2">
            {(['plan', 'tree', 'indexes'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium cursor-pointer transition-all rounded-t-lg relative ${activeTab === tab
                  ? 'text-[#d97757] bg-white border-t border-x border-gray-200/60 shadow-[0_-2px_6px_rgba(0,0,0,0.02)] z-10'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'}`}>
                {tab === 'plan' ? '📋 Exec Plan' : tab === 'tree' ? '🌳 Parse Tree' : '⚡ Indexes'}
                {activeTab === tab && <div className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-white"></div>}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#faf9f7]">
            {activeTab === 'plan' && (
              <div className="space-y-4">
                {plan.length === 0 && !error && (
                  <div className="text-center text-gray-400 mt-16 font-medium">
                    Click Analyze to generate execution plan
                  </div>
                )}
                {plan.map((step, i) => (
                  <div key={step.id}
                    className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-3xl bg-[#fdfbf7] border border-[#f4f2ee] p-2.5 rounded-xl shadow-sm">{step.icon}</span>
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Step {step.order}</span>
                          <span className="text-base font-semibold text-gray-800">{step.operationLabel}</span>
                          <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded font-mono uppercase tracking-wider">
                            {step.operation}
                          </span>
                        </div>
                        <p className="text-gray-500 text-sm mt-1.5">{step.description}</p>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-[#fdfbf7] border border-[#f4f2ee] rounded-lg flex items-center justify-between text-xs font-mono">
                      <span className="text-gray-500 font-sans font-medium text-xs">Estimated Cost</span>
                      <span className="text-amber-600 font-medium">{step.costLabel}</span>
                    </div>
                    {step.optimization && (
                      <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-lg flex items-start gap-2 text-xs text-orange-800">
                        <span className="text-sm">💡</span>
                        <span className="font-medium leading-relaxed">{step.optimization}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'tree' && (
              <div className="h-full w-full min-h-[600px] bg-white rounded-xl border border-gray-100 shadow-sm" style={{ height: '600px' }}>
                {ast ? (
                  <Tree
                    data={astToTreeData(ast)}
                    orientation="vertical"
                    pathFunc="step"
                    nodeSize={{ x: 250, y: 100 }}
                    renderCustomNodeElement={({ nodeDatum }) => (
                      <g>
                        <rect x="-80" y="-20" width="160" height="40" rx="8"
                          fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.05))"/>
                        <text y="5" textAnchor="middle" fill="#334155"
                          fontSize="13" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="500">
                          {(nodeDatum.name as string).length > 22
                            ? (nodeDatum.name as string).slice(0, 19) + '…'
                            : nodeDatum.name as string}
                        </text>
                      </g>
                    )}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 font-medium">
                    Click Analyze to generate parse tree
                  </div>
                )}
              </div>
            )}

            {activeTab === 'indexes' && (
              <div className="space-y-4">
                {indexes.length === 0 && ast && !error && (
                  <div className="text-center text-green-700 mt-16 font-medium p-4 bg-green-50 border border-green-100 rounded-xl shadow-sm">
                    ✓ No additional indexes recommended for this query
                  </div>
                )}
                {indexes.length === 0 && !ast && !error && (
                  <div className="text-center text-gray-400 mt-16 font-medium">
                    Click Analyze to generate index suggestions
                  </div>
                )}
                {indexes.map((idx, i) => (
                  <div key={i} className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border tracking-wider ${
                        idx.impact === 'HIGH' ? 'bg-red-50 text-red-600 border-red-100' :
                        idx.impact === 'MEDIUM' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {idx.impact} IMPACT
                      </span>
                      <span className="text-sm font-bold text-gray-800">
                        {idx.table}.{idx.column}
                      </span>
                      <span className="text-xs text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{idx.indexType}</span>
                    </div>
                    <p className="text-gray-600 text-sm mb-4 leading-relaxed">{idx.reason}</p>
                    <div className="relative">
                      <pre className="p-3.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-mono text-gray-800 overflow-x-auto shadow-inner">
                        {idx.sqlStatement}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
