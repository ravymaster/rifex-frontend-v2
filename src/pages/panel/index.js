// src/pages/panel/index.jsx
import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

function PesoCLP({ cents }){
  const v = Math.round(Number(cents||0))/100;
  return <>{v.toLocaleString('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 })}</>;
}

function Badge({ children, tone='gray' }){
  const bg = { gray:'#E5E7EB', green:'#DCFCE7', red:'#FEE2E2', blue:'#DBEAFE', yellow:'#FEF9C3' }[tone];
  const fg = { gray:'#111827', green:'#166534', red:'#991B1B', blue:'#1E3A8A', yellow:'#92400E' }[tone];
  return <span style={{background:bg,color:fg,padding:'3px 8px',borderRadius:999,fontSize:12,fontWeight:600}}>{children}</span>;
}

function Kpi({ label, children }){
  return (
    <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:16,padding:16,boxShadow:'0 1px 2px rgba(0,0,0,.04)'}}>
      <div style={{fontSize:12,color:'#6B7280',marginBottom:6}}>{label}</div>
      <div style={{fontSize:20,fontWeight:700}}>{children}</div>
    </div>
  )
}

function ActionButton({ children, onClick, tone='default', type='button' }){
  const styles = {
    default:{ background:'#111827', color:'#fff' },
    ghost:{ background:'#fff', color:'#111827', border:'1px solid #E5E7EB' },
    danger:{ background:'#B91C1C', color:'#fff' },
  }[tone];
  return (
    <button type={type} onClick={onClick} style={{...styles, padding:'8px 12px', borderRadius:8, cursor:'pointer', fontWeight:600 }}>
      {children}
    </button>
  )
}

function Progress({ value, max=100 }){
  const pct = Math.max(0, Math.min(100, (Number(value)/Number(max))*100 || 0));
  return (
    <div style={{height:8, background:'#E5E7EB', borderRadius:999, overflow:'hidden'}}>
      <div style={{width:`${pct}%`, height:'100%', background:'linear-gradient(90deg,#2563EB,#16A34A)'}} />
    </div>
  );
}

function EditModal({ open, onClose, raffle, onSaved }){
  const [prizeType, setPrizeType] = useState(raffle?.prize_type || 'money');
  const [prizeAmount, setPrizeAmount] = useState(() => raffle?.prize_amount_cents ? Math.round(raffle.prize_amount_cents/100) : 0);
  const [endDate, setEndDate] = useState(() => raffle?.end_date || '');
  const [busy, setBusy] = useState(false);

  useEffect(()=>{
    if(open){
      setPrizeType(raffle?.prize_type || 'money');
      setPrizeAmount(raffle?.prize_amount_cents ? Math.round(raffle.prize_amount_cents/100) : 0);
      setEndDate(raffle?.end_date || '');
    }
  }, [open, raffle]);

  async function onSubmit(e){
    e.preventDefault();
    setBusy(true);
    try{
      const r = await fetch(`/api/rifas/${raffle.id}`,{
        method:'PATCH', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          prize_type: prizeType,
          prize_amount_cents: prizeType==='money' ? Math.round(Number(prizeAmount||0)*100) : null,
          end_date: endDate || null,
        })
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j?.error||'update_failed');
      onSaved?.(j.data);
      onClose();
    }catch(err){ alert(err.message); }
    finally{ setBusy(false); }
  }

  if(!open) return null;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'grid',placeItems:'center',zIndex:50}}>
      <form onSubmit={onSubmit} style={{background:'#fff',borderRadius:16,padding:20,width:'min(560px, 92vw)',border:'1px solid #E5E7EB'}}>
        <h3 style={{margin:'0 0 8px',fontSize:18}}>Editar rifa</h3>
        <p style={{margin:'0 0 12px',color:'#6B7280'}}>Solo campos seguros (premio y término).</p>
        <div style={{display:'grid',gap:12}}>
          <label style={{display:'grid',gap:6}}>
            <span style={{fontSize:12,color:'#6B7280',fontWeight:600}}>Tipo de premio</span>
            <select value={prizeType} onChange={e=>setPrizeType(e.target.value)} style={{padding:'10px 12px',border:'1px solid #E5E7EB',borderRadius:10}}>
              <option value="money">Dinero</option>
              <option value="physical">Producto/Envío</option>
            </select>
          </label>
          {prizeType==='money' && (
            <label style={{display:'grid',gap:6}}>
              <span style={{fontSize:12,color:'#6B7280',fontWeight:600}}>Monto del premio (CLP)</span>
              <input type="number" min="0" value={prizeAmount} onChange={e=>setPrizeAmount(e.target.value)} style={{padding:'10px 12px',border:'1px solid #E5E7EB',borderRadius:10}} />
            </label>
          )}
          <label style={{display:'grid',gap:6}}>
            <span style={{fontSize:12,color:'#6B7280',fontWeight:600}}>Fecha de término</span>
            <input type="date" value={endDate||''} onChange={e=>setEndDate(e.target.value)} style={{padding:'10px 12px',border:'1px solid #E5E7EB',borderRadius:10}} />
          </label>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
          <ActionButton tone='ghost' onClick={onClose}>Cancelar</ActionButton>
          <ActionButton tone='default' type='submit'>Guardar cambios</ActionButton>
        </div>
      </form>
    </div>
  );
}

