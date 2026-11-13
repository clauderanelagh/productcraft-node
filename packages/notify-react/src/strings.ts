// Component strings per locale (design 11.3). `{count}`, `{title}`, `{category}`, `{channel}` are placeholders.

export interface NotifyStrings {
  bell: string;
  bellUnread: string;
  title: string;
  close: string;
  markAllRead: string;
  markRead: string;
  markUnread: string;
  archive: string;
  unread: string;
  loading: string;
  empty: string;
  loadError: string;
  retry: string;
  loadMore: string;
  newItem: string;
  justNow: string;
  preferencesTitle: string;
  /** Shown by `<NotifyPreferences>` when the preferences cannot be loaded. */
  preferencesLoadError: string;
  category: string;
  channelInbox: string;
  channelEmail: string;
  channelPush: string;
  channelWebpush: string;
  cellLabel: string;
  required: string;
  requiredHint: string;
  unsubscribeAll: string;
  unsubscribeAllHint: string;
  timezone: string;
  timezoneNone: string;
  quietHours: string;
  quietHoursHint: string;
  /** The workspace's default window applies; `{start}` and `{end}` are `HH:MM`. */
  quietHoursDefault: string;
  /** The button that replaces the workspace default with the recipient's own window. */
  quietHoursCustomise: string;
  quietFrom: string;
  quietTo: string;
  saveError: string;
  noCategories: string;
}

const en: NotifyStrings = {
  bell: "Notifications",
  bellUnread: "Notifications, {count} unread",
  title: "Notifications",
  close: "Close",
  markAllRead: "Mark all as read",
  markRead: "Mark as read",
  markUnread: "Mark as unread",
  archive: "Archive",
  unread: "Unread",
  loading: "Loading…",
  empty: "You're all caught up.",
  loadError: "Couldn't load notifications.",
  retry: "Try again",
  loadMore: "Load more",
  newItem: "New notification: {title}",
  justNow: "just now",
  preferencesTitle: "Notification preferences",
  preferencesLoadError: "Couldn't load your notification settings.",
  category: "Category",
  channelInbox: "In-app",
  channelEmail: "Email",
  channelPush: "Mobile push",
  channelWebpush: "Browser push",
  cellLabel: "{category}: {channel}",
  required: "Required",
  requiredHint: "Required notifications can't be turned off.",
  unsubscribeAll: "Turn off all optional notifications",
  unsubscribeAllHint: "Required notifications still arrive.",
  timezone: "Time zone",
  timezoneNone: "Not set",
  quietHours: "Quiet hours",
  quietHoursHint: "Push notifications wait until quiet hours end.",
  quietHoursDefault: "Quiet hours {start}–{end} (default)",
  quietHoursCustomise: "Change",
  quietFrom: "From",
  quietTo: "To",
  saveError: "Couldn't save your change. Try again.",
  noCategories: "There is nothing to configure yet.",
};

const ptPT: NotifyStrings = {
  bell: "Notificações",
  bellUnread: "Notificações, {count} por ler",
  title: "Notificações",
  close: "Fechar",
  markAllRead: "Marcar todas como lidas",
  markRead: "Marcar como lida",
  markUnread: "Marcar como não lida",
  archive: "Arquivar",
  unread: "Por ler",
  loading: "A carregar…",
  empty: "Está tudo em dia.",
  loadError: "Não foi possível carregar as notificações.",
  retry: "Tentar novamente",
  loadMore: "Carregar mais",
  newItem: "Nova notificação: {title}",
  justNow: "agora mesmo",
  preferencesTitle: "Preferências de notificações",
  preferencesLoadError: "Não foi possível carregar as suas definições de notificações.",
  category: "Categoria",
  channelInbox: "Na aplicação",
  channelEmail: "Email",
  channelPush: "Push no telemóvel",
  channelWebpush: "Push no browser",
  cellLabel: "{category}: {channel}",
  required: "Obrigatória",
  requiredHint: "As notificações obrigatórias não podem ser desativadas.",
  unsubscribeAll: "Desativar todas as notificações opcionais",
  unsubscribeAllHint: "As notificações obrigatórias continuam a chegar.",
  timezone: "Fuso horário",
  timezoneNone: "Não definido",
  quietHours: "Horas de silêncio",
  quietHoursHint: "As notificações push esperam pelo fim das horas de silêncio.",
  quietHoursDefault: "Horas de silêncio {start}–{end} (predefinição)",
  quietHoursCustomise: "Alterar",
  quietFrom: "Das",
  quietTo: "Às",
  saveError: "Não foi possível guardar a alteração. Tente novamente.",
  noCategories: "Ainda não há nada para configurar.",
};

