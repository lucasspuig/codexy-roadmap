/**
 * Tipos mínimos para las tablas que usa la app.
 * Para tipos completos se puede correr `npx supabase gen types typescript --project-id=xxx`.
 */

export type FaseEstado = "pending" | "active" | "done";
export type ProyectoEstado = "activo" | "pausado" | "completado" | "cancelado";

export type BrandColors = {
  primary?: string; // color principal (títulos, CTA)
  accent?: string;  // color de acento (fases done, progress)
  bg?: string;      // fondo de la página pública
  text?: string;    // texto principal
};

export type RoadmapProyecto = {
  id: string;
  cliente_id: string;
  nombre: string;
  subtitulo: string | null;
  estado: ProyectoEstado;
  fecha_inicio: string;
  fecha_estimada_fin: string | null;
  pm_id: string | null;
  notas_internas: string | null;
  brand_logo_url: string | null;
  brand_colors: BrandColors | null;
  created_at: string;
  updated_at: string;
};

export type RoadmapFase = {
  id: string;
  proyecto_id: string;
  orden: number;
  icono: string | null;
  titulo: string;
  descripcion: string;
  estado: FaseEstado;
  completada_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoadmapItem = {
  id: string;
  fase_id: string;
  orden: number;
  texto: string;
  completado: boolean;
  completado_at: string | null;
  created_at: string;
};

export type RoadmapTokenPublico = {
  token: string;
  proyecto_id: string;
  activo: boolean;
  created_at: string;
  expires_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
};

export type RoadmapEvento = {
  id: string;
  proyecto_id: string;
  fase_id: string | null;
  tipo: string;
  mensaje: string | null;
  actor_id: string | null;
  actor_nombre: string | null;
  visible_cliente: boolean;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type RoadmapPlantilla = {
  id: string;
  nombre: string;
  descripcion: string | null;
  rubro: string | null;
  fases: Array<{
    orden: number;
    icono: string;
    titulo: string;
    descripcion: string;
    items: string[];
  }>;
  activa: boolean;
  created_at: string;
};

export type Cliente = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  empresa: string | null;
  rubro: string | null;
  estado_venta: string;
  tipo: string;
  /** Token UUID para la URL pública /pagar/[token]. */
  pago_token: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  nombre: string | null;
  role: "admin" | "vendedor";
  avatar_url: string | null;
  activo: boolean;
  created_at: string;
};

/** Schema mínimo para @supabase/ssr (suficiente para type-safety básico). */
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      roadmap_proyectos: {
        Row: RoadmapProyecto;
        Insert: Partial<RoadmapProyecto> & { cliente_id: string };
        Update: Partial<RoadmapProyecto>;
        Relationships: [];
      };
      roadmap_fases: {
        Row: RoadmapFase;
        Insert: Partial<RoadmapFase> & { proyecto_id: string; orden: number; titulo: string };
        Update: Partial<RoadmapFase>;
        Relationships: [];
      };
      roadmap_items: {
        Row: RoadmapItem;
        Insert: Partial<RoadmapItem> & { fase_id: string; texto: string };
        Update: Partial<RoadmapItem>;
        Relationships: [];
      };
      roadmap_tokens_publicos: {
        Row: RoadmapTokenPublico;
        Insert: Partial<RoadmapTokenPublico> & { token: string; proyecto_id: string };
        Update: Partial<RoadmapTokenPublico>;
        Relationships: [];
      };
      roadmap_eventos: {
        Row: RoadmapEvento;
        Insert: Partial<RoadmapEvento> & { proyecto_id: string; tipo: string };
        Update: Partial<RoadmapEvento>;
        Relationships: [];
      };
      roadmap_plantillas: {
        Row: RoadmapPlantilla;
        Insert: Partial<RoadmapPlantilla> & { nombre: string; fases: RoadmapPlantilla["fases"] };
        Update: Partial<RoadmapPlantilla>;
        Relationships: [];
      };
      clientes: {
        Row: Cliente;
        Insert: Partial<Cliente> & { nombre: string };
        Update: Partial<Cliente>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      contratos: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      agency_settings: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      pagos: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      cuotas_mensuales: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      mensaje_templates: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      mensajes_enviados: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      mensajes_recibidos: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      agency_payment_data: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: {
        Row: Record<string, unknown>;
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: { [_ in never]: never };
  };
};