function CloseDialog({ open, onClose, raffle, onClosed }){
  const [busy, setBusy] = useState(false);
  if(!open) return null;
  async function doClose(){
    setBusy(true);
    try{
      const r = await fetch(`/api/rifas/${raffle.id}`,{
        method:'PATCH',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ status:'closed', end_date: raffle.end_date || new Date().toISOString().slice(0,10) })
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j?.error||'close_failed');
      onClosed?.(j.data);
      onClose();
    }catch(err){ alert(err.message); }
    finally{ setBusy(false); }
  }
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'grid',placeItems:'center',zIndex:50}}>
      <div style={{background:'#fff',borderRadius:16,padding:20,width:'min(520px, 92vw)',border:'1px solid #E5E7EB'}}>
        <h3 style={{margin:'0 0 8px',fontSize:18}}>Terminar rifa</h3>
        <p style={{margin:'0 0 12px',color:'#6B7280'}}>Al cerrar la rifa, no se podrán comprar más números.</p>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <ActionButton tone='ghost' onClick={onClose}>Cancelar</ActionButton>
          <ActionButton tone='danger' onClick={doClose}>{busy? 'Cerrando…':'Terminar ahora'}</ActionButton>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ open, onClose, raffle, onDeleted }){
  const [busy, setBusy] = useState(false);
  const [hard, setHard] = useState(false);
  if(!open) return null;

  const mustArchive = raffle?.status === 'closed' || (raffle?.sold ?? 0) > 0;

  async function doDelete(){
    setBusy(true);
    try{
      const r = await fetch('/api/rifas/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: raffle.id,
          force: !mustArchive && !!hard
        })
      });
      const j = await r.json().catch(()=> ({}));
      if(!r.ok) throw new Error(j?.error || 'delete_failed');

      onDeleted?.(raffle.id, j?.mode || (mustArchive ? 'soft' : (hard ? 'hard' : 'soft')));
      onClose();
    }catch(err){
      alert(err.message || 'delete_failed');
    }finally{
      setBusy(false);
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'grid',placeItems:'center',zIndex:60}}>
      <div style={{background:'#fff',borderRadius:16,padding:20,width:'min(520px, 92vw)',border:'1px solid #E5E7EB'}}>
        <h3 style={{margin:'0 0 8px',fontSize:18}}>Eliminar rifa</h3>

        {mustArchive ? (
          <p style={{margin:'0 0 12px',color:'#6B7280'}}>
            Esta rifa está <b>terminada o con ventas</b>. Se <b>archivará</b> (no se muestra en el panel).
          </p>
        ) : (
          <>
            <p style={{margin:'0 0 12px',color:'#6B7280'}}>
              Rifa sin actividad: puedes <b>eliminar definitivamente</b> (ideal para errores de redacción o pruebas).
            </p>
            <label style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
              <input type='checkbox' checked={hard} onChange={e=>setHard(e.target.checked)} />
              <span>Eliminar definitivamente (no se puede deshacer)</span>
            </label>
          </>
        )}

        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <ActionButton tone='ghost' onClick={onClose}>Cancelar</ActionButton>
          <ActionButton tone='danger' onClick={doDelete}>{busy? 'Eliminando…':'Eliminar'}</ActionButton>
        </div>
      </div>
    </div>
  );
}