const ptBR: NotifyStrings = {
  ...ptPT,
  bellUnread: "Notificações, {count} não lidas",
  unread: "Não lida",
  loading: "Carregando…",
  empty: "Você está em dia.",
  channelInbox: "No app",
  channelEmail: "E-mail",
  channelPush: "Push no celular",
  channelWebpush: "Push no navegador",
  timezone: "Fuso horário",
  quietHours: "Horário de silêncio",
  quietHoursHint: "As notificações push esperam o fim do horário de silêncio.",
  quietHoursDefault: "Horário de silêncio {start}–{end} (padrão)",
  quietHoursCustomise: "Alterar",
  saveError: "Não foi possível salvar a alteração. Tente novamente.",
  preferencesLoadError: "Não foi possível carregar suas configurações de notificação.",
  noCategories: "Ainda não há nada para configurar.",
  retry: "Tentar de novo",
};

const es: NotifyStrings = {
  bell: "Notificaciones",
  bellUnread: "Notificaciones, {count} sin leer",
  title: "Notificaciones",
  close: "Cerrar",
  markAllRead: "Marcar todas como leídas",
  markRead: "Marcar como leída",
  markUnread: "Marcar como no leída",
  archive: "Archivar",
  unread: "Sin leer",
  loading: "Cargando…",
  empty: "Estás al día.",
  loadError: "No se pudieron cargar las notificaciones.",
  retry: "Reintentar",
  loadMore: "Cargar más",
  newItem: "Nueva notificación: {title}",
  justNow: "ahora mismo",
  preferencesTitle: "Preferencias de notificaciones",
  preferencesLoadError: "No se pudo cargar tu configuración de notificaciones.",
  category: "Categoría",
  channelInbox: "En la app",
  channelEmail: "Correo",
  channelPush: "Push en el móvil",
  channelWebpush: "Push en el navegador",
  cellLabel: "{category}: {channel}",
  required: "Obligatoria",
  requiredHint: "Las notificaciones obligatorias no se pueden desactivar.",
  unsubscribeAll: "Desactivar todas las notificaciones opcionales",
  unsubscribeAllHint: "Las notificaciones obligatorias siguen llegando.",
  timezone: "Zona horaria",
  timezoneNone: "Sin definir",
  quietHours: "Horas de silencio",
  quietHoursHint: "Las notificaciones push esperan al final de las horas de silencio.",
  quietHoursDefault: "Horas de silencio {start}–{end} (predeterminado)",
  quietHoursCustomise: "Cambiar",
  quietFrom: "Desde",
  quietTo: "Hasta",
  saveError: "No se pudo guardar el cambio. Inténtalo de nuevo.",
  noCategories: "Todavía no hay nada que configurar.",
};

const fr: NotifyStrings = {
  bell: "Notifications",
  bellUnread: "Notifications, {count} non lues",
  title: "Notifications",
  close: "Fermer",
  markAllRead: "Tout marquer comme lu",
  markRead: "Marquer comme lue",
  markUnread: "Marquer comme non lue",
  archive: "Archiver",
  unread: "Non lue",
  loading: "Chargement…",
  empty: "Vous êtes à jour.",
  loadError: "Impossible de charger les notifications.",
  retry: "Réessayer",
  loadMore: "Afficher plus",
  newItem: "Nouvelle notification : {title}",
  justNow: "à l'instant",
  preferencesTitle: "Préférences de notification",
  preferencesLoadError: "Impossible de charger vos réglages de notification.",
  category: "Catégorie",
  channelInbox: "Dans l'app",
  channelEmail: "E-mail",
  channelPush: "Push mobile",
  channelWebpush: "Push navigateur",
  cellLabel: "{category} : {channel}",
  required: "Obligatoire",
  requiredHint: "Les notifications obligatoires ne peuvent pas être désactivées.",
  unsubscribeAll: "Désactiver toutes les notifications facultatives",
  unsubscribeAllHint: "Les notifications obligatoires continuent d'arriver.",
  timezone: "Fuseau horaire",
  timezoneNone: "Non défini",
  quietHours: "Heures calmes",
  quietHoursHint: "Les notifications push attendent la fin des heures calmes.",
  quietHoursDefault: "Heures calmes {start}–{end} (par défaut)",
  quietHoursCustomise: "Modifier",
  quietFrom: "De",
  quietTo: "À",
  saveError: "Impossible d'enregistrer la modification. Réessayez.",
  noCategories: "Rien à configurer pour le moment.",
};

