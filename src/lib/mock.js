export const RIFAS = [
  { id:1, title:'Rifa Sábado',   price:1000, total:100, sold: [1,2,5,6,9,10,12,20,22,37,40,41,42] },
  { id:2, title:'Moto 125cc',    price:2500, total:200, sold: Array.from({length:150}, (_,i)=>i+1) },
  { id:3, title:'iPhone 14 Pro', price:3500, total:150, sold: [3,7,8,9,11,12,13,15,18,23,45,76] },
  { id:4, title:'Cenas para 2',  price:1200, total:80,  sold: [1,2,3,4,5,6,7,8,9,10] },
  { id:5, title:'Gift Card',     price:2000, total:100, sold: Array.from({length:99}, (_,i)=>i+1) },
  { id:6, title:'Smart TV 55"',  price:3000, total:300, sold: Array.from({length:260}, (_,i)=>i+1) },
];

export const findRifa = (id) => RIFAS.find(r => String(r.id) === String(id));
export const clp = (n) => n.toLocaleString('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 });
