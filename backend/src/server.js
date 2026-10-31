const path = require('node:path');
const express = require('express');
const { validate, createStore, ValidationError } = require('./orders');

function createApp(store) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/orders', (req, res) => res.json(store.list()));

  app.post('/api/orders', (req, res) => {
    const order = store.add(validate(req.body));
    res.status(201).json(order);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Pedido muito grande.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dados do pedido inválidos.' });
    console.error(err);
    res.status(500).json({ error: 'Não foi possível concluir. Tente novamente.' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  const store = createStore(process.env.ORDERS_FILE || path.join(__dirname, '..', 'data', 'orders.json'));
  createApp(store).listen(port, '127.0.0.1', () => console.log(`API disponível em http://localhost:${port}`));
}

module.exports = { createApp };
