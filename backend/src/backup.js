const fs = require('node:fs');
const path = require('node:path');

const KEEP = 30;
const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local

// Uma pasta por dia com o banco (e arquivos extras, se houver); mantém só os últimos 30 dias.
function backupNow(db, dir, files = []) {
  const target = path.join(dir, today());
  if (fs.existsSync(path.join(target, 'painel.db'))) return null;
  fs.mkdirSync(target, { recursive: true });
  db.exec(`VACUUM INTO '${path.join(target, 'painel.db').replace(/'/g, "''")}'`);
  for (const file of files) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(target, path.basename(file)));

  const days = fs.readdirSync(dir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const old of days.slice(0, -KEEP)) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
  return target;
}

function scheduleBackups(db, dir, files = []) {
  const run = () => {
    try {
      const target = backupNow(db, dir, files);
      if (target) console.log('Backup salvo em ' + target);
    } catch (err) {
      console.error('Não foi possível fazer o backup:', err.message);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref(); // confere a cada hora; só copia uma vez por dia
}

module.exports = { backupNow, scheduleBackups };
