import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, useEffect, useState } from "react";
import {
  ActivityIndicator,
  DimensionValue,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardShadow, colors, fonts } from "../lib/theme";

/* ============================ Tipografía ============================ */

export function Display({ children, className, style }: PropsWithChildren<{ className?: string; style?: TextProps["style"] }>) {
  return (
    <Text
      style={[{ fontFamily: fonts.serifBold, lineHeight: 40 }, style]}
      className={`text-[32px] text-ink ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

export function Headline({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <Text
      style={{ fontFamily: fonts.serifSemibold, lineHeight: 32 }}
      className={`text-2xl text-ink ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

// Título serif dentro de tarjetas. Acepta `style` como `Display`: con fuentes
// custom el tamaño va por estilo y no por clase —dos `text-[..px]` en el mismo
// className no garantizan cuál gana (ver components/SaludoCard.tsx).
export function Title({ children, className, numberOfLines, style }: PropsWithChildren<{ className?: string; numberOfLines?: number; style?: TextProps["style"] }>) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: fonts.serifSemibold, lineHeight: 26 }, style]}
      className={`text-[19px] text-ink ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

export function Body({ children, className, ...rest }: PropsWithChildren<{ className?: string } & TextProps>) {
  return (
    <Text style={{ fontFamily: fonts.sans, lineHeight: 24 }} className={`text-base text-ink-variant ${className ?? ""}`} {...rest}>
      {children}
    </Text>
  );
}

export function Muted({ children, className, style, ...rest }: PropsWithChildren<{ className?: string } & TextProps>) {
  return (
    <Text style={[{ fontFamily: fonts.sans, lineHeight: 20 }, style]} className={`text-sm text-ink-muted ${className ?? ""}`} {...rest}>
      {children}
    </Text>
  );
}

// Etiqueta en mayúsculas (labels de sección / campos).
export function Label({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <Text
      style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
      className={`text-xs uppercase text-ink-muted ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

/* ============================ Contenedores ============================ */

// Fondo de la app: blanco arriba, crema cálida (`backgroundWarm`) abajo.
//
// Es una capa absoluta detrás del contenido —no un `backgroundColor`— por dos
// razones: el degradado queda fijo mientras la lista scrollea, y el contenedor
// puede seguir declarando `bg-cream` como piso si el degradado no está.
// `experimental_backgroundImage` es el degradado nativo de RN 0.86 (SDK 57):
// evita sumar expo-linear-gradient.
//
// Va una sola vez por pantalla, en la raíz. Anidado dentro de otro (debajo de
// un AppBar, por ejemplo) el degradado vuelve a arrancar en blanco a media
// pantalla y se nota el escalón.
export function FondoDegradado() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        experimental_backgroundImage: `linear-gradient(to bottom, ${colors.surfaceContainerLowest} 0%, ${colors.backgroundWarm} 100%)`,
      }}
    />
  );
}

// Raíz de pantalla: el fondo de la app y, encima, el contenido.
export function Screen({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <View className={`flex-1 bg-cream ${className ?? ""}`}>
      <FondoDegradado />
      {children}
    </View>
  );
}

// ScrollView para formularios: mantiene el input enfocado visible cuando abre
// el teclado (iOS via automaticallyAdjustKeyboardInsets; Android via adjustResize)
// y permite tocar botones sin cerrar el teclado antes.
export function KeyboardScrollView({
  children,
  className,
  contentContainerStyle,
  ...props
}: PropsWithChildren<ScrollViewProps> & { className?: string }) {
  const insets = useSafeAreaInsets();
  return (
    // iOS: automaticallyAdjustKeyboardInsets alcanza. Android: ese prop es no-op,
    // así que KeyboardAvoidingView con padding empuja el contenido sobre el teclado.
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === "android" ? "padding" : undefined}
    >
      <FondoDegradado />
      <ScrollView
        className={`flex-1 ${className ?? ""}`}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[
          { padding: 16, paddingBottom: insets.bottom + 32 },
          contentContainerStyle,
        ]}
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, className, style, ...props }: PropsWithChildren<ViewProps> & { className?: string }) {
  return (
    <View
      style={[style]}
      className={`rounded-2xl border border-white/5 bg-surface p-5 ${className ?? ""}`}
      {...props}
    >
      {children}
    </View>
  );
}

/* ============================ Chips / Tags ============================ */

type ChipTone = "navy" | "gold" | "neutral" | "success" | "danger" |  "sky";

