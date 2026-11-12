import { unregisterFromPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

/**
 * Apaga a conta de vez: vídeos, imagens, mensagens, posts e o login.
 * Quem faz o trabalho é a função "safety" do servidor; aqui só pedimos e saímos.
 */
export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('safety', { body: { action: 'delete_account' } });
  if (error) throw error;
  await unregisterFromPush();
  // O login já não existe no servidor; limpa a sessão guardada no aparelho.
  await supabase.auth.signOut({ scope: 'local' });
}
