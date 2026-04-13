import { useState, useMemo, useEffect } from 'react';

export default function Comparator() {
  const [step, setStep] = useState(1);
  const [statsLog, setStatsLog] = useState('');
  const [chestLog, setChestLog] = useState('');
  const [results, setResults] = useState(null);

  const [searchPlayer, setSearchPlayer] = useState('');
  const [searchGuild, setSearchGuild] = useState('');
  const [searchItem, setSearchItem] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const showModal = (title, message) => setModal({ isOpen: true, title, message });
  const closeModal = () => setModal({ isOpen: false, title: '', message: '' });

  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const GOOGLE_CLIENT_ID = "410004272443-94oaqnc262mpq850ofdciudl6c61rd6l.apps.googleusercontent.com"; 
  
  useEffect(() => {
    const storedToken = localStorage.getItem('ao_drive_token');
    const storedExpiry = localStorage.getItem('ao_drive_expiry');
    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry, 10)) {
      setIsDriveConnected(true);
    }
  }, []);

  const requestDriveToken = (callback) => {
    const storedToken = localStorage.getItem('ao_drive_token');
    const storedExpiry = localStorage.getItem('ao_drive_expiry');
    
    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry, 10)) {
      setIsDriveConnected(true);
      callback(storedToken);
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          localStorage.setItem('ao_drive_token', tokenResponse.access_token);
          localStorage.setItem('ao_drive_expiry', (Date.now() + 3300 * 1000).toString());
          setIsDriveConnected(true);
          callback(tokenResponse.access_token);
        }
      },
    });
    tokenClient.requestAccessToken();
  };

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

  useEffect(() => {
    localStorage.setItem('ao_statsLog', statsLog);
    localStorage.setItem('ao_chestLog', chestLog);
    localStorage.setItem('ao_step', step.toString());
    if (results) localStorage.setItem('ao_results', JSON.stringify(results));
    else localStorage.removeItem('ao_results');
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
    const playersMap = {}; 
    const globalDeposited = {};
    let minLootTime = Infinity;

    const statLines = statsLog.split('\n');
    statLines.forEach(line => {
      if (!line.trim() || line.includes('timestamp_utc')) return;
      const parts = line.split(';');
      if (parts.length >= 7) {
        const timeStr = parts[0].trim();
        const t = new Date(timeStr).getTime();
        if (!isNaN(t) && t < minLootTime) minLootTime = t;

        const guild = parts[2].trim();
        const player = parts[3].trim();
        const itemId = parts[4].trim();
        const itemName = parts[5].trim();
        const quantity = parseInt(parts[6].trim(), 10) || 0;
        
        if (player && itemName) {
          if (!playersMap[player]) playersMap[player] = { player, guild, items: [] };
          
          const existingItem = playersMap[player].items.find(i => i.itemName === itemName);
          if (existingItem) {
              existingItem.expected += quantity;
          } else {
              playersMap[player].items.push({ itemName, itemId, expected: quantity, deposited: 0 });
          }
        }
      }
    });

    const timeThreshold = minLootTime !== Infinity ? minLootTime - (60 * 60 * 1000) : 0;

    const chestLines = chestLog.split('\n');
    chestLines.forEach(line => {
      if (!line.trim() || line.includes('"Date" "Player"')) return;
      const parts = line.split('"').filter(p => p.trim() !== '');
      if (parts.length >= 6) {
        const dateStr = parts[0].trim();
        const t = new Date(dateStr).getTime();
        
        if (!isNaN(t) && t < timeThreshold) return; 

        const itemName = parts[2].trim();
        const amount = parseInt(parts[5].trim(), 10) || 0;
        
        if (itemName && amount > 0) {
            globalDeposited[itemName] = (globalDeposited[itemName] || 0) + amount;
        }
      }
    });

    const finalResults = Object.values(playersMap)
      .map(row => {
        let hasMissing = false;
        row.items.forEach(item => {
            if (globalDeposited[item.itemName] > 0) {
                const available = globalDeposited[item.itemName];
                const allocated = Math.min(item.expected, available);
                globalDeposited[item.itemName] -= allocated;
                item.deposited = allocated;
            } else {
                item.deposited = 0;
            }
            if (item.deposited < item.expected) hasMissing = true;
        });
        row.status = hasMissing ? 'Missing' : 'Match';
        return row;
      })
      .sort((a, b) => a.player.localeCompare(b.player));

    setResults(finalResults);
    setStep(3);
  };

  const reset = () => {
    setStatsLog('');
    setChestLog('');
    setResults(null);
    setSearchPlayer('');
    setSearchGuild('');
    setSearchItem('');
    setFilterStatus('All');
    setStep(1);
    
    localStorage.removeItem('ao_statsLog');
    localStorage.removeItem('ao_chestLog');
    localStorage.removeItem('ao_results');
    localStorage.removeItem('ao_step');
  };

  const exportToCSV = () => {
    if (!results) return;
    let csvContent = "Player,Guild,Item,Expected,Deposited,Status,ItemId\n";
    results.forEach(row => {
      row.items.forEach(item => {
          const status = item.deposited >= item.expected ? 'Match' : 'Missing';
          csvContent += `"${row.player}","${row.guild}","${item.itemName}",${item.expected},${item.deposited},"${status}","${item.itemId || ''}"\n`;
      });
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `AO_Loot_Comparison_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const saveToUsersDrive = () => {
    if (!results) return;
    requestDriveToken(async (token) => {
      await uploadCsvToDrive(token);
    });
  };

  const uploadCsvToDrive = async (accessToken) => {
    let csvContent = "Player,Guild,Item,Expected,Deposited,Status,ItemId\n";
    results.forEach(row => {
      row.items.forEach(item => {
          const status = item.deposited >= item.expected ? 'Match' : 'Missing';
          csvContent += `"${row.player}","${row.guild}","${item.itemName}",${item.expected},${item.deposited},"${status}","${item.itemId || ''}"\n`;
      });
    });

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    const fileName = `AO_Loot_Comparison_${new Date().toISOString().slice(0,10)}.csv`;

    const metadata = { name: fileName, mimeType: 'text/csv' };
    const multipartRequestBody =
      delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
      delimiter + 'Content-Type: text/csv\r\n\r\n' + csvContent + close_delim;

    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
      });
      
      if (response.status === 401) {
        localStorage.removeItem('ao_drive_token');
        localStorage.removeItem('ao_drive_expiry');
        setIsDriveConnected(false);
        showModal("Session Expired", "Your Google Drive session expired. Please connect again.");
      } else if (response.ok) {
        showModal("Upload Successful", `Saved to your Google Drive as: ${fileName}`);
      } else {
        showModal("Upload Failed", "Failed to upload file. Please check permissions or try again later.");
      }
    } catch (error) {
      showModal("Network Error", "A network error occurred while saving to Drive.");
    }
  };

  const uniqueGuilds = useMemo(() => {
    if (!results) return [];
    return Array.from(new Set(results.map(r => r.guild))).sort();
  }, [results]);

  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter((row) => {
      const matchesPlayer = row.player.toLowerCase().includes(searchPlayer.toLowerCase());
      const matchesGuild = searchGuild === '' || row.guild === searchGuild;
      const matchesItem = row.items.some(i => i.itemName.toLowerCase().includes(searchItem.toLowerCase()));
      const matchesStatus = filterStatus === 'All' || row.status === filterStatus;
      return matchesPlayer && matchesGuild && matchesItem && matchesStatus;
    });
  }, [results, searchPlayer, searchGuild, searchItem, filterStatus]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto font-mono relative">
      
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-stone-800 p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4 animate-fade-in">
            <h3 className="text-amber-500 font-bold uppercase tracking-widest text-lg">{modal.title}</h3>
            <p className="text-stone-300 text-sm leading-relaxed">{modal.message}</p>
            <button onClick={closeModal} className="mt-4 bg-stone-800 hover:bg-stone-700 text-stone-200 py-3 text-xs font-bold uppercase tracking-widest transition-colors w-full">
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 mb-2 text-xs uppercase tracking-widest">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-amber-500' : 'text-stone-700'}`}><span className="font-bold">[ 1 ] AOSTATS</span></div>
        <div className={`w-8 h-[1px] ${step >= 2 ? 'bg-amber-500/50' : 'bg-stone-800'}`}></div>
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-amber-500' : 'text-stone-700'}`}><span className="font-bold">[ 2 ] CHEST LOGS</span></div>
        <div className={`w-8 h-[1px] ${step >= 3 ? 'bg-amber-500/50' : 'bg-stone-800'}`}></div>
        <div className={`flex items-center gap-2 ${step >= 3 ? 'text-amber-500' : 'text-stone-700'}`}><span className="font-bold">[ 3 ] RESULTS</span></div>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3 animate-fade-in">
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
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 bg-[#0a0a0a] p-3 border border-stone-800">
            <div className="text-xs text-stone-500">
              ANALYSIS COMPLETE — <strong className="text-stone-200">{filteredResults.length}</strong> / {results.length} USERS.
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={exportToCSV} className="text-xs text-amber-500 hover:text-amber-400 transition-colors uppercase tracking-widest flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                EXPORT CSV
              </button>
              
              <button onClick={saveToUsersDrive} className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-widest flex items-center gap-2 border-l border-stone-800 pl-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                {isDriveConnected ? 'SAVE TO DRIVE' : 'CONNECT & SAVE'}
              </button>

              <button onClick={reset} className="text-xs text-stone-500 hover:text-red-500 transition-colors uppercase tracking-widest border-l border-stone-800 pl-4">
                [ RESET ]
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border-y border-stone-800 py-3 mb-2">
            <input type="text" placeholder="PLAYER..." value={searchPlayer} onChange={(e) => setSearchPlayer(e.target.value)} className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none placeholder-stone-700 uppercase" />
            
            <select value={searchGuild} onChange={(e) => setSearchGuild(e.target.value)} className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none uppercase appearance-none cursor-pointer">
              <option value="" className="bg-[#0a0a0a]">GUILD: ALL</option>
              {uniqueGuilds.map(g => (
                <option key={g} value={g} className="bg-[#0a0a0a]">{g === 'Unknown' ? 'GUILD: NONE' : `GUILD: [${g}]`}</option>
              ))}
            </select>

            <input type="text" placeholder="ITEM..." value={searchItem} onChange={(e) => setSearchItem(e.target.value)} className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none placeholder-stone-700 uppercase" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-transparent px-3 text-xs text-stone-300 focus:outline-none uppercase appearance-none cursor-pointer">
              <option value="All" className="bg-[#0a0a0a]">STATUS: ALL</option>
              <option value="Missing" className="bg-[#0a0a0a]">STATUS: MISSING</option>
              <option value="Match" className="bg-[#0a0a0a]">STATUS: CLEARED</option>
            </select>
          </div>

          <div className="overflow-x-auto border border-stone-800 max-h-[650px] overflow-y-auto bg-[#080808] custom-scrollbar">
            <table className="w-full text-left text-xs text-stone-400 relative">
              <thead className="bg-[#0f0f0f] text-stone-500 border-b border-stone-800 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3 font-normal w-[20%]">PLAYER</th>
                  <th scope="col" className="px-4 py-3 font-normal w-[20%]">GUILD</th>
                  <th scope="col" className="px-4 py-3 font-normal w-[60%]">LOOTED ITEMS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {filteredResults.length === 0 ? (
                  <tr><td colSpan="3" className="px-4 py-12 text-center text-stone-600">NO RECORDS FOUND</td></tr>
                ) : (
                  filteredResults.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#111] transition-colors">
                      <td className="px-4 py-4 font-bold text-stone-300 align-top">{row.player}</td>
                      <td className="px-4 py-4 text-stone-600 align-top">{row.guild !== 'Unknown' ? `[${row.guild}]` : '-'}</td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap gap-3">
                          {row.items.map((i, iIdx) => (
                            <div 
                              key={iIdx} 
                              className={`relative flex items-center justify-center border p-1.5 rounded-sm ${i.deposited >= i.expected ? 'border-stone-800 bg-[#0a0a0a]' : 'border-red-900/60 bg-red-950/30'}`}
                              title={`${i.itemName} (Deposited: ${i.deposited} / Expected: ${i.expected})`}
                            >
                              {i.itemId ? (
                                <img src={`https://render.albiononline.com/v1/item/${i.itemId}.png?size=32`} alt={i.itemName} className="w-8 h-8 object-contain" loading="lazy" />
                              ) : (
                                <div className="w-8 h-8 border border-stone-800 flex items-center justify-center text-stone-700 font-sans text-xs">?</div>
                              )}
                              
                              {(i.expected > 1 || i.deposited < i.expected) && (
                                <div className={`absolute -bottom-1.5 -right-1.5 px-1 py-0.5 text-[9px] font-mono leading-none rounded-sm border ${i.deposited >= i.expected ? 'bg-stone-800 border-stone-700 text-stone-300' : 'bg-red-950 border-red-900 text-red-400'}`}>
                                  {i.deposited < i.expected ? `${i.deposited}/${i.expected}` : `x${i.expected}`}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
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