export default function Panel(){
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editRaffle, setEditRaffle] = useState(null);
  const [closeRaffle, setCloseRaffle] = useState(null);
  const [deleteRaffle, setDeleteRaffle] = useState(null);

  const [status, setStatus] = useState('all'); // all|active|draft|closed|deleted
  const [q, setQ] = useState('');

  async function load(){
    setLoading(true); setErr('');
    try{
      // 1) Traemos todo como antes (usa tu API existente)
      const params = new URLSearchParams();
      if(status!=='all') params.set('status', status);
      if(q.trim()) params.set('q', q.trim());
      const r = await fetch(`/api/panel/raffles?${params.toString()}`);
      const text = await r.text();
      let j; try { j = JSON.parse(text); } catch { throw new Error(`HTTP ${r.status} ${r.statusText}`); }
      if(!r.ok) throw new Error(j?.error||'fetch_failed');

      // 2) Filtramos por el usuario logueado (id o email)
      const { data: { user } } = await supabase.auth.getUser();
      let items = Array.isArray(j?.items) ? j.items : [];
      if (user) {
        const email = (user.email || '').toLowerCase();
        items = items.filter(row =>
          (row.creator_id && row.creator_id === user.id) ||
          (row.creator_email && String(row.creator_email).toLowerCase() === email)
        );
      } else {
        items = []; // si no está logueado, no mostramos nada
      }

      setData({ ...j, items });
    }catch(e){ setErr(e.message); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);

  const totals = useMemo(()=>{
    if(!data) return { revenueCents:0, active:0, participants:0 };
    const filtered = data.items || [];
    const active = filtered.filter(x=>x.status==='active').length;
    const revenueCents = filtered.reduce((acc,x)=> acc + (x.sold * (x.price_cents||0)), 0);
    const participants = filtered.reduce((acc,x)=> acc + x.sold, 0);
    return { revenueCents, active, participants };
  }, [data]);

  function onRaffleSaved(updated){
    setData(d=> ({ ...d, items: d.items.map(x=> x.id===updated.id ? { ...x, ...updated } : x ) }));
  }
  function onRaffleClosed(updated){
    setData(d=> ({ ...d, items: d.items.map(x=> x.id===updated.id ? { ...x, ...updated } : x ) }));
  }
  function onRaffleDeleted(id){
    setData(d=> ({ ...d, items: d.items.filter(x=> x.id!==id) }));
  }

  return (
    <Layout>
      <main className="container" style={{padding:'24px'}}>
        <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <h1 style={{margin:0}}>Mis rifas</h1>
          <div style={{display:'flex',gap:8}}>
            <ActionButton tone='ghost' onClick={load}>Refrescar</ActionButton>
            <a href="/crear-rifa"><ActionButton>Crear rifa</ActionButton></a>
          </div>
        </header>

        {/* Filtros */}
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          {['all','active','draft','closed','deleted'].map(s=> (
            <button key={s} onClick={()=>{ setStatus(s); setTimeout(load,0); }}
              style={{padding:'6px 10px',border:'1px solid #E5E7EB',borderRadius:999,background: status===s?'#111827':'#fff',color: status===s?'#fff':'#111827',fontWeight:600}}>
              {s}
            </button>
          ))}
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=> e.key==='Enter' && load()}
              placeholder="Buscar por título o ID" style={{padding:'8px 12px',border:'1px solid #E5E7EB',borderRadius:10,minWidth:260}} />
            <ActionButton tone='ghost' onClick={load}>Buscar</ActionButton>
          </div>
        </div>

        {/* KPIs */}
        <section style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0,1fr))',gap:12,marginBottom:16}}>
          <Kpi label="Recaudado (CLP)"><PesoCLP cents={totals.revenueCents} /></Kpi>
          <Kpi label="Rifas activas">{totals.active}</Kpi>
          <Kpi label="Participantes (aprox.)">{totals.participants.toLocaleString('es-CL')}</Kpi>
        </section>

        {/* Tabla */}
        <section style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:16,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1.4fr 110px 160px 120px 140px 1fr',gap:0,padding:'12px 16px',fontSize:12,color:'#6B7280',borderBottom:'1px solid #E5E7EB'}}>
            <div>Título / ID</div>
            <div>Estado</div>
            <div>Vendidos</div>
            <div>Precio</div>
            <div>Termina</div>
            <div style={{textAlign:'right'}}>Acciones</div>
          </div>

          {loading && <div style={{padding:16}}>Cargando…</div>}
          {err && <div style={{padding:16,color:'#B91C1C'}}>Error: {err}</div>}

          {(data?.items||[]).map(row => (
            <div key={row.id} style={{display:'grid',gridTemplateColumns:'1.4fr 110px 160px 120px 140px 1fr',gap:0,padding:'14px 16px',borderBottom:'1px solid #F1F5F9',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:600}}>{row.title||'(sin título)'}</div>
                <div style={{fontSize:12,color:'#6B7280'}}>ID: {row.id}</div>
                <div style={{marginTop:8}}><Progress value={row.sold} max={row.total_numbers||1} /></div>
              </div>
              <div>
                <Badge tone={row.status==='active'?'green': row.status==='closed'?'red':'gray'}>
                  {row.status}
                </Badge>
              </div>
              <div>{row.sold}/{row.total_numbers}</div>
              <div><PesoCLP cents={row.price_cents} /></div>
              <div>{row.end_date || '—'}</div>
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <a href={`/rifas/${row.id}`}><ActionButton tone='ghost'>Ver</ActionButton></a>
                <ActionButton tone='ghost' onClick={()=>setEditRaffle(row)}>Editar</ActionButton>
                {row.status!=='closed' && (
                  <ActionButton tone='danger' onClick={()=>setCloseRaffle(row)}>Terminar</ActionButton>
                )}
                <ActionButton tone='danger' onClick={()=>setDeleteRaffle(row)}>Eliminar</ActionButton>
              </div>
            </div>
          ))}
        </section>
      </main>

      <EditModal   open={!!editRaffle}   onClose={()=>setEditRaffle(null)}   raffle={editRaffle}   onSaved={onRaffleSaved} />
      <CloseDialog open={!!closeRaffle}  onClose={()=>setCloseRaffle(null)}  raffle={closeRaffle}  onClosed={onRaffleClosed} />
      <DeleteDialog open={!!deleteRaffle} onClose={()=>setDeleteRaffle(null)} raffle={deleteRaffle} onDeleted={(id)=>onRaffleDeleted(id)} />
    </Layout>
  );
}

