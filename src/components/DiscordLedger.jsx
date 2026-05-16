import { useState } from 'react';

export default function DiscordLedger() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [rawLogs, setRawLogs] = useState('');
  const [status, setStatus] = useState({ state: 'idle', message: '' }); // idle, loading, success, error

  const processAndSend = async () => {
    if (!webhookUrl.trim() || !rawLogs.trim()) {
      setStatus({ state: 'error', message: 'Please provide both a Webhook URL and Log Data.' });
      return;
    }

    setStatus({ state: 'loading', message: 'Processing math and sending to Discord...' });

    try {
      const lines = rawLogs.split('\n');
      const playerMap = {};

      // Parse Raw Logs
      lines.forEach(line => {
        if (!line.trim() || line.includes('"Date"	"Player"')) return;
        
        // Handle tab-separated values
        const parts = line.split('\t').map(p => p.replace(/^"|"$/g, '').trim());
        if (parts.length >= 4) {
          const player = parts[1];
          const amount = parseInt(parts[3], 10) || 0;

          if (!playerMap[player]) {
            playerMap[player] = { player, deposits: 0, withdrawals: 0, net: 0 };
          }

          if (amount > 0) {
            playerMap[player].deposits += amount;
          } else {
            playerMap[player].withdrawals += Math.abs(amount);
          }
          playerMap[player].net += amount;
        }
      });

      // Sort by Net Descending
      const summary = Object.values(playerMap).sort((a, b) => b.net - a.net);

      if (summary.length === 0) {
        setStatus({ state: 'error', message: 'No valid data found in logs.' });
        return;
      }

      // Generate Markdown Table
      let output = [];
      output.append = function(str) { this.push(str); };
      
      output.append("| Player         | Deposits | Withdrawals |    Net |");
      output.append("| :---           | :------: | :---------: | :----: |");

      summary.forEach(row => {
        const p = row.player.padEnd(14, ' ');
        const d = row.deposits.toString().padStart(8, ' ');
        const w = row.withdrawals.toString().padStart(11, ' ');
        const n = row.net.toString().padStart(6, ' ');
        output.append(`| ${p} | ${d} | ${w} | ${n} |`);
      });

      const fullTable = output.join('\n');
      
      // Discord Embeds have a 4096 character limit for descriptions.
      // If the table is huge, we split it into two embeds within the same webhook payload.
      const embeds = [];
      if (fullTable.length > 4000) {
        const half = Math.ceil(output.length / 2);
        const part1 = output.slice(0, half).join('\n');
        const part2 = [output[0], output[1], ...output.slice(half)].join('\n'); // Add headers to part 2

        embeds.push({
          title: "🛡️ Guild Financial Ledger (Part 1)",
          description: "```markdown\n" + part1 + "\n```",
          color: 16753920 // Amber-500
        });
        embeds.push({
          title: "🛡️ Guild Financial Ledger (Part 2)",
          description: "```markdown\n" + part2 + "\n```",
          color: 16753920,
          footer: { text: "Generated via AO Loot Logs Widget" }
        });
      } else {
        embeds.push({
          title: "🛡️ Guild Financial Ledger",
          description: "```markdown\n" + fullTable + "\n```",
          color: 16753920,
          footer: { text: "Generated via AO Loot Logs Widget" }
        });
      }

      const payload = {
        username: "AO Ledger Bot",
        embeds: embeds
      };

      // Push to Discord
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setStatus({ state: 'success', message: 'Successfully published ledger to Discord!' });
        setRawLogs(''); // Clear after success
      } else {
        setStatus({ state: 'error', message: `Discord API Error: ${response.statusText}` });
      }

    } catch (err) {
      console.error(err);
      setStatus({ state: 'error', message: 'Failed to parse logs or connect to Discord.' });
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full font-mono">
      <div className="bg-[#0a0a0a] border border-stone-800 p-6 flex flex-col gap-4">
        
        <div className="border-b border-stone-800 pb-4 mb-2">
          <label className="text-stone-300 font-bold text-sm uppercase tracking-wide block mb-2">Discord Webhook URL</label>
          <input 
            type="password" 
            placeholder="https://discord.com/api/webhooks/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full bg-[#050505] border border-stone-800 p-3 text-xs text-stone-300 focus:outline-none focus:border-[#5865f2]/80 transition-colors"
          />
          <p className="text-[10px] text-stone-600 mt-2 tracking-widest uppercase">
            Keep this private. Found in Server Settings &rarr; Integrations &rarr; Webhooks.
          </p>
        </div>

        <div>
          <label className="text-stone-300 font-bold text-sm uppercase tracking-wide block mb-2">Raw Tab-Separated Logs</label>
          <textarea 
            className="w-full h-80 bg-[#050505] border border-stone-800 p-4 text-xs text-stone-400 focus:outline-none focus:border-amber-500/50 resize-none whitespace-pre"
            placeholder='"Date"  "Player"  "Reason"  "Amount"&#10;"2026-05-16"  "HolyFluff"  "Deposit"  "312"'
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
          {status.state === 'loading' ? 'PROCESSING...' : 'PUSH LEDGER TO DISCORD'}
        </button>

      </div>
    </div>
  );
}