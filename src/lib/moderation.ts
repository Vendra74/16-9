import { Alert } from 'react-native';

import { blockUser, report } from '@/lib/messages';
import { t } from '@/lib/i18n';

/** O motivo é gravado sempre em português, para a equipe ler; na tela aparece traduzido. */
const REASONS = [
  { value: 'Spam', label: t('Spam') },
  { value: 'Conteúdo impróprio', label: t('Conteúdo impróprio') },
  { value: 'Assédio ou ofensa', label: t('Assédio ou ofensa') },
  { value: 'Outro motivo', label: t('Outro motivo') },
];

/** Pergunta o motivo e registra a denúncia. */
export function askReport(target: { userId?: string; postId?: string; messageId?: string; commentId?: string }) {
  Alert.alert(t('Denunciar'), t('Qual o problema? A equipe do 16:9 vai analisar.'), [
    ...REASONS.map((reason) => ({
      text: reason.label,
      onPress: async () => {
        try {
          await report(target, reason.value);
          Alert.alert(t('Denúncia enviada'), t('Obrigado por avisar.'));
        } catch {
          Alert.alert(t('Não foi possível enviar'), t('Confira a internet e tente de novo.'));
        }
      },
    })),
    { text: t('Cancelar'), style: 'cancel' as const },
  ]);
}

/** Confirma e bloqueia a pessoa. `onDone` roda depois de bloquear. */
export function askBlock(userId: string, name: string, onDone?: () => void) {
  Alert.alert(
    t('Bloquear {name}?', { name }),
    t('Você deixa de ver os trabalhos dessa pessoa e nenhum dos dois consegue mandar mensagem ao outro.'),
    [
      { text: t('Cancelar'), style: 'cancel' },
      {
        text: t('Bloquear'),
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId);
            onDone?.();
          } catch {
            Alert.alert(t('Não foi possível bloquear'), t('Confira a internet e tente de novo.'));
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
    { text: t('Denunciar'), onPress: () => askReport({ userId: person.id, ...target }) },
    { text: t('Bloquear {name}', { name: person.name }), style: 'destructive', onPress: () => askBlock(person.id, person.name, onBlocked) },
    { text: t('Cancelar'), style: 'cancel' },
  ]);
}