export function Chip({ children, tone = "navy" }: PropsWithChildren<{ tone?: ChipTone }>) {
  const bg: Record<ChipTone, string> = {
    navy: "bg-navy",
    gold: "bg-gold-container",
    neutral: "bg-surface-high",
    success: "bg-emerald-100",
    danger: "bg-red-100",
    sky: "bg-sky-400",
  };
  const fg: Record<ChipTone, string> = {
    navy: "text-white",
    gold: "text-gold-on",
    neutral: "text-ink-variant",
    success: "text-emerald-800",
    danger: "text-red-700",
    sky: "text-white"
  };
  return (
    <View className={`self-start rounded-md px-2.5 py-1 ${bg[tone]}`}>
      <Text style={{ fontFamily: fonts.sansBold, letterSpacing: 0.8 }} className={`text-[10px] uppercase ${fg[tone]}`}>
        {children}
      </Text>
    </View>
  );
}

/* ============================ Botones ============================ */

type ButtonProps = PressableProps & {
  title: string;
  // `goldContainer` es el botón para fondos navy (dorado claro + texto marrón):
  // sobre navy, el `gold` pleno con texto blanco queda sin contraste.
  variant?: "primary" | "outline" | "gold" | "goldContainer" | "danger" | "ghost";
  loading?: boolean;
  size?: "md" | "sm";
  icon?: keyof typeof Ionicons.glyphMap;
};

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  size = "md",
  icon,
  ...props
}: ButtonProps) {
  const bg: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "bg-navy",
    outline: "bg-transparent border border-navy",
    gold: "bg-gold",
    goldContainer: "bg-gold-container",
    danger: "bg-transparent border border-danger",
    ghost: "bg-transparent",
  };
  const fg: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "text-white",
    outline: "text-navy",
    gold: "text-white",
    goldContainer: "text-gold-on",
    danger: "text-danger",
    ghost: "text-ink-variant",
  };
  // Color del spinner y del ícono: acompañan al texto de cada variante.
  const fgColor =
    variant === "primary" || variant === "gold"
      ? "#fff"
      : variant === "goldContainer"
        ? colors.onTertiaryContainer
        : colors.primary;
  const pad = size === "sm" ? "px-3.5 py-2" : "px-5 py-3.5";
  return (
    <Pressable
      disabled={disabled || loading}
      // `goldContainer` va sin sombra: vive sobre navy, donde la sombra navy al
      // 5% no se ve.
      style={variant === "primary" || variant === "gold" ? cardShadow : undefined}
      className={`flex-row items-center justify-center rounded-lg ${pad} ${bg[variant]} ${
        disabled || loading ? "opacity-50" : "active:opacity-80"
      }`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={fgColor} />
      ) : (
        <>
          <Text style={{ fontFamily: fonts.sansSemibold }} className={`text-[15px] ${fg[variant]} ${size === "sm" ? "text-sm" : ""}`}>
            {title}
          </Text>
          {icon ? (
            <Ionicons
              name={icon}
              size={size === "sm" ? 16 : 18}
              color={fgColor}
              style={{ marginLeft: 8 }}
            />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

// Enlace de acción en dorado (ej. "Ver Detalles", "Gestionar").
export function LinkAction({ title, onPress }: { title: string; onPress?: () => void }) {
  return (
    <Text onPress={onPress} style={{ fontFamily: fonts.sansSemibold }} className="text-[15px] text-gold active:opacity-70">
      {title}
    </Text>
  );
}

/* ============================ Campos ============================ */

type FieldProps = TextInputProps & {
  label?: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
};

export function Field({ label, error, icon, rightIcon, onRightIconPress, className, style, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderClass = error ? "border-danger" : focused ? "border-gold" : "border-black/10";
  return (
    <View className="mb-4">
      {label ? <Label className="mb-1.5">{label}</Label> : null}
      <View className={`flex-row items-center rounded-lg border bg-surface ${borderClass}`}>
        {icon ? (
          <Ionicons name={icon} size={18} color={colors.outline} style={{ marginLeft: 14 }} />
        ) : null}
        <TextInput
          placeholderTextColor={colors.outline}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[{ fontFamily: fonts.sans }, style]}
          className={`flex-1 px-4 py-3.5 text-base text-ink ${icon ? "pl-2.5" : ""} ${rightIcon ? "pr-2.5" : ""} ${className ?? ""}`}
          {...props}
        />
        {rightIcon ? (
          <Pressable onPress={onRightIconPress} hitSlop={8} className="active:opacity-60" style={{ paddingHorizontal: 14 }}>
            <Ionicons name={rightIcon} size={18} color={colors.outline} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Muted className="mt-1 text-danger">{error}</Muted> : null}
    </View>
  );
}

// Fila con interruptor: etiqueta + explicación a la izquierda, Switch a la
// derecha. Tocar el texto también alterna (área de toque grande).
export function SwitchField({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      className={`mb-4 flex-row items-center gap-3 ${disabled ? "opacity-50" : "active:opacity-70"}`}
    >
      <View className="flex-1">
        <Text style={{ fontFamily: fonts.sansSemibold }} className="text-[15px] text-ink">
          {label}
        </Text>
        {description ? <Muted className="mt-0.5">{description}</Muted> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.outlineVariant, true: colors.primaryContainer }}
        // iOS pinta el thumb blanco solo; en Android hay que decirlo.
        thumbColor={Platform.OS === "android" ? (value ? colors.tertiaryContainer : colors.surfaceContainerLowest) : undefined}
        ios_backgroundColor={colors.outlineVariant}
      />
    </Pressable>
  );
}

/* ============================ Skeletons ============================ */

// Bloque gris que late mientras se resuelve una consulta. La animación corre en
// el hilo de UI (Reanimated), así el pulso no se traba mientras el JS trabaja.
// Todos los bloques montados a la vez arrancan en el mismo frame, así que laten
// sincronizados sin necesidad de compartir un valor animado.
export function Skeleton({
  width = "100%",
  height = 12,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulso = useSharedValue(0.55);

  useEffect(() => {
    pulso.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      -1, // sin fin
      true // ida y vuelta
    );
  }, [pulso]);

  const anim = useAnimatedStyle(() => ({ opacity: pulso.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceContainerHigh,
        },
        anim,
        style,
      ]}
    />
  );
}

// Placeholder de las tarjetas del feed, para que al llegar los datos no salte
// el layout. Son dos siluetas distintas, una por forma de tarjeta:
// `accion="boton"` copia el ancla del discipulado (chip + horario + título +
// lugar + botón); "enlace", la fila de actividad o evento (miniatura de 64 +
// tres líneas + chevron).
export function SkeletonCard({
  accion = "enlace",
  style,
}: {
  accion?: "enlace" | "boton";
  style?: StyleProp<ViewStyle>;
}) {
  if (accion === "boton") {
    return (
      <Card style={style}>
        <Skeleton width={104} height={22} radius={6} />
        <Skeleton width={128} height={14} style={{ marginTop: 14 }} />
        <Skeleton width="80%" height={26} style={{ marginTop: 6 }} />
        <Skeleton width="55%" height={16} style={{ marginTop: 6 }} />
        <Skeleton width={126} height={48} radius={16} style={{ marginTop: 18 }} />
      </Card>
    );
  }
  return (
    <Card className="flex-row items-center gap-3" style={[{ padding: 12 }, style]}>
      {/* Miniatura (donde va el flyer o el ícono sobre navy) */}
      <Skeleton width={64} height={64} radius={12} />
      <View className="flex-1 gap-2">
        <Skeleton width="45%" height={12} />
        <Skeleton width="80%" height={18} />
        <Skeleton width="55%" height={12} />
      </View>
    </Card>
  );
}

// Placeholder de una fila-tarjeta (cumpleaños, directorio): avatar + dos
// líneas + un accesorio a la derecha (chip o botones de contacto).
export function SkeletonRow({ accesorio = 64 }: { accesorio?: number }) {
  return (
    <Card className="flex-row items-center gap-3 py-3.5">
      <Skeleton width={40} height={40} radius={20} />
      <View className="flex-1">
        <Skeleton width="60%" height={13} />
        <Skeleton width="38%" height={11} style={{ marginTop: 8 }} />
      </View>
      <Skeleton width={accesorio} height={22} radius={8} />
    </Card>
  );
}

// Varias filas apiladas, con el mismo espaciado que las listas reales.
export function SkeletonRows({ count = 3, accesorio }: { count?: number; accesorio?: number }) {
  return (
    <View className="gap-2.5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} accesorio={accesorio} />
      ))}
    </View>
  );
}

/* ============================ Avatar ============================ */

export function Avatar({ name, size = 40, tone = "navy" }: { name?: string | null; size?: number; tone?: "navy" | "gold" }) {
  const bg = tone === "gold" ? "bg-gold-container" : "bg-navy-container";
  const fg = tone === "gold" ? "text-gold-on" : "text-white";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }} className={`items-center justify-center ${bg}`}>
      <Text style={{ fontFamily: fonts.serifSemibold, fontSize: size * 0.42 }} className={fg}>
        {(name ?? "?").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
