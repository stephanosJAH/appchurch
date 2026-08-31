import { MaterialIcons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { RE_PREFIJO_BLOQUE } from "../lib/richText";
import { colors, fonts } from "../lib/theme";
import { RichTextView } from "./RichTextView";
import { Label, Muted } from "./ui";

// Editor de la `descripcion` de eventos y actividades: un TextInput común con
// una barra que inserta las marcas de lib/richText sobre lo que esté
// seleccionado. Mientras se escribe se ven las marcas; el botón "Vista previa"
// muestra cómo va a quedar publicado, con el mismo componente que usa la app.

type Rango = { start: number; end: number };

/* ============================ Botón de la barra ============================ */

function Boton({
  icono,
  texto,
  onPress,
}: {
  icono?: keyof typeof MaterialIcons.glyphMap;
  texto?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className="h-9 min-w-[36px] items-center justify-center rounded-md px-2 active:opacity-50"
    >
      {icono ? (
        <MaterialIcons name={icono} size={20} color={colors.onSurfaceVariant} />
      ) : (
        <Text style={{ fontFamily: fonts.sansSemibold }} className="text-[13px] text-ink-variant">
          {texto}
        </Text>
      )}
    </Pressable>
  );
}

/* ============================ Editor ============================ */

export function RichTextEditor({
  label,
  valor,
  onChange,
  placeholder = "Contá de qué se trata…",
  ayuda,
}: {
  label?: string;
  valor: string;
  onChange: (texto: string) => void;
  placeholder?: string;
  ayuda?: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const [seleccion, setSeleccion] = useState<Rango>({ start: 0, end: 0 });
  // Solo se controla la selección justo después de tocar la barra; el resto del
  // tiempo se deja libre para que el cursor no salte mientras se escribe.
  const [selForzada, setSelForzada] = useState<Rango | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [enfocado, setEnfocado] = useState(false);

  const aplicar = (texto: string, rango: Rango) => {
    onChange(texto);
    setSeleccion(rango);
    setSelForzada(rango);
    inputRef.current?.focus();
  };

  // Envuelve la selección con la marca, o la desenvuelve si ya la tenía. Sin
  // selección inserta el par y deja el cursor en el medio.
  const envolver = (marca: string) => {
    const { start, end } = seleccion;
    const elegido = valor.slice(start, end);
    const largo = marca.length;

    if (elegido.length >= largo * 2 && elegido.startsWith(marca) && elegido.endsWith(marca)) {
      const interior = elegido.slice(largo, -largo);
      aplicar(valor.slice(0, start) + interior + valor.slice(end), {
        start,
        end: start + interior.length,
      });
      return;
    }
    if (start === end) {
      aplicar(valor.slice(0, start) + marca + marca + valor.slice(end), {
        start: start + largo,
        end: start + largo,
      });
      return;
    }
    aplicar(valor.slice(0, start) + marca + elegido + marca + valor.slice(end), {
      start: start + largo,
      end: start + largo + elegido.length,
    });
  };

  // Alterna un prefijo de bloque (título, viñeta, cita…) en la línea del cursor.
  const prefijar = (prefijo: string) => {
    const { start, end } = seleccion;
    const inicioLinea = valor.lastIndexOf("\n", start - 1) + 1;
    const corte = valor.indexOf("\n", start);
    const finLinea = corte === -1 ? valor.length : corte;
    const linea = valor.slice(inicioLinea, finLinea);

    const actual = linea.match(RE_PREFIJO_BLOQUE);
    let lineaNueva: string;
    if (actual && actual[0] === prefijo) lineaNueva = linea.slice(actual[0].length);
    else if (actual) lineaNueva = prefijo + linea.slice(actual[0].length);
    else lineaNueva = prefijo + linea;

    const delta = lineaNueva.length - linea.length;
    aplicar(valor.slice(0, inicioLinea) + lineaNueva + valor.slice(finLinea), {
      start: Math.max(inicioLinea, start + delta),
      end: Math.max(inicioLinea, end + delta),
    });
  };

  const insertarEnlace = () => {
    const { start, end } = seleccion;
    const elegido = valor.slice(start, end) || "texto del enlace";
    const insertado = `[${elegido}](https://)`;
    // Deja el cursor justo después de "https://" para escribir la dirección.
    const posicion = start + elegido.length + 3 + "https://".length;
    aplicar(valor.slice(0, start) + insertado + valor.slice(end), {
      start: posicion,
      end: posicion,
    });
  };

  const borde = enfocado ? "border-gold" : "border-black/10";

  return (
    <View className="mb-4">
      {label ? <Label className="mb-1.5">{label}</Label> : null}

      <View className={`overflow-hidden rounded-lg border bg-surface ${borde}`}>
        <View className="flex-row items-center border-b border-black/10 bg-surface-low">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ alignItems: "center", paddingHorizontal: 4, paddingVertical: 5 }}
          >
            <Boton texto="Título" onPress={() => prefijar("# ")} />
            <Boton texto="Subtítulo" onPress={() => prefijar("## ")} />
            <View className="mx-1 h-5 w-px bg-black/10" />
            <Boton icono="format-bold" onPress={() => envolver("**")} />
            <Boton icono="format-italic" onPress={() => envolver("_")} />
            <Boton icono="format-underlined" onPress={() => envolver("__")} />
            <View className="mx-1 h-5 w-px bg-black/10" />
            <Boton icono="format-list-bulleted" onPress={() => prefijar("- ")} />
            <Boton icono="format-list-numbered" onPress={() => prefijar("1. ")} />
            <Boton icono="format-quote" onPress={() => prefijar("> ")} />
            <Boton icono="link" onPress={insertarEnlace} />
          </ScrollView>

          <Pressable
            onPress={() => setVistaPrevia((v) => !v)}
            hitSlop={6}
            style={vistaPrevia ? { backgroundColor: colors.primary } : undefined}
            className={`mr-1.5 flex-row items-center gap-1 rounded-md px-2.5 py-1.5 ${
              vistaPrevia ? "" : "active:opacity-50"
            }`}
          >
            <MaterialIcons
              name={vistaPrevia ? "edit" : "visibility"}
              size={15}
              color={vistaPrevia ? "#fff" : colors.onSurfaceVariant}
            />
            <Text
              style={{ fontFamily: fonts.sansSemibold }}
              className={`text-[12px] ${vistaPrevia ? "text-white" : "text-ink-variant"}`}
            >
              {vistaPrevia ? "Editar" : "Vista previa"}
            </Text>
          </Pressable>
        </View>

        {vistaPrevia ? (
          <View className="min-h-[150px] px-4 py-3.5">
            {valor.trim() ? (
              <RichTextView descripcion={valor} />
            ) : (
              <Muted>Todavía no escribiste nada.</Muted>
            )}
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            value={valor}
            onChangeText={onChange}
            multiline
            textAlignVertical="top"
            placeholder={placeholder}
            placeholderTextColor={colors.outline}
            selection={selForzada ?? undefined}
            onSelectionChange={(e) => {
              setSeleccion(e.nativeEvent.selection);
              // Devuelve el control del cursor al usuario.
              if (selForzada) setSelForzada(null);
            }}
            onFocus={() => setEnfocado(true)}
            onBlur={() => setEnfocado(false)}
            style={{ fontFamily: fonts.sans, minHeight: 150 }}
            className="px-4 py-3.5 text-base text-ink"
          />
        )}
      </View>

      {ayuda ? <Muted className="mt-1">{ayuda}</Muted> : null}
    </View>
  );
}
