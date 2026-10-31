const path = require('node:path');
const express = require('express');
const { validate, createStore, ValidationError } = require('./orders');
const { summarize } = require('./reports');
const { createMenuStore, validateMenuItem } = require('./menu');
const { openDb } = require('./db');
const { createCustomerStore, validateCustomer, withOrderStats } = require('./customers');
const { scheduleBackups } = require('./backup');
const { importJson } = require('./import-json');

function createApp(store, menu, customers) {
  const app = express();

  // Cadastrar o cliente nunca impede o pedido de ser salvo.
  const linkCustomer = (order, body) => {
    try {
      return customers.saveFromOrder(order, body.customerId, typeof body.saveCustomer === 'boolean' ? body.saveCustomer : undefined);
    } catch (err) {
      if (!(err instanceof ValidationError)) console.error(err);
      return null;
    }
  };
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/menu', (req, res) => res.json(menu.list()));

  app.post('/api/menu', (req, res) => res.status(201).json(menu.add(validateMenuItem(req.body))));

  app.put('/api/menu/:id', (req, res) => {
    const item = menu.update(req.params.id, validateMenuItem(req.body));
    if (!item) return res.status(404).json({ error: 'Item do cardápio não encontrado.' });
    res.json(item);
  });

  app.delete('/api/menu/:id', (req, res) => {
    if (!menu.remove(req.params.id)) return res.status(404).json({ error: 'Item do cardápio não encontrado.' });
    res.status(204).end();
  });

  app.get('/api/orders', (req, res) => res.json(store.list()));

  app.post('/api/orders', (req, res) => {
    const data = validate(req.body);
    const order = store.add({ ...data, customerId: linkCustomer(data, req.body) });
    res.status(201).json(order);
  });

  app.put('/api/orders/:id', (req, res) => {
    if (!store.get(req.params.id)) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const data = validate(req.body);
    const order = store.update(req.params.id, { ...data, customerId: linkCustomer(data, req.body) });
    res.json(order);
  });

  app.delete('/api/orders/:id', (req, res) => {
    if (!store.remove(req.params.id)) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.status(204).end();
  });

  app.get('/api/customers', (req, res) => {
    if (req.query.q != null) return res.json(customers.search(String(req.query.q)));
    res.json(withOrderStats(customers.list(), store.list()));
  });

  app.post('/api/customers', (req, res) => res.status(201).json(customers.add(validateCustomer(req.body))));

  app.put('/api/customers/:id', (req, res) => {
    const customer = customers.update(req.params.id, validateCustomer(req.body));
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json(customer);
  });

  app.delete('/api/customers/:id', (req, res) => {
    if (!customers.remove(req.params.id)) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.status(204).end();
  });

  app.get('/api/reports', (req, res) => {
    try {
      res.json(summarize(store.list(), req.query.from, req.query.to));
    } catch (err) {
      if (err instanceof RangeError) return res.status(400).json({ error: err.message });
      throw err;
    }
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
  const dataDir = path.join(__dirname, '..', 'data');
  const db = openDb(process.env.DB_FILE || path.join(dataDir, 'painel.db'));
  const imported = importJson(db, { ordersFile: path.join(dataDir, 'orders.json'), menuFile: path.join(dataDir, 'menu.json') });
  if (imported) console.log(`Importados para o banco: ${imported.orders} pedidos e ${imported.menu} itens do cardápio.`);
  scheduleBackups(db, process.env.BACKUP_DIR || path.join(dataDir, 'backups'));
  createApp(createStore(db), createMenuStore(db), createCustomerStore(db)).listen(port, '127.0.0.1', () => console.log(`API disponível em http://localhost:${port}`));
}

module.exports = { createApp };
