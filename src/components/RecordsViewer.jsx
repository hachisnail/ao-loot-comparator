import { useState, useMemo, useEffect } from 'react';

export default function RecordsViewer() {
  const [driveFiles, setDriveFiles] = useState([]);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);
  const [results, setResults] = useState(null);
  const [activeFileName, setActiveFileName] = useState('');

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
      fetchFilesFromDrive(); 
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

  const fetchFilesFromDrive = () => {
    setIsFetchingDrive(true);
    requestDriveToken(async (token) => {
      try {
        const response = await fetch("https://www.googleapis.com/drive/v3/files?q=name contains 'AO_Loot_Comparison' and mimeType='text/csv'&orderBy=createdTime desc", {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
          localStorage.removeItem('ao_drive_token');
          localStorage.removeItem('ao_drive_expiry');
          setIsDriveConnected(false);
          showModal("Session Expired", "Your Google Drive session expired. Please connect again.");
          setIsFetchingDrive(false);
          return;
        }

        const data = await response.json();
        
        if (data.files && data.files.length > 0) {
          setDriveFiles(data.files.map(f => ({ ...f, token })));
        } else {
          setDriveFiles([]);
        }
      } catch (error) {
        showModal("Connection Error", "There was an error fetching files from your Drive.");
      }
      setIsFetchingDrive(false);
    });
  };

  const loadFileFromDrive = async (fileId, token, fileName) => {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const csvText = await response.text();
      const lines = csvText.trim().split('\n');
      
      const loadedPlayers = {};
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = [];
        let inQuotes = false;
        let currentPart = '';
        
        for (let char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                parts.push(currentPart.replace(/^"|"$/g, '')); 
                currentPart = '';
            } else currentPart += char;
        }
        parts.push(currentPart.replace(/^"|"$/g, ''));

        if (parts.length >= 6) {
          const player = parts[0];
          const guild = parts[1];
          const itemName = parts[2];
          const expected = parseInt(parts[3], 10) || 0;
          const deposited = parseInt(parts[4], 10) || 0;
          const itemId = parts[6] && parts[6] !== 'undefined' && parts[6] !== '' ? parts[6] : null;

          if (!loadedPlayers[player]) {
            loadedPlayers[player] = { player, guild, items: [], status: 'Match' };
          }
          
          loadedPlayers[player].items.push({ itemName, expected, deposited, itemId });
          if (deposited < expected) {
              loadedPlayers[player].status = 'Missing';
          }
        }
      }
      
      setResults(Object.values(loadedPlayers).sort((a, b) => a.player.localeCompare(b.player)));
      setActiveFileName(fileName);
      
      setSearchPlayer('');
      setSearchGuild('');
      setSearchItem('');
      setFilterStatus('All');
    } catch (error) {
      showModal("Parse Error", "There was an error reading the file data.");
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

      {!results && (
        <div className="flex flex-col gap-6 animate-fade-in border border-stone-800 p-8 bg-[#080808]">
          <div className="text-center">
            <h2 className="text-xl font-bold text-stone-200 uppercase tracking-widest mb-2">Cloud Ledger</h2>
            <p className="text-xs text-stone-500 tracking-wide mb-6">Access previously saved loot comparisons directly from your Google Drive.</p>
            
            {driveFiles.length === 0 && (
              <button 
                onClick={fetchFilesFromDrive} 
                disabled={isFetchingDrive}
                className="mx-auto bg-amber-600 hover:bg-amber-500 disabled:bg-stone-900 disabled:text-stone-700 text-[#050505] font-bold py-3 px-8 text-xs tracking-widest uppercase transition-colors flex items-center justify-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                {isFetchingDrive ? 'CONNECTING...' : isDriveConnected ? 'REFRESH RECORDS' : 'CONNECT MY DRIVE'}
              </button>
            )}
          </div>

          {driveFiles.length > 0 && (
            <div className="mt-4 border-t border-stone-800 pt-6 relative">
               <button onClick={fetchFilesFromDrive} className="absolute top-6 right-2 text-[10px] text-stone-500 hover:text-amber-500 transition-colors uppercase tracking-widest">
                [ REFRESH ]
              </button>
              <span className="text-[10px] text-stone-500 uppercase tracking-widest mb-3 block">SELECT A RECORD:</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto custom-scrollbar pr-2 mt-2">
                {driveFiles.map(file => (
                  <div 
                    key={file.id} 
                    onClick={() => loadFileFromDrive(file.id, file.token, file.name)}
                    className="flex justify-between items-center bg-[#111] p-4 border border-stone-800 hover:border-amber-500/50 cursor-pointer transition-colors group" 
                  >
                    <span className="text-xs text-stone-300 font-bold break-all group-hover:text-amber-500 transition-colors">{file.name}</span>
                    <span className="text-[10px] text-stone-600 uppercase tracking-widest whitespace-nowrap ml-4">LOAD &rarr;</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-4 animate-fade-in">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 bg-[#0a0a0a] p-3 border border-stone-800">
            <div className="text-xs text-stone-500">
              VIEWING FILE: <strong className="text-amber-500">{activeFileName}</strong>
            </div>
            <button 
              onClick={() => setResults(null)} 
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors uppercase tracking-widest flex items-center gap-2"
            >
              &larr; BACK TO FILES
            </button>
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