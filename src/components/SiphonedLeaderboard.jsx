import { useState } from 'react';

export default function SiphonedLeaderboard() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [messageId, setMessageId] = useState(''); // NEW: State for the Message ID
  const [rawLogs, setRawLogs] = useState('');
  const [timeframe, setTimeframe] = useState('24h');
  const [status, setStatus] = useState({ state: 'idle', message: '' }); 

  const timeframeLabels = {
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '4w': 'Last 4 Weeks'
  };

  const processAndSend = async () => {
    if (!webhookUrl.trim() || !rawLogs.trim()) {
      setStatus({ state: 'error', message: 'Please provide both a Webhook URL and Log Data.' });
      return;
    }

    setStatus({ state: 'loading', message: messageId.trim() ? 'Updating existing Discord message...' : 'Sending new message to Discord...' });

    try {
      const lines = rawLogs.split('\n');
      let summary = [];
      let isSummaryFormat = false;
      let latestDateStr = '';

      const headerPreview = lines.slice(0, 3).join(' ').toLowerCase();
      if (headerPreview.includes('deposits') || headerPreview.includes('withdrawals') || headerPreview.includes('net')) {
        isSummaryFormat = true;
      }

      if (isSummaryFormat) {
        lines.forEach(line => {
          if (!line.trim() || line.toLowerCase().includes('player') || line.toLowerCase().includes('deposits') || line.includes('---')) return;
          
          let parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
          if (parts.length < 3) {
            parts = line.split('\t').map(p => p.trim());
          }
          if (parts.length < 3 && line.includes('  ')) {
            parts = line.split(/\s{2,}/).map(p => p.trim());
          }
          
          if (parts.length >= 3) {
            const player = parts[0].replace(/\*\*/g, ''); 
            const deposits = parseInt(parts[1].replace(/,/g, ''), 10) || 0;
            const withdrawals = parseInt(parts[2].replace(/,/g, ''), 10) || 0;
            let net = parts.length >= 4 ? parseInt(parts[3].replace(/,/g, '').replace(/\+/g, ''), 10) : (deposits - withdrawals);

            if (player) {
              summary.push({ player, deposits, withdrawals, net });
            }
          }
        });

        if (summary.length === 0) {
          setStatus({ state: 'error', message: 'Could not parse the summary table format.' });
          return;
        }

        summary.sort((a, b) => b.net - a.net);

      } else {
        const parsedLogs = [];
        let maxTime = 0;

        lines.forEach(line => {
          if (!line.trim() || line.includes('"Date"')) return;
          
          let parts = line.split('\t').map(p => p.replace(/^"|"$/g, '').trim());
          if (parts.length >= 4) {
            const dateStr = parts[0];
            const player = parts[1];
            const amount = parseInt(parts[3].replace(/,/g, ''), 10) || 0;

            const time = new Date(dateStr.replace(/-/g, '/')).getTime(); 
            if (!isNaN(time)) {
              if (time > maxTime) {
                maxTime = time;
                latestDateStr = dateStr; 
              }
              parsedLogs.push({ time, player, amount });
            }
          }
        });

        if (parsedLogs.length === 0) {
          setStatus({ state: 'error', message: 'No valid raw data found.' });
          return;
        }

        let cutoff = 0;
        if (timeframe === '24h') cutoff = maxTime - (24 * 60 * 60 * 1000);
        else if (timeframe === '7d') cutoff = maxTime - (7 * 24 * 60 * 60 * 1000);
        else if (timeframe === '4w') cutoff = maxTime - (28 * 24 * 60 * 60 * 1000); 

        const filteredLogs = parsedLogs.filter(log => log.time >= cutoff);

        if (filteredLogs.length === 0) {
          setStatus({ state: 'error', message: 'No logs match the selected timeframe filter.' });
          return;
        }

        const playerMap = {};
        filteredLogs.forEach(log => {
          if (!playerMap[log.player]) {
            playerMap[log.player] = { player: log.player, deposits: 0, withdrawals: 0, net: 0 };
          }
          if (log.amount > 0) {
            playerMap[log.player].deposits += log.amount;
          } else {
            playerMap[log.player].withdrawals += Math.abs(log.amount);
          }
          playerMap[log.player].net += log.amount;
        });

        summary = Object.values(playerMap).sort((a, b) => b.net - a.net);
      }

      let output = [];
      
      const headerRow = `| ${"Player".padEnd(14)} | ${"Deposits".padStart(8)} | ${"Withdraw".padStart(8)} | ${"Net".padStart(6)} |`;
      const sepRow    = `| :---${"".padEnd(11, "-")} | :------: | :------: | :----: |`;
      
      output.push(headerRow);
      output.push(sepRow);

      summary.forEach(row => {
        const p = row.player.padEnd(14).substring(0, 14); 
        const d = row.deposits.toLocaleString('en-US').padStart(8); 
        const w = row.withdrawals.toLocaleString('en-US').padStart(8); 
        
        let netStr = row.net.toLocaleString('en-US');
        if (row.net > 0) netStr = `+${netStr}`; 
        const n = netStr.padStart(6);
        
        output.push(`| ${p} | ${d} | ${w} | ${n} |`);
      });

      const fullTable = output.join('\n');
      
      let embedTitle = "🏆 Siphoned Leaderboard";
      if (latestDateStr) {
        embedTitle = `🏆 Siphoned Leaderboard (As of ${latestDateStr} UTC)`;
      }

      const embeds = [];
      const filterText = !isSummaryFormat ? `**Filter:** ${timeframeLabels[timeframe]}\n\n` : '';

      if (fullTable.length > 3900) {
        const half = Math.ceil(output.length / 2);
        const part1 = output.slice(0, half).join('\n');
        const part2 = [output[0], output[1], ...output.slice(half)].join('\n'); 

        embeds.push({
          title: `${embedTitle} (Part 1)`,
          description: `${filterText}\`\`\`markdown\n${part1}\n\`\`\``,
          color: 16753920 
        });
        embeds.push({
          title: `${embedTitle} (Part 2)`,
          description: `\`\`\`markdown\n${part2}\n\`\`\``,
          color: 16753920,
          footer: { text: "Generated via AO Loot Logs Widget" }
        });
      } else {
        embeds.push({
          title: embedTitle,
          description: `${filterText}\`\`\`markdown\n${fullTable}\n\`\`\``,
          color: 16753920,
          footer: { text: "Generated via AO Loot Logs Widget" }
        });
      }

      const payload = {
        username: "Siphoned Leaderboard",
        embeds: embeds
      };

      // --- NEW LOGIC: POST (Create New) vs PATCH (Edit Existing) ---
      let targetUrl = webhookUrl.trim();
      let fetchMethod = "POST";

      if (messageId.trim()) {
        // Clean URL to ensure no trailing slash, then append the message ID
        targetUrl = `${targetUrl.replace(/\/$/, '')}/messages/${messageId.trim()}`;
        fetchMethod = "PATCH"; // Webhooks use PATCH to edit existing messages
      }

      const response = await fetch(targetUrl, {
        method: fetchMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setStatus({ state: 'success', message: messageId.trim() ? 'Successfully updated the existing Discord message!' : 'Successfully sent a new message to Discord!' });
        setRawLogs(''); 
      } else {
        // Handle specific error where they try to edit a message they didn't send
        if (response.status === 404 && fetchMethod === "PATCH") {
          setStatus({ state: 'error', message: 'Discord API Error: Message ID not found. Did this webhook create it?' });
        } else {
          setStatus({ state: 'error', message: `Discord API Error: ${response.status} ${response.statusText}` });
        }
      }

    } catch (err) {
      console.error(err);
      setStatus({ state: 'error', message: 'Failed to parse logs or connect to Discord.' });
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full font-mono">
      <div className="bg-[#0a0a0a] border border-stone-800 p-6 flex flex-col gap-4">
        
        <div className="border-b border-stone-800 pb-4 mb-2 flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex flex-col gap-4">
            <div>
              <label className="text-stone-300 font-bold text-sm uppercase tracking-wide block mb-2">Discord Webhook URL</label>
              <input 
                type="password" 
                placeholder="https://discord.com/api/webhooks/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full bg-[#050505] border border-stone-800 p-3 text-xs text-stone-300 focus:outline-none focus:border-[#5865f2]/80 transition-colors"
              />
            </div>
            
            {/* NEW: Message ID Input */}
            <div className="bg-[#111] p-3 border border-stone-800 rounded-sm">
              <label className="text-stone-300 font-bold text-xs uppercase tracking-wide block mb-1">Message ID to Edit (Optional)</label>
              <input 
                type="text" 
                placeholder="e.g. 1152039248234"
                value={messageId}
                onChange={(e) => setMessageId(e.target.value)}
                className="w-full bg-[#050505] border border-stone-700 p-2 text-xs text-stone-300 focus:outline-none focus:border-amber-500/80 transition-colors"
              />
              <p className="text-[10px] text-stone-500 mt-1 uppercase tracking-wider">
                Leave blank to send a new message. To edit, right-click a message sent by this webhook and "Copy Message ID".
              </p>
            </div>
          </div>

          <div className="w-full md:w-48">
            <label className="text-stone-300 font-bold text-sm uppercase tracking-wide block mb-2">Time Filter</label>
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-[#050505] border border-stone-800 p-3 text-xs text-stone-300 focus:outline-none focus:border-amber-500/50 appearance-none cursor-pointer uppercase tracking-widest"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="4w">Last 4 Weeks</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-stone-300 font-bold text-sm uppercase tracking-wide block mb-2">Paste Logs or Summary</label>
          <textarea 
            className="w-full h-80 bg-[#050505] border border-stone-800 p-4 text-xs text-stone-400 focus:outline-none focus:border-amber-500/50 resize-none whitespace-pre"
            placeholder="Paste raw logs OR a pre-calculated spreadsheet summary here..."
            value={rawLogs}
            onChange={(e) => setRawLogs(e.target.value)}
          />
        </div>

        {status.message && (
          <div className={`p-3 border text-xs tracking-widest uppercase font-bold text-center ${
            status.state === 'success' ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-500' :
            status.state === 'error' ? 'bg-red-950/30 border-red-900/50 text-red-500' :
            'bg-amber-950/30 border-amber-900/50 text-amber-500'
          }`}>
            {status.message}
          </div>
        )}

        <button 
          onClick={processAndSend}
          disabled={status.state === 'loading'}
          className="mt-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:bg-stone-900 disabled:text-stone-700 text-white font-bold py-3 px-8 text-xs tracking-widest uppercase transition-colors w-full"
        >
          {status.state === 'loading' ? 'PROCESSING...' : messageId.trim() ? 'UPDATE DISCORD MESSAGE' : 'PUSH LEADERBOARD TO DISCORD'}
        </button>

      </div>
    </div>
  );
}