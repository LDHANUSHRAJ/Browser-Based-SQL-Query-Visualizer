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

const getNodeStyle = (name: string, attributes?: any): {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
  category: string;
} => {
  if (attributes?.type === 'table') {
    return {
      bg: 'bg-emerald-50/90 hover:bg-emerald-50',
      border: 'border-emerald-200/80 shadow-emerald-100/30',
      text: 'text-emerald-950',
      badgeBg: 'bg-emerald-100/80',
      badgeText: 'text-emerald-800',
      icon: '🗂',
      category: 'Table Ref'
    };
  }
  const upperName = name.toUpperCase();
  if (upperName.startsWith('SELECT')) {
    return {
      bg: 'bg-amber-50/90 hover:bg-amber-50',
      border: 'border-amber-200/80 shadow-amber-100/30',
      text: 'text-amber-950',
      badgeBg: 'bg-amber-100/80',
      badgeText: 'text-amber-800',
      icon: '✦',
      category: 'Projection'
    };
  }
  if (upperName.includes('JOIN')) {
    return {
      bg: 'bg-indigo-50/90 hover:bg-indigo-50',
      border: 'border-indigo-200/80 shadow-indigo-100/30',
      text: 'text-indigo-950',
      badgeBg: 'bg-indigo-100/80',
      badgeText: 'text-indigo-800',
      icon: '🔗',
      category: 'Join'
    };
  }
  if (
    upperName.startsWith('WHERE') ||
    upperName === 'AND' ||
    upperName === 'OR' ||
    upperName.includes('=') ||
    upperName.includes('>') ||
    upperName.includes('<') ||
    upperName.includes('LIKE') ||
    upperName.includes('BETWEEN')
  ) {
    return {
      bg: 'bg-rose-50/90 hover:bg-rose-50',
      border: 'border-rose-200/80 shadow-rose-100/30',
      text: 'text-rose-950',
      badgeBg: 'bg-rose-100/80',
      badgeText: 'text-rose-800',
      icon: '🔍',
      category: 'Filter'
    };
  }
  if (upperName.startsWith('GROUP BY') || upperName.startsWith('HAVING') || upperName.startsWith('ON:')) {
    return {
      bg: 'bg-purple-50/90 hover:bg-purple-50',
      border: 'border-purple-200/80 shadow-purple-100/30',
      text: 'text-purple-950',
      badgeBg: 'bg-purple-100/80',
      badgeText: 'text-purple-800',
      icon: '📊',
      category: 'Condition / Group'
    };
  }
  if (upperName.startsWith('ORDER BY')) {
    return {
      bg: 'bg-sky-50/90 hover:bg-sky-50',
      border: 'border-sky-200/80 shadow-sky-100/30',
      text: 'text-sky-950',
      badgeBg: 'bg-sky-100/80',
      badgeText: 'text-sky-800',
      icon: '↕',
      category: 'Sort'
    };
  }
  return {
    bg: 'bg-slate-50/90 hover:bg-slate-50',
    border: 'border-slate-200/80 shadow-slate-100/30',
    text: 'text-slate-950',
    badgeBg: 'bg-slate-100/80',
    badgeText: 'text-slate-800',
    icon: '⚙',
    category: 'Operation'
  };
};

