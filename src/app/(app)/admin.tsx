import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button, Field, FormMessage } from '@/components/form';
import { BackButton } from '@/components/side-rail';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import {
  amITeam,
  banUser,
  fetchFeedback,
  fetchReports,
  fetchStats,
  fetchUsers,
  markFeedback,
  resolveReport,
  setTeam,
  unbanUser,
  type AdminFeedback,
  type AdminPerson,
  type AdminReport,
  type AdminStats,
  type AdminUser,
  type Resolution,
} from '@/lib/admin';
import { dateLocale, t } from '@/lib/i18n';
import { publicUrl } from '@/lib/images';
import { useSession } from '@/lib/session';

type Section = 'overview' | 'reports' | 'people' | 'feedback';

const DANGER = '#FF8A80';

function when(iso: string) {
  return new Date(iso).toLocaleString(dateLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nameOf(person: AdminPerson | null) {
  if (!person) return t('Conta apagada');
  return person.display_name || person.username;
}

function openProfile(id: string) {
  router.push({ pathname: '/user/[id]', params: { id } });
}

const MESSAGE_KIND: Record<string, string> = { photo: 'Foto', video: 'Vídeo', audio: 'Áudio' };

/** Espera o menu fechar antes de abrir um alerta (no iPhone, os dois juntos não abrem). */
function afterSheet(action: () => void) {
  setTimeout(action, 400);
}

function failed() {
  Alert.alert(t('Não foi possível concluir'), t('Confira a internet e tente de novo.'));
}

/** Painel do administrador: números, denúncias, pessoas e feedback. Só para a equipe. */
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);

  const loadStats = useCallback(() => {
    fetchStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    amITeam().then(setAllowed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (allowed) loadStats();
    }, [allowed, loadStats]),
  );

  if (allowed === null) {
    return (
      <View style={styles.center}>
        <ApertureLoader />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t('Área restrita')}</Text>
        <Text style={styles.muted}>{t('Só a equipe do 16:9 acessa o painel.')}</Text>
        <BackButton />
      </View>
    );
  }

  const menu: { key: Section; label: string; badge?: number }[] = [
    { key: 'overview', label: t('Visão geral') },
    { key: 'reports', label: t('Denúncias'), badge: stats?.open_reports },
    { key: 'people', label: t('Pessoas') },
    { key: 'feedback', label: t('Feedback'), badge: stats?.unread_feedback },
  ];

  return (
    <View style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <ScrollView style={styles.side} contentContainerStyle={[styles.sideContent, { paddingTop: Math.max(insets.top, Spacing.sm) }]}>
        <BackButton />
        <Text style={styles.sideTitle}>{t('Painel')}</Text>
        {menu.map((item) => {
          const active = item.key === section;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSection(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.menuItem, active && styles.menuItemActive, pressed && styles.pressed]}>
              <Text style={[styles.menuText, active && styles.menuTextActive]}>{item.label}</Text>
              {item.badge ? (
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.main}
        contentContainerStyle={[styles.mainContent, { paddingTop: Math.max(insets.top, Spacing.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        {section === 'overview' ? (
          <Overview stats={stats} onOpen={setSection} />
        ) : section === 'reports' ? (
          <Reports onChanged={loadStats} />
        ) : section === 'people' ? (
          <People onChanged={loadStats} />
        ) : (
          <FeedbackList onChanged={loadStats} />
        )}
      </ScrollView>
    </View>
  );
}

// ---------- Visão geral ----------

function Overview({ stats, onOpen }: { stats: AdminStats | null; onOpen: (s: Section) => void }) {
  if (!stats) return <ApertureLoader size={32} />;
  const n = (value: number) => value.toLocaleString(dateLocale());
  const cards: { label: string; value: number; sub?: string; open?: Section; alert?: boolean }[] = [
    { label: t('Pessoas'), value: stats.users, sub: t('+{n} em 7 dias', { n: n(stats.users_7d) }), open: 'people' },
    { label: t('Ativas em 7 dias'), value: stats.active_7d, sub: t('publicaram, comentaram, curtiram ou mandaram mensagem') },
    { label: t('Trabalhos'), value: stats.posts, sub: t('+{n} em 7 dias', { n: n(stats.posts_7d) }) },
    { label: t('Vídeos'), value: stats.videos },
    { label: t('Comentários'), value: stats.comments },
    { label: t('Mensagens em 7 dias'), value: stats.messages_7d },
    { label: t('Denúncias abertas'), value: stats.open_reports, open: 'reports', alert: stats.open_reports > 0 },
    { label: t('Escondidos'), value: stats.hidden, sub: t('trabalhos e comentários') },
    { label: t('Feedback não lido'), value: stats.unread_feedback, open: 'feedback', alert: stats.unread_feedback > 0 },
    { label: t('Contas suspensas'), value: stats.banned },
    { label: t('Equipe'), value: stats.team },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('Visão geral')}</Text>
      <View style={styles.cards}>
        {cards.map((card) => (
          <Pressable
            key={card.label}
            disabled={!card.open}
            onPress={() => card.open && onOpen(card.open)}
            style={({ pressed }) => [styles.card, card.alert && styles.cardAlert, pressed && styles.pressed]}>
            <Text style={styles.cardValue}>{n(card.value)}</Text>
            <Text style={styles.cardLabel}>{card.label}</Text>
            {card.sub ? <Text style={styles.cardSub}>{card.sub}</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------- Denúncias ----------

const RESOLUTION_LABEL: Record<Resolution, string> = {
  kept: 'Mantido',
  removed: 'Removido',
  banned: 'Removido e conta suspensa',
};

function Reports({ onChanged }: { onChanged: () => void }) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [menu, setMenu] = useState<AdminReport | null>(null);

  const load = useCallback(() => {
    fetchReports(onlyOpen)
      .then((data) => {
        setReports(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, [onlyOpen]);

  useEffect(load, [load]);

  async function decide(report: AdminReport, decision: Resolution) {
    setBusy(report.id);
    try {
      await resolveReport(report.id, decision, decision === 'banned' ? report.reason : '');
      load();
      onChanged();
    } catch {
      failed();
    } finally {
      setBusy(null);
    }
  }

  function confirmBan(report: AdminReport) {
    const name = nameOf(report.reported_user);
    Alert.alert(
      t('Suspender {name}?', { name }),
      t('O conteúdo some e a conta não consegue mais publicar, comentar nem mandar mensagens. Dá para desfazer em Pessoas.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: t('Suspender'), style: 'destructive', onPress: () => decide(report, 'banned') },
      ],
    );
  }

  const actions: SheetAction[] = menu
    ? [
        {
          label: menu.post || menu.comment ? t('Manter o conteúdo (denúncia sem motivo)') : t('Arquivar (sem ação)'),
          onPress: () => decide(menu, 'kept'),
        },
        ...(menu.post || menu.comment
          ? [{ label: t('Remover o conteúdo'), onPress: () => decide(menu, 'removed'), destructive: true }]
          : []),
        ...(menu.reported_user && !menu.reported_user.banned
          ? [{ label: t('Remover e suspender a conta'), onPress: () => afterSheet(() => confirmBan(menu)), destructive: true }]
          : []),
        ...(menu.reported_user ? [{ label: t('Ver perfil denunciado'), onPress: () => openProfile(menu.reported_user!.id) }] : []),
      ]
    : [];

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('Denúncias')}</Text>
        <Chips
          value={onlyOpen ? 'open' : 'all'}
          options={[
            { value: 'open', label: t('Abertas') },
            { value: 'all', label: t('Todas') },
          ]}
          onChange={(v) => setOnlyOpen(v === 'open')}
        />
      </View>
      {reports === null ? (
        error ? (
          <Retry onPress={load} />
        ) : (
          <ApertureLoader size={32} />
        )
      ) : reports.length === 0 ? (
        <Text style={styles.muted}>{onlyOpen ? t('Nenhuma denúncia aberta. Tudo em ordem.') : t('Nenhuma denúncia ainda.')}</Text>
      ) : (
        reports.map((report) => (
          <ReportCard key={report.id} report={report} busy={busy === report.id} onAct={() => setMenu(report)} />
        ))
      )}
      <ActionSheet visible={!!menu} title={menu ? t(menu.reason) : undefined} actions={actions} onClose={() => setMenu(null)} />
    </View>
  );
}

function ReportCard({ report, busy, onAct }: { report: AdminReport; busy: boolean; onAct: () => void }) {
  const target = report.post
    ? t('Trabalho')
    : report.comment
      ? t('Comentário')
      : report.message
        ? t('Mensagem')
        : t('Perfil');
  const hidden = report.post?.hidden || report.comment?.hidden;

  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.reason}>{t(report.reason)}</Text>
        <Text style={styles.tag}>{target}</Text>
        {hidden ? <Text style={[styles.tag, styles.tagDanger]}>{t('Escondido')}</Text> : null}
        {report.same_target > 1 ? (
          <Text style={styles.tag}>{t('{n} denúncias', { n: report.same_target })}</Text>
        ) : null}
        <View style={styles.flex} />
        <Text style={styles.date}>{when(report.created_at)}</Text>
      </View>

      <View style={styles.reportBody}>
        {report.post ? (
          <Image source={{ uri: publicUrl('posts', report.post.image_path) }} style={styles.thumb} contentFit="cover" />
        ) : null}
        <View style={styles.flex}>
          {report.post?.title ? <Text style={styles.content}>{report.post.title}</Text> : null}
          {report.comment ? <Text style={styles.content}>“{report.comment.body}”</Text> : null}
          {report.message ? (
            <Text style={styles.content}>{report.message.body ? `“${report.message.body}”` : `[${t(MESSAGE_KIND[report.message.kind] ?? report.message.kind)}]`}</Text>
          ) : null}
          {!report.post && !report.comment && !report.message && report.reported_user === null ? (
            <Text style={styles.muted}>{t('O conteúdo já foi apagado.')}</Text>
          ) : null}
          {report.reported_user ? (
            <Pressable onPress={() => openProfile(report.reported_user!.id)} style={styles.personLine} hitSlop={4}>
              <Avatar name={nameOf(report.reported_user)} url={report.reported_user.avatar_url} size={22} />
              <Text style={styles.personName}>
                {nameOf(report.reported_user)} <Text style={styles.muted}>@{report.reported_user.username}</Text>
              </Text>
              {report.reported_user.banned ? <Text style={[styles.tag, styles.tagDanger]}>{t('Suspensa')}</Text> : null}
              {report.reported_user.reports > 1 ? (
                <Text style={styles.muted}>{t('{n} denúncias contra a conta', { n: report.reported_user.reports })}</Text>
              ) : null}
            </Pressable>
          ) : null}
          <Text style={styles.small}>{t('Denunciado por {name}', { name: nameOf(report.reporter) })}</Text>
        </View>
      </View>

      {report.resolved_at ? (
        <Text style={styles.small}>
          {t(RESOLUTION_LABEL[report.resolution ?? 'kept'])} · {when(report.resolved_at)}
        </Text>
      ) : (
        <View style={styles.itemActions}>
          <Button title={t('Decidir')} onPress={onAct} loading={busy} />
        </View>
      )}
    </View>
  );
}

// ---------- Pessoas ----------

function People({ onChanged }: { onChanged: () => void }) {
  const { session } = useSession();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState(false);
  const [menu, setMenu] = useState<AdminUser | null>(null);

  const load = useCallback((q: string) => {
    fetchUsers(q.trim())
      .then((data) => {
        setPeople(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  // Busca enquanto digita, com uma pequena pausa.
  useEffect(() => {
    const timer = setTimeout(() => load(query), 300);
    return () => clearTimeout(timer);
  }, [query, load]);

  async function run(action: () => Promise<void>) {
    try {
      await action();
      load(query);
      onChanged();
    } catch {
      failed();
    }
  }

  function confirmBan(person: AdminUser) {
    const name = nameOf(person);
    Alert.alert(
      t('Suspender {name}?', { name }),
      t('Os trabalhos e comentários somem para os outros e a conta não consegue mais publicar, comentar nem mandar mensagens. Dá para desfazer.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: t('Suspender'), style: 'destructive', onPress: () => run(() => banUser(person.id, '')) },
      ],
    );
  }

  function confirmTeam(person: AdminUser, value: boolean) {
    const name = nameOf(person);
    Alert.alert(
      value ? t('Colocar {name} na equipe?', { name }) : t('Tirar {name} da equipe?', { name }),
      value
        ? t('A pessoa passa a ver este painel, recebe aviso de denúncias e pode suspender contas.')
        : t('A pessoa deixa de ver este painel e de receber aviso de denúncias.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: t('Confirmar'), style: value ? 'default' : 'destructive', onPress: () => run(() => setTeam(person.id, value)) },
      ],
    );
  }

  const me = session?.user.id;
  const actions: SheetAction[] = menu
    ? [
        { label: t('Ver perfil'), onPress: () => openProfile(menu.id) },
        ...(menu.id === me || menu.is_team
          ? []
          : menu.banned_at
            ? [{ label: t('Reativar a conta'), onPress: () => run(() => unbanUser(menu.id)) }]
            : [{ label: t('Suspender a conta'), onPress: () => afterSheet(() => confirmBan(menu)), destructive: true }]),
        ...(menu.id === me || menu.banned_at
          ? []
          : menu.is_team
            ? [{ label: t('Tirar da equipe'), onPress: () => afterSheet(() => confirmTeam(menu, false)), destructive: true }]
            : [{ label: t('Colocar na equipe'), onPress: () => afterSheet(() => confirmTeam(menu, true)) }]),
      ]
    : [];

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('Pessoas')}</Text>
      <Field
        label=""
        placeholder={t('Buscar por @, nome ou e-mail')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {people === null ? (
        error ? (
          <Retry onPress={() => load(query)} />
        ) : (
          <ApertureLoader size={32} />
        )
      ) : people.length === 0 ? (
        <Text style={styles.muted}>{t('Ninguém encontrado.')}</Text>
      ) : (
        people.map((person) => (
          <Pressable
            key={person.id}
            onPress={() => setMenu(person)}
            style={({ pressed }) => [styles.item, styles.personRow, pressed && styles.pressed]}>
            <Avatar name={nameOf(person)} url={person.avatar_url} size={40} />
            <View style={styles.flex}>
              <View style={styles.itemHeader}>
                <Text style={styles.personName}>{nameOf(person)}</Text>
                <Text style={styles.muted}>@{person.username}</Text>
                {person.is_team ? <Text style={styles.tag}>{t('Equipe')}</Text> : null}
                {person.banned_at ? <Text style={[styles.tag, styles.tagDanger]}>{t('Suspensa')}</Text> : null}
              </View>
              <Text style={styles.small}>
                {[
                  person.email,
                  t('desde {date}', { date: new Date(person.created_at).toLocaleDateString(dateLocale()) }),
                  t('{n} trabalhos', { n: person.posts }),
                  person.reports ? t('{n} denúncias contra a conta', { n: person.reports }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        ))
      )}
      <ActionSheet
        visible={!!menu}
        title={menu ? `${nameOf(menu)} · @${menu.username}` : undefined}
        actions={actions}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}

// ---------- Feedback ----------

function FeedbackList({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<AdminFeedback[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetchFeedback()
      .then((data) => {
        setItems(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  async function toggle(item: AdminFeedback) {
    const read = !item.read_at;
    // Muda na tela na hora; se falhar, volta.
    setItems((list) => list?.map((f) => (f.id === item.id ? { ...f, read_at: read ? new Date().toISOString() : null } : f)) ?? null);
    try {
      await markFeedback(item.id, read);
      onChanged();
    } catch {
      setItems((list) => list?.map((f) => (f.id === item.id ? item : f)) ?? null);
      failed();
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('Feedback')}</Text>
      {items === null ? (
        error ? (
          <Retry onPress={load} />
        ) : (
          <ApertureLoader size={32} />
        )
      ) : items.length === 0 ? (
        <Text style={styles.muted}>{t('Nenhum feedback ainda.')}</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={[styles.item, !item.read_at && styles.itemUnread]}>
            <View style={styles.itemHeader}>
              {item.author ? (
                <Pressable onPress={() => openProfile(item.author!.id)} style={styles.personLine} hitSlop={4}>
                  <Avatar name={nameOf(item.author)} url={item.author.avatar_url} size={22} />
                  <Text style={styles.personName}>{nameOf(item.author)}</Text>
                </Pressable>
              ) : (
                <Text style={styles.muted}>{t('Conta apagada')}</Text>
              )}
              <View style={styles.flex} />
              <Text style={styles.date}>{when(item.created_at)}</Text>
            </View>
            <Text style={styles.content}>{item.message}</Text>
            <View style={styles.itemHeader}>
              <Text style={styles.small}>{[item.platform, item.app_version && `v${item.app_version}`].filter(Boolean).join(' · ')}</Text>
              <View style={styles.flex} />
              <Pressable onPress={() => toggle(item)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>{item.read_at ? t('Marcar como não lido') : t('Marcar como lido')}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ---------- Peças ----------

function Chips({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Retry({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.section}>
      <FormMessage text={t('Não foi possível carregar a lista.')} />
      <Button variant="ghost" title={t('Tentar de novo')} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
  },
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  side: {
    width: 200,
    flexGrow: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  sideContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  sideTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: 10,
  },
  menuItemActive: {
    backgroundColor: Colors.text,
  },
  menuText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  menuTextActive: {
    color: Colors.background,
  },
  badge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DANGER,
  },
  badgeActive: {
    backgroundColor: Colors.background,
  },
  badgeText: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: Colors.text,
  },
  pressed: {
    opacity: 0.6,
  },
  main: {
    flex: 1,
  },
  mainContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  muted: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  small: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  card: {
    width: 168,
    minHeight: 96,
    padding: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: 2,
  },
  cardAlert: {
    borderColor: DANGER,
  },
  cardValue: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  cardLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  cardSub: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  item: {
    padding: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  itemUnread: {
    borderColor: Colors.silver,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  reason: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  tag: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
  },
  tagDanger: {
    color: Colors.background,
    backgroundColor: DANGER,
  },
  date: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  reportBody: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  thumb: {
    width: 160,
    aspectRatio: FrameRatio,
    borderRadius: 6,
    backgroundColor: Colors.surfaceRaised,
  },
  content: {
    color: Colors.text,
    fontSize: 14,
  },
  personLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  personName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  flex: {
    flex: 1,
  },
  link: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.textMuted,
  },
  chipActive: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  chipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: Colors.background,
  },
});
