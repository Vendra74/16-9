import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button, FormMessage } from '@/components/form';
import { SendIcon } from '@/components/rail-icons';
import { Colors, Spacing } from '@/constants/theme';
import { addComment, COMMENT_MAX, deleteComment, fetchComments, type Comment } from '@/lib/comments';
import { askBlock, askReport } from '@/lib/moderation';
import type { FeedPost } from '@/lib/posts';
import { useSession } from '@/lib/session';

const PANEL_WIDTH = 380;

function timeLabel(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))} d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

type Props = {
  /** O post aberto; `null` fecha o painel. */
  post: FeedPost | null;
  onClose: () => void;
  /** +1 a cada comentário novo, -1 a cada um apagado. */
  onCountChange: (delta: number) => void;
};

/**
 * Comentários de um post, num painel à direita.
 * A foto continua visível à esquerda; tocar nela fecha o painel.
 */
export function CommentsPanel({ post, onClose, onCountChange }: Props) {
  return (
    <Modal
      visible={post !== null}
      animationType="fade"
      transparent
      supportedOrientations={['landscape']}
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.outside} onPress={onClose} accessibilityLabel="Fechar comentários" />
        {post ? <Panel key={post.id} post={post} onClose={onClose} onCountChange={onCountChange} /> : null}
      </View>
    </Modal>
  );
}

function Panel({ post, onClose, onCountChange }: Props & { post: FeedPost }) {
  const { session } = useSession();
  const me = session?.user.id ?? '';
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Comment>>(null);

  useEffect(() => {
    let active = true;
    fetchComments(post.id)
      .then((rows) => {
        if (!active) return;
        setComments(rows);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [post.id, attempt]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await addComment(post.id, body);
      setComments((rows) => [...(rows ?? []), created]);
      setText('');
      onCountChange(1);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      setError('Não foi possível comentar. Confira a internet e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  async function remove(comment: Comment) {
    try {
      await deleteComment(comment.id);
      setComments((rows) => rows?.filter((c) => c.id !== comment.id) ?? null);
      onCountChange(-1);
    } catch {
      Alert.alert('Não foi possível apagar', 'Confira a internet e tente de novo.');
    }
  }

  /** Toque longo: apagar (seu comentário ou no seu post), denunciar ou bloquear. */
  function options(comment: Comment) {
    const name = comment.author?.display_name || comment.author?.username || 'esta pessoa';
    const mine = comment.user_id === me;
    const canDelete = mine || post.user_id === me;
    const hide = () => setComments((rows) => rows?.filter((c) => c.user_id !== comment.user_id) ?? null);
    Alert.alert(mine ? 'Seu comentário' : `Comentário de ${name}`, undefined, [
      ...(canDelete ? [{ text: 'Apagar', style: 'destructive' as const, onPress: () => remove(comment) }] : []),
      ...(mine
        ? []
        : [
            {
              text: 'Denunciar',
              onPress: () => askReport({ userId: comment.user_id, postId: post.id, commentId: comment.id }),
            },
            {
              text: `Bloquear ${name}`,
              style: 'destructive' as const,
              onPress: () => askBlock(comment.user_id, name, hide),
            },
          ]),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  const canSend = text.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.panel, { paddingRight: Math.max(insets.right, Spacing.md) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>Comentários</Text>
        <Button variant="ghost" title="Fechar" onPress={onClose} />
      </View>

      {comments === null ? (
        <View style={styles.center}>
          {failed ? (
            <>
              <Text style={styles.empty}>Não foi possível carregar os comentários.</Text>
              <Button variant="ghost" title="Tentar de novo" onPress={() => setAttempt((n) => n + 1)} />
            </>
          ) : (
            <ApertureLoader size={32} background={Colors.surface} />
          )}
        </View>
      ) : (
        <FlatList
          ref={list}
          style={styles.list}
          data={comments}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={comments.length === 0 ? styles.center : styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>Ninguém comentou ainda. Seja a primeira pessoa.</Text>}
          renderItem={({ item }) => {
            const name = item.author?.display_name || item.author?.username || 'Alguém';
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onLongPress={() => options(item)}
                accessibilityHint="Segure para ver as opções">
                <Avatar name={name} url={item.author?.avatar_url} size={30} />
                <View style={styles.flex}>
                  <Text style={styles.meta}>
                    <Text style={styles.name}>{name}</Text>
                    {'  '}
                    {timeLabel(item.created_at)}
                  </Text>
                  <Text style={styles.body}>{item.body}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <FormMessage text={error} />
      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
        <TextInput
          style={styles.input}
          placeholder="Escreva um comentário"
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={COMMENT_MAX}
          keyboardAppearance="dark"
          selectionColor={Colors.silver}
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityLabel="Publicar comentário"
          style={[styles.sendButton, !canSend && styles.dimmed]}>
          <SendIcon color={Colors.background} size={20} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  outside: {
    flex: 1,
  },
  panel: {
    width: PANEL_WIDTH,
    maxWidth: '60%',
    backgroundColor: Colors.surface,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
    paddingLeft: Spacing.md,
    paddingTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: Spacing.xs,
  },
  center: {
    flexGrow: 1,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  empty: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  pressed: {
    backgroundColor: Colors.surfaceRaised,
  },
  flex: {
    flex: 1,
  },
  meta: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  name: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 90,
    color: Colors.text,
    fontSize: 15,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.silver,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.4,
  },
});
