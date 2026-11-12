import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { ClapperButton } from '@/components/clapper-button';
import { Button, FormMessage } from '@/components/form';
import { SendIcon } from '@/components/rail-icons';
import { Colors, Spacing } from '@/constants/theme';
import {
  addComment,
  COMMENT_MAX,
  deleteComment,
  fetchComments,
  likeComment,
  threaded,
  unlikeComment,
  type Comment,
} from '@/lib/comments';
import { askBlock, askReport } from '@/lib/moderation';
import type { FeedPost } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { dateLocale, t } from '@/lib/i18n';

const PANEL_WIDTH = 380;

function timeLabel(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return t('agora');
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))} d`;
  return new Date(iso).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' });
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
        <Pressable style={styles.outside} onPress={onClose} accessibilityLabel={t('Fechar comentários')} />
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
  /** O comentário que a pessoa está respondendo. */
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
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
      const created = await addComment(post.id, body, replyingTo?.id);
      setComments((rows) => [...(rows ?? []), created]);
      setText('');
      onCountChange(1);
      // Comentário novo vai para o fim; resposta fica junto do comentário, que já está na tela.
      if (!replyingTo) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
      setReplyingTo(null);
    } catch {
      setError(t('Não foi possível comentar. Confira a internet e tente de novo.'));
    } finally {
      setSending(false);
    }
  }

  async function remove(comment: Comment) {
    try {
      await deleteComment(comment.id);
      // As respostas de um comentário apagado saem junto com ele.
      const gone = (comments ?? []).filter((c) => c.id === comment.id || c.parent_id === comment.id).length;
      setComments((rows) => rows?.filter((c) => c.id !== comment.id && c.parent_id !== comment.id) ?? null);
      if (replyingTo?.id === comment.id) setReplyingTo(null);
      onCountChange(-Math.max(1, gone));
    } catch {
      Alert.alert(t('Não foi possível apagar'), t('Confira a internet e tente de novo.'));
    }
  }

  function reply(comment: Comment) {
    setReplyingTo(comment);
    input.current?.focus();
  }

  /** Curtida otimista: a claquete bate na hora e volta se o servidor recusar. */
  function setLiked(id: string, liked: boolean) {
    setComments(
      (rows) =>
        rows?.map((c) =>
          c.id === id
            ? { ...c, my_like: liked ? [{ user_id: me }] : [], like_count: Math.max(0, c.like_count + (liked ? 1 : -1)) }
            : c,
        ) ?? null,
    );
  }

  async function toggleLike(comment: Comment) {
    if (!me) return;
    const liked = comment.my_like.length === 0;
    setLiked(comment.id, liked);
    try {
      if (liked) await likeComment(comment.id);
      else await unlikeComment(comment.id, me);
    } catch {
      setLiked(comment.id, !liked);
    }
  }

  /** Toque longo: apagar (seu comentário ou no seu post), denunciar ou bloquear. */
  function options(comment: Comment) {
    const name = comment.author?.display_name || comment.author?.username || t('esta pessoa');
    const mine = comment.user_id === me;
    const canDelete = mine || post.user_id === me;
    const hide = () => setComments((rows) => rows?.filter((c) => c.user_id !== comment.user_id) ?? null);
    Alert.alert(mine ? t('Seu comentário') : t('Comentário de {name}', { name }), undefined, [
      ...(canDelete ? [{ text: t('Apagar'), style: 'destructive' as const, onPress: () => remove(comment) }] : []),
      ...(mine
        ? []
        : [
            {
              text: t('Denunciar'),
              onPress: () => askReport({ userId: comment.user_id, postId: post.id, commentId: comment.id }),
            },
            {
              text: t('Bloquear {name}', { name }),
              style: 'destructive' as const,
              onPress: () => askBlock(comment.user_id, name, hide),
            },
          ]),
      { text: t('Cancelar'), style: 'cancel' as const },
    ]);
  }

  const canSend = text.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.panel, { paddingRight: Math.max(insets.right, Spacing.md) }]}
      behavior="padding">
      <View style={styles.header}>
        <Text style={styles.title}>{t('Comentários')}</Text>
        <Button variant="ghost" title={t('Fechar')} onPress={onClose} />
      </View>

      {comments === null ? (
        <View style={styles.center}>
          {failed ? (
            <>
              <Text style={styles.empty}>{t('Não foi possível carregar os comentários.')}</Text>
              <Button variant="ghost" title={t('Tentar de novo')} onPress={() => setAttempt((n) => n + 1)} />
            </>
          ) : (
            <ApertureLoader size={32} background={Colors.surface} />
          )}
        </View>
      ) : (
        <FlatList
          ref={list}
          style={styles.list}
          data={threaded(comments)}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={comments.length === 0 ? styles.center : styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{t('Ninguém comentou ainda. Seja a primeira pessoa.')}</Text>}
          renderItem={({ item }) => {
            const name = item.author?.display_name || item.author?.username || t('Alguém');
            return (
              <Pressable
                style={({ pressed }) => [styles.row, item.parent_id && styles.reply, pressed && styles.pressed]}
                onLongPress={() => options(item)}
                accessibilityHint={t('Segure para ver as opções')}>
                <Avatar name={name} url={item.author?.avatar_url} size={item.parent_id ? 24 : 30} />
                <View style={styles.flex}>
                  <Text style={styles.meta}>
                    <Text style={styles.name}>{name}</Text>
                    {'  '}
                    {timeLabel(item.created_at)}
                  </Text>
                  <Text style={styles.body}>{item.body}</Text>
                  <Pressable onPress={() => reply(item)} hitSlop={8} accessibilityRole="button" style={styles.replyLink}>
                    <Text style={styles.replyText}>{t('Responder')}</Text>
                  </Pressable>
                </View>
                <ClapperButton
                  inline
                  size={16}
                  liked={item.my_like.length > 0}
                  count={item.like_count}
                  onToggle={() => toggleLike(item)}
                />
              </Pressable>
            );
          }}
        />
      )}

      <FormMessage text={error} />
      {replyingTo ? (
        <View style={styles.replying}>
          <Text style={styles.replyingText} numberOfLines={1}>
            {t('Respondendo a {name}', { name: replyingTo.author?.display_name || replyingTo.author?.username || t('alguém') })}
          </Text>
          <Pressable onPress={() => setReplyingTo(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Cancelar a resposta')}>
            <Text style={styles.replyingCancel}>{t('Cancelar')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
        <TextInput
          ref={input}
          style={styles.input}
          placeholder={replyingTo ? t('Escreva uma resposta') : t('Escreva um comentário')}
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
          accessibilityLabel={t('Publicar comentário')}
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
  reply: {
    marginLeft: 34,
  },
  replyLink: {
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  replyText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  replying: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingRight: 4,
  },
  replyingText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  replyingCancel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
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
