const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('./server');
const base={customer:'Lucas',items:[{name:'Pizza',qty:2,price:39.9}],fee:5,discount:3};
test('calcula total com entrega e desconto',()=>{assert.equal(validate(base).total,81.8)});
test('rejeita desconto maior que o pedido',()=>{assert.throws(()=>validate({...base,discount:100}))});
test('rejeita quantidade inválida',()=>{assert.throws(()=>validate({...base,items:[{name:'Pizza',qty:-1,price:10}]}))});
test('preserva observação por item sem alterar o total',()=>{const o=validate({...base,items:[{name:'X BACON',qty:1,price:23,notes:' Sem bacon '}]});assert.equal(o.items[0].notes,'Sem bacon');assert.equal(o.total,25)});
test('pedidos sem observação continuam válidos',()=>{assert.equal(validate(base).items[0].notes,'')});
