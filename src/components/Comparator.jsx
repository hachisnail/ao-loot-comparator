import { useState, useMemo, useEffect } from 'react';


// test commit
export default function Comparator() {
  const [step, setStep] = useState(1);
  const [statsLog, setStatsLog] = useState('');
  const [chestLog, setChestLog] = useState('');
  const [results, setResults] = useState(null);

  const [searchPlayer, setSearchPlayer] = useState('');
  const [searchGuild, setSearchGuild] = useState('');
  const [searchItem, setSearchItem] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  // === NEW: TEMPORARY PERSISTENCE (Load from Browser Storage) ===
  useEffect(() => {
    const savedStats = localStorage.getItem('ao_statsLog');
    const savedChest = localStorage.getItem('ao_chestLog');
    const savedResults = localStorage.getItem('ao_results');
    const savedStep = localStorage.getItem('ao_step');

    if (savedStats) setStatsLog(savedStats);
    if (savedChest) setChestLog(savedChest);
    if (savedResults) setResults(JSON.parse(savedResults));
    if (savedStep) setStep(parseInt(savedStep, 10));
  }, []);

  // === NEW: TEMPORARY PERSISTENCE (Save to Browser Storage) ===
  useEffect(() => {
    localStorage.setItem('ao_statsLog', statsLog);
    localStorage.setItem('ao_chestLog', chestLog);
    localStorage.setItem('ao_step', step.toString());
    if (results) {
      localStorage.setItem('ao_results', JSON.stringify(results));
    } else {
      localStorage.removeItem('ao_results');
    }
  }, [statsLog, chestLog, step, results]);

  const handleFileUpload = (event, setLogState) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setLogState(e.target.result);
    reader.readAsText(file);
    event.target.value = null;
  };

  const handleCompare = () => {
    const records = {};
    const playerGuilds = {}; 

    const statLines = statsLog.split('\n');
    statLines.forEach(line => {
      if (!line.trim() || line.includes('timestamp_utc')) return;
      const parts = line.split(';');
      if (parts.length >= 7) {
        const guild = parts[2].trim();
        const player = parts[3].trim();
        const itemId = parts[4].trim();
        const itemName = parts[5].trim();
        const quantity = parseInt(parts[6].trim(), 10) || 0;

        if (player && guild) playerGuilds[player] = guild;

        if (player && itemName) {
          const key = `${player}|${itemName}`;
          if (!records[key]) records[key] = { player, guild, itemName, itemId, expected: 0, deposited: 0 };
          records[key].expected += quantity;
        }
      }
    });

    const chestLines = chestLog.split('\n');
    chestLines.forEach(line => {
      if (!line.trim() || line.includes('"Date" "Player"')) return;
      const parts = line.split('"').filter(p => p.trim() !== '');
      if (parts.length >= 6) {
        const player = parts[1].trim();
        const itemName = parts[2].trim();
        const amount = parseInt(parts[5].trim(), 10) || 0;

        if (player && itemName) {
          const key = `${player}|${itemName}`;
          const guild = playerGuilds[player] || 'Unknown'; 
          if (!records[key]) records[key] = { player, guild, itemName, itemId: null, expected: 0, deposited: 0 };
          records[key].deposited += amount; 
        }
      }
    });

    const finalResults = Object.values(records)
      .map(row => {
        let status = 'Match';
        if (row.deposited < row.expected) status = 'Missing';
        else if (row.deposited > row.expected) status = 'Extra';
        return { ...row, status };
      })
      .sort((a, b) => a.player.localeCompare(b.player));

    setResults(finalResults);
    setStep(3);
  };

  const reset = () => {
    // Clear state and local storage
    setStatsLog('');
    setChestLog('');
    setResults(null);
    setSearchPlayer('');
    setSearchGuild('');
    setSearchItem('');
    setFilterStatus('All');
    setStep(1);
    localStorage.clear();
  };

  // === NEW: EXPORT TO CSV / DRIVE FUNCTION ===
  const exportToCSV = () => {
    if (!results) return;

    // Create CSV Headers
    let csvContent = "Player,Guild,Item,Expected,Deposited,Status\n";
    
    // Add Rows
    results.forEach(row => {
      // Wrap text in quotes to prevent issues with item names containing commas
      csvContent += `"${row.player}","${row.guild}","${row.itemName}",${row.expected},${row.deposited},"${row.status}"\n`;
    });

    // Create a Blob and trigger a download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `loot_comparison_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Optional: Webhook to Google App Script for direct Drive saving
  const saveToGoogleDrive = async () => {
    // Replace this URL with your deployed Google Apps Script Web App URL
    const googleAppScriptURL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';
    
    if (googleAppScriptURL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
      alert("Please configure your Google Apps Script URL in Comparator.jsx to use this feature.");
      return;
    }

    try {
      // We send the JSON results to your Google Script, which formats it and saves it to a Google Sheet / Drive
      await fetch(googleAppScriptURL, {
        method: 'POST',
        mode: 'no-cors', // Required for simple App Script integrations without complex CORS setup
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          date: new Date().toISOString(),
          data: results 
        })
      });
      alert("Logs successfully sent to Google Drive/Sheets!");
    } catch (error) {
      alert("Failed to save to Google Drive. Check console for errors.");
      console.error(error);
    }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter((row) => {
      const matchesPlayer = row.player.toLowerCase().includes(searchPlayer.toLowerCase());
      const matchesGuild = row.guild.toLowerCase().includes(searchGuild.toLowerCase());
      const matchesItem = row.itemName.toLowerCase().includes(searchItem.toLowerCase());
      const matchesStatus = filterStatus === 'All' || row.status === filterStatus;
      return matchesPlayer && matchesGuild && matchesItem && matchesStatus;
    });
  }, [results, searchPlayer, searchGuild, searchItem, filterStatus]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto font-mono">
      
      {/* Minimalist Stepper */}
      <div className="flex items-center justify-center gap-2 mb-2 text-xs uppercase tracking-widest">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-amber-500' : 'text-stone-700'}`}>
          <span className="font-bold">[ 1 ] AOSTATS</span>
        </div>
        <div className={`w-8 h-[1px] ${step >= 2 ? 'bg-amber-500/50' : 'bg-stone-800'}`}></div>
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-amber-500' : 'text-stone-700'}`}>
          <span className="font-bold">[ 2 ] CHEST LOGS</span>
        </div>
        <div className={`w-8 h-[1px] ${step >= 3 ? 'bg-amber-500/50' : 'bg-stone-800'}`}></div>
        <div className={`flex items-center gap-2 ${step >= 3 ? 'text-amber-500' : 'text-stone-700'}`}>
          <span className="font-bold">[ 3 ] RESULTS</span>
        </div>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3 animate-fade-in">
          {/* ... (Step 1 code remains identical) ... */}
          <div className="flex justify-between items-end">
            <label className="text-stone-300 font-bold text-sm uppercase tracking-wide">AOStatistics Export</label>
            <label className="cursor-pointer text-stone-500 hover:text-amber-500 text-xs transition-colors flex items-center gap-2">
              [ UPLOAD FILE ]
              <input type="file" accept=".txt,.csv" className="hidden" onChange={(e) => handleFileUpload(e, setStatsLog)} />
            </label>
          </div>
          <textarea 
            className="w-full h-80 bg-[#0a0a0a] border border-stone-800 p-4 text-xs text-stone-400 focus:outline-none focus:border-amber-500/50 resize-none"
            placeholder="timestamp_utc;looted_by__alliance;looted_by__guild..."
            value={statsLog}
            onChange={(e) => setStatsLog(e.target.value)}
          />
          <button 
            onClick={() => setStep(2)}
            disabled={!statsLog.trim()}
            className="self-end bg-amber-600 hover:bg-amber-500 disabled:bg-stone-900 disabled:text-stone-700 text-[#050505] font-bold py-2 px-8 text-xs tracking-widest uppercase transition-colors"
          >
            PROCEED &rarr;
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3 animate-fade-in">
          {/* ... (Step 2 code remains identical) ... */}
          <div className="flex justify-between items-end">
            <label className="text-stone-300 font-bold text-sm uppercase tracking-wide">Chest Deposit Logs</label>
            <label className="cursor-pointer text-stone-500 hover:text-amber-500 text-xs transition-colors flex items-center gap-2">
              [ UPLOAD FILE ]
              <input type="file" accept=".txt,.csv" className="hidden" onChange={(e) => handleFileUpload(e, setChestLog)} />
            </label>
          </div>
          <textarea 
            className="w-full h-80 bg-[#0a0a0a] border border-stone-800 p-4 text-xs text-stone-400 focus:outline-none focus:border-amber-500/50 resize-none"
            placeholder='"Date" "Player" "Item" "Enchantment" "Quality" "Amount"...'
            value={chestLog}
            onChange={(e) => setChestLog(e.target.value)}
          />
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-stone-500 hover:text-stone-300 text-xs tracking-widest uppercase transition-colors">
              &larr; BACK
            </button>
            <button 
              onClick={handleCompare}
              disabled={!chestLog.trim()}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-stone-900 disabled:text-stone-700 text-stone-100 font-bold py-2 px-8 text-xs tracking-widest uppercase transition-colors"
            >
              RUN ANALYSIS
            </button>
          </div>
        </div>
      )}

      {step === 3 && results && (
        <div className="flex flex-col gap-4 animate-fade-in">
          
          {/* === NEW: EXPORT ACTION BAR === */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 bg-[#0a0a0a] p-3 border border-stone-800">
            <div className="text-xs text-stone-500">
              ANALYSIS COMPLETE — <strong className="text-stone-200">{filteredResults.length}</strong> / {results.length} ENTRIES.
            </div>
            
            <div className="flex items-center gap-4">
              <button onClick={exportToCSV} className="text-xs text-amber-500 hover:text-amber-400 transition-colors uppercase tracking-widest flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                EXPORT CSV
              </button>
              <button onClick={saveToGoogleDrive} className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-widest flex items-center gap-2 border-l border-stone-800 pl-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                SAVE TO DRIVE
              </button>
              <button onClick={reset} className="text-xs text-stone-500 hover:text-red-500 transition-colors uppercase tracking-widest border-l border-stone-800 pl-4">
                [ RESET ]
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border-y border-stone-800 py-3 mb-2">
            <input type="text" placeholder="PLAYER..." value={searchPlayer} onChange={(e) => setSearchPlayer(e.target.value)}
              className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none placeholder-stone-700 uppercase" />
            <input type="text" placeholder="GUILD..." value={searchGuild} onChange={(e) => setSearchGuild(e.target.value)}
              className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none placeholder-stone-700 uppercase" />
            <input type="text" placeholder="ITEM..." value={searchItem} onChange={(e) => setSearchItem(e.target.value)}
              className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none placeholder-stone-700 uppercase" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent px-3 text-xs text-stone-300 focus:outline-none uppercase appearance-none cursor-pointer">
              <option value="All">STATUS: ALL</option>
              <option value="Missing">STATUS: MISSING</option>
              <option value="Match">STATUS: MATCH</option>
              <option value="Extra">STATUS: EXTRA</option>
            </select>
          </div>

          <div className="overflow-x-auto border border-stone-800 max-h-[650px] overflow-y-auto bg-[#080808] custom-scrollbar">
            <table className="w-full text-left text-xs text-stone-400 relative">
              <thead className="bg-[#0f0f0f] text-stone-500 border-b border-stone-800 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3 font-normal">PLAYER</th>
                  <th scope="col" className="px-4 py-3 font-normal">GUILD</th>
                  <th scope="col" className="px-4 py-3 font-normal">ITEM</th>
                  <th scope="col" className="px-4 py-3 text-center font-normal">EXP.</th>
                  <th scope="col" className="px-4 py-3 text-center font-normal">DEP.</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {filteredResults.length === 0 ? (
                  <tr><td colSpan="6" className="px-4 py-12 text-center text-stone-600">NO RECORDS FOUND</td></tr>
                ) : (
                  filteredResults.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#111] transition-colors">
                      <td className="px-4 py-2 font-bold text-stone-300">{row.player}</td>
                      <td className="px-4 py-2 text-stone-600">{row.guild !== 'Unknown' ? `[${row.guild}]` : '-'}</td>
                      
                      <td className="px-4 py-2 flex items-center gap-3 min-w-[200px]">
                        {row.itemId ? (
                          <img src={`https://render.albiononline.com/v1/item/${row.itemId}.png?size=32`} alt="" className="w-8 h-8 object-contain" loading="lazy" />
                        ) : (
                          <div className="w-8 h-8 border border-stone-800 flex items-center justify-center text-stone-700 font-sans text-xs">?</div>
                        )}
                        <span className={row.itemId ? "text-stone-300" : "text-stone-600"}>{row.itemName}</span>
                      </td>

                      <td className="px-4 py-2 text-center">{row.expected}</td>
                      <td className={`px-4 py-2 text-center font-bold ${row.deposited < row.expected ? 'text-red-500' : 'text-stone-300'}`}>{row.deposited}</td>
                      
                      <td className="px-4 py-2 text-right">
                        {row.status === 'Match' && <span className="text-emerald-500 tracking-widest">OK</span>}
                        {row.status === 'Missing' && <span className="text-red-500 font-bold tracking-widest">MISSING</span>}
                        {row.status === 'Extra' && <span className="text-amber-500 tracking-widest">EXTRA</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}