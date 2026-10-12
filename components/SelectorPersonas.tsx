import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { colors } from "../lib/theme";
import { Body, Card, Chip, Field, Muted } from "./ui";

// Selector de personas: el buscador y la lista de elegidos que nacieron en la
// reunión de obreros, compartidos por todas las pantallas que suman gente
// (participantes de una reunión, discípulos, integrantes y líderes de un
// ministerio).
//
// Es solo presentación. De DÓNDE salen los candidatos lo decide cada pantalla
// y no se unifica a propósito: el admin filtra el padrón en memoria, pero un
// discipulador o un líder de ministerio no puede leer `miembros` (RLS, 0014) y
// busca por RPC (`candidatos_para_discipulado` / `candidatos_para_ministerio`).
// Tampoco decide qué pasa al agregar: puede ser estado local (se guarda con el
// formulario) o una mutación inmediata.

export type PersonaOpcion = {
  id: string;
  nombre: string;
  // Segunda línea opcional (teléfono parcial, rol…).
  detalle?: string | null;
  // Ya forma parte: se muestra marcada y no se puede volver a sumar.
  yaEsta?: boolean;
};

const filaClase = (i: number) => (i > 0 ? "border-t border-outline-variant" : "");

/* ============================ Buscador ============================ */

type BuscadorProps = {
  busqueda: string;
  onBusqueda: (texto: string) => void;
  candidatos: PersonaOpcion[];
  onAgregar: (p: PersonaOpcion) => void;
  placeholder?: string;
  // Por debajo de esto no se muestran resultados (las RPC exigen 2).
  minCaracteres?: number;
  // Texto bajo el buscador mientras no se llegó al mínimo.
  ayuda?: string;
  buscando?: boolean;
  // Si la búsqueda falló, no hay que ofrecer nada: "no está" sería un invento.
  error?: string | null;
  // Mientras se guarda un alta, los candidatos no se pueden volver a tocar.
  agregando?: boolean;
  sinResultados?: string;
  autoFocus?: boolean;
  // Debajo de los resultados (p. ej. "crear ficha nueva").
  children?: ReactNode;
};

export function BuscadorPersonas({
  busqueda,
  onBusqueda,
  candidatos,
  onAgregar,
  placeholder = "Buscar en el padrón para agregar…",
  minCaracteres = 1,
  ayuda,
  buscando = false,
  error,
  agregando = false,
  sinResultados,
  autoFocus,
  children,
}: BuscadorProps) {
  const texto = busqueda.trim();
  const corto = texto.length < minCaracteres;

  let resultado: ReactNode = null;
  if (corto) {
    if (ayuda) resultado = <Muted className="mb-3">{ayuda}</Muted>;
    else if (texto.length > 0)
      resultado = (
        <Muted className="mb-3">
          Escribí al menos {minCaracteres} {minCaracteres === 1 ? "letra" : "letras"}.
        </Muted>
      );
  } else if (buscando) {
    resultado = (
      <View className="items-center py-3">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (error) {
    resultado = (
      <View className="mb-3 flex-row items-start gap-2 rounded-lg bg-danger/10 p-3">
        <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
        <Muted className="flex-1">{error}</Muted>
      </View>
    );
  } else if (candidatos.length === 0) {
    resultado = (
      <Muted className="mb-3">
        {sinResultados ?? `Nadie del padrón coincide con “${texto}”.`}
      </Muted>
    );
  } else {
    resultado = (
      <Card className="mb-3 p-0">
        {candidatos.map((p, i) => (
          <Pressable
            key={p.id}
            onPress={() => onAgregar(p)}
            disabled={p.yaEsta || agregando}
            accessibilityRole="button"
            accessibilityLabel={p.yaEsta ? `${p.nombre}, ya está` : `Agregar a ${p.nombre}`}
            className={`flex-row items-center justify-between gap-2 px-3 py-3 active:opacity-60 ${filaClase(i)}`}
          >
            <View className="flex-1">
              <Body className={p.yaEsta ? "text-ink-muted" : ""}>{p.nombre}</Body>
              {p.detalle ? <Muted>{p.detalle}</Muted> : null}
            </View>
            {p.yaEsta ? (
              <Chip tone="success">Ya está</Chip>
            ) : (
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={agregando ? colors.outlineVariant : colors.primary}
              />
            )}
          </Pressable>
        ))}
      </Card>
    );
  }

  return (
    <>
      <Field
        placeholder={placeholder}
        icon="search-outline"
        value={busqueda}
        onChangeText={onBusqueda}
        autoCapitalize="words"
        autoCorrect={false}
        autoFocus={autoFocus}
      />
      {resultado}
      {!corto && !buscando && !error ? children : null}
    </>
  );
}

/* ========================= Lista de elegidos ========================= */

type ListaProps = {
  personas: PersonaOpcion[];
  vacio?: string;
  // Con `marcado` cada fila lleva un checkbox (p. ej. presente/ausente).
  marcado?: (id: string) => boolean;
  onAlternar?: (id: string) => void;
  onQuitar?: (p: PersonaOpcion) => void;
};

export function ListaPersonas({ personas, vacio, marcado, onAlternar, onQuitar }: ListaProps) {
  if (personas.length === 0) {
    return vacio ? <Muted className="mb-4">{vacio}</Muted> : null;
  }

  return (
    <Card className="mb-4 p-0">
      {personas.map((p, i) => {
        const conCheck = !!marcado;
        const sel = marcado?.(p.id) ?? true;
        const contenido = (
          <>
            {conCheck && (
              <Ionicons
                name={sel ? "checkbox" : "square-outline"}
                size={22}
                color={sel ? colors.primary : colors.onSurfaceVariant}
              />
            )}
            <View className="flex-1">
              <Body className={sel ? "" : "text-ink-muted"}>{p.nombre}</Body>
              {p.detalle ? <Muted>{p.detalle}</Muted> : null}
            </View>
          </>
        );
        return (
          <View
            key={p.id}
            className={`flex-row items-center gap-2 px-3 py-2.5 ${filaClase(i)}`}
          >
            {onAlternar ? (
              <Pressable
                onPress={() => onAlternar(p.id)}
                hitSlop={6}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sel }}
                className="flex-1 flex-row items-center gap-2.5 active:opacity-60"
              >
                {contenido}
              </Pressable>
            ) : (
              <View className="flex-1 flex-row items-center gap-2.5">{contenido}</View>
            )}
            {onQuitar && (
              <Pressable
                onPress={() => onQuitar(p)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Quitar a ${p.nombre}`}
                className="active:opacity-60"
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            )}
          </View>
        );
      })}
    </Card>
  );
}