export function Visualizer() {
  const [sql, setSql] = useState(SAMPLE_QUERIES[0]);
  const [ast, setAst] = useState<any>(null);
  const [plan, setPlan] = useState<any[]>([]);
  const [indexes, setIndexes] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tree' | 'plan' | 'indexes'>('plan');
  const [isTreeFullScreen, setIsTreeFullScreen] = useState(false);

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

  const exportTree = async (format: 'png' | 'jpeg' | 'pdf') => {
    const svgElement = document.querySelector('.rd3t-svg') as SVGElement | null;
    if (!svgElement) return;

    try {
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      const styleElement = document.createElement('style');
      let cssText = '';
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        try {
          for (let j = 0; j < sheet.cssRules.length; j++) {
            cssText += sheet.cssRules[j].cssText + '\n';
          }
        } catch (e) {
          // Ignore cross-origin stylesheet errors
        }
      }
      styleElement.textContent = cssText;
      clonedSvg.insertBefore(styleElement, clonedSvg.firstChild);
      clonedSvg.style.backgroundColor = '#ffffff';

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const img = new Image();
      const rect = svgElement.getBoundingClientRect();
      const width = rect.width || 800;
      const height = rect.height || 600;
      const scale = 2; // high definition scale

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (format === 'pdf') {
          import('jspdf').then(({ jsPDF }) => {
            const pdf = new jsPDF({
              orientation: width > height ? 'landscape' : 'portrait',
              unit: 'px',
              format: [width, height]
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
            pdf.save('sql-parse-tree.pdf');
            URL.revokeObjectURL(blobURL);
          });
        } else {
          const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
          const dataURL = canvas.toDataURL(mimeType, 0.95);
          const a = document.createElement('a');
          a.download = `sql-parse-tree.${format}`;
          a.href = dataURL;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobURL);
        }
      };

      img.src = blobURL;
    } catch (err) {
      console.error('Failed to export tree:', err);
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
              <div className={isTreeFullScreen 
                ? "fixed inset-0 z-50 bg-white flex flex-col p-6" 
                : "h-full w-full min-h-[600px] bg-white rounded-xl border border-gray-100 shadow-sm relative flex flex-col"}
                style={isTreeFullScreen ? {} : { height: '600px' }}>
                
                {ast && (
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">🌳 AST Parse Tree</span>
                      {isTreeFullScreen && (
                        <span className="text-[10px] px-2 py-0.5 bg-[#fdfbf7] text-[#da7b5b] border border-[#f4f2ee] rounded-full font-semibold">Full Screen</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Download Options */}
                      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-0.5 shadow-sm">
                        <span className="text-[10px] text-gray-400 px-2 font-bold uppercase tracking-wider">Download</span>
                        <button onClick={() => exportTree('png')} className="text-xs px-2.5 py-1 hover:bg-white text-gray-600 hover:text-gray-900 rounded-md transition-all font-semibold cursor-pointer">PNG</button>
                        <button onClick={() => exportTree('jpeg')} className="text-xs px-2.5 py-1 hover:bg-white text-gray-600 hover:text-gray-900 rounded-md transition-all font-semibold cursor-pointer">JPG</button>
                        <button onClick={() => exportTree('pdf')} className="text-xs px-2.5 py-1 hover:bg-white text-gray-600 hover:text-gray-900 rounded-md transition-all font-semibold cursor-pointer">PDF</button>
                      </div>

                      {/* Fullscreen Toggle */}
                      <button onClick={() => setIsTreeFullScreen(!isTreeFullScreen)}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-1.5 text-xs font-semibold"
                        title={isTreeFullScreen ? "Exit Full Screen" : "Full Screen"}>
                        {isTreeFullScreen ? (
                          <>
                            <span>Exit</span>
                            <span className="text-sm leading-none">↙</span>
                          </>
                        ) : (
                          <>
                            <span>Expand</span>
                            <span className="text-sm leading-none">↗</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {ast ? (
                  <div className="flex-1 w-full relative min-h-0 bg-[#faf9f7] rounded-xl border border-gray-100 overflow-hidden">
                    <Tree
                      data={astToTreeData(ast)}
                      orientation="vertical"
                      pathFunc="step"
                      nodeSize={{ x: 260, y: 130 }}
                      translate={isTreeFullScreen ? { x: window.innerWidth / 2, y: 80 } : { x: 280, y: 60 }}
                      renderCustomNodeElement={({ nodeDatum }) => {
                        const style = getNodeStyle(nodeDatum.name, nodeDatum.attributes);
                        return (
                          <g>
                            <foreignObject
                              x="-110"
                              y="-45"
                              width="220"
                              height="90"
                              className="overflow-visible"
                            >
                              <div className={`p-3.5 rounded-xl border ${style.border} ${style.bg} shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-105 flex flex-col justify-between h-full text-left select-none`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg leading-none">{style.icon}</span>
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className={`text-[9px] font-bold tracking-wider uppercase ${style.badgeText} opacity-80`}>
                                      {style.category}
                                    </span>
                                    <span className={`text-xs font-semibold ${style.text} truncate`}>
                                      {nodeDatum.name}
                                    </span>
                                  </div>
                                </div>
                                
                                {nodeDatum.attributes && Object.keys(nodeDatum.attributes).length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {Object.entries(nodeDatum.attributes).map(([key, val]) => {
                                      if (key === 'type') return null;
                                      return (
                                        <span key={key} className={`text-[8.5px] px-1.5 py-0.5 rounded font-mono ${style.badgeBg} ${style.badgeText} border border-black/5 max-w-full truncate`}>
                                          {key}: {String(val)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </foreignObject>
                          </g>
                        );
                      }}
                    />
                  </div>
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
