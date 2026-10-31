const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.join(__dirname, 'public');
const file = path.join(__dirname, 'data', 'orders.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
let orders = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
function validate(body) {
  if (!body.customer?.trim() || !Array.isArray(body.items) || !body.items.length) throw Error('Informe o cliente e pelo menos um item.');
  const items = body.items.map(i => {
    if (!i.name?.trim() || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 999 || !Number.isFinite(i.price) || i.price < 0 || i.price > 99999) throw Error('Confira descrição, quantidade e preço dos itens.');
    return { name: i.name.trim().slice(0,200), qty:i.qty, price:Math.round(i.price*100)/100, notes:String(i.notes||'').trim().slice(0,500) };
  });
  const fee = Number(body.fee), discount = Number(body.discount);
  if (![fee,discount].every(n=>Number.isFinite(n)&&n>=0&&n<=99999)) throw Error('Taxa ou desconto inválido.');
  const subtotal = items.reduce((s,i)=>s+Math.round(i.price*100)*i.qty,0)/100;
  if(discount>subtotal+fee) throw Error('O desconto não pode exceder o valor do pedido.');
  const result={items,fee,discount,subtotal,total:Math.round((subtotal+fee-discount)*100)/100};
  for(const key of ['customer','phone','address','complement','reference','neighborhood','notes','payment','mode']) result[key]=String(body[key]||'').trim().slice(0,1000);
  return result;
}
const server = http.createServer(async (req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try {
    if(req.url==='/api/orders' && req.method==='GET') return json(200,orders);
    if(req.url==='/api/orders' && req.method==='POST') {
      let raw=''; for await(const chunk of req){raw+=chunk;if(raw.length>100000) return json(413,{error:'Pedido muito grande.'});}
      let body;try{body=validate(JSON.parse(raw));}catch(e){return json(400,{error:e.message});}
      const order={...body,id:randomUUID(),number:orders.reduce((n,o)=>Math.max(n,o.number),0)+1,createdAt:new Date().toISOString()};
      const next=[order,...orders];fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(file+'.tmp',file);orders=next;return json(201,order);
    }
    if(req.method!=='GET') return json(405,{error:'Método não permitido.'});
    const url = new URL(req.url,'http://localhost');
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!target.startsWith(root+path.sep)) return json(403,{error:'Acesso negado.'});
    if(!fs.existsSync(target)||!fs.statSync(target).isFile()) return json(404,{error:'Arquivo não encontrado.'});
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png'})[path.extname(target)]||'application/octet-stream'});fs.createReadStream(target).pipe(res);
  }catch(e){console.error(e);json(500,{error:'Não foi possível concluir. Tente novamente.'});}
});
if(require.main===module) server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Painel disponível em http://localhost:'+(process.env.PORT||3000)));
module.exports={server,validate};
