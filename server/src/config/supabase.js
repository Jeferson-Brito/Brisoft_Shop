// ==========================================================================
// BRISOFT SHOP - SUPABASE CLIENT CONFIGURATION
// ==========================================================================

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Polyfill para WebSocket exigido pelo Supabase Client no Node.js 20
if (!globalThis.WebSocket) {
  globalThis.WebSocket = require('ws');
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase = null;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('seu-projeto')) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase conectado com sucesso!');
} else {
  console.warn('⚠️ SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados. Operando em modo de memória/mock.');
}

module.exports = {
  supabase,
  isSupabaseConfigured: () => !!supabase
};