const de: NotifyStrings = {
  bell: "Benachrichtigungen",
  bellUnread: "Benachrichtigungen, {count} ungelesen",
  title: "Benachrichtigungen",
  close: "Schließen",
  markAllRead: "Alle als gelesen markieren",
  markRead: "Als gelesen markieren",
  markUnread: "Als ungelesen markieren",
  archive: "Archivieren",
  unread: "Ungelesen",
  loading: "Wird geladen…",
  empty: "Du bist auf dem neuesten Stand.",
  loadError: "Benachrichtigungen konnten nicht geladen werden.",
  retry: "Erneut versuchen",
  loadMore: "Mehr laden",
  newItem: "Neue Benachrichtigung: {title}",
  justNow: "gerade eben",
  preferencesTitle: "Benachrichtigungseinstellungen",
  preferencesLoadError: "Deine Benachrichtigungseinstellungen konnten nicht geladen werden.",
  category: "Kategorie",
  channelInbox: "In der App",
  channelEmail: "E-Mail",
  channelPush: "Mobile Push",
  channelWebpush: "Browser-Push",
  cellLabel: "{category}: {channel}",
  required: "Erforderlich",
  requiredHint: "Erforderliche Benachrichtigungen können nicht deaktiviert werden.",
  unsubscribeAll: "Alle optionalen Benachrichtigungen deaktivieren",
  unsubscribeAllHint: "Erforderliche Benachrichtigungen kommen weiterhin an.",
  timezone: "Zeitzone",
  timezoneNone: "Nicht festgelegt",
  quietHours: "Ruhezeiten",
  quietHoursHint: "Push-Benachrichtigungen warten bis zum Ende der Ruhezeiten.",
  quietHoursDefault: "Ruhezeiten {start}–{end} (Standard)",
  quietHoursCustomise: "Ändern",
  quietFrom: "Von",
  quietTo: "Bis",
  saveError: "Die Änderung konnte nicht gespeichert werden. Versuch es erneut.",
  noCategories: "Es gibt noch nichts einzustellen.",
};

/** The locales the components ship strings for. */
export const NOTIFY_LOCALES = ["en", "pt-PT", "pt-BR", "es", "fr", "de"] as const;

const TABLE: Record<string, NotifyStrings> = { en, "pt-PT": ptPT, "pt-BR": ptBR, es, fr, de, pt: ptPT };

/** Strings for `locale` (exact, then language, then English), with `overrides` on top. */
export function notifyStrings(locale: string | undefined, overrides?: Partial<NotifyStrings>): NotifyStrings {
  const l = locale ?? "en";
  const base = TABLE[l] ?? TABLE[Object.keys(TABLE).find((k) => k.toLowerCase() === l.toLowerCase()) ?? ""] ?? TABLE[l.split("-")[0]!.toLowerCase()] ?? en;
  return overrides ? { ...base, ...overrides } : base;
}

/** Replaces `{name}` placeholders. */
export const fill = (s: string, vars: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "5 minutes ago" in the locale, via `Intl.RelativeTimeFormat`; `justNow` under a minute. */
export function relativeTime(iso: string, locale: string, now: number, strings: NotifyStrings): string {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  if (!Number.isFinite(secs)) return "";
  if (Math.abs(secs) < 60) return strings.justNow;
  const [unit, size] = UNITS.find(([, s]) => Math.abs(secs) >= s)!;
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(secs / size), unit);
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(secs / size), unit);
  }
}
