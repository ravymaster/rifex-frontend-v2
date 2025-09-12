import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { id } = req.query;

    // Leer desde la tabla "raffles" (nueva)
    const { data: row, error } = await supabase
      .from('raffles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) {
      return res.status(404).json({ message: 'Rifa no encontrada' });
    }

    // Adaptar al shape que tu frontend usa
    const rifa = {
      id: row.id,
      titulo: row.title,
      precio_clp: Math.round((row.price_cents || 0) / 100),
      cupos: row.total_numbers || 0,
      estado: 'activa',        // placeholder si no tienes columna
      inicio: null,            // placeholder
      termino: null,           // placeholder
      temas: [],               // placeholder
      tipo_premio: 'dinero',   // placeholder
      descripcion: row.description || ''
    };

    return res.status(200).json({ data: rifa });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Error cargando rifa' });
  }
}
