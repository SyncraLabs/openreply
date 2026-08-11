/**
 * Fuente de datos del Radar de competencia.
 *
 * La API oficial de Meta NO expone nada de cuentas ajenas — ni posts, ni
 * views, ni likes. Sólo tu propia cuenta. Así que los datos de competencia
 * tienen que venir de fuera, y eso es siempre un compromiso:
 *
 * - Apify: se mantienen ellos, cuesta unos pocos € al mes, va detrás de token.
 * - Scraper propio: gratis, pero Instagram rota su GraphQL cada 2-4 semanas y
 *   te toca arreglarlo cada vez.
 * - n8n: sirve de orquestador, pero por debajo necesita una de las dos.
 *
 * Por eso esto es una interfaz: la app no sabe de dónde salen los datos. Si
 * Apify se queda corto o sube de precio, se escribe otro adaptador y no se
 * toca ni la UI ni el worker.
 */

export interface RadarProviderPost {
  /** Shortcode o id estable del proveedor. */
  externalId: string;
  url: string;
  caption: string | null;
  thumbnailUrl: string | null;
  /** "REEL" | "IMAGE" | "CAROUSEL" | lo que devuelva el proveedor. */
  mediaType: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  postedAt: Date;
}

export interface RadarProviderProfile {
  username: string;
  displayName: string | null;
  followers: number | null;
  posts: RadarProviderPost[];
}

export interface RadarProvider {
  readonly name: string;
  /** Posts recientes de una cuenta pública. */
  fetchProfile(username: string, limit: number): Promise<RadarProviderProfile>;
  /** Descubrimiento por nicho: hashtag o término. Vacío si no lo soporta. */
  search?(query: string, limit: number): Promise<RadarProviderProfile[]>;
}

/* ------------------------------------------------------------------ */
/* Apify                                                               */
/* ------------------------------------------------------------------ */

const APIFY_ACTOR = process.env.APIFY_ACTOR ?? "apify~instagram-scraper";
const APIFY_BASE = "https://api.apify.com/v2";

interface ApifyItem {
  shortCode?: string;
  id?: string;
  url?: string;
  caption?: string;
  displayUrl?: string;
  type?: string;
  productType?: string;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  followersCount?: number;
}

function toPost(item: ApifyItem): RadarProviderPost | null {
  const externalId = item.shortCode ?? item.id;
  if (!externalId || !item.timestamp) return null;

  return {
    externalId,
    url: item.url ?? `https://www.instagram.com/p/${externalId}/`,
    caption: item.caption ?? null,
    thumbnailUrl: item.displayUrl ?? null,
    mediaType: item.productType ?? item.type ?? null,
    // Los reels traen playCount; los vídeos antiguos, viewCount. Ninguno en
    // fotos, y ahí `views` se queda a null a propósito: un 0 falsearía la
    // mediana de la cuenta y con ella todos los outlier scores.
    views: item.videoPlayCount ?? item.videoViewCount ?? null,
    likes: item.likesCount ?? null,
    comments: item.commentsCount ?? null,
    postedAt: new Date(item.timestamp),
  };
}

class ApifyProvider implements RadarProvider {
  readonly name = "apify";

  constructor(private readonly token: string) {}

  private async runActor(input: unknown): Promise<ApifyItem[]> {
    // run-sync-get-dataset-items ejecuta y devuelve resultados en una llamada.
    const res = await fetch(
      `${APIFY_BASE}/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${this.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );

    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      throw new Error(
        `Apify ${res.status}: ${detalle.slice(0, 200) || res.statusText}`
      );
    }
    return (await res.json()) as ApifyItem[];
  }

  async fetchProfile(
    username: string,
    limit: number
  ): Promise<RadarProviderProfile> {
    const items = await this.runActor({
      directUrls: [`https://www.instagram.com/${username}/`],
      resultsType: "posts",
      resultsLimit: limit,
    });

    const posts = items
      .map(toPost)
      .filter((p): p is RadarProviderPost => p !== null);

    const conPerfil = items.find((i) => i.ownerUsername || i.followersCount);

    return {
      username,
      displayName: conPerfil?.ownerFullName ?? null,
      followers: conPerfil?.followersCount ?? null,
      posts,
    };
  }

  async search(query: string, limit: number): Promise<RadarProviderProfile[]> {
    const hashtag = query.replace(/^#/, "").trim();
    const items = await this.runActor({
      directUrls: [`https://www.instagram.com/explore/tags/${hashtag}/`],
      resultsType: "posts",
      resultsLimit: limit,
    });

    // Un hashtag devuelve posts sueltos de muchas cuentas: se agrupan por autor
    // para que la UI hable de cuentas, no de posts huérfanos.
    const porCuenta = new Map<string, RadarProviderProfile>();
    for (const item of items) {
      const autor = item.ownerUsername;
      const post = toPost(item);
      if (!autor || !post) continue;

      const perfil = porCuenta.get(autor);
      if (perfil) perfil.posts.push(post);
      else
        porCuenta.set(autor, {
          username: autor,
          displayName: item.ownerFullName ?? null,
          followers: item.followersCount ?? null,
          posts: [post],
        });
    }
    return [...porCuenta.values()];
  }
}

/**
 * Devuelve el proveedor configurado, o null si no hay ninguno.
 *
 * Null no es un error: el Radar se despliega antes de que exista el token y
 * la UI enseña qué falta en vez de reventar.
 */
export function getRadarProvider(): RadarProvider | null {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  return new ApifyProvider(token);
}
