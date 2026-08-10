/**
 * i18n mínimo — ES / EN.
 *
 * La preferencia va en una COOKIE, no en localStorage: el idioma cambia texto
 * que se renderiza en servidor, así que el server tiene que conocerlo o React
 * se queja de mismatch al hidratar. Con cookie, servidor y cliente pintan lo
 * mismo desde el primer byte.
 *
 * Cubre el "chrome" de la app (navegación, cabecera, estados, contactos). Las
 * pantallas heredadas del proyecto original siguen en inglés; según se vayan
 * tocando, sus textos se van moviendo aquí.
 */

export type Lang = "es" | "en";

export const LANG_COOKIE = "lang";
export const DEFAULT_LANG: Lang = "es";

export function normalizeLang(value: string | undefined): Lang {
  return value === "en" ? "en" : DEFAULT_LANG;
}

const dict = {
  es: {
    "nav.dashboard": "Panel",
    "nav.overview": "Rendimiento",
    "nav.contacts": "Contactos",
    "nav.inbox": "Bandeja",
    "nav.campaigns": "Campañas",
    "nav.logs": "Envíos",
    "nav.settings": "Ajustes",
    "nav.diagnostics": "Diagnóstico",

    "shell.selfHosted": "Rodri OS · en tu servidor",
    "shell.menu": "Menú",
    "shell.connect": "Conectar Instagram",
    "shell.connectShort": "Conectar",
    "shell.accounts": "cuentas",
    "shell.themeDark": "Tema oscuro",
    "shell.themeLight": "Tema claro",
    "shell.langLabel": "Idioma",

    "status.SENT": "Enviado",
    "status.FAILED": "Fallido",
    "status.PENDING": "En cola",
    "status.SKIPPED_DEDUP": "Duplicado",
    "status.SKIPPED_RATE_LIMIT": "Límite/hora",
    "status.SKIPPED_PLAN_LIMIT": "Omitido",
    "status.SKIPPED_NO_MATCH": "Sin match",

    "contacts.title": "Contactos",
    "contacts.subtitle":
      "Quién ha comentado y ha entrado en una campaña, agrupado por persona.",
    "contacts.people": "Personas",
    "contacts.repeat": "Recurrentes",
    "contacts.repeatFoot": "han comentado más de una vez",
    "contacts.delivered": "DMs entregados",
    "contacts.interactions": "Interacciones",
    "contacts.account": "Cuenta",
    "contacts.dms": "DMs",
    "contacts.campaigns": "Campañas",
    "contacts.lastComment": "Último comentario",
    "contacts.lastSeen": "Última vez",
    "contacts.recurring": "recurrente",
    "contacts.noName": "sin nombre",
    "contacts.empty":
      "Todavía no ha comentado nadie en una campaña activa. En cuanto salga el primer DM, aparecerá aquí.",
    "contacts.noEmail":
      "Instagram no expone el email de quien comenta, así que no hay columna de correo. Para cruzar un @ con su email hace falta un link con token único por persona que capture el correo en el destino.",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.overview": "Performance",
    "nav.contacts": "Contacts",
    "nav.inbox": "Inbox",
    "nav.campaigns": "Campaigns",
    "nav.logs": "DM logs",
    "nav.settings": "Settings",
    "nav.diagnostics": "Diagnostics",

    "shell.selfHosted": "Rodri OS · self-hosted",
    "shell.menu": "Menu",
    "shell.connect": "Connect Instagram",
    "shell.connectShort": "Connect",
    "shell.accounts": "accounts",
    "shell.themeDark": "Dark theme",
    "shell.themeLight": "Light theme",
    "shell.langLabel": "Language",

    "status.SENT": "Sent",
    "status.FAILED": "Failed",
    "status.PENDING": "Pending",
    "status.SKIPPED_DEDUP": "Dedup",
    "status.SKIPPED_RATE_LIMIT": "Rate limited",
    "status.SKIPPED_PLAN_LIMIT": "Skipped",
    "status.SKIPPED_NO_MATCH": "No match",

    "contacts.title": "Contacts",
    "contacts.subtitle":
      "Everyone who commented and entered a campaign, grouped by person.",
    "contacts.people": "People",
    "contacts.repeat": "Returning",
    "contacts.repeatFoot": "commented more than once",
    "contacts.delivered": "DMs delivered",
    "contacts.interactions": "Interactions",
    "contacts.account": "Account",
    "contacts.dms": "DMs",
    "contacts.campaigns": "Campaigns",
    "contacts.lastComment": "Last comment",
    "contacts.lastSeen": "Last seen",
    "contacts.recurring": "returning",
    "contacts.noName": "no name",
    "contacts.empty":
      "Nobody has commented on an active campaign yet. The first DM will show up here.",
    "contacts.noEmail":
      "Instagram does not expose a commenter's email, so there is no email column. Linking an @ to an email needs a per-person tokenized link that captures the address at the destination.",
  },
} as const;

export type TranslationKey = keyof (typeof dict)["es"];

export function translator(lang: Lang) {
  return (key: TranslationKey): string => dict[lang][key] ?? dict.es[key];
}
