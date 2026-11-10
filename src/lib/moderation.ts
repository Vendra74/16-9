import { Alert } from 'react-native';

import { blockUser, report } from '@/lib/messages';

const REASONS = ['Spam', 'Conteúdo impróprio', 'Assédio ou ofensa', 'Outro motivo'];

/** Pergunta o motivo e registra a denúncia. */
export function askReport(target: { userId?: string; postId?: string; messageId?: string; commentId?: string }) {
  Alert.alert('Denunciar', 'Qual o problema? A equipe do 16:9 vai analisar.', [
    ...REASONS.map((reason) => ({
      text: reason,
      onPress: async () => {
        try {
          await report(target, reason);
          Alert.alert('Denúncia enviada', 'Obrigado por avisar.');
        } catch {
          Alert.alert('Não foi possível enviar', 'Confira a internet e tente de novo.');
        }
      },
    })),
    { text: 'Cancelar', style: 'cancel' as const },
  ]);
}

/** Confirma e bloqueia a pessoa. `onDone` roda depois de bloquear. */
export function askBlock(userId: string, name: string, onDone?: () => void) {
  Alert.alert(
    `Bloquear ${name}?`,
    'Você deixa de ver os trabalhos dessa pessoa e nenhum dos dois consegue mandar mensagem ao outro.',
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Bloquear',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId);
            onDone?.();
          } catch {
            Alert.alert('Não foi possível bloquear', 'Confira a internet e tente de novo.');
          }
        },
      },
    ],
  );
}

/** Menu "…" de uma pessoa (no post ou na conversa): denunciar ou bloquear. */
export function askModeration(
  person: { id: string; name: string },
  target: { postId?: string; messageId?: string; commentId?: string },
  onBlocked?: () => void,
) {
  Alert.alert(person.name, undefined, [
    { text: 'Denunciar', onPress: () => askReport({ userId: person.id, ...target }) },
    { text: `Bloquear ${person.name}`, style: 'destructive', onPress: () => askBlock(person.id, person.name, onBlocked) },
    { text: 'Cancelar', style: 'cancel' },
  ]);
}
