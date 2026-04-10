// src/components/RecordsViewer.jsx
import { useState, useMemo } from 'react';

export default function RecordsViewer() {
  const [driveFiles, setDriveFiles] = useState([]);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);
  const [results, setResults] = useState(null);
  const [activeFileName, setActiveFileName] = useState('');

  // Filtering state
  const [searchPlayer, setSearchPlayer] = useState('');
  const [searchGuild, setSearchGuild] = useState('');
  const [searchItem, setSearchItem] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  // REPLACE THIS WITH YOUR CLIENT ID
  const GOOGLE_CLIENT_ID = "410004272443-94oaqnc262mpq850ofdciudl6c61rd6l.apps.googleusercontent.com"; 

  const fetchFilesFromDrive = () => {
    setIsFetchingDrive(true);
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          try {
            const response = await fetch("https://www.googleapis.com/drive/v3/files?q=name contains 'AO_Loot_Comparison' and mimeType='text/csv'&orderBy=createdTime desc", {
              headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
            });
            const data = await response.json();
            
            if (data.files && data.files.length > 0) {
              setDriveFiles(data.files.map(f => ({ ...f, token: tokenResponse.access_token })));
            } else {
              alert("No previous comparisons found in your Drive.");
              setDriveFiles([]);
            }
          } catch (error) {
            alert("Error fetching files from Drive.");
          }
          setIsFetchingDrive(false);
        }
      },
    });
    tokenClient.requestAccessToken();
  };

  const loadFileFromDrive = async (fileId, token, fileName) => {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const csvText = await response.text();
      const lines = csvText.trim().split('\n');
      const loadedResults = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = [];
        let inQuotes = false;
        let currentPart = '';
        
        for (let char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                parts.push(currentPart);
                currentPart = '';
            } else currentPart += char;
        }
        parts.push(currentPart);

        if (parts.length >= 6) {
          loadedResults.push({
            player: parts[0],
            guild: parts[1],
            itemName: parts[2],
            expected: parseInt(parts[3], 10) || 0,
            deposited: parseInt(parts[4], 10) || 0,
            status: parts[5],
            itemId: parts[6] && parts[6] !== 'undefined' ? parts[6] : null
          });
        }
      }
      
      setResults(loadedResults);
      setActiveFileName(fileName);
      
      // Reset filters on new load
      setSearchPlayer('');
      setSearchGuild('');
      setSearchItem('');
      setFilterStatus('All');
    } catch (error) {
      alert("Error reading file from Drive.");
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
      
      {/* State 1: Pick a file */}
      {!results && (
        <div className="flex flex-col gap-6 animate-fade-in border border-stone-800 p-8 bg-[#080808]">
          <div className="text-center">
            <h2 className="text-xl font-bold text-stone-200 uppercase tracking-widest mb-2">Cloud Ledger</h2>
            <p className="text-xs text-stone-500 tracking-wide mb-6">Access previously saved loot comparisons directly from your Google Drive.</p>
            
            <button 
              onClick={fetchFilesFromDrive} 
              disabled={isFetchingDrive}
              className="mx-auto bg-amber-600 hover:bg-amber-500 disabled:bg-stone-900 disabled:text-stone-700 text-[#050505] font-bold py-3 px-8 text-xs tracking-widest uppercase transition-colors flex items-center justify-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              {isFetchingDrive ? 'CONNECTING...' : 'CONNECT MY DRIVE'}
            </button>
          </div>

          {driveFiles.length > 0 && (
            <div className="mt-8 border-t border-stone-800 pt-6">
              <span className="text-[10px] text-stone-500 uppercase tracking-widest mb-3 block">SELECT A RECORD:</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
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

      {/* State 2: View results */}
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
            <input type="text" placeholder="GUILD..." value={searchGuild} onChange={(e) => setSearchGuild(e.target.value)} className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none placeholder-stone-700 uppercase" />
            <input type="text" placeholder="ITEM..." value={searchItem} onChange={(e) => setSearchItem(e.target.value)} className="bg-transparent border-r border-stone-800 px-3 text-xs text-stone-300 focus:outline-none placeholder-stone-700 uppercase" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-transparent px-3 text-xs text-stone-300 focus:outline-none uppercase appearance-none cursor-pointer">
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