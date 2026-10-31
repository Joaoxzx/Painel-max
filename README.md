# Painel-max

Painel de pedidos da Lanchonete e Pizzaria Do Geovani.

- `backend/` — API em Node.js + Express (porta 3001)
- `frontend/` — painel em Next.js (porta 3000)

## Como rodar

- Windows: instale o Node.js LTS (22 ou mais novo) em https://nodejs.org e dê dois cliques em `INICIAR.bat`
- Desenvolvimento: `npm install` e depois `npm run dev`
- Testes: `npm test`

## Dados e backup

Tudo fica em `backend/data/` (fora do Git, porque tem dados de clientes):

- `painel.db` — banco SQLite com tudo: pedidos, cardápio e clientes
- `*.json.migrado` — os arquivos JSON antigos, já importados para o banco (podem ser apagados quando quiser)

Na primeira vez que o backend sobe sem banco, o cardápio padrão (`backend/src/menu.json`) é carregado.

Todo dia o backend faz um backup em `backend/data/backups/AAAA-MM-DD/` e guarda os últimos 30 dias.
Para mandar os backups para a nuvem, aponte a variável `BACKUP_DIR` para uma pasta do Google Drive ou OneDrive
(por exemplo, no `INICIAR.bat`: `set BACKUP_DIR=C:\Users\SEU_USUARIO\OneDrive\Backup Painel` antes do `npm start`).
